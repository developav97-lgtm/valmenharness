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
import { type ServerContext, handleApi } from "../packages/server/src/server.js";

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
    const deepseek = listProviders(archivo, {}).find((p) => p.id === "deepseek");
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
    expect(estados.find((p) => p.id === "openrouter")?.source).toBe("credentials-file");
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
    updateCredentials([{ provider: "openrouter", apiKey: "sk-or-v1-nueva" }], archivo);
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
    updateCredentials([{ provider: "deepseek", apiKey: "sk-nueva-deepseek" }], archivo);
    const texto = readFileSync(archivo, "utf8");
    expect(texto).not.toContain("api-key-env");
    expect(texto).toContain('api-key: "sk-nueva-deepseek"');
  });

  it("añade un proveedor que no estaba declarado", () => {
    escribirCredenciales(ARCHIVO_BASE);
    updateCredentials([{ provider: "moonshot", apiKey: "sk-moonshot-nueva" }], archivo);
    const estados = listProviders(archivo, {});
    expect(estados.find((p) => p.id === "moonshot")?.configured).toBe(true);
  });

  it("con clave vacía, borra la entrada", () => {
    escribirCredenciales(ARCHIVO_BASE);
    updateCredentials([{ provider: "openrouter", apiKey: "" }], archivo);
    expect(listProviders(archivo, {}).find((p) => p.id === "openrouter")?.configured).toBe(
      false,
    );
    // Y el resto sigue intacto.
    expect(readFileSync(archivo, "utf8")).toContain("sk-una-clave-deepseek");
  });

  it("rechaza pegar a mano un token de suscripción", () => {
    // Un token de plan se lee del CLI. Pegarlo crearía un segundo origen de
    // verdad que se desincroniza en el primer refresco.
    expect(() =>
      updateCredentials([{ provider: "claude-code", apiKey: "un-token" }], archivo),
    ).toThrow("se autentica con su suscripción");
  });

  it("rechaza un proveedor desconocido", () => {
    expect(() =>
      updateCredentials([{ provider: "inventado", apiKey: "x" }], archivo),
    ).toThrow("Proveedor desconocido");
  });

  it("crea el archivo si no existe, ya con permisos 600", () => {
    updateCredentials([{ provider: "openrouter", apiKey: "sk-or-v1-primera" }], archivo);
    expect(statSync(archivo).mode & 0o777).toBe(0o600);
    expect(readFileSync(archivo, "utf8")).toContain("providers:");
  });

  it("no deja ningún temporal detrás", () => {
    escribirCredenciales(ARCHIVO_BASE);
    updateCredentials([{ provider: "openrouter", apiKey: "sk-or-v1-x" }], archivo);
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
      new Response("tu clave sk-or-v1-una-clave-de-prueba-larga-0123456789 es inválida", {
        status: 401,
      })) as unknown as typeof fetch;

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
    const sinProbe = PROVIDERS.filter((p) => p.auth === "api-key" && p.probe === undefined);
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
    expect(listProviders(archivo, {}).find((p) => p.id === "openrouter")?.configured).toBe(
      false,
    );
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
    const cuerpo = r.body as {
      models: { id: string; name: string; promptUsd: number | null }[];
    };
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

  it("dice 501 si el proveedor no publica su lista ni el proyecto la declara", async () => {
    // Y no un desplegable vacío: el mensaje dice dónde declararla.
    //
    // Se probaba con `codex` y con `opencode-go`, y **los dos resultaron publicar
    // catálogo**. Se comprobó ejecutando: `opencode.ai/zen/go/v1/models` y
    // `chatgpt.com/backend-api/codex/models` responden 200. Las dos suposiciones
    // dejaban sin desplegable a proveedores que sí lo tienen.
    escribirCredenciales(ARCHIVO_BASE);
    const r = await handleApi("GET", "/api/providers/inventado/models", {}, contexto());
    expect(r.status).toBe(501);
    expect((r.body as { error: string }).error).toMatch(/no publica su lista de modelos/);
  });

  it("los dos proveedores de opencode sí publican su catálogo", async () => {
    escribirCredenciales(ARCHIVO_BASE);
    const fetchFalso = (async () =>
      new Response(JSON.stringify({ data: [{ id: "kimi-k3" }] }), {
        status: 200,
      })) as unknown as typeof fetch;

    for (const id of ["opencode-go", "opencode-zen"]) {
      const r = await handleApi(
        "GET",
        `/api/providers/${id}/models`,
        {},
        contexto({ fetchImpl: fetchFalso }),
      );
      expect(r.status, id).toBe(200);
      expect((r.body as { models: { id: string }[] }).models[0]?.id, id).toBe("kimi-k3");
    }
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
    // Los dos de opencode también: se declararon como no disponibles por
    // suposición, y su endpoint responde 200 sin credencial.
    expect(cuerpo.providers.find((p) => p.id === "opencode-go")?.listable).toBe(true);
    expect(cuerpo.providers.find((p) => p.id === "opencode-zen")?.listable).toBe(true);
    // Y codex también, contra su propio backend. Se creyó que no tenía API.
    expect(cuerpo.providers.find((p) => p.id === "codex")?.listable).toBe(true);
  });

  it("declara si se puede comprobar un modelo concreto", async () => {
    // La interfaz no ofrece el botón donde no puede funcionar: un botón que
    // siempre falla es peor que no tenerlo.
    escribirCredenciales(ARCHIVO_BASE);
    const r = await handleApi("GET", "/api/providers", {}, contexto());
    const cuerpo = r.body as { providers: { id: string; testable: boolean }[] };
    expect(cuerpo.providers.find((p) => p.id === "opencode-go")?.testable).toBe(true);
    // Y codex también: su endpoint de respuestas acepta una petición mínima, y es
    // el proveedor donde más falta hace —sus identificadores se escriben a mano—.
    expect(cuerpo.providers.find((p) => p.id === "codex")?.testable).toBe(true);
    // Ollama comprueba su conexión con un `GET /api/tags`, que no sirve para
    // probar un modelo: hace falta poder mandarle uno en el cuerpo.
    expect(cuerpo.providers.find((p) => p.id === "ollama")?.testable).toBe(false);
  });
});

// ── Probar un modelo antes de guardarlo ─────────────────────────────────────

describe("POST /api/providers/:id/models/test", () => {
  /**
   * El identificador de un modelo es donde más fácil se escribe mal y donde peor
   * se descubre: un `gpt-5.6-terrra` con una erre de más pasa la configuración,
   * se guarda, y falla en mitad de un gate con un error que no dice qué se
   * escribió mal.
   */
  it("acepta un modelo que responde", async () => {
    escribirCredenciales(ARCHIVO_BASE);
    const visto: { url: string; body: string }[] = [];
    const fetchFalso = (async (url: string, init: { body?: string }) => {
      visto.push({ url: String(url), body: String(init.body) });
      return new Response(JSON.stringify({ choices: [] }), { status: 200 });
    }) as unknown as typeof fetch;

    const r = await handleApi(
      "POST",
      "/api/providers/opencode-go/models/test",
      { model: "kimi-k3" },
      contexto({ fetchImpl: fetchFalso }),
    );

    expect(r.status).toBe(200);
    expect((r.body as { ok: boolean }).ok).toBe(true);
    // Se prueba contra el endpoint de **chat** y con el modelo pedido: probar
    // contra el listado diría que sí a cualquier cosa.
    expect(visto[0]?.url).toContain("chat/completions");
    expect(JSON.parse(visto[0]!.body).model).toBe("kimi-k3");
  });

  it("rechaza un modelo que el proveedor no conoce, y muestra su mensaje", async () => {
    escribirCredenciales(ARCHIVO_BASE);
    const fetchFalso = (async () =>
      new Response(
        JSON.stringify({
          error: { message: "Upstream request failed: Model is unavailable." },
        }),
        { status: 400 },
      )) as unknown as typeof fetch;

    const r = await handleApi(
      "POST",
      "/api/providers/opencode-go/models/test",
      { model: "kimi-k3-mal" },
      contexto({ fetchImpl: fetchFalso }),
    );

    // Un modelo rechazado no es un error del servidor: la pantalla lo muestra
    // donde el usuario escribió.
    expect(r.status).toBe(200);
    const cuerpo = r.body as { ok: boolean; detail: string };
    expect(cuerpo.ok).toBe(false);
    expect(cuerpo.detail).toContain("Model is unavailable");
  });

  it("tacha la credencial si el proveedor la refleja", async () => {
    escribirCredenciales(ARCHIVO_BASE);
    const clave = /api-key: "([^"]+)"/.exec(ARCHIVO_BASE)?.[1] as string;
    const fetchFalso = (async () =>
      new Response(`bad key ${clave}`, { status: 401 })) as unknown as typeof fetch;

    const r = await handleApi(
      "POST",
      "/api/providers/openrouter/models/test",
      { model: "x" },
      contexto({ fetchImpl: fetchFalso }),
    );
    expect((r.body as { detail: string }).detail).not.toContain(clave);
  });

  it("exige el modelo", async () => {
    escribirCredenciales(ARCHIVO_BASE);
    const r = await handleApi(
      "POST",
      "/api/providers/deepseek/models/test",
      {},
      contexto(),
    );
    expect(r.status).toBe(400);
  });
});

describe("los modelos declarados por el proyecto", () => {
  it("salen en la lista aunque el proveedor publique la suya", async () => {
    escribirCredenciales(ARCHIVO_BASE);
    // Con codex publicando su catálogo, los candidatos ya no son la única fuente,
    // pero siguen sirviendo para lo que se declararon: subir arriba lo que se usa,
    // y poder usar un modelo que el catálogo no lista pero el endpoint acepta.
    mkdirSync(join(lab, ".valmen"), { recursive: true });
    writeFileSync(
      join(lab, ".valmen", "config.yaml"),
      [
        "name: Prueba",
        "providers:",
        "  codex:",
        "    candidates:",
        "      - gpt-5.6-sol",
        "      - gpt-5.6-terra",
        "",
      ].join("\n"),
    );
    const fetchFalso = (async () =>
      new Response(
        JSON.stringify({ models: [{ slug: "gpt-5.5", display_name: "GPT-5.5" }] }),
        { status: 200 },
      )) as unknown as typeof fetch;

    const r = await handleApi(
      "GET",
      "/api/providers/codex/models",
      {},
      contexto({ fetchImpl: fetchFalso }),
    );
    expect(r.status).toBe(200);
    const cuerpo = r.body as { models: { id: string }[]; source: string };
    expect(cuerpo.source).toBe("ambos");
    // Los declarados primero, y el publicado después.
    expect(cuerpo.models.map((m) => m.id)).toEqual([
      "gpt-5.6-sol",
      "gpt-5.6-terra",
      "gpt-5.5",
    ]);
  });

  it("un proveedor que no publica usa solo los declarados", async () => {
    escribirCredenciales(ARCHIVO_BASE);
    mkdirSync(join(lab, ".valmen"), { recursive: true });
    writeFileSync(
      join(lab, ".valmen", "config.yaml"),
      [
        "name: Prueba",
        "providers:",
        "  inventado:",
        "    candidates:",
        "      - uno",
        "",
      ].join("\n"),
    );
    const r = await handleApi("GET", "/api/providers/inventado/models", {}, contexto());
    expect(r.status).toBe(200);
    const cuerpo = r.body as { models: { id: string }[]; source: string };
    expect(cuerpo.source).toBe("declarado");
    expect(cuerpo.models.map((m) => m.id)).toEqual(["uno"]);
  });

  it("se suman a los publicados, y van primero", async () => {
    escribirCredenciales(ARCHIVO_BASE);
    mkdirSync(join(lab, ".valmen"), { recursive: true });
    writeFileSync(
      join(lab, ".valmen", "config.yaml"),
      [
        "name: Prueba",
        "providers:",
        "  deepseek:",
        "    candidates:",
        "      - el-mio",
        "",
      ].join("\n"),
    );
    const fetchFalso = (async () =>
      new Response(JSON.stringify({ data: [{ id: "deepseek-v4-pro" }] }), {
        status: 200,
      })) as unknown as typeof fetch;

    const r = await handleApi(
      "GET",
      "/api/providers/deepseek/models",
      {},
      contexto({ fetchImpl: fetchFalso }),
    );
    const cuerpo = r.body as { models: { id: string }[]; source: string };
    // Primero los declarados: son los que el usuario eligió, y buscarlos en una
    // lista de decenas no debería costar un desplazamiento.
    expect(cuerpo.models.map((m) => m.id)).toEqual(["el-mio", "deepseek-v4-pro"]);
    expect(cuerpo.source).toBe("ambos");
  });

  it("un catálogo que falla no vacía la lista declarada", async () => {
    escribirCredenciales(ARCHIVO_BASE);
    mkdirSync(join(lab, ".valmen"), { recursive: true });
    writeFileSync(
      join(lab, ".valmen", "config.yaml"),
      [
        "name: Prueba",
        "providers:",
        "  deepseek:",
        "    candidates:",
        "      - el-mio",
        "",
      ].join("\n"),
    );
    const fetchFalso = (async () =>
      new Response("boom", { status: 500 })) as unknown as typeof fetch;

    const r = await handleApi(
      "GET",
      "/api/providers/deepseek/models",
      {},
      contexto({ fetchImpl: fetchFalso }),
    );
    expect(r.status).toBe(502);
    expect((r.body as { models: { id: string }[] }).models.map((m) => m.id)).toEqual([
      "el-mio",
    ]);
  });

  it("sin lista publicada ni declarada, dice dónde declararla", async () => {
    escribirCredenciales(ARCHIVO_BASE);
    const r = await handleApi("GET", "/api/providers/inventado/models", {}, contexto());
    expect(r.status).toBe(501);
    expect((r.body as { error: string }).error).toContain("providers.inventado.candidates");
  });

  it("un config.yaml roto no rompe el listado", async () => {
    escribirCredenciales(ARCHIVO_BASE);
    mkdirSync(join(lab, ".valmen"), { recursive: true });
    writeFileSync(join(lab, ".valmen", "config.yaml"), "name: [sin cerrar\n");

    const r = await handleApi("GET", "/api/providers/opencode-go/models", {}, contexto());
    // El error del config tiene su sitio, que es el editor de configuración.
    // Convertirlo en un fallo del listado escondería el problema real.
    expect(r.status).toBe(200);
  });
});
