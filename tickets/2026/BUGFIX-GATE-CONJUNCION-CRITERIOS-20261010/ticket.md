---
schema_version: 2
id: BUGFIX-GATE-CONJUNCION-CRITERIOS-20261010
title: Una conjunción dentro de un nombre no hace compuesto a un criterio
type: BUGFIX
module: GATE
workflow_status: intake
qa_status: pending
release_status: unreleased
user_visible: false
sync_impact: false
migration_impact: false
docker_impact: false
risk_level: normal
created: 2026-10-10
updated: 2026-10-10
related_ticket: null
target_release: null
released_in: null
---

# BUGFIX-GATE-CONJUNCION-CRITERIOS-20261010

## Solicitud original

packages/gate/src/criteria.ts:47 define CONJUNCIONES = /(?:^|\s)(?:así como|y|e|o|u)(?=\s)/giu y cuenta cada coincidencia como una afirmación más. Un criterio manual con una «y» dentro de un nombre o de una condición, p. ej. «Con OpenCode 2.0.16 y --auto» o «quedan idénticas, en su orden original», se lee como compuesto y vota 0: la compuerta de plan de SECURITY-ADAPTER-DENEGADOS-CODEX-OPENCODE-20261010 dio BLOCK dos veces (recibos plan-1 y plan-2) hasta reescribirlo sin la «y», y el motor lo calificó como hueco del plan. Se pide reproducir primero con los recibos plan-1 y plan-2 de ese ticket (en .valmen/receipts/) y con el texto exacto de C13 y C14, y luego que la detección distinga una conjunción entre dos afirmaciones de una «y» dentro de un sintagma, con pruebas que fallen sin el arreglo: los dos criterios reales (deben pasar a atómicos), un criterio verdaderamente compuesto («El sistema valida el monto y envía el aviso», debe seguir contando 2) y el caso de «o» y «e». Decisión del PO del 2026-10-10: «BUGFIX de la conjunción «y» en criteria.ts». Es modo directo si el cambio queda chico (EST-008), con las dos reglas.

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
    "date": "2026-10-10",
    "at": "2026-10-11T04:20:49.540Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  }
]
```
