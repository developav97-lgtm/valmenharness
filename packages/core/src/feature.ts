/**
 * El contrato de una feature.
 *
 * Una feature es lo que no cabe en un ticket: un módulo con varias pantallas,
 * reportes y configuración. Su ciclo de vida es **distinto** del de un ticket —se
 * mide en semanas y en varios tickets hijos— así que tiene su propia máquina de
 * estados y sus propios artefactos. Ver `docs/02-MOTOR.md` §3.4–§6.
 *
 * ```
 * .valmen/features/<slug>/
 *   feature.md          el brief y el frontmatter con el estado
 *   spec/<dominio>/spec.md   requisitos RFC 2119 y escenarios
 *   design.md           diseño técnico con alternativas y decisión
 *   tickets.yaml        el grafo: sprints, cobertura y huecos
 *   verify.md           la evidencia al completar
 * ```
 *
 * **La regla que importa** es la de cobertura, y es la razón de que esto exista
 * como módulo y no como una carpeta de documentos: una feature no entra a
 * `decomposed` si algún requisito de su spec no está cubierto por al menos un
 * ticket. Es un check mecánico, no una revisión — y es lo que impide que la
 * promesa de la spec se pierda por el camino al partirla en tickets.
 */
import { fail } from "./errors.js";
import { EXIT_INVARIANT, EXIT_SCHEMA } from "./errors.js";
import { DATE_RE } from "./contract.js";

/**
 * Los estados de una feature.
 *
 * `archived` es el único terminal: una feature completa se archiva cuando sus
 * specs se componen en `specs/`, y a partir de ahí no hay vuelta.
 */
export const FEATURE_STATES = [
  "draft",
  "specified",
  "planned",
  "decomposed",
  "in_progress",
  "complete",
  "archived",
  "blocked",
] as const;

export type FeatureState = (typeof FEATURE_STATES)[number];

/**
 * Las transiciones permitidas.
 *
 * `blocked` se alcanza desde cualquier estado no terminal y devuelve al estado
 * del que se entró —no a uno cualquiera—, porque una feature bloqueada sigue
 * teniendo el estado que tenía: lo que cambia es que no puede avanzar.
 *
 * `decomposed → planned` existe a propósito: cambiar el alcance de una feature
 * obliga a rehacer el diseño y a volver a pasar la compuerta de cobertura. Sin
 * esa arista, la única salida sería retroceder a mano por el frontmatter, que es
 * justo lo que el contrato existe para impedir.
 */
export const FEATURE_TRANSITIONS: Readonly<
  Record<FeatureState, readonly FeatureState[]>
> = {
  draft: ["specified", "blocked"],
  specified: ["planned", "blocked"],
  planned: ["decomposed", "blocked"],
  decomposed: ["in_progress", "planned", "blocked"],
  in_progress: ["complete", "blocked"],
  complete: ["archived", "blocked"],
  archived: [],
  blocked: ["draft", "specified", "planned", "decomposed", "in_progress", "complete"],
};

/** El estado del que se puede entrar y salir de `blocked`. */
export const FEATURE_BLOCKED_EXITS = FEATURE_TRANSITIONS.blocked;

/** El frontmatter de una feature, en orden. */
export const FEATURE_FRONTMATTER_FIELDS = [
  "schema_version",
  "id",
  "title",
  "state",
  "created",
  "updated",
] as const;

/**
 * Un identificador de feature: minúsculas, dígitos y guiones.
 *
 * A diferencia del identificador de un ticket, no lleva fecha ni tipo. Una
 * feature se nombra por lo que es —`modulo-inventario`— y sobrevive a las fechas
 * del trabajo que contiene.
 */
export const FEATURE_ID_RE = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

/** Una transición de feature. */
export function canTransitionFeature(from: string, to: string): boolean {
  return (FEATURE_TRANSITIONS[from as FeatureState] ?? []).includes(
    to as FeatureState,
  );
}

/** Los destinos legales desde un estado. */
export function nextFeatureStates(from: string): readonly string[] {
  return FEATURE_TRANSITIONS[from as FeatureState] ?? [];
}

/** Comprueba la legalidad y falla con el estado actual y el pedido. */
export function assertFeatureTransition(from: string, to: string): void {
  if (canTransitionFeature(from, to)) return;
  fail(`Transición de feature ${from} -> ${to} no permitida.`, EXIT_INVARIANT);
}

// ── La compuerta de cobertura ───────────────────────────────────────────────

/** Un requisito de la spec, tal como lo lee el motor. */
export interface FeatureRequirement {
  /** Identificador estable, como `R-INV-001`. */
  readonly id: string;
  /** El enunciado, con su palabra RFC 2119 (`DEBE`, `DEBERÍA`, `PUEDE`). */
  readonly statement: string;
}

/** Un tramo de la cobertura: qué requisito cubre qué tickets. */
export interface CoverageEntry {
  readonly requirement: string;
  readonly coveredBy: readonly string[];
}

/** Lo que el `tickets.yaml` declara. */
export interface FeatureDecomposition {
  readonly sprints: readonly {
    readonly id: string;
    readonly goal: string;
    readonly tickets: readonly string[];
  }[];
  readonly coverage: readonly CoverageEntry[];
  /** Los huecos declarados. Para pasar la compuerta tiene que estar vacío. */
  readonly gaps: readonly string[];
}

/** Un hueco de cobertura: un requisito que ningún ticket cubre. */
export interface CoverageGap {
  readonly requirement: string;
  readonly statement: string;
}

/**
 * Los requisitos que ningún ticket cubre.
 *
 * Devuelve el enunciado y no solo el identificador: quien lee el error tiene que
 * poder arreglarlo sin abrir la spec, y `R-INV-007` no dice nada por sí solo.
 * Se listan también los tickets que la cobertura menciona y no existen en ningún
 * sprint, porque un ticket fantasma cubre lo mismo que ninguno.
 */
export function coverageGaps(
  requirements: readonly FeatureRequirement[],
  decomposition: FeatureDecomposition,
): CoverageGap[] {
  const porRequisito = new Map(
    decomposition.coverage.map((entrada) => [entrada.requirement, entrada.coveredBy]),
  );
  const enSprints = new Set(
    decomposition.sprints.flatMap((sprint) => [...sprint.tickets]),
  );

  const huecos: CoverageGap[] = [];
  for (const requisito of requirements) {
    const cubren = porRequisito.get(requisito.id) ?? [];
    if (cubren.length === 0) {
      huecos.push({ requirement: requisito.id, statement: requisito.statement });
      continue;
    }
    const reales = cubren.filter((ticket) => enSprints.has(ticket));
    if (reales.length === 0) {
      huecos.push({
        requirement: requisito.id,
        statement:
          `${requisito.statement} (la cobertura menciona ${cubren.join(", ")}, ` +
          "que no está en ningún sprint)",
      });
    }
  }
  return huecos;
}

/**
 * La compuerta: no se entra a `decomposed` con requisitos sin cubrir.
 *
 * Es la regla dura del diseño y la razón de que la descomposición sea un paso
 * verificable en vez de una promesa. Los huecos que el propio `tickets.yaml`
 * declare cuentan igual que los que el motor encuentre: declarar un hueco no es
 * cubrirlo.
 */
export function assertDecompositionComplete(
  requirements: readonly FeatureRequirement[],
  decomposition: FeatureDecomposition,
): void {
  const huecos = coverageGaps(requirements, decomposition);
  const declarados = [...decomposition.gaps];

  if (huecos.length === 0 && declarados.length === 0) return;

  const partes: string[] = [];
  if (huecos.length > 0) {
    partes.push(
      `${huecos.length} requisito(s) sin ticket que los cubra: ` +
        huecos.map((hueco) => `${hueco.requirement} — ${hueco.statement}`).join("; "),
    );
  }
  if (declarados.length > 0) {
    partes.push(`huecos declarados: ${declarados.join("; ")}`);
  }

  fail(
    "No se puede pasar a decomposed: " +
      partes.join(". ") +
      ". Cada requisito necesita al menos un ticket en un sprint.",
    EXIT_INVARIANT,
  );
}

// ── Validación del documento ────────────────────────────────────────────────

/** Lo mínimo que el motor necesita saber de una feature. */
export interface FeatureFields {
  readonly id: string;
  readonly title: string;
  readonly state: string;
  readonly created: string;
  readonly updated: string;
}

/**
 * Valida los campos de una feature.
 *
 * Sin I/O y sin leer la spec: esto comprueba la **forma**. La compuerta de
 * cobertura necesita los requisitos y el grafo, y se comprueba aparte.
 */
export function validateFeatureFields(fields: FeatureFields): void {
  if (!FEATURE_ID_RE.test(fields.id)) {
    fail(
      `El identificador de la feature "${fields.id}" debe ser un slug en ` +
        "minúsculas: letras, dígitos y guiones.",
      EXIT_SCHEMA,
    );
  }
  if (fields.title.trim() === "") {
    fail("La feature necesita un título.", EXIT_SCHEMA);
  }
  if (!FEATURE_STATES.includes(fields.state as FeatureState)) {
    fail(
      `El estado "${fields.state}" no pertenece al esquema. ` +
        `Los válidos son: ${FEATURE_STATES.join(", ")}.`,
      EXIT_SCHEMA,
    );
  }
  for (const [nombre, valor] of [
    ["created", fields.created],
    ["updated", fields.updated],
  ] as const) {
    if (!DATE_RE.test(valor)) {
      fail(`${nombre} debe usar YYYY-MM-DD.`, EXIT_SCHEMA);
    }
  }
}

/**
 * La plantilla de una feature.
 *
 * Igual que la del ticket, vive aquí y el proyecto la puede adaptar: qué se
 * espera que diga «Restricciones» depende de cómo trabaje cada equipo. La
 * **estructura** —el frontmatter, las secciones y los artefactos— es el contrato.
 *
 * Las secciones del brief son las cuatro que el diseño exige para salir de
 * `draft`: problema, objetivo, alcance y restricciones. Están vacías a propósito:
 * una plantilla con texto de relleno se aprueba sin leerlo.
 */
export const FEATURE_TEMPLATE = `---
schema_version: 2
id: TYPE-SLUG
title: Título de la feature
state: draft
created: YYYY-MM-DD
updated: YYYY-MM-DD
---

# Título de la feature

## Problema

<!-- Qué duele hoy y a quién. Sin esto no hay forma de saber si la feature sirvió. -->

## Objetivo

## Alcance

- Dentro:
- Fuera:

## Restricciones

## Artefactos

- \`spec/<dominio>/spec.md\` — requisitos RFC 2119 y escenarios.
- \`design.md\` — alternativas y decisión técnica.
- \`tickets.yaml\` — el grafo: sprints, cobertura y huecos.
- \`verify.md\` — la evidencia, al completar.`
