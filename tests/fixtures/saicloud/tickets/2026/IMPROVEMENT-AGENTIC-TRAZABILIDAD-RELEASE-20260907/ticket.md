---
schema_version: 1
id: IMPROVEMENT-AGENTIC-TRAZABILIDAD-RELEASE-20260907
title: Automatizar trazabilidad de tickets al publicar una release
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
created: 2026-09-07
updated: 2026-09-17
related_ticket: null
target_release: 6.2.5
released_in: 6.2.5
---

# IMPROVEMENT-AGENTIC-TRAZABILIDAD-RELEASE-20260907

## Solicitud original

Al realizar una release, actualizar automáticamente y de forma trazable los tickets incluidos con release_status, target_release y released_in, sin inferir tickets por fecha ni modificar tickets abiertos.

## Descripción funcional

- Alcance: incorporar al CLI de tickets una operación determinista para
  registrar la publicación de una lista explícita de tickets después de que
  exista el tag anotado de producción.
- Usuario o rol afectado: PO y equipo de desarrollo que preparan y cierran
  releases; el visor local y los reportes de tickets consumen el resultado.
- Comportamiento actual: la publicación de `v6.2.4` actualizó solo el ticket
  de integración. Los tickets funcionales debieron corregirse luego de forma
  manual, aunque sus cambios ya estaban en la release.
- Comportamiento esperado: al cierre de una release, Codex ejecuta un comando
  con IDs explícitos que valida el tag y marca únicamente los tickets cerrados
  incluidos como `released`, con `target_release` y `released_in` iguales.

## Diagnóstico

- Archivos y flujo investigados: `tools/agentic/ticket.py`, sus pruebas,
  `tools/agentic/release_notes.py`, `docs/agentic/rules/delivery.md`,
  `AGENTS.md` y el ticket de release `v6.2.4`.
- Causa raíz o hipótesis: el CLI ofrece solo una transición de release por
  ticket; el proceso de tag y canario no tiene una operación que reciba la
  selección de la release y aplique esas transiciones en conjunto.
- Riesgos y compatibilidad: inferir por fecha o por todos los tickets cerrados
  puede publicar tickets ajenos. La automatización debe validar previamente
  todos los IDs, el tag anotado, el commit de producción y los SHAs completos
  atribuidos; ante cualquier error no puede escribir parcialmente.
- Impactos de sync, migración, Docker o despliegue: no modifica código de
  producto ni infraestructura. Afecta el procedimiento documental posterior
  al canario y no sustituye el gate humano de PR, tag, pipelines ni QA.

## Plan

- Gate de plan: aprobado explícitamente por el PO el 2026-09-07 para
  implementar el comando determinista y actualizar el procedimiento de
  release, sin automatizar PR, tag, despliegue ni confirmaciones humanas.
- Pasos ordenados:
  1. Extender `tools/agentic/ticket.py` con un subcomando de publicación de
     release que reciba `--version`, una lista explícita `--tickets` y el tag
     esperado; validar SemVer, duplicados, tickets canónicos cerrados y estado
     `unreleased`.
  2. Verificar con Git local que el tag existe, es anotado, apunta al commit
     actual de `production` y que al menos un SHA completo de implementación
     de cada ticket es ancestro del commit etiquetado. Validar todo antes de
     mutar archivos.
  3. Aplicar para todos los tickets validados las transiciones históricas
     `unreleased → planned → released`, establecer ambas versiones y anexar
     eventos auditables. Regenerar el índice una sola vez y dejar los cambios
     sin commit para la revisión selectiva normal.
  4. Añadir pruebas unitarias de caso exitoso, tag ausente o ligero, ticket
     abierto, ticket ajeno al tag, SHA ausente, duplicado y garantía de cero
     mutaciones ante fallo.
  5. Actualizar `docs/agentic/rules/delivery.md`, `AGENTS.md` y la skill de
     despliegue: el orquestador ejecutará el comando únicamente después de
     pipelines/canario aprobados y antes del cierre documental; los hooks no
     modifican tickets.
- Rollback, backup, canario u orden de despliegue cuando aplique: la operación
  no etiqueta, despliega ni cambia AWS. Si falla, no escribe tickets; si se
  detecta una selección incorrecta antes del commit, se descarta el diff local
  de rutas concretas y se reconstruye con la lista correcta. El canario y la
  aprobación final continúan siendo gates humanos externos al comando.

## Criterios de aceptación

- [ ] El comando requiere IDs explícitos y nunca infiere tickets por fecha,
  estado global o texto de novedades.
- [ ] Rechaza sin escribir si el tag no es anotado, no coincide con
  `production`, un ticket no está cerrado/no está `unreleased`, se repite un
  ID o sus SHAs no pertenecen al tag.
- [ ] En caso exitoso, cada ticket seleccionado queda `released` con
  `target_release` y `released_in` iguales a la versión indicada, más eventos
  de transición e índice actualizado.
- [ ] Las reglas y la skill indican el punto exacto del flujo donde se ejecuta
  después del canario, sin automatizar PR, tag, despliegue ni aprobación PO.

## Puntos

<!-- Crear POINT-NNN es append-only: no eliminar, reordenar ni reutilizar. Las transiciones solo las realiza el CLI, actualizan el punto actual y anexan un ticket-event. -->

```json
[]
```

## Implementación

- Archivos cambiados: `tools/agentic/ticket.py`,
  `tools/agentic/tests/test_ticket.py`, `AGENTS.md`,
  `docs/agentic/rules/delivery.md`,
  `.agents/skills/saicloud-despliegue/SKILL.md`,
  `.agents/skills/saiopencloud-orquestador/SKILL.md` y el manual de flujo.
- Decisiones técnicas: se añadió `release-publish --version X.Y.Z --tickets
  ID1,ID2`. La selección es obligatoriamente explícita; valida SemVer, IDs sin
  duplicados, tag anotado, coincidencia con `production`, ticket cerrado aún no
  publicado y un SHA completo de implementación ancestro del tag. Primero
  valida toda la selección y solo después actualiza cada ticket con ambas
  transiciones históricas y reconstruye una vez el índice.
- Compatibilidad preservada: no cambia producto, AWS, PRs, tags, commits, push
  ni despliegues. Las transiciones existentes continúan disponibles y los
  tickets ajenos, abiertos, ya publicados o sin evidencia de commit se rechazan
  sin modificar documentación.
- Commits atribuibles al ticket:
  - `a76aebfa2b7dad7afc2bc3da55db76f44a7e07b6` — incorpora el comando,
    validaciones, pruebas y reglas del flujo de publicación de tickets.

## Pruebas

- Comandos para el PO: `python3 -m unittest
  tools.agentic.tests.test_ticket.ReleasePublicationTests -v`, `python3 -m
  unittest tools.agentic.tests.test_ticket -v`, `python3
  tools/agentic/ticket.py validate --all`, `python3 tools/agentic/ticket.py
  index --check` y `git diff --check`.
- Directorio de ejecución: raíz del repositorio.
- Resultado esperado: las pruebas correctas; el caso exitoso publica solo los
  IDs indicados y los rechazos no cambian ningún ticket.
- Validaciones manuales: en la siguiente release, confirmar en el visor que
  los tickets seleccionados muestran la versión entregada y que un ticket
  abierto o ajeno no cambia.
- Requisitos de ambiente o datos: Git disponible localmente y un tag anotado
  de prueba creado dentro del fixture; no requiere AWS ni credenciales.
- Resultado comunicado por el PO: el 2026-09-07 informó que las 34 pruebas
  pasaron; `validate --all` confirmó 33 tickets válidos y el índice se
  actualizó correctamente.

## QA

```json
[
  {
    "id": "QA-001",
    "date": "2026-09-07",
    "build_reference": "worktree:sha256:a1d48e7011fec6a3f3e294983c720d8748a18fe18edd1243a49be1ba9238138a",
    "environment": "Validación técnica local del PO",
    "result": "pending",
    "findings": [],
    "correction": null,
    "po_confirmation": null
  },
  {
    "id": "QA-002",
    "date": "2026-09-07",
    "build_reference": null,
    "environment": null,
    "result": "approved",
    "findings": [],
    "correction": null,
    "po_confirmation": "QA aprobado por el PO el 2026-09-07."
  }
]
```

## Evidencia

```json
[
  {
    "id": "EVIDENCE-001",
    "date": "2026-09-07",
    "kind": "user-test",
    "description": "El PO informó que las 34 pruebas del CLI, la validación de 33 tickets y la comprobación del índice finalizaron correctamente.",
    "reference": "worktree:sha256:a1d48e7011fec6a3f3e294983c720d8748a18fe18edd1243a49be1ba9238138a",
    "point_id": null
  }
]
```

## Retests

```json
[]
```

## Cierre

<!-- Bloque JSON append-only de objetos con `kind: "ticket-close"`; el esquema completo está en ticket-schema.md. -->

- Cierre técnico y funcional: se incorporó una publicación documental
  determinista por selección explícita, con validaciones de Git y pruebas de
  éxito y rechazo. Las releases futuras dejan su trazabilidad actualizada al
  terminar pipelines y canario.
- Resultado comunicado por el PO: 34 pruebas correctas y validaciones del CLI
  correctas el 2026-09-07.
- QA aprobada o eximida (motivo y confirmación explícita del PO si aplica):
  QA aprobada explícitamente por el PO el 2026-09-07.
- Riesgo residual e impacto de release: depende de que el operador seleccione
  los IDs correctos de la versión; el comando rechaza evidencia incompleta y
  no modifica infraestructura ni la release `v6.2.4` ya publicada.
- Texto visible al usuario cuando aplique: no aplica; es una mejora interna de
  trazabilidad para el equipo.

```json
[
  {
    "kind": "ticket-close",
    "id": "CLOSE-001",
    "date": "2026-09-07",
    "technical_summary": "Se implementó release-publish con validación de tag anotado, production, tickets y SHAs de implementación; además se añadieron pruebas y reglas de operación.",
    "functional_summary": "Las releases futuras registrarán de forma consistente qué tickets se entregaron y en qué versión, sin seleccionar tickets por fecha.",
    "qa_status": "approved",
    "qa_waiver_reason": null,
    "po_confirmation": "El PO aprobó QA el 2026-09-07.",
    "release_impact": "Se aplicará en la siguiente release; no modifica producto ni la release v6.2.4 ya publicada."
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
    "date": "2026-09-07",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-09-07",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-09-07",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-09-07",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-09-07",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-09-07",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-09-07",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-09-07",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-09-07",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-09-07",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-09-07",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-09-07",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-09-07",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-014",
    "date": "2026-09-17",
    "action": "release-transition",
    "actor": "cli",
    "details": "Release: unreleased -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-015",
    "date": "2026-09-17",
    "action": "release-transition",
    "actor": "cli",
    "details": "Release: planned -> released."
  }
]
```
