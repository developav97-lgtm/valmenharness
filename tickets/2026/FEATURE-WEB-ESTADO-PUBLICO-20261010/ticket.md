---
schema_version: 2
id: FEATURE-WEB-ESTADO-PUBLICO-20261010
title: La vista web usa la función de estado público
type: FEATURE
module: WEB
workflow_status: awaiting_user_tests
qa_status: pending
release_status: unreleased
user_visible: false
sync_impact: false
migration_impact: false
docker_impact: false
risk_level: normal
created: 2026-10-10
updated: 2026-10-11
related_ticket: null
target_release: null
released_in: null
---

# FEATURE-WEB-ESTADO-PUBLICO-20261010

## Solicitud original

Parte del sprint: El PO lee cuatro estados públicos con una sola función y recibe aviso cuando algo espera su decisión.
- R-EPU-002: La vista web DEBE mostrar el estado público con la misma función
Depende de: FEATURE-CORE-ESTADO-PUBLICO-20261010.
Viene de una feature descompuesta en sprints; su plan completo está en el tickets.yaml de la feature.

Comportamiento esperado: La vista web DEBE mostrar el estado público con la misma función
Comportamiento actual: la spec no lo declara; se establece en el análisis, leyendo el código.

### Supuestos y decisiones pendientes

<!-- Si el pedido nombra algo que el código no tiene —parámetro, permiso,
campo, bandera, columna, migración— y no lo especifica, listá cada elemento
con su pregunta antes de avanzar a análisis; el análisis no planifica sobre
la adivinanza. Si no hay ninguno, escribí «Ninguno» y seguí. -->
- El pedido no nombra nada que el código no tenga: «la misma función» es `estadoPublico` (`packages/core/src/public-state.ts:52`), con su lector `estadoPublicoDelTicket` (`packages/engine/src/public-state.ts:24`), ya cerrados en FEATURE-CORE-ESTADO-PUBLICO-20261010.
- Contador de la barra lateral (`packages/server/web/index.html:9086-9088`): cuenta solo `awaiting_user_tests` y su comentario (`index.html:9060-9063`) lo declara como «tickets que esperan una prueba de la persona», no como la lista `ESTADOS_QUE_ESPERAN_AL_PO`. Este ticket lo deja como está. Pregunta al PO: ¿el contador de «Tickets» debe pasar a contar los tickets en «Necesita tu decisión» (incluye bloqueados, cambios pedidos, plan por aprobar y compuerta escalada) o sigue contando solo las pruebas pendientes?

- Decisión del PO (2026-10-11, «Se queda como está (Recomendado)»): el contador de «Tickets» de la barra lateral (`index.html:9086`) sigue contando solo pruebas pendientes.

## Descripción funcional

- Alcance: la lista de tickets, la vista del ticket y la vista Agentes de Mission Control muestran el estado público (R-EPU-002, `.valmen/features/operacion-entrega-harness/spec/s4-estados/spec.md`) junto al estado del motor, calculado por la misma función `estadoPublico` de `@valmen/core` a través del lector `estadoPublicoDelTicket` de `@valmen/engine`; el servidor lo agrega a las respuestas de `GET /api/tickets` y `GET /api/tickets/:id`, y la constante `ESTADOS_QUE_ESPERAN_AL_PO` de la vista Agentes se reemplaza por ese dato. Fuera: el tablero de la feature conserva sus columnas (lo pide la spec), la escena animada de la vista Agentes sigue repartiendo por estado del motor (sus estaciones son posiciones, como columnas), el contador de la barra lateral (ver «Supuestos») y el aviso de Telegram (FEATURE-CLI-AVISO-DECISION-20261010).
- Usuario o rol afectado: el PO, que lee Mission Control para saber qué espera su decisión.
- Comportamiento actual: ninguna pantalla muestra el estado público. La lista y la vista del ticket muestran solo `workflow_status`; la vista Agentes cuenta «esperan al PO» con una lista propia de tres estados que no incluye el plan por aprobar ni la compuerta escalada. Es un requisito nuevo, no un defecto con síntoma previo (como AP-005, `.valmen/memory/aprendizajes.md:41`): lo observable hoy es que un ticket en `planned` sin autorización no suma en «esperan al PO» aunque espere al PO.
- Comportamiento esperado: el mismo ticket dice lo mismo en las tres vistas —por ejemplo, uno en `blocked` dice «Necesita tu decisión» en la lista y en la vista Agentes— porque las tres leen el resultado de la misma función, sin volver a agrupar estados en el navegador.

## Diagnóstico

- Causa comprobada (con `ruta:línea`): la web agrupa estados por su cuenta y no consulta la función. `ESTADOS_QUE_ESPERAN_AL_PO` (`packages/server/web/index.html:6339`) se usa en `kpisDeCorrida` (`index.html:6411`) para el KPI «esperan al PO» (`index.html:6701`), y `etiquetaDeEstadoRegistro` (`index.html:6465-6472`) colorea con otra lista (`blocked`/`changes_requested`). La lista de tickets pinta solo `t.workflowStatus` (`index.html:3287-3288`) y la vista del ticket solo el chip `workflow` de la tira (`index.html:5662-5706`). Ninguna respuesta del servidor trae el estado público: `GET /api/tickets` devuelve `listTickets` (`packages/server/src/server.ts:460-505`, filas `TicketRow` de `packages/engine/src/tickets.ts:31-58`) y `GET /api/tickets/:id` devuelve `readTicket` (`server.ts:1292-1304`), ninguno con ese campo. Como `index.html` es un archivo estático sin empaquetador, el navegador no puede importar `@valmen/core`: «la misma función» exige que el servidor la ejecute y mande su resultado.
- Hipótesis pendientes: ninguna sobre la causa. Costo medido del cálculo en servidor: `estadoPublicoDelTicket` sobre los 228 tickets del registro tarda 95–134 ms (además de 86–108 ms de `listTickets`), medido con un script sobre `@valmen/engine` en este worktree; la vista Agentes repite `GET /api/tickets` cada 5 s (`index.html:6336`, `:6643`). Se considera aceptable; si no lo fuera, se optimiza en otro ticket.
- Consumidores afectados: `vistaTickets` (`index.html:2883`, tabla en `:3236-3300`), la vista del ticket (`index.html:4824`, `tiraDeEstado` en `:5662`), la vista Agentes (`index.html:6636-6772`: KPI, tabla de agentes `tablaDeAgentes` `:6482-6516`, cola `:6745-6760` y entregados `:6762-6772`). Pruebas que leen esas respuestas o pantallas: `tests/tickets-view.test.ts:359-450` (endpoints), `tests/vista-corrida.test.ts:100-145` (registro simulado sin estado público) y `:244-258` (KPI «esperan al PO» = 2), `tests/tablero-feature.test.ts` (columnas del tablero), `tests/api-rutas.test.ts:44-45` (rutas declaradas, no cambian).
- Archivos y flujo investigados:
  - `packages/core/src/public-state.ts:10-66` — `estadoPublico` devuelve `{ state, label, reason }`; `PUBLIC_STATE_LABELS` (`:14-19`) da «Necesita tu decisión», «Verificando», «Listo», «Trabajando».
  - `packages/engine/src/public-state.ts:24-45` — `estadoPublicoDelTicket(paths, id)` lee el ticket, los recibos (último por compuerta) y `elegibilidadDeAprobacion`; lanza si el ticket no existe (`:30`).
  - `packages/engine/src/tickets.ts:174-210` — `listTickets` incluye los tickets inválidos con su error (`invalid`), lo que obliga a que el cálculo por fila no rompa la lista si un ticket no se puede leer.
  - `packages/server/src/server.ts:460-505` y `:1292-1304` — los dos endpoints que se amplían.
  - `packages/server/web/index.html:3243`, `:3287-3288` (lista), `:5630-5634` (`chip`), `:5662-5706` (tira y chips), `:6336-6339`, `:6394-6431` (KPI), `:6465-6516` (etiqueta y tabla de agentes), `:6745-6772` (cola y entregados), `:4070-4082` (tablero, sin cambio), `:9086-9088` (contador, sin cambio).
  - `packages/server/web/agentes/motor.js:8-17`, `:27-40` — estaciones de la escena por estado del motor; se conservan.
  - `scripts/verificar-interfaz.mjs` — el DOM simulado con el que `tests/vista-corrida.test.ts` ejecuta `index.html`; sirve para las pruebas de pantalla.
  - `.valmen/rules/` — solo existe `estandares-proceso.md`: no hay `estandares-*.md` de pantalla que aplicar; rige la regla de colores de `revisar_presentacion` (sin colores a mano, reutilizar las clases `chip`/`corrida-estado`).
- Riesgos y compatibilidad: el cambio de las respuestas es aditivo (un campo `publicState` nuevo; los demás siguen igual), así que los consumidores que no lo lean no cambian. Un ticket inválido o ilegible no debe tumbar `GET /api/tickets`: su `publicState` va `null` y la pantalla lo muestra como «—». El KPI «esperan al PO» cambia a propósito: pasa a contar también el plan por aprobar y la compuerta escalada, que es lo que pide R-EPU-001; eso cambia la expectativa de `tests/vista-corrida.test.ts:253` y el registro simulado de `:100-108`. Riesgo de modo oscuro: cualquier chip nuevo usa clases y variables existentes, verificado con `revisar_presentacion`.
- Impactos de sync, migración, Docker o despliegue: ninguno.

## Plan

- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan), el 2026-10-11 con «Aprobar y autorizar las 3 pruebas (Recomendado)»; el REVIEW del recibo plan-1 (criterio_14 en 0,90 y criterio_15 en 0,86) lo decidió el PO, que autoriza además el cambio a propósito de las tres pruebas de tests/vista-corrida.test.ts nombradas en este plan (EST-009).
- Alcance: el servidor agrega `publicState` (el resultado de `estadoPublicoDelTicket`, que llama a `estadoPublico` de `@valmen/core`) a cada fila de `GET /api/tickets` y al detalle de `GET /api/tickets/:id`; la web lo pinta junto al estado del motor en la lista de tickets, en la vista del ticket y en la vista Agentes, y el KPI «esperan al PO» lo cuenta en lugar de `ESTADOS_QUE_ESPERAN_AL_PO`, que desaparece. El navegador no reagrupa estados: solo lee `publicState`. Exclusiones: el tablero de la feature (`packages/server/web/index.html:4070-4082`) conserva sus columnas; la escena animada (`packages/server/web/agentes/motor.js:8-40`) sigue repartiendo por estado del motor; el contador de la barra lateral (`index.html:9086-9088`) queda como está (pregunta abierta en «Supuestos»); `@valmen/core` y `@valmen/engine` no cambian; el aviso de Telegram es de FEATURE-CLI-AVISO-DECISION-20261010.
- Tamaño previsto: 19 criterios; unas 75 líneas de producción (`server.ts` ~25, `index.html` ~50) y unas 280 de pruebas (archivo nuevo ~265, cambios declarados en `tests/vista-corrida.test.ts` ~15), unas 355 en total.
- Pruebas existentes que el plan cambia a propósito: `tests/vista-corrida.test.ts:100-108` (el ayudante `registro` recibe un tercer argumento `publicState`), `tests/vista-corrida.test.ts:136-145` (el registro simulado `TICKETS` declara el estado público de cada ticket: `FEATURE-FIN-20261008` «Necesita tu decisión»/`user-tests`, `FEATURE-CUATRO-20261008` en `planned` «Necesita tu decisión»/`plan-approval`, `FEATURE-LISTO-20261008` «Listo», los demás «Trabajando») y `tests/vista-corrida.test.ts:253` (el KPI «esperan al PO» pasa de `"2"` a `"3"`). Motivo: R-EPU-001 cuenta el plan que espera aprobación como «Necesita tu decisión», y R-EPU-002 pide que el KPI salga de la función; el ticket en `planned` sin autorización del registro simulado ahora suma. Ninguna otra prueba existente cambia.
- Pruebas de regresión de lo existente que se toca: los dos endpoints ya tienen las suyas en `tests/tickets-view.test.ts:370-395` («GET /api/tickets devuelve el resumen y la lista», «acepta los filtros por query string», «GET /api/tickets/:id devuelve el detalle»), así que no se agregan otras (C05); el tablero, en `tests/tablero-feature.test.ts` (C15); la vista Agentes, en `tests/vista-corrida.test.ts` (C16).
- Pasos ordenados:
  1. Prueba primero: crear `tests/estado-publico-web.test.ts` con un `it` por criterio nuevo, nombrado con su prefijo (`C01 …` a `C04 …`, `C06 …` a `C14 …`), y verla en rojo con `npx vitest run tests/estado-publico-web.test.ts`. C01–C04 llaman a `handleApi` (`packages/server/src/server.ts:441`) sobre un registro temporal armado como en `tests/estado-publico.test.ts` (tickets en `blocked`, en `planned` sin autorización, en `closed` y uno con frontmatter ilegible) y comparan contra `estadoPublicoDelTicket`. C06–C14 ejecutan `index.html` con `ejecutarInterfaz` de `scripts/verificar-interfaz.mjs`, como `tests/vista-corrida.test.ts:1-60`, con respuestas simuladas de `/api/tickets`, `/api/tickets/:id`, `/api/journeys` y `/api/corrida/agentes` cuyas filas traen `publicState`. Aplicar ya los cambios declarados en `tests/vista-corrida.test.ts:100-108`, `:136-145` y `:253`, y verla en rojo en el KPI. (C01–C04, C06–C14, C16)
  2. En `packages/server/src/server.ts`, importar `estadoPublicoDelTicket` de `@valmen/engine` y crear `estadoPublicoOVacio(paths, id)`: devuelve `estadoPublicoDelTicket(paths, id)` y `null` si lanza (ticket ilegible o inexistente), sin tumbar la respuesta. (C01–C04)
  3. En `GET /api/tickets` (`server.ts:460-505`), mapear `filterTickets(filas, filtros)` a `{ ...fila, publicState: estadoPublicoOVacio(paths, fila.id) }`; `summary` no cambia. (C01, C02, C04, C05)
  4. En `GET /api/tickets/:id` (`server.ts:1292-1304`), devolver `{ ...detalle, publicState: estadoPublicoOVacio(paths, detalle.id) }`. (C03, C05)
  5. En `packages/server/web/index.html`, junto a `etiquetaDeEstadoRegistro` (`:6465`), crear `etiquetaDeEstadoPublico(publicState)`: un `span` con `publicState?.label ?? "—"` y las clases existentes `corrida-estado` (más ` error` para `needs-decision` y ` ok` para `done`), con `title` = motivo cuando lo hay; sin colores nuevos. (C06, C07, C11–C13, C18)
  6. Lista de tickets: en la celda de estado (`index.html:3287-3288`), agregar `etiquetaDeEstadoPublico(t.publicState)` después del `span` de `t.workflowStatus`. (C06, C07, C14)
  7. Vista del ticket: en `tiraDeEstado` (`index.html:5698-5706`), agregar `chip("estado público", t.publicState?.label ?? "—", <tono>)` con tono `malo` para `needs-decision`, `bueno` para `done` y vacío en los demás, después del chip `workflow`. (C08)
  8. Vista Agentes: quitar `ESTADOS_QUE_ESPERAN_AL_PO` (`index.html:6339`); crear `estadoPublicoDeRegistro(id, tickets)` junto a `estadoDeRegistro` (`:6394`) que devuelve `publicState` de la fila o `null`; en `kpisDeCorrida` (`:6411`), `esperan` toma los ids con `estadoPublicoDeRegistro(...)?.state === "needs-decision"`, y conserva la suma de los agentes en `esperando` (`:6412-6414`). (C09, C10)
  9. Vista Agentes, paneles: en entregados (`index.html:6769`) agregar `etiquetaDeEstadoPublico` después de `etiquetaDeEstadoRegistro`; en la cola (`:6753-6755`) agregarla a cada `corrida-item`; en `tablaDeAgentes` (`:6494`) agregarla en la celda Ticket cuando `agente.ticket` está en el registro. `tablaDeAgentes` recibe `tickets` como tercer argumento desde `:6740`. (C11–C14)
  10. Verde: `npx vitest run tests/estado-publico-web.test.ts tests/tickets-view.test.ts tests/tablero-feature.test.ts tests/vista-corrida.test.ts tests/api-rutas.test.ts` y `npx tsc --build tsconfig.build.json`. (C05, C15–C17)
  11. Presentación: correr `revisar_presentacion` (MCP `valmen`) sobre el cambio y dejar su salida en `## Pruebas`; ningún color escrito a mano. (C18)
  12. Navegador: `npm run build` y, desde el worktree, `node packages/cli/dist/main.js serve --port 4173`; abrir `http://127.0.0.1:4173/#/tickets` (columna Estado con la etiqueta pública), `#/ticket/<un ticket en planned o blocked del registro>` (chip «estado público» en la tira) y `#/agentes` (KPI «esperan al PO» y etiquetas en entregados). Capturas para el PO: las tres pantallas en modo claro y la lista en modo oscuro, guardadas con la evidencia del ticket y citadas en `## Pruebas`. (C19)
- Impactos declarados: ninguno; no hay sincronización, migración ni contenedores.
- Rollback (obligatorio): revertir el commit de implementación; el campo `publicState` es aditivo y la web vuelve a pintar solo el estado del motor.

## Criterios de aceptación

- [x] C01: Cada fila de `GET /api/tickets` trae `publicState` igual al que devuelve `estadoPublicoDelTicket` para ese ticket.
      <!-- test: npx vitest run tests/estado-publico-web.test.ts -t C01 -->
- [x] C02: En `GET /api/tickets`, un ticket en `planned` sin autorización vigente trae `publicState.reason` igual a `plan-approval`.
      <!-- test: npx vitest run tests/estado-publico-web.test.ts -t C02 -->
- [x] C03: `GET /api/tickets/:id` trae `publicState` igual al que devuelve `estadoPublicoDelTicket` para ese ticket.
      <!-- test: npx vitest run tests/estado-publico-web.test.ts -t C03 -->
- [x] C04: Un ticket con frontmatter ilegible aparece en `GET /api/tickets` con `publicState` en `null` sin que la respuesta deje de ser 200.
      <!-- test: npx vitest run tests/estado-publico-web.test.ts -t C04 -->
- [x] C05: Las pruebas existentes de los endpoints de tickets siguen en verde.
      <!-- test: npx vitest run tests/tickets-view.test.ts -->
- [x] C06: La lista de tickets muestra la etiqueta del estado público en la celda de estado de cada fila.
      <!-- test: npx vitest run tests/estado-publico-web.test.ts -t C06 -->
- [x] C07: Una fila de la lista con `publicState` en `null` muestra «—» como estado público.
      <!-- test: npx vitest run tests/estado-publico-web.test.ts -t C07 -->
- [x] C08: La tira de la vista del ticket muestra un chip «estado público» con la etiqueta que trae `GET /api/tickets/:id`.
      <!-- test: npx vitest run tests/estado-publico-web.test.ts -t C08 -->
- [x] C09: El KPI «esperan al PO» cuenta un ticket de la corrida en `planned` cuyo `publicState` es «Necesita tu decisión».
      <!-- test: npx vitest run tests/estado-publico-web.test.ts -t C09 -->
- [x] C10: `packages/server/web/index.html` ya no contiene `ESTADOS_QUE_ESPERAN_AL_PO`.
      <!-- test: npx vitest run tests/estado-publico-web.test.ts -t C10 -->
- [x] C11: El panel de entregados de la vista Agentes muestra la etiqueta del estado público después del estado del motor.
      <!-- test: npx vitest run tests/estado-publico-web.test.ts -t C11 -->
- [x] C12: Cada ticket de la cola de la vista Agentes muestra la etiqueta de su estado público.
      <!-- test: npx vitest run tests/estado-publico-web.test.ts -t C12 -->
- [x] C13: La fila de un agente vivo en la vista Agentes muestra la etiqueta del estado público de su ticket.
      <!-- test: npx vitest run tests/estado-publico-web.test.ts -t C13 -->
- [x] C14: Un ticket en `blocked` muestra «Necesita tu decisión» tanto en la lista como en la vista Agentes.
      <!-- test: npx vitest run tests/estado-publico-web.test.ts -t C14 -->
- [x] C15: El tablero de la feature conserva sus columnas.
      <!-- test: npx vitest run tests/tablero-feature.test.ts -->
- [x] C16: Las pruebas de la vista Agentes pasan con el cambio declarado del KPI «esperan al PO».
      <!-- test: npx vitest run tests/vista-corrida.test.ts -->
- [x] C17: El monorepo compila sin errores de tipos.
      <!-- test: npx tsc --build tsconfig.build.json -->
- [x] C18: `revisar_presentacion` no informa colores escritos a mano en las líneas agregadas.
      <!-- verify: manual -->
- [x] C19: En el servidor de desarrollo, la pantalla `#/agentes` muestra la etiqueta del estado público en los entregados.
      <!-- verify: manual -->

## Puntos

```json
[]
```

## Implementación

- `packages/server/src/server.ts`: importa `estadoPublicoDelTicket` de `@valmen/engine` y crea `estadoPublicoOVacio(paths, id)` (devuelve `null` si el ticket no se puede leer); `GET /api/tickets` agrega `publicState` a cada fila y `GET /api/tickets/:id` al detalle. `summary` no cambia.
- `packages/server/web/index.html`: `etiquetaDeEstadoPublico(publicState)` (clases `corrida-estado`, `error`/`ok`, sin colores nuevos) y `estadoPublicoDeRegistro`; se pinta en la celda de estado de la lista, como chip «estado público» en la tira del ticket, y en la vista Agentes (entregados, cola y tabla de agentes). `ESTADOS_QUE_ESPERAN_AL_PO` desaparece: el KPI «esperan al PO» cuenta `publicState.state === "needs-decision"`. Tablero, escena animada y contador de la barra lateral no cambian (decisión del PO).
- En la cola la etiqueta va después de «espera a …» para no romper la prueba existente de `tests/vista-corrida.test.ts` («la cola se agrupa por ola…»), que compara ese texto contiguo y no está entre las tres que el plan cambia.
- Pruebas: `tests/estado-publico-web.test.ts` (nuevo, 13 casos, vistos en rojo antes de implementar) y, por EST-009 autorizado en el plan, los tres cambios declarados en `tests/vista-corrida.test.ts` (ayudante `registro` con `publicState`, registro simulado `TICKETS`, KPI «esperan al PO» de `"2"` a `"3"`). Ninguna otra prueba existente cambió.
- Rollback: revertir el commit de implementación.

## Pruebas

Directorio: la raíz del repositorio (o del worktree `ticket-estado-publico`).

- `npx vitest run tests/estado-publico-web.test.ts tests/tickets-view.test.ts tests/tablero-feature.test.ts tests/vista-corrida.test.ts tests/api-rutas.test.ts` — esperado: 5 archivos, 75 pruebas en verde (resultado de la sesión: 75 passed).
- `npx tsc --build tsconfig.build.json` y `npx tsc --noEmit -p .` — esperado: sin salida (sin errores de tipos); eslint y prettier sobre los archivos tocados sin hallazgos; `node scripts/exports-sin-uso.mjs` sin exportaciones nuevas sin consumidor.
- C18: `node packages/cli/dist/main.js estandar revisar` (equivale a `revisar_presentacion`) → «Colores fijos — nada que avisar (1 archivo(s) de interfaz revisado(s))».
- C19 y validación manual (verificadas en el navegador integrado contra `node packages/cli/dist/main.js serve --port 4173` desde el worktree, registro real de 228 tickets): `#/tickets` muestra «Listo» / «Trabajando» / «Necesita tu decisión» junto al estado del motor; `#/ticket/FEATURE-WEB-ESTADO-PUBLICO-20261010` muestra el chip «estado público Trabajando»; `#/agentes` muestra «Listo» en los entregados y «Trabajando» en la tabla de agentes; la lista en modo oscuro conserva el contraste.
- Capturas (fuera del repositorio): `/private/tmp/claude-501/-Users-juanandrade-Desktop-ValmenHarness/c2769fcf-63f8-4baf-a5d3-a4b9b7a976b8/scratchpad/capturas-web-estado/` — 1-lista-tickets-claro, 2-ticket-chip-claro, 3-agentes-entregados-claro, 4-agentes-tabla-claro, 5-lista-tickets-oscuro (PNG).
- Limitación: el registro real no tiene un ticket en `blocked` ni `planned`; esos casos (C02, C09, C14) se prueban con registros temporales y DOM simulado, no en el navegador. No se capturó la vista del ticket ni Agentes en modo oscuro.
- Ambiente: Node 24, `npm run build` previo para el servidor de desarrollo.

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
    "date": "2026-10-11",
    "session_reference": null,
    "model": null,
    "reasoning_effort": null,
    "notes": null,
    "input_tokens": null,
    "output_tokens": null,
    "total_tokens": null,
    "estimated_cost_usd": null,
    "source": "manual:sesion-implementacion-sonnet-5-5 sin numeros expuestos",
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
    "at": "2026-10-10T21:47:35.114Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-11",
    "at": "2026-10-11T20:44:28.040Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-11",
    "at": "2026-10-11T20:46:49.724Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-11",
    "at": "2026-10-11T20:50:48.744Z",
    "action": "gate-approved",
    "actor": "cli",
    "details": "Gate plan aprobado por PO (recibo GR-20261011-FEATURE-WEB-ESTADO-PUBLICO-20261010-plan-1, canal cli, decidida 2026-10-11T20:50:48.739Z): Aprobar y autorizar las 3 pruebas (Recomendado)"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-11",
    "at": "2026-10-11T20:50:49.174Z",
    "action": "plan-approved",
    "actor": "cli",
    "details": "{\"actor\":\"PO\",\"source\":\"cli\",\"quote\":\"Aprobar y autorizar las 3 pruebas (Recomendado)\",\"planHash\":\"sha256:474f294f0538cec7f85bd96454505a5e962032d60dcbbfa0c97ea0fee30c0479\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-11",
    "at": "2026-10-11T20:50:49.748Z",
    "action": "plan-approval-verified",
    "actor": "cli",
    "details": "Aprobación del plan vigente: PO (fuente cli), plan sha256:474f294f0538cec7f85bd96454505a5e962032d60dcbbfa0c97ea0fee30c0479."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-11",
    "at": "2026-10-11T20:50:49.748Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-10-11",
    "at": "2026-10-11T20:50:50.138Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-10-11",
    "at": "2026-10-11T20:57:24.238Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-10-11",
    "at": "2026-10-11T20:57:24.729Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-10-11",
    "at": "2026-10-11T20:57:44.046Z",
    "action": "delivery-size",
    "actor": "cli",
    "details": "{\"añadidas\":418,\"borradas\":13,\"total\":431,\"tope\":400,\"pasaElTope\":true,\"via\":\"worktree\"}"
  }
]
```
