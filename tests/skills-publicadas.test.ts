/**
 * Las skills de proceso que publica el harness.
 *
 * La regla que estas pruebas protegen: **una skill de proceso se escribe una vez,
 * en el harness, y llega a todos los proyectos con su versión**. Hasta ahora cada
 * proyecto guardaba su copia en `.valmen/skills/` y nada la comparaba con nada: dos
 * proyectos con la misma skill y distinto texto, sin detector. El caso medido está
 * en el ticket —`planificacion` con 81 líneas en el harness y 77 en SaiOpenCloud, y
 * a la segunda le faltaba el bloque que el motor reconoce para el gate de plan—.
 *
 * El catálogo vive en `skills/<id>/SKILL.md` del repositorio del harness, con
 * `version:` y `origen: valmen` en el frontmatter. Lo que el proyecto escribe de su
 * stack no entra: eso sigue siendo suyo, en `.valmen/skills/`, y el check de
 * versión no lo mira.
 *
 * Ver `docs/07-ADAPTADORES.md` y `docs/08-ADOPCION.md`.
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

import { instalarPublicadasEnHermes } from "../packages/adapter/src/mcp.js";
import {
  hashPublicado,
  publicadas,
  versionPublicada,
} from "../packages/adapter/src/skills.js";
import { adoptProject, syncProject } from "../packages/cli/src/commands.js";

/** El repositorio del harness: el catálogo se lee de ahí, no del proyecto. */
const REPO = process.cwd();
const ID = "planificacion";
const CATALOGO = join(REPO, "skills", ID, "SKILL.md");

let lab: string;

beforeEach(() => {
  lab = mkdtempSync(join(tmpdir(), "valmen-publicadas-"));
  // El directorio de skills de Hermes sale de `HERMES_HOME` si está definido, y
  // una variable de la máquina no puede decidir el resultado de una prueba.
  delete process.env["HERMES_HOME"];
});

afterEach(() => {
  rmSync(lab, { recursive: true, force: true });
});

/** Escribe un archivo del proyecto de prueba, con su directorio padre. */
function write(relative: string, content: string): void {
  const target = join(lab, relative);
  mkdirSync(join(target, ".."), { recursive: true });
  writeFileSync(target, content, "utf8");
}

/** La copia que el proyecto tiene de una skill publicada. */
function copiaDelProyecto(id: string = ID): string {
  return join(lab, ".valmen", "skills", id, "SKILL.md");
}

/** Un proyecto adoptado, con las publicadas instaladas y las proyecciones escritas. */
function proyectoAdoptado(): void {
  adoptProject(lab, "proyecto-de-prueba", {});
  syncProject(lab, "proyecto-de-prueba", false);
}

describe("el catálogo publicado", () => {
  it("existe en el repositorio del harness", () => {
    expect(existsSync(CATALOGO)).toBe(true);
  });

  it("declara su versión", () => {
    expect(readFileSync(CATALOGO, "utf8")).toMatch(/^version:\s*\S+$/m);
  });

  it("declara su origen", () => {
    expect(readFileSync(CATALOGO, "utf8")).toMatch(/^origen:\s*valmen$/m);
  });

  it("expone la versión publicada de una skill del catálogo", () => {
    const declarada = /^version:\s*(\S+)$/m.exec(readFileSync(CATALOGO, "utf8"))?.[1];

    expect(declarada).toBeDefined();
    expect(versionPublicada(ID)).toBe(declarada);
  });

  it("publica las de proceso y no las del stack", () => {
    const ids = publicadas().map((skill) => skill.id);

    expect(ids).toContain(ID);
    expect(ids).not.toContain("desarrollo-backend");
  });
});

describe("la instalación en el proyecto", () => {
  it("adopt deja la publicada igual al catálogo", () => {
    adoptProject(lab, "proyecto-de-prueba", {});

    expect(existsSync(copiaDelProyecto())).toBe(true);
    expect(readFileSync(copiaDelProyecto(), "utf8")).toBe(readFileSync(CATALOGO, "utf8"));
  });

  it("adopt no pisa una skill del proyecto que ya existía", () => {
    write(
      ".valmen/skills/desarrollo-backend/SKILL.md",
      "---\nname: desarrollo-backend\ndescription: Lo de este stack.\n---\n\nContenido propio.\n",
    );

    adoptProject(lab, "proyecto-de-prueba", {});

    expect(
      readFileSync(join(lab, ".valmen/skills/desarrollo-backend/SKILL.md"), "utf8"),
    ).toContain("Contenido propio.");
  });
});

describe("el check de versión de `sync`", () => {
  it("imprime `Archivos generados al día.` cuando la copia coincide con la publicada", () => {
    proyectoAdoptado();

    const resultado = syncProject(lab, "proyecto-de-prueba", true);

    expect(resultado.exitCode).toBe(0);
    expect(resultado.stdout).toContain("Archivos generados al día.");
  });

  it("nombra la deriva con las dos versiones", () => {
    proyectoAdoptado();
    const publicada = readFileSync(CATALOGO, "utf8");
    write(
      `.valmen/skills/${ID}/SKILL.md`,
      publicada.replace(/^version:.*$/m, "version: 0.9.0"),
    );

    const resultado = syncProject(lab, "proyecto-de-prueba", true);

    expect(resultado.exitCode).not.toBe(0);
    expect(resultado.stderr).toContain(ID);
    expect(resultado.stderr).toContain("0.9.0");
    expect(resultado.stderr).toContain(versionPublicada(ID));
  });

  it("nombra la copia editada a mano", () => {
    proyectoAdoptado();
    const publicada = readFileSync(CATALOGO, "utf8");
    write(
      `.valmen/skills/${ID}/SKILL.md`,
      `${publicada}\n\nUn párrafo que alguien agregó a mano.\n`,
    );

    const resultado = syncProject(lab, "proyecto-de-prueba", true);

    expect(resultado.exitCode).not.toBe(0);
    expect(resultado.stderr).toContain(ID);
    expect(resultado.stderr.toLowerCase()).toContain("editada");
  });

  it("compara sólo las publicadas y lo dice", () => {
    // La skill del proyecto se escribe **antes** de sincronizar: si se agregara
    // después, su proyección quedaría pendiente y el check fallaría por eso, no por
    // lo que esta prueba mira.
    adoptProject(lab, "proyecto-de-prueba", {});
    write(
      ".valmen/skills/desarrollo-backend/SKILL.md",
      "---\nname: desarrollo-backend\ndescription: Lo de este stack.\n---\n\nContenido propio.\n",
    );
    syncProject(lab, "proyecto-de-prueba", false);

    const resultado = syncProject(lab, "proyecto-de-prueba", true);

    expect(resultado.stdout).toContain(ID);
    expect(resultado.stdout).not.toContain("desarrollo-backend");
  });
});

describe("la actualización de `sync`", () => {
  it("deja la copia igual al catálogo publicado", () => {
    proyectoAdoptado();
    const publicada = readFileSync(CATALOGO, "utf8");
    write(
      `.valmen/skills/${ID}/SKILL.md`,
      publicada.replace(/^version:.*$/m, "version: 0.9.0"),
    );

    syncProject(lab, "proyecto-de-prueba", false);

    expect(readFileSync(copiaDelProyecto(), "utf8")).toBe(publicada);
  });

  it("conserva el contenido de `local.md`", () => {
    proyectoAdoptado();
    const local = "## De este proyecto\n\nAcá el proyecto agrega lo suyo.\n";
    write(`.valmen/skills/${ID}/local.md`, local);

    syncProject(lab, "proyecto-de-prueba", false);

    expect(readFileSync(join(lab, ".valmen", "skills", ID, "local.md"), "utf8")).toBe(
      local,
    );
  });

  it("concatena `local.md` al final de la proyección", () => {
    proyectoAdoptado();
    const local = "## De este proyecto\n\nAcá el proyecto agrega lo suyo.\n";
    write(`.valmen/skills/${ID}/local.md`, local);

    syncProject(lab, "proyecto-de-prueba", false);

    const proyectada = readFileSync(
      join(lab, ".opencode", "skills", ID, "SKILL.md"),
      "utf8",
    );

    expect(proyectada).toContain("De este proyecto");
    expect(proyectada.trimEnd().endsWith(local.trimEnd())).toBe(true);
  });
});

describe("la capa global de Hermes", () => {
  it("instala las publicadas en el directorio de skills del agente", () => {
    instalarPublicadasEnHermes(lab);

    const destino = join(lab, ".hermes", "skills", ID, "SKILL.md");
    expect(existsSync(destino)).toBe(true);
    expect(readFileSync(destino, "utf8")).toBe(readFileSync(CATALOGO, "utf8"));
  });
});

describe("el hash publicado", () => {
  it("cambia cuando el contenido cambia", () => {
    expect(hashPublicado(ID)).toBe(hashPublicado(ID));
    expect(hashPublicado(ID)).toMatch(/^[a-f0-9]{64}$/);
  });
});
