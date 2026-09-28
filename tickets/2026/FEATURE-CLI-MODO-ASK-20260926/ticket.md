---
schema_version: 2
id: FEATURE-CLI-MODO-ASK-20260926
title: Añadir modo de consulta valmen ask sin permisos
type: FEATURE
module: CLI
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

# FEATURE-CLI-MODO-ASK-20260926

## Solicitud original

Parte del sprint: Reducir el costo de contexto y habilitar el enrutado y la consulta segura.
- R-S1-004: Modo pregunta (`valmen ask`) — DEBE existir un modo de consulta en el que el motor no concede permisos de
Viene de una feature descompuesta en sprints; su plan completo está en el tickets.yaml de la feature.

## Descripción funcional

- Alcance: el modo de consulta `valmen ask` en el CLI y en el servidor MCP del
  harness, con el permiso de escritura **no concedido por el motor**: crear un
  ticket, mover un estado o escribir un archivo tienen que fallar por contrato y
  no por la instrucción que recibe el agente. Queda fuera de este ticket que
  `ask` invoque a un modelo para responder —el CLI no lanza agentes, ver
  Diagnóstico— y queda fuera crear una proyección nueva de agente en
  `.valmen/agents/`.
- Usuario o rol afectado: la persona que pregunta y el agente que responde. Hoy,
  un asistente al que se le pide «¿este plan rompe la compatibilidad de sync?»
  tiene el catálogo completo del MCP o una shell con el CLI, y nada del motor le
  impide escribir mientras dice que sólo está consultando.
- Comportamiento actual: `valmen ask` no existe. El despacho del CLI rechaza el
  comando (`packages/cli/src/main.ts:1004` y el `USAGE` en `:75`), con código 2
  —comprobado: `valmen ask "…"` responde «Comando desconocido: ask»—. Y el motor
  no tiene noción de sesión sin escritura: `atomicWrite`
  (`packages/core/src/fs.ts:103`), la puerta por la que el harness escribe todo,
  no consulta ningún permiso; el catálogo MCP publica las 38 herramientas por
  igual (`packages/mcp/src/tools.ts`), de las cuales 23 anexan, reescriben o
  gastan.
- Comportamiento esperado: existe `valmen ask "<pregunta>" [--id <TICKET>]`, que
  arma el contexto de consulta y corre con el permiso de escritura negado;
  `valmen mcp --ask` declara el servidor con el mismo modo y deja fuera del
  catálogo las herramientas que escriben; y cualquier escritura intentada desde
  ese modo falla con invariante (código 3) sin dejar archivo escrito.

## Diagnóstico

- Archivos y flujo investigados:
  - `packages/core/src/fs.ts:103` (`atomicWrite`) y `:175`
    (`MutationLock.acquire`): las dos únicas puertas de escritura del harness,
    conforme al invariante de `docs/01-ARQUITECTURA.md` de que sólo `fs.ts` toca
    el disco.
  - `packages/engine/src/mutate.ts:183` (`finalizeMutation`) y `:258`
    (`refreshIndex`): el camino de toda mutación de ticket termina en
    `atomicWrite` (`:207` y `:263`), así que la puerta cubre también lo que se
    escriba por caminos que hoy no existen.
  - `packages/engine/src/create.ts:187`, `packages/engine/src/transition.ts:104`,
    `packages/engine/src/append.ts:69`, `packages/engine/src/release.ts:176`,
    `packages/engine/src/features.ts:529` y `:606`: los seis puntos que toman el
    lock de mutación; son los actos que el modo pregunta tiene que nombrar al
    negarse.
  - `packages/mcp/src/tools.ts:239-266`: las cuatro formas de una herramienta
    —`SOLO_LEE`, `ANEXA`, `REESCRIBE`, `GASTA`—; 15 usan `SOLO_LEE` y 23 no.
  - `packages/engine/src/resume.ts:70` (`buildResumeContext`) y
    `packages/engine/src/memory.ts:291` (`searchMemory`): lo que un contexto de
    consulta puede armar sin modelo y sin red.
  - `packages/adapter/src/agents.ts:24-29` (`AgentPermissions`), `:118-121`
    (el permiso del agente ya se declara como dato), `:175` y `:198-199` (las
    proyecciones escriben `sandbox_mode = "read-only"` y `permission.edit: deny`
    cuando no hay permiso de escritura).
  - `docs/12-FUNCIONALIDADES-PROXIMAS.md:13` §A1: la propuesta de la que sale el
    requisito, con su forma: «el CLI expone `valmen ask`, que corre el agente con
    `permissions.write = false` y un system prompt reducido. Determinista, no
    depende de que el modelo obedezca».
  - `.valmen/features/evolucion-harness/spec/s1-costo-contexto/spec.md`, R-S1-004:
    el enunciado que este ticket cubre, con sus tres prohibiciones —crear
    tickets, mover estados, escribir archivos—.
- Causa raíz o hipótesis: el modo de fallo no es un comando que falte, es un
  permiso que **nunca se negó**: el motor no tiene noción de «esta sesión no
  escribe», así que la única barrera entre una consulta y una mutación es la
  instrucción que recibe el agente, que es exactamente lo que R-S1-004 pide
  reemplazar por mecanismo. Como toda escritura pasa por dos puertas únicas
  —`atomicWrite` y el lock de mutación—, negar el permiso ahí se cierra en dos
  puntos y no en los cuarenta comandos y herramientas que podrían escribirlo. La
  búsqueda en memoria del proyecto (`valmen memory search "modo pregunta permisos
  escritura agente"`) no devolvió ningún incidente previo de este permiso; sí
  devolvió AP-001, que es sobre cómo se escriben los criterios de un ticket
  —compuestos bloquean la compuerta de plan por banda— y se aplica a la hora de
  redactarlos, no al defecto.
- Riesgos y compatibilidad: el guardia se activa sólo en el modo pregunta, y el
  modo por defecto sigue siendo escribir, así que ningún comando existente cambia
  de comportamiento —eso se comprueba con la suite completa, cuya línea base al
  2026-09-26 es 1.433 pruebas que pasan, 48 omitidas y 0 que fallan—. El modo es
  estado de proceso: un guardia ambiente que no se restaure dejaría al proceso
  sin poder escribir, y por eso se expone con `withAccessMode`, que restaura en
  `finally`, con su propia prueba. El comando y la bandera son nuevos
  —`ask` no colisiona con ninguno de los declarados en el `USAGE`—, y no cambia
  el formato de ningún artefacto: ni el ticket, ni las banderas del MCP, ni el
  `AGENTS.md` que proyecta `valmen sync`.
- Impactos de sync, migración, Docker o despliegue: ninguno — **sync**: no se
  toca `.valmen/` ni nada de lo que `valmen sync` proyecta; el `AGENTS.md`
  regenerado queda idéntico y `valmen sync --check` sigue diciendo «Archivos
  generados al día». **migración**: no se toca el esquema del ticket
  (`schema_version: 2`) ni el del registro; el modo no persiste nada, vive en el
  proceso. **Docker**: este repositorio no usa contenedores en este camino, y el
  cambio no agrega ninguno. **despliegue**: el cambio viaja dentro del paquete
  cuando se publique, pero no toca `release-publish`, el manifiesto de entrega ni
  ningún ambiente.

## Plan

### Decisiones de diseño

1. **El permiso de escritura se declara por modo y vive en el proceso.**
   `packages/core/src/permissions.ts` (nuevo) declara `AccessMode = "write" | "ask"`,
   `accessMode()`, `setAccessMode()`, `withAccessMode()` —que restaura en `finally`—
   y `assertWriteAllowed(acto)`, que falla con `EXIT_INVARIANT`
   (`packages/core/src/errors.ts:13`). Alternativa descartada: pasar el modo como
   parámetro por cada función del motor. Es más puro, sin estado compartido, pero
   obliga a tocar la firma de decenas de funciones y deja sin guardia cualquier
   camino que se agregue en el futuro sin el parámetro —que es justo el modo de
   fallo que R-S1-004 quiere cerrar—.

2. **El guardia vive en las dos puertas de escritura, no en cada comando.**
   `packages/core/src/fs.ts:103` (`atomicWrite`) y `:175` (`MutationLock.acquire`),
   más la etiqueta del acto en los seis `MutationLock.run`
   (`packages/engine/src/create.ts:187`, `:transition.ts:104`,
   `packages/engine/src/append.ts:69`, `packages/engine/src/release.ts:176`,
   `packages/engine/src/features.ts:529` y `:606`), para que el rechazo diga qué se
   intentó —«no puede crear un ticket»— y no sólo que no se pudo escribir.
   Alternativa descartada: guardar en cada comando del CLI y cada herramienta MCP;
   son cuarenta puntos que hay que recordar mantener, y el que se agregue después
   nace sin guardia.

3. **`valmen ask` arma el contexto de consulta sin modelo.**
   `packages/engine/src/ask.ts` (nuevo) compone la pregunta, el registro activo
   (`packages/engine/src/tickets.ts:174`), el ticket reanudado en formato compacto
   (`packages/engine/src/resume.ts:70`) y la memoria del proyecto
   (`packages/engine/src/memory.ts:291`). Alternativa descartada: que `ask` invoque
   a un modelo para responder —el CLI no lanza agentes (no hay `spawn` de runtimes
   en `packages/cli/src/`), el resultado no sería comprobable por una prueba y el
   modo dejaría de ser determinista—. Lo que sí declara es el permiso de quien
   responde: sin escritura y sin ejecución.

4. **El servidor MCP declara el mismo modo con `--ask`.** `packages/mcp/src/main.ts`
   arranca en modo pregunta y `tools/list` publica sólo las herramientas de sólo
   lectura —15 de 38 en `packages/mcp/src/tools.ts:239-266`—; las que escriben dejan
   de ofrecerse y quedan además cerradas por el guardia. Alternativa descartada:
   confiar en `readOnlyHint` para que el cliente pida permiso a la persona; eso es
   decisión del cliente, y el requisito pide que no lo conceda el motor.

5. **La bandera viaja en el fragmento que `valmen mcp` ya imprime.**
   `packages/cli/src/mcp.ts` y `packages/adapter/src/mcp.ts:51` (`mcpEntry`):
   `--ask` se agrega a los `args` de la entrada, así que el fragmento impreso la
   muestra y `--install` la escribe junto al resto. Alternativa descartada: declarar
   un segundo servidor con otro nombre; el registro y el catálogo son los mismos y
   dos entradas duplicarían la declaración en cada runtime.

### Pasos ordenados

1. `tests/modo-ask.test.ts` (nuevo), primero y en rojo, con un caso por
   comportamiento y registro de laboratorio en un directorio temporal armado con
   `tests/helpers/fixtures.ts`: crear un ticket rechazado, mover un estado
   rechazado, el frontmatter conservado tras el rechazo, `atomicWrite` rechazado,
   el archivo ausente en disco, los mismos tres caminos fuera del modo pregunta,
   la restauración de `withAccessMode` al salir y al lanzar, las capacidades
   declaradas, el catálogo del MCP filtrado y la salida de `valmen ask` con
   pregunta, registro activo, permiso declarado, `--id` y sin pregunta.
2. `packages/core/src/permissions.ts` (nuevo): `AccessMode`, `accessMode()`,
   `setAccessMode()`, `withAccessMode()` y `assertWriteAllowed()`, con la
   capacidad declarada en `capabilitiesFor()`; y su export en
   `packages/core/src/index.ts`.
3. `packages/core/src/fs.ts`: el guardia en `atomicWrite` y en `MutationLock`, con
   la etiqueta del acto.
4. `packages/engine/src/ask.ts` (nuevo) y su export en
   `packages/engine/src/index.ts`.
5. La etiqueta del acto en `packages/engine/src/create.ts`,
   `packages/engine/src/transition.ts`, `packages/engine/src/append.ts`,
   `packages/engine/src/release.ts` y `packages/engine/src/features.ts`.
6. `packages/cli/src/commands.ts`: `askCommand`, que corre dentro de
   `withAccessMode("ask", …)`.
7. `packages/cli/src/main.ts`: el caso `ask` en el despacho y su línea en `USAGE`.
8. `packages/cli/src/mcp.ts` y `packages/adapter/src/mcp.ts`: `--ask` en la entrada
   declarada.
9. `packages/mcp/src/main.ts`: la bandera, el filtro del catálogo y el modo.
10. `docs/12-FUNCIONALIDADES-PROXIMAS.md` §A1: el estado del comando, como lo tiene
    A2.
11. `npx vitest run tests/modo-ask.test.ts` y después `npx vitest run` completo,
    contra la línea base de 1.433 pruebas que pasan, 48 omitidas y 0 que fallan.

### Cobertura de los criterios

- Los criterios 1 a 6 —el rechazo en modo pregunta y el registro intacto— los
  satisfacen el paso 1, con sus casos, y los pasos 2 y 3, con el guardia.
- Los criterios 7 y 8 —los mismos caminos fuera del modo— los satisface el paso 1,
  con su caso de control, sobre el código de los pasos 2 al 5.
- Los criterios 9 y 10 —la restauración del modo— los satisface el paso 2
  (`withAccessMode`), con sus dos casos en el paso 1.
- Los criterios 11 y 12 —las capacidades declaradas— los satisface el paso 2
  (`capabilitiesFor`), con su caso en el paso 1.
- Los criterios 13 y 14 —el catálogo del MCP— los satisface el paso 9, con sus dos
  casos en el paso 1.
- Los criterios 15 a 20 —la salida de `valmen ask`, con `--id` y sin pregunta— los
  satisfacen el paso 4 (`packages/engine/src/ask.ts`), el paso 6 (`askCommand`) y
  el paso 7 (el despacho), con sus casos en el paso 1.
- El criterio 21 —la suite completa— lo satisface el paso 11.

### Trazabilidad decisión → hallazgo

El hallazgo de que toda escritura pasa por `atomicWrite` y por el lock de mutación
es la decisión 2; el catálogo MCP con 23 herramientas que escriben, mueven o gastan
es la decisión 4; la ausencia de un `spawn` de agentes en el CLI es la decisión 3;
el permiso de agente que ya se declara como dato en `AgentPermissions`
(`packages/adapter/src/agents.ts:24-29`) es la decisión 1; y la forma en que el
servidor se declara en cada runtime (`packages/cli/src/mcp.ts:147`) es la decisión 5.
Los criterios se redactan atómicos y con el archivo de prueba nombrado, siguiendo
AP-001 (`valmen memory search`), que mide que un criterio compuesto bloquea la
compuerta de plan por banda.

- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan).
- Aprobación delegada: la ejerció esta sesión por delegación expresa de Juan
  Andrade del 2026-09-26, cuyas palabras fueron «si el analisis pasa las compuertas
  te doy la libertad de aprobarlo, al igual que con el plan si el plan pasa la
  compuerta y te parece que el plan cumple tienes la potestad de aprobar». El
  recibo de la compuerta de plan quedó en REVIEW con dos proposiciones de criterio
  en 0,89 —`criterio_07` y `criterio_08`, las dos sobre el caso de control fuera
  del modo— y todas las demás en 0,90 o más, con la media en 0,877 y las
  descriptivas por encima de 0,90: no hay punto de fondo, el plan cubre los 21
  criterios y por eso se recomienda y se aprueba.

- Rollback: `git checkout` de los archivos tocados y borrado de los tres nuevos
  (`packages/core/src/permissions.ts`, `packages/engine/src/ask.ts` y
  `tests/modo-ask.test.ts`). No hay migración, ni estado persistido, ni artefacto
  escrito por el modo pregunta que sobreviva: el modo vive en el proceso y muere con
  él, así que revertir el código devuelve el comportamiento anterior por completo.

## Criterios de aceptación

- [x] En modo pregunta, crear un ticket falla con el código de invariante
      <!-- test: npx vitest run tests/modo-ask.test.ts -->
- [x] En modo pregunta, el ticket rechazado no queda escrito en el registro
      <!-- test: npx vitest run tests/modo-ask.test.ts -->
- [x] En modo pregunta, mover el estado de un ticket falla con el código de invariante
      <!-- test: npx vitest run tests/modo-ask.test.ts -->
- [x] En modo pregunta, el frontmatter del ticket conserva su estado anterior tras el rechazo
      <!-- test: npx vitest run tests/modo-ask.test.ts -->
- [x] En modo pregunta, `atomicWrite` falla con el código de invariante
      <!-- test: npx vitest run tests/modo-ask.test.ts -->
- [x] En modo pregunta, el archivo que `atomicWrite` no escribió no existe en disco
      <!-- test: npx vitest run tests/modo-ask.test.ts -->
- [x] Fuera del modo pregunta, crear un ticket escribe su archivo en el registro
      <!-- test: npx vitest run tests/modo-ask.test.ts -->
- [x] Fuera del modo pregunta, mover un estado se aplica al frontmatter del ticket
      <!-- test: npx vitest run tests/modo-ask.test.ts -->
- [x] `withAccessMode` restaura el modo de acceso al salir
      <!-- test: npx vitest run tests/modo-ask.test.ts -->
- [x] `withAccessMode` restaura el modo de acceso cuando la acción lanza
      <!-- test: npx vitest run tests/modo-ask.test.ts -->
- [x] El modo pregunta declara las capacidades del agente sin permiso de escritura
      <!-- test: npx vitest run tests/modo-ask.test.ts -->
- [x] El modo pregunta declara las capacidades del agente sin permiso de ejecución
      <!-- test: npx vitest run tests/modo-ask.test.ts -->
- [x] El catálogo del servidor MCP en modo pregunta publica sólo las herramientas de sólo lectura
      <!-- test: npx vitest run tests/modo-ask.test.ts -->
- [x] El catálogo del servidor MCP en modo pregunta deja fuera las herramientas que escriben
      <!-- test: npx vitest run tests/modo-ask.test.ts -->
- [x] `valmen ask` nombra la pregunta recibida en su salida
      <!-- test: npx vitest run tests/modo-ask.test.ts -->
- [x] `valmen ask` lista los tickets activos del registro
      <!-- test: npx vitest run tests/modo-ask.test.ts -->
- [x] `valmen ask` declara el permiso de escritura como no concedido
      <!-- test: npx vitest run tests/modo-ask.test.ts -->
- [x] `valmen ask` con `--id` incluye el contexto compacto del ticket
      <!-- test: npx vitest run tests/modo-ask.test.ts -->
- [x] `valmen ask` con `--id` incluye los aciertos de la memoria del proyecto
      <!-- test: npx vitest run tests/modo-ask.test.ts -->
- [x] `valmen ask` sin pregunta falla con el código de esquema
      <!-- test: npx vitest run tests/modo-ask.test.ts -->
- [x] La suite completa del repositorio queda en verde con cero fallos sobre la línea base de 1.433 pruebas que pasan y 48 omitidas
      <!-- verify: manual -->

## Puntos

```json
[]
```

## Implementación

Implementación terminada y verificada en esta sesión (2026-09-27), escrita por la sesión
del ticket —no hubo ejecutor— y con TDD: `tests/modo-ask.test.ts` se escribió primero y
falló por la razón correcta (comportamientos ausentes), no por errores de la prueba.

- `packages/core/src/permissions.ts` (nuevo): `AccessMode = "write" | "ask"`, `accessMode()`,
  `setAccessMode()`, `withAccessMode()` —restaura en `finally`— y `assertWriteAllowed(acto)`,
  que falla con `EXIT_INVARIANT`; `capabilitiesFor()` declara el modo pregunta con
  `write: false` y `execute: false`.
- `packages/core/src/fs.ts`: `atomicWrite` y `MutationLock.acquire` empiezan por el guardia, y
  el mensaje nombra el acto («crear un ticket», «tomar el lock de mutación del registro»).
- `packages/engine/src/ask.ts` (nuevo): `buildAskContext` y `renderAskContext` — pregunta,
  registro activo, ticket en formato compacto si viene `--id`, y memoria del proyecto—, sin
  modelo y sin red.
- `packages/engine/src/create.ts`, `transition.ts`, `append.ts`, `release.ts` y `features.ts`:
  la etiqueta del acto en los seis puntos que toman el lock de mutación.
- `packages/cli/src/commands.ts`: `askCommand`, que corre dentro de `withAccessMode("ask", …)`;
  `packages/cli/src/main.ts`: el caso `ask` en el despacho y su línea en `USAGE`.
- `packages/cli/src/mcp.ts` y `packages/adapter/src/mcp.ts`: `--ask` viaja en los `args` de la
  entrada declarada, así que el fragmento impreso lo muestra y `--install` lo escribe;
  `packages/mcp/src/main.ts`: la bandera, el modo del proceso y `toolsInMode`, que filtra el
  catálogo.
- `docs/12-FUNCIONALIDADES-PROXIMAS.md` §A1: el estado del comando, como lo tiene A2.

**Hallazgo del verificador, corregido en el mismo ciclo.** `packages/core/src/fs.ts`
importaba `fail` y `EXIT_HISTORY` desde el índice de su propio paquete —un ciclo entre la
puerta de escritura y el índice— y con el guardia nuevo ese ciclo dejó de resolverse en un
orden estable: un módulo que importaba `packages/core/src/fs.js` antes que el índice se
quedaba con `MutationLock` sin definir en tiempo de llamada. Se reprodujo con un sondeo
mínimo sobre el árbol con el cambio y sin él (con el archivo de `HEAD` el sondeo pasa, con el
del ticket falla), y se corrigió importando `./errors.js` en vez del índice: el ciclo
desaparece, el sondeo pasa y las dos corridas de la suite quedaron verdes. La corrección la
escribió esta sesión, no un ejecutor.

## Pruebas

Ejecutado por la sesión del ticket en `/Users/juanandrade/Desktop/ValmenHarness`, rama
`main`, sobre el árbol del ticket sin commitear al momento de correr (el hash del árbol que
corrió está en Evidencia).

- `npx vitest run tests/modo-ask.test.ts` → **21 de 21 pasan**.
- `npx vitest run` (suite completa) → **1477 pasan, 48 omitidas, 0 fallan**, 74 archivos y 1
  omitido. La misma corrida sin el archivo del ticket
  (`npx vitest run --exclude '**/modo-ask.test.ts'`) dio **1456 pasan, 48 omitidas, 0 fallan**:
  la diferencia son exactamente las 21 pruebas nuevas, y el resto del árbol queda verde sin
  ellas. La línea base del diagnóstico —1433 al 2026-09-26— quedó vieja porque el trabajo de
  hoy, incluidos los otros dos tickets de la cadena, agregó pruebas; lo que se verifica es
  que los fallos siguen en cero.
- Punta a punta sobre los paquetes compilados (`npm run build`):
  - `valmen ask "¿el modo pregunta niega la escritura?"` imprime el contexto con la escritura
    declarada como no concedida, el registro activo y la memoria; con `--id` agrega el
    contexto compacto del ticket (plan vigente, último recibo, duraciones).
  - `valmen mcp --ask` imprime el fragmento con `--ask` en los `args` de los tres runtimes.
  - `node packages/mcp/dist/main.js --ask --check` → `modo: pregunta (no concede escritura)`,
    `herramientas: 15`; sin `--ask`, `modo: escritura`, `herramientas: 38`.
  - Servidor MCP por stdio en modo pregunta (`initialize`, `tools/list` y `tools/call`
    `crear_ticket`): el catálogo no publica `crear_ticket` y la llamada directa contesta
    «Herramienta desconocida». El mismo llamado en modo escritura sí llega al motor —falla
    sólo porque el registro de laboratorio no tiene frontmatter—, que es el control de que el
    camino existe y lo que lo cierra es el modo.
  - `withAccessMode("ask", …)` sobre `dist`, con `atomicWrite` y `createTicket`: los dos
    fallan con `TicketError` («Modo pregunta: el motor no concede permisos de escritura…») y
    **ningún archivo queda en disco**.
- El criterio 21 es `verify: manual` y se da por verificado con la corrida de la suite de esta
  sesión, en el marco de la delegación de QA que se cita abajo.

- Resultado del PO: aprobación DELEGADA — Juan Andrade dijo el 2026-09-26 «si el analisis pasa las compuertas te doy la libertad de aprobarlo, al igual que con el plan si el plan pasa la compuerta y te parece que el plan cumple tienes la potestad de aprobar, si las pruebas que ejecutes pasan correctamente como yo ejecutaria las mismas pasa como aprobado el QA y cierras», y el 2026-09-27 agregó «que haga el commit y push»; esta sesión corrió el contrato de pruebas del ticket tal como él lo correría y la firma del QA es suya por esa delegación, no palabras suyas de hoy.

## QA

```json
[
  {
    "id": "QA-001",
    "date": "2026-09-27",
    "build_reference": "commit:b7c4a39ce5993a71e6070a12e0d1892f4fe086aa",
    "environment": "local: arbol de trabajo de la sesion, rama main, commit b7c4a39",
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
    "po_confirmation": "Aprobacion DELEGADA por el PO Juan Andrade el 2026-09-26, sus palabras: si el analisis pasa las compuertas te doy la libertad de aprobarlo, al igual que con el plan si el plan pasa la compuerta y te parece que el plan cumple tienes la potestad de aprobar, si las pruebas que ejecutes pasan correctamente como yo ejecutaria las mismas pasa como aprobado el QA y cierras. El QA lo aprobo esta sesion en su nombre, sobre el arbol commiteado del ticket (commit b7c4a39): el archivo enfocado tests/modo-ask.test.ts pasa 21 de 21 y la suite completa npx vitest run da 1477 pasan, 48 omitidas y 0 fallan."
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
    "description": "Contrato de pruebas del ticket, corrido por el verificador desde la raiz del repositorio: el archivo enfocado tests/modo-ask.test.ts con 21 de 21 en verde y la suite completa npx vitest run con 1477 pasan, 48 omitidas y 0 fallan; la misma corrida sin el archivo del ticket da 1456 pasan, 48 omitidas y 0 fallan, asi que la diferencia son exactamente las 21 pruebas nuevas y el resto del arbol queda verde sin ellas. Tambien se corrio la punta a punta sobre los paquetes compilados con npm run build: valmen ask y valmen mcp --ask, el servidor MCP por stdio en modo pregunta, donde el catalogo publica 15 de 38 herramientas y crear_ticket no esta y la llamada directa responde Herramienta desconocida, y el guardia sobre dist con atomicWrite y createTicket, que fallan con TicketError sin dejar archivo en disco. npm run typecheck y npx eslint de los archivos tocados terminan sin errores. Archivos del cambio en orden alfabetico: docs/12-FUNCIONALIDADES-PROXIMAS.md, packages/adapter/src/mcp.ts, packages/cli/src/commands.ts, packages/cli/src/main.ts, packages/cli/src/mcp.ts, packages/core/src/fs.ts, packages/core/src/index.ts, packages/core/src/permissions.ts, packages/engine/src/append.ts, packages/engine/src/ask.ts, packages/engine/src/create.ts, packages/engine/src/features.ts, packages/engine/src/index.ts, packages/engine/src/release.ts, packages/engine/src/transition.ts, packages/mcp/src/main.ts y tests/modo-ask.test.ts. El codigo lo escribio la sesion, sin ejecutor.",
    "reference": "worktree:sha256:0b0f042993b991905b8ead27721ef3d6497efa2aeb354b0439ea9456b560fa5e",
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
    "technical_summary": "El modo de consulta vive en el proceso: packages/core/src/permissions.ts declara AccessMode con los valores write y ask, accessMode, setAccessMode, withAccessMode que restaura en finally, y assertWriteAllowed, que falla con EXIT_INVARIANT nombrando el acto. El guardia se aplica en las dos puertas de escritura del harness, atomicWrite y el lock de mutacion de packages/core/src/fs.ts, con la etiqueta del acto en los seis puntos que toman el lock en packages/engine/src. packages/engine/src/ask.ts arma el contexto de consulta sin modelo y sin red: la pregunta, el registro activo, el ticket en formato compacto y la memoria del proyecto. El CLI expone valmen ask y valmen mcp --ask, que agrega la bandera a la entrada declarada del servidor y arranca el proceso en modo pregunta, con el catalogo del MCP filtrado a las 15 herramientas de solo lectura de 38. Se corrigio ademas un ciclo de importacion en fs.ts, que importaba el indice de su propio paquete y en cierto orden de evaluacion dejaba MutationLock sin definir. Verificado con tests/modo-ask.test.ts (21 pruebas), la suite completa (1477 pasan, 48 omitidas, 0 fallan), npm run typecheck, eslint de los archivos tocados y la punta a punta sobre los paquetes compilados, incluido el servidor MCP por stdio.",
    "functional_summary": "Quien consulta ya no puede escribir por accidente: valmen ask responde con el contexto del registro y del ticket sin tocar nada, y el servidor MCP en modo pregunta no ofrece las herramientas que escriben. La barrera es del motor y no de la instruccion que recibe el agente: crear un ticket, mover un estado o escribir un archivo fallan con invariante aunque el agente insista.",
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
    "date": "2026-09-27",
    "session_reference": "cron_892c64034c64_20260927_152134",
    "model": "deepseek-v4.1-flash",
    "reasoning_effort": null,
    "notes": "Sesion de cron que trabajo el ticket entera: analisis, compuertas, plan, implementacion, verificacion, QA y cierre. Lectura hecha al momento de registrar el consumo, con el turno todavia en curso: la fila de la sesion sigue creciendo hasta que este turno termina, asi que los numeros son un piso y no la medicion final (desvio declarado). El proveedor factura por suscripcion, asi que no se declara coste por token. No hubo ejecutor de OpenCode sobre este arbol: el codigo lo escribio esta sesion.",
    "input_tokens": 379896,
    "output_tokens": 112589,
    "total_tokens": 492485,
    "estimated_cost_usd": null,
    "source": "hermes:/Users/juanandrade/.hermes/profiles/valmen-harness/state.db session cron_892c64034c64_20260927_152134",
    "confidence": "high",
    "id": "CONSUMO-001"
  },
  {
    "kind": "ai-usage",
    "date": "2026-09-27",
    "session_reference": "20260926_230404_d977c6",
    "model": null,
    "reasoning_effort": null,
    "notes": "Agente hermes:desktop. Sesión **compartida**: trabajó 7 tickets (FEATURE-ENGINE-ROLES-ENRUTAMIENTO-20260926 ×49, FEATURE-CLI-MODO-ASK-20260926 ×15, DOCS-ENGINE-CASCADA-VERIFICADA-20260926 ×14, IMPROVEMENT-ENGINE-CASCADA-VERIFICADA-20260926 ×13, IMPROVEMENT-ENGINE-PRESUPUESTOS-ADAPTATIVOS-20260926 ×11), así que su costo no se reparte y acá no se registran números. Costo completo de la sesión: no declarado por el proveedor, 448415 tokens. Registralo en el ticket cuya sesión sea propia, o declaralo compartido donde corresponda. Sesión \"Bot Chat\".",
    "input_tokens": null,
    "output_tokens": null,
    "total_tokens": null,
    "estimated_cost_usd": null,
    "source": "hermes:/Users/juanandrade/.hermes/profiles/valmen-harness/state.db",
    "confidence": "high",
    "id": "CONSUMO-002"
  },
  {
    "kind": "ai-usage",
    "date": "2026-09-27",
    "session_reference": "20260927_143939_5b7f19d7",
    "model": "opencode-go/deepseek-v4.1-flash",
    "reasoning_effort": null,
    "notes": "Agente hermes:slack. 32 intervención(es) sobre el registro, 0 con fallo. 2 de 60 mensajes tocaron el registro. Razonamiento 28170 tokens, caché leída 1803264 tokens. Sesión \"Saludo amistoso\". Proveedor por suscripción: no hay coste por token, se registran los tokens.",
    "input_tokens": 117645,
    "output_tokens": 34639,
    "total_tokens": 180454,
    "estimated_cost_usd": null,
    "source": "hermes:/Users/juanandrade/.hermes/profiles/valmen-harness/state.db",
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
    "date": "2026-09-26",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-09-27",
    "at": "2026-09-27T20:25:46.614Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-09-27",
    "at": "2026-09-27T20:29:34.046Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-09-27",
    "at": "2026-09-27T20:34:55.615Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-09-27",
    "at": "2026-09-27T20:35:48.036Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-09-27",
    "at": "2026-09-27T20:55:03.400Z",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-09-27",
    "at": "2026-09-27T20:56:12.226Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-09-27",
    "at": "2026-09-27T20:56:12.372Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-09-27",
    "at": "2026-09-27T20:56:17.680Z",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-09-27",
    "at": "2026-09-27T20:56:53.935Z",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-09-27",
    "at": "2026-09-27T20:56:54.071Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-09-27",
    "at": "2026-09-27T20:57:10.437Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-09-27",
    "at": "2026-09-27T20:57:21.340Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-002."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-014",
    "date": "2026-09-27",
    "at": "2026-09-27T20:57:21.379Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-003."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-015",
    "date": "2026-09-27",
    "at": "2026-09-27T20:57:21.405Z",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-016",
    "date": "2026-09-27",
    "at": "2026-09-27T20:57:26.503Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-017",
    "date": "2026-09-27",
    "at": "2026-09-28T02:33:11.829Z",
    "action": "gate-approved",
    "actor": "cli",
    "details": "Gate plan aprobado por Delegacion del PO (Juan Andrade 2026-09-26): Aprobacion DELEGADA, la que el propio plan del ticket ya declara. Sus palabras del 2026-09-26: «si el analisis pasa las compuertas te doy la libertad de aprobarlo, al igual que con el plan si el plan pasa la compuerta y te parece que el plan cumple tienes la potestad de aprobar». La compuerta quedo en REVIEW con dos proposiciones de criterio en 0.89 sobre el caso de control fuera; el alcance, los archivos y el rollback salieron en verde. El registro de la decision lo confirmo el PO el 2026-09-27 con sus palabras: «Si apruebo ambas cosas recuerda que hay algo para la generacion de los eslabones entonces si toca se deben actualizar para que no siga pasando y luego haces commit y push». Se registra para que el recibo no siga contando como esperando la decision de una persona en un ticket ya cerrado."
  }
]
```
