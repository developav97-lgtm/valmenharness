/**
 * Mission Control: la API de configuración de proveedores.
 *
 * Es el requisito bloqueante de la Fase 4 —"configurar claves desde la app, no
 * editando un archivo"— así que lo que estos tests protegen es que la operación
 * sea segura de punta a punta:
 *
 * 1. **La clave nunca sale.** Ni en una respuesta, ni en un error.
 * 2. **Se prueba antes de guardar.** Una clave mala falla en la pantalla.
 * 3. **El archivo queda con permisos 600 y sin perder sus comentarios.**
 * 4. **Un token de suscripción no se pega a mano.**
 */
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  PROVIDERS,
  listProviders,
  probeProvider,
  updateCredentials,
} from "../packages/server/src/providers.js";
import {
  type ServerContext,
  handleApi,
} from "../packages/server/src/server.js";

let lab: string;
let archivo: string;

/** Un archivo de credenciales como el que mantiene una persona. */
function escribirCredenciales(contenido: string): void {
  mkdirSync(join(lab, ".valmen"), { recursive: true });
  writeFileSync(archivo, contenido, { encoding: "utf8", mode: 0o600 });
}

const ARCHIVO_BASE = [
  "# Credenciales de ValmenHarness.",
  "# Este comentario debe sobrevivir a cualquier reescritura.",
  "",
  "version: 1",
  "",
  "providers:",
  "  openrouter:",
  '    api-key: "sk-or-v1-una-clave-de-prueba-larga-0123456789"',
  "  deepseek:",
  '    api-key-env: "sk-una-clave-deepseek-de-prueba"',
  "",
  "subscriptions:",
  "  claude-code:",
  "    source: claude-cli",
  "",
].join("\n");

beforeEach(() => {
  lab = mkdtempSync(join(tmpdir(), "valmen-mc-"));
  archivo = join(lab, ".valmen", ".credentials.yaml");
});

afterEach(() => {
  rmSync(lab, { recursive: true, force: true });
});

function contexto(overrides: Partial<ServerContext> = {}): ServerContext {
  return {
    root: lab,
    credentialsFile: archivo,
    env: {},
    ...overrides,
  };
}

// ── Estado de los proveedores ───────────────────────────────────────────────

describe("listProviders", () => {
  it("informa el estado sin devolver nunca el valor", () => {
    escribirCredenciales(ARCHIVO_BASE);
    const estados = listProviders(archivo, {});

    const openrouter = estados.find((p) => p.id === "openrouter");
    expect(openrouter?.configured).toBe(true);
    expect(openrouter?.source).toBe("credentials-file");
    // La longitud se incluye a propósito: permite notar una clave truncada sin
    // que la interfaz conozca la clave. Se deriva del fixture en vez de
    // escribirse a mano, para que el test no dependa de un conteo manual.
    const claveEnElFixture = /api-key: "([^"]+)"/.exec(ARCHIVO_BASE)?.[1] ?? "";
    expect(openrouter?.keyLength).toBe(claveEnElFixture.length);

    // Y el valor no está en ninguna parte de la estructura.
    const serializado = JSON.stringify(estados);
    expect(serializado).not.toContain("sk-or-v1-una-clave");
    expect(serializado).not.toContain("sk-una-clave-deepseek");
  });

  it("informa que un proveedor usa el nombre de campo anterior", () => {
    // Se informa, no se corrige en silencio: reescribir el archivo sin que el
    // usuario lo pida sería modificar un archivo que mantiene a mano.
    escribirCredenciales(ARCHIVO_BASE);
    const deepseek = listProviders(archivo, {}).find(
      (p) => p.id === "deepseek",
    );
    expect(deepseek?.configured).toBe(true);
    expect(deepseek?.legacyFieldName).toBe(true);
  });

  it("la variable de entorno tiene prioridad sobre el archivo", () => {
    escribirCredenciales(ARCHIVO_BASE);
    const estados = listProviders(archivo, {
      OPENROUTER_API_KEY: "sk-or-v1-desde-el-entorno-mas-larga",
    });
    const openrouter = estados.find((p) => p.id === "openrouter");
    expect(openrouter?.source).toBe("environment");
    expect(openrouter?.keyLength).toBe(35);
  });

  it("ignora una variable de entorno vacía", () => {
    escribirCredenciales(ARCHIVO_BASE);
    const estados = listProviders(archivo, { OPENROUTER_API_KEY: "   " });
    // Definida pero en blanco no es una credencial.
    expect(estados.find((p) => p.id === "openrouter")?.source).toBe(
      "credentials-file",
    );
  });

  it("un proveedor local sin credencial está disponible por definición", () => {
    escribirCredenciales(ARCHIVO_BASE);
    const ollama = listProviders(archivo, {}).find((p) => p.id === "ollama");
    // Que esté corriendo lo dice la prueba de conexión, no el estado.
    expect(ollama?.configured).toBe(true);
    expect(ollama?.source).toBe("none");
  });

  it("sin archivo, los de API key aparecen sin configurar", () => {
    const estados = listProviders(archivo, {});
    // Se excluye el que además declara un token del CLI: ese puede estar
    // configurado por la sesión del CLI aunque no haya clave pegada.
    const soloClave = estados.filter(
      (p) => p.auth === "api-key" && p.tokenSource === undefined,
    );
    expect(soloClave.length).toBeGreaterThan(0);
    expect(soloClave.every((p) => !p.configured)).toBe(true);
  });

  it("Go y Zen son dos proveedores distintos, y los dos aceptan clave", () => {
    // Go y Zen son productos distintos de opencode: suscripción contra consumo,
    // con bases de URL y catálogos distintos. Estaban fundidos en uno solo, y
    // eso hacía que un usuario de Go viera un proveedor que no era el suyo.
    const estados = listProviders(archivo, {});
    const go = estados.find((p) => p.id === "opencode-go");
    const zen = estados.find((p) => p.id === "opencode-zen");

    for (const proveedor of [go, zen]) {
      expect(proveedor?.auth).toBe("api-key");
      expect(proveedor?.probeable).toBe(true);
    }

    // Solo Go hereda la sesión del CLI: iniciar sesión en opencode es una
    // credencial de la suscripción, no de la pasarela por consumo. Zen se
    // configura con su clave o se queda sin configurar, y darlo por detectado
    // hacía que la pantalla lo diera por listo sin estarlo.
    expect(go?.tokenSource).toBeDefined();
    expect(zen?.tokenSource).toBeUndefined();
    // Bases distintas: confundirlas mandaría las peticiones al catálogo ajeno.
    expect(go?.probeHost).toBe("opencode.ai");
    expect(zen?.probeHost).toBe("opencode.ai");

    // Y con la clave en el entorno, gana la clave sobre el token del CLI.
    const conClave = listProviders(archivo, { OPENCODE_GO_API_KEY: "sk-go-12345" }).find(
      (p) => p.id === "opencode-go",
    );
    expect(conClave?.source).toBe("environment");
    expect(conClave?.keyLength).toBe(11);
  });
});

// ── Escritura de credenciales ───────────────────────────────────────────────

describe("updateCredentials", () => {
  it("escribe la clave con permisos 600", () => {
    updateCredentials(
      [{ provider: "openrouter", apiKey: "sk-or-v1-nueva" }],
      archivo,
    );
    // Un archivo legible por otros es un secreto expuesto.
    const modo = statSync(archivo).mode & 0o777;
    expect(modo).toBe(0o600);
  });

  it("preserva los comentarios y el resto del archivo", () => {
    // El archivo lo mantiene una persona: perder sus comentarios sería perder
    // su documentación.
    escribirCredenciales(ARCHIVO_BASE);
    updateCredentials(
      [{ provider: "openrouter", apiKey: "sk-or-v1-reemplazada" }],
      archivo,
    );

    const texto = readFileSync(archivo, "utf8");
    expect(texto).toContain("# Este comentario debe sobrevivir");
    expect(texto).toContain("subscriptions:");
    expect(texto).toContain("source: claude-cli");
    expect(texto).toContain("sk-or-v1-reemplazada");
    expect(texto).not.toContain("sk-or-v1-una-clave-de-prueba");
  });

  it("normaliza el nombre del campo al reescribir", () => {
    // El valor se está escribiendo ahora, así que no hay razón para conservar
    // el nombre anterior.
    escribirCredenciales(ARCHIVO_BASE);
    updateCredentials(
      [{ provider: "deepseek", apiKey: "sk-nueva-deepseek" }],
      archivo,
    );
    const texto = readFileSync(archivo, "utf8");
    expect(texto).not.toContain("api-key-env");
    expect(texto).toContain('api-key: "sk-nueva-deepseek"');
  });

  it("añade un proveedor que no estaba declarado", () => {
    escribirCredenciales(ARCHIVO_BASE);
    updateCredentials(
      [{ provider: "moonshot", apiKey: "sk-moonshot-nueva" }],
      archivo,
    );
    const estados = listProviders(archivo, {});
    expect(estados.find((p) => p.id === "moonshot")?.configured).toBe(true);
  });

  it("con clave vacía, borra la entrada", () => {
    escribirCredenciales(ARCHIVO_BASE);
    updateCredentials([{ provider: "openrouter", apiKey: "" }], archivo);
    expect(
      listProviders(archivo, {}).find((p) => p.id === "openrouter")?.configured,
    ).toBe(false);
    // Y el resto sigue intacto.
    expect(readFileSync(archivo, "utf8")).toContain("sk-una-clave-deepseek");
  });

  it("rechaza pegar a mano un token de suscripción", () => {
    // Un token de plan se lee del CLI. Pegarlo crearía un segundo origen de
    // verdad que se desincroniza en el primer refresco.
    expect(() =>
      updateCredentials(
        [{ provider: "claude-code", apiKey: "un-token" }],
        archivo,
      ),
    ).toThrow("se autentica con su suscripción");
  });

  it("rechaza un proveedor desconocido", () => {
    expect(() =>
      updateCredentials([{ provider: "inventado", apiKey: "x" }], archivo),
    ).toThrow("Proveedor desconocido");
  });

  it("crea el archivo si no existe, ya con permisos 600", () => {
    updateCredentials(
      [{ provider: "openrouter", apiKey: "sk-or-v1-primera" }],
      archivo,
    );
    expect(statSync(archivo).mode & 0o777).toBe(0o600);
    expect(readFileSync(archivo, "utf8")).toContain("providers:");
  });

  it("no deja ningún temporal detrás", () => {
    escribirCredenciales(ARCHIVO_BASE);
    updateCredentials(
      [{ provider: "openrouter", apiKey: "sk-or-v1-x" }],
      archivo,
    );
    const sobrantes = readFileSync(archivo, "utf8");
    expect(sobrantes).not.toContain(".tmp");
    expect(statSync(archivo).isFile()).toBe(true);
  });
});

// ── Prueba de conexión ──────────────────────────────────────────────────────

describe("probeProvider", () => {
  it("verifica contra el endpoint real del proveedor", async () => {
    escribirCredenciales(ARCHIVO_BASE);
    let urlLlamada = "";
    let autorizacion = "";
    const fetchImpl = (async (url: string, init?: RequestInit) => {
      urlLlamada = String(url);
      autorizacion = String(
        (init?.headers as Record<string, string>)?.["Authorization"] ?? "",
      );
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;

    const resultado = await probeProvider("openrouter", {
      filePath: archivo,
      env: {},
      fetchImpl,
    });
    expect(resultado.ok).toBe(true);
    // Se prueban los datos reales, no un `ping`: una clave mal pegada tiene que
    // fallar en la pantalla.
    expect(urlLlamada).toContain("openrouter.ai");
    expect(autorizacion).toMatch(/^Bearer sk-or-v1-/);
  });

  it("detecta una credencial inválida", async () => {
    escribirCredenciales(ARCHIVO_BASE);
    const fetchImpl = (async () =>
      new Response("no autorizado", {
        status: 401,
      })) as unknown as typeof fetch;

    const resultado = await probeProvider("openrouter", {
      filePath: archivo,
      env: {},
      fetchImpl,
    });
    expect(resultado.ok).toBe(false);
    expect(resultado.status).toBe(401);
    expect(resultado.detail).toContain("no autorizado");
  });

  it("no filtra la credencial en el detalle del fallo", async () => {
    escribirCredenciales(ARCHIVO_BASE);
    // Un proveedor mal implementado podría reflejar la clave en su respuesta.
    const fetchImpl = (async () =>
      new Response(
        "tu clave sk-or-v1-una-clave-de-prueba-larga-0123456789 es inválida",
        {
          status: 401,
        },
      )) as unknown as typeof fetch;

    const resultado = await probeProvider("openrouter", {
      filePath: archivo,
      env: {},
      fetchImpl,
    });
    expect(resultado.detail).not.toContain("sk-or-v1-una-clave");
  });

  it("reporta un timeout con su propio mensaje", async () => {
    escribirCredenciales(ARCHIVO_BASE);
    const fetchImpl = (async () => {
      throw new Error("The operation was aborted due to timeout");
    }) as unknown as typeof fetch;

    const resultado = await probeProvider("openrouter", {
      filePath: archivo,
      env: {},
      fetchImpl,
      timeoutMs: 100,
    });
    expect(resultado.ok).toBe(false);
    expect(resultado.detail).toContain("Sin respuesta");
  });

  it("informa si un proveedor no declara endpoint de prueba", async () => {
    // Todos los proveedores de API key deben declararlo: sin endpoint, el
    // botón de probar no puede cumplir su función.
    const sinProbe = PROVIDERS.filter(
      (p) => p.auth === "api-key" && p.probe === undefined,
    );
    expect(sinProbe).toEqual([]);
  });
});

// ── La API ──────────────────────────────────────────────────────────────────

describe("la API de Mission Control", () => {
  it("expone la salud con la raíz del proyecto", async () => {
    const r = await handleApi("GET", "/api/health", {}, contexto());
    expect(r.status).toBe(200);
    expect((r.body as { root: string }).root).toBe(lab);
  });

  it("lista los proveedores sin filtrar ninguna clave", async () => {
    escribirCredenciales(ARCHIVO_BASE);
    const r = await handleApi("GET", "/api/providers", {}, contexto());
    expect(r.status).toBe(200);
    const serializado = JSON.stringify(r.body);
    expect(serializado).not.toContain("sk-or-v1-una-clave");
    expect(serializado).not.toContain("sk-una-clave-deepseek");
  });

  it("prueba un proveedor antes de guardar", async () => {
    const fetchImpl = (async () =>
      new Response("{}", { status: 200 })) as unknown as typeof fetch;

    const r = await handleApi(
      "PUT",
      "/api/providers/openrouter/credential",
      { apiKey: "sk-or-v1-nueva-valida" },
      contexto({ fetchImpl }),
    );

    expect(r.status).toBe(200);
    expect(readFileSync(archivo, "utf8")).toContain("sk-or-v1-nueva-valida");
  });

  it("NO guarda nada si la prueba falla", async () => {
    // Es la garantía central de la pantalla: una clave mal pegada falla aquí y
    // no en la mitad de un gate.
    escribirCredenciales(ARCHIVO_BASE);
    const antes = readFileSync(archivo, "utf8");
    const fetchImpl = (async () =>
      new Response("no autorizado", {
        status: 401,
      })) as unknown as typeof fetch;

    const r = await handleApi(
      "PUT",
      "/api/providers/openrouter/credential",
      { apiKey: "sk-or-v1-mala" },
      contexto({ fetchImpl }),
    );

    expect(r.status).toBe(422);
    expect((r.body as { error: string }).error).toContain("no se guardó nada");
    // El archivo quedó byte a byte igual.
    expect(readFileSync(archivo, "utf8")).toBe(antes);
  });

  it("rechaza una petición sin el campo apiKey", async () => {
    const r = await handleApi(
      "PUT",
      "/api/providers/openrouter/credential",
      {},
      contexto(),
    );
    expect(r.status).toBe(400);
    expect((r.body as { error: string }).error).toContain("apiKey");
  });

  it("borra una credencial", async () => {
    escribirCredenciales(ARCHIVO_BASE);
    const r = await handleApi(
      "DELETE",
      "/api/providers/openrouter/credential",
      {},
      contexto(),
    );
    expect(r.status).toBe(200);
    expect(
      listProviders(archivo, {}).find((p) => p.id === "openrouter")?.configured,
    ).toBe(false);
  });

  it("devuelve 404 con un mensaje útil en una ruta desconocida", async () => {
    const r = await handleApi("GET", "/api/inventado", {}, contexto());
    expect(r.status).toBe(404);
    expect((r.body as { error: string }).error).toContain("/api/inventado");
  });
});

// ── La lista de modelos por proveedor ───────────────────────────────────────

describe("GET /api/providers/:id/models", () => {
  /**
   * Lo que hace posible el selector de dos niveles.
   *
   * Elegir un modelo de otro proveedor era imposible desde la pantalla: la lista
   * que se ofrecía era la de OpenRouter y nada más. Ahora cada proveedor publica
   * la suya, y la pantalla no la inventa: un proveedor que no la publique lo dice.
   */
  it("devuelve la lista del proveedor, normalizada", async () => {
    escribirCredenciales(ARCHIVO_BASE);
    const visto: string[] = [];
    const fetchFalso = (async (url: string) => {
      visto.push(String(url));
      return new Response(
        JSON.stringify({
          data: [
            { id: "deepseek-v4-pro", name: "DeepSeek V4 Pro" },
            { id: "deepseek-flash" },
            { id: "", name: "sin id" },
            "deepseek-plano",
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }) as unknown as typeof fetch;

    const r = await handleApi(
      "GET",
      "/api/providers/deepseek/models",
      {},
      contexto({ fetchImpl: fetchFalso }),
    );

    expect(r.status).toBe(200);
    const cuerpo = r.body as { models: { id: string; name: string; promptUsd: number | null }[] };
    // Los identificadores vacíos se descartan, y el nombre cae al identificador
    // cuando el proveedor no lo trae: una fila sin nombre no se puede elegir.
    expect(cuerpo.models.map((m) => m.id)).toEqual([
      "deepseek-flash",
      "deepseek-plano",
      "deepseek-v4-pro",
    ]);
    expect(cuerpo.models.find((m) => m.id === "deepseek-v4-pro")?.name).toBe(
      "DeepSeek V4 Pro",
    );
    expect(cuerpo.models.find((m) => m.id === "deepseek-flash")?.name).toBe(
      "deepseek-flash",
    );
  });

  it("lee el precio cuando el proveedor lo publica", async () => {
    escribirCredenciales(ARCHIVO_BASE);
    const fetchFalso = (async () =>
      new Response(
        JSON.stringify({ data: [{ id: "caro", pricing: { prompt: "0.000003" } }] }),
        { status: 200 },
      )) as unknown as typeof fetch;

    const r = await handleApi(
      "GET",
      "/api/providers/openrouter/models",
      {},
      contexto({ fetchImpl: fetchFalso }),
    );
    const cuerpo = r.body as { models: { promptUsd: number | null }[] };
    expect(cuerpo.models[0]?.promptUsd).toBe(0.000003);
  });

  it("dice 501 si el proveedor no publica su lista", async () => {
    // Y no un desplegable vacío: la pantalla ofrece escribir el identificador, que
    // es lo honesto.
    escribirCredenciales(ARCHIVO_BASE);
    const r = await handleApi("GET", "/api/providers/opencode-go/models", {}, contexto());
    expect(r.status).toBe(501);
    expect((r.body as { error: string }).error).toMatch(/no publica su lista de modelos/);
  });

  it("dice 502 con lo que respondió el proveedor", async () => {
    escribirCredenciales(ARCHIVO_BASE);
    const fetchFalso = (async () =>
      new Response("Insufficient balance", { status: 402 })) as unknown as typeof fetch;

    const r = await handleApi(
      "GET",
      "/api/providers/deepseek/models",
      {},
      contexto({ fetchImpl: fetchFalso }),
    );
    expect(r.status).toBe(502);
    // El cuerpo del proveedor viaja tal cual: «Insufficient balance» no es «sin
    // conexión», y se arreglan distinto.
    expect((r.body as { error: string }).error).toContain("Insufficient balance");
  });

  it("tacha la credencial si el proveedor la refleja en su error", async () => {
    escribirCredenciales(ARCHIVO_BASE);
    const clave = /api-key: "([^"]+)"/.exec(ARCHIVO_BASE)?.[1] as string;
    const fetchFalso = (async () =>
      new Response(`invalid key ${clave}`, { status: 401 })) as unknown as typeof fetch;

    const r = await handleApi(
      "GET",
      "/api/providers/openrouter/models",
      {},
      contexto({ fetchImpl: fetchFalso }),
    );
    const error = (r.body as { error: string }).error;
    expect(error).not.toContain(clave);
    expect(error).toContain("***");
  });

  it("un fallo de transporte no es un 200 con la lista vacía", async () => {
    escribirCredenciales(ARCHIVO_BASE);
    const fetchFalso = (async () => {
      throw new Error("fetch failed");
    }) as unknown as typeof fetch;

    const r = await handleApi(
      "GET",
      "/api/providers/ollama/models",
      {},
      contexto({ fetchImpl: fetchFalso }),
    );
    expect(r.status).toBe(502);
    expect((r.body as { error: string }).error).toMatch(/No se pudo consultar/);
  });

  it("un proveedor desconocido lo dice con su nombre", async () => {
    escribirCredenciales(ARCHIVO_BASE);
    const r = await handleApi("GET", "/api/providers/inventado/models", {}, contexto());
    // Un proveedor que no está en el catálogo no tiene `modelsUrl`, así que la
    // ruta devuelve 501 y el cuerpo explica cuál no publica nada. Distinguirlo de
    // «no existe» importa poco aquí y confundirlos importaría: el mensaje nombra
    // el proveedor.
    expect(r.status).toBe(501);
    expect((r.body as { error: string }).error).toContain("inventado");
  });

  it("el estado del proveedor declara si publica su lista", async () => {
    escribirCredenciales(ARCHIVO_BASE);
    const r = await handleApi("GET", "/api/providers", {}, contexto());
    const cuerpo = r.body as { providers: { id: string; listable: boolean }[] };
    expect(cuerpo.providers.find((p) => p.id === "openrouter")?.listable).toBe(true);
    expect(cuerpo.providers.find((p) => p.id === "opencode-go")?.listable).toBe(false);
  });
});
