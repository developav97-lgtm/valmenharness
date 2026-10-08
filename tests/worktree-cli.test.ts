/**
 * `valmen journey worktree create|remove`: la ayuda, la validación de la entrada y el formato.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { USAGE, VALUE_OPTIONS, run } from "../packages/cli/src/main.js";
import { journeyWorktreeCommand, SUBCOMANDOS_DE_WORKTREE } from "../packages/cli/src/worktree.js";
import { defaultPaths } from "../packages/engine/src/index.js";
import { type Laboratorio, TICKET_A, crearLaboratorio, procesoSimulado } from "./helpers/worktree-lab.js";

let lab: Laboratorio | undefined;
afterEach(() => lab?.limpiar());

const sinRepo = defaultPaths("/no/existe");

describe("la ayuda", () => {
  it("lista journey worktree create|remove y --id está entre las banderas con valor (C19)", () => {
    expect(USAGE).toContain("journey worktree create|remove --id <ID>");
    const documentadas = [...USAGE.matchAll(/--([a-z][a-z-]*)\s+</g)].map((m) => `--${m[1] as string}`);
    expect(documentadas.filter((b) => !VALUE_OPTIONS.includes(b as never))).toEqual([]);
    expect(VALUE_OPTIONS).toContain("--id");
  });
});

describe("la entrada", () => {
  it("sin subcomando, con uno desconocido o sin --id sale con 2 y dice qué se admite (C20)", () => {
    for (const rest of [[], ["integrar"], ["integrate"]]) {
      const r = journeyWorktreeCommand(sinRepo, rest, { id: TICKET_A });
      expect(r.exitCode).toBe(2);
      expect(r.stderr).toContain("journey worktree admite: create, remove");
    }
    for (const flags of [{}, { id: true as const }, { id: " " }]) {
      const r = journeyWorktreeCommand(sinRepo, ["create"], flags);
      expect(r.exitCode).toBe(2);
      expect(r.stderr).toContain("requiere --id");
    }
    expect(Object.keys(SUBCOMANDOS_DE_WORKTREE)).toEqual(["create", "remove"]);
  });

  it("`valmen journey worktree` pasa por el despacho y sale con 2 (C20)", async () => {
    expect(await run(["journey", "worktree", "--root", "/no/existe"])).toBe(2);
    expect(await run(["journey", "worktree", "create", "--root", "/no/existe"])).toBe(2);
    expect(await run(["journey", "nada", "--root", "/no/existe"])).toBe(2);
  });

  it("un rechazo del motor sale con 3 y un identificador mal formado también", () => {
    expect(journeyWorktreeCommand(sinRepo, ["create"], { id: "../x" }).exitCode).toBe(3);
    expect(journeyWorktreeCommand(sinRepo, ["remove"], { id: TICKET_A }).exitCode).toBe(3);
  });
});

describe("el formato de la salida", () => {
  it("create y remove informan carpeta, rama y cupo", () => {
    lab = crearLaboratorio();
    const paths = defaultPaths(lab.root);
    const creado = journeyWorktreeCommand(paths, ["create"], { id: TICKET_A }, { home: lab.home, proceso: procesoSimulado().ejecutor });
    expect(creado.exitCode).toBe(0);
    expect(creado.stdout).toContain("Worktree creado: .claude/worktrees/ticket-uno (rama valmen/ticket-uno");
    expect(creado.stdout).toContain("Cupo de la máquina: reservado");
    expect(existsSync(join(lab.root, ".claude/worktrees/ticket-uno"))).toBe(true);

    const rechazado = journeyWorktreeCommand(paths, ["create"], { id: TICKET_A }, { home: lab.home, proceso: procesoSimulado().ejecutor });
    expect(rechazado.exitCode).toBe(3);

    const quitado = journeyWorktreeCommand(paths, ["remove"], { id: TICKET_A }, { home: lab.home });
    expect(quitado.exitCode).toBe(0);
    expect(quitado.stdout).toContain("Worktree quitado: .claude/worktrees/ticket-uno");
    expect(quitado.stdout).toContain("Cupo de la máquina: liberado");
  });
});
