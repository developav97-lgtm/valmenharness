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
import {
  chmodSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

/** Cómo se autentica un proveedor. */
export type AuthKind = "api-key" | "subscription" | "none";

/** Un proveedor conocido por el harness. */
export interface ProviderSpec {
  readonly id: string;
  readonly name: string;
  readonly auth: AuthKind;
  /**
   * Endpoint con el que se comprueba la conectividad.
   *
   * Se prueba contra un endpoint real y no con un `ping`: una clave mal pegada
   * tiene que fallar en la pantalla, no en la mitad de un gate.
   */
  /**
   * Cómo comprobar que una credencial sirve.
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
  /** Dónde vive el token, para los proveedores de suscripción. */
  readonly tokenSource?: string;
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
}

/** El catálogo tal como se declara: sin lo que se puede derivar de él. */
const CATALOGO: readonly ProviderSpec[] = [
  {
    id: "openrouter",
    name: "OpenRouter",
    auth: "api-key",
    envVar: "OPENROUTER_API_KEY",
    probe: { url: "https://openrouter.ai/api/v1/key", expect: 200 },
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    auth: "api-key",
    envVar: "DEEPSEEK_API_KEY",
    probe: { url: "https://api.deepseek.com/v1/models", expect: 200 },
  },
  {
    id: "moonshot",
    name: "Moonshot (Kimi)",
    auth: "api-key",
    envVar: "MOONSHOT_API_KEY",
    probe: { url: "https://api.moonshot.cn/v1/models", expect: 200 },
  },
  {
    id: "zhipu",
    name: "Zhipu (GLM)",
    auth: "api-key",
    envVar: "ZHIPU_API_KEY",
    probe: { url: "https://open.bigmodel.cn/api/paas/v4/models", expect: 200 },
  },
  {
    id: "qwen",
    name: "Qwen (Alibaba)",
    auth: "api-key",
    envVar: "QWEN_API_KEY",
    probe: {
      url: "https://dashscope.aliyuncs.com/compatible-mode/v1/models",
      expect: 200,
    },
  },
  {
    id: "claude-code",
    name: "Claude Code",
    auth: "subscription",
    envVar: "ANTHROPIC_API_KEY",
    tokenSource: "~/.claude/.credentials.json",
  },
  {
    id: "codex",
    name: "Codex",
    auth: "subscription",
    envVar: "OPENAI_API_KEY",
    tokenSource: "~/.codex/auth.json",
  },
  {
    // Go y Zen son **dos productos distintos** de opencode, con bases de URL
    // distintas y catálogos distintos. Confundirlos daba un proveedor que
    // parecía configurado y no servía para lo que el usuario tenía.
    //
    // Go: suscripción de 10 $/mes, modelos abiertos de código, 38 modelos, sin
    // Jev. La clave se saca de opencode.ai/auth igual que la de Zen.
    id: "opencode-go",
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
  /** El host contra el que se prueba, para que se sepa qué se va a tocar. */
  readonly probeHost: string | null;
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
 * Extrae el bloque de un proveedor.
 *
 * El proveedor está indentado bajo `providers:`, así que el ancla admite
 * espacios iniciales. Exigir la columna cero haría que el bloque nunca se
 * encontrara en el archivo que genera la plantilla.
 */
function providerBlock(text: string, id: string): string | null {
  const match = new RegExp(
    `^[ \\t]*${id}:[ \\t]*\\n((?:[ \\t]+.*\\n?)*)`,
    "m",
  ).exec(text);
  return match === null ? null : (match[1] as string);
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
  const block = providerBlock(text, id);
  if (block === null) return null;

  const moderno = /^[ \t]+api-key:[ \t]*["']?([^"'\n]+)["']?[ \t]*$/m.exec(
    block,
  );
  if (moderno !== null)
    return { value: moderno[1]!.trim(), legacyField: false };

  const anterior = /^[ \t]+api-key-env:[ \t]*["']?([^"'\n]+)["']?[ \t]*$/m.exec(
    block,
  );
  if (anterior !== null)
    return { value: anterior[1]!.trim(), legacyField: true };

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
    const enEntorno =
      typeof desdeEntorno === "string" && desdeEntorno.trim() !== "";
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
    (lineas[inicio] as string).length -
    (lineas[inicio] as string).trimStart().length;
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

  const headers: Record<string, string> = {};
  if (clave !== null && clave !== "")
    headers["Authorization"] = `Bearer ${clave}`;
  if (spec.probe.body !== undefined) headers["Content-Type"] = "application/json";
  for (const [nombre, valor] of Object.entries(spec.probe.headers ?? {})) {
    headers[nombre] = valor;
  }

  try {
    const respuesta = await fetchImpl(spec.probe.url, {
      method: spec.probe.method ?? "GET",
      headers,
      ...(spec.probe.body === undefined
        ? {}
        : { body: JSON.stringify(spec.probe.body) }),
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

/** Resuelve la clave de un proveedor para una prueba, o `null` si no aplica. */
function resolveForProbe(
  spec: ProviderSpec,
  filePath: string,
  env: NodeJS.ProcessEnv,
): string | null {
  const desdeEntorno = env[spec.envVar];
  if (typeof desdeEntorno === "string" && desdeEntorno.trim() !== "") {
    return desdeEntorno.trim();
  }
  const enArchivo = readKeyFromFile(readCredentialsFile(filePath), spec.id);
  return enArchivo?.value ?? null;
}
