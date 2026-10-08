---
schema_version: 2
id: FEATURE-ENGINE-INTEGRACION-RAMA-20261008
title: Integrar la rama de un worktree al checkout principal uniendo los registros append-only
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
created: 2026-10-08
updated: 2026-10-08
related_ticket: null
target_release: null
released_in: null
---

# FEATURE-ENGINE-INTEGRACION-RAMA-20261008

## Solicitud original

Contexto: el PO decidió partir FEATURE-ENGINE-INTEGRACION-WORKTREE-20261008 (40 criterios) en dos tickets. Este es el de integrar; el otro queda con crear y quitar el worktree. Corrida orquestada: docs/propuesta-corrida-orquestada.md. Este ticket: `valmen journey worktree integrate --id <ID>` integra la rama del worktree de un ticket al checkout principal (main) con avance directo si se puede o merge --no-ff si no, con comprobación previa por merge-tree; une los registros append-only por eventId renumerando cursores (hoy esa unión no existe en integration-commit.ts y se hizo a mano), regenera tickets/index.md con valmen index, recompila (tsc --build y copy-web) y avisa de los conflictos de código sin resolverlos. Se niega si el checkout principal está sucio; nunca hace push ni fuerza. El plan ya escrito en FEATURE-ENGINE-INTEGRACION-WORKTREE-20261008 (pasos de integrarWorktree y worktree-registros.ts) es el punto de partida.

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
    "at": "2026-10-08T14:57:57.296Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  }
]
```
