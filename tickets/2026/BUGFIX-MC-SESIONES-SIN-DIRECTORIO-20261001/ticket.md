---
schema_version: 2
id: BUGFIX-MC-SESIONES-SIN-DIRECTORIO-20261001
title: Evitar atribuir sesiones sin directorio al proyecto incorrecto
type: BUGFIX
module: MC
workflow_status: closed
qa_status: waived
release_status: unreleased
user_visible: false
sync_impact: false
migration_impact: false
docker_impact: false
risk_level: normal
created: 2026-10-01
updated: 2026-10-01
related_ticket: null
target_release: null
released_in: null
---

# BUGFIX-MC-SESIONES-SIN-DIRECTORIO-20261001

## Solicitud original

Parte del sprint: Corregir regresiones de tablero, aislamiento de sesiones y sesiones abiertas.
- R-PRO-003: Una sesión sin directorio DEBE requerir asociación explícita para mostrarse como propia de un proyecto.
Viene de una feature descompuesta en sprints; su plan completo está en el tickets.yaml de la feature.

## Referencias de la feature

- Feature: [control-jornadas-ejecucion](../../../.valmen/features/control-jornadas-ejecucion/feature.md).
- Grafo aprobado para materializar: [tickets.yaml](../../../.valmen/features/control-jornadas-ejecucion/tickets.yaml).
- Límites y reparto del alcance: [revisión de descomposición](../../../.valmen/features/control-jornadas-ejecucion/revision-descomposicion.md).
- Spec completa: [proyectos/spec.md](../../../.valmen/features/control-jornadas-ejecucion/spec/proyectos/spec.md).

La cobertura indica la parte del requisito asignada por el grafo; sus otros
tickets colaboran en el resultado completo. Las anotaciones de verificación
se definirán al planificar; esta alta no aprueba el plan ni comprueba criterios.

## Descripción funcional

- Alcance: la atribución de sesiones de Hermes que consume Mission Control y la
  línea de tiempo. Se corrige la pertenencia por `cwd` o `git_repo_root` y se
  cubren sus fronteras de directorio.
- Usuario o rol afectado: responsable que consulta varios proyectos locales en
  Mission Control y necesita saber qué sesiones pertenecen realmente a cada uno.
- Comportamiento actual: `leerSesionesDeHermes` acepta una sesión con `cwd`
  nulo o vacío para cualquier directorio consultado. Además compara con
  `startsWith`, por lo que una ruta vecina que comparte prefijo textual puede
  entrar en el proyecto equivocado.
- Comportamiento esperado: una sesión solo aparece en un proyecto cuando su
  `cwd` o `git_repo_root` no vacío está dentro de la raíz por componentes de
  ruta. Sin una de esas pruebas no se atribuye. Una asociación explícita futura
  por perfil, base o intento pertenece a
  `FEATURE-ENGINE-RESOLUCION-PROYECTO-20261001`.

## Diagnóstico

- Archivos y flujo investigados: `packages/server/src/hermes.ts`,
  `packages/server/src/timeline.ts` y `tests/hermes.test.ts`. La línea de tiempo
  pide sesiones con la raíz del proyecto; el lector abre las bases de Hermes en
  solo lectura y decide la pertenencia antes de atribuir tickets o consumo.
- Causa raíz confirmada: en `leerSesionesDeHermes`, la condición
  `fila.cwd === null || fila.cwd === "" || fila.cwd.startsWith(directory)`
  convierte la ausencia de directorio en pertenencia a todos los proyectos.
  `git_repo_root` también usa prefijo textual. No existe en este lector un
  binding explícito que pueda sustituir ambas referencias ausentes.
- Riesgos y compatibilidad: dejar de mostrar sesiones sin contexto puede reducir
  datos históricos visibles, pero evita mezclar actividad, tickets y consumo.
  Sesiones con una raíz real siguen disponibles. La comparación debe respetar
  componentes para no aceptar `/proyectos/tienda-extra` al consultar
  `/proyectos/tienda`.
- Impactos de sync, migración, Docker o despliegue: no hay sincronización,
  migración, contenedores ni despliegue. Sí hay aislamiento entre proyectos;
  requiere plan aprobado antes de implementar.

## Plan

- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de
  plan). Autorización recibida el 2026-10-01: «si te apruebo». El cambio protege
  aislamiento entre proyectos; falta el recibo de la compuerta de análisis para
  poder pasar a `planned` y luego implementar.
- Alcance y exclusiones: corregir solo la lectura de Hermes y sus pruebas. No
  crear perfiles, bindings, rutas remotas, cambios de esquema SQLite ni escribir
  en bases de Hermes.
- Pasos ordenados:
  1. En `packages/server/src/hermes.ts`, extraer una comprobación pura de
     pertenencia que acepte únicamente un `cwd` o `git_repo_root` no vacío y
     contenido en la raíz consultada por componentes de ruta. Aplicarla antes de
     leer mensajes, atribuir tickets o sumar consumo.
  2. En `tests/hermes.test.ts`, ampliar el laboratorio SQLite para declarar
     `cwd` y `git_repo_root` independientemente. Cubrir raíz anidada válida,
     raíz Git válida, `cwd` nulo, `cwd` vacío y una ruta con prefijo vecino.
  3. Ejecutar primero `npx vitest run tests/hermes.test.ts` y luego
     `npx vitest run` desde la raíz. Confirmar manualmente en Mission Control
     que una sesión sin asociación no aparece en ninguno de dos proyectos y que
     una sesión con raíz válida permanece en el suyo.
- Compatibilidad, orden y reversión: el cambio es de lectura y no altera las
  bases ni el contrato HTTP. Se despliega junto con sus pruebas; si excluye una
  sesión con raíz verificable, revertir la comprobación y conservar la evidencia
  para ampliar el ticket de bindings, sin volver a aceptar ausencias como prueba.

## Criterios de aceptación

- [x] R-PRO-003: Una sesión sin directorio DEBE requerir asociación explícita para mostrarse como propia de un proyecto.
      <!-- test: npx vitest run tests/hermes.test.ts -->

## Puntos

```json
[]
```

## Implementación

- Se reemplazó la atribución por prefijo textual en `leerSesionesDeHermes` por una comprobación de componentes de ruta sobre `cwd` y `git_repo_root`.
- Una ruta nula o vacía ya no acredita pertenencia a ningún proyecto; las asociaciones explícitas futuras siguen fuera de este ticket.

## Pruebas

- `npx vitest run tests/hermes.test.ts` — pasó: 24 pruebas.
- `npx vitest run` — pasó: 1.669 pruebas; 48 equivalencias permanecen desactivadas por configuración.
- `npm run build` — pasó.
- Resultado comunicado por el PO: aprobado; la revisión visual en Mission Control quedó conforme.

## QA

```json
[]
```

## Evidencia

```json
[
  {
    "id": "EVIDENCE-001",
    "date": "2026-10-01",
    "kind": "test",
    "description": "La compuerta qa-mechanical ejecutó tests/hermes.test.ts con salida 0; la suite completa y la compilación también pasaron.",
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
    "date": "2026-10-01",
    "technical_summary": "La lectura de sesiones exige una ruta real dentro de la raíz del proyecto y compara por componentes.",
    "functional_summary": "Mission Control deja de mezclar sesiones sin directorio entre proyectos.",
    "qa_status": "waived",
    "qa_waiver_reason": "No existe una referencia de build verificable para este ticket; el PO validó visualmente la entrega.",
    "po_confirmation": "Eximo la QA de este ticket",
    "release_impact": "Sin despliegue ni cambio de datos; queda unreleased."
  }
]
```

## Consumo de IA

```json
[
  {
    "kind": "ai-usage",
    "date": "2026-10-01",
    "session_reference": null,
    "model": null,
    "reasoning_effort": null,
    "notes": "Sesión compartida con otros tickets; el gasto no se reparte porque no hay agregado fiable por ticket.",
    "input_tokens": null,
    "output_tokens": null,
    "total_tokens": null,
    "estimated_cost_usd": null,
    "source": "manual:sesion-codex-compartida",
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
    "date": "2026-10-01",
    "at": "2026-10-01T19:10:43.971Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-01",
    "at": "2026-10-01T22:54:21.342Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-01",
    "at": "2026-10-01T23:29:06.512Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-01",
    "at": "2026-10-01T23:29:10.734Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-01",
    "at": "2026-10-01T23:29:17.308Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-01",
    "at": "2026-10-01T23:31:40.377Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-01",
    "at": "2026-10-01T23:31:47.158Z",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-10-01",
    "at": "2026-10-01T23:50:24.657Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-10-01",
    "at": "2026-10-01T23:55:32.967Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-10-01",
    "at": "2026-10-01T23:56:09.455Z",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-10-01",
    "at": "2026-10-01T23:56:09.534Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-10-01",
    "at": "2026-10-01T23:56:09.591Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  }
]
```
