/** El disparador de interfaz se decide con rutas citadas y capacidad declarada. */
import { parseTicket } from "@valmen/core";

import { esPantalla, PANTALLAS_POR_DEFECTO } from "./manuales.js";

/**
 * La declaración de la sección `playwright:` tal como la ve el disparador.
 *
 * Es la del adaptador —los cuatro datos, incluido el modelo— y no la del gate,
 * que solo necesita el comando, el navegador y el tope para armar el check. El
 * disparador recibe la declaración completa porque además expone el modelo
 * recomendado para el rol `ui-specs`.
 */
export interface DeclaracionPlaywright {
  readonly command: string;
  readonly project: string;
  readonly timeoutMs: number;
  readonly provider: string;
  readonly model: string;
}

/** El modelo recomendado para los specs, resuelto desde la sección. */
export interface ModeloDeSpecs {
  readonly provider: string;
  readonly model: string;
}

/**
 * La capacidad de interfaz que el ticket declara al gate de plan.
 *
 * El disparador se decide **en código**, no con el modelo: se extraen las rutas
 * que el ticket cita entre backticks en `## Diagnóstico` y `## Plan` —el mismo
 * patrón de cita que `drift.ts`—, se les quita el sufijo `:línea` y cada una se
 * cruza contra el matcher de pantalla del proyecto. La capacidad se resuelve con
 * la sección `playwright:` que el proyecto declara en `.valmen/config.yaml`,
 * sin exigir un spec: el plan todavía puede estar proponiendo escribirlo. Sin esa
 * sección no hay capacidad, y el modelo recomendado que expone el resultado es el
 * que alimenta el rol `ui-specs` del enrutado. No se ejecuta ningún comando ni se
 * escribe ninguna prueba.
 */
export function interfazDelTicket({
  texto,
  playwright = null,
  pantallas = PANTALLAS_POR_DEFECTO,
}: {
  /** El texto completo del ticket, como lo entrega `findTicket`. */
  readonly texto: string;
  /** Los prefijos que el proyecto declara en `test-commands`. */
  readonly comandos: readonly string[];
  /** La sección `playwright:` del proyecto; `null` si no la declaró. */
  readonly playwright?: DeclaracionPlaywright | null;
  /** El patrón de pantalla del proyecto; por defecto, el del stack. */
  readonly pantallas?: readonly string[];
}): {
  readonly tocaPantalla: boolean;
  readonly capacidadDisponible: boolean;
  readonly requiereDeclaracion: boolean;
  readonly pantallas: readonly string[];
  /** El modelo recomendado para los specs, o `null` si el proyecto no lo declaró. */
  readonly specs: ModeloDeSpecs | null;
} {
  const { sections } = parseTicket(texto);
  const rutas = new Set<string>();
  for (const seccion of [sections["Diagnóstico"] ?? "", sections["Plan"] ?? ""]) {
    // Mismo patrón de cita que drift.ts; la referencia de línea no es parte de la ruta.
    for (const cita of seccion.matchAll(/`([^`\n]+)`/g)) {
      const ruta = (cita[1] as string).replace(/:\d+(?:-\d+)?$/, "");
      if (esPantalla(ruta, pantallas)) rutas.add(ruta);
    }
  }

  // La capacidad depende de la declaración, no de un spec que aún no existe.
  const capacidadDisponible = playwright !== null && playwright.command.trim() !== "";
  const tocaPantalla = rutas.size > 0;
  return {
    tocaPantalla,
    capacidadDisponible,
    requiereDeclaracion: tocaPantalla && capacidadDisponible,
    pantallas: [...rutas].sort(),
    specs:
      capacidadDisponible && playwright !== null
        ? { provider: playwright.provider, model: playwright.model }
        : null,
  };
}
