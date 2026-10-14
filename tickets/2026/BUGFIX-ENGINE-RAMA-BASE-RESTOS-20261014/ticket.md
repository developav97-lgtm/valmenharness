---
schema_version: 2
id: BUGFIX-ENGINE-RAMA-BASE-RESTOS-20261014
title: Restos de main fijo y de la receta de compilación del harness en proyectos que trabajan sobre dev
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
created: 2026-10-14
updated: 2026-10-14
related_ticket: null
target_release: null
released_in: null
---

# BUGFIX-ENGINE-RAMA-BASE-RESTOS-20261014

## Solicitud original

Continuación de BUGFIX-ENGINE-WORKTREE-RAMA-BASE-20261014 (cerrado; D-002 dejó fuera la jornada autónoma). Ese ticket hizo que worktree create, integrate y remove y el hash de QA lean la rama base de execution.base-branch en .valmen/config.yaml (ramaBaseDelProyecto, packages/engine/src/rama-base.ts), con main por defecto. Quedan sitios con main fijo y una receta de compilación del propio harness que fallan en un proyecto que trabaja sobre dev, como SaiOpenCloud: (1) packages/engine/src/integration-commit.ts:165 define RAMA_BASE = "main" y lo usan :188, :197, :201 y :204 para dejar la rama de trabajo de la jornada autónoma al día antes de despachar; (2) packages/engine/src/limpieza.ts:182 exige que el checkout principal esté en main y :213 comprueba con merge-base --is-ancestor contra main antes de limpiar un worktree ya integrado; (3) packages/engine/src/code-review.ts:281-284 toma main como base del diff cuando no se pasa --base; (4) packages/engine/src/worktree.ts:335-336 y packages/engine/src/worktree-integrar.ts:331-332 corren, tras crear o integrar, npx tsc --build tsconfig.build.json y node scripts/copy-web.mjs, que son del propio repositorio del harness; en un proyecto que no es el harness esos comandos no existen y la recompilación falla aunque la integración ya se hizo; la lista de procesos permitidos está en packages/engine/src/worktree-git.ts:195-196. Esperado: los tres primeros sitios usan la misma rama base que ya resuelve ramaBaseDelProyecto (sin cambiar el comportamiento de los proyectos sobre main), y la recompilación solo corre cuando el proyecto la tiene, sin hacer fallar un create o un integrate que sí se hicieron. No se agrega ninguna clave nueva de configuración sin decidirlo en el análisis con la opción conservadora.

### Supuestos y decisiones pendientes

<!-- Si el pedido nombra algo que el código no tiene —parámetro, permiso,
campo, bandera, columna, migración— y no lo especifica, listá cada elemento
con su pregunta antes de avanzar a análisis; el análisis no planifica sobre
la adivinanza. Si no hay ninguno, escribí «Ninguno» y seguí. -->
Ninguno.

## Descripción funcional

- Alcance: los cuatro sitios que quedaron fuera de BUGFIX-ENGINE-WORKTREE-RAMA-BASE-20261014: la rama de trabajo de la jornada autónoma (`asegurarRamaDeTrabajo`), `valmen cleanup`, la base por defecto del diff de `gate code-review` y la receta de compilación que `journey worktree create` e `integrate` corren tras crear o integrar. Todos reutilizan `ramaBaseDelProyecto` (`packages/engine/src/rama-base.ts:15`); no se agrega ninguna clave de configuración.
- Usuario o rol afectado: el orquestador (persona o agente) de un proyecto cuya rama de trabajo no es `main` —SaiOpenCloud trabaja sobre `dev` con `main` atrasada— que corre la jornada autónoma, la limpieza, la revisión de código o los worktrees por ticket.
- Comportamiento actual: (1) la jornada crea o avanza su rama de trabajo desde `main` aunque el proyecto declare `execution.base-branch: dev`, y sin `main` se detiene; (2) `valmen cleanup` se niega desde `dev` y, desde `main`, conserva como «commits sin integrar» un worktree ya integrado en `dev`; (3) `gate code-review` sin `--base` mide el diff contra `main` y revisa commits de `dev` que no son del ticket; (4) `journey worktree create` aborta en un proyecto sin `node_modules` en la raíz o sin `tsconfig.build.json`, e `integrate` sale con 3 tras integrar porque la recompilación del harness no existe en ese proyecto.
- Comportamiento esperado: la jornada, la limpieza y code-review usan la rama base del proyecto (`main` si no se declara); la receta de compilación solo corre en el proyecto que la tiene, y en el que no la tiene create e integrate terminan con 0 y un aviso. Los proyectos sobre `main` se comportan igual que hoy.

## Diagnóstico

- Causa comprobada (con `ruta:línea`):
  - H1. `packages/engine/src/integration-commit.ts:165` fija `RAMA_BASE = "main"` y `asegurarRamaDeTrabajo` la usa en `:188`, `:197`, `:201`, `:204-205`, `:220`, `:234` y `:237`. Reproducido con el dist del worktree sobre un repositorio temporal en `dev` con `execution.base-branch: dev` (repositorio repro-jornada del scratchpad, con un guion que importa `asegurarRamaDeTrabajo` de `packages/engine/dist/integration-commit.js`): con `main` atrasada la rama `valmen/jornada` nace en el commit de `main` y `dev` no es su ancestro; sin `main` falla con «No existe la rama base main».
  - H2. `packages/engine/src/limpieza.ts:182-186` (`exigirMain`) rechaza el checkout que no está en `main`, `limpieza.ts:213` compara `merge-base --is-ancestor <commit> main`, `limpieza.ts:220` escribe «integrado en main» y la lista cerrada `packages/engine/src/limpieza-git.ts:50` solo admite `main` como destino de `merge-base` (`limpieza-git.ts:56` protege solo `main` de `branch -d`). Reproducido (scratchpad `repro-restos`): `node packages/cli/dist/main.js cleanup --json` desde `dev` → exit 3, «no en main»; desde `main`, con la rama del ticket ya integrada en `dev`, la clasifica «commits sin integrar».
  - H3. `packages/engine/src/code-review.ts:280-284` toma `main` (o `HEAD` si no existe) como base cuando no se pasa `--base`, y la ayuda `packages/cli/src/main.ts:385` lo promete. Reproducido: con el ticket en `in_progress` en la rama `trabajo` salida de `dev` y un cambio solo en un archivo de pruebas del repositorio temporal, `gate code-review` imprimió «Base: main» y revisó 4 archivos, entre ellos los dos archivos fuente que trajeron los commits de `dev`, ajenos al ticket; el riesgo subió a medio y se llamó a un revisor real (coste USD 0,0028).
  - H4. `packages/engine/src/worktree.ts:300-304` exige `node_modules` en la raíz y `worktree.ts:334-344` corre `npx tsc --build tsconfig.build.json` y `node scripts/copy-web.mjs` en el worktree; un fallo aborta el create. Reproducido: sin `node_modules` → exit 3, «No hay …/node_modules que clonar»; con `node_modules` y sin `tsconfig.build.json` → exit 3, «La compilación falló», y `npx` descargó e intentó ejecutar el paquete ajeno `tsc@2.0.4` del registro de npm.
  - H5. `packages/engine/src/worktree-integrar.ts:329-340` recompila el checkout principal tras integrar y sale con 3 si falla. Reproducido: `journey worktree integrate` integró la rama en `dev` (commit `0f3cbe6`) y salió con 3, «la recompilación falló (npx tsc --build tsconfig.build.json)».
  - H6 (fuera de alcance, D-003). Un create abortado informa «quedó a medias: no se pudo borrar la rama» aunque no quedó nada: `deshacer` (`packages/engine/src/worktree.ts:253-261`) no resetea `ramaCreada` y el `catch` de `worktree.ts:365` lo vuelve a llamar. Se propone aparte.
- Hipótesis pendientes: ninguna sobre las causas. La lista cerrada de procesos (`packages/engine/src/worktree-git.ts:195-196`) no cambia: lo que cambia es cuándo se pide la receta.
- Consumidores afectados: `packages/engine/src/autonomous-run.ts:487` (despacho de la jornada); `packages/cli/src/limpieza.ts` (`valmen cleanup`); `runGate` y la herramienta MCP de compuertas, que llegan a `runCodeReview` (`packages/engine/src/code-review.ts:231`); `packages/cli/src/worktree.ts:37,55,74`, que imprime los avisos de create e integrate. Pruebas que fijan el comportamiento actual: `tests/integracion-autonoma.test.ts`, `tests/limpieza.test.ts`, `tests/code-review.test.ts:800-830`, `tests/worktree-integracion.test.ts:115-147`, `tests/worktree-integrar.test.ts:360-383`.
- Archivos y flujo investigados: `ramaBaseDelProyecto` (`packages/engine/src/rama-base.ts:15`) lee `execution.base-branch` con `readBaseBranch` (`packages/adapter/src/config.ts:1143`); el git de la jornada pasa por `ejecutarGitPermitido` (`packages/engine/src/integration-rules.ts:164`), que ya admite cualquier rama en `switch -c`, `merge --ff-only` y `merge-base --is-ancestor`; el de la limpieza por `ejecutarGitDeLimpieza` (`limpieza-git.ts`); el diff de code-review por `cambiosContraBase` (`packages/engine/src/diff.ts:337`). `buscar_memoria` no devolvió antecedentes de este síntoma.
- Riesgos y compatibilidad: sin la clave la base sigue siendo `main` en los cuatro sitios; la limpieza nunca borra la rama base ni `main` con `branch -d`; el laboratorio de las pruebas existentes tiene `node_modules/@valmen` y el harness tiene `tsconfig.build.json`, así que la receta sigue corriendo donde corre hoy (D-001); cuando la receta aplica y falla, create e integrate conservan su salida de hoy (D-002). Una `execution.base-branch` inválida ya falla con salida 3 en `ramaBaseDelProyecto`; code-review la devuelve como error sin llamar a revisores.
- Impactos de sync, migración, Docker o despliegue: ninguno; cambia el motor del harness y la ayuda del CLI, sin datos sincronizados, migraciones, contenedores ni despliegue.

## Plan

- Gate de plan y aprobación: pendiente; la compuerta `plan` se evalúa con `--evaluator cascade` y la aprobación es de la política por defecto o de una persona, no de este agente.
- Modo: harness completo, porque el arreglo toca cuatro flujos del motor (jornada, limpieza, code-review, worktrees), dos listas cerradas y la ayuda del CLI.
- Regla de la rama base: `ramaBaseDelProyecto(root)`, la misma de BUGFIX-ENGINE-WORKTREE-RAMA-BASE-20261014; sin clave nueva.
- Alcance: `packages/engine/src/integration-commit.ts`, `packages/engine/src/rama-base.ts` (solo el comentario), `packages/engine/src/limpieza.ts`, `packages/engine/src/limpieza-git.ts`, `packages/engine/src/code-review.ts`, `packages/engine/src/worktree-git.ts`, `packages/engine/src/worktree.ts`, `packages/engine/src/worktree-integrar.ts`, `packages/cli/src/main.ts` (ayuda) y la prueba nueva `tests/rama-base-restos.test.ts`. Exclusiones: ninguna prueba existente se edita; `packages/adapter` y `.valmen/config.yaml` no cambian; H6 queda fuera (D-003).
- Pasos ordenados:
  1. Pruebas primero, vistas en rojo antes de tocar el código: `tests/rama-base-restos.test.ts`, con repositorios git temporales sobre `dev` (`execution.base-branch: dev`, `main` ausente o atrasada) y el laboratorio `crearLaboratorio`/`procesoSimulado` de `tests/helpers/worktree-lab.ts`; cubre la jornada (`asegurarRamaDeTrabajo`), `vistaDeLimpieza`/`motivoDeGitDeLimpieza`, `runGate` de code-review con un cambio solo de pruebas (sin revisores), create e integrate sin la receta, la ayuda del CLI y un caso de regresión sobre `main` por sitio. Comando: `npx vitest run tests/rama-base-restos.test.ts` (C1–C3, C5–C8, C10, C12–C15, C17, C18).
  2. `packages/engine/src/integration-commit.ts`: `asegurarRamaDeTrabajo` resuelve la base con `ramaBaseDelProyecto(root)` y la usa en lugar de `RAMA_BASE` en `:188-237`, también en los mensajes; se borra la constante `RAMA_BASE` (`:165`), que queda sin consumidor; el comentario de `packages/engine/src/rama-base.ts:6-7` deja de decir que la jornada no la usa (C1, C2, C3, C4).
  3. `packages/engine/src/limpieza-git.ts`: `motivoDeGitDeLimpieza(argumentos, ramaBase = "main")` admite `merge-base --is-ancestor <ref> <ramaBase>` y rechaza `branch -d` de `main` o de la base; `ejecutarGitDeLimpieza` gana el parámetro opcional `ramaBase` (C8, C9).
  4. `packages/engine/src/limpieza.ts`: `vistaDeLimpieza` y `aplicarLimpieza` resuelven `ramaBaseDelProyecto(paths.root)`; `exigirMain` (`:175-188`) pasa a exigir la base y nombrarla; `clasificarWorktree` (`:211-220`) compara contra la base y la nombra en el motivo (C5, C6, C7, C9).
  5. `packages/engine/src/code-review.ts:280-284`: sin `--base`, la base es `ramaBaseDelProyecto(paths.root)`, o `HEAD` si esa rama no existe; una configuración inválida devuelve error con salida 3 antes de llamar a revisores (C10, C11).
  6. `packages/engine/src/worktree-git.ts`: `tieneRecetaDeCompilacion(root)` es verdadera si la raíz tiene `tsconfig.build.json` o `node_modules/@valmen` (D-001). `packages/engine/src/worktree.ts:300-344` clona `node_modules` y compila solo si el proyecto la tiene; si no, añade un aviso. `packages/engine/src/worktree-integrar.ts:329-340` recompila solo si la tiene. La lista de procesos `worktree-git.ts:195-196` no cambia (C12, C13, C14, C15).
  7. `packages/cli/src/main.ts:247` (ayuda de `cleanup`) y `:385` (`--base` de code-review) nombran la rama base del proyecto en vez de `main` (C17, C18).
  8. `npm run build` en el worktree y regresión sin editar pruebas existentes: `npx vitest run tests/rama-base-restos.test.ts tests/integracion-autonoma.test.ts` (C4); `npx vitest run tests/limpieza.test.ts tests/rama-base-restos.test.ts` (C9); `npx vitest run tests/code-review.test.ts tests/code-review-exigida.test.ts` (C11); `npx vitest run tests/worktree-integracion.test.ts tests/worktree-integrar.test.ts tests/worktree-git.test.ts tests/worktree-cli.test.ts tests/worktree-rama-base.test.ts tests/worktree-integrar-retirar.test.ts tests/worktree-registros.test.ts tests/entrega-tope.test.ts tests/limpieza.test.ts tests/integracion-autonoma.test.ts tests/reglas-integracion.test.ts tests/autonomous-run.test.ts` (C16); `npx tsc --build tsconfig.build.json` (C19). Si una prueba existente se pone en rojo, se detiene la implementación y se reporta en el ticket.
  9. Verificación funcional con el CLI del worktree sobre el repositorio temporal de la reproducción (`repro-restos` del scratchpad): `cleanup --json` desde `dev`, `journey worktree create` e `integrate` sin la receta salen con 0, y `gate code-review` con un cambio solo de pruebas muestra «Base: dev» sin llamar a revisores (C5, C10, C12, C14).
- Respuesta al diagnóstico:
  - H1 `packages/engine/src/integration-commit.ts:165` con `:188-237` (jornada desde `main`) → paso 2 → C1, C2, C3.
  - H2 `packages/engine/src/limpieza.ts:182-186` (checkout exigido en `main`) → paso 4 → C5, C7.
  - H2 `packages/engine/src/limpieza.ts:213`, `limpieza.ts:220` con `packages/engine/src/limpieza-git.ts:50,56` (integrado medido contra `main`) → pasos 3 y 4 → C6, C8.
  - H3 `packages/engine/src/code-review.ts:280-284` (base del diff fija en `main`) → paso 5 → C10.
  - H3 `packages/cli/src/main.ts:385` (ayuda de `--base`) → paso 7 → C18.
  - H4 `packages/engine/src/worktree.ts:300-304`, `worktree.ts:334-344` (receta del harness en create) → paso 6 → C12, C13, C15.
  - H5 `packages/engine/src/worktree-integrar.ts:329-340` (recompilación tras integrar) → paso 6 → C14.
  - Ayuda de `cleanup` (`packages/cli/src/main.ts:247`) → paso 7 → C17.
  - Riesgo de compatibilidad con los proyectos sobre `main` → pasos 2–5 y 8 → C4, C9, C11.
  - Riesgo de dejar de compilar en el harness (D-001, D-002) → pasos 6 y 8 → C15, C16.
  - H6 `packages/engine/src/worktree.ts:253-261,365` → fuera de alcance (D-003), sin paso; se propone aparte.
- Impactos declarados: ninguno; sin sincronización, sin migración y sin contenedores.
- Tamaño previsto: unas 330 líneas (unas 70 de producción y 260 de pruebas), 19 criterios.
- Si excede el tope: no excede el tope.
- Rollback (obligatorio): revertir el commit del ticket en la rama (`git revert <hash>`); no hay datos ni migraciones que deshacer.

## Criterios de aceptación

- [x] C1: con `execution.base-branch: dev` con `main` atrasada, la jornada crea su rama de trabajo en el commit de `dev`.
      <!-- test: npx vitest run tests/rama-base-restos.test.ts -->
- [x] C2: con `execution.base-branch: dev` sin rama `main`, la jornada deja su rama de trabajo al día con `dev` sin fallar.
      <!-- test: npx vitest run tests/rama-base-restos.test.ts -->
- [x] C3: con la base `dev`, una rama de trabajo que divergió de `dev` detiene la jornada con un mensaje que nombra `dev`.
      <!-- test: npx vitest run tests/rama-base-restos.test.ts -->
- [x] C4 (regresión): sin la clave, la jornada sigue creando su rama de trabajo desde `main`.
      <!-- test: npx vitest run tests/rama-base-restos.test.ts tests/integracion-autonoma.test.ts -->
- [x] C5: con la base `dev`, `valmen cleanup` corre con el checkout principal en `dev`.
      <!-- test: npx vitest run tests/rama-base-restos.test.ts -->
- [x] C6: con la base `dev` con `main` atrasada, `valmen cleanup` marca para quitar un worktree limpio ya integrado en `dev`.
      <!-- test: npx vitest run tests/rama-base-restos.test.ts -->
- [x] C7: con la base `dev`, `valmen cleanup` se niega desde otra rama con un mensaje que nombra `dev`.
      <!-- test: npx vitest run tests/rama-base-restos.test.ts -->
- [x] C8: la lista cerrada de git de la limpieza rechaza `branch -d` de la rama base declarada.
      <!-- test: npx vitest run tests/rama-base-restos.test.ts -->
- [x] C9 (regresión): sin la clave, `valmen cleanup` sigue operando contra `main`.
      <!-- test: npx vitest run tests/limpieza.test.ts tests/rama-base-restos.test.ts -->
- [x] C10: con la base `dev` con `main` atrasada, `gate code-review` sin `--base` toma `dev` como base del diff.
      <!-- test: npx vitest run tests/rama-base-restos.test.ts -->
- [x] C11 (regresión): sin la clave, `gate code-review` sin `--base` sigue tomando `main`, o `HEAD` cuando `main` no existe.
      <!-- test: npx vitest run tests/code-review.test.ts tests/code-review-exigida.test.ts -->
- [x] C12: en un proyecto sin `tsconfig.build.json` ni `node_modules/@valmen`, `journey worktree create` crea el worktree sin lanzar procesos de compilación.
      <!-- test: npx vitest run tests/rama-base-restos.test.ts -->
- [x] C13: en un proyecto sin la receta, la salida de `journey worktree create` avisa que no se compiló.
      <!-- test: npx vitest run tests/rama-base-restos.test.ts -->
- [x] C14: en un proyecto sin la receta, `journey worktree integrate` integra la rama con salida 0 sin recompilar.
      <!-- test: npx vitest run tests/rama-base-restos.test.ts -->
- [x] C15: con `tsconfig.build.json` en la raíz sin `node_modules`, `journey worktree create` sigue pidiendo instalar las dependencias.
      <!-- test: npx vitest run tests/rama-base-restos.test.ts -->
- [x] C16 (regresión): las pruebas existentes de la receta, de los worktrees, de la jornada, de la limpieza, de la integración pasan sin editarse.
      <!-- test: npx vitest run tests/worktree-integracion.test.ts tests/worktree-integrar.test.ts tests/worktree-git.test.ts tests/worktree-cli.test.ts tests/worktree-rama-base.test.ts tests/worktree-integrar-retirar.test.ts tests/worktree-registros.test.ts tests/entrega-tope.test.ts tests/limpieza.test.ts tests/integracion-autonoma.test.ts tests/reglas-integracion.test.ts tests/autonomous-run.test.ts -->
- [x] C17: la ayuda de `valmen cleanup` nombra la rama base del proyecto en vez de `main`.
      <!-- test: npx vitest run tests/rama-base-restos.test.ts -->
- [x] C18: la ayuda de `--base` de code-review nombra la rama base del proyecto en vez de `main`.
      <!-- test: npx vitest run tests/rama-base-restos.test.ts -->
- [x] C19: el monorepo compila con los cambios.
      <!-- test: npx tsc --build tsconfig.build.json -->

## Puntos

```json
[]
```

## Implementación

- Modo: harness completo (plan aprobado por el revisor, recibo `GR-20261014-BUGFIX-ENGINE-RAMA-BASE-RESTOS-20261014-plan-2`). D-002 aceptada tal como está; D-003 fuera.
- Prueba primero: `tests/rama-base-restos.test.ts` se vio en rojo antes de tocar el código (10 de 14 casos en rojo; los 4 verdes eran las regresiones sobre `main` y C15, que fija el comportamiento de hoy). Motivos del rojo: la jornada nacía de `main` o fallaba sin ella; `cleanup` se negaba desde `dev`; la lista de la limpieza no admitía `merge-base … dev`; code-review tomaba `main`, el diff subía a riesgo medio y llamó al revisor doble (que falla a propósito); create abortaba por `node_modules`; la ayuda decía `main`.
- Paso 2: `packages/engine/src/integration-commit.ts` — `asegurarRamaDeTrabajo` resuelve `ramaBaseDelProyecto(root)`; se borró la constante `RAMA_BASE`. Comentario de `packages/engine/src/rama-base.ts` al día.
- Paso 3: `packages/engine/src/limpieza-git.ts` — `motivoDeGitDeLimpieza(argumentos, ramaBase = "main")` mide `merge-base` contra la base y rechaza `branch -d` de `main` y de la base; `ejecutarGitDeLimpieza` gana `ramaBase` opcional.
- Paso 4: `packages/engine/src/limpieza.ts` — `exigirRamaBase` reemplaza a `exigirMain`; `clasificarWorktree` compara contra la base y la nombra en el motivo; `aplicarLimpieza` pasa la base al `branch -d`.
- Paso 5: `packages/engine/src/code-review.ts` — sin `--base`, la base es `ramaBaseDelProyecto`, o `HEAD` si no existe; una configuración inválida devuelve error con salida 3 antes de llamar a revisores.
- Paso 6: `packages/engine/src/worktree-git.ts` — `tieneRecetaDeCompilacion(root)` (`tsconfig.build.json` o `node_modules/@valmen`); `packages/engine/src/worktree.ts` clona y compila solo con la receta, si no deja un aviso; `packages/engine/src/worktree-integrar.ts` recompila solo con la receta. La lista de procesos no cambió.
- Paso 7: `packages/cli/src/main.ts` — la ayuda de `cleanup` y de `--base` nombra la rama base.
- Tamaño: 145 líneas añadidas y 82 borradas en producción, 294 de pruebas.
- Hallazgo fuera del plan (H7, no se tocó): `packages/cli/src/worktree.ts:68` imprime «Recompilado.» tras `integrate` aunque el proyecto no tenga la receta y no se recompile nada. Arreglarlo exige tocar un archivo fuera del alcance aprobado; se propone aparte junto con H6.
- Guardas de la implementación: ninguna prueba lanza procesos de compilación (el doble `procesoProhibido` falla si se intenta) ni llama a un modelo (el doble `revisorProhibido` falla si se llama); la compilación se corrió con el `tsc` local (`npm run build`, `npx --no-install tsc`).

## Pruebas

- Directorio de ejecución: la raíz del worktree `/Users/juanandrade/Desktop/ValmenHarness/.claude/worktrees/ticket-rama-base-restos` (o la del checkout principal tras integrar).
- Requisitos de ambiente: Node 24, dependencias instaladas (`node_modules/.bin/tsc` y `node_modules/.bin/vitest` locales), git. Sin red, sin claves y sin modelos.
- Comando 1: `npx vitest run tests/rama-base-restos.test.ts` → 1 archivo, 14 pruebas en verde (C1–C3, C5–C8, C10, C12–C15, C17, C18).
- Comando 2: `npx vitest run tests/rama-base-restos.test.ts tests/integracion-autonoma.test.ts` → verde (C4).
- Comando 3: `npx vitest run tests/limpieza.test.ts tests/rama-base-restos.test.ts` → verde (C9).
- Comando 4: `npx vitest run tests/code-review.test.ts tests/code-review-exigida.test.ts` → verde (C11).
- Comando 5: `npx vitest run tests/worktree-integracion.test.ts tests/worktree-integrar.test.ts tests/worktree-git.test.ts tests/worktree-cli.test.ts tests/worktree-rama-base.test.ts tests/worktree-integrar-retirar.test.ts tests/worktree-registros.test.ts tests/entrega-tope.test.ts tests/limpieza.test.ts tests/integracion-autonoma.test.ts tests/reglas-integracion.test.ts tests/autonomous-run.test.ts` → verde, ninguna prueba existente editada (C16).
- Comando 6: `npx --no-install tsc --build tsconfig.build.json` → sale con 0 (C19).
- Corrida de áreas (evidencia del agente): `npx --no-install vitest run tests/worktree-*.test.ts tests/jornada-*.test.ts tests/limpieza.test.ts tests/code-review*.test.ts tests/qa-*.test.ts tests/integracion-autonoma.test.ts tests/reglas-integracion.test.ts tests/autonomous-*.test.ts tests/entrega-tope.test.ts tests/rama-base-restos.test.ts tests/referencia-registro.test.ts` → 31 archivos, 532 pruebas en verde. Las pruebas que leen la ayuda (`tests/cli.test.ts`, `tests/cli-tabla-comandos.test.ts` y otras 13) más `tests/exports-sin-uso.test.ts` → 16 archivos, 352 pruebas en verde.
- Validación manual (escenario `dev`, hecha por el agente con el CLI del worktree en un repositorio temporal con `execution.base-branch: dev`, `main` atrasada y sin `node_modules`): `valmen cleanup` desde `dev` → 0; `journey worktree create` → 0 con el aviso «no se compiló el worktree ni se clonó node_modules»; `journey worktree integrate` → 0, integrada en `dev`; `journey worktree remove` → 0; code-review del dist con un revisor doble y un cambio solo de pruebas → «Base: dev», riesgo bajo, sin revisores, APPROVE; la jornada (`asegurarRamaDeTrabajo` del dist) con `main` atrasada o ausente deja `valmen/jornada` en el commit de `dev`. Para repetirla: armar un repositorio así y correr esos comandos con `node packages/cli/dist/main.js`; resultado esperado, los mismos códigos de salida.
- No hay validación en SaiOpenCloud: el ticket no la autoriza; la persona puede repetir el escenario allí si lo decide.

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
    "notes": null,
    "input_tokens": null,
    "output_tokens": null,
    "total_tokens": null,
    "estimated_cost_usd": null,
    "source": "manual:subagente opus de la corrida orquestada (análisis, plan e implementación); la sesión no expone sus números",
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
    "date": "2026-10-14",
    "at": "2026-10-14T17:26:32.547Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-14",
    "at": "2026-10-14T19:19:27.067Z",
    "action": "agent-decision",
    "actor": "cli",
    "details": "{\"id\":\"D-001\",\"pregunta\":\"¿Cómo sabe el motor que el proyecto tiene la receta de compilación del harness (clonar node_modules, npx tsc --build tsconfig.build.json, node scripts/copy-web.mjs)?\",\"eleccion\":\"La receta corre si la raíz del proyecto tiene tsconfig.build.json o node_modules/@valmen; si no tiene ninguno, create e integrate la saltan con un aviso y salen con 0\",\"alternativas\":[\"exigir tsconfig.build.json y scripts/copy-web.mjs (ejemplo del brief)\",\"nueva clave de configuración\",\"solo node_modules en la raíz\"],\"criterio\":\"Conservadora y sin clave nueva: el laboratorio de las pruebas existentes (tests/helpers/worktree-lab.ts:33-37) no tiene tsconfig.build.json ni copy-web y sí node_modules/@valmen, y sus casos C7, C8, C23 y C24 esperan la receta; exigir los dos archivos los pondría en rojo. El harness sin dependencias instaladas sigue pidiendo instalarlas por tsconfig.build.json. SaiOpenCloud no tiene ninguno de los dos y deja de correr npx tsc, que en la reproducción descargó un paquete tsc ajeno de npm.\",\"fuente\":\"tests/helpers/worktree-lab.ts:33; tests/worktree-integracion.test.ts:115; tests/worktree-integrar.test.ts:360; packages/engine/src/worktree.ts:300\",\"reversion\":\"Revertir el commit del ticket: la receta vuelve a correr siempre\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-14",
    "at": "2026-10-14T19:19:27.847Z",
    "action": "agent-decision",
    "actor": "cli",
    "details": "{\"id\":\"D-002\",\"pregunta\":\"¿Una recompilación que falla en un proyecto que sí tiene la receta debe dejar de hacer fallar create o integrate?\",\"eleccion\":\"No: se conserva el comportamiento de hoy (create deshace y sale con 3; integrate conserva la integración, lo dice y sale con 3); lo que deja de fallar es el proyecto sin la receta\",\"alternativas\":[\"convertir el fallo en aviso con salida 0 en create e integrate\"],\"criterio\":\"Las pruebas existentes fijan ese comportamiento (tests/worktree-integracion.test.ts:135 y tests/worktree-integrar.test.ts:376) y una prueba existente no se edita salvo que el plan aprobado lo cambie a propósito; el pedido del ticket pide no fallar cuando el proyecto no tiene la receta, que es lo que se arregla\",\"fuente\":\"tests/worktree-integracion.test.ts:135; tests/worktree-integrar.test.ts:376; tickets/2026/BUGFIX-ENGINE-RAMA-BASE-RESTOS-20261014/ticket.md (Solicitud original)\",\"reversion\":\"Ninguno: no cambia código; si el PO quiere salida 0, se abre un ticket que cambie esas dos pruebas a propósito\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-14",
    "at": "2026-10-14T19:19:28.257Z",
    "action": "agent-decision",
    "actor": "cli",
    "details": "{\"id\":\"D-003\",\"pregunta\":\"¿Entra en este ticket el mensaje falso «quedó a medias: no se pudo borrar la rama» que deja un create abortado?\",\"eleccion\":\"No: se registra como hallazgo fuera de alcance y se propone aparte\",\"alternativas\":[\"arreglarlo aquí reseteando ramaCreada y reservada en deshacer\"],\"criterio\":\"Es otro defecto (deshacer corre dos veces: packages/engine/src/worktree.ts:261 no resetea ramaCreada y worktree.ts:365 vuelve a llamarlo), no un resto de main fijo ni de la receta; con la receta condicionada SaiOpenCloud deja de pasar por ese camino\",\"fuente\":\"packages/engine/src/worktree.ts:253; packages/engine/src/worktree.ts:365\",\"reversion\":\"Ninguno: no cambia código\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-14",
    "at": "2026-10-14T19:21:15.267Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-14",
    "at": "2026-10-14T19:22:18.609Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-14",
    "at": "2026-10-14T19:31:36.318Z",
    "action": "plan-approved",
    "actor": "cli",
    "details": "{\"actor\":\"revisor claude-code/claude-sonnet-5-5 (autorización POLITICA-POR-DEFECTO)\",\"source\":\"revisor\",\"quote\":\"El plan respalda las tres proposiciones. Cubre C15 con una prueba y un paso concretos. Mapea cada hallazgo del diagnóstico a un paso y a criterios, y deja H6 fuera de forma explícita. Protege la compatibilidad con criterios de regresión y con la ejecución de pruebas existentes sin editarlas.\",\"planHash\":\"sha256:6bfea76d90b73652a1b9f58c2ae0708a13c4566a39e58f32a2cd54f32561949e\",\"authorizationId\":\"POLITICA-POR-DEFECTO\",\"authorizationHash\":\"sha256:c1bb46dd45f48a215d91a242f445eab06b4ac6f78aa546bf15d8b85902a01a0a\",\"reviewerModel\":\"claude-sonnet-5-5\",\"stage\":\"plan\",\"receiptId\":\"GR-20261014-BUGFIX-ENGINE-RAMA-BASE-RESTOS-20261014-plan-2\",\"receiptStateHash\":\"sha256:0619b96d336768b81ec4652c3c663de5707c0168b00016cc0a7d8afb99c2095f\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-10-14",
    "at": "2026-10-14T19:31:43.174Z",
    "action": "plan-approval-verified",
    "actor": "cli",
    "details": "Aprobación del plan vigente: revisor claude-code/claude-sonnet-5-5 (autorización POLITICA-POR-DEFECTO) (fuente revisor, hash sha256:c1bb46dd45f48a215d91a242f445eab06b4ac6f78aa546bf15d8b85902a01a0a), plan sha256:6bfea76d90b73652a1b9f58c2ae0708a13c4566a39e58f32a2cd54f32561949e."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-10-14",
    "at": "2026-10-14T19:31:43.174Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-10-14",
    "at": "2026-10-14T19:32:07.667Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-10-14",
    "at": "2026-10-14T19:51:57.308Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-10-14",
    "at": "2026-10-14T19:52:01.400Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  }
]
```
