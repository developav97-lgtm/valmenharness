/**
 * La referencia `worktree` (hash de QA) con el registro en `docs/tickets/` y la rama base `dev`
 * (BUGFIX-ENGINE-WORKTREE-RAMA-BASE-20261014).
 *
 * Antes del arreglo el diff solo descartaba `tickets/`: el ticket.md modificado de `docs/tickets/`
 * entraba al hash y se rechazaba; y con el árbol limpio no había archivos que hashear.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { EXIT_REFERENCE, parseTicket, toFailure } from "@valmen/core";
import { addEvidence } from "../packages/engine/src/append.js";
import { renderFixtureTicket } from "./helpers/fixtures.js";

const TICKET = "BUGFIX-QA-REGISTRO-DOCS-20261014";

let lab: string | undefined;
afterEach(() => {
  if (lab !== undefined) rmSync(lab, { recursive: true, force: true });
  lab = undefined;
});

/** El hash del contrato sobre los archivos dados, leídos del disco. */
function hashDe(root: string, archivos: readonly string[]): string {
  const hash = createHash("sha256");
  for (const relativa of [...archivos].sort()) {
    const ruta = Buffer.from(relativa, "utf8");
    const bytes = readFileSync(join(root, relativa));
    const largoRuta = Buffer.alloc(8);
    largoRuta.writeBigUInt64BE(BigInt(ruta.length));
    const largoContenido = Buffer.alloc(8);
    largoContenido.writeBigUInt64BE(BigInt(bytes.length));
    hash.update(largoRuta);
    hash.update(ruta);
    hash.update(largoContenido);
    hash.update(bytes);
  }
  return `worktree:sha256:${hash.digest("hex")}`;
}

/** Un repositorio sobre `dev` con el registro en `ticketsDir` y el ticket commiteado. */
function preparar(ticketsDir: string) {
  const root = mkdtempSync(join(tmpdir(), "valmen-ref-registro-"));
  lab = root;
  const git = (...args: string[]) =>
    execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
  mkdirSync(join(root, ".valmen"), { recursive: true });
  writeFileSync(
    join(root, ".valmen", "config.yaml"),
    `tickets-dir: ${ticketsDir}\nexecution:\n  base-branch: dev\n`,
  );
  const ticketPath = join(root, ticketsDir, "2026", TICKET, "ticket.md");
  mkdirSync(join(root, ticketsDir, "2026", TICKET), { recursive: true });
  writeFileSync(ticketPath, renderFixtureTicket({ id: TICKET, type: "BUGFIX", module: "QA", workflowStatus: "in_progress" }));
  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(join(root, "src", "a.ts"), "export const a = 1;\n");
  writeFileSync(join(root, "src", "b.ts"), "export const b = 1;\n");
  git("init", "-q", "-b", "dev");
  git("config", "user.email", "lab@valmen");
  git("config", "user.name", "Lab");
  git("add", "-A");
  git("commit", "-q", "-m", "base");
  const paths = { root, ticketsDir };
  const evidencia = (descripcion: string) =>
    addEvidence({ paths, ticketId: TICKET, kind: "test", description: descripcion, reference: "worktree" });
  const ultimaReferencia = () => {
    const bloque = parseTicket(readFileSync(ticketPath, "utf8")).blocks.Evidencia ?? [];
    return bloque[bloque.length - 1]?.reference;
  };
  return { root, git, ticketPath, evidencia, ultimaReferencia };
}

describe("referencia worktree con el registro del proyecto", () => {
  it.each(["docs/tickets", "tickets"])(
    "con el ticket.md de %s modificado, el hash cubre solo los archivos funcionales (C11 y regresión)",
    (registro) => {
      const r = preparar(registro);
      writeFileSync(join(r.root, "src", "a.ts"), "export const a = 2;\n");
      r.evidencia("primera");
      // El ticket.md ya está modificado: la segunda evidencia lo encuentra en el diff.
      r.evidencia("segunda");
      expect(r.ultimaReferencia()).toBe(hashDe(r.root, ["src/a.ts"]));
    },
  );

  it("con el árbol limpio, cubre lo que la rama del ticket cambió desde la base (C12)", () => {
    const r = preparar("docs/tickets");
    r.git("switch", "-q", "-c", "valmen/ticket-registro");
    writeFileSync(join(r.root, "src", "b.ts"), "export const b = 2;\n");
    writeFileSync(r.ticketPath, readFileSync(r.ticketPath, "utf8").replace("Pendiente.", "Hecho."));
    r.git("add", "-A");
    r.git("commit", "-q", "-m", "fix: b");
    r.evidencia("tras el commit");
    expect(r.ultimaReferencia()).toBe(hashDe(r.root, ["src/b.ts"]));
  });

  it("sin cambios ni commits sobre la base sigue fallando con salida 5 (C13)", () => {
    const r = preparar("docs/tickets");
    let fallo: unknown;
    try {
      r.evidencia("nada");
    } catch (caught) {
      fallo = caught;
    }
    expect(fallo).toBeDefined();
    const failure = toFailure(fallo);
    expect(failure.exitCode).toBe(EXIT_REFERENCE);
    expect(failure.message).toContain("No hay archivos funcionales modificados para calcular el hash.");
  });
});
