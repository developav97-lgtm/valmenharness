/**
 * Las vistas de Mission Control usan todo el ancho disponible.
 *
 * Defecto reportado por el PO el 2026-10-14 tras revisar el rediseño: en una
 * pantalla ancha Inicio, Tickets, el detalle de ticket, Portafolio, Procesos,
 * Estándares y Cambiar de perfil se quedaban en 1240 px y dejaban espacio vacío
 * a la derecha, mientras Features, Modelos, Proveedores y Proyecto llegaban hasta
 * el borde. Los bocetos tenían ese tope solo para centrar la captura de 1440 px.
 *
 * El tope se mide sobre la hoja de estilos: la regla de cada contenedor de vista
 * no declara `max-width` en píxeles. Los textos de lectura (`70ch`, `62ch`…)
 * siguen acotados y no son contenedores de vista.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const HTML = join(import.meta.dirname, "..", "packages", "server", "web", "index.html");
const html = readFileSync(HTML, "utf8");

/** El cuerpo de la primera regla cuyo selector es exactamente `selector`. */
function reglaDe(selector: string): string {
  const escapado = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = new RegExp(`(?:^|[\\s}])${escapado}\\s*\\{([^}]*)\\}`, "m").exec(html);
  if (m === null) throw new Error(`No hay una regla para ${selector}`);
  return m[1] ?? "";
}

const CONTENEDORES = [
  [".inicio", "Inicio"],
  [".vista-tickets, .vista-ticket", "Tickets y detalle de ticket"],
  [".port", "Portafolio"],
  [".proc", "Procesos"],
  [".est", "Estándares"],
  [".cambiar-perfil", "Cambiar de perfil"],
] as const;

describe("las vistas llenan el ancho disponible", () => {
  for (const [selector, vista] of CONTENEDORES) {
    it(`${vista}: ${selector} no fija un ancho máximo en píxeles`, () => {
      const regla = reglaDe(selector);
      expect(regla).not.toMatch(/max-width\s*:\s*\d+px/);
    });

    it(`${vista}: ${selector} sigue siendo una columna`, () => {
      const regla = reglaDe(selector);
      expect(regla).toMatch(/display\s*:\s*flex/);
      expect(regla).toMatch(/flex-direction\s*:\s*column/);
    });
  }

  it("las vistas que ya llenaban el ancho siguen sin tope", () => {
    for (const selector of [".feat-cabecera", ".cabecera-modelos", ".cabecera-proveedores", ".cabecera-proyecto"]) {
      expect(reglaDe(selector)).not.toMatch(/max-width\s*:\s*\d+px/);
    }
  });
});
