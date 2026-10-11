---
schema_version: 2
id: CHORE-CORE-LISTA-DENEGADOS-20261010
title: Lista única de rutas y comandos denegados en core
type: CHORE
module: CORE
workflow_status: awaiting_user_tests
qa_status: pending
release_status: unreleased
user_visible: false
sync_impact: false
migration_impact: false
docker_impact: false
risk_level: normal
created: 2026-10-10
updated: 2026-10-10
related_ticket: null
target_release: null
released_in: null
---

# CHORE-CORE-LISTA-DENEGADOS-20261010

## Solicitud original

Parte del sprint: Los permisos de los agentes niegan lo que nunca se automatiza, desde una sola lista proyectada por valmen sync.
- R-PER-001: `valmen sync` DEBE escribir en `.claude/settings.json` las reglas de denegación del harness
Viene de una feature descompuesta en sprints; su plan completo está en el tickets.yaml de la feature.

Comportamiento esperado: `valmen sync` DEBE escribir en `.claude/settings.json` las reglas de denegación del harness
Comportamiento actual: la spec no lo declara; se establece en el análisis, leyendo el código.

### Fuera de alcance

Lo que el grafo asignó a otros tickets y este no hace:
- R-PER-001: lo cubre SECURITY-CLI-PROYECCION-DENEGADOS-20261010 (Sync proyecta denegaciones a settings.json de Claude Code)

### Supuestos y decisiones pendientes

<!-- Si el pedido nombra algo que el código no tiene —parámetro, permiso,
campo, bandera, columna, migración— y no lo especifica, listá cada elemento
con su pregunta antes de avanzar a análisis; el análisis no planifica sobre
la adivinanza. Si no hay ninguno, escribí «Ninguno» y seguí. -->
Ninguno.

## Descripción funcional

- Alcance: mover a `@valmen/core` la parte de R-PER-001 que es «una sola lista en código, la misma que usa el motor» (decisión D5 de `.valmen/features/guardas-verificacion-harness/design.md:47-53`): las rutas sensibles de credenciales y las banderas de git que ninguna lista cerrada del motor admite. El motor pasa a leerlas de core en vez de declararlas en cada módulo. Exclusiones: no se proyecta nada a `.claude/settings.json`, Codex ni OpenCode (eso es de SECURITY-CLI-PROYECCION-DENEGADOS-20261010 y SECURITY-ADAPTER-DENEGADOS-CODEX-OPENCODE-20261010); no se amplía ni se reduce lo que el motor admite o rechaza.
- Usuario o rol afectado: nadie lo ve en la ejecución. Lo nota quien mantiene el harness: un cambio en lo prohibido se hace en un solo archivo de core; y el ticket SECURITY siguiente, cuyo adaptador (`@valmen/adapter`) depende solo de core (`packages/adapter/package.json`, `dependencies`) y no puede leer listas que viven en el motor (el motor depende del adaptador: `packages/engine/package.json`, `dependencies`).
- Comportamiento actual: lo prohibido está repartido en el motor, en cinco declaraciones distintas: un juego de rutas y cuatro juegos de banderas de git que no coinciden entre sí. Core no tiene ninguna lista de lo denegado (`packages/core/src/index.ts:9-28`).
- Comportamiento esperado: core exporta la lista de rutas sensibles y la de banderas de git denegadas; `integration-rules.ts`, `qa-agent-git.ts`, `worktree-git.ts` y `worktree-integracion-git.ts` las leen de ahí; cada función del motor devuelve exactamente lo mismo que hoy para cada entrada (mismo veredicto y mismo mensaje).

## Diagnóstico

- Causa comprobada (con `ruta:línea`): no hay un defecto; hay duplicación medida en el código. (1) Rutas: `packages/engine/src/integration-rules.ts:34-43` (`PROHIBIDOS`) mezcla cuatro patrones de credenciales (`:36` `.env`, `:37` `.credentials`, `:38` `id_rsa`/`id_ed25519` con `.pub`, `:39` `.pem`/`.key`/`.p12`) con tres rutas de configuración del harness (`:40` `.valmen/config.yaml`, `:41` `.valmen/routing.yaml`, `:42` `.valmen/delegations/`); la lee solo `motivoDeArchivoProhibido` (`:46-54`). (2) Banderas, cuatro listas con contenido distinto: `integration-rules.ts:100` (`BANDERAS_PROHIBIDAS`: `--force`, `-f`, `--force-with-lease`, `--hard`, `--no-verify`, `--amend`), leída en `motivoDeGitProhibido` `:109-110`; `qa-agent-git.ts:21` (literal en línea: `--force`, `-f`, `--hard`, `--no-verify`, `--amend`, con la excepción `worktree --force`); `worktree-git.ts:24` (`BANDERAS_DE_FUERZA`: `--force`, `-f`, `-D`, `--hard`, `--no-verify`, `--amend`), leída en `:52-53`; y `worktree-integracion-git.ts:21`, copia literal de la anterior, leída en `:29-30` (esta cuarta no la nombra el pedido; apareció al buscar los literales `"--no-verify"` y `"--amend"` en `packages/*/src`, que solo están en esas cuatro líneas). La parte común a las cuatro es `--force`, `-f`, `--hard`, `--no-verify`, `--amend`; `--force-with-lease` solo está en la de jornadas y `-D` solo en las de worktree. (3) Las operaciones prohibidas (`push`, `fetch`, `pull`, `reset`, `rebase`, `clean`, `tag`, `remote`) no son una lista: las rechaza el caso por defecto de cada lista cerrada de permitidas (`integration-rules.ts:87-97` y `:106-108`, `qa-agent-git.ts:23-36`, `worktree-git.ts:54-80`, `worktree-integracion-git.ts:31-63`).
- Comprobado que unificar más allá de la parte común cambia veredictos: si `-D` entrara en la lista de `qa-agent`, `["worktree","add","--detach","-D","abc1234"]`, hoy admitida por `qa-agent-git.ts:25` (cuatro argumentos tras `worktree`), pasaría a rechazarse; y si `--force-with-lease` entrara en las de worktree, las entradas que hoy rechaza el `switch` con su mensaje de forma pasarían a rechazarse con el de bandera. Por eso core lleva la intersección y cada módulo conserva su extra.
- Comprobado que la guarda de exportaciones cuenta como consumida una exportación de core que el motor importa por `@valmen/core`: `BLOCKING_POINT_STATES` y `EXIT_INVARIANT` de core, que el motor importa así (`qa-eligibility.ts:11`, `integration-rules.ts:11`), no están en `scripts/exports-sin-uso.linea-base.json` (la única entrada `EXIT_INVARIANT` es `packages/engine/src/simulate.ts#EXIT_INVARIANT`, `:340`); la guarda cuenta importaciones desde otro módulo, pruebas y guiones (`scripts/exports-sin-uso.mjs:9-15`, `knip.json` con `includeEntryExports`).
- Hipótesis pendientes: H1, que `knip` trate igual dos exportaciones nuevas que llegan al índice de core por `export *` (`packages/core/src/index.ts:9-28`) y que consumen cuatro módulos del motor; lo respalda el punto anterior y se confirma en la implementación con `node scripts/exports-sin-uso.mjs` tras `npm run build`. Si fallara, el ticket se detiene: no se agrega la entrada a la línea base. Ninguna otra.
- Memoria consultada (`valmen memory search`): sin un caso previo de esta lista. Aplica AP-002 (`.valmen/memory/aprendizajes.md:13`): dentro de `packages/core/src` se importa por ruta relativa, nunca el índice del propio paquete; el módulo nuevo no importa nada. Aplica AP-010 (`.valmen/memory/aprendizajes.md:84`): por eso se listan abajo también los archivos nuevos que el plan crea.
- Consumidores afectados: de las rutas, `reglasDeIntegracion` (`integration-rules.ts:74-77`), que usa `integration-commit.ts:242` antes de cada commit de una jornada, y `worktree-integrar.ts:85`, que rechaza integrar una rama con archivos prohibidos. De las banderas: `ejecutarGitPermitido` (`integration-rules.ts:146-154`) en `integration-commit.ts:61`, `:76`, `:147`, `:261`, `:267`, `:270` y `qa-eligibility.ts:45`; `ejecutarGitDeQaAgent` (`qa-agent-git.ts:45-53`) en `qa-agent.ts:83` y `qa-policy-close.ts:38`; `ejecutarGitDeWorktree` (`worktree-git.ts:93-101`) en `worktree.ts:73-264`; `motivoDeGitDeIntegracion` (`worktree-integracion-git.ts:26-64`) en `ejecutarGitDeIntegracion` (`:72-80`). Pruebas que hoy fijan parte del comportamiento: `tests/reglas-integracion.test.ts:86-91` y `:124-142`, `tests/qa-agent.test.ts:263`, `tests/worktree-git.test.ts:54-91`, `tests/worktree-integracion.test.ts:261`, `tests/worktree-integrar.test.ts:305-329` y `tests/elegibilidad-qa.test.ts`; corridas hoy en este worktree: 6 archivos, 174 pruebas, todas en verde. Ninguna fija los mensajes exactos ni todos los patrones de credenciales (`.credentials`, `id_rsa`, `.pem`, `.p12` no aparecen), así que no bastan para demostrar que nada cambió.
- Fuera de la lista, con motivo: `qa-eligibility.ts:26-33` (`CATEGORIAS_DE_RUTA`) no es una lista de denegación sino las categorías de riesgo que hacen inelegible un ticket para QA por agente (`rutaProhibidaParaQaAgente`, `:36-41`, usada en `:160`); no la nombra D5 y fundirla cambiaría la elegibilidad. Tampoco entran las tres rutas de configuración del harness (`integration-rules.ts:40-42`): no se commitean, pero un agente tiene que poder leerlas, así que no son rutas sensibles que R-PER-001 niega leer; se quedan en el motor. `~/.ssh/**`, las formas `git tag -d` y `git push --delete` y la sintaxis de reglas de Claude Code no tienen consumidor en el motor (las rutas absolutas ya se rechazan como «fuera del proyecto», `integration-rules.ts:47-49`): las agrega a esta misma lista de core el ticket SECURITY de la proyección, junto con su consumidor.
- Archivos y flujo investigados: los citados, más `.valmen/features/guardas-verificacion-harness/spec/s5-permisos/spec.md:18-30` (R-PER-001), `.valmen/features/guardas-verificacion-harness/design.md:47-53` (D5), `.valmen/features/guardas-verificacion-harness/tickets.yaml:49-59` y `:134-137` (este ticket cubre R-PER-001 junto con SECURITY-CLI-PROYECCION-DENEGADOS-20261010), `packages/adapter/src/claude-code.ts:26` y `:57-78` (el futuro consumidor: hoy solo fusiona `outputStyle`; no se toca), `vitest.config.ts:62-72` (las pruebas resuelven `@valmen/*` a `src`) y `.valmen/config.yaml` (`test-commands`: `npx vitest run`, `npx tsc`, `node`). Archivos que el plan tocará: `packages/core/src/index.ts`, `packages/engine/src/integration-rules.ts`, `packages/engine/src/qa-agent-git.ts`, `packages/engine/src/worktree-git.ts` y `packages/engine/src/worktree-integracion-git.ts`; además crea dos archivos que hoy no existen, un módulo de core para las listas y un archivo de prueba en `tests/`, cuyos nombres fija el plan.
- Riesgos y compatibilidad: (1) Cambiar sin querer lo que admiten las listas cerradas de la ejecución autónoma, que es autoridad del agente: se mitiga con la intersección y una prueba de caracterización escrita y corrida antes del cambio, con el valor exacto que hoy devuelven las cinco funciones. (2) Compartir objetos `RegExp` entre módulos: con la bandera `g` o `y`, `test` guarda estado en `lastIndex` y daría resultados alternos; los cuatro patrones de `:36-39` no llevan banderas, y una prueba lo fija. (3) Mutar la lista compartida desde un módulo cambiaría a los demás: se congela con `Object.freeze` y una prueba lo fija. (4) Ciclo de imports en core (AP-002): el módulo nuevo no importa nada. (5) Guarda de exportaciones: cada exportación nueva la consume el motor en este mismo ticket, sin tocar la línea base. (6) El binario `valmen` corre el `dist`: sin `npm run build` el CLI seguiría con las listas viejas, que son idénticas, así que no hay ventana de comportamiento distinto. (7) Clasificación: es CHORE, pero toca las listas que acotan el git de las jornadas, de `qa-agent` y de los worktrees; no cambia su contenido, y la aprobación del plan queda en una persona o una autorización vigente que creó una persona. Compatibilidad: ninguna firma pública del motor cambia; core solo suma dos exportaciones.
- Impactos de sync, migración, Docker o despliegue: ninguno. Es un movimiento de código entre paquetes del monorepo; no hay datos, esquema, contenedores ni publicación.

## Plan

- Gate de plan y aprobación: pendiente. Tras la compuerta `plan` con el evaluador cascade, decide una persona, o una autorización de aprobación vigente que creó una persona; el agente que escribió el plan no registra la aprobación.
- Alcance: un módulo nuevo de core con dos listas congeladas —`SENSITIVE_PATH_PATTERNS` (los cuatro patrones de credenciales de `packages/engine/src/integration-rules.ts:36-39`) y `DENIED_GIT_FLAGS` (las cinco banderas comunes a las cuatro listas de banderas del motor)—, su reexportación desde `packages/core/src/index.ts`, la lectura de esas listas desde los cuatro módulos de git del motor y una prueba nueva que fija el comportamiento anterior y la forma de la lista. Exclusiones: no se proyecta nada a los agentes ni se toca `packages/adapter/src/claude-code.ts`; no se agregan `~/.ssh/**`, `git tag -d`, `git push --delete` ni la sintaxis de reglas de Claude Code (los suma a este mismo módulo SECURITY-CLI-PROYECCION-DENEGADOS-20261010, con su consumidor); no se toca `packages/engine/src/qa-eligibility.ts:26-33`; no cambia ninguna operación ni bandera que el motor admite o rechaza.
- Quién consume cada exportación nueva (para que la guarda `npm run exports:check` no la marque sin consumidor): `SENSITIVE_PATH_PATTERNS` la lee `integration-rules.ts` (`PROHIBIDOS`); `DENIED_GIT_FLAGS` la leen `integration-rules.ts`, `qa-agent-git.ts`, `worktree-git.ts` y `worktree-integracion-git.ts`. Las dos las importa además la prueba nueva. Ninguna entrada se agrega a `scripts/exports-sin-uso.linea-base.json`.
- Decisiones que la persona puede cambiar al aprobar: D-a, core lleva la intersección de las banderas y cada módulo conserva su extra (`--force-with-lease` en jornadas, `-D` en worktrees), porque sumarlas a todas cambia veredictos (ver Diagnóstico). D-b, las tres rutas de configuración del harness (`integration-rules.ts:40-42`) se quedan en el motor: no se commitean, pero un agente debe poder leerlas. D-c, los nombres siguen la convención en inglés de core: archivo `packages/core/src/denied.ts`, exportaciones `SENSITIVE_PATH_PATTERNS` y `DENIED_GIT_FLAGS`.
- Pasos ordenados:
  1. Caracterización primero, sin tocar `packages/`: crear `tests/lista-denegados.test.ts` con un bloque «el motor no cambia». (a) Una tabla de rutas para `motivoDeArchivoProhibido` (`integration-rules.ts:46-54`): un positivo por cada patrón de `:36-42` (`.env`, `.env.local`, `app/.env.production`, `.credentials`, `.credentials.json`, `id_rsa`, `id_rsa.pub`, `keys/id_ed25519`, `cert.pem`, `x.key`, `a.p12`, `.valmen/config.yaml`, `.valmen/routing.yaml`, `.valmen/delegations/d.json`), los que pasan (`.envrc`, `src/ok.ts`, `keyboard.ts`, `docs/key.md`) y los de fuera del proyecto (`/etc/passwd`, `../x`). (b) Una tabla de invocaciones de git con cada una de las siete banderas que hoy usa el motor (`--force`, `-f`, `--force-with-lease`, `--hard`, `--no-verify`, `--amend`, `-D`) sobre una operación que cada lista admite, más las formas límite (`["worktree","remove","--force",<carpeta>]` y `["worktree","add","--detach","-D","abc1234"]` para qa-agent, `["commit","-m","-f"]` para jornadas), evaluada con `motivoDeGitProhibido` (`integration-rules.ts:103-130`), `motivoDeGitDeQaAgent` (`qa-agent-git.ts:18-37`), `motivoDeGitDeWorktree` (`worktree-git.ts:49-81`) y `motivoDeGitDeIntegracion` (`worktree-integracion-git.ts:26-64`). Cada fila lleva como literal el valor exacto que la función devuelve hoy (el texto del motivo o `null`). Correr `npx vitest run tests/lista-denegados.test.ts` sobre el árbol sin cambios y anotar en `## Implementación` que pasa entero. (C7, C8, C9, C10, C11, C19)
  2. Crear `packages/core/src/denied.ts`: `export const SENSITIVE_PATH_PATTERNS: readonly RegExp[] = Object.freeze([...])` con los cuatro patrones copiados de `integration-rules.ts:36-39` sin cambiar un carácter, y `export const DENIED_GIT_FLAGS: readonly string[] = Object.freeze(["--force", "-f", "--hard", "--no-verify", "--amend"])`; comentario de cabecera que la presenta como la lista única de D5, dice que el motor la lee y que la proyección a los agentes la suma SECURITY-CLI-PROYECCION-DENEGADOS-20261010. Sin ningún `import` (core sin red ni disco; AP-002). Agregar `export * from "./denied.js";` a `packages/core/src/index.ts`, junto a `./permissions.js` (`:19`). (C1, C2, C3, C4, C5, C6)
  3. `packages/engine/src/integration-rules.ts`: sumar `SENSITIVE_PATH_PATTERNS` y `DENIED_GIT_FLAGS` al import de `@valmen/core` de `:11`; `PROHIBIDOS` (`:35-43`) pasa a `[...SENSITIVE_PATH_PATTERNS, /^\.valmen\/config\.yaml$/, /^\.valmen\/routing\.yaml$/, /^\.valmen\/delegations\//]`; `BANDERAS_PROHIBIDAS` (`:100`) pasa a `new Set([...DENIED_GIT_FLAGS, "--force-with-lease"])`. `motivoDeArchivoProhibido`, `motivoDeGitProhibido` y sus mensajes no cambian. (C7, C8, C12, C13)
  4. `packages/engine/src/qa-agent-git.ts:21`: reemplazar el arreglo literal por `DENIED_GIT_FLAGS.includes(a)`, conservando la excepción `!(operacion === "worktree" && a === "--force")`; sumar `DENIED_GIT_FLAGS` al import de `@valmen/core` de `:10`. (C9, C13)
  5. `packages/engine/src/worktree-git.ts:24` y `packages/engine/src/worktree-integracion-git.ts:21`: `const BANDERAS_DE_FUERZA = [...DENIED_GIT_FLAGS, "-D"];` en los dos, con `DENIED_GIT_FLAGS` en el import de `@valmen/core` (`worktree-git.ts:16`, `worktree-integracion-git.ts:13`). (C10, C11, C13)
  6. Completar `tests/lista-denegados.test.ts` con un bloque «la lista de core», importando desde `packages/core/src/index.js`: compara `SENSITIVE_PATH_PATTERNS.map((p) => p.source)` con los cuatro textos de origen (C1); compara `DENIED_GIT_FLAGS` con las cinco banderas (C2); `Object.isFrozen` de cada lista (C3, C4); `flags === ""` en cada patrón (C5); lee `packages/core/src/denied.ts` y comprueba que no contiene `import` ni `require` (C6); recorre los `.ts` de `packages/engine/src` y comprueba que ninguno contiene el `source` de un patrón de core (C12) ni los literales `"--hard"`, `"--no-verify"` o `"--amend"`, que hoy solo están en `integration-rules.ts:100`, `qa-agent-git.ts:21`, `worktree-git.ts:24` y `worktree-integracion-git.ts:21` (C13). `--force` y `-f` quedan fuera de esta comprobación porque el motor los usa en otras formas admitidas (`qa-agent-git.ts:21` y `:26`, `qa-agent.ts`).
  7. Verificar: `npx vitest run tests/lista-denegados.test.ts` en verde (C1-C13); `npx vitest run tests/reglas-integracion.test.ts tests/qa-agent.test.ts tests/worktree-git.test.ts tests/worktree-integracion.test.ts tests/worktree-integrar.test.ts tests/elegibilidad-qa.test.ts` con las 174 pruebas de hoy en verde (C14); `npm run build` y `npx tsc --noEmit -p tsconfig.json` sin salida (C17); `node scripts/exports-sin-uso.mjs` con salida 0 (C15); `git diff --exit-code scripts/exports-sin-uso.linea-base.json` sin diferencias (C16); `npx eslint packages/core/src/denied.ts packages/core/src/index.ts packages/engine/src/integration-rules.ts packages/engine/src/qa-agent-git.ts packages/engine/src/worktree-git.ts packages/engine/src/worktree-integracion-git.ts tests/lista-denegados.test.ts` sin errores (C18). Si la guarda de exportaciones falla (H1 del diagnóstico), se detiene y se reporta: la línea base no se toca.
  8. Entrega: `## Pruebas` con el contrato (comandos, directorio del worktree, resultado esperado, validación manual y ambiente: Node 24, sin red), `- [x]` en lo verificado, `valmen secrets`, consumo de IA y paso a `awaiting_user_tests`. Sin commit hasta la confirmación de las pruebas. (C16, C18, C19)
- Dependencias: ninguna (`depends_on: []` en `.valmen/features/guardas-verificacion-harness/tickets.yaml:49-51`). De este ticket dependen SECURITY-CLI-PROYECCION-DENEGADOS-20261010 y, tras él, SECURITY-ADAPTER-DENEGADOS-CODEX-OPENCODE-20261010.
- Compatibilidad: ninguna firma ni exportación del motor cambia; core solo suma dos exportaciones; el `dist` que corre el binario `valmen` se reconstruye en el paso 7 y, mientras tanto, las listas viejas son idénticas.
- Impactos declarados: ninguno de sincronización, migración ni contenedores; tampoco de despliegue.
- Rollback (obligatorio): `git revert <sha>` del commit del ticket restaura las cuatro listas locales del motor y quita el módulo de core, su reexportación y la prueba; después `npm run build`. No hay datos ni registro que restaurar. Si SECURITY-CLI-PROYECCION-DENEGADOS-20261010 ya integró y lee la lista de core, se revierte primero ese ticket.

<!-- Los criterios de la sección siguiente se numeran C1…Cn, con una afirmación verificable por criterio
     —una frase con «y» son dos criterios—, y cada uno lleva debajo su anotación de
     verificación: un comentario HTML que dice «test:» y el comando, o «verify: manual». La
     sección no lleva comentarios dentro: un comentario con anotación se leería como la de un
     criterio. Ejemplo en la skill planificacion. -->
## Criterios de aceptación

- [x] C1. (R-PER-001) `SENSITIVE_PATH_PATTERNS` de `@valmen/core` contiene los cuatro patrones de credenciales de `integration-rules.ts:36-39` con el mismo texto
      <!-- test: npx vitest run tests/lista-denegados.test.ts -->
- [x] C2. (R-PER-001) `DENIED_GIT_FLAGS` de `@valmen/core` es la intersección de las cuatro listas de banderas del motor, cinco banderas
      <!-- test: npx vitest run tests/lista-denegados.test.ts -->
- [x] C3. `SENSITIVE_PATH_PATTERNS` está congelada
      <!-- test: npx vitest run tests/lista-denegados.test.ts -->
- [x] C4. `DENIED_GIT_FLAGS` está congelada
      <!-- test: npx vitest run tests/lista-denegados.test.ts -->
- [x] C5. Ningún patrón de `SENSITIVE_PATH_PATTERNS` lleva banderas de expresión regular
      <!-- test: npx vitest run tests/lista-denegados.test.ts -->
- [x] C6. El módulo de core con las listas no importa ningún otro módulo
      <!-- test: npx vitest run tests/lista-denegados.test.ts -->
- [x] C7. (R-PER-001) `motivoDeArchivoProhibido` devuelve para cada ruta de la tabla de caracterización el valor que devolvía antes del cambio
      <!-- test: npx vitest run tests/lista-denegados.test.ts -->
- [x] C8. `motivoDeGitProhibido` devuelve para cada invocación de la tabla de caracterización el valor que devolvía antes del cambio
      <!-- test: npx vitest run tests/lista-denegados.test.ts -->
- [x] C9. `motivoDeGitDeQaAgent` devuelve para cada invocación de la tabla de caracterización el valor que devolvía antes del cambio
      <!-- test: npx vitest run tests/lista-denegados.test.ts -->
- [x] C10. `motivoDeGitDeWorktree` devuelve para cada invocación de la tabla de caracterización el valor que devolvía antes del cambio
      <!-- test: npx vitest run tests/lista-denegados.test.ts -->
- [x] C11. `motivoDeGitDeIntegracion` devuelve para cada invocación de la tabla de caracterización el valor que devolvía antes del cambio
      <!-- test: npx vitest run tests/lista-denegados.test.ts -->
- [x] C12. (R-PER-001) Ningún archivo de `packages/engine/src` repite el texto de un patrón de `SENSITIVE_PATH_PATTERNS`
      <!-- test: npx vitest run tests/lista-denegados.test.ts -->
- [x] C13. Ningún archivo de `packages/engine/src` declara por su cuenta las banderas de git que solo usan las listas de denegación
      <!-- test: npx vitest run tests/lista-denegados.test.ts -->
- [x] C14. Las seis pruebas existentes de las listas cerradas del motor siguen en verde
      <!-- test: npx vitest run tests/reglas-integracion.test.ts tests/qa-agent.test.ts tests/worktree-git.test.ts tests/worktree-integracion.test.ts tests/worktree-integrar.test.ts tests/elegibilidad-qa.test.ts -->
- [x] C15. La guarda de exportaciones sin consumidor sale con 0
      <!-- test: node scripts/exports-sin-uso.mjs -->
- [x] C16. La línea base `scripts/exports-sin-uso.linea-base.json` queda sin cambios
      <!-- verify: manual -->
- [x] C17. La comprobación de tipos del repositorio no produce salida
      <!-- test: npx tsc --noEmit -p tsconfig.json -->
- [x] C18. El lint de los archivos tocados termina sin errores
      <!-- verify: manual -->
- [x] C19. La prueba de caracterización pasa sobre el árbol sin cambios, antes de tocar `packages/`
      <!-- verify: manual -->

## Puntos

```json
[]
```

## Implementación

Hecho en el worktree `.claude/worktrees/ticket-lista-denegados` (rama `valmen/ticket-lista-denegados`), siguiendo `## Plan`.

- Paso 1, caracterización antes del cambio: `tests/lista-denegados.test.ts` con el bloque «el motor no cambia» (62 filas: 20 rutas y 42 invocaciones de git, cada una con el valor exacto que devuelve hoy). Corrida sobre el árbol sin cambios en `packages/`: `npx vitest run tests/lista-denegados.test.ts`, 62 de 62 en verde (C19). Tras el cambio se volvió a correr sobre el motor anterior (los cuatro archivos revertidos un momento) y siguió en verde, 62 de 62.
- Pruebas nuevas antes del código: el bloque «la lista de core» (8 pruebas) se agregó antes de crear el módulo y se observó en rojo, 8 de 8 fallaban (`SENSITIVE_PATH_PATTERNS` y `DENIED_GIT_FLAGS` indefinidas, `denied.ts` inexistente). Orden distinto al del plan (que lo ponía en el paso 6, tras el código) para cumplir EST-010: toda prueba nueva se observa en rojo antes del código que cubre. C3 y C4 salieron verdes en esa primera corrida porque `Object.isFrozen(undefined)` es verdadero; se endurecieron con `Array.isArray` y entonces fallaron como debían.
- Pasos 2 a 5: `packages/core/src/denied.ts` (nuevo, sin ningún import) con `SENSITIVE_PATH_PATTERNS` y `DENIED_GIT_FLAGS` congeladas, reexportado desde `packages/core/src/index.ts`; el motor las lee en `integration-rules.ts` (`PROHIBIDOS` y `BANDERAS_PROHIBIDAS`), `qa-agent-git.ts`, `worktree-git.ts` y `worktree-integracion-git.ts`. Cada módulo conserva su extra (`--force-with-lease` en jornadas, `-D` en worktrees). Ningún mensaje ni firma cambia.
- Desviación de la prueba de qa-agent: el plan evalúa esa lista con `motivoDeGitDeQaAgent`, pero ese símbolo está en `scripts/exports-sin-uso.linea-base.json` y al importarlo desde la prueba la guarda `npm run exports:check` falló pidiendo quitar su entrada (la guarda cuenta una prueba como consumidor y una entrada de la línea base que gana consumidor es un fallo). C16 exige la línea base sin cambios, así que la prueba observa la lista por `ejecutarGitDeQaAgent` con un ejecutor falso: rechaza con el mismo motivo y lo consume el motor. Las 11 filas de qa-agent pasan igual sobre el motor anterior. Quitar la entrada `motivoDeGitDeQaAgent` de la línea base es una decisión aparte, de otro ticket.
- Paso 7, verificación: las 7 pruebas (70 del ticket más 174 existentes) en verde, 244 de 244; `npm run build`, `npx tsc --noEmit -p tsconfig.json` y `npx eslint` sobre los siete archivos tocados sin salida; `node scripts/exports-sin-uso.mjs` con salida 0 (línea base de 443 entradas) y `git diff --exit-code scripts/exports-sin-uso.linea-base.json` sin diferencias. H1 del diagnóstico se confirmó: la guarda trata igual las dos exportaciones nuevas.
- Archivos: `packages/core/src/denied.ts` (nuevo), `packages/core/src/index.ts`, `packages/engine/src/integration-rules.ts`, `packages/engine/src/qa-agent-git.ts`, `packages/engine/src/worktree-git.ts`, `packages/engine/src/worktree-integracion-git.ts`, `tests/lista-denegados.test.ts` (nuevo) y este ticket.

## Pruebas

Contrato de entrega para el responsable.

- Directorio: `/Users/juanandrade/Desktop/ValmenHarness/.claude/worktrees/ticket-lista-denegados` (rama `valmen/ticket-lista-denegados`), o la raíz del repositorio con la rama integrada.
- Ambiente: Node 24 y `npm install` hecho; sin red, sin servicios ni datos. No hay validación manual ni de interfaz: es un movimiento de código entre paquetes.
- Comandos y resultado esperado:
  1. `npx vitest run tests/lista-denegados.test.ts` → 1 archivo y 70 pruebas en verde: 62 de «el motor no cambia» (C7 a C11) y 8 de «la lista de core» (C1 a C6, C12, C13).
  2. `npx vitest run tests/reglas-integracion.test.ts tests/qa-agent.test.ts tests/worktree-git.test.ts tests/worktree-integracion.test.ts tests/worktree-integrar.test.ts tests/elegibilidad-qa.test.ts` → 6 archivos y 174 pruebas en verde (C14).
  3. `npm run build` y `npx tsc --noEmit -p tsconfig.json` → sin errores ni salida (C17).
  4. `node scripts/exports-sin-uso.mjs` → «Sin exportaciones nuevas sin consumidor; la línea base tiene 443 entradas», salida 0 (C15). Requiere el paso 3 hecho.
  5. `git diff --exit-code scripts/exports-sin-uso.linea-base.json` → salida 0, sin diferencias (C16).
  6. `npx eslint packages/core/src/denied.ts packages/core/src/index.ts packages/engine/src/integration-rules.ts packages/engine/src/qa-agent-git.ts packages/engine/src/worktree-git.ts packages/engine/src/worktree-integracion-git.ts tests/lista-denegados.test.ts` → sin salida (C18).
- C19 (la caracterización pasa sobre el árbol sin cambios): comprobada antes de tocar `packages/` y otra vez sobre el motor anterior; se repite en una copia desechable del árbol con `git checkout 2711073 -- packages/engine/src` (el motor anterior al cambio) y `npx vitest run tests/lista-denegados.test.ts -t "el motor no cambia"` → 62 en verde, 8 omitidas.
- Qué probar con ojo humano: que ninguna fila de la caracterización se editó para pasar (su valor es el que devolvía el motor antes del cambio) y que `SENSITIVE_PATH_PATTERNS` y `DENIED_GIT_FLAGS` son lo que se quiere negar a los agentes antes de que SECURITY-CLI-PROYECCION-DENEGADOS-20261010 las proyecte.
- Limitación: la prueba de qa-agent observa la lista por `ejecutarGitDeQaAgent` y no por `motivoDeGitDeQaAgent` (ver `## Implementación`).

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
    "reasoning_effort": "high",
    "notes": "Sesion de implementacion del subagente en el worktree del ticket; el cliente no expone tokens ni costo, por eso no se declaran numeros.",
    "input_tokens": null,
    "output_tokens": null,
    "total_tokens": null,
    "estimated_cost_usd": null,
    "source": "manual:la sesion no expone los numeros",
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
    "at": "2026-10-10T21:47:32.751Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-10",
    "at": "2026-10-11T00:07:36.516Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-10",
    "at": "2026-10-11T00:11:27.941Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-10",
    "at": "2026-10-11T00:13:46.291Z",
    "action": "plan-approved",
    "actor": "cli",
    "details": "{\"actor\":\"autorización APA-20261009-326fff\",\"source\":\"autorizacion\",\"quote\":\"aprobacion de planes y analisis agentico\",\"planHash\":\"sha256:eaa8ecc6598556b9f54fa72641792de08222363674ea23bb18002d636f44ae17\",\"authorizationId\":\"APA-20261009-326fff\",\"authorizationHash\":\"sha256:c19a86ffa26fde8eedf8f789eff6a06a13a941ae1e68c983ec078f02eba6be0d\",\"stage\":\"plan\",\"receiptId\":\"GR-20261011-CHORE-CORE-LISTA-DENEGADOS-20261010-plan-1\",\"receiptStateHash\":\"sha256:d8ae32de684844768e9208e8bb857a8a5db512b7c34d797a86baa6db65c1aa40\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-10",
    "at": "2026-10-11T00:13:46.647Z",
    "action": "plan-approval-verified",
    "actor": "cli",
    "details": "Aprobación del plan vigente: autorización APA-20261009-326fff (fuente autorizacion, hash sha256:c19a86ffa26fde8eedf8f789eff6a06a13a941ae1e68c983ec078f02eba6be0d), plan sha256:eaa8ecc6598556b9f54fa72641792de08222363674ea23bb18002d636f44ae17."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-10",
    "at": "2026-10-11T00:13:46.647Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-10",
    "at": "2026-10-11T00:14:24.166Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-10-10",
    "at": "2026-10-11T00:18:27.933Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-10-10",
    "at": "2026-10-11T00:19:16.486Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  }
]
```
