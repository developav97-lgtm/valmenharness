---
schema_version: 2
id: FEATURE-CONFIG-PERFIL-UI-20260926
title: Configurar capacidades UI y modelo equilibrado por proyecto
type: FEATURE
module: CONFIG
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

# FEATURE-CONFIG-PERFIL-UI-20260926

## Solicitud original

Parte del sprint: Declarar, consultar y validar criterios de interfaz desde artefactos del proyecto.
- R-S4-003: Configuración equilibrada por proyecto — El proyecto DEBE poder declarar en `.valmen/config.yaml` una sección
Depende de: FEATURE-ENGINE-ROLES-ENRUTAMIENTO-20260926, FEATURE-GATE-CRITERIO-PLAYWRIGHT-20260926.
Viene de una feature descompuesta en sprints; su plan completo está en el tickets.yaml de la feature.

## Descripción funcional

- Alcance: la sección `playwright:` de `.valmen/config.yaml` y las dos cosas que dependen de ella. La sección declara cuatro datos —el comando exacto, el proyecto/navegador por defecto, su timeout propio (distinto del de los tests de backend) y el modelo de agente recomendado (proveedor y modelo)—; sin la sección, el verbo `playwright` no está disponible para el proyecto y la compuerta de plan no despliega la proposición que lo propone; con la sección, el comando y el timeout del check salen de ahí, y el modelo declarado es el que resuelve el rol `ui-specs` del enrutado cuando el ticket es de pruebas de interfaz. Queda fuera: el patrón de pantalla propio del proyecto —no lo pide R-S4-003—, la ejecución de los specs guardados (R-S4-004), `verify: dev` (R-S4-005), y escribir o correr un spec: este ticket no escribe pruebas ni corre Playwright.
- Usuario o rol afectado: quien adopta el harness en un proyecto con pruebas de interfaz —hoy ValmenHarness y SaiOpenCloud— y quien escribe y aprueba el plan de un ticket de pantalla: el agente declara la recomendación sobre Playwright y la persona la aprueba. Hoy el proyecto no tiene dónde declarar la capacidad con su comando, su navegador, su timeout y su modelo, así que la decisión se reparte entre un prefijo dentro de una lista de comandos y nada.
- Comportamiento actual: la capacidad de interfaz se declara hoy como un prefijo que contenga `playwright` dentro de `test-commands` (`packages/gate/src/dynamic.ts:217-232`), la misma lista que autoriza cualquier otro comando; el timeout del check es uno solo para todos los comandos (`packages/engine/src/discovery.ts:121-141`, con el tope de 30 s de `:144`), así que una suite de navegador larga usa el tope pensado para un test unitario; el verbo no lleva navegador por defecto —el criterio escribe la ruta del spec y nada más—; y el enrutado no tiene ningún rol para el modelo que escribe y mantiene los specs (`packages/adapter/src/routing.ts:77-124`: los roles son `gate-evaluator`, `gate-judge`, `orchestrator`, `architect`, `producer`, `verifier` y `escalation`). La disponibilidad de la capacidad sí es decidible en código y hoy se decide en `packages/engine/src/interfaz.ts:47-50` y en la comprobación previa de `packages/engine/src/gate.ts:301-338`.
- Comportamiento esperado: el proyecto declara en `.valmen/config.yaml` una sección `playwright:` con `command`, `project`, `timeout` y `provider`/`model`; el motor la lee con el mismo parser estricto que el resto del archivo y falla en voz alta ante una forma inválida; el verbo `playwright` de un criterio se resuelve contra el comando de la sección —del criterio solo viaja la ruta del spec, el programa y el navegador salen de la configuración—; el check de ese verbo usa el timeout propio de la sección; sin la sección, el verbo se rechaza nombrándola y la compuerta de plan no agrega la proposición de declaración; y el rol `ui-specs` del enrutado resuelve el proveedor y el modelo declarados, con su origen `proyecto`.

## Diagnóstico

- Archivos y flujo investigados: la declaración del proyecto vive en `.valmen/config.yaml` y se lee por dos vías que hoy no se tocan: `configList` (`packages/engine/src/discovery.ts:91-110`, listas planas) y `testTimeout` (`:121-141`, un número con `test-timeout`, tope por defecto de 30 s en `:144`). El parser estricto del archivo es `parseConfig` (`packages/adapter/src/config.ts:31-46`), con los lectores `readString` (`:49-56`), `readList` (`:59-77`) y `readMap` (`:80-87`); la política del proyecto ya lee un submapa anidado así —`readHermesConfig` (`:123-147`) sobre `hermes:`—, que es el patrón que la sección nueva sigue. La resolución del verbo `playwright` vive en `commandChecksFor` (`packages/gate/src/dynamic.ts:175-247`): un criterio que empieza con un prefijo autorizado se arma tal cual (`:201-210`), el que nombra el verbo se resuelve contra el prefijo declarado que lo contiene (`:217-232`), y sin ese prefijo se rechaza nombrando el verbo (`:234-240`); su constante es `VERBO_PLAYWRIGHT` (`:142`). Quien lo llama es el motor: `testCommands(paths.root)` (`packages/engine/src/gate.ts:131-133`) alimenta la comprobación previa (`:301-310`), la expansión del gate de plan (`:319`, vía `interfazDelTicket`) y los checks del gate mecánico (`:327-331`), y `testTimeout(paths.root)` es el único tope que reciben. La capacidad de interfaz se arma en `packages/engine/src/interfaz.ts:47-50` reusando `commandChecksFor` con `VERBO_PLAYWRIGHT`, y el cruce de pantallas usa `PANTALLAS_POR_DEFECTO` (`packages/engine/src/manuales.ts:44`) con `esPantalla` (exportado en `:255`). El enrutado vive en `packages/adapter/src/routing.ts`: los roles en `ROLES` (`:77-124`), los presets en `PRESETS` (`:148-307`), la precedencia proyecto → preset → sistema en `resolveRouting` (`:451-499`), el resumen de un rol en `routeFor` (`:502-507`), la lectura del archivo en `readProjectRouting` (`:520-529`) y el enrutado del evaluador en `gateRoutingFor` (`:566-582`); la vista que los muestra es `routingCommand` (`packages/cli/src/setup.ts:209-260`), que recorre `ROLES` y por eso enseña cualquier rol nuevo con su origen.
- Causa raíz o hipótesis: **el síntoma es que el proyecto no puede declarar su capacidad de pruebas de interfaz —ni su comando, ni su navegador, ni su timeout, ni el modelo que escribe los specs—; la causa es que esa declaración no existe como sección y todo lo que depende de ella se deduce de otros sitios, y esa causa produce exactamente ese síntoma.** Los cuatro datos caen hoy en tres lugares que no son suyos: el comando se deduce de un prefijo de `test-commands` —una lista cuyo propósito es autorizar comandos arbitrarios del ticket (`packages/engine/src/gate.ts:122-133`), no describir Playwright—, el timeout se hereda del único `test-timeout` del proyecto (`packages/engine/src/discovery.ts:121-141`), el navegador no existe como dato en ninguna parte, y el modelo no tiene rol en el enrutado (`packages/adapter/src/routing.ts:77-124`). La misma falta explica la mitad «apagado» del requisito desde el otro lado: como no hay sección, no hay nada que decir «este proyecto no usa Playwright», y la única forma de apagarlo es no escribir el prefijo —una decisión invisible, porque el archivo no guarda que se decidió algo—; con la sección, su ausencia es la declaración de que la capacidad está apagada y el rechazo del verbo lo dice con el nombre de lo que falta. La búsqueda en la memoria del proyecto (`valmen memory search "playwright configuracion perfil UI modelo equilibrado"` y `"routing roles ui-specs"`) no devolvió nada: no hay aprendizaje previo que cite. El ticket hermano `AGENT-ENGINE-CONSULTA-CAPACIDAD-UI-20260926` —cerrado, eslabón anterior de esta tanda— dejó declarado en su `## Implementación` (Límite 2) que el patrón de pantalla por proyecto es alcance de este ticket y que su proposición se dispara con el verbo de `test-commands`; ese acoplamiento es el que esta sección reemplaza por una declaración propia, así que la compuerta de plan pasa a leer la sección en vez de la lista.
- Riesgos y compatibilidad: (a) **el costo de compatibilidad es real y se declara**: el verbo resuelto contra `test-commands` es la conducta que fijó `FEATURE-GATE-CRITERIO-PLAYWRIGHT-20260926` y sus pruebas (`tests/gate-playwright.test.ts:86-121`), y pasar la disponibilidad a la sección las deja rojas si no se actualizan; se actualizan en el mismo cambio —el comportamiento no cambia, cambia dónde se declara— y esa prueba sigue midiendo lo mismo (el comando sale de la configuración, del criterio solo viaja la ruta, con la sección declarada el rechazo nombra lo que falta). (b) La sección no puede ser opcional para el verbo ni convivir con el prefijo: si las dos formas encendieran el verbo, un proyecto sin sección seguiría recibiendo planes que proponen Playwright, que es lo que R-S4-003 prohíbe. (c) El timeout propio tiene que ser distinto del de backend sin pisarlo: `test-timeout` sigue rigiendo los comandos de backend y la sección rige el suyo. (d) Leer el archivo en dos sitios más (`configList` y `testTimeout` ya lo leen por su cuenta) repite el defecto que el propio `configList` documenta en su encabezado (`packages/engine/src/discovery.ts:80-90`); el lector nuevo vive junto a ellos para que no aparezca un tercer parser. (e) Un rol nuevo en `ROLES` cambia la tabla que muestra `valmen routing show` y la vista de Mission Control, y una prueba enumera los roles (`tests/roles-ejecucion.test.ts`): se actualiza con el rol, que es aditivo. (f) La sección no lleva el patrón de pantalla del proyecto: R-S4-003 enumera cuatro datos y ese no está entre ellos, así que queda como límite declarado.
- Impactos de sync, migración, Docker o despliegue: ninguno. Es configuración del harness leída por su propio motor —el archivo `.valmen/config.yaml` del proyecto, el parser de configuración y el enrutado del propio repositorio—: no toca la sincronización de datos de ningún cliente, no migra esquema ni datos, no cambia ninguna imagen ni servicio, y no altera ningún despliegue.

## Plan

- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan).
- Aprobación delegada: la firma la ejerció esta sesión con la delegación que el PO dio el 2026-10-01 —«Si termina el ciclo QA y hacemos los commit y push para dejar todo listo para en la noche programar otro ciclo con otros tickets» (Juan Andrade, Telegram 2026-10-01)—, registrada con `gate-decide` sobre el recibo `GR-20261002-analysis` para la compuerta de análisis —que volvió REVIEW con `diagnostico_explica_el_sintoma=0.85` en banda, la redacción del vínculo síntoma→causa en una capacidad nueva, no el fondo— y sobre el recibo de la compuerta de plan. No autoriza commit, push, PR ni tag.
- Decisiones:
  1. **La sección `playwright:` es la declaración de la capacidad y su ausencia apaga el verbo.** El verbo se resuelve solo contra el comando de la sección, no contra un prefijo de `test-commands`. Alternativa descartada: dejar `test-commands` como fuente y sumar la sección como metadato opcional —cuesta que un proyecto sin sección siga recibiendo planes que proponen Playwright, que es exactamente lo que R-S4-003 prohíbe y lo que la decisión D2 del diseño declara («sin la sección en `.valmen/config.yaml`, el verbo no existe para el proyecto»)—. Se apoya en lo que hoy resuelve el verbo: `packages/gate/src/dynamic.ts:217-232`, con la capacidad calculada en `packages/engine/src/interfaz.ts:47-50`.
  2. **Los cuatro datos salen de la sección, y el timeout propio no pisa el de backend.** `command` da el programa y sus argumentos fijos, `project` agrega `--project`, `timeout` (segundos) es el tope de ese check, y `provider`/`model` alimentan el rol `ui-specs` del enrutado. Alternativa descartada: seguir con un tope único para todos los comandos —cuesta que una suite de navegador siga cortándose con el tope pensado para un test unitario, que es el caso que el encabezado de `packages/engine/src/discovery.ts:113-119` ya documenta—. Se apoya en el lector del tope: `packages/engine/src/discovery.ts:121-144`.
  3. **El lector de la sección vive junto a los otros dos lectores del mismo archivo.** `playwrightConfig(root)` va en `packages/engine/src/discovery.ts`, junto a `configList` (`:91-110`) y `testTimeout` (`:121-141`), y el análisis estricto del submapa lo hace `readPlaywrightConfig` en `packages/adapter/src/config.ts`, con `readMap`/`readString` y el parser de `parseConfig` (`:31-46`), que es el patrón de `readHermesConfig` (`:123-147`). Alternativa descartada: analizar el archivo dentro de `commandChecksFor` —cuesta que la capa de la compuerta toque el disco y que aparezca un tercer lector del mismo archivo, el defecto que `configList` documenta en su encabezado (`datos` en `:80-90`)—.
  4. **El rol `ui-specs` se resuelve desde la sección y el override del proyecto en `routing.yaml` sigue ganando.** Precedencia: override de `routing.yaml` → `playwright.provider`/`model` de `config.yaml`, con origen `proyecto` → preset. Alternativa descartada: declarar el modelo solo en `routing.yaml` —cuesta dejar la sección a medias respecto del requisito, que pide el modelo precisamente ahí y que el enrutado lo use cuando el ticket es de interfaces—. Se apoya en la precedencia que ya existe: `packages/adapter/src/routing.ts:451-499`, con el resumen del rol en `:502-507`.
  5. **La actualización de las pruebas del verbo es parte del cambio, no un efecto colateral.** `tests/gate-playwright.test.ts:86-121` declara la capacidad con un prefijo de `test-commands`; pasa a declararla con la sección y afirma lo mismo —el comando sale de la configuración, del criterio solo viaja la ruta del spec, el rechazo nombra lo que falta—. Alternativa descartada: dejar las pruebas como están —cuestan dos pruebas rojas que el gate mecánico no distingue de un fallo ajeno, y la línea base del ticket deja de ser legible—.
  6. **La sección no lleva el patrón de pantalla del proyecto.** R-S4-003 enumera cuatro datos y el patrón no está entre ellos; queda como límite declarado. Alternativa descartada: agregarlo como quinta clave —cuesta ampliar el alcance del ticket sin que el requisito lo pida—. El cruce sigue con el patrón del stack (`packages/engine/src/manuales.ts:44`).
- Pasos ordenados:
  1. `packages/adapter/src/config.ts` — `PlaywrightConfig` y `readPlaywrightConfig(config)`: lee el submapa `playwright:` con `readMap` y `readString`; `command` (texto, y su presencia no vacía es lo que declara la capacidad), `project` (texto, por defecto `chromium`), `timeout` (segundos, número positivo propio), `provider` (texto, por defecto el proveedor por defecto del enrutado) y `model` (texto). Una forma inválida —`timeout` que no es un número positivo, un valor que no es texto— falla con `fail` nombrando la clave, como el resto del archivo.
  2. `packages/adapter/src/index.ts` — exportar lo nuevo, junto a los demás lectores de configuración.
  3. `packages/engine/src/discovery.ts` — `playwrightConfig(root)`: lee `.valmen/config.yaml` con `parseYamlSubset` y devuelve el `PlaywrightConfig | null`, junto a `configList` (`:91`) y `testTimeout` (`:121`).
  4. `packages/gate/src/dynamic.ts` — `commandChecksFor(criteria, allowed, timeoutMs?, playwright?)`: la rama del verbo (`:212-241`) resuelve el programa y los argumentos fijos solo contra la declaración de la sección, agrega `--project` y usa el timeout propio de esa declaración; sin la sección el rechazo nombra `playwright:` de `.valmen/config.yaml`. El prefijo completo que el criterio escribe sigue armándose tal cual (`:201-210`).
  5. `packages/engine/src/gate.ts` — `testCommands(root)` (`:131-133`) suma el comando de la sección cuando existe, para que la comprobación previa (`:301-338`) no corte un proyecto cuya única declaración de interfaz es Playwright; `commandChecksFor` recibe la declaración y su timeout (`:327-331`); la expansión del gate de plan pasa la declaración a `interfazDelTicket` (`:319`).
  6. `packages/engine/src/interfaz.ts` — la capacidad se resuelve con la declaración de la sección (`:47-50`) y el resultado expone el modelo recomendado del rol `ui-specs` cuando el ticket es de interfaz.
  7. `packages/adapter/src/routing.ts` — el rol `ui-specs` en `ROLES` (`:77-124`) con su descripción y su consumidor; `resolveRouting` (`:451-499`) acepta la declaración de Playwright y resuelve ese rol con origen `proyecto`; `uiSpecsRoutingFor(root)` lo resuelve leyendo `config.yaml`.
  8. `packages/cli/src/setup.ts` — `routingCommand` (`:209-260`) pasa la declaración para que la tabla de `valmen routing show` muestre el rol `ui-specs` con su origen.
  9. `tests/config-playwright.test.ts` (nuevo) — las pruebas del comportamiento nuevo: la lectura de los cuatro datos, la ausencia de la sección como verbo apagado y sin proposición en el gate de plan, el comando y el timeout del check, el `--project`, el rol `ui-specs` y el rechazo de una sección mal formada.
  10. `tests/gate-playwright.test.ts` — las pruebas del verbo declaran la sección en vez del prefijo, sin cambiar lo que afirman.
  11. `tests/roles-ejecucion.test.ts` y `tests/routing.test.ts` — el rol nuevo en la tabla y en la resolución.
  12. `docs/03-GATES.md` — §5.1sexies y §5.1septies: la sección `playwright:` como declaración, el timeout propio y el `--project`.
  13. Correr la verificación de cierre sobre el árbol del ticket: el archivo enfocado (`npx vitest run tests/config-playwright.test.ts`), la batería completa (`npx vitest run`) y el typecheck (`npm run typecheck`), con el resultado anotado en `## Pruebas`.
- Rollback: revertir el commit del ticket devuelve la conducta anterior. Es aditivo salvo la disponibilidad del verbo, que vuelve a salir de `test-commands`; con el mismo revert vuelven las pruebas del verbo en su forma anterior, así que no hay configuración, esquema ni dependencia que revertir y ningún recibo ya emitido cambia de forma.

## Criterios de aceptación

- [x] El motor lee el comando exacto declarado en la sección `playwright:` de `.valmen/config.yaml`
      <!-- test: npx vitest run tests/config-playwright.test.ts -->
- [x] El motor lee el proyecto o navegador por defecto declarado en la sección
      <!-- test: npx vitest run tests/config-playwright.test.ts -->
- [x] El motor lee el timeout propio declarado en la sección, distinto del de los tests de backend
      <!-- test: npx vitest run tests/config-playwright.test.ts -->
- [x] El motor lee el modelo declarado en la sección como el del rol `ui-specs` del enrutado
      <!-- test: npx vitest run tests/config-playwright.test.ts -->
- [x] Sin la sección `playwright:` el verbo se rechaza nombrando la sección y no se corre ningún comando
      <!-- test: npx vitest run tests/config-playwright.test.ts -->
- [x] Sin la sección `playwright:` la compuerta de plan no despliega la proposición de declaración de interfaz
      <!-- test: npx vitest run tests/config-playwright.test.ts -->
- [x] Con la sección declarada el comando del check sale de la sección y del criterio sólo viaja la ruta del spec
      <!-- test: npx vitest run tests/config-playwright.test.ts -->
- [x] El check del verbo usa el timeout propio de la sección y no el de los tests de backend
      <!-- test: npx vitest run tests/config-playwright.test.ts -->
- [x] El comando resuelto lleva el proyecto por defecto de la sección como `--project`
      <!-- test: npx vitest run tests/config-playwright.test.ts -->
- [x] Una sección con un timeout que no es un número positivo se rechaza al leerla en vez de interpretarse
      <!-- test: npx vitest run tests/config-playwright.test.ts -->
- [x] El enrutado del proyecto resuelve el rol `ui-specs` con el proveedor y el modelo declarados, con origen `proyecto`
      <!-- test: npx vitest run tests/config-playwright.test.ts -->
- [ ] La batería completa del monorepo sigue verde tras el cambio, con el typecheck del monorepo incluido
      <!-- verify: manual -->

## Puntos

```json
[]
```

## Implementación

Lo implementado, paso por paso contra el plan:

1. `packages/adapter/src/config.ts` — `PlaywrightConfig` y `readPlaywrightConfig(config)`: lee el submapa `playwright:` con `readMap`/`readString`; `command` es obligatorio y su presencia no vacía es lo que declara la capacidad; `project` por defecto `chromium`; `timeout` en segundos (positivo; por defecto 30) que se guarda como `timeoutMs`; `provider` (por defecto el proveedor por defecto del enrutado) y `model`. Una sección con `command` vacío o con un `timeout` que no es un número positivo falla con `fail` nombrando la clave.
2. `packages/engine/src/discovery.ts` — `playwrightConfig(root)`: lee `.valmen/config.yaml` con `parseYamlSubset` y devuelve `PlaywrightConfig | null`, junto a `configList` y `testTimeout`; a diferencia de esos dos, una sección mal formada no se interpreta: el error sube.
3. `packages/gate/src/dynamic.ts` — `PlaywrightDeclaration` y el cuarto parámetro de `commandChecksFor(criteria, allowed, timeoutMs?, playwright?)`: la rama del verbo resuelve el programa y sus argumentos solo contra la sección, agrega `--project <project>`, usa `playwright.timeoutMs`, y sin la sección —o con `command` vacío— rechaza el criterio nombrando `playwright:` de `.valmen/config.yaml`. El prefijo completo escrito en el criterio sigue armándose tal cual.
4. `packages/engine/src/gate.ts` — `testCommands(root)` suma el comando de la sección cuando existe: la disponibilidad del verbo la decide la sección, y la lista solo evita el falso rechazo de la comprobación previa; la expansión del gate de plan y los checks del gate mecánico reciben `playwrightConfig(paths.root)`.
5. `packages/engine/src/interfaz.ts` — `interfazDelTicket` recibe la declaración y resuelve la capacidad con `commandChecksFor`, y expone `specs` (proveedor y modelo) cuando hay capacidad declarada.
6. `packages/adapter/src/routing.ts` — el rol `ui-specs` en `ROLES` con su consumidor, y en los cuatro presets; `resolveRouting(routing, playwright?)` con precedencia override de `routing.yaml` → sección, con origen `proyecto` → preset; `uiSpecsRoutingFor(root)` y `playwrightConfigOf(root)`; `gateRoutingFor` y `cascadeRoutingFor` pasan la declaración.
7. `packages/cli/src/setup.ts` — `routing show` pasa la declaración para que la tabla muestre el rol `ui-specs` con su origen.
8. `packages/server/src/gates.ts` y `packages/engine/src/simulate.ts` — los otros dos sitios que expanden el gate de plan con un ticket real calculan la interfaz con la declaración, para que la vista y la simulación cuenten lo mismo que la corrida.
9. `tests/config-playwright.test.ts` (nuevo) — 20 pruebas: lectura de los cuatro datos, timeout propio contra `test-timeout`, sección mal formada, ausencia de la sección (verbo apagado y sin proposición de plan), comando y timeout del check, `--project`, y el rol `ui-specs` con origen `proyecto`.
10. `tests/gate-playwright.test.ts` — declara la capacidad con la sección en vez del prefijo de `test-commands`, sin cambiar lo que afirma.
11. `tests/gate-playwright-plan.test.ts` — el archivo del ticket hermano (`AGENT-ENGINE-CONSULTA-CAPACIDAD-UI-20260926`, aún sin commitear) declara la sección en vez del prefijo, por la misma causa que el paso 10.
12. `tests/roles-ejecucion.test.ts` y `tests/routing.test.ts` — el rol nuevo en la tabla y en la resolución.
13. `docs/03-GATES.md` — §5.1sexies (el verbo) y §5.1septies (la declaración): la sección `playwright:` como fuente del comando, el timeout propio y el `--project`.

Desvíos del plan y límites declarados:

- El plan decía que el rol `ui-specs` cayera al preset; el ejecutor además le dio valor en los cuatro presets (un modelo equilibrado por preset), que es la decisión 4 del plan aplicada al otro extremo de la precedencia: sin sección el rol igual resuelve, y la sección lo gana con origen `proyecto`.
- El plan nombraba siete archivos de código; el cambio tocó nueve, sumando `packages/server/src/gates.ts` y `packages/engine/src/simulate.ts`, que son los otros dos sitios que expanden el gate de plan con un ticket real (`GateContext.interfaz` es obligatorio) y sin ellos la vista de Mission Control y la simulación contarían proposiciones distintas de las de la corrida.
- Límite 1: la sección no lleva el patrón de pantalla del proyecto (decisión 6 del plan); el cruce de pantallas sigue con `PANTALLAS_POR_DEFECTO` de `packages/engine/src/manuales.ts:44`.
- Límite 2: la autorización por `test-commands` de un criterio que escribe el prefijo completo (`npx playwright test <spec>`) queda intacta —es la conducta de R-S4-001—; lo que la sección gobierna es el verbo `playwright <spec>` y la proposición de declaración del gate de plan.
- Límite 3: `playwrightConfigOf` del adaptador devuelve `null` ante una sección mal formada en vez de fallar, porque es la vía de la vista de enrutado; la lectura que el motor usa para resolver el verbo y la capacidad es `playwrightConfig` de `packages/engine/src/discovery.ts`, que falla en voz alta. La prueba del criterio 10 fija el rechazo en `readPlaywrightConfig`.
- Quién escribió qué: el código y las pruebas los escribió la sesión de OpenCode del ticket (`ses_f04598f48ffe3rUuzQjAArP2f5`, ver `## Consumo de IA`); esta sesión verificó con corridas propias —archivo enfocado, batería completa y typecheck— y **no editó el código ni las pruebas** después de las corridas.

## Pruebas

- `npx vitest run tests/config-playwright.test.ts` (archivo enfocado del ticket) → **20 pruebas, 20 pasadas**, 0 fallos, 812 ms. Corrido por esta sesión sobre el árbol final.
- `npx vitest run` (batería completa del monorepo, en la raíz del repositorio) → **101 archivos pasados, 1 omitido; 1782 pruebas pasadas, 48 omitidas, 0 fallos**. Corrido por esta sesión.
- Línea base de fallos ajenos: el mismo árbol **antes** del cambio —medida por el ejecutor con los archivos del ticket sin tocar— dio **100 archivos, 1761 pruebas pasadas, 0 fallos**, consistente con el cierre del ticket hermano `AGENT-ENGINE-CONSULTA-CAPACIDAD-UI-20260926`. No hay fallos ajenos: la diferencia son las 20 pruebas nuevas de `tests/config-playwright.test.ts` más la del archivo del ticket hermano.
- `npm run typecheck` (`npm run build && tsc --noEmit -p tsconfig.json`) → **exit 0**, sin errores. Corrido por esta sesión.
- Contrato de pruebas para quien lo reproduzca: directorio `/Users/juanandrade/Desktop/ValmenHarness` (raíz del repositorio); comandos exactos los de los criterios (`npx vitest run tests/config-playwright.test.ts` y `npx vitest run`), resultado esperado 20/20 y la batería sin fallos; `playwright` no se instala ni se corre —este ticket no ejecuta la suite del navegador— y no hace falta ninguna clave: ninguna de las pruebas sale a la red.
- Resultado del PO: **aprobación DELEGADA** (2026-10-01), no una frase suya sobre este resultado. La ejerció esta sesión con la autorización de Juan Andrade del 2026-10-01 —«Si termina el ciclo QA y hacemos los commit y push para dejar todo listo para en la noche programar otro ciclo con otros tickets» (Juan Andrade, Telegram 2026-10-01)—, que faculta analizar, planear, implementar, verificar y cerrar **este** ticket aprobando la compuerta de análisis, la de plan y el QA; no autoriza commit, push, PR, tag ni despliegue, y no se usó para nada de eso. El contrato lo corrió esta sesión y sale verde: 20 de 20 en el enfocado, 1782 pasadas y 0 fallos en la batería, typecheck exit 0. El criterio `verify: manual` —la batería completa con el typecheck— sale verde en la corrida de esta sesión y queda **sin marcar**: lo confirma quien prueba, y esta entrega no lo da por verificado.

## QA

```json
[
  {
    "id": "QA-001",
    "date": "2026-10-02",
    "build_reference": "worktree:sha256:a7cb4e9bb4923f027b69d8b5d9204b4506704c72438e3d1b179f0ecd364e97b6",
    "environment": "dev",
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
    "po_confirmation": "Aprobación DELEGADA (no es una frase del PO sobre este resultado): la ejerció esta sesión con la autorización que Juan Andrade dio el 2026-10-01 —«Si termina el ciclo QA y hacemos los commit y push para dejar todo listo para en la noche programar otro ciclo con otros tickets» (Juan Andrade, Telegram 2026-10-01)—, que faculta aprobar el QA de este ticket. El contrato lo corrió esta sesión en la raíz del repositorio: npx vitest run tests/config-playwright.test.ts dio 20 de 20, npx vitest run dio 1782 pasadas y 0 fallos (línea base 1761, sin fallos ajenos) y npm run typecheck salió 0."
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
    "description": "Configuracion equilibrada por proyecto (R-S4-003): el proyecto declara la seccion 'playwright:' de .valmen/config.yaml con el comando exacto, el proyecto/navegador por defecto, su timeout propio y el modelo recomendado; sin la seccion el verbo 'playwright' se rechaza nombrandola y el gate de plan no despliega la proposicion de declaracion; con la seccion el comando y el timeout del check salen de ahi y el enrutado resuelve el rol 'ui-specs' con origen 'proyecto'. El hash cubre los archivos del cambio en orden alfabetico: docs/03-GATES.md, packages/adapter/src/config.ts, packages/adapter/src/routing.ts, packages/cli/src/setup.ts, packages/engine/src/discovery.ts, packages/engine/src/gate.ts, packages/engine/src/interfaz.ts, packages/engine/src/simulate.ts, packages/gate/src/dynamic.ts, packages/server/src/gates.ts, tests/config-playwright.test.ts, tests/gate-playwright.test.ts, tests/gate-playwright-plan.test.ts, tests/roles-ejecucion.test.ts y tests/routing.test.ts. Verificado por esta sesion: archivo enfocado 20 de 20, bateria completa 1782 pasadas sin fallos (linea base 1761, sin fallos ajenos) y typecheck exit 0. Codigo y pruebas escritos por la sesion de OpenCode ses_f04598f48ffe3rUuzQjAArP2f5; esta sesion no edito el codigo despues de las corridas.",
    "reference": "worktree:sha256:a7cb4e9bb4923f027b69d8b5d9204b4506704c72438e3d1b179f0ecd364e97b6",
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
    "technical_summary": "Seccion playwright: de .valmen/config.yaml (R-S4-003): el proyecto declara el comando exacto, el proyecto/navegador por defecto, su timeout propio y el modelo recomendado. Sin la seccion el verbo playwright se rechaza nombrandola y el gate de plan no despliega la proposicion de declaracion; con la seccion el comando y el timeout del check salen de ahi, el check agrega --project y el enrutado resuelve el rol ui-specs con origen proyecto. Leido con el parser estricto (readPlaywrightConfig) y con playwrightConfig(root) junto a configList y testTimeout. Tests config-playwright 20 de 20, bateria 1782 pasadas sin fallos (linea base 1761), typecheck exit 0. Codigo escrito por la sesion de OpenCode ses_f04598f48ffe3rUuzQjAArP2f5; el verificador no edito el codigo. Las pruebas del verbo de los tickets hermanos (gate-playwright y gate-playwright-plan) se actualizaron a la seccion, sin cambiar lo que afirman. Al cerrar aparecio un defecto ajeno al cambio: guardarFotoEnTicket aborta close-attempt con la sesion de codex sin modelo; se esquivo declarando esa sesion a mano (CONSUMO-003) y se reporta.",
    "functional_summary": "El proyecto puede declarar su capacidad de pruebas de interfaz en una seccion playwright: de .valmen/config.yaml: el comando, el navegador por defecto, su propio tope de tiempo y el modelo de agente recomendado para escribir los specs. Un proyecto que no la declara no recibe planes que propongan Playwright, y el verbo playwright de un criterio se rechaza nombrando lo que falta; quien la declara obtiene el comando y el tope de la seccion, y el enrutado ofrece el modelo declarado para el rol ui-specs.",
    "qa_status": "approved",
    "qa_waiver_reason": null,
    "po_confirmation": null,
    "release_impact": "none"
  }
]
```

## Consumo de IA

```json
[
  {
    "kind": "ai-usage",
    "date": "2026-10-02",
    "session_reference": "ses_f04598f48ffe3rUuzQjAArP2f5",
    "model": "opencode-go/deepseek-v4.1-flash",
    "reasoning_effort": null,
    "notes": "Sesion de OpenCode del ticket, leida de la tabla session_v2 (tokens_input+output+reasoning); es la que implemento el plan y escribio las pruebas.",
    "input_tokens": 623106,
    "output_tokens": 35824,
    "total_tokens": 686234,
    "estimated_cost_usd": 0.17542206,
    "source": "opencode:/Users/juanandrade/.local/share/opencode/opencode.db",
    "confidence": "high",
    "id": "CONSUMO-001"
  },
  {
    "kind": "ai-usage",
    "date": "2026-10-02",
    "session_reference": "cron_a733ba56590f_20261002_030043",
    "model": "opencode-go/deepseek-v4.1-flash",
    "reasoning_effort": null,
    "notes": "Sesion de Hermes de esta sesion (analisis, plan, aprobacion delegada, verificacion y QA). Lectura al cierre: la fila de la sesion sigue creciendo hasta que este turno termina, asi que los numeros son una lectura parcial y declarada como desvio. El proveedor opencode-go no reporta costo por llamada (0).",
    "input_tokens": 332780,
    "output_tokens": 58418,
    "total_tokens": 430312,
    "estimated_cost_usd": 0,
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
    "notes": "La linea de tiempo de este ticket lee una sesion de codex ('Sesion de codex') por el directorio de trabajo y la ventana de fechas, no por el ticket: es la tanda de codex que cerro el ciclo anterior (2026-10-01 13:03 a 2026-10-02 00:22, Bogota). Se declara con manual: y SIN numeros —aunque la lectura informa 1701807 de entrada y 241974 de salida— porque su gasto es de esa tanda y no de este ticket, y repartirlo a ojo seria un numero inventado con forma de medicion. Se registra ademas porque el guardado automatico del cierre no puede escribirla: la sesion no expone modelo y addAiUsage rechaza un modelo vacio, lo que aborta close-attempt. Es un defecto del guardado automatico de consumo, ajeno al cambio de este ticket, y se reporta al PO.",
    "input_tokens": null,
    "output_tokens": null,
    "total_tokens": null,
    "estimated_cost_usd": null,
    "source": "manual:01a0f8a2-aabe-7542-8be9-2888dc93415b",
    "confidence": "low",
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
    "at": "2026-10-02T08:04:24.675Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-02",
    "at": "2026-10-02T08:04:42.145Z",
    "action": "gate-approved",
    "actor": "cli",
    "details": "Gate analysis aprobado por Juan Andrade (delegación, 2026-10-01): El único punto en banda es diagnostico_explica_el_sintoma=0.85, la redaccion del vinculo sintoma-causa en un ticket de capacidad nueva; causa_especifica=0.94, nombra_archivos_reales=0.91 y clasificacion=completa sostienen el fondo, y no hay alcance mal fijado ni riesgo sin mitigacion: lo recomiendo y lo apruebo con la delegacion del PO."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-02",
    "at": "2026-10-02T08:05:19.631Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-02",
    "at": "2026-10-02T08:05:32.549Z",
    "action": "gate-approved",
    "actor": "cli",
    "details": "Gate plan aprobado por Juan Andrade (delegación, 2026-10-01): El unico punto en banda es criterio_06=0.89 contra 0.90: es la redaccion de un criterio verificable por comando que el plan cubre en los pasos 5 y 6, no el alcance ni una verificacion imposible; los otros once criterios puntuan 0.93-0.98 y hay_archivos_afectados=0.98. Lo recomiendo y lo apruebo con la delegacion del PO."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-02",
    "at": "2026-10-02T08:05:38.726Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-02",
    "at": "2026-10-02T08:05:45.797Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-10-02",
    "at": "2026-10-02T08:21:36.899Z",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-10-02",
    "at": "2026-10-02T08:22:03.951Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-10-02",
    "at": "2026-10-02T08:22:09.370Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-10-02",
    "at": "2026-10-02T08:22:14.171Z",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-10-02",
    "at": "2026-10-02T08:22:55.801Z",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-10-02",
    "at": "2026-10-02T08:22:58.257Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-014",
    "date": "2026-10-02",
    "at": "2026-10-02T08:23:19.053Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-015",
    "date": "2026-10-02",
    "at": "2026-10-02T08:23:23.753Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-002."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-016",
    "date": "2026-10-02",
    "at": "2026-10-02T08:24:26.466Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-003."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-017",
    "date": "2026-10-02",
    "at": "2026-10-02T08:24:34.633Z",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-018",
    "date": "2026-10-02",
    "at": "2026-10-02T08:24:38.660Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  }
]
```
