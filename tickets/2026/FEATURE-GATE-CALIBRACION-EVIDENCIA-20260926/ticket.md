---
schema_version: 2
id: FEATURE-GATE-CALIBRACION-EVIDENCIA-20260926
title: Promover gates híbridos con evidencia calibrada
type: FEATURE
module: GATE
workflow_status: closed
qa_status: approved
release_status: unreleased
user_visible: false
sync_impact: false
migration_impact: false
docker_impact: false
risk_level: normal
created: 2026-09-26
updated: 2026-10-05
related_ticket: null
target_release: null
released_in: null
---

# FEATURE-GATE-CALIBRACION-EVIDENCIA-20260926

## Solicitud original

Parte del sprint: Ejecutar autonomía acotada con colisiones, evidencia, migraciones e integración controladas.
- R-S5-004: Promoción de gates por evidencia — Un gate híbrido SOLO DEBE promoverse a automático cuando la calibración contra
Depende de: FEATURE-GATE-VERIFY-DEV-20260926.
Viene de una feature descompuesta en sprints; su plan completo está en el tickets.yaml de la feature.

## Descripción funcional

- Alcance: permitir solicitar la promoción de un gate híbrido a automático solo cuando una calibración verificable contra decisiones humanas alcanza la política exigida.
- Usuario o rol afectado: responsable del proyecto que configura gates y quien ejecuta el workflow; no se promociona ningún gate existente por defecto.
- Comportamiento actual: `simulate --calibrate`, `calibrate()` y `usage` calculan coincidencia, falsos aprobados y falsos aprobados críticos, pero `GateDefinition.mode` sigue fijo y ninguna configuración ni recibo vuelve automática una compuerta.
- Comportamiento esperado: una configuración que pida modo automático debe acompañarse de evidencia append-only con gate, muestra, coincidencia, falsos aprobados críticos y referencia humana; el motor acepta la promoción solo cuando la evidencia cumple los umbrales declarados, y la rechaza con un motivo concreto en caso contrario.

## Diagnóstico

- Síntoma observable: R-S5-004 exige que una promoción dependa de la calibración; hoy `calibrate()` produce el número, pero una solicitud de configuración no puede cambiar ni comprobar el modo efectivo porque `runGate()` consume directamente el `mode: "hybrid"` fijo de la definición. En consecuencia no existe una ruta que pueda demostrar «esta ejecución fue automática por la calibración C» ni una que rechace «configuración automática sin C»; la medición queda aislada y el requisito no se puede cumplir ni auditar.
- Flujo afectado: el responsable obtiene una calibración favorable y declara que quiere automatizar, por ejemplo, el gate `analysis`. El resultado esperado es que la siguiente ejecución use `auto` únicamente si conserva la evidencia C de esa calibración y sus umbrales; si borra C, cambia el gate o baja un dato, debe volver a `hybrid` con la causa. El resultado actual es idéntico en todos esos casos —la definición está codificada como `hybrid`—, así que no hay promoción útil ni guarda contra una futura configuración que intentase saltarse C.
- Archivos y flujo investigados: `packages/engine/src/calibration.ts` compara decisiones automáticas con los ciclos QA humanos y calcula `compared`, `decided`, `rate` y falsos aprobados críticos. `packages/engine/src/simulate.ts` genera los sujetos; `packages/cli/src/commands.ts` los expone por `simulate --calibrate`. `packages/gate/src/definitions.ts` declara los gates híbridos y `packages/engine/src/gate.ts` consume su modo sin una promoción configurada. `.valmen/config.yaml` no declara gates automáticos.
- Causa raíz o hipótesis: la medición y la ejecución están desconectadas. Sin una prueba estructurada que una la petición de promoción con una calibración concreta, la configuración sería una afirmación no verificable y podría ampliar la autoridad de un gate por decreto.
- Riesgos y compatibilidad: un falso aprobado puede saltar revisión humana; por eso la promoción exige muestra mínima, coincidencia suficiente y cero falsos aprobados críticos. La ausencia de configuración o de evidencia conserva el modo híbrido actual. La promoción no modifica la definición fuente del gate, no reescribe recibos y no promueve un gate desde sus propias respuestas.
- Impactos de sync, migración, Docker o despliegue: ninguno.

### Memoria consultada

- `AP-006`: dos bloqueos semánticos equivalentes no conceden una tercera corrida; la promoción se apoya en decisiones humanas registradas y no en repetir evaluaciones hasta obtener el resultado deseado.

## Plan

- Alcance y exclusiones: se añade el contrato de promoción y su verificación; quedan fuera cambiar umbrales por un modelo, promover automáticamente por una corrida, reescribir configuraciones del usuario y promover el gate que evalúa este ticket.
- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan).
- Pasos ordenados:
  1. En `packages/adapter/src/config.ts`, declarar `gate-promotions:` como mapa por ID de gate con `mode: auto`, `minimum-sample` entero positivo y `minimum-agreement` decimal entre 0 y 1. Rechazar un ID no conocido, modo distinto de `auto`, muestra no positiva, coincidencia fuera de rango, claves inesperadas o una forma que no sea mapa; una solicitud válida sigue sin ser autorización efectiva.
  2. En `packages/engine/src/calibration.ts`, convertir una calibración en evidencia tipada de promoción y decidir en código si cumple muestra mínima, coincidencia y cero falsos aprobados críticos; guardar el registro en un archivo append-only separado de los recibos de cada ticket.
  3. En `packages/engine/src/gate.ts`, resolver el modo efectivo del gate desde la configuración y la evidencia vigente. Si falta evidencia, está vencida, corresponde a otro gate o no cumple, conservar `hybrid` y devolver el motivo; nunca relajar un bloqueo ya decidido.
  4. Añadir el verbo de CLI que registra la evidencia a partir de una calibración solicitada y documentar el YAML exacto. En `tests/gate-promotion.test.ts`, cubrir evidencia válida, muestra insuficiente, coincidencia baja, falso aprobado crítico, gate distinto y ausencia de evidencia; además, cada modo, muestra, coincidencia e ID inválido de `gate-promotions` debe fallar antes de registrar o activar una promoción.
  5. Ejecutar pruebas focales, compilación, suite completa y el gate mecánico; no solicitar ni aplicar una promoción real en este proyecto, porque su configuración sigue sin gates automáticos.
- Compatibilidad y reversión: sin configuración y evidencia válidas se conserva literalmente el modo híbrido. Revertir el contrato, lector y CLI elimina la capacidad añadida sin cambiar los recibos ni las decisiones históricas.

## Criterios de aceptación

- [x] R-S5-004a: Una solicitud de promoción sin evidencia calibrada válida conserva el modo híbrido y explica el motivo.
      <!-- test: npx vitest run tests/gate-promotion.test.ts -->
- [x] R-S5-004b: El motor solo acepta evidencia del mismo gate con muestra mínima, coincidencia declarada y cero falsos aprobados críticos; cada incumplimiento se rechaza de forma independiente.
      <!-- test: npx vitest run tests/gate-promotion.test.ts -->
- [x] R-S5-004c: Una promoción aprobada queda en evidencia append-only con los números de calibración y es la única que habilita el modo automático solicitado.
      <!-- test: npx vitest run tests/gate-promotion.test.ts -->
- [x] R-S5-004d: La configuración y la CLI rechazan modos, umbrales o identificadores de gate inválidos.
      <!-- test: npx vitest run tests/gate-promotion.test.ts -->

## Puntos

```json
[]
```

## Implementación

- Se añadió `gate-promotions` como contrato estricto de configuración: solo permite la solicitud `auto` sobre gates conocidos, con muestra mínima y coincidencia válidas.
- La calibración que respalda una promoción se conserva en `.valmen/gate-promotion-evidence.jsonl` con identificador determinista, referencia humana, tickets comparables y métricas; el motor solo usa la última evidencia válida del mismo gate.
- `runGate()` resuelve el modo efectivo antes de decidir, lo expone en CLI, recibos y API, y convierte un `review` en bloqueo cuando una promoción automática respaldada por evidencia lo requiere.
- Se incorporó `valmen promote-gate <gate> --limit <n>` para simular, calibrar y anexar evidencia; la documentación describe configuración, trazabilidad y reversión al modo híbrido.

## Pruebas

- Directorio: `/Users/juanandrade/Desktop/ValmenHarness`.
- `npx vitest run tests/gate-promotion.test.ts`: 9 pruebas aprobadas; cubre los cuatro criterios R-S5-004.
- `npm run build`: aprobado.
- `npx vitest run`: 126 archivos aprobados, 1 omitido; 1912 pruebas aprobadas y 48 omitidas.
- `node packages/cli/dist/main.js gate qa-mechanical --id FEATURE-GATE-CALIBRACION-EVIDENCIA-20260926 --root /Users/juanandrade/Desktop/ValmenHarness`: aprobado; recibo command anexado.
- Resultado comunicado por el PO: pruebas aprobadas; se autoriza proceder al cierre. La configuración real de `gate-promotions` sigue sin modificarse en este ticket.

## QA

```json
[
  {
    "id": "QA-001",
    "date": "2026-10-05",
    "build_reference": "worktree:sha256:98f526432a2534b083f5d134b9455358ca66291c30edb9b87b09e2e605570d66",
    "environment": "local",
    "result": "pending",
    "findings": [],
    "correction": null,
    "po_confirmation": null
  },
  {
    "id": "QA-002",
    "date": "2026-10-05",
    "build_reference": null,
    "environment": null,
    "result": "approved",
    "findings": [],
    "correction": null,
    "po_confirmation": "Si ya corriste las pruebas procedamos a cerrar"
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

```json
[
  {
    "kind": "ticket-close",
    "id": "CLOSE-001",
    "date": "2026-10-05",
    "technical_summary": "Se implementó la promoción de gates híbridos mediante evidencia calibrada append-only, configuración estricta y resolución del modo efectivo en motor, CLI y API.",
    "functional_summary": "Un responsable solo puede solicitar modo automático para un gate híbrido cuando una calibración trazable cumple los umbrales; de otro modo se conserva el modo híbrido con motivo.",
    "qa_status": "approved",
    "qa_waiver_reason": null,
    "po_confirmation": null,
    "release_impact": "Sin publicación: queda unreleased y no modifica la configuración activa del proyecto."
  }
]
```

## Consumo de IA

```json
[
  {
    "kind": "ai-usage",
    "date": "2026-10-05",
    "session_reference": "sesion-codex-compartida-20261005",
    "model": null,
    "reasoning_effort": null,
    "notes": "Codex no expone contadores de esta sesión; se registra sin números para no inventar un reparto.",
    "input_tokens": null,
    "output_tokens": null,
    "total_tokens": null,
    "estimated_cost_usd": null,
    "source": "manual:sesion-codex-compartida-20261005",
    "confidence": "low",
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
    "date": "2026-09-26",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-04",
    "at": "2026-10-05T04:37:42.171Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-04",
    "at": "2026-10-05T04:41:18.508Z",
    "action": "gate-approved",
    "actor": "cli",
    "details": "Gate analysis aprobado por PO: Autorización explícita vigente del PO para corregir y reintentar gates en revisión; los recibos analysis-2 y analysis-3 repiten la misma proposición en banda tras incorporar el flujo verificable, mientras causa, archivos, riesgos y clasificación aprobaron."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-04",
    "at": "2026-10-05T04:41:18.894Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-05",
    "at": "2026-10-05T05:07:01.119Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-05",
    "at": "2026-10-05T05:07:01.512Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-05",
    "at": "2026-10-05T06:12:26.422Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-10-05",
    "at": "2026-10-05T06:45:00.112Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-10-05",
    "at": "2026-10-05T06:45:00.406Z",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-10-05",
    "at": "2026-10-05T06:45:00.575Z",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-10-05",
    "at": "2026-10-05T06:45:00.739Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-10-05",
    "at": "2026-10-05T06:45:59.907Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-10-05",
    "at": "2026-10-05T06:46:00.932Z",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-014",
    "date": "2026-10-05",
    "at": "2026-10-05T06:46:01.113Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  }
]
```
