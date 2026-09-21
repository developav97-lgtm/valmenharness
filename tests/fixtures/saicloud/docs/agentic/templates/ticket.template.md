---
schema_version: 1
id: TYPE-MODULE-DESCRIPTION-YYYYMMDD
title: Título funcional breve
type: BUGFIX
module: MODULE
workflow_status: intake
qa_status: pending
release_status: unreleased
user_visible: false
sync_impact: false
migration_impact: false
docker_impact: false
risk_level: normal
created: YYYY-MM-DD
updated: YYYY-MM-DD
related_ticket: null
target_release: null
released_in: null
---

# TYPE-MODULE-DESCRIPTION-YYYYMMDD

## Solicitud original

<!-- Preservar literalmente la solicitud del PO. -->

## Descripción funcional

- Alcance:
- Usuario o rol afectado:
- Comportamiento actual:
- Comportamiento esperado:

## Diagnóstico

- Archivos y flujo investigados:
- Causa raíz o hipótesis:
- Riesgos y compatibilidad:
- Impactos de sync, migración, Docker o despliegue:

## Plan

- Gate de plan y aprobación del PO:
- Pasos ordenados:
- Rollback, backup, canario u orden de despliegue cuando aplique:

## Criterios de aceptación

- [ ] Criterio verificable.

## Puntos

<!-- Crear POINT-NNN es append-only: no eliminar, reordenar ni reutilizar. Las transiciones solo las realiza el CLI, actualizan el punto actual y anexan un ticket-event. -->

```json
[]
```

## Implementación

- Archivos cambiados:
- Decisiones técnicas:
- Compatibilidad preservada:
- Commits atribuibles al ticket:
  - `SHA-40` — propósito del commit funcional o documental.

## Pruebas

- Comandos para el PO:
- Directorio de ejecución:
- Resultado esperado:
- Validaciones manuales:
- Requisitos de ambiente o datos:
- Resultado comunicado por el PO:

## QA

```json
[]
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
[]
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
[]
```
