/**
 * Contrato del ticket — constantes extraídas del CLI de referencia.
 *
 * Cada valor de este archivo está verificado contra `tools/agentic/ticket.py`
 * de SaiOpenCloud. No se inventó ninguno: ver
 * docs/09-MIGRACION-SAICLOUD.md §2bis.2ter.
 */
/**
 * Los 18 campos de frontmatter, **en orden exacto**.
 *
 * El validador de referencia compara la tupla completa de claves contra esta
 * lista, así que el orden es parte del contrato: reordenar el frontmatter de un
 * ticket existente lo invalida.
 */
export declare const FRONTMATTER_FIELDS: readonly ["schema_version", "id", "title", "type", "module", "workflow_status", "qa_status", "release_status", "user_visible", "sync_impact", "migration_impact", "docker_impact", "risk_level", "created", "updated", "related_ticket", "target_release", "released_in"];
export type FrontmatterField = (typeof FRONTMATTER_FIELDS)[number];
/**
 * Versión del esquema que escribe este motor.
 *
 * La migración desde el esquema 1 (el de `ticket.py`) es una operación
 * explícita e idempotente que solo reescribe el frontmatter: los bloques JSON
 * append-only de un ticket **nunca** se tocan. Ver Q16 en
 * docs/11-OPEN-QUESTIONS.md.
 */
export declare const SCHEMA_VERSION: "2";
/** Versión del esquema anterior, la que escribe `ticket.py`. */
export declare const LEGACY_SCHEMA_VERSION: "1";
/**
 * Las 15 secciones Markdown, **en orden canónico**.
 *
 * El parser busca `Solicitud original` primero y luego exige que la secuencia
 * de encabezados que sigue sea exactamente `SECTIONS[1:]`. Una sección extra,
 * faltante o fuera de orden falla.
 */
export declare const SECTIONS: readonly ["Solicitud original", "Descripción funcional", "Diagnóstico", "Plan", "Criterios de aceptación", "Puntos", "Implementación", "Pruebas", "QA", "Evidencia", "Retests", "Cierre", "Consumo de IA", "Release", "Eventos"];
export type SectionName = (typeof SECTIONS)[number];
/**
 * Las 7 secciones que contienen exactamente un bloque JSON *fenced*.
 *
 * Cada una debe tener **exactamente uno**: cero o dos fallan.
 */
export declare const STRUCTURED_SECTIONS: readonly ["Puntos", "QA", "Evidencia", "Retests", "Cierre", "Consumo de IA", "Eventos"];
export type StructuredSectionName = (typeof STRUCTURED_SECTIONS)[number];
export declare const TICKET_TYPES: readonly ["FEATURE", "BUGFIX", "IMPROVEMENT", "SYNC", "INTEGRATION", "AGENT", "SECURITY", "CLAUDIO", "CHORE", "DOCS"];
export type TicketType = (typeof TICKET_TYPES)[number];
/**
 * Tipos que añade el esquema 2 respecto al 1.
 *
 * `CHORE` cubre el mantenimiento interno y `DOCS` la documentación: trabajo que
 * antes se atendía en modo directo y por eso no quedaba registrado en ningún
 * lado. Ambos son opcionales en los gates de plan.
 */
export declare const V2_ONLY_TICKET_TYPES: readonly ["CHORE", "DOCS"];
export declare const RISK_LEVELS: readonly ["low", "normal", "high", "critical"];
export type RiskLevel = (typeof RISK_LEVELS)[number];
export declare const SEVERITIES: readonly ["low", "normal", "high", "critical"];
export type Severity = (typeof SEVERITIES)[number];
export declare const WORKFLOW_STATES: readonly ["intake", "analyzed", "planned", "approved", "in_progress", "blocked", "awaiting_user_tests", "in_qa", "changes_requested", "qa_approved", "closed"];
export type WorkflowState = (typeof WORKFLOW_STATES)[number];
/**
 * Estados desde los que se puede entrar y salir de `blocked`.
 *
 * `blocked` es una adición del esquema 2: el esquema 1 obligaba a usar
 * `changes_requested` para dependencias externas que no eran cambios, lo que
 * ensuciaba la semántica del estado.
 */
export declare const BLOCKED_EXITS: readonly ["analyzed", "planned", "approved", "in_progress"];
export declare const QA_STATES: readonly ["pending", "in_qa", "approved", "waived"];
export type QaState = (typeof QA_STATES)[number];
export declare const RELEASE_STATES: readonly ["not_applicable", "unreleased", "planned", "released"];
export type ReleaseState = (typeof RELEASE_STATES)[number];
export declare const POINT_STATES: readonly ["open", "analyzed", "in_progress", "awaiting_retest", "verified", "closed", "not_reproducible", "deferred", "duplicate"];
export type PointState = (typeof POINT_STATES)[number];
/**
 * Estados terminales de un punto. Exigen `terminal_reason` no vacío.
 */
export declare const TERMINAL_POINT_STATES: readonly ["not_reproducible", "deferred", "duplicate"];
/**
 * Estados que impiden que el ticket pase a `qa_approved`.
 *
 * Nótese que **`verified` NO está aquí**, y eso es deliberado en el contrato
 * original: un punto verificado no bloquea la aprobación de QA. Es la causa de
 * que 55 de los 137 puntos históricos quedaran en `verified` sin cerrarse.
 * Ver docs/09-MIGRACION-SAICLOUD.md §2bis.2quater.
 */
export declare const BLOCKING_POINT_STATES: readonly ["open", "analyzed", "in_progress", "awaiting_retest"];
/**
 * Máximo de puntos por ticket.
 *
 * El límite es por funcionalidad, no por hallazgo: una lista de hallazgos de la
 * misma funcionalidad permanece en un único ticket.
 */
export declare const MAX_POINTS = 20;
/** Máximo de niveles en una escala `score` de un evaluador tipo Jev. */
export declare const MAX_SCORE_LEVELS = 10;
/**
 * Enum cerrado de tipos de evidencia.
 *
 * **Por qué existe.** En el esquema 1, `evidence.kind` era el único campo del
 * contrato sin validar, y derivó a 30 valores distintos en 177 entradas:
 * `automated`×58, `automated_test`×15, `test`×12 y `automated-test`×4 convivían
 * como si fueran cosas distintas. Cualquier reporte que agrupara por `kind` daba
 * un número silenciosamente incorrecto.
 *
 * Los valores históricos **no se reescriben**: se normalizan al agregar, con la
 * tabla de `legacyEvidenceKinds`.
 */
export declare const EVIDENCE_KINDS: readonly ["automated-test", "manual-test", "code-inspection", "build", "deployment", "user-report", "runtime-log", "static-analysis"];
export type EvidenceKind = (typeof EVIDENCE_KINDS)[number];
/**
 * Vía de escape para tipos de evidencia que el enum no cubre.
 *
 * Obliga a un prefijo `x-` para que sea evidente en los datos que es una
 * extensión y no un valor canónico mal escrito.
 */
export declare const CUSTOM_EVIDENCE_KIND_RE: RegExp;
/**
 * Normalización de los 30 valores históricos a los 8 canónicos.
 *
 * Se aplica **solo al agregar y reportar**, nunca al escribir: los tickets
 * existentes conservan su `kind` original. Ver el análisis en
 * docs/09-MIGRACION-SAICLOUD.md §2bis.3.
 */
export declare const LEGACY_EVIDENCE_KINDS: Readonly<Record<string, EvidenceKind>>;
/**
 * Normaliza un `kind` de evidencia, sea canónico o histórico.
 *
 * Devuelve `undefined` si el valor no es canónico ni está en la tabla, lo que
 * permite reportarlo como desconocido en vez de contarlo mal.
 */
export declare function normalizeEvidenceKind(kind: string): EvidenceKind | undefined;
/**
 * `<TIPO>-<MODULO>-<DESCRIPCION>-<YYYYMMDD>`
 *
 * El módulo es `[A-Z0-9]+` (un solo segmento); la descripción admite segmentos
 * separados por guiones.
 */
export declare const ID_RE: RegExp;
export declare const DATE_RE: RegExp;
export declare const SEMVER_RE: RegExp;
export declare const BUILD_REFERENCE_RE: RegExp;
/** Una línea de frontmatter: `clave: valor`, con clave en minúsculas. */
export declare const FRONTMATTER_LINE_RE: RegExp;
/**
 * Apertura del frontmatter: `---`, contenido, `---` y salto de línea.
 *
 * Solo se admite `\n`: un archivo con CRLF no abre el frontmatter.
 */
export declare const FRONTMATTER_BLOCK_RE: RegExp;
/** Prefijos de identificadores monótonos por sección estructurada. */
export declare const ID_PREFIXES: {
    readonly Puntos: "POINT";
    readonly QA: "QA";
    readonly Evidencia: "EVIDENCE";
    readonly Retests: "RETEST";
    readonly Cierre: "CLOSE";
    readonly "Consumo de IA": "CONSUMO";
    readonly Eventos: "EVENT";
};
/** Ancho de relleno de los identificadores monótonos: `POINT-001`. */
export declare const ID_PAD = 3;
//# sourceMappingURL=contract.d.ts.map