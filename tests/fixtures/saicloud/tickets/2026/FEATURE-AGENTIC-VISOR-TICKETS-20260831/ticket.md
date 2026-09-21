---
schema_version: 1
id: FEATURE-AGENTIC-VISOR-TICKETS-20260831
title: Crear visor local de tickets y reportes Markdown
type: FEATURE
module: AGENTIC
workflow_status: closed
qa_status: approved
release_status: released
user_visible: false
sync_impact: false
migration_impact: false
docker_impact: false
risk_level: normal
created: 2026-08-31
updated: 2026-09-07
related_ticket: null
target_release: 6.2.4
released_in: 6.2.4
---

# FEATURE-AGENTIC-VISOR-TICKETS-20260831

## Solicitud original

Crear un visor local y de solo lectura para consultar tickets canónicos de SaiOpenCloud con filtros por fecha, tipo y búsqueda; debe permitir verlos de manera cómoda y exportar un reporte Markdown funcional de los tickets cerrados en un rango. La gestión de tickets sigue exclusivamente en Codex. La primera versión se abre rápidamente con doble clic, escucha solo en 127.0.0.1, no requiere internet ni dependencias externas, y no modifica tickets.

## Descripción funcional

- Alcance: visor local, de solo lectura y sin dependencias externas para
  consultar tickets cerrados, filtrarlos y exportar reportes Markdown.
- Usuario o rol afectado: PO y equipo interno de ValMenTech que consultan la
  trazabilidad de entregas.
- Comportamiento actual: los tickets se abren como Markdown en el editor o se
  consultan en Codex, lo que dificulta buscar y compartir reportes funcionales
  por fecha.
- Comportamiento esperado: una herramienta local iniciada con doble clic abre
  una vista cómoda, permite filtrar y descarga un reporte Markdown sin alterar
  ningún ticket.

## Diagnóstico

- Archivos y flujo investigados: tickets canónicos bajo `docs/tickets/`,
  `ticket-schema.md`, `tools/agentic/ticket.py` y el flujo de cierre. El diseño
  detallado está en
  [`2026-08-31-visor-local-tickets-design.md`](../../../agentic/2026-08-31-visor-local-tickets-design.md).
- Causa raíz o hipótesis: el registro actual es durable y estructurado, pero no
  existe una presentación local orientada a consulta y reporte funcional.
- Riesgos y compatibilidad: los cierres históricos pueden carecer de resumen
  funcional completo; el visor debe señalarlo sin inventar contenido. El
  proceso debe ser solo lectura y limitado a loopback.
- Impactos de sync, migración, Docker o despliegue: ninguno. No cambia producto,
  datos, tenants, Docker, AWS ni despliegues.

## Plan

- Plan detallado:
  [`2026-08-31-visor-local-tickets.md`](../../../agentic/plans/2026-08-31-visor-local-tickets.md).
- Gate de plan: aprobado explícitamente por el PO el 2026-08-31 para el visor
  local de solo lectura, filtros y reporte Markdown descritos en el diseño y
  este plan.
- Ampliación aprobada explícitamente por el PO el 2026-08-31: detalle completo
  organizado de cada ticket y aplicación macOS arrastrable al Dock. Los pasos
  y pruebas adicionales se incorporan al plan vigente.
- Ampliación visual aprobada explícitamente por el PO el 2026-08-31: el detalle
  se presenta como página interna completa con regreso al listado y una
  plantilla visual para todas las secciones canónicas, sin JSON crudo.
- Pasos ordenados: lector seguro, filtros y reporte Markdown, servidor/UI
  loopback, launcher macOS y entrega de pruebas; el plan detallado fija las
  interfaces, archivos, pruebas y límites de cada tarea.
- Rollback: revertir el commit del visor o dejar de ejecutar el launcher. No
  requiere backup, migración, canario ni operación sobre producción.

## Criterios de aceptación

- [ ] El visor se inicia localmente con doble clic y escucha solo en
  `127.0.0.1`.
- [ ] Permite filtrar tickets cerrados por fecha, tipo y texto, tomando la
  fecha del último cierre.
- [ ] Muestra problema y solución de forma legible sin exponer JSON, estados o
  eventos por defecto.
- [ ] Exporta un reporte Markdown funcional, sin campos técnicos o estados.
- [ ] No altera tickets, índice, Git, datos del producto ni servicios remotos.
- [ ] Cada resultado permite consultar en el visor toda la información de su
  ticket, organizada por secciones y sin habilitar modificaciones.
- [ ] La aplicación macOS del repositorio puede arrastrarse al Dock y abre el
  mismo visor local sin instalar dependencias ni ejecutar Git.
- [ ] El detalle se abre en una página interna completa, permite regresar al
  listado conservando los filtros y presenta secciones, criterios, pruebas y
  registros históricos mediante componentes visuales legibles.

## Puntos

<!-- Crear POINT-NNN es append-only: no eliminar, reordenar ni reutilizar. Las transiciones solo las realiza el CLI, actualizan el punto actual y anexan un ticket-event. -->

```json
[
  {
    "id": "POINT-001",
    "title": "Conservar fechas de filtro en zona local",
    "status": "verified",
    "severity": "normal",
    "actual": "La interfaz deriva fechas con UTC y puede desplazar el rango un día.",
    "expected": "Hoy, ayer y rangos iniciales usan la fecha local del navegador.",
    "evidence": [],
    "affected_files": [],
    "diagnosis": null,
    "solution": null,
    "tests": [],
    "qa_cycles": [
      "QA-003"
    ],
    "terminal_reason": null,
    "related_ticket": null
  },
  {
    "id": "POINT-002",
    "title": "Incluir accesos rápidos de fecha",
    "status": "verified",
    "severity": "normal",
    "actual": "Solo se ofrece un rango manual de 30 días.",
    "expected": "La interfaz ofrece Hoy, Ayer, Esta semana y Sábado a hoy.",
    "evidence": [],
    "affected_files": [],
    "diagnosis": null,
    "solution": null,
    "tests": [],
    "qa_cycles": [
      "QA-003"
    ],
    "terminal_reason": null,
    "related_ticket": null
  },
  {
    "id": "POINT-003",
    "title": "Mostrar límite de solo lectura",
    "status": "verified",
    "severity": "low",
    "actual": "La interfaz no comunica que la gestión ocurre en Codex.",
    "expected": "El encabezado muestra el aviso de solo lectura y gestión en Codex.",
    "evidence": [],
    "affected_files": [],
    "diagnosis": null,
    "solution": null,
    "tests": [],
    "qa_cycles": [
      "QA-003"
    ],
    "terminal_reason": null,
    "related_ticket": null
  },
  {
    "id": "POINT-004",
    "title": "Completar cobertura de contratos HTTP",
    "status": "verified",
    "severity": "normal",
    "actual": "Las pruebas HTTP no cubren reporte, entradas inválidas ni todos los métodos no permitidos.",
    "expected": "Las pruebas cubren Markdown, validación de fecha, allowlist y métodos no GET.",
    "evidence": [],
    "affected_files": [],
    "diagnosis": null,
    "solution": null,
    "tests": [],
    "qa_cycles": [
      "QA-003"
    ],
    "terminal_reason": null,
    "related_ticket": null
  },
  {
    "id": "POINT-005",
    "title": "Permitir consultar el ticket completo",
    "status": "verified",
    "severity": "normal",
    "actual": "El visor solo muestra el resumen funcional de cada ticket y no permite revisar su trazabilidad completa.",
    "expected": "Cada resultado permite abrir una vista de solo lectura con toda la información del ticket organizada por secciones.",
    "evidence": [],
    "affected_files": [],
    "diagnosis": null,
    "solution": null,
    "tests": [],
    "qa_cycles": [
      "QA-003"
    ],
    "terminal_reason": null,
    "related_ticket": null
  },
  {
    "id": "POINT-006",
    "title": "Ofrecer acceso rápido desde el Dock de macOS",
    "status": "verified",
    "severity": "normal",
    "actual": "El lanzador actual exige navegar hasta la carpeta del repositorio en Finder antes de abrirlo.",
    "expected": "El repositorio incluye una aplicación macOS que pueda arrastrarse al Dock y abra el visor sin instalaciones ni acciones Git.",
    "evidence": [],
    "affected_files": [],
    "diagnosis": null,
    "solution": null,
    "tests": [],
    "qa_cycles": [
      "QA-003"
    ],
    "terminal_reason": null,
    "related_ticket": null
  },
  {
    "id": "POINT-007",
    "title": "Presentar el detalle completo con una plantilla visual",
    "status": "verified",
    "severity": "normal",
    "actual": "El detalle se inserta debajo del listado y muestra secciones y registros históricos como Markdown o JSON plano.",
    "expected": "El detalle abre como página interna completa, permite volver al listado y presenta cada sección canónica con componentes visuales legibles.",
    "evidence": [],
    "affected_files": [],
    "diagnosis": null,
    "solution": null,
    "tests": [],
    "qa_cycles": [
      "QA-003"
    ],
    "terminal_reason": null,
    "related_ticket": null
  }
]
```

## Implementación

- Archivos cambiados:
  - `tools/agentic/ticket_viewer.py`: lector de tickets cerrados, filtros,
    reporte Markdown y servidor HTTP de solo lectura limitado a
    `127.0.0.1`.
  - `tools/agentic/ticket_viewer_static/`: interfaz local para consulta,
    filtros rápidos, búsqueda y descarga del reporte.
  - `tools/agentic/Abrir gestor de tickets.command`: lanzador ejecutable para
    macOS que abre el visor con doble clic.
  - `tools/agentic/tests/test_ticket_viewer.py`: cobertura del lector,
    filtros, reporte, contratos HTTP, CLI y lanzador.
  - `docs/agentic/MANUAL-FLUJO-TRABAJO-CODEX.md`: uso del visor dentro del
    flujo de tickets.
  - Pendiente para `POINT-005` y `POINT-006`: endpoint y vista de detalle,
    aplicación macOS para el Dock, pruebas y manual.
- Decisiones técnicas:
  - Se usa exclusivamente la biblioteca estándar de Python y archivos
    estáticos propios: no requiere internet, dependencias ni servicio externo.
  - El servidor solo acepta `GET`, sirve una allowlist de recursos estáticos y
    devuelve `405` para métodos no permitidos.
  - El reporte toma el diagnóstico y el resumen funcional del cierre para
    evitar mostrar estados, JSON de auditoría u otros detalles técnicos.
  - Las fechas rápidas se calculan en la zona local del navegador, no en UTC.
- Compatibilidad preservada:
  - No se escriben tickets, índice, Git, base de datos ni servicios remotos.
  - No se cambian producto, tenants, sincronización, Docker, AWS ni el flujo
    de gestión en Codex.
- Commits atribuibles al ticket:
  - `0f552a7487c8b4bdab560146e901a8ae23a20ded` — agrega el visor local,
    detalle visual, reportes y accesos de macOS.
  - Pendiente: commit documental de cierre y trazabilidad.

## Pruebas

- Comandos para el PO:
  - `python3 -m unittest tools.agentic.tests.test_ticket_viewer -v`
  - `python3 tools/agentic/ticket.py validate --all`
  - `python3 tools/agentic/ticket.py index --check`
  - `git diff --check`
- Directorio de ejecución: raíz del repositorio `SaiOpenCloud`.
- Resultado esperado:
  - La suite del visor finaliza sin fallos; la validación de tickets e índice
    finalizan correctamente; `git diff --check` no emite salida.
- Validaciones manuales:
  - En Finder, abrir con doble clic `tools/agentic/Abrir gestor de tickets.command`.
  - Confirmar que el navegador abre `http://127.0.0.1:8765` y que el título
    indica que el visor es solo lectura y se gestiona en Codex.
  - Probar los accesos Hoy, Ayer, Esta semana y Sábado a hoy; aplicar tipo y
    búsqueda; abrir un ticket y verificar que se muestran “Se atendió” y “Se
    realizó”, sin JSON o estados internos.
  - Descargar el reporte y confirmar que contiene únicamente título,
    problema y solución funcional de los tickets del filtro.
  - Detener el visor cerrando la terminal o con `Ctrl+C`; no debe modificar
    archivos de tickets.
  - Pendiente para `POINT-005` y `POINT-006`: abrir el detalle completo desde
    un resultado y arrastrar la aplicación macOS al Dock antes de iniciarla.
- Requisitos de ambiente o datos: macOS con `python3`; tickets canónicos
  válidos bajo `docs/tickets/`.
- Resultado comunicado por el PO: el PO confirmó que el visor abre
  correctamente con doble clic en macOS y solicitó dos mejoras relacionadas:
  detalle completo organizado y acceso desde el Dock.
  Posteriormente, el PO probó el visor completo y confirmó que pasó.

## QA

```json
[
  {
    "id": "QA-001",
    "date": "2026-08-31",
    "build_reference": "worktree:sha256:8377858e080772eabcd0b1ff9f49a5e58882e20d48f376edb42b435dac4af6dc",
    "environment": "macOS local del PO",
    "result": "pending",
    "findings": [],
    "correction": null,
    "po_confirmation": null
  },
  {
    "id": "QA-002",
    "date": "2026-08-31",
    "build_reference": null,
    "environment": null,
    "result": "changes_requested",
    "findings": [],
    "correction": null,
    "po_confirmation": "El PO solicitó las mejoras POINT-005 y POINT-006 después de comprobar la apertura local."
  },
  {
    "id": "QA-003",
    "date": "2026-08-31",
    "build_reference": "worktree:sha256:5a30f7c1391b8af76c50707553803006b9b0d43115da4b9f8d63fa0821be8218",
    "environment": "macOS local del PO",
    "result": "pending",
    "findings": [],
    "correction": null,
    "po_confirmation": null
  },
  {
    "id": "QA-004",
    "date": "2026-08-31",
    "build_reference": null,
    "environment": null,
    "result": "approved",
    "findings": [],
    "correction": null,
    "po_confirmation": "El PO probó el visor completo y confirmó que pasó."
  }
]
```

## Evidencia

```json
[
  {
    "id": "EVIDENCE-001",
    "date": "2026-08-31",
    "kind": "manual",
    "description": "El PO confirmó la apertura correcta del visor con doble clic en macOS y solicitó detalle completo y acceso desde el Dock.",
    "reference": "worktree:sha256:8377858e080772eabcd0b1ff9f49a5e58882e20d48f376edb42b435dac4af6dc",
    "point_id": null
  }
]
```

## Retests

```json
[
  {
    "id": "RETEST-001",
    "date": "2026-08-31",
    "point_id": "POINT-001",
    "result": "approved",
    "evidence": [],
    "po_confirmation": "El PO probó el visor y confirmó que pasó."
  },
  {
    "id": "RETEST-002",
    "date": "2026-08-31",
    "point_id": "POINT-002",
    "result": "approved",
    "evidence": [],
    "po_confirmation": "El PO probó el visor y confirmó que pasó."
  },
  {
    "id": "RETEST-003",
    "date": "2026-08-31",
    "point_id": "POINT-003",
    "result": "approved",
    "evidence": [],
    "po_confirmation": "El PO probó el visor y confirmó que pasó."
  },
  {
    "id": "RETEST-004",
    "date": "2026-08-31",
    "point_id": "POINT-004",
    "result": "approved",
    "evidence": [],
    "po_confirmation": "El PO probó el visor y confirmó que pasó."
  },
  {
    "id": "RETEST-005",
    "date": "2026-08-31",
    "point_id": "POINT-005",
    "result": "approved",
    "evidence": [],
    "po_confirmation": "El PO probó el visor y confirmó que pasó."
  },
  {
    "id": "RETEST-006",
    "date": "2026-08-31",
    "point_id": "POINT-006",
    "result": "approved",
    "evidence": [],
    "po_confirmation": "El PO probó el visor y confirmó que pasó."
  },
  {
    "id": "RETEST-007",
    "date": "2026-08-31",
    "point_id": "POINT-007",
    "result": "approved",
    "evidence": [],
    "po_confirmation": "El PO probó el visor y confirmó que pasó."
  }
]
```

## Cierre

<!-- Bloque JSON append-only de objetos con `kind: "ticket-close"`; el esquema completo está en ticket-schema.md. -->

- Cierre técnico y funcional:
- Resultado comunicado por el PO:
- QA aprobada o eximida (motivo y confirmación explícita del PO si aplica):
- Riesgo residual e impacto de release:
- Texto visible al usuario cuando aplique:

```json
[
  {
    "kind": "ticket-close",
    "id": "CLOSE-001",
    "date": "2026-08-31",
    "technical_summary": "Se implementó un visor local de tickets de solo lectura, filtros, reportes Markdown, detalle visual completo y accesos rápidos para macOS.",
    "functional_summary": "Se habilitó la consulta cómoda de tickets cerrados, su detalle organizado y un acceso desde el Dock para el equipo interno.",
    "qa_status": "approved",
    "qa_waiver_reason": null,
    "po_confirmation": "El PO probó el visor completo y confirmó que pasó.",
    "release_impact": "El ticket continúa unreleased; es una herramienta interna local sin despliegue productivo."
  }
]
```

## Consumo de IA

<!-- Registros append-only `ai-usage`: consumo conocido o estimado con fuente y confianza. No inventar tokens ni coste; usar null cuando Codex no lo reporte. -->

```json
[]
```

## Release

- Estado de release:
- Versión objetivo:
- Versión publicada:
- Tickets relacionados:

## Eventos

<!-- Bloque JSON append-only final de objetos con `kind: "ticket-event"`; el CLI agrega uno por cada mutación propia. -->

```json
[
  {
    "kind": "ticket-event",
    "id": "EVENT-001",
    "date": "2026-08-31",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-08-31",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-08-31",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-08-31",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-08-31",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-08-31",
    "action": "point-added",
    "actor": "cli",
    "details": "Se agregó POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-08-31",
    "action": "point-added",
    "actor": "cli",
    "details": "Se agregó POINT-002."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-08-31",
    "action": "point-added",
    "actor": "cli",
    "details": "Se agregó POINT-003."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-08-31",
    "action": "point-added",
    "actor": "cli",
    "details": "Se agregó POINT-004."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-08-31",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-08-31",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-08-31",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-002: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-08-31",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-002: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-014",
    "date": "2026-08-31",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-003: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-015",
    "date": "2026-08-31",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-003: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-016",
    "date": "2026-08-31",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-004: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-017",
    "date": "2026-08-31",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-004: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-018",
    "date": "2026-08-31",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-019",
    "date": "2026-08-31",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-002: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-020",
    "date": "2026-08-31",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-003: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-021",
    "date": "2026-08-31",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-004: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-022",
    "date": "2026-08-31",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-023",
    "date": "2026-08-31",
    "action": "point-added",
    "actor": "cli",
    "details": "Se agregó POINT-005."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-024",
    "date": "2026-08-31",
    "action": "point-added",
    "actor": "cli",
    "details": "Se agregó POINT-006."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-025",
    "date": "2026-08-31",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-026",
    "date": "2026-08-31",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-027",
    "date": "2026-08-31",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-028",
    "date": "2026-08-31",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado changes_requested."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-029",
    "date": "2026-08-31",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> changes_requested."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-030",
    "date": "2026-08-31",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: changes_requested -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-031",
    "date": "2026-08-31",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-005: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-032",
    "date": "2026-08-31",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-006: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-033",
    "date": "2026-08-31",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-005: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-034",
    "date": "2026-08-31",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-005: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-035",
    "date": "2026-08-31",
    "action": "point-added",
    "actor": "cli",
    "details": "Se agregó POINT-007."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-036",
    "date": "2026-08-31",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-007: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-037",
    "date": "2026-08-31",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-006: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-038",
    "date": "2026-08-31",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-006: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-039",
    "date": "2026-08-31",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-007: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-040",
    "date": "2026-08-31",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-007: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-041",
    "date": "2026-08-31",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-042",
    "date": "2026-08-31",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-043",
    "date": "2026-08-31",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-003."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-044",
    "date": "2026-08-31",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-001 para POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-045",
    "date": "2026-08-31",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-002 para POINT-002."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-046",
    "date": "2026-08-31",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-003 para POINT-003."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-047",
    "date": "2026-08-31",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-004 para POINT-004."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-048",
    "date": "2026-08-31",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-005 para POINT-005."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-049",
    "date": "2026-08-31",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-006 para POINT-006."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-050",
    "date": "2026-08-31",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-007 para POINT-007."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-051",
    "date": "2026-08-31",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-004 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-052",
    "date": "2026-08-31",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-053",
    "date": "2026-08-31",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-054",
    "date": "2026-08-31",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-055",
    "date": "2026-09-07",
    "action": "release-transition",
    "actor": "cli",
    "details": "Release: unreleased -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-056",
    "date": "2026-09-07",
    "action": "release-transition",
    "actor": "cli",
    "details": "Release: planned -> released."
  }
]
```
