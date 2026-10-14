---
schema_version: 2
id: BUGFIX-ENGINE-RAMA-BASE-RESTOS-20261014
title: Restos de main fijo y de la receta de compilación del harness en proyectos que trabajan sobre dev
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

# BUGFIX-ENGINE-RAMA-BASE-RESTOS-20261014

## Solicitud original

Continuación de BUGFIX-ENGINE-WORKTREE-RAMA-BASE-20261014 (cerrado; D-002 dejó fuera la jornada autónoma). Ese ticket hizo que worktree create, integrate y remove y el hash de QA lean la rama base de execution.base-branch en .valmen/config.yaml (ramaBaseDelProyecto, packages/engine/src/rama-base.ts), con main por defecto. Quedan sitios con main fijo y una receta de compilación del propio harness que fallan en un proyecto que trabaja sobre dev, como SaiOpenCloud: (1) packages/engine/src/integration-commit.ts:165 define RAMA_BASE = "main" y lo usan :188, :197, :201 y :204 para dejar la rama de trabajo de la jornada autónoma al día antes de despachar; (2) packages/engine/src/limpieza.ts:182 exige que el checkout principal esté en main y :213 comprueba con merge-base --is-ancestor contra main antes de limpiar un worktree ya integrado; (3) packages/engine/src/code-review.ts:281-284 toma main como base del diff cuando no se pasa --base; (4) packages/engine/src/worktree.ts:335-336 y packages/engine/src/worktree-integrar.ts:331-332 corren, tras crear o integrar, npx tsc --build tsconfig.build.json y node scripts/copy-web.mjs, que son del propio repositorio del harness; en un proyecto que no es el harness esos comandos no existen y la recompilación falla aunque la integración ya se hizo; la lista de procesos permitidos está en packages/engine/src/worktree-git.ts:195-196. Esperado: los tres primeros sitios usan la misma rama base que ya resuelve ramaBaseDelProyecto (sin cambiar el comportamiento de los proyectos sobre main), y la recompilación solo corre cuando el proyecto la tiene, sin hacer fallar un create o un integrate que sí se hicieron. No se agrega ninguna clave nueva de configuración sin decidirlo en el análisis con la opción conservadora.

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
    "at": "2026-10-14T17:26:32.547Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  }
]
```
