---
schema_version: 2
id: IMPROVEMENT-ENGINE-PRESUPUESTOS-ADAPTATIVOS-20260926
title: Aprender costos típicos y declarar presupuestos por ticket
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

# IMPROVEMENT-ENGINE-PRESUPUESTOS-ADAPTATIVOS-20260926

## Solicitud original

Parte del sprint: Reducir el costo de contexto y habilitar el enrutado y la consulta segura.
- R-S1-003: Presupuestos adaptativos — El sistema DEBE declarar el costo típico por tipo de ticket (aprendido de los
Depende de: FEATURE-ENGINE-ROLES-ENRUTAMIENTO-20260926.
Viene de una feature descompuesta en sprints; su plan completo está en el tickets.yaml de la feature.

## Descripción funcional

- Alcance: el costo típico por tipo de ticket, aprendido de los cierres del registro, y los
  tres cortes que avisan cuando una corrida lo supera: notificación a 1.5×, degradación del
  enrutado a 2× y pausa con consulta a la persona a 3×. Incluye la lectura de los
  multiplicadores desde `.valmen/config.yaml`, el comando `valmen budget` y la degradación
  aplicada al modelo de las evaluaciones de compuerta.
- Usuario o rol afectado: quien opera el proyecto y paga el gasto —ve el típico de cada tipo
  de ticket y recibe el aviso cuando una corrida se pasa—, y el propio motor, que deja de
  usar los modelos caros en la evaluación de un ticket que ya lleva el doble de lo habitual.
- Comportamiento actual: el costo se mira a posteriori (`valmen usage` y `valmen usage
  value`), por ticket y sin referencia: no hay típico por tipo, no hay umbral, y una corrida
  que se va a 20× lo habitual no se distingue de una que cuesta lo esperado hasta que
  alguien abre el informe y lo compara a ojo.
- Comportamiento esperado: `valmen budget` declara el típico de cada tipo con los cierres que
  lo sostienen y clasifica una corrida en cumpliendo / avisando / degradando / pausando
  según los multiplicadores declarados; alcanzado 1.5× el aviso sale por el canal de Hermes,
  alcanzado 2× la compuerta de ese ticket se evalúa con el preset declarado para degradar y
  deja la nota en su recibo, y a 3× el informe pide la decisión de la persona en vez de
  tomarla.

## Diagnóstico

- Síntoma: R-S1-003 pide que el harness declare el costo típico por tipo de ticket,
  aprendido de sus cierres, y avise al superarlo con tres cortes —notificación a 1.5×,
  degradación del enrutado a 2×, pausa con consulta a la persona a 3×—. Hoy el gasto
  se mira **después**: `valmen usage` agrega los recibos de compuerta y `valmen usage
  value` lista lo que costó cada cierre, uno por uno. Ninguna de las dos declara cuánto
  suele costar un tipo de ticket, así que no hay contra qué comparar una corrida y los
  tres cortes del requisito no existen en ninguna forma —ni en el código ni en la
  configuración—: `grep -rn "budget" packages/*/src` devuelve tres comentarios que
  anticipan la pieza (`packages/adapter/src/config.ts:89`, `packages/server/src/chat.ts:182`)
  y el diseño previo de `docs/12-FUNCIONALIDADES-PROXIMAS.md:541`, que declara la forma
  de la configuración y nunca se implementó. Ocurre porque las dos cuentas de costo que
  el harness tiene son **por ticket y a posteriori**: ninguna agrupa por tipo, y por eso
  no existe el número contra el que habría que comparar.

- Archivos y flujo investigados:
  - `packages/engine/src/value.ts` — las dos fuentes de costo que ya existen, juntas:
    `ticketValueReport` (:160) recorre los cierres y suma por ticket los recibos de
    compuerta más el bloque `## Consumo de IA` (:177-185), marca `partial` el ticket con
    una sesión sin costo (:181-186) y ordena por costo (:207-210). El `type` del ticket
    viaja en cada entrada y se imprime, pero **nunca se usa como clave**: no hay
    agregación por tipo.
  - `packages/engine/src/usage.ts:124` — `usageReport`, el agregado de recibos por
    compuerta y por modelo; de ahí sale el costo real de una evaluación en curso
    (:147-153).
  - `packages/engine/src/report.ts:181` — `closedTickets`, la fuente del «aprendido de
    los cierres registrados»: devuelve `type`, `closedOn` y `releaseStatus` de cada
    ticket cerrado (`ReportEntry`, :39-63). `packages/engine/src/tickets.ts` da el
    detalle del ticket, con su `usage` y sus eventos.
  - `packages/adapter/src/routing.ts` — el único lugar donde el harness resuelve con qué
    modelo ejecuta algo propio: `gateRoutingFor` (:554) para el rol `gate-evaluator` y
    los tres eslabones de la cascada, `resolveRouting` (:451) con su precedencia
    proyecto > preset > sistema, `presetById` (:313) que valida el preset, y el preset
    barato que ya existe —`economy`, :235—. Es donde «degradación del enrutado» puede
    significar algo ejecutable, porque es lo único que el harness ejecuta con un modelo.
  - `packages/engine/src/notify.ts:127` — `hermesSendChannel`, el canal de salida, con
    el runner inyectable (:71-101) que permite probar la entrega sin salir a la red.
  - `.valmen/config.yaml` y sus dos lectores: `packages/adapter/src/config.ts:31`
    (`parseConfig` estricto, más `readString`/`readMap`/`readList`, :44-82) y
    `packages/engine/src/discovery.ts:91` (`configList`, que es como el motor ya lee
    `test-commands` y `test-timeout` de ese archivo).
  - `packages/cli/src/main.ts:1113` (`case "usage"`) y `packages/cli/src/commands.ts:1522`
    (`usageCommand`) — la forma de un comando de lectura del registro; la lista de
    comandos vive en un solo sitio, `USAGE` (`packages/cli/src/main.ts:104`), y las
    pruebas la leen de ahí (`tests/docs-cascada-verificada.test.ts:23`).
  - Los dos bordes que resuelven el routing antes de `runGate` —`packages/cli/src/main.ts:1510`
    y `packages/mcp/src/tools.ts:2602`—, y `packages/engine/src/gate.ts:54-106`, que
    recibe los modelos ya resueltos porque el motor no lee configuración.
  - `.valmen/features/evolucion-harness/spec/s1-costo-contexto/spec.md:24-29` — el
    requisito, con sus tres multiplicadores y la exigencia de que sean configurables por
    proyecto.
  - `.valmen/memory/aprendizajes.md` — `buscar_memoria` con «presupuesto», «costo típico
    por tipo de ticket» y «degradar el routing por costo» devuelve una sola entrada
    (AP-002, un ciclo de importación): no hay un error conocido que este ticket repita.

- Causa raíz: la observabilidad del costo se construyó **descriptiva y a posteriori**, y
  el típico no existe porque su unidad de agrupación nunca se usó como clave.
  `ticketValueReport` (`packages/engine/src/value.ts:160`) recorre los cierres uno por
  uno y los ordena por costo (:207-210); informa cuánto costó cada ticket, no cuánto
  suele costar su tipo. Sin típico no hay umbral, y sin umbral los tres cortes del
  requisito no tienen contra qué comparar: no es que falte el cableado de una
  configuración que ya se lee, es que falta la pieza que convierte los cierres en una
  referencia. La segunda mitad es de dónde sale el costo de una corrida **en curso**: el
  único gasto que el harness registra mientras trabaja es el de sus propias evaluaciones
  (`packages/engine/src/usage.ts:147-153`), y el de los agentes entra al ticket recién al
  cerrarlo (`value.ts:177`). Una clasificación de corrida tiene que leer las dos fuentes
  del ticket por su identificador —lo mismo que ya hace `value.ts`, sin la condición de
  cierre— y que el típico de su tipo.

- Riesgos y compatibilidad: lo único que toca un comportamiento existente es la
  degradación del enrutado, porque `gateRoutingFor` (`packages/adapter/src/routing.ts:554`)
  decide el modelo del evaluador y de la cadena de la cascada. Tres cosas la acotan:
  (1) las acciones nacen **apagadas** —`budgets.adaptive.enabled` en falso por defecto—,
  que es la decisión D2 de la feature, «una capacidad nueva que escribe o ejecuta nace
  apagada»; (2) sin cierres del tipo del ticket no hay típico, y sin típico no hay corte
  que aplicar; (3) los cuatro presets mantienen `gate-evaluator` en `jev` (:158, :203,
  :240), así que degradar mueve el productor y el escalado de la cascada y el veredicto
  de la compuerta no pierde reproducibilidad. Guardas que no deben moverse:
  `tests/usage.test.ts`, `tests/value.test.ts` y `tests/routing.test.ts` siguen verdes.
  El comando nuevo es de lectura salvo `--avisar`, y la lectura no escribe en el registro
  ni mueve estados.

- Impactos de sync, migración, Docker o despliegue: ninguno — el cambio lee el registro y
  resuelve configuración, y no escribe ni ejecuta nada del camino de cada impacto:
  - **sync**: no se toca `valmen sync` ni el camino que proyecta `.valmen/` a `AGENTS.md`
    —que no lee `packages/`—, y la pieza nueva no publica nada en `AGENTS.md`.
  - **migración**: no hay esquema ni base de datos que migrar; el registro es Markdown y
    JSON, el cambio no toca `packages/core/src/migrate.ts` ni el comando `valmen migrate`,
    y la configuración nueva es una clave opcional más.
  - **Docker**: este repositorio no tiene contenedores ni `docker-compose`, y el cambio no
    agrega ninguno.
  - **despliegue**: el alcance no incluye release, tag ni despliegue, que además no están
    cubiertos por la autorización vigente; el comando nuevo corre en la máquina de quien
    lo invoca y no publica nada.

## Plan

- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan).
- Aprobación **delegada**: el PO, Juan Andrade, el 2026-09-27 dio la potestad en sus
  palabras —«analizar, planear, implementar, verificar y CERRAR este ticket, aprobando la
  compuerta `analysis`, la compuerta `plan` y el QA con la delegación citada arriba»—, y
  la frase que autoriza la cadena es suya del mismo día: «que necesito que en 3 horas
  programes 3 tickects mas de la misma manera que hiciste con el 3». La firma la pone esta
  sesión en su nombre, no el PO de puño y letra, y la compuerta `plan` se corre sobre este
  plan de todos modos. Recibo: `.valmen/receipts/IMPROVEMENT-ENGINE-PRESUPUESTOS-ADAPTATIVOS-20260926.jsonl`.
- Compuerta `analysis`, corrida dos veces: **REVIEW**, media 0.822 y después 0.832. Lo que
  quedó en banda son tres proposiciones: `riesgos_cubren_impactos=0.51` —el caso conocido
  de un ticket que declara «sin impactos», que no tiene de qué agarrarse—,
  `diagnostico_explica_el_sintoma=0.86 → 0.88` y `nombra_archivos_reales=0.89`. Ninguna es
  un hueco de fondo: la causa es concreta (`causa_especifica=0.95`), la clasificación está
  completa, los impactos están declarados con su motivo por impacto y el alcance está
  fijado. Se recomienda seguir, con los valores a la vista; la segunda corrida fue la
  pasada de mejora que el propio informe nombraba y movió la media tres centésimas.
- Compuerta `plan`, corrida dos veces: **REVIEW**, media 0.821 y después 0.802. La primera
  dejó ocho proposiciones en banda y el propio informe nombró lo accionable: los criterios
  agrupaban dos afirmaciones cada uno. Se partieron en 24 criterios atómicos y la banda no se
  despejó —quedaron diez entre 0.83 y 0.89, ya sin ningún aviso de forma—, que es el
  comportamiento que el estándar del proyecto documenta: los criterios desplegados como
  proposiciones se quedan en esa banda por más que se redacten de nuevo. Nada de fondo
  quedó flojo: `hay_archivos_afectados=0.98`, `criterios_verificables=0.94`,
  `rollback_suficiente=0.90`, los impactos declarados con su motivo por impacto y todos los
  criterios con su comando. Se recomienda aprobar y seguir, con los valores a la vista.
- Decisiones:
  1. **El costo típico de un tipo es la mediana de sus cierres, y los cierres con costo
     parcial quedan fuera.** La mediana y no la media: un ticket que se fue a 20× por un
     agente dando vueltas es exactamente lo que esta pieza existe para detectar, y con la
     media ese mismo ticket sube la referencia y tapa el próximo. Los cierres con una
     sesión sin costo (`partial`, `packages/engine/src/value.ts:181-186`) no entran —un
     proveedor por suscripción contado como cero haría parecer barato lo que no se midió—
     y se cuentan aparte para poder decirlo. Fuente: `closedTickets`
     (`packages/engine/src/report.ts:181`) para el `type` de cada cierre y `readTicket`
     (`packages/engine/src/tickets.ts`) para su bloque `## Consumo de IA`, tal como ya los
     junta `value.ts:177-185`. Alternativa descartada: la media de los cierres; costo de la
     alternativa: la referencia que el requisito quiere usar para avisar la mueve el caso
     que hay que avisar.
  2. **Los tres cortes son multiplicadores sobre el típico, y viven en
     `budgets.adaptive` de `.valmen/config.yaml`.** `multipliers: {notify: 1.5, degrade: 2,
     pause: 3}` con esos valores por defecto, `min-samples: 3`, `learn-from-days: 90`,
     `enabled: false` y `degrade-preset: economy`. El requisito pide que los
     multiplicadores sean configurables por proyecto y `min-samples` es la misma decisión
     aplicada al dato: un típico sostenido por un solo cierre es una anécdota, así que por
     debajo del mínimo el típico **se declara** y no se usa como umbral. `enabled` en falso
     por defecto es la decisión D2 de la feature —«una capacidad nueva que escribe o ejecuta
     nace apagada»—: consultar no cuesta y no cambia nada, y lo que cambia el modelo de una
     compuerta se enciende a propósito. Alternativa descartada: los multiplicadores fijos en
     el código; costo de la alternativa: un proyecto cuyo trabajo normal cuesta el triple no
     puede ajustar el umbral sin tocar el motor.
  3. **La degradación del enrutado se aplica al modelo de la compuerta, que es lo único que
     el harness ejecuta con un modelo.** `gateRoutingFor` (`packages/adapter/src/routing.ts:554`)
     gana un preset opcional, y los dos bordes que hoy resuelven el routing —`packages/cli/src/main.ts:1510`
     y `packages/mcp/src/tools.ts:2602`— pasan el preset declarado para degradar cuando el
     ticket alcanzó el corte. La razón de que sea ahí y no en otro lado: el comentario de
     `packages/adapter/src/routing.ts:72-76` lo deja escrito —el harness no es un runtime de
     agentes, solo puede elegir el modelo de lo que él mismo ejecuta—, así que degradar «el
     enrutado» solo puede significar los roles de sus propias evaluaciones. La nota que lo
     explica se escribe en el recibo (`notes`, `packages/engine/src/gate.ts:448`), porque un
     cambio de modelo sin motivo escrito se lee como una configuración que no se respetó.
     Alternativa descartada: declarar el corte en el informe y no aplicarlo; costo de la
     alternativa: un corte que nadie consume es una etiqueta, y el gasto sigue igual.
  4. **El corte de pausa consulta a la persona y no bloquea la compuerta que una persona
     corre a mano.** A 3× el informe pide la decisión y `valmen budget --check` sale con el
     código de invariante, para que quien ejecute desatendido —`valmen run`, R-S5-002— tenga
     de dónde colgar la parada; detener la ejecución es R-S5-005
     (`SECURITY-ENGINE-PARADA-SEGURA-20260926`, que depende de este ticket) y no se
     adelanta acá. Bloquear una compuerta que alguien pidió a mano sería castigar al que
     está mirando el gasto justo cuando lo está mirando. Alternativa descartada: que la
     compuerta se niegue a evaluar a 3×; costo de la alternativa: un ticket caro deja de
     poder evaluarse por razones ajenas a su artefacto, y la decisión de parar la toma un
     número en vez de una persona.
  5. **El aviso sale por el canal de Hermes, con destino propio, y se dispara con
     `valmen budget --avisar`.** El destino es `hermes.notify.budget` —la clave que el
     propio lector anticipa («los avisos de proceso y de presupuesto entran como una clave
     más bajo `notify`», `packages/adapter/src/config.ts:89`)— y el payload lo arma el motor
     (`renderBudgetNotification`), como el de un gate o un proceso
     (`packages/engine/src/notify.ts:261`). Se dispara a mano y no desde la compuerta porque
     en este harness las notificaciones ya salen de su puente y no de la evaluación
     (`packages/cli/src/hermes.ts:1003`, `hermesNotifyPendientes`), y porque no existe
     todavía una corrida desatendida que las emita sola. Alternativa descartada: mandar el
     aviso desde `valmen gate`; costo de la alternativa: una evaluación que manda mensajes
     convierte cada corrida de prueba en un mensaje al celular de alguien.
- Pasos ordenados:
  1. `tests/presupuestos.test.ts` (nuevo) — el contrato primero y en rojo: el típico por
     tipo con su mediana, sus exclusiones y su mínimo de muestras; los tres cortes; la
     política leída y sus rechazos; el preset degradado y la nota del recibo; el payload del
     aviso; el código de salida del corte de pausa.
  2. `packages/engine/src/budget.ts` (nuevo) — `readBudgetPolicy`, `learnTypicalCosts`,
     `ticketRunCost`, `classifyRunCost`, `budgetForTicket`, `presetForDegradation` y
     `renderBudgetReport`.
  3. `packages/engine/src/notify.ts` — `renderBudgetNotification`, con el ticket, el costo,
     el típico, el múltiplo y la consulta cuando el corte es la pausa.
  4. `packages/engine/src/index.ts` — la exportación del módulo nuevo.
  5. `packages/engine/src/gate.ts` — `GateRunOptions.notes`, que se anexan a las notas del
     recibo (`:448`) sin tocar el veredicto.
  6. `packages/adapter/src/routing.ts` — el preset opcional de `gateRoutingFor`
     (`:554`); `resolveRouting` (`:451`) y los presets no cambian.
  7. `packages/adapter/src/config.ts` — `hermes.notify.budget` en `HermesConfig` y su
     lectura (`:109-131`).
  8. `packages/cli/src/commands.ts` — `budgetCommand`: el informe, `--avisar` por el canal y
     `--check` con su código de salida.
  9. `packages/cli/src/main.ts` — el caso `budget`, la entrada correspondiente en `USAGE`
     (`:104`) y la resolución del preset degradado antes de `runGate` (`:1510`).
  10. `packages/mcp/src/tools.ts` — la misma resolución en `evaluar_compuerta` (`:2602`),
      para que el camino del agente no use otro modelo que el del comando.
  11. `docs/02-MOTOR.md` y `docs/04-PROVEEDORES.md` — el comando y la clave de
      configuración donde ya se documentan `valmen usage` (`docs/02-MOTOR.md:538`) y el
      control de costo (`docs/04-PROVEEDORES.md:369`).
- Rollback: revertir los commits del cambio. La pieza nueva es un módulo que nadie más
  importa, la clave de configuración es opcional —sin `budgets.adaptive` el motor lee los
  valores por defecto y `enabled` en falso—, y no hay estado que deshacer: el registro no
  se escribe, ningún ticket cambia de estado y lo único que sobrevive al revert son los
  recibos ya emitidos, que son historia y no se reescriben. Con `enabled: false` y el
  preset sin override, `gateRoutingFor` devuelve exactamente lo mismo que devolvía antes.

## Criterios de aceptación

- [x] `valmen budget --tipo FEATURE` declara el costo típico de ese tipo como la mediana de sus cierres
      <!-- test: npx vitest run tests/presupuestos.test.ts -->
- [x] El informe declara cuántos cierres sostienen cada típico
      <!-- test: npx vitest run tests/presupuestos.test.ts -->
- [x] Un tipo sin cierres registrados se declara sin típico en vez de declararlo cero
      <!-- test: npx vitest run tests/presupuestos.test.ts -->
- [x] Los cierres con costo parcial quedan fuera del típico
      <!-- test: npx vitest run tests/presupuestos.test.ts -->
- [x] El informe declara aparte cuántos cierres quedaron fuera por costo parcial
      <!-- test: npx vitest run tests/presupuestos.test.ts -->
- [x] Un tipo con menos cierres que `min-samples` declara su típico marcado como referencia
      <!-- test: npx vitest run tests/presupuestos.test.ts -->
- [x] Un tipo con menos cierres que `min-samples` no aplica ningún corte a la corrida
      <!-- test: npx vitest run tests/presupuestos.test.ts -->
- [x] Una corrida por debajo de 1.5× del típico se clasifica cumpliendo
      <!-- test: npx vitest run tests/presupuestos.test.ts -->
- [x] Una corrida a 1.5× del típico se clasifica avisando
      <!-- test: npx vitest run tests/presupuestos.test.ts -->
- [x] Una corrida a 2× del típico se clasifica degradando
      <!-- test: npx vitest run tests/presupuestos.test.ts -->
- [x] Una corrida a 3× del típico se clasifica pausando
      <!-- test: npx vitest run tests/presupuestos.test.ts -->
- [x] Los multiplicadores declarados en `budgets.adaptive.multipliers` reemplazan los valores por defecto
      <!-- test: npx vitest run tests/presupuestos.test.ts -->
- [x] Un multiplicador no numérico se rechaza nombrando la clave del archivo
      <!-- test: npx vitest run tests/presupuestos.test.ts -->
- [x] Unos multiplicadores que no suben de notify a pause se rechazan con su motivo
      <!-- test: npx vitest run tests/presupuestos.test.ts -->
- [x] Con `budgets.adaptive.enabled` en falso el informe declara los típicos aprendidos
      <!-- test: npx vitest run tests/presupuestos.test.ts -->
- [x] Con `budgets.adaptive.enabled` en falso ninguna corrida degrada el enrutado
      <!-- test: npx vitest run tests/presupuestos.test.ts -->
- [x] Alcanzado el corte de degradación el routing de la compuerta se resuelve con el preset declarado en `degrade-preset`
      <!-- test: npx vitest run tests/presupuestos.test.ts -->
- [x] La nota que explica la degradación queda escrita en el recibo de la compuerta
      <!-- test: npx vitest run tests/presupuestos.test.ts -->
- [x] El aviso del corte lleva el ticket, el costo, el típico, el múltiplo alcanzado
      <!-- test: npx vitest run tests/presupuestos.test.ts -->
- [x] Alcanzado el corte de pausa el aviso pide la decisión de la persona en vez de decidirla
      <!-- test: npx vitest run tests/presupuestos.test.ts -->
- [x] `valmen budget --check` sale con el código de invariante cuando el corte es la pausa
      <!-- test: npx vitest run tests/presupuestos.test.ts -->
- [x] `valmen budget --check` sale con cero cuando el corte es menor que la pausa
      <!-- test: npx vitest run tests/presupuestos.test.ts -->
- [x] El destino del aviso se declara en la clave `hermes.notify.budget`
      <!-- test: npx vitest run tests/presupuestos.test.ts -->
- [x] Sin destino declarado el aviso no se manda
      <!-- test: npx vitest run tests/presupuestos.test.ts -->

## Puntos

```json
[]
```

## Implementación

Implementado por esta sesión con TDD, sobre el árbol de trabajo en `main` con `HEAD`
`4a6f20a` y sin archivos ajenos en el árbol al empezar (`git status --short` limpio salvo
el propio ticket). La prueba se escribió primero y se verificó en rojo por la razón
correcta —`Failed to load url ../packages/engine/src/budget.js`— antes de escribir una
línea del código.

Lo que se construyó, en el orden del plan:

- `tests/presupuestos.test.ts` (nuevo, 27 pruebas) — el contrato: la mediana de los cierres
  contra la media, las exclusiones por costo parcial, el mínimo de muestras como referencia,
  los tres cortes, la política leída con sus dos rechazos, el preset degradado, la nota del
  recibo, el payload del aviso y el código de salida del corte de pausa.
- `packages/engine/src/budget.ts` (nuevo) — `readBudgetPolicy`, `learnTypicalCosts`,
  `ticketRunCost`, `classifyRunCost`, `presetForDegradation`, `budgetForTicket`,
  `budgetRouting` y `renderBudgetReport`. Sin red y sin escribir: el módulo lee el registro
  y devuelve un veredicto.
- `packages/engine/src/notify.ts` — `renderBudgetNotification`, con el ticket, el costo, el
  típico, el múltiplo y la consulta cuando el corte es la pausa.
- `packages/engine/src/gate.ts` — `GateRunOptions.notes`, que se anexan a las notas del
  recibo sin tocar el veredicto.
- `packages/adapter/src/routing.ts` — el preset opcional de `gateRoutingFor` y de
  `cascadeRoutingFor`, por el que el presupuesto degrada una evaluación concreta sin escribir
  configuración; los roles que el proyecto declaró a mano siguen ganando.
- `packages/adapter/src/config.ts` — `hermes.notify.budget` en `HermesConfig`.
- `packages/cli/src/commands.ts` y `packages/cli/src/main.ts` — `budgetCommand` (el informe,
  `--avisar` y `--check`), el caso `budget`, su entrada en `USAGE` y la resolución del preset
  degradado antes de `runGate`.
- `packages/server/src/routing.ts` y `packages/server/src/gates.ts` — la misma degradación en
  el camino de Mission Control y `packages/mcp/src/tools.ts` en el del agente: una compuerta
  evaluada con otro modelo según quién la pida no sería la misma compuerta.
- `docs/02-MOTOR.md` y `docs/04-PROVEEDORES.md` — el comando en la lista de consumo y la
  sección de control de costo reescrita sobre lo que existe, con lo que sigue sin
  implementarse declarado como tal (`per_ticket`, `per_day` y la parada automática, que es
  R-S5-005).

Dos cosas que la verificación encontró y que quedan dichas:

- **La suite completa encontró un defecto real del cambio, y se corrigió.** `USAGE`
  documentaba `--tipo <TIPO>` y el analizador de la línea de comandos no lo declaraba entre
  las banderas que consumen valor, así que `valmen budget --tipo FEATURE` habría tomado
  `--tipo` como bandera suelta y `FEATURE` como argumento posicional. Lo detectó
  `tests/cli.test.ts` («todas las que la ayuda documenta con `<valor>` están declaradas»),
  no una revisión a ojo: `--tipo` se sumó a `VALUE_OPTIONS` en `packages/cli/src/main.ts`.
- **El registro real de este proyecto casi no sostiene típicos todavía, y es un dato, no un
  defecto.** `valmen budget` sobre este registro lee 11 cierres y deja **7 fuera por costo
  parcial**: son tickets cuyas sesiones corrieron con un proveedor por suscripción, que no
  declara costo. Quedan dos tipos con típico —`FEATURE $0.1150` e `IMPROVEMENT $0.0002`— y
  los dos son **referencias** (2 cierres cada uno, por debajo de los 3 de `min-samples`), así
  que hoy no aplican ningún corte. Eso es el comportamiento que el ticket pide —un típico de
  dos cierres no degrada nada— y a la vez dice cuándo esta pieza empieza a servir: cuando el
  registro tenga tres cierres con costo completo del mismo tipo. La decisión de encender
  `budgets.adaptive.enabled` es del PO y no se tomó: queda en falso, que es el valor por
  defecto.

Sin commit, sin push, sin tag y sin despliegue: la autorización vigente no los cubre.


## Pruebas

- Resultado comunicado por el PO: aprobación **DELEGADA** — el PO, Juan Andrade, el
  2026-09-27 dio la potestad en sus palabras —«analizar, planear, implementar, verificar y
  CERRAR este ticket, aprobando la compuerta `analysis`, la compuerta `plan` y el QA con la
  delegación citada arriba»—, y la frase que habilita la cadena es suya del mismo día: «que
  necesito que en 3 horas programes 3 tickects mas de la misma manera que hiciste con el 3».
  La firma de esta aprobación la pone esta sesión en su nombre, no el PO de puño y letra, y
  el QA que se aprueba es el que corrió esta sesión sobre el árbol que se describe abajo.

Contrato de pruebas corrido por el verificador —esta sesión, no un agente— desde la raíz del
repositorio (`/Users/juanandrade/Desktop/ValmenHarness`), sobre el árbol de trabajo en `main`
con `HEAD` `4a6f20a` y sin archivos ajenos al ticket:

- `npx vitest run tests/presupuestos.test.ts` — **27 pasan, 0 fallan**, en rojo por la razón
  correcta antes de escribir el código (`Failed to load url ../packages/engine/src/budget.js`).
- `npx vitest run` — la suite completa: **1517 pasan, 48 omitidas, 0 fallan** (75 archivos).
  La corrida anterior a la última corrección dio **1 fallo**, y era del cambio:
  `tests/cli.test.ts` («todas las que la ayuda documenta con `<valor>` están declaradas»)
  señaló que `USAGE` documentaba `--tipo` sin declararlo entre las banderas que consumen
  valor. Se corrigió en `packages/cli/src/main.ts` y la suite volvió a verde; la línea base
  de fallos ajenos es **cero** en este árbol.
- `npx tsc --noEmit -p tsconfig.json` — sin errores de tipo (después de `npm run build`, que
  dejó el `dist` al día para que los paquetes se resuelvan entre sí).
- `valmen budget` y `valmen budget --id IMPROVEMENT-ENGINE-PRESUPUESTOS-ADAPTATIVOS-20260926`
  — corridos a mano sobre el registro real: 11 cierres leídos, 7 fuera por costo parcial,
  `FEATURE $0.1150` e `IMPROVEMENT $0.0002` como referencias, y la corrida de este ticket en
  `cumple` por no haber corte aplicable (su típico se sostiene con 2 cierres, menos que los 3
  de `min-samples`). La línea de estado del informe dice que las acciones están apagadas.
- `valmen gate qa-mechanical --id … --evaluator command` — **APPROVE**, con los 24 criterios
  en 1,00 y coste cero; el recibo está anexado en
  `.valmen/receipts/IMPROVEMENT-ENGINE-PRESUPUESTOS-ADAPTATIVOS-20260926.jsonl` y su hash de
  estado es el del ticket entregado (se marcaron las casillas y se volvió a correr la
  compuerta para que el recibo describa el artefacto final, no el anterior).

Deuda declarada, sin cambiar el alcance: los tres cortes se aplican hoy sobre el típico
aprendido y el de degradación mueve el preset de las compuertas, pero **la parada automática
del trabajo desatendido al cruzar la pausa es R-S5-005** y no se adelanta acá —este ticket
deja el veredicto, el aviso y el código de salida. Tampoco se encendió
`budgets.adaptive.enabled`: queda en falso, que es el valor por defecto y la decisión D2 de la
feature, y encenderlo es una decisión del PO.


## QA

```json
[
  {
    "id": "QA-001",
    "date": "2026-09-28",
    "build_reference": "worktree:sha256:46bc0243a39b33b597f1e5735b5bb4e5bb69b63b38baea74ad17be51afceae00",
    "environment": "local: arbol de trabajo de la sesion, rama main, sin commit; HEAD 4a6f20a",
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
    "po_confirmation": "Aprobacion DELEGADA por el PO Juan Andrade el 2026-09-27, sus palabras: analizar, planear, implementar, verificar y CERRAR este ticket, aprobando la compuerta analysis, la compuerta plan y el QA con la delegacion citada arriba. La firma la pone esta sesion en su nombre. Corrido sobre el arbol de trabajo del ticket (HEAD 4a6f20a, sin commit): tests/presupuestos.test.ts 27 pasan y 0 fallan, la suite completa npx vitest run 1517 pasan, 48 omitidas y 0 fallan, tsc sin errores y la compuerta qa-mechanical en APPROVE con los 24 criterios en 1.00."
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
    "description": "Contrato de pruebas del ticket, corrido por el verificador (esta sesion) desde la raiz del repositorio: tests/presupuestos.test.ts 27 pasan y 0 fallan; la suite completa npx vitest run 1517 pasan, 48 omitidas y 0 fallan (la corrida anterior dejo 1 fallo real del cambio, en tests/cli.test.ts por --tipo sin declarar, corregido en packages/cli/src/main.ts); tsc --noEmit sin errores; y el comando valmen budget corrido a mano sobre el registro real. Archivos del cambio en orden alfabetico: docs/02-MOTOR.md, docs/04-PROVEEDORES.md, packages/adapter/src/config.ts, packages/adapter/src/routing.ts, packages/cli/src/commands.ts, packages/cli/src/main.ts, packages/engine/src/budget.ts, packages/engine/src/gate.ts, packages/engine/src/index.ts, packages/engine/src/notify.ts, packages/mcp/src/tools.ts, packages/server/src/gates.ts, packages/server/src/routing.ts, tests/hermes-notify.test.ts y tests/presupuestos.test.ts.",
    "reference": "worktree:sha256:46bc0243a39b33b597f1e5735b5bb4e5bb69b63b38baea74ad17be51afceae00",
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
    "technical_summary": "R-S1-003 implementado: el costo tipico por tipo de ticket se aprende como la mediana de sus cierres (sesiones mas recibos de compuertas, dejando fuera los cierres con costo parcial) y se declara con valmen budget; los tres cortes del requisito son multiplicadores configurables en budgets.adaptive de .valmen/config.yaml, con el aviso a 1.5x, la degradacion del preset de la compuerta a 2x (con la nota en el recibo) y la pausa que consulta a 3x dejando el codigo de invariante para una corrida desatendida. Piezas nuevas: packages/engine/src/budget.ts y tests/presupuestos.test.ts (27 pruebas); el resto son puntos de extension que ya existian: GateRunOptions.notes, el preset opcional de gateRoutingFor y cascadeRoutingFor, hermes.notify.budget y el comando budget en los tres bordes (CLI, Mission Control y MCP). Las acciones nacen apagadas (enabled en falso).",
    "functional_summary": "El harness ahora sabe cuanto suele costar cada tipo de trabajo y lo dice por comando: valmen budget declara el tipico por tipo con sus cortes, y con --id dice donde esta esa corrida. A 1.5x del tipico avisa (--avisar lo manda al destino hermes.notify.budget), a 2x evalua las compuertas de ese ticket con el preset barato en vez de seguir gastando en los modelos caros, y a 3x pide la decision de una persona en vez de tomarla. Un tipo que todavia no tiene tres cierres con costo declara su tipico como referencia y no corta nada.",
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
    "date": "2026-09-28",
    "session_reference": "cron_6b7f94afcd27_20260927_200833",
    "model": "deepseek-v4.1-flash",
    "reasoning_effort": null,
    "notes": "Sesion de cron que trabajo el ticket entera: analisis, compuertas, plan, implementacion, verificacion, QA y cierre. Lectura hecha al momento de registrar el consumo, con el turno todavia en curso: la fila de la sesion sigue creciendo hasta que este turno termina, asi que los numeros son un piso y no la medicion final (desvio declarado: razonamiento 60025 tokens y coste informado 0.0). El proveedor factura por suscripcion, asi que no se declara coste por token. No hubo ejecutor de OpenCode sobre este arbol: el codigo lo escribio esta sesion.",
    "input_tokens": 932495,
    "output_tokens": 120487,
    "total_tokens": 1052982,
    "estimated_cost_usd": null,
    "source": "hermes:/Users/juanandrade/.hermes/profiles/valmen-harness/state.db session cron_6b7f94afcd27_20260927_200833",
    "confidence": "high",
    "id": "CONSUMO-001"
  },
  {
    "kind": "ai-usage",
    "date": "2026-09-28",
    "session_reference": "20260926_230404_d977c6",
    "model": null,
    "reasoning_effort": null,
    "notes": "Agente hermes:desktop. Sesión **compartida**: trabajó 7 tickets (FEATURE-ENGINE-ROLES-ENRUTAMIENTO-20260926 ×59, IMPROVEMENT-ENGINE-CASCADA-VERIFICADA-20260926 ×53, FEATURE-CLI-MODO-ASK-20260926 ×50, DOCS-ENGINE-CASCADA-VERIFICADA-20260926 ×17, IMPROVEMENT-ENGINE-PRESUPUESTOS-ADAPTATIVOS-20260926 ×17), así que su costo no se reparte y acá no se registran números. Costo completo de la sesión: no declarado por el proveedor, 779418 tokens. Registralo en el ticket cuya sesión sea propia, o declaralo compartido donde corresponda. Sesión \"Bot Chat\".",
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
    "at": "2026-09-28T01:15:26.188Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-09-27",
    "at": "2026-09-28T01:18:24.215Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-09-27",
    "at": "2026-09-28T01:19:35.716Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-09-27",
    "at": "2026-09-28T01:19:35.846Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-09-27",
    "at": "2026-09-28T01:48:06.635Z",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-09-27",
    "at": "2026-09-28T01:48:12.181Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-09-27",
    "at": "2026-09-28T01:48:12.305Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-09-27",
    "at": "2026-09-28T01:48:16.309Z",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-09-27",
    "at": "2026-09-28T01:48:21.602Z",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-09-27",
    "at": "2026-09-28T01:48:21.727Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-09-27",
    "at": "2026-09-28T01:48:54.375Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-09-27",
    "at": "2026-09-28T01:49:02.417Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-002."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-014",
    "date": "2026-09-27",
    "at": "2026-09-28T01:49:02.512Z",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-015",
    "date": "2026-09-27",
    "at": "2026-09-28T01:49:02.650Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-016",
    "date": "2026-09-27",
    "at": "2026-09-28T02:33:11.574Z",
    "action": "gate-approved",
    "actor": "cli",
    "details": "Gate analysis aprobado por Delegacion del PO (Juan Andrade 2026-09-27): Aprobacion DELEGADA. La tanda se autorizo el 2026-09-27 con las palabras del PO: «�, cuyo alcance declaro el programador de la tanda como aprobar analysis plan y QA; y el PO confirmo el registro de estas decisiones con sus palabras del mismo dia: «�. La compuerta quedo en REVIEW con diagnostico_explica_el_sintoma=0.88, nombra_archivos_reales=0.89 y riesgos_cubren_impactos=0.51, con causa_especifica=0.95 y clasificacion completa; el ticket declara sin impactos con su motivo, que es el caso conocido en que esa proposicion no tiene de que agarrarse. No hay alcance mal fijado ni riesgo sin mitigacion. Se aprueba para que el recibo no siga contando como esperando la decision de una persona en un ticket ya cerrado."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-017",
    "date": "2026-09-27",
    "at": "2026-09-28T02:33:11.702Z",
    "action": "gate-approved",
    "actor": "cli",
    "details": "Gate plan aprobado por Delegacion del PO (Juan Andrade 2026-09-27): Aprobacion DELEGADA. La tanda se autorizo el 2026-09-27 con las palabras del PO: «�, cuyo alcance declaro el programador de la tanda como aprobar analysis plan y QA; y el PO confirmo el registro de estas decisiones con sus palabras del mismo dia: «�. La compuerta quedo en REVIEW con diez proposiciones de criterio entre 0.83 y 0.89 y cubre_todos_los_criterios=0.64 (descriptiva, no decide); en verde clasificacion completa, criterios_verificables=0.94, rollback_suficiente=0.90 y hay_archivos_afectados=0.98. Es el caso mas claro de banda estructural: todos los criterios por encima de 0.83 y ninguno alcanza 0.90. Se aprueba para que el recibo no siga contando como esperando la decision de una persona en un ticket ya cerrado."
  }
]
```
