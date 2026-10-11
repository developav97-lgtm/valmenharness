---
schema_version: 2
id: SECURITY-CLI-PROYECCION-DENEGADOS-20261010
title: Sync proyecta denegaciones a settings.json de Claude Code
type: SECURITY
module: CLI
workflow_status: approved
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

# SECURITY-CLI-PROYECCION-DENEGADOS-20261010

## Solicitud original

Parte del sprint: Los permisos de los agentes niegan lo que nunca se automatiza, desde una sola lista proyectada por valmen sync.
- R-PER-001: `valmen sync` DEBE escribir en `.claude/settings.json` las reglas de denegación del harness
- R-PER-002: La proyección NO DEBE quitar ni reescribir reglas que la persona puso
- R-PER-003: `sync --check` DEBE fallar si falta una regla de denegación del harness
- R-PER-005: Una prueba DEBE comprobar que la denegación se cumple con `bypassPermissions`
Depende de: CHORE-CORE-LISTA-DENEGADOS-20261010.
Viene de una feature descompuesta en sprints; su plan completo está en el tickets.yaml de la feature.

Comportamiento esperado: `valmen sync` DEBE escribir en `.claude/settings.json` las reglas de denegación del harness La proyección NO DEBE quitar ni reescribir reglas que la persona puso `sync --check` DEBE fallar si falta una regla de denegación del harness Una prueba DEBE comprobar que la denegación se cumple con `bypassPermissions`
Comportamiento actual: la spec no lo declara; se establece en el análisis, leyendo el código.

### Fuera de alcance

Lo que el grafo asignó a otros tickets y este no hace:
- R-PER-001: lo cubre CHORE-CORE-LISTA-DENEGADOS-20261010 (Lista única de rutas y comandos denegados en core)

### Supuestos y decisiones pendientes

<!-- Si el pedido nombra algo que el código no tiene —parámetro, permiso,
campo, bandera, columna, migración— y no lo especifica, listá cada elemento
con su pregunta antes de avanzar a análisis; el análisis no planifica sobre
la adivinanza. Si no hay ninguno, escribí «Ninguno» y seguí. -->
Ninguno.

## Descripción funcional

- Alcance: lo que `valmen sync` escribe en `.claude/settings.json` cuando el proyecto tiene el runtime `claude`: las reglas `permissions.deny` del harness, sumadas a las de la persona; un aviso por cada regla `allow` de la persona que contradice una denegación; que `sync --check` nombre la denegación que falta; y una prueba con Claude Code real en `bypassPermissions`. Incluye sumar a la lista de core lo que el motor no consume y los agentes sí necesitan (`~/.ssh/**`, `git clean -f`, `git tag -d`, `git push --delete`, y las rutas en forma de glob), como dejó dicho CHORE-CORE-LISTA-DENEGADOS-20261010. Fuera: Codex y OpenCode (R-PER-004, SECURITY-ADAPTER-DENEGADOS-CODEX-OPENCODE-20261010), `.claude/settings.local.json` y el `.claude/settings.json` real de cualquier checkout.
- Usuario o rol afectado: la persona que corre `valmen sync` (o «Regenerar» en Mission Control) en un proyecto con el runtime `claude`, y los agentes de Claude Code de ese proyecto, en especial la ejecución autónoma, que lanza Claude Code con `--permission-mode bypassPermissions` (`packages/engine/src/autonomous-run.ts:176-179`).
- Comportamiento actual: `sync` solo fusiona `outputStyle` en `.claude/settings.json` (`packages/adapter/src/claude-code.ts:57-78`); ninguna regla `deny` llega a Claude Code y «Acciones que nunca se automatizan» es solo texto de `AGENTS.md`. Comprobado: sin reglas, un agente en `bypassPermissions` ejecuta `git reset --hard` y lee `.env` (corrida de control, en el diagnóstico).
- Comportamiento esperado: tras `sync`, `.claude/settings.json` conserva todo lo de la persona y suma una sola vez cada denegación del harness; `sync --check` sale con código distinto de 0 y nombra la denegación que falte; una `allow` de la persona que contradice una denegación sale como aviso y no se borra; y con el archivo proyectado Claude Code deniega en `bypassPermissions` las formas canónicas de lo prohibido.

## Diagnóstico

- Causa comprobada (con `ruta:línea`): es un requisito nuevo, sin defecto previo (AP-005); el hueco está medido en el código. (1) La proyección de Claude Code no conoce permisos: `projectFiles` arma «.claude/settings.json» con `mergeOutputStyleSetting(leerSiExiste(...))` (`packages/adapter/src/projection.ts:165-177`, la llamada en `:168-171`), y esa función solo escribe `outputStyle`: devuelve el texto intacto si ya vale `valmen` (`claude-code.ts:76`) y si no reserializa con dos espacios (`:77`); falla sin escribir ante JSON inválido o un valor que no es objeto (`:62-73`). (2) `sync --check` compara el texto entero de cada archivo (`packages/cli/src/commands.ts:904-910`) y su mensaje nombra archivos, no reglas (`:920-923`): con una denegación borrada diría «.claude/settings.json» desactualizado sin decir cuál falta, que es lo que pide R-PER-003. (3) La lista de core sirve solo al motor: `SENSITIVE_PATH_PATTERNS` son expresiones regulares (`packages/core/src/denied.ts:20-25`) y `DENIED_GIT_FLAGS` banderas sueltas que las listas cerradas del motor aplican a cualquier operación (`:28-34`); no hay globs que Claude Code entienda, ni `~/.ssh/**`, ni las formas operación más bandera (`git clean -f`, `git tag -d`, `git push --delete`) que R-PER-001 niega a los agentes. La cabecera de la lista deja la proyección a este ticket (`denied.ts:11-12`), igual que el diagnóstico de CHORE-CORE-LISTA-DENEGADOS-20261010 (`tickets/2026/CHORE-CORE-LISTA-DENEGADOS-20261010/ticket.md:61`).
- R-PER-005, comprobado con la versión instalada, Claude Code 2.1.289 (`claude --version`): `claude --model haiku --permission-mode bypassPermissions --output-format stream-json --verbose --strict-mcp-config --no-session-persistence --print <prompt>`, en repositorios git temporales del directorio de trabajo de la sesión, nunca un «.claude/settings.json» real, y con la configuración de usuario cargada, como en la ejecución autónoma. (a) Control sin reglas: `git reset --hard`, `git -C . reset --hard`, `cat .env` y la herramienta Read sobre `.env` se ejecutan; `permission_denials: []`. (b) Con `permissions.deny` en el «.claude/settings.json» del proyecto, en las dos sintaxis (`Bash(git reset --hard:*)` y `Bash(git reset --hard *)`, `Read(./.env)` y `Read(.env)`): `git reset --hard`, `git reset --hard HEAD`, `git push --force origin main` y `cat .env` devuelven «Permission to use Bash with command … has been denied.», y Read de `.env` «File is in a directory that is denied by your permission settings.»; la denegación del proyecto gana a la `allow` de usuario `Bash(git push *)` de `~/.claude/settings.json`. (c) Con el juego de 42 reglas que propone el plan, también quedan denegados `git clean -fd`, `git clean -d -f`, `git tag -d v1`, `git push --delete origin v1`, `git push origin main --force`, `git push origin main --force-with-lease`, el compuesto `git status && git reset --hard`, `git reset HEAD --hard`, `cat sub/.env`, `echo X >> sub/.env.local` y la herramienta Write sobre `sub/.env.produccion` (12 denegaciones en el `result`). Conclusión: la denegación se cumple en `bypassPermissions`, y la rama de R-PER-005 que obliga a cambiar el modo de la ejecución autónoma no aplica.
- Modelo de amenaza. Evita: que un agente, autónomo o no, ejecute por error las formas canónicas de lo que nunca se automatiza, y que lea o escriba credenciales con las herramientas de Claude Code, incluso por Bash (`cat`, `>>`), como muestra (c). No evita, comprobado: `git -C . reset --hard` se ejecutó con las reglas puestas; las reglas por patrón tampoco ven `git push origin +main`, `sh -c '…'`, un alias de git, un guion ni `-df` (bandera combinada que no empieza por `f`). No evita, comprobado: una sesión abierta dentro de un worktree anidado sin «.claude/settings.json» propio (`<repo>/.claude/worktrees/w`) ejecutó `git reset --hard`: las reglas del checkout padre no se heredan, y en este repositorio `.claude/` no se versiona (`.gitignore:27`), así que los worktrees que crea `crearWorktree` (`packages/engine/src/worktree-git.ts:45`) nacen sin ellas. No evita, comprobado: en `bypassPermissions` el agente intentó editar «.claude/settings.json» con la herramienta Edit y lo detuvo la validación del esquema por una clave desconocida, no un permiso: un agente puede quitar sus propias denegaciones. No evita: con `-p`, un `settings.json` que no valida se ignora en silencio con todas sus denegaciones (`claude --help`, opción `-p`); un proyecto sin el runtime `claude` no recibe nada; «.claude/settings.local.json» y la configuración de usuario quedan fuera.
- Hipótesis pendientes: H1, `Read(~/.ssh/**)` y `Edit(~/.ssh/**)` no se ejercitaron, para no leer claves reales; la sintaxis `~/` es la que documenta Claude Code y la prueba del plan no la cubre. H2, en `-p` y en un espacio no confiado Claude Code ignoró la `allow` del proyecto («Ignoring 1 permissions.allow entry from .claude/settings.json: this workspace has not been trusted») y aplicó las `deny`; en un espacio confiado no se comprobó, aunque la `deny` del proyecto también ganó a la `allow` de usuario. H3, que los subagentes de una sesión (herramienta Agent) usen las reglas de la sesión madre y no las del worktree donde trabajan: no se comprobó. Ninguna cambia el plan.
- Memoria consultada (`valmen memory search` con «settings.json permisos deny», «sync proyección claude» y «bypassPermissions»): sin un caso previo. Aplica AP-010 (`.valmen/memory/aprendizajes.md:84`): por eso se listan abajo también los archivos nuevos que el plan crea. Aplica AP-005 (`:41`): requisito nuevo sin síntoma; el síntoma observable es la corrida de control.
- Consumidores afectados: de `projectFiles`, `syncProject` (`packages/cli/src/commands.ts:880-986`), llamado desde `packages/cli/src/main.ts:1437-1442` y `packages/cli/src/onboarding-verify.ts:63`; y Mission Control, `projectionImpact` y `syncProjections` (`packages/server/src/config.ts:247-272` y `:292-295`, llamado en `packages/server/src/server.ts:1878`), que escribirá las mismas reglas porque usa la misma función. De `mergeOutputStyleSetting`, solo `projection.ts:32` y `:170` y `tests/claude-code-respuesta.test.ts:22`, `:80` y `:84`. De la lista de core, el motor (`packages/engine/src/integration-rules.ts:35-40` y las tres listas de banderas), que no cambia. Pruebas que fijan `settings.json`: `tests/claude-code-respuesta.test.ts:73-76` (espera solo `{outputStyle}`) y `:78-81` (texto intacto con `"permissions": {}`) cambian de valor esperado; `tests/config-view.test.ts:37-43` y `:216-232` y `tests/adapters.test.ts:375` solo cuentan rutas. Corridas hoy en este worktree, las que el cambio puede romper: 11 archivos, 291 pruebas, en verde. La ejecución autónoma (`autonomous-run.ts:385`, `packages/engine/src/journey-preparation.ts:229`) corre en `paths.root`, cuyo «.claude/settings.json» sí lee. El juez (`packages/credentials/src/claude-cli.ts:146-149`) corre sin herramientas y con `--setting-sources ""`: no le afecta.
- Archivos y flujo investigados: los citados, más `.valmen/features/guardas-verificacion-harness/spec/s5-permisos/spec.md:18-72` (R-PER-001 a R-PER-005), `design.md:47-53` (D5), `tickets.yaml:52-59` y `:134-149`, `.github/workflows/verificacion.yml:77-80` (la CI corre `sync` y `sync --check` en un clon limpio), `scripts/exports-sin-uso.mjs` y `knip.json` (una exportación nueva necesita consumidor en otro módulo, una prueba o un guion) y `.valmen/config.yaml:25-31` (`test-commands`: `npx vitest run`, `npx tsc`, `node`; `test-timeout: 420`). Archivos que el plan tocará: `packages/core/src/denied.ts`, `packages/adapter/src/claude-code.ts`, `packages/adapter/src/projection.ts`, `packages/cli/src/commands.ts` y `tests/claude-code-respuesta.test.ts`; y crea dos archivos de prueba que hoy no existen en `tests/`, uno para la lista, la fusión y `sync --check` y otro con Claude Code real, cuyos nombres fija el plan.
- Riesgos y compatibilidad: (1) R-PER-002, no quitar lo que puso la persona: el JSON no distingue una regla del harness de una igual escrita a mano, así que la proyección solo suma por igualdad exacta y nunca quita; una regla que el harness retire de su lista se queda en los proyectos hasta que alguien la borre. Una `allow` de la persona que contradice una denegación tampoco se toca: en Claude Code la `deny` gana (comprobado en (b)), así que no quitarla no abre nada, y el aviso evita que la persona crea que esa `allow` vale. (2) Formato: si falta algo, el archivo se reserializa con dos espacios, como hoy (`claude-code.ts:77`); las reglas propias conservan texto y orden, pero se pierde el formato a mano; si no falta nada, el texto vuelve intacto, que es la idempotencia de la que depende `--check`. (3) Un archivo que Claude Code no valida desactiva en silencio todas sus denegaciones en `-p`: la proyección solo escribe `permissions.deny` y `outputStyle`, claves del esquema, y la prueba con Claude Code real lo delataría porque no habría denegación. (4) Cambio de conducta para la persona: tras `sync`, sus sesiones de Claude Code en el proyecto dejan de poder leer `.env` y equivalentes, también por Bash; el «.claude/settings.json» del checkout principal de este repositorio no se versiona y cambiará solo cuando una persona corra `valmen sync` ahí, que este ticket no hace. (5) No hay forma de quitar una denegación desde el proyecto: borrarla a mano hace fallar `sync --check` y el próximo `sync` la repone; la salida es quitar `claude` de `runtimes`. (6) Guarda de exportaciones: cada exportación nueva tiene consumidor en otro módulo. (7) Clasificación: SECURITY; el plan lo aprueba una persona.
- Impactos de sync, migración, Docker o despliegue: ninguno de sincronización de datos, migración, contenedores ni despliegue. Lo que cambia es la proyección de `valmen sync` a «.claude/settings.json» en cada proyecto con el runtime `claude`, la próxima vez que una persona la corra.

## Plan

- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan). Confirma D-1, D-2, D-4, D-5 y D-6 tal como están escritas, y D-3 tal como está: no se niega `Edit` sobre `.claude/settings.json` ni `settings.local.json`.
- Alcance: (a) core suma dos listas sin la sintaxis de ningún cliente; (b) el adaptador de Claude Code las traduce a 64 reglas `Read`, `Edit` y `Bash` y las suma a `permissions.deny`; (c) la proyección informa las denegaciones que faltan y las `allow` que las contradicen; (d) `sync --check` nombra las que faltan; (e) las reglas llegan a los worktrees: `valmen journey worktree create` escribe el archivo en el worktree y `sync` proyecta `.worktreeinclude` para los worktrees que crea Claude Code; (f) pruebas, una de ellas con Claude Code real.
- Exclusiones: Codex y OpenCode (R-PER-004); `.claude/settings.local.json`, que no se lee ni se escribe; quitar o reescribir reglas existentes; `--no-verify`, `--amend` y `-D`, que R-PER-001 no niega a los agentes; un hook o un sandbox que analice el comando (las variantes que una regla `deny` no ve quedan declaradas abajo; cerrarlas es otro ticket SECURITY); el aviso de `allow` en Mission Control, que lee solo `.files` (`packages/server/src/config.ts:250`, `:295`); el `.claude/settings.json` y el `.worktreeinclude` reales de este repositorio, que cambian cuando una persona corra `valmen sync` en el checkout principal; `packages/engine/src/autonomous-run.ts`, porque la denegación se cumple en `bypassPermissions` (diagnóstico, R-PER-005).
- Evidencia nueva para el plan, posterior a la firma del análisis (Claude Code 2.1.289, haiku, `--permission-mode bypassPermissions`, repositorios temporales del directorio de trabajo de la sesión):
  - Variantes de `git reset --hard` con las cuatro reglas por forma de D-2: quedan denegados `git -C . reset --hard`, `git --git-dir=.git reset --hard`, `git -c core.pager=cat reset --hard`, `git -C . reset HEAD --hard`, `env git reset --hard`, `GIT_TRACE=0 git reset --hard`, `command git reset --hard`, `git reset --hard; echo fin` y `(git reset --hard)`; se ejecutaron `git reset "--hard"`, `git 'reset' --hard`, `/usr/bin/git reset --hard` y `sh -c 'git reset --hard'`. Falso positivo: `git commit --allow-empty -m "nota: reset --hard"` quedó denegado. Sin falso positivo: `grep -n "git reset --hard" .gitignore` se ejecutó.
  - Push forzado por refspec: con `Bash(git push * +*)` y `Bash(git * push * +*)` quedan denegados `git push origin +main` y `git -C . push origin +main:refs/heads/otra`; `git push origin main` llega a git.
  - Borrado remoto con refspec de dos puntos: `Bash(git push * :*)` y sus variantes no deniegan `git push origin :vieja` ni `git -C . push origin :refs/tags/v1`, porque un patrón que termina en `:*` se lee como la sintaxis antigua de prefijo: esa forma no se puede expresar.
  - Worktrees: con `.claude/` ignorado y un `.worktreeinclude` versionado con la línea `.claude/settings.json`, `claude -w prueba-include` creó `.claude/worktrees/prueba-include` con el archivo copiado y denegó `git reset --hard`; sin el archivo, el diagnóstico muestra que se ejecutó.
- Límite 1, qué variantes de comando se bloquean y cuáles no. Se bloquean, cada una con su regla: la forma canónica y la bandera tras otros argumentos (`Bash(git <op> <bandera>*)` y `Bash(git <op> * <bandera>*)`, que cubren también las banderas cortas combinadas que empiezan por la denegada, como `-fd`); las opciones globales de git antes de la operación (`Bash(git * <op> <bandera>*)` y `Bash(git * <op> * <bandera>*)`: probadas `-C`, `--git-dir=` y `-c`; `--work-tree=` cae en la misma regla, sin corrida propia); los prefijos `env`, `VAR=valor` y `command`, los compuestos con `&&` o `;` y las subshells, que Claude Code separa antes de comparar; y el push forzado por refspec `+` (forma `git push +`). No se pueden bloquear con reglas `deny`, y se declara: los argumentos entre comillas (`git reset "--hard"`, `git 'reset' --hard`), la ruta absoluta del binario (`/usr/bin/git`), un intérprete (`sh -c`, `bash -c`, `eval`, un guion o un programa que lance git), un alias de git, el borrado remoto con `:rama` y las banderas combinadas que no empiezan por la denegada (`-df`). La defensa que queda para esas: (i) el git que corre el motor (jornadas, qa-agent, worktrees e integración) sale de listas cerradas que rechazan toda forma fuera de ellas (`packages/engine/src/integration-rules.ts:103-130`, `packages/engine/src/qa-agent-git.ts:18-37`, `packages/engine/src/worktree-git.ts:49-81`, `packages/engine/src/worktree-integracion-git.ts:26-64`), pero esas listas no ven el Bash del agente; (ii) tras la ejecución autónoma solo se commitea si pasa `reglasDeIntegracion` (rama de trabajo, no protegida y sin archivos prohibidos: `integration-rules.ts:54`, usado por `integrarTicket` en `autonomous-run.ts:519-538`), que detiene el commit pero no deshace un push ni un árbol perdido; (iii) un `reset --hard` o un `clean -f` dentro de un worktree pierde solo el trabajo de ese worktree; (iv) contra un push forzado o un borrado remoto no cubiertos queda solo la protección de ramas del servidor git, fuera del harness, y la entrega se lo dice al PO. Falso positivo aceptado: un mensaje de commit o un argumento de `git grep` o `git log --grep` que contenga «<op> <bandera>» queda denegado; el agente usa la herramienta Grep o `git commit -F <archivo>`.
- Límite 2, cómo llegan las reglas a una sesión en un worktree. (i) `valmen journey worktree create` (`crearWorktree`, `packages/engine/src/worktree.ts:103-222`): tras compilar (`:194-202`), si el proyecto proyecta a `claude` y el worktree no trae `.claude/settings.json` de git, escribe el que proyecta `projectFiles` para la raíz (las reglas de la persona en el checkout principal más las 64 del harness) y comprueba con `git status --porcelain -uall` en el worktree, forma ya admitida (`worktree-git.ts:55-58`), que quedó ignorado; si aparece sin rastrear lo borra y lo dice en `avisos`, para no colarlo en el commit del ticket. Si el worktree lo trae versionado, no lo toca y avisa si le faltan denegaciones. Si la proyección falla, no crea el worktree y deshace como hoy (`:140-166`). (ii) `valmen sync` proyecta `.worktreeinclude` con la línea `.claude/settings.json`, sumada a las líneas de la persona: Claude Code lo lee al crear sus propios worktrees (`claude -w`, la app de escritorio) y copia el archivo (comprobado arriba). (iii) Un worktree creado a mano con `git worktree add`, como el de este ticket, no recibe nada: se declara, `sync` lo dice en su línea de permisos para que el PO lo vea, y la salida es crearlo con `valmen journey worktree create` o `claude -w`, o versionar `.claude/settings.json` en el proyecto. H3, los subagentes de la herramienta Agent, sigue sin comprobar.
- Modelo de amenaza: evita que un agente, autónomo o no, ejecute por error o por costumbre las formas de lo que nunca se automatiza, y que lea o escriba credenciales con sus herramientas o con Bash. No evita una evasión deliberada (comillas, ruta absoluta, intérprete, alias, `:rama`), que un agente edite `.claude/settings.json` y se quite denegaciones (D-3), un archivo que Claude Code no valida (en `-p` se ignora con todas sus reglas), un proyecto sin el runtime `claude`, ni un worktree creado a mano. La evidencia de cada caso está en el diagnóstico y en los dos límites.
- R-PER-002: la proyección solo suma por igualdad exacta, al final de `permissions.deny` y en su orden; nunca quita ni reescribe una regla de la persona, ni `allow` ni `deny`; no lee ni escribe `.claude/settings.local.json`; una `allow` que contradice una denegación sale como aviso y se queda en el archivo, sin efecto porque en Claude Code la `deny` gana (diagnóstico, caso (b)); y una regla que el harness retire de su lista se queda en los proyectos hasta que una persona la borre.
- Quién consume cada exportación nueva (guarda `npm run exports:check`): `SENSITIVE_PATH_GLOBS` y `DENIED_GIT_COMMANDS` de core los lee `claude-code.ts`; `claudeDenyRules`, `mergeClaudeSettings`, `missingClaudeDenyRules`, `claudeAllowConflicts`, `WORKTREE_INCLUDE_PATH` y `mergeWorktreeInclude` del adaptador los lee `projection.ts`; el campo nuevo `claudeDenyMissing` de `Projection` lo lee `commands.ts`; `crearWorktree` usa `projectFiles` y `CLAUDE_SETTINGS_PATH`, que ya se exportan. Las pruebas importan además todas. `mergeOutputStyleSetting` desaparece porque pasa a llamarse `mergeClaudeSettings`; la línea base `scripts/exports-sin-uso.linea-base.json` no se toca.
- Decisiones que la persona puede cambiar al aprobar:
  - D-1, core lleva globs y formas de comando sin la sintaxis de ningún cliente, y la de Claude Code vive en el adaptador, porque R-PER-004 traduce la misma lista a Codex y OpenCode; difiere de lo que anticipó CHORE-CORE-LISTA-DENEGADOS-20261010 (`tickets/2026/CHORE-CORE-LISTA-DENEGADOS-20261010/ticket.md:61`).
  - D-2, cuatro reglas por forma de comando (64 reglas con las de rutas), para cubrir `git -C` y las demás opciones globales que los agentes usan por costumbre, con el falso positivo de los mensajes de commit y `git grep`; la alternativa de dos reglas por forma no tiene ese falso positivo y deja pasar `git -C . reset --hard`.
  - D-3, no se proyecta `Edit` deny sobre `.claude/settings.json` ni `.claude/settings.local.json`: R-PER-001 no lo pide; sumarlo impide que un agente se quite denegaciones, cosa que hoy puede intentar (diagnóstico), y también que ayude a la persona a editar esos archivos.
  - D-4, la prueba con Claude Code real es opcional y se activa con `VALMEN_CLAUDE_BYPASS_E2E=1`, como las de equivalencia con `VALMEN_REFERENCE_TICKET_PY`: necesita sesión de Claude Code y red, y gasta unos 0,03 USD con haiku por corrida; sin la variable se salta con el motivo.
  - D-5, consecuencia de D-b: `.valmen/config.yaml`, `.valmen/routing.yaml` y `.valmen/delegations/` no reciben `Read` ni `Edit` deny. Un agente puede leerlas, que es lo que D-b protege, y también editarlas con sus herramientas, que este ticket no impide; sigue en pie que una jornada no las commitea (`integration-rules.ts:35-40` y `:43-51`). Negar solo su edición bloquearía el trabajo de configuración del harness que se hace con agentes.
  - D-6, `crearWorktree` falla cerrado si la proyección falla; la alternativa, crear el worktree sin denegaciones y con un aviso, deja a los agentes de ese worktree sin ellas.
- Pasos ordenados:
  1. `packages/core/src/denied.ts`: sumar `SENSITIVE_PATH_GLOBS: readonly string[]`, congelada, con los 12 globs `**/.env`, `**/.env.*`, `**/.credentials`, `**/.credentials.*`, `**/id_rsa`, `**/id_rsa.pub`, `**/id_ed25519`, `**/id_ed25519.pub`, `**/*.pem`, `**/*.key`, `**/*.p12` y `~/.ssh/**`; y `DENIED_GIT_COMMANDS: readonly string[]`, congelada, con las diez formas `git push --force`, `git push -f`, `git push +`, `git push --delete`, `git push -d`, `git reset --hard`, `git clean -f`, `git clean --force`, `git tag -d` y `git tag --delete`. Actualizar la cabecera (`:11-12`) con su consumidor. Sin `import` (AP-002). `SENSITIVE_PATH_PATTERNS` y `DENIED_GIT_FLAGS` no cambian. (C1, C2, C3, C4)
  2. `packages/adapter/src/claude-code.ts`: importar las dos listas de `@valmen/core`; `claudeDenyRules()` devuelve, en este orden, `Read(<glob>)` por cada glob, `Edit(<glob>)` por cada glob y, por cada forma `git <op> <bandera>`, `Bash(git <op> <bandera>*)`, `Bash(git <op> * <bandera>*)`, `Bash(git * <op> <bandera>*)` y `Bash(git * <op> * <bandera>*)`. (C6)
  3. Mismo archivo: `mergeOutputStyleSetting` (`:57-78`) pasa a `mergeClaudeSettings(actual)`: conserva sus fallos (`:62-73`); falla nombrando el archivo, sin escribir, si `permissions` no es objeto o `permissions.deny` no es un arreglo de textos; suma al final de `permissions.deny` las reglas de `claudeDenyRules()` que no estén por igualdad exacta, en su orden; no toca ninguna otra clave ni regla; si `outputStyle` ya vale `valmen` y no falta ninguna regla, devuelve el texto tal cual; sin archivo, crea `{outputStyle, permissions: {deny}}`. (C7, C8, C9, C10, C11, C16, C17, C18)
  4. Mismo archivo: `missingClaudeDenyRules(actual)` devuelve las reglas del harness ausentes de `permissions.deny` (todas, sin archivo); `claudeAllowConflicts(actual)` devuelve un aviso por cada regla de `permissions.allow` que contradice una denegación: `Bash` sin paréntesis, o `Bash(<patrón>)` cuyo patrón, con `:*` final leído como `*` y `*` como cualquier texto, cubre una forma de `DENIED_GIT_COMMANDS`; `Read` o `Edit` sin paréntesis, o con un glob que cubre la ruta de ejemplo de un glob del harness (sin `**/` y con `*` como `x`; `~/.ssh/**` como `~/.ssh/id_rsa`). El aviso nombra la `allow` y la denegación, y dice que Claude Code aplica la denegación y que la regla no se borró. (C13, C14, C15)
  5. Mismo archivo: `WORKTREE_INCLUDE_PATH = ".worktreeinclude"` y `mergeWorktreeInclude(actual)`: si ninguna línea es `.claude/settings.json`, la suma al final; si ya está, devuelve el texto tal cual. (C22, C23)
  6. `packages/adapter/src/projection.ts:165-177`: leer `.claude/settings.json` una vez; su contenido pasa a `mergeClaudeSettings(actual)`; sumar `{ path: WORKTREE_INCLUDE_PATH, content: mergeWorktreeInclude(...) }` tras `CLAUDE.md`, solo con el runtime `claude`; `Projection` (`:90-117`) gana `claudeDenyMissing: readonly string[]` con `missingClaudeDenyRules(actual)`, vacío sin el runtime `claude`; `warnings` suma `claudeAllowConflicts(actual)`. `.claude/settings.local.json` no se lee. (C12, C13, C19, C22, C24)
  7. `packages/cli/src/commands.ts`, `syncProject`: con `--check` (`:904-930`), si `claudeDenyMissing` no está vacío, una línea «Faltan N denegación(es) del harness en .claude/settings.json: <reglas>»; la salida ya es distinta de 0 porque el texto difiere (`:906-910`). Al escribir (`:942-985`), una línea «denegaciones de Claude Code  <total> (<m> agregadas); un worktree creado con git worktree add a mano no las trae». (C19, C20, C21)
  8. `packages/engine/src/worktree.ts`, `crearWorktree`, tras la compilación (`:194-202`): lo descrito en el límite 2 (i), con `projectFiles` y `CLAUDE_SETTINGS_PATH` de `@valmen/adapter` y `atomicWrite` de `@valmen/core`; el aviso va en `avisos` (`:124`), que ya imprime `packages/cli/src/worktree.ts:36-40`. (C25, C26, C27, C28)
  9. `tests/claude-code-respuesta.test.ts`: renombrar a `mergeClaudeSettings` (`:22`, `:80`, `:84`); `:73-76` espera `{outputStyle, permissions: {deny: claudeDenyRules()}}`; `:78-81` usa un texto con `outputStyle` y las 64 reglas y comprueba que vuelve intacto; `:156-163` suma `.worktreeinclude` a lo que no se proyecta sin el runtime `claude`. `tests/config-view.test.ts:37-43`, `:223-230` y `:239`: `.worktreeinclude` entra tras `CLAUDE.md` y los desactualizados pasan de 5 a 6. (C18, C24, C33)
  10. Crear `tests/proyeccion-denegados.test.ts`: (a) core: los 12 globs y las diez formas, congeladas, y una tabla de rutas donde `SENSITIVE_PATH_PATTERNS` y `SENSITIVE_PATH_GLOBS` (con `matchesGlob` de `node:path`) dan el mismo veredicto: `.env`, `.env.local`, `app/.env.production`, `.envrc`, `.credentials`, `.credentials.json`, `id_rsa`, `keys/id_ed25519.pub`, `cert.pem`, `x.key`, `a.p12`, `keyboard.ts`, `docs/key.md` y `src/ok.ts`; (b) adaptador: las 64 reglas exactas y en orden; R-PER-001 con `{"outputStyle":"valmen"}`; R-PER-002 con `allow` y `deny` propios y dos `sync`, y `.claude/settings.local.json` comparado byte a byte; los dos fallos sin escribir; avisos por `Bash(git push *)`, `Bash(git:*)` y `Read(**)`, ninguno por `Bash(npm test)`, y la `allow` sigue en el archivo; R-PER-003: `sync`, borrar `Bash(git reset --hard*)`, `sync --check` distinto de 0 y su salida la nombra, y tras `sync` vuelve a 0; `.worktreeinclude` creado y con las líneas de la persona conservadas. (C1, C2, C3, C4, C5, C6, C7, C8, C9, C10, C11, C12, C13, C14, C15, C16, C17, C19, C20, C21, C22, C23)
  11. `tests/worktree-integracion.test.ts`, en «crear el worktree»: con el laboratorio de `tests/helpers/worktree-lab.ts:36-37`, que ignora `.claude/`, el worktree nuevo tiene `.claude/settings.json` con las 64 reglas; con `.claude/settings.json` versionado en `main`, queda como estaba; con un `.gitignore` que no ignora `.claude/`, el archivo no queda y `avisos` lo dice; «las listas cerradas» (`:245-256`) sigue en verde con la llamada nueva. (C25, C26, C27, C28)
  12. Crear `tests/denegaciones-claude-bypass.test.ts` (D-4): repositorio git temporal con `a.txt` commiteado, árbol limpio y `.env`; `syncProject` con un `.valmen/config.yaml` mínimo; `claude`, o `VALMEN_CLAUDE_BIN`, con `--model haiku --permission-mode bypassPermissions --output-format stream-json --verbose --strict-mcp-config --no-session-persistence --print`, pidiendo por Bash `git reset --hard`, `git -C . reset --hard` y `cat .env`; espera los tres en `permission_denials`; si el modelo no intentó un comando, falla como no concluyente en vez de pasar. Sin la variable, `it.skip` con el motivo. (C29, C30, C31, C32)
  13. Verificar en el worktree: `npx vitest run tests/proyeccion-denegados.test.ts` (C1-C17, C19-C23); `npx vitest run tests/claude-code-respuesta.test.ts` (C18, C24); `npx vitest run tests/worktree-integracion.test.ts` (C25-C28); `npx vitest run tests/denegaciones-claude-bypass.test.ts` sin la variable (C32); las pruebas existentes que el cambio puede romper, `tests/claude-code-respuesta.test.ts`, `tests/config-view.test.ts`, `tests/adapters.test.ts`, `tests/agentes-y-verbosidad.test.ts`, `tests/respuesta-agents-md.test.ts`, `tests/skills-publicadas.test.ts`, `tests/agents-md-tamano.test.ts`, `tests/lista-denegados.test.ts`, `tests/adopt.test.ts`, `tests/skill-corrida-orquestada.test.ts`, `tests/dogfooding-registro.test.ts` y `tests/worktree-integrar.test.ts`, en verde (C33); `npm run build` y `node scripts/exports-sin-uso.mjs` con 0 (C34); `git diff --exit-code scripts/exports-sin-uso.linea-base.json` sin diferencias (C35); `npx tsc --noEmit -p tsconfig.json` sin salida (C36); `npx eslint` sobre los archivos tocados sin errores (C37). La corrida con Claude Code real la hace la persona responsable con `VALMEN_CLAUDE_BYPASS_E2E=1 npx vitest run tests/denegaciones-claude-bypass.test.ts` y su resultado queda en `## Pruebas` (C29, C30, C31); nunca sobre un `.claude/settings.json` real.
  14. Entrega: `## Pruebas` con el contrato (comandos, directorio, resultado esperado, la corrida opcional y su costo, la validación manual y el ambiente: Node 22 o superior, Claude Code 2.1.289 o superior para C29-C31), lo que se le dice al PO sobre los worktrees creados a mano y sobre la protección de ramas del servidor; `- [x]` en lo verificado; `valmen secrets`; consumo de IA; paso a `awaiting_user_tests`. Sin commit hasta la confirmación de las pruebas. (C35, C37)
- Dependencias: CHORE-CORE-LISTA-DENEGADOS-20261010, ya integrado en main (`packages/core/src/denied.ts`). De este ticket depende SECURITY-ADAPTER-DENEGADOS-CODEX-OPENCODE-20261010, que lee las mismas dos listas.
- Compatibilidad: `mergeOutputStyleSetting` se renombra y su único consumidor fuera de las pruebas es `projection.ts:170`; `Projection` suma un campo; `.worktreeinclude` es un archivo nuevo de la proyección, así que `sync --check` marcará desactualizado a cada proyecto con el runtime `claude` hasta su próximo `sync` (la CI de este repositorio corre `sync` antes de `--check`, `.github/workflows/verificacion.yml:77-80`), y «Regenerar» de Mission Control también lo escribirá; el `dist` que corre el binario se reconstruye en el paso 13.
- Impactos declarados: ninguno de sincronización de datos, migración ni contenedores; tampoco de despliegue. Cambia lo que escribe `valmen sync` en cada proyecto con el runtime `claude` y lo que deja `valmen journey worktree create` en un worktree nuevo.
- Rollback (obligatorio): `git revert <sha>` del commit del ticket y `npm run build`: la proyección vuelve a fusionar solo `outputStyle`, `crearWorktree` deja de escribir el archivo y `sync` deja de proyectar `.worktreeinclude`. Lo ya escrito en los proyectos no se quita solo, por R-PER-002: las 64 reglas de `.claude/settings.json` y la línea de `.worktreeinclude` las borra a mano una persona si quiere, y los worktrees ya creados conservan su archivo hasta que se quitan. No hay datos ni registro que restaurar.

<!-- Los criterios de la sección siguiente se numeran C1…Cn, con una afirmación verificable por criterio
     —una frase con «y» son dos criterios—, y cada uno lleva debajo su anotación de
     verificación: un comentario HTML que dice «test:» y el comando, o «verify: manual». La
     sección no lleva comentarios dentro: un comentario con anotación se leería como la de un
     criterio. Ejemplo en la skill planificacion. -->
## Criterios de aceptación

- [ ] C1. (R-PER-001) `SENSITIVE_PATH_GLOBS` de `@valmen/core` lleva los 12 globs de rutas sensibles, `~/.ssh/**` incluido
      <!-- test: npx vitest run tests/proyeccion-denegados.test.ts -->
- [ ] C2. (R-PER-001) `DENIED_GIT_COMMANDS` de `@valmen/core` lleva las diez formas de git que nunca se automatizan
      <!-- test: npx vitest run tests/proyeccion-denegados.test.ts -->
- [ ] C3. `SENSITIVE_PATH_GLOBS` está congelada
      <!-- test: npx vitest run tests/proyeccion-denegados.test.ts -->
- [ ] C4. `DENIED_GIT_COMMANDS` está congelada
      <!-- test: npx vitest run tests/proyeccion-denegados.test.ts -->
- [ ] C5. Para cada ruta de la tabla, `SENSITIVE_PATH_GLOBS` da el mismo veredicto que `SENSITIVE_PATH_PATTERNS`
      <!-- test: npx vitest run tests/proyeccion-denegados.test.ts -->
- [ ] C6. `claudeDenyRules()` devuelve las 64 reglas del plan en su orden
      <!-- test: npx vitest run tests/proyeccion-denegados.test.ts -->
- [ ] C7. (R-PER-001) `valmen sync` sobre `{"outputStyle":"valmen"}` conserva `outputStyle`
      <!-- test: npx vitest run tests/proyeccion-denegados.test.ts -->
- [ ] C8. (R-PER-001) `valmen sync` sobre `{"outputStyle":"valmen"}` escribe en `permissions.deny` las 64 reglas del harness
      <!-- test: npx vitest run tests/proyeccion-denegados.test.ts -->
- [ ] C9. (R-PER-002) Tras dos `sync`, la lista `permissions.allow` propia queda idéntica a la original
      <!-- test: npx vitest run tests/proyeccion-denegados.test.ts -->
- [ ] C10. (R-PER-002) Tras dos `sync`, las reglas `deny` propias quedan con su texto original, en su orden original, delante de las del harness
      <!-- test: npx vitest run tests/proyeccion-denegados.test.ts -->
- [ ] C11. (R-PER-002) Tras dos `sync`, cada regla del harness aparece una sola vez
      <!-- test: npx vitest run tests/proyeccion-denegados.test.ts -->
- [ ] C12. (R-PER-002) `sync` deja `.claude/settings.local.json` igual byte a byte
      <!-- test: npx vitest run tests/proyeccion-denegados.test.ts -->
- [ ] C13. (R-PER-002) Una `allow` propia que contradice una denegación sale como aviso en la salida de `sync`
      <!-- test: npx vitest run tests/proyeccion-denegados.test.ts -->
- [ ] C14. (R-PER-002) La `allow` que contradice una denegación sigue en el archivo después de `sync`
      <!-- test: npx vitest run tests/proyeccion-denegados.test.ts -->
- [ ] C15. Una `allow` que no contradice ninguna denegación no produce aviso
      <!-- test: npx vitest run tests/proyeccion-denegados.test.ts -->
- [ ] C16. Un `permissions` que no es objeto hace fallar `sync` sin escribir el archivo
      <!-- test: npx vitest run tests/proyeccion-denegados.test.ts -->
- [ ] C17. Un `permissions.deny` que no es un arreglo de textos hace fallar `sync` sin escribir el archivo
      <!-- test: npx vitest run tests/proyeccion-denegados.test.ts -->
- [ ] C18. Si el archivo ya tiene `outputStyle` en `valmen` con las 64 reglas, `mergeClaudeSettings` devuelve el texto tal cual
      <!-- test: npx vitest run tests/claude-code-respuesta.test.ts -->
- [ ] C19. (R-PER-003) Con la denegación `Bash(git reset --hard*)` borrada, `sync --check` sale con código distinto de 0
      <!-- test: npx vitest run tests/proyeccion-denegados.test.ts -->
- [ ] C20. (R-PER-003) La salida de `sync --check` nombra la denegación que falta
      <!-- test: npx vitest run tests/proyeccion-denegados.test.ts -->
- [ ] C21. Tras `sync`, `sync --check` vuelve a salir con 0
      <!-- test: npx vitest run tests/proyeccion-denegados.test.ts -->
- [ ] C22. `sync` escribe en `.worktreeinclude` la línea `.claude/settings.json`
      <!-- test: npx vitest run tests/proyeccion-denegados.test.ts -->
- [ ] C23. `sync` conserva las líneas propias de `.worktreeinclude`
      <!-- test: npx vitest run tests/proyeccion-denegados.test.ts -->
- [ ] C24. Sin el runtime `claude`, `sync` no escribe `.worktreeinclude`
      <!-- test: npx vitest run tests/claude-code-respuesta.test.ts -->
- [ ] C25. `crearWorktree` deja en un worktree con `.claude/` ignorado un `.claude/settings.json` con las 64 reglas
      <!-- test: npx vitest run tests/worktree-integracion.test.ts -->
- [ ] C26. `crearWorktree` no cambia un `.claude/settings.json` que el worktree trae de git
      <!-- test: npx vitest run tests/worktree-integracion.test.ts -->
- [ ] C27. `crearWorktree` no deja un `.claude/settings.json` que git no ignora
      <!-- test: npx vitest run tests/worktree-integracion.test.ts -->
- [ ] C28. `crearWorktree` avisa cuando no deja `.claude/settings.json` porque git no lo ignora
      <!-- test: npx vitest run tests/worktree-integracion.test.ts -->
- [ ] C29. (R-PER-005) En modo `bypassPermissions`, con el `settings.json` proyectado, Claude Code deniega `git reset --hard`
      <!-- verify: manual -->
- [ ] C30. (R-PER-005) En modo `bypassPermissions`, con el `settings.json` proyectado, Claude Code deniega `git -C . reset --hard`
      <!-- verify: manual -->
- [ ] C31. (R-PER-005) En modo `bypassPermissions`, con el `settings.json` proyectado, Claude Code deniega `cat .env`
      <!-- verify: manual -->
- [ ] C32. Sin `VALMEN_CLAUDE_BYPASS_E2E`, la prueba con Claude Code real se salta sin fallar
      <!-- test: npx vitest run tests/denegaciones-claude-bypass.test.ts -->
- [ ] C33. Las pruebas existentes que el cambio puede romper siguen en verde
      <!-- test: npx vitest run tests/claude-code-respuesta.test.ts tests/config-view.test.ts tests/adapters.test.ts tests/agentes-y-verbosidad.test.ts tests/respuesta-agents-md.test.ts tests/skills-publicadas.test.ts tests/agents-md-tamano.test.ts tests/lista-denegados.test.ts tests/adopt.test.ts tests/skill-corrida-orquestada.test.ts tests/dogfooding-registro.test.ts tests/worktree-integrar.test.ts -->
- [ ] C34. La guarda de exportaciones sin consumidor sale con 0
      <!-- test: node scripts/exports-sin-uso.mjs -->
- [ ] C35. La línea base `scripts/exports-sin-uso.linea-base.json` queda sin cambios
      <!-- verify: manual -->
- [ ] C36. La comprobación de tipos del repositorio no produce salida
      <!-- test: npx tsc --noEmit -p tsconfig.json -->
- [ ] C37. El lint de los archivos tocados termina sin errores
      <!-- verify: manual -->

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
    "at": "2026-10-10T21:47:32.908Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-10",
    "at": "2026-10-11T00:32:18.514Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-10",
    "at": "2026-10-11T00:35:48.558Z",
    "action": "gate-approved",
    "actor": "cli",
    "details": "Gate analysis aprobado por juan andrade (recibo GR-20261011-SECURITY-CLI-PROYECCION-DENEGADOS-20261010-analysis-1, canal cli, decidida 2026-10-11T00:35:48.550Z): Firmar y que el plan cubra los dos límites (Recomendado)"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-10",
    "at": "2026-10-11T00:47:23.341Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-10",
    "at": "2026-10-11T00:51:47.328Z",
    "action": "gate-approved",
    "actor": "cli",
    "details": "Gate plan aprobado por juan andrade (recibo GR-20261011-SECURITY-CLI-PROYECCION-DENEGADOS-20261010-plan-1, canal cli, decidida 2026-10-11T00:51:47.325Z): Firmar y aprobar (Recomendado) / Dejar D-3 como está (Recomendado)"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-10",
    "at": "2026-10-11T00:51:47.654Z",
    "action": "plan-approved",
    "actor": "cli",
    "details": "{\"actor\":\"juan andrade\",\"source\":\"cli\",\"quote\":\"Firmar y aprobar (Recomendado) / Dejar D-3 como está (Recomendado)\",\"planHash\":\"sha256:e40ac5296cfdc9bc7da658529782ae9592f97b44aa5e9891a619c19dda9b6913\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-10",
    "at": "2026-10-11T00:51:47.955Z",
    "action": "plan-approval-verified",
    "actor": "cli",
    "details": "Aprobación del plan vigente: juan andrade (fuente cli), plan sha256:e40ac5296cfdc9bc7da658529782ae9592f97b44aa5e9891a619c19dda9b6913."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-10-10",
    "at": "2026-10-11T00:51:47.955Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  }
]
```
