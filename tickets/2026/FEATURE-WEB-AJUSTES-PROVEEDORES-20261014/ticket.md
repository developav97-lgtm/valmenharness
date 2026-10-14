---
schema_version: 2
id: FEATURE-WEB-AJUSTES-PROVEEDORES-20261014
title: Proveedores con estado y uso por el perfil activo
type: FEATURE
module: WEB
workflow_status: awaiting_user_tests
qa_status: pending
release_status: unreleased
user_visible: false
sync_impact: false
migration_impact: false
docker_impact: false
risk_level: normal
created: 2026-10-14
updated: 2026-10-14
related_ticket: null
target_release: null
released_in: null
---

# FEATURE-WEB-AJUSTES-PROVEEDORES-20261014

## Solicitud original

Parte del sprint: Ajustes rediseñados: Modelos con perfil activo y roles agrupados, cambio de perfil con vista previa, Proveedores y Proyecto por bloques.
- R-MARCO-006: Cada pantalla DEBERÍA funcionar en el celular
- R-AJU-005: Proveedores DEBE distinguir configurado, detectado y sin configurar, y decir si el perfil activo lo usa
Depende de: FEATURE-WEB-MENU-GRUPOS-20261014.
Viene de una feature descompuesta en sprints; su plan completo está en el tickets.yaml de la feature.

Comportamiento esperado: Cada pantalla DEBERÍA funcionar en el celular Proveedores DEBE distinguir configurado, detectado y sin configurar, y decir si el perfil activo lo usa
Comportamiento actual: la spec no lo declara; se establece en el análisis, leyendo el código.

### Fuera de alcance

Lo que el grafo asignó a otros tickets y este no hace:
- R-MARCO-006: lo cubre FEATURE-WEB-MENU-GRUPOS-20261014 (Menú por grupos con proyecto, perfil activo y Pedir un cambio)
- R-MARCO-006: lo cubre FEATURE-WEB-INICIO-DECISIONES-20261014 (Inicio con lo que espera una decisión de la persona)
- R-MARCO-006: lo cubre FEATURE-WEB-AJUSTES-MODELOS-20261014 (Vista Modelos con perfil activo, roles agrupados y aviso de cliente)
- R-MARCO-006: lo cubre FEATURE-WEB-AJUSTES-CAMBIAR-PERFIL-20261014 (Cambiar de perfil con vista previa de lo que cambia)
- R-MARCO-006: lo cubre FEATURE-WEB-AJUSTES-PROYECTO-20261014 (Proyecto con bloques e interruptores y YAML en Avanzado)
- R-MARCO-006: lo cubre FEATURE-WEB-TRABAJO-TICKETS-20261014 (Tickets y detalle con filtro por turno y ciclo de ocho pasos)
- R-MARCO-006: lo cubre FEATURE-WEB-TRABAJO-FEATURES-20261014 (Features con estado y tablero de recorrido y siguiente paso)
- R-MARCO-006: lo cubre FEATURE-WEB-TRABAJO-PORTAFOLIO-20261014 (Portafolio con una tarjeta por proyecto)
- R-MARCO-006: lo cubre FEATURE-WEB-VIVO-AGENTES-20261014 (Agentes con titular, pregunta pendiente y selector de mundo)
- R-MARCO-006: lo cubre FEATURE-WEB-VIVO-PROCESOS-20261014 (Procesos con las corridas detenidas primero)
- R-MARCO-006: lo cubre FEATURE-WEB-REGLAS-ESTANDARES-20261014 (Estándares separados en vigor, propuestos y descartados)

### Referencias de diseño

Adjuntos que citan los requisitos de este ticket. Se construye y se valida contra el original, no contra el texto de la spec:
- `.valmen/features/rediseno-mission-control/assets/proveedores.html` — Boceto aprobado por el PO el 2026-10-14: Ajustes › Proveedores (HTML autónomo, el original) (sha256 1a659bdd4b25…)
- `.valmen/features/rediseno-mission-control/assets/proveedores.png` — Captura a 1440 px del boceto aprobado: Ajustes › Proveedores (sha256 2c412080187f…)

### Supuestos y decisiones pendientes

<!-- Si el pedido nombra algo que el código no tiene —parámetro, permiso,
campo, bandera, columna, migración— y no lo especifica, listá cada elemento
con su pregunta antes de avanzar a análisis; el análisis no planifica sobre
la adivinanza. Si no hay ninguno, escribí «Ninguno» y seguí. -->
Ninguno.

## Descripción funcional

- Alcance: solo la vista Ajustes › Proveedores (`#/proveedores`) de Mission Control, en `packages/server/web/index.html` (función `vistaProveedores` y las que ella usa: `origen`, `probarConexion`, `abrirDialogo`, `guardar`, `borrarClave`). Cubre R-AJU-005 entero y la parte de R-MARCO-006 que toca a esta pantalla (390 px sin desplazamiento horizontal de la página). El menú, el tema y la línea del perfil activo ya están en `main` (FEATURE-WEB-MENU-GRUPOS-20261014, FEATURE-WEB-TEMA-TOKENS-20261014) y no se tocan. Modo: harness completo, porque es una funcionalidad de una feature descompuesta y el ticket ya existe.
- Usuario o rol afectado: la persona que configura el proyecto (PO o desarrollador) desde Mission Control, en escritorio y en el celular.
- Comportamiento actual: la pantalla es una tabla de cinco columnas (Proveedor, Autenticación, Estado, Origen, acciones), una fila por proveedor del catálogo, con un punto verde o gris. El estado se escribe en texto («configurada · N caracteres», «detectada en el CLI», «local», «sin configurar»), pero el punto no distingue configurado de detectado, no hay leyenda de los estados y **no dice nada del perfil activo**: ni si lo usa ni cuántos trabajos dependen del proveedor. A 390 px la tabla de cinco columnas es más ancha que la pantalla.
- Comportamiento esperado (boceto aprobado `.valmen/features/rediseno-mission-control/assets/proveedores.html` y su captura `proveedores.png`): cabecera «Ajustes · Proveedores» con el título «De dónde salen los modelos» y una línea que explica que las claves nunca se muestran; una leyenda con los tres estados (Configurado: guardaste la clave aquí, punto lleno; Detectado: la CLI ya tenía sesión, anillo; Sin configurar: punto gris); una rejilla de tarjetas, una por proveedor, con el punto del estado, el nombre, la marca «lo usa el perfil» o «sin uso hoy», y una lista Estado / Id / Trabajos («7 del perfil activo», o «0 · lo usa el perfil codex-completo»), y las acciones «Probar conexión» y «Configurar clave» o «Reemplazar clave». La clave nunca se muestra; a lo sumo, su longitud. En el celular las tarjetas pasan a una columna sin desplazamiento horizontal.

## Diagnóstico

- Causa comprobada (con `ruta:línea`): es un requisito nuevo, no un defecto. La vista actual pinta una tabla (`packages/server/web/index.html:9051`, cierre en `:9150`) a partir de `GET /api/providers` (`index.html:9048` → `packages/server/src/server.ts:2005` → `listProviders` en `packages/server/src/providers.ts:452`). El estado sale de `configured` y `source` (`providers.ts:336-377`): `credentials-file` y `environment` son claves configuradas, `cli` es una sesión detectada (Claude Code por `readClaudeCliAuth`, `providers.ts:466-475`; Codex y OpenCode Go por `tokenSource`, `providers.ts:501-516`), y `none` con `configured` es un proveedor local (Ollama, `providers.ts:518-530`). La vista ya distingue esos casos en texto (`index.html:9083-9089`) pero el punto es binario (`index.html:9064`: `ok`/`no`). La vista **no pide el perfil**: el perfil activo y sus roles viven en `GET /api/perfiles` (`server.ts:1678`: `perfiles` = `listarPerfiles`, `packages/adapter/src/routing.ts:827`; `seleccion.proyecto` = `readSeleccionDePerfil`, `routing.ts:730`), y cada perfil trae `roles` con su `provider` (`routing.ts:512-580`: `claude-code-completo` pone siete roles en `claude-code` y seis evaluadores en `openrouter`, que es exactamente el «7 del perfil activo» y el «6» del boceto). El menú ya lee ese mismo dato para la línea del perfil (`marcarPerfilActivo`, `index.html:9574-9591`). Por tanto el dato que pide R-AJU-005 —«cuántos trabajos del perfil activo dependen de él»— **ya lo entrega el servidor hoy**: se calcula en el cliente contando los roles del perfil elegido cuyo `provider` es el id del proveedor, sin cambio de API.
- Hipótesis pendientes: (1) el conteo por perfil no incluye los overrides de `routing.yaml` (`resolveRouting`, `routing.ts:1000-1045`: un override de proyecto gana al perfil). El requisito habla del **perfil** activo, y la pantalla Modelos es la que muestra la ruta efectiva; se cuenta el perfil y se registra como decisión del agente. (2) El boceto ofrece «Configurar clave» en Claude Code y Codex, que son de suscripción (`auth: "subscription"`): el servidor no acepta clave para ellos (la vista actual solo ofrece configurar a `api-key`, `index.html:9130`), así que se mantiene esa regla y se registra como decisión. (3) La tarjeta «Añadir proveedor» del boceto no tiene respaldo: el catálogo es fijo (`PROVIDERS`, `providers.ts:430`) y no hay ruta para añadir uno; queda fuera y se registra como decisión. (4) Hoy el catálogo tiene once proveedores (`providers.ts:159-326`) y el boceto muestra cuatro: se muestran todos, los que usa el perfil primero, luego los configurados o detectados y al final los sin configurar.
- Consumidores afectados: solo la persona que abre `#/proveedores`. Las funciones `probarConexion`, `abrirDialogo`, `guardar` y `borrarClave` (`index.html:9154-9236`) se reutilizan sin cambiar su contrato con el servidor (`POST /api/providers/:id/probe`, `PUT|DELETE /api/providers/:id/credential`); `guardar` y `borrarClave` vuelven a llamar a `vistaProveedores` y buscan el resultado por `.resultado[data-id]` (`index.html:9206`), que la tarjeta tiene que conservar. `cacheModelos` sigue invalidándose al guardar o borrar. Ninguna otra vista llama a `vistaProveedores` (router en `index.html:9716`). No hay prueba existente de la vista (las de `tests/mission-control.test.ts` y `tests/api-rutas.test.ts` cubren la API, que no cambia).
- Archivos y flujo investigados: `packages/server/web/index.html` (vista `:9018-9236`, tokens de tema `:60-115`, corte de 768 px `:501`, perfil activo del menú `:9574`); `packages/server/src/server.ts:1678` y `:2005`; `packages/server/src/providers.ts:336-530`; `packages/adapter/src/routing.ts:84-140`, `:512-580`, `:730`, `:827`, `:1000-1045`; el boceto y su captura; `tests/menu-grupos.test.ts` y `scripts/verificar-interfaz.mjs` como patrón para probar la vista ejecutada con respuestas falsas. `buscar_memoria` («vista proveedores web estado configurado detectado clave perfil activo») no devolvió nada de este módulo: los cinco resultados (AP-001…AP-006) son de compuertas.
- Riesgos y compatibilidad: (a) la clave no debe aparecer nunca: la API ya no la devuelve (solo `keyLength`, `providers.ts:346`) y la vista solo mostrará la longitud; se prueba que un valor de clave puesto en la respuesta falsa no aparece en lo pintado. (b) Si `GET /api/perfiles` falla o no hay perfil elegido, la pantalla tiene que seguir mostrando los proveedores y decirlo («sin perfil activo»), no romperse. (c) Otros dos tickets editan a la vez `packages/server/web/index.html`: el cambio se limita a `vistaProveedores` y su bloque de estilos propio, sin mover ni reformatear código ajeno. (d) Los colores salen de los tokens del tema (`--ok`, `--modelo`, `--tenue-deco`, `--borde`), sin colores a mano, para no romper el modo claro.
- Impactos de sync, migración, Docker o despliegue: ninguno. Solo cambia el HTML estático de Mission Control; no hay cambio de API, de datos, de migración, de contenedores ni de despliegue.

## Plan

- Gate de plan y aprobación: compuerta `plan` con el evaluador `cascade`; la aprobación sale de la política por defecto del PO (`valmen approve-by-authorization` si da APPROVE, `valmen review-agent --record` si da REVIEW) y la decide el orquestador o el PO, no el subagente que planifica.
- Alcance: la vista Ajustes › Proveedores de `packages/server/web/index.html` —`vistaProveedores()` y su ayudante `origen`, más un bloque de estilos propio con prefijo `.proveedor`— y una prueba nueva `tests/ajustes-proveedores.test.ts`. `probarConexion`, `abrirDialogo`, `guardar` y `borrarClave` se reutilizan sin cambiar sus llamadas al servidor. Exclusiones: el servidor y la API (`GET /api/providers` y `GET /api/perfiles` se leen como están, D-001), la tarjeta «Añadir proveedor» del boceto (D-003), configurar clave a proveedores de suscripción (D-002), el menú, el tema y la línea del perfil (ya en `main`), y las demás vistas de S2 que editan a la vez el mismo archivo: no se mueve ni se reformatea código ajeno.
- Decisiones registradas: D-001 (el conteo sale de `GET /api/perfiles`, roles del perfil elegido con ese `provider`, sin overrides de `routing.yaml`), D-002 (acción de clave solo para `auth: "api-key"`), D-003 (sin «Añadir proveedor»), D-004 (todos los proveedores, ordenados: los del perfil, luego configurados o detectados, al final sin configurar; sin perfil o con fallo, «sin perfil activo»), D-005 (`environment`, `credentials-file` y local cuentan como Configurado; Detectado solo con `source: "cli"`) y D-006 (la línea Trabajos dice «N del perfil activo»).
- Respuesta al diagnóstico (cada hallazgo y el paso que lo resuelve):
  - Tabla de cinco columnas con punto binario (`index.html:9051`, `index.html:9064`): paso 3; lo comprueba el paso 1 (C1, C2, C17).
  - Estado escrito pero sin leyenda ni tres marcas (`index.html:9083-9089`): paso 3 con D-005; lo comprueba el paso 1 (C1, C2, C3).
  - La vista no pide el perfil (`index.html:9048`; dato en `server.ts:1678`, `routing.ts:512-580`): paso 2 con D-001 y D-006; lo comprueba el paso 1 (C5-C10).
  - Once proveedores frente a los cuatro del boceto (`providers.ts:159-326`): paso 2 con D-004; lo comprueba el paso 1 (C11).
  - Clave que no debe mostrarse (`providers.ts:346`): paso 3; lo comprueba el paso 1 (C4).
  - Consumidores `probarConexion`, `abrirDialogo`, `guardar`, `borrarClave` y `.resultado[data-id]` (`index.html:9154-9236`, `index.html:9206`): paso 3 los conserva; lo comprueba el paso 1 (C12-C16).
  - Tabla más ancha que 390 px: paso 4; lo comprueban el paso 1 (C17) y el paso 6 (C18).
  - H2 (suscripción) y H3 («Añadir proveedor»): D-002 y D-003, paso 3; lo comprueba el paso 1 (C14).
- Pasos ordenados:
  1. Escribir `tests/ajustes-proveedores.test.ts` y verlo en rojo con `npx vitest run tests/ajustes-proveedores.test.ts`, antes de tocar `index.html`. Interfaz ejecutada con `ejecutarInterfaz` de `scripts/verificar-interfaz.mjs`, `hash: "#/proveedores"` y respuestas simuladas de `GET /api/providers` (Claude Code `cli` de suscripción, OpenRouter `credentials-file` con `keyLength: 35`, Codex `cli`, OpenCode Go `environment`, Ollama local `none` con `configured: true`, DeepSeek sin configurar) y de `GET /api/perfiles` (perfil `claude-code-completo` con siete roles en `claude-code` y seis en `openrouter`, y `codex-completo` con roles en `codex`). Casos: la leyenda nombra «Configurado», «Detectado» y «Sin configurar» (C1); en una tabla de casos, el estado de cada tarjeta según `configured` y `source` (C2); OpenRouter dice «35 caracteres» (C3); una respuesta con un campo `apiKey` que lleva un valor marcador no deja ese marcador en el texto pintado (C4); Claude Code dice «lo usa el perfil» (C5) y «7 del perfil activo» (C6); DeepSeek dice «sin uso hoy» (C7); Codex dice «0 · lo usa el perfil codex-completo» (C8); con `seleccion.proyecto: null` las tarjetas siguen y dicen «sin perfil activo» (C9); con `GET /api/perfiles` que lanza error, las tarjetas siguen (C10); el orden de los nombres pintados es los del perfil, luego configurados o detectados, luego sin configurar (C11). Regresión de las acciones: clic en «Probar conexión» llama a `POST /api/providers/openrouter/probe` y pinta su `detail` (C12); en una tabla de casos, el rótulo de la acción de clave es «Reemplazar clave» con clave y «Configurar clave» sin ella, y su clic abre `#dialogo` (C13); Claude Code y Codex no tienen botón de clave (C14); «Borrar clave» con `confirm` aceptado llama a `DELETE /api/providers/openrouter/credential` (C15); escribir en `#clave` y pulsar `#guardar` llama a `PUT /api/providers/<id>/credential` con `{ apiKey }` y pinta el `detail` de la prueba en la `.resultado[data-id]` de esa tarjeta (C16). Lectura de `index.html` como texto: la regla de la rejilla `.proveedores` usa `repeat(auto-fit, minmax(min(100%, 280px), 1fr))` (C17).
  2. `packages/server/web/index.html`, `vistaProveedores()`: pedir en paralelo `GET /api/providers` y `GET /api/perfiles` (este con `catch` que deja `null`, D-004); funciones locales `estadoDe(p)` → `"configurado" | "detectado" | "sin-configurar"` (D-005), `usoDe(p, perfiles, seleccion)` → `{ delPerfil: n, otro: id | null }` contando `Object.values(perfil.roles)` con `provider === p.id` en el perfil elegido y buscando el primer otro perfil que lo use (D-001, D-006); orden estable por grupo (D-004) (C2, C5-C11).
  3. `index.html`, marcado de la vista: cabecera con el rótulo «Ajustes · Proveedores», el título «De dónde salen los modelos» y la línea «Cada proveedor dice si lo usa el perfil activo. Las claves nunca se muestran: solo si están y cuántos caracteres tienen.»; leyenda con los tres estados; rejilla `.proveedores` con un `<article class="proveedor">` por proveedor: punto `.proveedor-punto` con modificador `configurado`, `detectado` o `sin-configurar`, nombre, marca «lo usa el perfil» / «sin uso hoy» / «sin perfil activo», `<dl>` con Estado (texto con origen y, si hay, «N caracteres»), Id y Trabajos, la `.resultado` con `data-id` y el aviso de `tokenSource` o del nombre de campo anterior; acciones «Probar conexión» (si `probeable`), «Configurar clave»/«Reemplazar clave» (solo `api-key`, D-002) y «Borrar clave» (clave en el archivo), con los mismos manejadores que hoy. Nunca se escribe un valor de clave: solo `keyLength` (C1-C4, C12-C16).
  4. `index.html`, estilos: un bloque propio `.proveedores`, `.proveedor`, `.proveedor-punto`, `.leyenda-proveedores` solo con tokens del tema (`--panel`, `--borde`, `--ok`, `--tenue-deco`, `--modelo`, `--tenue`, `--fuente-titulo`, `--mono`), la tarjeta que usa el perfil con borde en `--modelo`, y la rejilla `repeat(auto-fit, minmax(min(100%, 280px), 1fr))` para que a 390 px quede en una columna (C17, C18, C19).
  5. Regresión: `npx vitest run tests/ajustes-proveedores.test.ts tests/interfaz-ejecutable.test.ts tests/menu-grupos.test.ts tests/tema-tokens.test.ts tests/mission-control.test.ts tests/estaticos-web.test.ts` y `node scripts/verificar-interfaz.mjs` (la vista con `providers: []` no debe fallar); si una prueba existente se pone en rojo, se detiene y se reporta en el ticket sin editarla (C20).
  6. Verificación en el navegador con `npm run build` y `node packages/cli/dist/main.js serve` desde el worktree: `#/proveedores` a 1440 px en modo oscuro contra `.valmen/features/rediseno-mission-control/assets/proveedores.png` y en modo claro (C19); a 390 px sin desplazamiento horizontal de la página (C18); `revisar_presentacion` sin avisos de color; capturas como evidencia del ticket.
- Impactos declarados: ninguno (sin sincronización, migración ni contenedores; `sync_impact`, `migration_impact` y `docker_impact` en `false`).
- Tamaño previsto: unas 470 líneas (unas 190 de producción en `index.html`, entre vista y estilos, y unas 280 de pruebas); 20 criterios.
- Si excede el tope: no excede el tope (`delivery-budget: 600`; 20 criterios, el tope del precheck). Si la implementación pasa de 600 líneas, sigue: todo vive en la misma función `vistaProveedores()` y su bloque de estilos, y no hay un corte que deje a cada parte con su código y sus pruebas.
- Rollback (obligatorio): revertir el commit del ticket en su rama; no hay datos, esquema, configuración ni API que deshacer.

<!-- Los criterios de la sección siguiente se numeran C1…Cn, con una afirmación verificable por criterio
     —una frase con «y» son dos criterios—, y cada uno lleva debajo su anotación de
     verificación: un comentario HTML que dice «test:» y el comando, o «verify: manual». La
     sección no lleva comentarios dentro: un comentario con anotación se leería como la de un
     criterio. Ejemplo en la skill planificacion. -->
## Criterios de aceptación

- [x] C1 (R-AJU-005): la leyenda de arriba explica los tres estados (`Configurado`, `Detectado`, `Sin configurar`)
      <!-- test: npx vitest run tests/ajustes-proveedores.test.ts -->
- [x] C2 (R-AJU-005): cada tarjeta muestra el estado que se deriva de `configured` con `source`
      <!-- test: npx vitest run tests/ajustes-proveedores.test.ts -->
- [x] C3 (R-AJU-005): un proveedor con clave guardada muestra cuántos caracteres tiene la clave
      <!-- test: npx vitest run tests/ajustes-proveedores.test.ts -->
- [x] C4 (R-AJU-005): ningún valor de clave aparece en la pantalla
      <!-- test: npx vitest run tests/ajustes-proveedores.test.ts -->
- [x] C5 (R-AJU-005): la tarjeta de un proveedor que usa el perfil activo dice «lo usa el perfil»
      <!-- test: npx vitest run tests/ajustes-proveedores.test.ts -->
- [x] C6 (R-AJU-005): la tarjeta dice cuántos trabajos del perfil activo dependen del proveedor
      <!-- test: npx vitest run tests/ajustes-proveedores.test.ts -->
- [x] C7 (R-AJU-005): la tarjeta de un proveedor que el perfil activo no usa dice «sin uso hoy»
      <!-- test: npx vitest run tests/ajustes-proveedores.test.ts -->
- [x] C8 (R-AJU-005): un proveedor sin uso en el perfil activo nombra otro perfil que lo usa
      <!-- test: npx vitest run tests/ajustes-proveedores.test.ts -->
- [x] C9 (R-AJU-005): sin perfil elegido, las tarjetas dicen «sin perfil activo»
      <!-- test: npx vitest run tests/ajustes-proveedores.test.ts -->
- [x] C10 (R-AJU-005): si `GET /api/perfiles` falla, la pantalla sigue mostrando los proveedores
      <!-- test: npx vitest run tests/ajustes-proveedores.test.ts -->
- [x] C11 (R-AJU-005): las tarjetas siguen el orden: primero las del perfil activo, luego las demás con credencial, al final las sin configurar
      <!-- test: npx vitest run tests/ajustes-proveedores.test.ts -->
- [x] C12 (R-AJU-005): «Probar conexión» pinta en la tarjeta el resultado de la prueba del proveedor
      <!-- test: npx vitest run tests/ajustes-proveedores.test.ts -->
- [x] C13 (R-AJU-005): la acción de clave de un proveedor con API key abre el diálogo con el rótulo que corresponde a su estado
      <!-- test: npx vitest run tests/ajustes-proveedores.test.ts -->
- [x] C14 (R-AJU-005): un proveedor de suscripción no ofrece acción de clave
      <!-- test: npx vitest run tests/ajustes-proveedores.test.ts -->
- [x] C15 (R-AJU-005): «Borrar clave» sigue llamando a `DELETE /api/providers/:id/credential`
      <!-- test: npx vitest run tests/ajustes-proveedores.test.ts -->
- [x] C16 (R-AJU-005): guardar una clave en el diálogo pinta el resultado de su prueba en la tarjeta del proveedor
      <!-- test: npx vitest run tests/ajustes-proveedores.test.ts -->
- [x] C17 (R-MARCO-006): la rejilla de tarjetas pasa a una columna cuando el ancho no da para dos
      <!-- test: npx vitest run tests/ajustes-proveedores.test.ts -->
- [x] C18 (R-MARCO-006): a 390 px la pantalla de Proveedores no tiene desplazamiento horizontal de la página
      <!-- verify: manual -->
- [x] C19 (R-AJU-005): a 1440 px la pantalla se ve como `proveedores.png` en los dos modos del sistema
      <!-- verify: manual -->
- [x] C20 (R-AJU-005): las pruebas existentes de la interfaz, con las de la API de proveedores, siguen en verde sin editarse
      <!-- test: npx vitest run tests/interfaz-ejecutable.test.ts tests/menu-grupos.test.ts tests/tema-tokens.test.ts tests/mission-control.test.ts tests/estaticos-web.test.ts -->

## Puntos

```json
[]
```

## Implementación

- Modo: harness completo (FEATURE de la feature rediseno-mission-control). El plan lo aprobó la autorización POLITICA-POR-DEFECTO.
- Paso 1: `tests/ajustes-proveedores.test.ts` es nuevo, con 27 casos en tablas por regla. Se escribió antes de tocar `index.html` y se vio en rojo: 27 de 27 fallidas (EVIDENCE-001).
- Pasos 2 y 3: en `packages/server/web/index.html`, `vistaProveedores()` pide `GET /api/providers` y `GET /api/perfiles` en paralelo; si el segundo falla, queda `null` (D-004).
  - Ayudantes nuevos: `estadoDeProveedor` (D-005), `detalleDeEstado` (sustituye a `origen`, que solo usaba esta vista) y `usoDelProveedor` (D-001, D-006).
  - Pinta la cabecera del boceto, la leyenda de tres estados y una rejilla `.proveedores` con un `<article class="proveedor">` por proveedor, ordenados según D-004.
  - Cada tarjeta lleva el punto (lleno, anillo o gris), la marca de uso, la lista Estado / Id / Trabajos y las acciones «Probar conexión», «Configurar clave»/«Reemplazar clave» (solo API key, D-002) y «Borrar clave».
  - `guardar()` encuentra la caja de resultado en `salidasDeProveedor`, un mapa que llena la vista, en lugar de `document.querySelector`. Las llamadas al servidor no cambian.
  - Se quita la clase `principal` de «Configurar clave», para que coincida con el boceto.
- Paso 4: un bloque de estilos propio (`.cabecera-proveedores`, `.leyenda-proveedores`, `.proveedor*`, `.proveedores`), solo con tokens del tema. La rejilla usa `repeat(auto-fit, minmax(min(100%, 280px), 1fr))`.
- Paso 5: la regresión está en verde sin editar ninguna prueba (EVIDENCE-002).
  - La primera corrida de `tests/interfaz-ejecutable.test.ts` dio un rojo: la copia publicada `packages/cli/dist/web/index.html`, que no se versiona, estaba desactualizada.
  - Con `npm run build` (paso 6) volvió a verde sin tocar la prueba.
- Paso 6: capturas con Chrome sin pantalla por CDP (EVIDENCE-003). `--virtual-time-budget` no termina con la conexión SSE abierta de la app, así que se usó un script de captura por DevTools fuera del repositorio.
- Diferencias con el boceto `proveedores.png`, para mostrárselas al PO:
  - No está la tarjeta «Añadir proveedor» (D-003).
  - Se ven los once proveedores del catálogo, no los cuatro del boceto, con sus nombres reales: «Claude Code (suscripción)», «Ollama (local)»… (D-004).
  - Claude Code y Codex no tienen «Configurar clave» (D-002).
  - OpenRouter dice «6 del perfil activo» en vez de «6 compuertas y revisiones» (D-006).
  - Las tarjetas con clave en el archivo suman «Borrar clave», y donde aplica se ve el aviso «campo con el nombre anterior», como hoy.
- Tamaño real: unas 766 líneas, más que el previsto y que `delivery-budget: 600`. Son 364 de `index.html` (273 añadidas, 91 borradas; unas 160 de estilos) y 402 de pruebas. Sigue, con el motivo que declaró el plan: todo vive en `vistaProveedores()` y su bloque de estilos, y la mayor parte es la prueba.

## Pruebas

- Directorio: `/Users/juanandrade/Desktop/ValmenHarness/.claude/worktrees/ticket-ajustes-proveedores`, o la raíz del repositorio tras integrar.
- Requisitos de ambiente:
  - Node 24, con `npm install` hecho.
  - Para lo manual: `npm run build` y `node packages/cli/dist/main.js serve --port 4791`, en un navegador.
  - Datos reales del perfil: `.valmen/profiles.yaml` con `seleccion.proyecto: claude-code-completo`.
- Comandos y resultado esperado:
  1. `npx vitest run tests/ajustes-proveedores.test.ts` → 27 de 27 en verde (C1-C17).
  2. `npm run build` y luego `npx vitest run tests/interfaz-ejecutable.test.ts tests/menu-grupos.test.ts tests/tema-tokens.test.ts tests/mission-control.test.ts tests/estaticos-web.test.ts` → 157 de 157 en verde, sin editar ninguna (C20).
  3. `node scripts/verificar-interfaz.mjs` → «Interfaz verificada.» (exige `npm run build` antes).
- Validaciones manuales (en http://127.0.0.1:4791/#/proveedores):
  - A 1440 px, en modo oscuro y en claro, la pantalla se ve como `.valmen/features/rediseno-mission-control/assets/proveedores.png` (C19; `evidencia/proveedores-oscuro-1440.png`, `evidencia/proveedores-claro-1440.png`):
    - cabecera «De dónde salen los modelos» y leyenda de tres estados;
    - Claude Code con anillo, «lo usa el perfil» y «7 del perfil activo»;
    - OpenRouter con «6 del perfil activo»;
    - Codex con «0 · lo usa el perfil codex-completo».
  - En una ventana de 390 px, las tarjetas van en una columna y la página no se desplaza a lo ancho (C18; `evidencia/proveedores-oscuro-390.png`).
  - «Probar conexión» en OpenRouter pinta el resultado en su tarjeta.
  - «Reemplazar clave» abre el diálogo, y la clave guardada nunca se ve, solo su longitud.
- Resultado local: los comandos 1-3 pasaron (EVIDENCE-001, EVIDENCE-002). Las capturas se hicieron con Chrome sin pantalla (EVIDENCE-003). Probar y reemplazar una clave real quedan para el responsable.

## QA

```json
[]
```

## Evidencia

```json
[
  {
    "id": "EVIDENCE-001",
    "date": "2026-10-14",
    "kind": "automated-test",
    "description": "Prueba primero: npx vitest run tests/ajustes-proveedores.test.ts antes de tocar index.html → 27 fallidas de 27 (rojo). Tras implementar → 27 de 27 en verde (C1-C17).",
    "reference": null,
    "point_id": null
  },
  {
    "id": "EVIDENCE-002",
    "date": "2026-10-14",
    "kind": "automated-test",
    "description": "Regresión sin editar pruebas: npx vitest run tests/interfaz-ejecutable.test.ts tests/menu-grupos.test.ts tests/tema-tokens.test.ts tests/mission-control.test.ts tests/estaticos-web.test.ts → 157 de 157 (C20). La primera corrida dio 1 rojo en interfaz-ejecutable por la copia publicada desactualizada (packages/cli/dist/web, no versionada); tras npm run build, verde sin tocar la prueba. node scripts/verificar-interfaz.mjs → Interfaz verificada. revisar_presentacion → sin colores fijos.",
    "reference": null,
    "point_id": null
  },
  {
    "id": "EVIDENCE-003",
    "date": "2026-10-14",
    "kind": "manual-test",
    "description": "Chrome sin pantalla por CDP contra node packages/cli/dist/main.js serve: #/proveedores a 1440 px en oscuro y en claro comparado con proveedores.png (C19; evidencia/proveedores-oscuro-1440.png, evidencia/proveedores-claro-1440.png); a 390 px scrollWidth 390 igual a innerWidth, una columna sin desplazamiento horizontal (C18; evidencia/proveedores-oscuro-390.png).",
    "reference": null,
    "point_id": null
  }
]
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
    "date": "2026-10-14",
    "session_reference": null,
    "model": null,
    "reasoning_effort": null,
    "notes": "El subagente no expone los números de su sesión: análisis, plan e implementación en una sola sesión de este ticket con claude-opus-5-5.",
    "input_tokens": null,
    "output_tokens": null,
    "total_tokens": null,
    "estimated_cost_usd": null,
    "source": "manual:subagente de la corrida orquestada",
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
    "date": "2026-10-14",
    "at": "2026-10-14T05:09:27.937Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-14",
    "at": "2026-10-14T05:09:55.736Z",
    "action": "design-references-updated",
    "actor": "cli",
    "details": "Referencias de diseño actualizadas: .valmen/features/rediseno-mission-control/assets/proveedores.html, .valmen/features/rediseno-mission-control/assets/proveedores.png."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-14",
    "at": "2026-10-14T06:23:11.525Z",
    "action": "agent-decision",
    "actor": "cli",
    "details": "{\"id\":\"D-001\",\"pregunta\":\"¿De dónde sale cuántos trabajos del perfil activo dependen de un proveedor?\",\"eleccion\":\"Se calcula en el cliente con GET /api/perfiles: roles del perfil elegido (seleccion.proyecto) cuyo provider es el id del proveedor; sin cambio de API y sin contar overrides de routing.yaml\",\"alternativas\":[\"nueva ruta en el servidor\",\"contar la ruta efectiva de /api/routing con overrides\"],\"criterio\":\"El dato ya lo entrega el servidor y el requisito habla del perfil activo; es lo conservador y reversible, sin tocar la API\",\"fuente\":\"packages/server/src/server.ts:1678; packages/adapter/src/routing.ts:512\",\"reversion\":\"Revertir el commit de la vista; no hay datos ni API que deshacer\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-14",
    "at": "2026-10-14T06:23:11.917Z",
    "action": "agent-decision",
    "actor": "cli",
    "details": "{\"id\":\"D-002\",\"pregunta\":\"¿Se ofrece Configurar clave a Claude Code y Codex como en el boceto?\",\"eleccion\":\"No: Configurar o Reemplazar clave solo para auth api-key, como hoy; los de suscripción dicen de dónde sale su sesión\",\"alternativas\":[\"mostrar el botón a todos como el boceto\"],\"criterio\":\"El servidor no guarda clave para proveedores de suscripción; un botón que siempre falla parece error del usuario\",\"fuente\":\"packages/server/web/index.html:9130; packages/server/src/providers.ts:466\",\"reversion\":\"Mostrar el botón a todos en vistaProveedores\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-14",
    "at": "2026-10-14T06:23:12.293Z",
    "action": "agent-decision",
    "actor": "cli",
    "details": "{\"id\":\"D-003\",\"pregunta\":\"¿Se incluye la tarjeta Añadir proveedor del boceto?\",\"eleccion\":\"No: queda fuera; el catálogo de proveedores es fijo y no hay ruta para añadir uno\",\"alternativas\":[\"tarjeta sin acción\",\"tarjeta que abra un formulario nuevo con API nueva\"],\"criterio\":\"R-AJU-005 no la pide y no hay respaldo en el servidor; una acción sin efecto confunde\",\"fuente\":\"packages/server/src/providers.ts:430\",\"reversion\":\"Agregar la tarjeta cuando exista la ruta, en otro ticket\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-14",
    "at": "2026-10-14T06:23:12.754Z",
    "action": "agent-decision",
    "actor": "cli",
    "details": "{\"id\":\"D-004\",\"pregunta\":\"¿Qué proveedores y en qué orden se muestran, y qué pasa sin perfil elegido o si /api/perfiles falla?\",\"eleccion\":\"Todos los del catálogo: primero los que usa el perfil, luego configurados o detectados, al final sin configurar (orden del servidor dentro de cada grupo); sin perfil o con fallo se muestran igual con la marca sin perfil activo\",\"alternativas\":[\"solo los configurados\",\"orden del servidor sin agrupar\"],\"criterio\":\"R-AJU-005 exige distinguir sin configurar, así que tienen que verse; la pantalla no debe romperse por el perfil\",\"fuente\":\"packages/server/src/providers.ts:458; packages/server/web/index.html:9574\",\"reversion\":\"Cambiar el orden en vistaProveedores\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-14",
    "at": "2026-10-14T06:23:13.109Z",
    "action": "agent-decision",
    "actor": "cli",
    "details": "{\"id\":\"D-005\",\"pregunta\":\"¿Cómo se clasifica un proveedor local (Ollama) o con clave en variable de entorno en los tres estados?\",\"eleccion\":\"Configurado, con el detalle de origen (variable de entorno, archivo, local sin clave); Detectado solo cuando source es cli\",\"alternativas\":[\"un cuarto estado local\"],\"criterio\":\"El requisito fija tres estados; el detalle de origen se conserva en la línea Estado\",\"fuente\":\"packages/server/src/providers.ts:344\",\"reversion\":\"Agregar un cuarto estado en la leyenda y la tarjeta\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-10-14",
    "at": "2026-10-14T06:23:23.360Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-10-14",
    "at": "2026-10-14T06:25:04.240Z",
    "action": "agent-decision",
    "actor": "cli",
    "details": "{\"id\":\"D-006\",\"pregunta\":\"¿Cómo se escribe la línea Trabajos cuando el proveedor lo usa el perfil activo (el boceto dice «6 compuertas y revisiones» para OpenRouter)?\",\"eleccion\":\"Siempre «N del perfil activo», sin clasificar los roles en compuertas o fases\",\"alternativas\":[\"clasificar roles de evaluación en el cliente con una lista propia\",\"pedir la categoría al servidor\"],\"criterio\":\"/api/perfiles no trae la categoría del rol; una lista copiada en el cliente se desincroniza de ROLES; el número es lo que pide R-AJU-005\",\"fuente\":\"packages/server/src/server.ts:1685; packages/adapter/src/routing.ts:478\",\"reversion\":\"Cambiar el texto de la línea Trabajos en vistaProveedores\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-10-14",
    "at": "2026-10-14T06:25:58.568Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-10-14",
    "at": "2026-10-14T06:29:13.063Z",
    "action": "plan-approved",
    "actor": "cli",
    "details": "{\"actor\":\"autorización POLITICA-POR-DEFECTO\",\"source\":\"autorizacion\",\"quote\":\"si es necesario que un agente verifique y tome la decision de los analisis, review o planes para que yo no los tenga que tomar en cada punto esta bien y ya al final si hay decisiones tomadas por el agente antes de poder cerrar el ticket yo los apruebo\",\"planHash\":\"sha256:7e352413c1a047f17d2e10e3d14d2ffc5d61dbbe4660bb1146e4ce404bcbf38c\",\"authorizationId\":\"POLITICA-POR-DEFECTO\",\"authorizationHash\":\"sha256:c1bb46dd45f48a215d91a242f445eab06b4ac6f78aa546bf15d8b85902a01a0a\",\"stage\":\"plan\",\"receiptId\":\"GR-20261014-FEATURE-WEB-AJUSTES-PROVEEDORES-20261014-plan-1\",\"receiptStateHash\":\"sha256:7ff9bab2494a08dd7c19444d9ca0df781cff1c175dbc03091645e1937190655a\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-10-14",
    "at": "2026-10-14T06:29:13.477Z",
    "action": "plan-approval-verified",
    "actor": "cli",
    "details": "Aprobación del plan vigente: autorización POLITICA-POR-DEFECTO (fuente autorizacion, hash sha256:c1bb46dd45f48a215d91a242f445eab06b4ac6f78aa546bf15d8b85902a01a0a), plan sha256:7e352413c1a047f17d2e10e3d14d2ffc5d61dbbe4660bb1146e4ce404bcbf38c."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-10-14",
    "at": "2026-10-14T06:29:13.477Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-014",
    "date": "2026-10-14",
    "at": "2026-10-14T06:29:21.192Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-015",
    "date": "2026-10-14",
    "at": "2026-10-14T13:29:48.659Z",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-016",
    "date": "2026-10-14",
    "at": "2026-10-14T13:29:53.830Z",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-002."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-017",
    "date": "2026-10-14",
    "at": "2026-10-14T13:29:55.863Z",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-003."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-018",
    "date": "2026-10-14",
    "at": "2026-10-14T13:31:46.553Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-019",
    "date": "2026-10-14",
    "at": "2026-10-14T13:31:47.322Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-020",
    "date": "2026-10-14",
    "at": "2026-10-14T13:34:03.208Z",
    "action": "delivery-size",
    "actor": "cli",
    "details": "{\"añadidas\":699,\"borradas\":91,\"total\":790,\"tope\":600,\"pasaElTope\":true,\"via\":\"worktree\"}"
  }
]
```
