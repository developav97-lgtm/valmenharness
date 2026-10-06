---
schema_version: 2
id: FEATURE-MC-FIRMA-DE-BLOQUEO-20261005
title: Mission Control ofrece firmar un recibo en block con la frase literal de quien autoriza
type: FEATURE
module: MC
workflow_status: intake
qa_status: pending
release_status: unreleased
user_visible: false
sync_impact: false
migration_impact: false
docker_impact: false
risk_level: normal
created: 2026-10-05
updated: 2026-10-05
related_ticket: null
target_release: null
released_in: null
---

# FEATURE-MC-FIRMA-DE-BLOQUEO-20261005

## Solicitud original

Solicitud del PO el 2026-10-05, tras cerrar BUGFIX-ENGINE-FIRMA-DE-COMPUERTA-20261004: «sigamos tu recomendacion pero no podemos olvidar la pantalla». Contexto: ese ticket hizo que `transition()` rechace entrar a `planned` o `approved` con la compuerta en `block` o `review` sin decisión humana, y que un recibo `block` admita la decisión humana con la frase literal (`withHumanDecision`, `packages/gate/src/receipt.ts`). Pero la pantalla de Mission Control sigue ofreciendo decidir solo sobre un recibo escalado: `bloqueDecision` en `packages/server/web/index.html` (alrededor de las líneas 3735 a 3860) muestra «Aprobar» y «Rechazar» únicamente cuando `recibo.escalatedTo === "human"`, que solo ocurre con `review`. Un bloqueo que la persona quiere autorizar seguir —el caso de AP-006 y de la escalada tras dos bloqueos de AGENTS.md— hoy solo se puede firmar por el CLI. La pantalla tiene que poder hacerlo, con el mismo endpoint (`POST /api/tickets/:id/gates/:receipt/decision`, `packages/server/src/server.ts:1343`), que ya pasa por `recordHumanDecision`. El campo de texto de la pantalla hoy se llama «Motivo de la decisión» y es opcional; sobre un `block` la frase literal es obligatoria en el motor.

### Supuestos y decisiones pendientes

<!-- Si el pedido nombra algo que el código no tiene —parámetro, permiso,
campo, bandera, columna, migración— y no lo especifica, listá cada elemento
con su pregunta antes de avanzar a análisis; el análisis no planifica sobre
la adivinanza. Si no hay ninguno, escribí «Ninguno» y seguí. -->
- ¿La pantalla permite firmar un `block` obsoleto, es decir, con el ticket ya cambiado desde que se emitió el recibo? El motor sí lo permite a propósito: tras dos bloqueos, lo normal es un artefacto ya corregido que la persona autoriza sin una tercera corrida (BUGFIX-ENGINE-FIRMA-DE-COMPUERTA-20261004). Pero la pantalla hoy dice, ante un recibo obsoleto, «hay que volver a evaluar». Recomendación del que abrió el ticket: permitirlo, con el aviso de obsoleto visible junto al botón.
- ¿Se ofrece «Rechazar» sobre un `block`? El motor lo admite, pero rechazar un bloqueo no cambia nada. Recomendación: no; sobre un `block` solo se ofrece «Autorizar seguir pese al bloqueo», con la frase obligatoria.
- ¿Se ofrece sobre el `block` de `qa-mechanical`? El motor no lo admite (un comando que falló es un hecho). Recomendación: no se ofrece, y la pantalla dice por qué.
- Relación con la feature `autonomia-confiable`: **resuelto por el PO el 2026-10-05.** Se anexó al grafo en el sprint S3, sin dependencias, que fue la recomendación de quien abrió el ticket; frase literal del PO: «si necesitamos meterlo al feture, en que sprint, ahi si el que me recomiendas».

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

- Gate de plan y aprobación:
- Pasos ordenados:
  <!-- Cada paso nombra archivo, símbolo o comando. Un paso que no dice dónde ni
       con qué se toca no se puede ejecutar ni revisar, y la compuerta lo lee así. -->
  1.
  2.
- Rollback:

## Criterios de aceptación

<!-- Una afirmación verificable por criterio. Una frase con «y» son dos criterios:
     cada uno se despliega como una proposición propia, y una que agrupa varias
     afirmaciones cae en banda de revisión aunque el plan la cubra entera. -->
- [ ]

## Puntos

```json
[]
```

## Implementación

Pendiente.

## Pruebas

Pendiente de ejecución.

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

```json
[]
```

## Consumo de IA

```json
[]
```

## Release

Sin publicar todavía.

## Eventos

```json
[
  {
    "kind": "ticket-event",
    "id": "EVENT-001",
    "date": "2026-10-05",
    "at": "2026-10-06T03:08:50.746Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  }
]
```
