---
schema_version: 2
id: BUGFIX-SERVER-AGENTES-OBSOLETOS-Y-ESTADO-WORKTREE-20261009
title: El lector muestra agentes terminados como ejecutando y el estado del ticket solo cambia al integrar
type: BUGFIX
module: SERVER
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

# BUGFIX-SERVER-AGENTES-OBSOLETOS-Y-ESTADO-WORKTREE-20261009

## Solicitud original

Palabras del PO el 2026-10-09, parte de sus correcciones de los mundos (ticket hermano IMPROVEMENT-WEB-MUNDOS-CORRECCIONES-20261009), y el PO dijo «Recomiendo A, abre el ticket del servidor»: «el cambio de estados. Lo revisé con varios tickets al momento de su ejecución. El agente principal lanza el ticket a un subagente. El subagente hace todo el proceso de análisis. El principal corrigió el análisis, pasó al plan, se aprobó el plan y se pasó a implementar. Pero el ticket visualmente, ni dentro del ticket ni dentro de los mundos de los agentes, pasó por todos sus estados. Solamente se actualizó cuando pasó a pruebas. Los agentes que están haciendo las fases no están actualizando el estado instantáneamente; creo que si el ticket empezó el análisis debería pasar a la casilla de análisis, si ya pasó el análisis y se empezó el plan debería pasar al plan.» Y: «en los pantallazos se ven tres registros: uno de sesión principal, uno que dice ticket sesión principal y uno que es el que estaba trabajando en ese momento; solo faltaba un ticket por ejecutar, que era el agente que estaba ahí, pero seguían apareciendo tres agentes; es más, en este momento ese agente sigue apareciendo.» En la captura, la fila «FEATURE-SERVER-SESION-PRINCIPAL-20261008» aparece como «ejecutando» e «inferida», con herramienta Bash de «hace 3 h», aunque ese subagente ya terminó. Hipótesis a comprobar en el análisis, sin planificar sobre ella: los subagentes escriben el estado del ticket en su worktree y la vista lee el registro del checkout principal, que solo cambia al integrar.

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
    "at": "2026-10-09T03:33:55.297Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  }
]
```
