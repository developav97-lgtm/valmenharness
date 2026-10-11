/**
 * Las rutas que toca un diff: el origen de un renombre, los borrados y las rutas no ASCII.
 *
 * Todo corre contra un repositorio git de verdad en una carpeta temporal: lo que se afirma es la
 * lectura que git hace de un renombre o de un nombre no ASCII, y un simulacro no lo probaría.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  archivosDelDiff,
  cambiosDeRuta,
  motivoDeGitDeIntegracion,
  motivoDeGitDeQaAgent,
  pendingChanges,
  rutaProhibidaParaQaAgente,
  rutasQueCuentan,
  scanPendingChanges,
  type CambioDeRuta,
} from "../packages/engine/src/index.js";

const temporales: string[] = [];
afterEach(() => {
  for (const t of temporales.splice(0)) rmSync(t, { recursive: true, force: true });
});

interface Repo {
  readonly dir: string;
  git(...args: string[]): string;
  escribir(ruta: string, contenido: string): void;
  mv(desde: string, hacia: string): void;
  commit(mensaje: string): string;
}

/** Un repositorio git temporal con `core.quotepath` en su valor por defecto. */
function repo(): Repo {
  const dir = mkdtempSync(join(tmpdir(), "valmen-rutas-"));
  temporales.push(dir);
  const git = (...args: string[]): string =>
    execFileSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", ...args], {
      cwd: dir,
      encoding: "utf8",
    }).trim();
  git("init", "-q", "-b", "main");
  return {
    dir,
    git,
    escribir: (ruta, contenido) => {
      mkdirSync(dirname(join(dir, ruta)), { recursive: true });
      writeFileSync(join(dir, ruta), contenido, "utf8");
    },
    mv: (desde, hacia) => {
      mkdirSync(dirname(join(dir, hacia)), { recursive: true });
      git("mv", desde, hacia);
    },
    commit: (mensaje) => {
      git("add", "-A");
      git("commit", "-q", "-m", mensaje);
      return git("rev-parse", "HEAD");
    },
  };
}

const ejecutor = (r: Repo) => (args: readonly string[]) => {
  const s = spawnSync("git", [...args], { cwd: r.dir, encoding: "utf8" });
  return { status: s.status ?? 1, stdout: s.stdout ?? "", stderr: s.stderr ?? "" };
};

const CUERPO = Array.from({ length: 20 }, (_, i) => `línea ${i}`).join("\n") + "\n";

interface CasoRutas {
  readonly criterio: string;
  readonly titulo: string;
  /** Deja el repositorio con un commit base y un commit con el cambio. */
  readonly cambio: (r: Repo) => void;
  readonly base: Readonly<Record<string, string>>;
  /** Qué cambios deben aparecer (estado → ruta) y qué rutas cuentan. */
  readonly estado?: { readonly estado: CambioDeRuta["estado"]; readonly ruta: string };
  readonly soloEstado?: CambioDeRuta["estado"];
  readonly cuentan: readonly string[];
}

const CASOS_QUE_CUENTAN: readonly CasoRutas[] = [
  {
    criterio: "C1",
    titulo: "el origen de un renombre cuenta",
    base: { "migrations/0001_init.sql": CUERPO },
    cambio: (r) => {
      r.mv("migrations/0001_init.sql", "src/inofensivo.ts");
    },
    estado: { estado: "R", ruta: "src/inofensivo.ts" },
    cuentan: ["migrations/0001_init.sql", "src/inofensivo.ts"],
  },
  {
    criterio: "C2",
    titulo: "la ruta de un borrado cuenta",
    base: { "src/borrar.ts": CUERPO },
    cambio: (r) => {
      r.git("rm", "-q", "src/borrar.ts");
    },
    estado: { estado: "D", ruta: "src/borrar.ts" },
    cuentan: ["src/borrar.ts"],
  },
  {
    criterio: "C3",
    titulo: "el origen de una copia no cuenta",
    base: { "src/a.ts": CUERPO },
    cambio: (r) => {
      r.escribir("src/b.ts", CUERPO);
      r.escribir("src/a.ts", `${CUERPO}// tocado\n`);
    },
    estado: { estado: "C", ruta: "src/b.ts" },
    soloEstado: "C",
    cuentan: ["src/b.ts"],
  },
  {
    criterio: "C6",
    titulo: "un renombre muy reescrito conserva la ruta vieja",
    base: { "migrations/0001_init.sql": CUERPO },
    cambio: (r) => {
      r.git("rm", "-q", "migrations/0001_init.sql");
      r.escribir("src/otra.ts", "nada que ver con lo anterior\n");
    },
    cuentan: ["migrations/0001_init.sql", "src/otra.ts"],
  },
];

describe("rutasQueCuentan, tabla «rutas que cuentan»", () => {
  for (const caso of CASOS_QUE_CUENTAN) {
    it(`${caso.criterio}: ${caso.titulo}`, () => {
      const r = repo();
      for (const [ruta, contenido] of Object.entries(caso.base))
        r.escribir(ruta, contenido);
      const base = r.commit("base");
      caso.cambio(r);
      const entregado = r.commit("cambio");
      const cambios = cambiosDeRuta(ejecutor(r), `${base}..${entregado}`);
      if (caso.estado !== undefined) {
        expect(cambios.map((c) => [c.estado, c.ruta])).toContainEqual([
          caso.estado.estado,
          caso.estado.ruta,
        ]);
      }
      const evaluados =
        caso.soloEstado === undefined
          ? cambios
          : cambios.filter((c) => c.estado === caso.soloEstado);
      expect(rutasQueCuentan(evaluados)).toEqual([...caso.cuentan].sort());
    });
  }
});

describe("cambiosDeRuta, tabla «lectura cruda»", () => {
  const filas: readonly (readonly [string, string, string])[] = [
    [
      "C4",
      "una ruta no ASCII llega con sus caracteres reales",
      ".valmen/configuración.yaml",
    ],
    ["C5", "una ruta con comilla doble llega sin comillas", 'src/di"ce.ts'],
  ];
  for (const [criterio, titulo, ruta] of filas) {
    it(`${criterio}: ${titulo}`, () => {
      const r = repo();
      r.escribir("README.md", "x\n");
      const base = r.commit("base");
      r.escribir(ruta, CUERPO);
      const entregado = r.commit("alta");
      expect(cambiosDeRuta(ejecutor(r), `${base}..${entregado}`)).toEqual([
        { estado: "A", ruta, origen: null },
      ]);
    });
  }
});

describe("las listas cerradas de git, tabla «listas cerradas»", () => {
  const NUEVA = ["diff", "--name-status", "-z", "-M", "-C"];
  const filas: readonly (readonly [
    string,
    string,
    (a: readonly string[]) => string | null,
    readonly string[],
    boolean,
  ])[] = [
    [
      "C9",
      "qa-agent admite la forma nueva",
      motivoDeGitDeQaAgent,
      [...NUEVA, "a..b"],
      true,
    ],
    [
      "C10",
      "qa-agent rechaza --name-only",
      motivoDeGitDeQaAgent,
      ["diff", "--name-only", "a..b"],
      false,
    ],
    [
      "C10",
      "qa-agent rechaza --diff-filter=A",
      motivoDeGitDeQaAgent,
      ["diff", "--name-only", "--diff-filter=A", "a..b"],
      false,
    ],
    [
      "C10",
      "qa-agent rechaza la forma sin -M -C",
      motivoDeGitDeQaAgent,
      ["diff", "--name-status", "-z", "a..b"],
      false,
    ],
    [
      "C13",
      "la integración admite la forma nueva",
      motivoDeGitDeIntegracion,
      [...NUEVA, "main...valmen/t"],
      true,
    ],
    [
      "C13",
      "la integración rechaza --name-only",
      motivoDeGitDeIntegracion,
      ["diff", "--name-only", "-z", "main...valmen/t"],
      false,
    ],
  ];
  for (const [criterio, titulo, motivo, args, admite] of filas) {
    it(`${criterio}: ${titulo}`, () => {
      if (admite) expect(motivo(args)).toBeNull();
      else expect(motivo(args)).not.toBeNull();
    });
  }
});

describe("los consumidores, tabla «consumidores»", () => {
  it("C7: archivosDelDiff devuelve el origen de un renombre desde una migración", () => {
    const r = repo();
    r.escribir("migrations/0001_init.sql", CUERPO);
    const base = r.commit("base");
    r.mv("migrations/0001_init.sql", "src/inofensivo.ts");
    r.commit("renombra");
    expect(archivosDelDiff(r.dir, base, (a, cwd) => spawnGit(a, cwd))).toEqual([
      "migrations/0001_init.sql",
      "src/inofensivo.ts",
    ]);
  });

  it("C8: la ruta no ASCII que devuelve archivosDelDiff se clasifica como migraciones", () => {
    const r = repo();
    r.escribir("README.md", "x\n");
    const base = r.commit("base");
    r.escribir("migrations/0002_índice.sql", "select 1;\n");
    r.commit("alta");
    const archivos = archivosDelDiff(r.dir, base, (a, cwd) => spawnGit(a, cwd));
    expect(archivos).toEqual(["migrations/0002_índice.sql"]);
    expect(rutaProhibidaParaQaAgente(archivos[0]!)).toBe("migraciones");
  });

  it("C15: pendingChanges cuenta un archivo borrado entre sus archivos", () => {
    const r = repo();
    r.escribir("src/keep.ts", CUERPO);
    r.escribir("src/otro.ts", CUERPO);
    r.commit("base");
    r.git("rm", "-q", "src/keep.ts");
    r.escribir("src/otro.ts", `${CUERPO}nueva\n`);
    r.git("add", "-A");
    expect(pendingChanges(r.dir, true).files).toEqual(["src/keep.ts", "src/otro.ts"]);
  });

  const AWS = `AKIA${"IOSFODNN7EXAMPLE".slice(0, 16)}`;
  function conSecretoNoAscii(): Repo {
    const r = repo();
    r.escribir("src/keep.ts", CUERPO);
    r.commit("base");
    r.git("rm", "-q", "src/keep.ts");
    r.escribir("src/clavé.ts", `const k = "${AWS}";\n`);
    r.git("add", "-A");
    return r;
  }

  it("C16: scanPendingChanges detecta un secreto en un archivo de nombre no ASCII", () => {
    const r = conSecretoNoAscii();
    expect(scanPendingChanges(r.dir, true).findings.length).toBeGreaterThan(0);
  });

  it("C17: el hallazgo de ese secreto lleva la ruta real del archivo", () => {
    const r = conSecretoNoAscii();
    expect(scanPendingChanges(r.dir, true).findings.map((f) => f.path)).toEqual([
      "src/clavé.ts",
    ]);
  });
});

function spawnGit(args: readonly string[], cwd: string) {
  const s = spawnSync("git", [...args], { cwd, encoding: "utf8" });
  return { status: s.status ?? 1, stdout: s.stdout ?? "", stderr: s.stderr ?? "" };
}
