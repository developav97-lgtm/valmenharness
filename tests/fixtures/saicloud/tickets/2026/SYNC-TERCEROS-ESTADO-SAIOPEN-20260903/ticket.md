---
schema_version: 1
id: SYNC-TERCEROS-ESTADO-SAIOPEN-20260903
title: El estado inactivo de terceros se revierte tras sincronizar con Saiopen
type: SYNC
module: TERCEROS
workflow_status: closed
qa_status: approved
release_status: released
user_visible: false
sync_impact: true
migration_impact: false
docker_impact: false
risk_level: high
created: 2026-09-03
updated: 2026-09-07
related_ticket: null
target_release: 6.2.4
released_in: 6.2.4
---

# SYNC-TERCEROS-ESTADO-SAIOPEN-20260903

## Solicitud original

hola tengo un problema con los terceros, necesito que creemos un ticket para solucionarlo. mira es lo siguiente actualmente AdmPartner tiene un campo state que es el activo o estado del tercero, que pasa que desde saicloud yo le quita el chulo para que quede en false y el manda a guardar asi pero a los segundos vuelve a true solo. porque pasa esto porque al parecer la actualizacion que se manda desde saicloud no manda el campo INACTIVO en N a saiopen generando que al volverlo a sicnronziar lo mande de nuevo en True tiene que ver con la sincronizacion a saiopen LocalAgents/saiopensync

## Descripción funcional

- Alcance: sincronización bidireccional de terceros entre SaiCloud y Saiopen mediante LocalAgents/saiopensync; incluye la representación del estado de `AdmPartner`.
- Usuario o rol afectado: usuarios con permiso para editar terceros en SaiCloud y los procesos locales que sincronizan el mismo tercero.
- Comportamiento actual: al desmarcar el estado de un tercero, SaiCloud persiste inicialmente `AdmPartner.state=false`, pero tras un ciclo de sincronización el registro vuelve a `state=true`.
- Comportamiento esperado: una desactivación guardada desde SaiCloud permanece inactiva en los ciclos posteriores de sincronización, sin reactivación automática.

## Diagnóstico

- Archivos y flujo investigados: `BackEnd/ModAdmin/serializers/partners.py` publica a SNS el payload construido por `BackEnd/ModAdmin/views/utils.py:get_partner_id()` tras crear o editar un tercero. Ese payload no contiene estado ni `INACTIVO`. `LocalAgents/saiopensync/internal/worker/partners.go:HandlePartnersMessage()` hace UPSERT de `CUST` por clave natural `ID_N`, pero fija `INACTIVO` a `"N"`. En sentido local→cloud, `LocalAgents/saiopensync/internal/mapping/assets/partner_sql.sql` traduce `CUST.INACTIVO='S'` a `STATE=False`; `push.go` publica el resultado a `BackEnd/ModAdmin/views/functions.py:partners_sinc_sai()`, que persiste `state` mediante `update_or_create`.
- Causa raíz o hipótesis: causa raíz confirmada: el contrato cloud→local omite el estado y el agente lo sustituye por el literal activo `INACTIVO="N"`. Un ciclo posterior local→cloud comunica `state=True` y sobrescribe la desactivación previamente guardada. La entrega debe verificar además la ventana de concurrencia entre un PUSH local pendiente y el mensaje cloud→local para preservar la regla cloud-gana.
- Riesgos y compatibilidad: el cambio no puede usar IDs locales como identidad; se conserva el UPSERT por `ID_N`, el ACK posterior al efecto local, los guards de señales `disable_sync_signals`/`skip_sync_queue` y la ausencia de duplicados en reintentos. El campo de contrato debe ser aditivo: agentes anteriores lo ignorarán y agentes nuevos mantendrán activo por defecto si reciben un backend anterior. Se comprobará aislamiento por tenant, reconexión y orden de eventos.
- Impactos de sync, migración, Docker o despliegue: afecta LocalAgents/saiopensync y los mensajes SNS de terceros. No requiere migración ni Docker según la evidencia actual. Requiere actualizar de forma coordinada backend y paquete de agente, con tenant autorizado, Firebird representativo, rollback y sin incluir secretos en evidencias.

## Plan

- Alcance y exclusiones: corregir solo la propagación del estado de `AdmPartner` entre SaiCloud y `CUST.INACTIVO` de Saiopen. No cambia la interfaz Angular, `AdmPartnerBranch.state`, claves naturales, esquemas, migraciones, Docker, credenciales ni `ALLOWED_HOSTS`.
- Gate de plan y aprobación del PO: aprobado explícitamente por el PO el 2026-09-03 para el alcance, contrato aditivo, orden backend → agente y rollback documentados en este plan. Por ser `SYNC` y afectar LocalAgents/saiopensync, cualquier cambio material exige renovar esta aprobación antes de escribirlo.
- Pasos ordenados:
  1. En `BackEnd/ModAdmin/views/utils.py`, extender el payload de `get_partner_id()` con un campo aditivo `INACTIVO`, derivado de `AdmPartner.state` (`false` → `"S"`; `true` → `"N"`). Mantener todos los campos y claves actuales; el serializer continuará publicando el mismo payload SNS tras el guardado (POINT-001).
  2. En `LocalAgents/saiopensync/internal/worker/partners.go`, reemplazar el literal `INACTIVO: "N"` del UPSERT de `CUST` por una normalización explícita del nuevo campo. Aceptar solamente las representaciones compatibles `S`/`N` y usar `"N"` si el campo está ausente o inválido, para que el agente nuevo siga siendo compatible con backend anterior. Mantener UPSERT por `ID_N` y no alterar el momento de ACK (POINT-001).
  3. Revisar el ciclo PUSH de `partner_sql.sql` y `push.go` sin cambiar su mapeo ya correcto `INACTIVO='S'` → `state=False`. Añadir una prueba de integración dirigida que simule el recorrido cloud inactivo → CUST inactivo → payload local inactivo → `partners_sinc_sai`, y una prueba de orden/reintento que confirme que el estado no vuelve a activo ni genera un segundo tercero. Si el análisis de esa prueba revela un PUSH local pendiente que pueda ganar la carrera, ajustar el plan antes de implementar para introducir el mecanismo existente de ordenamiento, sin inventar un identificador local ni cambiar la regla cloud-gana.
  4. Añadir pruebas unitarias Django para el payload de `get_partner_id()` activo e inactivo; añadir pruebas Go para la normalización y el `CUST` construido por el agente en los valores `S`, `N` y campo ausente. Cubrir explícitamente el contrato anterior sin `INACTIVO`, reintento idempotente y la traducción inversa ya existente (POINT-001).
- Compatibilidad, orden de despliegue y rollback: desplegar primero el backend cloud compatible, que añade un campo ignorado sin efecto por agentes anteriores; después, en un tenant autorizado, instalar el paquete nuevo de `saiopensync` sobre un Firebird representativo y verificar el ciclo completo antes de ampliar la distribución. La reversión es primero al agente anterior y después, si se requiere, al backend previo; el campo adicional es tolerado/ignorado y no exige revertir datos ni reprocesar mensajes. No se distribuye el agente a más clientes hasta completar la validación del canario.

## Criterios de aceptación

- [ ] POINT-001: al guardar un tercero con `AdmPartner.state=false` en SaiCloud, Saiopen recibe y conserva el valor local equivalente `INACTIVO="S"`.
- [ ] POINT-001: después de uno o más ciclos cloud→local→cloud y de un reintento, el tercero continúa con `state=false` en SaiCloud y no se duplica.
- [ ] POINT-001: el payload cloud→local de un tercero activo contiene `INACTIVO="N"` y el de uno inactivo contiene `INACTIVO="S"`; un agente nuevo ante un payload sin el campo conserva el comportamiento anterior activo.
- [ ] Los terceros activos conservan el comportamiento actual y no se alteran claves naturales, ACK ni los guards de sincronización vigentes.

## Puntos

<!-- Crear POINT-NNN es append-only: no eliminar, reordenar ni reutilizar. Las transiciones solo las realiza el CLI, actualizan el punto actual y anexan un ticket-event. -->

```json
[
  {
    "id": "POINT-001",
    "title": "La desactivación de AdmPartner se revierte después del ciclo SaiCloud–Saiopen",
    "status": "closed",
    "severity": "high",
    "actual": "Al guardar AdmPartner.state=false desde SaiCloud, el tercero queda inactivo inicialmente pero, segundos después, vuelve a state=true. La hipótesis reportada es que el envío cloud→Saiopen no persiste INACTIVO=N en Saiopen y el siguiente retorno Saiopen→cloud vuelve a activar el tercero.",
    "expected": "Al guardar AdmPartner.state=false, la sincronización debe representar de forma compatible ese estado como INACTIVO=N en Saiopen y conservar state=false tras ciclos y reintentos, sin duplicados ni reactivaciones involuntarias.",
    "evidence": [
      "EVIDENCE-001",
      "EVIDENCE-002",
      "EVIDENCE-003",
      "EVIDENCE-004"
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

- Archivos cambiados: `BackEnd/ModAdmin/views/utils.py`, `BackEnd/ModAdmin/tests/test_views_functions.py`, `LocalAgents/saiopensync/internal/worker/partners.go` y `LocalAgents/saiopensync/internal/worker/worker_test.go`.
- Decisiones técnicas: `get_partner_id()` añade el campo aditivo `INACTIVO`, con `S` para `AdmPartner.state=false` y `N` para activo. `HandlePartnersMessage()` usa una normalización específica del contrato al construir el UPSERT de `CUST`; el valor ausente o inválido conserva `N` para compatibilidad con backend anterior.
- Compatibilidad preservada: el UPSERT sigue usando `ID_N`; no se alteraron ACK, claves naturales, guards de señales, migraciones, Docker ni instalación/puerto del agente. Un agente anterior ignora el campo adicional y un agente nuevo tolera un backend que aún no lo envíe.
- Commits atribuibles al ticket:
  - `f96cf3d442d40d0c78545694f377cf75acc27c77` — propaga el estado de terceros hacia `CUST.INACTIVO` y añade regresiones Django y Go.
  - `8caffabd94ebfc9674718dc1275ad9c94c3ce612` — documenta el ciclo de pruebas, QA y cierre funcional del ticket.

## Pruebas

- Comandos para el PO: desde la raíz, `docker compose run --rm backend python manage.py test --keepdb ModAdmin.tests.test_views_functions.PartnerSaiopenPayloadStateTest ModAdmin.tests.test_views_functions.PartnersSincSaiViewTest`; desde `LocalAgents/saiopensync`, `go test ./...`. Para construir el canario Windows tras asignar versión, `make package-windows VERSION=<versión-aprobada>`.
- Directorio de ejecución: raíz del repositorio para Django con Docker Compose; `LocalAgents/saiopensync` para Go y el empaquetado.
- Resultado esperado: ambas suites terminan exitosamente; el paquete Windows contiene el ejecutable y scripts de instalación vigentes, sin publicar ni instalar por este paso.
- Validaciones manuales: en un tenant de prueba autorizado con un tercero activo existente en Saiopen, desmarcarlo en SaiCloud; verificar en Firebird que `CUST.INACTIVO='S'`; esperar al menos dos ciclos de PUSH/PULL y confirmar que SaiCloud continúa `state=false`. Repetir tras reiniciar el agente y con un tercero activo de control. Revisar que no se creó un segundo `CUST` ni un segundo `AdmPartner` para la misma identificación.
- Requisitos de ambiente o datos: tenant de canario autorizado, copia o instancia Firebird representativa no productiva, un tercero de prueba con identificación conocida y acceso seguro a los logs del agente. No registrar DSN, tokens ni datos personales en el ticket.
- Resultado local: `docker compose run --rm backend python manage.py test --keepdb ModAdmin.tests.test_views_functions.PartnerSaiopenPayloadStateTest ModAdmin.tests.test_views_functions.PartnersSincSaiViewTest` terminó con 11 pruebas exitosas. `go test ./...` en `LocalAgents/saiopensync` terminó correctamente en todos los paquetes.
- Resultado comunicado por el PO: el 2026-09-03, el PO confirmó en dev que al desactivar un tercero el estado no se revierte después de la sincronización.
- Resultado comunicado por el PO:

## QA

```json
[
  {
    "id": "QA-001",
    "date": "2026-09-03",
    "build_reference": "commit:f96cf3d442d40d0c78545694f377cf75acc27c77",
    "environment": "dev",
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
    "result": "approved",
    "findings": [],
    "correction": null,
    "po_confirmation": "PO ordena cerrar el ticket tras confirmar que el estado del tercero permanece inactivo."
  }
]
```

## Evidencia

```json
[
  {
    "id": "EVIDENCE-001",
    "date": "2026-09-03",
    "kind": "automated",
    "description": "Revisión estática del flujo: get_partner_id no incluye INACTIVO; HandlePartnersMessage fija CUST.INACTIVO a N; partner_sql.sql traduce INACTIVO=S a STATE=False. Por tanto, la representación correcta de un tercero inactivo en Saiopen es S, no N.",
    "reference": null,
    "point_id": "POINT-001"
  },
  {
    "id": "EVIDENCE-002",
    "date": "2026-09-03",
    "kind": "automated",
    "description": "Django: 11 pruebas exitosas con PartnerSaiopenPayloadStateTest y PartnersSincSaiViewTest usando la base de pruebas local preservada.",
    "reference": null,
    "point_id": "POINT-001"
  },
  {
    "id": "EVIDENCE-003",
    "date": "2026-09-03",
    "kind": "automated",
    "description": "Go: go test ./... finalizó correctamente para todos los paquetes de LocalAgents/saiopensync, incluida la regresión del contrato INACTIVO.",
    "reference": null,
    "point_id": "POINT-001"
  },
  {
    "id": "EVIDENCE-004",
    "date": "2026-09-03",
    "kind": "manual",
    "description": "PO confirma que el estado del tercero ya no se revierte tras la sincronización.",
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
    "date": "2026-09-03",
    "point_id": "POINT-001",
    "result": "approved",
    "evidence": [],
    "po_confirmation": "PO confirma que el estado del tercero ya no se revierte tras la sincronización."
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
    "technical_summary": "Se añadió el contrato INACTIVO al payload cloud→local y el agente lo persiste en CUST sin perder compatibilidad con payloads anteriores.",
    "functional_summary": "El PO confirmó en dev que desactivar un tercero ya no se revierte tras la sincronización.",
    "qa_status": "approved",
    "qa_waiver_reason": null,
    "po_confirmation": "PO ordena cerrar el ticket después de confirmar el resultado en dev.",
    "release_impact": "El ticket queda cerrado funcionalmente y unreleased; el backend compatible debe actualizarse antes que el agente en una futura publicación."
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
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-09-03",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-09-03",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-09-03",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-09-03",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-09-03",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-09-03",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-09-03",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-002."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-09-03",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-003."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-09-03",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-09-03",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-014",
    "date": "2026-09-03",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-004."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-015",
    "date": "2026-09-03",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-016",
    "date": "2026-09-03",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-017",
    "date": "2026-09-03",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-001 para POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-018",
    "date": "2026-09-03",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: verified -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-019",
    "date": "2026-09-03",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-020",
    "date": "2026-09-03",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-021",
    "date": "2026-09-03",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-022",
    "date": "2026-09-03",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-023",
    "date": "2026-09-07",
    "action": "release-transition",
    "actor": "cli",
    "details": "Release: unreleased -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-024",
    "date": "2026-09-07",
    "action": "release-transition",
    "actor": "cli",
    "details": "Release: planned -> released."
  }
]
```
