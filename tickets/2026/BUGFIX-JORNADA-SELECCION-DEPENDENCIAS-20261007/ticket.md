---
schema_version: 2
id: BUGFIX-JORNADA-SELECCION-DEPENDENCIAS-20261007
title: La jornada despacha tickets no elegibles y con dependencias sin cerrar
type: BUGFIX
module: JORNADA
workflow_status: awaiting_user_tests
qa_status: pending
release_status: unreleased
user_visible: false
sync_impact: false
migration_impact: false
docker_impact: false
risk_level: normal
created: 2026-10-07
updated: 2026-10-07
related_ticket: null
target_release: null
released_in: null
---

# BUGFIX-JORNADA-SELECCION-DEPENDENCIAS-20261007

## Solicitud original

Hallazgos del 2026-10-07 al correr `valmen journey advance --project valmen-harness --fase preparacion` con una jornada armada con `valmen journey plan --tickets <ids>`: 1) La selección devolvió como candidato un ticket SECURITY aunque `autonomous.eligible.types` no lo incluye; el avance quedó en «despachado… no-elegible» y no siguió con el resto. Debe saltar los tickets no elegibles (tipo, riesgo, impactos, módulos excluidos) y elegir el siguiente elegible, dejando constancia de por qué se omitió cada uno. 2) Se despachó FEATURE-ADAPTER-SKILLS-UX-20261007, cuyo `depends_on` incluye SECURITY-CLI-REVISION-SKILLS-20261007 (en intake, fuera de la jornada). La condición de inicio «dependencies» solo mira los tickets dentro de la jornada; debe tratar como bloqueante cualquier dependencia del ticket (según el registro/grafo de su feature) que no esté cerrada, esté o no en la jornada.

### Supuestos y decisiones pendientes

- Pregunta: ¿una dependencia «no cerrada» incluye `blocked` y `changes_requested`, o solo lo previo a `closed`? Respuesta del PO (2026-10-07): cualquier estado distinto de `closed` bloquea.

## Descripción funcional

- Alcance: selección y despacho de la jornada, en sus dos fases (`preparacion` y `ejecucion`).
- Usuario o rol afectado: el PO que arma y avanza la jornada (`valmen journey plan` / `valmen journey advance`).
- Comportamiento actual: (1) el primer ticket en `intake` se elige sin mirar la política de elegibilidad; al no ser elegible el avance termina y no sigue con el resto. (2) las dependencias que no van en la jornada se descartan al armarla, así que un ticket con una dependencia sin cerrar se despacha.
- Comportamiento esperado: (1) un ticket no elegible se salta, se elige el siguiente elegible y el avance informa por qué se omitió cada uno. (2) cualquier dependencia del ticket —la de la jornada y la del grafo de su feature— que no esté en `closed` lo bloquea, esté o no en la jornada.

## Diagnóstico

- Causa comprobada (con `ruta:línea`):
  - Hallazgo 1, fase preparación: `siguienteAPreparar` (`packages/engine/src/journey-preparation.ts:271-290`) elige el primer ticket en `intake` sin mirar tipo, riesgo ni módulo. La elegibilidad se comprueba recién dentro de `prepararTicketInner` (`journey-preparation.ts:193-202`), con la capacidad ya reservada, y devuelve `no-elegible`. `despacharPreparacion` lo entrega como `preparado` (`journey-preparation.ts:352`) y `avanzarJornada` termina en «despachado… no-elegible» (`journey-advance.ts:104-112`) sin probar el siguiente.
  - Hallazgo 1, fase ejecución: `selectJourneyTickets` (`packages/engine/src/journey-selection.ts:80-102`) no conoce la política; la elegibilidad (`ineligibility`, `packages/engine/src/autonomous-run.ts:110-130`) solo se aplica después, en `runAutonomous` (`autonomous-run.ts:328`), que lanza el error en vez de pasar al siguiente.
  - Hallazgo 2: `armarJornada` descarta toda dependencia que no va en la jornada (`packages/engine/src/journey-plan.ts:132` y `:153`), con la suposición de que «la selección las evalúa contra el registro» (`journey-plan.ts:130-131`). Es falsa: `baseReasons` solo mira `ticket.dependsOn` de la jornada (`journey-selection.ts:134-136`) y `siguienteAPreparar` también (`journey-preparation.ts:287`). Con `--tickets` el origen ya es `dependsOn: []` (`journey-plan.ts:102`), así que el grafo de la feature no se consulta nunca.
- Hipótesis pendientes: ninguna sobre la causa. Queda por confirmar en la implementación qué lector de `tickets.yaml` tolera un grafo con huecos: `readDecomposition` (`packages/engine/src/materialize.ts:84`) falla ante huecos, y la selección no puede caerse por eso.
- Consumidores afectados: `avanzarJornada` (CLI `valmen journey advance`, vigilante de jornada, Mission Control), `dispatchJourney` y `despacharPreparacion`. Antes de empezar se consultó `buscar_memoria`: no hay una causa raíz previa de este patrón.
- Archivos y flujo investigados: `journey-selection.ts`, `journey-dispatch.ts`, `journey-preparation.ts`, `journey-advance.ts`, `journey-plan.ts`, `autonomous-run.ts`, `delegation.ts:236` (`ordenDelGrafo`), `materialize.ts:84`; pruebas existentes `tests/journey-selection.test.ts`, `tests/jornada-preparacion.test.ts`, `tests/avance-jornada.test.ts`.
- Riesgos y compatibilidad: añadir una razón de bloqueo a `JOURNEY_SELECTION_REASONS` cambia un tipo público del motor, y sus consumidores deben tolerarla. Las jornadas ya escritas conservan su `dependsOn` filtrado, por eso la comprobación del grafo se hace al seleccionar y no depende de lo guardado. Una dependencia que no existe en el registro cuenta como bloqueante.
- Impactos de sync, migración, Docker o despliegue: ninguno. No cambia el formato del historial de jornadas ni hay migración.

## Plan

- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan), evaluado con `cascade`: «A, apruebo el plan, implementa».
- Pasos ordenados:
  <!-- Cada paso nombra archivo, símbolo o comando, y los criterios que cubre, por ejemplo
       «(C1, C2)». Un paso que no dice dónde ni con qué se toca no se puede ejecutar ni
       revisar, y la compuerta lo lee así. -->
  1. Extraer en `packages/engine/src/autonomous-run.ts` una función pura `razonesDeInelegibilidad(ticket, politica, estadoEsperado)` con la lógica de tipo, riesgo y módulo excluido que hoy está duplicada en `ineligibility` (`autonomous-run.ts:110`) y en `prepararTicketInner` (`journey-preparation.ts:193-202`), y hacer que ambas la usen sin cambiar su resultado (C1, C2).
  2. Crear `dependenciasDelTicket(paths, ticketId, declaradas)` en `packages/engine/src/delegation.ts`: une las dependencias declaradas en la jornada con las del `tickets.yaml` de cada feature que contiene el ticket, con un lector tolerante a huecos (C3, C4, C5).
  3. `siguienteAPreparar` (`journey-preparation.ts`): para cada ticket en `intake` aplicar la parada, la elegibilidad del paso 1 y las dependencias del paso 2; devolver el siguiente elegible y la lista de omitidos con su motivo (C1, C3, C6).
  4. `despacharPreparacion` y `avanzarJornada` (`journey-advance.ts`): llevar los omitidos hasta el `detalle` del avance, un renglón por ticket con su motivo (C6).
  5. `selectJourneyTickets` (`journey-selection.ts`): añadir la razón `eligibility` y usar las dependencias del paso 2 en `baseReasons`, con bloqueo ante cualquier estado distinto de `closed` (C2, C4, C5).
  6. `armarJornada` (`journey-plan.ts:130-132`): corregir el comentario falso; el `dependsOn` guardado sigue filtrado, porque la verificación ya no depende de él (C5).
  7. Pruebas en `tests/journey-selection.test.ts`, `tests/jornada-preparacion.test.ts` y `tests/avance-jornada.test.ts`: un SECURITY no elegible seguido de un elegible, una dependencia de la feature en `intake` fuera de la jornada, una en `blocked`, y el control con la dependencia en `closed`. Después, la suite completa (C1 a C7).
- Impactos declarados: sincronización, migración y contenedores: no aplican; no cambia el formato del historial de jornadas.
  <!-- Una línea por cada impacto que el ticket declara, con las palabras de su proposición:
       sincronización (datos ya sincronizados y clientes que todavía no se actualizaron),
       migración (orden de aplicación y reversión) o contenedores (imagen y publicación). -->
- Rollback (obligatorio): `git revert` del commit del ticket. No hay datos, migración ni formato que deshacer; las jornadas ya escritas siguen siendo válidas.

<!-- Los criterios de la sección siguiente se numeran C1…Cn, con una afirmación verificable por criterio
     —una frase con «y» son dos criterios—, y cada uno lleva debajo su anotación de
     verificación: un comentario HTML que dice «test:» y el comando, o «verify: manual». La
     sección no lleva comentarios dentro: un comentario con anotación se leería como la de un
     criterio. Ejemplo en la skill planificacion. -->
## Criterios de aceptación

- [x] C1. En la fase de preparación, un ticket cuyo tipo, riesgo o módulo no es elegible se salta y se prepara el siguiente elegible de la jornada.
  <!-- test: npx vitest run tests/jornada-preparacion.test.ts -->
- [x] C2. En la fase de ejecución, `selectJourneyTickets` bloquea con la razón `eligibility` a un ticket no elegible y ofrece como candidato al siguiente elegible.
  <!-- test: npx vitest run tests/journey-selection.test.ts -->
- [x] C3. Una dependencia del ticket en el grafo de su feature que no está en la jornada y no está cerrada bloquea su preparación.
  <!-- test: npx vitest run tests/jornada-preparacion.test.ts -->
- [x] C4. Una dependencia del grafo de la feature que no está en la jornada y no está en `closed`, en cualquier estado incluido `blocked` y `changes_requested`, bloquea el despacho con la razón `dependency`.
  <!-- test: npx vitest run tests/journey-selection.test.ts -->
- [x] C5. Con todas las dependencias en `closed`, el ticket sigue siendo candidato; un grafo de feature con huecos no hace fallar la selección.
  <!-- test: npx vitest run tests/journey-selection.test.ts -->
- [x] C6. El resultado del avance informa, por cada ticket omitido, su identificador y el motivo.
  <!-- test: npx vitest run tests/jornada-preparacion.test.ts -->
- [x] C7. La suite completa pasa sin regresiones.
  <!-- test: npx vitest run -->

## Puntos

```json
[]
```

## Implementación

- `autonomous-run.ts`: `razonesDePolitica` (tipo, riesgo, módulo), compartida por la cola autónoma, la preparación y la selección.
- `materialize.ts`: `dependenciasEnGrafos`, lector tolerante de las dependencias que declara cualquier `tickets.yaml`.
- `journey-preparation.ts`: `elegirAPreparar` salta paradas, tickets no elegibles y dependencias sin preparar (de la jornada o del grafo), y devuelve los omitidos con su motivo; `siguienteAPreparar` queda como envoltorio. `despacharPreparacion` transporta `omitidos`.
- `journey-advance.ts`: el detalle del avance añade «Omitidos: <id> (<motivo>)».
- `journey-selection.ts`: nueva razón `eligibility` (solo con la autonomía encendida y solo para el despachador; la oferta manual no cambia) y bloqueo `dependency` por cualquier dependencia del grafo que no esté en `closed`.
- Decisión: no se tocó `journey-plan.ts`; el `dependsOn` guardado sigue filtrado y la verificación ya no depende de él. Queda su comentario engañoso (`journey-plan.ts:130-131`) como retoque pendiente.

## Pruebas

- Directorio: raíz del repositorio. Ambiente: Node 24, `npm install` hecho.
- `npx vitest run tests/journey-selection.test.ts tests/jornada-preparacion.test.ts` → 23 pruebas pasan, 5 nuevas.
- `npx vitest run` → 193 archivos pasan, 1 omitido; 2805 pruebas pasan, 48 omitidas.
- Pruebas nuevas: salto de un SECURITY no elegible con constancia en el avance; dependencia del grafo en `intake` fuera de la jornada bloquea la preparación y la selección, en `blocked`, `in_progress` y `approved`, y se libera en `closed`; grafo ilegible no rompe la selección; con la autonomía encendida se salta al no elegible.
- Validación manual (opcional): en una jornada con un SECURITY y un FEATURE en `intake`, `valmen journey advance --project valmen-harness --fase preparacion` debe preparar el FEATURE y listar el SECURITY en «Omitidos».

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
    "date": "2026-10-07",
    "at": "2026-10-07T19:45:00.401Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-07",
    "at": "2026-10-07T19:47:07.391Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-07",
    "at": "2026-10-07T19:47:31.252Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-07",
    "at": "2026-10-07T19:50:06.595Z",
    "action": "plan-approved",
    "actor": "cli",
    "details": "{\"actor\":\"Juan Andrade\",\"source\":\"cli\",\"quote\":\"A, apruebo el plan, implementa\",\"planHash\":\"sha256:b0b585046a31ab1bacec405915ea947db4d7f3e682e34757a7c383089b9e3b97\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-07",
    "at": "2026-10-07T19:50:12.427Z",
    "action": "plan-approval-verified",
    "actor": "cli",
    "details": "Aprobación del plan vigente: Juan Andrade (fuente cli), plan sha256:b0b585046a31ab1bacec405915ea947db4d7f3e682e34757a7c383089b9e3b97."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-07",
    "at": "2026-10-07T19:50:12.427Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-07",
    "at": "2026-10-07T19:50:14.929Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-10-07",
    "at": "2026-10-07T19:59:24.567Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  }
]
```
