/**
 * La declaración de la preparación del ambiente de pruebas (R-CDEF-007, R-S5-008).
 *
 * Una migración es un cambio de datos, así que lo que se afirma acá es la frontera:
 *
 * 1. Sin `test-setup` el proyecto no cambia (`null`).
 * 2. Una sección válida se lee completa; una inválida falla **nombrando la clave**.
 * 3. La preparación solo se acepta si su esquema está en `allowed-schemas`; sin la lista,
 *    se rechaza —la ausencia no habilita nada—.
 * 4. El motor la lee del `config.yaml` del proyecto.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  parseConfig,
  readAllowedSchemas,
  readTestSetupConfig,
  testSetupRefusal,
} from "../packages/adapter/src/index.js";
import { allowedSchemas, testSetupConfig } from "../packages/engine/src/discovery.js";

const VALIDA = [
  "test-setup:",
  "  schema: test_saicloud",
  "  timeout: 120",
  "  commands:",
  "    - docker compose exec -T backend python manage.py migrate --noinput",
  "    - docker compose exec -T backend python manage.py test --keepdb --noinput",
  "allowed-schemas:",
  "  - test_saicloud",
  "",
].join("\n");

describe("leer test-setup", () => {
  it("sin la sección devuelve null", () => {
    expect(readTestSetupConfig(parseConfig("test-commands:\n  - npx vitest run\n"))).toBeNull();
  });

  it("lee una sección válida con su esquema, sus comandos y su tope", () => {
    const setup = readTestSetupConfig(parseConfig(VALIDA));
    expect(setup?.schema).toBe("test_saicloud");
    expect(setup?.commands).toHaveLength(2);
    expect(setup?.commands[1]).toContain("--keepdb");
    expect(setup?.timeoutMs).toBe(120_000);
  });

  it("el tope es opcional", () => {
    const setup = readTestSetupConfig(
      parseConfig("test-setup:\n  schema: t\n  commands:\n    - echo listo\n"),
    );
    expect(setup?.timeoutMs).toBeNull();
  });

  it.each([
    ["sin esquema", "test-setup:\n  commands:\n    - echo x\n", "test-setup.schema"],
    ["sin comandos", "test-setup:\n  schema: t\n", "test-setup.commands"],
    ["tope inválido", "test-setup:\n  schema: t\n  timeout: 0\n  commands:\n    - echo x\n", "test-setup.timeout"],
    ["tope que no es número", "test-setup:\n  schema: t\n  timeout: mucho\n  commands:\n    - echo x\n", "test-setup.timeout"],
  ])("falla nombrando la clave: %s", (_caso, texto, clave) => {
    expect(() => readTestSetupConfig(parseConfig(texto))).toThrow(clave);
  });
});

describe("esquemas permitidos", () => {
  const setup = readTestSetupConfig(parseConfig(VALIDA)) as NonNullable<
    ReturnType<typeof readTestSetupConfig>
  >;

  it("acepta un esquema de la lista", () => {
    expect(testSetupRefusal(setup, ["test_saicloud"])).toBeNull();
  });

  it("rechaza un esquema fuera de la lista y dice cuáles están permitidos", () => {
    const motivo = testSetupRefusal(setup, ["otro_esquema"]);
    expect(motivo).toContain("test_saicloud");
    expect(motivo).toContain("otro_esquema");
    expect(motivo).toContain("no se ejecuta");
  });

  it("una lista vacía rechaza cualquier esquema: la ausencia no habilita", () => {
    expect(testSetupRefusal(setup, [])).toContain("no declara allowed-schemas");
    expect(readAllowedSchemas(parseConfig("test-commands:\n  - npx vitest run\n"))).toEqual([]);
  });

  it("un elemento vacío en la lista es un error", () => {
    expect(() => readAllowedSchemas(parseConfig('allowed-schemas:\n  - ""\n'))).toThrow(
      "allowed-schemas",
    );
  });
});

describe("el motor lee la declaración del proyecto", () => {
  let lab: string;
  beforeEach(() => {
    lab = mkdtempSync(join(tmpdir(), "valmen-setup-"));
    mkdirSync(join(lab, ".valmen"), { recursive: true });
  });
  afterEach(() => {
    rmSync(lab, { recursive: true, force: true });
  });

  it("lee test-setup y allowed-schemas de .valmen/config.yaml", () => {
    writeFileSync(join(lab, ".valmen", "config.yaml"), VALIDA, "utf8");
    expect(testSetupConfig(lab)?.schema).toBe("test_saicloud");
    expect(allowedSchemas(lab)).toEqual(["test_saicloud"]);
  });

  it("un proyecto sin config.yaml no declara nada", () => {
    expect(testSetupConfig(lab)).toBeNull();
    expect(allowedSchemas(lab)).toEqual([]);
  });

  it("una sección mal formada sube como error: no se interpreta a medias", () => {
    writeFileSync(join(lab, ".valmen", "config.yaml"), "test-setup:\n  schema: t\n", "utf8");
    expect(() => testSetupConfig(lab)).toThrow("test-setup.commands");
  });
});
