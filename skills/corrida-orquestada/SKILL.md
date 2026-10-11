---
name: corrida-orquestada
description: Usar cuando el PO pide ejecutar la jornada de hoy o una feature repartiendo los tickets en subagentes simultáneos, cada uno en su worktree —«ejecuta la jornada», «ejecuta el feature X de corrido»—, o cuando haya que retomar esa corrida. Para tickets uno tras otro sin subagentes, ver corrida-delegada.
version: 1.4.0
origen: valmen
---

# Corrida orquestada

La sesión que el PO abre es el **orquestador**: reparte los tickets de la jornada en subagentes, aprueba lo que la política permite, integra y entrega el parte. Los subagentes implementan; **no integran ni aprueban**.

## Dependencias

Si un comando de este recorrido falta, **no lo reemplazas con git a mano**: te detienes, lo dices al PO y sigues con lo que sí existe.

Ya están en el CLI: `valmen journey next --wave`, `journey brief`, `journey worktree create|integrate|remove`, `journey handoff` y la aprobación por autorización (`valmen approval-eligibility`, `approve-by-authorization`, `journey approve-eligible`).

## Pedir la ola

`valmen journey next --wave [--concurrency N]` lista los tickets listos de la jornada, contando los que ya están en curso. Son **3 simultáneos por defecto**; el PO los cambia al pedir la corrida («de a 5») o con `--concurrency N`. Sin jornada: `valmen journey plan --project <id> --feature <slug>` (o `--tickets a,b,c`, y `--max <n>` si el PO fija cuántos). No lances más de lo que devuelve la ola.

## Lanzar los subagentes

Un subagente por ticket, **en segundo plano** y en su **propio worktree**:

1. `valmen journey worktree create --id <ID>` desde el checkout principal (rama `valmen/ticket-<slug>`) o `isolation: worktree`.
2. Antes de lanzar a un subagente de implementación, trae `main` a su rama y **comprueba que no hay conflicto**; no lo lances en paralelo al merge.
3. `valmen journey brief --id <ID>` con `--out <ruta>` escribe el brief en un archivo, sin pegarlo en la conversación. Su texto es el **único contexto** del subagente: dale solo la ruta y la orden de leerlo entero, sin resumirlo ni añadirle permisos. El brief toma el estado del registro del worktree.
4. Pide el modelo y esfuerzo que el brief declara para la fase. Análisis y plan pueden ir a `sonnet` solo en BUGFIX, CHORE o IMPROVEMENT de riesgo bajo, sin impactos ni tocar motor, compuertas o permisos; el resto conserva el modelo del brief.

El subagente trabaja solo en su worktree y arranca por `valmen resume --id <ID>` en él; se detiene en el primer alto: plan por aprobar o ticket en `awaiting_user_tests`. Si el ticket cambia el propio harness, corre compuertas y entrega con `node packages/cli/dist/main.js` de su worktree, no con el `valmen` del PATH. Al terminar, lee su informe (8 líneas) y vuelve a pedir la ola.

## Aprobar

Con los planes de la ola listos, antes de pedirle nada al PO y en sesión atendida (una desatendida la niega):

1. `valmen journey approve-eligible --journey <id>` aprueba por autorización los planes elegibles —atribuidos a la autorización, nunca al modelo— y los deja en `approved`. Imprime los pendientes con su decisión. `valmen approval-authorize list` muestra las autorizaciones vigentes; `valmen approval-eligibility --id <ID> --stage plan` explica un ticket suelto.
2. `valmen journey notify-plans --project <id> --journey <id> --to telegram` avisa al PO de los pendientes: emite código solo para los que siguen en `planned`.
3. **Todo lo demás, en lote al PO** —también los planes en REVIEW por una duda del evaluador sin contradicción—: resume cada pendiente en dos líneas y espera su frase. El PO aprueba con `valmen plan-approve --code <código> --actor <nombre> --quote "<su frase>"` o, por ticket, con `valmen approve-plan --id <ID> --actor <nombre> --quote "<su frase>"`. Sin frase literal no hay aprobación.
4. **SECURITY, despliegue y un `block` nunca se aprueban solos**: la orden los deja pendientes para una persona, con o sin autorización. Un pendiente «derivable al revisor» sigue siendo del PO.

## Integrar

Solo el orquestador, **de a uno** y en el orden en que los subagentes entregaron:

1. `valmen journey worktree integrate --id <ID>` con `--retirar` integra la rama al checkout principal y, si integró, retira el worktree, la rama y el cupo. Si el retiro falla, `valmen journey worktree remove --id <ID>`.
2. Conflicto: lo resuelves tú si es mecánico, o lo devuelves al subagente con el diff para que corrija en su rama; después reintentas.

## Suite completa, una sola vez

Los subagentes corren solo las de su ticket. **Tras integrar la ola**, el orquestador corre `npx vitest run` **una sola vez** en el principal: dos suites a la vez se cuelgan. Un rojo se devuelve al subagente del ticket que lo causó; no se sigue con la ola siguiente sobre un rojo.

## Contexto del orquestador

De la suite muestra solo las líneas `Test Files` y `Tests` y los fallos. No pegues salidas largas de comandos: cita el comando y el resultado. Del subagente no pidas más detalle que el ticket.

## Reglas duras

- **Solo el orquestador toca el checkout principal.** Los subagentes escriben en su worktree y rama; un solo escritor por archivo.
- Nunca `git push`, force, `--no-verify` ni tags. Publicar lo decide el PO.
- Un **BLOCK**, una compuerta humana dura (SECURITY, despliegue, migraciones) y lo **fuera del alcance** del ticket se detienen: se reportan al PO, no se fuerzan ni se esquivan.
- Una REVIEW la decide una persona, no el modelo.
- El estado vive en el registro: ante la duda, `valmen resume --id <ID> --quiet`.

## QA por comandos

Un ticket entregado cuyos criterios se verifican todos por comando se cierra aquí mismo con su ciclo de QA, citando la frase del PO que lo autoriza; con QA por agente vigente y promovida, la hace el agente. Lo de pantalla, de un entorno que no tienes o `verify: manual` queda en `awaiting_user_tests` y va al parte con cómo probarlo. Un SECURITY solo se cierra con la frase del PO. No marques `[x]` un criterio manual que no verificaste.

## Cerrar

Al terminar la jornada (o cortarla con el máximo): `valmen journey handoff --id <JORNADA>` genera el parte de pruebas de los tickets en `awaiting_user_tests`. Entrégalo al PO con lo detenido y por qué: planes sin frase, BLOCK, conflictos, ramas sin integrar.
