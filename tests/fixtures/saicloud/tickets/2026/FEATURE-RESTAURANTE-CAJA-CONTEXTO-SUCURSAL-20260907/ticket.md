---
schema_version: 1
id: FEATURE-RESTAURANTE-CAJA-CONTEXTO-SUCURSAL-20260907
title: Mostrar sucursal en arqueo y cierre de caja
type: FEATURE
module: RESTAURANTE
workflow_status: closed
qa_status: approved
release_status: released
user_visible: true
sync_impact: false
migration_impact: false
docker_impact: false
risk_level: normal
created: 2026-09-07
updated: 2026-09-17
related_ticket: null
target_release: 6.2.5
released_in: 6.2.5
---

# FEATURE-RESTAURANTE-CAJA-CONTEXTO-SUCURSAL-20260907

## Solicitud original

En las pantallas de Restaurante para hacer arqueo (/restaurant/arching), hacer cierre (/restaurant/close-cash-register) y ver cierre (/restaurant/cash-register/5319/False), se debe mostrar visualmente la sucursal de la caja activa. En la pantalla de arqueo, donde hoy no se muestra información contextual, deben verse al menos usuario, sucursal y caja. La captura aportada muestra el detalle de cierre actual, que ya presenta usuario, caja/serial, apertura y cierre, pero no sucursal.

## Descripción funcional

- Alcance: mostrar el contexto de la caja activa exclusivamente en las rutas de Restaurante: arqueo, cierre y detalle de cierre. El cambio no altera el cálculo, apertura, arqueo, cierre ni impresión.
- Usuario o rol afectado: cajeros y administradores que operan cierres de caja en Restaurante.
- Comportamiento actual: las pantallas de cierre y detalle muestran usuario, caja/serial y fechas, pero omiten la sucursal; arqueo no muestra un resumen contextual de la caja.
- Comportamiento esperado: las tres pantallas muestran la sucursal de la apertura. Arqueo muestra además Usuario, Sucursal y Caja / Serial antes de registrar el arqueo.

## Diagnóstico

- Archivos y flujo investigados: las rutas de Restaurante reutilizan `ArchingComponent`, `CloseCashRegisterComponent` y `CashRegisterComponent` desde `FrontEnd/src/app/Compartidos/Pos/`. Los tres obtienen `cash_register` con `PointOfSaleService.getCashRegister`; las cabeceras actuales de cierre y detalle usan usuario/caja/fechas, y arqueo carece de un bloque equivalente.
- Causa raíz o hipótesis: el contrato expone la referencia de sucursal de la caja, pero los componentes no resuelven ni presentan una etiqueta humana de sucursal. Los componentes son compartidos también por POS, por lo que una modificación no condicionada ampliaría el alcance visual fuera de Restaurante.
- Riesgos y compatibilidad: debe presentarse la sucursal de la apertura de caja, no una sucursal predeterminada del usuario. Se preservan los registros históricos sin sucursal con una etiqueta segura “Sucursal no disponible”. El cambio se condiciona a rutas de Restaurante para no alterar POS.
- Impactos de sync, migración, Docker o despliegue: no hay cambios de contrato, modelos, sincronización, migración, Docker, autenticación, WebSocket ni despliegue.

## Plan

- Gate de plan y aprobación del PO: aprobado explícitamente por el PO el 2026-09-07 mediante “si dale”; la aprobación habilita la implementación de esta FEATURE visible al usuario.
- Alcance y exclusiones: aplicar el contexto visual solo cuando el módulo activo sea Restaurante. No cambiar los flujos ni pantallas de POS, endpoints, impresiones, permisos ni datos persistidos.
- Pasos ordenados:
  1. Extraer en los tres componentes la etiqueta de sucursal desde la referencia ya entregada por `getCashRegister` y la colección de sucursales disponible en `Setting`, usando la sucursal persistida de la caja. Definir una etiqueta de fallback para aperturas históricas sin referencia. Archivos: los tres componentes TypeScript; `POINT-001`.
  2. Añadir el campo “Sucursal” a las cabeceras existentes de cierre y detalle, visible solo en Restaurante. Archivos: `close-cash-register.component.html` y `cash-register.component.html`; `POINT-001`.
  3. Añadir una cabecera contextual en arqueo con Usuario, Sucursal y Caja / Serial, antes de los controles de conteo. Archivo: `arching.component.html`; `POINT-001`.
  4. Crear o ampliar pruebas unitarias de los componentes para la etiqueta de sucursal y su fallback; ejecutar la suite afectada y la compilación Angular.
- Rollback, backup, canario u orden de despliegue cuando aplique: no requiere backup, canario ni migración. Si se observa una presentación incorrecta, revertir las plantillas y helpers de los componentes; no existen mutaciones de datos que revertir.

## Criterios de aceptación

- [x] `POINT-001`: en `/restaurant/arching`, antes de guardar, se muestran Usuario, Sucursal y Caja / Serial de la caja activa.
- [x] `POINT-001`: en `/restaurant/close-cash-register` y `/restaurant/cash-register/:id/:alter`, la cabecera muestra la sucursal persistida de la caja junto al contexto actual.
- [x] `POINT-001`: una caja histórica sin sucursal se identifica como “Sucursal no disponible”, sin impedir arqueo, cierre o consulta.
- [x] `POINT-001`: las rutas equivalentes de POS no cambian visualmente y los cálculos, impresiones y permisos de caja conservan su comportamiento.

## Puntos

<!-- Crear POINT-NNN es append-only: no eliminar, reordenar ni reutilizar. Las transiciones solo las realiza el CLI, actualizan el punto actual y anexan un ticket-event. -->

```json
[
  {
    "id": "POINT-001",
    "title": "El arqueo y cierres no identifican visualmente la sucursal",
    "status": "closed",
    "severity": "normal",
    "actual": "Las pantallas de arqueo, cierre y detalle de cierre no muestran de forma consistente la sucursal de la caja activa. El arqueo no muestra usuario, sucursal ni caja.",
    "expected": "En las tres pantallas de Restaurante se muestra la sucursal de la caja; el arqueo muestra además usuario y caja antes de registrar el movimiento.",
    "evidence": [
      "EVIDENCE-001",
      "EVIDENCE-002",
      "EVIDENCE-003"
    ],
    "affected_files": [
      "FrontEnd/src/app/Compartidos/Pos/arching/arching/arching.component.ts",
      "FrontEnd/src/app/Compartidos/Pos/arching/arching/arching.component.html",
      "FrontEnd/src/app/Compartidos/Pos/close-cash-register/close-cash-register.component.ts",
      "FrontEnd/src/app/Compartidos/Pos/close-cash-register/close-cash-register.component.html",
      "FrontEnd/src/app/Compartidos/Pos/cash-register/cash-register/cash-register.component.ts",
      "FrontEnd/src/app/Compartidos/Pos/cash-register/cash-register/cash-register.component.html"
    ],
    "diagnosis": "Los componentes compartidos no resolvían ni mostraban la sucursal de la caja activa en el contexto de Restaurante.",
    "solution": "Se resolvió la sucursal desde id_admcompanybranch y Setting.CompanyBranch, con fallback seguro, y se añadieron bloques contextuales condicionados al módulo Restaurante.",
    "tests": [
      "25 pruebas unitarias específicas exitosas",
      "npm run build exitoso"
    ],
    "qa_cycles": [
      "QA-001"
    ],
    "terminal_reason": null,
    "related_ticket": null
  }
]
```

## Implementación

- Archivos cambiados: `arching`, `close-cash-register` y `cash-register` (plantillas, componentes y pruebas unitarias) bajo `FrontEnd/src/app/Compartidos/Pos/`.
- Decisiones técnicas: la sucursal se resuelve a partir de `id_admcompanybranch` de la caja abierta/cerrada y `Setting.CompanyBranch`; se acepta id numérico o texto para preservar configuraciones cacheadas. Si no existe referencia o coincidencia, se presenta “Sucursal no disponible”.
- Compatibilidad preservada: los bloques visuales nuevos se muestran únicamente cuando el módulo activo es Restaurante. No se modificaron contratos, cálculos, impresiones, permisos ni rutas de POS.
- Commits atribuibles al ticket:
  - `e6ef0f14` — implementación funcional de contexto visual de sucursal, usuario y caja en arqueo, cierre y detalle.
  - `c685a700ccd672cd6fee6780b12f6f4b14ef2000` — creación del ticket canónico, índice y trazabilidad inicial.

## Pruebas

- Comandos para el PO: `npm run build` y, para reproducir una suite, `npx ng test --watch=false --browsers=ChromeHeadless --include='src/app/Compartidos/Pos/arching/arching/arching.component.spec.ts'`.
- Directorio de ejecución: `FrontEnd/`.
- Resultado esperado: la compilación finaliza sin errores; las tres rutas de Restaurante presentan el contexto correcto. La ejecución de las suites específicas registró 9/9, 8/8 y 8/8 casos exitosos; la CLI de Angular después informa un aviso de patrón no coincidente que no invalida los casos ya ejecutados.
- Validaciones manuales: abrir arqueo, cierre y detalle de una misma caja de sucursal 5 y confirmar que todos muestran Usuario, Sucursal y Caja / Serial. Repetir con una caja de sucursal 8 y confirmar que no hereda la sucursal anterior.
- Requisitos de ambiente o datos: tenant dev con cajas abiertas o cerradas en dos sucursales y acceso de cajero o administrador de Restaurante.
- Resultado comunicado por el PO: Omisión explícita documentada por el PO al solicitar el cierre del ticket después de la entrega en dev; se toma la evidencia automatizada registrada como validación de la implementación.

## QA

```json
[
  {
    "id": "QA-001",
    "date": "2026-09-08",
    "build_reference": "commit:c685a700ccd672cd6fee6780b12f6f4b14ef2000",
    "environment": "dev",
    "result": "pending",
    "findings": [],
    "correction": null,
    "po_confirmation": null
  },
  {
    "id": "QA-002",
    "date": "2026-09-08",
    "build_reference": null,
    "environment": null,
    "result": "approved",
    "findings": [],
    "correction": null,
    "po_confirmation": "El PO solicitó cerrar el ticket después de revisar la entrega publicada en dev."
  }
]
```

## Evidencia

```json
[
  {
    "id": "EVIDENCE-001",
    "date": "2026-09-07",
    "kind": "manual",
    "description": "Captura aportada por el PO del detalle de cierre: se observan Usuario, Caja / Serial, Apertura y Cierre, sin sucursal visible.",
    "reference": null,
    "point_id": "POINT-001"
  },
  {
    "id": "EVIDENCE-002",
    "date": "2026-09-07",
    "kind": "automated",
    "description": "Pruebas unitarias específicas ejecutadas: cierre 9 SUCCESS, arqueo 8 SUCCESS y detalle 8 SUCCESS; la CLI de Angular emite después un aviso de patrón no coincidente pese a haber ejecutado las suites.",
    "reference": null,
    "point_id": "POINT-001"
  },
  {
    "id": "EVIDENCE-003",
    "date": "2026-09-07",
    "kind": "automated",
    "description": "Compilación Angular completada con npm run build el 2026-09-07; se generó FrontEnd/dist/from-sai-open-cloud/.",
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
    "date": "2026-09-08",
    "point_id": "POINT-001",
    "result": "approved",
    "evidence": [],
    "po_confirmation": "El PO solicitó cerrar el ticket después de revisar la entrega publicada en dev."
  }
]
```

## Cierre

<!-- Bloque JSON append-only de objetos con `kind: "ticket-close"`; el esquema completo está en ticket-schema.md. -->

- Cierre técnico y funcional: implementación y pruebas registradas; POINT-001 verificado y cerrado.
- Resultado comunicado por el PO: el PO solicitó explícitamente cerrar el ticket después de revisar la entrega publicada en dev.
- QA aprobada o eximida (motivo y confirmación explícita del PO si aplica): QA-001/QA-002 aprobada con confirmación explícita del PO.
- Riesgo residual e impacto de release: el cambio permanece unreleased y requiere el flujo de release `dev` → `production`; no se modifican datos persistidos ni contratos.
- Texto visible al usuario cuando aplique: “Sucursal no disponible” para cajas históricas sin referencia de sucursal.

```json
[
  {
    "kind": "ticket-close",
    "id": "CLOSE-001",
    "date": "2026-09-08",
    "technical_summary": "Implementación frontend desplegada en dev y verificada mediante pruebas unitarias y compilación Angular; se agregó el contexto de sucursal en arqueo, cierre y detalle.",
    "functional_summary": "El flujo de Restaurante muestra Usuario, Sucursal y Caja / Serial en las pantallas solicitadas, con fallback seguro para cajas sin sucursal.",
    "qa_status": "approved",
    "qa_waiver_reason": null,
    "po_confirmation": "El PO solicitó cerrar el ticket después de revisar la entrega publicada en dev.",
    "release_impact": "El ticket queda cerrado funcionalmente y continúa unreleased; no autoriza producción ni release."
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
    "date": "2026-09-07",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-09-07",
    "action": "point-added",
    "actor": "cli",
    "details": "Se agregó POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-09-07",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-09-07",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-09-07",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-09-07",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-09-07",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-09-07",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-09-07",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-09-07",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-002."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-09-07",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-003."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-09-07",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-09-07",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-014",
    "date": "2026-09-08",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-015",
    "date": "2026-09-08",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-016",
    "date": "2026-09-08",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-001 para POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-017",
    "date": "2026-09-08",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-018",
    "date": "2026-09-08",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: verified -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-019",
    "date": "2026-09-08",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-020",
    "date": "2026-09-08",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-021",
    "date": "2026-09-08",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-022",
    "date": "2026-09-17",
    "action": "release-transition",
    "actor": "cli",
    "details": "Release: unreleased -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-023",
    "date": "2026-09-17",
    "action": "release-transition",
    "actor": "cli",
    "details": "Release: planned -> released."
  }
]
```
