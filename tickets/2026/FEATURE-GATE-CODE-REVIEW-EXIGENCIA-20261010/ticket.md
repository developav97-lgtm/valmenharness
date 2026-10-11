---
schema_version: 2
id: FEATURE-GATE-CODE-REVIEW-EXIGENCIA-20261010
title: Exigir la revisión del diff al entregar un ticket y adaptar a quienes entregan
type: FEATURE
module: GATE
workflow_status: awaiting_user_tests
qa_status: pending
release_status: unreleased
user_visible: false
sync_impact: false
migration_impact: false
docker_impact: false
risk_level: normal
created: 2026-10-10
updated: 2026-10-11
related_ticket: null
target_release: null
released_in: null
---

# FEATURE-GATE-CODE-REVIEW-EXIGENCIA-20261010

## Solicitud original

Es la Parte B de FEATURE-GATE-CODE-REVIEW-20261010, que el PO pidió partir el 2026-10-10 («Partir: A aquí, B en un ticket nuevo (Recomendado)»): la Parte A crea la compuerta `code-review` (recibo atado al árbol revisado, profundidad por riesgo y una sola corrección) y se invoca a mano con `valmen gate code-review --id <ID>`; esta parte la exige en la entrega y adapta a quienes entregan. Depende de que la Parte A esté integrada. El PO decidió también NO activar la clave en este repositorio por ahora: `code-review: exigida` en `.valmen/config.yaml` queda como interruptor que agrega una persona después de ver cuánto cuesta y cuánto sirve; sin la clave, la entrega no cambia en ningún proyecto. El plan de la Parte A (paso 15) activaba la clave en este repositorio: aquí NO se hace. Lo que el plan original asignaba a esta parte, tal cual, para que el análisis lo verifique contra el código real y no lo dé por cierto:

PASOS DEL PLAN ORIGINAL (11 a 15)
11. Parte B. En `packages/engine/src/discovery.ts`, crear `codeReviewExigida(root)`: lee la clave `code-review` de `.valmen/config.yaml` del árbol de trabajo y de `git show HEAD:.valmen/config.yaml` (con el `git` de solo lectura de `packages/engine/src/diff.ts`), y devuelve verdadero si alguno dice `exigida`. (C27, C28)
12. En `packages/engine/src/transition.ts`, crear `exigirRevisionDeCodigo(document, paths)` y llamarla después de `exigirVerificacionMecanica` (`:461-463`) cuando `codeReviewExigida`: sin recibo, «La entrega requiere la revisión del diff: valmen gate code-review --id <ID>»; con `veredictoDeCompuerta` (`packages/engine/src/receipts.ts:125-145`) distinto de `aprobada`, el motivo del recibo y quién decide; aprobada con `motivoDeArbolNoVigente(recibo, paths, id, "code-review")` no nulo, ese motivo. (C23, C24, C25, C26, C27, C28)
13. En `packages/engine/src/next-step.ts`, caso `in_progress` de `computeNextStep` (`:374-431`), con la verificación mecánica vigente y la revisión exigida: paso «revisión del diff» con `valmen gate code-review --id <ID>`; tras un bloqueo de ronda 1, «una sola corrección acotada a los hallazgos y volver a correrla»; con la ronda 2 escalada, el alto de una persona; con el árbol cambiado, el motivo de `motivoDeArbolNoVigente`. En `packages/engine/src/journey-brief.ts` (`:195-201`), con la revisión exigida, sumar `valmen gate code-review --id <ID>` a las compuertas de implementación. (C29, C37)
14. En `packages/engine/src/autonomous-run.ts`, con la revisión exigida, correr `runGate` de `code-review` después de `qa-mechanical` (`:483`) y antes de entregar (`:516`); si no aprueba, detenerse con `verification-failed` y el id del recibo. En `packages/cli/src/delegation.ts` (`:314-323`), con la revisión exigida, `resolverPorDelegacion(..., "code-review", undefined, deps, true)` antes de `transition`: sin motivo, un `review` o un `block` frenan la delegación. (C35, C36)
15. Agregar `code-review: exigida` a `.valmen/config.yaml` de este repositorio, con un comentario que explica la clave y que quitarla sin commit no la apaga. (C27, C28)

CRITERIOS DEL PLAN ORIGINAL
C23 — R-REV-004: Con la revisión exigida, la entrega a `awaiting_user_tests` sin recibo de `code-review` se rechaza.
C24 — R-REV-004: Con un recibo `approve` de `code-review` seguido de otro contenido commiteado, la entrega se rechaza pidiendo revisar el árbol nuevo.
C25 — R-REV-004: Con un recibo `approve` de `code-review` del árbol actual, la entrega se acepta.
C26 — R-REV-004: Un recibo `review` de `code-review` aprobado por una persona permite entregar ese mismo árbol.
C27 — R-REV-004: Sin la clave `code-review: exigida`, la entrega no pide la revisión del diff.
C28 — R-REV-004: Quitar `code-review: exigida` del árbol de trabajo sin commitearlo no quita la exigencia.
C29 — R-REV-004: Con el árbol actual distinto del revisado, `computeNextStep` en `in_progress` indica correr `valmen gate code-review`.
C35 — R-REV-004: La jornada autónoma con la revisión exigida corre `code-review` antes de entregar.
C36 — R-REV-004: La corrida delegada con la revisión exigida corre `code-review` antes de entregar.
C37 — R-REV-004: Con la revisión exigida, el brief de un subagente lista `valmen gate code-review` entre las compuertas de implementación.

El evaluador dudó en C25 y C26 (0,86 y 0,80) en la compuerta del plan original: el plan de este ticket los redacta explícitos. Cuida que la jornada autónoma (autonomous-run.ts:483,516) y la corrida delegada (delegation.ts:314-323, ceremony.ts:110) no entreguen sin la revisión cuando está exigida, y que ninguna aprueba un review por su cuenta: lo decide una persona.

### Supuestos y decisiones pendientes

<!-- Si el pedido nombra algo que el código no tiene —parámetro, permiso,
campo, bandera, columna, migración— y no lo especifica, listá cada elemento
con su pregunta antes de avanzar a análisis; el análisis no planifica sobre
la adivinanza. Si no hay ninguno, escribí «Ninguno» y seguí. -->
Ninguno.

## Descripción funcional

- Alcance: R-REV-004 en la entrega (`.valmen/features/guardas-verificacion-harness/spec/s4-revision-diff/spec.md:59-68`) y la ronda única de R-REV-005 (`spec.md:70-79`) vista desde quien entrega, según D4 (`.valmen/features/guardas-verificacion-harness/design.md:32-45`): con la clave `code-review: exigida` en `.valmen/config.yaml`, pasar de `in_progress` a `awaiting_user_tests` exige un recibo vigente de la compuerta `code-review`, y los cuatro caminos que entregan (el movimiento directo, el siguiente paso, la jornada autónoma, la corrida delegada) más el brief del subagente lo saben. La clave NO se activa en este repositorio (decisión del PO del 2026-10-10): el paso 15 del plan original queda fuera.
- Usuario o rol afectado: el agente que entrega un ticket (a mano, por jornada autónoma o por delegación) y la persona que decide un `review` de `code-review`. Sin la clave, nadie nota el cambio.
- Comportamiento actual: la compuerta `code-review` existe (Parte A) pero solo se corre a mano; la entrega exige únicamente la verificación mecánica (`packages/engine/src/transition.ts:501-503` → `exigirVerificacionMecanica`, `:208-254`). Un ticket se entrega sin que nadie haya revisado el diff.
- Comportamiento esperado: con la clave (leída del árbol de trabajo o del `HEAD`), la entrega sin recibo de `code-review`, con un recibo de otro árbol, con un `block`, o con un `review` sin decisión humana se rechaza y dice qué correr o quién decide; un `approve` del árbol actual, o un `review` aprobado por una persona sobre el árbol actual, la dejan pasar. Ni la jornada autónoma ni la delegación aprueban un `review` de `code-review` por su cuenta.

## Diagnóstico

- Causa comprobada (con `ruta:línea`):
  - La entrega solo llama a `exigirVerificacionMecanica` (`packages/engine/src/transition.ts:501-503`); no hay ninguna lectura de recibos de `code-review` en `transition.ts`. La propia compuerta lo declara: «que la entrega la exija es de otro ticket» (`packages/engine/src/code-review.ts:16`, `packages/gate/src/definitions.ts:410-411`).
  - Ya existe todo lo que la exigencia necesita para decidir: `veredictoDeCompuerta` (`packages/engine/src/receipts.ts:125-143`) colapsa la decisión humana sobre el último recibo y devuelve `sin-recibo | aprobada | bloqueada | espera-persona`; `motivoDeArbolNoVigente(recibo, paths, id, "code-review")` (`packages/engine/src/arbol-probado.ts:226-269`) ya admite `code-review` y lo usa el servidor (`packages/server/src/gates.ts:271-281`). El árbol excluye el registro (`arbol-probado.ts:82`), así que mover el ticket no caduca el recibo; un commit o un archivo funcional editado sí (C24 original).
  - El recibo de `code-review` NO guarda el hash del texto del ticket sino el de su entrada congelada (`packages/server/src/gates.ts:265-270`): la exigencia compara solo el árbol, no el `stateHash` como hace `exigirVerificacionMecanica` (`transition.ts:224-230`).
  - La ronda vive en `recibo.codeReview.ronda` (`code-review.ts:243-258`); una segunda ronda que no aprueba se convierte en `review` con actor `engine` (`code-review.ts:657-665`), y una tercera corrida se rechaza (`code-review.ts:248-255`). Un rechazo humano abre un ciclo nuevo (`cicloVigente`, `code-review.ts:107-115`).
  - No hay lector de la clave: `configList` (`packages/engine/src/discovery.ts:109-131`) lee solo listas y solo el árbol de trabajo; `git` de solo lectura existe en `packages/engine/src/diff.ts:41-49`. Hoy `.valmen/config.yaml` no tiene la clave.
  - Quienes entregan: la jornada autónoma corre `runGate` de `qa-mechanical` (`packages/engine/src/autonomous-run.ts:602-605`) y llama a `transition(... "awaiting_user_tests")` (`:641-646`) sin capturar su fallo; con la exigencia activa y sin revisión, la jornada terminaría en una excepción en lugar de una parada `verification-failed`. La corrida delegada resuelve `qa-mechanical` con `resolverPorDelegacion(..., true)` (`packages/cli/src/delegation.ts:333-342`) y entrega en `:343`.
  - `resolverCompuerta` (`packages/cli/src/ceremony.ts:110-161`) aprueba un `review` cuando trae `motivo` (`:137-158`) y aprueba un `espera-persona` sin motivo «escalado por política» (`:144-147`). Para `code-review` eso violaría R-REV-005: la decide una persona.
  - El siguiente paso en `in_progress` (`packages/engine/src/next-step.ts:378-433`) termina en «entrega» apenas la verificación mecánica está vigente (`:428-432`); no sabe de `code-review`. El brief lista solo `qa-mechanical` en la fase de implementación (`packages/engine/src/journey-brief.ts:244-254`, `compuertasPorFase` en `:218`, llamada sin raíz en `:118`).
- Hipótesis pendientes:
  - Leer `HEAD:.valmen/config.yaml` resuelve la ruta desde el tope del repositorio, no desde la raíz del proyecto: en un proyecto que vive en un subdirectorio de un repositorio (o en un fixture de prueba dentro de este repositorio) leería otro archivo. Se usará la forma relativa `HEAD:./.valmen/config.yaml` con `cwd` en la raíz; se comprueba con un caso de prueba.
  - La jornada autónoma de prueba necesita un revisor inyectable: `GateRunOptions.reviewDiff` existe (`packages/engine/src/gate.ts:252-258`) pero `AutonomousRunRequest` (`autonomous-run.ts:63-94`) no lo transporta. Se supone que basta un campo opcional con el mismo nombre.
- Consumidores afectados: `transition` lo usan el CLI (`valmen transition`), el MCP (`mover_ticket`), la jornada (`autonomous-run.ts:641`) y la delegación (`delegation.ts:343`): todos heredan la exigencia del motor. `computeNextStep` lo consumen `valmen resume`/`reanudar_ticket`. `armarBriefDeSubagente` (`journey-brief.ts:72`) lo consumen la corrida orquestada y la jornada. `resolverCompuerta` lo consumen la delegación (`delegation.ts:113`) y `approveCommand` (`ceremony.ts:446`, solo `plan`: no cambia). `motivoDeArbolNoVigente` ya lo exporta `packages/engine/src/index.ts:55`.
- Archivos y flujo investigados: `packages/engine/src/transition.ts`, `receipts.ts`, `arbol-probado.ts`, `code-review.ts`, `next-step.ts`, `journey-brief.ts`, `autonomous-run.ts`, `discovery.ts`, `diff.ts`, `gate.ts`, `index.ts`; `packages/cli/src/delegation.ts`, `ceremony.ts`; `packages/server/src/gates.ts`; `packages/core/src/transitions.ts:60-61` (a `awaiting_user_tests` solo se entra desde `in_progress`); `.valmen/config.yaml`; pruebas `tests/code-review.test.ts`, `tests/transitions.test.ts`, `tests/next-step.test.ts`, `tests/journey-brief.test.ts`, `tests/autonomous-run.test.ts`, `tests/delegation.test.ts`. Memoria: AP-007 y AP-009 (`.valmen/memory/aprendizajes.md:60-76`): la firma humana se lee del recibo, nunca la pone quien mueve el ticket; se aplica igual aquí.
- Riesgos y compatibilidad:
  - Sin la clave no cambia nada en ningún proyecto: la exigencia es opcional, y ningún fixture de prueba existente la declara, así que las pruebas actuales de entrega, delegación y jornada siguen en verde.
  - Tickets en curso al activarla: la exigencia se evalúa en el momento de la entrega, no al aprobar el plan. Un ticket en `in_progress` tendrá que correr `code-review` antes de entregar; uno ya en `awaiting_user_tests` o posterior no se toca; uno que vuelve por `changes_requested` la necesita sobre el árbol corregido.
  - Quitar la clave sin commitear no la apaga (se lee también del `HEAD`); romper el YAML del árbol de trabajo tampoco, por la misma razón.
  - Coste: con la clave, cada entrega cuesta una revisión (cero llamadas con riesgo bajo, `code-review.ts:10-11`). Por eso el PO no la activa aquí.
  - El diff de este ticket toca archivos de la propia compuerta: no afecta, porque la clave no está activa en este repositorio.
- Impactos de sync, migración, Docker o despliegue: ninguno (motor y CLI locales del harness; sin datos sincronizados, sin migraciones, sin contenedores, sin despliegue).

## Plan

- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan). Confirma el plan con sus 20 criterios, la lectura de la clave `code-review: exigida` del árbol de trabajo y de `HEAD`, y que la clave NO se activa en este repositorio.
- Tamaño previsto: 20 criterios; unas 190 líneas de producción (discovery 30, transition 50, next-step 55, journey-brief 10, autonomous-run 25, delegation 15, ceremony 8, comentarios 4) y unas 330 de pruebas en dos archivos nuevos: unas 520 en total, dentro de 300 a 700. No hace falta partirlo.
- Fuera de alcance: el paso 15 del plan original (agregar `code-review: exigida` a `.valmen/config.yaml` de este repositorio) NO se hace: el PO decidió no activarla. Ningún paso de este plan escribe `.valmen/config.yaml`.
- Pasos ordenados:
  1. `packages/engine/src/discovery.ts`: nueva `codeReviewExigida(root: string): boolean`. Lee la clave escalar `code-review` de `.valmen/config.yaml` del árbol de trabajo con `parseYamlSubset`, como `configDelProyecto` (`discovery.ts:189-199`), y del `HEAD` con `git(root, ["show", "HEAD:./.valmen/config.yaml"])` de `packages/engine/src/diff.ts:41` (solo lectura; la forma `./` resuelve desde la raíz del proyecto, no desde el tope del repositorio). Devuelve verdadero si cualquiera de los dos dice exactamente `exigida`; un archivo ausente, un YAML que no parsea o un `git` que falla cuentan como «no lo dice», sin lanzar. Se exporta desde `packages/engine/src/index.ts` porque la consume el CLI (paso 7); consumidores del motor: pasos 2, 4, 5 y 6. Si el import de `diff.ts` desde `discovery.ts` formara un ciclo, `tsc` lo muestra y se usa un `spawnSync` local de solo lectura con la misma forma. (C8, C9, C10, C11)
  2. `packages/engine/src/transition.ts`: nueva `exigirRevisionDeCodigo(document, paths)` (privada), llamada en `applyTicket` justo después de `exigirVerificacionMecanica` (`transition.ts:501-503`) cuando `codeReviewExigida(paths.root)`. Toma `veredictoDeCompuerta(readReceipts(paths, id), "code-review")` (`receipts.ts:125-143`) y decide con esta tabla, siempre con `fail(..., EXIT_INVARIANT)`: `sin-recibo` → «La entrega requiere la revisión del diff: valmen gate code-review --id <ID>»; `bloqueada` sin decisión humana → el motivo del recibo y «una sola corrección acotada a los hallazgos, luego volver a correrla» (ronda 1) o el alto de una persona (ronda 2); `bloqueada` por rechazo humano → quién rechazó, su motivo y volver a correrla (ciclo nuevo); `espera-persona` → el comando `valmen gate-decide --id <ID> --receipt <recibo> ...` que firma una persona, con el mismo texto de «ni el modelo ni quien mueve el ticket la sustituyen» de `exigirDecisionDeCompuerta` (`transition.ts:345-366`); `aprobada` → `motivoDeArbolNoVigente(recibo, paths, id, "code-review")` (`arbol-probado.ts:226`) y, si no es nulo, ese motivo. NO se compara `stateHash`: el del recibo es el de la entrada congelada (`packages/server/src/gates.ts:265-281`). Sin la clave la función no se llama. (C1, C2, C3, C4, C5, C6, C7, C8)
  3. Las dos dudas del evaluador en el plan original, como casos propios de la tabla de pruebas del paso 9 sobre `transition`: C25 original (aquí C2): caso «un recibo `approve` de `code-review` corrido sobre el árbol de ahora, sin tocar nada después» → resultado esperado: `transition` a `awaiting_user_tests` termina sin error y el ticket queda en `awaiting_user_tests`. C26 original (aquí C5): caso «un recibo `review` de `code-review` firmado por una persona con `recordHumanDecision` (decisión `approve`), sin tocar el árbol después» → resultado esperado: la entrega se acepta; y su control C6: el mismo recibo firmado, con un archivo funcional editado después → la entrega se rechaza con el motivo de `motivoDeArbolNoVigente`. (C2, C5, C6)
  4. `packages/engine/src/next-step.ts`, caso `in_progress` de `computeNextStep` (`next-step.ts:378-433`): en lugar del paso «entrega» de `:428-432`, si `codeReviewExigida(paths.root)` se evalúa el último recibo de `code-review` con la misma tabla del paso 2: sin recibo → paso «revisión del diff» con `valmen gate code-review --id <ID>`; `aprobada` con árbol no vigente → el motivo de `motivoDeArbolNoVigente`; `block` de ronda 1 → «una sola corrección acotada a los hallazgos del recibo <id>, luego volver a correrla»; `review` de ronda 2 sin firma (o cualquier `espera-persona`) → `alto` de una persona con `valmen gate-decide`; rechazo humano → corregir y volver a correrla; `aprobada` vigente → «entrega». Sin la clave, el texto actual no cambia. (C12, C13, C14, C15)
  5. `packages/engine/src/journey-brief.ts`: `compuertasPorFase(ticketId, revisionExigida)` (`journey-brief.ts:218`) agrega a la fase «implementación» el comando `valmen gate code-review --id <ID>` con evaluador `null` (su profundidad la decide el riesgo, `code-review.ts:10-11`) cuando la revisión está exigida; la llamada de `:118` pasa `codeReviewExigida(project.root)`. (C16)
  6. `packages/engine/src/autonomous-run.ts`: `AutonomousRunRequest` (`autonomous-run.ts:63-94`) gana el campo opcional `reviewDiff` con el tipo de `GateRunOptions["reviewDiff"]` (`gate.ts:252-258`), mismo nombre para que no se ignore. Después de `qa-mechanical` (`:602-626`) y de la comprobación del contrato de pruebas (`:627-639`), antes de `transition` (`:641`), si `codeReviewExigida(request.paths.root)`: `runGate(request.paths, { gateId: "code-review", ticketId, reviewDiff })`; si el veredicto (`veredictoDeCompuerta`) no es `aprobada` o el árbol no está vigente, `stopResult(..., "verification-failed", "<motivo> (recibo <id>)")` sin entregar. La jornada nunca firma un `review`. (C17, C18)
  7. `packages/cli/src/delegation.ts` (`:333-343`): con `codeReviewExigida(paths.root)`, entre `qa-mechanical` y `transition`, `resolverPorDelegacion(paths, delegation, ticketId, "code-review", undefined, deps, caducado)`, donde `caducado` es verdadero solo si el último recibo aprobado ya no es del árbol actual (para no repetir una revisión vigente ni perder la firma de una persona); un `stop` no nulo → `parada`. `packages/cli/src/ceremony.ts`, `resolverCompuerta` (`:110-161`): si `gateId === "code-review"` y el veredicto es `espera-persona`, devuelve la parada «la revisión del diff en REVIEW la decide una persona» aunque haya `motivo`, antes de `deps.decide` (`:148`). (C19, C20)
  8. Comentarios que hoy dicen que la entrega no la exige: `packages/engine/src/code-review.ts:16` y `packages/gate/src/definitions.ts:410-411` pasan a «la entrega la exige si `.valmen/config.yaml` declara `code-review: exigida`». Solo texto.
  9. Pruebas nuevas, una tabla parametrizada (`it.each`) por regla: `tests/code-review-exigida.test.ts` con un laboratorio git como el de `tests/code-review.test.ts:70-160` y el revisor falso inyectado por `reviewDiff`: tabla «entrega» (C1 a C8), tabla «clave» (C9, C10, C11, este último con el proyecto en un subdirectorio del repositorio del laboratorio), tabla «siguiente paso» (C12 a C15) y el brief (C16). `tests/code-review-exigida-entregas.test.ts`: tabla «jornada» (C17, C18) con `runAutonomousTicket` como en `tests/autonomous-run.test.ts`, y tabla «delegación» (C19, C20) con `DelegationDeps` falsos como en `tests/delegation.test.ts`. (C1 a C20)
  10. Pruebas existentes que el cambio pone en rojo a propósito (EST-009): ninguna. La exigencia solo actúa con la clave, y ningún fixture existente la declara (ni en su árbol ni en su `HEAD`); los laboratorios viven en directorios temporales fuera de este repositorio y este repositorio no activa la clave. Por eso no se edita ninguna prueba existente; si alguna de `tests/transitions.test.ts`, `tests/next-step.test.ts`, `tests/journey-brief.test.ts`, `tests/journey-brief-worktree.test.ts`, `tests/autonomous-run.test.ts`, `tests/autonomous-stops.test.ts`, `tests/integracion-autonoma.test.ts`, `tests/delegation.test.ts`, `tests/delegation-mcp.test.ts`, `tests/code-review.test.ts` o `tests/arbol-probado.test.ts` se pusiera en rojo, es un defecto del cambio y se corrige el código, no la prueba.
  11. Verificación antes de entregar: `npx vitest run` de los dos archivos nuevos y de los once del paso 10; `npx tsc -p tsconfig.json --noEmit`; `npm run lint`; `npm run exports:check` (la única exportación nueva, `codeReviewExigida`, la consumen `transition.ts`, `next-step.ts`, `journey-brief.ts`, `autonomous-run.ts` y `packages/cli/src/delegation.ts`).
- Impactos declarados: ninguno de sincronización, migración ni contenedores; el ticket los declara en falso. Sin despliegue.
- Rollback (obligatorio): revertir el commit del ticket. No hay datos ni migraciones que deshacer, y como ningún proyecto declara la clave hoy, revertir no cambia ninguna entrega. Si un proyecto la hubiera activado, quitarla con un commit (paso 1: el `HEAD` manda) apaga la exigencia sin revertir el código.

<!-- Los criterios de la sección siguiente se numeran C1…Cn, con una afirmación verificable por criterio
     —una frase con «y» son dos criterios—, y cada uno lleva debajo su anotación de
     verificación: un comentario HTML que dice «test:» y el comando, o «verify: manual». La
     sección no lleva comentarios dentro: un comentario con anotación se leería como la de un
     criterio. Ejemplo en la skill planificacion. -->
## Criterios de aceptación

- [x] C1 — Con la revisión exigida, la entrega a `awaiting_user_tests` sin recibo de `code-review` se rechaza.
      <!-- test: npx vitest run tests/code-review-exigida.test.ts -->
- [x] C2 — Con la revisión exigida, un recibo `approve` de `code-review` sobre el árbol actual deja entregar el ticket.
      <!-- test: npx vitest run tests/code-review-exigida.test.ts -->
- [x] C3 — Con la revisión exigida, un commit posterior al recibo `approve` de `code-review` hace rechazar la entrega pidiendo revisar el árbol nuevo.
      <!-- test: npx vitest run tests/code-review-exigida.test.ts -->
- [x] C4 — Con la revisión exigida, un recibo `review` de `code-review` sin decisión humana hace rechazar la entrega.
      <!-- test: npx vitest run tests/code-review-exigida.test.ts -->
- [x] C5 — Con la revisión exigida, un recibo `review` de `code-review` aprobado por una persona con `gate-decide` deja entregar ese mismo árbol.
      <!-- test: npx vitest run tests/code-review-exigida.test.ts -->
- [x] C6 — Con la revisión exigida, un recibo `review` aprobado por una persona deja de valer cuando cambia un archivo funcional.
      <!-- test: npx vitest run tests/code-review-exigida.test.ts -->
- [x] C7 — Con la revisión exigida, un recibo `block` de `code-review` hace rechazar la entrega.
      <!-- test: npx vitest run tests/code-review-exigida.test.ts -->
- [x] C8 — Sin la clave `code-review: exigida`, la entrega sin recibo de `code-review` se acepta.
      <!-- test: npx vitest run tests/code-review-exigida.test.ts -->
- [x] C9 — Quitar `code-review: exigida` del árbol de trabajo sin commitearlo mantiene la exigencia.
      <!-- test: npx vitest run tests/code-review-exigida.test.ts -->
- [x] C10 — Agregar `code-review: exigida` al árbol de trabajo sin commitearlo ya exige la revisión.
      <!-- test: npx vitest run tests/code-review-exigida.test.ts -->
- [x] C11 — Un proyecto en un subdirectorio de un repositorio git lee la clave del `.valmen/config.yaml` de su propia raíz en el `HEAD`.
      <!-- test: npx vitest run tests/code-review-exigida.test.ts -->
- [x] C12 — Con la revisión exigida, `computeNextStep` en `in_progress` con la verificación mecánica vigente sin recibo de `code-review` indica correr `valmen gate code-review`.
      <!-- test: npx vitest run tests/code-review-exigida.test.ts -->
- [x] C13 — Con el árbol actual distinto del revisado, `computeNextStep` en `in_progress` indica volver a correr `valmen gate code-review`.
      <!-- test: npx vitest run tests/code-review-exigida.test.ts -->
- [x] C14 — Tras un `block` de la ronda 1, `computeNextStep` indica una sola corrección acotada a los hallazgos.
      <!-- test: npx vitest run tests/code-review-exigida.test.ts -->
- [x] C15 — Con un `review` de la ronda 2 sin decisión humana, `computeNextStep` devuelve el alto de una persona.
      <!-- test: npx vitest run tests/code-review-exigida.test.ts -->
- [x] C16 — Con la revisión exigida, el brief de un subagente lista `valmen gate code-review` entre las compuertas de implementación.
      <!-- test: npx vitest run tests/code-review-exigida.test.ts -->
- [x] C17 — La jornada autónoma con la revisión exigida corre `code-review` antes de entregar.
      <!-- test: npx vitest run tests/code-review-exigida-entregas.test.ts -->
- [x] C18 — La jornada autónoma con un `code-review` que no aprueba se detiene con `verification-failed` sin entregar el ticket.
      <!-- test: npx vitest run tests/code-review-exigida-entregas.test.ts -->
- [x] C19 — La corrida delegada con la revisión exigida corre `code-review` antes de entregar.
      <!-- test: npx vitest run tests/code-review-exigida-entregas.test.ts -->
- [x] C20 — `resolverCompuerta` con un motivo no aprueba un `review` de `code-review`.
      <!-- test: npx vitest run tests/code-review-exigida-entregas.test.ts -->

## Puntos

```json
[]
```

## Implementación

Se siguió el plan con una desviación menor: la tabla de decisión (sin recibo, árbol no vigente, `block` de la ronda 1, rechazo humano, `review` sin firma) vive en una sola función `revisionPendiente` (`packages/engine/src/revision-exigida.ts`) que consumen `transition`, `computeNextStep`, la jornada y la delegación, en lugar de duplicarse en `transition.ts` y `next-step.ts`; así lo que se indica al agente y lo que el motor exige no divergen.

- `packages/engine/src/discovery.ts`: `codeReviewExigida(root)` lee la clave del árbol de trabajo y de `HEAD:./.valmen/config.yaml`; nunca lanza.
- `packages/engine/src/transition.ts`: `exigirRevisionDeCodigo` tras `exigirVerificacionMecanica`, solo con la clave.
- `packages/engine/src/next-step.ts`, `journey-brief.ts`: el paso «revisión del diff» (con alto si la decide una persona) y el comando en el brief.
- `packages/engine/src/autonomous-run.ts`: campo `reviewDiff`; corre `code-review` antes de entregar y se detiene con `verification-failed` si no aprueba; nunca firma.
- `packages/cli/src/delegation.ts`, `ceremony.ts`: la delegación corre `code-review` antes de entregar y `resolverCompuerta` no aprueba un `review` de `code-review` aunque traiga motivo.
- Comentarios en `packages/engine/src/code-review.ts` y `packages/gate/src/definitions.ts`.
- La clave NO se activa en este repositorio: ningún paso escribe `.valmen/config.yaml`.

## Pruebas

Directorio: la raíz del worktree (`/Users/juanandrade/Desktop/ValmenHarness/.claude/worktrees/ticket-code-review-exigencia`). Requisito: `npm run build` hecho, Node 24 y git; los laboratorios son repositorios temporales y la clave solo vive en ellos.

- `npx vitest run tests/code-review-exigida.test.ts tests/code-review-exigida-entregas.test.ts`: esperado 31 pruebas en verde (tablas de entrega, clave, siguiente paso, brief, jornada, delegación y `resolverCompuerta`, con sus regresiones sin la clave).
- `npx vitest run tests/transitions.test.ts tests/next-step.test.ts tests/journey-brief.test.ts tests/journey-brief-worktree.test.ts tests/autonomous-run.test.ts tests/autonomous-stops.test.ts tests/integracion-autonoma.test.ts tests/delegation.test.ts tests/delegation-mcp.test.ts tests/code-review.test.ts tests/arbol-probado.test.ts tests/approve-close-shortcut.test.ts`: esperado 249 en verde, sin editar ninguna prueba existente.
- `npx tsc --noEmit -p tsconfig.json` (0 errores), `npm run exports:check`, `npm run format:check`.
- `npm run lint` ya traía 19 errores previos ajenos al ticket (p. ej. `Candidate` sin uso en `autonomous-run.ts:110`); los archivos del ticket no agregan ninguno.
- Las pruebas nuevas se escribieron antes del código y se observaron en rojo (17 de 23 y 5 de 8; pasaban solo los casos de control sin la clave y C2/C5, que ya valían).
- Validación manual: ninguna.

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
[
  {
    "kind": "ai-usage",
    "date": "2026-10-11",
    "session_reference": null,
    "model": "claude-sonnet-5-5",
    "reasoning_effort": null,
    "notes": "La sesión no expone números de tokens ni costo; solo trabajó este ticket.",
    "input_tokens": null,
    "output_tokens": null,
    "total_tokens": null,
    "estimated_cost_usd": null,
    "source": "manual:sesión de Claude Code sin agregado expuesto",
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
    "date": "2026-10-10",
    "at": "2026-10-11T01:25:12.308Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-11",
    "at": "2026-10-11T05:15:14.613Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-11",
    "at": "2026-10-11T05:17:23.404Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-11",
    "at": "2026-10-11T05:22:34.884Z",
    "action": "gate-approved",
    "actor": "cli",
    "details": "Gate plan aprobado por juan andrade (recibo GR-20261011-FEATURE-GATE-CODE-REVIEW-EXIGENCIA-20261010-plan-1, canal cli, decidida 2026-10-11T05:22:34.876Z): Firmar y aprobar (Recomendado)"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-11",
    "at": "2026-10-11T05:22:35.248Z",
    "action": "plan-approved",
    "actor": "cli",
    "details": "{\"actor\":\"juan andrade\",\"source\":\"cli\",\"quote\":\"Firmar y aprobar (Recomendado)\",\"planHash\":\"sha256:907e76221b5e11f3188f0ac568436744d2d75eea0080b0079eca759ef01dc996\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-11",
    "at": "2026-10-11T05:22:35.573Z",
    "action": "plan-approval-verified",
    "actor": "cli",
    "details": "Aprobación del plan vigente: juan andrade (fuente cli), plan sha256:907e76221b5e11f3188f0ac568436744d2d75eea0080b0079eca759ef01dc996."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-11",
    "at": "2026-10-11T05:22:35.573Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-10-11",
    "at": "2026-10-11T05:22:58.740Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-10-11",
    "at": "2026-10-11T05:29:11.815Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-10-11",
    "at": "2026-10-11T05:32:28.364Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  }
]
```
