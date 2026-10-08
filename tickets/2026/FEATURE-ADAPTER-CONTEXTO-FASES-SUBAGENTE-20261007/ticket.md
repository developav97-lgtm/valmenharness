---
schema_version: 2
id: FEATURE-ADAPTER-CONTEXTO-FASES-SUBAGENTE-20261007
title: Proveer a la sesión el modelo de cada fase y avisar si el cliente no admite subagentes
type: FEATURE
module: ADAPTER
workflow_status: awaiting_user_tests
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

# FEATURE-ADAPTER-CONTEXTO-FASES-SUBAGENTE-20261007

## Solicitud original

Parte del sprint: Una sesión interactiva delega cada fase a un subagente con el modelo del perfil cuando el cliente lo admite.
- R-PERF-007: Una sesión interactiva DEBERÍA delegar cada fase a un subagente con el modelo del perfil
Depende de: FEATURE-ADAPTER-RESOLUCION-PERFIL-20261007.
Viene de una feature descompuesta en sprints; su plan completo está en el tickets.yaml de la feature.

Comportamiento esperado: Una sesión interactiva DEBERÍA delegar cada fase a un subagente con el modelo del perfil
Comportamiento actual: la spec no lo declara; se establece en el análisis, leyendo el código.

### Fuera de alcance

Lo que el grafo asignó a otros tickets y este no hace:
- R-PERF-007: lo cubre FEATURE-ENGINE-ORQUESTACION-INTERACTIVA-20261007 (Delegar cada fase a un subagente con el modelo del perfil sin cambiar el modelo de la sesión anfitriona)
- R-PERF-007: lo cubre IMPROVEMENT-ADAPTER-CONTRATO-PERFILES-20261007 (Documentar en AGENTS.md y en la skill de flujo cómo se ejecuta por fases)

### Supuestos y decisiones pendientes

<!-- Si el pedido nombra algo que el código no tiene —parámetro, permiso,
campo, bandera, columna, migración— y no lo especifica, listá cada elemento
con su pregunta antes de avanzar a análisis; el análisis no planifica sobre
la adivinanza. Si no hay ninguno, escribí «Ninguno» y seguí. -->
Ninguno.

## Descripción funcional

- Alcance: que `reanudar_ticket` / `valmen resume` entreguen a la sesión interactiva, para cada fase del agente (análisis, plan, implementación y verificación), el proveedor, el modelo, el esfuerzo y el origen que resuelve el perfil elegido, más el modelo con que el cliente declarado puede lanzar un subagente para esa fase; y que, cuando el cliente no admite subagentes con modelo propio —o la fase es de otro proveedor, o el modelo no tiene equivalente en el cliente—, lo digan con un aviso explícito. Este ticket **provee y avisa**; no delega ni instruye la delegación (FEATURE-ENGINE-ORQUESTACION-INTERACTIVA-20261007) ni documenta el contrato (IMPROVEMENT-ADAPTER-CONTRATO-PERFILES-20261007).
- Usuario o rol afectado: la persona que abre una sesión de Claude Code, Codex u OpenCode y pide «continúa con el ticket X»; el agente de esa sesión, que es quien lee el contexto de `resume`.
- Comportamiento actual: `resume` devuelve estado, siguiente paso, plan, puntos, recibo y etapas (`packages/engine/src/resume.ts:39-67`), pero ningún modelo: la sesión ejecuta todas las fases con el modelo con que se abrió y nadie le dice que el perfil asigna otro. El modelo de fase solo existe para la jornada autónoma (`resolverModeloDeFase`, `packages/engine/src/journey-phases.ts:88-92`), que lanza el ejecutor por su cuenta.
- Comportamiento esperado: con `--cliente claude` (o `cliente: "claude"` en `reanudar_ticket`) y un perfil que asigna el plan a `claude-opus-5-5`, el contexto lista la fase `plan` con ese modelo, su origen (`perfil claude-code-completo`) y `subagente: opus`; con un cliente que no admite subagentes con modelo propio, el contexto lo dice y aclara que las fases usan el modelo de la sesión. El modelo de la sesión anfitriona no se toca: `resume` sigue siendo de solo lectura.

## Diagnóstico

- Causa comprobada (con `ruta:línea`): el modelo de cada fase ya se resuelve, pero solo hacia el ejecutor que lanza la jornada; ningún camino lo expone a una sesión abierta a mano, y el harness no sabe qué cliente la abrió:
  - `modeloDeFase` (`packages/adapter/src/routing.ts:1019`) resuelve el rol `agent-<fase>` con `rutasDelProyecto` (`routing.ts:1112`, que ya aplica el perfil elegido por proyecto o por ejecutor vía `perfilElegido`, `routing.ts:673`) y **cae al modelo de la política** cuando el proveedor del rol no es el del ejecutor (`routing.ts:1025-1035`). Su único consumidor es `resolverModeloDeFase` (`packages/engine/src/journey-phases.ts:88-92`), que exige `politica.executor` y devuelve `null` sin él: una sesión interactiva no tiene política de ejecutor, así que no hay modelo de fase que mostrarle.
  - `buildResumeContext` (`packages/engine/src/resume.ts:77-124`) arma el contexto sin enrutamiento: `ResumeContext` (`resume.ts:39-67`) no tiene campo de modelos, y `renderResumeContext` (`resume.ts:127`) no imprime ninguno. `computeNextStep` (`packages/engine/src/next-step.ts:151`) tampoco, por diseño (no nombra tecnologías, `next-step.ts:27-30`).
  - El cliente de la sesión no llega a ningún lado: `valmen resume` solo lee `--id` (`packages/cli/src/main.ts:1328-1332`) y `resumeTicket` (`packages/cli/src/commands.ts:448`) no recibe más; `reanudar_ticket` solo acepta `id` y `modo` (`packages/mcp/src/tools.ts:804-830`, manejador `tools.ts:3312-3328`); y el `initialize` del MCP descarta `clientInfo` (`packages/mcp/src/protocol.ts:272-285`).
  - No existe en el harness ninguna declaración de qué cliente admite subagentes con modelo propio. `AdapterCapabilities` (`packages/adapter/src/capabilities.ts:10-15`) declara `observe-states`, `read-activity`, `read-messages` y `dispatch` de los **lectores** de sesiones (`codex.ts:78`, `hermes.ts:130`, `opencode.ts:97`); no describe la sesión interactiva. `renderClaudeAgent` (`packages/adapter/src/agents.ts:231`) proyecta agentes sin modelo.
- Hechos del cliente que se usan y de dónde salen: Claude Code lanza subagentes con la herramienta `Agent`, cuyo parámetro `model` acepta los alias `opus`, `sonnet`, `haiku` y `fable` (contrato de la herramienta observado en esta sesión, 2026-10-07), no un identificador completo: el alias resuelve a la versión vigente de la familia en el cliente. El proveedor de Claude Code en el enrutamiento es `claude-code` (`PROVEEDOR_DEL_EJECUTOR`, `routing.ts:1005-1009`). Los ids de cliente se toman de `EJECUTORES_CON_PERFIL` (`routing.ts:778`: `claude`, `codex`, `opencode`, `hermes`), sin inventar otros.
- Hipótesis pendientes: ninguna sobre la causa. Sobre los clientes, una decisión conservadora que no planifica sobre adivinanza: solo `claude` se declara con subagentes de modelo propio, porque es el único con evidencia; `codex`, `opencode` y `hermes` se declaran «no admite» con su limitación escrita —el resultado es un aviso de más, nunca un subagente que el cliente no sepa lanzar—. Ampliarlo exige evidencia del cliente y es un cambio de una entrada de tabla. Se descarta leer `clientInfo` del `initialize` del MCP: los nombres que envía cada cliente no están verificados en el repositorio, y adivinarlos rompe el aviso en silencio; el cliente se declara explícitamente (`--cliente` / `cliente`).
- Consumidores afectados: `valmen resume` (CLI) y `reanudar_ticket` (MCP) ganan un argumento opcional y un bloque «Modelos por fase»; sin el argumento, el bloque aparece igual con el aviso de cliente no declarado. `ResumeContext` gana el campo `fases`; lo consumen `resultadoReanudacion` (`commands.ts:480-491`) como `data` y el MCP como `structuredContent`. `modeloDeFase` y la jornada no cambian. Mission Control no consume `resume`.
- Archivos y flujo investigados: `packages/adapter/src/routing.ts` (`perfilElegido` `:673`, `RouteSource`/`EJECUTORES_CON_PERFIL`/`ResolvedRoute` `:775-813`, `FASES_DEL_AGENTE` `:992`, `ModeloDeFase` `:996`, `PROVEEDOR_DEL_EJECUTOR` `:1005`, `modeloDeFase` `:1019`, `routeFor` `:1041`, `rutasDelProyecto` `:1112`); `packages/adapter/src/capabilities.ts`; `packages/adapter/src/agents.ts:205-245`; `packages/engine/src/resume.ts`; `packages/engine/src/next-step.ts:1-70,501-525`; `packages/engine/src/journey-phases.ts:84-92`; `packages/cli/src/main.ts:155-165,1328-1332`; `packages/cli/src/commands.ts:438-491`; `packages/mcp/src/tools.ts:804-890,2072-2090,2414-2432,3312-3328`; `packages/mcp/src/protocol.ts:250-285`; `tests/next-step.test.ts`, `tests/routing.test.ts`, `tests/mcp-server.test.ts`, `tests/mcp-resumen-siguiente-paso.test.ts`; la spec `.valmen/features/perfiles-de-modelos/spec/perfiles/spec.md` (R-PERF-007) y `tickets.yaml` (sprint S4). Memoria consultada (`buscar_memoria`, «adapter subagente modelo por fase perfil sesión interactiva cliente no admite subagentes»): sin antecedentes del síntoma; AP-003 recuerda respetar el alcance que el grafo asignó a los otros dos tickets del sprint, y AP-010 que el plan diga qué archivos crea.
- Riesgos y compatibilidad:
  - **Alias en lugar de id.** El subagente de Claude Code recibe `opus`, no `claude-opus-5-5`; si el perfil fija una versión anterior de la familia (p. ej. `claude-sonnet-5` cuando el alias resuelve a 5.5), el contexto lo declara como aviso de la fase en vez de afirmar que corre el modelo exacto. El registro del modelo realmente usado es de FEATURE-ENGINE-REGISTRO-MODELO-FASE-20261007.
  - **Esfuerzo.** La herramienta `Agent` no recibe esfuerzo: el contexto informa el esfuerzo del perfil, y un aviso dice que el cliente no lo aplica al subagente.
  - **Fase de otro proveedor.** En un perfil mixto, una fase de `codex` con sesión `claude` no se puede delegar como subagente: el contexto lo dice y remite al despacho por proveedor (R-PERF-004, SECURITY-ENGINE-DESPACHO-POR-PROVEEDOR-20261007). No cae al modelo de la sesión en silencio.
  - **Perfil elegido inexistente.** `perfilElegido` falla (`routing.ts:683-689`); `resume` no debe caerse por eso —es la herramienta para retomar—: el error se captura y se devuelve como aviso con su mensaje.
  - **Solo lectura.** `resume` no escribe: leer `routing.yaml`, `config.yaml` y `profiles.yaml` no cambia ningún archivo ni el modelo de la sesión que la persona abrió (R-PERF-007, «NO DEBE cambiar el modelo de la sesión»).
  - **Esquema del MCP.** `reanudar_ticket` declara `outputSchema` con `additionalProperties: false` (`tools.ts:826-890`) y hoy ya no lista `nextStep` ni `etapas`, que el dato sí lleva; este ticket declara `fases` en el esquema y deja anotada la omisión anterior como hallazgo fuera de alcance, sin corregirla aquí.
  - Compatibilidad: el campo `fases` y el argumento son aditivos; sin `--cliente`, la salida previa no cambia salvo el bloque nuevo, ubicado después del plan para no desplazar el siguiente paso (`resume.ts:152-156`).
- Impactos de sync, migración, Docker o despliegue: ninguno.

## Plan

- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan).
- Pasos ordenados:
  <!-- Cada paso nombra archivo, símbolo o comando, y los criterios que cubre, por ejemplo
       «(C1, C2)». Un paso que no dice dónde ni con qué se toca no se puede ejecutar ni
       revisar, y la compuerta lo lee así. -->
  1. `packages/adapter/src/routing.ts`, junto a `modeloDeFase` (`:1019`) — tipos y tabla de clientes: `type ClienteDeSesion = (typeof EJECUTORES_CON_PERFIL)[number]`; `SUBAGENTES_DEL_CLIENTE`, una entrada por cliente: `claude` → `{ proveedor: "claude-code", alias }`, donde `alias(model)` devuelve `opus`, `sonnet`, `haiku` o `fable` según la familia que nombra el id, o `null`; `codex`, `opencode` y `hermes` → `{ limitacion: "<texto de una línea>" }`. Interfaces `FaseDeSesion { fase, rol, provider, model, effort, origen, subagente: string | null, aviso: string | null }` y `FasesDeSesion { cliente: ClienteDeSesion | null, admiteSubagentes: boolean, faseActual: FaseDelAgente | null, fases: FaseDeSesion[], nota: string | null, aviso: string | null }`. (C2, C3, C4, C5, C8)
  2. `packages/adapter/src/routing.ts` — `faseDelEstado(estado: string): FaseDelAgente | null`: `intake` → `analysis`; `analyzed` → `plan`; `approved`, `in_progress` y `changes_requested` → `implementation`; `awaiting_user_tests` e `in_qa` → `verification`; el resto → `null`. (C11)
  3. `packages/adapter/src/routing.ts` — `fasesDeSesion(root, { cliente?, estado? })`: resuelve con `rutasDelProyecto(root, { ejecutor: cliente })` (así rige el perfil del ejecutor si existe, y si no el del proyecto); por cada fase de `FASES_DEL_AGENTE` toma `routeFor(rutas, "agent-<fase>")` y arma `origen` con `source` y, si viene de perfil, su id y alcance. `subagente` es el alias del cliente solo si el cliente lo admite **y** el proveedor de la fase es el del cliente **y** el alias existe; si no, `subagente: null` y `aviso` dice cuál de las tres falló (cliente sin subagentes; fase del proveedor `<x>` que se despacha por proveedor, R-PERF-004; modelo `<id>` sin alias en el cliente). Con `claude`, `nota` dice que el alias corre la versión vigente de la familia en el cliente y que el esfuerzo no se aplica al subagente. Sin cliente, `aviso` dice que no se declaró el cliente de la sesión y que las fases usan el modelo de la sesión. Si `rutasDelProyecto` lanza (perfil elegido inexistente, `perfilElegido` `:673`), captura el error y devuelve `fases: []` con el mensaje en `aviso`. No escribe en disco. (C1, C2, C3, C4, C5, C6, C7, C8, C9, C10)
  4. `packages/engine/src/resume.ts` — `buildResumeContext(paths, ticket, modo, cliente?)` (`:77`) añade `fases: fasesDeSesion(paths.root, { cliente, estado: fields.workflow_status })` a `ResumeContext` (`:39`); `renderResumeContext` (`:127`) imprime, después de «Plan vigente», el bloque «Modelos por fase (cliente: <id | no declarado>)» con una línea por fase —`→` delante de la fase actual—, `subagente` o el aviso, la nota y el aviso general. (C12, C14)
  5. `packages/cli/src/commands.ts` — `resumeTicket(paths, id, modo, cliente?)` (`:448`) valida `cliente` contra `EJECUTORES_CON_PERFIL` y, si no está, devuelve `error` con los valores admitidos; lo pasa a `resultadoReanudacion` (`:480`). `packages/cli/src/main.ts` — `case "resume"` (`:1328`) lee la bandera `--cliente` y la ayuda (`:159`) la documenta. (C12, C13, C18)
  6. `packages/mcp/src/tools.ts` — `reanudar_ticket` (`:804`): `inputSchema` suma `cliente` con `enum` de `EJECUTORES_CON_PERFIL`; `outputSchema` (`:826`) suma la propiedad `fases` (no requerida, `type: "object"`); el manejador (`:3312`) pasa `cliente` a `resumeTicket`. La omisión previa de `nextStep` y `etapas` en ese esquema no se toca. (C15, C16, C17)
  7. Pruebas: `tests/routing.test.ts` — `describe("R-PERF-007 modelos por fase para la sesión")`, con un directorio temporal (`mkdtempSync`, como la suite) y `profiles.yaml` con la elección escrita por `renderPerfiles`, sin red (C1–C11); `tests/next-step.test.ts` — casos de `resumeTicket` con y sin cliente, y la comparación de bytes antes y después (C12–C14); `tests/mcp-server.test.ts` — `reanudar_ticket` con `cliente` y los esquemas (C15–C17). No se crean archivos de código ni de prueba.
  8. Verificación: los filtros `-t "R-PERF-007"` de las tres suites y `npx vitest run` completa. (C19)
- Alcance y exclusiones: se modifican `packages/adapter/src/routing.ts`, `packages/engine/src/resume.ts`, `packages/cli/src/commands.ts`, `packages/cli/src/main.ts` y `packages/mcp/src/tools.ts`, y las tres suites citadas. **Fuera**: instruir o ejecutar la delegación en subagentes y el texto del siguiente paso (`next-step.ts`) — FEATURE-ENGINE-ORQUESTACION-INTERACTIVA-20261007; la documentación en `AGENTS.md` y skills — IMPROVEMENT-ADAPTER-CONTRATO-PERFILES-20261007; el despacho de una fase a otro proveedor — SECURITY-ENGINE-DESPACHO-POR-PROVEEDOR-20261007; registrar el modelo usado — FEATURE-ENGINE-REGISTRO-MODELO-FASE-20261007; leer `clientInfo` del `initialize` del MCP; `modeloDeFase`, `resolverModeloDeFase` y la jornada, que no cambian.
- Impactos declarados: ninguno de sincronización, migración ni contenedores (`sync_impact`, `migration_impact` y `docker_impact` en `false`). `resume` sigue de solo lectura: no escribe archivos ni cambia el modelo de la sesión anfitriona.
- Compatibilidad: el argumento `cliente` es opcional en el CLI, en el MCP y en las funciones; `fases` es un campo nuevo del contexto; las llamadas existentes a `resumeTicket(paths, id)` y `buildResumeContext(paths, ticket, modo)` compilan igual.
- Rollback (obligatorio): revertir el commit del ticket en los cinco archivos de código y las tres suites. No hay estado escrito que migrar ni archivos de datos nuevos: la versión anterior vuelve al contexto sin modelos.
- Pruebas para la entrega: directorio `/Users/juanandrade/Desktop/ValmenHarness`; `npx vitest run tests/routing.test.ts -t "R-PERF-007"`, `npx vitest run tests/next-step.test.ts -t "R-PERF-007"` y `npx vitest run tests/mcp-server.test.ts -t "R-PERF-007"` → en verde; `npx vitest run` → suite completa en verde. Entorno: Node 24, sin red. Validación manual: tras `npm run build`, `node packages/cli/dist/main.js resume --id <ticket en intake> --cliente claude` muestra «Modelos por fase (cliente: claude)» con `→ analysis` y el subagente de cada fase; con `--cliente codex`, el aviso de que el cliente no admite subagentes con modelo propio.

<!-- Los criterios de la sección siguiente se numeran C1…Cn, con una afirmación verificable por criterio
     —una frase con «y» son dos criterios—, y cada uno lleva debajo su anotación de
     verificación: un comentario HTML que dice «test:» y el comando, o «verify: manual». La
     sección no lleva comentarios dentro: un comentario con anotación se leería como la de un
     criterio. Ejemplo en la skill planificacion. -->
## Criterios de aceptación

- [x] C1 (R-PERF-007): `fasesDeSesion` devuelve las cuatro fases de `FASES_DEL_AGENTE`, en ese orden, con rol, proveedor, modelo, esfuerzo y origen iguales a los de `rutasDelProyecto` para `agent-<fase>`
      <!-- test: npx vitest run tests/routing.test.ts -t "R-PERF-007 cuatro fases" -->
- [x] C2 (R-PERF-007): con cliente `claude` y `claude-code-completo` elegido para el proyecto, la fase `plan` lleva `subagente: "opus"`
      <!-- test: npx vitest run tests/routing.test.ts -t "R-PERF-007 subagente opus" -->
- [x] C3 (R-PERF-007): con cliente `claude`, el resultado lleva la nota de que el alias usa la versión vigente de la familia en el cliente
      <!-- test: npx vitest run tests/routing.test.ts -t "R-PERF-007 nota del alias" -->
- [x] C4 (R-PERF-007): con cliente `codex`, `opencode` o `hermes`, `admiteSubagentes` es `false` y ninguna fase lleva subagente
      <!-- test: npx vitest run tests/routing.test.ts -t "R-PERF-007 cliente sin subagentes" -->
- [x] C5 (R-PERF-007): con un cliente que no admite subagentes, el aviso dice «el cliente <id> no admite subagentes con modelo propio: las fases usan el modelo de la sesión»
      <!-- test: npx vitest run tests/routing.test.ts -t "R-PERF-007 aviso cliente sin subagentes" -->
- [x] C6 (R-PERF-007): con cliente `claude` y un perfil mixto que asigna la implementación a `codex`, la fase `implementation` lleva `subagente: null`
      <!-- test: npx vitest run tests/routing.test.ts -t "R-PERF-007 fase de otro proveedor sin subagente" -->
- [x] C7 (R-PERF-007): en ese perfil mixto, el aviso de la fase `implementation` nombra el proveedor `codex` y remite al despacho por proveedor
      <!-- test: npx vitest run tests/routing.test.ts -t "R-PERF-007 aviso fase de otro proveedor" -->
- [x] C8 (R-PERF-007): con cliente `claude` y un modelo de `claude-code` sin familia reconocible, la fase lleva `subagente: null` y un aviso que nombra el modelo
      <!-- test: npx vitest run tests/routing.test.ts -t "R-PERF-007 modelo sin alias" -->
- [x] C9 (R-PERF-007): con un perfil elegido que no existe, `fasesDeSesion` no lanza y devuelve `fases: []` con el mensaje de `perfilElegido` en `aviso`
      <!-- test: npx vitest run tests/routing.test.ts -t "R-PERF-007 perfil elegido inexistente" -->
- [x] C10 (R-PERF-007): sin cliente, las fases se listan con `subagente: null` y el aviso dice que no se declaró el cliente y que las fases usan el modelo de la sesión
      <!-- test: npx vitest run tests/routing.test.ts -t "R-PERF-007 sin cliente" -->
- [x] C11 (R-PERF-007): `faseDelEstado` asigna `analysis` a `intake`, `plan` a `analyzed`, `implementation` a `approved`/`in_progress`/`changes_requested`, `verification` a `awaiting_user_tests`/`in_qa` y `null` al resto
      <!-- test: npx vitest run tests/routing.test.ts -t "R-PERF-007 fase del estado" -->
- [x] C12 (R-PERF-007): `resumeTicket` con cliente `claude` imprime el bloque «Modelos por fase (cliente: claude)» con `→` delante de la fase actual
      <!-- test: npx vitest run tests/next-step.test.ts -t "R-PERF-007 bloque de modelos por fase" -->
- [x] C13 (R-PERF-007): `resumeTicket` con un cliente fuera de `EJECUTORES_CON_PERFIL` devuelve error con los valores admitidos
      <!-- test: npx vitest run tests/next-step.test.ts -t "R-PERF-007 cliente desconocido" -->
- [x] C14 (R-PERF-007): `resumeTicket` con cliente deja idénticos los bytes de `routing.yaml`, `profiles.yaml` y el ticket
      <!-- test: npx vitest run tests/next-step.test.ts -t "R-PERF-007 solo lectura" -->
- [x] C15 (R-PERF-007): `reanudar_ticket` con `cliente: "claude"` devuelve `data.fases` con `cliente` igual a `claude`
      <!-- test: npx vitest run tests/mcp-server.test.ts -t "R-PERF-007 reanudar con cliente" -->
- [x] C16 (R-PERF-007): el `outputSchema` de `reanudar_ticket` declara la propiedad `fases`
      <!-- test: npx vitest run tests/mcp-server.test.ts -t "R-PERF-007 esquema de salida" -->
- [x] C17 (R-PERF-007): el `inputSchema` de `reanudar_ticket` declara `cliente` con el `enum` de `EJECUTORES_CON_PERFIL`
      <!-- test: npx vitest run tests/mcp-server.test.ts -t "R-PERF-007 esquema de entrada" -->
- [x] C18 (R-PERF-007): `valmen resume --id <ID> --cliente claude` imprime el bloque «Modelos por fase» en la terminal
      <!-- verify: manual -->
- [x] C19 (R-PERF-007): la suite completa pasa
      <!-- test: npx vitest run -->

## Puntos

```json
[]
```

## Implementación

- `packages/adapter/src/routing.ts`: `ClienteDeSesion`, tabla `SUBAGENTES_DEL_CLIENTE` (solo `claude` con alias `opus|sonnet|haiku|fable`; `codex`, `opencode` y `hermes` con su limitación), `FaseDeSesion`, `FasesDeSesion`, `faseDelEstado` y `fasesDeSesion` (solo lectura; captura el error de `perfilElegido` y lo devuelve como aviso).
- `packages/engine/src/resume.ts`: `buildResumeContext(..., cliente?)` añade `fases`; `renderResumeContext` imprime «Modelos por fase (cliente: …)» después del plan, con `→` en la fase actual.
- `packages/cli/src/commands.ts`: `resumeTicket(..., cliente?)` valida contra `EJECUTORES_CON_PERFIL`. `packages/cli/src/main.ts`: bandera `--cliente`, ayuda y registro en `VALUE_OPTIONS` (sin esto la bandera se leía como booleana; lo cazó `tests/cli.test.ts`).
- `packages/mcp/src/tools.ts`: `reanudar_ticket` acepta `cliente` (enum) y declara `fases` en `outputSchema`.
- Pruebas añadidas en `tests/routing.test.ts`, `tests/next-step.test.ts` y `tests/mcp-server.test.ts` (bloques `R-PERF-007`).

## Pruebas

Directorio `/Users/juanandrade/Desktop/ValmenHarness`, Node 24, sin red.

- `npx vitest run tests/routing.test.ts -t "R-PERF-007"`, `npx vitest run tests/next-step.test.ts -t "R-PERF-007"` y `npx vitest run tests/mcp-server.test.ts -t "R-PERF-007"` → 17 pruebas en verde.
- `npx vitest run tests/cli.test.ts` → en verde (cubre `--cliente` en `VALUE_OPTIONS`).
- Manual (C18): tras `npm run build`, `node packages/cli/dist/main.js --root . resume --id FEATURE-ADAPTER-CONTEXTO-FASES-SUBAGENTE-20261007 --cliente claude` imprime «Modelos por fase (cliente: claude)» con `→ implementation` y los subagentes `opus`, `opus`, `sonnet`, `haiku`; con `--cliente codex`, el aviso de que no admite subagentes con modelo propio.
- **C19 sin marcar**: `npx vitest run` completa da 53 fallos en 12 archivos (autorizacion-aprobacion-canales, autorizacion-qa-canales, delegation, firma-de-compuerta, gate-human-decision, gate-view, hermes-notify, jornada-sin-autoaprobacion, mcp-server, qa-commit-referencia, qa-por-politica, qa-sombra) que **ya fallaban sin los cambios del ticket** (comparado con `git stash` de `packages` y `tests`: mismos 53). No son de este alcance; el responsable decide si C19 se exime o se espera su corrección.

- Verificación 2026-10-08: `npx vitest run` completo en `main` con todo integrado: 3531 pruebas verdes.

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
    "at": "2026-10-07T18:03:48.874Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-07",
    "at": "2026-10-07T21:14:14.242Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-07",
    "at": "2026-10-07T21:14:36.928Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-07",
    "at": "2026-10-08T01:02:26.902Z",
    "action": "plan-approved",
    "actor": "cli",
    "details": "{\"actor\":\"Juan Andrade\",\"source\":\"cli\",\"quote\":\"La a (aprueba los cuatro planes: contexto de fases, CodeGraph estado, CodeGraph montaje y skills de UX)\",\"planHash\":\"sha256:75a1ba6f3790facc5ad20d1e3fddaa17f86c890749d63d97af5b2813153db837\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-07",
    "at": "2026-10-08T01:02:27.508Z",
    "action": "plan-approval-verified",
    "actor": "cli",
    "details": "Aprobación del plan vigente: Juan Andrade (fuente cli), plan sha256:75a1ba6f3790facc5ad20d1e3fddaa17f86c890749d63d97af5b2813153db837."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-07",
    "at": "2026-10-08T01:02:27.508Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-07",
    "at": "2026-10-08T01:03:59.791Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-10-07",
    "at": "2026-10-08T01:18:09.346Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  }
]
```
