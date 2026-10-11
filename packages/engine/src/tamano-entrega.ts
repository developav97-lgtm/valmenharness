/**
 * El tamaño de la entrega de un ticket (R-ENT-001, R-ENT-002): líneas añadidas y borradas de lo que
 * el ticket cambia en el código, sin contar el registro del harness ni los archivos generados.
 * Pasar el tope configurado avisa y nunca bloquea.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { type YamlMap, type YamlValue, parseYamlSubset } from "@valmen/core";

/** El tope orientativo de líneas cuando `config.yaml` no declara `delivery-budget`. */
export const TOPE_DE_ENTREGA_POR_DEFECTO = 400;

/** Archivos que `valmen sync` o el gestor de paquetes generan: no son trabajo del ticket. */
const GENERADOS = new Set(["AGENTS.md", "CLAUDE.md", "package-lock.json"]);

export interface EntregaMedida {
  readonly añadidas: number;
  readonly borradas: number;
  readonly total: number;
}

export interface EntregaRegistrada extends EntregaMedida {
  readonly tope: number;
  readonly pasaElTope: boolean;
}

const noCuenta = (ruta: string): boolean =>
  ruta.startsWith(".valmen/") || ruta.startsWith("tickets/") || GENERADOS.has(ruta);

/**
 * Mide la salida de `git diff --numstat -z`: `<añadidas>\t<borradas>\t<ruta>\0`, y en un renombre
 * `<añadidas>\t<borradas>\t\0<origen>\0<destino>\0`. Un binario (`-`) cuenta 0.
 */
export function medirEntrega(salidaNumstatZ: string): EntregaMedida {
  const campos = salidaNumstatZ.split("\0");
  let añadidas = 0;
  let borradas = 0;
  for (let i = 0; i < campos.length; i++) {
    const campo = campos[i]!;
    if (campo === "") continue;
    const [a = "", b = "", ...resto] = campo.split("\t");
    let ruta = resto.join("\t");
    if (ruta === "") {
      i += 2; // renombre: dos rutas, origen y destino
      ruta = campos[i] ?? "";
    }
    if (noCuenta(ruta)) continue;
    añadidas += a === "-" ? 0 : Number.parseInt(a, 10) || 0;
    borradas += b === "-" ? 0 : Number.parseInt(b, 10) || 0;
  }
  return { añadidas, borradas, total: añadidas + borradas };
}

/** `delivery-budget` de `.valmen/config.yaml` (líneas); 400 sin la clave o con un valor no positivo. */
export function topeDeEntrega(root: string): number {
  try {
    const documento: YamlValue = parseYamlSubset(
      readFileSync(join(root, ".valmen", "config.yaml"), "utf8"),
      { fileName: ".valmen/config.yaml" },
    );
    if (typeof documento !== "object" || Array.isArray(documento))
      return TOPE_DE_ENTREGA_POR_DEFECTO;
    const bruto = (documento as YamlMap)["delivery-budget"];
    const lineas = typeof bruto === "number" ? bruto : Number.parseInt(String(bruto), 10);
    return Number.isFinite(lineas) && lineas > 0
      ? Math.round(lineas)
      : TOPE_DE_ENTREGA_POR_DEFECTO;
  } catch {
    return TOPE_DE_ENTREGA_POR_DEFECTO;
  }
}

/** Mide y compara con el tope en una sola pieza: lo que se registra en el evento. */
export function registrarEntrega(salidaNumstatZ: string, root: string): EntregaRegistrada {
  const medida = medirEntrega(salidaNumstatZ);
  const tope = topeDeEntrega(root);
  return { ...medida, tope, pasaElTope: medida.total > tope };
}

export function textoDelAviso(ticketId: string, entrega: EntregaRegistrada): string {
  return `La entrega de ${ticketId} suma ${entrega.total} líneas (+${entrega.añadidas} −${entrega.borradas}), más que el tope de ${entrega.tope}. La integración sigue.`;
}

/** El evento `delivery-size` más reciente de un ticket, o `null`. */
export function entregaDeLosEventos(
  eventos: readonly { readonly action?: unknown; readonly details?: unknown }[],
): (EntregaRegistrada & { readonly via: string }) | null {
  for (let i = eventos.length - 1; i >= 0; i--) {
    const e = eventos[i]!;
    if (e.action !== "delivery-size" || typeof e.details !== "string") continue;
    try {
      const v = JSON.parse(e.details) as Record<string, unknown>;
      if (
        typeof v["añadidas"] === "number" &&
        typeof v["borradas"] === "number" &&
        typeof v["total"] === "number" &&
        typeof v["tope"] === "number"
      )
        return {
          añadidas: v["añadidas"],
          borradas: v["borradas"],
          total: v["total"],
          tope: v["tope"],
          pasaElTope: v["pasaElTope"] === true,
          via: String(v["via"] ?? ""),
        };
    } catch {
      // un evento ilegible no tumba el parte
    }
  }
  return null;
}

/** El texto (JSON) de `details` del evento `delivery-size`. */
export function textoDelEvento(
  entrega: EntregaRegistrada,
  via: "worktree" | "jornada",
): string {
  return JSON.stringify({
    añadidas: entrega.añadidas,
    borradas: entrega.borradas,
    total: entrega.total,
    tope: entrega.tope,
    pasaElTope: entrega.pasaElTope,
    via,
  });
}
