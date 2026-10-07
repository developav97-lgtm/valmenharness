---
schema_version: 2
id: BUGFIX-CLI-JORNADA-AVANCE-AUTONOMO-20261007
title: Que el avance de la jornada prepare y ejecute por defecto y se recupere solo de una parada
type: BUGFIX
module: CLI
workflow_status: approved
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

# BUGFIX-CLI-JORNADA-AVANCE-AUTONOMO-20261007

## Solicitud original

El disparador periódico de la jornada (valmen journey advance sin --fase) solo ejecuta tickets en approved y nunca prepara los que están en intake, así que por sí solo no avanza: hasta el 2026-10-07 hubo que lanzar la preparación a mano con --fase preparacion y modificar el plist del disparador para encadenar las dos fases. Además la jornada no se recupera sola de tres paradas vistas en la práctica: (1) reutiliza una rama de trabajo vieja (valmen/jornada-AAAAMMDD) que quedó atrás de main, y en ella el ticket aprobado aparece en intake y se rechaza como no elegible; (2) una ejecución abortada deja una reserva de capacidad huérfana en ~/.valmen/machine-capacity.json y el siguiente avance responde ya-despachado sin ejecutar nada; (3) un cambio sin commitear de otra sesión deja el árbol sucio y detiene la jornada sin avisar a quien lo causó. Debe: correr preparación y ejecución en cada avance sin indicar fase; crear o actualizar la rama de trabajo desde main antes de cada ticket; recuperar una reserva cuya actividad no sigue en curso; y avisar por el canal de avisos cuando una parada por árbol sucio dura más de una pasada, diciendo qué archivos la causan.

### Supuestos y decisiones pendientes

<!-- Si el pedido nombra algo que el código no tiene —parámetro, permiso,
campo, bandera, columna, migración— y no lo especifica, listá cada elemento
con su pregunta antes de avanzar a análisis; el análisis no planifica sobre
la adivinanza. Si no hay ninguno, escribí «Ninguno» y seguí. -->
Ninguno.

## Descripción funcional

- Alcance: el avance periódico de la jornada (`valmen journey advance`) y lo que necesita para avanzar sin intervención: correr las dos fases sin `--fase`, dejar la rama de trabajo al día con `main` antes de despachar, recuperar una reserva de capacidad huérfana y avisar por el vigilante una parada por árbol sucio que se repite. Fuera de alcance: cambiar las compuertas, la aprobación humana del plan, el commit por ticket o el contenido del prompt de preparación.
- Usuario o rol afectado: el PO que deja la jornada corriendo con el disparador (launchd o job de Hermes sin agente) y las sesiones que comparten el árbol del proyecto.
- Comportamiento actual: sin `--fase` el avance solo despacha tickets `approved`, así que una jornada con tickets en `intake` no avanza sola; una rama `valmen/jornada-AAAAMMDD` existente se reutiliza tal cual aunque quedó atrás de `main` y en ella el ticket aprobado se lee en `intake`; una reserva cuya corrida murió sin escribir `finished`/`failed` queda para siempre y el avance responde `ya-despachado`; un árbol sucio detiene el despacho en cada pasada sin que nadie se entere.
- Comportamiento esperado: cada avance sin `--fase` corre ejecución y preparación; antes de despachar, la rama de trabajo se crea desde `main` o se avanza (`--ff-only`) hasta `main`; una reserva cuya actividad no sigue en curso se recupera; y si el árbol sigue sucio en la segunda pasada consecutiva, el vigilante avisa una vez por el canal de avisos con los archivos que la causan.

## Diagnóstico

- Causa comprobada (con `ruta:línea`):
  1. Sin `--fase` no se prepara: `packages/engine/src/journey-advance.ts:98` solo entra a `despacharPreparacion` si `request.fase === "preparacion"`; en cualquier otro caso va a `dispatchJourney` (`journey-advance.ts:128`), que selecciona solo tickets `approved`. El disparador generado no pasa `--fase` (`packages/cli/src/journey-trigger.ts:33` y `:94`), y el CLI solo la reenvía si viene (`packages/cli/src/commands.ts:2797`). Por eso hubo que lanzar `--fase preparacion` a mano y editar el plist.
  2. Rama vieja: `asegurarRamaDeTrabajo` (`packages/engine/src/integration-commit.ts:110-137`) hace `git switch <rama>` si la rama existe (`:129-132`) sin comparar con `main`, y si no existe hace `switch -c <rama>` desde el HEAD que haya, no desde `main`. Comprobado hoy: `git merge-base --is-ancestor valmen/jornada-20261007 main` es verdadero y `git rev-list --count valmen/jornada-20261007..main` da 4; el registro de esa rama no tiene la aprobación hecha en `main`, y `selectJourneyTickets` lee el ticket en `intake`. La lista cerrada de git (`packages/engine/src/integration-rules.ts:87`) no admite `merge`, y `switch` solo admite `switch <rama>` o `switch -c <rama>` (`:110`), así que hoy no hay forma permitida de avanzar la rama.
  3. Reserva huérfana: `reconcileMachineCapacity` (`packages/engine/src/machine-capacity.ts:129-157`) solo libera una reserva cuya última actividad es `finished` o `failed` (`:147`). Si el proceso del avance muere (SIGKILL, reinicio, cierre de sesión) entre `recordActivity(..., "started")` (`journey-dispatch.ts:164`, `journey-preparation.ts:371`) y el registro final, la última actividad queda `started`; la reserva se retiene y, como la identidad es fija por jornada (`executionId` = jornada, `attemptId` = `avance-1`, `journey-advance.ts:80,133-134`), `claimMachineCapacity` devuelve `created: false` (`machine-capacity.ts:86-88`) y el avance responde `ya-despachado` (`journey-dispatch.ts:155-161`; en preparación, `journey-preparation.ts:359-361`).
  4. Árbol sucio sin aviso: `dispatchJourney` devuelve `not-dispatched` con la lista de archivos (`journey-dispatch.ts:110-117`) y `asegurarRamaDeTrabajo` falla igual (`integration-commit.ts:121-128`), pero ninguno deja un registro: el aviso de parada (`journey-advance.ts:139-141`) solo cubre `autonomous.stop`, que no existe si no se despachó, y además solo se envía con `--to`, que el disparador no pasa. El vigilante (`pendientesDeAvisar`, `packages/cli/src/hermes.ts:743`) no conoce esta parada.
- Hipótesis pendientes:
  - La preparación escribe el registro del ticket (`tickets/<año>/<ID>/`) sin commitear (su prompt lo prohíbe, `journey-preparation.ts:68-77`). Si se corre en la misma pasada antes que la ejecución, `estadoDelArbolDeTrabajo` (`integration-commit.ts:39-50`) lo ve como árbol sucio y la ejecución no despacha. Por eso el orden propuesto es ejecución primero y preparación después; queda por confirmar en la implementación, con una prueba, que la ejecución de la pasada siguiente no se detiene por el registro que dejó la preparación de la anterior (paso 2 del plan, C4 y C5); hoy la preparación de este mismo ticket dejó modificados su `ticket.md` y `tickets/index.md`.
  - El criterio de «actividad que no sigue en curso» se basa en el tope de la política: el ejecutor se lanza con `timeout` de `limits.maxMinutes` y `SIGKILL` (`packages/engine/src/autonomous-run.ts:187-201`, `journey-preparation.ts:88-95`). Si muere el proceso padre, un hijo huérfano podría seguir más allá del tope; se mitiga exigiendo también que el PID del avance que reservó ya no exista cuando la reserva lo registra.
- Consumidores afectados: `journeyAdvanceCommand` (`packages/cli/src/commands.ts:2760`) y su enrutado en `packages/cli/src/main.ts:1966`; el disparador (`journey-trigger.ts`, que no cambia); `dispatchJourney` y `despacharPreparacion`, que comparten `reconcileMachineCapacity`; `integrarTicket` y `qa-agent-git.ts`, que usan las reglas de git; el vigilante de Hermes (`packages/cli/src/hermes.ts`). Las pruebas existentes en `tests/avance-jornada.test.ts`, `tests/journey-dispatch.test.ts`, `tests/machine-capacity.test.ts`, `tests/reglas-integracion.test.ts`, `tests/integracion-autonoma.test.ts`, `tests/jornada-preparacion.test.ts` y `tests/vigilante-jornada.test.ts`.
- Archivos y flujo investigados: disparador (`journey-trigger.ts:32-57,88-97`) → `journeyAdvanceCommand` (`commands.ts:2760-2800`) → `avanzarJornada` (`journey-advance.ts:83-155`) → `dispatchJourney` (`journey-dispatch.ts:67-196`: `reconcileMachineCapacity` → selección → topes → `asegurarRamaDeTrabajo` y árbol limpio → `claimMachineCapacity` → `runAutonomous`) o `despacharPreparacion` (`journey-preparation.ts:330-388`); capacidad en `machine-capacity.ts`; actividad en `execution-activity.ts:47-80` (eventos idempotentes por `eventId`, `execution-events.ts:121-124`); git en `integration-commit.ts` e `integration-rules.ts`; avisos en `hermes.ts:743-960`. `buscar_memoria` («jornada advance fase preparacion rama vieja reserva capacidad huérfana árbol sucio») no devolvió antecedentes de estas causas (AP-002, AP-006, AP-007, AP-009 no aplican).
- Riesgos y compatibilidad:
  - Agregar `merge --ff-only <base>` y `switch -c <rama> <base>` a la lista cerrada amplía lo que la jornada puede hacer con git. Se limita a avance rápido (sin commit de merge, sin `--force`, sin remotos); una rama con commits propios que `main` no tiene no se toca y la jornada se detiene diciéndolo. Es una ampliación que decide el PO al aprobar el plan.
  - Recuperar una reserva por tiempo podría liberar una corrida viva si el criterio falla: por eso se exigen las dos condiciones (PID ausente y tope vencido), y una reserva sin PID (formato anterior) solo se recupera por tope vencido más margen.
  - El cambio de formato de la reserva (campo `pid` opcional) es compatible: `parseReservation` (`machine-capacity.ts:240-267`) ignora campos de más y un archivo viejo sigue leyéndose.
  - Cambiar el comportamiento por defecto del avance afecta a quien ya invoca `journey advance` sin `--fase` esperando solo ejecución: `--fase ejecucion` y `--fase preparacion` siguen funcionando como hoy.
- Impactos de sync, migración, Docker o despliegue: ninguno; es el CLI y el motor local del harness, sin datos sincronizados, migraciones, contenedores ni despliegue. El plist ya editado a mano en la máquina del PO deja de hacer falta, y volverlo al generado lo decide y ejecuta el PO.

## Plan

- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan), incluida la ampliación de la lista cerrada de git de la jornada a `merge --ff-only`, `merge-base --is-ancestor` y `switch -c <rama> <base>`.
- Alcance y exclusiones: avance por defecto, rama al día con `main`, recuperación de reservas huérfanas, aviso de árbol sucio por el vigilante y convivencia del registro que deja la preparación con la ejecución. No se tocan las compuertas, el prompt de preparación, la aprobación del plan, el disparador generado ni el plist instalado. La rama base es `main`, literal del pedido; si no existe, la jornada se detiene diciéndolo.
- Pasos ordenados (TDD: la prueba que falla va antes de cada cambio; responsable, la sesión de implementación):
  1. `packages/engine/src/journey-advance.ts` — `avanzarJornada`: sin `fase`, corre ejecución (`dispatchJourney`) y después preparación (`despacharPreparacion`) en la misma pasada; con `fase` hace solo esa, como hoy. `AvanceDeJornada` suma `fases: { fase, estado, ticketId, detalle }[]` y conserva `estado`, `ticketId` y `detalle` de la primera fase que despachó (o de la ejecución si ninguna). Un error de una fase no impide correr la otra y queda en su línea. `packages/cli/src/commands.ts` — `journeyAdvanceCommand` imprime una línea por fase. Pruebas en `tests/avance-jornada.test.ts`. (C1, C2, C3)
  2. Ejecución primero y preparación después: la preparación escribe `tickets/<año>/<ID>/` y regenera `tickets/index.md` sin commitear, y eso no debe detener la ejecución de la misma pasada ni de la siguiente. `packages/engine/src/integration-commit.ts` — `estadoDelArbolDeTrabajo` recibe una lista opcional de rutas propias de la jornada (el directorio de los tickets de la jornada que no son el candidato y `tickets/index.md`) que `dispatchJourney` y `asegurarRamaDeTrabajo` excluyen del chequeo de árbol limpio; `repartirCambios` las deja fuera del commit sin contarlas como ajenas. Las demás rutas siguen deteniendo y rechazando como hoy. Pruebas en `tests/integracion-autonoma.test.ts` y `tests/avance-jornada.test.ts`. (C4, C5)
  3. `packages/engine/src/integration-rules.ts` — `OPERACIONES_PERMITIDAS` y `motivoDeGitProhibido` admiten solo `merge --ff-only <rama>`, `merge-base --is-ancestor <a> <b>` y `switch -c <rama> <base>`; cualquier otra forma de `merge` (sin `--ff-only`, con `--no-ff`, `--squash`, `--abort` u otra bandera) se rechaza. Pruebas en `tests/reglas-integracion.test.ts`. (C6, C7)
  4. `packages/engine/src/integration-commit.ts` — `asegurarRamaDeTrabajo`: si la rama no existe, `switch -c <rama> main`; si existe y es ancestro de `main`, `switch <rama>` (si hace falta) y `merge --ff-only main`; si tiene commits que `main` no tiene y `main` tiene commits que ella no tiene, falla con un mensaje que nombra la rama y no la toca. Se aplica también cuando el árbol ya está en la rama de trabajo. Pruebas con un repositorio git temporal en `tests/integracion-autonoma.test.ts`. (C8, C9, C10)
  5. `packages/engine/src/machine-capacity.ts` — `claimMachineCapacity` guarda `pid` (el del proceso del avance) en la reserva nueva; `reconcileMachineCapacity` acepta `ahora` y `procesoVivo` inyectables y recupera una reserva cuya última actividad es `started` o `active` cuando su `pid` ya no existe (o no lo tiene) y pasaron `limits.maxMinutes` de la política más 5 minutos desde esa actividad; al recuperarla registra `activity.failed` con `source: "journey-recovery"` y la devuelve en `recovered`. Una reserva con el proceso vivo o dentro del tope se retiene. Pruebas en `tests/machine-capacity.test.ts` y `tests/avance-jornada.test.ts`. (C11, C12, C13, C14)
  6. Árbol sucio: `packages/engine/src/journey-dispatch.ts` anexa en `.valmen/journeys/arbol-sucio.jsonl` (estado del harness, append-only) una línea por pasada con `{ journeyId, at, archivos }` cuando no despacha por árbol sucio y `{ journeyId, at, limpio: true }` cuando lo encuentra limpio. `packages/cli/src/hermes.ts` — `pendientesDeAvisar` suma el tipo `arbol-sucio` cuando las dos últimas pasadas de la jornada son sucias y consecutivas y ese episodio (identificado por la primera pasada sucia) no tiene `journey-dirty-tree-notice` en `approvals.jsonl`; el vigilante lo envía con un renderizador nuevo en `packages/engine/src/notify.ts` que nombra la jornada y hasta diez archivos, y anota el aviso solo si se entregó. Pruebas en `tests/vigilante-jornada.test.ts`. (C15, C16, C17, C18)
  7. Regresión y verificación: `npx vitest run` completo en verde y `npx tsc -b` sin errores. (C19)
- Impactos declarados: ninguno de sincronización, migración ni contenedores (`sync_impact`, `migration_impact` y `docker_impact` en `false`).
- Rollback (obligatorio): revertir el commit del ticket devuelve el avance a una sola fase por defecto y la lista de git a la anterior; `--fase ejecucion` y `--fase preparacion` siguen disponibles. Una reserva con `pid` se lee igual en la versión anterior (el campo se ignora). `.valmen/journeys/arbol-sucio.jsonl` y las marcas `journey-dirty-tree-notice` quedan como historial inerte: nadie más las lee.
- Pruebas para la entrega: desde la raíz del repositorio, `npx vitest run tests/avance-jornada.test.ts tests/machine-capacity.test.ts tests/reglas-integracion.test.ts tests/integracion-autonoma.test.ts tests/vigilante-jornada.test.ts`, después `npx vitest run` y `npx tsc -b`; resultado esperado, todo en verde. Requisitos: Node 24 y `git` en el PATH. Validación manual: una pasada real de `valmen journey advance --project <id>` sin `--fase` con un ticket `approved` y otro en `intake`.

<!-- Los criterios de la sección siguiente se numeran C1…Cn, con una afirmación verificable por criterio
     —una frase con «y» son dos criterios—, y cada uno lleva debajo su anotación de
     verificación: un comentario HTML que dice «test:» y el comando, o «verify: manual». La
     sección no lleva comentarios dentro: un comentario con anotación se leería como la de un
     criterio. Ejemplo en la skill planificacion. -->
## Criterios de aceptación

- [ ] C1. `valmen journey advance` sin `--fase` despacha un ticket `approved` y prepara un ticket en `intake` de la misma jornada en una sola pasada.
      <!-- test: npx vitest run tests/avance-jornada.test.ts -->
- [ ] C2. Con `--fase ejecucion` o `--fase preparacion` el avance corre solo esa fase, como antes.
      <!-- test: npx vitest run tests/avance-jornada.test.ts -->
- [ ] C3. La salida del avance sin `--fase` tiene una línea por fase con su estado y su ticket.
      <!-- test: npx vitest run tests/avance-jornada.test.ts -->
- [ ] C4. Los cambios sin commitear en el directorio de otro ticket de la jornada y en `tickets/index.md` no detienen el despacho de ejecución.
      <!-- test: npx vitest run tests/integracion-autonoma.test.ts -->
- [ ] C5. Un cambio sin commitear fuera de esas rutas sigue deteniendo el despacho.
      <!-- test: npx vitest run tests/integracion-autonoma.test.ts -->
- [ ] C6. Las reglas de git admiten `merge --ff-only <rama>`, `merge-base --is-ancestor <a> <b>` y `switch -c <rama> <base>`.
      <!-- test: npx vitest run tests/reglas-integracion.test.ts -->
- [ ] C7. Las reglas de git rechazan `merge` sin `--ff-only` o con cualquier otra bandera.
      <!-- test: npx vitest run tests/reglas-integracion.test.ts -->
- [ ] C8. Si la rama de trabajo no existe, se crea desde `main`.
      <!-- test: npx vitest run tests/integracion-autonoma.test.ts -->
- [ ] C9. Si la rama de trabajo existe atrás de `main`, queda en el mismo commit que `main` antes de despachar.
      <!-- test: npx vitest run tests/integracion-autonoma.test.ts -->
- [ ] C10. Si la rama de trabajo divergió de `main`, el despacho se detiene con un mensaje que nombra la rama y la rama no cambia.
      <!-- test: npx vitest run tests/integracion-autonoma.test.ts -->
- [ ] C11. Una reserva nueva guarda el PID del proceso que la reclamó.
      <!-- test: npx vitest run tests/machine-capacity.test.ts -->
- [ ] C12. Una reserva con actividad `started`, proceso inexistente y tope vencido se recupera y queda registrada como `failed` con origen `journey-recovery`.
      <!-- test: npx vitest run tests/machine-capacity.test.ts -->
- [ ] C13. Una reserva con el proceso vivo o dentro del tope se retiene.
      <!-- test: npx vitest run tests/machine-capacity.test.ts -->
- [ ] C14. Tras recuperar una reserva huérfana, el avance siguiente despacha el ticket en vez de responder `ya-despachado`.
      <!-- test: npx vitest run tests/avance-jornada.test.ts -->
- [ ] C15. Cada pasada que no despacha por árbol sucio deja una línea con sus archivos en `.valmen/journeys/arbol-sucio.jsonl`.
      <!-- test: npx vitest run tests/vigilante-jornada.test.ts -->
- [ ] C16. El vigilante no avisa tras una sola pasada sucia.
      <!-- test: npx vitest run tests/vigilante-jornada.test.ts -->
- [ ] C17. Tras dos pasadas sucias consecutivas el vigilante envía un aviso con los archivos que causan la parada.
      <!-- test: npx vitest run tests/vigilante-jornada.test.ts -->
- [ ] C18. El mismo episodio de árbol sucio no se avisa dos veces.
      <!-- test: npx vitest run tests/vigilante-jornada.test.ts -->
- [ ] C19. La suite completa queda en verde.
      <!-- test: npx vitest run -->

## Puntos

```json
[]
```

## Implementación

Pendiente.

## Pruebas

Pendiente de ejecución.

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
    "at": "2026-10-07T21:15:44.186Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-07",
    "at": "2026-10-07T21:33:45.128Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-07",
    "at": "2026-10-07T21:35:17.423Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-07",
    "at": "2026-10-07T21:49:00.936Z",
    "action": "plan-approved",
    "actor": "cli",
    "details": "{\"actor\":\"Juan Andrade\",\"source\":\"cli\",\"quote\":\"La A (incluye ampliar la lista cerrada de git de la jornada a merge --ff-only, merge-base --is-ancestor y switch -c)\",\"planHash\":\"sha256:fd1a1cc386e261dc1360153534c77e6b6f0132864056d9db35b238eab804650f\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-07",
    "at": "2026-10-07T21:49:01.296Z",
    "action": "plan-approval-verified",
    "actor": "cli",
    "details": "Aprobación del plan vigente: Juan Andrade (fuente cli), plan sha256:fd1a1cc386e261dc1360153534c77e6b6f0132864056d9db35b238eab804650f."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-07",
    "at": "2026-10-07T21:49:01.296Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  }
]
```
