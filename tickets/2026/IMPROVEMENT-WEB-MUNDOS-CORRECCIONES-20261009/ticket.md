---
schema_version: 2
id: IMPROVEMENT-WEB-MUNDOS-CORRECCIONES-20261009
title: Correcciones de los tres mundos tras la revisión del PO
type: IMPROVEMENT
module: WEB
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

# IMPROVEMENT-WEB-MUNDOS-CORRECCIONES-20261009

## Solicitud original

Palabras del PO el 2026-10-09 tras revisar los mundos (con seis capturas: tabla «Comandas» de la pastelería, tabla «Telemetría» del centro de control, el invernadero con la tabla «Bitácora de cultivo» y el centro de control con cinco consolas «CERRADA» superpuestas): «voy a empezar por la pantalla de el jardín. La idea, digamos, es que, por ejemplo, en el jardín, la matica que va pasando de maceta en maceta, sea el ticket. ¿Qué pasa? Que si hay seis tickets por probar, deberían haber seis tickets en la maceta de prueba; la maceta iría pasando paso a paso y debe ser un ticket; si en la maceta solo caben nueve flores, entonces el máximo número visual va a ser nueve, si hay 12, 3, 12, 15 tickets, pues se van a seguir viendo nueve, y en el momento de que bajen a ocho sí se va a ver la disminución de las flores; la idea es que las flores sean, digamos, como los tickets. En la panadería sería igual: cada pastel sería un ticket, y cada pastel debería pasar y quedar al final como acumulado, la cantidad que visualmente se vea bien. Pasa otra cosa, que siento que no es culpa de la pantalla de agentes: el cambio de estados. Lo revisé con varios tickets al momento de su ejecución. El agente principal lanza el ticket a un subagente. El subagente hace todo el proceso de análisis. El principal corrigió el análisis, pasó al plan, se aprobó el plan y se pasó a implementar. Pero el ticket visualmente, ni dentro del ticket ni dentro de los mundos de los agentes, pasó por todos sus estados. Solamente se actualizó cuando pasó a pruebas. Los agentes que están haciendo las fases no están actualizando el estado instantáneamente; creo que si el ticket empezó el análisis, en el jardín debería pasar a la casilla de análisis, si ya pasó el análisis y se empezó el plan debería pasar al plan, pero esa sucesión de estados no está pasando. En el mundo de los computadores, cuando apenas arranca, si recargo la pestaña los agentes van y se sientan en el computador, pero después se hace un refresco y se tapan todos y quedan como cinco computadores visibles tapando los que están ejecutando, y se la pasa así: los quita y vuelve y los pone y los sigue tapando. Del jardín de Anita o el mostrador de Anita: quítale ese nombre, Anita, por favor. En la parte donde se ven las sesiones, tanto en la panadería como en el de sistemas, no se ve bien el primer registro. Y en los pantallazos se ven tres registros: uno de sesión principal, uno que dice ticket sesión principal y uno que es el que estaba trabajando en ese momento; solo faltaba un ticket por ejecutar, que era el agente que estaba ahí, pero seguían apareciendo tres agentes; es más, en este momento ese agente sigue apareciendo.»

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
    "at": "2026-10-09T03:32:52.271Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  }
]
```
