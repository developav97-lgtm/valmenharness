---
schema_version: 2
id: FEATURE-ENGINE-RIESGO-REVISION-20261010
title: Cálculo en código del riesgo de la revisión por lo tocado
type: FEATURE
module: ENGINE
workflow_status: approved
qa_status: pending
release_status: unreleased
user_visible: false
sync_impact: false
migration_impact: false
docker_impact: false
risk_level: normal
created: 2026-10-10
updated: 2026-10-10
related_ticket: null
target_release: null
released_in: null
---

# FEATURE-ENGINE-RIESGO-REVISION-20261010

## Solicitud original

Parte del sprint: La revisión del diff es una compuerta con riesgo calculado en código y recibos atados al árbol entregado.
- R-REV-002: El riesgo de la revisión DEBE calcularse en código a partir de lo tocado y del ticket
Viene de una feature descompuesta en sprints; su plan completo está en el tickets.yaml de la feature.

Comportamiento esperado: El riesgo de la revisión DEBE calcularse en código a partir de lo tocado y del ticket
Comportamiento actual: la spec no lo declara; se establece en el análisis, leyendo el código.

### Supuestos y decisiones pendientes

<!-- Si el pedido nombra algo que el código no tiene —parámetro, permiso,
campo, bandera, columna, migración— y no lo especifica, listá cada elemento
con su pregunta antes de avanzar a análisis; el análisis no planifica sobre
la adivinanza. Si no hay ninguno, escribí «Ninguno» y seguí. -->
Ninguno.

## Descripción funcional

- Alcance: R-REV-002. El motor gana una función pura que, dados los archivos que toca un diff (con su estado: agregado, modificado o borrado) y el ticket, devuelve el riesgo de la revisión —`bajo`, `medio` o `alto`— con sus motivos, y un lector de git que obtiene esos archivos entre dos commits. Las categorías de ruta de `packages/engine/src/qa-eligibility.ts:26-33` y el patrón de prueba de `packages/engine/src/qa-agent.ts:72` se extraen a un módulo común del motor (decisión D4 de `.valmen/features/guardas-verificacion-harness/design.md`), que leen la elegibilidad de QA por agente, el qa-agent y el cálculo nuevo. Fuera: la compuerta `code-review`, su recibo, la profundidad por riesgo y el árbol revisado sin commit (R-REV-003 a R-REV-005, FEATURE-GATE-CODE-REVIEW-20261010, que consumirá esta función).
- Usuario o rol afectado: la compuerta de revisión del diff que construye FEATURE-GATE-CODE-REVIEW-20261010 y, a través de ella, el PO que recibe un ticket revisado con la profundidad que le corresponde; hoy, nadie en ejecución (la función no tiene llamador de producción hasta ese ticket).
- Comportamiento actual: no existe ningún cálculo del riesgo de una revisión. La revisión del diff es prosa (skill `revision-final`) y la única clasificación por rutas tocadas es la lista de rutas prohibidas para la QA por agente, que responde «¿puede un agente aprobarse esto?» y no «¿cuánto riesgo tiene?»: no distingue categorías críticas de no críticas, ni documentación o pruebas de código funcional.
- Comportamiento esperado (R-REV-002): bajo cuando el diff solo toca documentación, texto o pruebas; medio cuando toca código funcional fuera de las categorías críticas; alto cuando toca alguna categoría crítica (migraciones, configuración de despliegue, autenticación, CI, `.valmen/`), cuando el ticket declara `sync_impact`, `migration_impact` o `docker_impact`, o cuando es de tipo SECURITY. El riesgo se puede subir a mano y nunca bajar. Escenarios de la spec: dos líneas en `packages/core/src/permissions.ts` dan alto; mil líneas de `.md` en `docs/` dan bajo.

## Diagnóstico

- Búsqueda en la memoria (`buscar_memoria`, «riesgo de la revisión del diff calculado por rutas tocadas CATEGORIAS_DE_RUTA engine»): sin antecedente; salen AP-001, AP-003, AP-006, AP-007, AP-009 y AP-011, de compuertas y skills. AP-001 orienta a escribir criterios atómicos.
- Dónde falta el comportamiento esperado: no hay función de riesgo de revisión en ningún paquete; el lugar es el motor (`packages/engine/src/`, que ya decide en código la elegibilidad de QA y de aprobación) junto a `packages/engine/src/qa-eligibility.ts`, de donde D4 manda tomar las categorías.
- Causa comprobada (con `ruta:línea`):
  1. La clasificación por rutas vive privada y con otro propósito. `CATEGORIAS_DE_RUTA` (`packages/engine/src/qa-eligibility.ts:26-33`) no se exporta; solo la usa `rutaProhibidaParaQaAgente` (`packages/engine/src/qa-eligibility.ts:36-41`), que devuelve la **primera** categoría que casa (`:39`). Las seis categorías son pantallas, migraciones, configuración de despliegue, autenticación, CI y `.valmen/`; la spec declara críticas solo las cinco últimas, así que «pantallas» da medio y no alto. Devolver la primera no sirve para el riesgo: una ruta como «frontend/src/auth/login.tsx» casa con «pantallas» (`:27`) antes que con «autenticación» (`:30`) y quedaría en medio.
  2. No hay definición de qué es documentación, y la de prueba está escondida en otro módulo: `ES_PRUEBA` (`packages/engine/src/qa-agent.ts:72`), privada, usada solo en `:223` para exigir una prueba nueva a un BUGFIX.
  3. Los lectores de diff que existen no dan «lo tocado» con fidelidad. Comprobado con git 2.54 en un repositorio de prueba (base con «packages/core/src/permissions.ts» y «docs/viejo.md»; commit que renombra «permissions.ts» a «p.ts», borra «docs/viejo.md» y agrega «docs/diseño.md»; las rutas son del repositorio de prueba, no de este):
     - `git diff --name-only` —el de `archivosDelDiff` (`packages/engine/src/qa-eligibility.ts:44-48`, `:45`), `qa-agent` (`packages/engine/src/qa-agent.ts:100-105`) y `qa-policy-close` (`packages/engine/src/qa-policy-close.ts:70`)— informa el renombre solo con la ruta **nueva** («packages/core/src/p.ts»): la ruta de autenticación desaparece. Y escribe «"docs/dise\303\261o.md"» entre comillas y con escapes, con lo que un patrón que termina en `.md$` no casa.
     - `pendingFiles` y `pendingChanges` (`packages/engine/src/diff.ts:56-67`, `:76-145`) miran el árbol de trabajo contra `HEAD`, no un rango entregado; `pendingChanges` solo toma el archivo de las líneas `+++ b/` (`packages/engine/src/diff.ts:97-101`), así que un borrado (`+++ /dev/null`) y una ruta no ASCII («+++ "b/docs/dise\303\261o.md"») no quedan en `files`.
     - `git diff --name-status --no-renames -z <base> <destino>` da exactamente lo que el riesgo necesita: «A docs/diseño.md», «D docs/viejo.md», «A packages/core/src/p.ts», «D packages/core/src/permissions.ts», sin comillas, y salida vacía cuando base y destino coinciden. `diff` está en la lista cerrada de git del motor (`packages/engine/src/integration-rules.ts:87-97`) y `ejecutarGitPermitido` (`packages/engine/src/integration-rules.ts:146`) acepta esas banderas.
  4. Todo commit de ticket toca `.valmen/`. Los commits 945ed1c y 66df2b4 (`git show --name-status`) modifican `.valmen/receipts/<su ID>.jsonl`, el archivo de recibos que el motor escribe en cada compuerta (`receiptsPath`, `packages/engine/src/receipts.ts:33-35`), además de su propio `tickets/2026/<ID>/ticket.md`. Si `.valmen/` cuenta como crítico sin excepción, **todo** ticket da alto y la profundidad por riesgo de R-REV-003 no distingue nada.
  5. Lo que el ticket aporta ya está en código: `declaredImpactIds` (`packages/core/src/validate.ts:186-188`, sobre `DIMENSIONES_DE_IMPACTO` en `:162-170`) devuelve los impactos del frontmatter, y `approval-eligibility` ya trata SECURITY como barrera en código (`packages/engine/src/approval-eligibility.ts:116`). `isCriticalPlanGate` (`packages/core/src/validate.ts:245-253`) **no** sirve: incluye FEATURE, SYNC, INTEGRATION y AGENT, que la spec no sube a alto en la revisión. El campo `risk_level` (`RISK_LEVELS`, `packages/core/src/contract.ts:120`: low, normal, high, critical) es la marca de riesgo que una persona deja en el ticket.
- Hipótesis pendientes:
  - H1: el patrón `ES_PRUEBA` cuenta como prueba todo lo que está bajo `tests/` o `spec/`, incluidos ayudantes y fixtures. Para el riesgo se acepta (siguen siendo pruebas), salvo los scripts que nombra `test-commands`, que el plan sube a medio como ya los trata aparte `rutaProhibidaParaQaAgente` (`packages/engine/src/qa-eligibility.ts:38`).
  - H2: un diff vacío casi siempre indica una base equivocada. Qué hace la compuerta con él (bloquear o aceptar) es de FEATURE-GATE-CODE-REVIEW-20261010; esta función solo lo informa.
  - H3: con la excepción del registro propio (causa 4), quien edite a mano su propio archivo de recibos no sube el riesgo. La integridad de los recibos la cuida el `stateHash` de cada recibo, no la revisión; la excepción se limita a agregar o modificar, y borrar ese archivo sigue siendo alto.
- Consumidores afectados:
  - `rutaProhibidaParaQaAgente` (`packages/engine/src/qa-eligibility.ts:36-41`): conserva firma, orden y nombres de categoría. La usan `elegibilidadQa` (`packages/engine/src/qa-eligibility.ts:159-161`), y a través de ella `ejecutarQaAgent` (`packages/engine/src/qa-agent.ts:130`), el cierre por política (`packages/engine/src/qa-policy-close.ts:71`) y el comando `valmen qa-eligibility` (`packages/cli/src/commands.ts:3458-3461`). Sus pruebas: `tests/elegibilidad-qa.test.ts:159-196` (las doce rutas prohibidas y las permitidas), `tests/qa-agent.test.ts` y `tests/qa-por-politica.test.ts`.
  - `ES_PRUEBA` (`packages/engine/src/qa-agent.ts:72`, `:223`): pasa al módulo común con el mismo patrón; la exigencia de prueba nueva de un BUGFIX no cambia (`tests/qa-agent.test.ts`).
  - `packages/engine/src/index.ts:20` reexporta `qa-eligibility`; el cálculo nuevo se reexporta igual. La guarda de exportaciones sin uso (`scripts/exports-sin-uso.mjs`, línea base en `scripts/exports-sin-uso.linea-base.json`, que ya lista `TIPOS_NUNCA_ELEGIBLES` y `ReglaDeElegibilidad` de `qa-eligibility.ts` en `:314-315`) falla con cualquier exportación nueva sin consumidor: lo que se exporte necesita un importador en otro módulo o en una prueba, y las dos entradas de la línea base no se mueven.
  - FEATURE-GATE-CODE-REVIEW-20261010: consumidor futuro de la función y del lector.
  - El CLI, el MCP, el servidor y el registro no cambian: no hay comando nuevo ni dato persistido.
- Archivos y flujo investigados: `packages/engine/src/qa-eligibility.ts`, `packages/engine/src/qa-agent.ts`, `packages/engine/src/qa-policy-close.ts`, `packages/engine/src/approval-eligibility.ts`, `packages/engine/src/diff.ts`, `packages/engine/src/integration-rules.ts`, `packages/engine/src/receipts.ts`, `packages/engine/src/discovery.ts` (`RegistryPaths.ticketsDir`, `:57-60`), `packages/engine/src/index.ts`, `packages/core/src/validate.ts`, `packages/core/src/contract.ts`, `packages/cli/src/commands.ts`, `scripts/exports-sin-uso.mjs`, `knip.json`, `tests/elegibilidad-qa.test.ts`, `tests/helpers/fixtures.ts`, la spec `.valmen/features/guardas-verificacion-harness/spec/s4-revision-diff/spec.md` (R-REV-002) y `design.md` (D4). Flujo hoy: `elegibilidadQa` recibe la lista de archivos que calcula quien llama con `git diff --name-only` y le pide a `rutaProhibidaParaQaAgente` la primera categoría de cada uno; no hay ningún flujo de riesgo.
- Riesgos y compatibilidad:
  - Mover las categorías puede cambiar en silencio la QA por agente: se mueven las expresiones tal cual, en el mismo orden y con los mismos nombres, y `tests/elegibilidad-qa.test.ts` las recorre una por una.
  - La guarda de exportaciones sin uso rompe con un tipo o una constante exportados sin importador; el plan exporta solo lo que otro módulo o la prueba importa.
  - El hueco del renombre y de las rutas no ASCII en `archivosDelDiff`, `qa-agent` y `qa-policy-close` (causa 3) y el de `pendingChanges` en el escáner de secretos quedan como están: arreglarlos cambia la QA por agente y `valmen secrets`, fuera de R-REV-002. Se proponen como tickets aparte.
  - Otros worktrees de la feature: FEATURE-GATE-ARBOL-QA-RECIBO-20261010 toca transición y recibos, y CHORE-CORE-LISTA-DENEGADOS-20261010 `integration-rules.ts`; ninguno toca los archivos de este ticket salvo, quizá, una línea de `packages/engine/src/index.ts`.
- Impactos de sync, migración, Docker o despliegue: ninguno. Agrega una función pura y un lector de git de solo lectura al motor, y mueve dos clasificaciones sin cambiar su comportamiento; no toca sincronización, migraciones del registro, contenedores ni despliegue.

## Plan

- Alcance y exclusiones: R-REV-002 en el motor. Entran un módulo común de clasificación de rutas (`packages/engine/src/path-categories.ts`, nuevo), el cálculo del riesgo y su lector de git (`packages/engine/src/review-risk.ts`, nuevo), el cambio de dos consumidores para que lean el módulo común (`packages/engine/src/qa-eligibility.ts`, `packages/engine/src/qa-agent.ts`), una línea de `packages/engine/src/index.ts` y la prueba `tests/riesgo-revision.test.ts` (nueva). Quedan fuera:
  - La compuerta `code-review`, su recibo, la profundidad por riesgo, qué hacer con un diff vacío y el árbol revisado cuando no hay commit (`packages/engine/src/references.ts:145-192`): FEATURE-GATE-CODE-REVIEW-20261010, que llamará a estas dos funciones.
  - Un comando o una herramienta MCP para ver el riesgo: R-REV-002 no lo pide.
  - Los huecos de `git diff --name-only` (renombre y rutas no ASCII) en `archivosDelDiff`, `qa-agent` y `qa-policy-close`, y el de `pendingChanges` en `valmen secrets` (diagnóstico, causa 3): cambian la QA por agente y el escáner de secretos. Se proponen como tickets aparte; los abre una persona si los quiere.
- Decisiones de diseño (las confirma quien apruebe el plan):
  - D-R1, registro propio del ticket: un archivo **agregado o modificado** que es el registro de este ticket —bajo `<ticketsDir>/<año>/<ID>/` o exactamente `.valmen/receipts/<ID>.jsonl`— cuenta bajo («registro del ticket»). Sin esto, todo ticket da alto (diagnóstico, causa 4). Borrarlo no entra en la excepción y se clasifica como cualquier ruta. Los recibos de otro ticket y el resto de `.valmen/` siguen en alto. `ticketsDir` es el de `RegistryPaths` (`packages/engine/src/discovery.ts:57-60`).
  - D-R2, orden de clasificación de cada archivo, y gana la primera regla que aplica: (1) registro propio agregado o modificado → bajo; (2) **alguna** categoría crítica entre todas las que casan → alto, aunque el archivo sea `.md` o de prueba; (3) script que nombra `test-commands` (los mismos que `rutaProhibidaParaQaAgente` trata aparte) → medio; (4) archivo de prueba según `ES_PRUEBA` → bajo si se agrega o modifica, medio si se borra (borrar una prueba quita verificación); (5) documentación o texto por extensión (`.md`, `.mdx`, `.markdown`, `.txt`, `.rst`, `.adoc`) → bajo; (6) todo lo demás, «pantallas» incluida → medio.
  - D-R3, estados de git: `cambiosDelDiff` corre `git diff --name-status --no-renames -z <base> <destino>` con `ejecutarGitPermitido` (`packages/engine/src/integration-rules.ts:146`). Un archivo **nuevo** llega con estado `A` y se clasifica por su ruta. Uno **borrado** llega con `D` y se clasifica por su ruta anterior. Un **renombre** llega, por `--no-renames`, como el `D` de la ruta vieja más el `A` de la nueva, y se clasifican las dos: renombrar un archivo de autenticación da alto. Cualquier otra letra (`M`, `T`, `U`, `X`) cuenta como `M`. `-z` deja las rutas no ASCII sin comillas ni escapes. Si git sale con error, lanza `git diff falló: <stderr>`, como `archivosDelDiff`.
  - D-R4, diff vacío: con base y destino iguales `cambiosDelDiff` devuelve `[]`, y `riesgoDeRevision` no lanza: el nivel sale solo de los factores del ticket y, sin ninguno, es bajo con el motivo «el diff no toca archivos». Si la entrega lo acepta lo decide FEATURE-GATE-CODE-REVIEW-20261010 (H2).
  - D-R5, factores del ticket: tipo SECURITY, cualquier impacto de `declaredImpactIds` (`packages/core/src/validate.ts:186-188`) y `risk_level` `high` o `critical` dan alto. `isCriticalPlanGate` no se usa (incluye FEATURE). `risk_level` `low` o `normal` no bajan nada.
  - D-R6, subida a mano: el parámetro opcional `subirA` sube el nivel calculado y nunca lo baja; si pide uno menor, el nivel queda y el motivo lo dice. El nivel final es el máximo de los archivos, los factores del ticket y `subirA`.
  - D-R7, exportaciones y quién las consume (la guarda `node scripts/exports-sin-uso.mjs` falla con una exportación sin importador, y su línea base no se toca):
    - `path-categories.ts` exporta `categoriasDeRuta(ruta)` —todas las categorías que casan, en orden, con `nombre` y `critica`— y `esArchivoDePrueba(ruta)`. Las importan `qa-eligibility.ts`, `qa-agent.ts` y `review-risk.ts`; no se reexporta en `index.ts`.
    - `review-risk.ts` exporta `cambiosDelDiff` y `riesgoDeRevision`, reexportadas por `index.ts`. Hoy las importa `tests/riesgo-revision.test.ts`; después, FEATURE-GATE-CODE-REVIEW-20261010.
    - Los tipos de entrada y salida (`CambioDelDiff`, `NivelDeRiesgo`, `RiesgoDeRevision`) se declaran sin `export`: `tsc` los emite locales en el `.d.ts` (comprobado con un archivo de prueba). Se exportan cuando un consumidor los importe.
    - `TIPOS_NUNCA_ELEGIBLES` y `ReglaDeElegibilidad`, que la línea base lista (`scripts/exports-sin-uso.linea-base.json:314-315`), se quedan en `qa-eligibility.ts`.
- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan). Confirma D-R1 (el `ticket.md` del propio ticket y su recibo cuentan como riesgo bajo) y C29 (un script de `tests/` nombrado en `test-commands` cuenta como riesgo medio).
- Pasos ordenados:
  1. Prueba primero (EST-010): crear `tests/riesgo-revision.test.ts` antes de tocar el motor. Importa `cambiosDelDiff` y `riesgoDeRevision` de `packages/engine/src/index.ts`, `parseTicket` de `packages/core/src/index.ts` y `renderFixtureTicket` de `tests/helpers/fixtures.ts` (opciones `type`, `riskLevel` e `impacts`). Un ayudante crea un repositorio git en `mkdtempSync` (`git init`, usuario local, commit base) y hace commits con `spawnSync("git")` para los casos del lector; los casos de la función pura pasan los cambios en línea. Un caso por criterio: C1 y C3 con commits reales (dos líneas en «packages/core/src/permissions.ts» del repositorio de prueba; mil líneas en dos `.md` de su «docs/»); C15 a C17, C21 y C22 con commits reales; el resto con cambios en línea. Correr `npx vitest run tests/riesgo-revision.test.ts` y observarla en rojo (el módulo no existe); anotar el rojo en `## Implementación`. (C1–C29)
  2. Crear `packages/engine/src/path-categories.ts`: mover tal cual las seis entradas de `CATEGORIAS_DE_RUTA` (`packages/engine/src/qa-eligibility.ts:26-33`), en el mismo orden y con los mismos nombres, agregando `critica: false` a «pantallas» y `critica: true` a las otras cinco; mover tal cual `ES_PRUEBA` (`packages/engine/src/qa-agent.ts:72`). Exportar `categoriasDeRuta(ruta)` y `esArchivoDePrueba(ruta)` (D-R7). (C6, C7, C8, C9, C10, C11, C12, C33)
  3. En `packages/engine/src/qa-eligibility.ts`: quitar la constante local (`:25-33`), importar `categoriasDeRuta` y dejar `:39` como `return categoriasDeRuta(normal)[0]?.nombre ?? null;`. La firma, la regla de los scripts de prueba (`:38`) y los mensajes no cambian. (C30, C33)
  4. En `packages/engine/src/qa-agent.ts`: quitar `ES_PRUEBA` (`:72`), importar `esArchivoDePrueba` y usarla en el filtro de `:223`. (C30, C33)
  5. Crear `packages/engine/src/review-risk.ts`:
     - `cambiosDelDiff(root, base, destino, ejecutor?)` según D-R3, que parte la salida `-z` en pares estado-ruta. (C15, C16, C17, C21, C22)
     - `riesgoDeRevision({ ticket, cambios, ticketsDir, scriptsDePrueba?, subirA? })`, que clasifica cada archivo según D-R1 y D-R2, suma los factores de D-R5, aplica D-R4 y D-R6, y devuelve `{ nivel, motivos, archivos }`. Cada archivo lleva `ruta`, `estado`, `nivel` y `motivo`; un motivo de categoría se escribe `<ruta> (<categoría>)`. No consulta a ningún modelo ni escribe nada. (C1, C2, C3, C4, C5, C6, C7, C8, C9, C10, C11, C12, C13, C14, C18, C19, C20, C23, C24, C25, C26, C27, C28, C29)
  6. En `packages/engine/src/index.ts`, agregar `export * from "./review-risk.js";` después de la línea de `qa-eligibility` (`:20`). (C32)
  7. Desde la raíz del worktree: `npx vitest run tests/riesgo-revision.test.ts`; `npx vitest run tests/elegibilidad-qa.test.ts tests/qa-agent.test.ts tests/qa-por-politica.test.ts`; `npx tsc --build tsconfig.build.json`; `node scripts/exports-sin-uso.mjs`. Revisar a mano, con `grep -rn "CATEGORIAS_DE_RUTA\|ES_PRUEBA" packages/*/src`, que las dos clasificaciones quedan definidas solo en `path-categories.ts` (C33). Si una prueba que ya existía se pone en rojo, no se edita: se detiene y se reporta en el ticket con su salida y la hipótesis (EST-009). (C1–C33)
- Compatibilidad: para los consumidores existentes no cambia nada. `rutaProhibidaParaQaAgente` devuelve las mismas categorías con los mismos nombres y en el mismo orden, y la exigencia de prueba nueva del qa-agent usa el mismo patrón; las dos cosas las fijan pruebas existentes que no se editan (C30). La API del motor solo crece (`cambiosDelDiff`, `riesgoDeRevision`). No cambian el CLI, el MCP, el servidor, el registro ni ningún dato persistido.
- Impactos declarados: ninguno; el ticket no declara sincronización, migración ni contenedores (`sync_impact`, `migration_impact` y `docker_impact` en false), y no hay despliegue.
- Pruebas previstas: directorio, la raíz del worktree; requisitos, Node 24 con las dependencias del monorepo instaladas y `git` en el PATH, sin red ni credenciales; resultado esperado, los comandos del paso 7 sin fallos y la guarda de exportaciones con «Sin exportaciones nuevas sin consumidor».
- Rollback (obligatorio): revertir el commit del ticket en su rama (`git revert <hash>`): borra `packages/engine/src/path-categories.ts`, `packages/engine/src/review-risk.ts` y `tests/riesgo-revision.test.ts`, devuelve `CATEGORIAS_DE_RUTA` a `qa-eligibility.ts` y `ES_PRUEBA` a `qa-agent.ts`, y quita la línea de `index.ts`. No hay estado, registro, configuración ni datos que restaurar, y ningún código de producción llama todavía a `riesgoDeRevision`.

<!-- Los criterios de la sección siguiente se numeran C1…Cn, con una afirmación verificable por criterio
     —una frase con «y» son dos criterios—, y cada uno lleva debajo su anotación de
     verificación: un comentario HTML que dice «test:» y el comando, o «verify: manual». La
     sección no lleva comentarios dentro: un comentario con anotación se leería como la de un
     criterio. Ejemplo en la skill planificacion. -->
## Criterios de aceptación

- [ ] C1 — R-REV-002: Un commit que cambia dos líneas de «packages/core/src/permissions.ts» da riesgo alto.
      <!-- test: npx vitest run tests/riesgo-revision.test.ts -->
- [ ] C2 — R-REV-002: Un motivo del riesgo de C1 es «packages/core/src/permissions.ts (autenticación)».
      <!-- test: npx vitest run tests/riesgo-revision.test.ts -->
- [ ] C3 — R-REV-002: Un commit que agrega mil líneas en archivos `.md` de «docs/» da riesgo bajo.
      <!-- test: npx vitest run tests/riesgo-revision.test.ts -->
- [ ] C4 — R-REV-002: Un diff que solo modifica archivos de prueba («tests/a.test.ts», «packages/engine/test/b.test.ts») da riesgo bajo.
      <!-- test: npx vitest run tests/riesgo-revision.test.ts -->
- [ ] C5 — R-REV-002: Un diff que modifica `packages/engine/src/drift.ts` da riesgo medio.
      <!-- test: npx vitest run tests/riesgo-revision.test.ts -->
- [ ] C6 — R-REV-002: Un diff que solo modifica `packages/server/web/index.html`, de la categoría no crítica «pantallas», da riesgo medio.
      <!-- test: npx vitest run tests/riesgo-revision.test.ts -->
- [ ] C7 — R-REV-002: Un diff que modifica «BackEnd/pos/migrations/0042_orden.py» da riesgo alto.
      <!-- test: npx vitest run tests/riesgo-revision.test.ts -->
- [ ] C8 — R-REV-002: Un diff que modifica «Dockerfile» da riesgo alto.
      <!-- test: npx vitest run tests/riesgo-revision.test.ts -->
- [ ] C9 — R-REV-002: Un diff que modifica «.github/workflows/ci.yml» da riesgo alto.
      <!-- test: npx vitest run tests/riesgo-revision.test.ts -->
- [ ] C10 — R-REV-002: Un diff que modifica `.valmen/config.yaml` da riesgo alto.
      <!-- test: npx vitest run tests/riesgo-revision.test.ts -->
- [ ] C11 — R-REV-002: Un diff que solo modifica `.valmen/rules/estandares-proceso.md` da riesgo alto.
      <!-- test: npx vitest run tests/riesgo-revision.test.ts -->
- [ ] C12 — R-REV-002: Un diff que modifica «frontend/src/auth/login.tsx», que casa con «pantallas» antes que con «autenticación», da riesgo alto.
      <!-- test: npx vitest run tests/riesgo-revision.test.ts -->
- [ ] C13 — R-REV-002: Un diff que solo modifica el `ticket.md` del propio ticket junto con su `.valmen/receipts/<ID>.jsonl` da riesgo bajo.
      <!-- test: npx vitest run tests/riesgo-revision.test.ts -->
- [ ] C14 — R-REV-002: Un diff que modifica el archivo de recibos de otro ticket en `.valmen/receipts/` da riesgo alto.
      <!-- test: npx vitest run tests/riesgo-revision.test.ts -->
- [ ] C15 — R-REV-002: Sobre un repositorio git real, `cambiosDelDiff` informa un archivo agregado con estado `A`.
      <!-- test: npx vitest run tests/riesgo-revision.test.ts -->
- [ ] C16 — R-REV-002: Sobre un repositorio git real, `cambiosDelDiff` informa un archivo borrado con estado `D` con su ruta anterior.
      <!-- test: npx vitest run tests/riesgo-revision.test.ts -->
- [ ] C17 — R-REV-002: Sobre un repositorio git real, `cambiosDelDiff` informa el renombre de «packages/core/src/permissions.ts» a «packages/core/src/p.ts» como `D` de la ruta vieja más `A` de la nueva.
      <!-- test: npx vitest run tests/riesgo-revision.test.ts -->
- [ ] C18 — R-REV-002: El renombre de C17 da riesgo alto.
      <!-- test: npx vitest run tests/riesgo-revision.test.ts -->
- [ ] C19 — R-REV-002: Un diff que borra «packages/core/src/permissions.ts» da riesgo alto.
      <!-- test: npx vitest run tests/riesgo-revision.test.ts -->
- [ ] C20 — R-REV-002: Un diff que solo borra un archivo de prueba da riesgo medio.
      <!-- test: npx vitest run tests/riesgo-revision.test.ts -->
- [ ] C21 — R-REV-002: Sobre un repositorio git real, `cambiosDelDiff` informa «docs/diseño.md» sin comillas ni escapes.
      <!-- test: npx vitest run tests/riesgo-revision.test.ts -->
- [ ] C22 — R-REV-002: Con la base igual al destino, `cambiosDelDiff` devuelve una lista vacía.
      <!-- test: npx vitest run tests/riesgo-revision.test.ts -->
- [ ] C23 — R-REV-002: Un diff vacío en un ticket sin factores de riesgo da riesgo bajo.
      <!-- test: npx vitest run tests/riesgo-revision.test.ts -->
- [ ] C24 — R-REV-002: Un ticket SECURITY con un diff de solo documentación da riesgo alto.
      <!-- test: npx vitest run tests/riesgo-revision.test.ts -->
- [ ] C25 — R-REV-002: Un ticket que declara cualquiera de los impactos del frontmatter (`sync_impact`, `migration_impact`, `docker_impact`) da riesgo alto con un diff de solo documentación.
      <!-- test: npx vitest run tests/riesgo-revision.test.ts -->
- [ ] C26 — R-REV-002: Un ticket con `risk_level: high` da riesgo alto con un diff de solo documentación.
      <!-- test: npx vitest run tests/riesgo-revision.test.ts -->
- [ ] C27 — R-REV-002: Pedir `subirA: "alto"` sobre un diff de solo documentación da riesgo alto.
      <!-- test: npx vitest run tests/riesgo-revision.test.ts -->
- [ ] C28 — R-REV-002: Pedir `subirA: "bajo"` sobre un diff que toca autenticación deja el riesgo en alto.
      <!-- test: npx vitest run tests/riesgo-revision.test.ts -->
- [ ] C29 — R-REV-002: Un script de «tests/» que figura en `scriptsDePrueba` da riesgo medio.
      <!-- test: npx vitest run tests/riesgo-revision.test.ts -->
- [ ] C30 — R-REV-002: Las pruebas existentes de la elegibilidad de QA por agente, del qa-agent y del cierre por política pasan sin editarlas.
      <!-- test: npx vitest run tests/elegibilidad-qa.test.ts tests/qa-agent.test.ts tests/qa-por-politica.test.ts -->
- [ ] C31 — R-REV-002: El monorepo compila con los dos módulos nuevos.
      <!-- test: npx tsc --build tsconfig.build.json -->
- [ ] C32 — R-REV-002: La guarda de exportaciones sin uso pasa sin cambiar su línea base.
      <!-- test: node scripts/exports-sin-uso.mjs -->
- [ ] C33 — R-REV-002: `CATEGORIAS_DE_RUTA` tiene una sola definición en `packages/*/src`, en el módulo común del motor.
      <!-- verify: manual -->

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
    "at": "2026-10-10T21:47:32.483Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-10",
    "at": "2026-10-11T00:09:41.788Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-10",
    "at": "2026-10-11T00:12:22.427Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-10",
    "at": "2026-10-11T00:17:01.388Z",
    "action": "gate-approved",
    "actor": "cli",
    "details": "Gate plan aprobado por juan andrade (recibo GR-20261011-FEATURE-ENGINE-RIESGO-REVISION-20261010-plan-1, canal cli, decidida 2026-10-11T00:17:01.385Z): Aprobar tal cual (Recomendado)"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-10",
    "at": "2026-10-11T00:17:01.695Z",
    "action": "plan-approved",
    "actor": "cli",
    "details": "{\"actor\":\"juan andrade\",\"source\":\"cli\",\"quote\":\"Aprobar tal cual (Recomendado)\",\"planHash\":\"sha256:98a2dae07df2d35f82dfa180914cbac6a3d999b67c85a54d353374c046193a31\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-10",
    "at": "2026-10-11T00:17:02.008Z",
    "action": "plan-approval-verified",
    "actor": "cli",
    "details": "Aprobación del plan vigente: juan andrade (fuente cli), plan sha256:98a2dae07df2d35f82dfa180914cbac6a3d999b67c85a54d353374c046193a31."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-10",
    "at": "2026-10-11T00:17:02.008Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  }
]
```
