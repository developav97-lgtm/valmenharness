---
schema_version: 2
id: FEATURE-WEB-AJUSTES-CAMBIAR-PERFIL-20261014
title: Cambiar de perfil con vista previa de lo que cambia
type: FEATURE
module: WEB
workflow_status: closed
qa_status: approved
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

# FEATURE-WEB-AJUSTES-CAMBIAR-PERFIL-20261014

## Solicitud original

Parte del sprint: Ajustes rediseñados: Modelos con perfil activo y roles agrupados, cambio de perfil con vista previa, Proveedores y Proyecto por bloques.
- R-MARCO-006: Cada pantalla DEBERÍA funcionar en el celular
- R-AJU-004: Cambiar de perfil DEBE mostrar qué cambia antes de aplicarlo
Depende de: FEATURE-WEB-AJUSTES-MODELOS-20261014.
Viene de una feature descompuesta en sprints; su plan completo está en el tickets.yaml de la feature.

Comportamiento esperado: Cada pantalla DEBERÍA funcionar en el celular Cambiar de perfil DEBE mostrar qué cambia antes de aplicarlo
Comportamiento actual: la spec no lo declara; se establece en el análisis, leyendo el código.

### Fuera de alcance

Lo que el grafo asignó a otros tickets y este no hace:
- R-MARCO-006: lo cubre FEATURE-WEB-MENU-GRUPOS-20261014 (Menú por grupos con proyecto, perfil activo y Pedir un cambio)
- R-MARCO-006: lo cubre FEATURE-WEB-INICIO-DECISIONES-20261014 (Inicio con lo que espera una decisión de la persona)
- R-MARCO-006: lo cubre FEATURE-WEB-AJUSTES-MODELOS-20261014 (Vista Modelos con perfil activo, roles agrupados y aviso de cliente)
- R-MARCO-006: lo cubre FEATURE-WEB-AJUSTES-PROVEEDORES-20261014 (Proveedores con estado y uso por el perfil activo)
- R-MARCO-006: lo cubre FEATURE-WEB-AJUSTES-PROYECTO-20261014 (Proyecto con bloques e interruptores y YAML en Avanzado)
- R-MARCO-006: lo cubre FEATURE-WEB-TRABAJO-TICKETS-20261014 (Tickets y detalle con filtro por turno y ciclo de ocho pasos)
- R-MARCO-006: lo cubre FEATURE-WEB-TRABAJO-FEATURES-20261014 (Features con estado y tablero de recorrido y siguiente paso)
- R-MARCO-006: lo cubre FEATURE-WEB-TRABAJO-PORTAFOLIO-20261014 (Portafolio con una tarjeta por proyecto)
- R-MARCO-006: lo cubre FEATURE-WEB-VIVO-AGENTES-20261014 (Agentes con titular, pregunta pendiente y selector de mundo)
- R-MARCO-006: lo cubre FEATURE-WEB-VIVO-PROCESOS-20261014 (Procesos con las corridas detenidas primero)
- R-MARCO-006: lo cubre FEATURE-WEB-REGLAS-ESTANDARES-20261014 (Estándares separados en vigor, propuestos y descartados)

### Referencias de diseño

Adjuntos que citan los requisitos de este ticket. Se construye y se valida contra el original, no contra el texto de la spec:
- `.valmen/features/rediseno-mission-control/assets/modelos-cambiar-perfil.html` — Boceto aprobado por el PO el 2026-10-14: Cambiar de perfil con vista previa (HTML autónomo, el original) (sha256 5ada5d25b4a0…)
- `.valmen/features/rediseno-mission-control/assets/modelos-cambiar-perfil.png` — Captura a 1440 px del boceto aprobado: Cambiar de perfil con vista previa (sha256 833211798b43…)

### Supuestos y decisiones pendientes

<!-- Si el pedido nombra algo que el código no tiene —parámetro, permiso,
campo, bandera, columna, migración— y no lo especifica, listá cada elemento
con su pregunta antes de avanzar a análisis; el análisis no planifica sobre
la adivinanza. Si no hay ninguno, escribí «Ninguno» y seguí. -->
Ninguno.

## Descripción funcional

- Alcance: una pantalla nueva de Mission Control, `#/modelos/perfil` («Ajustes · Modelos › Cambiar de perfil»), fiel al boceto `assets/modelos-cambiar-perfil.html` (captura `modelos-cambiar-perfil.png`): una tarjeta por perfil con la activa marcada «activo» y la elegida «seleccionado», la tarjeta «Nuevo perfil a partir del seleccionado», y al elegir otro perfil, «Qué cambia con <id>» con la tabla Trabajo · Ahora → Después solo con los trabajos que cambian, la nota de los que no cambian, el aviso de las fases cambiadas en el proyecto que se conservan con «Que también siga al perfil», «Dónde se aplica» (todo el proyecto, recomendado; o solo con un cliente) y los botones «Aplicar <id>» y «Cancelar». Con el activo elegido, sin tabla ni botón: «Este ya es el perfil activo. Elige otro para ver qué cambiaría.». La acción «Cambiar de perfil» de Modelos pasa a abrir esta pantalla (reemplaza la D-002 de FEATURE-WEB-AJUSTES-MODELOS-20261014). Más la parte de R-MARCO-006 de esta pantalla: que funcione en el celular.
- Usuario o rol afectado: la persona que opera Mission Control (PO o desarrollador) y decide con qué modelos trabaja el agente en el proyecto.
- Comportamiento actual: no hay pantalla de cambio de perfil. «Cambiar de perfil» en Modelos abre «Avanzado» y lleva el foco al selector «Perfil del proyecto» (`packages/server/web/index.html:9223-9229`), que aplica el perfil al elegirlo (`:9100-9112` → `elegir`, `:8958-8975`, `PUT /api/perfiles/seleccion`) sin mostrar antes qué modelos cambian ni qué fases cambiadas en el proyecto lo anulan. `#/modelos/perfil` pinta Modelos porque `navegar()` solo mira el primer tramo de la ruta (`:10680-10681`, `:10720`).
- Comportamiento esperado: elegir un perfil no aplica nada; muestra antes qué trabajos cambian de modelo (el actual tachado, el nuevo al lado), cuáles no cambian, qué fases definidas en el proyecto se quedan como están, y dónde se aplicará. Solo «Aplicar <id>» escribe, con `PUT /api/perfiles/seleccion` (`{ perfil }` para todo el proyecto, `{ perfil, ejecutor }` para un cliente), y vuelve a Modelos con el perfil nuevo en la tarjeta y en la línea del menú.

## Diagnóstico

- Causa comprobada (con `ruta:línea`): es funcionalidad nueva; lo comprobado leyendo el código:
  - La ruta no existe: `navegar()` parte el hash en `nombre` y `parametro` (`packages/server/web/index.html:10680-10681`) y con `nombre === "modelos"` llama siempre a `vistaModelos()` (`:10720`); `marcarTitulo` pondría el sello «perfil» junto a «Modelos» (`:10501-10511`) y la entrada «Modelos» del menú queda marcada porque `data-vista` coincide con `nombre` (`:10697-10707`).
  - La acción de hoy: `pintarResumenDeModelos()` (`:9175`) crea «Cambiar de perfil» (`:9223`) que abre «Avanzado» y enfoca `perfiles.selectorDelProyecto` (`:9225-9229`, D-002 de FEATURE-WEB-AJUSTES-MODELOS-20261014, que ya anunciaba este reemplazo). El selector (`seccionPerfiles()`, `:8931`; `selectorDeEleccion`, `:9100-9112`) llama a `elegir(perfil, ejecutor)` (`:8958-8975`), que manda `PUT /api/perfiles/seleccion` con `{ perfil }` o `{ perfil, ejecutor }` y repinta Modelos. No hay vista previa.
  - El servidor ya da lo que la pantalla necesita, sin cambios: `GET /api/perfiles` devuelve `perfiles` (cada uno con `id`, `description`, `origen` y `roles` de los trece roles), `seleccion` (`proyecto` y `ejecutores`), `ejecutores` y `roles` (`packages/server/src/server.ts:1687-1711`); `PUT /api/perfiles/seleccion` valida y escribe con `elegirPerfil()` y responde `{ ok, errores, written }` (`server.ts:1780-1805`; `packages/server/src/routing.ts:459-496`): solo cambia `seleccion.proyecto` o la entrada del ejecutor y conserva el resto. `GET /api/routing` trae los trece roles resueltos con `source` (`proyecto` gana a `perfil`, que gana a `preset`) y el `text` de `routing.yaml` (`server.ts:1611-1622`). `GET /api/providers` da por proveedor `configured` y `source` (`cli` = la CLI ya tenía sesión → «detectado»; `environment` o `credentials-file` → «configurado»; `none` → «sin configurar») sin la clave (`packages/server/src/providers.ts:336-348`, `:452-520`).
  - Los perfiles incorporados reparten los siete trabajos de agente y coordinación (`agent-analysis`, `agent-plan`, `agent-implementation`, `agent-verification`, `orchestrator`, `architect`, `ui-specs`) en un proveedor y dejan los seis de evaluación como el preset `balanced` (`packages/adapter/src/routing.ts:488-494`, `:512-566`): entre `claude-code-completo` y `codex-completo` cambian exactamente las siete filas del escenario «Elegir Codex», con los mismos modelos y esfuerzos que el boceto, y las seis compuertas quedan en `openrouter` con el evaluador Jev (`DEFAULT_GATE_EVALUATOR`, `packages/adapter/src/routing.ts:46-49`) —la nota «siguen en Jev y OpenRouter»—.
  - Un perfil no tiene nombre legible aparte del id (`PerfilDeModelos`: `id`, `description`, `origen`, `roles`): el título «Claude Code completo» del boceto no es un dato.
  - En este proyecto la selección real es `claude-code-completo` para el proyecto y para claude (`.valmen/profiles.yaml`), y `.valmen/routing.yaml` define en el proyecto once roles (los cuatro `agent-*`, `architect`, `escalation`, `gate-judge`, `orchestrator`, `producer`, `reviewer`, `ui-specs`): con datos reales, cambiar de perfil no movería ninguno de los siete trabajos hasta que vuelvan al perfil, y el aviso de fases cambiadas tiene que poder listar varias, no una.
  - «Que también siga al perfil» es la misma operación que «Volver al perfil» de Modelos: `previsualizarVolver(rol, routing, zona)` (`index.html:9418-9472`) arma `POST /api/routing/preview` con los roles declarados menos ese, pinta las diferencias y solo «Confirmar» manda `PUT /api/routing`; al terminar llama a `vistaModelos()` fijo (`:9458`), así que desde la pantalla nueva repintaría Modelos bajo el hash `#/modelos/perfil`.
  - «Nuevo perfil a partir del seleccionado»: el editor existe como `abrirEditor(base, false)` (`:8976`), local a `seccionPerfiles()` y expuesto solo a Modelos (`:9124`), que lo usa en «Duplicar y editar» (`:9231-9237`).
  - El refresco en vivo repinta la vista entera con `navegar({ conservarVista: true })` (`:10361-10390`): sin guardar la elección fuera de la vista, cualquier escritura del agente devolvería la pantalla al perfil activo a mitad de la decisión.
- Hipótesis pendientes:
  - H1 — Qué es «Ahora»: el boceto compara el perfil activo con el elegido (`P[activo].r[i]` contra `P[sel].r[i]`) aunque «Implementación» esté cambiada en el proyecto, y el aviso dice que esa fase se queda. Lo conservador y fiel es comparar perfil contra perfil para el alcance elegido (todo el proyecto: `seleccion.proyecto`; un cliente: `seleccion.ejecutores[cliente] ?? seleccion.proyecto`) y, sin perfil vigente, tomar «Ahora» de los roles resueltos de `GET /api/routing`. Se decide en el plan con `valmen agent-decision`.
  - H2 — El título de la tarjeta: sin nombre legible en los datos, lo conservador es el id como título (como hizo Modelos) y en la línea mono el origen («incorporado» / «del proyecto») en lugar de repetir el id. Se decide en el plan.
  - H3 — «Solo cuando trabajo con un cliente» necesita saber qué cliente: el boceto no dibuja el selector; sin él no hay `ejecutor` que mandar. Lo conservador es un selector «Cliente» con `ejecutores` que aparece solo con esa opción marcada. Se decide en el plan.
  - H4 — «Nuevo perfil a partir del seleccionado»: lo conservador es reutilizar el editor que ya guarda y valida (`abrirEditor`) llevando a Modelos con «Avanzado» abierto y el editor de ese perfil, en vez de un segundo editor. Se decide en el plan.
  - H5 — «Que también siga al perfil»: reutilizar `previsualizarVolver` con las diferencias y la confirmación de siempre, haciendo que al terminar repinte la pantalla que la llamó. Se decide en el plan.
  - H6 — El proveedor de cada tarjeta: los proveedores distintos de los siete trabajos del perfil, cada uno con su estado de `GET /api/providers`. Se decide en el plan.
- Consumidores afectados:
  - `tests/vista-modelos-ajustes.test.ts` C4 («Cambiar de perfil» abre «Avanzado» con el foco en «Perfil del proyecto», `:166-178`) describe justo el comportamiento que este ticket reemplaza: se pondrá en rojo y solo puede cambiar si el plan aprobado lo declara.
  - `tests/perfiles-pantalla.test.ts` (selectores «Perfil del proyecto» y por ejecutor dentro de «Avanzado») y `tests/menu-grupos.test.ts` C7 (la línea del perfil lleva a `#/modelos`): no cambian y deben seguir en verde.
  - `tests/interfaz-ejecutable.test.ts` con `scripts/verificar-interfaz.mjs` (`VISTAS`, `:783-797`, con respuestas simuladas mínimas: `/api/perfiles` sin `roles` por perfil): la pantalla nueva no puede caerse con datos incompletos.
  - `tests/tema-tokens.test.ts` (ningún color a mano en `index.html`) y `tests/estaticos-web.test.ts` (la copia publicada `packages/cli/dist/web/index.html` coincide con la fuente; se regenera con `npm run build`).
  - La línea del perfil del menú (`marcarPerfilActivo()`, `:10580`): tras aplicar debe decir el perfil nuevo.
  - Otros tickets editan a la vez `index.html` (otra vista): el cambio se limita a una función nueva, su bloque de estilos, la rama de `navegar()` y los dos puntos de Modelos citados.
- Archivos y flujo investigados: `packages/server/web/index.html` (tokens `:77-151`; estilos de Modelos `:2749-2878`; `api()` `:3299`; `el()` `:3360`; `catalogoDeModelos()` `:8268`; `vistaModelos()` `:8503`; `seccionPerfiles()` `:8931-9125`; `NOMBRE_DE_CLIENTE`, `ESFUERZO_LEGIBLE` y los grupos de roles `:9129-9160`; `pintarResumenDeModelos()` `:9175-9276`; `grupoDelAgente()` `:9370`; `previsualizarVolver()` `:9418-9472`; refresco `:10361-10390`; `TITULOS` `:10482`; `marcarPerfilActivo()` `:10580`; `navegar()` `:10677-10735`); `packages/server/src/server.ts:1611-1622`, `:1687-1806`, `:2014-2019`; `packages/server/src/routing.ts:459-496`; `packages/server/src/providers.ts:336-520`; `packages/adapter/src/routing.ts:46-49`, `:488-566`, `:700-860`; `.valmen/profiles.yaml`, `.valmen/routing.yaml`; `tests/vista-modelos-ajustes.test.ts`, `tests/perfiles-pantalla.test.ts`, `tests/menu-grupos.test.ts`, `scripts/verificar-interfaz.mjs`; la spec `.valmen/features/rediseno-mission-control/spec/s2-ajustes/spec.md` (R-AJU-004) y el boceto con su captura. `buscar_memoria` («perfil seleccion cambiar perfil web modelos», «perfiles seleccion PUT») solo devolvió AP-003 (las compuertas de plan respetan el alcance del grafo: aquí, solo la parte de R-MARCO-006 de esta pantalla) y AP-012, que no tratan esta vista.
- Riesgos y compatibilidad:
  - Aplicar escribe `.valmen/profiles.yaml` y cambia el modelo de cada fase del agente para todo el proyecto: por eso nada se escribe al elegir una tarjeta, solo con «Aplicar <id>», y la tabla dice antes qué cambia.
  - Decir que una fase cambia cuando el proyecto la anula sería falso en el efecto: el aviso de fases cambiadas en el proyecto tiene que nombrar cada una (con datos reales, siete).
  - «Que también siga al perfil» escribe `.valmen/routing.yaml`: solo tras ver y confirmar las diferencias, como en Modelos.
  - Romper Modelos: tocar `previsualizarVolver` y «Cambiar de perfil» puede poner en rojo `tests/vista-modelos-ajustes.test.ts`; solo C4 cambia a propósito y se declara.
  - Celular: cuatro tarjetas y una tabla de cuatro columnas no caben en 390 px; necesitan su corte por debajo de 768 px sin desplazamiento horizontal.
  - Sin colores a mano: lila `--modelo`, cian `--acento`, ámbar `--persona`/`--alerta-suave`, verde `--ok`.
  - Conflicto de integración con el otro agente que edita `index.html`: sin mover ni reformatear código ajeno.
- Impactos de sync, migración, Docker o despliegue: ninguno. Cambia solo el cliente estático de Mission Control; usa `GET /api/perfiles`, `GET /api/routing`, `GET /api/providers`, `PUT /api/perfiles/seleccion` y el camino de `routing.yaml` que ya existen, sin cambios de servidor, API, esquema ni contenedores.

## Plan

- Gate de plan y aprobación: compuerta `plan` con el evaluador `cascade`; la aprobación sale de la política por defecto del PO (`valmen approve-by-authorization` si da APPROVE, `valmen review-agent --record` si da REVIEW) y la decide el orquestador o el PO, no el subagente que planifica.
- Alcance: una función nueva `vistaCambiarPerfil()` y sus ayudantes en `packages/server/web/index.html`, un bloque de estilos propio de la pantalla, la rama de `#/modelos/perfil` en `navegar()`, tres toques acotados a Modelos (el botón «Cambiar de perfil» de `pintarResumenDeModelos()`, un parámetro opcional `alTerminar` en `previsualizarVolver()` y la lectura de `valmen-nuevo-perfil-desde` en `vistaModelos()`), la entrada `["modelos-perfil", "#/modelos/perfil"]` en `VISTAS` de `scripts/verificar-interfaz.mjs`, la prueba nueva `tests/vista-cambiar-perfil.test.ts` y el cambio declarado de la prueba C4 de `tests/vista-modelos-ajustes.test.ts`. Exclusiones: el servidor y la API (no cambian), el menú lateral y la línea del perfil (otro ticket, ya en main), el resto de Modelos y cualquier otra vista: no se mueve ni se reformatea código ajeno, porque otro agente edita el mismo archivo.
- Decisiones registradas: D-001 («Ahora» = perfil vigente del alcance contra el elegido; sin perfil vigente, roles resueltos de `GET /api/routing`), D-002 (id como título y origen en la línea mono), D-003 (selector «Cliente» solo con «Solo cuando trabajo con un cliente»), D-004 («Nuevo perfil» lleva al editor de Modelos con `sessionStorage`), D-005 («Que también siga al perfil» reutiliza `previsualizarVolver` con diferencias y confirmación), D-006 (proveedores de los siete trabajos con su estado de `GET /api/providers`), D-007 (la elección sobrevive al refresco en vivo), D-008 (nota de lo que no cambia y una línea de aviso por fase definida en el proyecto), D-009 («Cambiar de perfil» de Modelos lleva a `#/modelos/perfil` y la prueba C4 de Modelos cambia a propósito).
- Diferencias con el boceto (fiel en todo lo demás: migas, título, rejilla de tarjetas con «activo»/«seleccionado», tarjeta «Nuevo perfil», tabla Trabajo · Ahora → Después con el actual tachado, nota, aviso ámbar, «Dónde se aplica» con «recomendado», «Aplicar <id>» y «Cancelar», y el mensaje del activo):
  - Título de la tarjeta: el id, no «Claude Code completo», y en la línea mono el origen en vez del id repetido (D-002: el perfil no tiene nombre legible).
  - Descripciones y modelos reales: «…; los evaluadores siguen en Jev.» y `claude-haiku-4-5-20251001` donde el boceto abrevia.
  - Al abrir, la seleccionada es la activa y se ve «Este ya es el perfil activo…» (escenario «Elegir el activo»); el boceto abre con `codex-completo` seleccionado como demostración.
  - Aviso de fases cambiadas: una línea por cada fase definida en el proyecto entre las que cambian (con datos reales, siete), no una sola (D-008).
  - «Que también siga al perfil» despliega las diferencias de `routing.yaml` con «Confirmar» y «Cancelar» antes de escribir; el boceto no dibuja ese paso (D-005).
  - Selector «Cliente» bajo «Solo cuando trabajo con un cliente», que el boceto no dibuja (D-003).
  - «Nuevo perfil a partir del seleccionado» abre el editor en Modelos › Avanzado, no en esta pantalla (D-004).
  - El punto del proveedor es ámbar si está «sin configurar»; el boceto solo dibuja el verde (D-006).
  - Un rechazo del servidor al aplicar se muestra en línea bajo los botones; el boceto no tiene estado de error.
  - Sin perfil vigente ninguna tarjeta lleva «activo» y «Ahora» sale del modelo resuelto (D-001).
- Respuesta al diagnóstico (cada hallazgo y el paso que lo resuelve):
  - Ruta inexistente (`index.html:10680-10681`, `:10720`): paso 2 (C1).
  - Sin vista previa al cambiar (`:8958-8975`): pasos 3-6 (C2-C16).
  - «Cambiar de perfil» provisional (`:9223-9229`): paso 7 (C17).
  - `previsualizarVolver` fijo a `vistaModelos()` (`:9458`): paso 7 (C11).
  - `abrirEditor` local a `seccionPerfiles()` (`:8976`, `:9124`): paso 7 (C4).
  - Refresco en vivo (`:10361-10390`): paso 3, D-007; se comprueba en el navegador en el paso 11.
  - Perfil sin nombre (H2), cliente sin selector (H3), «Ahora» (H1), proveedor (H6): D-002, D-003, D-001, D-006 en los pasos 4-6.
  - Celular: paso 8 (C18, C19). Consumidores: pasos 9-10, con las pruebas existentes en verde como regresión.
- Pasos ordenados:
  1. Escribir `tests/vista-cambiar-perfil.test.ts` y verlo en rojo con `npx vitest run tests/vista-cambiar-perfil.test.ts` antes de tocar `index.html`; y cambiar en `tests/vista-modelos-ajustes.test.ts` solo la prueba C4 (`:166-178`) para que diga «“Cambiar de perfil” lleva a `#/modelos/perfil`» (D-009, cambio de comportamiento declarado) y verla en rojo. La prueba nueva ejecuta `#/modelos/perfil` con `ejecutarInterfaz` de `scripts/verificar-interfaz.mjs` y respuestas simuladas con la forma real de `/api/perfiles` (`PERFILES_INCORPORADOS`, `seleccion: { proyecto: "claude-code-completo", ejecutores: { claude: "claude-code-completo" } }`, y un perfil del proyecto para C8), `/api/routing` (trece roles con `source`, `agent-implementation` en `proyecto`), `/api/providers` (`claude-code` y `codex` con `source: "cli"`, `opencode-go` con `credentials-file`, `openrouter` con nombre «OpenRouter»), `/api/routing/preview` y `PUT /api/perfiles/seleccion`, y registra las llamadas; dispara clics y `change` (C1-C17); y lee el HTML como texto para el corte por debajo de 768 px (C18).
  2. `index.html`, `navegar()` (`:10720`): `nombre === "modelos" && parametro === "perfil"` llama a `vistaCambiarPerfil()`; el resto de `modelos` sigue en `vistaModelos()`. La entrada «Modelos» del menú queda marcada como hoy (C1).
  3. `index.html`, función nueva `vistaCambiarPerfil()` tras el bloque de Modelos: pide en paralelo `GET /api/perfiles`, `GET /api/routing` y `GET /api/providers` (cada uno con `try/catch` y valores por defecto: la pantalla no se cae con `{}`); pinta la miga `<nav aria-label="Ruta">` con el enlace «Ajustes · Modelos» a `#/modelos` y «› Cambiar de perfil», y el `h1` «Elige un perfil y mira qué cambia antes de aplicarlo». La elección (`perfil`, `alcance`, `cliente`) vive en la variable de módulo `eleccionDeCambioDePerfil` y se recupera al repintar si el perfil sigue existiendo; empieza en el perfil vigente (D-007) (C1).
  4. `index.html`, ayudante `tarjetasDePerfil(...)`: una rejilla `.rejilla-perfiles` con un `<button class="tarjeta-perfil" aria-pressed>` por perfil (título = id, línea mono = «incorporado»/«del proyecto», descripción, y abajo una línea por proveedor de los siete trabajos «<id> · detectado|configurado|sin configurar» con su punto, D-002, D-006); marca «activo» (lila) en `seleccion.proyecto` y «seleccionado» (cian) en la elegida si no es la activa; clic = elegir y repintar, sin escribir nada; al final la tarjeta punteada «Nuevo perfil» / «a partir del seleccionado», que guarda el id elegido en `sessionStorage` (`valmen-nuevo-perfil-desde`, con `try/catch`) y pone `location.hash = "#/modelos"` (D-004) (C2, C3, C4, C6).
  5. `index.html`, ayudante `filasQueCambian(antes, despues)` y la sección «Qué cambia con <id>»: con el elegido igual al vigente del alcance, solo el recuadro «Este ya es el perfil activo. Elige otro para ver qué cambiaría.» (C5). Si no, `<table class="tabla-cambio">` con cabecera Trabajo · Ahora · (flecha, `aria-label="pasa a"`) · Después y una fila por trabajo que cambia en el orden Análisis, Plan, Implementación, Verificación, Orquestador, Arquitecto, Especificación de UI y después los roles de evaluación que cambien, cada celda «<modelo> · <esfuerzo legible>», «Ahora» tachado (D-001) (C7, C8); bajo la tabla la nota «Las N compuertas y revisiones no cambian: siguen en <Jev y> <proveedores>.» con los nombres de `GET /api/providers` sin el paréntesis, «Jev» si el evaluador es Jev, y «Tampoco cambia: <trabajos>.» si alguno de los siete no cambia (D-008) (C9); y una línea ámbar por cada trabajo de la tabla con `source === "proyecto"` en `GET /api/routing`: «<Trabajo> está cambiada en este proyecto y se queda como está.» con el botón-enlace «Que también siga al perfil», que llama a `previsualizarVolver(rol, routing, zona, vistaCambiarPerfil)` (D-005, D-008) (C10, C11).
  6. `index.html`, «Dónde se aplica»: `<fieldset>` con `<legend>` y dos `<label class="opcion-alcance">` con `input type="radio"`: «Todo el proyecto» (marcado, con «recomendado») / «Cualquier cliente con el que trabajes usa este perfil.» y «Solo cuando trabajo con un cliente» / «El proyecto sigue con su perfil; este se usa solo con el cliente elegido.»; con la segunda marcada aparece la etiqueta «Cliente» con un `<select>` de `ejecutores` (nombres de `NOMBRE_DE_CLIENTE`, `claude` por defecto) y «Ahora» se recalcula con el perfil de ese cliente (D-001, D-003). Después «Aplicar <id>» (`btn` lila) y «Cancelar» (enlace a `#/modelos`, que olvida la elección). «Aplicar» manda `PUT /api/perfiles/seleccion` con `{ perfil }` o `{ perfil, ejecutor }`; con `written` olvida la elección, llama a `marcarPerfilActivo()` y pone `location.hash = "#/modelos"`; con `errores` los muestra en `.resultado.error` bajo los botones sin salir (C12-C16).
  7. `index.html`, Modelos: en `pintarResumenDeModelos()` el clic de «Cambiar de perfil» pasa a `location.hash = "#/modelos/perfil"` (D-009) (C17); `previsualizarVolver(rol, routing, zona, alTerminar = vistaModelos)` llama a `alTerminar()` donde hoy llama a `vistaModelos()` (`:9458`), sin otro cambio (C11); y en `vistaModelos()`, después de `seccionPerfiles()`, si `sessionStorage` trae `valmen-nuevo-perfil-desde` con un perfil existente, se borra, se abre «Avanzado» y se llama a `abrirEditor(perfil, false)` (D-004) (C4).
  8. `index.html`, estilos de la pantalla con tokens (`--modelo`, `--modelo-suave`, `--acento`, `--persona`, `--alerta-suave`, `--ok`, `--panel`, `--panel-alto`, `--borde`, `--tenue`, `--tenue-deco`, `--mono`, `--fuente-titulo`, `--sobre-acento`), sin colores a mano: rejilla `repeat(auto-fit, minmax(230px, 1fr))`, tarjetas con borde lila de 2 px la seleccionada, tabla en panel con radios de 14 px, aviso ámbar, opciones de alcance. Dentro de `@media (max-width: 767px)` un bloque propio: `.rejilla-perfiles` en `1fr`, filas de `.tabla-cambio` apiladas con la cabecera oculta, título a 26 px y botones a todo el ancho (C18, C19).
  9. `scripts/verificar-interfaz.mjs`: añadir `["modelos-perfil", "#/modelos/perfil"]` a `VISTAS` para que `interfaz-ejecutable` ejecute la pantalla con datos mínimos; `npm run build` para que `packages/cli/dist/web/index.html` coincida con la fuente.
  10. Regresión: `npx vitest run tests/vista-cambiar-perfil.test.ts tests/vista-modelos-ajustes.test.ts tests/perfiles-pantalla.test.ts tests/menu-grupos.test.ts tests/tema-tokens.test.ts tests/interfaz-ejecutable.test.ts tests/vista-marco-responsivo.test.ts tests/estaticos-web.test.ts`; si una prueba existente distinta de C4 de Modelos se pone en rojo no se edita: se detiene y se reporta en el ticket (C17).
  11. Verificación en el navegador con `node packages/cli/dist/main.js serve` desde el worktree, `#/modelos/perfil`: a 1440 px en modo oscuro contra `modelos-cambiar-perfil.png` y `modelos-cambiar-perfil.html` (estructura, jerarquía, colores por quién decide y textos fijos) y en modo claro (C20); a 390 px sin desplazamiento horizontal en los dos modos (C19); comprobando que un refresco en vivo conserva el perfil elegido (D-007), y eligiendo `codex-completo` sin pulsar «Aplicar» ni «Confirmar» sobre los archivos reales. Capturas como evidencia del ticket.
- Impactos declarados: ninguno (sin sincronización, migración ni contenedores; `sync_impact`, `migration_impact` y `docker_impact` en `false`).
- Tamaño previsto: unas 680 líneas (unas 360 de producción —unas 280 de JavaScript, 70 de estilos y 10 de Modelos y `verificar-interfaz.mjs`— y unas 320 de pruebas); 20 criterios.
- Si excede el tope: sigue: la pantalla es un solo flujo (elegir → ver qué cambia → dónde → aplicar) sobre los mismos tres datos, y no hay un corte que deje a cada parte con su código y sus pruebas: la tabla sin «Aplicar» no cumple R-AJU-004 y «Aplicar» sin tabla es lo que hoy ya existe. Pasa de `delivery-budget: 600` por unas 80 líneas.
- Rollback (obligatorio): revertir el commit del ticket en su rama; no hay datos, esquema, configuración ni API que deshacer. «Cambiar de perfil» vuelve a abrir «Avanzado» (D-002 de Modelos) y la clave `valmen-nuevo-perfil-desde` de `sessionStorage` queda sin uso.

<!-- Los criterios de la sección siguiente se numeran C1…Cn, con una afirmación verificable por criterio
     —una frase con «y» son dos criterios—, y cada uno lleva debajo su anotación de
     verificación: un comentario HTML que dice «test:» y el comando, o «verify: manual». La
     sección no lleva comentarios dentro: un comentario con anotación se leería como la de un
     criterio. Ejemplo en la skill planificacion. -->
## Criterios de aceptación

- [x] C1 (R-AJU-004): `#/modelos/perfil` pinta el título «Elige un perfil y mira qué cambia antes de aplicarlo» bajo la miga «Ajustes · Modelos › Cambiar de perfil», que enlaza a `#/modelos`
      <!-- test: npx vitest run tests/vista-cambiar-perfil.test.ts -->
- [x] C2 (R-AJU-004): la pantalla tiene una tarjeta por perfil de `GET /api/perfiles` con su id, su origen, su descripción, el proveedor de sus trabajos con su estado («codex · detectado»)
      <!-- test: npx vitest run tests/vista-cambiar-perfil.test.ts -->
- [x] C3 (R-AJU-004): la tarjeta del perfil elegido para el proyecto lleva la marca «activo»
      <!-- test: npx vitest run tests/vista-cambiar-perfil.test.ts -->
- [x] C4 (R-AJU-004): la última tarjeta, «Nuevo perfil» «a partir del seleccionado», abre en Modelos el editor «Nuevo perfil a partir de <seleccionado>»
      <!-- test: npx vitest run tests/vista-cambiar-perfil.test.ts -->
- [x] C5 (R-AJU-004): con el perfil activo seleccionado, en lugar de la tabla la pantalla dice «Este ya es el perfil activo. Elige otro para ver qué cambiaría.»
      <!-- test: npx vitest run tests/vista-cambiar-perfil.test.ts -->
- [x] C6 (R-AJU-004): elegir `codex-completo` marca su tarjeta «seleccionado» sin mandar ninguna escritura a la API
      <!-- test: npx vitest run tests/vista-cambiar-perfil.test.ts -->
- [x] C7 (R-AJU-004): con `codex-completo` elegido, la tabla «Qué cambia con codex-completo» lista las siete filas de `agent-analysis`, `agent-plan`, `agent-implementation`, `agent-verification`, `orchestrator`, `architect`, `ui-specs` con el modelo actual tachado junto al nuevo
      <!-- test: npx vitest run tests/vista-cambiar-perfil.test.ts -->
- [x] C8 (R-AJU-004): la tabla omite un trabajo que tiene la misma ruta en los dos perfiles
      <!-- test: npx vitest run tests/vista-cambiar-perfil.test.ts -->
- [x] C9 (R-AJU-004): bajo la tabla, la nota dice «Las 6 compuertas y revisiones no cambian: siguen en Jev y OpenRouter.»
      <!-- test: npx vitest run tests/vista-cambiar-perfil.test.ts -->
- [x] C10 (R-AJU-004): una fase de la tabla definida en el proyecto aparece en el aviso «Implementación está cambiada en este proyecto y se queda como está.» con su acción «Que también siga al perfil»
      <!-- test: npx vitest run tests/vista-cambiar-perfil.test.ts -->
- [x] C11 (R-AJU-004): «Que también siga al perfil» manda `PUT /api/routing` solo tras «Confirmar» las diferencias de `.valmen/routing.yaml` que muestra antes
      <!-- test: npx vitest run tests/vista-cambiar-perfil.test.ts -->
- [x] C12 (R-AJU-004): «Dónde se aplica» abre con «Todo el proyecto» marcado como «recomendado»
      <!-- test: npx vitest run tests/vista-cambiar-perfil.test.ts -->
- [x] C13 (R-AJU-004): «Aplicar codex-completo» con «Todo el proyecto» manda `PUT /api/perfiles/seleccion` con `{ "perfil": "codex-completo" }`
      <!-- test: npx vitest run tests/vista-cambiar-perfil.test.ts -->
- [x] C14 (R-AJU-004): con «Solo cuando trabajo con un cliente» marcado, «Aplicar» manda `PUT /api/perfiles/seleccion` con el `ejecutor` del selector «Cliente»
      <!-- test: npx vitest run tests/vista-cambiar-perfil.test.ts -->
- [x] C15 (R-AJU-004): tras aplicar con éxito, la pantalla vuelve a `#/modelos`
      <!-- test: npx vitest run tests/vista-cambiar-perfil.test.ts -->
- [x] C16 (R-AJU-004): si el servidor rechaza la elección, sus errores se muestran sin salir de la pantalla
      <!-- test: npx vitest run tests/vista-cambiar-perfil.test.ts -->
- [x] C17 (R-AJU-004): «Cambiar de perfil» en Modelos lleva a `#/modelos/perfil`
      <!-- test: npx vitest run tests/vista-modelos-ajustes.test.ts -->
- [x] C18 (R-MARCO-006): por debajo de 768 px las tarjetas de perfil pasan a una sola columna
      <!-- test: npx vitest run tests/vista-cambiar-perfil.test.ts -->
- [x] C19 (R-MARCO-006): a 390 px la pantalla no tiene desplazamiento horizontal en modo oscuro ni en claro
      <!-- verify: manual -->
- [x] C20 (R-AJU-004): a 1440 px la pantalla coincide con `modelos-cambiar-perfil.png` en estructura, jerarquía, colores por quién decide, textos fijos, en los dos modos
      <!-- verify: manual -->

## Puntos

```json
[
  {
    "id": "POINT-001",
    "title": "Verificación delegada de FEATURE-WEB-AJUSTES-CAMBIAR-PERFIL-20261014",
    "status": "closed",
    "severity": "normal",
    "actual": "La implementación está entregada y falta verificar sus criterios.",
    "expected": "Los criterios del ticket se cumplen y sus pruebas dan el resultado esperado.",
    "evidence": [
      "EVIDENCE-006"
    ],
    "affected_files": [
      "packages/server/web/index.html",
      "scripts/verificar-interfaz.mjs",
      "tests/vista-cambiar-perfil.test.ts",
      "tests/vista-modelos-ajustes.test.ts"
    ],
    "diagnosis": null,
    "solution": null,
    "tests": [],
    "qa_cycles": [
      "QA-001"
    ],
    "terminal_reason": null,
    "related_ticket": null
  }
]
```

## Implementación

Hecho según el plan aprobado, paso a paso, en la rama `valmen/ticket-ajustes-cambiar-perfil`:

- Pasos 1-2: `tests/vista-cambiar-perfil.test.ts` (nueva, 9 pruebas) escrita antes del código y vista en rojo (9 de 9 en rojo). La C4 de `tests/vista-modelos-ajustes.test.ts` cambió a propósito, como declara el plan (D-009): antes comprobaba que «Cambiar de perfil» abría «Avanzado» con el foco en «Perfil del proyecto» (el atajo provisional D-002 de FEATURE-WEB-AJUSTES-MODELOS-20261014, «hasta que exista `#/modelos/perfil`»); ahora comprueba que lleva a `#/modelos/perfil` y que «Avanzado» sigue plegado. Se vio en rojo antes de implementar. Ninguna otra prueba existente se tocó.
- Paso 2: `navegar()` manda `#/modelos/perfil` a `vistaCambiarPerfil(opciones.conservarVista === true)` (`packages/server/web/index.html:11169-11170`); el resto de `#/modelos` sigue en `vistaModelos()`.
- Pasos 3-6: `vistaCambiarPerfil()` y sus ayudantes (`index.html:9606-9952`): `TRABAJOS_DE_PERFIL`, `estadoDeProveedor`, `abrirNuevoPerfilPedido`, y dentro de la vista `tarjetaDe` (tarjetas, paso 4), `seccionDelCambio` (tabla, nota y avisos, paso 5), `seccionDelAlcance` y `accionesDe` (paso 6). Los nombres de los ayudantes cambiaron respecto del plan (`tarjetasDePerfil` → `tarjetaDe`, `filasQueCambian` → `seccionDelCambio`); el comportamiento es el planificado. La elección vive en `eleccionDeCambioDePerfil` y se conserva en el refresco en vivo (`conservarVista`); al navegar de verdad, aplicar o cancelar se olvida (D-007).
- Paso 7: Modelos: «Cambiar de perfil» pone `location.hash = "#/modelos/perfil"` (`index.html:9327-9331`); `previsualizarVolver(rol, routing, zona, alTerminar = vistaModelos)` (`:9520`); `vistaModelos()` llama a `abrirNuevoPerfilPedido(cont, accionesDePerfil)` (`:8643`).
- Paso 8: estilos con tokens en un bloque propio (`index.html:2879-2979`), con su `@media (max-width: 767px)`. Hubo que anular dos estilos globales que el boceto no tiene: `th` es `position: sticky; top: 51px`, que dentro del contenedor con scroll tapaba la primera fila, y `label` lleva 12 px en tono tenue.
- Paso 9: `["modelos-perfil", "#/modelos/perfil"]` en `VISTAS` de `scripts/verificar-interfaz.mjs`; `npm run build` regenera `packages/cli/dist/web/index.html`.
- Tamaño real: unas 750 líneas (`git diff --stat`: 461 en `index.html`, 1 en `verificar-interfaz.mjs`, unas 285 de pruebas), frente a las 680 previstas; supera `delivery-budget: 600` con la decisión «sigue» del plan.

Diferencias con el boceto `modelos-cambiar-perfil.html`/`.png`. Lo demás se respeta: migas, título, rejilla de tarjetas con «activo»/«seleccionado», «Nuevo perfil», tabla Trabajo · Ahora → Después con el actual tachado, nota de compuertas, aviso ámbar, «Dónde se aplica» con «recomendado», «Aplicar <id>» lila y «Cancelar».

- Título de la tarjeta = id (`claude-code-completo`), no «Claude Code completo»; la línea mono dice el origen (D-002: el perfil no tiene nombre legible).
- Descripciones y modelos reales: «…; los evaluadores siguen en Jev.» y `claude-haiku-4-5-20251001`.
- Al abrir, la seleccionada es la activa y se ve «Este ya es el perfil activo…» (escenario «Elegir el activo»); el boceto abre con `codex-completo` como demostración.
- Con los datos reales, `.valmen/routing.yaml` define en el proyecto los siete trabajos: hay siete avisos ámbar, uno por fase, no uno (D-008). El género sigue al trabajo («Análisis está cambiado», «Implementación está cambiada»).
- «Que también siga al perfil» despliega las diferencias de `routing.yaml` con «Confirmar» y «Cancelar» antes de escribir (D-005).
- Selector «Cliente» bajo «Solo cuando trabajo con un cliente» (D-003).
- «Nuevo perfil» abre el editor en Modelos › Avanzado (D-004).
- El punto del proveedor es ámbar si está «sin configurar» (D-006).
- Un rechazo del servidor al aplicar se muestra en línea bajo los botones.
- Sin perfil vigente, ninguna tarjeta lleva «activo» y «Ahora» sale del modelo resuelto (D-001).
- Lo que no es de esta pantalla: la barra superior del armazón dice «Modelos» con el sello «perfil» (`marcarTitulo`), y el menú lateral es el de main.

## Pruebas

Contrato de pruebas para el responsable.

- Directorio: `/Users/juanandrade/Desktop/ValmenHarness/.claude/worktrees/ticket-ajustes-cambiar-perfil` (o la raíz del repositorio tras integrar).
- Entorno: Node 24 con las dependencias del monorepo instaladas (`npm install`); `npm run build` antes de servir. No hace falta red: las pruebas simulan la API.
- Pruebas del ticket: `npx vitest run tests/vista-cambiar-perfil.test.ts tests/vista-modelos-ajustes.test.ts` → 19 de 19 en verde (C1-C18).
- Regresión de la interfaz: `npx vitest run tests/vista-cambiar-perfil.test.ts tests/vista-modelos-ajustes.test.ts tests/perfiles-pantalla.test.ts tests/menu-grupos.test.ts tests/tema-tokens.test.ts tests/interfaz-ejecutable.test.ts tests/vista-marco-responsivo.test.ts tests/estaticos-web.test.ts` → 8 archivos, 154 de 154 en verde; `node scripts/verificar-interfaz.mjs` → «Interfaz verificada.» (14 vistas, incluida `#/modelos/perfil`).
- Revisión estática: `node packages/cli/dist/main.js estandar revisar` → sin colores fijos; `node packages/cli/dist/main.js secrets` → sin secretos.
- Validación manual (C19, C20), sin aplicar sobre el proyecto real:
  1. `node packages/cli/dist/main.js serve --port 4893` y abrir `http://127.0.0.1:4893/#/modelos`; pulsar «Cambiar de perfil» → abre «Elige un perfil y mira qué cambia antes de aplicarlo».
  2. Al abrir, `claude-code-completo` lleva «ACTIVO» y se ve «Este ya es el perfil activo…». Pulsar `codex-completo` → «SELECCIONADO» con borde lila, tabla de siete filas (actual tachado → nuevo), nota «Las 6 compuertas y revisiones no cambian: siguen en Jev y OpenRouter.», un aviso ámbar por fase definida en el proyecto y «Aplicar codex-completo».
  3. «Que también siga al perfil» en un aviso → diferencias de `.valmen/routing.yaml` con «Confirmar»; pulsar «Cancelar» (no «Confirmar») para no tocar el archivo.
  4. Marcar «Solo cuando trabajo con un cliente» → aparece «Cliente». No pulsar «Aplicar» salvo en una copia de prueba; ahí manda `PUT /api/perfiles/seleccion` y vuelve a Modelos con el perfil nuevo en la tarjeta y en la línea del menú.
  5. A 1440 px, en oscuro y en claro, comparar con `.valmen/features/rediseno-mission-control/assets/modelos-cambiar-perfil.png` con las diferencias listadas en «Implementación»; a 390 px no debe haber desplazamiento horizontal.
- Resultado local: hecho con Chrome sin pantalla por CDP sobre los datos reales del worktree (evidencia en `evidencia/`); `shasum` de `.valmen/routing.yaml` y `.valmen/profiles.yaml` igual antes y después.

- Resultado del PO: ya he estado verificando y yo veo casi todo bien; podrias correr las ratificaciones y cerrar. Las pruebas del ticket las ejecutó el agente y dieron el resultado esperado: npx vitest run: 5481 pruebas en verde; node scripts/verificar-interfaz.mjs: Interfaz verificada; tests/vista-cambiar-perfil.test.ts; tests/ancho-vistas.test.ts: la vista llena el ancho a 2000 px

## QA

```json
[
  {
    "id": "QA-001",
    "date": "2026-10-14",
    "build_reference": "commit:bf9cb463ca84842f5d8c287a7216f6e67b4db693",
    "environment": "local: Mission Control con valmen serve, Chrome, modo oscuro y claro",
    "result": "pending",
    "findings": [],
    "correction": null,
    "po_confirmation": null
  },
  {
    "id": "QA-002",
    "date": "2026-10-14",
    "build_reference": null,
    "environment": null,
    "result": "approved",
    "findings": [],
    "correction": null,
    "po_confirmation": "ya he estado verificando y yo veo casi todo bien; podrias correr las ratificaciones y cerrar"
  }
]
```

## Evidencia

```json
[
  {
    "id": "EVIDENCE-001",
    "date": "2026-10-14",
    "kind": "ux-review",
    "description": "Revisión de UX de 1 archivo(s) de interfaz (packages/server/web/index.html); 0 color(es) fijo(s). Skills: ui-ux-pro-max no declarada (el proyecto no la declara en external-skills); impeccable no declarada (el proyecto no la declara en external-skills). Sin informe de Impeccable.",
    "reference": null,
    "point_id": null
  },
  {
    "id": "EVIDENCE-002",
    "date": "2026-10-14",
    "kind": "test-run",
    "description": "Prueba primero: tests/vista-cambiar-perfil.test.ts 9 de 9 en rojo y la C4 cambiada de tests/vista-modelos-ajustes.test.ts en rojo antes de implementar; después npx vitest run tests/vista-cambiar-perfil.test.ts tests/vista-modelos-ajustes.test.ts → 19 de 19 en verde.",
    "reference": null,
    "point_id": null
  },
  {
    "id": "EVIDENCE-003",
    "date": "2026-10-14",
    "kind": "test-run",
    "description": "Regresión sin editar pruebas existentes (salvo la C4 declarada, D-009): npx vitest run tests/vista-cambiar-perfil.test.ts tests/vista-modelos-ajustes.test.ts tests/perfiles-pantalla.test.ts tests/menu-grupos.test.ts tests/tema-tokens.test.ts tests/interfaz-ejecutable.test.ts tests/vista-marco-responsivo.test.ts tests/estaticos-web.test.ts → 154 de 154; node scripts/verificar-interfaz.mjs → Interfaz verificada (14 vistas); estandar revisar sin colores fijos; secrets sin hallazgos.",
    "reference": null,
    "point_id": null
  },
  {
    "id": "EVIDENCE-004",
    "date": "2026-10-14",
    "kind": "manual-test",
    "description": "Chrome sin pantalla por CDP con datos reales del worktree (valmen serve --port 4893), a 1440 px: al abrir, claude-code-completo ACTIVO y «Este ya es el perfil activo…» (evidencia/cambiar-perfil-1440-oscuro-inicial.png); eligiendo codex-completo, en oscuro y claro (evidencia/cambiar-perfil-1440-oscuro-codex.png, evidencia/cambiar-perfil-1440-claro-codex.png): tabla de siete filas con el actual tachado, nota «Las 6 compuertas y revisiones no cambian: siguen en Jev y OpenRouter.», siete avisos ámbar (routing.yaml define las siete fases), «Dónde se aplica» y «Aplicar codex-completo»; comparado con modelos-cambiar-perfil.png: misma estructura, jerarquía, lila/cian/ámbar y textos fijos, con las diferencias listadas en Implementación.",
    "reference": null,
    "point_id": null
  },
  {
    "id": "EVIDENCE-005",
    "date": "2026-10-14",
    "kind": "manual-test",
    "description": "Chrome sin pantalla por CDP a 390 px en oscuro y claro (evidencia/cambiar-perfil-390-oscuro-codex.png, evidencia/cambiar-perfil-390-claro-codex.png): scrollWidth 390 = innerWidth, sin desplazamiento horizontal; tarjetas en una columna y filas de la tabla apiladas. En el navegador, «Que también siga al perfil» mostró las diferencias de .valmen/routing.yaml (- agent-implementation…) sin pulsar Confirmar, y «Solo cuando trabajo con un cliente» mostró el selector «Cliente»; sha256 de .valmen/routing.yaml y .valmen/profiles.yaml igual antes y después.",
    "reference": null,
    "point_id": null
  },
  {
    "id": "EVIDENCE-006",
    "date": "2026-10-14",
    "kind": "automated-test",
    "description": "npx vitest run: 5481 pruebas en verde; node scripts/verificar-interfaz.mjs: Interfaz verificada; tests/vista-cambiar-perfil.test.ts; tests/ancho-vistas.test.ts: la vista llena el ancho a 2000 px",
    "reference": "worktree:sha256:23ac079b195cdeb191d637d80690776bb397b6a2c8448dcba748c16470a3d701",
    "point_id": "POINT-001"
  }
]
```

## Retests

```json
[
  {
    "id": "RETEST-001",
    "date": "2026-10-14",
    "point_id": "POINT-001",
    "result": "approved",
    "evidence": [],
    "po_confirmation": "ya he estado verificando y yo veo casi todo bien; podrias correr las ratificaciones y cerrar"
  }
]
```

## Cierre

```json
[
  {
    "kind": "ticket-close",
    "id": "CLOSE-001",
    "date": "2026-10-14",
    "technical_summary": "Pantalla #/modelos/perfil con tarjetas por perfil, tabla Ahora a Despues solo con lo que cambia, aviso de fases cambiadas en el proyecto y aplicacion con PUT /api/perfiles/seleccion.",
    "functional_summary": "Se puede elegir otro perfil y ver que modelo cambia de cual antes de aplicarlo.",
    "qa_status": "approved",
    "qa_waiver_reason": null,
    "po_confirmation": null,
    "release_impact": "Solo visual en la interfaz local de Mission Control; sin migracion, sincronizacion ni despliegue. Se revierte con el commit del ticket."
  }
]
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
    "notes": null,
    "input_tokens": null,
    "output_tokens": null,
    "total_tokens": null,
    "estimated_cost_usd": null,
    "source": "manual:sesión de subagente Claude Code (claude-opus-5-5) sin números expuestos; análisis, plan e implementación en la misma sesión de este ticket",
    "confidence": "low",
    "id": "CONSUMO-001"
  },
  {
    "kind": "ai-usage",
    "date": "2026-10-14",
    "session_reference": "4bafa011-0b4c-4a99-9312-df4519e031cc/agent-a74643bce9fe6a606",
    "model": "anthropic/claude-opus-5-5",
    "reasoning_effort": null,
    "notes": "Agente claude-code. 31 intervención(es) sobre el registro, 0 con fallo. 31 de 127 mensajes tocaron el registro. Subagente de la sesión 4bafa011-0b4c-4a99-9312-df4519e031cc; su gasto no está en la madre. Duró 27 min. La entrada incluye la creación de caché y la salida incluye el razonamiento. Caché leída 27828263 tokens. Sesión \"Sesión de Claude Code\". Costo: suscripción; no es cero, el origen no declara un costo por token. Se registran los tokens.",
    "input_tokens": 339471,
    "output_tokens": 117622,
    "total_tokens": 457093,
    "estimated_cost_usd": null,
    "source": "claude:4bafa011-0b4c-4a99-9312-df4519e031cc/agent-a74643bce9fe6a606",
    "confidence": "high",
    "id": "CONSUMO-002"
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
    "at": "2026-10-14T05:09:27.762Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-14",
    "at": "2026-10-14T05:09:55.552Z",
    "action": "design-references-updated",
    "actor": "cli",
    "details": "Referencias de diseño actualizadas: .valmen/features/rediseno-mission-control/assets/modelos-cambiar-perfil.html, .valmen/features/rediseno-mission-control/assets/modelos-cambiar-perfil.png."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-14",
    "at": "2026-10-14T07:08:14.967Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-14",
    "at": "2026-10-14T07:10:56.302Z",
    "action": "agent-decision",
    "actor": "cli",
    "details": "{\"id\":\"D-001\",\"pregunta\":\"¿Qué muestra la columna «Ahora» de la tabla?\",\"eleccion\":\"Los modelos del perfil vigente para el alcance elegido (proyecto: seleccion.proyecto; cliente: seleccion.ejecutores[cliente] o el del proyecto), comparados contra el perfil elegido; sin perfil vigente, los roles resueltos de GET /api/routing. Las fases cambiadas en el proyecto se avisan aparte.\",\"alternativas\":[\"Comparar contra el modelo efectivo de routing (con las fases del proyecto ya aplicadas)\",\"Mostrar los trece roles siempre\"],\"criterio\":\"Es lo que hace el boceto (filas = P[activo].r[i] contra P[sel].r[i], con el aviso de la fase que se queda) y lo que pide R-AJU-004: qué cambia al cambiar de perfil.\",\"fuente\":\".valmen/features/rediseno-mission-control/assets/modelos-cambiar-perfil.html:155\",\"reversion\":\"Cambiar la función que arma las filas para leer los roles resueltos; sin datos que deshacer.\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-14",
    "at": "2026-10-14T07:10:56.681Z",
    "action": "agent-decision",
    "actor": "cli",
    "details": "{\"id\":\"D-002\",\"pregunta\":\"¿Qué título lleva cada tarjeta de perfil si el perfil no tiene nombre legible?\",\"eleccion\":\"El id como título y, en la línea mono, el origen («incorporado» o «del proyecto»), como la tarjeta del perfil activo de Modelos.\",\"alternativas\":[\"Inventar un nombre a partir del id\",\"Añadir un campo nombre a los perfiles (adapter, servidor y profiles.yaml)\"],\"criterio\":\"PerfilDeModelos solo tiene id, description, origen y roles; inventar un nombre sería un dato que no existe y añadirlo es otro ticket.\",\"fuente\":\"packages/adapter/src/routing.ts:512-566\",\"reversion\":\"Cambiar el texto de la tarjeta; sin datos.\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-14",
    "at": "2026-10-14T07:10:57.035Z",
    "action": "agent-decision",
    "actor": "cli",
    "details": "{\"id\":\"D-003\",\"pregunta\":\"¿Cómo se elige el cliente en «Solo cuando trabajo con un cliente»?\",\"eleccion\":\"Un selector «Cliente» con los ejecutores de GET /api/perfiles (Claude Code, Codex, OpenCode, Hermes) que aparece solo con esa opción marcada, preseleccionado en claude; Aplicar manda { perfil, ejecutor }.\",\"alternativas\":[\"Usar el cliente declarado en Modelos (localStorage)\",\"Quitar la opción\"],\"criterio\":\"PUT /api/perfiles/seleccion necesita el ejecutor; el boceto no dibuja el selector pero su texto dice «con el cliente elegido».\",\"fuente\":\"packages/server/src/routing.ts:459-496\",\"reversion\":\"Quitar el selector; sin datos.\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-14",
    "at": "2026-10-14T07:10:57.376Z",
    "action": "agent-decision",
    "actor": "cli",
    "details": "{\"id\":\"D-004\",\"pregunta\":\"¿Qué hace la tarjeta «Nuevo perfil a partir del seleccionado»?\",\"eleccion\":\"Recuerda el perfil seleccionado en sessionStorage (valmen-nuevo-perfil-desde) y lleva a #/modelos, que abre «Avanzado» con el editor «Nuevo perfil a partir de <id>» de siempre (abrirEditor).\",\"alternativas\":[\"Un segundo editor dentro de la pantalla\",\"Abrir Modelos sin el editor\"],\"criterio\":\"Reutiliza el editor que ya valida contra el catálogo y guarda con PUT /api/perfiles, sin duplicar código; conservador y reversible.\",\"fuente\":\"packages/server/web/index.html:8976\",\"reversion\":\"Revertir la lectura de la clave en vistaModelos; la clave de sessionStorage se pierde al cerrar la pestaña.\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-10-14",
    "at": "2026-10-14T07:10:57.789Z",
    "action": "agent-decision",
    "actor": "cli",
    "details": "{\"id\":\"D-005\",\"pregunta\":\"¿Qué hace «Que también siga al perfil»?\",\"eleccion\":\"Reutiliza previsualizarVolver: diferencias de .valmen/routing.yaml sin esa fase y solo «Confirmar» escribe con PUT /api/routing; un parámetro opcional (por defecto vistaModelos) hace que repinte la pantalla que lo llamó.\",\"alternativas\":[\"Escribir sin mostrar diferencias\",\"Llevar a Modelos para hacerlo allí\"],\"criterio\":\"Es la misma operación que «Volver al perfil» (D-004 de FEATURE-WEB-AJUSTES-MODELOS-20261014) y escribir routing.yaml exige ver antes las diferencias.\",\"fuente\":\"packages/server/web/index.html:9418-9472\",\"reversion\":\"Quitar el parámetro; Modelos sigue igual.\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-10-14",
    "at": "2026-10-14T07:10:58.214Z",
    "action": "agent-decision",
    "actor": "cli",
    "details": "{\"id\":\"D-006\",\"pregunta\":\"¿Qué proveedor y estado muestra cada tarjeta?\",\"eleccion\":\"Los proveedores distintos de los siete trabajos de agente y coordinación del perfil, cada uno «<id> · detectado|configurado|sin configurar» según source de GET /api/providers (cli → detectado; environment o credentials-file → configurado; none → sin configurar), con punto verde, o ámbar si falta.\",\"alternativas\":[\"Solo el proveedor de implementación\",\"Todos los proveedores del perfil, incluidas las compuertas\"],\"criterio\":\"Las compuertas son iguales en todos los incorporados; el boceto muestra el proveedor que hace el trabajo y su estado.\",\"fuente\":\"packages/server/src/providers.ts:452-520\",\"reversion\":\"Cambiar la función que arma la línea; sin datos.\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-10-14",
    "at": "2026-10-14T07:10:58.602Z",
    "action": "agent-decision",
    "actor": "cli",
    "details": "{\"id\":\"D-007\",\"pregunta\":\"¿Qué pasa con la elección si el refresco en vivo repinta la pantalla?\",\"eleccion\":\"El perfil elegido, el alcance y el cliente se guardan en una variable del módulo y la pantalla los recupera al repintarse; se olvidan al aplicar o cancelar.\",\"alternativas\":[\"Volver al activo en cada refresco\",\"Guardarlos en localStorage\"],\"criterio\":\"navegar({ conservarVista: true }) repinta la vista entera y la persona perdería la decisión a medias.\",\"fuente\":\"packages/server/web/index.html:10361-10390\",\"reversion\":\"Quitar la variable; sin datos.\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-10-14",
    "at": "2026-10-14T07:10:59.017Z",
    "action": "agent-decision",
    "actor": "cli",
    "details": "{\"id\":\"D-008\",\"pregunta\":\"¿Qué dicen la nota de lo que no cambia y el aviso de fases cambiadas cuando son varias?\",\"eleccion\":\"Nota: «Las N compuertas y revisiones no cambian: siguen en <Jev y> <proveedores>.» con los roles de evaluación iguales, y «Tampoco cambia: <trabajos>.» si alguno de los siete no cambia; un rol de evaluación que sí cambia entra como fila. Aviso: una línea ámbar por cada trabajo de la tabla definido en el proyecto, con su «Que también siga al perfil».\",\"alternativas\":[\"Una sola línea que liste todas\",\"Ocultar las cambiadas de la tabla\"],\"criterio\":\"Con datos reales hay siete fases definidas en el proyecto; una línea por fase permite devolver cada una al perfil, como la del boceto.\",\"fuente\":\".valmen/routing.yaml\",\"reversion\":\"Cambiar el armado de la nota y el aviso; sin datos.\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-10-14",
    "at": "2026-10-14T07:10:59.464Z",
    "action": "agent-decision",
    "actor": "cli",
    "details": "{\"id\":\"D-009\",\"pregunta\":\"¿Qué hace «Cambiar de perfil» de Modelos ahora que existe #/modelos/perfil?\",\"eleccion\":\"Lleva a #/modelos/perfil; reemplaza D-002 de FEATURE-WEB-AJUSTES-MODELOS-20261014 y cambia a propósito la prueba C4 de tests/vista-modelos-ajustes.test.ts, declarado en el plan.\",\"alternativas\":[\"Dejar los dos caminos\",\"Un enlace aparte\"],\"criterio\":\"D-002 era provisional «hasta que exista #/modelos/perfil» (index.html:9225) y el pedido del orquestador dice enlazarla desde ahí.\",\"fuente\":\"packages/server/web/index.html:9223-9229\",\"reversion\":\"Revertir el commit; el selector de Avanzado sigue existiendo.\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-10-14",
    "at": "2026-10-14T07:13:45.190Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-014",
    "date": "2026-10-14",
    "at": "2026-10-14T07:15:50.608Z",
    "action": "plan-approved",
    "actor": "cli",
    "details": "{\"actor\":\"autorización POLITICA-POR-DEFECTO\",\"source\":\"autorizacion\",\"quote\":\"si es necesario que un agente verifique y tome la decision de los analisis, review o planes para que yo no los tenga que tomar en cada punto esta bien y ya al final si hay decisiones tomadas por el agente antes de poder cerrar el ticket yo los apruebo\",\"planHash\":\"sha256:25693f0eeca1a0452e01336fd2ee203068635f1cc43233d31daeedc4ad95ec35\",\"authorizationId\":\"POLITICA-POR-DEFECTO\",\"authorizationHash\":\"sha256:c1bb46dd45f48a215d91a242f445eab06b4ac6f78aa546bf15d8b85902a01a0a\",\"stage\":\"plan\",\"receiptId\":\"GR-20261014-FEATURE-WEB-AJUSTES-CAMBIAR-PERFIL-20261014-plan-1\",\"receiptStateHash\":\"sha256:1ec340cca681f48cfb245a53c6b4cb67c85282f0fdcb4654b38d89051cd12caa\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-015",
    "date": "2026-10-14",
    "at": "2026-10-14T07:15:51.306Z",
    "action": "plan-approval-verified",
    "actor": "cli",
    "details": "Aprobación del plan vigente: autorización POLITICA-POR-DEFECTO (fuente autorizacion, hash sha256:c1bb46dd45f48a215d91a242f445eab06b4ac6f78aa546bf15d8b85902a01a0a), plan sha256:25693f0eeca1a0452e01336fd2ee203068635f1cc43233d31daeedc4ad95ec35."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-016",
    "date": "2026-10-14",
    "at": "2026-10-14T07:15:51.306Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-017",
    "date": "2026-10-14",
    "at": "2026-10-14T07:16:01.595Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-018",
    "date": "2026-10-14",
    "at": "2026-10-14T07:20:52.678Z",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-019",
    "date": "2026-10-14",
    "at": "2026-10-14T07:29:45.776Z",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-002."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-020",
    "date": "2026-10-14",
    "at": "2026-10-14T07:29:46.167Z",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-003."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-021",
    "date": "2026-10-14",
    "at": "2026-10-14T07:29:46.543Z",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-004."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-022",
    "date": "2026-10-14",
    "at": "2026-10-14T07:29:46.959Z",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-005."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-023",
    "date": "2026-10-14",
    "at": "2026-10-14T07:29:47.362Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-024",
    "date": "2026-10-14",
    "at": "2026-10-14T07:30:38.281Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-025",
    "date": "2026-10-14",
    "at": "2026-10-14T07:31:07.298Z",
    "action": "delivery-size",
    "actor": "cli",
    "details": "{\"añadidas\":777,\"borradas\":13,\"total\":790,\"tope\":600,\"pasaElTope\":true,\"via\":\"worktree\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-026",
    "date": "2026-10-14",
    "at": "2026-10-14T15:10:04.533Z",
    "action": "agent-decisions-ratified",
    "actor": "cli",
    "details": "{\"actor\":\"juan andrade\",\"quote\":\"podrias correr las ratificaciones y cerrar\",\"source\":\"cli\",\"ratifica\":[\"D-001\",\"D-002\",\"D-003\",\"D-004\",\"D-005\",\"D-006\",\"D-007\",\"D-008\",\"D-009\",\"EVENT-014\"]}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-027",
    "date": "2026-10-14",
    "at": "2026-10-14T15:10:07.424Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-002."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-028",
    "date": "2026-10-14",
    "at": "2026-10-14T15:10:07.701Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-029",
    "date": "2026-10-14",
    "at": "2026-10-14T15:10:07.941Z",
    "action": "point-added",
    "actor": "cli",
    "details": "Se agregó POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-030",
    "date": "2026-10-14",
    "at": "2026-10-14T15:10:08.206Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-031",
    "date": "2026-10-14",
    "at": "2026-10-14T15:10:08.445Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-032",
    "date": "2026-10-14",
    "at": "2026-10-14T15:10:08.671Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-033",
    "date": "2026-10-14",
    "at": "2026-10-14T15:10:09.084Z",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-006."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-034",
    "date": "2026-10-14",
    "at": "2026-10-14T15:10:09.461Z",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-035",
    "date": "2026-10-14",
    "at": "2026-10-14T15:10:09.749Z",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-001 para POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-036",
    "date": "2026-10-14",
    "at": "2026-10-14T15:10:10.026Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: verified -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-037",
    "date": "2026-10-14",
    "at": "2026-10-14T15:10:10.333Z",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-038",
    "date": "2026-10-14",
    "at": "2026-10-14T15:10:10.632Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-039",
    "date": "2026-10-14",
    "at": "2026-10-14T15:10:10.860Z",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-040",
    "date": "2026-10-14",
    "at": "2026-10-14T15:10:11.085Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  }
]
```
