---
schema_version: 2
id: FEATURE-CLI-VERIFICACION-TEMPORAL-20261001
title: Verificar la guía paso a paso en registro temporal
type: FEATURE
module: CLI
workflow_status: closed
qa_status: approved
release_status: unreleased
user_visible: false
sync_impact: false
migration_impact: false
docker_impact: false
risk_level: normal
created: 2026-10-01
updated: 2026-10-05
related_ticket: null
target_release: null
released_in: null
---

# FEATURE-CLI-VERIFICACION-TEMPORAL-20261001

## Solicitud original

Parte del sprint: Entregar adopción portable, diagnóstico y verificación temporal reutilizables.
- R-ADO-006: La guía DEBE verificar el paso a paso en un registro temporal sin afectar tickets reales.
Depende de: DOCS-ADOPCION-RUTAS-20261001, FEATURE-CLI-DOCTOR-CAPACIDADES-20261001, FEATURE-CLI-ADOPCION-IDEMPOTENTE-20261001.
Viene de una feature descompuesta en sprints; su plan completo está en el tickets.yaml de la feature.

## Referencias de la feature

- Feature: [control-jornadas-ejecucion](../../../.valmen/features/control-jornadas-ejecucion/feature.md).
- Grafo aprobado para materializar: [tickets.yaml](../../../.valmen/features/control-jornadas-ejecucion/tickets.yaml).
- Límites y reparto del alcance: [revisión de descomposición](../../../.valmen/features/control-jornadas-ejecucion/revision-descomposicion.md).
- Spec completa: [adopcion/spec.md](../../../.valmen/features/control-jornadas-ejecucion/spec/adopcion/spec.md).

La cobertura indica la parte del requisito asignada por el grafo; sus otros
tickets colaboran en el resultado completo. Las anotaciones de verificación
se definirán al planificar; esta alta no aprueba el plan ni comprueba criterios.

## Descripción funcional

- Alcance: comprobar mecánicamente la ruta CLI documentada de puesta en marcha dentro de una raíz y un registro temporales, y declarar las rutas MCP o semánticas que no estén disponibles. La comprobación no crea, cierra ni altera tickets del proyecto desde el que se invoca.
- Usuario o rol afectado: responsable o agente con terminal que quiere confirmar que la guía de adopción funciona antes de aplicarla en un proyecto real.
- Comportamiento actual: la guía lista `adopt`, `sync`, `doctor`, `routing show`, `execution journeys` y una prueba final que pide crear un ticket, pero cada comando opera sobre la raíz activa. No hay una orden que componga ese recorrido en un registro efímero ni que distinga el contrato mecánico de las capacidades MCP o de un proveedor semántico ausente.
- Comportamiento esperado: una verificación CLI reutilizable prepara y revisa solo un entorno temporal, informa qué comprobó, qué quedó pendiente por no disponer de MCP o proveedor semántico y devuelve evidencia legible sin escribir en el registro real.

## Diagnóstico

- Archivos y flujo investigados: `docs/15-PUESTA-EN-MARCHA.md:177-193` define la ruta CLI mínima y su consulta directa; `docs/15-PUESTA-EN-MARCHA.md:384-395` enumera comprobaciones que se ejecutan sobre la raíz actual e incluso propone crear un ticket. `packages/cli/src/main.ts:1669-1680` solo despacha `provider`, `routing`, `doctor`, `feature` y transiciones en esa rama: no hay una orden de verificación temporal. `packages/cli/src/commands.ts:877-1111` hace que `adoptProject` use la raíz recibida y escriba `.valmen/`, reglas y skills cuando no es `--dry-run`. `tests/puesta-en-marcha.test.ts:186-326` cubre por separado diagnóstico, selección de capacidades y una raíz temporal para `doctor`, pero no el recorrido de la guía ni la conservación de un registro real.
- Causa raíz o hipótesis: las piezas de adopción y diagnóstico ya son invocables, pero falta un orquestador explícito que cree una raíz aislada, ejecute allí el contrato mecánico y comunique límites opcionales. Por ello la única "prueba de verdad" visible aún puede operar sobre tickets reales, en contradicción con R-ADO-006.
- Riesgos y compatibilidad: la verificación debe mantener `doctor` como lectura y confinar las escrituras de `adopt`/`sync` al directorio temporal. No debe copiar bindings, credenciales, `.mcp.json`, perfiles Hermes ni rutas personales; su presencia no demuestra que un cliente MCP o un proveedor esté disponible. La memoria no devolvió una solución previa de adopción; AP-002 advierte evitar imports desde el índice del propio paquete que introduzcan ciclos dependientes del orden de evaluación. La ruta CLI existente y `adopt --dry-run` deben conservar su comportamiento.
- Impactos de sync, migración, Docker o despliegue: `sync` solo se ejecutaría dentro de la raíz temporal; no hay migración, Docker, despliegue, publicación, credenciales, binding local ni modificación del registro real.

## Plan

- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan). Aprobación literal en esta conversación: «si apruebo». El ticket añade un comando CLI y pruebas, sin impactos críticos declarados.
- Alcance y exclusiones: se añadirá una verificación de puesta en marcha que usa una raíz temporal propia para ejercitar el flujo CLI. Quedan fuera modificar la raíz desde la que se invoca, crear o cerrar sus tickets, copiar credenciales o bindings locales, instalar/reiniciar MCP, conectar Hermes, ejecutar gates semánticos, crear jornadas, despachar trabajo, publicar, hacer commits o cambiar la guía de otras rutas.
- Pasos ordenados:
  1. Crear `packages/cli/src/onboarding-verify.ts` con el orquestador de verificación temporal: crear y limpiar una raíz temporal, preparar solo los archivos mínimos del proyecto de prueba, ejecutar las funciones existentes de adopción, proyección y diagnóstico contra esa raíz y producir un informe de comprobaciones mecánicas y capacidades pendientes. El orquestador debe usar un hogar y entorno aislados, no heredar credenciales, bindings ni configuración MCP/Hermes de la persona, y comprobar mediante instantánea que el registro real no cambió.
  2. Extender `packages/cli/src/main.ts` para exponer el subcomando de verificación de puesta en marcha y su ayuda, delegándolo al orquestador sin cambiar el contrato de `adopt`, `sync` o `doctor` existentes. La salida debe distinguir éxito del contrato mecánico de capacidades no comprobadas por falta de MCP o proveedor semántico, sin emitir aprobación de tickets.
  3. Añadir `tests/verificacion-puesta-en-marcha.test.ts` para recorrer la orden pública en una instalación CLI sin proveedor semántico, afirmar el informe de pasos pendientes, comparar una instantánea del registro real antes/después y cubrir la limpieza de la raíz temporal. Incluir un caso con capacidades MCP declaradas pero no activadas que no simule instalación ni conexión.
  4. Actualizar `docs/15-PUESTA-EN-MARCHA.md` para sustituir la prueba que pide crear un ticket real por el comando temporal, documentar sus límites y conservar las instrucciones separadas de CLI, MCP y Hermes. Ejecutar la prueba dirigida, `npx tsc -b --pretty false` y la suite completa desde la raíz; entregar después el comando del binario compilado para la validación manual.
- Compatibilidad y riesgos: la verificación reutiliza los contratos existentes, conserva los códigos y salidas de los comandos actuales y solo declara lo que logra comprobar. Un fallo de preparación temporal o una capacidad ausente debe informarse sin escribir fuera de la raíz creada. No se importará el índice del propio paquete para evitar el ciclo señalado por AP-002.
- Rollback: retirar el subcomando, su orquestador, la prueba y el texto documental asociados; las raíces temporales se eliminan al finalizar y no hay configuración real, migración, proceso, ticket ni credencial que restaurar.

## Criterios de aceptación

- [x] R-ADO-006: La orden pública de verificación DEBE ejecutar la puesta en marcha CLI en una raíz y registro temporales, informar las comprobaciones mecánicas y eliminar su entorno efímero al finalizar.
      <!-- test: npx vitest run tests/verificacion-puesta-en-marcha.test.ts -->
- [x] R-ADO-006: Sin proveedor semántico, MCP ni Hermes habilitados, la verificación DEBE declarar esas capacidades como pendientes y NO DEBE crear, cerrar ni modificar tickets del registro desde el que se invoca.
      <!-- test: npx vitest run tests/verificacion-puesta-en-marcha.test.ts -->
- [x] R-ADO-006: La guía DEBE dirigir la comprobación segura al comando temporal y NO DEBE indicar crear un ticket real como prueba de puesta en marcha.
      <!-- test: npx vitest run tests/verificacion-puesta-en-marcha.test.ts -->

## Puntos

```json
[]
```

## Implementación

- Se agregó `packages/cli/src/onboarding-verify.ts`: crea una raíz temporal aislada, ejecuta `adopt`, `sync` y `doctor` únicamente allí, compara el registro de origen antes y después y elimina el directorio efímero incluso si una comprobación falla.
- `packages/cli/src/main.ts` expone `valmen onboarding verify`; su informe distingue el contrato mecánico de CLI de MCP, Hermes y proveedor semántico no comprobados. No instala ni reinicia clientes, no conecta perfiles, no ejecuta gates ni aprueba tickets.
- `docs/15-PUESTA-EN-MARCHA.md` incorpora el comando como prueba segura y deja de recomendar crear un ticket real para demostrar la instalación.
- No se copiaron credenciales, bindings locales, configuraciones MCP/Hermes ni rutas personales al entorno temporal.

## Pruebas

- Directorio: raíz del repositorio (`/Users/juanandrade/Desktop/ValmenHarness`).
- `npx vitest run tests/verificacion-puesta-en-marcha.test.ts` — pasó: 3 pruebas; cubre la orden pública, el recorrido en raíz efímera, la conservación del origen, limpieza temporal y la guía segura.
- `npx tsc -b --pretty false` — pasó sin diagnósticos.
- `npx vitest run` — pasó: 138 archivos y 2161 pruebas; 1 archivo y 48 pruebas de equivalencia quedaron omitidos por configuración.
- `npm run build && ./node_modules/.bin/valmen onboarding verify` — pasó: el binario confirmó el flujo CLI mecánico, capacidades opcionales pendientes y registro de origen sin cambios.
- `npx prettier --check packages/cli/src/onboarding-verify.ts packages/cli/src/main.ts tests/verificacion-puesta-en-marcha.test.ts docs/15-PUESTA-EN-MARCHA.md`, `git diff --check` y `valmen secrets` — pasaron; formato, espacios y secretos verificados.
- Validación manual posterior: desde la raíz del repositorio, ejecutar `./node_modules/.bin/valmen onboarding verify`. Debe informar el flujo mecánico CLI verificado, declarar proveedor semántico/MCP/Hermes como no comprobados y afirmar que el registro de origen no cambió. No requiere proveedor, MCP, Hermes ni permisos externos.
- Resultado comunicado por el PO: autorizó ejecutar y cerrar si el resultado era el esperado. La ejecución compilada de `./node_modules/.bin/valmen onboarding verify` informó `Flujo CLI mecánico verificado`, proveedor semántico/MCP/Hermes no comprobados y `Registro de origen sin cambios`; se aprueba la prueba.

## QA

```json
[
  {
    "id": "QA-001",
    "date": "2026-10-06",
    "build_reference": "worktree:sha256:068c60d2d99da7689ea5db0682a4d270ecebd7727953d4e0f45bbe35cb64b83a",
    "environment": "local",
    "result": "pending",
    "findings": [],
    "correction": null,
    "po_confirmation": null
  },
  {
    "id": "QA-002",
    "date": "2026-10-06",
    "build_reference": null,
    "environment": null,
    "result": "approved",
    "findings": [],
    "correction": null,
    "po_confirmation": "podrias ejecutarlo tu y si el resultado es el esperado podemos cerrar el ticket"
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
    "date": "2026-10-06",
    "technical_summary": "Se agregó valmen onboarding verify: adopta, sincroniza y diagnostica una raíz temporal aislada; compara el registro de origen y borra el entorno efímero. La guía usa esa comprobación y ya no propone crear un ticket real.",
    "functional_summary": "La verificación ejecutada informó el flujo CLI mecánico correcto, declaró como pendientes las capacidades opcionales y confirmó que el registro de origen no cambió.",
    "qa_status": "approved",
    "qa_waiver_reason": null,
    "po_confirmation": null,
    "release_impact": "Sin publicación: cambio local de CLI y documentación, sin migraciones, despliegue, etiquetas ni procesos externos."
  }
]
```

## Consumo de IA

```json
[
  {
    "kind": "ai-usage",
    "date": "2026-10-06",
    "session_reference": "666e4a95-21b9-4503-8d5c-3bc5fcc3e56a",
    "model": null,
    "reasoning_effort": null,
    "notes": "Agente claude-code. Sesión **compartida**: trabajó 20 tickets (BUGFIX-ENGINE-FIRMA-DE-COMPUERTA-20261004 ×14, SECURITY-ENGINE-CIERRE-AUTORIZADO-20260926 ×10, BUGFIX-GATE-LECTOR-CRITERIOS-20261005 ×9, INTEGRATION-GIT-INTEGRACION-AUTONOMA-20260926 ×8, INTEGRATION-HERMES-DESPACHO-JORNADA-20261001 ×8), así que su costo no se reparte y acá no se registran números. Costo completo de la sesión: no declarado por el proveedor, 2015423 tokens. Registralo en el ticket cuya sesión sea propia, o declaralo compartido donde corresponda. Sesión \"AI development harness review\".",
    "input_tokens": null,
    "output_tokens": null,
    "total_tokens": null,
    "estimated_cost_usd": null,
    "source": "claude:666e4a95-21b9-4503-8d5c-3bc5fcc3e56a",
    "confidence": "high",
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
    "at": "2026-10-01T19:10:45.679Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-05",
    "at": "2026-10-06T02:51:18.568Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-05",
    "at": "2026-10-06T02:52:58.643Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-05",
    "at": "2026-10-06T02:54:24.220Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-05",
    "at": "2026-10-06T02:54:30.392Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-05",
    "at": "2026-10-06T03:02:13.576Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-05",
    "at": "2026-10-06T03:07:11.430Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-10-05",
    "at": "2026-10-06T03:07:11.754Z",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-10-05",
    "at": "2026-10-06T03:07:11.949Z",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-10-05",
    "at": "2026-10-06T03:07:12.145Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-10-05",
    "at": "2026-10-06T03:07:23.950Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-10-05",
    "at": "2026-10-06T03:07:24.056Z",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-10-05",
    "at": "2026-10-06T03:07:29.755Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  }
]
```
