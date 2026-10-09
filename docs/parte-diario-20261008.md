# Parte diario del harness — 2026-10-08 (jueves)

Fecha real tomada con `date`: 2026-10-08, America/Bogota. El parte se arma sobre el
registro de los dos perfiles: `valmen-harness` (repositorio `/Users/juanandrade/Desktop/ValmenHarness`)
y `saiopencloud` (proyecto `/Users/juanandrade/Desktop/ValmenTech/10-Proyectos/SaiOpenCloud`).

## Qué corrió

**Jobs agendados del día.** En el perfil `valmen-harness` sólo corrieron el vigilante de
avisos sin modelo `aviso-telegram-awaiting-jornada` (`af769dd89fb4`, cada 3 min) y este parte
(`489da7b8e9b2`, 21:30). En `saiopencloud` corrieron `vigilante-de-jornada`
(`407b97cdf000`, cada 30 min) y `aviso-telegram-awaiting-jornada` (`87d525a774a3`, cada 3 min).
Los tres vigilantes corrieron en silencio durante todo el día: ninguna corrida no-silenciosa
en `cron/output/` de ninguno de los dos perfiles, es decir **ningún aviso disparado**.

**Lo que estaba agendado y no corrió:** nada. El resto de los jobs de ambos perfiles son
one-shots de los días 1 y 2 de octubre, ya en estado `completed`/`disabled`, y
`jornada-arranque 2026-09-29` sigue `paused`. Para hoy no había otro job en la agenda.

**El trabajo del día no salió de jobs.** Lo corrió una persona con sesiones delegadas
(Claude Code, y el PO por CLI). Se reconstruye del `git log` del rango y del `git status`,
no de los `mtime`:

- **ValmenHarness:** 42 tickets tocados; **118 corridas de compuerta** hoy (133 líneas de
  recibo, las demás son decisiones humanas anexadas). Estado actual de esos 42: 33 `closed`,
  5 `awaiting_user_tests` (el lote web/server: `FEATURE-WEB-MUNDO-CONTROL`,
  `FEATURE-WEB-MUNDO-PASTELERIA`, `FEATURE-WEB-VISTA-LIENZO`, `FEATURE-WEB-MOTOR-ESCENA`,
  `FEATURE-SERVER-SESION-PRINCIPAL`), 4 en `intake`.
- **SaiOpenCloud:** 25 tickets tocados; **52 corridas de compuerta** hoy. Estado: 23 `closed`,
  2 en `intake` (`BUGFIX-SYNC-AUDITORIA-SIN-LLEGAR-20261007`,
  `SECURITY-MODADMIN-AUDITORIA-REGISTROS-SIN-TOKEN-20261008`).

## ¿Los artefactos eran para pasar?

Se juzga leyendo el artefacto y el campo `verdict` de cada proposición del recibo, no el
número solo.

- **Harness, `plan` del lote web/mc.** Todos los `REVIEW` de plan del día son el patrón ya
  documentado de un ticket de pantalla: las proposiciones `criterio_NN` (las que emiten
  veredicto) quedan entre 0,70 y 0,89 —en `FEATURE-WEB-MUNDO-CONTROL`, 27 criterios entre
  0,70 y 0,89— mientras pasos, archivos, rollback y verificabilidad salen cerca de 0,99. El
  artefacto tiene el fondo correcto: pasos con su ruta, decisiones de diseño con su
  alternativa, la línea de impactos y la de aprobación explícita del PO. **Debía pasar.**
- **Harness, `analysis`.** El punto flojo repetido es `nombra_archivos_reales` (0,63–0,79),
  con `causa_especifica` y el resto en 0,91 o más. Es el precheck que no comprueba citas
  desde el worktree: forma, no fondo. Debía pasar.
- **SaiOpenCloud, `analysis`/`plan`.** Mismo patrón: `nombra_archivos_reales` 0,69–0,84 y
  criterios de pantalla en banda. El diagnóstico y el plan responden al pedido. Debían pasar.
- **SaiOpenCloud, `qa-mechanical`.** Acá sí hay un punto de fondo, y no es del artefacto:
  el recibo sale `review` con **todos los criterios en 0,50** y la razón «falla del entorno
  en criterio_NN: el comando no llegó a probar, no es una prueba fallida» (evaluador
  `command`, `usage.costUsd` 0). El mecanismo no probó; el artefacto no está en falta.

## Hallazgos del flujo

1. **El `qa-mechanical` de SaiOpenCloud vuelve `REVIEW` por falla del entorno.** Hoy, 10
   corridas —y 48 históricas desde el 2026-09-28— quedaron escaladas sin firma con los
   criterios en 0,50 porque el comando no llegó a probar. Son comandos
   `docker compose run --rm … --keepdb` (los criterios sí llevan `--keepdb`), así que el
   problema no es la forma del criterio sino el entorno donde la compuerta corre. Los
   tickets cerraron igual, con la prueba del PO.
2. **La política AP-004 funcionó.** `SECURITY-ENGINE-APROBACION-POR-REVISOR-20261007`
   (`analysis`) se degradó a `review` por contradicción interna —`diagnostico_explica_el_sintoma`
   bloqueaba mientras la clasificación y la evidencia estructural aprobaban—, y se firmó
   (actor «Juan Andrade»). Es el comportamiento que la regla busca: no dejar que una sola
   proposición contradictoria decida `block`.
3. **Firmas por delegación redactada por el agente.** Varias decisiones del harness llevan
   `actor: "claude"` con un `reason` del tipo «Claude recomienda aprobar…» que cita la
   delegación del PO («vamos a seguir tus recomendaciones para este feature»). Es la
   categoría que el parte separa: no es una frase propia del PO, es una delegación; queda
   correctamente registrada como tal, no se mezcla con las frases literales.
4. **Ninguna corrida de `analysis`/`plan` avanzó sin firma en el harness.** Todas las
   escaladas de hoy terminaron con `humanDecision`. El único hueco del harness son dos
   compuertas viejas (abajo).

## Lo que se hizo con eso

Nada de escritura sobre el registro. Este parte es de sólo lectura: no se aprobó ni se
rechazó ninguna compuerta, no se registraron decisiones humanas, no se commiteó nada. El
archivo se deja escrito y sin commitear.

## Pendientes con recomendación

1. **10 compuertas del día (y 48 históricas) escaladas sin firma en SaiOpenCloud**, todas
   `qa-mechanical` por el mismo motivo de entorno. Recomiendo registrarlas en lote con
   `gate-decide` citando la **autorización de cada ticket** (no una frase genérica del día),
   o dejar constancia de que el criterio se verificó a mano —la prueba del PO— y por qué no
   había nada más que aprobar. **Con la orden del PO, no por iniciativa propia.**
2. **2 compuertas históricas sin firma en el harness:** `FEATURE-MC-SELECTOR-PROYECTOS-20261001`
   (`analysis`, desde el 2026-10-03) y `SECURITY-ENGINE-PARADA-SEGURA-20260926` (`analysis`,
   desde el 2026-10-05). Misma recomendación.
3. **Investigar por qué el `qa-mechanical` de SaiOpenCloud no corre los comandos `docker
   compose`.** Mientras siga, cada cierre deja una compuerta escalada más y el registro
   afirma a la vez que el ticket está cerrado y que nadie decidió.

## Cómo se arma este parte

Un archivo por día en `docs/parte-diario-<YYYYMMDD>.md`, sin editar el de ayer. Se lee, en
orden: la fecha real (`date`); los jobs de los dos perfiles y sus entregas en
`cron/output/`; los tickets que el día tocó —por los jobs si los hubo, por el `git log` del
rango si el trabajo fue manual—; sus recibos en `.valmen/receipts/` y su ticket; y el chequeo
de compuertas escaladas sin decisión sobre la **última** corrida de cada compuerta de los dos
registros (colapso por `(ticket, id)`). El juicio de «si debía pasar» se hace leyendo el
artefacto, no el veredicto, y separando las proposiciones que emiten veredicto
(`verdict: true`) de las descriptivas. Los costos, rutas, commits y hashes no van al chat:
viven en el ticket y en este archivo.
