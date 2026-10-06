import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { run } from "../packages/cli/src/main.js";
import { verifyOnboarding } from "../packages/cli/src/onboarding-verify.js";

let lab: string;

beforeEach(() => {
  lab = mkdtempSync(join(tmpdir(), "valmen-verificacion-origen-"));
  writeFileSync(join(lab, "package.json"), '{"name":"origen"}\n', "utf8");
  mkdirSync(join(lab, "tickets"), { recursive: true });
  writeFileSync(join(lab, "tickets", "registro-real.md"), "no tocar\n", "utf8");
});

afterEach(() => {
  rmSync(lab, { recursive: true, force: true });
});

describe("onboarding verify", () => {
  it("expone la verificación temporal por la orden pública", async () => {
    const salida = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    try {
      expect(await run(["--root", lab, "onboarding", "verify"])).toBe(0);
      expect(salida).toHaveBeenCalledWith(
        expect.stringContaining("Flujo CLI mecánico verificado"),
      );
    } finally {
      salida.mockRestore();
    }
  });

  it("verifica la ruta CLI en un entorno efímero sin alterar el registro de origen", async () => {
    const antes = readFileSync(join(lab, "tickets", "registro-real.md"), "utf8");
    const temporalesAntes = new Set(
      readdirSync(tmpdir()).filter((nombre) => nombre.startsWith("valmen-onboarding-")),
    );

    const resultado = await verifyOnboarding(lab);

    expect(resultado.exitCode).toBe(0);
    expect(resultado.stdout).toContain("Verificación temporal de puesta en marcha");
    expect(resultado.stdout).toContain("Flujo CLI mecánico verificado");
    expect(resultado.stdout).toContain("Proveedor semántico no configurado");
    expect(resultado.stdout).toContain("MCP no comprobado");
    expect(readFileSync(join(lab, "tickets", "registro-real.md"), "utf8")).toBe(antes);
    expect(existsSync(join(lab, ".valmen"))).toBe(false);
    expect(
      readdirSync(tmpdir()).filter(
        (nombre) => nombre.startsWith("valmen-onboarding-") && !temporalesAntes.has(nombre),
      ),
    ).toEqual([]);
  });

  it("documenta la comprobación temporal en vez de pedir crear un ticket real", () => {
    const guia = readFileSync(
      join(process.cwd(), "docs", "15-PUESTA-EN-MARCHA.md"),
      "utf8",
    );

    expect(guia).toContain("valmen onboarding verify");
    expect(guia).not.toContain("pedile al agente que cree un ticket");
  });
});
