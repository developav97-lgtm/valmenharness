/**
 * La tarea periódica que avanza la jornada (launchd en macOS), preparada y no ejecutada.
 *
 * Instalar un disparador es persistente en la máquina: este módulo **prepara** el plist y
 * dice los comandos exactos, y escribe el archivo solo cuando se lo piden. Activar la tarea
 * (`launchctl bootstrap`) lo hace una persona; el harness nunca lo ejecuta por su cuenta.
 */
import { chmodSync, mkdirSync } from "node:fs";
import { join } from "node:path";

import { atomicWrite } from "@valmen/core";

/** La etiqueta de launchd de un proyecto. */
export function etiquetaDelDisparador(projectId: string): string {
  return `com.valmen.jornada.${projectId}`;
}

function escaparXml(texto: string): string {
  return texto.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

export interface DisparadorRequest {
  readonly projectId: string;
  readonly everyMinutes: number;
  /** El intérprete y el script del CLI que lanzará launchd. */
  readonly node: string;
  readonly cliMain: string;
  readonly logDir: string;
}

/** El plist de launchd que corre `journey advance` cada N minutos. */
export function renderLaunchdPlist(request: DisparadorRequest): string {
  const argumentos = [request.node, request.cliMain, "journey", "advance", "--project", request.projectId];
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
    '<plist version="1.0">',
    "<dict>",
    "  <key>Label</key>",
    `  <string>${escaparXml(etiquetaDelDisparador(request.projectId))}</string>`,
    "  <key>ProgramArguments</key>",
    "  <array>",
    ...argumentos.map((argumento) => `    <string>${escaparXml(argumento)}</string>`),
    "  </array>",
    "  <key>StartInterval</key>",
    `  <integer>${Math.round(request.everyMinutes * 60)}</integer>`,
    "  <key>RunAtLoad</key>",
    "  <false/>",
    "  <key>StandardOutPath</key>",
    `  <string>${escaparXml(join(request.logDir, `valmen-jornada-${request.projectId}.log`))}</string>`,
    "  <key>StandardErrorPath</key>",
    `  <string>${escaparXml(join(request.logDir, `valmen-jornada-${request.projectId}.err.log`))}</string>`,
    "</dict>",
    "</plist>",
    "",
  ].join("\n");
}

/** Los comandos que activan y desactivan la tarea, para que los ejecute una persona. */
export function instruccionesDelDisparador(projectId: string, rutaPlist: string): string {
  return [
    "Para activarla (lo ejecutas tú; el harness no corre launchctl):",
    `  launchctl bootstrap gui/$(id -u) ${rutaPlist}`,
    "Para desactivarla:",
    `  launchctl bootout gui/$(id -u) ${rutaPlist}`,
    `Etiqueta: ${etiquetaDelDisparador(projectId)}`,
  ].join("\n");
}

/** Escribe solo el archivo del plist; devuelve su ruta. No activa nada. */
export function escribirPlist(directorio: string, request: DisparadorRequest): string {
  mkdirSync(directorio, { recursive: true });
  const ruta = join(directorio, `${etiquetaDelDisparador(request.projectId)}.plist`);
  atomicWrite(ruta, renderLaunchdPlist(request));
  return ruta;
}

/** El nombre del job de Hermes de un proyecto. */
export function nombreDelJobHermes(projectId: string): string {
  return `valmen-jornada-${projectId}`;
}

/**
 * El script del job de Hermes sin agente: ejecuta `journey advance` y nada más.
 *
 * No lleva credenciales ni llama a ningún modelo; el avance conserva sus topes, paradas y autorización.
 */
export function renderHermesJobScript(request: DisparadorRequest): string {
  const comillas = (texto: string): string => `'${texto.replaceAll("'", "'\\''")}'`;
  return [
    "#!/usr/bin/env bash",
    `# Job de Hermes sin agente (--no-agent): avanza la jornada de ${request.projectId}. Generado por \`valmen journey install-trigger\`.`,
    "set -uo pipefail",
    `exec ${comillas(request.node)} ${comillas(request.cliMain)} journey advance --project ${comillas(request.projectId)}`,
    "",
  ].join("\n");
}

/** El comando exacto que registra el job en Hermes; lo ejecuta una persona. */
export function comandoDeJobHermes(projectId: string, everyMinutes: number, rutaScript: string): string {
  return `hermes cron create --no-agent --name ${nombreDelJobHermes(projectId)} --script ${rutaScript} "every ${Math.round(everyMinutes)}m"`;
}

/** Escribe solo el script del job (ejecutable); devuelve su ruta. No registra nada en Hermes. */
export function escribirScriptHermes(directorio: string, request: DisparadorRequest): string {
  mkdirSync(directorio, { recursive: true });
  const ruta = join(directorio, `${nombreDelJobHermes(request.projectId)}.sh`);
  atomicWrite(ruta, renderHermesJobScript(request));
  chmodSync(ruta, 0o755);
  return ruta;
}
