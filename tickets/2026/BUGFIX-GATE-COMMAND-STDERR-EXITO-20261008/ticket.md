---
schema_version: 2
id: BUGFIX-GATE-COMMAND-STDERR-EXITO-20261008
title: El gate qa-mechanical marca falla de entorno a toda suite que pasa porque no lee stderr con exit 0
type: BUGFIX
module: GATE
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

# BUGFIX-GATE-COMMAND-STDERR-EXITO-20261008

## Solicitud original

PO (2026-10-08): "referente al gate de qa-mechanical yo creo que podemos generar el ticket en el harness para corregir". Síntoma observado durante la feature superadmin-ampliacion de SaiOpenCloud: `valmen gate qa-mechanical` devuelve REVIEW con «falla del entorno: la salida no trae el resumen de pruebas de Django; el comando no llegó a ejecutar la suite» en todos los criterios, aunque el comando salga con exit 0 y la suite pase (por ejemplo `docker compose run --rm -T -e DB_NAME=x backend python manage.py test SuperAdmin.tests.test_models --keepdb`, 4 tests OK). Causa localizada: en packages/gate-command/src/command.ts (~líneas 290-350) la rama de éxito de `execFileSync` solo guarda `stdout` y deja `stderr` vacío; Django (unittest) imprime `Ran N tests ... OK` por stderr, así que `classifyEnvironmentFailure` (RUNNERS, patrón `Ran\s+\d+\s+tests?`) nunca lo ve. Los recibos viejos pasaron antes de que existiera esa clasificación. Efecto: ~40 tickets de SaiOpenCloud tuvieron que cerrarse a mano por REVIEW sin que ninguna prueba hubiera fallado.

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
    "at": "2026-10-08T16:16:57.061Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  }
]
```
