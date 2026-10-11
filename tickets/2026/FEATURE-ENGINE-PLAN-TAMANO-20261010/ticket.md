---
schema_version: 2
id: FEATURE-ENGINE-PLAN-TAMANO-20261010
title: El plan declara tamaño previsto y estrategia de partición
type: FEATURE
module: ENGINE
workflow_status: closed
qa_status: approved
release_status: unreleased
user_visible: false
sync_impact: false
migration_impact: false
docker_impact: false
risk_level: normal
created: 2026-10-10
updated: 2026-10-11
related_ticket: null
target_release: null
released_in: null
---

# FEATURE-ENGINE-PLAN-TAMANO-20261010

## Solicitud original

Parte del sprint: La entrega se mide, avisa al pasar el tope y el plan declara cómo partir un cambio grande.
- R-ENT-003: El plan DEBERÍA declarar el tamaño previsto y cómo se parte si excede el tope
Depende de: FEATURE-ENGINE-ENTREGA-TOPE-20261010.
Viene de una feature descompuesta en sprints; su plan completo está en el tickets.yaml de la feature.

Comportamiento esperado: El plan DEBERÍA declarar el tamaño previsto y cómo se parte si excede el tope
Comportamiento actual: la spec no lo declara; se establece en el análisis, leyendo el código.

### Supuestos y decisiones pendientes

<!-- Si el pedido nombra algo que el código no tiene —parámetro, permiso,
campo, bandera, columna, migración— y no lo especifica, listá cada elemento
con su pregunta antes de avanzar a análisis; el análisis no planifica sobre
la adivinanza. Si no hay ninguno, escribí «Ninguno» y seguí. -->
- «El tope» se traduce a campo real: `delivery-budget` de `.valmen/config.yaml` (línea 33, hoy 400), que lee `topeDeEntrega` en `packages/engine/src/tamano-entrega.ts:56` con 400 por defecto. Resuelto por búsqueda; no queda pregunta.
- «Tamaño previsto» y «cómo se parte» no existen como campo: el código no tiene ninguna línea del plan que los lleve. Es lo que este ticket crea (dos líneas nuevas de `## Plan` en la plantilla). Resuelto por diseño en el plan.
- Decidido por el PO el 2026-10-11 (respuesta por AskUserQuestion a la pregunta del análisis, vía el orquestador): «Detiene la compuerta (Recomendado)». La revisión previa de la compuerta de plan **detiene** la compuerta —hallazgo, sin llamar al evaluador— cuando el plan declara más líneas que `delivery-budget` sin decir si se parte o sigue. Un plan sin la línea de tamaño (tickets anteriores) sigue pasando.

## Descripción funcional

- Alcance: el plan de un ticket declara el tamaño previsto en líneas (producción y pruebas) y, si pasa el tope de entrega, si se parte en tickets dependientes o sigue con un motivo escrito. Lo piden la plantilla del ticket, la skill `planificacion` y la revisión previa de la compuerta de plan. No toca la medición de la entrega (cerrada en FEATURE-ENGINE-ENTREGA-TOPE-20261010) ni el tope de criterios.
- Usuario o rol afectado: el agente que escribe el plan, la compuerta de plan (revisión previa en código) y el PO que aprueba el plan con la decisión de partición dentro.
- Comportamiento actual: la skill dice en una frase que se declara el tamaño previsto y que un plan de más de unas 400 líneas se parte, con el número fijo y sin la opción de seguir con motivo; la plantilla no tiene dónde escribirlo y la revisión previa no lo mira. Un plan de 1 200 líneas llega a la compuerta sin declarar nada.
- Comportamiento esperado: la plantilla trae `- Tamaño previsto:` y `- Si excede el tope:`; la skill pide estimar contra `delivery-budget` y elegir partir o seguir con motivo; la revisión previa detiene la compuerta de plan cuando las líneas declaradas pasan el tope y la decisión falta.

## Diagnóstico

- Causa comprobada (con `ruta:línea`): no es un defecto, es un requisito nuevo (R-ENT-003) sin síntoma previo. Lo que falta, comprobado en el código: (1) la sección `## Plan` de la plantilla, `packages/core/src/template.ts:104-117`, solo trae «Gate de plan y aprobación», «Pasos ordenados», «Impactos declarados» y «Rollback (obligatorio)»: no hay línea de tamaño. (2) La skill, `.valmen/skills/planificacion/SKILL.md:90` (copia igual en `skills/planificacion/SKILL.md:90`), fija «unas 400 líneas» a mano, no nombra `delivery-budget` ni la opción de seguir con motivo. (3) `reviewBeforeGate` en `packages/engine/src/revision-previa.ts:270-359` revisa marcadores vacíos, Rollback, archivos citados, anotaciones, tope de criterios y pasos sin ruta, pero nada del tamaño; sus hallazgos posibles están en `packages/engine/src/revision-previa.ts:32-38`. (4) El tope ya existe y se lee en un solo lugar: `topeDeEntrega` en `packages/engine/src/tamano-entrega.ts:56`, con `TOPE_DE_ENTREGA_POR_DEFECTO` = 400 en `packages/engine/src/tamano-entrega.ts:12`; hoy solo lo usan la integración (`packages/engine/src/integration-commit.ts:346`, `packages/engine/src/worktree-integrar.ts:141`).
- Hipótesis pendientes: ninguna sobre el código. Sobre el diseño, la decisión de detener o informar queda en «Supuestos y decisiones pendientes».
- Consumidores afectados: las tres puertas que llaman a `reviewBeforeGate` —la compuerta (`packages/engine/src/gate.ts:775`, que no llama al evaluador si hay hallazgos), `valmen precheck` (`packages/cli/src/commands.ts:365`) y la herramienta MCP `revision_previa` (`packages/mcp/src/tools.ts:3410`)—; todo ticket creado con `TICKET_TEMPLATE` (`valmen create`, `crear_ticket`, la materialización de features en `packages/engine/src/materialize.ts:554`); la proyección de skills (`valmen sync`).
- Archivos y flujo investigados: `packages/core/src/template.ts`, `packages/engine/src/revision-previa.ts`, `packages/engine/src/tamano-entrega.ts`, `packages/engine/src/gate.ts`, `packages/cli/src/commands.ts`, `.valmen/skills/planificacion/SKILL.md`, `.valmen/skills/planificacion/referencias/contenido-del-plan.md`, `.valmen/config.yaml`, `packages/adapter/src/agents-size.ts` (presupuesto de skill de 6500 B), y las pruebas que fijan texto: `tests/plantilla-y-materializacion.test.ts:122-128`, `tests/skills-catalogo-tope.test.ts:230` (exige «unos 20 criterios»), `tests/skills-catalogo-tope.test.ts:406` (copias iguales en `skills/` y `.valmen/skills/`), `tests/plantillas-compactas.test.ts:291` (fija la versión 1.4.0 de `planificacion`), `tests/revision-previa.test.ts`. Memoria consultada (`valmen memory search`): AP-013 (cada « y » de un criterio cuenta como afirmación) y AP-012 (criterios atómicos); nada resuelto antes sobre el tamaño del plan.
- Riesgos y compatibilidad: (a) un ticket existente no tiene las líneas nuevas: la regla nueva solo mira un plan que declara el tamaño, así que los tickets previos y los fixtures (`bench/friccion/src/recorridos.ts`, `tests/helpers/fixtures.ts`) no ganan hallazgos. (b) Un ticket nuevo con la línea vacía da `marcador_vacio` en la compuerta de plan (mismo trato que cualquier línea de la plantilla); es intencional, pero las pruebas que crean un ticket con la plantilla y reemplazan líneas sueltas del plan podrían ponerse en rojo: se corren las que tocan plantilla y revisión previa antes de entregar. (c) La skill está a 6325 B contra el presupuesto de 6500 B: el cambio del párrafo debe quedar casi del mismo largo y el detalle va a la referencia `contenido-del-plan.md`. (d) La versión de la skill no se sube, porque `tests/plantillas-compactas.test.ts:291` la fija en 1.4.0. (e) Contar líneas desde texto libre es frágil: el formato se fija en la plantilla («N líneas») y una línea de tamaño sin número da su propio hallazgo en vez de pasar en silencio.
- Impactos de sync, migración, Docker o despliegue: ninguno (no toca sincronización de datos, migraciones, contenedores ni despliegue; `valmen sync` solo reproyecta la skill).

## Plan

- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan), el 2026-10-11 con «Aprobar tal cual (Recomendado)»; el REVIEW del recibo plan-1 (criterio_18 en 0,895) lo decidió el PO.
- Alcance: dos líneas nuevas en el `## Plan` de la plantilla, una regla nueva en la revisión previa de la compuerta de plan, el párrafo «Tamaño del plan» de la skill `planificacion`, una prueba nueva. Exclusiones: la medición de la entrega (`packages/engine/src/tamano-entrega.ts` se usa, no se cambia), el tope de criterios, el evaluador de la compuerta, la vista web.
- Tamaño previsto: unas 360 líneas (unas 90 de producción, unas 270 de pruebas), 19 criterios.
- Si excede el tope: no excede el tope de 400 (`delivery-budget`); no se parte.
- Pruebas existentes que el plan cambia a propósito: ninguna. Las que fijan texto tocado se corren como regresión (C19): `tests/plantilla-y-materializacion.test.ts:122-128`, `tests/skills-catalogo-tope.test.ts:230`, `tests/skills-catalogo-tope.test.ts:406`, `tests/plantillas-compactas.test.ts:291`, `tests/revision-previa.test.ts`.
- Pasos ordenados:
  1. Escribir primero `tests/plan-tamano.test.ts` (prueba nueva, siguiendo el patrón de `tests/revision-previa.test.ts`: `renderFixtureTicket`, `reviewBeforeGate`, `precheckCommand`, `runGate` con evaluador espía, `createTicket` en un laboratorio temporal con `.valmen/config.yaml` propio) con un caso por criterio C1–C18, correrla con `npx vitest run tests/plan-tamano.test.ts` y verla en rojo (C1–C18).
  2. En `packages/core/src/template.ts`, dentro de `## Plan` de `TICKET_TEMPLATE` (entre «Impactos declarados» y «Rollback (obligatorio)»), añadir `- Tamaño previsto:` con un comentario que pide «N líneas» de producción y pruebas más el número de criterios, seguido de `- Si excede el tope:` con un comentario que pide «se parte en <tickets dependientes>» o «sigue: <motivo>». Ninguna de las dos va a `ETIQUETAS_QUE_PUEDEN_QUEDAR_VACIAS`, así que vacías dan `marcador_vacio` por la regla existente (C1, C2, C3).
  3. En `packages/engine/src/revision-previa.ts`: ampliar `PreReviewFinding["id"]` con `tamano_sin_lineas` y `excede_el_tope_sin_decision`; añadir `lineasPrevistas(plan)` —lee el texto de la línea `- Tamaño previsto:` con su continuación (como `textoDelRollback`), toma el mayor «N líneas» (admite «1 200» y «1.200»), `null` sin línea, `NaN` sin número— y `decisionDeParticion(plan)` —texto de `- Si excede el tope:`, válido si nombra «se parte», «partir», «sigue» o «seguir» con al menos 15 caracteres—. En `reviewBeforeGate`, solo con `esPlan`: sin línea de tamaño no hace nada (C12); con línea sin número da `tamano_sin_lineas` (C11); si las líneas pasan `topeDeEntrega(input.root)` (importado de `./tamano-entrega.js`) sin decisión válida, da `excede_el_tope_sin_decision` con un mensaje que nombra las líneas declaradas, el tope, `delivery-budget` (C4, C5, C6, C7, C8, C9, C10). Al ser hallazgo, `valmen precheck plan` sale con 3 (`packages/cli/src/commands.ts:365`) y `runGate` no llama al evaluador (`packages/engine/src/gate.ts:775`), sin tocar esos archivos (C13, C14).
  4. En `.valmen/skills/planificacion/SKILL.md:90` reescribir el párrafo «Tamaño del plan»: se declara en `- Tamaño previsto:`; un plan de más de unos 20 criterios o de más líneas que `delivery-budget` se parte en tickets dependientes o sigue con motivo escrito en `- Si excede el tope:`, que la persona aprueba con el plan. Copiar idéntico a `skills/planificacion/SKILL.md`, conservar «unos 20 criterios», no subir `version` (1.4.0), quedar bajo 6500 B (C15, C16, C17). Regenerar la proyección con `node packages/cli/dist/main.js sync` tras `npm run build` (C18).
  5. Correr `npx vitest run tests/plan-tamano.test.ts` en verde, la regresión de C19, `npm run typecheck`, `npm run lint` (C1–C19).
- Impactos declarados: ninguno de sincronización, migración ni contenedores.
- Rollback (obligatorio): revertir el commit del ticket en su rama; la plantilla vuelve a cuatro líneas en `## Plan`, la revisión previa pierde los dos hallazgos, la skill vuelve al párrafo anterior. No hay datos persistidos que migrar: los tickets que ya tengan las líneas nuevas siguen validando porque una línea de más en `## Plan` no rompe el contrato.

## Criterios de aceptación

- [x] C1 (R-ENT-003): `TICKET_TEMPLATE` trae la línea `- Tamaño previsto:` en `## Plan`
      <!-- test: npx vitest run tests/plan-tamano.test.ts -->
- [x] C2 (R-ENT-003): `TICKET_TEMPLATE` trae la línea `- Si excede el tope:` en `## Plan`
      <!-- test: npx vitest run tests/plan-tamano.test.ts -->
- [x] C3: Un ticket recién creado con `createTicket` da `marcador_vacio` por `- Tamaño previsto:` en la revisión previa de la compuerta plan
      <!-- test: npx vitest run tests/plan-tamano.test.ts -->
- [x] C4 (R-ENT-003): Con 1 200 líneas previstas contra un tope de 400 sin decisión, `reviewBeforeGate` devuelve `excede_el_tope_sin_decision`
      <!-- test: npx vitest run tests/plan-tamano.test.ts -->
- [x] C5: El mensaje de `excede_el_tope_sin_decision` nombra las 1200 líneas junto al tope de 400
      <!-- test: npx vitest run tests/plan-tamano.test.ts -->
- [x] C6 (R-ENT-003): Con 1 200 líneas previstas, la decisión «se parte en dos tickets dependientes» deja la revisión sin hallazgos
      <!-- test: npx vitest run tests/plan-tamano.test.ts -->
- [x] C7 (R-ENT-003): Con 1 200 líneas previstas, la decisión «sigue: la migración no admite partirse» deja la revisión sin hallazgos
      <!-- test: npx vitest run tests/plan-tamano.test.ts -->
- [x] C8: Con 300 líneas previstas contra un tope de 400, la revisión no pide decisión de partición
      <!-- test: npx vitest run tests/plan-tamano.test.ts -->
- [x] C9: Con `delivery-budget: 1000` en la configuración, un plan de 900 líneas sin decisión pasa la revisión
      <!-- test: npx vitest run tests/plan-tamano.test.ts -->
- [x] C10: Sin `delivery-budget` en la configuración, un plan de 500 líneas sin decisión da `excede_el_tope_sin_decision`
      <!-- test: npx vitest run tests/plan-tamano.test.ts -->
- [x] C11: Una línea `- Tamaño previsto:` sin la forma «N líneas» da `tamano_sin_lineas`
      <!-- test: npx vitest run tests/plan-tamano.test.ts -->
- [x] C12: Un plan sin la línea `- Tamaño previsto:` no gana ningún hallazgo nuevo
      <!-- test: npx vitest run tests/plan-tamano.test.ts -->
- [x] C13: `precheckCommand` de la compuerta plan sale con código 3 ante `excede_el_tope_sin_decision`
      <!-- test: npx vitest run tests/plan-tamano.test.ts -->
- [x] C14: `runGate` de la compuerta plan no llama al evaluador ante `excede_el_tope_sin_decision`
      <!-- test: npx vitest run tests/plan-tamano.test.ts -->
- [x] C15: La skill `planificacion` nombra `delivery-budget`
      <!-- test: npx vitest run tests/plan-tamano.test.ts -->
- [x] C16: La skill `planificacion` nombra la opción de partir en tickets dependientes
      <!-- test: npx vitest run tests/plan-tamano.test.ts -->
- [x] C17: La skill `planificacion` nombra la opción de seguir con motivo escrito
      <!-- test: npx vitest run tests/plan-tamano.test.ts -->
- [x] C18: `valmen sync --check` queda sin diferencias tras el cambio de la skill
      <!-- test: node packages/cli/dist/main.js sync --check -->
- [x] C19: Las pruebas existentes de plantilla, revisión previa, catálogo de skills pasan sin editarse
      <!-- test: npx vitest run tests/plantilla-y-materializacion.test.ts tests/revision-previa.test.ts tests/skills-catalogo-tope.test.ts tests/plantillas-compactas.test.ts tests/gate-criterios-por-forma.test.ts tests/tope-criterios-precheck.test.ts -->

## Puntos

```json
[
  {
    "id": "POINT-001",
    "title": "Verificación delegada de FEATURE-ENGINE-PLAN-TAMANO-20261010",
    "status": "closed",
    "severity": "normal",
    "actual": "La implementación está entregada y falta verificar sus criterios.",
    "expected": "Los criterios del ticket se cumplen y sus pruebas dan el resultado esperado.",
    "evidence": [
      "EVIDENCE-001"
    ],
    "affected_files": [
      "packages/core/src/template.ts",
      "packages/engine/src/revision-previa.ts",
      "skills/planificacion/SKILL.md",
      "tests/plan-tamano.test.ts"
    ],
    "diagnosis": null,
    "solution": null,
    "tests": [],
    "qa_cycles": [
      "QA-001"
    ],
    "terminal_reason": null,
    "related_ticket": null
  }
]
```

## Implementación

Hecho según el plan aprobado, sin tocar pruebas existentes (EST-009) y con la prueba nueva vista en rojo antes (EST-010: 12 de 17 en rojo).

- `packages/core/src/template.ts`: `## Plan` de `TICKET_TEMPLATE` trae `- Tamaño previsto:` y `- Si excede el tope:` con su comentario, entre «Impactos declarados» y «Rollback (obligatorio)». Vacías dan `marcador_vacio` por la regla existente.
- `packages/engine/src/revision-previa.ts`: hallazgos `tamano_sin_lineas` y `excede_el_tope_sin_decision`; funciones privadas `textoDeLaLinea`, `lineasPrevistas` y `hayDecisionDeParticion`; el tope sale de `topeDeEntrega` (`delivery-budget`). Solo en la compuerta de plan y solo si el plan declara la línea de tamaño.
- `.valmen/skills/planificacion/SKILL.md` y `skills/planificacion/SKILL.md` (copia igual): párrafo «Tamaño del plan» reescrito; versión 1.4.0 intacta; proyección regenerada con `valmen sync` (6 500 B de presupuesto cumplido).
- `tests/plan-tamano.test.ts`: una prueba por criterio C1–C17; C18 y C19 se verifican con comandos.
- Nota: `node scripts/exports-sin-uso.mjs` marca tres exportaciones (`SYNC_BACKUP_DIR`, `EntregaDelParte`, `TOPE_DE_ENTREGA_POR_DEFECTO`) que ya estaban marcadas antes del cambio; este ticket no añade ninguna.

## Pruebas

Directorio: la raíz del repositorio (worktree del ticket). Requisitos: Node 24, `npm install` y `npm run build` hechos.

1. `npx vitest run tests/plan-tamano.test.ts` — esperado: 17 pruebas en verde (C1–C17).
2. `node packages/cli/dist/main.js sync --check` — esperado: «Archivos generados al día», código 0 (C18).
3. `npx vitest run tests/plantilla-y-materializacion.test.ts tests/revision-previa.test.ts tests/skills-catalogo-tope.test.ts tests/plantillas-compactas.test.ts tests/gate-criterios-por-forma.test.ts tests/tope-criterios-precheck.test.ts` — esperado: todo en verde, sin editar esas pruebas (C19).
4. `npx tsc --noEmit -p .`, `npx eslint` y `npx prettier --check` sobre los archivos tocados — esperado: sin salida de error.

Validaciones manuales: ninguna. Resultado observado: 280 pruebas en verde entre las tres primeras ejecuciones; `valmen secrets` sin hallazgos.

- Resultado del PO: necesito que todos los tickets que puedas cerrar tu ejecutando pruebas lo hagas. Las pruebas del ticket las ejecutó el agente y dieron el resultado esperado: Suite completa en main tras integrar: 265 archivos y 5112 pruebas en verde; sync --check y exports:check en 0; qa-mechanical approve

## QA

```json
[
  {
    "id": "QA-001",
    "date": "2026-10-11",
    "build_reference": "commit:9a46ac067198a184c7ff90872514ed91d6eb2a1e",
    "environment": "local",
    "result": "pending",
    "findings": [],
    "correction": null,
    "po_confirmation": null
  },
  {
    "id": "QA-002",
    "date": "2026-10-11",
    "build_reference": null,
    "environment": null,
    "result": "approved",
    "findings": [],
    "correction": null,
    "po_confirmation": "necesito que todos los tickets que puedas cerrar tu ejecutando pruebas lo hagas"
  }
]
```

## Evidencia

```json
[
  {
    "id": "EVIDENCE-001",
    "date": "2026-10-11",
    "kind": "automated-test",
    "description": "Suite completa en main tras integrar: 265 archivos y 5112 pruebas en verde; sync --check y exports:check en 0; qa-mechanical approve",
    "reference": "worktree:sha256:28ac6606340a2f1561ed14756655f52a1afe0531dbb147b3dccec98284d3c643",
    "point_id": "POINT-001"
  }
]
```

## Retests

```json
[
  {
    "id": "RETEST-001",
    "date": "2026-10-11",
    "point_id": "POINT-001",
    "result": "approved",
    "evidence": [],
    "po_confirmation": "necesito que todos los tickets que puedas cerrar tu ejecutando pruebas lo hagas"
  }
]
```

## Cierre

```json
[
  {
    "kind": "ticket-close",
    "id": "CLOSE-001",
    "date": "2026-10-11",
    "technical_summary": "El plan declara tamaño previsto y estrategia de partición; la revisión previa detiene la compuerta si excede delivery-budget; ver ## Implementación",
    "functional_summary": "Un plan que excede el tope sin decir si se parte no llega a la compuerta",
    "qa_status": "approved",
    "qa_waiver_reason": null,
    "po_confirmation": null,
    "release_impact": "Sin impacto en producción; herramientas del repositorio"
  }
]
```

## Consumo de IA

```json
[
  {
    "kind": "ai-usage",
    "date": "2026-10-11",
    "session_reference": null,
    "model": "claude-sonnet-5-5",
    "reasoning_effort": null,
    "notes": "Sesion de subagente de implementacion sin acceso a los agregados de tokens; sin numeros.",
    "input_tokens": null,
    "output_tokens": null,
    "total_tokens": null,
    "estimated_cost_usd": null,
    "source": "manual:subagente-implementacion",
    "confidence": "low",
    "id": "CONSUMO-001"
  },
  {
    "kind": "ai-usage",
    "date": "2026-10-11",
    "session_reference": "c2769fcf-63f8-4baf-a5d3-a4b9b7a976b8/agent-acc9938b3202e3f43",
    "model": "anthropic/claude-opus-5-5",
    "reasoning_effort": null,
    "notes": "Agente claude-code. 17 intervención(es) sobre el registro, 1 con fallo. 17 de 57 mensajes tocaron el registro. Subagente de la sesión c2769fcf-63f8-4baf-a5d3-a4b9b7a976b8; su gasto no está en la madre. Duró 31 min. La entrada incluye la creación de caché y la salida incluye el razonamiento. Caché leída 6256911 tokens. Sesión \"Sesión de Claude Code\". Costo: suscripción; no es cero, el origen no declara un costo por token. Se registran los tokens.",
    "input_tokens": 299266,
    "output_tokens": 28535,
    "total_tokens": 327801,
    "estimated_cost_usd": null,
    "source": "claude:c2769fcf-63f8-4baf-a5d3-a4b9b7a976b8/agent-acc9938b3202e3f43",
    "confidence": "high",
    "id": "CONSUMO-002"
  },
  {
    "kind": "ai-usage",
    "date": "2026-10-11",
    "session_reference": "c2769fcf-63f8-4baf-a5d3-a4b9b7a976b8/agent-a40c66a96c8a40cf0",
    "model": "anthropic/claude-sonnet-5-5",
    "reasoning_effort": null,
    "notes": "Agente claude-code. 13 intervención(es) sobre el registro, 0 con fallo. 13 de 30 mensajes tocaron el registro. Subagente de la sesión c2769fcf-63f8-4baf-a5d3-a4b9b7a976b8; su gasto no está en la madre. Duró 3 min. La entrada incluye la creación de caché y la salida incluye el razonamiento. Caché leída 2974785 tokens. Sesión \"Sesión de Claude Code\". Costo: suscripción; no es cero, el origen no declara un costo por token. Se registran los tokens.",
    "input_tokens": 121957,
    "output_tokens": 18025,
    "total_tokens": 139982,
    "estimated_cost_usd": null,
    "source": "claude:c2769fcf-63f8-4baf-a5d3-a4b9b7a976b8/agent-a40c66a96c8a40cf0",
    "confidence": "high",
    "id": "CONSUMO-003"
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
    "date": "2026-10-10",
    "at": "2026-10-10T21:47:34.533Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-11",
    "at": "2026-10-11T20:13:04.871Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-11",
    "at": "2026-10-11T20:37:07.385Z",
    "action": "gate-approved",
    "actor": "cli",
    "details": "Gate analysis aprobado por PO (recibo GR-20261011-FEATURE-ENGINE-PLAN-TAMANO-20261010-analysis-1, canal cli, decidida 2026-10-11T20:37:07.376Z): Aprobar el análisis (Recomendado)"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-11",
    "at": "2026-10-11T20:38:24.942Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-11",
    "at": "2026-10-11T20:43:04.816Z",
    "action": "gate-approved",
    "actor": "cli",
    "details": "Gate plan aprobado por PO (recibo GR-20261011-FEATURE-ENGINE-PLAN-TAMANO-20261010-plan-1, canal cli, decidida 2026-10-11T20:43:04.813Z): Aprobar tal cual (Recomendado)"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-11",
    "at": "2026-10-11T20:43:05.214Z",
    "action": "plan-approved",
    "actor": "cli",
    "details": "{\"actor\":\"PO\",\"source\":\"cli\",\"quote\":\"Aprobar tal cual (Recomendado)\",\"planHash\":\"sha256:aea2e87fff9fea77279f0f939b3d85be7a2e9006e62ece62fa29096100a8a3a9\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-11",
    "at": "2026-10-11T20:43:05.730Z",
    "action": "plan-approval-verified",
    "actor": "cli",
    "details": "Aprobación del plan vigente: PO (fuente cli), plan sha256:aea2e87fff9fea77279f0f939b3d85be7a2e9006e62ece62fa29096100a8a3a9."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-10-11",
    "at": "2026-10-11T20:43:05.730Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-10-11",
    "at": "2026-10-11T20:43:06.077Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-10-11",
    "at": "2026-10-11T20:46:24.841Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-10-11",
    "at": "2026-10-11T20:46:27.512Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-10-11",
    "at": "2026-10-11T20:47:28.513Z",
    "action": "delivery-size",
    "actor": "cli",
    "details": "{\"añadidas\":315,\"borradas\":2,\"total\":317,\"tope\":400,\"pasaElTope\":false,\"via\":\"worktree\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-10-11",
    "at": "2026-10-11T20:49:49.059Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-002."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-014",
    "date": "2026-10-11",
    "at": "2026-10-11T20:49:49.665Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-003."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-015",
    "date": "2026-10-11",
    "at": "2026-10-11T20:49:50.180Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-016",
    "date": "2026-10-11",
    "at": "2026-10-11T20:49:50.544Z",
    "action": "point-added",
    "actor": "cli",
    "details": "Se agregó POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-017",
    "date": "2026-10-11",
    "at": "2026-10-11T20:49:50.879Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-018",
    "date": "2026-10-11",
    "at": "2026-10-11T20:49:51.185Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-019",
    "date": "2026-10-11",
    "at": "2026-10-11T20:49:51.581Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-020",
    "date": "2026-10-11",
    "at": "2026-10-11T20:49:51.953Z",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-021",
    "date": "2026-10-11",
    "at": "2026-10-11T20:49:52.342Z",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-022",
    "date": "2026-10-11",
    "at": "2026-10-11T20:49:52.804Z",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-001 para POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-023",
    "date": "2026-10-11",
    "at": "2026-10-11T20:49:53.087Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: verified -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-024",
    "date": "2026-10-11",
    "at": "2026-10-11T20:49:53.294Z",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-025",
    "date": "2026-10-11",
    "at": "2026-10-11T20:49:53.496Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-026",
    "date": "2026-10-11",
    "at": "2026-10-11T20:49:53.683Z",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-027",
    "date": "2026-10-11",
    "at": "2026-10-11T20:49:53.880Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  }
]
```
