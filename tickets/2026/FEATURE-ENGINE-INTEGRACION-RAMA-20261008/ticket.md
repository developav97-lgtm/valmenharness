---
schema_version: 2
id: FEATURE-ENGINE-INTEGRACION-RAMA-20261008
title: Integrar la rama de un worktree al checkout principal uniendo los registros append-only
type: FEATURE
module: ENGINE
workflow_status: closed
qa_status: approved
release_status: unreleased
user_visible: false
sync_impact: false
migration_impact: false
docker_impact: false
risk_level: normal
created: 2026-10-08
updated: 2026-10-08
related_ticket: null
target_release: null
released_in: null
---

# FEATURE-ENGINE-INTEGRACION-RAMA-20261008

## Solicitud original

Contexto: el PO decidió partir FEATURE-ENGINE-INTEGRACION-WORKTREE-20261008 (40 criterios) en dos tickets. Este es el de integrar; el otro queda con crear y quitar el worktree. Corrida orquestada: docs/propuesta-corrida-orquestada.md. Este ticket: `valmen journey worktree integrate --id <ID>` integra la rama del worktree de un ticket al checkout principal (main) con avance directo si se puede o merge --no-ff si no, con comprobación previa por merge-tree; une los registros append-only por eventId renumerando cursores (hoy esa unión no existe en integration-commit.ts y se hizo a mano), regenera tickets/index.md con valmen index, recompila (tsc --build y copy-web) y avisa de los conflictos de código sin resolverlos. Se niega si el checkout principal está sucio; nunca hace push ni fuerza. El plan ya escrito en FEATURE-ENGINE-INTEGRACION-WORKTREE-20261008 (pasos de integrarWorktree y worktree-registros.ts) es el punto de partida.

### Supuestos y decisiones pendientes

<!-- Si el pedido nombra algo que el código no tiene —parámetro, permiso,
campo, bandera, columna, migración— y no lo especifica, listá cada elemento
con su pregunta antes de avanzar a análisis; el análisis no planifica sobre
la adivinanza. Si no hay ninguno, escribí «Ninguno» y seguí. -->
Ninguno.

## Descripción funcional

- Alcance: el subcomando `valmen journey worktree integrate --id <ID>`, el carril de integración de la corrida orquestada (ticket 4 de `docs/propuesta-corrida-orquestada.md`, partido en dos por decisión del PO; `create` y `remove` son de FEATURE-ENGINE-INTEGRACION-WORKTREE-20261008). Integra la rama `valmen/ticket-<slug>` al checkout principal (`main`) con avance directo si se puede o `merge --no-ff` si no, con una comprobación previa por `merge-tree`; une los registros append-only por `eventId` renumerando cursores, regenera `tickets/index.md`, recompila y avisa de los conflictos de código sin resolverlos. Exclusiones: crear y quitar el worktree y el cupo de máquina (ticket WORKTREE); resolver conflictos de código; unir bloques dentro de `ticket.md`; push, force y tags; decidir cuándo integrar.
- Usuario o rol afectado: la sesión orquestadora de Claude Code, que es el único escritor del checkout principal, y el PO, que hoy hace estos pasos a mano.
- Comportamiento actual: no existe ningún comando; la rama de cada worktree se integra a mano con `merge` y los registros append-only (cursores de eventos, índice) se reparan a mano (commit `aac6eaa`). La propuesta cuenta ~8 intervenciones manuales de ese tipo en la jornada.
- Comportamiento esperado: `integrate` hace su trabajo con una lista cerrada de operaciones git, sin push ni force, y se niega (salida 3) ante cualquier precondición rota sin dejar la repo a medias: no toca `main` si hay conflictos de código o el checkout principal está sucio, y ante una unión de registros imposible hace `merge --abort`.
- Dependencia del ticket WORKTREE: solo por el nombre de la rama y el layout del worktree. Importa de él, sin modificarlos, `nombresDeWorktree` (rama `valmen/ticket-<slug>`, carpeta `.claude/worktrees/ticket-<slug>`), `exigirCheckoutPrincipal`, `motivoDeGitDeWorktree` y `ejecutarProcesoDeWorktree` (la receta de build), y extiende la tabla de subcomandos de packages/cli/src/worktree.ts. Se implementa después de que WORKTREE esté en `main`.

## Diagnóstico

- Causa comprobada (con `ruta:línea`): (1) no hay comando: `journey` solo admite plan, advance, install-trigger, notify-plans y clear-stop (`packages/cli/src/main.ts:1992-2004`). (2) El pedido dice que la unión de logs «ya la hace integration-commit.ts», pero no es así: `packages/engine/src/integration-commit.ts` commitea un ticket (`integrarTicket`, `:235`) y avanza la rama de trabajo con `merge --ff-only` (`asegurarRamaDeTrabajo`, `:136`), sin ninguna función que una registros ni renumere cursores; los cursores se repararon a mano (commit `aac6eaa`). Lo reutilizable es `estadoDelArbolDeTrabajo` (`:60`), `ramaActual` (`:75`) y `RAMA_BASE` (`:127`); de `packages/engine/src/integration-rules.ts`, el tipo `EjecutorDeGit` (`:132`) y la lista de archivos prohibidos `PROHIBIDOS` (`:35`), hoy accesible solo vía `motivoDeArchivoProhibido` (`:46`), sin exportar. (3) La lista git de la jornada no alcanza: `OPERACIONES_PERMITIDAS` (`:87`) no incluye `show` ni `merge-tree`, y `merge` solo se admite como `--ff-only` (`:124`); ampliarla ampliaría la autoridad de la jornada autónoma, y el precedente es una lista propia (`packages/engine/src/qa-agent-git.ts`). (4) El riesgo de una unión mal hecha es real: `readExecutionEvents` (`packages/engine/src/execution-events.ts:152`) lanza si los cursores no son consecutivos (`:170`), y cada evento recibe `history.length + 1` (`:144`), así que dos ramas que añaden eventos dejan ilegible el historial entero; «mismo hecho» lo define `sameEvent` (`:369`). Memoria: `buscar_memoria` no halló antecedentes de integración de ramas ni de unión de registros; AP-002 (`.valmen/memory/aprendizajes.md:13`) obliga a imports relativos dentro del paquete y AP-001 (`:5`) a criterios atómicos con pasos concretos. Como es funcionalidad nueva, el «síntoma» es la intervención manual descrita en el comportamiento actual.
- Hipótesis pendientes: ninguna sobre la causa. Las decisiones de diseño están en el Plan para que el PO las cambie al aprobar.
- Consumidores afectados: comprobado con búsqueda, `integration-rules.ts` solo gana un `export` y lo importan `integration-commit.ts:17` y `qa-eligibility.ts:18`, sin cambio de firmas; `estadoDelArbolDeTrabajo` lo usan `autonomous-run.ts:362` y `journey-dispatch.ts:143`, que no cambian. `main.ts` gana una línea de ayuda y el mensaje «journey admite» pasa a listar `integrate`; `VALUE_OPTIONS` no cambia (solo `--id`) y `tests/cli.test.ts:197` compara ayuda y opciones. Los tickets hermanos WORKTREE, JORNADA-OLA, JORNADA-HANDOFF y CHORE-CLI-RETIRO-DISPARADOR-JORNADA editan el mismo `journey` y la ayuda de `main.ts`: conflicto probable, mitigado dejando la lógica en archivos nuevos del motor y del CLI.
- Archivos y flujo investigados: `packages/engine/src/integration-rules.ts`, `packages/engine/src/integration-commit.ts`, `packages/engine/src/qa-agent-git.ts`, `packages/engine/src/execution-events.ts`, `packages/engine/src/index-file.ts`, `packages/engine/src/discovery.ts`, `packages/cli/src/main.ts`, `packages/cli/src/commands.ts`, `scripts/copy-web.mjs`, `tests/integracion-autonoma.test.ts`. Los registros versionados que dos ramas pueden alargar a la vez son `.valmen/executions/events.jsonl`, `.valmen/journeys/*.jsonl`, `.valmen/autonomous-stops.jsonl` y `.valmen/receipts/<ID>.jsonl`. Comprobado en un repositorio de laboratorio con git 2.54: `merge-tree --write-tree --name-only --no-messages` lista los conflictos sin tocar el árbol (salida 1) y `branch -d` rechaza una rama no integrada.
- Riesgos y compatibilidad: (a) integrar escribe en `main`: precondiciones en código (checkout principal limpio y en `main`, worktree limpio, sin archivos prohibidos, sin solape con cambios sin commit) y `merge --abort` como única vía de vuelta; (b) `merge-tree --write-tree` exige git 2.38 o más; (c) los bloques dentro de `ticket.md` no se unen: un conflicto ahí se informa; (d) `integrate` no exige un estado del ticket, para poder integrar también planes; (e) recompilar reescribe `dist` del propio CLI en marcha, al final de la operación; (f) un registro nuevo en las dos ramas (alta en ambas, sin base) se une tomando la base vacía.
- Impactos de sync, migración, Docker o despliegue: ninguno

## Plan

- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan).
- Alcance: `integrate` de `journey worktree`, su lista cerrada de operaciones git, la unión de registros append-only y sus pruebas. Exclusiones: las de la descripción funcional. Depende de FEATURE-ENGINE-INTEGRACION-WORKTREE-20261008 solo por el nombre de la rama y el layout del worktree.
- Pasos ordenados:
  1. En `packages/engine/src/integration-rules.ts` exportar `motivoDeArchivoProhibido` (línea 46) para reutilizar `PROHIBIDOS` sin duplicarlo; no tocar `OPERACIONES_PERMITIDAS` ni `BANDERAS_PROHIBIDAS`: la autoridad git de la jornada no se amplía. (C11)
  2. Crear worktree-integracion-git.ts en `packages/engine/src` siguiendo `packages/engine/src/qa-agent-git.ts`: `motivoDeGitDeIntegracion` y `ejecutarGitDeIntegracion` con una lista cerrada que se suma a la de `motivoDeGitDeWorktree` (lectura: `show <rev>:<ruta>`, `diff --name-only -z <rango>`, `merge-base <a> <b>`, `merge-tree --write-tree --name-only --no-messages <a> <b>`; escritura: `merge --ff-only <rama>`, `merge --no-ff --no-commit <rama>`, `merge --abort`, `add --` con archivos, `commit -m`; nunca push, fetch, pull, reset, rebase, clean, tag, remote, force, `-D`, `--hard`). Rechaza con `fail(..., EXIT_INVARIANT)` antes de lanzar y reutiliza el tipo `EjecutorDeGit`. (C27)
  3. Crear worktree-registros.ts en `packages/engine/src` con `esRegistroUnible(ruta)` (lista cerrada: `.valmen/executions/events.jsonl`, `.valmen/receipts/*.jsonl`, `.valmen/journeys/*.jsonl`, `.valmen/autonomous-stops.jsonl`) y `unirRegistro({ruta, base, ours, theirs})`: exige que la base (vacía si el archivo no existía) sea prefijo de ambas versiones, deduplica por `eventId` con la noción de «mismo hecho» de `sameEvent` (`packages/engine/src/execution-events.ts:369`, sin `cursor` ni `receivedAt`), renumera solo el cursor de los entrantes como `history.length + 1` (`:144`), y para registros sin `eventId` une por línea idéntica; devuelve `{ok:false, motivo}` ante `eventId` con contenido distinto o línea previa editada. (C1, C2, C3, C4, C5, C6, C7, C8)
  4. Crear worktree-integrar.ts en `packages/engine/src` con `integrarWorktree({paths, ticketId, home?, git?, proceso?})`: checkout principal con `exigirCheckoutPrincipal` del módulo de WORKTREE, que rechaza la ejecución desde un worktree enlazado y señala el checkout principal (C15); rama y carpeta de `nombresDeWorktree`, y la rama debe existir (C16); `main` en la rama actual con `ramaActual` y `RAMA_BASE` de `packages/engine/src/integration-commit.ts` (C14); rama ya ancestro de `main`: «nada que integrar», salida 0 (C13); worktree limpio con `estadoDelArbolDeTrabajo` (C12); archivos de `diff --name-only -z main...<rama>` sin `motivoDeArchivoProhibido` (C11); checkout principal limpio con `estadoDelArbolDeTrabajo` (C9) y sin solape entre `status --porcelain` crudo y los archivos de la rama (C10); si `main` es ancestro de la rama, `merge --ff-only` (C17); si no, `merge-tree` previo: conflictos fuera de `esRegistroUnible` y de `tickets/index.md` se listan y no se toca nada (C18); si no, `merge --no-ff --no-commit`, cada registro en conflicto se resuelve con `unirRegistro` leyendo `show` de la base, de `main` y de la rama, escrito con `atomicWrite` (`packages/core/src/fs.ts:105`) y `add --`; una unión fallida ejecuta `merge --abort` (C19, C20, C21); `tickets/index.md` se regenera con `renderIndex` (`packages/engine/src/index-file.ts:72`) dentro del commit de merge, o en un commit propio tras el avance directo (C22); por último recompila el checkout principal con `ejecutarProcesoDeWorktree`, y si falla conserva la integración y sale con 3 (C23, C24).
  5. Exportar los módulos nuevos desde `packages/engine/src/index.ts` junto a `export * from "./integration-rules.js"`, con imports relativos entre módulos del paquete (AP-002). (C27)
  6. En packages/cli/src/worktree.ts (creado por el ticket WORKTREE) agregar `integrate` a la tabla de subcomandos y su salida (salida 3 para rechazos y conflictos); un subcomando desconocido, la ausencia de subcomando o la ausencia de `--id` salen con 2 y el mensaje lista `create`, `integrate` y `remove`; en `packages/cli/src/main.ts` actualizar el mensaje «journey admite» (línea 2004) y la línea de ayuda junto a `journey worktree create|remove`. `--id` ya está en `VALUE_OPTIONS`. (C25, C26)
  7. Pruebas: crear tests/worktree-registros.test.ts y tests/worktree-integrar.test.ts (repositorio git de laboratorio real con una rama creada a mano, como en `tests/integracion-autonoma.test.ts`, y compilación simulada con un ejecutor de procesos que registra las llamadas), más casos de `integrate` en tests/worktree-cli.test.ts; un caso por criterio y un control por barrera: checkout sucio, solape, archivo prohibido, worktree sucio, fuera de `main`, conflicto de código y unión imposible. Correr `npx vitest run tests/worktree-registros.test.ts tests/worktree-integrar.test.ts tests/worktree-cli.test.ts tests/cli.test.ts tests/reglas-integracion.test.ts tests/integracion-autonoma.test.ts` y `npx tsc --noEmit -p tsconfig.json`. (C1–C28)
  8. Entrega: dejar en `## Pruebas` los comandos del paso 7 desde la raíz del repositorio, el resultado esperado (todos en verde, tipos sin salida), requisitos (Node 24, git 2.38 o más, `dist` construido con `npm run build`, ticket WORKTREE integrado) y la validación manual en un clon de laboratorio, no en el checkout real: `create` del ticket WORKTREE, un commit en la rama, `integrate`. El ticket pasa a `awaiting_user_tests`. (C1–C28)
- Decisiones de diseño que el PO puede cambiar al aprobar:
  - D1: la unión de registros no existía en `integration-commit.ts` como dice el pedido; se implementa en un módulo nuevo.
  - D2: lista git propia, sin ampliar la de la jornada (precedente `qa-agent-git.ts`), sumada a la de WORKTREE.
  - D3: el destino es siempre `main`; el checkout principal debe estar en esa rama.
  - D4: los conflictos de código y los bloques de `ticket.md` se informan y no se resuelven.
  - D5: `integrate` no exige un estado del ticket, para poder integrar planes.
  - D6: este ticket se implementa después de WORKTREE; si el PO prefiere el orden inverso, `nombresDeWorktree` y `exigirCheckoutPrincipal` se mueven aquí.
- Impactos declarados: ninguno; el ticket no declara sincronización, migración ni contenedores.
- Rollback (obligatorio): revertir el commit del ticket; los módulos y el subcomando son nuevos y nadie más los llama, el único cambio en código existente es un `export`. Una integración mal hecha la revierte una persona con `git revert -m 1 <merge>`, el harness nunca hace reset.

<!-- Los criterios de la sección siguiente se numeran C1…Cn, con una afirmación verificable por criterio
     —una frase con «y» son dos criterios—, y cada uno lleva debajo su anotación de
     verificación: un comentario HTML que dice «test:» y el comando, o «verify: manual». La
     sección no lleva comentarios dentro: un comentario con anotación se leería como la de un
     criterio. Ejemplo en la skill planificacion. -->
## Criterios de aceptación

- [x] C1. Unir dos versiones de `.valmen/executions/events.jsonl` conserva cada evento de las dos por `eventId`, sin duplicar el que ya estaba
      <!-- test: npx vitest run tests/worktree-registros.test.ts -->
- [x] C2. Tras unir `.valmen/executions/events.jsonl`, los cursores son consecutivos de 1 a N
      <!-- test: npx vitest run tests/worktree-registros.test.ts -->
- [x] C3. Al unir `.valmen/executions/events.jsonl`, lo único que cambia respecto de las dos versiones es el cursor de los eventos entrantes
      <!-- test: npx vitest run tests/worktree-registros.test.ts -->
- [x] C4. Un mismo `eventId` con contenido distinto en las dos versiones no se une y se informa como conflicto
      <!-- test: npx vitest run tests/worktree-registros.test.ts -->
- [x] C5. Un registro donde una versión editó o borró una línea previa no se une y se informa como conflicto
      <!-- test: npx vitest run tests/worktree-registros.test.ts -->
- [x] C6. Los registros sin `eventId` (`.valmen/journeys/pasadas.jsonl`, `.valmen/receipts/<ID>.jsonl`) se unen por línea idéntica, sin duplicar
      <!-- test: npx vitest run tests/worktree-registros.test.ts -->
- [x] C7. Un registro que las dos versiones crearon sin base común se une tomando la base vacía
      <!-- test: npx vitest run tests/worktree-registros.test.ts -->
- [x] C8. `esRegistroUnible` rechaza `ticket.md`, el código y cualquier ruta fuera de la lista cerrada de registros
      <!-- test: npx vitest run tests/worktree-registros.test.ts -->
- [x] C9. `integrate` se niega, sin modificar nada, si el checkout principal está sucio
      <!-- test: npx vitest run tests/worktree-integrar.test.ts -->
- [x] C10. `integrate` se niega si un archivo con cambios sin commit del checkout principal también lo cambia la rama
      <!-- test: npx vitest run tests/worktree-integrar.test.ts -->
- [x] C11. `integrate` se niega si la rama cambia archivos que una jornada no commitea (credenciales o configuración del harness)
      <!-- test: npx vitest run tests/worktree-integrar.test.ts -->
- [x] C12. `integrate` se niega si el worktree tiene cambios sin commit
      <!-- test: npx vitest run tests/worktree-integrar.test.ts -->
- [x] C13. `integrate` sobre una rama ya integrada responde «nada que integrar», sale con 0 y no modifica `main`
      <!-- test: npx vitest run tests/worktree-integrar.test.ts -->
- [x] C14. `integrate` se niega si el checkout principal no está en `main`
      <!-- test: npx vitest run tests/worktree-integrar.test.ts -->
- [x] C15. `integrate` se niega a correr desde un worktree enlazado y señala el checkout principal
      <!-- test: npx vitest run tests/worktree-integrar.test.ts -->
- [x] C16. `integrate` se niega si la rama o el worktree del ticket no existen
      <!-- test: npx vitest run tests/worktree-integrar.test.ts -->
- [x] C17. `integrate` avanza `main` con `merge --ff-only` cuando `main` no se movió desde que nació la rama, sin commit de merge
      <!-- test: npx vitest run tests/worktree-integrar.test.ts -->
- [x] C18. Ante un conflicto fuera de los registros append-only, `integrate` no modifica `main`, lista los archivos en conflicto y sale con 3
      <!-- test: npx vitest run tests/worktree-integrar.test.ts -->
- [x] C19. `integrate` hace `merge --no-ff` cuando `main` avanzó, y el commit resultante tiene dos padres
      <!-- test: npx vitest run tests/worktree-integrar.test.ts -->
- [x] C20. En el merge, las dos versiones de `.valmen/executions/events.jsonl` quedan unidas por `eventId` con cursores consecutivos
      <!-- test: npx vitest run tests/worktree-integrar.test.ts -->
- [x] C21. Si la unión de un registro es imposible, `integrate` ejecuta `merge --abort`, deja `main` como estaba y sale con 3
      <!-- test: npx vitest run tests/worktree-integrar.test.ts -->
- [x] C22. `integrate` regenera `tickets/index.md` y el resultado coincide con el que produce `valmen index`
      <!-- test: npx vitest run tests/worktree-integrar.test.ts -->
- [x] C23. `integrate` recompila el checkout principal con la receta de build tras integrar
      <!-- test: npx vitest run tests/worktree-integrar.test.ts -->
- [x] C24. Si la recompilación falla, `integrate` conserva la integración, sale con 3 y lo dice
      <!-- test: npx vitest run tests/worktree-integrar.test.ts -->
- [x] C25. `valmen journey worktree integrate` figura en la ayuda y toda bandera documentada con valor está en `VALUE_OPTIONS`
      <!-- test: npx vitest run tests/worktree-cli.test.ts tests/cli.test.ts -->
- [x] C26. `journey worktree` con un subcomando desconocido o sin `--id` sale con 2 y el mensaje incluye `integrate` entre los admitidos
      <!-- test: npx vitest run tests/worktree-cli.test.ts tests/cli.test.ts -->
- [x] C27. Los comandos git y de proceso que lanza `integrate` salen todos de las listas cerradas, sin push, fetch, reset ni banderas de fuerza
      <!-- test: npx vitest run tests/worktree-integrar.test.ts -->
- [x] C28. La comprobación de tipos pasa
      <!-- test: npx tsc --noEmit -p tsconfig.json -->

## Puntos

```json
[
  {
    "id": "POINT-001",
    "title": "Verificación del cierre de FEATURE-ENGINE-INTEGRACION-RAMA-20261008",
    "status": "closed",
    "severity": "normal",
    "actual": "La implementación está entregada y falta cerrar su QA.",
    "expected": "Los criterios del ticket se cumplen y sus pruebas dan el resultado esperado.",
    "evidence": [
      "EVIDENCE-001"
    ],
    "affected_files": [
      "packages/cli/src/main.ts",
      "packages/cli/src/worktree.ts",
      "packages/engine/src/index.ts",
      "packages/engine/src/integration-rules.ts",
      "packages/engine/src/worktree-integracion-git.ts",
      "packages/engine/src/worktree-integrar.ts"
    ],
    "diagnosis": null,
    "solution": null,
    "tests": [],
    "qa_cycles": [
      "QA-001"
    ],
    "terminal_reason": null,
    "related_ticket": null
  }
]
```

## Implementación

- `packages/engine/src/integration-rules.ts`: se exporta `motivoDeArchivoProhibido`; no se tocan `OPERACIONES_PERMITIDAS` ni `BANDERAS_PROHIBIDAS`.
- `packages/engine/src/worktree-integracion-git.ts` (nuevo): `motivoDeGitDeIntegracion` y `ejecutarGitDeIntegracion`, lista cerrada que se suma a `motivoDeGitDeWorktree` (`show`, `diff --name-only -z`, `merge-base`, `merge-tree --write-tree --name-only --no-messages`, `merge --ff-only|--no-ff --no-commit|--abort`, `add --`, `commit -m`); rechaza antes de lanzar.
- `packages/engine/src/worktree-registros.ts` (nuevo): `esRegistroUnible` (lista cerrada) y `unirRegistro` (base prefijo de ambas versiones, deduplica por `eventId` con la noción de `sameEvent`, renumera solo el cursor de los entrantes, línea idéntica para registros sin `eventId`).
- `packages/engine/src/worktree-integrar.ts` (nuevo): `integrarWorktree` con las barreras del plan, avance directo o `merge --no-ff --no-commit` con `merge-tree` previo, unión de registros con `atomicWrite`, `merge --abort` ante unión imposible, índice regenerado con `renderIndex`, recompilación con `ejecutarProcesoDeWorktree`.
- `packages/engine/src/index.ts`: exporta los tres módulos nuevos. `packages/cli/src/worktree.ts`: subcomando `integrate`. `packages/cli/src/main.ts`: solo la línea de ayuda; el mensaje «journey admite» no cambia porque lista `worktree`, y el de `journey worktree` sale de la tabla de subcomandos.
- Pruebas nuevas: `tests/worktree-registros.test.ts`, `tests/worktree-integrar.test.ts` y casos de `integrate` en `tests/worktree-cli.test.ts` (ajustados los que enumeraban solo create y remove).
- Limitación conocida (decisión para el PO): si la rama edita una línea previa de un registro y git la fusiona sin conflicto textual (porque `main` añadió líneas lejos de ella), `integrate` no lo detecta: la unión solo corre sobre los registros que git marca en conflicto.

## Pruebas

Directorio: raíz del repositorio (o del worktree del ticket). Requisitos: Node 24, git 2.38 o más, `dist` construido (`npm run build`) y el ticket FEATURE-ENGINE-INTEGRACION-WORKTREE-20261008 integrado.

Comandos:

1. `npx vitest run tests/worktree-registros.test.ts tests/worktree-integrar.test.ts tests/worktree-cli.test.ts tests/cli.test.ts tests/reglas-integracion.test.ts tests/integracion-autonoma.test.ts` — esperado: todos en verde (los repositorios son de laboratorio en carpetas temporales).
2. `npx tsc --noEmit -p tsconfig.json` — esperado: sin salida.

Validación manual (en un clon de laboratorio, NO en el checkout real): `node packages/cli/dist/main.js journey worktree create --id <ID>`, un commit en `.claude/worktrees/ticket-<slug>`, y `node packages/cli/dist/main.js journey worktree integrate --id <ID>` desde el checkout principal limpio y en `main`: debe integrar (avance directo o merge), regenerar el índice y recompilar. Con un cambio sin commit en el principal debe negarse con salida 3.

- Resultado del PO: «prueba y cierra lo que puedas cerrar tú con pruebas de comando» — Juan Andrade, 2026-10-08. Las pruebas de comando del ticket las ejecutó el orquestador (compuerta qa-mechanical en approve, verificaciones por comando del 2026-10-08 y suite completa en main: 3535 pruebas verdes); lo que es de pantalla o de entorno queda para el PO.

## QA

```json
[
  {
    "id": "QA-001",
    "date": "2026-10-08",
    "build_reference": "commit:d1654fbfca4900d34164c7bc26aa5460a0ce9671",
    "environment": "local (Node 24, vitest)",
    "result": "pending",
    "findings": [],
    "correction": null,
    "po_confirmation": null
  },
  {
    "id": "QA-002",
    "date": "2026-10-08",
    "build_reference": null,
    "environment": null,
    "result": "approved",
    "findings": [],
    "correction": null,
    "po_confirmation": "«prueba y cierra lo que puedas cerrar tú con pruebas de comando» — Juan Andrade, 2026-10-08"
  }
]
```

## Evidencia

```json
[
  {
    "id": "EVIDENCE-001",
    "date": "2026-10-08",
    "kind": "automated-test",
    "description": "Pruebas del ticket y suite completa en verde (ver ## Pruebas)",
    "reference": "worktree:sha256:0b1a981973374320ed7b0338adb13029d77ecacc774ff2c1ea2a204af422e8fb",
    "point_id": "POINT-001"
  }
]
```

## Retests

```json
[
  {
    "id": "RETEST-001",
    "date": "2026-10-08",
    "point_id": "POINT-001",
    "result": "approved",
    "evidence": [],
    "po_confirmation": "«prueba y cierra lo que puedas cerrar tú con pruebas de comando» — Juan Andrade, 2026-10-08"
  }
]
```

## Cierre

```json
[
  {
    "kind": "ticket-close",
    "id": "CLOSE-001",
    "date": "2026-10-08",
    "technical_summary": "Implementado y entregado desde su worktree; compuerta qa-mechanical en approve; suite completa en verde en main.",
    "functional_summary": "Integrar la rama de un worktree al checkout principal uniendo los registros append-only",
    "qa_status": "approved",
    "qa_waiver_reason": null,
    "po_confirmation": null,
    "release_impact": "Sin publicar; sin impacto de despliegue."
  }
]
```

## Consumo de IA

```json
[
  {
    "kind": "ai-usage",
    "date": "2026-10-08",
    "session_reference": null,
    "model": null,
    "reasoning_effort": null,
    "notes": "Subagente de Claude Code dedicado solo a este ticket; la sesión no expone agregado de tokens",
    "input_tokens": null,
    "output_tokens": null,
    "total_tokens": null,
    "estimated_cost_usd": null,
    "source": "manual:subagente-sin-agregado",
    "confidence": "low",
    "id": "CONSUMO-001"
  },
  {
    "kind": "ai-usage",
    "date": "2026-10-08",
    "session_reference": null,
    "model": null,
    "reasoning_effort": null,
    "notes": "Sesión orquestadora que cerró varios tickets; sin números por ticket para no repartir a ojo un costo que no se midió.",
    "input_tokens": null,
    "output_tokens": null,
    "total_tokens": null,
    "estimated_cost_usd": null,
    "source": "manual:sesión de Claude Code orquestadora, subagente por ticket",
    "confidence": "low",
    "id": "CONSUMO-002"
  },
  {
    "kind": "ai-usage",
    "date": "2026-10-08",
    "session_reference": "9f1455c8-a551-4602-ac40-a8d026bd66b8",
    "model": null,
    "reasoning_effort": null,
    "notes": "Agente claude-code. Sesión **compartida**: trabajó 34 tickets (FEATURE-ENGINE-JORNADA-OLA-20261008 ×115, SECURITY-ENGINE-APROBACION-POR-REVISOR-20261007 ×103, FEATURE-ENGINE-ORQUESTACION-INTERACTIVA-20261007 ×102, FEATURE-ENGINE-JORNADA-HANDOFF-20261008 ×84, BUGFIX-CLI-CANAL-DECISION-20261005 ×83), así que su costo no se reparte y acá no se registran números. Costo completo de la sesión: no declarado por el proveedor, 16592385 tokens. Registralo en el ticket cuya sesión sea propia, o declaralo compartido donde corresponda. Sesión \"ValmenHarness CLI attachments feature\".",
    "input_tokens": null,
    "output_tokens": null,
    "total_tokens": null,
    "estimated_cost_usd": null,
    "source": "claude:9f1455c8-a551-4602-ac40-a8d026bd66b8",
    "confidence": "high",
    "id": "CONSUMO-003"
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
    "date": "2026-10-08",
    "at": "2026-10-08T14:57:57.296Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-08",
    "at": "2026-10-08T15:04:45.035Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-08",
    "at": "2026-10-08T15:05:10.501Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-08",
    "at": "2026-10-08T15:07:28.907Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> blocked."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-08",
    "at": "2026-10-08T15:07:29.324Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: blocked -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-08",
    "at": "2026-10-08T15:08:06.696Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-08",
    "at": "2026-10-08T15:23:39.082Z",
    "action": "plan-approved",
    "actor": "cli",
    "details": "{\"actor\":\"Juan Andrade\",\"source\":\"cli\",\"quote\":\"La A (aprueba los 9 planes de la corrida orquestada)\",\"planHash\":\"sha256:cb375dfc28cad86936393fc254f0601075b5556032f517332e4b11d2d0756d49\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-10-08",
    "at": "2026-10-08T15:23:40.200Z",
    "action": "plan-approval-verified",
    "actor": "cli",
    "details": "Aprobación del plan vigente: Juan Andrade (fuente cli), plan sha256:cb375dfc28cad86936393fc254f0601075b5556032f517332e4b11d2d0756d49."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-10-08",
    "at": "2026-10-08T15:23:40.200Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-10-08",
    "at": "2026-10-08T15:58:46.562Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-10-08",
    "at": "2026-10-08T16:14:02.547Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-10-08",
    "at": "2026-10-08T16:14:02.845Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-10-08",
    "at": "2026-10-08T22:20:07.571Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-014",
    "date": "2026-10-08",
    "at": "2026-10-08T22:20:07.966Z",
    "action": "point-added",
    "actor": "cli",
    "details": "Se agregó POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-015",
    "date": "2026-10-08",
    "at": "2026-10-08T22:20:08.414Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-016",
    "date": "2026-10-08",
    "at": "2026-10-08T22:20:08.782Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-017",
    "date": "2026-10-08",
    "at": "2026-10-08T22:20:09.127Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-018",
    "date": "2026-10-08",
    "at": "2026-10-08T22:20:09.539Z",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-019",
    "date": "2026-10-08",
    "at": "2026-10-08T22:20:10.170Z",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-020",
    "date": "2026-10-08",
    "at": "2026-10-08T22:20:10.543Z",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-001 para POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-021",
    "date": "2026-10-08",
    "at": "2026-10-08T22:20:10.866Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: verified -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-022",
    "date": "2026-10-08",
    "at": "2026-10-08T22:20:11.163Z",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-023",
    "date": "2026-10-08",
    "at": "2026-10-08T22:20:11.467Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-024",
    "date": "2026-10-08",
    "at": "2026-10-08T22:20:11.769Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-002."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-025",
    "date": "2026-10-08",
    "at": "2026-10-08T22:20:13.649Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-003."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-026",
    "date": "2026-10-08",
    "at": "2026-10-08T22:20:13.818Z",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-027",
    "date": "2026-10-08",
    "at": "2026-10-08T22:20:14.146Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  }
]
```
