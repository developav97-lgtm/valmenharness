/**
 * La verificación de un criterio por petición HTTP (R-QAAG-007).
 *
 * Una petición HTTP es otra clase de verificación que un comando de consola, y su riesgo es
 * distinto: quien escribe el criterio podría apuntarla adonde quisiera. Por eso la seguridad no
 * sale de confiar en el texto sino de **qué se toma del ticket**: solo el método, la ruta y las
 * expectativas. El host, el plazo y la credencial salen de la configuración del proyecto
 * (`qa-http`); un host, esquema o método que no estén en ella se rechazan **antes** de abrir una
 * conexión. Las aserciones son una gramática cerrada, la petición no sigue redirecciones y el
 * resultado no guarda cabeceras de autenticación ni cookies.
 *
 * Vive en el motor y no en `@valmen/gate-command`, cuyo contrato es «sin red».
 */
import { createHash } from "node:crypto";

import { type QaHttpConfig } from "@valmen/adapter";

/** Una aserción de la gramática cerrada. */
export type Asercion =
  | { readonly tipo: "status"; readonly valor: number; readonly texto: string }
  | {
      readonly tipo: "json";
      readonly ruta: readonly string[];
      readonly operador: "==" | "!=";
      readonly valor: string | number | boolean | null;
      readonly texto: string;
    }
  | {
      readonly tipo: "largo";
      readonly ruta: readonly string[];
      readonly operador: "==" | ">=" | "<=";
      readonly valor: number;
      readonly texto: string;
    };

export interface PeticionHttp {
  readonly metodo: string;
  /** La ruta con su consulta, que siempre empieza con una barra. */
  readonly ruta: string;
  readonly aserciones: readonly Asercion[];
}

const MAX_RUTA = 500;
const MAX_ASERCIONES = 10;
const RUTA_JSON = "[A-Za-z_][A-Za-z0-9_]*(?:\\.[A-Za-z0-9_]+)*";
const LITERAL = '(-?\\d+(?:\\.\\d+)?|true|false|null|"(?:[^"\\\\]|\\\\.)*")';

function literal(texto: string): string | number | boolean | null {
  return JSON.parse(texto) as string | number | boolean | null;
}

/** Lee una aserción de la gramática cerrada; lanza si no encaja. */
function parsearAsercion(texto: string): Asercion {
  const t = texto.trim();
  let m = /^status=(\d{3})$/.exec(t);
  if (m !== null) return { tipo: "status", valor: Number(m[1]), texto: t };
  m = new RegExp(`^json\\.(${RUTA_JSON})\\.length(==|>=|<=)(\\d+)$`).exec(t);
  if (m !== null) {
    return { tipo: "largo", ruta: (m[1] as string).split("."), operador: m[2] as "==" | ">=" | "<=", valor: Number(m[3]), texto: t };
  }
  m = new RegExp(`^json\\.(${RUTA_JSON})(==|!=)${LITERAL}$`).exec(t);
  if (m !== null) {
    return { tipo: "json", ruta: (m[1] as string).split("."), operador: m[2] as "==" | "!=", valor: literal(m[3] as string), texto: t };
  }
  throw new Error(
    `La aserción «${t}» no está en la gramática cerrada: status=NNN, json.ruta==literal, json.ruta!=literal, ` +
      "json.ruta.length==N, json.ruta.length>=N o json.ruta.length<=N.",
  );
}

/**
 * Lee la anotación `http:` de un criterio: `MÉTODO ruta expect: aserciones`.
 *
 * Rechaza una ruta con esquema, host, `//`, `@`, barra invertida o espacios: lo único que el ticket
 * puede decir es una ruta del servidor que la configuración ya fijó.
 */
export function parsearCriterioHttp(texto: string): PeticionHttp {
  const m = /^([A-Za-z]+)\s+(\S+)\s+expect:\s*([\s\S]+)$/.exec(texto.trim());
  if (m === null) {
    throw new Error("El criterio http debe ser `MÉTODO ruta expect: aserción; aserción`.");
  }
  const metodo = (m[1] as string).toUpperCase();
  const ruta = m[2] as string;
  if (ruta.length > MAX_RUTA) throw new Error(`La ruta supera los ${MAX_RUTA} caracteres.`);
  if (!ruta.startsWith("/") || ruta.startsWith("//") || /[\\@\s]/.test(ruta) || /^[a-z][a-z0-9+.-]*:/i.test(ruta) || ruta.includes("://")) {
    throw new Error(
      `La ruta «${ruta}» no es válida: debe empezar con una sola barra y no llevar esquema, host, @ ni espacios ` +
        "(el host lo fija la configuración del proyecto).",
    );
  }
  const analizada = new URL(ruta, "http://base.invalid");
  if (analizada.origin !== "http://base.invalid") {
    throw new Error(`La ruta «${ruta}» cambia el host: no se admite.`);
  }
  const aserciones = (m[3] as string)
    .split(";")
    .map((a) => a.trim())
    .filter((a) => a !== "");
  if (aserciones.length === 0) throw new Error("El criterio http necesita al menos una aserción tras `expect:`.");
  if (aserciones.length > MAX_ASERCIONES) throw new Error(`El criterio http admite hasta ${MAX_ASERCIONES} aserciones.`);
  return { metodo, ruta, aserciones: aserciones.map(parsearAsercion) };
}

export interface ResultadoDeAsercion {
  readonly expresion: string;
  readonly cumplida: boolean;
  readonly observado: string;
}

export interface ResultadoHttp {
  /** `rechazado` si no se hizo la petición; `cumplido` si todas las aserciones pasaron. */
  readonly estado: "cumplido" | "incumplido" | "rechazado";
  readonly motivo: string | null;
  readonly peticion: { readonly metodo: string; readonly url: string } | null;
  readonly respuesta: {
    readonly status: number;
    readonly latenciaMs: number;
    readonly bodySha256: string;
    readonly bodyBytes: number;
  } | null;
  readonly aserciones: readonly ResultadoDeAsercion[];
}

const rechazo = (motivo: string, peticion: ResultadoHttp["peticion"] = null): ResultadoHttp => ({
  estado: "rechazado", motivo, peticion, respuesta: null, aserciones: [],
});

/** El mensaje cuando el proyecto no declara `qa-http`: dice qué declarar. */
export const SIN_QA_HTTP =
  "El proyecto no declara `qa-http` en .valmen/config.yaml: sin una lista de hosts permitidos no se verifica ningún criterio http. " +
  "Declare, por ejemplo:\n  qa-http:\n    hosts:\n      - http://localhost:8000\n    methods:\n      - GET";

function valorEn(raiz: unknown, ruta: readonly string[]): unknown {
  let actual = raiz;
  for (const clave of ruta) {
    if (actual === null || typeof actual !== "object") return undefined;
    actual = (actual as Record<string, unknown>)[clave];
  }
  return actual;
}

function comparar(a: number, op: "==" | ">=" | "<=", b: number): boolean {
  return op === "==" ? a === b : op === ">=" ? a >= b : a <= b;
}

export interface VerificarHttpRequest {
  readonly criterio: string;
  readonly config: QaHttpConfig | null;
  readonly entorno?: Readonly<Record<string, string | undefined>>;
  readonly fetch?: typeof fetch;
}

/** Verifica un criterio http contra el host de la configuración. */
export async function verificarCriterioHttp(request: VerificarHttpRequest): Promise<ResultadoHttp> {
  if (request.config === null) return rechazo(SIN_QA_HTTP);
  let peticion: PeticionHttp;
  try {
    peticion = parsearCriterioHttp(request.criterio);
  } catch (error) {
    return rechazo(error instanceof Error ? error.message : String(error));
  }
  const { config } = request;
  if (!config.methods.includes(peticion.metodo)) {
    return rechazo(`El método ${peticion.metodo} no está declarado en qa-http.methods (${config.methods.join(", ")}).`);
  }

  // El host sale de la configuración y nunca del ticket: el primero de la lista.
  const base = new URL(config.hosts[0] as string);
  const prefijo = base.pathname.replace(/\/$/, "");
  const destino = new URL(`${prefijo}${peticion.ruta}`, base.origin);
  if (destino.origin !== base.origin || !destino.pathname.startsWith(prefijo === "" ? "/" : prefijo)) {
    return rechazo(`La ruta sale del host o del prefijo permitido (${base.origin}${prefijo}).`);
  }
  const resumen = { metodo: peticion.metodo, url: `${destino.origin}${destino.pathname}${destino.search}` };

  const cabeceras: Record<string, string> = { Accept: "application/json" };
  if (config.credentialEnv !== null) {
    const credencial = (request.entorno ?? process.env)[config.credentialEnv];
    if (credencial === undefined || credencial === "") {
      return rechazo(`La credencial no está disponible: falta la variable de entorno ${config.credentialEnv}.`, resumen);
    }
    cabeceras["Authorization"] = `Bearer ${credencial}`;
  }

  const inicio = Date.now();
  let respuesta: Response;
  try {
    respuesta = await (request.fetch ?? fetch)(destino, {
      method: peticion.metodo,
      headers: cabeceras,
      // Una redirección a otro host sería la forma de saltarse la lista: no se sigue.
      redirect: "manual",
      signal: AbortSignal.timeout(Math.round(config.timeoutSeconds * 1000)),
    });
  } catch (error) {
    return rechazo(`La petición falló: ${error instanceof Error ? error.message : String(error)}`, resumen);
  }
  const bytes = Buffer.from(await respuesta.arrayBuffer());
  const latenciaMs = Date.now() - inicio;
  const bodySha256 = createHash("sha256").update(bytes).digest("hex");

  let json: unknown;
  let jsonLegible = true;
  try {
    json = JSON.parse(bytes.toString("utf8"));
  } catch {
    jsonLegible = false;
  }

  const resultados: ResultadoDeAsercion[] = peticion.aserciones.map((a) => {
    if (a.tipo === "status") {
      return { expresion: a.texto, cumplida: respuesta.status === a.valor, observado: `status=${respuesta.status}` };
    }
    if (!jsonLegible) return { expresion: a.texto, cumplida: false, observado: "el cuerpo no es JSON" };
    const valor = valorEn(json, a.ruta);
    if (a.tipo === "largo") {
      const largo = Array.isArray(valor) ? valor.length : typeof valor === "string" ? valor.length : undefined;
      return {
        expresion: a.texto,
        cumplida: largo !== undefined && comparar(largo, a.operador, a.valor),
        observado: largo === undefined ? "no es una lista ni un texto" : `length=${largo}`,
      };
    }
    const igual = valor === a.valor;
    return {
      expresion: a.texto,
      cumplida: a.operador === "==" ? igual : !igual && valor !== undefined,
      observado: valor === undefined ? "la ruta no existe" : JSON.stringify(valor),
    };
  });

  return {
    estado: resultados.every((r) => r.cumplida) ? "cumplido" : "incumplido",
    motivo: null,
    peticion: resumen,
    // Solo status, latencia y hash del cuerpo: nunca cabeceras de autenticación ni cookies.
    respuesta: { status: respuesta.status, latenciaMs, bodySha256, bodyBytes: bytes.length },
    aserciones: resultados,
  };
}
