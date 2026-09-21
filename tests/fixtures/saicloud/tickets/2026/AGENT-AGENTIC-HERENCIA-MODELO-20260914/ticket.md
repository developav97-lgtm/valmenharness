---
schema_version: 1
id: AGENT-AGENTIC-HERENCIA-MODELO-20260914
title: Permitir que los agentes hereden el modelo elegido en el task
type: AGENT
module: AGENTIC
workflow_status: closed
qa_status: approved
release_status: released
user_visible: false
sync_impact: false
migration_impact: false
docker_impact: false
risk_level: normal
created: 2026-09-14
updated: 2026-09-17
related_ticket: null
target_release: 6.2.5
released_in: 6.2.5
---

# AGENT-AGENTIC-HERENCIA-MODELO-20260914

## Solicitud original

Mantener Terra con esfuerzo medio como valor predeterminado del proyecto, pero permitir que al seleccionar manualmente Sol o Astra y un esfuerzo superior en el chat, el task se ejecute con esa selección y sus agentes hereden el mismo modelo y esfuerzo.

## Descripción funcional

- Alcance: ajustar únicamente la resolución de modelo y esfuerzo del task principal y de los subagentes project-scoped.
- Usuario o rol afectado: PO y colaboradores que ejecutan tareas Codex dentro de SaiOpenCloud.
- Comportamiento actual: el task principal inicia en Terra/medio, pero `[agents]` y cada perfil activo vuelven a fijar modelo/esfuerzo; por ello una selección manual de Sol o Astra en el chat no se propaga de forma consistente a los subagentes.
- Comportamiento esperado: Terra/medio continúa como valor inicial del task principal. Si el usuario selecciona manualmente otro modelo o esfuerzo para el task, los subagentes heredan esa selección, sin perder sus instrucciones, nombre, descripción ni sandbox propios.

## Diagnóstico

- Archivos y flujo investigados: `.codex/config.toml`, los perfiles TOML activos bajo `.codex/agents/` y `.codex/agents/README.md`.
- Causa raíz comprobada: `.codex/config.toml` declara `agents.default_subagent_model` y `agents.default_subagent_reasoning_effort`; además, los perfiles activos declaran `model` y `model_reasoning_effort`. Según la resolución oficial de Codex, esas capas prevalecen sobre la herencia del padre, y las claves del perfil personalizado tienen la última precedencia.
- Riesgos y compatibilidad: al retirar los modelos fijados por perfil, la selección del task padre pasa a controlar todos los subagentes. En ejecución predeterminada todos heredarán Terra/medio, incluido `offline-sync`, que hoy usa Sol/xhigh; el PO deberá elevar manualmente el task cuando el riesgo lo amerite. No cambian instrucciones, permisos, sandbox, herramientas ni gates funcionales.
- Impactos de sync, migración, Docker o despliegue: ninguno sobre producto o datos. El cambio afecta exclusivamente el runtime agentic local de sesiones nuevas; no toca OfflineSync, SincSaiCloud, Docker, bases de datos ni producción.

## Plan

- Gate de plan y aprobación del PO: aprobado explícitamente por el PO el 2026-09-14 para retirar los overrides de modelo/esfuerzo y preservar Terra/medio como default del task principal.
- Pasos ordenados:
  1. Conservar `model = "gpt-5.6-terra"` y `model_reasoning_effort = "medium"` en `.codex/config.toml` como valores iniciales del task principal.
  2. Retirar de `[agents]` los campos `default_subagent_model` y `default_subagent_reasoning_effort`, conservando habilitación y concurrencia.
  3. Retirar `model` y `model_reasoning_effort` de cada perfil TOML activo para que herede ambos valores del task padre; preservar sin cambios nombre, descripción, instrucciones y sandbox.
  4. Actualizar `.codex/agents/README.md` para documentar la herencia y la selección manual recomendada para trabajo crítico.
  5. Validar sintaxis estricta, ausencia de overrides residuales y comportamiento en una sesión nueva con Terra/medio y otra con Sol/alto o Astra/alto.
- Rollback: restaurar las cuatro clases de claves retiradas y la tabla de routing anterior. No requiere backup, canario ni orden de despliegue porque no modifica runtime de producto ni infraestructura; la comprobación se realiza en sesiones Codex nuevas.

## Criterios de aceptación

- [ ] Un task nuevo sin selección manual inicia con `gpt-5.6-terra` y esfuerzo `medium`.
- [ ] Un task configurado manualmente con Sol/alto o Astra/alto conserva esa selección durante la ejecución.
- [ ] Los subagentes sin override explícito heredan el modelo y esfuerzo efectivos del task padre.
- [ ] Ningún perfil activo fija `model` ni `model_reasoning_effort`.
- [ ] Los nombres, descripciones, instrucciones, sandbox y límite de concurrencia de los perfiles permanecen intactos.

## Puntos

<!-- Crear POINT-NNN es append-only: no eliminar, reordenar ni reutilizar. Las transiciones solo las realiza el CLI, actualizan el punto actual y anexan un ticket-event. -->

```json
[]
```

## Implementación

- Archivos cambiados: `.codex/config.toml`, los doce perfiles TOML activos de `.codex/agents/` y `.codex/agents/README.md`.
- Decisiones técnicas: se conservan `model = "gpt-5.6-terra"` y `model_reasoning_effort = "medium"` solo como defaults del task principal. Se retiraron los defaults de `[agents]` y los overrides de cada perfil para que la resolución herede del task padre.
- Compatibilidad preservada: se mantuvieron nombres, descripciones, instrucciones, sandbox, habilitación de agentes y límite de concurrencia. Las sesiones abiertas no se modifican; las nuevas resuelven la configuración actualizada.
- Commits atribuibles al ticket:
  - `63072f9df74fc50c8dd115983cb84cfea641ddbc` — permite que los perfiles de agentes hereden el modelo y esfuerzo seleccionados en el task padre.

## Pruebas

- Comandos para el PO: `codex --strict-config -C <PROYECTO> exec --help` y `rg -n '^(model|model_reasoning_effort|default_subagent_model|default_subagent_reasoning_effort)\\s*=' .codex/config.toml .codex/agents --glob '*.toml'`.
- Directorio de ejecución: raíz de SaiOpenCloud.
- Resultado esperado: Codex acepta la configuración; la búsqueda devuelve únicamente `model` y `model_reasoning_effort` en el nivel raíz de `.codex/config.toml`, sin overrides dentro de `[agents]` ni perfiles activos.
- Validaciones manuales: abrir una sesión nueva sin cambiar el selector y confirmar Terra/medio; abrir otra con Sol/alto o Astra/alto, solicitar un subagente y comprobar en sus detalles que heredó ambos valores.
- Requisitos de ambiente o datos: Codex Desktop/CLI con acceso a los modelos seleccionados en la cuenta. Las sesiones ya abiertas pueden requerir reinicio o una sesión nueva para recargar los perfiles.
- Resultado de validación local: `codex --strict-config ... exec --help` terminó correctamente; la búsqueda devolvió únicamente los dos defaults del task principal; `git diff --check` y la validación del ticket terminaron correctamente.
- Resultado comunicado por el PO: validación exitosa el 2026-09-15; el PO confirmó que el ajuste funciona y solicitó cerrar el ticket.

## QA

```json
[
  {
    "id": "QA-001",
    "date": "2026-09-15",
    "build_reference": "worktree:sha256:748fc8542cd7858b5dc4ac2facf972a9aa74fd25945f22d0a203fd3e14f1e50a",
    "environment": "Codex Desktop local",
    "result": "pending",
    "findings": [],
    "correction": null,
    "po_confirmation": null
  },
  {
    "id": "QA-002",
    "date": "2026-09-15",
    "build_reference": null,
    "environment": null,
    "result": "approved",
    "findings": [],
    "correction": null,
    "po_confirmation": "El PO confirmó el 2026-09-15 que validó la herencia de modelo y esfuerzo, y solicitó el cierre del ticket."
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

- Cierre técnico y funcional: se retiraron los overrides globales y por perfil sin alterar instrucciones, sandbox ni concurrencia; Terra/medio se conserva como default del task.
- Resultado comunicado por el PO: validación exitosa de la herencia de modelo/esfuerzo el 2026-09-15.
- QA aprobada o eximida (motivo y confirmación explícita del PO si aplica): QA aprobada por el PO el 2026-09-15.
- Riesgo residual e impacto de release: las sesiones Codex ya abiertas deben reiniciarse o abrirse de nuevo para cargar la configuración; el ticket continúa `unreleased` porque no hay release de producto.
- Texto visible al usuario cuando aplique: no aplica; cambio interno de herramientas de desarrollo.

```json
[
  {
    "kind": "ticket-close",
    "id": "CLOSE-001",
    "date": "2026-09-15",
    "technical_summary": "Se eliminaron los overrides globales y por perfil para que los subagentes hereden el modelo y esfuerzo efectivos del task padre, conservando Terra/medio como default del task.",
    "functional_summary": "El PO puede elevar manualmente el modelo o el esfuerzo en un task nuevo y los agentes usarán la misma selección.",
    "qa_status": "approved",
    "qa_waiver_reason": null,
    "po_confirmation": "El PO validó el cambio el 2026-09-15 y solicitó cerrar el ticket.",
    "release_impact": "Cambio interno de configuración de Codex; permanece unreleased y no requiere release de producto."
  }
]
```

## Consumo de IA

<!-- Registros append-only `ai-usage`: consumo conocido o estimado con fuente y confianza. No inventar tokens ni coste; usar null cuando Codex no lo reporte. -->

```json
[]
```

## Release

- Estado de release: unreleased.
- Versión objetivo: no aplica.
- Versión publicada: no aplica.
- Tickets relacionados: ninguno.

## Eventos

<!-- Bloque JSON append-only final de objetos con `kind: "ticket-event"`; el CLI agrega uno por cada mutación propia. -->

```json
[
  {
    "kind": "ticket-event",
    "id": "EVENT-001",
    "date": "2026-09-14",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-09-14",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-09-14",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-09-14",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-09-14",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-09-14",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-09-15",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-09-15",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-09-15",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-09-15",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-09-15",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-09-15",
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
