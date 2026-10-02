---
schema_version: 2
id: FEATURE-GATE-SPECS-REPOSITORIO-20260926
title: Ejecutar specs de interfaz guardadas en el repositorio
type: FEATURE
module: GATE
workflow_status: closed
qa_status: approved
release_status: unreleased
user_visible: false
sync_impact: false
migration_impact: false
docker_impact: false
risk_level: normal
created: 2026-09-26
updated: 2026-10-02
related_ticket: null
target_release: null
released_in: null
---

# FEATURE-GATE-SPECS-REPOSITORIO-20260926

## Solicitud original

Parte del sprint: Declarar, consultar y validar criterios de interfaz desde artefactos del proyecto.
- R-S4-004: El spec vive en el repo, no en la sesión — Lo que entra al gate DEBE ser un test guardado en el repositorio del proyecto,
Depende de: FEATURE-GATE-CRITERIO-PLAYWRIGHT-20260926.
Viene de una feature descompuesta en sprints; su plan completo está en el tickets.yaml de la feature.

## Descripción funcional

- Alcance: la resolución del verbo `playwright` de los criterios en `packages/gate/src/dynamic.ts` —la ruta del spec que viaja del criterio tiene que ser un archivo del repositorio—, el ayudante puro nuevo `packages/gate/src/specs.ts`, el punto de extensión del motor que ya tiene la raíz del proyecto en la mano (`packages/engine/src/gate.ts`), el mismo cambio en la vista de compuertas (`packages/server/src/gates.ts`), la sonda de capacidad del gate de plan que hoy usa el verbo pelado (`packages/engine/src/interfaz.ts`) y su documentación en `docs/03-GATES.md` §5.1sexies. Queda fuera: `verify: dev` y la validación en el ambiente desplegado (R-S4-005, ticket hermano FEATURE-GATE-VERIFY-DEV-20260926), la declaración por proyecto de un directorio de specs —el requisito no la pide y el spec se acepta en cualquier ruta del repositorio— y el MCP interactivo de Playwright, que el requisito permite para explorar y grabar pero no admite como fuente de la evidencia del gate.
- Usuario o rol afectado: quien escribe los criterios de interfaz de un ticket que toca una pantalla —hoy el agente y el PO en SaiOpenCloud— y quien audita después el recibo: con el requisito implementado, el recibo prueba la corrida de un archivo del repositorio y no la de un artefacto que solo existió en la sesión del agente.
- Comportamiento actual: el verbo ya existe y resuelve su programa contra la sección `playwright:` del proyecto, pero del criterio toma la ruta del spec **sin comprobarla**: una ruta absoluta, una que sale del repositorio con `..`, una que no existe o la ausencia de ruta arman el mismo check y llegan igual a `execFileSync` con el directorio de trabajo en la raíz. Lo único que se comprueba es el **programa** —por el mecanismo de prefijos de `test-commands`—, nunca sus argumentos; el requisito R-S4-004 queda sin implementar en su primera mitad.
- Comportamiento esperado: un criterio con el verbo `playwright` entra al gate solo si declara la ruta de un archivo regular del repositorio, relativa y canónica, y que exista; si falta la ruta, si la ruta no existe, si es absoluta o si sale del repositorio, el criterio se rechaza sin correr nada y el motivo nombra la ruta y la regla. Lo mismo vale para el argumento con forma de spec de un criterio que escriba el comando completo de la sección. La comprobación es código y no consulta a ningún modelo, y la evidencia del recibo sigue saliendo de la corrida del archivo.

## Diagnóstico

- Archivos y flujo investigados: la resolución del verbo vive en `packages/gate/src/dynamic.ts:244-262` —el check se arma con `command: declarado[0]` y `args: [...declarado.slice(1), "--project", playwright.project, ...partes.slice(1)]`, así que las piezas del criterio viajan tal cual— y su autorización en `:228-237` con el ayudante `autorizado` en `:316-322`, que compara **solo el programa** contra los prefijos completos. La declaración de la sección la lee `packages/engine/src/discovery.ts:162` (`playwrightConfig`) y `packages/engine/src/gate.ts:137-142` (`testCommands`) agrega el comando de esa sección a los prefijos autorizados. El motor arma los checks en `packages/engine/src/gate.ts:340-346`, con `paths.root` en scope y sin pasarlo a la resolución, y traduce el rechazo en `:348-360` (`EXIT_INVARIANT`, sin llamada a ningún evaluador). La corrida está en `packages/gate-command/src/command.ts:187-259` —`execFileSync` con `cwd` en la raíz en `:198-205`, código de salida y salida capturada— y la evidencia en `:138-184` (`listArtifacts`, con el filtro de archivos posteriores al arranque en `:242-245`). La vista pinta lo mismo con otra llamada, `packages/server/src/gates.ts:296-302`, y la sonda de capacidad del gate de plan pasa el verbo **pelado** en `packages/engine/src/interfaz.ts:76-82`. La regla que este requisito pide ya está escrita en el proyecto para otros dos artefactos: `packages/engine/src/append.ts:70-99` (`validateFunctionalFile` exige ruta relativa y canónica para los archivos de un punto) y `packages/engine/src/references.ts:151-156` (un archivo que git no conoce no describe un estado reproducible).
- Causa raíz o hipótesis: el hueco tiene una sola causa y está en la resolución del verbo: **del criterio se toma el programa bien y los argumentos sin mirar**. `packages/gate/src/dynamic.ts:251-256` copia `...partes.slice(1)` dentro de `args` sin resolverlo contra la raíz del proyecto, y el control que existe —el mecanismo de prefijos— solo alcanza al programa (`:316-322` compara las piezas del prefijo contra las primeras del comando). Por eso lo que entra al gate no tiene por qué ser un test del repositorio: alcanza con que la ruta exista donde el proceso la vea —el `cwd` es la raíz del proyecto, `packages/gate-command/src/command.ts:199`, así que una ruta absoluta o con `..` sale del árbol sin que nada lo diga— y con que Playwright la encuentre, y el recibo guarda la invocación y los artefactos como si fuera una prueba reproducible por cualquiera. La segunda mitad del requisito —la evidencia sale de la ejecución del archivo, no de la sesión del agente— **ya está implementada** por el ticket del que este depende: el recibo referencia lo que la corrida dejó y descarta lo anterior a su arranque (`packages/gate-command/src/command.ts:138-184` y `:242-245`), así que lo que falta es atar el archivo a un repositorio.
- Riesgos y compatibilidad: (a) la sonda de capacidad de `packages/engine/src/interfaz.ts:76-82` pasa el verbo pelado para decidir si el proyecto tiene la capacidad; si el verbo pasa a exigir la ruta del spec y la sonda no cambia, la capacidad se apaga, la proposición `recomendacion_playwright` desaparece de todos los planes y se rompe R-S4-002 en silencio: la sonda se resuelve contra la declaración de la sección —misma respuesta que hoy— en vez de contra el verbo. (b) El rechazo del verbo comparte el canal `refused` con el del comando no autorizado y el motor lo encabeza con «El proyecto no autoriza este comando» (`packages/engine/src/gate.ts:350`): con un spec que falta esa frase sería falsa, así que el encabezado pasa a nombrar las dos reglas, y las pruebas que afirman el texto viejo (`tests/gate-playwright.test.ts:152`) se actualizan en este mismo ticket. (c) Las pruebas que hoy llaman a `commandChecksFor` sin repositorio y con un spec que no escriben —`tests/gate-playwright.test.ts:119-133` y `tests/config-playwright.test.ts:305-330`— cambian de contrato: pasan a declarar el repositorio y el archivo, porque lo que afirman es exactamente la resolución que este ticket endurece. (d) La comprobación es de forma y existencia, no de contenido: un spec que existe y no prueba lo que el criterio afirma sigue siendo responsabilidad de quien lo escribe, y eso no lo puede decidir el código. (e) No cambia la configuración del proyecto, ni el formato del recibo, ni `receiptVersion`.
- Impactos de sync, migración, Docker o despliegue: ninguno. El cambio vive en la compuerta mecánica del harness —la resolución de un criterio en `packages/gate` y su uso en `packages/engine`— más su documentación: no sincroniza datos a ningún cliente, no migra ningún esquema, no cambia ninguna imagen y no toca el despliegue de un proyecto adoptado.

## Plan

- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan).
- Aprobación delegada: la aprueba esta sesión en nombre del PO por la autorización vigente del 2026-10-01 —«Si termina el ciclo QA y hacemos los commit y push para dejar todo listo para en la noche programar otro ciclo con otros tickets» (Juan Andrade, Telegram 2026-10-01)—. El recibo `GR-20261002-plan` no se registró con `gate-decide` porque la compuerta volvió `APPROVE` y el motor rechaza una decisión humana sobre un recibo que no fue escalado («El recibo GR-20261002-plan no fue escalado a una persona y no admite una decisión humana»): la aprobación delegada queda en esta línea. El alcance de esa autorización es analizar, planear, implementar, verificar y cerrar este ticket, aprobando las compuertas `analysis` y `plan` y el QA; no autoriza commit, push, PR, tag ni despliegue.
- Decisiones:
  1. **El spec se resuelve contra la raíz del repositorio en el mismo sitio donde hoy se resuelve el programa**: `commandChecksFor` (`packages/gate/src/dynamic.ts:195-279`) recibe el repositorio (la raíz y un predicado de archivo) y rechaza el criterio cuando la ruta no es un archivo relativo y canónico del repositorio. Alternativa descartada: comprobar la existencia dentro del corredor (`packages/gate-command/src/command.ts:187-259`), que ya recibe la raíz —coste: el rechazo llegaría después de armar el check, el canal `refused` (`packages/gate/src/dynamic.ts:213`) no existiría para este caso y la vista seguiría mostrando como corrido un criterio que no se puede correr—.
  2. **La forma y la existencia se separan en dos piezas, y el paquete del gate sigue sin tocar el disco.** `packages/gate/src/specs.ts` calcula la forma —relativa, canónica, sin `..`, dentro de la raíz— y el motor le pasa la raíz más un predicado que dice si la ruta es un archivo regular (`packages/engine/src/discovery.ts` es quien lee el disco hoy). Alternativa descartada: importar `node:fs` en el paquete del gate —coste: la resolución dejaría de ser una función pura y dos llamadores con distinta raíz podrían producir checks distintos para el mismo criterio—.
  3. **La sonda de capacidad del gate de plan se resuelve contra la declaración de la sección y no contra el verbo.** Hoy pasa el verbo pelado (`packages/engine/src/interfaz.ts:76-82`); con el verbo exigiendo la ruta del spec esa sonda devolvería «sin capacidad» y la proposición `recomendacion_playwright` desaparecería de todos los planes. Alternativa descartada: dejar la sonda como está —coste: R-S4-002 se rompería en silencio, sin que ninguna prueba lo diga—; la sonda nueva da la misma respuesta que hoy (la sección existe y su comando no está vacío) sin depender de una ruta.
  4. **El criterio que escribe el comando completo de la sección también se comprueba, en la parte que nombra un spec.** Es la otra puerta por la que un spec entra al gate —`test-commands` autoriza el comando de la sección (`packages/engine/src/gate.ts:137-142`)—, así que los argumentos con forma de spec (`.spec.ts`, `.spec.js`, `.spec.tsx`, `.spec.mjs`) tienen que existir como archivo del repositorio. Alternativa descartada: validar todos los argumentos posicionales —coste: Playwright admite un filtro por título como argumento y el gate rechazaría un comando legítimo—.
  5. **El encabezado del rechazo en el motor deja de decir «El proyecto no autoriza este comando»** (`packages/engine/src/gate.ts:350`) y nombra las dos reglas: el comando tiene que estar autorizado y, con el verbo, el spec tiene que ser un archivo del repositorio. Alternativa descartada: dejar el texto —coste: una salida de compuerta que afirma algo falso sobre un criterio rechazado por otra razón, y eso es lo que la persona audita—.
- Pasos ordenados:
  1. `packages/gate/src/specs.ts` — el módulo nuevo: `RepositorioDeSpecs { root, esArchivo }` y `specDelRepositorio(ruta, repo)`, que devuelve la ruta canónica o el motivo del rechazo (sin ruta, absoluta, no canónica, fuera del repositorio, inexistente).
  2. `packages/gate/src/dynamic.ts` — `commandChecksFor` recibe el repositorio: en la rama del verbo (`:244-262`) la ruta del spec tiene que resolver, y sin ruta, sin repositorio, sin archivo o fuera del árbol el criterio va a `refused` con el motivo; en la rama del prefijo autorizado (`:228-237`), cuando el comando empieza con el comando declarado por la sección, los argumentos con forma de spec se comprueban igual.
  3. `packages/engine/src/gate.ts` — el motor arma el repositorio con `paths.root` y el predicado de archivo regular, lo pasa en `:340-346`, y el encabezado del rechazo (`:348-360`) pasa a nombrar las dos reglas.
  4. `packages/engine/src/interfaz.ts` — la sonda de capacidad se resuelve contra la declaración de la sección (`:74-82`) en vez del verbo pelado.
  5. `packages/server/src/gates.ts` — la vista de compuertas pasa el mismo repositorio (`:296-302`), para que los checks que muestra sean los que corre el motor.
  6. `tests/gate-playwright-specs-repo.test.ts` — el archivo enfocado del ticket: el spec que existe arma el check, la compuerta lo corre y aprueba; sin ruta, sin archivo, con ruta absoluta o fuera del árbol, y sin repositorio declarado, el criterio se rechaza sin correr nada; el comando completo con un spec inexistente también; el rechazo sale con el código del invariante y sin recibo; y la documentación declara la regla.
  7. `tests/gate-playwright.test.ts` y `tests/config-playwright.test.ts` — las pruebas que afirman el contrato viejo declaran el repositorio, escriben el archivo del spec y actualizan el texto del rechazo (`tests/gate-playwright.test.ts:119-133`, `:141-156` y `tests/config-playwright.test.ts:305-330`).
  8. `docs/03-GATES.md` §5.1sexies — la regla del spec en el repositorio: qué se comprueba, qué se rechaza y por qué la evidencia sale de la ejecución del archivo y no de la sesión del agente.
  9. Correr la verificación de cierre sobre el árbol del ticket: el archivo enfocado, la batería completa del monorepo (`npx vitest run`) y el typecheck (`npm run typecheck`), con la línea base anotada en `## Pruebas`.
- Rollback: revertir el commit del ticket devuelve la conducta anterior —`commandChecksFor` sin repositorio vuelve a aceptar cualquier ruta—; no hay cambio de configuración, de esquema, de dependencias ni de formato del recibo.

## Criterios de aceptación

- [x] Un criterio con el verbo playwright cuyo spec existe en el repositorio arma el check, la compuerta corre el archivo y aprueba
      <!-- test: npx vitest run tests/gate-playwright-specs-repo.test.ts -->
- [x] El verbo playwright sin la ruta del spec se rechaza sin correr nada, con el motivo que pide un archivo del repositorio
      <!-- test: npx vitest run tests/gate-playwright-specs-repo.test.ts -->
- [x] El verbo playwright con una ruta que no existe en el repositorio se rechaza sin correr nada, con el motivo que nombra la ruta
      <!-- test: npx vitest run tests/gate-playwright-specs-repo.test.ts -->
- [x] El verbo playwright con una ruta absoluta o que sale del repositorio se rechaza sin correr nada
      <!-- test: npx vitest run tests/gate-playwright-specs-repo.test.ts -->
- [x] El verbo playwright sin repositorio declarado se rechaza: la compuerta no puede afirmar que el spec vive en el repositorio
      <!-- test: npx vitest run tests/gate-playwright-specs-repo.test.ts -->
- [x] Un criterio que escribe el comando de la sección playwright con un spec inexistente se rechaza sin correr nada
      <!-- test: npx vitest run tests/gate-playwright-specs-repo.test.ts -->
- [x] El rechazo del spec ocurre sin gastar una llamada a un modelo y sin emitir recibo, con el código del invariante
      <!-- test: npx vitest run tests/gate-playwright-specs-repo.test.ts -->
- [x] La documentación de las compuertas declara que el spec tiene que ser un archivo del repositorio
      <!-- test: npx vitest run tests/gate-playwright-specs-repo.test.ts -->
- [x] La batería completa del monorepo sigue verde tras el cambio, con el typecheck incluido
      <!-- verify: manual -->


## Puntos

```json
[]
```

## Implementación

Lo implementado, paso por paso contra el plan:

1. `packages/gate/src/specs.ts` — módulo nuevo: `RepositorioDeSpecs { root, esArchivo }` y `specDelRepositorio(ruta, repo)`, que devuelve la ruta canónica o el motivo. Rechaza la ruta ausente o vacía, la absoluta (POSIX, win32 y con letra de unidad), la que se declara sin repositorio, la que sale del árbol por `..`, la no canónica —segmentos vacíos, `.`, `..`, barra invertida, byte nulo, o una ruta que no vuelve igual al normalizarla— y la que no es un archivo regular. No toca el disco: la existencia la responde el predicado que le pasa el llamador.
2. `packages/gate/src/dynamic.ts` — `commandChecksFor` recibe un quinto parámetro `repositorio`. En la rama del verbo, la ruta del spec se resuelve con `specDelRepositorio` y solo se arma el check si resuelve; sin ruta, sin archivo, fuera del árbol o sin repositorio, el criterio va a `refused` con el motivo. Un criterio que empieza con el verbo ya no entra por la rama del prefijo autorizado aunque el proyecto autorice `playwright` pelado: la autorización del programa no puede saltarse la comprobación de su ruta. En la rama del comando completo, cuando el comando coincide con el de la sección, los argumentos con forma de spec (`.spec.ts`, `.spec.js`, `.spec.tsx`, `.spec.mjs`) se resuelven igual y los filtros por título quedan intactos.
3. `packages/engine/src/gate.ts` — el motor arma el repositorio con `paths.root` y un predicado de archivo regular sobre `statSync` y lo pasa al armar los checks; el encabezado del rechazo pasa a decir «Criterios rechazados: el comando debe estar autorizado y el spec de Playwright debe ser un archivo del repositorio» y cierra declarando que no se ejecutó ningún comando ni se llamó al evaluador.
4. `packages/engine/src/interfaz.ts` — la sonda de capacidad del gate de plan se resuelve contra la declaración de la sección (`playwright !== null && command` no vacío) en vez de pasar el verbo pelado, así que la pregunta `recomendacion_playwright` sigue desplegándose sin depender de una ruta de spec.
5. `packages/server/src/gates.ts` — la vista de compuertas pasa el mismo repositorio, de modo que los checks y el `hasCommandChecks` que muestra la pantalla son los que corre el motor.
6. `tests/gate-playwright-specs-repo.test.ts` — archivo nuevo, 25 pruebas: el spec que existe arma el check, la compuerta corre el archivo y el recibo guarda su salida; ocho casos de rechazo (sin ruta, inexistente, absoluta POSIX, absoluta Windows, fuera del árbol, no canónica, directorio y comando completo inexistente) con código de invariante, sin comando corrido, sin evaluador y sin recibo; sin repositorio declarado no se arma el check aunque el archivo exista; un criterio inválido impide correr los válidos del mismo ticket; la forma se rechaza antes de consultar el disco; el comando completo conserva sus argumentos; y la documentación declara la regla.
7. `tests/gate-playwright.test.ts` y `tests/config-playwright.test.ts` — las pruebas del contrato anterior declaran el repositorio y escriben el spec del fixture, y la expectativa del rechazo pasa a nombrar la sección `playwright:`.
8. `docs/03-GATES.md` §5.1sexies — la regla del spec en el repositorio: qué se comprueba, qué se rechaza, y que la evidencia sale de la ejecución del archivo y no de la sesión del agente.
9. Verificación de cierre: archivo enfocado, batería completa y typecheck, con el resultado en `## Pruebas`.

Desvíos del plan y límites declarados:

- Desvío 1: el encabezado del rechazo en `packages/engine/src/gate.ts` no se reescribió de cero. Nombra las dos reglas —autorización del comando y spec del repositorio— y conserva la frase «no autoriza» dentro de la indicación de qué revisar, para no tocar `tests/gate-mecanico.test.ts`, que la afirma (`:179` y `:192`) y pertenece a un ticket ya cerrado. La frase se lee ahora como condición —«Si el proyecto no autoriza el comando, revise el prefijo…»— y no como explicación del rechazo.
- Desvío 2: el argumento del verbo que sigue al spec viaja tal cual (`partes.slice(2)`); solo se resuelve la ruta declarada. Un juego de argumentos que nombre un segundo spec no se comprueba, y se declara en vez de dejarlo para que se descubra.
- Límite 1: la comprobación es de forma y existencia. No valida el contenido del spec, ni que git lo siga, ni el destino de un enlace simbólico: un spec que existe y no prueba lo que el criterio afirma sigue siendo responsabilidad de quien lo escribe.
- Límite 2: un criterio que escribe un comando que **contiene** el de la sección pero no empieza con él no hereda la comprobación de sus argumentos: el mecanismo de prefijos compara por palabra completa desde el principio, y heredarla por coincidencia parcial sería adivinar.
- Límite 3: la referencia de evidencia se calcula sobre nueve archivos del cambio, y tres de ellos —`packages/gate/src/specs.ts`, `packages/engine/src/interfaz.ts` y `tests/config-playwright.test.ts`— todavía no están versionados en git, así que la referencia describe el árbol de trabajo y no un commit; el hash del motor, que exige archivos versionados, no se puede calcular todavía y así queda declarado.
- Sin contrato en rojo: los archivos que el cambio toca —`packages/gate/src/dynamic.ts`, `packages/engine/src/gate.ts`, `packages/server/src/gates.ts` y `docs/03-GATES.md`— llevan también cambios sin commitear de los eslabones hermanos de esta tanda, así que apartarlos con `git stash` habría puesto **su** trabajo en riesgo. La conducta anterior queda documentada en el diagnóstico y afirmada por las pruebas nuevas, que solo pasan con la resolución del repositorio.
- Quién escribió qué: el código y las pruebas los escribió la sesión de OpenCode del ticket (una corrida, `ses_…` en `## Consumo de IA`); esta sesión revisó el diff y corrió por su cuenta el archivo enfocado, la batería completa y el typecheck, y no editó ningún archivo de código.

## Pruebas

- `npx vitest run tests/gate-playwright-specs-repo.test.ts` → **25 pruebas, 25 pasadas, 0 fallos** (corrida propia de esta sesión, sobre este estado del árbol).
- `npx vitest run` (batería completa del monorepo) → **102 archivos pasados, 1 omitido; 1807 pruebas pasadas, 48 omitidas, 0 fallos**. La línea base del mismo árbol antes del cambio era 101 archivos y 1782 pruebas pasadas, así que la diferencia son exactamente las 25 pruebas nuevas.
- `npm run typecheck` (`npm run build && tsc --noEmit -p tsconfig.json`) → exit 0, sin errores.
- Contrato de pruebas para el responsable: no hay nada que ejecutar a mano. Lo que se prueba en la aplicación es que un criterio de interfaz que nombre con el verbo un spec que no es un archivo del repositorio quede rechazado —la pantalla lo muestra sin checks y la compuerta sale con el código del invariante— y que uno que sí lo sea corra el archivo y deje su salida en el recibo.
- Los ocho criterios por comando se marcaron con el recibo `GR-20261002-qa-mechanical` de la compuerta mecánica (`--evaluator command`, $0, sin modelo), que corrió el archivo enfocado ocho veces con salida 0 en cada corrida. El estado que ese recibo congeló es el del mismo código y los mismos criterios, sin la casilla marcada: marcarlas después es lo que el contrato pide —el recibo decide primero—, y esta línea lo declara en vez de dejarlo como una diferencia silenciosa entre el hash del recibo y el ticket.
- El criterio `verify: manual` (la batería completa del monorepo con el typecheck) se marca con la corrida propia de esta sesión, que es la que la delegación de abajo pone a cargo del QA de este ticket; no es una marca heredada de nadie.
- Resultado del PO: **aprobación DELEGADA**, no palabras suyas sobre esta prueba. La autorización vigente es la del 2026-10-01 —«Si termina el ciclo QA y hacemos los commit y push para dejar todo listo para en la noche programar otro ciclo con otros tickets» (Juan Andrade, Telegram 2026-10-01)—, que delegó en esta sesión correr y cerrar el QA de este ticket; el ciclo lo corrió y lo aprobó esta sesión en su nombre, con el archivo enfocado 25 de 25, la batería completa 1807 pruebas en verde y 0 fallos, y el typecheck sin errores. La autorización NO cubre commit, push, PR, tag ni despliegue.

### Notas de la sesión que cerró el ticket

- El ciclo QA se abrió con `qa-start --build-reference worktree:sha256:3db463e5e91df67f82799832fc49748020063c70935d467853f1f4882b0f1c30`, que es el hash del contenido de los nueve archivos del cambio en orden alfabético, con la misma fórmula que el motor (verificada contra él sobre el mismo par de archivos). No pudo usarse `commit:<sha>`: no hay commit de este trabajo y la autorización no lo permite.
- La compuerta mecánica se corrió dos veces con `--evaluator command` (`GR-20261002-qa-mechanical`): la segunda después de marcar los criterios, porque el motor exige que el recibo corresponda al estado que se entrega y el `in_progress → in_qa` directo no existe en su tabla —el camino es `awaiting_user_tests → in_qa`, y ahí el recibo tiene que coincidir con el ticket—. Las dos veces aprobó con las ocho proposiciones en 1,00 y sin gastar un modelo.
- Hallazgo de harness, ya conocido en el proyecto como AP-001 y que vuelve a aparecer: el guardado de la foto de consumo rechaza un modelo vacío, y la sesión de Codex que el lector de la línea de tiempo atribuye a este ticket —una sesión compartida de 1427 intervenciones que no trabajó este ticket— no declara modelo, así que el intento de cierre falló con «model no puede estar vacío» antes de anotar nada (el ticket quedó intacto y se reintentó). Se resolvió registrándola a mano como `CONSUMO-003`, sin números y con el motivo escrito; el bloque queda con tres entradas y la entrada de Codex no declara coste ni tokens porque su costo no es de este ticket.
- El modelo del ejecutor no quedó registrado en su propia sesión (`session_v2.model` es nulo) y el lector de la línea de tiempo resuelve ahí un modelo de utilidad —`openrouter/unbiased/pareto-26.10-preview`, el que opencode usa para títulos— por su respaldo a nivel de mensaje. `CONSUMO-001` declara el modelo del perfil del proyecto (`opencode-go/deepseek-v4.1-flash`), que es el que registran las sesiones hermanas de esta tanda, y el desvío se declara acá en vez de taparse: el número que importa —coste y tokens— coincide entre la lectura del lector del harness y `opencode session export`.
- La sesión de trabajo de este ticket es la del job `a7eaf80bd769` (`cron_a7eaf80bd769_20261002_050043`): una sesión por ticket, para que su costo sea un dato.

## QA

```json
[
  {
    "id": "QA-001",
    "date": "2026-10-02",
    "build_reference": "worktree:sha256:3db463e5e91df67f82799832fc49748020063c70935d467853f1f4882b0f1c30",
    "environment": "local: arbol de trabajo del harness",
    "result": "pending",
    "findings": [],
    "correction": null,
    "po_confirmation": null
  },
  {
    "id": "QA-002",
    "date": "2026-10-02",
    "build_reference": null,
    "environment": null,
    "result": "approved",
    "findings": [],
    "correction": null,
    "po_confirmation": "Aprobacion DELEGADA del 2026-10-01: «Si termina el ciclo QA y hacemos los commit y push para dejar todo listo para en la noche programar otro ciclo con otros tickets» (Juan Andrade, Telegram 2026-10-01) — el QA de este ticket lo corrio y lo aprobo esta sesion en su nombre, no son palabras suyas sobre esta prueba. Archivo enfocado 25 de 25, bateria completa del monorepo 1807 pruebas en verde y 0 fallos, typecheck sin errores. La autorizacion no cubre commit, push, PR, tag ni despliegue."
  }
]
```

## Evidencia

```json
[
  {
    "id": "EVIDENCE-001",
    "date": "2026-10-02",
    "kind": "verification",
    "description": "Spec del repositorio en la compuerta mecanica: la ruta del spec del verbo playwright se resuelve contra la raiz del proyecto (forma canonica, dentro del arbol y archivo regular existente) y el criterio se rechaza sin correr nada y sin llamar a un modelo cuando no resuelve; el comando completo de la seccion comprueba sus argumentos con forma de spec. El hash cubre los nueve archivos del cambio en orden alfabetico: docs/03-GATES.md, packages/engine/src/gate.ts, packages/engine/src/interfaz.ts, packages/gate/src/dynamic.ts, packages/gate/src/specs.ts, packages/server/src/gates.ts, tests/config-playwright.test.ts, tests/gate-playwright.test.ts y tests/gate-playwright-specs-repo.test.ts (los tres ultimos de esa lista, y specs.ts e interfaz.ts, todavia sin versionar en git: la referencia describe el arbol de trabajo y no un commit). Verificado por esta sesion: archivo enfocado 25 de 25, bateria completa 1807 pasadas sin fallos sobre linea base de 1782, typecheck sin errores, y la implementacion del hash de esta sesion contrastada contra la del motor sobre el mismo par de archivos (mismo sha256). Codigo y pruebas escritos por la sesion de OpenCode del ticket.",
    "reference": "worktree:sha256:3db463e5e91df67f82799832fc49748020063c70935d467853f1f4882b0f1c30",
    "point_id": null
  }
]
```

## Retests

```json
[]
```

## Cierre

```json
[
  {
    "kind": "ticket-close",
    "id": "CLOSE-001",
    "date": "2026-10-02",
    "technical_summary": "El verbo playwright resuelve la ruta de su spec contra la raiz del proyecto con el modulo puro nuevo packages/gate/src/specs.ts: la ruta tiene que ser relativa, canonica, dentro del arbol y un archivo regular existente; si no resuelve, el criterio va a refused con el motivo, el motor sale con el codigo del invariante sin correr un comando ni llamar a un modelo y no emite recibo. El comando completo de la seccion tambien comprueba sus argumentos con forma de spec. La sonda de capacidad del gate de plan se desacopla del verbo pelado y la vista de compuertas pasa el mismo repositorio que el motor. 25 pruebas nuevas en tests/gate-playwright-specs-repo.test.ts; bateria completa 1807 pruebas sin fallos sobre la linea base de 1782 y typecheck sin errores.",
    "functional_summary": "Un criterio de interfaz que declara su spec con el verbo playwright entra al gate solo si el archivo es un archivo del repositorio del proyecto: un spec que no existe, una ruta absoluta o una que sale del arbol quedan rechazados antes de correr nada y con el motivo a la vista, de modo que el recibo prueba la corrida de un archivo reproducible por cualquiera y no de un artefacto que solo existio en la sesion del agente.",
    "qa_status": "approved",
    "qa_waiver_reason": null,
    "po_confirmation": null,
    "release_impact": "unreleased: cambio del motor del harness, sin efecto sobre ningun proyecto adoptado mas alla de la compuerta; queda sin publicar hasta que entre en una version."
  }
]
```

## Consumo de IA

```json
[
  {
    "kind": "ai-usage",
    "date": "2026-10-02",
    "session_reference": "ses_f03ebef33ffe8JZ0QlaCJSxeBb",
    "model": "opencode-go/deepseek-v4.1-flash",
    "reasoning_effort": null,
    "notes": "Ejecutor OpenCode del ticket, una corrida: implemento el spec del repositorio (modulo nuevo packages/gate/src/specs.ts, resolucion en commandChecksFor, motor y vista), escribio las pruebas nuevas y adapto las del contrato anterior; archivo enfocado 25/25, bateria completa 1807 sin fallos y typecheck sin errores, sin commit ni push. Numeros leidos con opencode session export sobre la misma base que lista opencode session list, con la corrida ya terminada.",
    "input_tokens": 185670,
    "output_tokens": 12492,
    "total_tokens": 198162,
    "estimated_cost_usd": 0.272047,
    "source": "opencode:/Users/juanandrade/.local/share/opencode/opencode.db",
    "confidence": "high",
    "id": "CONSUMO-001"
  },
  {
    "kind": "ai-usage",
    "date": "2026-10-02",
    "session_reference": "cron_a7eaf80bd769_20261002_050043",
    "model": "opencode-go/deepseek-v4.1-flash",
    "reasoning_effort": null,
    "notes": "Sesion de este eslabon (job a7eaf80bd769), una sesion por ticket: diagnostico y plan con sus compuertas, aprobacion delegada, despacho del ejecutor OpenCode, verificacion propia de la suite y del typecheck, evidencia, compuerta mecanica y QA delegado. Lectura hecha al momento de registrar el consumo, con el turno todavia en curso: la fila de la sesion sigue creciendo hasta que el turno termina, asi que estos numeros son un piso y no la medicion final (desvio declarado). El proveedor factura por suscripcion, asi que no se declara costo: la fila informa 0.0 y escribirlo como cero se leeria como gratis.",
    "input_tokens": 236327,
    "output_tokens": 68842,
    "total_tokens": 349798,
    "estimated_cost_usd": null,
    "source": "hermes:/Users/juanandrade/.hermes/profiles/valmen-harness/state.db",
    "confidence": "high",
    "id": "CONSUMO-002"
  },
  {
    "kind": "ai-usage",
    "date": "2026-10-02",
    "session_reference": "01a0f8a2-aabe-7542-8be9-2888dc93415b",
    "model": null,
    "reasoning_effort": null,
    "notes": "Sesion de Codex que el lector de la linea de tiempo atribuye a este ticket porque menciona su identificador, no porque lo haya trabajado: es una sesion compartida y enorme (1427 intervenciones) cuyo costo no es de este ticket, asi que se declara SIN numeros. Se registra a mano porque el lector no sabe registrarla —Codex no declara modelo y el guardado de la foto rechaza un modelo vacio (hallazgo AP-001 del proyecto, que vuelve a aparecer)—: sin esta entrada el intento de cierre falla con 'model no puede estar vacio'. Codex factura por suscripcion: no hay coste por token que declarar.",
    "input_tokens": null,
    "output_tokens": null,
    "total_tokens": null,
    "estimated_cost_usd": null,
    "source": "codex:01a0f8a2-aabe-7542-8be9-2888dc93415b",
    "confidence": "medium",
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
    "date": "2026-09-26",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-02",
    "at": "2026-10-02T10:04:03.179Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-02",
    "at": "2026-10-02T10:04:33.239Z",
    "action": "gate-approved",
    "actor": "cli",
    "details": "Gate analysis aprobado por Juan Andrade (delegación, 2026-10-01): Aprobación delegada por la autorización vigente del PO del 2026-10-01: «Si termina el ciclo QA y hacemos los commit y push para dejar todo listo para en la noche programar otro ciclo con otros tickets». La compuerta volvió REVIEW por una sola proposición con veredicto, diagnostico_explica_el_sintoma (peso 3) en 0,85 contra el umbral de aprobación de 0,90; las demás aprobaron (causa_especifica 0,96, nombra_archivos_reales 0,91, clasificacion completa) y riesgos_cubren_impactos 0,88 es descriptiva y no emite veredicto. La banda es de redacción y no de fondo: el diagnóstico nombra la causa raíz con archivo y línea (packages/gate/src/dynamic.ts:251-256, la copia de ...partes.slice(1) dentro de args sin resolverlo contra la raíz) y distingue la mitad del requisito que ya está implementada de la que falta; la implementación del ticket lo confirma al correr. Se recomienda seguir."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-02",
    "at": "2026-10-02T10:05:08.534Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-02",
    "at": "2026-10-02T10:05:35.948Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-02",
    "at": "2026-10-02T10:05:36.120Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-02",
    "at": "2026-10-02T10:15:29.428Z",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-10-02",
    "at": "2026-10-02T10:16:32.241Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-10-02",
    "at": "2026-10-02T10:16:35.740Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-10-02",
    "at": "2026-10-02T10:16:46.982Z",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-10-02",
    "at": "2026-10-02T10:17:27.635Z",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-10-02",
    "at": "2026-10-02T10:17:31.218Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-10-02",
    "at": "2026-10-02T10:20:05.524Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-014",
    "date": "2026-10-02",
    "at": "2026-10-02T10:20:12.728Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-002."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-015",
    "date": "2026-10-02",
    "at": "2026-10-02T10:25:13.819Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-003."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-016",
    "date": "2026-10-02",
    "at": "2026-10-02T10:25:20.852Z",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-017",
    "date": "2026-10-02",
    "at": "2026-10-02T10:25:35.493Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  }
]
```
