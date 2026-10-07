---
schema_version: 2
id: SECURITY-ENGINE-CIERRE-AUTORIZADO-20260926
title: Cerrar tickets solo con autorización permanente
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
created: 2026-09-26
updated: 2026-10-06
related_ticket: null
target_release: null
released_in: null
---

# SECURITY-ENGINE-CIERRE-AUTORIZADO-20260926

## Solicitud original

Parte del sprint: Ejecutar autonomía acotada con colisiones, evidencia, migraciones e integración controladas.
- R-S5-010: Cierre desatendido con autorización permanente — El cierre de un ticket elegible PUEDE automatizarse **solo** cuando la persona
Depende de: FEATURE-CONFIG-ELEGIBILIDAD-AUTONOMA-20260926, FEATURE-ENGINE-RUN-AUTONOMO-20260926, FEATURE-ENGINE-VALIDAR-PROPOSICIONES-JEV-20260926.
Viene de una feature descompuesta en sprints; su plan completo está en el tickets.yaml de la feature.
Nota del registro (2026-10-06): la línea de R-S5-010 quedó truncada al materializar el ticket. El requisito vigente que la concreta es R-QAAG-001 del spec `s6-qa-agente`: «La QA por agente DEBE requerir una autorización persistida creada por una persona»; declara tipos, módulos, riesgo máximo, cupo diario, vigencia y la frase literal de quien autoriza, solo se crea por un canal que el agente no controla, no tiene herramienta MCP que la cree o la amplíe y se puede revocar con efecto inmediato.


## Descripción funcional

- Alcance: la autorización persistida de QA por agente (R-QAAG-001, que concreta R-S5-010): un registro append-only de autorizaciones que declaran tipos de ticket, módulos, riesgo máximo, cupo diario, vigencia y la **frase literal** de quien autoriza; que solo se crea por un canal que el agente no controla —el CLI de una persona o Mission Control autenticado, este último en el ticket `SECURITY-MC-AUTORIZACION-QA-20261005`—, sin ninguna herramienta MCP que la cree o la amplíe; y que se revoca con efecto desde ese momento. Fuera de alcance: decidir la elegibilidad de un ticket, correr la compuerta `qa-agent`, el cupo consumido y la pantalla de Mission Control.
- Usuario o rol afectado: el responsable que autoriza una vez una política de cierre por agente y puede retirarla cuando quiera, y el agente, que no puede ni crearla ni ampliarla.
- Comportamiento actual: no existe ninguna autorización de QA por agente; el cierre de QA lo aprueba una persona (o la corrida delegada con sus palabras registradas), y no hay un registro de una política permanente ni de su revocación.
- Comportamiento esperado: `valmen qa-authorize create --actor <nombre> --quote "<frase>" --types <a,b> --modules <x,y> --max-risk <nivel> --daily-quota <n> --valid-days <n>` anexa una autorización con un id y un hash de sus campos; solo acepta tipos `BUGFIX`, `IMPROVEMENT`, `CHORE` y `FEATURE` (nunca `SECURITY`, `SYNC`, `INTEGRATION` ni `AGENT`) y riesgo `normal` o menor; se rechaza en una sesión desatendida y desde una fuente no declarada; `qa-authorize revoke --id` anexa la revocación y desde ese instante ninguna consulta la ve vigente; ampliar es crear otra autorización con su propia frase; y no existe una herramienta MCP que cree o amplíe autorizaciones.

## Diagnóstico

- Síntoma: hoy no hay dónde guardar una autorización permanente de QA por agente, así que cerrar un ticket sin una persona delante solo sería posible con una frase suelta o con una clave de configuración editable por el agente. La solicitud original del ticket (R-S5-010) quedó truncada en el registro; su texto completo y vigente es R-QAAG-001 del spec `s6-qa-agente` de esta feature, que es el que se implementa.
- Archivos y flujo investigados: el patrón de un registro append-only con firma y consumo ya existe en `packages/engine/src/approval.ts` (tokens de aprobación remota) y en el registro de paradas `packages/engine/src/autonomous-stops.ts`; la aprobación del plan registrada con actor, fuente, frase y hash y su barrera de sesión desatendida están en `packages/engine/src/plan-approval.ts` (`UNATTENDED_ENV`, `planApprovalSources`); la lectura de configuración por clave con validación es `packages/adapter/src/config.ts`; el catálogo de herramientas MCP y sus anotaciones están en `packages/mcp/src/tools.ts`, con las pruebas que fijan cada nombre en `tests/mcp-server.test.ts` y `tests/mcp-anotaciones.test.ts`; los comandos del CLI se registran en `packages/cli/src/main.ts` y se implementan en `packages/cli/src/commands.ts`; la lista de herramientas de lectura de Hermes está en `packages/server/src/hermes.ts`.
- Causa raíz o hipótesis: la política de cierre por agente no tiene dónde vivir: sin un registro propio, la autorización sería una frase suelta o una clave de configuración que el agente podría editar. Comprobado: no hay referencia a autorizaciones de QA en `packages/*/src`. La seguridad no sale del texto sino de **quién puede escribir el registro**: el agente no tiene herramienta para hacerlo, el CLI se rechaza en sesión desatendida, y la fuente debe estar declarada por el proyecto.
- Riesgos y compatibilidad: es una autoridad permanente que habilita cerrar tickets sin una persona delante; por eso exige tu aprobación del plan. La barrera por entorno es de proceso y no criptográfica, y se complementa con que el registro es append-only, cada autorización lleva su hash y la frase literal queda guardada. La revocación no borra nada: es otro renglón. Consumidores comprobados con búsqueda: no hay lectores previos; el catálogo de herramientas MCP solo cambia en las pruebas que fijan los nombres, y esta funcionalidad **no agrega** ninguna herramienta que escriba autorizaciones (se agrega solo una de lectura). La autorización de un proyecto con QA por agente apagada no tiene efecto: otros tickets deciden cuándo se consulta.
- Impactos de sync, migración, Docker o despliegue: ninguno.

## Plan

- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan), Juan Andrade, 2026-10-06: «si apruebo los planes»; compuerta `plan` aprobada por el evaluador y registrada en su recibo.
- Alcance: el registro de autorizaciones, su creación y revocación por CLI, la barrera para el agente y la herramienta MCP de solo lectura. Exclusiones: elegibilidad, la compuerta `qa-agent`, el cupo consumido y Mission Control.
- Pasos ordenados:
  1. Crear `packages/engine/src/qa-authorization.ts` con el registro append-only `.valmen/qa/authorizations.jsonl`: `crearAutorizacion` (valida actor y frase no vacíos, tipos entre `BUGFIX`, `IMPROVEMENT`, `CHORE` y `FEATURE`, riesgo `low` o `normal`, cupo y vigencia positivos, fuente aceptada y sesión no desatendida; calcula el id y el hash de los campos), `revocarAutorizacion` (exige actor y motivo, la misma fuente aceptada y una sesión no desatendida que `crearAutorizacion`, y anexa la revocación), `autorizacionesVigentes(root, ahora)` y `autorizacionQueCubre(root, ticket, ahora)` (tipo, módulo, riesgo, vigencia y revocación al instante).
  2. En `packages/adapter/src/config.ts` agregar `readQaAuthorizationSources(config)` (clave `qa-authorization-sources`, por defecto `cli` y `mission-control`; vacía o inválida falla nombrando la clave).
  3. En `packages/cli/src/commands.ts` y `packages/cli/src/main.ts` agregar `qa-authorize create`, `qa-authorize revoke` y `qa-authorize list` con su ayuda y las banderas declaradas; `create` y `revoke` salen con el código de invariante en sesión desatendida o desde una fuente no declarada (`--source`).
  4. En `packages/mcp/src/tools.ts` agregar solo la herramienta de lectura `ver_autorizaciones_qa` (anotada de solo lectura) y ajustar las listas y conteos de `tests/mcp-server.test.ts`, `tests/mcp-anotaciones.test.ts` y `packages/server/src/hermes.ts`; ninguna herramienta MCP crea, amplía ni revoca.
  5. Crear `tests/autorizacion-qa.test.ts` con: la creación guarda frase, actor, alcance, vigencia y hash; los tipos prohibidos y el riesgo alto se rechazan; una sesión desatendida y una fuente no declarada se rechazan tanto al crear como al revocar; la revocación vale desde su instante y una autorización vencida no cubre; ampliar es crear otra; el catálogo MCP no tiene ninguna herramienta que escriba autorizaciones; correr esas pruebas, la suite completa con `npx vitest run` y `npx tsc --noEmit -p tsconfig.json`.
- Rollback: revertir el commit del ticket; el registro es un archivo nuevo que nada más lee todavía y revocar equivale a no tener autorizaciones.

## Criterios de aceptación

- [x] La autorización guarda tipos, módulos, riesgo máximo, cupo diario, vigencia y la frase literal de quien autoriza, con su id y su hash
      <!-- test: npx vitest run tests/autorizacion-qa.test.ts -->
- [x] Los tipos `SECURITY`, `SYNC`, `INTEGRATION` y `AGENT` y el riesgo alto se rechazan al crear
      <!-- test: npx vitest run tests/autorizacion-qa.test.ts -->
- [x] Una sesión desatendida y una fuente no declarada no pueden crear ni revocar una autorización
      <!-- test: npx vitest run tests/autorizacion-qa.test.ts -->
- [x] La revocación vale desde ese momento y una autorización vencida no cubre ningún ticket
      <!-- test: npx vitest run tests/autorizacion-qa.test.ts -->
- [x] No existe una herramienta MCP que cree, amplíe o revoque una autorización
      <!-- test: npx vitest run tests/autorizacion-qa.test.ts tests/mcp-server.test.ts -->

## Puntos

```json
[]
```

## Implementación

- `packages/engine/src/qa-authorization.ts` (nuevo): registro append-only `.valmen/qa/authorizations.jsonl`. `crearAutorizacion` guarda tipos (solo `BUGFIX`, `IMPROVEMENT`, `CHORE` y `FEATURE`; nunca `SECURITY`, `SYNC`, `INTEGRATION` ni `AGENT`), módulos concretos (sin comodín), riesgo máximo `low` o `normal`, cupo diario, vigencia, actor, **frase literal**, fuente e id, con un hash de sus campos; `revocarAutorizacion` exige actor y motivo y la misma fuente y sesión atendida que crear, y vale desde su instante; `leerAutorizaciones`, `autorizacionesVigentes` y `autorizacionQueCubre` (tipo, módulo, riesgo, vigencia y revocación). Una edición a mano rompe el hash y la autorización deja de valer; un renglón truncado no borra los anteriores. Ampliar es crear otra, con su propia frase.
- `packages/adapter/src/config.ts` y `packages/engine/src/discovery.ts`: `qa-authorization-sources` (por defecto `cli` y `mission-control`; vacía o inválida falla nombrando la clave) y `qaAuthorizationSources`.
- `packages/cli/src/commands.ts` y `main.ts`: `qa-authorize create`, `revoke` y `list` con su ayuda y banderas; crear y revocar salen con el código de invariante en sesión desatendida o desde una fuente no declarada.
- `packages/mcp/src/tools.ts` y `packages/server/src/hermes.ts`: solo la herramienta de lectura `ver_autorizaciones_qa`; ninguna herramienta MCP crea, amplía ni revoca (lo fija una prueba).
- `tests/autorizacion-qa.test.ts` (nuevo, 19); catálogo MCP a 53 herramientas.

## Pruebas

Desde la raíz del repositorio, Node 24, sin red:

1. `npx vitest run tests/autorizacion-qa.test.ts tests/mcp-server.test.ts tests/mcp-anotaciones.test.ts` — esperado: todas pasan.
2. `npx vitest run` — esperado: 183 archivos pasan y 1 omitido; 2655 pruebas pasan, 0 fallan.
3. `npx tsc --noEmit -p tsconfig.json` — sin salida.
4. Manual (responsable, opcional): `valmen qa-authorize create --actor <tú> --quote "<tus palabras>" --types BUGFIX --modules <módulo>` y `valmen qa-authorize list`; con `VALMEN_UNATTENDED=1` el mismo comando debe rechazarse.

Resultado de la ejecución del agente (2026-10-06): 1–3 dieron lo esperado.

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
    "date": "2026-09-26",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-06",
    "at": "2026-10-07T04:06:16.722Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-06",
    "at": "2026-10-07T04:07:49.998Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-06",
    "at": "2026-10-07T04:12:26.121Z",
    "action": "plan-approved",
    "actor": "cli",
    "details": "{\"actor\":\"Juan Andrade\",\"source\":\"cli\",\"quote\":\"si apruebo los planes\",\"planHash\":\"sha256:09c26842ca2316ab0e9f779f0de290f88749165cca05dd50ec1e7508aa00e959\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-06",
    "at": "2026-10-07T04:12:26.373Z",
    "action": "plan-approval-verified",
    "actor": "cli",
    "details": "Aprobación del plan vigente: Juan Andrade (fuente cli), plan sha256:09c26842ca2316ab0e9f779f0de290f88749165cca05dd50ec1e7508aa00e959."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-06",
    "at": "2026-10-07T04:12:26.373Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-06",
    "at": "2026-10-07T04:12:26.648Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-10-06",
    "at": "2026-10-07T04:22:25.929Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  }
]
```
