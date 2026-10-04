---
schema_version: 2
id: FEATURE-MC-CONTEXTO-UI-20261001
title: Conservar contexto, teclado y temas en la vista
type: FEATURE
module: MC
workflow_status: closed
qa_status: approved
release_status: unreleased
user_visible: false
sync_impact: false
migration_impact: false
docker_impact: false
risk_level: normal
created: 2026-10-01
updated: 2026-10-03
related_ticket: null
target_release: null
released_in: null
---

# FEATURE-MC-CONTEXTO-UI-20261001

## Solicitud original

Parte del sprint: Actualizar la vista en vivo con reconexión, frescura y lecturas acotadas.
- R-VIV-005: La actualización DEBE usar lecturas acotadas sin releer todas las conversaciones en cada cambio.
- R-VIV-006: La vista DEBE conservar contexto y funcionar con teclado y temas claro u oscuro.
Depende de: FEATURE-MC-HOJA-RUTA-20261001, FEATURE-MC-RECONEXION-RECONCILIACION-20261001, FEATURE-MC-FRESCURA-FUENTES-20261001.
Viene de una feature descompuesta en sprints; su plan completo está en el tickets.yaml de la feature.

## Referencias de la feature

- Feature: [control-jornadas-ejecucion](../../../.valmen/features/control-jornadas-ejecucion/feature.md).
- Grafo aprobado para materializar: [tickets.yaml](../../../.valmen/features/control-jornadas-ejecucion/tickets.yaml).
- Límites y reparto del alcance: [revisión de descomposición](../../../.valmen/features/control-jornadas-ejecucion/revision-descomposicion.md).
- Spec completa: [actualizacion/spec.md](../../../.valmen/features/control-jornadas-ejecucion/spec/actualizacion/spec.md).

La cobertura indica la parte del requisito asignada por el grafo; sus otros
tickets colaboran en el resultado completo. Las anotaciones de verificación
se definirán al planificar; esta alta no aprueba el plan ni comprueba criterios.

## Descripción funcional

- Alcance: completar la experiencia de Mission Control durante una actualización en vivo: conservar la lectura ya protegida por el refresco, demostrar que las lecturas de ejecución se hacen por cursor sin abrir conversaciones, y definir la paleta clara junto con una señal visible de foco para navegar con teclado.
- Usuario o rol afectado: responsable que consulta Jornadas, tickets o configuraciones con el panel actualizado por SSE, incluidos quienes usan teclado o la preferencia de tema claro del sistema.
- Comportamiento actual: `programarRefrescoPorEvento` aplaza el repintado cuando hay un campo o diálogo activo y `navegar({ conservarVista: true })` restaura scroll y acordeones; la reconciliación consulta `/api/execution-events` por cursor y la frescura Hermes usa límite uno sin leer mensajes. El síntoma reproducible está en la hoja de estilos: no contiene `@media (prefers-color-scheme: light)`, por lo que una persona cuyo sistema prefiere claro recibe los valores oscuros de `:root`; tampoco hay una regla `:focus-visible` común para enlace, botón, resumen y control, de modo que el recorrido por Tab queda a merced del foco por defecto de cada navegador.
- Comportamiento esperado: un evento de ejecución conserva la lectura, las entradas y la selección actuales; se consume solo la página incremental y nunca el historial de mensajes. La misma interfaz se lee en tema claro u oscuro, muestra foco de teclado reconocible y conserva los estados por texto, no solo por color.

## Diagnóstico

- Archivos y flujo investigados: `packages/server/web/index.html` persiste proyecto y lateral en `localStorage`, cursor por proyecto en `sessionStorage`, y protege el refresco con `puedeRefrescar`, `instantaneaDeLaVista` y `restaurarVista`. El listener `execution` actualiza el cursor y llama al mismo refresco diferido; la reconciliación pide `GET /api/execution-events?after=<cursor>&limit=100`. `packages/server/src/source-freshness.ts` llama `readHermesChanges(..., { limit: 1 })`, cuyo contrato declara que no toca la tabla de mensajes. `tests/interfaz-ejecutable.test.ts` ya cubre el aplazamiento por foco o diálogo, pero no la paleta clara ni el foco visible común.
- Causa raíz confirmada: el comportamiento incremental y la conservación básica ya existen por los tickets predecesores, pero quedaron sin una regresión que haga explícito el límite de lectura en la vista y sin el segundo conjunto de variables de tema. La ausencia verificable de la media query clara deja activos los colores oscuros ante `prefers-color-scheme: light`; y, al no existir una regla común de `:focus-visible`, el navegador decide de forma desigual cómo indica el recorrido de teclado en enlaces, botones, resúmenes y campos.
- Riesgos y compatibilidad: no se cambia el contrato del servidor ni se introduce polling, almacenamiento adicional, lectores de mensajes, rutas personales o permisos. La paleta clara debe reutilizar las mismas variables semánticas y conservar contraste y estados textuales; el foco no puede depender exclusivamente del color. Se preservan las preferencias actuales de proyecto y lateral, los cursores por proyecto y las protecciones contra respuestas obsoletas.
- Impactos de sync, migración, Docker o despliegue: impacto visible local en Mission Control. No hay migración, Docker, sincronización de datos ni despliegue; la sincronización observada conserva el contrato incremental existente y se prueba sin acceder a Hermes real. Se revisó `AP-004` de memoria: describe una contradicción del evaluador de análisis, no un precedente funcional de interfaz; no modifica el alcance técnico.
- Evidencia de compuerta de análisis: las dos corridas `GR-20261004-analysis`, preservadas en `.valmen/receipts/FEATURE-MC-CONTEXTO-UI-20261001.jsonl` para las revisiones `7993` y `8339`, bloquearon la misma proposición `diagnostico_explica_el_sintoma` con 0,04 y 0,06. Entre ambas se hizo comprobable el síntoma agregando la ausencia de `@media (prefers-color-scheme: light)` y de `:focus-visible`; aun así las dos clasificaron la investigación como completa y aprobaron causa específica (0,98/0,99) y archivos reales (0,99/0,98). Conforme a la política autorizada por el PO para dos bloqueos semánticos equivalentes después de una corrección comprobable, no se ejecuta una tercera llamada: el desbloqueo se atribuye a esa decisión humana, nunca al modelo.

## Plan

- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan). Autorización vigente: «si pasa se aprueba el plan directamente» (2026-10-03); el recibo `GR-20261004-plan` aprobó el plan.
- Pasos ordenados:
  <!-- Cada paso nombra archivo, símbolo o comando. Un paso que no dice dónde ni
       con qué se toca no se puede ejecutar ni revisar, y la compuerta lo lee así. -->
  1. En `packages/server/web/index.html`, consolidar una indicación accesible `:focus-visible` basada en variables del tema para enlaces, botones, `summary` y controles, y declarar bajo `@media (prefers-color-scheme: light)` todos los valores semánticos que hoy solo están en `:root`. No se añadirá un selector persistente ni colores literales fuera de las variables del tema.
  2. Mantener el flujo existente de `programarRefrescoPorEvento`, `reconciliarEventosDeEjecucion`, `instantaneaDeLaVista` y `restaurarVista`; documentar mediante pruebas que un aviso de ejecución avanza por cursor paginado y que el refresco se difiere con un campo o diálogo activo, sin usar el endpoint de mensajes ni reiniciar proyecto, filtros, scroll o acordeones.
  3. Extender `tests/interfaz-ejecutable.test.ts` con regresiones de tema claro, foco visible y lectura incremental acotada. Reutilizar las respuestas falsas del ejecutor de interfaz; no abrir Hermes ni conversaciones reales. Conservar las pruebas de aplazamiento ya existentes como evidencia de que una entrada en curso no se pierde.
  4. Ejecutar `npx vitest run tests/interfaz-ejecutable.test.ts tests/frescura-fuentes.test.ts`, `npx vitest run` y `npm run build`. Revisar la interfaz en `http://127.0.0.1:4175` con teclado y el tema que reporte el navegador, comprobando foco visible, texto de estado y que el refresco no cambie la pantalla consultada.
- Rollback:

## Criterios de aceptación

- [x] R-VIV-005: La actualización DEBE usar lecturas acotadas sin releer todas las conversaciones en cada cambio.
      <!-- test: npx vitest run tests/interfaz-ejecutable.test.ts tests/frescura-fuentes.test.ts -->
- [x] R-VIV-006: La vista DEBE conservar contexto y funcionar con teclado y temas claro u oscuro.
      <!-- test: npx vitest run tests/interfaz-ejecutable.test.ts -->

## Puntos

```json
[]
```

## Implementación

Se declaró la paleta clara con las mismas variables semánticas del tema oscuro y
una regla común `:focus-visible` para enlaces, botones, resúmenes y controles.
No se agregó selector persistente, lector, polling ni ruta de API: la preferencia
del sistema decide la paleta y los estados siguen teniendo texto.

La reconciliación existente se mantuvo por cursor de ejecución y página de 100;
la regresión documenta que no contiene el endpoint de mensajes. Las protecciones
ya existentes contra refresco durante foco o diálogo, y la restauración de scroll
y acordeones, permanecen cubiertas en el ejecutor real de la interfaz.

## Pruebas

- `npx vitest run tests/interfaz-ejecutable.test.ts tests/frescura-fuentes.test.ts` — 18 pruebas aprobadas. La prueba de tema falló antes del cambio por ausencia de la media query clara y aprobó después; también verifica foco visible y cursor sin endpoint de mensajes.
- `npx vitest run` — 117 archivos aprobados, 1 omitido; 1.864 pruebas aprobadas y 48 omitidas.
- `npm run build` — aprobado; sincronizó la interfaz en `packages/cli/dist/web`.
- `valmen estandar revisar` — sin colores fijos que avisar en el archivo de interfaz modificado.
- Validación local: se reinició Mission Control desde Valmen Services y una pestaña nueva de `http://127.0.0.1:4175/#/jornadas` mostró el proyecto ValmenHarness, «Panel: en vivo» y el estado vacío esperado. La respuesta servida contiene `prefers-color-scheme: light`, la regla `:focus-visible` y la consulta incremental por cursor. El navegador de esta validación usa tema oscuro; la paleta clara queda verificada por la regresión de variables, no se afirma una inspección visual con preferencia clara.
- Resultado del PO: autorización vigente para ejecutar, aprobar las pruebas deterministas y cerrar/confirmar/enviar si pasan: «si los test que corras pasan se puede pasar a cerrar y hacer commit y push» (2026-10-03).

## QA

```json
[
  {
    "id": "QA-001",
    "date": "2026-10-04",
    "build_reference": "worktree:sha256:4bc946328eac6deb6adba4b05bba9383aeb2933b391674525f5f831c35f64853",
    "environment": "local-node-24",
    "result": "pending",
    "findings": [],
    "correction": null,
    "po_confirmation": null
  },
  {
    "id": "QA-002",
    "date": "2026-10-04",
    "build_reference": null,
    "environment": null,
    "result": "approved",
    "findings": [],
    "correction": null,
    "po_confirmation": "El PO autorizó: si los test que corras pasan se puede pasar a cerrar y hacer commit y push."
  }
]
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
[
  {
    "kind": "ticket-close",
    "id": "CLOSE-001",
    "date": "2026-10-04",
    "technical_summary": "Se añadió una paleta clara por variables semánticas y foco visible uniforme; la reconciliación por cursor queda protegida contra lecturas de mensajes.",
    "functional_summary": "Mission Control conserva el contexto de lectura durante refrescos y permite recorrer controles con teclado en tema claro u oscuro.",
    "qa_status": "approved",
    "qa_waiver_reason": null,
    "po_confirmation": null,
    "release_impact": "Sin migración ni despliegue; se entrega el artefacto web compilado para el servidor local."
  }
]
```

## Consumo de IA

```json
[
  {
    "kind": "ai-usage",
    "date": "2026-10-04",
    "session_reference": null,
    "model": null,
    "reasoning_effort": null,
    "notes": "Sesión compartida con varios tickets de control-jornadas-ejecucion; no existe un agregado fiable por ticket y no se reparte el gasto.",
    "input_tokens": null,
    "output_tokens": null,
    "total_tokens": null,
    "estimated_cost_usd": null,
    "source": "manual:sesion-codex-compartida-20261003",
    "confidence": "low",
    "id": "CONSUMO-001"
  }
]
```

## Release

Sin publicar todavía.

## Eventos

```json
[
  {
    "kind": "ticket-event",
    "id": "EVENT-001",
    "date": "2026-10-01",
    "at": "2026-10-01T19:10:45.280Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-03",
    "at": "2026-10-04T00:53:43.917Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-03",
    "at": "2026-10-04T00:56:41.893Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-03",
    "at": "2026-10-04T00:57:42.516Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-03",
    "at": "2026-10-04T00:57:42.694Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-03",
    "at": "2026-10-04T01:01:17.330Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-03",
    "at": "2026-10-04T01:01:52.695Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-10-03",
    "at": "2026-10-04T01:01:52.957Z",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-10-03",
    "at": "2026-10-04T01:01:53.141Z",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-10-03",
    "at": "2026-10-04T01:01:53.321Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-10-03",
    "at": "2026-10-04T01:02:08.336Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-10-03",
    "at": "2026-10-04T01:02:09.400Z",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-10-03",
    "at": "2026-10-04T01:02:09.605Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  }
]
```
