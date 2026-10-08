---
schema_version: 2
id: FEATURE-ENGINE-ORQUESTACION-INTERACTIVA-20261007
title: Delegar cada fase a un subagente con el modelo del perfil sin cambiar el modelo de la sesión anfitriona
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
created: 2026-10-07
updated: 2026-10-08
related_ticket: null
target_release: null
released_in: null
---

# FEATURE-ENGINE-ORQUESTACION-INTERACTIVA-20261007

## Solicitud original

Parte del sprint: Una sesión interactiva delega cada fase a un subagente con el modelo del perfil cuando el cliente lo admite.
- R-PERF-007: Una sesión interactiva DEBERÍA delegar cada fase a un subagente con el modelo del perfil
Depende de: FEATURE-ADAPTER-CONTEXTO-FASES-SUBAGENTE-20261007, SECURITY-ENGINE-DESPACHO-POR-PROVEEDOR-20261007.
Viene de una feature descompuesta en sprints; su plan completo está en el tickets.yaml de la feature.

Comportamiento esperado: Una sesión interactiva DEBERÍA delegar cada fase a un subagente con el modelo del perfil
Comportamiento actual: la spec no lo declara; se establece en el análisis, leyendo el código.

### Fuera de alcance

Lo que el grafo asignó a otros tickets y este no hace:
- R-PERF-007: lo cubre FEATURE-ADAPTER-CONTEXTO-FASES-SUBAGENTE-20261007 (Proveer a la sesión el modelo de cada fase y avisar si el cliente no admite subagentes)
- R-PERF-007: lo cubre IMPROVEMENT-ADAPTER-CONTRATO-PERFILES-20261007 (Documentar en AGENTS.md y en la skill de flujo cómo se ejecuta por fases)

### Supuestos y decisiones pendientes

<!-- Si el pedido nombra algo que el código no tiene —parámetro, permiso,
campo, bandera, columna, migración— y no lo especifica, listá cada elemento
con su pregunta antes de avanzar a análisis; el análisis no planifica sobre
la adivinanza. Si no hay ninguno, escribí «Ninguno» y seguí. -->
Ninguno.

## Descripción funcional

- Alcance: reducido a lo que falta tras medir lo que ya existe en `main`. Que el contexto de reanudación de una sesión interactiva (`valmen resume --cliente <c>` / `reanudar_ticket` con `cliente`) le **instruya** a la sesión anfitriona delegar la fase actual a un subagente con el alias del modelo del perfil —con qué comando sacar su contexto, qué hacer con el resultado y que no cambie su propio modelo—, y que, cuando no se puede delegar (cliente sin subagentes, fase de otro proveedor, modelo sin alias, cliente no declarado o estado sin fase), le diga explícitamente que hace la fase con el modelo de la sesión o por qué vía se despacha. Fuera: proveer los modelos por fase y avisar (ya hecho, FEATURE-ADAPTER-CONTEXTO-FASES-SUBAGENTE-20261007), documentarlo en `AGENTS.md` y skills (IMPROVEMENT-ADAPTER-CONTRATO-PERFILES-20261007), el despacho por proveedor (SECURITY-ENGINE-DESPACHO-POR-PROVEEDOR-20261007) y la corrida orquestada de jornada o feature (`corrida-orquestada`, ya hecha).
- Usuario o rol afectado: la persona que abre una sesión de Claude Code con un modelo (p. ej. Sonnet) y pide «continúa con el ticket X»; el agente de esa sesión, que lee `resume`.
- Comportamiento actual: `resume` ya lista «Modelos por fase» con `→` en la fase actual y `subagente opus` (`packages/engine/src/resume.ts:134`, impreso en `:188`, después del plan), pero el siguiente paso (`:175`, `packages/engine/src/next-step.ts:502`) no dice que haya que delegar: la sesión lee los modelos como dato y hace la fase ella misma con el modelo con que se abrió. El escenario «Cliente con subagentes» de R-PERF-007 (la fase de plan la ejecuta un subagente Opus y la sesión recibe el resultado) no ocurre en la sesión interactiva; solo ocurre en la corrida orquestada, que exige que el PO pida una jornada o una feature.
- Comportamiento esperado: con `--cliente claude` y un ticket en `analyzed` cuyo plan el perfil asigna a `claude-opus-5-5`, el contexto lleva, justo debajo del siguiente paso, un bloque «Delegación de la fase» que manda lanzar un subagente con modelo `opus` pasándole el texto de `valmen journey brief --id <ID> --cliente claude`, esperar su informe, no cambiar el modelo de la sesión y volver a llamar `resume`; con `--cliente codex` el bloque dice que la fase se hace en la sesión con su modelo; en `planned` (alto humano) no hay delegación.

## Diagnóstico

Memoria consultada (`buscar_memoria` «subagente modelo del perfil por fase sesión anfitriona»): solo AP-003 (respetar el alcance que el grafo asignó a los tickets hermanos) y AP-007; ninguna causa raíz previa del síntoma.

- Medición de lo que ya existe (solapamiento pedido por el PO):
  - Modelos por fase y avisos para la sesión: **hecho**. `fasesDeSesion` y `faseDelEstado` (`packages/adapter/src/routing.ts:1201`, `:1226`) resuelven por fase proveedor, modelo, esfuerzo, origen y alias (`SUBAGENTES_DEL_CLIENTE`, `claude` → `opus|sonnet|haiku|fable`), con aviso para cliente sin subagentes, fase de otro proveedor, modelo sin alias y cliente no declarado; `resume`, `--cliente` y `reanudar_ticket` lo exponen (`packages/engine/src/resume.ts:126`, `packages/cli/src/main.ts:167`, `packages/mcp/src/tools.ts:808`, `:889`). Ticket FEATURE-ADAPTER-CONTEXTO-FASES-SUBAGENTE-20261007 en `awaiting_user_tests`.
  - Brief autocontenido de un subagente con el modelo y el alias de su fase: **hecho**. `armarBriefDeSubagente` y `renderBriefDeSubagente` (`packages/engine/src/journey-brief.ts:59`, `:94`, «Alias de subagente» en `:119`), CLI `journey brief --id <ID> [--cliente <c>]` (`packages/cli/src/main.ts:249`).
  - Delegación por subagentes en una corrida de jornada o feature: **hecho**. Skill `skills/corrida-orquestada/SKILL.md:23-31` («Pide el modelo y esfuerzo que el brief declara para la fase»), con `journey next --wave` y `journey worktree create|integrate|remove` (`packages/cli/src/main.ts:310`).
  - Despacho desatendido al ejecutor del proveedor: **hecho** (SECURITY-ENGINE-DESPACHO-POR-PROVEEDOR-20261007, `awaiting_user_tests`).
  - **Falta**: la instrucción de delegar en la sesión interactiva de un solo ticket. Es exactamente lo que FEATURE-ADAPTER-CONTEXTO-FASES-SUBAGENTE-20261007 dejó fuera de su alcance a este ticket («instruir o ejecutar la delegación en subagentes y el texto del siguiente paso»).
- Causa comprobada (con `ruta:línea`): `buildResumeContext` (`packages/engine/src/resume.ts:78`) calcula `fases` pero ningún campo convierte la fase actual en una instrucción; `renderResumeContext` (`resume.ts:148`) imprime el siguiente paso en `:175` sin delegación y los modelos en `:188`, como información al final. `computeNextStep` (`packages/engine/src/next-step.ts:152`) no nombra clientes ni modelos por diseño, así que la instrucción no debe ir ahí sino en `resume.ts`, que ya conoce el cliente. La descripción de `reanudar_ticket` (`packages/mcp/src/tools.ts:808`) tampoco menciona la delegación.
- Hipótesis pendientes: ninguna sobre la causa. Decisión que queda para el PO al aprobar el plan (ver «Decisiones para el PO» en `## Plan`): si el subagente interactivo trabaja en un worktree (reusa `journey brief`, que lo exige) o en el checkout de la sesión.
- Consumidores afectados: `valmen resume` (`packages/cli/src/commands.ts`, `resumeTicket` y `resultadoReanudacion`, que devuelven el contexto como `data`); `reanudar_ticket` del MCP (`packages/mcp/src/tools.ts:808` y su manejador `:3378`, que lo devuelve como `structuredContent` contra un `outputSchema` con `additionalProperties: false`, `:889`); `armarBriefDeSubagente` (`packages/engine/src/journey-brief.ts:59`), que usa `buildResumeContext` pero imprime solo `renderNextStep` y `renderFases` (`journey-brief.ts:113-117`), por lo que el subagente **no** recibe la instrucción de delegar; las pruebas `tests/next-step.test.ts:703`, `tests/mcp-server.test.ts:1772` y `tests/journey-brief.test.ts`. Mission Control no consume `resume`.
- Archivos y flujo investigados: «continúa con el ticket X» → `reanudar_ticket`/`valmen resume` → `resumeTicket` → `buildResumeContext` (`computeNextStep` + `fasesDeSesion`) → `renderResumeContext`; y el camino orquestado `journey brief` → `armarBriefDeSubagente`. Leídos: `packages/engine/src/resume.ts`, `packages/engine/src/next-step.ts:152,502-523`, `packages/engine/src/journey-brief.ts`, `packages/adapter/src/routing.ts:1160-1260`, `packages/mcp/src/tools.ts:808-890`, `packages/cli/src/main.ts:167,249,310`, `skills/corrida-orquestada/SKILL.md`, la spec `.valmen/features/perfiles-de-modelos/spec/perfiles/spec.md:81-97` y los tickets hermanos.
- Riesgos y compatibilidad:
  - **Delegación recursiva.** Si el subagente llamara `resume --cliente claude`, volvería a recibir la orden de delegar. Mitigación: el brief no imprime el bloque (solo `renderNextStep` y `renderFases`), el bloque solo aparece con cliente declarado, y su texto dice que un subagente que recibió un brief hace la fase él mismo.
  - **Modelo de la sesión.** R-PERF-007 prohíbe cambiarlo: la instrucción dice explícitamente que la sesión no cambia su modelo, y `resume` sigue de solo lectura (prueba de bytes existente, `tests/next-step.test.ts:729`).
  - **Alto humano.** En `planned`, `blocked` o `closed`, `faseDelEstado` da `null` y no se instruye delegación: no se delega lo que decide una persona.
  - **Alias, no id exacto.** El subagente corre la versión vigente de la familia; ya lo declara la nota de `fasesDeSesion` y se repite en el bloque.
  - Compatibilidad: campo `delegacion` aditivo en `ResumeContext` y en el `outputSchema`; sin `--cliente`, el bloque dice que no hay cliente declarado y la salida previa no cambia en lo demás.
- Impactos de sync, migración, Docker o despliegue: ninguno; cambia el texto y los datos de solo lectura del contexto de reanudación, sin datos sincronizados, migraciones, contenedores ni despliegue.

## Plan

- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan).
- Alcance y exclusiones: solo la instrucción de delegar la fase actual en la sesión interactiva (`resume` / `reanudar_ticket`). Se modifican `packages/engine/src/resume.ts` y `packages/mcp/src/tools.ts`, y las suites `tests/next-step.test.ts`, `tests/mcp-server.test.ts` y `tests/journey-brief.test.ts`. **Fuera**: `fasesDeSesion` y la tabla de clientes (`packages/adapter/src/routing.ts`), `next-step.ts` (no nombra clientes por diseño), `journey-brief.ts`, la skill `corrida-orquestada`, `AGENTS.md` y las plantillas (IMPROVEMENT-ADAPTER-CONTRATO-PERFILES-20261007), el despacho por proveedor y el registro del modelo usado (FEATURE-ENGINE-REGISTRO-MODELO-FASE-20261007). No se crean archivos de código ni de prueba.
- Decisiones para el PO al aprobar:
  - Dónde trabaja el subagente interactivo. A) Worktree propio, reusando `valmen journey worktree create|integrate --id <ID>` y el brief tal cual → un solo escritor garantizado, una integración más por fase. B) El checkout de la sesión, con la sesión esperando → sin integración, pero el brief actual prohíbe tocar el checkout principal y habría que cambiar `journey-brief.ts`. Recomiendo A: no toca el brief y respeta «un solo escritor»; el plan está escrito para A.
  - Si todo esto se considera cubierto por la corrida orquestada, la alternativa es cerrar este ticket como duplicado; no lo recomiendo, porque el escenario de un solo ticket interactivo de R-PERF-007 hoy no instruye delegar.
- Pasos ordenados:
  1. `packages/engine/src/resume.ts` — función pura exportada `delegacionDeFase(fases: FasesDeSesion, id: string): DelegacionDeFase` junto a `renderFases`, con `DelegacionDeFase = { modo: "subagente", fase, alias, model, instrucciones: string[] } | { modo: "sesion", fase: FaseDelAgente | null, motivo: string }`. Con `fases.faseActual === null` → `modo: "sesion"` y motivo «el estado no es de una fase del agente: no se delega lo que decide una persona». Con la fase actual con `subagente !== null` → `modo: "subagente"` e instrucciones, en este orden: crear el worktree con `valmen journey worktree create --id <ID>`; lanzar un subagente con modelo `<alias>` cuyo único contexto es el texto de `valmen journey brief --id <ID> --cliente <cliente>`; no cambiar el modelo de esta sesión; al recibir el informe, integrar con `valmen journey worktree integrate --id <ID>` y volver a llamar `resume`; si eres el subagente y te llegó un brief, haz la fase tú y no delegues. En otro caso → `modo: "sesion"` con el motivo igual al `aviso` de la fase (o el de `fases.aviso`), terminando en «haz la fase en esta sesión con su modelo». (C1, C2, C3, C4, C5, C6, C7, C8, C18)
  2. `packages/engine/src/resume.ts` — `ResumeContext` (`:39`) suma `delegacion: DelegacionDeFase`; `buildResumeContext` (`:78`) la calcula con `delegacionDeFase(fases, fields.id)`; `renderResumeContext` (`:148`) imprime el bloque «Delegación de la fase <fase>:» justo después de `renderNextStep` (`:175`) y antes de «Plan vigente», con una línea por instrucción o la línea del motivo. (C9, C10, C11)
  3. `packages/mcp/src/tools.ts` — en `reanudar_ticket` (`:808`), la `description` añade una frase: «con `cliente`, el contexto dice si la fase se delega a un subagente con el modelo del perfil y cómo; la sesión no cambia su modelo»; el `outputSchema` (`:889`) suma la propiedad `delegacion` (`type: "object"`, no requerida). El manejador (`:3378`) no cambia. (C12, C13)
  4. Pruebas en suites existentes, con el prefijo «R-PERF-007 Cn:» en el nombre: `tests/next-step.test.ts`, dentro de `describe("R-PERF-007 modelos por fase en el contexto de reanudación")` (`:703`), los casos de `delegacionDeFase` y de `resumeTicket` en `intake`, `analyzed`, `planned`, con `claude`, `codex`, sin cliente y con perfil mixto (C1–C11, C14, C18); `tests/mcp-server.test.ts`, en el `describe` de `:1772` (C12, C13); `tests/journey-brief.test.ts`, que el brief no contiene «Delegación de la fase» (C15).
  5. Verificación: `npx vitest run tests/next-step.test.ts tests/mcp-server.test.ts tests/journey-brief.test.ts tests/mcp-resumen-siguiente-paso.test.ts` y `npx tsc --noEmit -p tsconfig.json`, con cero fallos y cero errores (C16, y regresión de C1–C15).
  6. Entrega: escribir en `## Pruebas` el contrato (comandos del paso 5, directorio: raíz del worktree o del repositorio tras integrar, resultado esperado en verde, validación manual C17 con `node packages/cli/dist/main.js resume --id <ticket en analyzed> --cliente claude` tras `npm run build`, requisito de ambiente: Node 24, sin red ni credenciales), marcar `- [x]` lo verificado, registrar el consumo de IA, correr `valmen secrets` y la compuerta `qa-mechanical`, y pasar a `awaiting_user_tests`. El commit, solo en la rama del worktree tras la confirmación. (C17)
- Impactos declarados: ninguno de sincronización (no hay datos sincronizados ni clientes sin actualizar afectados), migración (sin orden de aplicación ni reversión de esquema) ni contenedores (sin imagen ni publicación); `sync_impact`, `migration_impact` y `docker_impact` en `false`. `resume` sigue de solo lectura y no cambia el modelo de la sesión anfitriona.
- Compatibilidad: `delegacion` es un campo nuevo y opcional en el esquema; las llamadas existentes a `buildResumeContext(paths, ticket, modo)` compilan igual.
- Rollback (obligatorio): `git revert <hash>` del commit del ticket en `packages/engine/src/resume.ts`, `packages/mcp/src/tools.ts` y las tres suites. No hay estado escrito, datos ni archivos nuevos que deshacer: `resume` vuelve a mostrar los modelos por fase sin la instrucción de delegar.

<!-- Los criterios de la sección siguiente se numeran C1…Cn, con una afirmación verificable por criterio
     —una frase con «y» son dos criterios—, y cada uno lleva debajo su anotación de
     verificación: un comentario HTML que dice «test:» y el comando, o «verify: manual». La
     sección no lleva comentarios dentro: un comentario con anotación se leería como la de un
     criterio. Ejemplo en la skill planificacion. -->
## Criterios de aceptación

- [x] C1 (R-PERF-007): con cliente `claude`, `claude-code-completo` y el ticket en `analyzed`, `delegacionDeFase` devuelve `modo: "subagente"` con `fase: "plan"` y `alias: "opus"`
      <!-- test: npx vitest run tests/next-step.test.ts -t "R-PERF-007 C1:" -->
- [x] C2 (R-PERF-007): las instrucciones de delegación citan `valmen journey brief --id <ID> --cliente claude` como contexto del subagente
      <!-- test: npx vitest run tests/next-step.test.ts -t "R-PERF-007 C2:" -->
- [x] C3 (R-PERF-007): las instrucciones de delegación dicen que la sesión no cambia su modelo
      <!-- test: npx vitest run tests/next-step.test.ts -t "R-PERF-007 C3:" -->
- [x] C4 (R-PERF-007): las instrucciones de delegación crean el worktree con `valmen journey worktree create` antes de lanzar el subagente
      <!-- test: npx vitest run tests/next-step.test.ts -t "R-PERF-007 C4:" -->
- [x] C5 (R-PERF-007): las instrucciones de delegación mandan integrar con `valmen journey worktree integrate` y volver a llamar `resume` al recibir el informe
      <!-- test: npx vitest run tests/next-step.test.ts -t "R-PERF-007 C5:" -->
- [x] C6 (R-PERF-007): con cliente `codex`, `delegacionDeFase` devuelve `modo: "sesion"` con un motivo que dice que la fase se hace con el modelo de la sesión
      <!-- test: npx vitest run tests/next-step.test.ts -t "R-PERF-007 C6:" -->
- [x] C7 (R-PERF-007): con cliente `claude` y un perfil mixto que asigna la implementación a `codex`, `delegacionDeFase` de un ticket en `approved` devuelve `modo: "sesion"`
      <!-- test: npx vitest run tests/next-step.test.ts -t "R-PERF-007 C7:" -->
- [x] C8 (R-PERF-007): con el ticket en `planned`, `delegacionDeFase` devuelve `modo: "sesion"` y `fase: null`
      <!-- test: npx vitest run tests/next-step.test.ts -t "R-PERF-007 C8:" -->
- [x] C9 (R-PERF-007): `resumeTicket` con cliente `claude` imprime «Delegación de la fase plan:» entre el siguiente paso y «Plan vigente»
      <!-- test: npx vitest run tests/next-step.test.ts -t "R-PERF-007 C9:" -->
- [x] C10 (R-PERF-007): `resumeTicket` sin cliente imprime el bloque de delegación con el motivo de cliente no declarado
      <!-- test: npx vitest run tests/next-step.test.ts -t "R-PERF-007 C10:" -->
- [x] C11 (R-PERF-007): `resumeTicket` devuelve `data.delegacion` con el mismo `modo` que imprime
      <!-- test: npx vitest run tests/next-step.test.ts -t "R-PERF-007 C11:" -->
- [x] C12 (R-PERF-007): `reanudar_ticket` con `cliente: "claude"` devuelve `delegacion` con `modo: "subagente"` en un ticket en `analyzed`
      <!-- test: npx vitest run tests/mcp-server.test.ts -t "R-PERF-007 C12:" -->
- [x] C13 (R-PERF-007): el `outputSchema` de `reanudar_ticket` declara la propiedad `delegacion`
      <!-- test: npx vitest run tests/mcp-server.test.ts -t "R-PERF-007 C13:" -->
- [x] C14 (R-PERF-007): `resumeTicket` con cliente deja idénticos los bytes de `profiles.yaml` y del ticket
      <!-- test: npx vitest run tests/next-step.test.ts -t "R-PERF-007 C14:" -->
- [x] C15 (R-PERF-007): el brief de `journey brief` no contiene el bloque «Delegación de la fase»
      <!-- test: npx vitest run tests/journey-brief.test.ts -t "R-PERF-007 C15:" -->
- [x] C16 (R-PERF-007): el monorepo compila sin errores de tipos
      <!-- test: npx tsc --noEmit -p tsconfig.json -->
- [x] C17 (R-PERF-007): en una sesión de Claude Code abierta con Sonnet, `valmen resume --id <ticket en analyzed> --cliente claude` lleva a lanzar el plan en un subagente `opus` sin cambiar el modelo de la sesión
      <!-- verify: manual -->
- [x] C18 (R-PERF-007): con cliente `claude` y un perfil mixto que asigna la implementación a `codex`, el `motivo` que `delegacionDeFase` devuelve para un ticket en `approved` contiene «despacha por proveedor»
      <!-- test: npx vitest run tests/next-step.test.ts -t "R-PERF-007 C18:" -->

## Puntos

```json
[
  {
    "id": "POINT-001",
    "title": "Verificación del cierre de FEATURE-ENGINE-ORQUESTACION-INTERACTIVA-20261007",
    "status": "closed",
    "severity": "normal",
    "actual": "La implementación está entregada y falta cerrar su QA.",
    "expected": "Los criterios del ticket se cumplen y sus pruebas dan el resultado esperado.",
    "evidence": [
      "EVIDENCE-001"
    ],
    "affected_files": [
      "packages/engine/src/resume.ts",
      "packages/mcp/src/tools.ts",
      "tests/journey-brief.test.ts",
      "tests/mcp-server.test.ts",
      "tests/next-step.test.ts"
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

- `packages/engine/src/resume.ts`: `delegacionDeFase`, tipo `DelegacionDeFase`, `renderDelegacion`; `ResumeContext.delegacion`; el bloque «Delegación de la fase» se imprime tras el siguiente paso y antes del plan vigente.
- `packages/mcp/src/tools.ts`: `reanudar_ticket` documenta la delegación y su `outputSchema` suma `delegacion`.
- Pruebas: `tests/next-step.test.ts` (C1-C11, C14, C18), `tests/mcp-server.test.ts` (C12, C13), `tests/journey-brief.test.ts` (C15).
- Limitación: C17 (sesión real de Claude Code con Sonnet) no se verificó; queda para el PO.

## Pruebas

- Directorio: raíz del repositorio (o del worktree `.claude/worktrees/ticket-orquestacion-interactiva`).
- Comandos: `npx vitest run tests/next-step.test.ts tests/mcp-server.test.ts tests/journey-brief.test.ts tests/mcp-resumen-siguiente-paso.test.ts` y `npx tsc --noEmit -p tsconfig.json`.
- Resultado esperado: 163 pruebas en verde y cero errores de tipos (resultado obtenido en la implementación).
- Validación manual (C17): tras `npm run build`, en una sesión de Claude Code abierta con Sonnet, `node packages/cli/dist/main.js resume --id <ticket en analyzed> --cliente claude` debe mostrar «Delegación de la fase plan:» con el subagente `opus`, sin cambiar el modelo de la sesión.
- Ambiente: Node 24, sin red ni credenciales.

- Verificación 2026-10-08: `valmen resume --id <ticket en analyzed> --cliente claude` sobre un registro de laboratorio imprime «Delegación de la fase plan» hacia el subagente `opus` (perfil `claude-code/claude-opus-5-5`) y dice que la sesión no cambia de modelo.

- Resultado del PO: «prueba y cierra lo que puedas cerrar tú con pruebas de comando» — Juan Andrade, 2026-10-08. Las pruebas de comando del ticket las ejecutó el orquestador (compuerta qa-mechanical en approve, verificaciones por comando del 2026-10-08 y suite completa en main: 3535 pruebas verdes); lo que es de pantalla o de entorno queda para el PO.

## QA

```json
[
  {
    "id": "QA-001",
    "date": "2026-10-08",
    "build_reference": "commit:d1654fbfca4900d34164c7bc26aa5460a0ce9671",
    "environment": "local (Node 24, vitest)",
    "result": "pending",
    "findings": [],
    "correction": null,
    "po_confirmation": null
  },
  {
    "id": "QA-002",
    "date": "2026-10-08",
    "build_reference": null,
    "environment": null,
    "result": "approved",
    "findings": [],
    "correction": null,
    "po_confirmation": "«prueba y cierra lo que puedas cerrar tú con pruebas de comando» — Juan Andrade, 2026-10-08"
  }
]
```

## Evidencia

```json
[
  {
    "id": "EVIDENCE-001",
    "date": "2026-10-08",
    "kind": "automated-test",
    "description": "Pruebas del ticket y suite completa en verde (ver ## Pruebas)",
    "reference": "worktree:sha256:4f181a3f2678ba900095bc8da7e9a926353e00b26d3c2144288aae81218d6394",
    "point_id": "POINT-001"
  }
]
```

## Retests

```json
[
  {
    "id": "RETEST-001",
    "date": "2026-10-08",
    "point_id": "POINT-001",
    "result": "approved",
    "evidence": [],
    "po_confirmation": "«prueba y cierra lo que puedas cerrar tú con pruebas de comando» — Juan Andrade, 2026-10-08"
  }
]
```

## Cierre

```json
[
  {
    "kind": "ticket-close",
    "id": "CLOSE-001",
    "date": "2026-10-08",
    "technical_summary": "Implementado y entregado desde su worktree; compuerta qa-mechanical en approve; suite completa en verde en main.",
    "functional_summary": "Delegar cada fase a un subagente con el modelo del perfil sin cambiar el modelo de la sesión anfitriona",
    "qa_status": "approved",
    "qa_waiver_reason": null,
    "po_confirmation": null,
    "release_impact": "Sin publicar; sin impacto de despliegue."
  }
]
```

## Consumo de IA

```json
[
  {
    "kind": "ai-usage",
    "date": "2026-10-08",
    "session_reference": null,
    "model": null,
    "reasoning_effort": null,
    "notes": "Sesión de subagente sonnet de implementación; no expone números de tokens.",
    "input_tokens": null,
    "output_tokens": null,
    "total_tokens": null,
    "estimated_cost_usd": null,
    "source": "manual:subagente-sonnet-implementacion-20261008",
    "confidence": "low",
    "id": "CONSUMO-001"
  },
  {
    "kind": "ai-usage",
    "date": "2026-10-08",
    "session_reference": null,
    "model": null,
    "reasoning_effort": null,
    "notes": "Sesión orquestadora que cerró varios tickets; sin números por ticket para no repartir a ojo un costo que no se midió.",
    "input_tokens": null,
    "output_tokens": null,
    "total_tokens": null,
    "estimated_cost_usd": null,
    "source": "manual:sesión de Claude Code orquestadora, subagente por ticket",
    "confidence": "low",
    "id": "CONSUMO-002"
  },
  {
    "kind": "ai-usage",
    "date": "2026-10-08",
    "session_reference": "9f1455c8-a551-4602-ac40-a8d026bd66b8",
    "model": null,
    "reasoning_effort": null,
    "notes": "Agente claude-code. Sesión **compartida**: trabajó 34 tickets (FEATURE-ENGINE-JORNADA-OLA-20261008 ×115, SECURITY-ENGINE-APROBACION-POR-REVISOR-20261007 ×103, FEATURE-ENGINE-ORQUESTACION-INTERACTIVA-20261007 ×102, FEATURE-ENGINE-JORNADA-HANDOFF-20261008 ×84, BUGFIX-CLI-CANAL-DECISION-20261005 ×83), así que su costo no se reparte y acá no se registran números. Costo completo de la sesión: no declarado por el proveedor, 16592385 tokens. Registralo en el ticket cuya sesión sea propia, o declaralo compartido donde corresponda. Sesión \"ValmenHarness CLI attachments feature\".",
    "input_tokens": null,
    "output_tokens": null,
    "total_tokens": null,
    "estimated_cost_usd": null,
    "source": "claude:9f1455c8-a551-4602-ac40-a8d026bd66b8",
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
    "date": "2026-10-07",
    "at": "2026-10-07T18:03:48.972Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-08",
    "at": "2026-10-08T21:32:22.753Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-08",
    "at": "2026-10-08T21:33:28.998Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-08",
    "at": "2026-10-08T21:39:25.872Z",
    "action": "gate-approved",
    "actor": "cli",
    "details": "Gate plan aprobado por Juan Andrade (recibo GR-20261008-FEATURE-ENGINE-ORQUESTACION-INTERACTIVA-20261007-plan-3, canal cli, decidida 2026-10-08T21:39:25.868Z): A"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-08",
    "at": "2026-10-08T21:40:24.761Z",
    "action": "plan-approved",
    "actor": "cli",
    "details": "{\"actor\":\"Juan Andrade\",\"source\":\"cli\",\"quote\":\"La A (aprueba el plan de ORQUESTACION-INTERACTIVA con el subagente en su propio worktree)\",\"planHash\":\"sha256:ea16baa8db7dae9a5e1453b47541a5628996a9e089a53d34765871b8a879f78f\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-08",
    "at": "2026-10-08T21:40:25.108Z",
    "action": "plan-approval-verified",
    "actor": "cli",
    "details": "Aprobación del plan vigente: Juan Andrade (fuente cli), plan sha256:ea16baa8db7dae9a5e1453b47541a5628996a9e089a53d34765871b8a879f78f."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-08",
    "at": "2026-10-08T21:40:25.108Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-10-08",
    "at": "2026-10-08T21:41:17.075Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-10-08",
    "at": "2026-10-08T21:43:29.576Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-10-08",
    "at": "2026-10-08T21:43:33.608Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-10-08",
    "at": "2026-10-08T22:20:31.734Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-10-08",
    "at": "2026-10-08T22:20:32.070Z",
    "action": "point-added",
    "actor": "cli",
    "details": "Se agregó POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-10-08",
    "at": "2026-10-08T22:20:32.462Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-014",
    "date": "2026-10-08",
    "at": "2026-10-08T22:20:32.824Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-015",
    "date": "2026-10-08",
    "at": "2026-10-08T22:20:33.160Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-016",
    "date": "2026-10-08",
    "at": "2026-10-08T22:20:33.578Z",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-017",
    "date": "2026-10-08",
    "at": "2026-10-08T22:20:34.033Z",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-018",
    "date": "2026-10-08",
    "at": "2026-10-08T22:20:34.396Z",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-001 para POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-019",
    "date": "2026-10-08",
    "at": "2026-10-08T22:20:34.753Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: verified -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-020",
    "date": "2026-10-08",
    "at": "2026-10-08T22:20:35.099Z",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-021",
    "date": "2026-10-08",
    "at": "2026-10-08T22:20:35.411Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-022",
    "date": "2026-10-08",
    "at": "2026-10-08T22:20:35.731Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-002."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-023",
    "date": "2026-10-08",
    "at": "2026-10-08T22:20:37.142Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-003."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-024",
    "date": "2026-10-08",
    "at": "2026-10-08T22:20:37.295Z",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-025",
    "date": "2026-10-08",
    "at": "2026-10-08T22:20:37.609Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  }
]
```
