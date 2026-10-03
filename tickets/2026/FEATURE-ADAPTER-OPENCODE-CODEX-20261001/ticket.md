---
schema_version: 2
id: FEATURE-ADAPTER-OPENCODE-CODEX-20261001
title: Declarar lectores OpenCode y Codex con sus límites
type: FEATURE
module: ADAPTER
workflow_status: closed
qa_status: approved
release_status: unreleased
user_visible: false
sync_impact: false
migration_impact: false
docker_impact: false
risk_level: normal
created: 2026-10-01
updated: 2026-10-03
related_ticket: null
target_release: null
released_in: null
---

# FEATURE-ADAPTER-OPENCODE-CODEX-20261001

## Solicitud original

Parte del sprint: Observar fases, sesiones, modelos y mensajes mediante adaptadores opcionales.
- R-ACT-006: Un ticket ejecutado directamente DEBE ser observable sin tablero ni jornada.
- R-VIV-005: La actualización DEBE usar lecturas acotadas sin releer todas las conversaciones en cada cambio.
- R-CON-005: Los adaptadores DEBEN declarar sus capacidades disponibles y sus límites.
Depende de: FEATURE-ADAPTER-CAPACIDADES-20261001, FEATURE-ENGINE-EVENTOS-PERSISTIDOS-20261001, FEATURE-ENGINE-ENLACE-SESION-EJECUTORA-20261001, FEATURE-ENGINE-RESOLUCION-PROYECTO-20261001.
Viene de una feature descompuesta en sprints; su plan completo está en el tickets.yaml de la feature.

## Referencias de la feature

- Feature: [control-jornadas-ejecucion](../../../.valmen/features/control-jornadas-ejecucion/feature.md).
- Grafo aprobado para materializar: [tickets.yaml](../../../.valmen/features/control-jornadas-ejecucion/tickets.yaml).
- Límites y reparto del alcance: [revisión de descomposición](../../../.valmen/features/control-jornadas-ejecucion/revision-descomposicion.md).
- Spec completa: [actividad/spec.md](../../../.valmen/features/control-jornadas-ejecucion/spec/actividad/spec.md).
- Spec completa: [actualizacion/spec.md](../../../.valmen/features/control-jornadas-ejecucion/spec/actualizacion/spec.md).
- Spec completa: [contrato/spec.md](../../../.valmen/features/control-jornadas-ejecucion/spec/contrato/spec.md).

La cobertura indica la parte del requisito asignada por el grafo; sus otros
tickets colaboran en el resultado completo. Las anotaciones de verificación
se definirán al planificar; esta alta no aprueba el plan ni comprueba criterios.

## Descripción funcional

- Alcance: añadir a `@valmen/adapter` lectores opcionales y de solo lectura para OpenCode y Codex. Ambos reciben una raíz local ya autorizada y un `projectId` portable como ámbito; entregan actividad incremental y referencias de sesión verificables, sin crear enlaces de ejecución ni modificar el registro o los datos del cliente.
- Usuario o rol afectado: los consumidores posteriores de ejecución —servidor, CLI, MCP y Mission Control— que necesiten complementar las señales directas de un ticket con actividad observable de OpenCode o Codex, sin requerir tablero ni jornada.
- Comportamiento actual: `packages/server/src/timeline.ts` consulta las tablas de OpenCode para construir una línea de tiempo y puede leer mensajes históricos para atribuir consumo. `packages/server/src/codex.ts` recorre los últimos sesenta días y, tras filtrar cada archivo por `cwd`, lee su JSONL completo para el consumo. Ninguno expone un contrato incremental de adaptador, un cursor portable ni capacidades declaradas por fuente.
- Comportamiento esperado: un consumidor autorizado recibe cambios posteriores a su cursor desde OpenCode v1/v2 o sesiones Codex modificadas del proyecto indicado, con `SessionReference` cuyo ámbito es el proyecto lógico y no una ruta. Las capacidades declaran que ambos lectores observan actividad, no workflow ni despacho; los mensajes no se exponen mientras el formato no permita separar de manera fiable texto visible de pensamiento, herramientas o secretos.

## Diagnóstico

- Archivos y flujo investigados: `packages/adapter/src/capabilities.ts` define las cuatro capacidades inmutables y `packages/adapter/src/hermes.ts` aporta el patrón de fuente explícita, cursor, `readOnly` y referencia portable. `packages/server/src/timeline.ts` abre `~/.local/share/opencode/opencode.db` de solo lectura; soporta los esquemas heredados `session`/`message` y v2 `session_v2`/`session_message`, pero su consulta de línea de tiempo carga mensajes para atribución. `packages/server/src/codex.ts` encuentra archivos `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl`, lee un encabezado para `cwd` y después el archivo entero para tokens y menciones. `packages/core/src/session-reference.ts` impide usar rutas como `scope`, y `packages/engine/src/execution-sessions.ts` ya conserva un enlace de sesión solo si una capa autorizada lo declara. El cambio se localiza por tanto en los nuevos `packages/adapter/src/opencode.ts` y `packages/adapter/src/codex.ts`, su export en `packages/adapter/src/index.ts` y `tests/adapter-opencode-codex.test.ts`; no corresponde modificar los lectores actuales del servidor.
- Causa raíz confirmada: la solicitud exige que la actividad de un ticket directo sea observable sin tablero y que el refresco no relea conversaciones. Hoy ese consumidor no puede obtener actividad OpenCode/Codex de forma segura porque `packages/adapter/src/index.ts` no exporta lectores para ellas: las únicas implementaciones, `leerLineaDeTiempo` de `packages/server/src/timeline.ts` y `leerSesionesDeCodex` de `packages/server/src/codex.ts`, fueron diseñadas para consumo histórico, no para actualizar actividad. Como resultado, no hay cursor, `SessionReference` ni `AdapterCapabilities` que el consumidor pueda consultar; debe prescindir de esas fuentes o acoplarse al servidor. Reutilizarlas causaría el problema de recursos reportado por R-VIV-005: la primera consulta `message`/`session_message` para atribuir consumo y la segunda carga el JSONL completo de cada sesión del proyecto. La corrección separa la observación incremental en `@valmen/adapter`, conserva CLI/MCP como fuente directa y mantiene rutas locales fuera de la identidad persistida.
- Riesgos y compatibilidad: las bases y archivos pertenecen a clientes externos y se observan sin escritura. OpenCode convive en los dos esquemas concretos que ya lee `packages/server/src/timeline.ts` —`session`/`message` y `session_v2`/`session_message`—, por lo que el adaptador debe reconocer cada uno y declarar incompatibilidad sin inventar actividad; Codex solo puede usar `stat` más el encabezado de `rollout-*.jsonl` para no volver a cargar JSONL completos. Ningún lector infiere ticket, intento o sesión ejecutora a partir de título, texto, hora o `cwd`; la referencia observada requiere un enlace explícito posterior mediante `packages/engine/src/execution-sessions.ts`. La ausencia o incompatibilidad de una fuente es distinta de una fuente sana sin cambios y no afecta CLI/MCP ni los eventos directos ya persistidos.
- Supuestos y decisiones pendientes: el consumidor autorizado construye la fuente con el `projectId` ya resuelto y su raíz local; esa raíz solo se usa para filtrar la instalación local y nunca se persiste en `SessionReference`. Los mensajes quedan declarados no disponibles en esta iteración: OpenCode y Codex no tienen un formato común que permita excluir con certeza pensamiento privado, resultados de herramienta y secretos. Un ticket posterior puede habilitarlos por página para una versión con contrato seguro.
- Impactos de sync, migración, Docker o despliegue: `sync_impact`, `migration_impact` y `docker_impact` son `false`. No se añaden dependencias, red, watchers, polling, contenedores ni migraciones; es una API local y opt-in. La actividad directa persiste en el motor y este ticket solo la complementa con observación externa.

## Plan

- Alcance y exclusiones: crear lectores de actividad de OpenCode y Codex, sus fuentes/cursor/referencias y perfiles de capacidades; quedan fuera la UI, SSE, polling, enlace automático al intento, despacho, reescritura de `timeline.ts`, lectura de contenido de conversaciones, costes nuevos y modificación de bases o archivos de terceros.
- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan). La cascada `GR-20261003-plan` aprobó el 2026-10-03 tras precisar las cuatro capacidades; autorización vigente: «si el análisis o plan quedan en review te autorizo que revises corrijas y vuelvas a intentarlo, si pasa se aprueba el plan directamente».
- Pasos ordenados:
  <!-- Cada paso nombra archivo, símbolo o comando. Un paso que no dice dónde ni
       con qué se toca no se puede ejecutar ni revisar, y la compuerta lo lee así. -->
  1. Crear `packages/adapter/src/opencode.ts` con `OpenCodeReadSource`, validación de `projectId`/raíz local, `openCodeSessionReference`, cursor estable y `openCodeAdapterCapabilities`. Implementar `readOpenCodeChanges` sobre SQLite en `readOnly: true`, con consultas limitadas y ordenadas por `(time_created, id)` para los pares `session`/`message` y `session_v2`/`session_message`; devolver solo metadatos de actividad, modelo y referencia, sin seleccionar `data`, `part` ni contenido de mensajes.
  2. Crear `packages/adapter/src/codex.ts` con fuente explícita, referencia, cursor por `(mtime, ruta relativa)` y `codexAdapterCapabilities`. Implementar `readCodexChanges` recorriendo únicamente las carpetas fechadas acotadas, inspeccionando metadatos de archivos y el encabezado fijo de candidatos posteriores al cursor para validar el `cwd`; no cargar JSONL completos ni publicar sus líneas.
  3. En ambos módulos, declarar `observe-states` y `dispatch` no disponibles, `read-activity` disponible con sus límites de versión/formato y `read-messages` no disponible con la razón de privacidad y contrato de datos. Base ausente, `node:sqlite` no disponible o esquema incompatible devuelve su estado explícito y una colección vacía, sin alterar las demás fuentes.
  4. Exportar los módulos desde `packages/adapter/src/index.ts`, manteniendo sin cambios los lectores de consumo de `packages/server/src/timeline.ts` y `packages/server/src/codex.ts`. La capa posterior decide si enlaza una referencia observada mediante `linkExecutionSession`; este lector no atribuye por semejanza.
  5. Añadir `tests/adapter-opencode-codex.test.ts` con instalaciones temporales para v1 y v2 de OpenCode y archivos Codex. Cubrir lectura de solo lectura, cursores y empates, filtro de raíz/proyecto, ausencia e incompatibilidad, exclusión de `data`/JSONL completos, referencias portables y declaraciones de capacidad completas.
  6. Ejecutar desde la raíz `npx vitest run tests/adapter-opencode-codex.test.ts tests/adapter-capabilities.test.ts`, `npm run build` y `npx vitest run`; antes de entregar, correr `valmen gate qa-mechanical --id FEATURE-ADAPTER-OPENCODE-CODEX-20261001` tras anotar los criterios verificados.
- Compatibilidad, orden y reversión: es una API nueva y opt-in; el servidor conserva sus lectores actuales y ningún consumidor existente cambia de ruta. Si una versión no soportada aparece, el adaptador informa incompatibilidad sin convertirla en «sin actividad». Revertir consiste en retirar los exports y módulos nuevos; no hay cursores ni datos externos escritos que eliminar.
- Rollback: eliminar los lectores y sus exports del paquete, manteniendo intactas las bases OpenCode, los JSONL de Codex, los eventos del motor y la línea de tiempo actual.

## Criterios de aceptación

- [x] R-ACT-006: Un ticket ejecutado directamente conserva su actividad por CLI/MCP y puede complementar la observación con una referencia portable de OpenCode o Codex, sin tablero ni jornada ni vínculo inferido.
      <!-- test: npx vitest run tests/adapter-opencode-codex.test.ts -->
- [x] R-VIV-005: La actualización de OpenCode usa cursores y consultas limitadas sin seleccionar mensajes; la de Codex lee solo metadatos y encabezados de archivos posteriores al cursor, sin cargar JSONL completos.
      <!-- test: npx vitest run tests/adapter-opencode-codex.test.ts -->
- [x] R-CON-005: OpenCode y Codex declaran de forma inmutable `observe-states`, `read-activity`, `read-messages` y `dispatch`, con su disponibilidad y limitación explícitas; `observe-states`, mensajes y despacho figuran no disponibles cuando no hay contrato seguro.
      <!-- test: npx vitest run tests/adapter-opencode-codex.test.ts tests/adapter-capabilities.test.ts -->

## Puntos

```json
[]
```

## Implementación

- Se añadieron `packages/adapter/src/opencode.ts` y `packages/adapter/src/codex.ts`, con fuentes construidas desde proyecto y raíz ya autorizados, referencias portables por `projectId`, cursores ordenados y perfiles inmutables de capacidades.
- OpenCode abre su SQLite exclusivamente en `readOnly`, reconoce sus esquemas heredado y v2 y proyecta solo identificadores, hora, agente y modelo. No selecciona `data`, `part` ni contenido de mensajes; la consulta aísla la raíz exacta o sus descendientes, sin incluir una raíz de prefijo parecido.
- Codex enumera solo directorios fechados acotados y usa `stat` más los primeros 4 KiB del encabezado de candidatos posteriores al cursor. No analiza el JSONL completo ni expone conversación; la frontera avanza también sobre candidatos ajenos o incompatibles para no releerlos.
- Ambos adaptadores declaran estados validados, mensajes y despacho como no disponibles con sus límites explícitos. No enlazan automáticamente sesiones a intentos ni cambian los lectores históricos de consumo del servidor.
- Se exportaron ambos módulos desde `packages/adapter/src/index.ts` y se añadió `tests/adapter-opencode-codex.test.ts`, que cubre OpenCode v1/v2, cursores, lectura sin escritura, raíz aislada, referencias, Codex por encabezado y capacidades.

## Pruebas

- Directorio: raíz del repositorio (`/Users/juanandrade/Desktop/ValmenHarness`).
- `npx vitest run tests/adapter-opencode-codex.test.ts tests/adapter-capabilities.test.ts` — pasó: 2 archivos y 9 pruebas. Cubre cursores, esquemas OpenCode v1/v2, lectura SQLite sin escritura, exclusión de contenido privado, raíz de prefijo parecido, encabezados Codex, referencias portables y capacidades completas.
- `npm run build` — pasó: compila los paquetes TypeScript y actualiza el artefacto de interfaz del CLI.
- `npx eslint packages/adapter/src/opencode.ts packages/adapter/src/codex.ts tests/adapter-opencode-codex.test.ts` y `npx prettier --check packages/adapter/src/opencode.ts packages/adapter/src/codex.ts packages/adapter/src/index.ts tests/adapter-opencode-codex.test.ts` — pasaron.
- `npx vitest run` — pasó: 108 archivos y 1.837 pruebas; 1 archivo y 48 pruebas de equivalencia quedaron omitidos por configuración.
- Revisión final: sin hallazgos bloqueantes. Se corrigió y cubrió la condición de aislamiento que impedía que una raíz OpenCode coincidiera con otra de prefijo parecido.
- Validación manual propuesta: con una instalación OpenCode o Codex autorizada, crear o actualizar una sesión del proyecto y consultar dos veces con el cursor anterior; la segunda consulta debe entregar únicamente candidatos posteriores, y la fuente debe indicar mensajes no disponibles sin revelar contenido. No requiere red, credenciales ni modificar archivos del cliente.
- Resultado comunicado por el PO: «si los test que corras pasan se puede pasar a cerrar y hacer commit y push». Las pruebas específicas, compilación, análisis estático, formato, suite completa y la compuerta mecánica pasaron; se autoriza su aprobación determinista y el cierre sin una instalación externa configurada.

## QA

```json
[
  {
    "id": "QA-001",
    "date": "2026-10-03",
    "build_reference": "worktree:sha256:a117fec1ee9f60fe796727cfad546b9e80418ffc4c5704013baf5eff060db1a0",
    "environment": "local-node-24",
    "result": "pending",
    "findings": [],
    "correction": null,
    "po_confirmation": null
  },
  {
    "id": "QA-002",
    "date": "2026-10-03",
    "build_reference": null,
    "environment": null,
    "result": "approved",
    "findings": [],
    "correction": null,
    "po_confirmation": "El PO autorizó cerrar y hacer commit y push si las pruebas ejecutadas pasaban."
  }
]
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
[
  {
    "kind": "ticket-close",
    "id": "CLOSE-001",
    "date": "2026-10-03",
    "technical_summary": "Lectores incrementales OpenCode y Codex con ámbito portable, cursores, capacidades explícitas y sin contenido de conversación.",
    "functional_summary": "Las fuentes opcionales complementan la actividad directa sin tablero ni jornada y declaran sus límites.",
    "qa_status": "approved",
    "qa_waiver_reason": null,
    "po_confirmation": null,
    "release_impact": "Sin publicación, migración ni cambio de infraestructura; API local opt-in."
  }
]
```

## Consumo de IA

```json
[
  {
    "kind": "ai-usage",
    "date": "2026-10-03",
    "session_reference": null,
    "model": null,
    "reasoning_effort": null,
    "notes": "Sesión compartida entre tickets; el consumo agregado no se reparte ni se inventa.",
    "input_tokens": null,
    "output_tokens": null,
    "total_tokens": null,
    "estimated_cost_usd": null,
    "source": "manual:codex-sesion-compartida-20261003",
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
    "date": "2026-10-01",
    "at": "2026-10-01T19:10:44.817Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-03",
    "at": "2026-10-03T17:52:28.754Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-03",
    "at": "2026-10-03T17:54:35.465Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-03",
    "at": "2026-10-03T17:56:32.292Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-03",
    "at": "2026-10-03T17:56:32.470Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-03",
    "at": "2026-10-03T17:56:56.158Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> blocked."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-03",
    "at": "2026-10-03T17:57:48.222Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: blocked -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-10-03",
    "at": "2026-10-03T17:59:14.891Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-10-03",
    "at": "2026-10-03T17:59:15.074Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-10-03",
    "at": "2026-10-03T18:05:50.553Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-10-03",
    "at": "2026-10-03T18:06:05.530Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-10-03",
    "at": "2026-10-03T18:06:05.698Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-10-03",
    "at": "2026-10-03T18:06:05.887Z",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-014",
    "date": "2026-10-03",
    "at": "2026-10-03T18:06:06.046Z",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-015",
    "date": "2026-10-03",
    "at": "2026-10-03T18:06:06.204Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-016",
    "date": "2026-10-03",
    "at": "2026-10-03T18:06:13.497Z",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-017",
    "date": "2026-10-03",
    "at": "2026-10-03T18:06:13.660Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  }
]
```
