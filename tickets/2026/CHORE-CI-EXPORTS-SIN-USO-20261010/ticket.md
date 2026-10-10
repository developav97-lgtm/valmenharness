---
schema_version: 2
id: CHORE-CI-EXPORTS-SIN-USO-20261010
title: Guarda de exportaciones sin uso con knip y línea base decreciente
type: CHORE
module: CI
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

# CHORE-CI-EXPORTS-SIN-USO-20261010

## Solicitud original

Parte del sprint: El CI rechaza exportaciones nuevas sin consumidor, con línea base que solo se achica y paso local.
- R-MUE-001: El CI DEBE rechazar una exportación nueva que nada consume
- R-MUE-002: La línea base DEBE poder solo achicarse
- R-MUE-003: El paso DEBE correr también en local con un comando del package.json
Viene de una feature descompuesta en sprints; su plan completo está en el tickets.yaml de la feature.

Comportamiento esperado: El CI DEBE rechazar una exportación nueva que nada consume La línea base DEBE poder solo achicarse El paso DEBE correr también en local con un comando del package.json
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

- [ ] R-MUE-001: El CI DEBE rechazar una exportación nueva que nada consume
- [ ] R-MUE-002: La línea base DEBE poder solo achicarse
- [ ] R-MUE-003: El paso DEBE correr también en local con un comando del package.json

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
    "at": "2026-10-10T21:47:31.850Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  }
]
```
