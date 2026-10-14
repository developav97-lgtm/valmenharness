---
schema_version: 2
id: FEATURE-WEB-TEMA-TOKENS-20261014
title: Tema sala de control con tokens, fuentes locales y modo claro
type: FEATURE
module: WEB
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

# FEATURE-WEB-TEMA-TOKENS-20261014

## Solicitud original

Parte del sprint: Marco común entregable: tema sala de control con fuentes locales, menú por grupos con proyecto y perfil activo, acción Pedir un cambio e Inicio como pantalla de apertura.
- R-MARCO-001: La interfaz DEBE usar el tema «sala de control» definido como tokens
Viene de una feature descompuesta en sprints; su plan completo está en el tickets.yaml de la feature.

Comportamiento esperado: La interfaz DEBE usar el tema «sala de control» definido como tokens
Comportamiento actual: la spec no lo declara; se establece en el análisis, leyendo el código.

### Referencias de diseño

Adjuntos que citan los requisitos de este ticket. Se construye y se valida contra el original, no contra el texto de la spec:
- `.valmen/features/rediseno-mission-control/assets/inicio.html` — Boceto aprobado por el PO el 2026-10-14: Inicio (HTML autónomo, el original) (sha256 d3d757a58383…)
- `.valmen/features/rediseno-mission-control/assets/inicio.png` — Captura a 1440 px del boceto aprobado: Inicio (sha256 6c7749d2fadd…)
- `.valmen/features/rediseno-mission-control/assets/menu.html` — Boceto aprobado por el PO el 2026-10-14: Menú lateral por grupos (HTML autónomo, el original) (sha256 802d68d45244…)
- `.valmen/features/rediseno-mission-control/assets/menu.png` — Captura del boceto aprobado: Menú lateral por grupos (sha256 7ba35b11696d…)

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

- [ ] R-MARCO-001: La interfaz DEBE usar el tema «sala de control» definido como tokens

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
    "at": "2026-10-14T05:09:26.816Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-14",
    "at": "2026-10-14T05:09:54.717Z",
    "action": "design-references-updated",
    "actor": "cli",
    "details": "Referencias de diseño actualizadas: .valmen/features/rediseno-mission-control/assets/inicio.html, .valmen/features/rediseno-mission-control/assets/inicio.png, .valmen/features/rediseno-mission-control/assets/menu.html, .valmen/features/rediseno-mission-control/assets/menu.png."
  }
]
```
