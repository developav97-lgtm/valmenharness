---
schema_version: 1
id: SYNC-RESTAURANTE-MANDANTE-MESERO-20260907
title: Enviar identificación del mesero a MANDANTE en propina restaurante
type: SYNC
module: RESTAURANTE
workflow_status: closed
qa_status: approved
release_status: released
user_visible: true
sync_impact: true
migration_impact: true
docker_impact: false
risk_level: high
created: 2026-09-07
updated: 2026-09-17
related_ticket: null
target_release: 6.2.5
released_in: 6.2.5
---

# SYNC-RESTAURANTE-MANDANTE-MESERO-20260907

## Solicitud original

Mover document y state de la pestaña Cartera a General en AdmUser. Agregar en Compañía > Restaurante un parámetro para habilitar el envío de la identificación del mesero como MANDANTE al registrar la propina (other) de facturas PosOrder originadas en restaurante hacia OE_FLETE mediante LocalAgents/saiopensync. Si el parámetro está desactivado o el mesero no tiene identificación, conservar exactamente el valor actual de MANDANTE.

## Descripción funcional

- Alcance: mover los controles globales `document` y `state` de `AdmUser` a General; añadir una preferencia de restaurante por compañía; propagar de forma aditiva el documento del mesero para la fila de propina en `OE_FLETE`; y reorganizar visualmente la pestaña Restaurante.
- Usuario o rol afectado: administradores que configuran usuarios y compañía; cajeros/meseros de órdenes de restaurante; y los clientes que consumen la factura con `LocalAgents/saiopensync`.
- Comportamiento actual: la identificación y el estado activo solo se muestran bajo Cartera. `AdmSettingRestaurant` no controla este comportamiento. Una `PosOrder` de restaurante guarda el cajero, mientras el mesero está en `ResOrder.id_admuser`, accesible por `PosOrder.id_origin`; el agente inserta `OE_FLETE` de `OTROSCARGOS` sin clave `MANDANTE`.
- Comportamiento esperado: General muestra identificación y estado activo junto con los datos básicos. Compañía > Restaurante expone el interruptor "Enviar identificación del mesero en la propina a SaiOpen", apagado por defecto. Al activarlo, una factura de restaurante con propina incluye el documento del mesero solamente en el `OE_FLETE` de propina; sin flag, sin documento o fuera de restaurante se conserva el comportamiento actual.

## Diagnóstico

- Archivos y flujo investigados: `FrontEnd/src/app/administration/users/user/adm-user.component.html` contiene `document` y `state` en Cartera; su `FormGroup` ya los conserva como atributos globales. `BackEnd/ModAdmin/models/settings.py` define `AdmUser` y `AdmSettingRestaurant`; `BackEnd/ModAdmin/serializers/settings.py` publica ambas entidades. `FrontEnd/src/app/administration/company/adm-setting.component.{ts,html}` y `models/setting.model.ts` ya aplican el patrón de un interruptor de restaurante. `BackEnd/ModRestaurant/models/orders.py` confirma `ResOrder.id_admuser` (mesero) y `id_admuser_cashier`. La facturación restaurante crea la `PosOrder` con `id_origin` de la orden. `LocalAgents/saiopensync/internal/worker/invoice.go` borra/reinserta `OE_FLETE` en una transacción y actualmente crea la fila de `OTROSCARGOS` sin `MANDANTE`.
- Causa raíz o hipótesis: no existe una relación persistida PosOrder→mesero ni una extensión compatible del mensaje de factura. Resolver el mesero al publicar la factura, desde `id_origin` únicamente cuando el origen sea restaurante, evita duplicar identidad local. El contrato exacto cloud→agente y la ruta que arma el mensaje deben verificarse durante la implementación antes de codificarlo.
- Riesgos y compatibilidad: este es un cambio de migración y contrato cloud-local. El campo nuevo debe ser nullable/false por defecto y el consumidor Go debe aceptar mensajes antiguos sin la clave. En reintentos, el agente ya elimina y recrea las filas del mismo documento en una única transacción; la extensión no debe alterar esa identidad ni afectar domicilio, facturas POS normales o documentos sin identificación. El valor de respaldo de `MANDANTE` debe ser exactamente su ausencia actual, no un valor inventado.
- Impactos de sync, migración, Docker o despliegue: `sync_impact: true`; migración compatible requerida en cada schema tenant; no hay cambio Docker planeado. Cambio crítico en LocalAgent: el despliegue debe ser nube compatible primero y agente después; rollback debe permitir continuar con el binario anterior ignorando la extensión.

## Plan

- Alcance y exclusiones: no se alteran `AdmUser.document` ni `state` en base de datos, ni se modifica `ALLOWED_HOSTS`, el listener local, ni se agrega MANDANTE a domicilio u otras líneas de cargo. La función aplica solo a la línea `OTROSCARGOS` que representa `other` de una `PosOrder` originada en restaurante.
- Gate de plan: aprobado explícitamente por el PO el 2026-09-07 para POINT-001 a POINT-003. La ampliación visual POINT-004 fue aprobada explícitamente por el PO el 2026-09-07 mediante el mensaje "si dale"; se limita a la reorganización descrita en el paso 6, sin cambiar contratos ni sincronización.
- Pasos ordenados:
  1. [POINT-001] Ajustar el template y sus pruebas Angular para mostrar Documento y Activo en General con etiquetas, validación y orden visual coherentes; retirar solo esos dos controles de Cartera y preservar allí los controles propios de cartera.
  2. [POINT-002] Añadir a `AdmSettingRestaurant` el booleano `send_waiter_document_to_saiopen_tip` (propuesta de nombre), con `default=False`; crear migración expand compatible, exponerlo por el serializer/API y por `AdmSettingRestaurant` TypeScript; incorporarlo como interruptor en Compañía > Restaurante y cubrir su carga/guardado y default.
  3. [POINT-003] Localizar y extender aditivamente el productor cloud del mensaje de factura: para una PosOrder de restaurante, consultar selectivamente `ResOrder` por `id_origin`, `select_related('id_admuser')`, y cuando la configuración esté habilitada y el documento no esté vacío publicar una clave explícita de MANDANTE para la propina. Para todos los demás casos, omitir la clave para conservar el contrato anterior. Documentar la consulta y confirmar que no confunde `id_origin` de facturas de otros flujos.
  4. [POINT-003] Actualizar `LocalAgents/saiopensync/internal/worker/invoice.go` para que solo `insertOEFlete` de `OTROSCARGOS` use la extensión recibida y escriba `MANDANTE` si existe. Mantener el fallback actual (campo omitido/valor actual) para mensajes antiguos, flag apagado, documento ausente, origen no restaurante y `DOMICILE`; conservar delete+insert en una única transacción y ACK posterior al commit.
  5. [POINT-001, POINT-002, POINT-003] Añadir regresiones Django, Angular y Go: UI y serialización; facturas de restaurante con flag/documento; flag apagado; documento vacío; factura POS no restaurante; domicilio; repetición del mismo mensaje; y formato antiguo sin la nueva clave. Verificar que los reintentos no duplican `OE_FLETE` y que la nube sigue ganando en la actualización de configuración.
  6. [POINT-004] Reestructurar solo el HTML de la pestaña Restaurante siguiendo el patrón `d-flex flex-column gap-4` y `setting-card` de Facturación Electrónica: (a) tarjeta **Reglas de facturación** con Tipo de negocio, Liquidación de impuestos y Redondeo de propina; (b) tarjeta **Operación del restaurante** con Agrupar líneas y Mostrar prioritario; (c) tarjeta **Comandas y cocina** con WebSocket, override de zona y escalado de subcategorías; y (d) tarjeta **Integración con SaiOpen** con el interruptor de identificación del mesero. Conservar FormControls, IDs, ayudas, dependencia WebSocket→override, valores y payload sin cambios.
- Compatibilidad, orden de despliegue y rollback: aplicar primero migración compatible y backend que omite la extensión por default, validar en un tenant autorizado y canario con flag apagado, luego habilitarla solo en el tenant autorizado y finalmente distribuir el binario Go que entiende la extensión. El binario previo debe seguir procesando el mensaje por ignorar claves no mapeadas; si hay regresión, apagar el flag para detener el envío de la clave y volver al binario previo. Antes de migrar producción: backup verificable de la base tenant, comprobación del estado de la migración y plan de restauración; no se asumen host, imagen, digest ni datos de Firebird.

## Criterios de aceptación

- [x] [POINT-001] Documento y Activo aparecen en General; Cartera ya no los duplica y la validación existente de documento/permiso de estado se conserva.
- [x] [POINT-002] Compañía > Restaurante guarda y vuelve a cargar el interruptor "Enviar identificación del mesero en la propina a SaiOpen"; instalaciones existentes quedan apagadas tras la migración.
- [x] [POINT-003] Con interruptor activo, propina distinta de cero, PosOrder de restaurante y documento de mesero, solo el `OE_FLETE` de la propina recibe ese documento como `MANDANTE`.
- [x] [POINT-003] Con interruptor apagado, documento vacío, origen no restaurante, propina cero o línea de domicilio, `MANDANTE` queda exactamente como antes.
- [x] [POINT-003] Mensajes preexistentes y reintentos se procesan sin error ni duplicar OE_FLETE; el ACK/sincronización se conserva posterior al commit.
- [x] [POINT-004] Restaurante presenta cuatro bloques legibles, con títulos e iconos coherentes con Facturación Electrónica, y mantiene la operación actual en escritorio y tamaños reducidos.

## Puntos

<!-- Crear POINT-NNN es append-only: no eliminar, reordenar ni reutilizar. Las transiciones solo las realiza el CLI, actualizan el punto actual y anexan un ticket-event. -->

```json
[
  {
    "id": "POINT-001",
    "title": "Reubicar documento y estado del usuario en General",
    "status": "closed",
    "severity": "normal",
    "actual": "Documento y el interruptor Activo se muestran exclusivamente en Cartera, aunque ambos son atributos globales de AdmUser.",
    "expected": "Documento y Activo se muestran en General en una disposición clara; Cartera conserva únicamente sus parámetros de cartera.",
    "evidence": [],
    "affected_files": [],
    "diagnosis": null,
    "solution": null,
    "tests": [],
    "qa_cycles": [
      "QA-003"
    ],
    "terminal_reason": null,
    "related_ticket": null
  },
  {
    "id": "POINT-002",
    "title": "Configurar envío de identificación del mesero para propina",
    "status": "closed",
    "severity": "high",
    "actual": "No existe un parámetro de restaurante que controle el uso de la identificación del mesero al sincronizar la propina.",
    "expected": "Compañía > Restaurante ofrece un interruptor desactivado por defecto para habilitar el envío de identificación del mesero en MANDANTE de la propina.",
    "evidence": [],
    "affected_files": [],
    "diagnosis": null,
    "solution": null,
    "tests": [],
    "qa_cycles": [
      "QA-003"
    ],
    "terminal_reason": null,
    "related_ticket": null
  },
  {
    "id": "POINT-003",
    "title": "Propagar MANDANTE de propina restaurante a SaiOpen",
    "status": "closed",
    "severity": "high",
    "actual": "El agente crea OE_FLETE para OTROSCARGOS sin MANDANTE; PosOrder conserva al cajero y el mesero se resuelve mediante ResOrder usando id_origin.",
    "expected": "Solo la línea OE_FLETE de propina de una factura de restaurante lleva el documento del mesero cuando el parámetro está activo y el documento existe; los demás casos preservan el valor actual.",
    "evidence": [],
    "affected_files": [],
    "diagnosis": null,
    "solution": null,
    "tests": [],
    "qa_cycles": [
      "QA-003"
    ],
    "terminal_reason": null,
    "related_ticket": null
  },
  {
    "id": "POINT-004",
    "title": "Reorganizar visualmente la configuración de Restaurante",
    "status": "closed",
    "severity": "normal",
    "actual": "Los tres selectores y todos los interruptores de Restaurante se presentan como una lista continua, lo que dificulta distinguir configuración de facturación, operación de cocina e integración.",
    "expected": "La pestaña Restaurante agrupa controles en bloques visuales escaneables, tomando como referencia la jerarquía y tarjetas de Facturación Electrónica sin alterar contratos ni valores.",
    "evidence": [],
    "affected_files": [],
    "diagnosis": null,
    "solution": null,
    "tests": [],
    "qa_cycles": [
      "QA-003"
    ],
    "terminal_reason": null,
    "related_ticket": null
  }
]
```

## Implementación

- Archivos cambiados: `BackEnd/ModAdmin/models/settings.py`, serializer y migración `0050`; el contrato Angular de compañía, la pantalla de usuario y la reorganización visual de Restaurante; `BackEnd/ModPos/views/utils.py` y el endpoint legado `views.py`; `LocalAgents/saiopensync/internal/worker/invoice.go`; y sus pruebas dirigidas.
- Decisiones técnicas: el nuevo flag persistente se llama `send_waiter_document_to_saiopen_tip`, con default `False`. La nube añade `TIP_MANDANTE` solo cuando la factura tiene origen `Restaurante`, el flag está activo y el documento del `ResOrder.id_admuser` no está vacío. El agente usa esa clave únicamente en la fila `OE_FLETE` de `OTROSCARGOS`; no la incluye en domicilio ni en mensajes sin extensión.
- Compatibilidad preservada: la migración es expand y el flag inicia apagado. El payload previo permanece válido porque el campo se omite, no se rellena con un valor nuevo. El agente omite MANDANTE cuando `TIP_MANDANTE` no existe o está vacío y conserva la transacción delete+insert y ACK posteriores al commit.
- POINT-004: la pestaña Restaurante usa ahora el patrón visual de Facturación Electrónica (`setting-card` y espaciado uniforme), sin modificar FormControls, IDs, payload ni reglas de habilitación. Tras la revisión visual del PO, Comandas y cocina ocupa la columna izquierda y Operación/Integración se apilan a la derecha; los checks de Operación se presentan verticalmente.
- Commits atribuibles al ticket:
  - `68b46077b6957c2432920fae1ca14da958e988b0` — agrega la configuración, el contrato compatible cloud-agente, la interfaz y pruebas dirigidas.
  - `95908e8335a1f3e14d00e7bdbc848b0ecbcec19d` — reorganiza visualmente la configuración de Restaurante en tarjetas.
  - `1224f2cf58c8e2942e20fa055de1b70ccbbe506d` — distribuye Comandas y cocina junto a Operación e Integración para aprovechar el ancho disponible.

## Pruebas

- Comandos para el PO:
  - `python3 manage.py test ModAdmin.tests.test_serializers_settings.AdmSettingSerializerTest ModPos.tests.test_waiter_tip_mandante`
  - `npm test -- --watch=false --browsers=ChromeHeadless --include='src/app/administration/company/adm-setting.component.spec.ts'`
  - `go test ./...`
- Directorio de ejecución: raíz del repositorio para Django/Angular y `LocalAgents/saiopensync` para el agente.
- Resultado esperado: las pruebas dirigidas y la compilación Angular pasan; el agente persiste MANDANTE únicamente en la variante habilitada de propina restaurante.
- Validaciones manuales: 1) crear/editar usuario y comprobar Documento/Activo en General y su ausencia en Cartera; 2) en Compañía > Restaurante activar y recargar el interruptor; 3) facturar una orden de restaurante con propina y mesero documentado y revisar que la fila de propina de `OE_FLETE` tenga MANDANTE; 4) repetir con flag apagado, mesero sin documento y domicilio para comprobar que MANDANTE conserva el valor previo.
- Requisitos de ambiente o datos: tenant de pruebas autorizado, una orden de restaurante con propina y mesero con/sin documento, configuración Firebird representativa con código de propina. Nunca usar `tcale` productivo como prueba.
- Resultado técnico local: `go test ./...` pasó en `LocalAgents/saiopensync`. El chequeo de sintaxis Python pasó. Las pruebas Django no pudieron iniciar porque el entorno local no tiene Django instalado; Angular no pudo iniciar porque falta `@angular-devkit/build-angular:karma`. No se considera aprobada ninguna de estas dos suites hasta ejecutarlas en un entorno con sus dependencias.
- Retest completado: el PO validó en `dev` la distribución final: Comandas y cocina a la izquierda; Operación del restaurante e Integración con SaiOpen apiladas a la derecha; y los checks de Operación en vertical. La disposición conserva el apilamiento responsive de Bootstrap para anchos menores a `lg`.
- Resultado comunicado por el PO: el 2026-09-08, tras la validación final en `dev`, el PO ordenó cerrar el ticket. Esta confirmación cubre los cuatro puntos funcionales; las suites Django y Angular quedan pendientes únicamente de un entorno con sus dependencias instaladas, sin bloquear la aceptación manual del PO.

## QA

```json
[
  {
    "id": "QA-001",
    "date": "2026-09-07",
    "build_reference": "commit:68b46077b6957c2432920fae1ca14da958e988b0",
    "environment": "dev: evaluación visual comunicada por el PO",
    "result": "pending",
    "findings": [],
    "correction": null,
    "po_confirmation": null
  },
  {
    "id": "QA-002",
    "date": "2026-09-07",
    "build_reference": null,
    "environment": null,
    "result": "changes_requested",
    "findings": [],
    "correction": null,
    "po_confirmation": "El PO solicita reorganizar visualmente la pestaña Restaurante."
  },
  {
    "id": "QA-003",
    "date": "2026-09-08",
    "build_reference": "commit:1224f2cf58c8e2942e20fa055de1b70ccbbe506d",
    "environment": "dev: validación funcional final confirmada por el PO",
    "result": "pending",
    "findings": [],
    "correction": null,
    "po_confirmation": null
  },
  {
    "id": "QA-004",
    "date": "2026-09-08",
    "build_reference": null,
    "environment": null,
    "result": "approved",
    "findings": [],
    "correction": null,
    "po_confirmation": "El PO confirmó la validación final en dev y ordenó cerrar el ticket."
  }
]
```

## Evidencia

```json
[]
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
    "po_confirmation": "El PO confirmó la validación final en dev y ordenó cerrar el ticket."
  },
  {
    "id": "RETEST-002",
    "date": "2026-09-08",
    "point_id": "POINT-002",
    "result": "approved",
    "evidence": [],
    "po_confirmation": "El PO confirmó la validación final en dev y ordenó cerrar el ticket."
  },
  {
    "id": "RETEST-003",
    "date": "2026-09-08",
    "point_id": "POINT-003",
    "result": "approved",
    "evidence": [],
    "po_confirmation": "El PO confirmó la validación final en dev y ordenó cerrar el ticket."
  },
  {
    "id": "RETEST-004",
    "date": "2026-09-08",
    "point_id": "POINT-004",
    "result": "approved",
    "evidence": [],
    "po_confirmation": "El PO confirmó la distribución final de dos columnas en dev y ordenó cerrar el ticket."
  }
]
```

## Cierre

<!-- Bloque JSON append-only de objetos con `kind: "ticket-close"`; el esquema completo está en ticket-schema.md. -->

- Cierre técnico y funcional: implementación compatible de la configuración y del contrato nube-agente, con la reorganización final de la interfaz Restaurante.
- Resultado comunicado por el PO: validación final confirmada en `dev` y orden explícita de cierre el 2026-09-08.
- QA aprobada o eximida (motivo y confirmación explícita del PO si aplica): aprobada en QA-004 con confirmación explícita del PO.
- Riesgo residual e impacto de release: pendiente de promoción; requiere migración compatible, canario y rollback del plan antes de producción.
- Texto visible al usuario cuando aplique: en Restaurante, la identificación del mesero se envía en la propina a SaiOpen solo cuando la compañía lo habilita.

```json
[
  {
    "kind": "ticket-close",
    "id": "CLOSE-001",
    "date": "2026-09-08",
    "technical_summary": "Migración compatible, flag de restaurante y extensión aditiva del payload TIP_MANDANTE; el agente limita MANDANTE a OE_FLETE de propina y preserva el comportamiento anterior cuando falta la condición.",
    "functional_summary": "Documento y Activo se presentan en General; Restaurante usa la distribución final en dos columnas y el documento del mesero se envía a MANDANTE solo bajo la configuración habilitada.",
    "qa_status": "approved",
    "qa_waiver_reason": null,
    "po_confirmation": "El PO confirmó la validación final en dev y ordenó cerrar el ticket.",
    "release_impact": "El cambio permanece en dev y unreleased; la promoción requiere el flujo de release, migración compatible y canario definidos en el plan."
  }
]
```

## Consumo de IA

<!-- Registros append-only `ai-usage`: consumo conocido o estimado con fuente y confianza. No inventar tokens ni coste; usar null cuando Codex no lo reporte. -->

```json
[]
```

## Release

- Estado de release: unreleased
- Versión objetivo: no definida
- Versión publicada: no aplica
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
    "action": "point-added",
    "actor": "cli",
    "details": "Se agregó POINT-002."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-09-07",
    "action": "point-added",
    "actor": "cli",
    "details": "Se agregó POINT-003."
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
    "details": "POINT-001: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-09-07",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-09-07",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-09-07",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-002: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-09-07",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-002: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-014",
    "date": "2026-09-07",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-002: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-015",
    "date": "2026-09-07",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-003: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-016",
    "date": "2026-09-07",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-003: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-017",
    "date": "2026-09-07",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-003: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-018",
    "date": "2026-09-07",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-019",
    "date": "2026-09-07",
    "action": "point-added",
    "actor": "cli",
    "details": "Se agregó POINT-004."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-020",
    "date": "2026-09-07",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-021",
    "date": "2026-09-07",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-022",
    "date": "2026-09-07",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado changes_requested."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-023",
    "date": "2026-09-07",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> changes_requested."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-024",
    "date": "2026-09-07",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: changes_requested -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-025",
    "date": "2026-09-07",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-004: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-026",
    "date": "2026-09-07",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-004: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-027",
    "date": "2026-09-07",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-004: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-028",
    "date": "2026-09-07",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-029",
    "date": "2026-09-08",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-030",
    "date": "2026-09-08",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-003."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-031",
    "date": "2026-09-08",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-001 para POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-032",
    "date": "2026-09-08",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-002 para POINT-002."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-033",
    "date": "2026-09-08",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-003 para POINT-003."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-034",
    "date": "2026-09-08",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-004 para POINT-004."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-035",
    "date": "2026-09-08",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: verified -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-036",
    "date": "2026-09-08",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-002: verified -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-037",
    "date": "2026-09-08",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-003: verified -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-038",
    "date": "2026-09-08",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-004: verified -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-039",
    "date": "2026-09-08",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-004 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-040",
    "date": "2026-09-08",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-041",
    "date": "2026-09-08",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-042",
    "date": "2026-09-08",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-043",
    "date": "2026-09-17",
    "action": "release-transition",
    "actor": "cli",
    "details": "Release: unreleased -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-044",
    "date": "2026-09-17",
    "action": "release-transition",
    "actor": "cli",
    "details": "Release: planned -> released."
  }
]
```
