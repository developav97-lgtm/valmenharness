---
schema_version: 2
id: BUGFIX-CLI-JORNADA-AVANCE-AUTONOMO-20261007
title: Que el avance de la jornada prepare y ejecute por defecto y se recupere solo de una parada
type: BUGFIX
module: CLI
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

# BUGFIX-CLI-JORNADA-AVANCE-AUTONOMO-20261007

## Solicitud original

El disparador periódico de la jornada (valmen journey advance sin --fase) solo ejecuta tickets en approved y nunca prepara los que están en intake, así que por sí solo no avanza: hasta el 2026-10-07 hubo que lanzar la preparación a mano con --fase preparacion y modificar el plist del disparador para encadenar las dos fases. Además la jornada no se recupera sola de tres paradas vistas en la práctica: (1) reutiliza una rama de trabajo vieja (valmen/jornada-AAAAMMDD) que quedó atrás de main, y en ella el ticket aprobado aparece en intake y se rechaza como no elegible; (2) una ejecución abortada deja una reserva de capacidad huérfana en ~/.valmen/machine-capacity.json y el siguiente avance responde ya-despachado sin ejecutar nada; (3) un cambio sin commitear de otra sesión deja el árbol sucio y detiene la jornada sin avisar a quien lo causó. Debe: correr preparación y ejecución en cada avance sin indicar fase; crear o actualizar la rama de trabajo desde main antes de cada ticket; recuperar una reserva cuya actividad no sigue en curso; y avisar por el canal de avisos cuando una parada por árbol sucio dura más de una pasada, diciendo qué archivos la causan.

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
    "date": "2026-10-07",
    "at": "2026-10-07T21:15:44.186Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  }
]
```
