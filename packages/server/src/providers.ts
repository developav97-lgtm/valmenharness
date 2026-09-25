/**
 * Lectura y escritura del archivo de credenciales.
 *
 * Este archivo contiene secretos en claro, así que impone tres reglas que no se
 * negocian:
 *
 * 1. **El valor de una clave nunca sale de este módulo.** `listProviders`
 *    devuelve si está configurada y cuánto mide; nunca la clave. Una pantalla
 *    que puede mostrar una clave es una pantalla que puede filtrarla.
 * 2. **Se escribe con permisos 600 y de forma atómica.** Un archivo a medias es
 *    un archivo que el harness no puede leer, y un archivo legible por otros es
 *    un secreto expuesto.
 * 3. **Nunca se registra.** Ni en un mensaje de error, ni en un log, ni en la
 *    salida de la API.
 *
 * Ver docs/06-CONTROL-APP.md §2.6bis.
 */
import { chmodSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

import { yamlBlockOf, yamlFieldOf } from "@valmen/core";
import {
  type Protocol,
  anthropicAuthHeaders,
  hayCredencialDeClaudeCode,
  readClaudeCodeCredential,
  readCodexCredential,
} from "@valmen/credentials";

/** Cómo se autentica un proveedor. */
export type AuthKind = "api-key" | "subscription" | "none";

/** Un proveedor conocido por el harness. */
export interface ProviderSpec {
  readonly id: string;
  readonly name: string;
  readonly auth: AuthKind;
  /**
   * Cómo comprobar que una credencial sirve.
   *
   * Se prueba contra un endpoint real y no con un `ping`: una clave mal pegada
   * tiene que fallar en la pantalla, no en la mitad de un gate.
   *
   * Hay proveedores cuyo listado de modelos es **público**: responde 200 con
   * cualquier clave, incluida una inventada. Probar contra ese endpoint diría
   * «todo bien» con una clave mal pegada, que es justo lo que la prueba existe
   * para evitar. Para esos, la prueba es una petición mínima al endpoint que sí
   * exige credencial: una clave mala da 401 y no cuesta nada, y una buena cuesta
   * una fracción de céntimo.
   */
  readonly probe?: {
    readonly url: string;
    readonly expect: number;
    readonly method?: "GET" | "POST";
    readonly body?: unknown;
    /**
     * Cabeceras que el proveedor exige además de la credencial.
     *
     * opencode Go pide un identificador de sesión estable para poder enrutar y
     * cachear, y avisa de que los clientes que no lo mandan son problemáticos.
     * El transporte lo declara por su lado (`@valmen/credentials`); aquí se
     * declara otra vez porque la prueba es un llamador distinto y no comparte
     * esa ruta.
     */
    readonly headers?: Readonly<Record<string, string>>;
  };
  /**
   * De dónde se puede pedir la lista de modelos, si el proveedor la publica.
   *
   * No todos la tienen, y no es un defecto: los que no la declaran se eligen
   * escribiendo el identificador. Inventar una URL para ellos daría un selector
   * que falla al abrirse, que es peor que no ofrecerlo.
   */
  readonly modelsUrl?: string;
  /**
   * Qué credencial usa, cuando no es una clave del archivo del harness.
   *
   * `codex` guarda tokens OAuth en el suyo, con una cabecera de cuenta que hay que
   * mandar. Se declara por nombre para que quien resuelva la credencial sepa que
   * este proveedor no se lee como los demás.
   */
  readonly credential?: "codex" | "claude-code";
  /**
   * El dialecto del proveedor, cuando no es el de chat.
   *
   * Se declara aquí y no se deduce del modelo porque el prefijo engaña: un
   * `gpt-*` de OpenRouter habla `openai-chat` y el mismo `gpt-*` de codex habla
   * `openai-responses`.
   */
  readonly protocol?: Protocol;
  /** Dónde vive el token, para los proveedores de suscripción. */
  readonly tokenSource?: string;
  /**
   * Los identificadores que se conocen de este proveedor.
   *
   * Existen para los que **no publican catálogo**: sin esto, el selector queda
   * vacío y hay que escribir el identificador a mano, que en un modelo de nombre
   * largo es una fuente de errores. Entran como candidatos, no como verdad: el
   * usuario puede escribir otro y el proveedor decide si lo acepta.
   */
  readonly knownModels?: readonly string[];
  /** Nombre de la variable de entorno que también se acepta. */
  readonly envVar: string;
}

/**
 * Catálogo de proveedores.
 *
 * Los de suscripción se leen del CLI que ya los autenticó y **no se pegan a
 * mano**: el harness lee el token y nunca lo reescribe, para no pelearse por el
 * mismo refresh token con la herramienta dueña.
 */
/** Una entrada del catálogo: lo que se declara más lo que se deriva. */
export interface ProviderEntry extends ProviderSpec {
  readonly probeable: boolean;
  readonly probeHost: string | null;
  /** `true` si el proveedor publica su lista de modelos. */
  readonly listable: boolean;
  /**
   * `true` si se puede comprobar un modelo concreto contra el proveedor.
   *
   * Hace falta un endpoint al que pedirle una respuesta mínima. Todos los
   * declarados lo tienen, así que hoy es `true` en todos; el campo existe porque
   * la interfaz **no debe ofrecer** el botón donde no pueda funcionar, y eso hay
   * que poder decirlo sin cambiarla.
   *
   * Nació de una suposición equivocada: se creyó que `codex` no tenía endpoint
   * —«su token no sirve contra la API de OpenAI»— y se comprobó que sí lo tiene,
   * en `chatgpt.com/backend-api/codex`. La consecuencia era un botón ausente en el
   * único proveedor cuyos identificadores el usuario escribe a mano.
   */
  readonly testable: boolean;
}

/** El catálogo tal como se declara: sin lo que se puede derivar de él. */
const CATALOGO: readonly ProviderSpec[] = [
  {
    id: "openrouter",
    modelsUrl: "https://openrouter.ai/api/v1/models",
    name: "OpenRouter",
    auth: "api-key",
    envVar: "OPENROUTER_API_KEY",
    probe: { url: "https://openrouter.ai/api/v1/key", expect: 200 },
  },
  {
    id: "deepseek",
    modelsUrl: "https://api.deepseek.com/v1/models",
    name: "DeepSeek",
    auth: "api-key",
    envVar: "DEEPSEEK_API_KEY",
    probe: { url: "https://api.deepseek.com/v1/models", expect: 200 },
  },
  {
    id: "moonshot",
    modelsUrl: "https://api.moonshot.cn/v1/models",
    name: "Moonshot (Kimi)",
    auth: "api-key",
    envVar: "MOONSHOT_API_KEY",
    probe: { url: "https://api.moonshot.cn/v1/models", expect: 200 },
  },
  {
    id: "zhipu",
    modelsUrl: "https://open.bigmodel.cn/api/paas/v4/models",
    name: "Zhipu (GLM)",
    auth: "api-key",
    envVar: "ZHIPU_API_KEY",
    probe: { url: "https://open.bigmodel.cn/api/paas/v4/models", expect: 200 },
  },
  {
    id: "qwen",
    modelsUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1/models",
    name: "Qwen (Alibaba)",
    auth: "api-key",
    envVar: "QWEN_API_KEY",
    probe: {
      url: "https://dashscope.aliyuncs.com/compatible-mode/v1/models",
      expect: 200,
    },
  },
  {
    // La API de Anthropic con una clave. Es el camino de quien no tiene
    // suscripción de Claude Code, y el que se factura por token.
    id: "anthropic",
    modelsUrl: "https://api.anthropic.com/v1/models",
    name: "Anthropic (clave de API)",
    auth: "api-key",
    envVar: "ANTHROPIC_API_KEY",
    protocol: "anthropic-messages",
    probe: {
      url: "https://api.anthropic.com/v1/models",
      expect: 200,
      headers: { "anthropic-version": "2023-06-01" },
    },
  },
  {
    // La suscripción de Claude Code: sin factura por token, con el plan que la
    // persona ya paga. Su token **no** vive en un archivo en macOS —está en el
    // llavero—, así que el estado no se decide leyendo `tokenSource`: se le
    // pregunta al lector, que sabe dónde buscarlo en cada sistema.
    id: "claude-code",
    name: "Claude Code (suscripción)",
    auth: "subscription",
    credential: "claude-code",
    envVar: "ANTHROPIC_API_KEY",
    tokenSource: "~/.claude/.credentials.json",
    protocol: "anthropic-messages",
    // No publica catálogo con un token de sesión, así que los identificadores se
    // declaran. Son los vigentes de su CLI, y se pueden escribir otros.
    knownModels: [
      "claude-sonnet-5",
      "claude-opus-4-8",
      "claude-fable-5",
      "claude-haiku-4-5-20251001",
    ],
    probe: {
      url: "https://api.anthropic.com/v1/messages",
      expect: 200,
      method: "POST",
      // El cuerpo se completa en la prueba con el modelo que se quiera comprobar;
      // `max_tokens` es obligatorio en este dialecto.
      body: { max_tokens: 1, messages: [{ role: "user", content: "ok" }] },
      headers: { "anthropic-version": "2023-06-01", "anthropic-beta": "oauth-2025-04-20" },
    },
  },
  {
    // Codex es una suscripción de ChatGPT, y **sí tiene API**: su catálogo está en
    // `chatgpt.com/backend-api/codex/models` y su endpoint de respuestas en
    // `/responses`. Se creía que su token no servía contra la API de OpenAI, y era
    // una suposición: se comprobó con el token real que los dos responden 200.
    //
    // Habla `openai-responses`, no `openai-chat`, así que su prueba y su llamada
    // van por `/responses` con streaming obligatorio.
    id: "codex",
    name: "Codex (suscripción)",
    auth: "subscription",
    envVar: "OPENAI_API_KEY",
    tokenSource: "~/.codex/auth.json",
    credential: "codex",
    modelsUrl: "https://chatgpt.com/backend-api/codex/models?client_version=1.0.0",
    protocol: "openai-responses",
    probe: {
      url: "https://chatgpt.com/backend-api/codex/responses",
      expect: 200,
      method: "POST",
      // El dialecto exige streaming; el cuerpo se completa en la prueba con el
      // modelo que se quiera comprobar.
      body: { stream: true, store: false, instructions: "ok" },
      headers: { originator: "codex_cli_rs" },
    },
  },
  {
    // Go y Zen son **dos productos distintos** de opencode, con bases de URL
    // distintas y catálogos distintos. Confundirlos daba un proveedor que
    // parecía configurado y no servía para lo que el usuario tenía.
    //
    // Go: suscripción de 10 $/mes, modelos abiertos de código, 38 modelos, sin
    // Jev. La clave se saca de opencode.ai/auth igual que la de Zen.
    id: "opencode-go",
    // Publica su catálogo en `/models`, y es **público**: responde 200
    // sin credencial. Se declaró como no disponible por suposición, y era
    // falso: los modelos quedaban sin desplegable y había que escribirlos.
    modelsUrl: "https://opencode.ai/zen/go/v1/models",
    name: "opencode Go (suscripción)",
    auth: "api-key",
    envVar: "OPENCODE_GO_API_KEY",
    probe: {
      url: "https://opencode.ai/zen/go/v1/chat/completions",
      expect: 200,
      method: "POST",
      headers: { "x-opencode-session": "valmenharness" },
      body: {
        model: "glm-5.3-flash",
        // No se pide un token: algunos proveedores rechazan `max_tokens: 1` por
        // debajo de su mínimo, y entonces la prueba falla por una razón que no
        // tiene nada que ver con la clave.
        max_tokens: 16,
        messages: [{ role: "user", content: "ok" }],
      },
    },
    tokenSource: "~/.local/share/opencode/auth.json",
  },
  {
    // Zen: pasarela por consumo, 75 modelos, y **sí incluye Jev** en
    // `/zen/v1/systemone`, que es lo que evalúa los gates de este harness.
    id: "opencode-zen",
    // Publica su catálogo en `/models`, y es **público**: responde 200
    // sin credencial. Se declaró como no disponible por suposición, y era
    // falso: los modelos quedaban sin desplegable y había que escribirlos.
    modelsUrl: "https://opencode.ai/zen/v1/models",
    name: "opencode Zen (consumo)",
    auth: "api-key",
    envVar: "OPENCODE_ZEN_API_KEY",
    probe: {
      url: "https://opencode.ai/zen/v1/chat/completions",
      expect: 200,
      method: "POST",
      // La misma cabecera que Go: es la misma pasarela y el mismo requisito.
      headers: { "x-opencode-session": "valmenharness" },
      body: {
        model: "deepseek-v4-flash",
        max_tokens: 16,
        messages: [{ role: "user", content: "ok" }],
      },
    },
    // **Sin** `tokenSource`. Lo tenía, heredado de Go, y era una suposición:
    // iniciar sesión en el CLI de opencode es una credencial de Go, no de Zen.
    // Zen se configura con su clave o no se configura, y darlo por detectado
    // hacía que la pantalla dijera que estaba listo cuando no lo estaba.
  },
  {
    id: "ollama",
    modelsUrl: "http://127.0.0.1:11434/v1/models",
    name: "Ollama (local)",
    auth: "none",
    envVar: "OLLAMA_HOST",
    probe: { url: "http://127.0.0.1:11434/api/tags", expect: 200 },
  },
];

/** Estado de un proveedor, tal como lo ve la interfaz. */
export interface ProviderStatus {
  readonly id: string;
  readonly name: string;
  readonly auth: AuthKind;
  readonly envVar: string;
  /** `true` si hay una clave resoluble. */
  readonly configured: boolean;
  /** De dónde salió la credencial. Nunca el valor. */
  readonly source: "environment" | "credentials-file" | "cli" | "none";
  /** Longitud de la clave, para que el usuario note si pegó algo truncado. */
  readonly keyLength: number | null;
  /** El campo del archivo tiene el nombre anterior. Se informa, no se corrige. */
  readonly legacyFieldName: boolean;
  readonly tokenSource?: string;
  /**
   * `true` si el proveedor declara un endpoint contra el que probar la clave.
   *
   * Un proveedor de suscripción no lo tiene: su credencial es el token que ya
   * vive en el CLI, y no hay URL a la que preguntar. Ofrecer un botón que
   * siempre falla es peor que no ofrecerlo, porque parece un error del usuario.
   */
  readonly probeable: boolean;
  /** El host contra el que se va a tocar al probar, para poder decirlo. */
  readonly probeHost: string | null;
  /**
   * El dialecto con el que habla, cuando no es el de chat.
   *
   * Se publica para que un diagnóstico pueda decir por dónde va a salir la
   * petición: es lo primero que hay que saber cuando un modelo «no responde».
   */
  readonly protocol?: Protocol;
  /** Los identificadores conocidos, para los proveedores sin catálogo público. */
  readonly knownModels?: readonly string[];
  /** `true` si publica su catálogo de modelos en una URL. */
  readonly listable: boolean;
  /** `true` si se puede comprobar un modelo concreto contra el proveedor. */
  readonly testable: boolean;
}

/** Ruta del archivo de credenciales. */
export function credentialsPath(home: string = homedir()): string {
  return join(home, ".valmen", ".credentials.yaml");
}

/** Lee el archivo, o cadena vacía si no existe. */
function readCredentialsFile(path: string): string {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return "";
  }
}

/**
 * Lee la clave de un proveedor desde el archivo.
 *
 * Acepta los dos nombres de campo: `api-key` es el correcto, pero una versión
 * anterior de la plantilla se llamaba `api-key-env` y hay archivos en uso con
 * ese nombre y el valor literal dentro.
 */
function readKeyFromFile(
  text: string,
  id: string,
): { value: string; legacyField: boolean } | null {
  // El bloque se busca con el lector compartido de `core`, que fija la
  // indentación: con una expresión regular y el ancla `^[ \t]*`, buscar
  // `opencode-go` encontraba el bloque de `opencode` —la `o` final encajaba como
  // un `[ \t]*` vacío y `-go:` como el resto del nombre—, así que la pantalla
  // mostraba el estado de otro proveedor.
  const block = yamlBlockOf(text, id);
  if (block === null) return null;

  // `api-key-env` es el nombre de una plantilla anterior, con el valor literal
  // dentro. Se acepta para no romper una configuración válida por nomenclatura.
  const moderno = yamlFieldOf(block, "api-key");
  if (moderno !== null) return { value: moderno, legacyField: false };

  const anterior = yamlFieldOf(block, "api-key-env");
  if (anterior !== null) return { value: anterior, legacyField: true };

  return null;
}

/**
 * El catálogo, con lo que se deriva de cada declaración.
 *
 * Se calcula una vez en lugar de repetirlo en cada entrada: `probeable` y
 * `probeHost` son propiedades del endpoint declarado, no datos que alguien tenga
 * que acordarse de mantener en sincronía.
 */
export const PROVIDERS: readonly ProviderEntry[] = CATALOGO.map((spec) => ({
  ...spec,
  probeable: spec.probe !== undefined,
  probeHost: spec.probe === undefined ? null : new URL(spec.probe.url).host,
  listable: spec.modelsUrl !== undefined,
  testable: spec.probe?.method === "POST",
}));

/**
 * Estado de todos los proveedores.
 *
 * Devuelve el estado, **nunca el valor**. La longitud se incluye a propósito:
 * permite que el usuario note que pegó una cadena truncada sin que la interfaz
 * tenga que conocer la clave.
 */
export function listProviders(
  filePath: string = credentialsPath(),
  env: NodeJS.ProcessEnv = process.env,
): ProviderStatus[] {
  const text = readCredentialsFile(filePath);

  // Los que se pueden usar primero. La pantalla es una lista de acción: lo que
  // está sin configurar es lo que hay que hacer, y enterrarlo bajo ocho filas
  // verdes obliga a buscarlo.
  return PROVIDERS.map((spec): ProviderStatus => {
    const desdeEntorno = env[spec.envVar];
    const enEntorno = typeof desdeEntorno === "string" && desdeEntorno.trim() !== "";
    const enArchivo = readKeyFromFile(text, spec.id);

    if (enEntorno) {
      return {
        ...spec,
        configured: true,
        source: "environment",
        keyLength: (desdeEntorno as string).trim().length,
        legacyFieldName: false,
      };
    }

    if (enArchivo !== null) {
      return {
        ...spec,
        configured: true,
        source: "credentials-file",
        keyLength: enArchivo.value.length,
        legacyFieldName: enArchivo.legacyField,
      };
    }

    if (spec.tokenSource !== undefined) {
      const expandido = spec.tokenSource.replace(/^~/, homedir());
      let existe = false;
      try {
        existe = readFileSync(expandido, "utf8").length > 0;
      } catch {
        existe = false;
      }
      // Claude Code guarda su sesión en el llavero en macOS: preguntarle al lector
      // es lo único que dice la verdad en los dos sistemas.
      if (!existe && spec.credential === "claude-code") {
        existe = hayCredencialDeClaudeCode();
      }
      return {
        ...spec,
        configured: existe,
        source: existe ? "cli" : "none",
        keyLength: null,
        legacyFieldName: false,
      };
    }

    /**
     * Un proveedor local sin credencial está disponible por definición.
     *
     * Su estado no es «configurado»: nadie lo configuró. Es «local», y lo que
     * importa —si está corriendo— lo dice la prueba de conexión.
     */
    if (spec.auth === "none") {
      // Un proveedor local sin credencial está disponible por definición: que
      // esté corriendo o no lo dice la prueba de conexión.
      return {
        ...spec,
        configured: true,
        source: "none",
        keyLength: null,
        legacyFieldName: false,
      };
    }

    return {
      ...spec,
      configured: false,
      source: "none",
      keyLength: null,
      legacyFieldName: false,
    };
  }).sort((a, b) => {
    // Utilizables primero: lo que falta es lo que hay que hacer.
    if (a.configured !== b.configured) return a.configured ? -1 : 1;

    // Y dentro de cada grupo, por forma de autenticación: primero lo que se
    // configura pegando una clave, después lo que depende de una sesión del CLI,
    // y al final lo que no necesita credencial. No es alfabético: es el orden en
    // que un usuario puede hacer algo con cada uno.
    const orden: Record<AuthKind, number> = {
      "api-key": 0,
      subscription: 1,
      none: 2,
    };
    return orden[a.auth] - orden[b.auth];
  });
}

/** Cambios que se aplican al archivo de credenciales. */
export interface CredentialUpdate {
  readonly provider: string;
  /** Clave nueva. Cadena vacía borra la entrada. */
  readonly apiKey: string;
}

/**
 * Aplica cambios al archivo de credenciales.
 *
 * Reescribe el archivo completo preservando los comentarios y el orden, porque
 * el archivo lo mantiene una persona y perder sus comentarios sería perder su
 * documentación.
 *
 * Escribe en un temporal del mismo directorio y renombra: un archivo a medias
 * es un archivo que el harness no puede leer, y con secretos dentro.
 */
export function updateCredentials(
  updates: readonly CredentialUpdate[],
  filePath: string = credentialsPath(),
): { readonly written: readonly string[]; readonly path: string } {
  const existente = readCredentialsFile(filePath);
  let texto = existente === "" ? esqueleto() : existente;
  const escritos: string[] = [];

  for (const update of updates) {
    const spec = PROVIDERS.find((provider) => provider.id === update.provider);
    if (spec === undefined) {
      throw new Error(`Proveedor desconocido: "${update.provider}".`);
    }
    if (spec.auth === "subscription") {
      // Un token de suscripción se lee del CLI. Pegarlo a mano crearía un
      // segundo origen de verdad que se desincroniza en el primer refresh.
      throw new Error(
        `"${spec.name}" se autentica con su suscripción: el harness lee el token ` +
          `del CLI (${spec.tokenSource}). No se pega a mano.`,
      );
    }

    texto = upsertKey(texto, update.provider, update.apiKey);
    escritos.push(update.provider);
  }

  mkdirSync(dirname(filePath), { recursive: true });
  const temporal = `${filePath}.${process.pid}.tmp`;
  // El temporal se crea ya con permisos 600: crearlo abierto y cerrarlo después
  // deja una ventana en la que el secreto es legible por otros.
  writeFileSync(temporal, texto, { encoding: "utf8", mode: 0o600 });
  chmodSync(temporal, 0o600);
  renameSync(temporal, filePath);
  chmodSync(filePath, 0o600);

  return { written: escritos, path: filePath };
}

/** Esqueleto del archivo, para cuando no existe. */
function esqueleto(): string {
  return [
    "# Credenciales de ValmenHarness.",
    "#",
    "# Este archivo contiene secretos en claro. Permisos 600, nunca se versiona.",
    "# Lo mantiene la app (`valmen serve` → Configuración → Proveedores).",
    "",
    "version: 1",
    "",
    "providers:",
    "",
  ].join("\n");
}

/**
 * Pone o reemplaza la clave de un proveedor dentro del texto.
 *
 * Se trabaja sobre líneas en vez de con un parser de YAML completo: el archivo
 * contiene secretos y no debe pasar por estructuras que puedan acabar en un
 * mensaje de error. Además, reescribirlo con un parser perdería los
 * comentarios.
 */
function upsertKey(text: string, provider: string, apiKey: string): string {
  const lineas = text.split("\n");
  const valor = apiKey.trim();

  // Localiza el bloque del proveedor.
  let inicio = -1;
  for (let i = 0; i < lineas.length; i += 1) {
    if (new RegExp(`^[ \\t]*${provider}:[ \\t]*$`).test(lineas[i] as string)) {
      inicio = i;
      break;
    }
  }

  if (inicio === -1) {
    // El proveedor no está declarado: se añade al final, indentado.
    if (valor !== "") {
      lineas.push(`  ${provider}:`, `    api-key: "${valor}"`);
    }
    return lineas.join("\n");
  }

  // Encuentra el fin del bloque: la primera línea con indentación menor o igual.
  const indentacion =
    (lineas[inicio] as string).length - (lineas[inicio] as string).trimStart().length;
  let fin = inicio + 1;
  while (fin < lineas.length) {
    const linea = lineas[fin] as string;
    if (linea.trim() === "") break;
    const suya = linea.length - linea.trimStart().length;
    if (suya <= indentacion) break;
    fin += 1;
  }

  // Localiza el campo de clave **sin modificar el arreglo todavía**.
  //
  // Buscarlo y borrarlo en el mismo recorrido introduce un error sutil: al
  // quitar una línea, las siguientes se desplazan y el índice deja de ser
  // válido para el resto del bloque. Se localiza primero y se modifica después.
  let indiceClave = -1;
  for (let i = inicio + 1; i < fin; i += 1) {
    if (/^[ \t]+api-key(?:-env)?:/.test(lineas[i] as string)) {
      indiceClave = i;
      break;
    }
  }

  if (valor === "") {
    // Borrar: se quita la línea del campo y, si el bloque queda vacío, también
    // su cabecera. Dejar una cabecera sin contenido ensuciaría el archivo.
    if (indiceClave !== -1) lineas.splice(indiceClave, 1);
    const bloqueVacio = lineas
      .slice(inicio + 1, fin - (indiceClave === -1 ? 0 : 1))
      .every((linea) => (linea as string).trim() === "");
    if (bloqueVacio) {
      const cabecera = lineas[inicio] as string;
      const indentacionCabecera = cabecera.length - cabecera.trimStart().length;
      if (indentacionCabecera > 0) lineas.splice(inicio, 1);
    }
    return lineas.join("\n");
  }

  if (indiceClave === -1) {
    lineas.splice(inicio + 1, 0, `    api-key: "${valor}"`);
  } else {
    // Se normaliza al nombre correcto: el valor se está escribiendo ahora, así
    // que no hay razón para conservar el nombre anterior.
    lineas[indiceClave] = `    api-key: "${valor}"`;
  }

  return lineas.join("\n");
}

/**
 * Prueba la conectividad de un proveedor.
 *
 * Usa la credencial resuelta para hacer una llamada real. Una clave mal pegada
 * tiene que fallar **aquí**, en la pantalla, y no en la mitad de un gate.
 */
export async function probeProvider(
  id: string,
  options: {
    readonly filePath?: string;
    readonly env?: NodeJS.ProcessEnv;
    readonly fetchImpl?: typeof fetch;
    readonly timeoutMs?: number;
    /**
     * La clave a probar, cuando todavía no está guardada.
     *
     * Se pasa **como valor** y no como variable de entorno. Antes se fingía una
     * variable inventando su nombre en un mapa aparte, y ese mapa se
     * desincronizó del catálogo en cuanto opencode se separó en Go y Zen: la
     * clave no llegaba a la petición, el proveedor respondía 401 y el mensaje
     * culpaba a la credencial del usuario. Una clave que se va a probar no
     * necesita parecer una variable de entorno.
     */
    readonly apiKey?: string;
  } = {},
): Promise<{
  readonly ok: boolean;
  readonly status: number | null;
  readonly detail: string;
  readonly latencyMs: number;
}> {
  const spec = PROVIDERS.find((provider) => provider.id === id);
  if (spec === undefined) {
    return {
      ok: false,
      status: null,
      detail: `Proveedor desconocido: "${id}".`,
      latencyMs: 0,
    };
  }
  if (spec.probe === undefined) {
    return {
      ok: false,
      status: null,
      detail: `"${spec.name}" no declara un endpoint de prueba.`,
      latencyMs: 0,
    };
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const inicio = Date.now();

  // La credencial se resuelve sin exponerla: se pasa como cabecera y nada más.
  // Si viene una para probar, gana: es la que el usuario acaba de pegar.
  const clave =
    options.apiKey ??
    resolveForProbe(
      spec,
      options.filePath ?? credentialsPath(),
      options.env ?? process.env,
    );

  // Sin credencial de un proveedor que la lee de su CLI, la petición saldría sin
  // cabecera y el proveedor contestaría algo que habla de otra cosa —`x-api-key
  // header is required`—. El lector sí sabe qué pasa: archivo, llavero, token
  // caducado. Con una clave recién pegada no se pregunta: esa se prueba.
  if ((clave === null || clave === "") && options.apiKey === undefined) {
    const motivo = motivoSinCredencial(spec);
    if (motivo !== null) {
      return { ok: false, status: null, detail: motivo, latencyMs: 0 };
    }
  }

  const headers = headersFor(spec, clave);
  if (spec.probe.body !== undefined) headers["Content-Type"] = "application/json";

  try {
    const respuesta = await fetchImpl(spec.probe.url, {
      method: spec.probe.method ?? "GET",
      headers,
      ...(spec.probe.body === undefined ? {} : { body: JSON.stringify(spec.probe.body) }),
      signal: AbortSignal.timeout(options.timeoutMs ?? 15_000),
    });
    const latencia = Date.now() - inicio;
    const ok = respuesta.status === spec.probe.expect;

    // Lo que dijo el proveedor, recortado. Parafrasearlo fue un error repetido:
    // «la credencial no es válida o no tiene permisos» tapaba la diferencia
    // entre una clave mala, un modelo que la cuenta no incluye y una cabecera
    // que falta — tres cosas que se arreglan distinto.
    let cuerpo = "";
    try {
      cuerpo = (await respuesta.text()).slice(0, 200).replace(/\s+/g, " ").trim();
    } catch {
      cuerpo = "";
    }
    // La credencial se tacha antes de mostrar nada. Un proveedor puede
    // devolverla reflejada en su error —algunos lo hacen—, y el detalle viaja a
    // la pantalla y al registro. Mostrar el mensaje del proveedor no puede
    // costar la clave del usuario.
    if (clave !== null && clave !== "") {
      cuerpo = cuerpo.split(clave).join("***");
    }

    // Nunca se devuelve la respuesta entera sin recortar: podría contener la
    // clave reflejada por un proveedor mal implementado.
    return {
      ok,
      status: respuesta.status,
      detail: ok
        ? `Conexión verificada (HTTP ${respuesta.status}).`
        : // Con el cuerpo del proveedor delante, la interpretación sobra: se
          // añade solo cuando no dijo nada.
          `El proveedor respondió HTTP ${respuesta.status}` +
          (cuerpo !== ""
            ? `: ${cuerpo}`
            : respuesta.status === 401 || respuesta.status === 403
              ? ": la credencial no es válida o no tiene permisos."
              : "."),
      latencyMs: latencia,
    };
  } catch (caught) {
    const detalle = caught instanceof Error ? caught.message : String(caught);
    const esTimeout = /abort|timeout/i.test(detalle);
    return {
      ok: false,
      status: null,
      detail: esTimeout
        ? `Sin respuesta en ${options.timeoutMs ?? 15_000} ms.`
        : `No se pudo conectar: ${detalle}`,
      latencyMs: Date.now() - inicio,
    };
  }
}

/**
 * Por qué no hay credencial de un proveedor de CLI.
 *
 * Sin esto, una sesión ausente se probaba igual y el proveedor contestaba
 * `x-api-key header is required`: un mensaje que habla de una cabecera y manda a
 * buscar el problema al sitio equivocado. El lector sí sabe qué pasa —archivo,
 * llavero, token caducado— y esto lo trae.
 */
function motivoSinCredencial(spec: ProviderSpec): string | null {
  if (spec.credential === undefined) return null;
  try {
    if (spec.credential === "claude-code") readClaudeCodeCredential();
    else readCodexCredential();
    return null;
  } catch (caught) {
    return caught instanceof Error ? caught.message : String(caught);
  }
}

/** Resuelve la clave de un proveedor para una prueba, o `null` si no aplica. */
function resolveForProbe(
  spec: ProviderSpec,
  filePath: string,
  env: NodeJS.ProcessEnv,
): string | null {
  // Codex no lee una clave del archivo del harness: lee tokens OAuth del suyo, que
  // caducan y que su CLI refresca. Por eso se leen **en cada llamada**.
  if (spec.credential === "codex") {
    try {
      return readCodexCredential().accessToken;
    } catch {
      // Un error de credencial no se convierte en una excepción aquí: quien llama
      // decide qué hacer sin ella, y el archivo de codex puede no existir en una
      // máquina que nunca lo usó.
      return null;
    }
  }

  if (spec.credential === "claude-code") {
    try {
      // El lector sabe que en macOS el token está en el llavero: mirar solo
      // `tokenSource` diría «no configurado» con la sesión viva.
      return readClaudeCodeCredential().accessToken;
    } catch {
      return null;
    }
  }

  const desdeEntorno = env[spec.envVar];
  if (typeof desdeEntorno === "string" && desdeEntorno.trim() !== "") {
    return desdeEntorno.trim();
  }
  const enArchivo = readKeyFromFile(readCredentialsFile(filePath), spec.id);
  return enArchivo?.value ?? null;
}

/**
 * Las cabeceras con las que se habla a un proveedor.
 *
 * Además de la credencial, algunos exigen cabeceras propias, y una de ellas no se
 * puede declarar en el catálogo: el `chatgpt-account-id` de codex viaja **dentro**
 * del token, así que se saca de él en cada llamada.
 */
function headersFor(spec: ProviderSpec, clave: string | null): Record<string, string> {
  const headers: Record<string, string> = {};

  // En el dialecto de Anthropic la cabecera **depende de qué sea el valor**: una
  // clave va en `x-api-key` y un token de sesión en `Authorization` con su
  // `anthropic-beta`. Mandar una donde va la otra responde `invalid x-api-key`,
  // que no dice nada del problema.
  if (spec.protocol === "anthropic-messages") {
    Object.assign(headers, anthropicAuthHeaders(clave ?? ""));
  } else if (clave !== null && clave !== "") {
    headers["Authorization"] = `Bearer ${clave}`;
  }

  if (spec.credential === "codex") {
    try {
      const { accountId } = readCodexCredential();
      if (accountId !== "") headers["chatgpt-account-id"] = accountId;
    } catch {
      // Sin cuenta, la petición fallará con el error del proveedor, que es más
      // informativo que uno inventado aquí.
    }
  }

  for (const [nombre, valor] of Object.entries(spec.probe?.headers ?? {})) {
    headers[nombre] = valor;
  }
  return headers;
}

/** Un modelo, como lo devuelve el proveedor. */
export interface ProviderModel {
  readonly id: string;
  readonly name: string;
  /** Precio de entrada por token, si el proveedor lo publica. */
  readonly promptUsd: number | null;
}

/**
 * Pide al proveedor su lista de modelos.
 *
 * Cada proveedor la publica a su manera, así que se aceptan las dos formas que
 * existen en la práctica: la de OpenAI —`{ data: [{ id }] }`— y la de opencode
 * —`{ models: [{ id }] }`—, más una lista pelada. Lo que no se hace es inventar:
 * un proveedor sin `modelsUrl` devuelve `null` y la pantalla ofrece escribir el
 * identificador, que es lo honesto.
 *
 * El nombre se conserva cuando lo trae: `deepseek-chat` dice menos que «DeepSeek
 * Chat», y la lista se lee.
 */
export async function listProviderModels(
  id: string,
  options: {
    readonly filePath?: string;
    readonly env?: NodeJS.ProcessEnv;
    readonly fetchImpl?: typeof fetch;
    readonly timeoutMs?: number;
    /**
     * Los modelos que el proyecto declara para este proveedor.
     *
     * Entran **además** de los publicados, y no en su lugar: un proveedor sin
     * catálogo público —codex— se queda solo con estos, y uno que sí lo publica
     * gana la posibilidad de usar un modelo que su catálogo no lista pero su
     * endpoint acepta.
     */
    readonly candidates?: readonly string[];
  } = {},
): Promise<
  | {
      readonly ok: true;
      readonly models: readonly ProviderModel[];
      /** Los declarados por el proyecto que el proveedor no publica. */
      readonly configured: readonly string[];
      readonly source: "publicado" | "declarado" | "conocido" | "ambos";
    }
  | {
      readonly ok: false;
      readonly error: string;
      readonly models: readonly ProviderModel[];
    }
  | null
> {
  const spec = PROVIDERS.find((provider) => provider.id === id);
  const declarados = (options.candidates ?? [])
    .map((modelo) => modelo.trim())
    .filter((m) => m !== "");

  // Un proveedor que no está en el catálogo y uno que no publica su lista acaban
  // en el mismo sitio —no hay URL que pedir—, salvo que haya modelos que ofrecer:
  // los que el proyecto declaró y los que el catálogo conoce. Sin ninguno de los
  // dos, el selector ofrece escribir el identificador, que es lo honesto.
  if (spec === undefined || spec.modelsUrl === undefined) {
    const conocidos = spec?.knownModels ?? [];
    const todos = [...new Set([...declarados, ...conocidos])];
    if (todos.length === 0) return null;
    return {
      ok: true,
      models: todos.map((modelo) => ({ id: modelo, name: modelo, promptUsd: null })),
      configured: declarados,
      source: declarados.length > 0 ? "declarado" : "conocido",
    };
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const clave = resolveForProbe(
    spec,
    options.filePath ?? credentialsPath(),
    options.env ?? process.env,
  );

  if (clave === null || clave === "") {
    const motivo = motivoSinCredencial(spec);
    if (motivo !== null) {
      // Lo declarado se devuelve igual que en los demás fallos: que el catálogo no
      // se pueda pedir no invalida la lista que el usuario escribió.
      return {
        ok: false,
        error: motivo,
        models: declarados.map((modelo) => ({ id: modelo, name: modelo, promptUsd: null })),
      };
    }
  }

  const headers = headersFor(spec, clave);

  // La credencial **cambia la respuesta**, y conviene saberlo antes de sospechar
  // del código: medido contra opencode Go, sin credencial devuelve 40 modelos y
  // con ella 33. Los siete que desaparecen son los que la cuenta no puede usar
  // —`kimi-k2.5`, `glm-5`, `grok-4.5` y cuatro más—, y ofrecerlos daría un
  // desplegable lleno de modelos que responden «Model is unavailable». Es la
  // lista correcta: la de lo que se puede usar.
  let texto: string;
  try {
    const respuesta = await fetchImpl(spec.modelsUrl, {
      headers,
      signal: AbortSignal.timeout(options.timeoutMs ?? 15_000),
    });
    texto = await respuesta.text();
    if (!respuesta.ok) {
      // El cuerpo del proveedor, recortado y con la clave tachada: es lo que
      // distingue «la clave no sirve» de «esta cuenta no incluye modelos».
      const cuerpo = texto.slice(0, 200).replace(/\s+/g, " ").trim();
      const limpio =
        clave === null || clave === "" ? cuerpo : cuerpo.split(clave).join("***");
      return {
        ok: false,
        error: `El proveedor respondió HTTP ${respuesta.status}${limpio === "" ? "." : `: ${limpio}`}`,
        // Lo declarado se devuelve igual: que el catálogo falle no invalida la
        // lista que el usuario escribió, y sin ella el selector quedaría vacío.
        models: declarados.map((modelo) => ({ id: modelo, name: modelo, promptUsd: null })),
      };
    }
  } catch (caught) {
    const detalle = caught instanceof Error ? caught.message : String(caught);
    return {
      ok: false,
      error: /abort|timeout/i.test(detalle)
        ? `El proveedor superó el tiempo máximo de ${options.timeoutMs ?? 15_000} ms.`
        : `No se pudo consultar la lista de modelos: ${detalle}`,
      models: declarados.map((modelo) => ({ id: modelo, name: modelo, promptUsd: null })),
    };
  }

  let datos: unknown;
  try {
    datos = JSON.parse(texto) as unknown;
  } catch {
    return {
      ok: false,
      error: "La lista de modelos del proveedor no es JSON.",
      models: declarados.map((modelo) => ({ id: modelo, name: modelo, promptUsd: null })),
    };
  }

  const publicados = extraerModelos(datos);
  if (publicados === null) {
    return {
      ok: false,
      error:
        "La lista de modelos del proveedor no tiene una forma conocida: ni " +
        "`data`, ni `models`, ni una lista.",
      models: declarados.map((modelo) => ({ id: modelo, name: modelo, promptUsd: null })),
    };
  }

  // Los declarados primero: son los que el usuario eligió, y buscarlos en una
  // lista de 76 no debería costar un desplazamiento.
  const yaEstan = new Set(publicados.map((modelo) => modelo.id));
  const soloDeclarados = declarados.filter((modelo) => !yaEstan.has(modelo));
  const models = [
    ...soloDeclarados.map((modelo) => ({ id: modelo, name: modelo, promptUsd: null })),
    ...publicados,
  ];

  return {
    ok: true,
    models,
    configured: soloDeclarados,
    source: soloDeclarados.length === 0 ? "publicado" : "ambos",
  };
}

/** Saca la lista de modelos de las formas que se usan de verdad. */
function extraerModelos(datos: unknown): ProviderModel[] | null {
  const crudos = Array.isArray(datos)
    ? datos
    : typeof datos === "object" && datos !== null
      ? ((datos as { data?: unknown }).data ?? (datos as { models?: unknown }).models)
      : null;
  if (!Array.isArray(crudos)) return null;

  return crudos
    .map((crudo): ProviderModel | null => {
      if (typeof crudo === "string") return { id: crudo, name: crudo, promptUsd: null };
      if (typeof crudo !== "object" || crudo === null) return null;
      // El identificador se llama `id` en la convención de OpenAI y `slug` en el
      // catálogo de codex. Se aceptan los dos: son el mismo dato con dos nombres,
      // y exigir uno dejaría el desplegable de codex vacío sin decir por qué.
      const modelo = crudo as {
        id?: unknown;
        slug?: unknown;
        name?: unknown;
        display_name?: unknown;
        pricing?: { prompt?: unknown };
      };
      const brutoId = typeof modelo.id === "string" ? modelo.id : modelo.slug;
      const id = typeof brutoId === "string" ? brutoId : null;
      if (id === null || id === "") return null;

      // El precio llega como texto en OpenRouter y como número en otros. Se
      // acepta lo que se pueda leer y se deja en `null` lo que no: un precio
      // inventado es peor que ninguno.
      const bruto = modelo.pricing?.prompt;
      const precio =
        typeof bruto === "number"
          ? bruto
          : typeof bruto === "string" && bruto.trim() !== "" && !Number.isNaN(Number(bruto))
            ? Number(bruto)
            : null;

      // El nombre también cambia de sitio: `display_name` en codex, `name` en los
      // demás. `GPT-5.6-Terra` se lee mejor que `gpt-5.6-terra`, y la lista se lee.
      const nombre = [modelo.name, modelo.display_name].find(
        (valor): valor is string => typeof valor === "string" && valor !== "",
      );
      return { id, name: nombre ?? id, promptUsd: precio };
    })
    .filter((modelo): modelo is ProviderModel => modelo !== null)
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/**
 * Comprueba que un modelo concreto responde con la credencial configurada.
 *
 * Existe porque el identificador de un modelo es donde más fácil se escribe mal y
 * donde peor se descubre: un `gpt-5.6-terrra` con una erre de más pasa la
 * configuración, se guarda, y falla en mitad de un gate o de una descomposición
 * con un error del proveedor que no dice qué se escribió mal.
 *
 * Se prueba con una petición mínima al endpoint de chat, que es el que se va a
 * usar de verdad, y con la misma credencial. La respuesta **no se interpreta**:
 * lo que importa es si el proveedor acepta o rechaza la pareja credencial+modelo,
 * y su mensaje viaja tal cual porque es el que distingue «modelo inexistente» de
 * «sin saldo» o «sin permisos».
 *
 * Lo que cuesta: la petición pide un token, así que el gasto es del orden de una
 * milésima de céntimo. Se dice en la interfaz antes de pulsar.
 */
export async function testProviderModel(
  id: string,
  model: string,
  options: {
    readonly filePath?: string;
    readonly env?: NodeJS.ProcessEnv;
    readonly fetchImpl?: typeof fetch;
    readonly timeoutMs?: number;
  } = {},
): Promise<{
  readonly ok: boolean;
  readonly status: number | null;
  readonly detail: string;
  readonly latencyMs: number;
}> {
  const spec = PROVIDERS.find((provider) => provider.id === id);
  if (spec === undefined) {
    return {
      ok: false,
      status: null,
      detail: `Proveedor desconocido: "${id}".`,
      latencyMs: 0,
    };
  }
  if (model.trim() === "") {
    return {
      ok: false,
      status: null,
      detail: "Falta el identificador del modelo.",
      latencyMs: 0,
    };
  }
  if (spec.probe === undefined || spec.probe.method !== "POST") {
    // Sin un endpoint de chat no hay nada que probar. Se dice en vez de devolver
    // un «ok» que no comprobó nada.
    return {
      ok: false,
      status: null,
      detail: `"${spec.name}" no declara un endpoint de chat con el que probar un modelo.`,
      latencyMs: 0,
    };
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const clave = resolveForProbe(
    spec,
    options.filePath ?? credentialsPath(),
    options.env ?? process.env,
  );

  if (clave === null || clave === "") {
    const motivo = motivoSinCredencial(spec);
    if (motivo !== null) {
      return { ok: false, status: null, detail: motivo, latencyMs: 0 };
    }
  }

  const headers = headersFor(spec, clave);
  headers["Content-Type"] = "application/json";

  // El cuerpo de la prueba del proveedor, con el modelo que se quiere comprobar.
  // `max_tokens` bajo a propósito: no se quiere una respuesta, se quiere saber si
  // la acepta.
  // El cuerpo base es el de la prueba del proveedor, y el dialecto decide cómo se
  // pide: `openai-responses` no acepta `max_tokens` ni `messages`, y con `input`
  // en texto suelto responde 400.
  const base =
    typeof spec.probe.body === "object" && spec.probe.body !== null
      ? (spec.probe.body as Record<string, unknown>)
      : {};
  const cuerpo =
    spec.protocol === "openai-responses"
      ? {
          ...base,
          model,
          input: [
            {
              type: "message",
              role: "user",
              content: [{ type: "input_text", text: "ok" }],
            },
          ],
        }
      : { ...base, model, max_tokens: 16, messages: [{ role: "user", content: "ok" }] };

  const inicio = Date.now();
  let respuesta: Response;
  try {
    respuesta = await fetchImpl(spec.probe.url, {
      method: "POST",
      headers,
      body: JSON.stringify(cuerpo),
      signal: AbortSignal.timeout(options.timeoutMs ?? 45_000),
    });
  } catch (caught) {
    const detalle = caught instanceof Error ? caught.message : String(caught);
    return {
      ok: false,
      status: null,
      detail: /abort|timeout/i.test(detalle)
        ? `La prueba superó el tiempo máximo de ${options.timeoutMs ?? 45_000} ms.`
        : `Fallo de transporte: ${detalle}`,
      latencyMs: Date.now() - inicio,
    };
  }
  const latencyMs = Date.now() - inicio;

  let texto = "";
  try {
    texto = (await respuesta.text()).slice(0, 300).replace(/\s+/g, " ").trim();
  } catch {
    texto = "";
  }
  // La credencial se tacha: un proveedor puede devolverla reflejada en su error.
  if (clave !== null && clave !== "") texto = texto.split(clave).join("***");

  return {
    ok: respuesta.status === spec.probe.expect,
    status: respuesta.status,
    detail:
      respuesta.status === spec.probe.expect
        ? `${spec.name} acepta "${model}" (HTTP ${respuesta.status}).`
        : // El mensaje del proveedor, sin parafrasear: «Model is unavailable» no
          // es «la credencial no vale», y se arreglan distinto.
          `${spec.name} respondió HTTP ${respuesta.status}${texto === "" ? "." : `: ${texto}`}`,
    latencyMs,
  };
}
