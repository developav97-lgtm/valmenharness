/**
 * La compuerta `qa-agent` (R-QAAG-003, R-QAAG-004 y R-QAAG-005).
 *
 * Prueba un ticket elegible en un `git worktree` limpio, creado desde el commit entregado, con la
 * configuración y los scripts de pruebas del commit **base** —lo que el agente haya editado en su
 * árbol de trabajo no cuenta— y solo con los comandos exactos que el base autoriza. En un BUGFIX
 * exige que las pruebas nuevas fallen contra el base. Deja un recibo reproducible y elimina siempre
 * los worktrees. No cierra el ticket ni escribe en él: aprobar la compuerta no es aprobar la QA.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { parseConfig, readList, readQaAgentConfig, readString } from "@valmen/adapter";
import { parseTicket } from "@valmen/core";
import { commandChecksFor, extractCriteriaSpecs, partirComando } from "@valmen/gate";

import { type RegistryPaths, findTicket } from "./discovery.js";
import { ejecutarGitDeQaAgent, type EjecutorGitQa } from "./qa-agent-git.js";
import {
  type ComandoDeRecibo,
  type ReciboQaAgent,
  type ResultadoContraBase,
  registrarReciboQaAgent,
} from "./qa-agent-receipt.js";
import { elegibilidadQa, scriptsDeComandos } from "./qa-eligibility.js";

export interface EjecucionDeComando {
  readonly status: number;
  readonly stdout: string;
  readonly stderr: string;
}

/** Corre un comando sin shell, con entorno mínimo y tope de tiempo. Inyectable para pruebas. */
export type EjecutorDeComando = (
  programa: string,
  args: readonly string[],
  opciones: { readonly cwd: string; readonly timeoutMs: number },
) => EjecucionDeComando;

const ejecutarComandoDeVerdad: EjecutorDeComando = (programa, args, { cwd, timeoutMs }) => {
  const r = spawnSync(programa, [...args], {
    cwd,
    encoding: "utf8",
    timeout: timeoutMs,
    maxBuffer: 16 * 1024 * 1024,
    // Entorno mínimo: ningún secreto del proceso del agente llega a las pruebas.
    env: { PATH: process.env["PATH"] ?? "", HOME: process.env["HOME"] ?? "", LANG: "C.UTF-8", CI: "1" },
  });
  return { status: r.status ?? (r.error === undefined ? 1 : 124), stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
};

export interface QaAgentRequest {
  readonly paths: RegistryPaths;
  readonly ticketId: string;
  readonly base: string;
  readonly delivered: string;
  readonly ahora?: Date;
  readonly ejecutarGit?: EjecutorGitQa;
  readonly ejecutar?: EjecutorDeComando;
}

export interface ResultadoQaAgent {
  readonly verdict: "approve" | "block";
  readonly reasons: readonly string[];
  readonly recibo: ReciboQaAgent | null;
  readonly reciboPath: string | null;
}

const ES_PRUEBA = /(^|\/)(tests?|__tests__|spec)\/|\.(test|spec)\.[a-z]+$|(^|\/)test_[^/]*\.py$/i;
const COLA = 2000;

function sha(texto: string): string {
  return createHash("sha256").update(texto).digest("hex");
}

/** Corre la compuerta. Siempre elimina los worktrees que creó. */
export function correrQaAgent(request: QaAgentRequest): ResultadoQaAgent {
  const { paths, ticketId } = request;
  const ahora = request.ahora ?? new Date();
  const git = (args: readonly string[]) => ejecutarGitDeQaAgent(args, paths.root, request.ejecutarGit);
  const ejecutar = request.ejecutar ?? ejecutarComandoDeVerdad;
  const razones: string[] = [];

  const resolver = (ref: string): string => {
    const r = git(["rev-parse", ref]);
    if (r.status !== 0) throw new Error(`No se pudo resolver ${ref}: ${r.stderr.trim()}`);
    return r.stdout.trim();
  };
  const base = resolver(request.base);
  const delivered = resolver(request.delivered);
  const treeHash = resolver(`${delivered}^{tree}`);

  const ubicado = findTicket(paths, ticketId);
  if (ubicado === undefined) throw new Error(`No existe el ticket ${ticketId}.`);
  const ticket = parseTicket(ubicado.text);

  const lineasDelDiff = (filtro: string[]): string[] => {
    const r = git(["diff", "--name-only", ...filtro, `${base}..${delivered}`]);
    if (r.status !== 0) throw new Error(`git diff falló: ${r.stderr.trim()}`);
    return r.stdout.split("\n").map((l) => l.trim()).filter((l) => l !== "");
  };
  const archivosDelDiff = lineasDelDiff([]);

  const cerrar = (
    verdict: "approve" | "block",
    comandos: readonly ComandoDeRecibo[],
    contraBase: ResultadoContraBase,
    autorizacion: ReciboQaAgent["authorization"],
  ): ResultadoQaAgent => {
    const recibo: ReciboQaAgent = {
      kind: "qa-agent-receipt",
      ticketId,
      base,
      delivered,
      treeHash,
      verdict,
      reasons: razones,
      commands: comandos,
      resultadoContraBase: contraBase,
      authorization: autorizacion,
      at: ahora.toISOString(),
    };
    return { verdict, reasons: razones, recibo, reciboPath: registrarReciboQaAgent(paths.root, recibo) };
  };

  // La elegibilidad va primero: un ticket que no lo es no corre nada.
  const elegibilidad = elegibilidadQa({ paths, ticketId, ahora, archivosDelDiff });
  if (!elegibilidad.elegible) {
    for (const r of elegibilidad.reglas.filter((x) => !x.cumple)) razones.push(`no elegible (${r.regla}): ${r.detalle}`);
    return cerrar("block", [], "no-aplica", elegibilidad.autorizacion);
  }

  // La configuración que manda es la del commit base.
  const mostrar = (commit: string, ruta: string): string | null => {
    const r = git(["show", `${commit}:${ruta}`]);
    return r.status === 0 ? r.stdout : null;
  };
  const textoConfig = mostrar(base, ".valmen/config.yaml");
  if (textoConfig === null) {
    razones.push("el commit base no tiene .valmen/config.yaml: no hay comandos autorizados");
    return cerrar("block", [], "no-aplica", elegibilidad.autorizacion);
  }
  const config = parseConfig(textoConfig);
  const permitidos = readList(config, "test-commands", []);
  const segundos = Number(readString(config, "test-timeout", "30"));
  const timeoutMs = (Number.isFinite(segundos) && segundos > 0 ? segundos : 30) * 1000;
  const regresion = readQaAgentConfig(config).regressionCommands;

  const criterios = extractCriteriaSpecs(ticket.sections["Criterios de aceptación"] ?? "");
  const { checks, refused } = commandChecksFor(criterios, permitidos, timeoutMs, null);
  for (const r of refused) razones.push(`comando no autorizado por el proyecto: ${r}`);
  for (const comando of regresion) {
    const partes = partirComando(comando);
    const autorizado = partes.length > 0 && permitidos.some((p) => {
      const esperado = partirComando(p);
      return esperado.length > 0 && esperado.length <= partes.length && esperado.every((x, i) => x === partes[i]);
    });
    if (!autorizado) razones.push(`la regresión «${comando}» no está autorizada en test-commands`);
  }
  if (checks.length === 0) razones.push("ningún criterio declara un comando de prueba autorizado");
  const esBugfix = ticket.fields.type === "BUGFIX";
  if (esBugfix && regresion.length === 0) razones.push("un BUGFIX exige la suite de regresión declarada en qa-agent.regression-commands");
  if (razones.length > 0) return cerrar("block", [], "no-aplica", elegibilidad.autorizacion);

  const comandos: ComandoDeRecibo[] = [];
  const correr = (fase: ComandoDeRecibo["fase"], cwd: string, programa: string, args: readonly string[]): number => {
    const inicio = Date.now();
    const r = ejecutar(programa, args, { cwd, timeoutMs });
    const salida = `${r.stdout}${r.stderr}`;
    comandos.push({
      fase,
      invocacion: [programa, ...args].join(" "),
      exitCode: r.status,
      durationMs: Date.now() - inicio,
      tail: salida.slice(-COLA),
      outputSha256: sha(salida),
    });
    return r.status;
  };

  const tmp = mkdtempSync(join(tmpdir(), "valmen-qa-agent-"));
  const creados: string[] = [];
  let contraBase: ResultadoContraBase = "no-aplica";
  try {
    const crearWorktree = (nombre: string, commit: string): string => {
      const carpeta = join(tmp, nombre);
      const r = git(["worktree", "add", "--detach", carpeta, commit]);
      if (r.status !== 0) throw new Error(`No se pudo crear el worktree ${nombre}: ${r.stderr.trim()}`);
      creados.push(carpeta);
      return carpeta;
    };
    // Las pruebas corren con la configuración y los scripts del commit base.
    const imponerBase = (carpeta: string): void => {
      const rutas = [".valmen/config.yaml", ...scriptsDeComandos(permitidos)];
      for (const ruta of rutas) {
        const contenido = mostrar(base, ruta);
        const destino = join(carpeta, ruta);
        if (contenido === null) {
          rmSync(destino, { force: true });
          continue;
        }
        mkdirSync(dirname(destino), { recursive: true });
        writeFileSync(destino, contenido, "utf8");
      }
    };

    const entregado = crearWorktree("entregado", delivered);
    imponerBase(entregado);
    for (const check of checks) {
      const codigo = correr("entregado", entregado, check.command, check.args ?? []);
      if (codigo !== (check.expectExitCode ?? 0)) razones.push(`${check.description}: el comando salió con ${codigo} contra el entregado`);
    }
    for (const comando of regresion) {
      const [programa, ...args] = partirComando(comando) as [string, ...string[]];
      const codigo = correr("regresion", entregado, programa, args);
      if (codigo !== 0) razones.push(`la regresión «${comando}» salió con ${codigo}`);
    }

    if (esBugfix) {
      const nuevas = lineasDelDiff(["--diff-filter=A"]).filter((f) => ES_PRUEBA.test(f));
      const referidos = checks.filter((c) => (c.args ?? []).some((a) => nuevas.includes(a)));
      if (nuevas.length === 0 || referidos.length === 0) {
        razones.push("un BUGFIX necesita una prueba nueva que un criterio ejecute: el diff no trae ninguna");
        contraBase = "no-reproduce-el-defecto";
      } else {
        const enBase = crearWorktree("base", base);
        imponerBase(enBase);
        for (const f of nuevas) {
          const destino = join(enBase, f);
          mkdirSync(dirname(destino), { recursive: true });
          copyFileSync(join(entregado, f), destino);
        }
        const codigos = referidos.map((c) => correr("base", enBase, c.command, c.args ?? []));
        if (codigos.some((c) => c !== 0)) {
          contraBase = "fallo-como-se-esperaba";
        } else {
          contraBase = "no-reproduce-el-defecto";
          razones.push("la prueba nueva pasa también contra el código base: no reproduce el defecto");
        }
      }
    }
  } catch (caught) {
    razones.push(`la compuerta no pudo completarse: ${caught instanceof Error ? caught.message : String(caught)}`);
  } finally {
    for (const carpeta of creados) git(["worktree", "remove", "--force", carpeta]);
    rmSync(tmp, { recursive: true, force: true });
  }
  return cerrar(razones.length === 0 ? "approve" : "block", comandos, contraBase, elegibilidad.autorizacion);
}
