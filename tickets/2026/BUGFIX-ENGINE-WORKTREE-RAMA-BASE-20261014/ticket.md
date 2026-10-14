---
schema_version: 2
id: BUGFIX-ENGINE-WORKTREE-RAMA-BASE-20261014
title: Worktrees y hash de QA fallan en proyectos que no trabajan sobre main
type: BUGFIX
module: ENGINE
workflow_status: awaiting_user_tests
qa_status: pending
release_status: unreleased
user_visible: false
sync_impact: false
migration_impact: false
docker_impact: false
risk_level: normal
created: 2026-10-13
updated: 2026-10-14
related_ticket: null
target_release: null
released_in: null
---

# BUGFIX-ENGINE-WORKTREE-RAMA-BASE-20261014

## Solicitud original

Visto en la corrida orquestada de doctor-facturas en SaiOpenCloud (2026-10-13/14), que trabaja sobre dev. (1) packages/engine/dist/worktree.js:128,198,275-282 y worktree-integrar.js (RAMA_BASE) fijan main: journey worktree create exige el ticket en main y crea la rama desde main, e integrate y remove solo operan contra main; en SaiOpenCloud main está desactualizado y hubo que crear worktrees con git worktree add desde dev e integrar con merge manual. La rama base debería salir de la configuración del proyecto. (2) references.js modifiedFunctionalFiles excluye rutas que empiezan por tickets/ pero no el registro real docs/tickets/: con un ticket con puntos sin affected_files, close y qa-start --build-reference worktree fallan con «affected_files no puede incluir el historial de tickets» porque el propio ticket.md modificado entra al diff. (3) El comentario de qa-start en append.js dice que sin evidencia de worktree la referencia libre sigue funcionando, pero la validación solo acepta commit:<sha40> o worktree:sha256; con un ticket ya commiteado y sin puntos con archivos no hay forma de abrir el ciclo QA sin calcular el hash a mano.

### Supuestos y decisiones pendientes

<!-- Si el pedido nombra algo que el código no tiene —parámetro, permiso,
campo, bandera, columna, migración— y no lo especifica, listá cada elemento
con su pregunta antes de avanzar a análisis; el análisis no planifica sobre
la adivinanza. Si no hay ninguno, escribí «Ninguno» y seguí. -->
Ninguno.

## Descripción funcional

- Alcance: los subcomandos `valmen journey worktree create|integrate|remove` y el cálculo de la referencia `worktree` (hash de QA) que usan `add-evidence --reference worktree`, `qa-start --build-reference worktree` y el cierre. Queda fuera la rama de trabajo de la jornada autónoma (`asegurarRamaDeTrabajo`), que sigue naciendo de `main`.
- Usuario o rol afectado: el orquestador (persona o agente) de una corrida orquestada en un proyecto cuya rama de trabajo no es `main` (SaiOpenCloud trabaja sobre `dev`) y quien abre la evidencia o el ciclo de QA de un ticket cuyo registro está en `docs/tickets/`.
- Comportamiento actual: (1) `journey worktree create` exige el ticket en `main` y crea la rama desde `main`; `integrate` y `remove` se niegan si el checkout principal no está en `main`. (2) Con el registro en `docs/tickets/`, la referencia `worktree` falla con «affected_files no puede incluir ticket.md» o «…el historial de tickets» en cuanto el ticket.md está modificado. (3) Con el ticket commiteado, el árbol limpio y sin puntos con `affected_files`, la referencia `worktree` falla con «No hay archivos funcionales modificados» y no queda otra salida que calcular el hash a mano.
- Comportamiento esperado: la rama base sale de la configuración del proyecto (`main` si no se declara), y create, integrate y remove operan contra ella; el hash excluye el registro real del proyecto, sea `tickets/` o `docs/tickets/`; con el árbol limpio, el hash cubre los archivos que la rama del ticket cambió respecto de la rama base.

## Diagnóstico

- Causa comprobada (con `ruta:línea`):
  - H1. `packages/engine/src/worktree.ts:191` pregunta `git cat-file -e main:<ticket>` y `worktree.ts:196` falla si el ticket no está en `main`. Reproducido en un repositorio temporal con la rama `dev` (scratchpad `repro-dev`): sin `main` y con `main` atrasada, `node packages/cli/dist/main.js journey worktree create --id BUGFIX-CORE-REPRO-RAMA-20261014` → exit 3, «no está registrado en main».
  - H2. `packages/engine/src/worktree.ts:281` crea la rama con `worktree add -b <rama> <carpeta> main` y la lista cerrada `packages/engine/src/worktree-git.ts:106` solo admite `main` como punto de partida.
  - H3. `packages/engine/src/worktree-integrar.ts:98` rechaza el checkout que no está en `RAMA_BASE`, fijada en `packages/engine/src/integration-commit.ts:165` como `"main"`; el resto de la integración (`worktree-integrar.ts:107,130,139,206,238,261,280`) compara contra esa constante. Reproducido: con el checkout en `dev`, `journey worktree integrate` → exit 3, «está en "dev", no en main».
  - H4. `packages/engine/src/worktree.ts:392` y `worktree.ts:402` hacen lo mismo en `quitarWorktree`. Reproducido: `journey worktree remove` → exit 3, «no en main».
  - H5. `packages/cli/src/worktree.ts:35,53,62,65,66` escriben «main» literal en los mensajes de create, integrate y remove.
  - H6. `packages/engine/src/references.ts:138` descarta del diff solo las rutas que empiezan por `tickets/` y `.valmen/`; con el registro en `docs/tickets/` el propio ticket.md llega a `validateFunctionalFile`, que lo rechaza en `references.ts:89-93` (ticket.md) o en `references.ts:95-96` (historial). Reproducido con `add-evidence --reference worktree` y el ticket.md modificado → exit 5.
  - H7. `packages/engine/src/references.ts:128` solo mira `git diff HEAD`: con el árbol limpio la lista queda vacía y `references.ts:161` falla. Reproducido: árbol limpio y ticket commiteado → exit 5, «No hay archivos funcionales modificados».
  - H8. El comentario de `packages/engine/src/append.ts:528-535` promete que «la referencia libre de siempre sigue funcionando», pero `packages/core/src/contract.ts:335` y `packages/core/src/validators.ts:198` solo aceptan `commit:<sha40>` o `worktree:sha256:<hex>`, y `commit:` exige evidencia de worktree en `append.ts:553-559`: la única salida era un `worktree:sha256` literal calculado a mano.
- Hipótesis pendientes: ninguna sobre la causa. Queda sin decidir aquí si la jornada autónoma (`integration-commit.ts:174-241`, consumida por `packages/engine/src/autonomous-run.ts:487`) también debe nacer de la rama base configurable; se deja fuera para no ampliar el alcance y se propone aparte.
- Consumidores afectados: `packages/cli/src/worktree.ts` (subcomandos create, integrate, remove y `integrate --retirar`), `packages/engine/src/worktree-integracion-git.ts` (reutiliza `motivoDeGitDeWorktree`), `packages/engine/src/append.ts:251` (add-evidence) y `append.ts:603` (qa-start), que llaman a `resolveReference`; las pruebas `tests/worktree-git.test.ts`, `tests/worktree-cli.test.ts`, `tests/worktree-integrar.test.ts`, `tests/worktree-integrar-retirar.test.ts`, `tests/worktree-integracion.test.ts` y `tests/qa-commit-referencia.test.ts`.
- Archivos y flujo investigados: `packages/cli/src/worktree.ts` → `crearWorktree`/`quitarWorktree` (`packages/engine/src/worktree.ts:177,378`) e `integrarWorktree` (`packages/engine/src/worktree-integrar.ts:73`), todos con su git por las listas cerradas de `packages/engine/src/worktree-git.ts:57` y `packages/engine/src/worktree-integracion-git.ts:31`; la configuración de ramas se lee en `packages/adapter/src/config.ts:1108` (`readIntegrationConfig`: `execution.work-branch` y `execution.protected-branches`, sin rama base). Referencia: `resolveReference` (`references.ts:205`) → `calculateWorktreeReference` (`references.ts:152`) → `declaredFunctionalFiles` (`references.ts:101`) o `modifiedFunctionalFiles` (`references.ts:127`). `buscar_memoria` no devolvió antecedentes de este síntoma.
- Riesgos y compatibilidad: los proyectos que ya trabajan sobre `main` no declaran la clave y deben seguir igual; la lista cerrada de git no se abre a cualquier rama, solo a la base declarada; `tests/worktree-git.test.ts:80` exige que `worktree add … otra` se rechace y debe seguir en verde. El fallback del hash a `<base>...HEAD` solo actúa donde hoy se falla con «No hay archivos funcionales modificados»; con la rama base inexistente el diff falla y el error sigue siendo el de hoy.
- Impactos de sync, migración, Docker o despliegue: ninguno; cambia el motor del harness y la CLI, sin datos sincronizados, migraciones, contenedores ni despliegue.

## Plan

- Gate de plan y aprobación: pendiente; la compuerta `plan` se evalúa con `--evaluator cascade` y la aprobación es de la política por defecto o de una persona, no de este agente.
- Modo: harness completo, porque el arreglo toca cuatro módulos (`adapter`, `engine`, `cli` y las pruebas) y una lista cerrada de git.
- Regla de la rama base: la clave `execution.base-branch` de `.valmen/config.yaml`; sin la clave, `main`. Se eligió sobre «la rama actual del checkout principal» porque esa rama puede ser la de una jornada y el worktree nacería de ella sin que nadie lo declare (registrado con `valmen agent-decision`).
- Alcance: `packages/adapter/src/config.ts`, `packages/engine/src/rama-base.ts` (nuevo), `packages/engine/src/worktree-git.ts`, `packages/engine/src/worktree.ts`, `packages/engine/src/worktree-integrar.ts`, `packages/engine/src/references.ts`, el comentario de `packages/engine/src/append.ts`, `packages/cli/src/worktree.ts` y sus índices de exportación. Exclusiones: `RAMA_BASE` y `asegurarRamaDeTrabajo` de `packages/engine/src/integration-commit.ts` (la jornada autónoma) no cambian; `packages/core` no cambia; ninguna prueba existente se edita.
- Pasos ordenados:
  1. Pruebas primero, vistas en rojo antes de tocar el código. `tests/worktree-rama-base.test.ts`, sobre `crearLaboratorio` y `procesoSimulado` de `tests/helpers/worktree-lab.ts`, renombra `main` a `dev` y declara `execution:\n  base-branch: dev` en la configuración del laboratorio; cubre `ramaBaseDelProyecto`, create, integrate, remove, los mensajes de `journeyWorktreeCommand` y `motivoDeGitDeWorktree`, más un caso de regresión sobre `main` sin la clave. `tests/referencia-registro.test.ts`, con un repositorio git temporal con el registro en `docs/tickets/` y la rama `dev`, cubre `add-evidence --reference worktree` con el ticket.md modificado, con el árbol limpio y commits sobre la base, sin commits sobre la base, y la regresión con el registro en `tickets/`. Comandos: `npx vitest run tests/worktree-rama-base.test.ts` y `npx vitest run tests/referencia-registro.test.ts` (C1–C13).
  2. `packages/adapter/src/config.ts`: `DEFAULT_BASE_BRANCH = "main"` y `readBaseBranch(config)`, que lee `execution.base-branch` y rechaza un nombre vacío, con `..`, `<`, `>`, barra final, `.lock` o una rama `valmen/ticket-…`; se exporta desde `packages/adapter/src/index.ts` (C1, C2).
  3. `packages/engine/src/rama-base.ts`: `ramaBaseDelProyecto(root)` lee `.valmen/config.yaml` con `parseConfig` y `readBaseBranch`; sin archivo devuelve `main` y con un valor inválido falla con salida 3; se exporta desde `packages/engine/src/index.ts` (C1, C2).
  4. `packages/engine/src/worktree-git.ts`: `motivoDeGitDeWorktree(argumentos, ramaBase = "main")` admite `worktree add -b <rama> <carpeta> <ramaBase>` solo con la base que recibe, y `ejecutarGitDeWorktree` gana el parámetro opcional `ramaBase`; `tests/worktree-git.test.ts:80` sigue rechazando `otra` (C9, C16).
  5. `packages/engine/src/worktree.ts`: `crearWorktree` resuelve la base con `ramaBaseDelProyecto`, pregunta `cat-file -e <base>:<ticket>`, nombra la base en el mensaje y crea la rama con `worktree add … <base>`; `quitarWorktree` compara el checkout y el `merge-base --is-ancestor` contra la base; `WorktreeCreado` y `WorktreeQuitado` ganan `ramaBase` (C3, C4, C7, C10).
  6. `packages/engine/src/worktree-integrar.ts`: `integrarWorktree` reemplaza `RAMA_BASE` por la base resuelta en el checkout, el diff, el `merge-tree`, el merge y los mensajes; `WorktreeIntegrado` gana `ramaBase` (C5, C6, C10).
  7. `packages/cli/src/worktree.ts`: los textos de create, integrate y remove usan `r.ramaBase` en vez de «main» literal; con la base `main` el texto no cambia (C8, C10).
  8. `packages/engine/src/references.ts`: `modifiedFunctionalFiles` descarta además el registro real, derivado de `ticketPath` (`<registro>/AAAA/<ID>/ticket.md`), y si `git diff HEAD` no da archivos usa `git diff --name-only --diff-filter=ACMR <base>...HEAD` con el mismo filtro; si tampoco hay, el error de salida 5 conserva su texto y añade cómo declarar los archivos (C11, C12, C13).
  9. `packages/engine/src/append.ts:528-535`: el comentario de `qaStart` dice que sin evidencia de worktree se usa `--build-reference worktree`, que calcula el hash, o un `worktree:sha256:` literal; no cambia código (C14, C15).
  10. `npm run build` en el worktree y regresión sin editar pruebas existentes: `npx vitest run tests/worktree-git.test.ts tests/worktree-cli.test.ts tests/worktree-integracion.test.ts tests/worktree-integrar.test.ts tests/worktree-integrar-retirar.test.ts tests/worktree-registros.test.ts tests/entrega-tope.test.ts tests/limpieza.test.ts tests/integracion-autonoma.test.ts tests/reglas-integracion.test.ts` y `npx vitest run tests/qa-commit-referencia.test.ts`. Si una prueba existente se pone en rojo, se detiene la implementación y se reporta en el ticket (C14, C16, C17).
  11. Verificación funcional con el CLI del worktree sobre el repositorio temporal de la reproducción (`repro-dev` del scratchpad, rama `dev`, `execution.base-branch: dev`): create, integrate y remove salen con 0, y `add-evidence --reference worktree` calcula el hash con el ticket.md modificado (C3, C5, C7, C11).
- Respuesta al diagnóstico:
  - H1 `packages/engine/src/worktree.ts:191`, `worktree.ts:196` (ticket exigido en `main`) → paso 5 → C4.
  - H2 `packages/engine/src/worktree.ts:281` y `packages/engine/src/worktree-git.ts:106` (rama creada desde `main`) → pasos 4 y 5 → C3, C9.
  - H3 `packages/engine/src/worktree-integrar.ts:98` con `packages/engine/src/integration-commit.ts:165` (integrar solo sobre `main`) → paso 6 → C5, C6.
  - H4 `packages/engine/src/worktree.ts:392`, `worktree.ts:402` (quitar solo contra `main`) → paso 5 → C7.
  - H5 `packages/cli/src/worktree.ts:35,53,62,65,66` («main» literal) → paso 7 → C8.
  - H6 `packages/engine/src/references.ts:138` con `references.ts:89-96` (`docs/tickets/` entra al diff) → paso 8 → C11.
  - H7 `packages/engine/src/references.ts:128`, `references.ts:161` (árbol limpio sin archivos) → paso 8 → C12, C13.
  - H8 `packages/engine/src/append.ts:528-535` frente a `packages/core/src/validators.ts:198` (comentario que promete una forma que no existe) → paso 9 → C15.
  - Riesgo de compatibilidad con los proyectos sobre `main` → pasos 2, 3, 7 y 10 (sin la clave la base es `main`) → C1, C10, C16.
  - Riesgo de abrir la lista cerrada de git (`tests/worktree-git.test.ts:80`) → paso 4 → C9, C16.
  - Hipótesis pendiente de la jornada (`packages/engine/src/integration-commit.ts:174-241`) → fuera de alcance, sin paso; se propone aparte.
- Impactos declarados: ninguno; sin sincronización, sin migración y sin contenedores.
- Tamaño previsto: unas 380 líneas (unas 110 de producción y 270 de pruebas), 17 criterios.
- Si excede el tope: no excede el tope.
- Rollback (obligatorio): revertir el commit del ticket en la rama (`git revert <hash>`); no hay datos ni migraciones que deshacer, y un `execution.base-branch` ya declarado en un proyecto queda ignorado porque la configuración tolera claves que no lee.

## Criterios de aceptación

- [x] C1: sin `execution.base-branch` en la configuración, la rama base del proyecto es `main`.
      <!-- test: npx vitest run tests/worktree-rama-base.test.ts -->
- [x] C2: un `execution.base-branch` con un nombre de rama inválido se rechaza al leer la configuración.
      <!-- test: npx vitest run tests/worktree-rama-base.test.ts -->
- [x] C3: con `execution.base-branch: dev` y sin rama `main`, `journey worktree create` crea `valmen/ticket-<slug>` en el commit de `dev`.
      <!-- test: npx vitest run tests/worktree-rama-base.test.ts -->
- [x] C4: con la base `dev`, `journey worktree create` rechaza un ticket que no está commiteado en `dev` con un mensaje que nombra `dev`.
      <!-- test: npx vitest run tests/worktree-rama-base.test.ts -->
- [x] C5: con la base `dev` y el checkout principal en `dev`, `journey worktree integrate` deja la rama del ticket integrada en `dev`.
      <!-- test: npx vitest run tests/worktree-rama-base.test.ts -->
- [x] C6: con la base `dev` y el checkout principal en otra rama, `journey worktree integrate` se rechaza con un mensaje que nombra `dev`.
      <!-- test: npx vitest run tests/worktree-rama-base.test.ts -->
- [x] C7: con la base `dev`, `journey worktree remove` quita el worktree de una rama ya integrada en `dev`.
      <!-- test: npx vitest run tests/worktree-rama-base.test.ts -->
- [x] C8: la salida de `journey worktree create` nombra la rama base resuelta.
      <!-- test: npx vitest run tests/worktree-rama-base.test.ts -->
- [x] C9: la lista cerrada de git de los worktrees rechaza `worktree add` hacia una rama distinta de la base declarada.
      <!-- test: npx vitest run tests/worktree-rama-base.test.ts -->
- [x] C10 (regresión): en un proyecto sin la clave, create, integrate y remove siguen operando sobre `main`.
      <!-- test: npx vitest run tests/worktree-rama-base.test.ts -->
- [x] C11: con el registro en `docs/tickets/` y su ticket.md modificado, `add-evidence --reference worktree` calcula el hash.
      <!-- test: npx vitest run tests/referencia-registro.test.ts -->
- [x] C12: con el árbol limpio y commits de la rama del ticket sobre la base, la referencia `worktree` cubre los archivos cambiados desde la base.
      <!-- test: npx vitest run tests/referencia-registro.test.ts -->
- [x] C13: con el árbol limpio y sin commits sobre la base, la referencia `worktree` sigue fallando con salida 5.
      <!-- test: npx vitest run tests/referencia-registro.test.ts -->
- [x] C14 (regresión): `qa-start --build-reference commit:<sha>` conserva su verificación de igualdad con la evidencia.
      <!-- test: npx vitest run tests/qa-commit-referencia.test.ts -->
- [x] C15: el comentario de `qaStart` en `packages/engine/src/append.ts` describe solo las referencias que la validación acepta.
      <!-- verify: manual -->
- [x] C16 (regresión): las pruebas existentes de worktree, integración y jornada pasan sin editarse.
      <!-- test: npx vitest run tests/worktree-git.test.ts tests/worktree-cli.test.ts tests/worktree-integracion.test.ts tests/worktree-integrar.test.ts tests/worktree-integrar-retirar.test.ts tests/worktree-registros.test.ts tests/entrega-tope.test.ts tests/limpieza.test.ts tests/integracion-autonoma.test.ts tests/reglas-integracion.test.ts -->
- [x] C17: el monorepo compila con los cambios.
      <!-- test: npx tsc --build tsconfig.build.json -->

## Puntos

```json
[]
```

## Implementación

- Modo: harness completo (plan aprobado por el revisor, recibo plan-1). Decisiones D-001 (regla de la rama base) y D-002 (jornada fuera) pendientes de ratificar.
- `packages/adapter/src/config.ts`: `DEFAULT_BASE_BRANCH` y `readBaseBranch` (`execution.base-branch`, `main` sin la clave; rechaza vacío, `..`, `<`/`>`, barra final, `.lock` y ramas `valmen/ticket-…`).
- `packages/engine/src/rama-base.ts` (nuevo): `ramaBaseDelProyecto(root)`; exportado en `packages/engine/src/index.ts`.
- `packages/engine/src/worktree-git.ts`: `motivoDeGitDeWorktree(argumentos, ramaBase = "main")` y `ejecutarGitDeWorktree(…, ramaBase?)`; `worktree add` solo hacia la base recibida.
- `packages/engine/src/worktree.ts`: `crearWorktree` y `quitarWorktree` usan la base resuelta (`cat-file`, `worktree add`, checkout, `merge-base`, mensajes) y devuelven `ramaBase`.
- `packages/engine/src/worktree-integrar.ts`: `integrarWorktree` reemplaza `RAMA_BASE` por la base resuelta y devuelve `ramaBase`; `RAMA_BASE` de `integration-commit.ts` (jornada) no cambia.
- `packages/cli/src/worktree.ts`: los textos de create, integrate y remove nombran `r.ramaBase`; `packages/cli/src/main.ts`: la ayuda de `journey worktree` documenta la clave. `.valmen/config.yaml` del proyecto no se tocó: la clave se documenta, no se activa.
- `packages/engine/src/references.ts`: `modifiedFunctionalFiles` descarta el registro real (derivado de `ticketPath`) además de `tickets/` y `.valmen/`, y con el árbol limpio usa `git diff --name-only --diff-filter=ACMR <base>...HEAD`; el error de salida 5 conserva su texto y dice cómo declarar archivos.
- `packages/engine/src/append.ts`: el comentario de `qaStart` describe las referencias que la validación acepta (sin cambio de código).
- Hallazgo fuera de alcance: la receta de `journey worktree create` e `integrate` corre `npx tsc --build tsconfig.build.json` y `node scripts/copy-web.mjs` (`packages/engine/src/worktree.ts:335-338`, `packages/engine/src/worktree-integrar.ts:330-333`), propias del harness; en SaiOpenCloud fallarán aunque la rama base ya sea `dev`. Se propone un ticket aparte; en la reproducción se simuló con un `tsc` vacío en `node_modules/.bin`.

## Pruebas

- Directorio: `/Users/juanandrade/Desktop/ValmenHarness/.claude/worktrees/ticket-worktree-rama-base` (o la raíz del checkout tras integrar).
- Ambiente: Node 24, dependencias instaladas, git; las pruebas crean repositorios temporales en el directorio temporal del sistema y no tocan red.
- Rojo antes del arreglo (observado): `npx vitest run tests/worktree-rama-base.test.ts tests/referencia-registro.test.ts` → 18 fallos (C1–C9, C11, C12; `ramaBaseDelProyecto is not a function`, «no está registrado en main», «no en main», «affected_files no puede incluir ticket.md», «No hay archivos funcionales modificados»); la regresión C10 y C13 ya pasaban.
- Comandos y resultado esperado:
  1. `npm run build` → sale con 0.
  2. `npx vitest run tests/worktree-rama-base.test.ts tests/referencia-registro.test.ts` → 19 pasadas, 0 fallos (C1–C13).
  3. `npx vitest run tests/worktree-git.test.ts tests/worktree-cli.test.ts tests/worktree-integracion.test.ts tests/worktree-integrar.test.ts tests/worktree-integrar-retirar.test.ts tests/worktree-registros.test.ts tests/entrega-tope.test.ts tests/limpieza.test.ts tests/integracion-autonoma.test.ts tests/reglas-integracion.test.ts tests/qa-commit-referencia.test.ts tests/cli-tabla-comandos.test.ts` → 12 archivos, 241 pasadas (C14, C16).
  4. Batería conjunta worktree/jornada/QA/integración: el comando 3 más `tests/worktree-rama-base.test.ts tests/referencia-registro.test.ts tests/avance-jornada.test.ts tests/jornada-*.test.ts tests/journey-brief-worktree.test.ts tests/qa-agent.test.ts tests/qa-sin-cubrir.test.ts tests/autonomous-run.test.ts tests/mcp-server.test.ts` → 26 archivos, 513 pasadas, 0 fallos.
  5. `npx tsc --build tsconfig.build.json` → sale con 0 (C17).
- Ninguna prueba existente se editó; `git merge main` no trajo cambios (main en `bf50cbb`, igual que la base de la rama).
- Validación manual (C15): leer `packages/engine/src/append.ts:528-537` y comprobar que solo nombra `commit:<sha>` con evidencia, `--build-reference worktree` y `worktree:sha256:<hex>` literal.
- Validación funcional con datos reales: repositorio temporal `repro-dev` (scratchpad de la sesión) sobre `dev`, `main` atrasada en `fef5047` y registro en `docs/tickets/`. Antes del arreglo: create, integrate y remove → exit 3; `add-evidence --reference worktree` → exit 5 (ticket.md de `docs/tickets/` y árbol limpio). Con el arreglo y `execution.base-branch: dev`: `journey worktree create` → «desde dev en f3f4cfc17971», exit 0; `add-evidence --reference worktree` en la rama limpia y con el ticket.md modificado → exit 0; `journey worktree integrate` → «integrada en dev por avance directo (1a36fde5027d)», exit 0; `journey worktree remove` → «ya estaba integrada en dev», exit 0.
- Para reproducirlo en otro proyecto sobre `dev`: declarar `execution:` / `  base-branch: dev` en su `.valmen/config.yaml`, commitear el ticket en `dev` y correr `valmen journey worktree create --id <ID>` desde el checkout principal en `dev`.

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
    "date": "2026-10-14",
    "session_reference": null,
    "model": null,
    "reasoning_effort": null,
    "notes": "Subagente de la corrida orquestada (claude-opus-5-5): análisis, plan e implementación en una sesión; el cliente no expone los números de tokens ni coste de la sesión del subagente.",
    "input_tokens": null,
    "output_tokens": null,
    "total_tokens": null,
    "estimated_cost_usd": null,
    "source": "manual:subagente-rama-base-20261014",
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
    "date": "2026-10-13",
    "at": "2026-10-14T02:41:49.715Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-14",
    "at": "2026-10-14T15:20:50.291Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-14",
    "at": "2026-10-14T15:22:40.114Z",
    "action": "agent-decision",
    "actor": "cli",
    "details": "{\"id\":\"D-001\",\"pregunta\":\"¿De dónde sale la rama base de los worktrees de ticket?\",\"eleccion\":\"Clave execution.base-branch de .valmen/config.yaml; sin la clave, main\",\"alternativas\":[\"rama actual del checkout principal\",\"constante main (estado actual)\"],\"criterio\":\"Explícita y compatible: los proyectos sobre main no declaran nada; la rama actual puede ser la de una jornada y el worktree nacería de ella sin declararlo\",\"fuente\":\"packages/adapter/src/config.ts:1108; packages/engine/src/integration-commit.ts:165\",\"reversion\":\"git revert del commit del ticket; la clave declarada queda ignorada\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-14",
    "at": "2026-10-14T15:22:41.254Z",
    "action": "agent-decision",
    "actor": "cli",
    "details": "{\"id\":\"D-002\",\"pregunta\":\"¿La jornada autónoma (asegurarRamaDeTrabajo) también usa la rama base configurable?\",\"eleccion\":\"No en este ticket: sigue naciendo de main y se propone aparte\",\"alternativas\":[\"incluirla aquí\"],\"criterio\":\"Conservador: el ticket pide worktree create/integrate/remove y el hash; ampliar a la jornada toca autonomous-run sin reproducción\",\"fuente\":\"packages/engine/src/integration-commit.ts:174-241; packages/engine/src/autonomous-run.ts:487\",\"reversion\":\"un ticket aparte puede pasar readBaseBranch a asegurarRamaDeTrabajo\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-14",
    "at": "2026-10-14T15:23:58.549Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-14",
    "at": "2026-10-14T15:26:18.758Z",
    "action": "plan-approved",
    "actor": "cli",
    "details": "{\"actor\":\"revisor claude-code/claude-sonnet-5-5 (autorización POLITICA-POR-DEFECTO)\",\"source\":\"revisor\",\"quote\":\"El plan respalda las cuatro proposiciones. Cada criterio C1–C17 tiene un paso y una prueba o verificación declarada. Cada hallazgo H1–H8 se asigna a un paso y a criterios. La compatibilidad se protege con el valor por defecto `main`, las pruebas de regresión C10, C14 y C16, y la ausencia de ediciones a pruebas existentes.\",\"planHash\":\"sha256:122feeb05e5ca99261b50b101a8c7d374cf2e3a5709ceb015eb5a5971c09ab88\",\"authorizationId\":\"POLITICA-POR-DEFECTO\",\"authorizationHash\":\"sha256:c1bb46dd45f48a215d91a242f445eab06b4ac6f78aa546bf15d8b85902a01a0a\",\"reviewerModel\":\"claude-sonnet-5-5\",\"stage\":\"plan\",\"receiptId\":\"GR-20261014-BUGFIX-ENGINE-WORKTREE-RAMA-BASE-20261014-plan-1\",\"receiptStateHash\":\"sha256:c6dc5fcbce2f966599e9aad19b78e36f97e547debef472adb310261ea4a137c9\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-14",
    "at": "2026-10-14T15:26:22.251Z",
    "action": "plan-approval-verified",
    "actor": "cli",
    "details": "Aprobación del plan vigente: revisor claude-code/claude-sonnet-5-5 (autorización POLITICA-POR-DEFECTO) (fuente revisor, hash sha256:c1bb46dd45f48a215d91a242f445eab06b4ac6f78aa546bf15d8b85902a01a0a), plan sha256:122feeb05e5ca99261b50b101a8c7d374cf2e3a5709ceb015eb5a5971c09ab88."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-10-14",
    "at": "2026-10-14T15:26:22.251Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-10-14",
    "at": "2026-10-14T15:26:34.405Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-10-14",
    "at": "2026-10-14T15:33:38.119Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-10-14",
    "at": "2026-10-14T15:35:31.463Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-10-14",
    "at": "2026-10-14T15:36:00.151Z",
    "action": "delivery-size",
    "actor": "cli",
    "details": "{\"añadidas\":436,\"borradas\":61,\"total\":497,\"tope\":600,\"pasaElTope\":false,\"via\":\"worktree\"}"
  }
]
```
