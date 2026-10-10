---
schema_version: 2
id: FEATURE-GATE-CODE-REVIEW-20261010
title: Compuerta code-review con profundidad por riesgo y una corrección
type: FEATURE
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

# FEATURE-GATE-CODE-REVIEW-20261010

## Solicitud original

Parte del sprint: La revisión del diff es una compuerta con riesgo calculado en código y recibos atados al árbol entregado.
- R-REV-003: La revisión DEBE ajustar su profundidad al riesgo
- R-REV-004: El recibo de la revisión DEBE quedar atado al árbol revisado y caducar si cambia
- R-REV-005: Un hallazgo severo DEBE admitir una sola corrección acotada antes de escalar
Depende de: FEATURE-GATE-ARBOL-QA-RECIBO-20261010, FEATURE-ENGINE-RIESGO-REVISION-20261010.
Viene de una feature descompuesta en sprints; su plan completo está en el tickets.yaml de la feature.

Comportamiento esperado: La revisión DEBE ajustar su profundidad al riesgo El recibo de la revisión DEBE quedar atado al árbol revisado y caducar si cambia Un hallazgo severo DEBE admitir una sola corrección acotada antes de escalar
Comportamiento actual: la spec no lo declara; se establece en el análisis, leyendo el código.

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

- [ ] R-REV-003: La revisión DEBE ajustar su profundidad al riesgo
- [ ] R-REV-004: El recibo de la revisión DEBE quedar atado al árbol revisado y caducar si cambia
- [ ] R-REV-005: Un hallazgo severo DEBE admitir una sola corrección acotada antes de escalar

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
    "at": "2026-10-10T21:47:32.618Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  }
]
```
