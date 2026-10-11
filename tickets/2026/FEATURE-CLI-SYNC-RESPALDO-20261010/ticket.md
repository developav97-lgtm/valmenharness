---
schema_version: 2
id: FEATURE-CLI-SYNC-RESPALDO-20261010
title: valmen sync con --dry-run y respaldo de lo que sobrescribe
type: FEATURE
module: CLI
workflow_status: awaiting_user_tests
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

# FEATURE-CLI-SYNC-RESPALDO-20261010

## Solicitud original

Parte del sprint: Operar sync y la limpieza de forma reversible: vista previa, respaldo no versionado y limpieza con confirmación.
- R-SYN-001: `valmen sync --dry-run` DEBE mostrar qué escribiría sin escribir nada
- R-SYN-002: `valmen sync` DEBE respaldar cada archivo que va a sobrescribir con contenido distinto
- R-SYN-003: La carpeta de respaldos NO DEBE versionarse
Viene de una feature descompuesta en sprints; su plan completo está en el tickets.yaml de la feature.

Comportamiento esperado: `valmen sync --dry-run` DEBE mostrar qué escribiría sin escribir nada `valmen sync` DEBE respaldar cada archivo que va a sobrescribir con contenido distinto La carpeta de respaldos NO DEBE versionarse
Comportamiento actual: la spec no lo declara; se establece en el análisis, leyendo el código.

### Supuestos y decisiones pendientes

<!-- Si el pedido nombra algo que el código no tiene —parámetro, permiso,
campo, bandera, columna, migración— y no lo especifica, listá cada elemento
con su pregunta antes de avanzar a análisis; el análisis no planifica sobre
la adivinanza. Si no hay ninguno, escribí «Ninguno» y seguí. -->
- Vista previa de una skill publicada pendiente: `--dry-run` no instala las publicadas, así que calcula la proyección sobre la copia actual de `.valmen/skills/`; si una publicada se reinstalaría, `--dry-run` la nombra (C4), pero sus archivos proyectados en `.claude/skills/`, `.codex/`, … aparecerán recién en el `--dry-run` siguiente a instalarla. Pregunta al PO: ¿se acepta ese límite (recomendado: unas 245 líneas de producción) o `--dry-run` debe proyectar sobre una copia en memoria con las publicadas ya aplicadas (requiere que `projectFiles` lea de una superposición, unas 80 líneas más)?

## Descripción funcional

- Alcance: `valmen sync` (CLI) gana `--dry-run`, que informa qué escribiría —proyecciones y skills publicadas— sin tocar el disco; `valmen sync` y la sincronización de Mission Control (`POST /api/config/sync`) respaldan, antes de pisarlo, cada archivo cuyo contenido en disco difiere del que van a escribir, en `.valmen/backups/sync/<marca de tiempo>/<ruta relativa>` con un manifiesto de rutas con sha256; `.valmen/backups/` no se versiona. Spec: `.valmen/features/operacion-entrega-harness/spec/s1-sync/spec.md` (R-SYN-001, R-SYN-002, R-SYN-003). Fuera de alcance: borrar o rotar respaldos (lo hace FEATURE-CLI-LIMPIEZA-INTEGRADOS-20261010, que depende de este), un `--dry-run` en Mission Control, `adopt`.
- Usuario o rol afectado: quien corre `valmen sync` en un proyecto (PO o agente) y quien pulsa «Sincronizar» en Mission Control; en particular quien editó a mano un archivo generado (`AGENTS.md`, `.claude/skills/*/SKILL.md`) o una copia de skill publicada en `.valmen/skills/<id>/`.
- Comportamiento actual: `sync` sobrescribe todos los archivos proyectados sin copia previa; la única vista previa es `--check`, que lista rutas sin resumen de cambios y sale con error si hay diferencias; las skills publicadas se pisan sin copia; `.valmen/backups/` no existe ni está ignorada.
- Comportamiento esperado: `sync --dry-run` lista cada archivo que crearía o cambiaría con sus líneas añadidas y quitadas, sale con 0 y deja el disco igual; `sync` deja la versión anterior de cada archivo que cambia en una carpeta de respaldo con manifiesto y nombra esa carpeta en la salida; sin cambios no crea carpeta; `git status` no muestra `.valmen/backups/`.

## Diagnóstico

- Causa comprobada (con `ruta:línea`): es funcionalidad nueva (AP-005: no hay síntoma de defecto; el «actual» es la ausencia, comprobada en el código):
  - `packages/cli/src/commands.ts:924-1064` (`syncProject(root, projectName, check)`): la rama de escritura `:1005-1007` llama `atomicWrite(join(root, file.path), file.content)` para **todos** los proyectados, cambien o no, sin leer antes lo que hay en disco ni copiarlo.
  - `packages/cli/src/commands.ts:933`: `instalarPublicadas(root)` corre antes de proyectar en todo `sync` sin `--check`; `packages/adapter/src/skills.ts:712-742` escribe con `writeFileSync` (`:720`, `:735`) la copia de cada skill publicada que difiere, y su comentario `:706-709` declara que **pisa una copia editada a mano** sin respaldo.
  - `packages/cli/src/commands.ts:948-1002` (`--check`): compara sin escribir pero solo junta rutas (`:950-954`) y devuelve error; no hay resumen de líneas ni modo que salga con 0.
  - `packages/cli/src/command-table.ts:229`: `sync` solo admite la booleana `--check`; `--dry-run` hoy no es una opción reconocida. `packages/cli/src/main.ts:1451-1456` despacha con `options.flags["check"] === true` como tercer argumento.
  - `packages/server/src/config.ts:292-327` (`syncProjections`): compara con disco (`:311-320`) y escribe solo lo que cambió (`:322`, `atomicWrite`) sin copia; `SyncOutcome` (`:274-282`) no tiene campo de respaldo. `packages/server/src/server.ts:1967-1977` devuelve `...resultado` tal cual, así que un campo nuevo llega a la respuesta sin tocar el handler.
  - `packages/core/src/fs.ts:105-139` (`atomicWrite`): escritura atómica con `assertWriteAllowed` (`:109`); es la puerta que debe usar el respaldo.
  - `.gitignore:1-47`: ignora `.valmen/state/` (`:7`) y `.valmen/programar/`, pero no `.valmen/backups/`. Ningún código del harness escribe el `.gitignore` de un proyecto consumidor (búsqueda `gitignore` en `packages/*/src`: solo comentarios en `packages/adapter/src/claude-code.ts:35` y `packages/engine/src/worktree.ts:170`).
  - No existe utilidad de diff de líneas en el motor (búsqueda `diffLines|lineDiff|añadidas` sin resultados de uso en `packages/*/src`).
- Hipótesis pendientes:
  - Que el resumen «líneas añadidas y quitadas» basta como conteo `+N −M` por archivo (multiconjunto de líneas) en vez de un diff unificado; la spec pide «resumen de cambios» y el conteo lo cumple sin dependencia nueva. Se decide en el plan.
  - Que en un proyecto consumidor sin `.valmen/backups/` en su `.gitignore` el respaldo no se versiona solo si la carpeta lleva su propio `.gitignore` con `*`; se comprueba con una prueba sobre un repositorio git temporal.
- Consumidores afectados:
  - `packages/cli/src/main.ts:1451` (despacho de `sync`) y `packages/cli/src/command-table.ts:229` (opciones).
  - `packages/cli/src/onboarding-verify.ts:63` y unas 20 pruebas (`tests/skills-publicadas.test.ts:72`, `tests/adopt.test.ts`, `tests/proyeccion-denegados.test.ts`, …) llaman `syncProject(root, name, bool)`: la firma de tres argumentos debe seguir válida.
  - `packages/cli/src/commands.ts:1504` (`adopt`) también llama `instalarPublicadas(root)`; con un parámetro opcional no cambia.
  - `packages/server/src/server.ts:1969` y `tests/config-view.test.ts:215-290` consumen `syncProjections` y `SyncOutcome`.
  - FEATURE-CLI-LIMPIEZA-INTEGRADOS-20261010 consumirá la ubicación `.valmen/backups/sync/` y el manifiesto.
- Archivos y flujo investigados: `valmen sync [--check]` → `packages/cli/src/main.ts:1451` → `syncProject` `packages/cli/src/commands.ts:924` → `instalarPublicadas` `packages/adapter/src/skills.ts:712` → `projectFiles` `packages/adapter/src/projection.ts:156` → `atomicWrite` `packages/core/src/fs.ts:105`. Mission Control: `POST /api/config/sync` `packages/server/src/server.ts:1967` → `syncProjections` `packages/server/src/config.ts:292` → `projectFiles` → `atomicWrite`. Deriva de publicadas sin escribir: `derivaPublicada` `packages/adapter/src/skills.ts:599`.
- Riesgos y compatibilidad:
  - El respaldo puede contener lo que una persona editó y no quiso commitear (incluido `.claude/settings.json`): por eso no debe versionarse (R-SYN-003); se ignora en el `.gitignore` del harness y con un `.gitignore` propio de la carpeta para proyectos consumidores.
  - Crecimiento en disco: cada `sync` con cambios crea una carpeta; la limpieza es del ticket dependiente. Sin cambios no se crea nada.
  - Compatibilidad: `syncProject` conserva su firma de tres argumentos (opciones nuevas en un cuarto opcional); `instalarPublicadas` conserva la suya; `SyncOutcome` gana un campo opcional aditivo; `--check` no cambia de comportamiento.
  - Modo pregunta (`assertWriteAllowed`): el respaldo escribe con `atomicWrite`, así que en modo pregunta se niega igual que la proyección, antes de pisar nada.
  - Orden: si el respaldo falla, la proyección no debe escribirse (respaldar antes, escribir después).
- Impactos de sync, migración, Docker o despliegue: ninguno; `sync` aquí es la proyección local de `.valmen/` a archivos de agentes, no la sincronización de datos de un proyecto en uso; sin migración, contenedores ni despliegue.

## Plan

- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan), el 2026-10-11 con «Aprobar tal cual (Recomendado)»; el REVIEW del recibo plan-1 lo decidió el PO.
- Alcance: `--dry-run` en `valmen sync`; respaldo previo en `valmen sync` con `syncProjections` (Mission Control); `.valmen/backups/` fuera del control de versiones. Fuera de alcance: limpieza o rotación de respaldos (FEATURE-CLI-LIMPIEZA-INTEGRADOS-20261010), `--dry-run` en Mission Control, `adopt`, escribir solo los proyectados que cambian en la CLI (hoy reescribe todos y así sigue), el `.gitignore` raíz de un proyecto consumidor.
- Diseño:
  - Resumen de cambios: por archivo, estado `nuevo` | `cambia` | `igual` con `+N −M` líneas, contado como diferencia de multiconjuntos de líneas (sin dependencia nueva, sin diff unificado).
  - Respaldo: una sola carpeta por corrida, `.valmen/backups/sync/<AAAAMMDDTHHMMSSZ>/` (sufijo `-2`, `-3` si ya existe), creada solo al primer archivo que cambia; dentro, cada archivo en su ruta relativa con `manifiesto.json` (`{ creado, origen: "cli" | "mission-control", archivos: [{ ruta, sha256, bytes }] }`). Se escribe con `atomicWrite` (`packages/core/src/fs.ts:105`), así que el modo pregunta lo niega igual que la proyección.
  - No versionado: línea `.valmen/backups/` en el `.gitignore` del harness; además, al crear la carpeta se escribe `.valmen/backups/.gitignore` con `*`, que la oculta en cualquier proyecto consumidor sin tocar su `.gitignore` raíz.
  - Orden: respaldo de cada copia publicada justo antes de pisarla; respaldo de cada proyectado que difiere, con el manifiesto cerrado, **antes** del primer `atomicWrite` de la proyección. Si el respaldo falla, `sync` sale con error sin escribir la proyección.
  - `--dry-run` no llama a `instalarPublicadas`: lista las copias publicadas que escribiría (`escriturasDePublicadas`, lectura pura) con los proyectados que cambian según la copia actual; sale con 0; es excluyente con `--check`.
- Tamaño previsto: 19 criterios; unas 245 líneas de producción con unas 260 de pruebas (≈ 505, dentro de 300–700). Si la implementación pasa de 700, se parte: (A) C1–C7 vista previa; (B) C8–C19 respaldo con no versionado.
- Pasos ordenados:
  1. `packages/adapter/src/sync-backup.ts` (nuevo): `resumenDeCambios(anterior: string | null, nuevo: string)` → `{ estado, anadidas, quitadas }`; `crearRespaldo(root, { ahora, origen })` → `{ guardar(rutaRelativa, contenido), cerrar(): string | null }` que crea la carpeta al primer `guardar`, escribe `manifiesto.json` con sha256 (`node:crypto`) al `cerrar`, con `.valmen/backups/.gitignore`; exportarlo en `packages/adapter/src/index.ts` (C1, C8, C9, C12, C13, C18).
  2. `packages/adapter/src/skills.ts:712` (`instalarPublicadas`): extraer `escriturasDePublicadas(root, dir)` → `{ ruta, contenido, anterior }[]` (solo lectura, misma comparación de `:717` con `:733`); `instalarPublicadas(root, dir, opciones?)` la recorre con `opciones.antesDeSobrescribir?.(ruta, anterior)` antes de cada `writeFileSync` (`:720`, `:735`) cuando `anterior !== null`. La firma de dos argumentos sigue válida (C4, C5, C14).
  3. `packages/cli/src/commands.ts:924` (`syncProject`): cuarto parámetro opcional `opciones: { dryRun?: boolean; ahora?: Date } = {}`. Rama `dryRun` (antes de `:933`): sin `instalarPublicadas`, arma con `escriturasDePublicadas` con `projectFiles` una línea por archivo `nuevo` o `cambia` con su `+N −M`, cierra con «Simulación: no se escribió nada» y devuelve `ok` (C1, C2, C3, C4, C5, C6). Rama de escritura (`:1005-1007`): `crearRespaldo`, `instalarPublicadas` con `antesDeSobrescribir` → `guardar`, `guardar` de cada proyectado cuyo disco difiere, `cerrar()` antes de escribir, línea `  respaldo                 <carpeta>` en la salida cuando hay carpeta (C8, C10, C11, C12, C13, C14). La rama `--check` (`:948-1002`) no cambia (C19).
  4. `packages/cli/src/command-table.ts:229`: `sync: { conValor: [], booleanas: ["--check", "--dry-run"] }`; `packages/cli/src/main.ts:1451-1456`: pasa `{ dryRun: flags["dry-run"] === true }` con error de uso (`EXIT_USAGE`) si llegan `--check` con `--dry-run`; añadir `--dry-run` a la línea de `sync` en `USAGE` (C6, C7).
  5. `packages/server/src/config.ts:292` (`syncProjections`): `crearRespaldo(root, { origen: "mission-control" })`, `guardar` de cada archivo con `enDisco !== null` que difiere (`:311-320`), `cerrar()` antes del primer `atomicWrite` (`:322`); `SyncOutcome` (`:274-282`) gana `backup: string | null` (C15). `packages/server/src/server.ts:1969` no cambia: propaga el campo con `...resultado`.
  6. `.gitignore`: bloque comentado con `.valmen/backups/` junto a `.valmen/state/` (C17).
  7. Pruebas en `tests/sync-respaldo.test.ts`, escritas **antes** de los pasos 1–6 con observadas en rojo, sobre un proyecto temporal (`adoptProject` + `syncProject` como `tests/skills-publicadas.test.ts:70-73`) con la CLI por `run([...])` de `packages/cli/src/main.ts`: una prueba parametrizada (`it.each`) por regla —R-SYN-001 (C1–C7), R-SYN-002 (C8–C15), R-SYN-003 (C17, C18; C18 con `git init` temporal con `git status --porcelain`)— con una de regresión para `valmen sync --check` (C19). C16 compila con `npx tsc --build tsconfig.build.json`.
- Pruebas existentes que el cambio pone en rojo a propósito (EST-009): ninguna prevista. `tests/config-view.test.ts:215-290` compara `written`/`unchanged` por campo, no el objeto entero, y la firma de `syncProject`/`instalarPublicadas` no cambia para sus llamadas actuales. Si alguna cae, se detiene la implementación y se reporta aquí.
- Impactos declarados: ninguno (sin sincronización de datos, migración ni contenedores; `sync` es la proyección local de `.valmen/`).
- Rollback (obligatorio): revertir el commit del ticket; las carpetas de `.valmen/backups/` ya creadas quedan ignoradas por su propio `.gitignore` y se borran a mano o con el comando del ticket dependiente. No hay datos ni formatos versionados que migrar.

<!-- Los criterios de la sección siguiente se numeran C1…Cn, con una afirmación verificable por criterio
     —una frase con «y» son dos criterios—, y cada uno lleva debajo su anotación de
     verificación: un comentario HTML que dice «test:» y el comando, o «verify: manual». La
     sección no lleva comentarios dentro: un comentario con anotación se leería como la de un
     criterio. Ejemplo en la skill planificacion. -->
## Criterios de aceptación

- [x] C1. (R-SYN-001) `valmen sync --dry-run` nombra `AGENTS.md` desactualizado con su resumen `+N −M`.
      <!-- test: npx vitest run tests/sync-respaldo.test.ts -->
- [x] C2. (R-SYN-001) `valmen sync --dry-run` deja `AGENTS.md` en disco byte a byte igual.
      <!-- test: npx vitest run tests/sync-respaldo.test.ts -->
- [x] C3. (R-SYN-001) `valmen sync --dry-run` sale con código 0 cuando hay proyecciones desactualizadas.
      <!-- test: npx vitest run tests/sync-respaldo.test.ts -->
- [x] C4. (R-SYN-001) `valmen sync --dry-run` nombra la copia de una skill publicada que reinstalaría.
      <!-- test: npx vitest run tests/sync-respaldo.test.ts -->
- [x] C5. (R-SYN-001) `valmen sync --dry-run` deja igual la copia editada de una skill publicada en `.valmen/skills/`.
      <!-- test: npx vitest run tests/sync-respaldo.test.ts -->
- [x] C6. (R-SYN-001) `valmen sync --dry-run` no crea `.valmen/backups/`.
      <!-- test: npx vitest run tests/sync-respaldo.test.ts -->
- [x] C7. (R-SYN-001) `valmen sync --check --dry-run` sale con error de uso.
      <!-- test: npx vitest run tests/sync-respaldo.test.ts -->
- [x] C8. (R-SYN-002) `valmen sync` copia la versión editada a mano de `.claude/skills/feature/SKILL.md` a `.valmen/backups/sync/<marca>/.claude/skills/feature/SKILL.md`.
      <!-- test: npx vitest run tests/sync-respaldo.test.ts -->
- [x] C9. (R-SYN-002) El `manifiesto.json` del respaldo registra el sha256 de la versión editada.
      <!-- test: npx vitest run tests/sync-respaldo.test.ts -->
- [x] C10. (R-SYN-002) La salida de `valmen sync` nombra la carpeta del respaldo.
      <!-- test: npx vitest run tests/sync-respaldo.test.ts -->
- [x] C11. (R-SYN-002) Tras el respaldo, `.claude/skills/feature/SKILL.md` queda con el contenido proyectado.
      <!-- test: npx vitest run tests/sync-respaldo.test.ts -->
- [x] C12. (R-SYN-002) `valmen sync` sobre un proyecto al día no crea carpeta de respaldo.
      <!-- test: npx vitest run tests/sync-respaldo.test.ts -->
- [x] C13. (R-SYN-002) `valmen sync` no respalda un archivo proyectado que no existía en disco.
      <!-- test: npx vitest run tests/sync-respaldo.test.ts -->
- [x] C14. (R-SYN-002) `valmen sync` respalda la copia editada de una skill publicada antes de reinstalarla.
      <!-- test: npx vitest run tests/sync-respaldo.test.ts -->
- [x] C15. (R-SYN-002) `syncProjections` de Mission Control respalda un archivo proyectado editado a mano.
      <!-- test: npx vitest run tests/sync-respaldo.test.ts -->
- [x] C16. El monorepo compila con los cambios.
      <!-- test: npx tsc --build tsconfig.build.json -->
- [x] C17. (R-SYN-003) `git check-ignore` reconoce `.valmen/backups/sync/` en el repositorio del harness.
      <!-- test: npx vitest run tests/sync-respaldo.test.ts -->
- [x] C18. (R-SYN-003) Tras un `valmen sync` con respaldo en un repositorio git temporal sin reglas propias, `git status --porcelain` no lista `.valmen/backups/`.
      <!-- test: npx vitest run tests/sync-respaldo.test.ts -->
- [x] C19. `valmen sync --check` sigue saliendo con error ante un archivo generado editado a mano.
      <!-- test: npx vitest run tests/sync-respaldo.test.ts -->

## Puntos

```json
[]
```

## Implementación

- `packages/adapter/src/sync-backup.ts` (nuevo): `resumenDeCambios` (`+N −M` por multiconjunto de líneas), `crearRespaldo` (carpeta `.valmen/backups/sync/<AAAAMMDDTHHMMSSZ>[-n]`, creada al primer `guardar`, `.valmen/backups/.gitignore` con `*`, `manifiesto.json` con sha256 al `cerrar`); exportado en `packages/adapter/src/index.ts`.
- `packages/adapter/src/skills.ts`: `escriturasDePublicadas` (lectura pura) e `instalarPublicadas(root, dir, { antesDeSobrescribir })`; la firma anterior sigue válida.
- `packages/cli/src/commands.ts`: `syncProject(root, nombre, check, { dryRun, ahora })`; `vistaPreviaDeSync` (sin escribir, sale con 0) y respaldo antes del primer `atomicWrite`; si el respaldo falla, no se escribe la proyección. `--check` no cambia.
- `packages/cli/src/command-table.ts` y `packages/cli/src/main.ts`: `--dry-run`, excluyente con `--check` (código 2), y línea de `USAGE`.
- `packages/server/src/config.ts`: `syncProjections` respalda antes de escribir y `SyncOutcome.backup`; `server.ts` sin cambios.
- `.gitignore`: `.valmen/backups/`.
- Límite aceptado (Supuestos): `--dry-run` proyecta sobre la copia actual de `.valmen/skills/`; si una copia es inválida, la vista previa informa el error de proyección en lugar de simular.
- Pruebas existentes en rojo: ninguna (33 archivos relacionados en verde).

## Pruebas

- Directorio: raíz del repositorio (worktree). Ambiente: Node 24, `git` en el PATH.
- `npx vitest run tests/sync-respaldo.test.ts` — esperado: 12 pruebas en verde (C1–C15, C17–C19); observadas en rojo antes de implementar (9 de 12).
- `npx tsc --build tsconfig.build.json` — esperado: sin errores (C16); `npx tsc --noEmit -p .` sin errores.
- Regresión: 33 archivos de prueba que tocan `sync`, `instalarPublicadas`, la tabla de comandos o `USAGE` — 1045 pruebas en verde.
- Validaciones manuales: ninguna. Prueba a mano opcional: en un proyecto con `AGENTS.md` editado, `valmen sync --dry-run` y luego `valmen sync`.

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
[
  {
    "kind": "ai-usage",
    "date": "2026-10-11",
    "session_reference": null,
    "model": null,
    "reasoning_effort": null,
    "notes": "Subagente sonnet de implementación; la sesión no expone agregados de tokens, sin números.",
    "input_tokens": null,
    "output_tokens": null,
    "total_tokens": null,
    "estimated_cost_usd": null,
    "source": "manual:subagente-impl-sync-respaldo",
    "confidence": "low",
    "id": "CONSUMO-001"
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
    "at": "2026-10-10T21:47:34.051Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-11",
    "at": "2026-10-11T19:08:17.389Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-11",
    "at": "2026-10-11T19:10:56.805Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-11",
    "at": "2026-10-11T19:16:49.251Z",
    "action": "gate-approved",
    "actor": "cli",
    "details": "Gate plan aprobado por PO (recibo GR-20261011-FEATURE-CLI-SYNC-RESPALDO-20261010-plan-1, canal cli, decidida 2026-10-11T19:16:49.242Z): Aprobar tal cual (Recomendado)"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-11",
    "at": "2026-10-11T19:16:49.642Z",
    "action": "plan-approved",
    "actor": "cli",
    "details": "{\"actor\":\"PO\",\"source\":\"cli\",\"quote\":\"Aprobar tal cual (Recomendado)\",\"planHash\":\"sha256:4a3acc35edbb874c4f4cd20935ada0637103df498b9d211304dd46b34f4d92bf\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-11",
    "at": "2026-10-11T19:16:50.126Z",
    "action": "plan-approval-verified",
    "actor": "cli",
    "details": "Aprobación del plan vigente: PO (fuente cli), plan sha256:4a3acc35edbb874c4f4cd20935ada0637103df498b9d211304dd46b34f4d92bf."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-11",
    "at": "2026-10-11T19:16:50.126Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-10-11",
    "at": "2026-10-11T19:16:50.453Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-10-11",
    "at": "2026-10-11T19:26:08.020Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-10-11",
    "at": "2026-10-11T19:26:09.628Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  }
]
```
