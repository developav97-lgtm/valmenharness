---
schema_version: 2
id: FEATURE-WEB-MENU-GRUPOS-20261014
title: Menú por grupos con proyecto, perfil activo y Pedir un cambio
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

# FEATURE-WEB-MENU-GRUPOS-20261014

## Solicitud original

Parte del sprint: Marco común entregable: tema sala de control con fuentes locales, menú por grupos con proyecto y perfil activo, acción Pedir un cambio e Inicio como pantalla de apertura.
- R-MARCO-002: El menú lateral DEBE agrupar las vistas en Hoy, Trabajo, En vivo, Reglas y Ajustes
- R-MARCO-003: El menú DEBE mostrar arriba el proyecto activo y debajo su perfil de modelos
- R-MARCO-004: El chat de configuración DEBE abrirse como la acción «Pedir un cambio» desde cualquier pantalla
- R-MARCO-006: Cada pantalla DEBERÍA funcionar en el celular
Depende de: FEATURE-WEB-TEMA-TOKENS-20261014.
Viene de una feature descompuesta en sprints; su plan completo está en el tickets.yaml de la feature.

Comportamiento esperado: El menú lateral DEBE agrupar las vistas en Hoy, Trabajo, En vivo, Reglas y Ajustes El menú DEBE mostrar arriba el proyecto activo y debajo su perfil de modelos El chat de configuración DEBE abrirse como la acción «Pedir un cambio» desde cualquier pantalla Cada pantalla DEBERÍA funcionar en el celular
Comportamiento actual: la spec no lo declara; se establece en el análisis, leyendo el código.

### Fuera de alcance

Lo que el grafo asignó a otros tickets y este no hace:
- R-MARCO-006: lo cubre FEATURE-WEB-INICIO-DECISIONES-20261014 (Inicio con lo que espera una decisión de la persona)
- R-MARCO-006: lo cubre FEATURE-WEB-AJUSTES-MODELOS-20261014 (Vista Modelos con perfil activo, roles agrupados y aviso de cliente)
- R-MARCO-006: lo cubre FEATURE-WEB-AJUSTES-CAMBIAR-PERFIL-20261014 (Cambiar de perfil con vista previa de lo que cambia)
- R-MARCO-006: lo cubre FEATURE-WEB-AJUSTES-PROVEEDORES-20261014 (Proveedores con estado y uso por el perfil activo)
- R-MARCO-006: lo cubre FEATURE-WEB-AJUSTES-PROYECTO-20261014 (Proyecto con bloques e interruptores y YAML en Avanzado)
- R-MARCO-006: lo cubre FEATURE-WEB-TRABAJO-TICKETS-20261014 (Tickets y detalle con filtro por turno y ciclo de ocho pasos)
- R-MARCO-006: lo cubre FEATURE-WEB-TRABAJO-FEATURES-20261014 (Features con estado y tablero de recorrido y siguiente paso)
- R-MARCO-006: lo cubre FEATURE-WEB-TRABAJO-PORTAFOLIO-20261014 (Portafolio con una tarjeta por proyecto)
- R-MARCO-006: lo cubre FEATURE-WEB-VIVO-AGENTES-20261014 (Agentes con titular, pregunta pendiente y selector de mundo)
- R-MARCO-006: lo cubre FEATURE-WEB-VIVO-PROCESOS-20261014 (Procesos con las corridas detenidas primero)
- R-MARCO-006: lo cubre FEATURE-WEB-REGLAS-ESTANDARES-20261014 (Estándares separados en vigor, propuestos y descartados)

### Referencias de diseño

Adjuntos que citan los requisitos de este ticket. Se construye y se valida contra el original, no contra el texto de la spec:
- `.valmen/features/rediseno-mission-control/assets/menu.html` — Boceto aprobado por el PO el 2026-10-14: Menú lateral por grupos (HTML autónomo, el original) (sha256 802d68d45244…)
- `.valmen/features/rediseno-mission-control/assets/menu-antes-despues.html` — Boceto aprobado por el PO el 2026-10-14: Menú antes y después (HTML autónomo, el original) (sha256 b42250f67f88…)
- `.valmen/features/rediseno-mission-control/assets/menu-antes-despues.png` — Captura a 1440 px del boceto aprobado: Menú antes y después (sha256 7191f6790a97…)
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

- [ ] R-MARCO-002: El menú lateral DEBE agrupar las vistas en Hoy, Trabajo, En vivo, Reglas y Ajustes
- [ ] R-MARCO-003: El menú DEBE mostrar arriba el proyecto activo y debajo su perfil de modelos
- [ ] R-MARCO-004: El chat de configuración DEBE abrirse como la acción «Pedir un cambio» desde cualquier pantalla
- [ ] R-MARCO-006: Cada pantalla DEBERÍA funcionar en el celular (solo la parte de «Menú por grupos con proyecto, perfil activo y Pedir un cambio»; el resto lo cubre FEATURE-WEB-INICIO-DECISIONES-20261014, FEATURE-WEB-AJUSTES-MODELOS-20261014, FEATURE-WEB-AJUSTES-CAMBIAR-PERFIL-20261014, FEATURE-WEB-AJUSTES-PROVEEDORES-20261014, FEATURE-WEB-AJUSTES-PROYECTO-20261014, FEATURE-WEB-TRABAJO-TICKETS-20261014, FEATURE-WEB-TRABAJO-FEATURES-20261014, FEATURE-WEB-TRABAJO-PORTAFOLIO-20261014, FEATURE-WEB-VIVO-AGENTES-20261014, FEATURE-WEB-VIVO-PROCESOS-20261014, FEATURE-WEB-REGLAS-ESTANDARES-20261014)

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
    "at": "2026-10-14T05:09:27.106Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-14",
    "at": "2026-10-14T05:09:54.995Z",
    "action": "design-references-updated",
    "actor": "cli",
    "details": "Referencias de diseño actualizadas: .valmen/features/rediseno-mission-control/assets/menu.html, .valmen/features/rediseno-mission-control/assets/menu-antes-despues.html, .valmen/features/rediseno-mission-control/assets/menu-antes-despues.png, .valmen/features/rediseno-mission-control/assets/menu.png."
  }
]
```
