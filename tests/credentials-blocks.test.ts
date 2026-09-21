/**
 * La lectura de un bloque del archivo de credenciales.
 *
 * Hay **dos** implementaciones a propósito: `@valmen/credentials` no depende de
 * `@valmen/core` —lee un archivo de secretos y no debe arrastrar el parser de
 * configuración—, así que tiene la suya. Y `@valmen/server` usa la de `core` para
 * listar el estado de los proveedores.
 *
 * Dos implementaciones de lo mismo divergen. Este archivo es lo que lo impide: se
 * comprueba el acuerdo sobre el mismo texto, y sobre el caso que ya falló una
 * vez.
 */
import { describe, expect, it } from "vitest";

import { blockOf, fieldOf } from "../packages/credentials/src/credentials.js";
import { yamlBlockOf, yamlFieldOf } from "../packages/core/src/yaml.js";

/** Un archivo como el que genera la plantilla, con las dos secciones. */
const ARCHIVO = `# Credenciales de ValmenHarness
version: 1

providers:
  openrouter:
    api-key: sk-or-v1-aaaa
  deepseek:
    api-key-env: sk-dddd
    # un comentario suelto
  ollama: {}

subscriptions:
  claude-code:
    source: claude-cli
  codex:
    source: codex-cli
  opencode:
    source: opencode-cli
  opencode-go:
    api-key: sk-go-bbbb

# final
`;

const IDS = [
  "openrouter",
  "deepseek",
  "ollama",
  "claude-code",
  "codex",
  "opencode",
  "opencode-go",
];

describe("blockOf y yamlBlockOf coinciden", () => {
  for (const id of IDS) {
    it(`sobre el bloque de ${id}`, () => {
      const a = blockOf(ARCHIVO, id);
      const b = yamlBlockOf(ARCHIVO, id);
      expect(a).toBe(b);
    });
  }

  it("y no coinciden en la nada", () => {
    // Si las dos devolvieran `null` para todo, el test de arriba pasaría igual.
    expect(blockOf(ARCHIVO, "opencode-go")).not.toBeNull();
    expect(blockOf(ARCHIVO, "no-existe")).toBeNull();
    expect(yamlBlockOf(ARCHIVO, "no-existe")).toBeNull();
  });
});

describe("el bloque es el del proveedor que se pide", () => {
  it("`opencode-go` no lee el bloque de `opencode`", () => {
    // El fallo que motivó todo esto: con el ancla `^[ \\t]*`, buscar
    // `opencode-go` encontraba `opencode` —la `o` final encajaba como un
    // `[ \\t]*` vacío y `-go:` como el resto del nombre— y devolvía la clave de
    // otro proveedor, o ninguna.
    const bloque = blockOf(ARCHIVO, "opencode-go");
    expect(bloque).toContain("sk-go-bbbb");
    expect(bloque).not.toContain("opencode-cli");
  });

  it("`opencode` no arrastra a sus hermanos", () => {
    // Sin fijar la indentación, el bloque seguía leyendo las claves de después.
    const bloque = yamlBlockOf(ARCHIVO, "opencode");
    expect(bloque).toBe("    source: opencode-cli");
  });

  it("`codex` no arrastra a `opencode`", () => {
    expect(blockOf(ARCHIVO, "codex")).toBe("    source: codex-cli");
  });
});

describe("fieldOf y yamlFieldOf coinciden", () => {
  it("sobre un campo con valor", () => {
    const bloque = blockOf(ARCHIVO, "openrouter") as string;
    expect(fieldOf(bloque, "api-key")).toBe("sk-or-v1-aaaa");
    expect(yamlFieldOf(bloque, "api-key")).toBe("sk-or-v1-aaaa");
  });

  it("sobre el nombre anterior del campo", () => {
    const bloque = blockOf(ARCHIVO, "deepseek") as string;
    expect(fieldOf(bloque, "api-key(?:-env)?")).toBe("sk-dddd");
    expect(yamlFieldOf(bloque, "api-key(?:-env)?")).toBe("sk-dddd");
  });

  it("y devuelven nada cuando el campo no está", () => {
    const bloque = blockOf(ARCHIVO, "claude-code") as string;
    expect(fieldOf(bloque, "api-key")).toBeNull();
    expect(yamlFieldOf(bloque, "api-key")).toBeNull();
  });
});
