---
schema_version: 1
id: INTEGRATION-RELEASE-6-2-4-20260904
title: Preparar release productiva 6.2.4
type: INTEGRATION
module: RELEASE
workflow_status: closed
qa_status: approved
release_status: released
user_visible: true
sync_impact: true
migration_impact: true
docker_impact: true
risk_level: high
created: 2026-09-04
updated: 2026-09-04
related_ticket: null
target_release: 6.2.4
released_in: 6.2.4
---

# INTEGRATION-RELEASE-6-2-4-20260904

## Solicitud original

Preparar la promoción de dev a production para v6.2.4, con tickets seleccionados, novedades funcionales, dry-run, canario, observabilidad y rollback. No crear PR, tag ni despliegue sin aprobación final explícita del PO.

## Descripción funcional

- Alcance: promover todo el contenido actualmente en `dev` a `production` como
  `v6.2.4`, incluidas novedades públicas seleccionadas para clientes.
- Usuario o rol afectado: todos los tenants de producción y clientes con
  agentes locales u OfflineSync cuando apliquen.
- Comportamiento actual: producción permanece en `v6.2.3`; `dev` contiene 176
  commits posteriores y cambios transversales.
- Comportamiento esperado: un PR controlado y un tag anotado inmutable liberan
  el commit aprobado con evidencia, canario y rollback conocidos.

## Diagnóstico

- Archivos y flujo investigados: diferencia `production...dev`, tickets,
  ambientes Angular, Dockerfiles, Compose, LocalAgents y documentación AWS.
- Causa raíz o hipótesis: la acumulación desde `v6.2.3` mezcla frontend,
  backend, migraciones, OfflineSync, LocalAgents, Docker e integración DIAN.
- Riesgos y compatibilidad: alto riesgo operativo por alcance transversal;
  requieren pruebas por componente, orden explícito y rollback sin force-push.
- Impactos de sync, migración, Docker o despliegue: aplican los cuatro; no se
  asume estado de AWS, imágenes ni hosts sin evidencia actual.
- Dry-run local del 2026-09-04: `dev` y `origin/dev` están en
  `03aa5a19`; `production` y `origin/production` están en `8209a81e`
  (`v6.2.3`). La diferencia contiene 176 commits y 648 archivos
  (41.093 inserciones, 15.775 eliminaciones); `git diff --check` no reportó
  errores y los 30 tickets canónicos validaron correctamente.
- Versionado: `dev` declara `6.2.4`, `production` declara `6.2.3` y el tag
  `v6.2.4` no existe. Las notas públicas de `6.2.4` ya están incluidas en el
  frontend, con 13 novedades seleccionadas para el cliente.
- Estado remoto consultado en solo lectura: los pipelines backend, frontend y
  services reportan su última ejecución exitosa. Los servicios productivos
  backend y services están activos, con 2 tareas deseadas y 2 ejecutándose,
  sin tareas pendientes y despliegue completado. El pipeline frontend tiene
  como última ejecución registrada el 2026-05-07; debe vigilarse de forma
  explícita durante el canario porque no está alineado temporalmente con el
  backend/services publicados como `v6.2.3` el 2026-08-20.
- Respaldo vigente: RDS tiene respaldo automático con retención de siete días
  y punto restaurable reciente, verificado el 2026-09-04 en modo lectura. No
  se ha realizado todavía una restauración de prueba ni se ha creado snapshot
  manual específico para esta release.
- Canario acordado: tenant `lamejor`, validado por el PO después de la
  publicación. Las credenciales de acceso no se registran en este ticket ni
  se requieren para preparar el despliegue.
- Clientes locales: no existe ningún cliente operativo aún con OfflineSync o
  Docker local; no se requiere coordinación ni validación de cliente local
  como condición de esta release.
- Migraciones: el PO confirmó que ya fueron aplicadas y validadas en
  producción para los tenants correspondientes. El PR debe conservar el mismo
  conjunto de migraciones; no se programan ejecuciones manuales adicionales
  fuera del procedimiento controlado de la release.
- Publicación ejecutada: el PR #39 se fusionó en `production` como
  `e664f9b9c3aaf74e079f76fbe53f544f7a5fc4d6`. El tag anotado e inmutable
  `v6.2.4` apunta a ese commit y fue publicado tras la aprobación final literal
  del PO.
- Resultado de infraestructura: pipelines de backend, services y la etapa
  `DeployFrontend` finalizaron correctamente. ECS reporta backend y services
  estables, con 2/2 tareas ejecutándose y sin tareas pendientes. Falta el
  canario funcional del tenant `lamejor` antes de declarar la release completa.

## Plan

- Gate de plan y aprobación del PO: aprobado explícitamente por el PO el
  2026-09-04 para promover todo `dev` como `v6.2.4` con dry-run, canario,
  backup y rollback definidos.
- Pasos ordenados:
  1. Congelar el alcance en el commit de `dev`, validar todos los tickets,
     migraciones, Docker/Compose, clientes locales y notas `6.2.4`.
  2. Ejecutar el PR `dev` a `production` solo tras revisión humana y verificar
     el commit fusionado, versión y ausencia de tag `v6.2.4`.
  3. Antes del tag, confirmar backup verificable de base de datos, orden de
     migraciones, canario por tenant y señales de salud de backend, frontend,
     WebSocket, OfflineSync y agentes locales.
  4. Tras `APROBAR DEPLOY v6.2.4`, crear tag anotado sobre `production`,
     monitorear pipelines y validar canario; detener ante fallos.
- Rollback, backup, canario u orden de despliegue cuando aplique: backup y
  restauración verificados antes de migraciones; rollback por reversión o nuevo
  tag sobre commit conocido, nunca force-push ni reutilización de tag.
- Evidencia pendiente antes de solicitar la aprobación final: responsable y
  ventana de despliegue. El respaldo automático restaurable ya fue verificado
  en AWS y el PO confirmó las migraciones en producción. Se recomienda un
  snapshot manual previo al tag por el número y naturaleza de las migraciones.

## Criterios de aceptación

- [ ] El PR contiene el commit exacto revisado de `dev` y versión 6.2.4.
- [ ] Existe evidencia de backup, migraciones, canario, observabilidad y
  rollback antes del tag.
- [ ] El tag anotado `v6.2.4` se crea solo tras aprobación final literal del PO.

## Puntos

<!-- Crear POINT-NNN es append-only: no eliminar, reordenar ni reutilizar. Las transiciones solo las realiza el CLI, actualizan el punto actual y anexan un ticket-event. -->

```json
[]
```

## Implementación

- Archivos cambiados: resolución de merge preparada para
  `FrontEnd/src/environments/environment.ts` y
  `FrontEnd/src/environments/environment.prod.ts`; la fusión automática también
  incorpora en el commit de merge el estado ya presente en `production` de
  `docs/aws/manual-despliegue.md`.
- Decisiones técnicas: se preservó la configuración de cada ambiente y la
  versión `6.2.4` en ambos archivos de environment. No hay marcadores de
  conflicto ni entradas sin resolver en el índice Git.
- Compatibilidad preservada:
- Commits atribuibles al ticket:
  - `754ce561e78360f0dfd1f6a9b358e0affd6d6882` — fusiona `production` en
    `dev`, resuelve los environments para conservar `6.2.4` y deja el PR
    preparado para revisión.

## Pruebas

- Comandos para el PO: `npm run build`.
- Directorio de ejecución: `FrontEnd/`.
- Resultado esperado: compilación Angular exitosa y salida generada sin
  errores de TypeScript o de environment.
- Validaciones manuales:
- Requisitos de ambiente o datos: dependencias de `FrontEnd` ya instaladas.
- Resultado comunicado por el PO: `npm run build` ejecutado correctamente el
  2026-09-04 tras la resolución de conflictos. Canario funcional realizado en
  `lamejor` tras publicar `v6.2.4`: el PO confirmó que quedó correcto.

## QA

```json
[
  {
    "id": "QA-001",
    "date": "2026-09-04",
    "build_reference": "commit:e664f9b9c3aaf74e079f76fbe53f544f7a5fc4d6",
    "environment": "Producción - tenant lamejor",
    "result": "pending",
    "findings": [],
    "correction": null,
    "po_confirmation": null
  },
  {
    "id": "QA-002",
    "date": "2026-09-04",
    "build_reference": null,
    "environment": null,
    "result": "approved",
    "findings": [],
    "correction": null,
    "po_confirmation": "El PO confirmó que el canario en lamejor quedó correcto."
  }
]
```

## Evidencia

```json
[]
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
    "date": "2026-09-04",
    "technical_summary": "Release v6.2.4 publicada mediante PR #39, tag anotado sobre e664f9b9 y pipelines backend, services y frontend exitosas; ECS estable en 2/2.",
    "functional_summary": "El PO validó el canario del tenant lamejor y confirmó que la aplicación quedó correcta.",
    "qa_status": "approved",
    "qa_waiver_reason": null,
    "po_confirmation": "El PO confirmó que el canario en lamejor quedó correcto.",
    "release_impact": "Publicada en v6.2.4; no quedan acciones de despliegue pendientes para este ticket."
  }
]
```

## Consumo de IA

<!-- Registros append-only `ai-usage`: consumo conocido o estimado con fuente y confianza. No inventar tokens ni coste; usar null cuando Codex no lo reporte. -->

```json
[]
```

## Release

- Estado de release: canario funcional aprobado por el PO; publicación
  completada, pendiente de registro de cierre.
- Versión objetivo: 6.2.4.
- Versión publicada: 6.2.4 (`v6.2.4` sobre
  `e664f9b9c3aaf74e079f76fbe53f544f7a5fc4d6`).
- Tickets relacionados: PR [#39](https://github.com/developav97-lgtm/SaiOpenCloud/pull/39),
  fusión en `production` (`e664f9b9c3aaf74e079f76fbe53f544f7a5fc4d6`) y
  tag `v6.2.4`.
- Ventana prevista: 2026-09-04 a las 2:00 p. m. (America/Bogota), comunicada
  por el PO a los clientes. Antes del tag se refrescará el estado del PR,
  ramas, pipelines y respaldos; no se inicia ningún despliegue por esta nota.

## Eventos

<!-- Bloque JSON append-only final de objetos con `kind: "ticket-event"`; el CLI agrega uno por cada mutación propia. -->

```json
[
  {
    "kind": "ticket-event",
    "id": "EVENT-001",
    "date": "2026-09-04",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-09-04",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-09-04",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-09-04",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-09-04",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-09-04",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-09-04",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-09-04",
    "action": "release-transition",
    "actor": "cli",
    "details": "Release: unreleased -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-09-04",
    "action": "release-transition",
    "actor": "cli",
    "details": "Release: planned -> released."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-09-04",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-09-04",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-09-04",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-09-04",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-014",
    "date": "2026-09-04",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  }
]
```
