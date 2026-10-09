/**
 * BUGFIX-SERVER-AGENTES-OBSOLETOS-Y-ESTADO-WORKTREE-20261009: el lector da por
 * terminado a un subagente que la sesión principal notificó como terminado aunque
 * su transcript no cierre con `end_turn`, y lee el estado del ticket de la copia
 * del worktree. Carpetas temporales, transcripts sintéticos y reloj inyectado.
 */
import { mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { choosePaths, nombresDeWorktree } from "../packages/engine/src/index.js";
import { finesDeSubagentes, leerAgentesDeCorrida } from "../packages/server/src/agentes.js";
import { type ServerContext, handleApi } from "../packages/server/src/server.js";
import { escribirSesionDeClaude } from "./helpers/claude.js";
import { writeFixtureTicket } from "./helpers/fixtures.js";

const TICKET = "FEATURE-SERVER-PRUEBA-AGENTES-20261008";
const RESUMEN = "RESUMEN-SENSIBLE-NO-DEBE-SALIR";
const SALIDA = "/private/tmp/SALIDA-SENSIBLE/a0.output";
const FIN = "2026-10-09T00:00:03.375Z";
const ULTIMO = "2026-10-09T00:00:01.576Z";
const RELOJ = Date.parse("2026-10-09T03:00:00.000Z");

let home: string;
let root: string;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "valmen-obsoletos-"));
  root = join(home, "proyecto");
  mkdirSync(join(root, ".valmen"), { recursive: true });
});
afterEach(() => rmSync(home, { recursive: true, force: true }));

const base = (tipo: string, timestamp: string) => ({ type: tipo, timestamp, cwd: "/work/ticket-a", gitBranch: "main" });

/** El caso real: último mensaje con `stop_reason: null` tras un Bash que ya tiene resultado. */
function transcriptDelCasoReal(ultimo = ULTIMO): string[] {
  return [
    JSON.stringify({ ...base("user", "2026-10-08T23:55:00.000Z"), message: { role: "user", content: `Implementa ${TICKET}` } }),
    JSON.stringify({
      ...base("assistant", "2026-10-08T23:58:08.000Z"),
      message: { role: "assistant", model: "claude-sonnet-5-5", stop_reason: "tool_use", content: [{ type: "tool_use", id: "b1", name: "Bash", input: { command: "ls" } }] },
    }),
    JSON.stringify({ ...base("user", "2026-10-08T23:58:09.000Z"), message: { role: "user", content: [{ type: "tool_result", tool_use_id: "b1", content: "ok" }] } }),
    JSON.stringify({
      ...base("assistant", ultimo),
      message: { role: "assistant", model: "claude-sonnet-5-5", stop_reason: null, content: [{ type: "text", text: "listo" }] },
    }),
  ];
}

const notificacion = (id: string, estado: string, timestamp = FIN): string =>
  JSON.stringify({
    type: "queue-operation",
    operation: "enqueue",
    timestamp,
    content: `<task-notification>\n<task-id>${id}</task-id>\n<output-file>${SALIDA}</output-file>\n<status>${estado}</status>\n<summary>${RESUMEN}</summary>\n</task-notification>`,
  });

const principalCon = (...extra: string[]): string[] => [
  JSON.stringify({ ...base("user", "2026-10-08T23:50:00.000Z"), message: { role: "user", content: "orquesta" } }),
  ...extra,
];

function sesion(agente: string[], principal: string[]): void {
  escribirSesionDeClaude(home, { root, id: "orq-1", lineas: principal, subagentes: [agente], modificado: new Date(RELOJ) });
}

const fila = (ahora = RELOJ) => leerAgentesDeCorrida(root, { home, ahora }).filter((a) => !a.principal)[0];

describe("agente terminado según la sesión principal", () => {
  it("C1/C2: el caso real (stop_reason null + notificación completed posterior) sale termino", () => {
    sesion(transcriptDelCasoReal(), principalCon(notificacion("a0", "completed")));
    expect(fila()?.estado).toBe("termino");
  });

  it("C3: control, el mismo transcript sin la notificación sigue esperando", () => {
    sesion(transcriptDelCasoReal(), principalCon());
    expect(fila()?.estado).toBe("esperando");
  });

  it.each(["failed", "killed", "stopped"])("C4-C6: la notificación %s deja la fila en termino", (estado) => {
    sesion(transcriptDelCasoReal(), principalCon(notificacion("a0", estado)));
    expect(fila()?.estado).toBe("termino");
  });

  it("C7: una notificación running no cambia el estado del transcript", () => {
    sesion(transcriptDelCasoReal(), principalCon(notificacion("a0", "running")));
    expect(fila()?.estado).toBe("esperando");
  });

  it("C8: un subagente reanudado (eventos posteriores a la notificación) sale trabajando", () => {
    const ahora = Date.parse("2026-10-09T00:10:00.000Z");
    sesion(transcriptDelCasoReal("2026-10-09T00:09:50.000Z"), principalCon(notificacion("a0", "completed")));
    expect(fila(ahora)?.estado).toBe("trabajando");
  });

  it("C9: la notificación de otro task-id no cambia la fila", () => {
    sesion(transcriptDelCasoReal(), principalCon(notificacion("zzz", "completed")));
    expect(fila()?.estado).toBe("esperando");
  });

  it("también se lee la notificación como mensaje de usuario y se tolera una línea cortada", () => {
    const comoUsuario = JSON.stringify({
      ...base("user", FIN),
      message: { role: "user", content: `<task-notification>\n<task-id>a0</task-id>\n<status>completed</status>\n</task-notification>` },
    });
    const fines = finesDeSubagentes([comoUsuario, '{"type":"queue-operation","timestamp":"2026-10-09T0'].join("\n"));
    expect(fines.get("a0")).toBe(Date.parse(FIN));
    expect(fines.size).toBe(1);
  });

  it("C10: la respuesta del endpoint no trae el summary ni la output-file", async () => {
    sesion(transcriptDelCasoReal(), principalCon(notificacion("a0", "completed")));
    const ctx: ServerContext = { root, credentialsFile: join(home, "c"), bindingsFile: join(home, "b.yaml"), env: {}, home };
    // El endpoint usa el reloj real: se fija la fecha para que el transcript no salga de la ventana de 24 h.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(RELOJ);
    let r: Awaited<ReturnType<typeof handleApi>>;
    try {
      r = await handleApi("GET", "/api/corrida/agentes", {}, ctx);
    } finally {
      vi.useRealTimers();
    }
    const texto = JSON.stringify(r.body);
    expect(texto).not.toContain(RESUMEN);
    expect(texto).not.toContain("SALIDA-SENSIBLE");
    expect(texto).toContain('"estado":"termino"');
  });
});

describe("estado del ticket desde el worktree", () => {
  const rutaWorktree = (): string => join(root, nombresDeWorktree(TICKET).carpeta);
  const ticketEstado = (): string | null | undefined => {
    sesion(transcriptDelCasoReal(), principalCon());
    return leerAgentesDeCorrida(root, { home, ahora: RELOJ, paths: choosePaths(root) }).filter((a) => !a.principal)[0]?.ticketEstado;
  };

  it("C11: con el ticket en planned en el worktree y en intake en el principal, trae planned", () => {
    writeFixtureTicket(root, { id: TICKET, workflowStatus: "intake" });
    writeFixtureTicket(rutaWorktree(), { id: TICKET, workflowStatus: "planned" });
    expect(ticketEstado()).toBe("planned");
  });

  it("C12: sin worktree trae el estado del principal", () => {
    writeFixtureTicket(root, { id: TICKET, workflowStatus: "intake" });
    expect(ticketEstado()).toBe("intake");
  });

  it("C13: con la carpeta del worktree y sin el ticket, trae el del principal sin error", () => {
    writeFixtureTicket(root, { id: TICKET, workflowStatus: "intake" });
    mkdirSync(join(rutaWorktree(), "tickets"), { recursive: true });
    expect(ticketEstado()).toBe("intake");
  });

  it("C14: leer la corrida no cambia el mtime de ningún archivo", () => {
    writeFixtureTicket(root, { id: TICKET, workflowStatus: "intake" });
    writeFixtureTicket(rutaWorktree(), { id: TICKET, workflowStatus: "planned" });
    sesion(transcriptDelCasoReal(), principalCon(notificacion("a0", "completed")));
    const viejo = new Date("2026-01-01T00:00:00.000Z");
    const archivos = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? archivos(join(dir, e.name)) : [join(dir, e.name)]));
    for (const a of archivos(root)) utimesSync(a, viejo, viejo);
    const antes = archivos(root).map((a) => [a, statSync(a).mtimeMs]);
    leerAgentesDeCorrida(root, { home, ahora: RELOJ, paths: choosePaths(root) });
    expect(archivos(root).map((a) => [a, statSync(a).mtimeMs])).toEqual(antes);
  });

  it("C15: GET /api/tickets sigue devolviendo el estado del principal con el worktree en planned", async () => {
    writeFixtureTicket(root, { id: TICKET, workflowStatus: "intake" });
    writeFixtureTicket(rutaWorktree(), { id: TICKET, workflowStatus: "planned" });
    const ctx: ServerContext = { root, credentialsFile: join(home, "c"), bindingsFile: join(home, "b.yaml"), env: {}, home };
    const r = await handleApi("GET", "/api/tickets", {}, ctx);
    const filas = JSON.stringify(r.body);
    expect(filas).toContain('"workflowStatus":"intake"');
    expect(filas).not.toContain('"workflowStatus":"planned"');
  });
});
