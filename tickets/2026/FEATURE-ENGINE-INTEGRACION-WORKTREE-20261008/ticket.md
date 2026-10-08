---
schema_version: 2
id: FEATURE-ENGINE-INTEGRACION-WORKTREE-20261008
title: Crear el worktree de un ticket e integrar su rama al checkout principal con un comando
type: FEATURE
module: ENGINE
workflow_status: planned
qa_status: pending
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

# FEATURE-ENGINE-INTEGRACION-WORKTREE-20261008

## Solicitud original

Contexto: el PO paró la jornada por launchd (6 tickets en 9 h, un solo carril, 5 despachos fallidos, ~8 rescates a mano) y la reemplaza por una corrida orquestada en sesión: la sesión de Claude Code que el PO abre es el orquestador, y reparte los tickets en subagentes, cada uno en su worktree y rama, con 3 simultáneos por defecto (el PO lo cambia al pedir la corrida). Propuesta aprobada y comparativa con datos: docs/propuesta-corrida-orquestada.md y https://claude.ai/artifact/RvWQx8zH1LZ7e9H6dw6dEN. Decisiones del PO: 3 a la vez por defecto y cambiable con --concurrency N o al pedirlo; worktree por ticket; aprobación según la política por tipo de ticket (automática si hay autorización vigente y el ticket es elegible, en lote para el PO si no; SECURITY y despliegue nunca se aprueban solos); la visibilidad de los agentes se lee de los transcripts de los subagentes, sin instalar pixel-agents. Este ticket: `valmen journey worktree create --id <ID>` crea el worktree .claude/worktrees/ticket-<slug> con su rama valmen/ticket-<slug> desde main, clona node_modules con cp -Rc y compila ahí (tsc --build y copy-web), que es la receta que ya funcionó a mano; `valmen journey worktree integrate --id <ID>` integra la rama al checkout principal con avance directo si se puede o merge --no-ff si no, une los registros append-only por eventId renumerando cursores como ya hace integration-commit.ts, regenera tickets/index.md, recompila y avisa de conflictos sin resolverlos; y `valmen journey worktree remove --id <ID>` borra el worktree y la rama ya integrada. Nunca hace push, nunca fuerza, y se niega a integrar si el checkout principal está sucio. Reutiliza integration-commit.ts, integration-rules.ts y machine-capacity.ts.

### Supuestos y decisiones pendientes

<!-- Si el pedido nombra algo que el código no tiene —parámetro, permiso,
campo, bandera, columna, migración— y no lo especifica, listá cada elemento
con su pregunta antes de avanzar a análisis; el análisis no planifica sobre
la adivinanza. Si no hay ninguno, escribí «Ninguno» y seguí. -->
Ninguno.

## Descripción funcional

- Alcance: tres subcomandos `valmen journey worktree create|integrate|remove --id <ID>`, el carril de integración de la corrida orquestada (ticket 4 de `docs/propuesta-corrida-orquestada.md`). `create` crea el worktree `.claude/worktrees/ticket-<slug>` con la rama `valmen/ticket-<slug>` desde `main`, clona `node_modules` con `cp -Rc`, compila ahí y reserva un cupo de la capacidad de la máquina. `integrate` integra la rama al checkout principal con avance directo si se puede o `merge --no-ff` si no, une los registros append-only por `eventId` renumerando cursores, regenera `tickets/index.md`, recompila y avisa de los conflictos sin resolverlos. `remove` borra el worktree y la rama ya integrada y libera el cupo. Exclusiones: `journey next --wave`, `journey brief`, `journey handoff`, la skill del orquestador, la vista de agentes y el retiro del disparador (otros tickets de la propuesta); resolver conflictos de código; unir bloques dentro de `ticket.md`; push, force y tags.
- Usuario o rol afectado: la sesión orquestadora de Claude Code, que es el único escritor del checkout principal, y el PO, que hoy hace estos pasos a mano.
- Comportamiento actual: no existe ningún comando; la integración de cada rama se hace a mano con la receta worktree + `cp -Rc node_modules` + build + `merge`, y los registros append-only (cursores de eventos, índice) se reparan a mano. La propuesta cuenta ~8 intervenciones manuales de ese tipo en la jornada.
- Comportamiento esperado: cada subcomando hace su parte con una lista cerrada de operaciones git, sin push ni force, y se niega (salida 3) ante cualquier precondición rota sin dejar la repo a medias: crear es atómico, integrar no toca `main` si hay conflictos de código o el checkout principal está sucio, y quitar solo borra lo ya integrado.

## Diagnóstico

- Causa comprobada (con `ruta:línea`): (1) no hay comando: `journey` solo admite plan, advance, install-trigger, notify-plans y clear-stop (`packages/cli/src/main.ts:1992-2004`), y `git worktree` solo aparece en `qa-agent` (`packages/engine/src/qa-agent.ts:190`), que crea un worktree desacoplado de prueba. (2) El pedido dice que la unión de logs «ya la hace integration-commit.ts», pero no es así: `packages/engine/src/integration-commit.ts` commitea un ticket (`integrarTicket`, `:235`) y avanza la rama de trabajo con `merge --ff-only` (`asegurarRamaDeTrabajo`, `:136`), sin ninguna función que una registros ni renumere cursores; los cursores se repararon a mano (commit `aac6eaa`). Lo reutilizable es `estadoDelArbolDeTrabajo` (`:60`), `ramaActual` (`:75`) y `RAMA_BASE` (`:127`); de `packages/engine/src/integration-rules.ts`, el tipo `EjecutorDeGit` (`:132`) y la lista de archivos prohibidos `PROHIBIDOS` (`:35`, hoy sin exportar vía `motivoDeArchivoProhibido`, `:46`). (3) La lista git de la jornada no alcanza: `OPERACIONES_PERMITIDAS` (`:87`) no incluye `worktree`, `branch`, `show` ni `merge-tree`, y `merge` solo se admite como `--ff-only` (`:124`); ampliarla ampliaría la autoridad de la jornada autónoma, y el precedente es una lista propia (`packages/engine/src/qa-agent-git.ts`). (4) El riesgo de una unión mal hecha es real: `readExecutionEvents` (`packages/engine/src/execution-events.ts:152`) lanza si los cursores no son consecutivos (`:170`), y cada evento recibe `history.length + 1` (`:144`), así que dos ramas que añaden eventos dejan ilegible el historial entero; «mismo hecho» lo define `sameEvent` (`:369`). (5) La capacidad compartida (`claimMachineCapacity` `packages/engine/src/machine-capacity.ts:82`, `releaseMachineCapacity` `:111`, `readMachineCapacity` `:73`) solo la usan el despacho y la preparación de la jornada (`journey-dispatch.ts:178`, `journey-preparation.ts:355`): los worktrees de la corrida orquestada no cuentan contra ella. Memoria: `buscar_memoria` no halló antecedentes de integración de ramas; AP-002 (`.valmen/memory/aprendizajes.md:13`) obliga a imports relativos dentro del paquete y AP-001 (`:5`) a criterios atómicos con pasos concretos. Como es funcionalidad nueva, el «síntoma» es la intervención manual descrita en (2) y en la propuesta.
- Hipótesis pendientes: ninguna sobre la causa. Las decisiones de diseño están en el Plan para que el PO las cambie al aprobar.
- Consumidores afectados: comprobado con búsqueda, `integration-rules.ts` solo gana un `export` y lo importan `integration-commit.ts:17` y `qa-eligibility.ts:18`, sin cambio de firmas; `estadoDelArbolDeTrabajo` lo usan `autonomous-run.ts:362` y `journey-dispatch.ts:143`, que no cambian. `main.ts` gana una rama `worktree` en el despacho de `journey` y líneas de ayuda; `VALUE_OPTIONS` no cambia (solo `--id`) y `tests/cli.test.ts:197` compara ayuda y opciones. Los tickets hermanos JORNADA-OLA, JORNADA-HANDOFF y CHORE-CLI-RETIRO-DISPARADOR-JORNADA editan el mismo `journey` y la ayuda de `main.ts`: conflicto probable, mitigado dejando la lógica en un archivo nuevo del CLI. `reconcileMachineCapacity` (`machine-capacity.ts:151`) conserva una reserva sin actividad registrada (`:176`), por eso `remove` la libera. `motivoDeTope` (`journey-limits.ts:29`) cuenta las reservas contra el tope de la jornada vieja, aceptable porque se retira.
- Archivos y flujo investigados: `packages/engine/src/integration-rules.ts`, `packages/engine/src/integration-commit.ts`, `packages/engine/src/machine-capacity.ts`, `packages/engine/src/qa-agent-git.ts`, `packages/engine/src/execution-events.ts`, `packages/engine/src/index-file.ts`, `packages/engine/src/discovery.ts`, `packages/engine/src/project-resolution.ts`, `packages/cli/src/main.ts`, `packages/cli/src/commands.ts`, `scripts/copy-web.mjs`, `tests/integracion-autonoma.test.ts`, `tests/machine-capacity.test.ts`. Comprobado en un repositorio de laboratorio con git 2.54: `merge-tree --write-tree --name-only --no-messages` lista los conflictos sin tocar el árbol (salida 1), `cp -Rc` conserva enlaces relativos que resuelven dentro del worktree, `worktree remove` sin force funciona con `node_modules` ignorado, y `branch -d` rechaza una rama no integrada.
- Riesgos y compatibilidad: (a) integrar escribe en `main`: precondiciones en código (checkout principal limpio, en `main`, worktree limpio, sin archivos prohibidos, sin solape con cambios sin commit) y `merge --abort` como única vía de vuelta; (b) `cp -Rc` solo clona en APFS, en otro sistema cae a `cp -R`; (c) `merge-tree --write-tree` exige git 2.38 o más; (d) la rama se borra con `-d`, nunca `-D`; (e) los bloques dentro de `ticket.md` no se unen: un conflicto ahí se informa; (f) `integrate` no exige un estado del ticket, para poder integrar también planes; (g) recompilar reescribe `dist` del propio CLI en marcha, al final de la operación.
- Impactos de sync, migración, Docker o despliegue: ninguno

## Plan

- Gate de plan y aprobación: pendiente; la aprobación es de una persona (PO) tras la compuerta de plan.
- Alcance: los tres subcomandos de `journey worktree`, sus listas cerradas de git y de procesos, la unión de registros append-only y sus pruebas. Exclusiones: las de la descripción funcional.
- Pasos ordenados:
  1. En `packages/engine/src/integration-rules.ts` exportar `motivoDeArchivoProhibido` (línea 46) para reutilizar `PROHIBIDOS` sin duplicarlo; no tocar `OPERACIONES_PERMITIDAS` ni `BANDERAS_PROHIBIDAS`: la autoridad git de la jornada no se amplía. (C27)
  2. Crear worktree-git.ts en `packages/engine/src` siguiendo `packages/engine/src/qa-agent-git.ts`: `nombresDeWorktree(ticketId)` (slug = identificador sin tipo, módulo ni fecha; rechaza lo que no cumpla el formato de ticket), `motivoDeGitDeWorktree` y `ejecutarGitDeWorktree` con lista cerrada (lectura: `status`, `rev-parse`, `show <rev>:<ruta>`, `cat-file -e`, `diff --name-only -z`, `merge-base`, `merge-tree --write-tree --name-only --no-messages`, `worktree list --porcelain`, `branch --list`; escritura: `worktree add -b <rama> <carpeta> main`, `worktree remove <carpeta>`, `branch -d`, `merge --ff-only`, `merge --no-ff --no-commit`, `merge --abort`, `add --` con archivos, `commit -m`; nunca push, fetch, reset, rebase, clean, tag, remote, force, `-D`, `--hard`) y `ejecutarProcesoDeWorktree` con lista cerrada (`cp -Rc`/`cp -R`, `npx tsc --build tsconfig.build.json`, `node scripts/copy-web.mjs`); ambos rechazan con `fail(..., EXIT_INVARIANT)` antes de lanzar y reutilizan el tipo `EjecutorDeGit`. (C1, C2, C3, C37)
  3. Crear worktree-registros.ts en `packages/engine/src` con `esRegistroUnible(ruta)` (lista cerrada: `.valmen/executions/events.jsonl`, `.valmen/receipts/*.jsonl`, `.valmen/journeys/*.jsonl`, `.valmen/autonomous-stops.jsonl`, `.valmen/approvals.jsonl`) y `unirRegistro({ruta, base, ours, theirs})`: exige que la base sea prefijo de ambas versiones, deduplica por `eventId` con la noción de «mismo hecho» de `sameEvent` (`packages/engine/src/execution-events.ts:369`, sin `cursor` ni `receivedAt`), renumera solo el cursor de los entrantes como `history.length + 1` (`:144`), y para registros sin `eventId` une por línea idéntica; devuelve `{ok:false, motivo}` ante `eventId` con contenido distinto o línea previa editada. (C4, C5, C6, C7, C8, C9)
  4. Crear worktree.ts en `packages/engine/src` con `crearWorktree({paths, ticketId, home?, git?, proceso?})`: verifica checkout principal (git-dir igual a git-common-dir) (C19); `findTicket` (`packages/engine/src/discovery.ts:381`) y `cat-file -e main:<ruta>` del ticket (C16); rechaza si carpeta o rama existen (C15); resuelve el proyecto con `resolveAuthorizedProject` (`packages/engine/src/project-resolution.ts:36`) desde el `project-id` de `.valmen/config.yaml` y, si está declarado, `claimMachineCapacity` con attemptId `worktree` (sin cupo: rechazo; no declarado: sigue y lo dice) (C17, C18); `worktree add -b valmen/ticket-<slug> <carpeta> main` (C10); `cp -Rc node_modules` con caída a `cp -R` y verificación por `realpath` de que los enlaces de `node_modules/@valmen` quedan dentro del worktree (C11, C12); compila con la receta de build (C13); un fallo posterior a la reserva deshace en orden inverso (`worktree remove`, `branch -d`, `releaseMachineCapacity`) (C12, C14, C18).
  5. En el mismo worktree.ts, `integrarWorktree({paths, ticketId, home?, git?, proceso?})`: checkout principal (C19) en `main` con `ramaActual` y `RAMA_BASE` de `packages/engine/src/integration-commit.ts` (C29); rama ya ancestro de `main`: «nada que integrar», salida 0 (C32); worktree limpio con `estadoDelArbolDeTrabajo` (C28); archivos de `diff --name-only -z main...<rama>` sin `motivoDeArchivoProhibido` (C27); checkout principal limpio con `estadoDelArbolDeTrabajo` (C25) y sin solape entre `status --porcelain` crudo y los archivos de la rama (C26); si `main` es ancestro de la rama, `merge --ff-only` (C20); si no, `merge-tree` previo: conflictos fuera de `esRegistroUnible` y de `tickets/index.md` se listan y no se toca nada (C24); si no, `merge --no-ff --no-commit`, cada registro en conflicto se resuelve con `unirRegistro` leyendo `show` de la base, de `main` y de la rama, escrito con `atomicWrite` (`packages/core/src/fs.ts:105`) y `add --`; una unión fallida ejecuta `merge --abort` (C21, C22); `tickets/index.md` se regenera con `renderIndex` (`packages/engine/src/index-file.ts:72`) dentro del commit de merge, o en un commit propio tras el avance directo (C23); por último recompila el checkout principal, y si falla conserva la integración y sale con 3 (C30, C31).
  6. En el mismo worktree.ts, `quitarWorktree({paths, ticketId, home?, git?})`: checkout principal (C19); la rama debe ser ancestro de `main` y existir (C35); worktree limpio (C36); `worktree remove` sin force y `branch -d` (C33); libera la reserva buscándola en `readMachineCapacity` por proyecto, ticket y attemptId `worktree` y llamando a `releaseMachineCapacity` (C34).
  7. Exportar los tres módulos nuevos desde `packages/engine/src/index.ts` junto a `export * from "./integration-rules.js"`, con imports relativos entre módulos del paquete (AP-002). (C37)
  8. Crear worktree.ts en `packages/cli/src` con `journeyWorktreeCommand(paths, rest, flags, opciones)` que valida el subcomando y `--id` (salida 2), delega en el motor y formatea la salida (salida 3 para rechazos y conflictos); en `packages/cli/src/main.ts` agregar la rama `worktree` al despacho de `journey` (línea 1992), actualizar el mensaje «journey admite» (línea 2004) y las líneas de ayuda junto a `journey clear-stop` (línea 293). `--id` ya está en `VALUE_OPTIONS`. (C38, C39)
  9. Pruebas: crear tests/worktree-git.test.ts, tests/worktree-registros.test.ts, tests/worktree-integracion.test.ts (repositorio git de laboratorio real como en `tests/integracion-autonoma.test.ts`, bindings de máquina como en `tests/machine-capacity.test.ts`, `cp` real sobre un `node_modules` mínimo y compilación simulada con un ejecutor de procesos que registra las llamadas) y tests/worktree-cli.test.ts; un caso por criterio y un control por barrera. Correr `npx vitest run tests/worktree-git.test.ts tests/worktree-registros.test.ts tests/worktree-integracion.test.ts tests/worktree-cli.test.ts tests/cli.test.ts tests/reglas-integracion.test.ts tests/integracion-autonoma.test.ts tests/machine-capacity.test.ts` y `npx tsc --noEmit -p tsconfig.json`. (C1–C40)
  10. Entrega: dejar en `## Pruebas` los comandos del paso 9 desde la raíz del repositorio, el resultado esperado (todos en verde, tipos sin salida), requisitos (Node 24, git 2.38 o más, `dist` construido con `npm run build`) y la validación manual en un clon de laboratorio, no en el checkout real: `create`, un commit en la rama, `integrate`, `remove`. El ticket pasa a `awaiting_user_tests`. (C1–C40)
- Decisiones de diseño que el PO puede cambiar al aprobar:
  - D1: la unión de registros no existía en `integration-commit.ts` como dice el pedido; se implementa en un módulo nuevo.
  - D2: lista git propia, sin ampliar la de la jornada (precedente `qa-agent-git.ts`).
  - D3: el destino es siempre `main`; el checkout principal debe estar en esa rama.
  - D4: `create` reserva cupo y `remove` lo libera; si el proyecto no está declarado en la máquina no se reserva y se avisa.
  - D5: los conflictos de código y los bloques de `ticket.md` se informan y no se resuelven.
  - D6: `integrate` no exige un estado del ticket, para poder integrar planes.
  - D7: el ticket es grande (40 criterios, el tope de revisión); si se prefiere, se parte en create/remove e integrate con unión.
- Impactos declarados: ninguno; el ticket no declara sincronización, migración ni contenedores.
- Rollback (obligatorio): revertir el commit del ticket; los comandos y módulos son nuevos y nadie más los llama, el único cambio en código existente es un `export`. Un worktree creado se quita con `git worktree remove` y `git branch -d`; una integración mal hecha la revierte una persona con `git revert -m 1 <merge>`, el harness nunca hace reset.

<!-- Los criterios de la sección siguiente se numeran C1…Cn, con una afirmación verificable por criterio
     —una frase con «y» son dos criterios—, y cada uno lleva debajo su anotación de
     verificación: un comentario HTML que dice «test:» y el comando, o «verify: manual». La
     sección no lleva comentarios dentro: un comentario con anotación se leería como la de un
     criterio. Ejemplo en la skill planificacion. -->
## Criterios de aceptación

- [ ] C1. `nombresDeWorktree` deriva la carpeta `.claude/worktrees/ticket-<slug>` y la rama `valmen/ticket-<slug>` del identificador, sin tipo, módulo ni fecha
      <!-- test: npx vitest run tests/worktree-git.test.ts -->
- [ ] C2. `nombresDeWorktree` rechaza un identificador con barras, `..` o fuera del formato de ticket
      <!-- test: npx vitest run tests/worktree-git.test.ts -->
- [ ] C3. La lista cerrada de git de los worktrees rechaza las invocaciones que publican o reescriben historia (push, fetch, pull, reset, rebase, clean, tag, remote, --force, -D, --hard)
      <!-- test: npx vitest run tests/worktree-git.test.ts -->
- [ ] C4. Unir dos versiones de `.valmen/executions/events.jsonl` conserva cada evento de las dos por `eventId`, sin duplicar el que ya estaba
      <!-- test: npx vitest run tests/worktree-registros.test.ts -->
- [ ] C5. Tras unir `.valmen/executions/events.jsonl`, los cursores son consecutivos de 1 a N
      <!-- test: npx vitest run tests/worktree-registros.test.ts -->
- [ ] C6. Al unir `.valmen/executions/events.jsonl`, lo único que cambia respecto de las dos versiones es el cursor de los eventos entrantes
      <!-- test: npx vitest run tests/worktree-registros.test.ts -->
- [ ] C7. Un mismo `eventId` con contenido distinto en las dos versiones no se une y se informa como conflicto
      <!-- test: npx vitest run tests/worktree-registros.test.ts -->
- [ ] C8. Un registro donde una versión editó o borró una línea previa no se une y se informa como conflicto
      <!-- test: npx vitest run tests/worktree-registros.test.ts -->
- [ ] C9. Los registros sin `eventId` (`.valmen/journeys/pasadas.jsonl`, `.valmen/receipts/<ID>.jsonl`) se unen por línea idéntica, sin duplicar
      <!-- test: npx vitest run tests/worktree-registros.test.ts -->
- [ ] C10. `create` deja el worktree `.claude/worktrees/ticket-<slug>` con la rama `valmen/ticket-<slug>` apuntando al mismo commit que `main`
      <!-- test: npx vitest run tests/worktree-integracion.test.ts -->
- [ ] C11. `create` clona `node_modules` de modo que los enlaces de `node_modules/@valmen` resuelven dentro del worktree
      <!-- test: npx vitest run tests/worktree-integracion.test.ts -->
- [ ] C12. `create` se niega, sin dejar worktree ni rama, si el clon de `node_modules` no queda contenido en el worktree
      <!-- test: npx vitest run tests/worktree-integracion.test.ts -->
- [ ] C13. `create` compila en el worktree con la receta de build (`npx tsc --build tsconfig.build.json` seguido de `node scripts/copy-web.mjs`)
      <!-- test: npx vitest run tests/worktree-integracion.test.ts -->
- [ ] C14. Si la compilación falla, `create` no deja worktree ni rama
      <!-- test: npx vitest run tests/worktree-integracion.test.ts -->
- [ ] C15. `create` se niega, sin tocarlos, si el worktree o la rama del ticket ya existen
      <!-- test: npx vitest run tests/worktree-integracion.test.ts -->
- [ ] C16. `create` se niega si el ticket no está registrado en `main`
      <!-- test: npx vitest run tests/worktree-integracion.test.ts -->
- [ ] C17. `create` reserva un cupo de la capacidad de la máquina para el ticket cuando el proyecto está declarado en ella
      <!-- test: npx vitest run tests/worktree-integracion.test.ts -->
- [ ] C18. `create` se niega, sin dejar worktree ni rama, cuando la capacidad de la máquina no tiene cupo
      <!-- test: npx vitest run tests/worktree-integracion.test.ts -->
- [ ] C19. Los tres subcomandos se niegan a correr desde un worktree enlazado y señalan el checkout principal
      <!-- test: npx vitest run tests/worktree-integracion.test.ts -->
- [ ] C20. `integrate` avanza `main` con `merge --ff-only` cuando `main` no se movió desde que nació la rama, sin commit de merge
      <!-- test: npx vitest run tests/worktree-integracion.test.ts -->
- [ ] C21. `integrate` hace `merge --no-ff` cuando `main` avanzó, y el commit resultante tiene dos padres
      <!-- test: npx vitest run tests/worktree-integracion.test.ts -->
- [ ] C22. En el merge, las dos versiones de `.valmen/executions/events.jsonl` quedan unidas por `eventId` con cursores consecutivos
      <!-- test: npx vitest run tests/worktree-integracion.test.ts -->
- [ ] C23. `integrate` regenera `tickets/index.md` y el resultado coincide con el que produce `valmen index`
      <!-- test: npx vitest run tests/worktree-integracion.test.ts -->
- [ ] C24. Ante un conflicto fuera de los registros append-only, `integrate` no modifica `main`, lista los archivos en conflicto y sale con 3
      <!-- test: npx vitest run tests/worktree-integracion.test.ts -->
- [ ] C25. `integrate` se niega, sin modificar nada, si el checkout principal está sucio
      <!-- test: npx vitest run tests/worktree-integracion.test.ts -->
- [ ] C26. `integrate` se niega si un archivo con cambios sin commit del checkout principal también lo cambia la rama
      <!-- test: npx vitest run tests/worktree-integracion.test.ts -->
- [ ] C27. `integrate` se niega si la rama cambia archivos que una jornada no commitea (credenciales o configuración del harness)
      <!-- test: npx vitest run tests/worktree-integracion.test.ts -->
- [ ] C28. `integrate` se niega si el worktree tiene cambios sin commit
      <!-- test: npx vitest run tests/worktree-integracion.test.ts -->
- [ ] C29. `integrate` se niega si el checkout principal no está en `main`
      <!-- test: npx vitest run tests/worktree-integracion.test.ts -->
- [ ] C30. `integrate` recompila el checkout principal con la receta de build tras integrar
      <!-- test: npx vitest run tests/worktree-integracion.test.ts -->
- [ ] C31. Si la recompilación falla, `integrate` conserva la integración, sale con 3 y lo dice
      <!-- test: npx vitest run tests/worktree-integracion.test.ts -->
- [ ] C32. `integrate` sobre una rama ya integrada responde «nada que integrar», sale con 0 y no modifica `main`
      <!-- test: npx vitest run tests/worktree-integracion.test.ts -->
- [ ] C33. `remove` deja al ticket integrado sin worktree ni rama
      <!-- test: npx vitest run tests/worktree-integracion.test.ts -->
- [ ] C34. `remove` libera el cupo reservado para el ticket
      <!-- test: npx vitest run tests/worktree-integracion.test.ts -->
- [ ] C35. `remove` se niega, conservando el worktree y la rama, si la rama no está integrada en `main`
      <!-- test: npx vitest run tests/worktree-integracion.test.ts -->
- [ ] C36. `remove` se niega, conservando el worktree y la rama, si el worktree tiene cambios sin commit
      <!-- test: npx vitest run tests/worktree-integracion.test.ts -->
- [ ] C37. Los comandos git y de proceso que lanzan `create`, `integrate` y `remove` salen todos de las listas cerradas, sin push, fetch, reset ni banderas de fuerza
      <!-- test: npx vitest run tests/worktree-integracion.test.ts -->
- [ ] C38. `valmen journey worktree create|integrate|remove` figura en la ayuda y toda bandera documentada con valor está en `VALUE_OPTIONS`
      <!-- test: npx vitest run tests/worktree-cli.test.ts tests/cli.test.ts -->
- [ ] C39. `journey worktree` sin subcomando, con uno desconocido o sin `--id` sale con 2 y dice qué se admite
      <!-- test: npx vitest run tests/worktree-cli.test.ts tests/cli.test.ts -->
- [ ] C40. La comprobación de tipos pasa
      <!-- test: npx tsc --noEmit -p tsconfig.json -->

## Puntos

```json
[]
```

## Implementación

Pendiente.

## Pruebas

Contrato previsto, aún sin ejecutar. Directorio: raíz del repositorio (o el worktree del ticket). Requisitos: Node 24, git 2.38 o más, `dist` construido (`npm run build`). Comandos: `npx vitest run tests/worktree-git.test.ts tests/worktree-registros.test.ts tests/worktree-integracion.test.ts tests/worktree-cli.test.ts tests/cli.test.ts tests/reglas-integracion.test.ts tests/integracion-autonoma.test.ts tests/machine-capacity.test.ts` (todo en verde) y `npx tsc --noEmit -p tsconfig.json` (sin salida). Validación manual en un clon de laboratorio: `node packages/cli/dist/main.js journey worktree create --id <ID>`, commit en la rama, `integrate --id <ID>` (fusión y recompilación) y `remove --id <ID>`.

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
    "date": "2026-10-08",
    "at": "2026-10-08T13:44:11.783Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-08",
    "at": "2026-10-08T14:46:28.379Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-08",
    "at": "2026-10-08T14:48:00.546Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  }
]
```
