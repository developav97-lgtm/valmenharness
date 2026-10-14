---
schema_version: 2
id: FEATURE-WEB-VIVO-PROCESOS-20261014
title: Procesos con las corridas detenidas primero
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

# FEATURE-WEB-VIVO-PROCESOS-20261014

## Solicitud original

Parte del sprint: En vivo y Reglas rediseñados: marco nuevo de Agentes, Procesos con detenidas primero y Estándares por estado.
- R-MARCO-006: Cada pantalla DEBERÍA funcionar en el celular
- R-VIVO-003: Procesos DEBE poner primero las corridas detenidas que esperan a una persona
Depende de: FEATURE-WEB-MENU-GRUPOS-20261014.
Viene de una feature descompuesta en sprints; su plan completo está en el tickets.yaml de la feature.

Comportamiento esperado: Cada pantalla DEBERÍA funcionar en el celular Procesos DEBE poner primero las corridas detenidas que esperan a una persona
Comportamiento actual: la spec no lo declara; se establece en el análisis, leyendo el código.

### Fuera de alcance

Lo que el grafo asignó a otros tickets y este no hace:
- R-MARCO-006: lo cubre FEATURE-WEB-MENU-GRUPOS-20261014 (Menú por grupos con proyecto, perfil activo y Pedir un cambio)
- R-MARCO-006: lo cubre FEATURE-WEB-INICIO-DECISIONES-20261014 (Inicio con lo que espera una decisión de la persona)
- R-MARCO-006: lo cubre FEATURE-WEB-AJUSTES-MODELOS-20261014 (Vista Modelos con perfil activo, roles agrupados y aviso de cliente)
- R-MARCO-006: lo cubre FEATURE-WEB-AJUSTES-CAMBIAR-PERFIL-20261014 (Cambiar de perfil con vista previa de lo que cambia)
- R-MARCO-006: lo cubre FEATURE-WEB-AJUSTES-PROVEEDORES-20261014 (Proveedores con estado y uso por el perfil activo)
- R-MARCO-006: lo cubre FEATURE-WEB-AJUSTES-PROYECTO-20261014 (Proyecto con bloques e interruptores y YAML en Avanzado)
- R-MARCO-006: lo cubre FEATURE-WEB-TRABAJO-TICKETS-20261014 (Tickets y detalle con filtro por turno y ciclo de ocho pasos)
- R-MARCO-006: lo cubre FEATURE-WEB-TRABAJO-FEATURES-20261014 (Features con estado y tablero de recorrido y siguiente paso)
- R-MARCO-006: lo cubre FEATURE-WEB-TRABAJO-PORTAFOLIO-20261014 (Portafolio con una tarjeta por proyecto)
- R-MARCO-006: lo cubre FEATURE-WEB-VIVO-AGENTES-20261014 (Agentes con titular, pregunta pendiente y selector de mundo)
- R-MARCO-006: lo cubre FEATURE-WEB-REGLAS-ESTANDARES-20261014 (Estándares separados en vigor, propuestos y descartados)

### Referencias de diseño

Adjuntos que citan los requisitos de este ticket. Se construye y se valida contra el original, no contra el texto de la spec:
- `.valmen/features/rediseno-mission-control/assets/procesos.html` — Boceto aprobado por el PO el 2026-10-14: Procesos (HTML autónomo, el original) (sha256 13eb0c6c0950…)
- `.valmen/features/rediseno-mission-control/assets/procesos.png` — Captura a 1440 px del boceto aprobado: Procesos (sha256 67b45c748199…)

### Supuestos y decisiones pendientes

<!-- Si el pedido nombra algo que el código no tiene —parámetro, permiso,
campo, bandera, columna, migración— y no lo especifica, listá cada elemento
con su pregunta antes de avanzar a análisis; el análisis no planifica sobre
la adivinanza. Si no hay ninguno, escribí «Ninguno» y seguí. -->
Ninguno.

## Descripción funcional

- Alcance: la vista En vivo › Procesos (`vistaProcesos` y su aprobación `aprobarGate` en `packages/server/web/index.html`) y la proyección de solo lectura que la alimenta (`listProcessRows` y `listRunRows` en `packages/server/src/processes.ts`, servida por `GET /api/processes`). Se reemplaza su aspecto por el del boceto aprobado `.valmen/features/rediseno-mission-control/assets/procesos.html` (captura `procesos.png`) y se cumple R-VIVO-003 (`.valmen/features/rediseno-mission-control/spec/s4-vivo-reglas/spec.md:39-52`) y la parte de Procesos de R-MARCO-006. Fuera de alcance: el menú lateral y la cabecera común (FEATURE-WEB-MENU-GRUPOS-20261014), las demás vistas del mismo `index.html`, el motor de procesos (`packages/engine`) y cualquier ruta nueva del servidor.
- Usuario o rol afectado: el PO o responsable que tiene que aprobar un paso humano de un proceso (el despliegue con frase literal) o lanzar uno, en el escritorio y en el celular.
- Comportamiento actual: la vista pinta cuatro cifras (Procesos, Detenidos, Gates sin aprobar, Corridas), un campo «Responsable de las aprobaciones», una tabla «Gates de proceso» con un botón «Aprobar» por gate, una tabla «Corridas» (las detenidas primero, como fila) y una tabla «Procesos» con la cuenta de pasos, los nombres de parámetros, los gates y el archivo. No muestra los pasos de una corrida ni cuál es el actual, no marca qué pasos aprueba una persona, y el botón «Aprobar» manda solo el responsable: el gate `deploy`, que exige corrida y frase literal, **no se puede aprobar desde la pantalla** (reproducido: `POST /api/processes/gates/deploy/approve {actor}` devuelve 400 «exige una frase y se aprueba para una corrida: falta --run <corrida>»).
- Comportamiento esperado (boceto): cabecera «En vivo · Procesos», título «Procesos: despliegues y tareas de varias etapas» y la bajada. Primero, **un bloque ámbar por corrida detenida** «Detenido: espera tu aprobación» con `proceso · vversión`, sus pasos en orden (hechos con ✓ en verde, el actual en ámbar con `aria-current="step"`, los que faltan atenuados), el campo para escribir la aprobación y las acciones «Aprobar despliegue» y «Ver dry-run»; aprobar sigue exigiendo responsable y la frase literal, y el botón no avanza sin ella (escenario de R-VIVO-003). Debajo, «Procesos del proyecto»: una tarjeta por proceso declarado con su título, su id, sus pasos —los que aprueba una persona en ámbar—, «Pide: …» con sus parámetros y las acciones «Ejecutar» e «Historial». Al final, un bloque plegado «Más detalle» conserva todo lo que la vista mostraba hasta hoy —las cifras, la tabla «Gates de proceso» con su botón de aprobar, la tabla de corridas y la de procesos—, para no perder funcionalidad. En el celular todo cabe en una columna sin desplazamiento horizontal.

## Diagnóstico

- Causa comprobada (con `ruta:línea`): no es solo una funcionalidad que falta; hay un defecto que la pantalla nueva tiene que resolver.
  - Defecto, reproducido: `packages/server/web/index.html:8545` (`aprobarGate`) envía `{ actor }` y nada más. El gate `deploy` declara `require_phrase: "APROBAR DEPLOY v{version}"` (`.valmen/gates/deploy.yaml:8`) y `approveGate` exige entonces la corrida y la frase exacta resuelta con sus parámetros (`packages/engine/src/run-state.ts:393-415`), así que el botón «Aprobar» de la pantalla falla siempre para el despliegue. Reproducción con `packages/server/dist/server.js` sobre una copia de `.valmen/processes/` y `.valmen/gates/deploy.yaml` en un directorio temporal y una corrida `waiting` en `gate-deploy`: respuesta 400 con «El gate "deploy" exige una frase y se aprueba para una corrida: falta --run <corrida>.». La ruta ya acepta `run` y `phrase` (`packages/server/src/server.ts:724-775`); lo que falta es que la pantalla los mande.
  - Defecto: `packages/server/src/processes.ts:147` (`listGateRows`) pregunta `gateApproved(root, gate)` sin corrida; para un gate con frase eso devuelve siempre `null` (`packages/engine/src/run-state.ts:329-345`), así que la tabla «Gates de proceso» dice «sin aprobar» aunque la corrida ya tenga su aprobación válida.
  - Falta la forma del boceto: `packages/server/web/index.html:9383-9571` (`vistaProcesos`) pinta cifras genéricas (`index.html:9390-9404`), la barra del responsable (`index.html:9407-9424`), la tabla de gates (`index.html:9441-9489`), la de corridas (`index.html:9491-9539`) y la de procesos (`index.html:9541-9570`). No hay bloque por corrida detenida ni tarjeta por proceso.
  - Faltan datos en la proyección: `packages/server/src/processes.ts:76` entrega `steps` como **número**, aunque la definición trae por paso `id`, `title`, `kind` y `target` (`packages/core/src/process.ts:85-91`); sin la lista no se pueden pintar los pasos ni marcar en ámbar los `kind: gate`. `processes.ts:77-79` entrega los parámetros como nombres con asterisco, sin la descripción que el YAML declara (`packages/core/src/process.ts:75-82`, `.valmen/processes/deploy.yaml:7-16`), que es lo que el boceto llama «Pide: …». `processes.ts:116-130` (`listRunRows`) no dice qué gate espera la corrida, qué frase exige ni si ya está aprobada para ella, y quita de cada paso su `detail` (el comando ya sustituido, `packages/engine/src/run-state.ts:57-60`).
- Hipótesis pendientes:
  - H1 (se decide en el plan, verificable con prueba): los campos nuevos de la proyección deben ser **aditivos** —`steps` sigue siendo el número— porque `tests/processes-view.test.ts:95` afirma `expect(deploy.steps).toBe(2)`; cambiar su tipo pondría en rojo una prueba existente.
  - H2: la frase que la pantalla muestra se resuelve en el servidor con `readRequiredPhrase` (exportada, `packages/engine/src/run-state.ts:288`) y los parámetros de la corrida; `resolverFrase` no está exportada (`run-state.ts:305`), así que la proyección hace su propia sustitución tolerante (deja `{x}` si falta el parámetro) solo para mostrar: quien valida sigue siendo `approveGate`.
  - H3: «Ver dry-run» no puede mostrar la salida del paso: el motor no la guarda a propósito (`packages/engine/src/run-state.ts:20-24`); solo el comando ejecutado (`detail`), su estado y su hora.
  - H4: «Ejecutar» no puede lanzar el proceso desde la pantalla: el servidor no tiene ruta para eso (`packages/server/src/server.ts:703-775` solo lista y aprueba; `tests/api-rutas.test.ts:59` declara solo la aprobación) y este ticket no ejecuta ni despliega nada; lo conservador es mostrar el comando `valmen process run` para la terminal.
  - H5: con los datos reales del repositorio no hay corridas (`.valmen/processes/runs/` no existe), así que el bloque ámbar solo se ve con una corrida de laboratorio; la verificación en el navegador usa una copia temporal con una corrida `waiting` escrita con `writeRun`, sin ejecutar ningún paso.
- Consumidores afectados:
  - `GET /api/processes` (`packages/server/src/server.ts:703-720`): lo consumen solo `vistaProcesos` (`index.html:9387`) y las pruebas `tests/processes-view.test.ts` y `tests/api-rutas.test.ts`; `listProcessRows`/`listRunRows` no tienen otros usuarios (`packages/server/src/server.ts:160-161`). El portafolio cuenta las detenidas con `waitingRuns` del motor (`packages/server/src/portafolio.ts:140`), no con esta proyección.
  - `POST /api/processes/gates/:gate/approve` (`server.ts:724-775`): la pantalla la sigue llamando con su ruta declarada (`tests/api-rutas.test.ts:59`), ahora con `run` y `phrase`; sin ruta nueva.
  - Simulacro de `scripts/verificar-interfaz.mjs:525-531`: responde `/api/processes` sin `gates` y sin los campos nuevos; la vista tiene que pintarse igual. `scripts/verificar-interfaz.mjs:788` recorre `#/procesos` en `VISTAS`.
  - `tests/escrituras-autenticadas.test.ts:57` usa la ruta de aprobación con token; no cambia.
- Archivos y flujo investigados: `packages/server/web/index.html` (`aprobarGate` 8523-8558, `responsable`/`guardarResponsable` 4308-4314, `api`/`enviar` 4144-4180, `vistaProcesos` 9383-9571, `TITULOS` 12795, enrutado 13035, tokens de color 76-147 con su versión clara, el patrón de Portafolio `.port-*` 526-740); `packages/server/src/processes.ts` (completo); `packages/server/src/server.ts:703-775`; `packages/engine/src/run-state.ts` (estado, `gateApproved`, `readRequiredPhrase`, `approveGate`); `packages/engine/src/process.ts:600-700` y `940-985` (cómo se detiene una corrida en un gate: solo los `kind: gate` dejan `waiting`); `packages/core/src/process.ts:40-151`; `.valmen/processes/deploy.yaml`, `.valmen/processes/actualizar-manuales.yaml`, `.valmen/gates/deploy.yaml`; `tests/processes-view.test.ts`, `tests/api-rutas.test.ts`, `tests/portafolio-vista.test.ts` (patrón de prueba de interfaz con `ejecutarInterfaz`); `scripts/verificar-interfaz.mjs`; el boceto `.valmen/features/rediseno-mission-control/assets/procesos.html` y su captura `procesos.png`. Memoria: `valmen memory search "vista Procesos corridas detenidas aprobación"` no trae antecedentes de esta vista (AP-003, AP-007, AP-009 y AP-014 son de compuertas de ticket); AP-003 recuerda que el alcance lo fija el grafo, y este ticket se limita a la parte de Procesos.
- Riesgos y compatibilidad:
  - Aprobar es una escritura con efecto en un despliegue: la pantalla no debe relajar nada. El responsable sigue obligatorio, la frase la valida el motor (`run-state.ts:410-415`), el botón queda deshabilitado mientras la frase escrita no coincida, y aprobar **no retoma** la corrida (`server.ts:724-728`): la pantalla lo dice y da el comando `valmen process resume`.
  - Colisión de nombres en `index.html`: otros tickets editan otras vistas del mismo archivo en paralelo; todo ayudante, constante o clase nueva lleva el prefijo `procesos…`/`.proc-…`, y `aprobarGate`/`responsableDeAprobacion` (solo los usa esta vista) se renombran con ese prefijo. Ningún `<` seguido de `!--` literal dentro del script.
  - Pruebas existentes: `tests/processes-view.test.ts` y `tests/api-rutas.test.ts` no se editan; si una se pone en rojo, se detiene y se reporta.
  - Lo que el boceto muestra y los datos no dan: la salida del dry-run (H3), lanzar el proceso (H4), los nombres cortos de los pasos (el YAML trae títulos largos) y una frase libre (el motor exige la exacta). Se recortan con decisión registrada, sin inventar datos.
- Impactos de sync, migración, Docker o despliegue: ninguno; cambia una vista web local y una proyección de lectura del servidor de Mission Control, sin datos sincronizados, sin migración y sin contenedores. La vista ayuda a aprobar el gate humano de un despliegue, pero no despliega ni ejecuta nada: la aprobación la registra el motor existente y el proceso solo sigue con `valmen process resume` desde la terminal.

## Plan

- Gate de plan y aprobación: pendiente; la compuerta `plan` se evalúa con `--evaluator cascade` y la aprobación es de la política por defecto o de una persona, no de este agente.
- Alcance: `vistaProcesos` y sus ayudantes y estilos nuevos en `packages/server/web/index.html`; campos nuevos y aditivos en `listProcessRows` y `listRunRows` de `packages/server/src/processes.ts`. Exclusiones: el menú, las demás vistas, el motor (`packages/engine`), `packages/server/src/server.ts` y `tests/api-rutas.test.ts` sin cambios; ninguna ruta nueva; nada se ejecuta ni se despliega.
- Pasos ordenados:
  1. Pruebas primero, vistas en rojo antes de tocar el código. `tests/procesos-detenidas.test.ts` (servidor, laboratorio en carpeta temporal con `deploy.yaml`, `actualizar-manuales.yaml` y `gates/deploy.yaml` con `require_phrase`, corridas escritas con `writeRun` y aprobaciones con `approveGate`) para la parte de servidor de C4, C6, C8, C9, C10 y C11: `stepList`, `paramList`, `pendingGate`, `requiredPhrase` («APROBAR DEPLOY v0.4.0»), `gateApprovedBy` y `detail`. `tests/procesos-vista.test.ts` (interfaz con `ejecutarInterfaz` y `disparar` de `scripts/verificar-interfaz.mjs`, respuesta simulada de `/api/processes` con dos procesos y corridas `waiting`) para C2 a C14, C16, C19 y C20; el caso de C4 busca el `li` del paso «Aprobación humana del despliegue» y comprueba que lleva `aria-current="step"` y que ningún otro paso del bloque lo lleva; entre sus casos, uno escribe una frase distinta y comprueba que el botón sigue deshabilitado y que no hubo `POST` (C5), y otro escribe responsable y la frase exacta, pulsa el botón y comprueba el cuerpo del `POST` (C6). Comando: `npx vitest run tests/procesos-detenidas.test.ts tests/procesos-vista.test.ts` (C2, C3, C4, C5, C6, C7, C8, C9, C10, C11, C12, C13, C14, C16, C19, C20).
  2. `packages/server/src/processes.ts`: `ProcessRow` gana `stepList` (`id`, `title`, `kind`, `gate` —el `target` solo si `kind` es `gate`—, en orden) y `paramList` (`name`, `required`, `description`, `default`); `steps` y `params` quedan como están (H1). `RunRow` gana `pendingGate` (el gate del paso pendiente si es `kind: gate`, si no `null`), `requiredPhrase` (`readRequiredPhrase` resuelta con los parámetros de la corrida por un ayudante `processPhraseFor`, tolerante a parámetros que faltan; `null` si el gate no la exige), `gateApprovedBy` (`gateApproved(root, gate, { runId, params })?.actor ?? null`) y `detail` en cada paso. `GateRow` gana `requiresPhrase` (`readRequiredPhrase(root, gate) !== null`), para que «Más detalle» no ofrezca un botón que el motor rechaza. Un proceso inválido da `stepList` y `paramList` vacíos (C1, C4, C6, C8, C9, C10, C11, C20).
  3. `packages/server/web/index.html`, vista y ayudantes con prefijo propio: `procesosAprobar(corrida, …)` reemplaza a `aprobarGate` y manda `POST` a la ruta ya declarada `/api/processes/gates/${gate}/approve` con `{ actor, run, phrase, reason }`; `procesosResponsable()` reemplaza a `responsableDeAprobacion`; `procesosBloqueDetenida(corrida, proceso)` pinta el bloque ámbar (título, `proceso · vversión`, pasos con `procesosPasos(stepList, corrida)` —una `ol` con un `li` por paso: `✓` y clase `proc-paso-hecho` si su `id` está en `corrida.steps` con estado `ok`; clase `proc-paso-actual` y `li.setAttribute("aria-current", "step")` solo en el paso cuyo `id` es `corrida.pendingStep`; sin marca los que faltan—, campo «Responsable», campo de la aprobación, «Aprobar despliegue»/«Aprobar», «Ver dry-run» con su panel plegable y el aviso de resultado), o, si `gateApprovedBy` ya está, «Aprobado por … · falta retomar» con `valmen process resume <corrida>` y sin campo; `procesosTarjeta(proceso, corridas)` pinta la tarjeta (título, id, pasos con los `gate` en ámbar, «Pide: …» con `procesosPide`, «Ejecutar» que despliega `procesosComando(proceso)` y «Historial» que despliega las corridas de ese proceso); `vistaProcesos` pinta cabecera, los bloques de todas las corridas `waiting` antes de «Procesos del proyecto» o la línea neutra «Nada detenido…» si no hay ninguna, las tarjetas y, al final, `procesosMasDetalle(datos)`: un `details` cerrado con el `summary` «Más detalle» que conserva las cifras, la tabla «Gates de proceso», la tabla «Corridas» y la tabla «Procesos» de la vista anterior; en la tabla de gates, un gate sin frase exigida conserva su botón «Aprobar» (envía `{ actor }`, como hoy) y uno con `requiresPhrase` muestra «Se aprueba en su corrida detenida, con la frase» en lugar del botón que hoy falla. El botón de aprobar del bloque queda `disabled` hasta que haya responsable y la frase escrita sea exactamente `requiredPhrase` (o, sin frase exigida, algún texto), y el clic vuelve a comprobarlo antes de enviar. Tolera respuestas sin `stepList`, `paramList`, `gates` ni los campos nuevos de la corrida (el simulacro del verificador). Ningún `<` seguido de `!--` literal en el script (C2, C3, C4, C5, C6, C7, C8, C9, C10, C11, C12, C13, C14, C15, C19, C20).
  4. Estilos `.proc-*` en el bloque de estilos de `index.html`, solo con tokens (`--panel`, `--fondo-2`, `--borde`, `--persona`, `--alerta-suave`, `--ok`, `--tenue`, `--tenue-deco`, `--acento`, `--fuente-titulo`, `--mono`, `--sobre-acento`): bloque con borde ámbar, pasos como fichas que envuelven, rejilla de tarjetas `repeat(auto-fit, minmax(min(100%, 380px), 1fr))`, campo y botones que bajan de línea, y título a menor tamaño por debajo de 480 px (C16, C17, C18).
  5. Regresión sin editar pruebas existentes: `npx vitest run tests/processes-view.test.ts tests/process-gates.test.ts tests/api-rutas.test.ts tests/escrituras-autenticadas.test.ts tests/menu-grupos.test.ts tests/interfaz-ejecutable.test.ts`, `npm run build` y `node scripts/verificar-interfaz.mjs` («Interfaz verificada.») (C1, C15). Si una prueba existente se pone en rojo, se detiene la implementación y se reporta en el ticket.
  6. Verificación en el navegador con el servidor de Mission Control sobre una copia temporal del proyecto con una corrida `deploy` `waiting` en `gate-deploy` escrita con `writeRun` (ningún paso se ejecuta): a 1440 px contra `procesos.png` y a 375 px sin desplazamiento horizontal, en oscuro y claro; `revisar_presentacion` sobre el cambio; se cierran el servidor y el navegador al terminar (C17, C18).
- Respuesta al diagnóstico:
  - Defecto «la pantalla aprueba solo con el responsable» (`packages/server/web/index.html:8545`, `.valmen/gates/deploy.yaml:8`, `packages/engine/src/run-state.ts:393-415`, `packages/server/src/server.ts:724-775`) → paso 2 (`requiredPhrase`, `pendingGate`) y paso 3 (`procesosAprobar` con `run` y `phrase`, botón deshabilitado sin frase) → C5, C6, C7.
  - Defecto «`listGateRows` pregunta sin corrida y un gate con frase sale siempre sin aprobar» (`packages/server/src/processes.ts:147`, `packages/engine/src/run-state.ts:329-345`) → paso 2 (`gateApprovedBy` por corrida, `requiresPhrase` por gate) y paso 3 (estado «Aprobado por … · falta retomar» en el bloque; en «Más detalle», un gate con frase remite a su corrida en vez de ofrecer un botón que falla) → C8, C19, C20 → D9.
  - Hallazgo «la vista no tiene bloque por corrida detenida ni tarjeta por proceso» (`packages/server/web/index.html:9383-9571`, cifras `9390-9404`, tablas `9441-9489`, `9491-9539`, `9541-9570`) → paso 3 (reescritura de `vistaProcesos`, `procesosPasos` con `aria-current="step"` en el paso pendiente, y lo anterior conservado en «Más detalle») y paso 4 (estilos) → C2, C3, C4, C10, C14, C16, C18, C19 → D8, D9.
  - Hallazgo «`steps` es un número» (`packages/server/src/processes.ts:76`, `packages/core/src/process.ts:85-91`) → paso 2 (`stepList`) y paso 3 (`procesosPasos`, ámbar en `kind: gate`) → C4, C10 → D1.
  - Hallazgo «los parámetros no traen su descripción» (`packages/server/src/processes.ts:77-79`, `packages/core/src/process.ts:75-82`) → paso 2 (`paramList`) y paso 3 (`procesosPide`, `procesosComando`) → C11, C12 → D11.
  - Hallazgo «la corrida no trae el comando de cada paso» (`packages/server/src/processes.ts:116-130`, `packages/engine/src/run-state.ts:57-60`) → paso 2 (`detail`) y paso 3 («Ver dry-run») → C9 → D5.
  - Hipótesis H1, `steps` sigue siendo número (`tests/processes-view.test.ts:95`) → paso 2 (campos aditivos) y paso 5 (la prueba corre sin editarse) → C1.
  - Hipótesis H2, `resolverFrase` no exportada (`packages/engine/src/run-state.ts:288`, `run-state.ts:305`) → paso 2 (`processPhraseFor`, solo para mostrar; valida el motor) → C6.
  - Hipótesis H3, la salida no se guarda (`packages/engine/src/run-state.ts:20-24`) → paso 3 («Ver dry-run» con comando, estado y hora) → C9 → D5.
  - Hipótesis H4, sin ruta para ejecutar (`packages/server/src/server.ts:703-775`, `tests/api-rutas.test.ts:59`) → paso 3 («Ejecutar» despliega el comando, sin pedido al servidor) → C12 → D6.
  - Hipótesis H5, sin corridas reales (`.valmen/processes/runs/` no existe) → paso 3 (línea «Nada detenido…») y paso 6 (corrida de laboratorio en copia temporal) → C14, C17, C18 → D8.
  - Consumidor «simulacro del verificador sin campos nuevos» (`scripts/verificar-interfaz.mjs:525-531`, `scripts/verificar-interfaz.mjs:788`) → paso 3 (tolerancia) y paso 5 → C15.
  - Consumidor «historial de corridas» (`packages/server/src/processes.ts:108-131`) → paso 3 («Historial» por proceso) → C13 → D7.
  - Riesgo «colisión de nombres en `index.html`» → pasos 3 y 4 (prefijos `procesos…` y `.proc-…`) y paso 5 (`node scripts/verificar-interfaz.mjs`) → C15.
  - Riesgo «compatibilidad hacia atrás: la vista pierde lo que hoy muestra» (cifras `packages/server/web/index.html:9390-9404`, gates con aprobación sin corrida `9441-9489`, corridas `9491-9539`, procesos `9541-9570`) → paso 3 (`procesosMasDetalle`) → C19, C20 → D9.
  - Riesgo «aprobar relaja el gate» (`packages/engine/src/run-state.ts:410-415`, `packages/server/src/server.ts:724-728`) → paso 3 (responsable obligatorio, frase exacta, no retoma) → C5, C7, C8.
- Diferencias con el boceto (cada una registrada con `valmen agent-decision`):
  - D1 Los pasos usan el `title` real del YAML («Dry-run de lo que entra en la release», «Tag anotado de la release»…), en el bloque y en la tarjeta; el boceto abrevia («Dry-run», «Tag»).
  - D2 El campo de la aprobación pide la frase **exacta** que el gate exige («APROBAR DEPLOY v0.4.0», como `placeholder` y en la etiqueta), no una frase libre; en un gate sin frase exigida sí se escribe con las propias palabras y viaja como `reason`.
  - D3 El bloque añade un campo «Responsable» (el mismo valor recordado de las otras aprobaciones): aprobar sin nombre no es auditable (`packages/engine/src/run-state.ts:389-391`).
  - D4 El botón dice «Aprobar despliegue» cuando el gate es `deploy`; en otro gate, «Aprobar».
  - D5 «Ver dry-run» despliega los pasos ya ejecutados con su comando, estado y hora; la salida no se muestra porque el motor no la guarda.
  - D6 «Ejecutar» despliega el comando `valmen process run <id> --<param> <valor>` para la terminal; la pantalla no lanza procesos.
  - D7 «Historial» despliega las corridas registradas de ese proceso (estado, corrida, pasos hechos y fecha) o «Sin corridas registradas».
  - D8 Sin corridas detenidas no se pinta el bloque ámbar: una línea neutra dice «Nada detenido: ninguna corrida espera tu aprobación.»; la nota «Cifras y versión de ejemplo en este boceto.» no se pinta.
  - D9 Las cuatro cifras, la tabla «Gates de proceso» con su botón de aprobar (aprobar un gate sin corrida detenida), la tabla de corridas y la de procesos **se conservan** dentro de un bloque plegado «Más detalle» debajo de las tarjetas, que el boceto no dibuja; en esa tabla, un gate que exige frase remite a su corrida detenida en vez de ofrecer el botón que hoy falla (sustituye a la decisión D-009, que las quitaba).
  - D10 El subtítulo del bloque es `proceso · v<versión>` cuando la corrida tiene `version`; sin ella, `proceso · <corrida>`.
  - D11 «Pide: …» se arma con la descripción de cada parámetro y marca «(opcional)» los no obligatorios; sin parámetros, «No pide parámetros».
  - D12 Un proceso inválido se pinta como tarjeta con su error y sin «Ejecutar».
- Impactos declarados: ninguno; sin sincronización, sin migración y sin contenedores.
- Tamaño previsto: unas 870 líneas añadidas y borradas (unas 500 de producción —60 en `processes.ts`, unas 250 de vista y 130 de estilos nuevos en `index.html`, y unas 60 que se reordenan de la vista vieja dentro de «Más detalle»— y unas 370 de pruebas), 20 criterios.
- Si excede el tope: sigue: el único corte con código y pruebas propias sería proyección por un lado y vista por otro, y dejaría una proyección sin consumidor y una vista que no puede pintar el boceto hasta que llegue la otra; el tope de `delivery-budget` es orientativo (avisa y no bloquea, `.valmen/config.yaml:32-33`), y parte de las líneas son la vista vieja que se reubica en «Más detalle».
- Rollback (obligatorio): revertir el commit del ticket en la rama (`git revert <hash>`); no hay datos, migraciones ni configuración que deshacer, los campos nuevos de `/api/processes` son aditivos y las aprobaciones hechas desde la pantalla quedan en `.valmen/gates/approvals.json` igual que las de la terminal.

## Criterios de aceptación

- [x] C1 (regresión): `tests/processes-view.test.ts` sigue en verde sin editarse.
      <!-- test: npx vitest run tests/processes-view.test.ts tests/process-gates.test.ts -->
- [x] C2 (R-VIVO-003): Procesos pinta el título «Procesos: despliegues y tareas de varias etapas».
      <!-- test: npx vitest run tests/procesos-vista.test.ts -->
- [x] C3 (R-VIVO-003): cada corrida detenida se pinta en su propio bloque «Detenido: espera tu aprobación» antes de «Procesos del proyecto».
      <!-- test: npx vitest run tests/procesos-vista.test.ts -->
- [x] C4 (R-VIVO-003, escenario «Despliegue esperando aprobación»): una corrida de `deploy` detenida en `gate-deploy` marca «Aprobación humana del despliegue» como paso actual con `aria-current="step"`.
      <!-- test: npx vitest run tests/procesos-detenidas.test.ts tests/procesos-vista.test.ts -->
- [x] C5 (R-VIVO-003, escenario «Despliegue esperando aprobación»): el botón de aprobar no envía nada mientras la frase escrita no sea la exigida.
      <!-- test: npx vitest run tests/procesos-vista.test.ts -->
- [x] C6 (R-VIVO-003): con responsable más la frase exigida («APROBAR DEPLOY v0.4.0»), aprobar envía `POST /api/processes/gates/deploy/approve` con el cuerpo `{ actor, run, phrase }`.
      <!-- test: npx vitest run tests/procesos-detenidas.test.ts tests/procesos-vista.test.ts -->
- [x] C7 (R-VIVO-003): sin responsable, aprobar no envía ningún pedido.
      <!-- test: npx vitest run tests/procesos-vista.test.ts -->
- [x] C8 (R-VIVO-003): una corrida ya aprobada para su gate muestra el comando `valmen process resume <corrida>` en lugar del campo de aprobación.
      <!-- test: npx vitest run tests/procesos-detenidas.test.ts tests/procesos-vista.test.ts -->
- [x] C9 (R-VIVO-003): «Ver dry-run» despliega los pasos ya ejecutados con su comando.
      <!-- test: npx vitest run tests/procesos-detenidas.test.ts tests/procesos-vista.test.ts -->
- [x] C10 (R-VIVO-003): cada proceso declarado se pinta como tarjeta con sus pasos `kind: gate` en ámbar.
      <!-- test: npx vitest run tests/procesos-detenidas.test.ts tests/procesos-vista.test.ts -->
- [x] C11 (R-VIVO-003): la tarjeta dice «Pide: …» con las descripciones de los parámetros del proceso.
      <!-- test: npx vitest run tests/procesos-detenidas.test.ts tests/procesos-vista.test.ts -->
- [x] C12 (R-VIVO-003): «Ejecutar» despliega el comando `valmen process run <id>` con sus parámetros sin enviar ningún pedido de escritura.
      <!-- test: npx vitest run tests/procesos-vista.test.ts -->
- [x] C13 (R-VIVO-003): «Historial» despliega las corridas registradas de ese proceso.
      <!-- test: npx vitest run tests/procesos-vista.test.ts -->
- [x] C14 (R-VIVO-003): sin corridas detenidas, la vista dice «Nada detenido».
      <!-- test: npx vitest run tests/procesos-vista.test.ts -->
- [x] C15 (regresión): la interfaz carga todas sus vistas con la respuesta sin campos nuevos del simulacro.
      <!-- test: node scripts/verificar-interfaz.mjs -->
- [x] C16 (R-MARCO-006): la rejilla de tarjetas de Procesos acota sus columnas con `minmax(min(100%, 380px), 1fr)`.
      <!-- test: npx vitest run tests/procesos-vista.test.ts -->
- [x] C17 (R-MARCO-006): a 375 px de ancho Procesos se lee sin desplazamiento horizontal con una corrida detenida en pantalla.
      <!-- verify: manual -->
- [x] C18 (R-VIVO-003): a 1440 px Procesos coincide con `.valmen/features/rediseno-mission-control/assets/procesos.png` salvo las diferencias D1 a D12 del plan.
      <!-- verify: manual -->
- [x] C19 (compatibilidad): debajo de las tarjetas, un bloque plegado «Más detalle» conserva las cifras con las tres tablas de la vista anterior.
      <!-- test: npx vitest run tests/procesos-vista.test.ts -->
- [x] C20 (compatibilidad): en «Más detalle», aprobar un gate sin frase exigida envía `POST /api/processes/gates/<gate>/approve` con el responsable.
      <!-- test: npx vitest run tests/procesos-detenidas.test.ts tests/procesos-vista.test.ts -->

## Puntos

```json
[]
```

## Implementación

- Modo: harness completo (FEATURE de servidor y vista), plan aprobado por el revisor (recibo `GR-20261014-FEATURE-WEB-VIVO-PROCESOS-20261014-plan-2`, autorización POLITICA-POR-DEFECTO).
- Paso 1, pruebas primero: `tests/procesos-detenidas.test.ts` (8 casos) y `tests/procesos-vista.test.ts` (15 casos) se vieron en rojo antes de tocar el código (8 y 15 fallos, por campos `undefined` y por la vista vieja) y en verde después.
- Paso 2: `packages/server/src/processes.ts` añade, sin cambiar lo que había, `ProcessStepRow`, `ProcessParamRow`, `ProcessRow.stepList`, `ProcessRow.paramList`, `RunRow.pendingGate`, `RunRow.requiredPhrase`, `RunRow.gateApprovedBy`, `detail` en cada paso de la corrida, `GateRow.requiresPhrase` y el ayudante `processPhraseFor` (solo para mostrar la frase; la valida `approveGate`). `steps` y `params` siguen siendo la cuenta y los nombres. `server.ts` no cambia y no hay ruta nueva.
- Paso 3: `packages/server/web/index.html` reemplaza `vistaProcesos`, `aprobarGate` y `responsableDeAprobacion` por `procesosAviso`, `procesosResponsable`, `procesosRutaDeAprobar`, `procesosPlegable`, `procesosPasos` (pone `aria-current="step"` solo en el paso `pendingStep`), `procesosPasosDe`, `procesosPide`, `procesosComando`, `procesosPuedeAprobar`, `procesosAprobar`, `procesosBloqueDetenida`, `procesosFilaDeCorrida`, `procesosTarjeta`, `procesosAprobarGate`, `procesosTabla` y `procesosMasDetalle`. La aprobación del bloque envía `{ actor, run, phrase, reason }` a la ruta ya declarada `POST /api/processes/gates/:gate/approve`, armada por concatenación y sin plantilla con acento grave (instrucción del orquestador); el botón queda deshabilitado hasta tener responsable y la frase exacta, y el clic vuelve a comprobarlo. «Más detalle» (`details` cerrado) conserva las cifras, el responsable, la tabla de gates —con «Aprobar» en los gates sin frase y «Se aprueba en su corrida detenida, con la frase» en los que la exigen—, la de corridas y la de procesos. Sin `<` seguido de `!--` dentro del script.
- Paso 4: estilos `.proc-*` solo con tokens; la revisión de colores fijos (`scanPendingColors`, la de `revisar_presentacion`) dice «nada que avisar».
- Paso 5: ninguna prueba existente se editó ni quedó en rojo. Una corrida conjunta mostró un fallo intermitente en `tests/interfaz-ejecutable.test.ts` («se ejecuta sin errores y pinta la vista del ticket»), que no toca Procesos: pasó sola y en las dos repeticiones del mismo conjunto (127/127), y en la corrida de las 29 pruebas de interfaz juntas.
- Paso 6: verificación en Chrome sin pantalla por CDP contra `valmen serve --port 4791` del worktree, arrancado sobre una **copia temporal** del registro (procesos, `gates/deploy.yaml` y `config.yaml` copiados, más una corrida `deploy` `waiting` en `gate-deploy` escrita con `writeRun`); no se ejecutó ni desplegó nada y `.valmen/` real no se tocó.
- Desvío de tamaño: el plan preveía unas 870 líneas y la entrega tiene unas 1.540 (`processes.ts` +108/−15, `index.html` +718/−204 —unas 270 son estilos con una propiedad por línea, y unas 190 son la vista vieja reubicada en «Más detalle»—, y 491 de pruebas). Supera `delivery-budget` (600) sin cambiar el alcance; se informa para quien integra.
- Diferencias con el boceto: D-001 a D-008 y D-010 a D-012, más D-013 (que sustituye a D-009: lo anterior se conserva en «Más detalle»), registradas con `valmen agent-decision`; la persona las ratifica antes de cerrar.

## Pruebas

Contrato de pruebas para el responsable. Directorio: `/Users/juanandrade/Desktop/ValmenHarness/.claude/worktrees/ticket-vivo-procesos` (o la raíz del repositorio una vez integrado). Requisitos: Node 24, `npm install` hecho, `npm run build` antes de la verificación de interfaz y de `valmen serve`.

| Comando | Resultado esperado | Cubre |
|---|---|---|
| `npx vitest run tests/processes-view.test.ts tests/process-gates.test.ts` | pasan sin cambios | C1 |
| `npx vitest run tests/procesos-detenidas.test.ts tests/procesos-vista.test.ts` | 23 pruebas pasan | C2 a C14, C16, C19, C20 |
| `npm run build && node scripts/verificar-interfaz.mjs` | última línea «Interfaz verificada.» | C15 |

Resultados de esta sesión (2026-10-14): `npx vitest run tests/procesos-detenidas.test.ts tests/procesos-vista.test.ts tests/processes-view.test.ts tests/process-gates.test.ts tests/api-rutas.test.ts tests/escrituras-autenticadas.test.ts tests/menu-grupos.test.ts tests/interfaz-ejecutable.test.ts` → 127 pruebas pasan; las 29 pruebas de interfaz juntas (los archivos de `tests/` que usan `scripts/verificar-interfaz.mjs` o `web/index.html`) más `tests/procesos-detenidas.test.ts`, `tests/processes-view.test.ts`, `tests/process-gates.test.ts` y `tests/api-rutas.test.ts` → 32 archivos, 459 pruebas pasan; `npm run build` en verde; `node scripts/verificar-interfaz.mjs` → «Interfaz verificada.» (14 vistas ejecutadas).

Evidencia visual (Chrome sin pantalla por CDP, copia temporal con una corrida detenida): `tickets/2026/FEATURE-WEB-VIVO-PROCESOS-20261014/evidencia/proc-1440-oscuro.png`, `proc-1440-claro.png`, `proc-390-oscuro.png`, `proc-390-claro.png` y `proc-1440-tras-aprobar.png`. A 1440 px coincide con `procesos.png` salvo D-001 a D-013. A 390 px, `scrollWidth` = `innerWidth` = 390 en los dos temas. El paso con `aria-current="step"` es «Aprobación humana del despliegue». Aprobación en el navegador, solo contra la copia temporal: con una frase libre el botón sigue deshabilitado; con «APROBAR DEPLOY v0.4.0» y responsable se habilita, la aprobación queda en `approvals.json` **de la copia** con `runId`, `version` y `phrase`, la corrida sigue `waiting` y el bloque pasa a «Aprobado por … · falta retomar: valmen process resume deploy-20261014-0900».

Validaciones manuales:
1. Preparar una copia temporal: copiar `.valmen/processes/*.yaml`, `.valmen/gates/deploy.yaml` y `.valmen/config.yaml` a una carpeta nueva y escribir en ella una corrida `waiting` con `writeRun` de `packages/engine/dist/index.js` (como `tests/procesos-detenidas.test.ts`). Desde esa carpeta, `node <worktree>/packages/cli/dist/main.js serve --port 4791` y abrir `http://127.0.0.1:4791/#/procesos`. No apruebes contra el `.valmen/` real.
2. A 1440 px, en oscuro y en claro, comparar con `.valmen/features/rediseno-mission-control/assets/procesos.png`: bloque ámbar con pasos, campo de responsable y de frase, «Aprobar despliegue» y «Ver dry-run»; tarjetas con pasos de persona en ámbar, «Pide: …», «Ejecutar» e «Historial»; «Más detalle» plegado al final (C18).
3. A 390 px, la página no se desplaza en horizontal (C17).
4. Escribir una frase distinta: el botón no se habilita. Escribir la frase exacta con responsable y aprobar: el bloque dice quién aprobó y cómo retomar; nada se ejecuta (C5, C6, C8).
5. Abrir «Más detalle»: cifras, gates (deploy remite a su corrida), corridas y procesos (C19, C20).

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
    "date": "2026-10-14",
    "session_reference": null,
    "model": null,
    "reasoning_effort": null,
    "notes": "Subagente claude-opus-5-5 lanzado por el orquestador para análisis, plan e implementación; el cliente no expone tokens ni coste del subagente, así que no hay números de sesión. Las compuertas cascade y el revisor dejaron su coste en los recibos (.valmen/receipts/FEATURE-WEB-VIVO-PROCESOS-20261014.jsonl).",
    "input_tokens": null,
    "output_tokens": null,
    "total_tokens": null,
    "estimated_cost_usd": null,
    "source": "manual:subagente-orquestado-vivo-procesos",
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
    "at": "2026-10-14T05:09:29.053Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-14",
    "at": "2026-10-14T05:09:56.736Z",
    "action": "design-references-updated",
    "actor": "cli",
    "details": "Referencias de diseño actualizadas: .valmen/features/rediseno-mission-control/assets/procesos.html, .valmen/features/rediseno-mission-control/assets/procesos.png."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-14",
    "at": "2026-10-14T14:24:47.501Z",
    "action": "agent-decision",
    "actor": "cli",
    "details": "{\"id\":\"D-001\",\"pregunta\":\"D1: ¿qué nombre llevan los pasos en el bloque y en la tarjeta?\",\"eleccion\":\"El title real del YAML del proceso\",\"alternativas\":[\"títulos cortos inventados en la vista\",\"campo nuevo de título corto en el YAML\"],\"criterio\":\"El boceto abrevia con cifras de ejemplo; inventar nombres en la vista separaría la pantalla del registro\",\"fuente\":\".valmen/processes/deploy.yaml:19-50\",\"reversion\":\"revertir el commit del ticket (git revert) y pintar la variante del boceto\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-14",
    "at": "2026-10-14T14:24:47.915Z",
    "action": "agent-decision",
    "actor": "cli",
    "details": "{\"id\":\"D-002\",\"pregunta\":\"D2: ¿qué se escribe en el campo de aprobación?\",\"eleccion\":\"La frase exacta que exige el gate, mostrada como placeholder y en la etiqueta; texto libre como reason si el gate no exige frase\",\"alternativas\":[\"frase libre como en el boceto\"],\"criterio\":\"El motor rechaza cualquier frase distinta de la resuelta; una frase libre fallaría siempre\",\"fuente\":\"packages/engine/src/run-state.ts:410-415; .valmen/gates/deploy.yaml:8\",\"reversion\":\"revertir el commit del ticket (git revert) y pintar la variante del boceto\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-14",
    "at": "2026-10-14T14:24:48.257Z",
    "action": "agent-decision",
    "actor": "cli",
    "details": "{\"id\":\"D-003\",\"pregunta\":\"D3: ¿dónde se pide el responsable de la aprobación?\",\"eleccion\":\"Campo Responsable dentro del bloque, con el valor recordado valmen.actor\",\"alternativas\":[\"sin campo, como el boceto\",\"campo global arriba de la vista\"],\"criterio\":\"Aprobar sin nombre no es auditable y el motor lo rechaza\",\"fuente\":\"packages/engine/src/run-state.ts:389-391; packages/server/web/index.html:4308-4314\",\"reversion\":\"revertir el commit del ticket (git revert) y pintar la variante del boceto\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-14",
    "at": "2026-10-14T14:24:48.606Z",
    "action": "agent-decision",
    "actor": "cli",
    "details": "{\"id\":\"D-004\",\"pregunta\":\"D4: ¿qué dice el botón de aprobar?\",\"eleccion\":\"Aprobar despliegue si el gate es deploy; Aprobar en cualquier otro gate\",\"alternativas\":[\"Aprobar despliegue siempre\",\"Aprobar siempre\"],\"criterio\":\"Fiel al boceto en el despliegue sin nombrar despliegue a gates que no lo son\",\"fuente\":\".valmen/features/rediseno-mission-control/assets/procesos.html (bloque t-esp)\",\"reversion\":\"revertir el commit del ticket (git revert) y pintar la variante del boceto\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-14",
    "at": "2026-10-14T14:24:48.942Z",
    "action": "agent-decision",
    "actor": "cli",
    "details": "{\"id\":\"D-005\",\"pregunta\":\"D5: ¿qué muestra Ver dry-run?\",\"eleccion\":\"Los pasos ya ejecutados con su comando, estado y hora\",\"alternativas\":[\"la salida del paso\",\"un enlace a la terminal\"],\"criterio\":\"El motor no guarda la salida de los pasos a propósito; solo el veredicto y el comando\",\"fuente\":\"packages/engine/src/run-state.ts:20-24\",\"reversion\":\"revertir el commit del ticket (git revert) y pintar la variante del boceto\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-10-14",
    "at": "2026-10-14T14:24:49.294Z",
    "action": "agent-decision",
    "actor": "cli",
    "details": "{\"id\":\"D-006\",\"pregunta\":\"D6: ¿qué hace Ejecutar?\",\"eleccion\":\"Despliega el comando valmen process run con sus parámetros para la terminal; no lanza nada\",\"alternativas\":[\"ruta nueva POST para lanzar el proceso\",\"ocultar el botón\"],\"criterio\":\"No hay ruta para ejecutar procesos y este ticket no ejecuta ni despliega; es la opción conservadora y reversible\",\"fuente\":\"packages/server/src/server.ts:703-775; tests/api-rutas.test.ts:59\",\"reversion\":\"revertir el commit del ticket (git revert) y pintar la variante del boceto\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-10-14",
    "at": "2026-10-14T14:24:49.632Z",
    "action": "agent-decision",
    "actor": "cli",
    "details": "{\"id\":\"D-007\",\"pregunta\":\"D7: ¿qué muestra Historial?\",\"eleccion\":\"Las corridas registradas de ese proceso con estado, corrida, pasos hechos y fecha\",\"alternativas\":[\"otra pantalla de historial\",\"ocultar el botón\"],\"criterio\":\"Los datos ya llegan en runs de /api/processes; sustituye la tabla global de corridas\",\"fuente\":\"packages/server/src/processes.ts:108-131\",\"reversion\":\"revertir el commit del ticket (git revert) y pintar la variante del boceto\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-10-14",
    "at": "2026-10-14T14:24:49.969Z",
    "action": "agent-decision",
    "actor": "cli",
    "details": "{\"id\":\"D-008\",\"pregunta\":\"D8: ¿qué se pinta sin corridas detenidas y con la nota del boceto?\",\"eleccion\":\"Línea neutra Nada detenido: ninguna corrida espera tu aprobación; la nota de cifras de ejemplo no se pinta\",\"alternativas\":[\"bloque ámbar vacío\",\"no pintar nada\"],\"criterio\":\"El ámbar significa que espera a una persona; sin corrida waiting no hay nada que aprobar, y la nota es del boceto\",\"fuente\":\"packages/server/web/index.html:69-75 (significado del ámbar); .valmen/processes/runs inexistente\",\"reversion\":\"revertir el commit del ticket (git revert) y pintar la variante del boceto\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-10-14",
    "at": "2026-10-14T14:24:50.309Z",
    "action": "agent-decision",
    "actor": "cli",
    "details": "{\"id\":\"D-009\",\"pregunta\":\"D9: ¿qué pasa con las cifras, la tabla de gates y la tabla de corridas?\",\"eleccion\":\"Salen de la vista; aprobar un gate sin corrida sigue en valmen process approve y las corridas pasan a Historial\",\"alternativas\":[\"conservarlas debajo de las tarjetas\"],\"criterio\":\"El boceto no las muestra; la tabla de gates mentía para gates con frase y su botón fallaba para deploy\",\"fuente\":\"packages/server/src/processes.ts:147; packages/server/web/index.html:8545\",\"reversion\":\"revertir el commit del ticket (git revert) y pintar la variante del boceto\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-10-14",
    "at": "2026-10-14T14:24:50.664Z",
    "action": "agent-decision",
    "actor": "cli",
    "details": "{\"id\":\"D-010\",\"pregunta\":\"D10: ¿qué subtítulo lleva el bloque?\",\"eleccion\":\"proceso · v<versión> si la corrida tiene version; si no, proceso · <corrida>\",\"alternativas\":[\"siempre la corrida\"],\"criterio\":\"Fiel al boceto con los parámetros reales de la corrida\",\"fuente\":\"packages/engine/src/run-state.ts:76-79\",\"reversion\":\"revertir el commit del ticket (git revert) y pintar la variante del boceto\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-10-14",
    "at": "2026-10-14T14:24:51.041Z",
    "action": "agent-decision",
    "actor": "cli",
    "details": "{\"id\":\"D-011\",\"pregunta\":\"D11: ¿cómo se arma Pide:?\",\"eleccion\":\"Con la descripción de cada parámetro, marcando (opcional) los no obligatorios; sin parámetros, No pide parámetros\",\"alternativas\":[\"nombres con asterisco\",\"frase inventada como el boceto\"],\"criterio\":\"La descripción es el texto humano que el YAML ya declara\",\"fuente\":\"packages/core/src/process.ts:75-82; .valmen/processes/deploy.yaml:7-16\",\"reversion\":\"revertir el commit del ticket (git revert) y pintar la variante del boceto\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-014",
    "date": "2026-10-14",
    "at": "2026-10-14T14:24:51.387Z",
    "action": "agent-decision",
    "actor": "cli",
    "details": "{\"id\":\"D-012\",\"pregunta\":\"D12: ¿cómo se pinta un proceso inválido?\",\"eleccion\":\"Tarjeta con su error y sin Ejecutar\",\"alternativas\":[\"ocultarlo\"],\"criterio\":\"Un proceso ilegible no se esconde, igual que en el motor\",\"fuente\":\"packages/engine/src/process.ts:80-87\",\"reversion\":\"revertir el commit del ticket (git revert) y pintar la variante del boceto\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-015",
    "date": "2026-10-14",
    "at": "2026-10-14T14:25:03.173Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-016",
    "date": "2026-10-14",
    "at": "2026-10-14T14:25:59.203Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-017",
    "date": "2026-10-14",
    "at": "2026-10-14T14:30:22.788Z",
    "action": "reviewer-rejected",
    "actor": "cli",
    "details": "{\"actor\":\"revisor claude-code/claude-sonnet-5-5 (autorización POLITICA-POR-DEFECTO)\",\"source\":\"revisor\",\"stage\":\"plan\",\"receiptId\":\"GR-20261014-FEATURE-WEB-VIVO-PROCESOS-20261014-plan-1\",\"authorizationId\":\"POLITICA-POR-DEFECTO\",\"reviewerModel\":\"claude-sonnet-5-5\",\"reason\":\"El plan no respalda C4: nunca menciona marcar el paso actual con aria-current=\\\"step\\\". Tampoco respalda la compatibilidad hacia atrás: quita de la vista la tabla de gates y la aprobación de un gate sin corrida detenida. C2 y la cobertura de criterios sí quedan respaldadas, pero basta una proposición sin respaldo para rechazar.\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-018",
    "date": "2026-10-14",
    "at": "2026-10-14T14:31:27.712Z",
    "action": "agent-decision",
    "actor": "cli",
    "details": "{\"id\":\"D-013\",\"pregunta\":\"D9 (revisada, sustituye a D-009): ¿qué pasa con las cifras, la tabla de gates con su botón, la tabla de corridas y la de procesos?\",\"eleccion\":\"Se conservan en un bloque plegado «Más detalle» debajo de las tarjetas; un gate con frase exigida remite a su corrida detenida en vez del botón que hoy falla\",\"alternativas\":[\"quitarlas (D-009, rechazada por el revisor del recibo plan-1)\"],\"criterio\":\"Quitarlas pierde funcionalidad que hoy existe (aprobar un gate sin corrida); el revisor rechazó el plan por compatibilidad hacia atrás y el orquestador pidió conservarlas\",\"fuente\":\"packages/server/web/index.html:9390-9570; recibo GR-20261014-FEATURE-WEB-VIVO-PROCESOS-20261014-plan-1\",\"reversion\":\"revertir el commit del ticket (git revert)\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-019",
    "date": "2026-10-14",
    "at": "2026-10-14T14:33:21.047Z",
    "action": "plan-approved",
    "actor": "cli",
    "details": "{\"actor\":\"revisor claude-code/claude-sonnet-5-5 (autorización POLITICA-POR-DEFECTO)\",\"source\":\"revisor\",\"quote\":\"El plan cubre las tres proposiciones. C2 tiene su prueba y su paso de vista. El plan atiende cada defecto e hipótesis del diagnóstico con pasos y criterios concretos. La compatibilidad se cuida con campos aditivos, «Más detalle» y la regresión sin editar pruebas existentes.\",\"planHash\":\"sha256:df6e11016a59e4b54d715d1d1d20c122d229bfdcb99be6196263e0359c901cd0\",\"authorizationId\":\"POLITICA-POR-DEFECTO\",\"authorizationHash\":\"sha256:c1bb46dd45f48a215d91a242f445eab06b4ac6f78aa546bf15d8b85902a01a0a\",\"reviewerModel\":\"claude-sonnet-5-5\",\"stage\":\"plan\",\"receiptId\":\"GR-20261014-FEATURE-WEB-VIVO-PROCESOS-20261014-plan-2\",\"receiptStateHash\":\"sha256:4b05f899547403500433c50ab5230b11c15b2b90cd682fb18818894c825bad6e\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-020",
    "date": "2026-10-14",
    "at": "2026-10-14T14:33:34.096Z",
    "action": "plan-approval-verified",
    "actor": "cli",
    "details": "Aprobación del plan vigente: revisor claude-code/claude-sonnet-5-5 (autorización POLITICA-POR-DEFECTO) (fuente revisor, hash sha256:c1bb46dd45f48a215d91a242f445eab06b4ac6f78aa546bf15d8b85902a01a0a), plan sha256:df6e11016a59e4b54d715d1d1d20c122d229bfdcb99be6196263e0359c901cd0."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-021",
    "date": "2026-10-14",
    "at": "2026-10-14T14:33:34.096Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-022",
    "date": "2026-10-14",
    "at": "2026-10-14T14:33:44.952Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-023",
    "date": "2026-10-14",
    "at": "2026-10-14T14:46:10.336Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-024",
    "date": "2026-10-14",
    "at": "2026-10-14T14:46:14.072Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  }
]
```
