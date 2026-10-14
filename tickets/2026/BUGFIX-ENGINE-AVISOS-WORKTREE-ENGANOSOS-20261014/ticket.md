---
schema_version: 2
id: BUGFIX-ENGINE-AVISOS-WORKTREE-ENGANOSOS-20261014
title: Avisos engañosos de worktree, Recompilado fijo y quedó a medias falso en un create abortado
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
created: 2026-10-14
updated: 2026-10-14
related_ticket: null
target_release: null
released_in: null
---

# BUGFIX-ENGINE-AVISOS-WORKTREE-ENGANOSOS-20261014

## Solicitud original

Hallazgos que dejó fuera BUGFIX-ENGINE-RAMA-BASE-RESTOS-20261014 (H6 y D-003) y su agente al integrar; dos mensajes del CLI que dicen algo que no pasó. (1) packages/cli/src/worktree.ts:68 imprime siempre «Índice de tickets: <regenerado|sin cambios>. Recompilado.» tras journey worktree integrate, aunque el motor no haya recompilado: desde ese ticket create e integrate solo compilan si el proyecto tiene tsconfig.build.json o node_modules/@valmen (rama-base.ts, worktree-git.ts, worktree-integrar.ts) y si no, avisan y salen con 0, pero el texto sigue afirmando «Recompilado.». (2) Un journey worktree create abortado informa «quedó a medias: no se pudo borrar la rama» (packages/engine/src/worktree.ts:280 y :378) aunque no quedó nada: la función deshacer (worktree.ts:253-261) no resetea ramaCreada tras borrar la rama y el catch de worktree.ts:365 la vuelve a llamar, así que el segundo git branch -d falla porque la rama ya no existe y se reporta como residuo. Esperado: el mensaje de integrate dice si se recompiló o no según lo que de verdad ocurrió, y un create abortado que limpió todo no dice que quedó a medias; si de verdad quedó un residuo, el mensaje lo sigue diciendo. Sin cambiar códigos de salida ni el comportamiento de los proyectos sobre main. No se agrega ninguna clave nueva de configuración.

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
    "date": "2026-10-14",
    "at": "2026-10-14T20:01:22.498Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  }
]
```
