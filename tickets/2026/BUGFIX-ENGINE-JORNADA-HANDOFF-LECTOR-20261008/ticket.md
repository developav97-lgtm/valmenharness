---
schema_version: 2
id: BUGFIX-ENGINE-JORNADA-HANDOFF-LECTOR-20261008
title: El parte reconoce el contrato de pruebas en lista numerada y no lista como sin entregar a los cerrados
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
created: 2026-10-08
updated: 2026-10-08
related_ticket: null
target_release: null
released_in: null
---

# BUGFIX-ENGINE-JORNADA-HANDOFF-LECTOR-20261008

## Solicitud original

Al correr `valmen journey handoff --id JOR-20261008 --project valmen-harness` con el parte real de la corrida de prueba del 2026-10-08, dos de siete tickets (FEATURE-ENGINE-VISIBILIDAD-APROBACIONES-20261007 y FEATURE-MC-VISTA-MODELOS-EFECTIVOS-20261007) salieron como «sin contrato de pruebas: el ticket no trae comandos» aunque su sección `## Pruebas` sí los trae, escritos como lista numerada (`1. \`npx vitest run …\` — esperado: …`). Además la sección «SIN ENTREGAR TODAVÍA» lista tickets que ya están cerrados (por ejemplo SECURITY-ENGINE-APROBACION-POR-AUTORIZACION-20261007 [closed]). Esperado: el parte extrae el comando y el resultado esperado también de la lista numerada con raya, y «sin entregar» solo lista tickets que no llegaron a awaiting_user_tests ni a un estado posterior. Origen: criterio C29 de FEATURE-ENGINE-JORNADA-HANDOFF-20261008, que quedó abierto por este defecto.

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

- Causa comprobada (con `ruta:línea`):
- Hipótesis pendientes:
- Consumidores afectados:
- Archivos y flujo investigados:
- Riesgos y compatibilidad:
- Impactos de sync, migración, Docker o despliegue:

## Plan

- Gate de plan y aprobación:
- Pasos ordenados:
  <!-- Cada paso nombra archivo, símbolo o comando, y los criterios que cubre, por ejemplo
       «(C1, C2)». Un paso que no dice dónde ni con qué se toca no se puede ejecutar ni
       revisar, y la compuerta lo lee así. -->
  1.
  2.
- Impactos declarados:
  <!-- Una línea por cada impacto que el ticket declara, con las palabras de su proposición:
       sincronización (datos ya sincronizados y clientes que todavía no se actualizaron),
       migración (orden de aplicación y reversión) o contenedores (imagen y publicación). -->
- Rollback (obligatorio):

<!-- Los criterios de la sección siguiente se numeran C1…Cn, con una afirmación verificable por criterio
     —una frase con «y» son dos criterios—, y cada uno lleva debajo su anotación de
     verificación: un comentario HTML que dice «test:» y el comando, o «verify: manual». La
     sección no lleva comentarios dentro: un comentario con anotación se leería como la de un
     criterio. Ejemplo en la skill planificacion. -->
## Criterios de aceptación

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
    "date": "2026-10-08",
    "at": "2026-10-08T22:44:34.685Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  }
]
```
