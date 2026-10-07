---
schema_version: 2
id: FEATURE-MC-VISTA-MODELOS-EFECTIVOS-20261007
title: Mostrar el modelo efectivo, su origen y el realmente usado por fase
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
created: 2026-10-07
updated: 2026-10-07
related_ticket: null
target_release: null
released_in: null
---

# FEATURE-MC-VISTA-MODELOS-EFECTIVOS-20261007

## Solicitud original

Parte del sprint: La persona elige perfiles y ve qué modelo corre cada fase, en Mission Control, el CLI y Hermes.
- R-PERF-005: El modelo efectivo de cada fase DEBE ser visible con su origen
- R-PERF-006: El modelo realmente usado DEBE quedar registrado por fase
Depende de: FEATURE-ENGINE-REGISTRO-MODELO-FASE-20261007, FEATURE-MC-PERFILES-MODELOS-20261007.
Viene de una feature descompuesta en sprints; su plan completo está en el tickets.yaml de la feature.

Comportamiento esperado: El modelo efectivo de cada fase DEBE ser visible con su origen El modelo realmente usado DEBE quedar registrado por fase
Comportamiento actual: la spec no lo declara; se establece en el análisis, leyendo el código.

### Fuera de alcance

Lo que el grafo asignó a otros tickets y este no hace:
- R-PERF-005: lo cubre FEATURE-ADAPTER-RESOLUCION-PERFIL-20261007 (Elegir el perfil por proyecto y por ejecutor, que el preset no lo sobrescriba y mostrar el modelo efectivo con su origen)
- R-PERF-005: lo cubre FEATURE-CLI-PERFILES-MODELOS-20261007 (Listar, mostrar y elegir perfiles por CLI y desde Hermes)
- R-PERF-006: lo cubre FEATURE-ENGINE-REGISTRO-MODELO-FASE-20261007 (Registrar el modelo realmente usado por fase, compararlo con el declarado y decir «sin reportar» el costo ausente)

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

- [ ] R-PERF-005: El modelo efectivo de cada fase DEBE ser visible con su origen (solo la parte de «Mostrar el modelo efectivo, su origen y el realmente usado por fase»; el resto lo cubre FEATURE-ADAPTER-RESOLUCION-PERFIL-20261007, FEATURE-CLI-PERFILES-MODELOS-20261007)
- [ ] R-PERF-006: El modelo realmente usado DEBE quedar registrado por fase (solo la parte de «Mostrar el modelo efectivo, su origen y el realmente usado por fase»; el resto lo cubre FEATURE-ENGINE-REGISTRO-MODELO-FASE-20261007)

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
    "at": "2026-10-07T18:03:48.666Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  }
]
```
