# Parte diario — 2026-09-30

Cierre del trabajo autónomo del día. Se lee el registro, no lo que reportaron las
sesiones: cada afirmación de acá salió de un recibo, de un `ticket.md`, del tablero
(`kanban.db` de los dos boards) o del árbol del repositorio. La fecha real es la del
`date`, no la de la conversación.

## Qué corrió

### ValmenHarness — la cadena de siete eslabones se detuvo en el tercero

El perfil **no tiene ningún job de trabajo agendado**: en `cron/jobs.json` solo figuran
este parte (21:30) y el aviso cada 3 min (`af769dd89fb4`, silencioso toda la jornada). El
trabajo lo despacha el tablero del board `valmen-harness`: siete tarjetas creadas a las
15:25 para la jornada `timeline-fases`, todas con `model_override: deepseek-v4.1-flash`,
encadenadas (la 2 espera a la 1, la 3 a la 2, y así).

| # | Tarjeta | Ticket | Cómo salió |
|---|---|---|---|
| 1 | `t_b1f5ea9f` | `FEATURE-CORE-DERIVAR-FASES-20260929` | corrida 15:25→16:27, `done`; entregada en `awaiting_user_tests` |
| 2 | `t_49571ce9` | `FEATURE-API-FASES-20260929` | 16:28→19:21, `done` con un ciclo `changes_requested` y un crash del worker a las 18:01 (`pid 8552`, rc=1) que se recuperó al reintentar |
| 3 | `t_09cc7c45` | `CHORE-CORE-TEST-READONLY-FASES-20260929` | bloqueada 19:37 (`needs_input`, compuerta `analysis` en REVIEW), desbloqueada 21:30, **tres corridas en `protocol_violation` → `gave_up`**; el ticket queda en `analyzed` |
| 4–7 | `t_be69706c`, `t_e637f452`, `t_07fe851a`, `t_f5ec1cfd` | — | **`todo`: nunca corrieron** |

El bloqueo del eslabón 3 es la parada dura que el encadenamiento no puede saltear: la
compuerta de análisis dio REVIEW en dos corridas (0.54 → 0.57 en
`diagnostico_explica_el_sintoma`, peso 3) y el worker se detuvo sin escribir el plan. El
PO desbloqueó a las 21:30 por Telegram («la autorización anticipada "Dale, abrí las 7
tarjetas kanban" del 30-sep ampara el avance con la pasada de mejora ya hecha»), y desde
ahí el worker **salió tres veces con rc=0 sin llamar a `kanban_complete` ni
`kanban_block`** (21:31, 21:32, 21:33): las tres quedaron como `protocol_violation` y a la
tercera la tarjeta quedó detenida (`gave_up`, `protocol_violations: 3`, `sticky`). El
trabajo del eslabón 3 —el diagnóstico y su recibo— está en el árbol; lo que falta es la
llamada terminal del worker.

### SaiOpenCloud — la jornada de tres tarjetas, cerrada antes del mediodía

| Job | Disparo | Qué salió |
|---|---|---|
| `jornada-arranque 2026-09-30` (`f7d13d09744d`, script) | 08:00 | abrió las tres tarjetas de la jornada, todas `ready` |
| `vigilante-de-jornada` (`407b97cdf000`, cada 30 min, script) | 41 corridas | despachó las tres y siguió el estado: `ready=2 running=1` a las 08:20 → `review=1` a las 09:22 → `scheduled=1` a las 09:53 → silencio |
| `aviso-telegram-awaiting-jornada` (`87d525a774a3`, cada 3 min, script) | 326 corridas | un solo aviso no silencioso: 19:37 `aviso blocked: t_09cc7c45` (la tarjeta del harness) |

Las tres tarjetas del board `saiopencloud` quedaron `done` entre las 08:25 y las 10:23
—`IMPROVEMENT-ADMINISTRACION-LOGS-ERROR-REAL` 08:01→09:35, `FEATURE-ADMIN-PLANTILLA-PRECUENTA`
08:01→08:25 y `FEATURE-POS-SUCURSAL-USUARIO` 10:19→10:23, con sus rondas de review en el
medio—, y el registro las cerró a las 14:57–14:58. Además, un ticket que no venía de la
jornada —`BUGFIX-DOCKERHUB-429-20260930`— se abrió a las 14:34, se corrigió y se cerró el
mismo día. **Nada agendado quedó sin correr en este perfil**, y los tres jobs cerraron sin
fallos (`last_status: ok`, 0 incidentes).

Lo que **no** está agendado es el arranque de mañana: el job del 30 quedó `completed` y
deshabilitado y no hay un `jornada-arranque 2026-10-01`.

## ¿Los artefactos eran para pasar?

**Sí en los dos registros, con una excepción que no es de redacción.** Se juzga leyendo el
artefacto; el `verdict` de cada proposición dice qué es banda pendiente y qué es forma.
Todo corrido con un solo evaluador, `typesafe/jev-1.13-20260917`.

- **`FEATURE-CORE-DERIVAR-FASES`** — `analysis` en REVIEW 0.82 → 0.86 → 0.88, con
  `diagnostico_explica_el_sintoma` (peso 3) en banda y `causa_especifica` 0.94,
  `nombra_archivos_reales` 0.92, `clasificacion` completa, `riesgos_cubren_impactos` 0.52
  descriptiva. El diagnóstico trae `ruta:línea` contrastada contra el archivo
  (`etapas.ts:58`, `transition.ts:128`, `edit.ts:141`, `blocks.ts:424-460`) y el plan cinco
  decisiones con su alternativa descartada. **Era para pasar**; la banda es el caso conocido
  del ticket cuyo `## Solicitud original` es un enunciado de requisito y no un síntoma.
- **`FEATURE-API-FASES`** — `analysis` en REVIEW 0.81 → 0.78, misma proposición de peso 3, el
  resto en verde y el plan con decisiones y rutas por paso. **Era para pasar.**
- **`CHORE-CORE-TEST-READONLY-FASES`** — `analysis` en REVIEW 0.54 → 0.57 (`causa_especifica`
  0.89, `nombra_archivos_reales` 0.91/0.92, checks mecánicos en verde). El diagnóstico tiene
  sustancia (`fases.ts:129-171`, `server.ts:707-736`, `blocks.ts:424-460`), pero **el
  artefacto no era para pasar**: su único criterio de aceptación es la frase cortada del
  requisito («…la feature no escribe en los») y el `## Plan` sigue siendo la plantilla vacía.
  El punto de fondo es el hallazgo 1; el 0.57 está midiendo eso y no la redacción.
- **SaiOpenCloud, tres planes en REVIEW con el fondo en verde**: `FEATURE-ADMIN-PLANTILLA-PRECUENTA`
  (`criterio_05=0.47` y `criterio_04=0.79` en la tercera corrida, el resto 0.95–0.98),
  `FEATURE-POS-SUCURSAL-USUARIO` (`criterio_09=0.73`, `criterio_10=0.77`) e
  `IMPROVEMENT-ADMINISTRACION-LOGS-ERROR-REAL` (`criterio_06=0.88`, `criterio_07=0.75`). En
  los tres, `rollback_suficiente`, `compatibilidad_hacia_atras`, `criterios_verificables` y
  `hay_archivos_afectados` salieron entre 0.80 y 0.98, y los planes traen decisiones con
  alternativa, trazabilidad al diagnóstico y archivo por paso. **Eran para pasar**; la banda
  son los `criterio_NN`, que en el POS son de comando y en los otros dos incluyen los
  `verify: manual`.
- **Dos `qa-mechanical` en REVIEW sin proposiciones** (los 9 criterios son `verify: manual`):
  `BUGFIX-DOCKERHUB-429-20260930`, con la decisión del PO registrada («Apruebo el REVIEW y
  autorizo commit y push selectivos a dev…») y el ticket cerrado; e
  `IMPROVEMENT-CLIENTE-DEV-20260930`, todavía en `awaiting_user_tests` esperando la prueba real.
  No hay veredicto que aprobar en ninguno de los dos, y así está escrito en su recibo.

La segunda pasada de mejora volvió a no mover los `criterio_NN` del plan: en los tres de hoy
los valores quedaron iguales o bajaron (0.60→0.79/0.47, 0.46→0.73/0.77, 0.79→0.88/0.75), con
el artefacto sin cambios de alcance. Es el patrón que ya está propuesto como ticket del
harness.

## Hallazgos del flujo

1. **El requisito de la feature está truncado en la fuente y se propagó a los tickets.**
   En `.valmen/features/timeline-fases/spec/s1-linea-fases/spec.md:32` la cabecera dice
   `### Requirement: R-S1-004 — Solo lectura y append-only — La línea de fases DEBE derivarse
   leyendo el registro: la feature no escribe en los` —cortada a mitad de frase— y lo mismo
   pasa en R-S1-003 y R-S1-005. El materializador copia la cabecera como enunciado del
   requisito, así que `CHORE-CORE-TEST-READONLY-FASES-20260929` nació con ese texto como
   `## Solicitud original` **y como su único criterio de aceptación**, que ningún test puede
   verificar. El cuerpo del requisito, debajo de la cabecera, sí está completo. Por eso este
   artefacto no pasa por más corridas que se hagan: el arreglo son dos líneas, no otra pasada.
2. **Tres corridas del worker terminaron en `protocol_violation` y la tarjeta se detuvo.**
   El worker sale con rc=0 sin llamada terminal, y el mensaje del tablero lo dice: «exited
   cleanly (rc=0) without `kanban_complete`, `kanban_block` or `kanban_request_review` — a run
   without a terminal kanban call counts as failed no matter what it did». Pasó tres veces
   seguidas (límite 3) después del desbloqueo de las 21:30, con el trabajo del eslabón ya
   escrito y ajeno intacto. El eslabón 2 tuvo un crash de otra causa a las 18:01 y se recuperó.
3. **La decisión del PO sobre una compuerta en REVIEW entra por la línea del plan y no por
   `gate-decide`.** En los tres tickets de SaiOpenCloud la transición `planned → approved` se
   cerró con la frase de autorización de la jornada escrita en el plan, y el recibo quedó
   `escalatedTo: human` con `humanDecision: null`: el relé sigue contando como pendientes
   tickets ya cerrados. Es el mismo hueco que arrastra la jornada del 28–29.
4. **Trabajo con migración que ningún ticket explica.** En `dev` entraron hoy dos commits del
   módulo de Pedidos (`d741afeb` 14:05, `8afb3eb1` 14:36) —esqueleto backend+frontend de la
   «Entrega 1» y una migración `0002` que renombra índices de `PedOrderHeader`/`PedOrderLine`—
   sin ticket en `docs/tickets/`, sin feature en `.valmen/features/` y sin recibo de compuerta.
   Se reporta como grupo sin dueño: no se le inventa uno.
5. **Las tres solicitudes de la jornada del harness son enunciados de requisito, no síntomas.**
   Sobre ellos, `diagnostico_explica_el_sintoma` (peso 3) cayó entre 0.78 y 0.88 en las tres,
   mientras el mismo evaluador dio 0.92 y 0.93 en los dos análisis de SaiOpenCloud que sí
   traían síntoma. La señal apunta a la forma de la solicitud —el materializador copia `R-S*`
   tal cual— y no al evaluador, que es el que el parte anterior dejó como sospecha.

## Lo que se hizo con eso

- **Harness: dos tickets entregados.** `FEATURE-CORE-DERIVAR-FASES-20260929` y
  `FEATURE-API-FASES-20260929` quedaron en `awaiting_user_tests` con sus pruebas corridas
  (1638 y 1643 pruebas pasadas; batería completa por archivo y por suite), los criterios de
  comando tildados y el `verify: manual` sin tildar a propósito, y el consumo de cada sesión
  registrado. Los commits van por ticket (`engine(fases)`, `feature(api-fases)` y sus
  `registro(ticket)`), y la jornada de siete quedó en **dos entregados, uno detenido y cuatro
  sin correr**.
- **SaiOpenCloud: los tres tickets de la jornada cerrados** con QA aprobado por el PO, más
  `BUGFIX-DOCKERHUB-429-20260930` cerrado el mismo día (los cuatro tags `dev-aa02067`
  publicados y el entorno dev funcionando). `IMPROVEMENT-CLIENTE-DEV-20260930` quedó en
  `awaiting_user_tests` con su contrato de prueba manual para el canario de Windows.
- **Esta sesión no commiteó nada**: el parte se deja escrito y sin commitear. En el árbol del
  harness siguen sin commitear el parte de ayer, el ticket y el recibo del eslabón 3 y
  `.valmen/receipts/FEATURE-CORE-DERIVAR-FASES-20260929.jsonl`; en el de SaiOpenCloud, los
  archivos del cliente dev y el índice del registro.
- **Las 19 compuertas sin decisión registrada no se tocaron**: eso es decisión del PO y
  necesita su orden.

## Pendientes, con recomendación

- **Registrar las 19 decisiones sin firmar.** **Recomiendo hacerlo**, en una pasada por lote
  con `gate-decide`, citando en cada `reason` la autorización **de ese** ticket —la frase que
  quedó en su plan o la del desbloqueo— y no una genérica del día. Composición: 17 en once
  tickets ya cerrados de SaiOpenCloud, 1 en el `FEATURE-CORE-DERIVAR-FASES` (el análisis se
  volvió a correr después de la aprobación y quedó sin decisión) y 1 en el
  `CHORE-CORE-TEST-READONLY-FASES`, cuya decisión el PO ya dio por Telegram a las ~21:25.
  Trece de las diecinueve arrastran del 28–29. La vigésima —el `qa-mechanical` del
  `IMPROVEMENT-CLIENTE-DEV`— está esperando tu prueba real y no se toca.
- **Arreglar la cabecera truncada del spec y el criterio del `CHORE`.** **Recomiendo** las dos
  líneas antes de reintentar nada: sin eso, el eslabón 3 vuelve a la misma compuerta con el
  mismo 0.57 y el plan sigue sin poder escribirse con un criterio verificable.
- **Reencolar el eslabón 3 y revisar por qué los workers no cierran la tarjeta.** **Recomiendo**
  reencolarla a mano (quedó en `gave_up` con el tope de violaciones de protocolo agotado) y
  decir en el brief que el cierre exige la llamada terminal: es el mismo pedido que dejó el
  parte de ayer sobre las tarjetas muertas en su último paso.
- **El arranque de mañana no está agendado.** **Recomiendo** crear el `jornada-arranque
  2026-10-01` (o aceptar que el despacho es a mano y borrar el mecanismo), y no dejar los dos
  caminos vivos: hoy el job del 30 corrió y las tarjetas se despacharon solas, que es lo que
  hay que conservar.
- **El módulo Pedidos entró sin ticket.** **Recomiendo** decidirlo antes de que siga creciendo:
  o se abre el ticket con su migración declarada (el `sync_impact` y el impacto de migración
  son reales), o se declara modo directo y queda escrito que esto no pasó por el flujo.
- **La prueba que espera al PO:** dos tickets del harness (`FEATURE-CORE-DERIVAR-FASES`,
  `FEATURE-API-FASES`) y uno de SaiOpenCloud (`IMPROVEMENT-CLIENTE-DEV`, en el canario de
  Windows). Los tres tienen su contrato de pruebas escrito en el ticket.

## Cómo se arma este parte

Se produce solo, todos los días a las 21:30, con el job `parte-diario-del-harness` del perfil
`valmen-harness`. La forma y las fuentes están en la skill `valmen-parte-diario`: primero la
fecha real, después los jobs del día de los dos perfiles —lo que corrió y lo que estaba
agendado sin correr—, después las entregas en `cron/output/<job_id>/`, después los recibos de
los tickets de la jornada (`propositions[].value`, `.weight`, `.verdict`, quién evaluó y el
`stateHash`), después el ticket para juzgar el fondo leyendo el artefacto y no el veredicto, y
al final el chequeo que no se saltea: la última corrida de cada compuerta con
`escalatedTo: "human"` y `humanDecision: null`, en los dos registros. Hoy dio **19 sin decisión
registrada (17 en SaiOpenCloud y 2 en el harness) más una espera legítima**. Para esta edición
se usaron además los dos tableros (`~/.hermes/kanban/boards/*/kanban.db`: tarjetas, corridas y
eventos de bloqueo) y el registro de ejecuciones de cron de ambos perfiles, que es donde se ve
que ningún job falló. Los costos y los hashes no entran acá: viven en el ticket.
