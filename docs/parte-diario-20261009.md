# Parte diario del harness — 2026-10-09 (viernes)

Fecha real tomada con `date`: 2026-10-09, America/Bogota. El parte se arma sobre el
registro de los dos perfiles: `valmen-harness` (repositorio `/Users/juanandrade/Desktop/ValmenHarness`)
y `saiopencloud` (proyecto `/Users/juanandrade/Desktop/ValmenTech/10-Proyectos/SaiOpenCloud`).

## Qué corrió

**Jobs agendados del día.** En `valmen-harness` sólo corrieron el vigilante de avisos sin
modelo `aviso-telegram-awaiting-jornada` (`af769dd89fb4`, cada 3 min) y este parte
(`489da7b8e9b2`, 21:30). En `saiopencloud` corrieron `vigilante-de-jornada`
(`407b97cdf000`, cada 30 min) y `aviso-telegram-awaiting-jornada` (`87d525a774a3`, cada 3 min).
Los tres vigilantes corrieron en silencio: **ningún aviso disparado**. `jornada-arranque
2026-09-29` sigue `paused`.

**Lo que estaba agendado y no corrió:** nada. El resto de los jobs de ambos perfiles son
one-shots de días anteriores, ya `completed`/`disabled`. Para hoy no había otro job en agenda.

**El reloj del ticker.** Este parte y los tres vigilantes quedaron despachados a las 22:27 con
una latencia de 57 a 138 minutos (`last_dispatch.kind` = `late`/`catch_up`): el ticker de cron
estuvo detenido o atrasado buena parte del día y se puso al día de golpe al final. El parte de
hoy corrió, pero con casi una hora de atraso sobre las 21:30.

**La entrega del parte sigue fallando por Slack.** La corrida de ayer quedó `last_status:
delivery_failed` con `last_delivery_error: "platform 'slack' not configured/enabled"`, porque
el `deliver` del job es `origin` (DM de Slack) y Slack está apagado en ambos perfiles. El
parte no está llegando por el canal por el que sale configurado.

**El trabajo del día no salió de jobs.** Lo corrió una persona con sesiones delegadas. Se
reconstruye del `git log` del rango y del `git status`:

- **ValmenHarness:** ~60 commits hoy; **19 tickets tocados y los 19 en `closed`**. **82
  corridas de compuerta** hoy (112 líneas de recibo, las demás son decisiones humanas
  anexadas), con 37 `approve`, 74 `review` y 1 `block`. De las decisiones humanas, 19 son
  frase del PO y 11 son `claude` (delegación redactada por el agente).
- **SaiOpenCloud:** 4 commits hoy, 2 tickets tocados: `BUGFIX-POS-DEVOLUCION-SUCURSAL-ARQUEO-20261009`
  (a `awaiting_user_tests`, esperando la prueba del PO) y `BUGFIX-SYNC-AUDITORIA-SIN-LLEGAR-20261007`
  (sigue en `intake`). **5 corridas de compuerta** hoy (3 `review`, 1 `block`, 2 `approve`).

## ¿Los artefactos eran para pasar?

Se juzga leyendo el artefacto y el campo `verdict` de cada proposición, no el número solo.

- **Harness, `analysis`.** La mayoría `approve`. El punto flojo repetido de los `review` es
  `nombra_archivos_reales` (18 de 19 tickets lo traen entre los más bajos), seguido de
  `causa_especifica`, `diagnostico_ubica_el_cambio` y `clasificacion`: es el precheck de citas
  —forma, no fondo—. El diagnóstico y el plan responden al pedido. **Debía pasar.**
- **Harness, `plan`.** Todos `review` menos uno (`IMPROVEMENT-ENGINE-CONTEXTO-ORQUESTADOR`,
  `approve`). Las proposiciones que emiten veredicto son los `criterio_NN` (una por criterio):
  quedan en 0,55–0,86 según el ticket mientras pasos, archivos, decisiones y rollback salen
  cerca de 0,95. Es el patrón ya documentado de los tickets con criterios de pantalla
  (`verify: manual`), que no suben por reescribir. El fondo está bien. **Debía pasar.**
- **Harness, `qa-mechanical` de `FEATURE-SERVER-TEXTO-PREGUNTA-RESPUESTA-20261008`:** un
  `block` por `criterio_24=0.00` en la primera corrida y `approve` en la segunda, dos minutos
  después. Es un comando que falló y luego pasó; no quedó como pendiente.
- **SaiOpenCloud, `BUGFIX-POS-DEVOLUCION-SUCURSAL-ARQUEO-20261009`:** `analysis` en `review`
  (`clasificacion` 0,84–0,85, `nombra_archivos_reales` 0,86–0,90), firmado por el PO; el `plan`
  dio `block` por `criterio_01=0,00` y `criterio_05=0,00` en la primera corrida y `approve` en
  la siguiente. El artefacto tenía el fondo correcto. **Debía pasar.**

## Hallazgos del flujo

1. **Compuertas escaladas sin firma — harness: 2, sin cambios desde los días 2026-10-03 y
   2026-10-05.** `FEATURE-MC-SELECTOR-PROYECTOS-20261001` (`analysis`) y
   `SECURITY-ENGINE-PARADA-SEGURA-20260926` (`analysis`). Son las mismas dos de ayer: el
   chequeo no las resuelve solo, siguen contando como «esperando decisión».
2. **Compuertas escaladas sin firma — SaiOpenCloud: 58, todas históricas (2026-09-28 al
   2026-10-08).** Ninguna del día: las cinco corridas de hoy cerraron firmadas o aprobadas. El
   grueso son `qa-mechanical` en `review` con los criterios en 0,50 por falla del entorno —el
   comando `docker compose run … --keepdb` no llegó a probar—, el mismo hallazgo reportado ayer.
   No creció hoy, pero el registro las mantiene como no decididas.
3. **El parte no llega por su canal.** El job entrega a `origin` (Slack DM) y Slack está
   apagado; la corrida de ayer falló la entrega. Es el mismo problema que ya se resolvió para
   los avisos de jornada, que pasaron a Telegram.

## Lo que se hizo con eso

Nada de escritura sobre el registro. Este parte es de sólo lectura: no se aprobó ni se rechazó
ninguna compuerta, no se registraron decisiones humanas, no se commiteó nada. El archivo se
deja escrito y sin commitear.

## Pendientes con recomendación

1. **58 compuertas sin firma en SaiOpenCloud + 2 en el harness.** Recomiendo registrarlas en
   lote con `gate-decide` citando la **autorización de cada ticket** (la frase del PO que quedó
   en su plan), no una genérica del día; las `qa-mechanical` sin proposiciones por falla de
   entorno se registran igual, diciendo en el `reason` por qué. **Con la orden del PO, no por
   iniciativa propia.**
2. **Repuntar el `deliver` de este job a Telegram** (mismo canal que los avisos de jornada) para
   que el parte llegue. Es un cambio de configuración del perfil; se aplica con la orden.
3. **Investigar por qué el `qa-mechanical` de SaiOpenCloud no corre los comandos `docker
   compose`.** Mientras siga, cada cierre deja una compuerta escalada más y el registro afirma a
   la vez que el ticket está cerrado y que nadie decidió.

## Cómo se arma este parte

Un archivo por día en `docs/parte-diario-<YYYYMMDD>.md`, sin editar el de ayer. Se lee, en
orden: la fecha real (`date`); los jobs de los dos perfiles y sus entregas en `cron/output/`;
los tickets que el día tocó —por los jobs si los hubo, por el `git log` del rango si el trabajo
fue manual—; sus recibos en `.valmen/receipts/` y su ticket; y el chequeo de compuertas
escaladas sin decisión sobre la **última corrida de cada compuerta** de los dos registros
(colapso por `(ticket, compuerta)` tomando el `decidedAt` más reciente, no por id solo: un
reintento con firma posterior anula la escalada anterior). El juicio de «si debía pasar» se hace
leyendo el artefacto, no el veredicto, y separando las proposiciones que emiten veredicto
(`verdict: true`) de las descriptivas. Los costos, rutas, commits y hashes no van al chat: viven
en el ticket y en este archivo.
