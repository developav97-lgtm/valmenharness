/**
 * Las reglas de integración de la jornada (R-JORN-009, mitad de reglas).
 *
 * Lo que sostiene la confianza: la rama de trabajo no puede ser una de producción, el commit solo
 * se permite en esa rama con el árbol limpio al empezar y sin archivos prohibidos, y el único
 * git que la jornada puede lanzar nunca publica ni reescribe historia.
 */
import { describe, expect, it, vi } from "vitest";

import {
  DEFAULT_PROTECTED_BRANCHES,
  DEFAULT_WORK_BRANCH,
  parseConfig,
  readIntegrationConfig,
  resolveWorkBranch,
} from "../packages/adapter/src/index.js";
import {
  ejecutarGitPermitido,
  motivoDeGitProhibido,
  reglasDeIntegracion,
  type IntegrationState,
} from "../packages/engine/src/index.js";

const config = (texto: string) => readIntegrationConfig(parseConfig(texto));

describe("la rama de trabajo", () => {
  it("por defecto es valmen/jornada-<AAAAMMDD> y se resuelve con la fecha", () => {
    const porDefecto = config("name: Demo\n");
    expect(porDefecto.workBranch).toBe(DEFAULT_WORK_BRANCH);
    expect(porDefecto.protectedBranches).toEqual([...DEFAULT_PROTECTED_BRANCHES]);
    expect(resolveWorkBranch(porDefecto.workBranch, new Date("2026-10-06T08:00:00Z"))).toBe("valmen/jornada-20261006");
  });

  it("se declara en execution.work-branch", () => {
    const declarada = config("execution:\n  work-branch: trabajo/<AAAAMMDD>\n");
    expect(resolveWorkBranch(declarada.workBranch, new Date("2026-10-06T08:00:00Z"))).toBe("trabajo/20261006");
  });

  it.each(["main", "master", "production"])("una configuración que apunta a %s se rechaza con el mensaje de la clave", (rama) => {
    expect(() => config(`execution:\n  work-branch: ${rama}\n`)).toThrow(/execution\.work-branch.*protegida/);
  });

  it("una rama declarada como protegida por el proyecto también se rechaza", () => {
    expect(() => config("execution:\n  work-branch: release\n  protected-branches:\n    - release\n")).toThrow(/protegida/);
    // Y una plantilla que hoy se resuelve a una protegida.
    expect(() => config("execution:\n  work-branch: main\n  protected-branches:\n    - main\n")).toThrow(/protegida/);
  });

  it("una forma inválida se rechaza", () => {
    expect(() => config("execution:\n  work-branch: con espacios\n")).toThrow(/no es un nombre de rama válido/);
    expect(() => config("execution:\n  work-branch: a..b\n")).toThrow(/no es un nombre de rama válido/);
  });
});

const BASE: IntegrationState = {
  ramaActual: "valmen/jornada-20261006",
  ramaDeTrabajo: "valmen/jornada-20261006",
  ramasProtegidas: ["main", "master", "production"],
  arbolLimpioAlEmpezar: true,
  archivosCambiados: ["packages/engine/src/a.ts", "tests/a.test.ts"],
  hallazgosDeSecretos: 0,
};

describe("las reglas de commit", () => {
  it("con la rama de trabajo, el árbol limpio y archivos normales se permite", () => {
    expect(reglasDeIntegracion(BASE)).toEqual({ permitido: true, violaciones: [] });
  });

  it("en una rama que no es la de trabajo se rechaza, y en una protegida lo dice distinto", () => {
    const otra = reglasDeIntegracion({ ...BASE, ramaActual: "feature/x" });
    expect(otra.permitido).toBe(false);
    expect(otra.violaciones[0]).toContain("no es la rama de trabajo");
    const main = reglasDeIntegracion({ ...BASE, ramaActual: "main" });
    expect(main.violaciones[0]).toContain("rama protegida");
  });

  it("con el árbol sucio al empezar se rechaza", () => {
    const r = reglasDeIntegracion({ ...BASE, arbolLimpioAlEmpezar: false });
    expect(r.permitido).toBe(false);
    expect(r.violaciones.join(" ")).toContain("no estaba limpio");
  });

  it("con archivos prohibidos o fuera del proyecto se rechaza y lista cada uno", () => {
    const r = reglasDeIntegracion({
      ...BASE,
      archivosCambiados: [".env", ".valmen/config.yaml", "../afuera.txt", "src/ok.ts"],
    });
    expect(r.permitido).toBe(false);
    expect(r.violaciones).toHaveLength(3);
    expect(r.violaciones.join("\n")).toContain(".env");
    expect(r.violaciones.join("\n")).toContain(".valmen/config.yaml");
    expect(r.violaciones.join("\n")).toContain("fuera del proyecto");
  });

  it("sin cambios o con secretos detectados se rechaza", () => {
    expect(reglasDeIntegracion({ ...BASE, archivosCambiados: [] }).permitido).toBe(false);
    const secretos = reglasDeIntegracion({ ...BASE, hallazgosDeSecretos: 2 });
    expect(secretos.permitido).toBe(false);
    expect(secretos.violaciones.join(" ")).toContain("secreto");
  });

  it("acumula todas las violaciones, no solo la primera", () => {
    const r = reglasDeIntegracion({ ...BASE, ramaActual: "main", arbolLimpioAlEmpezar: false, hallazgosDeSecretos: 1 });
    expect(r.violaciones.length).toBeGreaterThanOrEqual(3);
  });
});

describe("el git que una jornada puede ejecutar", () => {
  it("admite las operaciones de la lista cerrada", () => {
    for (const argumentos of [
      ["status", "--porcelain"],
      ["rev-parse", "--abbrev-ref", "HEAD"],
      ["diff", "--name-only"],
      ["add", "--", "a.ts", "b.ts"],
      ["commit", "-m", "mensaje"],
      ["switch", "valmen/jornada-20261006"],
      ["switch", "-c", "valmen/jornada-20261006"],
      ["checkout", "-b", "valmen/jornada-20261006"],
    ]) {
      expect(motivoDeGitProhibido(argumentos), argumentos.join(" ")).toBeNull();
    }
  });

  it.each([
    [["push"], "push"],
    [["push", "--force", "origin", "main"], "push"],
    [["tag", "v1.0.0"], "tag"],
    [["reset", "--hard", "HEAD~1"], "reset"],
    [["clean", "-fd"], "clean"],
    [["rebase", "main"], "rebase"],
    [["branch", "-D", "x"], "branch"],
    [["fetch"], "fetch"],
    [["merge", "main"], "merge"],
  ])("rechaza %j y dice el motivo", (argumentos, nombre) => {
    expect(motivoDeGitProhibido(argumentos)).toContain(nombre);
  });

  it("rechaza las banderas peligrosas aunque la operación esté permitida", () => {
    expect(motivoDeGitProhibido(["commit", "--amend"])).toContain("--amend");
    expect(motivoDeGitProhibido(["commit", "--no-verify", "-m", "x"])).toContain("--no-verify");
    expect(motivoDeGitProhibido(["checkout", "-f", "main"])).toContain("-f");
  });

  it("add exige archivos explícitos: nada de -A, --all, punto ni -u", () => {
    for (const argumentos of [["add", "-A"], ["add", "--all"], ["add", "."], ["add", "-u"], ["add", "a.ts"], ["add", "--"]]) {
      expect(motivoDeGitProhibido(argumentos), argumentos.join(" ")).not.toBeNull();
    }
  });

  it("ejecutarGitPermitido rechaza antes de lanzar nada y lanza lo permitido", () => {
    const ejecutor = vi.fn(() => ({ status: 0, stdout: "ok", stderr: "" }));
    expect(() => ejecutarGitPermitido("/x", ["push"], ejecutor)).toThrow(/no está permitida/);
    expect(ejecutor).not.toHaveBeenCalled();
    expect(ejecutarGitPermitido("/x", ["status", "--porcelain"], ejecutor).stdout).toBe("ok");
    expect(ejecutor).toHaveBeenCalledWith(["status", "--porcelain"], "/x");
  });
});
