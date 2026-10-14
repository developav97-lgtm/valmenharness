# Parte diario del harness — 2026-10-10 (sábado)

Fecha real: `2026-10-10` (America/Bogota). Registros leídos: ValmenHarness
(`/Users/juanandrade/Desktop/ValmenHarness`) y SaiOpenCloud
(`/Users/juanandrade/Desktop/ValmenTech/10-Proyectos/SaiOpenCloud`).

## Qué corrió

**Jobs agendados.** En `valmen-harness` sólo dos: `parte-diario-del-harness` (cron 21:30,
este parte) y `aviso-telegram-awaiting-jornada` (cada 3 min, envío local). En
`saiopencloud`: `vigilante-de-jornada` (cada 30 min, ok), `aviso-telegram-awaiting-jornada`
(cada 3 min, ok) y `jornada-arranque 2026-09-29` (one-shot vencido, deshabilitado).
**Ningún job de trabajo estaba agendado para hoy y ninguno quedó sin correr.**

**El trabajo del día no lo movió un job.** La jornada `JOR-20261010` se dio de alta a mano
(16 tickets con su grafo `depends_on`) y la ejecutaron sesiones directas; por eso el tablero
kanban no da cuenta de ella. Evento de alta en `.valmen/journeys/events.jsonl` (sin commitear).

**Tickets con recibo hoy (11):**

- Cerrados con QA aprobada: `FEATURE-CLI-TABLA-COMANDOS-20261010`,
  `FEATURE-GATE-ARBOL-QA-RECIBO-20261010`.
- En `awaiting_user_tests`: `CHORE-CI-EXPORTS-SIN-USO-20261010`,
  `CHORE-CORE-LISTA-DENEGADOS-20261010`, `FEATURE-BENCH-FRICCION-CORPUS-20261010`,
  `FEATURE-BENCH-FRICCION-RUNNER-20261010`, `FEATURE-CLI-PRUEBA-CASCADA-GUIONADA-20261010`,
  `FEATURE-CLI-PRUEBA-MENSAJES-20261010`, `FEATURE-CREDENTIALS-URL-BASE-PRUEBA-20261010`,
  `FEATURE-ENGINE-RIESGO-REVISION-20261010`, `SECURITY-CLI-PROYECCION-DENEGADOS-20261010`.
- Además, 16 tickets de la jornada quedaron en `intake` sin trabajar hoy.

**SaiOpenCloud:** sin trabajo hoy (sin tickets ni recibos del día).

## ¿Los artefactos eran para pasar?

Juicio leído del artefacto, con los valores del recibo.

- **Análisis:** 10 de 11 aprobaron solos. El único `REVIEW` es
  `SECURITY-CLI-PROYECCION-DENEGADOS-20261010`: una sola proposición en banda,
  `diagnostico_explica_el_sintoma` = **0,895** (peso 3, umbral 0,90), con
  `causa_especifica`, `nombra_archivos_reales` y `riesgos_cubren_impactos` en verde
  (0,96) y las comprobaciones mecánicas todas en `pass`. Es un artefacto que **debía
  pasar**: la banda es de redacción, no de fondo, y lo decidió el PO.
- **Planes:** 9 de 11 dieron `REVIEW`, y en los nueve la única proposición floja fueron
  **criterios** (`criterio_NN`, peso 1) entre **0,80 y 0,895**. El fondo —alcance, archivos,
  pasos, aprobación explícita— en verde. Ningún `REVIEW` de plan trajo un punto de sustancia;
  los nueve los decidió el PO por CLI y quedan registrados. Casos: `CHORE-CI-EXPORTS`
  (c19 0,846 / c16 0,895), `BENCH-FRICCION-CORPUS` (0,804–0,895), `BENCH-FRICCION-RUNNER`
  (0,86–0,895), `CLI-PRUEBA-CASCADA` (7 criterios 0,86–0,895), `CLI-PRUEBA-MENSAJES` (c14 0,895),
  `CLI-TABLA` (c11 0,86 / c17 0,895), `CREDENTIALS-URL-BASE-PRUEBA` (c25 0,825 / c29 0,895),
  `ENGINE-RIESGO-REVISION` (c29 0,895), `SECURITY-CLI-PROYECCION-DENEGADOS` (c24 0,895).
- **`qa-mechanical`:** todas en verde. `CHORE-CI-EXPORTS` corrió cuatro veces: dos `BLOCK`
  (criterios en 0,00 —el árbol todavía no tenía el script y la prueba) y dos `approve`; es
  iteración normal, no un defecto del gate.

## Hallazgos del flujo

1. **La banda de criterios del plan vuelve a ser el `REVIEW` más caro del día.** Nueve
   planes, nueve decisiones humanas, y en todos el punto flojo fueron los `criterio_NN` entre
   0,80 y 0,895. El resto de la compuerta estaba verde. Es el patrón ya escrito en la skill
   `valmen-compuertas`; hoy se pagó nueve veces en una tarde.
2. **El hueco de firmas sigue abierto y creció con los cierres de estos días.** El chequeo de
   compuertas huérfanas (última corrida con `escalatedTo=human` y `humanDecision=null`,
   colapsado por ticket+id) da **32 en el harness —las 32 sobre tickets ya `closed`—** y
   **81 en SaiOpenCloud (80 cerrados + 1 en `awaiting_user_tests`)**; por compuerta: 39
   `qa-mechanical`, 24 `analysis`, 18 `plan`. La decisión existe en prosa pero no en el
   recibo, así que el registro los sigue mostrando como esperando al PO y los avisos de
   tickets ya cerrados no paran. **Ninguna de hoy**: las 11 de hoy quedaron todas decididas.
3. **El día no dejó arnés regenerado pendiente ni secretos.** Sólo `.valmen/journeys/events.jsonl`
   (alta de la jornada) aparece sin commitear en el harness; en SaiOpenCloud hay trabajo previo
   ajeno sin commitear (no es de hoy).

## Lo que se hizo con eso

Nada automático: este parte es de lectura y no aprueba ni rechaza compuertas. Las decisiones
de hoy ya las registró el PO al vuelo (todas las corridas escaladas de hoy traen su
`humanDecision`).

## Pendientes con recomendación

1. **Firmar por lote las 113 compuertas huérfanas (32 harness + 81 SaiOpenCloud).**
   Recomiendo registrarlas con `gate-decide`, cada `reason` citando la autorización de **ese**
   ticket —no una frase genérica del día— y las que no dejaron veredicto que aprobar
   (una `qa-mechanical` sin proposiciones) con el porqué escrito. Requiere tu orden explícita;
   no se hace por iniciativa propia.
2. **Separar el umbral de los criterios del plan.** Recomiendo subir el umbral de los
   `criterio_NN` (o sacarlos del veredicto cuando caen ≥0,85): hoy nueve `REVIEW` no trajeron
   ningún punto de fondo y costaron nueve decisiones. Es la mejora con más rinde del día.
3. **Los 16 tickets de la jornada en `intake`.** Sin decisión de asignación; esperan que
   definas si se corren los próximos días.

## Cómo se arma este parte

Lo corre el job `parte-diario-del-harness` del perfil `valmen-harness` todos los días a las
21:30 y entrega el resumen al chat del PO. Lee: la fecha real; los jobs de los dos perfiles y
sus entregas; los recibos de los tickets que esos jobs tocaron (`.valmen/receipts/<ID>.jsonl`,
colapsados por ticket+id a la última línea); el ticket para el juicio de sustancia; y la
última corrida de cada compuerta con `escalatedTo=human` y `humanDecision=null` en los dos
registros. El archivo se deja escrito y **sin commitear**.
