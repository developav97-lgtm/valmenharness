/**
 * El commit por ticket de la jornada (R-JORN-009, mitad de integración).
 *
 * Se usa un repositorio git de laboratorio de verdad: lo que se afirma es lo que queda en el
 * historial —un commit por ticket, en la rama de trabajo, con el árbol que se probó, sin tocar
 * `main` ni publicar nada—, no lo que el código dice que hace.
 *
 * El avance desatendido se retiró: cada caso corre `runAutonomous` con el contexto de integración
 * que arma `ejecutar` (la rama de trabajo de la configuración, como lo hacía el despacho).
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { parseConfig, readIntegrationConfig, resolveWorkBranch } from "../packages/adapter/src/index.js";
import { parseTicket } from "../packages/core/src/index.js";
import {
  armarJornada,
  esRepositorioGit,
  hashDeArchivos,
  integrarTicket,
  readAutonomousStops,
  resolveAuthorizedProject,
  rutasPropiasDeLaJornada,
  runAutonomous,
} from "../packages/engine/src/index.js";
import { writeFixtureTicket } from "./helpers/fixtures.js";

const projectId = "git-lab";
const A = "FEATURE-GIT-UNO-20261005";
const B = "FEATURE-GIT-DOS-20261005";
const AHORA = new Date("2026-10-06T08:00:00.000Z");
const RAMA = "valmen/jornada-20261006";
const CRITERIO = '- [ ] El laboratorio termina correctamente.\n      <!-- test: node -e "process.exit(0)" -->';
const PRUEBAS = "Contrato de entrega: ejecutar `node -e \"process.exit(0)\"`; esperado: código 0.";

let home: string;
let root: string;
const proyecto = () => resolveAuthorizedProject({ projectId, home });

function git(...args: string[]): string {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

function politica(extra: string[] = []): void {
  writeFileSync(
    join(root, ".valmen", "config.yaml"),
    [
      `project-id: ${projectId}`,
      "test-commands:",
      "  - node",
      "execution:",
      "  dispatch-executors:",
      "    - codex",
      ...extra,
      "autonomous:",
      "  enabled: true",
      "  executor:",
      "    id: codex",
      "    model: gpt-6-sol",
      "    effort: high",
      "  eligible:",
      "    types:",
      "      - FEATURE",
      "    max-risk: normal",
      "    require:",
      "      - tests-declared",
      "    excluded-modules:",
      "      - auth",
      "  limits:",
      "    max-concurrent: 1",
      "    collision-policy: serialize",
      "    max-per-day: 5",
      "    budget-per-ticket: 1",
      "    stop-on:",
      "      - test-failure",
      "",
    ].join("\n"),
    "utf8",
  );
}

function estado(id: string): string {
  return parseTicket(readFileSync(join(root, "tickets", "2026", id, "ticket.md"), "utf8")).fields.workflow_status;
}

/** Un ejecutor que implementa: escribe un archivo funcional por ticket y deja el contrato. */
function implementador(opciones: { archivo?: (id: string) => string; despues?: () => void } = {}) {
  const archivos: Record<string, string> = { [A]: "src/uno.ts", [B]: "src/dos.ts" };
  return () => {
    for (const id of [A, B]) {
      if (estado(id) !== "in_progress") continue;
      mkdirSync(join(root, "src"), { recursive: true });
      writeFileSync(join(root, opciones.archivo?.(id) ?? (archivos[id] as string)), `export const ${id.length} = 1;\n`, "utf8");
      writeFixtureTicket(root, { id, workflowStatus: "in_progress", type: "FEATURE", module: "GIT", criterios: CRITERIO, pruebas: PRUEBAS });
    }
    opciones.despues?.();
    return { status: 0, stdout: "hecho", stderr: "" };
  };
}

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "valmen-git-"));
  root = join(home, "proyecto");
  mkdirSync(join(home, ".valmen"), { recursive: true });
  mkdirSync(join(root, ".valmen"), { recursive: true });
  writeFileSync(
    join(home, ".valmen", "bindings.local.yaml"),
    `schema-version: 1\nmachine-id: git\nmanaged-execution-capacity: 1\nprojects:\n  ${projectId}:\n    root: ${root}\n`,
  );
  politica();
  for (const id of [A, B]) {
    writeFixtureTicket(root, { id, workflowStatus: "approved", type: "FEATURE", module: "GIT", criterios: CRITERIO, pruebas: PRUEBAS });
  }
  git("init", "-q", "-b", "main");
  git("config", "user.email", "t@example.com");
  git("config", "user.name", "T");
  git("add", "-A");
  git("commit", "-q", "-m", "base");
  armarJornada({ project: proyecto(), tickets: [A, B], ahora: () => AHORA });
});

afterEach(() => rmSync(home, { recursive: true, force: true }));

/** Corre un ticket con el contexto de integración de la configuración, como lo hacía el despacho. */
async function ejecutar(execute: ReturnType<typeof implementador>, ticketId: string = A) {
  let integracion: Parameters<typeof runAutonomous>[0]["integracion"];
  if (esRepositorioGit(root)) {
    const config = readIntegrationConfig(parseConfig(readFileSync(join(root, ".valmen", "config.yaml"), "utf8")));
    integracion = {
      ramaDeTrabajo: resolveWorkBranch(config.workBranch, AHORA),
      ramasProtegidas: config.protectedBranches,
      propias: rutasPropiasDeLaJornada(proyecto().paths, [A, B], ticketId),
    };
  }
  return runAutonomous({
    paths: proyecto().paths,
    ticketId,
    fase: "implementation",
    execute,
    now: () => AHORA,
    ...(integracion === undefined ? {} : { integracion }),
  });
}

describe("un commit por ticket", () => {
  it("dos tickets seguidos dejan dos commits en la rama de trabajo, cada uno con sus archivos, y el segundo arranca limpio", async () => {
    const primero = await ejecutar(implementador(), A);
    expect(primero.status).toBe("delivered");
    expect(git("rev-parse", "--abbrev-ref", "HEAD")).toBe(RAMA);
    const commits1 = git("log", "--format=%s", "main..HEAD").split("\n");
    expect(commits1).toHaveLength(1);
    expect(commits1[0]).toContain(A);
    const archivos1 = git("show", "--name-only", "--format=", "HEAD").split("\n");
    expect(archivos1).toContain("src/uno.ts");
    expect(archivos1.some((f) => f.includes(A))).toBe(true);
    expect(archivos1).not.toContain("src/dos.ts");
    // Y el árbol quedó limpio: el segundo ticket arranca sin cambios del primero.
    expect(git("status", "--porcelain", "-uall", "--", "src", "tickets")).toBe("");

    const segundo = await ejecutar(implementador(), B);
    expect(segundo.status).toBe("delivered");
    const commits2 = git("log", "--format=%s", "main..HEAD").split("\n");
    expect(commits2).toHaveLength(2);
    expect(commits2[0]).toContain(B);
    const archivos2 = git("show", "--name-only", "--format=", "HEAD").split("\n");
    expect(archivos2).toContain("src/dos.ts");
    expect(archivos2).not.toContain("src/uno.ts");
  });

  it("main no recibe commits y no hay push, tags ni remotos", async () => {
    const base = git("rev-parse", "main");
    await ejecutar(implementador(), A);
    await ejecutar(implementador(), B);
    expect(git("rev-parse", "main")).toBe(base);
    expect(git("tag")).toBe("");
    expect(git("remote")).toBe("");
  });

  it("el commit contiene exactamente el árbol que se probó", async () => {
    await ejecutar(implementador(), A);
    expect(readFileSync(join(root, "src", "uno.ts"), "utf8")).toBe(git("show", "HEAD:src/uno.ts") + "\n");
  });
});

describe("lo que impide el commit", () => {
  it("un archivo prohibido en el cambio no se commitea y queda una parada con el motivo", async () => {
    const base = git("rev-parse", "HEAD");
    const r = await ejecutar(implementador({ archivo: () => ".env" }));
    expect(r.status).not.toBe("delivered");
    expect(git("rev-parse", "HEAD")).toBe(base);
    const parada = readAutonomousStops({ root, ticketsDir: "tickets" })[0];
    expect(parada?.reason).toBe("verification-failed");
    expect(parada?.detail).toContain(".env");
  });

  it("si el contenido cambió después de la prueba no se commitea: el commit no sería el árbol verificado", () => {
    git("switch", "-q", "-c", RAMA);
    mkdirSync(join(root, "src"), { recursive: true });
    writeFileSync(join(root, "src", "uno.ts"), "export const x = 1;\n", "utf8");
    const probado = hashDeArchivos(root, ["src/uno.ts"]);
    // Después de la prueba, alguien modifica el archivo.
    writeFileSync(join(root, "src", "uno.ts"), "export const x = 2;\n", "utf8");
    const base = git("rev-parse", "HEAD");
    const resultado = integrarTicket({
      paths: { root, ticketsDir: "tickets" },
      ticketId: A,
      titulo: "Prueba",
      ramaDeTrabajo: RAMA,
      ramasProtegidas: ["main", "master", "production"],
      arbolLimpioAlEmpezar: true,
      hashProbado: probado,
      recibo: "GR-x",
      secretos: () => 0,
    });
    expect(resultado.estado).toBe("rechazado");
    if (resultado.estado === "rechazado") expect(resultado.motivos.join(" ")).toContain("cambió después de la prueba");
    expect(git("rev-parse", "HEAD")).toBe(base);
  });

  it("desde main con cambios sin commitear no cambia de rama ni ejecuta el ticket", async () => {
    writeFileSync(join(root, "suelto.ts"), "export const x = 1;\n", "utf8");
    await expect(ejecutar(implementador(), A)).rejects.toThrow();
    expect(git("rev-parse", "--abbrev-ref", "HEAD")).toBe("main");
    expect(estado(A)).toBe("approved");
  });

  it("una rama de trabajo protegida en la configuración se rechaza al leerla", async () => {
    politica(["  work-branch: main"]);
    await expect(ejecutar(implementador(), A)).rejects.toThrow(/protegida/);
    expect(estado(A)).toBe("approved");
  });
});

/** Un commit con un archivo, en la rama en la que esté el árbol. */
function commitear(archivo: string, mensaje: string): void {
  writeFileSync(join(root, archivo), `${mensaje}\n`, "utf8");
  git("add", "--", archivo);
  git("commit", "-q", "-m", mensaje);
}

describe("el registro que deja la preparación convive con la ejecución", () => {
  it("cambios sin commitear en el directorio de otro ticket de la jornada y en el índice no detienen la ejecución", async () => {
    git("switch", "-q", "-c", RAMA);
    const registroDeB = join(root, "tickets", "2026", B, "ticket.md");
    writeFileSync(registroDeB, `${readFileSync(registroDeB, "utf8")}\nNota de la preparación.\n`, "utf8");
    writeFileSync(join(root, "tickets", "index.md"), "# índice regenerado\n", "utf8");

    const r = await ejecutar(implementador(), A);
    expect(r.status).toBe("delivered");
    expect(estado(A)).toBe("awaiting_user_tests");
    // El commit de A no arrastra el registro de B, que sigue sin commitear.
    const enCommit = git("show", "--name-only", "--format=", "HEAD").split("\n");
    expect(enCommit.some((f) => f.includes(`/${B}/`))).toBe(false);
    expect(git("status", "--porcelain", "-uall", "--", `tickets/2026/${B}`)).toContain(B);
  });
});

describe("la rama de trabajo se deja al día con main antes de ejecutar", () => {
  it("si no existe, se crea desde main y no desde la rama en la que estaba el árbol", async () => {
    git("switch", "-q", "-c", "otra");
    commitear("otra.ts", "trabajo de otra rama");
    const r = await ejecutar(implementador(), A);
    expect(r.status).toBe("delivered");
    expect(git("rev-parse", "--abbrev-ref", "HEAD")).toBe(RAMA);
    expect(git("log", "--format=%s", "main..HEAD").split("\n")).toHaveLength(1);
    expect(git("ls-tree", "-r", "--name-only", "HEAD").split("\n")).not.toContain("otra.ts");
  });

  it("si existe atrás de main, queda en el mismo commit que main antes de ejecutar", async () => {
    git("branch", RAMA);
    commitear("nuevo-en-main.ts", "avance de main");
    const principal = git("rev-parse", "main");
    const r = await ejecutar(implementador(), A);
    expect(r.status).toBe("delivered");
    expect(git("rev-parse", "--abbrev-ref", "HEAD")).toBe(RAMA);
    // El ticket se leyó desde un árbol que ya traía lo de main, y el commit de A cuelga de main.
    expect(git("rev-parse", "HEAD~1")).toBe(principal);
    expect(git("log", "--format=%s", "main..HEAD").split("\n")).toHaveLength(1);
  });

  it("si ya está en la rama de trabajo y quedó atrás de main, también la avanza", async () => {
    git("switch", "-q", "-c", RAMA);
    git("switch", "-q", "main");
    commitear("nuevo-en-main.ts", "avance de main");
    git("switch", "-q", RAMA);
    expect(git("rev-parse", RAMA)).not.toBe(git("rev-parse", "main"));
    const r = await ejecutar(implementador(), A);
    expect(r.status).toBe("delivered");
    expect(git("rev-parse", "HEAD~1")).toBe(git("rev-parse", "main"));
  });

  it("si la rama divergió de main, la ejecución se detiene nombrándola y no la toca", async () => {
    git("switch", "-q", "-c", RAMA);
    commitear("propio.ts", "commit propio de la rama");
    const antes = git("rev-parse", RAMA);
    git("switch", "-q", "main");
    commitear("de-main.ts", "avance de main");
    await expect(ejecutar(implementador(), A)).rejects.toThrow(new RegExp(`${RAMA}[\\s\\S]*divergió|divergió[\\s\\S]*${RAMA}`));
    expect(git("rev-parse", RAMA)).toBe(antes);
    expect(git("rev-parse", "--abbrev-ref", "HEAD")).toBe("main");
    expect(estado(A)).toBe("approved");
  });
});

describe("un proyecto que no es un repositorio git", () => {
  it("conserva su comportamiento: entrega sin commitear", async () => {
    rmSync(join(root, ".git"), { recursive: true, force: true });
    const r = await ejecutar(implementador(), A);
    expect(r.status).toBe("delivered");
    expect(estado(A)).toBe("awaiting_user_tests");
  });
});
