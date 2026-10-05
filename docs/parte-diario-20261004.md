# Parte diario — 2026-10-04

Cierre del trabajo del día. Se lee el registro, no lo que reportaron las sesiones:
cada afirmación de acá salió de un recibo de compuerta (`.valmen/receipts/`), del `ticket.md`,
de los jobs y las ejecuciones de cron de los dos perfiles (`cron/jobs.json`,
`cron/executions.db`), de las entregas en `cron/output/` o del árbol del repositorio.
La fecha real es la del `date` (2026-10-04, domingo). Este parte corre **~2 h tarde**: el job
dispara a las 21:30 y esta edición se reclamó a las 23:36.
El id de un recibo lleva la fecha UTC: después de las 19:00 de Bogotá aparece con el día
siguiente (`GR-20261005-*`), y sigue siendo de hoy.

## Qué corrió

### ValmenHarness — ningún job agendado trabajó; el día se hizo por sesiones

| Job | Disparo | Qué salió |
|---|---|---|
| `parte-diario-del-harness` (`489da7b8e9b2`, agente) | 21:30 | esta edición |
| `aviso-telegram-awaiting-jornada` (`af769dd89fb4`, cada 3 min, script) | 221 corridas | todas silenciosas (`suppressed`) |
| resto de los jobs del perfil (16 one-shots) | — | `enabled: false`, sin disparo |

**Nada agendado para hoy quedó sin correr** (los one-shots están en pausa desde el 02-oct).
Lo que sí quedó a medias es **este job**: el disparo de las 21:30 se despachó a las 22:06
(`kind: late`, 36 min de atraso) y esa corrida quedó en la tabla como `running`, **sin cerrar
nunca** —fila huérfana en `executions.db`—; la edición que está leyendo corrió reclamada a las
23:36. **Las tres corridas anteriores del mismo job (01, 02 y 03-oct) cerraron con
`delivery_outcome: failed`** («platform 'slack' not configured/enabled»).

**El trabajo del día no vino de ningún cron: nueve commits entre las 13:57 y las 18:24.**
Cuatro tickets del lote de evolución del harness se implementaron, pasaron QA y se cerraron
(`FEATURE-GATE-VERIFY-DEV`, `FEATURE-CONFIG-ELEGIBILIDAD-AUTONOMA`,
`FEATURE-ENGINE-RUN-AUTONOMO`, `SECURITY-ENGINE-COLISIONES-ESCRITURA`), y
`BUGFIX-GATE-RECIBO-POR-INTENTO-20261004` se analizó, planeó, implementó, aprobó y cerró en el
mismo día. Quedó registrado en `intake` su hermano de motor, `BUGFIX-ENGINE-FIRMA-DE-COMPUERTA-20261004`.

### SaiOpenCloud — cuarto día sin trabajo de tickets

| Job | Disparo | Qué salió |
|---|---|---|
| `vigilante-de-jornada` (`407b97cdf000`, cada 30 min, script) | 48 corridas | todas silenciosas |
| `aviso-telegram-awaiting-jornada` (`87d525a774a3`, cada 3 min, script) | 219 corridas | todas silenciosas |

**Cero corridas de compuerta, cero recibos nuevos, cero commits.** El último commit del
proyecto es del 02-oct. El árbol sigue con lo mismo pendiente de commit desde el 30-sep/02-oct
(`IMPROVEMENT-CLIENTE-DEV-20260930` en `awaiting_user_tests` con su recibo sin versionar,
`docs/local/*`, `docs/aws/costo-septiembre-2026.html` y la configuración del arnés). El tablero
(`kanban.db`) no tiene tarjetas vivas (`done: 22`, `archived: 5`).

### A la hora del corte había una sesión escribiendo el árbol

A las 23:37–23:38 una sesión viva movió `FEATURE-GATE-CALIBRACION-EVIDENCIA-20260926` de
`intake` a `analyzed` y corrió su primer `analysis` (que **bloqueó**,
`diagnostico_explica_el_sintoma=0.08`), dejando su `ticket.md`, el índice y un recibo nuevos.
Lo de acá es una foto de ese momento; ese trabajo sigue en curso y no es de este cierre.

## ¿Los artefactos eran para pasar?

Hoy hubo **29 corridas de compuerta**, todas en el harness: `analysis` 10 (4 approve, 3 block,
3 review), `plan` 10 (4 approve, 4 block, 2 review) y `qa-mechanical` 9 (9 approve). SaiOpenCloud
no corrió ninguna.

- **Los cinco artefactos que cerraron sí eran para pasar, y salieron limpios.** Los planes de los
  cuatro `FEATURE`/`SECURITY` terminaron en `approve` con las `criterio_NN` entre 0.93 y 0.99, y
  los nueve `qa-mechanical` aprobaron con sus criterios de comando en 1.00. Ninguno cerró con una
  proposición de fondo en banda.
- **Los bloqueos duros repitieron el patrón de ayer: 7 de 29.** Tres `analysis` fallaron
  `diagnostico_explica_el_sintoma` con 0.05, 0.05 y 0.08, y cuatro `plan` fallaron `criterio_NN`
  con 0.02 a 0.08 —no una banda al borde del umbral, sino el evaluador diciendo que el diagnóstico
  no explica el síntoma—. No es el artefacto vacío: en esas mismas corridas la clasificación, la
  causa específica y los archivos nombrados salieron entre 0.93 y 0.99. Se reescribió, se volvió a
  correr y el artefacto se movió de verdad.
- **Los cinco `REVIEW` son de `BUGFIX-GATE-RECIBO-POR-INTENTO`, y los resolvió un evaluador
  distinto.** Ese ticket corrió con `typesafe/jev-1.13-20260917` (los otros cuatro, con
  `gpt-6.1-sol`) y bajó tres corridas de `analysis` y dos de `plan` por la proposición de criterio
  entre 0.83 y 0.87, con todo el resto por encima de 0.90; su tercer `plan` aprobó con
  `criterio_07=0.91`. Son bandas de redacción de criterio, no un punto de fondo.
- **La escalada de ayer no se repitió como tercera corrida:** de las cuatro corridas del
  `analysis` de ese bugfix, tres escalaron a persona y una tiene su decisión registrada
  (`humanDecision`); de los dos `plan`, el tercero aprobó solo. El tipo `BUGFIX` no exige plan
  aprobado y el plan se corrió igual, que es lo que este proyecto pide de todos modos.
- **Lo que no se puede afirmar:** el `analysis` que corre ahora sobre
  `FEATURE-GATE-CALIBRACION-EVIDENCIA` volvió a bloquear con 0.08 y sigue en curso; su juicio no
  entra a este parte.

## Hallazgos del flujo

1. **La entrega de este job lleva cuatro corridas fallando y nadie la reapuntó.** `deliver: origin`
   con Slack apagado en los dos perfiles: los partes del 01, 02 y 03-oct cerraron en
   `delivery_outcome: failed`, y el intento de hoy quedó huérfano antes de entregar nada. El
   archivo es el canal real. Es la recomendación abierta desde el 2-oct, sin cambios.
2. **Un intento de job que muere no deja más rastro que una fila `running`.** El disparo de las
   21:30 quedó registrado como `running` y nunca cerró: ni entrega, ni error, ni `failed`. El
   siguiente intento reclamó el mismo slot dos horas después. Sin mirar `executions.db` —el parte
   lo hace por eso— el día se lee como si el job hubiera corrido a horario.
3. **AP-007, nuevo, con número: 14 tickets avanzaron a `approved` con la compuerta en `block` o en
   `review` y sin ninguna firma.** Es el feature `control-jornadas-ejecucion` (02 al 04-oct): ni
   evento `gate-approved` en el ticket ni `humanDecision` en el recibo; en el mismo rango hay 22
   recibos que sí traen decisión humana, así que el registro tiene las dos formas conviviendo y el
   ticket no permite distinguir cuál se aplicó. EST-004 exige que la aprobación quede atribuida a
   la política humana, pero no dice **dónde** se escribe. Ya está en
   `BUGFIX-ENGINE-FIRMA-DE-COMPUERTA-20261004` (`intake`), que es el arreglo de motor.
4. **El bugfix que se cerró hoy dejó sus siete criterios sin marcar.** `qa_status: approved` y
   `workflow_status: closed`, con 0 casillas `[x]` y 7 `[ ]`, mientras su `qa-mechanical` aprobó
   con los comandos en 1.00. El registro afirma a la vez que la QA pasó y que nadie comprobó cada
   criterio; es el primer cierre en varios días que queda así (los otros cuatro marcan 5 de 5).
5. **Las compuertas huérfanas siguen en el mismo lugar.** Harness: **2** en
   `FEATURE-MC-SELECTOR-PROYECTOS-20261001` (ticket cerrado) leídas por última línea —
   `GR-20261002-analysis` sin ninguna firma, y `GR-20261003-analysis` con firma y una corrida
   posterior que volvió a escalar; el criterio «¿alguna línea tiene `humanDecision`?» da 1—.
   SaiOpenCloud: **27** recibos en 17 tickets (28-sep al 02-oct), **sin cambios desde el 2-oct**.
   Firmar es una orden de la persona, no una decisión de este cierre.
6. **El evaluador se contradice, y hoy se vio otra vez.** `EST-006` —propuesto hoy— pide que una
   clasificación `completa` con las tres comprobaciones estructurales por encima de `approveAt` no
   pueda decidir `block` por una sola proposición semántica. Los siete bloqueos duros de hoy tienen
   exactamente esa forma (`diagnostico_explica_el_sintoma` 0.05–0.08 con causa, archivos y
   clasificación ≥0.86). Es una decisión de la persona: tocar el umbral o el evaluador no lo hace
   el cierre.
7. **La memoria se ordenó, y el triaje todavía espera.** `AP-006` perdió su campo de estado
   duplicado, `AP-007` entró con su rango, `AP-003/004/005` quedaron clasificados y `EST-006`
   propuesto. Lo que sigue sin decidir son las propuestas en sí (`EST-006`) y el estado de los
   aprendizajes que quedaron en `pendiente`.

## Lo que se hizo con eso

- **Los cinco tickets se cerraron y se commitearon, en commits por ticket** (nueve en el día,
  13:57 → 18:24), con las pruebas corridas y citadas en cada uno: las focales, `npm run build`, la
  suite completa (1.903 pruebas en el bugfix del recibo) y el lint.
- **El bugfix del recibo dejó el síntoma medido:** `valmen usage` pasó de informar 9 evaluaciones
  en 4 tickets a 100 en 37, que es el defecto que declaraba su diagnóstico.
- **La memoria del harness se ordenó** (AP-006 corregido, AP-007 registrado, AP-003/004/005
  triados, EST-006 propuesto) y **el parte del 3-oct se commiteó** (17:38), que era la orden
  pendiente de ayer.
- **De las compuertas huérfanas no se firmó nada:** las 2 del harness y las 27 de SaiOpenCloud
  siguen esperando.
- **El árbol del harness queda con un solo pendiente**, y no es de ningún ticket: el trabajo vivo
  sobre `FEATURE-GATE-CALIBRACION-EVIDENCIA` que se está escribiendo ahora.

## Pendientes con recomendación

1. **Firmar las compuertas escaladas —recomendado, y ya lleva dos días abierto.** Las 27 de
   SaiOpenCloud más la del harness (`FEATURE-MC-SELECTOR-PROYECTOS`). Se registran en una pasada
   con `gate-decide`, citando **por ticket** su propia autorización —la del lote SAIOP para los del
   02-oct, la que cada plan del 28–30-sep ya tiene escrita—, y las `qa-mechanical` sin proposiciones
   se registran igual diciendo en el `reason` que la verificación fue manual del responsable.
   *Recomiendo hacerlo: mientras no se firme, el registro y el relé siguen afirmando que hay trabajo
   esperándote por tickets ya cerrados. El arreglo de motor (`BUGFIX-ENGINE-FIRMA-DE-COMPUERTA`)
   evita que vuelva a pasar, pero no firma lo que ya quedó atrás.*
2. **Reapuntar la entrega de este job a Telegram —recomendado, cuarta corrida fallando.** El
   `deliver: origin` no resuelve con Slack apagado. La recomendación es apuntarlo al camino que ya
   funciona en SaiOpenCloud (el bot del perfil) y revisar en la misma pasada los demás jobs vivos
   del perfil, que mezclan `origin`, `local` y `telegram`. Es una escritura sobre jobs: pide tu
   orden.
3. **Decidir `EST-006` —recomendado, con una medición antes.** La regla propone degradar a `review`
   el `block` que sale de una sola proposición semántica contradicha por el resto del recibo; el
   patrón ya costó 30 bloqueos el 3-oct y 7 hoy. *Recomiendo aceptarla con la prueba determinista
   que ella misma pide (el vector del recibo anterior debe dar `review`, y un caso con causa o
   archivos flojos debe seguir dando `block`), y no mover el umbral a ojo.*
4. **Marcar los criterios del bugfix cerrado hoy —chico, pero deja el registro congruente.** Su
   `qa-mechanical` tiene los comandos en 1.00: marcar sus siete casillas con esa corrida es lo que
   corresponde, en vez de dejar un ticket aprobado que afirma que nadie comprobó los criterios.
5. **Ordenar y commitear lo pendiente de SaiOpenCloud —recomendado cuando quieras.** Son grupos
   distintos (el ticket `IMPROVEMENT-CLIENTE-DEV-20260930` con su recibo, los `docs/local/*`, el
   costo de AWS y la configuración del arnés) y van en commits distintos. El árbol lleva cuatro
   días igual y no se toca sin tu orden.
6. **El parte de hoy queda escrito y sin commitear.** Su commit es una orden tuya, como el de ayer.

## Cómo se arma este parte

Lo corre el job `parte-diario-del-harness` del perfil `valmen-harness` todos los días a las 21:30.
Orden: la fecha real con `date`; los jobs de los dos perfiles y sus ejecuciones
(`cron/executions.db`, con `delivery_outcome` y las filas que quedaron sin cerrar); las entregas en
`cron/output/<job_id>/`; los tickets del día —del `git log --name-only` cuando el trabajo no vino
de un job— con sus recibos, procesados con `json.loads` línea por línea; el ticket para el juicio
sobre la sustancia; y el chequeo que no se saltea —la última corrida de cada compuerta con
`escalatedTo=human` y sin decisión, en **los dos** registros, con la última línea por
`(ticket, id)`, contrastada con «¿alguna línea de ese recibo tiene `humanDecision`?»—. El juicio se
hace leyendo el artefacto, no el veredicto, y con el campo `verdict` de cada proposición para no
reportar como banda lo que es contexto. Los costos, las rutas y los hashes no entran al resumen del
chat: viven acá y en el ticket. Este archivo se deja escrito y **sin commitear**; su commit es una
orden de la persona.
