---
schema_version: 2
id: BUGFIX-GATE-LECTOR-CRITERIOS-20261005
title: Leer solo ítems de lista como criterios y evaluarlos todos sin recorte
type: BUGFIX
module: GATE
workflow_status: awaiting_user_tests
qa_status: pending
release_status: unreleased
user_visible: false
sync_impact: false
migration_impact: false
docker_impact: false
risk_level: normal
created: 2026-10-05
updated: 2026-10-05
related_ticket: null
target_release: null
released_in: null
---

# BUGFIX-GATE-LECTOR-CRITERIOS-20261005

## Solicitud original

Parte del sprint: Compuertas sin defectos: lector de criterios, contradicción descriptiva, firma, motivos, fallas del entorno, preparación del ambiente y no repetir sobre el mismo estado.
- R-CDEF-001: El lector de criterios DEBE tomar como criterio solo un ítem de lista
- R-CDEF-002: Un ticket con más criterios que el tope NO DEBE evaluarse con un recorte silencioso
Viene de una feature descompuesta en sprints; su plan completo está en el tickets.yaml de la feature.

### Supuestos y decisiones pendientes

<!-- Si el pedido nombra algo que el código no tiene —parámetro, permiso,
campo, bandera, columna, migración— y no lo especifica, listá cada elemento
con su pregunta antes de avanzar a análisis; el análisis no planifica sobre
la adivinanza. Si no hay ninguno, escribí «Ninguno» y seguí. -->
Ninguno.

## Descripción funcional

- Alcance: el lector de criterios de aceptación que usan las compuertas `plan` y `qa-mechanical` (`extractCriteriaSpecs`) y la forma en que el evaluador recibe los criterios cuando son más de 12. Quedan fuera la revisión previa y su aviso por más de 12 criterios (R-CPRE-008, sprint S2), la cola de la salida de los comandos (R-CDEF-006) y la regla de contradicción (R-CDEF-003).
- Usuario o rol afectado: quien lee un recibo de compuerta para decidir (el PO) y quien escribe tickets; los dos reciben hoy un veredicto sobre criterios que el ticket no declara y sin los que sí declara.
- Comportamiento actual: toda línea no vacía de la sección «Criterios de aceptación» con 12 caracteres o más cuenta como criterio, lleve viñeta o no. El comentario de la plantilla («Una afirmación verificable por criterio…», tres líneas) se evalúa como `criterio_01..03` y el plan bloquea con 0.01. Una viñeta que ocupa dos líneas genera además un criterio falso con la segunda. Después el lector corta en 12 sin avisar: los criterios 13 en adelante no se preguntan al evaluador, no se ejecutan en `qa-mechanical` y no se revisan en `revisarCriteriosVerificables`.
- Comportamiento esperado: es criterio solo un ítem de lista (casilla, guion o número); un comentario HTML que no sea anotación `test:` o `verify:` nunca lo es, y la línea de continuación de una viñeta pertenece a esa viñeta. Un ticket con más de 12 criterios los evalúa todos, en tandas de hasta 12 que el recibo declara; `qa-mechanical` corre todos los comandos declarados.

## Diagnóstico

- Archivos y flujo investigados:
  - `packages/gate/src/dynamic.ts:77-119` (`extractCriteriaSpecs`): recorre `section.split("\n")`; en `:81-83` el `replace` quita la viñeta **si existe**, pero la línea se acepta igual; el único filtro es `text.length < 12` en `:114`. `:118` corta con `specs.slice(0, MAX_CRITERIA_PROPOSITIONS)` (`:22`, valor 12), después de haber contado las líneas falsas.
  - Consumidores del lector, todos heredan los dos defectos: `packages/engine/src/gate.ts:381` (`revisarCriteriosVerificables`, `:163`) y `:394` (`gateFor`, que despliega una proposición `criterio_NN` por criterio), `packages/engine/src/simulate.ts:188`, `packages/engine/src/next-step.ts:166`, `packages/engine/src/autonomous-run.ts:95` y `packages/server/src/gates.ts:280`.
  - `packages/engine/src/evaluators.ts:197` (`evaluateGate`) manda todas las proposiciones semánticas en una sola llamada a `runSemantic` (`:216` y `:256`); no hay otro tope por debajo del lector. `qa-mechanical` (`commandPropositions`, `definitions.ts:319`) arma un check por criterio con `commandChecksFor` (`dynamic.ts:207`) y `evaluateWithCommands` (`packages/gate-command/src/command.ts:272`) no recorta: el único recorte de comandos es el del lector.
  - Evidencia en seis recibos reales, `criterio_01..03` salen de las tres líneas del comentario de la plantilla (la descripción de la proposición es la línea textual): `BUGFIX-GATE-CONTRADICCION-ANALYSIS-20261005` plan-1 (block, 0.01 los tres), `IMPROVEMENT-SKILLS-PUBLICADAS-20260926` (review, 0.86/0.77/0.80), y en SaiOpenCloud `BUGFIX-POS-EDICION-MANUAL-AJUSTES-20260929`, `FEATURE-EDICION-REORGANIZACION-20260928`, `FEATURE-RELLENO-ANULACION-PANTALLA-20260928` e `IMPROVEMENT-POS-MENSAJE-ORDEN-NO-FACTURADA-20261005` (review, entre 0.72 y 0.93).
  - Recorte silencioso comprobado: `IMPROVEMENT-SKILLS-PUBLICADAS-20260926` declara 13 criterios reales; su recibo trae 12 proposiciones de criterio, 3 falsas y 9 reales, así que 4 criterios reales no se preguntaron nunca. La causa se suma: las líneas falsas consumen el cupo de 12.
  - Medición con un prototipo del lector nuevo (solo viñetas, comentarios fuera, continuación unida) sobre los tickets del registro: en este repositorio 130 tickets con criterios, 5 con más de 12 (todos `closed`) y 1 cuya lectura cambia por el comentario de la plantilla (`BUGFIX-ENGINE-FIRMA-DE-COMPUERTA-20261004`); en SaiOpenCloud 119 tickets, 10 con más de 12 y 5 con viñetas de dos líneas cuya segunda línea hoy es un criterio falso (todos `closed`). Es una medición del prototipo, no del código final.
  - Memoria: `buscar_memoria` devuelve AP-001 (un criterio compuesto cae en banda de revisión) y AP-004/AP-005 (bloqueos por una sola proposición contradictoria). Ninguno cubre el lector: AP-001 explica por qué un criterio compuesto puntúa 0.87-0.89, y acá la causa es anterior, que un criterio ajeno al ticket entre a la lista. La decisión D2 (`.valmen/features/autonomia-confiable/design.md`) fija la forma: evaluar en tandas del tamaño del tope.
- Causa raíz o hipótesis: causa comprobada, no hipótesis. El lector trata la viñeta como opcional y decide por el largo de la línea, así que cualquier texto de la sección es un criterio, y el comentario de la plantilla cumple el largo. El recorte a 12 se introdujo con el gate dinámico (commit `18577a3`) para acotar el costo por llamada, pero se aplicó dentro del lector, de modo que lo que se corta no pasa por ningún gate ni por el chequeo de que cada criterio declare cómo se verifica. El lector decide qué es un criterio, y el evaluador decide cuántos entran en una llamada: están mezclados en una función.
- Riesgos y compatibilidad:
  - Tickets con más de 12 criterios: el costo del gate `plan` crece de forma lineal (13 criterios pasan de 1 a 2 llamadas). Con 12 o menos la corrida es idéntica a la de hoy, una sola llamada.
  - Los criterios 13 en adelante dejan de ser invisibles: `revisarCriteriosVerificables` y el requisito `tests-declared` del modo autónomo (`autonomous-run.ts:95`, `next-step.ts:166`) los exigen con `test:` o `verify:`, así que un ticket abierto con un criterio 13+ sin anotación pasa a detenerse en `qa-mechanical`. Es el efecto buscado; hoy los 15 tickets con más de 12 están `closed`, así que no se reabre ninguno.
  - Una viñeta de dos líneas cambia de texto: la continuación se une a su criterio. Cambia la cantidad de proposiciones en 5 tickets cerrados; no cambia el `stateHash` de ningún ticket porque el hash se calcula sobre el texto de la sección y no sobre la lectura.
  - Una anotación `test:` que ocupe dos líneas nunca se reconoció (el patrón exige el cierre en la misma línea) y hoy genera dos criterios falsos; el lector nuevo la lee completa. Un comentario sin cerrar al final de la sección se descarta hasta el final de la sección: no puede tragarse criterios de otra.
  - `http:` (S6, R-QAAG-007) no se interpreta todavía: hoy se descarta como cualquier comentario no reconocido, que es lo que pide la spec. S6 lo agrega al reconocimiento sin tocar esto.
  - Un recibo anterior no se reescribe (bloque append-only): los seis recibos con el defecto quedan como están y son el vector de la prueba.
- Impactos de sync, migración, Docker o despliegue: ninguno. Cambio de código del motor (`@valmen/gate` y `@valmen/engine`); sin sincronización, migración, contenedores, autenticación ni despliegue; no modifica hosts permitidos ni credenciales.

## Plan

- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan). Frase literal del PO el 2026-10-05: «Si dale la recomendada», en respuesta a la propuesta de aprobar el plan con la opción A (unir la continuación de una viñeta a su criterio) y dejar `tickets/index.md` fuera del commit. Recibo del gate: `GR-20261006-BUGFIX-GATE-LECTOR-CRITERIOS-20261005-plan-1` (approve, actor model; `corresponde_a_la_investigacion` = 0.00 descriptiva, vista por el PO).
- Alcance y exclusiones: se corrige el lector (`extractCriteriaSpecs`) y se despliegan los criterios en tandas al evaluar (`evaluateGate`); `qa-mechanical` queda sin tope porque deja de recortar el lector. Fuera: el aviso de la revisión previa por más de 12 criterios (R-CPRE-008, S2), la cola de la salida de los comandos (R-CDEF-006) y el reconocimiento de `http:` (S6). Decisión incluida en esta aprobación: la línea de continuación de una viñeta se une a su criterio, porque sin eso un criterio de dos líneas perdería su segunda mitad.
- Pasos ordenados (responsable: el agente que implementa; rama de trabajo `main`, sin worktree):
  1. Prueba que falla primero. Crear `tests/fixtures/lector-criterios-recibos.json` con las secciones de criterios que evaluaron los seis recibos reales (el comentario de la plantilla de tres líneas más los criterios con viñeta, tomados de la descripción de cada proposición `criterio_NN` del recibo) y de las 13 viñetas de `IMPROVEMENT-SKILLS-PUBLICADAS-20260926`. Crear `tests/gate-lector-criterios.test.ts` con un `it` por criterio de este ticket, cuyo nombre empieza con el texto que el criterio usa en `-t` (por ejemplo `it("R-CDEF-001 plantilla: …")`), para que cada comando `test:` ejecute exactamente su prueba. Correr `npx vitest run tests/gate-lector-criterios.test.ts` y comprobar que falla por el defecto, no por el armado.
  2. Corregir el lector en `packages/gate/src/dynamic.ts`, función `extractCriteriaSpecs`: (a) retirar antes de leer todo bloque `<!-- … -->`, también el de varias líneas; el que cumple `ANOTACION_RE` (`test:`, `verify:`) se asocia al criterio de su línea o al anterior, aunque la anotación ocupe dos líneas, y el resto se descarta; un comentario sin cierre se descarta hasta el final de la sección; (b) una línea abre criterio solo si empieza con viñeta, con el patrón de casilla, guion o número que ya usa `:81-83`; (c) una línea sin viñeta pegada a una viñeta, sin línea en blanco entre ambas, se une a su texto, y tras una línea en blanco no es criterio; (d) conservar el filtro `text.length < 12` sobre el texto unido; (e) eliminar `specs.slice(0, MAX_CRITERIA_PROPOSITIONS)` de `:118`. Reescribir el comentario de `MAX_CRITERIA_PROPOSITIONS` (`:21-22`): pasa a ser el tamaño de una tanda y no un tope del lector; el nombre exportado se conserva.
  3. Evaluar en tandas en `packages/engine/src/evaluators.ts`: agregar `runSemanticEnTandas`, que reemplaza las dos llamadas a `runSemantic` de `evaluateGate` (`:216` y `:256`). Parte las proposiciones en tandas con a lo sumo `MAX_CRITERIA_PROPOSITIONS` proposiciones `criterio_NN`, deja las que no son de criterio en la primera, las corre en orden, concatena `answers` y `escalations`, suma `usage.inputTokens`, `outputTokens`, `costUsd` y `latencyMs`, conserva `model` de la primera tanda y agrega el campo `tandas` a `EvaluationOutcome`. Con 12 criterios o menos hay una sola tanda y la llamada es la de hoy.
  4. Dejar constancia en el recibo en `packages/engine/src/gate.ts`, donde se arma `notas` (`:560-570`): cuando `evaluation.tandas > 1`, agregar la nota «N criterios evaluados en K tandas de hasta 12», para que el recorte no sea invisible en ningún sentido.
  5. Pruebas de integración. En `tests/evaluators.test.ts` agregar los casos `R-CDEF-002` con un juez inyectado: 31 criterios dan 3 llamadas, cada `criterio_NN` se pregunta una vez, las fijas solo en la primera tanda y el consumo es la suma; 12 criterios dan 1 llamada. En `tests/gate-mecanico.test.ts` agregar el caso `R-CDEF-002` con 31 criterios `<!-- test: node -e "process.exit(0)" -->` que corre `runGate` de `qa-mechanical` y comprueba 31 `commandResults` y veredicto de aprobación. En `tests/gate-lector-criterios.test.ts` agregar el caso con `runGate` de `plan` y juez inyectado: la plantilla más dos viñetas da un recibo con exactamente `criterio_01` y `criterio_02`.
  6. Verificar sin regresiones: `npx vitest run` desde la raíz del repositorio y `npm run typecheck`. Si falla una prueba previa, se distingue lo que rompe este cambio de lo que ya fallaba por los cambios sin commitear de otra sesión, y se informa sin tocar esos archivos.
  7. Documentar en `docs/03-GATES.md`, §5.1quater, un párrafo con el contrato del lector (solo viñetas, comentarios fuera, continuación unida) y de las tandas. Correr `npx vitest run tests/docs` por si alguna prueba de documentación lee ese archivo.
  8. Entregar: llenar `## Implementación` y `## Pruebas` del ticket con el contrato de pruebas (comandos exactos, directorio, resultado esperado), marcar con `- [x]` los criterios que el gate `qa-mechanical` confirme, registrar el consumo de la sesión con fuente `claude:` y mover a `awaiting_user_tests`. El commit se hace solo tras la confirmación de las pruebas por el PO, con únicamente los archivos de este ticket.
- Dependencias: ninguna (primer ticket del sprint S1); desbloquea `FEATURE-GATE-APLICABILIDAD-POR-TIPO-20261005` y `FEATURE-ENGINE-REVISION-PREVIA-20261005`, que dependen de él. Compuertas que aplican: `plan` antes de aprobar y `qa-mechanical` antes de la entrega; el ticket no es crítico y no declara impactos, pero la aprobación humana del plan es obligatoria por indicación del PO.
- Compatibilidad y orden de despliegue: sin migración ni despliegue; el cambio entra en un solo commit. Con 12 criterios o menos el comportamiento del gate `plan` no cambia. Los 15 tickets conocidos con más de 12 criterios están `closed`.
- Rollback: `git revert` del commit del ticket. No hay datos que restaurar: los recibos nuevos solo agregan una nota (`notes`) a un campo que ya existe y los anteriores no se reescriben.

## Criterios de aceptación

- [x] R-CDEF-001: `extractCriteriaSpecs` ignora un comentario HTML de varias líneas que no es anotación `test:` ni `verify:`, así que la plantilla y dos viñetas dan exactamente dos criterios
      <!-- test: npx vitest run tests/gate-lector-criterios.test.ts -t "R-CDEF-001 plantilla" -->
- [x] R-CDEF-001: sobre las secciones de criterios de los seis recibos reales, `extractCriteriaSpecs` no devuelve ninguna línea del comentario de la plantilla y devuelve cada criterio con viñeta
      <!-- test: npx vitest run tests/gate-lector-criterios.test.ts -t "R-CDEF-001 recibos reales" -->
- [x] R-CDEF-001: una línea sin viñeta pegada a una viñeta se une a ese criterio, y una sin viñeta tras una línea en blanco no es criterio
      <!-- test: npx vitest run tests/gate-lector-criterios.test.ts -t "R-CDEF-001 continuación" -->
- [x] R-CDEF-001: una anotación `test:` o `verify:` sigue asociada a su criterio cuando va en la misma línea, en la de abajo o repartida en dos líneas
      <!-- test: npx vitest run tests/gate-lector-criterios.test.ts -t "R-CDEF-001 anotaciones" -->
- [x] R-CDEF-001: la compuerta `plan` sobre la plantilla y dos viñetas produce un recibo con exactamente las proposiciones `criterio_01` y `criterio_02`
      <!-- test: npx vitest run tests/gate-lector-criterios.test.ts -t "R-CDEF-001 recibo del plan" -->
- [x] R-CDEF-002: `extractCriteriaSpecs` devuelve los 31 criterios de una sección con 31 viñetas, sin recorte
      <!-- test: npx vitest run tests/gate-lector-criterios.test.ts -t "R-CDEF-002 sin recorte" -->
- [x] R-CDEF-002: `evaluateGate` con 31 criterios llama al evaluador en tres tandas de a lo sumo 12, pregunta cada criterio una vez y suma el consumo
      <!-- test: npx vitest run tests/evaluators.test.ts -t "R-CDEF-002 tandas" -->
- [x] R-CDEF-002: `evaluateGate` con 12 criterios o menos hace una sola llamada, igual que antes del cambio
      <!-- test: npx vitest run tests/evaluators.test.ts -t "R-CDEF-002 una tanda" -->
- [x] R-CDEF-002: el recibo del gate `plan` con más de 12 criterios declara en sus notas cuántos criterios se evaluaron y en cuántas tandas
      <!-- test: npx vitest run tests/gate-lector-criterios.test.ts -t "R-CDEF-002 nota de tandas" -->
- [x] R-CDEF-002: `qa-mechanical` con 31 criterios anotados con `test:` deja 31 resultados de comando en el recibo
      <!-- test: npx vitest run tests/gate-mecanico.test.ts -t "R-CDEF-002" -->
- [x] La suite completa y la comprobación de tipos pasan sin regresiones
      <!-- verify: manual -->

## Puntos

```json
[]
```

## Implementación

Hecho en `main`, sin worktree ni otra rama, siguiendo el plan aprobado:

- `packages/gate/src/dynamic.ts` — `extractCriteriaSpecs` retira primero los comentarios HTML (los de varias líneas también; solo `test:` y `verify:` se interpretan, aunque ocupen dos líneas), abre un criterio solo con viñeta, une a su criterio la línea pegada a una viñeta y ya no recorta. `MAX_CRITERIA_PROPOSITIONS` (12) pasa a ser el tamaño de una tanda.
- `packages/engine/src/evaluators.ts` — `partirEnTandas` y `runSemanticEnTandas` reemplazan las dos llamadas directas a `runSemantic` de `evaluateGate`: con más de 12 criterios se hacen varias llamadas en orden, las proposiciones fijas viajan en la primera y se suman respuestas, escalamientos, consumo y latencia. `EvaluationOutcome` gana el campo `tandas`. Con 12 o menos hay una sola llamada, como antes.
- `packages/engine/src/gate.ts` — el recibo anota «N criterios evaluados en K tandas de hasta 12.» cuando `tandas > 1`.
- `docs/03-GATES.md` — subsección «Qué cuenta como criterio y cuántos se evalúan», antes de §5.1quinquies.
- Pruebas nuevas: `tests/gate-lector-criterios.test.ts` (7), casos de tandas en `tests/evaluators.test.ts` (2) y del tope en `tests/gate-mecanico.test.ts` (1), con el vector real en `tests/fixtures/lector-criterios-recibos.json` (seis recibos y las 13 viñetas de `IMPROVEMENT-SKILLS-PUBLICADAS-20260926`).
- Se comprobó que las 10 pruebas **fallan antes del cambio**, por el defecto: el vector real devolvía 7 criterios en vez de 4 y los 31 se recortaban a 12.
- Se quitó de `evaluators.ts` un import sin uso (`PropositionAnswer`) que el lint ya señalaba.

## Pruebas

Contrato de pruebas para el responsable. Todos los comandos se ejecutan desde la raíz del repositorio, `/Users/juanandrade/Desktop/ValmenHarness`, con Node 24; no necesitan red, base de datos ni servicios.

| # | Comando | Resultado esperado |
|---|---|---|
| 1 | `npx vitest run tests/gate-lector-criterios.test.ts tests/evaluators.test.ts tests/gate-mecanico.test.ts` | 3 archivos, 63 pruebas pasan, 0 fallan (10 son las de este ticket). |
| 2 | `npx vitest run` | 136 archivos pasan y 1 se omite; 2143 pruebas pasan y 48 se omiten; sin fallos. |
| 3 | `npm run typecheck` | Termina sin errores (compila los paquetes y corre `tsc --noEmit`). |
| 4 | `npx eslint packages/gate/src/dynamic.ts packages/engine/src/evaluators.ts packages/engine/src/gate.ts tests/gate-lector-criterios.test.ts tests/evaluators.test.ts tests/gate-mecanico.test.ts` | Sin salida (sin errores). |

Validación manual (criterio `verify: manual`, el último): confirmar que 2 y 3 dan lo indicado en su máquina. Para ver el defecto corregido con un caso real, `git stash push packages/gate/src/dynamic.ts packages/engine/src/evaluators.ts packages/engine/src/gate.ts` y repetir el comando 1: deben fallar 10 pruebas; `git stash pop` las deja de nuevo en verde.

Los comandos 1 a 3 y la prueba sin el cambio los ejecutó el agente a pedido del PO (EVIDENCE-001), que delegó así la ejecución manual. Evidencia obtenida: recibo vigente `GR-20261006-BUGFIX-GATE-LECTOR-CRITERIOS-20261005-qa-mechanical-2` (approve, 10 de 10 comandos con código 0); `npx vitest run` base antes del cambio, 135 archivos y 2133 pruebas; después, 136 y 2143; `revisar_secretos` sin hallazgos. Limitación: la suite se corrió con los cambios sin commitear de la otra sesión presentes en el árbol.

## QA

```json
[]
```

## Evidencia

```json
[
  {
    "id": "EVIDENCE-001",
    "date": "2026-10-06",
    "kind": "automated-test",
    "description": "Ejecutadas por el agente a pedido del PO, desde /Users/juanandrade/Desktop/ValmenHarness, el 2026-10-05. (1) `npx vitest run tests/gate-lector-criterios.test.ts tests/evaluators.test.ts tests/gate-mecanico.test.ts`: 3 archivos y 63 pruebas pasan. (2) `npx vitest run`: 136 archivos pasan y 1 se omite; 2143 pruebas pasan y 48 se omiten; 0 fallos. (3) `npm run typecheck`: exit 0, sin errores. (4) Sin el cambio (los 3 archivos de código devueltos a HEAD, con copia de respaldo y hashes sha256 verificados antes y después): el mismo comando (1) da 10 pruebas fallidas y 53 que pasan, lo que confirma que las pruebas detectan el defecto; restaurado el código, 63 pasan y los hashes son idénticos. Limitación: las corridas se hicieron con los cambios sin commitear de otra sesión presentes en el árbol.",
    "reference": null,
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
[]
```

## Consumo de IA

```json
[
  {
    "kind": "ai-usage",
    "date": "2026-10-06",
    "session_reference": "75c206ac-a96e-436c-b868-1364f7d7cd32",
    "model": "anthropic/claude-sonnet-5-5",
    "reasoning_effort": null,
    "notes": "Sesión de Claude Code que trabajó solo este ticket (análisis, plan, implementación y entrega), agregada del JSONL de la sesión hasta la entrega a awaiting_user_tests. Entrada = tokens nuevos + lectura de caché + creación de caché. Dos modelos: claude-opus-5-5 en 20 llamadas (input 2.435.778 = 40 nuevos + 2.333.739 caché leída + 101.999 caché creada; salida 9.518) y claude-sonnet-5-5 en 44 llamadas (input 9.131.037 = 88 + 8.918.728 + 212.221; salida 62.027), por un cambio de modelo a mitad de la sesión; el campo model lleva el de más llamadas. Plan por suscripción: sin costo en dólares. Si la sesión sigue después de la entrega (commit tras las pruebas del PO), ese gasto posterior no está incluido.",
    "input_tokens": 11566815,
    "output_tokens": 71545,
    "total_tokens": 11638360,
    "estimated_cost_usd": null,
    "source": "claude:75c206ac-a96e-436c-b868-1364f7d7cd32",
    "confidence": "high",
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
    "date": "2026-10-05",
    "at": "2026-10-06T01:51:48.957Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-05",
    "at": "2026-10-06T02:02:09.738Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-05",
    "at": "2026-10-06T02:03:48.544Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-05",
    "at": "2026-10-06T02:08:27.284Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-05",
    "at": "2026-10-06T02:08:28.892Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-05",
    "at": "2026-10-06T02:12:24.182Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-05",
    "at": "2026-10-06T02:12:42.553Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-10-05",
    "at": "2026-10-06T02:16:07.330Z",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-001."
  }
]
```
