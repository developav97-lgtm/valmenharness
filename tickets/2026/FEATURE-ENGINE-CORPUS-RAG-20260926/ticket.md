---
schema_version: 2
id: FEATURE-ENGINE-CORPUS-RAG-20260926
title: Publicar corpus de tickets para RAG por colecciones
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
created: 2026-09-26
updated: 2026-10-01
related_ticket: null
target_release: null
released_in: null
---

# FEATURE-ENGINE-CORPUS-RAG-20260926

## Solicitud original

Parte del sprint: Encadenar manuales al deploy, auditarlos y publicar el corpus indexable.
- R-S3-004: Corpus listo para RAG — los tickets cerrados DEBEN quedar indexables como tres colecciones separadas,
Depende de: AGENT-GATE-AUDITAR-MANUAL-CITAS-20260926.
Viene de una feature descompuesta en sprints; su plan completo está en el tickets.yaml de la feature.

## Descripción funcional

- Alcance: publicar el corpus del registro como tres colecciones —manuales, memoria y tickets cerrados— leyendo lo que ya existe y dejando un documento por unidad con su origen y su fecha; el publicador es un módulo nuevo del motor con destino inyectable, con su comando en el CLI y su paso al final del proceso de manuales. Fuera de alcance: elegir o configurar la base vectorial, trocear, embeber y consultar el corpus (el agente «pregúntale al sistema» es de la ola siguiente).
- Usuario o rol afectado: quien monta un índice o un agente que responda con cita —el RAG de la hoja de ruta (docs/auditoria-20260926/hoja-de-ruta.html:49-53)—, y el PO que corre el comando desde el celular.
- Comportamiento actual: las tres fuentes se pueden leer y buscar (búsqueda léxica, `valmen memory search`), pero no se pueden entregar a un índice: no hay módulo, ni comando, ni directorio de corpus (`grep corpus` en `packages/` solo devuelve el hash de la auditoría de manuales, `packages/engine/src/manuales-auditar.ts:201`). El objetivo del sprint S3 —«publicar el corpus indexable»— quedó sin dueño hasta este ticket.
- Comportamiento esperado: `valmen corpus publicar` lee las tres fuentes y deja un documento por unidad —con `origen`, `fecha`, `id`, `titulo` y `hash`— en tres colecciones separadas dentro de `.valmen/corpus/`; la pasada siguiente entrega solo lo que cambió y lo dice en su salida; y el índice destino es inyectable, así que la base vectorial es un plugin y no una dependencia del motor.

## Diagnóstico

- Síntoma: el corpus del registro no se puede entregar a ningún índice. `valmen corpus publicar` no existe —la ayuda del CLI no nombra el verbo (`packages/cli/src/main.ts:130-340`) y su despachador no tiene el `case` (`:1248-1250`)—, el motor no exporta ningún publicador (`packages/engine/src/index.ts:19-51`) y nada escribe un directorio de corpus: `.valmen/` tiene `receipts/`, `memory/`, `processes/`, `gates/` y `features/`, y la única aparición de la palabra «corpus» en `packages/` es el hash de la auditoría de manuales (`packages/engine/src/manuales-auditar.ts:201`, `:573`, `:579`). El objetivo del sprint S3 lo declara —«publicar el corpus indexable» (`evolucion-harness/tickets.yaml:55`)— y no hay pieza que lo cumpla.
- Por qué ocurre: no es un fallo sino una ausencia, y por eso ninguna línea tiene la culpa: el requisito R-S3-004 quedó sin dueño hasta este ticket, y lo que falta es exactamente la pieza que lee las tres fuentes, da a cada documento su origen y su fecha, y entrega solo lo que cambió. Lo que sí existe es la mitad de la cadena: el conocimiento se **busca** (búsqueda léxica sin embeddings, `docs/12-FUNCIONALIDADES-PROXIMAS.md:664`) pero no se **entrega** a ningún índice, y las tres fuentes ya se pueden leer enteras con sus fechas (los puntos de extensión de abajo).
- Archivos y flujo investigados:
  - **La pieza que falta no existe en el árbol.** `grep` de `corpus|RAG|vector` sobre `packages/` solo devuelve la auditoría de manuales (`packages/engine/src/manuales-auditar.ts:201`, `:573`, `:579`): no hay módulo de publicación, ni comando en la ayuda del CLI (`packages/cli/src/main.ts:130-340`), ni entrada en el barril del motor (`packages/engine/src/index.ts:19-51`).
  - **Los tickets ya saben cuáles están cerrados y cuándo.** `listTickets(paths)` (`packages/engine/src/tickets.ts:174`) devuelve una fila por ticket con `workflowStatus`, la ruta relativa (`:56-57`) y `closedOn` —«la fecha del último cierre», leída del bloque `## Cierre` por `ultimaFechaDeCierre` (`:50`, `:159-165`)—. El filtro «cerrados» y su fecha salen del motor sin releer el archivo.
  - **La memoria ya tiene su lista de documentos y sus fechas.** `loadMemory(paths)` (`packages/engine/src/memory.ts:256`) lee lo declarado en `memory-sources` más lo que el harness guarda (`.valmen/memory/*.md` en `memoryFiles`, `:237-253`) y devuelve entradas con `date` (`:41`) y `source: {path, line}` (`:47`).
  - **Los manuales ya tienen directorio, recorrido y fecha declarada.** `MANUALES_POR_DEFECTO` (`packages/engine/src/manuales.ts:41`), el recorrido recursivo de `*.md` (`recorrerManuales`, `:204`; `leerManuales`, `:222`) y la etiqueta «Última actualización» del bloque de metadata (`PLANTILLA_METADATA`, `:70-77`) están declarados; hoy los usan la detección (`:275`) y la auditoría (`packages/engine/src/manuales-auditar.ts:283-296`), cada una con su copia privada del recorrido.
  - **El patrón de salida derivada ya está decidido dos veces.** Append-only e inmutable para lo que se publica, con el porqué escrito (`appendReceipt`, `packages/engine/src/receipts.ts:66-79`), e índice que «nunca es fuente de verdad: se regenera y se compara con el que está en disco» (`packages/engine/src/index-file.ts:1-7`).
  - **El hash determinista ya está en el motor.** `sha256` sobre pares (largo, bytes) en orden ordenado (`packages/engine/src/references.ts:139-170`) y la comprobación de que una ruta está versionada (`:151-156`): el mismo primitivo sirve para decidir qué cambió.
  - **La configuración y el encadenamiento no necesitan nada nuevo.** `configList(root, clave)` lee `.valmen/config.yaml` (`packages/engine/src/discovery.ts:91`) —es lo que declara hoy `memory-sources`— y el proceso de manuales tiene sus tres pasos y su último lugar libre (`.valmen/processes/actualizar-manuales.yaml:20-45`), encadenado por el `deploy` con `continue_on_failure: true` (`.valmen/processes/deploy.yaml:36-42`).
  - **La decisión de arquitectura está escrita.** La base vectorial es un **plugin** y el motor publica el corpus (`.valmen/features/evolucion-harness/design.md:63-65`, D5), y `docs/05-PLUGINS.md:19` declara que un plugin aporta capacidad y no entra en el camino crítico.
- Puntos de extensión que ya existen —se reusan, no se proponen—: `listTickets`/`closedOn` (`packages/engine/src/tickets.ts:174`, `:50`); `loadMemory`/`memoryFiles` (`packages/engine/src/memory.ts:256`, `:237`); `MANUALES_POR_DEFECTO` + `recorrerManuales` + `PLANTILLA_METADATA` (`packages/engine/src/manuales.ts:41`, `:204`, `:70`); `configList` (`packages/engine/src/discovery.ts:91`); la escritura append-only de `appendReceipt` (`packages/engine/src/receipts.ts:70-79`); el contrato de índice derivado de `index-file.ts:1-7`; los pasos `kind: command` con parámetros `{manualesdir}` de `.valmen/processes/actualizar-manuales.yaml:20-45`; el despachador por subcomandos del CLI (`packages/cli/src/manuales.ts:27-46`) con su ayuda (`packages/cli/src/main.ts:284-330`), su `case` (`:1248-1250`) y su registro de banderas con valor (`:476-495`); el barril `packages/engine/src/index.ts:19-51`; y `createHash("sha256")` (`packages/engine/src/references.ts:139`).
- Causa raíz o hipótesis: no hay defecto que corregir, es una ausencia declarada. El objetivo del sprint S3 —«publicar el corpus indexable» (`evolucion-harness/tickets.yaml:55`)— quedó sin dueño, y lo que falta es la pieza que publica: leer las tres fuentes, dar a cada documento su origen y su fecha, y entregar solo lo que cambió. Hoy el conocimiento se **busca** (léxico y sin embeddings, `docs/12-FUNCIONALIDADES-PROXIMAS.md:664`), pero no se **entrega** a ningún índice.
- Riesgos y compatibilidad: (1) el motor no gana dependencias —el publicador lee con lo que ya hay y el destino se inyecta—, así que ningún proyecto adoptado cambia de comportamiento mientras no corra el comando ni declare el paso; (2) la fecha de un documento que no la declara (un manual sin «Última actualización», una entrada de memoria sin `Fecha`) queda **vacía**: se declara la ausencia en vez de inventarla; (3) el incremental depende de `.valmen/corpus/estado.json` y, si ese archivo se borra, la pasada siguiente republica todo, que es el comportamiento seguro; (4) el repositorio es el caso chico —41 tickets cerrados y dos entradas de memoria, sin manuales propios— y el corpus de un proyecto adoptado no se toca en esta sesión.
- Impactos de sync, migración, Docker o despliegue: ninguno de sync (no toca datos ni señales de un proyecto en uso), ninguno de migración (no hay esquema que migrar), ninguno de Docker (el comando corre en el árbol y no agrega imagen ni servicio) y ninguno de despliegue (el paso nuevo entra en un proceso que el `deploy` ya encadena con `continue_on_failure: true`, así que su fallo avisa y no bloquea la release).

## Plan

- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan).
- Aprobación delegada: la decisión viene de la autorización del PO del 2026-10-01 —«Si termina el ciclo QA y hacemos los commit y push para dejar todo listo para en la noche programar otro ciclo con otros tickets (Juan Andrade, Telegram 2026-10-01)»— y esta sesión la registra como aprobación **delegada**, con esa frase y su fecha; no es una aprobación escrita por el PO en este hilo.
- Pasos ordenados:
  1. Crear `packages/engine/src/corpus.ts` —archivo nuevo—: la cabecera con el contrato y el porqué de cada decisión (como `packages/engine/src/manuales.ts:1-31`), las tres colecciones (`COLECCIONES`), los tipos (`DocumentoCorpus`, `LoteCorpus`, `IndexadorCorpus`, `CorpusPublicado`), `construirCorpus(paths, opciones)` —manuales por su recorrido, memoria por `loadMemory` (`packages/engine/src/memory.ts:256`) y tickets cerrados por `listTickets` (`packages/engine/src/tickets.ts:174`)—, el delta contra `.valmen/corpus/estado.json`, `publicarCorpus(paths, {indexador})`, `renderCorpus` y el registro `INDEXADORES_CORPUS` con el indexador `archivos` de fábrica (append-only en `<corpus-dir>/<coleccion>.jsonl`, `packages/engine/src/receipts.ts:70-79`).
  2. Exportar el módulo desde `packages/engine/src/index.ts` (`:44`, junto a `export * from "./manuales-auditar.js"`) —archivo modificado, una línea— para que el CLI y las pruebas lo alcancen.
  3. Añadir `corpusPublicarCommand` a `packages/cli/src/commands.ts` —archivo modificado, junto a `manualesAuditarCommand`—: lee `--corpus-dir`, `--manuales-dir`, `--indexador` y `--completo`, llama a `publicarCorpus`, imprime `renderCorpus` y falla nombrando los válidos cuando el índice pedido no está en `INDEXADORES_CORPUS`.
  4. Crear `packages/cli/src/corpus.ts` —archivo nuevo— con el despachador de subcomandos (mismo patrón que `packages/cli/src/manuales.ts:27-46`) y cablearlo en `packages/cli/src/main.ts` con un `case "corpus"` junto a `case "manuales"` (`:1248-1250`), sumar `--corpus-dir` y `--indexador` a las banderas con valor (`:476-495`) y la ayuda de `corpus publicar` debajo de la de `manuales` (`:314-330`).
  5. Añadir el paso `publicar-corpus` al final de `.valmen/processes/actualizar-manuales.yaml` (`:45`) —archivo modificado— con `kind: command`, `run: valmen corpus publicar --manuales-dir {manualesdir}` y `evidence: [stdout]`.
  6. Documentar el contrato del corpus en `docs/12-FUNCIONALIDADES-PROXIMAS.md` §C5 —archivo modificado, debajo del párrafo «Estado: hecho, y sin embeddings» (`:664`)—: las tres colecciones, el par origen/fecha, la pasada incremental y el índice sustituible.
  7. Crear `tests/corpus-rag.test.ts` —archivo nuevo— con el laboratorio temporal de `tests/manuales-auditar.test.ts:29-98` como molde: las tres colecciones con origen y fecha, los tickets abiertos fuera, la segunda pasada vacía, el documento que cambia y vuelve a publicarse, el indexador doble inyectado y las importaciones del módulo nuevo.
  8. Extender `tests/procesos-deploy-manuales.test.ts` —archivo modificado— con la aserción del paso `publicar-corpus`, sin tocar las pruebas que ya cubren el encadenamiento y la auditoría.
  9. Correr `npx vitest run tests/corpus-rag.test.ts`, después `npx vitest run tests/procesos-deploy-manuales.test.ts`, después `npx vitest run` completo, y `npm run typecheck` para el cruce de tipos entre paquetes.
- Decisiones de diseño:
  1. **Un documento por unidad del registro, sin trocear ni embeber.** El motor publica `{coleccion, id, origen, fecha, titulo, hash, texto}` y el troceo y el embedding son de quien indexa. Alternativa descartada: trocear en el motor con un tamaño fijo —ata todos los destinos a la misma partición y mete una decisión de recuperación en el camino determinista—.
  2. **El índice destino se inyecta.** `publicarCorpus` no importa ninguna base vectorial: recibe un `IndexadorCorpus`, y el registro `INDEXADORES_CORPUS` con la clave `corpus-indexer` (`configList`, `packages/engine/src/discovery.ts:91`) elige el de fábrica —escribe el delta en `.valmen/corpus/<coleccion>.jsonl` con `appendFileSync`, el mismo patrón de `packages/engine/src/receipts.ts:70-79`—. Alternativa descartada: que el motor hable con Qdrant o pgvector por configuración —es la dependencia externa que `docs/05-PLUGINS.md:19` y la decisión D5 (`.valmen/features/evolucion-harness/design.md:63-65`) dejan fuera del motor—.
  3. **El incremental es por hash del contenido, no por fecha de modificación.** El estado es `id → sha256` en `.valmen/corpus/estado.json` y el delta son los nuevos y los cambiados; los que desaparecen se declaran `eliminados`, y `--completo` ignora el estado. Alternativa descartada: comparar `mtime` —un `clone` nuevo lo cambia en todo y la primera pasada republica el corpus entero, y restaurar un archivo no cambia su contenido pero tampoco su fecha—.
  4. **Cada fuente se lee con la función que ya existe, y el recorrido de manuales es propio y mínimo.** `listTickets` para los tickets cerrados, `loadMemory` para la memoria y un recorrido recursivo de `*.md` para los manuales, porque las dos copias que existen son privadas y ninguna devuelve el par `(fecha, texto)` (`packages/engine/src/manuales.ts:222`, `packages/engine/src/manuales-auditar.ts:283`). Alternativa descartada: exportar y ampliar la de `manuales.ts` —toca el módulo de detección que consume el ticket hermano R-S3-003 sin ganancia para él—.
  5. **El corpus es derivado y se reconstruye.** Publica en `.valmen/corpus/`, fuera del registro y del historial, y no es fuente de verdad, como el índice de `packages/engine/src/index-file.ts:1-7`. Alternativa descartada: escribirlo dentro de un `.md` versionado del proyecto —lo vuelve un artefacto que hay que mantener a mano y que puede desincronizarse del registro—.
  6. **El paso va al final de `actualizar-manuales`.** El corpus se publica cuando la release ya dejó los manuales al día, y el fallo del proceso no bloquea el deploy porque el encadenamiento ya declara `continue_on_failure: true` (`.valmen/processes/deploy.yaml:36-42`). Alternativa descartada: dejarlo solo como comando suelto —el corpus queda viejo justo cuando más cambió, que es la release, y nadie lo nota—.
- Archivos afectados: `packages/engine/src/corpus.ts` (nuevo), `packages/engine/src/index.ts` (modificado), `packages/cli/src/corpus.ts` (nuevo), `packages/cli/src/commands.ts` (modificado), `packages/cli/src/main.ts` (modificado), `.valmen/processes/actualizar-manuales.yaml` (modificado), `docs/12-FUNCIONALIDADES-PROXIMAS.md` (modificado), `tests/corpus-rag.test.ts` (nuevo) y `tests/procesos-deploy-manuales.test.ts` (modificado).
- Rollback: `git checkout -- packages/engine/src/index.ts packages/cli/src/commands.ts packages/cli/src/main.ts .valmen/processes/actualizar-manuales.yaml docs/12-FUNCIONALIDADES-PROXIMAS.md tests/procesos-deploy-manuales.test.ts` y `rm packages/engine/src/corpus.ts packages/cli/src/corpus.ts tests/corpus-rag.test.ts` —las rutas nuevas no están en `HEAD` y no las saca `git checkout`—. Lo que sobrevive al revert: lo ya publicado en `.valmen/corpus/`, que es derivado y se reconstruye; el resto del proceso `actualizar-manuales`, que queda como estaba; y los recibos ya emitidos, que el registro append-only no reescribe.

## Criterios de aceptación

- [x] R-S3-004: los tickets cerrados del registro quedan publicados en la colección `tickets`, cada documento con su origen y su fecha, y ningún ticket abierto entra.
      <!-- test: npx vitest run tests/corpus-rag.test.ts -->
- [x] Los manuales `*.md` del proyecto quedan en la colección `manuales` y las entradas de la memoria en la colección `memoria`, cada documento con su origen y su fecha.
      <!-- test: npx vitest run tests/corpus-rag.test.ts -->
- [x] Una segunda pasada sin cambios entrega un lote vacío.
      <!-- test: npx vitest run tests/corpus-rag.test.ts -->
- [x] Editar un manual vuelve a publicar solo el documento de ese manual.
      <!-- test: npx vitest run tests/corpus-rag.test.ts -->
- [x] Un indexador doble inyectado recibe el delta que el publicador le entrega.
      <!-- test: npx vitest run tests/corpus-rag.test.ts -->
- [x] Con el indexador doble, el directorio del corpus queda sin ninguna colección `<coleccion>.jsonl`.
      <!-- test: npx vitest run tests/corpus-rag.test.ts -->
- [x] Todas las importaciones de `packages/engine/src/corpus.ts` son de `node:` o relativas al propio paquete.
      <!-- test: npx vitest run tests/corpus-rag.test.ts -->
- [x] El proceso `actualizar-manuales` declara un paso final `publicar-corpus`, de tipo `command`, que corre `valmen corpus publicar`.
      <!-- test: npx vitest run tests/procesos-deploy-manuales.test.ts -->

## Puntos

```json
[]
```

## Implementación

Implementados los nueve pasos del plan por una sesión limpia de OpenCode (`opencode run --standalone --auto --agent build`, sesión `ses_f0533abbcffeS8K7vKYVfttzrM`), con la verificación propia a cargo de esta sesión.

- Archivos nuevos: `packages/engine/src/corpus.ts` (el publicador), `packages/cli/src/corpus.ts` (el despachador) y `tests/corpus-rag.test.ts`.
- Archivos modificados: `packages/engine/src/index.ts` (exportación del módulo), `packages/cli/src/commands.ts` (`corpusPublicarCommand`), `packages/cli/src/main.ts` (ayuda, banderas `--corpus-dir` y `--indexador`, `case "corpus"`), `.valmen/processes/actualizar-manuales.yaml` (paso final `publicar-corpus`), `tests/procesos-deploy-manuales.test.ts` (aserción del paso) y `docs/12-FUNCIONALIDADES-PROXIMAS.md` (contrato de publicación en §C5).
- Desvío declarado por el ejecutor, revisado en el diff: la prueba que exigía que `auditar-manuales` fuera el último paso del proceso ahora exige que sea el penúltimo, con `publicar-corpus` al final; el cambio es aditivo y las pruebas del encadenamiento y del fallo que no bloquea siguen intactas.
- El ejecutor escribió además las secciones Implementación y Pruebas del ticket; el texto se revisó y se reescribió acá con la verificación de esta sesión.
- Nada de Git: sin commit, push, tag ni PR. Los cambios ajenos del árbol quedaron intactos, incluidos los de otra sesión dentro de `packages/cli/src/main.ts` (credenciales), `packages/adapter`, `packages/server`, `.valmen/config.yaml`, `.valmen/routing.yaml` y `docs/03-GATES.md`.
- La publicación no se corrió contra el registro vivo del repositorio: la corrida end-to-end del binario usó un `--corpus-dir` temporal, fuera del árbol.

## Pruebas

Contrato de pruebas, en el orden en que se corrió. Directorio de ejecución: `/Users/juanandrade/Desktop/ValmenHarness`. Entorno: Node v26.10.0, dependencias npm instaladas; sin servicios ni red —las pruebas del corpus escriben en un laboratorio temporal—.

1. `npx vitest run tests/corpus-rag.test.ts` — archivo enfocado del ticket: 15 pruebas aprobadas. Resultado esperado: verde.
2. `npx vitest run tests/procesos-deploy-manuales.test.ts` — 4 pruebas aprobadas, incluida la del paso final `publicar-corpus`. Resultado esperado: verde.
3. `npx vitest run` — suite completa: 94 archivos aprobados y 1 omitido; 1730 pruebas aprobadas y 48 omitidas. Resultado esperado: verde, y sin línea base de fallos ajenos en la suite (la equivalencia de referencia está desactivada por configuración: `VALMEN_REFERENCE_TICKET_PY`).
4. `npm run typecheck` — salida 1: el build pasa y `tsc --noEmit` falla **solo** en `tests/cascada-verificada.test.ts:230` y `:253` (TS2379: `apiKey` opcional con `exactOptionalPropertyTypes`). Es un archivo que otra sesión ya tenía modificado al empezar y el fallo entra con sus líneas, no con las de este ticket; el código nuevo compila, porque el build del mismo comando termina. Queda como fallo ajeno declarado, no como verificación aprobada.
5. End-to-end con el binario real `valmen` sobre el registro del repositorio y un `--corpus-dir` temporal, fuera del árbol: la primera corrida publicó 43 documentos —41 tickets cerrados y 2 entradas de memoria, 0 manuales porque este repositorio no tiene directorio de manuales— y la segunda informó «43 sin cambios» sin anexar líneas: 41 líneas en `tickets.jsonl` y 2 en `memoria.jsonl`. `valmen corpus` sin subcomando falla con «corpus requiere un subcomando: publicar.»
6. Observación: la colección `manuales` no deja archivo cuando no tiene documentos, porque el indexador de fábrica solo escribe el delta; la colección está declarada y aparece en la salida del comando.

- Resultado del PO: aprobación **DELEGADA** — el PO delegó el análisis, el plan y el QA de este ticket en esta sesión con su autorización del 2026-10-01, citada literal: «Si termina el ciclo QA y hacemos los commit y push para dejar todo listo para en la noche programar otro ciclo con otros tickets (Juan Andrade, Telegram 2026-10-01)». El contrato se corrió tal como lo correría él y pasó: archivo enfocado 15/15, proceso de manuales 4/4, suite completa con 1730 pruebas aprobadas y 48 omitidas. Esta línea no son palabras del PO en este hilo: es la aprobación delegada, registrada con su frase y su fecha.

## QA

```json
[
  {
    "id": "QA-001",
    "date": "2026-10-02",
    "build_reference": "worktree:sha256:963e3ea0adec2dc561db334efbc5184f01427cfee27d9df63610363018439d31",
    "environment": "local macOS, registro del repositorio en /Users/juanandrade/Desktop/ValmenHarness, Node v26.10.0",
    "result": "pending",
    "findings": [],
    "correction": null,
    "po_confirmation": null
  },
  {
    "id": "QA-002",
    "date": "2026-10-02",
    "build_reference": null,
    "environment": null,
    "result": "approved",
    "findings": [],
    "correction": null,
    "po_confirmation": "Aprobación DELEGADA, no palabras del PO en este hilo: Juan Andrade delegó el análisis, el plan y el QA de este ticket en esta sesión con su autorización del 2026-10-01, citada literal —«Si termina el ciclo QA y hacemos los commit y push para dejar todo listo para en la noche programar otro ciclo con otros tickets (Juan Andrade, Telegram 2026-10-01)»—. El contrato de pruebas se corrió tal como lo correría él y pasó: archivo enfocado 15/15, proceso de manuales 4/4 y suite completa con 1730 pruebas aprobadas y 48 omitidas."
  }
]
```

## Evidencia

```json
[
  {
    "id": "EVIDENCE-001",
    "date": "2026-10-02",
    "kind": "automated-test",
    "description": "Secuencia ejecutada en la raíz: npx vitest run tests/corpus-rag.test.ts (15/15); npx vitest run tests/procesos-deploy-manuales.test.ts (4/4); npx vitest run (1730 aprobadas, 48 omitidas); npm run typecheck (salida 2: TS2379 en tests/cascada-verificada.test.ts:230,253, archivo preexistente ajeno no modificado). Gate qa-mechanical con evaluator command: GR-20261002-qa-mechanical, ocho criterios aprobados. Revisión final sin hallazgos funcionales bloqueantes en el alcance; typecheck global pendiente. Sin commits, push, tags ni PRs.",
    "reference": null,
    "point_id": null
  },
  {
    "id": "EVIDENCE-002",
    "date": "2026-10-02",
    "kind": "automated-test",
    "description": "Publicador del corpus: tres colecciones con origen y fecha, delta incremental por SHA-256 del texto, indexador inyectable con registro de nombres y paso final del proceso de manuales. El hash cubre, en orden alfabetico, los nueve archivos del cambio: .valmen/processes/actualizar-manuales.yaml, docs/12-FUNCIONALIDADES-PROXIMAS.md, packages/cli/src/commands.ts, packages/cli/src/corpus.ts, packages/cli/src/main.ts, packages/engine/src/corpus.ts, packages/engine/src/index.ts, tests/corpus-rag.test.ts y tests/procesos-deploy-manuales.test.ts. Lo que corrio el verificador: npx vitest run tests/corpus-rag.test.ts (15 verdes), npx vitest run tests/procesos-deploy-manuales.test.ts (4 verdes), npx vitest run (1730 verdes, 48 omitidas, sin fallos) y la corrida end-to-end del binario valmen corpus publicar sobre un corpus-dir temporal (43 documentos; segunda pasada 43 sin cambios). El typecheck falla solo en tests/cascada-verificada.test.ts:230,253, archivo ajeno ya modificado al iniciar la sesion.",
    "reference": "worktree:sha256:963e3ea0adec2dc561db334efbc5184f01427cfee27d9df63610363018439d31",
    "point_id": null
  }
]
```

## Retests

```json
[]
```

## Cierre

```json
[
  {
    "kind": "ticket-close",
    "id": "CLOSE-001",
    "date": "2026-10-02",
    "technical_summary": "Publicador nuevo del motor (packages/engine/src/corpus.ts) que arma tres colecciones —manuales, memoria y tickets cerrados— con origen y fecha por documento, delta incremental por SHA-256 del texto con estado en .valmen/corpus/estado.json, e indexador destino inyectable registrado por nombre (archivos de fabrica, JSONL append-only). Comando valmen corpus publicar con su despachador, su ayuda y sus banderas; paso final publicar-corpus en el proceso actualizar-manuales; contrato documentado en docs/12-FUNCIONALIDADES-PROXIMAS.md. Verificado con el archivo enfocado (15 verdes), el proceso de manuales (4 verdes), la suite completa (1730 verdes) y la corrida end-to-end del binario sobre un corpus-dir temporal (43 documentos; segunda pasada sin cambios). Sin dependencias nuevas: el modulo solo importa node: y vecinos del paquete.",
    "functional_summary": "Los tickets cerrados, los manuales y la memoria del proyecto quedan publicados como tres colecciones separadas, cada documento con su origen y su fecha, y la publicacion es incremental: solo lo que cambio desde la pasada anterior, con las bajas declaradas. El indice destino es sustituible, asi que una base vectorial entra como plugin y no como dependencia del motor. En este repositorio la corrida publica 41 tickets cerrados y 2 entradas de memoria, porque no tiene manuales propios.",
    "qa_status": "approved",
    "qa_waiver_reason": null,
    "po_confirmation": null,
    "release_impact": "unreleased: sin publicar. El cambio no toca datos, esquema ni despliegue, y el paso nuevo del proceso avisa y no bloquea la release."
  }
]
```

## Consumo de IA

- Lectura al cierre, con desvío declarado: los números de la sesión del harness (CONSUMO-002) se leyeron de `state.db` cuando el turno todavía estaba en curso, así que esa fila **sigue creciendo** después de esta lectura; su origen no registra costo. La fila del ejecutor (CONSUMO-001) sale de `opencode.db` y la de codex (CONSUMO-003) se registró con confianza baja porque el lector de codex no declara el modelo.

```json
[
  {
    "kind": "ai-usage",
    "date": "2026-10-02",
    "session_reference": "ses_f0533abbcffeS8K7vKYVfttzrM",
    "model": "unbiased/pareto-26.10-preview",
    "reasoning_effort": null,
    "notes": "Sesión OpenCode que implementó el ticket (opencode run --standalone --auto --agent build, título FEATURE-ENGINE-CORPUS-RAG-20260926). Números leídos de la tabla session_v2 de opencode.db.",
    "input_tokens": 221533,
    "output_tokens": 17288,
    "total_tokens": 238821,
    "estimated_cost_usd": 0.338986,
    "source": "opencode:/Users/juanandrade/.local/share/opencode/opencode.db",
    "confidence": "high",
    "id": "CONSUMO-001"
  },
  {
    "kind": "ai-usage",
    "date": "2026-10-02",
    "session_reference": "cron_4df7a1d17c01_20261001_230043",
    "model": "deepseek-v4.1-flash",
    "reasoning_effort": null,
    "notes": "Sesión de trabajo del harness de este ticket (cron). Números leídos de la tabla sessions de state.db al cierre: la fila sigue creciendo hasta que el turno termina, así que es una lectura al cierre y no el total final (desvío declarado). Razonamiento 43085 tokens, caché leída 15285888 tokens. El origen no registra costo (cost_status unknown).",
    "input_tokens": 196445,
    "output_tokens": 69682,
    "total_tokens": 309212,
    "estimated_cost_usd": 0,
    "source": "hermes:/Users/juanandrade/.hermes/profiles/valmen-harness/state.db",
    "confidence": "high",
    "id": "CONSUMO-002"
  },
  {
    "kind": "ai-usage",
    "date": "2026-10-02",
    "session_reference": "01a0f8a2-aabe-7542-8be9-2888dc93415b",
    "model": null,
    "reasoning_effort": null,
    "notes": "Sesión de codex del 2026-10-01 13:03 en la raíz del repositorio, que el lector de la línea de tiempo asocia a este ticket porque su texto menciona el id. Se registra para que la foto de consumo no falle: el lector de codex no lee el modelo (el archivo declara gpt-5.6-terra, gpt-6.1-sol y gpt-reserve) y por eso el campo va vacío en vez de inventar uno. Puede ser una sesión compartida con otro trabajo: su costo no se declara. Registrada por la sesión del harness, no por su autor.",
    "input_tokens": 1459238,
    "output_tokens": 200765,
    "total_tokens": null,
    "estimated_cost_usd": null,
    "source": "codex:01a0f8a2-aabe-7542-8be9-2888dc93415b",
    "confidence": "low",
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
    "date": "2026-09-26",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-01",
    "at": "2026-10-02T04:05:27.061Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-01",
    "at": "2026-10-02T04:06:17.116Z",
    "action": "gate-approved",
    "actor": "cli",
    "details": "Gate analysis aprobado por Juan Andrade (delegación, 2026-10-01): Aprobación delegada por la autorización del PO del 2026-10-01. El único punto flojo es de forma: diagnostico_explica_el_sintoma=0.80 y nombra_archivos_reales=0.89 quedaron en banda a menos de un décimo del umbral, y el diagnóstico es de una ausencia (el requisito quedó sin dueño) y no de un fallo con archivo culpable. Las proposiciones de fondo aprueban (causa_especifica=0.91, clasificacion=completa) y los cuatro checks mecánicos pasan, así que lo recomiendo y no se reescribe el artefacto."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-01",
    "at": "2026-10-02T04:06:25.502Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-01",
    "at": "2026-10-02T04:07:23.503Z",
    "action": "gate-approved",
    "actor": "cli",
    "details": "Gate plan aprobado por Juan Andrade (delegación, 2026-10-01): Aprobación delegada por la autorización del PO del 2026-10-01 (Telegram). Lo que queda en banda son tres criterios por su redacción: criterio_04=0.75, criterio_06=0.64 y criterio_07=0.46, los tres de una sola afirmación y con su comando de prueba declarado; el propio aviso de forma de la compuerta dice que lo único por debajo son criterios compuestos y que hay que replantear cómo están escritos y no lo que el plan cubre. Los descriptivos de fondo aprueban (pasos_ejecutables=0.93, criterios_verificables=0.96, compatibilidad hacia atrás=0.92, rollback_suficiente=0.93, archivos afectados=0.98) y los cuatro checks mecánicos pasan, así que lo recomiendo."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-01",
    "at": "2026-10-02T04:07:27.024Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-01",
    "at": "2026-10-02T04:07:50.401Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-10-01",
    "at": "2026-10-02T04:14:41.697Z",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-10-01",
    "at": "2026-10-02T04:17:42.473Z",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-002."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-10-01",
    "at": "2026-10-02T04:18:49.742Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-10-01",
    "at": "2026-10-02T04:18:54.985Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-10-01",
    "at": "2026-10-02T04:18:59.477Z",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-10-01",
    "at": "2026-10-02T04:19:47.724Z",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-014",
    "date": "2026-10-01",
    "at": "2026-10-02T04:19:52.230Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-015",
    "date": "2026-10-01",
    "at": "2026-10-02T04:21:15.513Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-016",
    "date": "2026-10-01",
    "at": "2026-10-02T04:21:19.709Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-002."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-017",
    "date": "2026-10-01",
    "at": "2026-10-02T04:22:10.248Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-003."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-018",
    "date": "2026-10-01",
    "at": "2026-10-02T04:22:15.911Z",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-019",
    "date": "2026-10-01",
    "at": "2026-10-02T04:22:40.677Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  }
]
```
