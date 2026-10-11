---
schema_version: 2
id: SECURITY-ADAPTER-OPENCODE-SHELL-ENV-20261011
title: OpenCode no deniega la lectura de .env por el shell (cat .env)
type: SECURITY
module: ADAPTER
workflow_status: intake
qa_status: pending
release_status: unreleased
user_visible: false
sync_impact: false
migration_impact: false
docker_impact: false
risk_level: normal
created: 2026-10-11
updated: 2026-10-11
related_ticket: null
target_release: null
released_in: null
---

# SECURITY-ADAPTER-OPENCODE-SHELL-ENV-20261011

## Solicitud original

Hallado al probar SECURITY-ADAPTER-DENEGADOS-CODEX-OPENCODE-20261010 el 2026-10-11 con OpenCode 2.0.16 en modo --auto: la herramienta read sobre .env da «Permission denied: read», pero el shell ejecutó «cat .env» y devolvió su contenido. La configuración proyectada (.opencode/opencode.json) trae los patrones de .env solo en read y edit; las reglas del shell (bash) solo cubren formas de git. Decidir qué formas de lectura por shell (cat, head, tail, less, grep, sed, source) se deniegan para las rutas sensibles de SENSITIVE_PATH_GLOBS en packages/core/src/denied.ts, como ya hace la proyección de Claude Code con «cat .env», y qué límites quedan documentados.

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
    "date": "2026-10-11",
    "at": "2026-10-11T17:51:05.430Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  }
]
```
