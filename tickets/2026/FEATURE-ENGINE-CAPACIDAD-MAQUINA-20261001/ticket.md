---
schema_version: 2
id: FEATURE-ENGINE-CAPACIDAD-MAQUINA-20261001
title: Persistir capacidad compartida por máquina con reservas
type: FEATURE
module: ENGINE
workflow_status: closed
qa_status: approved
release_status: unreleased
user_visible: false
sync_impact: false
migration_impact: false
docker_impact: false
risk_level: normal
created: 2026-10-01
updated: 2026-10-05
related_ticket: null
target_release: null
released_in: null
---

# FEATURE-ENGINE-CAPACIDAD-MAQUINA-20261001

## Solicitud original

Parte del sprint: Integrar selección y capacidad con autonomía existente y despacho Hermes opcional.
- R-JOR-005: Las ejecuciones administradas DEBEN respetar una capacidad compartida y persistida por máquina.
Depende de: FEATURE-CONFIG-BINDINGS-MAQUINA-20261001, SECURITY-ENGINE-COLISIONES-ESCRITURA-20260926, FEATURE-ENGINE-ESTADO-ACTIVIDAD-20261001.
Viene de una feature descompuesta en sprints; su plan completo está en el tickets.yaml de la feature.

## Referencias de la feature

- Feature: [control-jornadas-ejecucion](../../../.valmen/features/control-jornadas-ejecucion/feature.md).
- Grafo aprobado para materializar: [tickets.yaml](../../../.valmen/features/control-jornadas-ejecucion/tickets.yaml).
- Límites y reparto del alcance: [revisión de descomposición](../../../.valmen/features/control-jornadas-ejecucion/revision-descomposicion.md).
- Spec completa: [jornadas/spec.md](../../../.valmen/features/control-jornadas-ejecucion/spec/jornadas/spec.md).

La cobertura indica la parte del requisito asignada por el grafo; sus otros
tickets colaboran en el resultado completo. Las anotaciones de verificación
se definirán al planificar; esta alta no aprueba el plan ni comprueba criterios.

## Descripción funcional

- Alcance: un almacén local por máquina para declarar capacidad de ejecuciones administradas, reclamar y liberar reservas identificadas por proyecto, ejecución e intento, y reconciliarlas contra la actividad persistida antes de recuperarlas. No despacha tickets ni cambia workflows.
- Usuario o rol afectado: el despachador futuro y el responsable que comparte una máquina entre proyectos autorizados; ambos necesitan que una ejecución de un proyecto consuma el mismo cupo que otra, sin interferir con procesos externos no integrados.
- Comportamiento actual: `MachineBindings` identifica la máquina y sus proyectos, pero no declara capacidad ni guarda reservas. `MutationLock` y `appendExecutionEvent()` protegen únicamente cada raíz de proyecto; dos proyectos distintos pueden observar cupo disponible a la vez. La actividad append-only distingue `started`, `active`, `waiting`, `finished` y `failed`, pero ningún componente la contrasta con una reserva persistida.
- Comportamiento esperado: el motor guarda el límite y las reservas en el espacio local de la máquina, bajo un lock común a todos los proyectos vinculados. Solo una reclamación concurrente obtiene el último cupo; una reserva sigue ocupándolo tras reiniciar hasta que se libera expresamente o la reconciliación consulta la actividad autorizada y confirma un estado terminal. La capacidad predeterminada es uno, configurable de forma local por máquina, y no pretende controlar procesos externos sin identidad del contrato.

## Diagnóstico

- Archivos y flujo investigados: `packages/adapter/src/machine-bindings.ts` valida `machine-id` y las raíces autorizadas, pero hoy su esquema cerrado no tiene capacidad. `packages/engine/src/project-resolution.ts` resuelve esos bindings a proyectos autorizados. `packages/core/src/fs.ts` ofrece `MutationLock`, pero el lock queda en la raíz recibida; `packages/engine/src/execution-events.ts` lo usa por proyecto y no serializa decisiones entre raíces. `execution-activity.ts` guarda hechos append-only por intento y `execution-status.ts` deriva liveness sin alterar tickets: los únicos estados que prueban término son `finished` y `failed`; `waiting` sigue siendo una reserva ocupada.
- Causa raíz confirmada: dos despachos de proyectos distintos pueden resolver sus propios locks, leer cero ejecuciones locales y decidir ambos que queda un cupo. Ningún hecho posterior revierte esa doble decisión. La corrección necesita una única sección de estado y lock bajo el hogar de la máquina antes de que se ofrezca despacho. Recuperar por vencimiento o por ausencia de heartbeat también sería incorrecto: el proceso puede seguir escribiendo aunque no haya una señal nueva, por lo que solo el evento terminal persistido por el proyecto autorizado libera durante reconciliación.
- Riesgos y compatibilidad: el nuevo estado local es una coordinación entre procesos de una misma máquina, no sincronización entre máquinas ni entre clientes. El archivo no se versiona, no contiene secretos ni rutas de proyecto, y no modifica `.valmen/config.yaml`, tickets, gates o ejecutores. Cada reserva almacena únicamente `machineId`, `projectId`, `executionId` e `attemptId`; el proyecto debe aparecer en `bindings.local.yaml` y se resuelve de nuevo antes de leer su actividad. La reclamación repetida con la misma identidad devuelve la reserva existente; otra identidad sin cupo no crea estado. La reconciliación conserva la reserva ante proyecto no resoluble, identidad no encontrada, historial vacío, `started`, `active` o `waiting`; solo recupera `finished`/`failed`. No infiere, mata ni limita procesos externos no conectados al contrato.
- Impactos de sync, migración, Docker o despliegue: no hay sincronización, migración, contenedores, credenciales, hosts ni despliegue. El único impacto persistente es local a la máquina: un JSON con versión de esquema y una escritura bajo lock en `~/.valmen/`. No hay conversión de datos previa porque el archivo aún no existe; bindings anteriores siguen válidos y usan capacidad efectiva uno. Revertir código conserva reservas en disco y por diseño no crea cupo falso; una limpieza o migración explícita queda fuera de alcance.
- Memoria consultada: AP-006 y AP-007 no aportan un patrón de capacidad; recuerdan conservar decisiones humanas y evidencia verificable. La ausencia de un aprendizaje específico se documenta para no presentar una decisión previa inexistente como contrato.

## Plan

- Alcance y exclusiones: se implementa el contrato local de capacidad y reservas, junto con su reconciliación conservadora. Quedan fuera el selector ya entregado, despachar/invocar ejecutores, transiciones de ticket, planificación de colisiones, UI/CLI/MCP y cualquier modificación de la política compartible del proyecto.
- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan). Tras dos bloqueos consecutivos de `diagnostico_explica_el_sintoma` con la corrección verificable incorporada, el PO autorizó continuar el 2026-10-05: «Dale listo pruebo». La aprobación se atribuye a esta política humana, no al modelo; los recibos `GR-20261005-FEATURE-ENGINE-CAPACIDAD-MAQUINA-20261001-analysis-1` y `GR-20261005-FEATURE-ENGINE-CAPACIDAD-MAQUINA-20261001-analysis-2` quedan conservados en `.valmen/receipts/FEATURE-ENGINE-CAPACIDAD-MAQUINA-20261001.jsonl`.
- Pasos ordenados:
  1. Extender `packages/adapter/src/machine-bindings.ts` y `tests/machine-bindings.test.ts` con `managed-execution-capacity` local, entero positivo opcional y valor efectivo uno. Mantener el campo fuera de `.valmen/config.yaml`; bindings existentes siguen siendo válidos y representan capacidad uno.
  2. Crear `packages/engine/src/machine-capacity.ts` con el almacenamiento `~/.valmen/machine-capacity.json` inyectable para pruebas, versión de esquema, tipos de reserva y un lock de directorio común a la máquina. Exponer configuración, lectura, reclamación idempotente, liberación por identidad y disponibilidad sin escribir tickets ni eventos.
  3. En el mismo módulo, implementar `reconcileMachineCapacity()` leyendo únicamente proyectos que el binding local autoriza y su `readExecutionActivity()`. Recuperar una reserva solo si la última actividad del intento es `finished` o `failed`; conservarla ante actividad activa/esperando, identidad desconocida, proyecto no resoluble o historial ausente. Exportar el contrato desde `packages/engine/src/index.ts`.
  4. Crear `tests/machine-capacity.test.ts` con dos proyectos en la misma máquina: disputa del último cupo, reclamación repetida del mismo intento, liberación, persistencia/relectura, reinicio y reconciliación terminal frente a una reserva activa o no verificable. Extender la prueba de bindings para capacidad ausente, válida e inválida.
  5. Ejecutar `npx vitest run tests/machine-capacity.test.ts tests/machine-bindings.test.ts`, `npm run build`, `npx vitest run` y el gate `qa-mechanical`. Documentar el contrato exacto de prueba sin activar un despachador ni modificar configuración real de la máquina.
- Compatibilidad y rollback: el contrato es aditivo; los bindings previos conservan capacidad uno y ningún flujo existente consulta el almacén hasta que el ticket de despacho lo integre. Revertir módulos y exports deja el estado local intacto y no libera reservas de forma implícita; una herramienta futura de administración, fuera de este ticket, deberá tratar una limpieza explícita.

## Criterios de aceptación

- [x] R-JOR-005a: Dos proyectos autorizados en la misma máquina disputan el último cupo de forma atómica; exactamente una reserva nueva lo obtiene y la otra recibe indisponibilidad.
      <!-- test: npx vitest run tests/machine-capacity.test.ts -->
- [x] R-JOR-005b: Una reserva conserva proyecto, ejecución e intento, persiste tras reconstruir el almacén y una reclamación repetida de la misma identidad es idempotente; liberar esa identidad devuelve el cupo sin afectar otras reservas.
      <!-- test: npx vitest run tests/machine-capacity.test.ts -->
- [x] R-JOR-005c: La reconciliación recupera solo reservas con actividad terminal verificable (`finished` o `failed`) de un proyecto autorizado; conserva actividad activa, espera, historial ausente y proyectos no resolubles.
      <!-- test: npx vitest run tests/machine-capacity.test.ts -->
- [x] R-JOR-005d: `managed-execution-capacity` es local al binding de máquina, admite solo enteros positivos y su ausencia equivale a capacidad uno; no se acepta dentro de la política versionada del proyecto.
      <!-- test: npx vitest run tests/machine-bindings.test.ts -->

## Puntos

```json
[]
```

## Implementación

Se añadió `packages/engine/src/machine-capacity.ts`, un almacén local de reservas en `~/.valmen/machine-capacity.json`, protegido con un lock común a la máquina y escritura atómica. Expone lectura, reclamación idempotente, liberación por identidad y reconciliación conservadora. Una reserva contiene solo máquina, proyecto, ticket, ejecución e intento; no incluye rutas ni credenciales.

La reconciliación resuelve otra vez el proyecto desde el binding local y recupera únicamente una actividad terminal `finished` o `failed`. Conserva cupo ocupado ante actividad activa o esperando, historial vacío, proyecto no disponible o datos no verificables. No inicia procesos, no cambia tickets y no limita software externo al contrato.

`managed-execution-capacity` se agregó a `bindings.local.yaml` como entero positivo local, con valor efectivo uno si se omite; `config.yaml` lo rechaza para impedir que una política versionada declare una capacidad de máquina.

## Pruebas

Directorio de ejecución: `/Users/juanandrade/Desktop/ValmenHarness`.

- `npx vitest run tests/machine-capacity.test.ts tests/machine-bindings.test.ts` — pasó: 15 pruebas. Cubre disputa entre dos proyectos, idempotencia, liberación, recuperación terminal, actividad activa/historial ausente, coincidencia exacta con el binding y configuración local válida/inválida.
- `npx eslint packages/adapter/src/machine-bindings.ts packages/adapter/src/config.ts packages/engine/src/machine-capacity.ts packages/engine/src/index.ts tests/machine-capacity.test.ts tests/machine-bindings.test.ts` — pasó.
- `npm run build` — pasó.
- `npx vitest run` — el cambio pasó; el total fue 1 fallo, 127 archivos aprobados y 1 omitido. El único fallo externo fue `tests/dogfooding-registro.test.ts`: `.valmen/rules/estandares-proceso.md` contiene una regla ajena que aún no fue proyectada a `AGENTS.md`. Esos archivos no pertenecen al ticket y no se tocaron para ocultar el fallo.

Validación manual para el responsable: en un hogar temporal, declare dos proyectos autorizados con `managed-execution-capacity: 1`. Reclame un cupo con el primer proyecto e intente reclamarlo con el segundo: solo el primero debe recibirlo. Registre `finished` para el primer intento y reconcilie; el segundo podrá reclamar después. Con `active`, `waiting` o sin historial, la reconciliación debe conservar la reserva. Requiere Node 24 y dependencias npm; no requiere ejecutar Hermes, un worker real ni modificar bindings de esta máquina.

- Resultado del PO: las pruebas fueron conformes; se autoriza cerrar el ticket, crear el commit y enviarlo al remoto.

## QA

```json
[
  {
    "id": "QA-001",
    "date": "2026-10-05",
    "build_reference": "worktree:sha256:c442e33d964705df20c97dd7c6d20eab22ea0168d6b5f8e9ed86f0db3215893f",
    "environment": "local",
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
    "po_confirmation": "El PO confirmó las pruebas y autorizó cierre, commit y push."
  }
]
```

## Evidencia

```json
[
  {
    "id": "EVIDENCE-001",
    "date": "2026-10-05",
    "kind": "test",
    "description": "Pruebas focalizadas, compilación y revisión independiente aprobadas; resultado del PO conforme.",
    "reference": "worktree:sha256:c442e33d964705df20c97dd7c6d20eab22ea0168d6b5f8e9ed86f0db3215893f",
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
    "technical_summary": "Se agregó capacidad local compartida con reservas atómicas, idempotentes y reconciliación que falla cerrada ante liveness no terminal.",
    "functional_summary": "Dos proyectos autorizados no pueden obtener el mismo último cupo de máquina; el cupo vuelve solo tras término verificable o liberación explícita.",
    "qa_status": "approved",
    "qa_waiver_reason": null,
    "po_confirmation": null,
    "release_impact": "Sin publicación: el cambio queda cerrado y no modifica una release."
  }
]
```

## Consumo de IA

```json
[
  {
    "kind": "ai-usage",
    "date": "2026-10-05",
    "session_reference": null,
    "model": null,
    "reasoning_effort": null,
    "notes": "Esta conversación también atendió FEATURE-ENGINE-SELECCION-ELEGIBLE-20261001 y FEATURE-GATE-CALIBRACION-EVIDENCIA-20260926; no existe un desglose verificable por ticket. El consumo completo está en la sesión Codex de la conversación del 2026-10-05.",
    "input_tokens": null,
    "output_tokens": null,
    "total_tokens": null,
    "estimated_cost_usd": null,
    "source": "manual:conversacion-codex-20261005",
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
    "date": "2026-10-01",
    "at": "2026-10-01T19:10:45.385Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-05",
    "at": "2026-10-05T14:33:44.205Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-05",
    "at": "2026-10-05T14:47:44.619Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-05",
    "at": "2026-10-05T14:47:44.801Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-05",
    "at": "2026-10-05T14:47:44.964Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-05",
    "at": "2026-10-05T14:56:02.998Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-05",
    "at": "2026-10-05T14:57:28.839Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-10-05",
    "at": "2026-10-05T14:57:37.825Z",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-10-05",
    "at": "2026-10-05T14:57:38.103Z",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-10-05",
    "at": "2026-10-05T14:57:38.277Z",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-10-05",
    "at": "2026-10-05T14:57:38.455Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-10-05",
    "at": "2026-10-05T14:57:51.625Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-10-05",
    "at": "2026-10-05T14:57:52.719Z",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-014",
    "date": "2026-10-05",
    "at": "2026-10-05T14:57:52.914Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  }
]
```
