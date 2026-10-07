---
schema_version: 2
id: FEATURE-ADAPTER-RESOLUCION-PERFIL-20261007
title: Elegir el perfil por proyecto y por ejecutor, que el preset no lo sobrescriba y mostrar el modelo efectivo con su origen
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

# FEATURE-ADAPTER-RESOLUCION-PERFIL-20261007

## Solicitud original

Parte del sprint: Los perfiles existen, son mixtos y personalizables, se validan contra el catálogo y se resuelven por proyecto y ejecutor con su origen visible.
- R-PERF-002: La persona DEBERÍA poder crear, editar y elegir perfiles
- R-PERF-005: El modelo efectivo de cada fase DEBE ser visible con su origen
Depende de: FEATURE-ADAPTER-PERFILES-MODELOS-20261007.
Viene de una feature descompuesta en sprints; su plan completo está en el tickets.yaml de la feature.

Comportamiento esperado: La persona DEBERÍA poder crear, editar y elegir perfiles El modelo efectivo de cada fase DEBE ser visible con su origen
Comportamiento actual: la spec no lo declara; se establece en el análisis, leyendo el código.

### Fuera de alcance

Lo que el grafo asignó a otros tickets y este no hace:
- R-PERF-002: lo cubre FEATURE-MC-PERFILES-MODELOS-20261007 (Crear, editar y elegir perfiles desde Mission Control)
- R-PERF-002: lo cubre FEATURE-CLI-PERFILES-MODELOS-20261007 (Listar, mostrar y elegir perfiles por CLI y desde Hermes)
- R-PERF-005: lo cubre FEATURE-MC-VISTA-MODELOS-EFECTIVOS-20261007 (Mostrar el modelo efectivo, su origen y el realmente usado por fase)
- R-PERF-005: lo cubre FEATURE-CLI-PERFILES-MODELOS-20261007 (Listar, mostrar y elegir perfiles por CLI y desde Hermes)

### Supuestos y decisiones pendientes

<!-- Si el pedido nombra algo que el código no tiene —parámetro, permiso,
campo, bandera, columna, migración— y no lo especifica, listá cada elemento
con su pregunta antes de avanzar a análisis; el análisis no planifica sobre
la adivinanza. Si no hay ninguno, escribí «Ninguno» y seguí. -->
Ninguno.

## Descripción funcional

- Alcance: la **resolución** del perfil de modelos en el motor —qué perfil está elegido para el proyecto y para cada ejecutor, con qué precedencia entra frente al preset y a los roles fijados a mano, y con qué origen sale cada rol—, más la función que guarda la elección. Las pantallas de Mission Control, los comandos nuevos del CLI y Hermes, el despacho por proveedor y el registro del modelo usado son de otros tickets (§Fuera de alcance).
- Usuario o rol afectado: el PO, que hoy cambia modelos rol por rol; la jornada autónoma, que lanza cada fase con `modeloDeFase`; las compuertas y la cascada, que resuelven sus modelos con el mismo enrutamiento.
- Comportamiento actual: los perfiles existen y se guardan en el archivo de perfiles (`perfilesPath`, `packages/adapter/src/routing.ts:577`, `.valmen/` + `profiles.yaml`) (FEATURE-ADAPTER-PERFILES-MODELOS-20261007, cerrado), pero **ninguno se puede elegir**: nada los lee al resolver. El modelo de cada rol sale de override de `routing.yaml` → `playwright:` → preset → sistema, y el origen solo distingue `proyecto`, `preset`, `sistema` y `sin-asignar`.
- Comportamiento esperado: la persona elige un perfil para el proyecto y, si quiere, otro para un ejecutor (por ejemplo `hermes` distinto de `claude`); al resolver, el perfil elegido gana al preset —también al preset que impone la degradación por presupuesto—; un rol fijado a mano en `routing.yaml` sigue ganando al perfil, y la ruta resuelta lo dice nombrando el perfil que anula; cada rol sale con origen `perfil` cuando viene del perfil, con el id del perfil y el alcance de la elección (proyecto o ejecutor).

## Diagnóstico

- Causa comprobada (con `ruta:línea`): el perfil no participa en ninguna resolución, así que elegirlo no tiene dónde guardarse ni efecto:
  - `resolveRouting` (`packages/adapter/src/routing.ts:817`) recibe solo `Routing` y `playwright`, y elige con `override ?? dePlaywright ?? delPreset ?? delSistema` (`routing.ts:847`): no existe una fuente «perfil» ni un parámetro para pasarla. `RouteSource` (`routing.ts:692`) no tiene el valor `perfil`, así que el origen no podría mostrarse aunque se resolviera.
  - `Routing` (`routing.ts:685`) es `{ preset, roles }` y `parsePerfiles` (`routing.ts:582`) solo lee la clave `perfiles`: no hay ningún lugar del registro donde quede escrito «el proyecto eligió el perfil X» ni «el ejecutor Y usa el perfil Z». `guardarPerfil` (`packages/server/src/routing.ts:390`) reescribe el archivo entero con `renderPerfiles` (`routing.ts:625`, `packages/server/src/routing.ts:411`), que solo emite `perfiles:`.
  - Todos los caminos que resuelven modelos llaman a `resolveRouting(readProjectRouting(root), …)` por separado: `gateRoutingFor` (`routing.ts:993`), `architectRoutingFor` (`routing.ts:1031`), `uiSpecsRoutingFor` (`routing.ts:1059`), `cascadeRoutingFor` (`routing.ts:1134`), `resolverModeloDeFase` (`packages/engine/src/journey-phases.ts:88-91`), `valmen routing show` (`packages/cli/src/setup.ts:241`) y `checkRouting` de la API (`packages/server/src/routing.ts:240-271`). Ninguno conoce el ejecutor salvo la jornada, que tiene `politica.executor` (`journey-phases.ts:89`).
  - La degradación por presupuesto sustituye el preset en memoria con `routingConPreset` (`routing.ts:988`); sin una fuente «perfil» por encima del preset, esa sustitución cambiaría los roles que un perfil declara, contra R-PERF-002 («Un preset NO DEBE sobrescribir lo que un perfil elegido declara»).
- Lo que ya sirve y se reutiliza: `listarPerfiles` (`routing.ts:670`) junta incorporados y del proyecto; `readProjectPerfiles` (`routing.ts:658`) devuelve vacío sin archivo; `ID_DE_PERFIL` (`routing.ts:500`) valida ids; `guardarPerfil` ya escribe con `atomicWrite`.
- Ejecutores que pueden tener perfil propio, tomados del código y no inventados: `claude`, `codex` y `opencode`, los de la política de despacho (`PROVEEDOR_DEL_EJECUTOR`, `routing.ts:893`; `.valmen/config.yaml` `autonomous.executor.id: claude`), y `hermes`, el id del adaptador de Hermes (`packages/adapter/src/hermes.ts:126`).
- Hipótesis pendientes: ninguna sobre la causa. Dos decisiones de diseño se toman leyendo la spec, no adivinando: (1) la precedencia «rol fijado a mano > perfil» sale del escenario de R-PERF-005 («un rol fijado a mano que anula el perfil elegido → la vista dice que el rol anula el perfil»), y la sección `playwright:` de `config.yaml` conserva el mismo rango que el override porque `resolveRouting` ya la trata como declaración del proyecto (`routing.ts:812-815`); (2) «perfil del ejecutor > perfil del proyecto» sale de R-PERF-002 («de modo que Hermes use otro perfil que Claude Code»).
- Consumidores afectados: los siete caminos de resolución listados arriba pasan a ver el perfil elegido; sin elección, su resultado no cambia. `chat.ts:150-151` compara dos `Routing` en memoria para un diff de propuestas y no lee disco: queda igual. Mission Control traduce los orígenes con un mapa fijo (`packages/server/web/index.html:6611`): el origen nuevo `perfil` se verá sin traducir hasta FEATURE-MC-VISTA-MODELOS-EFECTIVOS-20261007, que es dueño de esa pantalla.
- Archivos y flujo investigados: `packages/adapter/src/routing.ts` (`ROLES` `:77`, `PRESETS` `:183`, perfiles `:406-683`, `Routing`/`RouteSource`/`ResolvedRoute` `:685-711`, `resolveRouting` `:817`, `modeloDeFase` `:907`, `readProjectRouting` `:947`, `routingConPreset` `:988`, gate/arquitecto/specs/cascada `:993-1165`, `renderRouting` `:1213`); `packages/server/src/routing.ts` (`checkRouting` `:240`, `writeRouting` `:295`, `routingFromForm` `:312`, `guardarPerfil` `:390`); `packages/server/src/server.ts:1458-1560` (API `/api/routing`, cuyo formulario reescribe `routing.yaml` desde `preset` y `roles` y perdería cualquier clave nueva puesta allí); `packages/engine/src/journey-phases.ts:84-92`; `packages/cli/src/setup.ts:225-300`; `.valmen/routing.yaml` (preset `quality`, diez roles fijados a mano); `.valmen/config.yaml` (`execution`, `autonomous.executor`); `tests/routing.test.ts` (`describe("los perfiles de modelos")` `:759`). Memoria consultada (`buscar_memoria`, «preset no tiene efecto… perfil por proyecto y ejecutor… origen»): sin antecedentes del síntoma; AP-003 recuerda que la vista de Mission Control es de otro ticket y AP-001 que los criterios deben ser atómicos.
- Riesgos y compatibilidad:
  - **Dónde vive la elección.** En `.valmen/routing.yaml` no: el `PUT /api/routing` lo regenera desde el formulario (`server.ts:1483-1530`, `routingFromForm` `packages/server/src/routing.ts:312`) y borraría la elección al guardar un rol. Va en el archivo de perfiles (`perfilesPath`), bajo una clave `seleccion:`, con `renderPerfiles` como único escritor; `guardarPerfil` debe conservarla al reescribir (invariante «un solo escritor»).
  - **El proyecto actual tiene diez roles fijados a mano** (`.valmen/routing.yaml`): elegir un perfil hoy solo cambiaría `gate-evaluator` y `verifier`; el resto quedará marcado como «anula el perfil». Quitar esos overrides es una decisión de la persona (`valmen routing clear <rol>`), no de este ticket.
  - **Compuertas.** Los perfiles incorporados copian los roles de evaluación de `balanced` (Jev), pero un perfil del proyecto podría cambiarlos; con un perfil elegido, las compuertas y la cascada resuelven con él —la vista y la ejecución deben coincidir (R-PERF-005)—. Sin elección, nada cambia.
  - **Degradación por presupuesto.** Con perfil elegido, el preset degradado ya no cambia los roles del perfil: es lo que exige R-PERF-002 y reduce el ahorro de la degradación en esos roles. Se documenta en la entrega.
  - Una elección que nombra un perfil que ya no existe **falla con el id** en lugar de caer al preset en silencio, igual que `presetById` (`routing.ts:389`) con un preset retirado.
  - El cambio es aditivo: `resolveRouting` gana un tercer parámetro opcional; `ResolvedRoute` gana campos opcionales; `RouteSource` gana un valor. Las exportaciones salen por `packages/adapter/src/index.ts` (`export * from "./routing.js"`).
- Impactos de sync, migración, Docker o despliegue: ninguno.

## Plan

- Alcance y exclusiones: se extienden `packages/adapter/src/routing.ts` (contrato puro y lectura), `packages/server/src/routing.ts` (escritura de la elección y API de lectura), `packages/engine/src/journey-phases.ts` y `packages/cli/src/setup.ts` (solo la llamada de resolución, para que usen el perfil), y la suite `tests/routing.test.ts`. No se crea ningún archivo de código. **Fuera**: endpoints HTTP nuevos, pantallas y traducción del origen en Mission Control (FEATURE-MC-PERFILES-MODELOS-20261007, FEATURE-MC-VISTA-MODELOS-EFECTIVOS-20261007), comandos o banderas nuevos del CLI y de Hermes (FEATURE-CLI-PERFILES-MODELOS-20261007), el despacho al ejecutor del proveedor y la divergencia `opencode`/`opencode-go` (SECURITY-ENGINE-DESPACHO-POR-PROVEEDOR-20261007), el registro del modelo usado (FEATURE-ENGINE-REGISTRO-MODELO-FASE-20261007). `.valmen/routing.yaml`, `renderRouting`, `routingFromForm` y `PRESETS` no cambian.
- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan).
- Decisión técnica (sujeta a la aprobación del plan): la elección se guarda en el archivo de perfiles (`perfilesPath`), junto a los perfiles, con esta forma:
  ```yaml
  seleccion:
    proyecto: claude-code-completo
    ejecutores:
      hermes: codex-completo
  perfiles:
    # … como hoy
  ```
  Precedencia por rol: override de `routing.yaml` → `playwright:` de `config.yaml` (solo `ui-specs`) → perfil elegido para el ejecutor → perfil elegido para el proyecto → preset → sistema.
- Pasos ordenados:
  1. `packages/adapter/src/routing.ts` — tipos: `RouteSource` suma `"perfil"`; `ResolvedRoute` suma `perfil?: { readonly id: string; readonly alcance: "proyecto" | "ejecutor" }` (presente cuando el rol sale del perfil) y `anulaPerfil?: string` (el id del perfil elegido cuando un override o `playwright:` gana a un rol que ese perfil declara). `interface SeleccionDePerfil { proyecto: string | null; ejecutores: Readonly<Record<string, string>> }` y `EJECUTORES_CON_PERFIL = ["claude", "codex", "opencode", "hermes"]`. (C2, C6, C7)
  2. `packages/adapter/src/routing.ts` — lectura de la elección: `parseSeleccionDePerfil(text)` lee la clave `seleccion` con `parseConfig`, valida los ids con `ID_DE_PERFIL` y los ejecutores contra `EJECUTORES_CON_PERFIL`; `readSeleccionDePerfil(root)` devuelve `{ proyecto: null, ejecutores: {} }` sin archivo. `renderPerfiles(perfiles, seleccion?)` emite `seleccion:` antes de `perfiles:` cuando hay elección, y sigue siendo el único escritor del archivo. (C1, C11)
  3. `packages/adapter/src/routing.ts` — `perfilElegido(perfiles, seleccion, ejecutor?)`: si `ejecutor` tiene entrada en `seleccion.ejecutores`, devuelve ese perfil con alcance `ejecutor`; si no, el de `seleccion.proyecto` con alcance `proyecto`; sin elección, `null`. Si el id elegido no está en `perfiles`, `fail` con «el perfil elegido "<id>" no existe» y el alcance —no cae al preset—. (C4, C5, C8)
  4. `packages/adapter/src/routing.ts` — `resolveRouting(routing, playwright, perfil = null)`: el tercer parámetro es el resultado de `perfilElegido`; la cadena pasa a `override ?? dePlaywright ?? delPerfil ?? delPreset ?? delSistema`, `source` `perfil` cuando gana el perfil, y `anulaPerfil` cuando gana override o `playwright:` sobre un rol que el perfil declara. (C1, C2, C3, C6, C7)
  5. `packages/adapter/src/routing.ts` — `rutasDelProyecto(root, { ejecutor?, preset? })`: lee `routing.yaml`, aplica `routingConPreset`, `playwrightConfigOf`, `listarPerfiles`, `readSeleccionDePerfil` y `perfilElegido`, y llama a `resolveRouting`. `gateRoutingFor` (`:993`), `architectRoutingFor` (`:1031`), `uiSpecsRoutingFor` (`:1059`) y `cascadeRoutingFor` (`:1134`) pasan a usarla en lugar de su llamada propia. `modeloDeFase` añade al `motivo` el perfil cuando la ruta viene de uno («rol agent-plan (perfil claude-code-completo, ejecutor claude)»). (C3, C12, C14)
  6. `packages/engine/src/journey-phases.ts:91` — `resolverModeloDeFase` usa `rutasDelProyecto(root, { ejecutor: politica.executor.id })`. (C12)
  7. `packages/server/src/routing.ts` — `checkRouting` (`:240`) resuelve con el perfil elegido del proyecto (sin ejecutor) para que la API devuelva el origen `perfil`; `elegirPerfil(root, { perfil: string | null, ejecutor?: string })` valida que el perfil exista en `listarPerfiles` y que el ejecutor esté en `EJECUTORES_CON_PERFIL`, y solo entonces reescribe el archivo de perfiles (`perfilesPath`) con `renderPerfiles(readProjectPerfiles(root), seleccionNueva)` y `atomicWrite`; `null` quita la elección. `guardarPerfil` (`:390`) pasa la elección vigente a `renderPerfiles` para no perderla. (C9, C10, C11, C13)
  8. `packages/cli/src/setup.ts:241` — `valmen routing show` resuelve con `rutasDelProyecto(paths.root)`, de modo que la columna `origen` ya existente muestre `perfil`; sin comandos ni banderas nuevos. (C2)
  9. `tests/routing.test.ts` — `describe("la resolución del perfil elegido")`, un caso por criterio con el prefijo «R-PERF-002» o «R-PERF-005», sobre un directorio temporal (`mkdtempSync`, como la suite) y sin red. (C1–C14)
  10. Verificación: `npx vitest run tests/routing.test.ts` y la suite completa `npx vitest run`. (C15)
- Impactos declarados: ninguno de sincronización, migración ni contenedores (`sync_impact`, `migration_impact` y `docker_impact` en `false`). Se añade una clave opcional a un archivo de datos del proyecto que hoy no existe en este repositorio.
- Compatibilidad: sin `seleccion:` en el archivo de perfiles (`perfilesPath`) —o sin el archivo— la resolución es idéntica a la actual en los siete consumidores; el tercer parámetro de `resolveRouting` es opcional, y los campos nuevos de `ResolvedRoute` también; un `profiles.yaml` con `seleccion:` sigue leyéndose con `parsePerfiles`, que ignora esa clave.
- Rollback (obligatorio): revertir el commit del ticket en los cinco archivos; si un proyecto llegó a escribir `seleccion:` en el archivo de perfiles (`perfilesPath`), la versión anterior la ignora y el comportamiento vuelve al de hoy sin tocar datos. No hay estado que migrar.
- Pruebas para la entrega: directorio `/Users/juanandrade/Desktop/ValmenHarness`; `npx vitest run tests/routing.test.ts -t "R-PERF-00"` → los casos de perfiles en verde; `npx vitest run` → suite completa en verde. Entorno: Node 24, sin red. Validación manual opcional: con un el archivo de perfiles (`perfilesPath`) temporal que elija `claude-code-completo` para el proyecto, `valmen routing show` muestra `perfil` en la columna de origen de los roles que `routing.yaml` no fija, y el resto marcados como anulados en la API.

<!-- Los criterios de la sección siguiente se numeran C1…Cn, con una afirmación verificable por criterio
     —una frase con «y» son dos criterios—, y cada uno lleva debajo su anotación de
     verificación: un comentario HTML que dice «test:» y el comando, o «verify: manual». La
     sección no lleva comentarios dentro: un comentario con anotación se leería como la de un
     criterio. Ejemplo en la skill planificacion. -->
## Criterios de aceptación

- [x] C1 (R-PERF-002): sin perfil elegido, `resolveRouting` devuelve para cada rol el mismo proveedor, modelo, esfuerzo y origen que hoy
      <!-- test: npx vitest run tests/routing.test.ts -t "R-PERF-002 sin perfil elegido" -->
- [x] C2 (R-PERF-002): con `claude-code-completo` elegido para el proyecto y preset `quality`, `agent-plan` resuelve `claude-opus-5-5` con origen `perfil`
      <!-- test: npx vitest run tests/routing.test.ts -t "R-PERF-002 perfil del proyecto gana al preset" -->
- [x] C3 (R-PERF-002): cambiar el preset con un perfil elegido no cambia ningún rol que el perfil declara
      <!-- test: npx vitest run tests/routing.test.ts -t "R-PERF-002 el preset no sobrescribe el perfil" -->
- [x] C4 (R-PERF-002): al resolver para el ejecutor `hermes`, el perfil elegido para `hermes` gana al perfil del proyecto
      <!-- test: npx vitest run tests/routing.test.ts -t "R-PERF-002 perfil por ejecutor" -->
- [x] C5 (R-PERF-002): al resolver para un ejecutor sin elección propia se usa el perfil del proyecto
      <!-- test: npx vitest run tests/routing.test.ts -t "R-PERF-002 ejecutor sin perfil propio" -->
- [x] C6 (R-PERF-005): un rol fijado en `routing.yaml` gana al perfil elegido con origen `proyecto`
      <!-- test: npx vitest run tests/routing.test.ts -t "R-PERF-005 el override gana al perfil" -->
- [x] C7 (R-PERF-005): la ruta de un rol fijado a mano nombra en `anulaPerfil` el perfil que anula
      <!-- test: npx vitest run tests/routing.test.ts -t "R-PERF-005 el rol dice que anula el perfil" -->
- [x] C8 (R-PERF-002): una elección que nombra un perfil inexistente falla con su id en lugar de caer al preset
      <!-- test: npx vitest run tests/routing.test.ts -t "R-PERF-002 perfil elegido inexistente" -->
- [x] C9 (R-PERF-002): `elegirPerfil` con un perfil inexistente se rechaza sin escribir el archivo de perfiles (`perfilesPath`)
      <!-- test: npx vitest run tests/routing.test.ts -t "R-PERF-002 elegir perfil inexistente" -->
- [x] C10 (R-PERF-002): `elegirPerfil` con un ejecutor fuera de `EJECUTORES_CON_PERFIL` se rechaza nombrando el ejecutor
      <!-- test: npx vitest run tests/routing.test.ts -t "R-PERF-002 elegir para ejecutor desconocido" -->
- [x] C11 (R-PERF-002): guardar un perfil con `guardarPerfil` conserva la elección ya escrita en el archivo de perfiles (`perfilesPath`)
      <!-- test: npx vitest run tests/routing.test.ts -t "R-PERF-002 guardar conserva la elección" -->
- [x] C12 (R-PERF-005): `resolverModeloDeFase` usa el perfil elegido para el ejecutor de la política y su motivo nombra ese perfil
      <!-- test: npx vitest run tests/routing.test.ts -t "R-PERF-005 la fase usa el perfil del ejecutor" -->
- [x] C13 (R-PERF-005): `checkRouting` devuelve origen `perfil` en los roles que salen del perfil elegido
      <!-- test: npx vitest run tests/routing.test.ts -t "R-PERF-005 la API muestra el origen perfil" -->
- [x] C14 (R-PERF-002): `gateRoutingFor` con el preset de degradación conserva el `gate-evaluator` del perfil elegido
      <!-- test: npx vitest run tests/routing.test.ts -t "R-PERF-002 la degradación no sobrescribe el perfil" -->
- [ ] C15: la suite completa del repositorio pasa sin cambios en los casos existentes
      <!-- test: npx vitest run -->

## Puntos

```json
[]
```

## Implementación

- `packages/adapter/src/routing.ts`: `RouteSource` suma `perfil`; `ResolvedRoute` suma `perfil` y `anulaPerfil`; nuevos `SeleccionDePerfil`, `PerfilElegido`, `EJECUTORES_CON_PERFIL`, `parseSeleccionDePerfil`, `readSeleccionDePerfil`, `perfilElegido` (falla con el id si el perfil elegido no existe) y `rutasDelProyecto`; `renderPerfiles(perfiles, seleccion?)` emite `seleccion:`; `resolveRouting(routing, playwright, perfil)` con la cadena override → `playwright:` → perfil → preset → sistema. `gateRoutingFor`, `architectRoutingFor`, `uiSpecsRoutingFor` y `cascadeRoutingFor` resuelven con `rutasDelProyecto`; el `motivo` de `modeloDeFase` nombra el perfil y el ejecutor.
- `packages/engine/src/journey-phases.ts`: `resolverModeloDeFase` resuelve con el ejecutor de la política.
- `packages/server/src/routing.ts`: `checkRouting` resuelve con el perfil elegido del proyecto; nuevo `elegirPerfil` (valida perfil y ejecutor antes de escribir; `perfil: null` quita la elección); `guardarPerfil` conserva la elección vigente.
- `packages/cli/src/setup.ts`: `valmen routing show` resuelve con `rutasDelProyecto` (sin comandos ni banderas nuevos).
- `tests/routing.test.ts`: `describe("la resolución del perfil elegido")`, 15 casos (uno por C1–C14 más escritura y borrado de la elección).
- Efecto a tener en cuenta: con perfil elegido, el preset de degradación por presupuesto ya no cambia los roles que el perfil declara (C14). En este proyecto los diez roles fijados en `.valmen/routing.yaml` seguirán anulando al perfil.

## Pruebas

- `npx vitest run tests/routing.test.ts` (desde `/Users/juanandrade/Desktop/ValmenHarness`): 63 de 63 en verde, incluidos los 15 casos nuevos. `npx tsc --noEmit -p .`: sin errores.
- `npx vitest run`: 2803 pasan y 53 fallan en 12 archivos (autorizacion-*-canales, delegation, firma-de-compuerta, gate-human-decision, gate-view, hermes-notify, jornada-sin-autoaprobacion, mcp-server, qa-commit-referencia, qa-por-politica, qa-sombra). **Los mismos 53 fallan sin estos cambios** (comparado con `git stash` de `packages` y `tests`; lista idéntica). La causa que muestra gate-view es «Una sesión desatendida no puede decidir una compuerta», propia del entorno de esta sesión. Por eso C15 queda sin marcar: debe correrlo el responsable en una sesión interactiva.
- Validación manual opcional: elegir `claude-code-completo` con `elegirPerfil` en un proyecto temporal y correr `valmen routing show`; los roles que `routing.yaml` no fija muestran `perfil`.

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
    "at": "2026-10-07T18:03:48.228Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-07",
    "at": "2026-10-07T19:54:18.510Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-07",
    "at": "2026-10-07T19:55:29.917Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-07",
    "at": "2026-10-07T20:00:22.251Z",
    "action": "plan-approved",
    "actor": "cli",
    "details": "{\"actor\":\"Juan Andrade\",\"source\":\"cli\",\"quote\":\"La A, pero no quisiera que hubiera un limite diario yo soy el que deberia indicar cuantos se van a realizar en cada jornada\",\"planHash\":\"sha256:f33b6c4a045e02f0a45a8e2c6ff87a8a7a7d23b89aa41e1f0e715c86bf5658e6\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-07",
    "at": "2026-10-07T20:00:22.777Z",
    "action": "plan-approval-verified",
    "actor": "cli",
    "details": "Aprobación del plan vigente: Juan Andrade (fuente cli), plan sha256:f33b6c4a045e02f0a45a8e2c6ff87a8a7a7d23b89aa41e1f0e715c86bf5658e6."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-07",
    "at": "2026-10-07T20:00:22.777Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-07",
    "at": "2026-10-07T20:24:16.760Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-10-07",
    "at": "2026-10-07T20:30:32.776Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  }
]
```
