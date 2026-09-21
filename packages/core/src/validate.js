/**
 * Validador del documento completo.
 *
 * Espeja `validate_document` del CLI de referencia. **El orden de las
 * comprobaciones es parte del contrato**: el primer fallo aborta y enmascara
 * los posteriores, así que una reimplementación que valide en otro orden
 * produce mensajes distintos para el mismo archivo inválido.
 *
 * Ver docs/09-MIGRACION-SAICLOUD.md §2bis.2ter para el contrato autoritativo.
 */
import { BLOCKING_POINT_STATES, ID_RE, MAX_POINTS, QA_STATES, RELEASE_STATES, RISK_LEVELS, SEMVER_RE, TICKET_TYPES, WORKFLOW_STATES, } from "./contract.js";
import { EXIT_SCHEMA, fail } from "./errors.js";
import { nextPointId, pointIdsRecordedInEvents, validateAiUsage, validateClosures, validateEvents, validateEvidence, validatePoints, validateQa, validateRetests, } from "./blocks.js";
import { PLACEHOLDERS, PLACEHOLDERS_WITH_DASH, isPlaceholder, isPrintable, requireList, rstripChars, validateIsoDate, validateNullableText, validateSequential, validateText, validateTitle, } from "./validators.js";
import { isSafePlainScalar } from "./parser.js";
/** Estados desde `planned` en adelante. */
const PLANNED_OR_LATER = [
    "planned",
    "approved",
    "in_progress",
    "awaiting_user_tests",
    "in_qa",
    "changes_requested",
    "qa_approved",
    "closed",
];
/** Estados desde `approved` en adelante. */
const APPROVED_OR_LATER = [
    "approved",
    "in_progress",
    "awaiting_user_tests",
    "in_qa",
    "changes_requested",
    "qa_approved",
    "closed",
];
/** Estados que exigen un resultado de pruebas del PO registrado. */
const QA_REQUIRED_STATES = [
    "in_qa",
    "changes_requested",
    "qa_approved",
    "closed",
];
// ── Utilidades de Markdown ──────────────────────────────────────────────────
/** Quita los comentarios HTML de un fragmento. */
export function stripHtmlComments(value) {
    return value.replace(/<!--[\s\S]*?-->/g, "");
}
/** Texto Markdown significativo: sin comentarios HTML y recortado. */
export function meaningfulMarkdown(value) {
    return stripHtmlComments(value).trim();
}
/** Quita el prefijo de viñeta o numeración de una línea. */
export function stripListMarker(line) {
    return line.replace(/^\s*(?:[-*+]\s+|\d+[.)]\s+)/, "");
}
/**
 * Líneas del plan, sin viñetas ni líneas vacías.
 *
 * No aplica `casefold` ni filtra marcadores de pendiente: es la base que usan
 * las tres comprobaciones del plan.
 */
export function planLines(planSection) {
    return meaningfulMarkdown(planSection)
        .split("\n")
        .map((line) => stripListMarker(line).trim())
        .filter((line) => line !== "");
}
/**
 * `true` si el plan tiene contenido real, no solo marcadores.
 *
 * Es la comprobación que impide que un agente marque un ticket como `planned`
 * con la plantilla sin rellenar.
 */
export function hasSubstantivePlan(planSection) {
    const lines = stripHtmlComments(planSection)
        .split("\n")
        .map((line) => stripListMarker(line).trim());
    for (const line of lines) {
        if (line === "")
            continue;
        if (line.endsWith(":"))
            continue;
        const normalized = rstripChars(line.toLowerCase(), ". ;:");
        if (isPlaceholder(normalized, PLACEHOLDERS_WITH_DASH))
            continue;
        return true;
    }
    return false;
}
/**
 * `true` si el plan es proporcional y estructurado: al menos dos pasos reales
 * que no sean cabeceras de gate ni marcadores de pendiente.
 */
export function hasStructuredPlan(planSection) {
    const steps = planLines(planSection).filter((line) => {
        if (line.endsWith(":"))
            return false;
        const normalized = rstripChars(line.toLowerCase(), ". ;:");
        if (isPlaceholder(normalized, PLACEHOLDERS))
            return false;
        if (normalized.includes("gate"))
            return false;
        if (normalized.includes("aprobación del po"))
            return false;
        return true;
    });
    return steps.length >= 2;
}
/** `true` si el tipo o los impactos exigen aprobación explícita del PO. */
export function isCriticalPlanGate(ticket) {
    const criticalTypes = ["FEATURE", "SYNC", "INTEGRATION", "AGENT", "SECURITY"];
    if (criticalTypes.includes(ticket.fields.type))
        return true;
    return (ticket.fields.sync_impact === "true" ||
        ticket.fields.migration_impact === "true" ||
        ticket.fields.docker_impact === "true");
}
/**
 * `true` si el plan declara el gate de aprobación.
 *
 * Dos vías, y la primera es la única válida para los tickets críticos:
 *
 * 1. Una línea que contenga **a la vez** `aprobado explícitamente por el po` y
 *    (`gate` o `aprobación`).
 * 2. Para los tickets no críticos, una línea `gate no exigible: <razón>` con
 *    una razón real, no un marcador de pendiente.
 */
export function hasPlanGate(ticket) {
    const lines = planLines(ticket.sections.Plan);
    const normalizedLines = lines.map((line) => line.toLowerCase());
    for (const normalized of normalizedLines) {
        if (normalized.includes("aprobado explícitamente por el po") &&
            (normalized.includes("gate") || normalized.includes("aprobación"))) {
            return true;
        }
    }
    if (isCriticalPlanGate(ticket))
        return false;
    for (const normalized of normalizedLines) {
        const match = /gate no exigible\s*:\s*(.+)/.exec(normalized);
        if (match === null)
            continue;
        const reason = rstripChars(match[1].trim(), " .;:-").toLowerCase();
        if (reason === "")
            continue;
        if (isPlaceholder(reason, PLACEHOLDERS_WITH_DASH))
            continue;
        return true;
    }
    return false;
}
/**
 * `true` si la sección `Pruebas` registra el resultado del PO o una omisión
 * explícita y documentada.
 */
export function hasRecordedUserTestOutcome(ticket) {
    const outcomeRe = /(?:resultado(?: comunicado)?(?: (?:del|por el))? po|omisi[oó]n expl[ií]cita(?: (?:y )?documentada)?(?: de pruebas)?(?: (?:del|por el))? po)\s*:\s*(.+)/i;
    for (const rawLine of meaningfulMarkdown(ticket.sections.Pruebas).split("\n")) {
        const line = stripListMarker(rawLine).trim();
        const match = outcomeRe.exec(line);
        if (match === null)
            continue;
        const outcome = rstripChars(match[1].trim(), " .;:-").toLowerCase();
        if (isPlaceholder(outcome, PLACEHOLDERS_WITH_DASH))
            continue;
        return true;
    }
    return false;
}
/**
 * `true` si el historial QA cierra con un ciclo aprobado y confirmado.
 *
 * Un ciclo es una pareja: la entrada par lo abre (`pending`) y la impar lo
 * cierra con un resultado.
 */
export function hasApprovedQaCycle(qa) {
    if (qa.length < 2 || qa.length % 2 !== 0)
        return false;
    const start = qa[qa.length - 2];
    const end = qa[qa.length - 1];
    const buildReference = start["build_reference"];
    const environment = start["environment"];
    const poConfirmation = end["po_confirmation"];
    return (start["result"] === "pending" &&
        typeof buildReference === "string" &&
        buildReference.trim() !== "" &&
        typeof environment === "string" &&
        environment.trim() !== "" &&
        end["result"] === "approved" &&
        typeof poConfirmation === "string" &&
        poConfirmation.trim() !== "");
}
/** `true` si existe una exención de QA válida y confirmada por el PO. */
export function hasValidQaWaiver(ticket) {
    if (ticket.blocks.QA.length % 2 !== 0)
        return false;
    return ticket.blocks.Cierre.some((entry) => {
        const reason = entry["qa_waiver_reason"];
        const confirmation = entry["po_confirmation"];
        return (entry["qa_status"] === "waived" &&
            typeof reason === "string" &&
            reason.trim() !== "" &&
            typeof confirmation === "string" &&
            confirmation.trim() !== "");
    });
}
// ── Coherencia ──────────────────────────────────────────────────────────────
/**
 * Coherencia entre los bloques: puntos, evidencia, retests y ciclos de QA.
 *
 * Es el control que detecta ediciones manuales inconsistentes: el CLI nunca
 * autocorrige, rechaza.
 */
export function validateHistoryCoherence(ticket) {
    const recorded = pointIdsRecordedInEvents(ticket.blocks.Eventos);
    const declared = ticket.blocks.Puntos.map((point) => String(point["id"]));
    const matches = recorded.length === declared.length &&
        recorded.every((id, index) => id === declared[index]);
    if (!matches) {
        fail("La lista de puntos no coincide con los eventos históricos de creación.");
    }
    // Evidencia agrupada por punto, en orden de aparición.
    const evidenceByPoint = new Map();
    for (const entry of ticket.blocks.Evidencia) {
        const pointId = entry["point_id"];
        if (typeof pointId !== "string")
            continue;
        const list = evidenceByPoint.get(pointId) ?? [];
        list.push(String(entry["id"]));
        evidenceByPoint.set(pointId, list);
    }
    const retestsByPoint = new Map();
    for (const entry of ticket.blocks.Retests) {
        const key = String(entry["point_id"]);
        const list = retestsByPoint.get(key) ?? [];
        list.push(entry);
        retestsByPoint.set(key, list);
    }
    const qaStartIds = new Set(ticket.blocks.QA.filter((entry) => entry["result"] === "pending").map((entry) => String(entry["id"])));
    for (const point of ticket.blocks.Puntos) {
        const pointId = String(point["id"]);
        const declaredEvidence = point["evidence"];
        requireList(declaredEvidence, `${pointId}.evidence`);
        const actualEvidence = evidenceByPoint.get(pointId) ?? [];
        const evidenceMatches = declaredEvidence.length === actualEvidence.length &&
            declaredEvidence.every((id, index) => id === actualEvidence[index]);
        if (!evidenceMatches) {
            fail(`${pointId}.evidence no coincide con el historial de Evidencia.`);
        }
        const qaCycles = point["qa_cycles"];
        const uniqueCycles = new Set(qaCycles.map((cycle) => String(cycle)));
        if (uniqueCycles.size !== qaCycles.length) {
            fail(`${pointId}.qa_cycles no coincide con ciclos QA iniciados.`);
        }
        for (const cycle of uniqueCycles) {
            if (!qaStartIds.has(cycle)) {
                fail(`${pointId}.qa_cycles no coincide con ciclos QA iniciados.`);
            }
        }
        const pointRetests = retestsByPoint.get(pointId) ?? [];
        if (pointRetests.length > 0 && qaCycles.length === 0) {
            fail(`${pointId} tiene retests sin un ciclo QA relacionado.`);
        }
        const status = String(point["status"]);
        if (status === "verified" || status === "closed") {
            const last = pointRetests[pointRetests.length - 1];
            const confirmed = last !== undefined &&
                last["result"] === "approved" &&
                typeof last["po_confirmation"] === "string" &&
                last["po_confirmation"].trim() !== "";
            if (!confirmed) {
                fail(`${pointId} requiere un retest aprobado y confirmado antes de verificarse.`);
            }
        }
    }
}
/**
 * Coherencia entre `qa_status` del frontmatter y el último ciclo del historial.
 *
 * Tabla resultante: QA vacío ⇒ `pending` · último `pending` ⇒ `in_qa` · último
 * `approved` ⇒ `approved` · último `changes_requested` o `failed` ⇒ `pending`.
 */
export function validateQaStateCoherence(ticket) {
    const qaStatus = ticket.fields.qa_status;
    if (qaStatus === "waived") {
        if (!hasValidQaWaiver(ticket)) {
            fail("qa_status waived requiere motivo y confirmación explícita del PO.");
        }
        return;
    }
    let expected = "pending";
    const qa = ticket.blocks.QA;
    if (qa.length > 0) {
        const lastResult = qa[qa.length - 1]["result"];
        if (lastResult === "pending")
            expected = "in_qa";
        else if (lastResult === "approved")
            expected = "approved";
    }
    if (qaStatus !== expected) {
        fail("qa_status no coincide con el último ciclo del historial QA.");
    }
}
// ── Validación del documento ────────────────────────────────────────────────
/**
 * Valida un ticket completo en el orden exacto del contrato.
 *
 * El orden importa: R1–R22 (frontmatter y release) siempre preceden a las
 * reglas de workflow, y la validación de bloques precede a la coherencia.
 */
export function validateDocument(ticket, context = {}) {
    const { fields } = ticket;
    // R1 — versión de esquema.
    if (fields.schema_version !== "2" && fields.schema_version !== "1") {
        fail("schema_version debe ser el entero literal 1 o 2.");
    }
    // R2 — forma del id.
    const idMatch = ID_RE.exec(fields.id);
    if (idMatch === null) {
        fail("El ID no cumple <TIPO>-<MODULO>-<DESCRIPCION>-<YYYYMMDD> con segmentos seguros.");
    }
    const [, idType, idModule, , compactDate] = idMatch;
    validateIsoDate(`${compactDate.slice(0, 4)}-${compactDate.slice(4, 6)}-${compactDate.slice(6, 8)}`, "La fecha incluida en el ID");
    // R3 — el id esperado por el llamador.
    if (context.expectedId !== undefined && fields.id !== context.expectedId) {
        fail("El ID del frontmatter no coincide con el ticket solicitado.");
    }
    // R5 — tipo coherente con el prefijo del id.
    if (fields.type !== idType ||
        !TICKET_TYPES.includes(fields.type)) {
        fail("type no coincide con el prefijo del ID.");
    }
    // R6 — módulo coherente con el segmento del id.
    if (fields.module !== idModule || !/^[A-Z0-9]+$/.test(fields.module)) {
        fail("module no coincide con el segmento del ID.");
    }
    // R7 — título.
    validateTitle(fields.title);
    // R8 — el módulo debe ser escalar plain seguro.
    if (!isSafePlainScalar(fields.module)) {
        fail("module debe ser un escalar plain seguro de una sola línea.");
    }
    // R9–R11 — estados.
    if (!WORKFLOW_STATES.includes(fields.workflow_status)) {
        fail("workflow_status no pertenece al esquema.");
    }
    if (!QA_STATES.includes(fields.qa_status)) {
        fail("qa_status no pertenece al esquema.");
    }
    if (!RELEASE_STATES.includes(fields.release_status)) {
        fail("release_status no pertenece al esquema.");
    }
    // R12 — booleanos literales.
    for (const key of [
        "user_visible",
        "sync_impact",
        "migration_impact",
        "docker_impact",
    ]) {
        if (fields[key] !== "true" && fields[key] !== "false") {
            fail(`${key} debe ser true o false literal.`);
        }
    }
    // R13 — riesgo.
    if (!RISK_LEVELS.includes(fields.risk_level)) {
        fail("risk_level no pertenece al esquema.");
    }
    // R14 — fechas. No existe regla que compare `created` con `updated`.
    validateIsoDate(fields.created, "created");
    validateIsoDate(fields.updated, "updated");
    // R15 — ticket relacionado.
    if (fields.related_ticket !== "null") {
        if (fields.related_ticket === fields.id) {
            fail("related_ticket no puede referenciar el mismo ticket.");
        }
        if (context.ticketExists !== undefined &&
            !context.ticketExists(fields.related_ticket)) {
            fail("related_ticket debe referenciar un ticket canónico existente.");
        }
    }
    // R16 — versiones.
    for (const key of ["target_release", "released_in"]) {
        const value = fields[key];
        if (value !== "null" && !SEMVER_RE.test(value)) {
            fail(`${key} debe ser null o SemVer sin prefijo v.`);
        }
    }
    // R17–R22 — coherencia del estado de release.
    const { release_status: release, target_release: target, released_in: released, } = fields;
    if (release === "planned" && (target === "null" || released !== "null")) {
        fail("release planned requiere target_release y no admite released_in.");
    }
    if (release === "released" && (target === "null" || released === "null")) {
        fail("release released requiere target_release y released_in.");
    }
    if (release === "released" && target !== released) {
        fail("released_in debe coincidir con target_release.");
    }
    if (release === "not_applicable" &&
        (target !== "null" || released !== "null")) {
        fail("release not_applicable exige versiones null.");
    }
    if (release === "unreleased" && released !== "null") {
        fail("release unreleased no admite released_in.");
    }
    if (release === "unreleased" && target !== "null") {
        fail("release unreleased exige target_release null.");
    }
    // R23 — el workflow exige los artefactos que promete.
    const workflow = fields.workflow_status;
    const plannedOrLater = PLANNED_OR_LATER.includes(workflow);
    const approvedOrLater = APPROVED_OR_LATER.includes(workflow);
    if (plannedOrLater && !hasSubstantivePlan(ticket.sections.Plan)) {
        fail("El workflow requiere un plan real, no placeholders vacíos.");
    }
    if (approvedOrLater && !hasPlanGate(ticket)) {
        fail("El workflow requiere aprobación explícita o razón de gate no exigible.");
    }
    if (approvedOrLater && !hasStructuredPlan(ticket.sections.Plan)) {
        fail("El workflow requiere un plan proporcional estructurado con pasos reales.");
    }
    if (QA_REQUIRED_STATES.includes(workflow) &&
        !hasRecordedUserTestOutcome(ticket)) {
        fail("El workflow QA requiere resultado del PO u omisión explícita documentada en Pruebas.");
    }
    // R24 — bloques estructurados, en orden. Los errores de Puntos enmascaran
    // los de las secciones posteriores.
    const points = ticket.blocks.Puntos;
    const pointIds = new Set(points.map((point) => String(point["id"])));
    validatePoints(points);
    validateQa(ticket.blocks.QA);
    validateEvidence(ticket.blocks.Evidencia, pointIds);
    validateRetests(ticket.blocks.Retests, pointIds);
    validateClosures(ticket.blocks.Cierre);
    validateAiUsage(ticket.blocks["Consumo de IA"]);
    validateEvents(ticket.blocks.Eventos);
    validateHistoryCoherence(ticket);
    validateQaStateCoherence(ticket);
    // R25 — coherencia de QA en los estados finales.
    if (workflow === "qa_approved" || workflow === "closed") {
        if (fields.qa_status !== "approved" && fields.qa_status !== "waived") {
            fail("qa_approved y closed requieren QA aprobada o eximida.");
        }
        if (fields.qa_status === "approved" &&
            !hasApprovedQaCycle(ticket.blocks.QA)) {
            fail("QA aprobada requiere un ciclo QA cerrado y confirmación explícita del PO.");
        }
        if (fields.qa_status === "waived" && !hasValidQaWaiver(ticket)) {
            fail("QA eximida requiere motivo y confirmación explícita del PO.");
        }
        const blocking = points.filter((point) => BLOCKING_POINT_STATES.includes(String(point["status"])));
        if (blocking.length > 0) {
            fail("Hay puntos bloqueantes y el ticket no puede aprobar QA.");
        }
    }
    // R26 — el cierre debe ser coherente con `qa_status`.
    if (workflow === "closed") {
        const coherent = ticket.blocks.Cierre.some((entry) => entry["qa_status"] === fields.qa_status);
        if (!coherent) {
            fail("closed requiere un intento de cierre coherente con qa_status.");
        }
    }
}
export { nextPointId, pointIdsRecordedInEvents, MAX_POINTS, EXIT_SCHEMA };
//# sourceMappingURL=validate.js.map