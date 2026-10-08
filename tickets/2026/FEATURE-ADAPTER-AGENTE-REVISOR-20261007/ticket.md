---
schema_version: 2
id: FEATURE-ADAPTER-AGENTE-REVISOR-20261007
title: Definir el rol revisor y ejecutarlo con un modelo distinto al que produjo el artefacto
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

# FEATURE-ADAPTER-AGENTE-REVISOR-20261007

## Solicitud original

Parte del sprint: Un agente revisor decide los review autorizados, con un modelo distinto al productor y registrado como decisión del revisor. Depende de la feature perfiles-de-modelos para elegir el modelo.
- R-APRO-003: Un agente revisor DEBERÍA decidir los review cuando la autorización lo declara
Depende de: FEATURE-ENGINE-ELEGIBILIDAD-APROBACION-20261007.
Viene de una feature descompuesta en sprints; su plan completo está en el tickets.yaml de la feature.

Comportamiento esperado: Un agente revisor DEBERÍA decidir los review cuando la autorización lo declara
Comportamiento actual: la spec no lo declara; se establece en el análisis, leyendo el código.

### Fuera de alcance

Lo que el grafo asignó a otros tickets y este no hace:
- R-APRO-003: lo cubre SECURITY-ENGINE-APROBACION-POR-REVISOR-20261007 (Guardar la decisión del revisor como suya, rechazar el mismo modelo y reservar los block a una persona)

### Supuestos y decisiones pendientes

<!-- Si el pedido nombra algo que el código no tiene —parámetro, permiso,
campo, bandera, columna, migración— y no lo especifica, listá cada elemento
con su pregunta antes de avanzar a análisis; el análisis no planifica sobre
la adivinanza. Si no hay ninguno, escribí «Ninguno» y seguí. -->
Ninguno.

## Descripción funcional

- Alcance: declarar el rol `reviewer` en el enrutado de modelos, con modelo en cada preset y en cada perfil incorporado; resolver el modelo que produjo el análisis o el plan de un ticket y elegir el del revisor solo si es distinto; y ejecutar al revisor sobre un recibo en `review` de `analysis` o `plan`, con su propio rol (prompt de sistema), el artefacto y la lista de proposiciones que quedaron en banda media, para que devuelva `approve` o `reject` con su razonamiento. Incluye un comando de CLI que muestra el resultado sin escribir. Exclusiones: guardar la decisión del revisor en el recibo o en el ticket, mover el estado, consumir cupo, la barrera del motor contra el mismo modelo al registrar y la reserva de los `block` a una persona son de SECURITY-ENGINE-APROBACION-POR-REVISOR-20261007; la elegibilidad (tipo, impactos, cupo, modo `reviewer` de la autorización) es de FEATURE-ENGINE-ELEGIBILIDAD-APROBACION-20261007; la jornada, de FEATURE-ENGINE-JORNADA-APROBACION-20261007.
- Usuario o rol afectado: el PO, que hoy decide a mano cada `review` de `analysis` y `plan`; y el motor que, con una autorización en modo `reviewer`, delegará esa decisión en el revisor.
- Comportamiento actual: un recibo en `review` se escala solo a una persona (`escalatedTo: "human"`, `packages/gate/src/receipt.ts:172`); no existe un rol revisor en `ROLES` (`packages/adapter/src/routing.ts:77`) ni código que ejecute un modelo sobre las proposiciones en banda media; el modo `reviewer` de la autorización (`packages/engine/src/approval-authorization.ts:37`) se guarda pero nadie lo ejerce.
- Comportamiento esperado: dado un ticket con el último recibo de `analysis` o `plan` en `review`, el harness resuelve el modelo productor, elige el modelo del rol `reviewer` solo si es distinto de todos los que produjeron el artefacto, le pasa al revisor el artefacto y las proposiciones en banda media con su valor y su motivo, y devuelve una decisión estructurada `approve` o `reject` con la razón, el modelo, el uso y la latencia, sin escribir en el registro. Si el revisor coincide con el productor, o el productor no se puede determinar, no llama al modelo y lo dice.

## Diagnóstico

- Causa comprobada (con `ruta:línea`): el harness no tiene revisor porque (1) `ROLES` (`packages/adapter/src/routing.ts:77`) solo declara roles con consumidor y ninguno revisa un `review`: `gate-judge` responde proposiciones, no decide sobre un recibo ya emitido; (2) el recibo guarda qué quedó en banda media (`GateDecision.inBand`, `packages/gate/src/decide.ts:381`, y cada `EvaluatedProposition` con `inBand`, `value` y `reason`, `decide.ts:365`), pero lo único que lo consume es la decisión humana (`withHumanDecision`, `packages/gate/src/receipt.ts:410`); (3) el modelo productor del artefacto solo queda escrito cuando lo lanza la jornada: `registrarFase` (`packages/engine/src/journey-phases.ts:45`) anexa `{ticketId, fase, ejecutor, modelo}` a `.valmen/journeys/fases.jsonl`, y la preparación (`packages/engine/src/journey-preparation.ts:167` y `:205`) registra como fase `analysis` una sola sesión que deja el ticket de `intake` en `planned`, así que el plan de un ticket preparado por la jornada figura con fase `analysis`; una sesión interactiva no deja registro de modelo por fase (lo pide FEATURE-ENGINE-REGISTRO-MODELO-FASE-20261007, en `intake`). (4) Copiar el revisor del `gate-judge` no garantiza la separación: en el preset `suscripcion` el `gate-judge` y el `agent-plan` son el mismo `claude-sonnet-5` (`routing.ts:343` y `:378`).
- Hipótesis pendientes: ninguna sobre la causa. Decisión de diseño que el plan toma del lado seguro y el PO puede cambiar al aprobar: si el ticket no tiene ningún registro de fase en `fases.jsonl`, el productor es desconocido y el revisor no se ejecuta (motivo «productor desconocido»), en vez de suponer el modelo declarado para la fase; cuando FEATURE-ENGINE-REGISTRO-MODELO-FASE-20261007 registre también las sesiones interactivas, esta lectura las cubrirá sin cambios.
- Consumidores afectados: comprobado con búsqueda, `ROLES` lo leen `resolveRouting` (`routing.ts:919`), `comprobarPerfilCompleto` (`routing.ts:506`, que exige cada rol en cada perfil, también los perfiles que un proyecto guarda en su archivo de perfiles, `perfilesPath`, `routing.ts:577`), `parseRouting` y las pruebas `tests/routing.test.ts:117` (lista exacta de roles), `tests/roles-ejecucion.test.ts`, `tests/perfiles-pantalla.test.ts` y la vista de Mission Control, que los recorre sin lista fija. Un perfil de proyecto guardado antes de este cambio no trae `reviewer`: al resolver, `resolveRouting` (`routing.ts:919`) cae al preset para el rol que el perfil no declara, así que no se rompe; solo al volver a guardarlo desde Mission Control `comprobarPerfilCompleto` lo exige (`packages/server/src/routing.ts:423`), y la pantalla de perfiles recibe la lista desde `ROLES` (`tests/perfiles-pantalla.test.ts:81`). Los perfiles incorporados lo heredan sumándolo a `ROLES_DE_EVALUACION` (`routing.ts:414`). `veredictoDeCompuerta` (`packages/engine/src/receipts.ts:125`) y `transition` no cambian. Los consumidores futuros son SECURITY-ENGINE-APROBACION-POR-REVISOR-20261007 y FEATURE-ENGINE-JORNADA-APROBACION-20261007.
- Archivos y flujo investigados: la llamada a un modelo con salida estructurada ya existe en `evaluateWithJudge` (`packages/gate-llm-judge/src/judge.ts:295`) sobre `callChat` (`packages/credentials/src/chat.ts:166`), que resuelve proveedor, credencial y dialecto, incluido `claude-code` por su CLI (`packages/credentials/src/endpoints.ts:183`); el revisor reutiliza ese camino en el mismo paquete, que ya depende de `@valmen/credentials`, mientras que `@valmen/adapter` solo depende de `@valmen/core` y no debe tocar la red. Las rutas resueltas salen de `rutasDelProyecto` (`routing.ts:1259`) y `routeFor` (`routing.ts:1188`); los recibos, de `readReceipts` y `veredictoDeCompuerta` (`receipts.ts:44` y `:125`); el modelo productor, de `leerFases` (`journey-phases.ts:65`). La cascada (`packages/engine/src/cascade.ts`) es el precedente de un rol de ejecución en `ROLES` con consumidor en el motor. Memoria: AP-004 (`.valmen/memory/aprendizajes.md:31`) muestra recibos en `review` por una proposición semántica contradictoria, el caso típico que el revisor recibe; AP-007 y AP-009 (`:60` y `:76`) confirman que un `block` no debe llegar al revisor.
- Riesgos y compatibilidad: (a) separación de modelos: la comparación normaliza el identificador (sin prefijo de proveedor `vendor/`, en minúsculas, con `.` y `_` como `-`) para que `anthropic/claude-sonnet-5` y `claude-sonnet-5` cuenten como el mismo modelo; el revisor debe ser distinto de **todos** los modelos registrados para el ticket en las fases `analysis` y `plan`, porque la preparación registra el plan como `analysis`; (b) es de solo lectura: no anexa recibos, eventos ni cupo, y no puede aprobar nada por sí mismo hasta que el ticket SECURITY lo conecte; (c) solo actúa sobre un último recibo vigente en `review`; con `block`, `approve`, decisión humana o sin recibo no llama al modelo; (d) la respuesta del modelo se valida por esquema: una decisión que no sea `approve` o `reject`, o sin razón, es un error y no una aprobación; la razón se recorta como `MOTIVO_MAX` (`judge.ts:284`); (e) agregar un rol exige un modelo en los cuatro presets y los tres perfiles incorporados, cada uno distinto de sus `agent-analysis` y `agent-plan`; (f) un proyecto con `routing.yaml` sin el rol lo resuelve por preset, sin cambios de archivo.
- Impactos de sync, migración, Docker o despliegue: ninguno.

## Plan

- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan).
- Alcance: el rol `reviewer` y su modelo por preset y perfil, la resolución del productor y la elección del revisor, la ejecución del revisor, el comando de solo lectura y sus pruebas. Exclusiones: las de la descripción funcional.
- Pasos ordenados:
  1. En `packages/adapter/src/routing.ts`: agregar a `ROLES` el rol `reviewer` («Decide un `review` de análisis o plan con un modelo distinto al que lo produjo», consumidor `valmen review-agent`); darle modelo en los cuatro `PRESETS` (`quality`: `openrouter` `anthropic/claude-opus-4.6`; `balanced` y `economy`: `openrouter` `openai/gpt-5.6-luna-pro`; `suscripcion`: `codex` `gpt-6-sol`), y sumarlo a `ROLES_DE_EVALUACION` para que los perfiles incorporados lo hereden de `balanced`. Agregar `normalizarModelo(model)` y `modeloDelRevisor(rutas, productores)` que devuelve `{ ok: true, route }` o `{ ok: false, motivo }` cuando el rol no tiene modelo, cuando `productores` está vacío («productor desconocido») o cuando coincide con alguno («el revisor es el mismo modelo que produjo el artefacto: elegí otro en el rol reviewer»). (C1, C2, C3, C4, C5)
  2. Crear `packages/gate-llm-judge/src/reviewer.ts` con `promptDelRevisor()` (el rol: revisa el artefacto contra las proposiciones en duda, no reescribe ni evalúa otras, decide `approve` solo si el artefacto respalda cada proposición) y `reviewWithModel({ provider, model, effort, etapa, artefacto, proposiciones, fetchImpl?, cliRunner?, timeoutMs? })`, que llama a `callChat` con salida estructurada `{ decision: "approve" | "reject", reason, porProposicion: [{ id, respaldada, motivo }] }` y devuelve la decisión, la razón recortada a `MOTIVO_MAX`, el modelo, el uso y la latencia; una respuesta fuera del esquema lanza `JudgeError`. Exportarlo desde `packages/gate-llm-judge/src/index.ts`. (C6, C7, C8)
  3. Crear `packages/engine/src/reviewer.ts` con `prepararRevision({ paths, ticketId, etapa })`, que lee el ticket, toma la compuerta de la etapa (`analysis` o `plan`), exige con `veredictoDeCompuerta` que el último recibo vigente esté en `review` sin decisión humana, arma el artefacto (Descripción funcional y Diagnóstico para `analysis`; Plan y Criterios de aceptación para `plan`), lista las proposiciones con `inBand` del recibo con su valor y su motivo, reúne los modelos productores con `leerFases` (fases `analysis` y `plan` del ticket) y elige el revisor con `modeloDelRevisor`; y `ejecutarRevisor(preparacion, opciones)` que llama a `reviewWithModel` y devuelve `{ decision, reason, revisor, productores, reciboId, proposiciones, usage, latencyMs }` sin escribir en el registro. Exportarlo desde `packages/engine/src/index.ts`. (C4, C5, C9, C10, C11)
  4. En `packages/cli/src/commands.ts` agregar `reviewAgentCommand` y en `packages/cli/src/main.ts` el despacho y la ayuda de `valmen review-agent --id <ID> --stage analysis|plan [--dry-run] [--json]`: `--dry-run` muestra productor, revisor y proposiciones sin llamar al modelo; sin él, imprime la decisión del revisor y aclara que no se registró. (C12)
  5. Pruebas: actualizar `tests/routing.test.ts:117` con el rol nuevo; crear `tests/agente-revisor.test.ts` con un registro temporal (ticket, recibos y `fases.jsonl` escritos por la prueba) y `fetchImpl`/`cliRunner` simulados, un caso por criterio y un control que aprueba. Correr `npx vitest run tests/agente-revisor.test.ts tests/routing.test.ts tests/roles-ejecucion.test.ts tests/perfiles-pantalla.test.ts`, `npx vitest run` y `npx tsc --noEmit -p tsconfig.json`. (C1–C13)
- Dependencias: FEATURE-ENGINE-ELEGIBILIDAD-APROBACION-20261007 (en `planned`) no es requisito de código para este ticket: el revisor no decide elegibilidad y no lee autorizaciones; la dependencia es de orden en la feature.
- Impactos declarados: ninguno; el ticket no declara sincronización, migración ni contenedores.
- Rollback (obligatorio): revertir el commit del ticket; el rol nuevo se resuelve por preset y ningún archivo del proyecto lo exige, y las funciones y el comando nuevos no escriben en el registro ni los llama otro código.

<!-- Los criterios de la sección siguiente se numeran C1…Cn, con una afirmación verificable por criterio
     —una frase con «y» son dos criterios—, y cada uno lleva debajo su anotación de
     verificación: un comentario HTML que dice «test:» y el comando, o «verify: manual». La
     sección no lleva comentarios dentro: un comentario con anotación se leería como la de un
     criterio. Ejemplo en la skill planificacion. -->
## Criterios de aceptación

- [x] C1. `ROLES` declara el rol `reviewer` con su consumidor `valmen review-agent` (R-APRO-003)
      <!-- test: npx vitest run tests/routing.test.ts -->
- [x] C2. Cada preset y cada perfil incorporado resuelve `reviewer` a un modelo distinto, normalizado, de sus `agent-analysis` y `agent-plan` (R-APRO-003)
      <!-- test: npx vitest run tests/agente-revisor.test.ts -->
- [x] C3. `normalizarModelo` trata como el mismo modelo `anthropic/claude-sonnet-5` y `claude-sonnet-5`
      <!-- test: npx vitest run tests/agente-revisor.test.ts -->
- [x] C4. Con el rol `reviewer` en el mismo modelo que produjo el plan, la revisión no llama al modelo y el motivo pide otro modelo (R-APRO-003)
      <!-- test: npx vitest run tests/agente-revisor.test.ts -->
- [x] C5. Sin ningún registro de fase del ticket, la revisión no llama al modelo y el motivo dice «productor desconocido»
      <!-- test: npx vitest run tests/agente-revisor.test.ts -->
- [x] C6. `reviewWithModel` envía el prompt del rol revisor, el artefacto y solo las proposiciones en banda media
      <!-- test: npx vitest run tests/agente-revisor.test.ts -->
- [x] C7. `reviewWithModel` devuelve la decisión `approve` o `reject` con su razón y el modelo que la tomó (R-APRO-003)
      <!-- test: npx vitest run tests/agente-revisor.test.ts -->
- [x] C8. Una respuesta del modelo fuera del esquema lanza `JudgeError` y no se lee como aprobación
      <!-- test: npx vitest run tests/agente-revisor.test.ts -->
- [x] C9. Un último recibo en `block`, en `approve`, con decisión humana o inexistente no llega al revisor y devuelve su motivo
      <!-- test: npx vitest run tests/agente-revisor.test.ts -->
- [x] C10. Un plan preparado por la jornada, registrado con fase `analysis`, cuenta su modelo como productor del plan
      <!-- test: npx vitest run tests/agente-revisor.test.ts -->
- [x] C11. `ejecutarRevisor` no escribe en el registro: recibos, ticket, eventos y cupo quedan iguales
      <!-- test: npx vitest run tests/agente-revisor.test.ts -->
- [x] C12. `valmen review-agent --dry-run` muestra productor, revisor y proposiciones sin llamar al modelo
      <!-- test: npx vitest run tests/agente-revisor.test.ts -->
- [x] C13. La suite completa y la comprobación de tipos pasan
      <!-- test: npx tsc --noEmit -p tsconfig.json -->

## Puntos

```json
[]
```

## Implementación

Hecha según el plan aprobado, paso por paso:

- `packages/adapter/src/routing.ts`: rol `reviewer` en `ROLES` (consumidor `valmen review-agent`); modelo en los cuatro `PRESETS` (`quality` `openrouter` `anthropic/claude-opus-4.6`/high; `balanced` y `economy` `openrouter` `openai/gpt-5.6-luna-pro`/medium; `suscripcion` `codex` `gpt-6-sol`/medium) y en `ROLES_DE_EVALUACION`, de modo que los tres perfiles incorporados lo heredan de `balanced`. Funciones puras `normalizarModelo` (sin prefijo `vendor/`, minúsculas, `.` y `_` como `-`) y `modeloDelRevisor(rutas, productores)`, que devuelve `{ ok: true, route }` o `{ ok: false, motivo }` si el rol no tiene modelo, si no hay productor conocido («productor desconocido») o si coincide con alguno («elegí otro en el rol reviewer»).
- `packages/gate-llm-judge/src/reviewer.ts` (nuevo, exportado por `index.ts`): `promptDelRevisor()` y `reviewWithModel`, que llama a `callChat` con salida estructurada `{ decision, reason, porProposicion[] }` y devuelve decisión, razón recortada a `MOTIVO_MAX`, modelo, uso y latencia. Una respuesta fuera del esquema lanza `JudgeError` con código propio: no JSON o no objeto, decisión distinta de `approve`/`reject`, sin razón, sin `porProposicion` válido, sin respuesta para alguna proposición en duda, o `approve` con una proposición marcada sin respaldo (se contradice y no se lee como aprobación).
- `packages/engine/src/reviewer.ts` (nuevo, exportado por `index.ts`): `prepararRevision` y `ejecutarRevisor`. Solo actúa sobre el último recibo vigente de la compuerta de la etapa si está en `review` sin decisión humana (`veredictoDeCompuerta`); arma el artefacto (Descripción funcional y Diagnóstico para `analysis`; Plan y Criterios de aceptación para `plan`), toma las proposiciones con `inBand`, reúne como productores los modelos de las fases `analysis` y `plan` del ticket en `fases.jsonl` (`leerFases`) y elige al revisor con `modeloDelRevisor`. `ejecutarRevisor` no escribe en el registro.
- `packages/cli/src/commands.ts` y `main.ts`: `valmen review-agent --id <ID> --stage analysis|plan [--dry-run] [--json]`; `--stage` se registró en `VALUE_OPTIONS`. Sale con 3 cuando la revisión no procede o el modelo no contesta en el esquema; el texto aclara que no se registró nada.
- Pruebas: `tests/agente-revisor.test.ts` (51 casos, uno o más por criterio y un control que aprueba) y ajustes en `tests/routing.test.ts` (lista exacta de roles y consumidor, y las dos excepciones de abajo).

Decisiones dentro del plan, para que el PO las vea:

1. **Dos pruebas existentes afirmaban invariantes de presets que el plan contradice**, y se acotaron para exceptuar solo `reviewer`: «el preset económico no repite modelos caros» (el plan pone `openai/gpt-5.6-luna-pro` en `economy`; la prueba ahora exige que sea el mismo de `balanced`) y «`suscripcion` resuelve todo a `claude-code`» (el plan pone `codex` `gpt-6-sol`; `codex` tampoco pide clave de API). Si el PO prefiere conservar esos invariantes, el modelo de `reviewer` en `economy` y `suscripcion` cambia en una línea de `routing.ts` y la excepción se retira de la prueba. También se añadió `openai/gpt-5.6-luna-pro` al catálogo simulado de `openrouter` de las pruebas de perfiles, porque los perfiles incorporados heredan ese revisor.
2. **Esfuerzos del revisor** (el plan no los fija): `high` en `quality`, `medium` en los demás.
3. **Guarda de secretos**: `prepararRevision` no envía a un modelo un artefacto con una credencial (misma comprobación `scanSecrets` que el gate mecánico `sin_secretos`); lo rechaza con el tipo y la línea, sin repetir el valor.

Hallazgos que quedan fuera del alcance y para el PO (no se resolvieron aquí):

- **Los `review` por contradicción aislada no tienen proposiciones en banda media.** El plan filtra por `inBand`, como pide C6. Pero un `review` que sale de `isIsolatedBlockContradiction` (el caso AP-004 que el diagnóstico cita como típico) deja `inBand: false` en la proposición que bloqueaba, y el revisor responde «ninguna proposición quedó en banda media (no aprobaron: …)». En el registro real, 6 de los 11 recibos de `analysis`/`plan` en `review` sin decisión no tienen ninguna proposición en banda media (por ejemplo `SECURITY-ENGINE-PARADA-SEGURA-20260926`, donde solo `diagnostico_explica_el_sintoma` no aprobó). Ampliar «en duda» a las proposiciones decisivas cuyo efecto no aprueba es un cambio de criterio de una persona.
- **El productor se conoce solo si la jornada lo registró** (decisión de diseño del plan). En el registro real, un ticket trabajado en sesión interactiva responde «productor desconocido» (por ejemplo `FEATURE-MC-SELECTOR-PROYECTOS-20261001`, con 3 proposiciones en banda). Lo cubrirá FEATURE-ENGINE-REGISTRO-MODELO-FASE-20261007 sin cambios.
- **El recibo puede ser anterior al último cambio del ticket.** El plan no pide comprobar `stateHash`, así que el revisor lee el artefacto actual contra proposiciones de un recibo que pudo evaluar otro texto. Como esto no registra nada, no daña; el ticket SECURITY-ENGINE-APROBACION-POR-REVISOR-20261007 debería exigirlo antes de guardar una decisión.

Sin cambios en `veredictoDeCompuerta`, `transition`, `resolveRouting` ni `.valmen/routing.yaml`; el rol nuevo se resuelve por preset, y las funciones y el comando nuevos no escriben en el registro ni los llama otro código.

## Pruebas

Directorio de ejecución: la raíz del repositorio (`/Users/juanandrade/Desktop/ValmenHarness`, o el worktree del ticket). Requisito de ambiente: Node 24 y `npm install`; para que `tsc` resuelva `@valmen/engine` y `@valmen/cli` hace falta el `dist` de los paquetes (`npm run build`, que `npm run typecheck` ya incluye). Sin red, sin claves y sin tocar el registro del proyecto: la red y el CLI de Claude se simulan con `fetchImpl` y `cliRunner`; el registro, los recibos y el enrutado son reales y viven en un directorio temporal.

Comandos y resultado esperado:

- `npx vitest run tests/agente-revisor.test.ts tests/routing.test.ts tests/roles-ejecucion.test.ts tests/perfiles-pantalla.test.ts` → 4 archivos, todos en verde (51 + 84 + 8 + 8 casos). Resultado de la sesión: 4 archivos y 151 casos en verde.
- `npx vitest run tests/cli.test.ts` → 20 casos en verde; incluye la comprobación de que toda bandera de la ayuda con `<valor>` está en `VALUE_OPTIONS`.
- `npx tsc --noEmit -p tsconfig.json` → sin salida y código 0.
- Control de que las pruebas pueden fallar: con el cambio revertido a mano, una por una, `modeloDelRevisor` aceptando al mismo modelo, `normalizarModelo` sin quitar el prefijo, el filtro `inBand` sin aplicar, las fases limitadas a la de la etapa, `approve` contradictorio aceptado y un `block` pasando al revisor, cada reversión hizo fallar al menos un caso; se restauró todo después.

Validación manual (solo lectura): `node packages/cli/dist/main.js review-agent --id <TICKET> --stage plan --dry-run` sobre un ticket con un recibo en `review` y modelos de fase registrados muestra el recibo, los productores, el revisor y las proposiciones en banda media, y no llama al modelo; sobre un ticket sin recibo en `review` dice «NO PROCEDE» con su motivo y sale con 3. Sin `--dry-run`, con credenciales del proveedor del rol `reviewer`, imprime `approve` o `reject` con su razón y aclara «No se registró».

Limitaciones: la suite completa (`npx vitest run`) no se corrió en esta sesión por indicación del orquestador (la corre al integrar, para no abrir dos suites a la vez); lo corrido son las pruebas de los criterios y los archivos que el cambio de roles y de ayuda podía afectar (`cascada-*`, `config-playwright`, `jornada-ejecucion`, `docs-*`, `manuales-*`, `gate-promotion`, `corpus-rag`, `agents-md-tamano`, `mcp-registration`). No se probó contra un proveedor real: el esquema de salida estructurada y el cableado de `callChat` se comprobaron con respuestas simuladas, y la validación con un modelo de verdad queda para el responsable. Se hizo una corrida real de `--dry-run` sobre el registro del proyecto, que mostró los dos hallazgos de «Implementación».

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
[
  {
    "kind": "ai-usage",
    "date": "2026-10-08",
    "session_reference": null,
    "model": "claude-sonnet-5-5",
    "reasoning_effort": null,
    "notes": "Subagente de Claude Code dedicado solo a este ticket; la sesión no expone agregado de tokens",
    "input_tokens": null,
    "output_tokens": null,
    "total_tokens": null,
    "estimated_cost_usd": null,
    "source": "manual:subagente-claude-code-ticket-agente-revisor",
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
    "date": "2026-10-07",
    "at": "2026-10-07T18:03:56.470Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-07",
    "at": "2026-10-08T02:03:33.076Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-07",
    "at": "2026-10-08T02:04:13.094Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-07",
    "at": "2026-10-08T02:20:50.903Z",
    "action": "plan-approved",
    "actor": "cli",
    "details": "{\"actor\":\"Juan Andrade\",\"source\":\"cli\",\"quote\":\"A (aprueba los tres planes: caducidad a medianoche, elegibilidad de aprobación y agente revisor)\",\"planHash\":\"sha256:b6fe8e13b02bd90f8ac98288b51266e009be81225f95214dd2302d255c664ba2\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-07",
    "at": "2026-10-08T02:20:52.144Z",
    "action": "plan-approval-verified",
    "actor": "cli",
    "details": "Aprobación del plan vigente: Juan Andrade (fuente cli), plan sha256:b6fe8e13b02bd90f8ac98288b51266e009be81225f95214dd2302d255c664ba2."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-07",
    "at": "2026-10-08T02:20:52.144Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-07",
    "at": "2026-10-08T04:33:35.122Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-10-07",
    "at": "2026-10-08T04:53:27.836Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-10-07",
    "at": "2026-10-08T04:53:31.310Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  }
]
```
