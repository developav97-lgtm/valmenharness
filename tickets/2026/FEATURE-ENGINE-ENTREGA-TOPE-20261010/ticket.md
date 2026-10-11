---
schema_version: 2
id: FEATURE-ENGINE-ENTREGA-TOPE-20261010
title: Medir líneas añadidas y borradas y avisar al pasar el tope
type: FEATURE
module: ENGINE
workflow_status: planned
qa_status: pending
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

# FEATURE-ENGINE-ENTREGA-TOPE-20261010

## Solicitud original

Parte del sprint: La entrega se mide, avisa al pasar el tope y el plan declara cómo partir un cambio grande.
- R-ENT-001: La integración DEBE medir y registrar las líneas añadidas y borradas del ticket
- R-ENT-002: Pasar el tope configurado DEBE avisar sin bloquear
Viene de una feature descompuesta en sprints; su plan completo está en el tickets.yaml de la feature.

Comportamiento esperado: La integración DEBE medir y registrar las líneas añadidas y borradas del ticket Pasar el tope configurado DEBE avisar sin bloquear
Comportamiento actual: la spec no lo declara; se establece en el análisis, leyendo el código.

### Supuestos y decisiones pendientes

<!-- Si el pedido nombra algo que el código no tiene —parámetro, permiso,
campo, bandera, columna, migración— y no lo especifica, listá cada elemento
con su pregunta antes de avanzar a análisis; el análisis no planifica sobre
la adivinanza. Si no hay ninguno, escribí «Ninguno» y seguí. -->
El pedido nombra dos cosas que el código no tiene. Se buscaron (`grep` de `budget`, `tope`, `numstat`, `generad` en `packages/*/src` y `.valmen/config.yaml`) y no existen; el plan las propone con un valor por defecto y la aprobación del plan las confirma o las cambia:

1. **Nombre de la clave del tope.** No hay clave de tamaño de entrega en `.valmen/config.yaml`; el precedente es `skill-budget` (aviso sin bloqueo, `packages/adapter/src/agents-size.ts:112-114`). Pregunta: ¿la clave se llama `delivery-budget` (líneas, 400 si no se declara), o prefieres otro nombre?
2. **Qué es «archivo generado».** El código no tiene esa noción para un diff; solo existe el marcador `GENERADO POR valmen` en la proyección (`packages/adapter/src/adopt-rules.ts:29`). Pregunta: ¿se excluyen del conteo, además del estado del harness, el registro (`tickets/`, `.valmen/`), los archivos que proyecta `valmen sync` y versiona el repo (`AGENTS.md`, `CLAUDE.md`) y `package-lock.json`, o la lista es otra?

## Descripción funcional

- Alcance: las dos integraciones de un ticket —la de la jornada autónoma (`integrarTicket`) y la del worktree de una corrida orquestada (`integrarWorktree`, `valmen journey worktree integrate`)— miden las líneas añadidas y borradas del ticket, las registran como evento del ticket y, si el total pasa el tope de `.valmen/config.yaml`, avisan sin detener la integración. El parte de la jornada muestra el tamaño de cada ticket que espera pruebas y marca el que pasó el tope. Fuera de alcance: R-ENT-003 (el plan declara su tamaño), que es de FEATURE-ENGINE-PLAN-TAMANO-20261010.
- Usuario o rol afectado: el PO, que lee el aviso al integrar y el parte; el orquestador de la corrida, que integra los worktrees.
- Comportamiento actual: ninguna integración mide el tamaño. `integrarWorktree` solo lee nombres de rutas (`diff --name-status -z`) para la lista de archivos prohibidos, e `integrarTicket` commitea sin contar líneas. No hay tope configurable ni aviso.
- Comportamiento esperado: al integrar, el ticket gana un evento `delivery-size` con añadidas, borradas, total y tope; si el total pasa el tope, la salida del comando dice el tamaño contra el tope y la integración termina igual (código de salida 0). Ejemplo de la spec: 120 añadidas y 30 borradas dan un evento de 150; con tope 400 y 900 líneas se integra, se avisa «900 contra 400» y el evento queda.

## Diagnóstico

- Causa comprobada (con `ruta:línea`): la funcionalidad no existe. `packages/engine/src/worktree-integrar.ts:110` arma la lista de la rama con `rutasQueCuentan(cambiosDeRuta(...))`, que solo trae rutas y estado (`packages/engine/src/rutas-tocadas.ts:13-19`, `diff --name-status -z -M -C`); no hay ninguna lectura de `--numstat` en `packages/*/src`. `packages/engine/src/integration-commit.ts:288-360` (`integrarTicket`) reparte los archivos (`repartirCambios`, `:266`), hace `git add` (`:324`) y `git commit` (`:335`) sin medir nada. La spec cita `worktree-integrar.ts:82` y `autonomous-run.ts:521`, que ya se movieron: hoy son `worktree-integrar.ts:110` y `autonomous-run.ts:674`.
- Hipótesis pendientes: (1) el git de la integración de worktrees es una lista cerrada que hoy solo admite `diff` con los argumentos fijos de `ARGUMENTOS_DE_RUTAS_TOCADAS` (`packages/engine/src/worktree-integracion-git.ts:44-49`); medir exige admitir una forma más de solo lectura, `diff --numstat -z <rango>`, y se supone que eso no amplía la autoridad de escritura; (2) el git de la jornada (`packages/engine/src/integration-rules.ts:91-101`) ya admite `diff` sin restricción de argumentos, así que `diff --cached --numstat -z` pasa sin cambiar la lista; (3) los archivos binarios salen en `--numstat` con `-` y se supone que cuentan 0 líneas.
- Consumidores afectados: `valmen journey worktree integrate` (`packages/cli/src/worktree.ts:58-71`), que imprime el resultado; la ejecución autónoma (`packages/engine/src/autonomous-run.ts:674-700`), que llama a `integrarTicket`; el parte de la jornada (`armarParteDeJornada`, `packages/engine/src/journey-handoff.ts:169`, y `renderJourneyHandoffNotification`, `packages/engine/src/notify.ts:777`), que lee el registro. El evento nuevo pasa por `appendEvent` (`packages/engine/src/mutate.ts:243`), que valida y regenera el índice.
- Archivos y flujo investigados: `integration-commit.ts` (exclusión del estado del harness `:26-33`, `repartirCambios`, `integrarTicket`), `worktree-integrar.ts` (avance directo `:156`, merge `:172`, commit del merge, recompilación `:261`), `worktree-integracion-git.ts` (lista cerrada), `integration-rules.ts` (lista de la jornada), `rutas-tocadas.ts`, `discovery.ts` (`configList` `:111`, `testTimeout` `:141`, lectores de `config.yaml`), `mutate.ts` (`appendEvent`), `journey-handoff.ts` y `notify.ts` (parte). Flujo worktree: comprobaciones → lista de la rama → avance directo o merge `--no-commit` → commit → recompilación. Flujo jornada: `qa-mechanical` → `awaiting_user_tests` → `integrarTicket` (add → commit → comprobación del hash).
- Riesgos y compatibilidad: (a) escribir el evento después del commit dejaría el ticket sucio y el siguiente `integrarTicket` de la jornada lo rechazaría como ajeno (`integration-commit.ts:310-314`); el evento tiene que entrar **en** el commit de la integración: en la jornada, tras `git add` y antes de `git commit`; en el worktree, dentro del merge `--no-commit` o en el commit del índice del avance directo; (b) un fallo al medir no puede detener una integración que la spec quiere sin bloqueo: se avisa «no se pudo medir» y se sigue; (c) el hash del árbol probado cubre solo los funcionales (`integration-commit.ts:315`), y el ticket es del registro, así que anexar el evento no rompe esa comprobación; (d) ampliar la lista cerrada de git de integración con una lectura toca un archivo de seguridad del motor: se limita a `--numstat -z <rango>` con la misma validación de referencia; (e) los eventos y tickets anteriores no cambian: el evento es nuevo y append-only.
- Impactos de sync, migración, Docker o despliegue: ninguno; cambia solo el motor local del harness (no hay sincronización, migración, contenedores ni despliegue).

## Plan

- Gate de plan y aprobación: pendiente de la aprobación del PO (gate de plan). La aprobación confirma también los dos supuestos de «Supuestos y decisiones pendientes»: el nombre de la clave (`delivery-budget`) y la lista de archivos generados que no cuentan.
- Alcance: medir, registrar y avisar en las dos integraciones (`integrarWorktree`, `integrarTicket`) y mostrar el tamaño en el parte de la jornada. Exclusiones: no se bloquea ninguna integración por tamaño; no se toca el plan ni la skill `planificacion` (R-ENT-003, ticket FEATURE-ENGINE-PLAN-TAMANO-20261010); no se cambia la vista web.
- Modo de trabajo: harness completo, porque toca varios módulos del motor (integración, git cerrado, parte) y el CLI.
- Tamaño previsto: 20 criterios; unas 180 líneas de producción y unas 350 de pruebas (unas 530 en total). Pasa el tope orientativo de 400 de la propia spec; se sigue en un ticket porque medir sin registrar ni avisar no es entregable por separado, y partir el parte (paso 7) en otro ticket es la alternativa si el PO lo prefiere.
- Pasos ordenados:
  1. Pruebas primero, en rojo (EST-010): archivo nuevo `tests/entrega-tope.test.ts`, una prueba por cada criterio C1–C17, con repositorios git reales en un directorio temporal como `tests/integracion-autonoma.test.ts` y `tests/worktree-integrar.test.ts`. Se corre y se ve en rojo antes de tocar producción. Las pruebas existentes no se editan (EST-009); si una se pone en rojo, se detiene y se reporta en el ticket. Cubre C1–C17.
  2. Módulo nuevo `packages/engine/src/tamano-entrega.ts`: `medirEntrega(salidaNumstatZ)` parte la salida de `git diff --numstat -z` (los renombres traen dos rutas), suma añadidas más borradas, cuenta 0 en un binario (`-`), descarta toda ruta bajo `.valmen/` o `tickets/` (incluye `ESTADO_DEL_HARNESS` de `integration-commit.ts:26`) y la lista de generados (`AGENTS.md`, `CLAUDE.md`, `package-lock.json`); `topeDeEntrega(root)` lee `delivery-budget` de `.valmen/config.yaml` con el mismo parser que `testTimeout` (`discovery.ts:141`) y devuelve 400 sin la clave o con un valor no positivo; `textoDelAviso(entrega)` arma la línea «La entrega de <ID> suma N líneas (+A −B), más que el tope de T. La integración sigue.». Exporta desde `packages/engine/src/index.ts`. Cubre C1–C5.
  3. `packages/engine/src/worktree-integracion-git.ts`, `motivoDeGitDeIntegracion` (`:44`): admitir además `diff --numstat -z <rango>`, con la misma validación de referencia; ninguna otra forma de `diff`. Cubre C6.
  4. `packages/engine/src/worktree-integrar.ts`, `integrarWorktree`: tras la lista de la rama (`:110`), medir con `diff --numstat -z main...<rama>` dentro de un `try`; un fallo deja `entrega: null` y un aviso «no se pudo medir». En avance directo (`:156`), tras el `merge --ff-only`, `appendEvent(paths, id, "delivery-size", {añadidas, borradas, total, tope, pasaElTope, via: "worktree"})` (`mutate.ts:243`) y un solo commit con el ticket y el índice regenerado (reemplaza el commit del índice). En merge (`:172`), el mismo `appendEvent` antes del `git commit` del merge, con `git add` de la ruta del ticket. `WorktreeIntegrado` gana `entrega` y `avisos`. Un fallo de `appendEvent` no aborta la integración: se avisa. Cubre C7–C12.
  5. `packages/cli/src/worktree.ts`, subcomando `integrate` (`:58`): imprimir «Tamaño de la entrega: N líneas (+A −B), tope T.» y cada aviso como `Aviso: …`; el código de salida no cambia. Cubre C10, C11, C12.
  6. `packages/engine/src/integration-commit.ts`, `integrarTicket` (`:288`): tras el `git add` (`:324`), medir con `diff --cached --numstat -z`, `appendEvent` con `via: "jornada"`, `git add` de la ruta del ticket y del índice, y después el `git commit` (`:335`); la comprobación del hash (`:315`) sigue cubriendo solo los funcionales. El resultado `commiteado` gana `entrega`. Un fallo al medir no rechaza el commit. Cubre C13–C15.
  7. `packages/engine/src/journey-handoff.ts`: `EntradaDePruebas` gana `entrega` opcional (los partes ya guardados en `handoffs.jsonl` no lo traen), leída del último evento `delivery-size` del ticket en `entradaDePruebas` (`:137`); `packages/engine/src/notify.ts`, `renderJourneyHandoffNotification` (`:777`): una línea `    tamaño: N líneas (+A −B)` por entrada, con « · pasa el tope de T» cuando corresponde. Cubre C16, C17.
  8. `.valmen/config.yaml`: declarar `delivery-budget: 400` con un comentario de una línea (aviso sin bloqueo, R-ENT-002).
  9. Regresión: correr `tests/worktree-integrar.test.ts`, `tests/worktree-integracion.test.ts`, `tests/worktree-cli.test.ts`, `tests/integracion-autonoma.test.ts`, `tests/jornada-handoff.test.ts` y `tests/notify.test.ts` sin editarlos. Cubre C18, C19, C20.
- Impactos declarados:
  - Sincronización: ninguna. Migración: ninguna. Contenedores: ninguno. Cambia solo el motor local; el evento nuevo es append-only y los tickets anteriores no cambian.
- Rollback (obligatorio): revertir el commit del ticket quita la medición, el aviso y la línea del parte; los eventos `delivery-size` ya escritos en tickets quedan como historial (append-only) y el motor los ignora; la clave `delivery-budget` de `config.yaml` queda sin lector y se puede borrar.

## Criterios de aceptación

- [ ] C1. `medirEntrega` da 150 líneas de total para 120 añadidas más 30 borradas
      <!-- test: npx vitest run tests/entrega-tope.test.ts -t "C1 " -->
- [ ] C2. `medirEntrega` no cuenta ninguna ruta del registro del harness (`.valmen/`, `tickets/`)
      <!-- test: npx vitest run tests/entrega-tope.test.ts -t "C2 " -->
- [ ] C3. `medirEntrega` no cuenta los archivos generados de la lista acordada
      <!-- test: npx vitest run tests/entrega-tope.test.ts -t "C3 " -->
- [ ] C4. `topeDeEntrega` devuelve 400 cuando `config.yaml` no declara `delivery-budget`
      <!-- test: npx vitest run tests/entrega-tope.test.ts -t "C4 " -->
- [ ] C5. `topeDeEntrega` devuelve el valor que declara `delivery-budget`
      <!-- test: npx vitest run tests/entrega-tope.test.ts -t "C5 " -->
- [ ] C6. La lista cerrada de git de la integración admite `diff --numstat -z <rango>`
      <!-- test: npx vitest run tests/entrega-tope.test.ts -t "C6 " -->
- [ ] C7. Tras `valmen journey worktree integrate`, el ticket tiene un evento `delivery-size` con 120 añadidas, 30 borradas, 150 de total
      <!-- test: npx vitest run tests/entrega-tope.test.ts -t "C7 " -->
- [ ] C8. Tras integrar por avance directo, el checkout principal queda sin cambios sin commitear
      <!-- test: npx vitest run tests/entrega-tope.test.ts -t "C8 " -->
- [ ] C9. Una integración con merge `--no-ff` también registra el evento `delivery-size`
      <!-- test: npx vitest run tests/entrega-tope.test.ts -t "C9 " -->
- [ ] C10. Con 900 líneas contra un tope de 400, `journey worktree integrate` termina con código de salida 0
      <!-- test: npx vitest run tests/entrega-tope.test.ts -t "C10 " -->
- [ ] C11. Con 900 líneas contra un tope de 400, la salida de `journey worktree integrate` avisa las 900 líneas contra el tope de 400
      <!-- test: npx vitest run tests/entrega-tope.test.ts -t "C11 " -->
- [ ] C12. Si la medición falla, `journey worktree integrate` integra la rama con un aviso de que no se pudo medir
      <!-- test: npx vitest run tests/entrega-tope.test.ts -t "C12 " -->
- [ ] C13. El commit que crea `integrarTicket` contiene el evento `delivery-size` del ticket
      <!-- test: npx vitest run tests/entrega-tope.test.ts -t "C13 " -->
- [ ] C14. Tras `integrarTicket`, el árbol de trabajo queda sin cambios sin commitear
      <!-- test: npx vitest run tests/entrega-tope.test.ts -t "C14 " -->
- [ ] C15. `integrarTicket` commitea un ticket de 900 líneas con un tope de 400
      <!-- test: npx vitest run tests/entrega-tope.test.ts -t "C15 " -->
- [ ] C16. El parte de la jornada muestra el tamaño de cada ticket que espera pruebas
      <!-- test: npx vitest run tests/entrega-tope.test.ts -t "C16 " -->
- [ ] C17. El parte de la jornada marca el ticket que pasó el tope
      <!-- test: npx vitest run tests/entrega-tope.test.ts -t "C17 " -->
- [ ] C18. Las pruebas existentes de `journey worktree integrate` siguen en verde sin editarse
      <!-- test: npx vitest run tests/worktree-integrar.test.ts tests/worktree-integracion.test.ts tests/worktree-cli.test.ts -->
- [ ] C19. Las pruebas existentes de `integrarTicket` siguen en verde sin editarse
      <!-- test: npx vitest run tests/integracion-autonoma.test.ts -->
- [ ] C20. Las pruebas existentes del parte de la jornada siguen en verde sin editarse
      <!-- test: npx vitest run tests/jornada-handoff.test.ts tests/notify.test.ts -->

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
    "date": "2026-10-10",
    "at": "2026-10-10T21:47:34.375Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-11",
    "at": "2026-10-11T19:08:17.413Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-11",
    "at": "2026-10-11T19:10:31.156Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  }
]
```
