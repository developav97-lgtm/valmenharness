---
schema_version: 2
id: FEATURE-BENCH-FRICCION-CORPUS-20261010
title: Corpus inicial de rechazos y comparación de dos corridas
type: FEATURE
module: BENCH
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

# FEATURE-BENCH-FRICCION-CORPUS-20261010

## Solicitud original

Parte del sprint: La fricción del CLI se mide con recorridos sin modelo, se clasifica en código y se compara entre dos binarios.
- R-MSG-004: Un mensaje de bloqueo que nombra una salida DEBE nombrar una que resuelva el bloqueo
- R-FRI-003: El corpus inicial DEBE cubrir los rechazos frecuentes del motor
- R-FRI-004: La medición DEBE comparar dos corridas y fallar si un recorrido no pudo medirse
Depende de: FEATURE-BENCH-FRICCION-RUNNER-20261010.
Viene de una feature descompuesta en sprints; su plan completo está en el tickets.yaml de la feature.

Comportamiento esperado: Un mensaje de bloqueo que nombra una salida DEBE nombrar una que resuelva el bloqueo El corpus inicial DEBE cubrir los rechazos frecuentes del motor La medición DEBE comparar dos corridas y fallar si un recorrido no pudo medirse
Comportamiento actual: la spec no lo declara; se establece en el análisis, leyendo el código.

### Fuera de alcance

Lo que el grafo asignó a otros tickets y este no hace:
- R-MSG-004: lo cubre FEATURE-CLI-PRUEBA-MENSAJES-20261010 (Prueba de coherencia de los mensajes de bloqueo del CLI y el MCP)

### Supuestos y decisiones pendientes

<!-- Si el pedido nombra algo que el código no tiene —parámetro, permiso,
campo, bandera, columna, migración— y no lo especifica, listá cada elemento
con su pregunta antes de avanzar a análisis; el análisis no planifica sobre
la adivinanza. Si no hay ninguno, escribí «Ninguno» y seguí. -->
Ninguno.

## Descripción funcional

- Alcance: la medición de fricción de `bench/friccion/`, fuera de `packages/`. Su corpus pasa de un recorrido a los ocho rechazos frecuentes del motor que nombra R-FRI-003. `run` sale con un código distinto de 0 si un recorrido no pudo medirse, y marca como no soportado el que el binario no tiene. Dos comandos nuevos: `list`, que muestra el corpus, y `compare`, que contrasta dos archivos de resultados (R-FRI-004). De R-MSG-004 este ticket cubre la parte de la medición: un mensaje que nombra una salida que no destraba queda clasificado como callejón sin salida. La prueba estática de los mensajes es de FEATURE-CLI-PRUEBA-MENSAJES-20261010. El código del producto no se toca.
- Usuario o rol afectado: quien mantiene el CLI `valmen` —el PO y los agentes que cambian sus mensajes— y la CI, que corre las pruebas de la medición.
- Comportamiento actual: el corpus tiene solo `salto-ilegal` (`bench/friccion/src/recorridos.ts:12-36`). `run` sale con 0 siempre que escribió el archivo, aunque un recorrido quede `fallido` (`bench/friccion/src/cli.ts:129-148`). No hay `list` ni `compare`: todo comando que no sea `run` se rechaza (`bench/friccion/src/cli.ts:110-112`). Un recorrido cuyo comando el binario no tiene queda `fallido`, igual que un armado roto (`bench/friccion/src/medicion.ts:120-126`).
- Comportamiento esperado: `list` muestra los ocho recorridos con su nombre y la operación que bloquean. `run` mide cada uno contra el binario dado, escribe el archivo y, si alguno quedó `fallido`, sale con un código distinto de 0. Uno que el binario no soporta queda `no_soportado` y no falla la corrida. `compare` muestra, por recorrido y en total, los bloqueos en banda, fuera de banda y callejones de dos corridas.

## Diagnóstico

- Memoria consultada (`buscar_memoria`, módulo bench y síntoma corpus, clasificación y comparación): nada resuelto sobre la medición. Aplican dos aprendizajes: AP-001 (`.valmen/memory/aprendizajes.md:5`), criterios atómicos y pasos con archivo y símbolo; y AP-003 (`.valmen/memory/aprendizajes.md:21`), que la compuerta respete la porción de R-MSG-004 asignada a este ticket.
- Causa comprobada (con `ruta:línea`): no es un defecto. Faltan el corpus y la comparación, que FEATURE-BENCH-FRICCION-RUNNER-20261010 dejó fuera de su alcance (sus «Exclusiones»). Lo que hay hoy en el código integrado:
  1. El corpus tiene un solo recorrido (`bench/friccion/src/recorridos.ts:12-36`). Su comentario ya remite a este ticket (`bench/friccion/src/recorridos.ts:5-6`).
  2. `run` devuelve 0 tras escribir el archivo (`bench/friccion/src/cli.ts:129-148`), y la ayuda lo declara así (`bench/friccion/src/cli.ts:39`).
  3. `armar` convierte en `FalloDeRecorrido` cualquier paso que sale distinto de 0 (`bench/friccion/src/medicion.ts:120-126`), y `medirRecorrido` lo vuelve `fallido` (`bench/friccion/src/medicion.ts:233-235`). No distingue «el binario no tiene este comando». `ResultadoDeRecorrido.estado` solo admite `medido` o `fallido` (`bench/friccion/src/tipos.ts:63`), y `Totales` no tiene dónde contar un no soportado (`bench/friccion/src/tipos.ts:69-75`).
  4. `extraerSalidas` reconoce una salida solo entre comillas invertidas (`bench/friccion/src/clasificador.ts:53-62`). El motor también cita salidas en una línea sangrada que empieza por `valmen `, en al menos ocho mensajes: por ejemplo, `packages/engine/src/transition.ts:203`, `packages/engine/src/transition.ts:322`, `packages/engine/src/transition.ts:402`, `packages/engine/src/approval-eligibility.ts:368` y `packages/cli/src/hermes.ts:366`. Con el extractor actual, esos bloqueos cuentan como fuera de banda aunque nombran su salida, y R-MSG-004 nunca se comprobaría sobre ellos. En la entrega sin recibo (rechazo 2, abajo) se comprobó que la salida sangrada destraba.
- El mensaje de hoy de cada rechazo del corpus, comprobado con `packages/cli/dist/main.js` (tras `npm run build` del worktree). Cada uno se corrió en un escenario armado como `crearEscenario` (`bench/friccion/src/aislamiento.ts:173-214`), con `HOME` temporal, entorno armado desde cero y trampas de modelo; ninguna trampa anotó una llamada.
  1. Salto ilegal: `transition --to approved` desde `intake` sale con código 3 y «Transición de ticket intake -> approved no permitida.» (`packages/core/src/transitions.ts:142`). No cita salida.
  2. Compuerta pedida sin su recibo previo: `transition --to awaiting_user_tests` desde `in_progress`, sin recibo de `qa-mechanical`. Sale con código 3 y «La entrega requiere correr la verificación mecánica…», con la salida en una línea sangrada: `valmen gate qa-mechanical --id <ticket>` (`packages/engine/src/transition.ts:194-208`, llamada en `packages/engine/src/transition.ts:452`).
     - Es la única transición que falla por no tener el recibo de una compuerta. Entrar a `planned` o a `approved` sin recibo no falla (`packages/engine/src/transition.ts:280`).
     - Con un criterio `test:` autorizado en `test-commands`, la salida da APPROVE con código 0 y el reintento pasa: destraba.
     - Con solo criterios `verify: manual`, en cambio, la compuerta da REVIEW con código 3 y el reintento igual pasa.
  3. `sync --check` desactualizado: tras un `sync` y una regla nueva en `.valmen/rules/`, sale con código 2 y «Hay 1 archivo(s) generados desactualizados o editados a mano; ejecute `valmen sync`: AGENTS.md» (`packages/cli/src/commands.ts:917-924`). `valmen sync` sale con 0, y el reintento también: destraba.
  4. Integración con el árbol sucio: `journey worktree integrate --id <ticket>`, con un archivo sin commitear en el checkout principal, sale con código 3 y «El checkout principal tiene cambios sin commit (…): limpia antes de integrar.» (`packages/engine/src/worktree-integrar.ts:88-91`, despachado en `packages/cli/src/worktree.ts:44-54`). La salida está en prosa.
  5. `resume` de un ticket inexistente: sale con código 2 y «La ruta canónica solicitada no existe.» (`packages/cli/src/commands.ts:483-486`). No nombra el identificador ni una salida.
  6. Bandera mal escrita: `resume --idd <ticket>` sale con código 2 y «La bandera --idd no existe para resume. Las que acepta: --id, --cliente, --quiet (más las globales …).». El mensaje sale de `packages/cli/src/command-table.ts:679-695`; se lanza en `packages/cli/src/main.ts:786` y se convierte en código 2 en `packages/cli/src/main.ts:1555-1559`. Es el rechazo que declara R-MSG-003: la salida es reescribir la bandera, no correr otro comando.
  7. QA sin referencia de build: `qa-start --id <ticket> --environment local`, en `in_qa`, sale con código 3 y «qa-start requiere --environment y --build-reference trazables.» (`packages/engine/src/append.ts:501-504`). Esa comprobación va antes que la del estado (`packages/engine/src/append.ts:507-510`), así que hoy el mensaje es el mismo en cualquier estado.
  8. Cierre sin `## Consumo de IA`: `close-attempt … --qa-status approved`, en `qa_approved` y con el bloque vacío, sale con código 3. Cita `` `valmen add-ai-usage --id <ticket> --source "<opencode|hermes|codex|manual>:<referencia>" --confidence high …` `` (`packages/engine/src/append.ts:974-983`).
     - Corrida tal como la cita, con `<referencia>` resuelto, sale con 2: «source: tiene que empezar con uno de los orígenes conocidos…».
     - La alternativa entre `<…|…>` no es un marcador que `resolverMarcadores` complete (`bench/friccion/src/clasificador.ts:68-81`). Es un callejón sin salida: el caso de R-MSG-004.
- Cómo se llega sin modelo a cada estado, comprobado con el mismo binario:
  - El ticket se escribe como archivo fijo, con el diagnóstico, el plan con la línea de aprobación, un criterio `test: node --version` y el resultado del PO ya en `## Pruebas`. Desde ahí, en orden:
    - `transition` a `analyzed` y a `planned`;
    - `approve-plan --source cli`;
    - `transition` a `approved` y a `in_progress`;
    - `gate qa-mechanical --evaluator command`, con `test-commands` declarado en la configuración del escenario;
    - `transition` a `awaiting_user_tests` y a `in_qa`;
    - `qa-start --build-reference worktree`, que exige un archivo versionado y modificado (`packages/engine/src/references.ts:125-138`);
    - `qa-close --result approved` y `transition` a `qa_approved`.
  - La integración necesita tres cosas:
    - un `.gitignore` que excluya los worktrees, porque sin él la carpeta del worktree cuenta como cambio del checkout principal;
    - el worktree creado con `git worktree add`, porque `journey worktree create` exige `node_modules` en el checkout principal;
    - un commit en la rama del ticket, sin el cual integrar responde «nada que integrar» con 0 (`packages/engine/src/worktree-integrar.ts:73-75`).
  - `sync` corre con una configuración mínima y sin `adopt`. Así se evita que `adopt` sondee `codegraph status --json` (`packages/cli/src/codegraph.ts:115`).
- Riesgo de red comprobado. Cuando `journey worktree integrate` sí integra, recompila con `npx tsc --build tsconfig.build.json` (`packages/engine/src/worktree-integrar.ts:177-186`). En el escenario, sin `node_modules`, `npx` descargó un paquete del registro de npm. Hoy el recorrido 4 no llega ahí: su bloqueo no cita salida, así que no hay reintento. Pero un mensaje que mañana cite una salida sí llegaría, y el entorno aislado no lo impide (`bench/friccion/src/aislamiento.ts:101-114`).
- Hipótesis pendientes:
  - El corpus escribe el ticket con el contrato vigente (`schema_version: 2`). Con un binario anterior de otro contrato, el armado fallaría y el recorrido quedaría `fallido`, no `no_soportado`. Se asume correcto: es «no pudo armar su escenario» (R-FRI-004).
  - «No soportado» se decidiría por el texto del binario: «Comando desconocido» (`packages/cli/src/command-table.ts:698-700`, y el de escritura que reconoce `bench/friccion/src/clasificador.ts:101-104`), o «La bandera … no existe para» en un paso del armado. Un binario que redacte distinto esos rechazos deja el recorrido `fallido`. Un subcomando ausente que responde con otro texto (por ejemplo, la lista de `packages/cli/src/worktree.ts:72-76`) se mediría como bloqueo.
  - El tiempo: hoy las 44 pruebas de la medición tardan ~13 s. Armar el recorrido más largo (cierre) toma ~2 s de binario, y cada salida rearma su escenario; se estima ~15 s por corrida completa del corpus.
- Consumidores afectados:
  - Las pruebas de la medición contra el binario real: FR-C01, FR-C02, FR-C03, FR-C10 y FR-C11 corren `run` con `RECORRIDOS` completo (`bench/friccion/test/binario-real.test.ts:31-35`), y FR-C27 corre `medir` sobre todo el corpus (`bench/friccion/test/binario-real.test.ts:118-128`). Con ocho recorridos tardan más, y cualquier recorrido `fallido` las pone en rojo. FR-C01 exige además que todos queden `medido` (`bench/friccion/test/binario-real.test.ts:56-58`). Los criterios C1 a C31 del ticket anterior citan esas pruebas por nombre, así que los nombres se conservan.
  - El paso de la CI que corre la medición (`.github/workflows/verificacion.yml:90-94`): gana tiempo de ejecución y no cambia de forma.
  - El producto: nada. `bench/` está fuera del typecheck (`tsconfig.json:35`) y de `npm test` (`vitest.config.ts:78`), y la medición no importa `packages/` (FR-C30).
  - Los archivos de resultados ya escritos (`version: 1`): `compare` los tiene que leer aunque no traigan el total nuevo de no soportados.
- Archivos y flujo investigados:
  - La spec s3 (`.valmen/features/guardas-verificacion-harness/spec/s3-friccion/spec.md:36-59`), R-MSG-003 y R-MSG-004 de s1 (`.valmen/features/guardas-verificacion-harness/spec/s1-mensajes/spec.md:46-67`) y D3 (`.valmen/features/guardas-verificacion-harness/design.md:24-30`).
  - Toda `bench/friccion/src/` y `bench/friccion/test/`.
  - En el CLI y el motor, los ocho rechazos citados arriba y lo necesario para armarlos: `packages/engine/src/transition.ts`, `packages/engine/src/append.ts`, `packages/engine/src/worktree-integrar.ts`, `packages/engine/src/references.ts`, `packages/cli/src/ceremony.ts`, `packages/cli/src/commands.ts` y `packages/cli/src/command-table.ts`.
  - El flujo de una medición: `run` → por recorrido, escenario nuevo → armado → operación → salidas extraídas → por salida, escenario rearmado, operación, salida y reintento → clase → archivo.
- Riesgos y compatibilidad:
  - Que el corpus toque la red. El recorrido de integración puede alcanzar `npx`, y hoy nada lo frena: el entorno aislado no lo cubre.
  - Que un recorrido dependa de herramientas de la máquina. `adopt` sondea `codegraph`, y por eso no se usa. Los criterios del ticket fijo solo corren `node --version`, que está en el `PATH` aislado.
  - Que una prueba fije el texto de un mensaje del producto. Un cambio de mensaje cambia la clase medida, que es lo que se quiere ver, pero rompe una prueba que la fije; el ticket que cambie el mensaje ajusta la prueba, como ya pasa con FR-C27.
  - Compatibilidad con binarios anteriores: solo se usan comandos públicos y el texto de salida. Un recorrido que el binario no soporta no debe tumbar la corrida (R-FRI-004).
- Impactos de sync, migración, Docker o despliegue: ninguno. Es una herramienta local de desarrollo fuera de `packages/`, sin datos persistidos, sin migraciones, sin contenedores y sin despliegue. La CI solo tarda más en el paso que ya existe.

## Plan

- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan). Confirma las cinco decisiones del plan: extraer también las salidas en línea sangrada, estado `no_soportado`, `run` sale con 1 si un recorrido falla, `rechazoCorrecto` para la bandera mal escrita y `npm_config_offline` en los recorridos.
- Alcance: solo `bench/friccion/`:
  - el corpus de ocho recorridos;
  - el estado `no_soportado`;
  - el código de salida de `run` ante un recorrido `fallido`;
  - los comandos `list` y `compare`;
  - la extracción de salidas citadas en una línea sangrada;
  - `npm_config_offline` en el entorno aislado;
  - y las pruebas de todo lo anterior.
- Exclusiones:
  - No se tocan `packages/`, la configuración de la raíz ni la CI: el paso de `.github/workflows/verificacion.yml:90-94` ya corre las pruebas de la medición.
  - No se corrigen los mensajes del producto que la medición clasifique fuera de banda o como callejón, como el del cierre sin consumo. Quedan medidos en el archivo de resultados, y corregirlos es de otro ticket que decide el PO. La prueba estática de R-MSG-004 es de FEATURE-CLI-PRUEBA-MENSAJES-20261010.
  - `compare` muestra; no decide si la fricción empeoró ni sale distinto de 0 por eso, porque la spec no pide un umbral.
  - C38 y C39 de FEATURE-BENCH-FRICCION-RUNNER-20261010 (el binario de un commit anterior, con `npm ci` y red) siguen siendo de ese ticket y no se dan por hechos.
- Decisiones del plan sobre las hipótesis del diagnóstico:
  - «Compuerta pedida sin su recibo previo» es la entrega: `transition --to awaiting_user_tests` sin recibo de `qa-mechanical`. Es la única transición que falla por no tener un recibo (`packages/engine/src/transition.ts:194-208`).
  - `bandera-mal-escrita` lleva `rechazoCorrecto`, con el motivo «R-MSG-003: la bandera no existe para el comando; el mensaje nombra las válidas y la salida es reescribir la operación». Los otros siete se miden como fricción, y `salto-ilegal` también, como pide el escenario de R-FRI-002.
  - Una salida es, además, una línea del mensaje con al menos dos espacios de sangría seguidos de `valmen ` (la forma de `packages/engine/src/transition.ts:203`). Se extraen en el orden en que aparecen, y un comando citado en las dos formas se prueba una vez. Una línea sin sangría sigue sin contar (FR-C16 no cambia).
  - Un recorrido queda `no_soportado` en tres casos, y entonces no suma fricción ni falla la corrida:
    - un paso `binario` del armado que el binario rechaza con «Comando desconocido»;
    - un paso `binario` del armado que rechaza con «La bandera … no existe para»;
    - una operación que rechaza con «Comando desconocido».
    La regla de la bandera mira solo el armado: la operación de `bandera-mal-escrita` sigue siendo un bloqueo.
  - Códigos de salida de `run`: 0 si todos los recorridos quedaron `medido` o `no_soportado`; 1 si alguno quedó `fallido`, después de escribir el archivo; 2, como hoy, si los argumentos no sirven.
  - El archivo sigue en `version: 1`: `no_soportado` es un estado más y `totales.no_soportados`, un campo más. `compare` recalcula los totales desde `recorridos` y no lee `totales`, así que también lee los archivos que escribió el ticket anterior.
  - El entorno aislado lleva `npm_config_offline=true`: `npx` no descarga nada y falla con `ENOTCACHED` (comprobado en un `HOME` temporal). Cubre la recompilación de `journey worktree integrate`.
  - Los recorridos que pasan por estados avanzados escriben el ticket con un paso `archivo`, como texto fijo del contrato vigente. No se usa `create`, porque su fecha cambiaría el texto; tampoco `adopt`, porque sondea `codegraph`.
- Pasos ordenados (cada prueba se escribe antes que el código que cubre y se ve fallar primero):
  1. `bench/friccion/src/tipos.ts`: `ResultadoDeRecorrido.estado` admite `"no_soportado"` y `Totales` suma `no_soportados: number`. (C20–C24)
  2. `bench/friccion/src/aislamiento.ts`, `entornoAislado`: agrega `npm_config_offline: "true"`. La ayuda de `run` en `bench/friccion/src/cli.ts` lo nombra. Prueba CO-C16 en `bench/friccion/test/aislamiento.test.ts`. (C16)
  3. `bench/friccion/src/clasificador.ts`: (C14, C15, C24)
     - `extraerSalidas` suma a las salidas entre comillas invertidas las líneas que casan con `^\s{2,}valmen\s`, sin repetir un `comando`;
     - la función nueva `esBanderaDesconocida(stderr)` reconoce «La bandera X no existe para»;
     - `totalizar` cuenta cada recorrido `no_soportado` en `no_soportados`.
     - Pruebas CO-C14, CO-C15 y CO-C24 en `bench/friccion/test/clasificador.test.ts`. FR-C15 y FR-C16 no cambian.
  4. `bench/friccion/src/medicion.ts`: (C20, C21, C22)
     - una clase nueva, `RecorridoNoSoportado`;
     - `armar` la lanza cuando un paso `binario` falla con `esComandoDesconocido` o con `esBanderaDesconocida`;
     - `medirRecorrido` la lanza cuando la operación falla con `esComandoDesconocido`, y la convierte en `estado: "no_soportado"` con su motivo.
     - Pruebas CO-C20, CO-C21 y CO-C22 en `bench/friccion/test/aislamiento.test.ts`, con el binario falso de `bench/friccion/test/binario-falso.ts`.
  5. `bench/friccion/src/recorridos.ts`: los ocho recorridos de `RECORRIDOS`, en el orden de R-FRI-003. Se agrega el texto fijo del ticket (`ticketDeLaMedicion(id)`: diagnóstico, plan con la línea de aprobación, el criterio `test: node --version` y el resultado del PO en `## Pruebas`). Cada recorrido lleva el armado que comprobó el diagnóstico: (C1, C5–C13)
     - `salto-ilegal`: sin cambios.
     - `entrega-sin-recibo`:
       - armado: `.valmen/config.yaml` con `test-commands: [node --version]`, el ticket fijo, `transition` a `analyzed` y a `planned`, `approve-plan --source cli`, y `transition` a `approved` y a `in_progress`;
       - operación: `transition --to awaiting_user_tests`.
     - `sync-desactualizado`:
       - armado: la configuración mínima, `sync` y una regla nueva en `.valmen/rules/`;
       - operación: `sync --check`.
     - `integracion-arbol-sucio`:
       - armado: un `.gitignore` que excluye los worktrees, `create`, un commit, `git worktree add -b valmen/ticket-integra`, un commit en esa rama y un archivo sin commitear en el checkout principal;
       - operación: `journey worktree integrate`.
     - `resume-inexistente`:
       - armado: `create` de un ticket;
       - operación: `resume` con otro identificador.
     - `bandera-mal-escrita`:
       - armado: `create`;
       - operación: `resume --idd`, con `rechazoCorrecto`.
     - `qa-sin-build`:
       - armado: el de la entrega, más `gate qa-mechanical --evaluator command` y `transition` a `awaiting_user_tests` y a `in_qa`;
       - operación: `qa-start --environment local`.
     - `cierre-sin-consumo`:
       - armado: el de `qa-sin-build`, más un archivo versionado y modificado, `qa-start --build-reference worktree`, `qa-close --result approved` y `transition` a `qa_approved`;
       - operación: `close-attempt --qa-status approved`, con `variables: { referencia: "friccion" }`.
  6. `bench/friccion/src/comparacion.ts`, módulo nuevo de funciones puras: (C25–C32)
     - `leerResultados(texto)` valida `version: 1` y la forma mínima del archivo;
     - `comparar(antes, despues)` arma una fila por recorrido sobre la unión de los ids, con la clase o el estado de cada lado y `ausente` cuando falta. Recalcula desde `recorridos` los totales de cada lado y su diferencia, y avisa si los `corpus.sha256` difieren;
     - `formatear` lo pasa a texto.
     - Pruebas CO-C25 a CO-C32 en `bench/friccion/test/compare.test.ts` (nuevo), con archivos de resultados sintéticos.
  7. `bench/friccion/src/cli.ts`: (C2–C4, C17–C19, C23, C25–C32)
     - `main(argv, recorridos = RECORRIDOS)`: el segundo parámetro solo lo usan las pruebas;
     - `list` imprime una línea por recorrido (`<id>  <nombre> — bloquea: <bloquea>`) y sale con 0;
     - `compare <antes.json> <despues.json>` imprime lo de `comparacion.ts`. Sale con 2 si falta un argumento, si un archivo no existe o si no es un archivo de resultados;
     - `run` devuelve 1 si `totales.fallidos > 0`, después de escribir el archivo;
     - la ayuda lista los comandos y los tres códigos.
     - Pruebas CO-C02 a CO-C04 en `bench/friccion/test/corpus.test.ts` (nuevo). CO-C17 a CO-C19 y CO-C23, en `bench/friccion/test/aislamiento.test.ts`.
  8. `bench/friccion/test/corpus.test.ts`: CO-C01 compara los ids de `RECORRIDOS` con los ocho del corpus mínimo. (C1)
  9. `bench/friccion/test/binario-real.test.ts`: un `describe` nuevo corre `medir` con `RECORRIDOS` una sola vez contra `packages/cli/dist/main.js`, en un `beforeAll` con tiempo propio de 300 s. De esa corrida leen FR-C27 y CO-C05 a CO-C13. Al ir en un `describe` aparte, `-t FR-C01` no dispara esa corrida. FR-C01, FR-C02, FR-C03, FR-C10 y FR-C11 conservan su nombre y lo que afirman. (C5–C13)
  10. Verificación desde la raíz del worktree, con `npm run build` hecho antes: (C33–C37)
      - `npx tsc -p bench/friccion/tsconfig.json` y `npx tsc -p bench/friccion/tsconfig.build.json`;
      - `npx vitest run --config bench/friccion/vitest.config.ts`, que corre los archivos de prueba de `bench/friccion/test/`;
      - `node node_modules/eslint/bin/eslint.js bench/friccion` y `node node_modules/prettier/bin/prettier.cjs --check bench/friccion`;
      - `valmen secrets`.
      - La suite del producto no se corre: este cambio no toca nada de lo que ella ve, como afirman FR-C28 y FR-C29.
  11. Validación manual del PO con `bench/friccion/dist/cli.js`, desde la raíz del repositorio (C38):
      - `npx tsc -p bench/friccion/tsconfig.build.json`;
      - `node bench/friccion/dist/cli.js list`;
      - dos corridas: `node bench/friccion/dist/cli.js run --binary packages/cli/dist/main.js --out "$TMPDIR/friccion-a.json"` y la misma con `--out "$TMPDIR/friccion-b.json"`;
      - `node bench/friccion/dist/cli.js compare "$TMPDIR/friccion-a.json" "$TMPDIR/friccion-b.json"`.
      - Esperado: ocho filas iguales y diferencia 0 en cada total.
- Responsables: la implementación la hace el subagente de la fase (sonnet). La aprobación del plan, la validación manual y la QA son del PO.
- Compatibilidad:
  - `run` sale con 1 donde antes salía con 0 cuando un recorrido queda `fallido`. Hoy no lo consume nadie fuera de las pruebas: la CI corre las pruebas, no `run`.
  - El archivo de resultados conserva `version: 1`, con un estado y un total más.
  - El producto no cambia.
- Impactos declarados: ninguno de sincronización, migración ni contenedores, y sin despliegue.
- Rollback (obligatorio): revertir el commit del ticket en la rama (`git revert <hash>`).
  - Vuelve `bench/friccion/` al corpus de un recorrido y a `run` con 0 siempre.
  - No hay datos persistidos ni configuración de la máquina que deshacer.
  - Los archivos de resultados viven donde los puso `--out`, fuera del repositorio.

<!-- Los criterios de la sección siguiente se numeran C1…Cn, con una afirmación verificable por criterio
     —una frase con «y» son dos criterios—, y cada uno lleva debajo su anotación de
     verificación: un comentario HTML que dice «test:» y el comando, o «verify: manual». La
     sección no lleva comentarios dentro: un comentario con anotación se leería como la de un
     criterio. Ejemplo en la skill planificacion. -->
## Criterios de aceptación

- [ ] C1 (R-FRI-003): `RECORRIDOS` declara los ocho recorridos del corpus mínimo en el orden de R-FRI-003
      <!-- test: npx vitest run --config bench/friccion/vitest.config.ts -t CO-C01 -->
- [ ] C2 (R-FRI-003): `list` imprime una línea por recorrido del corpus
      <!-- test: npx vitest run --config bench/friccion/vitest.config.ts -t CO-C02 -->
- [ ] C3 (R-FRI-003): cada línea de `list` lleva el nombre de su recorrido
      <!-- test: npx vitest run --config bench/friccion/vitest.config.ts -t CO-C03 -->
- [ ] C4 (R-FRI-003): cada línea de `list` lleva la operación que bloquea su recorrido
      <!-- test: npx vitest run --config bench/friccion/vitest.config.ts -t CO-C04 -->
- [ ] C5 (R-FRI-003): con `packages/cli/dist/main.js`, los ocho recorridos quedan en estado `medido`
      <!-- test: npx vitest run --config bench/friccion/vitest.config.ts -t CO-C05 -->
- [ ] C6 (R-FRI-003): con `packages/cli/dist/main.js`, el recorrido `entrega-sin-recibo` se clasifica `en_banda`
      <!-- test: npx vitest run --config bench/friccion/vitest.config.ts -t CO-C06 -->
- [ ] C7 (R-FRI-003): con `packages/cli/dist/main.js`, el recorrido `sync-desactualizado` se clasifica `en_banda`
      <!-- test: npx vitest run --config bench/friccion/vitest.config.ts -t CO-C07 -->
- [ ] C8 (R-FRI-003): con `packages/cli/dist/main.js`, el recorrido `integracion-arbol-sucio` se clasifica `fuera_de_banda`
      <!-- test: npx vitest run --config bench/friccion/vitest.config.ts -t CO-C08 -->
- [ ] C9 (R-FRI-003): con `packages/cli/dist/main.js`, el recorrido `resume-inexistente` se clasifica `fuera_de_banda`
      <!-- test: npx vitest run --config bench/friccion/vitest.config.ts -t CO-C09 -->
- [ ] C10 (R-FRI-003): con `packages/cli/dist/main.js`, el bloqueo del recorrido `bandera-mal-escrita` lleva `rechazoCorrecto`
      <!-- test: npx vitest run --config bench/friccion/vitest.config.ts -t CO-C10 -->
- [ ] C11 (R-FRI-003): con `packages/cli/dist/main.js`, el recorrido `qa-sin-build` se clasifica `fuera_de_banda`
      <!-- test: npx vitest run --config bench/friccion/vitest.config.ts -t CO-C11 -->
- [ ] C12 (R-MSG-004): con `packages/cli/dist/main.js`, el recorrido `cierre-sin-consumo` se clasifica `callejon_sin_salida`
      <!-- test: npx vitest run --config bench/friccion/vitest.config.ts -t CO-C12 -->
- [ ] C13 (R-MSG-004): la salida que cita el bloqueo de `cierre-sin-consumo` queda registrada como ejecutada
      <!-- test: npx vitest run --config bench/friccion/vitest.config.ts -t CO-C13 -->
- [ ] C14 (R-MSG-004): `extraerSalidas` devuelve el comando de una línea sangrada que empieza por `valmen `
      <!-- test: npx vitest run --config bench/friccion/vitest.config.ts -t CO-C14 -->
- [ ] C15 (R-MSG-004): `extraerSalidas` ignora una línea sin sangría que empieza por `valmen `
      <!-- test: npx vitest run --config bench/friccion/vitest.config.ts -t CO-C15 -->
- [ ] C16 (R-FRI-003): `entornoAislado` lleva `npm_config_offline` con el valor `true`
      <!-- test: npx vitest run --config bench/friccion/vitest.config.ts -t CO-C16 -->
- [ ] C17 (R-FRI-004): `run` sale con 1 cuando un recorrido queda `fallido`
      <!-- test: npx vitest run --config bench/friccion/vitest.config.ts -t CO-C17 -->
- [ ] C18 (R-FRI-004): con un recorrido `fallido`, `run` escribe el archivo de resultados
      <!-- test: npx vitest run --config bench/friccion/vitest.config.ts -t CO-C18 -->
- [ ] C19 (R-FRI-004): el archivo de resultados marca como `fallido` el recorrido que no se pudo armar
      <!-- test: npx vitest run --config bench/friccion/vitest.config.ts -t CO-C19 -->
- [ ] C20 (R-FRI-004): un paso del armado que el binario rechaza como comando desconocido deja el recorrido `no_soportado`
      <!-- test: npx vitest run --config bench/friccion/vitest.config.ts -t CO-C20 -->
- [ ] C21 (R-FRI-004): un paso del armado con una bandera que el binario no declara deja el recorrido `no_soportado`
      <!-- test: npx vitest run --config bench/friccion/vitest.config.ts -t CO-C21 -->
- [ ] C22 (R-FRI-004): una operación que el binario rechaza como comando desconocido deja el recorrido `no_soportado`
      <!-- test: npx vitest run --config bench/friccion/vitest.config.ts -t CO-C22 -->
- [ ] C23 (R-FRI-004): `run` sale con 0 cuando el único recorrido sin medir está `no_soportado`
      <!-- test: npx vitest run --config bench/friccion/vitest.config.ts -t CO-C23 -->
- [ ] C24 (R-FRI-004): `totalizar` cuenta cada recorrido `no_soportado` en `no_soportados`
      <!-- test: npx vitest run --config bench/friccion/vitest.config.ts -t CO-C24 -->
- [ ] C25 (R-FRI-004): `compare` imprime una línea por recorrido con la clase de cada corrida
      <!-- test: npx vitest run --config bench/friccion/vitest.config.ts -t CO-C25 -->
- [ ] C26 (R-FRI-004): `compare` imprime los totales de cada corrida por clase de bloqueo
      <!-- test: npx vitest run --config bench/friccion/vitest.config.ts -t CO-C26 -->
- [ ] C27 (R-FRI-004): `compare` imprime la diferencia de cada total entre las dos corridas
      <!-- test: npx vitest run --config bench/friccion/vitest.config.ts -t CO-C27 -->
- [ ] C28 (R-FRI-004): `compare` avisa cuando los `corpus.sha256` de los dos archivos difieren
      <!-- test: npx vitest run --config bench/friccion/vitest.config.ts -t CO-C28 -->
- [ ] C29 (R-FRI-004): un recorrido que falta en una de las corridas aparece en `compare` como `ausente`
      <!-- test: npx vitest run --config bench/friccion/vitest.config.ts -t CO-C29 -->
- [ ] C30 (R-FRI-004): `compare` sale con 2 cuando uno de los archivos no existe
      <!-- test: npx vitest run --config bench/friccion/vitest.config.ts -t CO-C30 -->
- [ ] C31 (R-FRI-004): `compare` sale con 2 cuando un archivo no es de resultados con `version: 1`
      <!-- test: npx vitest run --config bench/friccion/vitest.config.ts -t CO-C31 -->
- [ ] C32 (R-FRI-004): `compare` lee un archivo de resultados que no trae `totales.no_soportados`
      <!-- test: npx vitest run --config bench/friccion/vitest.config.ts -t CO-C32 -->
- [ ] C33: la medición compila con `bench/friccion/tsconfig.json`
      <!-- test: npx tsc -p bench/friccion/tsconfig.json -->
- [ ] C34: el build propio de la medición compila
      <!-- test: npx tsc -p bench/friccion/tsconfig.build.json -->
- [ ] C35: las pruebas de la medición pasan
      <!-- test: npx vitest run --config bench/friccion/vitest.config.ts -->
- [ ] C36: el lint pasa sobre `bench/friccion`
      <!-- test: node node_modules/eslint/bin/eslint.js bench/friccion -->
- [ ] C37: el formato pasa sobre `bench/friccion`
      <!-- test: node node_modules/prettier/bin/prettier.cjs --check bench/friccion -->
- [ ] C38 (R-FRI-004): `compare` de dos corridas del binario actual hechas con `bench/friccion/dist/cli.js` no muestra diferencias
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
    "at": "2026-10-10T21:47:32.175Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-10",
    "at": "2026-10-10T22:51:58.509Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-10",
    "at": "2026-10-10T22:55:41.630Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-10",
    "at": "2026-10-10T23:13:31.995Z",
    "action": "gate-approved",
    "actor": "cli",
    "details": "Gate plan aprobado por juan andrade (recibo GR-20261010-FEATURE-BENCH-FRICCION-CORPUS-20261010-plan-1, canal cli, decidida 2026-10-10T23:13:31.992Z): Aprobar tal cual (Recomendado)"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-10",
    "at": "2026-10-10T23:13:32.350Z",
    "action": "plan-approved",
    "actor": "cli",
    "details": "{\"actor\":\"juan andrade\",\"source\":\"cli\",\"quote\":\"Aprobar tal cual (Recomendado)\",\"planHash\":\"sha256:c526957dcaa997e35e5cb959b912aecf0969130addf3cb67b9da323dfe36ad1a\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-10",
    "at": "2026-10-10T23:13:32.661Z",
    "action": "plan-approval-verified",
    "actor": "cli",
    "details": "Aprobación del plan vigente: juan andrade (fuente cli), plan sha256:c526957dcaa997e35e5cb959b912aecf0969130addf3cb67b9da323dfe36ad1a."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-10",
    "at": "2026-10-10T23:13:32.661Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  }
]
```
