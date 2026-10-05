/** Evidencia append-only y resolución conservadora de promociones de gates. */
import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";

import { parseConfig, readGatePromotions } from "@valmen/adapter";
import { type GateDefinition, gateById } from "@valmen/gate";

import { type CalibrationReport } from "./calibration.js";
import { type RegistryPaths } from "./discovery.js";

/** La calibración inmutable que respalda una solicitud de promoción. */
export interface PromotionEvidence {
  readonly kind: "gate-promotion-evidence";
  /** Identidad estable para que un recibo pueda citar la calibración exacta. */
  readonly id: string;
  readonly gate: string;
  /** Referencia legible al origen de las decisiones humanas comparadas. */
  readonly humanReference: string;
  /** Tickets cuyos ciclos de QA se compararon; la referencia humana auditable. */
  readonly humanTickets: readonly string[];
  readonly compared: number;
  readonly decided: number;
  readonly agree: number;
  readonly agreement: number | null;
  readonly criticalFalseApproves: number;
}

/** Resultado del modo que realmente puede usar una ejecución. */
export interface EffectiveGateMode {
  readonly mode: GateDefinition["mode"];
  readonly reason: string;
  readonly evidence: PromotionEvidence | null;
}

/** Ruta independiente de los recibos por ticket: conserva el historial de promoción. */
export function promotionEvidencePath(paths: RegistryPaths): string {
  return join(paths.root, ".valmen", "gate-promotion-evidence.jsonl");
}

/** Convierte un informe de calibración en evidencia serializable, sin reescribirlo después. */
export function evidenceFromCalibration(
  report: CalibrationReport,
  humanReference: string,
): PromotionEvidence {
  const humanTickets = report.rows.map((row) => row.ticketId);
  const digest = createHash("sha256")
    .update(JSON.stringify({ gate: report.gate, humanReference, humanTickets, compared: report.compared, decided: report.decided, agree: report.agree, rate: report.rate, criticalFalseApproves: report.criticalFalseApproves }))
    .digest("hex")
    .slice(0, 16);
  return {
    kind: "gate-promotion-evidence",
    id: `GPE-${report.gate}-${digest}`,
    gate: report.gate,
    humanReference,
    humanTickets,
    compared: report.compared,
    decided: report.decided,
    agree: report.agree,
    agreement: report.rate,
    criticalFalseApproves: report.criticalFalseApproves,
  };
}

/** Lee toda la evidencia; una línea corrupta falla en vez de esconder historia. */
export function readPromotionEvidence(paths: RegistryPaths): PromotionEvidence[] {
  let text: string;
  try {
    text = readFileSync(promotionEvidencePath(paths), "utf8");
  } catch (caught) {
    if ((caught as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw caught;
  }
  return text
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => JSON.parse(line) as PromotionEvidence);
}

/** Anexa una evidencia sin sustituir ni reordenar las anteriores. */
export function appendPromotionEvidence(paths: RegistryPaths, evidence: PromotionEvidence): string {
  const path = promotionEvidencePath(paths);
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, `${JSON.stringify(evidence)}\n`, "utf8");
  return path;
}

function configuredPromotions(paths: RegistryPaths): Readonly<Record<string, import("@valmen/adapter").GatePromotionRequest>> {
  let text: string;
  try {
    text = readFileSync(join(paths.root, ".valmen", "config.yaml"), "utf8");
  } catch {
    return {};
  }
  const config = parseConfig(text);
  return readGatePromotions(config, ["analysis", "plan", "qa-mechanical"]);
}

/**
 * Resuelve el modo efectivo sin mutar la definición fuente del gate.
 *
 * La última evidencia para el gate es la vigente: una calibración posterior que
 * ya no cumple revoca la promoción hasta que se registre una nueva que sí cumpla.
 */
export function resolveGateMode(paths: RegistryPaths, gateId: string): EffectiveGateMode {
  const definition = gateById(gateId);
  if (definition.mode !== "hybrid") {
    return { mode: definition.mode, reason: "el gate está definido como automático", evidence: null };
  }

  const request = configuredPromotions(paths)[gateId];
  if (request === undefined) {
    return { mode: "hybrid", reason: "no hay una solicitud de promoción configurada", evidence: null };
  }

  const evidence = readPromotionEvidence(paths)
    .filter((item) => item.gate === gateId)
    .at(-1) ?? null;
  if (evidence === null) {
    return { mode: "hybrid", reason: "falta evidencia calibrada para la promoción", evidence: null };
  }
  if (evidence.decided < request.minimumSample) {
    return { mode: "hybrid", reason: "la muestra decidida no alcanza el mínimo configurado", evidence };
  }
  if (evidence.agreement === null || evidence.agreement < request.minimumAgreement) {
    return { mode: "hybrid", reason: "la coincidencia no alcanza el mínimo configurado", evidence };
  }
  if (evidence.criticalFalseApproves !== 0) {
    return { mode: "hybrid", reason: "la calibración contiene falsos aprobados críticos", evidence };
  }
  return { mode: "auto", reason: "la evidencia calibrada cumple la política configurada", evidence };
}
