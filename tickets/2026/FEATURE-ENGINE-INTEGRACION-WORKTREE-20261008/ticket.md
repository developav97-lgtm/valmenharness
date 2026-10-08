---
schema_version: 2
id: FEATURE-ENGINE-INTEGRACION-WORKTREE-20261008
title: Crear y quitar el worktree de un ticket con un comando
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

- Alcance: dos subcomandos, `valmen journey worktree create|remove --id <ID>`, el carril de creación y retiro del worktree de la corrida orquestada (ticket 4 de `docs/propuesta-corrida-orquestada.md`, partido en dos por decisión del PO: `integrate` pasa a FEATURE-ENGINE-INTEGRACION-RAMA-20261008). `create` crea el worktree `.claude/worktrees/ticket-<slug>` con la rama `valmen/ticket-<slug>` desde `main`, clona `node_modules` con `cp -Rc`, compila ahí y reserva un cupo de la capacidad de la máquina. `remove` borra el worktree y la rama ya integrada y libera el cupo. Exclusiones: `integrate`, la unión de registros append-only y la regeneración del índice (ticket RAMA); `journey next --wave`, `journey brief`, `journey handoff`, la skill del orquestador, la vista de agentes y el retiro del disparador (otros tickets de la propuesta); push, force y tags.
- Usuario o rol afectado: la sesión orquestadora de Claude Code, que es el único escritor del checkout principal, y el PO, que hoy hace estos pasos a mano.
- Comportamiento actual: no existe ningún comando; el worktree de cada ticket se crea a mano con la receta worktree + `cp -Rc node_modules` + build, y se quita a mano al terminar.
- Comportamiento esperado: cada subcomando hace su parte con una lista cerrada de operaciones git y de procesos, sin push ni force, y se niega (salida 3) ante cualquier precondición rota sin dejar la repo a medias: crear es atómico y quitar solo borra lo ya integrado.
- Contrato que el ticket RAMA consume: `nombresDeWorktree(ticketId)` (carpeta `.claude/worktrees/ticket-<slug>` y rama `valmen/ticket-<slug>`), `exigirCheckoutPrincipal`, `motivoDeGitDeWorktree` y `ejecutarProcesoDeWorktree` (la receta de build); el ticket RAMA los importa y suma su propia lista de operaciones de integración en un módulo suyo. Este ticket va primero; RAMA depende de él solo por el nombre de la rama y el layout del worktree.

## Diagnóstico

- Causa comprobada (con `ruta:línea`): (1) no hay comando: `journey` solo admite plan, advance, install-trigger, notify-plans y clear-stop (`packages/cli/src/main.ts:1992-2004`), y `git worktree` solo aparece en `qa-agent` (`packages/engine/src/qa-agent.ts:190`), que crea un worktree desacoplado de prueba, no uno con rama. (2) La lista git de la jornada no alcanza: `OPERACIONES_PERMITIDAS` (`packages/engine/src/integration-rules.ts:87`) no incluye `worktree` ni `branch`; ampliarla ampliaría la autoridad de la jornada autónoma, y el precedente es una lista propia (`packages/engine/src/qa-agent-git.ts`). (3) La capacidad compartida (`claimMachineCapacity` `packages/engine/src/machine-capacity.ts:82`, `releaseMachineCapacity` `:111`, `readMachineCapacity` `:73`) solo la usan el despacho y la preparación de la jornada (`journey-dispatch.ts:178`, `journey-preparation.ts:355`): los worktrees de la corrida orquestada no cuentan contra ella. Memoria: `buscar_memoria` no halló antecedentes de worktrees por ticket; AP-002 (`.valmen/memory/aprendizajes.md:13`) obliga a imports relativos dentro del paquete y AP-001 (`:5`) a criterios atómicos con pasos concretos. Como es funcionalidad nueva, el «síntoma» es la intervención manual descrita en el comportamiento actual.
- Hipótesis pendientes: ninguna sobre la causa. Las decisiones de diseño están en el Plan para que el PO las cambie al aprobar.
- Consumidores afectados: comprobado con búsqueda, ninguno de los módulos existentes cambia: `estadoDelArbolDeTrabajo` (`packages/engine/src/integration-commit.ts:60`) y `ramaActual` (`:75`) se reutilizan sin tocarlos, y los usan `autonomous-run.ts:362` y `journey-dispatch.ts:143`. `main.ts` gana una rama `worktree` en el despacho de `journey` y líneas de ayuda; `VALUE_OPTIONS` no cambia (solo `--id`) y `tests/cli.test.ts:197` compara ayuda y opciones. Los tickets hermanos JORNADA-OLA, JORNADA-HANDOFF, CHORE-CLI-RETIRO-DISPARADOR-JORNADA e INTEGRACION-RAMA editan el mismo `journey` y la ayuda de `main.ts`: conflicto probable, mitigado dejando la lógica en un archivo nuevo del CLI con una tabla de subcomandos que RAMA extiende. `reconcileMachineCapacity` (`machine-capacity.ts:151`) conserva una reserva sin actividad registrada (`:176`), por eso `remove` la libera. `motivoDeTope` (`journey-limits.ts:29`) cuenta las reservas contra el tope de la jornada vieja, aceptable porque se retira.
- Archivos y flujo investigados: `packages/engine/src/integration-rules.ts`, `packages/engine/src/integration-commit.ts`, `packages/engine/src/machine-capacity.ts`, `packages/engine/src/qa-agent-git.ts`, `packages/engine/src/discovery.ts`, `packages/engine/src/project-resolution.ts`, `packages/cli/src/main.ts`, `packages/cli/src/commands.ts`, `scripts/copy-web.mjs`, `tests/integracion-autonoma.test.ts`, `tests/machine-capacity.test.ts`. Comprobado en un repositorio de laboratorio con git 2.54: `cp -Rc` conserva enlaces relativos que resuelven dentro del worktree, `worktree remove` sin force funciona con `node_modules` ignorado, y `branch -d` rechaza una rama no integrada.
- Riesgos y compatibilidad: (a) `cp -Rc` solo clona en APFS, en otro sistema cae a `cp -R`; (b) la rama se borra con `-d`, nunca `-D`; (c) `create` escribe fuera del árbol (carpeta del worktree y reserva de máquina), por eso deshace en orden inverso ante cualquier fallo; (d) el cupo se reserva solo si el proyecto está declarado en la máquina; (e) `remove` solo borra una rama ya integrada en `main`, no decide si integrar.
- Impactos de sync, migración, Docker o despliegue: ninguno

## Plan

- Gate de plan y aprobación: pendiente; la aprobación es de una persona (PO) tras la compuerta de plan.
- Alcance: los subcomandos `create` y `remove` de `journey worktree`, sus listas cerradas de git y de procesos y sus pruebas. Exclusiones: las de la descripción funcional; `integrate` y la unión de registros son del ticket FEATURE-ENGINE-INTEGRACION-RAMA-20261008, que depende de este solo por el nombre de la rama y el layout del worktree.
- Pasos ordenados:
  1. Crear worktree-git.ts en `packages/engine/src` siguiendo `packages/engine/src/qa-agent-git.ts`: `nombresDeWorktree(ticketId)` (slug = identificador sin tipo, módulo ni fecha; rechaza lo que no cumpla el formato de ticket), `motivoDeGitDeWorktree` y `ejecutarGitDeWorktree` con lista cerrada (lectura: `status`, `rev-parse` con `--abbrev-ref`, `--git-dir`, `--git-common-dir` o una referencia, `cat-file -e`, `merge-base --is-ancestor`, `worktree list --porcelain`, `branch --list`; escritura: `worktree add -b <rama> <carpeta> main`, `worktree remove <carpeta>`, `branch -d`; nunca push, fetch, pull, reset, rebase, clean, tag, remote, force, `-D`, `--hard`) `exigirCheckoutPrincipal(root, git?)` (git-dir igual a git-common-dir; si no, `fail(..., EXIT_INVARIANT)` señalando el checkout principal) y `ejecutarProcesoDeWorktree` con lista cerrada (`cp -Rc`/`cp -R`, `npx tsc --build tsconfig.build.json`, `node scripts/copy-web.mjs`); ambos rechazan con `fail(..., EXIT_INVARIANT)` antes de lanzar y reutilizan el tipo `EjecutorDeGit` de `packages/engine/src/integration-rules.ts`. `motivoDeGitDeWorktree`, `exigirCheckoutPrincipal` y `nombresDeWorktree` son la API que el ticket RAMA importa sin modificarlos: RAMA suma su propia lista de operaciones en un módulo suyo. No tocar `OPERACIONES_PERMITIDAS` ni `BANDERAS_PROHIBIDAS`: la autoridad git de la jornada no se amplía. (C1, C2, C3, C18)
  2. Crear worktree.ts en `packages/engine/src` con `crearWorktree({paths, ticketId, home?, git?, proceso?})`: verifica checkout principal con `exigirCheckoutPrincipal` (C13); `findTicket` (`packages/engine/src/discovery.ts:381`) y `cat-file -e main:<ruta>` del ticket (C10); rechaza si carpeta o rama existen (C9); resuelve el proyecto con `resolveAuthorizedProject` (`packages/engine/src/project-resolution.ts:36`) desde el `project-id` de `.valmen/config.yaml` y, si está declarado, `claimMachineCapacity` con attemptId `worktree` (sin cupo: rechazo; no declarado: sigue y lo dice) (C11, C12); `worktree add -b valmen/ticket-<slug> <carpeta> main` (C4); `cp -Rc node_modules` con caída a `cp -R` y verificación por `realpath` de que los enlaces de `node_modules/@valmen` quedan dentro del worktree (C5, C6); compila con la receta de build (C7); un fallo posterior a la reserva deshace en orden inverso (`worktree remove`, `branch -d`, `releaseMachineCapacity`) (C6, C8, C12).
  3. En el mismo worktree.ts, `quitarWorktree({paths, ticketId, home?, git?})`: checkout principal con `exigirCheckoutPrincipal` (C13); la rama debe existir y ser ancestro de `main` con `merge-base --is-ancestor` (C16); worktree limpio con `estadoDelArbolDeTrabajo` de `packages/engine/src/integration-commit.ts` (C17); `worktree remove` sin force y `branch -d` (C14); libera la reserva buscándola en `readMachineCapacity` por proyecto, ticket y attemptId `worktree` y llamando a `releaseMachineCapacity` (C15).
  4. Exportar los dos módulos nuevos desde `packages/engine/src/index.ts` junto a `export * from "./integration-rules.js"`, con imports relativos entre módulos del paquete (AP-002). (C18)
  5. Crear worktree.ts en `packages/cli/src` con `journeyWorktreeCommand(paths, rest, flags, opciones)` y una tabla de subcomandos (`create`, `remove`) que valida el subcomando y `--id` (salida 2), delega en el motor y formatea la salida (salida 3 para rechazos); en `packages/cli/src/main.ts` agregar la rama `worktree` al despacho de `journey` (línea 1992), actualizar el mensaje «journey admite» (línea 2004) y las líneas de ayuda junto a `journey clear-stop` (línea 293). `--id` ya está en `VALUE_OPTIONS`. (C19, C20)
  6. Pruebas: crear tests/worktree-git.test.ts, tests/worktree-integracion.test.ts (repositorio git de laboratorio real como en `tests/integracion-autonoma.test.ts`, bindings de máquina como en `tests/machine-capacity.test.ts`, `cp` real sobre un `node_modules` mínimo y compilación simulada con un ejecutor de procesos que registra las llamadas) y tests/worktree-cli.test.ts; un caso por criterio y un control por barrera: rama no integrada, worktree sucio, sin cupo, worktree o rama ya existentes, ticket no registrado, ejecución desde un worktree enlazado y cada operación git prohibida. Correr `npx vitest run tests/worktree-git.test.ts tests/worktree-integracion.test.ts tests/worktree-cli.test.ts tests/cli.test.ts tests/integracion-autonoma.test.ts tests/machine-capacity.test.ts` y `npx tsc --noEmit -p tsconfig.json`. (C1–C21)
  7. Entrega: dejar en `## Pruebas` los comandos del paso 6 desde la raíz del repositorio, el resultado esperado (todos en verde, tipos sin salida), requisitos (Node 24, git 2.38 o más, `dist` construido con `npm run build`) y la validación manual en un clon de laboratorio, no en el checkout real: `create`, un commit y su integración a mano, `remove`. El ticket pasa a `awaiting_user_tests`. (C1–C21)
- Decisiones de diseño que el PO puede cambiar al aprobar:
  - D1: lista git propia, sin ampliar la de la jornada (precedente `qa-agent-git.ts`); el ticket RAMA la amplía en su propio ticket.
  - D2: el destino y la base son siempre `main`; el checkout principal es el único desde el que se corre.
  - D3: `create` reserva cupo y `remove` lo libera; si el proyecto no está declarado en la máquina no se reserva y se avisa.
  - D4: `remove` no integra: solo borra una rama que ya es ancestro de `main`.
  - D5: la partición con RAMA es por nombre de rama y layout del worktree; ambos se fijan en `nombresDeWorktree`.
- Impactos declarados: ninguno; el ticket no declara sincronización, migración ni contenedores.
- Rollback (obligatorio): revertir el commit del ticket; los comandos y módulos son nuevos y nadie más los llama, y no se cambia código existente salvo el despacho y la ayuda de `journey`. Un worktree creado se quita con `git worktree remove` y `git branch -d`, y la reserva de máquina con `remove` o la reconciliación de capacidad; el harness nunca hace reset.

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
- [ ] C4. `create` deja el worktree `.claude/worktrees/ticket-<slug>` con la rama `valmen/ticket-<slug>` apuntando al mismo commit que `main`
      <!-- test: npx vitest run tests/worktree-integracion.test.ts -->
- [ ] C5. `create` clona `node_modules` de modo que los enlaces de `node_modules/@valmen` resuelven dentro del worktree
      <!-- test: npx vitest run tests/worktree-integracion.test.ts -->
- [ ] C6. `create` se niega, sin dejar worktree ni rama, si el clon de `node_modules` no queda contenido en el worktree
      <!-- test: npx vitest run tests/worktree-integracion.test.ts -->
- [ ] C7. `create` compila en el worktree con la receta de build (`npx tsc --build tsconfig.build.json` seguido de `node scripts/copy-web.mjs`)
      <!-- test: npx vitest run tests/worktree-integracion.test.ts -->
- [ ] C8. Si la compilación falla, `create` no deja worktree ni rama
      <!-- test: npx vitest run tests/worktree-integracion.test.ts -->
- [ ] C9. `create` se niega, sin tocarlos, si el worktree o la rama del ticket ya existen
      <!-- test: npx vitest run tests/worktree-integracion.test.ts -->
- [ ] C10. `create` se niega si el ticket no está registrado en `main`
      <!-- test: npx vitest run tests/worktree-integracion.test.ts -->
- [ ] C11. `create` reserva un cupo de la capacidad de la máquina para el ticket cuando el proyecto está declarado en ella
      <!-- test: npx vitest run tests/worktree-integracion.test.ts -->
- [ ] C12. `create` se niega, sin dejar worktree ni rama, cuando la capacidad de la máquina no tiene cupo
      <!-- test: npx vitest run tests/worktree-integracion.test.ts -->
- [ ] C13. `create` y `remove` se niegan a correr desde un worktree enlazado y señalan el checkout principal
      <!-- test: npx vitest run tests/worktree-integracion.test.ts -->
- [ ] C14. `remove` deja al ticket integrado sin worktree ni rama
      <!-- test: npx vitest run tests/worktree-integracion.test.ts -->
- [ ] C15. `remove` libera el cupo reservado para el ticket
      <!-- test: npx vitest run tests/worktree-integracion.test.ts -->
- [ ] C16. `remove` se niega, conservando el worktree y la rama, si la rama no está integrada en `main`
      <!-- test: npx vitest run tests/worktree-integracion.test.ts -->
- [ ] C17. `remove` se niega, conservando el worktree y la rama, si el worktree tiene cambios sin commit
      <!-- test: npx vitest run tests/worktree-integracion.test.ts -->
- [ ] C18. Los comandos git y de proceso que lanzan `create` y `remove` salen todos de las listas cerradas, sin push, fetch, reset ni banderas de fuerza
      <!-- test: npx vitest run tests/worktree-integracion.test.ts -->
- [ ] C19. `valmen journey worktree create|remove` figura en la ayuda y toda bandera documentada con valor está en `VALUE_OPTIONS`
      <!-- test: npx vitest run tests/worktree-cli.test.ts tests/cli.test.ts -->
- [ ] C20. `journey worktree` sin subcomando, con uno desconocido o sin `--id` sale con 2 y dice qué se admite
      <!-- test: npx vitest run tests/worktree-cli.test.ts tests/cli.test.ts -->
- [ ] C21. La comprobación de tipos pasa
      <!-- test: npx tsc --noEmit -p tsconfig.json -->

## Puntos

```json
[]
```

## Implementación

Pendiente.

## Pruebas

Contrato previsto, aún sin ejecutar. Directorio: raíz del repositorio (o el worktree del ticket). Requisitos: Node 24, git 2.38 o más, `dist` construido (`npm run build`). Comandos: `npx vitest run tests/worktree-git.test.ts tests/worktree-integracion.test.ts tests/worktree-cli.test.ts tests/cli.test.ts tests/integracion-autonoma.test.ts tests/machine-capacity.test.ts` (todo en verde) y `npx tsc --noEmit -p tsconfig.json` (sin salida). Validación manual en un clon de laboratorio: `node packages/cli/dist/main.js journey worktree create --id <ID>`, commit en la rama, integración a mano, `remove --id <ID>`.

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
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-08",
    "at": "2026-10-08T14:59:43.596Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> blocked."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-08",
    "at": "2026-10-08T14:59:44.194Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: blocked -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-08",
    "at": "2026-10-08T15:00:26.589Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-08",
    "at": "2026-10-08T15:01:58.026Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> blocked."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-10-08",
    "at": "2026-10-08T15:01:58.638Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: blocked -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-10-08",
    "at": "2026-10-08T15:02:27.421Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  }
]
```
