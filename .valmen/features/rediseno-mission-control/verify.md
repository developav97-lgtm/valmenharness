# Verificación — Rediseño de Mission Control: estilo sala de control, menú por grupos y pantallas más fáciles de usar

Feature: `rediseno-mission-control` · generado el 2026-10-14 desde el registro de tickets.

Tickets del grafo: 13 · cerrados: 13 · pendientes: 0.

## Tickets

### FEATURE-WEB-TEMA-TOKENS-20261014 — Tema sala de control con tokens, fuentes locales y modo claro

- Estado: closed · QA: approved
- Cierre técnico: Tokens del tema sala de control en :root con su version clara, fondo con cuadricula, 9 fuentes woff2 locales servidas como bytes con font/woff2, y los ocho colores a mano reemplazados por tokens.
- Cierre funcional: Mission Control se ve con el estilo sala de control, en oscuro y claro, con las tipografias Chakra Petch e IBM Plex sin depender de la red.
- Evidencia:
  - fuentes: Nueve woff2 (subconjunto latino) y OFL.txt de @fontsource/chakra-petch, @fontsource/ibm-plex-sans e @fontsource/ibm-plex-mono 5.3.0 (licencia OFL-1.1), descargados por el orquestador con la autorización del PO («Descargar de Fontsource») y copiados con cp a packages/server/web/fuentes/; shasum -a 256 -c contra SHA256SUMS: 10 OK; 172 KB en total; magic wOF2 y OFL.txt con «SIL OPEN FONT LICENSE Version 1.1».
  - captura: Modo oscuro a 1440 px (tickets/2026/FEATURE-WEB-TEMA-TOKENS-20261014/evidencia/tickets-oscuro-1440.png, tickets/2026/FEATURE-WEB-TEMA-TOKENS-20261014/evidencia/ticket-oscuro-1440.png; Chrome sin pantalla por CDP con prefers-color-scheme: dark) comparado con .valmen/features/rediseno-mission-control/assets/inicio.png y menu.png: fondo #0a1114 con cuadrícula de 40 px, superficies #122027, línea #24383f, cian para lo que decide el código, títulos en Chakra Petch, rótulos e identificadores en IBM Plex Mono, texto en IBM Plex Sans; ninguna petición a terceros.
  - captura: Modo claro a 1440 px (tickets/2026/FEATURE-WEB-TEMA-TOKENS-20261014/evidencia/tickets-claro-1440.png, tickets/2026/FEATURE-WEB-TEMA-TOKENS-20261014/evidencia/ticket-claro-1440.png; prefers-color-scheme: light): fondo #f2f6f7 con cuadrícula, superficies blancas, acento cian #0a7898, texto #0d1a1f; cada token toma su valor claro.
  - captura: Tickets a 390 px en oscuro y claro, solo como referencia (tickets/2026/FEATURE-WEB-TEMA-TOKENS-20261014/evidencia/tickets-oscuro-390.png, tickets/2026/FEATURE-WEB-TEMA-TOKENS-20261014/evidencia/tickets-claro-390.png): el documento mide 1063 px de ancho porque la tabla desborda la página. Fuera del alcance de este ticket: lo cubre R-MARCO-006 en otro ticket de la feature.
  - ux-review: Revisión de UX de 1 archivo(s) de interfaz (packages/server/web/index.html); 0 color(es) fijo(s). Skills: ui-ux-pro-max no declarada (el proyecto no la declara en external-skills); impeccable no declarada (el proyecto no la declara en external-skills). Sin informe de Impeccable.
  - automated-test: npx vitest run: 5481 pruebas en verde, incluida tests/tema-tokens.test.ts; node scripts/verificar-interfaz.mjs: Interfaz verificada; el PO reviso las pantallas en el navegador

### FEATURE-WEB-MENU-GRUPOS-20261014 — Menú por grupos con proyecto, perfil activo y Pedir un cambio

- Estado: closed · QA: approved
- Cierre técnico: Menu lateral por grupos (Hoy, Trabajo, En vivo, Reglas, Ajustes) con proyecto y perfil activo arriba, panel Pedir un cambio con Cmd+K, y rutas viejas #/configurar y #/configuracion conservadas.
- Cierre funcional: El menu tiene cinco grupos sin nombres repetidos; Configurar pasa a ser el boton Pedir un cambio y Configuracion pasa a Ajustes > Proyecto.
- Evidencia:
  - automated-test: Prueba primero: npx vitest run tests/menu-grupos.test.ts antes de tocar index.html dio 33 fallidas y 4 pasadas de 37 (las 4 pasadas son pares de contraste de reglas que ya existían). Tras la implementación: 37 de 37 en verde.
  - automated-test: Regresión: npx vitest run sobre los 27 archivos de tests/ que ejecutan o leen la interfaz (incluye tema-tokens, interfaz-ejecutable, vista-marco-responsivo, politicas-autonomas-pantalla, revocar-autorizacion-pantalla, perfiles-pantalla, pantalla-autorizaciones, estaticos-web, vista-corrida y menu-grupos): 476 de 476 en verde. node scripts/verificar-interfaz.mjs: 12 vistas ejecutadas, «Interfaz verificada». npx tsc --noEmit -p tsconfig.json sin errores; npx eslint tests/menu-grupos.test.ts sin hallazgos; revisar_presentacion sin colores a mano.
  - automated-test: Dos pruebas existentes de tests/vista-corrida.test.ts se pusieron en rojo con la primera versión y NO se editaron: (1) «el menú lleva Agentes a #/agentes» (regex <a href="#/agentes" data-vista="agentes">.*Agentes</a>) fallaba porque la cuenta iba detrás del rótulo; (2) «repinta cada 5 s» esperaba 1 llamada a /api/corrida/agentes y había 2, porque marcarPendientes() pedía la cuenta además de la vista. Se corrigió la implementación: la cuenta va delante del rótulo en el marcado y CSS order:1 la muestra detrás, y con la vista Agentes abierta la cuenta la pone vistaCorrida con ponerCuenta() sin una segunda petición. Las dos vuelven a verde sin tocarse.
  - manual-test: Capturas a 1440 px con Chrome sin pantalla (--blink-settings=preferredColorScheme=0/1, servidor del worktree en 127.0.0.1:4173): tickets/2026/FEATURE-WEB-MENU-GRUPOS-20261014/evidencia/menu-oscuro-1440.png y menu-claro-1440.png, comparadas con .valmen/features/rediseno-mission-control/assets/menu.png y menu-antes-despues.png: marca arriba, caja Proyecto con el selector, línea lila «Perfil claude-code-completo», cinco grupos con rótulo en mono (Hoy, Trabajo, En vivo, Reglas, Ajustes) y sus entradas en el orden del boceto, entrada activa con borde cian, cuenta ámbar sólida, botón punteado «Pedir un cambio ⌘K» y latido al pie. En claro los mismos tokens con sus valores claros. Diferencias con el boceto: Inicio todavía sin cuenta (D-001) y Tickets/Estándares conservan sus cuentas de siempre.
  - manual-test: Navegador (panel de Claude, 127.0.0.1:4173): ⌘K en Tickets con el foco fuera de un campo abre #pedir-cambio con el foco en «Qué quieres configurar» (captura evidencia/pedir-cambio-oscuro.jpg); Esc lo cierra y el foco vuelve a #pedir-cambio-boton (C11). #/configuracion muestra el editor con el título «Proyecto» y aria-current solo en data-vista=proyecto (C15). #/configurar abre el panel con Tickets marcada; al cerrarlo el hash pasa a #/tickets sin reabrirse.
  - manual-test: 390x844 en modo oscuro (panel de Claude): el menú se apila sobre el contenido a 390 px de ancho, con las entradas en dos columnas (evidencia/menu-oscuro-390.jpg). En Estándares innerWidth=390 y scrollWidth=390: sin desplazamiento horizontal. En Tickets (887) y en Proyecto (460) la página sí se desplaza por el contenido de la vista (la tabla de tickets y el editor), no por el menú: es de FEATURE-WEB-TRABAJO-TICKETS-20261014 y FEATURE-WEB-AJUSTES-PROYECTO-20261014 (R-MARCO-006). Por eso C18 queda sin marcar.
  - automated-test: npx vitest run: 5481 pruebas en verde; node scripts/verificar-interfaz.mjs: Interfaz verificada; tests/menu-grupos.test.ts

### FEATURE-WEB-INICIO-DECISIONES-20261014 — Inicio con lo que espera una decisión de la persona

- Estado: closed · QA: approved
- Cierre técnico: Ruta de solo lectura GET /api/inicio (packages/server/src/inicio.ts) y vista Inicio que abre por defecto con lo que espera una decision, lo que corre ahora y lo hecho hoy.
- Cierre funcional: Al abrir Mission Control se ve primero lo que espera la decision de la persona, con tarjetas que abren el ticket correspondiente.
- Evidencia:
  - automated-test: npx vitest run: 5481 pruebas en verde; node scripts/verificar-interfaz.mjs: Interfaz verificada; tests/inicio-decisiones.test.ts; tests/ancho-vistas.test.ts: la vista llena el ancho a 2000 px

### FEATURE-WEB-AJUSTES-MODELOS-20261014 — Vista Modelos con perfil activo, roles agrupados y aviso de cliente

- Estado: closed · QA: approved
- Cierre técnico: Vista Modelos con tarjeta del perfil activo, fases del agente, coordinacion y compuertas agrupadas con el origen de cada modelo, aviso de cliente y Volver al perfil con diferencias antes de escribir.
- Cierre funcional: Modelos abre con el perfil activo y dice de donde sale el modelo de cada trabajo; lo avanzado queda plegado.
- Evidencia:
  - automated-test: Prueba primero: npx vitest run tests/vista-modelos-ajustes.test.ts antes de tocar index.html: 10 de 10 en rojo (sin bloque de perfil, sin grupos, sin aviso, sin corte de 768 px). Después de implementar: 10 de 10 en verde.
  - automated-test: Regresión sin editar pruebas existentes: npx vitest run tests/perfiles-pantalla.test.ts tests/menu-grupos.test.ts tests/tema-tokens.test.ts tests/interfaz-ejecutable.test.ts tests/vista-marco-responsivo.test.ts tests/estaticos-web.test.ts → 135 de 135; node scripts/verificar-interfaz.mjs → Interfaz verificada (12 vistas); revisar_presentacion sin colores fijos; valmen secrets sin hallazgos.
  - manual-test: Chrome sin pantalla por CDP con datos reales de /api/routing, /api/perfiles y /api/modelos/fases del worktree, a 1440 px en oscuro y claro (evidencia/modelos-1440-dark.png, evidencia/modelos-1440-light.png), comparado con modelos.png: misma estructura, jerarquía, lila/ámbar por quién decide y textos fijos; scrollWidth 1440 = clientWidth. Diferencias: el título es el id (el perfil no tiene nombre), con los datos reales todas las fases salen «cambiado aquí» porque routing.yaml las define (D-003), y «Cambiar de perfil» abre Avanzado (D-002).
  - manual-test: Chrome sin pantalla por CDP a 390 px (móvil) en oscuro y claro (evidencia/modelos-390-dark.png, evidencia/modelos-390-light.png): scrollWidth 390 = clientWidth, sin desplazamiento horizontal; tarjetas del agente y filas de Coordinación y Compuertas en una columna con rótulos.
  - manual-test: Recorrido en el navegador (127.0.0.1:4877/#/modelos): «Volver al perfil» en Implementación muestra solo las 4 líneas de agent-implementation que se quitarían de .valmen/routing.yaml; se pulsó Cancelar (no se confirmó: routing.yaml sin cambios). «Declarar» con Claude Code pide ?ejecutor=claude y muestra «valmen resume --cliente claude»; «Cambiar» vuelve al aviso. «Cambiar de perfil» abre Avanzado con el foco en «Perfil del proyecto»; «Duplicar y editar» abre «Nuevo perfil a partir de claude-code-completo».
  - automated-test: npx vitest run: 5481 pruebas en verde; node scripts/verificar-interfaz.mjs: Interfaz verificada; tests/vista-modelos-ajustes.test.ts

### FEATURE-WEB-AJUSTES-CAMBIAR-PERFIL-20261014 — Cambiar de perfil con vista previa de lo que cambia

- Estado: closed · QA: approved
- Cierre técnico: Pantalla #/modelos/perfil con tarjetas por perfil, tabla Ahora a Despues solo con lo que cambia, aviso de fases cambiadas en el proyecto y aplicacion con PUT /api/perfiles/seleccion.
- Cierre funcional: Se puede elegir otro perfil y ver que modelo cambia de cual antes de aplicarlo.
- Evidencia:
  - ux-review: Revisión de UX de 1 archivo(s) de interfaz (packages/server/web/index.html); 0 color(es) fijo(s). Skills: ui-ux-pro-max no declarada (el proyecto no la declara en external-skills); impeccable no declarada (el proyecto no la declara en external-skills). Sin informe de Impeccable.
  - test-run: Prueba primero: tests/vista-cambiar-perfil.test.ts 9 de 9 en rojo y la C4 cambiada de tests/vista-modelos-ajustes.test.ts en rojo antes de implementar; después npx vitest run tests/vista-cambiar-perfil.test.ts tests/vista-modelos-ajustes.test.ts → 19 de 19 en verde.
  - test-run: Regresión sin editar pruebas existentes (salvo la C4 declarada, D-009): npx vitest run tests/vista-cambiar-perfil.test.ts tests/vista-modelos-ajustes.test.ts tests/perfiles-pantalla.test.ts tests/menu-grupos.test.ts tests/tema-tokens.test.ts tests/interfaz-ejecutable.test.ts tests/vista-marco-responsivo.test.ts tests/estaticos-web.test.ts → 154 de 154; node scripts/verificar-interfaz.mjs → Interfaz verificada (14 vistas); estandar revisar sin colores fijos; secrets sin hallazgos.
  - manual-test: Chrome sin pantalla por CDP con datos reales del worktree (valmen serve --port 4893), a 1440 px: al abrir, claude-code-completo ACTIVO y «Este ya es el perfil activo…» (evidencia/cambiar-perfil-1440-oscuro-inicial.png); eligiendo codex-completo, en oscuro y claro (evidencia/cambiar-perfil-1440-oscuro-codex.png, evidencia/cambiar-perfil-1440-claro-codex.png): tabla de siete filas con el actual tachado, nota «Las 6 compuertas y revisiones no cambian: siguen en Jev y OpenRouter.», siete avisos ámbar (routing.yaml define las siete fases), «Dónde se aplica» y «Aplicar codex-completo»; comparado con modelos-cambiar-perfil.png: misma estructura, jerarquía, lila/cian/ámbar y textos fijos, con las diferencias listadas en Implementación.
  - manual-test: Chrome sin pantalla por CDP a 390 px en oscuro y claro (evidencia/cambiar-perfil-390-oscuro-codex.png, evidencia/cambiar-perfil-390-claro-codex.png): scrollWidth 390 = innerWidth, sin desplazamiento horizontal; tarjetas en una columna y filas de la tabla apiladas. En el navegador, «Que también siga al perfil» mostró las diferencias de .valmen/routing.yaml (- agent-implementation…) sin pulsar Confirmar, y «Solo cuando trabajo con un cliente» mostró el selector «Cliente»; sha256 de .valmen/routing.yaml y .valmen/profiles.yaml igual antes y después.
  - automated-test: npx vitest run: 5481 pruebas en verde; node scripts/verificar-interfaz.mjs: Interfaz verificada; tests/vista-cambiar-perfil.test.ts; tests/ancho-vistas.test.ts: la vista llena el ancho a 2000 px

### FEATURE-WEB-AJUSTES-PROVEEDORES-20261014 — Proveedores con estado y uso por el perfil activo

- Estado: closed · QA: approved
- Cierre técnico: Vista Proveedores con estado configurado, detectado o sin configurar, y cuantos trabajos del perfil activo usa cada proveedor, calculado con GET /api/perfiles; la clave nunca se muestra.
- Cierre funcional: Proveedores dice si cada uno esta configurado y si el perfil activo lo usa.
- Evidencia:
  - automated-test: Prueba primero: npx vitest run tests/ajustes-proveedores.test.ts antes de tocar index.html → 27 fallidas de 27 (rojo). Tras implementar → 27 de 27 en verde (C1-C17).
  - automated-test: Regresión sin editar pruebas: npx vitest run tests/interfaz-ejecutable.test.ts tests/menu-grupos.test.ts tests/tema-tokens.test.ts tests/mission-control.test.ts tests/estaticos-web.test.ts → 157 de 157 (C20). La primera corrida dio 1 rojo en interfaz-ejecutable por la copia publicada desactualizada (packages/cli/dist/web, no versionada); tras npm run build, verde sin tocar la prueba. node scripts/verificar-interfaz.mjs → Interfaz verificada. revisar_presentacion → sin colores fijos.
  - manual-test: Chrome sin pantalla por CDP contra node packages/cli/dist/main.js serve: #/proveedores a 1440 px en oscuro y en claro comparado con proveedores.png (C19; evidencia/proveedores-oscuro-1440.png, evidencia/proveedores-claro-1440.png); a 390 px scrollWidth 390 igual a innerWidth, una columna sin desplazamiento horizontal (C18; evidencia/proveedores-oscuro-390.png).
  - automated-test: npx vitest run: 5481 pruebas en verde; node scripts/verificar-interfaz.mjs: Interfaz verificada; tests/ajustes-proveedores.test.ts

### FEATURE-WEB-AJUSTES-PROYECTO-20261014 — Proyecto con bloques e interruptores y YAML en Avanzado

- Estado: closed · QA: approved
- Cierre técnico: Vista Proyecto por bloques (aprobacion por defecto, QA por agente, avisos, pruebas) con campos aditivos en el servidor; crear o revocar una autorizacion sigue pidiendo actor y frase literal.
- Cierre funcional: Proyecto presenta la configuracion como bloques con interruptores y deja el editor del archivo en Avanzado.
- Evidencia:
  - automated-test: Prueba primero: npx vitest run tests/vista-proyecto-ajustes.test.ts tests/proyecto-ajustes-servidor.test.ts antes de tocar el código: 22 de 22 en rojo (sin porDefecto, sin testCommands/testTimeout/avisos en el resumen, sin bloques ni interruptores, sin estilos proyecto-ajustes). Después de implementar: 22 de 22 en verde.
  - automated-test: Regresión sin editar pruebas existentes: npx vitest run de las 11 pruebas de C20 más las 2 nuevas → 13 archivos, 237 de 237 en verde; node scripts/verificar-interfaz.mjs → Interfaz verificada (13 vistas); npx tsc -p packages/server --noEmit sin errores; revisar_presentacion sin colores fijos. interfaz-ejecutable falló una vez solo porque la copia publicada no estaba regenerada (paso 11, npm run build) y pasó tras el build, sin editar la prueba.
  - manual-test: En el navegador, sin confirmar nada: el interruptor de aprobación abrió Tu nombre/Tu frase/Confirmar revocación y Cancelar lo cerró; Crear autorización desplegó y plegó el formulario de QA; Avisos por Telegram, + añadir (npx eslint) y Tiempo máximo 600 prepararon el texto y mostraron las diferencias en Avanzado sin Guardar. Red: solo GET y POST /api/config/check. md5 de .valmen/config.yaml, .valmen/approval/authorizations.jsonl y .valmen/qa/authorizations.jsonl iguales antes y después.
  - manual-test: Chrome sin pantalla por CDP con datos reales del worktree (serve --port 4817), #/proyecto a 1440 px en oscuro y claro (evidencia/proyecto-1440-dark.png, sha256 en la referencia; evidencia/proyecto-1440-light.png) contra proyecto.png: mismo encabezado, título, bloque de aprobación con borde ámbar, interruptor activa, tres tarjetas lila/ámbar/rojo y candado, QA con estado y Crear autorización, Avisos y Pruebas en dos columnas, Avanzado plegado. Diferencias: las listadas en el plan (Telegram apagado por falta de hermes:, lista de autorizaciones de QA con historial, segundo plegado).
  - manual-test: A 390 px en oscuro y claro (evidencia/proyecto-390-dark.png, sha256 en la referencia; evidencia/proyecto-390-light.png): una sola columna, scrollWidth 390 = ancho, sin desplazamiento horizontal. Se corrigió en el camino un hueco del encabezado del bloque en columna (flex-basis de .texto-bloque).
  - automated-test: Arbol de los archivos del ticket al cerrar, tras integrar todo el rediseno en main: npx vitest run 5481 pruebas en verde

### FEATURE-WEB-TRABAJO-TICKETS-20261014 — Tickets y detalle con filtro por turno y ciclo de ocho pasos

- Estado: closed · QA: approved
- Cierre técnico: Turno de cada ticket (packages/server/src/turno.ts), filtros por a quien le toca, ciclo de ocho pasos, bloque Te toca y ruta POST /api/tickets/:id/pruebas-del-responsable que exige actor y frase literal.
- Cierre funcional: Tickets muestra a quien le toca cada uno y el detalle pone arriba lo que la persona debe hacer, incluidos los botones de resultado de pruebas.
- Evidencia:
  - test: npx vitest run tests/turno-ticket.test.ts tests/vista-tickets-turno.test.ts → 40 de 40 en verde (C1-C17); vistos en rojo antes del código (23 de 25 y 15 de 15).
  - test: Regresión C20: npx vitest run de tickets-view, estado-publico-web, interfaz-ejecutable, menu-grupos, qa-sin-cubrir-vista, linea-de-tiempo-interfaz, firma-de-bloqueo-pantalla, inicio-decisiones, estaticos-web, tema-tokens, api-rutas (con la línea autorizada), reconexion-mc y vista-corrida → 221 de 221; los 70 archivos de tests/ que leen la interfaz o la API, por lotes, en verde; node scripts/verificar-interfaz.mjs → «Interfaz verificada.»; npx tsc -p packages/server y packages/engine sin errores.
  - manual: Chrome sin pantalla por CDP sobre un registro temporal (copia de tickets/ y .valmen/ en el scratchpad, con el ticket de prueba FEATURE-WEB-PRUEBA-NAVEGADOR-20261014): a 1440 px en oscuro y claro, Tickets y el detalle frente a tickets.png y ticket.png (evidencia/tickets-1440-dark.png, tickets-1440-light.png, ticket-1440-dark.png, ticket-1440-light.png), con las diferencias listadas en Implementación (C19).
  - manual: Chrome sin pantalla a 390 px (móvil) en oscuro y claro: innerWidth 390 = scrollWidth 390 en Tickets y en el detalle; la tabla se desplaza en su caja (evidencia/tickets-390-dark-largo.png, tickets-390-light.png, ticket-390-dark.png, ticket-390-light-largo.png) (C18).
  - manual: Acción «Pasaron las pruebas» en el navegador, solo sobre el ticket temporal: sin frase muestra «Escribe tu nombre y tu frase literal…» y no envía; con frase anota «Resultado del PO: pasaron — «…» (Prueba de navegador, Mission Control, 2026-10-14)» en su ## Pruebas y lo deja en in_qa; ningún ticket de tick/ real se tocó (evidencia/ticket-tras-pasaron.png). revisar_presentacion: sin colores fijos.
  - automated-test: npx vitest run: 5481 pruebas en verde; node scripts/verificar-interfaz.mjs: Interfaz verificada; tests/turno-ticket.test.ts y tests/vista-tickets-turno.test.ts; tests/ancho-vistas.test.ts: la vista llena el ancho a 2000 px

### FEATURE-WEB-TRABAJO-FEATURES-20261014 — Features con estado y tablero de recorrido y siguiente paso

- Estado: closed · QA: approved
- Cierre técnico: Vista Features con tarjetas por estado y tablero con el recorrido, el siguiente paso y los tickets por sprint; campo aditivo de adjuntos en la proyeccion de features.
- Cierre funcional: Features muestra en que punto esta cada feature y que falta, con los comandos para verificar o crear una nueva.
- Evidencia:
  - test: npx vitest run tests/trabajo-features.test.ts → 17 de 17 en verde (C1-C17); antes de tocar el código, 17 de 17 en rojo.
  - test: Regresión C20: npx vitest run tests/trabajo-features.test.ts tests/tablero-feature.test.ts tests/features-view.test.ts tests/interfaz-ejecutable.test.ts tests/api-rutas.test.ts tests/menu-grupos.test.ts tests/vista-marco-responsivo.test.ts → 7 archivos, 118 de 118, sin editar ninguna existente; npm run build y node scripts/verificar-interfaz.mjs → «vistas ejecutadas: 14», «Interfaz verificada.»; npx tsc -p packages/server --noEmit sin errores.
  - manual: Chrome sin pantalla por CDP contra serve --port 4188 del worktree, datos reales (11 features), solo lectura: #/feature/vista-agentes a 1440 px en oscuro y claro frente a features.png (evidencia/features-1440-oscuro.png, features-1440-claro.png), con las diferencias listadas en Implementación (C19).
  - manual: A 390 px, en oscuro (#/feature/vista-agentes) y claro (#/features), document.documentElement.scrollWidth = 390 = innerWidth: sin desplazamiento horizontal (evidencia/features-390-oscuro.png, features-390-claro.png) (C18).
  - manual: Interacción en Chrome real: 5 tarjetas con «Mostrar completas» apagado y 11 encendido (aria-checked true); «Verificar la feature» muestra valmen feature verify vista-agentes; «Nueva feature» muestra valmen feature new <slug> --title "<título>"; «Más detalle» trae Por estado, Resumen, Requisitos, Grafo, Brief, Diseño, tickets.yaml y las specs (evidencia/features-verificar.png). revisar_presentacion: sin colores fijos; valmen secrets: sin secretos.
  - automated-test: npx vitest run: 5481 pruebas en verde; node scripts/verificar-interfaz.mjs: Interfaz verificada; tests/trabajo-features.test.ts

### FEATURE-WEB-TRABAJO-PORTAFOLIO-20261014 — Portafolio con una tarjeta por proyecto

- Estado: closed · QA: approved
- Cierre técnico: Vista Portafolio con una tarjeta por proyecto, selector de rango, y campos aditivos por proyecto (decisiones, agentes, perfil); de solo lectura.
- Cierre funcional: Portafolio muestra cada proyecto con lo que espera decision, sus agentes y su consumo.
- Evidencia:
  - ux-review: Revisión de UX de 1 archivo(s) de interfaz (packages/server/web/index.html); 0 color(es) fijo(s). Skills: ui-ux-pro-max no declarada (el proyecto no la declara en external-skills); impeccable no declarada (el proyecto no la declara en external-skills). Sin informe de Impeccable.
  - automated-test: npx vitest run: 5481 pruebas en verde; node scripts/verificar-interfaz.mjs: Interfaz verificada; tests/portafolio-vista.test.ts; tests/ancho-vistas.test.ts: la vista llena el ancho a 2000 px

### FEATURE-WEB-VIVO-AGENTES-20261014 — Agentes con titular, pregunta pendiente y selector de mundo

- Estado: closed · QA: approved
- Cierre técnico: Marco nuevo de la vista Agentes (titular con cuentas, aviso de pregunta pendiente, selector de mundo y tabla); el motor de escena y los mundos no cambian.
- Cierre funcional: Agentes dice cuantos agentes trabajan y cuantos preguntan, y lista quien hace que.
- Evidencia:
  - automated-test: npx vitest run: 5481 pruebas en verde; node scripts/verificar-interfaz.mjs: Interfaz verificada; tests/vista-agentes-marco.test.ts; tests/ancho-vistas.test.ts: la vista llena el ancho a 2000 px

### FEATURE-WEB-VIVO-PROCESOS-20261014 — Procesos con las corridas detenidas primero

- Estado: closed · QA: approved
- Cierre técnico: Vista Procesos con las corridas detenidas primero y aprobacion que pide responsable y la frase exacta del gate y envia la corrida; campos aditivos en processes.ts; lo anterior queda en Mas detalle.
- Cierre funcional: Procesos pone primero lo que espera aprobacion y corrige el boton que no podia aprobar un despliegue.
- Evidencia:
  - automated-test: npx vitest run: 5481 pruebas en verde; node scripts/verificar-interfaz.mjs: Interfaz verificada; tests/procesos-detenidas.test.ts y tests/procesos-vista.test.ts; tests/ancho-vistas.test.ts: la vista llena el ancho a 2000 px

### FEATURE-WEB-REGLAS-ESTANDARES-20261014 — Estándares separados en vigor, propuestos y descartados

- Estado: closed · QA: approved
- Cierre técnico: Vista Estandares con pestanas En vigor, Propuestos y Descartados con cuenta, filas plegables con regla, porque y la frase con que se decidio; lo anterior queda en Mas detalle.
- Cierre funcional: Estandares muestra cada regla con su motivo y las palabras de la persona que la decidio.
- Evidencia:
  - ux-review: Revisión de UX de 1 archivo(s) de interfaz (packages/server/web/index.html); 0 color(es) fijo(s). Skills: ui-ux-pro-max no declarada (el proyecto no la declara en external-skills); impeccable no declarada (el proyecto no la declara en external-skills). Sin informe de Impeccable.
  - screenshot: Capturas con el registro real (Chrome sin pantalla, valmen serve --port 4795): evidencia/est-1440-oscuro.png, est-1440-claro.png, est-1440-oscuro-descartados.png, est-390-oscuro.png, est-390-claro.png; a 390 px scrollWidth = clientWidth = 390.
  - automated-test: npx vitest run: 5481 pruebas en verde; node scripts/verificar-interfaz.mjs: Interfaz verificada; tests/estandares-vista.test.ts; tests/ancho-vistas.test.ts: la vista llena el ancho a 2000 px

## Pendiente del PO

Nada: todos los tickets están cerrados.
