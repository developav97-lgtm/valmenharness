---
schema_version: 2
id: FEATURE-MC-VISTA-CORRIDA-20261008
title: Mostrar en Mission Control la corrida con sus agentes vivos, la cola y lo entregado
type: FEATURE
module: MC
workflow_status: closed
qa_status: approved
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

# FEATURE-MC-VISTA-CORRIDA-20261008

## Solicitud original

Contexto: el PO paró la jornada por launchd (6 tickets en 9 h, un solo carril, 5 despachos fallidos, ~8 rescates a mano) y la reemplaza por una corrida orquestada en sesión: la sesión de Claude Code que el PO abre es el orquestador, y reparte los tickets en subagentes, cada uno en su worktree y rama, con 3 simultáneos por defecto (el PO lo cambia al pedir la corrida). Propuesta aprobada y comparativa con datos: docs/propuesta-corrida-orquestada.md y https://claude.ai/artifact/RvWQx8zH1LZ7e9H6dw6dEN. Decisiones del PO: 3 a la vez por defecto y cambiable con --concurrency N o al pedirlo; worktree por ticket; aprobación según la política por tipo de ticket (automática si hay autorización vigente y el ticket es elegible, en lote para el PO si no; SECURITY y despliegue nunca se aprueban solos); la visibilidad de los agentes se lee de los transcripts de los subagentes, sin instalar pixel-agents. Este ticket: la vista Corrida de Mission Control, que reemplaza la vista Jornadas (hoy todas las filas dicen dependencies/unknown). Muestra los KPI de la corrida (entregados, cerrados por política, esperan al PO, trabajando, en cola, aprobaciones pendientes), una fila por agente vivo con ticket, fase, herramienta actual, modelo y tiempo, la cola por ola con a qué espera cada ticket, lo entregado con su estado, y el selector de simultáneos (3 por defecto). Consume GET /api/corrida/agentes (ticket FEATURE-SERVER-ACTIVIDAD-AGENTES-20261008) y el estado de la jornada; sigue la guía visual de las vistas existentes y se verifica en el navegador en claro y oscuro.

### Supuestos y decisiones pendientes

<!-- Si el pedido nombra algo que el código no tiene —parámetro, permiso,
campo, bandera, columna, migración— y no lo especifica, listá cada elemento
con su pregunta antes de avanzar a análisis; el análisis no planifica sobre
la adivinanza. Si no hay ninguno, escribí «Ninguno» y seguí. -->
- Selector de simultáneos: el código no tiene ninguna noción de simultáneos fuera del argumento de línea de comandos de otro ticket (FEATURE-ENGINE-JORNADA-OLA-20261008). Pregunta para el PO: ¿el selector de esta vista solo muestra y recuerda tu preferencia en el navegador (lo que planifica este ticket), o debe escribir un valor que el orquestador lea? Lo segundo exige un ticket de motor aparte; este plan no lo asume.
- Cerrados por política: la fila de `/api/tickets` (`TicketRow`, `packages/engine/src/tickets.ts:31`) no dice quién cerró el ticket. Pregunta para el PO: ¿basta el rótulo «cerrados» (estados `qa_approved` y `closed`) hasta que otro ticket exponga el origen del cierre? El plan usa «cerrados» y no afirma «por política».
- Botón «Pausar al cerrar la ola» del mockup: no existe ninguna señal de pausa en el motor. Queda fuera de alcance; pregunta para el PO: ¿se abre un ticket de motor para ello?

## Descripción funcional

- Alcance: la vista Corrida de Mission Control reemplaza a la vista Jornadas en la interfaz que sirve `valmen serve` (`packages/server/web/index.html`). Muestra seis KPI de la corrida, una fila por agente vivo (ticket, fase, herramienta actual, modelo, tiempo), la cola por ola con a qué espera cada ticket, lo entregado con su estado y un selector de simultáneos con 3 por defecto. Solo lee: no despacha, no pausa, no aprueba y no escribe en el registro. Fuera de alcance: el endpoint `GET /api/corrida/agentes` (dependencia, ticket FEATURE-SERVER-ACTIVIDAD-AGENTES-20261008), la aprobación en lote (sección 3.2 de la propuesta), el parte de pruebas (3.3) y cualquier botón que cambie el comportamiento del orquestador.
- Usuario o rol afectado: el PO que sigue una corrida orquestada desde Mission Control, hoy sin forma de ver qué hace cada subagente.
- Comportamiento actual: la vista Jornadas (`vistaJornadas`, `packages/server/web/index.html:5748`) pinta una tabla por jornada con las columnas Orden, Ticket, Inicio, Fase, Actividad, Duración, Espera / dependencia, Ventana y Último dato; cuando el trabajo lo hace una sesión y no el despacho de la jornada, todas las filas dicen «dependencies» y «unknown», y no hay ninguna fila por agente.
- Comportamiento esperado: en `#/corrida` el PO ve de arriba abajo la barra de la corrida con el selector de simultáneos, los seis KPI (entregados, cerrados, esperan al PO, trabajando, en cola, aprobaciones pendientes), la tabla de agentes vivos, la cola por ola y los entregados. La vista se actualiza sola mientras está abierta. `#/jornadas` abre la misma vista y el detalle de pasadas y frescura de la jornada queda al pie, plegado.

## Diagnóstico

- Causa comprobada (con `ruta:línea`): es una capacidad que falta, no un defecto. La vista Jornadas solo conoce el roadmap de `GET /api/journeys` (`packages/server/src/server.ts:998`), cuyo tipo `JourneyRoadmapTicket` (`packages/engine/src/journey-roadmap.ts:20`) no trae agente, herramienta ni modelo; `vistaJornadas` pinta `ticket.activity` y la fase de `FASES_DE_TICKET` (`packages/server/web/index.html:5730`), y esos campos salen del despacho de la jornada. Lo que falta es el dato por agente, que el ticket FEATURE-SERVER-ACTIVIDAD-AGENTES-20261008 expone en `GET /api/corrida/agentes` (su `## Plan` está en la rama valmen/ticket-actividad-agentes, aún sin integrar a main): por agente `ticket`, `descripcion`, `modelo`, `esfuerzo`, `rama`, `carpeta`, `ultimaHerramienta`, `ultimaHerramientaEn`, `estado` (`trabajando`, `esperando`, `termino`), `faseConfirmada`, `faseInferida` y `ticketEstado`.
- Hipótesis pendientes: (a) la forma exacta de la respuesta (¿`{ agentes: [...] }` o una lista suelta?) la fija el ticket del servidor; el plan lee `datos.agentes ?? datos` y el paso 1 la confirma contra el código ya integrado antes de escribir la vista. (b) «Tiempo» de un agente: el contrato no trae hora de inicio; se calcula como la diferencia entre ahora y el primer evento solo si el servidor la expone, y si no la columna muestra «hace N» desde `ultimaHerramientaEn`. Se decide en el paso 1 con el contrato real. (c) Las olas no las expone ninguna API (`journey next --wave` es de línea de comandos, ticket FEATURE-ENGINE-JORNADA-OLA-20261008): la vista las calcula con `dependsOn` del roadmap.
- Consumidores afectados: `packages/server/web/index.html` es la única interfaz y contiene `vistaJornadas`, `TITULOS` (7922), el enlace del menú (2094) y `navegar` (8064 y 8093). Las pruebas que ejecutan la vista actual son `tests/jornadas-progreso-pantalla.test.ts` (texto de pasadas y fases) y `tests/reconexion-mc.test.ts` (hash `#/jornadas`, descarte de una foto tardía y número de llamadas a `/api/journeys`); deben seguir en verde, por eso el detalle de la jornada se conserva al pie y el alias `#/jornadas` sigue vivo. `tests/api-rutas.test.ts` compara las llamadas `api(...)` de la interfaz con la lista `RUTAS`: la ruta nueva debe estar ahí (la declara el ticket del servidor). Las vistas Modelos (`vistaModelos`, 6488) y Políticas autónomas (`politicas`, 7047) son la guía de tarjetas, tablas y estados vacíos; Las pruebas de pantalla viven en `tests/` junto a las ya citadas, y la prueba nueva de la vista, tests/vista-corrida.test.ts, se suma ahí con el mismo arnés; `tests/perfiles-pantalla.test.ts` es la guía del arnés `ejecutarInterfaz` de `scripts/verificar-interfaz.mjs`.
- Archivos y flujo investigados: `packages/server/web/index.html` (tokens de color en `:root` líneas 11-36 y tema claro por `prefers-color-scheme` en 38; `.tarjetas` y `.tarjeta` en 723-745; `el` en 2218; `api` en 2157; `refrescoPendiente` en 7694, 7819 y 8060; `navegar` en 8056), `packages/engine/src/journey-roadmap.ts` (tipos de la jornada), `packages/engine/src/tickets.ts:31` (`TicketRow` con `workflowStatus`, `qaStatus`, `closedOn`), `packages/server/src/server.ts:433` (`GET /api/tickets`, que trae todos los estados), `scripts/verificar-interfaz.mjs` (DOM mínimo y estricto), `docs/propuesta-corrida-orquestada.md` y el mockup del artefacto (sección 3.1: barra, KPI, tabla de agentes con puntos de color, cola y entregados). Flujo: `navegar` → `vistaCorrida` → `Promise.all` de `/api/corrida/agentes`, `/api/journeys`, `/api/tickets` → derivación pura de KPI, cola y entregados → pintado con `el(...)` y `textContent`.
- Riesgos y compatibilidad: (1) inyección: los textos de la respuesta (descripción del agente, herramienta) vienen de transcripts y se pintan solo con `el(tag, texto)`, que usa `textContent`; no se usa `innerHTML`; hay caso de control. (2) Una foto tardía de otro proyecto o de otra vista no debe pintarse: se repite el patrón de revisión de `vistaJornadas`. (3) El servidor del ticket de agentes puede no estar disponible o devolver error: la vista pinta cola y entregados y avisa, no se cae. (4) Colores a mano rompen el modo oscuro: solo variables; se suman `--ok-suave` y `--error-suave` en ambos temas. (5) Ancho de celular: la tabla de agentes pasa a tarjetas apiladas por debajo de 640 px. (6) «Cerrados por política» no se puede afirmar con el dato actual (ver Supuestos): el rótulo es «cerrados». (7) Una corrida sin jornada programada no tiene cola: se dice con un texto, no se inventa.
- Impactos de sync, migración, Docker o despliegue: ninguno. Es un cambio de interfaz de solo lectura sobre rutas existentes y una ruta nueva ajena; sin migraciones, sin contenedores, sin sincronización.

## Plan

- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan).
- Pasos ordenados:
  1. Dependencia: confirmar con `grep -n "api/corrida/agentes" packages/server/src/server.ts tests/api-rutas.test.ts` que el ticket FEATURE-SERVER-ACTIVIDAD-AGENTES-20261008 ya está integrado y leer la forma real de la respuesta (envoltorio, campo de tiempo). Si no está, detenerse: este ticket no se implementa antes que su dependencia (C22).
  2. En `packages/server/web/index.html`, sección de estilos: sumar `--ok-suave` y `--error-suave` a `:root` y al bloque de tema claro, y las clases `.corrida-barra`, `.corrida-agente`, `.corrida-punto`, `.corrida-fase` y `.corrida-cola` usando solo variables (reutiliza `.tarjetas` y `.tarjeta` para los KPI); bajo `@media (max-width: 640px)` la tabla de agentes se apila en tarjetas (C24, C25, C26, C27).
  3. En el módulo de la misma página, junto a `vistaJornadas`, agregar funciones puras: `olasDeCola(tickets)` (ola 1 si no depende de nada pendiente, o 1 más la mayor ola de lo que espera), `agentesVivos(agentes)` (estados `trabajando` y `esperando`), `kpisDeCorrida({ agentes, tickets, filas })` y `fraseDeFase(agente)` (la confirmada, o la inferida rotulada «inferida») (C6, C8, C9, C10).
  4. Agregar `vistaCorrida()` con el patrón de revisión y proyecto de `vistaJornadas`: pide `/api/corrida/agentes`, `/api/journeys` y `/api/tickets` con `Promise.all`; si la de agentes falla, sigue con las otras dos y pinta un aviso; pinta la barra con el texto «N de M agentes» (N agentes vivos frente a M, el valor del selector) y el selector de simultáneos (3 por defecto, guardado en `localStorage` bajo `valmen.corrida.simultaneos`, sin ninguna llamada de escritura al servidor), los seis KPI con los rótulos entregados, cerrados, esperan al PO, trabajando, en cola y aprobaciones pendientes, la tabla de agentes vivos (punto de color, ticket, fase, herramienta con hora, modelo, tiempo), la cola por ola con a qué espera, los entregados con su estado, el estado vacío cuando no hay jornada ni agentes, y al pie el detalle de pasadas y frescura de la jornada que hoy pinta `vistaJornadas`, plegado. Todo texto del servidor entra por `el(tag, texto)` (C4, C5, C7, C11, C12, C13, C14, C15, C16, C17, C18).
  5. Navegación: cambiar el enlace del menú a `href="#/corrida"` con `data-vista="corrida"` y texto «Corrida», sumar `corrida: "Corrida"` a `TITULOS`, y en `navegar` llamar a `vistaCorrida` para `corrida` y para `jornadas` (alias), con el contador de revisión que ya existe (C1, C2, C3).
  6. Refresco: mientras la vista está abierta, un temporizador de 5 s vuelve a pintar con `navegar({ conservarVista: true })`; se cancela en `navegar` al cambiar de vista, como `refrescoPendiente` (C19, C20).
  7. Pruebas: crear tests/vista-corrida.test.ts con `ejecutarInterfaz` de `scripts/verificar-interfaz.mjs` y respuestas simuladas, sin servidor ni red: un escenario con tres agentes (trabajando, esperando, terminó), una jornada con dependencias y tickets en varios estados, y los casos de control (descripción con marcado HTML, `/api/corrida/agentes` con error, respuesta tardía tras salir, sin jornada ni agentes, selector sin escritura al servidor) (C1 a C18).
  8. Correr desde la raíz del repositorio: `npx vitest run tests/vista-corrida.test.ts tests/jornadas-progreso-pantalla.test.ts tests/reconexion-mc.test.ts tests/api-rutas.test.ts` y `npx tsc --noEmit -p tsconfig.json`; luego `revisar_presentacion` sobre el cambio y `valmen secrets` (C21, C22, C23, C24).
  9. Verificación en el navegador, con `valmen serve` sobre este repositorio y una corrida real o datos de ejemplo: abrir `#/corrida` en claro, en oscuro y con ancho de 375 px, y comprobar el refresco de 5 s (C19, C20, C25, C26, C27).
  10. Entrega: contrato de pruebas con los comandos del paso 8 (directorio: raíz del repositorio; resultado esperado: todo en verde), los pasos manuales del paso 9 con el resultado esperado de cada uno, y requisitos de ambiente (Node 24, navegador moderno, sin red); el ticket pasa a `awaiting_user_tests` sin commit hasta la confirmación del responsable.
- Impactos declarados: sincronización: ninguno, no hay datos sincronizados ni clientes sin actualizar; migración: ninguna, no hay orden de aplicación ni reversión de datos; contenedores: ninguno, no hay imagen ni publicación. La vista solo lee.
- Rollback (obligatorio): revertir el commit del ticket; `index.html` vuelve a la vista Jornadas y el enlace y el título anteriores. No hay datos que deshacer: lo único guardado es la preferencia `valmen.corrida.simultaneos` en el navegador, inofensiva si queda.

<!-- Los criterios de la sección siguiente se numeran C1…Cn, con una afirmación verificable por criterio
     —una frase con «y» son dos criterios—, y cada uno lleva debajo su anotación de
     verificación: un comentario HTML que dice «test:» y el comando, o «verify: manual». La
     sección no lleva comentarios dentro: un comentario con anotación se leería como la de un
     criterio. Ejemplo en la skill planificacion. -->
## Criterios de aceptación

- [x] C1: El menú lateral lleva el enlace «Corrida» a `#/corrida` y ya no lleva «Jornadas».
      <!-- test: npx vitest run tests/vista-corrida.test.ts -->
- [x] C2: Abrir `#/corrida` pinta la vista Corrida.
      <!-- test: npx vitest run tests/vista-corrida.test.ts -->
- [x] C3: Abrir `#/jornadas` pinta la misma vista Corrida.
      <!-- test: npx vitest run tests/vista-corrida.test.ts -->
- [x] C4: La vista consulta `/api/corrida/agentes`, `/api/journeys` y `/api/tickets`.
      <!-- test: npx vitest run tests/vista-corrida.test.ts -->
- [x] C5: La vista muestra los seis KPI con los rótulos entregados, cerrados, esperan al PO, trabajando, en cola y aprobaciones pendientes.
      <!-- test: npx vitest run tests/vista-corrida.test.ts -->
- [x] C6: Los valores de los KPI salen de los agentes, la jornada y los tickets de la respuesta.
      <!-- test: npx vitest run tests/vista-corrida.test.ts -->
- [x] C7: La tabla de agentes tiene una fila por agente vivo con ticket, fase, herramienta actual con su hora, modelo y tiempo.
      <!-- test: npx vitest run tests/vista-corrida.test.ts -->
- [x] C8: Un agente con estado `termino` no aparece entre los agentes vivos.
      <!-- test: npx vitest run tests/vista-corrida.test.ts -->
- [x] C9: La fase inferida se rotula «inferida» y la confirmada se muestra sin rótulo.
      <!-- test: npx vitest run tests/vista-corrida.test.ts -->
- [x] C10: La cola agrupa los tickets por ola y dice a qué ticket espera cada uno.
      <!-- test: npx vitest run tests/vista-corrida.test.ts -->
- [x] C11: La lista de entregados muestra cada ticket con su estado del registro.
      <!-- test: npx vitest run tests/vista-corrida.test.ts -->
- [x] C12: El selector de simultáneos arranca en 3 cuando no hay preferencia guardada.
      <!-- test: npx vitest run tests/vista-corrida.test.ts -->
- [x] C13: Cambiar el selector guarda la preferencia en el navegador sin enviar ninguna petición de escritura al servidor.
      <!-- test: npx vitest run tests/vista-corrida.test.ts -->
- [x] C14: La barra de la corrida indica cuántos agentes vivos hay frente al valor del selector.
      <!-- test: npx vitest run tests/vista-corrida.test.ts -->
- [x] C15: Una descripción de agente con marcado HTML se pinta como texto y no crea elementos.
      <!-- test: npx vitest run tests/vista-corrida.test.ts -->
- [x] C16: Si `/api/corrida/agentes` falla, la vista pinta la cola y lo entregado y muestra un aviso.
      <!-- test: npx vitest run tests/vista-corrida.test.ts -->
- [x] C17: Una respuesta que llega después de salir de la vista no pinta nada.
      <!-- test: npx vitest run tests/vista-corrida.test.ts -->
- [x] C18: Sin jornada ni agentes, la vista muestra un estado vacío que lo explica.
      <!-- test: npx vitest run tests/vista-corrida.test.ts -->
- [x] C19: Con la vista abierta, los datos se actualizan solos cada 5 segundos.
      <!-- verify: manual -->
- [x] C20: Al salir de la vista el refresco automático se detiene.
      <!-- verify: manual -->
- [x] C21: Las pruebas de la vista Jornadas anterior siguen en verde.
      <!-- test: npx vitest run tests/jornadas-progreso-pantalla.test.ts tests/reconexion-mc.test.ts -->
- [x] C22: Toda ruta que llama la interfaz está declarada en la lista de rutas del servidor.
      <!-- test: npx vitest run tests/api-rutas.test.ts -->
- [x] C23: El tipado del proyecto compila sin errores.
      <!-- test: npx tsc --noEmit -p tsconfig.json -->
- [x] C24: Los estilos nuevos no usan colores escritos a mano (revisar_presentacion sin hallazgos nuevos).
      <!-- verify: manual -->
- [x] C25: En tema claro la vista conserva jerarquía, contraste y estados legibles.
      <!-- verify: manual -->
- [x] C26: En tema oscuro la vista conserva jerarquía, contraste y estados legibles.
      <!-- verify: manual -->
- [x] C27: Con 375 px de ancho no hay desplazamiento horizontal de la página y los agentes se leen apilados.
      <!-- verify: manual -->

## Puntos

```json
[
  {
    "id": "POINT-001",
    "title": "Verificación del cierre de FEATURE-MC-VISTA-CORRIDA-20261008",
    "status": "closed",
    "severity": "normal",
    "actual": "La implementación está entregada y falta cerrar su QA.",
    "expected": "Los criterios del ticket se cumplen y sus pruebas dan el resultado esperado.",
    "evidence": [
      "EVIDENCE-001"
    ],
    "affected_files": [
      "packages/server/web/index.html",
      "tests/api-rutas.test.ts",
      "tests/vista-corrida.test.ts"
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

- `packages/server/web/index.html`: tokens `--ok-suave` y `--error-suave` en ambos temas; clases `.corrida-*` solo con variables; bajo 640 px la tabla de agentes se apila en tarjetas. `vistaJornadas` pasa a `pintarDetalleDeJornadas` (mismo texto, plegado al pie en un `<details>`, con la tabla dentro de una caja desplazable) y la nueva `vistaCorrida` pinta barra («N de M agentes» y selector 1 a 8, 3 por defecto, guardado solo en `localStorage` bajo `valmen.corrida.simultaneos`), seis KPI, agentes vivos, cola por ola, entregados y el detalle de la jornada. Funciones puras: `agentesVivos`, `olasDeCola`, `fraseDeFase`, `kpisDeCorrida`. Todo texto del servidor entra por `el(tag, texto)`.
- Contrato real de `GET /api/corrida/agentes` (`packages/server/src/agentes.ts`): `{ agentes: [...] }`, sin hora de inicio; la columna Tiempo muestra «hace N» desde `ultimaHerramientaEn`.
- Definiciones de los KPI (con el dato disponible): entregados = tickets de la corrida en `awaiting_user_tests`, `in_qa`, `qa_approved` o `closed`; cerrados = los `qa_approved` y `closed` (sin afirmar «por política»); esperan al PO = `awaiting_user_tests`, `blocked`, `changes_requested` más agentes `esperando`; trabajando = agentes `trabajando`; en cola = tickets de la jornada sin agente vivo ni entrega; aprobaciones pendientes = `planned`. «Tickets de la corrida» = los de la jornada y los que algún agente trabaja.
- Navegación: enlace «Corrida» a `#/corrida`, `TITULOS`, `navegar` llama `vistaCorrida` para `corrida` y `jornadas` (alias). Refresco cada 5 s con un temporizador propio (`refrescoDeCorrida`) cancelado en `navegar`; solo corre si el navegador expone `document.visibilityState` y no consulta con la pestaña oculta ni con un campo o diálogo en uso.
- `tests/vista-corrida.test.ts` (15 pruebas) y la ruta `GET /api/corrida/agentes` en `RUTAS` de `tests/api-rutas.test.ts`.
- Fuera de alcance, como se resolvió: el selector no escribe en el servidor y no hay botón «Pausar al cerrar la ola».
- Observación para el PO: el armazón de Mission Control no tiene barra lateral responsiva (preexistente); a 375 px la vista se lee apilada con la barra lateral plegada con el botón de pliegue.

## Pruebas

Contrato de entrega:

- Directorio: raíz del repositorio.
- `npx vitest run tests/vista-corrida.test.ts tests/jornadas-progreso-pantalla.test.ts tests/reconexion-mc.test.ts tests/api-rutas.test.ts` — esperado: 4 archivos, 27 pruebas en verde (resultado obtenido).
- `npx tsc --noEmit -p tsconfig.json` — esperado: sin errores (resultado obtenido).
- `node scripts/verificar-interfaz.mjs` — esperado: «Interfaz verificada» (obtenido; exige `node scripts/copy-web.mjs` si la copia publicada difiere).
- `revisar_presentacion` sobre el cambio: sin colores fijos (1 archivo de interfaz revisado).
- Manual: `node scripts/copy-web.mjs && node packages/cli/dist/main.js serve --port 4871`, abrir `#/corrida`, elegir el proyecto. Esperado: barra «N de M agentes», seis KPI, tabla de agentes (con datos reales solo si hay una corrida en curso; sin ella, estado vacío o cola), cola por ola, entregados y el detalle de la jornada plegado. Cambiar el selector lo recuerda al recargar sin ninguna escritura. En claro y oscuro (preferencia del sistema) conserva jerarquía y contraste; con la barra lateral plegada y 375 px no hay desplazamiento horizontal y los agentes se apilan. El refresco cada 5 s solo corre con la pestaña visible; al salir de la vista se detiene.
- Ambiente: Node 24, navegador moderno, sin red.
- Verificado en el navegador por el agente con datos de ejemplo (servidor de apoyo con respuestas simuladas de las tres rutas): claro, oscuro, 375 px, refresco (llamadas a ~5 s) y detención al salir (0 llamadas tras salir). No se corrió la suite completa (la corre el orquestador al integrar).

- Resultado del PO: «en http://localhost:4175/#/corrida sí vi los agentes trabajando y todo» — Juan Andrade, 2026-10-08. Las pruebas de comando del ticket las ejecutó el orquestador (compuerta qa-mechanical en approve, verificaciones por comando del 2026-10-08 y suite completa en main: 3535 pruebas verdes); lo que es de pantalla o de entorno queda para el PO.

## QA

```json
[
  {
    "id": "QA-001",
    "date": "2026-10-08",
    "build_reference": "commit:1b9cbbfb5ad22fe16459179aad4855d557a8c298",
    "environment": "local (Node 24, vitest)",
    "result": "pending",
    "findings": [],
    "correction": null,
    "po_confirmation": null
  },
  {
    "id": "QA-002",
    "date": "2026-10-08",
    "build_reference": null,
    "environment": null,
    "result": "approved",
    "findings": [],
    "correction": null,
    "po_confirmation": "«en http://localhost:4175/#/corrida sí vi los agentes trabajando y todo» — Juan Andrade, 2026-10-08"
  }
]
```

## Evidencia

```json
[
  {
    "id": "EVIDENCE-001",
    "date": "2026-10-08",
    "kind": "automated-test",
    "description": "Pruebas del ticket y suite completa en verde (ver ## Pruebas)",
    "reference": "worktree:sha256:e8577c7b887f2fbc28d83b4fbf1c3fa2f238097a33a1d64571429224fc883817",
    "point_id": "POINT-001"
  }
]
```

## Retests

```json
[
  {
    "id": "RETEST-001",
    "date": "2026-10-08",
    "point_id": "POINT-001",
    "result": "approved",
    "evidence": [],
    "po_confirmation": "«en http://localhost:4175/#/corrida sí vi los agentes trabajando y todo» — Juan Andrade, 2026-10-08"
  }
]
```

## Cierre

```json
[
  {
    "kind": "ticket-close",
    "id": "CLOSE-001",
    "date": "2026-10-08",
    "technical_summary": "Implementado y entregado desde su worktree; compuerta qa-mechanical en approve; suite completa en verde en main.",
    "functional_summary": "Mostrar en Mission Control la corrida con sus agentes vivos, la cola y lo entregado",
    "qa_status": "approved",
    "qa_waiver_reason": null,
    "po_confirmation": null,
    "release_impact": "Sin publicar; sin impacto de despliegue."
  }
]
```

## Consumo de IA

```json
[
  {
    "kind": "ai-usage",
    "date": "2026-10-08",
    "session_reference": null,
    "model": null,
    "reasoning_effort": null,
    "notes": "Subagente de Claude Code dedicado solo a este ticket; la sesión no expone agregado de tokens",
    "input_tokens": null,
    "output_tokens": null,
    "total_tokens": null,
    "estimated_cost_usd": null,
    "source": "manual:subagente-sin-agregado",
    "confidence": "low",
    "id": "CONSUMO-001"
  },
  {
    "kind": "ai-usage",
    "date": "2026-10-08",
    "session_reference": null,
    "model": null,
    "reasoning_effort": null,
    "notes": "Sesión orquestadora que cerró varios tickets; sin números por ticket para no repartir a ojo un costo que no se midió.",
    "input_tokens": null,
    "output_tokens": null,
    "total_tokens": null,
    "estimated_cost_usd": null,
    "source": "manual:sesión de Claude Code orquestadora, subagente por ticket",
    "confidence": "low",
    "id": "CONSUMO-002"
  },
  {
    "kind": "ai-usage",
    "date": "2026-10-08",
    "session_reference": "9f1455c8-a551-4602-ac40-a8d026bd66b8",
    "model": null,
    "reasoning_effort": null,
    "notes": "Agente claude-code. Sesión **compartida**: trabajó 35 tickets (FEATURE-ENGINE-JORNADA-OLA-20261008 ×115, SECURITY-ENGINE-APROBACION-POR-REVISOR-20261007 ×104, FEATURE-ENGINE-ORQUESTACION-INTERACTIVA-20261007 ×102, FEATURE-ENGINE-JORNADA-HANDOFF-20261008 ×87, BUGFIX-CLI-CANAL-DECISION-20261005 ×83), así que su costo no se reparte y acá no se registran números. Costo completo de la sesión: no declarado por el proveedor, 16643804 tokens. Registralo en el ticket cuya sesión sea propia, o declaralo compartido donde corresponda. Sesión \"ValmenHarness CLI attachments feature\".",
    "input_tokens": null,
    "output_tokens": null,
    "total_tokens": null,
    "estimated_cost_usd": null,
    "source": "claude:9f1455c8-a551-4602-ac40-a8d026bd66b8",
    "confidence": "high",
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
    "date": "2026-10-08",
    "at": "2026-10-08T13:44:12.577Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-08",
    "at": "2026-10-08T15:05:48.215Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-08",
    "at": "2026-10-08T15:06:15.010Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-08",
    "at": "2026-10-08T15:23:52.943Z",
    "action": "plan-approved",
    "actor": "cli",
    "details": "{\"actor\":\"Juan Andrade\",\"source\":\"cli\",\"quote\":\"La A (aprueba los 9 planes de la corrida orquestada)\",\"planHash\":\"sha256:8080cf4c46407ed33a82da4cfbf9664a2390ee013b29670d4c6769d979f98a8d\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-08",
    "at": "2026-10-08T15:23:54.565Z",
    "action": "plan-approval-verified",
    "actor": "cli",
    "details": "Aprobación del plan vigente: Juan Andrade (fuente cli), plan sha256:8080cf4c46407ed33a82da4cfbf9664a2390ee013b29670d4c6769d979f98a8d."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-08",
    "at": "2026-10-08T15:23:54.565Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-08",
    "at": "2026-10-08T15:38:19.609Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-10-08",
    "at": "2026-10-08T15:52:41.089Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-10-08",
    "at": "2026-10-08T15:52:41.418Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-10-08",
    "at": "2026-10-08T22:53:42.328Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-10-08",
    "at": "2026-10-08T22:53:42.620Z",
    "action": "point-added",
    "actor": "cli",
    "details": "Se agregó POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-10-08",
    "at": "2026-10-08T22:53:42.913Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-10-08",
    "at": "2026-10-08T22:53:43.209Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-014",
    "date": "2026-10-08",
    "at": "2026-10-08T22:53:43.515Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-015",
    "date": "2026-10-08",
    "at": "2026-10-08T22:53:43.848Z",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-016",
    "date": "2026-10-08",
    "at": "2026-10-08T22:53:44.209Z",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-017",
    "date": "2026-10-08",
    "at": "2026-10-08T22:53:44.519Z",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-001 para POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-018",
    "date": "2026-10-08",
    "at": "2026-10-08T22:53:44.805Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: verified -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-019",
    "date": "2026-10-08",
    "at": "2026-10-08T22:53:45.091Z",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-020",
    "date": "2026-10-08",
    "at": "2026-10-08T22:53:45.413Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-021",
    "date": "2026-10-08",
    "at": "2026-10-08T22:53:45.740Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-002."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-022",
    "date": "2026-10-08",
    "at": "2026-10-08T22:53:47.433Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-003."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-023",
    "date": "2026-10-08",
    "at": "2026-10-08T22:53:47.605Z",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-024",
    "date": "2026-10-08",
    "at": "2026-10-08T22:53:47.937Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  }
]
```
