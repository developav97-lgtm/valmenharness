---
schema_version: 2
id: FEATURE-CLI-PRUEBA-MENSAJES-20261010
title: Prueba de coherencia de los mensajes de bloqueo del CLI y el MCP
type: FEATURE
module: CLI
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

# FEATURE-CLI-PRUEBA-MENSAJES-20261010

## Solicitud original

Parte del sprint: El CLI declara sus comandos en una tabla y una prueba comprueba que todo mensaje de bloqueo nombra comandos, banderas y salidas reales.
- R-MSG-002: Una prueba DEBE comprobar que cada comando, bandera y herramienta MCP citados en un mensaje existen
- R-MSG-004: Un mensaje de bloqueo que nombra una salida DEBE nombrar una que resuelva el bloqueo
Depende de: FEATURE-CLI-TABLA-COMANDOS-20261010.
Viene de una feature descompuesta en sprints; su plan completo está en el tickets.yaml de la feature.

Comportamiento esperado: Una prueba DEBE comprobar que cada comando, bandera y herramienta MCP citados en un mensaje existen Un mensaje de bloqueo que nombra una salida DEBE nombrar una que resuelva el bloqueo
Comportamiento actual: la spec no lo declara; se establece en el análisis, leyendo el código.

### Fuera de alcance

Lo que el grafo asignó a otros tickets y este no hace:
- R-MSG-004: lo cubre FEATURE-BENCH-FRICCION-CORPUS-20261010 (Corpus inicial de rechazos y comparación de dos corridas)

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

- [ ] R-MSG-002: Una prueba DEBE comprobar que cada comando, bandera y herramienta MCP citados en un mensaje existen
- [ ] R-MSG-004: Un mensaje de bloqueo que nombra una salida DEBE nombrar una que resuelva el bloqueo (solo la parte de «Prueba de coherencia de los mensajes de bloqueo del CLI y el MCP»; el resto lo cubre FEATURE-BENCH-FRICCION-CORPUS-20261010)

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
    "at": "2026-10-10T21:47:31.688Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  }
]
```
