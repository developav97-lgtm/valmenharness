# Parte diario del harness — 2026-10-13 (martes)

Fecha real: `2026-10-13` (America/Bogota). Registros leídos: ValmenHarness
(`/Users/juanandrade/Desktop/ValmenHarness`) y SaiOpenCloud
(`/Users/juanandrade/Desktop/ValmenTech/10-Proyectos/SaiOpenCloud`).

## Qué corrió

**Jobs agendados.** En `valmen-harness`: `parte-diario-del-harness` (cron 21:30, este parte;
corrió) y `aviso-telegram-awaiting-jornada` (cada 3 min, ok). En `saiopencloud`:
`vigilante-de-jornada` (cada 30 min, ok), `aviso-telegram-awaiting-jornada` (cada 3 min, ok) y
`jornada-arranque 2026-09-29` (one-shot vencido, deshabilitado). **Ningún job de trabajo estaba
agendado para hoy**; lo único que quedó sin correr fue la entrega del parte de ayer (ver hallazgo 3).

**El trabajo lo movió una jornada `doctor-facturas` en SaiOpenCloud, corrida por sesiones
directas (por fuera del dispatcher).** 9 tickets con recibo del día, **8 `closed`** y uno en
`in_qa`:

- `SYNC-DOCTORFACTURAS-SAIOPEN-REENVIO-20261013` — endpoint de reenvío en bloque a SaiOpen.
- `SYNC-DOCTORFACTURAS-BONIFICADAS-ARREGLO-20261013` — agrega el pago bonificado faltante.
- `BUGFIX-RESTAURANTE-PAGO-BONIFICADO-RETROACTIVO-20261013` — comando por tenant de bonificado retroactivo.
- `IMPROVEMENT-FACTURACION-AVISO-BONIFICADO-20261013` — aviso al facturar sin forma de pago bonificada.
- `IMPROVEMENT-DOCTORFACTURAS-PANEL-AVISOS-20261013` — fila de bonificadas en el panel de información.
- `FEATURE-DOCTORFACTURAS-DIAGNOSTICO-PANTALLA-20261013` — pantalla Doctor de facturas.
- `FEATURE-DOCTORFACTURAS-ACCIONES-PANTALLA-20261013` — acciones en bloque del doctor.
- `FEATURE-DOCTORFACTURAS-ELECTRONICA-API-20261013` — API electrónica DIAN.
- `FEATURE-DOCTORFACTURAS-DIAGNOSTICO-API-20261013` — **en `in_qa`** (API de diagnóstico de bonificadas).

En el commit del día del repositorio de producto (rama `dev`) están los `merge(doctor-facturas)`
y `registro(doctor-facturas)` de la jornada, más el cierre de
`BUGFIX-RESTAURANTE-PAGO-BONIFICADO-RETROACTIVO`.

**Compuertas corridas hoy (29 corridas):** 9 `analysis`, 9 `plan` y 11 `qa-mechanical`. **Las 9
`analysis` y las 9 `plan` dieron `REVIEW`**; las 11 `qa-mechanical` dieron `approve`. Evaluador: el
mismo en todas (no hubo cambio de routing).

**ValmenHarness:** sin trabajo de tickets hoy (sin recibos ni `ticket.md` del día). Sólo quedó
tocada la proyección del arnés (`.valmen/journeys/*.jsonl`).

## ¿Los artefactos eran para pasar?

Juicio leído del artefacto, con los valores del recibo y el campo `verdict` de cada proposición
(las que emiten veredicto son `diagnostico_*`/`causa_especifica`/`nombra_archivos_reales` en
`analysis` y las `criterio_NN` en `plan`; `cubre_todos_los_criterios` y
`corresponde_a_la_investigacion` son descriptivas).

- **Análisis (9 `REVIEW`, todos el mismo patrón):** las comprobaciones mecánicas en verde
  (`criterios_presentes`, `impactos_declarados`, `sin_secretos`, `archivos_existen`) y la
  clasificación del modelo en **`completa`** con confianza alta. Lo único en banda son las
  proposiciones de redacción, entre **0,86 y 0,93** contra el umbral 0,90 —`diagnostico_ubica_el_cambio`,
  `causa_especifica`, `nombra_archivos_reales`—, con `riesgos_cubren_impactos` en 0,93–0,99. **Son
  artefactos que debían pasar**: la banda es de forma, no de fondo. La única excepción real es
  `FEATURE-DOCTORFACTURAS-DIAGNOSTICO-API-20261013`, cuyo `nombra_archivos_reales=0,50` (peso 1) sí
  señala una debilidad de contenido —aunque `archivos_existen` pasó con 30 rutas citadas—.
- **Planes (9 `REVIEW`):** en los nueve la banda son **criterios** (`criterio_NN`, peso 1) entre
  **0,79 y 0,96**, con `pasos_ejecutables`, `criterios_verificables`, `rollback_suficiente` y
  `hay_archivos_afectados` en **0,99**. Ningún `REVIEW` de plan trajo un punto de sustancia: es el
  patrón ya escrito en la skill `valmen-compuertas` (los criterios `verify: manual` y compuestos
  quedan en banda media por más que se redacten de nuevo). Los tickets de sólo pantalla son los de
  peor marca (`PANTALLA` con criterios entre 0,80 y 0,96; `ELECTRONICA-API` con 0,79 y 0,86).
- **`qa-mechanical`:** las 11 en verde (`approve`), ninguna iteración fallida.

## Hallazgos del flujo

1. **La banda de criterios del plan volvió a ser el `REVIEW` dominante.** Nueve planes, nueve
   `REVIEW`, y en todos el punto flojo fue un `criterio_NN` con el resto de la compuerta en 0,99.
   Es el mismo patrón de los dos días anteriores (trece ayer, nueve hoy). El evaluador fue el mismo
   en las 29 corridas, así que la banda no viene del routing: viene de la proposición de criterios.
2. **El hueco de firmas: 8 compuertas de hoy escaladas sin decisión registrada, 5 sobre tickets ya
   `closed`.** En `FEATURE-DOCTORFACTURAS-DIAGNOSTICO-PANTALLA`, `IMPROVEMENT-DOCTORFACTURAS-PANEL-AVISOS`
   (`analysis` y `plan` cada uno), `IMPROVEMENT-FACTURACION-AVISO-BONIFICADO` (`plan`) y
   `FEATURE-DOCTORFACTURAS-ACCIONES-PANTALLA` (`analysis`) los tickets cerraron, pero su compuerta
   quedó con `escalatedTo: human` y `humanDecision: null`. `FEATURE-DOCTORFACTURAS-DIAGNOSTICO-API-20261013`
   (en `in_qa`) suma `analysis` y `plan` en el mismo estado. Es el pitfall del estándar: la línea
   «aprobado explícitamente por el PO» del plan **cierra la transición pero no registra la decisión**;
   el registro las sigue mostrando esperando a una persona. Las otras cuatro corridas escaladas de
   hoy sí traen su `humanDecision` (el PO las aprobó por `gate-decide`/AskUserQuestion en la corrida
   orquestada: `SYNC-REENVIO`, `BONIFICADAS-ARREGLO`, `ELECTRONICA-API` y el `analysis` de
   `BUGFIX-RESTAURANTE`).
3. **La entrega del parte de ayer no llegó.** El job `parte-diario-del-harness` entrega a su
   `origin` (el DM de Slack, `deliver: origin`), pero su última corrida (10-12) terminó
   `last_status: delivery_failed` con «platform 'slack' not configured/enabled»; **no hay
   `docs/parte-diario-20261012.md`**. Los avisos de la jornada ya salen por Telegram (EST-002); la
   entrega del parte quedó apuntando al canal viejo. Hoy la corrida sí apunta a Slack.
4. **La jornada dejó registro sin commitear en SaiOpenCloud.** `git status` trae 9 `ticket.md` del
   día, `docs/tickets/index.md` y `.valmen/routing.yaml` como modificados (posteriores a los commits
   `registro(doctor-facturas)`), más `.valmen/journeys/` sin versionar. En el harness queda
   `docs/parte-diario-20261010.md`, `...20261011.md` sin commitear y `.valmen/journeys/*.jsonl`.
   Nada de producto suelto fuera de su ticket.
5. **El tablero kanban no da cuenta de esta jornada y no es un problema.** La corrió una sesión
   directa por fuera del dispatcher; la única tarjeta en `blocked` es el espejo del cron del parte
   («No desbloquear», por diseño).

## Lo que se hizo con eso

Nada automático: este parte es de lectura y no aprueba ni rechaza compuertas. Las decisiones de hoy
quedaron registradas sólo en 4 de las 12 compuertas escaladas; las 8 restantes esperan la decisión
del PO o su registro (hallazgo 2).

## Pendientes con recomendación

1. **Registrar las 8 compuertas escaladas sin decisión.** Recomiendo cerrarlas con
   `valmen gate-decide --id <ID> --receipt <GR-…> --decision approve --actor "…"`, cada `reason`
   citando la frase del PO que quedó escrita en **ese** plan —no una genérica del día—; y donde no
   haya frase suya, pedírsela antes. Requiere tu orden explícita; no se hace por iniciativa propia.
2. **Redirigir la entrega del parte a Telegram.** Recomiendo cambiar el `deliver` del job
   `parte-diario-del-harness` al bot de Telegram del perfil, como el resto de los avisos: ayer el
   resumen no llegó porque el job sigue apuntando al DM de Slack.
3. **Separar el umbral de los criterios del plan.** Recomiendo subir el umbral de los `criterio_NN`
   (o sacarlos del veredicto cuando caen ≥0,85): hoy nueve `REVIEW` y ayer trece no trajeron ningún
   punto de fondo y costaron decisiones humanas. Es la mejora con más rinde de los tres días.
4. **Commitear el registro del día en SaiOpenCloud** (los 9 `ticket.md`, `index.md`, `routing.yaml`)
   si el PO lo ordena; va en un commit de registro aparte del código, no se hace por iniciativa del parte.

## Cómo se arma este parte

Lo corre el job `parte-diario-del-harness` del perfil `valmen-harness` todos los días a las 21:30 y
entrega el resumen al chat del PO. Lee: la fecha real; los jobs de los dos perfiles y sus entregas;
los recibos de los tickets que esos jobs tocaron (`.valmen/receipts/<ID>.jsonl`, colapsados por
ticket+compuerta a la última corrida); el ticket para el juicio de sustancia; y la última corrida
de cada compuerta con `escalatedTo=human` y `humanDecision=null` en los dos registros —hoy: 8 en
SaiOpenCloud (5 de tickets ya cerrados) y un backlog previo de 58 corridas, más 2 en el harness—.
El archivo se deja escrito y **sin commitear**.
