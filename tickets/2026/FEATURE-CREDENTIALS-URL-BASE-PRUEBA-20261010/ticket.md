---
schema_version: 2
id: FEATURE-CREDENTIALS-URL-BASE-PRUEBA-20261010
title: URL base de prueba por variable de entorno en transportes HTTP
type: FEATURE
module: CREDENTIALS
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

# FEATURE-CREDENTIALS-URL-BASE-PRUEBA-20261010

## Solicitud original

Parte del sprint: La cascada y las compuertas se prueban de punta a punta con un modelo guionado local, sin claves ni red.
- R-GUI-001: Los transportes HTTP DEBEN aceptar una URL base de prueba por variable de entorno
Viene de una feature descompuesta en sprints; su plan completo está en el tickets.yaml de la feature.

Comportamiento esperado: Los transportes HTTP DEBEN aceptar una URL base de prueba por variable de entorno
Comportamiento actual: la spec no lo declara; se establece en el análisis, leyendo el código.

### Supuestos y decisiones pendientes

<!-- Si el pedido nombra algo que el código no tiene —parámetro, permiso,
campo, bandera, columna, migración— y no lo especifica, listá cada elemento
con su pregunta antes de avanzar a análisis; el análisis no planifica sobre
la adivinanza. Si no hay ninguno, escribí «Ninguno» y seguí. -->
Ninguno.

## Descripción funcional

- Alcance: la URL base de los transportes HTTP del catálogo de `@valmen/credentials` (`openai-chat`, `anthropic-messages` y `openai-responses`) y la del evaluador jev de `@valmen/gate-jev` pasan a poder reemplazarse por una variable de entorno documentada, solo hacia `127.0.0.1` o `localhost`. Cubre R-GUI-001 del sprint S6 de la feature `guardas-verificacion-harness` (`.valmen/features/guardas-verificacion-harness/spec/s6-modelo-guionado/spec.md:17-26`, decisión D6 de `.valmen/features/guardas-verificacion-harness/design.md:55-62`). Fuera de alcance: el transporte `claude-code`, que va por `claude -p` y ya se sustituye con `VALMEN_CLAUDE_BIN` (`packages/credentials/src/claude-cli.ts:106-110`); la prueba de punta a punta con modelo guionado, el servidor guionado y el CI (R-GUI-002 a R-GUI-004, ticket FEATURE-CLI-PRUEBA-CASCADA-GUIONADA-20261010, que depende de este); y cualquier uso de la variable como proxy local hacia un proveedor real.
- Usuario o rol afectado: quien escribe pruebas del harness (el ticket siguiente de S6 y el CI de `.github/workflows/verificacion.yml`), que necesita que `valmen gate` hable con un servidor HTTP local sin claves ni red. Indirectamente, toda persona que corre compuertas, descomposiciones de feature o el chat de Mission Control: sin la variable no les cambia nada, y con una variable inválida la llamada falla antes de salir.
- Comportamiento actual: la URL de cada transporte es un literal del catálogo y no hay forma de cambiarla sin editar código; jev llama siempre a `https://openrouter.ai/api/alpha/decisions`. Las pruebas existentes evitan la red inyectando `fetchImpl`, `judge`, `jev` o `cliRunner` por la API de TypeScript, pero el binario `valmen gate` no tiene esa costura (el despacho de `gate` en `packages/cli/src/main.ts:2043-2062` llama a `runGateFromFlags` sin inyección posible), así que el camino real no se puede ejercitar sin gastar tokens.
- Comportamiento esperado: con `VALMEN_BASE_URL_<TRANSPORTE>` (o `VALMEN_BASE_URL_JEV`) apuntando a `http://127.0.0.1[:puerto][/ruta]` o `http://localhost[:puerto][/ruta]`, la petición de ese transporte va a esa base con la misma ruta de dialecto (`/chat/completions`, `/messages`, `/responses` o `/decisions`), sin ninguna credencial en las cabeceras y sin seguir redirecciones. Con cualquier otro valor la compuerta falla diciendo que la URL de prueba solo admite localhost, sin degradar a otro evaluador y sin hacer la llamada. Sin la variable (o vacía), la URL, las cabeceras y las opciones de `fetch` son exactamente las de hoy.

## Diagnóstico

- Causa comprobada (con `ruta:línea`): no es un defecto sino una costura que no existe; dónde falta, comprobado en el código:
  1. Catálogo sin lectura de entorno: cada `Transport` declara `baseUrl` como literal (`packages/credentials/src/endpoints.ts:63-64`; los diez proveedores en `TRANSPORTS`, `packages/credentials/src/endpoints.ts:130-238`), y `resolveChatEndpoint` arma la URL concatenando ese literal con la ruta del dialecto (`packages/credentials/src/endpoints.ts:287`, `:290` y `:303`). Ningún símbolo del paquete lee una variable de URL: el único precedente de sustitución por entorno es `claudeBinary` con `VALMEN_CLAUDE_BIN` (`packages/credentials/src/claude-cli.ts:106-110`), que ignora el valor vacío.
  2. Jev fuera del catálogo: su endpoint es la constante `DECISIONS_ENDPOINT` (`packages/gate-jev/src/jev.ts:25`) y `evaluateWithJev` la usa directo en `fetch` (`packages/gate-jev/src/jev.ts:207`), así que el cambio en `endpoints.ts` no la alcanza sola; `@valmen/gate-jev` ya depende de `@valmen/credentials` (`packages/gate-jev/package.json`, e importa de él en `packages/gate-jev/src/jev.ts:22`), de modo que puede consumir la misma función.
  3. La credencial viaja siempre: `callChat` toma `options.apiKey` o la resuelve del entorno o del archivo (`packages/credentials/src/chat.ts:195`, con `resolveCredentialFor` en `:124-146`) y la pone en `Authorization: Bearer` (`packages/credentials/src/chat.ts:257`, y condicionada en `:206-208` para `/responses`) o en `x-api-key` (`packages/credentials/src/anthropic.ts:81`, vía `anthropicAuthHeaders` en `packages/credentials/src/chat.ts:230`); jev hace lo mismo (`packages/gate-jev/src/jev.ts:184` y `:210`). Además el CLI y el servidor resuelven la clave antes de llamar y la pasan por opciones (`packages/cli/src/main.ts:32-40`, `packages/server/src/gates.ts:437-442`), así que una URL reemplazable sin más reglas enviaría la clave real del usuario al host de la variable.
  4. Redirecciones seguidas por defecto: los cuatro `fetch` (`packages/credentials/src/chat.ts:254`, `packages/credentials/src/anthropic.ts:153-158`, `packages/credentials/src/responses.ts:195-200` y `packages/gate-jev/src/jev.ts:207-215`) no fijan `redirect`, y `fetch` sigue un 307. Medido hoy con Node v26.10.0 en el scratchpad: un servidor en `127.0.0.1` que responde 307 hacia otro puerto recibe la petición seguida con `x-api-key` intacta (Node solo quita `Authorization` al cambiar de origen); con `redirect: "error"` la llamada falla con «unexpected redirect».
  5. Un rechazo se degradaría en silencio: un error del juez que no es `ChatError` sale tal cual (`packages/gate-llm-judge/src/judge.ts:328-333`), y la cascada solo se niega a degradar ante `AUTH` o `CREDENTIAL_MISSING` (`packages/engine/src/evaluators.ts:388`); cualquier otro código cae a jev (`packages/engine/src/evaluators.ts:389-398`). Un `TransportError` hoy lleva siempre `TRANSPORT_UNSUPPORTED` (`packages/credentials/src/endpoints.ts:34-41`), así que una URL rechazada en el productor terminaría en una llamada a jev —a OpenRouter real si `VALMEN_BASE_URL_JEV` no está— en vez de fallar como pide el escenario de R-GUI-001. El camino jev por defecto solo degrada ante `SERVER` o `TRANSPORT` (`packages/engine/src/evaluators.ts:490`), y un error que llega a `runGate` sale como «El evaluador no pudo completar la evaluación: …» sin escribir recibo (`packages/engine/src/gate.ts:828-834`).
  6. URL con credenciales embebidas: comprobado en el scratchpad, `fetch("http://user:pw@127.0.0.1:1/x")` lanza un error cuyo mensaje incluye la URL completa con la contraseña, y `callChat` copia ese mensaje en el `ChatError` (`packages/credentials/src/chat.ts:304-310`); y `new URL("http://127.0.0.1@evil.example/x").hostname` es `evil.example`. Validar por prefijo de texto dejaría pasar lo segundo, y no rechazar el usuario antes de `fetch` filtraría lo primero.
- Hipótesis pendientes:
  - H1 (resolución de `localhost`): `localhost` se resuelve con el resolvedor del sistema y Node 17+ respeta el orden que este devuelve, así que puede salir por `::1` o, con un `/etc/hosts` alterado, por otra dirección. Cambiar `/etc/hosts` exige privilegios de administrador; con ellos el atacante ya lee el archivo de credenciales. Se acepta como riesgo residual porque la spec exige admitir `localhost`; `127.0.0.1` es la forma recomendada en la documentación.
  - H2 (Node del CI): la medición de redirecciones se hizo con v26.10.0 (`package.json` declara `node >=22`, el stack declara Node 24). `redirect: "error"` es del estándar Fetch y no depende de la versión; las pruebas del plan lo comprueban en el Node que las corra.
  - H3 (fugas de la prueba de punta a punta): con la variable válida pero el servidor local caído, el camino jev degrada a `llm-judge` por `TRANSPORT` (`packages/engine/src/evaluators.ts:490`), y si el transporte del juez no tiene su variable la llamada sale a la red con la clave real. No es un desvío de la clave a otro host (va al proveedor de siempre), pero rompe «sin red» de R-GUI-003: lo resuelve FEATURE-CLI-PRUEBA-CASCADA-GUIONADA-20261010 definiendo la variable de cada transporte de la cadena y la de jev, y su prueba lo comprueba.
- Consumidores afectados:
  - De `resolveChatEndpoint`: solo `callChat` (`packages/credentials/src/chat.ts:188`) y las pruebas `tests/anthropic-dialect.test.ts:116-129` y `tests/responses-dialect.test.ts:344-375`, que fijan las URL de catálogo y deben seguir pasando sin la variable.
  - De `callChat` (heredan la URL de prueba cuando la variable está): el juez `packages/gate-llm-judge/src/judge.ts:309` y el revisor `packages/gate-llm-judge/src/reviewer.ts:311` (compuertas `llm-judge` y la cascada), la descomposición de features del CLI `packages/cli/src/features.ts:353` y la del servidor `packages/server/src/server.ts:829`. Ninguno cambia de código: reciben la URL del catálogo o la de prueba sin saberlo.
  - De `evaluateWithJev`: `packages/engine/src/cascade.ts:274` y `:336-342` (verificador de la cascada), `packages/engine/src/evaluators.ts:470` (evaluador jev), `packages/engine/src/simulate.ts:153` (simulación de compuertas); y `tests/gate-jev.test.ts:122`, que fija `DECISIONS_ENDPOINT` y debe seguir pasando.
  - Quienes resuelven la clave antes de llamar: `packages/cli/src/main.ts:32-40`, `packages/server/src/gates.ts:437-442` y `packages/mcp/src/tools.ts:3641`. No cambian: con la URL de prueba activa la clave que pasan se ignora dentro de `callChat` y de `evaluateWithJev`, que es el único punto donde se arma la cabecera.
  - La degradación de la cascada en `packages/engine/src/evaluators.ts:388` cambia: un rechazo de la URL de prueba no se tapa con otro evaluador. El control existente `tests/gate-cascade-fallo.test.ts:147` (un `AUTH` no llama al evaluador por defecto) es el patrón a repetir.
  - `listTransports` (`packages/credentials/src/endpoints.ts:329-341`) devuelve `baseUrl` del catálogo y no tiene consumidor (está en `scripts/exports-sin-uso.linea-base.json:148`): no cambia, porque describe el catálogo, no el destino de una llamada. `esAnfitrionLocal` (`packages/server/src/server.ts:212-214`) existe pero vive en `@valmen/server`, del que `@valmen/credentials` no puede depender, y además acepta todo `127.x` y `::1`, más de lo que admite la spec.
  - La guarda de exportaciones (`npm run exports:check`, `scripts/exports-sin-uso.mjs`) falla con una exportación nueva sin consumidor y con una entrada de la línea base que gana consumidor: `TRANSPORTS`, `TransportError`, `listTransports` y `protocolFor` están en `scripts/exports-sin-uso.linea-base.json:146-149`.
- Archivos y flujo investigados: `packages/credentials/src/endpoints.ts` (catálogo, `resolveChatEndpoint`, `TransportError`), `packages/credentials/src/chat.ts` (`callChat` y sus tres caminos HTTP), `packages/credentials/src/anthropic.ts` (`AnthropicRequest`, `anthropicAuthHeaders`, `callAnthropic`), `packages/credentials/src/responses.ts` (`ResponsesRequest`, `callResponses`), `packages/credentials/src/claude-cli.ts` (`claudeBinary`), `packages/credentials/src/credentials.ts:94-103` y `:200-219` (convención de nombre `<PROVEEDOR>_API_KEY` con `-` → `_`), `packages/credentials/src/index.ts` (reexporta todo), `packages/gate-jev/src/jev.ts`, `packages/gate-llm-judge/src/judge.ts`, `packages/engine/src/evaluators.ts`, `packages/engine/src/cascade.ts`, `packages/engine/src/gate.ts`, `packages/cli/src/main.ts`, `packages/server/src/gates.ts`, `packages/server/src/server.ts`, `scripts/exports-sin-uso.mjs` con su línea base, `knip.json`, `docs/04-PROVEEDORES.md:60-65` y `:107-110`. Flujo: `valmen gate` → `runGate` → evaluador (`jev`, `llm-judge` o `cascade`) → `evaluateWithJev` o `evaluateWithJudge` → `callChat` → `resolveChatEndpoint` → `fetch`. Memoria del proyecto consultada (`buscar_memoria` con «URL base de transporte…» y «cascada degrada a jev…»): sin antecedentes; AP-004 no aplica.
- Riesgos y compatibilidad:
  - Desvío de credenciales (el riesgo principal): una variable que reemplaza la URL es una vía para mandar la clave de API a otro host. Se cierra con cuatro reglas que el plan debe fijar y probar: host exacto `127.0.0.1` o `localhost` sobre el `hostname` ya normalizado por `URL` (no por prefijo de texto); rechazo de usuario o contraseña embebidos; ninguna credencial en las cabeceras mientras la URL de prueba esté activa, aunque venga por `options.apiKey`; y `redirect: "error"` en esas peticiones.
  - Fuga en mensajes: el mensaje de rechazo no debe repetir el valor de la variable, que podría llevar una contraseña embebida (causa 6).
  - Compatibilidad: sin la variable no cambia ni la URL, ni las cabeceras, ni las opciones de `fetch` (en particular no se agrega `redirect`); las pruebas que fijan URL de catálogo (`tests/anthropic-dialect.test.ts`, `tests/responses-dialect.test.ts`, `tests/gate-jev.test.ts`) son la regresión. Una variable fijada en la máquina de quien corre las pruebas cambiaría su resultado: las pruebas nuevas fijan y limpian el entorno con `vi.stubEnv`.
  - Contrato de errores: el código nuevo del rechazo entra en la lista de los que la cascada no degrada (`packages/engine/src/evaluators.ts:388`); los demás códigos y su degradación no cambian.
  - Proveedores locales reales: Ollama ya apunta a `http://127.0.0.1:11434/v1` (`packages/credentials/src/endpoints.ts:235`) y sigue igual sin la variable; con la variable, como cualquier transporte, va sin credencial (Ollama no la usa).
  - Riesgos residuales H1 y H3, declarados arriba.
- Impactos de sync, migración, Docker o despliegue: ninguno. No toca sincronización, migraciones, contenedores ni despliegue; cambia dos paquetes locales del harness (`@valmen/credentials` y `@valmen/gate-jev`), una línea de `@valmen/engine`, la documentación de proveedores y las pruebas. Ningún dato ni recibo existente se reescribe.

## Plan

- Alcance y exclusiones: una función nueva en `packages/credentials/src/endpoints.ts` lee y valida `VALMEN_BASE_URL_<TRANSPORTE>`; `resolveChatEndpoint` la usa para los transportes HTTP y `evaluateWithJev` para jev (`VALMEN_BASE_URL_JEV`); `callChat` y jev dejan de enviar credencial y de seguir redirecciones cuando la URL de prueba está activa; la cascada no degrada ante el rechazo; la variable se documenta en `docs/04-PROVEEDORES.md`. Quedan fuera: el transporte `claude-code` (sigue con `VALMEN_CLAUDE_BIN`); el servidor guionado, la prueba de `valmen gate` como subproceso y el CI (FEATURE-CLI-PRUEBA-CASCADA-GUIONADA-20261010); `listTransports` y la interfaz de Mission Control, que muestran el catálogo; y el uso de la variable como proxy local hacia un proveedor real.
- Decisiones de diseño (confirman y precisan D6 de `.valmen/features/guardas-verificacion-harness/design.md:55-62`):
  - Nombre: `VALMEN_BASE_URL_<ID>`, con el identificador del transporte en mayúsculas y `-` → `_`, la misma convención que `<ID>_API_KEY` (`packages/credentials/src/credentials.ts:99`): `VALMEN_BASE_URL_OPENROUTER`, `VALMEN_BASE_URL_OPENCODE_GO`, `VALMEN_BASE_URL_ANTHROPIC`, `VALMEN_BASE_URL_CODEX`, etc. Jev usa `VALMEN_BASE_URL_JEV` y le agrega `/decisions`, como los transportes agregan la ruta de su dialecto. Para `claude-code` la variable se ignora (no tiene HTTP; `callChat` sale antes, `packages/credentials/src/chat.ts:173-184`) y la documentación lo dice.
  - Host: se parsea con `new URL` y se compara el `hostname` ya normalizado, por igualdad exacta con `127.0.0.1` o `localhost`; nunca por prefijo de texto. `URL` normaliza `127.1`, `0x7f000001` y `2130706433` a `127.0.0.1` y `LOCALHOST` a `localhost`, y se aceptan porque son la misma dirección. `[::1]` y el resto de `127.x` se rechazan: R-GUI-001 nombra solo dos hosts, y ampliarlos es un cambio de spec que decide el PO.
  - Esquema y puerto: solo `http:` (el servidor guionado es HTTP plano; TLS sobre loopback no protege nada y sumaría casos); cualquier puerto, también omitido. La ruta se admite y se le quitan las barras finales; consulta, fragmento, usuario y contraseña se rechazan.
  - Credenciales: con la URL de prueba activa no se resuelve ni se envía ninguna credencial —ni `Authorization` ni `x-api-key`—, aunque llegue por `options.apiKey` desde el CLI o el servidor, y no se lee la de codex. Un servidor de prueba no necesita la clave, y así la prueba de S6 corre sin claves (R-GUI-003).
  - Redirecciones: con la URL de prueba activa, `fetch` recibe `redirect: "error"`. Sin la variable no se agrega la opción, para que el comportamiento no cambie.
  - Cuándo se valida: al resolver el transporte de cada llamada, antes de la credencial y de `fetch`; la variable de un transporte que no se usa no se lee. Un valor inválido lanza `TransportError` con el código nuevo `TEST_URL_REJECTED`, que la cascada no degrada. Una variable vacía o de solo espacios cuenta como ausente, como `VALMEN_CLAUDE_BIN` (`packages/credentials/src/claude-cli.ts:108-109`).
  - Mensaje: nombra la variable y la regla y nunca repite el valor, que podría traer una contraseña embebida.
  - Descartado: (a) validar con `startsWith("http://127.0.0.1")`, que acepta `http://127.0.0.1@evil.example` y `http://127.0.0.1.nip.io`; (b) reutilizar `esAnfitrionLocal` (`packages/server/src/server.ts:212-214`), que vive en un paquete del que `@valmen/credentials` no puede depender y acepta más hosts; (c) una costura de inyección en el CLI, que D6 descarta para probar el binario tal como lo usa una persona; (d) validar al cargar el módulo, que haría fallar comandos que no llaman a ningún modelo y no dejaría a las pruebas cambiar el entorno.
  - Pseudocódigo de la función nueva:
    ```text
    testBaseUrlFor(id, env = process.env):
      nombre = "VALMEN_BASE_URL_" + mayúsculas(id con "-" → "_")
      valor = recortar(env[nombre]); si ausente o "" → null
      url = new URL(valor)  (si lanza → rechazar)
      si url.protocol ≠ "http:" o url.hostname ∉ {"127.0.0.1", "localhost"}
         o url.username ≠ "" o url.password ≠ "" o url.search ≠ "" o url.hash ≠ "" → rechazar
      devolver url.origin + url.pathname sin barras finales
    rechazar: TransportError(nombre + ": la URL de prueba solo admite localhost (http://127.0.0.1 o http://localhost, con puerto y ruta opcionales, sin usuario, consulta ni fragmento).", "TEST_URL_REJECTED")
    ```
- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan). Confirma que solo se acepta `http:` con host exacto `127.0.0.1` o `localhost` (`[::1]` queda rechazado), sin usuario, consulta ni fragmento, y que C25 y C29 quedan como están escritos.
- Pasos ordenados:
  1. En `packages/credentials/src/endpoints.ts`: `TransportError` (`:34-41`) acepta un segundo parámetro `code` (`"TRANSPORT_UNSUPPORTED"` por defecto, o `"TEST_URL_REJECTED"`), sin cambiar a quien hoy la construye con uno solo; agregar y exportar `testBaseUrlFor(id: string, env: NodeJS.ProcessEnv = process.env): string | null` según el pseudocódigo; `HttpEndpoint` (`:53-57`) gana `readonly testUrl?: true`; `resolveChatEndpoint` (`:272-305`) recibe un tercer parámetro `env = process.env`, llama a `testBaseUrlFor(transport.id, env)` justo después del corte de `cli` (`:275-280`) y usa esa base, con `testUrl: true`, en las tres rutas (`:287`, `:290`, `:303`). El catálogo `TRANSPORTS` no cambia. (C1, C2, C3, C4, C5, C6, C7, C8, C9, C10)
  2. En `packages/credentials/src/anthropic.ts` y `packages/credentials/src/responses.ts`: `AnthropicRequest` (`:44-57`) y `ResponsesRequest` (`:126-136`) ganan `readonly redirect?: "error" | undefined`, y sus `fetch` (`anthropic.ts:153-158`, `responses.ts:195-200`) lo pasan solo si viene. (C13, C14, C15, C17)
  3. En `packages/credentials/src/chat.ts`, `callChat`: si `endpoint.testUrl === true`, la credencial es `""` sin llamar a `resolveCredentialFor` ni leer `options.apiKey` (`:195`); el camino `openai-chat` omite `Authorization` (`:257`); `/responses` ya la omite con `""` (`:206-208`) y `anthropicAuthHeaders("")` ya no pone `x-api-key` (`anthropic.ts:71-81`); los tres caminos pasan `redirect: "error"` (`:200-219`, `:224-241` y `:254-302`). Sin `testUrl`, las cabeceras y opciones quedan exactamente como hoy. (C11, C12, C13, C14, C15, C16, C17)
  4. En `packages/gate-jev/src/jev.ts`, `evaluateWithJev` (`:183`): primero `const base = testBaseUrlFor("jev")` (importado de `@valmen/credentials`, que ya importa en `:22`); si `base` no es `null`, la URL es `${base}/decisions`, no se resuelve credencial (`:184`), se omite `Authorization` (`:210`) y se pasa `redirect: "error"`; si es `null`, todo sigue con `DECISIONS_ENDPOINT` (`:25`) como hoy. (C18, C19, C20, C21, C22)
  5. En `packages/engine/src/evaluators.ts:388`, agregar `TEST_URL_REJECTED` a los códigos que la cascada no degrada, y actualizar el comentario de `:381-387`; el camino jev (`:490`) ya no degrada ante ese código y no cambia. (C23, C24, C25, C26)
  6. En `docs/04-PROVEEDORES.md`, una sección «1.4 URL base de prueba» junto a la de proveedores locales (`:107-110`): la variable por transporte y la de jev, los hosts y el esquema admitidos, que sin la variable nada cambia, que con ella no viaja credencial ni se siguen redirecciones, que `claude-code` usa `VALMEN_CLAUDE_BIN` y que no sirve de proxy hacia un proveedor real. (C27, C28)
  7. Crear `tests/url-base-prueba.test.ts`, sin red ni credenciales: casos de `testBaseUrlFor` y `resolveChatEndpoint` con `env` explícito, incluida una tabla de rechazos (`https://api.example.com/v1`, `http://127.0.0.1@evil.example/v1`, `http://usuario:clave@127.0.0.1:4010`, `https://127.0.0.1:4010`, `http://[::1]:4010`, `http://127.0.0.1.nip.io`, `http://localhost.evil.example`, `http://127.0.0.1:4010/v1?x=1`, `http://127.0.0.1:4010/v1#x` y `127.0.0.1:4010`); servidores `node:http` en `127.0.0.1` con puerto 0 para `callChat` (OpenRouter, `anthropic` y una redirección 307 hacia un segundo servidor) y para `evaluateWithJev`, con el entorno fijado y limpiado con `vi.stubEnv`/`vi.unstubAllEnvs` y `HOME` apuntando a un directorio temporal; un `fetchImpl` que captura las opciones para los casos sin variable; `runGate` sobre un laboratorio con `writeFixtureTicket` (`tests/helpers/fixtures.ts`) en `analyzed`, con la cascada de `tests/gate-cascade-fallo.test.ts:51-56`, el juez real y un doble de jev que cuenta, y con el evaluador `jev` real y un doble de juez que cuenta; y la lectura de `docs/04-PROVEEDORES.md`. Las aserciones usan `code` y `message`, sin importar `TransportError`, `TRANSPORTS`, `protocolFor` ni `listTransports`, para no cambiar `scripts/exports-sin-uso.linea-base.json:146-149`; si la implementación necesitara uno, se quita su línea de la línea base en el mismo cambio. (C1, C2, C3, C4, C5, C6, C7, C8, C9, C11, C12, C13, C14, C15, C16, C17, C18, C19, C20, C21, C23, C24, C25, C26, C27, C28)
  8. Desde la raíz del worktree: `npx vitest run tests/url-base-prueba.test.ts`; la regresión de C10, C22 y C29; `npx tsc --build tsconfig.build.json`; `npx tsc --noEmit -p tsconfig.json`; `node scripts/exports-sin-uso.mjs` (después del build); y `npx eslint packages/credentials packages/gate-jev packages/engine/src/evaluators.ts tests/url-base-prueba.test.ts`. (C10, C22, C29, C30, C31, C32)
  9. Revisión de seguridad del diff antes de entregar (skill `security-review` o un subagente revisor), buscando cualquier camino por el que una credencial viaje con la URL de prueba activa o por el que un host no local pase la validación; el resultado se anota en `## Implementación` y lo confirma la persona responsable en `awaiting_user_tests`. (C33)
- Compatibilidad: sin la variable no cambian la URL, las cabeceras ni las opciones de `fetch` de ningún transporte ni de jev; las pruebas que fijan las URL de catálogo y `DECISIONS_ENDPOINT` siguen como están. `TransportError` conserva su código por defecto, `resolveChatEndpoint` conserva su firma (el tercer parámetro es opcional) y los campos nuevos de `HttpEndpoint`, `AnthropicRequest` y `ResponsesRequest` son opcionales. Cambia a propósito una sola cosa de la cascada: un rechazo de la URL de prueba deja de degradar a jev. La única exportación nueva es `testBaseUrlFor`, consumida por `@valmen/gate-jev` y por la prueba, así que la guarda de exportaciones no la marca.
- Impactos declarados: ninguno; el ticket no declara sincronización, migración ni contenedores (`sync_impact`, `migration_impact` y `docker_impact` en false), y no hay despliegue.
- Pruebas previstas: directorio, la raíz del worktree; requisitos, Node 24 con las dependencias del monorepo instaladas, sin red ni credenciales (los servidores de prueba escuchan en `127.0.0.1` con puerto 0); resultado esperado, los comandos del paso 8 sin fallos. Comprobación manual opcional tras `npm run build`: `VALMEN_BASE_URL_OPENROUTER=https://example.com valmen gate analysis --id <ID> --evaluator cascade` sobre un ticket en `analyzed` falla con el mensaje de localhost, sin recibo nuevo.
- Rollback (obligatorio): revertir el commit del ticket en su rama (`git revert <hash>`), que quita `testBaseUrlFor`, los campos opcionales, el código `TEST_URL_REJECTED` de la cascada, la sección de la documentación y la prueba. No hay datos que migrar ni restaurar, y sin la variable el comportamiento ya era el anterior: quien no la defina no nota la reversión.

<!-- Los criterios de la sección siguiente se numeran C1…Cn, con una afirmación verificable por criterio
     —una frase con «y» son dos criterios—, y cada uno lleva debajo su anotación de
     verificación: un comentario HTML que dice «test:» y el comando, o «verify: manual». La
     sección no lleva comentarios dentro: un comentario con anotación se leería como la de un
     criterio. Ejemplo en la skill planificacion. -->
## Criterios de aceptación

- [x] C1 — R-GUI-001: Con `VALMEN_BASE_URL_OPENROUTER=http://127.0.0.1:<puerto>`, `resolveChatEndpoint` devuelve `http://127.0.0.1:<puerto>/chat/completions` para OpenRouter.
      <!-- test: npx vitest run tests/url-base-prueba.test.ts -->
- [x] C2 — R-GUI-001: Con la base `http://localhost:<puerto>/v1/`, la URL resultante es `http://localhost:<puerto>/v1/chat/completions`, sin doble barra.
      <!-- test: npx vitest run tests/url-base-prueba.test.ts -->
- [x] C3 — R-GUI-001: Con la variable, un modelo del dialecto `anthropic-messages` conserva la ruta `/messages`.
      <!-- test: npx vitest run tests/url-base-prueba.test.ts -->
- [x] C4 — R-GUI-001: Con la variable, un modelo del dialecto `openai-responses` conserva la ruta `/responses`.
      <!-- test: npx vitest run tests/url-base-prueba.test.ts -->
- [x] C5 — R-GUI-001: La variable de un proveedor con guion se llama con guion bajo (`VALMEN_BASE_URL_OPENCODE_GO`).
      <!-- test: npx vitest run tests/url-base-prueba.test.ts -->
- [x] C6 — R-GUI-001: Cada valor de la tabla de rechazos del paso 7 se rechaza con el código `TEST_URL_REJECTED`.
      <!-- test: npx vitest run tests/url-base-prueba.test.ts -->
- [x] C7 — R-GUI-001: El mensaje del rechazo dice que la URL de prueba solo admite localhost.
      <!-- test: npx vitest run tests/url-base-prueba.test.ts -->
- [x] C8 — R-GUI-001: El mensaje del rechazo no contiene el valor de la variable.
      <!-- test: npx vitest run tests/url-base-prueba.test.ts -->
- [x] C9 — R-GUI-001: Con la variable vacía, `resolveChatEndpoint` devuelve la URL del catálogo.
      <!-- test: npx vitest run tests/url-base-prueba.test.ts -->
- [x] C10 — R-GUI-001: Sin la variable, `resolveChatEndpoint` devuelve las URL de catálogo de hoy.
      <!-- test: npx vitest run tests/anthropic-dialect.test.ts tests/responses-dialect.test.ts tests/url-base-prueba.test.ts -->
- [x] C11 — R-GUI-001: Con la variable, `callChat` entrega la petición al servidor local y devuelve su contenido.
      <!-- test: npx vitest run tests/url-base-prueba.test.ts -->
- [x] C12 — R-GUI-001: Con la variable, el servidor local no recibe la cabecera `authorization` aunque `callChat` reciba `apiKey`.
      <!-- test: npx vitest run tests/url-base-prueba.test.ts -->
- [x] C13 — R-GUI-001: Con la variable, una petición del dialecto de Anthropic no lleva la cabecera `x-api-key`.
      <!-- test: npx vitest run tests/url-base-prueba.test.ts -->
- [x] C14 — R-GUI-001: Con la variable, un 307 del servidor local hace fallar `callChat` con el código `TRANSPORT`.
      <!-- test: npx vitest run tests/url-base-prueba.test.ts -->
- [x] C15 — R-GUI-001: El destino de ese 307 no recibe ninguna petición.
      <!-- test: npx vitest run tests/url-base-prueba.test.ts -->
- [x] C16 — R-GUI-001: Sin la variable, la petición de `callChat` a OpenRouter lleva `Authorization: Bearer` con la clave.
      <!-- test: npx vitest run tests/url-base-prueba.test.ts -->
- [x] C17 — R-GUI-001: Sin la variable, las opciones que recibe `fetch` no incluyen `redirect`.
      <!-- test: npx vitest run tests/url-base-prueba.test.ts -->
- [x] C18 — R-GUI-001: Con `VALMEN_BASE_URL_JEV`, `evaluateWithJev` llama a `<base>/decisions` en el servidor local.
      <!-- test: npx vitest run tests/url-base-prueba.test.ts -->
- [x] C19 — R-GUI-001: Con `VALMEN_BASE_URL_JEV`, la petición de jev no lleva la cabecera `authorization`.
      <!-- test: npx vitest run tests/url-base-prueba.test.ts -->
- [x] C20 — R-GUI-001: Con `VALMEN_BASE_URL_JEV` externa, `evaluateWithJev` falla con el código `TEST_URL_REJECTED`.
      <!-- test: npx vitest run tests/url-base-prueba.test.ts -->
- [x] C21 — R-GUI-001: Con `VALMEN_BASE_URL_JEV` externa, `evaluateWithJev` no llama a `fetch`.
      <!-- test: npx vitest run tests/url-base-prueba.test.ts -->
- [x] C22 — R-GUI-001: Sin la variable, jev sigue llamando a `DECISIONS_ENDPOINT`.
      <!-- test: npx vitest run tests/gate-jev.test.ts -->
- [x] C23 — R-GUI-001: La compuerta `analysis` con el evaluador `cascade` y `VALMEN_BASE_URL_OPENROUTER` externa falla diciendo que la URL de prueba solo admite localhost.
      <!-- test: npx vitest run tests/url-base-prueba.test.ts -->
- [x] C24 — R-GUI-001: Ante ese rechazo la cascada no degrada: el doble de jev se llama cero veces.
      <!-- test: npx vitest run tests/url-base-prueba.test.ts -->
- [x] C25 — R-GUI-001: Ante ese rechazo la compuerta no escribe recibo.
      <!-- test: npx vitest run tests/url-base-prueba.test.ts -->
- [x] C26 — R-GUI-001: Con el evaluador `jev` y `VALMEN_BASE_URL_JEV` externa, la compuerta no degrada al juez: el doble del juez se llama cero veces.
      <!-- test: npx vitest run tests/url-base-prueba.test.ts -->
- [x] C27 — R-GUI-001: `docs/04-PROVEEDORES.md` documenta `VALMEN_BASE_URL_<TRANSPORTE>` con la regla de localhost.
      <!-- test: npx vitest run tests/url-base-prueba.test.ts -->
- [x] C28 — R-GUI-001: `docs/04-PROVEEDORES.md` documenta `VALMEN_BASE_URL_JEV`.
      <!-- test: npx vitest run tests/url-base-prueba.test.ts -->
- [x] C29 — R-GUI-001: Las pruebas existentes de transportes, jev y cascada pasan con el cambio.
      <!-- test: npx vitest run tests/anthropic-dialect.test.ts tests/responses-dialect.test.ts tests/gate-jev.test.ts tests/gate-cascade-fallo.test.ts tests/cascada-verificada.test.ts tests/cascada-productor-reintento.test.ts tests/evaluators.test.ts tests/routing.test.ts tests/recibo-motivos.test.ts tests/claude-cli.test.ts -->
- [x] C30 — R-GUI-001: El monorepo compila con el cambio.
      <!-- test: npx tsc --build tsconfig.build.json -->
- [x] C31 — R-GUI-001: Las pruebas tipan contra el código nuevo.
      <!-- test: npx tsc --noEmit -p tsconfig.json -->
- [x] C32 — R-GUI-001: La guarda de exportaciones sin uso no encuentra exportaciones nuevas ni entradas sobrantes.
      <!-- test: node scripts/exports-sin-uso.mjs -->
- [ ] C33 — R-GUI-001: La revisión de seguridad del diff no encuentra un camino por el que una credencial viaje con la URL de prueba activa.
      <!-- verify: manual -->

## Puntos

```json
[]
```

## Implementación

Sigue `## Plan` sin desviaciones (pasos 1 a 8 hechos; el 9 es la revisión de seguridad de abajo).

- `packages/credentials/src/endpoints.ts`: `TransportError` acepta `code` (`TRANSPORT_UNSUPPORTED` por defecto, `TEST_URL_REJECTED`); `testBaseUrlFor` (`:297`) valida con `new URL` y compara el `hostname` contra `HOSTS_DE_PRUEBA` (`:279`); `resolveChatEndpoint` (`:343`) gana el parámetro `env` y marca `testUrl: true` en las tres rutas.
- `packages/credentials/src/chat.ts:196-203`: con `testUrl` la credencial es `""` sin resolver ninguna, `Authorization` se omite (`:267`) y los tres caminos pasan `redirect: "error"` (`:224`, `:247`, `:312`). `anthropic.ts:62,164` y `responses.ts:141,206` reenvían `redirect` solo si viene.
- `packages/gate-jev/src/jev.ts:188-222`: `VALMEN_BASE_URL_JEV` (`<base>/decisions`), sin credencial ni `Authorization` y con `redirect: "error"`; sin la variable, `DECISIONS_ENDPOINT` como siempre.
- `packages/engine/src/evaluators.ts:390-395`: `TEST_URL_REJECTED` entra en los códigos que la cascada no degrada; el comentario lo explica.
- `docs/04-PROVEEDORES.md`: sección «1.4 URL base de prueba».
- La única exportación nueva es `testBaseUrlFor`, consumida por `@valmen/gate-jev` y por la prueba; la línea base de exportaciones no cambió.

Pruebas primero (EST-010): `tests/url-base-prueba.test.ts` se escribió antes que el código y se corrió en rojo sin implementación: C8 se reforzó para exigir también el código del rechazo, porque en la primera corrida pasaba en vacío (el error era un `TypeError` que no contenía el valor); con eso quedaron 29 en rojo de 35 (reglas de C1 a C9, C11 a C15, C18 a C21, C23 a C28 y los casos de un transporte que no se usa y de hosts equivalentes) y 6 en verde, que son las de regresión de lo que el cambio toca (C10 con proveedor desconocido y con `claude-code`, C16, C17, C16 de Anthropic y codex, C22). Todas las pruebas ya existentes siguieron en verde: ninguna se tocó. Dos pruebas se agregaron después del código (la redirección en los dialectos de Anthropic y Responses, y en jev, que los criterios no pedían): se comprobaron quitando a mano el `redirect` de `anthropic.ts`, `responses.ts` y `jev.ts`, y fallan; con el código restaurado pasan. También se comprobó por mutación que fallan C12, C14, C15 y la tabla de rechazos si se vuelve a enviar `Authorization`, se quita `redirect` en `callChat` o se valida el host por prefijo. Ninguna prueba hace una llamada de red ni usa una clave real.

### Revisión de seguridad del diff (paso 9, criterio C33)

La hizo un subagente revisor independiente (sin mi conclusión), con reproducciones sin red. Sin hallazgo en: credencial en los tres caminos de `callChat` y en jev con la URL de prueba activa; confusiones de parseo de URL (unos 75 valores, entre ellos `\`, `@`, `#`, `?`, IDN, IP decimal, hexadecimal y octal, `//`, tabulaciones; los aceptados se reconstruyen como `origin + pathname` y `Request` los resuelve a `127.0.0.1` o `localhost`); fuga del valor en mensajes y recibos; cambios de comportamiento sin la variable.

Hallazgos, todos fuera del plan aprobado, **sin tocar y para decisión de la persona responsable**:

- H1 (media): con la URL de prueba activa, la cascada y jev siguen degradando por `TRANSPORT`, `SERVER` o una respuesta mal formada (servidor local caído, un 307, un 5xx) hacia el servicio real, **con la clave real** si `options.apiKey` la trae: `evaluators.ts:390-405` (la cascada cae a jev) y `evaluators.ts:498-516` (jev cae al juez). Además el verificador de la cascada (`cascade.ts:336-342`, y el reintento con el proveedor de escalado en `cascade.ts:299`) llama a `evaluateWithJev` y solo queda local si `VALMEN_BASE_URL_JEV` también está definida. La clave no viaja al host de la variable, sino al proveedor de siempre: es el riesgo H3 del diagnóstico, que el plan dejó para FEATURE-CLI-PRUEBA-CASCADA-GUIONADA-20261010 (definir la variable de cada transporte de la cadena y la de jev). El arreglo mínimo que propone el revisor —no degradar mientras haya una `VALMEN_BASE_URL_*` activa y exigir todo o nada en la cadena— amplía el alcance aprobado y por eso no se hizo. Por esto C33 queda sin marcar: hoy «ninguna credencial viaja con la URL de prueba activa» vale para el transporte que tiene la variable, no para toda la cadena. §1.4 de la documentación dice «no viaja ninguna credencial» sin esa precisión; conviene ajustarla cuando se decida.
- H2 (baja): `localhost` lo resuelve el sistema operativo y no está garantizado que sea loopback (H1 del diagnóstico, aceptado). Alternativa del revisor: devolver `http://127.0.0.1…` cuando el host sea `localhost`.
- H3 (informativa): con `NODE_USE_ENV_PROXY=1`, `fetch` manda también la petición loopback al proxy salvo que `NO_PROXY` incluya `127.0.0.1` y `localhost`. No viaja credencial, pero sí el estado del ticket. Basta documentarlo.

## Pruebas

Contrato de entrega para la persona responsable. Todo corre desde la raíz del worktree
(`/Users/juanandrade/Desktop/ValmenHarness/.claude/worktrees/ticket-url-base-prueba`, rama
`valmen/ticket-url-base-prueba`).

Requisitos de ambiente: Node 24 con las dependencias del monorepo instaladas (`npm install` ya
hecho). Sin red y sin claves: los servidores de prueba escuchan en `127.0.0.1` con puerto 0, las
claves son literales falsos, `HOME` apunta a un directorio temporal y `fetch` global se sustituye
por uno que rechaza cualquier host que no sea local. Las pruebas nuevas fijan y limpian las
variables `VALMEN_BASE_URL_*` por su cuenta, así que una fijada en el shell no las afecta.

| Qué | Comando | Resultado esperado |
| --- | --- | --- |
| Pruebas del ticket (C1 a C28) | `npx vitest run tests/url-base-prueba.test.ts` | 1 archivo, 37 pruebas, todas en verde |
| Regresión de transportes, jev y cascada (C10, C22, C29) | `npx vitest run tests/anthropic-dialect.test.ts tests/responses-dialect.test.ts tests/gate-jev.test.ts tests/gate-cascade-fallo.test.ts tests/cascada-verificada.test.ts tests/cascada-productor-reintento.test.ts tests/evaluators.test.ts tests/routing.test.ts tests/recibo-motivos.test.ts tests/claude-cli.test.ts` | 10 archivos, todas en verde (310 pruebas) |
| Compilación (C30) | `npx tsc --build tsconfig.build.json` | sin salida, código 0 |
| Tipos de las pruebas (C31) | `npx tsc --noEmit -p tsconfig.json` | sin salida, 0 errores |
| Exportaciones sin uso (C32) | `node scripts/exports-sin-uso.mjs` (o `npm run exports:check`) | «Sin exportaciones nuevas sin consumidor; la línea base tiene 443 entradas» |
| Lint | `npx eslint packages/credentials packages/gate-jev packages/engine/src/evaluators.ts tests/url-base-prueba.test.ts` | sin salida |

Validaciones manuales:

1. (C33) Revisar la sección «Revisión de seguridad» de `## Implementación` y confirmar, leyendo
   `git diff -- packages` de la rama, que no queda un camino por el que una credencial viaje con la
   URL de prueba activa ni un host no local que pase la validación. Es el único criterio sin
   anotación de comando: lo decide la persona responsable.
2. Opcional, tras `npm run build`, con un ticket en `analyzed`:
   `VALMEN_BASE_URL_OPENROUTER=https://example.com node packages/cli/dist/main.js gate analysis --id <ID> --evaluator cascade`
   debe fallar con «la URL de prueba solo admite localhost» y sin recibo nuevo en
   `.valmen/receipts/`. No la ejecutó el agente: la cubren C23 a C25 sobre `runGate`.

Cobertura y limitaciones: las pruebas del dialecto de Responses usan un servidor SSE mínimo; el
caso de `localhost` resuelto por el sistema operativo por `::1` (H1) no se prueba, queda como
riesgo residual declarado en el diagnóstico.

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
    "model": "claude-sonnet-5-5",
    "reasoning_effort": null,
    "notes": "Una sesión de subagente de implementación (fase implementation) para este solo ticket; la sesión no expone sus números de tokens ni de coste, así que no se declaran. Incluye un subagente revisor de seguridad (informó 210600 tokens y 289 s) cuyo gasto no se suma a una cifra de la sesión.",
    "input_tokens": null,
    "output_tokens": null,
    "total_tokens": null,
    "estimated_cost_usd": null,
    "source": "manual:subagente claude-sonnet-5-5 sin agregado de tokens expuesto a la sesión",
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
    "at": "2026-10-10T21:47:33.212Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-10",
    "at": "2026-10-11T00:15:25.653Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-10",
    "at": "2026-10-11T00:19:08.164Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-10",
    "at": "2026-10-11T00:23:25.257Z",
    "action": "gate-approved",
    "actor": "cli",
    "details": "Gate plan aprobado por juan andrade (recibo GR-20261011-FEATURE-CREDENTIALS-URL-BASE-PRUEBA-20261010-plan-1, canal cli, decidida 2026-10-11T00:23:25.254Z): Aprobar tal cual (Recomendado)"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-10",
    "at": "2026-10-11T00:23:25.568Z",
    "action": "plan-approved",
    "actor": "cli",
    "details": "{\"actor\":\"juan andrade\",\"source\":\"cli\",\"quote\":\"Aprobar tal cual (Recomendado)\",\"planHash\":\"sha256:2a61cbf3827427eb7193c240834ef2edcafbfa566046bb77e8b6b4d416d42fe6\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-10",
    "at": "2026-10-11T00:23:25.887Z",
    "action": "plan-approval-verified",
    "actor": "cli",
    "details": "Aprobación del plan vigente: juan andrade (fuente cli), plan sha256:2a61cbf3827427eb7193c240834ef2edcafbfa566046bb77e8b6b4d416d42fe6."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-10",
    "at": "2026-10-11T00:23:25.887Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-10-10",
    "at": "2026-10-11T00:23:48.835Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-10-10",
    "at": "2026-10-11T00:42:09.335Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-10-10",
    "at": "2026-10-11T00:42:56.808Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  }
]
```
