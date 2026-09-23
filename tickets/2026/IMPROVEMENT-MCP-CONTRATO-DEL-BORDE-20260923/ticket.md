---
schema_version: 2
id: IMPROVEMENT-MCP-CONTRATO-DEL-BORDE-20260923
title: El contrato del borde del MCP, lo que declara y lo que devuelve
type: IMPROVEMENT
module: MCP
workflow_status: analyzed
qa_status: pending
release_status: unreleased
user_visible: false
sync_impact: false
migration_impact: false
docker_impact: false
risk_level: normal
created: 2026-09-23
updated: 2026-09-23
related_ticket: null
target_release: null
released_in: null
---

# IMPROVEMENT-MCP-CONTRATO-DEL-BORDE-20260923

## Solicitud original

vamos a realizar la implementación con el orden que me indicaste, lo único es que no quiero aún incluir nada de Hermes, vamos con todo menos con eso por ahora

Este ticket es el **paso 1** de ese orden —el「Bloque 0», las correcciones del borde— y se
justifica solo: la puerta por la que entra todo lo demás está mal declarada, y ensancharla
antes de arreglarla deja el defecto dentro. Los pasos siguientes (exponer el ciclo de
anotado, las skills como *prompts*, features y procesos, y la memoria) van en tickets
propios, en ese orden.

## Descripción funcional

- Alcance: el **contrato que ve un cliente MCP** —los esquemas de entrada de las ocho
  herramientas, lo que devuelven y lo que anuncia la autocomprobación—. No cambia ninguna
  función del motor ni el registro: `@valmen/engine` y `@valmen/cli` se siguen llamando
  exactamente igual.
- Usuario o rol afectado: el agente (opencode, codex, Claude Code) que llama a las
  herramientas, y quien tiene que diagnosticar un servidor que «no aparece».
- Comportamiento actual: las ocho herramientas declaran `additionalProperties: false` y
  **ninguna declara `root`**, aunque `main.ts` lo lee y `docs/02-MOTOR.md` §10 lo promete.
  Todas devuelven únicamente texto. `valmen-mcp --check` dice cuántas herramientas hay y sus
  títulos, pero no qué necesita cada una.
- Comportamiento esperado: `root` declarado y **opcional** en las ocho; las herramientas
  cuya fuente ya es un dato canónico devuelven además `structuredContent` con su
  `outputSchema`, con el criterio de cuándo lo hacen escrito y aplicado por el código;
  `--check` dice de cada herramienta qué argumentos exige.

## Diagnóstico

- Archivos y flujo investigados: `packages/mcp/src/tools.ts` (catálogo `TOOLS` y
  `callTool`), `packages/mcp/src/protocol.ts` (`ToolDefinition`, `ToolResult`,
  `initialize`, `tools/call`), `packages/mcp/src/main.ts` (`contextoConRoot`, `describe`),
  `tests/mcp-server.test.ts` (línea 150), `docs/02-MOTOR.md` §10,
  `packages/engine/src/receipts.ts` (el recibo como artefacto canónico) y
  `packages/server/src/tickets.ts` (`TicketRow`, `filterTickets`, para saber qué forma
  tendría un resultado estructurado y de dónde saldría).
- Causa raíz o hipótesis: el catálogo se escribió antes de que existiera `contextoConRoot`.
  El `root` se resolvió en el arranque —que es el sitio correcto, porque la raíz es del
  proceso y no de la llamada— y nadie volvió a los esquemas. El test que debía impedirlo se
  llama «declara `root` opcional en todas» pero su cuerpo solo comprueba
  `additionalProperties`: **el nombre afirmaba más de lo que el test hacía**, y por eso pasó
  en verde durante toda la construcción del servidor. Con `structuredContent` pasó lo
  simétrico: el protocolo se escribió con las tres llamadas mínimas y no con las
  capacidades de la versión `2025-06-18` que ya se anuncia en `initialize`.
- Riesgos y compatibilidad: `structuredContent` **no es gratis**. Las herramientas llaman a
  `@valmen/cli` a propósito —regla 1 del archivo: no hay una segunda implementación de
  nada— y devuelven su texto; construir un JSON paralelo sería una segunda representación
  que puede desincronizarse de ese texto. La mitigación es de criterio, no de código: solo
  se declara `outputSchema` donde la fuente **ya es un dato canónico en disco** —el recibo
  que el motor acaba de escribir en `.valmen/receipts/`, el frontmatter del ticket— y no
  donde habría que inventar una proyección del texto. Declarar `root` es aditivo y opcional
  (fuera de `required`), así que no rompe a ningún cliente actual ni a los tests que hoy
  comparan `resultado.text`.
- Impactos de sync, migración, Docker o despliegue: ninguno. No se toca `valmen sync`, ni el
  esquema del registro, ni contenedores, ni el despliegue. `sync_impact: false`,
  `migration_impact: false`, `docker_impact: false`.

## Plan

- Gate de plan y aprobación: **pendiente.** El plan está escrito y a la espera de la
  aprobación explícita del responsable. Hasta que esa frase esté escrita aquí, el motor
  rechaza la transición a `approved`, y hace bien: este paso define el contrato que usan
  todos los agentes.
- Pasos ordenados:
  1. `packages/mcp/src/tools.ts`: declarar `root` (opcional, fuera de `required`) en los
     ocho `inputSchema`, con **un solo texto de descripción compartido** en vez de repetirlo
     ocho veces, para que no se desincronicen entre sí.
  2. `packages/mcp/src/protocol.ts`: extender `ToolDefinition` con `outputSchema?` y
     `ToolResult` con `data?`, y emitir `structuredContent` en `tools/call` **solo** cuando
     hay `data`, conservando el bloque `content` con el texto. `capabilities.tools` no
     cambia: el catálogo sigue siendo fijo.
  3. `packages/mcp/src/tools.ts`: aplicar el criterio en las dos herramientas donde la
     fuente ya es un dato —`evaluar_compuerta` (el recibo recién escrito) y `ver_ticket`
     (el frontmatter)— y dejar las demás devolviendo texto, con el porqué escrito en el
     archivo para que la próxima herramienta no lo decida por costumbre.
  4. `packages/mcp/src/main.ts`: `describe()` lista cada herramienta con sus argumentos
     obligatorios, para que el primer fallo —«la herramienta no existe»— se diagnostique sin
     adivinar.
  5. `tests/mcp-server.test.ts`: el test de la línea 150 pasa a comprobar
     `properties.root` de verdad; tests nuevos para `structuredContent` presente y ausente,
     para que `root` no sea obligatorio, y para la salida de `--check`.
  6. `docs/02-MOTOR.md` §10 y `packages/mcp/README.md`: escribir el criterio de cuándo hay
     `outputSchema`, que es lo que impide que el punto 3 se convierta en excepción.
- Rollback: revertir el commit. Nada de esto cambia el comportamiento de una herramienta,
  solo lo que declara y lo que acompaña al texto; ningún dato del registro depende de ello y
  no hay migración que deshacer.

## Criterios de aceptación

- [ ] Los ocho esquemas declaran `root`, y un test lo comprueba leyendo `properties.root` de cada uno.
- [ ] `root` no aparece en el `required` de ninguna herramienta.
- [ ] `evaluar_compuerta` y `ver_ticket` devuelven `structuredContent` que valida contra su `outputSchema`, y su bloque de texto sigue siendo el mismo de antes.
- [ ] Una herramienta sin `outputSchema` no devuelve `structuredContent`.
- [ ] `valmen-mcp --check` nombra, por herramienta, los argumentos obligatorios.
- [ ] El criterio de cuándo hay `outputSchema` está escrito en `docs/02-MOTOR.md` §10 y en `packages/mcp/README.md`.

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
    "date": "2026-09-23",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-09-23",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  }
]
```
