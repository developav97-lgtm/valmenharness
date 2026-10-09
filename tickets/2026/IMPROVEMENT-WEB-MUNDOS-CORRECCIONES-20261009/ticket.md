---
schema_version: 2
id: IMPROVEMENT-WEB-MUNDOS-CORRECCIONES-20261009
title: Correcciones de los tres mundos tras la revisión del PO
type: IMPROVEMENT
module: WEB
workflow_status: awaiting_user_tests
qa_status: pending
release_status: unreleased
user_visible: false
sync_impact: false
migration_impact: false
docker_impact: false
risk_level: normal
created: 2026-10-08
updated: 2026-10-08
related_ticket: null
target_release: null
released_in: null
---

# IMPROVEMENT-WEB-MUNDOS-CORRECCIONES-20261009

## Solicitud original

Palabras del PO el 2026-10-09 tras revisar los mundos (con seis capturas: tabla «Comandas» de la pastelería, tabla «Telemetría» del centro de control, el invernadero con la tabla «Bitácora de cultivo» y el centro de control con cinco consolas «CERRADA» superpuestas): «voy a empezar por la pantalla de el jardín. La idea, digamos, es que, por ejemplo, en el jardín, la matica que va pasando de maceta en maceta, sea el ticket. ¿Qué pasa? Que si hay seis tickets por probar, deberían haber seis tickets en la maceta de prueba; la maceta iría pasando paso a paso y debe ser un ticket; si en la maceta solo caben nueve flores, entonces el máximo número visual va a ser nueve, si hay 12, 3, 12, 15 tickets, pues se van a seguir viendo nueve, y en el momento de que bajen a ocho sí se va a ver la disminución de las flores; la idea es que las flores sean, digamos, como los tickets. En la panadería sería igual: cada pastel sería un ticket, y cada pastel debería pasar y quedar al final como acumulado, la cantidad que visualmente se vea bien. Pasa otra cosa, que siento que no es culpa de la pantalla de agentes: el cambio de estados. Lo revisé con varios tickets al momento de su ejecución. El agente principal lanza el ticket a un subagente. El subagente hace todo el proceso de análisis. El principal corrigió el análisis, pasó al plan, se aprobó el plan y se pasó a implementar. Pero el ticket visualmente, ni dentro del ticket ni dentro de los mundos de los agentes, pasó por todos sus estados. Solamente se actualizó cuando pasó a pruebas. Los agentes que están haciendo las fases no están actualizando el estado instantáneamente; creo que si el ticket empezó el análisis, en el jardín debería pasar a la casilla de análisis, si ya pasó el análisis y se empezó el plan debería pasar al plan, pero esa sucesión de estados no está pasando. En el mundo de los computadores, cuando apenas arranca, si recargo la pestaña los agentes van y se sientan en el computador, pero después se hace un refresco y se tapan todos y quedan como cinco computadores visibles tapando los que están ejecutando, y se la pasa así: los quita y vuelve y los pone y los sigue tapando. Del jardín de Anita o el mostrador de Anita: quítale ese nombre, Anita, por favor. En la parte donde se ven las sesiones, tanto en la panadería como en el de sistemas, no se ve bien el primer registro. Y en los pantallazos se ven tres registros: uno de sesión principal, uno que dice ticket sesión principal y uno que es el que estaba trabajando en ese momento; solo faltaba un ticket por ejecutar, que era el agente que estaba ahí, pero seguían apareciendo tres agentes; es más, en este momento ese agente sigue apareciendo.»

### Supuestos y decisiones pendientes

<!-- Si el pedido nombra algo que el código no tiene —parámetro, permiso,
campo, bandera, columna, migración— y no lo especifica, listá cada elemento
con su pregunta antes de avanzar a análisis; el análisis no planifica sobre
la adivinanza. Si no hay ninguno, escribí «Ninguno» y seguí. -->
El código no tiene un «tope visual por mundo» ni una lista de tickets por estado en la escena: se traduce a una función pura por mundo que reparte los tickets de la corrida por estación y los recorta al tope. Lo que la solicitud no fija queda así, cada uno con su pregunta y la opción por defecto con la que se planifica si el PO no dice otra cosa:

- S1 · Tope por estación. Pregunta al PO: «¿El tope de plantas o pasteles por estación queda en 9 en el invernadero (3×3 a media escala en la tierra del cantero, 80×58 px), 6 en la pastelería (2 filas de 3 sobre los 101 px del mostrador de cada puesto) y 9 en la vitrina final (3 estantes de 3)?». Por defecto: 9 / 6 / 9.
- S2 · Qué tickets cuentan. Pregunta: «¿Una planta o un pastel por cada ticket de la corrida (los de la jornada y los que trabaja algún agente, `idsDeLaCorrida`) en su estado del registro, o por cada ticket del registro en ese estado?». Por defecto: los de la corrida, que es lo que ya cuentan los KPI de la vista.
- S3 · Estados sin estación. Pregunta: «¿`blocked` y `changes_requested` se dibujan en alguna estación?». Por defecto: no se dibujan (siguen contados en el KPI «esperan al PO»); `qa_approved` y `closed` van a la última estación (Vitrina / Cosecha).
- S4 · Indicador de exceso. Pregunta: «Cuando hay más tickets que el tope, ¿se muestra un rótulo «+N» o solo se ven las del tope?». Por defecto: solo las del tope, como dijo el PO («se van a seguir viendo nueve»).
- S5 · Texto que reemplaza «Anita». Pregunta: «¿Se dice «PO» donde hoy dice «Anita»?». Por defecto: «Mostrador» y «Riego» en las estaciones, «PO» en el letrero del mostrador, «ESPERANDO AL PO» en la franja, «PO en línea» en el teléfono, «timbre en el mostrador» y «la regadera espera al PO» en las expresiones de pregunta.
- S6 · Centro de control. El PO no pidió cambiar las pantallas del control (ya muestran hasta tres tickets por estación, `MAXIMO_POR_PANTALLA`): quedan fuera de este ticket salvo que el PO diga otra cosa.

## Descripción funcional

- Alcance: cinco correcciones de la vista Agentes, de la solicitud del PO del 2026-10-09: (P1) en el invernadero y la pastelería cada ticket es una planta o un pastel y cada estación muestra tantos como tickets tiene, con tope visual por mundo, y los pasteles cerrados se acumulan en la vitrina final; (P2) ningún texto de los mundos ni del marco dice «Anita»; (P3) el encabezado de las tablas de los paneles deja de tapar la primera fila; (P4) el centro de control deja de superponer consolas «CERRADA» sobre los operadores tras cada refresco; (P5) el cuaderno del invernadero deja de mostrar una fila oscura con texto casi invisible. Excluido: la sucesión de estados del ticket y los agentes terminados que siguen apareciendo como vivos en la tabla, que son del lector de agentes y ya los trata BUGFIX-SERVER-AGENTES-OBSOLETOS-Y-ESTADO-WORKTREE-20261009 (en main desde 988ba98).
- Usuario o rol afectado: el PO, que sigue la corrida en la vista Agentes del servidor local (`#/agentes`).
- Comportamiento actual: la planta y el pastel son del agente, no del ticket (uno por agente quieto, todos dibujados en el mismo punto); tres textos de los mundos y dos rótulos de lienzo dicen «Anita»; el encabezado de «Comandas», «Telemetría» y «Bitácora de cultivo» baja sobre la fila «Sesión principal»; cada 5 s reaparecen 24 consolas «CERRADA» en las cinco consolas y desaparecen 5 s después; en modo oscuro el encabezado del cuaderno es una banda casi negra con texto gris verdoso.
- Comportamiento esperado: cada estación del invernadero y de la pastelería muestra min(tickets en ese estado, tope) plantas o pasteles y una menos en cuanto baja la cantidad bajo el tope; la vitrina acumula los cerrados hasta su tope; «Anita» no aparece en ningún texto; el encabezado queda encima de la primera fila sin taparla; en el control solo se ven las consolas de los operadores presentes, cada uno en una consola distinta; ninguna fila del cuaderno se ve oscura.

## Diagnóstico

- Causa comprobada (con `ruta:línea`):
  - P1 · La escena no recibe los tickets por estado: `montar` solo pasa `cola` y `entregados` (`packages/server/web/agentes/montaje.js:194-198`, `packages/server/web/index.html:6597-6600`) y los mundos dibujan la planta o el pastel por agente: `invernadero.js:249` (`for (const a of agentes) if (a.estacion === i && arrodillado(a)) planta(R, x - 6, 318, …)`, todas en la misma x) y `pasteleria.js:339-342` (un pastel por pastelero quieto en `a.x - 10`). La vitrina usa los seis últimos «entregados» (`pasteleria.js:107-110`, `ESTADOS_ENTREGADOS` en `index.html:6221` incluye `awaiting_user_tests` e `in_qa`), no los cerrados.
  - P2 · «Anita» vive en `packages/server/web/agentes/mundos/pasteleria.js:15,18,123,126,220,271,350` (estación «Mostrador de Anita», letrero «ANITA», pregunta «timbre en el mostrador de Anita», `senalDeAnita`, `PALETA.anitaMostrador`/`anitaPiel`), `invernadero.js:16,274` («Riego de Anita», «la regadera espera a Anita») y `control.js:24,130,162,168,174,340` («ESPERANDO A ANITA», «Anita en línea», `anitaEnLinea`). El marco (`index.html`) no la nombra (`grep -i anita packages/server/web/index.html` vacío).
  - P3 · `th` es `position: sticky; top: 51px` (`index.html:410-424`), pensado para el desplazamiento de la página bajo la barra superior. Dentro de los paneles el ancestro con desplazamiento es `.corrida-panel { overflow-x: auto }` (`index.html:2243-2246`; `overflow-y` computa `auto`), así que el encabezado se ancla a 51 px del borde del panel y baja sobre la primera fila. Medido en el navegador (127.0.0.1:4175, invernadero): el `thead` empieza a 49 px del panel, el `th` se dibuja a 64 px con 37 px de alto y la fila «Sesión principal» empieza a 86 px: tapa 15 px de esa fila. La regla es la misma en los tres mundos.
  - P4 · El servidor devuelve todos los subagentes de la sesión, también los terminados (`packages/server/src/agentes.ts:582-590`): la respuesta real tenía 27 filas, 24 en `termino`. `vistaCorrida` las pasa todas a `montar` cada 5 s (`index.html:6498`, `REFRESCO_DE_CORRIDA_MS` en `index.html:6220`). `actualizar` crea un agente nuevo para toda fila que la escena no tiene (`motor.js:100-111`), le pone `saleEn = ahora + 5000` si viene en `termino` (`motor.js:120`) y `avanzar` lo borra a los 5 s (`motor.js:135-138`); el refresco siguiente lo vuelve a crear con un carril nuevo (`escena.siguienteCarril += 1`, `motor.js:108`). El control dibuja la consola de todo operador con `monitorDe` → «CERRADA» (`control.js:116-118`, `control.js:348-353`) en `x = 130 + (carril % 5) * 175` (`control.js:228-230`), así que las 24 terminadas ocupan las cinco consolas encima de las vivas. Reproducido en el navegador importando `/agentes/motor.js` y `/agentes/mundos/control.js` con las filas reales de `/api/corrida/agentes` y cuatro refrescos de 5,2 s: al segundo 1 de cada ciclo hay 26 operadores (24 «CERRADA») repartidos en las consolas 0-4, al 5,1 quedan 2, y `siguienteCarril` sube 27 → 51 → 75 → 99. Segunda causa, del mismo dibujo: los dos operadores vivos tenían carriles 14 y 24, los dos en la consola 4 (`carril % 5`), porque el carril es un contador que nunca se reutiliza.
  - P5 · La banda oscura del cuaderno es el mismo encabezado desplazado de P3: `th` pinta `background: var(--fondo)` (`index.html:421`), que en el tema por defecto (oscuro) vale `#0d1014` (`index.html:12`); el invernadero solo cambia el color del texto a `#7a8a6f` (`index.html:2268-2270`). Medido: fondo `rgb(13, 16, 20)` y texto `rgb(122, 138, 111)` sobre el papel `#fbf7e8`. Hay una segunda fuente por lectura del CSS: `tbody tr:hover td { background: var(--panel) }` (`index.html:432-434`) pinta `#14181f` bajo el texto `#3b4a2f` del cuaderno al pasar el ratón.
- Hipótesis pendientes: si la fila oscura de la captura del PO era el encabezado o una fila con el ratón encima (ambas comprobadas en el CSS; la medida del navegador muestra la del encabezado sin ratón). Si el PO quiere los valores por defecto de S1-S5.
- Consumidores afectados: `packages/server/web/agentes/motor.js` (lo usan los tres mundos y `montaje.js`), `montaje.js`, `mundos/pasteleria.js`, `mundos/invernadero.js`, `mundos/control.js`, `packages/server/web/index.html` (vista Corrida y CSS de `th` y `.corrida-panel`); pruebas que fijan los textos de hoy: `tests/mundo-pasteleria.test.ts:20,125-151`, `tests/mundo-control.test.ts:167-195,287`, `tests/mundo-invernadero.test.ts:96`, `tests/vista-texto-pregunta.test.ts:168-197`; y las del motor y el lienzo (`tests/motor-escena.test.ts`, `tests/vista-lienzo.test.ts`, `tests/vista-marco-responsivo.test.ts`).
- Archivos y flujo investigados: `GET /api/corrida/agentes` (`packages/server/src/agentes.ts:544-616`) → `vistaCorrida` (`index.html:6501-6662`: `kpisDeCorrida` en `index.html:6283-6311`, `idsDeLaCorrida` en `index.html:6271-6276`) → `pintarLienzoDeAgentes` → `crearMontaje().montar` (`montaje.js:148-205`) → `actualizar`/`avanzar` (`motor.js:96-156`) → `mundo.dibujar` de cada mundo; y la tabla `tablaDeAgentes` (`index.html:6361-6394`) con el CSS de `th` (`index.html:410-424`), `.corrida-panel` (`index.html:2237-2251`) y los temas por mundo (`index.html:2252-2308`). Memoria consultada (`buscar_memoria` con mundos, consolas y encabezado): sin antecedentes.
- Riesgos y compatibilidad: cambiar `actualizar` para no crear agentes que llegan ya terminados no debe quitar la salida animada del que termina estando en escena (`tests/motor-escena.test.ts:148-163`, C8 del motor); reutilizar el carril libre más bajo cambia el carril de agentes nuevos, no el de los que ya están (`tests/motor-escena.test.ts:197`, C11). Quitar `sticky` del `th` de los paneles no debe tocar las tablas del resto de vistas, que siguen ancladas bajo la barra superior. Los colores nuevos del cuaderno llevan `valmen:allow-color`. Solo web estática del servidor local; sin cambio de contrato de la API.
- Impactos de sync, migración, Docker o despliegue: ninguno — solo archivos estáticos de `packages/server/web` y sus pruebas; sin sincronización, migraciones, contenedores ni despliegue.

## Plan

- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan), por la autorización APA-20261009-2cf4af creada por el PO; el PO pidió «Dale, aprueba el plan cuando llegue».
- Alcance: P1–P5 de la descripción funcional, solo en `packages/server/web` y `tests/`. Exclusiones: el lector de agentes (`packages/server/src/agentes.ts`) y la sucesión de estados, que son de BUGFIX-SERVER-AGENTES-OBSOLETOS-Y-ESTADO-WORKTREE-20261009; las pantallas del centro de control (S6); el prototipo de `.valmen/features/vista-agentes/assets/`, que no se sirve.
- Pasos ordenados:
  1. `packages/server/web/agentes/motor.js`, `actualizar`: una fila en `termino` de un agente que la escena no tiene no crea agente (el que termina estando en escena conserva su salida de `SALIDA_MS`). (C24, C25, C26, C29)
  2. `motor.js`, `actualizar`: el agente nuevo toma el carril libre más bajo entre los presentes (función `carrilLibre(escena)`) en lugar del contador `siguienteCarril`; los agentes que ya están no cambian de carril. (C27, C28)
  3. `motor.js`: nueva función pura exportada `ticketsPorEstacion(tickets, topes)` que recibe `[{ id, estado }]` y un tope numérico o uno por estación, ubica cada ticket por `ESTACIONES` (`qa_approved` en la 7; `blocked` y `changes_requested` fuera, S3) y recorta cada estación a su tope. (C1–C6)
  4. `packages/server/web/agentes/montaje.js`, `montar` y `dibujarCuadro`: guardan `datos.tickets` (arreglo vacío si no viene) y lo pasan como `estado.tickets` al `dibujar` del mundo; `reiniciar` lo vacía. (C12)
  5. `packages/server/web/index.html`, `vistaCorrida`: añade a los datos de `pintarLienzoDeAgentes` `tickets: idsDeLaCorrida(agentes, filas).map((id) => ({ id, estado: estadoDeRegistro(id, tickets) }))`, extraído a una función `ticketsDeLaEscena` para poder probarlo. (C13)
  6. `packages/server/web/agentes/mundos/invernadero.js`: `TOPE_POR_CANTERO = 9` (S1) y `plantasDelCantero(indice, n)` con hasta 9 posiciones 3×3 dentro de la tierra (x ± 40, y 310–368); `dibujar` pinta una planta a media escala (`ctx.save`/`translate`/`scale(0.5)`) por ticket de `ticketsPorEstacion(estado.tickets, 9)` y deja de pintar la planta por jardinero arrodillado (`invernadero.js:249`); la maceta en mano al caminar se conserva. (C1, C2, C7, C9, C10, C14)
  7. `packages/server/web/agentes/mundos/pasteleria.js`: `TOPE_POR_PUESTO = 6` y `TOPE_VITRINA = 9` (S1); `pastelesDelPuesto(indice, n)` con hasta 6 posiciones 2×3 dentro de x ± 50 del puesto; `dibujar` pinta un pastel por ticket de las estaciones 0–6 y la vitrina (estación 7) muestra los tickets cerrados con tope 9 en sus 3 estantes, en lugar de los seis últimos «entregados»; deja de pintar el pastel por pastelero quieto (`pasteleria.js:339-342`); el pastel en mano al caminar se conserva. (C3, C4, C5, C8, C11, C15)
  8. Quitar «Anita» (S5): `pasteleria.js` (estación «Mostrador», letrero «PO», pregunta «timbre en el mostrador», `senalDeAnita` → `senalDelMostrador`, `PALETA.anitaMostrador`/`anitaPiel` → `mostrador`/`pielDelPO`), `invernadero.js` (estación «Riego», pregunta «la regadera espera al PO»), `control.js` (franja «ESPERANDO AL PO», rótulo «PO en línea», `anitaEnLinea` → `poEnLinea`, comentarios); actualizar `tests/mundo-pasteleria.test.ts`, `tests/mundo-control.test.ts`, `tests/mundo-invernadero.test.ts` y `tests/vista-texto-pregunta.test.ts` a los textos y nombres nuevos. (C16–C20)
  9. `index.html`, CSS: regla `.corrida-panel th { position: static; }` junto a `.corrida-panel` (`index.html:2243`); la regla general de `th` (`index.html:410-424`) no cambia. (C21, C22, C23)
  10. `index.html`, CSS del invernadero (`index.html:2268-2270`): `th` con `background: transparent` y nueva regla `.corrida-paneles[data-mundo="invernadero"] .corrida-panel tbody tr:hover td` con un fondo claro del cuaderno, ambos con `valmen:allow-color`. (C31, C32, C33)
  11. `tests/mundos-correcciones.test.ts` (nuevo): C1–C13, C16, C21, C22, C24–C28, C31 y C32, con contexto de lienzo falso que registra las llamadas como `tests/mundo-control.test.ts`. (C1–C13, C16, C21, C22, C24–C28, C31, C32)
  12. Verificación: `npx vitest run` con los archivos de los criterios, `npx tsc --build tsconfig.build.json`, `revisar_presentacion` sobre los archivos tocados, y en el navegador los tres mundos con los datos reales de `/api/corrida/agentes` en tema oscuro, 30 s en el control. (C14, C15, C23, C30, C33, C34, C35)
- Impactos declarados: ninguno — sin sincronización, migración ni contenedores; solo archivos estáticos del servidor local.
- Rollback (obligatorio): `git revert` del commit del ticket en la rama; no hay datos, contratos de API ni configuración que restaurar, y el servidor sirve los estáticos del disco al recargar la pestaña.

<!-- Los criterios de la sección siguiente se numeran C1…Cn, con una afirmación verificable por criterio
     —una frase con «y» son dos criterios—, y cada uno lleva debajo su anotación de
     verificación: un comentario HTML que dice «test:» y el comando, o «verify: manual». La
     sección no lleva comentarios dentro: un comentario con anotación se leería como la de un
     criterio. Ejemplo en la skill planificacion. -->
## Criterios de aceptación

- [x] C1 (P1): con 12 tickets de la corrida en `awaiting_user_tests`, el reparto por estación del invernadero devuelve 9 tickets en la estación 5.
      <!-- test: npx vitest run tests/mundos-correcciones.test.ts -->
- [x] C2 (P1): con 8 tickets en `awaiting_user_tests`, el reparto del invernadero devuelve 8 tickets en la estación 5.
      <!-- test: npx vitest run tests/mundos-correcciones.test.ts -->
- [x] C3 (P1): con 10 tickets en `in_progress`, el reparto de la pastelería devuelve 6 tickets en la estación 4.
      <!-- test: npx vitest run tests/mundos-correcciones.test.ts -->
- [x] C4 (P1): con 12 tickets en `closed`, la vitrina de la pastelería devuelve 9 pasteles.
      <!-- test: npx vitest run tests/mundos-correcciones.test.ts -->
- [x] C5 (P1): un ticket en `qa_approved` cuenta en la estación 7.
      <!-- test: npx vitest run tests/mundos-correcciones.test.ts -->
- [x] C6 (P1): un ticket en `blocked` no cuenta en ninguna estación.
      <!-- test: npx vitest run tests/mundos-correcciones.test.ts -->
- [x] C7 (P1): las 9 posiciones de planta de un cantero quedan dentro de la tierra del cantero (x ± 40 px, y de 310 a 368).
      <!-- test: npx vitest run tests/mundos-correcciones.test.ts -->
- [x] C8 (P1): las 6 posiciones de pastel de un puesto quedan dentro de su tramo de mostrador (x ± 50 px del puesto).
      <!-- test: npx vitest run tests/mundos-correcciones.test.ts -->
- [x] C9 (P1): el dibujo del invernadero con 3 tickets en `in_progress` y ningún agente pinta 3 plantas en el cantero 4.
      <!-- test: npx vitest run tests/mundos-correcciones.test.ts -->
- [x] C10 (P1): el dibujo del invernadero con un jardinero arrodillado y ningún ticket no pinta plantas en los canteros.
      <!-- test: npx vitest run tests/mundos-correcciones.test.ts -->
- [x] C11 (P1): el dibujo de la pastelería con un pastelero quieto y ningún ticket no pinta pasteles sobre el mostrador.
      <!-- test: npx vitest run tests/mundos-correcciones.test.ts -->
- [x] C12 (P1): `montar` entrega al `dibujar` del mundo los tickets recibidos en `datos.tickets`.
      <!-- test: npx vitest run tests/mundos-correcciones.test.ts -->
- [x] C13 (P1): la vista Corrida pasa a `montar` cada ticket de `idsDeLaCorrida` con su `workflowStatus` del registro.
      <!-- test: npx vitest run tests/mundos-correcciones.test.ts -->
- [x] C14 (P1): en el navegador, el invernadero muestra en cada cantero tantas plantas como tickets de la corrida tiene esa estación, hasta 9.
      <!-- verify: manual -->
- [x] C15 (P1): en el navegador, la pastelería muestra los pasteles cerrados acumulados en la vitrina, hasta 9.
      <!-- verify: manual -->
- [x] C16 (P2): ningún archivo bajo `packages/server/web` contiene «anita», sin distinguir mayúsculas.
      <!-- test: npx vitest run tests/mundos-correcciones.test.ts -->
- [x] C17 (P2): la estación 3 de la pastelería se llama «Mostrador».
      <!-- test: npx vitest run tests/mundo-pasteleria.test.ts -->
- [x] C18 (P2): la estación 3 del invernadero se llama «Riego».
      <!-- test: npx vitest run tests/mundo-invernadero.test.ts -->
- [x] C19 (P2): con una pregunta abierta en la estación 3, la franja del control dice «ESPERANDO AL PO · LÍNEA 1 · FEATURE-WEB · ¿Apruebo el plan?».
      <!-- test: npx vitest run tests/mundo-control.test.ts -->
- [x] C20 (P2): las pruebas del texto de la pregunta pasan con los textos nuevos.
      <!-- test: npx vitest run tests/vista-texto-pregunta.test.ts -->
- [x] C21 (P3): la regla `.corrida-panel th` de `index.html` declara `position: static`.
      <!-- test: npx vitest run tests/mundos-correcciones.test.ts -->
- [x] C22 (P3): el `th` de las tablas fuera de los paneles sigue declarando `position: sticky` con `top: 51px`.
      <!-- test: npx vitest run tests/mundos-correcciones.test.ts -->
- [x] C23 (P3): en el navegador, en los tres mundos, el borde inferior del encabezado queda por encima del borde superior de la fila «Sesión principal».
      <!-- verify: manual -->
- [x] C24 (P4): `actualizar` con una fila en `termino` de un agente que la escena no conoce no lo agrega a la escena.
      <!-- test: npx vitest run tests/mundos-correcciones.test.ts -->
- [x] C25 (P4): un agente que terminó y salió de la escena no vuelve con la siguiente `actualizar` que trae su misma fila en `termino`.
      <!-- test: npx vitest run tests/mundos-correcciones.test.ts -->
- [x] C26 (P4): tras cinco ciclos de `actualizar` y 5,2 s de `avanzar` con 24 filas en `termino` y 2 vivas, la escena tiene 2 agentes que no son la principal.
      <!-- test: npx vitest run tests/mundos-correcciones.test.ts -->
- [x] C27 (P4): un agente nuevo recibe el carril libre más bajo entre los agentes presentes.
      <!-- test: npx vitest run tests/mundos-correcciones.test.ts -->
- [x] C28 (P4): con 24 filas en `termino` y 2 vivas, los dos operadores vivos del control quedan en consolas distintas (`carril % 5` distinto).
      <!-- test: npx vitest run tests/mundos-correcciones.test.ts -->
- [x] C29 (P4): un agente que pasa de `trabajando` a `termino` estando en escena sigue en ella hasta `SALIDA_MS`.
      <!-- test: npx vitest run tests/motor-escena.test.ts -->
- [x] C30 (P4): en el navegador, tras 30 s en el centro de control, ninguna consola «CERRADA» tapa a un operador que trabaja.
      <!-- verify: manual -->
- [x] C31 (P5): la regla del `th` del invernadero en `index.html` declara un fondo que no es `var(--fondo)`.
      <!-- test: npx vitest run tests/mundos-correcciones.test.ts -->
- [x] C32 (P5): la regla de fila con ratón encima del invernadero en `index.html` declara un fondo que no es `var(--panel)`.
      <!-- test: npx vitest run tests/mundos-correcciones.test.ts -->
- [x] C33 (P5): en el navegador, con el tema oscuro, ninguna fila del cuaderno del invernadero se ve con fondo oscuro.
      <!-- verify: manual -->
- [x] C34: las pruebas del motor, el lienzo y el marco responsivo pasan.
      <!-- test: npx vitest run tests/motor-escena.test.ts tests/vista-lienzo.test.ts tests/vista-marco-responsivo.test.ts tests/estaticos-web.test.ts -->
- [x] C35: la compilación termina sin errores.
      <!-- test: npx tsc --build tsconfig.build.json -->

## Puntos

```json
[]
```

## Implementación

Los doce pasos del plan, solo en `packages/server/web` y `tests/`:

- `agentes/motor.js`: `actualizar` no crea un agente que llega ya en `termino` (la principal queda fuera de la regla); `carrilLibre(escena)` da el carril libre más bajo entre los presentes; `ticketsPorEstacion(tickets, topes)` reparte y recorta (`qa_approved` en la 7; `blocked` y `changes_requested` fuera). Tipos en `motor.d.ts`.
- `agentes/montaje.js`: `montar` guarda `datos.tickets` y lo pasa como `estado.tickets`; `reiniciar` lo vacía.
- `index.html`: `ticketsDeLaEscena` y `tickets` en los datos del lienzo; `.corrida-panel th { position: static }`; en el cuaderno del invernadero `th` transparente y fondo claro en `tbody tr:hover td`, con `valmen:allow-color`.
- `mundos/invernadero.js`: `TOPE_POR_CANTERO = 9`, `plantasDelCantero`, una planta a media escala por ticket; deja de pintar la planta por jardinero. Estación 3 «Riego», pregunta «la regadera espera al PO».
- `mundos/pasteleria.js`: `TOPE_POR_PUESTO = 6`, `TOPE_VITRINA = 9`, `repartoDeLaPasteleria`, `pastelesDelPuesto`, `pastelesDeLaVitrina`; un pastel por ticket y vitrina con los cerrados; se quita `vitrina(entregados)`. «Mostrador», letrero «PO», `senalDelMostrador`, `pielDelPO`.
- `mundos/control.js`: «ESPERANDO AL PO», «PO en línea», `poEnLinea`.
- Pruebas: `tests/mundos-correcciones.test.ts` (nuevo, 23 pruebas), C29 en `tests/motor-escena.test.ts`, y los textos nuevos en `tests/mundo-pasteleria.test.ts` (C19 pasa a la vitrina de tickets), `tests/mundo-control.test.ts`, `tests/mundo-invernadero.test.ts` y `tests/vista-texto-pregunta.test.ts`.
- Sin cambios en el lector de agentes, la sucesión de estados ni las pantallas del control (S6).


## Pruebas

Directorio de ejecución: la raíz del repositorio (o del worktree). Requisitos: Node 24 y `npm install`; para `tests/interfaz-ejecutable.test.ts`, `npm run build` antes.

Comandos y resultado esperado (todos pasan):

- `npx vitest run tests/mundos-correcciones.test.ts` — 23 pruebas (C1-C13, C16, C21, C22, C24-C28, C31, C32).
- `npx vitest run tests/mundo-pasteleria.test.ts tests/mundo-invernadero.test.ts tests/mundo-control.test.ts tests/vista-texto-pregunta.test.ts` — C17-C20.
- `npx vitest run tests/motor-escena.test.ts tests/vista-lienzo.test.ts tests/vista-marco-responsivo.test.ts tests/estaticos-web.test.ts` — C29 y C34.
- `npx vitest run tests/vista-corrida.test.ts tests/interfaz-ejecutable.test.ts` — sin regresión de la vista.
- `npx tsc --build tsconfig.build.json` — C35, sin errores.
- `revisar_presentacion`: sin colores fijos que avisar. `valmen secrets`: sin secretos.

Validaciones manuales, medidas por el implementador en el navegador (servidor del worktree en 127.0.0.1:4181, tema oscuro, con las filas reales de `/api/corrida/agentes`: 25 terminados, 1 principal terminada y 2 esperando, servidas desde un servidor local de apoyo; el registro de tickets es el real):

- C14: en el invernadero, contando las llamadas de dibujo por cantero, 9 plantas en la estación 5, 9 en la 7 y 1 en la 0, coherente con los KPI (12 cerrados, más de 9 en pruebas y 1 en intake). El caso bajo el tope lo cubren las pruebas C2 y C9.
- C15: en la pastelería, 9 pasteles en la vitrina por cuadro y 6 en el puesto «Degustación».
- C23: en los tres mundos `th` queda `position: static` y su borde inferior coincide con el borde superior de la fila «Sesión principal» (sin solaparla).
- C30: en el control, 31 muestras en 31 s con 0 rótulos «CERRADA» dibujados; se ven los dos operadores en consolas distintas.
- C33: en el invernadero el fondo de `th` y de todas las celdas es transparente. El fondo de la fila con el ratón encima solo está cubierto por la prueba C32, no medido en el navegador.

Queda para el responsable: la comparación visual contra el prototipo (tamaño de las plantas y pasteles a media escala, orden de las filas) y que los defaults S1-S5 sean los que quiere.

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
    "date": "2026-10-09",
    "session_reference": null,
    "model": "claude-code/claude-sonnet-5-5",
    "reasoning_effort": null,
    "notes": "Subagente de la fase implementación de una corrida orquestada; una sola sesión para este ticket. La sesión no expone tokens ni costo, por eso no se declaran números.",
    "input_tokens": null,
    "output_tokens": null,
    "total_tokens": null,
    "estimated_cost_usd": null,
    "source": "manual:subagente de implementación sin agregado de tokens expuesto",
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
    "date": "2026-10-08",
    "at": "2026-10-09T03:32:52.271Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-08",
    "at": "2026-10-09T03:58:55.548Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-08",
    "at": "2026-10-09T04:00:46.034Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-08",
    "at": "2026-10-09T04:06:03.378Z",
    "action": "gate-approved",
    "actor": "cli",
    "details": "Gate plan aprobado por claude (recibo GR-20261009-IMPROVEMENT-WEB-MUNDOS-CORRECCIONES-20261009-plan-1, canal cli, decidida 2026-10-09T04:06:03.349Z): PO delegó en chat: \"Dale, aprueba la REVIEW con tu delegación\" y \"Dale, aprueba el plan cuando llegue\". Claude recomienda aprobar: análisis APPROVE con cascade, seis criterios en banda (0.85-0.90), las cinco causas comprobadas en código y en el navegador con datos reales, y el plan parte de causas medidas."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-08",
    "at": "2026-10-09T04:06:06.569Z",
    "action": "plan-approved",
    "actor": "cli",
    "details": "{\"actor\":\"autorización APA-20261009-2cf4af\",\"source\":\"autorizacion\",\"quote\":\"aprobación de planes y análisis de la feature vista-agentes\",\"planHash\":\"sha256:41e77dc8e33769025ce7a71cfc2930a5e0d4de89edb3c10aa54895216b7fd52b\",\"authorizationId\":\"APA-20261009-2cf4af\",\"authorizationHash\":\"sha256:f0d68588da9cc594af9adb952801aafb03f62078768f4203d65c21c14fd66be3\",\"stage\":\"plan\",\"receiptId\":\"GR-20261009-IMPROVEMENT-WEB-MUNDOS-CORRECCIONES-20261009-plan-1\",\"receiptStateHash\":\"sha256:f2ccf01b91f4d9ac6d422415c7231d41fda7008d927ede2b6d949ac3dab625c7\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-08",
    "at": "2026-10-09T04:06:10.084Z",
    "action": "plan-approval-verified",
    "actor": "cli",
    "details": "Aprobación del plan vigente: autorización APA-20261009-2cf4af (fuente autorizacion, hash sha256:f0d68588da9cc594af9adb952801aafb03f62078768f4203d65c21c14fd66be3), plan sha256:41e77dc8e33769025ce7a71cfc2930a5e0d4de89edb3c10aa54895216b7fd52b."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-08",
    "at": "2026-10-09T04:06:10.084Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-10-08",
    "at": "2026-10-09T04:06:34.049Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-10-08",
    "at": "2026-10-09T04:13:40.544Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-10-08",
    "at": "2026-10-09T04:17:36.104Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  }
]
```
