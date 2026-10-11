---
schema_version: 2
id: BUGFIX-ENGINE-DIFF-RUTAS-RENOMBRE-20261010
title: Las rutas de un diff pierden el origen de un renombre, los borrados y las rutas no ASCII
type: BUGFIX
module: ENGINE
workflow_status: closed
qa_status: approved
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

# BUGFIX-ENGINE-DIFF-RUTAS-RENOMBRE-20261010

## Solicitud original

Para saber qué archivos toca un diff, el motor usa `git diff --name-only` y no maneja tres casos: (1) un renombre, del que solo aparece la ruta nueva y se pierde la vieja (packages/engine/src/qa-eligibility.ts:45 y packages/engine/src/qa-agent.ts:101); (2) las rutas con caracteres no ASCII, que git escribe entre comillas y con escapes octales; (3) los borrados, que packages/engine/src/diff.ts:97 omite. Efecto posible: un archivo movido desde una ruta que la QA por agente prohíbe (CI, migraciones, .valmen/) podría no frenar su elegibilidad, y una ruta no ASCII no coincidiría con ninguna categoría. Lo halló el análisis de FEATURE-ENGINE-RIESGO-REVISION-20261010 el 2026-10-10 y el PO pidió registrarlo («Registrar un BUGFIX ahora»). Se reproduce primero con un renombre real, un borrado y una ruta no ASCII en un repositorio git temporal, antes de arreglarlo.

### Supuestos y decisiones pendientes

<!-- Si el pedido nombra algo que el código no tiene —parámetro, permiso,
campo, bandera, columna, migración— y no lo especifica, listá cada elemento
con su pregunta antes de avanzar a análisis; el análisis no planifica sobre
la adivinanza. Si no hay ninguno, escribí «Ninguno» y seguí. -->
Ninguno.

## Descripción funcional

- Alcance: cómo el motor obtiene las rutas que toca un diff cuando con ellas decide algo de seguridad —la elegibilidad de la QA por agente, el cierre por política, los archivos que una integración no admite y el escaneo de secretos del cambio pendiente—. Se cambia la lectura de rutas, no las categorías ni las reglas (`packages/engine/src/path-categories.ts` queda igual).
- Usuario o rol afectado: el PO y quien confía en que la QA por agente (`valmen qa-agent`, `valmen qa-eligibility`, el cierre por política) y la integración de worktrees frenan un cambio sobre CI, migraciones, `.valmen/`, autenticación o despliegue; también quien confía en `valmen secrets` antes de commitear.
- Comportamiento actual: un renombre informa solo la ruta nueva (la prohibida desaparece); una ruta no ASCII llega entre comillas con escapes octales y no casa con ninguna categoría; en el escaneo de secretos, un archivo borrado no cuenta como tocado, y un archivo con nombre no ASCII no se escanea (o su hallazgo se atribuye al archivo anterior).
- Comportamiento esperado: cada consumidor recibe, de una sola función, cada cambio con su estado y su ruta tal cual (sin comillas ni escapes); un renombre trae su origen además del destino; un borrado cuenta como ruta tocada. Con eso, mover un archivo fuera de una ruta prohibida frena la elegibilidad, una ruta no ASCII bajo `migrations/` o `.valmen/` se clasifica, y un secreto en un archivo no ASCII se detecta con su ruta real.

## Diagnóstico

- Memoria: `buscar_memoria` («git diff name-only renombre rutas no ASCII borrados elegibilidad QA por agente») no devolvió nada aplicable (AP-012 y AP-007 son de compuertas). Antecedente en el código: `packages/engine/src/review-risk.ts:53-60` ya documenta el mismo defecto de `--name-only` y lo evita con `--name-status --no-renames -z`.
- Reproducción con datos reales (repositorio git temporal en el scratchpad de la sesión, motor compilado de este worktree, `node` contra `packages/engine/dist/qa-eligibility.js`, `diff.js` y `secrets.js`). Commit base con «migrations/0001_init.sql», «.github/workflows/ci.yml», «src/borrar.ts»; commit siguiente con Â«git mv migrations/0001_init.sql src/inofensivo.tsÂ» (más una línea `drop table x;`), Â«git rm src/borrar.tsÂ» y un alta «.github/wörkflows/ci.yml»:
  - `git diff --name-only BASE..HEAD` → `".github/w\303\266rkflows/ci.yml"`, «src/borrar.ts», «src/inofensivo.ts»: el origen «migrations/0001_init.sql» no aparece.
  - `git diff --name-status -M -z BASE..HEAD` → `A|.github/wörkflows/ci.yml|D|src/borrar.ts|R053|migrations/0001_init.sql|src/inofensivo.ts|`: el origen sí está.
  - `archivosDelDiff(repo, BASE)` → las mismas tres rutas, la no ASCII entrecomillada; `rutaProhibidaParaQaAgente` da `null` en las tres, mientras Â«rutaProhibidaParaQaAgente("migrations/0001_init.sql")Â» da `migraciones`. **Defecto (1) comprobado: el renombre desde una migración no frena la elegibilidad.**
  - Segundo commit con altas «migrations/0002_índice.sql» y «.valmen/configuración.yaml»: `archivosDelDiff` → `"\".valmen/configuraci\\303\\263n.yaml\""`, `"\"migrations/0002_\\303\\255ndice.sql\""`; `rutaProhibidaParaQaAgente` → `null` en ambas. **Defecto (2) comprobado: una ruta no ASCII bajo una categoría prohibida no se clasifica** (la comilla inicial rompe `^\.valmen\/` y la final rompe `\.sql$`).
  - Índice con Â«git rm src/keep.tsÂ» más el alta «src/clavé.ts»: `pendingChanges(repo, true).files` → `[]`; el parche muestra `+++ /dev/null` para el borrado y `+++ "b/src/clav\303\251.ts"` para el alta. **Defecto (3) comprobado: el borrado se omite** y, además, el alta no ASCII tampoco entra.
  - Mismo índice con una clave de acceso AWS de prueba en «src/clavé.ts» sola: `scanPendingChanges(repo, true).findings.length` → `0`. Con la misma clave también en «src/clave.ts»: 2 hallazgos, ambos atribuidos a «src/clave.ts». **Consecuencia comprobada: un secreto en un archivo de nombre no ASCII no se detecta, o se atribuye a otro archivo.**
- Causa comprobada (con `ruta:línea`):
  - `packages/engine/src/qa-eligibility.ts:44` corre `git diff --name-only <base>..HEAD` y `qa-eligibility.ts:47-51` parte por líneas sin desentrecomillar; `--name-only` informa de un renombre solo el destino.
  - `packages/engine/src/qa-agent.ts:111` repite la misma lectura (`lineasDelDiff`), y `qa-agent.ts:118` pasa esas rutas a `elegibilidadQa` (`qa-agent.ts:148`); `qa-agent.ts:265` busca las pruebas nuevas con `--diff-filter=A` sobre la misma salida entrecomillada.
  - `packages/engine/src/qa-policy-close.ts:91-94` repite la lectura para revalidar la elegibilidad antes de cerrar por política.
  - `packages/engine/src/worktree-integrar.ts:107-111` usa `--name-only -z`: las rutas llegan sin comillas, pero el renombre sigue perdiendo su origen antes de `motivoDeArchivoProhibido` (`packages/engine/src/integration-rules.ts:48-56`).
  - `packages/engine/src/diff.ts:99` solo reconoce `+++ b/`: `+++ /dev/null` (borrado) y `+++ "b/…"` (no ASCII) no fijan la ruta, así que el borrado no entra en `files` y las líneas del archivo no ASCII quedan bajo la ruta anterior o sin ruta; `diff.ts:60` (`pendingFiles`) y `diff.ts:63`/`diff.ts:131` (`ls-files --others` sin `-z`) entrecomillan las rutas no ASCII, y `diff.ts:136-139` no puede leer un archivo nuevo entrecomillado.
  - Las listas cerradas de git que tendrán que admitir la nueva forma: `packages/engine/src/qa-agent-git.ts:36-39` (solo `--name-only [--diff-filter=A] <rango>`) y `packages/engine/src/worktree-integracion-git.ts:43-49` (solo `--name-only -z <rango>`). `packages/engine/src/integration-rules.ts:91-101` admite `diff` sin restricción de banderas.
- Consumidores afectados (deciden sobre rutas tocadas):
  - `archivosDelDiff` (`qa-eligibility.ts:37`), llamado desde `packages/cli/src/commands.ts:3683` (`valmen qa-eligibility`): se arregla.
  - `correrQaAgent` (`qa-agent.ts:110-118`, `qa-agent.ts:265`): se arregla.
  - `cerrarQaPorPolitica` (`qa-policy-close.ts:33`, lectura en `qa-policy-close.ts:91`): se arregla.
  - `integrarWorktree` (`worktree-integrar.ts:107`): se arregla.
  - `pendingFiles`/`pendingChanges` (`diff.ts:58-69`, `diff.ts:78-150`), consumidos por `scanPendingChanges` (`packages/engine/src/secrets.ts:251`) —que usan la elegibilidad (`qa-eligibility.ts:222`) y la integración (`packages/engine/src/integration-commit.ts:306`)—, por `packages/engine/src/presentation.ts:311` y por `packages/engine/src/ux-review.ts:61`: se arregla.
  - Ya correctos, sin cambio: `cambiosDelDiff` (`review-risk.ts:61-82`) y `cambiosContraBase` (`diff.ts:298`, usado por `packages/engine/src/code-review.ts:287`) usan `--name-status --no-renames -z`; el segundo necesita `--no-renames` para casar cada ruta con su sección del parche (`diff.ts:325-330`).
  - Fuera de este ticket, con motivo: `estadoDelArbolDeTrabajo` (`integration-commit.ts:71-80`) y `rutasConCambios` (`worktree-integrar.ts:45-52`, usado en `worktree-integrar.ts:127`) leen `git status --porcelain` sin `-z`: se quedan con el destino de un renombre y dejan los escapes octales al quitar las comillas. Es el mismo defecto con otro comando (`status`, árbol de trabajo e índice, no un rango), y entra en otro ticket para no pasar del tamaño acordado. `modifiedFunctionalFiles` (`packages/engine/src/references.ts:128`) usa `--name-only --diff-filter=ACMR` para el hash de archivos validados en QA: no decide sobre rutas prohibidas; una ruta no ASCII ahí falla de forma visible, no silenciosa. `packages/cli/src/delegation.ts:77` y `packages/engine/src/arbol-probado.ts:105-188` no deciden sobre categorías (el segundo ya usa `-z`).
- Archivos y flujo investigados: `packages/engine/src/path-categories.ts` (categorías, sin cambio), `qa-eligibility.ts`, `qa-agent.ts`, `qa-agent-git.ts`, `qa-policy-close.ts`, `review-risk.ts`, `diff.ts`, `secrets.ts`, `code-review.ts`, `worktree-integrar.ts`, `worktree-integracion-git.ts`, `integration-commit.ts`, `integration-rules.ts`, `references.ts`; pruebas que dependen de la forma del comando: `tests/worktree-integrar.test.ts:438`, `tests/lista-denegados.test.ts:118-124`, `tests/qa-agent.test.ts:295-317`, `tests/reglas-integracion.test.ts:135`.
- Hipótesis pendientes: (a) con `-M` por defecto (50 % de similitud) un renombre muy reescrito sale como borrado más alta; las dos rutas siguen presentes, así que no abre hueco, pero se cubre con un caso. (b) Rutas con comilla doble, barra invertida o salto de línea: `-z` las entrega crudas; en el parche de `pendingChanges` hace falta desentrecomillar el formato C de git (se cubre con un caso). (c) Una copia (`C`) no cambia su origen: se plantea que el origen de una copia no cuente como tocado; lo decide el plan.
- Riesgos y compatibilidad: el cambio **endurece** decisiones de seguridad: un diff que hoy pasa la elegibilidad por un renombre desde una ruta prohibida dejará de pasar, y una integración con ese renombre se detendrá. Cambian las formas admitidas en dos listas cerradas de git (`qa-agent-git.ts`, `worktree-integracion-git.ts`); la forma vieja deja de admitirse, y eso pone en rojo filas de `tests/lista-denegados.test.ts` y `tests/worktree-integrar.test.ts` que el plan declara. Sin cambio de formato de recibos, de CLI ni de API pública salvo las exportaciones nuevas del módulo de rutas.
- Impactos de sync, migración, Docker o despliegue: ninguno (cambio interno del motor; no toca sincronización, migraciones, contenedores ni despliegue de un proyecto real).

## Plan

- Gate de plan y aprobación: pendiente. BUGFIX del motor sin impactos críticos declarados, pero toca la elegibilidad de la QA por agente, el cierre por política, la integración de worktrees y el escaneo de secretos: lo aprueba una persona, o una autorización de aprobación vigente si el ticket es elegible. El agente que planificó no aprueba.
- Modo de trabajo: harness completo (decisión del orquestador para un BUGFIX sensible a seguridad que toca varios módulos del motor).
- Diseño: **una sola función de rutas tocadas** en un módulo nuevo, `packages/engine/src/rutas-tocadas.ts`, que todos los consumidores llaman con su propio ejecutor de git (cada uno conserva su lista cerrada):
  - `ARGUMENTOS_DE_RUTAS_TOCADAS = ["diff", "--name-status", "-z", "-M", "-C"]`: `-z` entrega las rutas crudas (sin comillas ni escapes octales, sin depender de `core.quotepath`); `-M`/`-C` explícitos no dependen de `diff.renames` del usuario.
  - `CambioDeRuta { estado: "A" | "M" | "D" | "R" | "C" | "T"; ruta: string; origen: string | null }`: `ruta` es el destino; `origen` solo en `R` y `C`. Un estado desconocido se trata como `M`.
  - `parsearCambiosDeRuta(salidaZ)`: parte por `\0`; `R<n>`/`C<n>` consumen dos rutas (origen y destino), el resto una.
  - `cambiosDeRuta(ejecutar, rango)`: corre los argumentos más el rango con el ejecutor recibido; un estado distinto de 0 lanza `git diff falló: …`.
  - `rutasQueCuentan(cambios)`: el destino de cada cambio, más el origen de cada renombre (`R`); el origen de una copia (`C`) no cuenta, porque una copia no lo modifica (si el origen también cambió, git lo informa aparte como `M`). Sin duplicados, ordenadas.
  - `desentrecomillarRutaDeGit(texto)`: el formato C de git (`"…"` con `\nnn`, `\"`, `\\`, `\t`, `\n`) a la ruta real en UTF-8; para las cabeceras del parche en `diff.ts`.
- Pasos ordenados:
  1. Crear `packages/engine/src/rutas-tocadas.ts` con los seis símbolos del diseño y exportarlo desde `packages/engine/src/index.ts`. (C1, C2, C3, C4, C5, C6)
  2. `packages/engine/src/qa-eligibility.ts:37-52` (`archivosDelDiff`): reemplazar `git diff --name-only <base>..HEAD` por `cambiosDeRuta` con `ejecutarGitPermitido` y el rango `<base>..HEAD`, y devolver `rutasQueCuentan`. La firma no cambia (`string[]`), así que `packages/cli/src/commands.ts:3683` queda igual. (C7, C8)
  3. `packages/engine/src/qa-agent-git.ts:36-39` (`motivoDeGitDeQaAgent`, caso `diff`): admitir solo `ARGUMENTOS_DE_RUTAS_TOCADAS` seguidos de un rango; la forma `--name-only [--diff-filter=A] <rango>` deja de admitirse y el mensaje nombra la forma nueva. (C9, C10)
  4. `packages/engine/src/qa-agent.ts:110-118` (`lineasDelDiff`): leer una vez `cambiosDeRuta` sobre `<base>..<delivered>`; `archivosDelDiff` = `rutasQueCuentan`. `qa-agent.ts:265`: las pruebas nuevas salen de los cambios con estado `A` o `C` (destino), sin `--diff-filter=A`. (C11)
  5. `packages/engine/src/qa-policy-close.ts:91-93`: reemplazar la lectura por `cambiosDeRuta` con su ejecutor de `qa-agent-git` sobre `<recibo.base>..<head>`, y pasar `rutasQueCuentan` a `elegibilidadQa`. (C12)
  6. `packages/engine/src/worktree-integracion-git.ts:43-49` (`motivoDeGitDeIntegracion`, caso `diff`): admitir `ARGUMENTOS_DE_RUTAS_TOCADAS` más un rango `REFERENCIA`; `packages/engine/src/worktree-integrar.ts:107-111`: `archivosDeLaRama` = `rutasQueCuentan(cambiosDeRuta(…, "main...<rama>"))`, de modo que `motivoDeArchivoProhibido` ve también el origen del renombre. (C13, C14)
  7. `packages/engine/src/diff.ts`: `pendingFiles` (`diff.ts:58-69`) con `cambiosDeRuta` (rango `HEAD`, más `--cached` si es `staged`; el `--cached` va entre los argumentos fijos y el rango) y `ls-files --others --exclude-standard -z`; `pendingChanges` (`diff.ts:78-150`) corre el parche con `-c core.quotePath=false`, toma la ruta de `+++ b/…` o de `+++ "b/…"` con `desentrecomillarRutaDeGit`, y ante `+++ /dev/null` registra en `files` la ruta del `--- a/…` previo (un borrado no aporta líneas agregadas); `diff.ts:131` pasa a `ls-files … -z`. (C15, C16, C17)
  8. Pruebas nuevas, una tabla de casos por regla, todas contra un repositorio git real en un directorio temporal: `tests/rutas-tocadas.test.ts` con la tabla «rutas que cuentan» (renombre, borrado, copia, renombre reescrito bajo el umbral) y la tabla «lectura cruda» (no ASCII, comilla doble); la tabla «listas cerradas» (C9, C10, C13) y la tabla de consumidores (C7, C8, C15, C16, C17) en el mismo archivo; un caso en `tests/qa-agent.test.ts` (C11), uno en `tests/qa-por-politica.test.ts` (C12) y uno en `tests/worktree-integrar.test.ts` (C14), con los ayudantes de repositorio que esos archivos ya tienen. Cada caso nombra su criterio (`C<n>: …`) para el filtro `-t`. Los casos de consumidores fallan sin el arreglo (lo mostró la reproducción del diagnóstico); los de C1-C6 fallan porque la función no existe. (C1-C17)
  9. Ajustar las pruebas existentes declaradas abajo, correr los archivos de prueba del ticket, `node scripts/exports-sin-uso.mjs` y `npx tsc --build tsconfig.build.json`. (C18, C19, C20)
- Pruebas existentes que el cambio pone en rojo a propósito (EST-009; solo estas se editan):
  - `tests/lista-denegados.test.ts:118-124` (tabla de `motivoDeQaAgent`): las filas 120 y 124 esperan `null` para `["diff", "--name-only", …]`, forma que deja de admitirse. Cambio mínimo: en las siete filas, sustituir `"--name-only"` por `"--name-status", "-z", "-M", "-C"`; el motivo esperado de cada fila no cambia.
  - `tests/worktree-integrar.test.ts:438` (formas admitidas de `motivoDeGitDeIntegracion`): sustituir `["diff", "--name-only", "-z", "main...valmen/ticket-uno"]` por `["diff", "--name-status", "-z", "-M", "-C", "main...valmen/ticket-uno"]`. La fila rechazada de `tests/worktree-integrar.test.ts:429` sigue rechazada sin cambio.
  - Ninguna otra: `tests/reglas-integracion.test.ts:135` prueba la lista de la jornada (`integration-rules.ts`), que no cambia; `tests/elegibilidad-qa.test.ts` pasa los archivos del diff como arreglo. Si otra prueba existente se pone en rojo, la implementación se detiene y se consulta.
- Fuera de este ticket (con motivo, en el diagnóstico): `git status --porcelain` sin `-z` en `packages/engine/src/integration-commit.ts:71-80` y `packages/engine/src/worktree-integrar.ts:45-52` (mismo defecto con otro comando; se propone un ticket aparte), `packages/engine/src/references.ts:128` (hash de QA, falla visible), y `review-risk.ts:61`/`diff.ts:298`, que ya son correctos.
- Tamaño previsto: 20 criterios; unas 170 líneas de producción (módulo nuevo ~90, consumidores ~80) y unas 260 de pruebas, unas 430 en total, dentro de 300-700. Si pasara de 700, se parte: primero el módulo con `qa-eligibility`, `qa-agent`, `qa-policy-close` (C1-C12, C18-C20); después integración más `diff.ts` (C13-C17).
- Impactos declarados: ninguno de sincronización, migración ni contenedores (`sync_impact`, `migration_impact`, `docker_impact` en `false`): es lógica interna del motor. Efecto de comportamiento: más diffs dejan de ser elegibles para la QA por agente, más ramas se detienen al integrar, y borrar un archivo de interfaz cuenta ahora como tocar pantallas en `packages/engine/src/ux-review.ts:61`.
- Rollback (obligatorio): revertir el commit del ticket con `git revert <commit>` en la rama; no hay estado en disco, recibos ni formatos nuevos que deshacer, y las dos listas cerradas vuelven a su forma anterior con el mismo revert.

## Criterios de aceptación

- [x] C1: `rutasQueCuentan` incluye el origen de un renombre.
  <!-- test: npx vitest run tests/rutas-tocadas.test.ts -t "C1:" -->
- [x] C2: `rutasQueCuentan` incluye la ruta de un borrado.
  <!-- test: npx vitest run tests/rutas-tocadas.test.ts -t "C2:" -->
- [x] C3: `rutasQueCuentan` excluye el origen de una copia.
  <!-- test: npx vitest run tests/rutas-tocadas.test.ts -t "C3:" -->
- [x] C4: `cambiosDeRuta` entrega una ruta no ASCII con sus caracteres reales.
  <!-- test: npx vitest run tests/rutas-tocadas.test.ts -t "C4:" -->
- [x] C5: `cambiosDeRuta` entrega sin comillas una ruta que contiene una comilla doble.
  <!-- test: npx vitest run tests/rutas-tocadas.test.ts -t "C5:" -->
- [x] C6: Un renombre con similitud bajo el umbral de `-M` conserva la ruta vieja entre las rutas que cuentan.
  <!-- test: npx vitest run tests/rutas-tocadas.test.ts -t "C6:" -->
- [x] C7: `archivosDelDiff` devuelve el origen de un renombre desde una migración.
  <!-- test: npx vitest run tests/rutas-tocadas.test.ts -t "C7:" -->
- [x] C8: `rutaProhibidaParaQaAgente` clasifica como «migraciones» la ruta no ASCII que devuelve `archivosDelDiff`.
  <!-- test: npx vitest run tests/rutas-tocadas.test.ts -t "C8:" -->
- [x] C9: `motivoDeGitDeQaAgent` admite `diff --name-status -z -M -C <rango>`.
  <!-- test: npx vitest run tests/rutas-tocadas.test.ts -t "C9:" -->
- [x] C10: `motivoDeGitDeQaAgent` rechaza `diff --name-only <rango>`.
  <!-- test: npx vitest run tests/rutas-tocadas.test.ts -t "C10:" -->
- [x] C11: `correrQaAgent` bloquea un entregado que renombra un archivo de `.valmen/`.
  <!-- test: npx vitest run tests/qa-agent.test.ts -t "C11:" -->
- [x] C12: `cerrarQaPorPolitica` rechaza el cierre de un diff que renombra una migración.
  <!-- test: npx vitest run tests/qa-por-politica.test.ts -t "C12:" -->
- [x] C13: `motivoDeGitDeIntegracion` admite `diff --name-status -z -M -C <rango>`.
  <!-- test: npx vitest run tests/rutas-tocadas.test.ts -t "C13:" -->
- [x] C14: `integrarWorktree` rechaza una rama que renombra `.valmen/config.yaml`.
  <!-- test: npx vitest run tests/worktree-integrar.test.ts -t "C14:" -->
- [x] C15: `pendingChanges` cuenta un archivo borrado entre sus archivos.
  <!-- test: npx vitest run tests/rutas-tocadas.test.ts -t "C15:" -->
- [x] C16: `scanPendingChanges` detecta un secreto en un archivo de nombre no ASCII.
  <!-- test: npx vitest run tests/rutas-tocadas.test.ts -t "C16:" -->
- [x] C17: El hallazgo de ese secreto lleva la ruta real del archivo.
  <!-- test: npx vitest run tests/rutas-tocadas.test.ts -t "C17:" -->
- [x] C18: `node scripts/exports-sin-uso.mjs` termina sin exportaciones sin uso.
  <!-- test: node scripts/exports-sin-uso.mjs -->
- [x] C19: `npx tsc --build tsconfig.build.json` termina sin errores.
  <!-- test: npx tsc --build tsconfig.build.json -->
- [x] C20: Las pruebas existentes de las listas cerradas pasan con la forma nueva del diff.
  <!-- test: npx vitest run tests/lista-denegados.test.ts tests/worktree-integrar.test.ts tests/qa-agent.test.ts tests/elegibilidad-qa.test.ts tests/qa-por-politica.test.ts tests/riesgo-revision.test.ts tests/presentation.test.ts tests/revision-ux.test.ts -->

## Puntos

```json
[
  {
    "id": "POINT-001",
    "title": "Verificación delegada de BUGFIX-ENGINE-DIFF-RUTAS-RENOMBRE-20261010",
    "status": "closed",
    "severity": "normal",
    "actual": "La implementación está entregada y falta verificar sus criterios.",
    "expected": "Los criterios del ticket se cumplen y sus pruebas dan el resultado esperado.",
    "evidence": [
      "EVIDENCE-001"
    ],
    "affected_files": [
      "packages/engine/src/diff.ts",
      "packages/engine/src/index.ts",
      "packages/engine/src/qa-agent-git.ts",
      "packages/engine/src/qa-agent.ts",
      "packages/engine/src/qa-eligibility.ts",
      "packages/engine/src/qa-policy-close.ts",
      "packages/engine/src/rutas-tocadas.ts",
      "packages/engine/src/worktree-integracion-git.ts",
      "packages/engine/src/worktree-integrar.ts",
      "scripts/exports-sin-uso.linea-base.json",
      "tests/lista-denegados.test.ts",
      "tests/qa-agent.test.ts",
      "tests/qa-por-politica.test.ts",
      "tests/rutas-tocadas.test.ts",
      "tests/worktree-integrar.test.ts"
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

- Módulo nuevo `packages/engine/src/rutas-tocadas.ts` (exportado desde `index.ts`): `ARGUMENTOS_DE_RUTAS_TOCADAS`, `CambioDeRuta`, `EjecutorDeRutas`, `cambiosDeRuta`, `rutasQueCuentan`, `desentrecomillarRutaDeGit`; `parsearCambiosDeRuta` queda interna (sin consumidor externo, `exports:check` la rechazaba).
- Consumidores: `qa-eligibility.ts` (`archivosDelDiff`), `qa-agent.ts` (una lectura; pruebas nuevas = estados `A`/`C`), `qa-policy-close.ts`, `worktree-integrar.ts`, y las dos listas cerradas `qa-agent-git.ts` y `worktree-integracion-git.ts` (solo `diff --name-status -z -M -C <rango>`). `diff.ts`: `pendingFiles` con `cambiosDeRuta`, `ls-files -z`, parche con `-c core.quotePath=false`, cabeceras `---`/`+++` solo dentro de la cabecera de cada archivo (`diff --git` hasta `@@`), borrado (`+++ /dev/null`) registra la ruta de `--- a/…`.
- `scripts/exports-sin-uso.linea-base.json`: se quitó `motivoDeGitDeQaAgent`, que ahora consume una prueba (lo exigía `exports:check`); no se agregó nada.
- Pruebas existentes editadas (EST-009, solo las que el plan declara): `tests/lista-denegados.test.ts:118-124` (siete filas: `"--name-only"` por `"--name-status", "-z", "-M", "-C"`; la forma vieja ya no se admite) y `tests/worktree-integrar.test.ts:438` (fila admitida a la forma nueva; la rechazada de 429 intacta). Ninguna otra prueba existente se puso en rojo.
- Pruebas nuevas, en rojo antes del código: `tests/rutas-tocadas.test.ts` (tablas «rutas que cuentan», «lectura cruda», «listas cerradas», «consumidores»: C1-C10, C13, C15-C17), C11 en `tests/qa-agent.test.ts`, C12 en `tests/qa-por-politica.test.ts` (el recibo se simula aprobado por una versión anterior reescribiendo su `base`, porque la versión nueva ya no lo aprobaría), C14 en `tests/worktree-integrar.test.ts`. Sin el arreglo: C1-C10, C13, C15-C17 fallaron (módulo/forma inexistente o salida entrecomillada), C11 dio `approve`, C12 y C14 fallaron al revalidar con el código anterior.
- Fuera del ticket, sin tocar: `git status --porcelain` sin `-z` (otro ticket).

## Pruebas

Directorio: raíz del worktree (`/Users/juanandrade/Desktop/ValmenHarness/.claude/worktrees/ticket-diff-rutas-renombre`). Ambiente: Node 24, `git` en el PATH; las pruebas crean repositorios git temporales.

- `npx vitest run tests/rutas-tocadas.test.ts tests/qa-agent.test.ts tests/qa-por-politica.test.ts tests/worktree-integrar.test.ts tests/lista-denegados.test.ts tests/elegibilidad-qa.test.ts tests/riesgo-revision.test.ts tests/presentation.test.ts tests/revision-ux.test.ts tests/secrets.test.ts tests/reglas-integracion.test.ts` → esperado y obtenido: 11 archivos, 287 pruebas verdes.
- `npx tsc --noEmit -p tsconfig.json` → 0 errores. `npm run build` → compila. `npm run exports:check` → sin exportaciones nuevas sin consumidor. `npm run lint` → 0 errores. `npm run format:check` → limpio.
- Validación manual: ninguna. Pendiente para la persona: la suite completa (`npx vitest run`) la corre el orquestador al integrar.

- Resultado del PO: Si dale. Las pruebas del ticket las ejecutó el agente y dieron el resultado esperado: tests/rutas-tocadas.test.ts nueva y las 11 suites de los seis consumidores: 287 pruebas en verde; reproducido en un repositorio git real el renombre desde una migración, la ruta no ASCII, el borrado y el secreto en un archivo de nombre no ASCII; suite completa de main con los tres integrados: 257 archivos y 4966 pruebas en verde; tsc 0 errores; lint 0; format:check y exports:check limpios; compuerta qa-mechanical (command): APPROVE

## QA

```json
[
  {
    "id": "QA-001",
    "date": "2026-10-11",
    "build_reference": "commit:050308dad40207766b94e2ae8caaa7baa40b68d9",
    "environment": "local: checkout principal de main, Node 24, sin Docker ni red ni modelo real",
    "result": "pending",
    "findings": [],
    "correction": null,
    "po_confirmation": null
  },
  {
    "id": "QA-002",
    "date": "2026-10-11",
    "build_reference": null,
    "environment": null,
    "result": "approved",
    "findings": [],
    "correction": null,
    "po_confirmation": "Si dale"
  }
]
```

## Evidencia

```json
[
  {
    "id": "EVIDENCE-001",
    "date": "2026-10-11",
    "kind": "automated-test",
    "description": "tests/rutas-tocadas.test.ts nueva y las 11 suites de los seis consumidores: 287 pruebas en verde; reproducido en un repositorio git real el renombre desde una migración, la ruta no ASCII, el borrado y el secreto en un archivo de nombre no ASCII; suite completa de main con los tres integrados: 257 archivos y 4966 pruebas en verde; tsc 0 errores; lint 0; format:check y exports:check limpios; compuerta qa-mechanical (command): APPROVE",
    "reference": "worktree:sha256:36ee5f5abf30a3ced5b6e63e4d4c9c04dfe2b3ded7562572f576b83915c18825",
    "point_id": "POINT-001"
  }
]
```

## Retests

```json
[
  {
    "id": "RETEST-001",
    "date": "2026-10-11",
    "point_id": "POINT-001",
    "result": "approved",
    "evidence": [],
    "po_confirmation": "Si dale"
  }
]
```

## Cierre

```json
[
  {
    "kind": "ticket-close",
    "id": "CLOSE-001",
    "date": "2026-10-11",
    "technical_summary": "Función única de rutas tocadas (packages/engine/src/rutas-tocadas.ts) con -z y --name-status que reporta origen y destino de renombres y copias; la usan la elegibilidad de la QA por agente, qa-agent, qa-policy-close, la integración, diff.ts y el detector de secretos.",
    "functional_summary": "Un renombre desde una ruta prohibida ya frena la elegibilidad de la QA por agente, las rutas no ASCII se clasifican, los borrados aparecen y valmen secrets ve un secreto en un archivo de nombre no ASCII.",
    "qa_status": "approved",
    "qa_waiver_reason": null,
    "po_confirmation": null,
    "release_impact": "Sin migraciones, sin sincronización ni Docker. git status con porcelain sin -z queda fuera, para otro ticket."
  }
]
```

## Consumo de IA

```json
[
  {
    "kind": "ai-usage",
    "date": "2026-10-11",
    "session_reference": null,
    "model": null,
    "reasoning_effort": null,
    "notes": "Sesión de subagente de implementación; no expone números de tokens ni costo.",
    "input_tokens": null,
    "output_tokens": null,
    "total_tokens": null,
    "estimated_cost_usd": null,
    "source": "manual:subagente-implementacion",
    "confidence": "low",
    "id": "CONSUMO-001"
  },
  {
    "kind": "ai-usage",
    "date": "2026-10-11",
    "session_reference": "c2769fcf-63f8-4baf-a5d3-a4b9b7a976b8",
    "model": null,
    "reasoning_effort": null,
    "notes": "Agente claude-code. Sesión **compartida**: trabajó 7 tickets (FEATURE-CLI-PRUEBA-MENSAJES-20261010 ×87, FEATURE-BENCH-FRICCION-RUNNER-20261010 ×58, CHORE-CI-EXPORTS-SIN-USO-20261010 ×56, FEATURE-GATE-CODE-REVIEW-EXIGENCIA-20261010 ×29, FEATURE-X-20261010 ×25), así que su costo no se reparte y acá no se registran números. Costo completo de la sesión: no declarado por el proveedor, 5162518 tokens (sin los subagentes con ticket propio). Registralo en el ticket cuya sesión sea propia, o declaralo compartido donde corresponda. Sesión \"Comparación de harness de desarrollo\".",
    "input_tokens": null,
    "output_tokens": null,
    "total_tokens": null,
    "estimated_cost_usd": null,
    "source": "claude:c2769fcf-63f8-4baf-a5d3-a4b9b7a976b8",
    "confidence": "high",
    "id": "CONSUMO-002"
  },
  {
    "kind": "ai-usage",
    "date": "2026-10-11",
    "session_reference": "c2769fcf-63f8-4baf-a5d3-a4b9b7a976b8/agent-a778ae8259c5f7cdc",
    "model": "anthropic/claude-opus-5-5",
    "reasoning_effort": null,
    "notes": "Agente claude-code. 15 intervención(es) sobre el registro, 0 con fallo. 15 de 52 mensajes tocaron el registro. Subagente de la sesión c2769fcf-63f8-4baf-a5d3-a4b9b7a976b8; su gasto no está en la madre. Duró 10 min. La entrada incluye la creación de caché y la salida incluye el razonamiento. Caché leída 5408839 tokens. Sesión \"Sesión de Claude Code\". Costo: suscripción; no es cero, el origen no declara un costo por token. Se registran los tokens.",
    "input_tokens": 108768,
    "output_tokens": 39798,
    "total_tokens": 148566,
    "estimated_cost_usd": null,
    "source": "claude:c2769fcf-63f8-4baf-a5d3-a4b9b7a976b8/agent-a778ae8259c5f7cdc",
    "confidence": "high",
    "id": "CONSUMO-003"
  },
  {
    "kind": "ai-usage",
    "date": "2026-10-11",
    "session_reference": "c2769fcf-63f8-4baf-a5d3-a4b9b7a976b8/agent-ac876415901a82b10",
    "model": "anthropic/claude-sonnet-5-5",
    "reasoning_effort": null,
    "notes": "Agente claude-code. 7 intervención(es) sobre el registro, 0 con fallo. 7 de 40 mensajes tocaron el registro. Subagente de la sesión c2769fcf-63f8-4baf-a5d3-a4b9b7a976b8; su gasto no está en la madre. Duró 7 min. La entrada incluye la creación de caché y la salida incluye el razonamiento. Caché leída 4682724 tokens. Sesión \"Sesión de Claude Code\". Costo: suscripción; no es cero, el origen no declara un costo por token. Se registran los tokens.",
    "input_tokens": 147924,
    "output_tokens": 32046,
    "total_tokens": 179970,
    "estimated_cost_usd": null,
    "source": "claude:c2769fcf-63f8-4baf-a5d3-a4b9b7a976b8/agent-ac876415901a82b10",
    "confidence": "high",
    "id": "CONSUMO-004"
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
    "date": "2026-10-10",
    "at": "2026-10-11T00:17:22.231Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-11",
    "at": "2026-10-11T06:37:12.198Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-11",
    "at": "2026-10-11T06:40:20.118Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-11",
    "at": "2026-10-11T06:43:28.321Z",
    "action": "plan-approved",
    "actor": "cli",
    "details": "{\"actor\":\"autorización APA-20261009-326fff\",\"source\":\"autorizacion\",\"quote\":\"aprobacion de planes y analisis agentico\",\"planHash\":\"sha256:f95c7c628b54cc266893eb383e14b4ea17b361703253f318136b42678fe5d1c1\",\"authorizationId\":\"APA-20261009-326fff\",\"authorizationHash\":\"sha256:c19a86ffa26fde8eedf8f789eff6a06a13a941ae1e68c983ec078f02eba6be0d\",\"stage\":\"plan\",\"receiptId\":\"GR-20261011-BUGFIX-ENGINE-DIFF-RUTAS-RENOMBRE-20261010-plan-1\",\"receiptStateHash\":\"sha256:0c25f840000cbcf9e1a0a2e757d50180acc97faed871ee30f51c757613855265\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-11",
    "at": "2026-10-11T06:43:28.652Z",
    "action": "plan-approval-verified",
    "actor": "cli",
    "details": "Aprobación del plan vigente: autorización APA-20261009-326fff (fuente autorizacion, hash sha256:c19a86ffa26fde8eedf8f789eff6a06a13a941ae1e68c983ec078f02eba6be0d), plan sha256:f95c7c628b54cc266893eb383e14b4ea17b361703253f318136b42678fe5d1c1."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-11",
    "at": "2026-10-11T06:43:28.652Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-11",
    "at": "2026-10-11T06:43:54.340Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-10-11",
    "at": "2026-10-11T06:49:29.193Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-10-11",
    "at": "2026-10-11T06:50:28.731Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-10-11",
    "at": "2026-10-11T07:12:32.673Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-002."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-10-11",
    "at": "2026-10-11T07:12:32.981Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-003."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-10-11",
    "at": "2026-10-11T07:12:33.284Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-004."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-10-11",
    "at": "2026-10-11T07:12:33.450Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-014",
    "date": "2026-10-11",
    "at": "2026-10-11T07:12:33.607Z",
    "action": "point-added",
    "actor": "cli",
    "details": "Se agregó POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-015",
    "date": "2026-10-11",
    "at": "2026-10-11T07:12:33.766Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-016",
    "date": "2026-10-11",
    "at": "2026-10-11T07:12:33.920Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-017",
    "date": "2026-10-11",
    "at": "2026-10-11T07:12:34.072Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-018",
    "date": "2026-10-11",
    "at": "2026-10-11T07:12:34.403Z",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-019",
    "date": "2026-10-11",
    "at": "2026-10-11T07:12:34.761Z",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-020",
    "date": "2026-10-11",
    "at": "2026-10-11T07:12:34.909Z",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-001 para POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-021",
    "date": "2026-10-11",
    "at": "2026-10-11T07:12:35.058Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: verified -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-022",
    "date": "2026-10-11",
    "at": "2026-10-11T07:12:35.215Z",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-023",
    "date": "2026-10-11",
    "at": "2026-10-11T07:12:35.363Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-024",
    "date": "2026-10-11",
    "at": "2026-10-11T07:12:35.515Z",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-025",
    "date": "2026-10-11",
    "at": "2026-10-11T07:12:35.661Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  }
]
```
