/**
 * El registro por fase de las sesiones del agente de la jornada (R-JORN-006).
 *
 * Una jornada lanza varias sesiones por ticket —preparación y ejecución— y no cuestan igual.
 * Para saber cuánto pesa cada fase hace falta que cada sesión deje lo que el motor **sabe**:
 * ticket, fase, ejecutor, modelo, esfuerzo, de dónde salió el modelo, cuánto duró y cómo
 * terminó. El costo en dólares no lo mide el harness —lo reportan los clientes y se une por
 * la referencia de sesión—, así que aquí no se inventa un número: el parte diario lo une.
 *
 * Es un archivo append-only, un renglón por sesión; un renglón truncado no borra los demás.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

import {
  FASES_DEL_AGENTE,
  type FaseDelAgente,
  type ModeloDeFase,
  modeloDeFase,
  rutasDelProyecto,
} from "@valmen/adapter";

import { autonomousConfig } from "./discovery.js";

export interface RegistroDeFase {
  readonly kind: "journey-phase";
  readonly version: 1;
  readonly ticketId: string;
  readonly fase: FaseDelAgente;
  readonly ejecutor: string;
  readonly modelo: string;
  readonly esfuerzo: string;
  /** De dónde salió el modelo: el rol de la fase o la política, y el motivo. */
  readonly origenDelModelo: string;
  readonly duracionMs: number;
  readonly resultado: string;
  readonly registradoEn: string;
}

export function fasesPath(root: string): string {
  return join(root, ".valmen", "journeys", "fases.jsonl");
}

/** Anexa el registro de una sesión. */
export function registrarFase(
  root: string,
  registro: Omit<RegistroDeFase, "kind" | "version" | "registradoEn"> & { readonly registradoEn?: string },
): RegistroDeFase {
  if (!(FASES_DEL_AGENTE as readonly string[]).includes(registro.fase)) {
    throw new Error(`Fase desconocida: ${registro.fase}.`);
  }
  const completo: RegistroDeFase = {
    kind: "journey-phase",
    version: 1,
    ...registro,
    registradoEn: registro.registradoEn ?? new Date().toISOString(),
  };
  const ruta = fasesPath(root);
  mkdirSync(dirname(ruta), { recursive: true });
  appendFileSync(ruta, `${JSON.stringify(completo)}\n`, "utf8");
  return completo;
}

/** Lee todos los registros; un renglón ilegible se ignora. */
export function leerFases(root: string): RegistroDeFase[] {
  const ruta = fasesPath(root);
  if (!existsSync(ruta)) return [];
  const registros: RegistroDeFase[] = [];
  for (const linea of readFileSync(ruta, "utf8").split("\n")) {
    if (linea.trim() === "") continue;
    try {
      const valor = JSON.parse(linea) as Partial<RegistroDeFase>;
      if (valor.kind === "journey-phase" && valor.version === 1 && typeof valor.ticketId === "string") {
        registros.push(valor as RegistroDeFase);
      }
    } catch {
      // Un renglón truncado no borra los hechos anteriores.
    }
  }
  return registros;
}

/**
 * El modelo con el que se lanza el ejecutor de una fase, resuelto por el enrutamiento del
 * proyecto y el ejecutor de su política; `null` si la autonomía no declara ejecutor.
 */
export function resolverModeloDeFase(root: string, fase: FaseDelAgente): ModeloDeFase | null {
  const politica = autonomousConfig(root);
  if (politica.executor === null) return null;
  return modeloDeFase(rutasDelProyecto(root, { ejecutor: politica.executor.id }), fase, politica.executor);
}
