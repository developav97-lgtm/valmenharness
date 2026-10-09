---
schema_version: 2
id: BUGFIX-SERVER-AGENTES-OBSOLETOS-Y-ESTADO-WORKTREE-20261009
title: El lector muestra agentes terminados como ejecutando y el estado del ticket solo cambia al integrar
type: BUGFIX
module: SERVER
workflow_status: awaiting_user_tests
qa_status: pending
release_status: unreleased
user_visible: false
sync_impact: false
migration_impact: false
docker_impact: false
risk_level: normal
created: 2026-10-08
updated: 2026-10-08
related_ticket: null
target_release: null
released_in: null
---

# BUGFIX-SERVER-AGENTES-OBSOLETOS-Y-ESTADO-WORKTREE-20261009

## Solicitud original

Palabras del PO el 2026-10-09, parte de sus correcciones de los mundos (ticket hermano IMPROVEMENT-WEB-MUNDOS-CORRECCIONES-20261009), y el PO dijo «Recomiendo A, abre el ticket del servidor»: «el cambio de estados. Lo revisé con varios tickets al momento de su ejecución. El agente principal lanza el ticket a un subagente. El subagente hace todo el proceso de análisis. El principal corrigió el análisis, pasó al plan, se aprobó el plan y se pasó a implementar. Pero el ticket visualmente, ni dentro del ticket ni dentro de los mundos de los agentes, pasó por todos sus estados. Solamente se actualizó cuando pasó a pruebas. Los agentes que están haciendo las fases no están actualizando el estado instantáneamente; creo que si el ticket empezó el análisis debería pasar a la casilla de análisis, si ya pasó el análisis y se empezó el plan debería pasar al plan.» Y: «en los pantallazos se ven tres registros: uno de sesión principal, uno que dice ticket sesión principal y uno que es el que estaba trabajando en ese momento; solo faltaba un ticket por ejecutar, que era el agente que estaba ahí, pero seguían apareciendo tres agentes; es más, en este momento ese agente sigue apareciendo.» En la captura, la fila «FEATURE-SERVER-SESION-PRINCIPAL-20261008» aparece como «ejecutando» e «inferida», con herramienta Bash de «hace 3 h», aunque ese subagente ya terminó. Hipótesis a comprobar en el análisis, sin planificar sobre ella: los subagentes escriben el estado del ticket en su worktree y la vista lee el registro del checkout principal, que solo cambia al integrar.

### Supuestos y decisiones pendientes

<!-- Si el pedido nombra algo que el código no tiene —parámetro, permiso,
campo, bandera, columna, migración— y no lo especifica, listá cada elemento
con su pregunta antes de avanzar a análisis; el análisis no planifica sobre
la adivinanza. Si no hay ninguno, escribí «Ninguno» y seguí. -->
- D1 — Señal de fin del subagente. Pregunta al PO: ¿un subagente se da por terminado cuando la sesión principal registra su `<task-notification>` con `<status>` `completed`, `failed`, `killed` o `stopped` posterior a su último evento? Opción por defecto: sí, los cuatro estados terminan la fila; `running` no la termina.
- D2 — Dónde se lee el estado del ticket de un subagente. Pregunta al PO: ¿el lector toma `ticketEstado` de la copia del ticket en el worktree del subagente (`<root>/.claude/worktrees/ticket-<slug>/tickets/…`, ruta de `nombresDeWorktree`) cuando existe, y del checkout principal si no? Opción por defecto: sí, solo para la fila del subagente (`ticketEstado` de `GET /api/corrida/agentes`); `GET /api/tickets`, los KPI y la cola siguen leyendo el checkout principal. La alternativa —que el harness escriba el estado en el principal mientras el subagente trabaja— rompe «un solo escritor» y no entra en este ticket.
- D3 — Fase confirmada. El registro de actividad (`registrar_actividad_ejecucion`) no se usa en ninguna corrida real (0 llamadas en los transcripts), así que la fase es siempre «inferida». Pregunta al PO: ¿se deja fuera de este ticket? Opción por defecto: fuera; si se quiere, va en un ticket del harness o de la skill `corrida-orquestada`.

## Descripción funcional

- Alcance: el lector de la vista Agentes (`packages/server/src/agentes.ts`, `GET /api/corrida/agentes`): (1) dar por terminado un subagente que terminó aunque su transcript no cierre con `end_turn`; (2) que la estación del ticket de un subagente refleje el estado que el subagente escribió en su worktree, antes de integrar. Fuera: la escritura del estado por el harness, la integración (`worktree-integrar.ts`), `GET /api/tickets` y la fase confirmada (D3).
- Usuario o rol afectado: el PO que sigue una corrida orquestada en la vista Agentes (tabla y mundos).
- Comportamiento actual: (1) la fila del subagente «Ticket sesión principal» (FEATURE-SERVER-SESION-PRINCIPAL-20261008, agente `af690511df61835ff`) sigue en el panel horas después de terminar, con fase «ejecutando · inferida» y Bash «hace 3 h»; (2) la estación del ticket se queda en `intake` mientras el subagente lo mueve a `analyzed`, `planned`, `approved` e `in_progress`, y salta a `awaiting_user_tests` solo cuando el orquestador integra la rama.
- Comportamiento esperado: (1) un subagente terminado sale con estado `termino` y deja el panel en el siguiente refresco; (2) la estación del ticket sigue el estado que el subagente escribe en su worktree.

## Diagnóstico

Memoria consultada (`buscar_memoria` «agentes de corrida transcript subagente terminó estado ejecutando worktree registro»): sin antecedentes; los resultados (AP-003, AP-006, AP-007, AP-009, AP-010) son de compuertas y no aplican.

- Causa comprobada (con `ruta:línea`):
  - Fila obsoleta. `estadoDe` (`packages/server/src/agentes.ts:431-441`) da `termino` solo si `lectura.cerro`, que vale `true` solo cuando el último mensaje del asistente trae `stop_reason === "end_turn"` (`packages/server/src/agentes.ts:276`). El transcript real `~/.claude/projects/-Users-juanandrade-Desktop-ValmenHarness/4f9b1b12-ced4-4132-9151-c3a025ede085/subagents/agent-af690511df61835ff.jsonl` termina con el mensaje final del agente (`msg_011CfqgLwkwdiDHAZzBG1dDf`, 2026-10-09T00:00:01.576Z, bloques `thinking` y `text`) con `stop_reason: null`; su último `tool_use` fue `Bash` (2026-10-08T23:58:08Z) y ya tiene resultado. Por eso `cerro=false`, `pendiente=false`, y pasado el minuto `estadoDe` devuelve `esperando` para siempre. `agentesVivos` (`packages/server/web/index.html:6227-6231`) y `filasDePanelAgentes` (`packages/server/web/agentes/montaje.js:137-140`) cuentan `esperando` como vivo, y `inferirFase("Bash")` (`packages/server/src/agentes.ts:390`) da el rótulo «ejecutando», marcado «inferida» porque no hay fase confirmada (`packages/server/web/index.html:6263-6267`, `6378`). El subagente sí terminó: la sesión principal `4f9b1b12-ced4-4132-9151-c3a025ede085.jsonl` registra `<task-notification>` con `<task-id>af690511df61835ff</task-id>` y `<status>completed</status>` a las 2026-10-09T00:00:03.375Z (línea 144, `queue-operation`, y línea 146, mensaje de usuario), dos segundos después del último evento del subagente. Medido en los 77 transcripts de subagentes del proyecto: 75 cierran con `end_turn`, 1 con `stop_reason: null` (este) y 1 sigue en curso (`tool_use`); las notificaciones de la sesión principal traen `completed` (1431), `failed` (65), `killed` (7), `stopped` (4) y `running` (9). El transcript del subagente no basta para saber que terminó; la señal fiable es la notificación en el transcript de la sesión principal, que el lector ya abre (`packages/server/src/agentes.ts:470`) pero no consulta para los subagentes.
  - Estado del ticket. El problema no es del lector: es de dónde escribe el harness. El subagente trabaja en su worktree y `valmen transition` escribe el `ticket.md` de ese worktree (`.claude/worktrees/ticket-<slug>/tickets/2026/<ID>/ticket.md`, ruta de `nombresDeWorktree`, `packages/engine/src/worktree-git.ts:38-46`). El lector une `ticketEstado` con `readTicket(opciones.paths, …)` (`packages/server/src/agentes.ts:499-505`), y `paths` es `context.paths ?? choosePaths(context.root)` (`packages/server/src/server.ts:429`, `1038-1039`; `choosePaths` en `packages/engine/src/discovery.ts:289-291`): el registro del checkout principal. Datos reales: en el principal, `tickets/2026/FEATURE-SERVER-SESION-PRINCIPAL-20261008/ticket.md` está en `intake` en el commit `909ac35` (18:37:56 −05) y pasa a `awaiting_user_tests` en `bf059ff` (19:02:45 −05), sin estados intermedios; los eventos del propio ticket registran `ticket-transition` a las 23:55:03Z, 23:58:04Z, 00:01:13Z, 00:01:23Z y 00:02:42Z, todos escritos en el worktree e integrados juntos. `GET /api/tickets` (`packages/server/src/server.ts:447`, `listTickets` en `packages/engine/src/tickets.ts:174`) y la fase confirmada (`.valmen/executions/events.jsonl`, `packages/engine/src/execution-events.ts:98-99`) también leen el principal. La estación del mundo sale de `fila.ticketEstado` (`packages/server/web/agentes/motor.js:33-39`). Escribir en el worktree y unir al integrar es el diseño de la corrida orquestada (invariante «un solo escritor»; `worktree-registros.ts` une los registros append-only al integrar), así que el lector solo puede compensarlo leyendo la copia del worktree (D2).
- Hipótesis pendientes:
  - Por qué el mensaje final de `af690511df61835ff` quedó con `stop_reason: null`: es del cliente (Claude Code) y no se puede comprobar desde el repositorio. Solo se vio una vez en 77 transcripts; el arreglo no depende de la causa.
  - La `cwd` y la `gitBranch` del transcript del subagente no sirven para ubicar su worktree: `agent-af690511df61835ff.jsonl` registra 104 eventos con `cwd` del principal y 42 con el worktree, todos con `gitBranch` `main`, y `agent-a3c8a01ce8594ebd1.jsonl` registra solo la `cwd` del principal. La ruta del worktree se deriva del identificador del ticket (`nombresDeWorktree`), no del transcript.
- Consumidores afectados: `GET /api/corrida/agentes` (`packages/server/src/server.ts:1024-1046`); la tabla de agentes vivos y los KPI de la vista Corrida (`packages/server/web/index.html:6227`, `6283-6303`, `6361`); el panel y la escena de los mundos (`packages/server/web/agentes/montaje.js:115-141`, `packages/server/web/agentes/motor.js:33`); las pruebas `tests/actividad-agentes.test.ts`.
- Archivos y flujo investigados: `packages/server/src/agentes.ts` (lectura del transcript, `estadoDe`, unión con el registro), `packages/server/src/claude.ts:120-160` y `498-509` (carpetas del proyecto y `subagents/`), `packages/server/src/server.ts:429`, `1016-1046`, `packages/engine/src/discovery.ts:289`, `packages/engine/src/tickets.ts:174`, `214`, `packages/engine/src/worktree-git.ts:38`, `packages/engine/src/worktree.ts:103`, `packages/engine/src/execution-events.ts:98`, `152`, `packages/engine/src/worktree-registros.ts`, `packages/server/web/index.html:6220-6400`, `packages/server/web/agentes/montaje.js`, `packages/server/web/agentes/motor.js`; transcripts reales de las sesiones `4f9b1b12-…` y `9f1455c8-…`; historial git del ticket FEATURE-SERVER-SESION-PRINCIPAL-20261008.
- Riesgos y compatibilidad: leer la notificación obliga a abrir el transcript de la sesión principal también para los subagentes; se toma solo `task-id`, `status` y la hora (lista blanca), nunca `summary`, `result` ni `output-file`, para no romper la regla de no copiar texto del transcript (C14 y PP-C10 actuales). Un subagente reanudado con `SendMessage` escribe eventos después de su notificación y debe seguir vivo: la notificación solo vale si es posterior al último evento del subagente. Leer el ticket del worktree es solo lectura y se limita a la ruta derivada del identificador dentro de `<root>/.claude/worktrees/`; si la copia no existe o es ilegible se usa el principal, como hoy. El contrato del endpoint no cambia (mismos campos).
- Impactos de sync, migración, Docker o despliegue: ninguno; es lectura local del servidor de la vista, sin datos sincronizados, migraciones, contenedores ni despliegue.

## Plan

- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan). Decisión del PO el 2026-10-09: «Aprueba el plan con D1, D2 y D3 por defecto».
- Alcance: solo `packages/server/src/agentes.ts` y una prueba nueva `tests/agentes-obsoletos.test.ts`. Exclusiones: la web (`packages/server/web/**`), `GET /api/tickets`, el motor (`packages/engine/**`), la escritura del estado por el harness, la integración de worktrees y la fase confirmada (D3). El contrato de `AgenteDeCorrida` no cambia.
- Pasos ordenados:
  1. `packages/server/src/agentes.ts`, función nueva `finesDeSubagentes(contenido: string): Map<string, number>`: recorre el transcript de la sesión principal tolerando líneas cortadas; de cada evento `queue-operation` o `user` cuyo texto contenga `<task-notification>` toma solo `<task-id>`, `<status>` y `timestamp`; guarda por `task-id` la hora más reciente con `status` en `completed`, `failed`, `killed` o `stopped`, e ignora `running`. No guarda `summary`, `result` ni `output-file`. Se cachea con la misma firma `mtime:size` que `leerConCache`, en un mapa propio. (C1, C4, C5, C6, C7, C9, C10)
  2. `packages/server/src/agentes.ts`, `leerAgentesDeCorrida`: calcula `finesDeSubagentes` del transcript de la sesión principal (`ruta`) una vez por llamada; para cada subagente, con `id = basename(archivo).replace(/^agent-/, "")`, si hay fin y su hora es mayor o igual que `lectura.ultimoEventoEn`, el estado es `termino`; si no, el estado sigue saliendo de `estadoDe` sin cambios. La sesión principal no usa esta regla. (C1, C2, C3, C8)
  3. `packages/server/src/agentes.ts`, función nueva `estadoDelTicket(paths: RegistryPaths, ticket: string): string | null`: si `nombresDeWorktree(ticket)` (de `@valmen/engine`) da una carpeta que existe bajo `paths.root`, lee `readTicket(choosePaths(<root>/<carpeta>), ticket)?.workflowStatus`; si la carpeta no existe, el ticket falta, es ilegible o `nombresDeWorktree` lanza, cae a `readTicket(paths, ticket)` como hoy. Reemplaza el bloque de `packages/server/src/agentes.ts:498-505`. Solo lectura. (C11, C12, C13, C14)
  4. `tests/agentes-obsoletos.test.ts`, prueba nueva con `home` y `root` temporales y reloj inyectado, con el patrón de `tests/actividad-agentes.test.ts`: el vector del caso real (`stop_reason: null`, Bash con resultado, notificación `completed` a las 00:00:03.375Z, reloj 03:00Z) devuelve `termino`; el mismo sin notificación devuelve `esperando`; un caso por cada `status`; uno reanudado; uno con otro `task-id`; el endpoint sin `summary` ni `output-file`; worktree en `planned` frente a principal en `intake`; sin worktree; worktree sin el ticket; `mtime` sin cambios; `GET /api/tickets` sin cambios. (C1–C15)
  5. Correr `npx vitest run tests/agentes-obsoletos.test.ts tests/actividad-agentes.test.ts` y `npx tsc --build tsconfig.build.json` desde la raíz del worktree. (C16, C17)
  6. Verificación manual en la vista Agentes (`#/agentes`, que consulta `GET /api/corrida/agentes`) con el servidor levantado desde el worktree: el panel de `filasDePanelAgentes` suelta un subagente terminado y la estación de `estacionDe` sigue al worktree. (C18, C19)
- Pseudocódigo del estado de un subagente:
  ```text
  fin = finesDeSubagentes(transcriptPrincipal).get(id)
  si fin != null y (ultimoEventoEn == null o fin >= ultimoEventoEn): termino
  si no: estadoDe(lectura, ahora)   // regla actual, sin cambios
  ```
- Impactos declarados: ninguno; no hay sincronización, migración ni contenedores.
- Compatibilidad: los campos de la respuesta no cambian; solo cambian los valores de `estado` (de `esperando` a `termino` para subagentes terminados) y de `ticketEstado` (el del worktree cuando existe). Las aserciones de `tests/actividad-agentes.test.ts` no cambian.
- Rollback (obligatorio): revertir el commit del ticket en `packages/server/src/agentes.ts` y borrar `tests/agentes-obsoletos.test.ts`; no hay datos ni registros que deshacer porque el cambio es solo de lectura.

<!-- Los criterios de la sección siguiente se numeran C1…Cn, con una afirmación verificable por criterio
     —una frase con «y» son dos criterios—, y cada uno lleva debajo su anotación de
     verificación: un comentario HTML que dice «test:» y el comando, o «verify: manual». La
     sección no lleva comentarios dentro: un comentario con anotación se leería como la de un
     criterio. Ejemplo en la skill planificacion. -->
## Criterios de aceptación

- [x] C1: Un subagente cuyo último mensaje del asistente trae `stop_reason: null` y cuya sesión principal registra `<task-notification>` con su `task-id` y `<status>completed</status>` posterior a su último evento sale con estado `termino`.
      <!-- test: npx vitest run tests/agentes-obsoletos.test.ts -->
- [x] C2: La prueba determinista del caso real (último evento 2026-10-09T00:00:01.576Z, notificación `completed` 2026-10-09T00:00:03.375Z, último `tool_use` Bash con resultado, reloj 2026-10-09T03:00:00Z) devuelve estado `termino`.
      <!-- test: npx vitest run tests/agentes-obsoletos.test.ts -->
- [x] C3: El mismo transcript del caso real sin la notificación en la sesión principal sigue devolviendo `esperando` (caso de control).
      <!-- test: npx vitest run tests/agentes-obsoletos.test.ts -->
- [x] C4: Una notificación con `<status>failed</status>` posterior al último evento deja la fila en `termino`.
      <!-- test: npx vitest run tests/agentes-obsoletos.test.ts -->
- [x] C5: Una notificación con `<status>killed</status>` posterior al último evento deja la fila en `termino`.
      <!-- test: npx vitest run tests/agentes-obsoletos.test.ts -->
- [x] C6: Una notificación con `<status>stopped</status>` posterior al último evento deja la fila en `termino`.
      <!-- test: npx vitest run tests/agentes-obsoletos.test.ts -->
- [x] C7: Una notificación con `<status>running</status>` no cambia el estado que da el transcript.
      <!-- test: npx vitest run tests/agentes-obsoletos.test.ts -->
- [x] C8: Un subagente con eventos de hace 10 s posteriores a su notificación `completed` (reanudado con `SendMessage`) sale `trabajando`.
      <!-- test: npx vitest run tests/agentes-obsoletos.test.ts -->
- [x] C9: Una notificación con el `task-id` de otro agente no cambia el estado de la fila.
      <!-- test: npx vitest run tests/agentes-obsoletos.test.ts -->
- [x] C10: La respuesta de `GET /api/corrida/agentes` en el caso de C1 no contiene el `summary` ni la `output-file` de la notificación.
      <!-- test: npx vitest run tests/agentes-obsoletos.test.ts -->
- [x] C11: Con el ticket en `planned` en `<root>/.claude/worktrees/ticket-<slug>/tickets/2026/<ID>/ticket.md` y en `intake` en el checkout principal, la fila del subagente trae `ticketEstado` `planned`.
      <!-- test: npx vitest run tests/agentes-obsoletos.test.ts -->
- [x] C12: Sin worktree del ticket, la fila trae el `ticketEstado` del checkout principal.
      <!-- test: npx vitest run tests/agentes-obsoletos.test.ts -->
- [x] C13: Con la carpeta del worktree presente y sin el ticket dentro, la fila trae el `ticketEstado` del checkout principal y no lanza error.
      <!-- test: npx vitest run tests/agentes-obsoletos.test.ts -->
- [x] C14: Leer la corrida no cambia el `mtime` de ningún archivo del worktree de prueba ni del principal.
      <!-- test: npx vitest run tests/agentes-obsoletos.test.ts -->
- [x] C15: `GET /api/tickets` sigue devolviendo el `workflowStatus` del checkout principal con el worktree en `planned`.
      <!-- test: npx vitest run tests/agentes-obsoletos.test.ts -->
- [x] C16: Las pruebas existentes del lector pasan sin cambios en sus aserciones.
      <!-- test: npx vitest run tests/actividad-agentes.test.ts -->
- [x] C17: La compilación de TypeScript termina con código 0.
      <!-- test: npx tsc --build tsconfig.build.json -->
- [ ] C18: En la vista Agentes, un subagente real que terminó deja el panel de agentes vivos en el siguiente refresco (5 s).
      <!-- verify: manual -->
- [ ] C19: En un mundo de la vista Agentes, la estación de un ticket pasa a `analyzed` cuando su subagente lo mueve en el worktree, antes de que el orquestador integre.
      <!-- verify: manual -->

## Puntos

```json
[]
```

## Implementación

- `packages/server/src/agentes.ts`: `finesDeSubagentes` (lista blanca `task-id`, `status`, hora; `completed|failed|killed|stopped`; `running` ignorado) con caché por firma `mtime:size`; en `leerAgentesDeCorrida` un subagente con fin mayor o igual que su último evento sale `termino`, si no rige `estadoDe` sin cambios (D1); `estadoDelTicket` lee el ticket de la copia del worktree y cae al principal (D2). La fase confirmada queda fuera (D3).
- `tests/agentes-obsoletos.test.ts`: 15 pruebas, con el vector del caso real y su control.

## Pruebas

Directorio: raíz del worktree (o del repositorio tras integrar). Requisitos: Node 24, `npm install` hecho.

- `npx vitest run tests/agentes-obsoletos.test.ts tests/actividad-agentes.test.ts tests/vista-corrida.test.ts tests/api-rutas.test.ts` — esperado: 4 archivos, 97 pruebas verdes (corrido: verde).
- `npx tsc --build tsconfig.build.json` — esperado: código 0 (corrido: 0).
- Medido con datos reales (lector llamado sobre el transcript de la sesión `4f9b1b12-…`, sin abrir la interfaz): el subagente `af690511df61835ff` sale `termino` (antes `esperando`) y `ticketEstado` del ticket de otro subagente sale `in_progress` desde su worktree mientras el principal aún no lo tenía.
- Manual pendiente (C18, C19): con `valmen serve` desde la raíz del repositorio ya integrado, abrir `#/agentes` durante una corrida: un subagente terminado debe salir del panel en el refresco de 5 s y la estación del ticket debe seguir `analyzed`, `planned`… antes de integrar. No se verificó en navegador.

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
    "date": "2026-10-09",
    "session_reference": null,
    "model": null,
    "reasoning_effort": null,
    "notes": "Fase implementación, sin números expuestos por la sesión.",
    "input_tokens": null,
    "output_tokens": null,
    "total_tokens": null,
    "estimated_cost_usd": null,
    "source": "manual: subagente de implementación (sonnet) sin agregado de la sesión",
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
    "date": "2026-10-08",
    "at": "2026-10-09T03:33:55.297Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-08",
    "at": "2026-10-09T03:39:34.019Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-08",
    "at": "2026-10-09T03:41:02.979Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-08",
    "at": "2026-10-09T03:44:20.063Z",
    "action": "gate-approved",
    "actor": "cli",
    "details": "Gate plan aprobado por claude (recibo GR-20261009-BUGFIX-SERVER-AGENTES-OBSOLETOS-Y-ESTADO-WORKTREE-20261009-plan-1, canal cli, decidida 2026-10-09T03:44:20.057Z): PO delegó en chat: \"Dale, aprueba la REVIEW con tu delegación\". Claude recomienda aprobar: sin BLOCK, cuatro criterios en banda (C14 0.90, C15 0.86, C17 0.90, C19 0.82) por redacción; las dos causas están comprobadas con datos reales (stop_reason null sin cierre; estado en el worktree) y el plan trae la prueba determinista del caso real y su control."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-08",
    "at": "2026-10-09T03:44:50.751Z",
    "action": "plan-approved",
    "actor": "cli",
    "details": "{\"actor\":\"PO\",\"source\":\"cli\",\"quote\":\"Aprueba el plan con D1, D2 y D3 por defecto\",\"planHash\":\"sha256:b810deeacde585b046b1e2e3536964676f03a3664c859959e3758037aad99b47\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-08",
    "at": "2026-10-09T03:44:58.743Z",
    "action": "plan-approval-verified",
    "actor": "cli",
    "details": "Aprobación del plan vigente: PO (fuente cli), plan sha256:b810deeacde585b046b1e2e3536964676f03a3664c859959e3758037aad99b47."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-08",
    "at": "2026-10-09T03:44:58.743Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-10-08",
    "at": "2026-10-09T03:45:10.406Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-10-08",
    "at": "2026-10-09T03:46:59.894Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-10-08",
    "at": "2026-10-09T03:48:26.980Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  }
]
```
