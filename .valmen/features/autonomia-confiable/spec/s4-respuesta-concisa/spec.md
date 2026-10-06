# S4 — Respuesta concisa

Pedido del PO: «si toca tomar una decision necesito que solo me devuelvan la
opcion en que afecta para poder decidir no una chorrera esto debe ser para todos
los proyectos que monten el harness». Lo que `valmen sync` proyecta tiene que
pedir respuestas cortas en cada cliente y cargar menos contexto fijo.

### Requirement: R-RESP-001 — El AGENTS.md proyectado DEBE abrir con el contrato de respuesta

`valmen sync` DEBE escribir, antes de las reglas del proyecto, una sección «Cómo
se responde» con estas reglas: la respuesta en la primera línea; largo según el
peso del pedido; decisiones como opciones con su efecto y una recomendación, en
cinco líneas o menos; sin tablas ni encabezados salvo para comparar datos; la
evidencia se cita, no se transcribe; diagnóstico, plan y pruebas van al ticket;
riesgo irreversible en una línea; se amplía solo lo que la persona pida. La
sección DEBE declarar que prevalece sobre modos de respuesta heredados.

#### Scenario: Proyecto adoptado
- **GIVEN** un proyecto adoptado sin regla de formato de respuesta
- **WHEN** corre `valmen sync`
- **THEN** su AGENTS.md abre con la sección «Cómo se responde» y `sync --check`
  la verifica

### Requirement: R-RESP-002 — sync DEBE generar para Claude Code un output style y activarlo sin pisar la configuración existente

`valmen sync` DEBE escribir `.claude/output-styles/valmen.md` con el contrato de
respuesta y DEBE activar `outputStyle` en `.claude/settings.json` por fusión,
conservando permisos y demás claves. `sync --check` DEBE comparar solo esa clave.

#### Scenario: settings.json con permisos propios
- **GIVEN** un `.claude/settings.json` con permisos escritos por la persona
- **WHEN** corre `valmen sync`
- **THEN** los permisos quedan intactos y `outputStyle` vale `valmen`

### Requirement: R-RESP-003 — sync DEBE mantener en CLAUDE.md un bloque gestionado corto que importe AGENTS.md

`valmen sync` DEBE crear o mantener en `CLAUDE.md` un bloque gestionado de diez
líneas o menos, con el contrato resumido, la precedencia sobre los CLAUDE.md de
directorios superiores y la importación de AGENTS.md. NO DEBE borrar ni
reescribir el contenido escrito a mano fuera del bloque.

#### Scenario: CLAUDE.md escrito a mano
- **GIVEN** un CLAUDE.md con notas de la persona y sin bloque gestionado
- **WHEN** corre `valmen sync`
- **THEN** las notas siguen ahí y el bloque gestionado aparece una sola vez

### Requirement: R-RESP-004 — Los agentes generados DEBEN pedir informes de diez líneas como máximo

Los agentes que genera `valmen sync` para Claude Code, Codex y OpenCode DEBEN
instruir un informe final de diez líneas como máximo: hallazgo, rutas y decisión
pendiente.

#### Scenario: Agente de Claude Code
- **GIVEN** un agente declarado en `.valmen/agents/`
- **WHEN** se proyecta a `.claude/agents/`
- **THEN** su instrucción incluye el límite del informe

### Requirement: R-RESP-005 — El AGENTS.md proyectado DEBE respetar un presupuesto de tamaño

`valmen sync` DEBE proyectar el «Por qué» de cada estándar en una línea, con el
texto completo en `.valmen/rules/`, y DEBE avisar cuando el AGENTS.md resultante
supera el presupuesto declarado por el proyecto. Las reglas de pantalla PUEDEN
proyectarse a las skills de interfaz en lugar de AGENTS.md.

#### Scenario: SaiOpenCloud
- **GIVEN** el AGENTS.md de SaiOpenCloud de 54 KB
- **WHEN** corre `valmen sync` con la proyección compacta
- **THEN** el resultado queda bajo el presupuesto y ninguna regla vigente se pierde

### Requirement: R-RESP-006 — Las herramientas MCP DEBEN devolver un resumen con el siguiente paso dentro del dato estructurado

`evaluar_compuerta` DEBE devolver un resumen —resultado, motivo, proposiciones en
banda, siguiente paso e id del recibo— en lugar del recibo completo, que DEBE
poder pedirse aparte. Toda herramienta que emite `structuredContent` DEBE llevar
ahí el siguiente paso, porque hay clientes que solo le pasan ese dato al modelo.

#### Scenario: Compuerta en revisión
- **GIVEN** una corrida de `analysis` que termina en `review`
- **WHEN** el cliente recibe la respuesta de `evaluar_compuerta`
- **THEN** el dato estructurado ocupa menos de un kilobyte y dice qué hacer

### Requirement: R-RESP-007 — Codex y OpenCode DEBERÍAN recibir la configuración de verbosidad que su cliente soporte

Cuando el cliente admite una opción de verbosidad en la configuración del
proyecto, `valmen sync` DEBERÍA fijarla en el valor bajo, sin pisar otras claves.

#### Scenario: Codex
- **GIVEN** una versión de Codex que admite `model_verbosity` en la configuración
  del proyecto
- **WHEN** corre `valmen sync`
- **THEN** `.codex/config.toml` declara la verbosidad baja
