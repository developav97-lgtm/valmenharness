/**
 * El dogfooding del registro, atado a las piezas que tienen que coincidir.
 *
 * R-S2-001 pide que este repositorio —que **es** el harness— trabaje con su
 * propio registro: `.valmen/` como fuente de verdad, su proyección en `AGENTS.md`
 * y el registro validado por el propio motor. Esa adopción se sostiene en una
 * convención mientras nada la compruebe: una regla reescrita puede quedarse sin
 * llegar a la proyección, y una edición a mano de `AGENTS.md` puede parecer
 * buena hasta que `sync --check` la delata. Lo que estas pruebas protegen es esa
 * atadura: la regla versionada, su proyección, la proyección recalculada por el
 * motor y las dos comprobaciones que declara el flujo.
 *
 * Las comprobaciones son por fragmentos cortos y no por párrafos enteros:
 * reescribir la regla no tiene que romper la suite, sólo cuando deja de nombrar
 * el modo directo o el flujo. Se leen solo archivos versionados —nunca el
 * registro vivo de `tickets/`—, para que el trabajo en curso de otra sesión no
 * ponga la prueba en rojo.
 */
import { readFileSync } from "node:fs";
import { basename, join } from "node:path";

import { describe, expect, it } from "vitest";

import { projectFiles } from "../packages/adapter/src/projection.js";

const REPO = process.cwd();

const REGLA = ".valmen/rules/proyecto.md";
const PROYECCION = "AGENTS.md";
const FLUJO = ".github/workflows/verificacion.yml";

/** Los fragmentos que acotan el modo directo y declaran el flujo. */
const FRAGMENTOS = [
  "modo directo",
  "triviales",
  "funcionalidad nueva",
  "flujo",
  "fuente de verdad",
];

const regla = readFileSync(join(REPO, REGLA), "utf8");
const proyeccion = readFileSync(join(REPO, PROYECCION), "utf8");
const flujo = readFileSync(join(REPO, FLUJO), "utf8");

describe("la regla del repositorio", () => {
  it("acota el modo directo a lo trivial y declara el flujo para la funcionalidad nueva", () => {
    for (const fragmento of FRAGMENTOS) {
      expect(regla, `la regla no nombra «${fragmento}»`).toContain(fragmento);
    }
  });
});

describe("la proyección de la regla", () => {
  it("repite los mismos fragmentos, que es como llega a los agentes", () => {
    for (const fragmento of FRAGMENTOS) {
      expect(proyeccion, `AGENTS.md no nombra «${fragmento}»`).toContain(fragmento);
    }
  });

  it("es idéntica a la proyección que el motor genera desde `.valmen/`", () => {
    const generados = projectFiles(REPO, basename(REPO));
    const agents = generados.files.find((file) => file.path === PROYECCION);
    expect(agents, "el motor no proyecta AGENTS.md").toBeDefined();
    expect(
      agents?.content,
      "AGENTS.md en disco no es lo que produce `valmen sync`: puede ser una edición a mano",
    ).toBe(proyeccion);
  });
});

describe("el flujo de integración continua", () => {
  it("declara la comprobación de la proyección y la validación del registro", () => {
    expect(flujo, "el flujo no comprueba la proyección").toContain("sync --check");
    expect(flujo, "el flujo no valida el registro").toContain("validate --all");
  });
});
