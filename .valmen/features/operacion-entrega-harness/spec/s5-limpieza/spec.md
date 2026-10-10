# s5 — Limpieza con vista previa

Dominio de lo que se acumula fuera del registro. El 2026-10-10,
`.claude/worktrees/` ocupaba 107 MB, con un worktree en HEAD desacoplado que no
sigue el patrón `ticket-<slug>`. Hoy solo existe
`valmen journey worktree remove --id` (`quitarWorktree`,
`packages/engine/src/worktree.ts:231-287`): de a uno, exige `main`, rama
integrada y árbol limpio, y usa `git worktree remove` sin `--force` y
`branch -d`. La lista cerrada de git admite `remove <carpeta>`
(`packages/engine/src/worktree-git.ts:76-77`). La referencia es
`review store-reset` de gentle-ai, que por defecto solo muestra
(`docs/trigger-rules.md`, `66bf3e1`).

### Requirement: R-LIM-001 — Un comando de limpieza DEBE mostrar por defecto qué quitaría, sin quitar nada

Lista los worktrees de `.claude/worktrees/` cuyo commit ya está en `main` y cuyo
árbol está limpio, y los respaldos de `sync` más viejos que la retención
configurada, con el espacio de cada uno. Lo que no quitaría se lista con su
motivo (cambios sin integrar, árbol sucio, rama no integrada). Tiene salida
`--json`.

#### Scenario: Vista previa
- **GIVEN** dos worktrees integrados y uno con cambios sin commitear
- **WHEN** se corre el comando sin banderas
- **THEN** lista los dos como quitables con su tamaño, el tercero como conservado por «árbol sucio», y el disco queda igual

### Requirement: R-LIM-002 — Solo con `--confirm` el comando DEBE quitar lo que la vista previa listó

Quita los worktrees con `git worktree remove` sin `--force` y borra su rama con
`branch -d`, libera el cupo de la máquina como `quitarWorktree`, y borra los
respaldos vencidos. Cada elemento se informa como quitado o con el error que lo
impidió.

#### Scenario: Worktree en HEAD desacoplado ya integrado
- **GIVEN** un worktree desacoplado cuyo commit es alcanzable desde `main` y está limpio
- **WHEN** se corre el comando con `--confirm`
- **THEN** el worktree se quita y la salida lo informa

### Requirement: R-LIM-003 — La limpieza NO DEBE tocar el registro ni nada sin integrar

Nunca borra `tickets/`, `.valmen/receipts/`, `.valmen/qa/`, eventos `.jsonl`,
`.valmen/delegations/` ni `.valmen/journeys/`; nunca usa `--force`; nunca quita
un worktree con cambios o commits que no estén en `main`.

#### Scenario: Worktree con commits sin integrar
- **GIVEN** un worktree limpio cuya rama tiene un commit que no está en `main`
- **WHEN** se corre el comando con `--confirm`
- **THEN** el worktree se conserva y la salida dice «commits sin integrar»
