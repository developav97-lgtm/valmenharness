---
schema_version: 2
id: FEATURE-GATE-VERIFY-DEV-20260926
title: Validar criterios de interfaz en ambiente dev
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
updated: 2026-10-04
related_ticket: null
target_release: null
released_in: null
---

# FEATURE-GATE-VERIFY-DEV-20260926

## Solicitud original

Parte del sprint: Declarar, consultar y validar criterios de interfaz desde artefactos del proyecto.
- R-S4-005: El tercer verbo: validación en el ambiente desplegado — Un criterio de interfaz DEBE poder declararse `<!-- verify: dev -->`; la persona prueba la pantalla en el ambiente de desarrollo desplegado. El proyecto declara en `.valmen/config.yaml` la URL de ese ambiente y, opcionalmente, la rama que lo alimenta. Sin ambiente declarado, el criterio se rechaza; la confirmación humana en dev es obligatoria antes de QA y excluye la integración autónoma posterior.
Depende de: FEATURE-GATE-CRITERIO-PLAYWRIGHT-20260926, FEATURE-GATE-SPECS-REPOSITORIO-20260926.
Viene de una feature descompuesta en sprints; su plan completo está en el tickets.yaml de la feature.

## Descripción funcional

- Alcance: el contrato de anotaciones de criterios en `packages/gate/src/dynamic.ts`, la lectura estricta de `verify-dev:` en `packages/adapter/src/config.ts`, su acceso desde `packages/engine/src/discovery.ts`, la validación previa del gate mecánico en `packages/engine/src/gate.ts`, la comprobación de transición a QA en `packages/core/src/validate.ts` y la documentación de `docs/03-GATES.md`. Queda fuera ejecutar o sondear la URL, configurar un ambiente real de este repositorio, y la decisión de integración autónoma de R-S5-006: este ticket solo deja la señal `verify: dev` inequívoca para que ese ticket posterior la consuma.
- Usuario o rol afectado: quien redacta criterios de una pantalla y la persona que los prueba en dev. El primero puede declarar que una pantalla necesita un entorno desplegado; la segunda conserva la decisión y deja una confirmación auditable que no se confunde con una prueba local ni con un test de comando.
- Comportamiento actual: `extractCriteriaSpecs` toma cualquier `<!-- verify: ... -->` como `manual: true` (`packages/gate/src/dynamic.ts:61-104`), sin conservar si el valor fue `dev`; `revisarCriteriosVerificables` acepta cualquier criterio manual sin consultar configuración (`packages/engine/src/gate.ts:156-183`); `hasRecordedUserTestOutcome` acepta una línea genérica de resultado del PO para cualquier ticket (`packages/core/src/validate.ts:289-301`). No existe `verify-dev:` en el parser ni en los lectores del motor. Por tanto, un criterio `verify: dev` no exige URL, no conserva su semántica y puede avanzar a QA con un resultado que no acredita la prueba en dev.
- Comportamiento esperado: `<!-- verify: dev -->` se reconoce explícitamente, sigue siendo una validación humana y no genera comando. El proyecto declara `verify-dev.url` obligatoria y `verify-dev.branch` opcional; una sección mal formada falla nombrando su clave y un criterio dev sin sección se rechaza antes de ejecutar comandos o consultar un modelo. Si el ticket contiene ese criterio, la transición a `in_qa` requiere un resultado del PO que identifique la validación en dev; las anotaciones `verify: manual` y `test:` conservan su comportamiento actual. La señal queda disponible sin adelantar la política de integración de R-S5-006.

## Diagnóstico

- Archivos y flujo investigados: `packages/gate/src/dynamic.ts:36-104` define `CriterionSpec` y extrae las anotaciones; `packages/engine/src/gate.ts:147-183` exige que cada criterio declare test o validación humana y `:301-410` prepara los checks de `qa-mechanical`; `packages/adapter/src/config.ts:80-87` ofrece el lector estricto de submapas y `:123-218` es el patrón de una sección opt-in con campos validados; `packages/engine/src/discovery.ts:91-177` concentra lectores de configuración desde disco; `packages/core/src/validate.ts:285-302` y `packages/engine/src/transition.ts:267-271` protegen el paso a QA. R-S5-006, en `.valmen/features/evolucion-harness/spec/s5-autonomia/spec.md`, consumirá después la presencia de `verify: manual` o `verify: dev` para excluir integración automática; no existe aún ese motor de integración.
- Causa raíz o hipótesis: el síntoma verificable es que hoy `verify: dev` se acepta exactamente igual que `verify: manual`: no se exige URL de ambiente y un resultado genérico del PO deja pasar el ticket a QA aunque nadie haya acreditado la pantalla desplegada. El requisito quedó truncado durante la materialización, pero la fuente canónica completa en `.valmen/features/evolucion-harness/spec/s4-playwright/spec.md:41-63` confirma el contrato. El hueco de código tiene una causa concreta: `verify` se modela como booleano y borra el valor de la anotación. Al desaparecer `dev`, las capas posteriores solo pueden saber que una persona prueba algo, no que necesita ambiente configurado ni que el resultado debe acreditar ese ambiente. La búsqueda de memoria `valmen memory search 'gate criterios interfaz ambiente desarrollo verify dev playwright' --limite 10` devolvió AP-005 y AP-004: se conserva la separación entre reglas aplicables por código y veredicto semántico, y no se usa una contradicción del evaluador como motivo para saltar esta validación mecánica.
- Riesgos y compatibilidad: añadir `dev` sin reemplazar `manual` preserva tickets existentes. Exigir la URL solo cuando hay criterios `verify: dev` evita que un proyecto que no usa esa modalidad tenga que declarar un ambiente. La URL se trata como metadato de configuración, no como instrucción para hacer red ni como evidencia de que el ambiente está sano. El requisito de que el resultado mencione dev solo aplica al ticket que declaró ese verbo; así no endurece el flujo de criterios manuales existentes. La exclusión de integración se documenta como límite y queda para R-S5-006, evitando duplicar una política futura.
- Impactos de sync, migración, Docker o despliegue: ninguno. Se modifica el contrato local del harness y su validación; no hay sincronización, migración, contenedor, autenticación ni despliegue de un proyecto adoptado.

## Plan

- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan). Autorización vigente: «si pasa se aprueba el plan directamente»; el recibo `GR-20261004-plan` aprobó el plan.
- Pasos ordenados:
  1. Para el criterio 1, extender `CriterionSpec` y `extractCriteriaSpecs` en `packages/gate/src/dynamic.ts` con `dev: boolean`: `<!-- verify: dev -->` conserva la modalidad humana explícita, `<!-- verify: manual -->` sigue igual y ninguna de las dos genera un comando de shell.
  2. Para el criterio 2, añadir en `packages/adapter/src/config.ts` `VerifyDevConfig` y `readVerifyDevConfig`: `verify-dev.url` es un texto obligatorio no vacío, `verify-dev.branch` es un texto opcional, y un mapa/valor inválido falla nombrando `verify-dev.url` o `verify-dev.branch`; exponer la misma sección desde `packages/engine/src/discovery.ts` como `verifyDevConfig(root)`.
  3. Para el criterio 3, pasar `verifyDevConfig(root)` a `revisarCriteriosVerificables` en `packages/engine/src/gate.ts`; si hay un criterio `dev` y la sección no existe, devolver el rechazo antes de preparar comandos, ejecutar tests o llamar un modelo. Mantener `review` cuando todos los criterios son humanos y la ejecución habitual de los `test:` autorizados.
  4. Para el criterio 4, en `packages/core/src/validate.ts` detectar si los criterios incluyen `<!-- verify: dev -->`; solo en ese caso `hasRecordedUserTestOutcome` acepta el resultado del PO cuando identifica explícitamente que la prueba fue en dev. `packages/engine/src/transition.ts` ya consume ese contrato para bloquear `awaiting_user_tests → in_qa`, sin endurecer tickets que no declaran dev.
  5. Para los criterios 1 a 4, crear `tests/gate-verify-dev.test.ts` con extracción, configuración válida/inválida, rechazo de `qa-mechanical`, mezcla con manual/test y ambas rutas de transición a QA. El caso de confirmación genérica debe fallar antes de la corrección, para probar la regresión.
  6. Para el criterio 5, actualizar `docs/03-GATES.md` con sintaxis, configuración, confirmación humana y el límite explícito: esta señal queda disponible para que R-S5-006 excluya integración autónoma, pero este ticket no implementa ni modifica dicha integración.
- Rollback: revertir los cambios de contrato, lectura y validación junto con sus pruebas y documentación. Los tickets ya existentes permanecen compatibles porque no se reescriben y nunca declaran `verify: dev` de forma implícita.

## Criterios de aceptación

- [x] Un criterio con la modalidad `verify: dev` se reconoce como validación humana explícita y no genera un comando.
      <!-- test: npx vitest run tests/gate-verify-dev.test.ts -->
- [x] `verify-dev.url` es obligatoria y `verify-dev.branch` opcional; sus formas inválidas fallan nombrando la clave de configuración.
      <!-- test: npx vitest run tests/gate-verify-dev.test.ts -->
- [x] El gate `qa-mechanical` rechaza un criterio `verify: dev` sin ambiente declarado y conserva el comportamiento de `verify: manual` y `test:`.
      <!-- test: npx vitest run tests/gate-verify-dev.test.ts -->
- [x] Un ticket que declara `verify: dev` no puede pasar a QA con un resultado genérico: requiere confirmación del PO que identifique la validación en dev.
      <!-- test: npx vitest run tests/gate-verify-dev.test.ts -->
- [x] La documentación explica la declaración, sus límites y que R-S5-006 decidirá la exclusión de integración autónoma.
      <!-- test: npx vitest run tests/gate-verify-dev.test.ts -->

## Puntos

```json
[]
```

## Implementación

- Se añadió `dev` al contrato de `CriterionSpec` en `packages/gate/src/dynamic.ts`. La extracción mantiene `manual: true` para las dos modalidades humanas y conserva `dev: true` solo para `<!-- verify: dev -->`, por lo que no se generan comandos ni se cambia el comportamiento de `verify: manual`.
- `packages/adapter/src/config.ts` ahora lee `verify-dev:` con `url` HTTP(S) obligatoria y `branch` opcional; `packages/engine/src/discovery.ts` expone esa lectura al motor. La sección sigue siendo opt-in: un proyecto sin criterios dev no necesita configurarla.
- `packages/engine/src/gate.ts` rechaza `verify: dev` sin ambiente declarado antes de ejecutar comandos o consultar un modelo. Con ambiente declarado sigue el recorrido humano habitual: el gate queda en revisión si no hay comandos, nunca prueba ni navega la URL.
- `packages/core/src/validate.ts` exige que el resultado del PO mencione `dev` cuando el ticket declaró esa modalidad, y `packages/engine/src/transition.ts` aplica ese contrato antes de pasar a QA. Los tickets sin `verify: dev` siguen aceptando el formato de resultado existente.
- Se documentó sintaxis, configuración, confirmación y límite de R-S5-006 en `docs/03-GATES.md`. La exclusión efectiva de integración autónoma queda deliberadamente para el ticket posterior que implementa R-S5-006.

## Pruebas

- Directorio: `/Users/juanandrade/Desktop/ValmenHarness`.
- Comando focal: `npx vitest run tests/gate-verify-dev.test.ts`.
  Resultado: pasó (5 pruebas). Cubre extracción explícita, configuración válida e inválida, rechazo sin ambiente, preservación de `verify: manual` y bloqueo del resultado genérico antes de QA.
- Regresión vecina: `npx vitest run tests/gate-mecanico.test.ts tests/gate-playwright.test.ts tests/config-playwright.test.ts tests/gate-playwright-plan.test.ts`.
  Resultado: pasó (61 pruebas). Conserva el contrato mecánico, el verbo Playwright y la capacidad de interfaz anterior.
- Compilación: `npm run build`.
  Resultado: pasó; TypeScript construyó los paquetes y actualizó la copia de interfaz.
- Suite completa: `npx vitest run`.
  Resultado: pasó (118 archivos, 1 omitido; 1869 pruebas aprobadas y 48 omitidas).
- Validación manual: no aplica una pantalla ni una URL real a este ticket. Para un proyecto que adopte `verify: dev`, declarar `verify-dev.url`, incluir un criterio dev y confirmar en `Pruebas` con `Resultado del PO: validado en dev y conforme`; el motor debe permitir `in_qa` solo con esa confirmación.
- Resultado comunicado por el PO: autorizó cerrar si las pruebas corridas pasan; la compilación, la suite completa y el gate mecánico pasaron conforme.

## QA

```json
[
  {
    "id": "QA-001",
    "date": "2026-10-04",
    "build_reference": "worktree:sha256:c62b7087440637a135affe661e0ce8b7c8b6cb1b1ea9751b1fab8e4aa889e5d1",
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
    "po_confirmation": "El PO autorizó cerrar si las pruebas corridas pasan; compilación, suite completa y gate mecánico aprobados."
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
    "technical_summary": "Se añadió el contrato verify: dev, configuración estricta, rechazo preventivo y validación de transición; build y 1869 pruebas pasaron.",
    "functional_summary": "Los proyectos ya pueden declarar una validación humana en ambiente dev con URL auditada y no confundirla con una prueba manual genérica.",
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
    "notes": "La sesión de Codex atendió varios tickets del feature control-jornadas-ejecucion; no hay un agregado atribuible sin inventar reparto. El gasto completo queda en la sesión compartida y los recibos de este ticket registran USD 0.000214 de gates.",
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
    "at": "2026-10-04T18:44:14.353Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-04",
    "at": "2026-10-04T18:46:00.900Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-04",
    "at": "2026-10-04T18:49:29.256Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-04",
    "at": "2026-10-04T18:49:29.806Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-04",
    "at": "2026-10-04T18:55:57.736Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-04",
    "at": "2026-10-04T18:56:07.306Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-10-04",
    "at": "2026-10-04T18:56:27.352Z",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-10-04",
    "at": "2026-10-04T18:56:27.889Z",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-10-04",
    "at": "2026-10-04T18:56:28.413Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-10-04",
    "at": "2026-10-04T18:57:03.080Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-10-04",
    "at": "2026-10-04T18:57:04.236Z",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-10-04",
    "at": "2026-10-04T18:57:04.801Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  }
]
```
