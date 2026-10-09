---
schema_version: 2
id: FEATURE-WEB-MOTOR-ESCENA-20261008
title: Motor de escena con estaciones, movimiento, estados visuales, interfaz de mundo y tests sin lienzo
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
created: 2026-10-08
updated: 2026-10-08
related_ticket: null
target_release: null
released_in: null
---

# FEATURE-WEB-MOTOR-ESCENA-20261008

## Solicitud original

Parte del sprint: Vista Agentes renombrada, motor de escena con tests deterministas, lienzo montado con selector, aviso y paneles, marco responsivo.
- R-ESC-002: El motor DEBE ubicar a cada agente en una de ocho estaciones según el estado de su ticket
- R-ESC-003: El motor DEBE desplazar al agente entre estaciones con una posición objetivo y una velocidad constante
- R-ESC-004: El motor DEBE distinguir cuatro estados visuales
- R-ESC-006: La escena NO DEBE reiniciarse en cada refresco de datos
- R-ESC-009: El motor DEBE tener tests deterministas sin lienzo
- R-MUN-001: Cada mundo DEBE implementar la misma interfaz sobre el motor
Depende de: FEATURE-SERVER-SESION-PRINCIPAL-20261008.
Viene de una feature descompuesta en sprints; su plan completo está en el tickets.yaml de la feature.

Comportamiento esperado: El motor DEBE ubicar a cada agente en una de ocho estaciones según el estado de su ticket El motor DEBE desplazar al agente entre estaciones con una posición objetivo y una velocidad constante El motor DEBE distinguir cuatro estados visuales La escena NO DEBE reiniciarse en cada refresco de datos El motor DEBE tener tests deterministas sin lienzo Cada mundo DEBE implementar la misma interfaz sobre el motor
Comportamiento actual: la spec no lo declara; se establece en el análisis, leyendo el código.

### Fuera de alcance

Lo que el grafo asignó a otros tickets y este no hace:
- R-ESC-006: lo cubre FEATURE-WEB-VISTA-LIENZO-20261008 (Vista Agentes con lienzo montado desde el motor, selector de mundo, aviso de pregunta, paneles y estáticos declarados)
- R-MUN-001: lo cubre FEATURE-WEB-MUNDO-PASTELERIA-20261008 (Mundo pastelería con obrador, personajes, señal de pregunta, estático declarado y validación contra el prototipo)
- R-MUN-001: lo cubre FEATURE-WEB-MUNDO-CONTROL-20261008 (Mundo centro de control con sala, personajes, señal de pregunta, estático declarado y validación contra el prototipo)
- R-MUN-001: lo cubre FEATURE-WEB-MUNDO-INVERNADERO-20261008 (Mundo invernadero con cultivo, personajes, señal de pregunta, estático declarado y validación contra el prototipo)

### Referencias de diseño

Adjuntos que cita la spec del dominio de este ticket (ningún requisito suyo cita uno en particular). Se construye y se valida contra el original, no contra el texto de la spec:
- `.valmen/features/vista-agentes/assets/vista-agentes.html` — Prototipo aprobado por el PO el 2026-10-08: tres mundos (pastelería, centro de control, invernadero) con simulación, sesión principal y pregunta pendiente (sha256 0e54061e5fcc…)

### Supuestos y decisiones pendientes

<!-- Si el pedido nombra algo que el código no tiene —parámetro, permiso,
campo, bandera, columna, migración— y no lo especifica, listá cada elemento
con su pregunta antes de avanzar a análisis; el análisis no planifica sobre
la adivinanza. Si no hay ninguno, escribí «Ninguno» y seguí. -->
- **Estación de un agente `blocked` o `changes_requested` visto por primera vez.** R-ESC-002 pide ubicarlo en «la última estación válida que el ticket alcanzó», pero la fila del lector no trae ese dato (`packages/server/src/agentes.ts:51-67` solo expone `ticketEstado`). El motor puede recordarla entre refrescos por `agente`, pero no la conoce si el primer refresco ya lo trae en desvío (por ejemplo, al abrir la vista). Pregunta al PO: ¿en ese caso se ubica en la primera estación (`intake`) con la marca de desvío, o se amplía la fila del servidor con el último estado válido en otro ticket? Propuesta por defecto mientras no decida: `intake` con desvío, sin tocar el servidor.
  - **Decidido por el PO (2026-10-09), opción A**, en sus palabras: «Recomiendo A en ambos, aprueba los análisis» (recibo GR-20261009-FEATURE-WEB-MOTOR-ESCENA-20261008-analysis-1). Un agente que aparece por primera vez en `blocked` o `changes_requested` va a `intake` con la marca de desvío; el servidor no cambia.

## Descripción funcional

- Alcance: crear el **motor de escena** de la vista «Agentes» como un módulo ES puro, `packages/server/web/agentes/motor.js`, sin `document` ni lienzo, y su suite `vitest`. El motor: (1) calcula la estación (una de las ocho del flujo) de cada fila según `ticketEstado`, con marca de desvío para `blocked`/`changes_requested` y rótulo de fase (`faseConfirmada` → `faseInferida` → `ultimaHerramienta`) — R-ESC-002; (2) conserva el estado visual de cada agente por su identificador y lo desplaza hacia la posición objetivo que le da el mundo a velocidad constante en px/s, con aparición en el puesto principal y salida a los cinco segundos tras terminar — R-ESC-003; (3) expone los cuatro estados visuales `trabajando`, `esperando`, `termino`, `principal` — R-ESC-004; (4) al recibir filas nuevas solo las reemplaza y fusiona por identificador, sin reiniciar posiciones ni tiempo (la parte del motor de R-ESC-006); (5) define y valida la **interfaz de mundo** (nombre, lema, ocho nombres de estación, expresión de pregunta, posición objetivo por estación y por puesto principal, `dibujar(estado, t)`) sin nombrar ningún mundo (la parte del motor de R-MUN-001); (6) se prueba con reloj inyectado y sin `document` — R-ESC-009.
- Fuera de alcance (lo cubren otros tickets del grafo): montar el lienzo, `montar(canvas, filas)`/`desmontar()` con `requestAnimationFrame`, selector, aviso de pregunta y paneles (FEATURE-WEB-VISTA-LIENZO-20261008); declarar los archivos en `loadStatics` y cargarlos desde `index.html` (ídem); los tres mundos con su dibujo (FEATURE-WEB-MUNDO-PASTELERIA/CONTROL/INVERNADERO-20261008); el campo `pregunta` de la fila (FEATURE-SERVER-PREGUNTA-PENDIENTE-20261008).
- Usuario o rol afectado: el PO que mira la ejecución en Mission Control; de forma directa, quienes implementan la vista y los mundos, que consumen el motor.
- Comportamiento actual: no existe motor de escena. La vista de la ejecución es una tabla que `vistaCorrida` (`packages/server/web/index.html:6267`) reconstruye entera en cada refresco de 5 s (`index.html:6090`, `index.html:6406-6418`, que vuelve a llamar a `navegar`). La única simulación está en el prototipo `.valmen/features/vista-agentes/assets/vista-agentes.html`, con estado global aleatorio, los mundos nombrados dentro de `objetivo` y acoplada al lienzo.
- Comportamiento esperado: un módulo importable por el navegador y por `vitest` que, dadas las filas de `GET /api/corrida/agentes`, un mundo que cumple la interfaz y un reloj inyectado, devuelva un estado de escena determinista (agentes con estación, desvío, rótulo, estado visual, posición, objetivo, `moviendo`) que sobrevive a refrescos idénticos sin cambios.

## Diagnóstico

- Causa comprobada (con `ruta:línea`): es funcionalidad nueva; lo que falta está comprobado en el código. `packages/server/web/` solo contiene `index.html` (no existe `agentes/`). La vista actual se repinta desde cero en cada refresco (`packages/server/web/index.html:6267-6300` lee `/api/corrida/agentes` y arma la tabla; `index.html:6406-6418` reprograma `navegar({ conservarVista: true })` cada `REFRESCO_DE_CORRIDA_MS = 5000`, `index.html:6090`), así que cualquier estado de escena que viva en el DOM de la vista se perdería: por eso el motor guarda su estado en el módulo (decisión 4 de `.valmen/features/vista-agentes/design.md`). La fila que consume el motor está fijada en `packages/server/src/agentes.ts:51-67` (`agente`, `principal`, `ticket`, `estado: "trabajando" | "esperando" | "termino"` en `agentes.ts:48`, `ticketEstado`, `faseConfirmada`, `faseInferida`, `ultimaHerramienta`); la sesión principal llega como primera fila con `principal: true` y `ticketEstado: null` (`agentes.ts:346-365`); el estado lo decide el servidor con reloj inyectado (`agentes.ts:320-331`), así que el motor no recalcula «esperando»: lo toma de `estado`. En el prototipo, la simulación que hay que extraer es: estaciones `vista-agentes.html:134-138`, mundos como datos `vista-agentes.html:144-154`, `objetivo` con los mundos nombrados por `if (mundo === ...)` `vista-agentes.html:224-231` (lo que R-MUN-001 prohíbe en el motor), `acercar` a velocidad constante `vista-agentes.html:237-241` con 90 px/s `vista-agentes.html:246`, salida `finEn = t + 5` `vista-agentes.html:280` y aparición junto a la principal `vista-agentes.html:287`.
- Hipótesis pendientes: (H1) estación de un `blocked`/`changes_requested` sin historial previo: la fila no trae el último estado válido (`agentes.ts:51-67`); queda en «Supuestos y decisiones pendientes» con su pregunta. (H2) tipos al importar `.js` desde un test `.ts`: `tsconfig.json` no declara `allowJs` ni `include` (solo `exclude`, `tsconfig.json:35`) y `npm run typecheck` pasa `tsc --noEmit -p tsconfig.json` sobre `tests/`; importar `../packages/server/web/agentes/motor.js` puede dar TS7016. Se verifica en el plan; la salida prevista es un `motor.d.ts` junto al módulo. `vitest` no tipa y el plugin `valmen-src-sobre-dist` (`vitest.config.ts`) solo redirige cuando existe un `.ts` hermano, así que en la corrida el `.js` se importa tal cual. (H3) `pregunta.desde` todavía no existe en la fila (lo agrega FEATURE-SERVER-PREGUNTA-PENDIENTE-20261008, que no es dependencia de este ticket): el motor lo lee como opcional y el estado `esperando` sale de `estado`, así que no depende de ese ticket.
- Consumidores afectados: ninguno en ejecución hoy —el motor no se carga desde `index.html` ni se sirve (`packages/cli/src/main.ts:1674` sirve solo `["index.html"]`)—. Lo consumirán FEATURE-WEB-VISTA-LIENZO-20261008 (montaje y refresco) y los tres tickets de mundo (interfaz). `scripts/copy-web.mjs:32` copia `packages/server/web/` completo a `packages/cli/dist/web`, así que el archivo nuevo llega al build sin cambios en el script; la ruta `/agentes/motor.js` solo se servirá cuando LIENZO lo declare en `loadStatics` (el MIME `.js` ya existe, `packages/server/src/server.ts:1993`).
- Archivos y flujo investigados: `packages/server/src/agentes.ts` (contrato de fila y regla de estado), `packages/server/src/server.ts:1990-1995,2343-2356` (MIME y `loadStatics`), `packages/cli/src/main.ts:1671-1674` (raíz web y mapa de estáticos), `packages/server/web/index.html:6090,6267-6300,6395-6418` (vista y refresco), `scripts/copy-web.mjs:23-32`, `vitest.config.ts:78` (los tests se recogen de `tests/**/*.test.ts`), `tsconfig.json`, `package.json` (scripts `test`, `typecheck`), el prototipo y `spec/s2-motor-escena/spec.md`, `spec/s3-mundos/spec.md`, `design.md`. Memoria consultada (`buscar_memoria`): AP-003 (respetar el alcance del grafo en el plan) y AP-010 (un plan que crea archivos nuevos no tiene archivos «iguales» que corresponder); ninguna causa previa sobre el motor.
- Riesgos y compatibilidad: (R1) acoplar el motor a un mundo concreto rompería R-MUN-001: el motor recibe el mundo como parámetro y un test con un mundo ficticio comprueba que no se nombra ninguno. (R2) no determinismo: el prototipo usa `Math.random` y un reloj interno; el motor recibe `ahora`/`dt` y no usa azar (el desplazamiento por índice que usa el prototipo se calcula del orden de llegada). (R3) reinicio en refresco: fusionar por `agente` y no recrear el estado; un refresco idéntico no cambia objetivos (prueba dedicada). (R4) tipado del `.js` en `typecheck` (H2). (R5) módulo ES sin `document` ni `window`: si se colara una referencia, `vitest` en entorno `node` falla, que es la comprobación. Compatible hacia atrás: no se modifica ningún archivo existente, ni la API ni la vista.
- Impactos de sync, migración, Docker o despliegue: ninguno — módulo estático nuevo del cliente, sin datos, sin esquema, sin contenedores y sin cambiar lo que se sirve hasta que otro ticket lo declare.

## Plan

- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan).
- Alcance: tres archivos **nuevos**, sin modificar ninguno existente (AP-010: el plan crea archivos; no hay código previo que corresponder). `packages/server/web/agentes/motor.js` (módulo ES puro), `packages/server/web/agentes/motor.d.ts` (tipos para el `typecheck`, H2) y `tests/motor-escena.test.ts`. Exclusiones, según el grafo de la feature (AP-003): no se toca `index.html`, `loadStatics` (`packages/cli/src/main.ts:1674`), el lienzo, el selector, el aviso ni los paneles (FEATURE-WEB-VISTA-LIENZO-20261008); no se escribe ningún mundo real (los tres tickets de mundo); no se toca `packages/server/src/agentes.ts` (decisión A del PO).
- Contrato del módulo (`motor.js`, sin `document`, `window`, `Math.random` ni `Date.now`; el tiempo siempre llega como argumento):
  - `ESTACIONES`: los ocho ids en orden (`intake`, `analyzed`, `planned`, `approved`, `in_progress`, `awaiting_user_tests`, `in_qa`, `closed`), con `humano: true` en `approved` y `awaiting_user_tests` como en el prototipo (`vista-agentes.html:134-138`).
  - `ESTADOS_VISUALES = ["trabajando", "esperando", "termino", "principal"]`, `VELOCIDAD_PX_S = 90` (`vista-agentes.html:246`), `SALIDA_MS = 5000` (`vista-agentes.html:280`).
  - `estacionDe(fila, ultimaValida)` → `{ indice, desvio }`: índice de `ticketEstado` en `ESTACIONES`; para `blocked`/`changes_requested`, `ultimaValida` con `desvio: true`, o `0` (`intake`) con `desvio: true` si no hay historial (decisión A); `ticketEstado` desconocido o `null` en un subagente → `0` sin desvío.
  - `rotuloDe(fila)`: `faseConfirmada ?? faseInferida ?? ultimaHerramienta ?? ""`.
  - `estadoVisualDe(fila)`: `principal` si `fila.principal`, si no `fila.estado` (`agentes.ts:48`).
  - `validarMundo(mundo)` → lista de errores (vacía si cumple): `id`, `nombre`, `lema` y `pregunta` texto no vacío; `estaciones` con exactamente 8 textos; `posicion(indice, carril)` y `dibujar(estado, t)` funciones; `puestoPrincipal` con `x` e `y` numéricos.
  - `crearEscena(mundo)` → `{ mundo, t: 0, agentes: Map, orden }`; lanza si `validarMundo` devuelve errores.
  - `actualizar(escena, filas, ahoraMs)`: fusiona por `fila.agente`. Uno nuevo se crea en `mundo.puestoPrincipal` con un `carril` fijo por orden de llegada; uno existente conserva `x`, `y`, `carril` y `paso` y solo actualiza fila, estación, desvío, rótulo, estado visual y objetivo. Guarda `ultimaValida` cada vez que la estación no es desvío. Un agente en `termino` (o que deja de venir en las filas) toma por objetivo el puesto principal y `saleEn = ahoraMs + SALIDA_MS` (solo la primera vez); no reinicia `t` ni recrea el mapa.
  - `objetivoDe(mundo, agente)`: `puestoPrincipal` si es la principal o está saliendo; si no, `mundo.posicion(indice, carril)`. El motor no contiene ningún nombre de mundo.
  - `avanzar(escena, dtSegundos, ahoraMs)`: suma `t`; mueve cada agente hacia su objetivo como mucho `VELOCIDAD_PX_S * dt` px (misma regla que `acercar`, `vista-agentes.html:237-241`) y fija `moviendo`; quita los que tienen `saleEn <= ahoraMs`. Un agente `esperando` ya en su estación no cambia de objetivo.
- Pasos ordenados:
  1. Crear `packages/server/web/agentes/motor.js` con las constantes y `estacionDe`, `rotuloDe`, `estadoVisualDe` (C1, C2, C3, C4, C9).
  2. Agregar a `motor.js` `validarMundo`, `crearEscena` y `objetivoDe`, con el mundo como parámetro y sin nombrar ningún mundo (C12, C13, C14).
  3. Agregar a `motor.js` `actualizar` (fusión por `agente`, aparición en el puesto principal, salida a los 5 s) y `avanzar` (velocidad constante, `moviendo`) (C5, C6, C7, C8, C10, C11).
  4. Crear `packages/server/web/agentes/motor.d.ts` con los tipos de las exportaciones y de la interfaz `Mundo`, para que `npx tsc --noEmit -p tsconfig.json` acepte el import desde el test (H2) (C16).
  5. Crear `tests/motor-escena.test.ts`: importa `../packages/server/web/agentes/motor.js`, usa un mundo ficticio declarado en el test y filas con la forma de `AgenteDeCorrida` (`agentes.ts:51-67`); un `describe`/`it` por criterio, con los nombres que citan los `-t` de abajo; reloj por argumento (C1–C15).
  6. Correr `npx vitest run tests/motor-escena.test.ts` y `npx tsc --noEmit -p tsconfig.json` desde la raíz del worktree; escribir `## Pruebas` con el contrato de entrega (C1–C16).
- Dependencias: FEATURE-SERVER-SESION-PRINCIPAL-20261008 (ya integrado en `main`, `bf059ff`): la fila `principal: true` que el motor consume.
- Compuertas que aplican: `plan` (esta), aprobación de una persona, y `qa-mechanical` con los comandos de los criterios.
- Compatibilidad y orden de despliegue: sin orden especial; el módulo no se carga ni se sirve hasta que FEATURE-WEB-VISTA-LIENZO-20261008 lo declare. `scripts/copy-web.mjs:32` lo copia al build sin cambios.
- Impactos declarados: ninguno (sin sincronización, migración, contenedores ni despliegue).
- Rollback (obligatorio): borrar los tres archivos nuevos (`git revert` del commit del ticket); nada existente cambia, así que no hay estado que restaurar.

<!-- Los criterios de la sección siguiente se numeran C1…Cn, con una afirmación verificable por criterio
     —una frase con «y» son dos criterios—, y cada uno lleva debajo su anotación de
     verificación: un comentario HTML que dice «test:» y el comando, o «verify: manual». La
     sección no lleva comentarios dentro: un comentario con anotación se leería como la de un
     criterio. Ejemplo en la skill planificacion. -->
## Criterios de aceptación

- [x] C1 (R-ESC-002): una fila con `ticketEstado: "in_progress"` queda en la estación de índice 4 sin desvío.
      <!-- test: npx vitest run tests/motor-escena.test.ts -t "C1:" -->
- [x] C2 (R-ESC-002): el rótulo es `faseConfirmada`, si falta `faseInferida`, si falta `ultimaHerramienta`.
      <!-- test: npx vitest run tests/motor-escena.test.ts -t "C2:" -->
- [x] C3 (R-ESC-002): un agente que pasa de `planned` a `blocked` queda en la estación `planned` con la marca de desvío.
      <!-- test: npx vitest run tests/motor-escena.test.ts -t "C3:" -->
- [x] C4 (R-ESC-002, decisión A del PO): un agente que aparece por primera vez en `changes_requested` queda en `intake` con la marca de desvío.
      <!-- test: npx vitest run tests/motor-escena.test.ts -t "C4:" -->
- [x] C5 (R-ESC-003): tras pasar de `planned` a `in_progress`, cada cuadro acerca al agente al objetivo `mundo.posicion(4, carril)` exactamente `VELOCIDAD_PX_S * dt` píxeles, sin saltar.
      <!-- test: npx vitest run tests/motor-escena.test.ts -t "C5:" -->
- [x] C6 (R-ESC-003): `moviendo` es verdadero mientras el agente no llegó a su objetivo y falso al llegar.
      <!-- test: npx vitest run tests/motor-escena.test.ts -t "C6:" -->
- [x] C7 (R-ESC-003): un agente nuevo aparece en `mundo.puestoPrincipal`.
      <!-- test: npx vitest run tests/motor-escena.test.ts -t "C7:" -->
- [x] C8 (R-ESC-003): un agente en `termino` vuelve al puesto principal y desaparece de la escena pasados 5 s del reloj inyectado.
      <!-- test: npx vitest run tests/motor-escena.test.ts -t "C8:" -->
- [x] C9 (R-ESC-004): el motor expone exactamente los estados visuales `trabajando`, `esperando`, `termino` y `principal`, y la fila `principal: true` da `principal`.
      <!-- test: npx vitest run tests/motor-escena.test.ts -t "C9:" -->
- [x] C10 (R-ESC-004): un agente con `estado: "esperando"` en su estación tiene estado visual `esperando` y su posición no cambia al avanzar.
      <!-- test: npx vitest run tests/motor-escena.test.ts -t "C10:" -->
- [x] C11 (R-ESC-006, parte del motor): diez llamadas a `actualizar` con la misma lista no cambian el objetivo, la posición ni el `carril` de ningún agente, ni devuelven a nadie al puesto principal.
      <!-- test: npx vitest run tests/motor-escena.test.ts -t "C11:" -->
- [x] C12 (R-MUN-001, parte del motor): `validarMundo` devuelve una lista vacía para un mundo que cumple la interfaz.
      <!-- test: npx vitest run tests/motor-escena.test.ts -t "C12:" -->
- [x] C13 (R-MUN-001, parte del motor): `validarMundo` nombra cada elemento ausente o mal formado (estaciones distintas de 8, `posicion` o `dibujar` que no son función, `puestoPrincipal` sin coordenadas) y `crearEscena` lanza con ese mundo.
      <!-- test: npx vitest run tests/motor-escena.test.ts -t "C13:" -->
- [x] C14 (R-MUN-001, parte del motor): el código de `motor.js` no contiene los nombres de ningún mundo (`pasteler`, `invernadero`, `centro de control`) y un mundo ficticio declarado solo en el test funciona sin tocar el motor.
      <!-- test: npx vitest run tests/motor-escena.test.ts -t "C14:" -->
- [x] C15 (R-ESC-009): la suite corre en el entorno `node` de `vitest` sin `document`, y `motor.js` no referencia `document`, `window`, `Math.random` ni `Date.now`.
      <!-- test: npx vitest run tests/motor-escena.test.ts -t "C15:" -->
- [x] C16 (R-ESC-009): el chequeo de tipos del repositorio pasa con el test que importa el motor.
      <!-- test: npx tsc --noEmit -p tsconfig.json -->

## Puntos

```json
[
  {
    "id": "POINT-001",
    "title": "Verificación de la entrega de FEATURE-WEB-MOTOR-ESCENA-20261008",
    "status": "closed",
    "severity": "normal",
    "actual": "La implementación está entregada y falta verificar sus criterios.",
    "expected": "Los criterios del ticket se cumplen y sus pruebas dan el resultado esperado.",
    "evidence": [
      "EVIDENCE-001"
    ],
    "affected_files": [
      "packages/server/web/agentes/motor.js",
      "packages/server/web/agentes/motor.d.ts",
      "tests/motor-escena.test.ts"
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

Tres archivos nuevos, sin tocar ninguno existente: `packages/server/web/agentes/motor.js` (módulo ES puro: estaciones, `estacionDe`, `rotuloDe`, `estadoVisualDe`, `validarMundo`, `crearEscena`, `objetivoDe`, `actualizar`, `avanzar`), `packages/server/web/agentes/motor.d.ts` (tipos para el `typecheck`) y `tests/motor-escena.test.ts` (16 pruebas, mundo ficticio y reloj por argumento). Decisión A aplicada: un agente nuevo en `blocked`/`changes_requested` va a `intake` con marca de desvío.

## Pruebas

- Directorio: raíz del worktree (`/Users/juanandrade/Desktop/ValmenHarness/.claude/worktrees/ticket-motor-escena`) o del repositorio tras integrar.
- Comando 1: `npx vitest run tests/motor-escena.test.ts` -> esperado: 1 archivo, 16 pruebas, todas verdes (C1-C15). Resultado obtenido: 16 passed.
- Comando 2: `npx tsc --noEmit -p tsconfig.json` -> esperado: sin salida y código 0 (C16). Resultado obtenido: sin errores.
- Cada criterio se corre aislado con `-t "Cn:"` (lo hace `valmen gate qa-mechanical`).
- Validaciones manuales: ninguna; el motor no se carga ni se sirve hasta FEATURE-WEB-VISTA-LIENZO-20261008.
- Requisitos de ambiente: Node 24 y `npm install`; no requiere red, navegador ni `dist`.
- Resultado del PO: «Recomiendo A, cierra los dos y lanza el lienzo» (aprobó el cierre tras ver las pruebas verdes; antes pidió «Cierra lo que se verifique por comando»).

## QA

```json
[
  {
    "id": "QA-001",
    "date": "2026-10-09",
    "build_reference": "commit:d6fad404a8b98fbd5ef45c27cd1fd4151c2d38bc",
    "environment": "macOS, Node 24, main tras integrar",
    "result": "pending",
    "findings": [],
    "correction": null,
    "po_confirmation": null
  },
  {
    "id": "QA-002",
    "date": "2026-10-09",
    "build_reference": null,
    "environment": null,
    "result": "approved",
    "findings": [],
    "correction": null,
    "po_confirmation": "Recomiendo A, cierra los dos y lanza el lienzo"
  }
]
```

## Evidencia

```json
[
  {
    "id": "EVIDENCE-001",
    "date": "2026-10-09",
    "kind": "automated-test",
    "description": "Pruebas del ticket y suite completa (216 archivos, 3581 pruebas) en verde tras integrar en main",
    "reference": "worktree:sha256:8a319bd6894a719f51980aaf313878c7e042beb10c9e06bcb3c2b04d10667de0",
    "point_id": "POINT-001"
  }
]
```

## Retests

```json
[
  {
    "id": "RETEST-001",
    "date": "2026-10-09",
    "point_id": "POINT-001",
    "result": "approved",
    "evidence": [],
    "po_confirmation": "Recomiendo A, cierra los dos y lanza el lienzo"
  }
]
```

## Cierre

```json
[
  {
    "kind": "ticket-close",
    "id": "CLOSE-001",
    "date": "2026-10-09",
    "technical_summary": "Motor de escena en cliente (web/agentes/motor.js y su .d.ts): ocho estaciones = ocho estados del ticket, desplazamiento por agente, estados visuales e interfaz de mundo, sin dibujar; agente nuevo en blocked/changes_requested va a intake con marca de desvío. Probado de forma determinista.",
    "functional_summary": "Base común para que los tres mundos animados muestren a cada agente recorriendo las estaciones de su ticket; aún no hay pantalla hasta el ticket del lienzo.",
    "qa_status": "approved",
    "qa_waiver_reason": null,
    "po_confirmation": null,
    "release_impact": "unreleased: entra con la feature vista-agentes"
  }
]
```

## Consumo de IA

```json
[
  {
    "kind": "ai-usage",
    "date": "2026-10-09",
    "session_reference": null,
    "model": null,
    "reasoning_effort": null,
    "notes": null,
    "input_tokens": null,
    "output_tokens": null,
    "total_tokens": null,
    "estimated_cost_usd": null,
    "source": "manual:subagente-implementacion-sonnet-5-5",
    "confidence": "low",
    "id": "CONSUMO-001"
  },
  {
    "kind": "ai-usage",
    "date": "2026-10-09",
    "session_reference": null,
    "model": null,
    "reasoning_effort": null,
    "notes": "Subagentes por fase; sin números por ticket para no repartir a ojo un costo no medido.",
    "input_tokens": null,
    "output_tokens": null,
    "total_tokens": null,
    "estimated_cost_usd": null,
    "source": "manual:sesiones de Claude Code de la corrida orquestada vista-agentes",
    "confidence": "low",
    "id": "CONSUMO-002"
  },
  {
    "kind": "ai-usage",
    "date": "2026-10-09",
    "session_reference": "4f9b1b12-ced4-4132-9151-c3a025ede085",
    "model": null,
    "reasoning_effort": null,
    "notes": "Agente claude-code. Sesión **compartida**: trabajó 4 tickets (FEATURE-SERVER-SESION-PRINCIPAL-20261008 ×120, IMPROVEMENT-WEB-VISTA-RENOMBRAR-AGENTES-20261008 ×102, FEATURE-WEB-MOTOR-ESCENA-20261008 ×100, FEATURE-SERVER-PREGUNTA-PENDIENTE-20261008 ×85), así que su costo no se reparte y acá no se registran números. Costo completo de la sesión: no declarado por el proveedor, 1084353 tokens. Registralo en el ticket cuya sesión sea propia, o declaralo compartido donde corresponda. Sesión \"Feature vista-agentes\".",
    "input_tokens": null,
    "output_tokens": null,
    "total_tokens": null,
    "estimated_cost_usd": null,
    "source": "claude:4f9b1b12-ced4-4132-9151-c3a025ede085",
    "confidence": "high",
    "id": "CONSUMO-003"
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
    "at": "2026-10-08T23:30:58.916Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-08",
    "at": "2026-10-09T00:07:26.331Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-08",
    "at": "2026-10-09T00:10:37.512Z",
    "action": "gate-approved",
    "actor": "cli",
    "details": "Gate analysis aprobado por PO (recibo GR-20261009-FEATURE-WEB-MOTOR-ESCENA-20261008-analysis-1, canal cli, decidida 2026-10-09T00:10:37.510Z): PO: \"Recomiendo A en ambos, aprueba los análisis\""
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-08",
    "at": "2026-10-09T00:12:07.173Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-08",
    "at": "2026-10-09T00:13:43.074Z",
    "action": "gate-approved",
    "actor": "cli",
    "details": "Gate plan aprobado por PO (recibo GR-20261009-FEATURE-WEB-MOTOR-ESCENA-20261008-plan-1, canal cli, decidida 2026-10-09T00:13:43.071Z): PO: \"Recomiendo A en ambos, aprueba los planes\" (respuesta a la REVIEW del plan)"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-08",
    "at": "2026-10-09T00:13:43.396Z",
    "action": "plan-approved",
    "actor": "cli",
    "details": "{\"actor\":\"PO\",\"source\":\"cli\",\"quote\":\"Recomiendo A en ambos, aprueba los planes\",\"planHash\":\"sha256:8ffe980afbddacfe965e465dd64294a1c020406320fd577fe944995a86625032\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-08",
    "at": "2026-10-09T00:13:47.485Z",
    "action": "plan-approval-verified",
    "actor": "cli",
    "details": "Aprobación del plan vigente: PO (fuente cli), plan sha256:8ffe980afbddacfe965e465dd64294a1c020406320fd577fe944995a86625032."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-10-08",
    "at": "2026-10-09T00:13:47.485Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-10-08",
    "at": "2026-10-09T00:14:06.457Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-10-08",
    "at": "2026-10-09T00:15:14.309Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-10-08",
    "at": "2026-10-09T00:19:35.270Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-10-08",
    "at": "2026-10-09T00:20:39.041Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-10-08",
    "at": "2026-10-09T00:21:13.098Z",
    "action": "point-added",
    "actor": "cli",
    "details": "Se agregó POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-014",
    "date": "2026-10-08",
    "at": "2026-10-09T00:21:13.407Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-015",
    "date": "2026-10-08",
    "at": "2026-10-09T00:21:13.703Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-016",
    "date": "2026-10-08",
    "at": "2026-10-09T00:21:14.037Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-017",
    "date": "2026-10-08",
    "at": "2026-10-09T00:21:14.448Z",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-018",
    "date": "2026-10-08",
    "at": "2026-10-09T00:21:14.905Z",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-019",
    "date": "2026-10-08",
    "at": "2026-10-09T00:21:15.308Z",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-001 para POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-020",
    "date": "2026-10-08",
    "at": "2026-10-09T00:21:15.704Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: verified -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-021",
    "date": "2026-10-08",
    "at": "2026-10-09T00:21:16.146Z",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-022",
    "date": "2026-10-08",
    "at": "2026-10-09T00:21:16.650Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-023",
    "date": "2026-10-08",
    "at": "2026-10-09T00:21:17.055Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-002."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-024",
    "date": "2026-10-08",
    "at": "2026-10-09T00:21:19.091Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-003."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-025",
    "date": "2026-10-08",
    "at": "2026-10-09T00:21:19.277Z",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-026",
    "date": "2026-10-08",
    "at": "2026-10-09T00:21:19.645Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  }
]
```
