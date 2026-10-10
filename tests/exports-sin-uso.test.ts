/**
 * La guarda de exportaciones sin consumidor (CHORE-CI-EXPORTS-SIN-USO-20261010).
 *
 * Tres capas, de la más barata a la más real:
 *
 * 1. **Unitarias** de `hallazgosDeKnip` y `compararConLineaBase` con un JSON de `knip` de
 *    ejemplo, para fijar qué cuenta como hallazgo y cómo se compara con la línea base.
 * 2. **Integración** sobre un monorepo mínimo armado en un directorio temporal, que corre
 *    el `knip` real con el `knip.json` real del repositorio: es la afirmación que importa,
 *    porque prueba que una función huérfana falla y que una exportación que solo consume
 *    una prueba, un guion o un `bin` no.
 * 3. **Contrato** sobre los archivos del repositorio (`package.json`, el flujo del CI, los
 *    `package.json` de cada paquete y la línea base), más la regresión de lo que ya existía.
 *
 * El módulo bajo prueba se carga con `import()` dinámico para que, antes de existir, cada
 * prueba falle por su propia afirmación y no todas a la vez por un import roto.
 */
import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { SalidaDeKnip } from "../scripts/exports-sin-uso.mjs";

type Modulo = typeof import("../scripts/exports-sin-uso.mjs");
const cargar = (): Promise<Modulo> => import("../scripts/exports-sin-uso.mjs");

const RAIZ = join(import.meta.dirname, "..");
const GUION = join(RAIZ, "scripts", "exports-sin-uso.mjs");
const LINEA_BASE = "scripts/exports-sin-uso.linea-base.json";

const leerJson = (ruta: string): unknown =>
  JSON.parse(readFileSync(join(RAIZ, ruta), "utf8"));

interface PackageJson {
  scripts?: Record<string, string>;
  devDependencies?: Record<string, string>;
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
}

// ---------------------------------------------------------------------------
// 1. Unitarias
// ---------------------------------------------------------------------------

/** La forma de la salida de `knip --reporter json` en la versión fijada (H4). */
const KNIP_DE_EJEMPLO = {
  issues: [
    {
      file: "packages/core/src/b.ts",
      exports: [{ name: "zeta", line: 3, col: 14, pos: 40 }],
      types: [{ name: "Tipo", line: 9, col: 13, pos: 120 }],
      files: [],
    },
    {
      file: "packages/core/src/a.ts",
      exports: [{ name: "alfa", line: 1, col: 17, pos: 16 }],
      types: [],
      files: [],
    },
    {
      file: "packages/engine/src/suelto.ts",
      exports: [],
      types: [],
      files: [{ name: "packages/engine/src/suelto.ts" }],
    },
    // Fuera de `packages/*/src`: no es del alcance del ticket y no entra.
    {
      file: "scripts/guion.mjs",
      exports: [{ name: "fuera", line: 1 }],
      types: [],
      files: [],
    },
    { file: "tests/x.test.ts", exports: [{ name: "otra", line: 2 }], types: [], files: [] },
    {
      file: "packages/server/web/agentes/motor.d.ts",
      exports: [{ name: "enLaWeb", line: 4 }],
      types: [],
      files: [],
    },
  ],
};

describe("hallazgosDeKnip", () => {
  it("devuelve «ruta#símbolo» ordenado, con tipos y archivos enteros, solo de packages/*/src", async () => {
    const { hallazgosDeKnip } = await cargar();
    expect(hallazgosDeKnip(KNIP_DE_EJEMPLO)).toEqual([
      "packages/core/src/a.ts#alfa",
      "packages/core/src/b.ts#Tipo",
      "packages/core/src/b.ts#zeta",
      "packages/engine/src/suelto.ts",
    ]);
  });

  it("no repite una entrada que knip informa dos veces", async () => {
    const { hallazgosDeKnip } = await cargar();
    const alfa = { file: "packages/core/src/a.ts", exports: [{ name: "alfa", line: 1 }] };
    const doble = { issues: [alfa, alfa] };
    expect(hallazgosDeKnip(doble)).toEqual(["packages/core/src/a.ts#alfa"]);
  });
});

describe("compararConLineaBase", () => {
  it("separa lo nuevo (no está en la base) de lo sobrante (la base lo nombra y ya no aplica)", async () => {
    const { compararConLineaBase } = await cargar();
    const actual = ["p/a.ts#uno", "p/a.ts#dos", "p/b.ts#tres"];
    const base = ["p/a.ts#uno", "p/c.ts#cuatro"];
    expect(compararConLineaBase(actual, base)).toEqual({
      nuevas: ["p/a.ts#dos", "p/b.ts#tres"],
      sobrantes: ["p/c.ts#cuatro"],
    });
  });

  it("con lo mismo en ambos lados no hay nada nuevo ni sobrante", async () => {
    const { compararConLineaBase } = await cargar();
    expect(compararConLineaBase(["p/a.ts#uno"], ["p/a.ts#uno"])).toEqual({
      nuevas: [],
      sobrantes: [],
    });
  });
});

// ---------------------------------------------------------------------------
// 2. Integración sobre un monorepo mínimo
// ---------------------------------------------------------------------------

const HUERFANA = "packages/engine/src/huerfana.ts#funcionHuerfana";

function escribir(raiz: string, ruta: string, contenido: string): void {
  const destino = join(raiz, ruta);
  mkdirSync(dirname(destino), { recursive: true });
  writeFileSync(destino, contenido);
}

/**
 * Arma el monorepo mínimo con la misma forma que el real: paquetes con `src/index.ts`
 * que reexporta con `export *`, un `bin` con su `main.ts`, una prueba en `tests/` y un
 * guion en `scripts/` que importa el `dist` —y un `dist` ya construido, que es como
 * llega al paso del CI: el `typecheck` construye antes.
 */
function armarMonorepo(): string {
  const dir = mkdtempSync(join(tmpdir(), "exports-sin-uso-"));
  const tsconfig = JSON.stringify({
    compilerOptions: {
      target: "ES2023",
      module: "NodeNext",
      moduleResolution: "NodeNext",
      outDir: "./dist",
      rootDir: "./src",
    },
    include: ["src/**/*.ts"],
  });
  escribir(
    dir,
    "package.json",
    JSON.stringify({
      name: "mini",
      private: true,
      type: "module",
      workspaces: ["packages/*"],
    }),
  );
  escribir(
    dir,
    "packages/engine/package.json",
    JSON.stringify({
      name: "@mini/engine",
      version: "0.0.1",
      type: "module",
      main: "./dist/index.js",
      types: "./dist/index.d.ts",
      exports: { ".": { types: "./dist/index.d.ts", default: "./dist/index.js" } },
    }),
  );
  escribir(dir, "packages/engine/tsconfig.json", tsconfig);
  escribir(
    dir,
    "packages/cli/package.json",
    JSON.stringify({
      name: "@mini/cli",
      version: "0.0.1",
      type: "module",
      bin: { mini: "./dist/main.js" },
    }),
  );
  escribir(dir, "packages/cli/tsconfig.json", tsconfig);
  escribir(
    dir,
    "packages/engine/src/index.ts",
    [
      'export * from "./huerfana.js";',
      'export * from "./de-prueba.js";',
      'export * from "./de-guion.js";',
      'export * from "./de-bin.js";',
      "",
    ].join("\n"),
  );
  escribir(
    dir,
    "packages/engine/src/huerfana.ts",
    "export function funcionHuerfana() { return 1; }\n",
  );
  escribir(
    dir,
    "packages/engine/src/de-prueba.ts",
    "export function soloLaPrueba() { return 2; }\n",
  );
  escribir(
    dir,
    "packages/engine/src/de-guion.ts",
    "export function soloElGuion() { return 3; }\n",
  );
  escribir(
    dir,
    "packages/engine/src/de-bin.ts",
    "export function soloElBin() { return 4; }\n",
  );
  escribir(
    dir,
    "packages/cli/src/main.ts",
    'import { soloElBin } from "@mini/engine";\nconsole.log(soloElBin());\n',
  );
  escribir(
    dir,
    "tests/uso.test.ts",
    'import { soloLaPrueba } from "../packages/engine/src/index.js";\nconsole.log(soloLaPrueba());\n',
  );
  escribir(
    dir,
    "scripts/guion.mjs",
    'import { soloElGuion } from "../packages/engine/dist/index.js";\nconsole.log(soloElGuion());\n',
  );
  // El `dist` construido: lo que `npm run typecheck` deja antes del paso del CI.
  escribir(dir, "packages/engine/dist/index.js", "export {};\n");
  // La configuración real del repositorio: lo que se prueba es esa, no una copia a mano.
  cpSync(join(RAIZ, "knip.json"), join(dir, "knip.json"));
  return dir;
}

describe("integración: el chequeo sobre un monorepo mínimo", () => {
  let dir = "";
  let knip: SalidaDeKnip = {};

  beforeAll(async () => {
    dir = armarMonorepo();
    const { ejecutarKnip } = await cargar();
    knip = ejecutarKnip(dir);
  }, 120_000);

  afterAll(() => {
    if (dir !== "") rmSync(dir, { recursive: true, force: true });
  });

  /** Corre el chequeo con la línea base dada, reutilizando el JSON de `knip` ya medido. */
  async function comprobarCon(base: string[]) {
    const { comprobar } = await cargar();
    escribir(dir, LINEA_BASE, `${JSON.stringify(base, null, 2)}\n`);
    return comprobar(dir, () => knip);
  }

  it("C1: una función exportada en packages/engine/src que nadie importa hace fallar con salida 1", async () => {
    const resultado = await comprobarCon([]);
    expect(resultado.exitCode).toBe(1);
  });

  it("C2: el mensaje nombra la función junto a su archivo y su línea, y solo a ella", async () => {
    const { texto } = await comprobarCon([]);
    expect(texto).toContain(
      "Exportación sin consumidor: `funcionHuerfana` en `packages/engine/src/huerfana.ts:1`",
    );
    for (const consumida of ["soloLaPrueba", "soloElGuion", "soloElBin"]) {
      expect(texto).not.toContain(consumida);
    }
  });

  it("si a un paquete le falta el dist, el fallo avisa de construir antes (los guiones lo importan)", async () => {
    const { texto } = await comprobarCon([]);
    expect(texto).toContain("falta packages/cli/dist");
    expect(texto).toContain("npm run build");
  });

  it("C3, C4 y C5: lo que solo importa una prueba, un guion o un bin cuenta como consumido", async () => {
    const { hallazgosDeKnip } = await cargar();
    expect(hallazgosDeKnip(knip)).toEqual([HUERFANA]);
  });

  it("con la huérfana en la línea base, el chequeo pasa y dice cuántas entradas tiene (C12)", async () => {
    const resultado = await comprobarCon([HUERFANA]);
    expect(resultado.exitCode).toBe(0);
    expect(resultado.texto).toBe(
      "Sin exportaciones nuevas sin consumidor; la línea base tiene 1 entrada",
    );
  });

  it("C6: una entrada de la línea base cuyo símbolo se borró hace fallar pidiendo quitarla", async () => {
    const borrada = "packages/engine/src/borrada.ts#yaNoExiste";
    const resultado = await comprobarCon([HUERFANA, borrada]);
    expect(resultado.exitCode).toBe(1);
    expect(resultado.texto).toContain(
      `La línea base nombra \`${borrada}\`, que ya tiene consumidor o ya no existe: quitala de ${LINEA_BASE}`,
    );
  });

  it("C7: una entrada de la línea base cuyo símbolo ganó un consumidor hace fallar pidiendo quitarla", async () => {
    const consumida = "packages/engine/src/de-prueba.ts#soloLaPrueba";
    const resultado = await comprobarCon([HUERFANA, consumida]);
    expect(resultado.exitCode).toBe(1);
    expect(resultado.texto).toContain(
      `La línea base nombra \`${consumida}\`, que ya tiene consumidor o ya no existe: quitala de ${LINEA_BASE}`,
    );
  });

  it("con varias entradas el resumen va en plural", async () => {
    const { comprobar } = await cargar();
    const nombres = ["uno", "dos", "tres"];
    const json = {
      issues: nombres.map((name) => ({
        file: "packages/x/src/a.ts",
        exports: [{ name, line: 1 }],
        types: [],
        files: [],
      })),
    };
    escribir(
      dir,
      LINEA_BASE,
      `${JSON.stringify(nombres.map((n) => `packages/x/src/a.ts#${n}`))}\n`,
    );
    const resultado = comprobar(dir, () => json);
    expect(resultado.exitCode).toBe(0);
    expect(resultado.texto).toContain("la línea base tiene 3 entradas");
  });

  it("por la línea de comandos: sale con 1 y nombra la función en la salida de error", () => {
    escribir(dir, LINEA_BASE, "[]\n");
    const r = spawnSync(process.execPath, [GUION, "--directory", dir], {
      encoding: "utf8",
    });
    expect(r.status).toBe(1);
    expect(`${r.stdout}${r.stderr}`).toContain("`funcionHuerfana`");
  }, 60_000);

  it("C8: --crear-linea-base crea el archivo si no existe y se niega a sobrescribirlo si existe", () => {
    const ruta = join(dir, LINEA_BASE);
    rmSync(ruta, { force: true });

    const creada = spawnSync(
      process.execPath,
      [GUION, "--directory", dir, "--crear-linea-base"],
      {
        encoding: "utf8",
      },
    );
    expect(creada.status).toBe(0);
    expect(JSON.parse(readFileSync(ruta, "utf8"))).toEqual([HUERFANA]);

    // El PO achica a mano la línea base: la opción no puede volver a llenarla.
    const editada = "[]\n";
    writeFileSync(ruta, editada);
    const negada = spawnSync(
      process.execPath,
      [GUION, "--directory", dir, "--crear-linea-base"],
      {
        encoding: "utf8",
      },
    );
    expect(negada.status).toBe(2);
    expect(`${negada.stdout}${negada.stderr}`).toContain("ya existe");
    expect(readFileSync(ruta, "utf8")).toBe(editada);
  }, 120_000);
});

// ---------------------------------------------------------------------------
// 3. Contrato sobre los archivos del repositorio
// ---------------------------------------------------------------------------

describe("el paso local y el CI", () => {
  it("C9: el script exports:check del package.json corre node scripts/exports-sin-uso.mjs", () => {
    const pkg = leerJson("package.json") as PackageJson;
    expect(pkg.scripts?.["exports:check"]).toBe("node scripts/exports-sin-uso.mjs");
  });

  it("C10: el flujo de verificación tiene un paso que corre npm run exports:check", () => {
    const flujo = readFileSync(join(RAIZ, ".github/workflows/verificacion.yml"), "utf8");
    expect(flujo).toMatch(/^\s+run: npm run exports:check\s*$/m);
  });

  it("el paso nuevo va entre el lint y el formato", () => {
    const flujo = readFileSync(join(RAIZ, ".github/workflows/verificacion.yml"), "utf8");
    const pasos = [...flujo.matchAll(/^\s+- name: (.+)$/gm)].map((m) => m[1]);
    const lint = pasos.indexOf("Lint");
    expect(lint).toBeGreaterThan(-1);
    expect(pasos[lint + 1]).toBe("Exportaciones sin consumidor");
    expect(pasos[lint + 2]).toBe("Formato");
  });

  it("regresión: el flujo conserva sus pasos de siempre, en su orden y con su comando", () => {
    const flujo = readFileSync(join(RAIZ, ".github/workflows/verificacion.yml"), "utf8");
    const pasos = [...flujo.matchAll(/^\s+- name: (.+)$/gm)]
      .map((m) => m[1])
      .filter((nombre) => nombre !== "Exportaciones sin consumidor");
    expect(pasos).toEqual([
      "Tipos de todo, tests incluidos",
      "Lint",
      "Formato",
      "La proyección está al día",
      "El registro se valida con el propio motor",
      "La interfaz se ejecuta",
      "Pruebas",
    ]);
    for (const comando of [
      "run: npm ci",
      "run: npm run typecheck",
      "run: npm run lint",
      "run: npm run format:check",
      "run: node packages/cli/dist/main.js validate --all",
      "run: node scripts/verificar-interfaz.mjs",
      "run: npm test",
    ]) {
      expect(flujo).toContain(comando);
    }
  });

  it("regresión: los scripts de npm que ya existían siguen con el mismo comando", () => {
    const pkg = leerJson("package.json") as PackageJson;
    expect(pkg.scripts).toMatchObject({
      clean: "rm -rf packages/*/dist .tsbuildinfo packages/*/*.tsbuildinfo",
      build: "tsc --build tsconfig.build.json && node scripts/copy-web.mjs",
      test: "vitest run",
      "test:watch": "vitest",
      "verify:hermes": "node scripts/verificar-hermes.mjs",
      typecheck: "npm run build && tsc --noEmit -p tsconfig.json",
      lint: "eslint .",
      format: "prettier --write .",
      "format:check": "prettier --check .",
    });
  });
});

describe("la dependencia de desarrollo", () => {
  it("C13: knip figura en las devDependencies de la raíz con versión exacta", () => {
    const pkg = leerJson("package.json") as PackageJson;
    expect(pkg.devDependencies?.knip).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("C14: ningún package.json de packages/* declara knip", () => {
    const paquetes = readdirSync(join(RAIZ, "packages")).filter((n) =>
      existsSync(join(RAIZ, "packages", n, "package.json")),
    );
    expect(paquetes.length).toBeGreaterThan(5);
    for (const nombre of paquetes) {
      const pkg = leerJson(`packages/${nombre}/package.json`) as PackageJson;
      for (const campo of [
        "dependencies",
        "devDependencies",
        "peerDependencies",
        "optionalDependencies",
      ] as const) {
        expect(Object.keys(pkg[campo] ?? {}), `${nombre}.${campo}`).not.toContain("knip");
      }
    }
  });
});

describe("la línea base versionada", () => {
  const base = (): string[] => leerJson(LINEA_BASE) as string[];

  it("C15: es una lista ordenada sin entradas repetidas", () => {
    const lista = base();
    expect(Array.isArray(lista)).toBe(true);
    expect(lista.length).toBeGreaterThan(0);
    expect(lista).toEqual([...lista].sort());
    expect(new Set(lista).size).toBe(lista.length);
  });

  it("C16: incluye exportaciones de packages/engine/src, señal de que el uso opaco ya no ciega ese paquete", () => {
    expect(base().some((entrada) => entrada.startsWith("packages/engine/src/"))).toBe(true);
  });
});
