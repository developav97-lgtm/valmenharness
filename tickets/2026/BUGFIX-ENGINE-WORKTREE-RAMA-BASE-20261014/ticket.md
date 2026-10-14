---
schema_version: 2
id: BUGFIX-ENGINE-WORKTREE-RAMA-BASE-20261014
title: Worktrees y hash de QA fallan en proyectos que no trabajan sobre main
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
created: 2026-10-13
updated: 2026-10-13
related_ticket: null
target_release: null
released_in: null
---

# BUGFIX-ENGINE-WORKTREE-RAMA-BASE-20261014

## Solicitud original

Visto en la corrida orquestada de doctor-facturas en SaiOpenCloud (2026-10-13/14), que trabaja sobre dev. (1) packages/engine/dist/worktree.js:128,198,275-282 y worktree-integrar.js (RAMA_BASE) fijan main: journey worktree create exige el ticket en main y crea la rama desde main, e integrate y remove solo operan contra main; en SaiOpenCloud main está desactualizado y hubo que crear worktrees con git worktree add desde dev e integrar con merge manual. La rama base debería salir de la configuración del proyecto. (2) references.js modifiedFunctionalFiles excluye rutas que empiezan por tickets/ pero no el registro real docs/tickets/: con un ticket con puntos sin affected_files, close y qa-start --build-reference worktree fallan con «affected_files no puede incluir el historial de tickets» porque el propio ticket.md modificado entra al diff. (3) El comentario de qa-start en append.js dice que sin evidencia de worktree la referencia libre sigue funcionando, pero la validación solo acepta commit:<sha40> o worktree:sha256; con un ticket ya commiteado y sin puntos con archivos no hay forma de abrir el ciclo QA sin calcular el hash a mano.

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
- Tamaño previsto:
  <!-- «N líneas» de producción y pruebas, más el número de criterios, por ejemplo
       «unas 360 líneas (90 de producción, 270 de pruebas), 19 criterios». Se estima contra
       `delivery-budget` de `.valmen/config.yaml`. -->
- Si excede el tope:
  <!-- Con más líneas que `delivery-budget`: «se parte en <tickets dependientes>» o
       «sigue: <motivo>». Sin exceder, «no excede el tope». Lo decide quien planifica, sin
       esperar a una persona. Se parte solo en tickets que lleven cada uno su código y sus
       pruebas; si no hay un corte así, sigue. -->
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
    "date": "2026-10-13",
    "at": "2026-10-14T02:41:49.715Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  }
]
```
