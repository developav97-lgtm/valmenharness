---
schema_version: 2
id: SECURITY-ADAPTER-DENEGADOS-CODEX-OPENCODE-20261010
title: Proyección de denegaciones a Codex y OpenCode con reporte del resto
type: SECURITY
module: ADAPTER
workflow_status: awaiting_user_tests
qa_status: pending
release_status: unreleased
user_visible: false
sync_impact: false
migration_impact: false
docker_impact: false
risk_level: normal
created: 2026-10-10
updated: 2026-10-10
related_ticket: null
target_release: null
released_in: null
---

# SECURITY-ADAPTER-DENEGADOS-CODEX-OPENCODE-20261010

## Solicitud original

Parte del sprint: Los permisos de los agentes niegan lo que nunca se automatiza, desde una sola lista proyectada por valmen sync.
- R-PER-004: Para Codex y OpenCode la proyección DEBERÍA aplicar lo que el cliente admite y reportar el resto
Depende de: SECURITY-CLI-PROYECCION-DENEGADOS-20261010.
Viene de una feature descompuesta en sprints; su plan completo está en el tickets.yaml de la feature.

Comportamiento esperado: Para Codex y OpenCode la proyección DEBERÍA aplicar lo que el cliente admite y reportar el resto
Comportamiento actual: la spec no lo declara; se establece en el análisis, leyendo el código.

### Supuestos y decisiones pendientes

<!-- Si el pedido nombra algo que el código no tiene —parámetro, permiso,
campo, bandera, columna, migración— y no lo especifica, listá cada elemento
con su pregunta antes de avanzar a análisis; el análisis no planifica sobre
la adivinanza. Si no hay ninguno, escribí «Ninguno» y seguí. -->
Ninguno.

## Descripción funcional

- Alcance: lo que `valmen sync` proyecta para los runtimes `codex` y `opencode` a partir de la lista única de core (`SENSITIVE_PATH_GLOBS` y `DENIED_GIT_COMMANDS`, `packages/core/src/denied.ts:45-78`): las denegaciones que cada cliente admite, escritas en su archivo, y la lista de las que no admite, con cliente y regla, en la salida de `valmen sync` y de `valmen doctor`. Fuera: Claude Code (ya hecho en SECURITY-CLI-PROYECCION-DENEGADOS-20261010), la configuración de usuario de cada cliente (`~/.codex/`, `~/.config/opencode/`) y los archivos reales de cualquier checkout.
- Usuario o rol afectado: la persona que corre `valmen sync` o `valmen doctor` en un proyecto con los runtimes `codex` u `opencode`, y los agentes de Codex y OpenCode de ese proyecto, incluida la ejecución autónoma (`packages/engine/src/autonomous-run.ts:164-174`).
- Comportamiento actual: para Codex, `sync` solo fusiona `model_verbosity` en `.codex/config.toml` (`packages/adapter/src/projection.ts:193-206`, `packages/adapter/src/verbosity.ts:39-53`) y los agentes llevan solo `sandbox_mode` (`packages/adapter/src/agents.ts:190`); para OpenCode no se escribe ninguna configuración de proyecto y los agentes llevan solo `edit: allow|deny` y `bash: allow|ask` (`agents.ts:212-214`). Ninguna regla de la lista llega a esos clientes y nada dice que no llegó: la línea de permisos de `sync` solo existe para Claude Code (`packages/cli/src/commands.ts:990-996`) y `doctor` no mira permisos (`packages/cli/src/setup.ts:512-800`).
- Comportamiento esperado: tras `sync`, Codex recibe como reglas `forbidden` las formas de git que su motor de reglas puede expresar; OpenCode recibe las denegaciones de lectura, edición y comandos en su configuración de proyecto y en cada agente proyectado; y toda regla de la lista que un cliente no puede expresar sale como «no aplicada» con el cliente y la regla en `sync` y en `doctor`, nunca como aplicada.

## Diagnóstico

- Causa comprobada (con `ruta:línea`): requisito nuevo sin defecto previo (AP-005, `.valmen/memory/aprendizajes.md:41`); el hueco está medido. (1) `projectFiles` solo trata permisos para `claude` (`packages/adapter/src/projection.ts:175-191`, `:233-237`); para `codex` arma solo `mergeCodexVerbosity` (`:194-206`) y para `opencode` nada fuera de agentes y skills (`:212-213`). (2) `renderCodexAgent` escribe `sandbox_mode` (`agents.ts:190`) y `renderOpencodeAgent` `permission.edit` y `permission.bash` sin patrones (`agents.ts:212-214`). (3) `Projection` no tiene dónde decir qué no se aplicó (`projection.ts:94-126`): solo `claudeDenyMissing` y `warnings`. (4) `codex.ts` y `opencode.ts` del adaptador son lectores de sesiones (`packages/adapter/src/codex.ts:1-7`, `packages/adapter/src/opencode.ts:1-8`) y su perfil de capacidades no trata permisos (`capabilities.ts:10-15`): no son el lugar de la proyección.
- Evidencia de lo que admite Codex, con la versión instalada, Codex CLI 0.160.1 (`/Applications/ChatGPT.app/Contents/Resources/codex-cli/codex-package.json`; no está en el PATH: `codex` no se encuentra), en repositorios temporales del directorio de trabajo de la sesión, sin tocar `~/.codex`:
  - Comandos: reglas `prefix_rule(pattern=[…], decision="forbidden")` en `<repo>/.codex/rules/*.rules`, que solo cargan si la capa `.codex/` del proyecto es de confianza (documentación «Rules», learn.chatgpt.com/docs/agent-configuration/rules; `codex exec --help` trae además `--ignore-rules`). `codex execpolicy check -r valmen.rules`: deniegan `git reset --hard`, `git reset --hard HEAD`, `git push --force origin main`, `git clean -f` y `git tag -d v1`; no casan `git reset HEAD --hard`, `git -C . reset --hard`, `git push origin main --force`, `git push origin +main` ni `git clean -fd`: el patrón es un prefijo exacto de argumentos, sin comodines, así que la bandera tras otros argumentos, las opciones globales de git y el refspec `+` no se pueden expresar. Corridas reales con `codex exec`, `model_reasoning_effort="low"`, `--json --ephemeral` y la confianza pasada con `-c projects=…` (sin escribir la configuración del usuario): con `-a never --sandbox workspace-write` (la forma de `autonomous-run.ts:167`), `git reset --hard` quedó «rejected: valmen: nunca se automatiza»; con `--dangerously-bypass-approvals-and-sandbox`, `git reset --hard` y `git push --force origin main` también quedaron rechazados; Codex separa `zsh -lc '…'` antes de comparar.
  - Lectura y edición: solo con un perfil de permisos (`default_permissions` y `[permissions.<nombre>.filesystem]` con `"**/.env" = "deny"`, documentación «Permissions», en beta). `codex sandbox -P valmen -- cat .env`: «Operation not permitted» para `.env`, «sub/.env.local», `cert.pem` y para `echo X >> sub/.env.local`; `a.txt` se lee. Corrida real con el perfil del proyecto: `cat .env` y `cat sub/.env.local` bloqueados, y `apply_patch` sobre «sub/.env.local» falló con «Operation not permitted». Pero el perfil se pierde cuando una capa más alta fija `sandbox_mode`: `codex debug prompt-input` con `-c sandbox_mode="workspace-write"` (lo que hace `--sandbox workspace-write` de la ejecución autónoma) o `"danger-full-access"` ya no trae «Denied filesystem reads», y la corrida con `--sandbox workspace-write` leyó `.env` (`SECRETO_DE_PRUEBA=1`); con `--dangerously-bypass-approvals-and-sandbox` también lo leyó. El perfil del proyecto, en cambio, sí ganó al `sandbox_mode = "danger-full-access"` de la configuración del usuario. Además el perfil `:workspace` deja `.git` sin escritura: `git -C . reset --hard` falló con «Unable to create '.git/index.lock': Operation not permitted», así que proyectar un perfil impediría a Codex commitear en el proyecto.
  - Agentes: la documentación de subagentes dice que heredan el sandbox de la sesión y que su TOML admite `sandbox_mode`; no menciona `default_permissions`. La presencia de `.codex/agents/*.toml` con `sandbox_mode` no cambia el perfil de la sesión principal (`prompt-input` con el archivo: sigue «Denied filesystem reads»).
- Evidencia de lo que admite OpenCode, con la versión instalada, OpenCode 2.0.16 (`opencode --version`), en repositorios temporales, con `opencode run --standalone --auto --format json` y el modelo por defecto del usuario:
  - Formato: `permission` con `read`, `edit` y `bash` como objetos patrón → `allow|ask|deny`, la última regla que casa gana, `*` casa cualquier texto incluida `/`, y `--auto` aprueba lo que no esté denegado explícitamente (documentación opencode.ai/docs/permissions). La 2.0.16 migra `bash` a la acción `shell` y el objeto a una lista de reglas (`opencode debug config`). Carga `opencode.json` de la raíz y «.opencode/opencode.json», y este va después: con `deny` en la raíz y `allow` en «.opencode/opencode.json», `git reset --hard .` se ejecutó; al revés, se denegó.
  - Comandos: con `git reset --hard*`, `git * reset --hard*` y `git push * --force*`, quedaron denegados `git reset --hard`, `git -C . reset --hard`, `git status && git reset --hard` y `git push origin main --force`; se ejecutó `/usr/bin/git reset --hard`. `cat sub/.env.local` por bash se ejecutó: las reglas de rutas no ven el bash.
  - Lectura y edición: `**/.env` no casa la ruta relativa `.env` (el `read` de `.env` se ejecutó); con `.env`, `*/.env`, `.env.*` y `*/.env.*` quedaron denegados `read` de `.env` relativo y absoluto, de «sub/.env.local» y el `edit` de «sub/.env.local». Por defecto la 2.0.16 deja `read` de `*.env` y `*.env.*` en `ask` (`opencode debug agents`), que `--auto` aprueba.
  - Agentes: un agente propio (`.opencode/agents/*.md`) sin bloque `permission` no heredó las denegaciones de `read` ni de `edit` del proyecto (leyó `.env` y editó «sub/.env.local») y sí las de `bash`; con la forma que proyecta hoy el harness (`edit: allow`, `bash: allow`) se ejecutó todo, `git reset --hard` incluido; con las denegaciones en su propio bloque (`"*": allow` y los patrones después) quedó todo denegado y `git status` se ejecutó.
- Modelo de amenaza. Codex, con lo que el plan aplica: evita que un agente ejecute por costumbre las formas canónicas de git prohibidas, también en la ejecución autónoma y con `--dangerously-bypass-approvals-and-sandbox`. No evita: la bandera tras otros argumentos, `git -C`, `-fd`, el refspec `+`, comillas, ruta absoluta o intérprete; un proyecto no confiado en Codex o `--ignore-rules` (no cargan las reglas); la lectura o edición de credenciales, que exige un perfil de permisos (decisión del plan). OpenCode: evita leer y editar credenciales con sus herramientas y ejecutar las formas prohibidas con sus variantes de opciones globales y compuestos, también con `--auto`. No evita: leer credenciales por bash (`cat`), ruta absoluta del binario, intérprete, agentes propios de la persona (no heredan `read` ni `edit`), ni un agente que edite «.opencode/opencode.json» para quitarse reglas.
- Hipótesis pendientes: H1, `~/.ssh/*` en OpenCode y `~/.ssh` en Codex no se ejercitaron, para no leer claves reales. H2, el refspec `+` en OpenCode (`git push * +*`) no se ejercitó; con la semántica documentada de `*` casa. H3, un subagente de Codex con `sandbox_mode` en su TOML pierde un perfil de permisos de la sesión: lo sugiere la documentación de perfiles y no se comprobó; solo importa si se proyecta un perfil.
- Hallazgos fuera de alcance: con Codex 0.160.1, `codex exec … --ask-for-approval never` de `autonomous-run.ts:167` falla con «unexpected argument '--ask-for-approval'» (la opción va antes de `exec`); y `opencode run` 2.0.16 no tiene `--prompt` ni directorio posicional (`opencode run --help`), que usa `autonomous-run.ts:173`. Van a otro ticket.
- Memoria consultada (`buscar_memoria` «proyección denegaciones Codex OpenCode permisos sandbox_mode»): sin caso previo; aplica AP-005 y AP-010 (`aprendizajes.md:84`): se listan abajo también los archivos nuevos.
- Consumidores afectados: de `projectFiles`, `syncProject` (`packages/cli/src/commands.ts:882`, salida en `:919-938` y `:990-1002`) y Mission Control (`packages/server/src/config.ts`), que escribirá los mismos archivos; `doctorCommand` (`packages/cli/src/setup.ts:512`) pasará a leer la proyección sin escribir. De `renderOpencodeAgent`, `renderAllAgents` (`agents.ts:262-275`). Archivos de este repositorio: `.codex/` y `.opencode/` están ignorados (`.gitignore:25-26`), así que lo proyectado no se commitea aquí.
- Archivos y flujo investigados: los citados, más `.valmen/features/guardas-verificacion-harness/spec/s5-permisos/spec.md:32-59` (R-PER-002, R-PER-004), `design.md:47-53` (D5), el plan y la `## Implementación` de SECURITY-CLI-PROYECCION-DENEGADOS-20261010 (`tickets/2026/SECURITY-CLI-PROYECCION-DENEGADOS-20261010/ticket.md:69-227`: cuatro reglas por forma, `git -C` no lo cubre una sola regla, fusión por igualdad exacta), `packages/adapter/src/claude-code.ts:70-93` (`claudeDenyRules`, `partesDeForma`) y `packages/adapter/src/skills.ts:119-124` (`RUNTIME_DIRS`). Archivos que el plan tocará o creará: `packages/adapter/src/agents.ts`, `packages/adapter/src/projection.ts`, `packages/cli/src/commands.ts`, `packages/cli/src/setup.ts`, uno nuevo en `packages/adapter/src/` para la traducción a Codex y OpenCode, y uno nuevo de pruebas en `tests/`.
- Riesgos y compatibilidad: (1) R-PER-002: «.opencode/opencode.json» puede tener reglas de la persona; JSON no admite claves repetidas, así que una clave igual a una del harness con otro valor no se puede sumar sin reescribirla: se conserva y se reporta. (2) En OpenCode el orden importa (gana la última), así que las reglas del harness van al final de cada objeto, y «.opencode/opencode.json» carga después de `opencode.json` de la raíz (comprobado): una `allow` de la persona en la raíz no las anula. (3) Proyectar un perfil de permisos en Codex cambia el sandbox de toda sesión del proyecto (de `danger-full-access` del usuario a `:workspace`) y deja `.git` sin escritura: lo decide la persona. (4) Cambio de conducta: los agentes proyectados de OpenCode dejan de leer `.env` y equivalentes. (5) `sync --check` marcará desactualizados los proyectos con `codex` u `opencode` hasta su próximo `sync`. (6) Guarda de exportaciones (`npm run exports:check`): cada exportación nueva necesita consumidor. (7) SECURITY: el plan lo aprueba una persona.
- Impactos de sync, migración, Docker o despliegue: ninguno de sincronización de datos, migración, contenedores ni despliegue. Cambia lo que escribe `valmen sync` en los proyectos con los runtimes `codex` u `opencode` la próxima vez que una persona lo corra.

## Plan

- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan). Confirma el plan con sus 22 criterios y D-1: Codex sin perfil de permisos; leer o editar credenciales queda reportado como no aplicado en `valmen sync` y `valmen doctor`. Recibos: plan-1 y plan-2 en BLOCK (la conjunción «y» que `criteria.ts:47` cuenta como afirmación) y plan-3 en REVIEW.
- Alcance: (a) un módulo nuevo del adaptador traduce la lista de core a Codex y a OpenCode y calcula qué reglas no se aplican; (b) `sync` escribe «.codex/rules/valmen.rules» para Codex y fusiona «.opencode/opencode.json» para OpenCode; (c) cada agente proyectado de OpenCode lleva las denegaciones en su propio bloque `permission`; (d) `sync`, `sync --check` y `doctor` dicen, por cliente y regla, lo que no se aplicó.
- Exclusiones: los comandos de la ejecución autónoma (`packages/engine/src/autonomous-run.ts:164-174`), que van a otro ticket; un perfil de permisos de Codex (D-1); `opencode.json` de la raíz y la configuración de usuario de los dos clientes, que no se leen ni se escriben; Claude Code, ya hecho; los archivos reales de cualquier checkout.
- Qué aplica a cada cliente y qué se reporta como no aplicado:
  - Codex: aplica las 9 formas `git <op> <bandera>` de `DENIED_GIT_COMMANDS` como `prefix_rule(..., decision="forbidden")`. No aplicadas, y así se reportan: `git push +` (un prefijo de argumentos no casa parte de un argumento) y las 24 reglas de rutas, lectura y edición de cada glob de `SENSITIVE_PATH_GLOBS` (exigen un perfil de permisos, D-1). Aviso fijo en la línea: solo la forma canónica, y solo en un proyecto de confianza en Codex.
  - OpenCode: aplica las 24 reglas de rutas (`read` y `edit`) y las 10 formas de git (`bash`) en «.opencode/opencode.json» y en cada agente proyectado. Se reportan como no aplicadas las que choquen con una regla de la persona (misma clave con otro valor, o `permission`/`permission.<herramienta>` escrito como texto). Aviso fijo: los agentes propios de la persona no heredan `read` ni `edit` (diagnóstico).
- Traducción a OpenCode: un glob `**/<resto>` da `<resto>` y, si `<resto>` no empieza por `*`, también `*/<resto>` (en OpenCode `*` cruza `/`; `**/.env` no casa `.env`, comprobado); `~/.ssh/**` da `~/.ssh/*`. Cada forma da cuatro patrones `bash`, como en Claude Code: `git <op> <bandera>*`, `git <op> * <bandera>*`, `git * <op> <bandera>*` y `git * <op> * <bandera>*`. En cada objeto las reglas del harness van al final, porque gana la última que casa.
- R-PER-002: en «.opencode/opencode.json» solo se suman claves ausentes, al final de `permission.read`, `permission.edit` y `permission.bash`; una clave existente no se toca aunque tenga otro valor (se reporta); un `permission` o un `permission.<herramienta>` de texto no se convierte (se reporta cada regla de esa herramienta); las demás claves del archivo quedan intactas; si no falta nada, el texto vuelve tal cual (idempotencia de `--check`); un JSON inválido o un `permission` que no es objeto ni texto falla sin escribir. Si existe «.opencode/opencode.jsonc», no se escribe «.opencode/opencode.json» y todas las reglas de OpenCode salen como no aplicadas: reescribir JSONC perdería los comentarios.
- Decisiones que la persona puede cambiar al aprobar:
  - D-1, Codex sin perfil de permisos (recomendado): las reglas de rutas se reportan como no aplicadas. La alternativa, proyectar `default_permissions` con un perfil que extiende `:workspace` y niega los globs, sí niega leer y editar (comprobado), pero cambia el sandbox de toda sesión de Codex del proyecto, deja `.git` sin escritura (Codex ya no podría commitear) y se pierde con `--sandbox` (lo que usa la ejecución autónoma); suma unas 60 líneas y H3 por comprobar.
  - D-2, OpenCode en «.opencode/opencode.json» y no en `opencode.json` de la raíz: carga después (comprobado), así que una `allow` de la persona en la raíz no anula la denegación, y no se toca el archivo donde la persona suele escribir.
  - D-3, en los agentes de OpenCode la base sigue siendo la de hoy (`edit` `allow|deny`, `bash` `allow|ask`, `read` `allow`) como clave `"*"`, con los patrones del harness después.
- Tamaño previsto: unas 600 líneas (módulo nuevo ~200, `agents.ts` ~25, `projection.ts` ~40, `commands.ts` ~25, `setup.ts` ~30, pruebas ~280); cabe en la regla de 300 a 700. Si se pasa, se parte en dos tickets: Codex con el reporte, y OpenCode.
- Quién consume cada exportación nueva (`npm run exports:check`): las funciones del módulo nuevo las leen `projection.ts` y `agents.ts`; los campos nuevos de `Projection` los leen `commands.ts` y `setup.ts`; las pruebas importan todas.
- Pasos ordenados:
  1. Crear `packages/adapter/src/denied-clients.ts`, que importa solo `@valmen/core`: `CODEX_RULES_PATH`, `codexRulesText()` (una `prefix_rule` por forma expresable, con `justification`), `OPENCODE_CONFIG_PATH`, `opencodeDenyPermission()` (objetos `read`, `edit` y `bash` con la traducción de arriba), `opencodeAgentPermission(write, execute)` (la base de D-3 y luego las denegaciones), `mergeOpencodeConfig(actual)`, `missingOpencodeDenyRules(actual)`, el tipo `DenyNotApplied` (`cliente`, `regla`, `motivo`) y `denyNotApplied(runtimes, opencodeActual, hayJsonc)`. (C1, C2, C5, C6, C7, C8, C10, C11, C15, C16)
  2. `packages/adapter/src/agents.ts:203-222`, `renderOpencodeAgent`: el bloque `permission` sale de `opencodeAgentPermission(agent.permissions.write, agent.permissions.execute)` como objetos con claves entre comillas. `renderCodexAgent` no cambia (D-1). (C12)
  3. `packages/adapter/src/projection.ts`: con `codex`, sumar `{ path: CODEX_RULES_PATH, content: codexRulesText() }`; con `opencode`, leer una vez «.opencode/opencode.json» y comprobar si existe «.opencode/opencode.jsonc», y sumar `mergeOpencodeConfig(actual)` salvo con JSONC; `Projection` gana `opencodeDenyMissing` y `denyNotApplied`, vacíos sin esos runtimes. (C4, C5, C9, C19)
  4. `packages/cli/src/commands.ts`, `syncProject`: con `--check` (`:919-938`), una línea «Faltan N denegación(es) del harness en .opencode/opencode.json: …»; al escribir (`:990-1002`), una línea por cliente con «no aplicadas en <cliente> (N): <reglas> — <motivo>» y el aviso fijo del cliente. (C9, C17, C19)
  5. `packages/cli/src/setup.ts`, `doctorCommand` (`:512`): dentro de `try`, `projectFiles` sin escribir y un hallazgo `aviso` «Denegaciones en <cliente>» por cliente con reglas no aplicadas, nombrándolas; si la proyección falla, un aviso con el motivo. No cambia el código de salida. (C18)
  6. Crear `tests/denegados-codex-opencode.test.ts`: (a) contenido de «.codex/rules/valmen.rules»; (b) fusión de OpenCode con R-PER-002 y sus fallos, sobre directorios temporales con `syncProject`; (c) frontmatter de los agentes; (d) prueba parametrizada por regla con `it.each` sobre cada glob × `read`/`edit` y cada forma de `DENIED_GIT_COMMANDS`, por cliente: la regla está en el archivo del cliente o en `denyNotApplied`, nunca en los dos ni en ninguno; (e) salida de `sync`, de `sync --check` y de `doctorCommand`. (C1, C2, C4-C12, C15-C19)
  7. Ajustar las pruebas existentes que fijan el frontmatter de OpenCode o la lista de archivos proyectados (`tests/agent-projection.test.ts`, `tests/config-view.test.ts`), citando en `## Implementación` cada aserción cambiada. (C20)
  8. Verificación manual de Codex en un repositorio temporal, nunca en uno real: tras `sync`, `codex execpolicy check -r <repo>/.codex/rules/valmen.rules git reset --hard` con Codex 0.160.1 devuelve `forbidden`. (C3)
  9. Verificación manual de lectura en OpenCode, en un repositorio temporal con `.env` y los agentes proyectados por `sync`: `opencode run --standalone --auto --agent <agente proyectado> --format json` con OpenCode 2.0.16, pidiendo leer `.env` con la herramienta `read`; la llamada sale con `Permission denied: read`. (C13)
  10. Verificación manual de comandos en OpenCode, en el mismo repositorio temporal: `opencode run --standalone --auto --agent <agente proyectado> --format json` con OpenCode 2.0.16, pidiendo ejecutar en bash `git -C . reset --hard`; la llamada sale con `Permission denied: shell` y el árbol conserva su cambio. (C14)
  11. Verificar: `npx vitest run tests/denegados-codex-opencode.test.ts`; las existentes de C20; `npm run build` y `node scripts/exports-sin-uso.mjs` (C21); `npx tsc --noEmit -p tsconfig.json` (C22); `npx eslint` de los archivos tocados.
  12. Entrega: `## Pruebas` con el contrato (comandos, directorio, resultado, la verificación manual y el ambiente: Node 22, Codex 0.160.1 y OpenCode 2.0.16 para C3, C13 y C14), `- [x]` en lo verificado, `valmen secrets`, consumo de IA y paso a `awaiting_user_tests`. Sin commit hasta la confirmación de las pruebas.
- Dependencias: SECURITY-CLI-PROYECCION-DENEGADOS-20261010, integrado en main (`packages/core/src/denied.ts`, `packages/adapter/src/claude-code.ts`).
- Compatibilidad: dos archivos nuevos en la proyección («.codex/rules/valmen.rules» y «.opencode/opencode.json») y los agentes de OpenCode con otro frontmatter: `sync --check` marcará desactualizados los proyectos con `codex` u `opencode` hasta su próximo `sync`, y «Regenerar» de Mission Control escribirá lo mismo.
- Impactos declarados: ninguno de sincronización de datos, migración ni contenedores; tampoco de despliegue. Cambia lo que escribe `valmen sync` en los proyectos con los runtimes `codex` u `opencode`.
- Rollback (obligatorio): `git revert <sha>` del commit del ticket y `npm run build`. Lo ya escrito en los proyectos no se quita solo (R-PER-002): una persona borra «.codex/rules/valmen.rules» y las reglas del harness de «.opencode/opencode.json» si quiere, y el siguiente `sync` restaura el frontmatter anterior de los agentes. No hay datos ni registro que restaurar.

<!-- Los criterios de la sección siguiente se numeran C1…Cn, con una afirmación verificable por criterio
     —una frase con «y» son dos criterios—, y cada uno lleva debajo su anotación de
     verificación: un comentario HTML que dice «test:» y el comando, o «verify: manual». La
     sección no lleva comentarios dentro: un comentario con anotación se leería como la de un
     criterio. Ejemplo en la skill planificacion. -->
## Criterios de aceptación

- [x] C1. (R-PER-004) `codexRulesText()` lleva una regla `forbidden` por cada una de las 9 formas expresables de `DENIED_GIT_COMMANDS`
      <!-- test: npx vitest run tests/denegados-codex-opencode.test.ts -->
- [x] C2. (R-PER-004) `codexRulesText()` no lleva regla para `git push +`
      <!-- test: npx vitest run tests/denegados-codex-opencode.test.ts -->
- [ ] C3. Con Codex 0.160.1, `codex execpolicy check` sobre el archivo proyectado devuelve `forbidden` para `git reset --hard`
      <!-- verify: manual -->
- [x] C4. Sin el runtime `codex`, `sync` no escribe el archivo de reglas de Codex
      <!-- test: npx vitest run tests/denegados-codex-opencode.test.ts -->
- [x] C5. (R-PER-004) Con el runtime `opencode`, `sync` deja en el archivo de proyecto de OpenCode todas las reglas de `opencodeDenyPermission()`
      <!-- test: npx vitest run tests/denegados-codex-opencode.test.ts -->
- [x] C6. (R-PER-002) Tras dos `sync`, las reglas propias de OpenCode quedan idénticas, en su orden original, delante de las del harness
      <!-- test: npx vitest run tests/denegados-codex-opencode.test.ts -->
- [x] C7. (R-PER-002) Tras dos `sync`, cada regla del harness aparece una sola vez en el archivo de OpenCode
      <!-- test: npx vitest run tests/denegados-codex-opencode.test.ts -->
- [x] C8. (R-PER-002) Una clave propia igual a una regla del harness con otro valor conserva su valor
      <!-- test: npx vitest run tests/denegados-codex-opencode.test.ts -->
- [x] C9. (R-PER-004) La regla de esa clave sale en la salida de `sync` como no aplicada en OpenCode
      <!-- test: npx vitest run tests/denegados-codex-opencode.test.ts -->
- [x] C10. (R-PER-002) Un `permission.bash` escrito como texto queda igual tras `sync`
      <!-- test: npx vitest run tests/denegados-codex-opencode.test.ts -->
- [x] C11. Un archivo de OpenCode con JSON inválido hace fallar `sync` sin escribirlo
      <!-- test: npx vitest run tests/denegados-codex-opencode.test.ts -->
- [x] C12. Cada agente proyectado de OpenCode lleva en su frontmatter las reglas de `opencodeAgentPermission`
      <!-- test: npx vitest run tests/denegados-codex-opencode.test.ts -->
- [x] C13. Con OpenCode 2.0.16 en modo `--auto`, un agente proyectado no puede leer `.env`
      <!-- verify: manual -->
- [x] C14. Con OpenCode 2.0.16 en modo `--auto`, un agente proyectado no puede ejecutar `git -C . reset --hard`
      <!-- verify: manual -->
- [x] C15. (R-PER-004) Para cada par de regla de la lista con cliente, la regla figura en el archivo del cliente, de lo contrario en su reporte de no aplicadas
      <!-- test: npx vitest run tests/denegados-codex-opencode.test.ts -->
- [x] C16. (R-PER-004) Ninguna regla aplicada en el archivo de un cliente figura además en el reporte de no aplicadas de ese cliente
      <!-- test: npx vitest run tests/denegados-codex-opencode.test.ts -->
- [x] C17. (R-PER-004) La salida de `valmen sync` con el runtime `codex` nombra cada regla no aplicada en Codex
      <!-- test: npx vitest run tests/denegados-codex-opencode.test.ts -->
- [x] C18. (R-PER-004) La salida de `valmen doctor` con el runtime `codex` nombra cada regla no aplicada en Codex
      <!-- test: npx vitest run tests/denegados-codex-opencode.test.ts -->
- [x] C19. Con una regla del harness borrada del archivo de OpenCode, `sync --check` sale con código distinto de 0
      <!-- test: npx vitest run tests/denegados-codex-opencode.test.ts -->
- [x] C20. Las pruebas existentes que el cambio puede romper siguen en verde
      <!-- test: npx vitest run tests/agent-projection.test.ts tests/config-view.test.ts tests/claude-code-respuesta.test.ts tests/proyeccion-denegados.test.ts tests/adapters.test.ts tests/agentes-y-verbosidad.test.ts tests/puesta-en-marcha.test.ts tests/codegraph-estado.test.ts tests/adopt.test.ts tests/dogfooding-registro.test.ts -->
- [x] C21. La guarda de exportaciones sin consumidor sale con 0
      <!-- test: node scripts/exports-sin-uso.mjs -->
- [x] C22. La comprobación de tipos del repositorio no produce salida
      <!-- test: npx tsc --noEmit -p tsconfig.json -->

## Puntos

```json
[]
```

## Implementación

Hecho según el plan, con las pruebas escritas antes y observadas en rojo (132 de 133 fallaban sin el módulo y el cableado).

- `packages/adapter/src/denied-clients.ts` (nuevo): `codexRulesText`, `opencodeDenyPermission`, `opencodeAgentPermission`, `mergeOpencodeDenyConfig`, `missingOpencodeDenyRules`, `denyNotApplied`, `DENY_CLIENT_NOTICE`. La fusión se llama `mergeOpencodeDenyConfig` porque `mergeOpencodeConfig` ya existe en `mcp.ts` (el servidor MCP en `opencode.json` de la raíz).
- `agents.ts`: el frontmatter de OpenCode lleva `permission` con `read`, `edit` y `bash`, la base de hoy como clave `"*"` y las denegaciones después (D-3). `renderCodexAgent` no cambia (D-1).
- `projection.ts`: suma `.codex/rules/valmen.rules` y `.opencode/opencode.json` (no este último si existe `.opencode/opencode.jsonc`); `Projection` gana `opencodeDenyMissing` y `denyNotApplied`.
- `commands.ts`: `sync` y `sync --check` imprimen «no aplicadas en <cliente> (N): … — <motivo>» y una línea «Nota (<cliente>): …» (no empieza por «Aviso» porque `tests/agents-md-tamano.test.ts` exige que no haya «Aviso» sin presupuesto excedido); `--check` falla con «Faltan N denegación(es) del harness en .opencode/opencode.json».
- `setup.ts`: `doctor` suma un hallazgo `aviso` «Denegaciones en <cliente>» sin escribir ni cambiar el código de salida.

Aserciones de pruebas existentes cambiadas a propósito (paso 7 del plan), todas por los dos archivos nuevos o el frontmatter nuevo:
- `tests/agent-projection.test.ts`: `^ {2}edit: (allow|deny)$` pasa a `^ {2}edit:\n {4}"\*": (allow|deny)$`.
- `tests/adapters.test.ts`: `.opencode/` 2 a 3 archivos; `.codex/` 3 a 4; la lista de «proyecta solo a los declarados» suma `.opencode/opencode.json`.
- `tests/config-view.test.ts`: `ARCHIVOS_GENERADOS` suma `.codex/rules/valmen.rules` y `.opencode/opencode.json`; pendientes 6 a 8.

Verificación manual con OpenCode 2.0.16 en un repositorio temporal (fuera del repo, `sync` con el dist del worktree): `read` de `.env` sale `Permission denied: read` (C13) y `git -C . reset --hard` por bash sale `Permission denied: shell` con el árbol intacto (C14). Codex no está instalado en esta máquina: C3 queda sin verificar.

## Pruebas

Directorio: raíz del worktree/checkout, Node 22 o superior, `npm install` hecho y `npm run build` corrido.

1. `npx vitest run tests/denegados-codex-opencode.test.ts` — esperado: 133 pruebas en verde (C1, C2, C4 a C12, C15 a C19).
2. `npx vitest run tests/agent-projection.test.ts tests/config-view.test.ts tests/claude-code-respuesta.test.ts tests/proyeccion-denegados.test.ts tests/adapters.test.ts tests/agentes-y-verbosidad.test.ts tests/puesta-en-marcha.test.ts tests/codegraph-estado.test.ts tests/adopt.test.ts tests/dogfooding-registro.test.ts tests/agents-md-tamano.test.ts` — esperado: 262 en verde (C20).
3. `node scripts/exports-sin-uso.mjs` — esperado: «Sin exportaciones nuevas sin consumidor» (C21). `npx tsc --noEmit -p tsconfig.json` — sin salida (C22).

Manual, solo en un repositorio temporal (nunca uno real): con `valmen sync` y `runtimes: [codex]`, `codex execpolicy check -r <repo>/.codex/rules/valmen.rules git reset --hard` con Codex 0.160.1 debe devolver `forbidden` (C3, SIN VERIFICAR: Codex no está instalado donde se implementó). Con `runtimes: [opencode]` y OpenCode 2.0.16, `opencode run --standalone --auto --agent <agente> --format json` pidiendo `read` de `.env` da `Permission denied: read` y pidiendo `git -C . reset --hard` por bash da `Permission denied: shell` (C13 y C14, verificados por el implementador).

Ejecutado por el implementador: 1 (133 de 133), 2 (262 de 262), 3 (sin hallazgos nuevos) y `npx eslint` de los archivos tocados limpio. Limitación: la prueba parametrizada comprueba que cada regla está en el archivo del cliente o reportada, no que Codex u OpenCode las respeten (eso lo cubren C3, C13 y C14).

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
    "notes": "Sesión de implementación; la sesión no expone totales de tokens, sin números.",
    "input_tokens": null,
    "output_tokens": null,
    "total_tokens": null,
    "estimated_cost_usd": null,
    "source": "manual:sesion-implementacion-sonnet-5-5",
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
    "at": "2026-10-10T21:47:33.076Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-10",
    "at": "2026-10-11T03:30:28.796Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-10",
    "at": "2026-10-11T03:33:01.470Z",
    "action": "gate-approved",
    "actor": "cli",
    "details": "Gate analysis aprobado por juan andrade (recibo GR-20261011-SECURITY-ADAPTER-DENEGADOS-CODEX-OPENCODE-20261010-analysis-1, canal cli, decidida 2026-10-11T03:33:01.467Z): Firmar y que escriba el plan (Recomendado)"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-10",
    "at": "2026-10-11T03:34:27.494Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-10",
    "at": "2026-10-11T03:46:00.131Z",
    "action": "gate-approved",
    "actor": "cli",
    "details": "Gate plan aprobado por juan andrade (recibo GR-20261011-SECURITY-ADAPTER-DENEGADOS-CODEX-OPENCODE-20261010-plan-3, canal cli, decidida 2026-10-11T03:46:00.127Z): Firmar y aprobar con D-1 (Recomendado)"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-10",
    "at": "2026-10-11T03:46:00.530Z",
    "action": "plan-approved",
    "actor": "cli",
    "details": "{\"actor\":\"juan andrade\",\"source\":\"cli\",\"quote\":\"Firmar y aprobar con D-1 (Recomendado)\",\"planHash\":\"sha256:890f163270a9f810518535730817aff204489e5e17ed5370afde974584adbfca\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-10",
    "at": "2026-10-11T03:46:00.926Z",
    "action": "plan-approval-verified",
    "actor": "cli",
    "details": "Aprobación del plan vigente: juan andrade (fuente cli), plan sha256:890f163270a9f810518535730817aff204489e5e17ed5370afde974584adbfca."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-10-10",
    "at": "2026-10-11T03:46:00.926Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-10-10",
    "at": "2026-10-11T03:46:20.740Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-10-10",
    "at": "2026-10-11T03:57:06.247Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-10-10",
    "at": "2026-10-11T04:00:30.959Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  }
]
```
