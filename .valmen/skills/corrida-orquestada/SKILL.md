---
name: corrida-orquestada
description: Usar cuando el PO pide ejecutar la jornada de hoy o una feature repartiendo los tickets en subagentes simultáneos, cada uno en su worktree —«ejecuta la jornada», «ejecuta el feature X de corrido»—, o cuando haya que retomar esa corrida. Para tickets uno tras otro sin subagentes, ver corrida-delegada.
version: 1.0.0
origen: valmen
---

# Corrida orquestada

La sesión que el PO abre es el **orquestador**: reparte los tickets de la jornada en subagentes, aprueba lo que la política permite, integra y entrega el parte. Los subagentes implementan; **no integran ni aprueban**. La programación sigue siendo `valmen journey plan`.

## Dependencias

Algunos comandos de este recorrido los entregan tickets hermanos. Mientras falten, **no los reemplazas con git a mano**: te detienes en ese paso, lo dices al PO y sigues con lo que sí existe.

- `valmen journey next --wave`, `journey brief`, `journey worktree create|remove`: ya en el CLI.
- `valmen journey worktree integrate`: FEATURE-ENGINE-INTEGRACION-RAMA-20261008. Sin él, la rama del subagente queda entregada y sin integrar: avisa.
- `valmen journey handoff`: FEATURE-ENGINE-JORNADA-HANDOFF-20261008. Sin él, el parte lo armas leyendo la sección `## Pruebas` de cada ticket.
- Aprobación automática por autorización: SECURITY-ENGINE-APROBACION-POR-AUTORIZACION-20261007. Mientras no exista, **todos los planes van en lote al PO**.

## Pedir la ola

`valmen journey next --wave [--concurrency N]` lista los tickets listos de la jornada, contando los que ya están en curso. Son **3 simultáneos por defecto**; el PO los cambia al pedir la corrida («de a 5») o con `--concurrency N`. Si no hay jornada, `valmen journey plan` la arma. No lances más de lo que devuelve la ola.

## Lanzar los subagentes

Un subagente por ticket, **en segundo plano** y en su **propio worktree**:

1. `valmen journey worktree create --id <ID>` desde el checkout principal (rama `valmen/ticket-<slug>`), o `isolation: worktree` al lanzar el agente.
2. `valmen journey brief --id <ID>` imprime el brief. Su texto es el **único contexto** del subagente: pásalo entero, sin resumirlo ni añadirle permisos.
3. Pide el modelo y esfuerzo que el brief declara para la fase.

El subagente trabaja solo en su worktree, recorre `valmen resume --id <ID>` y se detiene en el primer alto: plan por aprobar o ticket en `awaiting_user_tests`. Cuando termina, lee su informe y vuelve a pedir la ola.

## Aprobar

Por cada plan listo, antes de pedirle nada al PO:

1. `valmen approval-eligibility --id <ID> --stage plan` decide en código si es elegible (sale con 3 si no).
2. `valmen approval-authorize list` y `valmen qa-authorize list` muestran las autorizaciones vigentes.
3. **Elegible y con autorización vigente** (cuando exista el registro de la dependencia): se aprueba atribuida a la autorización, nunca al modelo.
4. **Todo lo demás, en lote al PO**: junta los planes de la ola, resume cada uno en dos líneas y espera su frase. El PO aprueba con `valmen approve-plan --id <ID> --actor <nombre> --quote "<su frase>"` por ticket. Sin frase literal no hay aprobación; no la completes.
5. **SECURITY y despliegue nunca se aprueban solos**: se detienen para una persona, con o sin autorización.

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
