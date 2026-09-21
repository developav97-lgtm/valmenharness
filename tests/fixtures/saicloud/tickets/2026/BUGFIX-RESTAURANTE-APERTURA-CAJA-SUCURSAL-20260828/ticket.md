---
schema_version: 1
id: BUGFIX-RESTAURANTE-APERTURA-CAJA-SUCURSAL-20260828
title: Respetar sucursal de trabajo y bloquear apertura de caja
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
created: 2026-08-28
updated: 2026-09-07
related_ticket: null
target_release: 6.2.4
released_in: 6.2.4
---

# BUGFIX-RESTAURANTE-APERTURA-CAJA-SUCURSAL-20260828

## Solicitud original

Revisar la apertura de caja en Restaurante. Un usuario con sucursal predeterminada 1 selecciona la sucursal de trabajo 4 en el modal y abre Caja-11; al refrescar se vuelve a solicitar apertura y en Arqueo/Cierres el registro queda asociado a la sucursal 1, no a la sucursal seleccionada. Además, el modal permite cerrarse al hacer clic fuera, dejando acceso a mesas sin caja abierta. El modal solo debe cerrarse tras una apertura de caja exitosa.

## Descripción funcional

- Alcance: apertura de caja para el rol Cajero en Restaurante, cuando cambia la sucursal de trabajo desde el selector principal o el selector incluido en el modal.
- Usuario o rol afectado: cajeros con una sucursal predeterminada en `AdmUser` y acceso a más de una sucursal operativa.
- Comportamiento actual: al abrir con una sucursal distinta a la predeterminada, el registro queda asociado a la sucursal predeterminada. En el siguiente arranque la consulta se filtra por la sucursal activa y no encuentra esa caja, por lo que vuelve a pedir apertura. El backdrop también puede cerrar el modal y dejar disponible la vista de mesas.
- Comportamiento esperado: el registro conserva la sucursal de trabajo activa, el reinicio recupera la caja de esa misma sucursal y el modal no se descarta por interacción fuera de él ni por Escape.

## Diagnóstico

- Archivos y flujo investigados: `FrontEnd/src/app/mod-restaurant/restaurant/point/point.component.ts` actualiza `BranchContextService`, resuelve la configuración por sucursal y consulta `get_cash_register_user` con `active_branch`; su método `openCashRegister()` envía usuario, terminal, turno, fecha, hora y base, pero no `id_admcompanybranch`. `Backend/ModPos/views/functions.py::open_cash_register()` recibe opcionalmente ese campo; cuando falta, usa `AdmUser.id_admbranch`. La plantilla `point.component.html` declara el modal con `data-backdrop` y `data-keyboard`, atributos de Bootstrap 4, aunque la aplicación usa Bootstrap 5.3.
- Causa raíz o hipótesis: confirmada para POINT-001: al faltar `id_admcompanybranch` en el payload, el backend aplica su fallback de sucursal predeterminada. Esto explica que el endpoint de consulta posterior, que sí recibe `active_branch`, no encuentre la caja recién creada. Confirmada para POINT-002: Bootstrap 5 ignora los atributos sin prefijo `data-bs-`, dejando el backdrop y Escape con su comportamiento por defecto de cierre.
- Actualización QA 2026-08-28: confirmada para POINT-003: `resolveCashRegisterForBranch()` invoca `showOpenCashRegisterModal()` cuando no hay caja. Ese método hace clic en el botón disparador `data-bs-toggle="modal"`; si el modal ya está abierto, Bootstrap lo interpreta como *toggle* y lo oculta. La advertencia de configuración incompleta no es la causa, solo hace visible la secuencia. Confirmada para POINT-004: `get_cash_registers()` filtra, carga el nombre y escribe `company_branch` usando `id_admuser__id_admbranch`; debe usar `PosCashRegister.id_admcompanybranch`, que contiene la sucursal real de la apertura.
- Riesgos y compatibilidad: es un flujo financiero visible; se debe preservar el fallback actual para clientes/frontend antiguos que no envíen sucursal, no alterar cajas históricas ni cambiar la posibilidad existente de tener aperturas en sucursales diferentes. La sucursal se debe tomar de la fuente de verdad ya usada por Restaurante (`BranchContextService`), no del valor predeterminado de `AdmUser`.
- Impactos de sync, migración, Docker o despliegue: no requiere migración ni Docker. `PosCashRegister.id_admcompanybranch` ya existe y se sincroniza por el mecanismo vigente; el cambio solo completa su valor al crear nuevas aperturas. No se modifica el contrato de sincronización ni se realiza backfill.

## Plan

- Alcance y exclusiones: corregir el payload de apertura y el bloqueo del modal únicamente en Restaurante. Se conserva el fallback backend para consumidores existentes y no se amplía el trabajo al endurecimiento de autenticación preexistente del endpoint.
- Gate de plan y aprobación del PO: aprobación explícita requerida antes de implementar, por afectar la asociación de aperturas/cierres de caja a una sucursal. Aprobado explícitamente por el PO el 2026-08-28: "apruebo el plan, realiza la implementacion".
- Pasos ordenados:
  1. En `FrontEnd/src/app/mod-restaurant/restaurant/point/point.component.ts`, incluir la sucursal activa de `BranchContextService` en el cuerpo de `pos/open_cash_register`; añadir regresión que compruebe que el payload usa la sucursal seleccionada, no la predeterminada del usuario.
  2. En `Backend/ModPos/tests/test_cash_register_share.py` (o la prueba de endpoint más acotada existente), cubrir que un payload con `id_admcompanybranch` persiste esa sucursal en `PosCashRegister`; conservar y comprobar el caso de fallback cuando el campo está ausente.
  3. En `FrontEnd/src/app/mod-restaurant/restaurant/point/point.component.html`, cambiar a los atributos Bootstrap 5 `data-bs-backdrop="static"` y `data-bs-keyboard="false"`; agregar una prueba de plantilla/regresión o evidencia automatizada viable que garantice esa configuración.
  4. Ejecutar las pruebas unitarias dirigidas de Angular y Django, compilar el frontend y entregar al PO el recorrido manual: seleccionar una sucursal distinta, abrir, recargar, verificar sucursal en Arqueo/Cierres y confirmar que backdrop/Escape no permiten entrar a mesas sin apertura.
- Plan revisado por QA — aprobado explícitamente por el PO el 2026-08-28: "listo dale si implementalo":
  5. POINT-003 — en `FrontEnd/src/app/mod-restaurant/restaurant/point/point.component.ts`, separar el estado de apertura del modal del clic del disparador: si la consulta devuelve que no existe caja y el modal ya está visible, conservarlo abierto; solo ocultarlo cuando la consulta confirme una caja abierta. Agregar regresión que simule cambios consecutivos entre dos sucursales sin caja.
  6. POINT-004 — en `BackEnd/ModPos/views/functions.py::get_cash_registers`, usar `id_admcompanybranch` de `PosCashRegister` para filtrar, obtener el nombre y serializar `company_branch_id`/`company_branch`; mantener el alcance de permisos del endpoint. Agregar prueba que cree una caja con sucursal distinta a la predeterminada del usuario y verifique el CSV y el filtro.
  7. Ejecutar las regresiones de `PointComponent` y de `get_cash_registers`, compilar Angular y repetir en dev el cambio 4 → 5 sin caja y la consulta de cierres con `branch: 0` y con filtro de sucursal.
- Rollback, backup, canario u orden de despliegue cuando aplique: no hay migración ni datos que revertir. Revertir los commits del ticket restaura el fallback anterior; el despliegue sigue el flujo normal de `dev` y requiere prueba del PO antes de cierre.

## Criterios de aceptación

- [ ] POINT-001: un cajero con sucursal predeterminada 1 selecciona la sucursal 4, abre caja y el `PosCashRegister` queda asociado a la sucursal 4.
- [ ] POINT-001: al recargar Restaurante con la sucursal 4 activa, se recupera la apertura existente y no se vuelve a mostrar el modal.
- [ ] POINT-001: una apertura de un consumidor compatible que no envíe sucursal conserva el fallback actual a la sucursal predeterminada.
- [ ] POINT-002: hacer clic fuera del modal o presionar Escape no lo cierra ni permite acceder a las mesas sin una caja abierta.
- [ ] POINT-002: la apertura exitosa conserva el cierre normal del modal y la sesión de caja.
- [ ] POINT-003: cambiar entre dos sucursales sin caja abierta no oculta el modal ni da acceso a mesas; el modal solo se oculta al encontrar una caja abierta o tras apertura exitosa.
- [ ] POINT-004: una caja abierta en Dapa por un usuario cuya sucursal predeterminada es S1 aparece como Dapa en `pos/get_cash_registers` y al seleccionar Dapa en el filtro.
- [ ] POINT-004: `branch: 0` conserva la consulta de todas las sucursales permitidas y no altera los permisos existentes de ADMIN, dueño o usuario compartido.

## Puntos

<!-- Crear POINT-NNN es append-only: no eliminar, reordenar ni reutilizar. Las transiciones solo las realiza el CLI, actualizan el punto actual y anexan un ticket-event. -->

```json
[
  {
    "id": "POINT-001",
    "title": "Apertura de caja usa la sucursal predeterminada en lugar de la sucursal de trabajo",
    "status": "verified",
    "severity": "high",
    "actual": "Al seleccionar una sucursal de trabajo distinta en el modal y abrir la caja, el cierre se registra con la sucursal predeterminada de AdmUser. Al refrescar, el sistema vuelve a solicitar la apertura porque no identifica una caja abierta para la sucursal seleccionada.",
    "expected": "La apertura y el cierre deben persistir y consultar la sucursal seleccionada como sucursal de trabajo en el modal, aun cuando difiera de la sucursal predeterminada del usuario.",
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
      "QA-005"
    ],
    "terminal_reason": null,
    "related_ticket": null
  },
  {
    "id": "POINT-002",
    "title": "El modal de apertura puede cerrarse sin abrir caja",
    "status": "verified",
    "severity": "high",
    "actual": "Un clic fuera del modal de apertura lo cierra y permite llegar a mesas sin una caja abierta.",
    "expected": "El modal de apertura no debe cerrarse por backdrop ni Escape; únicamente se cierra cuando la apertura de caja culmina exitosamente.",
    "evidence": [
      "EVIDENCE-004"
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
    "title": "Cambio entre sucursales sin caja cierra el modal de apertura",
    "status": "verified",
    "severity": "high",
    "actual": "Con el modal ya abierto en una sucursal sin caja, al cambiar a otra sucursal que tampoco tiene caja el modal se oculta y permite permanecer en Restaurante. Al recargar vuelve a aparecer para la última sucursal seleccionada.",
    "expected": "Mientras la sucursal activa no tenga una caja abierta, el modal debe continuar visible al cambiar entre sucursales, incluso si la sucursal carece de parámetros POS o Restaurante; solo se oculta cuando la consulta confirma una caja abierta.",
    "evidence": [
      "EVIDENCE-006"
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
    "id": "POINT-004",
    "title": "Listado de cierres muestra la sucursal predeterminada del usuario",
    "status": "verified",
    "severity": "high",
    "actual": "El endpoint pos/get_cash_registers obtiene, filtra y serializa la sucursal mediante id_admuser.id_admbranch. Por ello una PosCashRegister cuya id_admcompanybranch es Dapa aparece como sucursal 1, la sucursal predeterminada del cajero.",
    "expected": "El listado y su filtro de sucursal deben usar PosCashRegister.id_admcompanybranch, que es la sucursal persistida en la apertura, sin cambiar el alcance de permisos del reporte.",
    "evidence": [
      "EVIDENCE-005",
      "EVIDENCE-007"
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

- Archivos cambiados: `FrontEnd/src/app/mod-restaurant/restaurant/point/point.component.ts`, `point.component.html`, `point.component.spec.ts` y `BackEnd/ModPos/tests/test_cash_register_share.py`.
- Decisiones técnicas: `openCashRegister()` manda `id_admcompanybranch` desde `BranchContextService` mediante `active_branch`; el backend ya validaba y persistía ese campo, por lo que no se alteró su lógica. El modal se configuró con los atributos Bootstrap 5 `data-bs-backdrop="static"` y `data-bs-keyboard="false"`.
- Corrección QA: `showOpenCashRegisterModal()` es idempotente cuando el modal ya está visible, por lo que cambiar entre sucursales sin caja no lo alterna ni lo oculta. `get_cash_registers()` toma la sucursal persistida en `PosCashRegister.id_admcompanybranch` para filtrar y serializar el CSV; solo las cajas históricas sin ese campo conservan el fallback a la sucursal base del usuario.
- Compatibilidad preservada: el backend mantiene el fallback a `AdmUser.id_admbranch` cuando clientes antiguos no envían `id_admcompanybranch`; no se modificaron esquemas ni registros históricos.
- Commits atribuibles al ticket:
  - `5f2e4b93cb9248b263bb97a85d06c457aecb6378` — corrige apertura de caja por sucursal y bloqueo del modal; incorpora regresiones frontend y backend.
  - `54a201eb272be17d3034a541dd24f920f012d7ae` — corrige el modal al alternar sucursales sin caja y la sucursal mostrada/filtrada en cierres.
  - `c23e25cfabaedec518403f3d8b96716ca7b4acdf` — documenta QA aprobada y el cierre funcional del ticket.

## Pruebas

- Comandos para el PO:
  - Desde `FrontEnd/`: `npm test -- --watch=false --browsers=ChromeHeadless --include='src/app/mod-restaurant/restaurant/point/point.component.spec.ts'`
  - Desde `FrontEnd/`: `npx ng build --configuration=production`
  - Desde `BackEnd/`: `./.venv/bin/python manage.py test ModPos.tests.test_cash_register_share.GetCashRegisterUserBranchScopedTest --keepdb`
- Directorio de ejecución: `FrontEnd/` para Angular y `BackEnd/` para Django.
- Resultado esperado: las pruebas dirigidas pasan y la compilación no agrega errores; el recorrido manual conserva la sucursal seleccionada y bloquea el descarte del modal.
- Validaciones manuales: con un cajero cuya sucursal predeterminada difiera de la sucursal de trabajo, seleccionar la segunda en el modal, abrir caja, recargar y revisar Arqueo/Cierres; intentar backdrop y Escape antes de abrir.
- Validaciones manuales QA: con el modal abierto, alternar entre dos sucursales sin caja y otra con configuración incompleta; el modal debe permanecer. Consultar cierres con `branch: 0` y confirmar que la fila de la caja toma la sucursal persistida en `PosCashRegister`, no la sucursal predeterminada del usuario.
- Requisitos de ambiente o datos: tenant de prueba con dos sucursales, caja/terminal configurado para la sucursal de trabajo y usuario Cajero con acceso a ambas.
- Resultado técnico: la prueba dirigida de `PointComponent` pasó 36/36 y `npx ng build --configuration=production` pasó. La suite Angular completa falló en pruebas ajenas de `PosBranchCategoryComponent` por dobles de `IndexDBService` sin `saveData`/`deleteData`. La prueba Django dirigida se detuvo sin borrar datos tras quedar bloqueada en la conexión PostgreSQL remota al reutilizar `test_saiopencloud` con `--keepdb`.
- Resultado técnico del ciclo QA: la regresión nueva del modal pasó dentro de la especificación dirigida de `PointComponent` (37/37) y la compilación Angular de producción pasó. La nueva prueba de `GetCashRegistersScopeTest` compila, pero su ejecución se bloquea al reutilizar la base remota `test_saiopencloud`; se detuvo sin eliminarla.
- Resultado comunicado por el PO: la validación inicial en dev del commit `5f2e4b93cb9248b263bb97a85d06c457aecb6378` devolvió POINT-003 y POINT-004. Tras la corrección en `54a201eb272be17d3034a541dd24f920f012d7ae`, el PO confirmó el 2026-08-29 que el flujo quedó correcto y autorizó el cierre.

## QA

```json
[
  {
    "id": "QA-001",
    "date": "2026-08-28",
    "build_reference": "commit:5f2e4b93cb9248b263bb97a85d06c457aecb6378",
    "environment": "dev",
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
    "result": "changes_requested",
    "findings": [],
    "correction": null,
    "po_confirmation": "El PO validó en dev y reportó los hallazgos de POINT-003 y POINT-004."
  },
  {
    "id": "QA-003",
    "date": "2026-08-28",
    "build_reference": "commit:54a201eb272be17d3034a541dd24f920f012d7ae",
    "environment": "dev",
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
    "result": "approved",
    "findings": [],
    "correction": null,
    "po_confirmation": "PO validó en dev el 2026-08-28: quedó funcionando bien."
  },
  {
    "id": "QA-005",
    "date": "2026-08-28",
    "build_reference": "commit:54a201eb272be17d3034a541dd24f920f012d7ae",
    "environment": "dev",
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
    "po_confirmation": "PO validó en dev el 2026-08-28: quedó funcionando bien."
  }
]
```

## Evidencia

```json
[
  {
    "id": "EVIDENCE-001",
    "date": "2026-08-28",
    "kind": "manual",
    "description": "Captura aportada por el PO: el modal muestra la sucursal de trabajo 4 - Pance antes de abrir Caja-11.",
    "reference": null,
    "point_id": "POINT-001"
  },
  {
    "id": "EVIDENCE-002",
    "date": "2026-08-28",
    "kind": "manual",
    "description": "Captura aportada por el PO: Arqueo/Cierres muestra aperturas de Caja-11 asociadas a S1 - ATENCIÓN POR CAJA 1, no a la sucursal de trabajo seleccionada.",
    "reference": null,
    "point_id": "POINT-001"
  },
  {
    "id": "EVIDENCE-003",
    "date": "2026-08-28",
    "kind": "automated",
    "description": "Prueba dirigida de PointComponent aprobada: 36 especificaciones correctas; la nueva regresión verifica el payload de sucursal activa.",
    "reference": "commit:5f2e4b93cb9248b263bb97a85d06c457aecb6378",
    "point_id": "POINT-001"
  },
  {
    "id": "EVIDENCE-004",
    "date": "2026-08-28",
    "kind": "automated",
    "description": "Compilación Angular de producción aprobada con los avisos CSS preexistentes de selectores omitidos.",
    "reference": "commit:5f2e4b93cb9248b263bb97a85d06c457aecb6378",
    "point_id": "POINT-002"
  },
  {
    "id": "EVIDENCE-005",
    "date": "2026-08-28",
    "kind": "manual",
    "description": "Captura aportada por el PO en dev: el listado de cierres muestra Caja-11 en S1 - ATENCIÓN POR CAJA 1 aunque el registro PosCashRegister 5288 está persistido en Dapa.",
    "reference": null,
    "point_id": "POINT-004"
  },
  {
    "id": "EVIDENCE-006",
    "date": "2026-08-28",
    "kind": "automated",
    "description": "Regresión dirigida de PointComponent aprobada: 37 especificaciones, incluida la permanencia del modal ya visible.",
    "reference": "commit:54a201eb272be17d3034a541dd24f920f012d7ae",
    "point_id": "POINT-003"
  },
  {
    "id": "EVIDENCE-007",
    "date": "2026-08-28",
    "kind": "automated",
    "description": "Compilación Angular de producción aprobada para el ciclo QA.",
    "reference": "commit:54a201eb272be17d3034a541dd24f920f012d7ae",
    "point_id": "POINT-004"
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
    "po_confirmation": "PO validó en dev el 2026-08-28: quedó funcionando bien."
  },
  {
    "id": "RETEST-002",
    "date": "2026-08-28",
    "point_id": "POINT-002",
    "result": "approved",
    "evidence": [],
    "po_confirmation": "PO validó en dev el 2026-08-28: quedó funcionando bien."
  },
  {
    "id": "RETEST-003",
    "date": "2026-08-28",
    "point_id": "POINT-003",
    "result": "approved",
    "evidence": [],
    "po_confirmation": "PO validó en dev el 2026-08-28: quedó funcionando bien."
  },
  {
    "id": "RETEST-004",
    "date": "2026-08-28",
    "point_id": "POINT-004",
    "result": "approved",
    "evidence": [],
    "po_confirmation": "PO validó en dev el 2026-08-28: quedó funcionando bien."
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
    "date": "2026-08-29",
    "technical_summary": "La apertura conserva la sucursal de trabajo, el modal no se alterna al cambiar entre sucursales sin caja y Cierres usa la sucursal persistida.",
    "functional_summary": "El PO confirmó en dev que el flujo quedó correcto y ordenó cerrar el ticket.",
    "qa_status": "approved",
    "qa_waiver_reason": null,
    "po_confirmation": "PO validó en dev el 2026-08-29 y ordenó cerrar el ticket.",
    "release_impact": "El ticket queda cerrado funcionalmente y continúa unreleased; no incluye despliegue productivo."
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
    "action": "point-added",
    "actor": "cli",
    "details": "Se agregó POINT-002."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-08-28",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-08-28",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-002: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-08-28",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-08-28",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-08-28",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-08-28",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-002."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-08-28",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-08-28",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-08-28",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-002: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-08-28",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-014",
    "date": "2026-08-28",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-015",
    "date": "2026-08-28",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-002: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-016",
    "date": "2026-08-28",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-017",
    "date": "2026-08-28",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-003."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-018",
    "date": "2026-08-28",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-004."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-019",
    "date": "2026-08-28",
    "action": "point-added",
    "actor": "cli",
    "details": "Se agregó POINT-003."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-020",
    "date": "2026-08-28",
    "action": "point-added",
    "actor": "cli",
    "details": "Se agregó POINT-004."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-021",
    "date": "2026-08-28",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-022",
    "date": "2026-08-28",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-023",
    "date": "2026-08-28",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado changes_requested."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-024",
    "date": "2026-08-28",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-003: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-025",
    "date": "2026-08-28",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-004: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-026",
    "date": "2026-08-28",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-005."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-027",
    "date": "2026-08-28",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-003: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-028",
    "date": "2026-08-28",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-004: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-029",
    "date": "2026-08-28",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> changes_requested."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-030",
    "date": "2026-08-28",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: changes_requested -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-031",
    "date": "2026-08-28",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-003: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-032",
    "date": "2026-08-28",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-004: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-033",
    "date": "2026-08-28",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-034",
    "date": "2026-08-28",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-006."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-035",
    "date": "2026-08-28",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-007."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-036",
    "date": "2026-08-28",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-037",
    "date": "2026-08-28",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-003."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-038",
    "date": "2026-08-28",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-004 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-039",
    "date": "2026-08-28",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-005."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-040",
    "date": "2026-08-28",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-001 para POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-041",
    "date": "2026-08-28",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-002 para POINT-002."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-042",
    "date": "2026-08-28",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-003 para POINT-003."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-043",
    "date": "2026-08-28",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-004 para POINT-004."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-044",
    "date": "2026-08-28",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-006 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-045",
    "date": "2026-08-28",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-046",
    "date": "2026-08-29",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-047",
    "date": "2026-08-29",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-048",
    "date": "2026-09-07",
    "action": "release-transition",
    "actor": "cli",
    "details": "Release: unreleased -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-049",
    "date": "2026-09-07",
    "action": "release-transition",
    "actor": "cli",
    "details": "Release: planned -> released."
  }
]
```
