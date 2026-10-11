---
schema_version: 2
id: FEATURE-CLI-PRUEBA-CASCADA-GUIONADA-20261010
title: Prueba de valmen gate con cascada completa y modelo guionado
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

# FEATURE-CLI-PRUEBA-CASCADA-GUIONADA-20261010

## Solicitud original

Parte del sprint: La cascada y las compuertas se prueban de punta a punta con un modelo guionado local, sin claves ni red.
- R-GUI-002: Una prueba DEBE correr `valmen gate` con la cascada completa contra un modelo guionado local
- R-GUI-003: La prueba DEBE correr en `npm test` sin claves ni red
- R-GUI-004: Un guion que se agota NO DEBE producir un recibo aprobado
Depende de: FEATURE-CREDENTIALS-URL-BASE-PRUEBA-20261010.
Viene de una feature descompuesta en sprints; su plan completo está en el tickets.yaml de la feature.

Comportamiento esperado: Una prueba DEBE correr `valmen gate` con la cascada completa contra un modelo guionado local La prueba DEBE correr en `npm test` sin claves ni red Un guion que se agota NO DEBE producir un recibo aprobado
Comportamiento actual: la spec no lo declara; se establece en el análisis, leyendo el código.

### Supuestos y decisiones pendientes

<!-- Si el pedido nombra algo que el código no tiene —parámetro, permiso,
campo, bandera, columna, migración— y no lo especifica, listá cada elemento
con su pregunta antes de avanzar a análisis; el análisis no planifica sobre
la adivinanza. Si no hay ninguno, escribí «Ninguno» y seguí. -->
- «El recibo guarda las tres respuestas» (escenario de R-GUI-002, `.valmen/features/guardas-verificacion-harness/spec/s6-modelo-guionado/spec.md:36-39`): el recibo de hoy guarda la respuesta del productor para lo que no se escaló (`modelAnswers`), la probabilidad del verificador (`escalations[].verified`, `packages/gate/src/receipt.ts:289-302`) y la respuesta del escalado para lo escalado (`modelAnswers` y `escalations[].to`), pero **no** el valor original que dio el productor a la proposición escalada: `packages/engine/src/cascade.ts:377-380` lo reemplaza y `EscalationRecord` no tiene campo para él. Pregunta al PO: ¿basta con esas tres huellas o el recibo debe guardar también el valor original del productor de cada proposición escalada (un campo nuevo y opcional de `EscalationRecord`)? Mientras no lo pida, el plan no cambia el contrato del recibo y la prueba comprueba las tres huellas que ya existen.

**Respuesta del PO (2026-10-10):** «Bastan las huellas de hoy (Recomendado)». El recibo no cambia: el escenario de R-GUI-002 se lee como la respuesta del productor para lo no escalado, la probabilidad del verificador y la respuesta del escalado; el ticket no toca el paquete `gate`.

## Descripción funcional

- Alcance: una prueba de punta a punta que corre el binario compilado `valmen gate analysis --evaluator cascade` como subproceso, sobre un registro temporal, contra un modelo guionado local —un servidor HTTP en `127.0.0.1` para los transportes HTTP y jev, y un `claude` falso por `VALMEN_CLAUDE_BIN` para `claude-code`—, y comprueba el recibo escrito (R-GUI-002), sin claves ni red y dentro de `npm test` (R-GUI-003), y que un guion agotado no deja un recibo aprobado (R-GUI-004). Incluye el requisito de seguridad heredado del hallazgo H1 de FEATURE-CREDENTIALS-URL-BASE-PRUEBA-20261010 (decisión del PO del 2026-10-10, «Integrar y cerrarlo en el ticket de la cascada (Recomendado)», `tickets/2026/FEATURE-CREDENTIALS-URL-BASE-PRUEBA-20261010/ticket.md:217-223`): con una `VALMEN_BASE_URL_*` activa, la cascada y jev no degradan al servicio de siempre, y la cadena va completa —todos sus transportes y jev con su variable— o la compuerta falla diciendo cuál falta. Fuera de alcance: cambiar el contrato del recibo (ver el supuesto de arriba), una costura de inyección en el CLI (D6 la descarta, `.valmen/features/guardas-verificacion-harness/design.md:55-62`), la URL de prueba en sí (ya integrada por el ticket anterior) y las degradaciones sin URL de prueba activa, que no cambian.
- Usuario o rol afectado: quien cambia la cascada, el CLI de compuertas o los transportes, que hoy no tiene una prueba del camino real —binario, `routing.yaml`, transporte, recibo— sin gastar tokens; el CI de `.github/workflows/verificacion.yml`, que corre `npm test` sin secretos; y quien define una `VALMEN_BASE_URL_*` en su máquina con claves reales en el entorno, a quien hoy una degradación le manda la petición y la clave al proveedor de siempre.
- Comportamiento actual: ninguna prueba corre `valmen gate` como subproceso; todas inyectan dobles por la API de TypeScript (`tests/cascada-verificada.test.ts:104-162`, `tests/claude-cli.test.ts:616-637`) y corren sobre `src`, no sobre el binario (`vitest.config.ts:6-37`). Con una `VALMEN_BASE_URL_*` activa, un fallo del servidor local hace que la cascada caiga a jev y jev al juez, y si ese eslabón no tiene su variable la petición sale al proveedor real con la clave del entorno; además un guion desalineado puede terminar en `approve` por esa degradación (medido hoy, ver Diagnóstico).
- Comportamiento esperado: `npm test` incluye una prueba que lanza `packages/cli/dist/main.js` con un entorno sin claves, un servidor guionado y un `claude` falso; recorre productor, verificador y escalado, y comprueba en el recibo el evaluador `cascade`, las proposiciones, las respuestas de cada rol, el resultado y que ninguna petición salió de loopback ni llevó credencial. Si el binario no está compilado, la prueba falla diciendo `npm run build`. Un guion con menos respuestas que llamadas responde un error que nombra la llamada sin guion y la compuerta falla sin recibo aprobado. Con una `VALMEN_BASE_URL_*` activa: un 5xx, un 307, una respuesta mal formada o el servidor caído hacen fallar la compuerta sin degradar a otro evaluador; y si falta la variable de algún eslabón (o `VALMEN_CLAUDE_BIN` para `claude-code`), la compuerta falla antes de la primera llamada nombrando la variable que falta.

## Diagnóstico

- Causa comprobada (con `ruta:línea`): son dos huecos, uno de cobertura y uno de seguridad; ambos comprobados hoy corriendo el binario del worktree (`npm run build`) contra un servidor `node:http` en `127.0.0.1` con puerto 0, un registro temporal con `HOME` propio, el entorno vaciado de claves y un `fetch` precargado (`NODE_OPTIONS=--import`) que registra cada destino y rechaza todo host que no sea loopback.
  1. La prueba de punta a punta no existe, pero el camino ya la admite sin código nuevo de producto: el despacho de `gate` (`packages/cli/src/main.ts:2043-2062`) llama a `runGateFromFlags` (`packages/cli/src/main.ts:1470-1541`), que lee la cadena con `cascadeRoutingFor` (`packages/cli/src/main.ts:1499-1500`, `packages/adapter/src/routing.ts:1619-1646`) y no pasa `apiKey` con la cascada (`packages/cli/src/main.ts:1512-1518`). Medido: con `VALMEN_BASE_URL_OPENROUTER` y `VALMEN_BASE_URL_JEV` locales y un `routing.yaml` de prueba (productor y escalado en `openrouter`, verificador con el modelo de probabilidades jev de TypeSafe), el binario hace exactamente tres peticiones locales —`/v1/chat/completions` del productor, `/decisions` del verificador con las proposiciones `respaldada_*` (`packages/engine/src/cascade.ts:232-257`, `:333-342`) y `/v1/chat/completions` del escalado con solo la proposición que el verificador dejó bajo el umbral (`packages/engine/src/cascade.ts:354-370`)—, sin credencial y con `redirect: "error"`, y anexa a `.valmen/receipts/<ID>.jsonl` un recibo `cascade` en `approve` con `escalations[0]` (`from`, `to`, `verified` 0.10, umbral 0.9) y `modelAnswers`. Con el productor en `claude-code` y `VALMEN_CLAUDE_BIN` apuntando a un `claude` falso que reenvía el pedido al mismo servidor, el resultado es el mismo (`packages/credentials/src/chat.ts:173-184`, `packages/credentials/src/claude-cli.ts:107-110` y `:372-408`). Lo que falta es la prueba que lo fije en `npm test`.
  2. Con una URL de prueba activa la cascada y jev siguen degradando: la cascada solo se niega ante `AUTH`, `CREDENTIAL_MISSING` y `TEST_URL_REJECTED` (`packages/engine/src/evaluators.ts:390-396`) y cualquier otro código cae a jev (`packages/engine/src/evaluators.ts:397-405`); jev cae al juez ante `SERVER` o `TRANSPORT` (`packages/engine/src/evaluators.ts:494-516`), y ese juez va sin proveedor, es decir a `openrouter` (`packages/engine/src/evaluators.ts:502-508`). El verificador de la cascada llama a `evaluateWithJev` (`packages/engine/src/cascade.ts:336-342`) y el reintento del productor repite con el proveedor del escalado (`packages/engine/src/cascade.ts:296-305`), así que cada eslabón solo queda local si su variable está definida (`packages/credentials/src/endpoints.ts:297-330` se consulta por transporte y `packages/gate-jev/src/jev.ts:188-191` para jev). Medido con claves falsas en el entorno: (a) con `VALMEN_BASE_URL_JEV` sin definir y el productor respondiendo 500, la cascada degradó a jev y el binario intentó `https://openrouter.ai/api/alpha/decisions` **con** `Authorization` (lo cortó el `fetch` precargado); (b) con el escalado en `anthropic` sin `VALMEN_BASE_URL_ANTHROPIC`, intentó `https://api.anthropic.com/v1/messages` con credencial, la cascada degradó a jev (500 local), jev al juez local, y el recibo quedó en **`approve`** con `evaluator: llm-judge`, `requestedEvaluator: cascade` y `evaluatorFailure` `TRANSPORT`. Es H1 tal como lo describió el revisor y, a la vez, un camino por el que un guion desalineado termina aprobado.
  3. Un guion agotado hoy no aprueba, pero por suerte y con llamadas de más: con dos respuestas para tres llamadas, el escalado recibió 500, la cascada degradó a jev (otra petición, 500) y jev al juez (otra, 500): cinco peticiones donde el guion preveía tres, salida 2 sin recibo y un error que nombra la última llamada (`prueba/juez`), no la que se quedó sin guion. `runGate` devuelve ese error sin escribir recibo (`packages/engine/src/gate.ts:803-835`). Sin degradación, la compuerta fallaría en la tercera llamada con el error de esa llamada.
  4. El contrato de la respuesta guionada es el del juez y el de jev: el productor y el escalado reciben un esquema con una propiedad por proposición, `holds` o `choice` según el tipo (`packages/gate-llm-judge/src/judge.ts:107-152`), y el juez exige una respuesta por proposición (`packages/gate-llm-judge/src/judge.ts:347-370`); jev exige `answers` con `noul` entre 0 y 1 para cada pregunta (`packages/gate-jev/src/jev.ts:280-302`). Medido: si el guion responde `holds` a la proposición `choice` `clasificacion`, el juez lo acepta y `decide` lo rechaza después («esperaba una opción y recibió undefined», salida 2, sin recibo), así que el servidor guionado arma la respuesta leyendo el esquema de cada pedido.
- Hipótesis pendientes:
  - H1 (binario desactualizado): la prueba ejercita `packages/cli/dist`, y la suite corre sobre `src` (`vitest.config.ts:6-37`); con un `dist` viejo la prueba mediría código anterior sin decirlo. En el CI no pasa porque `npm run typecheck` compila antes de `npm test` (`.github/workflows/verificacion.yml:42-43` y `:96-99`); en local el precedente es exigir el build y fallar si falta (`bench/friccion/test/binario-real.test.ts:38-40`). Se acepta como límite y se documenta en la prueba.
  - H2 (precarga en Node 22): el CI usa Node 22 (`.github/workflows/verificacion.yml:26`) y la medición se hizo con Node 26; `--import` en `NODE_OPTIONS` existe desde Node 20.6 y se le pasa una URL `file:`; la prueba lo comprueba en el Node que la corra.
  - H3 (`VALMEN_CLAUDE_BIN` no prueba que el `claude` sea falso): es también una configuración legítima de producción (`packages/credentials/src/claude-cli.ts:106-110`), así que exigirla para `claude-code` cuando hay una URL de prueba activa impide el `claude` real del `PATH`, pero no garantiza que el ejecutable sea de prueba. Se acepta: es la sustitución que D6 elige para ese transporte.
- Consumidores afectados:
  - De la regla «sin degradación con URL de prueba activa»: `evaluateGate` (`packages/engine/src/evaluators.ts:233-254`), que llama `runGate` (`packages/engine/src/gate.ts:803`) desde el CLI (`packages/cli/src/main.ts:1520`, y la delegación en `:1944` y `:2021`), Mission Control (`packages/server/src/gates.ts:445`) y el MCP (`packages/mcp/src/tools.ts:2392`). Sin una `VALMEN_BASE_URL_*` definida no cambia nada para ninguno; sus pruebas de degradación (`tests/gate-cascade-fallo.test.ts:117-168`, `tests/evaluators.test.ts:569-610`) no definen la variable y deben seguir igual.
  - De la regla «todo o nada» en la cadena: `verifiedCascade` (`packages/engine/src/cascade.ts:270-305`), que corren la compuerta (`packages/engine/src/evaluators.ts:530-557`) y las tareas de la cascada (`packages/engine/src/cascade.ts:847-880`, usadas por `valmen cascada` en `packages/cli/src/main.ts:2096` y por el MCP en `packages/mcp/src/tools.ts:3557`). Las pruebas del rechazo de URL externa (`tests/url-base-prueba.test.ts:822-876`, C23-C26) deben seguir viendo «solo admite localhost»: la comprobación de la cadena valida cada variable con `testBaseUrlFor` antes de buscar las que faltan.
  - De `TransportError` (`packages/credentials/src/endpoints.ts:34-49`): su unión de códigos gana uno; quienes lo construyen con un solo argumento no cambian.
  - `evaluateWithJev` en la simulación de compuertas (`packages/engine/src/simulate.ts:153`) no degrada y no cambia.
  - La guarda de exportaciones (`npm run exports:check`, `scripts/exports-sin-uso.mjs`, línea base de 443 entradas, hoy en verde): la función nueva de `@valmen/credentials` tendrá como consumidores `packages/engine/src/cascade.ts` y `packages/engine/src/evaluators.ts`; los ayudantes de la prueba viven en `tests/`, que la guarda no revisa como exportaciones de producto.
  - La documentación: el «Límite conocido» de `docs/04-PROVEEDORES.md:149-153` deja de ser cierto y se reescribe; `tests/url-base-prueba.test.ts:878-889` lee esa sección y sigue pasando.
- Archivos y flujo investigados: `packages/cli/src/main.ts` (`credentialForCascade`, `runGateFromFlags`, despacho de `gate` y de `cascada`), `packages/adapter/src/routing.ts:1028-1030` (`probabilistic` solo con un modelo de TypeSafe) y `:1619-1680` (`cascadeRoutingFor` y `motivoDeCadenaInutil`), `packages/engine/src/gate.ts:452-1010` (`runGate`, error sin recibo, `buildReceipt`), `packages/engine/src/evaluators.ts` (selección, tandas, degradaciones), `packages/engine/src/cascade.ts` (`verifiedCascade`, recibo de tareas), `packages/gate/src/receipt.ts:289-302` (`EscalationRecord`), `packages/gate-llm-judge/src/judge.ts:295-415` (`evaluateWithJudge`), `packages/gate-jev/src/jev.ts:183-321` (`evaluateWithJev`), `packages/credentials/src/endpoints.ts` (`TransportError`, `testBaseUrlFor`, `resolveChatEndpoint`), `packages/credentials/src/chat.ts:166-417` (`callChat`), `packages/credentials/src/claude-cli.ts` (`claudeBinary`, `claudeCliEnv`, `runClaudeCli`, `callClaudeCli`), las pruebas `tests/cascada-verificada.test.ts`, `tests/claude-cli.test.ts`, `tests/url-base-prueba.test.ts` (su `fetchSoloLocal` en `:58-76`), `tests/gate-cascade-fallo.test.ts`, `tests/helpers/fixtures.ts`, `vitest.config.ts`, `.github/workflows/verificacion.yml`, `.valmen/config.yaml:25-31` (`test-commands` y `test-timeout`) y `docs/04-PROVEEDORES.md:112-153`. Flujo: `valmen gate analysis --evaluator cascade` → `runGateFromFlags` → `runGate` → `evaluateGate` → `runSemanticEnTandas` → `runCascade` → `verifiedCascade` → productor (`evaluateWithJudge` → `callChat` → HTTP o `claude -p`) → verificador (`evaluateWithJev`) → escalado (`evaluateWithJudge`) → `decide` → `buildReceipt` → `.valmen/receipts/<ID>.jsonl`. Memoria consultada (`buscar_memoria` con «cascada verificada prueba valmen gate modelo guionado…» y «cascada cae a jev degradación…»): sin antecedentes del tema; AP-005 (requisito nuevo sin síntoma) y AP-010 (`corresponde_a_la_investigacion` con archivos nuevos) se tienen en cuenta al leer los recibos.
- Riesgos y compatibilidad:
  - Fuga de red o de claves desde la prueba (el riesgo principal, R-GUI-003): se cierra en tres capas que el plan fija y prueba: el subproceso recibe un entorno armado desde cero (sin ninguna `*_API_KEY`, `HOME` temporal y un `PATH` sin el `claude` real); el `fetch` precargado rechaza todo host no loopback y deja constancia de cada intento; y el motor deja de degradar con una URL de prueba activa y exige la cadena completa. Una prueba de control pone claves falsas en el entorno y comprueba que ningún intento sale de loopback ni lleva credencial.
  - Compatibilidad: sin ninguna `VALMEN_BASE_URL_*` definida, la selección del evaluador, las degradaciones y los recibos no cambian. Con una definida cambian a propósito dos cosas: no hay degradación (una indisponibilidad del servidor local falla la compuerta sin recibo, que es lo que pide «nunca aprueba») y una cadena incompleta falla antes de la primera llamada.
  - Duración de `npm test`: cada corrida del binario tarda alrededor de un segundo; la prueba lanza una decena, dentro del `testTimeout` de 30 s por caso (`vitest.config.ts:80`) y del `test-timeout` de 420 s de las compuertas.
  - Dependencia del build: la prueba falla —no se salta— sin `packages/cli/dist/main.js`, y con un `dist` viejo mide código viejo (H1).
  - Riesgos residuales H1, H2 y H3, declarados arriba.
- Impactos de sync, migración, Docker o despliegue: ninguno. No toca sincronización, migraciones, contenedores ni despliegue; cambia el motor de compuertas del harness solo con una `VALMEN_BASE_URL_*` activa, agrega pruebas y ajusta la documentación de proveedores. Ningún dato ni recibo existente se reescribe.

## Plan

- Alcance y exclusiones: una prueba nueva que corre el binario compilado de `valmen gate` contra un modelo guionado local (R-GUI-002 a R-GUI-004), y el arreglo de H1 en el motor: con una `VALMEN_BASE_URL_*` activa, la cadena del evaluador va completa o la compuerta falla nombrando la variable que falta, y ni la cascada ni jev degradan a otro evaluador. Se actualiza el «Límite conocido» de `docs/04-PROVEEDORES.md` §1.4. Quedan fuera: el contrato del recibo (supuesto pendiente del PO, arriba), una costura de inyección en el CLI, las degradaciones sin URL de prueba activa, la simulación de compuertas (`packages/engine/src/simulate.ts:153`, que no degrada) y los demás consumidores de `callChat` que no son compuertas (descomposición, chat de Mission Control).
- Decisiones de diseño (confirman D6, `.valmen/features/guardas-verificacion-harness/design.md:55-62`):
  - El modo prueba lo decide una sola función de `@valmen/credentials`, dueña de los nombres de variable: `requireTestRoutes(ids, env = process.env): boolean`. Devuelve `false` sin ninguna `VALMEN_BASE_URL_*` con valor (nada cambia); con alguna, valida cada eslabón pedido y devuelve `true`, o lanza `TransportError` con el código nuevo `TEST_URL_INCOMPLETE` y un mensaje que nombra las variables activas y las que faltan, nunca sus valores. Para `claude-code` «la suya» es `VALMEN_CLAUDE_BIN` (D6); para jev, `VALMEN_BASE_URL_JEV`.
  - Pseudocódigo:
    ```text
    requireTestRoutes(ids, env):
      activas = claves de env que empiezan por "VALMEN_BASE_URL_" con valor recortado ≠ ""
      si activas está vacía → devolver false
      faltan = []
      para cada id de ids, sin repetir:
        si id = "jev"                 → si testBaseUrlFor("jev", env) = null, faltan += "VALMEN_BASE_URL_JEV"
        si transportById(id).cli      → si recortar(env.VALMEN_CLAUDE_BIN) = "", faltan += "VALMEN_CLAUDE_BIN"
        en otro caso                  → si testBaseUrlFor(id, env) = null, faltan += "VALMEN_BASE_URL_" + ID
        (testBaseUrlFor lanza TEST_URL_REJECTED ante un valor no local: el rechazo gana sobre la falta)
      si faltan no está vacía → lanzar TransportError("Hay una URL de prueba activa (<activas>) y a la cadena
        le falta <faltan>: con una URL de prueba, todos los eslabones hablan con el servidor local o la
        compuerta no corre.", "TEST_URL_INCOMPLETE")
      devolver true

    runSemanticEnTandas(chosen, options):              // packages/engine/src/evaluators.ts
      enPrueba = requireTestRoutes(eslabones(chosen))   // cascade → productor, escalado, "jev"; jev → "jev";
                                                        // llm-judge → options.provider ?? DEFAULT_PROVIDER
      cascade falla → si enPrueba o código ∈ {AUTH, CREDENTIAL_MISSING, TEST_URL_REJECTED}: relanzar
                      si no: degradar a jev (como hoy)
    runSemantic(jev) falla → si enPrueba o código ∉ {SERVER, TRANSPORT}: relanzar; si no: juez (como hoy)
    ```
  - El motor pasa a declarar la dependencia de `@valmen/credentials`, que hoy ya tiene de forma transitiva por `@valmen/gate-jev` y `@valmen/gate-llm-judge` (`packages/engine/package.json`, `packages/engine/tsconfig.json`, entrada `packages/engine` de `package-lock.json:3858-3872`); `@valmen/credentials` no depende de nadie, así que no hay ciclo.
  - La prueba ejercita el binario tal como lo usa una persona: `spawn(process.execPath, [packages/cli/dist/main.js, "--root", <laboratorio>, "gate", ...])`, con un entorno armado desde cero —`PATH` con solo el directorio de Node, `/usr/bin` y `/bin`; `HOME` temporal; ninguna `*_API_KEY` salvo en los controles con claves falsas— y `NODE_OPTIONS=--import <URL file: de la guarda>`. La guarda es un módulo que reemplaza `globalThis.fetch` con uno que anota cada intento (destino, si es loopback, si lleva `authorization` o `x-api-key`) en un archivo y rechaza todo host que no sea `127.0.0.1` o `localhost`, la misma regla que `fetchSoloLocal` (`tests/url-base-prueba.test.ts:58-76`). No es una costura del CLI: no cambia su código, solo observa y corta la red.
  - El `claude` falso y la guarda se escriben en el laboratorio al correr la prueba, como el CLI de laboratorio de `tests/claude-cli.test.ts:618-623`, y no como `.mjs` versionados: el lint usa `projectService` (`eslint.config.js:51`) y un `.mjs` fuera de todo `tsconfig` lo rechaza. El `claude` falso es un script de Node que manda al servidor guionado el modelo, el `--json-schema` y el prompt, e imprime la respuesta en el formato de `--output-format json` (`is_error`, `structured_output`, `usage`, `modelUsage`).
  - El servidor guionado es uno solo para los tres caminos (`/v1/chat/completions`, `/decisions` y `/claude` del `claude` falso), con una cola de pasos en orden. Cada paso arma la respuesta leyendo el pedido: una propiedad por proposición del esquema, `holds` o `choice` según su tipo (`packages/gate-llm-judge/src/judge.ts:107-152`), y `noul` por pregunta para jev (`packages/gate-jev/src/jev.ts:280-302`), con los valores que el guion fija. Una petición sin paso responde 500 con `{"error":"llamada sin guion: n.º <k> (<ruta>, modelo <m>)"}` y queda anotada como sin guion.
  - El binario se exige compilado: un `beforeAll` lanza «Falta packages/cli/dist/main.js: corre `npm run build` antes de `npm test`» si no está, como `bench/friccion/test/binario-real.test.ts:38-40`. El CI ya compila antes de `npm test` (`.github/workflows/verificacion.yml:42-43` y `:96-99`), así que no se toca.
  - Tabla de fallos del servidor local (variables de la cadena activas): (a) 500; (b) 307 hacia un segundo servidor local; (c) 200 con un cuerpo que no es JSON; (d) puerto cerrado.
  - Tabla de cadenas incompletas (con `VALMEN_BASE_URL_OPENROUTER` activa): (i) sin `VALMEN_BASE_URL_JEV`; (ii) escalado en `anthropic` sin `VALMEN_BASE_URL_ANTHROPIC`; (iii) productor en `claude-code` sin `VALMEN_CLAUDE_BIN`.
  - Tabla de códigos del motor: `SERVER`, `TRANSPORT`, `TIMEOUT`, `RATE_LIMIT`, `INVALID_REQUEST`, `MALFORMED_RESPONSE`, `MISSING_ANSWER`.
  - Descartado: (a) detectar el modo prueba en cada borde (CLI, Mission Control, MCP), tres listas que divergen; (b) exigir la variable solo dentro de `callChat` y de jev, que corta la red pero no impide la degradación ni falla antes de la primera llamada; (c) poner la función en `@valmen/gate-jev` para no declarar la dependencia, que la escondería; (d) leer el entorno con un prefijo copiado en el motor, que pondría el nombre de la variable en dos paquetes.
- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan). Confirma el plan con sus 35 criterios, la dependencia declarada de `@valmen/credentials` en `packages/engine` y el cierre de la ventana H1 de FEATURE-CREDENTIALS-URL-BASE-PRUEBA-20261010 (con una `VALMEN_BASE_URL_*` activa la cadena va completa o la compuerta falla, sin degradar).
- Pasos ordenados:
  1. En `packages/credentials/src/endpoints.ts`: la unión de códigos de `TransportError` (`:35` y `:41-43`) suma `"TEST_URL_INCOMPLETE"` y su comentario (`:37-40`) lo explica; después de `testBaseUrlFor` (`:297-330`) se agrega y exporta `requireTestRoutes` según el pseudocódigo, usando `transportById` (`:268-276`). (C24, C25)
  2. En `packages/engine/package.json` y `packages/engine/tsconfig.json`, declarar `@valmen/credentials` (`"0.0.1"` y la referencia `../credentials`), y en `package-lock.json` agregar la misma línea a la entrada `packages/engine` (`:3862-3869`); comprobar con `git diff package-lock.json` que es la única línea que cambia. (C1)
  3. En `packages/engine/src/cascade.ts`, `verifiedCascade` (`:270-272`): justo después de `exigirCadena`, `requireTestRoutes([cadena.producer.provider, cadena.escalation.provider, "jev"])`, importado de `@valmen/credentials`. Cubre la compuerta y las tareas de la cascada (`runCascadeTask`, `:847-880`). (C24, C25)
  4. En `packages/engine/src/evaluators.ts`: una función local `eslabones(chosen, options)` con los identificadores del pseudocódigo (`DEFAULT_PROVIDER` de `@valmen/credentials`); `runSemanticEnTandas` (`:373-409`) calcula `enPrueba` con `requireTestRoutes` antes de correr y lo pasa a `runSemanticEnTandasDe` (`:411-448`) y a `runSemantic` (`:451-517`); la caída de la cascada a jev (`:390-396`) relanza si `enPrueba`; la caída de jev al juez (`:494-499`) relanza si `enPrueba`. Los comentarios de `:17-20`, `:226-232` y `:382-389` dicen que con una URL de prueba activa no hay degradación. Sin ninguna `VALMEN_BASE_URL_*`, el orden y las condiciones de hoy no cambian. (C19, C20, C21, C22, C23, C26, C27, C28)
  5. Crear `tests/cascada-guionada.test.ts`, sin red ni claves, con: el `beforeAll` del binario y una prueba de su mensaje con una ruta que no existe; el servidor guionado; la guarda de red y el `claude` falso escritos en el laboratorio; un laboratorio por caso en `os.tmpdir()` con `.valmen/routing.yaml` (productor y escalado en `openrouter` con modelos distintos, verificador y `gate-evaluator` con un modelo de TypeSafe para que el routing los marque probabilísticos, `packages/adapter/src/routing.ts:1028-1030`) y el ticket de `writeFixtureTicket` (`tests/helpers/fixtures.ts`) en `analyzed`; la lectura del recibo con `readReceipts` (`packages/engine/src/receipts.ts:44`). Casos: el guion de tres pasos —el productor responde que todo se cumple con confianza 0.95 (`clasificacion` = completa), el verificador da 0.97 a todo salvo 0.10 a `respaldada_causa_especifica`, y el escalado responde con confianza 0.99— (C2, C3, C4, C5, C6, C7, C8, C9, C11); el mismo guion con el productor en `claude-code` y el `claude` falso (C10, C11); el guion de dos pasos para tres llamadas (C16, C17, C18); la tabla de fallos del servidor local, con claves falsas en el entorno (C15, C19, C20, C21, C22); `--evaluator jev` con jev respondiendo 500 (C23); la tabla de cadenas incompletas (C24, C25); la lectura de `.github/workflows/verificacion.yml` (C13, C14) y de la sección 1.4 de `docs/04-PROVEEDORES.md` (C29, C30, C31); y, sin subproceso, `runGate` con un juez y un jev dobles que lanzan cada código de la tabla del motor y cuentan sus llamadas, con el entorno fijado por `vi.stubEnv` y limpiado por `vi.unstubAllEnvs`, como `tests/url-base-prueba.test.ts:785-820` (C26, C27). Las aserciones usan `code` y `message` sin importar `TransportError`, que está en la línea base de exportaciones sin uso. (C2–C27, C29–C31, C12)
  6. En `docs/04-PROVEEDORES.md` §1.4 (`:112-153`): el «Límite conocido» (`:149-153`) se reemplaza por dos viñetas —con una variable activa la compuerta no degrada a otro evaluador; y la cadena va completa (cada transporte con su `VALMEN_BASE_URL_<TRANSPORTE>`, jev con `VALMEN_BASE_URL_JEV` y `claude-code` con `VALMEN_CLAUDE_BIN`) o la compuerta falla con `TEST_URL_INCOMPLETE` nombrando la que falta— y una línea que remite a `tests/cascada-guionada.test.ts` como ejemplo de uso. (C29, C30, C31)
  7. Desde la raíz del worktree, en este orden: `npx tsc --build tsconfig.build.json`; `npx vitest run tests/cascada-guionada.test.ts`; la regresión `npx vitest run tests/url-base-prueba.test.ts tests/gate-cascade-fallo.test.ts tests/cascada-verificada.test.ts tests/cascada-productor-reintento.test.ts tests/cascada-tareas.test.ts tests/evaluators.test.ts tests/gate-jev.test.ts tests/claude-cli.test.ts`; `npx tsc --noEmit -p tsconfig.json`; `node scripts/exports-sin-uso.mjs`; y `npx eslint packages/credentials/src/endpoints.ts packages/engine/src/cascade.ts packages/engine/src/evaluators.ts tests/cascada-guionada.test.ts` con `npx prettier --check` sobre los mismos archivos y la documentación. (C1, C2–C31, C32, C33, C34)
  8. Revisión de seguridad del diff antes de entregar (skill `security-review` o un subagente revisor), buscando cualquier camino por el que, con una URL de prueba activa, una petición salga de loopback o una credencial viaje; el resultado se anota en `## Implementación` y lo confirma la persona responsable en `awaiting_user_tests`. (C35)
- Compatibilidad: sin ninguna `VALMEN_BASE_URL_*` definida, `requireTestRoutes` devuelve `false` sin leer nada más y el motor se comporta exactamente como hoy: las pruebas de degradación existentes (`tests/gate-cascade-fallo.test.ts:117-168`, `tests/evaluators.test.ts:569-610`) son la regresión. Con una definida cambian a propósito dos cosas: no hay degradación y una cadena incompleta falla antes de la primera llamada. El rechazo de una URL externa sigue diciendo «solo admite localhost» porque se valida antes de buscar faltantes (`tests/url-base-prueba.test.ts:822-876`). `TransportError` conserva su código por defecto. La única exportación nueva es `requireTestRoutes`, consumida por `packages/engine/src/cascade.ts` y `packages/engine/src/evaluators.ts`.
- Impactos declarados: ninguno; el ticket no declara sincronización, migración ni contenedores (`sync_impact`, `migration_impact` y `docker_impact` en false), y no hay despliegue.
- Pruebas previstas: directorio, la raíz del worktree; requisitos, Node 22 o posterior con las dependencias del monorepo instaladas y `npm run build` hecho, sin red ni credenciales (los servidores escuchan en `127.0.0.1` con puerto 0 y los laboratorios viven en el directorio temporal del sistema); resultado esperado, los comandos del paso 7 sin fallos y la suite de `tests/cascada-guionada.test.ts` en menos de 30 s por caso. Comprobación manual opcional: con `VALMEN_BASE_URL_OPENROUTER=http://127.0.0.1:9` y sin `VALMEN_BASE_URL_JEV`, `valmen gate analysis --id <ID> --evaluator cascade` sobre un ticket en `analyzed` falla nombrando `VALMEN_BASE_URL_JEV`, sin recibo nuevo.
- Rollback (obligatorio): revertir el commit del ticket en su rama (`git revert <hash>`), que quita `requireTestRoutes`, el código `TEST_URL_INCOMPLETE`, la dependencia declarada del motor (y su línea del lock), la regla de no degradar, la prueba y el cambio de la documentación. No hay datos que migrar ni restaurar; sin una `VALMEN_BASE_URL_*` definida nadie nota la reversión.

<!-- Los criterios de la sección siguiente se numeran C1…Cn, con una afirmación verificable por criterio
     —una frase con «y» son dos criterios—, y cada uno lleva debajo su anotación de
     verificación: un comentario HTML que dice «test:» y el comando, o «verify: manual». La
     sección no lleva comentarios dentro: un comentario con anotación se leería como la de un
     criterio. Ejemplo en la skill planificacion. -->
## Criterios de aceptación

- [ ] C1 — R-GUI-003: El monorepo compila con el cambio, lo que deja el binario que corre la prueba.
      <!-- test: npx tsc --build tsconfig.build.json -->
- [ ] C2 — R-GUI-002: Con el guion de tres pasos del paso 5, el servidor guionado recibe exactamente tres peticiones, en el orden productor, verificador (`/decisions`) y escalado.
      <!-- test: npx vitest run tests/cascada-guionada.test.ts -->
- [ ] C3 — R-GUI-002: El recibo de esa corrida declara el evaluador `cascade`.
      <!-- test: npx vitest run tests/cascada-guionada.test.ts -->
- [ ] C4 — R-GUI-002: El recibo de esa corrida no declara `requestedEvaluator`.
      <!-- test: npx vitest run tests/cascada-guionada.test.ts -->
- [ ] C5 — R-GUI-002: El recibo de esa corrida lista las proposiciones de la compuerta `analysis` que aplican a un ticket BUGFIX.
      <!-- test: npx vitest run tests/cascada-guionada.test.ts -->
- [ ] C6 — R-GUI-002: El recibo guarda en `modelAnswers`, para cada proposición que el verificador respaldó, el valor que dio el productor.
      <!-- test: npx vitest run tests/cascada-guionada.test.ts -->
- [ ] C7 — R-GUI-002: El recibo guarda en `escalations` la proposición `causa_especifica` con la probabilidad 0.10 que dio el verificador.
      <!-- test: npx vitest run tests/cascada-guionada.test.ts -->
- [ ] C8 — R-GUI-002: El recibo guarda en `modelAnswers`, para `causa_especifica`, el valor que dio el escalado.
      <!-- test: npx vitest run tests/cascada-guionada.test.ts -->
- [ ] C9 — R-GUI-002: El resultado del recibo es `approve`, el que corresponde al guion.
      <!-- test: npx vitest run tests/cascada-guionada.test.ts -->
- [ ] C10 — R-GUI-002: Con el productor en `claude-code`, el `claude` falso de `VALMEN_CLAUDE_BIN` recibe el pedido del productor.
      <!-- test: npx vitest run tests/cascada-guionada.test.ts -->
- [ ] C11 — R-GUI-003: En las corridas de C2 y C10, la guarda de red no registra ningún intento fuera de loopback.
      <!-- test: npx vitest run tests/cascada-guionada.test.ts -->
- [ ] C12 — R-GUI-003: Sin el binario compilado, la prueba falla con un mensaje que pide `npm run build`.
      <!-- test: npx vitest run tests/cascada-guionada.test.ts -->
- [ ] C13 — R-GUI-003: `.github/workflows/verificacion.yml` corre `npm run typecheck`, que compila el binario, antes de `npm test`.
      <!-- test: npx vitest run tests/cascada-guionada.test.ts -->
- [ ] C14 — R-GUI-003: `.github/workflows/verificacion.yml` no usa ningún secreto.
      <!-- test: npx vitest run tests/cascada-guionada.test.ts -->
- [ ] C15 — R-GUI-003: Con claves falsas en el entorno del subproceso, ninguna corrida de la tabla de fallos registra un intento fuera de loopback.
      <!-- test: npx vitest run tests/cascada-guionada.test.ts -->
- [ ] C16 — R-GUI-004: Con un guion de dos pasos y una cascada que hace tres llamadas, no queda ningún recibo `approve` del ticket.
      <!-- test: npx vitest run tests/cascada-guionada.test.ts -->
- [ ] C17 — R-GUI-004: Con ese guion, la salida de error nombra la llamada sin guion.
      <!-- test: npx vitest run tests/cascada-guionada.test.ts -->
- [ ] C18 — R-GUI-004: Con ese guion, el servidor guionado recibe exactamente tres peticiones.
      <!-- test: npx vitest run tests/cascada-guionada.test.ts -->
- [ ] C19 — R-GUI-003: Con las variables de la cadena activas, cada fallo de la tabla de fallos del servidor local hace salir a la compuerta con un código distinto de 0.
      <!-- test: npx vitest run tests/cascada-guionada.test.ts -->
- [ ] C20 — R-GUI-003: En cada fallo de esa tabla, la guarda de red registra un solo intento: la cascada no degrada a otro evaluador.
      <!-- test: npx vitest run tests/cascada-guionada.test.ts -->
- [ ] C21 — R-GUI-004: En cada fallo de esa tabla, no queda recibo del ticket.
      <!-- test: npx vitest run tests/cascada-guionada.test.ts -->
- [ ] C22 — R-GUI-003: El destino del 307 de esa tabla no recibe ninguna petición.
      <!-- test: npx vitest run tests/cascada-guionada.test.ts -->
- [ ] C23 — R-GUI-003: Con el evaluador `jev`, `VALMEN_BASE_URL_JEV` activa y jev respondiendo 500, la guarda de red registra un solo intento.
      <!-- test: npx vitest run tests/cascada-guionada.test.ts -->
- [ ] C24 — R-GUI-003: Cada cadena de la tabla de cadenas incompletas hace fallar la compuerta sin ningún intento de petición.
      <!-- test: npx vitest run tests/cascada-guionada.test.ts -->
- [ ] C25 — R-GUI-003: Cada fallo de esa tabla nombra en la salida de error la variable que falta.
      <!-- test: npx vitest run tests/cascada-guionada.test.ts -->
- [ ] C26 — R-GUI-004: En `runGate` con una URL de prueba activa, ningún código de la tabla de códigos del motor lanzado por el productor hace que la cascada llame al doble de jev.
      <!-- test: npx vitest run tests/cascada-guionada.test.ts -->
- [ ] C27 — R-GUI-004: En `runGate` con una URL de prueba activa, ningún código de esa tabla lanzado por jev hace que el evaluador `jev` llame al doble del juez.
      <!-- test: npx vitest run tests/cascada-guionada.test.ts -->
- [ ] C28 — R-GUI-003: Sin ninguna `VALMEN_BASE_URL_*`, la cascada sigue degradando al evaluador por defecto ante un fallo del productor.
      <!-- test: npx vitest run tests/gate-cascade-fallo.test.ts -->
- [ ] C29 — R-GUI-003: La sección 1.4 de `docs/04-PROVEEDORES.md` dice que con una variable activa la compuerta no degrada a otro evaluador.
      <!-- test: npx vitest run tests/cascada-guionada.test.ts -->
- [ ] C30 — R-GUI-003: La sección 1.4 dice que con una variable activa la compuerta falla si un eslabón de la cadena no tiene su variable.
      <!-- test: npx vitest run tests/cascada-guionada.test.ts -->
- [ ] C31 — R-GUI-003: La sección 1.4 ya no contiene el «Límite conocido».
      <!-- test: npx vitest run tests/cascada-guionada.test.ts -->
- [ ] C32 — R-GUI-003: Las pruebas existentes de URL base, cascada, evaluadores, jev y CLI de Claude pasan con el cambio.
      <!-- test: npx vitest run tests/url-base-prueba.test.ts tests/gate-cascade-fallo.test.ts tests/cascada-verificada.test.ts tests/cascada-productor-reintento.test.ts tests/cascada-tareas.test.ts tests/evaluators.test.ts tests/gate-jev.test.ts tests/claude-cli.test.ts -->
- [ ] C33 — R-GUI-003: Las pruebas tipan contra el código nuevo.
      <!-- test: npx tsc --noEmit -p tsconfig.json -->
- [ ] C34 — R-GUI-003: La guarda de exportaciones sin uso no encuentra exportaciones nuevas ni entradas sobrantes.
      <!-- test: node scripts/exports-sin-uso.mjs -->
- [ ] C35 — R-GUI-003: La revisión de seguridad del diff no encuentra un camino por el que, con una URL de prueba activa, una petición salga de loopback.
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
    "at": "2026-10-10T21:47:33.360Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-10",
    "at": "2026-10-11T00:59:37.069Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-10",
    "at": "2026-10-11T01:07:04.488Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-10",
    "at": "2026-10-11T01:24:44.798Z",
    "action": "gate-approved",
    "actor": "cli",
    "details": "Gate plan aprobado por juan andrade (recibo GR-20261011-FEATURE-CLI-PRUEBA-CASCADA-GUIONADA-20261010-plan-1, canal cli, decidida 2026-10-11T01:24:44.790Z): Firmar y aprobar (Recomendado)"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-10",
    "at": "2026-10-11T01:24:45.134Z",
    "action": "plan-approved",
    "actor": "cli",
    "details": "{\"actor\":\"juan andrade\",\"source\":\"cli\",\"quote\":\"Firmar y aprobar (Recomendado) / Bastan las huellas de hoy (Recomendado)\",\"planHash\":\"sha256:f65ad30eb1a492933e8aae74fd078b0ae16c923ea551f7374472bd1d8aaf8f42\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-10",
    "at": "2026-10-11T01:24:45.442Z",
    "action": "plan-approval-verified",
    "actor": "cli",
    "details": "Aprobación del plan vigente: juan andrade (fuente cli), plan sha256:f65ad30eb1a492933e8aae74fd078b0ae16c923ea551f7374472bd1d8aaf8f42."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-10",
    "at": "2026-10-11T01:24:45.442Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  }
]
```
