# Parte diario — 2026-09-29

Cierre del trabajo autónomo del día. Se lee el registro, no lo que reportaron las
sesiones: cada afirmación de acá salió de un recibo, de un `ticket.md`, del tablero o
del árbol del repositorio.

## Qué corrió

### ValmenHarness — la jornada de siete tickets, despachada por el tablero

El perfil no tenía **ningún job agendado para hoy**: el único que corre es este parte.
Y hubo jornada igual, porque el arranque del harness no pasa por cron sino por el
dispatcher kanban (launchd `ai.hermes.gateway`, con `HERMES_BIN` corregido hoy a las
13:42 — antes de eso llegaron a correr hasta cinco workers contra un tope de uno). Las
siete tarjetas de la jornada `2026-09-29` se crearon a las 13:32 y quedaron `done`
entre las 13:32 y las 19:01, una por ticket:

| Prioridad | Tarjeta | Ticket | Cómo salió |
|---|---|---|---|
| 1 | `t_829e8bbd` | `FEATURE-HERMES-PERFIL-PROYECTO-20260926` | tres rondas de revisión, la 1 y la 2 devueltas por la evidencia; cerrada y subida |
| 2 | `t_93480453` | `FEATURE-ENGINE-DOGFOODING-REGISTRO-20260926` | dos crashes del worker y `gave_up`; el PO la desbloqueó y se re-despachó; cerrada |
| 3 | `t_279a50b0` | `INTEGRATION-CRM-ADOPTAR-PROYECTO-20260926` | bloqueada por la compuerta de análisis, desbloqueada; cerrada |
| 4 | `t_ec010025` | `FEATURE-DEPLOY-ACTUALIZAR-MANUALES-20260926` | cerrada; avisada al PO a las 15:47 |
| 5 | `t_befa18a7` | `FEATURE-GATE-CRITERIO-PLAYWRIGHT-20260926` | revisión ronda 1 devuelta por un hueco de registro; ronda 2 aprobada |
| 6 | `t_48b14ed0` | `AGENT-DOCS-GENERAR-MANUAL-MARKDOWN-20260926` | bloqueada por `analysis` y por `plan`, con `block_loop_detected`; cerrada |
| 7 | `t_9e13d7ba` | `AGENT-GATE-AUDITAR-MANUAL-CITAS-20260926` | ronda 1 devuelta por un defecto real del gate; corregida y cerrada |

Además, `FEATURE-GATE-IMPACTO-NULO-BANDA-20260928` —el fix que el PO pidió el 28— se
aprobó y se cerró hoy, y `FEATURE-GATE-CRITERIO-PLAYWRIGHT-20260926` dejó su decisión
delegada registrada en el recibo. La feature `timeline-fases` quedó especificada,
descompuesta y materializada con siete tickets nuevos en `intake`.

### SaiOpenCloud — el arranque no corrió, la jornada se hizo igual

Cuatro jobs y un worker reapeado:

| Job | Disparo | Qué salió |
|---|---|---|
| `jornada-arranque 2026-09-29` (`fbe2eabb3771`, script) | 08:00 | **pausado a las 00:23 y nunca corrió** (`last_run_at: null`, 0 de 1 repetición) |
| `vigilante-de-jornada` (`407b97cdf000`, cada 30 min, script) | 00:19 → 21:19 | informe `ready/running/review/blocked` hasta las 12:59 (`running=5` a las 00:19, `blocked=5` fijo de 02:46 a 12:59) y silencio desde las 13:30 |
| `aviso-slack-awaiting-jornada` (`87d525a774a3`, cada 3 min, script) | creado 13:36, 60 corridas | tres avisos no silenciosos: 15:47 `t_ec010025` en review, 16:31 y 17:26 `t_9e13d7ba` blocked→review |
| `jornada-arranque 2026-09-30` (`f7d13d09744d`, script) | creado 20:48 | agendado para mañana 08:00 |

Las cinco tarjetas de la jornada (prioridades 1–5) igual corrieron y quedaron `done`;
el registro cerró **siete** tickets del lote a las 09:48 y publicó la **6.3.0**; a las
20:46–20:47 un worker creó tres tarjetas nuevas (`FEATURE-ADMIN-PLANTILLA-PRECUENTA`,
`IMPROVEMENT-ADMINISTRACION-LOGS-ERROR-REAL`, `FEATURE-POS-SUCURSAL-USUARIO`) y las
agendó para mañana, y un worker fue reapeado a las 20:49. La jornada dejó además su
propio reporte en `~/.hermes/profiles/saiopencloud/jornadas/2026-09-29.md` (10:55).

## ¿Los artefactos eran para pasar?

**Sí, en los dos registros.** La banda volvió a ser redacción de criterios, y el fondo
salió en verde. Todo medido con un solo evaluador, `typesafe/jev-1.13-20260917`.

**Harness — 48 corridas** (21 `analysis`, 18 `plan`, 9 `qa-mechanical`), **0,0083 USD**:

- Los siete análisis en `REVIEW`: `diagnostico_explica_el_sintoma` (peso 3) entre 0,71 y
  0,90, mientras `causa_especifica` dio 0,90–0,97, `nombra_archivos_reales` 0,87–0,93,
  `clasificacion` completa y los cuatro checks mecánicos en verde.
  `riesgos_cubren_impactos` —descriptiva, sin veredicto— quedó entre 0,44 y 0,77: es el
  patrón del ticket sin impactos que el PO mandó arreglar y que hoy quedó cerrado.
- Los planes: **dos en `APPROVE`** (`INTEGRATION-CRM-ADOPTAR-PROYECTO` y
  `FEATURE-GATE-CRITERIO-PLAYWRIGHT`, con los once y nueve criterios entre 0,91 y 0,99) y
  cinco en `REVIEW` con la banda en el bloque de criterios —0,79–0,90, con sueltos de
  0,47, 0,82 y 0,79—. Las descriptivas del plan salieron en verde: `hay_archivos_afectados`
  0,97–0,98, `criterios_verificables` 0,93–0,97, `pasos_ejecutables` 0,89–0,96,
  `rollback_suficiente` 0,91–0,94 y `compatibilidad_hacia_atras` 0,81–0,90.
- El 0,47 es literalmente el criterio «el registro del propio motor pasa `validate --all`
  con código 0», que el gate mecánico verifica por código de salida: la banda es de
  redacción sobre criterios que no dependen de un modelo. Que el mismo día, con
  artefactos equivalentes, dos planes hayan salido en `APPROVE` dice que el umbral es
  granularidad y no alcance.

**SaiOpenCloud — 30 corridas** (8 `analysis`, 12 `plan`, 10 `qa-mechanical`), **0,0035 USD**:

- Los análisis en `REVIEW`: `diagnostico_explica_el_sintoma` 0,79–0,88 con
  `causa_especifica` 0,91–0,96, `nombra_archivos_reales` 0,92–0,93 y `clasificacion`
  completa.
- Los planes: banda de criterios con dos sueltos que el artefacto explica —0,40 en un
  criterio `verify: manual` de pantalla («la confirmación enuncia cuántas facturas se van
  a anular») y 0,66 en uno cuyo comando es el `docker compose … test
  ModPos.tests.test_edicion_dev`— y las descriptivas en verde (0,93–0,98).
- Un `qa-mechanical` en `REVIEW` cuya razón es informativa: «los 8 criterio(s) se
  verifican a mano: los prueba el responsable en el estado siguiente».
- El plan de `BUGFIX-POS-EDICION-MANUAL-AJUSTES-20260929` necesitó seis rondas
  (la tercera bajó a 0,15/0,17/0,17) antes del `APPROVE` de las 09:09.

## Hallazgos del flujo

1. **Un `BLOCK` de `qa-mechanical` que no era del cambio.** En
   `BUGFIX-POS-EDICION-MANUAL-AJUSTES-20260929`, a las 09:35 la compuerta dio `BLOCK` con
   `criterio_01/02/03/06/07 = 0,00` y a las 09:37 `APPROVE`. La corrida bloqueada duró
   **1,4 s** y la que aprobó **48 s**: los comandos no llegaron a correr en la primera, así
   que se leyó como fallo del trabajo lo que era del entorno del gate.
2. **Las compuertas escaladas sin decisión siguen del lado de SaiOpenCloud: 13 en 8
   tickets, contra 0 en el harness.** Se acumulan desde el 28 —no se hizo el registro por
   lote que el parte de ayer recomendaba— y las corridas de hoy agregaron **ocho** sin
   decisión en seis tickets: `FEATURE-RELLENO-ANULACION-PANTALLA-20260928` y
   `FEATURE-EDICION-REORGANIZACION-20260928` (sus planes), `IMPROVEMENT-PANTALLA-FACTURA-REORGANIZACION-20260924`
   (análisis y `qa-mechanical`), `FEATURE-EDICION-RESTAURANTE-ORDER-20260924` (análisis y plan),
   `SYNC-EDICION-RESYNC-SAIOPEN-20260924` (análisis) y `BUGFIX-POS-EDICION-MANUAL-AJUSTES-20260929`
   (análisis).
   Los tickets ya cerraron —varios publicados—, así que el relé los sigue contando como
   esperando a una persona. En el harness pasó lo contrario: **once decisiones quedaron
   registradas hoy** y una ronda de revisión (`t_befa18a7`) devolvió el trabajo justamente
   porque una compuerta de análisis había quedado escalada sin decisión.
3. **La evidencia se verificó de verdad, y dos veces mordió.** `FEATURE-HERMES-PERFIL-PROYECTO`
   necesitó tres rondas: la 1 volvió porque el `worktree:sha256` de `EVIDENCE-001` no
   verificaba contra el árbol, la 2 porque la corrección se había aplicado **sobre una
   premisa falsa** y dejaba afirmaciones falsas en el registro, y la 3 trajo las dos
   mediciones (el blob del commit y el árbol de trabajo). Es el control que evita que un
   hash inventado pase como evidencia.
4. **Un defecto del propio gate, encontrado por la revisión.** Un manual escrito con la
   plantilla que el harness publica volvía `block`: las cinco líneas del bloque de metadata
   y la cabecera de tabla se leían como afirmaciones. Se corrigió con un commit propio
   (`fix(gate)`: el bloque de metadata y la cabecera de tabla no son afirmaciones) y la
   revisión lo trató como corrección del verificador, no del ejecutor.
5. **Las tarjetas se frenan en la compuerta y esperan al PO.** Cuatro de las siete del
   harness quedaron `blocked` por compuertas en `REVIEW` y una llegó a
   `block_loop_detected` (`analysis` y `plan` en banda tras dos corridas): cada una necesitó
   el desbloqueo de una persona. Y el worker del eslabón 2 crasheó dos veces antes de
   `gave_up` («pid not alive»), con el tope del dispatcher en dos intentos.
6. **En SaiOpenCloud la jornada terminó con cuatro de cinco tarjetas muertas en su último
   paso** —manifiesto de entrega y rondas de confirmación— con el trabajo ya entregado, y
   las cinco quedaron `blocked` en el tablero hasta las 13:19, cuando alguien las cerró a
   mano. Lo dice el reporte de la propia jornada, junto con `hermes kanban dispatch`
   rechazado en contexto de worker: el encadenamiento quedó sin ejecutar.
7. **El arranque de la jornada de SaiOpenCloud no corrió por el job.** El job estaba
   agendado a las 08:00 y quedó pausado a las 00:23 con `last_run_at: null`, así que las
   cinco tarjetas se despacharon a mano. La vigilancia sí funcionó: avisó al PO cuando una
   tarjeta entró en review y cuando una compuerta la bloqueó.

## Lo que se hizo con eso

- **Harness: ocho tickets cerrados** —los siete del lote más
  `FEATURE-GATE-IMPACTO-NULO-BANDA-20260928`, que es el fix que el PO pidió ayer sobre la
  proposición inaplicable y las señales de redacción—, **37 commits**, árbol limpio y la
  rama a la par de `origin/main` (`0 0`). Las rondas de evidencia del `FEATURE-HERMES` y la
  corrección del gate quedaron en commits propios, cada uno declarando qué agregaba.
- **Una feature nueva en el registro**: `timeline-fases`, especificada, descompuesta y
  materializada con siete tickets en `intake`.
- **SaiOpenCloud: los cinco tickets de la jornada cerrados y publicados en la 6.3.0**
  (PR #43), siete tickets del lote cerrados, ocho tickets nuevos del lote del 29/09 en
  `intake` y tres tarjetas agendadas para mañana. **27 commits**, rama a la par de
  `origin/dev` (`0 0`).
- **Las trece compuertas huérfanas no se registraron**: eso es decisión del PO y necesita
  su orden.
- **Este parte**, escrito y dejado sin commitear, como todos.

## Pendientes, con recomendación

- **Registrar las trece decisiones sin firmar de SaiOpenCloud.** **Recomiendo hacerlo**, por
  lote, citando en cada `reason` la autorización **de ese** ticket (la frase que quedó
  escrita en su plan), y no una genérica del día. Es lo mismo que se hizo la noche del 26
  con las treinta. El argumento subió de cinco a trece en un día: mientras el recibo diga
  `humanDecision: null`, el relé sigue contando como pendientes tickets ya cerrados y
  publicados. No se hace por iniciativa propia: **necesita tu orden**.
- **Un solo mecanismo de arranque para la jornada.** **Recomiendo** quedarse con el job de
  mañana (`jornada-arranque 2026-09-30`, ya creado y habilitado) y verificar que corra, en
  vez de despachar a mano mientras el job duerme: el de hoy no corrió y el día dependió de
  que alguien lo hiciera. Si el criterio es despachar a mano, conviene borrar el job para
  que su silencio no se lea como olvido.
- **El `BLOCK` de 1,4 s del `qa-mechanical`.** **Recomiendo** revisar, antes que el ticket,
  la forma del comando de los criterios: cinco criterios en 0,00 dentro de una corrida de
  segundo y medio es la firma de comandos que no llegaron a ejecutar, no de un cambio roto.
  Es el mismo caso que ya está escrito en la skill de compuertas: el flag que evita recrear
  la base de pruebas, o el tope de tiempo mal puesto.
- **La banda del bloque de criterios en `plan` queda sin cubrir.** El fix cerrado hoy toca
  la proposición inaplicable y las señales de redacción de `analysis`, no los `criterio_NN`
  del plan, que hoy volvieron a mandar a `REVIEW` cinco de siete planes con valores 0,79–0,90
  sobre criterios que el gate mecánico verifica por comando. **Recomiendo abrirlo como ticket
  del harness** con estas mediciones, que es la puerta por la que el pedido anterior entró
  bien.
- **Cuatro tarjetas muertas en su último paso y un worker con `gave_up`.** **Recomiendo**
  lo que ya pide el reporte de la jornada: decir en el brief del worker qué se espera de una
  ronda de confirmación y qué campos pide el manifiesto de entrega antes de que la tarjeta
  se caiga con el trabajo hecho.
- **`hermes kanban dispatch` rechazado desde el worker.** **Recomiendo** resolverlo antes de
  la próxima jornada encadenada: hoy no hizo falta —no quedó ningún eslabón `ready`— pero el
  encadenamiento automático depende de eso.

## Cómo se arma este parte

Se produce solo, todos los días a las 21:30, con el job `parte-diario-del-harness` del perfil
`valmen-harness` (`cronjob_manage action='list'`). La forma y las fuentes están en la skill
`valmen-parte-diario`: primero la fecha real, después los jobs del día de los dos perfiles
—lo que corrió y lo que estaba agendado sin correr—, después los recibos de los tickets que
esos jobs tocaron —`propositions[].value`, `.weight`, `.verdict`, quién evaluó y el
`stateHash` del artefacto—, después el ticket para juzgar el fondo leyendo el artefacto y no
el veredicto, y al final el chequeo que no se saltea: la última corrida de cada compuerta con
`escalatedTo: "human"` y `humanDecision: null`, en los dos registros. Hoy dio **trece en
SaiOpenCloud y cero en el harness**. Para esta edición se usaron además el tablero
(`kanban.db` de los dos tableros, con los eventos de cada tarjeta) y el reporte de la jornada
de SaiOpenCloud, que es donde vive el detalle de las cinco tarjetas. Los costos y los hashes
de las sesiones no entran acá: viven en el ticket.
