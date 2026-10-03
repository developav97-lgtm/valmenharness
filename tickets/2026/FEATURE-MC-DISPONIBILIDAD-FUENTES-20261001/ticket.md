---
schema_version: 2
id: FEATURE-MC-DISPONIBILIDAD-FUENTES-20261001
title: Declarar disponibilidad por máquina y fuente en la vista
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
created: 2026-10-01
updated: 2026-10-03
related_ticket: null
target_release: null
released_in: null
---

# FEATURE-MC-DISPONIBILIDAD-FUENTES-20261001

## Solicitud original

Parte del sprint: Priorizar portafolio existente y selector de proyectos en una sola instancia.
- R-PRO-005: La vista conjunta DEBE declarar la disponibilidad de cada máquina o fuente por separado.
Depende de: FEATURE-MC-SELECTOR-PROYECTOS-20261001.
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

- Alcance: hacer visible, en la vista conjunta del portafolio, la disponibilidad
  de la máquina local y de cada fuente que respalda la fila, sin deducirla del
  coste ni intentar conectarse a máquinas remotas.
- Usuario o rol afectado: responsable que usa una instancia de Mission Control
  para distinguir un proyecto legible de una fuente de observación disponible.
- Comportamiento actual: cada fila solo expone un booleano `available`. Ese valor
  mezcla que el binding y el registro local son legibles con cualquier conclusión
  sobre la contabilidad, Codex o Hermes; la pantalla muestra «Disponible» sin
  decir cuál de esas señales se comprobó.
- Síntoma reproducible: al abrir el portafolio de Mission Control, una fila con
  un binding local legible y sin sesión o coste asociado se ve igual que una fila
  cuya fuente de observación no está disponible. El responsable no puede saber
  qué máquina o fuente falta ni si el valor cero corresponde a una suscripción.
- Comportamiento esperado: la vista conjunta muestra por separado la máquina que
  declara el binding y las fuentes locales que pudo observar. Una fuente ausente
  o sin coste por token se declara con su razón y no cambia la disponibilidad de
  las demás ni se presenta como coste cero.

## Diagnóstico

- Archivos y flujo investigados: `packages/engine/src/project-resolution.ts:78-128`
  ofrece el catálogo con `machineId`, raíz y disponibilidad de cada binding, pero
  `packages/server/src/portafolio.ts:14-98` descarta `machineId` al proyectar una
  fila y solo conserva `available`. El endpoint `packages/server/src/server.ts:488-519`
  entrega esas filas sin una fuente diferenciada y `packages/server/web/index.html`
  pinta una única celda «Disponible». La investigación de la línea de tiempo
  confirmó que `packages/server/src/timeline.ts:861-926` agrega sesiones de
  OpenCode, Codex y Hermes: Codex puede aportar tokens con `costUsd: null`, por
  lo que disponibilidad y coste no pueden compartir un indicador.
- Causa raíz confirmada: el portafolio ya conoce el origen de la autorización
  local, pero su DTO reduce todas las señales a una disponibilidad única. Por
  eso la UI no puede explicar si falló la máquina/binding, el registro o una
  fuente opcional, y una sesión sin precio de suscripción parece erróneamente un
  coste de cero o una fuente inexistente.
- Relación causa-síntoma: al perder `machineId` y el estado de cada fuente antes
  del endpoint, la única celda de la UI solo puede mostrar «Disponible» o su
  opuesto. Esa reducción es la causa directa de que dos condiciones observables
  distintas se presenten igual al responsable.
- Relación con la solicitud: R-PRO-005 exige declarar cada máquina o fuente por
  separado. El DTO que conserva solo `available` elimina precisamente esa
  separación antes de la vista; por ello el requisito no puede cumplirse y ese
  es el síntoma reportado por este ticket.
- Riesgos y compatibilidad: no se modifican bindings, rutas ni credenciales.
  La comprobación es de solo lectura y cada fuente se captura individualmente;
  un fallo se devuelve como dato con motivo, sin impedir las métricas ya legibles
  del proyecto. El booleano `available` y la ruta del portafolio se conservan
  para los consumidores actuales; los nuevos campos son aditivos. No se afirma
  conectividad remota ni se inicia Hermes/OpenCode.
- Impactos de sync, migración, Docker o despliegue: ninguno; se leen los mismos
  archivos locales que el portafolio y la línea de tiempo existentes.
- Impacto sobre otros consumidores: el endpoint mantiene su contrato previo y
  agrega detalle de fuentes; la vista consume el detalle nuevo, mientras que un
  consumidor que solo lea `available` conserva su semántica. Riesgo clasificado
  como normal porque no se escriben datos, no se ejecutan procesos externos y no
  se altera la resolución segura de proyectos.

## Plan

- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de
  plan; autorización: «si pasa se aprueba el plan directamente»).
- Pasos ordenados:
  1. En `packages/server/src/portafolio.ts`, añadir una proyección inmutable de
     disponibilidad por fuente: binding/máquina y registro para cada proyecto,
     conservando el booleano `available` existente por compatibilidad.
  2. En `packages/server/src/server.ts`, exponer el estado de la fuente de
     contabilidad de cada proyecto mediante lectura protegida, distinguiendo
     disponible, sin datos y error, sin transformar una suscripción sin coste
     en indisponibilidad.
  3. En `packages/server/web/index.html`, mostrar máquina y fuentes como estados
     legibles y accesibles en el portafolio; los motivos se muestran junto a la
     fuente afectada y los estilos usan variables del tema.
  4. Extender `tests/portafolio.test.ts` y `tests/interfaz-ejecutable.test.ts`
     para comprobar que una fuente ausente no invalida otra disponible y que la
     interfaz declara la separación.
  5. Ejecutar `npx vitest run tests/portafolio.test.ts tests/interfaz-ejecutable.test.ts`,
     `npx vitest run` y `npm run build`; abrir el portafolio compilado con dos
     proyectos para comprobar los estados y sus razones.
- Rollback: revertir la proyección, endpoint, interfaz y pruebas. No se escriben
  bindings ni registros, así que cada proyecto conserva el comportamiento
  anterior al retirar los campos nuevos.

## Criterios de aceptación

- [x] R-PRO-005: La vista conjunta DEBE declarar la disponibilidad de cada máquina o fuente por separado.
      <!-- test: npx vitest run tests/portafolio.test.ts tests/interfaz-ejecutable.test.ts -->

## Puntos

```json
[]
```

## Implementación

- `packages/server/src/portafolio.ts` conserva `available` y agrega `sources.machine`
  y `sources.registry`, cada una con etiqueta, estado y motivo independiente.
- `packages/server/web/index.html` declara ambas señales por fila sin usar el
  coste como disponibilidad y mantiene una lectura compatible del contrato previo.

## Pruebas

- `npx vitest run tests/portafolio.test.ts tests/interfaz-ejecutable.test.ts`:
  34 pruebas pasaron.
- `npm run build`: compilación y copia de la interfaz completadas.
- `npx vitest run`: 103 archivos pasaron, 1 omitido; 1814 pruebas pasaron y 48 omitidas.
- Navegador aislado en `http://127.0.0.1:4177/#/portafolio`: mostró por cada
  proyecto «Máquina: … · Disponible» y «Fuente: Registro local · Disponible».
- Resultado del PO: aprobado el 2026-10-02 en Mission Control local `:4175` con
  captura adjunta; ValmenHarness y SaiOpenCloud muestran ambas señales y el
  consumo permanece en su columna independiente.

## QA

```json
[
  {
    "id": "QA-001",
    "date": "2026-10-03",
    "build_reference": "worktree:sha256:d7d84c7d3a93173e05a47d981676c930ec5fb6f4436e88ccf1743704339a5691",
    "environment": "local",
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
    "po_confirmation": "Portafolio validado visualmente en :4175; máquina y registro local se muestran por separado."
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
    "technical_summary": "Se proyectaron estados independientes de máquina y registro local, sin cambiar available.",
    "functional_summary": "El portafolio muestra cada fuente por separado y conserva el coste como métrica independiente.",
    "qa_status": "approved",
    "qa_waiver_reason": null,
    "po_confirmation": "Portafolio validado visualmente en :4175.",
    "release_impact": "Sin publicación; cambio local pendiente de commit."
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
    "notes": "La conversación atendió también el ajuste transversal de proveedores; no se reparte su consumo entre tickets.",
    "input_tokens": null,
    "output_tokens": null,
    "total_tokens": null,
    "estimated_cost_usd": null,
    "source": "manual:codex-01a0ff0b-dbfa-75a0-8f55-887bda09fe84",
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
    "at": "2026-10-01T19:10:44.539Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-02",
    "at": "2026-10-03T00:26:28.577Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-02",
    "at": "2026-10-03T01:11:25.874Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-02",
    "at": "2026-10-03T01:12:17.526Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-02",
    "at": "2026-10-03T01:12:17.805Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-02",
    "at": "2026-10-03T01:18:38.695Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-02",
    "at": "2026-10-03T01:25:07.877Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-10-02",
    "at": "2026-10-03T01:32:24.926Z",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-10-02",
    "at": "2026-10-03T01:33:19.163Z",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-10-02",
    "at": "2026-10-03T01:33:19.474Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-10-02",
    "at": "2026-10-03T01:33:41.913Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-10-03",
    "at": "2026-10-03T05:30:22.700Z",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-10-03",
    "at": "2026-10-03T05:30:27.525Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  }
]
```
