---
schema_version: 2
id: AGENT-ENGINE-CONSULTA-CAPACIDAD-UI-20260926
title: Proponer y consultar uso de capacidades de interfaz
type: AGENT
module: ENGINE
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

# AGENT-ENGINE-CONSULTA-CAPACIDAD-UI-20260926

## Solicitud original

Parte del sprint: Declarar, consultar y validar criterios de interfaz desde artefactos del proyecto.
- R-S4-002: El agente propone, la persona decide — Cuando un plan toca una pantalla, el agente DEBE declarar en el plan si
Depende de: FEATURE-GATE-CRITERIO-PLAYWRIGHT-20260926.
Viene de una feature descompuesta en sprints; su plan completo está en el tickets.yaml de la feature.

## Descripción funcional

- Alcance: la expansión de la compuerta `plan` cuando el plan toca una pantalla y el proyecto declara la capacidad de interfaz —una proposición atómica que pide la declaración de recomendación sobre Playwright, y el disparador que la decide en código: las rutas de pantalla que el ticket cita en `## Diagnóstico` y `## Plan`, cruzadas contra el patrón de pantalla del stack, más el verbo declarado en `test-commands`—. Queda fuera: la sección `playwright:` de `.valmen/config.yaml` con el modelo por rol y el patrón de pantalla propio del proyecto (R-S4-003, ticket hermano FEATURE-CONFIG-PERFIL-UI-20260926), `verify: dev` (R-S4-005), la ejecución de specs guardadas en el repositorio (R-S4-004) y la escritura o la corrida de un spec: este ticket no escribe pruebas ni corre Playwright.
- Usuario o rol afectado: quien escribe el plan de un ticket que toca una pantalla —el agente y el PO en SaiOpenCloud— y quien lo aprueba, que es la persona: hoy la decisión de cubrir la interfaz con una prueba queda en la conversación y no en el artefacto que se aprueba, así que no hay dónde verla ni dónde confirmarla.
- Comportamiento actual: la compuerta de plan se expande con los criterios y los impactos del ticket (`GateContext` en `packages/gate/src/dynamic.ts:486-490`, armado en `packages/engine/src/gate.ts:315`) y no sabe si el plan toca una pantalla; ninguna de sus proposiciones pide una declaración sobre la prueba de interfaz. La capacidad se resuelve en código para el gate mecánico —el verbo `playwright` contra el prefijo de `test-commands`, `dynamic.ts:212-240`—, pero esa resolución nunca llega al gate de plan: un proyecto con Playwright configurado y uno sin él reciben el mismo plan, y la recomendación del agente no queda escrita en ningún lado.
- Comportamiento esperado: cuando el plan toca una pantalla y el proyecto declara el verbo de interfaz en `test-commands`, la compuerta de plan despliega **una** proposición atómica que pide la declaración —si el plan recomienda o no cubrir los criterios de interfaz con Playwright, y por qué—, y las dos respuestas la satisfacen: declarar que no se recomienda no es un hallazgo. Sin la capacidad declarada, o sin pantallas entre los archivos que el ticket cita, la compuerta no agrega la proposición: la ausencia de Playwright no se pregunta ni se penaliza. Y la recomendación no escribe nada: el harness no crea ni modifica criterios, así que la prueba entra al ticket por la mano del agente y con la confirmación de la persona, que es quien aprueba el plan.

## Diagnóstico

- Archivos y flujo investigados: el plan de un ticket se evalúa en la compuerta `plan` (`planned → approved`), definida en `packages/gate/src/definitions.ts:25-174` con tres banderas de expansión —`criteriaPropositions` (`:34`, documentada en `:143-163` de `decide.ts`), `impactPropositions` (`:37`, documentada en `:164-172`) y `commandPropositions` (`:182`)— y la expansión vive en `packages/gate/src/dynamic.ts:370-463`: `expandGate` sustituye la pregunta compuesta por una proposición atómica por criterio (`:376-379`, `criterionProposition` en `:116-132`), una por impacto declarado (`:391-398`, `impactProposition` en `:347-360`) y deja las fijas como descriptivas cuando hay atómicas (`:421-425`). El único insumo del sujeto son los criterios y los impactos: `GateContext` (`dynamic.ts:486-490`) declara esos dos campos y nada más, y quien lo arma es el motor, en `packages/engine/src/gate.ts:314-315` (`gateFor(definition, { criteria, impacts })`), con `impacts` leídos de `declaredImpactIds` (`:290`). Los otros sitios que expanden el mismo gate son `packages/engine/src/simulate.ts:186-189`, `packages/server/src/gates.ts:279` (la vista de Mission Control, que usa el mismo `gateFor` para que el número que se ve sea el que se va a evaluar) y `packages/mcp/src/tools.ts:2194` y `:2783` (que a propósito pasan el gate sin expandir). La capacidad de interfaz, en cambio, ya es consultable en código: el proyecto declara su comando en `test-commands` (`packages/engine/src/gate.ts:130-132`, `configList` en `packages/engine/src/discovery.ts:91-110`) y el verbo `test: playwright` se resuelve contra ese prefijo en `packages/gate/src/dynamic.ts:212-232`, con rechazo que nombra el verbo cuando no hay prefijo declarado (`:234-240`) y la comprobación previa del motor en `packages/engine/src/gate.ts:301-338`. Y el cruce «este archivo es una pantalla» ya existe y se usa en otro flujo: `PANTALLAS_POR_DEFECTO` (`packages/engine/src/manuales.ts:44`) con el matcher mínimo `esPantalla` (`:255-266`, hoy privado) y su uso en la auditoría de manuales (`:280`, `:370`); el extractor de las rutas que un ticket cita también existe, `CITAS_RE` en `packages/engine/src/drift.ts:150` con `citas()` en `:290-294`, y `declaredFunctionalFiles` (`packages/engine/src/references.ts:101-123`) lee los archivos declarados **de los puntos**, que en `planned` todavía no existen.
- Causa raíz o hipótesis: **el síntoma es que la compuerta de plan no pregunta nada sobre la prueba de interfaz; la causa es que no sabe si el plan toca una pantalla, y esa causa produce exactamente ese síntoma.** Lo que la expansión recibe del sujeto son criterios e impactos —`GateContext` en `dynamic.ts:486-490`, armado en `gate.ts:315`— y ninguna de las dos cosas dice qué archivos va a tocar el plan: los archivos afectados del ticket viven en `affected_files` de los puntos (`references.ts:108`), y los puntos se crean con la implementación, así que en `planned` la lista está vacía por construcción. Sin archivos no hay cruce contra el patrón de pantalla, y sin ese cruce la proposición que pide la declaración no se puede ni generar: la única pregunta con forma de declaración que hoy existe en el gate de plan es descriptiva y habla de otra cosa (`hay_archivos_afectados`, `definitions.ts:165-172`). La segunda mitad de la causa es la misma falta vista desde el otro lado: la disponibilidad de la capacidad —que sí es decidible en código, porque el verbo se resuelve contra el prefijo declarado en `test-commands` (`dynamic.ts:212-240`)— solo alimenta al gate mecánico (`gate.ts:321-338`) y nunca llega al de plan, así que un proyecto con Playwright configurado y uno sin él reciben hoy el mismo plan. El efecto que el requisito describe se sigue de ahí: la decisión de cubrir la interfaz con una prueba queda fuera del artefacto que la persona aprueba, y la recomendación del agente se pierde en la conversación en vez de quedar escrita donde se decide. La búsqueda en la memoria del proyecto devolvió **AP-001** («un criterio compuesto bloquea el gate de plan por banda, no por falta de trabajo», `.valmen/memory/aprendizajes.md:5`): la pregunta que se agregue tiene que ser atómica y su respuesta no puede depender de que el plan esté bien redactado en bloque, o vuelve a mover el bloqueo del trabajo al fraseo.
- Riesgos y compatibilidad: (a) el disparador tiene que ser conservador y decidirse en código: la pregunta se agrega solo cuando el ticket nombra al menos un archivo que el patrón de pantalla del proyecto reconoce **y** el proyecto declara el verbo en `test-commands` —sin lo segundo no hay capacidad que proponer, y preguntarla sería penalizar la ausencia de Playwright, que es lo que el requisito y la decisión D2 del diseño prohíben—. (b) El enunciado tiene que aceptar las dos respuestas: recomendar y no recomendar son declaraciones completas, y solo la ausencia de declaración puede quedar en banda; si el enunciado pidiera adoptar Playwright, el requisito quedaría invertido. (c) El disparador se calcula sobre las rutas que el ticket cita, así que **un plan que no nombre ningún archivo no recibe la pregunta**: es una limitación real y se declara, con dos razones —el plan ya está obligado a nombrar archivo y acción por `pasos_ejecutables` (`definitions.ts:86-97`), y adivinar la pantalla por el texto libre sería decidir con el modelo lo que el código no puede computar—. (d) `GateContext` es una interfaz de dos campos obligatorios a propósito (`dynamic.ts:477-485`: un campo opcional haría que un sitio nuevo lo omitiera sin que nada lo dijera), así que agregar el tercero toca los seis sitios que expanden el gate: los del motor y la vista calculan el valor real, y los dos del MCP —que pasan el gate sin expandir a propósito— declaran explícitamente que no lo calculan. (e) El patrón de pantalla es el del stack (`**/*.component.ts`, `**/*.component.html`), heredado de la auditoría de manuales: un proyecto con otra forma de pantalla no recibe la pregunta, y declarar el suyo es alcance de R-S4-003, no de este ticket. (f) La corrida del gate no escribe el ticket, y esa propiedad es justamente la que sostiene la parte del requisito que dice que la prueba no se escribe sin la confirmación de la persona: se verifica con una corrida real sobre el ticket y comparación de bytes.
- Impactos de sync, migración, Docker o despliegue: ninguno. Es la expansión de la compuerta de plan y su documentación —lógica del harness sobre el ticket y el árbol del propio repositorio—: no toca la sincronización de datos de ningún cliente, no migra nada, no cambia ninguna imagen ni servicio, y no altera el despliegue.

## Plan

- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan).
- Aprobación delegada: la firma la ejerció esta sesión con la delegación que el PO dio el 2026-10-01 —«Si termina el ciclo QA y hacemos los commit y push para dejar todo listo para en la noche programar otro ciclo con otros tickets» (Juan Andrade, Telegram 2026-10-01)—, registrada con `gate-decide` sobre el recibo `GR-20261002-plan`; la compuerta volvió REVIEW por `criterio_04=0.79` y `criterio_05=0.80`, y lo que quedó en banda es la **forma** de dos criterios —el plan declara las dos propiedades en `## Decisiones` (decisión 2) y no en un paso repetido—, no el alcance ni una verificación imposible: los dos criterios son verificables por comando y su prueba está entre los pasos 11 y 12.
- Decisiones:
  1. **La pregunta la dispara el código, no el modelo: se despliega cuando el ticket cita al menos una ruta que el patrón de pantalla reconoce y el proyecto declara el verbo en `test-commands`.** Alternativa descartada: desplegarla siempre y dejar que el evaluador decida si aplica —eso es preguntarle al modelo algo que el código puede computar (invariante 1), y además le pediría una declaración a un proyecto que no tiene Playwright, que es exactamente lo que la decisión D2 del diseño prohíbe («un proyecto sin Playwright configurado no recibe planes que lo propongan»). Se apoya en lo que ya existe: el patrón y el matcher vienen de `packages/engine/src/manuales.ts:44` y `:255-266`, y el verbo declarado se lee con `test-commands` (`packages/engine/src/gate.ts:130-132`), la misma fuente que usa la compuerta mecánica para resolverlo (`packages/gate/src/dynamic.ts:212-240`).
  2. **Una sola proposición atómica, y sus dos respuestas valen.** El enunciado pide la declaración —si recomienda o no cubrir los criterios de interfaz con Playwright— y su `no` describe la ausencia de declaración, no la ausencia de la herramienta. Alternativa descartada: dos proposiciones, una que pida recomendar y otra que pida el criterio —la primera penalizaría un plan que decide no usar Playwright, que es lo que el requisito prohíbe, y la segunda haría obligatoria la herramienta por la puerta de atrás—. La advertencia de **AP-001** (`.valmen/memory/aprendizajes.md:5`) es la razón de la atomicidad: una pregunta compuesta vuelve a mover el bloqueo del trabajo al fraseo.
  3. **El tercer campo de `GateContext` es obligatorio y los seis sitios que expanden el gate lo declaran.** Alternativa descartada: dejarlo opcional —el encabezado de `dynamic.ts:477-485` ya decidió lo contrario para los otros dos campos, y con un opcional un sitio nuevo preguntaría de menos en silencio, que es el defecto que esa expansión existe para cerrar—. Los tres sitios que expanden con un ticket real (motor, simulación, vista de Mission Control) calculan el valor; los dos del MCP, que pasan el gate **sin expandir** a propósito (`packages/mcp/src/tools.ts:2190-2194` y `:2779-2783`), lo declaran con una constante que dice que no lo calculan, para que se lea la decisión y no una omisión.
  4. **El cruce de pantallas reusa el matcher existente en vez de escribir otro.** Alternativa descartada: una segunda regla de globs dentro de la compuerta —dos implementaciones de la misma regla se separan, y la que se separa es la que deja pasar algo—. `esPantalla` (`manuales.ts:255-266`) se exporta sin cambiar su comportamiento, y su uso en la auditoría de manuales sigue igual.
  5. **Nada se escribe: la compuerta pregunta, no crea criterios.** La parte del requisito que dice que la prueba no se escribe ni se registra sin la confirmación de la persona se apoya en que el harness no toca el ticket —y esa propiedad se mide, con la corrida real y la comparación de bytes—, no en una convención: la confirmación es la aprobación del plan por la persona, y el criterio con el verbo lo escribe el agente.
- Pasos ordenados:
  1. `packages/engine/src/interfaz.ts` (nuevo) — `interfazDelTicket({ texto, comandos, pantallas? })`: extrae las rutas que el ticket cita en `## Diagnóstico` y `## Plan` con el mismo patrón de cita de `packages/engine/src/drift.ts:150`, le quita el sufijo `:línea`, cruza cada una contra el patrón de pantalla y devuelve `{ tocaPantalla, capacidadDisponible, requiereDeclaracion, pantallas }`, con las rutas en orden alfabético para que el mismo ticket dé siempre el mismo resultado.
  2. `packages/engine/src/manuales.ts` — exportar `esPantalla` (`:255-266`) sin tocar su regla, para que el cruce nuevo use el matcher que ya existe.
  3. `packages/engine/src/index.ts` — exportar el módulo nuevo, junto a los demás (`:35`, `export * from "./manuales.js";`).
  4. `packages/gate/src/decide.ts` — `GateDefinition.interfazProposition?: boolean`, documentada junto a `criteriaPropositions`, `impactPropositions` y `commandPropositions` (`:163`, `:172`, `:182`).
  5. `packages/gate/src/dynamic.ts` — `InterfazDelSujeto`, la constante `SIN_INTERFAZ`, `PROPOSICION_PLAYWRIGHT` y `playwrightProposition(pantallas)`; el campo `interfaz` en `GateContext` (`:486-490`); la rama `porInterfaz` en `expandGate` (`:370-463`) con su parte en el sufijo del id (`:450-456`).
  6. `packages/gate/src/definitions.ts` — `interfazProposition: true` en `PLAN_GATE` (`:34-37`), y **solo** ahí: el gate de análisis protege un estado donde el plan no existe y el mecánico no pregunta nada.
  7. `packages/engine/src/gate.ts` — calcular `interfazDelTicket(...)` con el texto del ticket y `testCommands(paths.root)` y pasarla en la expansión (`:314-315`).
  8. `packages/engine/src/simulate.ts` (`:186-189`) y `packages/server/src/gates.ts` (`:279`) — el mismo cálculo en los otros dos sitios que expanden el gate con un ticket real, para que la pantalla y la simulación cuenten las mismas proposiciones que la corrida.
  9. `packages/mcp/src/tools.ts:2194` y `:2783` — los dos sitios que pasan el gate sin expandir declaran `SIN_INTERFAZ` con el motivo escrito.
  10. `tests/impactos.test.ts` — los seis sitios que expanden el gate en las pruebas declaran `SIN_INTERFAZ`; ninguno cambia de expectativa.
  11. `tests/gate-playwright-plan.test.ts` (nuevo) — las pruebas del comportamiento nuevo: el despliegue con pantalla y capacidad, la ausencia de la pregunta sin capacidad declarada y sin pantalla citada, las dos respuestas válidas, la atomicidad y la unicidad de la proposición, el cruce con `ruta:línea` normalizada y con una ruta que no es pantalla, y la corrida del gate que no escribe el ticket.
  12. `docs/03-GATES.md` — §5.1septies, «El agente propone, la persona decide»: qué dispara la pregunta, que las dos respuestas la satisfacen, que sin capacidad no se pregunta y que la prueba no la escribe el harness.
  13. Correr la verificación de cierre sobre el árbol del ticket: el archivo enfocado y la batería completa del monorepo (`npx vitest run`), más el typecheck (`npm run typecheck`), con el resultado anotado en `## Pruebas`.
- Rollback: revertir el commit del ticket devuelve la conducta anterior; el cambio es aditivo —una proposición que solo aparece cuando el disparador la pide, un campo nuevo en una interfaz interna del harness y el export de una función que ya existía con el mismo comportamiento—, así que ni los recibos ya emitidos ni el registro cambian de forma, y no hay configuración, esquema ni dependencia que revertir.

## Criterios de aceptación

- [x] La compuerta de plan despliega la proposición de declaración cuando el ticket cita una pantalla y el proyecto declara el verbo de interfaz en test-commands
      <!-- test: npx vitest run tests/gate-playwright-plan.test.ts -->
- [x] Sin el verbo declarado en test-commands la compuerta de plan no despliega la proposición: la capacidad apagada no se pregunta
      <!-- test: npx vitest run tests/gate-playwright-plan.test.ts -->
- [x] Un ticket que no cita ningún archivo de pantalla no recibe la proposición, aunque el proyecto tenga la capacidad declarada
      <!-- test: npx vitest run tests/gate-playwright-plan.test.ts -->
- [x] El enunciado de la proposición declara que no recomendar Playwright es una respuesta válida
      <!-- test: npx vitest run tests/gate-playwright-plan.test.ts -->
- [x] El gate de plan expandido no agrega ninguna proposición que exija un criterio verificado con el verbo playwright
      <!-- test: npx vitest run tests/gate-playwright-plan.test.ts -->
- [x] El disparador se decide en código: la pantalla citada con su :línea se reconoce, una ruta que no es pantalla se ignora y el patrón del proyecto se puede declarar
      <!-- test: npx vitest run tests/gate-playwright-plan.test.ts -->
- [x] La corrida de la compuerta sobre un ticket con pantalla no modifica el archivo del ticket: la recomendación no escribe ni registra la prueba
      <!-- test: npx vitest run tests/gate-playwright-plan.test.ts -->
- [x] La documentación de las compuertas declara la regla: el agente propone y declara, la persona confirma, y la ausencia de la capacidad no es un hallazgo
      <!-- test: npx vitest run tests/gate-playwright-plan.test.ts -->
- [ ] La batería completa del monorepo sigue verde tras el cambio, con el typecheck del monorepo incluido
      <!-- verify: manual -->

## Puntos

```json
[]
```

## Implementación

Lo implementado, paso por paso contra el plan:

1. `packages/engine/src/interfaz.ts` (nuevo) — `interfazDelTicket({ texto, comandos, pantallas? })`: parte el ticket con `parseTicket` de `@valmen/core`, recorre las secciones `## Diagnóstico` y `## Plan` con el mismo patrón de cita de `drift.ts:150`, quita el sufijo `:\d+(-\d+)?` de cada cita, y devuelve `{ tocaPantalla, capacidadDisponible, requiereDeclaracion, pantallas }` con las rutas en orden alfabético. La capacidad se resuelve reusando `commandChecksFor` con el verbo `VERBO_PLAYWRIGHT`, que solo arma el check: no ejecuta ningún comando.
2. `packages/engine/src/manuales.ts` — `esPantalla` (`:255`) pasa a `export` sin cambiar una línea de su regla; su uso en la auditoría de manuales queda igual y una prueba lo fija.
3. `packages/engine/src/index.ts` — `export * from "./interfaz.js";` junto a los demás módulos.
4. `packages/gate/src/decide.ts` — `GateDefinition.interfazProposition?: boolean`, documentada junto a `criteriaPropositions`, `impactPropositions` y `commandPropositions`.
5. `packages/gate/src/dynamic.ts` — `InterfazDelSujeto`, la constante `SIN_INTERFAZ`, `PROPOSICION_PLAYWRIGHT = "recomendacion_playwright"`, `playwrightProposition(pantallas)`, el campo `interfaz` obligatorio en `GateContext`, la rama `porInterfaz` en `expandGate` y su parte en el sufijo del id (`plan+…+interfaz`).
6. `packages/gate/src/definitions.ts` — `interfazProposition: true` en `PLAN_GATE` y solo ahí.
7. `packages/engine/src/gate.ts` — `gateFor(definition, { criteria, impacts, interfaz: interfazDelTicket({ texto: ticket.text, comandos: testCommands(paths.root) }) })`.
8. `packages/engine/src/simulate.ts` y `packages/server/src/gates.ts` — el mismo cálculo, para que la simulación y la vista de Mission Control cuenten las proposiciones que la corrida va a evaluar.
9. `packages/mcp/src/tools.ts` — los dos sitios que pasan el gate sin expandir declaran `SIN_INTERFAZ` con el motivo escrito.
10. `tests/impactos.test.ts` (seis sitios) y `tests/gate-impacto-nulo.test.ts` (tres sitios, no nombrados en el plan) — `SIN_INTERFAZ`, sin cambiar ninguna expectativa.
11. `tests/gate-playwright-plan.test.ts` (nuevo) — 16 pruebas.
12. `docs/03-GATES.md` — §5.1septies «El agente propone, la persona decide».

Desvíos del plan y límites declarados:

- **Desvío 1 (corregido por esta sesión, no por el ejecutor): el enunciado de la proposición estaba invertido.** La primera escritura puso en `criteria.yes` «el plan declara que **recomienda**» y en `criteria.no` «el plan declara que **no lo recomienda**», y la prueba del criterio 4 lo fijaba con un `toContain` de esa redacción. Leído así, un plan que declara no recomendar Playwright puntuaría por el polo negativo y caería en banda: es exactamente lo que R-S4-002 prohíbe. Se corrigió a `yes` = «declara su posición —recomendar o no recomendar— y la justifica» y `no` = «no dice nada sobre Playwright ni sobre cómo se probará la interfaz», con la prueba ajustada a la propiedad y no a la redacción. Es el defecto que la revisión de esta sesión encontró y el motivo por el que la verificación propia no se apoya en la palabra del ejecutor.
- **Desvío 2 (corregido por esta sesión): la primera guarda de `expandGate` no miraba la interfaz.** El corte temprano `atomicas/porImpacto/porComando` vacíos con impactos declarados devolvía el gate sin la proposición de interfaz; se agregó `porInterfaz.length === 0`, por la misma razón que la segunda guarda, que ya la incluía. El caso era alcanzable solo con impactos fuera del orden canónico, y no hay prueba que lo recorra: se declara como tal.
- Desvío 3: el plan nombra seis sitios de expansión en las pruebas; el grep destapó tres más en `tests/gate-impacto-nulo.test.ts`. El campo obligatorio los exige y se declararon con `SIN_INTERFAZ` sin tocar expectativas —el compilador no deja que un sitio nuevo omita el campo en silencio, que es la decisión 3 del plan—.
- Límite 1: el disparador se calcula sobre las rutas que el ticket **cita entre backticks** en `## Diagnóstico` y `## Plan`. Un plan que no nombre ningún archivo no recibe la pregunta; es el límite (c) que el diagnóstico declara y está documentado en §5.1septies.
- Límite 2: el patrón de pantalla es el del stack (`**/*.component.ts`, `**/*.component.html`). `interfazDelTicket` acepta `pantallas` como parámetro y una prueba lo fija, pero declararlo por proyecto en `.valmen/config.yaml` es alcance de R-S4-003.
- Límite 3: la proposición se pregunta por igual si el plan recomienda Playwright o no —no hay una segunda pregunta que exija el criterio con el verbo—, y por eso el gate no cambia el estado del ticket ni escribe nada: la prueba la escribe el agente y la confirma la persona al aprobar el plan.
- Nota observada y **no** corregida: `ANALYSIS_GATE` con impactos vacíos produce el id `analysis+` (sufijo vacío) por su proposición fija `riesgos_cubren_impactos` con veredicto. Es anterior a este ticket y no tiene relación con el cambio; se declara para que no se lea como algo que este ticket introdujo.
- Quién escribió qué: el código y las pruebas los escribió la sesión de OpenCode del ticket (`ses_f04c42cb5ffevhB5XqmagVVXGW`); esta sesión verificó con corridas propias —archivo enfocado, suite completa con su línea base medida por stash, typecheck, y el contrato en rojo con la implementación apartada— y editó tres cosas sobre lo entregado: la redacción invertida de la proposición, la primera guarda de `expandGate` y la indentación de un bloque en `packages/server/src/gates.ts`. Ningún otro archivo del cambio se tocó después de las corridas.

## Pruebas

- `npx vitest run tests/gate-playwright-plan.test.ts` → **16 pruebas, 16 pasadas**, 0 fallos. Corrido por esta sesión sobre el árbol final.
- `npx vitest run` (batería completa del monorepo) → **100 archivos pasados, 1 omitido; 1761 pruebas pasadas, 48 omitidas, 0 fallos**. La línea base del **mismo** árbol antes del cambio se midió con los doce archivos con seguimiento apartados (`git stash push` de los doce, dejando los dos nuevos en su sitio; `git stash pop` después) y dio **99 archivos pasados, 1 omitido; 1745 pruebas pasadas, 48 omitidas, 0 fallos**: no hay fallos ajenos, y la diferencia son exactamente las 16 pruebas nuevas. Tras el `pop` los catorce archivos del cambio volvieron byte a byte iguales (`git hash-object` idéntico antes y después) y `git stash list` quedó vacía.
- `npm run typecheck` (`npm run build && tsc --noEmit -p tsconfig.json`) → exit 0, sin errores. Se corrió el script del proyecto y no un `tsc` suelto, porque el tipo que ve un paquete vecino sale de `dist`.
- **Contrato en rojo antes de la implementación**: con los doce archivos con seguimiento del cambio apartados (`git stash push -- docs/03-GATES.md packages/engine/src/gate.ts packages/engine/src/index.ts packages/engine/src/manuales.ts packages/engine/src/simulate.ts packages/gate/src/decide.ts packages/gate/src/definitions.ts packages/gate/src/dynamic.ts packages/mcp/src/tools.ts packages/server/src/gates.ts tests/gate-impacto-nulo.test.ts tests/impactos.test.ts`) el archivo enfocado da **15 de 16 en rojo** —`esPantalla is not a function` en las cuatro del disparador, y el gate expandido sin la proposición en las demás—; restaurado con `git stash pop` y verificado con `git hash-object` que los catorce archivos volvieron idénticos.
- Las ocho pruebas por comando se marcaron con la corrida directa del archivo enfocado y con el recibo de la compuerta mecánica sobre este mismo estado. El criterio `verify: manual` (la batería completa con el typecheck) lo corrió esta sesión y sale verde, pero queda **sin marcar**: lo confirma quien prueba, y esta entrega no lo da por verificado.
- Resultado del PO: **aprobación DELEGADA** (2026-10-01), no una frase suya sobre este resultado. La ejerció esta sesión con la autorización de Juan Andrade del 2026-10-01 —«Si termina el ciclo QA y hacemos los commit y push para dejar todo listo para en la noche programar otro ciclo con otros tickets» (Juan Andrade, Telegram 2026-10-01)—, que faculta analizar, planear, implementar, verificar y cerrar **este** ticket aprobando la compuerta de análisis, la de plan y el QA; no autoriza commit, push, PR ni tag, y no se usó para nada de eso. El contrato de pruebas —el archivo enfocado y la batería completa del monorepo, en la raíz del repositorio— lo corrió esta sesión y sale verde: 16 de 16 en el enfocado, 1761 pasadas y 0 fallos en la batería (línea base medida: 1745), typecheck exit 0. El criterio `verify: manual` queda sin marcar para quien lo confirme.

## QA

```json
[
  {
    "id": "QA-001",
    "date": "2026-10-02",
    "build_reference": "worktree:sha256:4e01a2edd916e907ed89c3eceab7e4762760a8fc087418f172f0941b7df13623",
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
    "po_confirmation": "Aprobación DELEGADA (no es una frase del PO sobre este resultado): la ejerció esta sesión con la autorización que Juan Andrade dio el 2026-10-01 —«Si termina el ciclo QA y hacemos los commit y push para dejar todo listo para en la noche programar otro ciclo con otros tickets» (Juan Andrade, Telegram 2026-10-01)—, que faculta aprobar el QA de este ticket. El contrato lo corrió esta sesión en la raíz del repositorio: npx vitest run tests/gate-playwright-plan.test.ts dio 16 de 16, npx vitest run dio 1761 pasadas y 0 fallos (línea base medida 1745, sin fallos ajenos) y npm run typecheck salió 0."
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
    "description": "Declaracion de interfaz en el gate de plan (R-S4-002): el ticket que cita una pantalla y un proyecto con el verbo playwright en test-commands recibe una proposicion atomica (recomendacion_playwright) que pide la declaracion, y las dos respuestas valen; sin capacidad declarada o sin pantalla citada la pregunta no se despliega y no se penaliza; el disparador se decide en codigo (interfazDelTicket) y la corrida del gate no escribe el ticket. El hash cubre los archivos del cambio en orden alfabetico: docs/03-GATES.md, packages/engine/src/gate.ts, packages/engine/src/index.ts, packages/engine/src/interfaz.ts, packages/engine/src/manuales.ts, packages/engine/src/simulate.ts, packages/gate/src/decide.ts, packages/gate/src/definitions.ts, packages/gate/src/dynamic.ts, packages/mcp/src/tools.ts, packages/server/src/gates.ts, tests/gate-impacto-nulo.test.ts, tests/gate-playwright-plan.test.ts y tests/impactos.test.ts. Verificado por esta sesion: archivo enfocado 16 de 16, bateria completa 1761 pasadas sin fallos (linea base medida por stash: 1745), typecheck exit 0, y contrato en rojo (15 de 16) con la implementacion apartada. Codigo escrito por la sesion de OpenCode ses_f04c42cb5ffevhB5XqmagVVXGW; esta sesion corrigio la redaccion invertida de la proposicion, la primera guarda de expandGate y la indentacion de un bloque en server/src/gates.ts antes de las corridas finales.",
    "reference": "worktree:sha256:4e01a2edd916e907ed89c3eceab7e4762760a8fc087418f172f0941b7df13623",
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
    "technical_summary": "El gate de plan despliega una proposicion atomica (recomendacion_playwright) cuando el ticket cita una pantalla y el proyecto declara el verbo playwright en test-commands; el disparador se decide en codigo (interfazDelTicket reusa esPantalla y la resolucion del verbo), las dos respuestas valen y sin capacidad no se pregunta. Tests gate-playwright-plan 16 de 16, suite 1761 pasadas sin fallos (linea base 1745), typecheck exit 0. Al cerrar aparecio un defecto ajeno al cambio: guardarFotoEnTicket pasa un modelo vacio de una sesion de codex y close-attempt aborta; se esquivo declarando esa sesion a mano y se reporta.",
    "functional_summary": "Cuando un plan toca una pantalla, el agente declara en el plan si recomienda cubrir los criterios de interfaz con Playwright y por que, y la persona lo confirma al aprobar el plan: no recomendar no es un hallazgo, sin capacidad declarada no hay pregunta, y la prueba no la escribe el harness.",
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
    "session_reference": "cron_240ee355e6c1_20261002_010043",
    "model": "deepseek-v4.1-flash",
    "reasoning_effort": null,
    "notes": "Lectura al cierre de la sesion de trabajo del ticket (eslabon 3 de la tanda evolucion-harness S4): el turno sigue en curso mientras se escribe esta fila, asi que los numeros son un piso y la fila sigue creciendo —desvio declarado—. Viene de session_model_usage, la unica fila de la sesion (91 llamadas, 13192960 tokens de cache leidos, 42022 de razonamiento). La base informa estimated_cost_usd 0.0 con cost_status unknown y cost_source none: es «no informado», no «gratis», porque el proveedor factura por suscripcion.",
    "input_tokens": 645317,
    "output_tokens": 69178,
    "total_tokens": null,
    "estimated_cost_usd": null,
    "source": "hermes:/Users/juanandrade/.hermes/profiles/valmen-harness/state.db",
    "confidence": "low",
    "id": "CONSUMO-001"
  },
  {
    "kind": "ai-usage",
    "date": "2026-10-02",
    "session_reference": "ses_f04c42cb5ffevhB5XqmagVVXGW",
    "model": "openrouter/unbiased/pareto-26.10-preview",
    "reasoning_effort": null,
    "notes": "Sesion del ejecutor OpenCode del ticket, ya cerrada (96 mensajes del asistente, 7684740 tokens de cache leidos, sin tokens de razonamiento). Costo leido del agregado del campo cost de sus mensajes en session_message: es lo que el proveedor facturo por la corrida, no una estimacion.",
    "input_tokens": 246887,
    "output_tokens": 71429,
    "total_tokens": null,
    "estimated_cost_usd": 0.6566246,
    "source": "opencode:/Users/juanandrade/.local/share/opencode/opencode.db",
    "confidence": "high",
    "id": "CONSUMO-002"
  },
  {
    "kind": "ai-usage",
    "date": "2026-10-02",
    "session_reference": "01a0f8a2-aabe-7542-8be9-2888dc93415b",
    "model": null,
    "reasoning_effort": null,
    "notes": "La linea de tiempo de este ticket lee una sesion de codex ('Sesion de codex') por el directorio de trabajo y la ventana de fechas, no por el ticket: empezo el 2026-10-01 13:03 (Bogota) y su archivo se cerro el 2026-10-02 00:22, la tanda que cerro el ciclo anterior. Se declara con manual: y SIN numeros —aunque la lectura informa 1701807 de entrada y 241974 de salida— porque su gasto es de esa tanda y no de este ticket, y repartirlo a ojo seria un numero inventado con forma de medicion; el hueco declarado se ve. Se registra ademas porque el guardado automatico del cierre no puede escribirla: la sesion no expone modelo y addAiUsage rechaza un modelo vacio, lo que aborta close-attempt. Es un defecto del guardado automatico de consumo, ajeno al cambio de este ticket, y se reporta al PO.",
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
    "at": "2026-10-02T06:06:00.225Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-02",
    "at": "2026-10-02T06:07:10.924Z",
    "action": "gate-approved",
    "actor": "cli",
    "details": "Gate analysis aprobado por Juan Andrade (delegación, 2026-10-01): Aprobación delegada: el PO autorizó analizar, planear, implementar, verificar y cerrar este ticket con su frase del 2026-10-01 («Si termina el ciclo QA y hacemos los commit y push para dejar todo listo para en la noche programar otro ciclo con otros tickets»). La banda es de redacción y no de fondo: diagnostico_explica_el_sintoma=0.87 y nombra_archivos_reales=0.89 quedaron bajo el umbral de 0.90 en las dos corridas, y el fondo está verificado a mano —la causa («la compuerta de plan no sabe si el plan toca una pantalla») se comprobó contra el árbol, con GateContext en dynamic.ts:486-490, gate.ts:315, el matcher esPantalla en manuales.ts:255-266 y el verbo resuelto en dynamic.ts:212-240—, así que lo que la banda mide es el fraseo del diagnóstico y no una causa mal identificada. Recomiendo aprobar y seguir."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-02",
    "at": "2026-10-02T06:07:55.322Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-02",
    "at": "2026-10-02T06:08:58.470Z",
    "action": "gate-approved",
    "actor": "cli",
    "details": "Gate plan aprobado por Juan Andrade (delegación, 2026-10-01): Aprobación delegada del plan: el PO autorizó el 2026-10-01 analizar, planear, implementar, verificar y cerrar este ticket («Si termina el ciclo QA y hacemos los commit y push para dejar todo listo para en la noche programar otro ciclo con otros tickets»). La compuerta volvió REVIEW por criterio_04=0.79 y criterio_05=0.80 —la forma de dos criterios que el plan declara en su decisión 2 y no repite en un paso—, no por el fondo: el alcance está fijado, los nueve criterios son verificables (ocho por comando y uno manual) y las cinco decisiones van con su alternativa y su ruta. Recomiendo aprobar y seguir."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-02",
    "at": "2026-10-02T06:08:58.732Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-02",
    "at": "2026-10-02T06:32:09.718Z",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-10-02",
    "at": "2026-10-02T06:32:09.995Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-10-02",
    "at": "2026-10-02T06:32:40.142Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-10-02",
    "at": "2026-10-02T06:33:02.950Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-10-02",
    "at": "2026-10-02T06:33:08.636Z",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-10-02",
    "at": "2026-10-02T06:35:01.468Z",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-10-02",
    "at": "2026-10-02T06:35:01.668Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-014",
    "date": "2026-10-02",
    "at": "2026-10-02T06:37:38.067Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-015",
    "date": "2026-10-02",
    "at": "2026-10-02T06:37:38.257Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-002."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-016",
    "date": "2026-10-02",
    "at": "2026-10-02T06:41:15.981Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-003."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-017",
    "date": "2026-10-02",
    "at": "2026-10-02T06:41:16.343Z",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-018",
    "date": "2026-10-02",
    "at": "2026-10-02T06:41:27.759Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  }
]
```
