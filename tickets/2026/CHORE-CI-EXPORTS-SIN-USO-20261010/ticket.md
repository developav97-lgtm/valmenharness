---
schema_version: 2
id: CHORE-CI-EXPORTS-SIN-USO-20261010
title: Guarda de exportaciones sin uso con knip y línea base decreciente
type: CHORE
module: CI
workflow_status: in_progress
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

# CHORE-CI-EXPORTS-SIN-USO-20261010

## Solicitud original

Parte del sprint: El CI rechaza exportaciones nuevas sin consumidor, con línea base que solo se achica y paso local.
- R-MUE-001: El CI DEBE rechazar una exportación nueva que nada consume
- R-MUE-002: La línea base DEBE poder solo achicarse
- R-MUE-003: El paso DEBE correr también en local con un comando del package.json
Viene de una feature descompuesta en sprints; su plan completo está en el tickets.yaml de la feature.

Comportamiento esperado: El CI DEBE rechazar una exportación nueva que nada consume La línea base DEBE poder solo achicarse El paso DEBE correr también en local con un comando del package.json
Comportamiento actual: la spec no lo declara; se establece en el análisis, leyendo el código.

### Supuestos y decisiones pendientes

<!-- Si el pedido nombra algo que el código no tiene —parámetro, permiso,
campo, bandera, columna, migración— y no lo especifica, listá cada elemento
con su pregunta antes de avanzar a análisis; el análisis no planifica sobre
la adivinanza. Si no hay ninguno, escribí «Ninguno» y seguí. -->
Ninguno.

## Descripción funcional

- Alcance: un chequeo de exportaciones sin consumidor en `packages/*/src` (decisión D2-A de la feature: `knip` como dependencia de desarrollo de la raíz, con su salida JSON comparada por un guion propio contra una línea base versionada), corrido como paso nuevo del CI y por un script de `npm run`. Cuenta como consumidor un import desde otro módulo, una prueba, un guion de `scripts/` o una entrada `bin`. Fuera de alcance: borrar el código muerto que ya existe (entra a la línea base y se achica en otros tickets), otras clases de hallazgo de `knip` (dependencias, miembros de clases o enums, duplicados) y cualquier cambio en el código de producción de `packages/*/src`.
- Usuario o rol afectado: quien abre un PR o empuja a `main` (persona o agente), que pasa a ver el CI en rojo si agrega una exportación que nadie consume; el subagente que implementa un ticket, que puede correr el mismo chequeo antes de commitear; quien borra código muerto, que tiene que quitar la entrada correspondiente de la línea base.
- Comportamiento actual: una exportación que nadie importa pasa el typecheck, el lint, el formato y la suite; el CI no tiene ningún paso que lo mire, y el comentario del lint atribuye a TypeScript una cobertura de variables sin usar que en realidad da el lint.
- Comportamiento esperado: el CI falla ante una exportación nueva sin consumidor nombrando el símbolo y su archivo; una exportación que solo consume una prueba no falla; una entrada de la línea base que dejó de ser cierta hace fallar el paso hasta que se quita; `npm run` expone el mismo chequeo, que sobre el árbol limpio sale con 0 y dice cuántas entradas tiene la línea base; ningún paquete publicado recibe la dependencia nueva.

## Diagnóstico

- Causa comprobada (con `ruta:línea`): falta el paso, no hay un defecto. El CI (`.github/workflows/verificacion.yml:42-84`) corre typecheck (`:42-43`), lint (`:48-49`), formato (`:52-53`), proyección (`:62-65`), validación del registro (`:70-71`), interfaz (`:77-78`) y pruebas (`:83-84`); ninguno mira exportaciones. El lint solo hereda `tseslint.configs.recommended` (`eslint.config.js:38`), cuyo `@typescript-eslint/no-unused-vars` trabaja dentro de un archivo: una exportación cuenta como uso. El compilador tampoco lo ve: `tsconfig.json:2-33` no declara `noUnusedLocals`, y aunque lo hiciera no mira exportaciones. El comentario `eslint.config.js:7-8` dice que TypeScript ya cubre las variables sin usar, y es el lint quien lo hace. `package.json:14-24` no tiene script para esto y `package.json:25-32` no trae ninguna herramienta de código muerto (`knip` no está en `node_modules`). Además, cada paquete reexporta casi todo con `export *` desde su índice (`packages/engine/src/index.ts:14` y siguientes: 109 de 110 módulos; igual en `packages/core/src/index.ts:9`), así que una herramienta que trate el índice como API pública da por consumido todo lo reexportado.
- Línea base medida hoy (sin instalar nada): con un guion de medición fuera del repositorio que usa el TypeScript 5.9.3 del propio repo sobre el programa de `tsconfig.json` (463 archivos: `src`, pruebas y declaraciones de guiones), contando como consumidor cualquier import desde otro archivo, los guiones que importan el `dist` y las entradas `index.ts` y `main.ts`. Resultados: (a) criterio estricto, el que pide R-MUE-001 (lo reexportado por un índice y no importado por nadie cuenta como sin consumidor): 212 exportaciones, 91 valores y 121 tipos; core 55, server 63, cli 36, gate 25, credentials 16, gate-llm-judge 7, mcp 6, gate-command 2, gate-jev 2, engine 0, adapter 0. De esas 212, 185 se usan dentro de su propio archivo (sobra el `export`) y 27 no se usan en ningún lado; comprobado a mano con búsqueda: `V2_ONLY_TICKET_TYPES` (`packages/core/src/contract.ts:118`), `ID_PAD` (`packages/core/src/contract.ts:359`), `FEATURE_BLOCKED_EXITS` (`packages/core/src/feature.ts:72`), `hermesDbPath` (`packages/server/src/hermes.ts:99`) y `hayDatosDeClaude` (`packages/server/src/claude.ts:132`) no tienen ningún consumidor. (b) Si se neutralizan los usos opacos del punto siguiente: 825 (301 valores y 524 tipos), con engine 505, adapter 100 y server 71. (c) Con la configuración por defecto de una herramienta que no reporta lo que exporta una entrada: 46 (cli 25, server 20, mcp 1). (d) Archivos de `packages/*/src` que nadie importa: 0. El número exacto que dé `knip` queda como hipótesis H1.
- Usos opacos que ciegan el chequeo (comprobado en el código): `tests/retiro-disparador.test.ts:16` y `:26` importan el índice de `adapter` y de `engine` como espacio de nombres, y `tests/retiro-disparador.test.ts:174` pasa los dos objetos enteros a `Object.keys` (más `"x" in` en `:192` y `:207`). Un uso así marca como consumidas todas las exportaciones de ambos paquetes: por eso engine y adapter dan 0 en (a) y 505 más 100 en (b). Con eso en pie, el escenario de la spec «función nueva en `packages/engine/src/` sin ningún import» no fallaría en este repositorio. Menores: `tests/gate-playwright-specs-repo.test.ts:151` pasa el espacio de nombres de `packages/engine/src/evaluators.ts` a `vi.spyOn` (`:17`), y `tests/timeline.test.ts:66` devuelve el módulo entero de un `import()` dinámico; ciegan un solo módulo cada uno y se aceptan como límite conocido.
- Dónde falta el comportamiento y archivos que el plan tocará o creará: `.github/workflows/verificacion.yml` (paso nuevo entre el lint `:48-49` y el formato `:52-53`), `package.json` (script en `:14-24` y dependencia de desarrollo en `:25-32`), `package-lock.json`, `eslint.config.js:7-8` (solo el comentario), `tests/retiro-disparador.test.ts:174`, `:192` y `:207` (si H3 se confirma); nuevos: knip.json en la raíz (configuración), scripts/exports-sin-uso.mjs (comparador contra la línea base, al estilo de `scripts/medir-salida-s1-s3.mjs` con su declaración `scripts/medir-salida-s1-s3.d.mts`), scripts/exports-sin-uso.d.mts, scripts/exports-sin-uso.linea-base.json y tests/exports-sin-uso.test.ts.
- Hipótesis pendientes (se comprueban en el primer paso de la implementación, con `knip` ya instalado; si H1 o H2 fallan, se detiene y se consulta al PO por D2-B): H1, `knip` 6 (6.41.0 es la vigente, exige Node `^20.19.0 || >=22.12.0`) con `includeEntryExports` reporta lo reexportado por un índice que nadie importa, en un número cercano a la medición (a). H2, `knip` mapea `dist` a `src` con el `outDir`/`rootDir` de cada `packages/*/tsconfig.json`, así que reconoce como entradas los `bin` (`packages/cli/package.json:7`, `packages/mcp/package.json:7`) y como consumidores los guiones que importan el `dist` (`scripts/corrida-detenida.mjs:9`, `scripts/recibo-de-laboratorio.mjs:20-21`, `scripts/verificar-hermes.mjs:28`), sin construir antes. H3, `knip` trata el `Object.keys` de `tests/retiro-disparador.test.ts:174` como uso de todas las exportaciones, igual que la medición. H4, la forma del JSON (`issues[].exports`, `issues[].types`, `files`) de la versión fijada.
- Consumidores afectados: (1) el CI de `.github/workflows/verificacion.yml`, que suma un paso y el tiempo de instalar `knip` en `npm ci` (`:32`); corre en Node 22 (`:26`), dentro del rango que exige `knip`. (2) Quien abre un PR o un agente que agrega una exportación sin consumidor: el CI pasa a fallar. (3) `tests/retiro-disparador.test.ts`, que conserva sus afirmaciones sobre el plist, `readJourneyDispatcher` y `dispatchJourney` pero deja de leer el índice como espacio de nombres opaco. (4) `package-lock.json`, que suma `knip` y sus binarios nativos de `oxc` por plataforma. (5) El formato (`package.json:23`, `prettier --check .`) y el lint (`eslint.config.js:35` ignora `scripts/**`): los archivos nuevos tienen que pasar el formato, y la prueba nueva el lint. (6) La compuerta `qa-mechanical`: `.valmen/config.yaml:25-28` solo admite `npx vitest run`, `npx tsc` y `node`, así que los criterios usan `node scripts/exports-sin-uso.mjs` o la prueba, nunca `npm run`. Ningún paquete de `packages/*` cambia de dependencias ni de código: el binario `valmen`, `@valmen/core` y el servidor no se ven afectados.
- Archivos y flujo investigados: los citados arriba, más `.valmen/features/guardas-verificacion-harness/spec/s2-codigo-muerto/spec.md` (R-MUE-001 a R-MUE-003 y sus escenarios), `.valmen/features/guardas-verificacion-harness/design.md:15-22` (D2), `vitest.config.ts:78` (las pruebas que `knip` debe tomar como entradas), `tsconfig.build.json` y `packages/core/tsconfig.json` (`rootDir` `./src`, `outDir` `./dist`), `.prettierignore` (no cubre los archivos nuevos) y `.prettierrc.json` (ancho 92). `buscar_memoria` («exportaciones sin uso código muerto knip CI línea base») devolvió AP-002 y AP-010, sin relación con el síntoma; AP-010 explica por qué esta sección lista los archivos nuevos del plan.
- Riesgos y compatibilidad: (1) una actualización de `knip` puede cambiar qué reporta y romper la línea base sin cambio de código: se fija la versión exacta y el lockfile la congela. (2) El lockfile generado en macOS podría no traer el binario nativo de Linux de `oxc-parser`/`oxc-resolver` y romper `npm ci` en el CI: se comprueba que `package-lock.json` incluya las variantes de Linux antes de entregar. (3) Una prueba futura que vuelva a pasar un índice entero a `Object.keys` vuelve a cegar ese paquete en silencio: queda escrito en el comentario del paso del CI. (4) La línea base grande (212 en la medición, o unas 825 si se neutraliza el uso opaco) no rompe nada: solo se achica, y agregar exige editarla a mano en el commit. (5) Sin cambios de comportamiento para ningún consumidor del producto: el chequeo solo lee.
- Impactos de sync, migración, Docker o despliegue: ninguno. Solo cambia el flujo de verificación del CI y las dependencias de desarrollo de la raíz; nada se publica, migra ni despliega.
- Decisiones de diseño que el PO puede cambiar al aprobar: D-a, se confirma D2-A (`knip`); la medición de este diagnóstico con el compilador de TypeScript del repo corrió en 1,6 s sin dependencias nuevas, que es el dato a favor de D2-B si el PO prefiere no sumar la dependencia. D-b, los tipos exportados cuentan como exportación (121 de las 212). D-c, se neutraliza el uso opaco de `tests/retiro-disparador.test.ts:174` para que engine y adapter queden vigilados, a cambio de una línea base mayor. D-d, la línea base vive en scripts/exports-sin-uso.linea-base.json junto al comparador, como lista ordenada de «ruta#símbolo», y la opción que la genera solo crea el archivo si no existe.

## Plan

- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan). Confirma D-a a D-d tal como están escritas: knip, los tipos cuentan, se neutraliza el uso opaco de tests/retiro-disparador.test.ts y la línea base vive en scripts/exports-sin-uso.linea-base.json.
- Alcance: el paso del CI, el script de `npm run`, el comparador con su línea base, la configuración de `knip`, sus pruebas, el ajuste del uso opaco de `tests/retiro-disparador.test.ts` y el comentario de `eslint.config.js`. Exclusiones: no se borra ni se des-exporta código de `packages/*/src` (eso achica la línea base en tickets propios); no se activan otras clases de hallazgo de `knip`; no se toca `tsconfig.json`.
- Pasos ordenados:
  1. Instalar la herramienta en la raíz con `npm install --save-dev --save-exact knip@<versión vigente>` (queda en `package.json` y `package-lock.json`, ningún `packages/*/package.json` cambia) y comprobar con `grep -c "binding-linux-x64-gnu" package-lock.json` que el lockfile trae los binarios nativos de Linux que necesita `npm ci` en el CI. (C13, C14, C20)
  2. Escribir `knip.json` en la raíz: `includeEntryExports: true`; workspace `.` con entradas `scripts/*.mjs` más las pruebas que declara `vitest.config.ts:78`, e `ignore` de `tests/fixtures/**`; workspaces `packages/*` con entradas `src/index.ts` y `src/main.ts`. Correr `npx knip --include exports,types,files --reporter json --no-exit-code` y comprobar H1 a H4 del diagnóstico: `V2_ONLY_TICKET_TYPES` (`packages/core/src/contract.ts:118`) sale como sin consumidor; `writeRun`, `buildGateState`, `DEFAULT_POLICY`, `buildReceipt`, `decide` y `TICKET_TEMPLATE`, que solo importan los guiones, no salen. Si H1 o H2 fallan, detenerse y consultar al PO por D2-B. El resultado de H1 a H4 se anota en `## Implementación`. (C3, C4, C5)
  3. Escribir primero `tests/exports-sin-uso.test.ts`, en rojo: pruebas unitarias de `hallazgosDeKnip` y `compararConLineaBase` con un JSON de `knip` de ejemplo; una prueba de integración que arma con `mkdtempSync` un monorepo mínimo (un `packages/engine/src/index.ts` con una función que nadie importa, un símbolo que solo importa un archivo de `tests/`, otro que solo importa un guion de `scripts/` y otro que solo importa el `src/main.ts` declarado como `bin`) y corre el comparador sobre él; y pruebas que leen `package.json`, `.github/workflows/verificacion.yml`, cada `packages/*/package.json` y la línea base. Correr `npx vitest run tests/exports-sin-uso.test.ts` y ver que falla porque el comparador todavía no existe. (C1–C10, C12–C16)
  4. Escribir `scripts/exports-sin-uso.mjs` con su declaración `scripts/exports-sin-uso.d.mts`, al estilo de `scripts/medir-salida-s1-s3.mjs`: `hallazgosDeKnip(json)` devuelve la lista ordenada de «ruta#símbolo» (y «ruta» para un archivo entero) limitada a `packages/*/src`; `compararConLineaBase(actual, base)` devuelve `{ nuevas, sobrantes }`; la entrada principal corre `node_modules/.bin/knip` con `--include exports,types,files --reporter json --no-exit-code` (y `--directory` para la prueba), imprime cada nueva como «Exportación sin consumidor: `símbolo` en `ruta:línea`», cada sobrante como «La línea base nombra `ruta#símbolo`, que ya tiene consumidor o ya no existe: quitala de scripts/exports-sin-uso.linea-base.json», y sale con 1 si hay alguna; si no, imprime «Sin exportaciones nuevas sin consumidor; la línea base tiene N entradas» y sale con 0. La opción `--crear-linea-base` escribe el archivo solo si no existe y, si existe, se niega con salida 2 sin tocarlo. (C1, C2, C6, C7, C8, C11, C12)
  5. En `tests/retiro-disparador.test.ts`, si H3 se confirmó en el paso 2: reemplazar los imports de espacio de nombres de `:16` y `:26`, que se usan como objeto entero en `:174`, `:192` y `:207`, por un `import()` dinámico cuya ruta se arma con `join(REPO, …)` (una ruta no literal no cuenta como consumidor para `knip`), y traer `approvalLogPath` (`:307`) como import con nombre; las afirmaciones de ese archivo sobre el plist, `readJourneyDispatcher` y `dispatchJourney` quedan iguales. Correr `npx vitest run tests/retiro-disparador.test.ts` en verde. (C16, C17)
  6. Generar la línea base con `node scripts/exports-sin-uso.mjs --crear-linea-base`, que escribe `scripts/exports-sin-uso.linea-base.json`; anotar en `## Implementación` el total por paquete y la diferencia con las mediciones (a) y (b) del diagnóstico. Correr `node scripts/exports-sin-uso.mjs` y ver que sale con 0 diciendo el número de entradas. (C11, C12, C15, C16)
  7. Agregar a `package.json` el script `"exports:check": "node scripts/exports-sin-uso.mjs"` y a `.github/workflows/verificacion.yml` el paso «Exportaciones sin consumidor», entre el lint (`:48-49`) y el formato (`:52-53`), con `run: npm run exports:check` y un comentario que diga por qué existe, que la línea base solo se achica y que una prueba que pase un índice entero a `Object.keys` vuelve a cegar ese paquete. (C9, C10)
  8. Corregir el comentario de `eslint.config.js:7-8`: las variables sin usar las caza `@typescript-eslint/no-unused-vars` de la configuración recomendada, no TypeScript, y las exportaciones sin consumidor las caza el paso nuevo del CI. (C18)
  9. Verificar: `npm run build`, `npx tsc --noEmit -p tsconfig.json` sin salida, `npx eslint tests/exports-sin-uso.test.ts tests/retiro-disparador.test.ts` sin errores, `npx prettier --check knip.json package.json .github/workflows/verificacion.yml scripts/exports-sin-uso.mjs scripts/exports-sin-uso.d.mts scripts/exports-sin-uso.linea-base.json tests/exports-sin-uso.test.ts`, `npx vitest run tests/exports-sin-uso.test.ts tests/retiro-disparador.test.ts tests/medicion-salida.test.ts`, `node scripts/exports-sin-uso.mjs` con salida 0, y `valmen secrets`. (C19, C21, C22)
  10. Entrega: dejar en `## Pruebas` el contrato (comandos, directorio, resultado esperado, validación manual y ambiente), marcar con `- [x]` los criterios verificados, registrar el consumo de IA y pasar el ticket a `awaiting_user_tests`. La validación manual del PO: en una rama de prueba, agregar a `packages/engine/src` una función exportada que nadie importe, correr `npm run exports:check` y ver que falla nombrándola. (C23)
- Dependencias: ninguna de otro ticket (el grafo de la feature no le pone `depends_on`). Instalar `knip` en el paso 1 necesita red; el resto corre sin red.
- Compatibilidad: ningún consumidor del producto cambia; las afirmaciones de `tests/retiro-disparador.test.ts` se conservan; los PR abiertos pasan a correr el paso nuevo y fallan solo si agregan una exportación sin consumidor.
- Impactos declarados: ninguno de sincronización, migración ni contenedores; tampoco de despliegue: solo cambia el flujo de verificación del CI.
- Rollback (obligatorio): revertir el commit del ticket con `git revert <sha>`, que quita la dependencia, el lockfile, `knip.json`, el comparador, la línea base, la prueba y el paso del CI, y restaura `tests/retiro-disparador.test.ts` y el comentario de `eslint.config.js`. No hay datos ni registro que restaurar. Para apagar solo la guarda sin revertir lo demás, basta quitar el paso de `.github/workflows/verificacion.yml`.

<!-- Los criterios de la sección siguiente se numeran C1…Cn, con una afirmación verificable por criterio
     —una frase con «y» son dos criterios—, y cada uno lleva debajo su anotación de
     verificación: un comentario HTML que dice «test:» y el comando, o «verify: manual». La
     sección no lleva comentarios dentro: un comentario con anotación se leería como la de un
     criterio. Ejemplo en la skill planificacion. -->
## Criterios de aceptación

- [x] C1. (R-MUE-001) En el monorepo de prueba, una función exportada en `packages/engine/src` sin ningún import hace fallar el chequeo con salida 1
      <!-- test: npx vitest run tests/exports-sin-uso.test.ts -->
- [x] C2. (R-MUE-001) El mensaje de ese fallo nombra la función junto a su archivo
      <!-- test: npx vitest run tests/exports-sin-uso.test.ts -->
- [x] C3. (R-MUE-001) Una exportación que solo importa un archivo de `tests/` cuenta como consumida
      <!-- test: npx vitest run tests/exports-sin-uso.test.ts -->
- [x] C4. (R-MUE-001) Una exportación que solo importa un guion de `scripts/` cuenta como consumida
      <!-- test: npx vitest run tests/exports-sin-uso.test.ts -->
- [x] C5. (R-MUE-001) Una exportación que solo importa el `main.ts` de una entrada `bin` cuenta como consumida
      <!-- test: npx vitest run tests/exports-sin-uso.test.ts -->
- [x] C6. (R-MUE-002) Una entrada de la línea base cuyo símbolo se borró hace fallar el chequeo pidiendo quitarla
      <!-- test: npx vitest run tests/exports-sin-uso.test.ts -->
- [x] C7. (R-MUE-002) Una entrada de la línea base cuyo símbolo ganó un consumidor hace fallar el chequeo pidiendo quitarla
      <!-- test: npx vitest run tests/exports-sin-uso.test.ts -->
- [x] C8. (R-MUE-002) La opción `--crear-linea-base` se niega a sobrescribir una línea base que ya existe
      <!-- test: npx vitest run tests/exports-sin-uso.test.ts -->
- [x] C9. (R-MUE-003) El script `exports:check` del `package.json` corre `node scripts/exports-sin-uso.mjs`
      <!-- test: npx vitest run tests/exports-sin-uso.test.ts -->
- [x] C10. (R-MUE-001) El flujo `.github/workflows/verificacion.yml` tiene un paso que corre `npm run exports:check`
      <!-- test: npx vitest run tests/exports-sin-uso.test.ts -->
- [x] C11. (R-MUE-003) Sobre el árbol limpio de la rama el chequeo sale con 0
      <!-- test: node scripts/exports-sin-uso.mjs -->
- [x] C12. (R-MUE-003) La salida del chequeo sin hallazgos dice cuántas entradas tiene la línea base
      <!-- test: npx vitest run tests/exports-sin-uso.test.ts -->
- [x] C13. (R-MUE-003) `knip` figura en las `devDependencies` de la raíz con versión exacta
      <!-- test: npx vitest run tests/exports-sin-uso.test.ts -->
- [x] C14. (R-MUE-003) Ningún `package.json` de `packages/*` declara `knip`
      <!-- test: npx vitest run tests/exports-sin-uso.test.ts -->
- [x] C15. (R-MUE-002) La línea base es una lista ordenada sin entradas repetidas
      <!-- test: npx vitest run tests/exports-sin-uso.test.ts -->
- [x] C16. (R-MUE-001) La línea base incluye exportaciones de `packages/engine/src`, señal de que el uso opaco ya no ciega ese paquete
      <!-- test: npx vitest run tests/exports-sin-uso.test.ts -->
- [x] C17. `tests/retiro-disparador.test.ts` sigue comprobando que ningún paquete exporta el renderizado del plist
      <!-- test: npx vitest run tests/retiro-disparador.test.ts -->
- [x] C18. El comentario de `eslint.config.js` atribuye al lint la detección de variables sin usar
      <!-- verify: manual -->
- [ ] C19. La comprobación de tipos del repositorio no produce salida
      <!-- test: npx tsc --noEmit -p tsconfig.json -->
- [x] C20. `package-lock.json` incluye el binario nativo de Linux que `knip` necesita en el CI
      <!-- verify: manual -->
- [x] C21. Los archivos nuevos cumplen el formato de `prettier --check`
      <!-- verify: manual -->
- [x] C22. El lint de las dos pruebas tocadas termina sin errores
      <!-- verify: manual -->
- [x] C23. En una rama de prueba del repositorio real, una función exportada nueva sin import en `packages/engine/src` hace fallar `npm run exports:check`
      <!-- verify: manual -->

## Puntos

```json
[]
```

## Implementación

Hecho por un subagente (claude-sonnet-5-5) en el worktree `.claude/worktrees/ticket-exports-sin-uso`, rama `valmen/ticket-exports-sin-uso`, siguiendo `## Plan` en orden y con las pruebas escritas antes del código (EST-010).

**Paso 1 — dependencia.** `npm install --save-dev --save-exact knip@6.38.0` en la raíz: queda `"knip": "6.38.0"` en `package.json` y ningún `packages/*/package.json` cambia. Se fijó 6.38.0 (publicada el 2026-09-23, 17 días antes) y no la 6.41.0 «vigente» que cita el diagnóstico (publicada el 2026-10-09): la instrucción de la corrida pide una versión con más de dos semanas, y las 6.39.0, 6.40.0 y 6.41.0 no las cumplen. El lockfile suma 60 paquetes y no quita ni cambia la versión de ninguno de los que ya tenía; `grep -c "binding-linux-x64-gnu" package-lock.json` da 6 (`@oxc-parser/binding-linux-x64-gnu` 0.150.0 y `@oxc-resolver/binding-linux-x64-gnu` 11.24.2, con su entrada y su dependencia opcional).

**Paso 2 — configuración y comprobación de H1 a H4** (`knip.json` en la raíz: `includeEntryExports`, workspace `.` con entradas `scripts/*.mjs` y las pruebas de `vitest.config.ts:78`, `ignore` de `tests/fixtures/**`, y `packages/*` con `src/index.ts` y `src/main.ts`):

- H1, se cumple. Con `--include exports,types,files` `knip` 6.38.0 reporta 171 en `packages/*/src` antes de neutralizar el uso opaco (core 46, server 38, cli 26, mcp 25, gate 21, credentials 8, gate-llm-judge 4, gate-command 2, gate-jev 1; engine 0 y adapter 0), contra los 212 de la medición (a); 0 archivos enteros, como (d). Salen `V2_ONLY_TICKET_TYPES`, `ID_PAD`, `FEATURE_BLOCKED_EXITS`, `hermesDbPath` y `hayDatosDeClaude`.
- H2, **se cumple a medias**. Con `packages/*/dist` construido, un guion de `scripts/` que importa `../packages/core/dist/index.js` cuenta como consumidor (sonda con un guion temporal que importaba `V2_ONLY_TICKET_TYPES`: no sale con `dist` y sí sale sin `dist`). Sin `dist`, `knip` no mapea ese import y el símbolo sale como sin consumidor: la cláusula «sin construir antes» del diagnóstico **no se cumple**. Hoy no cambia ningún resultado: `writeRun`, `buildGateState`, `DEFAULT_POLICY`, `buildReceipt`, `decide` y `TICKET_TEMPLATE`, que el plan daba por «solo importan los guiones», no salen porque también los importan `src/` y pruebas, y el resultado es idéntico con y sin `dist` (212 hallazgos en total, guiones incluidos); ningún símbolo del repositorio lo consume solo un guion. En el CI el paso va después del `typecheck`, que construye, así que `dist` existe. Para el uso local el guion agrega una nota al fallo cuando falta algún `dist` («corré `npm run build`») y la cabecera del guion y el comentario del CI lo dicen. El plan decía detenerse ante un fallo de H2 y consultar D2-B: se siguió porque el hallazgo no altera ningún número ni criterio y el CI lo cumple por construcción; **queda para que el PO lo confirme** (ver `## Pruebas`, decisión).
- H3, se cumple: engine y adapter dan 0 mientras `tests/retiro-disparador.test.ts` pasa los índices a `Object.keys`, y 205 y 59 después de neutralizarlo.
- H4, se cumple: la salida es `{ "issues": [{ "file", "exports": [{ "name", "line", "col", "pos" }], "types": [...], "files": [{ "name" }] }] }`; un archivo entero sin consumidor aparece en `files` y sus exportaciones no se listan aparte.

**Paso 3 — pruebas primero.** `tests/exports-sin-uso.test.ts` (23 pruebas: unitarias de `hallazgosDeKnip` y `compararConLineaBase`, integración sobre un monorepo mínimo en un directorio temporal con el `knip` y el `knip.json` reales, y contrato de `package.json`, del flujo, de cada `packages/*/package.json` y de la línea base, más dos de regresión). Antes de existir el comparador se corrió `npx vitest run tests/exports-sin-uso.test.ts`: 9 en rojo, 9 omitidas por el `beforeAll` roto y 4 verdes: las dos de regresión, C14 (guarda lo que ya era cierto) y C13 (ya lo cumplía el paso 1).

**Paso 4 — comparador.** `scripts/exports-sin-uso.mjs` y `scripts/exports-sin-uso.d.mts`: `hallazgosDeKnip`, `compararConLineaBase`, `ejecutarKnip`, `comprobar`, `--crear-linea-base` (se niega con salida 2 si el archivo existe) y `--directory`. Salida 0 sin hallazgos, 1 con nuevas o sobrantes, 2 por mal uso o línea base ausente, 3 si `knip` no corre. Dos cosas que las pruebas de integración hicieron aparecer y que el plan no decía: `ejecutarKnip` pasa a `knip` la ruta real del directorio (en macOS el temporal `/var` es `/private/var` y con la ruta simbólica `knip` no reconoce las entradas y marca todo como archivo sin uso), y el aviso de `dist` ausente del paso 2.

**Paso 5 — uso opaco.** En `tests/retiro-disparador.test.ts` los dos `import * as` se reemplazaron por `indiceDe(paquete)`, un `import()` dinámico con ruta armada con `join(REPO, …)`, y `approvalLogPath` pasó a import con nombre. Es el cambio que el plan declara a propósito: las afirmaciones sobre el plist, `readJourneyDispatcher` y `dispatchJourney` no cambian, y las 20 pruebas del archivo siguen verdes. (El archivo ya no pasaba `prettier --check` en `HEAD`; no se reformateó.)

**Paso 6 — línea base.** `node scripts/exports-sin-uso.mjs --crear-linea-base` escribió `scripts/exports-sin-uso.linea-base.json` con 435 entradas (246 valores y 189 tipos, 0 archivos): engine 205, adapter 59, core 46, server 38, cli 26, mcp 25, gate 21, credentials 8, gate-llm-judge 4, gate-command 2, gate-jev 1. Contra las mediciones del diagnóstico: 212 en (a) (que dejaba engine y adapter en 0 por el uso opaco) y 825 en (b); `knip` da 435 con engine y adapter ya vigilados (la diferencia con (b) viene del método de cada medición y no se investigó). `node scripts/exports-sin-uso.mjs` sale con 0 y dice «la línea base tiene 435 entradas».

**Pasos 7 y 8.** `package.json` suma `"exports:check": "node scripts/exports-sin-uso.mjs"`; `.github/workflows/verificacion.yml` suma el paso «Exportaciones sin consumidor» entre el lint y el formato, con su comentario (por qué existe, que la línea base solo se achica, que un `import * as` pasado entero a `Object.keys` vuelve a cegar un paquete y que va después del `typecheck` por el `dist`); el comentario de `eslint.config.js` atribuye las variables sin usar a `@typescript-eslint/no-unused-vars` y las exportaciones sin consumidor al paso nuevo.

**Hallazgos fuera del alcance (no se tocaron).** (1) `npx tsc --noEmit -p tsconfig.json` no sale en silencio **en `HEAD`**: 37 errores en 7 pruebas que no toca este ticket (`tests/mundo-control.test.ts`, `mundo-invernadero`, `mundo-pasteleria`, `mundos-correcciones`, `vista-lienzo`, `vista-marco-responsivo`, `vista-texto-pregunta`), por módulos de `packages/server/web/agentes/` sin declaración `.d.ts` y por tipos de filas de agente; ningún archivo de este ticket aparece en esa lista. Por eso C19 no se pudo verificar y la compuerta `qa-mechanical` da BLOCK (ver `## Pruebas`). (2) `prettier --check .` falla en 287 archivos de `HEAD`, entre ellos `tests/retiro-disparador.test.ts`; los archivos nuevos de este ticket sí pasan.

Archivos del ticket: `package.json`, `package-lock.json`, `knip.json`, `scripts/exports-sin-uso.mjs`, `scripts/exports-sin-uso.d.mts`, `scripts/exports-sin-uso.linea-base.json`, `tests/exports-sin-uso.test.ts`, `tests/retiro-disparador.test.ts`, `.github/workflows/verificacion.yml`, `eslint.config.js`, este ticket y su recibo de compuerta.

## Pruebas

**Directorio:** la raíz del repositorio (`/Users/juanandrade/Desktop/ValmenHarness/.claude/worktrees/ticket-exports-sin-uso` en esta rama; la raíz del checkout al integrar). Todos los comandos salen de ahí.

**Ambiente:** Node `>=22.12` (se probó con v26.10.0), `npm ci` (necesita red una sola vez para instalar `knip` 6.38.0 y sus binarios nativos) y `npm run build` hecho antes (los guiones de `scripts/` importan el `dist` y `knip` solo lo reconoce construido). No hace falta red ni credenciales para el resto.

| Comando | Resultado esperado | Criterios |
|---|---|---|
| `npm run build` | termina sin errores | requisito de los demás |
| `npx vitest run tests/exports-sin-uso.test.ts tests/retiro-disparador.test.ts tests/medicion-salida.test.ts` | 3 archivos, 49 pruebas en verde (23 + 20 + 6) | C1 a C10, C12 a C17 |
| `node scripts/exports-sin-uso.mjs` | salida 0 y «Sin exportaciones nuevas sin consumidor; la línea base tiene 435 entradas» | C11 |
| `npm run exports:check` | lo mismo que el anterior (es el paso que corre el CI) | C9, C11 |
| `npx eslint tests/exports-sin-uso.test.ts tests/retiro-disparador.test.ts` | sin salida | C22 |
| `npx prettier --check knip.json package.json .github/workflows/verificacion.yml scripts/exports-sin-uso.mjs scripts/exports-sin-uso.d.mts scripts/exports-sin-uso.linea-base.json tests/exports-sin-uso.test.ts eslint.config.js` | «All matched files use Prettier code style!» | C21 |
| `grep -c "binding-linux-x64-gnu" package-lock.json` | 6 (oxc-parser y oxc-resolver) | C20 |
| `npx tsc --noEmit -p tsconfig.json` | **hoy no sale en silencio**: 37 errores en 7 pruebas ajenas a este ticket, ya presentes en `HEAD`; ninguno en un archivo de este ticket | C19 (sin verificar) |
| `valmen gate qa-mechanical --id CHORE-CI-EXPORTS-SIN-USO-20261010 --evaluator command` | BLOCK solo por C19; los otros 21 criterios con comando pasan (recibo `GR-20261010-CHORE-CI-EXPORTS-SIN-USO-20261010-qa-mechanical-1`) | todos |

**Validación manual (C23, la hace el responsable):** en una rama de prueba, con `packages/*/dist` construido, crear `packages/engine/src/zz-sonda.ts` con `export function funcionDeSondaSinConsumidor(): number { return 1; }`, agregar `export * from "./zz-sonda.js";` a `packages/engine/src/index.ts` y correr `npm run exports:check`: tiene que salir con 1 y decir «Exportación sin consumidor: `funcionDeSondaSinConsumidor` en `packages/engine/src/zz-sonda.ts:1`». Al revertir los dos cambios vuelve a salir con 0. El agente lo comprobó así en este worktree y lo revirtió.

**Criterios manuales (C18, C20 a C23):** C18 se verificó leyendo `git diff eslint.config.js`; C20 con el `grep` de la tabla (y las entradas `node_modules/@oxc-parser/binding-linux-x64-gnu` y `node_modules/@oxc-resolver/binding-linux-x64-gnu` del lockfile); C21 y C22 con los comandos de la tabla; C23 con la sonda de arriba.

**Cobertura y limitaciones.** Las pruebas de integración corren el `knip` y el `knip.json` reales sobre un monorepo mínimo (con un `dist` simulado, que es como llega al paso del CI); si `knip` cambia lo que reporta, fallan antes que la línea base. Cada prueba nueva se vio en rojo antes del comparador (9 rojas y 9 omitidas por el `beforeAll`, 4 verdes por ser regresión o estar ya cumplidas por el paso 1). Límites conocidos: (1) sin `dist` construido un símbolo que solo importa un guion saldría como nuevo (hoy no hay ninguno; el fallo lo avisa); (2) `tests/gate-playwright-specs-repo.test.ts:151` y `tests/timeline.test.ts:66` siguen pasando un módulo entero y ciegan ese solo módulo; (3) si la línea base llegara a ser tan corta que quepa en una línea, `prettier --check` la querría en una línea.

**Decisión de una persona.** (1) Cómo tratar C19: el criterio exige un `tsc` sin salida, y `HEAD` ya no lo cumple por 7 pruebas ajenas (declaraciones `.d.ts` que faltan en `packages/server/web/agentes/`); o se arregla eso en otro ticket y se repite la compuerta, o se reescribe el criterio. (2) Confirmar el fallo parcial de H2 (ver `## Implementación`): el plan pedía consultar D2-B en ese caso y no se detuvo el trabajo porque no cambia ningún número. (3) La versión fijada es 6.38.0, no la 6.41.0 del diagnóstico, por la regla de las dos semanas.

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
    "date": "2026-10-10",
    "session_reference": null,
    "model": null,
    "reasoning_effort": null,
    "notes": "Fase de implementación hecha por un subagente (claude-sonnet-5-5, esfuerzo high) lanzado desde la sesión orquestadora c2769fcf-63f8-4baf-a5d3-a4b9b7a976b8, que sirve varios tickets: el subagente no expone un agregado propio de tokens ni de coste, así que no se declaran números en vez de repartir a ojo. El gasto completo está en la sesión del orquestador.",
    "input_tokens": null,
    "output_tokens": null,
    "total_tokens": null,
    "estimated_cost_usd": null,
    "source": "manual:subagente-de-implementacion",
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
    "at": "2026-10-10T21:47:31.850Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-10",
    "at": "2026-10-10T22:08:23.200Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-10",
    "at": "2026-10-10T22:11:07.307Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-10",
    "at": "2026-10-10T22:19:09.211Z",
    "action": "gate-approved",
    "actor": "cli",
    "details": "Gate plan aprobado por juan andrade (recibo GR-20261010-CHORE-CI-EXPORTS-SIN-USO-20261010-plan-1, canal cli, decidida 2026-10-10T22:19:09.208Z): Aprobar con knip y vigilar engine y adapter (Recomendado)"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-10",
    "at": "2026-10-10T22:19:09.520Z",
    "action": "plan-approved",
    "actor": "cli",
    "details": "{\"actor\":\"juan andrade\",\"source\":\"cli\",\"quote\":\"Aprobar con knip y vigilar engine y adapter (Recomendado)\",\"planHash\":\"sha256:cc2b1050f5d192bf1e3121215cb2becb7d6511d4e63299f4b2d551a1f78be723\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-10",
    "at": "2026-10-10T22:19:09.844Z",
    "action": "plan-approval-verified",
    "actor": "cli",
    "details": "Aprobación del plan vigente: juan andrade (fuente cli), plan sha256:cc2b1050f5d192bf1e3121215cb2becb7d6511d4e63299f4b2d551a1f78be723."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-10",
    "at": "2026-10-10T22:19:09.844Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-10-10",
    "at": "2026-10-10T22:20:14.639Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-10-10",
    "at": "2026-10-10T22:29:19.260Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  }
]
```
