---
schema_version: 2
id: SECURITY-ENGINE-AUTORIZACION-APROBACION-20261007
title: Guardar autorizaciones de aprobación firmadas, append-only y revocables
type: SECURITY
module: ENGINE
workflow_status: awaiting_user_tests
qa_status: pending
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

# SECURITY-ENGINE-AUTORIZACION-APROBACION-20261007

## Solicitud original

Parte del sprint: La autorización de aprobación existe, la crea solo una persona por un canal que el agente no controla y se revoca al instante.
- R-APRO-001: La aprobación automática DEBE requerir una autorización persistida creada por una persona
Viene de una feature descompuesta en sprints; su plan completo está en el tickets.yaml de la feature.

Comportamiento esperado: La aprobación automática DEBE requerir una autorización persistida creada por una persona
Comportamiento actual: la spec no lo declara; se establece en el análisis, leyendo el código.

### Fuera de alcance

Lo que el grafo asignó a otros tickets y este no hace:
- R-APRO-001: lo cubre SECURITY-MC-AUTORIZACION-APROBACION-20261007 (Crear y revocar autorizaciones de aprobación desde Mission Control y código firmado)
- R-APRO-001: lo cubre IMPROVEMENT-ADAPTER-CONTRATO-APROBACION-20261007 (Declarar en AGENTS.md la aprobación autónoma y su autorización como acción humana)

### Supuestos y decisiones pendientes

<!-- Si el pedido nombra algo que el código no tiene —parámetro, permiso,
campo, bandera, columna, migración— y no lo especifica, listá cada elemento
con su pregunta antes de avanzar a análisis; el análisis no planifica sobre
la adivinanza. Si no hay ninguno, escribí «Ninguno» y seguí. -->
Ninguno.

## Descripción funcional

- Alcance: guardar la autorización de aprobación automática (R-APRO-001): un registro append-only de autorizaciones que una persona crea por un canal que el agente no controla, con tipos, módulos, riesgo máximo, impactos admitidos de forma explícita, etapa (análisis, plan o ambas), modo (automática en `approve` o con agente revisor), cupo diario, vigencia y su frase literal; revocables al instante; con el cupo diario contado. Fuera de alcance: aplicar la autorización a un ticket (tickets siguientes), el canal de Mission Control y el código firmado (ticket siguiente) y el agente revisor.
- Usuario o rol afectado: el PO, que decide una vez qué planes puede aprobar el código por él; el agente, que no puede crear ni ampliar nada.
- Comportamiento actual: toda aprobación de plan la registra una persona (`packages/engine/src/plan-approval.ts`); no existe una autorización que delegue esa decisión, y el modelo de la autorización de QA (`packages/engine/src/qa-authorization.ts`) prohíbe SYNC, INTEGRATION y AGENT, que aquí el PO pidió admitir.
- Comportamiento esperado: `valmen approval-authorize create|revoke|list` crea, revoca y lista autorizaciones. Una autorización admite los tipos BUGFIX, IMPROVEMENT, CHORE, FEATURE, SYNC, INTEGRATION y AGENT, nunca SECURITY; un impacto de migración, contenedores o despliegue solo se admite si la autorización lo lista; se rechaza en una sesión desatendida y desde una fuente no declarada; lleva un hash que delata una edición a mano; la revocación vale desde ese momento; no existe herramienta MCP que la cree, solo una de lectura.

## Diagnóstico

- Archivos y flujo investigados: el patrón a seguir es la autorización de QA: `crearAutorizacion`, `revocarAutorizacion`, `leerAutorizaciones`, `exigirCanalHumano` y el cupo diario en `packages/engine/src/qa-authorization.ts`; las fuentes aceptadas se leen con `readQaAuthorizationSources` en `packages/adapter/src/config.ts`; la sesión desatendida se detecta con `assertSesionAtendida` en `packages/engine/src/plan-approval.ts`; la herramienta MCP de solo lectura de QA es `ver_autorizaciones_qa` en `packages/mcp/src/tools.ts`; el comando del CLI de QA es `qaAuthorizeCommand` en `packages/cli/src/commands.ts`.
- Causa raíz o hipótesis: la solicitud dice que la spec no declara el comportamiento actual y que se establece leyendo el código; leído el código, el comportamiento actual es que solo una persona puede aprobar un plan y que ninguna estructura expresa una delegación. El síntoma es que no hay dónde guardar una delegación de aprobación hecha por una persona, así que el código no puede aprobar sin hacerse pasar por ella. La causa comprobada es que ninguna estructura persistida expresa «la persona X autorizó aprobar estos tipos, con este alcance, hasta tal fecha». La seguridad no sale del texto sino de quién puede escribir el registro: por eso se repite el diseño ya probado de QA (canal humano declarado, sesión atendida, hash, sin herramienta MCP de escritura) en un registro propio, separado del de QA, para que una autorización de QA nunca se lea como una de aprobación ni al revés.
- Riesgos y compatibilidad: (a) es la pieza que delega una decisión humana, así que cada barrera se prueba; (b) los tipos SYNC, INTEGRATION y AGENT se admiten por pedido explícito del PO, pero con impactos explícitos y sin SECURITY nunca; (c) el registro es append-only con un solo escritor y un hash por autorización; (d) Consumidores comprobados con búsqueda: nadie lee todavía una autorización de aprobación; los tickets siguientes de la feature la consumen sin cambiarla; `readQaAuthorizationSources` y el registro de QA no cambian; (e) un proyecto sin autorizaciones queda como hoy: toda aprobación de plan es de una persona.
- Impactos de sync, migración, Docker o despliegue: ninguno.

## Plan

- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan).
- Alcance: el registro, su lectura, el cupo, el comando de CLI y la herramienta MCP de solo lectura. Exclusiones: Mission Control y el código firmado, aplicar la autorización a un ticket y el agente revisor.
- Pasos ordenados:
  1. En `packages/adapter/src/config.ts` agregar `readApprovalAuthorizationSources` (clave `approval-authorization-sources`; por defecto `cli` y `mission-control`; una lista vacía o un nombre inválido falla) y exportarla.
  2. Crear `packages/engine/src/approval-authorization.ts` con `crearAutorizacionDeAprobacion`, `revocarAutorizacionDeAprobacion`, `leerAutorizacionesDeAprobacion` y `autorizacionDeAprobacionQueCubre`, sobre el registro append-only `.valmen/approval/authorizations.jsonl`: id `APA-AAAAMMDD-<hex>`, tipos (BUGFIX, IMPROVEMENT, CHORE, FEATURE, SYNC, INTEGRATION y AGENT; SECURITY se rechaza con su motivo), módulos, riesgo máximo (`low` o `normal`), impactos admitidos (lista explícita, vacía por defecto), etapas (`analysis`, `plan`), modo (`on-approve` o `reviewer`), cupo diario, vigencia en días, actor, frase literal, fuente y un hash que detecta la edición a mano; solo se crea o revoca desde una fuente declarada y con sesión atendida; la revocación vale desde su instante; con `registrarUsoDeCupoDeAprobacion` y `cupoRestanteDeAprobacion` sobre `.valmen/approval/uses.jsonl`. Exportarlo desde `packages/engine/src/index.ts`.
  3. En `packages/cli/src/commands.ts` y `packages/cli/src/main.ts` agregar `approval-authorize create|revoke|list` con sus banderas y su ayuda, que rechaza una sesión desatendida y una fuente no declarada.
  4. En `packages/mcp/src/tools.ts` agregar la herramienta de solo lectura `ver_autorizaciones_aprobacion`, sin ninguna herramienta que cree, amplíe o revoque, y actualizar `packages/server/src/hermes.ts` y las pruebas que fijan el conteo de herramientas.
  5. Crear `tests/autorizacion-aprobacion.test.ts` con un caso por criterio; correr esas pruebas, `npx vitest run` y `npx tsc --noEmit -p tsconfig.json`.
- Rollback: revertir el commit del ticket; ningún flujo lee todavía el registro nuevo, que es un archivo nuevo.

## Criterios de aceptación

- [x] Una persona crea una autorización con tipos, módulos, riesgo máximo, impactos, etapa, modo, cupo, vigencia y su frase literal, y queda leída con su estado
      <!-- test: npx vitest run tests/autorizacion-aprobacion.test.ts -->
- [x] SECURITY no se puede autorizar, y un impacto de migración, contenedores o despliegue solo se admite si la autorización lo lista
      <!-- test: npx vitest run tests/autorizacion-aprobacion.test.ts -->
- [x] Se rechaza crear o revocar en una sesión desatendida o desde una fuente no declarada
      <!-- test: npx vitest run tests/autorizacion-aprobacion.test.ts -->
- [x] La revocación vale desde ese momento y una edición a mano del registro se detecta por su hash
      <!-- test: npx vitest run tests/autorizacion-aprobacion.test.ts -->
- [x] No existe herramienta MCP que cree, amplíe o revoque una autorización de aprobación; solo hay una de lectura
      <!-- test: npx vitest run tests/autorizacion-aprobacion.test.ts -->
- [x] El cupo diario se cuenta por autorización y se agota
      <!-- test: npx vitest run tests/autorizacion-aprobacion.test.ts -->

## Puntos

```json
[]
```

## Implementación

- `packages/engine/src/approval-authorization.ts` (nuevo): registro append-only `.valmen/approval/authorizations.jsonl` con `crearAutorizacionDeAprobacion`, `revocarAutorizacionDeAprobacion`, `leerAutorizacionesDeAprobacion` y `autorizacionDeAprobacionQueCubre`. Admite BUGFIX, IMPROVEMENT, CHORE, FEATURE, SYNC, INTEGRATION y AGENT, nunca SECURITY; riesgo `low` o `normal`; impactos solo si la autorización los lista; etapas análisis y plan; modo `on-approve` o `reviewer`; cupo diario (`registrarUsoDeCupoDeAprobacion`, `cupoRestanteDeAprobacion` en `uses.jsonl`), vigencia y frase literal, con un hash que delata una edición a mano. Se rechaza en una sesión desatendida y desde una fuente no declarada.
- `packages/adapter/src/config.ts` y `packages/engine/src/discovery.ts`: `readApprovalAuthorizationSources` (`approval-authorization-sources`; por defecto `cli` y `mission-control`) y `approvalAuthorizationSources`.
- `packages/cli/src/commands.ts` y `main.ts`: `valmen approval-authorize create|revoke|list`.
- `packages/mcp/src/tools.ts` y `packages/server/src/hermes.ts`: herramienta de solo lectura `ver_autorizaciones_aprobacion` (54 herramientas); ninguna escribe autorizaciones.
- `tests/autorizacion-aprobacion.test.ts` (nuevo) y ajustes de conteo en `mcp-server`, `mcp-anotaciones` y las dos pruebas de autorización de QA.
- Aplicar la autorización a un ticket, Mission Control y el agente revisor son de los tickets siguientes.

## Pruebas

- Directorio: raíz del repositorio. `npx vitest run tests/autorizacion-aprobacion.test.ts` → 12 pruebas pasan.
- Suite completa: `npx vitest run` → 192 archivos, 2784 pruebas pasan, 48 omitidas. `npx tsc --noEmit -p tsconfig.json` y `npx eslint` sin errores; `valmen secrets` sin hallazgos.
- Manual (responsable): `valmen approval-authorize create --actor … --quote "…" --types BUGFIX --modules pos` y `valmen approval-authorize list`.
<!-- verify: manual -->

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
[]
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
    "at": "2026-10-07T18:03:55.868Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-07",
    "at": "2026-10-07T18:21:46.521Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-07",
    "at": "2026-10-07T18:27:04.582Z",
    "action": "gate-approved",
    "actor": "cli",
    "details": "Gate analysis aprobado por Juan Andrade (recibo GR-20261007-SECURITY-ENGINE-AUTORIZACION-APROBACION-20261007-analysis-2, canal mission-control, decidida 2026-10-07T18:27:04.579Z): A"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-07",
    "at": "2026-10-07T18:27:04.881Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-07",
    "at": "2026-10-07T18:29:54.527Z",
    "action": "plan-approved",
    "actor": "cli",
    "details": "{\"actor\":\"Juan Andrade\",\"source\":\"cli\",\"quote\":\"La A\",\"planHash\":\"sha256:84a5cecf0000061578831a205c7bdf95d030e22a088f536898ee8474c05b36b9\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-07",
    "at": "2026-10-07T18:29:54.828Z",
    "action": "plan-approval-verified",
    "actor": "cli",
    "details": "Aprobación del plan vigente: Juan Andrade (fuente cli), plan sha256:84a5cecf0000061578831a205c7bdf95d030e22a088f536898ee8474c05b36b9."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-07",
    "at": "2026-10-07T18:29:54.828Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-10-07",
    "at": "2026-10-07T18:29:55.103Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-10-07",
    "at": "2026-10-07T18:33:08.530Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  }
]
```
