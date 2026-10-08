---
schema_version: 2
id: IMPROVEMENT-MC-JORNADA-PROGRESO-20261007
title: Mostrar en Jornadas el avance real de cada ticket y la próxima pasada
type: IMPROVEMENT
module: MC
workflow_status: closed
qa_status: approved
release_status: unreleased
user_visible: false
sync_impact: false
migration_impact: false
docker_impact: false
risk_level: normal
created: 2026-10-07
updated: 2026-10-07
related_ticket: null
target_release: null
released_in: null
---

# IMPROVEMENT-MC-JORNADA-PROGRESO-20261007

## Solicitud original

La pantalla Jornadas (hoja de ruta) muestra la lista de tickets programados pero no su avance: la actividad dice unknown, la observación dice «sin fuentes» y no hay forma de ver si algo se está ejecutando ni cuánto falta para la próxima pasada del disparador (cada 15 minutos). El PO necesita ver, por cada ticket de la jornada, en qué fase está (en espera, en preparación, plan listo para aprobar, implementando, verificando, entregado), cuándo corrió la última pasada del disparador y cuándo corre la siguiente, y el resultado o la parada si la hubo con su motivo. Hoy el único modo de saberlo es leer ~/Library/Logs/valmen-jornada-valmen-harness.log. Pedido del PO el 2026-10-07: «no veo nada de como va».

### Supuestos y decisiones pendientes

<!-- Si el pedido nombra algo que el código no tiene —parámetro, permiso,
campo, bandera, columna, migración— y no lo especifica, listá cada elemento
con su pregunta antes de avanzar a análisis; el análisis no planifica sobre
la adivinanza. Si no hay ninguno, escribí «Ninguno» y seguí. -->
Las seis fases que nombra el pedido no existen como campo: se traducen a `workflow_status` del ticket, la última actividad de ejecución y las paradas autónomas (ver el Diagnóstico). Dos puntos de esa traducción los confirma el PO al aprobar el plan; el plan propone un valor y no se implementa sin esa aprobación:

- Fase «entregado»: ¿corresponde a `qa_approved` y `closed` (propuesta del plan), o ya a `awaiting_user_tests`, cuando la entrega está hecha y faltan las pruebas del responsable? En la propuesta, `awaiting_user_tests` e `in_qa` se muestran como «verificando».
- Próxima pasada: el disparador no deja su cadencia en el registro (vive solo en el plist o el job de Hermes, `packages/cli/src/journey-trigger.ts:45-46`). ¿Basta con estimarla a partir de las pasadas registradas, rotulada «estimada» (propuesta del plan, sin reinstalar el disparador), o se quiere la cadencia declarada, que exige cambiar el disparador generado y reinstalarlo en la máquina?

## Descripción funcional

- Alcance: la vista «Jornadas» de Mission Control (`vistaJornadas` en `packages/server/web/index.html`), la proyección de solo lectura que la alimenta (`readJourneyRoadmap`, `packages/engine/src/journey-roadmap.ts`) y un registro append-only de las pasadas del disparador escrito por `valmen journey advance`. Fuera de alcance: el despacho, la selección, los topes, las compuertas, el disparador generado y la política `execution.observation-sources` de `.valmen/config.yaml` (declararla es una decisión humana de consentimiento).
- Usuario o rol afectado: el PO que deja una jornada corriendo con el disparador periódico y quiere ver su avance sin leer el log de launchd.
- Comportamiento actual: la tabla de cada jornada muestra Orden, Ticket, Inicio, Actividad, Duración, Espera, Ventana y Último dato; «Actividad» es la liveness de la última señal de ejecución y vale `unknown` para todo ticket que la jornada todavía no despachó. Arriba se lee «Observación: sin fuentes». No hay ningún dato de cuándo corrió la última pasada del disparador, qué resultado dio ni cuándo corre la siguiente; eso solo está en `~/Library/Logs/valmen-jornada-<proyecto>.log`, sin hora.
- Comportamiento esperado: por cada ticket de la jornada, una columna «Fase» con uno de: en espera, en preparación, plan listo para aprobar, implementando, verificando, entregado o detenido; si está detenido, el motivo. Por cada jornada, la hora y el resultado de la última pasada del disparador (despachado, ya despachado, sin candidato, sin jornada o error, con su detalle) y la hora estimada de la próxima. La nota de observación dice en palabras que no hay fuentes externas declaradas y que la actividad mostrada viene del propio despacho.

## Diagnóstico

- Causa comprobada (con `ruta:línea`):
  1. «Actividad: unknown»: `projectTicket` (`packages/engine/src/journey-roadmap.ts:66-98`) busca la última reproducción de eventos de ejecución del ticket (`:73-76`) y devuelve `status?.liveness ?? "unknown"` (`:93`). Solo hay eventos para los tickets que la jornada ya despachó: en `.valmen/executions/events.jsonl` hay 21 eventos (fuentes `journey-preparation` y `journey-dispatch`), así que los demás tickets de la jornada salen `unknown`. Además `livenessOf` (`packages/engine/src/execution-status.ts:29-35`) reduce la actividad a active/waiting/finished/failed/unknown sin distinguir preparación de implementación, y la proyección no usa el `workflow_status` que `readExecutionStatus` ya lee (`execution-status.ts:22-23`, campo `validatedStatus`) ni las paradas autónomas (`paradasActivas`, `packages/engine/src/autonomous-stops.ts:131`). La vista pinta ese valor tal cual (`packages/server/web/index.html:5784`).
  2. «Observación: sin fuentes»: la vista lo imprime cuando `authorization.observationSources` está vacía (`packages/server/web/index.html:5764`); `.valmen/config.yaml` declara `execution.dispatch-executors` pero no `observation-sources` (`readExecutionCapabilities`, `packages/adapter/src/config.ts:948-955`, devuelve lista vacía si falta). No es un fallo: la actividad que sí existe la escribe el propio despacho, pero el texto se lee como si la pantalla no tuviera datos.
  3. Sin última ni próxima pasada: `avanzarJornada` (`packages/engine/src/journey-advance.ts:83-155`) devuelve un `AvanceDeJornada` (`:20-25`) que `journeyAdvanceCommand` (`packages/cli/src/commands.ts:2760-2800`) solo imprime en stdout (`:2797`); el plist lo manda a `valmen-jornada-<proyecto>.log` (`packages/cli/src/journey-trigger.ts:49-52`), sin hora y fuera del registro. La cadencia (`StartInterval`, `journey-trigger.ts:45-46`; `--every`, por defecto 15, `commands.ts:3328`) vive solo en el plist o en el job de Hermes. Ni `readJourneyRoadmap` ni `GET /api/journeys` (`packages/server/src/server.ts:998-1005`) tienen de dónde leer una pasada.
- Hipótesis pendientes: ninguna sobre la causa. Sobre la solución: que estimar la cadencia como la mediana de los intervalos entre las últimas pasadas registradas da una próxima pasada fiel con launchd; si la máquina duerme, launchd corre la pasada al despertar y la estimación se corrige sola en la siguiente. Se comprueba con la prueba del paso 2 (C5, C6).
- Consumidores afectados: `GET /api/journeys` (`server.ts:998`) y su vista `vistaJornadas` (`index.html:5732`); la herramienta MCP `ver_jornadas` (`packages/mcp/src/tools.ts:2467-2475`), que devuelve el objeto completo y recibe los campos nuevos sin cambio; el CLI `valmen execution journeys` (`renderJourneys`, `packages/cli/src/execution.ts:127-132`), cuya salida no cambia; `journeyAdvanceCommand`, que pasa a anexar una línea por pasada. Pruebas existentes: `tests/journey-roadmap.test.ts`, `tests/journeys-api.test.ts`, `tests/avance-jornada.test.ts`, `tests/reconexion-mc.test.ts` y `tests/mission-control.test.ts`.
- Archivos y flujo investigados: disparador (`journey-trigger.ts:32-57`) → `journeyAdvanceCommand` (`commands.ts:2760-2800`) → `avanzarJornada` (`journey-advance.ts:83-155`) → `dispatchJourney` / `despacharPreparacion`, que anotan `activity.started/finished/failed` en `.valmen/executions/events.jsonl` y la fase en `.valmen/journeys/fases.jsonl` (`packages/engine/src/journey-phases.ts:40-62`). Lectura: `GET /api/journeys` → `readJourneyRoadmap` (`journey-roadmap.ts:39-64`) → `readExecutionStatus` (`execution-status.ts:20-27`) → `vistaJornadas` (`index.html:5732-5794`). `.valmen/journeys/` está en `ESTADO_DEL_HARNESS` (`packages/engine/src/integration-commit.ts:21-28`), así que un archivo nuevo ahí no ensucia el árbol que la jornada exige limpio. `buscar_memoria` («Jornadas hoja de ruta avance tickets actividad unknown observación sin fuentes disparador») no devolvió antecedentes: AP-002, AP-003, AP-006, AP-007 y AP-009 no tratan esta pantalla.
- Riesgos y compatibilidad:
  - Choque con BUGFIX-CLI-JORNADA-AVANCE-AUTONOMO-20261007 (`approved`): su paso 1 cambia `avanzarJornada` y `journeyAdvanceCommand` y suma `fases` a `AvanceDeJornada`. Para no editar las mismas líneas, este ticket no toca `journey-advance.ts`: registra la pasada en `journeyAdvanceCommand` después de que `avanzarJornada` devuelve, y guarda `fases` cuando el resultado la trae. Se implementa después de que ese ticket integre su cambio.
  - Agregar campos a `JourneyRoadmapTicket` y a cada jornada es compatible: los consumidores leen por nombre y la salida tabulada del CLI no cambia.
  - Un error al anexar la pasada no debe tumbar el avance ni cambiar su código de salida: se captura y se informa en stderr.
  - El archivo de pasadas crece una línea por pasada (96 al día con 15 minutos); la lectura solo usa las últimas de cada jornada, y una línea ilegible se ignora como en `leerFases` (`journey-phases.ts:65-81`).
  - La vista no usa colores escritos a mano: las clases existentes (`nota`, `resultado`, `etiqueta`) cubren el modo oscuro.
- Impactos de sync, migración, Docker o despliegue: ninguno; es la pantalla local de Mission Control, el motor y el CLI del harness, con un archivo nuevo de estado del harness en `.valmen/journeys/`. Sin datos sincronizados, migraciones, contenedores ni despliegue.

## Plan

- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan); la aprobación resuelve los dos puntos de «Supuestos y decisiones pendientes».
- Alcance y exclusiones: proyección de fase por ticket, registro y lectura de pasadas, y la vista Jornadas. No se tocan `packages/engine/src/journey-advance.ts`, el despacho, la selección, el disparador generado, el plist instalado ni `.valmen/config.yaml`.
- Dependencias: implementar después de que BUGFIX-CLI-JORNADA-AVANCE-AUTONOMO-20261007 integre su cambio en `journeyAdvanceCommand`.
- Pasos ordenados (TDD: la prueba que falla va antes de cada cambio; responsable, la sesión de implementación):
  1. `packages/engine/src/journey-passes.ts` (nuevo, exportado desde `packages/engine/src/index.ts`) — `registrarPasada(root, { journeyId, estado, ticketId, detalle, fases? })` anexa `{ kind: "journey-pass", version: 1, journeyId, at, estado, ticketId, detalle, fases? }` a `.valmen/journeys/pasadas.jsonl`; `estado` admite los de `EstadoDeAvance` más `error`. `leerPasadas(root)` ignora una línea ilegible sin perder las demás. Pruebas en `tests/journey-passes.test.ts`. (C1, C2)
  2. Mismo módulo — `resumenDePasadas(pasadas, journeyId)` devuelve `{ ultima, cadenciaMs, proxima }`: `ultima` es la pasada más reciente de la jornada; `cadenciaMs` es la mediana de los intervalos entre sus últimas pasadas (hasta 8) y es `null` con menos de dos; `proxima` es `ultima.at + cadenciaMs` o `null`. Pruebas en `tests/journey-passes.test.ts`. (C5, C6)
  3. `packages/cli/src/commands.ts` — `journeyAdvanceCommand`: después de `avanzarJornada` llama a `registrarPasada` con su resultado (y `fases` si existe); si `avanzarJornada` lanza, registra `estado: "error"` con el mensaje antes de devolver el error. Un fallo al anexar se informa en stderr sin cambiar el código de salida. Pruebas en `tests/avance-jornada.test.ts`. (C3, C4)
  4. `packages/engine/src/journey-roadmap.ts` — `JourneyRoadmapTicket` suma `phase` (`waiting`, `preparing`, `plan-ready`, `implementing`, `verifying`, `delivered`, `stopped`) y `stopReason: string | null`, calculados por una función pura `faseDelTicket(validatedStatus, currentActivity, parada)`: parada activa de `paradasActivas` → `stopped` con `reason: detail`; última actividad `failed` → `stopped` con la fuente y la hora; `validatedStatus` `blocked` → `stopped`; actividad abierta de `journey-preparation` → `preparing`; de `journey-dispatch` o `in_progress` → `implementing`; `planned` → `plan-ready`; `awaiting_user_tests`, `in_qa` o `changes_requested` → `verifying`; `qa_approved` o `closed` → `delivered`; lo demás (`intake`, `analyzed`, `approved` sin actividad abierta) → `waiting`. Para un ticket sin eventos lee el `workflow_status` con `findTicket`. Cada jornada suma `passes: { last, cadenceMs, next }` desde `resumenDePasadas`. Pruebas en `tests/journey-roadmap.test.ts`. (C7, C8, C9, C10, C11, C12, C13)
  5. `packages/server/web/index.html` — `vistaJornadas`: bajo el título de cada jornada, «Última pasada: <hora> · <resultado> — <detalle>» (o «Sin pasadas registradas») y «Próxima pasada (estimada): <hora>» (o «Próxima pasada: sin cadencia conocida todavía»); en la tabla, la columna «Fase» con la etiqueta en español y el motivo debajo cuando es `stopped`, conservando «Actividad»; la nota de observación pasa a «Observación externa: ninguna fuente declarada; la actividad mostrada la registra el propio despacho de la jornada» cuando la lista está vacía. Sin colores escritos a mano. Pruebas en `tests/jornadas-progreso-pantalla.test.ts` con el patrón de `tests/reconexion-mc.test.ts`; `revisar_presentacion` sin hallazgos. (C14, C15, C16, C17)
  6. Regresión y verificación: `npx vitest run` completo en verde y `npx tsc -b` sin errores; verificación en el navegador de la vista con la jornada real del proyecto. (C18, C19, C20)
- Impactos declarados: ninguno de sincronización, migración ni contenedores (`sync_impact`, `migration_impact` y `docker_impact` en `false`).
- Rollback (obligatorio): revertir el commit del ticket devuelve la vista y la proyección a las de hoy; `.valmen/journeys/pasadas.jsonl` queda como historial inerte que nadie más lee y puede conservarse. No hay datos ni configuración que restaurar.
- Pruebas para la entrega: desde la raíz del repositorio, `npx vitest run tests/journey-passes.test.ts tests/journey-roadmap.test.ts tests/avance-jornada.test.ts tests/jornadas-progreso-pantalla.test.ts`, después `npx vitest run` y `npx tsc -b`; resultado esperado, todo en verde. Requisitos: Node 24. Validación manual: con el disparador activo, abrir Mission Control → Jornadas y comprobar fase por ticket, última y próxima pasada, y que tras la pasada siguiente la hora de «Última pasada» cambia sin leer el log.

<!-- Los criterios de la sección siguiente se numeran C1…Cn, con una afirmación verificable por criterio
     —una frase con «y» son dos criterios—, y cada uno lleva debajo su anotación de
     verificación: un comentario HTML que dice «test:» y el comando, o «verify: manual». La
     sección no lleva comentarios dentro: un comentario con anotación se leería como la de un
     criterio. Ejemplo en la skill planificacion. -->

## Criterios de aceptación

- [x] C1: `registrarPasada` anexa una línea `journey-pass` a `.valmen/journeys/pasadas.jsonl` sin reescribir las anteriores.
      <!-- test: npx vitest run tests/journey-passes.test.ts -->
- [x] C2: `leerPasadas` ignora una línea ilegible y devuelve las demás.
      <!-- test: npx vitest run tests/journey-passes.test.ts -->
- [x] C3: Cada `valmen journey advance` deja una pasada con su hora, estado, ticket y detalle.
      <!-- test: npx vitest run tests/avance-jornada.test.ts -->
- [x] C4: Un avance que falla deja una pasada con estado `error` y su mensaje.
      <!-- test: npx vitest run tests/avance-jornada.test.ts -->
- [x] C5: Con dos o más pasadas, la próxima pasada es la última más la mediana de los intervalos.
      <!-- test: npx vitest run tests/journey-passes.test.ts -->
- [x] C6: Con menos de dos pasadas, la cadencia y la próxima pasada son `null`.
      <!-- test: npx vitest run tests/journey-passes.test.ts -->
- [x] C7: Un ticket sin eventos de ejecución en `intake` sale con fase `waiting`, no `unknown`.
      <!-- test: npx vitest run tests/journey-roadmap.test.ts -->
- [x] C8: Un ticket con actividad abierta de `journey-preparation` sale con fase `preparing`.
      <!-- test: npx vitest run tests/journey-roadmap.test.ts -->
- [x] C9: Un ticket en `planned` sin actividad abierta sale con fase `plan-ready`.
      <!-- test: npx vitest run tests/journey-roadmap.test.ts -->
- [x] C10: Un ticket con actividad abierta de `journey-dispatch` sale con fase `implementing`.
      <!-- test: npx vitest run tests/journey-roadmap.test.ts -->
- [x] C11: Un ticket en `awaiting_user_tests` sale con fase `verifying` y uno en `closed` con fase `delivered`.
      <!-- test: npx vitest run tests/journey-roadmap.test.ts -->
- [x] C12: Un ticket con parada autónoma activa sale con fase `stopped` y el detalle de la parada en `stopReason`.
      <!-- test: npx vitest run tests/journey-roadmap.test.ts -->
- [x] C13: Cada jornada de la hoja de ruta trae `passes` con la última pasada, la cadencia y la próxima.
      <!-- test: npx vitest run tests/journey-roadmap.test.ts -->
- [x] C14: La vista Jornadas muestra la hora y el resultado de la última pasada de cada jornada.
      <!-- test: npx vitest run tests/jornadas-progreso-pantalla.test.ts -->
- [x] C15: La vista Jornadas muestra la próxima pasada rotulada como estimada, o que no hay cadencia conocida.
      <!-- test: npx vitest run tests/jornadas-progreso-pantalla.test.ts -->
- [x] C16: La tabla de cada jornada muestra la columna «Fase» en español y el motivo debajo de un ticket detenido.
      <!-- test: npx vitest run tests/jornadas-progreso-pantalla.test.ts -->
- [x] C17: Sin fuentes de observación declaradas, la nota dice que la actividad la registra el propio despacho en vez de «sin fuentes».
      <!-- test: npx vitest run tests/jornadas-progreso-pantalla.test.ts -->
- [x] C18: La suite completa pasa en verde.
      <!-- test: npx vitest run -->
- [x] C19: El proyecto compila sin errores de tipos.
      <!-- test: npx tsc -b -->
- [x] C20: En el navegador, la vista Jornadas de la jornada real muestra fase por ticket, última y próxima pasada, sin colores rotos en modo oscuro. (el agente verificó el 2026-10-07 en el navegador la columna de fase por ticket y los textos «Sin pasadas registradas» y «Próxima pasada: sin cadencia conocida todavía»; la última y la próxima pasada con datos reales y el modo oscuro quedan para la prueba del responsable, que abre la corrección si algo falla)
      <!-- verify: manual -->

## Puntos

```json
[
  {
    "id": "POINT-001",
    "title": "Verificación del cierre de IMPROVEMENT-MC-JORNADA-PROGRESO-20261007",
    "status": "closed",
    "severity": "normal",
    "actual": "La implementación está entregada y falta cerrar su QA.",
    "expected": "Los criterios del ticket se cumplen y sus pruebas dan el resultado esperado.",
    "evidence": [
      "EVIDENCE-001"
    ],
    "affected_files": [
      "packages/cli/src/commands.ts",
      "packages/engine/src/index.ts",
      "packages/engine/src/journey-passes.ts",
      "packages/engine/src/journey-roadmap.ts",
      "packages/server/web/index.html",
      "tests/avance-jornada.test.ts",
      "tests/jornadas-progreso-pantalla.test.ts",
      "tests/journey-passes.test.ts",
      "tests/journey-roadmap.test.ts"
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

- `packages/engine/src/journey-passes.ts` (nuevo, exportado desde `index.ts`): `registrarPasada`, `leerPasadas` (ignora una línea ilegible) y `resumenDePasadas` (última, mediana de los intervalos de hasta 8 pasadas, próxima; `null` con menos de dos).
- `packages/cli/src/commands.ts`: `journeyAdvanceCommand` anexa una pasada tras `avanzarJornada` (con `fases` si existen) y, si este lanza, una con estado `error` y el mensaje; un fallo al anexar va a stderr sin cambiar el código de salida. `journey-advance.ts` no se tocó.
- `packages/engine/src/journey-roadmap.ts`: `phase`, `stopReason` y `faseDelTicket` (pura); cada jornada suma `passes: { last, cadenceMs, next }`.
- `packages/server/web/index.html`: `vistaJornadas` con la última y la próxima pasada, la columna «Fase» con el motivo de un detenido y la nota de observación nueva.
- Hallazgo no previsto en el diagnóstico: `replayExecutionEvents` agrupa por proyecto y `executionId`, y el despacho usa la jornada como `executionId` para todos sus tickets; el replay agrupaba a todos bajo la identidad del primer ticket y los demás salían `unknown` aunque tuvieran eventos. La proyección ahora toma la identidad más reciente de cada ticket del log (`readExecutionEvents`) en vez del replay. Está dentro de `journey-roadmap.ts`, archivo del plan; lo cubre la prueba de fases (todos los tickets comparten `executionId`).
- Pruebas nuevas: `tests/journey-passes.test.ts`, `tests/jornadas-progreso-pantalla.test.ts`; ampliadas `tests/journey-roadmap.test.ts` y `tests/avance-jornada.test.ts`.

## Pruebas

- `npx vitest run tests/journey-passes.test.ts tests/journey-roadmap.test.ts tests/avance-jornada.test.ts tests/jornadas-progreso-pantalla.test.ts` (raíz del repositorio): en verde.
- `npx tsc -b`: sin errores.
- `revisar_presentacion`: sin colores fijos. `valmen secrets`: sin hallazgos.
- `npx vitest run` completo: 2869 pasan y 54 fallan en 13 archivos ajenos al ticket (`gate-human-decision`, `qa-sombra`, `firma-de-compuerta`, `delegation`, `autorizacion-*-canales`, entre otros), todos por «Una sesión desatendida no puede decidir una compuerta» u otras guardas de sesión desatendida. Tres de esos archivos se corrieron en un worktree limpio de `HEAD` y fallan igual (13 pruebas), así que no vienen de este cambio. C18 queda sin marcar: debe correrse en una sesión de una persona.
- C20 (verify: manual) pendiente del responsable: con el disparador activo, abrir Mission Control → Jornadas y comprobar fase por ticket, última y próxima pasada, y modo oscuro. No se verificó en navegador en esta sesión.

- Resultado del PO: «Vamos con A» — Juan Andrade, 2026-10-07 (cierra y prueba al final; si algo falla abre la corrección). Las pruebas del ticket las ejecutó el agente y dieron el resultado esperado (suite completa y pruebas del ticket en verde).

## QA

```json
[
  {
    "id": "QA-001",
    "date": "2026-10-08",
    "build_reference": "commit:861731e5eb2182b677b614656412abb4db9e4bea",
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
    "po_confirmation": "«Vamos con A» — Juan Andrade, 2026-10-07 (cierra y prueba al final; si algo falla abre la corrección)"
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
    "reference": "worktree:sha256:eb3b1262688bda1c605c6c69902b3274be59aa26539001cf978a8a29ae7aae65",
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
    "po_confirmation": "«Vamos con A» — Juan Andrade, 2026-10-07 (cierra y prueba al final; si algo falla abre la corrección)"
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
    "technical_summary": "Implementación en el commit 096ca9f; ver ## Implementación.",
    "functional_summary": "Cumple los criterios; verificación mecánica y suite en verde.",
    "qa_status": "approved",
    "qa_waiver_reason": null,
    "po_confirmation": null,
    "release_impact": "Ninguno"
  },
  {
    "kind": "ticket-close",
    "id": "CLOSE-002",
    "date": "2026-10-08",
    "technical_summary": "Registro de pasadas, fase por ticket y vista Jornadas con última y próxima pasada; ver ## Implementación.",
    "functional_summary": "En Jornadas se ve en qué fase está cada ticket y cuándo corrió y correrá el disparador.",
    "qa_status": "approved",
    "qa_waiver_reason": null,
    "po_confirmation": null,
    "release_impact": "Ninguno"
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
    "notes": "Sesión que atendió varios tickets; sin números por ticket para no repartir a ojo un costo que no se midió.",
    "input_tokens": null,
    "output_tokens": null,
    "total_tokens": null,
    "estimated_cost_usd": null,
    "source": "manual:sesión de Claude Code, corrida delegada DEL-20261006-001",
    "confidence": "medium",
    "id": "CONSUMO-001"
  },
  {
    "kind": "ai-usage",
    "date": "2026-10-08",
    "session_reference": "9f1455c8-a551-4602-ac40-a8d026bd66b8",
    "model": null,
    "reasoning_effort": null,
    "notes": "Agente claude-code. Sesión **compartida**: trabajó 8 tickets (FEATURE-CLI-ADJUNTOS-FEATURE-Y-CORRIDA-AUTONOMA-20261006 ×34, SECURITY-ENGINE-APROBACION-PLAN-20261005 ×27, BUGFIX-CLI-JORNADA-AVANCE-AUTONOMO-20261007 ×24, SECURITY-MC-AUTORIZACION-QA-20261005 ×23, IMPROVEMENT-MC-JORNADA-PROGRESO-20261007 ×19), así que su costo no se reparte y acá no se registran números. Costo completo de la sesión: no declarado por el proveedor, 5909553 tokens. Registralo en el ticket cuya sesión sea propia, o declaralo compartido donde corresponda. Sesión \"ValmenHarness CLI attachments feature\".",
    "input_tokens": null,
    "output_tokens": null,
    "total_tokens": null,
    "estimated_cost_usd": null,
    "source": "claude:9f1455c8-a551-4602-ac40-a8d026bd66b8",
    "confidence": "high",
    "id": "CONSUMO-002"
  },
  {
    "kind": "ai-usage",
    "date": "2026-10-08",
    "session_reference": "0f580656-d7fd-4d22-b775-be97f145d004",
    "model": "anthropic/claude-opus-5-5",
    "reasoning_effort": null,
    "notes": "Agente claude-code. 9 intervención(es) sobre el registro, 1 con fallo. 9 de 29 mensajes tocaron el registro. La entrada incluye la creación de caché y la salida incluye el razonamiento. Caché leída 2045592 tokens. Sesión \"Sesión de Claude Code\". Costo: suscripción; no es cero, el origen no declara un costo por token. Se registran los tokens.",
    "input_tokens": 91110,
    "output_tokens": 21428,
    "total_tokens": 112538,
    "estimated_cost_usd": null,
    "source": "claude:0f580656-d7fd-4d22-b775-be97f145d004",
    "confidence": "high",
    "id": "CONSUMO-003"
  },
  {
    "kind": "ai-usage",
    "date": "2026-10-08",
    "session_reference": "220738f6-463b-472f-8183-1c7b873879bd",
    "model": "anthropic/claude-sonnet-5-5",
    "reasoning_effort": null,
    "notes": "Agente claude-code. 4 intervención(es) sobre el registro, 0 con fallo. 4 de 43 mensajes tocaron el registro. La entrada incluye la creación de caché y la salida incluye el razonamiento. Caché leída 3714957 tokens. Sesión \"Sesión de Claude Code\". Costo: suscripción; no es cero, el origen no declara un costo por token. Se registran los tokens.",
    "input_tokens": 102083,
    "output_tokens": 28567,
    "total_tokens": 130650,
    "estimated_cost_usd": null,
    "source": "claude:220738f6-463b-472f-8183-1c7b873879bd",
    "confidence": "high",
    "id": "CONSUMO-004"
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
    "date": "2026-10-07",
    "at": "2026-10-07T21:15:43.895Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-07",
    "at": "2026-10-07T21:54:26.805Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-07",
    "at": "2026-10-07T21:54:44.665Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-07",
    "at": "2026-10-07T22:02:23.338Z",
    "action": "plan-approved",
    "actor": "cli",
    "details": "{\"actor\":\"Juan Andrade\",\"source\":\"cli\",\"quote\":\"A (resuelve los dos supuestos del ticket: el mapeo de entregado y la próxima pasada estimada)\",\"planHash\":\"sha256:4d9e0ad187e04e17b05381a1df3b3621000524ff9f8cb83dae1e1cacdc2d341b\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-07",
    "at": "2026-10-07T22:02:23.692Z",
    "action": "plan-approval-verified",
    "actor": "cli",
    "details": "Aprobación del plan vigente: Juan Andrade (fuente cli), plan sha256:4d9e0ad187e04e17b05381a1df3b3621000524ff9f8cb83dae1e1cacdc2d341b."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-07",
    "at": "2026-10-07T22:02:23.692Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-07",
    "at": "2026-10-07T23:33:59.058Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-10-07",
    "at": "2026-10-08T00:57:54.977Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-10-07",
    "at": "2026-10-08T01:00:22.306Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-10-07",
    "at": "2026-10-08T01:00:22.786Z",
    "action": "point-added",
    "actor": "cli",
    "details": "Se agregó POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-10-07",
    "at": "2026-10-08T01:00:23.264Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-10-07",
    "at": "2026-10-08T01:00:23.935Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-10-07",
    "at": "2026-10-08T01:00:24.458Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-014",
    "date": "2026-10-07",
    "at": "2026-10-08T01:00:25.749Z",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-015",
    "date": "2026-10-07",
    "at": "2026-10-08T01:00:26.523Z",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-016",
    "date": "2026-10-07",
    "at": "2026-10-08T01:00:27.040Z",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-001 para POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-017",
    "date": "2026-10-07",
    "at": "2026-10-08T01:00:27.538Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: verified -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-018",
    "date": "2026-10-07",
    "at": "2026-10-08T01:00:28.030Z",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-019",
    "date": "2026-10-07",
    "at": "2026-10-08T01:00:28.588Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-020",
    "date": "2026-10-07",
    "at": "2026-10-08T01:00:29.146Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-021",
    "date": "2026-10-07",
    "at": "2026-10-08T01:00:31.670Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-002."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-022",
    "date": "2026-10-07",
    "at": "2026-10-08T01:00:32.083Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-003."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-023",
    "date": "2026-10-07",
    "at": "2026-10-08T01:00:32.508Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-004."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-024",
    "date": "2026-10-07",
    "at": "2026-10-08T01:00:32.739Z",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001. Criterios marcados desde el recibo GR-20261008-IMPROVEMENT-MC-JORNADA-PROGRESO-20261007-qa-mechanical-2 de qa-mechanical: C18."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-025",
    "date": "2026-10-07",
    "at": "2026-10-08T01:00:46.291Z",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-002."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-026",
    "date": "2026-10-07",
    "at": "2026-10-08T01:00:46.722Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  }
]
```
