/**
 * Presupuestos adaptativos (R-S1-003).
 *
 * El problema que resuelve: el harness ya sabe cuánto costó cada ticket —lo cuenta
 * `usage` desde sus recibos y `usage value` desde los cierres—, pero no sabe cuánto
 * **suele** costar un tipo de trabajo, y sin esa referencia un ticket que se fue a
 * veinte veces lo habitual se ve igual que uno normal hasta que alguien abre el
 * informe y compara a ojo. Lo que falta no es más observabilidad: es una referencia
 * y tres cortes que hagan algo al cruzarla.
 *
 * Cinco decisiones que hacen que esto no sea un número decorativo:
 *
 * 1. **El típico es la mediana de los cierres del tipo, no su media.** Un ticket que
 *    se disparó es exactamente el caso que hay que detectar, y con la media ese
 *    mismo ticket sube la referencia y tapa al siguiente.
 * 2. **Los cierres con costo parcial no entran.** Una sesión de un proveedor por
 *    suscripción no declara costo; contarla como cero haría parecer barato lo que no
 *    se midió. Se cuentan aparte y se dicen.
 * 3. **Un típico sostenido por menos cierres que `min-samples` se declara como
 *    referencia y no como umbral.** Un solo cierre es una anécdota, y un corte
 *    calculado sobre una anécdota degrada el enrutado por casualidad.
 * 4. **Las acciones nacen apagadas.** Declarar el típico no cuesta nada y no cambia
 *    nada; degradar el modelo de una evaluación sí, así que se enciende a propósito
 *    (`budgets.adaptive.enabled`), que es la decisión D2 de la feature.
 * 5. **La pausa consulta, no decide.** A 3× el harness pide la decisión y devuelve el
 *    código de invariante, para que quien ejecute desatendido tenga de dónde colgar
 *    la parada. Detener la ejecución es R-S5-005; acá no se adelanta.
 *
 * El motor no lee configuración ajena a esto ni habla con nadie: recibe la política
 * —o la lee de `.valmen/config.yaml`, que es donde el proyecto la declara—, mira el
 * registro y devuelve un veredicto. Nada de esto escribe: el presupuesto se declara.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { fail, parseYamlSubset } from "@valmen/core";

import { type RegistryPaths } from "./discovery.js";
import { readReceipts } from "./receipts.js";
import { closedTickets } from "./report.js";
import { readTicket } from "./tickets.js";

/** Los tres cortes, en orden creciente de coste. */
export const BUDGET_TIERS = ["within", "notify", "degrade", "pause"] as const;

/** En qué punto está una corrida respecto del típico de su tipo. */
export type BudgetTier = (typeof BUDGET_TIERS)[number];

/** Cuántas veces el típico hay que superar para cada acción. */
export interface BudgetMultipliers {
  readonly notify: number;
  readonly degrade: number;
  readonly pause: number;
}

/** La política de presupuesto de un proyecto. */
export interface BudgetPolicy {
  /** Si las acciones se aplican. Declarar los típicos no depende de esto. */
  readonly enabled: boolean;
  readonly multipliers: BudgetMultipliers;
  /**
   * Cuántos cierres hacen falta para que un típico sea un umbral.
   *
   * Por debajo, el típico se declara como referencia y no se aplica ningún corte.
   */
  readonly minSamples: number;
  /** De cuántos días atrás se aprenden los cierres. `0` es todo el registro. */
  readonly learnFromDays: number;
  /** El preset al que se degrada el enrutado cuando el corte lo pide. */
  readonly degradePreset: string;
}

/** Los valores del requisito, que son los que rigen sin configuración. */
export const DEFAULT_BUDGET_POLICY: BudgetPolicy = {
  enabled: false,
  multipliers: { notify: 1.5, degrade: 2, pause: 3 },
  minSamples: 3,
  learnFromDays: 90,
  degradePreset: "economy",
};

/** Un valor del mapa de configuración, o `undefined`. */
function valor(mapa: Record<string, unknown>, clave: string): unknown {
  return mapa[clave];
}

/** El `budgets.adaptive` del archivo, o vacío si no está o no se puede leer. */
function adaptiveDe(root: string): Record<string, unknown> {
  let texto: string;
  try {
    texto = readFileSync(join(root, ".valmen", "config.yaml"), "utf8");
  } catch {
    return {};
  }

  let documento: unknown;
  try {
    documento = parseYamlSubset(texto, { fileName: ".valmen/config.yaml" });
  } catch {
    // Un archivo que no parsea se trata como ausente, igual que en el resto del
    // motor: quien lo lee para decidir no puede distinguir «no declarado» de
    // «ilegible», y fallar acá dejaría sin evaluar una compuerta por una tilde.
    return {};
  }
  if (typeof documento !== "object" || documento === null || Array.isArray(documento)) return {};

  const budgets = valor(documento as Record<string, unknown>, "budgets");
  if (typeof budgets !== "object" || budgets === null || Array.isArray(budgets)) return {};

  const adaptive = valor(budgets as Record<string, unknown>, "adaptive");
  if (typeof adaptive !== "object" || adaptive === null || Array.isArray(adaptive)) return {};

  return adaptive as Record<string, unknown>;
}

/** Un número de la política, con su rechazo cuando no lo es. */
function numero(
  adaptive: Record<string, unknown>,
  clave: string,
  porDefecto: number,
  etiqueta: string,
): number {
  const crudo = valor(adaptive, clave);
  if (crudo === undefined || crudo === "") return porDefecto;

  const numero = Number(crudo);
  if (!Number.isFinite(numero) || numero <= 0) {
    fail(
      `config.yaml: "${etiqueta}" debe ser un número mayor que cero, y dice "${String(crudo)}".`,
    );
  }
  return numero;
}

/**
 * La política de presupuesto del proyecto.
 *
 * Sin archivo, o sin la sección, son los valores por defecto —que son los del
 * requisito y con las acciones apagadas—. Un valor que sí se puede leer y está mal
 * —un multiplicador que no es número, unos cortes que no suben— **se dice**: es un
 * error de tipeo con el mismo aspecto que un valor legítimo, y su efecto sería
 * degradar el enrutado con un umbral que nadie eligió.
 */
export function readBudgetPolicy(root: string): BudgetPolicy {
  const adaptive = adaptiveDe(root);

  const minSamples = numero(adaptive, "min-samples", DEFAULT_BUDGET_POLICY.minSamples, "budgets.adaptive.min-samples");
  if (!Number.isInteger(minSamples)) {
    fail('config.yaml: "budgets.adaptive.min-samples" debe ser un número entero de cierres.');
  }

  const multiplicadores = valor(adaptive, "multipliers");
  let notify = DEFAULT_BUDGET_POLICY.multipliers.notify;
  let degrade = DEFAULT_BUDGET_POLICY.multipliers.degrade;
  let pause = DEFAULT_BUDGET_POLICY.multipliers.pause;

  if (multiplicadores !== undefined) {
    if (
      typeof multiplicadores !== "object" ||
      multiplicadores === null ||
      Array.isArray(multiplicadores)
    ) {
      fail('config.yaml: "budgets.adaptive.multipliers" debe ser un mapa.');
    }
    const mapa = multiplicadores as Record<string, unknown>;
    notify = numero(mapa, "notify", notify, "budgets.adaptive.multipliers.notify");
    degrade = numero(mapa, "degrade", degrade, "budgets.adaptive.multipliers.degrade");
    pause = numero(mapa, "pause", pause, "budgets.adaptive.multipliers.pause");

    if (!(notify < degrade && degrade < pause)) {
      fail(
        'config.yaml: "budgets.adaptive.multipliers" tiene que subir de notify ' +
          `(${notify}) a degrade (${degrade}) a pause (${pause}), y así no sube: con esos ` +
          "valores la acción más suave tapa a las otras dos.",
      );
    }
  }

  const preset = valor(adaptive, "degrade-preset");

  return {
    enabled: String(valor(adaptive, "enabled") ?? "") === "true",
    multipliers: { notify, degrade, pause },
    minSamples,
    learnFromDays: numero(
      adaptive,
      "learn-from-days",
      DEFAULT_BUDGET_POLICY.learnFromDays,
      "budgets.adaptive.learn-from-days",
    ),
    degradePreset: preset === undefined ? DEFAULT_BUDGET_POLICY.degradePreset : String(preset),
  };
}

/** El costo típico de un tipo de ticket, aprendido de sus cierres. */
export interface TypicalCost {
  readonly type: string;
  /** La mediana, o `null` si no hay ningún cierre con costo completo. */
  readonly typicalUsd: number | null;
  /** Cuántos cierres sostienen el típico. */
  readonly samples: number;
  /** `true` si son menos que `min-samples`: se declara y no se usa como umbral. */
  readonly reference: boolean;
  readonly minUsd: number | null;
  readonly maxUsd: number | null;
}

/** Lo que el registro sabe sobre el costo de cada tipo de trabajo. */
export interface TypicalCostReport {
  readonly types: readonly TypicalCost[];
  /** Cierres leídos, en la ventana de aprendizaje. */
  readonly closures: number;
  /** Cierres que quedaron fuera del típico por una sesión sin costo. */
  readonly excluded: number;
  readonly learnFromDays: number;
  /** Desde cuándo se aprende, en `YYYY-MM-DD`. `null` es todo el registro. */
  readonly since: string | null;
}

/** Un número de un bloque de consumo, o cero si no está. */
function numeroDeConsumo(valor: unknown): number {
  return typeof valor === "number" && Number.isFinite(valor) ? valor : 0;
}

/** El gasto de un ticket: sus sesiones registradas más los recibos de sus compuertas. */
export function ticketRunCost(paths: RegistryPaths, id: string): number {
  const detalle = readTicket(paths, id);
  const sesiones = (detalle?.usage ?? []).reduce(
    (suma, uso) => suma + numeroDeConsumo(uso["estimated_cost_usd"]),
    0,
  );

  // Los recibos de una compuerta escalada se anexan dos veces —la segunda trae la
  // decisión humana— y sumar las dos contaría dos veces la misma evaluación.
  const vigentes = new Map<string, number>();
  for (const recibo of readReceipts(paths, id)) {
    vigentes.set(recibo.id, recibo.usage?.costUsd ?? 0);
  }

  return sesiones + [...vigentes.values()].reduce((suma, costo) => suma + costo, 0);
}

/** `true` si el ticket registró alguna sesión sin costo. */
function tieneCostoParcial(usos: readonly Record<string, unknown>[]): boolean {
  return usos.some(
    (uso) => uso["estimated_cost_usd"] === null || uso["estimated_cost_usd"] === undefined,
  );
}

/** La mediana de una lista de números, sin mutar la original. */
function mediana(valores: readonly number[]): number | null {
  if (valores.length === 0) return null;
  const orden = [...valores].sort((a, b) => a - b);
  const medio = Math.floor(orden.length / 2);
  return orden.length % 2 === 1
    ? (orden[medio] as number)
    : ((orden[medio - 1] as number) + (orden[medio] as number)) / 2;
}

/**
 * El costo típico de cada tipo, aprendido de los cierres registrados.
 *
 * La ventana sale de `learn-from-days` sobre la fecha de cierre —la misma que usa
 * el informe de valor, y por el mismo motivo: un ticket pertenece al día en que se
 * cerró, no al día en que alguien le corrigió una tilde—.
 */
export function learnTypicalCosts(
  paths: RegistryPaths,
  policy: BudgetPolicy = DEFAULT_BUDGET_POLICY,
  options: { readonly now?: Date } = {},
): TypicalCostReport {
  const ahora = options.now ?? new Date();
  const desde =
    policy.learnFromDays <= 0
      ? null
      : new Date(ahora.getTime() - policy.learnFromDays * 24 * 60 * 60 * 1000)
          .toISOString()
          .slice(0, 10);

  const porTipo = new Map<string, number[]>();
  let closures = 0;
  let excluded = 0;

  for (const cierre of closedTickets(paths)) {
    if (desde !== null && cierre.closedOn < desde) continue;
    closures += 1;

    const detalle = readTicket(paths, cierre.ticketId);
    // Un cierre con una sesión sin costo no dice cuánto costó: entra al conteo de
    // cierres y no al típico.
    if (detalle !== null && tieneCostoParcial(detalle.usage)) {
      excluded += 1;
      continue;
    }

    const costos = porTipo.get(cierre.type) ?? [];
    costos.push(ticketRunCost(paths, cierre.ticketId));
    porTipo.set(cierre.type, costos);
  }

  const types: TypicalCost[] = [...porTipo.entries()]
    .map(([type, costos]) => ({
      type,
      typicalUsd: mediana(costos),
      samples: costos.length,
      reference: costos.length < policy.minSamples,
      minUsd: costos.length === 0 ? null : Math.min(...costos),
      maxUsd: costos.length === 0 ? null : Math.max(...costos),
    }))
    .sort((a, b) => (a.type < b.type ? -1 : 1));

  return { types, closures, excluded, learnFromDays: policy.learnFromDays, since: desde };
}

/** El típico de un tipo, o `null` si el registro no tiene cierres de ese tipo. */
export function typicalFor(report: TypicalCostReport, type: string): TypicalCost | null {
  return report.types.find((entrada) => entrada.type === type) ?? null;
}

/** Los umbrales en dinero para un típico, o `null`s si no hay contra qué comparar. */
export interface TierThresholds {
  readonly notifyUsd: number | null;
  readonly degradeUsd: number | null;
  readonly pauseUsd: number | null;
}

/** Lo que dice el presupuesto sobre una corrida. */
export interface BudgetVerdict {
  readonly tier: BudgetTier;
  /** Cuántas veces el típico lleva la corrida. `null` si no hay típico. */
  readonly multiple: number | null;
  readonly thresholds: TierThresholds;
  readonly reason: string;
}

/** Un múltiplo, en la forma en que se lee: `2.5×`. */
export function renderMultiple(multiple: number): string {
  return `${multiple.toFixed(1)}×`;
}

/**
 * Clasifica una corrida contra el típico de su tipo.
 *
 * El veredicto **no** depende de si las acciones están encendidas: lo que se declara
 * es dónde está la corrida, y encender las acciones decide qué se hace con eso. Sin
 * típico, o con un típico que es solo una referencia, la corrida cumple y los
 * umbrales van vacíos —que no es lo mismo que cero—.
 */
export function classifyRunCost(input: {
  readonly costUsd: number;
  readonly typicalUsd: number | null;
  readonly policy: BudgetPolicy;
  readonly reference?: boolean;
}): BudgetVerdict {
  const vacios: TierThresholds = { notifyUsd: null, degradeUsd: null, pauseUsd: null };
  const { costUsd, typicalUsd, policy } = input;

  if (typicalUsd === null || typicalUsd <= 0) {
    return {
      tier: "within",
      multiple: null,
      thresholds: vacios,
      reason: "no hay cierres de este tipo que declaren un costo típico",
    };
  }

  const multiple = costUsd / typicalUsd;

  if (input.reference === true) {
    return {
      tier: "within",
      multiple,
      thresholds: vacios,
      reason:
        `el típico se sostiene con menos cierres que los ${policy.minSamples} que hacen ` +
        "falta para aplicar un corte, así que es una referencia",
    };
  }

  const thresholds: TierThresholds = {
    notifyUsd: typicalUsd * policy.multipliers.notify,
    degradeUsd: typicalUsd * policy.multipliers.degrade,
    pauseUsd: typicalUsd * policy.multipliers.pause,
  };

  const tier: BudgetTier =
    costUsd >= (thresholds.pauseUsd as number)
      ? "pause"
      : costUsd >= (thresholds.degradeUsd as number)
        ? "degrade"
        : costUsd >= (thresholds.notifyUsd as number)
          ? "notify"
          : "within";

  const motivos: Record<BudgetTier, string> = {
    within: `la corrida lleva ${renderMultiple(multiple)} el costo típico y no alcanza el corte de aviso`,
    notify: `la corrida lleva ${renderMultiple(multiple)} el costo típico y pasa el corte de aviso`,
    degrade: `la corrida lleva ${renderMultiple(multiple)} el costo típico y pasa el corte de degradación`,
    pause: `la corrida lleva ${renderMultiple(multiple)} el costo típico y pasa el corte de pausa`,
  };

  return { tier, multiple, thresholds, reason: motivos[tier] };
}

/**
 * El preset al que se degrada el enrutado, o `null` si no corresponde degradar.
 *
 * El corte de pausa **también** degrada: es un corte más alto, no una acción
 * distinta, y un ticket en pausa que sigue evaluándose con el modelo caro sería la
 * peor combinación de las dos.
 */
export function presetForDegradation(tier: BudgetTier, policy: BudgetPolicy): string | null {
  if (!policy.enabled) return null;
  if (tier !== "degrade" && tier !== "pause") return null;
  return policy.degradePreset === "" ? null : policy.degradePreset;
}

/** El presupuesto de una corrida concreta, con todo lo que la decisión necesita. */
export interface TicketBudget {
  readonly ticketId: string;
  readonly title: string;
  readonly type: string;
  readonly costUsd: number;
  readonly typicalUsd: number | null;
  readonly samples: number;
  readonly reference: boolean;
  readonly tier: BudgetTier;
  readonly multiple: number | null;
  readonly thresholds: TierThresholds;
  /** El preset al que degradar el enrutado, o `null`. */
  readonly preset: string | null;
  readonly reason: string;
  /** Si las acciones del proyecto están encendidas. */
  readonly enabled: boolean;
}

/** El presupuesto de un ticket: su gasto contra el típico de su tipo. */
export function budgetForTicket(
  paths: RegistryPaths,
  id: string,
  policy: BudgetPolicy = DEFAULT_BUDGET_POLICY,
  options: { readonly now?: Date } = {},
): TicketBudget {
  const detalle = readTicket(paths, id);
  if (detalle === null) {
    fail(`No existe el ticket ${id} en el registro.`);
  }

  const informe = learnTypicalCosts(paths, policy, options);
  const typical = typicalFor(informe, detalle.type);
  const costUsd = ticketRunCost(paths, id);
  const verdict = classifyRunCost({
    costUsd,
    typicalUsd: typical?.typicalUsd ?? null,
    policy,
    reference: typical?.reference ?? false,
  });

  return {
    ticketId: detalle.id,
    title: detalle.title,
    type: detalle.type,
    costUsd,
    typicalUsd: typical?.typicalUsd ?? null,
    samples: typical?.samples ?? 0,
    reference: typical?.reference ?? false,
    tier: verdict.tier,
    multiple: verdict.multiple,
    thresholds: verdict.thresholds,
    preset: presetForDegradation(verdict.tier, policy),
    reason: verdict.reason,
    enabled: policy.enabled,
  };
}

/** Lo que el borde necesita para decidir el enrutado de una compuerta. */
export interface BudgetRouting {
  readonly tier: BudgetTier;
  /** El preset a usar, o `null` si no corresponde degradar. */
  readonly preset: string | null;
  /** La nota que explica la degradación, para el recibo. `null` si no hay ninguna. */
  readonly note: string | null;
}

/**
 * El presupuesto aplicado al enrutado de una compuerta.
 *
 * Existe para que el borde —el CLI y el MCP— tenga una sola llamada que hacer antes
 * de resolver el routing, y para que un problema en la configuración del
 * presupuesto **no detenga una compuerta**: sin política legible se devuelve el
 * veredicto neutro con el motivo, que es lo que el recibo necesita para que se
 * pueda arreglar.
 */
export function budgetRouting(
  paths: RegistryPaths,
  id: string,
  options: { readonly now?: Date } = {},
): BudgetRouting {
  try {
    const policy = readBudgetPolicy(paths.root);
    const presupuesto = budgetForTicket(paths, id, policy, options);
    if (presupuesto.preset === null) {
      return { tier: presupuesto.tier, preset: null, note: null };
    }
    return {
      tier: presupuesto.tier,
      preset: presupuesto.preset,
      note:
        `Routing degradado por presupuesto: el ticket lleva ${renderMultiple(presupuesto.multiple ?? 0)} ` +
        `el costo típico de su tipo (${presupuesto.tier}) y se evalúa con el preset ` +
        `${presupuesto.preset}.`,
    };
  } catch (caught) {
    return {
      tier: "within",
      preset: null,
      note: `El presupuesto del proyecto no se pudo leer: ${
        caught instanceof Error ? caught.message : String(caught)
      }`,
    };
  }
}

/** Un monto, con los decimales que hacen falta para leerlo. */
function monto(valor: number): string {
  return `$${valor.toFixed(4)}`;
}

/** Una fila por tipo: su típico, sus cierres y sus cortes. */
function filaDeTipo(entrada: TypicalCost, policy: BudgetPolicy): string {
  const tipo = entrada.type.padEnd(12);

  if (entrada.typicalUsd === null) {
    return `  ${tipo} sin cierres con costo registrado`;
  }

  if (entrada.reference) {
    return (
      `  ${tipo} ${monto(entrada.typicalUsd).padStart(10)}   ${entrada.samples} cierre(s)   ` +
      `referencia: el corte necesita ${policy.minSamples} cierre(s)`
    );
  }

  return (
    `  ${tipo} ${monto(entrada.typicalUsd).padStart(10)}   ${entrada.samples} cierre(s)   ` +
    `aviso ${monto(entrada.typicalUsd * policy.multipliers.notify)} · ` +
    `degrada ${monto(entrada.typicalUsd * policy.multipliers.degrade)} · ` +
    `pausa ${monto(entrada.typicalUsd * policy.multipliers.pause)}`
  );
}

/** El bloque de una corrida concreta. */
function bloqueDeCorrida(presupuesto: TicketBudget, policy: BudgetPolicy): string[] {
  const lineas = [
    "",
    `Corrida de ${presupuesto.ticketId} — ${presupuesto.title}`,
    `  tipo        ${presupuesto.type}`,
    `  costo       ${monto(presupuesto.costUsd)}`,
  ];

  if (presupuesto.typicalUsd === null) {
    lineas.push(`  típico      sin cierres de ${presupuesto.type} que lo declaren`);
  } else {
    lineas.push(
      `  típico      ${monto(presupuesto.typicalUsd)} (${presupuesto.samples} cierre(s))`,
    );
    lineas.push(
      `  múltiplo    ${presupuesto.multiple === null ? "—" : renderMultiple(presupuesto.multiple)} del típico`,
    );
  }

  if (presupuesto.thresholds.pauseUsd === null) {
    lineas.push(`  corte       cumple (sin corte aplicable: ${presupuesto.reason})`);
  } else {
    lineas.push(`  corte       ${presupuesto.tier} — ${presupuesto.reason}`);
    lineas.push(
      `  umbrales    aviso ${monto(presupuesto.thresholds.notifyUsd as number)} · ` +
        `degrada ${monto(presupuesto.thresholds.degradeUsd as number)} · ` +
        `pausa ${monto(presupuesto.thresholds.pauseUsd as number)}`,
    );
  }

  if (presupuesto.preset !== null) {
    lineas.push(
      `  enrutado    degradado a ${presupuesto.preset}: la compuerta de este ticket se ` +
        "evalúa con ese preset y el recibo lo dice",
    );
  }

  if (presupuesto.tier === "pause") {
    lineas.push(
      "",
      "  El corte de pausa no lo decide el harness: la corrida se detiene y la decisión",
      "  es tuya. Con `--check` el comando sale con el código de invariante, que es lo que",
      "  una corrida desatendida mira para parar.",
    );
  }

  void policy;
  return lineas;
}

/**
 * El informe: los típicos, los cortes del proyecto y —si se pidió un ticket— dónde
 * está esa corrida.
 */
export function renderBudgetReport(input: {
  readonly report: TypicalCostReport;
  readonly policy: BudgetPolicy;
  readonly assessment: TicketBudget | null;
}): string {
  const { report, policy, assessment } = input;
  const lineas = [
    `Presupuestos adaptativos — ${report.closures} cierre(s) leídos, ${report.excluded} cierre(s) sin costo completo`,
    report.since === null
      ? "  Se aprende de todo el registro."
      : `  Se aprende de los cierres desde ${report.since} (learn-from-days: ${report.learnFromDays}).`,
    policy.enabled
      ? "  Acciones encendidas: el corte de degradación cambia el preset de la compuerta."
      : "  Acciones apagadas (budgets.adaptive.enabled): los típicos se declaran y ninguna corrida cambia de enrutado.",
    "",
  ];

  if (report.types.length === 0) {
    lineas.push("  Ningún tipo declara un típico todavía: no hay cierres con costo registrado.");
  } else {
    for (const entrada of report.types) lineas.push(filaDeTipo(entrada, policy));
  }

  if (assessment !== null) lineas.push(...bloqueDeCorrida(assessment, policy));

  return `${lineas.join("\n")}\n`;
}
