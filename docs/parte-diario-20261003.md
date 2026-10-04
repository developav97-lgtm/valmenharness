# Parte diario — 2026-10-03

Cierre del trabajo autónomo del día. Se lee el registro, no lo que reportaron las sesiones:
cada afirmación de acá salió de un recibo de compuerta (`.valmen/receipts/`), del `ticket.md`,
de los jobs y las ejecuciones de cron de los dos perfiles (`cron/jobs.json`, `cron/executions.db`),
de las entregas en `cron/output/`, del tablero (`kanban.db`) o del árbol del repositorio.
La fecha real es la del `date` (2026-10-03, sábado; este parte corre a las 21:30).
El id de un recibo lleva la fecha UTC: después de las 19:00 de Bogotá aparece con el día
siguiente (`GR-20261004-*`), y sigue siendo de hoy.

## Qué corrió

### ValmenHarness — ningún job agendado trabajó; el día se hizo por sesiones

| Job | Disparo | Qué salió |
|---|---|---|
| `aviso-telegram-awaiting-jornada` (`af769dd89fb4`, cada 3 min, script) | 310 corridas | todas silenciosas (`suppressed`) |
| `parte-diario-del-harness` (`489da7b8e9b2`, agente) | 21:30 | esta edición |
| resto de los jobs del perfil | — | `enabled: false`, sin disparo |

**Nada agendado para hoy quedó sin correr, y ninguna corrida del día falló**
(`executions.db`: 310 `completed`, cero `failed`, cero incidentes abiertos). Los 16 one-shots
del perfil siguen en pausa y no disparan.

**El trabajo del día no vino de ningún cron, y es el grueso: quince tickets del harness se
analizaron, planearon, implementaron, pasaron QA y se cerraron entre las 00:30 y las 20:02.**
Son los `FEATURE-*` del lote materializado el 01-oct (adaptadores de lectura, jornadas
persistidas, ventanas y autorización de jornada, Mission Control). Quedaron los quince
`closed` / `qa_status: approved` / `unreleased`, con 18 commits en el día (00:33 → 20:02) y el
árbol de trabajo limpio (`git status --short` sin salida).

### SaiOpenCloud — día sin trabajo: sólo los vigilantes

| Job | Disparo | Qué salió |
|---|---|---|
| `vigilante-de-jornada` (`407b97cdf000`, cada 30 min, script) | 41 corridas | todas silenciosas: no hay jornada que vigilar |
| `aviso-telegram-awaiting-jornada` (`87d525a774a3`, cada 3 min, script) | 309 corridas | todas silenciosas |

Cero corridas de compuerta, cero tickets tocados, cero recibos nuevos y cero commits en el
proyecto de trabajo. El tablero (`kanban.db`) no tiene tarjetas vivas (`done`: 22,
`archived`: 5). Sigue en el árbol, sin commitear, el trabajo pendiente del 30-sep/02-oct:
`IMPROVEMENT-CLIENTE-DEV-20260930` (`awaiting_user_tests`, `qa_status: pending`) con su recibo
sin versionar, más `docs/local/*`, `docs/aws/costo-septiembre-2026.html` y
`.valmen/{config,routing}.yaml`. Nada de eso se movió hoy.

### La entrega del perfil sigue apuntando a Slack, que está apagado

`parte-diario-del-harness` tiene `deliver: origin` y `platforms.slack.enabled: false` en los dos
perfiles. Las dos corridas anteriores de este job (01 y 02-oct) cerraron con
`delivery_outcome: failed`; el archivo es el canal real. Las otras entregas del día no
fallaron porque los vigilantes son scripts silenciosos con `deliver: local`: la mitad del
camino de avisos la hace el propio script, no el cron.

## ¿Los artefactos eran para pasar?

El juicio se hace leyendo el artefacto y el campo `verdict` de cada proposición, que dice cuáles
emiten veredicto y cuáles son contexto. Hoy hubo **81 corridas de compuerta** en el harness:
`analysis` 32 (6 approve, 17 block, 9 review), `plan` 28 (15 approve, 13 block) y
`qa-mechanical` 21 (21 approve).

- **Los quince artefactos finales sí eran para pasar, y salieron limpios.** Los quince planes
  terminaron en `approve`, con las `criterio_NN` entre 0.94 y 1.00, y los quince
  `qa-mechanical` aprobaron con sus criterios de comando en `1.00` (21 corridas, todas approve).
  Ninguno cerró con una proposición de fondo en banda.
- **Los primeros borradores no eran para pasar, y ahí estuvo el día: 30 bloqueos duros.** De los
  30, **17 son `analysis`** que fallaron `diagnostico_explica_el_sintoma` con valores de
  0.02 a 0.09 —no una banda al borde del umbral, sino el evaluador diciendo que el diagnóstico
  no explica el síntoma— y **13 son `plan`** que fallaron `criterio_NN` entre 0.01 y 0.09
  (`criterio_01` en ocho de ellos, `criterio_02`/`criterio_03` en los tres de
  `FEATURE-MC-HOJA-RUTA`). Los cinco criterios de un plan son los requisitos del sprint: un paso
  que los da por cumplidos sin decir cómo se mide ≈0 y bloquea.
- **Se reescribió y se volvió a correr, y el artefacto se movió de verdad.** `MODELO-INTENTO`
  necesitó seis corridas de plan (`b→b→b→b→b→b→a`), `HOJA-RUTA` cinco (`b×4→a`),
  `ADAPTER-CAPACIDADES`, `HERMES-LECTURA`, `CONTEXTO-UI` y `PANEL-HERRAMIENTAS` tres de análisis
  cada uno (`b×3→a`). Ningún bloqueo quedó sin resolver: los quince tickets se cerraron hoy
  mismo. No es el `REVIEW` de redacción de siempre —hoy la compuerta bloqueó y el trabajo volvió
  sobre el artefacto.
- **Los 9 `REVIEW` son de una sola proposición.** Siete líneas quedaron en banda por
  `diagnostico_explica_el_sintoma` entre 0.74 y 0.895 (`OPENCODE-CODEX` ×3, `HOJA-RUTA` ×3,
  `RECONEXION` ×1) y se resolvieron reescribiendo; una quedó en banda por `nombra_archivos_reales`
  en 0.88. El noveno es un `REVIEW` sin ninguna proposición en banda:
  `RECONEXION-RECONCILIACION`, con el motivo «no se evaluó el impacto» — el caso conocido del
  ticket que declara `sin impactos`, donde `riesgos_cubren_impactos` no tiene de qué agarrarse.
- **Dos escaladas se decidieron con la política EST-004, y es la primera aplicación real de la
  regla.** `HOJA-RUTA` y `RECONEXION` (ambos `analysis`): tras dos revisiones equivalentes del
  mismo diagnóstico, el PO autorizó continuar con la corrección ya incorporada. Quedó su
  `humanDecision` en el recibo y el evento `gate-approved` en el ticket, citando la autorización
  —no una frase genérica del día—. El estándar se aceptó y entró en vigor hoy (commit
  `docs(proceso)` de las 17:47, con el `AGENTS.md` regenerado).
- **Cada cierre declaró su consumo sin inventar números.** Los quince tickets traen una entrada
  `manual:` que dice que la sesión de Codex sirvió a varios tickets y que no se atribuyen tokens
  ni coste. Es exactamente lo que el estándar pide cuando una sesión sirve más de un ticket.
- **Los criterios quedaron marcados.** 38 casillas `[x]`, cero `[ ]`, y los quince con su línea
  de resultado del PO en `## Pruebas`. Ningún ticket entregado afirma que hay criterios que nadie
  miró.

## Hallazgos del flujo

1. **El bloqueo duro, no la banda, fue el modo dominante del día: 30 de 81 corridas.** El 53% de
   los análisis (17 de 32) y el 46% de los planes (13 de 28) fallaron en la primera pasada con
   valores de 0.01 a 0.09. Las dos proposiciones que lo producen son las mismas de siempre
   —`diagnostico_explica_el_sintoma` y las `criterio_NN`—, pero hoy no se quedaron en la banda de
   revisión: cayeron por debajo del bloqueo. La ida y vuelta se pagó completa (reescribir,
   re-correr, cerrar) y el resultado final quedó limpio; lo que no se sabe es cuánto de esa
   primera pasada es el artefacto y cuánto el evaluador midiendo redacción.
2. **Casi la mitad de las corridas de compuerta del día devolvió el artefacto.** 81 corridas para
   cerrar quince tickets: 42 aprobaron, 30 bloquearon y 9 quedaron en revisión. El camino mínimo
   —análisis, plan y QA de cada uno— son tres corridas por ticket; el resto fue volver sobre el
   mismo artefacto. Es el costo real del día y no aparece en ningún ticket.
3. **Un `REVIEW` sin ninguna proposición en banda, y el motivo es el impacto.** En
   `RECONEXION-RECONCILIACION` el veredicto salió por «no se evaluó el impacto» con las cuatro
   proposiciones de veredicto por encima del umbral. Es el patrón ya identificado: un ticket de
   pantalla que declara `sin impactos` deja `riesgos_cubren_impactos` sin nada que medir, y la
   compuerta devuelve a la persona un artefacto que ya resolvió.
4. **Hoy no quedó ninguna compuerta escalada nueva sin decidir.** Las dos escaladas del día
   (`HOJA-RUTA` y `RECONEXION`) tienen su decisión registrada con `gate-decide`, y el harness
   quedó con una sola firma faltante, heredada de ayer (hallazgo 5).
5. **En el harness falta una firma, y se le pasó a la firma por lote de ayer.** Es
   `FEATURE-MC-SELECTOR-PROYECTOS-20261001` / `GR-20261002-analysis` (02-oct 18:59 local): una
   línea, `escalatedTo: human`, sin `humanDecision` en ninguna de sus líneas. El ticket sí tiene
   su evento `gate-approved` y su autorización escrita, pero contra el recibo siguiente
   (`GR-20261003-analysis`), que sí quedó decidido; el anterior quedó huérfano. Después de esa
   decisión hubo además una corrida más del mismo gate que volvió a escalar sin firma. Leídas
   por última línea, las compuertas del harness dan 2 pendientes; el estado real de un recibo es
   «¿alguna de sus líneas tiene `humanDecision`?», y con ese criterio es 1.
6. **SaiOpenCloud sigue con 27 compuertas escaladas sin firma, sin cambios respecto de ayer**
   (28-sep al 02-oct, 19 tickets). Ninguna se firmó hoy, y el proyecto no tuvo actividad de
   ningún tipo. Los tickets están cerrados y sus planes citan la autorización del PO: el registro
   afirma a la vez que se aprobó y que la compuerta espera persona.
7. **La entrega del perfil del harness sigue rota y sin tocar.** El job del parte mantiene
   `deliver: origin` con Slack apagado en los dos perfiles; las dos corridas anteriores de este
   mismo job fallaron la entrega. La recomendación de ayer sigue abierta y el archivo es el
   respaldo.

## Lo que se hizo con eso

- **Los quince tickets se cerraron y se commitearon, en commits por ticket** (18 en el día, del
  `feat(adapter)/feat(engine)/feat(mc)/feat(server)` de la madrugada al `feat(mc)` de las
  20:02). El árbol del harness queda limpio.
- **El parte de ayer se commiteó** (`docs: agregar reporte diario del 2 de octubre`, 16:45) —
  era una orden pendiente, y hoy ya está en `HEAD`.
- **El estándar EST-004 quedó en vigor** (escalada tras dos bloqueos semánticos equivalentes) y
  se aplicó dos veces el mismo día, con la autorización citada en el `reason` de cada recibo.
- **De las compuertas huérfanas no se firmó nada:** la del harness y las 27 de SaiOpenCloud
  siguen esperando. Firmarlas es una orden de la persona, no una decisión del cierre.
- **El tablero del harness está al día:** la única tarjeta fuera de `done` es la del propio
  parte diario (`blocked`, tomada por esta corrida).

## Pendientes con recomendación

1. **Firmar las 27 compuertas escaladas de SaiOpenCloud, más la que quedó suelta en el harness
   —recomendado, con la autorización ya vigente.** Es el trabajo que el harness cerró ayer y que
   al proyecto de trabajo le falta: se registran en una pasada con `gate-decide`, citando por
   ticket **su** frase (la del lote SAIOP para los del 02-oct, la que cada plan del 28–30-sep ya
   tiene escrita), y la `qa-mechanical` sin proposiciones se registra igual diciendo en el
   `reason` que la verificación fue manual del responsable. La del harness se suma con la
   autorización que ese ticket ya cita. *Recomiendo hacerlo: mientras no se firme, el registro
   y el relé siguen afirmando que hay trabajo esperándote por tickets ya cerrados.*
2. **Reapuntar la entrega del perfil del harness —recomendado, sin cambios desde ayer.** El
   `deliver: origin` de este job no resuelve con Slack apagado y ya falló dos veces. La
   recomendación es apuntarlo al mismo camino que funciona en SaiOpenCloud (el bot del perfil,
   Telegram habilitado) y revisar en la misma pasada los jobs vivos del perfil, que hoy mezclan
   `origin`, `local` y `telegram`. Es una escritura sobre jobs: pide tu orden.
3. **Entender por qué 30 artefactos fallaron duro en la primera pasada —propuesta.** Antes de
   tocar nada conviene una medición: el mismo diagnóstico y el mismo plan tienen que volver a
   medirse con otro evaluador, como se hizo en septiembre. Si el bloqueo se repite con el
   artefacto final, el problema es cómo se escriben los criterios del plan (un criterio que
   enuncia el requisito sin decir cómo lo cumple el plan se mide ≈0); si desaparece, el
   evaluador que resuelve el routing está castigando la redacción. Se propone, no se aplica:
   el umbral y el evaluador son decisiones tuyas.
4. **Ordenar y commitear lo pendiente de SaiOpenCloud —recomendado cuando quieras.** Es lo del
   30-sep/02-oct: el ticket `IMPROVEMENT-CLIENTE-DEV-20260930` (`awaiting_user_tests`) con su
   recibo, los `docs/local/*` de actualización del cliente dev, `docs/aws/costo-septiembre-2026.html`
   y la configuración del arnés. Son grupos distintos y van en commits distintos; el tree lleva
   días así y no se toca sin tu orden.
5. **El parte de hoy queda escrito y sin commitear.** Su commit es una orden tuya, como el de
   ayer.

## Cómo se arma este parte

Lo corre el job `parte-diario-del-harness` del perfil `valmen-harness` todos los días a las
21:30. Orden: la fecha real con `date`; los jobs de los dos perfiles y sus ejecuciones
(`cron/executions.db`, con `delivery_outcome`); las entregas en `cron/output/<job_id>/`; los
recibos de los tickets tocados, procesados con `json.loads` línea por línea; el ticket para el
juicio sobre la sustancia; y el chequeo que no se saltea —la última corrida de cada compuerta
con `escalatedTo=human` y sin decisión, en **los dos** registros, con la última línea por
`(ticket, id)` y contrastada contra «¿alguna línea de ese recibo tiene `humanDecision`?»—. El
juicio se hace leyendo el artefacto, no el veredicto, y con el campo `verdict` de cada
proposición para no reportar como banda lo que es contexto. Los costos, las rutas y los hashes
no entran al resumen del chat: viven acá y en el ticket. Este archivo se deja escrito y **sin
commitear**; su commit es una orden de la persona.
