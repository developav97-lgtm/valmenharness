---
schema_version: 2
id: SECURITY-ENGINE-DESPACHO-POR-PROVEEDOR-20261007
title: Lanzar cada fase con el ejecutor y el modelo de su proveedor, y detenerse si no está autorizado
type: SECURITY
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

# SECURITY-ENGINE-DESPACHO-POR-PROVEEDOR-20261007

## Solicitud original

Parte del sprint: Cada fase se despacha al ejecutor y modelo de su proveedor, sin caídas silenciosas, y el modelo usado queda registrado.
- R-PERF-004: Cada fase DEBE ejecutarse con el ejecutor y el modelo de su proveedor
Depende de: FEATURE-ADAPTER-RESOLUCION-PERFIL-20261007.
Viene de una feature descompuesta en sprints; su plan completo está en el tickets.yaml de la feature.

Comportamiento esperado: Cada fase DEBE ejecutarse con el ejecutor y el modelo de su proveedor
Comportamiento actual: la spec no lo declara; se establece en el análisis, leyendo el código.

### Supuestos y decisiones pendientes

<!-- Si el pedido nombra algo que el código no tiene —parámetro, permiso,
campo, bandera, columna, migración— y no lo especifica, listá cada elemento
con su pregunta antes de avanzar a análisis; el análisis no planifica sobre
la adivinanza. Si no hay ninguno, escribí «Ninguno» y seguí. -->
Ninguno.

## Descripción funcional

- Alcance: el despacho desatendido de una fase (`valmen run` / `runAutonomous` para implementación y `prepararTicket` para análisis) elige el **ejecutor** por el proveedor que el perfil o el enrutado asignan al rol `agent-<fase>`, lo lanza con el modelo de ese rol y, si ese ejecutor no está autorizado en `execution.dispatch-executors` o el proveedor no corresponde a ningún ejecutor conocido, se detiene con un recibo de parada que dice qué falta, sin lanzar nada. Fuera de alcance: registrar el modelo observado y compararlo (FEATURE-ENGINE-REGISTRO-MODELO-FASE-20261007), la orquestación interactiva por subagentes (FEATURE-ENGINE-ORQUESTACION-INTERACTIVA-20261007), y cambiar `.valmen/config.yaml` o la lista de ejecutores autorizados.
- Usuario o rol afectado: el PO que elige un perfil mixto (por ejemplo, implementación en Codex) y la jornada autónoma que despacha las fases.
- Comportamiento actual: la fase siempre se lanza con el único ejecutor de `autonomous.executor`; si el rol de la fase es de otro proveedor, se descarta el modelo del perfil y se usa el de la política (caída anunciada solo en el registro de fase), y nadie comprueba en el momento de lanzar que el ejecutor esté autorizado.
- Comportamiento esperado: R-PERF-004 — la fase corre con el ejecutor de su proveedor y el modelo del perfil; un ejecutor no autorizado o un proveedor no declarado detienen el despacho con el motivo y no se usa otro ejecutor.

## Diagnóstico

Memoria consultada (`buscar_memoria` «despacho de fase por proveedor ejecutor modelo perfil no autorizado»): solo AP-003 y AP-007, ninguno sobre este síntoma; no hay causa raíz previa que citar.

- Causa comprobada (con `ruta:línea`):
  - `packages/engine/src/autonomous-run.ts:348-351`: el ejecutor de la fase es siempre `policy.executor`; el modelo de la fase solo reemplaza `model` y `effort`, nunca el `id` del ejecutor. Una fase de Codex con política `claude` no puede lanzarse con Codex.
  - `packages/adapter/src/routing.ts:1049-1053` y `:1063-1080` (`modeloDeFase`): si el proveedor del rol no es el del ejecutor de la política, **cae** al modelo de la política (`origen: "politica"`) en vez de detenerse; la spec (`.valmen/features/perfiles-de-modelos/spec/perfiles/spec.md:44-57`) exige lo contrario.
  - `packages/engine/src/journey-preparation.ts:199-202`: la preparación (fase analysis) repite el mismo patrón vía `resolverModeloDeFase` (`packages/engine/src/journey-phases.ts:87-91`), que solo resuelve con el ejecutor de la política.
  - `packages/cli/src/run.ts:20`: `valmen run` no pasa `modelo` ni `fase`, así que la implementación desde el CLI ignora el perfil por completo.
  - La autorización del proyecto (`execution.dispatch-executors`, leída en `packages/adapter/src/config.ts:951` y expuesta por `canDispatch` en `packages/engine/src/journey-authorization.ts:24`) solo se consulta al **armar** o **seleccionar** la jornada (`packages/engine/src/journey-plan.ts:100`, `packages/engine/src/journey-selection.ts:193`), nunca en el momento de lanzar en `runAutonomous` ni en `prepararTicket`.
  - El registro de fase anota `politica.executor.id` como ejecutor (`packages/engine/src/autonomous-run.ts:304-313`, `packages/engine/src/journey-preparation.ts:166-170`), no el que realmente se lanzó.
- Hipótesis pendientes: ninguna sobre la causa. Queda por confirmar en la implementación que `autonomousExecutorCommand` (`packages/engine/src/autonomous-run.ts:156-177`) ya construye bien los tres ejecutores conocidos (`AUTONOMOUS_EXECUTORS`, `packages/adapter/src/config.ts:692`); la prueba existente «no acepta comandos libres» lo cubre.
- Consumidores afectados:
  - `packages/cli/src/run.ts` (`valmen run`), `packages/engine/src/journey-preparation.ts` (`prepararTicket`, vía `packages/engine/src/journey-advance.ts`) y `packages/engine/src/autonomous-run.ts` (`runAutonomous`).
  - `packages/engine/src/journey-phases.ts` (`resolverModeloDeFase`) y sus pruebas: `tests/jornada-ejecucion.test.ts`, `tests/jornada-topes.test.ts`, `tests/routing.test.ts:997`.
  - `packages/engine/src/autonomous-stops.ts:14-24` (lista de razones de parada) y su lector `packages/cli/src/hermes.ts:803`, que reenvía cualquier razón válida al vigilante de avisos (Telegram); una razón nueva fuera de la lista se descartaría al leer (`packages/engine/src/autonomous-stops.ts:73`).
  - `packages/adapter/src/routing.ts` (`fasesDeSesion`, `:1195`) ya remite a R-PERF-004 para fases de otro proveedor; no cambia.
- Archivos y flujo investigados: `config.yaml` → `autonomousConfig` (`packages/engine/src/discovery.ts:249`) → `resolverModeloDeFase` → `modeloDeFase` (`rutasDelProyecto`, `packages/adapter/src/routing.ts:1359`, perfil del ejecutor o del proyecto desde `.valmen/profiles.yaml`) → `autonomousExecutorCommand` → `spawnSync` sin shell (`packages/engine/src/autonomous-run.ts:196`) → `registrarFase`. Perfiles y enrutado: `.valmen/routing.yaml:35-50` (las cuatro fases en `claude-code`) y `.valmen/config.yaml:58-68` (`dispatch-executors: [claude]`, `autonomous.executor.id: claude`).
- Riesgos y compatibilidad:
  - Cambio de comportamiento deliberado: la prueba `tests/jornada-ejecucion.test.ts:212` («un rol de otro proveedor… cae al modelo de la política») afirma la caída que la spec prohíbe; se reescribe para afirmar la parada.
  - Con la configuración actual del proyecto (todo `claude-code` y `dispatch-executors: [claude]`) el resultado es idéntico al de hoy: mismo ejecutor y mismo modelo.
  - Seguridad: lanzar otro binario amplía lo que corre sin supervisión; por eso el ejecutor solo sale de la tabla fija de proveedores conocidos y debe estar en `dispatch-executors` (decisión humana en `config.yaml`); el proveedor lo decide el perfil, nunca el nombre del modelo. El comando sigue sin shell y los recibos y el registro de fase llevan solo ids de proveedor, ejecutor, fase y modelo, nunca variables de entorno ni credenciales.
- Impactos de sync, migración, Docker o despliegue: ninguno; cambia código del motor y el adaptador, sin datos sincronizados, migraciones, contenedores ni despliegue.

## Plan

- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan).
- Alcance y exclusiones: solo el despacho desatendido de fases (`runAutonomous`, `prepararTicket`, `valmen run`). No se toca `.valmen/config.yaml`, `.valmen/profiles.yaml` ni `.valmen/routing.yaml`, no se amplía `execution.dispatch-executors`, no se añaden ejecutores a `AUTONOMOUS_EXECUTORS` y no se registra el modelo observado (ticket siguiente del sprint).
- Decisión para el PO al aprobar: si el rol `agent-<fase>` no tiene modelo, el plan conserva el ejecutor y el modelo de `autonomous.executor` (no hay cambio de proveedor, solo falta de dato) y lo dice en el registro de fase; la alternativa es detenerse también en ese caso.
- Pasos ordenados:
  1. En `packages/adapter/src/routing.ts`, junto a `modeloDeFase`, crear `despachoDeFase(rutas, fase, politica, autorizados)` puro: toma `routeFor(rutas, "agent-<fase>")`; traduce `ruta.provider` a ejecutor con la inversa de `PROVEEDOR_DEL_EJECUTOR` (nunca mirando el nombre del modelo); un proveedor sin ejecutor conocido devuelve `{ ok: false, motivo: "el proveedor <p> de agent-<fase> no está declarado como ejecutor" }`; un ejecutor fuera de `autorizados` devuelve `{ ok: false, motivo: "el ejecutor <e> de agent-<fase> no está autorizado en execution.dispatch-executors" }`; si coincide, `{ ok: true, ejecutor, model: ruta.model, effort, origen: "rol", motivo }`, con `effort` `auto` → esfuerzo de la política. Rol sin modelo → ejecutor y modelo de la política con `origen: "politica"`, y también exige que ese ejecutor esté autorizado. El motivo solo lleva ids de proveedor, ejecutor, fase y rol. Exportarlo desde `packages/adapter/src/index.ts`. `modeloDeFase` queda como estaba para `fasesDeSesion`. (C1, C2, C3, C5, C6, C11)
  2. En `packages/engine/src/journey-phases.ts`, agregar `resolverDespachoDeFase(root, fase)`: lee `autonomousConfig(root)` y `readExecutionCapabilities` del `config.yaml` (la misma lectura que `packages/engine/src/journey-authorization.ts`), resuelve `rutasDelProyecto(root, { ejecutor })` con el ejecutor del perfil elegido y llama a `despachoDeFase`. `resolverModeloDeFase` queda como envoltorio que devuelve el modelo solo cuando el despacho es `ok`. (C1, C3, C10)
  3. En `packages/engine/src/autonomous-stops.ts`, añadir `"executor-unauthorized"` a `AUTONOMOUS_STOP_REASONS` (parada que no depende de `stop-on`), para que `readAutonomousStops` la conserve y `packages/cli/src/hermes.ts` la lleve al vigilante de avisos sin cambios. (C4, C13)
  4. En `packages/engine/src/autonomous-run.ts` (`runAutonomousInner`), antes de `transition(... "in_progress")`: si `request.modelo` no viene, resolver con `resolverDespachoDeFase(root, request.fase ?? "implementation")`; si no es `ok`, `recordAutonomousStop` con `executor-unauthorized`, el motivo y `workflowStatus: "approved"`, sin invocar `execute` ni mover el ticket. Si es `ok`, construir el comando con `autonomousExecutorCommand({ id: despacho.ejecutor, model, effort }, ...)`. En `runAutonomous`, `registrarFase` anota `ejecutor: despacho.ejecutor`. El entorno que se pasa sigue siendo solo `{ VALMEN_UNATTENDED: "1" }`. (C1, C2, C3, C4, C5, C6, C8, C9, C10)
  5. En `packages/engine/src/journey-preparation.ts` (`prepararTicketInner` y el registro de `prepararTicket`), usar `resolverDespachoDeFase(paths.root, "analysis")`: si no es `ok`, devolver la parada `executor-unauthorized` sin llamar al preparador; si lo es, lanzar el ejecutor del despacho y registrarlo en `registrarFase`. (C7, C8)
  6. Pruebas en archivos existentes, con el prefijo «R-PERF-004 Cn:» en el nombre: en `tests/routing.test.ts` los casos puros de `despachoDeFase` (C5, C6, C11); en `tests/jornada-ejecucion.test.ts` los casos de `runAutonomous` con un `execute` espía y `dispatch-executors` del laboratorio (C1, C2, C3, C4, C8, C9, C10), reescribiendo `tests/jornada-ejecucion.test.ts:212` para que afirme la parada en lugar de la caída a la política; en `tests/jornada-preparacion.test.ts` el caso de análisis (C7); en `tests/autonomous-stops.test.ts` la lectura de la nueva razón (C13). El control de credenciales (C9) siembra en `process.env` un valor ficticio con forma de clave, generado en la prueba, y comprueba que no aparece en el comando, en `.valmen/autonomous-stops.jsonl` ni en el registro de fases. (C1–C11, C13)
  7. Correr `npx vitest run tests/routing.test.ts tests/jornada-ejecucion.test.ts tests/jornada-preparacion.test.ts tests/jornada-topes.test.ts tests/autonomous-stops.test.ts tests/autonomous-run.test.ts` y `npx tsc --noEmit -p tsconfig.json`; esperar cero fallos y cero errores. (C12, y la regresión de C1–C11, C13)
  8. Entrega: escribir en `## Pruebas` el contrato (comandos del paso 7, directorio: raíz del worktree, resultado esperado, validación manual de C14 y requisito de ambiente: Node 24 sin credenciales reales), marcar `- [x]` lo verificado, registrar el consumo de IA, correr `valmen secrets` y la compuerta `qa-mechanical`, y pasar a `awaiting_user_tests`. Sin commit hasta la confirmación del responsable. (C14)
- Impactos declarados: ninguno de sincronización, migración ni contenedores (`sync_impact`, `migration_impact` y `docker_impact` en `false`). Impacto de seguridad: el despacho puede lanzar un binario distinto al de la política, acotado a la tabla fija `AUTONOMOUS_EXECUTORS` y a `execution.dispatch-executors`.
- Rollback (obligatorio): revertir el commit del ticket con `git revert <hash>` restaura el despacho con el único ejecutor de la política; no hay datos ni esquemas que deshacer. Los renglones `executor-unauthorized` ya escritos en `.valmen/autonomous-stops.jsonl` son append-only y se quedan; tras revertir, el lector los descarta por razón desconocida (`packages/engine/src/autonomous-stops.ts:73`), sin romper la lectura.

<!-- Los criterios de la sección siguiente se numeran C1…Cn, con una afirmación verificable por criterio
     —una frase con «y» son dos criterios—, y cada uno lleva debajo su anotación de
     verificación: un comentario HTML que dice «test:» y el comando, o «verify: manual». La
     sección no lleva comentarios dentro: un comentario con anotación se leería como la de un
     criterio. Ejemplo en la skill planificacion. -->
## Criterios de aceptación

- [x] C1 (R-PERF-004): una fase cuyo rol es del proveedor `codex`, con `codex` autorizado, se lanza con el binario `codex`.
      <!-- test: npx vitest run tests/jornada-ejecucion.test.ts -t "R-PERF-004 C1:" -->
- [x] C2 (R-PERF-004): esa fase se lanza con el modelo que el perfil asigna al rol.
      <!-- test: npx vitest run tests/jornada-ejecucion.test.ts -t "R-PERF-004 C2:" -->
- [x] C3 (R-PERF-004): una fase cuyo ejecutor no está en `execution.dispatch-executors` no invoca a ningún ejecutor.
      <!-- test: npx vitest run tests/jornada-ejecucion.test.ts -t "R-PERF-004 C3:" -->
- [x] C4 (R-PERF-004): esa fase deja un recibo de parada `executor-unauthorized` que nombra el ejecutor y la fase.
      <!-- test: npx vitest run tests/jornada-ejecucion.test.ts -t "R-PERF-004 C4:" -->
- [x] C5 (R-PERF-004): un proveedor sin ejecutor declarado se rechaza con un motivo que nombra el proveedor.
      <!-- test: npx vitest run tests/routing.test.ts -t "R-PERF-004 C5:" -->
- [x] C6 (R-PERF-004): el ejecutor sale del proveedor del perfil, no del nombre del modelo.
      <!-- test: npx vitest run tests/routing.test.ts -t "R-PERF-004 C6:" -->
- [x] C7 (R-PERF-004): la preparación de análisis con un proveedor no autorizado no lanza el preparador.
      <!-- test: npx vitest run tests/jornada-preparacion.test.ts -t "R-PERF-004 C7:" -->
- [x] C8 (R-PERF-004): el registro de fase anota el ejecutor que realmente se lanzó.
      <!-- test: npx vitest run tests/jornada-ejecucion.test.ts -t "R-PERF-004 C8:" -->
- [x] C9 (R-PERF-004): ni el comando, ni el recibo de parada, ni el registro de fase contienen el valor de una credencial del entorno.
      <!-- test: npx vitest run tests/jornada-ejecucion.test.ts -t "R-PERF-004 C9:" -->
- [x] C10 (R-PERF-004): `runAutonomous` sin modelo explícito, como lo llama `valmen run`, resuelve el despacho de implementación desde el perfil.
      <!-- test: npx vitest run tests/jornada-ejecucion.test.ts -t "R-PERF-004 C10:" -->
- [x] C11 (R-PERF-004): con la configuración actual del proyecto, la implementación se despacha a `claude` con `claude-sonnet-5-5`.
      <!-- test: npx vitest run tests/routing.test.ts -t "R-PERF-004 C11:" -->
- [x] C12 (R-PERF-004): el monorepo compila sin errores de tipos.
      <!-- test: npx tsc --noEmit -p tsconfig.json -->
- [x] C13 (R-PERF-004): `readAutonomousStops` conserva un recibo `executor-unauthorized`.
      <!-- test: npx vitest run tests/autonomous-stops.test.ts -t "R-PERF-004 C13:" -->
- [x] C14 (R-PERF-004): el contrato de entrega queda escrito en `## Pruebas` con comandos, directorio, resultado esperado y requisitos de ambiente.
      <!-- verify: manual -->

## Puntos

```json
[
  {
    "id": "POINT-001",
    "title": "Verificación del cierre de SECURITY-ENGINE-DESPACHO-POR-PROVEEDOR-20261007",
    "status": "closed",
    "severity": "normal",
    "actual": "La implementación está entregada y falta cerrar su QA.",
    "expected": "Los criterios del ticket se cumplen y sus pruebas dan el resultado esperado.",
    "evidence": [
      "EVIDENCE-001"
    ],
    "affected_files": [
      "packages/adapter/src/routing.ts",
      "packages/engine/src/autonomous-run.ts",
      "packages/engine/src/autonomous-stops.ts",
      "packages/engine/src/journey-phases.ts",
      "packages/engine/src/journey-preparation.ts",
      "tests/autonomous-run.test.ts"
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

- `packages/adapter/src/routing.ts`: `despachoDeFase` (puro). El ejecutor sale del proveedor del rol `agent-<fase>` con la inversa de `PROVEEDOR_DEL_EJECUTOR`, nunca del nombre del modelo; proveedor desconocido o ejecutor fuera de `execution.dispatch-executors` devuelven el motivo (solo ids). Rol sin modelo: ejecutor y modelo de la política, anotado en el registro de fase (decisión del PO al aprobar), también exige autorización.
- `packages/engine/src/journey-phases.ts`: `resolverDespachoDeFase` (lee `config.yaml` y el perfil del ejecutor de la política).
- `packages/engine/src/autonomous-stops.ts`: razón `executor-unauthorized`.
- `packages/engine/src/autonomous-run.ts`: `runAutonomous` resuelve siempre el despacho desde el perfil (también para `valmen run`); `request.modelo` queda obsoleto y no salta la autorización. Si no está autorizado: recibo de parada, ticket en `approved`, ningún ejecutor lanzado. El registro de fase anota el ejecutor lanzado (`ninguno` si se detuvo). El entorno sigue siendo solo `VALMEN_UNATTENDED`.
- `packages/engine/src/journey-preparation.ts`: la preparación (análisis) usa el mismo despacho; si no está autorizado devuelve el estado `no-autorizado` con la parada `executor-unauthorized` y no llama al preparador.
- Pruebas: `tests/routing.test.ts`, `tests/jornada-ejecucion.test.ts` (se reescribió la prueba de la caída a la política para que afirme la parada), `tests/jornada-preparacion.test.ts`, `tests/autonomous-stops.test.ts`; `tests/autonomous-run.test.ts` declara `dispatch-executors: [codex]` en su laboratorio, que antes dependía de que nadie lo comprobara.

## Pruebas

Directorio de ejecución: raíz del repositorio (o del worktree). Requisito de ambiente: Node 24, sin credenciales reales.

1. `npx vitest run tests/routing.test.ts tests/jornada-ejecucion.test.ts tests/jornada-preparacion.test.ts tests/jornada-topes.test.ts tests/autonomous-stops.test.ts tests/autonomous-run.test.ts` — esperado: 6 archivos, 139 pruebas, 0 fallos.
2. `npx tsc --noEmit -p tsconfig.json` — esperado: sin errores.

Validación manual (C14): revisar que esta sección lleve los comandos, el directorio, el resultado esperado y el requisito de ambiente. Revisión de seguridad sugerida al PO: confirmar que `.valmen/config.yaml` sigue con `dispatch-executors: [claude]` y que un perfil con un rol de otro proveedor detiene la fase con `executor-unauthorized` en `.valmen/autonomous-stops.jsonl`.

- Resultado del PO: «cierra los tickets de SECURITY (y sí apruebo el plan CONTRATO-APROBACION)» — Juan Andrade, 2026-10-08. Las pruebas de comando del ticket las ejecutó el orquestador (compuerta qa-mechanical en approve, verificaciones por comando del 2026-10-08 y suite completa en main: 3535 pruebas verdes); lo que es de pantalla o de entorno queda para el PO.

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
    "po_confirmation": "«cierra los tickets de SECURITY (y sí apruebo el plan CONTRATO-APROBACION)» — Juan Andrade, 2026-10-08"
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
    "reference": "worktree:sha256:1d1a5b603d0e4732b2eaada11a5e137b99cdbc4ff88c7ffb6b428b392d213949",
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
    "po_confirmation": "«cierra los tickets de SECURITY (y sí apruebo el plan CONTRATO-APROBACION)» — Juan Andrade, 2026-10-08"
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
    "functional_summary": "Lanzar cada fase con el ejecutor y el modelo de su proveedor, y detenerse si no está autorizado",
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
    "notes": "Sesión de implementación sin agregado expuesto.",
    "input_tokens": null,
    "output_tokens": null,
    "total_tokens": null,
    "estimated_cost_usd": null,
    "source": "manual: subagente implementación (claude-sonnet-5-5); sin números de sesión disponibles",
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
    "notes": "Agente claude-code. Sesión **compartida**: trabajó 34 tickets (FEATURE-ENGINE-JORNADA-OLA-20261008 ×115, SECURITY-ENGINE-APROBACION-POR-REVISOR-20261007 ×104, FEATURE-ENGINE-ORQUESTACION-INTERACTIVA-20261007 ×102, FEATURE-ENGINE-JORNADA-HANDOFF-20261008 ×84, BUGFIX-CLI-CANAL-DECISION-20261005 ×83), así que su costo no se reparte y acá no se registran números. Costo completo de la sesión: no declarado por el proveedor, 16594466 tokens. Registralo en el ticket cuya sesión sea propia, o declaralo compartido donde corresponda. Sesión \"ValmenHarness CLI attachments feature\".",
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
    "at": "2026-10-07T18:03:48.347Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-08",
    "at": "2026-10-08T21:19:13.003Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-08",
    "at": "2026-10-08T21:20:35.304Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-08",
    "at": "2026-10-08T21:22:56.413Z",
    "action": "plan-approved",
    "actor": "cli",
    "details": "{\"actor\":\"Juan Andrade\",\"source\":\"cli\",\"quote\":\"La A (aprueba el plan de SECURITY-ENGINE-DESPACHO-POR-PROVEEDOR: una fase sin modelo en el perfil usa el ejecutor y modelo de la política, anotado en el registro)\",\"planHash\":\"sha256:249018dcec80c7b30dc19a8f6e5d220e2297a06b85105b08e1da684141da174a\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-08",
    "at": "2026-10-08T21:22:56.969Z",
    "action": "plan-approval-verified",
    "actor": "cli",
    "details": "Aprobación del plan vigente: Juan Andrade (fuente cli), plan sha256:249018dcec80c7b30dc19a8f6e5d220e2297a06b85105b08e1da684141da174a."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-08",
    "at": "2026-10-08T21:22:56.969Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-08",
    "at": "2026-10-08T21:23:27.911Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-10-08",
    "at": "2026-10-08T21:27:16.303Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-10-08",
    "at": "2026-10-08T21:27:17.193Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-10-08",
    "at": "2026-10-08T22:21:25.681Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-10-08",
    "at": "2026-10-08T22:21:26.071Z",
    "action": "point-added",
    "actor": "cli",
    "details": "Se agregó POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-10-08",
    "at": "2026-10-08T22:21:26.505Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-10-08",
    "at": "2026-10-08T22:21:27.005Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-014",
    "date": "2026-10-08",
    "at": "2026-10-08T22:21:27.504Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-015",
    "date": "2026-10-08",
    "at": "2026-10-08T22:21:28.105Z",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-016",
    "date": "2026-10-08",
    "at": "2026-10-08T22:21:28.645Z",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-017",
    "date": "2026-10-08",
    "at": "2026-10-08T22:21:29.017Z",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-001 para POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-018",
    "date": "2026-10-08",
    "at": "2026-10-08T22:21:29.384Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: verified -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-019",
    "date": "2026-10-08",
    "at": "2026-10-08T22:21:29.761Z",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-020",
    "date": "2026-10-08",
    "at": "2026-10-08T22:21:30.155Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-021",
    "date": "2026-10-08",
    "at": "2026-10-08T22:21:30.526Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-002."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-022",
    "date": "2026-10-08",
    "at": "2026-10-08T22:21:32.103Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-003."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-023",
    "date": "2026-10-08",
    "at": "2026-10-08T22:21:32.276Z",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-024",
    "date": "2026-10-08",
    "at": "2026-10-08T22:21:32.598Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  }
]
```
