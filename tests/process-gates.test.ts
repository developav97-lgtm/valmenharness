/**
 * Los gates de un proceso: detenerse, aprobar, retomar.
 *
 * Es lo que convierte un proceso en algo que **puede pedir permiso a mitad de
 * camino**, que es la mitad del valor del diseño: un despliegue no lo decide un
 * script. Lo que se protege aquí, y por qué cada cosa importa:
 *
 * 1. **Un gate sin aprobar detiene el proceso y lo deja retomable.** No falla:
 *    un proceso a medias a propósito y uno roto son cosas distintas, y quien mira
 *    tiene que poder saber cuál es.
 * 2. **Retomar no repite lo ya ejecutado.** `git tag` dos veces no es idempotente
 *    y publicar dos veces es peor. Es la razón de que el estado se guarde.
 * 3. **Aprobar no es retomar.** Decidir y continuar son dos actos: quien aprueba
 *    no tiene por qué ser quien continúa, y juntarlos haría que aprobar tuviera
 *    efectos que quien aprueba no ve.
 * 4. **Aprobar sin responsable no cuenta.** Un gate que se aprueba sin dejar
 *    rastro no es un gate.
 */
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  abandonRun,
  approveGate,
  gateApproved,
  listRuns,
  readRun,
  runProcess,
  waitingRuns,
} from "@valmen/engine";

import { dispatch, parseArgs } from "../packages/cli/src/main.js";

let lab: string;

beforeEach(() => {
  lab = mkdtempSync(join(tmpdir(), "valmen-gate-proc-"));
  mkdirSync(join(lab, ".valmen", "processes"), { recursive: true });
  mkdirSync(join(lab, ".valmen", "gates"), { recursive: true });
  writeFileSync(
    join(lab, ".valmen", "gates", "deploy.yaml"),
    "id: deploy\ntitle: Aprobación\n",
  );
});

afterEach(() => {
  rmSync(lab, { recursive: true, force: true });
});

/**
 * Un comando de verdad, que no depende del shell.
 *
 * Los tests del motor inyectan el ejecutor, pero los del CLI **ejecutan de
 * verdad**, y ahí un `paso-preflight` inventado sale con 127 y el proceso se
 * detiene antes de llegar al gate. La primera versión de estos tests hacía eso, y
 * el fallo parecía del motor.
 */
function comando(texto: string): string {
  // El `{version}` se deja literal: lo sustituye el motor al ejecutar, y por eso
  // este texto es el comando y no el resultado.
  return `node -e "process.stdout.write('${texto}')"`;
}

/** Un proceso con un gate a mitad y un paso después. */
function escribirProceso(): void {
  writeFileSync(
    join(lab, ".valmen", "processes", "deploy.yaml"),
    [
      "id: deploy",
      "title: Despliegue con aprobación",
      "params:",
      "  version: { type: string, required: true }",
      "steps:",
      "  - id: preflight",
      "    title: Comprobar el repositorio",
      "    kind: command",
      `    run: ${comando("preflight")}`,
      "  - id: tag",
      "    title: Crear el tag",
      "    kind: command",
      `    run: ${comando("tag {version}")}`,
      "  - id: aprobacion",
      "    title: Aprobación final",
      "    kind: gate",
      "    gate: deploy",
      "  - id: publicar",
      "    title: Publicar",
      "    kind: command",
      `    run: ${comando("publicar {version}")}`,
      "",
    ].join("\n"),
  );
}

/** Un ejecutor que registra lo que le piden, sin lanzar nada. */
function simulador(comandos: string[] = []) {
  return (comando: string): { status: number; stdout: string; stderr: string } => {
    comandos.push(comando);
    return { status: 0, stdout: `ok: ${comando}`, stderr: "" };
  };
}

const correr = (...args: string[]) =>
  dispatch(parseArgs(["--root", lab, "process", ...args]));

describe("un gate sin aprobar detiene el proceso", () => {
  it("se detiene en el gate y no ejecuta lo de después", () => {
    escribirProceso();
    const comandos: string[] = [];
    const corrida = runProcess({
      root: lab,
      id: "deploy",
      params: { version: "1.2.3" },
      runCommand: simulador(comandos),
    });

    expect(corrida.waiting).toBe(true);
    // Lo de después del gate **no** corrió: eso es lo que un gate impide.
    expect(comandos).toHaveLength(2);
    expect(comandos[0]).toContain("preflight");
    expect(comandos[1]).toContain("tag 1.2.3");
    expect(corrida.steps.find((paso) => paso.id === "aprobacion")?.status).toBe("waiting");
  });

  it("deja una corrida esperando, con el paso pendiente", () => {
    escribirProceso();
    runProcess({
      root: lab,
      id: "deploy",
      params: { version: "1.2.3" },
      runCommand: simulador(),
    });

    const detenidas = waitingRuns(lab);
    expect(detenidas).toHaveLength(1);
    expect(detenidas[0]?.pendingStep).toBe("aprobacion");
    expect(detenidas[0]?.processId).toBe("deploy");
    // Los parámetros quedan guardados, para poder retomar con los mismos.
    expect(detenidas[0]?.params).toEqual({ version: "1.2.3" });
  });

  it("un proceso detenido no es un fallo", () => {
    // Confundirlos haría que nadie supiera si hay algo que hacer.
    escribirProceso();
    const corrida = runProcess({
      root: lab,
      id: "deploy",
      params: { version: "1.2.3" },
      runCommand: simulador(),
    });
    expect(corrida.ok).toBe(true);
    expect(corrida.waiting).toBe(true);
    expect(corrida.state?.status).toBe("waiting");
  });

  it("no ejecuta `on_success` mientras espera", () => {
    // El proceso no terminó: encadenar el siguiente sería dar por hecho un
    // despliegue que nadie aprobó.
    escribirProceso();
    writeFileSync(
      join(lab, ".valmen", "processes", "post.yaml"),
      [
        "id: post",
        "steps:",
        "  - id: aviso",
        "    kind: command",
        `    run: ${comando("avisar")}`,
      ].join("\n"),
    );
    const conExito = readFileSync(
      join(lab, ".valmen", "processes", "deploy.yaml"),
      "utf8",
    ).replace("id: deploy\n", "id: deploy\non_success: [post]\n");
    writeFileSync(join(lab, ".valmen", "processes", "deploy.yaml"), conExito);

    const comandos: string[] = [];
    runProcess({
      root: lab,
      id: "deploy",
      params: { version: "1.2.3" },
      runCommand: simulador(comandos),
    });
    expect(comandos.some((c) => c.includes("avisar"))).toBe(false);
  });

  it("con `--skip-gates` lo saltea, y lo dice", () => {
    // Para ensayar un proceso sin aprobaciones. Se declara explícitamente porque
    // un gate que se saltea en silencio no es un gate.
    escribirProceso();
    const comandos: string[] = [];
    const corrida = runProcess({
      root: lab,
      id: "deploy",
      params: { version: "1.2.3" },
      onGate: "skip",
      runCommand: simulador(comandos),
    });

    expect(corrida.waiting).toBe(false);
    expect(corrida.ok).toBe(true);
    expect(comandos).toHaveLength(3);
    expect(comandos[2]).toContain("publicar 1.2.3");
    const gate = corrida.steps.find((paso) => paso.id === "aprobacion");
    expect(gate?.status).toBe("skipped");
    expect(gate?.reason).toContain("no está aprobado");
  });
});

describe("retomar una corrida", () => {
  it("sigue desde donde quedó y no repite nada", () => {
    // La regla que sostiene todo esto: `git tag` dos veces no es idempotente.
    escribirProceso();
    const primera: string[] = [];
    runProcess({
      root: lab,
      id: "deploy",
      params: { version: "1.2.3" },
      runCommand: simulador(primera),
    });
    approveGate(lab, "deploy", "Juan Andrade", "");

    const estado = waitingRuns(lab)[0]!;
    const segunda: string[] = [];
    const corrida = runProcess({
      root: lab,
      id: "deploy",
      params: estado.params,
      resume: estado,
      runCommand: simulador(segunda),
    });

    // Solo el paso que faltaba, y ninguno de los ya hechos.
    expect(segunda).toHaveLength(1);
    expect(segunda[0]).toContain("publicar 1.2.3");
    expect(corrida.ok).toBe(true);
    expect(corrida.waiting).toBe(false);
  });

  it("deja constancia de todos los pasos, los de antes y los de después", () => {
    escribirProceso();
    runProcess({
      root: lab,
      id: "deploy",
      params: { version: "1.2.3" },
      runCommand: simulador(),
    });
    approveGate(lab, "deploy", "Juan Andrade", "");
    const estado = waitingRuns(lab)[0]!;
    const corrida = runProcess({
      root: lab,
      id: "deploy",
      params: estado.params,
      resume: estado,
      runCommand: simulador(),
    });

    const guardada = readRun(lab, estado.runId)!;
    expect(guardada.status).toBe("completed");
    expect(guardada.pendingStep).toBeNull();
    expect(guardada.steps.map((paso) => paso.id)).toEqual([
      "preflight",
      "tag",
      "aprobacion",
      "publicar",
    ]);
    expect(corrida.state?.status).toBe("completed");
  });

  it("si el gate sigue sin aprobar, vuelve a esperar", () => {
    escribirProceso();
    runProcess({
      root: lab,
      id: "deploy",
      params: { version: "1.2.3" },
      runCommand: simulador(),
    });
    const estado = waitingRuns(lab)[0]!;

    const otra = runProcess({
      root: lab,
      id: "deploy",
      params: estado.params,
      resume: estado,
      runCommand: simulador(),
    });
    expect(otra.waiting).toBe(true);
    // Y sigue habiendo una sola corrida detenida: retomar no duplica el estado.
    expect(waitingRuns(lab)).toHaveLength(1);
  });

  it("reanuda una corrida fallida, que también se puede retomar", () => {
    escribirProceso();
    writeFileSync(
      join(lab, ".valmen", "processes", "rompe.yaml"),
      [
        "id: rompe",
        "params:",
        "  version: { type: string, required: true }",
        "steps:",
        "  - id: uno",
        "    kind: command",
        "    run: falla-a-proposito",
        "  - id: dos",
        "    kind: command",
        `    run: ${comando("despues")}`,
      ].join("\n"),
    );
    const corrida = runProcess({
      root: lab,
      id: "rompe",
      params: { version: "1" },
      runCommand: (comando) =>
        comando === "falla-a-proposito"
          ? { status: 1, stdout: "", stderr: "no" }
          : { status: 0, stdout: "", stderr: "" },
    });
    expect(corrida.ok).toBe(false);
    // Un fallo que no se retoma no deja estado: solo se persiste lo que hay que
    // reanudar, y un archivo por corrida fallida llenaría el proyecto de basura.
    expect(listRuns(lab)).toEqual([]);
    // Y si se retoma, sigue desde el paso que falló.
    const reanudada = runProcess({
      root: lab,
      id: "rompe",
      params: { version: "1" },
      resume: {
        runId: "rompe-1",
        processId: "rompe",
        params: { version: "1" },
        status: "failed",
        pendingStep: null,
        steps: [],
        startedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        reason: "falló",
      },
      runCommand: () => ({ status: 0, stdout: "", stderr: "" }),
    });
    expect(reanudada.ok).toBe(true);
  });
});

describe("las aprobaciones", () => {
  it("exigen responsable", () => {
    // Aprobar sin nombre no es auditable, y es la misma regla que en un gate de
    // ticket.
    expect(() => approveGate(lab, "deploy", "   ", "")).toThrowError(/responsable/);
    expect(gateApproved(lab, "deploy")).toBeNull();
  });

  it("quedan registradas con quién y cuándo", () => {
    const aprobacion = approveGate(lab, "deploy", "Juan Andrade", "probado en dev");
    expect(aprobacion.actor).toBe("Juan Andrade");
    expect(aprobacion.reason).toBe("probado en dev");
    expect(aprobacion.at).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    const leida = gateApproved(lab, "deploy");
    expect(leida?.actor).toBe("Juan Andrade");
  });

  it("la última aprobación es la que vale", () => {
    // Un gate se aprueba para cada corrida que lo usa.
    approveGate(lab, "deploy", "primera", "", new Date("2026-01-01T00:00:00Z"));
    approveGate(lab, "deploy", "segunda", "", new Date("2026-02-01T00:00:00Z"));
    expect(gateApproved(lab, "deploy")?.actor).toBe("segunda");
  });

  it("un gate distinto no aprueba el que se usa", () => {
    approveGate(lab, "otro", "alguien", "");
    expect(gateApproved(lab, "deploy")).toBeNull();
  });

  it("un registro de aprobaciones ilegible no aprueba nada", () => {
    // Es lo seguro: un gate cuya aprobación no se puede leer no está aprobado.
    writeFileSync(join(lab, ".valmen", "gates", "approvals.json"), "{roto");
    expect(gateApproved(lab, "deploy")).toBeNull();
  });
});

describe("el ciclo por el CLI", () => {
  it("run se detiene y `runs` lo muestra", () => {
    escribirProceso();
    const corrida = correr("run", "deploy", "--version", "1.2.3");
    // 3 es invariante: el proceso no terminó, y un 0 diría que sí.
    expect(corrida.exitCode).toBe(3);
    // Por stdout, como el informe de una compuerta bloqueada: es un resultado
    // —quedó esperando una decisión— y no un diagnóstico. Un cliente de protocolo
    // lee stdout como resultado y stderr como error, y esperar no es un error.
    expect(corrida.stdout).toContain("se detuvo esperando");
    expect(corrida.stderr).toBe("");

    const lista = correr("runs");
    expect(lista.exitCode).toBe(0);
    expect(lista.stdout).toContain("waiting");
    expect(lista.stdout).toContain("aprobacion");
  });

  it("approve sin responsable falla, y con él aprueba", () => {
    escribirProceso();
    correr("run", "deploy", "--version", "1.2.3");
    expect(correr("approve", "deploy").exitCode).toBe(2);

    const aprobado = correr("approve", "deploy", "--actor", "Juan Andrade");
    expect(aprobado.exitCode).toBe(0);
    expect(aprobado.stdout).toContain("Juan Andrade");
  });

  it("resume termina el proceso", () => {
    escribirProceso();
    correr("run", "deploy", "--version", "1.2.3");
    correr("approve", "deploy", "--actor", "Juan Andrade");
    const corrida = correr("resume");
    expect(corrida.exitCode).toBe(0);
    expect(corrida.stdout).toContain("terminada");
  });

  it("resume sin nada detenido lo dice", () => {
    escribirProceso();
    const r = correr("resume");
    expect(r.exitCode).toBe(2);
    expect(r.stderr).toContain("No hay ninguna corrida detenida");
  });

  it("con varias detenidas no elige: pide cuál", () => {
    // Elegir por alguien es cómo se retoma el proceso equivocado.
    escribirProceso();
    writeFileSync(join(lab, ".valmen", "gates", "otro.yaml"), "id: otro\n");
    writeFileSync(
      join(lab, ".valmen", "processes", "otro.yaml"),
      ["id: otro", "steps:", "  - id: g", "    kind: gate", "    gate: otro"].join("\n"),
    );
    correr("run", "deploy", "--version", "1.2.3");
    correr("run", "otro");

    const r = correr("resume");
    expect(r.exitCode).toBe(6);
    expect(r.stderr).toContain("Hay 2 corridas detenidas");
  });

  it("show-run imprime el detalle", () => {
    escribirProceso();
    correr("run", "deploy", "--version", "1.2.3");
    const corrida = listRuns(lab)[0]!;
    const r = correr("show-run", corrida.runId);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain(corrida.runId);
    expect(r.stdout).toContain("esperando en: aprobacion");
    expect(r.stdout).toContain("version=1.2.3");
  });

  it("abandon deja de poder retomarse", () => {
    escribirProceso();
    correr("run", "deploy", "--version", "1.2.3");
    const corrida = listRuns(lab)[0]!;

    expect(correr("abandon", corrida.runId).exitCode).toBe(0);
    const retomar = correr("resume", corrida.runId);
    expect(retomar.exitCode).toBe(3);
    expect(retomar.stderr).toContain("abandoned");
  });

  it("`--skip-gates` termina el proceso de una vez", () => {
    escribirProceso();
    const r = correr("run", "deploy", "--version", "1.2.3", "--skip-gates");
    expect(r.exitCode).toBe(0);
    // Y no queda nada detenido.
    expect(waitingRuns(lab)).toHaveLength(0);
  });
});

describe("el estado se guarda solo cuando hay algo que retomar", () => {
  it("un proceso que no se detiene no deja archivo", () => {
    // Un archivo por corrida llenaría el proyecto de basura.
    escribirProceso();
    runProcess({
      root: lab,
      id: "deploy",
      params: { version: "1.2.3" },
      onGate: "skip",
      runCommand: simulador(),
    });
    expect(existsSync(join(lab, ".valmen", "processes", "runs"))).toBe(false);
  });

  it("abandonar una corrida que no existe lo dice", () => {
    expect(() => abandonRun(lab, "no-existe")).toThrowError(/No existe la corrida/);
  });
});
