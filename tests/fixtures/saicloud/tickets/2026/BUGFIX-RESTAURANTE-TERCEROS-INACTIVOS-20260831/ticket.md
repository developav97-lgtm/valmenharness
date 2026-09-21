---
schema_version: 1
id: BUGFIX-RESTAURANTE-TERCEROS-INACTIVOS-20260831
title: El selector de terceros muestra registros inactivos
type: BUGFIX
module: RESTAURANTE
workflow_status: closed
qa_status: approved
release_status: released
user_visible: true
sync_impact: false
migration_impact: false
docker_impact: false
risk_level: normal
created: 2026-08-31
updated: 2026-09-07
related_ticket: null
target_release: 6.2.4
released_in: 6.2.4
---

# BUGFIX-RESTAURANTE-TERCEROS-INACTIVOS-20260831

## Solicitud original

necesito que empecemos un ticket para poder corregir lo siguiente, nosotros en administracion tenemos los terceros y ellos tienen un parametro state que debe estar en true para que este activo, y desde el restaurante esta dejando seleccionar en el modal de terceros, terceros inactivos es decir con el state en false. corregir esto en el modal de seleccion de terceros para que solo salgan los activos

## Descripción funcional

- Alcance: selector de terceros utilizado al asignar un tercero a una orden de Restaurante.
- Usuario o rol afectado: personal de Restaurante con permiso para seleccionar terceros.
- Comportamiento actual: el modal muestra terceros activos e inactivos que ya están almacenados localmente; permite elegir uno cuyo `state` es `false`.
- Comportamiento esperado: al abrirse desde Restaurante, el selector muestra y permite elegir únicamente terceros cuyo `state` es `true`.

## Diagnóstico

- Archivos y flujo investigados: `FrontEnd/src/app/common/services/restaurant.service.ts` abre `select-partner`; `FrontEnd/src/app/modals/Administration/select-partner-modal/select-partner-modal.component.ts` recibe los registros de `Partners` desde IndexedDB y solo aplica filtros de nombre e identificación. `Backend/ModAdmin/models/partners.py` confirma que `AdmPartner.state` define el estado del tercero.
- Causa raíz o hipótesis: el modal compartido no recibe ni aplica una condición de estado para la apertura desde Restaurante, pese a que los registros locales incluyen `state`.
- Riesgos y compatibilidad: el mismo modal lo consumen POS y otras áreas. El filtro debe activarse solo al abrirse desde Restaurante, sin cambiar las listas ni contratos de sus otros consumidores. Se mantendrá una validación al seleccionar para evitar elegir un registro inactivo de un snapshot obsoleto.
- Impactos de sync, migración, Docker o despliegue: no aplica; no se modificará API, modelo, IndexedDB, sincronización, migraciones, Docker ni WebSocket.

## Plan

- Alcance y exclusiones: solo el flujo de Restaurante; se excluyen cambios al estado de terceros, endpoints, esquema de base de datos y comportamiento de POS/Administración.
- Gate no exigible: BUGFIX de bajo alcance y sin impactos críticos; el cambio se limita a un filtro de presentación con prueba dirigida. La aprobación del PO seguirá siendo necesaria para cualquier commit o push.
- Pasos ordenados:
  1. En `restaurant.service.ts`, identificar la apertura como origen Restaurante mediante un flag explícito de solo lectura para el modal (POINT-001).
  2. En `select-partner-modal.component.ts`, aplicar el filtro `state === true` al origen Restaurante y bloquear la selección si un tercero inactivo llegara a un snapshot abierto (POINT-001).
  3. En `select-partner-modal.component.spec.ts`, agregar pruebas unitarias para el filtro exclusivo de Restaurante y el guard de selección; ejecutar la suite dirigida y la compilación Angular.
- Rollback, backup, canario u orden de despliegue cuando aplique: rollback reversible retirando el flag y el filtro del frontend; no requiere backup, canario ni orden especial de despliegue.

## Criterios de aceptación

- [ ] POINT-001: al abrir el selector desde Restaurante, un tercero con `state: false` no aparece, aunque esté almacenado en IndexedDB.
- [ ] POINT-001: un tercero con `state: true` sigue apareciendo y puede seleccionarse con su dirección de envío.
- [ ] POINT-001: un registro inactivo que llegue a la acción de selección no cierra el modal ni altera la orden de Restaurante.
- [ ] Las aperturas existentes desde POS, Administración y demás consumidores no reciben el nuevo filtro por este ticket.

## Puntos

<!-- Crear POINT-NNN es append-only: no eliminar, reordenar ni reutilizar. Las transiciones solo las realiza el CLI, actualizan el punto actual y anexan un ticket-event. -->

```json
[
  {
    "id": "POINT-001",
    "title": "El modal de terceros de Restaurante permite seleccionar terceros inactivos",
    "status": "closed",
    "severity": "high",
    "actual": "La búsqueda local del modal compartido devuelve terceros almacenados con state=false y permite seleccionarlos desde Restaurante.",
    "expected": "En Restaurante, el modal solo debe listar y permitir seleccionar terceros con state=true.",
    "evidence": [
      "EVIDENCE-001",
      "EVIDENCE-003"
    ],
    "affected_files": [],
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

- Archivos cambiados: `FrontEnd/src/app/common/services/restaurant.service.ts`, `FrontEnd/src/app/modals/Administration/select-partner-modal/select-partner-modal.component.ts` y su prueba unitaria.
- Decisiones técnicas: Restaurante envía `only_active_partners: true` al abrir el modal. El modal incorpora `state: true` a los filtros locales solo con ese flag, vuelve a aplicar los filtros después de cargar IndexedDB y rechaza una selección inactiva residual.
- Compatibilidad preservada: no se cambiaron API, modelos, IndexedDB ni sincronización; las otras aperturas del modal no envían el flag y conservan sus filtros actuales.
- Commits atribuibles al ticket:
  - `a2c41d127f63db2345110e4c8431e06692e9040a` — corrige el filtro de terceros activos en Restaurante y agrega pruebas de regresión.

## Pruebas

- Comandos para el PO: `npx ng test FrontSaiOpenCloud --watch=false --browsers=ChromeHeadless --include='src/app/modals/Administration/select-partner-modal/select-partner-modal.component.spec.ts'` y `npm run build`.
- Directorio de ejecución: `FrontEnd`.
- Resultado esperado: la prueba dirigida y la compilación terminan sin errores.
- Validaciones manuales: en un tenant de prueba, abrir una orden de Restaurante; buscar un tercero activo y uno inactivo. El activo debe poder seleccionarse y el inactivo no debe listarse. Verificar además que el selector de terceros de POS conserva su comportamiento previo.
- Requisitos de ambiente o datos: usuario de Restaurante con permiso de seleccionar terceros; al menos un tercero activo y uno inactivo ya sincronizados en IndexedDB.
- Resultado local: la suite dirigida terminó con 37 pruebas exitosas y `npm run build` terminó correctamente. La ejecución integral de pruebas expone dos fallos preexistentes de `PosSendElectronicComponent` por `app-row-ruta` no reconocido; están fuera del alcance y no se modificaron.
- Resultado comunicado por el PO: aprobado en dev el 2026-08-31; el tercero inactivo no aparece y el tercero activo se selecciona correctamente.

## QA

```json
[
  {
    "id": "QA-001",
    "date": "2026-08-31",
    "build_reference": "commit:a2c41d127f63db2345110e4c8431e06692e9040a",
    "environment": "dev",
    "result": "pending",
    "findings": [],
    "correction": null,
    "po_confirmation": null
  },
  {
    "id": "QA-002",
    "date": "2026-08-31",
    "build_reference": null,
    "environment": null,
    "result": "approved",
    "findings": [],
    "correction": null,
    "po_confirmation": "PO confirma en la nube que el tercero inactivo no aparece y el activo se puede seleccionar correctamente."
  }
]
```

## Evidencia

```json
[
  {
    "id": "EVIDENCE-001",
    "date": "2026-08-31",
    "kind": "automated",
    "description": "Prueba dirigida Angular: 37 pruebas exitosas, incluidas las regresiones de terceros activos para Restaurante.",
    "reference": "worktree:sha256:7b135288629080146529be707c4e64a0cd5a10da8265eb28f4ed41fae08d40a1",
    "point_id": "POINT-001"
  },
  {
    "id": "EVIDENCE-002",
    "date": "2026-08-31",
    "kind": "automated",
    "description": "Compilación Angular npm run build finalizada correctamente.",
    "reference": "worktree:sha256:7b135288629080146529be707c4e64a0cd5a10da8265eb28f4ed41fae08d40a1",
    "point_id": null
  },
  {
    "id": "EVIDENCE-003",
    "date": "2026-08-31",
    "kind": "automated",
    "description": "Referencia reproducible del diff funcional verificado para las pruebas y compilación; SHA-256 calculado solo sobre las tres rutas funcionales de este ticket.",
    "reference": "worktree:sha256:5596d330c68b4bbb57cc12266ebda7336cc5c13c33b71b756589dd62589415a1",
    "point_id": "POINT-001"
  }
]
```

## Retests

```json
[
  {
    "id": "RETEST-001",
    "date": "2026-08-31",
    "point_id": "POINT-001",
    "result": "approved",
    "evidence": [],
    "po_confirmation": "PO confirma en la nube que el tercero inactivo no aparece y el activo se puede seleccionar correctamente."
  }
]
```

## Cierre

<!-- Bloque JSON append-only de objetos con `kind: "ticket-close"`; el esquema completo está en ticket-schema.md. -->

- Cierre técnico y funcional:
- Resultado comunicado por el PO:
- QA aprobada o eximida (motivo y confirmación explícita del PO si aplica):
- Riesgo residual e impacto de release:
- Texto visible al usuario cuando aplique:

```json
[
  {
    "kind": "ticket-close",
    "id": "CLOSE-001",
    "date": "2026-08-31",
    "technical_summary": "El modal compartido filtra state=true solo cuando lo abre Restaurante y bloquea selecciones inactivas residuales.",
    "functional_summary": "El PO confirmó en dev que los terceros inactivos ya no se muestran y los activos siguen seleccionables.",
    "qa_status": "approved",
    "qa_waiver_reason": null,
    "po_confirmation": "Confirmación explícita del PO: sí.",
    "release_impact": "El ticket queda cerrado funcionalmente y unreleased; será incluido en una release futura."
  }
]
```

## Consumo de IA

<!-- Registros append-only `ai-usage`: consumo conocido o estimado con fuente y confianza. No inventar tokens ni coste; usar null cuando Codex no lo reporte. -->

```json
[]
```

## Release

- Estado de release:
- Versión objetivo:
- Versión publicada:
- Tickets relacionados:

## Eventos

<!-- Bloque JSON append-only final de objetos con `kind: "ticket-event"`; el CLI agrega uno por cada mutación propia. -->

```json
[
  {
    "kind": "ticket-event",
    "id": "EVENT-001",
    "date": "2026-08-31",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-08-31",
    "action": "point-added",
    "actor": "cli",
    "details": "Se agregó POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-08-31",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-08-31",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-08-31",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-08-31",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-08-31",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-08-31",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-08-31",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-08-31",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-002."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-08-31",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-08-31",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-08-31",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-003."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-014",
    "date": "2026-08-31",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-015",
    "date": "2026-08-31",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-016",
    "date": "2026-08-31",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-001 para POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-017",
    "date": "2026-08-31",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: verified -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-018",
    "date": "2026-08-31",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-019",
    "date": "2026-08-31",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-020",
    "date": "2026-08-31",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-021",
    "date": "2026-08-31",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-022",
    "date": "2026-09-07",
    "action": "release-transition",
    "actor": "cli",
    "details": "Release: unreleased -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-023",
    "date": "2026-09-07",
    "action": "release-transition",
    "actor": "cli",
    "details": "Release: planned -> released."
  }
]
```
