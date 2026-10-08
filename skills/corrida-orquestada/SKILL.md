---
name: corrida-orquestada
description: Usar cuando el PO pide ejecutar la jornada de hoy o una feature repartiendo los tickets en subagentes simultáneos, cada uno en su worktree —«ejecuta la jornada», «ejecuta el feature X de corrido»—, o cuando haya que retomar esa corrida. Para tickets uno tras otro sin subagentes, ver corrida-delegada.
version: 1.0.0
origen: valmen
---

# Corrida orquestada

La sesión que el PO abre es el **orquestador**: reparte los tickets de la jornada en subagentes, aprueba lo que la política permite, integra y entrega el parte. Los subagentes implementan; **no integran ni aprueban**. La programación sigue siendo `valmen journey plan`.

## Dependencias

Si un comando de este recorrido falta, **no lo reemplazas con git a mano**: te detienes en ese paso, lo dices al PO y sigues con lo que sí existe.

- `valmen journey next --wave`, `journey brief`, `journey worktree create|integrate|remove` y `journey handoff`: ya en el CLI.
- Aprobación por autorización: `valmen approval-eligibility`, `approve-by-authorization` y `journey approve-eligible`, ya en el CLI.

## Pedir la ola

`valmen journey next --wave [--concurrency N]` lista los tickets listos de la jornada, contando los que ya están en curso. Son **3 simultáneos por defecto**; el PO los cambia al pedir la corrida («de a 5») o con `--concurrency N`. Si no hay jornada, `valmen journey plan` la arma. No lances más de lo que devuelve la ola.

## Lanzar los subagentes

Un subagente por ticket, **en segundo plano** y en su **propio worktree**:

1. `valmen journey worktree create --id <ID>` desde el checkout principal (rama `valmen/ticket-<slug>`), o `isolation: worktree` al lanzar el agente.
2. `valmen journey brief --id <ID>` imprime el brief. Su texto es el **único contexto** del subagente: pásalo entero, sin resumirlo ni añadirle permisos.
3. Pide el modelo y esfuerzo que el brief declara para la fase.

El subagente trabaja solo en su worktree, recorre `valmen resume --id <ID>` y se detiene en el primer alto: plan por aprobar o ticket en `awaiting_user_tests`. Cuando termina, lee su informe y vuelve a pedir la ola.

## Aprobar

Con los planes de la ola listos, antes de pedirle nada al PO y en sesión atendida (la orden se niega en una desatendida):

1. `valmen journey approve-eligible --journey <id>` aprueba por autorización los planes elegibles —atribuidos a la autorización, nunca al modelo— y los deja en `approved`. Imprime los pendientes con su decisión en opciones y efecto. `valmen approval-authorize list` muestra las autorizaciones vigentes; `valmen approval-eligibility --id <ID> --stage plan` explica un ticket suelto.
2. `valmen journey notify-plans --project <id> --journey <id> --to telegram` avisa al PO de los pendientes: emite código solo para los que siguen en `planned`.
3. **Todo lo demás, en lote al PO**: junta los pendientes, resume cada uno en dos líneas y espera su frase. El PO aprueba con `valmen plan-approve --code <código> --actor <nombre> --quote "<su frase>"` o, por ticket, con `valmen approve-plan --id <ID> --actor <nombre> --quote "<su frase>"`. Sin frase literal no hay aprobación; no la completes.
4. **SECURITY, despliegue y un `block` nunca se aprueban solos**: la orden los deja pendientes para una persona, con o sin autorización. Un pendiente «derivable al revisor» sigue siendo del PO: no se le pide nada al revisor desde la jornada.

## Integrar

Solo el orquestador, **de a uno** y en el orden en que los subagentes entregaron:

1. `valmen journey worktree integrate --id <ID>` integra la rama al checkout principal.
2. Conflicto: lo resuelves tú si es mecánico, o lo devuelves al subagente con el diff del conflicto para que corrija en su rama; después reintentas.
3. `valmen journey worktree remove --id <ID>` retira el worktree de lo ya integrado.

## Suite completa, una sola vez

Los subagentes corren solo las pruebas de su ticket. **Tras integrar la ola**, el orquestador corre `npx vitest run` **una sola vez** en el checkout principal: dos suites a la vez se cuelgan. Un rojo se atribuye al ticket cuyo cambio lo causó y se devuelve a su subagente; no se sigue con la ola siguiente sobre un rojo.

## Reglas duras

- **Solo el orquestador toca el checkout principal.** Los subagentes escriben en su worktree y rama; un solo escritor por archivo.
- Nunca `git push`, force, `--no-verify` ni tags. Publicar lo decide el PO.
- Un **BLOCK**, una compuerta humana dura (SECURITY, despliegue, migraciones) y lo que quede **fuera del alcance** del ticket se detienen: se reportan al PO, no se fuerzan ni se esquivan.
- Una REVIEW no se aprueba por el modelo: la decide una persona.
- El estado vive en el registro, no en la conversación: ante la duda, `valmen resume --id <ID>`.

## Cerrar

Al terminar la jornada (o al cortarla con el máximo): `valmen journey handoff --id <JORNADA>` genera el parte de pruebas por ticket en `awaiting_user_tests`: qué probar y cómo. Entrégalo al PO con lo que quedó detenido y por qué: planes sin frase, BLOCK, conflictos, ramas sin integrar.
