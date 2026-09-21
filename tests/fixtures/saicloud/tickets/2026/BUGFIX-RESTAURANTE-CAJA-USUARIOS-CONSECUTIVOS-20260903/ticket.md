---
schema_version: 1
id: BUGFIX-RESTAURANTE-CAJA-USUARIOS-CONSECUTIVOS-20260903
title: Corregir compartir caja, usuario de una sucursal y consecutivo por sede
type: BUGFIX
module: RESTAURANTE
workflow_status: closed
qa_status: approved
release_status: released
user_visible: true
sync_impact: false
migration_impact: false
docker_impact: false
risk_level: high
created: 2026-09-03
updated: 2026-09-17
related_ticket: null
target_release: 6.2.5
released_in: 6.2.5
---

# BUGFIX-RESTAURANTE-CAJA-USUARIOS-CONSECUTIVOS-20260903

## Solicitud original

Tengo tres incidencias relacionadas con la operación de restaurante: (1) al abrir caja desde Point, Compartir caja filtra correctamente los cajeros de la sucursal activa —incluidos los usuarios con todas las sucursales que tienen asignada la sede—, pero desde Cierre de caja o Arqueo se muestran todos los usuarios; debe usarse el mismo filtro. (2) Al crear un usuario con Todas las sucursales = No, Guardar muestra Debe marcar al menos una sucursal para el cajero, aunque la pestaña Sucursales no se habilita y el usuario solo debe operar en su sucursal principal. (3) Al seleccionar la sucursal 8, zonas y mesas corresponden a esa sede, pero al facturar se muestra y usa el consecutivo de la sucursal principal (1); debe usarse el consecutivo configurado para la sede activa.

## Descripción funcional

- Alcance: operación de caja compartida, alta de cajeros y facturación de Restaurante por sucursal. No incluye cambios de esquema, Docker, despliegue ni sincronización.
- Usuario o rol afectado: cajeros y administradores que comparten caja, crean usuarios o facturan en una sede distinta a la principal.
- Comportamiento actual: los tres puntos se describen en `POINT-001` a `POINT-003`.
- Comportamiento esperado: las opciones, validaciones y consecutivos respetan la sucursal activa o la sucursal principal según corresponda, sin exponer usuarios ni usar numeración de otra sede.

## Diagnóstico

- Archivos y flujo investigados: `share-cash-register-modal.component.ts` carga el catálogo completo de usuarios; `point.component.ts` ya filtra el catálogo por `active_branch`. `adm-user.component.ts` oculta la pestaña Sucursales con `all_branch=false`, pero valida `checkedBranchCount` para cualquier cajero. `point.component.ts` obtiene la configuración de facturación por sede con `BranchContextService`, mientras `restaurant.service.ts` reconstruye la orden desde `UserInvoice` de la sucursal principal.
- Causa raíz o hipótesis: filtros y fuentes de configuración de sucursal no están unificados entre las entradas de un mismo flujo. Es necesaria validación de servidor para mantener el aislamiento si un cliente manipula la lista visible.
- Riesgos y compatibilidad: `POINT-001` es control de acceso entre sucursales; `POINT-003` afecta numeración y resolución de facturación. La corrección debe preservar usuarios de una sola sucursal, usuarios con asignaciones activas múltiples, cajas compartidas existentes y órdenes iniciadas antes del cambio.
- Impactos de sync, migración, Docker o despliegue: no se identifican modificaciones a OfflineSync, SincSaiCloud, migraciones, Docker, WebSocket ni agentes locales. El endpoint existente de configuración por sede debe conservar su contrato.
- Hallazgo DQA posterior al cierre (`POINT-004`): el fallo no queda contenido si IndexedDB no trae una asignación vigente o falla `pos/get_user_branch_config`: ambos flujos conservan silenciosamente `UserInvoice` de la sucursal principal. Además, la reconciliación de órdenes compara `Open`, aunque Restaurante persiste `Abierta`; el backend acepta el par consecutivo/sucursal enviado por el cliente sin verificar su pertenencia.

## Plan

- Gate de plan y aprobación del PO: aprobación explícita requerida antes de implementar por riesgo alto de aislamiento entre sucursales y facturación. Aprobado explícitamente por el PO el 2026-09-03: “si dale”.
- Alcance y exclusiones: corregir los tres puntos del ticket y sus pruebas dirigidas; excluir cambios de numeración ya emitida, migraciones, datos de producción y despliegue.
- Pasos ordenados:
  1. `POINT-001`: centralizar el criterio de candidatos de una caja por `id_admcompanybranch`, aplicarlo en el modal de cierre y arqueo y reforzar el endpoint de compartir para que rechace destinatarios fuera de la sede. Añadir pruebas de usuarios de sede principal, multi-sucursal activa y sede ajena.
  2. `POINT-002`: condicionar la validación de al menos una asignación explícita a cajeros con `all_branch=true`; conservar la sucursal principal obligatoria para el modo de una sola sede. Añadir prueba de creación y de regresión del modo multi-sucursal.
  3. `POINT-003`: hacer que el carrito use la misma configuración de sucursal activa ya resuelta en Point (consecutivo, devolución, bodega y terminal) antes de crear, mostrar o cerrar una orden. Verificar además que el backend facture el consecutivo que pertenece a la orden y a su sede.
  4. Ejecutar pruebas unitarias dirigidas de Angular y Django; entregar al PO un recorrido manual con dos sucursales y consecutivos distintos, sin alterar consecutivos productivos.
- Ajuste tras QA-002, aprobado explícitamente por el PO el 2026-09-03: al cargar una orden abierta, reemplazar y persistir su consecutivo normal por el configurado para la sucursal activa antes de permitir pago o facturación. La facturación alterna no tiene configuración por sucursal: debe quedar deshabilitada y rechazada por el servicio fuera de la sucursal principal del usuario, sin modificar su contrato dentro de esa sede.
- Rollback, backup, canario u orden de despliegue cuando aplique: no hay migración ni Docker. El rollback es revertir el cambio de frontend/backend de este ticket antes de publicarlo; la prueba de PO debe usar un entorno con datos de prueba y consecutivos diferenciables.
- Ajuste DQA-POINT-004, aprobado explícitamente por el PO el 2026-09-04: (1) Point debe resolver una configuración válida de la sucursal activa antes de navegar al carrito y bloquear con alerta si no tiene consecutivo o terminal válidos; (2) el carrito vuelve a comprobar la configuración para órdenes nuevas y `Abierta`, sin fallback a la sede principal; (3) Django rechaza guardar o facturar una orden si su consecutivo no pertenece a `id_admcompanybranch`; (4) pruebas dirigidas cubren cambio 5→8, configuración ausente/error, orden nueva y abierta, y rechazo backend. No se cambian consecutivos emitidos, esquemas, sync ni despliegue. Rollback: revertir selectivamente el commit funcional antes de publicar; no mutar datos facturados.
- Ajuste DQA-POINT-005: una actualización asíncrona de `Users` dentro del carrito debe volver a aplicar la configuración ya validada para la sucursal activa. Si faltan consecutivo o terminal, debe alertar y volver a Point; no puede conservar `UserInvoice` de la sucursal principal. El error HTTP 400 de guardado debe mostrar `response` o `detail` del backend. Se conserva el contrato de `Users` y no hay cambios de esquema, sync ni despliegue.

## Criterios de aceptación

- [ ] POINT-001: desde Point, Arqueo y Cierre, compartir caja muestra el mismo conjunto de cajeros elegibles de la sucursal de la caja; no se pueden compartir usuarios de otra sede ni mediante petición directa.
- [ ] POINT-002: un cajero con Todas las sucursales = No y sucursal principal válida se guarda sin abrir la pestaña Sucursales; un cajero multi-sucursal sigue requiriendo al menos una sede marcada.
- [ ] POINT-003: en la sucursal 8, la ventana de pagos, la orden creada y la factura usan su consecutivo configurado, no el de la sucursal 1; zonas y mesas permanecen filtradas por la sede activa.
- [ ] POINT-003: al reingresar a una orden abierta, se reemplaza y persiste el consecutivo normal de otra sede antes de facturar; Facturar alterno está deshabilitado fuera de la sucursal principal y no puede invocarse por código en esa condición.
- [ ] POINT-004: un cajero con sucursal principal 5 y sede activa 8 no puede abrir ni facturar una orden con consecutivo de la 5; si la configuración de la 8 falta o no puede verificarse, recibe una alerta y permanece fuera del carrito. La validación del backend impide el mismo cruce aunque el cliente envíe un payload manipulado.

## Puntos

<!-- Crear POINT-NNN es append-only: no eliminar, reordenar ni reutilizar. Las transiciones solo las realiza el CLI, actualizan el punto actual y anexan un ticket-event. -->

```json
[
  {
    "id": "POINT-001",
    "title": "Compartir caja desde cierre o arqueo expone usuarios de otras sucursales",
    "status": "closed",
    "severity": "high",
    "actual": "El modal abierto desde cierre de caja o arqueo carga todos los usuarios y solo descarta dueño, compartidos y no cajeros; no considera la sucursal de la caja.",
    "expected": "El modal debe ofrecer únicamente cajeros con acceso vigente a la sucursal de la caja: sucursal principal igual o asignación activa de esa sucursal para usuarios de todas las sucursales.",
    "evidence": [
      "EVIDENCE-001"
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
  },
  {
    "id": "POINT-002",
    "title": "Crear cajero de una sola sucursal exige una asignación no disponible",
    "status": "closed",
    "severity": "high",
    "actual": "Con Todas las sucursales en No, la pestaña Sucursales queda oculta pero la validación exige marcar al menos una sucursal antes de guardar.",
    "expected": "Un cajero de una sola sucursal debe poder guardarse usando su sucursal principal, sin requerir una fila de asignación múltiple.",
    "evidence": [
      "EVIDENCE-002"
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
  },
  {
    "id": "POINT-003",
    "title": "La facturación de restaurante conserva el consecutivo de la sucursal principal",
    "status": "closed",
    "severity": "critical",
    "actual": "Al operar en la sucursal 8, Point resuelve la configuración de esa sede, pero el carrito crea la orden con el consecutivo de UserInvoice asociado a la sucursal principal.",
    "expected": "La ventana de pagos, la orden y la factura deben mostrar y usar el consecutivo configurado para la sucursal activa, conservando el aislamiento de zonas, mesas y caja.",
    "evidence": [
      "EVIDENCE-003",
      "EVIDENCE-005",
      "EVIDENCE-006",
      "EVIDENCE-007"
    ],
    "affected_files": [],
    "diagnosis": null,
    "solution": null,
    "tests": [],
    "qa_cycles": [
      "QA-001",
      "QA-005"
    ],
    "terminal_reason": null,
    "related_ticket": null
  },
  {
    "id": "POINT-004",
    "title": "El carrito puede facturar con consecutivo de la sucursal principal tras seleccionar otra sede",
    "status": "closed",
    "severity": "critical",
    "actual": "La resolución de configuración cae silenciosamente al consecutivo de UserInvoice cuando falta la asignación local o falla la consulta; las órdenes existentes con estado Abierta no se reconcilian porque el frontend compara Open, y el backend no rechaza un consecutivo ajeno a la sucursal de la orden.",
    "expected": "Para un cajero en una sucursal activa distinta a su principal, Point y el carrito solo permiten continuar con una configuración válida de esa sucursal. Si no se puede resolver o validar, muestran una alerta y regresan a Point; el backend rechaza guardar o facturar órdenes cuyo consecutivo no pertenece a la sucursal de la orden.",
    "evidence": [],
    "affected_files": [],
    "diagnosis": null,
    "solution": null,
    "tests": [],
    "qa_cycles": [
      "QA-013"
    ],
    "terminal_reason": null,
    "related_ticket": null
  },
  {
    "id": "POINT-005",
    "title": "La actualización del usuario sobrescribe el consecutivo de la sede activa en el carrito",
    "status": "closed",
    "severity": "critical",
    "actual": "Tras cambiar desde Point a la sucursal 4, el listener de IndexedDB para Users reemplaza user_invoice por UserInvoice de la sucursal principal y muestra Usuario actualizado; la orden nueva vuelve a crear con 1PO y el backend la rechaza al guardar por pertenecer a otra sucursal.",
    "expected": "Toda actualización del usuario debe revalidar y restaurar el consecutivo, terminal y bodega de la sucursal activa; si no se logra, debe bloquear el carrito. Los errores 400 del backend deben mostrarse textualmente en el toast.",
    "evidence": [
      "EVIDENCE-008",
      "EVIDENCE-009"
    ],
    "affected_files": [],
    "diagnosis": null,
    "solution": null,
    "tests": [],
    "qa_cycles": [
      "QA-013"
    ],
    "terminal_reason": null,
    "related_ticket": null
  }
]
```

## Implementación

- Archivos cambiados: `FrontEnd/src/app/modals/Pos/share-cash-register-modal/share-cash-register-modal.component.ts`, `FrontEnd/src/app/mod-restaurant/restaurant/point/point.component.ts`, `FrontEnd/src/app/administration/users/user/adm-user.component.ts`, `FrontEnd/src/app/common/services/restaurant.service.ts` y sus pruebas; `Backend/ModPos/views/functions.py` y `Backend/ModPos/tests/test_cash_register_share.py`.
- Decisiones técnicas: se usa el mismo criterio de acceso que ya valida el servidor: sucursal principal o fila `AdmUserBranch` activa. La respuesta de detalle de caja añade `id_admcompanybranch` sin cambiar el campo legado `company_branch`. El carrito toma consecutivo, devolución, bodega, terminal, formas de pago y sucursal de la sede activa; si no existe una asignación explícita conserva el fallback histórico de `UserInvoice`. Al recargar una orden abierta de la sede activa, compara y reemplaza su consecutivo normal antes de reconstruir la pantalla y persiste esa sustitución; no toca órdenes cerradas ni de otra sede. La facturación alterna mantiene su configuración histórica, pero solo se habilita y acepta en la sucursal principal del usuario.
- Compatibilidad preservada: las cajas históricas sin sucursal continúan usando la sucursal principal; usuarios sin `UserBranches` continúan operando en su sucursal principal; no hay migraciones ni cambios de contrato destructivos.
- Commits atribuibles al ticket: `0c31b8a22f9338049025809a9ec1a8f8ed305a12` — corrección inicial de los tres puntos, publicada en `dev`; `9e447a87c2eb08c072d631ab308983bd1cd0a58e` — reconcilia y persiste el consecutivo de órdenes abiertas por sucursal y protege la facturación alterna fuera de la sucursal principal; `e8774e9c30fad742461c39cfbcda8c6d971d6570` — bloquea fallback de consecutivo en sedes secundarias y valida el par consecutivo/sucursal en frontend y backend.
- Ajuste en curso `POINT-004`: `branch-context.service.ts` deja de entregar el fallback local ante error y consume la marca compatible `branch_configured`; Point revierte el cambio de sede y alerta si no obtiene consecutivo/terminal válidos; el carrito bloquea su carga para una sede secundaria sin asignación local válida; la reconciliación incluye el estado real `Abierta`. Django marca la ausencia de configuración explícita por sucursal y valida en guardar/cerrar que el consecutivo pertenezca a la sucursal de la orden.
- Ajuste `POINT-005`: el listener de cambios de IndexedDB para `Users` usa `refreshUserBranchConfig()` para reconstruir la configuración y volver a aplicar el binding de `active_branch`; ante una configuración inválida alerta y navega a Point. Se retiró el toast verde automático porque no confirma una acción del usuario. `processSaveOrder()` muestra el motivo devuelto por el backend antes de recurrir al mensaje genérico.

## Pruebas

- Comandos para el PO:
  - Desde `FrontEnd/`: `npm test -- --watch=false --browsers=ChromeHeadless --include='src/app/modals/Pos/share-cash-register-modal/share-cash-register-modal.component.spec.ts'`
  - Desde `FrontEnd/`: `npm test -- --watch=false --browsers=ChromeHeadless --include='src/app/administration/users/user/adm-user.component.spec.ts'`
  - Desde `FrontEnd/`: `npm test -- --watch=false --browsers=ChromeHeadless --include='src/app/common/services/restaurant.service.spec.ts'`
  - Desde `FrontEnd/`: `npm test -- --watch=false --browsers=ChromeHeadless --include='src/app/mod-restaurant/restaurant/point/point.component.spec.ts'`
  - Desde `FrontEnd/`: `npm run build -- --configuration development`
  - Desde `Backend/`, con el entorno Python/Django del proyecto activo: `python manage.py test ModPos.tests.test_cash_register_share.OpenCashRegisterSharedUsersTest --keepdb`
- Directorio de ejecución: los cinco primeros comandos se ejecutan en `FrontEnd/`; la prueba Django se ejecuta en `Backend/`.
- Resultado esperado: las suites Angular y el build finalizan exitosamente; Django confirma que el detalle de una caja devuelve la sucursal real de su apertura.
- Validaciones manuales: con sucursales 1 y 8, crear dos cajeros de sede única y uno multi-sucursal asignado a la 8. Abrir caja en la 8 y verificar que Point, Arqueo y Cierre solo permitan los dos candidatos con acceso a la 8. Crear un cajero con Todas las sucursales en No y confirmar que guarda. En la sede 8, abrir una mesa y comprobar en pagos y factura el prefijo/consecutivo de la 8, no el de la 1.
- Requisitos de ambiente o datos: tenant de pruebas con las sucursales 1 y 8, zonas/mesas para la 8, consecutivos distintos por sede y permisos de compartir caja habilitados para quien abre.
- Resultado local: las cuatro suites Angular dirigidas y el build pasaron. La prueba Django no se ejecutó porque el Python local no dispone de Django; `py_compile` de los dos archivos backend pasó.
- Resultado comunicado por el PO: fallo en `POINT-003` sobre dev en nube. En sucursal 4 Pance, con FEP configurado, la primera orden mostró y emitió `1PO-1953` con resolución TTT; después de facturarla, la siguiente orden mostró el consecutivo correcto. Evidencia visual aportada por el PO el 2026-09-03.
- Resultado local del ajuste QA-002: `restaurant.service.spec.ts` ejecutó 28 pruebas exitosas, incluidas las regresiones de orden abierta y facturación alterna; `npm run build` terminó exitosamente. El runner Angular muestra después un aviso espurio de patrón `--include` pese a haber ejecutado la suite; la compilación no presenta errores.
- Resultado local `POINT-004`: desde `FrontEnd/`, las suites `restaurant.service.spec.ts`, `branch-context.service.spec.ts` y `point.component.spec.ts` ejecutaron 82 pruebas exitosas. `npm run build -- --configuration development` terminó exitosamente. Desde `BackEnd/`, `./.venv/bin/python manage.py test ModRestaurant.tests.test_duplicate_order_prevention.DuplicateOrderPreventionTest.test_rejects_a_new_order_with_a_consecutive_from_another_branch --keepdb -v 1` ejecutó 1 prueba en 34.865s: OK. El runner Angular emite después de las pruebas un aviso conocido de patrón `--include`, aunque Karma informa `TOTAL: 82 SUCCESS`.
- Resultado local `POINT-005`: desde `FrontEnd/`, `npm test -- --watch=false --browsers=ChromeHeadless --include='src/app/common/services/restaurant.service.spec.ts'` ejecutó 31 pruebas exitosas, incluidas las regresiones de actualización `Users` y mensaje de validación HTTP 400. `npm run build -- --configuration development` terminó exitosamente. El runner Angular conserva un aviso posterior conocido de patrón `--include` pese a informar `TOTAL: 31 SUCCESS`.
- Suite Angular completa: `npm test -- --watch=false --browsers=ChromeHeadless` se detuvo con salida 1 después de 447 de 621 pruebas por un `Unhandled Promise rejection` preexistente en `FrontEnd/src/app/administration/partners/partner/adm-partner.component.ts:563` (`Cannot read properties of undefined (reading 'id')`). No pertenece a los archivos del ticket; las suites dirigidas y el build del cambio pasaron. Publicación selectiva a `dev` autorizada explícitamente por el PO para su prueba en nube.
- Validación manual DQA `POINT-004`: con cajero cuya sucursal principal sea 5 y asignación válida en 8, entrar a Point, seleccionar 8 y probar una orden nueva y una existente `Abierta`: ambas deben mostrar/emitir el consecutivo de 8. Después, retirar temporalmente el consecutivo o terminal de la asignación de 8 y repetir: debe mostrarse la alerta y permanecer o volver a Point, sin entrar al carrito ni facturar. Restaurar la configuración al finalizar. Confirmar además que un intento directo de guardar una orden con sucursal 8 y consecutivo de 5 recibe rechazo.
- Retest DQA `POINT-005`: iniciar sesión con sucursal principal 1, entrar a Point, seleccionar sucursal 4 y abrir una orden nueva. Aunque aparezca una actualización del usuario, la ventana de pagos debe conservar el prefijo `FCI` configurado para la 4, nunca `1PO`. Si se intenta guardar con un consecutivo cruzado, el toast debe decir “El consecutivo no corresponde a la sucursal de la orden.”, no el mensaje genérico.
- Validaciones manuales adicionales: en la sucursal 4 Pance, abrir una orden existente que haya quedado con `1PO`; antes de pagar debe mostrarse `FEP` y, al salir/reingresar sin facturar, debe seguir `FEP`. Verificar que `Facturar alterno` se muestre deshabilitado y que no emita documento; en la sucursal principal, validar que conserva su flujo alterno habitual.

## QA

```json
[
  {
    "id": "QA-001",
    "date": "2026-09-03",
    "build_reference": "commit:0c31b8a22f9338049025809a9ec1a8f8ed305a12",
    "environment": "dev en nube, sucursal 4 Pance",
    "result": "pending",
    "findings": [],
    "correction": null,
    "po_confirmation": null
  },
  {
    "id": "QA-002",
    "date": "2026-09-03",
    "build_reference": null,
    "environment": null,
    "result": "failed",
    "findings": [],
    "correction": null,
    "po_confirmation": "El PO confirmó el fallo de POINT-003 en dev con las capturas aportadas."
  },
  {
    "id": "QA-003",
    "date": "2026-09-03",
    "build_reference": "commit:9e447a87c2eb08c072d631ab308983bd1cd0a58e",
    "environment": "dev en nube, validación final del PO",
    "result": "pending",
    "findings": [],
    "correction": null,
    "po_confirmation": null
  },
  {
    "id": "QA-004",
    "date": "2026-09-03",
    "build_reference": null,
    "environment": null,
    "result": "approved",
    "findings": [],
    "correction": null,
    "po_confirmation": "El PO confirmó: ya validó y no se reprodujo el error."
  },
  {
    "id": "QA-005",
    "date": "2026-09-03",
    "build_reference": "commit:9e447a87c2eb08c072d631ab308983bd1cd0a58e",
    "environment": "dev en nube, retest aprobado del PO",
    "result": "pending",
    "findings": [],
    "correction": null,
    "po_confirmation": null
  },
  {
    "id": "QA-006",
    "date": "2026-09-03",
    "build_reference": null,
    "environment": null,
    "result": "approved",
    "findings": [],
    "correction": null,
    "po_confirmation": "El PO confirmó: ya validó y no se reprodujo el error."
  },
  {
    "id": "QA-007",
    "date": "2026-09-04",
    "build_reference": "commit:9e447a87c2eb08c072d631ab308983bd1cd0a58e",
    "environment": "dev en nube, retest aprobado del PO",
    "result": "pending",
    "findings": [],
    "correction": null,
    "po_confirmation": null
  },
  {
    "id": "QA-008",
    "date": "2026-09-04",
    "build_reference": null,
    "environment": null,
    "result": "changes_requested",
    "findings": [
      "DQA reporta persistencia del consecutivo de la sucursal principal al operar en una sucursal activa distinta; se requiere retest de órdenes nuevas y abiertas."
    ],
    "correction": null,
    "po_confirmation": null
  },
  {
    "id": "QA-009",
    "date": "2026-09-04",
    "build_reference": "commit:d79128b16b6baf90caae019229635590fee9e07d",
    "environment": "dev en nube, sucursal 4",
    "result": "pending",
    "findings": [],
    "correction": null,
    "po_confirmation": null
  },
  {
    "id": "QA-010",
    "date": "2026-09-04",
    "build_reference": null,
    "environment": null,
    "result": "changes_requested",
    "findings": [],
    "correction": null,
    "po_confirmation": "El PO confirma que al cambiar de sucursal 1 a 4 se sigue mostrando 1PO en una orden nueva; al guardar el backend devuelve que el consecutivo no corresponde a la sucursal."
  },
  {
    "id": "QA-011",
    "date": "2026-09-08",
    "build_reference": "commit:d79128b16b6baf90caae019229635590fee9e07d",
    "environment": "dev en nube, prueba manual del PO",
    "result": "pending",
    "findings": [],
    "correction": null,
    "po_confirmation": null
  },
  {
    "id": "QA-012",
    "date": "2026-09-08",
    "build_reference": null,
    "environment": null,
    "result": "approved",
    "findings": [],
    "correction": null,
    "po_confirmation": "El PO confirma que terminó la prueba en nube y el flujo funcionó correctamente: el consecutivo corresponde a la sucursal activa y el guardado ya no presenta el error."
  },
  {
    "id": "QA-013",
    "date": "2026-09-08",
    "build_reference": "commit:d79128b16b6baf90caae019229635590fee9e07d",
    "environment": "dev en nube, prueba manual confirmada por el PO",
    "result": "pending",
    "findings": [],
    "correction": null,
    "po_confirmation": null
  },
  {
    "id": "QA-014",
    "date": "2026-09-08",
    "build_reference": null,
    "environment": null,
    "result": "approved",
    "findings": [],
    "correction": null,
    "po_confirmation": "El PO confirma que terminó la prueba en nube y el flujo funcionó correctamente: el consecutivo corresponde a la sucursal activa y el guardado ya no presenta el error."
  }
]
```

## Evidencia

```json
[
  {
    "id": "EVIDENCE-001",
    "date": "2026-09-03",
    "kind": "code",
    "description": "El modal de compartir carga Users completo desde IndexedDB y availableUsers no filtra por la sucursal de cash_register; Point sí carga users filtrados por active_branch. Archivos: FrontEnd/src/app/modals/Pos/share-cash-register-modal/share-cash-register-modal.component.ts y FrontEnd/src/app/mod-restaurant/restaurant/point/point.component.ts.",
    "reference": null,
    "point_id": "POINT-001"
  },
  {
    "id": "EVIDENCE-002",
    "date": "2026-09-03",
    "kind": "code",
    "description": "validationInvoceParam exige checkedBranchCount para todo cajero, mientras showSucursalesTab solo muestra la tabla cuando all_branch es verdadero. Archivo: FrontEnd/src/app/administration/users/user/adm-user.component.ts.",
    "reference": null,
    "point_id": "POINT-002"
  },
  {
    "id": "EVIDENCE-003",
    "date": "2026-09-03",
    "kind": "code",
    "description": "Point resuelve configuración por sede mediante BranchContext, pero RestaurantService carga UserInvoice y crea la orden con id_admconsecutive_pos de la sucursal principal. Archivos: FrontEnd/src/app/mod-restaurant/restaurant/point/point.component.ts y FrontEnd/src/app/common/services/restaurant.service.ts.",
    "reference": null,
    "point_id": "POINT-003"
  },
  {
    "id": "EVIDENCE-004",
    "date": "2026-09-03",
    "kind": "test",
    "description": "Pruebas Angular dirigidas exitosas: modal compartir caja (13), usuario (21), RestaurantService (25) y Point (38); build Angular de desarrollo exitoso. La prueba Django quedó pendiente por ausencia local de Django; py_compile de ModPos/views/functions.py y su prueba pasó.",
    "reference": null,
    "point_id": null
  },
  {
    "id": "EVIDENCE-005",
    "date": "2026-09-03",
    "kind": "manual",
    "description": "Capturas del PO: Pance tiene FEP configurado, pero la ventana de pagos mostró 1PO-1953 con resolución TTT y el registro emitido conservó 1PO-1953. Luego de facturar, la siguiente orden mostró el consecutivo correcto.",
    "reference": null,
    "point_id": "POINT-003"
  },
  {
    "id": "EVIDENCE-006",
    "date": "2026-09-03",
    "kind": "test",
    "description": "El ajuste QA-002 reconcilia y persiste el consecutivo normal de una orden abierta en la sucursal activa; bloquea la facturación alterna fuera de la sucursal principal. restaurant.service.spec.ts ejecutó 28 pruebas exitosas y npm run build terminó correctamente.",
    "reference": null,
    "point_id": "POINT-003"
  },
  {
    "id": "EVIDENCE-007",
    "date": "2026-09-03",
    "kind": "manual",
    "description": "Retest final del PO en dev: validó el ajuste y confirmó que ya no se reproduce el error de consecutivo.",
    "reference": null,
    "point_id": "POINT-003"
  },
  {
    "id": "EVIDENCE-008",
    "date": "2026-09-04",
    "kind": "test",
    "description": "La regresión de actualización de Users restaura el consecutivo de la sucursal activa y la regresión de guardado expone response del HTTP 400; FrontEnd/src/app/common/services/restaurant.service.spec.ts informó TOTAL: 31 SUCCESS.",
    "reference": null,
    "point_id": "POINT-005"
  },
  {
    "id": "EVIDENCE-009",
    "date": "2026-09-04",
    "kind": "build",
    "description": "La compilación Angular de desarrollo terminó exitosamente con npm run build -- --configuration development desde FrontEnd/.",
    "reference": null,
    "point_id": "POINT-005"
  }
]
```

## Retests

```json
[
  {
    "id": "RETEST-001",
    "date": "2026-09-03",
    "point_id": "POINT-003",
    "result": "failed",
    "evidence": [],
    "po_confirmation": "El PO reporta que la primera factura en Pance mostró y emitió 1PO-1953/TTT aunque la configuración de la sucursal 4 es FEP; tras facturar esa orden, las siguientes se muestran correctamente."
  },
  {
    "id": "RETEST-002",
    "date": "2026-09-03",
    "point_id": "POINT-001",
    "result": "approved",
    "evidence": [],
    "po_confirmation": "El PO confirmó la validación final del ticket sin errores."
  },
  {
    "id": "RETEST-003",
    "date": "2026-09-03",
    "point_id": "POINT-002",
    "result": "approved",
    "evidence": [],
    "po_confirmation": "El PO confirmó la validación final del ticket sin errores."
  },
  {
    "id": "RETEST-004",
    "date": "2026-09-03",
    "point_id": "POINT-003",
    "result": "approved",
    "evidence": [],
    "po_confirmation": "El PO confirmó que el error de consecutivo ya no se reproduce."
  },
  {
    "id": "RETEST-005",
    "date": "2026-09-08",
    "point_id": "POINT-004",
    "result": "approved",
    "evidence": [],
    "po_confirmation": "El PO confirma que el consecutivo de la sucursal activa se conserva al crear y guardar la orden."
  },
  {
    "id": "RETEST-006",
    "date": "2026-09-08",
    "point_id": "POINT-005",
    "result": "approved",
    "evidence": [],
    "po_confirmation": "El PO confirma que probó nuevamente y el flujo funcionó correctamente."
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
    "date": "2026-09-03",
    "technical_summary": "Se unificó el filtro de caja compartida por sucursal, se corrigió la validación de usuarios de una sede y se reconcilia el consecutivo de órdenes abiertas con la sucursal activa; la facturación alterna queda protegida fuera de la sucursal principal.",
    "functional_summary": "El PO validó en dev y confirmó que el error de consecutivo ya no se reproduce.",
    "qa_status": "approved",
    "qa_waiver_reason": null,
    "po_confirmation": "El PO solicitó cerrar el ticket tras validar que no se presentó el error.",
    "release_impact": "El ticket queda cerrado funcionalmente y continúa unreleased; no se realizó PR, tag ni despliegue de producción."
  },
  {
    "kind": "ticket-close",
    "id": "CLOSE-002",
    "date": "2026-09-08",
    "technical_summary": "Se corrigió la resolución del consecutivo por sucursal en Point y Restaurante; las actualizaciones de Users reaplican la configuración de la sucursal activa y los 400 muestran el motivo del backend. Pruebas Angular dirigidas y build exitosos.",
    "functional_summary": "El cajero puede cambiar de sucursal y crear/guardar órdenes con el consecutivo correspondiente; si la configuración no es válida, el flujo se bloquea y alerta. El PO confirmó la prueba exitosa en dev.",
    "qa_status": "approved",
    "qa_waiver_reason": null,
    "po_confirmation": "El PO confirma que ya probó y funcionó correctamente.",
    "release_impact": "Ticket cerrado funcionalmente y no publicado a producción; release_status permanece unreleased."
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
    "date": "2026-09-03",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-09-03",
    "action": "point-added",
    "actor": "cli",
    "details": "Se agregó POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-09-03",
    "action": "point-added",
    "actor": "cli",
    "details": "Se agregó POINT-002."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-09-03",
    "action": "point-added",
    "actor": "cli",
    "details": "Se agregó POINT-003."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-09-03",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-09-03",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-002."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-09-03",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-003."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-09-03",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-09-03",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-09-03",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-09-03",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-09-03",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-004."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-09-03",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-014",
    "date": "2026-09-03",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-015",
    "date": "2026-09-03",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-016",
    "date": "2026-09-03",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-002: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-017",
    "date": "2026-09-03",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-002: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-018",
    "date": "2026-09-03",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-002: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-019",
    "date": "2026-09-03",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-003: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-020",
    "date": "2026-09-03",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-003: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-021",
    "date": "2026-09-03",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-003: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-022",
    "date": "2026-09-03",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-023",
    "date": "2026-09-03",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-024",
    "date": "2026-09-03",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-025",
    "date": "2026-09-03",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-001 para POINT-003."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-026",
    "date": "2026-09-03",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado failed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-027",
    "date": "2026-09-03",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> changes_requested."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-028",
    "date": "2026-09-03",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-005."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-029",
    "date": "2026-09-03",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: changes_requested -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-030",
    "date": "2026-09-03",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-006."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-031",
    "date": "2026-09-03",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-003: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-032",
    "date": "2026-09-03",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-033",
    "date": "2026-09-03",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-007."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-034",
    "date": "2026-09-03",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-035",
    "date": "2026-09-03",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-003."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-036",
    "date": "2026-09-03",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-004 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-037",
    "date": "2026-09-03",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-005."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-038",
    "date": "2026-09-03",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-002 para POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-039",
    "date": "2026-09-03",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-003 para POINT-002."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-040",
    "date": "2026-09-03",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-004 para POINT-003."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-041",
    "date": "2026-09-03",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-006 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-042",
    "date": "2026-09-03",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: verified -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-043",
    "date": "2026-09-03",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-002: verified -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-044",
    "date": "2026-09-03",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-003: verified -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-045",
    "date": "2026-09-03",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-046",
    "date": "2026-09-03",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-047",
    "date": "2026-09-03",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-048",
    "date": "2026-09-04",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: closed -> changes_requested. Reapertura por hallazgo: DQA reporta persistencia del consecutivo de la sucursal principal al operar en una sucursal activa distinta; se requiere retest de órdenes nuevas y abiertas."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-049",
    "date": "2026-09-04",
    "action": "point-added",
    "actor": "cli",
    "details": "Se agregó POINT-004."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-050",
    "date": "2026-09-04",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: changes_requested -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-051",
    "date": "2026-09-04",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-004: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-052",
    "date": "2026-09-04",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-004: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-053",
    "date": "2026-09-04",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-004: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-054",
    "date": "2026-09-04",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-055",
    "date": "2026-09-04",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-056",
    "date": "2026-09-04",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-009."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-057",
    "date": "2026-09-04",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-010 con resultado changes_requested."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-058",
    "date": "2026-09-04",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> changes_requested."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-059",
    "date": "2026-09-04",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: changes_requested -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-060",
    "date": "2026-09-04",
    "action": "point-added",
    "actor": "cli",
    "details": "Se agregó POINT-005."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-061",
    "date": "2026-09-04",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-005: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-062",
    "date": "2026-09-04",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-005: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-063",
    "date": "2026-09-04",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-008."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-064",
    "date": "2026-09-04",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-009."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-065",
    "date": "2026-09-04",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-005: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-066",
    "date": "2026-09-04",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-067",
    "date": "2026-09-08",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-068",
    "date": "2026-09-08",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-011."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-069",
    "date": "2026-09-08",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-012 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-070",
    "date": "2026-09-08",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-013."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-071",
    "date": "2026-09-08",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-005 para POINT-004."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-072",
    "date": "2026-09-08",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-006 para POINT-005."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-073",
    "date": "2026-09-08",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-004: verified -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-074",
    "date": "2026-09-08",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-005: verified -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-075",
    "date": "2026-09-08",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-014 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-076",
    "date": "2026-09-08",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-077",
    "date": "2026-09-08",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-002."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-078",
    "date": "2026-09-08",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-079",
    "date": "2026-09-17",
    "action": "release-transition",
    "actor": "cli",
    "details": "Release: unreleased -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-080",
    "date": "2026-09-17",
    "action": "release-transition",
    "actor": "cli",
    "details": "Release: planned -> released."
  }
]
```
