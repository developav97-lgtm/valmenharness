---
schema_version: 2
id: SECURITY-ENGINE-APROBACION-PLAN-20261005
title: Registrar la aprobación del plan con actor, fuente, frase y hash
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

# SECURITY-ENGINE-APROBACION-PLAN-20261005

## Solicitud original

Parte del sprint: Control en el código: aprobación del plan registrada, despliegue con frase consumible, escrituras autenticadas, cierre con criterios marcados y consumo fiable. Cierra con la medición de salida de S1 a S3.
- R-CTRL-001: La transición a approved DEBE exigir una aprobación del plan registrada con actor y fuente
Depende de: BUGFIX-ENGINE-FIRMA-DE-COMPUERTA-20261004.
Viene de una feature descompuesta en sprints; su plan completo está en el tickets.yaml de la feature.

### Supuestos y decisiones pendientes

<!-- Si el pedido nombra algo que el código no tiene —parámetro, permiso,
campo, bandera, columna, migración— y no lo especifica, listá cada elemento
con su pregunta antes de avanzar a análisis; el análisis no planifica sobre
la adivinanza. Si no hay ninguno, escribí «Ninguno» y seguí. -->
Ninguno.

## Descripción funcional

- Alcance: que el motor sepa **registrar** y **verificar** la aprobación de un plan como un evento del ticket con actor, fuente, frase literal y el hash del plan aprobado (R-CTRL-001, mitad de registro): una función del motor, el comando `valmen approve-plan`, la lectura de las fuentes aceptadas desde `config.yaml` y la comprobación de vigencia (la aprobación deja de valer si el plan cambia). El requisito R-CTRL-001 se cubre en dos tickets del grafo (`tickets.yaml`): este registra y verifica; `SECURITY-CORE-TRANSICION-APPROVED-20261005`, que depende de este, hace que `transition --to approved` lo **exija**. Por eso este ticket no modifica `validate.ts` ni `transition.ts` y no cambia ninguna transición.
- Usuario o rol afectado: la persona que aprueba un plan (el PO) y el agente que hoy se apoya en una frase escrita en `## Plan`, que cualquiera puede escribir.
- Comportamiento actual: `hasPlanGate` acepta una línea de `## Plan` con «aprobado explícitamente por el PO»; es texto libre sin actor, fuente ni vínculo con el contenido aprobado, y el propio agente puede escribirla (la corrida delegada lo hace citando la delegación).
- Comportamiento esperado: `valmen approve-plan --id X --actor <nombre> --source <fuente> --quote "<frase>"` anexa al ticket un evento `plan-approved` con actor, fuente, frase y el hash del `## Plan` vigente; una función de lectura devuelve, para un ticket, si hay aprobación vigente (la última coincide con el hash actual) o por qué no. La fuente debe estar entre las que el proyecto declara en `plan-approval-sources`; sin declaración rige `mission-control` y `cli`. Una sesión marcada como desatendida no puede registrarla.

## Diagnóstico

- Archivos y flujo investigados: la exigencia actual vive en `hasPlanGate` (`packages/core/src/validate.ts:253`), que solo lee líneas del plan, y en la rama de `approved` de `transition` (`packages/engine/src/transition.ts:354`); `packages/cli/src/delegation.ts:240` escribe esa misma línea en nombre de la delegación. Los eventos del ticket se anexan con el patrón de `packages/engine/src/append.ts` y las decisiones humanas de compuerta ya dejan un evento citando el recibo (`packages/engine/src/receipts.ts:158`), de modo que el formato de evento firmado tiene precedente. No existe hoy una marca de sesión desatendida: `packages/engine/src/journey-dispatch.ts` despacha pero no identifica al ejecutor.
- Causa raíz o hipótesis: la aprobación se modeló como una propiedad del texto del plan y no como un hecho con autor; por eso no tiene actor, no se ata al contenido y el agente puede producirla. Comprobado: `hasPlanGate` no consulta ningún evento ni hash. La investigación identifica además los archivos nuevos que el plan crea (`plan-approval.ts`, la función de fuentes en `config.ts` y el comando en `main.ts`) porque ningún módulo del motor registra aprobaciones hoy. Hipótesis a decidir con el PO: cómo se reconoce una sesión desatendida; se propone una variable de entorno `VALMEN_UNATTENDED=1` que fijan los despachadores, advirtiendo que es una barrera de proceso y no criptográfica —quien controla el entorno puede quitarla—, y que la defensa fuerte es que las fuentes aceptadas excluyan al ejecutor.
- Riesgos y compatibilidad: es un cambio de seguridad del flujo de aprobación; por eso exige tu aprobación del plan. No toca tickets existentes: los que ya pasaron por `approved` siguen validando porque este ticket no cambia `transition` ni `validate`. El hash se calcula sobre el texto normalizado de `## Plan` sin la línea «Gate de plan y aprobación» (si no, escribirla invalidaría la aprobación). La corrida delegada seguirá funcionando hasta el ticket siguiente, donde se decide cómo registra su aprobación citando las palabras del PO como fuente `delegacion`.
- Impactos de sync, migración, Docker o despliegue: ninguno.

## Plan

- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan), Juan Andrade, 2026-10-06: «Escojo la A aprobar los 3 planes»; compuerta `plan` aprobada por el evaluador y registrada en su recibo.
- Alcance: el registro y la verificación de la aprobación del plan, el comando y la lectura de fuentes aceptadas. Exclusiones: exigirla en `transition`, la corrida delegada, y cualquier cambio a tickets ya aprobados.
- Pasos ordenados:
  1. Crear `packages/engine/src/plan-approval.ts` con `hashDelPlan(document)` (sha256 del `## Plan` normalizado, sin la línea de gate), `registrarAprobacionDePlan(request)` (valida actor y frase no vacíos, fuente aceptada y sesión no desatendida; anexa el evento `plan-approved` con actor, fuente, frase y hash) y `aprobacionDePlanVigente(document)` (lee **solo los eventos** `plan-approved`, nunca las líneas de `## Plan`, y devuelve `vigente`, `sin-aprobacion` o `plan-cambiado` con el motivo; una frase de aprobación escrita en el plan da `sin-aprobacion`).
  2. En `packages/adapter/src/config.ts` agregar `readPlanApprovalSources(config)` (clave `plan-approval-sources`, por defecto `mission-control` y `cli`; un valor vacío o inválido falla nombrando la clave).
  3. Agregar el comando `approve-plan --id <ID> --actor <nombre> --source <fuente> --quote "<frase>"` en `packages/cli/src/main.ts` y `commands.ts`, que rechaza una sesión con `VALMEN_UNATTENDED` fijada y devuelve el código de invariante.
  4. Exportar el módulo desde `packages/engine/src/index.ts` y documentar la clave y el comando en la skill `planificacion` (fuente en `.valmen/skills/planificacion/SKILL.md`).
  5. Crear `tests/aprobacion-de-plan.test.ts`: registro correcto con los cuatro datos, rechazo de fuente no declarada, de frase vacía y de sesión desatendida, vigencia tras editar el plan (`plan-cambiado`), que un ticket con la frase «aprobado explícitamente por el PO» en `## Plan` y sin evento da `sin-aprobacion`, que escribir la línea de gate no invalida, y que un ticket ya aprobado sigue validando; correr `npx vitest run tests/aprobacion-de-plan.test.ts`, la suite completa y `npx tsc --noEmit -p tsconfig.json`.
- Rollback: revertir el commit del ticket; el evento nuevo es aditivo y ningún flujo existente lo lee todavía.

## Criterios de aceptación

- [x] Registrar la aprobación anexa un evento con actor, fuente, frase literal y el hash del plan
      <!-- test: npx vitest run tests/aprobacion-de-plan.test.ts -->
- [x] Una fuente que el proyecto no declara se rechaza, y sin declaración rigen `mission-control` y `cli`
      <!-- test: npx vitest run tests/aprobacion-de-plan.test.ts -->
- [x] Una sesión marcada como desatendida no puede registrar la aprobación
      <!-- test: npx vitest run tests/aprobacion-de-plan.test.ts -->
- [x] Si el plan cambia después de la aprobación, esta deja de valer y el motivo lo dice
      <!-- test: npx vitest run tests/aprobacion-de-plan.test.ts -->
- [x] Una frase escrita en `## Plan` no cuenta como aprobación registrada
      <!-- test: npx vitest run tests/aprobacion-de-plan.test.ts -->
- [x] Los tickets que ya pasaron por `approved` siguen validando
      <!-- test: npx vitest run tests/aprobacion-de-plan.test.ts -->

## Puntos

```json
[]
```

## Implementación

- `packages/engine/src/plan-approval.ts` (nuevo): `hashDelPlan` (sha256 del `## Plan` normalizado, sin la línea de gate), `registrarAprobacionDePlan` (valida actor, frase, fuente aceptada y sesión no desatendida; anexa el evento `plan-approved` con actor, fuente, frase y hash) y `aprobacionDePlanVigente` (lee solo eventos: `vigente`, `sin-aprobacion` o `plan-cambiado` con motivo).
- `packages/adapter/src/config.ts`: `readPlanApprovalSources` (clave `plan-approval-sources`, por defecto `mission-control` y `cli`; vacía o inválida falla). `packages/engine/src/discovery.ts`: `planApprovalSources`. `packages/engine/src/index.ts`: exporta el módulo.
- `packages/cli/src/commands.ts` y `main.ts`: comando `approve-plan --id --actor [--source] --quote` y su ayuda.
- `tests/aprobacion-de-plan.test.ts` (nuevo, 11 pruebas).
- Desviación del plan, registrada: la documentación de la clave y del comando en la skill `planificacion` (paso 4) se difiere al ticket siguiente de la cadena, donde la aprobación registrada pasa a ser obligatoria; editarla ahora obliga a un `valmen sync` que reescribe la configuración personal de Claude Code de este repositorio.

## Pruebas

Desde la raíz del repositorio, Node 24, sin red:

1. `npx vitest run tests/aprobacion-de-plan.test.ts` — esperado: 11 pruebas pasan.
2. `npx vitest run` — esperado: 168 archivos pasan y 1 omitido; 2498 pruebas pasan, 0 fallan.
3. `npx tsc --noEmit -p tsconfig.json` — sin salida.

Resultado de la ejecución del agente (2026-10-06): los tres comandos dieron lo esperado.

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
    "at": "2026-10-06T01:51:49.791Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-06",
    "at": "2026-10-07T02:26:00.793Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-06",
    "at": "2026-10-07T02:26:21.197Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-06",
    "at": "2026-10-07T02:50:28.818Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-06",
    "at": "2026-10-07T02:50:29.103Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-06",
    "at": "2026-10-07T02:53:33.633Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  }
]
```
