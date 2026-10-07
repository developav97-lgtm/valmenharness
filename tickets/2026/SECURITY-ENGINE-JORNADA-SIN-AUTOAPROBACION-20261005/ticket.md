---
schema_version: 2
id: SECURITY-ENGINE-JORNADA-SIN-AUTOAPROBACION-20261005
title: Retirar las aprobaciones por prompt y las transiciones ilegales de las plantillas
type: SECURITY
module: ENGINE
workflow_status: awaiting_user_tests
qa_status: pending
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

# SECURITY-ENGINE-JORNADA-SIN-AUTOAPROBACION-20261005

## Solicitud original

Parte del sprint: Jornada autónoma sobre el motor de jornadas, después de la salida de S1 a S3: preparación hasta el plan, aprobación en lote, ejecución hasta las pruebas, topes, avisos y commit por ticket sin push.
- R-JORN-010: Una jornada NO DEBE aprobar análisis, plan ni QA por instrucción del prompt
Depende de: FEATURE-ENGINE-JORNADA-PREPARACION-20261005, FEATURE-ENGINE-JORNADA-EJECUCION-20261005.
Viene de una feature descompuesta en sprints; su plan completo está en el tickets.yaml de la feature.

### Supuestos y decisiones pendientes

<!-- Si el pedido nombra algo que el código no tiene —parámetro, permiso,
campo, bandera, columna, migración— y no lo especifica, listá cada elemento
con su pregunta antes de avanzar a análisis; el análisis no planifica sobre
la adivinanza. Si no hay ninguno, escribí «Ninguno» y seguí. -->
Ninguno.

## Descripción funcional

- Alcance: que una jornada no pueda aprobar análisis, plan ni QA por instrucción de un prompt (R-JORN-010), y que lo garantice el **código**, no el texto: (1) la plantilla de prompt de las tandas programadas deja de ordenar aprobar compuertas, escribir la aprobación del responsable, cerrar QA «como delegado» y mover un ticket a un estado que no es legal; (2) una sesión desatendida (`VALMEN_UNATTENDED`) no puede registrar decisiones humanas de compuerta ni aprobar un ciclo de QA; (3) la elegibilidad del run autónomo exige la aprobación **registrada** del plan y no la línea escrita en el plan. Fuera de alcance: la política de QA por agente (S6) y la aprobación en lote.
- Usuario o rol afectado: el responsable que delega trabajo a sesiones sin persona delante y necesita que ninguna pueda firmarse sola.
- Comportamiento actual: `templates/programar/prompt-eslabon.md` manda aprobar la compuerta de análisis y la de plan con `valmen gate-decide`, escribir la línea de aprobación del PO como «delegada», cerrar el QA con una confirmación delegada y pasar de `in_progress` a `in_qa` (un salto que el motor rechaza); el run autónomo (`ineligibility` en `packages/engine/src/autonomous-run.ts`) da por aprobado un plan con la línea escrita; y nada impide que una sesión con `VALMEN_UNATTENDED` ejecute `gate-decide` o `qa-close --result approved`.
- Comportamiento esperado: la plantilla pide solo transiciones legales —preparar hasta `planned` y detenerse; ejecutar hasta `awaiting_user_tests`— y dice que toda aprobación es de una persona; `gate-decide`, `qa-close` y `add-retest` con resultado aprobado se rechazan en una sesión desatendida con un mensaje que lo explica; el run autónomo solo admite un plan con aprobación registrada vigente; y una prueba recorre todas las plantillas de prompt de la jornada y falla si alguna ordena aprobar o pide una transición ilegal.

## Diagnóstico

- Archivos y flujo investigados: la plantilla `templates/programar/prompt-eslabon.md` (sección B «aprobá el análisis vos», D «aprobación delegada del plan», H «movelo a `in_qa`», I «`qa-close` con la delegación») la rellena `scripts/programar-tickets.mjs` con los marcadores `AUTORIZACION_*` (líneas 335-337); `promptFor` (ejecución) y `promptDePreparacion` (`packages/engine/src/journey-preparation.ts`) ya no ordenan aprobar; las decisiones humanas de compuerta pasan por `recordHumanDecision` (`packages/server/src/gates.ts:596`) que usan `gate-decide` y Mission Control; el cierre de un ciclo de QA y los retests son `qaClose` y `addRetest` (`packages/engine/src/append.ts:608` y `:685`); la barrera de sesión desatendida es `UNATTENDED_ENV` en `packages/engine/src/plan-approval.ts`, que el despacho ya fija en el entorno de los ejecutores; la elegibilidad del run está en `packages/engine/src/autonomous-run.ts`, que usa `hasPlanGate` (la línea del plan) para el requisito `plan-approved`.
- Causa raíz o hipótesis: las plantillas se escribieron para una corrida **atendida**, donde el responsable delegó por escrito y la sesión podía firmar citándolo; al pasar a jornadas desatendidas ese permiso viaja en el texto del prompt y nada lo frena en el código. Comprobado: no hay ninguna referencia a `UNATTENDED_ENV` fuera de la aprobación del plan y del entorno del ejecutor, y el motor rechaza hoy el salto `in_progress → in_qa` que la plantilla pide. La corrida delegada atendida (`valmen delegation`, con las palabras del responsable registradas) no se toca: sigue siendo el camino legítimo de una sesión con persona.
- Riesgos y compatibilidad: es una barrera de seguridad, por eso exige tu aprobación del plan. Quien tenga tandas programadas con la plantilla vieja deja de poder aprobar por delegación desde esas sesiones; las tandas ya agendadas en cron conservan su prompt hasta reprogramarlas. La barrera por entorno es de proceso y no criptográfica —quien controla el entorno puede quitarla—; la defensa fuerte es que las fuentes de aprobación registradas excluyan al ejecutor, y la prueba de las plantillas es la red de seguridad. Consumidores comprobados con búsqueda: `recordHumanDecision` lo llaman `packages/cli/src/main.ts` (gate-decide), `packages/cli/src/delegation.ts`, `packages/cli/src/hermes.ts` y `packages/server/src/server.ts`; `qaClose` y `addRetest` los llaman `packages/cli/src/main.ts`, `packages/cli/src/delegation.ts` y las herramientas MCP; la corrida delegada atendida no fija `VALMEN_UNATTENDED`, así que no se ve afectada.
- Impactos de sync, migración, Docker o despliegue: ninguno.

## Plan

- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan), Juan Andrade, 2026-10-06: «si apruebo los planes»; compuerta `plan` aprobada por el evaluador y registrada en su recibo.
- Alcance: la plantilla de prompt, la barrera en código de las decisiones humanas desatendidas, la elegibilidad por aprobación registrada y la prueba que recorre las plantillas. Exclusiones: QA por política, aprobación en lote y las tandas ya agendadas.
- Pasos ordenados:
  1. Reescribir `templates/programar/prompt-eslabon.md` sin las secciones que aprueban: preparar hasta `planned` y detenerse, ejecutar hasta `awaiting_user_tests`, y declarar que toda aprobación es de una persona o de la política del proyecto; quitar el uso de los marcadores `AUTORIZACION_*` en `scripts/programar-tickets.mjs` y mantener el resto de los marcadores.
  2. Crear `assertSesionAtendida(accion)` en `packages/engine/src/plan-approval.ts` (falla con código de invariante si `VALMEN_UNATTENDED` está fijada) y llamarla en `recordHumanDecision` de `packages/server/src/gates.ts`, en `qaClose` y en `addRetest` de `packages/engine/src/append.ts` cuando el resultado es aprobado, con un mensaje que dice que esa decisión es de una persona.
  3. En `packages/engine/src/autonomous-run.ts` reemplazar `hasPlanGate` por `aprobacionDePlanVigente` en la elegibilidad del requisito `plan-approved` y ajustar su motivo («no tiene la aprobación del plan registrada»); exportar `promptFor` para poder probarlo.
  4. Crear `tests/jornada-sin-autoaprobacion.test.ts` con: la plantilla, `promptFor` y `promptDePreparacion` no contienen órdenes de aprobar (`gate-decide`, `--decision approve`, `qa-close`, «delegad», «aprobá») ni pasos a `in_qa`; una sesión con `VALMEN_UNATTENDED` no puede ejecutar `recordHumanDecision`, `qaClose` aprobado ni `addRetest` aprobado, y sí lo hace una sin la marca; un plan con la línea escrita pero sin aprobación registrada no es elegible para el run; correr esas pruebas, las de delegación, la suite completa con `npx vitest run` y `npx tsc --noEmit -p tsconfig.json`.
- Rollback: revertir el commit del ticket; la plantilla vieja vuelve y la barrera desaparece, sin datos que migrar.

## Criterios de aceptación

- [x] Ninguna plantilla de prompt de la jornada ordena aprobar compuertas, escribir la aprobación del responsable, cerrar QA como delegado ni mover un ticket a un estado ilegal
      <!-- test: npx vitest run tests/jornada-sin-autoaprobacion.test.ts -->
- [x] Una sesión con `VALMEN_UNATTENDED` no puede registrar una decisión humana de compuerta ni aprobar un ciclo de QA o un retest
      <!-- test: npx vitest run tests/jornada-sin-autoaprobacion.test.ts -->
- [x] La misma operación sin la marca de sesión desatendida sigue funcionando para una persona
      <!-- test: npx vitest run tests/jornada-sin-autoaprobacion.test.ts -->
- [x] El run autónomo solo considera aprobado un plan con la aprobación registrada vigente, no uno con la línea escrita
      <!-- test: npx vitest run tests/jornada-sin-autoaprobacion.test.ts tests/autonomous-run.test.ts -->

## Puntos

```json
[]
```

## Implementación

- `templates/programar/prompt-eslabon.md`: reescrita. Dice quién decide (la sesión prepara y ejecuta, nunca decide; corre como desatendida), pide solo transiciones legales —`intake → analyzed → planned` y `approved → in_progress → awaiting_user_tests`—, manda detenerse en `planned` y entrega el veredicto con opciones y efecto si una compuerta queda en REVIEW o BLOCK, y termina en `awaiting_user_tests`. Desaparecen las secciones que aprobaban compuertas con `gate-decide`, escribían la aprobación «delegada», cerraban QA con `qa-close` y pasaban a `in_qa`. Conserva los marcadores que rellena el script. `scripts/programar-tickets.mjs`: quitadas las banderas y marcadores `AUTORIZACION_*`, que ya no existen.
- `packages/engine/src/plan-approval.ts`: `assertSesionAtendida`. Se usa en `recordHumanDecision` (`packages/server/src/gates.ts`), en `qaClose` y en `addRetest` aprobados (`packages/engine/src/append.ts`): una sesión con `VALMEN_UNATTENDED` los rechaza diciendo que esa decisión es de una persona; sin la marca siguen funcionando. La corrida delegada atendida no se ve afectada.
- `packages/engine/src/autonomous-run.ts`: la elegibilidad `plan-approved` exige `aprobacionDePlanVigente` (la aprobación registrada con actor, fuente y hash), no la línea del plan; `promptFor` exportado.
- Pruebas: `tests/jornada-sin-autoaprobacion.test.ts` (nuevo, 10; la guarda de plantillas detecta las siete clases de orden prohibida en la plantilla vieja y ninguna en las nuevas). `tests/helpers/fixtures.ts`: los tickets en `approved` e `in_progress` llevan por defecto el evento de aprobación registrada, con la opción `aprobacionRegistrada: false` para el caso heredado.
- Efecto a tener en cuenta: las tandas ya agendadas en cron conservan el prompt viejo hasta reprogramarlas; reprogramarlas con la plantilla nueva es lo que quita el permiso de aprobar.

## Pruebas

Desde la raíz del repositorio, Node 24, sin red:

1. `npx vitest run tests/jornada-sin-autoaprobacion.test.ts tests/autonomous-run.test.ts tests/aprobacion-de-plan.test.ts` — esperado: todas pasan.
2. `npx vitest run` — esperado: 182 archivos pasan y 1 omitido; 2636 pruebas pasan, 0 fallan.
3. `npx tsc --noEmit -p tsconfig.json` — sin salida.
4. Manual (responsable): leer `templates/programar/prompt-eslabon.md` y confirmar que ninguna instrucción aprueba, delega ni salta estados; reprogramar las tandas agendadas con la plantilla nueva.

Resultado de la ejecución del agente (2026-10-06): 1–3 dieron lo esperado.

## QA

```json
[]
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
[]
```

## Consumo de IA

```json
[]
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
    "at": "2026-10-06T01:51:51.019Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-06",
    "at": "2026-10-07T04:04:57.817Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-06",
    "at": "2026-10-07T04:05:20.981Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-06",
    "at": "2026-10-07T04:12:25.125Z",
    "action": "plan-approved",
    "actor": "cli",
    "details": "{\"actor\":\"Juan Andrade\",\"source\":\"cli\",\"quote\":\"si apruebo los planes\",\"planHash\":\"sha256:4f2d262b7c96b7686458090fb2f3d830d76729350a4d2532f88942fc9e681b72\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-06",
    "at": "2026-10-07T04:12:25.449Z",
    "action": "plan-approval-verified",
    "actor": "cli",
    "details": "Aprobación del plan vigente: Juan Andrade (fuente cli), plan sha256:4f2d262b7c96b7686458090fb2f3d830d76729350a4d2532f88942fc9e681b72."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-06",
    "at": "2026-10-07T04:12:25.449Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-06",
    "at": "2026-10-07T04:12:25.716Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-10-06",
    "at": "2026-10-07T04:19:47.922Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  }
]
```
