---
schema_version: 1
id: FEATURE-ADMINISTRACION-REGISTRO-ERRORES-20260911
title: Consultar errores operativos desde cada tenant
type: FEATURE
module: ADMINISTRACION
workflow_status: closed
qa_status: approved
release_status: released
user_visible: true
sync_impact: false
migration_impact: true
docker_impact: false
risk_level: high
created: 2026-09-11
updated: 2026-09-17
related_ticket: BUGFIX-RESTAURANTE-ERRORES-GUARDADO-20260911
target_release: 6.2.5
released_in: 6.2.5
---

# FEATURE-ADMINISTRACION-REGISTRO-ERRORES-20260911

## Solicitud original

Crear en Next/SaiOpenCloud una ruta Angular de consulta de errores para cada tenant. Cualquier usuario autenticado del tenant podrá buscar referencias y revisar el historial seguro de errores de su propio tenant, sin acceso a AWS CloudWatch, sin permisos adicionales y sin acceso entre tenants. La información expuesta debe permitir identificar causa y acción de corrección sin revelar trazas, secretos, consultas, tokens ni datos sensibles.

## Descripción funcional

- Alcance: historial de fallos operativos del backend que ocurran dentro de un tenant, visible desde Next/SaiOpenCloud mediante la ruta Angular `#/admin/logs/errors` y consumiendo exclusivamente el API del tenant activo.
- Usuario o rol afectado: cualquier usuario autenticado del tenant. No se requiere permiso adicional ni acceso a SuperAdmin o AWS.
- Comportamiento actual: la referencia de un error se registra únicamente en logs de infraestructura; no hay tabla, API ni pantalla tenant-scoped. La referencia `ORD-673F8A8650ED`, mostrada como creada el 2026-09-11, no apareció en los grupos CloudWatch consultados de dev ni de los backends activos documentados, por lo que no se pudo diagnosticar.
- Comportamiento esperado: cada fallo inesperado del backend con tenant activo se conserva como evento seguro en el schema de ese tenant; los usuarios del mismo tenant pueden buscarlo por referencia y revisar fecha, módulo, acción, causa clasificada y pasos sugeridos, sin ver trazas ni información sensible.

## Diagnóstico

- Archivos y flujo investigados: `FrontEnd/src/app/common/services/general.service.ts` arma las llamadas contra `https://{tenant}.<DOMINIO>/` usando el tenant de la sesión, aunque la SPA se cargue desde Next/dev. `BackEnd/ModRestaurant/views/functions.py` genera referencias ORD y usa logging de consola. `BackEnd/SaiOpenCloud/settings.py` no persiste errores en base de datos. La ruta raíz Angular permite crear una sección independiente de los módulos operativos.
- Causa raíz o hipótesis: la única trazabilidad depende de la infraestructura y de retenciones/rutas de logging que no son accesibles ni confiables como interfaz para operación. No existe un contrato de error persistente y tenant-scoped.
- Riesgos y compatibilidad: como cualquier usuario autenticado podrá ver el historial, cada evento debe contener solo texto seguro y clasificación controlada; nunca traceback, consultas, cuerpos HTTP, tokens, datos personales ni valores de configuración. La lectura y la escritura deben ejecutarse en el schema tenant ya establecido por la petición; no puede haber consulta multi-tenant.
- Impactos de sync, migración, Docker o despliegue: se agrega un modelo y migración por tenant. No cambia OfflineSync, SincSaiCloud, WebSocket, Docker ni autenticación. La migración requiere compatibilidad, backup, canario y rollback definidos antes de implementar.

## Plan

- Alcance y exclusiones: registrar fallos inesperados del backend asociados a una petición con tenant y exponer su diagnóstico saneado dentro de ese tenant. No se registra el contenido crudo de logs, validaciones locales del frontend, fallos sin tenant ni actividad de otros tenants; no se integra CloudWatch al navegador.
- Gate de plan y aprobación del PO: obligatorio antes de implementar por tratarse de FEATURE con migración y datos operativos visibles. Aprobado explícitamente por el PO el 2026-09-11 mediante “Apruebo el plan de FEATURE-ADMINISTRACION-REGISTRO-ERRORES-20260911”.
- Paso 1 — contrato y persistencia tenant (`BackEnd/ModAdmin/models/`, migración tenant y servicio nuevo; `POINT-001`): definir el evento inmutable con referencia, timestamp, módulo, acción, clasificación segura, recomendación y estado. Indexar la referencia y fecha, normalizar textos y prevenir que la propia escritura de un evento cause recursión de errores.
- Paso 2 — captura segura (`BackEnd/ModAdmin/` y manejadores de errores de endpoints; `POINT-001`): centralizar el registro de fallos HTTP 5xx con tenant activo, empezando por el guardado de órdenes; conservar el comportamiento HTTP y el rollback. Deduplicar la captura entre el manejador de la vista y la capa global, y no persistir excepción cruda ni request payload.
- Paso 3 — API aislada (`BackEnd/ModAdmin/views/`, serializers y URLs; `POINT-001`): exponer solo listado/detalle de campos seguros dentro del schema activo, con búsqueda exacta por referencia y filtros de fecha, módulo y estado. Exigir sesión autenticada; no aceptar un tenant/schema como parámetro ni devolver datos fuera de la conexión actual.
- Paso 4 — Next/SaiOpenCloud (`FrontEnd/src/app/` ruta lazy, pantalla, servicio, modelos y navegación; `POINT-001`): crear `#/admin/logs/errors`, lista y detalle de errores del tenant actual, con búsqueda por referencia, estados de carga/vacío/error y texto seleccionable. La pantalla no mostrará datos técnicos crudos ni permitirá mutaciones operativas.
- Paso 5 — pruebas y migración (`BackEnd/ModAdmin/tests/`, pruebas Angular y migración; `POINT-001`): comprobar aislamiento entre dos tenants, autenticación, sanitización, búsqueda, deduplicación, regresión de `create_update_order`, migración y visualización. Definir backup verificado, canario sobre un tenant no productivo y rollback antes del despliegue.
- Rollback, backup, canario u orden de despliegue cuando aplique: antes de migrar, realizar backup verificable de PostgreSQL conforme al procedimiento de despliegue aprobado; aplicar primero en un tenant canario no productivo, validar inserción/consulta/aislamiento y después promover. El rollback revierte el código y, si la migración requiere reversión, solo después de confirmar que no se pierde evidencia necesaria; por defecto se preservan los eventos ya registrados.

## Criterios de aceptación

- [ ] `POINT-001`: un fallo inesperado de una petición tenant-scoped crea una sola referencia y un evento seguro en el schema de ese tenant.
- [ ] `POINT-001`: `#/admin/logs/errors` permite a un usuario autenticado buscar su referencia y consultar solo eventos de su tenant.
- [ ] `POINT-001`: la pantalla y el API nunca exponen trazas, secretos, tokens, SQL, cuerpos de petición ni información de otro tenant.
- [ ] `POINT-001`: la migración canario, rollback y los flujos actuales de guardado de órdenes quedan documentados y probados.

## Puntos

<!-- Crear POINT-NNN es append-only: no eliminar, reordenar ni reutilizar. Las transiciones solo las realiza el CLI, actualizan el punto actual y anexan un ticket-event. -->

```json
[
  {
    "id": "POINT-001",
    "title": "El tenant no puede consultar sus errores operativos",
    "status": "closed",
    "severity": "high",
    "actual": "Los errores se emiten a logs de infraestructura y los usuarios del tenant no pueden buscar una referencia ni conocer una causa operativa segura.",
    "expected": "Cualquier usuario autenticado consulta, solo dentro de su tenant, un historial seguro y filtrable de referencias, causas y acciones de corrección.",
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
    "title": "Ajustar espaciado y búsqueda de registro de errores",
    "status": "closed",
    "severity": "normal",
    "actual": "En Dev, la barra de ruta aparece separada del navbar, el card no conserva márgenes laterales suficientes y el botón Buscar queda unido y desalineado respecto al input.",
    "expected": "La ruta queda pegada visualmente al navbar, el contenido se presenta en un contenedor con márgenes laterales y el input y botón Buscar son controles separados y alineados.",
    "evidence": [
      "EVIDENCE-002",
      "EVIDENCE-003",
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
  }
]
```

## Implementación

- Archivos cambiados: modelo y migración tenant `OperationalError`; servicio y middleware de registro seguro; API `GET /api/operational-errors/`; captura del fallback de guardar orden; ruta y pantalla Angular en Administración.
- Decisiones técnicas: la tabla se crea por schema tenant; el API no recibe tenant/schema como parámetro y consulta exclusivamente la conexión activa. El middleware registra 5xx tenant-scoped sin referencia, mientras que respuestas que ya traen `error_reference` no se duplican. Solo se persiste clasificación segura y recomendación; no se guardan excepción, trazas, SQL, request ni secretos.
- Compatibilidad preservada: la respuesta HTTP y el rollback del guardado de órdenes se mantienen. La nueva ruta es directa para cualquier sesión autenticada; no introduce un permiso ni dependencia de SuperAdmin/AWS.
- Commits atribuibles al ticket:
  - `9597e83f1f60ab6a3abbe5b9a693df2ef52beaea` — agrega persistencia, captura, API y consulta Angular de errores operativos por tenant.
  - `4a5160f9718a157c02f209afe379f3947cec912a` — elimina la navegación inconsistente y simplifica la presentación final de la pantalla.

## Pruebas

- Comandos para el PO:
  - Desde `BackEnd/`: `./.venv/bin/python manage.py test ModAdmin.tests.test_operational_errors ModRestaurant.tests.test_create_update_order_errors --keepdb --verbosity 1`
  - Desde `FrontEnd/`: `npm run build -- --configuration development`
  - Tras publicar en Dev y aplicar la migración canario: iniciar sesión en un tenant canario y abrir `https://next.<DOMINIO_ALT>/#/admin/logs/errors`; buscar la referencia generada por una falla controlada de guardado.
- Directorio de ejecución: `BackEnd/` para Django y `FrontEnd/` para Angular.
- Resultado esperado: la suite confirma persistencia, búsqueda, sanitización, no duplicación y regresión del guardado; el build Angular finaliza correctamente. En Dev, la búsqueda muestra únicamente fecha, módulo, acción, causa y recomendación segura del tenant activo.
- Validaciones manuales: en un tenant canario, generar un fallo controlado de backend, copiar la referencia y buscarla en `#/admin/logs/errors`; confirmar con un segundo tenant que no puede verla y que el detalle es operativo, sin información técnica cruda.
- Requisitos de ambiente o datos: tenant canario no productivo, dos usuarios autenticados en tenants distintos y backup verificado antes de la migración.
- Resultado comunicado por el PO: primero reportó el hallazgo visual de barra de ruta, márgenes y alineación; después validó el ajuste y autorizó explícitamente el cierre el 2026-09-15 mediante “cierra el ticket porfa ya valide”.

## QA

```json
[
  {
    "id": "QA-001",
    "date": "2026-09-11",
    "build_reference": "commit:b5fd197426b690abf3c85d98d3e653ce6e2409d9",
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
    "result": "changes_requested",
    "findings": [],
    "correction": null,
    "po_confirmation": null
  },
  {
    "id": "QA-003",
    "date": "2026-09-15",
    "build_reference": "commit:4a5160f9718a157c02f209afe379f3947cec912a",
    "environment": "dev",
    "result": "pending",
    "findings": [],
    "correction": null,
    "po_confirmation": null
  },
  {
    "id": "QA-004",
    "date": "2026-09-15",
    "build_reference": null,
    "environment": null,
    "result": "approved",
    "findings": [],
    "correction": null,
    "po_confirmation": "El PO validó el ajuste y autorizó explícitamente el cierre el 2026-09-15."
  },
  {
    "id": "QA-005",
    "date": "2026-09-15",
    "build_reference": "commit:4a5160f9718a157c02f209afe379f3947cec912a",
    "environment": "dev",
    "result": "pending",
    "findings": [],
    "correction": null,
    "po_confirmation": null
  },
  {
    "id": "QA-006",
    "date": "2026-09-15",
    "build_reference": null,
    "environment": null,
    "result": "approved",
    "findings": [],
    "correction": null,
    "po_confirmation": "El PO confirmó la validación y autorizó el cierre el 2026-09-15."
  }
]
```

## Evidencia

```json
[
  {
    "id": "EVIDENCE-001",
    "date": "2026-09-11",
    "kind": "automated-test",
    "description": "Django: 7 pruebas verdes de OperationalError y regresión de create_update_order con --keepdb; Angular: build development exitoso y spec de pantalla ejecutado 1/1.",
    "reference": "worktree:sha256:7ea5ec66b14df2ac2a296eb163a46b0710c952d4332a3e9e9e6557a4871f4ed1",
    "point_id": "POINT-001"
  },
  {
    "id": "EVIDENCE-002",
    "date": "2026-09-11",
    "kind": "user-validation",
    "description": "Captura de validación Dev del PO evidencia separación de barra de ruta, card sin margen lateral suficiente y botón Buscar unido al input.",
    "reference": "commit:b5fd1974c347ce07bf32398f85d7e60000493922",
    "point_id": "POINT-002"
  },
  {
    "id": "EVIDENCE-003",
    "date": "2026-09-11",
    "kind": "user-validation-reference-correction",
    "description": "Corrección de referencia de build para la validación visual reportada por el PO.",
    "reference": "commit:b5fd197426b690abf3c85d98d3e653ce6e2409d9",
    "point_id": "POINT-002"
  },
  {
    "id": "EVIDENCE-004",
    "date": "2026-09-11",
    "kind": "automated-build",
    "description": "Angular development build exitoso tras ajustar layout, contenedor y controles de búsqueda.",
    "reference": "worktree:sha256:dda258f61a418b1c5115d5867f377d24aae39872066fc7b7637f4f59103bc043",
    "point_id": "POINT-002"
  }
]
```

## Retests

```json
[
  {
    "id": "RETEST-001",
    "date": "2026-09-15",
    "point_id": "POINT-001",
    "result": "approved",
    "evidence": [],
    "po_confirmation": "El PO confirmó la validación y autorizó el cierre el 2026-09-15."
  },
  {
    "id": "RETEST-002",
    "date": "2026-09-15",
    "point_id": "POINT-002",
    "result": "approved",
    "evidence": [],
    "po_confirmation": "El PO confirmó la validación y autorizó el cierre el 2026-09-15."
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
    "date": "2026-09-15",
    "technical_summary": "Registro tenant-scoped, API segura, captura de 5xx y pantalla Angular finalizados; navegación visual simplificada.",
    "functional_summary": "El tenant consulta sus errores de forma aislada y el PO validó el flujo y la presentación final.",
    "qa_status": "approved",
    "qa_waiver_reason": null,
    "po_confirmation": "El PO confirmó la validación y autorizó el cierre el 2026-09-15.",
    "release_impact": "Permanece unreleased; el código fue publicado a dev y requiere promoción normal mediante PR dev a production."
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
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-09-11",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-09-11",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-09-11",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-09-11",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-09-11",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-09-11",
    "action": "point-added",
    "actor": "cli",
    "details": "Se agregó POINT-002."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-09-11",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-002."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-09-11",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-003."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-09-11",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-09-11",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-014",
    "date": "2026-09-11",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado changes_requested."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-015",
    "date": "2026-09-11",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> changes_requested."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-016",
    "date": "2026-09-11",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: changes_requested -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-017",
    "date": "2026-09-11",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-002: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-018",
    "date": "2026-09-11",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-002: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-019",
    "date": "2026-09-11",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-004."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-020",
    "date": "2026-09-11",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-002: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-021",
    "date": "2026-09-11",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-022",
    "date": "2026-09-15",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-023",
    "date": "2026-09-15",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-003."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-024",
    "date": "2026-09-15",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-004 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-025",
    "date": "2026-09-15",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-026",
    "date": "2026-09-15",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-027",
    "date": "2026-09-15",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-028",
    "date": "2026-09-15",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-005."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-029",
    "date": "2026-09-15",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-001 para POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-030",
    "date": "2026-09-15",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: verified -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-031",
    "date": "2026-09-15",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-002 para POINT-002."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-032",
    "date": "2026-09-15",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-002: verified -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-033",
    "date": "2026-09-15",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-006 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-034",
    "date": "2026-09-15",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-035",
    "date": "2026-09-15",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-036",
    "date": "2026-09-15",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-037",
    "date": "2026-09-17",
    "action": "release-transition",
    "actor": "cli",
    "details": "Release: unreleased -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-038",
    "date": "2026-09-17",
    "action": "release-transition",
    "actor": "cli",
    "details": "Release: planned -> released."
  }
]
```
