# s1 — Vista previa y respaldo de `valmen sync`

Dominio de `syncProject` (`packages/cli/src/commands.ts:880`) y de
`syncProjections` de Mission Control (`packages/server/src/config.ts:292`,
`POST /api/config/sync` en `packages/server/src/server.ts:1877`). Hoy `sync`
sobrescribe con `atomicWrite` (`commands.ts:938-939`,
`packages/core/src/fs.ts:105`) sin guardar copia; `--check` no escribe, pero solo
lista rutas, sin diff, y no distingue una edición a mano de un cambio en la
fuente (`commands.ts:904-932`). Lo que escribe está en
`packages/adapter/src/projection.ts:165-199`.

### Requirement: R-SYN-001 — `valmen sync --dry-run` DEBE mostrar qué escribiría sin escribir nada

Lista cada archivo que crearía o cambiaría, con las líneas añadidas y quitadas,
y sale con 0. No instala las skills publicadas ni toca el disco.

#### Scenario: Proyección desactualizada
- **GIVEN** un proyecto con `AGENTS.md` desactualizado respecto de `.valmen/`
- **WHEN** se corre `valmen sync --dry-run`
- **THEN** la salida nombra `AGENTS.md` con su resumen de cambios y el archivo en disco queda igual

### Requirement: R-SYN-002 — `valmen sync` DEBE respaldar cada archivo que va a sobrescribir con contenido distinto

Antes de escribir, copia la versión en disco de cada archivo que cambia a
`.valmen/backups/sync/<marca de tiempo>/<ruta relativa>`, con un manifiesto de
rutas y sha256. Los archivos nuevos y los que no cambian no se respaldan. La
misma regla aplica a la sincronización desde Mission Control.

#### Scenario: Skill editada a mano
- **GIVEN** `.claude/skills/feature/SKILL.md` editado a mano
- **WHEN** se corre `valmen sync`
- **THEN** la versión editada queda en el respaldo con su sha256, la salida nombra la carpeta del respaldo y el archivo queda con la proyección

#### Scenario: Nada que cambiar
- **GIVEN** un proyecto al día
- **WHEN** se corre `valmen sync`
- **THEN** no se crea ninguna carpeta de respaldo

### Requirement: R-SYN-003 — La carpeta de respaldos NO DEBE versionarse

`.valmen/backups/` queda en `.gitignore`; un respaldo puede contener lo que una
persona editó a mano y no pidió commitear.

#### Scenario: Estado del repositorio tras un sync
- **GIVEN** un `sync` que creó un respaldo
- **WHEN** se corre `git status`
- **THEN** `.valmen/backups/` no aparece
