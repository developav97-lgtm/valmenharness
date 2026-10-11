/**
 * Umbrales de decisión por evaluador y por proposición (R-CPRE-010).
 *
 * Un umbral decide qué tan clara tiene que ser una respuesta para aprobar o bloquear, y
 * cada evaluador tiene su propia escala de confianza: el mismo 0,9 no significa lo mismo
 * en Jev que en un juez de chat. El proyecto puede declararlos en `.valmen/config.yaml`
 * (`gate-thresholds`), y esta función los aplica.
 *
 * La regla que importa: **un umbral solo se aplica si una persona lo decidió**. Subir o
 * bajar un umbral cambia qué aprueba una compuerta, y un agente que edita la
 * configuración no puede relajar la compuerta que lo evalúa. Una entrada sin
 * `approved-by` y `reason` se ignora, y el informe lo dice; el motor nunca escribe esos
 * campos.
 */
import { type ThresholdOverride } from "@valmen/adapter";
import { EXIT_SCHEMA, fail } from "@valmen/core";
import {
  type AppliedThreshold,
  type GatePolicy,
  type Proposition,
  PROPOSICION_PLAYWRIGHT,
  gateById,
} from "@valmen/gate";

/** El resultado de aplicar los umbrales a las proposiciones de una evaluación. */
export interface ThresholdOutcome {
  readonly propositions: Proposition[];
  readonly applied: AppliedThreshold[];
  /** Entradas que apuntaban a esta evaluación y no se aplicaron por no traer la firma. */
  readonly ignored: string[];
}

/** ¿Es un identificador de proposición que una compuerta puede tener? */
function proposicionConocida(gateId: string, id: string): boolean {
  if (gateById(gateId).propositions.some((p) => p.id === id)) return true;
  return (
    /^criterio_\d{2,}$/.test(id) ||
    /^(?:sync|migration|docker)_impact_[a-z_]+$/.test(id) ||
    id === PROPOSICION_PLAYWRIGHT
  );
}

/** Falla nombrando la clave si una entrada apunta a una proposición que no existe. */
export function validateThresholdTargets(overrides: readonly ThresholdOverride[]): void {
  overrides.forEach((entrada, indice) => {
    if (
      entrada.proposition !== null &&
      !proposicionConocida(entrada.gate, entrada.proposition)
    ) {
      fail(
        `config.yaml: "gate-thresholds[${indice}].proposition" nombra una proposición ` +
          `desconocida de la compuerta ${entrada.gate}: "${entrada.proposition}".`,
        EXIT_SCHEMA,
      );
    }
  });
}

/** Cuánto pesa una entrada: gana la más específica. */
function especificidad(entrada: ThresholdOverride): number {
  return (entrada.proposition === null ? 0 : 2) + (entrada.evaluator === null ? 0 : 1);
}

/**
 * Aplica los umbrales declarados a las proposiciones de una evaluación.
 *
 * Para cada proposición booleana elige la entrada más específica que le corresponde
 * —proposición y evaluador, proposición, evaluador, compuerta— entre las firmadas, y le
 * pone esos umbrales como política propia. Las proposiciones de elección no tienen umbral
 * y las que ya traen el suyo (una pregunta adicional de Jev) lo conservan.
 */
export function applyThresholds(
  propositions: readonly Proposition[],
  overrides: readonly ThresholdOverride[],
  gateId: string,
  evaluatorId: string,
): ThresholdOutcome {
  const aplicables = overrides.filter(
    (e) => e.gate === gateId && (e.evaluator === null || e.evaluator === evaluatorId),
  );
  const firmadas = aplicables.filter((e) => e.approvedBy !== null && e.reason !== null);
  const ignored = aplicables
    .filter((e) => e.approvedBy === null || e.reason === null)
    .map(
      (e) =>
        `umbral de ${e.gate}${e.evaluator === null ? "" : ` con ${e.evaluator}`}` +
        `${e.proposition === null ? "" : ` para ${e.proposition}`} (${e.approveAt}/${e.blockAt}): ` +
        "no se aplica sin `approved-by` y `reason` de la persona que lo decidió",
    );

  const applied: AppliedThreshold[] = [];
  const resultado = propositions.map((proposicion): Proposition => {
    if (proposicion.kind !== "noul" || proposicion.policy !== undefined) return proposicion;
    const elegido = firmadas
      .filter((e) => e.proposition === null || e.proposition === proposicion.id)
      .sort((a, b) => especificidad(b) - especificidad(a))[0];
    if (elegido === undefined) return proposicion;
    const policy: GatePolicy = { approveAt: elegido.approveAt, blockAt: elegido.blockAt };
    applied.push({
      proposition: proposicion.id,
      evaluator: elegido.evaluator,
      approveAt: elegido.approveAt,
      blockAt: elegido.blockAt,
      approvedBy: elegido.approvedBy as string,
      reason: elegido.reason as string,
    });
    return { ...proposicion, policy };
  });
  return { propositions: resultado, applied, ignored };
}

/** La banda de revisión firmada que rige una evaluación, o por qué no rige. */
export interface BandaFirmada {
  readonly floor: number;
  readonly maxInBand: number;
  readonly approvedBy: string;
  readonly reason: string;
}

/** Lo que la banda necesita saber del ticket: su tipo y los impactos que declara. */
export interface CamposDeBanda {
  readonly type?: string | undefined;
  readonly sync_impact?: string | undefined;
  readonly migration_impact?: string | undefined;
  readonly docker_impact?: string | undefined;
}

/**
 * Elige la banda de revisión que una persona firmó para esta compuerta y este evaluador.
 *
 * La misma regla que los umbrales: sin `approved-by` y `reason` no rige. Además no se
 * aplica a un ticket SECURITY ni a uno que declara impacto de sincronización, migración o
 * contenedores: ahí la revisión humana es la que añade alcance. Devuelve la nota de por qué
 * no se aplicó cuando había una entrada que apuntaba a esta evaluación.
 */
export function bandaFirmada(
  overrides: readonly ThresholdOverride[],
  gateId: string,
  evaluatorId: string,
  campos: CamposDeBanda,
): { readonly band: BandaFirmada | null; readonly nota: string | null } {
  const candidatas = overrides.filter(
    (e) =>
      e.gate === gateId &&
      e.proposition === null &&
      e.reviewFloor !== null &&
      (e.evaluator === null || e.evaluator === evaluatorId),
  );
  const entrada = candidatas
    .filter((e) => e.approvedBy !== null && e.reason !== null)
    .sort((a, b) => especificidad(b) - especificidad(a))[0];
  if (entrada === undefined) {
    return {
      band: null,
      nota:
        candidatas.length === 0
          ? null
          : `la banda de revisión de ${gateId} no se aplicó: falta \`approved-by\` y \`reason\` de la persona que la decidió.`,
    };
  }
  const motivos: string[] = [];
  if (campos.type === "SECURITY") motivos.push("el ticket es SECURITY");
  for (const impacto of ["sync_impact", "migration_impact", "docker_impact"] as const) {
    if (campos[impacto] === "true") motivos.push(`declara ${impacto}`);
  }
  if (motivos.length > 0) {
    return {
      band: null,
      nota: `la banda de revisión no se aplicó: ${motivos.join(" y ")}; decide la revisión de siempre.`,
    };
  }
  return {
    band: {
      floor: entrada.reviewFloor as number,
      maxInBand: entrada.reviewBandMax ?? 3,
      approvedBy: entrada.approvedBy as string,
      reason: entrada.reason as string,
    },
    nota: null,
  };
}

/**
 * Las proposiciones críticas de una compuerta: las que decide el código, las estructurales
 * que su regla de contradicción exige aprobadas, y las de impacto. Las calcula el motor, no
 * el modelo; en banda, una crítica exige revisión.
 */
export function criticas(
  propositions: readonly { readonly id: string; readonly decidedInCode?: boolean }[],
  isolatedBlockReview: { readonly requiredApprovedIds: readonly string[] } | undefined,
): string[] {
  const ids = new Set<string>(isolatedBlockReview?.requiredApprovedIds ?? []);
  for (const p of propositions) {
    if (p.decidedInCode === true || /^(?:sync|migration|docker)_impact_/.test(p.id)) {
      ids.add(p.id);
    }
  }
  return [...ids];
}
