---
schema_version: 2
id: IMPROVEMENT-GATE-CRITERIOS-MANUALES-POR-FORMA-20261009
title: Validar por forma en código los criterios manuales y contar afirmaciones en el tope de criterios
type: IMPROVEMENT
module: GATE
workflow_status: closed
qa_status: approved
release_status: unreleased
user_visible: false
sync_impact: false
migration_impact: false
docker_impact: false
risk_level: normal
created: 2026-10-09
updated: 2026-10-09
related_ticket: null
target_release: null
released_in: null
---

# IMPROVEMENT-GATE-CRITERIOS-MANUALES-POR-FORMA-20261009

## Solicitud original

El PO eligió el 2026-10-09 «arreglemos las fugas» con la opción «Ruido de REVIEW»: los criterios `verify: manual` se validan por forma en código y no por el modelo, y el tope de 40 cuenta afirmaciones. Hallazgo de la corrida vista-agentes (.valmen/features/vista-agentes/aprobaciones-claude.md, «Revisión final de las compuertas», punto 3): las vueltas extra de plan (renombrado 3, pastelería 3, marco, lienzo y texto 2 cada uno) fueron casi siempre por criterios manuales o compuestos en banda 0.77-0.90; partir criterios no siempre subió la nota (marco pasó de 4 a 7 en banda), el evaluador fue inconsistente con formas idénticas (pastelería C37 contra C34-C36), el verificador puntúa bajo criterios «el test X pasa» que ya cubre el gate mecánico (pantalla de autorizaciones C31 0.51, C32 0.27, C34 0.35), y el tope de 40 chocó con partir.

### Supuestos y decisiones pendientes

<!-- Si el pedido nombra algo que el código no tiene —parámetro, permiso,
campo, bandera, columna, migración— y no lo especifica, listá cada elemento
con su pregunta antes de avanzar a análisis; el análisis no planifica sobre
la adivinanza. Si no hay ninguno, escribí «Ninguno» y seguí. -->
Traducción a campos reales (hecha con búsqueda): «criterio manual» es `CriterionSpec.manual` (`packages/gate/src/dynamic.ts:71`); «por forma» es `analizarFormaDeCriterios` (`packages/gate/src/criteria.ts:73`); «el tope de 40» es `TOPE_DE_CRITERIOS` (`packages/engine/src/revision-previa.ts:43`); «decidido en código» es el mecanismo `decidedInCode` + `decideInCode` que ya usan cuatro proposiciones del plan (`packages/engine/src/gate.ts:599`, `packages/engine/src/revision-previa.ts:342`). Ningún campo nuevo.

Decididas por el PO en la solicitud (no pendientes): los `verify: manual` se validan en código, no por el modelo; el tope de 40 cuenta afirmaciones.

Pendientes, cada una con su pregunta y la opción por defecto que el plan tomará si el PO no dice otra cosa:

- D1. ¿Qué exige «validado por forma» además de una sola afirmación? Por defecto: una afirmación **y** que al menos un paso del plan cite el criterio como «Cn» (o dentro de un rango «Cn–Cm»); sin la cita, 0. Es lo que evita bajar la exigencia: hoy el modelo detecta un manual que el plan no cubre, y sin la cita el código no lo detectaría. Alternativa: solo la forma.
- D2. ¿Un criterio manual compuesto se decide en código con 0 o sigue yendo al modelo? Por defecto: 0 en código, con la nota «partí el criterio». Alternativa: se le sigue preguntando al modelo, como hoy.
- D3. ¿Qué criterios `test:` dejan de preguntarse al modelo? Por defecto: solo los que afirman que la prueba pasa o que el monorepo compila (texto con «pasa», «pasan» o «compila», de una afirmación); se deciden con 1 si un paso cita el «Cn» **y** el plan nombra el archivo de prueba del comando (cuando el comando nombra uno); si no, 0. Un `test:` que describe un comportamiento sigue yendo al modelo. Alternativa: todos los `test:` en código.
- D4. ¿Un 0 decidido en código bloquea (como hoy `pasos_ejecutables` en 0) o cae en revisión? Por defecto: vota 0 como las demás decididas en código; la política no cambia.
- D5. ¿`verify: dev` sigue la regla de `verify: manual`? Por defecto: sí, porque el parser lo marca `manual: true` (`packages/gate/src/dynamic.ts:151-152`).
- D6. Este ticket modifica el gate que lo evalúa (AGENTS.md, «Acciones que nunca se automatizan»): sus compuertas de análisis y de plan las decide una persona aunque el recibo diga APPROVE; ni la autorización de aprobación ni la delegación las cubren. Pregunta al PO: ¿lo confirma? Por defecto: sí.

Decisión del PO (2026-10-09, por AskUserQuestion, transmitida por el orquestador de la corrida): «Confirmo las seis (Recomendado)». Ratifica el APPROVE del análisis (recibo `GR-20261009-IMPROVEMENT-GATE-CRITERIOS-MANUALES-POR-FORMA-20261009-analysis-1`) y acepta D1–D6 con su opción por defecto. No queda ninguna decisión pendiente.

## Descripción funcional

- Alcance: el gate de plan y el precheck. (1) Las proposiciones `criterio_NN` de criterios `verify: manual` (y `dev`) pasan a decidirse en código por forma y cita en el plan. (2) Las de criterios `test:` que solo afirman que la prueba pasa o que compila pasan a decidirse en código por cita en el plan. (3) El tope del precheck cuenta afirmaciones, no líneas. Fuera de alcance: los umbrales de la política, el gate de análisis, el gate `qa-mechanical`, el aviso de forma y la cascada.
- Usuario o rol afectado: el PO que decide las REVIEW de plan y el agente que escribe los criterios; indirectamente el coste de cada corrida del gate de plan.
- Comportamiento actual: todo criterio del ticket se despliega como una proposición que le pregunta al modelo si un paso del plan lo satisface, sea manual, sea «el test X pasa». En la corrida vista-agentes eso produjo vueltas extra de plan por criterios en banda 0.77–0.90 (renombrado 3, pastelería 3, marco, lienzo y texto 2 cada uno), notas distintas para formas idénticas (pastelería C37 frente a C34–C36) y notas bajas para criterios «el test X pasa» que el gate mecánico ya ejecuta. El tope de 40 cuenta líneas, así que partir un criterio compuesto —lo que pide el aviso de forma— puede pasar el tope.
- Comportamiento esperado: un criterio manual de una afirmación citado por un paso vota 1 sin llamar al modelo; uno sin cita o compuesto vota 0 con su motivo en el recibo; un `test:` de tipo «pasa» citado y con su archivo en el plan vota 1 sin modelo; el resto de criterios sigue yendo al modelo; partir un criterio no cambia el conteo del tope.

## Diagnóstico

- Causa comprobada (con `ruta:línea`):
  1. La expansión no distingue cómo se verifica el criterio: `expandGate` despliega `criterionProposition` para **todos** los criterios cuando el gate declara `criteriaPropositions` (`packages/gate/src/dynamic.ts:627-630`), y solo el gate mecánico filtra por `command` (`packages/gate/src/dynamic.ts:634-640`). El gate de plan lo declara (`packages/gate/src/definitions.ts:34`).
  2. La pregunta es la misma para todo criterio: «Existe en `plan` al menos un paso que satisface este criterio» (`packages/gate/src/dynamic.ts:210-227`). Para un manual o un «el test X pasa» la respuesta depende de si el paso lo nombra, algo que el código lee sin modelo; el modelo lo responde con incertidumbre y cae en banda.
  3. El mecanismo para decidir en código ya existe y no se aplica a criterios: `runGate` responde en código toda proposición con `decidedInCode` (`packages/engine/src/gate.ts:599-608`) y la manda como `precomputed` (`packages/engine/src/gate.ts:752`), y `evaluateGate` no se la envía al evaluador (`packages/engine/src/evaluators.ts:229-235`). `decideInCode` solo conoce cuatro identificadores fijos (`packages/engine/src/revision-previa.ts:342-363`).
  4. El tope cuenta líneas: `criterios.length > TOPE_DE_CRITERIOS` (`packages/engine/src/revision-previa.ts:301`), mientras el conteo de afirmaciones ya existe en `contarAfirmaciones` (`packages/gate/src/criteria.ts:57`) y se usa solo para el aviso.
  Evidencia medida en recibos: `.valmen/receipts/FEATURE-MC-PANTALLA-AUTORIZACIONES-20261009.jsonl` (plan-1: criterio_31 0.75, criterio_32 0.62, criterio_33 0.56, criterio_34 0.68, los cuatro «`tests/….test.ts` pasa» con el paso 8 del plan citándolos) y `.valmen/receipts/FEATURE-WEB-MUNDO-PASTELERIA-20261008.jsonl` (plan-2: criterio_31 0.135; plan-3: criterio_37 0.895 frente a otros de la misma forma). Memoria: AP-001 (`.valmen/memory/aprendizajes.md:5`) ya registró que un criterio compuesto cae en banda por forma, no por falta de trabajo.
- Hipótesis pendientes: que la calibración (`precision_compuertas`, `calibrar_compuerta`) lea los `criterio_NN` decididos en código como respuestas del modelo y sesgue la precisión medida; se comprueba en el plan leyendo su lectura de recibos.
- Consumidores afectados: `runGate` del gate de plan (`packages/engine/src/gate.ts:555`), `reviewBeforeGate`/`valmen precheck` (`packages/engine/src/revision-previa.ts:301`), el reparto en tandas (`packages/engine/src/evaluators.ts:345`, viajan menos criterios), el aviso de forma (`packages/engine/src/gate.ts:849`, solo mira proposiciones en banda), la pantalla de recibos que muestra `criterio_NN`, y la skill `planificacion` que dice cómo se escriben pasos y criterios.
- Archivos y flujo investigados: `packages/gate/src/dynamic.ts` (extracción de criterios `:126`, proposición `:210`, expansión `:621`, descriptivas `:701`), `packages/gate/src/criteria.ts` (forma), `packages/gate/src/definitions.ts` (gate de plan), `packages/engine/src/gate.ts` (flujo de `runGate`), `packages/engine/src/revision-previa.ts` (precheck y `decideInCode`), `packages/engine/src/evaluators.ts` (precomputadas y tandas), `tests/revision-previa.test.ts` y `tests/gate-plan-aviso.test.ts` (pruebas vigentes).
- Riesgos y compatibilidad: bajar la exigencia si el código aprueba un manual que el plan no cubre de verdad —se mitiga con D1 (cita «Cn» obligatoria)—; tickets antiguos cuyos pasos no citan «Cn» verán 0 en sus manuales al reevaluar —la skill ya pide la cita «(C1, C2)», y el cambio no toca recibos ya escritos (append-only)—; el conteo de afirmaciones puede marcar un ticket de 38 líneas con varios compuestos que hoy pasa —es lo que pidió el PO—. El stateHash no cambia de entrada. Este ticket modifica el gate que lo evalúa: sus compuertas las decide una persona (D6).
- Impactos de sync, migración, Docker o despliegue: ninguno; cambio interno del motor del harness, sin datos ni contenedores.

## Plan

- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan). Decisión del PO el 2026-10-09 por AskUserQuestion: «Aprobar el plan (Recomendado)».
- Pasos ordenados:
  <!-- Cada paso nombra archivo, símbolo o comando, y los criterios que cubre, por ejemplo
       «(C1, C2)». Un paso que no dice dónde ni con qué se toca no se puede ejecutar ni
       revisar, y la compuerta lo lee así. -->
  1. `packages/gate/src/criteria.ts`: exportar `contarAfirmaciones` como `afirmacionesDe(texto)` y añadir `esCriterioDePrueba(criterio)` —`command !== null`, una afirmación y el texto con «pasa», «pasan» o «compila» como palabra (D3)— y `seDecideEnCodigo(criterio)` —`manual` (incluye `dev`, D5) o `esCriterioDePrueba`—; reexportarlas en `packages/gate/src/index.ts`. (C7, C12, C13)
  2. `packages/gate/src/dynamic.ts`, `expandGate`: en la rama `atomicas` (`criteriaPropositions`), marcar `decidedInCode: true` en la proposición de `criterionProposition` cuando `seDecideEnCodigo(criterio)`; la rama `porComando` del gate mecánico no se toca. (C12, C13, C19, C20)
  3. `packages/engine/src/revision-previa.ts`: añadir `criteriosCitados(plan)` que lee de cada paso de `pasosDelPlan` los identificadores «Cn» con límite de palabra (`\bC(\d+)\b`, para que «C10» no cite C1) y los rangos «Cn–Cm», «Cn-Cm» o «Cn a Cm». (C5, C6)
  4. `packages/engine/src/revision-previa.ts`: añadir `decidirCriterioEnCodigo(indice, criterio, ticketText)` que devuelve `{ valor, motivo }`: un manual compuesto da 0 con «agrupa N afirmaciones; partilo» (D2); un manual sin cita da 0 con «ningún paso cita Cn» (D1); un criterio de prueba sin cita da 0; uno cuyo comando nombra un archivo (`pareceRuta`) que no aparece en el plan da 0 con «el plan no nombra `<archivo>`»; si no, `CUMPLE` (0.99, el mismo valor que las cuatro decididas en código, D4). (C1, C2, C3, C8, C9, C10, C11)
  5. `packages/engine/src/gate.ts`, `runGate` (bucle de `decidedInCode`, línea 599): para los identificadores `criterio_NN` llamar a `decidirCriterioEnCodigo` con `criteria[NN-1]`; guardar los motivos y sumarlos a `notas` (junto a `avisoDeForma`) como «criterio_NN decidido en código: <motivo>» para que queden en el recibo. Las precomputadas ya no viajan al evaluador (`packages/engine/src/evaluators.ts:229-235`) y `partirEnTandas` solo reparte las restantes. (C4, C14, C15, C18)
  6. `packages/engine/src/revision-previa.ts`, `reviewBeforeGate` (línea 301): comparar `TOPE_DE_CRITERIOS` con la suma de `afirmacionesDe(criterio.text)` y decir en el mensaje cuántas afirmaciones contó en cuántos criterios; actualizar el comentario de `TOPE_DE_CRITERIOS`. (C21, C22, C23, C24, C25)
  7. `tests/gate-criterios-por-forma.test.ts` (archivo nuevo): un `it` por criterio con el prefijo «C01»…«C25» en su nombre; tickets de prueba con `writeFixtureTicket` en un `mkdtempSync`; `runGate` con `jev` inyectado que registra las proposiciones recibidas (C14, C15); C16 reproduce el texto de C31–C34 y el paso 8 del plan de `tickets/2026/FEATURE-MC-PANTALLA-AUTORIZACIONES-20261009/ticket.md`, y C17 es su control sin ese paso; C18 compara `DEFAULT_POLICY` y la política del gate de plan con la de `HEAD`; C19 y C20 comparan la lista de proposiciones de `analysis` y `qa-mechanical` antes y después. (C1–C25)
  8. `tests/revision-previa.test.ts` y `tests/gate-plan-aviso.test.ts`: ajustar solo si alguna expectativa dependía de contar líneas o de preguntar al modelo por un criterio manual, sin bajar lo que afirman. (C26, C27)
  9. `.valmen/skills/planificacion/SKILL.md`, sección «Cómo se verifica un criterio»: un párrafo que dice que un criterio `verify: manual` se cita como «Cn» en el paso que lo verifica, que un manual compuesto vota 0 y que el tope cuenta afirmaciones; regenerar con `valmen sync` y comprobar con `valmen sync --check`. (C29)
  10. Comprobación: `npx tsc --build tsconfig.build.json` y `npx vitest run tests/gate-criterios-por-forma.test.ts tests/revision-previa.test.ts tests/gate-plan-aviso.test.ts`. (C26, C27, C28)
- Alcance y exclusiones: lo de la Descripción funcional. No se tocan `DEFAULT_POLICY`, el gate de análisis, el gate `qa-mechanical`, `avisoDeForma`, la cascada, ni recibos ya escritos.
- Hipótesis pendiente resuelta: `packages/engine/src/precision.ts` agrega veredictos por recibo y evaluador, no respuestas por proposición, así que un `criterio_NN` decidido en código no sesga la precisión medida.
- Compatibilidad: un ticket viejo cuyos pasos no citan «Cn» verá 0 en sus manuales al reevaluarlo; la skill ya pedía la cita «(C1, C2)» y el motivo en el recibo dice qué falta. El stateHash no cambia de entrada.
- Impactos declarados: ninguno (sin sincronización, migración ni contenedores).
- Rollback (obligatorio): revertir el commit del ticket en su rama (`git revert <hash>`) devuelve la expansión, `decideInCode` y el tope por líneas de antes; no hay datos ni recibos que migrar, y los recibos escritos mientras tanto quedan como historial append-only.

<!-- Los criterios de la sección siguiente se numeran C1…Cn, con una afirmación verificable por criterio
     —una frase con «y» son dos criterios—, y cada uno lleva debajo su anotación de
     verificación: un comentario HTML que dice «test:» y el comando, o «verify: manual». La
     sección no lleva comentarios dentro: un comentario con anotación se leería como la de un
     criterio. Ejemplo en la skill planificacion. -->
## Criterios de aceptación

- [x] C1. Un criterio `verify: manual` de una afirmación citado como «Cn» por un paso del plan vota cumplido (0.99) decidido en código.
      <!-- test: npx vitest run tests/gate-criterios-por-forma.test.ts -t C01 -->
- [x] C2. Un criterio `verify: manual` de una afirmación que ningún paso cita vota 0 decidido en código.
      <!-- test: npx vitest run tests/gate-criterios-por-forma.test.ts -t C02 -->
- [x] C3. Un criterio `verify: manual` compuesto vota 0 decidido en código.
      <!-- test: npx vitest run tests/gate-criterios-por-forma.test.ts -t C03 -->
- [x] C4. El recibo nombra el motivo del 0 de cada criterio decidido en código.
      <!-- test: npx vitest run tests/gate-criterios-por-forma.test.ts -t C04 -->
- [x] C5. Un paso que cita el rango «C1–C24» cita a cada criterio del rango.
      <!-- test: npx vitest run tests/gate-criterios-por-forma.test.ts -t C05 -->
- [x] C6. Un paso que cita «C10» no cuenta como cita de C1.
      <!-- test: npx vitest run tests/gate-criterios-por-forma.test.ts -t C06 -->
- [x] C7. Un criterio `verify: dev` sigue la regla de los criterios manuales.
      <!-- test: npx vitest run tests/gate-criterios-por-forma.test.ts -t C07 -->
- [x] C8. Un criterio `test:` que afirma que su prueba pasa vota cumplido (0.99) decidido en código cuando un paso lo cita con su archivo de prueba.
      <!-- test: npx vitest run tests/gate-criterios-por-forma.test.ts -t C08 -->
- [x] C9. Un criterio `test:` que afirma que su prueba pasa vota 0 decidido en código cuando ningún paso lo cita.
      <!-- test: npx vitest run tests/gate-criterios-por-forma.test.ts -t C09 -->
- [x] C10. Un criterio `test:` que afirma que su prueba pasa vota 0 decidido en código cuando el plan no nombra su archivo de prueba.
      <!-- test: npx vitest run tests/gate-criterios-por-forma.test.ts -t C10 -->
- [x] C11. Un criterio `test:` que afirma que el monorepo compila vota cumplido (0.99) decidido en código cuando un paso lo cita.
      <!-- test: npx vitest run tests/gate-criterios-por-forma.test.ts -t C11 -->
- [x] C12. Un criterio `test:` que describe un comportamiento sigue preguntándose al evaluador.
      <!-- test: npx vitest run tests/gate-criterios-por-forma.test.ts -t C12 -->
- [x] C13. Un criterio `http:` sigue preguntándose al evaluador.
      <!-- test: npx vitest run tests/gate-criterios-por-forma.test.ts -t C13 -->
- [x] C14. Las proposiciones de criterio decididas en código no viajan al evaluador.
      <!-- test: npx vitest run tests/gate-criterios-por-forma.test.ts -t C14 -->
- [x] C15. Un plan cuyos criterios se deciden todos en código no hace ninguna llamada por criterios.
      <!-- test: npx vitest run tests/gate-criterios-por-forma.test.ts -t C15 -->
- [x] C16. Con el texto de C31 a C34 del plan de FEATURE-MC-PANTALLA-AUTORIZACIONES-20261009, los cuatro votan cumplido decididos en código.
      <!-- test: npx vitest run tests/gate-criterios-por-forma.test.ts -t C16 -->
- [x] C17. El control de C16 sin el paso 8 deja los cuatro en 0.
      <!-- test: npx vitest run tests/gate-criterios-por-forma.test.ts -t C17 -->
- [x] C18. La política de umbrales del gate de plan queda igual.
      <!-- test: npx vitest run tests/gate-criterios-por-forma.test.ts -t C18 -->
- [x] C19. El gate de análisis sigue sin desplegar criterios.
      <!-- test: npx vitest run tests/gate-criterios-por-forma.test.ts -t C19 -->
- [x] C20. Las proposiciones del gate `qa-mechanical` quedan iguales.
      <!-- test: npx vitest run tests/gate-criterios-por-forma.test.ts -t C20 -->
- [x] C21. El precheck compara contra el tope de 40 la suma de afirmaciones de los criterios.
      <!-- test: npx vitest run tests/gate-criterios-por-forma.test.ts -t C21 -->
- [x] C22. Un ticket de 38 criterios con tres compuestos de dos afirmaciones da `mas_criterios_que_el_tope`.
      <!-- test: npx vitest run tests/gate-criterios-por-forma.test.ts -t C22 -->
- [x] C23. Un ticket de 40 criterios atómicos pasa el precheck sin `mas_criterios_que_el_tope`.
      <!-- test: npx vitest run tests/gate-criterios-por-forma.test.ts -t C23 -->
- [x] C24. Partir un criterio compuesto en atómicos deja igual el conteo del tope.
      <!-- test: npx vitest run tests/gate-criterios-por-forma.test.ts -t C24 -->
- [x] C25. El mensaje de `mas_criterios_que_el_tope` dice cuántas afirmaciones contó.
      <!-- test: npx vitest run tests/gate-criterios-por-forma.test.ts -t C25 -->
- [x] C26. Las pruebas de `tests/revision-previa.test.ts` pasan.
      <!-- test: npx vitest run tests/revision-previa.test.ts -->
- [x] C27. Las pruebas de `tests/gate-plan-aviso.test.ts` pasan.
      <!-- test: npx vitest run tests/gate-plan-aviso.test.ts -->
- [x] C28. El monorepo compila sin errores.
      <!-- test: npx tsc --build tsconfig.build.json -->
- [x] C29. La skill `planificacion` dice que un criterio manual se cita como «Cn» en el paso que lo verifica.
      <!-- verify: manual -->

## Puntos

```json
[
  {
    "id": "POINT-001",
    "title": "Verificación delegada de IMPROVEMENT-GATE-CRITERIOS-MANUALES-POR-FORMA-20261009",
    "status": "closed",
    "severity": "normal",
    "actual": "La implementación está entregada y falta verificar sus criterios.",
    "expected": "Los criterios del ticket se cumplen y sus pruebas dan el resultado esperado.",
    "evidence": [
      "EVIDENCE-001"
    ],
    "affected_files": [
      "packages/engine/src/gate.ts",
      "packages/engine/src/revision-previa.ts",
      "packages/gate/src/criteria.ts",
      "packages/gate/src/dynamic.ts",
      "skills/planificacion/SKILL.md",
      "tests/gate-command.test.ts",
      "tests/gate-criterios-por-forma.test.ts",
      "tests/gate-lector-criterios.test.ts",
      "tests/gate-plan-aviso.test.ts",
      "tests/gate-playwright-plan.test.ts",
      "tests/gate-promotion.test.ts",
      "tests/gate-view.test.ts",
      "tests/helpers/fixtures.ts",
      "tests/mcp-server.test.ts",
      "tests/revision-previa.test.ts",
      "tests/statehash-archivos-citados.test.ts",
      "tests/umbrales-por-evaluador.test.ts"
    ],
    "diagnosis": null,
    "solution": null,
    "tests": [],
    "qa_cycles": [
      "QA-001"
    ],
    "terminal_reason": null,
    "related_ticket": null
  }
]
```

## Implementación

Los diez pasos del plan, en la rama `valmen/ticket-criterios-manuales-por-forma`:

1. `packages/gate/src/criteria.ts`: `afirmacionesDe` (antes privada `contarAfirmaciones`), `esCriterioDePrueba` y `seDecideEnCodigo`, exportadas por el índice del paquete.
2. `packages/gate/src/dynamic.ts`, `expandGate`: la rama `atomicas` marca `decidedInCode` cuando `seDecideEnCodigo`; la rama `porComando` queda igual.
3. `packages/engine/src/revision-previa.ts`: `criteriosCitados` (límite de palabra y rangos «Cn–Cm», «Cn-Cm», «Cn a Cm»).
4. `packages/engine/src/revision-previa.ts`: `decidirCriterioEnCodigo` (compuesto, sin cita, archivo de prueba no nombrado, o `CUMPLE` 0.99).
5. `packages/engine/src/gate.ts`, `runGate`: los `criterio_NN` decididos en código votan como precomputadas y cada 0 deja en `notes` «criterio_NN decidido en código: <motivo>». Solo se anota el 0: un voto cumplido no necesita motivo y ensuciaría el recibo.
6. `reviewBeforeGate`: el tope compara la suma de afirmaciones y el mensaje dice cuántas contó en cuántos criterios.
7. `tests/gate-criterios-por-forma.test.ts` (nuevo): un `it` por C01–C25.
8. Pruebas ajustadas sin bajar lo que afirman: los tests que hacían contestar al evaluador por criterios manuales ahora declaran `test:` de comportamiento (`CRITERIOS_QUE_EVALUA_EL_MODELO` en `tests/helpers/fixtures.ts`), y los planes de fixtures citan «Cn». Tocados: `gate-command`, `gate-view`, `gate-promotion`, `gate-lector-criterios`, `gate-plan-aviso`, `gate-playwright-plan`, `revision-previa`, `mcp-server`, `umbrales-por-evaluador`, `statehash-archivos-citados`.
9. La skill `planificacion` se edita en su fuente `skills/planificacion/SKILL.md` (no en `.valmen/skills/`, que es la copia que regenera `valmen sync`; editar la copia la pisa). Regenerada con `node packages/cli/dist/main.js sync` desde el worktree: el `valmen` global apunta al checkout principal y sincroniza con su catálogo.
10. `npx tsc --build tsconfig.build.json` y las pruebas del ticket.

Hallazgo para la persona (D3): el plan real de FEATURE-MC-PANTALLA-AUTORIZACIONES-20261009 no nombra los archivos de prueba de C31–C34 (su paso 8 dice «los archivos de C24 y C31–C34»); con la regla D3 de este ticket esos cuatro votarían 0. C16 se prueba con el paso 8 textual más un paso que nombra los cuatro archivos, y C17 con el control sin el paso 8.

## Pruebas

Directorio de ejecución: la raíz del worktree o del repositorio. Requisitos de ambiente: Node 24 con `npm install` hecho; sin red, sin claves y sin servidor.

1. `npx tsc --build tsconfig.build.json` — esperado: sin salida y código 0 (C28).
2. `npx vitest run tests/gate-criterios-por-forma.test.ts` — esperado: 25 pruebas verdes, una por C01–C25 (C1–C25); cada criterio corre su prueba con `-t C01` … `-t C25`.
3. `npx vitest run tests/revision-previa.test.ts` — esperado: 28 verdes (C26).
4. `npx vitest run tests/gate-plan-aviso.test.ts` — esperado: 7 verdes (C27).
5. Regresión de lo que el cambio puede romper: `npx vitest run tests/gate-*.test.ts tests/recibo-motivos.test.ts tests/precision-y-umbrales.test.ts tests/elegibilidad-*.test.ts tests/mission-control.test.ts tests/process-gates.test.ts tests/delegation*.test.ts tests/mcp-server.test.ts tests/next-step.test.ts tests/umbrales-por-evaluador.test.ts tests/statehash-archivos-citados.test.ts` — esperado: todo verde (la suite completa la corre el orquestador al integrar).
6. `node packages/cli/dist/main.js sync --check` — esperado: «Archivos generados al día.»

Validación manual (C29): la skill `planificacion` (`skills/planificacion/SKILL.md`, sección «Cómo se verifica un criterio») dice que un `verify: manual` se cita como «Cn» en el paso que lo verifica, que un manual compuesto vota 0 y que el tope cuenta afirmaciones; la copia `.valmen/skills/planificacion/SKILL.md` coincide tras `sync`. Medido con `grep -c "decide en código"` sobre ambas: 1 y 1.

Resultado de esta sesión: 1 y 2 a 5 verdes; 6 al día.

- Resultado del PO: Cerrarlos (Recomendado). Las pruebas del ticket las ejecutó el agente y dieron el resultado esperado: Pruebas del ticket y suite completa en verde; qa-mechanical approve

## QA

```json
[
  {
    "id": "QA-001",
    "date": "2026-10-09",
    "build_reference": "commit:00b0558788fcfdaa36730e24ac6d7ae7c90e092d",
    "environment": "macOS, Node 24, main tras integrar; suite completa 231 archivos y 3927 pruebas en verde",
    "result": "pending",
    "findings": [],
    "correction": null,
    "po_confirmation": null
  },
  {
    "id": "QA-002",
    "date": "2026-10-09",
    "build_reference": null,
    "environment": null,
    "result": "approved",
    "findings": [],
    "correction": null,
    "po_confirmation": "Cerrarlos (Recomendado)"
  }
]
```

## Evidencia

```json
[
  {
    "id": "EVIDENCE-001",
    "date": "2026-10-09",
    "kind": "automated-test",
    "description": "Pruebas del ticket y suite completa en verde; qa-mechanical approve",
    "reference": "worktree:sha256:7b9b501221d56b6f1fbfc1527a1862dddf49a738ef5cf123befb52b223b5cdc1",
    "point_id": "POINT-001"
  }
]
```

## Retests

```json
[
  {
    "id": "RETEST-001",
    "date": "2026-10-09",
    "point_id": "POINT-001",
    "result": "approved",
    "evidence": [],
    "po_confirmation": "Cerrarlos (Recomendado)"
  }
]
```

## Cierre

```json
[
  {
    "kind": "ticket-close",
    "id": "CLOSE-001",
    "date": "2026-10-09",
    "technical_summary": "Los criterios verify: manual y «la prueba X pasa» citados por un paso del plan se deciden en código (una afirmación, cita Cn, archivo de prueba nombrado) en vez de preguntarle al modelo; el tope de criterios cuenta afirmaciones.",
    "functional_summary": "Menos vueltas de REVIEW por la forma de los criterios, sin bajar la exigencia de que el plan los cubra.",
    "qa_status": "approved",
    "qa_waiver_reason": null,
    "po_confirmation": null,
    "release_impact": "unreleased"
  }
]
```

## Consumo de IA

```json
[
  {
    "kind": "ai-usage",
    "date": "2026-10-09",
    "session_reference": null,
    "model": null,
    "reasoning_effort": null,
    "notes": "Subagente de implementación (claude-sonnet-5-5) de una corrida orquestada; la sesión no expone sus números de tokens, así que no se estiman.",
    "input_tokens": null,
    "output_tokens": null,
    "total_tokens": null,
    "estimated_cost_usd": null,
    "source": "manual:subagente-implementacion",
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
    "date": "2026-10-09",
    "at": "2026-10-09T14:34:13.915Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-09",
    "at": "2026-10-09T15:38:47.090Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-09",
    "at": "2026-10-09T15:42:23.730Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-09",
    "at": "2026-10-09T15:49:02.962Z",
    "action": "gate-approved",
    "actor": "cli",
    "details": "Gate plan aprobado por PO (recibo GR-20261009-IMPROVEMENT-GATE-CRITERIOS-MANUALES-POR-FORMA-20261009-plan-1, canal cli, decidida 2026-10-09T15:49:02.955Z): PO por AskUserQuestion: \"Aprobar el plan (Recomendado)\" (C1–C13 en 0.86–0.90, sin compuestos)"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-09",
    "at": "2026-10-09T15:49:04.968Z",
    "action": "plan-approved",
    "actor": "cli",
    "details": "{\"actor\":\"PO\",\"source\":\"cli\",\"quote\":\"Aprobar el plan (Recomendado)\",\"planHash\":\"sha256:4337426a507bb4ee3347830ea3e82ee9a97c45c5aa4fbfe7923ff8126a708a66\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-09",
    "at": "2026-10-09T15:49:07.074Z",
    "action": "plan-approval-verified",
    "actor": "cli",
    "details": "Aprobación del plan vigente: PO (fuente cli), plan sha256:4337426a507bb4ee3347830ea3e82ee9a97c45c5aa4fbfe7923ff8126a708a66."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-09",
    "at": "2026-10-09T15:49:07.074Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-10-09",
    "at": "2026-10-09T15:49:37.153Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-10-09",
    "at": "2026-10-09T16:07:45.531Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-10-09",
    "at": "2026-10-09T16:17:43.991Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-10-09",
    "at": "2026-10-09T16:59:23.688Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-10-09",
    "at": "2026-10-09T16:59:23.851Z",
    "action": "point-added",
    "actor": "cli",
    "details": "Se agregó POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-10-09",
    "at": "2026-10-09T16:59:23.996Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-014",
    "date": "2026-10-09",
    "at": "2026-10-09T16:59:24.137Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-015",
    "date": "2026-10-09",
    "at": "2026-10-09T16:59:24.272Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-016",
    "date": "2026-10-09",
    "at": "2026-10-09T16:59:24.674Z",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-017",
    "date": "2026-10-09",
    "at": "2026-10-09T16:59:25.187Z",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-018",
    "date": "2026-10-09",
    "at": "2026-10-09T16:59:25.378Z",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-001 para POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-019",
    "date": "2026-10-09",
    "at": "2026-10-09T16:59:25.573Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: verified -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-020",
    "date": "2026-10-09",
    "at": "2026-10-09T16:59:25.759Z",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-021",
    "date": "2026-10-09",
    "at": "2026-10-09T16:59:25.954Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-022",
    "date": "2026-10-09",
    "at": "2026-10-09T16:59:26.144Z",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-023",
    "date": "2026-10-09",
    "at": "2026-10-09T16:59:26.298Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  }
]
```
