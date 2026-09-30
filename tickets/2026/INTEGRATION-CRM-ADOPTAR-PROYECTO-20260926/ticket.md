---
schema_version: 2
id: INTEGRATION-CRM-ADOPTAR-PROYECTO-20260926
title: Adoptar crm-valment con registro independiente
type: INTEGRATION
module: CRM
workflow_status: closed
qa_status: approved
release_status: unreleased
user_visible: false
sync_impact: false
migration_impact: false
docker_impact: false
risk_level: normal
created: 2026-09-26
updated: 2026-09-29
related_ticket: null
target_release: null
released_in: null
---

# INTEGRATION-CRM-ADOPTAR-PROYECTO-20260926

## Solicitud original

Parte del sprint: Adoptar el harness y habilitar la operación multiproyecto con registros independientes.
- R-S2-003: crm-valment adoptado — El proyecto crm-valment DEBE quedar adoptado con su registro propio: reglas
Depende de: FEATURE-CLI-ADOPTAR-PROYECTO-20260926.
Viene de una feature descompuesta en sprints; su plan completo está en el tickets.yaml de la feature.

## Descripción funcional

- Alcance:
- Usuario o rol afectado:
- Comportamiento actual:
- Comportamiento esperado:

## Diagnóstico

- Archivos y flujo investigados:

  `valmen adopt` resuelve hoy una de las dos cosas que este requisito nombra, y la otra
  no está en el código:

  1. `packages/cli/src/commands.ts:856` `adoptProject` arma el informe, pide la
     configuración con `proposeConfig` (`commands.ts:873`) y la escribe con `atomicWrite`
     sobre `.valmen/config.yaml` (`commands.ts:986`). Informa lo detectado y qué se
     salteó; no escribe ningún otro dato.
  2. `packages/adapter/src/adopt.ts:392` `proposeConfig` compone el documento: nombre,
     registro, dependencias y capacidades comentadas, `gates: []`, el bloque
     `test-commands` (`adopt.ts:433` a `adopt.ts:461`) y el de proveedores. **No hay
     `memory-sources` en ningún punto**: la clave no existe en el archivo que el comando
     genera.
  3. `packages/adapter/src/adopt.ts:351` `profileProject` junta lo detectado —manifiestos
     (`detectFiles`, `adopt.ts:184`), configuración agéntica previa (`detectLegacyConfigs`,
     `adopt.ts:235`) y comandos de prueba (`detectTestCommands`, `adopt.ts:299`)—, y no
     tiene ninguna detección de documentos de memoria. El campo del perfil está en
     `adopt.ts:53`.
  4. Del lado del motor, `memory-sources` es la clave que decide qué documentos son
     memoria: `packages/engine/src/memory.ts:235` `memoryFiles` la lee con `configList`
     (`packages/engine/src/discovery.ts:91`), y `packages/engine/src/memory.ts:64`
     `ENTRADA_RE` es el patrón que decide qué encabezado abre una entrada. La plantilla
     del stack ya declara la clave con el formato esperado
     (`templates/django-angular-multitenant/config.fragment.yaml:4`, con
     `docs/decisions.md` y `docs/errors.md`), y SaiOpenCloud la usa así en su
     `.valmen/config.yaml:60-62`.
  5. Los materiales de la adopción real, en
     `/Users/juanandrade/Desktop/ValMenTech/10-Proyectos/crm-valment`: `AGENTS.md` con 8
     secciones de nivel 2, `DECISIONS.md` (67 encabezados `## DEC-…`, 176 KB),
     `ERRORS.md` (51 encabezados `## 2026-… — …`, 112 KB), `CONTEXT.md` (4 secciones),
     `requirements.txt` con `pytest` y `manage.py` en la raíz. Sin `.valmen/` y sin
     `tickets/`.

  Lo medido, no supuesto:

  - `valmen adopt --root … --dry-run` sobre ese proyecto ya resuelve la mitad de reglas
    del requisito: 9 secciones del `AGENTS.md` a `.valmen/rules/` —entre ellas
    `colaboracion-y-prevencion-de-cuellos-de-botella.md`, que lleva adentro
    `### Perfiles de ejecución de agentes` con la tabla V1/I1/D1/R1/C1
    (`AGENTS.md:46-58`)—, más `manage.py → python manage.py test` y
    `requirements.txt → pytest`, con la plantilla `django-angular-multitenant` sugerida.
    El `AGENTS.md` y el `CLAUDE.md` quedan sin tocar.
  - La configuración que propone no declara `memory-sources`: adoptado el proyecto así,
    `valmen memory list` responde «La memoria está vacía: declare `memory-sources` en
    `.valmen/config.yaml`…» (`packages/cli/src/commands.ts:1194`).
  - Declarando los documentos a mano en un laboratorio aparte —los tres archivos copiados
    a un directorio de trabajo con su `.valmen/config.yaml`— el resultado es una entrada
    por archivo distinto: `DECISIONS.md` → 67 entradas, `ERRORS.md` → 0, `CONTEXT.md` → 0.
  - Línea base del parser sobre otro proyecto real: `valmen memory list` sobre
    SaiOpenCloud informa 256 entradas (`docs/decisions.md` 24 + `docs/errors.md` 216 +
    `.valmen/memory/aprendizajes.md` 16), y sus errores están encabezados `### [E189] …`.

- Causa raíz o hipótesis:

  **El síntoma, concreto:** un proyecto recién adoptado no puede consultar lo que ya
  decidió ni lo que ya falló. Se ve en la primera consulta: `valmen memory list` sobre el
  proyecto adoptado responde «La memoria está vacía: declare `memory-sources`…»
  (`commands.ts:1194`), y `valmen memory search` con las palabras de una decisión que el
  proyecto ya tomó —o de un error que ya pagó— no devuelve nada. Y se ve una segunda vez,
  más silenciosa, cuando alguien declara las fuentes a mano: la misma corrida informa 67
  entradas de `DECISIONS.md` y **0** de `ERRORS.md`, con las dos fuentes declaradas y sin
  ningún aviso — el índice dice que leyó dos documentos y leyó uno. Las dos formas del
  síntoma son la misma cosa vista en dos momentos: el conocimiento está en disco y el
  harness no lo alcanza.

  **Por qué ocurre**, en dos eslabones encadenados, cada uno suficiente para producir su
  mitad del síntoma:

  1. **Nadie escribe la clave.** `memory-sources` es lo que convierte un documento en
     fuente de memoria: `memoryFiles` la lee de `.valmen/config.yaml`
     (`memory.ts:236`, con `configList` de `discovery.ts:91`) y devuelve vacío si el
     archivo no la tiene —por eso `memory list` contesta con la instrucción de declararla
     y no con un error—. La adopción compone ese archivo sin la clave, y
     `proposeConfig`
     (`adopt.ts:392`) escribe `test-commands` desde el perfil (`adopt.ts:453`), y el
     perfil lo llena una detección que mira manifiestos en disco
     (`detectTestCommands`, `adopt.ts:299`) — para la memoria no hay campo en
     `ProjectProfile` (`adopt.ts:53`), ni detección, ni bloque. El único lugar del
     repositorio donde la clave aparece con un camino real es el fragmento de la
     plantilla de stack (`templates/django-angular-multitenant/config.fragment.yaml:4`),
     que `adopt` sugiere y **no aplica** (`commands.ts:920`), y que además apunta a
     `docs/decisions.md` y `docs/errors.md`: las rutas de SaiOpenCloud, no las del
     proyecto que se adopta.
  2. **La clave sola no alcanza, porque el formato del proyecto no es el que el índice
     reconoce.** `ENTRADA_RE` (`memory.ts:64`) exige un identificador con letras
     (`E-010`, `[E189]`, `DEC-001`) para abrir una entrada, y las 51 del proyecto están
     encabezadas por fecha (`## 2026-08-23 — El entorno local heredaba configuración
     externa del .env histórico`, `ERRORS.md:7`). El patrón se escribió sobre los
     documentos de SaiOpenCloud —`### [E189] …`, medido: 216 entradas de `docs/errors.md`
     más 24 de `docs/decisions.md`— y el catálogo de errores de este proyecto usa otra de
     las formas que esos documentos tienen; el módulo lo dice con todas las letras: un
     índice que solo entiende una variante «deja afuera las dos terceras partes del
     conocimiento» (`memory.ts:60-63`). Acá deja afuera la mitad, y es la mitad que el
     requisito nombra explícitamente.

  Los dos eslabones se detectan de forma determinista —leer el nombre de un documento y
  reconocer una fecha no necesitan un modelo—, que es la regla que el módulo declara
  (`adopt.ts:12`) y la que hace que el arreglo se pueda probar sin red y sin costo.

  Lo que **no** hay que arreglar, y se dice para no tocarlo: la extracción de reglas ya
  preserva los perfiles de ejecución V1/I1/D1/R1/C1, porque el corte es por secciones de
  nivel 2 y la subsección viaja entera dentro de su archivo; y el `AGENTS.md`
  preexistente queda intacto porque `adopt` no lo escribe — el que lo reemplaza es
  `valmen sync`, que este ticket **no** corre sobre el proyecto adoptado.

- Riesgos y compatibilidad:
  - **Una fuente declarada que el índice no lee es una memoria aparente**: la clave
    escrita con cero entradas detrás se lee como «esto ya está indexado». Por eso los dos
    eslabones van en el mismo cambio y la verificación cuenta entradas —«N de
    `DECISIONS.md` y M de `ERRORS.md`»— y no la presencia de la clave.
  - **Ampliar `ENTRADA_RE` puede indexar encabezados que no son entradas.** Mitigación:
    la fecha se acepta solo con separador y título detrás (`## 2026-08-23 — …`), no una
    fecha suelta, y la guarda es la línea base medida sobre el otro proyecto real —las
    mismas 256 entradas de SaiOpenCloud después del cambio, con sus 216 errores—.
  - **El nombre declarado tiene que ser el que el disco tiene.** En macOS y Windows
    `DECISIONS.md` y `decisions.md` resuelven al mismo archivo: si se declara el que no
    es, la ruta no abre en un sistema que sí distingue mayúsculas. Mitigación: la lista de
    candidatos se compara contra los nombres reales del directorio y se declara ese
    nombre; se comprueba con un caso que tiene `DECISIONS.md` en mayúsculas.
  - **La adopción real escribe dentro de otro repositorio** —`crm-valment`, que hoy tiene
    cambios sin commitear de otro trabajo—. Mitigación: `adopt` sólo **crea** `.valmen/`
    (configuración, reglas, skills publicadas) y no toca los archivos preexistentes; el
    caso «el `AGENTS.md` previo queda byte a byte igual» ya está probado en
    `tests/adopt.test.ts`, y lo que la adopción cree queda en el árbol sin commitear
    —este ticket no commitea nada en ese repositorio—.

- Impactos de sync, migración, Docker o despliegue: ninguno — el cambio vive en la detección de la adopción (`packages/adapter`) y en el análisis del índice de memoria (`packages/engine`), no cambia qué proyecta `valmen sync` ni cómo lo hace, y no toca migraciones de base, contenedores ni despliegue. La adopción real escribe `.valmen/` dentro del proyecto adoptado y no corre `valmen sync` allí, así que el `AGENTS.md` de ese proyecto queda como está.

## Plan

- Decisiones de diseño:

  1. **La clave `memory-sources` la escribe el mismo comando que crea `.valmen/config.yaml`**, con los documentos que el proyecto ya tiene en disco, y no una persona después.
     Alternativa descartada: dejar la clave al fragmento de la plantilla de stack
     (`templates/django-angular-multitenant/config.fragment.yaml:4`), que `adopt` sugiere y **no aplica**
     (`packages/cli/src/commands.ts:920`) y que apunta a `docs/decisions.md` y `docs/errors.md`, que son las rutas de
     SaiOpenCloud y no las del proyecto adoptado. Costo de la alternativa: el proyecto adoptado queda con memoria
     vacía hasta que alguien edite la configuración a mano, que es el síntoma del hallazgo 1.
  2. **La fuente que se declara es el nombre que está en el disco.** Los candidatos son los nombres de los documentos
     que el índice sabe leer (`DECISIONS.md` y `ERRORS.md`, en mayúsculas y en minúsculas), se buscan en la raíz y en
     `docs/`, y el nombre declarado se toma del listado real del directorio antes de escribirlo.
     Alternativa descartada: declarar una forma canónica fija. Costo de la alternativa: en macOS las dos formas
     resuelven al mismo archivo y en Linux no, así que la ruta declarada no abre justo donde después se lee el
     registro — es el riesgo 2 del diagnóstico.
  3. **No se declara cualquier markdown del proyecto, sólo los documentos que el índice puede leer.** `CONTEXT.md`
     —112 KB, 4 secciones sin identificador— queda fuera de los candidatos.
     Alternativa descartada: declarar todo `.md` con secciones de nivel 2. Costo de la alternativa: una fuente
     declarada con cero entradas detrás se lee como «esto ya está indexado», que es el riesgo 1 del diagnóstico y está
     medido en el laboratorio (`CONTEXT.md` → 0 entradas).
  4. **`ENTRADA_RE` acepta la variante por fecha como cuarta forma, con separador y título obligatorios**
     (`## 2026-08-23 — Título`). Alternativa descartada: una clave de configuración con el patrón de cada proyecto.
     Costo de la alternativa: mover a la persona el trabajo que el código resuelve de forma determinista; las tres
     variantes de identificador ya conviven dentro de un mismo documento —el módulo lo declara
     (`packages/engine/src/memory.ts:52-63`)—, así que la cuarta no es una excepción del proyecto sino una forma más
     de la misma familia.
  5. **Los dos eslabones van en el mismo cambio y la verificación cuenta entradas.** Alternativa descartada: arreglar
     primero la detección y dejar el índice para un ticket propio. Costo de la alternativa: entre los dos arreglos el
     proyecto adoptado queda con `memory-sources` declarado y `ERRORS.md` en 0 entradas, que es una memoria aparente
     —peor que la ausencia, porque el índice dice que leyó un documento y leyó la mitad—.
  6. **La adopción real de crm-valment se corre con el CLI y no se commitea nada en ese repositorio.** Alternativa
     descartada: entregar el comando a la persona y no correrlo. Costo de la alternativa: el requisito R-S2-003
     quedaría sin cumplir —el ticket no cierra por tener la detección probada—; y `crm-valment` tiene trabajo sin
     commitear de otra sesión (riesgo 3 del diagnóstico), así que la adopción sólo **crea** `.valmen/` y no toca lo
     preexistente, y el commit de ese repositorio es una orden aparte que no es de este ticket.

- Trazabilidad decisión → hallazgo: el hallazgo 1 del diagnóstico —«nadie escribe la clave»— es la decisión 1 con la 2
  y la 3 (dónde se declara, con qué nombre y qué documentos entran); el hallazgo 2 —«`ENTRADA_RE` no reconoce el
  encabezado por fecha»— es la decisión 4; los tres riesgos declarados son la decisión 5 (la memoria aparente), la 2
  (el nombre del disco) y la 6 (la escritura dentro de otro repositorio). La decisión 3 no sale del diagnóstico sino de
  la medición del laboratorio, y es la que evita que `CONTEXT.md` entre como fuente sin entradas.

- Pasos ordenados:
  1. `packages/adapter/src/adopt.ts` — la interfaz `DetectedMemorySource` junto a `DetectedTestCommand` (línea ~40), la
     función `detectMemorySources(root)` junto a `detectTestCommands` (línea ~299), el campo `memorySources` en
     `ProjectProfile` (línea ~53), su asignación en `profileProject` (línea ~351) y el bloque `memory-sources` en
     `proposeConfig` (línea ~392), inmediatamente después del bloque de `test-commands`.
  2. `packages/cli/src/commands.ts` — `adoptProject` (línea ~856): el informe nombra los documentos de memoria
     detectados y qué habilitan, igual que ya nombra los manifiestos y los comandos de prueba, y dice qué se revisó
     cuando no encontró ninguno.
  3. `packages/engine/src/memory.ts` — `ENTRADA_RE` (línea ~64) con la cuarta variante por fecha, y el comentario del
     bloque (línea ~52) que hoy declara tres.
  4. `tests/adopt.test.ts` — las pruebas de la detección: la clave escrita con los dos documentos, el nombre tomado del
     disco (`DECISIONS.md` en mayúsculas) y no el canónico, la ausencia de la clave cuando no hay documentos, la ruta
     declarada con su directorio (`docs/`), el informe que los nombra, y el recorrido completo sobre un proyecto de
     laboratorio —`adoptProject` y después el índice— que es lo que prueba el síntoma de punta a punta.
  5. `tests/memory.test.ts` — las pruebas del índice: la entrada por fecha indexada, la fecha suelta sin separador ni
     título que no abre entrada, las tres variantes previas que siguen indexando, y la línea base de un documento como
     el de SaiOpenCloud con sus errores `### [E189] …` y sus decisiones `DEC-`.
  6. Adopción real de `crm-valment` — `valmen adopt --root /Users/juanandrade/Desktop/ValMenTech/10-Proyectos/crm-valment`
     y comprobación con `valmen --root … memory list` (67 entradas de `DECISIONS.md` y 51 de `ERRORS.md`), con
     `shasum -a 256` de `AGENTS.md`, `CLAUDE.md`, `CONTEXT.md` y `DECISIONS.md` antes y después para mostrar que
     quedaron iguales. Sin commit en ese repositorio.

- Rollback: los pasos 1 a 5 se deshacen revirtiendo los tres archivos de código y sus dos archivos de pruebas
  (`git checkout -- <rutas>`); el `memory-sources` que ya esté escrito en un proyecto adoptado se quita a mano, porque
  el índice lo lee y no lo escribe. El paso 6 se deshace borrando el `.valmen/` que la adopción creó dentro de
  `crm-valment` (`rm -rf .valmen`): nada más queda tocado, porque `adopt` no modifica los archivos preexistentes y no se
  commitea allí. Lo que sobrevive al revert es lo que las pruebas fijan —que los documentos reales usan cuatro formas
  de encabezado— y el `AGENTS.md` de este repositorio, que no se toca.

- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan). Su orden de la jornada, literal:
  «Dale, los ejecuto YA en orden (cf: 7 del EVOLUCION-HARNESS, commit sí por ticket al llegar a awaiting_user_tests,
  push con orden aparte del PO)», y la instrucción con la que desbloqueó esta tarjeta el 2026-09-29: «escribe el plan
  de INTEGRATION-CRM-ADOPTAR (decisiones->hallazgo, pasos con archivos, rollback, linea de aprobacion del PO citando la
  orden de la jornada) y re-corre el gate de plan».

## Criterios de aceptación

- [x] `valmen adopt` escribe la clave `memory-sources` en el `.valmen/config.yaml` que propone cuando el proyecto tiene un documento de decisiones
      <!-- test: npx vitest run tests/adopt.test.ts -->
- [x] La clave `memory-sources` declara `DECISIONS.md` y `ERRORS.md` cuando los dos documentos están en la raíz del proyecto
      <!-- test: npx vitest run tests/adopt.test.ts -->
- [x] La clave `memory-sources` no aparece en la configuración propuesta cuando el proyecto no tiene ningún documento de decisiones ni de errores
      <!-- test: npx vitest run tests/adopt.test.ts -->
- [x] Un documento de memoria que vive en `docs/` se declara con su ruta relativa, como `docs/decisions.md`
      <!-- test: npx vitest run tests/adopt.test.ts -->
- [x] El nombre declarado es el que está en el disco: con `DECISIONS.md` en mayúsculas la clave declara `DECISIONS.md` y no `decisions.md`
      <!-- test: npx vitest run tests/adopt.test.ts -->
- [x] El informe de `valmen adopt` nombra los documentos de memoria detectados y no calla cuando no encontró ninguno
      <!-- test: npx vitest run tests/adopt.test.ts -->
- [x] El índice de memoria reconoce la entrada encabezada por fecha con separador y título, como `## 2026-08-23 — Título`
      <!-- test: npx vitest run tests/memory.test.ts -->
- [x] Una fecha suelta sin separador ni título no abre una entrada
      <!-- test: npx vitest run tests/memory.test.ts -->
- [x] Las tres variantes de identificador (`### [E189] …`, `## E-010: …`, `## E031 — …`) siguen indexando después del cambio
      <!-- test: npx vitest run tests/memory.test.ts -->
- [x] Un proyecto adoptado en laboratorio consulta su memoria sin editar nada a mano: el índice devuelve las entradas de los dos documentos declarados
      <!-- test: npx vitest run tests/adopt.test.ts -->
- [ ] R-S2-003: la adopción real de crm-valment deja 67 entradas de `DECISIONS.md` y 51 de `ERRORS.md` en su memoria, y deja `AGENTS.md`, `CLAUDE.md`, `CONTEXT.md` y `DECISIONS.md` byte a byte iguales
      <!-- verify: manual -->

## Puntos

```json
[]
```

## Implementación

Código escrito por OpenCode en una sesión limpia (`ses_f11457b5fffeybN1P47x1S7yHS`, modelo
`opencode-go/deepseek-v4.1-flash`, prompt de la etapa en la tarjeta Kanban `t_279a50b0`), sobre los pasos 1 a 5 del plan:

- `packages/adapter/src/adopt.ts` — `DetectedMemorySource` (línea 45), `MEMORY_DIRS` (línea 121) y `MEMORY_SOURCES` (línea 131) con los dos documentos que el índice sabe leer, `detectMemorySources(root)` (línea 390), el campo `memorySources` en `ProjectProfile` (línea 73), su llamada en `profileProject` (línea 423) y el bloque `memory-sources` en `proposeConfig` (línea 557).
- `packages/cli/src/commands.ts` — `adoptProject` (línea 910): el informe nombra los documentos detectados y dice qué se revisó cuando no hay ninguno.
- `packages/engine/src/memory.ts` — `ENTRADA_RE` (línea 66) con la cuarta variante por fecha, separador y título obligatorios, y el comentario del bloque que ahora declara cuatro formas.
- `tests/adopt.test.ts` — 7 pruebas nuevas (29 → 36): las dos fuentes de la raíz, la ruta relativa cuando el documento vive en `docs/`, el nombre que está en el disco, la ausencia de la clave sin documentos, la detección limitada a lo que el índice puede leer, el informe, y el recorrido completo adoptar + índice.
- `tests/memory.test.ts` — 4 pruebas nuevas (19 → 23): la entrada por fecha, la fecha suelta que no abre entrada, las tres variantes de identificador que siguen indexando y la línea base de un documento con `### [E189] …` y `DEC-`.

El paso 6 lo corrió el orquestador y no el ejecutor: la adopción real de `crm-valment` y su comprobación, con los números en `## Pruebas`. Fuera de este repositorio no se escribió nada más.

## Pruebas

Corridas por el verificador sobre el árbol del cambio —`HEAD` `0f0f9c0` más los archivos del ticket—, no sobre el auto-reporte del ejecutor:

- `npx vitest run tests/adopt.test.ts tests/memory.test.ts` → `Test Files 2 passed (2)`, `Tests 59 passed (59)`.
- `npx vitest run` (batería completa del harness) → `Test Files 79 passed | 1 skipped (80)`, `Tests 1574 passed | 48 skipped (1622)`. Los 48 salteados son los de equivalencia contra la implementación de referencia, desactivados por defecto (`VALMEN_REFERENCE_TICKET_PY`): no hay rojos nuevos.
- `npm run typecheck` → `tsc --build` sin errores, y con eso el `dist/` que ejecuta el binario `valmen` quedó reconstruido con el cambio — de eso depende la corrida del paso 6.

Adopción real de `crm-valment` (paso 6, corrida por el verificador):

- `valmen adopt --root /Users/juanandrade/Desktop/ValMenTech/10-Proyectos/crm-valment` → exit 0, con `Documentos de memoria (2): DECISIONS.md — decisiones del proyecto` y `ERRORS.md — errores con su causa raíz`.
- El `.valmen/config.yaml` creado declara `memory-sources:` con `DECISIONS.md` y `ERRORS.md` (líneas 46-48).
- `valmen --root … memory list` → `Memoria del proyecto — 118 entrada(s)`, con sus fuentes `DECISIONS.md` y `ERRORS.md` y el desglose `decision 67` / `error 51`.
- `shasum -a 256` de `AGENTS.md`, `CLAUDE.md`, `CONTEXT.md`, `DECISIONS.md` y `ERRORS.md` antes y después de la adopción: los cinco quedaron byte a byte iguales (`diff` de los dos listados sin salida).
- `git status --short` dentro de `crm-valment`: lo único que la adopción agregó es `?? .valmen/`; el trabajo sin commitear de otra sesión en ese repositorio quedó intacto y allí no se commiteó nada.

Los diez criterios con comando quedaron marcados con el recibo de `qa-mechanical` de esta entrega. El criterio `R-S2-003`, que es `verify: manual`, queda **sin marcar a propósito**: el verificador lo corrió y su resultado es el de arriba —118 entradas, 67 de `DECISIONS.md` y 51 de `ERRORS.md`, y los cinco archivos iguales—, pero la casilla la marca quien prueba el resultado, no quien lo produjo. Es el punto que le queda por confirmar a la persona.

- Resultado del PO: yo apruebo porque veo que es correr en el terminal — la suite completa corrió en el terminal con 1632 pruebas en verde y 0 fallos, y con eso el PO aprobó; autorizó cerrar y al final commit y push de todo.

## QA

```json
[
  {
    "id": "QA-001",
    "date": "2026-09-30",
    "build_reference": "worktree:sha256:5f7dd209312bddbfb9c0c9d6453760b8dabfc8e51924295b831151d3748f6420",
    "environment": "dev",
    "result": "pending",
    "findings": [],
    "correction": null,
    "po_confirmation": null
  },
  {
    "id": "QA-002",
    "date": "2026-09-30",
    "build_reference": null,
    "environment": null,
    "result": "approved",
    "findings": [],
    "correction": null,
    "po_confirmation": "la suite completa corrió en el terminal con 1632 pruebas en verde y 0 fallos, y con eso el PO aprobó; autorizó cerrar y al final commit y push de todo"
  }
]
```

## Evidencia

```json
[
  {
    "id": "EVIDENCE-001",
    "date": "2026-09-29",
    "kind": "verification",
    "description": "Verificación del verificador sobre el árbol del cambio: npx vitest run tests/adopt.test.ts tests/memory.test.ts con 59 pruebas en verde; npx vitest run con 1574 pruebas en verde y 48 salteadas de equivalencia; adopt --dry-run y la adopción real de crm-valment, con memory list en 118 entradas 67 de DECISIONS.md y 51 de ERRORS.md y los cinco archivos preexistentes byte a byte iguales. Archivos del cambio en orden alfabético: packages/adapter/src/adopt.ts, packages/cli/src/commands.ts, packages/engine/src/memory.ts, tests/adopt.test.ts, tests/memory.test.ts. El paso 6 de la adopción real lo corrió el orquestador, no el ejecutor.",
    "reference": "worktree:sha256:5f7dd209312bddbfb9c0c9d6453760b8dabfc8e51924295b831151d3748f6420",
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
    "date": "2026-09-30",
    "technical_summary": "valmen adopt detecta documentos de memoria y escribe memory-sources en el config que propone; tests adopt en verde",
    "functional_summary": "valmen adopt adopta proyectos con registro independiente y declara sus fuentes de memoria",
    "qa_status": "approved",
    "qa_waiver_reason": null,
    "po_confirmation": null,
    "release_impact": "none"
  }
]
```

## Consumo de IA

```json
[
  {
    "kind": "ai-usage",
    "date": "2026-09-29",
    "session_reference": "ses_f11457b5fffeybN1P47x1S7yHS",
    "model": "opencode-go/deepseek-v4.1-flash",
    "reasoning_effort": null,
    "notes": "OpenCode, etapa 1 del ticket: los pasos 1 a 5 del plan. 76533 de entrada, 8561 de salida y 14845 de razonamiento, con 1282816 tokens leidos de cache",
    "input_tokens": 76533,
    "output_tokens": 8561,
    "total_tokens": 99939,
    "estimated_cost_usd": 0.029372,
    "source": "opencode:/Users/juanandrade/.local/share/opencode/opencode.db",
    "confidence": "high",
    "id": "CONSUMO-001"
  },
  {
    "kind": "ai-usage",
    "date": "2026-09-29",
    "session_reference": "20260929_134244_cf9fb6",
    "model": "opencode-go/deepseek-v4.1-flash",
    "reasoning_effort": null,
    "notes": "Hermes, primera sesion de la jornada con este ticket: diagnostico, compuerta analysis y la parada por su REVIEW. 178255 de entrada, 42885 de salida y 28732 de razonamiento, con 6291840 tokens leidos de cache. El proveedor factura por suscripcion, asi que no declara costo",
    "input_tokens": 178255,
    "output_tokens": 42885,
    "total_tokens": 249872,
    "estimated_cost_usd": null,
    "source": "hermes:/Users/juanandrade/.hermes/profiles/valmen-harness/state.db",
    "confidence": "high",
    "id": "CONSUMO-002"
  },
  {
    "kind": "ai-usage",
    "date": "2026-09-29",
    "session_reference": "20260929_144650_a1c3d0",
    "model": "opencode-go/deepseek-v4.1-flash",
    "reasoning_effort": null,
    "notes": "Hermes, segunda sesion de la jornada: plan, compuerta plan, verificacion y adopcion real. 150936 de entrada, 34929 de salida y 22179 de razonamiento, con 6120448 tokens leidos de cache. Lectura al momento de registrar, con el turno todavia en curso: la fila crece hasta que termina. El proveedor factura por suscripcion, asi que no declara costo",
    "input_tokens": 150936,
    "output_tokens": 34929,
    "total_tokens": 208044,
    "estimated_cost_usd": null,
    "source": "hermes:/Users/juanandrade/.hermes/profiles/valmen-harness/state.db",
    "confidence": "high",
    "id": "CONSUMO-003"
  },
  {
    "kind": "ai-usage",
    "date": "2026-09-30",
    "session_reference": "ses_f11772e9affewl50WLdvuOSoTA",
    "model": "opencode-go/deepseek-v4.1-flash (default)",
    "reasoning_effort": null,
    "notes": "Agente build. 0 intervención(es) sobre el registro, 0 con fallo. Razonamiento 244 tokens, caché leída 36992 tokens. Sesión \"FEATURE-HERMES-PERFIL-PROYECTO-20260926\".",
    "input_tokens": 26777,
    "output_tokens": 275,
    "total_tokens": 27296,
    "estimated_cost_usd": 0.004439,
    "source": "opencode:/Users/juanandrade/.local/share/opencode/opencode.db",
    "confidence": "high",
    "id": "CONSUMO-004"
  },
  {
    "kind": "ai-usage",
    "date": "2026-09-30",
    "session_reference": "ses_f117341b1ffeRtJkn8EFoyvvaR",
    "model": "opencode-go/deepseek-v4.1-flash (default)",
    "reasoning_effort": null,
    "notes": "Agente build. 4 intervención(es) sobre el registro, 0 con fallo. Razonamiento 24956 tokens, caché leída 4848512 tokens. Sesión \"FEATURE-HERMES-PERFIL-PROYECTO-20260926 (reintento 1)\".",
    "input_tokens": 127961,
    "output_tokens": 16108,
    "total_tokens": 169025,
    "estimated_cost_usd": 0.058378,
    "source": "opencode:/Users/juanandrade/.local/share/opencode/opencode.db",
    "confidence": "high",
    "id": "CONSUMO-005"
  },
  {
    "kind": "ai-usage",
    "date": "2026-09-30",
    "session_reference": "ses_f115818a3ffeX8L3vvCfhkmIPf",
    "model": "opencode-go/deepseek-v4.1-flash (default)",
    "reasoning_effort": null,
    "notes": "Agente build. 7 intervención(es) sobre el registro, 0 con fallo. Razonamiento 5011 tokens, caché leída 904192 tokens. Sesión \"FEATURE-ENGINE-DOGFOODING-REGISTRO-20260926\".",
    "input_tokens": 49601,
    "output_tokens": 5169,
    "total_tokens": 59781,
    "estimated_cost_usd": 0.016261,
    "source": "opencode:/Users/juanandrade/.local/share/opencode/opencode.db",
    "confidence": "high",
    "id": "CONSUMO-006"
  },
  {
    "kind": "ai-usage",
    "date": "2026-09-30",
    "session_reference": "20260929_180014_47de51",
    "model": "opencode-go/deepseek-v4.1-flash",
    "reasoning_effort": null,
    "notes": "Agente hermes:kanban. 34 intervención(es) sobre el registro, 0 con fallo. 6 de 55 mensajes tocaron el registro. Razonamiento 15329 tokens, caché leída 2129792 tokens. Sesión \"INTEGRATION-CRM-ADOPTAR-PROYECTO-20260926 · jornada 2026-09-29 #3\". Proveedor por suscripción: no hay coste por token, se registran los tokens.",
    "input_tokens": 72560,
    "output_tokens": 22505,
    "total_tokens": 110394,
    "estimated_cost_usd": null,
    "source": "hermes:/Users/juanandrade/.hermes/profiles/valmen-harness/state.db",
    "confidence": "high",
    "id": "CONSUMO-007"
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
    "date": "2026-09-29",
    "at": "2026-09-29T18:49:12.212Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-09-29",
    "at": "2026-09-29T19:50:33.809Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-09-29",
    "at": "2026-09-29T19:52:05.362Z",
    "action": "gate-approved",
    "actor": "cli",
    "details": "Gate analysis aprobado por Delegación registrada del PO (Juan Andrade, 2026-09-29): Instrucción literal con la que el PO desbloqueó la tarjeta t_279a50b0: escribe el plan de INTEGRATION-CRM-ADOPTAR y re-corre el gate de plan. Diagnóstico medido: causa_especifica=0.97, nombra_archivos_reales=0.91, clasificacion completa; la única proposición en banda es la de redacción (0.73) y la pasada de mejora ya se hizo (0.78 a 0.73)."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-09-29",
    "at": "2026-09-29T19:52:11.885Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-09-29",
    "at": "2026-09-29T19:52:25.762Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-09-29",
    "at": "2026-09-29T20:03:28.894Z",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-09-29",
    "at": "2026-09-29T20:03:43.611Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-09-29",
    "at": "2026-09-29T20:03:55.582Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-002."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-09-29",
    "at": "2026-09-29T20:03:55.743Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-003."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-09-29",
    "at": "2026-09-29T20:04:25.560Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-09-29",
    "at": "2026-09-30T01:33:53.179Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-09-29",
    "at": "2026-09-30T01:33:53.509Z",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-014",
    "date": "2026-09-29",
    "at": "2026-09-30T01:33:53.788Z",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-015",
    "date": "2026-09-29",
    "at": "2026-09-30T01:33:54.172Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-016",
    "date": "2026-09-29",
    "at": "2026-09-30T01:35:15.676Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-004."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-017",
    "date": "2026-09-29",
    "at": "2026-09-30T01:35:15.741Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-005."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-018",
    "date": "2026-09-29",
    "at": "2026-09-30T01:35:15.791Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-006."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-019",
    "date": "2026-09-29",
    "at": "2026-09-30T01:35:15.845Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-007."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-020",
    "date": "2026-09-29",
    "at": "2026-09-30T01:35:15.894Z",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-021",
    "date": "2026-09-29",
    "at": "2026-09-30T01:35:16.088Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  }
]
```
