---
schema_version: 2
id: FEATURE-CLI-ADJUNTOS-FEATURE-Y-CORRIDA-AUTONOMA-20261006
title: Adjuntos de diseño en la feature y modo de corrida autónoma de features y tickets
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
created: 2026-10-06
updated: 2026-10-06
related_ticket: null
target_release: null
released_in: null
---

# FEATURE-CLI-ADJUNTOS-FEATURE-Y-CORRIDA-AUTONOMA-20261006

## Solicitud original

Pedido del PO (2026-10-06), a partir de la corrida de la feature precarga-catalogos en SaiOpenCloud.

QUÉ PASÓ. La propuesta de diseño de la feature (un prototipo en un artefacto de claude.ai) se aprobó al crearla, pero en la feature solo quedó el ENLACE (.valmen/features/precarga-catalogos/feature.md:81 y spec/pantalla/spec.md:3). El enlace es privado y los agentes que implementan no lo pueden abrir: construyeron las pantallas desde el texto de la spec y no desde el prototipo aprobado. La pantalla de carga y la de detalle salieron distintas al prototipo, el PO tuvo que devolverlas y pegar de nuevo capturas y el enlace en una sesión que ya estaba corriendo. Lo mismo pasaría con cualquier archivo que nazca al crear una feature (diseños, listados de requisitos, capturas, documentos del cliente): hoy no hay dónde anexarlo.

PEDIDO 1 — Adjuntos de la feature. Todo archivo o presentación gráfica generado al crear una feature debe poder anexarse a ella, vivir en el repositorio (.valmen/features/<slug>/assets/, con manifiesto) y llegar a los agentes que trabajan sus tickets. Si el origen es un artefacto o un enlace, se guarda una copia local del contenido: un enlace no es evidencia. La spec debe poder referenciar el adjunto por ruta, y los tickets que la feature materializa deben heredar la sección de referencias con esas rutas, para que el agente de cada ticket y la validación visual (skill validacion-ui) comparen contra el original. Un enlace externo en una spec sin copia local debe avisar.

PEDIDO 2 — Modo de corrida autónoma. El PO pidió en un solo prompt correr una feature completa y quedó muy conforme con el resultado: recorrer los tickets en el orden del grafo; el agente revisa las compuertas de análisis y de plan y las aprueba él mismo, registrando el motivo cuando una REVIEW se aprueba; las pruebas de consola o Docker las ejecuta el agente y, si dan el resultado esperado, aprueba el QA, lo documenta y cierra el ticket; los tickets visuales quedan en awaiting_user_tests y se sigue con el siguiente; commit local por ticket y push al final o cuando el PO lo ordene; los criterios manuales que solo puede verificar el PO quedan anotados como suyos. Esto debe quedar preconfigurado como un MODO del harness —para una feature completa o para N tickets uno tras otro— que el agente active, verifique y ejecute, sin reescribir scripts cada vez. Debe respetar los gates humanos duros (despliegue, migraciones en producción, seguridad, force-push). Debe registrar la delegación del PO en el recibo con sus palabras.

PEDIDO 3 — Cierre de la feature. No existe comando para avanzar el estado de una feature ni para escribir su verify.md; hoy se llamó a advanceFeature del motor con un script. El modo de corrida debe cerrar la feature (decomposed → in_progress → complete) con su verify.md cuando todos sus tickets estén cerrados.

PEDIDO 4 — Configuración en los dos proyectos. El modo debe quedar disponible en el harness (CLI, MCP y skill) y proyectarse a SaiOpenCloud por valmen sync, de modo que otra feature —incluida una del propio harness— se pueda lanzar así.

Referencia técnica de la corrida real: docs/referencia-corrida-autonoma/ (scripts y fricciones medidas).

### Supuestos y decisiones pendientes

<!-- Si el pedido nombra algo que el código no tiene —parámetro, permiso,
campo, bandera, columna, migración— y no lo especifica, listá cada elemento
con su pregunta antes de avanzar a análisis; el análisis no planifica sobre
la adivinanza. Si no hay ninguno, escribí «Ninguno» y seguí. -->
Ninguno.

## Descripción funcional

- Alcance: tres capacidades nuevas del CLI, el MCP y las skills del harness. (1) Adjuntos de feature: `.valmen/features/<slug>/assets/` con `manifest.json`, heredados por los tickets materializados y avisados cuando una spec solo trae un enlace externo. (2) Modo de **delegación** del PO —se llama así y no «autónomo» porque `autonomous-run.ts` ya es otra cosa: un ejecutor externo que escribe código— que registra las palabras del PO y automatiza el recorrido por el grafo: siguiente ticket, compuertas con decisión de las REVIEW con motivo, y cierre por QA delegado. (3) `valmen feature advance` y `valmen feature verify`, que cierran la feature (decomposed → in_progress → complete) con su `verify.md`. Queda fuera: ejecutar `valmen sync` sobre SaiOpenCloud (lo corre la persona, ver Rollback), cambiar las compuertas o sus umbrales, y tocar `autonomous-run.ts`.
- Usuario o rol afectado: el PO que delega una feature o N tickets en un solo pedido; el agente que trabaja los tickets; el agente de validación visual, que compara contra el original.
- Comportamiento actual: de un diseño aprobado solo queda el enlace (privado, ilegible para los agentes); no hay dónde anexar archivos a una feature. Recorrer una feature entera exige reescribir scripts (`docs/referencia-corrida-autonoma/`), con cinco fricciones medidas. No hay comando para avanzar el estado de una feature ni para escribir `verify.md`.
- Comportamiento esperado: `valmen feature asset add` copia el archivo byte a byte al repositorio y lo anota con su sha256; `materialize` escribe en cada ticket la sección de referencias con esas rutas. `valmen delegation grant|status|next|gates|close` y `valmen feature advance|verify` hacen el recorrido sin scripts, se detienen ante BLOCK y ante impactos de gate humano duro, y dejan las palabras del PO en cada recibo.

## Diagnóstico

- Archivos y flujo investigados:
  - Adjuntos. `engine/src/features.ts:60` (`FeatureArtifacts`) y `:115` (`leerArtefactos`) solo conocen spec, design, tickets.yaml y verify; no hay noción de assets. `engine/src/materialize.ts:144` (`solicitudDe`) arma la solicitud del ticket solo con los requisitos que cubre y el objetivo del sprint: no hereda referencias. `engine/src/spec.ts` lee los requisitos sin mirar enlaces. `cli/src/features.ts:370` despacha `new|show|list|decompose|materialize|attach|detach`.
  - Cierre de feature. `engine/src/features.ts:275` (`advanceFeature`) y `:337` (`featureTransitionPath`) ya implementan la transición y el camino más corto, pero ningún comando del CLI ni herramienta del MCP los expone (única referencia: el script de node de la corrida). `leerArtefactos` ya detecta `verify.md`, pero nada lo escribe.
  - Corrida. `docs/referencia-corrida-autonoma/advance.py`, `finish.py` y `close_po.py` repiten la misma secuencia por ticket. Las cinco fricciones de `LEEME.md` salen de pasos que hoy el agente arma a mano: `add-point` sin `--files` (`affected_files` vacío), `qa-start` con un SHA viejo (`engine/src/append.ts:447-473` exige que el árbol coincida con `commit:<sha>`), el HEAD vigente en tickets visuales, el avance de la feature y el consumo `manual:`.
  - Superficie a cablear: `cli/src/main.ts` (uso y despacho; `gate-decide` en `:236`), `mcp/src/tools.ts` (`materializar_feature` en `:1529` como molde de herramienta que solo agrega), `.valmen/skills/` como fuente de las skills y su proyección (`valmen sync`, `.claude/skills/`).
  - Memoria: `buscar_memoria` no devolvió resultados utilizables en este tema; el ticket parte del código y de la referencia de la corrida.
- Causa raíz o hipótesis: no es un defecto sino una capacidad que falta. Hipótesis de diseño, a confirmar con las pruebas: (a) los adjuntos se tratan como evidencia local y no se descarga ningún enlace, porque `core` no toca la red y un artefacto privado no se puede leer; el agente o la persona entrega el archivo y el comando lo copia con `fs.copyFileSync` (invariante 2: nada de bytes por el modelo); (b) la delegación es un **registro** (`.valmen/delegations/<id>.json`, solo se agrega) más comandos que componen funciones que ya existen, sin lógica de compuertas nueva; (c) las decisiones de REVIEW usan `gate-decide` tal cual, con actor y motivo, de modo que el recibo conserva las palabras del PO.
- Riesgos y compatibilidad:
  - Una delegación mal alcanzada amplía la autoridad del agente. Mitigación: la delegación declara su alcance (feature o lista de tickets) y los comandos se niegan fuera de él; BLOCK nunca se aprueba, y un ticket con `sync_impact`, `migration_impact`, `docker_impact` o `risk_level` crítico, o que toque seguridad o despliegue, se detiene con aviso aunque la compuerta diera REVIEW. El modo no puede cambiar umbrales ni el gate que lo evalúa.
  - Aprobar el plan «por delegación» debe quedar atribuido a la política humana y no al modelo (estándar «Escalada tras dos bloqueos»): la línea de aprobación del plan cita el id de la delegación y las palabras del PO.
  - Compatibilidad: los tickets y features existentes no cambian; `assets/` es opcional y una feature sin adjuntos se comporta igual. `manifest.json` es nuevo y solo se agrega.
  - Solape con el feature `autonomia-confiable` (s5-jornada-autonoma, s6-qa-agente): este ticket construye el modo en sesión; ese feature lo usará en la Parte 2. Se evita duplicar nombres: comando `delegation`, no `autonomous`.
  - Tamaño del AGENTS.md: hay presupuesto (`agents-md-tamano.test.ts`); el detalle va a las skills, y a la plantilla solo una línea.
  - La proyección a SaiOpenCloud escribe en otro repositorio: la corre una persona.
- Impactos de sync, migración, Docker o despliegue: ninguno sobre el producto; es el propio harness. Sin sync de datos, sin migraciones, sin contenedores, sin despliegue. `valmen sync` hacia SaiOpenCloud queda como paso manual.

## Plan

- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan), 2026-10-06, en chat: «Si dale vamos con tu recomendación»; compuerta `plan` en APPROVE (cascada), recibo en `.valmen/receipts/FEATURE-CLI-ADJUNTOS-FEATURE-Y-CORRIDA-AUTONOMA-20261006.jsonl`.
- Alcance: los comandos `feature asset`, `feature advance`, `feature verify` y `delegation`, sus herramientas MCP, la herencia de referencias en `materialize` y la skill `corrida-delegada`. Exclusiones: ejecutar `valmen sync` sobre SaiOpenCloud, cambiar umbrales o compuertas, y tocar `autonomous-run.ts`. Tres bloques que se prueban por separado, en este orden: A) adjuntos, B) cierre de feature, C) delegación; C usa a B.
- Pasos ordenados:
  1. Bloque A — `packages/engine/src/feature-assets.ts` (nuevo): `attachFeatureAsset({root, slug, source, name?, description, originUrl?})` copia con `copyFileSync` a `.valmen/features/<slug>/assets/<name>`, calcula sha256 y tamaño, y agrega la entrada a `assets/manifest.json` (solo agrega, bajo `MutationLock`; un nombre repetido con otro contenido falla); `listFeatureAssets`; `externalLinkWarnings(root, slug)` que busca `https?://` en `feature.md`, `design.md` y `spec/**/spec.md` y avisa por cada enlace sin copia local en el manifiesto (`origin_url` igual). Exportar desde `engine/src/index.ts`. Añadir `hasAssets` a `FeatureArtifacts` (`features.ts:60`, `:115`). Los adjuntos son una capa opcional: sin carpeta `assets/` ningún comportamiento existente cambia.
  2. Bloque A — `engine/src/materialize.ts`: nueva `referenciasDe(requisitos, cubre, assets)` y su uso en `solicitudDe` (`:144`), que devuelve la cadena vacía —y deja la solicitud byte a byte igual a la de hoy— cuando la feature no tiene adjuntos (compatibilidad hacia atrás, probada en `tests/materializar-feature.test.ts`): bajo la solicitud escribe `### Referencias de diseño` con las rutas `assets/<nombre>` que citan los requisitos que el ticket cubre; si ninguno cita, lista todas las de la feature. `materialize` y `feature show` imprimen los avisos de enlaces externos.
  3. Bloque A — `cli/src/features.ts`: subcomando `asset add|list` (`valmen feature asset add <slug> --file <ruta> --description <t> [--name] [--origin-url]`); `main.ts`: texto de uso. `mcp/src/tools.ts`: herramienta `anexar_adjunto_a_feature` (mismas anotaciones que `materializar_feature`).
  4. Bloque B — `engine/src/feature-verify.ts` (nuevo): `writeFeatureVerify({root, slug, allowPendingPo})` lee el grafo (`readDecomposition`), el estado de cada ticket y su cierre, y escribe `verify.md` con una fila por ticket (estado, commit, evidencia, criterios manuales pendientes del PO); no sobrescribe uno existente sin `rewrite`. `completeFeature` exige `verify.md` y todos los tickets en `closed`; con `allowPendingPo` acepta `awaiting_user_tests` y los lista como pendientes del PO.
  5. Bloque B — `cli/src/features.ts`: `feature advance <slug> --to <estado>` (usa `advanceFeature`, `features.ts:275`, e imprime `via`) y `feature verify <slug> [--pendientes-del-po] [--rewrite]`; `to complete` pasa por `completeFeature`. `mcp/src/tools.ts`: `avanzar_feature`.
  6. Bloque C — `engine/src/delegation.ts` (nuevo): registro append-only `.valmen/delegations/<DEL-id>.jsonl` con `grant` (alcance feature|tickets, palabras literales del PO, fecha, política: QA por agente, push solo si el PO lo ordena); `nextDelegatedTicket` (orden topológico por `dependsOn` y sprint, salta los `closed` y los `awaiting_user_tests`); `hardGateStop(ticket)` devuelve la razón de detención si hay impacto crítico; `assertInScope(delegation, ticketId)` rechaza cualquier ticket que no esté en el alcance declarado y la llaman todos los comandos de `delegation`.
  7. Bloque C — `delegation.ts`, compuertas: `runDelegatedGate(paths, id, name, reason)` corre `runGate`; APPROVE sigue; REVIEW exige `reason` no vacío y llama a la decisión existente con actor «agente por delegación del PO» y las palabras del PO en el motivo; BLOCK o parada dura detienen con código de salida distinto y mensaje. Tras `plan` aprobado, escribe la línea de aprobación citando la delegación.
  8. Bloque C — `delegation.ts`, cierre: `closeDelegatedTicket(paths, id, {files, environment, tests, visual})` ejecuta, en orden y reutilizando las funciones de `engine/append.ts`/`transition.ts`, add-point **con `--files`** (fricción 1), evidencia, `qa-start` con el **HEAD vigente** resuelto con `git rev-parse HEAD` (fricciones 2 y 3), retest, qa-close, consumo `manual:` sin números si la sesión atendió varios tickets (fricción 5), close-attempt y cierre. Un ticket `visual` se detiene en `awaiting_user_tests`. No hace commit ni push.
  9. Bloque C — `cli/src/delegation.ts` y `main.ts`: `valmen delegation grant|status|next|gates|close`; `mcp/src/tools.ts`: `delegar_corrida`, `siguiente_ticket_delegado`, `decidir_compuertas_delegadas`, `cerrar_ticket_delegado`.
  10. Skills y proyección: nueva skill `.valmen/skills/corrida-delegada/SKILL.md` (activar, verificar, ejecutar, paradas duras); `feature` y `validacion-ui` pasan a mandar comparar contra `assets/`; una línea en la plantilla del AGENTS.md (`adapter/src/templates.ts`) sin pasar del presupuesto. Correr `valmen sync` en este repositorio y `valmen sync --check`. La proyección a SaiOpenCloud no es un paso de este ticket: queda como pendiente del PO en la entrega.
  11. Pruebas en `tests/`: `feature-assets.test.ts`, `feature-verify.test.ts`, `delegation.test.ts`, extensión de `materialize` y de `agents-md-tamano.test.ts`. Antes de entregar: `npx vitest run`, `npx tsc -p tsconfig.json --noEmit` si el proyecto lo define, y `valmen secrets`.
  12. Entrega: ticket a `awaiting_user_tests` con el contrato de pruebas (comandos exactos). Commit y push solo si el PO lo ordena, y selectivo.
- Rollback: todo es aditivo y vive en archivos nuevos más tres puntos de despacho (`cli/src/features.ts`, `cli/src/main.ts`, `mcp/src/tools.ts`) y `materialize.ts`; se revierte con `git revert` del commit del ticket. Los `assets/` y `.valmen/delegations/` ya escritos quedan como datos inertes. La proyección a SaiOpenCloud no se ejecuta aquí: se corre `valmen sync` allá solo después de la aceptación del PO y se deshace con `git checkout` de los archivos proyectados.
- Decisiones tomadas por recomendación: nombre «delegación» (evita chocar con `autonomous-run`); no se descargan enlaces; `complete` exige todos los tickets cerrados salvo `--pendientes-del-po`; el manifiesto es JSON (el motor no tiene librería YAML).

## Criterios de aceptación

- [x] `valmen feature asset add` copia el archivo a `.valmen/features/<slug>/assets/` con el mismo sha256 que el original
      <!-- test: npx vitest run tests/feature-assets.test.ts -->
- [x] El manifiesto `assets/manifest.json` registra ruta, sha256, tamaño, descripción y origen de cada adjunto, y solo se le agregan entradas
      <!-- test: npx vitest run tests/feature-assets.test.ts -->
- [x] Un adjunto con el mismo nombre y distinto contenido se rechaza sin tocar el existente
      <!-- test: npx vitest run tests/feature-assets.test.ts -->
- [x] Un enlace externo en la spec sin copia local en el manifiesto produce un aviso en `feature show` y en `materialize`
      <!-- test: npx vitest run tests/feature-assets.test.ts -->
- [x] `materialize` escribe en la solicitud de cada ticket una sección de referencias con las rutas de los adjuntos que citan sus requisitos, o todas las de la feature si ninguna se cita
      <!-- test: npx vitest run tests/feature-assets.test.ts -->
- [x] Una feature sin adjuntos se materializa exactamente igual que antes
      <!-- test: npx vitest run tests/materializar-feature.test.ts -->
- [x] `valmen feature advance` mueve el estado de la feature por el camino más corto e informa los estados intermedios
      <!-- test: npx vitest run tests/feature-verify.test.ts -->
- [x] `valmen feature verify` escribe `verify.md` con el estado y la evidencia de cada ticket del grafo y no sobrescribe uno existente sin `--rewrite`
      <!-- test: npx vitest run tests/feature-verify.test.ts -->
- [x] Avanzar una feature a `complete` se rechaza si falta `verify.md` o algún ticket no está cerrado
      <!-- test: npx vitest run tests/feature-verify.test.ts -->
- [x] Con `--pendientes-del-po`, los tickets en `awaiting_user_tests` se aceptan y quedan listados como pendientes del PO en `verify.md`
      <!-- test: npx vitest run tests/feature-verify.test.ts -->
- [x] `valmen delegation grant` registra el alcance y las palabras literales del PO en un archivo que solo recibe agregados
      <!-- test: npx vitest run tests/delegation.test.ts -->
- [x] `valmen delegation next` devuelve el siguiente ticket en el orden de dependencias del grafo y salta los cerrados y los que esperan al PO
      <!-- test: npx vitest run tests/delegation.test.ts -->
- [x] Una REVIEW de compuerta se decide solo con un motivo no vacío, y el recibo guarda el actor y las palabras del PO
      <!-- test: npx vitest run tests/delegation.test.ts -->
- [x] Un BLOCK de compuerta detiene la corrida y nunca se aprueba por delegación
      <!-- test: npx vitest run tests/delegation.test.ts -->
- [x] Un ticket con impacto de sync, migración, Docker o riesgo crítico detiene la corrida aunque la compuerta dé REVIEW
      <!-- test: npx vitest run tests/delegation.test.ts -->
- [x] `valmen delegation close` registra el punto con `--files`, y la evidencia con referencia `worktree` no falla por `affected_files` vacío
      <!-- test: npx vitest run tests/delegation.test.ts -->
- [x] `valmen delegation close` inicia el QA con el HEAD vigente aunque los archivos del punto hayan cambiado después del commit de implementación
      <!-- test: npx vitest run tests/delegation.test.ts -->
- [x] Un ticket marcado como visual queda en `awaiting_user_tests` y la corrida sigue con el siguiente
      <!-- test: npx vitest run tests/delegation.test.ts -->
- [x] Cada comando de `delegation` rechaza un ticket que no está en el alcance de la delegación
      <!-- test: npx vitest run tests/delegation.test.ts -->
- [x] El modo existe como comandos del CLI, herramientas del MCP y una skill proyectada por `valmen sync`
      <!-- test: npx vitest run tests/agent-projection.test.ts tests/mcp-registration.test.ts -->
- [x] El AGENTS.md proyectado no pasa del presupuesto de tamaño
      <!-- test: npx vitest run tests/agents-md-tamano.test.ts -->
- [x] La suite completa pasa
      <!-- test: npx vitest run -->

## Puntos

```json
[
  {
    "id": "POINT-001",
    "title": "Verificación de la entrega del ticket",
    "status": "closed",
    "severity": "normal",
    "actual": "La implementación está entregada y falta verificar sus criterios.",
    "expected": "Los criterios se cumplen y sus pruebas dan el resultado esperado.",
    "evidence": [
      "EVIDENCE-001"
    ],
    "affected_files": [
      ".valmen/skills/corrida-delegada/SKILL.md",
      ".valmen/skills/feature/SKILL.md",
      ".valmen/skills/revision-final/SKILL.md",
      ".valmen/skills/validacion-ui/SKILL.md",
      "AGENTS.md",
      "packages/adapter/src/templates.ts",
      "packages/cli/src/delegation.ts",
      "packages/cli/src/features.ts",
      "packages/cli/src/index.ts",
      "packages/cli/src/main.ts",
      "packages/engine/src/delegation.ts",
      "packages/engine/src/feature-assets.ts",
      "packages/engine/src/feature-verify.ts",
      "packages/engine/src/features.ts",
      "packages/engine/src/index.ts",
      "packages/engine/src/materialize.ts",
      "packages/engine/src/next-step.ts",
      "packages/mcp/src/tools.ts",
      "packages/server/src/hermes.ts",
      "skills/corrida-delegada/SKILL.md",
      "skills/feature/SKILL.md",
      "skills/revision-final/SKILL.md",
      "tests/delegation-mcp.test.ts",
      "tests/delegation.test.ts",
      "tests/feature-assets.test.ts",
      "tests/feature-registry.test.ts",
      "tests/feature-verify.test.ts",
      "tests/materializar-feature.test.ts",
      "tests/mcp-anotaciones.test.ts",
      "tests/mcp-server.test.ts",
      "tests/plantillas-compactas.test.ts"
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

Hecho en los tres bloques del plan, sin commit todavía (los commits se crean tras la confirmación de las pruebas):

- **A, adjuntos.** `packages/engine/src/feature-assets.ts` (nuevo): `attachFeatureAsset` copia con `copyFileSync` a `.valmen/features/<slug>/assets/`, verifica el sha256 del destino, anota en `manifest.json` solo agregando (mismo contenido = no-op; otro contenido con el mismo nombre falla), `listFeatureAssets`, `externalLinkWarnings` y `assetsForRequirements`. `engine/src/materialize.ts`: `referenciasDe` escribe `### Referencias de diseño` en la solicitud de cada ticket (los adjuntos que citan sus requisitos, o todos) y es cadena vacía sin adjuntos; `materialize` y `feature show` informan los enlaces sin copia. `FeatureArtifacts.hasAssets` en `engine/src/features.ts`. CLI: `valmen feature asset add|list`; MCP: `anexar_adjunto_a_feature`.
- **B, cierre de feature.** `packages/engine/src/feature-verify.ts` (nuevo): `featureTicketStatuses`, `writeFeatureVerify` (desde el registro, sin pisar sin `--rewrite`) y `completeFeature` (exige `verify.md` y todos los tickets cerrados; `--pendientes-del-po` acepta `awaiting_user_tests` y los lista como del PO). CLI: `valmen feature advance|verify`; MCP: `avanzar_feature`.
- **C, delegación.** `packages/engine/src/delegation.ts` (nuevo): registro append-only `.valmen/delegations/DEL-….jsonl` con las palabras del PO, `delegationProgress` (orden topológico, salta cerrados y los que esperan al PO), `assertInScope` y `hardGateStop` (sync, migración, contenedores, riesgo crítico, SECURITY). `packages/cli/src/delegation.ts` (nuevo): `advanceDelegated` (compuertas con REVIEW solo con motivo, BLOCK nunca, plan aprobado citando la delegación) y `closeDelegated` (punto con `--files`, QA con el HEAD vigente, consumo `manual:`, visuales y criterios manuales a `awaiting_user_tests`, cierre desde `awaiting_user_tests` con las palabras literales del PO). `main.ts`: el cuerpo de `valmen gate` pasa a `runGateFromFlags` para que la delegación use el mismo routing; comando `valmen delegation grant|status|next|advance|close`. MCP: `delegar_corrida`, `ver_delegacion`, `avanzar_ticket_delegado`, `cerrar_ticket_delegado`, con `correrCompuerta` extraída de `evaluar_compuerta`; `packages/server/src/hermes.ts` clasifica las cinco nuevas.
- **Skills y plantilla.** Skill nueva `skills/corrida-delegada` (1.0.0); `feature` 1.1.0 (adjuntos) y `revision-final` 1.2.0 (comparar contra las referencias); `.valmen/skills/validacion-ui` (contra el original); un párrafo en `WORKFLOW_TEMPLATE`. `valmen sync` proyectó todo y `valmen sync --check` está al día.

Un hallazgo durante la implementación, ya corregido: el cierre reutilizaba un recibo `qa-mechanical` aprobado de antes, pero el cierre edita el ticket (marca los criterios) y el motor ata el recibo al estado del ticket; ahora `qa-mechanical` se corre siempre.

Archivos del ticket: packages/engine/src/{feature-assets,feature-verify,delegation,materialize,features,index,next-step}.ts, packages/cli/src/{delegation,features,main,index}.ts, packages/mcp/src/tools.ts, packages/server/src/hermes.ts, packages/adapter/src/templates.ts, skills/{corrida-delegada,feature,revision-final}, .valmen/skills, AGENTS.md y las pruebas nuevas y ajustadas en tests/.

## Pruebas

Contrato de pruebas para el responsable. Directorio: la raíz del repositorio (`ValmenHarness`). Requisitos: Node 24, sin red ni credenciales (la cascada de compuertas se probó con un evaluador falso).

1. `npx vitest run` — resultado esperado: 148 archivos (147 pasan, 1 omitido), 2283 pruebas pasan, 0 fallan. (Las del ticket: `tests/feature-assets.test.ts`, `tests/feature-verify.test.ts`, `tests/delegation.test.ts`, `tests/delegation-mcp.test.ts`.)
2. `npx tsc --noEmit -p tsconfig.json` y `npx eslint packages` — sin salida.
3. `valmen sync --check` — «Archivos generados al día.»
4. Validación manual, en un directorio de prueba o con una feature de juguete: `valmen feature asset add <slug> --file <captura.png> --description "…"` y luego `valmen feature materialize <slug>`: el ticket nuevo trae `### Referencias de diseño`. `valmen delegation grant --feature <slug> --quote "<tus palabras>"` y `valmen delegation status`.
5. Pendiente tuyo, fuera de este ticket: correr `valmen sync` en SaiOpenCloud para proyectar la skill `corrida-delegada` y las skills actualizadas.

Resultado de la ejecución del agente (2026-10-06): `npx vitest run` → 147 archivos pasan, 1 omitido, 2283 pruebas pasan y 0 fallan; `tsc --noEmit` y `eslint` sin salida; `valmen sync --check` al día; `valmen secrets` sin hallazgos.

- Resultado del PO: «Si son de ejecutar comandos puedes hacerlas tu y si el resultado es el esperado documentar qa y cerrar para continuar» — Juan Andrade, 2026-10-06, delegación del PO para este ticket. Las pruebas de consola las ejecutó el agente y dieron el resultado esperado: npx vitest run (2283 pasan, 0 fallan), tsc y valmen sync --check limpios, y la validación manual con el CLI real en un directorio de prueba (feature asset add/list, aviso del enlace sin copia que desaparece al anexar, materialize con «Referencias de diseño», delegation grant/status/next, feature verify y rechazo de complete con un ticket en intake).

## QA

```json
[
  {
    "id": "QA-001",
    "date": "2026-10-07",
    "build_reference": "worktree:sha256:da2a9afbc7f176c6ae28f5eee74bed9dab20638286048ff86edd90eb1b5b0e9b",
    "environment": "local (Node 24, CLI real en un directorio de prueba)",
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
    "po_confirmation": "«Si son de ejecutar comandos puedes hacerlas tu y si el resultado es el esperado documentar qa y cerrar para continuar» — Juan Andrade, 2026-10-06, delegación del PO para este ticket"
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
    "description": "npx vitest run: 2283 pruebas pasan y 0 fallan; tsc y valmen sync --check limpios; validación manual con el CLI real",
    "reference": "worktree:sha256:da2a9afbc7f176c6ae28f5eee74bed9dab20638286048ff86edd90eb1b5b0e9b",
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
    "po_confirmation": "«Si son de ejecutar comandos puedes hacerlas tu y si el resultado es el esperado documentar qa y cerrar para continuar» — Juan Andrade, 2026-10-06, delegación del PO para este ticket"
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
    "technical_summary": "Adjuntos de feature (feature-assets.ts, referencias heredadas en materialize), cierre de feature (feature-verify.ts, feature advance|verify) y modo de delegación (engine/delegation.ts, cli/delegation.ts: valmen delegation grant|status|next|advance|close), con herramientas MCP, la skill corrida-delegada y 31 pruebas nuevas. El cuerpo de valmen gate pasa a runGateFromFlags para compartir el routing.",
    "functional_summary": "Los diseños aprobados viajan con la feature y los agentes de cada ticket los comparan contra el original; una feature o una lista de tickets se puede correr de punta a punta por delegación del PO, con paradas ante BLOCK y gates humanos duros, y se cierra con su verify.md.",
    "qa_status": "approved",
    "qa_waiver_reason": null,
    "po_confirmation": null,
    "release_impact": "unreleased: cambio del propio harness, sin migraciones ni despliegue; los proyectos adoptados lo reciben con valmen sync."
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
    "model": "anthropic/claude-sonnet-5-5",
    "reasoning_effort": null,
    "notes": "Sesión única que atiende varios tickets del pedido; sin números por ticket para no repartir a ojo un costo que no se midió por ticket.",
    "input_tokens": null,
    "output_tokens": null,
    "total_tokens": null,
    "estimated_cost_usd": null,
    "source": "manual:sesión de Claude Code que implementó este ticket y arrancó la Parte 2 del pedido",
    "confidence": "medium",
    "id": "CONSUMO-001"
  },
  {
    "kind": "ai-usage",
    "date": "2026-10-07",
    "session_reference": "9f1455c8-a551-4602-ac40-a8d026bd66b8",
    "model": "anthropic/claude-sonnet-5-5",
    "reasoning_effort": null,
    "notes": "Agente claude-code. 24 intervención(es) sobre el registro, 3 con fallo. 24 de 119 mensajes tocaron el registro. La entrada incluye la creación de caché y la salida incluye el razonamiento. Caché leída 25275687 tokens. Sesión \"ValmenHarness CLI attachments feature\". Proveedor por suscripción: no hay coste por token, se registran los tokens.",
    "input_tokens": 286779,
    "output_tokens": 132673,
    "total_tokens": 419452,
    "estimated_cost_usd": null,
    "source": "claude:9f1455c8-a551-4602-ac40-a8d026bd66b8",
    "confidence": "high",
    "id": "CONSUMO-002"
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
    "date": "2026-10-06",
    "at": "2026-10-06T22:40:59.480Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-06",
    "at": "2026-10-06T23:16:51.855Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-06",
    "at": "2026-10-06T23:17:14.133Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-06",
    "at": "2026-10-06T23:28:03.256Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-06",
    "at": "2026-10-06T23:28:03.495Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-06",
    "at": "2026-10-07T00:09:05.360Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-06",
    "at": "2026-10-07T00:23:46.956Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-10-06",
    "at": "2026-10-07T00:23:47.215Z",
    "action": "point-added",
    "actor": "cli",
    "details": "Se agregó POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-10-06",
    "at": "2026-10-07T00:23:47.455Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-10-06",
    "at": "2026-10-07T00:23:47.669Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-10-06",
    "at": "2026-10-07T00:23:47.885Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-10-06",
    "at": "2026-10-07T00:23:53.766Z",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-10-06",
    "at": "2026-10-07T00:23:54.338Z",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-014",
    "date": "2026-10-06",
    "at": "2026-10-07T00:24:00.967Z",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-001 para POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-015",
    "date": "2026-10-06",
    "at": "2026-10-07T00:24:01.179Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: verified -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-016",
    "date": "2026-10-06",
    "at": "2026-10-07T00:24:01.376Z",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-017",
    "date": "2026-10-06",
    "at": "2026-10-07T00:24:01.570Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-018",
    "date": "2026-10-06",
    "at": "2026-10-07T00:24:01.762Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-019",
    "date": "2026-10-06",
    "at": "2026-10-07T00:24:02.666Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-002."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-020",
    "date": "2026-10-06",
    "at": "2026-10-07T00:24:02.759Z",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-021",
    "date": "2026-10-06",
    "at": "2026-10-07T00:24:02.974Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  }
]
```
