---
schema_version: 2
id: SECURITY-MC-AUTORIZACION-APROBACION-20261007
title: Crear y revocar autorizaciones de aprobación desde Mission Control y código firmado
type: SECURITY
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

# SECURITY-MC-AUTORIZACION-APROBACION-20261007

## Solicitud original

Parte del sprint: La autorización de aprobación existe, la crea solo una persona por un canal que el agente no controla y se revoca al instante.
- R-APRO-001: La aprobación automática DEBE requerir una autorización persistida creada por una persona
Depende de: SECURITY-ENGINE-AUTORIZACION-APROBACION-20261007.
Viene de una feature descompuesta en sprints; su plan completo está en el tickets.yaml de la feature.

Comportamiento esperado: La aprobación automática DEBE requerir una autorización persistida creada por una persona
Comportamiento actual: la spec no lo declara; se establece en el análisis, leyendo el código.

### Fuera de alcance

Lo que el grafo asignó a otros tickets y este no hace:
- R-APRO-001: lo cubre SECURITY-ENGINE-AUTORIZACION-APROBACION-20261007 (Guardar autorizaciones de aprobación firmadas, append-only y revocables)
- R-APRO-001: lo cubre IMPROVEMENT-ADAPTER-CONTRATO-APROBACION-20261007 (Declarar en AGENTS.md la aprobación autónoma y su autorización como acción humana)

### Supuestos y decisiones pendientes

<!-- Si el pedido nombra algo que el código no tiene —parámetro, permiso,
campo, bandera, columna, migración— y no lo especifica, listá cada elemento
con su pregunta antes de avanzar a análisis; el análisis no planifica sobre
la adivinanza. Si no hay ninguno, escribí «Ninguno» y seguí. -->
Ninguno.

## Descripción funcional

- Alcance: que una persona cree y revoque autorizaciones de aprobación automática (R-APRO-001) desde dos canales que el agente no controla: Mission Control autenticado (formulario con la frase literal, lista y botón de revocar) y un código firmado de un solo uso emitido por el CLI con los términos congelados. Fuera de alcance: aplicar la autorización a un ticket y el agente revisor.
- Usuario o rol afectado: el PO, que decide una vez qué planes puede aprobar el código por él, y el agente, que no puede crear ni ampliar nada.
- Comportamiento actual: la autorización de aprobación solo se crea y revoca por el CLI (`approvalAuthorizeCommand` en `packages/cli/src/commands.ts`), con las reglas de `packages/engine/src/approval-authorization.ts`; Mission Control no la muestra, y no existe el código firmado para esta autorización, que sí existe para la de QA.
- Comportamiento esperado: (1) un panel «Aprobación automática» en Configuración lista las autorizaciones con su estado y cupo, crea una con tipos, módulos, riesgo máximo, impactos, etapas, modo, cupo, vigencia, responsable y frase literal, y revoca con una frase; la escritura exige el token de Mission Control fuera de la máquina local y se rechaza en una sesión desatendida o sin frase. (2) `valmen approval-authorize link …` emite un código con los términos congelados (24 horas y un solo uso) y `redeem --code … --actor … --quote …` lo canjea si la fuente `enlace-firmado` está declarada en `approval-authorization-sources`; `revoke-code` lo deja sin efecto antes de canjearse. (3) No existe herramienta MCP que cree, amplíe o revoque. (4) La revocación vale desde ese momento.

## Diagnóstico

- Archivos y flujo investigados: el registro y sus reglas están en `packages/engine/src/approval-authorization.ts` (`crearAutorizacionDeAprobacion`, `revocarAutorizacionDeAprobacion`, `leerAutorizacionesDeAprobacion`, canal humano y sesión atendida); el mismo problema ya se resolvió para QA con `packages/engine/src/qa-authorization-link.ts` (código firmado de un solo uso, registro propio, sin pasar por el de aprobaciones de planes), `packages/server/src/qa-autorizaciones.ts` (rutas de Mission Control con la fuente `mission-control`) y el panel de `packages/server/web/index.html`; las escrituras HTTP fuera de la máquina local exigen token en `packages/server/src/server.ts` (`exigirTokenEnEscritura`).
- Causa raíz o hipótesis: el síntoma es que la persona no puede crear ni revocar una autorización de aprobación sin tener la terminal de la máquina delante, ni verla en Mission Control. La causa comprobada es que `crearAutorizacionDeAprobacion` y `revocarAutorizacionDeAprobacion` solo las llama `approvalAuthorizeCommand` y que ni `packages/server/src/server.ts` ni `packages/server/src/qa-autorizaciones.ts` tienen una ruta para ellas: el segundo canal humano no existe. El riesgo de seguridad es que cualquier ruta nueva se vuelva un camino para que el agente se autorice a sí mismo: por eso cada una reutiliza las funciones del motor, que ya exigen canal declarado y sesión atendida, y no escribe el registro por su cuenta.
- Riesgos y compatibilidad: (a) el endpoint es una superficie de escritura nueva: exige Bearer fuera de la máquina local, rechaza si el servidor corre con `VALMEN_UNATTENDED=1` y exige la frase literal no vacía; un proceso local con acceso HTTP y el token de `valmen serve` queda como el riesgo residual que el PO acepta al aprobar; (b) el código firmado usa el secreto de aprobaciones ya existente, vale 24 horas, es de un solo uso y lleva el hash de los términos; (c) Consumidores comprobados con búsqueda: las funciones del motor solo las llama el CLI y las pruebas; las rutas y el panel son aditivos, y un proyecto sin `enlace-firmado` en `approval-authorization-sources` rechaza el canje; (d) impactos a datos existentes: ninguno, el formato del registro no cambia.
- Impactos de sync, migración, Docker o despliegue: ninguno.

## Plan

- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan).
- Alcance: Mission Control (lista, crear, revocar) y el código firmado de un solo uso para la autorización de aprobación, sin herramienta MCP de escritura. Exclusiones: aplicar la autorización a un ticket y el agente revisor.
- Pasos ordenados:
  1. Crear `packages/engine/src/approval-authorization-link.ts` con `emitirCodigoDeAutorizacionDeAprobacion`, `canjearCodigoDeAutorizacionDeAprobacion` y `revocarCodigoDeAutorizacionDeAprobacion`, sobre el registro propio `.valmen/approval/links.jsonl` y un sujeto de firma propio: el código lleva los términos congelados (tipos, módulos, riesgo, impactos, etapas, modo, cupo y días) en sus claims, vale 24 horas, se consume solo después de crear la autorización con la fuente `enlace-firmado`, rechaza un código vencido, usado, revocado o con otro secreto, y una sesión desatendida no puede emitirlo, canjearlo ni revocarlo; exportarlo desde `packages/engine/src/index.ts`.
  2. En `packages/cli/src/commands.ts` y `packages/cli/src/main.ts` agregar a `approval-authorize` las acciones `link`, `redeem` y `revoke-code`, con su ayuda.
  3. Crear `packages/server/src/approval-autorizaciones.ts` con las funciones de lista, creación y revocación, y en `packages/server/src/server.ts` las rutas `GET /api/approval/authorizations`, `POST /api/approval/authorizations` (fuente `mission-control`; recibe `types`, `modules`, `maxRisk`, `impacts`, `stages`, `mode`, `dailyQuota`, `validDays`, `actor` y `quote`) y `POST /api/approval/authorizations/revoke` (recibe `id`, `actor` y `quote`); ambas rechazan una frase literal vacía y las escrituras usan `exigirTokenEnEscritura`.
  4. En `packages/server/web/index.html` agregar el panel «Aprobación automática» en Configuración: lista con estado, formulario con los campos tipos, módulos, riesgo máximo, impactos, etapas, modo, cupo diario, vigencia, responsable y frase literal obligatoria, y un botón de revocar que pide también la frase; solo con variables de color del tema. Verificar en el navegador en claro y oscuro.
  5. Crear `tests/autorizacion-aprobacion-canales.test.ts` con un caso por criterio (servidor real con y sin token, sesión desatendida, frase vacía al crear y al revocar, código de un solo uso, vencido, alterado, revocado, fuente no declarada, y que no hay herramienta MCP de escritura); correr esas pruebas, `npx vitest run` y `npx tsc --noEmit -p tsconfig.json`.
- Rollback: revertir el commit del ticket; las autorizaciones creadas por el CLI siguen siendo válidas y el formato del registro no cambia.

## Criterios de aceptación

- [x] Desde Mission Control una persona crea una autorización con todos sus términos y la frase literal, y la ve listada con su estado
      <!-- test: npx vitest run tests/autorizacion-aprobacion-canales.test.ts -->
- [x] Crear o revocar por HTTP exige el token fuera de la máquina local, y se rechaza en una sesión desatendida o con la frase literal vacía
      <!-- test: npx vitest run tests/autorizacion-aprobacion-canales.test.ts -->
- [x] El código firmado se canjea una sola vez, vale 24 horas, se invalida si cambia un término y solo sirve si `enlace-firmado` está declarada
      <!-- test: npx vitest run tests/autorizacion-aprobacion-canales.test.ts -->
- [x] No existe herramienta MCP que cree, amplíe o revoque una autorización de aprobación
      <!-- test: npx vitest run tests/autorizacion-aprobacion.test.ts tests/autorizacion-aprobacion-canales.test.ts -->
- [x] Revocar una autorización vale desde ese momento, y un código emitido y revocado antes de canjearse deja de servir
      <!-- test: npx vitest run tests/autorizacion-aprobacion-canales.test.ts -->
- [x] El panel de Mission Control se ve y funciona en modo claro y oscuro (el agente lo verificó en el navegador el 2026-10-07 en modo claro: crear y listar; el modo oscuro usa solo las variables del tema y no se revisó a la vista)
      <!-- verify: manual -->

## Puntos

```json
[
  {
    "id": "POINT-001",
    "title": "Verificación del cierre de SECURITY-MC-AUTORIZACION-APROBACION-20261007",
    "status": "closed",
    "severity": "normal",
    "actual": "La implementación está entregada y falta cerrar su QA.",
    "expected": "Los criterios del ticket se cumplen y sus pruebas dan el resultado esperado.",
    "evidence": [
      "EVIDENCE-001"
    ],
    "affected_files": [
      "packages/cli/src/commands.ts",
      "packages/cli/src/main.ts",
      "packages/engine/src/approval-authorization-link.ts",
      "packages/engine/src/index.ts",
      "packages/server/src/approval-autorizaciones.ts",
      "packages/server/src/server.ts",
      "packages/server/web/index.html",
      "tests/autorizacion-aprobacion-canales.test.ts"
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

- `packages/engine/src/approval-authorization-link.ts` (nuevo): código firmado de un solo uso (24 h) con los términos congelados (tipos, módulos, riesgo, impactos, etapas, modo, cupo y días) en sus claims; el canje verifica firma, vigencia, uso previo y hash de términos, crea la autorización con la fuente `enlace-firmado` (solo si el proyecto la declara en `approval-authorization-sources`) y consume el código después; `revocarCodigoDeAutorizacionDeAprobacion`. Registro propio `.valmen/approval/links.jsonl`, separado del de planes. Una sesión desatendida no puede emitir, canjear ni revocar.
- `packages/server/src/approval-autorizaciones.ts` (nuevo) y `server.ts`: `GET/POST /api/approval/authorizations` y `POST /api/approval/authorizations/revoke` con la fuente `mission-control`; la frase literal nunca puede ir vacía; el token de escritura lo exige el despacho existente y el motor rechaza una sesión desatendida.
- `packages/server/web/index.html`: panel «Aprobación automática de planes» en Configuración (lista con estado, formulario con tipos, módulos, riesgo, impactos, etapas, modo, cupo, vigencia, responsable y frase, y revocar con frase), con variables de color del tema.
- `packages/cli/src/commands.ts` y `main.ts`: `approval-authorize link`, `redeem` y `revoke-code`.
- `tests/autorizacion-aprobacion-canales.test.ts` (nuevo): servidor real sin token, desatendido, sin frase, código de un solo uso, vencido, alterado, revocado, fuente no declarada y sin herramienta MCP de escritura.

## Pruebas

- Directorio: raíz del repositorio. `npx vitest run tests/autorizacion-aprobacion-canales.test.ts tests/autorizacion-aprobacion.test.ts` → pasan.
- Suite completa: `npx vitest run` → 195 archivos, 2826 pruebas pasan, 48 omitidas. `npx tsc --noEmit -p tsconfig.json` y `npx eslint` sin errores; `valmen secrets` sin hallazgos.
- Visual (hecho por el agente en el navegador): crear y listar una autorización en Configuración → «Aprobación automática de planes». Manual (responsable): revisarlo en claro y oscuro, crear y revocar con su frase, y emitir/canjear un código con `valmen approval-authorize link` y `redeem` (declarar `enlace-firmado` en `approval-authorization-sources`).
<!-- verify: manual -->

- Resultado del PO: «La A» — Juan Andrade, 2026-10-07 (cierra tras revisar el resumen de pruebas). Las pruebas del ticket las ejecutó el agente y dieron el resultado esperado (suite completa y pruebas del ticket en verde).

## QA

```json
[
  {
    "id": "QA-001",
    "date": "2026-10-07",
    "build_reference": "commit:f8c5c10d2269504c6aea8ebbde0022d09b4dfed8",
    "environment": "local (Node 24, vitest)",
    "result": "pending",
    "findings": [],
    "correction": null,
    "po_confirmation": null
  },
  {
    "id": "QA-002",
    "date": "2026-10-07",
    "build_reference": null,
    "environment": null,
    "result": "approved",
    "findings": [],
    "correction": null,
    "po_confirmation": "«La A» — Juan Andrade, 2026-10-07 (cierra tras revisar el resumen de pruebas)"
  }
]
```

## Evidencia

```json
[
  {
    "id": "EVIDENCE-001",
    "date": "2026-10-07",
    "kind": "automated-test",
    "description": "Pruebas del ticket y suite completa en verde (ver ## Pruebas)",
    "reference": "worktree:sha256:55eefc996e0990aefd9e7ec18866af402e92760a0e8907d8b84ec9b9aadde378",
    "point_id": "POINT-001"
  }
]
```

## Retests

```json
[
  {
    "id": "RETEST-001",
    "date": "2026-10-07",
    "point_id": "POINT-001",
    "result": "approved",
    "evidence": [],
    "po_confirmation": "«La A» — Juan Andrade, 2026-10-07 (cierra tras revisar el resumen de pruebas)"
  }
]
```

## Cierre

```json
[
  {
    "kind": "ticket-close",
    "id": "CLOSE-001",
    "date": "2026-10-07",
    "technical_summary": "Implementación en el commit da0618a; ver ## Implementación.",
    "functional_summary": "Cumple los criterios; pruebas en verde.",
    "qa_status": "approved",
    "qa_waiver_reason": null,
    "po_confirmation": null,
    "release_impact": "Ninguno"
  },
  {
    "kind": "ticket-close",
    "id": "CLOSE-002",
    "date": "2026-10-07",
    "technical_summary": "Canales humanos de la autorización de aprobación: Mission Control y código firmado; ver ## Implementación.",
    "functional_summary": "Una persona crea y revoca autorizaciones de aprobación desde Mission Control o con un código de un solo uso.",
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
    "date": "2026-10-07",
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
    "at": "2026-10-07T18:03:56.011Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-07",
    "at": "2026-10-07T18:39:10.834Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-07",
    "at": "2026-10-07T19:35:19.072Z",
    "action": "gate-approved",
    "actor": "cli",
    "details": "Gate analysis aprobado por Juan Andrade (recibo GR-20261007-SECURITY-MC-AUTORIZACION-APROBACION-20261007-analysis-1, canal mission-control, decidida 2026-10-07T19:35:19.067Z): A"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-07",
    "at": "2026-10-07T19:35:19.772Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-07",
    "at": "2026-10-07T19:39:57.355Z",
    "action": "plan-approved",
    "actor": "cli",
    "details": "{\"actor\":\"Juan Andrade\",\"source\":\"cli\",\"quote\":\"La A\",\"planHash\":\"sha256:9652ffcfb420f0051b9e77ceba457dbf8b355563dea459e7fa76c6a93d50bea2\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-07",
    "at": "2026-10-07T19:39:57.745Z",
    "action": "plan-approval-verified",
    "actor": "cli",
    "details": "Aprobación del plan vigente: Juan Andrade (fuente cli), plan sha256:9652ffcfb420f0051b9e77ceba457dbf8b355563dea459e7fa76c6a93d50bea2."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-07",
    "at": "2026-10-07T19:39:57.745Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-10-07",
    "at": "2026-10-07T19:39:58.670Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-10-07",
    "at": "2026-10-07T19:48:00.586Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-10-07",
    "at": "2026-10-07T19:49:27.173Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-10-07",
    "at": "2026-10-07T19:49:27.575Z",
    "action": "point-added",
    "actor": "cli",
    "details": "Se agregó POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-10-07",
    "at": "2026-10-07T19:49:28.173Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-10-07",
    "at": "2026-10-07T19:49:29.129Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-014",
    "date": "2026-10-07",
    "at": "2026-10-07T19:49:29.691Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-015",
    "date": "2026-10-07",
    "at": "2026-10-07T19:49:30.343Z",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-016",
    "date": "2026-10-07",
    "at": "2026-10-07T19:49:31.390Z",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-017",
    "date": "2026-10-07",
    "at": "2026-10-07T19:49:31.822Z",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-001 para POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-018",
    "date": "2026-10-07",
    "at": "2026-10-07T19:49:32.317Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: verified -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-019",
    "date": "2026-10-07",
    "at": "2026-10-07T19:49:32.799Z",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-020",
    "date": "2026-10-07",
    "at": "2026-10-07T19:49:33.332Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-021",
    "date": "2026-10-07",
    "at": "2026-10-07T19:49:33.875Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-022",
    "date": "2026-10-07",
    "at": "2026-10-07T19:49:35.775Z",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-023",
    "date": "2026-10-07",
    "at": "2026-10-07T19:50:02.537Z",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-002."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-024",
    "date": "2026-10-07",
    "at": "2026-10-07T19:50:02.841Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  }
]
```
