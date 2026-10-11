---
schema_version: 2
id: FEATURE-CLI-LIMPIEZA-INTEGRADOS-20261010
title: Comando de limpieza de worktrees y respaldos con --confirm
type: FEATURE
module: CLI
workflow_status: in_progress
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

# FEATURE-CLI-LIMPIEZA-INTEGRADOS-20261010

## Solicitud original

Parte del sprint: Operar sync y la limpieza de forma reversible: vista previa, respaldo no versionado y limpieza con confirmación.
- R-LIM-001: Un comando de limpieza DEBE mostrar por defecto qué quitaría, sin quitar nada
- R-LIM-002: Solo con `--confirm` el comando DEBE quitar lo que la vista previa listó
- R-LIM-003: La limpieza NO DEBE tocar el registro ni nada sin integrar
Depende de: FEATURE-CLI-SYNC-RESPALDO-20261010.
Viene de una feature descompuesta en sprints; su plan completo está en el tickets.yaml de la feature.

Comportamiento esperado: Un comando de limpieza DEBE mostrar por defecto qué quitaría, sin quitar nada Solo con `--confirm` el comando DEBE quitar lo que la vista previa listó La limpieza NO DEBE tocar el registro ni nada sin integrar
Comportamiento actual: la spec no lo declara; se establece en el análisis, leyendo el código.

### Supuestos y decisiones pendientes

<!-- Si el pedido nombra algo que el código no tiene —parámetro, permiso,
campo, bandera, columna, migración— y no lo especifica, listá cada elemento
con su pregunta antes de avanzar a análisis; el análisis no planifica sobre
la adivinanza. Si no hay ninguno, escribí «Ninguno» y seguí. -->
El pedido nombra cuatro cosas que el código no tiene; se buscaron (`grep -rn -i 'retenc\|retention\|backups\|cleanup\|prune\|limpi' packages/*/src .valmen/config.yaml packages/cli/src/command-table.ts`) y no aparecen. Las cuatro quedaron **decididas por el PO el 2026-10-11** sobre el recibo GR-20261011-FEATURE-CLI-LIMPIEZA-INTEGRADOS-20261010-analysis-1, con sus palabras: «Aprobar y confirmar D1–D4 (Recomendado)» (EVENT-003). El plan usa cada propuesta tal como está escrita:

- D1. Retención de respaldos de `sync`: la spec dice «más viejos que la retención configurada», pero `.valmen/config.yaml` no tiene clave de retención y `packages/adapter/src/sync-backup.ts:21` solo fija la carpeta. Pregunta: ¿la clave es `backup-retention-days` en `.valmen/config.yaml`, con 30 días cuando falta o no es un entero positivo? Decidido: sí (PO, 2026-10-11, «Aprobar y confirmar D1–D4 (Recomendado)»).
- D2. Nombre del comando: la spec dice «un comando de limpieza» sin nombrarlo, y en la tabla de comandos (`packages/cli/src/command-table.ts`) no hay `cleanup`, `prune` ni `limpiar`. Pregunta: ¿se llama `valmen cleanup [--confirm] [--json]`, de primer nivel, fuera de `journey worktree`? Decidido: sí (PO, 2026-10-11, «Aprobar y confirmar D1–D4 (Recomendado)»); fuera de `journey worktree` porque `tests/worktree-cli.test.ts:52` fija sus subcomandos en `create, integrate, remove`.
- D3. Worktree de un ticket sin cerrar: un worktree recién creado (como este, en el mismo commit que `main` y limpio) cumple «commit en `main` y árbol limpio», y la regla literal lo quitaría en plena corrida. Pregunta: ¿se conserva con el motivo «ticket sin cerrar» todo worktree `ticket-<slug>` cuyo ticket del registro de `main` no está `closed`? Decidido: sí (PO, 2026-10-11, «Aprobar y confirmar D1–D4 (Recomendado)»).
- D4. Respaldo antes de quitar: el pedido exige operar «de forma reversible» y la spec no dice qué se respalda al limpiar. Pregunta: ¿basta un recibo `.valmen/backups/cleanup/<AAAAMMDDTHHMMSSZ>.json` (no versionado, bajo el `.gitignore` de `.valmen/backups/`) con carpeta, rama y commit de cada worktree quitado —se recupera con `git worktree add <carpeta> <commit>` o `git branch <rama> <commit>`— y el `manifiesto.json` de cada respaldo de `sync` borrado, sabiendo que el contenido del respaldo vencido no se conserva? Decidido: sí (PO, 2026-10-11, «Aprobar y confirmar D1–D4 (Recomendado)»).

## Descripción funcional

- Alcance: un comando de limpieza (nombre en D2) que, desde el checkout principal en `main`, lista y —solo con `--confirm`— quita los worktrees de `.claude/worktrees/` ya integrados en `main` y limpios, con su rama, y los respaldos de `.valmen/backups/sync/` más viejos que la retención (D1). Spec: `.valmen/features/operacion-entrega-harness/spec/s5-limpieza/spec.md` (R-LIM-001, R-LIM-002, R-LIM-003). Fuera de alcance: cambiar `journey worktree remove` (`quitarWorktree`), la lista cerrada de git de `journey worktree` (`packages/engine/src/worktree-git.ts`), los worktrees temporales de `qa-agent`, Mission Control, y cualquier ruta fuera de `.claude/worktrees/` y `.valmen/backups/sync/`.
- Usuario o rol afectado: el PO y el orquestador de la corrida, que hoy acumulan worktrees integrados y respaldos de `sync` (107 MB en `.claude/worktrees/` el 2026-10-10, según la spec).
- Comportamiento actual: solo existe `valmen journey worktree remove --id <ticket>` (`packages/cli/src/worktree.ts:88-89` → `quitarWorktree`, `packages/engine/src/worktree.ts:373`): de a uno, exige un identificador de ticket y solo admite carpetas `ticket-<slug>`; un worktree con otro nombre o en HEAD desacoplado (hoy `.claude/worktrees/practical-swartz-4e17c7`, `git worktree list --porcelain`) no lo quita nada, y los respaldos de `sync` no los borra nada.
- Comportamiento esperado: sin banderas, el comando lista cada worktree y cada respaldo como «se quitaría» (con su tamaño) o «se conserva» (con su motivo: árbol sucio, commits sin integrar, ticket sin cerrar), sale con 0 y deja el disco igual; con `--json` da lo mismo como JSON; con `--confirm` quita exactamente lo listado como quitable, informa cada elemento como quitado o con su error y deja un recibo de recuperación (D4); nunca toca el registro ni usa `--force`.

## Diagnóstico

- Causa comprobada (con `ruta:línea`): no hay comando de limpieza masiva. `quitarWorktree` (`packages/engine/src/worktree.ts:373-460`) deriva carpeta y rama solo de un `ticketId` (`nombresDeWorktree`, `packages/engine/src/worktree-git.ts:39`), exige `main` (`worktree.ts:382-391`), rama integrada con `merge-base --is-ancestor` (`:395-405`), árbol limpio (`:416-423`), y quita con `worktree remove` sin `--force` (`:425`) y `branch -d` (`:429`); luego libera el cupo de la máquina buscando la reserva por `ticketId` y `attemptId: "worktree"` (`:441-457`). La lista cerrada de git de los worktrees solo admite `remove` de una carpeta `ticket-<slug>` (`worktree-git.ts:22-23`, `:109`, `:117`) y `branch -d` de una rama `valmen/ticket-<slug>` (`:21`, `:91-96`), así que un worktree desacoplado o con otro nombre queda fuera de toda herramienta. Los respaldos se crean en `.valmen/backups/sync/<AAAAMMDDTHHMMSSZ>[-n]/` con `manifiesto.json` (`packages/adapter/src/sync-backup.ts:21`, `:73-98`, `:111-122`) y ningún código los borra.
- Hipótesis pendientes:
  - H1. El chequeo de árbol limpio no puede reutilizar `estadoDelArbolDeTrabajo` (`packages/engine/src/integration-commit.ts:72-89`): filtra el estado del harness (`ESTADO_DEL_HARNESS`, `:32-39`, `.valmen/journeys/`, `.valmen/executions/`…), y un worktree con solo esos cambios se listaría «limpio» contra R-LIM-003. Se comprueba con una prueba sobre un worktree con un `.valmen/journeys/` modificado, que debe salir «árbol sucio».
  - H2. `git worktree remove` sin `--force` acepta un worktree con `node_modules` y `dist/` ignorados (es lo que ya hace `quitarWorktree` en `tests/worktree-cli.test.ts:72`); se confirma con el laboratorio `tests/helpers/worktree-lab.ts`.
  - H3. El tamaño de un worktree se mide recorriendo la carpeta con `lstat` sin seguir enlaces; con `node_modules` clonado con `cp -Rc` (APFS) el número es el tamaño aparente, no lo que el disco libera de verdad. Se informa como «tamaño aparente».
- Consumidores afectados: la CLI (`packages/cli/src/main.ts` despacho y `USAGE`, `packages/cli/src/command-table.ts` banderas, que valida `tests/cli-tabla-comandos.test.ts`); el motor (`packages/engine/src/index.ts`) si la lógica vive allí; el cupo de la máquina (`packages/engine/src/machine-capacity.ts:118`, `releaseMachineCapacity`); la skill `corrida-orquestada` y el brief, que hoy mandan quitar con `journey worktree remove`, no cambian. `journey worktree` y su lista de git no se tocan: `tests/worktree-git.test.ts:78` exige que `remove /etc` siga rechazado y `tests/worktree-cli.test.ts:52` fija sus subcomandos.
- Archivos y flujo investigados: `packages/engine/src/worktree.ts` (`crearWorktree`, `quitarWorktree`, `worktreesRegistrados` `:89`, `ramaExiste`), `packages/engine/src/worktree-git.ts` (lista cerrada `motivoDeGitDeWorktree`, `exigirCheckoutPrincipal`), `packages/engine/src/integration-commit.ts` (`estadoDelArbolDeTrabajo`), `packages/engine/src/machine-capacity.ts`, `packages/adapter/src/sync-backup.ts`, `packages/cli/src/worktree.ts`, `packages/cli/src/command-table.ts:354`, `packages/cli/src/main.ts:1461` (`sync`), `.gitignore:10` (`.valmen/backups/` ya ignorado), `.valmen/config.yaml` (sin clave de retención), `tests/worktree-*.test.ts`, `tests/helpers/worktree-lab.ts`. Memoria: `buscar_memoria` sin resultados para limpieza de worktrees.
- Riesgos y compatibilidad:
  - Borrar es irreversible: dry-run por defecto, `--confirm` explícito, recibo de recuperación antes de quitar (D4) y nunca `--force`, `-D` ni `rm` fuera de `.valmen/backups/sync/<marca>/`.
  - Quitar un worktree en uso: uno recién creado está en el commit de `main` y limpio; sin D3 se quitaría en plena corrida. Un worktree de una sesión de Claude Code ajena al registro (nombre aleatorio, desacoplado) no se puede saber si está en uso: el comando se corre a mano, no en la jornada.
  - La lista cerrada de git propia de la limpieza amplía la autoridad de git solo para `worktree remove <carpeta bajo .claude/worktrees/>` sin `..` y `branch -d` de la rama del worktree (no `main`); no cambia la de `journey worktree`.
  - Compatibilidad: comando nuevo; `journey worktree remove` y `sync` siguen igual.
- Impactos de sync, migración, Docker o despliegue: ninguno. No toca sincronización de datos de clientes, migraciones, contenedores ni despliegue; solo borra copias locales no versionadas y worktrees ya integrados.

## Plan

- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan), el 2026-10-11 con «Aprobar tal cual (Recomendado)»; el REVIEW del recibo plan-1 (C6 y C8 en 0,90) lo decidió el PO.
- Alcance: comando nuevo `valmen cleanup [--confirm] [--json]` (D2) sobre los worktrees de `.claude/worktrees/` y los respaldos de `.valmen/backups/sync/`, con retención `backup-retention-days` (D1, 30 días por defecto), conservación de los worktrees de ticket sin cerrar (D3) y recibo de recuperación (D4). Fuera de alcance: `journey worktree` (`packages/cli/src/worktree.ts`, `quitarWorktree`), su lista cerrada (`packages/engine/src/worktree-git.ts`), los worktrees de `qa-agent`, Mission Control, la línea `backup-retention-days` en `.valmen/config.yaml` (la declara el orquestador en `main`, como `delivery-budget`; sin ella rige el defecto de 30).
- Diseño:
  - Seguridad: dry-run por defecto; solo `--confirm` quita. Nunca `--force`, `-f`, `-D` ni `--hard`. Solo se borra dentro de `.claude/worktrees/<nombre>` (con `git worktree remove`) o de `.valmen/backups/sync/<marca>` (con `rmSync` recursivo tras comprobar con `lstatSync` que no es un enlace y con `realpathSync` que su padre es `.valmen/backups/sync`). Corre solo desde el checkout principal en `main` (`exigirCheckoutPrincipal`, `packages/engine/src/worktree-git.ts`).
  - Clasificación de un worktree (de `git worktree list --porcelain`, solo los que caen bajo `<raíz>/.claude/worktrees/`), en este orden: «árbol sucio» si `git status --porcelain -uall` en el worktree devuelve cualquier línea, **sin** el filtro del harness de `estadoDelArbolDeTrabajo` (H1); «commits sin integrar» si `merge-base --is-ancestor <HEAD del worktree> main` falla; «ticket sin cerrar» si la carpeta es `ticket-<slug>` y un ticket del registro (`findAllTickets`, `packages/engine/src/discovery.ts:375`) con ese slug (`nombresDeWorktree`) no está `closed` (D3); si no, «se quitaría». Tamaño: suma de `lstat().size` sin seguir enlaces, informado como tamaño aparente (H3).
  - Clasificación de un respaldo: carpeta hija de `.valmen/backups/sync/` con nombre `^\d{8}T\d{6}Z(-\d+)?$`; su edad sale del nombre; «se quitaría» si supera `backup-retention-days`; si no, «se conserva: dentro de la retención». Otro nombre se ignora.
  - `--confirm`: recalcula la vista; escribe con `atomicWrite` el recibo `.valmen/backups/cleanup/<AAAAMMDDTHHMMSSZ>.json` (`{ creado, worktrees: [{ carpeta, rama, commit }], respaldos: [{ carpeta, manifiesto }] }`) **antes** del primer borrado (D4); por cada worktree quitable, `git worktree remove <carpeta>`, luego `git branch -d <rama>` si tenía rama, luego libera la reserva de cupo con `executionId` `worktree-<slug>` y `attemptId` `INTENTO_DE_WORKTREE` (`packages/engine/src/worktree.ts:48`, `releaseMachineCapacity`); por cada respaldo vencido, el borrado acotado. Cada elemento se informa «quitado» o con el error de git; si alguno falla, sale con 3 (`EXIT_INVARIANT`).
  - Lista cerrada propia de git (precedente: cabecera de `packages/engine/src/worktree-git.ts:1-10`): `worktree list --porcelain`, `status --porcelain -uall`, `rev-parse` (`--git-dir`, `--git-common-dir`, `--abbrev-ref HEAD`, `HEAD`), `merge-base --is-ancestor <ref> main`, `worktree remove .claude/worktrees/<un segmento sin ..>`, `branch -d <rama distinta de main>`. Rechaza antes de lanzar cualquier otra forma y toda bandera de fuerza.
- Tamaño previsto: 20 criterios; unas 360 líneas de producción con unas 300 de pruebas (≈ 660, dentro de 300–700). Si la implementación pasa de 700, se parte: (A) C1–C9 vista previa con la lista cerrada de git (C19); (B) C10–C18 `--confirm` con el recibo.
- Pasos ordenados:
  1. Pruebas primero, observadas en rojo: `tests/limpieza.test.ts` (nuevo) sobre el laboratorio git real `tests/helpers/worktree-lab.ts` (`crearLaboratorio`, que ya ignora `.claude/`), con la CLI por `run([...])` de `packages/cli/src/main.ts` y `--root` del laboratorio; un `describe` por regla —R-LIM-001 (C1–C9), R-LIM-002 (C10–C16), R-LIM-003 (C17–C19)—. Los worktrees se arman con `git worktree add` desde la prueba (integrado, sucio, sucio solo en `.valmen/journeys/`, desacoplado integrado, con un commit fuera de `main`, `ticket-<slug>` de un ticket `approved`); los respaldos con carpetas `.valmen/backups/sync/<marca>` fechadas por `ahora` inyectado. C14 usa un ejecutor de git que comprueba que el recibo existe al recibir el primer `worktree remove`. C19 llama directo a `motivoDeGitDeLimpieza`. (C1–C19)
  2. `packages/engine/src/limpieza-git.ts` (nuevo): `motivoDeGitDeLimpieza(argumentos)` con la lista cerrada del diseño; `ejecutarGitDeLimpieza(root, argumentos, ejecutor?)` que rechaza con `fail(…, EXIT_INVARIANT)` antes de lanzar. (C19)
  3. `packages/engine/src/limpieza.ts` (nuevo): `retencionDeRespaldos(root)` leyendo `backup-retention-days` como `topeDeEntrega` (`packages/engine/src/tamano-entrega.ts:56-71`), 30 por defecto (C4, C5); `vistaDeLimpieza({ paths, home?, git?, ahora? })` → `{ worktrees, respaldos }` con `{ ruta, rama, commit, bytes, accion: "quitar" | "conservar", motivo }` (C1–C9, C17, C18); `aplicarLimpieza(…)` con recibo, quitado acotado, liberación de cupo e informe por elemento (C10–C16). Exportarlos en `packages/engine/src/index.ts`.
  4. `packages/cli/src/limpieza.ts` (nuevo): `cleanupCommand(paths, flags, opciones)` que imprime una línea por elemento («se quitaría (N bytes, tamaño aparente)», «se conserva: <motivo>», «quitado», «error: …»), cierra la vista previa con «Vista previa: no se quitó nada; repite con --confirm para quitarlo.», da JSON con `--json`, y sale con 0, o con 3 si un elemento falló (C1–C3, C7, C9, C16).
  5. `packages/cli/src/command-table.ts`: entrada `cleanup: { conValor: [], booleanas: ["--confirm", "--json"] }`; `packages/cli/src/main.ts`: rama `case "cleanup"` en el despacho (junto a `case "sync"`, `:1461`) con la línea `cleanup [--confirm] [--json]` en `USAGE`. (C20)
  6. Verde: `npx vitest run tests/limpieza.test.ts tests/cli-tabla-comandos.test.ts tests/worktree-cli.test.ts tests/worktree-git.test.ts tests/worktree-integracion.test.ts` con `npx tsc --build tsconfig.build.json`; refactor con las pruebas en verde. (C1–C20)
- Pruebas existentes que el cambio pone en rojo a propósito (EST-009): ninguna. `journey worktree` no se toca: `tests/worktree-cli.test.ts:52` (subcomandos `create, integrate, remove`) con `tests/worktree-git.test.ts:78` (`remove /etc` rechazado) siguen igual; `tests/cli-tabla-comandos.test.ts` (C1–C8) exige la entrada en la tabla, el despacho, la línea de `USAGE`, que el paso 5 agrega.
- Impactos declarados: ninguno (sin sincronización de datos, migración ni contenedores; borra solo worktrees integrados con copias locales no versionadas).
- Rollback (obligatorio): revertir el commit del ticket quita el comando sin efecto sobre el registro. Lo ya borrado con `--confirm` se recupera desde el recibo `.valmen/backups/cleanup/<marca>.json`: `git worktree add <carpeta> <commit>` o `git branch <rama> <commit>` (los commits están en `main`); el contenido de un respaldo de `sync` vencido no se recupera (D4), solo su manifiesto.

<!-- Los criterios de la sección siguiente se numeran C1…Cn, con una afirmación verificable por criterio
     —una frase con «y» son dos criterios—, y cada uno lleva debajo su anotación de
     verificación: un comentario HTML que dice «test:» y el comando, o «verify: manual». La
     sección no lleva comentarios dentro: un comentario con anotación se leería como la de un
     criterio. Ejemplo en la skill planificacion. -->
## Criterios de aceptación

- [ ] C1. (R-LIM-001) `valmen cleanup` sin banderas lista un worktree integrado limpio como «se quitaría» con su tamaño en bytes.
      <!-- test: npx vitest run tests/limpieza.test.ts -->
- [ ] C2. (R-LIM-001) `valmen cleanup` sin banderas lista un worktree con un archivo sin commitear como «se conserva: árbol sucio».
      <!-- test: npx vitest run tests/limpieza.test.ts -->
- [ ] C3. (R-LIM-001) `valmen cleanup` sin banderas lista como «se conserva: árbol sucio» un worktree cuyo único cambio está en `.valmen/journeys/`.
      <!-- test: npx vitest run tests/limpieza.test.ts -->
- [ ] C4. (R-LIM-001) Sin `backup-retention-days` en la configuración, un respaldo de `sync` de 31 días se lista como «se quitaría».
      <!-- test: npx vitest run tests/limpieza.test.ts -->
- [ ] C5. (R-LIM-001) Con `backup-retention-days: 7`, un respaldo de `sync` de 3 días se lista como «se conserva: dentro de la retención».
      <!-- test: npx vitest run tests/limpieza.test.ts -->
- [ ] C6. (R-LIM-001) `valmen cleanup` sin banderas deja la salida de `git worktree list --porcelain` igual a la de antes.
      <!-- test: npx vitest run tests/limpieza.test.ts -->
- [ ] C7. (R-LIM-001) `valmen cleanup` sin banderas sale con código 0.
      <!-- test: npx vitest run tests/limpieza.test.ts -->
- [ ] C8. (R-LIM-001) `valmen cleanup` sin banderas deja igual la lista de carpetas de `.valmen/backups/sync/`.
      <!-- test: npx vitest run tests/limpieza.test.ts -->
- [ ] C9. (R-LIM-001) `valmen cleanup --json` devuelve un JSON cuyos elementos de `worktrees` traen los campos `ruta`, `accion`, `motivo`, `bytes`.
      <!-- test: npx vitest run tests/limpieza.test.ts -->
- [ ] C10. (R-LIM-002) `valmen cleanup --confirm` quita un worktree desacoplado cuyo commit es alcanzable desde `main`.
      <!-- test: npx vitest run tests/limpieza.test.ts -->
- [ ] C11. (R-LIM-002) `valmen cleanup --confirm` borra la rama del worktree integrado que quitó.
      <!-- test: npx vitest run tests/limpieza.test.ts -->
- [ ] C12. (R-LIM-002) `valmen cleanup --confirm` libera el cupo de la máquina que reservaba el worktree quitado.
      <!-- test: npx vitest run tests/limpieza.test.ts -->
- [ ] C13. (R-LIM-002) `valmen cleanup --confirm` borra la carpeta del respaldo de `sync` vencido.
      <!-- test: npx vitest run tests/limpieza.test.ts -->
- [ ] C14. (R-LIM-002) El recibo `.valmen/backups/cleanup/<marca>.json` ya existe cuando git recibe el primer `worktree remove`.
      <!-- test: npx vitest run tests/limpieza.test.ts -->
- [ ] C15. (R-LIM-002) El recibo registra el commit de cada worktree quitado.
      <!-- test: npx vitest run tests/limpieza.test.ts -->
- [ ] C16. (R-LIM-002) Un worktree que git se niega a quitar se informa con el error de git, con salida 3.
      <!-- test: npx vitest run tests/limpieza.test.ts -->
- [ ] C17. (R-LIM-003) `valmen cleanup --confirm` conserva un worktree limpio con un commit fuera de `main`, con el motivo «commits sin integrar».
      <!-- test: npx vitest run tests/limpieza.test.ts -->
- [ ] C18. (R-LIM-003) `valmen cleanup --confirm` conserva un worktree `ticket-<slug>` cuyo ticket no está `closed`, con el motivo «ticket sin cerrar».
      <!-- test: npx vitest run tests/limpieza.test.ts -->
- [ ] C19. (R-LIM-003) `motivoDeGitDeLimpieza` rechaza `--force`, `-f`, `-D`, una carpeta fuera de `.claude/worktrees/`, sin llamar al ejecutor de git.
      <!-- test: npx vitest run tests/limpieza.test.ts -->
- [ ] C20. Las pruebas existentes de la tabla de comandos, de `journey worktree`, pasan sin editarlas con `cleanup` agregado.
      <!-- test: npx vitest run tests/cli-tabla-comandos.test.ts tests/worktree-cli.test.ts tests/worktree-git.test.ts tests/worktree-integracion.test.ts -->

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
    "at": "2026-10-10T21:47:34.216Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-11",
    "at": "2026-10-11T19:40:34.750Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-11",
    "at": "2026-10-11T19:42:25.223Z",
    "action": "gate-approved",
    "actor": "cli",
    "details": "Gate analysis aprobado por PO (recibo GR-20261011-FEATURE-CLI-LIMPIEZA-INTEGRADOS-20261010-analysis-1, canal cli, decidida 2026-10-11T19:42:25.219Z): Aprobar y confirmar D1–D4 (Recomendado)"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-11",
    "at": "2026-10-11T19:44:23.199Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-11",
    "at": "2026-10-11T20:08:30.471Z",
    "action": "gate-approved",
    "actor": "cli",
    "details": "Gate plan aprobado por PO (recibo GR-20261011-FEATURE-CLI-LIMPIEZA-INTEGRADOS-20261010-plan-1, canal cli, decidida 2026-10-11T20:08:30.461Z): Aprobar tal cual (Recomendado)"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-11",
    "at": "2026-10-11T20:08:30.857Z",
    "action": "plan-approved",
    "actor": "cli",
    "details": "{\"actor\":\"PO\",\"source\":\"cli\",\"quote\":\"Aprobar tal cual (Recomendado)\",\"planHash\":\"sha256:b03184c43b2180bffce96acd3cdca9ae930d485bce330e80cf3e3eac6db27fbb\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-11",
    "at": "2026-10-11T20:08:31.363Z",
    "action": "plan-approval-verified",
    "actor": "cli",
    "details": "Aprobación del plan vigente: PO (fuente cli), plan sha256:b03184c43b2180bffce96acd3cdca9ae930d485bce330e80cf3e3eac6db27fbb."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-10-11",
    "at": "2026-10-11T20:08:31.363Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-10-11",
    "at": "2026-10-11T20:08:31.710Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  }
]
```
