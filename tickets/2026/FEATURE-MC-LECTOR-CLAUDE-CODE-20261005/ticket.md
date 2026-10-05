---
schema_version: 2
id: FEATURE-MC-LECTOR-CLAUDE-CODE-20261005
title: Mission Control lee las sesiones de Claude Code en «Línea de tiempo y coste»
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
created: 2026-10-05
updated: 2026-10-05
related_ticket: null
target_release: null
released_in: null
---

# FEATURE-MC-LECTOR-CLAUDE-CODE-20261005

## Solicitud original

El PO decidió que todos los tickets se resuelven desde Claude Code, y el panel «Línea de tiempo y coste» salía vacío para ellos: no hay lector de transcripciones de Claude Code (solo opencode, codex y Hermes) y la pantalla escondía las compuertas cuando no había sesiones. Caso real: IMPROVEMENT-POS-MENSAJE-ORDEN-NO-FACTURADA-20261005 de saiopencloud, trabajado entero desde la sesión 9d55ce3b-5c13-4e93-af45-77a4977bd5c6: la API devolvía 0 sesiones y 5 compuertas y la pantalla no mostraba nada. Piezas: (1) pintar las compuertas aunque no haya sesiones; (2) lector de ~/.claude/projects integrado en la línea de tiempo y en la foto de consumo; (3) prefijo claude: verificable en el consumo de IA.

### Supuestos y decisiones pendientes

<!-- Si el pedido nombra algo que el código no tiene —parámetro, permiso,
campo, bandera, columna, migración— y no lo especifica, listá cada elemento
con su pregunta antes de avanzar a análisis; el análisis no planifica sobre
la adivinanza. Si no hay ninguno, escribí «Ninguno» y seguí. -->
Ninguno.

## Descripción funcional

- Alcance: que el panel «Línea de tiempo y coste» de Mission Control cargue datos
  para un ticket trabajado desde Claude Code: sesiones, tokens, intervenciones sobre
  el registro y compuertas; y que el consumo de esa sesión se pueda registrar en el
  ticket con un origen verificable (`claude:<id de la sesión>`). Queda fuera cambiar
  cómo se leen opencode, codex y Hermes, y el desglose harness/exploración de opencode.
- Usuario o rol afectado: el PO, que desde ahora resuelve todos los tickets con
  Claude Code y valida el consumo y las compuertas en Mission Control.
- Comportamiento actual: la pantalla solo conoce tres orígenes de sesión (opencode,
  codex, Hermes). Un ticket hecho en Claude Code sale sin sesiones, y con 0 sesiones
  la vista pinta «Ninguna sesión trabajó este ticket…» y termina sin pintar las
  compuertas. Además `registrar_consumo_ia` no admite el prefijo `claude:`, así que
  el consumo de esas sesiones solo se puede declarar con `manual:`.
- Síntoma reproducible: `GET /api/timeline?ticket=IMPROVEMENT-POS-MENSAJE-ORDEN-NO-FACTURADA-20261005`
  (proyecto `saiopencloud`, sesión de Claude Code `9d55ce3b-5c13-4e93-af45-77a4977bd5c6`)
  devolvía `available: true`, 0 sesiones y 5 compuertas, y la pantalla no mostraba
  ninguna de las cinco.
- Comportamiento esperado: esa misma consulta devuelve la sesión con `source:
  "claude"`, modelo de la transcripción, `costUsd: null`, tokens medidos e
  intervenciones mayores que cero, más las compuertas; la pantalla pinta las
  compuertas aunque no haya sesiones; y «Guardar el consumo en el ticket» escribe la
  sesión con `source: "claude:<id>"` sin duplicar una entrada que ya tenga esa
  referencia.

## Diagnóstico

- Archivos y flujo investigados (estado previo al cambio, `HEAD d4bf85c`):
  `packages/server/src/timeline.ts:96` limita `SesionDeAgente.source` a
  `"opencode" | "codex" | "hermes"`; `leerLineaDeTiempo` (`timeline.ts:335`) y
  `consultar` (`timeline.ts:860-960`) integran codex y Hermes y no hay lector de
  Claude Code; `guardarFotoEnTicket` (`timeline.ts:1071-1110`) arma el `source` como
  `${sesion.source}:${base}` y descarta las sesiones sin `model`.
  `packages/server/web/index.html:4533` (`pintarLineaDeTiempo`) sale con
  `sesiones.length === 0` antes de pintar `datos.compuertas`. `GET /api/timeline`
  (`packages/server/src/server.ts:885`) ya entrega las compuertas desde los recibos.
  `packages/engine/src/append.ts:717` (`FUENTES_DE_CONSUMO`) admite `opencode, hermes,
  codex, manual, process`, y `packages/mcp/src/tools.ts:676` lista esos prefijos para
  quien llama `registrar_consumo_ia`. La lista también está en la plantilla que
  proyecta `AGENTS.md` (`packages/adapter/src/templates.ts:290`).
- La no duplicación del consumo ya existe y no se cambia: `guardarFotoEnTicket`
  (`timeline.ts:1071`) descarta las sesiones cuyo `session_reference` ya consta en el
  bloque `## Consumo de IA` (`sesionesRegistradas`, `timeline.ts:1185-1199`), y
  compara la referencia, no el prefijo de `source`. Por eso la entrada `manual:` del
  ticket de referencia (`CONSUMO-001`, `session_reference` `9d55ce3b-5c13-4e93-af45-77a4977bd5c6`)
  ya cubre esa sesión. Lo que falta es que la sesión nueva se escriba como
  `claude:<id>` con el modelo `anthropic/<modelo>`, y que un test fije esa garantía con
  el caso real.
- Causa raíz confirmada, tres causas independientes: (1) no existe un lector de
  `~/.claude/projects/<carpeta>/<id>.jsonl`, así que ningún ticket de Claude Code
  puede tener sesiones; (2) la vista condiciona las compuertas a que haya sesiones,
  aunque son un dato propio del harness; (3) el contrato del consumo no tiene un
  prefijo para Claude Code, así que la fuente no puede apuntar de verdad a la
  sesión. Se comprobó en vivo con la API del Mission Control del PO.
- Evidencia medida en la transcripción real (sesión `9d55ce3b…`, no supuesta): cada
  línea de asistente trae un solo bloque y repite el `message.id` y el `usage` del
  mensaje entero (323 líneas para 106 mensajes; sumar líneas infla el consumo ~3
  veces); el `cwd` cambia dentro de la misma sesión (el agente entró a `/private/tmp`
  y a su carpeta de memoria); y la transcripción lleva todo lo que el agente leyó: la
  sesión «menciona» 28 tickets porque abrió `AGENTS.md` y la memoria, y trabajó uno.
  Los subagentes viven en `<carpeta>/<id>/subagents/agent-*.jsonl` con el mismo
  `sessionId`; las sesiones de worktrees, en `<proyecto>--claude-worktrees-<nombre>`.
  No hay `message.id` repetidos entre sesiones distintas (10.415 mensajes revisados).
- Relación causa-síntoma: sin lector, la API devuelve 0 sesiones; con 0 sesiones la
  vista descarta las compuertas que sí llegaron. Las dos causas se suman para que un
  ticket cuyas compuertas existen se vea como si no tuviera ningún dato.
- Decisiones de diseño con evidencia (el PO las ratifica al aprobar el plan):
  pertenencia al ticket por lo que la sesión **escribió** en el registro (MCP con
  `id`/`ticket`, o subcomando del CLI que escribe) o, si no escribió, por lo que el
  usuario le pidió; mencionar no atribuye. Una sesión de diagnóstico que solo corrió
  `valmen resume --id` sobre tres tickets salió como compartida con la primera
  versión (criterio de Hermes: cualquier comando del CLI), y la foto de consumo le
  habría escrito una entrada a un ticket que no trabajó, en un bloque que no se
  reescribe. Entrada = sin caché + creación de caché; el razonamiento ya va dentro de
  `output_tokens` (`reasoningTokens: 0`, o se contaría dos veces); el total registrado
  excluye la caché leída, como en el resto de fuentes. Coste `null`: plan Max, no hay
  precio por token.
- Riesgos y compatibilidad: solo lectura de `~/.claude/projects` (no se escribe en
  las transcripciones); los campos nuevos de la API son aditivos y `source` admite un
  valor más; opencode, codex y Hermes no cambian su lectura (solo se exportan tres
  funciones de `hermes.ts`). Cambio de comportamiento deliberado: sin base de
  opencode, la línea de tiempo une codex, Claude Code y Hermes en vez de quedarse con
  la primera fuente que da datos. El rendimiento se mide con datos reales: 150 ms con
  filtro de ticket sobre 173 MB de transcripciones, 685 ms sin filtro. La heurística
  de atribución puede dar falsos negativos (una sesión que no escribió el registro y
  cuyo prompt no nombra el ticket), que es el error barato; el falso positivo escribe
  en un bloque append-only y es el que se evita. Se mantiene un `AGENTS.md` coherente
  con la plantilla (test `dogfooding-registro`).
- Impactos de sync, migración, Docker o despliegue: ninguno; es lectura de archivos
  locales, un prefijo más en una validación de texto y cambios de interfaz. No hay
  migración de datos ni cambio en contenedores. Se requiere reiniciar Mission Control
  para cargar el build nuevo.

## Plan

- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan;
  autorización: «Si dale te apruebo», Juan Andrade, 2026-10-05, en la conversación de
  esta sesión, tras ver el plan y los recibos `plan-1` —bloqueado— y `plan-2` —aprobado
  por la cascada—). **Este plan describe el cambio ya escrito en el árbol de trabajo,
  sin commitear**: el PO lo pidió en modo directo antes de registrar el ticket, y la
  aprobación lo ratifica. Los commits esperan además su orden.
- Alcance: pintar las compuertas sin sesiones; leer las transcripciones de Claude
  Code en la línea de tiempo y en la foto de consumo; admitir el prefijo `claude:`.
  Exclusiones: la lectura de opencode, codex y Hermes (solo se exportan tres
  funciones de `hermes.ts`); el desglose harness/exploración de opencode, que mezcla
  todo el proyecto con un solo ticket (hallazgo aparte, chip `task_14cd1de3`); PowerShell
  y Windows; deduplicar entre sesiones reanudadas (0 solapes en los datos reales).
- Pasos ordenados (cada pieza con sus tests, y un commit por pieza cuando el PO lo ordene):
  1. **Interfaz.** En `packages/server/web/index.html`, `pintarLineaDeTiempo`:
     extraer `tablaDeCompuertas` y pintarla con 0 sesiones y con `available: false`;
     el aviso «Ninguna sesión trabajó este ticket» nombra a Claude Code. En
     `packages/server/src/server.ts`, `GET /api/timeline`: el cuerpo `available: false`
     también lleva `compuertas`. Test: `tests/linea-de-tiempo-interfaz.test.ts`.
  2. **Lector.** Exportar `nombreDeHerramienta`, `segmentoInvocaCli` y
     `subcomandoDeValmen` en `packages/server/src/hermes.ts` (solo `export`). Crear
     `packages/server/src/claude.ts` con `leerSesionesDeClaude`: carpetas
     `~/.claude/projects/<proyecto>` y `<proyecto>--claude-worktrees-*` confirmadas por
     el primer `cwd`; filtro por mtime (60 días) y por el id en el texto crudo antes de
     parsear; uso deduplicado por `message.id`; subagentes en `<id>/subagents/`;
     intervenciones `mcp__valmen*__*` y CLI por Bash; atribución por escritura
     (`id`/`ticket` de las herramientas que escriben, subcomandos del CLI que escriben)
     o por pedido del usuario; compartida con más de un ticket; modelo dominante con la
     lista de modelos; `<synthetic>` ignorado.
  3. **Integración.** En `packages/server/src/timeline.ts`: unión `source` con
     `"claude"`, `sesionDeClaude` (proveedor `anthropic`, `costUsd: null`,
     `reasoningTokens: 0`), `lineaSoloDeClaude`, `unirLineas` en la rama sin base de
     opencode, bloque de Claude en `consultar`, filtro por ticket y desglose, y en
     `guardarFotoEnTicket` el `base` con el id de la sesión y las notas
     (`detalleDeTokensDeClaude`). En `index.html`: llamadas al registro de Claude en la
     cabecera, «+N» modelos y la compartida sin un cero que se lea «gratis».
     Tests: `tests/claude.test.ts` con `tests/helpers/claude.ts`, y `tests/timeline.test.ts`.
  4. **Prefijo `claude:`.** `FUENTES_DE_CONSUMO` en `packages/engine/src/append.ts`;
     descripción de `registrar_consumo_ia` en `packages/mcp/src/tools.ts`; ayuda en
     `packages/cli/src/main.ts`; texto en `packages/adapter/src/templates.ts` y
     `packages/adapter/src/mcp.ts`; la línea proyectada en `AGENTS.md`; y
     `docs/14-INVENTARIO-TICKETPY.md` y `docs/15-PUESTA-EN-MARCHA.md`. Tests:
     `tests/cierre-consumo.test.ts` y `tests/mcp-server.test.ts`.
  5. **Verificación.** `npm run typecheck` (compila y copia la interfaz a
     `packages/cli/dist/web`), `npx vitest run`, `node scripts/verificar-interfaz.mjs`;
     y contra datos reales, `handleApi` sobre `saiopencloud` y la pantalla con una
     instancia propia en otro puerto.
  6. **Entrega.** Contrato de pruebas al PO y reinicio de Mission Control con el build
     nuevo; el consumo de esta sesión se registra antes de cerrar.
- Cobertura de los criterios (cada uno con su paso y su test):
  C1 (API con sesión `claude`): pasos 2 y 3; `tests/claude.test.ts` y
  `tests/timeline.test.ts`. C2 (mensaje repetido se suma una vez): paso 2;
  `tests/claude.test.ts`. C3 (subagentes): paso 2; `tests/claude.test.ts`. C4
  (worktree y proyecto de nombre parecido): paso 2; `tests/claude.test.ts`. C5 (leer
  o mencionar no atribuye): paso 2; `tests/claude.test.ts`. C6 (compartida fuera de
  los totales): pasos 2 y 3; `tests/claude.test.ts` y `tests/timeline.test.ts`. C7
  (compuertas sin sesiones): paso 1; `tests/linea-de-tiempo-interfaz.test.ts`. C8
  (`claude:<id>` con modelo y proveedor): pasos 3 y 4; `tests/timeline.test.ts`. C9
  (no duplicar, aunque la fuente sea `manual:`): **sin cambio de código**, la
  garantiza `sesionesRegistradas` (diagnóstico); el paso 3 solo asegura que la sesión
  de Claude se identifique por su id, y `tests/timeline.test.ts` la fija con el caso
  real de `CONSUMO-001`. C10 (`registrar_consumo_ia` acepta `claude:<id>` y rechaza
  `claude:`): paso 4; `tests/cierre-consumo.test.ts` y `tests/mcp-server.test.ts`.
  C11 (opencode, codex y Hermes no cambian): paso 5; `npx vitest run`. C12 (el ticket
  de referencia en pantalla): paso 6, validación manual del PO.
- Dependencias y orden de despliegue: ninguna. Las piezas son independientes entre sí
  salvo que la 3 usa lo exportado en la 2 y el prefijo de la 4 lo necesita la foto de
  la 3. Gate aplicable: `plan`. No toca sync, migraciones, contenedores, autenticación
  ni despliegue.
- Rollback: revertir los commits de las cuatro piezas; no se escribe nada fuera del
  repositorio (las transcripciones se leen, no se modifican). Antes de revertir la
  pieza 4 no debe haber entradas `claude:` en tickets abiertos, porque la fuente dejaría
  de reconocerse al escribirlas. Reiniciar Mission Control con el build revertido.

## Criterios de aceptación

- [x] `GET /api/timeline?ticket=<ID>` de un ticket trabajado desde Claude Code devuelve una sesión con `source: "claude"`, el modelo de la transcripción, `costUsd: null`, tokens medidos e intervenciones mayores que cero.
      <!-- test: npx vitest run tests/claude.test.ts tests/timeline.test.ts -->
- [x] Un mensaje del asistente repetido en varias líneas de la transcripción se suma una sola vez.
      <!-- test: npx vitest run tests/claude.test.ts -->
- [x] El gasto de los subagentes de una sesión se suma al de la sesión.
      <!-- test: npx vitest run tests/claude.test.ts -->
- [x] Una sesión abierta en un worktree del proyecto cuenta para el proyecto, y la de un proyecto de nombre parecido no.
      <!-- test: npx vitest run tests/claude.test.ts -->
- [x] Una sesión que solo leyó o mencionó un ticket —al abrir `AGENTS.md`, la memoria o con `valmen resume`— no se atribuye a ese ticket.
      <!-- test: npx vitest run tests/claude.test.ts -->
- [x] Una sesión que escribió el registro de dos tickets es compartida: aparece marcada y no entra en los totales de ninguno.
      <!-- test: npx vitest run tests/claude.test.ts tests/timeline.test.ts -->
- [x] La pantalla del ticket pinta las compuertas aunque ninguna sesión lo haya trabajado.
      <!-- test: npx vitest run tests/linea-de-tiempo-interfaz.test.ts -->
- [x] «Guardar el consumo en el ticket» escribe la sesión de Claude Code con `source: "claude:<id>"` y el modelo con su proveedor.
      <!-- test: npx vitest run tests/timeline.test.ts -->
- [x] «Guardar el consumo en el ticket» no duplica una sesión que el ticket ya tiene con esa referencia, aunque su fuente sea `manual:`.
      <!-- test: npx vitest run tests/timeline.test.ts -->
- [x] `registrar_consumo_ia` acepta `claude:<id>` y rechaza `claude:` sin referencia.
      <!-- test: npx vitest run tests/cierre-consumo.test.ts tests/mcp-server.test.ts -->
- [x] La lectura de opencode, codex y Hermes no cambia: la suite completa sigue en verde.
      <!-- test: npx vitest run -->
- [x] Con el Mission Control reiniciado, el ticket `IMPROVEMENT-POS-MENSAJE-ORDEN-NO-FACTURADA-20261005` muestra su sesión de Claude Code y sus cinco compuertas en «Línea de tiempo y coste».
      <!-- verify: manual -->


## Puntos

```json
[]
```

## Implementación

Se implementó antes de registrar el ticket (modo directo, por su orden) y el plan se
aprobó después, ratificándola. Commiteada el 2026-10-05 por orden del PO («Si dale»), en
cuatro commits que pasan sus tests por separado, en este orden: `8473d74` (pieza 1,
interfaz), `7a59a58` (pieza 2, lector), `a7796e6` (pieza 4, prefijo `claude:`) y `94ca437`
(pieza 3, integración). La integración va al final porque la foto de consumo necesita el
prefijo; el registro del ticket va en un quinto commit. Ninguno está publicado.

**Lo que el commit de integración (`94ca437`) lleva además, y que no es de este ticket:**
se hizo como `ee68d17` y su mensaje se enmendó después, con el mismo árbol, para
describirlo. En el mismo árbol de trabajo corría la sesión del chip `task_14cd1de3`, que
el PO inició para corregir el desglose harness/exploración de opencode (coste de
exploración negativo al pedir un ticket), y su corrección en `timeline.ts` y en
`tests/timeline.test.ts` (3 tests) ya estaba editada cuando se hizo `git add` de esos
archivos, así que entró en ese commit. El plan la excluía y se declara aquí: no se
verificó con los criterios de este ticket. Consecuencias para el registro: `EVIDENCE-001`
hashea el árbol **previo** a esa corrección, y la cifra de «2119 tests» es la de ese
momento; el árbol commiteado da 2122 en verde, también en un worktree aislado.

- Pieza 1, interfaz: `packages/server/web/index.html` (`pintarLineaDeTiempo`:
  `tablaDeCompuertas` se pinta con 0 sesiones y con `available: false`; el aviso nombra a
  Claude Code) y `packages/server/src/server.ts` (el cuerpo `available: false` lleva
  `compuertas`). Test: `tests/linea-de-tiempo-interfaz.test.ts`.
- Pieza 2, lector: `packages/server/src/claude.ts` (nuevo) y tres `export` en
  `packages/server/src/hermes.ts` (`nombreDeHerramienta`, `segmentoInvocaCli`,
  `subcomandoDeValmen`), sin cambiar su lógica. Tests: `tests/claude.test.ts` y
  `tests/helpers/claude.ts`.
- Pieza 3, integración: `packages/server/src/timeline.ts` (unión `source`,
  `sesionDeClaude`, `lineaSoloDeClaude`, `unirLineas`, bloque de Claude en `consultar`,
  filtro por ticket, desglose, `base` y notas de `guardarFotoEnTicket`) y las llamadas al
  registro de Claude en la cabecera de la pantalla. Tests: `tests/timeline.test.ts`.
- Pieza 4, prefijo `claude:`: `packages/engine/src/append.ts`, `packages/mcp/src/tools.ts`,
  `packages/cli/src/main.ts`, `packages/adapter/src/templates.ts`,
  `packages/adapter/src/mcp.ts`, `AGENTS.md` (una línea, proyección de la plantilla),
  `docs/14-INVENTARIO-TICKETPY.md` y `docs/15-PUESTA-EN-MARCHA.md`. Tests:
  `tests/cierre-consumo.test.ts` y `tests/mcp-server.test.ts`.

Revisión final (`revision-final`) y lo que encontró:

- **Corregido, de la misma pieza 2:** la atribución por el CLI contaba cualquier id de un
  segmento que escribe, y esta misma sesión salió compartida con otro ticket porque
  `valmen create --request "…<otro ticket>…"` lo citaba en su texto. Ahora el objetivo de
  un comando del CLI es el valor de `--id` o `--ticket` (`objetivosDelCli`), como en MCP
  es el campo `id` o `ticket`. Dos tests lo fijan y se comprobó que el primero falla sin
  el arreglo.
- **Antes, ya corregido en el mismo trabajo:** una sesión de diagnóstico que solo corrió
  `valmen resume` salía compartida; las lecturas del CLI cuentan como intervención y no
  atribuyen.
- Sin hallazgos bloqueantes. `valmen secrets`: sin secretos. `valmen estandar revisar`:
  sin colores fijos nuevos.
- Observaciones **no bloqueantes**: (1) el lector carga cada transcripción candidata
  entera en memoria (150 ms con filtro de ticket sobre 173 MB; una sesión de cientos de
  MB tardaría y pesaría más); (2) la atribución puede dar falsos negativos —una sesión
  que no escribió el registro y cuyo prompt no nombra el ticket—, que es el error barato;
  (3) la cabecera «coste $0.000000» ya existía para sesiones de suscripción y la
  acompaña «sin coste por token (suscripción)»; (4) el desglose harness/exploración de
  opencode mezcla todo el proyecto con un solo ticket y puede dar un coste de
  exploración negativo: ya existía, queda fuera del plan y tiene su propio chip
  (`task_14cd1de3`); (5) el consumo registrado cubre la sesión hasta el momento de
  entregar a pruebas: los turnos posteriores no se repiten (la foto no duplica por
  `session_reference`).

## Pruebas

Contrato de entrega para el responsable. Todos los comandos desde la raíz del
repositorio (`/Users/juanandrade/Desktop/ValmenHarness`), con Node 24.

Automáticas (el agente las corrió el 2026-10-05):

- `npm run typecheck`: compila y copia la interfaz a `packages/cli/dist/web`; sin salida de
  error.
- `npx vitest run`: **135 archivos y 2119 tests en verde**, 48 saltados como antes (las
  pruebas de equivalencia contra la implementación de referencia).
- `node scripts/verificar-interfaz.mjs`: «Interfaz verificada.» y 11 vistas ejecutadas.
- Por criterio (los mismos comandos que declara cada uno y que corre la compuerta
  `qa-mechanical`): `npx vitest run tests/claude.test.ts tests/timeline.test.ts` (C1, C2, C3,
  C4, C5, C6, C8, C9), `npx vitest run tests/linea-de-tiempo-interfaz.test.ts` (C7) y
  `npx vitest run tests/cierre-consumo.test.ts tests/mcp-server.test.ts` (C10).
- También cubiertos, sin criterio propio porque la compuerta despliega como máximo 12:
  una sesión sin modelo se lee con el modelo vacío y no se registra; sin base de opencode
  se unen codex, Claude Code y Hermes; el aviso de «ninguna sesión» nombra a Claude Code;
  el `AGENTS.md` coincide con la proyección (`tests/dogfooding-registro.test.ts`).
- Contra datos reales (solo lectura, ya corrido): `handleApi` sobre `saiopencloud` devuelve
  para `IMPROVEMENT-POS-MENSAJE-ORDEN-NO-FACTURADA-20261005` una sesión `claude`
  (`9d55ce3b…`, `claude-sonnet-5-5`, `costUsd: null`, 489.681 de entrada nueva, 26,7 M de
  caché leída, 160.643 de salida, 38 intervenciones, 106 mensajes) y las 5 compuertas.

Validación manual (la confirma el PO; sin ella el C12 no se marca):

- Entorno: tu Mission Control sigue sirviendo el backend viejo hasta reiniciarlo. Detenlo
  (hoy es el proceso `valmen … serve --port 4175`) y arráncalo de nuevo con el build que ya
  está compilado, por ejemplo `valmen --root /Users/juanandrade/Desktop/ValMenHarness serve
  --port 4175`. Hace falta `~/.claude/projects` (ahí están las transcripciones); la base
  de opencode es opcional.
- Pasos: (1) abrir en Mission Control el proyecto `saiopencloud` y el ticket
  `IMPROVEMENT-POS-MENSAJE-ORDEN-NO-FACTURADA-20261005`; (2) desplegar «Línea de tiempo y
  coste».
- Resultado esperado: una fila `claude · claude-code · claude-sonnet-5-5 · suscripción` con
  sus intervenciones, la etiqueta «sin coste por token (suscripción)», las cinco
  compuertas, la frase «Las sesiones de Claude Code hicieron N llamada(s) al registro…» y
  ninguna otra sesión de otro ticket. (3) En un ticket que ninguna sesión trabajó, el
  aviso dice «ni de Claude Code» y, si tiene recibos, los muestra igual.
- No hace falta pulsar «Guardar el consumo en el ticket» sobre el ticket de `saiopencloud`:
  ya tiene `CONSUMO-001` con esa sesión y la foto no la duplica (lo fija un test).

Resultado del PO: «si ya lo valide y quedo bien se ve correcto como indicas» — Juan Andrade,
2026-10-05, tras reiniciar Mission Control con el build nuevo y abrir el ticket de
referencia en «Línea de tiempo y coste». Se toma como validación manual comprobada del
C12. El PO no precisó el navegador ni el puerto, y no se asume.

## QA

```json
[
  {
    "id": "QA-001",
    "date": "2026-10-05",
    "build_reference": "worktree:sha256:72a5e0b087f0707d227d3195f7626636e07a79754a8de3c3ba9abce428ed50a1",
    "environment": "Local macOS, Node 24: suite vitest del repo y Mission Control del PO reiniciado con el build nuevo (navegador y puerto sin precisar), datos reales de saiopencloud",
    "result": "pending",
    "findings": [],
    "correction": null,
    "po_confirmation": null
  },
  {
    "id": "QA-002",
    "date": "2026-10-05",
    "build_reference": null,
    "environment": null,
    "result": "approved",
    "findings": [],
    "correction": null,
    "po_confirmation": "«si ya lo valide y quedo bien se ve correcto como indicas» — Juan Andrade, 2026-10-05"
  }
]
```

## Evidencia

```json
[
  {
    "id": "EVIDENCE-001",
    "date": "2026-10-05",
    "kind": "automated-test",
    "description": "Suite completa del repo sobre el árbol final: npx vitest run → 135 archivos y 2119 tests en verde (48 saltados como antes); npm run typecheck sin errores; node scripts/verificar-interfaz.mjs → «Interfaz verificada.» con 11 vistas; compuerta qa-mechanical aprobada con el evaluador command (11 criterios por comando, exit 0). Los tests nuevos se comprobó que fallan sin el cambio (interfaz: 3 de 6; prefijo claude: 3 en engine y mcp; atribución por CLI: 1). Contra datos reales (solo lectura): handleApi sobre saiopencloud devuelve para IMPROVEMENT-POS-MENSAJE-ORDEN-NO-FACTURADA-20261005 la sesión claude 9d55ce3b (claude-sonnet-5-5, costUsd null, 38 intervenciones) y las 5 compuertas. El árbol hasheado son los 19 archivos funcionales del cambio, en orden alfabético y con el encuadre del contrato, incluidos los 4 nuevos sin versionar que la referencia automática del motor deja fuera: AGENTS.md, docs/14-INVENTARIO-TICKETPY.md, docs/15-PUESTA-EN-MARCHA.md, packages/adapter/src/mcp.ts, packages/adapter/src/templates.ts, packages/cli/src/main.ts, packages/engine/src/append.ts, packages/mcp/src/tools.ts, packages/server/src/claude.ts, packages/server/src/hermes.ts, packages/server/src/server.ts, packages/server/src/timeline.ts, packages/server/web/index.html, tests/cierre-consumo.test.ts, tests/claude.test.ts, tests/helpers/claude.ts, tests/linea-de-tiempo-interfaz.test.ts, tests/mcp-server.test.ts, tests/timeline.test.ts.",
    "reference": "worktree:sha256:72a5e0b087f0707d227d3195f7626636e07a79754a8de3c3ba9abce428ed50a1",
    "point_id": null
  },
  {
    "id": "EVIDENCE-002",
    "date": "2026-10-05",
    "kind": "user-report",
    "description": "Validación manual del PO el 2026-10-05, tras reiniciar Mission Control con el build nuevo y abrir el ticket de referencia en «Línea de tiempo y coste»: «si ya lo valide y quedo bien se ve correcto como indicas» (Juan Andrade). Corresponde al criterio C12.",
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
[
  {
    "kind": "ticket-close",
    "id": "CLOSE-001",
    "date": "2026-10-05",
    "technical_summary": "Lector de transcripciones de Claude Code (packages/server/src/claude.ts) integrado en la línea de tiempo y en la foto de consumo (timeline.ts): uso deduplicado por message.id, subagentes y worktrees, atribución por escritura en el registro o por pedido del usuario, sesión compartida fuera de totales, coste null. La pantalla pinta las compuertas aunque no haya sesiones, y el consumo admite el prefijo claude:<id> (append.ts, mcp, CLI, plantilla y AGENTS.md).",
    "functional_summary": "Mission Control muestra, para un ticket trabajado desde Claude Code, la sesión con su modelo, tokens e intervenciones sobre el registro, y sus compuertas aunque no haya sesiones; el consumo de esa sesión se puede registrar en el ticket con un origen verificable sin duplicar. Validado por el PO en pantalla con el ticket de referencia de saiopencloud.",
    "qa_status": "approved",
    "qa_waiver_reason": null,
    "po_confirmation": null,
    "release_impact": "Queda unreleased hasta el próximo despliegue; hay que reiniciar Mission Control para cargar el build. Los cambios están en el árbol de trabajo sin commitear: los commits por pieza esperan la orden del PO."
  }
]
```

## Consumo de IA

```json
[
  {
    "kind": "ai-usage",
    "date": "2026-10-05",
    "session_reference": "836448cb-6734-46e4-bf60-34d18cf2ed6d",
    "model": "anthropic/claude-sonnet-5-5",
    "reasoning_effort": null,
    "notes": "Agente claude-code. 27 intervención(es) sobre el registro, 0 con fallo. 27 de 143 mensajes tocaron el registro. La entrada incluye la creación de caché y la salida incluye el razonamiento. Caché leída 45968432 tokens. Sesión \"Leer sesiones de Claude Code en la línea de tiempo\". Proveedor por suscripción: no hay coste por token, se registran los tokens.",
    "input_tokens": 438591,
    "output_tokens": 216066,
    "total_tokens": 654657,
    "estimated_cost_usd": null,
    "source": "claude:836448cb-6734-46e4-bf60-34d18cf2ed6d",
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
    "at": "2026-10-05T21:36:38.208Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-05",
    "at": "2026-10-05T21:37:24.887Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-05",
    "at": "2026-10-05T21:38:40.892Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-05",
    "at": "2026-10-05T21:43:50.779Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-05",
    "at": "2026-10-05T21:43:53.286Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-05",
    "at": "2026-10-05T21:47:40.368Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-05",
    "at": "2026-10-05T21:47:47.442Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-10-05",
    "at": "2026-10-05T22:00:11.123Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-10-05",
    "at": "2026-10-05T22:00:32.518Z",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-10-05",
    "at": "2026-10-05T22:00:32.723Z",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-002."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-10-05",
    "at": "2026-10-05T22:00:37.614Z",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-10-05",
    "at": "2026-10-05T22:00:37.799Z",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-10-05",
    "at": "2026-10-05T22:00:40.160Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-014",
    "date": "2026-10-05",
    "at": "2026-10-05T22:00:46.150Z",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-015",
    "date": "2026-10-05",
    "at": "2026-10-05T22:00:49.290Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  }
]
```
