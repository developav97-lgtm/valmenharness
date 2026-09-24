/**
 * El detector de drift.
 *
 * Lo que se afirma acá es sobre todo lo que **no** tiene que marcar, porque es un
 * chequeo que se corre antes de implementar y un aviso falso ahí cuesta una
 * revisión del plan que no hacía falta. Cada caso de silencio está puesto porque
 * apareció midiendo contra el proyecto real:
 *
 * - Un archivo que todavía no existe en un ticket `planned` es lo normal.
 * - `FrontEnd/.../x.spec.ts` es una ruta abreviada a propósito.
 * - `common/services/x.ts` es un fragmento: el archivo existe más adentro.
 * - `.codex/config.toml` es configuración de la máquina, no del repositorio.
 * - `Meta.fields` es una clase interna de Django que está en otro archivo.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { renderDrift, scanDrift } from "../packages/engine/src/drift.js";
import type { RegistryPaths } from "../packages/engine/src/discovery.js";
import { renderFixtureTicket } from "./helpers/fixtures.js";

let lab: string;

const PATHS = (): RegistryPaths => ({ root: lab, ticketsDir: "tickets" });

/** Escribe un ticket con las secciones que el chequeo mira. */
function ticket(
  id: string,
  secciones: { diagnostico?: string; plan?: string; implementacion?: string },
  workflowStatus = "in_progress",
): void {
  const base = renderFixtureTicket({ id, workflowStatus, module: "POS" });
  const texto = base
    .replace(
      /(## Diagnóstico\n\n)[\s\S]*?(?=\n## )/,
      `$1${secciones.diagnostico ?? "Nada que citar."}\n`,
    )
    .replace(/(## Plan\n\n)[\s\S]*?(?=\n## )/, `$1${secciones.plan ?? "Nada que citar."}\n`)
    .replace(
      /(## Implementación\n\n)[\s\S]*?(?=\n## )/,
      `$1${secciones.implementacion ?? "Nada que citar."}\n`,
    );
  const directorio = join(lab, "tickets", "2026", id);
  mkdirSync(directorio, { recursive: true });
  writeFileSync(join(directorio, "ticket.md"), texto, "utf8");
}

/** Escribe un archivo del proyecto, creando las carpetas que falten. */
function archivo(ruta: string, contenido: string): void {
  const completa = join(lab, ruta);
  mkdirSync(join(completa, ".."), { recursive: true });
  writeFileSync(completa, contenido, "utf8");
}

beforeEach(() => {
  lab = mkdtempSync(join(tmpdir(), "valmen-drift-"));
  archivo(
    "BackEnd/inventario/models.py",
    "class MovimientoInventario(models.Model):\n    saldo = models.IntegerField()\n",
  );
  archivo("BackEnd/inventario/api/views.py", "class MovimientoViewSet:\n    pass\n");
  archivo(
    "FrontEnd/src/app/common/services/cart.service.ts",
    "export class CartService {\n  selectPayment() {}\n}\n",
  );
});

afterEach(() => {
  rmSync(lab, { recursive: true, force: true });
});

describe("lo que encuentra", () => {
  it("marca un símbolo cuyo miembro no existe, y dice dónde está la clase", () => {
    ticket("BUGFIX-POS-SALDO-20260924", {
      plan: "Se corrige `MovimientoInventario.saldo_actual` en el cálculo.",
    });
    const informe = scanDrift(PATHS(), { todos: true });

    expect(informe.findings).toHaveLength(1);
    const hallazgo = informe.findings[0];
    expect(hallazgo?.kind).toBe("miembro-ausente");
    expect(hallazgo?.cited).toBe("MovimientoInventario.saldo_actual");
    // El detalle dice dónde está la clase: quien lo lee tiene que poder ir.
    expect(hallazgo?.detail).toContain("BackEnd/inventario/models.py");
    expect(hallazgo?.detail).toContain("saldo");
  });

  it("marca un archivo citado que no existe, cuando el trabajo ya se hizo", () => {
    ticket("BUGFIX-POS-ARCHIVO-20260924", {
      plan: "Se toca `BackEnd/inventario/api/serializers.py`.",
    });
    const informe = scanDrift(PATHS(), { todos: true });
    expect(informe.findings.map((uno) => uno.kind)).toEqual(["archivo-ausente"]);
  });

  it("marca un ticket citado que no está en el registro", () => {
    ticket("BUGFIX-POS-CITA-20260924", {
      plan: "Depende de `FEATURE-INVENTARIO-API-20260921`.",
    });
    const informe = scanDrift(PATHS(), { todos: true });
    expect(informe.findings.map((uno) => uno.kind)).toEqual(["ticket-ausente"]);
    expect(informe.findings[0]?.cited).toBe("FEATURE-INVENTARIO-API-20260921");
  });

  it("marca una clase que no existe en ninguna parte", () => {
    ticket("BUGFIX-POS-CLASE-20260924", {
      diagnostico: "El flujo pasa por `KardexCalculator.recalcular`.",
    });
    const informe = scanDrift(PATHS(), { todos: true });
    expect(informe.findings.map((uno) => uno.kind)).toEqual(["simbolo-ausente"]);
  });
});

describe("lo que no marca, y por qué", () => {
  it("no marca un archivo que todavía no existe en un ticket en `planned`", () => {
    // Un plan declara archivos que va a crear: avisar de eso sería avisar de lo
    // normal, y el chequeo existe para lo anormal.
    ticket(
      "BUGFIX-POS-NUEVO-20260924",
      { plan: "Se crea `BackEnd/inventario/api/serializers.py`." },
      "planned",
    );
    expect(scanDrift(PATHS(), { todos: true }).findings).toEqual([]);
  });

  it("no marca un archivo que existe, aunque se cite sin la carpeta", () => {
    ticket("BUGFIX-POS-FRAGMENTO-20260924", {
      plan: "Se unifica en `common/services/cart.service.ts` y en `cart.service.ts`.",
    });
    expect(scanDrift(PATHS(), { todos: true }).findings).toEqual([]);
  });

  it("no marca una ruta abreviada con puntos suspensivos", () => {
    // `FrontEnd/.../x.spec.ts` no dice cuál es el archivo: el ticket ya estaba
    // evitando escribir la ruta entera, y comprobarla daría un «no existe» falso.
    ticket("BUGFIX-POS-ABREVIADA-20260924", {
      implementacion: "Se agregó `FrontEnd/.../data-preload.service.spec.ts`.",
    });
    expect(scanDrift(PATHS(), { todos: true }).findings).toEqual([]);
  });

  it("no marca la configuración de la máquina", () => {
    ticket("BUGFIX-POS-CONFIG-20260924", {
      diagnostico: "La clave vive en `.codex/config.toml` y en `~/.claude/settings.json`.",
    });
    expect(scanDrift(PATHS(), { todos: true }).findings).toEqual([]);
  });

  it("no marca un miembro que declara otra clase del mismo nombre", () => {
    // `Meta` es una clase interna de cada modelo de Django: quedarse con la
    // primera que aparezca marcaría como ausente un campo que está en la otra.
    archivo(
      "BackEnd/otro/models.py",
      "class Otro(models.Model):\n    class Meta:\n        pass\n",
    );
    archivo(
      "BackEnd/inventario/otro.py",
      "class Kardex(models.Model):\n    class Meta:\n        fields = ['saldo']\n",
    );
    ticket("BUGFIX-POS-META-20260924", {
      plan: "Se ajusta `Meta.fields` del modelo de kardex.",
    });
    expect(scanDrift(PATHS(), { todos: true }).findings).toEqual([]);
  });

  it("un nombre en un comentario no declara nada, y uno declarado sí", () => {
    // La diferencia entre «el nombre aparece» y «el campo existe» es todo el
    // chequeo: si un comentario bastara, aprobaría justo lo que tiene que marcar.
    ticket("BUGFIX-POS-COMENTARIO-20260924", {
      plan: "Se corrige `MovimientoInventario.saldo_actual`.",
    });
    archivo(
      "BackEnd/inventario/models.py",
      "class MovimientoInventario(models.Model):\n    saldo = models.IntegerField()\n    # antes se llamaba saldo_actual\n",
    );
    expect(scanDrift(PATHS(), { todos: true }).findings.map((uno) => uno.kind)).toEqual([
      "miembro-ausente",
    ]);

    // Y con el campo declarado de verdad, el mismo ticket no tiene hallazgo.
    archivo(
      "BackEnd/inventario/models.py",
      "class MovimientoInventario(models.Model):\n    saldo_actual = models.IntegerField()\n",
    );
    expect(scanDrift(PATHS(), { todos: true }).findings).toEqual([]);
  });
});

describe("el alcance", () => {
  it("por defecto mira solo los tickets en curso", () => {
    ticket("BUGFIX-POS-ACTIVO-20260924", {
      plan: "Se toca `BackEnd/inventario/api/serializers.py`.",
    });
    ticket(
      "BUGFIX-POS-CERRADO-20260924",
      { plan: "Se toca `BackEnd/inventario/api/otro.py`." },
      "closed",
    );

    const enCurso = scanDrift(PATHS());
    expect(enCurso.scanned).toBe(1);
    expect(enCurso.findings.map((uno) => uno.ticketId)).toEqual([
      "BUGFIX-POS-ACTIVO-20260924",
    ]);

    const todos = scanDrift(PATHS(), { todos: true });
    expect(todos.scanned).toBe(2);
    expect(todos.findings).toHaveLength(2);
  });

  it("sin tickets en curso lo dice, en vez de aprobar en silencio", () => {
    // Un «nada que avisar» sobre cero tickets revisados parece una aprobación, y
    // no lo es: es que no había nada que mirar.
    ticket(
      "BUGFIX-POS-CERRADO-20260924",
      { plan: "Se toca `BackEnd/inventario/api/otro.py`." },
      "closed",
    );
    const informe = scanDrift(PATHS());
    expect(informe.scanned).toBe(0);
    expect(informe.total).toBe(1);
    const texto = renderDrift(informe);
    expect(texto).toContain("no hay tickets en curso");
    expect(texto).toContain("--todos");
  });

  it("el informe agrupa por ticket y nombra la sección", () => {
    ticket("BUGFIX-POS-AGRUPADO-20260924", {
      plan: "Se toca `BackEnd/inventario/api/uno.py` y `BackEnd/inventario/api/dos.py`.",
    });
    const texto = renderDrift(scanDrift(PATHS(), { todos: true }));
    expect(texto).toContain("BUGFIX-POS-AGRUPADO-20260924");
    expect(texto.split("[Plan]").length - 1).toBe(2);
  });
});
