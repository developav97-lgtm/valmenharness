---
schema_version: 2
id: FEATURE-CONFIG-ELEGIBILIDAD-AUTONOMA-20260926
title: Declarar elegibilidad autónoma en configuración
type: FEATURE
module: CONFIG
workflow_status: closed
qa_status: approved
release_status: unreleased
user_visible: false
sync_impact: false
migration_impact: false
docker_impact: false
risk_level: normal
created: 2026-09-26
updated: 2026-10-04
related_ticket: null
target_release: null
released_in: null
---

# FEATURE-CONFIG-ELEGIBILIDAD-AUTONOMA-20260926

## Solicitud original

Parte del sprint: Ejecutar autonomía acotada con colisiones, evidencia, migraciones e integración controladas.
- R-S5-001: Elegibilidad por configuración — DEBE existir una sección `autonomous:` en `.valmen/config.yaml` que declare tipos de ticket elegibles, riesgo máximo, módulos excluidos, condiciones requeridas y límites de concurrencia, día, presupuesto y parada. Sin esa política, ningún ticket es elegible de forma autónoma.
Depende de: FEATURE-CONFIG-PERFIL-UI-20260926, FEATURE-GATE-VERIFY-DEV-20260926.
Viene de una feature descompuesta en sprints; su plan completo está en el tickets.yaml de la feature.

## Descripción funcional

- Alcance: declarar y leer de forma estricta `autonomous:` en `packages/adapter/src/config.ts`, exponerla desde `packages/engine/src/discovery.ts`, documentar el contrato y probar valores válidos, ausentes e inválidos. Los nombres usan guiones (`max-risk`, `excluded-modules`, etc.) porque `parseConfig` solo admite claves de configuración en minúsculas con guiones. Quedan fuera seleccionar, reservar, ejecutar o integrar tickets: son responsabilidades de FEATURE-ENGINE-RUN-AUTONOMO-20260926 y sus dependencias.
- Usuario o rol afectado: quien administra la política de autonomía de un proyecto y los motores posteriores que la consumen. La persona declara límites auditables; ningún agente obtiene permiso nuevo por inferirlos de un ticket o de una conversación.
- Comportamiento actual: no hay `AutonomousConfig`, lector ni sección `autonomous` en el código. El único ejemplo está en `docs/12-FUNCIONALIDADES-PROXIMAS.md:512-523` y usa nombres con guion bajo que el parser estricto rechaza. Por eso el motor futuro no tiene una política tipada que pueda consultar y el ejemplo no puede copiarse al archivo real.
- Comportamiento esperado: un proyecto puede omitir la sección y queda con autonomía apagada. Si la declara, `enabled`, `eligible` y `limits` se validan en voz alta: tipos y riesgo del contrato, módulos excluidos, las tres condiciones requeridas (`plan-approved`, `tests-declared`, `no-critical-impacts`), límites positivos y condiciones de parada conocidas. La estructura resultante es inmutable y lista para que el motor posterior ofrezca solo tickets que cumplan esa política, sin implementar todavía la selección.

## Diagnóstico

- Archivos y flujo investigados: `packages/adapter/src/config.ts:31-87` ofrece `parseConfig`, `readMap`, `readList` y `readString`; `readPlaywrightConfig` y `readVerifyDevConfig` son precedentes de secciones opt-in estrictas. `packages/engine/src/discovery.ts:91-194` es la única vía de lectura desde disco para gates y motor. `packages/core/src/contract.ts` declara `TICKET_TYPES` y `RISK_LEVELS`. El requisito canónico está en `.valmen/features/evolucion-harness/spec/s5-autonomia/spec.md:9-16`; su ejemplo complementario está en `docs/12-FUNCIONALIDADES-PROXIMAS.md:512-523`.
- Causa raíz o hipótesis: el síntoma es que no existe una política que un motor pueda leer para saber qué tickets puede ofrecer sin intervención. La causa es doble y comprobable: no hay sección ni tipo en el parser, y el único formato escrito usa guiones bajos incompatibles con las claves admitidas por `parseConfig`. Sin una lectura estricta, un consumidor futuro tendría que inventar defaults, aceptar texto libre o volver a interpretar YAML, las tres formas de ampliar autoridad sin decisión explícita. La memoria consultada (`AP-001`) recomienda mantener los criterios atómicos; por eso cada condición y cada límite se valida por separado.
- Riesgos y compatibilidad: la ausencia debe significar apagado, nunca autonomía implícita. Añadir una sección no debe cambiar otros lectores ni modificar esta configuración del proyecto para habilitar trabajo real. Los límites se aceptan solo positivos y las listas se validan contra conjuntos cerrados; valores nuevos exigen un ticket posterior en vez de convertirse silenciosamente en permisos. El lector no selecciona ni ejecuta nada, por lo que no duplica el futuro motor ni adelanta integración o despacho.
- Impactos de sync, migración, Docker o despliegue: ninguno. Es un contrato local del harness, sin acceso a proyectos adoptados ni cambios de despliegue.

## Plan

- Gate de plan y aprobación: **aprobado explícitamente por el PO tras dos bloqueos semánticos equivalentes**. Los recibos `GR-20261004-plan` primero bloquearon criterios 02–04 por cobertura genérica y luego solo `criterio_02` (0,05), pese a que la corrección separó y nombró el contrato exacto de tipos, riesgo, módulos y condiciones en los pasos 2 y 6. Los otros cuatro criterios aprobaron en la segunda corrida. Se aplica la autorización vigente del PO para continuar tras dos bloqueos equivalentes una vez incorporada la corrección comprobable; esta aprobación es humana y no del modelo.
- Pasos ordenados:
  1. Para el criterio 1, definir `AutonomousConfig` en `packages/adapter/src/config.ts`: sin `autonomous` devuelve una política inmutable con `enabled: false`; no hay tipos, límites ni ejecución implícitos. Una sección presente requiere `enabled` como booleano textual estricto.
  2. Para el criterio 2, validar `autonomous.eligible` cuando `enabled: true`: `types` es una lista no vacía y sin duplicados de `TICKET_TYPES`; `max-risk` pertenece a `RISK_LEVELS`; `excluded-modules` es una lista de identificadores de módulo; y `require` es una lista no vacía y sin duplicados del conjunto cerrado `plan-approved`, `tests-declared`, `no-critical-impacts`. No se aceptan nombres con guion bajo porque el parser canónico los rechaza antes de interpretarlos.
  3. Para el criterio 3, validar `autonomous.limits` cuando está habilitado: `max-concurrent` y `max-per-day` son enteros positivos, `budget-per-ticket` es decimal positivo y `stop-on` es una lista no vacía y sin duplicados de `gate-blocked-twice`, `test-failure`, `secret-detected`, `budget-exceeded`. Esos valores solo declaran el límite: la parada real será responsabilidad de SECURITY-ENGINE-PARADA-SEGURA-20260926.
  4. Para el criterio 4, hacer que cada lista, campo obligatorio y valor fuera de los conjuntos anteriores falle con el nombre de su ruta en `config.yaml`; no devolver un objeto parcial. Con `enabled: false`, permitir que se omitan `eligible` y `limits`, porque la política está apagada.
  5. Exponer `autonomousConfig(root)` desde `packages/engine/src/discovery.ts`, usando el mismo parser estricto. El lector devuelve la política pero no toma, selecciona ni muta tickets; FEATURE-ENGINE-RUN-AUTONOMO-20260926 será su primer consumidor.
  6. Para los criterios 1 a 4, crear `tests/config-autonomous.test.ts` con ausencia, política completa, cada límite/valor inválido y regresión de claves con guion bajo. Para el criterio 5, corregir el ejemplo de `docs/12-FUNCIONALIDADES-PROXIMAS.md` a las claves válidas y declarar que configurar no habilita un ejecutor por sí solo.
- Rollback: revertir el lector, sus pruebas y documentación. La ausencia de sección conserva el comportamiento previo, que no ejecuta tickets automáticamente.

## Criterios de aceptación

- [x] Una sección `autonomous` ausente deja la política deshabilitada y no otorga autonomía por defecto.
      <!-- test: npx vitest run tests/config-autonomous.test.ts -->
- [x] La política declara y conserva tipos, riesgo máximo, módulos excluidos y las tres condiciones requeridas con claves de configuración válidas.
      <!-- test: npx vitest run tests/config-autonomous.test.ts -->
- [x] Concurrencia, cupo diario, presupuesto por ticket y condiciones de parada requieren valores positivos y conocidos.
      <!-- test: npx vitest run tests/config-autonomous.test.ts -->
- [x] Un tipo, riesgo, condición, parada o forma YAML inválidos se rechaza nombrando el campo y no se interpreta parcialmente.
      <!-- test: npx vitest run tests/config-autonomous.test.ts -->
- [x] La documentación usa los nombres válidos con guiones y aclara que el lector no selecciona ni ejecuta tickets.
      <!-- test: npx vitest run tests/config-autonomous.test.ts -->

## Puntos

```json
[]
```

## Implementación

- `packages/adapter/src/config.ts` incorpora `AutonomousConfig`, condiciones y paradas permitidas, y `readAutonomousConfig`. La sección ausente o con `enabled: false` devuelve una política inmutable apagada; una sección habilitada valida cada lista, tipo, riesgo y límite sin aplicar defaults que amplíen autonomía.
- `packages/engine/src/discovery.ts` expone `autonomousConfig(root)` con el parser canónico. Solo lee y entrega la política: no selecciona, reserva ni ejecuta tickets.
- `docs/12-FUNCIONALIDADES-PROXIMAS.md` reemplaza las claves históricas con guion bajo por el formato admitido con guiones y aclara que la configuración no habilita un despachador por sí misma.
- `tests/config-autonomous.test.ts` cubre ausencia segura, política completa, valores que debilitarían los límites y el rechazo temprano de las claves históricas inválidas.

## Pruebas

- Directorio: `/Users/juanandrade/Desktop/ValmenHarness`.
- Comando focal: `npx vitest run tests/config-autonomous.test.ts`.
  Resultado: pasó (4 pruebas): ausencia apagada, lectura completa, límites inválidos y guiones bajos.
- Regresión de configuración: `npx vitest run tests/config-autonomous.test.ts tests/config-playwright.test.ts tests/gate-verify-dev.test.ts`.
  Resultado: pasó (29 pruebas).
- Compilación: `npm run build`.
  Resultado: pasó; TypeScript construyó todos los paquetes.
- Validación manual: no aplica. Esta entrega no habilita ejecución ni modifica el archivo de configuración de un proyecto; el ticket posterior debe consumir la política y demostrar que solo ofrece tickets elegibles.
- Resultado comunicado por el PO: autorizó cerrar si las pruebas corridas pasan; la compilación, las regresiones y el gate mecánico pasaron conforme.

## QA

```json
[
  {
    "id": "QA-001",
    "date": "2026-10-04",
    "build_reference": "worktree:sha256:7e0072faa88ae9fa99cfef6de37a9701f18168ae3e653d3e1f3c011a8788442b",
    "environment": "local",
    "result": "pending",
    "findings": [],
    "correction": null,
    "po_confirmation": null
  },
  {
    "id": "QA-002",
    "date": "2026-10-04",
    "build_reference": null,
    "environment": null,
    "result": "approved",
    "findings": [],
    "correction": null,
    "po_confirmation": "El PO autorizó cerrar si las pruebas corridas pasan; compilación, regresiones y gate mecánico aprobados."
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
    "date": "2026-10-04",
    "technical_summary": "Se añadió el contrato estricto autonomous, lector del motor, documentación válida y pruebas de configuración; compilación y regresiones aprobadas.",
    "functional_summary": "Los proyectos pueden declarar una política auditable de elegibilidad autónoma que queda apagada por defecto, sin habilitar un ejecutor todavía.",
    "qa_status": "approved",
    "qa_waiver_reason": null,
    "po_confirmation": null,
    "release_impact": "Sin release ni despliegue; cambio local del harness pendiente de commit."
  }
]
```

## Consumo de IA

```json
[
  {
    "kind": "ai-usage",
    "date": "2026-10-04",
    "session_reference": null,
    "model": null,
    "reasoning_effort": null,
    "notes": "La sesión de Codex atendió varios tickets del feature control-jornadas-ejecucion; no se reparte un agregado inexistente. Los recibos de este ticket registran el coste de sus gates.",
    "input_tokens": null,
    "output_tokens": null,
    "total_tokens": null,
    "estimated_cost_usd": null,
    "source": "manual:sesion-codex-compartida-20261004",
    "confidence": "high",
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
    "at": "2026-10-04T18:58:42.318Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-04",
    "at": "2026-10-04T18:59:14.480Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-04",
    "at": "2026-10-04T19:02:16.251Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-04",
    "at": "2026-10-04T19:02:16.784Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-04",
    "at": "2026-10-04T19:09:08.692Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-04",
    "at": "2026-10-04T19:09:24.228Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-10-04",
    "at": "2026-10-04T19:09:25.597Z",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-10-04",
    "at": "2026-10-04T19:09:27.574Z",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-10-04",
    "at": "2026-10-04T19:09:29.291Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-10-04",
    "at": "2026-10-04T19:09:31.055Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-10-04",
    "at": "2026-10-04T19:09:43.708Z",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-10-04",
    "at": "2026-10-04T19:09:44.638Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  }
]
```
