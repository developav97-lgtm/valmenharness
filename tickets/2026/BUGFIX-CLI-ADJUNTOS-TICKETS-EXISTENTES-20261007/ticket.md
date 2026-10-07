---
schema_version: 2
id: BUGFIX-CLI-ADJUNTOS-TICKETS-EXISTENTES-20261007
title: Los adjuntos de diseño anexados después de materializar no llegan a los tickets
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

# BUGFIX-CLI-ADJUNTOS-TICKETS-EXISTENTES-20261007

## Solicitud original

Pedido del PO (2026-10-07, desde la sesión de SaiOpenCloud): «quiero corregir ese error tambien en el harness para que a la proxima no toque hacer esto». Contexto: la feature superadmin-ampliacion de SaiOpenCloud se materializó en 44 tickets y después se anexaron sus 15 pantallas con valmen feature asset add. Ningún ticket quedó con la sección Referencias de diseño, que es el mecanismo de FEATURE-CLI-ADJUNTOS-FEATURE-Y-CORRIDA-AUTONOMA-20261006 para que las pantallas se construyan contra el diseño aprobado. En la feature anterior (precarga-catalogos) ese mismo hueco hizo que las pantallas salieran distintas al diseño. Fallas observadas: (1) La sección Referencias de diseño solo se escribe al crear el ticket (packages/engine/src/materialize.ts:276-305), y materialize no toca un ticket que ya existe (materialize.ts:20, :446). feature asset add y anexar_adjunto_a_feature no actualizan los tickets de la feature, así que un adjunto tardío nunca llega a ellos. (2) materialize solo avisa cuando la feature cita un enlace externo de diseño sin copia local: creó los 44 tickets con tres avisos y siguió. (3) feature asset add acepta como prototipo un .dc.html, que es la fuente del lienzo de diseño (Artifact tipo Design): depende de ./support.js, x-dc, sc-for y {{huecos}}, así que no se puede abrir en el navegador para comparar, a diferencia del HTML autónomo de precarga-catalogos. (4) La cita se resuelve por archivo de spec y no por requisito (assetsForRequirements, packages/engine/src/feature-assets.ts:309-326): un ticket que cubre un requisito de un dominio recibe todos los adjuntos citados en ese spec.md. Comportamiento esperado: un adjunto anexado después de materializar llega a la sección Referencias de diseño de los tickets de la feature que lo citan, al menos mientras no hayan empezado la implementación, y de forma determinista, sin que un agente edite el ticket a mano. Materializar con enlaces externos de diseño sin copia local no pasa en silencio. Un .dc.html se detecta al anexarlo y se pide (o se genera) su versión autónoma. Cómo se resuelve cada punto (actualizar al anexar, comando de refresco, bloqueo o bandera explícita) se decide en el análisis y el plan.

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
    "at": "2026-10-07T19:58:10.277Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  }
]
```
