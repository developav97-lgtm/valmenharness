/**
 * Lo que el harness entendió de cada política autónoma del proyecto.
 *
 * La pantalla de Configuración mostraba las claves del archivo y nada de lo que
 * significan. El resumen se calcula **aquí**, con los mismos lectores que usa el
 * motor, y no en el navegador: dos lecturas de la misma política divergen, y la que
 * diverge es la que la persona mira al decidir.
 *
 * Cada lector corre aislado. Una sección que no se entiende es un estado de esa
 * política —con su mensaje exacto—, no un error del resumen: no puede esconder las
 * demás ni impedir guardar.
 */
import {
  type ConfigMap,
  JEV_STAGES,
  readAllowedSchemas,
  readAutonomousConfig,
  readGateThresholds,
  readJevPropositions,
  readTestSetupConfig,
} from "@valmen/adapter";
import { toFailure } from "@valmen/core";

/** Las compuertas contra las que se declaran umbrales. */
const COMPUERTAS_CON_UMBRAL = ["analysis", "plan", "qa-mechanical"];

export type EstadoDePolitica = "apagada" | "activa" | "error";

/** Una política, tal como la pantalla la pinta. */
export interface PoliticaResumida {
  readonly id: "autonomous" | "jev-propositions" | "test-setup" | "gate-thresholds";
  readonly titulo: string;
  /** La clave de primer nivel que la declara, para llevar el editor a su línea. */
  readonly clave: string;
  readonly estado: EstadoDePolitica;
  readonly resumen: readonly string[];
  /** El mensaje exacto del lector si la sección no se entiende. */
  readonly error: string | null;
  /**
   * Un ejemplo **comentado** que la pantalla agrega al texto cuando la clave no
   * existe. Comentado a propósito: insertarlo no activa nada hasta que una persona
   * lo descomente y guarde. `null` si la política no se escribe desde la pantalla.
   */
  readonly ejemplo: string | null;
  /** `true` si la pantalla solo la muestra: la declara una persona con su firma. */
  readonly soloLectura: boolean;
}

const EJEMPLO_AUTONOMIA = [
  "# autonomous:",
  "#   enabled: true",
  "#   eligible:",
  "#     types:",
  "#       - BUGFIX",
  "#     max-risk: normal",
  "#     require:",
  "#       - plan-approved",
  "#       - tests-declared",
  "#       - no-critical-impacts",
  "#     excluded-modules:",
  "#       - auth",
  "#       - deploy",
  "#   limits:",
  "#     max-concurrent: 1",
  "#     collision-policy: serialize",
  "#     max-per-day: 3",
  "#     budget-per-ticket: 5.00",
  "#     stop-on:",
  "#       - gate-blocked-twice",
  "#       - test-failure",
  "#       - secret-detected",
].join("\n");

const EJEMPLO_PROPOSICIONES = [
  "# jev-propositions:",
  "#   plan:",
  "#     - id: custom-rollback-probado",
  "#       description: El plan dice cómo se revierte el cambio",
  "#       instructions: Busca en el plan un paso de reversión concreto.",
  "#       criteria:",
  "#         yes: Hay un paso de reversión que nombra qué se deshace.",
  "#         no: No hay reversión o es genérica.",
  "#       weight: 1",
  "#       approve-at: 0.9",
  "#       block-at: 0.1",
  "#       verdict: inform",
].join("\n");

const EJEMPLO_PREPARACION = [
  "# allowed-schemas:",
  "#   - test",
  "# test-setup:",
  "#   schema: test",
  "#   commands:",
  "#     - python manage.py migrate --schema=test",
].join("\n");

/** Ejecuta un lector y devuelve su fallo como texto en vez de propagarlo. */
function aislar<T>(lector: () => T): { valor: T } | { error: string } {
  try {
    return { valor: lector() };
  } catch (caught) {
    return { error: toFailure(caught).message };
  }
}

function conError(
  base: Omit<PoliticaResumida, "estado" | "resumen" | "error">,
  error: string,
): PoliticaResumida {
  return { ...base, estado: "error", resumen: [], error };
}

/** Resume las cuatro políticas del proyecto a partir de su configuración ya analizada. */
export function resumirPoliticas(config: ConfigMap): readonly PoliticaResumida[] {
  const politicas: PoliticaResumida[] = [];

  // ── Autonomía acotada ────────────────────────────────────────────────────
  {
    const base = {
      id: "autonomous",
      titulo: "Autonomía acotada",
      clave: "autonomous",
      ejemplo: EJEMPLO_AUTONOMIA,
      soloLectura: false,
    } as const;
    const leida = aislar(() => readAutonomousConfig(config));
    if ("error" in leida) {
      politicas.push(conError(base, leida.error));
    } else if (!leida.valor.enabled) {
      politicas.push({
        ...base,
        estado: "apagada",
        resumen: ["Apagada: declararla es una decisión de una persona."],
        error: null,
      });
    } else {
      const a = leida.valor;
      politicas.push({
        ...base,
        estado: "activa",
        resumen: [
          `Tipos elegibles: ${a.eligible.types.join(", ") || "ninguno"}; riesgo máximo ${a.eligible.maxRisk}.`,
          `Hasta ${a.limits.maxConcurrent} a la vez y ${a.limits.maxPerDay} por día; colisiones: ${a.limits.collisionPolicy}.`,
          `Se detiene ante: ${a.limits.stopOn.join(", ") || "nada declarado"}.`,
        ],
        error: null,
      });
    }
  }

  // ── Proposiciones adicionales por etapa ──────────────────────────────────
  {
    const base = {
      id: "jev-propositions",
      titulo: "Proposiciones adicionales por etapa",
      clave: "jev-propositions",
      ejemplo: EJEMPLO_PROPOSICIONES,
      soloLectura: false,
    } as const;
    const leida = aislar(() => readJevPropositions(config));
    if ("error" in leida) {
      politicas.push(conError(base, leida.error));
    } else {
      const lineas = JEV_STAGES.map((etapa) => {
        const preguntas = leida.valor[etapa];
        if (preguntas.length === 0) return `${etapa}: ninguna.`;
        const detalle = preguntas.map((p) => `${p.id} (${p.verdict})`).join(", ");
        return `${etapa}: ${preguntas.length} — ${detalle}.`;
      });
      const total = JEV_STAGES.reduce((suma, etapa) => suma + leida.valor[etapa].length, 0);
      politicas.push({
        ...base,
        estado: total === 0 ? "apagada" : "activa",
        resumen: lineas,
        error: null,
      });
    }
  }

  // ── Preparación de pruebas y esquemas permitidos ─────────────────────────
  {
    const base = {
      id: "test-setup",
      titulo: "Preparación de pruebas",
      clave: "test-setup",
      ejemplo: EJEMPLO_PREPARACION,
      soloLectura: false,
    } as const;
    const leida = aislar(() => ({
      setup: readTestSetupConfig(config),
      permitidos: readAllowedSchemas(config),
    }));
    if ("error" in leida) {
      politicas.push(conError(base, leida.error));
    } else if (leida.valor.setup === null) {
      politicas.push({
        ...base,
        estado: "apagada",
        resumen: [
          `Sin preparación declarada. Esquemas permitidos: ${leida.valor.permitidos.join(", ") || "ninguno"}.`,
        ],
        error: null,
      });
    } else {
      const { setup, permitidos } = leida.valor;
      const autorizado = permitidos.includes(setup.schema);
      politicas.push({
        ...base,
        estado: "activa",
        resumen: [
          `Esquema ${setup.schema}${autorizado ? "" : " — no está en allowed-schemas: la preparación se rechaza"}.`,
          `${setup.commands.length} comando(s) antes de los criterios; permitidos: ${permitidos.join(", ") || "ninguno"}.`,
        ],
        error: null,
      });
    }
  }

  // ── Umbrales firmados: solo lectura ──────────────────────────────────────
  {
    const base = {
      id: "gate-thresholds",
      titulo: "Umbrales firmados",
      clave: "gate-thresholds",
      ejemplo: null,
      soloLectura: true,
    } as const;
    const leida = aislar(() => readGateThresholds(config, COMPUERTAS_CON_UMBRAL));
    if ("error" in leida) {
      politicas.push(conError(base, leida.error));
    } else if (leida.valor.length === 0) {
      politicas.push({
        ...base,
        estado: "apagada",
        resumen: ["Sin umbrales propios: rigen los de la política por defecto."],
        error: null,
      });
    } else {
      politicas.push({
        ...base,
        estado: "activa",
        resumen: leida.valor.map((u) => {
          const donde = [u.gate, u.evaluator, u.proposition].filter((x) => x !== null).join(" / ");
          const firma =
            u.approvedBy === null
              ? "sin firma: no se aplica"
              : `firmado por ${u.approvedBy}${u.reason === null ? "" : ` — ${u.reason}`}`;
          return `${donde}: aprueba desde ${u.approveAt}, bloquea hasta ${u.blockAt}; ${firma}.`;
        }),
        error: null,
      });
    }
  }

  return politicas;
}
