---
schema_version: 1
id: IMPROVEMENT-MENU-ALERTA-SINCRONIZACION-20260827
title: Evitar modal invasivo de alertas de sincronización en el menú
type: IMPROVEMENT
module: MENU
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

# IMPROVEMENT-MENU-ALERTA-SINCRONIZACION-20260827

## Solicitud original

Al ingresar al menú principal, getInfoOfSinc en FrontEnd/src/app/mod-general/menu/menu.component.ts abre siempre un modal de Información importante cuando existen órdenes pendientes de sincronizar a SAIOpen o facturas pendientes de envío electrónico. El modal obliga a cerrarlo en cada regreso al menú, por ejemplo al pasar de Administración a Restaurante, y también aparece en móviles donde usualmente ingresan meseros y la información de facturación no les compete. Se requiere conservar la visibilidad de esta información mediante la alerta existente en el nav; en escritorio debe mostrarse al ingresar al menú y permanecer disponible hasta que el usuario decida cerrarla, sin bloquear la operación. En móvil no debe mostrarse.

## Descripción funcional

- Alcance: reemplazar la apertura automática del modal de alertas de sincronización por la apertura no bloqueante de la alerta ya disponible en el nav del menú principal, exclusivamente en escritorio. La alerta conserva los dos conteos actuales: órdenes pendientes de sincronización a SAIOpen y facturas pendientes de envío electrónico.
- Usuario o rol afectado: usuarios que ingresan al menú principal de tenants con Restaurante o Punto de Venta habilitado. En móvil, incluidos los flujos usados por meseros, no se mostrará esta alerta automáticamente.
- Comportamiento actual: al entrar a `#/home`, el componente consulta el estado de sincronización; si algún conteo es mayor que cero, abre `AlertModalComponent`. El usuario debe cerrarlo antes de continuar, en cada retorno al menú y en cualquier tamaño de pantalla.
- Comportamiento esperado: si hay pendientes y el viewport es de escritorio, se abre el desplegable existente «¡Información importante!» sin bloquear la pantalla. El usuario puede cerrarlo mediante el comportamiento normal del desplegable y operar o navegar de inmediato. En móvil no se abre automáticamente ni se muestra esta alerta de facturación/sincronización.

## Diagnóstico

- Archivos y flujo investigados: `FrontEnd/src/app/mod-general/menu/menu.component.ts` invoca `getInfoOfSinc()` al inicializarse cuando existe Punto de Venta o Restaurante. El método consume `GeneralService.getInfoSinc()` (`GET pos/get_status_sinc_orders`), actualiza `info`, `alert` y `alertMove`, y abre `AlertModalComponent` cuando `sinOrder` o `sendInvoice` es mayor que cero. `FrontEnd/src/app/mod-general/menu/menu.component.html` ya tiene el icono y desplegable con ambos conteos.
- Causa raíz o hipótesis: la misma condición que activa el indicador visual crea un diálogo modal en cada reconstrucción del componente, sin distinguir desktop de móvil ni conservar una decisión de cierre del usuario.
- Riesgos y compatibilidad: se preserva el endpoint, sus campos y el cálculo de pendientes; solo cambia la presentación del aviso. Debe evitarse que la apertura programática del desplegable interfiera con el cierre manual o se active en pantallas móviles. Mantener el icono animado mientras existan pendientes.
- Impactos de sync, migración, Docker o despliegue: no cambia OfflineSync, SincSaiCloud, contratos API, tenant, migraciones, Docker, WebSocket ni despliegue.

## Plan

- Alcance y exclusiones: solo el menú general Angular y su aviso de pendientes; no se modifica el endpoint `pos/get_status_sinc_orders`, la lógica que genera o sincroniza facturas/órdenes, ni se añade configuración administrativa.
- Gate de plan: aprobado explícitamente por el PO el 2026-08-27. Referencia: «si implementalo». Alcance aprobado: sustituir el modal por el desplegable no bloqueante en escritorio y omitir el aviso en móvil.
- Pasos ordenados:
  1. En `FrontEnd/src/app/mod-general/menu/menu.component.ts`, conservar la consulta y el estado de conteos, eliminar la apertura de `AlertModalComponent` y exponer una condición de escritorio compatible con el patrón responsive actual. La apertura automática debe ocurrir solo después de que Angular haya renderizado el icono y únicamente si al menos uno de los dos conteos es mayor que cero.
  2. En `FrontEnd/src/app/mod-general/menu/menu.component.html`, vincular esa condición al desplegable de «¡Información importante!» para mostrarlo inicialmente en escritorio, sin modal ni bloqueo, y permitir que el usuario lo cierre con la interacción normal del dropdown. Ocultar el indicador y el contenido de esta alerta en móvil, sin afectar las demás acciones del navbar.
  3. Añadir o actualizar pruebas unitarias enfocadas en `MenuComponent`: pendientes en escritorio abren la alerta no bloqueante; cero pendientes no la muestran; móvil no la abre ni la muestra; no se invoca `MatDialog` para este aviso. Ejecutar la compilación y pruebas Angular aplicables.
- Compatibilidad, orden de despliegue y rollback: compatible hacia atrás porque el payload y la consulta se conservan. Se entrega como cambio frontend sin orden especial de despliegue. Rollback: revertir únicamente los cambios de `menu.component.ts`, `menu.component.html` y su prueba asociada si la interacción del dropdown presenta una regresión.

## Criterios de aceptación

- [ ] Con `sinOrder > 0` o `sendInvoice > 0`, al abrir `#/home` en un viewport de escritorio se muestra automáticamente la alerta no bloqueante «¡Información importante!» con ambos conteos.
- [ ] El usuario puede navegar u operar sin cerrar un modal; puede cerrar el desplegable y el sistema no vuelve a forzar su apertura durante esa visita al menú.
- [ ] La consulta actual a `pos/get_status_sinc_orders` y la visualización de sus dos conteos se conservan.
- [ ] Con ambos conteos en cero, no se muestra el indicador ni el desplegable de la alerta.
- [ ] En viewport móvil, el aviso de sincronización/facturación no se muestra ni se abre automáticamente, incluso si hay pendientes.
- [ ] Las demás acciones del navbar (menú móvil, pantalla completa, notificaciones y usuario) conservan su funcionamiento.

## Puntos

<!-- Crear POINT-NNN es append-only: no eliminar, reordenar ni reutilizar. Las transiciones solo las realiza el CLI, actualizan el punto actual y anexan un ticket-event. -->

```json
[]
```

## Implementación

- Archivos cambiados: `FrontEnd/src/app/mod-general/menu/menu.component.ts`, `FrontEnd/src/app/mod-general/menu/menu.component.html` y la nueva prueba `FrontEnd/src/app/mod-general/menu/menu.component.spec.ts`.
- Commits atribuibles: `381d0ea0a0ac905fd882cb90c8d69e2dd2bebb28` — sustituye el modal de sincronización por un desplegable no bloqueante en escritorio, lo omite en móvil e incorpora pruebas unitarias.
- Decisiones técnicas: se eliminó la dependencia y apertura de `AlertModalComponent`. Cuando el endpoint conserva pendientes y el viewport inicial es de 992 px o más, el componente abre el desplegable existente mediante estado Angular; su icono permite alternarlo sin bloqueo. Bajo 992 px el indicador y el contenido no se renderizan. Un listener de `resize` cierra el desplegable al pasar a móvil.
- Compatibilidad preservada: el consumo de `GET pos/get_status_sinc_orders`, sus campos `sinOrder` y `sendInvoice`, y el indicador animado de pendientes se conservan. No se modificaron contratos backend, sincronización ni datos tenant.

## Pruebas

- Comandos para el PO: `npm test -- --watch=false --browsers=ChromeHeadless` y `npm run build`.
- Directorio de ejecución: `FrontEnd/`.
- Resultado esperado: pruebas unitarias dirigidas y compilación Angular finalizan sin errores; la validación manual confirma los escenarios responsive.
- Validaciones manuales: en un tenant de desarrollo con al menos un pendiente, abrir `#/home` en escritorio y verificar que la alerta del nav aparece sin modal, permite navegar y se puede cerrar; repetir entrando al menú desde Administración y desde Restaurante/Punto de Venta. Reducir el viewport a móvil y confirmar que la alerta no aparece. Repetir con ambos conteos en cero y confirmar que el icono no se muestra.
- Requisitos de ambiente o datos: sesión válida en un tenant de desarrollo con Restaurante o Punto de Venta habilitado; para la prueba positiva, datos que hagan que `pos/get_status_sinc_orders` devuelva al menos un pendiente. No se usarán datos productivos.
- Ejecución local: `menu.component.spec.ts` cubre escritorio con pendientes y cierre manual, móvil con pendientes y ausencia de pendientes; 3 de 3 casos pasaron. `npm run build` finalizó correctamente (hash `4fb27daba7f8c69e`). La suite completa detectó fallos preexistentes fuera de este ticket en `PosBranchCategoryComponent` por mocks sin `IndexDBService.saveData` y `deleteData`; no se modificaron por estar fuera de alcance.
- Resultado comunicado por el PO: aprobado el 2026-08-27. El PO confirmó: «ya lo probé y quedó bien» en las versiones de escritorio y móvil.

## QA

```json
[
  {
    "id": "QA-001",
    "date": "2026-08-27",
    "build_reference": "commit:381d0ea0a0ac905fd882cb90c8d69e2dd2bebb28",
    "environment": "dev",
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
    "po_confirmation": "PO confirmó: ya lo probé y quedó bien (2026-08-27)."
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
    "description": "Prueba dirigida MenuComponent: 3 de 3 casos exitosos en ChromeHeadless; cubre pendientes en escritorio, cierre manual, exclusión en móvil y ausencia de pendientes.",
    "reference": null,
    "point_id": null
  },
  {
    "id": "EVIDENCE-002",
    "date": "2026-08-27",
    "kind": "automated",
    "description": "npm run build en FrontEnd finalizó correctamente; hash Angular 4fb27daba7f8c69e.",
    "reference": null,
    "point_id": null
  },
  {
    "id": "EVIDENCE-003",
    "date": "2026-08-27",
    "kind": "automated",
    "description": "La suite Angular completa quedó con fallos preexistentes fuera de alcance en PosBranchCategoryComponent, por mocks sin saveData y deleteData; no se alteró ese componente.",
    "reference": null,
    "point_id": null
  },
  {
    "id": "EVIDENCE-004",
    "date": "2026-08-27",
    "kind": "review",
    "description": "Revisión final: commit 381d0ea0a0ac905fd882cb90c8d69e2dd2bebb28 atribuido íntegramente al ticket; sin cambios posteriores en los tres archivos funcionales, sin contratos backend ni sync alterados y sin hallazgos bloqueantes.",
    "reference": "commit:381d0ea0a0ac905fd882cb90c8d69e2dd2bebb28",
    "point_id": null
  }
]
```

## Retests

```json
[]
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
    "technical_summary": "El modal de AlertModalComponent fue reemplazado por el desplegable no bloqueante del nav en escritorio; se omitió la alerta en móvil y se añadieron tres pruebas unitarias.",
    "functional_summary": "El PO confirmó que la alerta funciona correctamente en escritorio y móvil.",
    "qa_status": "approved",
    "qa_waiver_reason": null,
    "po_confirmation": "PO confirmó: ya lo probé y quedó bien (2026-08-27).",
    "release_impact": "Cambio publicado en dev mediante commit 381d0ea0a0ac905fd882cb90c8d69e2dd2bebb28; continúa unreleased y no se realizó despliegue de producción."
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
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-08-27",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-08-27",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-08-27",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-08-27",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-08-27",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-002."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-08-27",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-003."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-08-27",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-08-27",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-004."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-08-27",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-08-27",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-08-27",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-014",
    "date": "2026-08-27",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-015",
    "date": "2026-08-27",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-016",
    "date": "2026-08-27",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-017",
    "date": "2026-09-07",
    "action": "release-transition",
    "actor": "cli",
    "details": "Release: unreleased -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-018",
    "date": "2026-09-07",
    "action": "release-transition",
    "actor": "cli",
    "details": "Release: planned -> released."
  }
]
```
