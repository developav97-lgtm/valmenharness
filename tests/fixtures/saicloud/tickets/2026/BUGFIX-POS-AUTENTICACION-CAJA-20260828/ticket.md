---
schema_version: 1
id: BUGFIX-POS-AUTENTICACION-CAJA-20260828
title: Asegurar token de autenticación en peticiones de caja y arqueo
type: BUGFIX
module: POS
workflow_status: closed
qa_status: approved
release_status: released
user_visible: false
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

# BUGFIX-POS-AUTENTICACION-CAJA-20260828

## Solicitud original

En algunas peticiones aparece {"detail":"Las credenciales de autenticación no se proveyeron."}. Se ha observado en get_cash_registers, archings y create_close_cash_register. Revisar esos consumidores y otros flujos relacionados para asegurar que, cuando el endpoint exige token, la petición lo envíe correctamente.

## Descripción funcional

- Alcance: restituir el encabezado `Authorization: Bearer <JWT>` para las peticiones autenticadas de caja y arqueo, y auditar los consumidores POS del mismo patrón que puedan omitirlo.
- Usuario o rol afectado: usuarios autenticados que consultan cajas, consultan o crean arqueos, o cierran una caja desde Restaurante o POS comercial.
- Comportamiento actual: `get_cash_registers`, `get_archings` y `create_close_cash_register` pueden recibir la respuesta DRF de credenciales no provistas cuando sus endpoints exigen JWT.
- Comportamiento esperado: las llamadas autenticadas al API del tenant usan el token vigente almacenado como `auth_token`, sin exponerlo en payloads, trazas, mensajes ni documentación.

## Diagnóstico

- Archivos y flujo investigados: `BackEnd/ModPos/views/functions.py` protege `get_cash_registers` y `get_archings` con `JWTAuthentication` e `IsAuthenticatedAdmUser`; las pruebas backend ya verifican el rechazo sin autenticación. `FrontEnd/src/app/common/services/point-of-sale.service.ts` llama ambos endpoints directamente con `HttpClient` sin headers. `close-cash-register.component.ts` y `arching.component.ts` usan `GeneralService.post()` para `create_close_cash_register`; ese helper tampoco adjunta headers. `GeneralService.authHeaders()` existe y confirma que no hay interceptor HTTP global.
- Causa raíz o hipótesis: confirmada para los tres flujos reportados: los consumidores no aplican el helper de headers al hacer peticiones autenticadas. Queda pendiente inventario para otros endpoints POS con el mismo contrato y llamadas directas.
- Riesgos y compatibilidad: es un ajuste de autenticación en frontend. Debe limitarse al API tenant, conservar endpoints públicos, servicios externos y el cliente local que no usan JWT, y manejar una sesión sin token con el error existente sin fabricar credenciales.
- Impactos de sync, migración, Docker o despliegue: no aplican sync, migración ni Docker. El impacto de autenticación requiere aprobación explícita del PO antes de modificar código.

## Plan

- Gate de plan y aprobación del PO: aprobado explícitamente por el PO el 2026-08-28 mediante “si apruebo empieza la implementacion”. El alcance modifica la autenticación de peticiones HTTP de cliente.
- Paso 1 (POINT-001): inventariar en `ModPos/urls.py` y `ModPos/views/` los endpoints con JWT y contrastarlos con consumidores de `FrontEnd/src/app/common/services/point-of-sale.service.ts` y `GeneralService.post()`; separar los endpoints públicos, externos o locales.
- Paso 2 (POINT-001): aplicar `GeneralService.authHeaders()` solo a las peticiones del API tenant que lo requieren; cubrir expresamente `getCashRegisters`, `getArchings` y `create_close_cash_register`, evitando modificar contratos de payload o URLs.
- Paso 3 (POINT-001): crear o ampliar pruebas Angular que comprueben el header en los servicios afectados y conservar las pruebas backend de rechazo sin JWT; ejecutar los specs dirigidos y la compilación Angular.
- Paso 4 (POINT-001): entregar al PO recorrido manual con sesión vigente y sin sesión, desde POS y Restaurante, y confirmar que los endpoints protegidos dejan de responder por ausencia de credenciales.
- Rollback: revertir los cambios de headers y pruebas del frontend; no hay migración, datos persistentes, backup, canario ni orden especial de despliegue.

## Criterios de aceptación

- [ ] POINT-001: `get_cash_registers`, `get_archings` y `create_close_cash_register` envían `Authorization: Bearer <auth_token>` al API tenant cuando existe una sesión válida.
- [ ] POINT-001: la auditoría identifica y corrige, o documenta como no aplicables, los demás consumidores POS directos de endpoints JWT.
- [ ] POINT-001: las solicitudes sin token no fabrican un valor; conservan el manejo de error de autenticación y no exponen el token.
- [ ] POINT-001: se preservan payload, URL, aislamiento tenant y los llamados a endpoints públicos, externos y locales.

## Puntos

<!-- Crear POINT-NNN es append-only: no eliminar, reordenar ni reutilizar. Las transiciones solo las realiza el CLI, actualizan el punto actual y anexan un ticket-event. -->

```json
[
  {
    "id": "POINT-001",
    "title": "Peticiones de caja y arqueo envían token cuando el endpoint lo exige",
    "status": "closed",
    "severity": "high",
    "actual": "Algunas operaciones de caja y arqueo responden 401 con el detalle de credenciales no provistas; se observó en get_cash_registers, archings y create_close_cash_register.",
    "expected": "Cada consumidor de un endpoint autenticado adjunta el token vigente mediante el mecanismo HTTP central o el contrato explícito correspondiente, sin enviar ni registrar tokens en claro.",
    "evidence": [
      "EVIDENCE-001",
      "EVIDENCE-002"
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

- Archivos cambiados: `point-of-sale.service.ts`, `general.service.ts` y `point-of-sale.service.spec.ts`.
- Decisiones técnicas: `getCashRegisters` y `getArchings` usan `GeneralService.authHeaders()`; `GeneralService.post()` adjunta el mismo header para las operaciones de caja que lo consumen, incluido el cierre.
- Compatibilidad preservada: se mantienen URL, payload y `responseType`; el header solo se agrega a llamadas del API resueltas por `getDomain()`.
- Commit funcional: `00770c684cc3ecc6d5bc9d37ac6954f6915af433` — agrega el header JWT a los reportes de caja y arqueo, y al helper usado para cerrar caja.

## Pruebas

- Comandos para el PO: se definirán tras localizar los specs concretos; como mínimo `npx ng test --watch=false --browsers=ChromeHeadless --include=<spec-dirigido>` y `npm run build -- --progress=false`.
- Directorio de ejecución: `FrontEnd`.
- Resultado esperado: los specs confirman el encabezado para los endpoints protegidos y la compilación Angular finaliza con código 0.
- Validaciones manuales: con una sesión válida, consultar cajas, consultar arqueos y cerrar una caja desde POS y Restaurante; repetir sin sesión o token vencido y verificar que no se obtiene acceso ni se muestran datos de otro usuario o tenant.
- Requisitos de ambiente o datos: tenant de pruebas, usuario autorizado, una caja abierta, datos de arqueo y acceso a las rutas POS y Restaurante.
- Resultado comunicado por el PO: el 2026-08-28 el PO confirmó que la validación en nube fue perfecta y autorizó cerrar el ticket.
- Resultado técnico: el spec dirigido ejecutó 2 de 2 casos exitosos; Angular 14 emite después el aviso espurio conocido de `--include`. El build finalizó con código 0 (hash `141f328d3fc2664f`).

## QA

```json
[
  {
    "id": "QA-001",
    "date": "2026-08-28",
    "build_reference": "commit:e66adf933b3caf00768e9f988fd6f2ed7ddc1e46",
    "environment": "Validación en nube por el PO",
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
    "po_confirmation": "El PO confirmó: si perfecto puedes cerrar el ticket."
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
    "description": "El spec de PointOfSaleService reprodujo la ausencia del header y, tras la corrección, ejecutó 2 de 2 casos exitosos para get_cash_registers y get_archings. Angular 14 emitió después el aviso espurio conocido de --include.",
    "reference": null,
    "point_id": "POINT-001"
  },
  {
    "id": "EVIDENCE-002",
    "date": "2026-08-28",
    "kind": "build",
    "description": "npm run build -- --progress=false en FrontEnd finalizó con código 0; hash 141f328d3fc2664f.",
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
    "po_confirmation": "El PO confirmó: si perfecto puedes cerrar el ticket."
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
    "technical_summary": "Se agregaron headers JWT a reportes de caja y arqueo, y al helper de cierre de caja.",
    "functional_summary": "El PO validó en nube que las peticiones autenticadas dejan de devolver credenciales no provistas.",
    "qa_status": "approved",
    "qa_waiver_reason": null,
    "po_confirmation": "El PO confirmó: si perfecto puedes cerrar el ticket.",
    "release_impact": "Publicado en dev; permanece unreleased hasta promoción formal."
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
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-08-28",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-08-28",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-08-28",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-08-28",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-08-28",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
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
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-014",
    "date": "2026-08-28",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-015",
    "date": "2026-08-28",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-001 para POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-016",
    "date": "2026-08-28",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado approved."
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
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-019",
    "date": "2026-08-28",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-020",
    "date": "2026-08-28",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-021",
    "date": "2026-09-07",
    "action": "release-transition",
    "actor": "cli",
    "details": "Release: unreleased -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-022",
    "date": "2026-09-07",
    "action": "release-transition",
    "actor": "cli",
    "details": "Release: planned -> released."
  }
]
```
