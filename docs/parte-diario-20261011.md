# Parte diario del harness — 2026-10-11 (domingo)

Fecha real: `2026-10-11` (America/Bogota). Registros leídos: ValmenHarness
(`/Users/juanandrade/Desktop/ValmenHarness`) y SaiOpenCloud
(`/Users/juanandrade/Desktop/ValmenTech/10-Proyectos/SaiOpenCloud`).

## Qué corrió

**Jobs agendados.** En `valmen-harness`: `parte-diario-del-harness` (cron 21:30, este parte;
corrió) y `aviso-telegram-awaiting-jornada` (cada 3 min, envío local, ok). En `saiopencloud`:
`vigilante-de-jornada` (cada 30 min, ok), `aviso-telegram-awaiting-jornada` (cada 3 min, ok) y
`jornada-arranque 2026-09-29` (one-shot vencido, deshabilitado). **Ningún job de trabajo estaba
agendado para hoy**; lo único que quedó sin correr fue la entrega del parte de ayer (ver hallazgo 4).

**El trabajo del día no lo movió un job: lo movieron dos jornadas.** 90 commits en `main` del
harness y **24 tickets cerrados**, en dos bloques:

- **Madrugada (00:20–02:00):** cierre del resto de la jornada `JOR-20261010` (alta del 10-oct
  21:59). Sus 16 tickets quedaron todos `closed`.
- **Tarde (14:05–16:33):** jornada `JOR-20261011` (alta 14:05 vía `journey.created`, 9 tickets
  con su grafo `depends_on`), también cerrada entera. El handoff de la jornada
  (`JOR-20261011`) se generó a las 21:32 con `esperanPruebas`, `cerradosPorPolitica` y
  `sinEntregar` vacíos.

**Compuertas corridas hoy (47 corridas distintas):** 16 `qa-mechanical` (todas `approve`),
12 `analysis` `approve` y 3 `analysis` `review`, 3 `plan` `approve` y 13 `plan` `review`.
Las 16 en `REVIEW` las decidió el PO por CLI, salvo una (ver hallazgo 3). Evaluador: el mismo
en todas las corridas (`claude-sonnet-5-5`, vía `claude-code`).

**Tickets con recibo hoy (15):** `BUGFIX-ENGINE-DIFF-RUTAS-RENOMBRE-20261010`,
`BUGFIX-GATE-CONJUNCION-CRITERIOS-20261010`, `FEATURE-CLI-AVISO-DECISION-20261010`,
`FEATURE-CLI-LIMPIEZA-INTEGRADOS-20261010`, `FEATURE-CLI-SYNC-RESPALDO-20261010`,
`FEATURE-CORE-ESTADO-PUBLICO-20261010`, `FEATURE-ENGINE-ENTREGA-TOPE-20261010`,
`FEATURE-ENGINE-PLAN-TAMANO-20261010`, `FEATURE-ENGINE-QA-SIN-CUBRIR-20261010`,
`FEATURE-GATE-CODE-REVIEW-EXIGENCIA-20261010`, `FEATURE-GATE-POLITICA-BANDA-REVIEW-20261010`,
`FEATURE-WEB-ESTADO-PUBLICO-20261010`, `FEATURE-WEB-QA-SIN-CUBRIR-20261010`,
`IMPROVEMENT-ENGINE-TOPE-CRITERIOS-PRECHECK-20261010`,
`SECURITY-ADAPTER-OPENCODE-SHELL-ENV-20261011`. Todos `closed`.

**SaiOpenCloud:** sin trabajo hoy (sin tickets ni recibos del día).

## ¿Los artefactos eran para pasar?

Juicio leído del artefacto, con los valores del recibo y el campo `verdict` de cada proposición.

- **Análisis:** 12 de 15 aprobaron solos. Los 3 `REVIEW` traen una sola proposición de fondo en
  banda, todas en **0,895** con el umbral en 0,90 —`causa_especifica` en
  `FEATURE-CLI-LIMPIEZA-INTEGRADOS` y `FEATURE-ENGINE-PLAN-TAMANO`, y
  `diagnostico_ubica_el_cambio` (peso 3) + `causa_especifica` + `nombra_archivos_reales` en
  `FEATURE-CORE-ESTADO-PUBLICO`—, con `riesgos_cubren_impactos` y las comprobaciones mecánicas
  en verde. Son artefactos que **debían pasar**: la banda es de redacción, no de fondo, y los
  decidió el PO.
- **Planes:** 13 en `REVIEW` y en los trece la única banda fueron **criterios** (`criterio_NN`,
  peso 1) entre **0,79 y 0,895**, con el resto de la compuerta en verde alto
  (`pasos_ejecutables`, `criterios_verificables`, `rollback_suficiente` y `hay_archivos_afectados`
  en 0,99). Ningún `REVIEW` de plan trajo un punto de sustancia. Rango por ticket:
  `IMPROVEMENT-ENGINE-TOPE-CRITERIOS-PRECHECK` (c15 0,86 / c18 0,825 / c19 0,86),
  `FEATURE-ENGINE-QA-SIN-CUBRIR` (seis criterios 0,86–0,895),
  `FEATURE-CORE-ESTADO-PUBLICO` plan-1 (c17 0,79) y plan-2 (c09/c11 0,895),
  `FEATURE-GATE-CODE-REVIEW-EXIGENCIA` (c10 0,895 / c13 0,86),
  `BUGFIX-GATE-CONJUNCION-CRITERIOS` (c14 0,86), `FEATURE-ENGINE-ENTREGA-TOPE` (c08 0,86),
  `SECURITY-ADAPTER-OPENCODE-SHELL-ENV` (c03/c04/c05 0,895),
  `FEATURE-WEB-ESTADO-PUBLICO` (c15 0,86), entre otros.
- **`qa-mechanical`:** las 16 en verde (`approve`), ninguna iteración fallida. Incluye los ciclos
  de QA de los 15 tickets del día.

## Hallazgos del flujo

1. **La banda de criterios del plan volvió a ser el `REVIEW` más caro.** Trece planes, trece
   decisiones humanas, y en todos el punto flojo fue algún `criterio_NN` entre 0,79 y 0,895 con
   el resto de la compuerta en 0,99. Es el patrón ya escrito en la skill `valmen-compuertas`;
   ayer costó nueve decisiones y hoy trece. El evaluador fue el mismo en las 47 corridas, así que
   la banda no viene del routing: viene de la proposición de criterios.
2. **El hueco de firmas sigue abierto y creció: 116 corridas huérfanas** (35 en el harness + 81
   en SaiOpenCloud), todas sobre tickets ya `closed`, colapsadas por ticket+id a la última línea.
   De las 35 del harness, **25 tienen una corrida hermana decidida** —el registro igual las
   muestra esperando— y **10 no tienen decisión alguna** (5 `analysis`, 3 `plan`, 2
   `qa-mechanical`). Una sola es de hoy: el `plan-1` de `FEATURE-CORE-ESTADO-PUBLICO`, superado
   por el `plan-2` que el PO sí aprobó. En SaiOpenCloud la cifra es la de ayer (80 cerrados + 1
   en `awaiting_user_tests`), sin movimiento.
3. **Una entrega del parte no llegó.** El job `parte-diario-del-harness` entrega a su `origin`,
   el DM de Slack (`deliver: origin`), pero Slack está apagado en el perfil
   (`platforms.slack.enabled: false`): la corrida de ayer terminó `last_status: delivery_failed`
   con «platform 'slack' not configured/enabled», aunque el archivo quedó escrito en `docs/`.
   Los avisos de la jornada ya salen por Telegram (EST-002); la entrega del parte quedó apuntando
   al canal viejo. **El resumen diario no está llegando al PO.**
4. **El día no dejó trabajo de producto sin commitear.** `git status` en el harness sólo trae
   `.valmen/journeys/{events,handoffs}.jsonl` (proyección del propio arnés) y el
   `docs/parte-diario-20261010.md` de ayer, sin commitear. En SaiOpenCloud hay un pendiente
   previo ajeno (no es de hoy) y el árbol de `dev` sin commits del día.
5. **El tablero kanban no da cuenta de estas jornadas y no es un problema.** Las corrieron
   sesiones directas por fuera del dispatcher. La única tarjeta en `blocked` es el espejo del
   cron del parte («No desbloquear», por diseño). No hay desincronía de tanda que reportar.

## Lo que se hizo con eso

Nada automático: este parte es de lectura y no aprueba ni rechaza compuertas. Las decisiones de
hoy ya las registró el PO por CLI al vuelo (15 de las 16 corridas escaladas de hoy traen su
`humanDecision`); la restante es la corrida superada del hallazgo 2.

## Pendientes con recomendación

1. **Firmar por lote las 116 corridas huérfanas.** Recomiendo registrarlas con `gate-decide`,
   cada `reason` citando la autorización de **ese** ticket —no una frase genérica del día—,
   empezando por las 10 del harness que no tienen decisión alguna y las 81 de SaiOpenCloud; las
   que no dejaron veredicto que aprobar (una `qa-mechanical` sin proposiciones) con el porqué
   escrito. Requiere tu orden explícita; no se hace por iniciativa propia.
2. **Redirigir la entrega del parte a Telegram.** Recomiendo cambiar el `deliver` del job
   `parte-diario-del-harness` al bot de Telegram del perfil, como el resto de los avisos: hoy el
   resumen diario no llega porque el job sigue apuntando al DM de Slack apagado.
3. **Separar el umbral de los criterios del plan.** Recomiendo subir el umbral de los
   `criterio_NN` (o sacarlos del veredicto cuando caen ≥0,85): hoy trece `REVIEW` y ayer nueve no
   trajeron ningún punto de fondo y costaron veintidós decisiones. Es la mejora con más rinde de
   los dos días.
4. **La jornada `JOR-20261010` quedó saldada:** sus 16 tickets y los 9 de `JOR-20261011` están
   `closed`; no hay asignación pendiente del backlog de ayer.

## Cómo se arma este parte

Lo corre el job `parte-diario-del-harness` del perfil `valmen-harness` todos los días a las
21:30 y entrega el resumen al chat del PO. Lee: la fecha real; los jobs de los dos perfiles y
sus entregas; los recibos de los tickets que esos jobs tocaron (`.valmen/receipts/<ID>.jsonl`,
colapsados por ticket+id a la última línea, prefiriendo la línea con `humanDecision` cuando el
`gate-decide` comparte el `decidedAt`); el ticket para el juicio de sustancia; y la última
corrida de cada compuerta con `escalatedTo=human` y `humanDecision=null` en los dos registros.
El archivo se deja escrito y **sin commitear**.
