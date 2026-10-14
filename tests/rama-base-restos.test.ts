/**
 * Los restos de `main` fijo y de la receta de compilación del harness (BUGFIX-ENGINE-RAMA-BASE-RESTOS-20261014).
 *
 * Continúa BUGFIX-ENGINE-WORKTREE-RAMA-BASE-20261014: la jornada autónoma, `valmen cleanup` y la base
 * por defecto de `gate code-review` usan la rama base que resuelve `ramaBaseDelProyecto`, y la receta
 * de compilación (`npx tsc --build tsconfig.build.json`, `node scripts/copy-web.mjs`) solo corre en el
 * proyecto que la tiene. Cada sitio lleva su caso sobre `dev` y su regresión sobre `main`.
 *
 * Todo corre en repositorios git temporales. Ningún proceso de compilación se lanza de verdad (el
 * ejecutor de procesos es un doble que falla si alguien intenta lanzarlo) y ningún revisor de
 * code-review llama a un modelo: el diff es de riesgo bajo y el doble del revisor falla si se le llama.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync, appendFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { cleanupCommand } from "../packages/cli/src/limpieza.js";
import { USAGE } from "../packages/cli/src/main.js";
import { journeyWorktreeCommand } from "../packages/cli/src/worktree.js";
import { defaultPaths, type EjecutorDeProceso } from "../packages/engine/src/index.js";
import { runGate } from "../packages/engine/src/gate.js";
import { asegurarRamaDeTrabajo } from "../packages/engine/src/integration-commit.js";
import { motivoDeGitDeLimpieza } from "../packages/engine/src/limpieza-git.js";
import { readReceipts } from "../packages/engine/src/receipts.js";
import { writeFixtureTicket } from "./helpers/fixtures.js";
import { type Laboratorio, TICKET_A, crearLaboratorio } from "./helpers/worktree-lab.js";

const sueltos: string[] = [];
let lab: Laboratorio | undefined;
afterEach(() => {
  lab?.limpiar();
  lab = undefined;
  for (const d of sueltos.splice(0)) rmSync(d, { recursive: true, force: true });
});

const BASE_DEV = "execution:\n  base-branch: dev\n";

function gitEn(cwd: string, ...args: string[]): string {
  const r = spawnSync(
    "git",
    ["-c", "user.email=t@example.com", "-c", "user.name=T", "-c", "commit.gpgsign=false", ...args],
    { cwd, encoding: "utf8" },
  );
  if (r.status !== 0) throw new Error(`git ${args.join(" ")} falló: ${r.stderr}`);
  return r.stdout.trim();
}

function escribir(root: string, ruta: string, contenido: string): void {
  mkdirSync(dirname(join(root, ruta)), { recursive: true });
  writeFileSync(join(root, ruta), contenido);
}

function commitear(root: string, ruta: string, mensaje: string): void {
  escribir(root, ruta, `${mensaje}\n`);
  gitEn(root, "add", "--", ruta);
  gitEn(root, "commit", "-q", "-m", mensaje);
}

type Main = "atrasada" | "ausente" | "sin-clave";

/**
 * Un repositorio con su config: con `atrasada`, `main` queda atrás de `dev`; con `ausente`, no hay
 * `main`; con `sin-clave`, no se declara la base y el árbol queda en `main` con `dev` adelante.
 */
function repositorio(main: Main, config = ""): string {
  const root = mkdtempSync(join(tmpdir(), "valmen-restos-"));
  sueltos.push(root);
  gitEn(root, "init", "-q", "-b", main === "ausente" ? "dev" : "main");
  escribir(root, ".valmen/config.yaml", `name: Restos\n${main === "sin-clave" ? "" : BASE_DEV}${config}`);
  gitEn(root, "add", "--", ".valmen/config.yaml");
  commitear(root, "src/a.ts", "base");
  if (main !== "ausente") gitEn(root, "switch", "-q", "-c", "dev");
  commitear(root, "src/b.ts", "dev avanza");
  if (main === "sin-clave") gitEn(root, "switch", "-q", "main");
  return root;
}

// ── La jornada autónoma (H1) ──────────────────────────────────────────────────────────────────

describe("la rama de trabajo de la jornada nace de la rama base (C1, C2, C4)", () => {
  const casos: ReadonlyArray<[Main, string]> = [
    ["atrasada", "dev"],
    ["ausente", "dev"],
    ["sin-clave", "main"],
  ];
  it.each(casos)("con main %s, la rama de trabajo queda en %s", (main, base) => {
    const root = repositorio(main);
    const r = asegurarRamaDeTrabajo({
      root,
      ramaDeTrabajo: "valmen/jornada",
      ramasProtegidas: ["main", "master", "production"],
    });
    expect(r).toEqual({ rama: "valmen/jornada", cambiada: true });
    expect(gitEn(root, "rev-parse", "--abbrev-ref", "HEAD")).toBe("valmen/jornada");
    expect(gitEn(root, "rev-parse", "HEAD")).toBe(gitEn(root, "rev-parse", base));
  });

  it("una rama de trabajo que divergió de dev detiene la jornada nombrando dev (C3)", () => {
    const root = repositorio("atrasada");
    gitEn(root, "switch", "-q", "-c", "valmen/jornada");
    commitear(root, "src/j.ts", "jornada");
    gitEn(root, "switch", "-q", "dev");
    commitear(root, "src/d.ts", "dev sigue");
    expect(() =>
      asegurarRamaDeTrabajo({
        root,
        ramaDeTrabajo: "valmen/jornada",
        ramasProtegidas: ["main", "master", "production"],
      }),
    ).toThrow(/divergió de dev/);
  });
});

// ── La limpieza (H2) ──────────────────────────────────────────────────────────────────────────

/** El laboratorio de worktrees sobre `dev`, con `main` atrasada y un worktree ya integrado en `dev`. */
function laboratorioDeLimpieza(conClave: boolean): Laboratorio {
  const l = crearLaboratorio();
  const base = conClave ? "dev" : "main";
  if (conClave) {
    l.git("branch", "-m", "main", "dev");
    l.git("branch", "main", "dev");
    appendFileSync(join(l.root, ".valmen", "config.yaml"), BASE_DEV);
    l.git("add", "-A");
    l.git("commit", "-q", "-m", "declara la base");
  }
  const carpeta = join(l.root, ".claude", "worktrees", "listo");
  l.git("worktree", "add", "-q", "-b", "trabajo/listo", carpeta, base);
  writeFileSync(join(carpeta, "listo.txt"), "listo\n");
  l.gitEn(carpeta, "add", "--", "listo.txt");
  l.gitEn(carpeta, "commit", "-q", "-m", "listo");
  l.git("merge", "-q", "--ff-only", "trabajo/listo");
  return l;
}

interface ElementoDeLimpieza {
  ruta: string;
  accion: string;
  motivo: string;
}

describe("valmen cleanup opera contra la rama base (C5, C6, C7, C9)", () => {
  it.each([
    [true, "dev"],
    [false, "main"],
  ] as const)("con la clave %s, corre desde %s y quita lo integrado ahí", (conClave, base) => {
    lab = laboratorioDeLimpieza(conClave);
    const r = cleanupCommand(defaultPaths(lab.root), { json: true }, { home: lab.home });
    expect(r.stderr).toBe("");
    expect(r.exitCode).toBe(0);
    const listo = (JSON.parse(r.stdout) as { worktrees: ElementoDeLimpieza[] }).worktrees.find((w) =>
      w.ruta.endsWith("/listo"),
    );
    expect(listo?.accion).toBe("quitar");
    expect(listo?.motivo).toBe(`integrado en ${base} y limpio`);
  });

  it("desde otra rama se niega nombrando dev (C7)", () => {
    lab = laboratorioDeLimpieza(true);
    lab.git("switch", "-q", "-c", "otra");
    const r = cleanupCommand(defaultPaths(lab.root), { json: true }, { home: lab.home });
    expect(r.exitCode).toBe(3);
    expect(r.stderr).toContain('está en "otra", no en dev');
  });

  it("la lista cerrada mide contra la base declarada y no borra la base (C8)", () => {
    const casos: ReadonlyArray<[readonly string[], string | undefined, boolean]> = [
      [["merge-base", "--is-ancestor", "abc123", "dev"], "dev", true],
      [["merge-base", "--is-ancestor", "abc123", "main"], "dev", false],
      [["branch", "-d", "dev"], "dev", false],
      [["branch", "-d", "main"], "dev", false],
      [["branch", "-d", "trabajo/listo"], "dev", true],
      [["merge-base", "--is-ancestor", "abc123", "main"], undefined, true],
      [["merge-base", "--is-ancestor", "abc123", "dev"], undefined, false],
    ];
    for (const [argumentos, base, admitido] of casos) {
      const motivo = motivoDeGitDeLimpieza(argumentos, base);
      expect(motivo === null, `${argumentos.join(" ")} con base ${base ?? "por defecto"}`).toBe(admitido);
    }
  });
});

// ── La base por defecto de code-review (H3) ───────────────────────────────────────────────────

const ID_REVISION = "BUGFIX-GATE-RESTOS-LAB-20261014";

/** El doble del revisor: si alguien lo llama, la prueba falla. Ninguna prueba gasta un modelo. */
const revisorProhibido = (() => {
  throw new Error("code-review llamó a un revisor: esta prueba no admite modelos");
}) as unknown as NonNullable<Parameters<typeof runGate>[1]["reviewDiff"]>;

describe("gate code-review sin --base mide contra la rama base (C10, C11)", () => {
  it.each(["atrasada", "sin-clave"] as const)("con main %s", async (main) => {
    const root = repositorio(main, "test-commands:\n  - node\n");
    writeFixtureTicket(root, {
      id: ID_REVISION,
      workflowStatus: "in_progress",
      type: "BUGFIX",
      module: "GATE",
      criterios: '- [ ] Pasa.\n      <!-- test: node -e "process.exit(0)" -->',
      pruebas: '- Comando: `node -e "process.exit(0)"`, directorio: la raíz.\n- Resultado esperado: sale con 0.',
    });
    gitEn(root, "add", "-A");
    gitEn(root, "commit", "-q", "-m", "registra el ticket");
    const base = main === "sin-clave" ? "main" : "dev";
    gitEn(root, "switch", "-q", "-c", "trabajo");
    escribir(root, "tests/nuevo.test.ts", "export const prueba = true;\n");

    const paths = { root, ticketsDir: "tickets" };
    const r = await runGate(paths, {
      gateId: "code-review",
      ticketId: ID_REVISION,
      reviewDiff: revisorProhibido,
    });
    expect(r.stderr ?? "").toBe("");
    expect(r.exitCode).toBe(0);
    const recibo = readReceipts(paths, ID_REVISION).filter((x) => x.gate === "code-review").at(-1);
    expect(recibo?.codeReview?.base.ref).toBe(base);
    expect(recibo?.codeReview?.entrada.archivos.map((a) => a.ruta)).toEqual(["tests/nuevo.test.ts"]);
  });
});

// ── La receta de compilación del harness (H4, H5) ─────────────────────────────────────────────

/** El doble de procesos: cualquier intento de lanzar uno (npx, node, cp) hace fallar la prueba. */
function procesoProhibido(): { ejecutor: EjecutorDeProceso; intentos: string[] } {
  const intentos: string[] = [];
  return {
    intentos,
    ejecutor: (comando, argumentos) => {
      intentos.push(`${comando} ${argumentos.join(" ")}`);
      throw new Error(`se intentó lanzar ${comando} ${argumentos.join(" ")}`);
    },
  };
}

describe("la receta de compilación solo corre en el proyecto que la tiene (C12, C13, C14, C15)", () => {
  it("sin tsconfig.build.json ni node_modules/@valmen, create e integrate salen con 0 sin compilar", () => {
    lab = crearLaboratorio();
    rmSync(join(lab.root, "node_modules"), { recursive: true });
    const paths = defaultPaths(lab.root);
    const proceso = procesoProhibido();
    const opciones = { home: lab.home, proceso: proceso.ejecutor };

    const creado = journeyWorktreeCommand(paths, ["create"], { id: TICKET_A }, opciones);
    expect(creado.stderr).toBe("");
    expect(creado.exitCode).toBe(0);
    expect(creado.stdout).toMatch(/Aviso: .*no se compiló/);
    const wt = join(lab.root, ".claude", "worktrees", "ticket-uno");
    expect(existsSync(wt)).toBe(true);

    writeFileSync(join(wt, "a.txt"), "a\n");
    lab.gitEn(wt, "add", "--", "a.txt");
    lab.gitEn(wt, "commit", "-q", "-m", "rama");
    const integrada = journeyWorktreeCommand(paths, ["integrate"], { id: TICKET_A }, opciones);
    expect(integrada.stderr).toBe("");
    expect(integrada.exitCode).toBe(0);
    expect(lab.git("merge-base", "--is-ancestor", "valmen/ticket-uno", "main")).toBe("");
    expect(proceso.intentos).toEqual([]);
  });

  it("con tsconfig.build.json y sin node_modules, create sigue pidiendo instalar las dependencias (C15)", () => {
    lab = crearLaboratorio();
    rmSync(join(lab.root, "node_modules"), { recursive: true });
    writeFileSync(join(lab.root, "tsconfig.build.json"), "{}\n");
    lab.git("add", "--", "tsconfig.build.json");
    lab.git("commit", "-q", "-m", "receta");
    const proceso = procesoProhibido();
    const r = journeyWorktreeCommand(
      defaultPaths(lab.root),
      ["create"],
      { id: TICKET_A },
      { home: lab.home, proceso: proceso.ejecutor },
    );
    expect(r.exitCode).toBe(3);
    expect(r.stderr).toContain("instala las dependencias");
    expect(existsSync(join(lab.root, ".claude", "worktrees", "ticket-uno"))).toBe(false);
    expect(proceso.intentos).toEqual([]);
  });
});

// ── La ayuda del CLI ──────────────────────────────────────────────────────────────────────────

describe("la ayuda nombra la rama base del proyecto (C17, C18)", () => {
  it.each([
    ["cleanup", /cleanup \[--confirm\] \[--json\]\n\s+Lista los worktrees de \.claude\/worktrees\/ ya integrados en la rama base/],
    ["--base", /--base <ref>\s+code-review: la base del diff \(por defecto la rama base del proyecto/],
  ])("%s", (_nombre, esperado) => {
    expect(USAGE).toMatch(esperado);
  });
});
