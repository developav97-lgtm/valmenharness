---
schema_version: 2
id: FEATURE-ENGINE-ELEGIBILIDAD-APROBACION-20261007
title: Decidir en código la elegibilidad con los tipos declarados (incluye SYNC, INTEGRATION y AGENT), impactos explícitos y sin SECURITY, block ni despliegue
type: FEATURE
module: ENGINE
workflow_status: intake
qa_status: pending
release_status: unreleased
user_visible: false
sync_impact: false
migration_impact: false
docker_impact: false
risk_level: normal
created: 2026-10-07
updated: 2026-10-07
related_ticket: null
target_release: null
released_in: null
---

# FEATURE-ENGINE-ELEGIBILIDAD-APROBACION-20261007

## Solicitud original

Parte del sprint: Un ticket elegible con la compuerta en approve se aprueba solo, atribuido a la autorización, con elegibilidad decidida en código y visible.
- R-APRO-004: Un block NO DEBE aprobarse sin una persona
- R-APRO-005: Los tipos y los impactos admitidos DEBEN ser los que la persona declaró
Depende de: SECURITY-ENGINE-AUTORIZACION-APROBACION-20261007.
Viene de una feature descompuesta en sprints; su plan completo está en el tickets.yaml de la feature.

Comportamiento esperado: Un block NO DEBE aprobarse sin una persona Los tipos y los impactos admitidos DEBEN ser los que la persona declaró
Comportamiento actual: la spec no lo declara; se establece en el análisis, leyendo el código.

### Fuera de alcance

Lo que el grafo asignó a otros tickets y este no hace:
- R-APRO-004: lo cubre SECURITY-ENGINE-APROBACION-POR-REVISOR-20261007 (Guardar la decisión del revisor como suya, rechazar el mismo modelo y reservar los block a una persona)

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

- [ ] R-APRO-004: Un block NO DEBE aprobarse sin una persona (solo la parte de «Decidir en código la elegibilidad con los tipos declarados (incluye SYNC, INTEGRATION y AGENT), impactos explícitos y sin SECURITY, block ni despliegue»; el resto lo cubre SECURITY-ENGINE-APROBACION-POR-REVISOR-20261007)
- [ ] R-APRO-005: Los tipos y los impactos admitidos DEBEN ser los que la persona declaró

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
    "date": "2026-10-07",
    "at": "2026-10-07T18:03:56.126Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  }
]
```
