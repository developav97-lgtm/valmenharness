---
schema_version: 1
id: BUGFIX-ADMIN-USERS-PERMISOS-TERCEROS-POS-20260828
title: Usuarios POS no expone permisos de edición de terceros
type: BUGFIX
module: ADMIN
workflow_status: closed
qa_status: approved
release_status: released
user_visible: true
sync_impact: false
migration_impact: false
docker_impact: false
risk_level: normal
created: 2026-08-28
updated: 2026-09-07
related_ticket: null
target_release: 6.2.4
released_in: 6.2.4
---

# BUGFIX-ADMIN-USERS-PERMISOS-TERCEROS-POS-20260828

## Solicitud original

necesito que crees un ticket para el siguiente punto, en el modelo AdmInvoiceParam hay 3 permisos relacionados con los terceros create_partner, edit_partner, edit_partner_full. que pasa que en el formulario de creacion o edicion de usuario FrontEnd/src/app/administration/users/user, estan en la pestaña de restaurante pero como el modal de tereros donde estos parametros se usan es compartido entre el restaurante y pos comercial tambien deben estar en la pestaña de parametros pos para los clientes que solo manejan pos comercial entonces toca ponerlos creo que el de crear terceros si esta en ambas solo faltan los de editar

## Descripción funcional

- Alcance: formulario Angular de creación y edición de usuarios, específicamente la pestaña `Parámetros POS` en `FrontEnd/src/app/administration/users/user/adm-user.component.html`.
- Usuario o rol afectado: administradores del tenant que configuran permisos de usuarios de POS comercial, incluidos clientes que no usan Restaurante.
- Comportamiento actual: `create_partner` ya se puede marcar en `Parámetros POS`; `edit_partner` y `edit_partner_full` se muestran únicamente en `Parámetros Restaurante`. Por ello no pueden asignarse desde POS comercial aunque el selector de terceros compartido consume los tres valores de `AdmInvoiceParam`.
- Comportamiento esperado: las tres opciones de terceros (`create_partner`, `edit_partner` y `edit_partner_full`) están disponibles en `Parámetros POS` al crear y editar un usuario, sin retirar ni alterar las opciones existentes en Restaurante.

## Diagnóstico

- Archivos y flujo investigados: `BackEnd/ModAdmin/models/params.py` declara los tres BooleanFields en `AdmInvoiceParam`; `adm-user.component.ts` contiene los tres `FormControl`; `adm-user.component.html` renderiza `create_partner` en POS (líneas aproximadas 286-287) y los tres controles solo en Restaurante (546-555). `select-partner-modal.component.ts` lee los tres valores desde `user.UserInvoice[0]` para habilitar creación, edición rápida y edición completa.
- Causa raíz o hipótesis: confirmada. La vista de POS quedó incompleta cuando se añadieron los permisos de edición; el formulario y el contrato de datos ya los soportan, por lo que el defecto es de representación en la pestaña POS.
- Riesgos y compatibilidad: son permisos de acceso funcional. La corrección debe reutilizar los mismos `formControlName` y etiquetas de Restaurante, mantener IDs HTML únicos y no duplicar campos del formulario ni modificar serializadores, API, modelos o el modal. Se debe comprobar creación y edición de usuario, aislamiento por tenant y que Restaurante conserva el comportamiento actual.
- Impactos de sync, migración, Docker o despliegue: no aplica para sincronización, migración, Docker ni despliegue. No se prevé cambio de API. El cambio afecta la configuración de permisos; queda sujeto a aprobación explícita del PO antes de implementación.

## Plan

- Gate de plan: aprobado explícitamente por el PO el 2026-08-28 mediante “si apruebo”, para el alcance documentado de agregar `edit_partner` y `edit_partner_full` a Parámetros POS.
- Alcance y exclusiones: solo se agregan los checkboxes `edit_partner` y `edit_partner_full` a Parámetros POS. Se excluyen cambios de modelo, serializadores, endpoints, migraciones, sincronización y la lógica de autorización del modal.
- Paso 1: en `FrontEnd/src/app/administration/users/user/adm-user.component.html`, añadir a la sección `Parámetros POS` los controles existentes para edición rápida y edición completa de terceros, ligados a `edit_partner` y `edit_partner_full`, con IDs POS únicos y etiquetas consistentes.
- Paso 2: revisar `adm-user.component.ts` y el envío/carga existentes para confirmar que los valores siguen usando los controles únicos de `form_user`, sin crear duplicados ni modificar contratos backend.
- Paso 3: actualizar o añadir pruebas unitarias del componente que comprueben que la pestaña POS contiene ambos controles y que los valores se conservan en creación y edición; ejecutar la regresión dirigida y la compilación Angular.
- Rollback: revertir exclusivamente los dos controles POS añadidos. No requiere backup, canario ni orden especial de despliegue porque no modifica datos persistidos, contratos ni runtime.

## Criterios de aceptación

- [ ] POINT-001: al crear un usuario con configuración POS, la pestaña `Parámetros POS` muestra Crear tercero, Editar tercero y Edición completa de tercero.
- [ ] POINT-001: al editar un usuario existente, los estados persistidos de `edit_partner` y `edit_partner_full` se cargan y se pueden modificar desde Parámetros POS.
- [ ] POINT-001: los checkboxes de Restaurante conservan el comportamiento actual y todos los controles HTML tienen identificadores únicos.
- [ ] POINT-001: el selector de terceros compartido respeta los permisos configurados para un usuario de POS comercial; ningún contrato de backend, schema tenant o dato existente cambia.
- [ ] POINT-001: las pruebas unitarias afectadas y la compilación de Angular terminan correctamente.

## Puntos

<!-- Crear POINT-NNN es append-only: no eliminar, reordenar ni reutilizar. Las transiciones solo las realiza el CLI, actualizan el punto actual y anexan un ticket-event. -->

```json
[
  {
    "id": "POINT-001",
    "title": "POS comercial no permite asignar permisos de edición de terceros",
    "status": "closed",
    "severity": "high",
    "actual": "En el formulario de creación o edición de usuarios, Parámetros POS muestra create_partner, pero no edit_partner ni edit_partner_full. Esos dos controles solo aparecen en Parámetros Restaurante.",
    "expected": "Parámetros POS permite configurar create_partner, edit_partner y edit_partner_full para usuarios de POS comercial, conservando los controles existentes de Restaurante y su enlace al mismo AdmInvoiceParam.",
    "evidence": [
      "EVIDENCE-001",
      "EVIDENCE-002",
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

- Archivos revisados: `FrontEnd/src/app/administration/users/user/adm-user.component.html`, `adm-user.component.ts` y `adm-user.component.spec.ts`.
- Resultado de implementación: no se realizó un cambio de código. La rama actual ya contiene en Parámetros POS los controles `edit_partner` (`input_edit_partner`) y `edit_partner_full` (`input_edit_partner_full`), enlazados al mismo `form_user_invoice` que `create_partner`; Restaurante conserva los controles equivalentes con IDs `rest_*` distintos.
- Decisiones técnicas: no se agrega una prueba nueva porque una prueba de presencia habría pasado antes de modificar código; se preserva la suite existente y se registra la regresión dirigida sobre el comportamiento ya implementado.
- Compatibilidad preservada: sin cambios de modelo, API, serializadores, datos tenant-scoped, sincronización ni modal compartido.
- Commits atribuibles al ticket:
  - Ninguno funcional: el comportamiento solicitado ya estaba presente en `HEAD`; no se creó un commit de código.
  - Documental: `41da1f51fc98327eb28d9a1e47644de72b950838` — conserva la verificación, evidencia y cierre del ticket sin implementación.

## Pruebas

- Comandos para el PO: `npx ng test --watch=false --browsers=ChromeHeadless --include=src/app/administration/users/user/adm-user.component.spec.ts` y `npm run build`.
- Directorio de ejecución: `FrontEnd`.
- Resultado esperado: el spec dirigido y el build finalizan con código 0.
- Validaciones manuales: en un tenant de pruebas con POS comercial activo, crear y editar un usuario desde Administración > Usuarios; abrir Parámetros POS, asignar por separado Editar tercero y Edición completa de tercero, guardar, volver a abrir el usuario y comprobar que los valores persisten. Desde POS, abrir el selector de terceros y verificar que cada permiso habilita solo su acción correspondiente. Repetir una comprobación de no regresión en Restaurante.
- Requisitos de ambiente o datos: tenant de pruebas con un administrador autorizado, POS comercial habilitado, un usuario no administrador y un tercero existente para probar ambas acciones de edición.
- Resultado comunicado por el PO: el PO validó que los permisos ya estaban presentes y funcionales; el reporte inicial correspondía a una verificación equivocada y no se requiere implementación.

## QA

```json
[
  {
    "id": "QA-001",
    "date": "2026-08-28",
    "build_reference": "commit:6b97e993bec1f58e94915839441db9dfb77f01a8",
    "environment": "Tenant de pruebas validado por el PO; POS comercial.",
    "result": "pending",
    "findings": [],
    "correction": null,
    "po_confirmation": null
  },
  {
    "id": "QA-002",
    "date": "2026-08-28",
    "build_reference": null,
    "environment": null,
    "result": "approved",
    "findings": [],
    "correction": null,
    "po_confirmation": "El PO confirmó que validó el flujo y los permisos ya estaban presentes; no se requirió implementación."
  }
]
```

## Evidencia

```json
[
  {
    "id": "EVIDENCE-001",
    "date": "2026-08-28",
    "kind": "automated",
    "description": "Inspección de HEAD y ejecución de la regresión dirigida: adm-user.component.html ya contiene los controles POS input_edit_partner e input_edit_partner_full, ambos enlazados a form_user_invoice; la suite dirigida ejecutó 18 specs correctos. Angular 14 emitió después un error espurio al reevaluar el patrón --include, pero el proceso terminó con código 0.",
    "reference": null,
    "point_id": "POINT-001"
  },
  {
    "id": "EVIDENCE-002",
    "date": "2026-08-28",
    "kind": "build",
    "description": "npm run build ejecutado desde FrontEnd finalizó correctamente con código 0, sin requerir cambios en la pantalla.",
    "reference": null,
    "point_id": "POINT-001"
  },
  {
    "id": "EVIDENCE-003",
    "date": "2026-08-28",
    "kind": "manual",
    "description": "El PO confirmó que validó el flujo y los permisos ya estaban presentes; el reporte inicial correspondía a una verificación equivocada y no se requiere implementación.",
    "reference": null,
    "point_id": "POINT-001"
  }
]
```

## Retests

```json
[
  {
    "id": "RETEST-001",
    "date": "2026-08-28",
    "point_id": "POINT-001",
    "result": "approved",
    "evidence": [],
    "po_confirmation": "El PO confirmó que validó el flujo y los permisos ya estaban presentes."
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
    "date": "2026-08-28",
    "technical_summary": "La inspección confirmó que Parámetros POS ya expone edit_partner y edit_partner_full en HEAD; no se necesitó cambio de código.",
    "functional_summary": "El PO validó que los permisos estaban presentes y funcionales en POS comercial.",
    "qa_status": "approved",
    "qa_waiver_reason": null,
    "po_confirmation": "El PO confirmó la validación y que el reporte inicial fue un error de verificación.",
    "release_impact": "No hay cambio funcional ni artefacto de release; el ticket queda cerrado y unreleased."
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
    "date": "2026-08-28",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-08-28",
    "action": "point-added",
    "actor": "cli",
    "details": "Se agregó POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-08-28",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-08-28",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-08-28",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-08-28",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-08-28",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-08-28",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-08-28",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-08-28",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-002."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-08-28",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-08-28",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-08-28",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-003."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-014",
    "date": "2026-08-28",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-015",
    "date": "2026-08-28",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-016",
    "date": "2026-08-28",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-001 para POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-017",
    "date": "2026-08-28",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: verified -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-018",
    "date": "2026-08-28",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-019",
    "date": "2026-08-28",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-020",
    "date": "2026-08-28",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-021",
    "date": "2026-08-28",
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
