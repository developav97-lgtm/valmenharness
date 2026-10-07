#!/usr/bin/env node
/**
 * Mide la salida de los sprints S1 a S3 sobre uno o varios registros (R-CPRE-011).
 *
 * Para cada `--root` corre `valmen validate --all` y `valmen precision` y arma un informe en
 * Markdown: cuántos tickets validan y la precisión por compuerta y evaluador. Es de **solo
 * lectura**: no escribe en ningún registro, así que se puede apuntar al de otro proyecto.
 *
 * Uso: node scripts/medir-salida-s1-s3.mjs --root <ruta> [--root <ruta> ...]
 * Sale con 3 si algún registro no valida.
 */
import { spawnSync } from "node:child_process";
import { basename } from "node:path";
import { pathToFileURL } from "node:url";

/** El ejecutor de verdad: llama al CLI `valmen` con la raíz dada. */
export function ejecutarValmen(root, argumentos) {
  const resultado = spawnSync("valmen", ["--root", root, ...argumentos], { encoding: "utf8" });
  return {
    status: resultado.status ?? 1,
    stdout: resultado.stdout ?? "",
    stderr: resultado.stderr ?? "",
  };
}

/**
 * Mide un registro.
 *
 * `ejecutar(root, argumentos)` es inyectable para probar sin el CLI.
 */
export function medirRegistro(root, ejecutar = ejecutarValmen) {
  const validacion = ejecutar(root, ["validate", "--all"]);
  const precision = ejecutar(root, ["precision"]);
  const validos = /Tickets válidos:\s*(\d+)/.exec(validacion.stdout)?.[1] ?? null;
  return {
    root,
    valida: validacion.status === 0,
    ticketsValidos: validos === null ? null : Number(validos),
    salidaDeValidacion: `${validacion.stdout}${validacion.stderr}`.trim(),
    precision: precision.status === 0 ? precision.stdout.trim() : "",
    errorDePrecision: precision.status === 0 ? "" : `${precision.stdout}${precision.stderr}`.trim(),
  };
}

/** El informe en Markdown de las mediciones. */
export function renderInforme(mediciones, fecha) {
  const partes = [`# Salida de S1 a S3 — medición del ${fecha}`, ""];
  for (const m of mediciones) {
    partes.push(`## Registro \`${basename(m.root)}\``, "", `Raíz: \`${m.root}\``, "");
    if (m.valida) {
      partes.push(`- Validación: **correcta** — ${m.ticketsValidos ?? "?"} tickets válidos.`);
    } else {
      partes.push(
        `- Validación: **FALLÓ** en el registro \`${m.root}\`. Salida:`,
        "",
        "```text",
        m.salidaDeValidacion,
        "```",
      );
    }
    partes.push("");
    if (m.precision !== "") {
      partes.push("Precisión de las compuertas:", "", "```text", m.precision, "```", "");
    } else if (m.errorDePrecision !== "") {
      partes.push(`Precisión: no se pudo calcular — ${m.errorDePrecision}`, "");
    }
  }
  return `${partes.join("\n")}\n`;
}

/** Mide todas las raíces y devuelve el informe y el código de salida. */
export function medirSalida(raices, ejecutar = ejecutarValmen, fecha = new Date().toISOString().slice(0, 10)) {
  const mediciones = raices.map((raiz) => medirRegistro(raiz, ejecutar));
  const fallidas = mediciones.filter((m) => !m.valida);
  return {
    informe: renderInforme(mediciones, fecha),
    exitCode: fallidas.length === 0 ? 0 : 3,
    mediciones,
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const raices = [];
  for (let i = 2; i < process.argv.length; i += 1) {
    if (process.argv[i] === "--root" && process.argv[i + 1] !== undefined) {
      raices.push(process.argv[i + 1]);
      i += 1;
    }
  }
  if (raices.length === 0) {
    process.stderr.write("Falta al menos un --root <ruta>.\n");
    process.exit(2);
  }
  const { informe, exitCode } = medirSalida(raices);
  process.stdout.write(informe);
  if (exitCode !== 0) process.stderr.write("Hay registros que no validan: ver el informe.\n");
  process.exit(exitCode);
}
