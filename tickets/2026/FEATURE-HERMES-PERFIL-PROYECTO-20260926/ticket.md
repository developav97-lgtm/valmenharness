---
schema_version: 2
id: FEATURE-HERMES-PERFIL-PROYECTO-20260926
title: Declarar cada proyecto como perfil MCP de Hermes
type: FEATURE
module: HERMES
workflow_status: qa_approved
qa_status: approved
release_status: unreleased
user_visible: true
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

# FEATURE-HERMES-PERFIL-PROYECTO-20260926

## Solicitud original

Parte del sprint: Adoptar el harness y habilitar la operación multiproyecto con registros independientes.
- R-S2-004: Perfil de Hermes por proyecto — Cada proyecto adoptado DEBE poder declararse como un servidor MCP propio en la
Depende de: FEATURE-CLI-ADOPTAR-PROYECTO-20260926.
Viene de una feature descompuesta en sprints; su plan completo está en el tickets.yaml de la feature.

## Descripción funcional

- Alcance: el comando del harness que declara el servidor MCP en Hermes (`valmen hermes connect`) y su diagnóstico (`valmen hermes status`), más la guía de puesta en marcha. El servidor y el motor no cambian.
- Usuario o rol afectado: quien pone en marcha un proyecto nuevo y trabaja desde un perfil de Hermes por proyecto —hoy el propio ValmenHarness y SaiOpenCloud—, y quien mantiene la guía de puesta en marcha.
- Comportamiento actual: `valmen hermes connect` escribe la entrada en el `config.yaml` de **ese** `HERMES_HOME`, que sale del ambiente y no de una bandera (`packages/cli/src/hermes.ts:296` + `packages/adapter/src/mcp.ts:376-384`). Desde una terminal común —fuera de una sesión de Hermes— ese home es `~/.hermes`, así que el camino documentado deja la entrada en la configuración global y el perfil por defecto ve **todos** los proyectos: `env -u HERMES_HOME hermes mcp list` lista `valmen` y `valmen-saicloud`. No hay `--profile`, el nombre por defecto es `valmen` para cualquier proyecto (`packages/cli/src/main.ts:1406-1411`) y la guía no tiene puesta en marcha de perfil: la tabla la declara global (`docs/15-PUESTA-EN-MARCHA.md:182`, `:238`) y el único recurso para un segundo proyecto es cambiarle el nombre (`--name`, `:228`).
- Comportamiento esperado: `valmen hermes connect --profile <perfil>` declara `valmen-<perfil>` con el `cwd` de este proyecto dentro de `~/.hermes/profiles/<perfil>/config.yaml`, sin tocar `~/.hermes/config.yaml`; el comando se niega a inventar un perfil que no exista y nombra `hermes profile create <perfil>`; `valmen hermes status --profile <perfil>` informa ese archivo; sin `--profile` todo sigue igual que hoy; y la puesta en marcha de un perfil nuevo queda en un solo bloque de la guía.

## Diagnóstico

- Archivos y flujo investigados: `packages/cli/src/hermes.ts` — `hermesStatus` (`:205`) y `hermesConnect` (`:296`) resuelven el archivo con `hermesConfigPath()`, y el aviso de «hermes es global» vive en `:260-272`. `packages/adapter/src/mcp.ts` — `hermesHome`/`hermesConfigPath` (`:376-384`) leen `HERMES_HOME` del proceso; el comentario `:348-362` declara el supuesto «una sola config para todos los proyectos de la máquina, un proyecto una entrada»; `hermesBlock`/`mergeHermesConfig` (`:473`, `:518`) son la escritura que hay que reusar. `packages/cli/src/main.ts` — la lista de banderas con valor (`:441-449`, sólo `--name`), la ayuda del bloque `hermes` (`:292-295`), el nombre por defecto `valmen` (`:1406-1411`) y el despacho de la acción (`:1309-1340`). `packages/cli/src/mcp.ts:339-361` — la sección que imprime el bloque de Hermes como «configuración global del usuario». `docs/15-PUESTA-EN-MARCHA.md:176-190` y `:228-247` — la tabla de agentes y el reparto global/proyecto. Del lado de Hermes (no de este repo): `hermes_cli/config.py:436-438` (`get_config_path` = `HERMES_HOME/config.yaml`) y `hermes_cli/profiles.py:1284` con su guarda de identidad en `:1316`.
- Causa raíz o hipótesis: el síntoma —el perfil por defecto lista todos los proyectos y ningún perfil por proyecto queda armado— se explica en cuatro pasos encadenados, y ninguno de ellos es un error de quien lo corre. **Primero**, el comando no elige el destino: lo hereda. `hermesConnect` (`packages/cli/src/hermes.ts:296`) llama a `hermesConfigPath()`, que devuelve `HERMES_HOME/config.yaml` (`packages/adapter/src/mcp.ts:382`), y eso es el ambiente del proceso, no un parámetro. **Segundo**, la puesta en marcha ocurre desde una terminal común, y ahí `HERMES_HOME` no está definido: el destino es `~/.hermes/config.yaml`, el global. **Tercero**, como el único dato que distingue un proyecto de otro es el nombre de la entrada —`valmen` por defecto, fijo en `packages/cli/src/main.ts:1406-1411`, sin relación con el proyecto—, el aislamiento queda a cargo de que alguien escriba `--name` a mano; y si no lo hace, la segunda entrada no se crea y la segunda conexión reescribe la primera. **Cuarto**, la guía confirma ese camino como el único: declara Hermes «global» (`docs/15-PUESTA-EN-MARCHA.md:182`, `:238`) y para un segundo proyecto propone cambiarle el nombre (`:228`), sin nombrar el perfil. La consecuencia se midió: `env -u HERMES_HOME hermes mcp list` lista `valmen` y `valmen-saicloud` —dos proyectos en un solo perfil—, mientras que con `HERMES_HOME` apuntado al perfil lista sólo `valmen-harness`; y `valmen hermes status` en esta sesión informa `/Users/juanandrade/.hermes/profiles/valmen-harness/config.yaml` con la entrada `valmen` sin declarar, porque dentro de una sesión el ambiente acierta por casualidad y fuera de ella no. Los perfiles de Hermes no se mezclan —el `config.yaml` que Hermes lee es el de su `HERMES_HOME` (`hermes_cli/config.py:436-438`)—, así que lo que falta es del harness: elegir el perfil, nombrar la entrada por proyecto y dejar la puesta en marcha escrita en un solo bloque.
- Riesgos y compatibilidad: (1) escribir en el perfil equivocado — mitigación: la ruta se informa en cada corrida y `--dry-run` la muestra antes de escribir; (2) dejar un directorio de perfil sin identidad, que Hermes no lista como perfil (`hermes_cli/profiles.py:1316`) y que daría un archivo que nadie lee con un diagnóstico en verde — mitigación: `connect --profile` no crea nada y nombra `hermes profile create <perfil>`; (3) romper el camino actual (entrada global con `--name`) — mitigación: sin `--profile` el comportamiento y los textos no cambian, y `--name` sigue ganándole al nombre por defecto; (4) tocar el YAML de otro programa — mitigación: se reusa `mergeHermesConfig`, que inserta sin reescribir y conserva comentarios; (5) contradecir la documentación existente — mitigación: la tabla y el bloque impreso por `valmen mcp` se ajustan en el mismo cambio.
- Impactos de sync, migración, Docker o despliegue: ninguno — es CLI, documentación y pruebas: no toca el camino de sincronización, ni esquemas de base, ni contenedores, ni el despliegue.

## Plan

- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan).
- Orden del PO citada: «Dale, los ejecuto YA en orden (cf: 7 del EVOLUCION-HARNESS, commit sí por ticket al llegar a awaiting_user_tests, push con orden aparte del PO)». Esa orden habilita el commit de los archivos de este ticket al llegar a `awaiting_user_tests`; el push, el PR, el tag y el despliegue **no** están autorizados y quedan para una orden aparte.
- Decisiones:
  1. **El destino sale de una bandera, no del ambiente.** `--profile <perfil>` resuelve el archivo del perfil con un constructor nuevo junto a `hermesConfigPath` (`packages/adapter/src/mcp.ts:382`). Alternativa descartada: seguir dependiendo del `HERMES_HOME` exportado — es lo que hoy hace, y es justo lo que hace que desde una terminal el destino sea el global sin que nadie lo note.
  2. **El nombre por defecto de un perfil es `valmen-<perfil>`; `--name` siempre gana.** Alternativa descartada: derivarlo del último segmento de la raíz (`basenameSeguro`, `packages/cli/src/hermes.ts:289`) — el perfil es el ámbito que Hermes muestra y el que la persona escribió en la bandera; derivarlo de la ruta mete una sorpresa cuando el directorio y el perfil no se llaman igual.
  3. **`connect --profile` se niega a inventar el perfil.** Si `~/.hermes/profiles/<perfil>/` no existe, no escribe nada y nombra `hermes profile create <perfil>`. Alternativa descartada: `mkdir -p` y escribir el `config.yaml` — Hermes no lista un directorio sin identidad de perfil (`hermes_cli/profiles.py:1316`), así que quedaría un archivo que nadie lee con un diagnóstico en verde.
  4. **La puesta en marcha es un bloque de la guía, con una prueba que lo ata al código.** Tres líneas en `docs/15-PUESTA-EN-MARCHA.md` (`hermes profile create` → `valmen hermes connect --profile` → comprobación `hermes -p <perfil> mcp list`) y un archivo de pruebas que lee el documento y lo contrasta con la ayuda real del CLI. Alternativa descartada: un comando nuevo `valmen hermes profile` que hiciera los tres pasos — duplicaría `hermes profile create`, que es de Hermes, y haría que el harness escriba la identidad de un perfil ajeno.
  5. **Sin `--profile` nada cambia.** Mismo archivo global, mismo bloque, mismos textos. Alternativa descartada: mover el destino por defecto al perfil — rompería el flujo de quien no usa perfiles y contradiría lo que `valmen mcp` ya imprime.
- Trazabilidad decisión → hallazgo: el hallazgo 1 del diagnóstico —el destino lo decide el ambiente— son las decisiones 1 y 5; el hallazgo 2 —un proyecto, una entrada, todas en el perfil por defecto— es la decisión 2; el hallazgo 3 —la guía no tiene puesta en marcha de perfil— es la decisión 4; el riesgo 2 —directorio de perfil sin identidad— es la decisión 3.
- Pasos ordenados:
  1. `packages/adapter/src/mcp.ts`: constructor del home y del archivo por perfil (`hermesProfileHome`, `hermesProfileConfigPath`) y corrección del comentario `:348-362`, que hoy declara «una sola config para todos los proyectos de la máquina».
  2. `packages/cli/src/hermes.ts`: campo `profile` en `HermesRequest` (`:109`), resolución del archivo por perfil en `hermesStatus` (`:205`) y `hermesConnect` (`:296`), nombre por defecto `valmen-<perfil>` en `entryFor` (`:165`) y el corte por perfil inexistente con el comando exacto.
  3. `packages/cli/src/main.ts`: `--profile` en la lista de banderas con valor (`:441-449`), en la ayuda del bloque `hermes` (`:292-310`) y en el pasaje a `runHermes` (`:1406-1411`), donde hoy el nombre cae en el literal `"valmen"`.
  4. `packages/cli/src/mcp.ts:339-361`: una línea del bloque de Hermes que nombra `--profile`, para que lo que se imprime no contradiga lo que el comando puede hacer.
  5. `tests/hermes-cli.test.ts`: casos nuevos escritos primero — escritura en el archivo del perfil con el global intacto, nombre por defecto, `--name` ganando, perfil inexistente, `status --profile`, y el camino sin `--profile` sin cambios.
  6. `tests/docs-perfil-hermes.test.ts` (nuevo): lee `docs/15-PUESTA-EN-MARCHA.md` y comprueba que el bloque de puesta en marcha nombra los tres comandos, contrastado contra `USAGE` (`packages/cli/src/main.ts:106`), que es la fuente que ya es la verdad.
  7. `docs/15-PUESTA-EN-MARCHA.md`: bloque «Un perfil por proyecto» en §6 y la fila de la tabla de agentes (`:182`), que hoy declara Hermes sólo global.
- Rollback: revertir el commit. El cambio no escribe fuera del repositorio ni migra estado; el único efecto persistente es el que alguien pida a mano con `valmen hermes connect --profile <perfil>`, y se deshace borrando el bloque del `config.yaml` de ese perfil.

## Criterios de aceptación

- [x] `valmen hermes connect --profile <perfil>` declara la entrada `valmen-<perfil>` con el `cwd` de este proyecto en `~/.hermes/profiles/<perfil>/config.yaml` y deja `~/.hermes/config.yaml` sin modificar
      <!-- test: npx vitest run tests/hermes-cli.test.ts -->
- [x] Con `--profile <perfil>` y sin `--name`, la entrada declarada se llama `valmen-<perfil>`, y con `--name <otro>` la entrada declarada se llama `<otro>`
      <!-- test: npx vitest run tests/hermes-cli.test.ts -->
- [x] `valmen hermes connect --profile <perfil>` no escribe nada y nombra `hermes profile create <perfil>` cuando ese perfil no existe, sin crear el directorio
      <!-- test: npx vitest run tests/hermes-cli.test.ts -->
- [x] `valmen hermes status --profile <perfil>` informa el `config.yaml` de ese perfil como archivo y el estado de la entrada `valmen-<perfil>`
      <!-- test: npx vitest run tests/hermes-cli.test.ts -->
- [x] Sin `--profile`, `valmen hermes connect` sigue escribiendo en el `config.yaml` global la entrada `valmen` con el mismo bloque que antes del cambio
      <!-- test: npx vitest run tests/hermes-cli.test.ts -->
- [x] La puesta en marcha de un perfil nuevo queda en un solo bloque de `docs/15-PUESTA-EN-MARCHA.md` que nombra, en orden, `hermes profile create <proyecto>`, `valmen hermes connect --profile <proyecto>` y la comprobación `hermes -p <proyecto> mcp list`
      <!-- test: npx vitest run tests/docs-perfil-hermes.test.ts -->
- [x] La ayuda del CLI declara la bandera `--profile` en el bloque `hermes` con el archivo al que apunta y el nombre por defecto `valmen-<perfil>`
      <!-- test: npx vitest run tests/docs-perfil-hermes.test.ts -->

## Puntos

```json
[]
```

## Implementación

Implementado por OpenCode (`opencode run --standalone --auto`, modelo `opencode-go/deepseek-v4.1-flash`, sesión `ses_f117341b1ffeRtJkn8EFoyvvaR`) sobre el alcance de los siete pasos del plan. El verificador corrió las pruebas y aplicó **formateo con prettier** en tres archivos (`packages/cli/src/hermes.ts`, `packages/adapter/src/mcp.ts`, `tests/docs-perfil-hermes.test.ts`): eran los tres que estaban limpios en `HEAD` y el cambio los dejaba fuera de estilo. Los otros dos archivos tocados (`packages/cli/src/main.ts`, `packages/cli/src/mcp.ts`) ya fallaban `prettier --check` en `HEAD`, así que no se reformatearon para no meter ruido ajeno al ticket.

- `packages/adapter/src/mcp.ts` — `hermesRoot()`, `hermesProfilesRoot()`, `hermesProfileHome()` y `hermesProfileConfigPath()` nuevos, junto a `hermesConfigPath`. **La raíz de Hermes no es siempre `HERMES_HOME`**: dentro de una sesión de Hermes ese valor ya es un perfil, y derivar de ahí daría `~/.hermes/profiles/<perfil>/profiles/<otro>/config.yaml` —un archivo que nadie lee—. La resolución ancla los perfiles a la raíz por defecto y no al `HERMES_HOME` activo, con la misma regla que Hermes (`hermes_cli/profiles.py:220-231` con `hermes_constants.py:216-233`): si `HERMES_HOME` está vacío o cae dentro de `~/.hermes`, la raíz es `~/.hermes`; si está fuera, es el abuelo cuando el padre se llama `profiles` y si no el propio `HERMES_HOME`. Es la precisión que la decisión 1 del plan pedía («el destino sale de una bandera, no del ambiente») y sin ella el comando escribiría en el lugar equivocado desde la superficie donde el harness trabaja de verdad.
- `packages/cli/src/hermes.ts` — campo `profile` en `HermesRequest` y nombre efectivo en `entryName()`: `--name` gana siempre, con `--profile` el default es `valmen-<perfil>` y sin perfil queda el histórico `valmen`. `hermesStatus` y `hermesConnect` resuelven el archivo por perfil. `hermesConnect` corta **antes de escribir nada** —también con `--dry-run`, porque un dry-run que muestra un bloque imposible no sirve— si el perfil no existe, nombrando `hermes profile create <perfil>`. Sin `--profile` los textos y el comportamiento quedan como estaban (decisión 5).
- `packages/cli/src/main.ts` — `--profile` en `VALUE_OPTIONS`, en la ayuda del bloque `hermes` y en el pasaje a `runHermes`, donde el literal `"valmen"` deja de fijar el nombre. `HermesRequest.name` pasó a opcional para que el default viva en un solo sitio; el nombre efectivo sin perfil sigue siendo `valmen`.
- `packages/cli/src/mcp.ts` — una línea del bloque de Hermes que nombra `valmen hermes connect --profile <perfil>`, para que lo que el comando imprime no contradiga lo que el comando puede hacer.
- `tests/hermes-cli.test.ts` — siete casos nuevos: escritura en el archivo del perfil con el global **byte a byte igual**, nombre por defecto `valmen-<perfil>`, `--name` ganando, perfil inexistente (no escribe y no crea el directorio), el mismo corte con `--dry-run`, `status --profile` y el camino sin `--profile` con el bloque de siempre.
- `tests/hermes-config.test.ts` — cuatro casos de la resolución de la raíz: sin `HERMES_HOME` (cuelga de `~/.hermes`), dentro de una sesión (`HERMES_HOME` ya es un perfil), fuera del home nativo con `profiles` en el padre, y una instalación en otro sitio sin `profiles`.
- `tests/docs-perfil-hermes.test.ts` (nuevo) — lee `docs/15-PUESTA-EN-MARCHA.md` y comprueba que el bloque de puesta en marcha nombra los tres comandos **en orden**, y que la ayuda del CLI declara `--profile` con el archivo al que apunta y el nombre por defecto. La ayuda se contrasta contra `USAGE` de `packages/cli/src/main.ts`, que es la fuente que ya es la verdad.
- `docs/15-PUESTA-EN-MARCHA.md` — bloque «Un perfil por proyecto» en §6 con los tres pasos, la fila de la tabla de agentes que declaraba Hermes sólo global y el ejemplo de §6, que proponía `--name` como único recurso para un segundo proyecto.

**Corrección de las rondas de revisión 1 y 2 (2026-09-29).** La ronda 2 midió los tres árboles y la premisa de la ronda 1 era **falsa**: `EVIDENCE-001` describe exactamente el árbol que commiteó este ticket —los blobs de `c352c34` sobre los ocho archivos en orden alfabético dan `worktree:sha256:94cfbe88…`, el valor que declara—, porque el formateo con prettier del verificador quedó **dentro** de `c352c34` y no después: el `git show c352c34:<ruta>` de los ocho archivos ya lo incluye, y el `19:16:43Z` de la anotación es anterior al `19:19:18Z` del commit sin que el contenido difiera entre los dos. `EVIDENCE-002` declara `worktree:sha256:514432e4…`, que es el árbol de trabajo y de `HEAD`, y **no** el del commit del ticket: la diferencia es un solo archivo, `packages/cli/src/main.ts` —68897 bytes en `c352c34` (blob `d65ccc0`) contra 70537 en `HEAD` (blob `406b2b4`)—, tocado después por el commit `1f706be` («manuales pendientes», otro ticket); los otros siete son idénticos entre los dos árboles. Lo que `EVIDENCE-002` afirmaba de más —que su árbol era el commiteado y que el disco y los blobs de `HEAD` de `c352c34` coincidían byte a byte en los ocho— es falso en `main.ts`, y `EVIDENCE-003` lo corrige dejando las dos mediciones. Ni `EVIDENCE-001` ni `EVIDENCE-002` se editan: el bloque es append-only. El entregable del ticket no se tocó después de `c352c34`.

## Pruebas

Verificadas por el verificador sobre el árbol del ticket (los comandos y sus resultados, no el auto-reporte del ejecutor):

- `npx vitest run tests/hermes-cli.test.ts tests/docs-perfil-hermes.test.ts` → `Test Files 2 passed (2)`, `Tests 39 passed (39)`.
- `npx vitest run tests/hermes-cli.test.ts tests/docs-perfil-hermes.test.ts tests/hermes-config.test.ts` → `Test Files 3 passed (3)`, `Tests 82 passed (82)` (tras el formateo del verificador).
- `npx vitest run` (la batería del harness) → `Test Files 78 passed | 1 skipped (79)`, `Tests 1559 passed | 48 skipped (1607)`, sin fallos.
- `npx tsc --noEmit -p tsconfig.json` → exit 0. `npx eslint` sobre los siete archivos tocados → exit 0. `npx prettier --check` sobre los archivos que estaban limpios en `HEAD` → «All matched files use Prettier code style!».
- Sonda desechable (`tests/_sonda-perfil-cli.test.ts`, creada y borrada: el árbol no guarda rastro) para el tramo que las suites del ticket no cubren —que la bandera llegue de punta a punta por `run(argv)`—: `valmen hermes connect --profile demo --root <proyecto>` con `HERMES_HOME` en un temporal devolvió exit 0, escribió `valmen-demo` con el `cwd` del proyecto en `<temporal>/profiles/demo/config.yaml`, **no creó** el `config.yaml` global, y un perfil inexistente salió con exit 2 sin crear el directorio.
- Línea base de los fallos ajenos: no aplica — el árbol no tenía archivos de este ticket, y la batería completa quedó sin fallos después del cambio.
- Correcciones de las rondas de revisión 1 y 2 (2026-09-29), sobre el árbol final —con `EVIDENCE-002`, `EVIDENCE-003` y esta nota ya escritos—: `npx vitest run` → `Test Files 82 passed | 1 skipped (83)`, `Tests 1594 passed | 48 skipped (1642)`, exit 0; los tres archivos del ticket → `Test Files 3 passed (3)`, `Tests 82 passed (82)`. De los ocho archivos del hash, siete quedaron idénticos a `c352c34`; `packages/cli/src/main.ts` sí cambió después, por el commit `1f706be` de otro ticket (68897 → 70537 bytes), y eso es lo que hace que el hash del disco y de `HEAD` sea `worktree:sha256:514432e4…` y no el del árbol del ticket (`worktree:sha256:94cfbe88…`, el que declara `EVIDENCE-001`). La diferencia con los números de la primera entrega (78 archivos, 1559 pruebas) es de árbol, no de suite: después de `16bf50d` entraron commits de otros tickets con sus archivos de prueba.

Lo que **falta** de la prueba de punta a punta real: conectar un proyecto a un perfil de Hermes de la máquina y verlo en `hermes -p <perfil> mcp list`. Eso escribe en el `config.yaml` de un perfil real y necesita la orden de la persona; la sonda lo deja medido hasta el borde del archivo.

- Resultado del PO: yo apruebo porque veo que es correr en el terminal — la suite completa corrió en el terminal con 1632 pruebas en verde y 0 fallos, y con eso el PO aprobó; autorizó cerrar y al final commit y push de todo.

## QA

```json
[
  {
    "id": "QA-001",
    "date": "2026-09-30",
    "build_reference": "worktree:sha256:94cfbe8878a118f4721aaac371a23c4132f3e503b0c1fa2ac32aa38f7ee92d86",
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
    "description": "Árbol del ticket verificado por el orquestador (no por el auto-reporte del ejecutor): npx vitest run tests/hermes-cli.test.ts tests/docs-perfil-hermes.test.ts = 39 pasadas; los tres archivos de prueba con tests/hermes-config.test.ts = 82 pasadas; la batería npx vitest run = 78 archivos pasados y 1559 pruebas pasadas, 0 fallos; tsc --noEmit exit 0; eslint de los siete archivos exit 0. El hash cubre los ocho archivos del cambio en orden alfabético: docs/15-PUESTA-EN-MARCHA.md, packages/adapter/src/mcp.ts, packages/cli/src/hermes.ts, packages/cli/src/main.ts, packages/cli/src/mcp.ts, tests/docs-perfil-hermes.test.ts, tests/hermes-cli.test.ts, tests/hermes-config.test.ts. Escrito por OpenCode (sesión ses_f117341b1ffeRtJkn8EFoyvvaR); el formateo con prettier de packages/cli/src/hermes.ts, packages/adapter/src/mcp.ts y tests/docs-perfil-hermes.test.ts lo aplicó el verificador, no el ejecutor. Sin puntos en el ticket, la referencia se computó sobre los archivos del cambio con el encuadre del contrato.",
    "reference": "worktree:sha256:94cfbe8878a118f4721aaac371a23c4132f3e503b0c1fa2ac32aa38f7ee92d86",
    "point_id": null
  },
  {
    "id": "EVIDENCE-002",
    "date": "2026-09-29",
    "kind": "verification",
    "description": "Ronda de revision 2026-09-29: la referencia de EVIDENCE-001 no verificaba sobre el arbol commiteado. EVIDENCE-001 se anoto a las 19:16:43Z y el commit c352c34 es de las 19:19:18Z, y entre medio el verificador aplico formateo con prettier sobre packages/cli/src/hermes.ts, packages/adapter/src/mcp.ts y tests/docs-perfil-hermes.test.ts, tres de los ocho archivos del hash: la referencia describia un arbol que ya no existe. Esta referencia describe el arbol commiteado, recomputada por el verificador sobre los mismos ocho archivos y el mismo orden (docs/15-PUESTA-EN-MARCHA.md, packages/adapter/src/mcp.ts, packages/cli/src/hermes.ts, packages/cli/src/main.ts, packages/cli/src/mcp.ts, tests/docs-perfil-hermes.test.ts, tests/hermes-cli.test.ts, tests/hermes-config.test.ts), y confirmada doble: leyendo el disco y leyendo los blobs de HEAD del commit c352c34, que coinciden byte a byte en los ocho. EVIDENCE-001 no se edita: el bloque es append-only.",
    "reference": "worktree:sha256:514432e43f6fd7c4efe3eabc28b703e3ab9e60b1c62c990e33ee370416eb75ce",
    "point_id": null
  },
  {
    "id": "EVIDENCE-003",
    "date": "2026-09-29",
    "kind": "verification",
    "description": "Ronda de revision 2 (2026-09-29): la premisa de EVIDENCE-002 era falsa. Medido con dos implementaciones independientes —el script worktree-hash.py de la skill y un script propio que lee los blobs por git show— sobre los ocho archivos en orden alfabetico: los blobs de c352c34 dan worktree:sha256:94cfbe8878a118f4721aaac371a23c4132f3e503b0c1fa2ac32aa38f7ee92d86, el mismo valor de EVIDENCE-001, que por eso SI describia el arbol commiteado por el ticket; los blobs de HEAD (6769847) y el disco dan worktree:sha256:514432e43f6fd7c4efe3eabc28b703e3ab9e60b1c62c990e33ee370416eb75ce, el valor que declara EVIDENCE-002. La diferencia es un solo archivo, packages/cli/src/main.ts: 68897 bytes en c352c34 (blob d65ccc057ae7ae6a59ea4718bfe20734dfcdeec7) contra 70537 en HEAD (blob 406b2b48358a25de9cade1aea8ca527ed9583f19), por el commit 1f706be de otro ticket; los otros siete archivos son identicos entre los dos arboles (git diff --stat c352c34 HEAD sin salida). Esta evidencia corrige lo que EVIDENCE-002 afirmaba de mas: que su referencia describia el arbol commiteado y que el disco y los blobs de HEAD de c352c34 coincidian byte a byte en los ocho, cosa falsa en main.ts. Su referencia es el arbol del commit del ticket (c352c34), que es el entregable; EVIDENCE-001 y EVIDENCE-002 no se editan: el bloque es append-only.",
    "reference": "worktree:sha256:94cfbe8878a118f4721aaac371a23c4132f3e503b0c1fa2ac32aa38f7ee92d86",
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
[]
```

## Consumo de IA

```json
[
  {
    "kind": "ai-usage",
    "date": "2026-09-29",
    "session_reference": "ses_f11772e9affewl50WLdvuOSoTA",
    "model": "opencode-go/deepseek-v4.1-flash",
    "reasoning_effort": null,
    "notes": "Primera corrida de OpenCode del ticket, cortada por un permiso de lectura rechazado; trabajo el ticket aunque no llegara a escribir codigo",
    "input_tokens": 26777,
    "output_tokens": 275,
    "total_tokens": 27296,
    "estimated_cost_usd": 0.00443893,
    "source": "opencode:/Users/juanandrade/.local/share/opencode/opencode.db",
    "confidence": "high",
    "id": "CONSUMO-001"
  },
  {
    "kind": "ai-usage",
    "date": "2026-09-29",
    "session_reference": "ses_f117341b1ffeRtJkn8EFoyvvaR",
    "model": "opencode-go/deepseek-v4.1-flash",
    "reasoning_effort": null,
    "notes": "Implementacion del ticket por OpenCode; reintento 1",
    "input_tokens": 127961,
    "output_tokens": 16108,
    "total_tokens": 169025,
    "estimated_cost_usd": 0.05837809,
    "source": "opencode:/Users/juanandrade/.local/share/opencode/opencode.db",
    "confidence": "high",
    "id": "CONSUMO-002"
  },
  {
    "kind": "ai-usage",
    "date": "2026-09-29",
    "session_reference": "20260929_133248_6366c2",
    "model": "deepseek-v4.1-flash",
    "reasoning_effort": null,
    "notes": "Sesion compartida de Hermes, no repartida a ojo: la base la marca compartida porque ademas de este ticket toco FEATURE-CLI-ADOPTAR-PROYECTO-20260926, que es su dependencia y hubo que leer. Peso 98 en este ticket y 9 en el otro. Su gasto completo queda en /Users/juanandrade/.hermes/profiles/valmen-harness/state.db, tabla sessions, id 20260929_133248_6366c2: 158281 de entrada, 33502 de salida y 20503 de razonamiento, sin costo calculado por la base. Hizo el diagnostico, el plan y la compuerta analysis de este ticket",
    "input_tokens": null,
    "output_tokens": null,
    "total_tokens": null,
    "estimated_cost_usd": null,
    "source": "manual:hermes",
    "confidence": "high",
    "id": "CONSUMO-003"
  },
  {
    "kind": "ai-usage",
    "date": "2026-09-29",
    "session_reference": "20260929_135244_b71dbf",
    "model": "deepseek-v4.1-flash",
    "reasoning_effort": null,
    "notes": "Sesion kanban de la jornada, segunda corrida: registro de la decision del PO, implementacion con OpenCode, verificacion de las pruebas, formateo con prettier y compuerta qa-mechanical; la base no calcula el costo y la lectura es con el turno todavia en curso",
    "input_tokens": 180250,
    "output_tokens": 35806,
    "total_tokens": 236056,
    "estimated_cost_usd": null,
    "source": "hermes:/Users/juanandrade/.hermes/profiles/valmen-harness/state.db",
    "confidence": "high",
    "id": "CONSUMO-004"
  },
  {
    "kind": "ai-usage",
    "date": "2026-09-29",
    "session_reference": "20260929_163103_7da832",
    "model": "deepseek-v4.1-flash",
    "reasoning_effort": null,
    "notes": "Sesion kanban de la ronda de revision 1 del ticket: EVIDENCE-002 con el hash del arbol commiteado, la nota de la correccion en Implementacion y Pruebas, la bateria npx vitest run sobre el arbol final y el commit 764d406; la base no calcula el costo y la lectura es con el turno todavia en curso",
    "input_tokens": 73245,
    "output_tokens": 11825,
    "total_tokens": 92967,
    "estimated_cost_usd": null,
    "source": "hermes:/Users/juanandrade/.hermes/profiles/valmen-harness/state.db",
    "confidence": "high",
    "id": "CONSUMO-005"
  },
  {
    "kind": "ai-usage",
    "date": "2026-09-29",
    "session_reference": "20260929_162502_3dd22b",
    "model": "deepseek-v4.1-flash",
    "reasoning_effort": null,
    "notes": "Sesion kanban de la ronda de revision 1 del ticket: verifique el diff commiteado, la sonda de punta a punta por run argv, los siete criterios y las citas a Hermes en su codigo, y pedi el cambio de la evidencia. La base no calcula el costo",
    "input_tokens": 236572,
    "output_tokens": 23351,
    "total_tokens": 274116,
    "estimated_cost_usd": null,
    "source": "hermes:/Users/juanandrade/.hermes/profiles/valmen-harness/state.db",
    "confidence": "high",
    "id": "CONSUMO-006"
  },
  {
    "kind": "ai-usage",
    "date": "2026-09-29",
    "session_reference": "20260929_164204_c54188",
    "model": "deepseek-v4.1-flash",
    "reasoning_effort": null,
    "notes": "Sesion kanban de la ronda de revision 2 del ticket: medi los tres arboles sobre los ocho archivos con dos implementaciones independientes y encontre que la premisa de la ronda 1 era falsa; pedi EVIDENCE-003 y la correccion de la prosa. La base no calcula el costo",
    "input_tokens": 95007,
    "output_tokens": 20136,
    "total_tokens": 130215,
    "estimated_cost_usd": null,
    "source": "hermes:/Users/juanandrade/.hermes/profiles/valmen-harness/state.db",
    "confidence": "high",
    "id": "CONSUMO-007"
  },
  {
    "kind": "ai-usage",
    "date": "2026-09-29",
    "session_reference": "20260929_164604_87fd4b",
    "model": "deepseek-v4.1-flash",
    "reasoning_effort": null,
    "notes": "Sesion kanban de la jornada que aplico la correccion de la ronda 2: EVIDENCE-003 con las dos mediciones, la correccion de la nota de Implementacion y de la linea de Pruebas, y la bateria npx vitest run sobre el arbol final; la base no calcula el costo y la lectura es con el turno todavia en curso",
    "input_tokens": 57374,
    "output_tokens": 15494,
    "total_tokens": 83122,
    "estimated_cost_usd": null,
    "source": "hermes:/Users/juanandrade/.hermes/profiles/valmen-harness/state.db",
    "confidence": "high",
    "id": "CONSUMO-008"
  },
  {
    "kind": "ai-usage",
    "date": "2026-09-29",
    "session_reference": "20260929_172211_64e54e",
    "model": "deepseek-v4.1-flash",
    "reasoning_effort": null,
    "notes": "Sesion kanban de la revision ronda 3 del ticket: lente de contrato, ejerci el entregable de punta a punta con un HOME aislado, re-corri npx vitest run y reproduje las tres mediciones de los arboles de la evidencia; la revision aprobo. La base no calcula el costo y la lectura es con el turno todavia en curso",
    "input_tokens": 142443,
    "output_tokens": 23963,
    "total_tokens": 185096,
    "estimated_cost_usd": null,
    "source": "hermes:/Users/juanandrade/.hermes/profiles/valmen-harness/state.db",
    "confidence": "high",
    "id": "CONSUMO-009"
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
    "at": "2026-09-29T18:39:39.376Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-09-29",
    "at": "2026-09-29T18:40:25.270Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-09-29",
    "at": "2026-09-29T18:53:28.535Z",
    "action": "gate-approved",
    "actor": "cli",
    "details": "Gate analysis aprobado por Juan Andrade (PO) 2026-09-29: Aprobación del PO 2026-09-29: apruebo el análisis de FEATURE-HERMES-PERFIL-PROYECTO; continúa con su plan y pasa a implementación."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-09-29",
    "at": "2026-09-29T18:53:41.789Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-09-29",
    "at": "2026-09-29T18:53:46.305Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-09-29",
    "at": "2026-09-29T19:16:43.836Z",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-09-29",
    "at": "2026-09-29T19:17:03.068Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-09-29",
    "at": "2026-09-29T19:17:59.913Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-09-29",
    "at": "2026-09-29T19:18:00.204Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-002."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-09-29",
    "at": "2026-09-29T19:18:00.415Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-003."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-09-29",
    "at": "2026-09-29T19:18:00.612Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-004."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-09-29",
    "at": "2026-09-29T21:32:42.952Z",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-002."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-014",
    "date": "2026-09-29",
    "at": "2026-09-29T21:34:56.173Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-005."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-015",
    "date": "2026-09-29",
    "at": "2026-09-29T21:47:24.484Z",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-003."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-016",
    "date": "2026-09-29",
    "at": "2026-09-29T21:49:17.738Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-006."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-017",
    "date": "2026-09-29",
    "at": "2026-09-29T21:49:18.069Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-007."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-018",
    "date": "2026-09-29",
    "at": "2026-09-29T21:49:18.346Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-008."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-019",
    "date": "2026-09-29",
    "at": "2026-09-29T22:28:49.337Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-009."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-020",
    "date": "2026-09-29",
    "at": "2026-09-30T01:33:50.339Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-021",
    "date": "2026-09-29",
    "at": "2026-09-30T01:33:50.643Z",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-022",
    "date": "2026-09-29",
    "at": "2026-09-30T01:33:50.870Z",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-023",
    "date": "2026-09-29",
    "at": "2026-09-30T01:33:51.101Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  }
]
```
