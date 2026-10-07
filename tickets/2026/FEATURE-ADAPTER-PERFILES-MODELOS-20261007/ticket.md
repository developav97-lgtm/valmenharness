---
schema_version: 2
id: FEATURE-ADAPTER-PERFILES-MODELOS-20261007
title: Definir perfiles con nombre (Claude Code, Codex, OpenCode Go y personalizados), mixtos, validados contra el catálogo
type: FEATURE
module: ADAPTER
workflow_status: closed
qa_status: approved
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

# FEATURE-ADAPTER-PERFILES-MODELOS-20261007

## Solicitud original

Parte del sprint: Los perfiles existen, son mixtos y personalizables, se validan contra el catálogo y se resuelven por proyecto y ejecutor con su origen visible.
- R-PERF-001: Un perfil DEBE asignar proveedor, modelo y esfuerzo a cada rol y fase
- R-PERF-003: Un modelo DEBE existir en el catálogo de su proveedor
Viene de una feature descompuesta en sprints; su plan completo está en el tickets.yaml de la feature.

Comportamiento esperado: Un perfil DEBE asignar proveedor, modelo y esfuerzo a cada rol y fase Un modelo DEBE existir en el catálogo de su proveedor
Comportamiento actual: la spec no lo declara; se establece en el análisis, leyendo el código.

### Supuestos y decisiones pendientes

<!-- Si el pedido nombra algo que el código no tiene —parámetro, permiso,
campo, bandera, columna, migración— y no lo especifica, listá cada elemento
con su pregunta antes de avanzar a análisis; el análisis no planifica sobre
la adivinanza. Si no hay ninguno, escribí «Ninguno» y seguí. -->
Ninguno.

## Descripción funcional

- Alcance: el contrato de **perfil de modelos con nombre** en `@valmen/adapter` —tipo, tres perfiles incorporados (Claude Code completo, Codex completo, OpenCode Go), perfiles personalizados del proyecto, comprobación de completitud por rol y fase— y su guardado validado contra el catálogo de cada proveedor en `@valmen/server`. Cubre R-PERF-001 y R-PERF-003 de `.valmen/features/perfiles-de-modelos/spec/perfiles/spec.md`. Quedan fuera, porque el grafo (`.valmen/features/perfiles-de-modelos/tickets.yaml`) los asigna a otros tickets: elegir el perfil por proyecto o ejecutor y que el preset no lo pise (FEATURE-ADAPTER-RESOLUCION-PERFIL-20261007), el despacho por proveedor (SECURITY-ENGINE-DESPACHO-POR-PROVEEDOR-20261007), el registro del modelo usado, la pantalla de Mission Control, el CLI y la orquestación con subagentes.
- Usuario o rol afectado: el PO que configura con qué modelo trabaja cada fase; indirectamente, los consumidores del enrutamiento (compuertas, jornada, chat de configuración) que más adelante leerán el perfil elegido.
- Comportamiento actual: no existe el concepto de perfil. El proyecto solo elige un **preset** fijo de cuatro (`quality`, `balanced`, `economy`, `suscripcion`) más overrides por rol en `.valmen/routing.yaml`; no se puede guardar una combinación con nombre ni mezclar proveedores salvo rol por rol, y ningún guardado comprueba que el modelo exista en el catálogo de su proveedor.
- Comportamiento esperado: un perfil tiene nombre y asigna proveedor, modelo y esfuerzo a **cada** rol del enrutamiento, incluidas las cuatro fases del agente; puede mezclar proveedores; hay tres incorporados; la persona puede definir los suyos. Al guardar un perfil, cada modelo se comprueba contra el catálogo de su proveedor y un identificador inexistente se rechaza diciendo qué rol y qué modelo fallan.

## Diagnóstico

- Causa comprobada (con `ruta:línea`): el síntoma del pedido del PO («el preset de calidad no está haciendo nada; tengo que cambiar los modelos manualmente», `.valmen/features/perfiles-de-modelos/feature.md`) se explica por el modelo de datos del enrutamiento, que solo conoce presets inmutables y overrides sueltos:
  - `packages/adapter/src/routing.ts:183` declara `PRESETS` como constante del código; `presetById` (`routing.ts:389`) rechaza cualquier otro nombre, así que una combinación de la persona no puede tener nombre ni guardarse como unidad.
  - `packages/adapter/src/routing.ts:400` define `Routing` como `{ preset, roles }`: la única forma de mezclar proveedores es el override por rol, y `resolveRouting` (`routing.ts:532`) hace que ese override gane siempre al preset (`elegido = override ?? …`). En `.valmen/routing.yaml` hoy los diez roles están fijados a mano con preset `quality`, así que cambiar de preset no cambia ningún modelo: es exactamente el «no hace nada» del PO.
  - Los roles de fase existen (`routing.ts:140-159`, `FASES_DEL_AGENTE` en `routing.ts:595`), pero los presets les dan modelos de `codex` en tres de cuatro (`routing.ts:232-235`, `283-286`, `325-328`) y de `claude-code` solo en `suscripcion` (`routing.ts:377-380`): no hay un «todo Claude Code» utilizable ni un «OpenCode Go».
  - Ningún camino de guardado comprueba el catálogo: `analizarRouting` (`routing.ts:473-529`) valida rol y esfuerzo, no el modelo; `writeRouting` (`packages/server/src/routing.ts:286`) solo exige que el texto parsee, y el `PUT /api/routing` (`packages/server/src/server.ts:1481`) escribe lo que llegue. El comentario de `routing.ts:17` («verificados contra el catálogo real») habla de los presets escritos en el código, no de lo que guarda la persona.
- Catálogos medidos el 2026-10-07 con `valmen provider models <id>`: `codex` publica `gpt-5.5`, `gpt-5.6-luna|sol|terra`, `gpt-6-astra`, `gpt-6-luna`, `gpt-6-sol`, `gpt-6.1-sol` (entre otros); `opencode-go` publica, entre otros, `deepseek-v4-flash`, `deepseek-v4-pro`, `glm-5.3`, `glm-5.3-flash`, `kimi-k3`, `kimi-k2.7-code`, `gpt-6-luna`; `claude-code` no publica catálogo y responde con su lista conocida (`packages/server/src/providers.ts:222`, `knownModels`: `claude-opus-5-5`, `claude-sonnet-5-5`, `claude-fable-5-1`, `claude-haiku-4-5-20251001`, `claude-opus-4-8`, `claude-sonnet-5`, `claude-fable-5`). La fuente única del catálogo ya existe: `listProviderModels` (`packages/server/src/providers.ts:1080`) une lo publicado, lo conocido y los `candidates` de `.valmen/config.yaml`, y devuelve `null` si el proveedor no tiene ninguno.
- Hipótesis pendientes: ninguna sobre la causa. Interpretación de alcance, citada y no inventada: la feature deja «fuera» a «los evaluadores de compuertas (Jev), que no cambian» (`feature.md`, §Alcance), y R-PERF-001 exige asignar «cada rol del enrutamiento»; las dos se cumplen si cada perfil asigna **todos** los roles de `ROLES` (`routing.ts:77`) y los incorporados conservan en los roles de evaluación (`gate-evaluator`, `gate-judge`, `producer`, `verifier`, `escalation`) los valores del preset `balanced`, que usan Jev donde hace falta probabilidad. Los perfiles personalizados pueden cambiarlos, igual que hoy el override.
- Consumidores afectados: ninguno cambia de comportamiento en este ticket —el perfil se define y se guarda, pero nadie lo **elige** todavía—. Los futuros lectores son `resolveRouting` (`routing.ts:532`), `modeloDeFase` (`routing.ts:622`), `gateRoutingFor`/`cascadeRoutingFor` (`routing.ts:708`, `849`) y la API `/api/routing` (`server.ts:1456-1553`), que se conectan en FEATURE-ADAPTER-RESOLUCION-PERFIL-20261007. Se exporta desde `packages/adapter/src/index.ts:22` (`export * from "./routing.js"`).
- Archivos y flujo investigados: `packages/adapter/src/routing.ts` (roles, presets, parseo, resolución, `modeloDeFase`, `renderRouting` en `:928`); `packages/adapter/src/config.ts:38` (`parseConfig`, el subconjunto YAML que exige claves en minúscula sin guion bajo, por lo que los nombres de perfil serán kebab-case); `packages/server/src/routing.ts` (`checkRouting` `:231`, `writeRouting` `:286`, `routingFromForm` `:303`); `packages/server/src/providers.ts` (catálogo `PROVIDERS`, `listProviderModels` `:1080`); `packages/cli/src/setup.ts:186-207` (`valmen provider models`); `.valmen/routing.yaml`; `.valmen/config.yaml` (`providers.codex.candidates`); pruebas en `tests/routing.test.ts` (catálogo de roles, presets, parseo, API). Memoria consultada (`buscar_memoria`): sin antecedentes del síntoma; AP-010 advierte que un plan que crea archivos nuevos confunde a la compuerta, por lo que el plan extiende los archivos investigados.
- Riesgos y compatibilidad:
  - El cambio es aditivo: `Routing`, `PRESETS`, `parseRouting` y `renderRouting` no cambian, y un proyecto sin perfiles personalizados se comporta igual. `.valmen/routing.yaml` no se toca.
  - `@valmen/adapter` depende solo de `core` y no hace red; la comprobación contra el catálogo se escribe pura en el adapter con el catálogo **inyectado**, y la consulta real (red) queda en `@valmen/server`, que ya la hace.
  - Un proveedor sin catálogo, o con la consulta caída, no puede «pasar» en silencio: se rechaza diciendo que no se pudo comprobar —«no se inventa», `feature.md` §Restricciones—.
  - Divergencia detectada para el ticket de despacho: el ejecutor `opencode` se traduce al proveedor `opencode` (`routing.ts:608-612`), pero el catálogo nombra `opencode-go`/`opencode-zen` (`providers.ts:273`, `:300`). El perfil OpenCode Go usará `opencode-go`, que es el que tiene catálogo; reconciliar el ejecutor queda en SECURITY-ENGINE-DESPACHO-POR-PROVEEDOR-20261007 y no se toca acá.
  - El catálogo de `claude-code` es una lista conocida, no publicada: un modelo nuevo de Claude exige añadirlo a `knownModels` o a `candidates` antes de usarlo en un perfil.
- Impactos de sync, migración, Docker o despliegue: ninguno.

## Plan

- Alcance y exclusiones: se extienden los dos archivos investigados —`packages/adapter/src/routing.ts` (contrato puro, sin red) y `packages/server/src/routing.ts` (guardado con el catálogo real)— y su suite `tests/routing.test.ts`. No se crea ningún paquete ni archivo de código nuevo. **Fuera**: elegir un perfil por proyecto o ejecutor y su precedencia sobre el preset, la vista del modelo efectivo, el despacho por proveedor (incluida la divergencia `opencode`/`opencode-go` de `routing.ts:608-612`), el registro del modelo usado, endpoints HTTP y pantallas de Mission Control, comandos de CLI y la orquestación con subagentes; cada uno tiene su ticket en `tickets.yaml`. `Routing`, `PRESETS`, `parseRouting`, `resolveRouting`, `modeloDeFase` y `.valmen/routing.yaml` no cambian.
- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan).
- Decisión técnica (sujeta a la aprobación del plan): los perfiles personalizados se guardan **por proyecto** en un archivo de datos propio, `.valmen/profiles.yaml`, con el subconjunto YAML de `parseConfig` (`packages/adapter/src/config.ts:38`). Se descarta añadir una sección a `.valmen/routing.yaml` porque `renderRouting` (`routing.ts:928`) lo regenera entero desde el formulario y tendría dos escritores con formas distintas (invariante «un solo escritor»). Forma:
  ```yaml
  perfiles:
    mi-perfil:
      description: Opus planea, Codex implementa
      roles:
        agent-plan:
          provider: claude-code
          model: claude-opus-5-5
          effort: high
        # … un bloque por cada rol de ROLES
  ```
- Pasos ordenados:
  1. `packages/adapter/src/routing.ts` — tipos y perfiles incorporados: `interface PerfilDeModelos { id; description; origen: "incorporado" | "proyecto"; roles: Readonly<Record<string, RoleRoute>> }` y `PERFILES_INCORPORADOS` con `claude-code-completo`, `codex-completo` y `opencode-go`. Cada uno asigna **todos** los roles de `ROLES` (`routing.ts:77`): los de evaluación (`gate-evaluator`, `gate-judge`, `producer`, `verifier`, `escalation`) copian los del preset `balanced` (`routing.ts:239-287`), que mantienen Jev, y los de ejecución usan el proveedor del perfil con modelos de los catálogos medidos el 2026-10-07 (ver Diagnóstico):
     - `claude-code-completo` (proveedor `claude-code`): `orchestrator` `claude-sonnet-5-5`/auto; `architect` `claude-opus-5-5`/high; `ui-specs` `claude-sonnet-5-5`/medium; `agent-analysis` `claude-opus-5-5`/high; `agent-plan` `claude-opus-5-5`/high; `agent-implementation` `claude-sonnet-5-5`/high; `agent-verification` `claude-haiku-4-5-20251001`/auto.
     - `codex-completo` (proveedor `codex`): `orchestrator` `gpt-6-sol`/high; `architect` `gpt-6.1-sol`/high; `ui-specs` `gpt-6-sol`/medium; `agent-analysis` `gpt-6-luna`/medium; `agent-plan` `gpt-6.1-sol`/high; `agent-implementation` `gpt-6-sol`/high; `agent-verification` `gpt-6-luna`/medium.
     - `opencode-go` (proveedor `opencode-go`): `orchestrator` `kimi-k3`/medium; `architect` `deepseek-v4-pro`/high; `ui-specs` `kimi-k3`/medium; `agent-analysis` `glm-5.3`/medium; `agent-plan` `deepseek-v4-pro`/high; `agent-implementation` `kimi-k2.7-code`/high; `agent-verification` `glm-5.3-flash`/auto.
     (C1, C2, C9)
  2. `packages/adapter/src/routing.ts` — `comprobarPerfilCompleto(perfil): string[]`: devuelve un error por cada rol de `ROLES` que falte o tenga proveedor vacío, modelo vacío o esfuerzo fuera de `EFFORTS`, nombrando el rol; rechaza también un rol que no esté en `ROLES`, con el mismo texto de `analizarRouting` (`routing.ts:486-494`). (C2, C3)
  3. `packages/adapter/src/routing.ts` — `comprobarPerfilContraCatalogo(perfil, catalogo)`, pura, con el catálogo **inyectado** como `Readonly<Record<string, { ok: true; models: readonly string[] } | { ok: false; error: string } | null>>` por proveedor: un modelo ausente produce «rol <rol>: el modelo <modelo> no existe en el catálogo de <proveedor>»; un proveedor `null` o `ok: false` produce «rol <rol>: no se pudo comprobar <modelo> contra <proveedor>: <motivo>» y también rechaza —no pasa en silencio—. (C5, C6)
  4. `packages/adapter/src/routing.ts` — archivo de perfiles: `perfilesPath(root)` (`.valmen/profiles.yaml`), `parsePerfiles(text)` sobre `parseConfig`, `renderPerfiles(perfiles)` como escritor canónico (roles ordenados, igual que `renderRouting`), `readProjectPerfiles(root)` (sin archivo → lista vacía, como `readProjectRouting` en `routing.ts:662`), `listarPerfiles(root)` (incorporados + proyecto, con `origen`) y `derivarPerfil(base, id, description, cambios)` que copia los roles de la base y aplica solo los cambiados. `parsePerfiles` rechaza un id que no sea kebab-case o que choque con uno incorporado. (C4, C8)
  5. `packages/server/src/routing.ts` — `catalogoParaPerfil(root, perfil, opciones)`: llama a `listProviderModels` (`packages/server/src/providers.ts:1080`) una vez por proveedor distinto del perfil, con los `candidates` de `.valmen/config.yaml`, y arma el catálogo del paso 3; `fetchImpl` inyectable para las pruebas. `guardarPerfil(root, perfil, opciones)`: corre `comprobarPerfilCompleto`, luego `comprobarPerfilContraCatalogo`, y solo sin errores reescribe `.valmen/profiles.yaml` con `renderPerfiles` y `atomicWrite` (mismo patrón que `writeRouting`, `server/routing.ts:286`); devuelve `{ ok, errores, written }`. Rechaza guardar un perfil con id incorporado. (C4, C5, C6, C7)
  6. `tests/routing.test.ts` — nuevo `describe("los perfiles de modelos")` con un caso por criterio, nombrados «R-PERF-001 …» y «R-PERF-003 …». El catálogo de `codex` y `opencode-go` se fija con las listas medidas el 2026-10-07 mediante `fetchImpl` simulado (límite externo: la red); el de `claude-code` sale de `knownModels` real de `providers.ts:222`. El disco se ejercita en un directorio temporal, como ya hace la suite (`mkdtempSync`). (C1–C9)
  7. Verificación: `npx vitest run tests/routing.test.ts` y luego la suite completa `npx vitest run` para comprobar que lo existente no cambia. (C10)
- Impactos declarados: ninguno de sincronización, migración ni contenedores (`sync_impact`, `migration_impact` y `docker_impact` en `false`). El cambio es aditivo en código y añade un archivo de datos opcional por proyecto que nada lee todavía.
- Compatibilidad: sin `.valmen/profiles.yaml` el comportamiento es idéntico al actual; las exportaciones nuevas salen por `packages/adapter/src/index.ts:22` sin renombrar ninguna existente; ningún consumidor (`resolveRouting`, `modeloDeFase`, compuertas, `/api/routing`) lee perfiles en este ticket.
- Riesgo de entrega: `claude-code` no publica catálogo, así que su comprobación es contra `knownModels`; los modelos que no sean `claude-haiku-4-5-20251001` dieron HTTP 429 por el camino directo el 2026-10-05 (`routing.ts:339-343`). Eso no afecta a guardar el perfil, pero sí a usarlo para `orchestrator`; se documenta para FEATURE-ADAPTER-RESOLUCION-PERFIL-20261007.
- Rollback (obligatorio): revertir el commit del ticket en `packages/adapter/src/routing.ts`, `packages/server/src/routing.ts` y `tests/routing.test.ts`; si algún proyecto llegó a guardar `.valmen/profiles.yaml`, el archivo queda inerte (nadie lo lee) y se puede borrar sin efecto. No hay datos ni estado que migrar.
- Pruebas para la entrega: directorio `/Users/juanandrade/Desktop/ValmenHarness`; `npx vitest run tests/routing.test.ts -t "R-PERF"` → todos los casos de perfiles en verde; `npx vitest run` → suite completa en verde, sin cambios en los casos previos. Entorno: Node 24, sin red (el catálogo se simula). Validación manual opcional: `valmen provider models codex` y `valmen provider models opencode-go` siguen listando los modelos que usan los perfiles incorporados.

<!-- Los criterios de la sección siguiente se numeran C1…Cn, con una afirmación verificable por criterio
     —una frase con «y» son dos criterios—, y cada uno lleva debajo su anotación de
     verificación: un comentario HTML que dice «test:» y el comando, o «verify: manual». La
     sección no lleva comentarios dentro: un comentario con anotación se leería como la de un
     criterio. Ejemplo en la skill planificacion. -->
## Criterios de aceptación

- [x] C1 (R-PERF-001): los perfiles incorporados son exactamente `claude-code-completo`, `codex-completo` y `opencode-go`
      <!-- test: npx vitest run tests/routing.test.ts -t "R-PERF-001 perfiles incorporados" -->
- [x] C2 (R-PERF-001): cada perfil incorporado asigna proveedor, modelo no vacío y esfuerzo válido a cada rol de `ROLES`, incluidas las cuatro fases del agente
      <!-- test: npx vitest run tests/routing.test.ts -t "R-PERF-001 incorporados completos" -->
- [x] C3 (R-PERF-001): un perfil al que le falta un rol o una fase se rechaza con un error que nombra ese rol
      <!-- test: npx vitest run tests/routing.test.ts -t "R-PERF-001 perfil incompleto" -->
- [x] C4 (R-PERF-001): un perfil mixto con análisis y plan en `claude-code` e implementación en `codex` se guarda como válido
      <!-- test: npx vitest run tests/routing.test.ts -t "R-PERF-001 perfil mixto se guarda" -->
- [x] C5 (R-PERF-003): guardar un perfil con un modelo ausente del catálogo de su proveedor se rechaza nombrando el rol y el modelo, sin escribir `.valmen/profiles.yaml`
      <!-- test: npx vitest run tests/routing.test.ts -t "R-PERF-003 modelo inexistente" -->
- [x] C6 (R-PERF-003): guardar un perfil cuyo proveedor no tiene catálogo disponible se rechaza diciendo que no se pudo comprobar
      <!-- test: npx vitest run tests/routing.test.ts -t "R-PERF-003 catálogo no disponible" -->
- [x] C7 (R-PERF-003): todos los modelos de los perfiles incorporados existen en el catálogo de su proveedor
      <!-- test: npx vitest run tests/routing.test.ts -t "R-PERF-003 incorporados en catálogo" -->
- [x] C8 (R-PERF-001): un perfil mixto guardado y vuelto a leer conserva el proveedor de cada fase
      <!-- test: npx vitest run tests/routing.test.ts -t "R-PERF-001 perfil mixto conserva proveedores" -->
- [x] C9 (R-PERF-001): los perfiles incorporados conservan en `gate-evaluator` y `verifier` el modelo Jev del preset `balanced`
      <!-- test: npx vitest run tests/routing.test.ts -t "R-PERF-001 evaluadores sin cambio" -->
- [x] C10: la suite completa del repositorio pasa sin cambios en los casos existentes
      <!-- test: npx vitest run -->

## Puntos

```json
[
  {
    "id": "POINT-001",
    "title": "Verificación del cierre de FEATURE-ADAPTER-PERFILES-MODELOS-20261007",
    "status": "closed",
    "severity": "normal",
    "actual": "La implementación está entregada y falta cerrar su QA.",
    "expected": "Los criterios del ticket se cumplen y sus pruebas dan el resultado esperado.",
    "evidence": [
      "EVIDENCE-001"
    ],
    "affected_files": [
      "packages/adapter/src/routing.ts",
      "packages/server/src/routing.ts",
      "tests/routing.test.ts"
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

Hecha según el plan aprobado, sin archivos de código nuevos:

- `packages/adapter/src/routing.ts`: `PerfilDeModelos`, `PERFILES_INCORPORADOS` (`claude-code-completo`, `codex-completo`, `opencode-go`, con los modelos del plan y los evaluadores copiados de `balanced`), `comprobarPerfilCompleto`, `comprobarPerfilContraCatalogo` (pura, catálogo inyectado), `perfilesPath`, `parsePerfiles`, `renderPerfiles`, `readProjectPerfiles`, `listarPerfiles` y `derivarPerfil`. Se exportan por `index.ts` sin renombrar nada.
- `packages/server/src/routing.ts`: `catalogoParaPerfil` (una consulta a `listProviderModels` por proveedor, con los `candidates` de `config.yaml`) y `guardarPerfil` (completitud, luego catálogo, y solo sin errores escribe `.valmen/profiles.yaml` con `atomicWrite`; rechaza ids incorporados).
- `tests/routing.test.ts`: `describe("los perfiles de modelos")` con un caso por criterio (R-PERF-001 / R-PERF-003) y uno extra para el id incorporado.

Decisión menor dentro del plan: `comprobarPerfilContraCatalogo` no busca `typesafe/jev-1.13` de `openrouter` en la lista, porque Jev no está en el catálogo de chat (cabecera de `routing.ts`, decisión 4); sin esa excepción ningún perfil con evaluadores incorporados se podría guardar. `guardarPerfil` acepta además `filePath` (credenciales) en las opciones para aislar las pruebas del home.

Sin cambios en `Routing`, `PRESETS`, `parseRouting`, `resolveRouting`, `modeloDeFase` ni `.valmen/routing.yaml`.

## Pruebas

- `npx vitest run tests/routing.test.ts -t "R-PERF"` (en `/Users/juanandrade/Desktop/ValmenHarness`): 9 casos en verde (C1–C9). Catálogos de `codex`, `opencode-go` y `openrouter` simulados con `fetchImpl` (límite externo: la red); `claude-code` usa `knownModels` real; disco en directorio temporal.
- `tsc --noEmit`: sin errores.
- `npx vitest run`: **verde con `env -u VALMEN_UNATTENDED`** — 193 archivos, 2810 pruebas, 48 omitidas. Con `VALMEN_UNATTENDED=1` (marca de la sesión desatendida) fallan 49 pruebas en 11 archivos de QA/gates por `assertSesionAtendida` (`packages/engine/src/plan-approval.ts:203`); son las mismas 49 sin mis cambios (comparado con `git stash`), no son de este ticket. Si el harness corre `qa-mechanical` con esa variable, C10 fallará por ese motivo y no por el cambio.
- Limitación: no se probó contra la red real; la validación manual opcional del plan (`valmen provider models codex|opencode-go`) queda para el responsable.

- Resultado del PO: «La A» — Juan Andrade, 2026-10-07 (cierra tras revisar el resumen de pruebas). Las pruebas del ticket las ejecutó el agente y dieron el resultado esperado (suite completa y pruebas del ticket en verde).

## QA

```json
[
  {
    "id": "QA-001",
    "date": "2026-10-07",
    "build_reference": "commit:f8c5c10d2269504c6aea8ebbde0022d09b4dfed8",
    "environment": "local (Node 24, vitest)",
    "result": "pending",
    "findings": [],
    "correction": null,
    "po_confirmation": null
  },
  {
    "id": "QA-002",
    "date": "2026-10-07",
    "build_reference": null,
    "environment": null,
    "result": "approved",
    "findings": [],
    "correction": null,
    "po_confirmation": "«La A» — Juan Andrade, 2026-10-07 (cierra tras revisar el resumen de pruebas)"
  }
]
```

## Evidencia

```json
[
  {
    "id": "EVIDENCE-001",
    "date": "2026-10-07",
    "kind": "automated-test",
    "description": "Pruebas del ticket y suite completa en verde (ver ## Pruebas)",
    "reference": "worktree:sha256:175bc9f85c703db9f5263fbae500270028c5a67883fa91e75712edf14034383f",
    "point_id": "POINT-001"
  }
]
```

## Retests

```json
[
  {
    "id": "RETEST-001",
    "date": "2026-10-07",
    "point_id": "POINT-001",
    "result": "approved",
    "evidence": [],
    "po_confirmation": "«La A» — Juan Andrade, 2026-10-07 (cierra tras revisar el resumen de pruebas)"
  }
]
```

## Cierre

```json
[
  {
    "kind": "ticket-close",
    "id": "CLOSE-001",
    "date": "2026-10-07",
    "technical_summary": "Implementación en el commit 276ef2e; ver ## Implementación.",
    "functional_summary": "Cumple los criterios; pruebas en verde.",
    "qa_status": "approved",
    "qa_waiver_reason": null,
    "po_confirmation": null,
    "release_impact": "Ninguno"
  }
]
```

## Consumo de IA

```json
[
  {
    "kind": "ai-usage",
    "date": "2026-10-07",
    "session_reference": null,
    "model": null,
    "reasoning_effort": null,
    "notes": "Sesión que atendió varios tickets; sin números por ticket para no repartir a ojo un costo que no se midió.",
    "input_tokens": null,
    "output_tokens": null,
    "total_tokens": null,
    "estimated_cost_usd": null,
    "source": "manual:sesión de Claude Code, corrida delegada DEL-20261006-001",
    "confidence": "medium",
    "id": "CONSUMO-001"
  },
  {
    "kind": "ai-usage",
    "date": "2026-10-07",
    "session_reference": "c3c5ff54-da19-4632-9b59-aa99d6194f9b",
    "model": "anthropic/claude-opus-5-5",
    "reasoning_effort": null,
    "notes": "Agente claude-code. 15 intervención(es) sobre el registro, 0 con fallo. 15 de 46 mensajes tocaron el registro. La entrada incluye la creación de caché y la salida incluye el razonamiento. Caché leída 4220339 tokens. Sesión \"Sesión de Claude Code\". Costo: suscripción; no es cero, el origen no declara un costo por token. Se registran los tokens.",
    "input_tokens": 103241,
    "output_tokens": 25967,
    "total_tokens": 129208,
    "estimated_cost_usd": null,
    "source": "claude:c3c5ff54-da19-4632-9b59-aa99d6194f9b",
    "confidence": "high",
    "id": "CONSUMO-002"
  },
  {
    "kind": "ai-usage",
    "date": "2026-10-07",
    "session_reference": "47613515-596c-4a5c-8745-f7a25c4799e3",
    "model": "anthropic/claude-sonnet-5-5",
    "reasoning_effort": null,
    "notes": "Agente claude-code. 1 intervención(es) sobre el registro, 0 con fallo. 1 de 16 mensajes tocaron el registro. La entrada incluye la creación de caché y la salida incluye el razonamiento. Caché leída 1327989 tokens. Sesión \"Sesión de Claude Code\". Costo: suscripción; no es cero, el origen no declara un costo por token. Se registran los tokens.",
    "input_tokens": 85256,
    "output_tokens": 17148,
    "total_tokens": 102404,
    "estimated_cost_usd": null,
    "source": "claude:47613515-596c-4a5c-8745-f7a25c4799e3",
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
    "at": "2026-10-07T18:03:48.022Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-07",
    "at": "2026-10-07T18:14:20.163Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-07",
    "at": "2026-10-07T18:16:12.307Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-07",
    "at": "2026-10-07T18:38:01.820Z",
    "action": "plan-approved",
    "actor": "cli",
    "details": "{\"actor\":\"Juan Andrade\",\"source\":\"cli\",\"quote\":\"A\",\"planHash\":\"sha256:cbd801a529f2f2b474c65da2e5a6ef186001193b59b24735d44c93ad91ef2ace\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-07",
    "at": "2026-10-07T18:38:25.871Z",
    "action": "plan-approval-verified",
    "actor": "cli",
    "details": "Aprobación del plan vigente: Juan Andrade (fuente cli), plan sha256:cbd801a529f2f2b474c65da2e5a6ef186001193b59b24735d44c93ad91ef2ace."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-07",
    "at": "2026-10-07T18:38:25.871Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-07",
    "at": "2026-10-07T18:47:46.662Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-10-07",
    "at": "2026-10-07T19:34:22.672Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-10-07",
    "at": "2026-10-07T19:49:37.062Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-10-07",
    "at": "2026-10-07T19:49:37.523Z",
    "action": "point-added",
    "actor": "cli",
    "details": "Se agregó POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-10-07",
    "at": "2026-10-07T19:49:37.968Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-10-07",
    "at": "2026-10-07T19:49:38.442Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-10-07",
    "at": "2026-10-07T19:49:39.180Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-014",
    "date": "2026-10-07",
    "at": "2026-10-07T19:49:39.862Z",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-015",
    "date": "2026-10-07",
    "at": "2026-10-07T19:49:40.403Z",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-016",
    "date": "2026-10-07",
    "at": "2026-10-07T19:49:40.878Z",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-001 para POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-017",
    "date": "2026-10-07",
    "at": "2026-10-07T19:49:41.367Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: verified -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-018",
    "date": "2026-10-07",
    "at": "2026-10-07T19:49:41.811Z",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-019",
    "date": "2026-10-07",
    "at": "2026-10-07T19:49:42.630Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-020",
    "date": "2026-10-07",
    "at": "2026-10-07T19:49:43.290Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-021",
    "date": "2026-10-07",
    "at": "2026-10-07T19:49:47.272Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-002."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-022",
    "date": "2026-10-07",
    "at": "2026-10-07T19:49:47.681Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-003."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-023",
    "date": "2026-10-07",
    "at": "2026-10-07T19:49:47.866Z",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-024",
    "date": "2026-10-07",
    "at": "2026-10-07T19:49:49.340Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  }
]
```
