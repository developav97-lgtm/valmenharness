# s1 — Mensajes que nombran comandos que existen

Dominio de los mensajes de rechazo del CLI y del MCP. Hoy `fail()`
(`packages/core/src/errors.ts:45`) aparece 692 veces en `packages/*/src`, y unas
171 citan un comando con la forma `` `valmen <cmd>` `` como salida del bloqueo
(p. ej. `packages/engine/src/qa-policy-close.ts:58`,
`packages/engine/src/journey-wave.ts:198`, `packages/cli/src/commands.ts:1850`).
Nada comprueba que ese comando exista: la ayuda es texto libre (`USAGE`,
`packages/cli/src/main.ts:162-621`), el despacho es un `switch` más una cadena de
`if` (`main.ts:1362`, `:1681-2167`) y la única prueba de coherencia cruza las
banderas de la ayuda con `VALUE_OPTIONS` (`tests/cli.test.ts:202-216`). Además,
`parseArgs` acepta en silencio una bandera desconocida como booleana
(`main.ts:911`).

### Requirement: R-MSG-001 — El CLI DEBE declarar sus comandos y banderas en una tabla que use el despacho

Una tabla única nombra cada comando y subcomando con sus banderas (con valor o
booleanas). El despacho resuelve el comando contra esa tabla, y la prueba de
coherencia exige que todo comando de la tabla tenga despacho y que todo comando
que aparece en `USAGE` esté en la tabla.

#### Scenario: Comando en la ayuda sin despacho
- **GIVEN** un comando agregado a `USAGE` que no está en la tabla
- **WHEN** se corre `npx vitest run`
- **THEN** la prueba de coherencia falla nombrando el comando

### Requirement: R-MSG-002 — Una prueba DEBE comprobar que cada comando, bandera y herramienta MCP citados en un mensaje existen

La prueba recorre los literales de `packages/*/src` y las skills de
`.valmen/skills/` y `skills/`, extrae cada `` `valmen <cmd> [--bandera]` `` y
cada herramienta MCP citada entre comillas invertidas, y los compara con la
tabla de R-MSG-001 y con `DEFINICIONES` (`packages/mcp/src/tools.ts:305`). Lo
que no existe la hace fallar con el archivo y la línea. Reemplaza la prueba
particular de `tests/skill-corrida-orquestada.test.ts:36-66`.

#### Scenario: Mensaje con una bandera inventada
- **GIVEN** un `fail()` cuyo texto dice «corre `valmen qa-agent --forzar`» y `--forzar` no existe
- **WHEN** se corre la prueba
- **THEN** falla citando `ruta:línea` del mensaje y la bandera que no existe

#### Scenario: Herramienta MCP renombrada
- **GIVEN** una skill que cita `` `reanudar_tiket` ``
- **WHEN** se corre la prueba
- **THEN** falla nombrando la skill y la herramienta

### Requirement: R-MSG-003 — El CLI NO DEBE aceptar una bandera desconocida para el comando

Una bandera que la tabla no declara para ese comando es un error con código de
esquema, y el mensaje lista las banderas válidas del comando. Hoy se acepta
como booleana (`main.ts:911`) y el comando corre ignorándola.

#### Scenario: Bandera mal escrita
- **GIVEN** `valmen resume --idd FEATURE-X`
- **WHEN** se ejecuta
- **THEN** sale con código distinto de 0, dice que `--idd` no existe para `resume` y nombra `--id`

### Requirement: R-MSG-004 — Un mensaje de bloqueo que nombra una salida DEBE nombrar una que resuelva el bloqueo

Si un mensaje dice «corre X», correr X en ese estado saca del bloqueo. Lo
comprueba la medición de fricción (s3): un recorrido que sigue la salida
nombrada y sigue bloqueado se clasifica como callejón sin salida y se corrige el
mensaje o el comando.

#### Scenario: Salida que describe y no mueve
- **GIVEN** un rechazo que nombra un comando que solo informa el estado
- **WHEN** el recorrido de fricción corre ese comando y repite la operación
- **THEN** la operación sigue rechazada y el recorrido lo clasifica como callejón sin salida
