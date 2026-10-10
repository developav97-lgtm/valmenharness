---
schema_version: 2
id: FEATURE-CLI-PRUEBA-MENSAJES-20261010
title: Prueba de coherencia de los mensajes de bloqueo del CLI y el MCP
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
updated: 2026-10-10
related_ticket: null
target_release: null
released_in: null
---

# FEATURE-CLI-PRUEBA-MENSAJES-20261010

## Solicitud original

Parte del sprint: El CLI declara sus comandos en una tabla y una prueba comprueba que todo mensaje de bloqueo nombra comandos, banderas y salidas reales.
- R-MSG-002: Una prueba DEBE comprobar que cada comando, bandera y herramienta MCP citados en un mensaje existen
- R-MSG-004: Un mensaje de bloqueo que nombra una salida DEBE nombrar una que resuelva el bloqueo
Depende de: FEATURE-CLI-TABLA-COMANDOS-20261010.
Viene de una feature descompuesta en sprints; su plan completo está en el tickets.yaml de la feature.

Comportamiento esperado: Una prueba DEBE comprobar que cada comando, bandera y herramienta MCP citados en un mensaje existen Un mensaje de bloqueo que nombra una salida DEBE nombrar una que resuelva el bloqueo
Comportamiento actual: la spec no lo declara; se establece en el análisis, leyendo el código.

### Fuera de alcance

Lo que el grafo asignó a otros tickets y este no hace:
- R-MSG-004: lo cubre FEATURE-BENCH-FRICCION-CORPUS-20261010 (Corpus inicial de rechazos y comparación de dos corridas)

### Supuestos y decisiones pendientes

<!-- Si el pedido nombra algo que el código no tiene —parámetro, permiso,
campo, bandera, columna, migración— y no lo especifica, listá cada elemento
con su pregunta antes de avanzar a análisis; el análisis no planifica sobre
la adivinanza. Si no hay ninguno, escribí «Ninguno» y seguí. -->
Ninguno.

## Descripción funcional

- Alcance: una prueba nueva, `tests/cli-mensajes-coherencia.test.ts`, que recorre los literales de cadena de `packages/*/src/**/*.ts` y el texto de instrucciones que un agente obedece (`.valmen/skills/`, `skills/`, `AGENTS.md`, `README.md`, `templates/**/*.md` y `.valmen/rules/`), extrae cada cita de comando `valmen …` y cada herramienta MCP citada entre comillas invertidas, y las compara con la tabla de comandos de `packages/cli/src/command-table.ts` (R-MSG-001, ya integrada) y con el catálogo `TOOLS` de `packages/mcp/src/tools.ts`. Lo que no existe la hace fallar con `ruta:línea` y la pieza inexistente. El ticket corrige además las dos citas del código que hoy nombran una bandera que no existe y reemplaza la comprobación particular de `tests/skill-corrida-orquestada.test.ts:36-66`. Cubre R-MSG-002 y, de R-MSG-004, la parte estática: que la salida que nombra un mensaje de bloqueo sea un comando que el CLI acepta. Que correr esa salida saque del bloqueo lo mide la fricción (FEATURE-BENCH-FRICCION-CORPUS-20261010). Fuera: `docs/` (motivo en el diagnóstico, H2), la web de Mission Control (`packages/server/web/`, fuera de `packages/*/src`), el texto de `USAGE` (lo cruza `tests/cli-tabla-comandos.test.ts`) y los argumentos posicionales.
- Definición que usan los criterios: una cita es **válida contra la tabla** cuando su comando existe en `COMANDOS`; cuando el comando tiene verbos y la cita nombra uno, ese verbo está declarado para el comando; y cada bandera de la cita está declarada para esa ruta, globales incluidas (`banderasValidas`).
- Usuario o rol afectado: quien opera `valmen` desde la terminal (el PO) y los agentes que ejecutan lo que un rechazo, una skill o `AGENTS.md` les manda correr; también quien mantiene el CLI y escribe mensajes de bloqueo nuevos.
- Comportamiento actual: ningún mensaje se cruza con lo que el CLI acepta. Un rechazo puede nombrar un comando, un verbo, una bandera o una herramienta MCP que no existe y nada falla hasta que alguien lo ejecuta. Reproducido hoy con el binario del worktree (commit a3b8fed): el rechazo de `gate-decide --code` por ticket cambiado manda correr `valmen gate --id <ticket> --gate <compuerta>`, y esa línea sale con código 2 («La bandera --gate no existe para gate»).
- Comportamiento esperado: `npx vitest run tests/cli-mensajes-coherencia.test.ts` falla con `ruta:línea` y el nombre de la pieza que no existe (comando, verbo, bandera o herramienta) en cuanto un literal o una skill cita algo que el CLI o el MCP no tienen; pasa sobre el árbol corregido; y el rechazo de `gate-decide --code` por ticket cambiado nombra `valmen gate <compuerta> --id <ticket>`, que el parser acepta.

## Diagnóstico

- Búsqueda en la memoria (`valmen memory search`, «mensajes bloqueo comando inexistente bandera» y «CLI prueba coherencia herramienta MCP citada»): sin antecedente del síntoma; aparecen AP-001 a AP-005, de compuertas, que solo orientan cómo escribir criterios atómicos (AP-001) y cómo leer un bloqueo aislado (AP-004, AP-005).
- Causa comprobada (con `ruta:línea`):
  1. Nada cruza los mensajes con lo que el CLI y el MCP aceptan. `fail()` (`packages/core/src/errors.ts:45`) recibe texto libre y aparece 692 veces en `packages/*/src`. Una medición de solo lectura sobre el commit a3b8fed —literales de cadena leídos con el compilador de TypeScript, uniendo las concatenaciones con `+`— encuentra 77 citas `valmen …` entre comillas invertidas y 115 sin ellas en los literales del código, 40 en `.valmen/skills/`, 40 en `skills/`, 24 en `AGENTS.md`, `README.md`, `templates/` y `.valmen/rules/`, y 28 líneas de bloque de código que empiezan por `valmen`. Ejemplos de rechazos que nombran su salida: `packages/engine/src/qa-policy-close.ts:58` (`valmen qa-agent`), `packages/engine/src/journey-wave.ts:198` (`valmen journey plan`), `packages/cli/src/commands.ts:1850` (`valmen memory review`). Ejemplos de herramientas MCP citadas: `packages/engine/src/next-step.ts:206` (`buscar_memoria`), `packages/mcp/src/tools.ts:2610` (`ver_jornadas`).
  2. La única comprobación que existe es particular y valida contra otra cosa. `tests/skill-corrida-orquestada.test.ts:36-47` (`comandosCitados`) toma de una sola skill (`skills/corrida-orquestada/SKILL.md`) las palabras anteriores a la primera bandera; `:50-58` (`enLaAyuda`) las busca como texto dentro de `USAGE`, que `:61-66` (`ayudaDelCli`) lee del fuente de `packages/cli/src/main.ts`; y `:215-244` (bloque «los comandos citados (C20)») hace las afirmaciones. No mira banderas, ni las otras skills, ni el código, ni las herramientas MCP, y compara con la ayuda en vez de con lo que el CLI despacha. `tests/cli-tabla-comandos.test.ts` cruza la tabla con `USAGE` y con el despacho, no con los mensajes, y `tests/cli.test.ts:202-216` cruza las banderas de `USAGE` con `VALUE_OPTIONS`.
  3. Por eso hay hoy dos citas en el código que nombran una bandera inexistente, las dos **sin** comillas invertidas:
     - `packages/cli/src/hermes.ts:636`: en `decideByCode` (`packages/cli/src/hermes.ts:580`), el rechazo por ticket cambiado desde la notificación (`packages/cli/src/hermes.ts:630-638`) manda correr `valmen gate --id ${claims.ticket} --gate ${claims.gate}`. `gate` recibe la compuerta como argumento posicional (`gate <gate> --id <ID>`, `packages/cli/src/main.ts:355`) y la tabla no le declara `--gate` (`packages/cli/src/command-table.ts:493-496`). Reproducido: `node packages/cli/dist/main.js gate --id FEATURE-X-20261010 --gate analysis --root <carpeta vacía>` sale con 2 y «La bandera --gate no existe para gate». Es un mensaje de bloqueo cuya salida no corre: el caso de R-MSG-004.
     - `packages/adapter/src/routing.ts:145`: el rol `ui-specs` declara como consumidor `valmen routing show --role ui-specs`, y `routing show` no declara banderas propias (`packages/cli/src/command-table.ts:260-269`). Mission Control lo muestra como texto (`packages/server/web/index.html:7639-7640`); quien lo copie recibe código 2.
     Un extractor limitado a las comillas invertidas —la lectura literal de la spec— no ve ninguna de las dos.
- Dónde falta el comportamiento esperado: no existe la prueba. Va en un archivo nuevo de `tests/` que el plan crea (tests/cli-mensajes-coherencia.test.ts, sin comillas aquí porque todavía no existe), que consume la API de la tabla exportada en `packages/cli/src/index.ts:22-27` (`COMANDOS` en `packages/cli/src/command-table.ts:100`, `especDe` en `:536`, `existeComando` en `:551`, `banderasValidas` en `:657`) y el catálogo `TOOLS` (`packages/mcp/src/tools.ts:2149`, derivado de `DEFINICIONES` en `packages/mcp/src/tools.ts:305` y exportado en `packages/mcp/src/index.ts:19`; 56 herramientas). Las correcciones van en `packages/cli/src/hermes.ts:636` y `packages/adapter/src/routing.ts:145`, y el reemplazo en `tests/skill-corrida-orquestada.test.ts:36-66` y `:215-244`.
- Formas de cita que el extractor tiene que resolver, comprobadas en el código:
  - Cita partida en dos literales unidos con `+`: `packages/cli/src/commands.ts:1883-1884` (`` `valmen estandar aceptar `` + identificador) y `packages/mcp/src/tools.ts:1618-1619` (`` `valmen `` + `` sync` ``). Leídas literal por literal, se pierden.
  - Comando interpolado, que no se puede comprobar: `packages/cli/src/ceremony.ts:378` (`` `valmen ${comando}` ``); puntos suspensivos: `packages/cli/src/mcp.ts:359` (`` `valmen …` ``).
  - Verbo interpolado: `packages/cli/src/commands.ts:1732` (`valmen estandar ${verbo} … --instruccion`): la bandera solo se puede comprobar contra la unión de los verbos del comando.
  - Opcionales entre corchetes: `packages/mcp/src/tools.ts:2111` (`valmen perfiles elegir <id> [--cliente <ejecutor>]`).
  - No es cita: el marcador de versión `valmen v${version}` (`packages/adapter/src/templates.ts:217`, `packages/adapter/src/skills.ts:274`).
  - Banderas libres: `process run` (`banderasLibres` en la tabla) acepta parámetros que declara el proceso.
  - Herramientas MCP: hay muchos identificadores con guion bajo entre comillas invertidas que no son herramientas (campos como `workflow_status`). Se decide en código por prefijo: un identificador cuyo primer segmento es el de alguna herramienta real (`reanudar_`, `ver_`, `mover_`…) tiene que ser una herramienta de `TOOLS`. Con esa regla, hoy hay 83 citas válidas y ninguna inválida en el código y las skills; `` `reanudar_tiket` `` (el escenario de la spec) sí se detecta.
- Hipótesis pendientes:
  - H1: la medición de solo lectura da hoy 0 hallazgos en las skills, `AGENTS.md`, `README.md`, `templates/` y `.valmen/rules/`, y 2 en el código (los de la causa 3). Se confirma al correr la prueba nueva en rojo antes de corregir.
  - H2: `docs/` tiene 23 citas que no existen, en 12 archivos: `sync --diff` (`docs/07-ADAPTADORES.md:95`), `adopt --revert` (`docs/08-ADOPCION.md:331`), `adopt --phase` (`docs/09-MIGRACION-SAICLOUD.md:696-697`), `gate simulate --last` (`docs/10-ROADMAP.md:315`), `journey integrate` (`docs/propuesta-corrida-orquestada.md:142`), `usage report` (`docs/04-PROVEEDORES.md:489`, marcado «No implementado»), `feature amend` (`docs/02-MOTOR.md:264`), `ticket …`, `model refresh`, `status --json`, `init --template` y `migrate-to`. Son documentos de visión, diseño, hoja de ruta, propuestas y migración, que describen comandos propuestos, futuros o retirados a propósito; ninguno es un mensaje ni una instrucción que un agente ejecute. Dos sí describen como existente algo que no existe (`docs/07-ADAPTADORES.md:95` y `docs/08-ADOPCION.md:331`). Qué se corrige y qué se excluye lo decide el plan.
  - H3: `uiSpecsRoutingFor` (`packages/adapter/src/routing.ts:1544`) no tiene llamadores en `packages/*/src`: el consumidor del rol `ui-specs` es hoy solo una etiqueta. Es asunto del sprint S2 (exportaciones sin uso), no de este ticket.
  - H4: en Markdown, la forma sin comillas es ruidosa (59 coincidencias en prosa de `docs/`, como «feature list | show <slug> | new <slug> --title»). En Markdown cuentan solo las comillas invertidas y las líneas de bloque de código que empiezan por `valmen`; la forma sin comillas se lee solo en los literales del código.
- Consumidores afectados:
  - `packages/cli/src/hermes.ts:636`: el camino `gate-decide --code` del CLI y el relay de Hermes que lo invoca (`packages/adapter/src/hermes-relay.ts:104-105`). La prueba existente `tests/hermes-notify.test.ts:335-355` afirma salida distinta de 0, «cambió» en la salida de error y ninguna decisión registrada; cambiar la línea de la salida conserva las tres.
  - `packages/adapter/src/routing.ts:145`: `resolveRouting` copia `consumer` (`packages/adapter/src/routing.ts:1012`) a lo que muestran `valmen routing show` y Mission Control (`packages/server/web/index.html:7639-7640`). `tests/roles-ejecucion.test.ts:62-67` exige que no sea `null` y `tests/routing.test.ts:137` lista el rol; ninguna fija el texto.
  - `tests/skill-corrida-orquestada.test.ts`: sus demás casos no usan los ayudantes que se quitan; `PENDIENTES` (`:29-30`) lo usa también C14 (`:165-169`) y se queda; la prohibición C15 (`:185-187`) recorre las citas `valmen` con su propia expresión y tampoco cambia.
  - La tabla y `TOOLS` solo se leen: no cambian el CLI, el MCP ni sus exportaciones, y ningún código de producción consume la prueba.
  - Quien escriba en adelante un mensaje o una skill que cite algo inexistente verá fallar `npx vitest run` con `ruta:línea`: es la detección que se busca.
- Archivos y flujo investigados: `packages/core/src/errors.ts`, `packages/cli/src/command-table.ts`, `packages/cli/src/index.ts`, `packages/cli/src/main.ts` (`USAGE`, `parseArgs`), `packages/cli/src/hermes.ts` (`decideByCode`), `packages/cli/src/commands.ts`, `packages/cli/src/ceremony.ts`, `packages/cli/src/mcp.ts`, `packages/adapter/src/routing.ts`, `packages/adapter/src/templates.ts`, `packages/adapter/src/skills.ts`, `packages/adapter/src/hermes-relay.ts`, `packages/mcp/src/tools.ts` (`DEFINICIONES`, `TOOLS`), `packages/mcp/src/index.ts`, `packages/engine/src/qa-policy-close.ts`, `packages/engine/src/journey-wave.ts`, `packages/engine/src/next-step.ts`, `packages/server/web/index.html`, `tests/skill-corrida-orquestada.test.ts`, `tests/cli-tabla-comandos.test.ts`, `tests/cli.test.ts`, `tests/hermes-notify.test.ts`, `tests/roles-ejecucion.test.ts`, la spec `.valmen/features/guardas-verificacion-harness/spec/s1-mensajes/spec.md` (R-MSG-002, R-MSG-004), `.valmen/features/guardas-verificacion-harness/design.md` (D1) y la `## Implementación` de FEATURE-CLI-TABLA-COMANDOS-20261010 (hallazgos en `docs/`). Flujo de un rechazo: el motor o el CLI llaman a `fail(mensaje)` o devuelven `error(mensaje)`; `run` imprime el texto en la salida de error y sale con el código; quien lo lee copia la salida nombrada y la ejecuta, y `parseArgs` la valida contra la tabla (`packages/cli/src/main.ts:717`).
- Riesgos y compatibilidad:
  - Falsos positivos de la forma sin comillas en literales («valmen» seguido de una palabra de prosa): hoy ninguno; la versión y las interpolaciones quedan fuera por regla, y el fallo cita `ruta:línea` para reescribir la frase o ponerle comillas.
  - Falsos negativos asumidos: los argumentos posicionales y su orden no se validan (`valmen gate --id X`, sin compuerta, pasa), y una cita armada en tiempo de ejecución (`valmen ${comando}`) no se puede comprobar.
  - Costo: leer unos 223 archivos con el compilador de TypeScript, que ya es dependencia de desarrollo de la raíz (`typescript` 5.9.3): sin dependencias nuevas y sin tocar `@valmen/core`.
  - EST-009: quitar el bloque C20 de `tests/skill-corrida-orquestada.test.ts` modifica una prueba existente. Solo vale porque R-MSG-002 pide reemplazarla y si el plan aprobado lo declara con la prueba y el motivo; las demás pruebas existentes no se editan.
  - `docs/` no entra en el recorrido (H2): una cita inventada que se agregue allí no hará fallar la prueba.
- Impactos de sync, migración, Docker o despliegue: ninguno. Agrega una prueba, quita un bloque de otra y corrige dos literales de texto; no toca sincronización, migraciones del registro, contenedores ni despliegue.

## Plan

- Alcance y exclusiones: la prueba `tests/cli-mensajes-coherencia.test.ts` (nueva), las dos correcciones de texto que la prueba exige en `packages/cli/src/hermes.ts:636` y `packages/adapter/src/routing.ts:145`, y el reemplazo del bloque C20 de `tests/skill-corrida-orquestada.test.ts`. Se recorren los literales de `packages/*/src/**/*.ts` y el texto de instrucciones: `.valmen/skills/`, `skills/`, `AGENTS.md`, `README.md`, `templates/**/*.md` y `.valmen/rules/`. Quedan fuera, con su motivo escrito en la constante `EXCLUIDOS` de la prueba:
  - `docs/` (H2 del diagnóstico): visión, diseño, hoja de ruta, propuestas, migración, partes diarios y evidencia, que citan a propósito comandos propuestos, futuros o retirados; corregirlos reescribiría el registro, y R-MSG-002 acota el recorrido al código y las skills. Las dos citas de `docs/` que describen como vigente algo que no existe (`docs/07-ADAPTADORES.md:95`, `sync --diff`; `docs/08-ADOPCION.md:331`, `adopt --revert`) **no se corrigen aquí**: no tienen un reemplazo equivalente (`sync --check` falla en vez de mostrar el diff; no hay comando de reversión de la adopción), así que corregirlas es decidir contenido de documentación. Se propone un ticket DOCS aparte, que abre una persona si lo quiere.
  - `packages/server/web/`: está fuera de `packages/*/src`; hoy cita 5 comandos y todos existen.
  - `tests/`, `tickets/` y `.valmen/features/`: pruebas que citan comandos inventados a propósito, historial append-only y specs que citan los escenarios (la propia spec cita `valmen qa-agent --forzar`).
  - La parte dinámica de R-MSG-004 —que correr la salida saque del bloqueo— es de FEATURE-BENCH-FRICCION-CORPUS-20261010. Los argumentos posicionales y su orden no se validan.
- Decisión de diseño: los literales se leen con el compilador de TypeScript (`ts.createSourceFile`, del paquete `typescript` que ya es dependencia de desarrollo de la raíz), no con expresiones regulares por línea. Una regex por línea leería los comentarios —falsos positivos— y perdería las citas partidas con `+` (`packages/cli/src/commands.ts:1883-1884`, `packages/mcp/src/tools.ts:1618-1619`). Los ayudantes viven dentro del archivo de prueba: no se agrega código de producción ni exportaciones nuevas (nada nuevo para la guarda de exportaciones sin uso de S2). Además de la forma entre comillas invertidas que nombra la spec, en los literales del código se lee la forma sin comillas, porque los dos defectos reales de hoy están escritos así (diagnóstico, causa 3); en Markdown solo cuentan las comillas invertidas y las líneas de bloque de código que empiezan por `valmen` (H4).
- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan). Confirma las tres decisiones del plan: `docs/` queda fuera, se leen solo las citas con comillas invertidas en el código y se quita el bloque C20 de `tests/skill-corrida-orquestada.test.ts` (excepción de EST-009 declarada en el plan).
- Pasos ordenados:
  1. Prueba primero (EST-010): crear `tests/cli-mensajes-coherencia.test.ts` sin tocar ningún literal todavía. Contenido:
     - `literalesDe(ruta)`: `ts.createSourceFile` (`import ts from "typescript"`) y un recorrido que toma `StringLiteral`, `NoSubstitutionTemplateLiteral` y `TemplateExpression` —cada `${…}` se vuelve `<expr>`—, y une en un solo texto las cadenas de `BinaryExpression` con `+` (un operando que no es literal se vuelve `<expr>`). Cada fragmento conserva su línea, para que el hallazgo cite la línea donde aparece `valmen`. Los comentarios no se leen.
     - `citasDe(texto, origen)`: las citas `` `valmen …` `` entre comillas invertidas; en Markdown, además, las líneas de un bloque de código que empiezan por `valmen ` (cortadas en `#` y partidas en `&&`); en un literal del código, además, `valmen <comando>` sin comillas cuando va al inicio o tras espacio, `:`, `(`, `«` o comillas, y el comando va seguido de espacio, fin o puntuación. Una cita sin comillas termina en el fin de línea, en dos espacios, en `(`, ` — `, `»`, `"`, `#`, `)`, o en `.`, `;` o `,` seguidos de espacio. `v<dígito>` (marcador de versión) y `<expr>` no son comandos.
     - `revisarCita(cita)`, con `existeComando`, `especDe` y `banderasValidas` importados de `packages/cli/src/index.ts`: quita `[` y `]`; el primer token es el comando, y si no tiene forma de palabra (`<expr>`, `…`) la cita no se comprueba; si el comando tiene `subcomandos` y el segundo token es una palabra, cada alternativa de `a|b` tiene que existir (`existeComando([comando, verbo])`); si el segundo token es un marcador (`<expr>`, `<id>`), las banderas se comparan con la unión de `banderasValidas` del comando y de todos sus verbos (la forma de `packages/cli/src/commands.ts:1732`); una ruta con `banderasLibres` (`process run`) no rechaza banderas; el nombre de la bandera es `--[a-z][a-z0-9-]*`, antes de un `=`.
     - `herramientasCitadas(texto)`: cada identificador `[a-z]+(_[a-z]+)+` entre comillas invertidas cuyo primer segmento es el de alguna herramienta de `TOOLS` (importado de `packages/mcp/src/index.ts`) tiene que estar en `TOOLS`; uno con otro prefijo (`workflow_status`) no se comprueba.
     - Recorridos y `EXCLUIDOS` según «Alcance y exclusiones». Cada hallazgo se escribe `ruta:línea — <comando|verbo|bandera|herramienta> <pieza> en «<cita>»`, y la afirmación lista todos los hallazgos en su mensaje.
     - Casos sintéticos, sobre textos en memoria con una ruta ficticia, con las mismas funciones: la bandera inventada `valmen qa-agent --forzar` dentro de un `fail()`, la skill que cita `reanudar_tiket`, `journey inventado`, el comando `inventado`, la cita sin comillas `  valmen gate --id X --gate plan`, la cita partida con `+`, la interpolación `` `valmen ${comando}` `` y el identificador `workflow_status`. La cobertura que daba el bloque C20 de `tests/skill-corrida-orquestada.test.ts`: de `skills/corrida-orquestada/SKILL.md` se extraen al menos 8 citas, entre ellas `journey next` y `approval-eligibility`.
     - El caso de R-MSG-004: con el mismo andamiaje de `tests/hermes-notify.test.ts` —que no se edita—, es decir `writeFixtureTicket` de `tests/helpers/fixtures.ts`, un recibo escalado con `buildReceipt`/`appendReceipt`, `hermesNotify` con un `runner` inyectado y el ticket modificado después de notificar, se llama a `decideByCode` (`packages/cli/src/hermes.ts:580`), se toma de `stderr` la línea `valmen gate …`, se afirma la forma `valmen gate <compuerta> --id <ticket>` y se pasa por `parseArgs` (`packages/cli/src/main.ts:717`) sin `UsageError`.
     Correr `npx vitest run tests/cli-mensajes-coherencia.test.ts` y observarla en rojo: deben fallar C1 (con `packages/cli/src/hermes.ts:636` y `packages/adapter/src/routing.ts:145`), C17 y C18, y pasar el resto. El rojo observado se anota en `## Implementación`. (C1, C2, C3, C4, C5, C6, C7, C8, C9, C10, C11, C12, C13, C14, C15, C16, C17, C18)
  2. En `packages/cli/src/hermes.ts:636`, dentro de `decideByCode`, cambiar la línea de la salida a `` `  valmen gate ${claims.gate} --id ${claims.ticket}\n\n` ``, la forma que documenta `USAGE` (`packages/cli/src/main.ts:355`). No cambia nada más del rechazo: el código de salida, la palabra «cambió» y la ausencia de registro que afirma `tests/hermes-notify.test.ts:335-355`. (C1, C17, C18, C19)
  3. En `packages/adapter/src/routing.ts:145`, el consumidor del rol `ui-specs` pasa a `"valmen routing show"`: sin la bandera inexistente y sin volverlo `null`, que rompería `tests/roles-ejecucion.test.ts:62-67`. (C1, C20)
  4. Reemplazo declarado (EST-009) en `tests/skill-corrida-orquestada.test.ts`, solo con los pasos 1 a 3 en verde: quitar `comandosCitados` (`:35-47`), `enLaAyuda` (`:49-58`), `ayudaDelCli` (`:60-66`) y el bloque «los comandos citados (C20)» (`:215-244`), y cambiar el comentario de cabecera (`:11-12`) para que remita a `tests/cli-mensajes-coherencia.test.ts`. Motivo: R-MSG-002 pide reemplazar esa prueba particular; lo que afirmaba —que la skill cita al menos 8 comandos que existen y que `journey inventado` no pasa— lo afirman C11 y C16 de la prueba nueva, contra la tabla y no contra el texto de la ayuda. `PENDIENTES` (`:29-30`) y su caso C14 (`:165-169`) se quedan, y ningún otro caso del archivo se toca. (C21, C22)
  5. Desde la raíz del worktree, correr `npx vitest run tests/cli-mensajes-coherencia.test.ts`, `npx vitest run tests/hermes-notify.test.ts`, `npx vitest run tests/roles-ejecucion.test.ts tests/routing.test.ts`, `npx vitest run tests/skill-corrida-orquestada.test.ts`, `npx vitest run tests/cli-tabla-comandos.test.ts` y `npx tsc --build tsconfig.build.json`. Si una prueba que ya existía se pone en rojo, no se edita: se detiene la implementación y se reporta en el ticket con su salida y la hipótesis (EST-009). (C1–C21, C23)
- Compatibilidad: para quien usa el harness cambian solo dos textos: la salida que nombra el rechazo de `gate-decide --code` por ticket cambiado, que pasa de una línea que el CLI rechaza a una que acepta, y la etiqueta de consumidor del rol `ui-specs` en `valmen routing show` y Mission Control. No cambian el CLI, la tabla, el MCP, sus exportaciones ni los códigos de salida. En las pruebas, el bloque C20 de `tests/skill-corrida-orquestada.test.ts` se reemplaza (paso 4) y ninguna otra prueba existente se edita. Quien escriba en adelante un mensaje o una skill que cite algo inexistente verá fallar la suite con `ruta:línea`, que es el comportamiento pedido.
- Impactos declarados: ninguno; el ticket no declara sincronización, migración ni contenedores (`sync_impact`, `migration_impact` y `docker_impact` en false), y no hay despliegue.
- Pruebas previstas: directorio, la raíz del worktree; requisitos, Node 24 con las dependencias del monorepo instaladas (incluido `typescript`), sin red ni credenciales; resultado esperado, los comandos del paso 5 sin fallos. Comprobación manual opcional: `npx tsc --noEmit -p tsconfig.json` no reporta errores en `tests/cli-mensajes-coherencia.test.ts` (el comando completo tiene hoy errores ajenos en otras pruebas de `tests/vista-*`).
- Rollback (obligatorio): revertir el commit del ticket en su rama (`git revert <hash>`), que borra `tests/cli-mensajes-coherencia.test.ts`, devuelve los dos literales a su texto anterior y restaura el bloque C20 con sus ayudantes en `tests/skill-corrida-orquestada.test.ts`. No hay estado persistido, registro, configuración ni datos que restaurar. Si tras integrar la prueba da un falso positivo, el arreglo dirigido es ajustar la regla de extracción en el propio archivo de prueba; el revert queda para cuando la prueba no se pueda corregir sin cambiar su alcance.

<!-- Los criterios de la sección siguiente se numeran C1…Cn, con una afirmación verificable por criterio
     —una frase con «y» son dos criterios—, y cada uno lleva debajo su anotación de
     verificación: un comentario HTML que dice «test:» y el comando, o «verify: manual». La
     sección no lleva comentarios dentro: un comentario con anotación se leería como la de un
     criterio. Ejemplo en la skill planificacion. -->
## Criterios de aceptación

- [x] C1 — R-MSG-002: Cada cita `valmen …` de los literales de cadena de `packages/*/src/**/*.ts` es válida contra la tabla.
      <!-- test: npx vitest run tests/cli-mensajes-coherencia.test.ts -->
- [x] C2 — R-MSG-002: Cada cita `valmen …` de `.valmen/skills/` es válida contra la tabla.
      <!-- test: npx vitest run tests/cli-mensajes-coherencia.test.ts -->
- [x] C3 — R-MSG-002: Cada cita `valmen …` de `skills/` es válida contra la tabla.
      <!-- test: npx vitest run tests/cli-mensajes-coherencia.test.ts -->
- [x] C4 — R-MSG-002: Cada cita `valmen …` de `AGENTS.md`, `README.md`, `templates/**/*.md` y `.valmen/rules/` es válida contra la tabla.
      <!-- test: npx vitest run tests/cli-mensajes-coherencia.test.ts -->
- [x] C5 — R-MSG-002: Cada herramienta MCP citada entre comillas invertidas en los literales de `packages/*/src` está en `TOOLS`.
      <!-- test: npx vitest run tests/cli-mensajes-coherencia.test.ts -->
- [x] C6 — R-MSG-002: Cada herramienta MCP citada entre comillas invertidas en el texto de instrucciones recorrido está en `TOOLS`.
      <!-- test: npx vitest run tests/cli-mensajes-coherencia.test.ts -->
- [x] C7 — R-MSG-002: Un `fail()` cuyo texto dice «corre `valmen qa-agent --forzar`» produce un hallazgo con la `ruta:línea` del literal.
      <!-- test: npx vitest run tests/cli-mensajes-coherencia.test.ts -->
- [x] C8 — R-MSG-002: El hallazgo de `valmen qa-agent --forzar` nombra la bandera `--forzar`.
      <!-- test: npx vitest run tests/cli-mensajes-coherencia.test.ts -->
- [x] C9 — R-MSG-002: Una skill que cita `reanudar_tiket` entre comillas invertidas produce un hallazgo que nombra la skill.
      <!-- test: npx vitest run tests/cli-mensajes-coherencia.test.ts -->
- [x] C10 — R-MSG-002: El hallazgo de esa skill nombra la herramienta `reanudar_tiket`.
      <!-- test: npx vitest run tests/cli-mensajes-coherencia.test.ts -->
- [x] C11 — R-MSG-002: La cita `valmen journey inventado` produce un hallazgo que nombra el verbo `inventado`.
      <!-- test: npx vitest run tests/cli-mensajes-coherencia.test.ts -->
- [x] C12 — R-MSG-002: La cita `valmen inventado` produce un hallazgo que nombra el comando `inventado`.
      <!-- test: npx vitest run tests/cli-mensajes-coherencia.test.ts -->
- [x] C13 — R-MSG-002: Una cita sin comillas invertidas dentro de un literal (`  valmen gate --id X --gate plan`) produce el hallazgo de la bandera `--gate`.
      <!-- test: npx vitest run tests/cli-mensajes-coherencia.test.ts -->
- [x] C14 — R-MSG-002: Una cita partida en dos literales unidos con `+` produce el hallazgo de su bandera inexistente.
      <!-- test: npx vitest run tests/cli-mensajes-coherencia.test.ts -->
- [x] C15 — R-MSG-002: Una cita cuyo comando es una interpolación (`valmen ${comando}`) no produce hallazgo.
      <!-- test: npx vitest run tests/cli-mensajes-coherencia.test.ts -->
- [x] C16 — R-MSG-002: La prueba extrae al menos 8 citas `valmen …` de `skills/corrida-orquestada/SKILL.md`.
      <!-- test: npx vitest run tests/cli-mensajes-coherencia.test.ts -->
- [x] C17 — R-MSG-004: El rechazo de `decideByCode` por ticket cambiado nombra la salida `valmen gate <compuerta> --id <ticket>`.
      <!-- test: npx vitest run tests/cli-mensajes-coherencia.test.ts -->
- [x] C18 — R-MSG-004: `parseArgs` acepta sin `UsageError` la salida que nombra el rechazo de `decideByCode` por ticket cambiado.
      <!-- test: npx vitest run tests/cli-mensajes-coherencia.test.ts -->
- [x] C19 — R-MSG-004: Las pruebas existentes del rechazo por ticket cambiado pasan sin editarlas.
      <!-- test: npx vitest run tests/hermes-notify.test.ts -->
- [x] C20 — R-MSG-002: Las pruebas existentes del enrutado de roles pasan sin editarlas.
      <!-- test: npx vitest run tests/roles-ejecucion.test.ts tests/routing.test.ts -->
- [x] C21 — R-MSG-002: `tests/skill-corrida-orquestada.test.ts` pasa con el bloque C20 reemplazado.
      <!-- test: npx vitest run tests/skill-corrida-orquestada.test.ts -->
- [x] C22 — R-MSG-002: `tests/skill-corrida-orquestada.test.ts` ya no contiene el bloque «los comandos citados (C20)».
      <!-- verify: manual -->
- [x] C23 — R-MSG-002: El monorepo compila con las dos correcciones de texto.
      <!-- test: npx tsc --build tsconfig.build.json -->

## Puntos

```json
[]
```

## Implementación

Hecho en el worktree `.claude/worktrees/ticket-prueba-mensajes` (rama `valmen/ticket-prueba-mensajes`), siguiendo el plan paso a paso y EST-010: la prueba nueva se escribió antes de tocar ningún literal y se observó en rojo.

**Prueba primero (EST-010).** `npx vitest run tests/cli-mensajes-coherencia.test.ts` con los literales sin tocar: 15 verdes y 3 rojas, las tres que predijo el plan. C1 falló con exactamente dos hallazgos —`packages/adapter/src/routing.ts:145 — bandera --role en «valmen routing show --role ui-specs»` y `packages/cli/src/hermes.ts:636 — bandera --gate en «valmen gate --id <expr> --gate <expr>»`—, C17 con la línea recibida `valmen gate --id BUGFIX-POS-FILTRO-ORDENES-20260921 --gate plan` en vez de `valmen gate plan --id …`, y C18 con el `UsageError` de `parseArgs` («La bandera --gate no existe para gate»). Las otras 15 (C2 a C16) pasaron en el árbol sin corregir, que confirma H1: 0 hallazgos en las skills, `AGENTS.md`, `README.md`, `templates/` y `.valmen/rules/`, y solo los dos del código. Con las dos correcciones, las 18 pasan. Lo leído: 201 citas `valmen …` y 69 identificadores de herramienta en los literales de los 223 archivos de `packages/*/src`; 40, 40 y 52 citas en `.valmen/skills/`, `skills/` y el resto de las instrucciones; 7, 7 y 11 identificadores de herramienta en esas tres áreas (la medición del diagnóstico daba 192, 40, 40 y 52 citas). Cada prueba de recorrido afirma además que leyó archivos y citas, para que una lectura vacía no pase por buena.

**Cambios**
- `tests/cli-mensajes-coherencia.test.ts` (nuevo, con `prettier`): `literalesDe`, `citasDe`, `revisarCita`, `herramientasCitadas`, el recorrido con `EXCLUIDOS` (cada ruta excluida con su motivo) y los criterios C1 a C18. Importa de `packages/cli/src/index.ts` `existeComando`, `especDe`, `banderasValidas` y `parseArgs`, `TOOLS` de `packages/mcp/src/index.ts` y, para el caso de R-MSG-004, el mismo andamiaje de `tests/hermes-notify.test.ts` (`writeFixtureTicket`, `buildReceipt`, `appendReceipt`, `hermesNotify` con un `runner` inyectado y el ticket tocado después de notificar). No agrega código de producción ni exportaciones.
- `packages/cli/src/hermes.ts:636`: la salida del rechazo por ticket cambiado pasa de `valmen gate --id ${claims.ticket} --gate ${claims.gate}` a `valmen gate ${claims.gate} --id ${claims.ticket}`, la forma de `USAGE`. No cambia nada más del rechazo.
- `packages/adapter/src/routing.ts:145`: el consumidor del rol `ui-specs` pasa de `valmen routing show --role ui-specs` a `valmen routing show`.
- `tests/skill-corrida-orquestada.test.ts` (reemplazo declarado en el plan, EST-009): se quitan `comandosCitados`, `enLaAyuda`, `ayudaDelCli`, el bloque «los comandos citados (C20)» y el comentario de cabecera ahora remite a la prueba nueva. `PENDIENTES` y su caso C14 se quedan; ningún otro caso se tocó. Lo que afirmaba el bloque lo afirman ahora C11, C12 y C16 de la prueba nueva, contra la tabla.
- `scripts/exports-sin-uso.linea-base.json`: se quitan 10 entradas que la prueba nueva consume y la guarda exigió retirar (`npm run exports:check`): `packages/cli/src/command-table.ts#EspecComando`, `#EspecSubcomando`, `#banderasValidas`, `#especDe`; `packages/cli/src/index.ts#EspecComando`, `#banderasValidas`, `#especDe`, `#existeComando`, `#parseArgs`; y `packages/mcp/src/index.ts#TOOLS`. La línea base pasa de 453 a 443 entradas y no se agregó ninguna. Las otras entradas de la tabla (`COMANDOS`, `BANDERAS_GLOBALES`, `EspecBanderas` y `EspecSubcomando` del índice, `CitaDeAyuda`, `citasDeAyuda`, `comandosCitadosEnAyuda`) siguen sin consumidor y se quedan.

**Decisiones durante la implementación (no estaban en el plan).**
1. Las citas sin comillas se limpian de la cola de la frase que las rodea (`.`, `,`, `;`, `:`, `!`, `?`, comillas simples y comillas invertidas) antes de comprobarlas; es lo que evita leer `sync'` como un comando. Los terminadores son los del plan, sin agregar ninguno.
2. En Markdown, la línea de un bloque de código se corta en el primer ` #` (un comentario) y se parte en `&&`; las citas con comillas invertidas se leen igual dentro y fuera de un bloque.
3. Cuando el comando tiene verbos y la cita nombra uno que no existe, el hallazgo es solo el del verbo: no se comprueban las banderas contra una ruta que no existe.
4. Una cita sin verbo (o con un marcador en su lugar) se compara con la unión de las banderas del comando y las de todos sus verbos, que es la forma de `packages/cli/src/commands.ts:1732`; con la unión, una bandera de otro verbo no se detecta. Es el falso negativo que el diagnóstico ya asumía.
5. La línea de un hallazgo en un literal de varias líneas se busca con la misma aparición de `valmen` en lo escrito (no con la del texto interpretado), de modo que un `\n` escrito no cuenta como salto y un salto real de una plantilla sí.
6. El criterio manual C22 se verificó con `grep -c "los comandos citados (C20)" tests/skill-corrida-orquestada.test.ts` (0); se marca con esa evidencia y la persona puede contradecirla.

**Cobertura honesta.** Las tres pruebas que fallaron sin las correcciones (C1, C17 y C18) son las únicas que cambian de rojo a verde con ellas: el rojo del primer punto es el estado de los dos literales antes de corregirlos. Los casos sintéticos C7 a C15 comprueban, con las mismas funciones que recorren el repositorio, lo que cada uno nombra: la bandera inventada dentro de un `fail()` con un comentario que no se lee y una cita válida en la misma fuente (un solo hallazgo, con su `ruta:línea`), la herramienta `reanudar_tiket` junto a `ver_ticket` y al campo `workflow_status` (que no dan hallazgo), el verbo y el comando inexistentes, la cita sin comillas, la partida con `+` (sin la unión no hay cita que leer) y la interpolación, que se lee y no se rechaza.

**Lo que no se hizo, a sabiendas.** `docs/` queda fuera (decisión aprobada del plan); las dos citas de `docs/` que describen como vigente algo inexistente (`docs/07-ADAPTADORES.md:95`, `sync --diff`; `docs/08-ADOPCION.md:331`, `adopt --revert`) se proponen como un ticket DOCS aparte, que abre una persona si lo quiere. Los argumentos posicionales y su orden no se validan. `prettier` solo se aplicó al archivo nuevo; `eslint` sobre los cuatro archivos de código y prueba tocados sale limpio.

**Compatibilidad comprobada.** `tests/hermes-notify.test.ts` (45), `tests/roles-ejecucion.test.ts` y `tests/routing.test.ts` (110), `tests/skill-corrida-orquestada.test.ts` (21) y `tests/cli-tabla-comandos.test.ts` (27) pasan sin editarlas más allá del bloque declarado. Ninguna prueba que ya existía se puso en rojo.

## Pruebas

Directorio: la raíz del worktree (`/Users/juanandrade/Desktop/ValmenHarness/.claude/worktrees/ticket-prueba-mensajes`). Requisitos: Node 24 con las dependencias del monorepo instaladas (incluido `typescript`) y `npm run build` hecho para `npm run exports:check`; sin red ni credenciales.

1. Las pruebas del ticket (C1 a C18): `npx vitest run tests/cli-mensajes-coherencia.test.ts`. Esperado: 1 archivo, 18 pruebas, 0 fallos.
2. El rechazo por ticket cambiado (C19): `npx vitest run tests/hermes-notify.test.ts`. Esperado: 45 pruebas, 0 fallos, sin editar la prueba.
3. El enrutado de roles (C20): `npx vitest run tests/roles-ejecucion.test.ts tests/routing.test.ts`. Esperado: 2 archivos, 110 pruebas, 0 fallos.
4. La skill con el bloque reemplazado (C21): `npx vitest run tests/skill-corrida-orquestada.test.ts`. Esperado: 21 pruebas, 0 fallos.
5. La tabla de comandos, que la prueba nueva consume: `npx vitest run tests/cli-tabla-comandos.test.ts`. Esperado: 27 pruebas, 0 fallos.
6. Compilación (C23): `npx tsc --build tsconfig.build.json`. Esperado: sin salida y código 0. Además `npx tsc --noEmit -p tsconfig.json` (sin errores, como en main) y `npm run exports:check` (esperado: «Sin exportaciones nuevas sin consumidor; la línea base tiene 443 entradas»).
7. Compuerta mecánica: `valmen gate qa-mechanical --id FEATURE-CLI-PRUEBA-MENSAJES-20261010 --evaluator command`. Esperado: APPROVE con C1 a C21 y C23 por comando; el último recibo `qa-mechanical` de `.valmen/receipts/FEATURE-CLI-PRUEBA-MENSAJES-20261010.jsonl` es el vigente.

Validación manual (opcional, tras `npm run build`, desde la misma raíz):
- C22: `grep -c "los comandos citados (C20)" tests/skill-corrida-orquestada.test.ts` imprime `0`.
- `node packages/cli/dist/main.js gate --id FEATURE-X-20261010 --gate analysis --root "$(mktemp -d)"` sale con 2 y dice «La bandera --gate no existe para gate» (la forma que el rechazo nombraba antes); `node packages/cli/dist/main.js gate analysis --id FEATURE-X-20261010 --root "$(mktemp -d)"` ya no dice eso (falla por otra razón: la carpeta no es un registro).
- `node packages/cli/dist/main.js routing show` lista el rol `ui-specs` y `valmen routing show` ya no lleva `--role`.
- Para ver la prueba fallar: en `packages/cli/src/hermes.ts:636` poner de vuelta `--id ${claims.ticket} --gate ${claims.gate}` y correr el punto 1: fallan C1, C17 y C18, y C1 cita `packages/cli/src/hermes.ts:636 — bandera --gate`.

Evidencia de esta sesión (ejecutada en el worktree): las 18 pruebas del ticket, 3 en rojo antes de las correcciones (C1 con `routing.ts:145` y `hermes.ts:636`, C17 y C18) y las 18 en verde después; los puntos 2 a 5 en verde (45, 110, 21 y 27 pruebas); `npx tsc --build tsconfig.build.json`, `npx tsc --noEmit -p tsconfig.json` y `npm run build` sin errores; `npm run exports:check` sin hallazgos con 443 entradas; `eslint` limpio sobre los archivos tocados.

Criterios sin verificar: ninguno. C22 es manual y se verificó con el `grep` de arriba; queda marcado con esa evidencia.
Limitaciones: la prueba no comprueba los argumentos posicionales ni su orden, ni una cita armada en tiempo de ejecución (`valmen ${comando}`); `docs/` y `packages/server/web/` quedan fuera del recorrido, con su motivo en la constante `EXCLUIDOS`; que correr la salida saque del bloqueo es de FEATURE-BENCH-FRICCION-CORPUS-20261010.

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
    "date": "2026-10-10",
    "session_reference": "~/.claude/projects/-Users-juanandrade-Desktop-ValmenHarness/c2769fcf-63f8-4baf-a5d3-a4b9b7a976b8/subagents/agent-a376be4dbde21ac9d.jsonl",
    "model": "claude-sonnet-5-5",
    "reasoning_effort": "high",
    "notes": "Fase de implementación en una sesión de subagente propia de este ticket. Números sumados de la transcripción del subagente hasta el registro (49 respuestas): 98 tokens de entrada sin caché, 229673 de creación de caché y 8042695 de lectura de caché (entrada = suma de los tres), 74359 de salida. No incluye lo que el subagente gaste después del registro (compuerta, secretos, commit y entrega). Sin coste estimado: el cliente no lo expone.",
    "input_tokens": 8272466,
    "output_tokens": 74359,
    "total_tokens": 8346825,
    "estimated_cost_usd": null,
    "source": "claude:c2769fcf-63f8-4baf-a5d3-a4b9b7a976b8/agent-a376be4dbde21ac9d",
    "confidence": "medium",
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
    "at": "2026-10-10T21:47:31.688Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-10",
    "at": "2026-10-10T22:50:21.649Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-10",
    "at": "2026-10-10T22:53:52.266Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-10",
    "at": "2026-10-10T23:12:27.669Z",
    "action": "gate-approved",
    "actor": "cli",
    "details": "Gate plan aprobado por juan andrade (recibo GR-20261010-FEATURE-CLI-PRUEBA-MENSAJES-20261010-plan-1, canal cli, decidida 2026-10-10T23:12:27.664Z): Aprobar tal cual (Recomendado)"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-10",
    "at": "2026-10-10T23:12:28.003Z",
    "action": "plan-approved",
    "actor": "cli",
    "details": "{\"actor\":\"juan andrade\",\"source\":\"cli\",\"quote\":\"Aprobar tal cual (Recomendado)\",\"planHash\":\"sha256:84cd11e585b89359ae1f6b2b7e5edb075d01e68248c6e2d7a0560cdafe73d396\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-10",
    "at": "2026-10-10T23:12:28.316Z",
    "action": "plan-approval-verified",
    "actor": "cli",
    "details": "Aprobación del plan vigente: juan andrade (fuente cli), plan sha256:84cd11e585b89359ae1f6b2b7e5edb075d01e68248c6e2d7a0560cdafe73d396."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-10",
    "at": "2026-10-10T23:12:28.316Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-10-10",
    "at": "2026-10-10T23:13:13.352Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-10-10",
    "at": "2026-10-10T23:22:27.997Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-10-10",
    "at": "2026-10-10T23:23:49.809Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  }
]
```
