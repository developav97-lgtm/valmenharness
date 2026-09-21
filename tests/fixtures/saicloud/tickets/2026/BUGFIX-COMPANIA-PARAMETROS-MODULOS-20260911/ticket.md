---
schema_version: 1
id: BUGFIX-COMPANIA-PARAMETROS-MODULOS-20260911
title: Validar parámetros obligatorios según módulos activos
type: BUGFIX
module: COMPANIA
workflow_status: closed
qa_status: approved
release_status: released
user_visible: true
sync_impact: false
migration_impact: false
docker_impact: false
risk_level: high
created: 2026-09-11
updated: 2026-09-17
related_ticket: null
target_release: 6.2.5
released_in: 6.2.5
---

# BUGFIX-COMPANIA-PARAMETROS-MODULOS-20260911

## Solicitud original

Acabo de desplegar el cliente Minimax, con administración y POS comercial, sin módulo Restaurante. En Compañía > Sucursales, al crear o editar una sucursal se exige porcentaje y liquidación de propina aunque esos campos no son visibles ni aplican. Se solicita revisar y validar Compañía general, Sucursales y Usuarios para que los parámetros obligatorios dependan de los módulos activos: POS comercial exige solo sus parámetros; Restaurante exige POS comercial y Restaurante; y Cartera aislada exige solo Cartera.

## Descripción funcional

- Alcance: configuración funcional Angular en Administración > Compañía general, Sucursales y Usuarios. Incluye crear y editar; excluye cambios de módulos, Django Admin, APIs, migraciones, sincronización y despliegue.
- Usuario o rol afectado: administradores del tenant Minimax y de cualquier tenant con una combinación equivalente de módulos.
- Comportamiento actual: la pestaña Restaurante se oculta cuando ese módulo está inactivo, pero Sucursales aún rechaza el guardado por `procent_tip` y `liquidate_tip`. Los otros dos flujos deben verificarse contra el mismo criterio antes de corregirlos.
- Comportamiento esperado: cada guardado solicita y envía únicamente parámetros de módulos activos: POS comercial; POS comercial más Restaurante cuando Restaurante está activo; y únicamente Cartera para un tenant con Cartera aislada.

## Diagnóstico

- Archivos y flujo investigados: `FrontEnd/src/app/administration/company/adm-setting.component.ts` construye formularios, carga `Modules` desde IndexDB y controla `SaveSetting`, `SaveCompanyBranch` y `ValidationBranch`; su plantilla es `adm-setting.component.html`. Usuarios usa `FrontEnd/src/app/administration/users/user/adm-user.component.ts` y su plantilla para activar parámetros por módulo y construir el payload.
- Causa raíz o hipótesis: confirmada para POINT-002. `SaveCompanyBranch` ya omite `res_branch` si `modules_obj['Restaurante']` es falso, pero `ValidationBranch` valida el objeto `res_branch` siempre que exista. El FormGroup siempre lo crea, por lo que un tenant solo POS queda bloqueado. POINT-001 y POINT-003 requieren auditoría dirigida de validadores, controles habilitados y payloads antes de modificar.
- Riesgos y compatibilidad: no relajar requisitos activos ni enviar bloques de módulos inactivos; preservar edición de datos históricos y la combinación Restaurante + POS. Los módulos se determinan por el catálogo `Modules` del tenant, sin suponer su estado desde la UI.
- Impactos de sync, migración, Docker o despliegue: no se identificaron impactos de OfflineSync, SincSaiCloud, WebSocket, autenticación, migraciones, Docker ni despliegue. Es un cambio frontend de validación/payload; se verificará que ninguna llamada API cambie de contrato indebidamente.

## Plan

- Alcance y exclusiones: resolver POINT-001 a POINT-003 en las pantallas Angular existentes; no crear configuración funcional en Django Admin ni cambiar la activación de módulos o contratos backend salvo que la auditoría demuestre una validación API correspondiente, en cuyo caso se detiene para ampliar y reaprobar el plan.
- Gate de plan y aprobación del PO: aprobado explícitamente por el PO el 2026-09-11 mediante la instrucción “Listo, sí aprobo, empieza a implementarlo por favor.” Aunque es BUGFIX, modifica reglas obligatorias de tres flujos de configuración de tenant; la aprobación cubre exclusivamente el alcance y los pasos de este plan.
- Pasos ordenados:
  1. Reproducir y documentar la matriz en un tenant de prueba aislado: POS comercial solo, POS comercial + Restaurante y Cartera sola; revisar controles visibles, habilitados, validaciones y payload de Compañía general (POINT-001), Sucursales (POINT-002) y Usuarios (POINT-003).
  2. En `FrontEnd/src/app/administration/company/adm-setting.component.ts` y sus pruebas, condicionar cada validación y cada bloque del payload al módulo activo. Corregir específicamente `ValidationBranch` para evaluar `res_branch` solo con Restaurante, conservando los requisitos de POS y de restaurante cuando correspondan.
  3. En `FrontEnd/src/app/administration/users/user/adm-user.component.ts` y sus pruebas, alinear la construcción y validación de `UserInvoice`, `UserRestaurant`, parámetros logísticos y cartera con las banderas del catálogo; no enviar ni exigir datos de módulos inactivos.
  4. Ajustar solo las plantillas Angular si la auditoría revela un control visible/habilitado inconsistentemente; conservar el formulario funcional bajo `FrontEnd/src/app/` y la accesibilidad básica de los mensajes de error.
  5. Añadir pruebas unitarias de regresión para cada celda de la matriz y verificar creación y edición manuales sin datos de restaurante para POS solo y Cartera sola. Ejecutar build y las pruebas afectadas antes de entregar a pruebas del PO.
- Rollback, backup, canario u orden de despliegue cuando aplique: sin migración ni cambio de datos. El rollback consiste en revertir selectivamente el commit frontend si la regresión aparece; la entrega debe probarse primero en dev con tenants de prueba que reproduzcan las tres combinaciones. No se autoriza despliegue por este ticket.

## Criterios de aceptación

- [ ] POINT-001: Compañía general guarda en POS comercial solo sin exigir ni enviar parámetros de Restaurante o Cartera; con Restaurante exige y envía POS comercial y Restaurante; con Cartera sola solo procesa sus parámetros aplicables.
- [ ] POINT-002: en POS comercial solo se puede crear y editar una sucursal sin porcentaje ni liquidación de propina; no se envía `res_branch`.
- [ ] POINT-002: con Restaurante activo, Sucursales conserva la obligatoriedad y límites de porcentaje/liquidación de propina, además de los parámetros POS aplicables.
- [ ] POINT-003: Usuarios permite crear y editar sin parámetros de POS, Restaurante o Cartera que estén inactivos, y conserva sus validaciones cuando el módulo correspondiente esté activo.
- [ ] Los módulos se resuelven desde el tenant correcto, no se cambia la activación de módulos y no se modifica Django Admin, API, sincronización, migraciones ni Docker.
- [ ] Las pruebas unitarias y el build Angular terminan correctamente; las pruebas manuales cubren creación y edición en las tres combinaciones de módulos.

## Puntos

<!-- Crear POINT-NNN es append-only: no eliminar, reordenar ni reutilizar. Las transiciones solo las realiza el CLI, actualizan el punto actual y anexan un ticket-event. -->

```json
[
  {
    "id": "POINT-001",
    "title": "Compañía general valida parámetros del módulo activo",
    "status": "verified",
    "severity": "high",
    "actual": "La validación y el payload de Compañía general no cuentan aún con una matriz de pruebas que demuestre que ignoran parámetros de módulos inactivos.",
    "expected": "Al guardar Compañía general, solo se validan y persisten parámetros requeridos por los módulos activos del tenant: POS comercial, Restaurante o Cartera.",
    "evidence": [],
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
    "title": "Sucursales no exigen propina sin Restaurante",
    "status": "verified",
    "severity": "high",
    "actual": "En un tenant solo con POS comercial, crear o editar una sucursal falla porque ValidationBranch valida procent_tip y liquidate_tip de res_branch aunque el módulo Restaurante está inactivo y los campos están ocultos.",
    "expected": "Sin Restaurante, Sucursales no valida ni envía parámetros de restaurante; con Restaurante, conserva la validación obligatoria de POS comercial y Restaurante.",
    "evidence": [],
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
    "id": "POINT-003",
    "title": "Usuarios no exigen parámetros de módulos inactivos",
    "status": "verified",
    "severity": "high",
    "actual": "Los formularios y banderas de Usuarios deben comprobarse para evitar que una validación o payload de POS, Restaurante o Cartera inactivo bloquee creación o edición.",
    "expected": "Al guardar Usuarios, solo se exigen y envían los parámetros asociados a módulos activos, preservando las reglas propias de cada módulo activo.",
    "evidence": [],
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

- Archivos cambiados: `FrontEnd/src/app/administration/company/adm-setting.component.ts`, `adm-setting.component.html`, `adm-setting.component.spec.ts`, `FrontEnd/src/app/administration/users/user/adm-user.component.ts` y `adm-user.component.spec.ts`.
- Decisiones técnicas: `res_branch` se valida exclusivamente con Restaurante activo; Cartera se oculta, deshabilita y se excluye del payload si no está contratada; Usuarios elimina del payload y no valida los bloques Invoice, Restaurant y Logisty de módulos inactivos. Restaurante conserva la dependencia de parámetros de facturación mediante `config_pos || config_restaurant`.
- Compatibilidad preservada: Restaurante activo mantiene porcentaje/liquidación de propina obligatorios. POS comercial conserva su bloque de facturación. No se cambiaron endpoints, serializers, modelos, módulos contratados, sincronización ni datos persistidos.
- Commits atribuibles al ticket:
  - `8e71f23ec89c9642a0a476ad52e3ee6a105ef415` — corrige validaciones y payloads según módulos activos, y añade pruebas de regresión Angular.
  - `9e8973510c51a04e9f92a424771f9090f80efb84` — crea el registro canónico y documenta la implementación para entrega.
  - `7d3f8dcc7db96835c3507ea3fb0ccd97e1b56f7c` — actualiza la referencia documental del SHA funcional después de integrar `dev`.
  - `289ba2d927e6c0374858ad7b1aec2d4493290346` — registra evidencia QA, retests aprobados y cierre funcional.

## Pruebas

- Comandos para el PO: `npm test -- --include='src/app/administration/company/adm-setting.component.spec.ts' --watch=false --browsers=ChromeHeadless`; `npm test -- --include='src/app/administration/users/user/adm-user.component.spec.ts' --watch=false --browsers=ChromeHeadless`; `npm run build`.
- Directorio de ejecución: `FrontEnd/`.
- Resultado esperado: las suites dirigidas completaron 36 y 22 pruebas exitosas respectivamente; `npm run build` terminó con código 0. Karma emitió después de cada suite un mensaje no bloqueante sobre el patrón `--include` pese a haber reportado todos los casos exitosos; el build emitió tres avisos preexistentes de selectores CSS durante la optimización. Ninguno corresponde a este cambio.
- Validaciones manuales: en tenant de prueba, crear y editar Compañía general, Sucursal y Usuario para (a) POS comercial solo, (b) POS comercial + Restaurante y (c) Cartera sola; inspeccionar que los campos/errores y solicitudes HTTP correspondan solo a módulos activos.
- Requisitos de ambiente o datos: tres tenants de prueba no productivos o una forma autorizada de alternar su catálogo `Modules`; usuario administrador y registros mínimos de sucursal, consecutivos/caja para POS, y datos requeridos por cada módulo activo. No usar datos de Minimax en producción como evidencia de prueba.
- Resultado comunicado por el PO: el 2026-09-11 el PO informó “ya probé” y solicitó cerrar el ticket, confirmando la validación funcional desplegada en dev.

## QA

```json
[
  {
    "id": "QA-001",
    "date": "2026-09-11",
    "build_reference": "commit:8e71f23ec89c9642a0a476ad52e3ee6a105ef415",
    "environment": "dev",
    "result": "pending",
    "findings": [],
    "correction": null,
    "po_confirmation": null
  },
  {
    "id": "QA-002",
    "date": "2026-09-11",
    "build_reference": null,
    "environment": null,
    "result": "approved",
    "findings": [],
    "correction": null,
    "po_confirmation": "El PO confirma que las pruebas funcionales fueron satisfactorias y solicita cerrar el ticket."
  }
]
```

## Evidencia

```json
[
  {
    "id": "EVIDENCE-001",
    "date": "2026-09-11",
    "kind": "manual",
    "description": "El PO confirma que probó en dev los flujos de Compañía general, Sucursales y Usuarios según los módulos activos, incluyendo POS comercial, Restaurante y Cartera.",
    "reference": null,
    "point_id": null
  }
]
```

## Retests

```json
[
  {
    "id": "RETEST-001",
    "date": "2026-09-11",
    "point_id": "POINT-001",
    "result": "approved",
    "evidence": [],
    "po_confirmation": "El PO confirma prueba satisfactoria de Compañía general según módulos activos."
  },
  {
    "id": "RETEST-002",
    "date": "2026-09-11",
    "point_id": "POINT-002",
    "result": "approved",
    "evidence": [],
    "po_confirmation": "El PO confirma que crear y editar Sucursales en POS comercial sin Restaurante ya no exige propina."
  },
  {
    "id": "RETEST-003",
    "date": "2026-09-11",
    "point_id": "POINT-003",
    "result": "approved",
    "evidence": [],
    "po_confirmation": "El PO confirma prueba satisfactoria de Usuarios sin parámetros de módulos inactivos."
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
    "date": "2026-09-11",
    "technical_summary": "Se corrigieron las validaciones y payloads de Compañía, Sucursales y Usuarios para respetar los módulos activos del tenant.",
    "functional_summary": "El PO confirmó pruebas satisfactorias en dev y solicitó cerrar el ticket.",
    "qa_status": "approved",
    "qa_waiver_reason": null,
    "po_confirmation": "El PO confirmó las pruebas funcionales y autorizó el cierre el 2026-09-11.",
    "release_impact": "El ticket queda cerrado funcionalmente y unreleased; la promoción a producción permanece separada."
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
    "date": "2026-09-11",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-09-11",
    "action": "point-added",
    "actor": "cli",
    "details": "Se agregó POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-09-11",
    "action": "point-added",
    "actor": "cli",
    "details": "Se agregó POINT-002."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-09-11",
    "action": "point-added",
    "actor": "cli",
    "details": "Se agregó POINT-003."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-09-11",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-09-11",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-09-11",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-09-11",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-09-11",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-09-11",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-09-11",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-09-11",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-002: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-09-11",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-002: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-014",
    "date": "2026-09-11",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-002: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-015",
    "date": "2026-09-11",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-003: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-016",
    "date": "2026-09-11",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-003: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-017",
    "date": "2026-09-11",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-003: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-018",
    "date": "2026-09-11",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-019",
    "date": "2026-09-11",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-020",
    "date": "2026-09-11",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-021",
    "date": "2026-09-11",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-022",
    "date": "2026-09-11",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-001 para POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-023",
    "date": "2026-09-11",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-002 para POINT-002."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-024",
    "date": "2026-09-11",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-003 para POINT-003."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-025",
    "date": "2026-09-11",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-026",
    "date": "2026-09-11",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-027",
    "date": "2026-09-11",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-028",
    "date": "2026-09-11",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-029",
    "date": "2026-09-17",
    "action": "release-transition",
    "actor": "cli",
    "details": "Release: unreleased -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-030",
    "date": "2026-09-17",
    "action": "release-transition",
    "actor": "cli",
    "details": "Release: planned -> released."
  }
]
```
