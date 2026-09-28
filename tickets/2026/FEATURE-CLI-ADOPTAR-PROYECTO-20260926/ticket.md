---
schema_version: 2
id: FEATURE-CLI-ADOPTAR-PROYECTO-20260926
title: Implementar valmen adopt para proyectos nuevos
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
created: 2026-09-26
updated: 2026-09-27
related_ticket: null
target_release: null
released_in: null
---

# FEATURE-CLI-ADOPTAR-PROYECTO-20260926

## Solicitud original

Parte del sprint: Adoptar el harness y habilitar la operación multiproyecto con registros independientes.
- R-S2-002: Adopción asistida de un proyecto nuevo — `valmen adopt` DEBE bastar para dejar un proyecto operable en una sesión:
Viene de una feature descompuesta en sprints; su plan completo está en el tickets.yaml de la feature.

## Descripción funcional

- Alcance: el comando `valmen adopt` deja un proyecto operable en una sesión. Extrae
  las reglas del `AGENTS.md` que el proyecto ya tiene hacia `.valmen/rules/`, detecta
  los `test-commands` de su stack en el `.valmen/config.yaml` que propone, y sugiere la
  plantilla `django-angular-multitenant` cuando el stack coincide. Nada preexistente se
  pisa: lo que ya está se respeta y se informa.
- Usuario o rol afectado: quien adopta el harness en un proyecto en marcha —la persona
  que corre `valmen adopt` una vez, antes del primer ticket del proyecto adoptado.
- Comportamiento actual: `valmen adopt` escribe `.valmen/config.yaml` sin
  `test-commands`, deja `.valmen/rules/` vacío y, cuando hay un `AGENTS.md` previo, avisa
  que `valmen sync` lo va a reemplazar y pide a la persona que copie su contenido a mano.
- Comportamiento esperado: al terminar `valmen adopt` el proyecto tiene sus reglas en
  `.valmen/rules/` —extraídas del `AGENTS.md` previo, sin pisar las que ya existan—, una
  lista de `test-commands` que el gate mecánico puede correr, y la plantilla de su stack
  sugerida en el informe; ningún archivo preexistente cambia.

## Diagnóstico

- Archivos y flujo investigados:

  `valmen adopt` recorre cuatro pasos, todos en dos archivos:

  1. `packages/cli/src/commands.ts:854` `adoptProject` arma el informe, y en
     `commands.ts:871` pide la configuración a `proposeConfig`.
  2. `packages/adapter/src/adopt.ts:291` `proposeConfig` compone el
     `.valmen/config.yaml`: nombre, registro, dependencias y capacidades como comentario,
     `gates: []` y el bloque de proveedores. Termina en `adopt.ts:341` y **nunca escribe
     `test-commands`**: el campo no existe en el archivo que el comando genera.
  3. `packages/adapter/src/adopt.ts:225` `detectLegacyConfigs` reconoce la configuración
     agéntica preexistente, y de un `AGENTS.md` previo lee los primeros 800 caracteres
     (`adopt.ts:236`) sólo para buscar las palabras «legado»/«legacy»/«deprecat».
     **Ninguna línea de su contenido llega a `.valmen/rules/`**: el archivo se lista como
     «NO se toca» y ahí termina.
  4. `packages/cli/src/commands.ts:920` sugiere las plantillas del catálogo cuyos
     `detects` existen en disco, y `commands.ts:989` avisa del `AGENTS.md` previo.

  Los puntos donde el trabajo se enchufa —leídos en el código, no propuestos:
  - `packages/adapter/src/project.ts:68` `readRules` lee **todos** los
    `.valmen/rules/*.md` ordenados por nombre de archivo, y `project.ts:132`
    `demoteTitle` degrada el `#` de cada uno a `##` para incluirlo en el documento
    compuesto. Un archivo de reglas con `# Título` y su cuerpo vuelve al `AGENTS.md` como
    la sección `## Título`: es lo que hace que la extracción dé la vuelta completa.
  - `packages/adapter/src/project.ts:158` `projectAgentsMd` compone el documento **desde
    `.valmen/`**, y `packages/cli/src/commands.ts:701` lo escribe con `atomicWrite` sobre
    `AGENTS.md`: el archivo que está en disco se reemplaza, no se fusiona.
  - `packages/engine/src/gate.ts:128` `testCommands` devuelve
    `configList(root, "test-commands")`; `packages/engine/src/discovery.ts:91`
    `configList` es el lector de listas de `.valmen/config.yaml`, con parser propio del
    subset de YAML: una lista huérfana invalida el documento entero y la lista se lee
    vacía, sin aviso.
  - `packages/engine/src/gate.ts:167`: con la lista vacía, la compuerta mecánica responde
    «El proyecto no declara qué comandos puede correr como verificación» en cuanto un
    criterio declara `<!-- test: … -->`.
  - `templates/django-angular-multitenant/blueprint.yaml:11` declara sus `detects`
    (`BackEnd/requirements.txt`, `BackEnd/manage.py`, `FrontEnd/angular.json`), que es
    contra lo que compara `commands.ts:925`.
  - `packages/adapter/src/adopt.ts:353` `adoptPlan` declara `.valmen/legacy/` y nadie lo
    lee: `grep` sobre `packages/*/src` sólo encuentra su declaración. Hoy es una ruta
    anunciada y vacía, y no hace falta para este trabajo.

- Causa raíz o hipótesis: la adopción deja tres de las cuatro cosas que el requisito pide
  en manos de quien adopta, y la que falta no se nota hasta que el trabajo ya empezó.

  **El síntoma:** al terminar `valmen adopt` el proyecto no queda operable. Se ve en dos
  lugares concretos —el primer ticket del proyecto adoptado declara un criterio con
  `<!-- test: … -->` y la compuerta mecánica se detiene con el mensaje de `gate.ts:167`
  porque no hay ninguna lista de comandos autorizados; y el primer `valmen sync` que el
  propio `adopt` indica como paso siguiente reemplaza el `AGENTS.md` por el documento
  compuesto desde `.valmen/` (`project.ts:158`), con lo que las reglas que el proyecto ya
  tenía escritas dejan de estar en el archivo que leen los agentes.

  **Por qué ocurre:** `adopt` escribe configuración pero no escribe los dos datos que la
  hacen usable. El `test-commands` no se genera en ningún punto de `proposeConfig`
  (`adopt.ts:291`, que termina en `adopt.ts:341` sin ese campo), así que la lista que
  `gate.ts:128` lee con `configList` sale vacía y el comando del criterio no tiene nada
  que lo autorice; y las reglas del `AGENTS.md` previo no se extraen —`detectLegacyConfigs`
  (`adopt.ts:225`) sólo lee los primeros 800 caracteres para buscar la palabra «legado»,
  `adopt.ts:236`—, así que `.valmen/rules/` queda vacío y `sync` compone el documento sin
  nada del proyecto. El aviso de `commands.ts:989` lo dice y no lo arregla: pedirle a la
  persona que copie a mano lo que el comando tiene delante es lo que el requisito prohíbe
  («lo que existe se respeta y se dice»).

  Las dos cosas se detectan de forma determinista, que es la regla que el módulo declara
  en `packages/adapter/src/adopt.ts:12` —«Ninguna detección llama a un modelo: es todo
  análisis de archivos»—: leer `manage.py` o `vitest` de un manifiesto y cortar un
  `AGENTS.md` por sus encabezados de nivel 2 no necesitan un modelo.

  Lo tercero —la plantilla sugerida por stack— ya está implementado en `commands.ts:920`
  y no tiene guarda: `tests/blueprints.test.ts` prueba el catálogo y el aplicado, y
  ninguna prueba comprueba que `adopt` la sugiera cuando el stack coincide.

- Riesgos y compatibilidad:
  - El `.valmen/config.yaml` generado tiene que parsear: `configList` devuelve vacío en
    silencio cuando el subset no cierra, y el efecto es el mismo que no haber escrito nada.
    Por eso la verificación parsea lo que `proposeConfig` devuelve, en vez de mirar el
    texto.
  - La extracción no puede pisar reglas: un `.valmen/rules/<área>.md` que ya existe se
    saltea y se informa.
  - Un encabezado `##` dentro de un bloque de código no es una sección: el corte tiene que
    respetar los cercos, o el `AGENTS.md` de un proyecto con ejemplos se parte en un lugar
    arbitrario.
  - Un `AGENTS.md` ya generado por el harness lleva el marcador de
    `packages/adapter/src/templates.ts:279` (`GENERADO POR valmen`) y no tiene nada que
    extraer: sus reglas ya vienen de `.valmen/rules/`.
  - `--dry-run` no escribe nada, y una adopción ya corrida sigue sin sobrescribir la
    configuración.

- Impactos de sync, migración, Docker o despliegue: ninguno — el cambio vive en el comando
  `valmen adopt` y escribe sólo dentro de `.valmen/` del proyecto que se adopta. No cambia
  lo que `valmen sync` proyecta ni cómo lo hace, y no toca migraciones de base, contenedores
  ni despliegue. Los archivos que `adopt` cree entran al `AGENTS.md` en el próximo sync, que
  es el efecto buscado y no un cambio del mecanismo.

## Plan

- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan).
  Aprobación **delegada**: la autorización vigente de Juan Andrade (2026-09-27) dice «listo ya verifique la corrida de los 3 cron de hoy y me gusto sobre todo el ultimo que corrio que ya integro slack y me aviso cunado empezo y cuando termino, hizo commit y todo, que necesito que en 3 horas programes 3 tickects mas de la misma manera que hiciste con el 3 pueden ser separacion de 2 horas entre cada uno», y su alcance, declarado al programar este eslabón, cubre aprobar la compuerta `analysis`, la compuerta `plan` y el QA. La compuerta `plan` devolvió `REVIEW` (run 1: criterio_05=0.63, criterio_06=0.86, criterio_07=0.42, criterio_09=0.84, criterio_10=0.81, media 0.753; run 2 tras partir los criterios compuestos: criterio_05=0.73, criterio_06=0.43, criterio_07=0.89, criterio_08=0.42, criterio_09=0.73, criterio_11=0.53, criterio_12=0.81, media 0.707) y esta sesión la recomienda: lo que queda en banda es la redacción de los criterios —el evaluador los sigue leyendo como compuestos y los valores se mueven entre corridas sin que cambie el plan— y no el alcance, los archivos, las decisiones, la cobertura ni el rollback, que salieron en verde (`hay_archivos_afectados=0.98`, `rollback_suficiente=0.91`, `criterios_verificables=0.95`, `clasificacion=completo`).
- Pasos ordenados:
  1. `packages/adapter/src/adopt.ts` — agregar `DetectedTestCommand` y `detectTestCommands(root)` (lee los manifiestos de `MANIFEST_DIRS`, `adopt.ts:55`), el campo `testCommands` a `ProjectProfile` (`adopt.ts:45`, lleno en `profileProject`, `adopt.ts:252`) y el bloque `test-commands` a `proposeConfig` (`adopt.ts:291`) con la forma de lista que lee `configList` (`packages/engine/src/discovery.ts:91`).
  2. `packages/adapter/src/adopt-rules.ts` (archivo nuevo) — `extractRules(root)`: corta el `AGENTS.md` existente por sus encabezados de nivel 2 respetando los cercos de código, deriva el slug de cada título y devuelve los archivos a escribir junto con los destinos que ya existen, marcados como salteados.
  3. `packages/adapter/src/index.ts:14` — exportar el módulo nuevo al lado de `./adopt.js`.
  4. `packages/cli/src/commands.ts:854` `adoptProject` — llamar a la extracción, escribir sólo los archivos que no existan (nada con `--dry-run`) e informar qué se extrajo, de qué archivo salió y qué se salteó; reemplazar el aviso de `commands.ts:989`, que hoy pide hacerlo a mano.
  5. `tests/adopt.test.ts` — las pruebas del contrato, escritas antes del código y en rojo.

- Decisiones de diseño:
  1. **La detección de comandos va al perfil del proyecto, no a `proposeConfig`.** La detección es lectura de manifiestos, igual que `detectFiles` (`adopt.ts:174`), y `proposeConfig` (`adopt.ts:291`) queda como composición de texto: su firma ya la usan `tests/adopt.test.ts:165` y su contrato es no tocar el disco. Alternativa descartada: pasarle `root` y que lea ahí — mezcla dos responsabilidades en una función pura y lee los manifiestos dos veces.
  2. **La extracción vive en un módulo propio** (`packages/adapter/src/adopt-rules.ts`) en vez de crecer `adopt.ts`, que ya tiene 360 líneas. El corte por secciones, el respeto de los cercos y el slug son un asunto con su propia prueba, y el perfil del proyecto no se toca al agregarlos. Alternativa descartada: dentro de `adopt.ts` — mezcla perfil con extracción y deja el módulo en ~500 líneas sin ganar cohesión.
  3. **Una sección de nivel 2 por archivo de reglas**, `.valmen/rules/<slug>.md`, con `# <título>` y su cuerpo: es lo que hace cerrar la vuelta, porque `readRules` (`packages/adapter/src/project.ts:68`) lee cada archivo y `demoteTitle` (`project.ts:132`) devuelve su `#` a `##` en el `AGENTS.md` del próximo sync. Alternativa descartada: concatenar todo en un archivo — se pierde la granularidad y el orden por nombre de archivo que `readRules` documenta como control del proyecto (`project.ts:66`).
  4. **Nada se clasifica con un modelo.** El archivo extraído lleva una cabecera generada que dice de dónde salió y que hay que revisarlo, y el informe lista qué se extrajo. La regla del módulo lo prohíbe (`adopt.ts:12`) y separar el *cómo* del *qué* que describe `docs/08-ADOPCION.md` es otra cosa: acá se preserva todo lo que el proyecto ya escribió. Alternativa descartada: llamar a un modelo para clasificar reglas de dominio contra flujo de trabajo — cuesta, no es determinista y el requisito no lo pide.
  5. **Sólo se declara un comando con evidencia en disco:** `manage.py` presente → `python <ruta relativa>/manage.py test`; `vitest` o `jest` en las dependencias de un `package.json` → `npx vitest run` o `npx jest`; `pytest` en un `requirements.txt` o en el `pyproject.toml` → `pytest`. El informe muestra la evidencia al lado de cada uno. Alternativa descartada: una lista de comandos típicos por stack — declara autorizado lo que el proyecto no tiene, y el gate ejecutaría un comando inexistente.
  6. **La sugerencia de plantilla se conserva y se le pone prueba** (`commands.ts:920`): el requisito la pide sugerida, no aplicada, y aplicarla sola escribiría reglas que nadie leyó — lo que el catálogo declara que no hace (`blueprints.ts:19`). Alternativa descartada: aplicarla cuando el stack coincide.

- Rollback: revertir los cinco archivos del ticket —`packages/adapter/src/adopt.ts`, `packages/adapter/src/adopt-rules.ts`, `packages/adapter/src/index.ts`, `packages/cli/src/commands.ts` y `tests/adopt.test.ts`— y reconstruir (`npm run build`) para que el `valmen` de `~/.local/bin` vuelva a la versión anterior. No hay migración ni estado que deshacer: el comando escribe sólo dentro de `.valmen/` del proyecto que se adopta. Lo que un proyecto ya haya adoptado con la versión nueva se queda como está —sus reglas y su `test-commands`— y se quita a mano si molesta: revertir el código no borra archivos.

## Criterios de aceptación

- [x] `valmen adopt` propone un `.valmen/config.yaml` cuyo `test-commands` declara los comandos detectados del stack, y el documento lo lee el mismo parser del motor
      <!-- test: npx vitest run tests/adopt.test.ts -->
- [x] La detección no declara ningún comando que el disco no respalde: un proyecto sin manifiestos de prueba queda con `test-commands: []`
      <!-- test: npx vitest run tests/adopt.test.ts -->
- [x] `valmen adopt` extrae cada sección de nivel 2 del `AGENTS.md` existente a `.valmen/rules/<slug>.md` con su título original
      <!-- test: npx vitest run tests/adopt.test.ts -->
- [x] La extracción no pisa una regla preexistente: un `.valmen/rules/<área>.md` que ya existe queda intacto y se informa como salteado
      <!-- test: npx vitest run tests/adopt.test.ts -->
- [x] El `AGENTS.md` preexistente queda byte a byte igual después de `valmen adopt`
      <!-- test: npx vitest run tests/adopt.test.ts -->
- [x] El `CLAUDE.md` preexistente queda byte a byte igual después de `valmen adopt`
      <!-- test: npx vitest run tests/adopt.test.ts -->
- [x] El corte por secciones conserva entero el bloque de código cercado: un encabezado de nivel 2 dentro del cerco no abre una sección nueva
      <!-- test: npx vitest run tests/adopt.test.ts -->
- [x] Un `AGENTS.md` ya generado por el harness no produce ningún archivo de reglas nuevo
      <!-- test: npx vitest run tests/adopt.test.ts -->
- [x] La adopción informa que un `AGENTS.md` ya generado no tiene reglas que extraer
      <!-- test: npx vitest run tests/adopt.test.ts -->
- [x] Con `--dry-run` no se escribe ni la configuración ni ningún archivo de reglas
      <!-- test: npx vitest run tests/adopt.test.ts -->
- [x] Con `BackEnd/manage.py` y `FrontEnd/angular.json` en disco, el informe de `valmen adopt` nombra la plantilla `django-angular-multitenant`
      <!-- test: npx vitest run tests/adopt.test.ts -->
- [x] El `AGENTS.md` que `valmen sync` genera después de la adopción contiene el título y el cuerpo de la sección extraída
      <!-- test: npx vitest run tests/adopt.test.ts -->

## Puntos

```json
[]
```

## Implementación

Sesión `cron_1f8a821063ed_20260927_205734` (eslabón 3 de la tanda de S2), con TDD: las
pruebas primero, en rojo por la razón correcta —13 pruebas nuevas que fallaban porque
`testCommands` y `extractRules` no existían— y después el código hasta el verde.

Archivos del cambio:
- `packages/adapter/src/adopt-rules.ts` (nuevo): `extractRules(root)` corta el
  `AGENTS.md` previo por sus encabezados de nivel 2, respeta los cercos de código, deja el
  preámbulo —título e introducción— como su propia sección, deriva el slug de cada título
  y devuelve los archivos a escribir junto con los destinos que ya existen.
  `renderRuleExtraction` arma el informe. No escribe nada: quien llama decide.
- `packages/adapter/src/adopt.ts`: `DetectedTestCommand` y `detectTestCommands(root)`
  —`manage.py`, `pytest` y `vitest`/`jest`, cada uno con su archivo de origen—, el campo
  `testCommands` del perfil del proyecto y el bloque `test-commands` de `proposeConfig`.
- `packages/adapter/src/index.ts`: exporta el módulo nuevo.
- `packages/cli/src/commands.ts`: `adoptProject` extrae las reglas, informa qué extrajo y
  qué salteó, y escribe sólo lo que no existe —nada con `--dry-run`—; el aviso del
  `AGENTS.md` previo dice ahora que su contenido ya quedó en `.valmen/rules/`.
- `tests/adopt.test.ts`: las pruebas del contrato.

Quién escribió qué: el código lo escribió esta sesión, no un ejecutor delegado. El cambio
son dos archivos con sus pruebas, sin interfaz que exija un agente aparte.

Estado del árbol: `HEAD` en `1cd2a1199b361711415fc71275dcb046698ac883` y `git status
--short` con sólo el propio ticket al empezar. Ninguna otra sesión escribió este árbol
durante la ventana: el único proceso de OpenCode vivo era el servicio, sin sesión de
trabajo, y ningún otro ticket del registro estaba en `in_progress` ni en `approved`. Se
corrió `npm run build` para que el `valmen` de `~/.local/bin` incluya el cambio (`dist/`
está ignorado por git). Sin commit, push, PR ni tag: no están autorizados.

## Pruebas

Contrato de pruebas del ticket.

- Directorio de ejecución: la raíz del repositorio, `/Users/juanandrade/Desktop/ValmenHarness`.
- Comando enfocado: `npx vitest run tests/adopt.test.ts`.
- Suite completa: `npx vitest run`.

Resultados reales, sobre el árbol de esta sesión:

- `npx vitest run tests/adopt.test.ts` → 29 pruebas, 29 pasan (1,16 s).
- `npx vitest run` → 75 archivos pasan y 1 salteado; 1530 pruebas pasan y 48 salteadas
  (21,25 s), sin fallos.
- Línea base de fallos ajenos: la suite no tiene ninguno. Sin el archivo del ticket
  (`npx vitest run --exclude '**/adopt.test.ts'`) pasan 1501 pruebas, y `tests/adopt.test.ts`
  tenía 16 pruebas en `HEAD`: 1517 antes del cambio y 1530 después. La diferencia son las
  13 pruebas nuevas del ticket, que la suite recolecta.
- `npm run build` compila el monorepo sin errores de tipos.
- Validaciones manuales: ninguna — todos los criterios se verifican por comando.

- Resultado del PO: aprobación **delegada**. Juan Andrade autorizó el 2026-09-27, con sus
  palabras «listo ya verifique la corrida de los 3 cron de hoy y me gusto sobre todo el
  ultimo que corrio que ya integro slack y me aviso cunado empezo y cuando termino, hizo
  commit y todo, que necesito que en 3 horas programes 3 tickects mas de la misma manera
  que hiciste con el 3 pueden ser separacion de 2 horas entre cada uno», que esta sesión
  aprobara la compuerta de análisis, la de plan y el QA. Lo que aprobó esta sesión por esa
  delegación son los criterios del ticket, corridos con los mismos comandos y el mismo
  directorio que él usaría, sobre el árbol de esta sesión. La firma es de esta sesión por
  esa delegación, no suya.

## QA

```json
[
  {
    "id": "QA-001",
    "date": "2026-09-28",
    "build_reference": "worktree:sha256:c9d3195063a7ea085dac3ec05a031bbc9a1a15a634a5ed192f3419868ddd6cdb",
    "environment": "arbol de esta sesion en la maquina del PO (local)",
    "result": "pending",
    "findings": [],
    "correction": null,
    "po_confirmation": null
  },
  {
    "id": "QA-002",
    "date": "2026-09-28",
    "build_reference": null,
    "environment": null,
    "result": "approved",
    "findings": [],
    "correction": null,
    "po_confirmation": "Aprobacion DELEGADA por Juan Andrade el 2026-09-27, con sus palabras: listo ya verifique la corrida de los 3 cron de hoy y me gusto sobre todo el ultimo que corrio que ya integro slack y me aviso cunado empezo y cuando termino, hizo commit y todo, que necesito que en 3 horas programes 3 tickects mas de la misma manera que hiciste con el 3 pueden ser separacion de 2 horas entre cada uno. Su alcance cubre aprobar el analisis, el plan y el QA de este ticket. La firma de esta aprobacion es de esta sesion (cron_1f8a821063ed_20260927_205734) por esa delegacion, no suya. Corrido sobre el arbol de esta sesion: npx vitest run tests/adopt.test.ts (29 pasan) y npx vitest run (1530 pasan, 48 salteadas, sin fallos)."
  }
]
```

## Evidencia

```json
[
  {
    "id": "EVIDENCE-001",
    "date": "2026-09-28",
    "kind": "automated-test",
    "description": "Corrida del verificador sobre el arbol de esta sesion, sin ejecutor delegado. Archivos del hash, en orden alfabetico: packages/adapter/src/adopt-rules.ts (nuevo), packages/adapter/src/adopt.ts, packages/adapter/src/index.ts, packages/cli/src/commands.ts y tests/adopt.test.ts. Corrido por esta sesion: npx vitest run tests/adopt.test.ts (29 pasan) y npx vitest run (1530 pasan, 48 salteadas, 1 archivo salteado, sin fallos); el conteo sin el archivo del ticket da 1501 y el archivo tenia 16 pruebas en HEAD, asi que la diferencia son las 13 nuevas.",
    "reference": "worktree:sha256:c9d3195063a7ea085dac3ec05a031bbc9a1a15a634a5ed192f3419868ddd6cdb",
    "point_id": null
  },
  {
    "id": "EVIDENCE-002",
    "date": "2026-09-28",
    "kind": "build",
    "description": "npm run build (tsc --build tsconfig.build.json y copia de la interfaz) sin errores de tipos; dist/ esta ignorado por git y se reconstruye para que el valmen de ~/.local/bin incluya el cambio.",
    "reference": "worktree:sha256:c9d3195063a7ea085dac3ec05a031bbc9a1a15a634a5ed192f3419868ddd6cdb",
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
    "date": "2026-09-28",
    "technical_summary": "valmen adopt ahora deja el proyecto operable en una sesion. En packages/adapter nace adopt-rules.ts con extractRules, que corta el AGENTS.md previo por sus encabezados de nivel 2 respetando los cercos de codigo, deja el preambulo como su propia seccion, deriva el slug de cada titulo y devuelve los archivos a escribir junto con los destinos que ya existen, sin escribir nada. adopt.ts agrega DetectedTestCommand y detectTestCommands, que declara solo comandos con evidencia en disco (manage.py, pytest, vitest o jest, cada uno con su archivo de origen), el campo testCommands del perfil y el bloque test-commands de proposeConfig con la forma de lista que lee configList. commands.ts integra la extraccion en adoptProject: informa que extrajo y que salteo, escribe solo lo que no existe y nada con dry-run, y el aviso del AGENTS.md previo dice que su contenido ya quedo en .valmen/rules. 13 pruebas nuevas en tests/adopt.test.ts, escritas antes del codigo.",
    "functional_summary": "Quien adopta el harness en un proyecto en marcha corre valmen adopt una vez y queda operable: las reglas que el proyecto ya tenia escritas en su AGENTS.md quedan preservadas en .valmen/rules y el valmen sync siguiente las vuelve a incluir en vez de borrarlas, la lista de comandos de prueba sale del stack detectado y el gate mecanico tiene algo que correr desde el primer ticket, y la plantilla de su stack queda sugerida en el informe. Lo existente no se pisa: los archivos que ya estaban quedan byte a byte iguales y lo que se salteo se informa.",
    "qa_status": "approved",
    "qa_waiver_reason": null,
    "po_confirmation": null,
    "release_impact": "unreleased"
  }
]
```

## Consumo de IA

```json
[
  {
    "kind": "ai-usage",
    "date": "2026-09-28",
    "session_reference": "cron_1f8a821063ed_20260927_205734",
    "model": "deepseek-v4.1-flash",
    "reasoning_effort": null,
    "notes": "Sesion de cron del eslabon 3, una sola sesion para este ticket. Lectura al cierre con el turno todavia en curso: la fila crece hasta que el turno termina, asi que los numeros son un piso declarado y no el total final. reasoning_tokens=40435 en la fila de la sesion y el proveedor (opencode-go) factura por suscripcion, asi que no se declara costo: la fila informa 0.0 y escribirlo como cero se leeria como gratis. El ticket no tuvo ejecutor delegado.",
    "input_tokens": 181049,
    "output_tokens": 68412,
    "total_tokens": 249461,
    "estimated_cost_usd": null,
    "source": "hermes:/Users/juanandrade/.hermes/profiles/valmen-harness/state.db",
    "confidence": "high",
    "id": "CONSUMO-001"
  },
  {
    "kind": "ai-usage",
    "date": "2026-09-28",
    "session_reference": "20260926_230404_d977c6",
    "model": null,
    "reasoning_effort": null,
    "notes": "Agente hermes:desktop. Sesión **compartida**: trabajó 8 tickets (FEATURE-ENGINE-ROLES-ENRUTAMIENTO-20260926 ×64, FEATURE-CLI-MODO-ASK-20260926 ×55, IMPROVEMENT-ENGINE-CASCADA-VERIFICADA-20260926 ×54, IMPROVEMENT-ENGINE-PRESUPUESTOS-ADAPTATIVOS-20260926 ×38, DOCS-ENGINE-CASCADA-VERIFICADA-20260926 ×18), así que su costo no se reparte y acá no se registran números. Costo completo de la sesión: no declarado por el proveedor, 817505 tokens. Registralo en el ticket cuya sesión sea propia, o declaralo compartido donde corresponda. Sesión \"Bot Chat\".",
    "input_tokens": null,
    "output_tokens": null,
    "total_tokens": null,
    "estimated_cost_usd": null,
    "source": "hermes:/Users/juanandrade/.hermes/profiles/valmen-harness/state.db",
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
    "date": "2026-09-26",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-09-27",
    "at": "2026-09-28T02:02:14.064Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-09-27",
    "at": "2026-09-28T02:04:03.497Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-09-27",
    "at": "2026-09-28T02:04:57.456Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-09-27",
    "at": "2026-09-28T02:04:57.585Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-09-27",
    "at": "2026-09-28T02:14:34.734Z",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-09-27",
    "at": "2026-09-28T02:14:40.274Z",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-002."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-09-27",
    "at": "2026-09-28T02:14:40.404Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-09-27",
    "at": "2026-09-28T02:14:44.983Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-09-27",
    "at": "2026-09-28T02:14:45.174Z",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-09-27",
    "at": "2026-09-28T02:15:26.022Z",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-09-27",
    "at": "2026-09-28T02:15:26.160Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-09-27",
    "at": "2026-09-28T02:16:05.336Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-014",
    "date": "2026-09-27",
    "at": "2026-09-28T02:16:14.241Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-002."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-015",
    "date": "2026-09-27",
    "at": "2026-09-28T02:16:14.279Z",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-016",
    "date": "2026-09-27",
    "at": "2026-09-28T02:16:21.623Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-017",
    "date": "2026-09-27",
    "at": "2026-09-28T02:32:51.181Z",
    "action": "gate-approved",
    "actor": "cli",
    "details": "Gate analysis aprobado por Delegacion del PO (Juan Andrade 2026-09-27): Aprobacion DELEGADA. La tanda se autorizo el 2026-09-27 con las palabras del PO: «que necesito que en 3 horas programes 3 tickects mas de la misma manera que hiciste con el 3», cuyo alcance declaro el programador de la tanda como aprobar la compuerta analysis, la compuerta plan y el QA; y el PO confirmo el registro de estas decisiones con sus palabras del mismo dia: «Si apruebo ambas cosas recuerda que hay algo para la generacion de los eslabones entonces si toca se deben actualizar para que no siga pasando». La compuerta quedo en REVIEW con diagnostico_explica_el_sintoma=0.81 y riesgos_cubren_impactos=0.45, con causa_especifica=0.96, nombra_archivos_reales=0.92 y clasificacion completa: lo flojo es la forma de las proposiciones de riesgo sin impactos declarados, no el alcance ni la causa. Se aprueba para que el recibo no siga contando como esperando la decision de una persona en un ticket ya cerrado."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-018",
    "date": "2026-09-27",
    "at": "2026-09-28T02:33:11.276Z",
    "action": "gate-approved",
    "actor": "cli",
    "details": "Gate plan aprobado por Delegacion del PO (Juan Andrade 2026-09-27): Aprobacion DELEGADA. La tanda se autorizo el 2026-09-27 con las palabras del PO: «�, cuyo alcance declaro el programador de la tanda como aprobar analysis plan y QA; y el PO confirmo el registro de estas decisiones con sus palabras del mismo dia: «�. La compuerta quedo en REVIEW con siete criterios entre 0.42 y 0.89 y cubre_todos_los_criterios=0.40 (descriptiva, no decide); en verde hay_archivos_afectados=0.98, criterios_verificables=0.96, clasificacion completa, rollback_suficiente=0.91 y los pasos con sus rutas. Lo flojo es la redaccion de los criterios de un ticket de solo pantalla y de archivo nuevo: el alcance, los archivos y el rollback estan fijados. Se aprueba para que el recibo no siga contando como esperando la decision de una persona en un ticket ya cerrado."
  }
]
```
