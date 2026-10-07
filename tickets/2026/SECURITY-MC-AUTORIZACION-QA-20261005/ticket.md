---
schema_version: 2
id: SECURITY-MC-AUTORIZACION-QA-20261005
title: Crear y revocar autorizaciones desde Mission Control y enlace firmado
type: SECURITY
module: MC
workflow_status: planned
qa_status: pending
release_status: unreleased
user_visible: false
sync_impact: false
migration_impact: false
docker_impact: false
risk_level: normal
created: 2026-10-05
updated: 2026-10-06
related_ticket: null
target_release: null
released_in: null
---

# SECURITY-MC-AUTORIZACION-QA-20261005

## Solicitud original

Parte del sprint: QA por agente en backend bajo autorización firmada, apagada por defecto, en worktree limpio, con criterio HTTP y promoción tras veinte coincidencias en sombra.
- R-QAAG-001: La QA por agente DEBE requerir una autorización persistida creada por una persona
Depende de: SECURITY-ENGINE-CIERRE-AUTORIZADO-20260926.
Viene de una feature descompuesta en sprints; su plan completo está en el tickets.yaml de la feature.

### Supuestos y decisiones pendientes

<!-- Si el pedido nombra algo que el código no tiene —parámetro, permiso,
campo, bandera, columna, migración— y no lo especifica, listá cada elemento
con su pregunta antes de avanzar a análisis; el análisis no planifica sobre
la adivinanza. Si no hay ninguno, escribí «Ninguno» y seguí. -->
Ninguno.

## Descripción funcional

- Alcance: que una persona cree y revoque autorizaciones de QA por agente (R-QAAG-001) desde dos canales que el agente no controla: Mission Control autenticado (formulario con la frase literal, lista y botón de revocar) y un **código firmado de un solo uso** emitido por el CLI con los términos congelados. Fuera de alcance: la elegibilidad (ya hecha), correr la compuerta `qa-agent` y cerrar tickets por política.
- Usuario o rol afectado: el responsable (PO) que decide qué tipos de ticket, módulos, riesgo, cupo y vigencia puede cerrar un agente; el agente, que no puede crear ni ampliar nada.
- Comportamiento actual: la autorización se crea y revoca solo por CLI (`qa-authorize`, `packages/cli/src/commands.ts:2868`), con las reglas de `packages/engine/src/qa-authorization.ts` (canal humano, sesión atendida, fuentes de `qa-authorization-sources`); Mission Control no la muestra y no hay forma de crearla a distancia.
- Comportamiento esperado: (1) en Mission Control, un panel «QA por agente» lista las autorizaciones con su estado (vigente, revocada, vencida) y su cupo, permite crear una con tipos, módulos, riesgo máximo, cupo, vigencia y la frase literal de quien autoriza, y revocarla; la escritura exige el token de Mission Control fuera de la máquina local y se rechaza en una sesión desatendida. (2) `valmen qa-authorize link …` emite un código con los términos congelados (vale 24 horas y una sola vez) y `valmen qa-authorize --code <código> --actor … --quote …` lo canjea si la fuente `enlace-firmado` está declarada en `qa-authorization-sources`; cambiar un solo término invalida el código. (3) No existe ninguna herramienta MCP que cree, amplíe ni revoque; solo `ver_autorizaciones_qa` lee. (4) La revocación vale desde ese momento, también para un código ya emitido.

## Diagnóstico

- Archivos y flujo investigados: `packages/engine/src/qa-authorization.ts` (`crearAutorizacion`, `revocarAutorizacion`, `exigirCanalHumano`, `leerAutorizaciones`); `packages/engine/src/approval.ts:300` (`mintApproval`, `verifyApproval`, `appendApproval`, `readApprovalLog`) y su patrón de código de un solo uso en `packages/engine/src/plan-approval-batch.ts` (`aprobarPlanDeCodigo`: verifica firma, comprueba el hash del estado y consume el código **después** de registrar); las escrituras autenticadas del servidor en `packages/server/src/server.ts` (`exigirTokenEnEscritura`); las tarjetas de políticas en `packages/server/src/politicas.ts` y `packages/server/web/index.html`; la lista de herramientas MCP en `packages/mcp/src/tools.ts` (53, entre ellas solo `ver_autorizaciones_qa` de lectura).
- Causa raíz o hipótesis: el síntoma es que la persona no puede crear ni revocar una autorización sin tener la terminal de la máquina delante, ni verla en Mission Control. La causa comprobada es que `crearAutorizacion` y `revocarAutorizacion` solo las llama `qaAuthorizeCommand` (`packages/cli/src/commands.ts:2868`) y que ni `packages/server/src/server.ts` ni `packages/server/src/politicas.ts` tienen una ruta que las invoque: el segundo canal humano no existe. El riesgo de seguridad es que cualquier ruta nueva de escritura se vuelva un camino para que el agente se autorice a sí mismo: por eso cada una reutiliza `crearAutorizacion` (que ya exige canal declarado y sesión atendida) y no escribe el archivo por su cuenta. Comprobado con búsqueda: ningún código fuera de `qa-authorization.ts` escribe el archivo de autorizaciones del registro de QA.
- Riesgos y compatibilidad: (a) el endpoint de Mission Control es una superficie de escritura nueva: exige Bearer fuera de la máquina local, y una sesión de agente con acceso a `localhost` podría llamarlo, así que además rechaza si `VALMEN_UNATTENDED=1` está en el proceso del servidor y exige la frase literal no vacía; el agente que llega por HTTP local sin token queda como el riesgo residual que el PO debe aceptar al aprobar (el token de `valmen serve` es la barrera). (b) El código firmado usa el secreto de aprobaciones ya existente; es de un solo uso, vence a las 24 horas y lleva el hash de los términos. (c) Archivos que el plan toca además de los de la investigación: `packages/adapter/src/config.ts` (nombre válido de fuente), `packages/cli/src/main.ts` (banderas) y `packages/engine/src/index.ts` (reexportación); son aditivos. Consumidores: `crearAutorizacion` y `revocarAutorizacion` solo los llaman `qaAuthorizeCommand` y las pruebas; las rutas nuevas son aditivas y un proyecto sin `enlace-firmado` en `qa-authorization-sources` rechaza el canje. (d) Impactos a datos existentes: ninguno; el archivo de autorizaciones no cambia de formato.
- Impactos de sync, migración, Docker o despliegue: ninguno.

## Plan

- Gate de plan y aprobación: pendiente
- Alcance: Mission Control (lista, crear, revocar) y el código firmado de un solo uso para la autorización de QA por agente, sin herramienta MCP de escritura. Exclusiones: la elegibilidad, la compuerta `qa-agent`, el cierre por política y cualquier cambio a las reglas de `crearAutorizacion`.
- Pasos ordenados:
  1. Crear `packages/engine/src/qa-authorization-link.ts` con `SUJETO_AUTORIZACION_QA = "qa-authorization"`, `hashDeTerminos(terminos)` (JSON canónico de tipos, módulos, riesgo máximo, cupo y días), `emitirCodigoDeAutorizacion({ paths, secret, terminos, ahora })` con `mintApproval` (vale 24 horas, registra el emitido con `appendApproval`) y `canjearCodigoDeAutorizacion({ paths, secret, codigo, actor, quote, ahora, env })`, que verifica firma y vigencia, compara el hash de los términos, rechaza un código ya consumido, llama a `crearAutorizacion` con la fuente `enlace-firmado` y solo después anexa `approval-consumed`. Agregar `revocarCodigoDeAutorizacion({ paths, codigo, actor, ahora })`, que anexa `approval-consumed` con decisión `reject` y hace que un código emitido y no canjeado deje de servir desde ese momento. Exportarlo desde `packages/engine/src/index.ts` (archivo del motor que ya reexporta cada módulo).
  2. En `packages/adapter/src/config.ts` aceptar `enlace-firmado` como nombre válido en `qa-authorization-sources` (sin agregarlo al defecto: el defecto sigue siendo `cli` y `mission-control`).
  3. En `packages/cli/src/commands.ts` y `packages/cli/src/main.ts` agregar `qa-authorize revoke-code --code <código> --actor …` y `qa-authorize link --types … --modules … --max-risk … --daily-quota … --valid-days …` (imprime el código y sus términos) y `qa-authorize --code <código> --actor … --quote …`; ambos rechazan una sesión desatendida; declarar sus banderas y su ayuda.
  4. En `packages/server/src/politicas.ts` y `packages/server/src/server.ts` agregar `GET /api/qa/authorizations`, `POST /api/qa/authorizations` (crea con la fuente `mission-control`) y `POST /api/qa/authorizations/revoke`; la creación recibe `types`, `modules`, `maxRisk`, `dailyQuota`, `validDays`, `actor` y `quote`; la revocación recibe `id`, `actor` y `quote`, y ambas rechazan una frase literal vacía. Todas las escrituras usan `exigirTokenEnEscritura`, fallan si el servidor corre con `VALMEN_UNATTENDED=1` y devuelven el motivo exacto de cada rechazo.
  5. En `packages/server/web/index.html` agregar el panel «QA por agente» en Configuración: lista con estado y cupo, formulario con los campos tipos, módulos, riesgo máximo, cupo diario, vigencia en días, responsable y frase literal obligatoria, y un botón de revocar que pide también la frase literal; sin colores escritos a mano. Verificar en el navegador con claro y oscuro y correr `valmen presentation`.
  6. Crear `tests/autorizacion-qa-canales.test.ts` con un caso por criterio (canal HTTP con y sin token, sesión desatendida, frase vacía al crear y al revocar, código de un solo uso, código revocado antes de canjearse, código con términos alterados, código vencido, fuente `enlace-firmado` no declarada, revocación inmediata también del código, y que `tools.ts` no expone ninguna herramienta de escritura de autorizaciones); correr esas pruebas, `npx vitest run` y `npx tsc --noEmit -p tsconfig.json`.
- Rollback: revertir el commit del ticket; las autorizaciones ya creadas siguen siendo válidas por el CLI y el formato del archivo no cambia.

## Criterios de aceptación

- [ ] Desde Mission Control una persona crea una autorización con tipos, módulos, riesgo máximo, cupo, vigencia y frase literal, y la ve listada con su estado
      <!-- test: npx vitest run tests/autorizacion-qa-canales.test.ts -->
- [ ] Crear o revocar por HTTP exige el token fuera de la máquina local, y se rechaza en una sesión desatendida o con la frase literal vacía
      <!-- test: npx vitest run tests/autorizacion-qa-canales.test.ts -->
- [ ] El código firmado se canjea una sola vez, vale 24 horas, se invalida si cambia un término y solo sirve si `enlace-firmado` está declarada
      <!-- test: npx vitest run tests/autorizacion-qa-canales.test.ts -->
- [ ] No existe herramienta MCP que cree, amplíe ni revoque una autorización, y el CLI la rechaza en una ejecución desatendida
      <!-- test: npx vitest run tests/autorizacion-qa-canales.test.ts tests/autorizacion-qa.test.ts -->
- [ ] Revocar una autorización vale desde ese momento, y un código emitido y revocado antes de canjearse deja de servir
      <!-- test: npx vitest run tests/autorizacion-qa-canales.test.ts -->
- [ ] El panel de Mission Control se ve y funciona en modo claro y oscuro
      <!-- verify: manual -->

## Puntos

```json
[]
```

## Implementación

Pendiente.

## Pruebas

Pendiente de ejecución.

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
    "date": "2026-10-05",
    "at": "2026-10-06T01:51:51.086Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-06",
    "at": "2026-10-07T04:35:49.722Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-06",
    "at": "2026-10-07T04:39:47.265Z",
    "action": "gate-approved",
    "actor": "cli",
    "details": "Gate analysis aprobado por Juan Andrade (recibo GR-20261007-SECURITY-MC-AUTORIZACION-QA-20261005-analysis-2, canal mission-control, decidida 2026-10-07T04:39:47.262Z): Si la opcion a"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-06",
    "at": "2026-10-07T04:39:47.541Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  }
]
```
