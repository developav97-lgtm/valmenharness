---
schema_version: 1
id: IMPROVEMENT-POS-TRASPASO-SUCURSAL-20260827
title: Restringir destinatarios del traspaso de caja por sucursal y módulo
type: IMPROVEMENT
module: POS
workflow_status: closed
qa_status: approved
release_status: released
user_visible: true
sync_impact: false
migration_impact: false
docker_impact: false
risk_level: normal
created: 2026-08-27
updated: 2026-09-07
related_ticket: null
target_release: 6.2.4
released_in: 6.2.4
---

# IMPROVEMENT-POS-TRASPASO-SUCURSAL-20260827

## Solicitud original

hola necesito que ayudes a generar una validacion extra en el siguiente componente FrontEnd/src/app/modals/Pos/transfer-cash-register-modal, que pasa en el ngOnInit actualmente se cargan this.users que son los usuarios a los cuales le podria pasar el cierre de caja y valida que sean cajeros pero adicionalmente necesito que se haga una validacion de sucursal que vendria de la siguiente manera el modelo AdmUser tiene un campo id_admbranch number donde se asigna el id de la sucursal entonces el primer filtro es que sea de la misma sucursal del cierre que se va a pasar y dos validar en AdmUserBranch que si ese usuario no pertenece a la misma sucursal del cierre tenga configurado ahi en ese modelo la sucursal. permitiendo ejemplo el cierre es de la sucursal 1, entonces en ese listado de usuarios debe mostrar los usuarios cajeros que pertenecen a esa sucursal o que tengan asignada esa sucursal en el modelo que te dije AdmUserBranch. y tenemos que organizar algo mas los cierres se comparten entre el modulo restaurante y pos comercial, y la configuracion de cajero solo aplica para el modulo restaurtante en el pos comercial o punto de venta todos los usuarios configurados son cajeros por defecto entonces ese filtro de usuarios deberia validar segun el modulo en la index db esta el modelo Modules ahi se cargan los modulos disponibles. Si ambos módulos están activos, el comportamiento debe depender de la URL de origen: /restaurant/arching exige Cajero; /pos/arching no exige ese rol.

## Descripción funcional

- Alcance: limitar el selector de destino del modal de traslado de caja a usuarios autorizados para la sucursal de la caja y aplicar la elegibilidad de cajero según el módulo desde el que se abrió el flujo.
- Usuario o rol afectado: titular de una caja abierta y administrador autorizado que usa arqueo, cierre o el detalle de caja desde Restaurante o Punto de Venta.
- Comportamiento actual: el modal lee `Users` de IndexedDB, excluye al titular y exige siempre `UserRestaurant[0].rol === 'Cajero'`; no conoce la sucursal de la caja ni las asignaciones activas de `UserBranches`.
- Comportamiento esperado: para una caja de sucursal N, el selector presenta solo usuarios cuyo `id_admbranch` sea N o que tengan una fila activa de `UserBranches` con `id_admcompanybranch` N. En rutas `/restaurant/...` exige además el rol Cajero; en `/pos/...` no lo exige, aun si el tenant tiene ambos módulos habilitados.

## Diagnóstico

- Archivos y flujo investigados: `transfer-cash-register-modal.component.ts` recibe solo id y titular. `close-cash-register.component.ts`, `arching.component.ts` y `cash-register.component.ts` abren el modal y ya tienen cargado `cash_register.company_branch`. Las rutas comparten los mismos componentes: `mod-restaurant.routing.ts` expone `/restaurant/arching` y `/restaurant/close-cash-register`; `mod-pos.routing.ts` expone las equivalentes de POS. `AdmUser.UserBranches` es el contrato frontend de `AdmUserBranch` y contiene `id_admcompanybranch` y `state`.
- Causa raíz o hipótesis: confirmada. Falta transportar al modal el contexto de sucursal de la caja y la elegibilidad se codificó exclusivamente para Restaurante, aunque el componente se reutiliza desde POS.
- Hallazgo QA posterior (POINT-002): confirmada. El predicado de sucursal consulta `UserBranches` sin exigir primero `AdmUser.all_branch`; por ello, al retirar el acceso general, una asignación persistente en `UserBranches` mantiene visible al usuario como destinatario.
- Riesgos y compatibilidad: el filtrado en interfaz mejora las opciones visibles, pero no reemplaza las validaciones del backend. Para cajas históricas sin `company_branch`, se conservará el comportamiento previo de sucursal (sin excluir destinos por sucursal) hasta que exista una regla de negocio distinta; el rol seguirá dependiendo de la ruta. No se cambia API, permisos ni el modelo de datos.
- Impactos de sync, migración, Docker o despliegue: no aplica. El contexto de tenant y los datos ya precargados en IndexedDB se preservan.

## Plan

- Gate de plan: aprobado explícitamente por el PO el 2026-08-27 mediante “si confirmo”. Es una mejora de comportamiento que altera los destinatarios operativos de un traslado de caja. El ajuste de POINT-002 fue aprobado explícitamente por el PO el 2026-08-28 mediante “si dale yo apruebo esta implementacion”.
- Paso 1: extender el contrato interno de apertura del modal en `close-cash-register.component.ts`, `arching.component.ts` y `cash-register.component.ts` con la sucursal de `cash_register.company_branch`, sin cambiar el payload del endpoint de traslado.
- Paso 2: en `transfer-cash-register-modal.component.ts`, tipar el contexto recibido e incorporar `Router` para derivar el módulo del primer segmento de la ruta. Implementar un predicado de elegibilidad: excluir titular, comprobar sucursal principal o `UserBranches` activa, y exigir `Cajero` solo para `/restaurant/...`.
- Paso 3: crear pruebas unitarias dirigidas del modal para sucursal principal, sucursal adicional activa, asignación inactiva, exclusión del titular, ruta Restaurante y ruta POS; ejecutar el spec y la compilación Angular.
- Paso 4 (POINT-002): exigir `all_branch` antes de evaluar sucursal principal o `UserBranches`, y ampliar el spec con un usuario que conserve una asignación activa pero tenga `all_branch: false`.
- Exclusiones: no se modifica `Modules`, el contrato REST, el backend, los modelos Django ni la configuración de usuarios.
- Rollback: revertir los cambios de los cuatro componentes y el spec asociado; no requiere backup, migración, canario ni orden especial de despliegue.

## Criterios de aceptación

- [ ] POINT-001: una caja con sucursal N solo muestra usuarios cuya sucursal principal sea N o que tengan `UserBranches` activa para N; se excluye al titular.
- [ ] POINT-001: una asignación `UserBranches` inactiva no habilita al usuario como destinatario.
- [ ] POINT-001: en `/restaurant/...`, los usuarios elegibles por sucursal sin rol Cajero no se muestran.
- [ ] POINT-001: en `/pos/...`, los usuarios elegibles por sucursal se muestran independientemente de `UserRestaurant.rol`, incluso con ambos módulos habilitados.
- [ ] POINT-001: una caja histórica sin sucursal conserva el filtrado previo de sucursal, sin cambios de endpoint, tenant o permisos.
- [ ] POINT-002: un usuario con `all_branch: false` no aparece como destinatario aunque conserve sucursal principal o `UserBranches` activa para la sucursal de la caja.
- [ ] POINT-002: un usuario con `all_branch: true` conserva la elegibilidad ya definida por sucursal y módulo.

## Puntos

<!-- Crear POINT-NNN es append-only: no eliminar, reordenar ni reutilizar. Las transiciones solo las realiza el CLI, actualizan el punto actual y anexan un ticket-event. -->

```json
[
  {
    "id": "POINT-001",
    "title": "Destinatarios de caja disponibles respetan sucursal y módulo de origen",
    "status": "closed",
    "severity": "normal",
    "actual": "El modal solo excluye al titular y exige UserRestaurant[0].rol igual a Cajero; ignora la sucursal de la caja, UserBranches y la ruta de origen.",
    "expected": "El modal ofrece únicamente usuarios con acceso activo a la sucursal de la caja. En /restaurant exige Cajero; en /pos permite cualquier usuario habilitado de la sucursal.",
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
  },
  {
    "id": "POINT-002",
    "title": "La restricción global all_branch debe prevalecer sobre UserBranches",
    "status": "closed",
    "severity": "normal",
    "actual": "El filtro de destinatarios considera la sucursal principal y las asignaciones activas de UserBranches sin verificar primero el permiso global AdmUser.all_branch. Si se retira all_branch pero persiste una asignación en UserBranches, el usuario continúa apareciendo como destinatario.",
    "expected": "Antes de permitir la sucursal principal o cualquier asignación activa de UserBranches, el filtro verifica AdmUser.all_branch. Un usuario sin acceso global a sucursales no aparece como destinatario, aunque conserve registros en UserBranches.",
    "evidence": [
      "EVIDENCE-004",
      "EVIDENCE-005"
    ],
    "affected_files": [],
    "diagnosis": null,
    "solution": null,
    "tests": [],
    "qa_cycles": [
      "QA-005"
    ],
    "terminal_reason": null,
    "related_ticket": null
  }
]
```

## Implementación

- Archivos cambiados: `transfer-cash-register-modal.component.ts`, sus tres invocadores compartidos (`close-cash-register.component.ts`, `arching.component.ts`, `cash-register.component.ts`) y `transfer-cash-register-modal.component.spec.ts`.
- Decisiones técnicas: los invocadores pasan `cash_register.company_branch` en el contrato interno del modal. El modal usa el primer segmento de `Router.url` para distinguir Restaurante de POS; no usa los módulos habilitados del tenant como proxy del flujo. El predicado permite sucursal principal o una fila `UserBranches` activa y conserva el fallback de cajas históricas sin sucursal.
- Compatibilidad preservada: no cambian endpoint, payload REST, tenant, permisos, modelos ni sincronización. Las cajas sin sucursal no se restringen por sucursal.
- POINT-002: `hasBranchAccess` rechaza primero a quien tenga `all_branch: false`; solo después conserva el filtro existente por sucursal principal, `UserBranches` activa y rol según la ruta. El spec incluye una asignación activa persistente sin acceso general.
- Trazabilidad operativa: `tools/agentic/ticket.py` permite reabrir exclusivamente `closed → changes_requested` cuando el ticket continúa `unreleased`, exige motivo y anexa un ciclo QA con el hallazgo; no habilita la reapertura de una release publicada.
- Commit funcional: `0c726394792b17f774559f4bf540eef13215e798` — corrige la precedencia de `all_branch`, añade su regresión y habilita la reapertura controlada de tickets no publicados con hallazgos QA.
- Commit documental: `0d4b082e17ba0edce341797306ddb97a6eeb1020` — registra la reapertura, evidencia, retest y cierre de POINT-002.

## Pruebas

- Comandos para el PO: `npx ng test --watch=false --browsers=ChromeHeadless --include=src/app/modals/Pos/transfer-cash-register-modal/transfer-cash-register-modal.component.spec.ts` y `npm run build`.
- Directorio de ejecución: `FrontEnd`.
- Resultado esperado: el spec dirigido ejecuta los 2 casos correctamente y la compilación Angular termina con código 0. En este runtime Angular 14, el comando de spec emite después un error espurio de patrón `--include` y sale con 127 pese a que Karma ya informó `TOTAL: 2 SUCCESS`; validar el resultado de los specs antes de ese mensaje.
- Validaciones manuales: con un tenant que tenga Restaurante y Punto de Venta, abrir la misma operación desde `/restaurant/arching` y `/pos/arching`. En ambos, comprobar que solo aparecen usuarios de la sucursal de la caja por sucursal principal o asignación adicional activa; en Restaurante confirmar que se excluye un Mesero y en POS confirmar que se incluye al mismo usuario si tiene acceso a la sucursal.
- Requisitos de ambiente o datos: una caja abierta con sucursal, dos usuarios con sucursal principal o adicional activa, un usuario con asignación adicional inactiva y perfiles de Cajero/Mesero para el caso Restaurante.
- Resultado comunicado por el PO: el 2026-08-27 el PO confirmó “ya validé y quedó correcto” después de probar el cambio en nube.
- Reapertura POINT-002: se entregará el mismo comando de spec y `npm run build` desde `FrontEnd`; validar manualmente que al retirar `all_branch` de un usuario con una asignación persistente en `UserBranches`, este deja de aparecer en el modal de traspaso.
- Resultado técnico POINT-002: el spec dirigido mostró 2 de 2 casos exitosos tras la corrección; Angular 14 vuelve a emitir después el error espurio conocido de `--include`. `npm run build -- --progress=false` finalizó con código 0 (hash `22d96b0beb267085`).

## QA

```json
[
  {
    "id": "QA-001",
    "date": "2026-08-27",
    "build_reference": "commit:a260a4b02057c1d0c26b55d3ad9bb067fe989a5e",
    "environment": "Prueba en nube validada por el PO",
    "result": "pending",
    "findings": [],
    "correction": null,
    "po_confirmation": null
  },
  {
    "id": "QA-002",
    "date": "2026-08-27",
    "build_reference": null,
    "environment": null,
    "result": "approved",
    "findings": [],
    "correction": null,
    "po_confirmation": "El PO confirmó: ya validé y quedó correcto."
  },
  {
    "id": "QA-003",
    "date": "2026-08-28",
    "build_reference": "commit:a260a4b02057c1d0c26b55d3ad9bb067fe989a5e",
    "environment": "Prueba en nube validada por el PO",
    "result": "pending",
    "findings": [],
    "correction": null,
    "po_confirmation": null
  },
  {
    "id": "QA-004",
    "date": "2026-08-28",
    "build_reference": null,
    "environment": null,
    "result": "changes_requested",
    "findings": [
      "QA identificó que la elegibilidad por sucursal no prioriza AdmUser.all_branch sobre UserBranches; se incorpora POINT-002 al mismo flujo."
    ],
    "correction": null,
    "po_confirmation": null
  },
  {
    "id": "QA-005",
    "date": "2026-08-28",
    "build_reference": "worktree:sha256:61bc754258e0ca316022facfb02c2bee5e22b7fe0a015d8eba87f8544be55765",
    "environment": "Validación en nube por el PO",
    "result": "pending",
    "findings": [],
    "correction": null,
    "po_confirmation": null
  },
  {
    "id": "QA-006",
    "date": "2026-08-28",
    "build_reference": null,
    "environment": null,
    "result": "approved",
    "findings": [],
    "correction": null,
    "po_confirmation": "El PO confirmó: listo, lo veo bien."
  }
]
```

## Evidencia

```json
[
  {
    "id": "EVIDENCE-001",
    "date": "2026-08-27",
    "kind": "automated",
    "description": "El spec dirigido de TransferCashRegisterModalComponent ejecutó 2 de 2 casos exitosos: ruta Restaurante con rol Cajero y ruta POS sin ese requisito. Después de Karma, Angular 14 emitió el error espurio conocido de patrón --include y el proceso salió 127.",
    "reference": null,
    "point_id": "POINT-001"
  },
  {
    "id": "EVIDENCE-002",
    "date": "2026-08-27",
    "kind": "build",
    "description": "npm run build -- --progress=false en FrontEnd finalizó con código 0 el 2026-08-27; hash fd730f720cc642c4.",
    "reference": null,
    "point_id": "POINT-001"
  },
  {
    "id": "EVIDENCE-003",
    "date": "2026-08-27",
    "kind": "manual",
    "description": "El PO validó en nube el flujo desde Restaurante y POS y confirmó que quedó correcto.",
    "reference": "commit:a260a4b02057c1d0c26b55d3ad9bb067fe989a5e",
    "point_id": "POINT-001"
  },
  {
    "id": "EVIDENCE-004",
    "date": "2026-08-28",
    "kind": "automated",
    "description": "El spec dirigido de TransferCashRegisterModalComponent reprodujo primero la inclusión indebida del usuario con all_branch false y UserBranches activa; tras la guarda previa ejecutó 2 de 2 casos exitosos. Angular 14 emitió después el error espurio conocido de patrón --include.",
    "reference": null,
    "point_id": "POINT-002"
  },
  {
    "id": "EVIDENCE-005",
    "date": "2026-08-28",
    "kind": "build",
    "description": "npm run build -- --progress=false en FrontEnd finalizó con código 0; hash de build 22d96b0beb267085.",
    "reference": null,
    "point_id": "POINT-002"
  }
]
```

## Retests

```json
[
  {
    "id": "RETEST-001",
    "date": "2026-08-27",
    "point_id": "POINT-001",
    "result": "approved",
    "evidence": [],
    "po_confirmation": "El PO confirmó: ya validé y quedó correcto."
  },
  {
    "id": "RETEST-002",
    "date": "2026-08-28",
    "point_id": "POINT-002",
    "result": "approved",
    "evidence": [],
    "po_confirmation": "El PO confirmó: listo, lo veo bien."
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
    "date": "2026-08-27",
    "technical_summary": "El modal filtra destinatarios por sucursal principal o asignación activa y aplica el rol Cajero solo desde rutas de Restaurante.",
    "functional_summary": "El PO validó en nube el traspaso de caja desde Restaurante y POS.",
    "qa_status": "approved",
    "qa_waiver_reason": null,
    "po_confirmation": "El PO confirmó: ya validé y quedó correcto.",
    "release_impact": "El cambio está publicado en dev mediante commit a260a4b02057c1d0c26b55d3ad9bb067fe989a5e; permanece unreleased hasta una promoción formal a producción."
  },
  {
    "kind": "ticket-close",
    "id": "CLOSE-002",
    "date": "2026-08-28",
    "technical_summary": "POINT-002 incorpora la guarda all_branch antes de la sucursal principal y UserBranches; el gestor conserva hallazgos QA posteriores en tickets unreleased.",
    "functional_summary": "El PO validó que el usuario sin acceso general deja de aparecer como destinatario del traspaso de caja.",
    "qa_status": "approved",
    "qa_waiver_reason": null,
    "po_confirmation": "El PO confirmó: listo, lo veo bien.",
    "release_impact": "Los cambios quedan en dev tras commit y push selectivos; el ticket continúa unreleased hasta una promoción formal."
  }
]
```

## Consumo de IA

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
    "date": "2026-08-27",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-08-27",
    "action": "point-added",
    "actor": "cli",
    "details": "Se agregó POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-08-27",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-08-27",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-08-27",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-08-27",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-08-27",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-08-27",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-08-27",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-08-27",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-002."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-08-27",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-08-27",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-08-27",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-014",
    "date": "2026-08-27",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-015",
    "date": "2026-08-27",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-003."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-016",
    "date": "2026-08-27",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-001 para POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-017",
    "date": "2026-08-27",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: verified -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-018",
    "date": "2026-08-27",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-019",
    "date": "2026-08-27",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-020",
    "date": "2026-08-27",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-021",
    "date": "2026-08-27",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-022",
    "date": "2026-08-28",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: closed -> changes_requested. Reapertura por hallazgo: QA identificó que la elegibilidad por sucursal no prioriza AdmUser.all_branch sobre UserBranches; se incorpora POINT-002 al mismo flujo."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-023",
    "date": "2026-08-28",
    "action": "point-added",
    "actor": "cli",
    "details": "Se agregó POINT-002."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-024",
    "date": "2026-08-28",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-002: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-025",
    "date": "2026-08-28",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: changes_requested -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-026",
    "date": "2026-08-28",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-002: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-027",
    "date": "2026-08-28",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-004."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-028",
    "date": "2026-08-28",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-005."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-029",
    "date": "2026-08-28",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-002: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-030",
    "date": "2026-08-28",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-031",
    "date": "2026-08-28",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-032",
    "date": "2026-08-28",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-005."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-033",
    "date": "2026-08-28",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-002 para POINT-002."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-034",
    "date": "2026-08-28",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-006 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-035",
    "date": "2026-08-28",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-002: verified -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-036",
    "date": "2026-08-28",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-037",
    "date": "2026-08-28",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-002."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-038",
    "date": "2026-08-28",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-039",
    "date": "2026-09-07",
    "action": "release-transition",
    "actor": "cli",
    "details": "Release: unreleased -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-040",
    "date": "2026-09-07",
    "action": "release-transition",
    "actor": "cli",
    "details": "Release: planned -> released."
  }
]
```
