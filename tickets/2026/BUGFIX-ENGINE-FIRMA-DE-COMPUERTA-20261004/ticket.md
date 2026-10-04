---
schema_version: 2
id: BUGFIX-ENGINE-FIRMA-DE-COMPUERTA-20261004
title: Registrar en el recibo y en los eventos la firma que autoriza avanzar con la compuerta en bloque
type: BUGFIX
module: ENGINE
workflow_status: intake
qa_status: pending
release_status: unreleased
user_visible: false
sync_impact: false
migration_impact: false
docker_impact: false
risk_level: normal
created: 2026-10-04
updated: 2026-10-04
related_ticket: null
target_release: null
released_in: null
---

# BUGFIX-ENGINE-FIRMA-DE-COMPUERTA-20261004

## Solicitud original

Revisión del 2026-10-04 sobre el trabajo del fin de semana del feature control-jornadas-ejecucion, con la orden del PO ese día: «sí dale» a registrar los puntos en los tickets. El motor rechaza anotar un punto en un ticket cerrado con QA aprobada, así que el hallazgo se registra como ticket. 14 tickets avanzaron de intake a analyzed, planned y approved con recibos de compuerta en block o review y sin ninguna aprobación registrada: ni evento de compuerta en el ticket ni campo humanDecision en el recibo. Van de una corrida en block (FEATURE-ENGINE-RUN-AUTONOMO-20260926, SECURITY-ENGINE-COLISIONES-ESCRITURA-20260926) a seis (FEATURE-ENGINE-MODELO-INTENTO-20261001, plan) y tres (FEATURE-ADAPTER-CAPACIDADES-20261001, FEATURE-ADAPTER-HERMES-LECTURA-20261001, FEATURE-MC-PANEL-HERRAMIENTAS-20261001, FEATURE-MC-CONTEXTO-UI-20261001, analysis). En el mismo rango hay 22 recibos que sí traen humanDecision, así que el registro tiene las dos formas conviviendo y por el ticket no se puede saber cuál se aplicó. EST-004 exige que la aprobación quede atribuida a la política humana y nunca al modelo, pero no dice dónde se escribe. Un informe que lea sólo los tickets no puede distinguir un ticket aprobado a mano de uno aprobado por el modelo.

### Supuestos y decisiones pendientes

<!-- Si el pedido nombra algo que el código no tiene —parámetro, permiso,
campo, bandera, columna, migración— y no lo especifica, listá cada elemento
con su pregunta antes de avanzar a análisis; el análisis no planifica sobre
la adivinanza. Si no hay ninguno, escribí «Ninguno» y seguí. -->
Ninguno.

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
    "date": "2026-10-04",
    "at": "2026-10-04T23:03:46.059Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  }
]
```
