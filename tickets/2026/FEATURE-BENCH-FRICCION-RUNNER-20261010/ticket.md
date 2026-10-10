---
schema_version: 2
id: FEATURE-BENCH-FRICCION-RUNNER-20261010
title: Medición de fricción aislada sobre un binario valmen con clasificador
type: FEATURE
module: BENCH
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

# FEATURE-BENCH-FRICCION-RUNNER-20261010

## Solicitud original

Parte del sprint: La fricción del CLI se mide con recorridos sin modelo, se clasifica en código y se compara entre dos binarios.
- R-FRI-001: La medición DEBE recorrer un binario `valmen` dado, sin modelo y aislada
- R-FRI-002: Cada bloqueo DEBE clasificarse en código como en banda, fuera de banda o callejón sin salida
Viene de una feature descompuesta en sprints; su plan completo está en el tickets.yaml de la feature.

Comportamiento esperado: La medición DEBE recorrer un binario `valmen` dado, sin modelo y aislada Cada bloqueo DEBE clasificarse en código como en banda, fuera de banda o callejón sin salida
Comportamiento actual: la spec no lo declara; se establece en el análisis, leyendo el código.

### Supuestos y decisiones pendientes

<!-- Si el pedido nombra algo que el código no tiene —parámetro, permiso,
campo, bandera, columna, migración— y no lo especifica, listá cada elemento
con su pregunta antes de avanzar a análisis; el análisis no planifica sobre
la adivinanza. Si no hay ninguno, escribí «Ninguno» y seguí. -->
Ninguno.

## Descripción funcional

- Alcance: una medición de fricción nueva en el directorio `bench/friccion/` de la raíz, fuera de los workspaces de `packages/*` (decisión D3 de la feature). Recibe un binario `valmen` por `--binary` y lo maneja como caja negra. Por cada recorrido arma un escenario temporal aislado, con su `HOME`, su registro y su repositorio git, y corre la operación que bloquea. Clasifica en código el bloqueo como en banda, fuera de banda o callejón sin salida, o lo marca como rechazo correcto con su motivo, y escribe un archivo de resultados JSON. Trae un único recorrido de ejemplo: el salto ilegal `intake → approved` del escenario de R-FRI-002. Quedan fuera los ocho recorridos del corpus, `compare`, el estado «no soportado» y el código de salida por recorrido fallido (R-FRI-003 y R-FRI-004, que cubre FEATURE-BENCH-FRICCION-CORPUS-20261010).
- Usuario o rol afectado: quien mantiene el harness (el PO y los agentes que cambian mensajes del motor), y la comprobación de R-MSG-004 (s1), que usa esta clasificación.
- Comportamiento actual: nada recorre el CLI para contar bloqueos. Lo más cercano, `scripts/medir-salida-s1-s3.mjs`, corre el `valmen` del `PATH` con el entorno heredado sobre registros reales y mide validación y precisión de compuertas, no bloqueos. Comprobado con el binario de este árbol en un directorio temporal: `transition --id … --entity ticket --to approved` sobre un ticket en `intake` sale con 3 y con «Transición de ticket intake -> approved no permitida.», sin nombrar ninguna salida, y nada lo registra.
- Comportamiento esperado: `node bench/friccion/dist/cli.js run --binary <ruta> --out <archivo>` recorre el corpus contra ese binario sin llamar a un modelo. No toca el `~/.valmen` ni el repositorio desde el que se corre, y deja un archivo con la clase de cada bloqueo. El mismo código mide el binario de un commit anterior.

## Diagnóstico

- Causa comprobada (con `ruta:línea`): no es un defecto; falta el componente, y el código existente no sirve tal cual por tres motivos comprobados.
  1. Ningún código recorre el CLI contando bloqueos. El único medidor, `ejecutarValmen` en `scripts/medir-salida-s1-s3.mjs:17-24`, lanza `spawnSync("valmen", ["--root", root, ...])`: usa el binario del `PATH`, hereda el `HOME` y el entorno y trabaja sobre un registro real. Solo mide `validate --all` y `precision` (`scripts/medir-salida-s1-s3.mjs:31-43`). No recibe un binario, no aísla y no clasifica mensajes.
  2. Lo que ya arma registros temporales no se puede reutilizar desde fuera de `packages/`. `tests/helpers/fixtures.ts:15-16` importa `packages/core/src` y `packages/engine/src` para `renderFixtureTicket` (`tests/helpers/fixtures.ts:87`) y `writeFixtureTicket` (`tests/helpers/fixtures.ts:235`). `tests/helpers/ola.ts:9-15` importa `createJourney` y `resolveAuthorizedProject` del motor. `tests/helpers/worktree-lab.ts:10-11` importa tipos del motor y `fixtures`. D3 exige que la medición no importe nada de `packages/`, así que el patrón se replica a través del binario: `crearEntornoOla` (`tests/helpers/ola.ts:27-43`) aísla con un `HOME` temporal que lleva `.valmen/`, y `crearLaboratorio` (`tests/helpers/worktree-lab.ts:25-55`) crea con `mkdtemp` un repositorio git con usuario local y un commit base.
  3. Aislar el binario por `HOME` funciona porque lo de la máquina sale de `homedir()`: los bindings (`packages/engine/src/project-resolution.ts:39`) y las credenciales (`packages/credentials/src/credentials.ts:28-29`). Pero las claves también se leen del entorno (`<PROVEEDOR>_API_KEY`, `packages/credentials/src/credentials.ts:99`), y el CLI de Claude se busca por `VALMEN_CLAUDE_BIN` o por el `PATH` (`packages/credentials/src/claude-cli.ts:106-108`). Por eso «sin modelo» exige un entorno armado desde cero, no uno heredado.
- Lo que el clasificador puede leer del binario. Se comprobó corriendo `packages/cli/dist/main.js` en un directorio temporal con `HOME` propio:
  - El mensaje sale por stderr con el prefijo `Error: ` (`packages/cli/src/main.ts:2220-2227`), y el código de salida es el del fallo (`packages/cli/src/main.ts:2228-2243`).
  - El salto ilegal sale con 3 y con el texto de `packages/core/src/transitions.ts:142`, sin salida.
  - Un comando desconocido sale con 2 y con «Comando desconocido: … Use --help…» (`packages/cli/src/main.ts:1564-1568`); el de escritura, en `packages/cli/src/main.ts:1250-1254`.
  - `<cmd> --help` devuelve la ayuda con 0 para cualquier comando (`packages/cli/src/main.ts:1385-1391`). La existencia de un comando no se puede preguntar así: se decide corriendo la salida.
  - Una bandera desconocida se acepta como booleana (`packages/cli/src/main.ts:910-911`).
  - `--version` dice siempre `0.0.1` (`packages/cli/src/main.ts:1384`). La identidad del binario medido es su ruta y su hash, no la versión.
  - Los mensajes citan su salida como `` `valmen <cmd> …` `` entre comillas invertidas, la convención que fija s1 (`.valmen/features/guardas-verificacion-harness/spec/s1-mensajes/spec.md:4-7`).
- Dónde va el cambio. Un directorio nuevo, `bench/friccion/` en la raíz (D3, `.valmen/features/guardas-verificacion-harness/design.md:24-30`), y la configuración raíz que hoy decide qué compila y qué prueba el producto:
  - `tsconfig.json:35`: sin `include`, el `typecheck` de `package.json:20` toma todo `**/*.ts` de la raíz. Lo comprueba `npx tsc --showConfig -p tsconfig.json`, que lista `scripts/` y `tests/helpers/`. Un `bench/` nuevo entraría al typecheck del producto, con sus `paths` hacia `packages/`, si no se excluye.
  - `vitest.config.ts:78`: el `include` de `npm test` (`package.json:17`) solo mira `packages/*/test` y `tests/`. Las pruebas de la medición quedan fuera sin tocarlo.
  - `package.json:16`: `build` compila solo las referencias de `tsconfig.build.json`, que son los paquetes.
  - La CI corre typecheck, lint, formato y pruebas (`.github/workflows/verificacion.yml:42-84`). D3 acepta el costo de agregarle un paso para la medición.
- Hipótesis pendientes:
  - «Sin red» se garantiza por construcción, no con un aislamiento de red del sistema operativo: no hay credenciales en el `HOME` temporal, el entorno no lleva claves y una trampa en `VALMEN_CLAUDE_BIN` y en el `PATH` registra cualquier llamada a un CLI de modelo. Un binario que abra la red sin credenciales no se detecta.
  - Una salida se reconoce solo cuando el mensaje la cita como `` `valmen <cmd> …` ``. Una salida en prosa («commitea los cambios») cuenta como fuera de banda. Se asume coherente con s1; el plan lo confirma.
  - Los marcadores de un comando sugerido (`<ID>`) se resuelven con las variables que declara el recorrido. Uno sin resolver no se puede correr y cuenta como callejón, con su motivo.
  - La referencia `bench/` de gentle-ai (`66bf3e1`) es externa al repositorio y no se leyó en este análisis. El diseño sale de la spec y de D3.
- Consumidores afectados:
  - En tiempo de ejecución, ninguno del producto: la medición no importa `packages/` y nada la importa.
  - En configuración: `npm run typecheck` (`package.json:20`) deja de ver `bench/` por la exclusión en `tsconfig.json:35`. `npm run lint` (`package.json:21`, cuyas `ignores` de `eslint.config.js` no nombran `bench/`) y `npm run format:check` (`.prettierignore` tampoco lo nombra) sí lo revisan. `npm test` no cambia.
  - Sin cambios: `scripts/medir-salida-s1-s3.mjs`, su prueba (`tests/medicion-salida.test.ts:17-18`) y los helpers de `tests/helpers/`.
  - La medición consume `packages/cli/dist/main.js` como caja negra. Un cambio de mensaje del motor cambia su resultado, que es justo lo que se quiere medir.
- Archivos y flujo investigados: la spec s3 (`.valmen/features/guardas-verificacion-harness/spec/s3-friccion/spec.md:11-34`) y D3. Los helpers `tests/helpers/fixtures.ts`, `tests/helpers/ola.ts` y `tests/helpers/worktree-lab.ts`, completos. `scripts/medir-salida-s1-s3.mjs`, completo, y su prueba. En `packages/cli/src/main.ts`: análisis de argumentos (`packages/cli/src/main.ts:874-911`), despacho y ayuda (`packages/cli/src/main.ts:1362-1395`), comando desconocido y borde del proceso (`packages/cli/src/main.ts:2214-2281`). La resolución de `HOME` y de credenciales. `tsconfig.json`, `vitest.config.ts`, `package.json`, `eslint.config.js`, `.prettierignore`, `.gitignore` (ya ignora `dist/`) y la CI. Flujo previsto: `cli run --binary B --out F` → por recorrido, `mkdtemp` → `git init` y armado con B → operación con B → si sale distinto de 0, extraer las salidas citadas → por salida, escenario nuevo, operación, salida y reintento → clase → JSON en F.
- Riesgos y compatibilidad:
  - Que la medición toque el `~/.valmen` o el repositorio reales. Se evita así: cada subproceso corre con `cwd` y `HOME` dentro de un `mkdtemp`, el entorno se arma desde cero y no se corre una salida sugerida que cite una ruta absoluta fuera del escenario. Lo afirma una prueba con un binario falso que registra su `HOME` y su `cwd`.
  - Que una salida sugerida mute el escenario y contamine la siguiente: cada salida se prueba en un escenario recién armado.
  - Que un recorrido se cuelgue: cada subproceso tiene un tiempo máximo.
  - Que se rompa el producto. El `tsconfig` propio, sin `paths`, impide importar `packages/`. La exclusión en `tsconfig.json` impide que un error de tipos de la medición rompa el typecheck del producto.
  - Compatibilidad con binarios viejos: solo se usan `--binary`, el código de salida y el texto. Si un binario viejo redacta distinto el «comando desconocido», la salida igual cuenta como callejón: cambia el motivo, no la clase.
- Impactos de sync, migración, Docker o despliegue: ninguno. Es una herramienta local de desarrollo fuera de `packages/`, sin datos persistidos, sin migraciones, sin contenedores y sin despliegue; la CI solo gana un paso de verificación.

## Plan

- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan).
- Alcance: la medición nueva en `bench/friccion/`, que incluye el ejecutor, el aislamiento, el clasificador, un recorrido de ejemplo (`salto-ilegal`), su CLI `run` y sus pruebas. Además, en la raíz, la exclusión de `bench` en `tsconfig.json` y un paso nuevo en `.github/workflows/verificacion.yml`.
- Exclusiones:
  - Los ocho recorridos del corpus, el listado del corpus, `compare`, el estado «no soportado» y el código de salida distinto de 0 cuando un recorrido no pudo medirse (R-FRI-003 y R-FRI-004) son de FEATURE-BENCH-FRICCION-CORPUS-20261010. En este ticket `run` sale con 0 siempre que escribió el archivo.
  - No se tocan `packages/`, `scripts/medir-salida-s1-s3.mjs`, `tests/helpers/`, `vitest.config.ts` ni `package.json` de la raíz.
  - No se agrega ninguna dependencia: se usan `typescript`, `vitest` y `@types/node`, que ya están en la raíz.
- Decisiones del plan sobre las hipótesis del diagnóstico:
  - «Sin modelo» se garantiza por construcción. El entorno de cada subproceso se arma desde cero (no se hereda), el `HOME` temporal no tiene credenciales, y `VALMEN_CLAUDE_BIN`, junto con una carpeta al frente del `PATH`, apuntan a trampas (`claude`, `codex`, `opencode`, `hermes`) que anotan la llamada y salen con 97. Una trampa anotada deja el recorrido `fallido`. No se aísla la red del sistema operativo, y esa limitación queda escrita en la ayuda de `run`.
  - Una salida es un comando citado entre comillas invertidas que empieza por `valmen `, la forma que fija s1. Una salida en prosa no cuenta, y ese bloqueo queda `fuera_de_banda`.
  - «Destraba» significa que, después de correr la salida con código 0, el reintento sale con 0. El reintento es la misma operación, salvo que el recorrido declare `reintento`.
  - La existencia de un comando se decide corriéndolo, porque `--help` responde 0 para cualquier comando. Que el binario lo rechace como desconocido se reconoce con los textos de `packages/cli/src/main.ts:1250-1254` y `packages/cli/src/main.ts:1564-1568`. Si un binario viejo redacta distinto, la clase no cambia (callejón); solo cambia el motivo.
  - Los marcadores `<X>` se resuelven con `variables` del recorrido. Uno sin resolver no se corre, y ese intento cuenta como callejón con el motivo «marcador sin resolver».
  - `bench` sale del typecheck del producto con la exclusión en `tsconfig.json`. El lint (`npm run lint`) y el formato (`npm run format:check`) sí lo revisan, porque leen código sin compilar el producto.
  - La identidad del binario medido es su ruta real, el sha256 de su archivo de entrada y una `--etiqueta` opcional (por ejemplo, el commit), porque `--version` siempre dice `0.0.1`.
- Pasos ordenados (cada prueba se escribe antes que el código que cubre y se ve fallar primero):
  1. `bench/friccion/tsconfig.json` y `bench/friccion/tsconfig.build.json`, la compilación propia de la medición, sin acceso a `packages/` (C30, C32, C33):
     - Lleva las mismas opciones estrictas que la raíz (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`, `module` y `moduleResolution` en `NodeNext`, `target` `ES2023`), más `types: ["node"]` y `noEmit: true`.
     - Su `include` cubre `src/**/*.ts`, `test/**/*.ts` y `vitest.config.ts`.
     - No lleva `paths` ni `references`, así que un import de `packages/` o de `@valmen/*` no resuelve.
     - `bench/friccion/tsconfig.build.json` lo extiende con `noEmit: false`, `rootDir: "src"`, `outDir: "dist"` e `include` solo de `src/**/*.ts`. La carpeta `dist/` ya la ignora `.gitignore`.
  2. `bench/friccion/vitest.config.ts`: `root: import.meta.dirname`, `include: ["test/**/*.test.ts"]`, `pool: "forks"` (las pruebas cambian `process.chdir` y `process.env.HOME`) y `testTimeout: 120_000`. El `vitest.config.ts` de la raíz no se toca: su `include` (`vitest.config.ts:78`) ya deja fuera `bench/`. (C29, C35)
  3. `tsconfig.json` de la raíz: agregar `"bench"` a `exclude` (`tsconfig.json:35`). Así `npx tsc --showConfig -p tsconfig.json` deja de listar `bench/`, y un error de tipos de la medición no rompe el typecheck del producto. (C28)
  4. `bench/friccion/src/tipos.ts` declara los tipos de datos de la medición y del archivo de resultados (C1, C2, C3):
     - `Recorrido`: `id`, `nombre`, `bloquea`, `armado: PasoDeArmado[]`, `operacion: string[]`, `reintento?`, `variables?` y `rechazoCorrecto?: { motivo }`.
     - `PasoDeArmado`: `{ binario: string[] }`, `{ git: string[] }` o `{ archivo: { ruta, contenido } }`.
     - `Clase`: `"en_banda" | "fuera_de_banda" | "callejon_sin_salida"`.
     - `IntentoDeSalida`: `comando`, `ejecutada`, `motivo`, `codigoSalida` y `codigoReintento`.
     - `Bloqueo`: `codigo`, `mensaje`, `salidas`, `clase`, `motivo` y `rechazoCorrecto`.
     - `ResultadoDeRecorrido`: `estado: "medido" | "fallido"`, `motivo` y `bloqueo: Bloqueo | null`.
     - `ArchivoDeResultados`: `version: 1`, `fecha`, `binario: { ruta, sha256, etiqueta }`, `corpus: { sha256, recorridos }`, `recorridos` y `totales`.
  5. `bench/friccion/src/aislamiento.ts` arma el escenario aislado y corre el binario sin modelo (C5, C6, C7, C8, C9, C13):
     - `crearEscenario()` hace `mkdtemp` en `os.tmpdir()` con las carpetas `home/`, `proyecto/`, `tmp/` y `trampa/`. Corre `git init -q -b main` en `proyecto/` con usuario local y un commit base vacío.
     - Escribe en `trampa/` los scripts `claude`, `codex`, `opencode` y `hermes`, que anotan en `llamadas-a-modelo.log` del escenario y salen con 97.
     - `entornoAislado(escenario)` arma el entorno desde cero, sin copiar `process.env`. Lleva `HOME=<escenario>/home`, `TMPDIR=<escenario>/tmp`, `PATH` con `trampa/` primero y luego las carpetas de `node` (`process.execPath`) y de `git`, `GIT_CONFIG_NOSYSTEM=1`, autor y committer de git, y `VALMEN_CLAUDE_BIN=<escenario>/trampa/claude`.
     - `correrBinario(escenario, binario, argv, timeoutMs)` usa `spawnSync` con `cwd=<escenario>/proyecto`, ese entorno y la entrada vacía. Un binario `.js`, `.mjs` o `.cjs` se lanza con `process.execPath`. Devuelve `status`, `stdout`, `stderr` y `agotado`.
     - `llamadasAModelo(escenario)` lee esa anotación, y `limpiarEscenario(escenario)` borra la carpeta.
  6. `bench/friccion/src/clasificador.ts` reúne las funciones puras de extracción, clasificación y totales, sin disco ni procesos (C15, C16, C17, C18, C19, C20, C21, C22, C25):
     - `extraerSalidas(mensaje)` devuelve cada fragmento entre comillas invertidas que empieza por `valmen `, tokenizado con comillas simples y dobles. Lo que está fuera de comillas invertidas no cuenta.
     - `resolverMarcadores(argv, variables)` reemplaza cada `<X>` por `variables[X]` y devuelve los marcadores que quedaron sin resolver.
     - `fueraDelEscenario(argv, raiz)` señala un token que es una ruta absoluta fuera de la raíz del escenario.
     - `esComandoDesconocido(stderr)` reconoce `Comando desconocido` y `Comando de escritura desconocido`.
     - `clasificar(intentos)` sigue estas reglas: sin intentos, `fuera_de_banda`; un intento ejecutado con `codigoSalida === 0` y `codigoReintento === 0`, `en_banda`; si no, `callejon_sin_salida`, con el motivo del primer intento («no existe», «marcador sin resolver», «fuera del escenario», «la salida falla con N» o «tras la salida la operación sigue bloqueada con N»).
     - `totalizar(resultados)` cuenta `en_banda`, `fuera_de_banda`, `callejon_sin_salida`, `rechazos_correctos` y `fallidos`. Un bloqueo con `rechazoCorrecto` suma solo en `rechazos_correctos`.
  7. `bench/friccion/src/medicion.ts` arma cada recorrido, prueba sus salidas y clasifica (C1, C2, C3, C9, C12, C13, C14, C18, C19, C20, C21, C22, C23, C24, C26):
     - `medirRecorrido(binario, recorrido, timeoutMs)` arma el escenario. Un paso de `armado` que sale distinto de 0 deja el recorrido `fallido`, con el índice y el comando del paso. Después corre `operacion`.
     - Si la operación sale con 0, el recorrido queda `medido` y sin bloqueo.
     - Si no sale con 0, extrae las salidas. Cada una se prueba en un escenario recién armado: armado, operación, salida (con `valmen` reemplazado por el binario medido) y reintento.
     - Una salida con un marcador sin resolver no se corre, y tampoco una con una ruta absoluta fuera del escenario.
     - Una trampa anotada deja el recorrido `fallido` («llamó a un CLI de modelo»), y también un tiempo agotado («tiempo agotado»).
     - Copia `rechazoCorrecto` del recorrido al bloqueo.
     - `medir({ binario, recorridos, timeoutMs, etiqueta })` arma el `ArchivoDeResultados`, con el `sha256` del archivo del binario, el `sha256` de `JSON.stringify(recorridos)` como `corpus.sha256` y los `totales`.
  8. `bench/friccion/src/recorridos.ts`: `RECORRIDOS` con un único recorrido, `salto-ilegal`. Se arma con `valmen create --id FEATURE-FRICCION-SALTO-20261010 …` en `intake` y opera con `valmen transition --id FEATURE-FRICCION-SALTO-20261010 --entity ticket --to approved`. (C27)
  9. `bench/friccion/src/cli.ts` expone el comando `run` (C1, C4):
     - `main(argv): number` atiende `run --binary <ruta> --out <archivo> [--timeout-ms <n>] [--etiqueta <texto>]`, con 30 000 ms por defecto, y `--help`.
     - Sin `--binary`, sin `--out` o con un binario que no existe, sale con 2 sin escribir nada.
     - Si no, escribe el JSON en `--out` e imprime los totales.
     - Una guarda de programa principal (`isMain`) permite importarlo en las pruebas.
  10. Las pruebas en `bench/friccion/test/`, nombradas con su `FR-Cnn` (C1–C31):
      - `bench/friccion/test/binario-falso.ts`: un ayudante que escribe en una carpeta temporal un binario `.mjs` guionado. Anota su `argv`, su `cwd`, su `HOME`, los nombres de sus variables de entorno y `VALMEN_CLAUDE_BIN` en un registro con ruta absoluta fija, y responde según un guion con archivos de estado en su `cwd`.
      - `bench/friccion/test/clasificador.test.ts`: FR-C15 a FR-C22 y FR-C25.
      - `bench/friccion/test/aislamiento.test.ts`, con el binario falso: FR-C04 a FR-C09, FR-C12 a FR-C14, FR-C23, FR-C24 y FR-C26. FR-C07 pone `ANTHROPIC_API_KEY` y `OPENROUTER_API_KEY` en `process.env` antes de medir.
      - `bench/friccion/test/binario-real.test.ts`, con `packages/cli/dist/main.js`: FR-C01, FR-C02, FR-C03, FR-C10 (`process.env.HOME` apunta a una carpeta temporal durante `main`), FR-C11 (`process.chdir` a un repositorio git temporal con un commit) y FR-C27. Si falta el `dist`, la prueba falla con el mensaje «corre npm run build».
      - `bench/friccion/test/fuera-del-producto.test.ts`: FR-C28 (`npx tsc --showConfig -p tsconfig.json`), FR-C29 (`npx vitest list --filesOnly` en la raíz), FR-C30 (busca imports de `packages/` o de `@valmen/` en `bench/friccion/src`) y FR-C31 (lee `.github/workflows/verificacion.yml`).
  11. `.github/workflows/verificacion.yml`: un paso nuevo después de «Pruebas», llamado «La medición de fricción compila y pasa sus pruebas». Corre `npx tsc -p bench/friccion/tsconfig.json`, `npx tsc -p bench/friccion/tsconfig.build.json` y `npx vitest run --config bench/friccion/vitest.config.ts`. Va después del typecheck del producto, que ya construyó `packages/cli/dist/main.js`. (C31)
  12. Verificación con `npx tsc`, `npx vitest run` y `node node_modules/eslint/bin/eslint.js bench/friccion`, desde la raíz del worktree (C32, C33, C34, C35, C36, C37):
      - Requisito previo: `npm run build`.
      - Compilación: `npx tsc -p bench/friccion/tsconfig.json`, `npx tsc -p bench/friccion/tsconfig.build.json` y `npx tsc --build tsconfig.build.json`.
      - Pruebas: `npx vitest run --config bench/friccion/vitest.config.ts` y `npx vitest run tests/medicion-salida.test.ts` (el consumidor existente, sin cambios).
      - Lint y formato: `node node_modules/eslint/bin/eslint.js bench/friccion` y `node node_modules/prettier/bin/prettier.cjs --check bench/friccion`.
      - Secretos: `valmen secrets`.
      - `npx tsc --noEmit -p tsconfig.json` no se usa como criterio: hoy ya da errores en `tests/` (TS7016 y TS2345) ajenos a este ticket. El contrato completo va a `## Pruebas` al implementar.
  13. Validación manual del PO con `node bench/friccion/dist/cli.js run` contra el binario actual y el de un commit anterior, desde la raíz del repositorio (C38, C39):
      - `npx tsc -p bench/friccion/tsconfig.build.json`.
      - `git clone . "$TMPDIR/valmen-anterior"` y `git -C "$TMPDIR/valmen-anterior" checkout HEAD~5`, y dentro de ese clon `npm ci` y `npm run build`.
      - `node bench/friccion/dist/cli.js run --binary "$TMPDIR/valmen-anterior/packages/cli/dist/main.js" --out "$TMPDIR/friccion-anterior.json" --etiqueta HEAD~5`.
      - `node bench/friccion/dist/cli.js run --binary packages/cli/dist/main.js --out "$TMPDIR/friccion-actual.json"`.
      - Se miran el archivo de la corrida anterior (C38) y el `corpus.sha256` de los dos archivos (C39).
- Responsables: la implementación la hace el subagente de la fase (sonnet); la aprobación del plan, la validación manual y la QA, el PO.
- Compatibilidad: no cambia ningún comportamiento del producto. `packages/` no se toca. La exclusión en `tsconfig.json` solo saca archivos que hoy no existen. `npm test` y `npm run build` siguen viendo exactamente lo mismo.
- Impactos declarados: ninguno de sincronización, migración ni contenedores, y sin despliegue. Es una herramienta local de desarrollo; la CI solo gana un paso de verificación.
- Rollback (obligatorio): revertir el commit del ticket en la rama (`git revert <hash>`). Eso borra `bench/friccion/`, devuelve `exclude` de `tsconfig.json` a `["node_modules", "dist", "**/dist"]` y quita el paso de `.github/workflows/verificacion.yml`. No hay datos persistidos ni configuración de la máquina que deshacer. Los archivos de resultados viven donde los puso `--out`, fuera del repositorio.

<!-- Los criterios de la sección siguiente se numeran C1…Cn, con una afirmación verificable por criterio
     —una frase con «y» son dos criterios—, y cada uno lleva debajo su anotación de
     verificación: un comentario HTML que dice «test:» y el comando, o «verify: manual». La
     sección no lleva comentarios dentro: un comentario con anotación se leería como la de un
     criterio. Ejemplo en la skill planificacion. -->
## Criterios de aceptación

- [x] C1 (R-FRI-001): `run --binary <ruta> --out <archivo>` escribe en `<archivo>` un JSON con un resultado por cada recorrido del corpus
      <!-- test: npx vitest run --config bench/friccion/vitest.config.ts -t FR-C01 -->
- [x] C2 (R-FRI-001): el archivo de resultados registra el sha256 del binario medido
      <!-- test: npx vitest run --config bench/friccion/vitest.config.ts -t FR-C02 -->
- [x] C3 (R-FRI-001): dos corridas con el mismo corpus escriben el mismo `corpus.sha256`
      <!-- test: npx vitest run --config bench/friccion/vitest.config.ts -t FR-C03 -->
- [x] C4 (R-FRI-001): `run` sin `--binary` sale con código 2 sin escribir el archivo de resultados
      <!-- test: npx vitest run --config bench/friccion/vitest.config.ts -t FR-C04 -->
- [x] C5 (R-FRI-001): el binario medido corre con un `HOME` dentro del directorio temporal del escenario
      <!-- test: npx vitest run --config bench/friccion/vitest.config.ts -t FR-C05 -->
- [x] C6 (R-FRI-001): el binario medido corre con su directorio de trabajo dentro del directorio temporal del escenario
      <!-- test: npx vitest run --config bench/friccion/vitest.config.ts -t FR-C06 -->
- [x] C7 (R-FRI-001): el entorno del binario medido no lleva variables `*_API_KEY` aunque el proceso que mide las tenga
      <!-- test: npx vitest run --config bench/friccion/vitest.config.ts -t FR-C07 -->
- [x] C8 (R-FRI-001): `VALMEN_CLAUDE_BIN` del binario medido apunta a la trampa del escenario
      <!-- test: npx vitest run --config bench/friccion/vitest.config.ts -t FR-C08 -->
- [x] C9 (R-FRI-001): un binario que invoca `claude` desde el `PATH` deja su recorrido en estado `fallido`
      <!-- test: npx vitest run --config bench/friccion/vitest.config.ts -t FR-C09 -->
- [x] C10 (R-FRI-001): tras una corrida, el `HOME` del proceso que mide sigue sin `.valmen/`
      <!-- test: npx vitest run --config bench/friccion/vitest.config.ts -t FR-C10 -->
- [x] C11 (R-FRI-001): tras una corrida, `git status --porcelain` del repositorio desde el que se mide queda vacío
      <!-- test: npx vitest run --config bench/friccion/vitest.config.ts -t FR-C11 -->
- [x] C12 (R-FRI-001): una salida sugerida que cita una ruta absoluta fuera del escenario no se ejecuta
      <!-- test: npx vitest run --config bench/friccion/vitest.config.ts -t FR-C12 -->
- [x] C13 (R-FRI-001): un subproceso que excede `--timeout-ms` deja su recorrido en estado `fallido`
      <!-- test: npx vitest run --config bench/friccion/vitest.config.ts -t FR-C13 -->
- [x] C14 (R-FRI-001): un recorrido cuyo armado falla queda en estado `fallido` con el paso que falló
      <!-- test: npx vitest run --config bench/friccion/vitest.config.ts -t FR-C14 -->
- [x] C15 (R-FRI-002): `extraerSalidas` devuelve cada comando citado como `` `valmen <cmd> …` `` en el mensaje
      <!-- test: npx vitest run --config bench/friccion/vitest.config.ts -t FR-C15 -->
- [x] C16 (R-FRI-002): `extraerSalidas` ignora un `valmen <cmd>` escrito fuera de comillas invertidas
      <!-- test: npx vitest run --config bench/friccion/vitest.config.ts -t FR-C16 -->
- [x] C17 (R-FRI-002): un bloqueo sin salida citada se clasifica `fuera_de_banda`
      <!-- test: npx vitest run --config bench/friccion/vitest.config.ts -t FR-C17 -->
- [x] C18 (R-FRI-002): un bloqueo se clasifica `en_banda` cuando, tras correr su salida con código 0, el reintento de la operación sale con 0
      <!-- test: npx vitest run --config bench/friccion/vitest.config.ts -t FR-C18 -->
- [x] C19 (R-FRI-002): un bloqueo cuya salida el binario rechaza como comando desconocido se clasifica `callejon_sin_salida`
      <!-- test: npx vitest run --config bench/friccion/vitest.config.ts -t FR-C19 -->
- [x] C20 (R-FRI-002): un bloqueo se clasifica `callejon_sin_salida` cuando, tras correr su salida con código 0, el reintento sigue bloqueado
      <!-- test: npx vitest run --config bench/friccion/vitest.config.ts -t FR-C20 -->
- [x] C21 (R-FRI-002): un bloqueo cuya salida lleva un marcador sin variable en el recorrido se clasifica `callejon_sin_salida`
      <!-- test: npx vitest run --config bench/friccion/vitest.config.ts -t FR-C21 -->
- [x] C22 (R-FRI-002): un marcador `<ID>` de una salida se reemplaza por la variable `ID` del recorrido antes de correrla
      <!-- test: npx vitest run --config bench/friccion/vitest.config.ts -t FR-C22 -->
- [x] C23 (R-FRI-002): cada salida candidata se prueba en un escenario recién armado
      <!-- test: npx vitest run --config bench/friccion/vitest.config.ts -t FR-C23 -->
- [x] C24 (R-FRI-002): el bloqueo de un recorrido con `rechazoCorrecto` lleva ese motivo en el archivo de resultados
      <!-- test: npx vitest run --config bench/friccion/vitest.config.ts -t FR-C24 -->
- [x] C25 (R-FRI-002): un rechazo correcto no suma en los totales de fricción
      <!-- test: npx vitest run --config bench/friccion/vitest.config.ts -t FR-C25 -->
- [x] C26 (R-FRI-002): una operación que sale con 0 deja su recorrido sin bloqueo
      <!-- test: npx vitest run --config bench/friccion/vitest.config.ts -t FR-C26 -->
- [x] C27 (R-FRI-002): con `packages/cli/dist/main.js`, el recorrido `salto-ilegal` se clasifica `fuera_de_banda`
      <!-- test: npx vitest run --config bench/friccion/vitest.config.ts -t FR-C27 -->
- [x] C28 (R-FRI-001): `npx tsc --showConfig -p tsconfig.json` no lista archivos de `bench/`
      <!-- test: npx vitest run --config bench/friccion/vitest.config.ts -t FR-C28 -->
- [x] C29 (R-FRI-001): `npx vitest list --filesOnly` de la raíz no lista archivos de `bench/`
      <!-- test: npx vitest run --config bench/friccion/vitest.config.ts -t FR-C29 -->
- [x] C30 (R-FRI-001): ningún archivo de `bench/friccion/src` importa de `packages/` ni de `@valmen/`
      <!-- test: npx vitest run --config bench/friccion/vitest.config.ts -t FR-C30 -->
- [x] C31 (R-FRI-001): la CI declara un paso que corre `npx vitest run --config bench/friccion/vitest.config.ts`
      <!-- test: npx vitest run --config bench/friccion/vitest.config.ts -t FR-C31 -->
- [x] C32: la medición compila con `bench/friccion/tsconfig.json`
      <!-- test: npx tsc -p bench/friccion/tsconfig.json -->
- [x] C33: el build propio de la medición compila
      <!-- test: npx tsc -p bench/friccion/tsconfig.build.json -->
- [x] C34: el build del producto compila
      <!-- test: npx tsc --build tsconfig.build.json -->
- [x] C35: las pruebas de la medición pasan
      <!-- test: npx vitest run --config bench/friccion/vitest.config.ts -->
- [x] C36: la prueba existente de `scripts/medir-salida-s1-s3.mjs` pasa sin cambios
      <!-- test: npx vitest run tests/medicion-salida.test.ts -->
- [x] C37: el lint pasa sobre `bench/friccion`
      <!-- test: node node_modules/eslint/bin/eslint.js bench/friccion -->
- [ ] C38 (R-FRI-001): con el binario de un commit anterior, `run` escribe su propio archivo de resultados
      <!-- verify: manual -->
- [ ] C39 (R-FRI-001): la corrida del binario anterior registra el mismo `corpus.sha256` que la del binario actual
      <!-- verify: manual -->

## Puntos

```json
[]
```

## Implementación

La medición es nueva y vive en `bench/friccion/`, fuera de `packages/`: no se tocó ningún archivo del producto. Se siguió el plan paso a paso, con cada prueba escrita antes que el código que cubre.

- `bench/friccion/tsconfig.json` y `bench/friccion/tsconfig.build.json`: compilación propia, con las opciones estrictas de la raíz, sin `paths` ni `references`. `bench/friccion/vitest.config.ts`: `root` propio, `pool: "forks"` y `testTimeout: 120_000`.
- `tsconfig.json` (raíz): `"bench"` en `exclude`. `.github/workflows/verificacion.yml`: paso «La medición de fricción compila y pasa sus pruebas», después de «Pruebas».
- `bench/friccion/src/tipos.ts`: tipos de recorrido, bloqueo, resultados y archivo de resultados.
- `bench/friccion/src/aislamiento.ts`: `crearEscenario`, `entornoAislado` (entorno armado desde cero), trampas `claude`, `codex`, `opencode` y `hermes` que anotan y salen con 97, `correrBinario`, `correrGit`, `llamadasAModelo` y `limpiarEscenario`.
- `bench/friccion/src/clasificador.ts`: `extraerSalidas`, `resolverMarcadores`, `fueraDelEscenario`, `esComandoDesconocido`, `clasificar` y `totalizar`, todas puras.
- `bench/friccion/src/medicion.ts`: `medirRecorrido` y `medir`. `bench/friccion/src/recorridos.ts`: `RECORRIDOS` con `salto-ilegal`. `bench/friccion/src/cli.ts`: `main` con el comando `run`, y la guarda `esProgramaPrincipal`.
- Pruebas en `bench/friccion/test/`: `binario-falso.ts` (ayudante), `clasificador.test.ts`, `aislamiento.test.ts`, `binario-real.test.ts` y `fuera-del-producto.test.ts`; 44 pruebas, cada una con su `FR-Cnn`.

Precisiones que el plan dejaba abiertas, todas dentro de su alcance:

- `ResultadoDeRecorrido` lleva además `id` y `nombre`, porque «un resultado por cada recorrido» exige identificarlos. `extraerSalidas` devuelve `{ comando, argv }` y no solo las palabras: el comando citado queda tal cual en el intento.
- `crearEscenario(raizExistente?)` reconstruye el escenario en la misma ruta. Así «un escenario recién armado» para cada salida no cambia las rutas absolutas que cite el mensaje, y la regla de «fuera del escenario» se evalúa contra una sola raíz.
- El mensaje de un bloqueo es `stderr`; si está vacío, `stdout`.
- Un subproceso que no termina con un código (una señal, o no se pudo lanzar) deja el recorrido `fallido`, igual que el tiempo agotado. Un paso `archivo` del armado cuya ruta sale del escenario también lo deja `fallido`: lo cubre una prueba FR-C14.
- Pruebas por encima de una por criterio, todas de una regla pedida: la tokenización de comillas (FR-C15), «basta una salida que destraba» (FR-C18), el reintento declarado por el recorrido (FR-C20) y el paso `archivo` del armado (FR-C14).

Evidencia de la prueba primero: antes del código, `npx vitest run --config bench/friccion/vitest.config.ts` dio 4 archivos fallidos (los módulos `src/` no existían) y, de `fuera-del-producto`, rojas FR-C28, FR-C30 y FR-C31 con FR-C29 verde (regresión del `npm test` existente). Tras escribir `src/` y antes de tocar la raíz, FR-C28 y FR-C31 seguían rojas; pasaron al agregar la exclusión de `tsconfig.json` y el paso de la CI. Se comprobó además que cinco pruebas fallan si se rompe lo que cubren: entorno heredado (FR-C07), `HOME` heredado (FR-C05), escenario no reconstruido (FR-C23), trampas sin vigilar (FR-C09) y rutas fuera del escenario sin mirar (FR-C12). Ninguna prueba que ya existía se puso en rojo ni se editó.

## Pruebas

Directorio de ejecución de todo: la raíz del worktree (`/Users/juanandrade/Desktop/ValmenHarness/.claude/worktrees/ticket-friccion-runner`) o la raíz del repositorio donde se integre la rama. Requisitos de ambiente: Node 22 o superior, `npm ci` hecho y `npm run build` corrido antes (las pruebas de `binario-real` miden `packages/cli/dist/main.js` y fallan con «corre npm run build» si falta); `git` en el equipo; sin red ni credenciales.

- `npm run build` — esperado: sin errores. Resultado: sin errores.
- `npx tsc -p bench/friccion/tsconfig.json` — esperado: sin salida y código 0 (C32). Resultado: código 0.
- `npx tsc -p bench/friccion/tsconfig.build.json` — esperado: sin salida y código 0, y deja `bench/friccion/dist/cli.js` (C33). Resultado: código 0.
- `npx tsc --build tsconfig.build.json` — esperado: sin errores (C34). Resultado: código 0.
- `npx vitest run --config bench/friccion/vitest.config.ts` — esperado: 4 archivos y 44 pruebas verdes (C1 a C31 y C35). Resultado: 44 de 44 verdes.
- `valmen gate qa-mechanical --id FEATURE-BENCH-FRICCION-RUNNER-20261010 --evaluator command` — esperado: APPROVE con los criterios C1 a C37 en 1.00. Resultado: APPROVE, 37 de 37 criterios con comando pasan (recibo en `.valmen/receipts/FEATURE-BENCH-FRICCION-RUNNER-20261010.jsonl`).
- `npx vitest run tests/medicion-salida.test.ts` — esperado: 6 pruebas verdes, sin cambios en el archivo (C36). Resultado: 6 de 6 verdes.
- `node node_modules/eslint/bin/eslint.js bench/friccion` — esperado: sin salida y código 0 (C37). Resultado: código 0. `node node_modules/prettier/bin/prettier.cjs --check bench/friccion` también pasa.
- `valmen secrets` — esperado: «Sin secretos». Resultado: «Sin secretos en 19 archivo(s) con cambios.»
- `npx tsc --noEmit -p tsconfig.json` no se usa como criterio: da 37 errores en `tests/` (TS7016 y TS2345) que ya existían, y ninguno nombra `bench/`.
- La suite completa (`npm test`) no se corrió en esta sesión: la corre el orquestador al integrar. Lo que garantiza que el producto no cambia es FR-C28 (`bench/` fuera del typecheck), FR-C29 (`bench/` fuera de `vitest list` de la raíz), C34 y C36.

Validación manual del responsable (C38 y C39, sin marcar: nadie las probó en esta sesión). Desde la raíz del repositorio, con el binario actual y el de un commit anterior:

1. `npx tsc -p bench/friccion/tsconfig.build.json`
2. `git clone . "$TMPDIR/valmen-anterior"`, luego `git -C "$TMPDIR/valmen-anterior" checkout HEAD~5`, y dentro de ese clon `npm ci` y `npm run build` (necesita red).
3. `node bench/friccion/dist/cli.js run --binary "$TMPDIR/valmen-anterior/packages/cli/dist/main.js" --out "$TMPDIR/friccion-anterior.json" --etiqueta HEAD~5` — esperado: código 0, el archivo existe y trae su propio `binario.sha256` y `binario.etiqueta` igual a `HEAD~5` (C38).
4. `node bench/friccion/dist/cli.js run --binary packages/cli/dist/main.js --out "$TMPDIR/friccion-actual.json"` — esperado: código 0 y el mismo `corpus.sha256` que el archivo anterior (C39): `grep -A1 '"corpus"' "$TMPDIR/friccion-anterior.json" "$TMPDIR/friccion-actual.json"`.

Comprobación hecha en esta sesión, que no sustituye a C38 ni a C39: `node bench/friccion/dist/cli.js run --binary packages/cli/dist/main.js --out <archivo> --etiqueta prueba-manual` salió con 0 y clasificó `salto-ilegal` como `fuera_de_banda` (código 3, sin salida citada); `run` sin `--binary` salió con 2 y no escribió nada.

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
    "model": "claude-sonnet-5-5",
    "reasoning_effort": "high",
    "notes": "Sesión de subagente de implementación (una sesión, un ticket) lanzada por el orquestador. No expone agregado de tokens ni de costo, ni el id de su sesión, por eso va sin números. Dato visible del contador de presupuesto del propio subagente: bajó de 15 000 000 a unos 14 790 000 tokens restantes entre el inicio y esta entrada, sin separar entrada de salida ni caché; es una referencia, no una medición de costo.",
    "input_tokens": null,
    "output_tokens": null,
    "total_tokens": null,
    "estimated_cost_usd": null,
    "source": "manual:subagente-implementacion-friccion-runner",
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
    "at": "2026-10-10T21:47:32.009Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-10",
    "at": "2026-10-10T22:08:16.864Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-10",
    "at": "2026-10-10T22:14:37.978Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-10",
    "at": "2026-10-10T22:19:10.175Z",
    "action": "gate-approved",
    "actor": "cli",
    "details": "Gate plan aprobado por juan andrade (recibo GR-20261010-FEATURE-BENCH-FRICCION-RUNNER-20261010-plan-1, canal cli, decidida 2026-10-10T22:19:10.172Z): Aprobar tal cual (Recomendado)"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-10",
    "at": "2026-10-10T22:19:10.490Z",
    "action": "plan-approved",
    "actor": "cli",
    "details": "{\"actor\":\"juan andrade\",\"source\":\"cli\",\"quote\":\"Aprobar tal cual (Recomendado)\",\"planHash\":\"sha256:6fadf1c9c42531c812472d6170beae7d22b0cf7985aa9640d9811865d0e227b0\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-10",
    "at": "2026-10-10T22:19:10.817Z",
    "action": "plan-approval-verified",
    "actor": "cli",
    "details": "Aprobación del plan vigente: juan andrade (fuente cli), plan sha256:6fadf1c9c42531c812472d6170beae7d22b0cf7985aa9640d9811865d0e227b0."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-10",
    "at": "2026-10-10T22:19:10.817Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-10-10",
    "at": "2026-10-10T22:20:18.682Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-10-10",
    "at": "2026-10-10T22:30:32.680Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-10-10",
    "at": "2026-10-10T22:31:37.740Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  }
]
```
