---
schema_version: 2
id: FEATURE-CLI-LIMPIEZA-INTEGRADOS-20261010
title: Comando de limpieza de worktrees y respaldos con --confirm
type: FEATURE
module: CLI
workflow_status: analyzed
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
El pedido nombra cuatro cosas que el código no tiene; se buscaron (`grep -rn -i 'retenc\|retention\|backups\|cleanup\|prune\|limpi' packages/*/src .valmen/config.yaml packages/cli/src/command-table.ts`) y no aparecen. Cada una lleva una propuesta que el plan usa solo si el PO la confirma:

- D1. Retención de respaldos de `sync`: la spec dice «más viejos que la retención configurada», pero `.valmen/config.yaml` no tiene clave de retención y `packages/adapter/src/sync-backup.ts:21` solo fija la carpeta. Pregunta: ¿la clave es `backup-retention-days` en `.valmen/config.yaml`, con 30 días cuando falta o no es un entero positivo? Propuesta: sí.
- D2. Nombre del comando: la spec dice «un comando de limpieza» sin nombrarlo, y en la tabla de comandos (`packages/cli/src/command-table.ts`) no hay `cleanup`, `prune` ni `limpiar`. Pregunta: ¿se llama `valmen cleanup [--confirm] [--json]`, de primer nivel, fuera de `journey worktree`? Propuesta: sí; fuera de `journey worktree` porque `tests/worktree-cli.test.ts:52` fija sus subcomandos en `create, integrate, remove`.
- D3. Worktree de un ticket sin cerrar: un worktree recién creado (como este, en el mismo commit que `main` y limpio) cumple «commit en `main` y árbol limpio», y la regla literal lo quitaría en plena corrida. Pregunta: ¿se conserva con el motivo «ticket sin cerrar» todo worktree `ticket-<slug>` cuyo ticket del registro de `main` no está `closed`? Propuesta: sí.
- D4. Respaldo antes de quitar: el pedido exige operar «de forma reversible» y la spec no dice qué se respalda al limpiar. Pregunta: ¿basta un recibo `.valmen/backups/cleanup/<AAAAMMDDTHHMMSSZ>.json` (no versionado, bajo el `.gitignore` de `.valmen/backups/`) con carpeta, rama y commit de cada worktree quitado —se recupera con `git worktree add <carpeta> <commit>` o `git branch <rama> <commit>`— y el `manifiesto.json` de cada respaldo de `sync` borrado, sabiendo que el contenido del respaldo vencido no se conserva? Propuesta: sí.

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

- Gate de plan y aprobación:
- Pasos ordenados:
  <!-- Cada paso nombra archivo, símbolo o comando, y los criterios que cubre, por ejemplo
       «(C1, C2)». Un paso que no dice dónde ni con qué se toca no se puede ejecutar ni
       revisar, y la compuerta lo lee así. -->
  1.
  2.
- Impactos declarados:
  <!-- Una línea por cada impacto que el ticket declara, con las palabras de su proposición:
       sincronización (datos ya sincronizados y clientes que todavía no se actualizaron),
       migración (orden de aplicación y reversión) o contenedores (imagen y publicación). -->
- Rollback (obligatorio):

<!-- Los criterios de la sección siguiente se numeran C1…Cn, con una afirmación verificable por criterio
     —una frase con «y» son dos criterios—, y cada uno lleva debajo su anotación de
     verificación: un comentario HTML que dice «test:» y el comando, o «verify: manual». La
     sección no lleva comentarios dentro: un comentario con anotación se leería como la de un
     criterio. Ejemplo en la skill planificacion. -->
## Criterios de aceptación

- [ ] R-LIM-001: Un comando de limpieza DEBE mostrar por defecto qué quitaría, sin quitar nada
- [ ] R-LIM-002: Solo con `--confirm` el comando DEBE quitar lo que la vista previa listó
- [ ] R-LIM-003: La limpieza NO DEBE tocar el registro ni nada sin integrar

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
  }
]
```
