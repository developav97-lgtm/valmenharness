---
schema_version: 2
id: BUGFIX-ENGINE-DIFF-RUTAS-RENOMBRE-20261010
title: Las rutas de un diff pierden el origen de un renombre, los borrados y las rutas no ASCII
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
created: 2026-10-10
updated: 2026-10-10
related_ticket: null
target_release: null
released_in: null
---

# BUGFIX-ENGINE-DIFF-RUTAS-RENOMBRE-20261010

## Solicitud original

Para saber qué archivos toca un diff, el motor usa `git diff --name-only` y no maneja tres casos: (1) un renombre, del que solo aparece la ruta nueva y se pierde la vieja (packages/engine/src/qa-eligibility.ts:45 y packages/engine/src/qa-agent.ts:101); (2) las rutas con caracteres no ASCII, que git escribe entre comillas y con escapes octales; (3) los borrados, que packages/engine/src/diff.ts:97 omite. Efecto posible: un archivo movido desde una ruta que la QA por agente prohíbe (CI, migraciones, .valmen/) podría no frenar su elegibilidad, y una ruta no ASCII no coincidiría con ninguna categoría. Lo halló el análisis de FEATURE-ENGINE-RIESGO-REVISION-20261010 el 2026-10-10 y el PO pidió registrarlo («Registrar un BUGFIX ahora»). Se reproduce primero con un renombre real, un borrado y una ruta no ASCII en un repositorio git temporal, antes de arreglarlo.

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
    "at": "2026-10-11T00:17:22.231Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  }
]
```
