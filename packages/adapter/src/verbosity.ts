/**
 * La verbosidad de los clientes que la admiten en la configuración del proyecto
 * (R-RESP-007).
 *
 * Solo Codex tiene hoy una clave documentada —`model_verbosity` en
 * `.codex/config.toml`—. OpenCode no declara una opción de verbosidad en
 * `opencode.json` que valga para cualquier modelo (la de los modelos de OpenAI es
 * del proveedor, no del cliente), así que no se le proyecta nada: inventar una
 * clave que el cliente ignora es peor que no tenerla.
 *
 * El archivo lo comparte la persona, así que se **fusiona** como texto: si ya trae
 * `model_verbosity` en el nivel superior, su valor se respeta; si no, se agrega
 * antes de la primera sección, que es donde TOML admite una clave de nivel
 * superior.
 */
import { fail } from "@valmen/core";

import { type ConfigMap, readString } from "./config.js";

export const CODEX_CONFIG_PATH = ".codex/config.toml";

/** Valores admitidos por la clave `codex-verbosity` de `config.yaml`; `off` no proyecta. */
export const CODEX_VERBOSITY_VALUES = ["low", "medium", "high", "off"] as const;
export type CodexVerbosity = (typeof CODEX_VERBOSITY_VALUES)[number];

/** Lee `codex-verbosity`; sin la clave vale `low`. Un valor desconocido falla. */
export function readCodexVerbosity(config: ConfigMap): CodexVerbosity {
  const valor = readString(config, "codex-verbosity", "low");
  if (!(CODEX_VERBOSITY_VALUES as readonly string[]).includes(valor)) {
    fail(
      `config.yaml: "codex-verbosity" debe ser uno de ${CODEX_VERBOSITY_VALUES.join(", ")}; ` +
        `recibí «${valor}».`,
    );
  }
  return valor as CodexVerbosity;
}

/** El `.codex/config.toml` con `model_verbosity`, sin pisar lo que ya hay. */
export function mergeCodexVerbosity(actual: string | null, valor: string): string {
  const linea = `model_verbosity = "${valor}"`;
  if (actual === null || actual.trim() === "") return `${linea}\n`;

  const lineas = actual.split("\n");
  const primeraSeccion = lineas.findIndex((texto) => /^\s*\[/.test(texto));
  const nivelSuperior = primeraSeccion === -1 ? lineas : lineas.slice(0, primeraSeccion);
  // Una clave ya declarada es una decisión de la persona, valga lo que valga.
  if (nivelSuperior.some((texto) => /^\s*model_verbosity\s*=/.test(texto))) return actual;

  if (primeraSeccion === -1) return `${actual.replace(/\s*$/, "")}\n${linea}\n`;
  const antes = lineas.slice(0, primeraSeccion).join("\n").replace(/\s*$/, "");
  const despues = lineas.slice(primeraSeccion).join("\n");
  return `${antes === "" ? "" : `${antes}\n`}${linea}\n\n${despues}`;
}
