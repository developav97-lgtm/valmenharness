/**
 * La plantilla canónica de un ticket.
 *
 * Un ticket nuevo no se inventa: se copia de una plantilla que ya tiene la forma
 * del contrato —los 18 campos, las 15 secciones en orden, los 7 bloques— y se
 * rellenan los huecos. Eso es lo que garantiza que `create` no pueda producir
 * algo inválido.
 *
 * **La plantilla es del harness, y el proyecto la puede adaptar.** El texto de
 * cada sección es prosa del proyecto, no del contrato: qué se espera que diga
 * «Diagnóstico» depende de cómo trabaja cada equipo. Por eso el harness trae una
 * plantilla por defecto y `valmen adopt` la copia a `.valmen/templates/ticket.md`
 * para que se pueda editar sin tocar el harness. La **estructura** —qué
 * secciones, en qué orden, con qué bloques— no es negociable, y el validador la
 * exige igual.
 *
 * Dos marcadores tienen que estar en cualquier plantilla que se use:
 *
 * - `# TYPE-MODULE-DESCRIPTION-YYYYMMDD` → se reemplaza por `# <ID>`.
 * - `<!-- Preservar literalmente la solicitud del PO. -->` → se reemplaza por la
 *   solicitud, que se conserva **literal**, con sus saltos de línea.
 *
 * Si falta el segundo, `create` falla en vez de escribir un ticket sin la
 * solicitud: un ticket sin el pedido original no se puede auditar.
 */
/** Marcador del encabezado, que se sustituye por el identificador. */
export declare const TEMPLATE_TITLE_MARKER = "# TYPE-MODULE-DESCRIPTION-YYYYMMDD";
/** Marcador de la solicitud, que se sustituye por el texto literal del PO. */
export declare const TEMPLATE_REQUEST_MARKER = "<!-- Preservar literalmente la solicitud del PO. -->";
/**
 * La plantilla por defecto.
 *
 * Se escribe con los valores del esquema 2 —`schema_version: 2`— porque es lo
 * que el harness escribe hoy. Un proyecto con tickets del esquema 1 los sigue
 * leyendo: el validador acepta los dos.
 */
export declare const TICKET_TEMPLATE = "---\nschema_version: 2\nid: TYPE-MODULE-DESCRIPTION-YYYYMMDD\ntitle: T\u00EDtulo corto y descriptivo\ntype: BUGFIX\nmodule: MODULO\nworkflow_status: intake\nqa_status: pending\nrelease_status: unreleased\nuser_visible: false\nsync_impact: false\nmigration_impact: false\ndocker_impact: false\nrisk_level: normal\ncreated: YYYY-MM-DD\nupdated: YYYY-MM-DD\nrelated_ticket: null\ntarget_release: null\nreleased_in: null\n---\n\n# TYPE-MODULE-DESCRIPTION-YYYYMMDD\n\n## Solicitud original\n\n<!-- Preservar literalmente la solicitud del PO. -->\n\n## Descripci\u00F3n funcional\n\n- Alcance:\n- Usuario o rol afectado:\n- Comportamiento actual:\n- Comportamiento esperado:\n\n## Diagn\u00F3stico\n\n- Archivos y flujo investigados:\n- Causa ra\u00EDz o hip\u00F3tesis:\n- Riesgos y compatibilidad:\n- Impactos de sync, migraci\u00F3n, Docker o despliegue:\n\n## Plan\n\n- Gate de plan y aprobaci\u00F3n:\n- Pasos ordenados:\n  1.\n  2.\n- Rollback:\n\n## Criterios de aceptaci\u00F3n\n\n- [ ]\n\n## Puntos\n\n```json\n[]\n```\n\n## Implementaci\u00F3n\n\nPendiente.\n\n## Pruebas\n\nPendiente de ejecuci\u00F3n.\n\n## QA\n\n```json\n[]\n```\n\n## Evidencia\n\n```json\n[]\n```\n\n## Retests\n\n```json\n[]\n```\n\n## Cierre\n\n```json\n[]\n```\n\n## Consumo de IA\n\n```json\n[]\n```\n\n## Release\n\nSin publicar todav\u00EDa.\n\n## Eventos\n\n```json\n[]\n```\n";
//# sourceMappingURL=template.d.ts.map