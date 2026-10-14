---
schema_version: 2
id: FEATURE-WEB-TRABAJO-TICKETS-20261014
title: Tickets y detalle con filtro por turno y ciclo de ocho pasos
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
created: 2026-10-14
updated: 2026-10-14
related_ticket: null
target_release: null
released_in: null
---

# FEATURE-WEB-TRABAJO-TICKETS-20261014

## Solicitud original

Parte del sprint: Trabajo rediseñado: Tickets y detalle con el ciclo de ocho pasos, Features con su tablero y Portafolio por tarjetas.
- R-MARCO-006: Cada pantalla DEBERÍA funcionar en el celular
- R-TRA-001: Tickets DEBE filtrar por a quién le toca y mostrar el avance de cada ticket en ocho pasos
- R-TRA-002: El detalle de ticket DEBE mostrar el ciclo de ocho pasos y, si le toca a la persona, su tarea arriba de todo
Depende de: FEATURE-WEB-MENU-GRUPOS-20261014.
Viene de una feature descompuesta en sprints; su plan completo está en el tickets.yaml de la feature.

Comportamiento esperado: Cada pantalla DEBERÍA funcionar en el celular Tickets DEBE filtrar por a quién le toca y mostrar el avance de cada ticket en ocho pasos El detalle de ticket DEBE mostrar el ciclo de ocho pasos y, si le toca a la persona, su tarea arriba de todo
Comportamiento actual: la spec no lo declara; se establece en el análisis, leyendo el código.

### Fuera de alcance

Lo que el grafo asignó a otros tickets y este no hace:
- R-MARCO-006: lo cubre FEATURE-WEB-MENU-GRUPOS-20261014 (Menú por grupos con proyecto, perfil activo y Pedir un cambio)
- R-MARCO-006: lo cubre FEATURE-WEB-INICIO-DECISIONES-20261014 (Inicio con lo que espera una decisión de la persona)
- R-MARCO-006: lo cubre FEATURE-WEB-AJUSTES-MODELOS-20261014 (Vista Modelos con perfil activo, roles agrupados y aviso de cliente)
- R-MARCO-006: lo cubre FEATURE-WEB-AJUSTES-CAMBIAR-PERFIL-20261014 (Cambiar de perfil con vista previa de lo que cambia)
- R-MARCO-006: lo cubre FEATURE-WEB-AJUSTES-PROVEEDORES-20261014 (Proveedores con estado y uso por el perfil activo)
- R-MARCO-006: lo cubre FEATURE-WEB-AJUSTES-PROYECTO-20261014 (Proyecto con bloques e interruptores y YAML en Avanzado)
- R-MARCO-006: lo cubre FEATURE-WEB-TRABAJO-FEATURES-20261014 (Features con estado y tablero de recorrido y siguiente paso)
- R-MARCO-006: lo cubre FEATURE-WEB-TRABAJO-PORTAFOLIO-20261014 (Portafolio con una tarjeta por proyecto)
- R-MARCO-006: lo cubre FEATURE-WEB-VIVO-AGENTES-20261014 (Agentes con titular, pregunta pendiente y selector de mundo)
- R-MARCO-006: lo cubre FEATURE-WEB-VIVO-PROCESOS-20261014 (Procesos con las corridas detenidas primero)
- R-MARCO-006: lo cubre FEATURE-WEB-REGLAS-ESTANDARES-20261014 (Estándares separados en vigor, propuestos y descartados)

### Referencias de diseño

Adjuntos que citan los requisitos de este ticket. Se construye y se valida contra el original, no contra el texto de la spec:
- `.valmen/features/rediseno-mission-control/assets/tickets.html` — Boceto aprobado por el PO el 2026-10-14: Tickets (HTML autónomo, el original) (sha256 86fbeac6b5ed…)
- `.valmen/features/rediseno-mission-control/assets/tickets.png` — Captura a 1440 px del boceto aprobado: Tickets (sha256 84a1864660a0…)
- `.valmen/features/rediseno-mission-control/assets/ticket.html` — Boceto aprobado por el PO el 2026-10-14: Detalle de ticket (HTML autónomo, el original) (sha256 d7506314582b…)
- `.valmen/features/rediseno-mission-control/assets/ticket.png` — Captura a 1440 px del boceto aprobado: Detalle de ticket (sha256 48c72996e2e7…)

### Supuestos y decisiones pendientes

<!-- Si el pedido nombra algo que el código no tiene —parámetro, permiso,
campo, bandera, columna, migración— y no lo especifica, listá cada elemento
con su pregunta antes de avanzar a análisis; el análisis no planifica sobre
la adivinanza. Si no hay ninguno, escribí «Ninguno» y seguí. -->
Ninguno.

## Descripción funcional

- Alcance: las vistas `#/tickets` (`vistaTickets`) y `#/ticket/<ID>` (`vistaTicket`) de Mission Control (`packages/server/web/index.html`), su proyección en el servidor (`packages/server/src/server.ts`) y la parte de R-MARCO-006 que les toca: a 390 px ninguna de las dos desplaza la página a lo ancho (el pendiente C18 que dejó FEATURE-WEB-MENU-GRUPOS-20261014). Referencia visual: los bocetos `assets/tickets.html`/`.png` y `assets/ticket.html`/`.png` de la feature `rediseno-mission-control`, que mandan sobre el texto de la spec.
- Usuario o rol afectado: la persona (PO o responsable) que abre Mission Control para saber qué le toca, y el agente, cuyo turno se distingue del de la persona.
- Comportamiento actual: la lista abre con cinco tarjetas de cifras (Tickets, En curso, Cerrados, Con puntos abiertos, Impacto crítico), una barra de filtros (buscador, estado, tipo, rango de fechas con atajos, tres casillas y «Reporte de cierres») y una tabla de diez columnas (Ticket, Tipo, Impactos, Estado, QA, Release, Puntos, Actualizado, Cerrado, «Ver»); no dice a quién le toca cada ticket ni muestra su avance, y la fila no abre el detalle (solo el botón «Ver»). El detalle abre con la cabecera, la tira de nueve estados del motor, la banda de fases, el nombre del responsable y luego una pila de acordeones (Solicitud, Descripción, Diagnóstico, Plan, Criterios, Implementación, Pruebas, Compuertas, Avanzar el estado, Historial, Actividad del ejecutor, Línea de tiempo y coste, Consumo, Eventos, Puntos, QA, Evidencia, Retests, Cierre, Release); no hay ciclo de ocho pasos, ni bloque «Te toca», ni pestañas, y para registrar el resultado de las pruebas del responsable no existe acción en la web (solo el CLI).
- Comportamiento esperado: la lista tiene pestañas con su cuenta —Activos, Esperan por mí (ámbar), Con el agente, Cerrados—, el buscador por id, título o módulo y «Nuevo ticket»; cada fila muestra título, id, una barra de ocho pasos (hechos en cian, el actual en ámbar si es de la persona o en lila si es del agente, todos en verde si está cerrado), quién lo tiene ahora («Tú» o «Agente»), módulo y edad, y la fila entera abre el detalle. El detalle muestra, bajo el título y sus marcas (tipo, módulo, estado), los ocho pasos —Pedido, Análisis, Plan, Aprobación, Desarrollo, Tus pruebas, QA, Cierre— con quién decide cada uno y el actual resaltado; si el ticket espera a la persona, un bloque ámbar «Te toca» con la acción concreta (en `awaiting_user_tests`, el contrato de pruebas con cada comando copiable y «Pasaron las pruebas», «Algo falló», «Omitir con motivo», que piden actor y frase literal); debajo, las pestañas Resumen, Análisis, Plan, Compuertas, Decisiones del agente, Evidencia y Consumo de IA, que reparten lo que hoy muestra la pila de acordeones sin perder nada. A 390 px ninguna de las dos pantallas desplaza la página a lo ancho: la tabla se desplaza dentro de su caja.

## Diagnóstico

- Memoria consultada: `buscar_memoria` («vista tickets web filtro a quién le toca ciclo pasos detalle ticket desplazamiento horizontal celular») no devolvió nada de estas vistas; AP-001 y AP-013 (`.valmen/memory/aprendizajes.md:5`, `:107`) aplican al plan: un criterio por comportamiento, sin «y».
- Causa comprobada (con `ruta:línea`): no es un defecto, es la pantalla anterior al rediseño. (1) La lista no conoce el turno: `GET /api/tickets` (`packages/server/src/server.ts:477-528`) devuelve `summary: summarize(filas)` (`packages/engine/src/tickets.ts:261`) y cada fila con `publicState` (`server.ts:444`, `estadoPublicoDelTicket` en `packages/engine/src/public-state.ts:29`), pero ni un campo de turno ni de paso, ni cuentas por turno; la vista arma cifras y filtros sobre estado, tipo y fechas (`packages/server/web/index.html:3849-3883` el objeto `filtros`, `:3885` `vistaTickets`, `:3928` las tarjetas, `:4037` la barra, `:4214-4344` la tabla de diez columnas con el botón «Ver» en `:4331`). (2) El detalle no tiene ciclo de ocho pasos ni «Te toca»: `vistaTicket` (`index.html:5841`) pinta `tiraDeEstado` con los nueve estados del motor (`:5871`, definida en `:6687`), la banda de fases (`:5872`) y los acordeones en serie (`:5909` Compuertas, `:5972` Avanzar el estado, `:6214` Release). (3) No hay forma web de registrar el resultado de las pruebas del responsable: la única salida de `awaiting_user_tests` es `in_qa` (`packages/core/src/transitions.ts:62`), que exige la línea «Resultado del PO: …» u «Omisión explícita documentada del PO: …» en `## Pruebas` (`packages/core/src/validate.ts:325-345`, aplicada en `packages/engine/src/transition.ts:531`), y el único escritor de esa línea es la ceremonia del CLI (`packages/cli/src/ceremony.ts:261-270`). (4) A 390 px la tabla de Tickets mide 887 px y desplaza la página (hallazgo de FEATURE-WEB-MENU-GRUPOS-20261014, `tickets/2026/FEATURE-WEB-MENU-GRUPOS-20261014/ticket.md:204`): `table` no tiene caja con desplazamiento propio (`index.html:957`).
- Datos con que se construye cada pieza del boceto (todos existen hoy):
  - Turno («Tú» / «Agente») y «Esperan por mí»: `publicState.state === "needs-decision"` ya cubre `awaiting_user_tests`, `blocked`, `changes_requested`, plan sin autorización y compuerta escalada (`packages/core/src/public-state.ts:41-66`); se suman `in_qa` (la QA es de una persona sin autorización de QA por agente, AGENTS.md «Entrega y documentación») y `qa_approved` con decisiones por ratificar (`decisionesPorRatificar`, `packages/engine/src/agent-decisions.ts:117`, el mismo cálculo que usa Inicio en `packages/server/src/inicio.ts:79-91`) o con una compuerta en REVIEW sin decidir (`inicio.ts:97-109`).
  - Paso actual de 1 a 8: ya existe el mapa de Inicio `PASO_DE_INICIO` (`index.html:3627-3637`: intake 2, analyzed 3, planned 4, approved/in_progress/changes_requested 5, awaiting_user_tests 6, in_qa 7, qa_approved 8); `closed` es el ciclo completo; `blocked` toma el paso del estado del que salió, que está en el último evento «Workflow: X -> blocked.» (formato en `packages/engine/src/public-state.ts:57`).
  - Rótulo bajo la barra: el estado del motor, y la compuerta cuando su último recibo quedó en REVIEW sin decidir («planned · REVIEW»), o «ratificar antes de cerrar» (mismas fuentes).
  - Edad: `created` de la fila (`packages/engine/src/tickets.ts:40`).
  - Contrato de «Te toca» en `awaiting_user_tests`: la sección `## Pruebas` del ticket ya lo trae con forma estable (`- Directorio:`, `- Requisitos de ambiente:`, `- Comandos y resultado esperado:` con ítems numerados y el comando entre comillas invertidas, `- Validaciones manuales …:` con sus ítems; ejemplo real en `tickets/2026/FEATURE-WEB-AJUSTES-MODELOS-20261014/ticket.md`, sección Pruebas); sin esa forma, los comandos `<!-- test: … -->` y los criterios `<!-- verify: manual -->` de `## Criterios de aceptación`.
  - Quién decide cada paso: fijo por el proceso (Pedido persona, Análisis modelo, Plan modelo, Aprobación política —persona si el plan espera a una persona—, Desarrollo modelo, Tus pruebas persona, QA persona, Cierre código), como en el boceto.
  - Pestañas: Resumen (criterios con su anotación test/manual y su marca, compuertas con su último resultado, «Decidió el agente»), Análisis (Solicitud, Descripción, Diagnóstico), Plan (Plan, Implementación, Pruebas), Compuertas (`GET /api/tickets/:id/gates`, `server.ts:1340`, con su decisión y el avance de estado), Decisiones del agente (eventos `agent-decision` y aprobaciones por política, `agent-decisions.ts:117`), Evidencia (Puntos, QA, Evidencia, Retests, Cierre, Release, Eventos, Actividad del ejecutor), Consumo de IA (línea de tiempo y coste, consumo registrado).
- Lo que el boceto muestra y el dato no permite (se registra con `valmen agent-decision` y se lista en el plan como diferencia):
  - La marca «harness completo» del modo: el contrato del ticket no tiene campo de modo (`packages/core/src/contract.ts` no lo declara; búsqueda sin resultados de `work_mode`/`modo de trabajo` en `packages/*/src`).
  - «Ratificar desde Inicio →»: Inicio no ratifica, su tarjeta abre el ticket (`index.html:3641-3649`, `:3690`), y la web no tiene acción de ratificar; el bloque muestra el comando `valmen ratify --id <ID> --actor <tú> --quote "<tus palabras>"` copiable, el que pide el motor (`agent-decisions.ts:155`).
  - «Nuevo ticket» no puede crear el ticket desde la web: no hay ruta de alta en `server.ts` y «Pedir un cambio» (`index.html:3342`, `server.ts:1892`) solo propone cambios de configuración; el botón se conserva y abre un panel con el comando de alta del CLI copiable (`valmen create --id <ID> --title <t> --type <TIPO> --module <MODULO> --request <texto>`, la ayuda de `node packages/cli/dist/main.js --help`).
- Hipótesis pendientes: (H1) que el redondeo de la tabla a 390 px baste con una caja `overflow-x: auto` alrededor de la tabla y `min-width: 0` en el contenedor flexible, sin tocar el marco del menú (se comprueba a 390 px en el navegador). (H2) que ninguna prueba existente dependa del orden de nodos del detalle: las que lo leen (`tests/estado-publico-web.test.ts:238-280`, `tests/interfaz-ejecutable.test.ts:175-441`, `tests/qa-sin-cubrir-vista.test.ts`, `tests/linea-de-tiempo-interfaz.test.ts`, `tests/firma-de-bloqueo-pantalla.test.ts`, `scripts/verificar-interfaz.mjs:879`) buscan clases y textos en el árbol, así que los paneles de pestaña se pintan todos y solo se ocultan (`hidden`), y la etiqueta de estado público (`corrida-estado`) y el chip «estado público» se conservan; se confirma corriéndolas.
- Consumidores afectados: la persona en Mission Control (lista y detalle); los enlaces que abren `#/ticket/<ID>` desde Inicio, el aviso por Telegram, el tablero de feature y Agentes (no cambian de forma); `irAListaConEstado` (`index.html:6668`), que fija `filtros.workflow` y debe seguir filtrando; los clientes de `GET /api/tickets` y `GET /api/tickets/:id` (el CLI no los usa): solo se añaden campos (`turno`, cuentas por turno) y un parámetro opcional, nada se quita ni se renombra; el reporte de cierres (`descargarReporte`, `index.html:5304`) y los filtros avanzados se conservan.
- Archivos y flujo investigados: `packages/server/web/index.html` (vistas, `PASO_DE_INICIO`, `acordeon`, `tiraDeEstado`, `pintarBandaDeFases`, tokens del tema `:77-140` con `--persona`, `--modelo`, `--codigo`, `--hecho`), `packages/server/src/server.ts` (rutas de tickets y transición `:1410-1480`), `packages/server/src/inicio.ts`, `packages/engine/src/tickets.ts`, `packages/engine/src/public-state.ts`, `packages/engine/src/agent-decisions.ts`, `packages/engine/src/append.ts:155` (`addPoint`), `packages/core/src/transitions.ts`, `packages/core/src/validate.ts`, `packages/cli/src/ceremony.ts`, los bocetos y la spec `.valmen/features/rediseno-mission-control/spec/s3-trabajo/spec.md`, y las pruebas `tests/tickets-view.test.ts`, `tests/estado-publico-web.test.ts`, `tests/interfaz-ejecutable.test.ts`, `tests/menu-grupos.test.ts`.
- Riesgos y compatibilidad: (R1) Registrar el resultado de las pruebas desde la web es una acción de una persona: la nueva ruta exige actor y frase literal no vacíos, no decide por sí misma y deja el mismo texto que reconoce `hasRecordedUserTestOutcome`; «Algo falló» no aprueba nada. (R2) Otros dos agentes editan otras vistas del mismo `index.html` y otras rutas de `server.ts`: se toca solo `vistaTickets`, `vistaTicket` y sus funciones, con el CSS nuevo en un bloque propio, sin reformatear ni mover código ajeno; el riesgo de conflicto al integrar es del orquestador. (R3) La pestaña Activos sustituye el filtro por defecto «solo lo empezado» (`index.html:3853-3857`), decidido para no enterrar lo que está en curso; el orden «Esperan por mí» primero cumple el mismo fin, y «Solo lo empezado» sigue disponible en los filtros avanzados. (R4) Calcular el turno por fila lee recibos y el ticket por cada fila, como ya hace Inicio; con el registro actual (~80 tickets) no es medible, pero se nota en registros grandes. (R5) Las pruebas existentes que leen estas vistas pueden ponerse en rojo si cambian textos que fijan: si pasa, se detiene y se reporta (no se editan).
- Impactos de sync, migración, Docker o despliegue: ninguno. Es la interfaz web local de Mission Control y su API en el mismo proceso: no hay sincronización de datos, migraciones, contenedores ni despliegue; la escritura nueva va al `ticket.md` del registro local por el motor.

## Plan

- Gate de plan y aprobación: compuerta `plan` con el evaluador `cascade`; la aprobación sale de la política por defecto del PO (`valmen approve-by-authorization` si da APPROVE, `valmen review-agent --record` si da REVIEW) y la decide el orquestador o el PO, no el subagente que planifica.
- Alcance: `vistaTickets()` y `vistaTicket()` de `packages/server/web/index.html` y las funciones nuevas que solo ellas llaman, un bloque de estilos propio; en el servidor, el módulo nuevo `packages/server/src/turno.ts`, los campos añadidos a `GET /api/tickets` y `GET /api/tickets/:id` y la ruta nueva `POST /api/tickets/:id/pruebas-del-responsable` en `packages/server/src/server.ts`; en el motor, la función nueva `anotarResultadoDelResponsable` en `packages/engine/src/append.ts`; las pruebas nuevas `tests/turno-ticket.test.ts` y `tests/vista-tickets-turno.test.ts`. Exclusiones: el menú, Inicio y las demás vistas del mismo `index.html` (otros dos tickets lo editan a la vez: no se mueve ni se reformatea nada fuera de estas dos vistas y sus funciones), crear tickets o ratificar desde la web, los endpoints de QA, y cualquier cambio de la máquina de estados.
- Decisiones registradas: D-001 (turno de la persona: estado público `needs-decision`, `in_qa`, compuerta en REVIEW sin decidir y `qa_approved` con decisiones por ratificar), D-002 (Activos = todo lo no cerrado, lo de la persona primero; «Solo lo empezado» pasa a «Más filtros»), D-003 (acciones de pruebas por una ruta que exige actor y frase literal y pasa a `in_qa` por el motor), D-004 (lo que el dato no permite: sin marca de modo, `valmen ratify` y `valmen create` copiables) y D-005 (lo de hoy se conserva en «Más filtros» y en las pestañas).
- Tabla de turno (la implementa `calcularTurno` en `turno.ts`; paso 9 = ciclo completo): `intake` → paso 2, agente; `analyzed` → 3, agente; `planned` → 4, persona si el estado público es `needs-decision`, si no agente; `approved` e `in_progress` → 5, agente; `changes_requested` → 5, persona; `awaiting_user_tests` → 6, persona; `in_qa` → 7, persona; `qa_approved` → 8, persona si hay decisiones por ratificar, si no agente; `blocked` → el paso del estado del que salió (último evento «Workflow: X -> blocked.»), persona; `closed` → 9, nadie. En cualquier estado activo, una compuerta cuyo último recibo quedó en REVIEW sin decisión de persona ni del revisor, o escalada a una persona sin decisión, pone el turno en la persona. Rótulo bajo la barra: el estado del motor, con « · REVIEW» si hay compuerta pendiente; «ratificar antes de cerrar» en `qa_approved` con decisiones por ratificar.
- Respuesta al diagnóstico (cada hallazgo y el paso que lo resuelve):
  - La lista no conoce el turno (`server.ts:477-528`, `tickets.ts:261`): pasos 2 y 3 (C1, C2, C3).
  - La lista sin pestañas, barra de avance ni fila que abre el detalle (`index.html:3885-4344`): paso 5 (C3-C7).
  - El detalle sin ciclo de ocho pasos ni «Te toca» (`index.html:5841-5872`, `:6687`): paso 6 (C8, C9, C10).
  - Sin acción web para el resultado de las pruebas (`transitions.ts:62`, `validate.ts:325-345`, `ceremony.ts:261-270`): pasos 3 y 4 (C11-C15).
  - Los acordeones en serie (`index.html:5909`, `:5972`, `:6214`): paso 6, pestañas (C16).
  - La tabla de 887 px a 390 px (`index.html:957`, H1): paso 7 (C17, C18).
  - H2 (pruebas existentes que leen el árbol): paso 6 pinta todos los paneles y oculta los no elegidos con `hidden`, conserva la clase `corrida-estado` y el chip «estado público»; paso 9 las corre (C20).
  - Lo que el boceto muestra y el dato no permite: D-004, pasos 5 y 6.
- Pasos ordenados:
  1. Escribir `tests/turno-ticket.test.ts` y `tests/vista-tickets-turno.test.ts` y verlos en rojo con `npx vitest run tests/turno-ticket.test.ts tests/vista-tickets-turno.test.ts`, antes de tocar código. `turno-ticket` copia el laboratorio de `tests/fixtures/saicloud/tickets` (como `tests/tickets-view.test.ts`), escribe tickets con `writeFixtureTicket` en cada estado y llama a `handleApi`: tabla de casos estado → `turno` (C1), `?turno=persona` (C2), `summary.porTurno` (C3), y la ruta nueva con sus respuestas y lo que deja en el `ticket.md` (C13, C14, C15). `vista-tickets-turno` ejecuta `#/tickets` y `#/ticket/<ID>` con `ejecutarInterfaz` de `scripts/verificar-interfaz.mjs`, respuestas simuladas con la forma real de las rutas y registro de llamadas: pestañas y cuentas (C3), «Esperan por mí» (C4), barras (C5), clic en la fila (C6), «Más filtros» (C7), ciclo (C8), «Te toca» (C9, C10), guarda y envío (C11, C12), pestañas del detalle (C16) y la regla de la caja de la tabla leída del HTML (C17).
  2. `packages/server/src/turno.ts` (nuevo): `calcularTurno(entrada)` pura con la tabla de turno; `turnoDelTicket(paths, id)` que reúne estado, `estadoPublicoDelTicket` (`packages/engine/src/public-state.ts:29`), `decisionesPorRatificar` (`packages/engine/src/agent-decisions.ts:117`), el último recibo por compuerta (`currentReceipts`/`readReceipts`, el mismo criterio de `packages/server/src/inicio.ts:97-109`) y el último «Workflow: X -> blocked.»; `contarPorTurno(filas)` con `{ activos, persona, agente, cerrados }`; `contratoDePruebas(secciones)` que lee de `## Pruebas` las líneas `Directorio:`, `Requisitos de ambiente:`, los ítems numerados de «Comandos y resultado esperado» (comando entre comillas invertidas y lo que sigue a «→») y los ítems de «Validaciones manuales», y, si no hay comandos, los toma de las anotaciones `<!-- test: … -->` (sin repetir) y de los criterios `<!-- verify: manual -->` (C1, C3, C9).
  3. `packages/server/src/server.ts`: en `GET /api/tickets` cada fila suma `turno`, `summary` suma `porTurno` y el parámetro opcional `turno=activos|persona|agente|cerrados` filtra las filas antes de `filterTickets` (sin él, la respuesta es la de hoy más los campos nuevos); en `GET /api/tickets/:id` el detalle suma `turno`, `porRatificar` (los resúmenes) y `contratoDePruebas`; ruta nueva `POST /api/tickets/:id/pruebas-del-responsable` con `{ resultado: "pasaron" | "fallo" | "omitir", actor, frase }`: 400 si falta `actor` o `frase` o el resultado no es uno de los tres, 409 si el ticket no está en `awaiting_user_tests`, y si no llama a `anotarResultadoDelResponsable` y después a `transition(... to: "in_qa")`; si el motor rechaza el paso, 409 con su mensaje y la línea ya anotada queda como historial (C1, C2, C3, C13, C14, C15).
  4. `packages/engine/src/append.ts`: `anotarResultadoDelResponsable({ paths, ticketId, resultado, actor, frase, now })`, calcada de `anotarResultadoPorPolitica` (`append.ts:759`): solo agrega al final de `## Pruebas` una de tres líneas —«- Resultado del PO: pasaron — «<frase>» (<actor>, Mission Control, <fecha>)», «- Resultado del PO: falló — «<frase>» (…)», «- Omisión explícita documentada del PO: «<frase>» (…)»— y el evento `user-tests-result`; sale por `export * from "./append.js"` del índice del motor (C13).
  5. `index.html`, `vistaTickets()` reescrita con funciones nuevas `pestanasDeTurno`, `barraDeAvance`, `celdaDeTurno`, `edadDe` y `panelNuevoTicket`: rótulo «Trabajo · Tickets», título «Tickets», botón «Nuevo ticket» que abre el comando `valmen create` copiable (D-004); pestañas `role="tablist"` Activos, Esperan por mí (cuenta en ámbar), Con el agente, Cerrados con la cuenta de `summary.porTurno` (0 si falta) que fijan `filtros.turno` y piden `?turno=`; el buscador de hoy (`q`); `<details class="mas-filtros">` plegado con las tarjetas de cifras, estado, tipo, rango de fechas y atajos, «Solo lo empezado», «Solo abiertos», «Solo inválidos», un selector de orden con los campos de hoy y «Reporte de cierres», sin cambiar su comportamiento (D-005); la línea «Mostrando: …» de hoy; y la tabla Ticket, Avance, Ahora lo tiene, Módulo, Edad dentro de `<div class="tabla-caja">`. Fila: título como enlace a `#/ticket/<ID>` e id; marcas de impacto crítico o puntos abiertos solo si las hay; barra de ocho segmentos (`hecho` cian, `actual persona` ámbar, `actual agente` lila, `cerrado` verde) con `aria-label` «Paso N de 8» y el rótulo; «● Tú» en ámbar o «● Agente» en lila con la etiqueta del estado público (`etiquetaDeEstadoPublico`, se conserva `corrida-estado`); módulo; edad desde `created` («hoy», «N d»; en Cerrados, la fecha de cierre). La fila entera abre el detalle con clic o Intro (`tabindex="0"`). En Activos, lo de la persona va primero sin cambiar el orden de lo demás. `filtros.empezados` pasa a `false` por defecto y `filtros.turno` arranca en `activos` (D-002); `irAListaConEstado` pone `filtros.turno = "activos"` para que su filtro de estado siga funcionando (C3-C7).
  6. `index.html`, `vistaTicket()` reescrita con funciones nuevas `cicloDelTicket`, `bloqueTeToca`, `formularioDeResultado`, `pestanasDelTicket`, `panelResumen` y `listaDeDecisionesDelAgente`: ruta «Tickets › <ID>» con enlace a `#/tickets`; `h1` con el título; marcas de tipo (cian), módulo, estado (ámbar si el turno es de la persona) e «inválido» si aplica; `<ol aria-label="Ciclo del ticket">` con Pedido (persona), Análisis (modelo), Plan (modelo), Aprobación (política, o persona si el plan espera a una persona), Desarrollo (modelo), Tus pruebas (persona), QA (persona), Cierre (código), «N · ✓» en los hechos, «N · ahora» y `aria-current="step"` en el actual (ámbar si es de la persona, lila si es del agente); con el turno sin dato (`turno` ausente) se calcula del estado y del estado público con el mapa `PASO_DE_INICIO` (`index.html:3627`). «Te toca» solo si el turno es de la persona: en `awaiting_user_tests`, «Te toca: prueba la entrega», el directorio y el ambiente del contrato, cada comando numerado con «copiar» (portapapeles con `try/catch` y aviso «copiado»), cada validación manual con «manual» y los botones «Pasaron las pruebas», «Algo falló», «Omitir con motivo», cada uno abre un formulario con «Tu nombre» (prellenado con `responsable`) y «Tu frase literal», y solo «Confirmar» con los dos campos llenos manda la ruta del paso 3 y vuelve a pintar la vista; con compuerta pendiente o plan por aprobar, nombra la compuerta y lleva a la pestaña Compuertas; en `blocked`, `changes_requested`, `in_qa` y ratificación, la acción con su comando copiable (`valmen qa-start`/`qa-close`, `valmen ratify --id <ID> --actor <tú> --quote "<tus palabras>"`) o el enlace a «Avanzar el estado». Pestañas `role="tablist"`: Resumen (tarjeta de criterios con ✓ o ○ y la marca test/manual de su anotación; aparte «Compuertas» con el último resultado de cada una y «Ver recibos →», y «Decidió el agente» con las cuentas y el comando de ratificar; debajo, la tira de estado y la banda de fases de hoy), Análisis (Solicitud, Descripción, Diagnóstico), Plan (Plan, Criterios, Implementación, Pruebas), Compuertas N (responsable, compuertas, avanzar el estado, historial), Decisiones del agente N (eventos `agent-decision` y aprobaciones por política, por ratificar o ratificadas), Evidencia (Puntos, QA, Evidencia, Retests, Cierre, Release, Eventos, Actividad del ejecutor), Consumo de IA (línea de tiempo y coste con «Guardar el consumo», consumo registrado). Todos los paneles se pintan; los no elegidos llevan `hidden` (C8-C12, C16).
  7. `index.html`, estilos de las dos vistas con tokens (`--persona`, `--modelo`, `--codigo`, `--hecho`, `--alerta-suave`, `--panel`, `--borde`, `--tenue`, `--mono`, `--fuente-titulo`), sin colores a mano, en un bloque propio: pestañas, barra de avance, celda de turno, `.tabla-caja { overflow-x: auto; max-width: 100%; }`, ciclo en rejilla `repeat(auto-fit, minmax(118px, 1fr))`, «Te toca» con borde ámbar, comandos con desplazamiento propio, botones ok/no/neutro y el reparto Resumen en dos columnas que se apila por debajo de 768 px; el contenedor de la vista con `min-width: 0` (C17, C18).
  8. `npm run build` para que `packages/cli/dist/web/index.html` coincida con la fuente (C20).
  9. Regresión: `npx vitest run tests/turno-ticket.test.ts tests/vista-tickets-turno.test.ts tests/tickets-view.test.ts tests/estado-publico-web.test.ts tests/interfaz-ejecutable.test.ts tests/menu-grupos.test.ts tests/qa-sin-cubrir-vista.test.ts tests/linea-de-tiempo-interfaz.test.ts tests/firma-de-bloqueo-pantalla.test.ts tests/inicio-decisiones.test.ts tests/estaticos-web.test.ts tests/tema-tokens.test.ts` y `node scripts/verificar-interfaz.mjs`, más `npx tsc -p packages/server` y `npx tsc -p packages/engine`; si una prueba existente se pone en rojo no se edita: se detiene y se reporta en el ticket (C20).
  10. Verificación en el navegador con `node packages/cli/dist/main.js serve` desde el worktree, sobre un registro de prueba copiado (no el real) para los botones: `#/tickets` y `#/ticket/<ID>` a 1440 px en oscuro contra `tickets.png`/`tickets.html` y `ticket.png`/`ticket.html` y en claro, incluidos la edad, el módulo, el paso 6 resaltado, los tres botones de «Te toca» y el «Te toca» de compuerta (C19); a 390 px sin desplazamiento horizontal de la página en las dos vistas (C18); `revisar_presentacion` sin avisos; capturas como evidencia del ticket.
- Diferencias con el boceto (se repiten en «Implementación» con lo que quede): (1) sin la marca de modo «harness completo»: el contrato no tiene ese dato (D-004); (2) «Ratificar desde Inicio →» se cambia por el comando `valmen ratify` copiable: Inicio no ratifica (D-004); (3) «Nuevo ticket» abre el comando `valmen create` copiable en vez de un alta web (D-004); (4) el rótulo de avance usa los estados reales del motor (`intake`, no el «analyzing» del boceto); (5) la fila suma, solo si las hay, marcas de impacto crítico o puntos abiertos, y bajo «Tú/Agente» la etiqueta del estado público (D-005); (6) «Más filtros» plegado, que el boceto no dibuja, con los filtros de hoy (D-005); (7) Resumen suma, debajo de sus tarjetas, la tira de estado y la banda de fases de hoy (D-005); (8) el subtítulo de «Te toca» es el texto real del contrato de cada ticket.
- Impactos declarados: ninguno (sin sincronización, migración ni contenedores; `sync_impact`, `migration_impact` y `docker_impact` en `false`).
- Tamaño previsto: unas 1050 líneas (unas 650 de producción —unas 420 en `index.html` entre JavaScript y estilos, 150 en `turno.ts`, 50 en `server.ts`, 30 en `append.ts`— y unas 400 de pruebas); 20 criterios.
- Si excede el tope: sigue: la lista y el detalle leen la misma función de turno y el mismo contrato del servidor, el grafo de la feature asignó R-TRA-001 y R-TRA-002 a este ticket, y partirlo exige abrir otro ticket, que es decisión de una persona; si la persona lo prefiere, el corte limpio es lista (pasos 2, 3 y 5) y detalle (pasos 4 y 6).
- Rollback (obligatorio): revertir el commit del ticket en su rama; no hay esquema ni configuración que deshacer, los campos nuevos de la API son añadidos y nadie más los lee. Las líneas que la ruta nueva haya escrito en `## Pruebas` de un ticket real quedan como su historial (son resultados de una persona) y no se borran.

## Criterios de aceptación

- [x] C1 (R-TRA-001): cada fila de `GET /api/tickets` trae `turno` con quién lo tiene, su paso actual, su rótulo según la tabla de turno del plan
      <!-- test: npx vitest run tests/turno-ticket.test.ts -->
- [x] C2 (R-TRA-001): `GET /api/tickets?turno=persona` devuelve solo los tickets cuyo turno es de la persona
      <!-- test: npx vitest run tests/turno-ticket.test.ts -->
- [x] C3 (R-TRA-001): la lista pinta las pestañas «Activos», «Esperan por mí», «Con el agente», «Cerrados», cada una con la cuenta de `summary.porTurno`
      <!-- test: npx vitest run tests/vista-tickets-turno.test.ts -->
- [x] C4 (R-TRA-001): con un ticket en `awaiting_user_tests` junto a otro en `in_progress`, «Esperan por mí» muestra solo el primero, con «Tú» en ámbar
      <!-- test: npx vitest run tests/vista-tickets-turno.test.ts -->
- [x] C5 (R-TRA-001): la barra de ocho pasos de cada fila colorea sus segmentos según la regla del plan (hecho cian, actual ámbar de la persona, actual lila del agente, cerrado verde)
      <!-- test: npx vitest run tests/vista-tickets-turno.test.ts -->
- [x] C6 (R-TRA-001): pulsar una fila abre `#/ticket/<ID>`
      <!-- test: npx vitest run tests/vista-tickets-turno.test.ts -->
- [x] C7 (R-TRA-001): «Más filtros» conserva los filtros de hoy, el orden, el reporte de cierres
      <!-- test: npx vitest run tests/vista-tickets-turno.test.ts -->
- [x] C8 (R-TRA-002): el detalle pinta los ocho pasos de Pedido a Cierre, cada uno con quién lo decide
      <!-- test: npx vitest run tests/vista-tickets-turno.test.ts -->
- [x] C9 (R-TRA-002): con un ticket en `awaiting_user_tests` con tres comandos de prueba, «Te toca» lista los tres, cada uno con «copiar»
      <!-- test: npx vitest run tests/vista-tickets-turno.test.ts -->
- [x] C10 (R-TRA-002): con un ticket en `analyzed`, el detalle no pinta el bloque «Te toca»
      <!-- test: npx vitest run tests/vista-tickets-turno.test.ts -->
- [x] C11 (R-TRA-002): sin frase literal, «Confirmar» no manda ninguna petición
      <!-- test: npx vitest run tests/vista-tickets-turno.test.ts -->
- [x] C12 (R-TRA-002): «Pasaron las pruebas» confirmado manda `POST /api/tickets/<ID>/pruebas-del-responsable` con la frase literal que escribió la persona
      <!-- test: npx vitest run tests/vista-tickets-turno.test.ts -->
- [x] C13 (R-TRA-002): la ruta deja en `## Pruebas`, para cada resultado, la línea que `in_qa` reconoce como resultado de la persona
      <!-- test: npx vitest run tests/turno-ticket.test.ts -->
- [x] C14 (R-TRA-002): la ruta con `pasaron` deja el ticket en `in_qa`
      <!-- test: npx vitest run tests/turno-ticket.test.ts -->
- [x] C15 (R-TRA-002): la ruta rechaza con 400 una petición sin frase literal, sin escribir el ticket
      <!-- test: npx vitest run tests/turno-ticket.test.ts -->
- [x] C16 (R-TRA-002): el detalle tiene las pestañas Resumen, Análisis, Plan, Compuertas, Decisiones del agente, Evidencia, Consumo de IA
      <!-- test: npx vitest run tests/vista-tickets-turno.test.ts -->
- [x] C17 (R-MARCO-006): la tabla de Tickets va dentro de una caja con desplazamiento horizontal propio
      <!-- test: npx vitest run tests/vista-tickets-turno.test.ts -->
- [x] C18 (R-MARCO-006): a 390 px las dos vistas no desplazan la página a lo ancho, en los dos modos de color
      <!-- verify: manual -->
- [x] C19 (R-TRA-002): a 1440 px las dos vistas coinciden con `tickets.png`, `ticket.png` en estructura, jerarquía, colores por quién decide, textos fijos, salvo las diferencias listadas en el plan
      <!-- verify: manual -->
- [x] C20 (R-TRA-002): las pruebas existentes de las dos vistas siguen en verde sin editarse
      <!-- test: npx vitest run tests/tickets-view.test.ts tests/estado-publico-web.test.ts tests/interfaz-ejecutable.test.ts tests/menu-grupos.test.ts tests/qa-sin-cubrir-vista.test.ts tests/linea-de-tiempo-interfaz.test.ts tests/firma-de-bloqueo-pantalla.test.ts tests/inicio-decisiones.test.ts tests/estaticos-web.test.ts tests/tema-tokens.test.ts -->

## Puntos

```json
[]
```

## Implementación

- Estado: terminada y entregada (pasos 1-10). Primero se detuvo en el paso 9 por una prueba existente en rojo (abajo); se retomó tras la decisión del PO.
- **Enmienda del plan (decisión del PO, 2026-10-14):** `tests/api-rutas.test.ts` lleva una línea más en `RUTAS`, `"POST /api/tickets/:id/pruebas-del-responsable",`, y nada más de esa prueba cambia. Motivo: el comentario de la propia prueba exige declarar ahí cada ruta nueva («Una ruta nueva se agrega acá y en el servidor»); es un registro de rutas, no un cambio de comportamiento. Frase del PO (AskUserQuestion en el chat del orquestador): «Sí, añadir la línea (Recomendado)».
- Hecho (pasos 1-8 del plan): pruebas nuevas vistas en rojo antes de tocar código (`tests/turno-ticket.test.ts` 23 de 25 en rojo, `tests/vista-tickets-turno.test.ts` 15 de 15 en rojo); `packages/server/src/turno.ts` (nuevo: `calcularTurno`, `turnoDelTicket`, `contarPorTurno`, `enPestana`, `contratoDePruebas`); `packages/server/src/server.ts` (`turno` por fila, `summary.porTurno`, `?turno=`, `turno`/`porRatificar`/`contratoDePruebas` en el detalle, ruta `POST /api/tickets/:id/pruebas-del-responsable` con 400 sin actor o sin frase o con resultado inválido, 404 sin ticket, 409 fuera de `awaiting_user_tests`); `packages/engine/src/append.ts` (`anotarResultadoDelResponsable`, sobre el mismo `conTicket` que `anotarResultadoPorPolitica`; el paso a `in_qa` lo hace `transition` del motor, el mismo que usa el CLI); `packages/server/web/index.html` (`vistaTickets` y `vistaTicket` reescritas con sus funciones, bloque de estilos propio con tokens, `filtros.turno`/`empezados: false`, `irAListaConEstado`); `npm run build`.
- Nota sobre la guarda «la misma función del motor que usa el CLI»: el CLI no tiene una función del motor para el resultado del PO; lo escribe `cerrarConQaDelPo` con su propio `editarTicket` (`packages/cli/src/ceremony.ts:62`, `:261-270`). Por eso, como dice el plan, se añadió `anotarResultadoDelResponsable` al motor y se reutilizan `transition` y la validación de `in_qa` (`hasRecordedUserTestOutcome`).
- En verde: `npx vitest run tests/turno-ticket.test.ts tests/vista-tickets-turno.test.ts` → 40 de 40; los diez archivos de C20 → 197 de 197 sin editarlos (tres se pusieron en rojo durante el cambio por la estructura del código nuevo —la banda de fases tiene que ir directa en `#contenido` tras la tira de estado, ningún nodo `B` en el detalle, y los `Option` sin `children`— y se corrigieron en `index.html`, no en las pruebas); `node scripts/verificar-interfaz.mjs` → «Interfaz verificada.»; `npx tsc -p packages/server --noEmit` y `npx tsc -p packages/engine --noEmit` sin errores; los 70 archivos de `tests/` que leen la interfaz o la API, por lotes, en verde salvo el de abajo.
- **Prueba existente en rojo (no se editó):** `tests/api-rutas.test.ts`, «cada llamada de la interfaz corresponde a una ruta declarada, con su método» y «cada URL que la interfaz construye corresponde a una ruta declarada». Salida: `expected [ Array(1) ] to deeply equal []` con `+ "POST /api/tickets/:param/pruebas-del-responsable"` y `+ "/api/tickets/:param/pruebas-del-responsable"`. Hipótesis: la prueba es la lista declarada a mano de las rutas que el servidor atiende (`tests/api-rutas.test.ts:36-72`; su comentario dice «Una ruta nueva se agrega acá y en el servidor») y la ruta nueva del plan no está en ella; el arreglo sería añadir la línea `"POST /api/tickets/:id/pruebas-del-responsable",` a `RUTAS`, que el plan aprobado no declara. Decide una persona: autorizar ese cambio de una línea en la prueba (enmienda del plan) o quitar la ruta.
- Al retomar: `tests/api-rutas.test.ts` 6 de 6 con la línea autorizada; regresión completa en verde (EVIDENCE-001, EVIDENCE-002).
- Hallazgo en el navegador, corregido: una expresión regular con «<» seguido de «!--» literal dentro del `<script type="module">` hacía que el navegador no ejecutara el módulo (la página quedaba vacía; el arnés de Node no lo ve porque extrae el script con una expresión regular). Se escribe `\x3c!--`, con su comentario, en `tarjetaCriterios`.
- Otras correcciones de la verificación visual: la clase `politica` del paso «Aprobación» chocaba con `.politica` de la vista de autorizaciones (pasa a `q-politica`, y las demás a `q-persona`, `q-modelo`, `q-codigo`); la bajada larga de «Te toca» desbordaba a 390 px (`overflow-wrap: anywhere`); las validaciones manuales del contrato se muestran sin comillas invertidas.
- Navegador (paso 10): Chrome sin pantalla por CDP sobre un registro temporal con un ticket de prueba; 1440 px oscuro y claro, 390 px sin desplazamiento horizontal, y «Pasaron las pruebas» probado solo sobre el ticket temporal (EVIDENCE-003 a EVIDENCE-005). `revisar_presentacion`: sin avisos.
- Estilos compactados: el bloque propio pasó de 662 líneas (una propiedad por línea) a 130 (una regla por línea, como el bloque de Modelos), sin cambiar reglas.
- Tamaño real: ver `git diff --stat` del commit; tras compactar los estilos, `index.html` queda en unas 960 líneas añadidas y 490 quitadas, `turno.ts` 260, `server.ts` +96, `append.ts` +50, pruebas unas 650 y `tests/api-rutas.test.ts` +1; por encima de las 1050 previstas (el PO decidió no partir el ticket).
- Diferencias con el boceto (las del plan, sin cambios): sin la marca de modo «harness completo» (D-004); «Ratificar desde Inicio →» es el comando `valmen ratify` copiable (D-004); «Nuevo ticket» abre el comando `valmen create` copiable (D-004); el rótulo de avance usa los estados reales (`intake`, no «analyzing»); la fila suma marcas de impacto o puntos abiertos solo si los hay, y bajo «Tú/Agente» la etiqueta del estado público (D-005); «Más filtros» plegado con los filtros de hoy y un selector de orden (D-005); bajo las pestañas, con Resumen, la tira de estado y la banda de fases de hoy (D-005); el subtítulo de «Te toca» es el texto real del contrato del ticket; el icono de la lupa se dibuja con CSS.

## Pruebas

- Directorio: `/Users/juanandrade/Desktop/ValmenHarness/.claude/worktrees/ticket-trabajo-tickets` (o la raíz del repositorio tras integrar).
- Requisitos de ambiente: Node 24, `npm install` hecho; para lo manual, `npm run build` y `node packages/cli/dist/main.js --root <copia temporal del registro> serve --port 4891`, con Chrome. Para probar los botones de «Te toca», usar una copia de `tickets/` y `.valmen/` en un directorio temporal: «Confirmar» escribe en el ticket y lo pasa a `in_qa`.
- Comandos y resultado esperado:
  1. `npx vitest run tests/turno-ticket.test.ts tests/vista-tickets-turno.test.ts` → 40 de 40 en verde (C1-C17).
  2. `npx vitest run tests/tickets-view.test.ts tests/estado-publico-web.test.ts tests/interfaz-ejecutable.test.ts tests/menu-grupos.test.ts tests/qa-sin-cubrir-vista.test.ts tests/linea-de-tiempo-interfaz.test.ts tests/firma-de-bloqueo-pantalla.test.ts tests/inicio-decisiones.test.ts tests/estaticos-web.test.ts tests/tema-tokens.test.ts tests/api-rutas.test.ts` → 197 de 197 más los 6 de `api-rutas` en verde (C20).
  3. `node scripts/verificar-interfaz.mjs` → «vistas ejecutadas: 14» e «Interfaz verificada.» (exige `npm run build` antes).
- Validaciones manuales (en http://127.0.0.1:4891/#/tickets y en el detalle de un ticket en `awaiting_user_tests`):
  - A 1440 px, en oscuro y en claro, Tickets y el detalle se ven como `tickets.png` y `ticket.png` de `.valmen/features/rediseno-mission-control/assets/`, con las diferencias listadas en «Implementación» (C19; `evidencia/tickets-1440-*.png`, `evidencia/ticket-1440-*.png`).
  - A 390 px ninguna de las dos vistas desplaza la página a lo ancho; la tabla se desplaza dentro de su caja (C18; `evidencia/tickets-390-*.png`, `evidencia/ticket-390-*.png`).
  - «Esperan por mí» deja solo lo que espera a la persona; pulsar una fila abre su detalle; «Más filtros» conserva estado, tipo, fechas, orden y «Reporte de cierres».
  - En el ticket temporal, «Pasaron las pruebas» sin frase no envía nada; con nombre y frase lo deja en `in_qa` con la línea «Resultado del PO: pasaron — «…»» en su `## Pruebas` (`evidencia/ticket-tras-pasaron.png`).
- Resultado local: los comandos 1-3 pasaron (EVIDENCE-001, EVIDENCE-002); las validaciones manuales se hicieron con Chrome sin pantalla sobre un registro temporal (EVIDENCE-003 a EVIDENCE-005).

## QA

```json
[]
```

## Evidencia

```json
[
  {
    "id": "EVIDENCE-001",
    "date": "2026-10-14",
    "kind": "test",
    "description": "npx vitest run tests/turno-ticket.test.ts tests/vista-tickets-turno.test.ts → 40 de 40 en verde (C1-C17); vistos en rojo antes del código (23 de 25 y 15 de 15).",
    "reference": null,
    "point_id": null
  },
  {
    "id": "EVIDENCE-002",
    "date": "2026-10-14",
    "kind": "test",
    "description": "Regresión C20: npx vitest run de tickets-view, estado-publico-web, interfaz-ejecutable, menu-grupos, qa-sin-cubrir-vista, linea-de-tiempo-interfaz, firma-de-bloqueo-pantalla, inicio-decisiones, estaticos-web, tema-tokens, api-rutas (con la línea autorizada), reconexion-mc y vista-corrida → 221 de 221; los 70 archivos de tests/ que leen la interfaz o la API, por lotes, en verde; node scripts/verificar-interfaz.mjs → «Interfaz verificada.»; npx tsc -p packages/server y packages/engine sin errores.",
    "reference": null,
    "point_id": null
  },
  {
    "id": "EVIDENCE-003",
    "date": "2026-10-14",
    "kind": "manual",
    "description": "Chrome sin pantalla por CDP sobre un registro temporal (copia de tickets/ y .valmen/ en el scratchpad, con el ticket de prueba FEATURE-WEB-PRUEBA-NAVEGADOR-20261014): a 1440 px en oscuro y claro, Tickets y el detalle frente a tickets.png y ticket.png (evidencia/tickets-1440-dark.png, tickets-1440-light.png, ticket-1440-dark.png, ticket-1440-light.png), con las diferencias listadas en Implementación (C19).",
    "reference": null,
    "point_id": null
  },
  {
    "id": "EVIDENCE-004",
    "date": "2026-10-14",
    "kind": "manual",
    "description": "Chrome sin pantalla a 390 px (móvil) en oscuro y claro: innerWidth 390 = scrollWidth 390 en Tickets y en el detalle; la tabla se desplaza en su caja (evidencia/tickets-390-dark-largo.png, tickets-390-light.png, ticket-390-dark.png, ticket-390-light-largo.png) (C18).",
    "reference": null,
    "point_id": null
  },
  {
    "id": "EVIDENCE-005",
    "date": "2026-10-14",
    "kind": "manual",
    "description": "Acción «Pasaron las pruebas» en el navegador, solo sobre el ticket temporal: sin frase muestra «Escribe tu nombre y tu frase literal…» y no envía; con frase anota «Resultado del PO: pasaron — «…» (Prueba de navegador, Mission Control, 2026-10-14)» en su ## Pruebas y lo deja en in_qa; ningún ticket de tick/ real se tocó (evidencia/ticket-tras-pasaron.png). revisar_presentacion: sin colores fijos.",
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
    "date": "2026-10-14",
    "session_reference": null,
    "model": "claude-code/claude-opus-5-5",
    "reasoning_effort": null,
    "notes": "Subagente del orquestador en el worktree ticket-trabajo-tickets: análisis, plan e implementación de este ticket. Sin números: el subagente no ve la contabilidad de su sesión; el agregado está en la sesión del orquestador.",
    "input_tokens": null,
    "output_tokens": null,
    "total_tokens": null,
    "estimated_cost_usd": null,
    "source": "manual:subagente de Claude Code lanzado por el orquestador; la sesión no expone su agregado de tokens al subagente",
    "confidence": "medium",
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
    "date": "2026-10-14",
    "at": "2026-10-14T05:09:28.319Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-14",
    "at": "2026-10-14T05:09:56.094Z",
    "action": "design-references-updated",
    "actor": "cli",
    "details": "Referencias de diseño actualizadas: .valmen/features/rediseno-mission-control/assets/tickets.html, .valmen/features/rediseno-mission-control/assets/tickets.png, .valmen/features/rediseno-mission-control/assets/ticket.html, .valmen/features/rediseno-mission-control/assets/ticket.png."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-14",
    "at": "2026-10-14T07:46:11.444Z",
    "action": "agent-decision",
    "actor": "cli",
    "details": "{\"id\":\"D-001\",\"pregunta\":\"¿Qué tickets cuentan como «Esperan por mí» (turno de la persona)?\",\"eleccion\":\"estado público needs-decision, más in_qa, más qa_approved con decisiones por ratificar o compuerta en REVIEW sin decidir; el resto activo es del agente\",\"alternativas\":[\"solo estado público needs-decision\",\"solo los pendientes de Inicio\"],\"criterio\":\"reutiliza la proyección pública y el cálculo de Inicio; la QA es de una persona sin autorización de QA por agente\",\"fuente\":\"packages/core/src/public-state.ts:41-66; packages/server/src/inicio.ts:79-109; AGENTS.md Entrega y documentación\",\"reversion\":\"cambiar la función de turno del servidor; no escribe en el registro\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-14",
    "at": "2026-10-14T07:46:11.833Z",
    "action": "agent-decision",
    "actor": "cli",
    "details": "{\"id\":\"D-002\",\"pregunta\":\"¿Qué muestra la pestaña Activos por defecto, ahora que reemplaza «Solo lo empezado»?\",\"eleccion\":\"todos los no cerrados, con los que esperan a la persona primero; «Solo lo empezado» queda en filtros avanzados\",\"alternativas\":[\"mantener solo lo empezado como Activos\",\"Activos sin intake\"],\"criterio\":\"el boceto cuenta en Activos los tickets del agente en análisis, y ordenar primero lo de la persona evita enterrar lo urgente, que era el motivo del filtro anterior\",\"fuente\":\".valmen/features/rediseno-mission-control/assets/tickets.png; packages/server/web/index.html:3853-3857\",\"reversion\":\"volver a poner empezados por defecto en el objeto filtros\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-14",
    "at": "2026-10-14T07:46:12.207Z",
    "action": "agent-decision",
    "actor": "cli",
    "details": "{\"id\":\"D-003\",\"pregunta\":\"¿Cómo se ofrecen en la web «Pasaron las pruebas», «Algo falló» y «Omitir con motivo»?\",\"eleccion\":\"ruta POST nueva que exige actor y frase literal, escribe en ## Pruebas la línea que reconoce hasRecordedUserTestOutcome y pasa el ticket a in_qa por el motor; «Algo falló» registra el resultado de fallo y no aprueba nada\",\"alternativas\":[\"solo mostrar el comando del CLI\",\"un botón sin frase literal\"],\"criterio\":\"es la única salida legal de awaiting_user_tests y la acción sigue siendo de una persona con su frase, como las decisiones de compuerta\",\"fuente\":\"packages/core/src/transitions.ts:62; packages/core/src/validate.ts:325-345; packages/cli/src/ceremony.ts:261-270\",\"reversion\":\"quitar la ruta y los botones; las líneas ya escritas en Pruebas son historial\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-14",
    "at": "2026-10-14T07:46:12.592Z",
    "action": "agent-decision",
    "actor": "cli",
    "details": "{\"id\":\"D-004\",\"pregunta\":\"¿Qué se hace con lo que el boceto muestra y el dato no permite?\",\"eleccion\":\"se omite la marca de modo «harness completo»; «Ratificar desde Inicio» se cambia por el comando valmen ratify copiable; «Nuevo ticket» abre el comando valmen create copiable\",\"alternativas\":[\"inventar el modo como constante\",\"crear tickets o ratificar desde la web\"],\"criterio\":\"el contrato no tiene campo de modo, Inicio no ratifica y la web no da de alta tickets; abrir esas acciones sería otro alcance\",\"fuente\":\"packages/core/src/contract.ts; packages/server/web/index.html:3641-3649; packages/engine/src/agent-decisions.ts:155\",\"reversion\":\"añadir la pieza cuando exista el dato o la acción\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-14",
    "at": "2026-10-14T07:46:21.205Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-10-14",
    "at": "2026-10-14T07:49:40.604Z",
    "action": "agent-decision",
    "actor": "cli",
    "details": "{\"id\":\"D-005\",\"pregunta\":\"¿Cómo se conserva lo que hoy muestran las dos vistas y el boceto no dibuja?\",\"eleccion\":\"la lista guarda los filtros, cifras, orden y reporte de hoy en «Más filtros» plegado, y la fila suma la etiqueta del estado público y marcas de impacto crítico o puntos abiertos solo si las hay; el detalle reparte los acordeones de hoy en las siete pestañas y Resumen conserva la tira de estado y la banda de fases\",\"alternativas\":[\"quitar lo que el boceto no dibuja\",\"dejarlo fuera de pestañas debajo de todo\"],\"criterio\":\"la spec pide reemplazar el aspecto sin perder lo que hoy muestran, y las pruebas existentes leen esas piezas\",\"fuente\":\".valmen/features/rediseno-mission-control/spec/s3-trabajo/spec.md:3-6; tests/estado-publico-web.test.ts:238-280\",\"reversion\":\"quitar «Más filtros» o las piezas añadidas a Resumen; no hay datos que deshacer\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-10-14",
    "at": "2026-10-14T07:51:05.980Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-10-14",
    "at": "2026-10-14T07:54:59.994Z",
    "action": "plan-approved",
    "actor": "cli",
    "details": "{\"actor\":\"autorización POLITICA-POR-DEFECTO\",\"source\":\"autorizacion\",\"quote\":\"si es necesario que un agente verifique y tome la decision de los analisis, review o planes para que yo no los tenga que tomar en cada punto esta bien y ya al final si hay decisiones tomadas por el agente antes de poder cerrar el ticket yo los apruebo\",\"planHash\":\"sha256:d180f78d7eeeb9c83c1feb59715a64cbd094cbde4d051ba3a12d84bac3e4b704\",\"authorizationId\":\"POLITICA-POR-DEFECTO\",\"authorizationHash\":\"sha256:c1bb46dd45f48a215d91a242f445eab06b4ac6f78aa546bf15d8b85902a01a0a\",\"stage\":\"plan\",\"receiptId\":\"GR-20261014-FEATURE-WEB-TRABAJO-TICKETS-20261014-plan-1\",\"receiptStateHash\":\"sha256:72dce959e2d42ebc536e2deaf2c6af4489de1ffff158b61689452e66b6d011f3\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-10-14",
    "at": "2026-10-14T07:55:00.423Z",
    "action": "plan-approval-verified",
    "actor": "cli",
    "details": "Aprobación del plan vigente: autorización POLITICA-POR-DEFECTO (fuente autorizacion, hash sha256:c1bb46dd45f48a215d91a242f445eab06b4ac6f78aa546bf15d8b85902a01a0a), plan sha256:d180f78d7eeeb9c83c1feb59715a64cbd094cbde4d051ba3a12d84bac3e4b704."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-10-14",
    "at": "2026-10-14T07:55:00.423Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-10-14",
    "at": "2026-10-14T07:55:22.876Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-014",
    "date": "2026-10-14",
    "at": "2026-10-14T13:40:54.271Z",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-015",
    "date": "2026-10-14",
    "at": "2026-10-14T13:40:54.619Z",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-002."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-016",
    "date": "2026-10-14",
    "at": "2026-10-14T13:40:54.990Z",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-003."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-017",
    "date": "2026-10-14",
    "at": "2026-10-14T13:40:55.355Z",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-004."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-018",
    "date": "2026-10-14",
    "at": "2026-10-14T13:40:55.692Z",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-005."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-019",
    "date": "2026-10-14",
    "at": "2026-10-14T13:42:28.065Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-020",
    "date": "2026-10-14",
    "at": "2026-10-14T13:42:32.307Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  }
]
```
