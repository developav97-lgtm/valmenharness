---
schema_version: 1
id: IMPROVEMENT-AGENTIC-PUBLICACION-PRUEBAS-20260828
title: Autorizar publicación selectiva para pruebas en dev
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
created: 2026-08-28
updated: 2026-09-17
related_ticket: null
target_release: 6.2.5
released_in: 6.2.5
---

# IMPROVEMENT-AGENTIC-PUBLICACION-PRUEBAS-20260828

## Solicitud original

Cuando termine la implementación de un ticket y el PO ordene explícitamente hacer commit y push para probar en la nube, Codex debe considerar esa frase una autorización suficiente para crear el commit selectivo y publicar únicamente ese ticket en dev, sin solicitar una confirmación adicional. La regla no autoriza PR, tag, despliegue productivo ni cierre del ticket; el resultado de la prueba funcional en la nube sigue siendo una confirmación posterior del PO.

## Descripción funcional

- Alcance: autorizar la publicación selectiva a `dev` para pruebas funcionales
  en nube cuando el PO la ordene explícitamente al terminar la implementación.
- Usuario o rol afectado: PO y equipo de desarrollo que validan tickets en el
  ambiente dev.
- Comportamiento actual: aunque el PO solicite commit y push para probar en la
  nube, Codex pide una confirmación adicional de las pruebas locales antes de
  publicar.
- Comportamiento esperado: frases inequívocas como “haz commit y push para
  probar en la nube”, “súbelo a dev para probar” o “haz el commit para probarlo
  en la nube” autorizan un único commit y push selectivos del ticket a `dev`,
  sin una segunda pregunta.

## Diagnóstico

- Archivos y flujo investigados: `AGENTS.md`, `docs/agentic/PHASE-MAP.md`,
  `docs/agentic/rules/delivery.md`, el manual operativo y la skill del
  orquestador concentran la autorización de Git y la transición a pruebas.
- Causa raíz o hipótesis: la regla vigente separa la solicitud de publicar de la
  confirmación de pruebas, aun cuando el PO ya realizó esas pruebas y formula
  la orden para habilitar la prueba funcional en nube.
- Riesgos y compatibilidad: una redacción demasiado amplia podría interpretar
  cualquier “haz commit” como permiso de push. La autorización se limita a una
  intención explícita de probar en nube/dev, al ticket activo y a rutas
  atribuibles; no sustituye QA ni los gates de release.
- Impactos de sync, migración, Docker o despliegue: no modifica código de
  producto, infraestructura, Docker, migraciones ni producción. El push a dev
  puede activar el despliegue continuo existente, por lo que se conserva la
  revisión de estado, diff y rutas antes de ejecutar Git.

## Plan

- Gate de plan: aprobado explícitamente por el PO el 2026-08-28 para el
  alcance completo de este ticket: publicar selectivamente a `dev` para
  pruebas funcionales sin una segunda confirmación, manteniendo los límites y
  controles descritos.
- Pasos ordenados:
  1. Actualizar `AGENTS.md`, `PHASE-MAP.md`, la regla de entrega y la skill del
     orquestador para reconocer la orden explícita de publicación para pruebas
     como confirmación suficiente de pruebas previas y autorización de commit y
     push selectivos a `dev`.
  2. Delimitar las expresiones aceptadas y las precondiciones: ticket
     identificado, implementación terminada, revisión de `git status` y diff,
     rutas atribuibles y mensajes de commit en español. Si hay una ruta
     ambigua, se pide decisión; si la orden solo dice “haz commit” sin aludir a
     nube/dev, no se infiere el push.
  3. Mantener la transición a `awaiting_user_tests` después de publicar para
     que el PO pruebe la funcionalidad desplegada. Documentar que la orden no
     autoriza cierre, QA aprobada, PR, tag ni despliegue productivo.
  4. Actualizar el manual para que el equipo use la frase corta y conozca los
     límites. Validar los documentos, el índice y el diff.
- Rollback, backup, canario u orden de despliegue cuando aplique: el rollback
  de un cambio en dev se gestiona mediante un commit posterior y selectivo; no
  se opera producción. El ticket publicado conserva su SHA y puede recibir una
  corrección antes de QA.

## Criterios de aceptación

- [ ] Una orden explícita de commit/push para probar en nube o dev no provoca
  una solicitud adicional de confirmación y publica solo las rutas del ticket
  en `dev`.
- [ ] Antes de publicar se conservan `git status`, diff, atribución de rutas,
  commit en español e identificación del SHA en el ticket.
- [ ] La publicación deja el ticket en `awaiting_user_tests` para la prueba
  funcional del PO; no lo cierra ni inicia QA por inferencia.
- [ ] La regla no habilita PR `dev` → `production`, tag ni despliegue de
  producción; dichos pasos siguen requiriendo sus gates explícitos.

## Puntos

<!-- Crear POINT-NNN es append-only: no eliminar, reordenar ni reutilizar. Las transiciones solo las realiza el CLI, actualizan el punto actual y anexan un ticket-event. -->

```json
[]
```

## Implementación

- Archivos cambiados: `AGENTS.md`, `docs/agentic/PHASE-MAP.md`,
  `docs/agentic/rules/delivery.md`, el manual operativo y la skill del
  orquestador.
- Decisiones técnicas: una intención explícita de publicar para probar en
  nube/dev tiene doble significado limitado: confirma las pruebas previas y
  autoriza un commit y push selectivos. “Haz commit” sin destino nube/dev no
  habilita push. El SHA se registra antes de entregar el ticket a pruebas
  funcionales en nube.
- Compatibilidad preservada: no cambia el control de rutas, mensajes en
  español, reglas de commits, QA, cierre, PR, tags ni producción. Las órdenes
  existentes de cierre mantienen su semántica independiente.
- Commits atribuibles al ticket:
  - `d6af00e3a8989059cd22b4a80520930267b5fd64` — autoriza la publicación selectiva en dev para pruebas del PO en la forma de trabajo agéntica.

## Pruebas

- Comandos para el PO: `python3 tools/agentic/ticket.py validate --all`,
  `python3 tools/agentic/ticket.py index --check` y `git diff --check`.
- Directorio de ejecución: raíz del repositorio.
- Resultado esperado: tickets e índice válidos, sin errores de whitespace y
  una regla inequívoca para publicar a dev con fines de prueba.
- Validaciones manuales: revisar el caso “haz commit y push para probar en la
  nube” y confirmar que no se interpreta como autorización de release o cierre.
- Requisitos de ambiente o datos: repositorio en `dev`; no requiere credenciales
  ni acceso a infraestructura durante la validación documental.
- Resultado comunicado por el PO: el 2026-09-16 confirmó que todos los puntos fueron validados satisfactoriamente y autorizó el cierre.

## QA

```json
[
  {
    "id": "QA-001",
    "date": "2026-09-16",
    "build_reference": "commit:9617b3789e105203d1f7d81fe7ec6632a38885ca",
    "environment": "dev validado por el PO",
    "result": "pending",
    "findings": [],
    "correction": null,
    "po_confirmation": null
  },
  {
    "id": "QA-002",
    "date": "2026-09-16",
    "build_reference": null,
    "environment": null,
    "result": "approved",
    "findings": [],
    "correction": null,
    "po_confirmation": "El PO confirma que todos los puntos de este ticket fueron validados satisfactoriamente y autoriza su cierre."
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
    "date": "2026-09-16",
    "technical_summary": "La implementación, pruebas y retests trazables permanecen registrados en este ticket; todos sus puntos quedaron cerrados.",
    "functional_summary": "El PO confirmó la validación satisfactoria de todos los puntos y autorizó el cierre.",
    "qa_status": "approved",
    "qa_waiver_reason": null,
    "po_confirmation": "El PO confirma que todos los puntos de este ticket fueron validados satisfactoriamente y autoriza su cierre.",
    "release_impact": "Cierre funcional sin publicación de release; permanece unreleased hasta su inclusión explícita en una versión."
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
    "date": "2026-08-28",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-08-28",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-08-28",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-08-28",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-08-28",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-08-28",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-09-16",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-09-16",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-09-16",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-09-16",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-09-16",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-09-16",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-09-17",
    "action": "release-transition",
    "actor": "cli",
    "details": "Release: unreleased -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-014",
    "date": "2026-09-17",
    "action": "release-transition",
    "actor": "cli",
    "details": "Release: planned -> released."
  }
]
```
