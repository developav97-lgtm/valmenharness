---
schema_version: 2
id: FEATURE-SERVER-ACTIVIDAD-AGENTES-20261008
title: Leer qué hace cada subagente de la corrida a partir de sus transcripts
type: FEATURE
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

# FEATURE-SERVER-ACTIVIDAD-AGENTES-20261008

## Solicitud original

Contexto: el PO paró la jornada por launchd (6 tickets en 9 h, un solo carril, 5 despachos fallidos, ~8 rescates a mano) y la reemplaza por una corrida orquestada en sesión: la sesión de Claude Code que el PO abre es el orquestador, y reparte los tickets en subagentes, cada uno en su worktree y rama, con 3 simultáneos por defecto (el PO lo cambia al pedir la corrida). Propuesta aprobada y comparativa con datos: docs/propuesta-corrida-orquestada.md y https://claude.ai/artifact/RvWQx8zH1LZ7e9H6dw6dEN. Decisiones del PO: 3 a la vez por defecto y cambiable con --concurrency N o al pedirlo; worktree por ticket; aprobación según la política por tipo de ticket (automática si hay autorización vigente y el ticket es elegible, en lote para el PO si no; SECURITY y despliegue nunca se aprueban solos); la visibilidad de los agentes se lee de los transcripts de los subagentes, sin instalar pixel-agents. Este ticket: un lector que vigila la carpeta <sesión>/subagents/ de la sesión orquestadora (cada subagente deja agent-<id>.jsonl y agent-<id>.meta.json; packages/server/src/claude.ts ya recorre esos archivos para atribuir consumo) y deduce por agente: ticket (del primer mensaje), descripción, modelo, esfuerzo, rama y carpeta, última herramienta usada con su hora y estado: trabajando (último evento reciente), esperando (más de 60 s sin eventos o permiso pedido) o terminó (último mensaje end_turn); y `GET /api/corrida/agentes` que lo expone, uniendo cada agente con el estado real del ticket en el registro. La fase confirmada viene del registro (registrar_actividad_ejecucion); el lector solo la infiere cuando falta. Solo lectura; los hooks de Claude Code como acelerador son otro ticket posterior.

### Supuestos y decisiones pendientes

<!-- Si el pedido nombra algo que el código no tiene —parámetro, permiso,
campo, bandera, columna, migración— y no lo especifica, listá cada elemento
con su pregunta antes de avanzar a análisis; el análisis no planifica sobre
la adivinanza. Si no hay ninguno, escribí «Ninguno» y seguí. -->
Ninguno.

## Descripción funcional

- Alcance: un lector de solo lectura que, dada la sesión orquestadora de Claude Code, recorre `<sesión>/subagents/` y devuelve una fila por subagente (ticket, descripción, modelo, esfuerzo, rama, carpeta, última herramienta con su hora y estado), y el endpoint `GET /api/corrida/agentes` que la expone uniendo cada agente con el estado real de su ticket en el registro. Fuera de alcance: los hooks de Claude Code, cualquier pantalla, escribir en el registro o en las transcripciones, y despachar o detener agentes.
- Usuario o rol afectado: el PO y el orquestador de la corrida orquestada (`docs/propuesta-corrida-orquestada.md`), que hoy no ven qué hace cada subagente sin abrir su transcript.
- Comportamiento actual: `packages/server/src/claude.ts` recorre los subagentes solo para sumar gasto y atribuir tickets (`archivosDeSubagentes`, `claude.ts:498`); no existe ninguna ruta que diga qué hace cada uno ni su estado.
- Comportamiento esperado: `GET /api/corrida/agentes` devuelve, por agente, `ticket`, `descripcion`, `modelo`, `esfuerzo`, `rama`, `carpeta`, `ultimaHerramienta` (solo el nombre) con `ultimaHerramientaEn`, `estado` (`trabajando` | `esperando` | `termino`), `faseConfirmada` (del registro, o null) y `faseInferida` cuando falta la confirmada, más `ticketEstado` (workflow real del registro). La respuesta no incluye texto de prompts, entradas de herramientas ni resultados: solo metadatos y el nombre de la herramienta.

## Diagnóstico

- Causa comprobada (con `ruta:línea`): es una capacidad que falta, no un defecto. El único código que toca `subagents/` es `archivosDeSubagentes` (`packages/server/src/claude.ts:498`), privado y orientado a consumo; `leerTranscripcion` (`claude.ts:399`) descarta `cwd`, `gitBranch`, `stop_reason` y la hora de cada herramienta. `packages/server/src/server.ts` no tiene ninguna ruta `/api/corrida/*` (las rutas vecinas son `/api/journeys` y `/api/execution-events`, `server.ts:998` y `server.ts:1024`).
- Hipótesis pendientes: (a) el primer mensaje del subagente nombra el ticket con su identificador, igual que lo reconoce `ticketsDeTexto` en `claude.ts`; si no lo nombra, `ticket` queda null y no se adivina. (b) El campo de esfuerzo no está garantizado en el transcript: si falta, `esfuerzo` es null. (c) Un permiso pedido se infiere de un `tool_use` sin `tool_result` posterior; se comprobará con transcripts sintéticos, no con el HOME real.
- Consumidores afectados: `packages/server/src/claude.ts` lo importan `packages/server/src/timeline.ts` y `tests/claude.test.ts`; el cambio ahí solo exporta funciones privadas ya existentes, sin cambiar su comportamiento. `packages/server/src/server.ts` suma una ruta sin tocar las existentes; `tests/api-rutas.test.ts` y `tests/api-fases-api.test.ts` cubren el despachador y deben seguir en verde.
- Archivos y flujo investigados: `packages/server/src/claude.ts` (`carpetasDelProyecto` en 152, `estaDentro` en 178, `leerTranscripcion` en 399, `archivosDeSubagentes` en 498, `leerSesionesDeClaude` en 544); `packages/server/src/server.ts` (`ServerContext`, `readTicket` en 911, patrón de rutas de solo lectura en 993-1040); `packages/engine/src/execution-status.ts` y `packages/engine/src/execution-activity.ts` (actividad del registro por identidad: `readExecutionEvents`, `readExecutionActivity`); `tests/helpers/claude.ts` (`escribirSesionDeClaude` ya escribe `agent-*.jsonl` y `agent-*.meta.json` en carpetas temporales); `docs/propuesta-corrida-orquestada.md` sección 4 (riesgo de ceguera si el subagente no registra actividad). Flujo: la sesión orquestadora es la de transcript más reciente del proyecto con carpeta `subagents/` (o la que indique `?sesion=`); por cada `agent-<id>.jsonl` se lee su `.meta.json` y se recorren sus eventos tolerando líneas cortadas.
- Riesgos y compatibilidad: (1) fuga de datos: la respuesta es una lista blanca de campos y nunca copia contenido del transcript; cubierto por criterio y caso de control. (2) Escritura concurrente de la transcripción: una última línea cortada se ignora, como ya hace `leerTranscripcion`. (3) Rendimiento: las transcripciones pesan megabytes; solo se lee el archivo si cambió su mtime y se cachea por (ruta, mtime, tamaño), y se limita a sesiones con subagentes modificadas en las últimas 24 h. (4) El reloj se inyecta (`ahora`) para que `esperando` (más de 60 s sin eventos) sea determinista. (5) Seguridad de rutas: el `?sesion=` se valida como identificador simple (sin separadores) para no leer fuera de la carpeta de transcripciones; control incluido.
- Impactos de sync, migración, Docker o despliegue: ninguno. Solo lectura, sin migraciones, sin cambios de contenedores ni de contratos existentes; la ruta es nueva y aditiva.

## Plan

- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan).
- Pasos ordenados:
  1. En `packages/server/src/claude.ts` exportar `carpetasDelProyecto`, `estaDentro` y `archivosDeSubagentes` sin cambiar su cuerpo; correr `npx vitest run tests/claude.test.ts` para confirmar que no hay regresión (C10).
  2. Crear packages/server/src/agentes.ts con `leerAgentesDeCorrida(root, { home, ahora, sesion })`: localiza la sesión orquestadora, lee cada `agent-<id>.meta.json` (agentType, description, toolUseId) y recorre el transcript tolerando líneas cortadas para obtener ticket (primer mensaje de usuario), modelo, esfuerzo, `cwd` como carpeta, `gitBranch` como rama, última herramienta con su hora y `stop_reason` (C1 a C6).
  3. En el mismo archivo agregar la derivación de estado con reloj inyectado: `termino` si el último evento del asistente tiene `stop_reason` end_turn, `esperando` si pasaron más de 60 s sin eventos o hay un `tool_use` sin resultado, `trabajando` en otro caso; y la fase inferida solo cuando el registro no trae una (C7, C8, C9).
  4. Agregar a packages/server/src/agentes.ts la unión con el registro: para cada ticket, `readTicket` de `packages/server/src/server.ts` para `ticketEstado` y, si hay proyecto autorizado, `readExecutionActivity` de `packages/engine/src/execution-activity.ts` para `faseConfirmada`; sin proyecto autorizado la fase confirmada es null y no falla (C11, C12).
  5. En `packages/server/src/server.ts` agregar `GET /api/corrida/agentes?sesion=` junto a `/api/journeys`: respuesta con lista blanca de campos, `sesion` validada como identificador simple, 400 si es inválida, 200 con lista vacía si no hay sesión orquestadora (C13, C14, C15).
  6. Crear tests/actividad-agentes.test.ts con carpetas temporales y transcripts sintéticos vía `escribirSesionDeClaude` de `tests/helpers/claude.ts`, sin leer el HOME real, e incluir los casos de control: transcript con texto sensible que no debe aparecer en la respuesta, `?sesion=../x` rechazado, ticket inexistente en el registro, líneas cortadas (C1 a C15).
  7. Correr `npx tsc --noEmit -p tsconfig.json`, `npx vitest run tests/actividad-agentes.test.ts tests/claude.test.ts tests/api-rutas.test.ts tests/api-fases-api.test.ts` y `valmen secrets` (C10, C16).
  8. Entrega: contrato de pruebas con los comandos del paso 7 desde la raíz del repositorio (resultado esperado: todo en verde), validación manual de una petición `GET /api/corrida/agentes` contra `valmen serve` con una corrida real de subagentes, y requisitos de ambiente (Node 24, sin red); el ticket pasa a `awaiting_user_tests` sin commit hasta la confirmación del responsable (C17).
- Impactos declarados: sincronización: ninguno, no hay datos sincronizados ni clientes sin actualizar; migración: ninguna, no hay orden de aplicación ni reversión de datos; contenedores: ninguno, no hay imagen ni publicación. La ruta es aditiva y de solo lectura.
- Rollback (obligatorio): revertir el commit del ticket; retira agentes.ts, la ruta y los `export` agregados en `claude.ts`. No hay datos que deshacer ni migraciones: el lector no escribe en el registro ni en las transcripciones.

<!-- Los criterios de la sección siguiente se numeran C1…Cn, con una afirmación verificable por criterio
     —una frase con «y» son dos criterios—, y cada uno lleva debajo su anotación de
     verificación: un comentario HTML que dice «test:» y el comando, o «verify: manual». La
     sección no lleva comentarios dentro: un comentario con anotación se leería como la de un
     criterio. Ejemplo en la skill planificacion. -->
## Criterios de aceptación

- [x] C1: El lector devuelve una fila por cada `agent-<id>.jsonl` de la sesión orquestadora.
      <!-- test: npx vitest run tests/actividad-agentes.test.ts -->
- [x] C2: Cada fila trae la descripción del `meta.json` del subagente.
      <!-- test: npx vitest run tests/actividad-agentes.test.ts -->
- [x] C3: Cada fila trae el ticket nombrado en el primer mensaje, o null si no lo nombra.
      <!-- test: npx vitest run tests/actividad-agentes.test.ts -->
- [x] C4: Cada fila trae modelo, esfuerzo, rama y carpeta tomados del transcript.
      <!-- test: npx vitest run tests/actividad-agentes.test.ts -->
- [x] C5: Cada fila trae el nombre de la última herramienta usada con su hora.
      <!-- test: npx vitest run tests/actividad-agentes.test.ts -->
- [x] C6: Una línea cortada al final del transcript no impide leer el resto del agente.
      <!-- test: npx vitest run tests/actividad-agentes.test.ts -->
- [x] C7: Un agente con último evento reciente y sin permiso pendiente está `trabajando`.
      <!-- test: npx vitest run tests/actividad-agentes.test.ts -->
- [x] C8: Un agente con más de 60 s sin eventos, o con una herramienta sin resultado, está `esperando`.
      <!-- test: npx vitest run tests/actividad-agentes.test.ts -->
- [x] C9: Un agente cuyo último mensaje tiene `stop_reason` end_turn está `termino`.
      <!-- test: npx vitest run tests/actividad-agentes.test.ts -->
- [x] C10: Exportar las funciones de `claude.ts` no cambia el comportamiento de la lectura de sesiones.
      <!-- test: npx vitest run tests/claude.test.ts -->
- [x] C11: La fila lleva el estado real del ticket leído del registro.
      <!-- test: npx vitest run tests/actividad-agentes.test.ts -->
- [x] C12: La fase confirmada viene del registro de actividad y la inferida solo aparece cuando falta aquella.
      <!-- test: npx vitest run tests/actividad-agentes.test.ts -->
- [x] C13: `GET /api/corrida/agentes` responde 200 con la lista de agentes y 200 con lista vacía si no hay sesión orquestadora.
      <!-- test: npx vitest run tests/actividad-agentes.test.ts -->
- [x] C14: La respuesta no contiene texto de prompts, entradas ni resultados de herramientas del transcript.
      <!-- test: npx vitest run tests/actividad-agentes.test.ts -->
- [x] C15: Un parámetro `sesion` con separadores de ruta se rechaza con 400.
      <!-- test: npx vitest run tests/actividad-agentes.test.ts -->
- [x] C16: El tipado del servidor compila y las rutas existentes siguen respondiendo igual.
      <!-- test: npx tsc --noEmit -p tsconfig.json -->
- [x] C17: Con `valmen serve` y una corrida real, la ruta lista a los subagentes activos.
      <!-- verify: manual -->

## Puntos

```json
[]
```

## Implementación

- `packages/server/src/claude.ts`: se exportan `carpetasDelProyecto`, `estaDentro` y `archivosDeSubagentes` sin tocar su cuerpo.
- `packages/server/src/agentes.ts` (nuevo): `leerAgentesDeCorrida(root, { home, ahora, sesion, paths, project })`. Localiza la sesión orquestadora (la de mayor mtime con carpeta `subagents/`, modificada en las últimas 24 h, o la forzada con `sesion`), lee `meta.json` y recorre cada transcript tolerando líneas cortadas. Cache por (ruta, mtime, tamaño). Estado con reloj inyectado: `termino` (end_turn sin herramienta pendiente), `esperando` (más de 60 s sin eventos o `tool_use` sin resultado), `trabajando`. Esfuerzo: campo `effort` (o `perTurnEffort`) de los eventos del asistente; null si falta.
- `faseConfirmada`: el registro de actividad de ejecución no guarda una «fase» sino estados (`started`, `active`, `waiting`, `finished`, `failed`); se devuelve el último estado registrado para el ticket (mayor cursor), o null sin proyecto autorizado. `faseInferida` (solo si falta la confirmada) se deduce del nombre de la última herramienta: Edit/Write → implementando, Read/Grep/Glob → analizando, Bash → ejecutando, herramientas de compuerta → compuerta.
- `packages/server/src/server.ts`: ruta `GET /api/corrida/agentes?sesion=` junto a `/api/journeys`, con `sesion` validada (`^[A-Za-z0-9_-]{1,128}$`, 400 si no) y `ServerContext.home` opcional para inyectar el HOME en pruebas. La respuesta es una lista blanca de campos.
- `tests/actividad-agentes.test.ts` (nuevo): 21 pruebas con transcripts sintéticos.
- C17 (validación con `valmen serve` y una corrida real) queda sin marcar: es manual y la hace el responsable.

## Pruebas

Desde la raíz del repositorio (Node 24, sin red; ninguna prueba lee el HOME real):

- `npx tsc --noEmit -p tsconfig.json` — esperado: sin errores.
- `npx vitest run tests/actividad-agentes.test.ts tests/claude.test.ts tests/api-rutas.test.ts tests/api-fases-api.test.ts` — esperado: 4 archivos, 67 pruebas en verde.
- `valmen secrets` — esperado: sin secretos.

Validación manual (C17): con una corrida real de subagentes abierta, `valmen serve` y `curl http://127.0.0.1:<puerto>/api/corrida/agentes` debe listar los subagentes activos con su ticket, estado, rama y última herramienta; `?sesion=<id>` fuerza otra sesión y `?sesion=../x` devuelve 400.

Resultado de la corrida del implementador: todo en verde (67 pruebas; tsc limpio; secretos limpios). La suite completa no se corrió (la corre el orquestador al integrar).

- Verificación 2026-10-08: con `valmen serve` real, `GET /api/corrida/agentes` lista los subagentes de esta sesión (48) y `?sesion=../x` responde 400.

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
    "date": "2026-10-08",
    "session_reference": null,
    "model": "anthropic/claude-sonnet-5-5",
    "reasoning_effort": null,
    "notes": "Subagente de Claude Code dedicado solo a este ticket; la sesión no expone agregado de tokens",
    "input_tokens": null,
    "output_tokens": null,
    "total_tokens": null,
    "estimated_cost_usd": null,
    "source": "manual:subagente",
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
    "at": "2026-10-08T13:44:12.328Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-08",
    "at": "2026-10-08T15:00:23.642Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-08",
    "at": "2026-10-08T15:00:52.627Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-08",
    "at": "2026-10-08T15:23:56.042Z",
    "action": "plan-approved",
    "actor": "cli",
    "details": "{\"actor\":\"Juan Andrade\",\"source\":\"cli\",\"quote\":\"La A (aprueba los 9 planes de la corrida orquestada)\",\"planHash\":\"sha256:6bc38a0006b85d9311f3e270cdfeb45bd82890055d1634b3e4aaebb3cdbca233\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-08",
    "at": "2026-10-08T15:23:57.692Z",
    "action": "plan-approval-verified",
    "actor": "cli",
    "details": "Aprobación del plan vigente: Juan Andrade (fuente cli), plan sha256:6bc38a0006b85d9311f3e270cdfeb45bd82890055d1634b3e4aaebb3cdbca233."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-08",
    "at": "2026-10-08T15:23:57.692Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-08",
    "at": "2026-10-08T15:25:34.296Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-10-08",
    "at": "2026-10-08T15:36:32.118Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-10-08",
    "at": "2026-10-08T15:36:41.763Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  }
]
```
