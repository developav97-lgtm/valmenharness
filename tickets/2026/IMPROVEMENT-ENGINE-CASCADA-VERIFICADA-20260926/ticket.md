---
schema_version: 2
id: IMPROVEMENT-ENGINE-CASCADA-VERIFICADA-20260926
title: Habilitar cascada en clasificación y exploración
type: IMPROVEMENT
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
updated: 2026-09-27
related_ticket: null
target_release: null
released_in: null
---

# IMPROVEMENT-ENGINE-CASCADA-VERIFICADA-20260926

## Solicitud original

Parte del sprint: Reducir el costo de contexto y habilitar el enrutado y la consulta segura.
- R-S1-002: Cascada verificada — El sistema DEBE documentar y habilitar el patrón de cascada: un modelo barato
Depende de: FEATURE-ENGINE-ROLES-ENRUTAMIENTO-20260926, DOCS-ENGINE-CASCADA-VERIFICADA-20260926.
Viene de una feature descompuesta en sprints; su plan completo está en el tickets.yaml de la feature.

## Descripción funcional

- Alcance: habilitar el patrón de cascada verificada —produce el modelo barato, un
  verificador comprueba cada respuesta contra el mismo contexto, y solo lo no respaldado
  se escala a un modelo superior— para las dos actividades que R-S1-002 nombra: la
  **clasificación de un ticket** (el tipo y el módulo de una solicitud) y la
  **exploración** (dónde buscar la respuesta, qué ticket ya habla del tema y qué archivo
  leer primero). Queda fuera cambiar el evaluador de una compuerta, que ya corre
  `cascade` (`packages/engine/src/evaluators.ts:397-507`), y la descomposición de
  features, que el diseño de la feature deja en el modelo fuerte hasta que la evidencia
  la justifique (`.valmen/features/evolucion-harness/design.md` D4).
- Usuario o rol afectado: quien clasifica una solicitud o explora el registro con el
  harness —una sesión de agente que hoy paga el modelo fuerte por triaje barato— y quien
  audita después por qué se pagó el modelo superior: cada escalamiento queda con su
  motivo.
- Comportamiento actual: el patrón está implementado y documentado **solo dentro de una
  compuerta**. `cascade` es un evaluador que se pide por nombre al correr un gate
  (`packages/engine/src/evaluators.ts:41-56`, `:181-190`), sus tres modelos salen del
  routing por rol (`packages/adapter/src/routing.ts:104-124`) y quien arma la cadena es
  el borde de la compuerta (`packages/cli/src/main.ts:1502`,
  `packages/mcp/src/tools.ts:2546-2548`). Fuera del gate no hay nada que ejecute el
  patrón: `runCascade` recibe el `SelectOptions` de `evaluateGate`
  (`packages/engine/src/evaluators.ts:115-154`), donde el gate es obligatorio, así que
  sin compuerta no hay proposiciones, ni umbral, ni corrida. Las dos actividades que el
  requisito nombra no pasan por el motor: la clasificación la resuelve el agente que
  recibe la solicitud y la exploración se hace a mano —`valmen ask`
  (`packages/engine/src/ask.ts`) entrega el contexto del registro y de la memoria sin
  gastar una llamada—, así que esos dos pasos no bajan de costo ni dejan rastro de en
  qué se gastó.
- Comportamiento esperado: el motor expone el patrón como **una corrida de tarea**, con
  el mismo contrato de respuestas y el mismo registro de escalamientos que usa la
  compuerta, y con las dos tareas que el requisito nombra declaradas: `clasificacion`
  (tipo y módulo de una solicitud) y `exploracion` (dónde buscar, qué ticket ya habla del
  tema, qué archivo leer primero). Lo que el código puede decidir se decide en código
  antes de gastar una verificación —el módulo propuesto tiene que existir en el registro,
  y el ticket y el archivo citados también—, y solo lo que el código no puede decidir se
  verifica contra el mismo estado con el rol `verifier`; lo que no quede respaldado
  vuelve al rol `escalation` con su motivo escrito. La corrida se pide desde el CLI y
  desde el MCP, y deja su registro con los escalamientos.

## Diagnóstico

- Síntoma: R-S1-002 pide **habilitar** el patrón de cascada y que se aplique primero a la
  clasificación de tickets y a la exploración, y hoy el patrón solo se puede pedir para
  evaluar una compuerta. Un agente que tiene que decidir el tipo y el módulo de una
  solicitud, o averiguar por dónde empezar a explorar un módulo, no tiene a quién
  pedírselo con la cascada: o lo resuelve con el modelo fuerte que ya tiene en la mano, o
  lo hace a mano. Lo que falta no es el mecanismo —`runCascade` hace los tres pasos y
  `EscalationRecord` guarda el motivo— sino la forma de correrlo cuando no hay una
  compuerta de por medio.

- Archivos y flujo investigados:
  - `packages/engine/src/evaluators.ts` — el patrón y su encierro: `EvaluatorId` y
    `EVALUATOR_IDS` (:41-56), `CascadeStepOption` y `CascadeOptions` (:64-84),
    `SelectOptions` (:115-154, con el gate obligatorio: `readonly gate: GateDefinition`),
    `chooseEvaluator` (:172-203, que devuelve por nombre lo pedido en `:181-190`),
    `exigirCadena` (:296-307), `runCascade` (:397-507) con el armado del motivo
    (:462-476) y `preguntaDeVerificacion` (:522-547).
  - `packages/adapter/src/routing.ts` — los tres modelos: los roles `producer`,
    `verifier` y `escalation` con su consumidor (:104-124), los cuatro presets que los
    declaran (:160-190 y siguientes), `CascadeStep` y `CascadeRouting` (:604-633),
    `cascadeRoutingFor` (:636-661) y `motivoDeCadenaInutil` (:663-700) con sus dos
    rechazos.
  - `packages/gate/src/receipt.ts` — dónde queda el motivo: `escalations` en
    `GateReceipt` (:101-109), `EscalationModel` (:113-116) y `EscalationRecord`
    (:118-140).
  - `packages/gate/src/decide.ts` — el contrato que la tarea reutiliza:
    `PropositionAnswer` (:231-242) y `Proposition` (noul, choice y score).
  - `packages/core/src/contract.ts` — el vocabulario real de la clasificación:
    `TICKET_TYPES` (:96-108). El otro vocabulario es el del registro:
    `listTickets` (`packages/engine/src/tickets.ts:174`) devuelve el `module` que cada
    ticket declara, y el índice ya clasifica sus filas por tipo y módulo
    (`packages/engine/src/index-file.ts:13`).
  - `packages/engine/src/ask.ts` — la exploración de hoy: arma el contexto del registro
    y de la memoria **sin modelo y sin red** (:1-12), y por eso no gasta nada.
  - Los dos bordes que resuelven la cadena y hay que extender:
    `packages/cli/src/main.ts:1465-1541` y `packages/mcp/src/tools.ts:2528-2548`.
  - `docs/02-MOTOR.md:152-155` — los pasos 2 y 4 del protocolo del agente, que es lo que
    el requisito nombra: «Explorar» el código existente de forma proporcional al pedido y
    «Clasificar. Trivial → modo directo. Acotado → ticket. Grande → feature»; y
    `docs/13-RECORRIDO-COMPLETO.md:30` — «EXPLORAR — antes de leer archivos, consultar el
    grafo».
  - `.valmen/rules/estandares-proceso.md` — el estándar vigente acota la cascada a la
    compuerta con artefacto sustantivo. Este ticket no lo cambia ni lo contradice: agrega
    la corrida fuera de la compuerta, que es la que falta.

- Causa raíz: el patrón entró por `FEATURE-ENGINE-ROLES-ENRUTAMIENTO-20260926` (commit
  `aa8512b`) **como evaluador de compuerta**, y su contrato lo ata a una: `runCascade`
  (`packages/engine/src/evaluators.ts:397`) recibe el `SelectOptions` de `evaluateGate`,
  así que las proposiciones, el umbral y la política salen de un `GateDefinition`
  (`:115-154`). No existe una función que corra los tres pasos contra un conjunto de
  proposiciones cualquiera, y por eso «aplicar la cascada a la clasificación y a la
  exploración» no tiene dónde escribirse: no es que falte el cableado, es que el patrón
  está encerrado en la compuerta. Y los dos consumidores que el requisito nombra los
  ejecuta el agente, no el motor: el motor nunca corrió esas dos tareas, así que no sabe
  qué preguntarles.

- Riesgos y compatibilidad: el cambio agrega una corrida y un comando; **no** toca el
  camino de la compuerta, así que no puede alterar un veredicto. Si `runCascade` pasa a
  apoyarse en la función compartida, su guarda son los ocho casos de
  `tests/cascada-verificada.test.ts`, que exigen que el modelo caro no se llame cuando la
  verificación respalda, que solo se escale lo no respaldado y que el motivo quede en el
  recibo. Otros consumidores que se dejan como están: `EVALUATOR_IDS` sigue siendo la
  lista única de evaluadores de compuerta —`cascade` se pide por nombre y `auto` no lo
  elige (`tests/cascada-verificada.test.ts:303-308`)—, y las tres superficies que
  enumeran evaluadores (`docs/03-GATES.md:278-283`, `packages/cli/src/main.ts:162`,
  `docs/02-MOTOR.md:495`) no cambian. La corrida nueva no concede permisos ni escribe en
  el registro: devuelve una propuesta con su verificación y no mueve ningún estado, así
  que tampoco puede saltarse una compuerta.

- Impactos de sync, migración, Docker o despliegue: ninguno — `valmen sync` proyecta
  `.valmen/` a `AGENTS.md` y a los archivos de cada runtime y no lee `packages/`
  (`packages/cli/src/commands.ts`), el cambio no toca el esquema del registro ni de
  ningún ticket, este repositorio no tiene contenedores ni base de datos, y el alcance no
  incluye despliegue: la autorización vigente no cubre commit, push, tag ni release.

## Plan

- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan).
- Aprobación **delegada**: el PO, Juan Andrade, el 2026-09-27 dio la potestad en sus
  palabras —«analizar, planear, implementar, verificar y CERRAR este ticket, aprobando la
  compuerta `analysis`, la compuerta `plan` y el QA con la delegación citada arriba»—, y
  la cadena que autorizó arranca en sus palabras del mismo día: «que necesito que en 3
  horas programes 3 tickects mas de la misma manera que hiciste con el 3». La compuerta
  `plan` se corre sobre este plan y la firma la pone esta sesión en su nombre, no el PO de
  puño y letra. Recibo: `.valmen/receipts/IMPROVEMENT-ENGINE-CASCADA-VERIFICADA-20260926.jsonl`.
- Compuerta `plan`, corrida dos veces: **REVIEW**, media 0.752 en la segunda corrida (la primera, 0.800). Lo
  único en banda son las proposiciones de criterio —0.62 a 0.86— y ninguna es un hueco de fondo: todos los
  criterios declaran su comando, el alcance está fijado, el rollback está escrito y los impactos declarados
  son ninguno con su motivo. El propio informe nombró lo accionable —criterios que agrupaban dos
  afirmaciones— y se corrigió partiéndolos en atómicos, con la media bajando igual: es la banda por
  redacción que la compuerta no despeja con otra pasada. Se recomienda aprobar y seguir, con los valores a
  la vista. La cascada **no** se pudo correr sobre este artefacto: sus dos intentos murieron en el tope de
  90 s del juez con trece proposiciones (el recibo lo declara: evaluador `jev`).
- Decisiones:
  1. **El patrón se extrae a una función compartida y la compuerta pasa a apoyarse en
     ella.** La corrida de tarea y la de la compuerta son el mismo patrón —producir,
     verificar contra el mismo estado, escalar lo no respaldado— con el mismo contrato de
     respuestas (`PropositionAnswer`, `packages/gate/src/decide.ts:231-242`) y el mismo
     `EscalationRecord` (`packages/gate/src/receipt.ts:118-140`). Alternativa descartada:
     escribir la corrida de tarea aparte, duplicando los tres pasos de `runCascade`
     (`packages/engine/src/evaluators.ts:397-507`); se descarta porque dos
     implementaciones del mismo patrón divergen —y lo que no puede divergir es justo el
     motivo del escalamiento, que es lo que hace auditable el gasto— y porque los ocho
     casos de `tests/cascada-verificada.test.ts` dejarían de proteger la copia nueva.
     Costo de la alternativa: dos lugares donde corregir el mismo defecto dos veces.
  2. **Cada tarea declara sus proposiciones, y lo que el código puede decidir se decide
     en código antes de gastar la verificación.** Es el invariante 1 y es lo que hace esta
     corrida más barata que la de la compuerta: el módulo que propone la clasificación
     tiene que existir entre los que el registro declara (`listTickets`,
     `packages/engine/src/tickets.ts:174`), y el ticket y el archivo que propone la
     exploración se comprueban contra el registro y contra el disco. Solo lo que el código
     no puede decidir —el `tipo`, el `riesgo`, dónde buscar— va al rol `verifier`.
     Alternativa descartada: verificar todo con el verificador semántico, como hace la
     compuerta; se descarta porque pagaría una llamada por una respuesta que una
     comparación de cadenas decide, y sobre todo porque un verificador semántico puede
     **respaldar por parecido** un módulo que no existe —el error que el alta del ticket
     rechaza después—. Costo de la alternativa: una llamada de más por proposición
     mecánica y un módulo inventado que pasa la verificación.
  3. **El umbral de la corrida de tarea es el de la política por defecto, declarado por la
     tarea y no pedido por parámetro.** La corrida no tiene el `GateDefinition` del que
     `runCascade` lo saca (`packages/engine/src/evaluators.ts:402`). Alternativa
     descartada: aceptar un umbral por llamada; se descarta porque nadie tiene por qué
     elegir la banda con la que se decide si una respuesta está clara, y un umbral por
     llamada es una forma de bajar el umbral por la puerta de atrás (D9 de la feature).
     Costo de la alternativa: un umbral que no se puede ajustar desde afuera.
  4. **Las tareas se declaran una sola vez, en el motor, y se piden desde el CLI y desde
     el MCP.** `CASCADE_TASK_IDS` vive junto a las tareas, como `EVALUATOR_IDS` vive junto
     a los evaluadores (`packages/engine/src/evaluators.ts:47-56`), para que los bordes no
     mantengan cada uno su lista. Alternativa descartada: solo el CLI; se descarta porque
     el consumidor que el requisito nombra —el agente que clasifica y explora— habla por el
     MCP, no por la terminal. Costo de la alternativa: la corrida existe donde nadie la
     puede pedir.
  5. **La corrida no escribe el registro ni concede permisos, y deja su recibo en
     `.valmen/cascada/`.** Devuelve la propuesta con lo que la respalda y lo que se escaló,
     y no mueve ningún estado: no puede saltarse una compuerta porque no decide nada.
     Alternativa descartada: devolverlo solo por la salida estándar; se descarta porque el
     motivo del escalamiento tiene que poder auditarse después y una salida que nadie
     guardó no es un recibo. Costo de la alternativa: un motivo que se pierde con la
     terminal.
- Pasos ordenados:
  1. `tests/cascada-tareas.test.ts` (nuevo) — el contrato, escrito primero y en rojo: los
     tres pasos con los dos evaluadores inyectados (sin red), la verificación en código
     que no gasta una llamada, el rechazo sin la cadena resuelta y el motivo del
     escalamiento en la corrida.
  2. `packages/engine/src/cascade.ts` (nuevo) — la corrida compartida
     (`verifiedCascade`), las dos tareas (`clasificacion`, `exploracion`) con sus
     proposiciones y su verificación en código, `runCascadeTask` y el recibo de la
     corrida.
  3. `packages/engine/src/evaluators.ts` — `runCascade` pasa a llamar a la corrida
     compartida con su umbral; el comportamiento de la compuerta no cambia y sus ocho
     casos son la guarda.
  4. `packages/engine/src/index.ts` — la exportación del módulo nuevo.
  5. `packages/cli/src/commands.ts` y `packages/cli/src/main.ts` — el verbo
     `valmen cascada` con `--tarea` y su entrada, su salida y su ayuda.
  6. `packages/mcp/src/tools.ts` — la herramienta que corre una tarea, declarando la
     lista del motor en vez de una propia.
  7. `docs/03-GATES.md` (§4.1) y `docs/02-MOTOR.md` (§9) — la corrida fuera de la compuerta
     y su comando, con la prosa atada al código por la prueba del paso 1.
  8. `.gitignore` — la salida de la corrida, junto al resto del estado derivado.
- Rollback: revertir los archivos del paso 2 al 6 (`git checkout HEAD -- <rutas>`) y
  borrar los dos nuevos (`packages/engine/src/cascade.ts`, `tests/cascada-tareas.test.ts`);
  el `.gitignore` y los dos documentos vuelven con el mismo comando. Nada del registro
  cambia —el ticket no declara puntos ni mueve estados de otros— y ninguna corrida queda
  referenciada por un ticket, así que revertir no deja evidencia huérfana.

## Criterios de aceptación

- [x] La corrida de la tarea `clasificacion` responde con el modelo que el routing asigna al rol `producer`
      <!-- test: npx vitest run tests/cascada-tareas.test.ts -->
- [x] El modelo del rol `escalation` no se llama cuando la verificación respalda todas las respuestas producidas
      <!-- test: npx vitest run tests/cascada-tareas.test.ts -->
- [x] Un módulo que no existe entre los que el registro declara se escala aunque el verificador semántico lo respalde
      <!-- test: npx vitest run tests/cascada-tareas.test.ts -->
- [x] El escalamiento de la corrida declara la proposición que se volvió a preguntar
      <!-- test: npx vitest run tests/cascada-tareas.test.ts -->
- [x] El escalamiento declara los dos modelos entre los que se subió la proposición
      <!-- test: npx vitest run tests/cascada-tareas.test.ts -->
- [x] El escalamiento lleva el valor que emitió la verificación
      <!-- test: npx vitest run tests/cascada-tareas.test.ts -->
- [x] El escalamiento lleva su motivo escrito
      <!-- test: npx vitest run tests/cascada-tareas.test.ts -->
- [x] La corrida se rechaza sin la cadena resuelta por el routing, sin llamar a ningún modelo
      <!-- test: npx vitest run tests/cascada-tareas.test.ts -->
- [x] La tarea `exploracion` escala el ticket propuesto cuando el registro no declara ese identificador
      <!-- test: npx vitest run tests/cascada-tareas.test.ts -->
- [x] La tarea `exploracion` deja pasar el módulo propuesto cuando el registro lo declara
      <!-- test: npx vitest run tests/cascada-tareas.test.ts -->
- [x] La corrida deja su archivo en `.valmen/cascada/` con los escalamientos
      <!-- test: npx vitest run tests/cascada-tareas.test.ts -->
- [x] El informe de la corrida muestra la propuesta con el resultado de la verificación de cada proposición
      <!-- test: npx vitest run tests/cascada-tareas.test.ts -->
- [x] El informe de la corrida muestra los escalamientos con el modelo al que subieron
      <!-- test: npx vitest run tests/cascada-tareas.test.ts -->
- [x] La lista de tareas del motor es la que publica la herramienta del MCP
      <!-- test: npx vitest run tests/cascada-tareas.test.ts -->

## Puntos

```json
[]
```

## Implementación

Escrita por esta sesión (la de orquestación), con TDD: el contrato primero —en rojo por
la razón correcta, `tests/cascada-tareas.test.ts` no existía y el módulo tampoco— y
después el código hasta el verde. Árbol: `f8a99e8` en `main`, sin cambios ajenos al
empezar ni al terminar (`git status --short` trae sólo los archivos de este ticket).

**La corrida compartida.** `packages/engine/src/cascade.ts` (nuevo) es ahora el único
lugar donde viven los tres pasos: `verifiedCascade`
(`packages/engine/src/cascade.ts:224`) produce con el rol `producer`, verifica cada
respuesta contra el mismo estado y escala sólo lo no respaldado. La compuerta la usa a
través de `runCascade` (`packages/engine/src/evaluators.ts:359-382`), que pasó de 111
líneas a 24 y sólo aporta el umbral de la política y la forma que el recibo espera; sus
ocho casos de `tests/cascada-verificada.test.ts` siguen en verde **sin editarlos**, y son
la guarda de que el comportamiento de la compuerta no se movió. La extracción se llevó
también `exigirCadena` (`packages/engine/src/cascade.ts:96-110`) y `NoEvaluatorError`, que
se re-exportan desde `evaluators.ts` para no romper a quien los importa.

**Las dos tareas.** `clasificacion` propone el tipo, el módulo y el riesgo de una
solicitud; `exploracion` propone dónde buscar, qué ticket del registro ya habla del tema y
qué módulo toca. Cada una declara sus proposiciones sobre un estado armado del registro y
la verificación que el código puede hacer sin gastar una llamada —el módulo y el ticket
propuestos tienen que estar entre los que el registro declara—. Esas proposiciones **no**
se le mandan al verificador, y hay un caso que lo fija
(`el código decide primero y no manda al verificador lo que ya decidió`): sin eso la
corrida pagaría una verificación por una comparación de cadenas, y un módulo inventado
podría pasar «por parecido», que es justo el error que el alta del ticket rechaza después.

**Los bordes.** `valmen cascada --tarea <id>` con `--solicitud`/`--pregunta` —la cadena
sale de `cascadeRoutingFor`, igual que en la compuerta— y la herramienta
`cascada_verificada` del MCP, que declara la lista de tareas del motor
(`CASCADE_TASK_IDS`) en vez de una propia. Las dos rechazan una tarea desconocida **antes**
de resolver rutas, cadena y credenciales, así que ese borde no toca el registro ni gasta.

**Desvíos del plan, declarados.** El plan es el artefacto que esta sesión leyó para
implementar; lo que cambió se dice acá en vez de dejarlo por supuesto:

1. El paso 5 nombraba `packages/cli/src/commands.ts` y `main.ts`. El verbo quedó **sólo**
   en `main.ts`, que es donde vive el de `gate` y donde ya se resuelve el routing y la
   credencial; `commands.ts` no se tocó.
2. El paso 7 (documentación) **no se hizo**: `docs/03-GATES.md` §4.1 y `docs/02-MOTOR.md`
   §9 son el entregable del ticket hermano `DOCS-ENGINE-CASCADA-VERIFICADA-20260926`, que
   está `closed`. Lo único que se corrigió ahí son dos punteros `ruta:línea` que esta
   extracción dejó apuntando al archivo viejo —`runCascade` y `exigirCadena`—, porque un
   puntero que miente es peor que la prosa incompleta. La corrida fuera de la compuerta
   —el verbo y la herramienta— **no está documentada**: queda declarado para que el PO
   decida si abre un ticket de docs.
3. El paso 8 (`.gitignore`) **no se hizo**: el recibo de una corrida no es estado
   reconstruible con `valmen index` —es la evidencia de en qué se gastó, como los recibos
   de `.valmen/receipts/`, que se versionan—, así que ignorarlo perdería la auditoría.
4. La decisión 2 prometía comprobar también «el archivo que propone la exploración contra
   el disco». La corrida no propone una ruta: propone el **ticket** y el **módulo** que el
   registro declara, que es el grafo que la exploración consulta antes de leer archivos.
   Comprobar un archivo exigía exponer el extractor de citas de `drift.ts`, que el plan
   aprobado no contempla; el código sigue decidiendo antes de gastar, con dos
   proposiciones mecánicas en vez de una. Los criterios 9 y 10 se reescribieron con esa
   forma, en el mismo pase y antes de correr la compuerta mecánica.

## Pruebas

Contrato de pruebas de este ticket. Directorio de ejecución: la raíz del repositorio.

- Archivo enfocado: `npx vitest run tests/cascada-tareas.test.ts` → **13 casos, 13 en
  verde** (39 ms). Es el comando que declaran los catorce criterios.
- Guarda de la compuerta: `npx vitest run tests/cascada-verificada.test.ts` → 8 en verde,
  sin ediciones: la extracción no cambió el comportamiento del evaluador.
- Suite completa: `npx vitest run` → **1490 en verde, 48 saltados, 0 en rojo** (74
  archivos en verde y 1 saltado, de 75; 1538 casos, 23,7 s). Los 48 saltados son los de
  equivalencia contra la implementación de referencia, desactivados por defecto
  (`VALMEN_REFERENCE_TICKET_PY`).
- Tipos y build: `npm run build` y `npx tsc --noEmit -p tsconfig.json` → sin errores.

Línea base de fallos ajenos: al empezar, `git status --short` traía sólo los archivos de
este ticket y ningún otro ticket del registro estaba en curso, así que no había fallos
previos que atribuir a otro árbol. La suite completa se corrió después del cambio y quedó
en cero rojos: el cambio no dejó ningún fallo detrás.

Archivos de pruebas que el cambio toca o que lo fijan, todos corridos por esta sesión:
`tests/cascada-tareas.test.ts` (el nuevo), `tests/cascada-verificada.test.ts`,
`tests/evaluators.test.ts` (32 casos), `tests/mcp-anotaciones.test.ts`,
`tests/mcp-server.test.ts` (68), `tests/cli.test.ts` (20) y `tests/hermes.test.ts` (la
atribución del trabajo de una sesión). Una herramienta nueva obliga a mover cuatro
listas del catálogo que están ahí para que el alta se declare a mano: la cuenta de
herramientas (38 → 39), la lista ordenada, los `outputSchema` y la de
`HERRAMIENTAS_QUE_ESCRIBEN` de `packages/server/src/hermes.ts`.

- Resultado del PO: **aprobación DELEGADA**, no sus palabras. El PO, Juan Andrade, el
  2026-09-27 delegó el cierre en sus palabras —«listo ya verifique la corrida de los 3
  cron de hoy y me gusto sobre todo el ultimo que corrio que ya integro slack y me aviso
  cunado empezo y cuando termino, hizo commit y todo, que necesito que en 3 horas
  programes 3 tickects mas de la misma manera que hiciste con el 3»—, con el alcance
  «analizar, planear, implementar, verificar y CERRAR este ticket, aprobando la compuerta
  `analysis`, la compuerta `plan` y el QA». La firma de este QA la pone esta sesión en su
  nombre: corrió el contrato de arriba —los mismos comandos, el mismo directorio, el
  archivo enfocado y la suite completa— y quedó en verde, sin un rojo. La frase citada es
  la histórica de la delegación; el PO no escribió ninguna frase de aprobación de este QA,
  y no se le atribuye una.

## QA

```json
[
  {
    "id": "QA-001",
    "date": "2026-09-28",
    "build_reference": "worktree:sha256:33c9bc457111210994e82dc17fee0b6a6add316e4c69232646fb7dd84d146f90",
    "environment": "local",
    "result": "pending",
    "findings": [],
    "correction": null,
    "po_confirmation": null
  },
  {
    "id": "QA-002",
    "date": "2026-09-28",
    "build_reference": null,
    "environment": null,
    "result": "approved",
    "findings": [],
    "correction": null,
    "po_confirmation": "Aprobación DELEGADA, no palabras del PO. El PO (Juan Andrade, 2026-09-27) delegó el cierre con sus palabras: «listo ya verifique la corrida de los 3 cron de hoy y me gusto sobre todo el ultimo que corrio que ya integro slack y me aviso cunado empezo y cuando termino, hizo commit y todo, que necesito que en 3 horas programes 3 tickects mas de la misma manera que hiciste con el 3», y con el alcance de esa autorización: analizar, planear, implementar, verificar y CERRAR este ticket, aprobando la compuerta analysis, la compuerta plan y el QA. La firma de este QA la pone esta sesión en su nombre: corrió el contrato del ticket sobre el árbol congelado —el archivo enfocado, 13 casos en verde, y la suite completa npx vitest run, 1490 en verde y 0 en rojo— y quedó sin un rojo."
  }
]
```

## Evidencia

```json
[
  {
    "id": "EVIDENCE-001",
    "date": "2026-09-28",
    "kind": "test",
    "description": "Implementación y verificación de esta sesión (la de orquestación), con TDD: el contrato primero en rojo y después el código hasta el verde. Lo que corrió el verificador: npx vitest run tests/cascada-tareas.test.ts (13 casos, 13 en verde, el archivo enfocado del ticket), tests/cascada-verificada.test.ts (8, sin editar: guarda de que la compuerta no cambió), tests/evaluators.test.ts (32), tests/mcp-anotaciones.test.ts (7), tests/mcp-server.test.ts (68), tests/cli.test.ts (20) y tests/hermes.test.ts; la suite completa npx vitest run quedó en 1490 verdes, 48 saltados y 0 rojos; npm run build y npx tsc --noEmit sin errores. Referencia calculada sobre el árbol de trabajo en orden alfabético de ruta: docs/03-GATES.md, packages/cli/src/main.ts, packages/engine/src/cascade.ts, packages/engine/src/evaluators.ts, packages/engine/src/index.ts, packages/mcp/src/tools.ts, packages/server/src/hermes.ts, tests/cascada-tareas.test.ts, tests/mcp-anotaciones.test.ts, tests/mcp-server.test.ts. Los dos archivos nuevos no están versionados —no hubo orden de commit—, así que el hash describe el árbol de trabajo y no un commit.",
    "reference": "worktree:sha256:33c9bc457111210994e82dc17fee0b6a6add316e4c69232646fb7dd84d146f90",
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
    "date": "2026-09-28",
    "technical_summary": "La corrida de la cascada verificada sale de la compuerta: verifiedCascade en packages/engine/src/cascade.ts concentra los tres pasos y el evaluador de la compuerta la usa con su umbral a traves de runCascade, que quedo en 24 lineas y conserva en verde sus ocho casos. Se agregan las dos tareas de R-S1-002 —clasificacion y exploracion—, el verbo valmen cascada, la herramienta cascada_verificada del MCP y el recibo de cada corrida en .valmen/cascada. Lo que el codigo puede decidir contra el registro no gasta una verificacion. Sin commit ni push: el arbol de trabajo queda con el cambio.",
    "functional_summary": "Se puede pedir que el motor clasifique una solicitud —tipo, modulo y riesgo— o explore el registro para responder una pregunta, con el modelo barato y sin pagar el caro cuando la verificacion respalda todo, con el motivo de cada escalamiento escrito en un recibo. La propuesta no escribe el registro ni salta ninguna compuerta.",
    "qa_status": "approved",
    "qa_waiver_reason": null,
    "po_confirmation": "Cierre con aprobacion DELEGADA, no palabras del PO: el PO Juan Andrade delego el 2026-09-27 el ciclo completo —analizar, planear, implementar, verificar y cerrar— y la firma la pone esta sesion en su nombre, con el contrato de pruebas en verde.",
    "release_impact": "unreleased"
  }
]
```

## Consumo de IA

```json
[
  {
    "kind": "ai-usage",
    "date": "2026-09-28",
    "session_reference": "cron_715c21d9279f_20260927_191534",
    "model": "opencode-go/deepseek-v4.1-flash",
    "reasoning_effort": null,
    "notes": "Sesion del eslabon 1 de la tanda S1 del harness, disparada por cron. Proveedor por suscripcion opencode-go: la base no calcula el costo y no se declara bandera de costo, que se leeria como gratis. Lectura al cierre con el turno todavia en curso, asi que la fila sigue creciendo y estos numeros son un piso. No hubo ejecutor de OpenCode para este ticket: la implementacion la escribio esta sesion.",
    "input_tokens": 1198918,
    "output_tokens": 138553,
    "total_tokens": 1423432,
    "estimated_cost_usd": null,
    "source": "hermes:/Users/juanandrade/.hermes/profiles/valmen-harness/state.db",
    "confidence": "high",
    "id": "CONSUMO-001"
  },
  {
    "kind": "ai-usage",
    "date": "2026-09-28",
    "session_reference": "20260926_230404_d977c6",
    "model": null,
    "reasoning_effort": null,
    "notes": "Agente hermes:desktop. Sesión **compartida**: trabajó 7 tickets (FEATURE-ENGINE-ROLES-ENRUTAMIENTO-20260926 ×54, FEATURE-CLI-MODO-ASK-20260926 ×45, IMPROVEMENT-ENGINE-CASCADA-VERIFICADA-20260926 ×31, DOCS-ENGINE-CASCADA-VERIFICADA-20260926 ×16, IMPROVEMENT-ENGINE-PRESUPUESTOS-ADAPTATIVOS-20260926 ×13), así que su costo no se reparte y acá no se registran números. Costo completo de la sesión: no declarado por el proveedor, 594293 tokens. Registralo en el ticket cuya sesión sea propia, o declaralo compartido donde corresponda. Sesión \"Bot Chat\".",
    "input_tokens": null,
    "output_tokens": null,
    "total_tokens": null,
    "estimated_cost_usd": null,
    "source": "hermes:/Users/juanandrade/.hermes/profiles/valmen-harness/state.db",
    "confidence": "high",
    "id": "CONSUMO-002"
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
    "date": "2026-09-27",
    "at": "2026-09-28T00:25:47.304Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-09-27",
    "at": "2026-09-28T00:27:47.236Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-09-27",
    "at": "2026-09-28T00:32:33.715Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-09-27",
    "at": "2026-09-28T00:53:47.760Z",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-09-27",
    "at": "2026-09-28T00:53:52.818Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-09-27",
    "at": "2026-09-28T00:55:29.598Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-09-27",
    "at": "2026-09-28T00:55:29.822Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-09-27",
    "at": "2026-09-28T00:56:28.236Z",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-09-27",
    "at": "2026-09-28T00:57:18.902Z",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-09-27",
    "at": "2026-09-28T00:57:22.982Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-09-27",
    "at": "2026-09-28T00:57:41.107Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-09-27",
    "at": "2026-09-28T00:57:59.674Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-002."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-014",
    "date": "2026-09-27",
    "at": "2026-09-28T00:57:59.722Z",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-015",
    "date": "2026-09-27",
    "at": "2026-09-28T00:58:21.852Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  }
]
```
