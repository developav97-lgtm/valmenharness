---
schema_version: 2
id: SECURITY-CORE-TRANSICION-APPROVED-20261005
title: Exigir la aprobación registrada para entrar en approved
type: SECURITY
module: CORE
workflow_status: closed
qa_status: approved
release_status: unreleased
user_visible: false
sync_impact: false
migration_impact: false
docker_impact: false
risk_level: normal
created: 2026-10-05
updated: 2026-10-06
related_ticket: null
target_release: null
released_in: null
---

# SECURITY-CORE-TRANSICION-APPROVED-20261005

## Solicitud original

Parte del sprint: Control en el código: aprobación del plan registrada, despliegue con frase consumible, escrituras autenticadas, cierre con criterios marcados y consumo fiable. Cierra con la medición de salida de S1 a S3.
- R-CTRL-001: La transición a approved DEBE exigir una aprobación del plan registrada con actor y fuente
Depende de: SECURITY-ENGINE-APROBACION-PLAN-20261005.
Viene de una feature descompuesta en sprints; su plan completo está en el tickets.yaml de la feature.

### Supuestos y decisiones pendientes

<!-- Si el pedido nombra algo que el código no tiene —parámetro, permiso,
campo, bandera, columna, migración— y no lo especifica, listá cada elemento
con su pregunta antes de avanzar a análisis; el análisis no planifica sobre
la adivinanza. Si no hay ninguno, escribí «Ninguno» y seguí. -->
Ninguno.

## Descripción funcional

- Alcance: que `transition --to approved` **exija** la aprobación registrada que ya sabe crear y verificar `SECURITY-ENGINE-APROBACION-PLAN-20261005` (R-CTRL-001, mitad de exigencia): un evento `plan-approved` vigente, con el hash del plan de ahora. Una frase en `## Plan` deja de bastar. La corrida delegada registra su aprobación con fuente `delegacion` citando las palabras del PO. Los tickets que ya pasaron por `approved` siguen validando, porque la exigencia vive en la transición y no en la validación.
- Usuario o rol afectado: la persona que aprueba planes, el agente que mueve tickets y la corrida delegada.
- Comportamiento actual: `transition` a `approved` pide la línea «aprobado explícitamente por el PO» en `## Plan` (o «gate no exigible» si el ticket no es crítico); cualquiera que escriba el plan puede escribirla y no hay actor, fuente ni vínculo con el contenido.
- Comportamiento esperado: moverlo a `approved` sin aprobación registrada se rechaza con el mensaje que dice cómo registrarla (`valmen approve-plan`); si el plan cambió después de aprobarse, se rechaza porque el hash no coincide; con la aprobación vigente procede, y el evento de la transición cita al aprobador. La línea de `## Plan` sigue pidiéndose como constancia legible, pero ya no basta. En una corrida delegada la aprobación se registra con fuente `delegacion`, el actor de la delegación y su frase literal.

## Diagnóstico

- Archivos y flujo investigados: la exigencia actual está en la rama de `approved` de `transition` (`packages/engine/src/transition.ts:354`) con `hasPlanGate` (`packages/core/src/validate.ts:253`); `packages/engine/src/plan-approval.ts` (cerrado en el ticket anterior) ya trae `aprobacionDePlanVigente`, `hashDelPlan` y `registrarAprobacionDePlan`; la corrida delegada escribe la línea y mueve el ticket en `packages/cli/src/delegation.ts:240-249`; el texto del siguiente paso de un ticket `planned` está en `packages/engine/src/next-step.ts:284-340`. La skill `planificacion` (`.valmen/skills/planificacion/SKILL.md`) documenta hoy la línea del plan como la aprobación y es donde se corrige la regla. Los tests que llevan un ticket a `approved` por `transition` son una veintena de archivos de `tests/` y construyen la aprobación con la línea del plan.
- Causa raíz o hipótesis: la aprobación se modeló como texto del plan; este ticket cambia la fuente de verdad a un evento sin tocar `validate`. Comprobado: la rama de `approved` solo llama a `hasPlanGate`. Hipótesis de diseño decidida aquí: la fuente `delegacion` solo la acepta la ruta de la corrida delegada con una delegación vigente (su registro guarda las palabras del PO), no la lista del proyecto, para que un ejecutor no pueda declararla desde la línea de comandos.
- Riesgos y compatibilidad: es un cambio de seguridad del flujo de aprobación, por eso exige tu aprobación del plan. Rompe a todo el que mueva a `approved` sin registrar aprobación —es el cambio de comportamiento que el requisito pide—: se agrega un ayudante de prueba, se ajustan los tests y el mensaje de rechazo trae el comando exacto; el mensaje de rechazo trae el comando exacto. Un ticket antiguo que vuelve a `approved` desde `blocked` también la exige. Un ticket ya en `approved` o posterior no se revalida. La barrera contra el ejecutor desatendido sigue siendo de proceso (`VALMEN_UNATTENDED`), no criptográfica, como en el ticket anterior.
- Impactos de sync, migración, Docker o despliegue: ninguno.

## Plan

- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan), Juan Andrade, 2026-10-06: «Dale si la A la que me recomendaste»; compuerta `plan` aprobada por el evaluador y registrada en su recibo.
- Alcance: la exigencia en la transición, el registro en la corrida delegada, los textos de ayuda y los ajustes de pruebas. Exclusiones: `validate`, tickets ya aprobados y la barrera criptográfica del ejecutor.
- Pasos ordenados:
  1. En `packages/engine/src/transition.ts` reemplazar, en la rama de `approved`, la comprobación de la línea por `aprobacionDePlanVigente(document)`: rechazar con `sin-aprobacion` o `plan-cambiado` y su motivo (con el comando `valmen approve-plan` completo); conservar la exigencia de la línea de constancia y del plan estructurado; cuando procede, anexar un evento que cite al aprobador y el hash.
  2. En `packages/engine/src/plan-approval.ts` agregar la opción `viaDelegacion` a `registrarAprobacionDePlan`, que acepta la fuente `delegacion` aunque no esté en la lista del proyecto, y solo desde la corrida delegada; la opción **no** salta la barrera de sesión desatendida que ya aplica `registrarAprobacionDePlan` (`VALMEN_UNATTENDED`), de modo que ninguna ruta de registro aprueba un plan desde una sesión desatendida.
  3. En `packages/cli/src/delegation.ts:240` registrar la aprobación con `registrarAprobacionDePlan` (actor y frase de la delegación, fuente `delegacion`) antes de escribir la línea y mover a `approved`.
  4. En `packages/engine/src/next-step.ts` cambiar el texto del paso de `planned` para que diga que la aprobación se registra con `valmen approve-plan` con las palabras literales de la persona, y en `.valmen/skills/planificacion/SKILL.md` documentar el comando, la clave `plan-approval-sources` y la regla de la barrera; la proyección con `valmen sync` queda para quien la ejecute.
  5. Crear el ayudante `aprobarPlanEnPrueba` en `tests/helpers/` y ajustar los tests que mueven a `approved`; crear `tests/transicion-approved-registrada.test.ts` con: la frase en el plan sin evento se rechaza, el plan cambiado se rechaza por hash, la aprobación vigente procede, un ticket ya `approved` sigue validando, la corrida delegada registra con fuente `delegacion` y una sesión con `VALMEN_UNATTENDED` fijada no puede registrar la aprobación ni por la ruta delegada; correr esas pruebas, la suite completa con `npx vitest run` y `npx tsc --noEmit -p tsconfig.json`.
- Rollback: revertir el commit del ticket; la aprobación registrada es aditiva y la línea del plan sigue presente, de modo que el flujo anterior vuelve a funcionar sin migrar nada.

## Criterios de aceptación

- [x] Mover un ticket a `approved` con la frase en `## Plan` y sin aprobación registrada se rechaza y el mensaje dice cómo registrarla
      <!-- test: npx vitest run tests/transicion-approved-registrada.test.ts -->
- [x] Si el plan cambia después de la aprobación, mover a `approved` se rechaza porque el hash no coincide
      <!-- test: npx vitest run tests/transicion-approved-registrada.test.ts -->
- [x] Con la aprobación vigente la transición procede y su evento cita al aprobador
      <!-- test: npx vitest run tests/transicion-approved-registrada.test.ts -->
- [x] Los tickets que ya pasaron por `approved` siguen validando
      <!-- test: npx vitest run tests/transicion-approved-registrada.test.ts -->
- [x] La corrida delegada registra la aprobación con fuente `delegacion` y las palabras del PO
      <!-- test: npx vitest run tests/transicion-approved-registrada.test.ts -->
- [x] Una sesión desatendida no puede aprobar el plan que va a ejecutar
      <!-- test: npx vitest run tests/transicion-approved-registrada.test.ts -->

## Puntos

```json
[
  {
    "id": "POINT-001",
    "title": "Verificación del cierre de SECURITY-CORE-TRANSICION-APPROVED-20261005",
    "status": "closed",
    "severity": "normal",
    "actual": "La implementación está entregada y falta cerrar su QA.",
    "expected": "Los criterios del ticket se cumplen y sus pruebas dan el resultado esperado.",
    "evidence": [
      "EVIDENCE-001"
    ],
    "affected_files": [
      "packages/engine/src/transition.ts",
      "packages/engine/src/plan-approval.ts",
      "packages/cli/src/delegation.ts",
      "packages/engine/src/next-step.ts"
    ],
    "diagnosis": null,
    "solution": null,
    "tests": [],
    "qa_cycles": [
      "QA-001"
    ],
    "terminal_reason": null,
    "related_ticket": null
  }
]
```

## Implementación

- `packages/engine/src/transition.ts`: la rama de `approved` exige `aprobacionDePlanVigente`: sin aprobación o con el plan cambiado se rechaza con el motivo y el comando `valmen approve-plan` completo; al proceder anexa el evento `plan-approval-verified` con el aprobador, la fuente y el hash. La línea de constancia y el plan estructurado se siguen pidiendo.
- `packages/engine/src/plan-approval.ts`: opción `viaDelegacion` y `FUENTE_DELEGACION`: la corrida delegada puede usar la fuente `delegacion` sin que el proyecto la declare; la barrera de sesión desatendida aplica igual.
- `packages/cli/src/delegation.ts`: `advanceDelegated` registra la aprobación (actor y frase de la delegación, fuente `delegacion`) antes de mover a `approved`.
- `packages/engine/src/next-step.ts`: el paso de `planned` dice cómo registrar la aprobación; `.valmen/skills/planificacion/SKILL.md` documenta el comando, `plan-approval-sources` y la barrera (la proyección con `valmen sync` queda para quien la ejecute).
- Pruebas: `tests/transicion-approved-registrada.test.ts` (nuevo, 6), `tests/helpers/aprobacion.ts` (ayudante), y ajustes en `etapas`, `firma-de-compuerta`, `modo-ask`, `mcp-server`, `next-step` y `delegation`.

## Pruebas

Desde la raíz del repositorio, Node 24, sin red:

1. `npx vitest run tests/transicion-approved-registrada.test.ts tests/delegation.test.ts` — esperado: 24 pruebas pasan.
2. `npx vitest run` — esperado: 171 archivos pasan y 1 omitido; 2518 pruebas pasan, 0 fallan.
3. `npx tsc --noEmit -p tsconfig.json` — sin salida.

Resultado de la ejecución del agente (2026-10-06): los tres comandos dieron lo esperado.

- Resultado del PO: «Escojo A cierra» — Juan Andrade, 2026-10-06 (cierre tras revisar el resumen de pruebas). Las pruebas del ticket las ejecutó el agente y dieron el resultado esperado (suite completa y pruebas del ticket en verde).

## QA

```json
[
  {
    "id": "QA-001",
    "date": "2026-10-07",
    "build_reference": "commit:3c31842a963ec3bfc40ebc5967ab650f64ac53ca",
    "environment": "local (Node 24, vitest)",
    "result": "pending",
    "findings": [],
    "correction": null,
    "po_confirmation": null
  },
  {
    "id": "QA-002",
    "date": "2026-10-07",
    "build_reference": null,
    "environment": null,
    "result": "approved",
    "findings": [],
    "correction": null,
    "po_confirmation": "«Escojo A cierra» — Juan Andrade, 2026-10-06 (cierre tras revisar el resumen de pruebas)"
  }
]
```

## Evidencia

```json
[
  {
    "id": "EVIDENCE-001",
    "date": "2026-10-07",
    "kind": "automated-test",
    "description": "Pruebas del ticket y suite completa en verde (ver ## Pruebas)",
    "reference": "worktree:sha256:24a54cf556a4d052e50ea4495216309b7ce057a0d85ef128b0d4a22ea2aeec2d",
    "point_id": "POINT-001"
  }
]
```

## Retests

```json
[
  {
    "id": "RETEST-001",
    "date": "2026-10-07",
    "point_id": "POINT-001",
    "result": "approved",
    "evidence": [],
    "po_confirmation": "«Escojo A cierra» — Juan Andrade, 2026-10-06 (cierre tras revisar el resumen de pruebas)"
  }
]
```

## Cierre

```json
[
  {
    "kind": "ticket-close",
    "id": "CLOSE-001",
    "date": "2026-10-07",
    "technical_summary": "transition.ts exige aprobacionDePlanVigente para entrar a approved y deja plan-approval-verified; la corrida delegada registra con fuente delegacion; next-step y la skill planificacion explican el registro.",
    "functional_summary": "Un plan solo se da por aprobado si hay una aprobación registrada con quién, desde dónde y qué plan; una frase en el plan ya no basta.",
    "qa_status": "approved",
    "qa_waiver_reason": null,
    "po_confirmation": null,
    "release_impact": "ninguno"
  }
]
```

## Consumo de IA

```json
[
  {
    "kind": "ai-usage",
    "date": "2026-10-07",
    "session_reference": null,
    "model": null,
    "reasoning_effort": null,
    "notes": "Sesión que atendió varios tickets; sin números por ticket para no repartir a ojo un costo que no se midió.",
    "input_tokens": null,
    "output_tokens": null,
    "total_tokens": null,
    "estimated_cost_usd": null,
    "source": "manual:sesión de Claude Code, corrida delegada DEL-20261006-001",
    "confidence": "medium",
    "id": "CONSUMO-001"
  }
]
```

## Release

Sin publicar todavía.

## Eventos

```json
[
  {
    "kind": "ticket-event",
    "id": "EVENT-001",
    "date": "2026-10-05",
    "at": "2026-10-06T01:51:49.860Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-06",
    "at": "2026-10-07T03:04:02.567Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-06",
    "at": "2026-10-07T03:04:23.343Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-06",
    "at": "2026-10-07T03:10:08.360Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-06",
    "at": "2026-10-07T03:10:08.616Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-06",
    "at": "2026-10-07T03:13:48.147Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-06",
    "at": "2026-10-07T03:14:35.772Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-10-06",
    "at": "2026-10-07T03:14:36.045Z",
    "action": "point-added",
    "actor": "cli",
    "details": "Se agregó POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-10-06",
    "at": "2026-10-07T03:14:36.311Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-10-06",
    "at": "2026-10-07T03:14:36.557Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-10-06",
    "at": "2026-10-07T03:14:36.803Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-10-06",
    "at": "2026-10-07T03:14:37.129Z",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-10-06",
    "at": "2026-10-07T03:14:37.475Z",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-014",
    "date": "2026-10-06",
    "at": "2026-10-07T03:14:37.703Z",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-001 para POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-015",
    "date": "2026-10-06",
    "at": "2026-10-07T03:14:37.915Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: verified -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-016",
    "date": "2026-10-06",
    "at": "2026-10-07T03:14:38.131Z",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-017",
    "date": "2026-10-06",
    "at": "2026-10-07T03:14:38.349Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-018",
    "date": "2026-10-06",
    "at": "2026-10-07T03:14:38.559Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-019",
    "date": "2026-10-06",
    "at": "2026-10-07T03:14:39.964Z",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-020",
    "date": "2026-10-06",
    "at": "2026-10-07T03:14:40.202Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  }
]
```
