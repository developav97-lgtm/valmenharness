---
schema_version: 2
id: FEATURE-WEB-INICIO-DECISIONES-20261014
title: Inicio con lo que espera una decisión de la persona
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

# FEATURE-WEB-INICIO-DECISIONES-20261014

## Solicitud original

Parte del sprint: Marco común entregable: tema sala de control con fuentes locales, menú por grupos con proyecto y perfil activo, acción Pedir un cambio e Inicio como pantalla de apertura.
- R-MARCO-005: Mission Control DEBE abrir en Inicio con lo que espera una decisión de la persona
- R-MARCO-006: Cada pantalla DEBERÍA funcionar en el celular
Depende de: FEATURE-WEB-MENU-GRUPOS-20261014.
Viene de una feature descompuesta en sprints; su plan completo está en el tickets.yaml de la feature.

Comportamiento esperado: Mission Control DEBE abrir en Inicio con lo que espera una decisión de la persona Cada pantalla DEBERÍA funcionar en el celular
Comportamiento actual: la spec no lo declara; se establece en el análisis, leyendo el código.

### Fuera de alcance

Lo que el grafo asignó a otros tickets y este no hace:
- R-MARCO-006: lo cubre FEATURE-WEB-MENU-GRUPOS-20261014 (Menú por grupos con proyecto, perfil activo y Pedir un cambio)
- R-MARCO-006: lo cubre FEATURE-WEB-AJUSTES-MODELOS-20261014 (Vista Modelos con perfil activo, roles agrupados y aviso de cliente)
- R-MARCO-006: lo cubre FEATURE-WEB-AJUSTES-CAMBIAR-PERFIL-20261014 (Cambiar de perfil con vista previa de lo que cambia)
- R-MARCO-006: lo cubre FEATURE-WEB-AJUSTES-PROVEEDORES-20261014 (Proveedores con estado y uso por el perfil activo)
- R-MARCO-006: lo cubre FEATURE-WEB-AJUSTES-PROYECTO-20261014 (Proyecto con bloques e interruptores y YAML en Avanzado)
- R-MARCO-006: lo cubre FEATURE-WEB-TRABAJO-TICKETS-20261014 (Tickets y detalle con filtro por turno y ciclo de ocho pasos)
- R-MARCO-006: lo cubre FEATURE-WEB-TRABAJO-FEATURES-20261014 (Features con estado y tablero de recorrido y siguiente paso)
- R-MARCO-006: lo cubre FEATURE-WEB-TRABAJO-PORTAFOLIO-20261014 (Portafolio con una tarjeta por proyecto)
- R-MARCO-006: lo cubre FEATURE-WEB-VIVO-AGENTES-20261014 (Agentes con titular, pregunta pendiente y selector de mundo)
- R-MARCO-006: lo cubre FEATURE-WEB-VIVO-PROCESOS-20261014 (Procesos con las corridas detenidas primero)
- R-MARCO-006: lo cubre FEATURE-WEB-REGLAS-ESTANDARES-20261014 (Estándares separados en vigor, propuestos y descartados)

### Referencias de diseño

Adjuntos que citan los requisitos de este ticket. Se construye y se valida contra el original, no contra el texto de la spec:
- `.valmen/features/rediseno-mission-control/assets/inicio.html` — Boceto aprobado por el PO el 2026-10-14: Inicio (HTML autónomo, el original) (sha256 d3d757a58383…)
- `.valmen/features/rediseno-mission-control/assets/inicio.png` — Captura a 1440 px del boceto aprobado: Inicio (sha256 6c7749d2fadd…)

### Supuestos y decisiones pendientes

<!-- Si el pedido nombra algo que el código no tiene —parámetro, permiso,
campo, bandera, columna, migración— y no lo especifica, listá cada elemento
con su pregunta antes de avanzar a análisis; el análisis no planifica sobre
la adivinanza. Si no hay ninguno, escribí «Ninguno» y seguí. -->
Ninguno.

## Descripción funcional

- Alcance: la vista Inicio de Mission Control (`#/inicio`, ruta por defecto) según el boceto `.valmen/features/rediseno-mission-control/assets/inicio.html` (captura `inicio.png`): título con la cuenta de lo que espera a la persona; cuatro cifras (esperan tu decisión, agentes trabajando, tickets en intake, cerrados del año); la lista «Espera tu decisión» con una tarjeta por cosa pendiente —decisiones del agente por ratificar, tickets en `awaiting_user_tests` y compuertas en REVIEW sin decidir—, cada una con chip, id del ticket y botón principal ámbar; al lado «Ahora mismo» (agentes vivos con fase y modelo) y «Hecho hoy»; la cuenta del menú en «Inicio» igual a la del título; y la parte de R-MARCO-006 de esta vista (a menos de 768 px las columnas se apilan sin desplazamiento horizontal). Fuera de alcance: el buscador y la leyenda de la cabecera del boceto (no los pide R-MARCO-005), ratificar, omitir la QA o aprobar desde Inicio (ver D-002), y el resto de pantallas (otros tickets de la feature).
- Usuario o rol afectado: la persona (PO) que abre Mission Control para saber qué está parado por ella.
- Comportamiento actual: Mission Control abre en Tickets; `#/inicio` no tiene vista y cae en Tickets; la cuenta del menú en «Inicio» nunca se llena.
- Comportamiento esperado: Mission Control abre en Inicio; si hay decisiones pendientes el título dice cuántas cosas esperan, cada una es una tarjeta con su id y su botón ámbar, y el menú muestra la misma cuenta; sin pendientes dice que no hay nada parado por la persona y muestra solo «Ahora mismo» y «Hecho hoy».

## Diagnóstico

- Causa comprobada (con `ruta:línea`): no existe la vista. El enrutador cae en Tickets cuando el hash está vacío (`packages/server/web/index.html:9674`, `|| "tickets"`) y para cualquier nombre desconocido, `inicio` incluido (`packages/server/web/index.html:9722`, `else await vistaTickets()`); no hay `vistaInicio`. La entrada del menú y su cuenta ya existen (`packages/server/web/index.html:2804`, `#cuenta-inicio`, la dejó FEATURE-WEB-MENU-GRUPOS-20261014), pero `marcarPendientes` (`packages/server/web/index.html:9529`) solo pone las cuentas de Estándares, Tickets y Agentes, y su ruta por defecto también es `tickets` (`packages/server/web/index.html:9531`, igual en `elCambioTocaLaVista`, `:9664`). Además el servidor no entrega dos de los tres tipos de pendientes: `GET /api/tickets` (`packages/server/src/server.ts:476`) devuelve filas `TicketRow` (`packages/engine/src/tickets.ts:31`) sin decisiones por ratificar ni recibos; lo pendiente de ratificar solo lo calcula el motor con `decisionesPorRatificar` (`packages/engine/src/agent-decisions.ts:117`) y los recibos vigentes con `currentReceipts` (`packages/engine/src/receipts.ts:72`), que el servidor solo usa ticket a ticket (`GET /api/tickets/:id/gates`). Medido sobre el registro del worktree (script de solo lectura con `listTickets`, `decisionesPorRatificar` y `currentReceipts`): 2 tickets en `awaiting_user_tests` (FEATURE-WEB-MENU-GRUPOS-20261014, FEATURE-WEB-TEMA-TOKENS-20261014), los mismos 2 con decisiones por ratificar (5 y 3), 0 REVIEW sin decidir, 12 en intake y 228 cerrados en 2026.
- Hipótesis pendientes: ninguna que bloquee. Lo que el código no decide quedó registrado como decisiones del agente: D-001 (endpoint de lectura `GET /api/inicio`), D-002 (las tarjetas abren el ticket en vez de actuar), D-003 (qué REVIEW espera a la persona), D-004 («Ahora mismo» sin minutos y «Hecho hoy» con cerrados y registrados hoy), D-005 (ruta por defecto y `#/configurar`).
- Consumidores afectados: la interfaz (`packages/server/web/index.html`: enrutador `navegar`, `marcarTitulo`, `marcarPendientes`, `elCambioTocaLaVista`); el servidor (`packages/server/src/server.ts`, ruta nueva de solo lectura); el arnés `scripts/verificar-interfaz.mjs` (lista `VISTAS`, `:770`, y sus respuestas falsas) y el contrato de rutas `tests/api-rutas.test.ts` (lista `RUTAS`, que pide declarar ahí cada ruta nueva). Nada del motor cambia: se reutilizan `listTickets`, `findTicket`, `decisionesPorRatificar`, `readReceipts` y `currentReceipts`. Los agentes vivos salen de `GET /api/corrida/agentes` (`packages/server/src/server.ts:1085`) con los ayudantes que ya usa la vista Agentes (`agentesVivos`, `:6679`; `fraseDeFase`, `:6716`).
- Archivos y flujo investigados: `packages/server/web/index.html` (menú `:2785-2836`, enrutado `:9640-9730`, cuentas `:9522-9580`, ayudantes de agentes `:6679-6720`, tokens `:77-140`, corte de 768 px `:501`); `packages/server/src/server.ts` (`:476`, `:1085`, despacho por proyecto `:2418`); `packages/server/src/gates.ts` (`listGateDecisions`, `projectReceipt`); `packages/server/src/agentes.ts:77` (`AgenteDeCorrida`: trae `ticket`, `modelo`, `ticketEstado`, `faseConfirmada`/`faseInferida`, sin hora de inicio); `packages/engine/src/agent-decisions.ts`; `packages/engine/src/receipts.ts`; `packages/engine/src/reviewer.ts:394` (`reviewerDecision`); `packages/engine/src/next-step.ts:195-245` (un REVIEW derivable lo decide el revisor); `tests/menu-grupos.test.ts`, `tests/api-rutas.test.ts`, `scripts/verificar-interfaz.mjs`. Memoria: `buscar_memoria` sin antecedentes de la vista Inicio (AP-012 y AP-004 hablan de REVIEW de compuertas, no de esta pantalla).
- Riesgos y compatibilidad: (1) cambiar la ruta por defecto de Tickets a Inicio cambia lo que ve quien abre `/` sin hash; los enlaces guardados a `#/tickets` y demás no cambian. (2) `GET /api/inicio` lee todos los tickets abiertos y sus recibos en cada carga: el costo es el de `GET /api/tickets` más un archivo de recibos por ticket abierto; se limita a tickets no cerrados. (3) Otros dos agentes editan `packages/server/web/index.html` a la vez: el cambio se limita a la función nueva `vistaInicio`, sus estilos con prefijo `inicio-`, una rama del enrutador, la ruta por defecto y una cuenta en `marcarPendientes`, sin mover ni reformatear código ajeno. (4) Ruta solo de lectura: no escribe en el registro ni cambia contratos existentes; la vista conjunta (sin proyecto) recibe el registro del servidor como las demás rutas.
- Impactos de sync, migración, Docker o despliegue: ninguno — solo interfaz local y una ruta GET de solo lectura en el servidor local de Mission Control.

## Plan

- Gate de plan y aprobación: compuerta `plan` con el evaluador `cascade`; la aprobación sale de la política por defecto del PO (`valmen approve-by-authorization` si da APPROVE, `valmen review-agent --record` si da REVIEW) y la decide el orquestador o el PO, no el subagente que planifica.
- Alcance: la vista Inicio en `packages/server/web/index.html` (función nueva `vistaInicio`, estilos `.inicio-*` solo con tokens, rama `inicio` de `navegar()`, ruta por defecto `inicio` y cuenta `#cuenta-inicio` en `marcarPendientes()`); un módulo nuevo de solo lectura `packages/server/src/inicio.ts` con `leerInicio(paths, ahora)` y su ruta `GET /api/inicio` en `packages/server/src/server.ts`; el arnés `scripts/verificar-interfaz.mjs`; la prueba nueva `tests/inicio-decisiones.test.ts`; y la línea `"GET /api/inicio"` en `RUTAS` de `tests/api-rutas.test.ts`, que esa prueba pide para cada ruta nueva (su encabezado: «Una ruta nueva se agrega acá y en el servidor»): es el único cambio a una prueba existente y se declara aquí a propósito. Exclusiones: el motor (`packages/engine`) no cambia; el buscador y la leyenda de la cabecera del boceto; ratificar, omitir la QA o aprobar desde Inicio (D-002); el comportamiento de `#/configurar` (D-005); el resto de pantallas de la feature.
- Decisiones registradas: D-001 (ruta `GET /api/inicio` de solo lectura que reutiliza el motor), D-002 (el botón ámbar abre el ticket), D-003 (REVIEW que espera = recibo vigente en review sin decisión humana ni del revisor), D-004 («Ahora mismo» sin minutos; «Hecho hoy» con cerrados y registrados hoy), D-005 (ruta por defecto `inicio`; `#/configurar` sin cambios).
- Respuesta al diagnóstico (cada hallazgo y el paso que lo resuelve):
  - Sin vista y ruta por defecto en Tickets (`index.html:9674`, `:9722`, `:9531`, `:9664`): paso 5; lo comprueba el paso 1 (C8).
  - `#cuenta-inicio` nunca se llena (`index.html:9529`): paso 5; lo comprueba el paso 1 (C13).
  - El servidor no entrega ratificaciones, REVIEW ni hechos del día (`server.ts:476`, `tickets.ts:31`): pasos 2 y 3; lo comprueba el paso 1 (C1-C7).
  - Consumidores (`RUTAS` de `tests/api-rutas.test.ts`, `VISTAS` del arnés, `tests/menu-grupos.test.ts`): pasos 3, 4 y 6 (C20).
- Pasos ordenados:
  1. Escribir `tests/inicio-decisiones.test.ts` y verlo en rojo con `npx vitest run tests/inicio-decisiones.test.ts`, antes de tocar código. Parte servidor, sobre un registro temporal (`mkdtempSync`) con tickets escritos con `createTicket` y su `workflow_status` fijado en el front matter del fixture, decisiones anexadas con `registrarDecisionDelAgente` y recibos con `appendReceipt`, llamando a `leerInicio(paths, ahora)` con una fecha fija: un ticket en `awaiting_user_tests` sale como pendiente `pruebas` (C1); uno con dos decisiones sin ratificar sale como `ratificar` con `cuantas: 2` (C2); un recibo vigente `review` sin `humanDecision` ni `reviewerDecision` sale como `review` con su compuerta y el mismo recibo con `reviewerDecision` no sale (C3); `cifras.intake` cuenta los tickets en `intake` (C4); `cifras.cerradosAnio` cuenta los `closedOn` del año de `ahora` (C5); `hechoHoy` trae el ticket con `closedOn` igual al día de `ahora` (C6) y el ticket con `created` igual a ese día (C7). Parte interfaz, con `ejecutarInterfaz` y respuestas simuladas de `GET /api/inicio` y `GET /api/corrida/agentes`: con `hash: ""` el título `#titulo-vista` dice «Inicio» y se pide `/api/inicio` (C8); con tres pendientes el `h1` dice «3 cosas esperan tu decisión» (C9); cada tarjeta `.inicio-tarjeta` contiene el id de su ticket (C10); su botón principal lleva la clase `persona` (C11) y su `href` es `#/ticket/<id>` (C12); `#cuenta-inicio` dice «3» (C13); con cero pendientes la vista dice «No hay nada parado por ti» y no pinta «Espera tu decisión» (C14); «Ahora mismo» pinta el id del ticket y el modelo de cada agente vivo de `agentesVivos()` (C15); la fila `.inicio-cifras` pinta esperan, agentes trabajando, tickets en intake y cerrados del año (C16). Lectura del HTML como texto: el bloque `@media (max-width: 767px)` pone `.inicio-columnas` en una sola columna (C17).
  2. `packages/server/src/inicio.ts` (nuevo): `leerInicio(paths, ahora = new Date())` recorre `listTickets(paths)` sin los `closed`; para cada uno, `decisionesPorRatificar(parseTicket(findTicket(...).text))` → pendiente `ratificar` con `cuantas` y sus resúmenes; `workflowStatus === "awaiting_user_tests"` → pendiente `pruebas`; `currentReceipts(readReceipts(paths, id))`, el más nuevo por compuerta, con `outcome === "review"` sin `humanDecision` ni `reviewerDecision` → pendiente `review` con `gate`, `receiptId` y las proposiciones `inBand` (D-003); devuelve `{ pendientes, cifras: { intake, cerradosAnio, anio }, hechoHoy }` con `hechoHoy` = cerrados hoy (`closedOn`) y registrados hoy (`created`) (D-004), fechas en la zona local del servidor (C1-C7).
  3. `packages/server/src/server.ts`: rama `GET /api/inicio` junto a `GET /api/tickets` que devuelve `leerInicio(paths)`; `tests/api-rutas.test.ts`: agregar `"GET /api/inicio"` a `RUTAS`, como pide su encabezado (C1, C20).
  4. `scripts/verificar-interfaz.mjs`: respuesta simulada para `/api/inicio` (un pendiente de cada tipo, cifras y un hecho) y `["inicio", "#/inicio"]` en `VISTAS`, para que `tests/interfaz-ejecutable.test.ts` pinte la vista (C20).
  5. `packages/server/web/index.html`: estilos `.inicio-*` con `var(--persona)`, `var(--modelo)`, `var(--codigo)`, `var(--hecho)`, `var(--panel)`, `var(--borde)`, `var(--fuente-titulo)` y `var(--mono)`, sin colores a mano, con las columnas en `flex-wrap` y el bloque `@media (max-width: 767px)` que las apila (C11, C17); `async function vistaInicio()` que pide `GET /api/inicio` y, con proyecto elegido, `GET /api/corrida/agentes`, y pinta encabezado (fecha y proyecto), `h1` con la cuenta o «No hay nada parado por ti», la fila de cuatro cifras, la sección «Espera tu decisión» con una tarjeta por pendiente (chip «Ratificar», «Tus pruebas» o «Compuerta en REVIEW», id, título, detalle y enlace `button`-ámbar «Revisar y ratificar», «Abrir contrato de pruebas» o «Revisar la compuerta» a `#/ticket/<id>`, D-002) solo si hay pendientes, «Ahora mismo» con `agentesVivos()` y `fraseDeFase()` y una barra de 8 pasos según `ticketEstado`, y «Hecho hoy»; llama a `ponerCuenta("inicio", n)` con el mismo número del título (C9-C16); en `navegar()` la rama `nombre === "inicio"` y el valor por defecto `"inicio"` en `navegar`, `marcarPendientes` y `elCambioTocaLaVista`, sin tocar la rama `configurar` (D-005, C8); en `marcarPendientes()`, `GET /api/inicio` → `poner("inicio", pendientes.length)` (C13).
  6. Regresión: `npx vitest run tests/menu-grupos.test.ts tests/interfaz-ejecutable.test.ts tests/api-rutas.test.ts tests/estaticos-web.test.ts tests/vista-marco-responsivo.test.ts tests/tema-tokens.test.ts`; si una prueba existente (salvo la línea declarada de `RUTAS`) se pone en rojo, se detiene y se reporta en el ticket sin editarla (C20).
  7. Verificación en el navegador con `npm run build` y `node packages/cli/dist/main.js serve` desde el worktree: sin hash abre Inicio; a 1440 px en modo oscuro contra `.valmen/features/rediseno-mission-control/assets/inicio.png` y el HTML del boceto (C19); a 390 px sin desplazamiento horizontal de la página (C18); `revisar_presentacion` sin avisos de colores a mano; capturas como evidencia del ticket.
- Impactos declarados: ninguno (sin sincronización, migración ni contenedores; `sync_impact`, `migration_impact` y `docker_impact` en `false`).
- Tamaño previsto: unas 700 líneas (unas 420 de producción —unas 270 de `index.html`, 120 de `packages/server/src/inicio.ts`, 10 de `server.ts`, 20 de `scripts/verificar-interfaz.mjs`— y unas 280 de pruebas); 20 criterios.
- Si excede el tope: sigue: pasa de `delivery-budget: 600` con 20 criterios en el tope, pero el corte natural (ruta del servidor / vista) deja una ruta sin consumidor o una vista sin datos, ninguna con valor propio para la persona; el tope avisa y no bloquea (R-ENT-002).
- Rollback (obligatorio): revertir el commit del ticket en su rama; no hay datos, esquema, configuración ni contrato existente que deshacer. La ruta nueva es de solo lectura y la ruta por defecto vuelve a Tickets con el mismo revert.

<!-- Los criterios de la sección siguiente se numeran C1…Cn, con una afirmación verificable por criterio
     —una frase con «y» son dos criterios—, y cada uno lleva debajo su anotación de
     verificación: un comentario HTML que dice «test:» y el comando, o «verify: manual». La
     sección no lleva comentarios dentro: un comentario con anotación se leería como la de un
     criterio. Ejemplo en la skill planificacion. -->
## Criterios de aceptación

- [x] C1 (R-MARCO-005): `GET /api/inicio` lista cada ticket en `awaiting_user_tests` como pendiente «pruebas»
      <!-- test: npx vitest run tests/inicio-decisiones.test.ts -->
- [x] C2 (R-MARCO-005): `GET /api/inicio` lista cada ticket abierto con decisiones del agente sin ratificar como pendiente «ratificar» con cuántas son
      <!-- test: npx vitest run tests/inicio-decisiones.test.ts -->
- [x] C3 (R-MARCO-005): `GET /api/inicio` lista como pendiente «review» solo la compuerta en REVIEW que nadie decidió todavía
      <!-- test: npx vitest run tests/inicio-decisiones.test.ts -->
- [x] C4 (R-MARCO-005): `GET /api/inicio` cuenta los tickets en intake
      <!-- test: npx vitest run tests/inicio-decisiones.test.ts -->
- [x] C5 (R-MARCO-005): `GET /api/inicio` cuenta los tickets cerrados en el año en curso
      <!-- test: npx vitest run tests/inicio-decisiones.test.ts -->
- [x] C6 (R-MARCO-005): «Hecho hoy» trae los tickets cerrados hoy
      <!-- test: npx vitest run tests/inicio-decisiones.test.ts -->
- [x] C7 (R-MARCO-005): «Hecho hoy» trae los tickets registrados hoy
      <!-- test: npx vitest run tests/inicio-decisiones.test.ts -->
- [x] C8 (R-MARCO-005): sin ruta en la dirección, Mission Control abre la vista Inicio
      <!-- test: npx vitest run tests/inicio-decisiones.test.ts -->
- [x] C9 (R-MARCO-005): con pendientes, el título de Inicio dice cuántas cosas esperan la decisión de la persona
      <!-- test: npx vitest run tests/inicio-decisiones.test.ts -->
- [x] C10 (R-MARCO-005): cada pendiente es una tarjeta con el id de su ticket
      <!-- test: npx vitest run tests/inicio-decisiones.test.ts -->
- [x] C11 (R-MARCO-005): el botón principal de cada tarjeta es ámbar
      <!-- test: npx vitest run tests/inicio-decisiones.test.ts -->
- [x] C12 (R-MARCO-005): el botón principal de cada tarjeta abre su ticket
      <!-- test: npx vitest run tests/inicio-decisiones.test.ts -->
- [x] C13 (R-MARCO-005): la cuenta del menú en Inicio es la misma del título
      <!-- test: npx vitest run tests/inicio-decisiones.test.ts -->
- [x] C14 (R-MARCO-005): sin pendientes, Inicio dice que no hay nada parado por la persona
      <!-- test: npx vitest run tests/inicio-decisiones.test.ts -->
- [x] C15 (R-MARCO-005): «Ahora mismo» muestra cada agente vivo con su modelo
      <!-- test: npx vitest run tests/inicio-decisiones.test.ts -->
- [x] C16 (R-MARCO-005): la fila de cifras de Inicio muestra las cuatro cifras del boceto
      <!-- test: npx vitest run tests/inicio-decisiones.test.ts -->
- [x] C17 (R-MARCO-006): por debajo de 768 px las columnas de Inicio se apilan en una sola
      <!-- test: npx vitest run tests/inicio-decisiones.test.ts -->
- [x] C18 (R-MARCO-006): a 390 px Inicio no tiene desplazamiento horizontal de la página
      <!-- verify: manual -->
- [x] C19 (R-MARCO-005): a 1440 px en modo oscuro Inicio se ve como `inicio.png`
      <!-- verify: manual -->
- [x] C20 (R-MARCO-005): las pruebas existentes de la interfaz siguen en verde
      <!-- test: npx vitest run tests/menu-grupos.test.ts tests/interfaz-ejecutable.test.ts tests/api-rutas.test.ts tests/estaticos-web.test.ts tests/vista-marco-responsivo.test.ts tests/tema-tokens.test.ts -->

## Puntos

```json
[]
```

## Implementación

- Prueba primero: `tests/inicio-decisiones.test.ts` se escribió antes del código y se vio en rojo con `npx vitest run tests/inicio-decisiones.test.ts` (17 de 17 fallando: primero sin el módulo y después con un esqueleto vacío de `leerInicio`, por ausencia del comportamiento —`expected [] to deeply equal [ 'pruebas' ]`, `expected 'Tickets' to be 'Inicio'`, etc.—); después de implementar, 17 de 17 en verde.
- `packages/server/src/inicio.ts` (nuevo): `leerInicio(paths, ahora)` con `pendientes` (ratificar, pruebas, review en ese orden), `cifras` (`esperan`, `intake`, `cerradosAnio`, `anio`) y `hechoHoy` (cerrados y registrados hoy, fecha local). Reutiliza `listTickets`, `findTicket`, `decisionesPorRatificar`, `readReceipts` y `currentReceipts`; el motor no cambia (D-001, D-003, D-004).
- `packages/server/src/server.ts`: ruta `GET /api/inicio`, de solo lectura, junto a `GET /api/tickets`.
- `packages/server/web/index.html`: estilos `.inicio-*` solo con tokens y su bloque `@media (max-width: 767px)` (antes de `.principal`); `vistaInicio()` y sus ayudantes `PASO_DE_INICIO`, `textosDeTarjetaDeInicio`, `tarjetaDeInicio`, `agenteDeInicio` (sección «Vista: inicio», antes de «Vista: tickets»); rama `inicio` en `navegar()`; ruta por defecto `inicio` en `navegar`, `marcarPendientes` y `elCambioTocaLaVista`; cuenta `#cuenta-inicio` en `marcarPendientes()` con `GET /api/inicio`. `#/configurar` sin cambios (D-005). No se movió ni reformateó código ajeno.
- `scripts/verificar-interfaz.mjs`: respuesta simulada de `/api/inicio` y `["inicio", "#/inicio"]` en `VISTAS`.
- `tests/api-rutas.test.ts`: solo la línea `"GET /api/inicio"` en `RUTAS`, declarada en el plan.
- Diferencias con el boceto `inicio.html` (para el PO): (1) D-002: el botón ámbar de cada tarjeta abre el ticket (`#/ticket/<id>`); Inicio no ratifica, no aprueba el plan ni omite la QA desde la tarjeta, y no tiene los botones secundarios «Devolver lo desmarcado», «Omitir con motivo», «Pedir cambios» ni «Ver recibo», ni la lista desplegable de decisiones con casillas. (2) D-004: «Ahora mismo» muestra fase y modelo sin los minutos, porque el servidor no da la hora de inicio de un agente; en la vista conjunta (sin proyecto elegido) no hay agentes que leer y dice «Ningún agente trabajando ahora». (3) D-004: «Hecho hoy» lista los tickets cerrados y registrados hoy (los cinco primeros y «y N más hoy»), no eventos como «Autonomía por defecto en vigor». (4) Sin el buscador ni la leyenda de la cabecera del boceto (fuera de alcance). (5) Un ticket que espera dos cosas (por ejemplo pruebas y ratificación) aparece en dos tarjetas, y la cuenta las suma.
- Tamaño real: unas 1 020 líneas (unas 655 de producción —494 de `index.html`, la mayor parte CSS de una propiedad por línea, 136 de `inicio.ts`, 9 de `server.ts`, 14 del arnés— y 367 de pruebas), por encima de las 700 previstas y del `delivery-budget: 600`; sigue por el motivo del plan (el tope avisa y no bloquea, R-ENT-002).

## Pruebas

Contrato de pruebas para el responsable.

- Directorio: `/Users/juanandrade/Desktop/ValmenHarness/.claude/worktrees/ticket-inicio-decisiones` (o el checkout principal tras integrar).
- Requisitos de ambiente: Node 24 y dependencias instaladas (`npm install`); `npm run build` antes de servir, porque el servidor sirve `packages/cli/dist/web/`.
- Comandos y resultado esperado:
  1. `npx vitest run tests/inicio-decisiones.test.ts` → 1 archivo, 17 pruebas en verde (C1-C17).
  2. `npx vitest run tests/menu-grupos.test.ts tests/interfaz-ejecutable.test.ts tests/api-rutas.test.ts tests/estaticos-web.test.ts tests/vista-marco-responsivo.test.ts tests/tema-tokens.test.ts` → 6 archivos, 127 pruebas en verde (C20).
  3. `node scripts/verificar-interfaz.mjs` → «vistas ejecutadas: 13» e «Interfaz verificada.».
  4. Ejecutado además por el agente: los 42 archivos de `tests/` que tocan la interfaz o el servidor (`grep -l "verificar-interfaz\|server/web/index.html\|handleApi\|packages/server/src/server" tests/*.ts`) → 42 archivos, 871 pruebas en verde.
- Validaciones manuales (`npm run build` y `node packages/cli/dist/main.js serve --port 4863`, abrir `http://127.0.0.1:4863/` sin ruta):
  1. Abre en Inicio y el menú marca «Inicio» con la misma cuenta del título. Con el registro de hoy: «5 cosas esperan tu decisión» (3 por ratificar —incluido este ticket— y 2 en `awaiting_user_tests`), 11 en intake y 228 cerrados en 2026.
  2. Cada tarjeta muestra su id y un botón ámbar; al pulsarlo abre `#/ticket/<id>` (comprobado con «Revisar y ratificar» → `#/ticket/FEATURE-WEB-INICIO-DECISIONES-20261014`).
  3. A 1440 px en modo oscuro y en claro se compara con `.valmen/features/rediseno-mission-control/assets/inicio.png` (C19). Capturas con Chrome sin pantalla: `tickets/2026/FEATURE-WEB-INICIO-DECISIONES-20261014/evidencia/inicio-1440-oscuro.png` (sha256 2a5df9910d6b…) y `evidencia/inicio-1440-claro.png` (sha256 07bed5c639fb…).
  4. A 390 px (vista móvil del navegador) la página no tiene desplazamiento horizontal: `document.documentElement.scrollWidth` = 390 = `clientWidth`, ningún elemento de `#contenido` pasa del borde, las columnas se apilan y las cifras van de dos en dos (C18). Chrome sin pantalla no baja de unos 500 px de ancho y recorta su captura a 390, así que esa captura no sirve como evidencia de este criterio.
  5. Con un proyecto elegido en el selector, «Ahora mismo» lista los agentes vivos con su barra de 8 pasos, fase y modelo.
- Revisión de presentación: `revisar_presentacion` → «Colores fijos — nada que avisar».

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
    "date": "2026-10-14",
    "session_reference": null,
    "model": "anthropic/claude-opus-5-5",
    "reasoning_effort": null,
    "notes": "Subagente de la corrida orquestada (worktree ticket-inicio-decisiones): análisis, plan e implementación de este único ticket en una sola sesión. Sin números: la sesión no expone tokens ni costo. Las compuertas pagadas quedan en los recibos (analysis $0.000217, plan $0.000790, qa-mechanical $0).",
    "input_tokens": null,
    "output_tokens": null,
    "total_tokens": null,
    "estimated_cost_usd": null,
    "source": "manual:la sesión del subagente de Claude Code no expone su agregado de tokens",
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
    "at": "2026-10-14T05:09:27.378Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-14",
    "at": "2026-10-14T05:09:55.170Z",
    "action": "design-references-updated",
    "actor": "cli",
    "details": "Referencias de diseño actualizadas: .valmen/features/rediseno-mission-control/assets/inicio.html, .valmen/features/rediseno-mission-control/assets/inicio.png."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-14",
    "at": "2026-10-14T06:24:23.162Z",
    "action": "agent-decision",
    "actor": "cli",
    "details": "{\"id\":\"D-001\",\"pregunta\":\"¿De dónde salen las decisiones por ratificar, las compuertas en REVIEW, lo hecho hoy y los cerrados del año, que el servidor no entrega hoy?\",\"eleccion\":\"Una ruta nueva de solo lectura GET /api/inicio en packages/server/src/inicio.ts que reutiliza listTickets, decisionesPorRatificar, readReceipts y currentReceipts del motor\",\"alternativas\":[\"Calcularlo en el navegador con una llamada a /api/tickets/:id y otra a /gates por ticket y duplicar la regla de ratificación\",\"Mostrar solo awaiting_user_tests, que ya entrega /api/tickets\"],\"criterio\":\"El código manda sobre el modelo y la regla vive en el motor: duplicarla en el navegador la haría divergir, y mostrar solo una parte no cumple R-MARCO-005. Es aditiva, sin escritura y reversible\",\"fuente\":\"packages/engine/src/agent-decisions.ts:117; packages/server/src/server.ts:476; .valmen/features/rediseno-mission-control/spec/s1-marco/spec.md (R-MARCO-005)\",\"reversion\":\"Quitar la ruta y packages/server/src/inicio.ts; la vista vuelve a leer solo /api/tickets\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-14",
    "at": "2026-10-14T06:24:23.521Z",
    "action": "agent-decision",
    "actor": "cli",
    "details": "{\"id\":\"D-002\",\"pregunta\":\"¿Qué hace el botón ámbar de cada tarjeta de Inicio?\",\"eleccion\":\"Abre el ticket (#/ticket/<id>), donde ya viven el contrato de pruebas y la decisión de compuertas; Inicio no ratifica, no omite la QA ni aprueba\",\"alternativas\":[\"Replicar los botones del boceto (Ratificar las N, Omitir con motivo, Aprobar el plan) con llamadas POST desde Inicio\"],\"criterio\":\"Opción conservadora: ratificar exige sesión atendida y la frase literal de la persona, y eximir la QA es una acción que nunca se automatiza; no hay ruta de ratificación en el servidor\",\"fuente\":\"packages/engine/src/agent-decisions.ts:172 (assertSesionAtendida); AGENTS.md «Acciones que nunca se automatizan»\",\"reversion\":\"Cambiar el enlace por el botón de acción cuando exista la ruta, sin tocar la estructura de la tarjeta\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-14",
    "at": "2026-10-14T06:24:23.870Z",
    "action": "agent-decision",
    "actor": "cli",
    "details": "{\"id\":\"D-003\",\"pregunta\":\"¿Qué compuerta en REVIEW cuenta como esperando a la persona?\",\"eleccion\":\"El recibo vigente más nuevo de cada compuerta de un ticket no cerrado con outcome review, sin decisión humana ni decisión del revisor\",\"alternativas\":[\"Todo recibo review del historial\",\"Incluir también los block\"],\"criterio\":\"Con la política por defecto un REVIEW derivable lo decide el revisor; uno ya decidido no espera a nadie. R-MARCO-005 nombra REVIEW, no block\",\"fuente\":\"packages/engine/src/next-step.ts:226; packages/engine/src/reviewer.ts:394; packages/engine/src/receipts.ts:72\",\"reversion\":\"Ajustar el filtro en packages/server/src/inicio.ts\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-14",
    "at": "2026-10-14T06:24:24.208Z",
    "action": "agent-decision",
    "actor": "cli",
    "details": "{\"id\":\"D-004\",\"pregunta\":\"¿Qué muestran «Ahora mismo» y «Hecho hoy» si el servidor no da la hora de inicio de un agente ni un diario de hechos?\",\"eleccion\":\"Ahora mismo: agentes vivos de /api/corrida/agentes con id, barra de 8 pasos según el estado del ticket, fase y modelo, sin minutos. Hecho hoy: tickets cerrados hoy (closedOn) y registrados hoy (created)\",\"alternativas\":[\"Inventar la duración desde la última herramienta\",\"Leer eventos de todos los tickets para armar un diario\"],\"criterio\":\"AgenteDeCorrida no trae inicio; un número sin fuente es inventado. Cerrados y registrados hoy salen de campos reales de TicketRow\",\"fuente\":\"packages/server/src/agentes.ts:77; packages/engine/src/tickets.ts:31\",\"reversion\":\"Agregar los minutos o más hechos cuando el servidor los entregue\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-14",
    "at": "2026-10-14T06:24:24.581Z",
    "action": "agent-decision",
    "actor": "cli",
    "details": "{\"id\":\"D-005\",\"pregunta\":\"¿Qué pasa con la ruta por defecto y con #/configurar al abrir en Inicio?\",\"eleccion\":\"La ruta vacía pasa a inicio en navegar, marcarPendientes y elCambioTocaLaVista; #/configurar sigue abriendo el panel sobre Tickets como hoy\",\"alternativas\":[\"Abrir el panel de #/configurar sobre Inicio\"],\"criterio\":\"R-MARCO-005 pide abrir en Inicio; el comportamiento de #/configurar lo describe R-MARCO-004 y lo prueba tests/menu-grupos.test.ts: no se cambia en este ticket\",\"fuente\":\"packages/server/web/index.html:9674; packages/server/web/index.html:9712\",\"reversion\":\"Volver a «tickets» en los tres valores por defecto\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-10-14",
    "at": "2026-10-14T06:24:37.981Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-10-14",
    "at": "2026-10-14T06:28:56.600Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-10-14",
    "at": "2026-10-14T06:31:22.198Z",
    "action": "plan-approved",
    "actor": "cli",
    "details": "{\"actor\":\"autorización POLITICA-POR-DEFECTO\",\"source\":\"autorizacion\",\"quote\":\"si es necesario que un agente verifique y tome la decision de los analisis, review o planes para que yo no los tenga que tomar en cada punto esta bien y ya al final si hay decisiones tomadas por el agente antes de poder cerrar el ticket yo los apruebo\",\"planHash\":\"sha256:3618d039f58e18fcd40dea466672500dc5bfb47331a70284aeb46ce69d9e492a\",\"authorizationId\":\"POLITICA-POR-DEFECTO\",\"authorizationHash\":\"sha256:c1bb46dd45f48a215d91a242f445eab06b4ac6f78aa546bf15d8b85902a01a0a\",\"stage\":\"plan\",\"receiptId\":\"GR-20261014-FEATURE-WEB-INICIO-DECISIONES-20261014-plan-1\",\"receiptStateHash\":\"sha256:7cc2eb771b74fd51ac62a2c13e5696d8988eade3d795f8645928333ad5935638\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-10-14",
    "at": "2026-10-14T06:31:22.603Z",
    "action": "plan-approval-verified",
    "actor": "cli",
    "details": "Aprobación del plan vigente: autorización POLITICA-POR-DEFECTO (fuente autorizacion, hash sha256:c1bb46dd45f48a215d91a242f445eab06b4ac6f78aa546bf15d8b85902a01a0a), plan sha256:3618d039f58e18fcd40dea466672500dc5bfb47331a70284aeb46ce69d9e492a."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-10-14",
    "at": "2026-10-14T06:31:22.603Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-10-14",
    "at": "2026-10-14T06:31:30.851Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-014",
    "date": "2026-10-14",
    "at": "2026-10-14T06:45:35.395Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-015",
    "date": "2026-10-14",
    "at": "2026-10-14T06:45:40.311Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-016",
    "date": "2026-10-14",
    "at": "2026-10-14T06:46:15.217Z",
    "action": "delivery-size",
    "actor": "cli",
    "details": "{\"añadidas\":1020,\"borradas\":4,\"total\":1024,\"tope\":600,\"pasaElTope\":true,\"via\":\"worktree\"}"
  }
]
```
