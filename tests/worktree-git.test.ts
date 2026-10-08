/**
 * Las listas cerradas de los worktrees por ticket: nombres, git y procesos.
 */
import { describe, expect, it, vi } from "vitest";

import {
  ejecutarGitDeWorktree,
  ejecutarProcesoDeWorktree,
  exigirCheckoutPrincipal,
  motivoDeGitDeWorktree,
  motivoDeProcesoDeWorktree,
  nombresDeWorktree,
} from "../packages/engine/src/index.js";

const RAMA = "valmen/ticket-integracion-worktree";
const CARPETA = ".claude/worktrees/ticket-integracion-worktree";

describe("nombresDeWorktree", () => {
  it("deriva la carpeta y la rama del identificador, sin tipo, módulo ni fecha (C1)", () => {
    const n = nombresDeWorktree("FEATURE-ENGINE-INTEGRACION-WORKTREE-20261008");
    expect(n.carpeta).toBe(CARPETA);
    expect(n.rama).toBe(RAMA);
    expect(n.slug).toBe("integracion-worktree");
    expect(nombresDeWorktree("BUGFIX-WEB-LOGIN-20261001").rama).toBe("valmen/ticket-login");
    expect(nombresDeWorktree("CHORE-CLI-20261001").rama).toBe("valmen/ticket-cli");
  });

  it.each(["../FEATURE-X-Y-20261008", "FEATURE-X/Y-20261008", "FEATURE-X-..-20261008", "feature-x-y-20261008", "FEATURE-X-Y", "FEATURE-20261008", "", "FEATURE-X-Y-20261008/../a"])(
    "rechaza %j (C2)",
    (id) => {
      expect(() => nombresDeWorktree(id)).toThrow(/formato de ticket/);
    },
  );
});

describe("la lista cerrada de git de los worktrees", () => {
  it.each([
    ["status", "--porcelain", "-uall"],
    ["rev-parse", "--abbrev-ref", "HEAD"],
    ["rev-parse", "--git-dir"],
    ["rev-parse", "--git-common-dir"],
    ["rev-parse", RAMA],
    ["cat-file", "-e", "main:tickets/2026/X/ticket.md"],
    ["merge-base", "--is-ancestor", RAMA, "main"],
    ["worktree", "list", "--porcelain"],
    ["branch", "--list", RAMA],
    ["worktree", "add", "-b", RAMA, CARPETA, "main"],
    ["worktree", "remove", CARPETA],
    ["branch", "-d", RAMA],
  ])("admite %j", (...argumentos) => {
    expect(motivoDeGitDeWorktree(argumentos)).toBeNull();
  });

  it.each([
    ["push", "origin", "main"],
    ["fetch"],
    ["pull"],
    ["reset", "--hard"],
    ["reset", "HEAD~1"],
    ["rebase", "main"],
    ["clean", "-fd"],
    ["tag", "v1"],
    ["remote", "add", "x", "y"],
    ["checkout", "main"],
    ["merge", RAMA],
    ["-c", "core.hooksPath=/tmp", "status", "--porcelain"],
    ["branch", "-D", RAMA],
    ["branch", "-d", "main"],
    ["branch", "-d", RAMA, "--force"],
    ["worktree", "remove", "--force", CARPETA],
    ["worktree", "remove", "-f", CARPETA],
    ["worktree", "remove", "/etc"],
    ["worktree", "remove", ".claude/worktrees/../../x"],
    ["worktree", "add", "-b", RAMA, CARPETA, "otra"],
    ["worktree", "add", "-b", "main", CARPETA, "main"],
    ["worktree", "add", "--force", "-b", RAMA, CARPETA, "main"],
    ["status", "--porcelain", "--hard"],
    ["rev-parse", "--hard"],
    [],
  ])("rechaza %j (C3)", (...argumentos) => {
    expect(motivoDeGitDeWorktree(argumentos)).not.toBeNull();
  });

  it("rechaza antes de lanzar: el ejecutor no se llama", () => {
    const ejecutor = vi.fn(() => ({ status: 0, stdout: "", stderr: "" }));
    for (const argumentos of [["push"], ["reset", "--hard"], ["branch", "-D", RAMA], ["worktree", "remove", "--force", CARPETA]]) {
      expect(() => ejecutarGitDeWorktree("/x", argumentos, ejecutor)).toThrow();
    }
    expect(ejecutor).not.toHaveBeenCalled();
    ejecutarGitDeWorktree("/x", ["status", "--porcelain"], ejecutor);
    expect(ejecutor).toHaveBeenCalledTimes(1);
  });
});

describe("exigirCheckoutPrincipal", () => {
  const con = (gitDir: string, comun: string) => (a: readonly string[]) => ({
    status: 0,
    stdout: a[1] === "--git-dir" ? gitDir : comun,
    stderr: "",
  });

  it("acepta el checkout principal y rechaza un worktree enlazado señalando el principal", () => {
    expect(() => exigirCheckoutPrincipal("/lab", con(".git", ".git"))).not.toThrow();
    expect(() => exigirCheckoutPrincipal("/lab/wt", con("/lab/.git/worktrees/wt", "/lab/.git"))).toThrow(/checkout principal \(\/lab\)/);
  });

  it("rechaza lo que no es un repositorio", () => {
    expect(() => exigirCheckoutPrincipal("/lab", () => ({ status: 128, stdout: "", stderr: "not a git repository" }))).toThrow(/no es un repositorio git/);
  });
});

describe("la lista cerrada de procesos", () => {
  it.each([
    ["cp", ["-Rc", "/a/node_modules", "/b/node_modules"]],
    ["cp", ["-R", "/a/node_modules", "/b/node_modules"]],
    ["npx", ["tsc", "--build", "tsconfig.build.json"]],
    ["node", ["scripts/copy-web.mjs"]],
  ] as const)("admite %s %j", (comando, argumentos) => {
    expect(motivoDeProcesoDeWorktree(comando, argumentos)).toBeNull();
  });

  it.each([
    ["rm", ["-rf", "/"]],
    ["cp", ["-R", "/a/secretos", "/b/node_modules"]],
    ["cp", ["-Rf", "/a/node_modules", "/b/node_modules"]],
    ["npx", ["tsc"]],
    ["node", ["otro.mjs"]],
    ["sh", ["-c", "git push"]],
  ] as const)("rechaza %s %j antes de lanzar", (comando, argumentos) => {
    const ejecutor = vi.fn(() => ({ status: 0, stdout: "", stderr: "" }));
    expect(() => ejecutarProcesoDeWorktree(comando, argumentos, "/x", ejecutor)).toThrow(/no está permitido/);
    expect(ejecutor).not.toHaveBeenCalled();
  });
});
