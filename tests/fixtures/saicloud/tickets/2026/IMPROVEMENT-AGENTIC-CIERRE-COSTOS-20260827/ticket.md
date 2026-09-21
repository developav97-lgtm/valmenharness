---
schema_version: 1
id: IMPROVEMENT-AGENTIC-CIERRE-COSTOS-20260827
title: Mejorar cierre automático y trazabilidad de consumo
type: IMPROVEMENT
module: AGENTIC
workflow_status: closed
qa_status: approved
release_status: released
user_visible: false
sync_impact: false
migration_impact: false
docker_impact: false
risk_level: normal
created: 2026-08-27
updated: 2026-09-07
related_ticket: null
target_release: 6.2.4
released_in: 6.2.4
---

# IMPROVEMENT-AGENTIC-CIERRE-COSTOS-20260827

## Solicitud original

Registrar consumo estimado de IA por ticket y, al solicitar el cierre después de pruebas aprobadas, aislar exclusivamente los archivos del ticket, crear sus commits en español y hacer push a dev sin tocar cambios ajenos. Los cambios ajenos no bloquean el cierre; solo se solicita decisión si no es posible determinar con evidencia qué archivos pertenecen al ticket. Definir además el uso de /compact para reutilizar un chat sin iniciar uno nuevo.

## Descripción funcional

- Alcance: trazabilidad estimada de consumo por ticket y entrega Git al cerrar
  un ticket ya probado; no cambia producto, despliegue ni release.
- Usuario o rol afectado: PO y equipo de desarrollo que revisan coste, cierre
  y publicación de tickets en `dev`.
- Comportamiento actual: el cierre funcional documenta QA, pero no conserva un
  consumo atribuible de IA ni convierte por defecto la orden de cierre en una
  entrega Git. La presencia de cambios de otros trabajos puede interrumpir el
  flujo aunque se conozcan los archivos del ticket.
- Comportamiento esperado: el ticket conserva consumo declarado o estimado con
  fuente y nivel de confianza; tras pruebas confirmadas, `cerrar ticket` aísla
  sus archivos, crea commits en español y hace push a `dev`, sin tocar ni
  bloquearse por cambios ajenos conocidos.

## Diagnóstico

- Archivos y flujo investigados: `AGENTS.md`, `PHASE-MAP.md`, la regla de
  entrega, el esquema/plantilla/CLI de tickets y las skills de orquestación,
  cierre y revisión.
- Causa raíz o hipótesis: el contrato vigente separa explícitamente cierre de
  commit/push y el formato de ticket no tiene una sección estructurada de
  consumo. La aplicación Codex puede compactar contexto, pero no ofrece al
  flujo local una medición automática y fiable de coste por ticket.
- Riesgos y compatibilidad: nunca inventar tokens o coste; diferenciar dato
  reportado de estimación. El cierre automático no puede mezclar cambios ni
  convertir una orden de cierre en release, tag o despliegue. Si la pertenencia
  de un archivo no es demostrable, se conserva sin tocar y se solicita decisión.
- Impactos de sync, migración, Docker o despliegue: ninguno. Solo reglas,
  documentación y herramientas locales de trazabilidad.

## Plan

- Gate de plan: aprobado explícitamente por el PO el 2026-08-27 para el
  alcance completo de este ticket, incluida la preservación de cambios ajenos.
- Pasos ordenados:
  1. Extender el esquema, plantilla y `ticket.py` con una sección JSON
     append-only `Consumo de IA` y un subcomando determinista para registrar
     consumo. Cada entrada conserva sesión, modelo, esfuerzo, tokens conocidos,
     coste estimado, fuente, fecha y confianza; los valores no disponibles se
     registran como `null`, nunca como cero o dato inventado.
  2. Actualizar `AGENTS.md`, `PHASE-MAP.md` y la regla de entrega: una orden
     explícita de cierre, recibida después de pruebas confirmadas, autoriza
     commit y push a `dev` para ese ticket. Release, PR, tag y despliegue siguen
     requiriendo sus propios gates.
  3. Definir el aislamiento de cambios: revisar `git status` y el diff,
     comprobar los archivos contra la implementación y el ticket, y preparar
     exclusivamente rutas verificadas con `git add -- <rutas>`. Los cambios
     ajenos conocidos se preservan y no bloquean; solo se pide decisión si una
     ruta no puede atribuirse con evidencia suficiente.
  4. Implementar cierre trazable en dos commits selectivos: primero el cambio
     funcional; después el cierre/index con la referencia SHA del primero, y
     finalmente push de ambos a `origin/dev`. Todo mensaje de commit se redacta
     en español. Sin pruebas confirmadas, el ticket sigue en
     `awaiting_user_tests`.
  5. Ajustar las skills de orquestación, revisión y reporte para aplicar la
     misma regla y documentar `/compact` como compactación de contexto, no como
     borrado ni sustituto del ticket canónico.
  6. Agregar y ejecutar pruebas del CLI para el nuevo bloque, validación de
     `null`, campos estimados y regresión de tickets existentes; entregar al PO
     comandos y una comprobación manual de aislamiento con cambios ajenos.
- Rollback, backup, canario u orden de despliegue cuando aplique: revertir el
  commit de reglas/herramienta si el flujo selecciona rutas erróneas; no hay
  infraestructura ni despliegue involucrados.

## Criterios de aceptación

- [ ] El ticket admite registros append-only de consumo con fuente y confianza,
  y rechaza datos estructuralmente inválidos sin alterar tickets existentes.
- [ ] Un dato no disponible se conserva como desconocido y ningún informe lo
  presenta como coste exacto.
- [ ] Tras pruebas confirmadas, la orden explícita de cierre prepara y publica
  solo archivos atribuibles al ticket, preservando cambios ajenos conocidos.
- [ ] Si la atribución de un archivo es ambigua, se solicita decisión sin añadir,
  modificar ni descartar ese archivo.
- [ ] El cierre registra el SHA funcional, actualiza el índice y usa mensajes
  de commit en español; no crea release, tag, PR ni despliegue.
- [ ] `/compact` se documenta como mecanismo de compactación del chat; el
  ticket canónico mantiene la continuidad entre casos.

## Puntos

<!-- Crear POINT-NNN es append-only: no eliminar, reordenar ni reutilizar. Las transiciones solo las realiza el CLI, actualizan el punto actual y anexan un ticket-event. -->

```json
[]
```

## Implementación

- Archivos cambiados: `AGENTS.md`, `docs/agentic/PHASE-MAP.md`,
  `docs/agentic/rules/delivery.md`, esquema/plantilla/README de tickets,
  `tools/agentic/ticket.py`, sus pruebas y las skills de orquestación,
  revisión y cierre.
- Decisiones técnicas: `add-ai-usage` agrega entradas append-only
  `CONSUMO-NNN`; tokens y coste se conservan como `null` si no son reportados.
  La orden explícita de cierre posterior a pruebas/QA aísla rutas verificadas,
  crea primero el commit funcional y después el documental con SHA e índice,
  y publica ambos en `dev`. Los cambios ajenos conocidos se preservan; solo la
  atribución ambigua exige decisión del PO.
- Compatibilidad preservada: se añadieron bloques vacíos de consumo a los
  tickets existentes sin modificar su historial; no se toca producto, Docker,
  AWS, secretos, `ALLOWED_HOSTS`, PR, tag ni despliegue.
- Commits atribuibles al ticket:
  - `1ae92949692e62d56553e6dc658d525fc518121a` — implementación del registro de consumo y cierre selectivo.
  - `6b89bde08c8298dbc341708492781639f7bf1b8b` — documentación y cierre canónico del ticket.

## Pruebas

- Comandos para el PO:
  `python3 -m unittest discover -s tools/agentic/tests`,
  `python3 tools/agentic/ticket.py validate --all`,
  `python3 tools/agentic/ticket.py index --check`,
  `python3 -m json.tool .codex/hooks.json >/dev/null` y `git diff --check`.
- Directorio de ejecución: raíz del repositorio.
- Resultado esperado: registros de consumo válidos y tickets históricos sin
  cambios semánticos; en la prueba manual, rutas ajenas visibles en `git status`
  permanecen sin staging ni commit.
- Validaciones manuales: cerrar un ticket probado con un archivo ajeno sin
  seguimiento y verificar que solo los archivos del ticket aparecen en cada
  commit y push.
- Requisitos de ambiente o datos: repositorio Git local con cambios de ejemplo
  no sensibles; no se requieren credenciales ni acceso a AWS.
- Resultado comunicado por el PO: el 2026-08-27 el PO confirmó que todos los
  comandos entregados pasaron en su entorno remoto.

## QA

```json
[
  {
    "id": "QA-001",
    "date": "2026-08-27",
    "build_reference": "worktree:sha256:65af3bd5b95f384c39b180a0e0f2fc497c0047f85b0f9c12f64d9279c468850f",
    "environment": "PO remoto",
    "result": "pending",
    "findings": [],
    "correction": null,
    "po_confirmation": null
  },
  {
    "id": "QA-002",
    "date": "2026-08-27",
    "build_reference": null,
    "environment": null,
    "result": "approved",
    "findings": [],
    "correction": null,
    "po_confirmation": "El PO confirmó el 2026-08-27 que todos los comandos de prueba pasaron."
  }
]
```

## Evidencia

```json
[]
```

## Retests

```json
[]
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
    "date": "2026-08-27",
    "technical_summary": "El commit 1ae92949692e62d56553e6dc658d525fc518121a agrega el registro append-only de consumo, el comando add-ai-usage y el cierre Git selectivo con preservación de cambios ajenos.",
    "functional_summary": "El PO puede revisar consumo declarado o estimado por ticket y cerrar un ticket probado para publicar únicamente sus archivos en dev, sin afectar otros trabajos locales.",
    "qa_status": "approved",
    "qa_waiver_reason": null,
    "po_confirmation": "El PO confirmó el 2026-08-27 que todos los comandos de prueba pasaron y ordenó cerrar el ticket.",
    "release_impact": "Cambio cerrado y publicado en dev por commits selectivos; permanece unreleased hasta una promoción formal a producción."
  }
]
```

## Consumo de IA

```json
[
  {
    "kind": "ai-usage",
    "date": "2026-08-27",
    "session_reference": null,
    "model": null,
    "reasoning_effort": null,
    "notes": "Registro transparente de disponibilidad; no representa una estimación de costo.",
    "input_tokens": null,
    "output_tokens": null,
    "total_tokens": null,
    "estimated_cost_usd": null,
    "source": "La sesión de Codex no expone un agregado fiable de tokens ni costo por ticket.",
    "confidence": "low",
    "id": "CONSUMO-001"
  }
]
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
    "date": "2026-08-27",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-08-27",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-08-27",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-08-27",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-08-27",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-08-27",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-08-27",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-08-27",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-08-27",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-08-27",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-08-27",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-08-27",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-08-27",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-014",
    "date": "2026-09-07",
    "action": "release-transition",
    "actor": "cli",
    "details": "Release: unreleased -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-015",
    "date": "2026-09-07",
    "action": "release-transition",
    "actor": "cli",
    "details": "Release: planned -> released."
  }
]
```
