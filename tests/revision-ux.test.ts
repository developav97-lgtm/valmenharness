/**
 * La revisión de UX de un cambio con pantallas.
 *
 * Es evidencia, no un gate: lo que se afirma con más cuidado es que nunca falla por hallazgos, que
 * no escribe nada cuando el cambio no toca interfaz y que dice el estado real de cada skill en vez
 * de suponer que está habilitada.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { uxReviewCommand } from "../packages/cli/src/commands.js";
import {
  createTicket,
  hashDeContenidoDeSkill,
  registrarRevisionDeSkill,
  revisarUx,
  SKILLS_DE_UX,
  type RegistryPaths,
} from "../packages/engine/src/index.js";
import { callTool } from "../packages/mcp/src/tools.js";

const TICKET = "FEATURE-POS-PANTALLA-20261007";
let root: string;
let paths: RegistryPaths;

const git = (...args: string[]): void => {
  execFileSync("git", args, { cwd: root, stdio: "ignore" });
};
const escribir = (ruta: string, texto: string): void => {
  mkdirSync(join(root, ...ruta.split("/").slice(0, -1)), { recursive: true });
  writeFileSync(join(root, ...ruta.split("/")), texto, "utf8");
};
const ticketTexto = (): string => readFileSync(join(root, "tickets", "2026", TICKET, "ticket.md"), "utf8");
const evidencias = (): number => (ticketTexto().match(/"kind": "ux-review"/g) ?? []).length;

/** Declara las skills de UX que se pidan y deja habilitadas las que se indiquen. */
function declarar(skills: readonly { id: string; habilitar: boolean; contenido?: boolean }[]): void {
  const items: string[] = [];
  for (const { id, habilitar, contenido = true } of skills) {
    const dir = join(root, ".valmen", "external-skills", id);
    let hash = "a".repeat(64);
    if (contenido) {
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "SKILL.md"), `# ${id}\n`, "utf8");
      hash = hashDeContenidoDeSkill(dir) as string;
    }
    items.push(`  - id: ${id}`, `    source: https://example.com/${id}`, "    version: v1.0.0", `    sha256: ${hash}`);
  }
  writeFileSync(join(root, ".valmen", "config.yaml"), ["name: Demo", "external-skills:", ...items, ""].join("\n"), "utf8");
  for (const { id, habilitar } of skills) {
    if (habilitar) {
      registrarRevisionDeSkill({ root, id, actor: "Juan Andrade", quote: "Revisé el contenido", permissions: "ninguno", env: {} });
    }
  }
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "valmen-ux-"));
  paths = { root, ticketsDir: "tickets" };
  git("init", "-q");
  git("config", "user.email", "t@example.com");
  git("config", "user.name", "T");
  escribir("README.md", "demo\n");
  escribir("web/pantalla.html", "<p>hola</p>\n");
  git("add", "-A");
  git("commit", "-q", "-m", "base");
  createTicket({ paths, id: TICKET, title: "Pantalla de prueba", type: "FEATURE", module: "POS", request: "Una pantalla." });
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("la revisión de UX", () => {
  it("C1: con las dos skills habilitadas anexa una evidencia ux-review que las nombra", () => {
    declarar([{ id: SKILLS_DE_UX.diseno, habilitar: true }, { id: SKILLS_DE_UX.revision, habilitar: true }]);
    escribir("web/pantalla.html", "<p>hola</p>\n<p>nuevo</p>\n");
    const revision = revisarUx({ paths, ticketId: TICKET });
    expect(revision.conPantallas).toBe(true);
    expect(evidencias()).toBe(1);
    expect(revision.descripcion).toContain("web/pantalla.html");
    expect(revision.descripcion).toContain("ui-ux-pro-max habilitada");
    expect(revision.descripcion).toContain("impeccable habilitada");
  });

  it("C2: una skill no declarada, sin revisión o deshabilitada dice su estado y su motivo", () => {
    declarar([
      { id: SKILLS_DE_UX.diseno, habilitar: false },
      { id: SKILLS_DE_UX.revision, habilitar: true },
    ]);
    // Cambiar el contenido después de la revisión la deshabilita.
    writeFileSync(join(root, ".valmen", "external-skills", SKILLS_DE_UX.revision, "SKILL.md"), "# cambiado\n", "utf8");
    escribir("web/pantalla.html", "<p>otro</p>\n");
    const { descripcion } = revisarUx({ paths, ticketId: TICKET });
    expect(descripcion).toContain("ui-ux-pro-max sin-revisión (el contenido coincide con lo declarado");
    expect(descripcion).toContain("impeccable deshabilitada (el contenido cambió");

    declarar([{ id: SKILLS_DE_UX.revision, habilitar: false }]);
    expect(revisarUx({ paths, ticketId: TICKET }).descripcion).toContain("ui-ux-pro-max no declarada (el proyecto no la declara");
  });

  it("C3: cuenta los colores fijos y termina sin error", () => {
    escribir("web/pantalla.html", '<p style="color: #ff0000">hola</p>\n');
    const revision = revisarUx({ paths, ticketId: TICKET });
    expect(revision.colores).toBe(1);
    expect(revision.descripcion).toContain("1 color(es) fijo(s)");
    expect(evidencias()).toBe(1);
  });

  it("C4: un cambio sin archivos de interfaz no anexa evidencia", () => {
    escribir("README.md", "demo\ncambio\n");
    const antes = ticketTexto();
    const revision = revisarUx({ paths, ticketId: TICKET });
    expect(revision.conPantallas).toBe(false);
    expect(revision.evidencia).toBeNull();
    expect(ticketTexto()).toBe(antes);
  });

  it("C5: el informe de Impeccable que se pasa queda anotado en la evidencia", () => {
    escribir("web/pantalla.html", "<p>otro</p>\n");
    escribir("tickets/2026/FEATURE-POS-PANTALLA-20261007/impeccable.md", "# informe\n");
    revisarUx({ paths, ticketId: TICKET, informe: "tickets/2026/FEATURE-POS-PANTALLA-20261007/impeccable.md" });
    expect(ticketTexto()).toContain("Informe de Impeccable: tickets/2026/FEATURE-POS-PANTALLA-20261007/impeccable.md");
    // Un informe que no existe no se anota como si estuviera.
    expect(() => revisarUx({ paths, ticketId: TICKET, informe: "no-existe.md" })).toThrow(/no existe/);
  });

  it("C6: `ux review` sale con 0 aunque haya hallazgos", () => {
    escribir("web/pantalla.html", '<p style="color: #ff0000">hola</p>\n');
    const resultado = uxReviewCommand(paths, { id: TICKET });
    expect(resultado.exitCode).toBe(0);
    expect(resultado.stdout).toContain("1 color(es) fijo(s)");
    expect(evidencias()).toBe(1);
    expect(uxReviewCommand(paths, {}).exitCode).not.toBe(0);
  });

  it("C7: la herramienta revisar_ux anexa la misma evidencia que el comando", async () => {
    escribir("web/pantalla.html", '<p style="color: #ff0000">hola</p>\n');
    const resultado = await callTool({ paths }, "revisar_ux", { id: TICKET });
    expect(resultado.isError).not.toBe(true);
    expect(evidencias()).toBe(1);
    const comando = uxReviewCommand(paths, { id: TICKET });
    expect(resultado.text ?? JSON.stringify(resultado)).toContain(comando.stdout.split("\n")[0] as string);
  });
});
