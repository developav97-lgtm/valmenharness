---
schema_version: 2
id: FEATURE-CLI-TABLA-COMANDOS-20261010
title: Tabla declarativa de comandos y banderas que usa el despacho
type: FEATURE
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

# FEATURE-CLI-TABLA-COMANDOS-20261010

## Solicitud original

Parte del sprint: El CLI declara sus comandos en una tabla y una prueba comprueba que todo mensaje de bloqueo nombra comandos, banderas y salidas reales.
- R-MSG-001: El CLI DEBE declarar sus comandos y banderas en una tabla que use el despacho
- R-MSG-003: El CLI NO DEBE aceptar una bandera desconocida para el comando
Viene de una feature descompuesta en sprints; su plan completo está en el tickets.yaml de la feature.

Comportamiento esperado: El CLI DEBE declarar sus comandos y banderas en una tabla que use el despacho El CLI NO DEBE aceptar una bandera desconocida para el comando
Comportamiento actual: la spec no lo declara; se establece en el análisis, leyendo el código.

### Supuestos y decisiones pendientes

<!-- Si el pedido nombra algo que el código no tiene —parámetro, permiso,
campo, bandera, columna, migración— y no lo especifica, listá cada elemento
con su pregunta antes de avanzar a análisis; el análisis no planifica sobre
la adivinanza. Si no hay ninguno, escribí «Ninguno» y seguí. -->
Ninguno.

## Descripción funcional

- Alcance: el CLI `valmen` (paquete `@valmen/cli`). Una tabla única declara cada comando y subcomando con sus banderas (con valor o booleanas); el parser y el despacho la usan, y una prueba de coherencia cruza la tabla con el despacho y con `USAGE`. Una bandera que la tabla no declara para el comando se rechaza con código de esquema (2) y el mensaje lista las válidas. Cubre R-MSG-001 y R-MSG-003 del sprint S1 de la feature `guardas-verificacion-harness` (decisión D1-B del `design.md`). Fuera de alcance: la prueba que recorre los mensajes y las skills (R-MSG-002 y R-MSG-004, ticket FEATURE-CLI-PRUEBA-MENSAJES-20261010, que depende de este), el servidor MCP y la reescritura del texto de `USAGE`, que sigue siendo texto libre.
- Usuario o rol afectado: quien invoca `valmen` desde la terminal (el PO), los agentes que siguen las skills y AGENTS.md, los scripts y ganchos que lo lanzan como proceso, y quien mantiene el CLI y agrega comandos.
- Comportamiento actual: no hay una lista de comandos; los comandos existen solo como ramas de un `switch` y de una cadena de `if`, y la ayuda es texto suelto que nadie cruza con ellas. Las banderas son una única lista plana de las que consumen valor, común a todos los comandos; cualquier otra palabra con `--` se acepta como booleana. Reproducido hoy con el binario compilado del worktree (commit 0622255): `valmen validate --id FEATURE-CLI-TABLA-COMANDOS-20261010 --inventada` sale con 0 e ignora `--inventada`; `valmen resume --idd FEATURE-CLI-TABLA-COMANDOS-20261010` no dice que `--idd` no existe, sino que hay varios tickets activos y pide `--id` (salida 6); y `valmen --version` sale con 2 y «La opción --version requiere un valor», aunque la ayuda la documenta como bandera global sin valor.
- Comportamiento esperado: el despacho resuelve el comando (y su subcomando) contra la tabla; un comando o subcomando que la tabla no tiene se rechaza nombrando los que sí hay; una bandera no declarada para ese comando sale con código 2 diciendo que no existe para ese comando y listando las válidas (`valmen resume --idd X` nombra `--id`); una bandera puede tener valor en un comando y ser booleana en otro (`--version`); y la prueba de coherencia falla nombrando el comando cuando uno de `USAGE` no está en la tabla o uno de la tabla no tiene despacho.

## Diagnóstico

- Causa comprobada (con ruta y línea):
  1. Las banderas no están asociadas a ningún comando. `VALUE_OPTIONS` (`packages/cli/src/main.ts:637-808`) es una lista plana de 121 entradas (118 distintas: `--decision`, `--actor` y `--stage` están dos veces, `packages/cli/src/main.ts:688-689`, `packages/cli/src/main.ts:737-738`, `packages/cli/src/main.ts:767`, `packages/cli/src/main.ts:774`). `parseArgs` (`packages/cli/src/main.ts:836-923`) arma con ella un único conjunto (`packages/cli/src/main.ts:847`) y, si la palabra no está ahí, la guarda como booleana sin preguntar a qué comando pertenece (`packages/cli/src/main.ts:910-911`). Por eso `--inventada` llega a `validate` como `true`, nadie la lee y el comando sale con 0. Es el síntoma de R-MSG-003.
  2. Como la lista es global, una misma bandera no puede tener valor en un comando y ser booleana en otro. `--version` lleva valor para `release-publish`, `deliver-manifest` y `transition --entity release` (`packages/cli/src/main.ts:360`, `packages/cli/src/main.ts:401`, `packages/cli/src/main.ts:456`, leída en `packages/cli/src/main.ts:1144`, `packages/cli/src/main.ts:1312` y `packages/cli/src/commands.ts:1533`), y por eso está en la lista (`packages/cli/src/main.ts:659`). Eso deja inalcanzable la rama de la bandera global (`packages/cli/src/main.ts:905-908`) y la respuesta de versión (`packages/cli/src/main.ts:1384`): `valmen --version` falla con código 2 aunque la ayuda lo documenta (`packages/cli/src/main.ts:612`).
  3. Los comandos no están declarados en ningún lado. El despacho está partido en dos: una cadena de `if` en `run` (`packages/cli/src/main.ts:1681-2217`, 47 comandos de primer nivel, de `serve` a `cascada`) que termina delegando en el `switch` de `dispatch` (`packages/cli/src/main.ts:1362-1571`, 22 más). Los subcomandos los resuelve cada módulo a su manera: comparaciones encadenadas (`journey`, `packages/cli/src/main.ts:2062-2084`; `hermes`, `packages/cli/src/main.ts:1786-1800`) o un `switch` propio (`packages/cli/src/process.ts:34-72`, `packages/cli/src/manuales.ts:27-51`, `packages/cli/src/corpus.ts:7-29`). La ayuda `USAGE` (`packages/cli/src/main.ts:162-621`) es texto libre y la única prueba que la cruza con el código compara sus `--bandera <valor>` con `VALUE_OPTIONS` (`tests/cli.test.ts:202-216`): no mira comandos. Hoy ya divergen: `execution` se despacha (`packages/cli/src/main.ts:2013`, y otra vez, inalcanzable desde `run`, en `packages/cli/src/main.ts:1518`) y no aparece en `USAGE`; `hermes relay` se despacha (`packages/cli/src/main.ts:1793`) y la línea de la ayuda solo nombra `status|connect|test|notify|brief` (`packages/cli/src/main.ts:560`). Es la ausencia que pide R-MSG-001.
- Dónde falta el comportamiento esperado: no existe el símbolo de la tabla; la falta está en `parseArgs` (`packages/cli/src/main.ts:910-911`, donde debería consultar las banderas del comando) y en el arranque de `run` (`packages/cli/src/main.ts:1662-1680`, donde debería resolver el comando contra la tabla antes de la cadena de `if`). La tabla vivirá en un módulo nuevo del paquete CLI, junto a `main.ts`.
- Hipótesis pendientes:
  - H1 (inventario de banderas por comando): las banderas se leen solo dentro de `packages/cli/src` (ningún otro paquete recibe el mapa crudo `Record<string, string | true>`; hay 70 firmas que lo reciben en el CLI). Con búsqueda por los lectores directos (`flags["x"]`, `flag()`, `texto()`, `value()`, `bandera()`) aparecen 112 nombres distintos; 29 de los 118 de `VALUE_OPTIONS` se leen por ayudantes locales (y `--root` y `--tickets-dir` los consume el propio parser) (por ejemplo `obligatoria("title")` en `runAppend`, `packages/cli/src/main.ts:1085-1263`) y no salen con esa búsqueda, y tres (`--every`, `--via`, `--dir`) no tienen lector: son del disparador retirado, cuyo comando las ignora a propósito (`packages/cli/src/commands.ts:3904-3907`). Que el inventario por comando sea completo no está comprobado; se comprueba al construir la tabla, comando por comando, contra su lector.
  - H2 (invocaciones fuera del repositorio): los ganchos, tareas programadas y configuraciones de Hermes en otros proyectos pueden pasar banderas que hoy se ignoran. No se ven desde este repositorio; si existen, empezarán a fallar con código 2 y un mensaje que nombra las banderas válidas.
- Consumidores afectados:
  - Parser y despacho: `parseArgs`, `dispatch` y `run` (`packages/cli/src/main.ts:836`, `packages/cli/src/main.ts:1362`, `packages/cli/src/main.ts:1661`), exportados por `packages/cli/src/index.ts:20`. `VALUE_OPTIONS` y `USAGE` se exportan desde `main.ts` y los leen pruebas.
  - Los parámetros dinámicos de `process run`: `valorDeParametrosDeProceso` (`packages/cli/src/main.ts:1046-1063`) agrega como banderas con valor los parámetros que el proceso declara; si no puede leer el proceso devuelve una lista vacía y deja que el motor dé el error. La tabla tiene que admitir esas banderas solo para `process run`.
  - Comandos que reenvían todo su mapa de banderas a otro camino: `delegation` y `approve` pasan sus banderas a `runGateFromFlags` (`packages/cli/src/main.ts:1580-1652`, que lee `evaluator`, `credentials`, `dry-run` y `force-reason`); sus entradas en la tabla tienen que declarar también esas.
  - Invocaciones como proceso dentro del repositorio: el relay de Hermes corre `gate-decide --code --decision --actor --root` (`packages/adapter/src/hermes-relay.ts:104-105`) y `scripts/medir-salida-s1-s3.mjs:18` corre `--root <r> validate --all` y `precision`. Siguen valiendo si la tabla las declara.
  - Pruebas: 25 archivos de `tests/` importan `parseArgs`, `dispatch`, `run`, `USAGE` o `VALUE_OPTIONS` de `main.ts` (entre otros `tests/cli.test.ts`, `tests/aprendizajes.test.ts`, `tests/report-delivery.test.ts`, `tests/retiro-disparador.test.ts`, `tests/docs-perfil-hermes.test.ts`, `tests/docs-cascada-verificada.test.ts`); las que pasan una bandera no declarada para su comando van a fallar, y eso es la detección que se busca. `tests/skill-corrida-orquestada.test.ts:60-66` lee `USAGE` del código fuente; no cambia.
  - Texto que cita invocaciones: las skills (`.valmen/skills/` y `skills/`, 25 invocaciones con bandera cada una), `AGENTS.md`, `templates/` y `docs/`. Una cita con una bandera inexistente empezará a fallar cuando un agente la ejecute; la prueba que las recorre es R-MSG-002, del ticket siguiente.
  - No afectado: el servidor MCP llama a las funciones de comando directamente con su propio mapa de banderas (`packages/mcp/src/tools.ts:150`), sin `parseArgs`, así que el rechazo en el borde del CLI no lo toca; Mission Control usa el motor, no el CLI.
- Archivos y flujo investigados: `packages/cli/src/main.ts` (USAGE, VALUE_OPTIONS, parseArgs, runAppend, runTransition, dispatch, runGateFromFlags, run), `packages/cli/src/process.ts`, `packages/cli/src/manuales.ts`, `packages/cli/src/corpus.ts`, `packages/cli/src/commands.ts`, `packages/cli/src/index.ts`, `packages/mcp/src/tools.ts`, `packages/adapter/src/hermes-relay.ts`, `scripts/medir-salida-s1-s3.mjs`, `tests/cli.test.ts`, `tests/skill-corrida-orquestada.test.ts`, la spec `.valmen/features/guardas-verificacion-harness/spec/s1-mensajes/spec.md` y `.valmen/features/guardas-verificacion-harness/design.md` (D1). Flujo: `run(argv)` llama a `parseArgs` (`packages/cli/src/main.ts:1664`), que convierte un `UsageError` en código 2 (`packages/cli/src/main.ts:1666-1668`); luego la cadena de `if` elige el comando y, si no es ninguno de los suyos, llama a `dispatch` (`packages/cli/src/main.ts:2217`), cuyo `default` responde «Comando desconocido» (`packages/cli/src/main.ts:1567`). La memoria del proyecto no tiene antecedente (búsqueda por parser, bandera desconocida y tabla de comandos: solo AP-002 y AP-009, sin relación).
- Riesgos y compatibilidad:
  - El cambio de comportamiento es deliberado: toda invocación que hoy pasa una bandera que su comando no lee deja de salir con 0 y sale con 2. El riesgo real es el contrario: una bandera que el comando **sí** lee y la tabla olvida, que rompería una invocación válida. Lo cubre el inventario de H1 y las pruebas existentes que llaman a cada comando con sus banderas.
  - El orden de los argumentos: hoy una bandera con valor puede ir antes del comando (`--root X validate`), porque la lista es global. Si el parser necesita el comando para saber si una bandera consume valor, hay que ubicar el comando antes de analizar; si no, `--id X validate` se rompe.
  - `process run` con un proceso ilegible: si la tabla exige sus parámetros, el error del motor («el proceso no existe») quedaría tapado por uno de bandera desconocida.
  - El ticket siguiente (R-MSG-002) consume la tabla para validar comandos y banderas citados; su forma tiene que exponer «existe este comando» y «estas son sus banderas».
  - Sin dependencias nuevas: `@valmen/cli` sigue sin framework de argumentos, como pide el comentario de cabecera de `packages/cli/src/main.ts:11-14`.
- Impactos de sync, migración, Docker o despliegue: ninguno. No toca sincronización, migraciones del registro, contenedores ni despliegue; cambia el binario local `valmen` y sus pruebas.

## Plan

- Alcance y exclusiones: una tabla de comandos, subcomandos y banderas en un módulo nuevo del CLI, usada por el parser (qué banderas acepta cada comando y cuáles consumen valor) y por el despacho (resolver el comando antes de la cadena de `if`), más la prueba de coherencia entre tabla, ramas de despacho y `USAGE`. Quedan fuera: R-MSG-002 y R-MSG-004 (FEATURE-CLI-PRUEBA-MENSAJES-20261010), el servidor MCP (`packages/mcp/src/tools.ts` llama a los comandos sin pasar por el parser y no cambia), la reescritura del texto de `USAGE` y la validación de los argumentos posicionales (identificadores, compuertas, consultas), que sigue en cada manejador.
- Decisión de diseño: confirma D1-B de `.valmen/features/guardas-verificacion-harness/design.md`. La tabla es de datos y el despacho la consulta; la cadena de `if` de `run` (`packages/cli/src/main.ts:1681-2217`) se conserva. Descartado: mover esas ~540 líneas a un mapa de manejadores tipado por la tabla, que daría la exhaustividad por el compilador a cambio de rehacer todo el despacho sin efecto visible; la prueba de coherencia del paso 7 comprueba lo mismo leyendo el código.
- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan).
- Pasos ordenados:
  1. Inventario por comando, antes de escribir la tabla: recorrer cada rama de `run` (`packages/cli/src/main.ts:1681-2217`) y de `dispatch` (`packages/cli/src/main.ts:1362-1571`) hasta su manejador en `packages/cli/src/commands.ts`, `packages/cli/src/delegation.ts`, `packages/cli/src/ceremony.ts`, `packages/cli/src/execution.ts`, `packages/cli/src/features.ts`, `packages/cli/src/setup.ts`, `packages/cli/src/journey-handoff.ts`, `packages/cli/src/worktree.ts`, `packages/cli/src/run.ts`, `packages/cli/src/hermes.ts`, `packages/cli/src/process.ts`, `packages/cli/src/manuales.ts` y `packages/cli/src/corpus.ts`, y anotar las banderas que lee cada comando y subcomando —directas y por los ayudantes `flag()`, `texto()`, `value()`, `bandera()` y `obligatoria()`—, con valor o booleanas, incluidas las que `approve` y `delegation` reenvían a `runGateFromFlags` (`evaluator`, `dry-run`, `force-reason`). `journey install-trigger` declara `--every`, `--via` y `--dir` para seguir respondiendo su mensaje de retiro, y `process run` se marca con banderas libres porque el motor valida sus parámetros contra el proceso declarado (`packages/cli/src/commands.ts:2169-2215`). (C1, C3, C6, C7, C18)
  2. Crear `packages/cli/src/command-table.ts` con el tipo `EspecComando` (`conValor`, `booleanas`, `subcomandos?`, `subcomandoPorDefecto?` —`hermes` sin verbo es `status`—, `banderasLibres?`), `BANDERAS_GLOBALES` (`--root`, `--tickets-dir`, `--credentials` con valor; `--legacy-layout`, `--help`, `-h`, `--version` booleanas), la tabla `COMANDOS` con el inventario del paso 1 (incluidos el alias `list` y `execution`, que hoy se despacha sin figurar en la ayuda) y las funciones puras `especDe(ruta)`, `existeComando(ruta)`, `banderasValidas(ruta)`, `mensajeBanderaDesconocida(bandera, ruta)`, `comandoDesconocido(nombre)` y `comandosCitadosEnAyuda(usage)`. El módulo no importa de `packages/cli/src/main.ts` ni de `packages/cli/src/index.ts` (AP-002: un import del índice del propio paquete esconde un ciclo). (C1, C2, C3, C4, C5)
  3. En `packages/cli/src/main.ts`, reemplazar la lista literal `VALUE_OPTIONS` (`:637-808`) por la unión de las banderas con valor de la tabla, sin repetidas, conservando el nombre exportado. (C8)
  4. En `packages/cli/src/main.ts`, `parseArgs` (`:836-923`) analiza en dos pasadas sin cambiar su firma ni su `Options`: la primera, tolerante y con la unión de banderas con valor, solo ubica el comando y su subcomando, de modo que `--id X validate` sigue valiendo; la segunda analiza con las banderas globales más las del comando y su subcomando, y ante una bandera no declarada lanza `UsageError` —que `run` ya convierte en código 2 (`:1666-1668`)— con `mensajeBanderaDesconocida`, que dice «La bandera --idd no existe para resume» y lista las que acepta. `--version` es booleana global salvo en los comandos que la declaran con valor (`release-publish`, `deliver-manifest`, `transition`), lo que vuelve alcanzables `:905-908` y `:1384`. Con un comando desconocido, un subcomando no declarado o `banderasLibres`, la segunda pasada usa la unión como hoy y no rechaza, para que respondan los mensajes de siempre. (C9, C10, C11, C12, C13, C14, C15, C17, C18)
  5. En `packages/cli/src/main.ts`, `run` (`:1661`) resuelve el comando contra la tabla antes de la cadena de `if`, y un comando que la tabla no tiene responde `comandoDesconocido()`, el mismo texto que hoy da el `default` de `dispatch` (`:1567`), que pasa a usar esa función. (C2, C16)
  6. Exportar desde `packages/cli/src/index.ts` la API de la tabla (`COMANDOS`, `BANDERAS_GLOBALES`, `especDe`, `existeComando`, `banderasValidas`), que es lo que consume FEATURE-CLI-PRUEBA-MENSAJES-20261010. (C1)
  7. Crear `tests/cli-tabla-comandos.test.ts` con: (a) los comandos con rama en `packages/cli/src/main.ts` —`command === "x"`, `case "x":` y el conjunto `ESCRITURA`— son exactamente los de primer nivel de la tabla; (b) cada subcomando de la tabla aparece como literal en el despachador de su comando; (c) `comandosCitadosEnAyuda(USAGE)` no devuelve nada fuera de la tabla, y sobre `USAGE` más una línea `  inventado --x` devuelve `inventado`; (d) las banderas de cada línea de comando de `USAGE` están declaradas para ese comando; (e) las banderas que leen los manejadores de `packages/cli/src` están en la tabla; (f) `VALUE_OPTIONS` no tiene repetidas; (g) los rechazos, por `run([...])` con la salida capturada: `resume --idd X` y `validate --id X --inventada`; (h) la compatibilidad: `--version`, `release-publish --version 1.2.3`, `--id X validate`, el comando `pepe` y `journey inventado`. (C1–C17)
  8. Desde la raíz del worktree, correr `npx vitest run tests/cli-tabla-comandos.test.ts`; después las 25 pruebas que importan `packages/cli/src/main.ts`: `tests/aprendizajes.test.ts`, `tests/aprobacion-de-lote.test.ts`, `tests/cascada-tareas.test.ts`, `tests/cli.test.ts`, `tests/codegraph-montaje.test.ts`, `tests/corpus-rag.test.ts`, `tests/docs-cascada-verificada.test.ts`, `tests/docs-perfil-hermes.test.ts`, `tests/elegibilidad-aprobacion.test.ts`, `tests/gate-human-decision.test.ts`, `tests/gate-promotion.test.ts`, `tests/jornada-handoff.test.ts`, `tests/journey-ola-cli.test.ts`, `tests/manuales-auditar.test.ts`, `tests/manuales-pendientes.test.ts`, `tests/manuales-plantilla.test.ts`, `tests/modo-ask.test.ts`, `tests/presupuestos.test.ts`, `tests/process-engine.test.ts`, `tests/process-gates.test.ts`, `tests/report-delivery.test.ts`, `tests/retiro-disparador.test.ts`, `tests/value.test.ts`, `tests/verificacion-puesta-en-marcha.test.ts` y `tests/worktree-cli.test.ts` (la comparación de `tests/cli.test.ts:202-216` sigue valiendo sin cambios); y por último `npx tsc --build tsconfig.build.json`. Si una prueba existente falla por una bandera rechazada, se corrige la tabla cuando el comando la lee, o la prueba cuando la bandera sobraba, y se anota en `## Implementación`. (C18, C19, C20)
- Compatibilidad: cambia a propósito una sola cosa para quien usa el CLI: una bandera que su comando no declara deja de ignorarse y sale con código 2 (R-MSG-003); y se corrige `valmen --version`, que hoy falla. Se conserva lo demás: las firmas y exportaciones de `parseArgs`, `dispatch`, `run`, `USAGE` y `VALUE_OPTIONS`; las banderas antes del comando; los mensajes de comando y subcomando desconocidos; los parámetros de `process run`; las invocaciones del relay de Hermes (`packages/adapter/src/hermes-relay.ts:104-105`) y de `scripts/medir-salida-s1-s3.mjs:18`, que la tabla declara; y el servidor MCP, que no pasa por el parser. Las invocaciones fuera del repositorio (H2) no se pueden comprobar desde aquí: si pasan una bandera sobrante, el mensaje nombra las válidas.
- Impactos declarados: ninguno; el ticket no declara sincronización, migración ni contenedores (`sync_impact`, `migration_impact` y `docker_impact` en false), y no hay despliegue.
- Pruebas previstas: directorio, la raíz del worktree; requisitos, Node 24 con las dependencias del monorepo instaladas, sin red ni credenciales; resultado esperado, los comandos del paso 8 sin fallos y la compilación sin errores. Comprobación manual opcional tras `npm run build`: `node packages/cli/dist/main.js resume --idd X` sale con 2 y nombra `--id`, y `node packages/cli/dist/main.js --version` imprime `0.0.1`.
- Rollback (obligatorio): revertir el commit del ticket en su rama (`git revert <hash>`), que devuelve la lista literal `VALUE_OPTIONS`, el parser de una pasada y el despacho sin tabla, y borra `packages/cli/src/command-table.ts` con su prueba. No hay estado persistido, registro, configuración ni datos que migrar o restaurar. Si tras integrar aparece una invocación válida rechazada, el arreglo dirigido es declarar esa bandera en la tabla; el revert queda para cuando el rechazo afecte a más de un comando.

<!-- Los criterios de la sección siguiente se numeran C1…Cn, con una afirmación verificable por criterio
     —una frase con «y» son dos criterios—, y cada uno lleva debajo su anotación de
     verificación: un comentario HTML que dice «test:» y el comando, o «verify: manual». La
     sección no lleva comentarios dentro: un comentario con anotación se leería como la de un
     criterio. Ejemplo en la skill planificacion. -->
## Criterios de aceptación

- [ ] C1 — R-MSG-001: Cada comando de primer nivel que despacha `packages/cli/src/main.ts` figura en la tabla de `packages/cli/src/command-table.ts`.
      <!-- test: npx vitest run tests/cli-tabla-comandos.test.ts -->
- [ ] C2 — R-MSG-001: Cada comando de la tabla tiene una rama de despacho en `packages/cli/src/main.ts`.
      <!-- test: npx vitest run tests/cli-tabla-comandos.test.ts -->
- [ ] C3 — R-MSG-001: Cada subcomando de la tabla aparece en el despachador de su comando.
      <!-- test: npx vitest run tests/cli-tabla-comandos.test.ts -->
- [ ] C4 — R-MSG-001: Cada comando citado en `USAGE`, con su subcomando, figura en la tabla.
      <!-- test: npx vitest run tests/cli-tabla-comandos.test.ts -->
- [ ] C5 — R-MSG-001: Un comando agregado a `USAGE` sin entrada en la tabla hace fallar la comprobación con un mensaje que nombra ese comando.
      <!-- test: npx vitest run tests/cli-tabla-comandos.test.ts -->
- [ ] C6 — R-MSG-001: Cada bandera que `USAGE` documenta en la línea de un comando está declarada para ese comando en la tabla.
      <!-- test: npx vitest run tests/cli-tabla-comandos.test.ts -->
- [ ] C7 — R-MSG-001: Cada bandera que leen los manejadores de `packages/cli/src` está declarada en la tabla.
      <!-- test: npx vitest run tests/cli-tabla-comandos.test.ts -->
- [ ] C8 — R-MSG-001: `VALUE_OPTIONS` se deriva de la tabla sin entradas repetidas.
      <!-- test: npx vitest run tests/cli-tabla-comandos.test.ts -->
- [ ] C9 — R-MSG-003: `valmen resume --idd X` sale con código 2.
      <!-- test: npx vitest run tests/cli-tabla-comandos.test.ts -->
- [ ] C10 — R-MSG-003: El rechazo de `resume --idd X` dice que `--idd` no existe para `resume`.
      <!-- test: npx vitest run tests/cli-tabla-comandos.test.ts -->
- [ ] C11 — R-MSG-003: El rechazo de `resume --idd X` nombra `--id` entre las banderas válidas de `resume`.
      <!-- test: npx vitest run tests/cli-tabla-comandos.test.ts -->
- [ ] C12 — R-MSG-003: `valmen validate --id X --inventada` sale con código 2 sin validar el ticket.
      <!-- test: npx vitest run tests/cli-tabla-comandos.test.ts -->
- [ ] C13 — R-MSG-003: `valmen --version` imprime la versión con código de salida 0.
      <!-- test: npx vitest run tests/cli-tabla-comandos.test.ts -->
- [ ] C14 — R-MSG-003: `valmen release-publish --version 1.2.3` entrega `1.2.3` como valor de `--version`.
      <!-- test: npx vitest run tests/cli-tabla-comandos.test.ts -->
- [ ] C15 — R-MSG-003: Una bandera con valor escrita antes del comando sigue aceptada (`--id X validate`).
      <!-- test: npx vitest run tests/cli-tabla-comandos.test.ts -->
- [ ] C16 — R-MSG-001: Un comando que no está en la tabla conserva el mensaje «Comando desconocido».
      <!-- test: npx vitest run tests/cli-tabla-comandos.test.ts -->
- [ ] C17 — R-MSG-003: Un subcomando desconocido conserva el mensaje de su módulo (`journey inventado` responde «journey admite:»).
      <!-- test: npx vitest run tests/cli-tabla-comandos.test.ts -->
- [ ] C18 — R-MSG-003: `process run` sigue aceptando los parámetros que declara el proceso.
      <!-- test: npx vitest run tests/process-engine.test.ts tests/process-gates.test.ts -->
- [ ] C19 — R-MSG-003: Las pruebas que importan `packages/cli/src/main.ts` pasan con la tabla.
      <!-- test: npx vitest run tests/aprendizajes.test.ts tests/aprobacion-de-lote.test.ts tests/cascada-tareas.test.ts tests/cli.test.ts tests/codegraph-montaje.test.ts tests/corpus-rag.test.ts tests/docs-cascada-verificada.test.ts tests/docs-perfil-hermes.test.ts tests/elegibilidad-aprobacion.test.ts tests/gate-human-decision.test.ts tests/gate-promotion.test.ts tests/jornada-handoff.test.ts tests/journey-ola-cli.test.ts tests/manuales-auditar.test.ts tests/manuales-pendientes.test.ts tests/manuales-plantilla.test.ts tests/modo-ask.test.ts tests/presupuestos.test.ts tests/process-engine.test.ts tests/process-gates.test.ts tests/report-delivery.test.ts tests/retiro-disparador.test.ts tests/value.test.ts tests/verificacion-puesta-en-marcha.test.ts tests/worktree-cli.test.ts -->
- [ ] C20 — R-MSG-001: El monorepo compila con la tabla.
      <!-- test: npx tsc --build tsconfig.build.json -->

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
    "at": "2026-10-10T21:47:31.433Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-10",
    "at": "2026-10-10T22:06:54.297Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-10",
    "at": "2026-10-10T22:12:49.726Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-10",
    "at": "2026-10-10T22:19:08.221Z",
    "action": "gate-approved",
    "actor": "cli",
    "details": "Gate plan aprobado por juan andrade (recibo GR-20261010-FEATURE-CLI-TABLA-COMANDOS-20261010-plan-1, canal cli, decidida 2026-10-10T22:19:08.212Z): Aprobar tal cual (Recomendado)"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-10",
    "at": "2026-10-10T22:19:08.559Z",
    "action": "plan-approved",
    "actor": "cli",
    "details": "{\"actor\":\"juan andrade\",\"source\":\"cli\",\"quote\":\"Aprobar tal cual (Recomendado)\",\"planHash\":\"sha256:5b5d4864bee9ceae596fc08e023d135dbe7d19bd8d572ace047a8cafb0b9c514\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-10",
    "at": "2026-10-10T22:19:08.872Z",
    "action": "plan-approval-verified",
    "actor": "cli",
    "details": "Aprobación del plan vigente: juan andrade (fuente cli), plan sha256:5b5d4864bee9ceae596fc08e023d135dbe7d19bd8d572ace047a8cafb0b9c514."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-10",
    "at": "2026-10-10T22:19:08.872Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  }
]
```
