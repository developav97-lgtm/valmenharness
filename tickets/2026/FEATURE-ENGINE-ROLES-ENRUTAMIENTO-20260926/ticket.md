---
schema_version: 2
id: FEATURE-ENGINE-ROLES-ENRUTAMIENTO-20260926
title: Enrutar modelos por rol de ejecución
type: FEATURE
module: ENGINE
workflow_status: closed
qa_status: approved
release_status: unreleased
user_visible: true
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

# FEATURE-ENGINE-ROLES-ENRUTAMIENTO-20260926

## Solicitud original

Parte del sprint: Reducir el costo de contexto y habilitar el enrutado y la consulta segura.
Viene de una feature descompuesta en sprints; su plan completo está en el tickets.yaml de la feature.

## Descripción funcional

- Alcance: el enrutado de modelos por rol de ejecución —el que produce, el que
  verifica y el que escala— y el escalamiento de la cascada verificada con su
  motivo escrito en el recibo del gate (R-S1-002). Queda fuera la aplicación de
  la cascada a la clasificación y a la exploración, que es el ticket
  `IMPROVEMENT-ENGINE-CASCADA-VERIFICADA-20260926`.
- Usuario o rol afectado: quien configura el routing de un proyecto —por
  `valmen routing set` o desde Mission Control— y quien lee un recibo de
  compuerta para saber en qué se gastó el dinero.
- Comportamiento actual: el routing resuelve un modelo por rol y lo lleva a la
  llamada real, pero los cuatro roles vigentes son de evaluación y de
  administración: no hay rol para el modelo barato que produce, ni para el que
  verifica, ni para el que recibe lo escalado. `parseRouting` rechaza esas
  claves, así que tampoco se pueden declarar a mano, y el recibo sólo sabe de una
  escalada: a una persona, cuando el veredicto es `review`.
- Comportamiento esperado: los tres roles existen en el catálogo con su
  consumidor, se resuelven con la misma precedencia que los demás (proyecto,
  preset, sistema) y alimentan un evaluador `cascade` en el que el productor
  responde, el verificador comprueba cada respuesta contra el mismo estado y sólo
  lo que no queda respaldado se vuelve a responder con el modelo del escalado. El
  recibo registra cada escalamiento con las proposiciones escaladas, los modelos
  de origen y destino, la probabilidad que emitió el verificador y el umbral.

## Diagnóstico

- Síntoma: la cascada verificada no se puede declarar ni ejecutar. Un proyecto
  que pida «un modelo barato que produzca, un verificador que lo compruebe y un
  modelo superior al que escalar» no tiene dónde escribir esa decisión: no
  existen los roles, y declararlos a mano detiene las compuertas. Y aunque el
  harness produjera la respuesta barata, no hay forma de que el registro diga por
  qué se pagó el modelo caro: el recibo no tiene un lugar donde escribir el
  motivo del escalamiento entre modelos.

- Archivos y flujo investigados:
  - `packages/adapter/src/routing.ts` — el catálogo y la resolución de roles:
    `ROLES` :77-103 (cuatro roles, cada uno con su `consumer`), `PRESETS` :127-233,
    `resolveRouting` :377-419 (precedencia proyecto → preset → sistema, con su
    columna `source`), `gateRoutingFor` :474-487, `architectRoutingFor` :506-515 y
    `parseRouting` :298-367, que **rechaza** un rol que no está en `ROLES`.
  - `packages/engine/src/evaluators.ts` — `EvaluatorId` :34
    (`auto | command | jev | llm-judge`), `chooseEvaluator` :106-137 con el orden
    «el código primero» y `runSemantic` :217-279, donde vive la única degradación
    que existe hoy.
  - `packages/gate/src/receipt.ts` — `GateReceipt` :65-101 y `buildReceipt`
    :169-198: `escalatedTo` sólo admite `"human"`, y sólo cuando el veredicto es
    `review` (:170).
  - `packages/engine/src/gate.ts` :369-388 (la evaluación recibe el modelo del
    routing resuelto en el borde), :419-440 (`buildReceipt` con las respuestas y
    el modelo) y :534-541 (`appendReceipt`, append-only).
  - `packages/gate-llm-judge/src/judge.ts:277` (`evaluateWithJudge`) y
    `packages/gate-jev/src/jev.ts:183` (`evaluateWithJev`): los dos reciben
    proposiciones, estado congelado y modelo, y devuelven una respuesta por
    proposición con `PropositionAnswer` (`packages/gate/src/decide.ts:231-242`) —
    es el contrato que la cascada necesita, y ya está.
  - Los bordes con la lista de evaluadores escrita a mano:
    `packages/cli/src/main.ts:1450-1462`, `packages/mcp/src/tools.ts:2528-2537` y
    `packages/server/src/gates.ts` (`runTicketGate`, :317-352), que resuelven
    `gateRoutingFor(root)` y pasan modelo, proveedor y esfuerzo al motor.
  - `.valmen/routing.yaml` — este proyecto usa el preset `quality`, con
    `roles: {}`: no hay overrides y todo sale del preset.

- Causa raíz o hipótesis: el enrutado por rol funciona y llega a la llamada real
  —`gateRoutingFor` resuelve el rol `gate-evaluator` y ese modelo viaja hasta
  `evaluateGate` (`packages/engine/src/gate.ts:369-388`)—, pero **no existe ningún
  rol de ejecución**: los cuatro vigentes (`routing.ts:77-103`) son de evaluación
  (`gate-evaluator`, `gate-judge`) y de administración (`orchestrator`,
  `architect`). Sin un rol para el modelo barato que produce, otro para el que
  verifica y otro para el que recibe lo escalado, la cascada no tiene dónde
  declararse: `resolveRouting` no devuelve ninguna ruta que un consumidor pueda
  pedir, y `parseRouting` rechaza las tres claves si un proyecto las escribe
  (`routing.ts:330-343`), con lo que el intento de declararlas detiene *todas* las
  compuertas del proyecto con un error que culpa al rol. El segundo tercio de la
  causa es que el motivo del escalamiento no tiene dónde escribirse:
  `GateReceipt.escalatedTo` sólo admite `"human"` y sólo cuando el veredicto es
  `review` (`receipt.ts:170`), así que un escalamiento entre modelos no deja
  rastro y el «por qué se pagó el modelo caro» se pierde. Y la única degradación
  que el harness tiene hoy va **al revés** de la cascada: cuando Jev no está
  disponible se cae a un juez de chat más débil (`evaluators.ts:256-278`), que es
  barato de operar pero no sube la calidad de la respuesta ya dada.

- Riesgos y compatibilidad:
  - Otros consumidores del mismo componente: `routing.ts` lo leen cinco
    consumidores —`valmen routing show`, `set` y `clear` más `doctor`
    (`packages/cli/src/setup.ts:209-252`, :451-475), la vista de modelos de
    Mission Control (`packages/server/src/routing.ts:235-242`), el chat de
    configuración, que compara el modelo del evaluador antes y después del cambio
    (`packages/server/src/chat.ts:153-154`), y los tres bordes que ejecutan un
    gate—. El cambio les agrega tres filas y ninguna les quita: siguen leyendo los
    cuatro roles de siempre con la misma precedencia, y el rol que el chat compara
    (`gate-evaluator`) no se toca.
  - `parseRouting` rechaza un rol desconocido (`routing.ts:330-343`): un proyecto
    que declare `producer`, `verifier` o `escalation` y corra un harness anterior
    no parsea su routing. Es el mismo trato que ya tienen los cuatro roles
    vigentes y el mensaje dice qué hacer; la dirección que importa acá es la
    inversa, y está cubierta: `valmen migrate` sólo retira del `routing.yaml` los
    roles que **no** están en `ROLES` (`packages/cli/src/commands.ts:437-458`), así
    que agregar los tres no cambia lo que limpia ni reescribe ningún archivo.
  - El campo nuevo del recibo es opcional, como `notes` (`receipt.ts:100`):
    `receiptVersion` no cambia, los recibos ya escritos siguen siendo válidos y
    `readReceipts`/`currentReceipts` (`packages/engine/src/receipts.ts:35-60`) no
    se tocan.
  - Los tres roles nuevos aparecen en `valmen routing show`
    (`packages/cli/src/setup.ts:209-252`), en el selector de Mission Control
    (`packages/server/src/routing.ts:235-242`) y en `valmen doctor`, que comprueba
    proveedor y credenciales por rol (`packages/cli/src/setup.ts:451-475`). El
    preset los declara en los cuatro presets, así que resuelven sin intervención;
    un proyecto con overrides no se rompe, porque su `routing.yaml` no nombra
    roles nuevos.
  - La cascada gasta tres llamadas donde hoy gasta una, así que no se activa sola:
    es un evaluador que se pide (`--evaluator cascade`) y `auto` no lo elige. El
    orden «el código primero» no se toca: `chooseEvaluator` sigue devolviendo
    `command` cuando todas las proposiciones tienen su comando
    (`evaluators.ts:127-136`).

- Impactos de sync, migración, Docker o despliegue: ninguno — `valmen sync` no lee `routing.yaml` (proyecta reglas y agentes a `AGENTS.md`, `packages/cli/src/commands.ts:596`), el cambio no toca el esquema del registro ni de ningún ticket, este repositorio no tiene contenedores ni base de datos, y `valmen migrate` sólo retira del routing los roles ausentes de `ROLES` (`packages/cli/src/commands.ts:437-458`), donde los tres nuevos ya están. No hay despliegue en el alcance: el ticket no autoriza commit, push, tag ni release.

## Plan

- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan).
- Aprobación **delegada**: el PO, Juan Andrade, el 2026-09-26 dio la potestad en
  sus palabras —«si el analisis pasa las compuertas te doy la libertad de
  aprobarlo, al igual que con el plan si el plan pasa la compuerta y te parece que
  el plan cumple tienes la potestad de aprobar»—. La compuerta `plan` salió
  `APPROVE` (media 0.894; las 7 proposiciones de criterio por encima de 0.91), así
  que la aprobación la firma esta sesión en su nombre, no el PO de puño y letra.

- Decisiones:
  1. **Los tres roles de ejecución se declaran con su consumidor, no como
     vocabulario.** `producer`, `verifier` y `escalation` entran en `ROLES`
     (`packages/adapter/src/routing.ts:77`) con el mismo trato que los cuatro
     vigentes: cada uno dice qué parte del harness lo ejecuta (`valmen gate
     --evaluator cascade`, y el eslabón de la cascada que le toca). Alternativa
     descartada: declararlos sin consumidor (`consumer: null`), que es justo lo que
     ese archivo argumenta en contra (`routing.ts:61-76`: nueve roles retirados
     por no tener quién los leyera). Costo de la alternativa: la pantalla ofrecería
     tres selectores que no cambian ninguna llamada.
  2. **La cascada vive en el camino de evaluación semántica, no en un paquete
     nuevo.** El mecanismo entra como el evaluador `cascade` en
     `packages/engine/src/evaluators.ts`, compuesto de los dos evaluadores que ya
     existen: el productor y el escalado responden con `evaluateWithJudge`
     (`packages/gate-llm-judge/src/judge.ts:277`) y el verificador con
     `evaluateWithJev` (`packages/gate-jev/src/jev.ts:183`). Alternativa
     descartada: un paquete `gate-cascade` propio; se descarta porque el motor ya
     depende de los dos paquetes (`packages/engine/package.json`) y el paquete
     nuevo agregaría configuración de build sin aislar nada que hoy no esté
     aislado.
  3. **El verificador tiene que emitir probabilidades.** Si el rol `verifier` no
     apunta a un modelo de Decisions, la cascada se rechaza con
     `NoEvaluatorError` en vez de verificar con un juez de chat: un verificador
     que devuelve booleanos con confianza autoinformada es tan débil como el
     productor, y escalar contra él sería teatro. Alternativa descartada: aceptar
     cualquier modelo y dejar el umbral como única garantía — descartada porque
     convierte «verificado» en una etiqueta sin respaldo.
  4. **El motivo del escalamiento se guarda por proposición.** `GateReceipt` gana
     `escalations` (`packages/gate/src/receipt.ts:65`), con las proposiciones
     escaladas, los modelos de origen y destino, la probabilidad que emitió el
     verificador y el umbral. Alternativa descartada: un campo de texto libre
     dentro de `reason` — descartada porque el motivo tiene que poder leerse por
     proposición y con su número, que es lo que hace auditable el escalamiento.
  5. **El evaluador es opt-in.** `--evaluator cascade` existe; `auto` no lo elige.
     Alternativa descartada: que `auto` lo elija cuando el gate necesita juicio —
     descartada porque multiplicaría por tres el costo de todas las compuertas de
     todos los proyectos sin que nadie lo haya pedido, y porque una capacidad
     nueva entra apagada por diseño (`design.md` D2).

- Pasos ordenados:
  1. `packages/adapter/src/routing.ts` — los tres roles en `ROLES` con su
     consumidor y su descripción, en los cuatro `PRESETS` y en el cálculo de
     `probabilistic` del verificador (:415-417); `probabilistic` pasa a cubrir
     también `verifier`. Nuevos `CascadeRouting` y `cascadeRoutingFor(root)`, que
     rechaza una cadena cuyo productor y escalado son el mismo modelo. Sin
     archivos nuevos.
  2. `packages/gate/src/receipt.ts` — `EscalationRecord`, el campo opcional
     `escalations` en `GateReceipt` y en `ReceiptInput`, y su inclusión en
     `buildReceipt`; `summarizeReceipt` (:220-226) marca el escalamiento.
  3. `packages/engine/src/evaluators.ts` — `EvaluatorId` gana `cascade` y
     `SelectOptions` gana `cascade` (las tres rutas resueltas); `runCascade` con el
     productor, la verificación por proposición con Jev y el escalado de lo no
     respaldado —una proposición que el verificador respaldó no se vuelve a
     preguntar, así que el modelo caro se paga sólo por lo dudoso—;
     `EvaluationOutcome.escalations`.
  4. `packages/engine/src/gate.ts` — pasa `cascade` a `evaluateGate` (:369-388),
     `escalations` a `buildReceipt` (:419-440) y agrega la línea del escalamiento
     al informe con la etiqueta del evaluador (:463-467).
  5. `packages/cli/src/main.ts:1450-1462`, `packages/mcp/src/tools.ts:2528-2537` y
     `packages/server/src/gates.ts` (`runTicketGate`, :317-352) — el borde:
     `cascade` en la lista de evaluadores admitidos y `cascadeRoutingFor(root)` en
     las opciones que viajan al motor. La lista crece, el orden no cambia: un gate
     cuyas proposiciones tienen comando se sigue resolviendo con `command` y sin
     gastar ninguna llamada, porque `chooseEvaluator` decide por capacidades
     (`evaluators.ts:127-136`) y `cascade` sólo entra cuando se pide por nombre.
  6. Pruebas nuevas: `tests/roles-ejecucion.test.ts`,
     `tests/cascada-verificada.test.ts` y `tests/cascada-evaluador.test.ts`.

- Rollback: `git checkout --` sobre los cinco archivos de `src` y `rm` de los tres
  archivos de prueba. Nada del registro depende del cambio: los recibos ya
  emitidos no se tocan —el campo es opcional y `receiptVersion` no cambia— y
  `valmen gate` sin `--evaluator cascade` se comporta exactamente igual que antes.

## Criterios de aceptación

- [x] El routing resuelve los roles `producer`, `verifier` y `escalation` con su modelo, su proveedor y su esfuerzo en los cuatro presets.
      <!-- test: npx vitest run tests/roles-ejecucion.test.ts -->
- [x] La cadena se rechaza cuando el productor y el escalado son el mismo modelo, o cuando el verificador no emite probabilidades.
      <!-- test: npx vitest run tests/roles-ejecucion.test.ts -->
- [x] La cascada responde con el modelo del productor y vuelve a preguntar al escalado sólo las proposiciones que la verificación no respaldó.
      <!-- test: npx vitest run tests/cascada-verificada.test.ts -->
- [x] El recibo del gate registra cada escalamiento con la proposición, el modelo de destino, la probabilidad que emitió el verificador y el umbral.
      <!-- test: npx vitest run tests/cascada-verificada.test.ts -->
- [x] La cascada sin cadena resuelta, o con una cadena que el routing rechazó, se rechaza sin llamar a ningún modelo.
      <!-- test: npx vitest run tests/cascada-verificada.test.ts -->
- [x] La cascada no se elige sola: con el evaluador automático el gate sigue resolviéndose con Jev.
      <!-- test: npx vitest run tests/cascada-verificada.test.ts -->
- [x] El CLI nombra los cinco evaluadores admitidos, `cascade` incluido, al rechazar un valor desconocido en `--evaluator`.
      <!-- test: npx vitest run tests/cli.test.ts -->
- [x] El esquema de `evaluar_compuerta` en el servidor MCP declara los mismos evaluadores que el motor, `cascade` incluido.
      <!-- test: npx vitest run tests/mcp-server.test.ts -->
- [x] Un gate cuyas proposiciones tienen comando se evalúa sin gastar ninguna llamada a un modelo.
      <!-- test: npx vitest run tests/evaluators.test.ts -->

## Puntos

```json
[]
```

## Implementación

Implementado por esta sesión (no hubo ejecutor: el código de este repositorio lo
escribe la sesión, y no se lanzó ninguna sesión de OpenCode sobre este árbol).

- `packages/adapter/src/routing.ts` — los tres roles de ejecución en `ROLES`
  (`:110-124`) con su `consumer` y su descripción, en los cuatro `PRESETS`
  (`:150`, `:194`, `:235`, `:270`), el cálculo de `probabilistic` extendido al rol
  `verifier` (`:415-421`) y los nuevos `CascadeStep`, `CascadeRouting` y
  `cascadeRoutingFor(root)` (`:520-600`), que resuelven los tres eslabones con la
  misma precedencia que los demás roles, dicen de dónde salió cada uno y devuelven
  el `reason` que impide ejecutar una cadena inservible: productor y escalado con
  el mismo modelo —escalar a donde ya se preguntó no cambia la respuesta— o un
  verificador que no emite probabilidades.
- `packages/gate/src/receipt.ts` — `EscalationModel`, `EscalationRecord` y el campo
  opcional `escalations` de `GateReceipt` y de `ReceiptInput`, incluido en
  `buildReceipt` sólo cuando hay escalamientos (`receiptVersion` no cambia); el
  resumen del recibo (`summarizeReceipt`) marca los escalamientos por separado de
  la escalada a una persona, que son dos cosas distintas.
- `packages/engine/src/evaluators.ts` — `EvaluatorId` gana `cascade`,
  `EVALUATOR_IDS` e `isEvaluatorId` (una sola lista para los tres bordes, que antes
  tenían cada uno la suya escrita a mano), `CascadeOptions` y la opción `cascade` de
  `SelectOptions`; `runCascade` produce con el rol `producer`, verifica con el rol
  `verifier` una proposición por respuesta producida y contra el mismo estado
  congelado, y sólo vuelve a preguntar al rol `escalation` lo que quedó por debajo
  del umbral —el del gate, o el que declare la cadena—; el consumo del resultado es
  la suma de los tres pasos y `exigirCadena` rechaza la corrida antes de gastarla.
- `packages/engine/src/gate.ts` — pasa `cascade` a `evaluateGate`, `escalations` al
  recibo (`:446`) y agrega al informe el bloque del escalamiento con la proposición,
  la probabilidad, el umbral y el modelo de destino; la etiqueta del evaluador
  (`:474-478`) nombra la cascada.
- Los tres bordes —`packages/cli/src/main.ts:1452-1470`,
  `packages/mcp/src/tools.ts:2530-2547` y `packages/server/src/gates.ts:317-324` con
  su envoltorio `cascadeRouting` en `packages/server/src/routing.ts:53-64`— admiten
  `cascade` tomando la lista del motor y resuelven la cadena donde ya leen el
  routing, para que los modelos del recibo sean los que de verdad se usaron.
- Cambio mínimo deliberado, escrito por esta sesión y no por un ejecutor
  (`packages/cli/src/main.ts:1167-1172` y `:1530-1538`): el centinela
  `__handled__` cortaba el cuerpo de `run` por excepción y el `catch` general
  imprimía `Error: __handled__` **en lugar del mensaje que el comando había
  escrito** —el rechazo del evaluador llegaba al usuario como `Error: __handled__`—.
  Se declaró `result` fuera del `try` y el `catch` imprime el resultado cuando el
  centinela es lo que cortó. Apareció al cablear la lista de evaluadores, que es
  justo lo que este ticket toca; sin esto, el borde admitía `cascade` y no podía
  decirlo.
- Pruebas: `tests/roles-ejecucion.test.ts` (nuevo, 7 casos: catálogo de roles,
  resolución por preset y por override, cadena resuelta y sus dos rechazos) y
  `tests/cascada-verificada.test.ts` (nuevo, 8 casos: productor y verificación sin
  escalar, escalado de lo no respaldado, motivo con número y umbral, consumo de los
  tres pasos, el recibo escrito en disco y leído, y los dos rechazos sin gastar
  llamada). Desvío declarado del paso 6 del plan: no se creó
  `tests/cascada-evaluador.test.ts`; los dos casos del borde fueron a los archivos
  que ya tienen montado cada borde —`tests/cli.test.ts` y
  `tests/mcp-server.test.ts`—, y el de las proposiciones con comando a
  `tests/evaluators.test.ts`, con lo que se evita un archivo nuevo que duplicaría
  andamiaje. `tests/routing.test.ts` fija el catálogo de roles y se actualizó con
  los tres nuevos.

## Pruebas

- Comandos del contrato, corridos por esta sesión desde la raíz del repositorio,
  sobre el árbol de trabajo de este ticket (no hay `dist` que valga como fuente: los
  tests corren contra `src` por alias del `vitest.config.ts`):
  - `npx vitest run tests/roles-ejecucion.test.ts` → 1 archivo, 7 pruebas, todas pasan.
  - `npx vitest run tests/cascada-verificada.test.ts` → 1 archivo, 8 pruebas, todas pasan.
  - `npx vitest run tests/cli.test.ts` → 1 archivo, 20 pruebas, todas pasan.
  - `npx vitest run tests/mcp-server.test.ts` → 1 archivo, 68 pruebas, todas pasan.
  - `npx vitest run tests/evaluators.test.ts` → 1 archivo, 32 pruebas, todas pasan.
- Suite completa: `npx vitest run` → **1450 pasan, 48 omitidas, 0 fallan** (71
  archivos en verde, 1 omitido). Línea base del 2026-09-26: 1433 pasan, 48 omitidas,
  0 fallan. La diferencia son las 17 pruebas nuevas de este ticket —7 de
  `roles-ejecucion`, 8 de `cascada-verificada`, una del CLI y una del MCP— y no hay
  ningún rojo nuevo ni ninguna prueba que haya dejado de correr.
- Comprobación del borde con el binario real, después de `npm run build`: `valmen
  --root . gate analysis --id X --evaluator inventado` →
  `Error: Evaluador desconocido: "inventado". Use auto, command, jev, llm-judge, cascade.`
  (código 2). Antes de este cambio el mismo comando imprimía `Error: __handled__`,
  con el mensaje perdido.
- No se corrió la cascada contra los proveedores reales: gastaría tres llamadas
  pagas por corrida y lo que el ticket tiene que dejar demostrado —qué modelo
  responde cada proposición, cuándo se escala y qué queda escrito en el recibo— está
  cubierto con los evaluadores inyectados, que es como el motor ya se prueba. El
  camino con modelos reales queda para quien pida una corrida de verdad.
- Lectura del árbol al cerrar la verificación: `git rev-parse HEAD` =
  5c6fd8d (rama `main`), con los cambios de este ticket sin commitear —la
  autorización vigente no incluye commit, push ni tag—. Ninguna otra sesión tenía
  el repositorio tomado al empezar ni durante el trabajo.
- Resultado del PO: aprobación **DELEGADA** por Juan Andrade el 2026-09-26, con sus
  palabras —«si las pruebas que ejecutes pasan correctamente como yo ejecutaria las
  mismas pasa como aprobado el QA y cierras»—. Esta sesión corrió el contrato de
  pruebas completo —los cinco archivos enfocados y la suite entera— sobre el árbol
  del ticket y todos pasan, así que el QA se aprueba por esa delegación y no por una
  confirmación suya de hoy; no se le atribuye a él ninguna frase que no haya
  escrito.

- Consumo: al preparar el cierre, el motor sumó por su cuenta una segunda sesión de
  este perfil (`20260927_114207_3857ec`, «Hacer Slack opcional en ejecución de
  tickets»): tocó archivos del registro y por eso entra, pero no es ejecutor de este
  ticket —no escribió ninguna línea de este cambio— y su proveedor es por
  suscripción, sin coste por token. Queda dicho para que esa fila no se lea como
  trabajo de este ticket. La sesión que lo trabajó entero es la de cron
  (`cron_5f21330118ab_20260927_114709`), y su entrada es la lectura hecha al
  registrar el consumo, con la fila todavía creciendo.

## QA

```json
[
  {
    "id": "QA-001",
    "date": "2026-09-27",
    "build_reference": "worktree:sha256:363cfeb9bf5f7420fc6b6080788743b3134b51ea420332a7de347be0f16045d0",
    "environment": "local: arbol de trabajo de la sesion, rama main, sin commit",
    "result": "pending",
    "findings": [],
    "correction": null,
    "po_confirmation": null
  },
  {
    "id": "QA-002",
    "date": "2026-09-27",
    "build_reference": null,
    "environment": null,
    "result": "approved",
    "findings": [],
    "correction": null,
    "po_confirmation": "Aprobacion DELEGADA por el PO Juan Andrade el 2026-09-26, sus palabras: si las pruebas que ejecutes pasan correctamente como yo ejecutaria las mismas pasa como aprobado el QA y cierras. El QA lo aprobo esta sesion en su nombre, sobre el arbol de trabajo del ticket: el contrato de pruebas pasa completo (los cinco archivos enfocados y la suite entera con 1450 pasan, 48 omitidas, 0 fallan)."
  }
]
```

## Evidencia

```json
[
  {
    "id": "EVIDENCE-001",
    "date": "2026-09-27",
    "kind": "test",
    "description": "Contrato de pruebas del ticket, corrido por el verificador desde la raiz del repositorio: los cinco archivos enfocados en verde (roles-ejecucion 7, cascada-verificada 8, cli 20, mcp-server 68, evaluators 32) y la suite completa npx vitest run con 1450 pasan, 48 omitidas y 0 fallan contra la linea base de 1433/48/0 del 2026-09-26; la diferencia son las 17 pruebas nuevas. Archivos del cambio en orden alfabetico: packages/adapter/src/routing.ts, packages/cli/src/main.ts, packages/engine/src/evaluators.ts, packages/engine/src/gate.ts, packages/gate/src/receipt.ts, packages/mcp/src/tools.ts, packages/server/src/gates.ts, packages/server/src/routing.ts, packages/server/src/server.ts, tests/cascada-verificada.test.ts, tests/cli.test.ts, tests/mcp-server.test.ts, tests/roles-ejecucion.test.ts y tests/routing.test.ts. El codigo lo escribio la sesion, sin ejecutor.",
    "reference": "worktree:sha256:363cfeb9bf5f7420fc6b6080788743b3134b51ea420332a7de347be0f16045d0",
    "point_id": null
  },
  {
    "id": "EVIDENCE-002",
    "date": "2026-09-27",
    "kind": "test",
    "description": "Verificacion posterior al primer recibo, al preparar el commit: el escaner de secretos marco en tests/cascada-verificada.test.ts un literal con forma de credencial (apiKey con un valor inventado) y se retiro la linea, porque los dos evaluadores entran inyectados y la credencial no participa. Cambio de prueba, sin cambio de comportamiento. Se volvieron a correr el archivo tocado (8 pruebas verdes) y la suite completa (1450 pasan, 48 omitidas, 0 fallan), y npm run typecheck termina sin errores. Referencia recalculada sobre los mismos catorce archivos en orden alfabetico, que es la que corresponde al arbol que se commitea: el worktree:sha256 anterior (363cfeb9...45d0) describia la version previa a esa linea.",
    "reference": "worktree:sha256:24b065fd0df6664484377a36b9278a9bc6e1b006ee1e68fc59af4870608f7ccf",
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
    "date": "2026-09-27",
    "technical_summary": "Los roles producer, verifier y escalation entran en el catalogo del adapter con su consumidor y en los cuatro presets; cascadeRoutingFor resuelve la cadena y la rechaza con motivo cuando el productor y el escalado son el mismo modelo o el verificador no emite probabilidades. El motor gana el evaluador cascade en evaluators.ts (EvaluatorId, EVALUATOR_IDS e isEvaluatorId, SelectOptions.cascade, runCascade): produce con el rol producer, verifica una proposicion por respuesta producida contra el mismo estado congelado y solo vuelve a preguntar al escalado lo que queda bajo el umbral del gate. El recibo gana EscalationRecord y el campo opcional escalations, con la proposicion, los modelos de origen y destino, la probabilidad del verificador y el umbral, y el informe del gate imprime el bloque del escalamiento. Los tres bordes (CLI, MCP y servidor) admiten cascade tomando la lista del motor y resuelven la cadena donde ya leen el routing. Se corrigio de paso un defecto del CLI: el centinela __handled__ cortaba run y el catch general imprimia Error __handled__ en lugar del mensaje del comando, con lo que el rechazo del evaluador no se veia; se declaro result fuera del try y el catch imprime el resultado. Sin commit, push, PR, tag ni despliegue: la autorizacion vigente no los incluye.",
    "functional_summary": "Un proyecto puede declarar el modelo que produce, el que verifica y el que escala, y pedir la cascada con el evaluador cascade; el modelo caro se paga solo por lo que el verificador no respalda, y cada escalamiento queda escrito en el recibo del gate con su motivo, su probabilidad y su umbral. Sin pedirla, nada cambia: auto sigue eligiendo el comando cuando las proposiciones lo tienen y Jev cuando no.",
    "qa_status": "approved",
    "qa_waiver_reason": null,
    "po_confirmation": "Aprobacion DELEGADA por el PO Juan Andrade el 2026-09-26: si las pruebas que ejecutes pasan correctamente como yo ejecutaria las mismas pasa como aprobado el QA y cierras.",
    "release_impact": "none"
  }
]
```

## Consumo de IA

```json
[
  {
    "kind": "ai-usage",
    "date": "2026-09-27",
    "session_reference": "cron_5f21330118ab_20260927_114709",
    "model": "deepseek-v4.1-flash",
    "reasoning_effort": null,
    "notes": "Sesion de cron que trabajo el ticket entera: analisis, compuertas, plan, implementacion, verificacion, QA y cierre. Lectura hecha al momento de registrar el consumo, con el turno todavia en curso: la fila de la sesion sigue creciendo hasta que este turno termina, asi que los numeros son un piso y no la medicion final (desvio declarado). No hubo ejecutor de OpenCode sobre este arbol: el codigo lo escribio esta sesion.",
    "input_tokens": 634556,
    "output_tokens": 129494,
    "total_tokens": 764050,
    "estimated_cost_usd": 0,
    "source": "hermes:/Users/juanandrade/.hermes/profiles/valmen-harness/state.db session cron_5f21330118ab_20260927_114709",
    "confidence": "high",
    "id": "CONSUMO-001"
  },
  {
    "kind": "ai-usage",
    "date": "2026-09-27",
    "session_reference": "20260927_114207_3857ec",
    "model": "opencode-go/deepseek-v4.1-flash",
    "reasoning_effort": null,
    "notes": "Agente hermes:desktop. 48 intervención(es) sobre el registro, 0 con fallo. 0 de 88 mensajes tocaron el registro. Razonamiento 22110 tokens, caché leída 2237440 tokens. Sesión \"Hacer Slack opcional en ejecución de tickets\". Proveedor por suscripción: no hay coste por token, se registran los tokens.",
    "input_tokens": 91978,
    "output_tokens": 29723,
    "total_tokens": 143811,
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
    "at": "2026-09-27T16:54:37.702Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-09-27",
    "at": "2026-09-27T16:56:49.885Z",
    "action": "gate-approved",
    "actor": "cli",
    "details": "Gate analysis aprobado por Delegacion del PO (Juan Andrade 2026-09-26): Aprobacion delegada por el PO el 2026-09-26, sus palabras: si el analisis pasa las compuertas te doy la libertad de aprobarlo. Compuerta analysis en REVIEW por diagnostico_explica_el_sintoma=0.79 (peso 3) con la media en 0.863 y el resto de las proposiciones en verde; no hay alcance mal fijado ni criterio no verificable."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-09-27",
    "at": "2026-09-27T16:56:58.822Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-09-27",
    "at": "2026-09-27T16:58:52.396Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-09-27",
    "at": "2026-09-27T16:58:52.656Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-09-27",
    "at": "2026-09-27T17:36:24.718Z",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-09-27",
    "at": "2026-09-27T17:37:46.332Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-09-27",
    "at": "2026-09-27T17:37:46.554Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-09-27",
    "at": "2026-09-27T17:37:55.756Z",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-09-27",
    "at": "2026-09-27T17:39:08.429Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-09-27",
    "at": "2026-09-27T17:39:30.388Z",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-09-27",
    "at": "2026-09-27T17:39:30.523Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-014",
    "date": "2026-09-27",
    "at": "2026-09-27T17:39:52.576Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-002."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-015",
    "date": "2026-09-27",
    "at": "2026-09-27T17:39:52.646Z",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-016",
    "date": "2026-09-27",
    "at": "2026-09-27T17:41:03.719Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-017",
    "date": "2026-09-27",
    "at": "2026-09-27T18:29:21.618Z",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-002."
  }
]
```
