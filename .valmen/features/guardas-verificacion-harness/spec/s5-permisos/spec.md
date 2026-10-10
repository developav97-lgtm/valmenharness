# s5 — Permisos denegados en la configuración de los agentes

Dominio de lo que `valmen sync` proyecta a los clientes. Hoy, para Claude Code,
`sync` solo fusiona `outputStyle` en `.claude/settings.json`
(`packages/adapter/src/claude-code.ts:26, 57-78`) y no escribe `permissions`,
`deny` ni `ask`; para Codex solo escribe la verbosidad en `.codex/config.toml`
(`packages/adapter/src/projection.ts:180-194`); los agentes de OpenCode llevan
solo `edit allow|deny` y `bash allow|ask` (`packages/adapter/src/agents.ts:204-221`).
Las listas de lo prohibido viven en el motor —archivos que no se commitean
(`packages/engine/src/integration-rules.ts:34-43`), git permitido
(`integration-rules.ts:87-133`)— y «Acciones que nunca se automatizan» es texto
en `AGENTS.md`. La ejecución autónoma lanza Claude Code con
`--permission-mode bypassPermissions` (`packages/engine/src/autonomous-run.ts:158-179`).

Este dominio toca seguridad: su ticket es de tipo SECURITY y lleva aprobación
humana.

### Requirement: R-PER-001 — `valmen sync` DEBE escribir en `.claude/settings.json` las reglas de denegación del harness

Deniega leer y editar rutas sensibles (las de `integration-rules.ts:34-43`:
`.env*`, credenciales, claves ssh, `*.pem`, `*.key`, `*.p12`, más `~/.ssh/**`) y
deniega los comandos que nunca se automatizan: `git push --force` y sus
variantes, `git reset --hard`, `git clean -f`, `git tag -d` y `git push --delete`.
Las rutas y comandos salen de una sola lista en código, la misma que usa el
motor.

#### Scenario: Primera proyección
- **GIVEN** un `.claude/settings.json` con solo `{"outputStyle":"valmen"}`
- **WHEN** se corre `valmen sync`
- **THEN** el archivo conserva `outputStyle` y gana `permissions.deny` con las reglas del harness

### Requirement: R-PER-002 — La proyección NO DEBE quitar ni reescribir reglas que la persona puso

Las reglas del harness se suman a las existentes, sin duplicarse, y una regla
`allow` de la persona que contradice una denegación se reporta en la salida de
`sync` sin borrarla. `.claude/settings.local.json` no se toca.

#### Scenario: Reglas propias en el archivo
- **GIVEN** un `.claude/settings.json` con `permissions.allow` y `permissions.deny` propios
- **WHEN** se corre `valmen sync` dos veces
- **THEN** las reglas propias quedan intactas y las del harness aparecen una sola vez

### Requirement: R-PER-003 — `sync --check` DEBE fallar si falta una regla de denegación del harness

#### Scenario: Regla borrada a mano
- **GIVEN** un proyecto sincronizado al que se le borró la denegación de `git reset --hard`
- **WHEN** se corre `valmen sync --check`
- **THEN** sale con código distinto de 0 y nombra la regla que falta

### Requirement: R-PER-004 — Para Codex y OpenCode la proyección DEBERÍA aplicar lo que el cliente admite y reportar el resto

Lo que el cliente no puede expresar se lista en la salida de `sync` y en
`valmen doctor` como no aplicado, con el cliente y la regla; nunca se informa
como aplicado.

#### Scenario: Cliente sin lista de denegación de rutas
- **GIVEN** un proyecto con el runtime `codex` activo
- **WHEN** se corre `valmen sync`
- **THEN** la salida dice qué reglas no pudo aplicar a Codex

### Requirement: R-PER-005 — Una prueba DEBE comprobar que la denegación se cumple con `bypassPermissions`

La ejecución autónoma corre Claude Code con `bypassPermissions`. Antes de
cerrar el ticket se verifica, con la versión de Claude Code instalada, que una
regla `deny` del `settings.json` del proyecto sigue bloqueando en ese modo; si no
bloquea, el ticket lo documenta y la ejecución autónoma deja de usar ese modo o
pasa las denegaciones por otra vía.

#### Scenario: Comando denegado en modo autónomo
- **GIVEN** el `settings.json` proyectado y una sesión con `--permission-mode bypassPermissions`
- **WHEN** el agente intenta `git reset --hard`
- **THEN** el intento queda bloqueado, o el ticket registra que no lo estuvo y qué se cambió
