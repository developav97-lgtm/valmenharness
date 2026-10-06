# Parte diario — 2026-10-05

Cierre del trabajo del día. Se lee el registro, no lo que reportaron las sesiones: cada
afirmación de acá salió de un recibo de compuerta (`.valmen/receipts/`), del `ticket.md`, de los
jobs y las ejecuciones de cron de los dos perfiles (`cron/jobs.json`, `cron/executions.db`), de las
entregas en `cron/output/` o del árbol del repositorio. La fecha real es la del `date`
(2026-10-05, lunes). A diferencia de las tres jornadas anteriores, esta edición disparó **a
horario** (21:30:31, 31 s de atraso, `kind: on_time`). El id de un recibo lleva la fecha UTC:
después de las 19:00 de Bogotá aparece con el día siguiente (`GR-20261006-*`) y sigue siendo de
hoy.

## Qué corrió

### ValmenHarness — ningún job agendado trabajó; el día lo hicieron sesiones

| Job | Disparo | Qué salió |
|---|---|---|
| `parte-diario-del-harness` (`489da7b8e9b2`, agente) | 21:30 | esta edición |
| `aviso-telegram-awaiting-jornada` (`af769dd89fb4`, cada 3 min, script) | 323 corridas | todas silenciosas (`suppressed`) |
| resto del perfil (16 one-shots) | — | `enabled: false`, sin disparo |

**Nada agendado para hoy quedó sin correr.** El trabajo no vino de ningún cron: **21 commits
entre las 01:47 y las 21:23**.

### SaiOpenCloud — vuelve a trabajar después de tres días sin tickets

| Job | Disparo | Qué salió |
|---|---|---|
| `vigilante-de-jornada` (`407b97cdf000`, cada 30 min, script) | 42 corridas | todas silenciosas |
| `aviso-telegram-awaiting-jornada` (`87d525a774a3`, cada 3 min, script) | 323 corridas | todas silenciosas |

Sin jobs de trabajo agendados (los `jornada-arranque` están en pausa/completos desde el 02-oct).
**9 commits entre las 15:53 y las 19:19**: tres tickets de restaurante/POS trabajados, dos
cerrados y uno entregado a las pruebas del PO.

## ¿Los artefactos eran para pasar?

Hoy hubo **43 corridas de compuerta en el harness** (`analysis` 12: 5 approve, 2 block, 5 review;
`plan` 12: 9 approve, 2 block, 1 review; `qa-mechanical` 19: 19 approve) y **16 en SaiOpenCloud**
(`analysis` 3: 2 approve, 1 review; `plan` 6: 2 approve, 4 review; `qa-mechanical` 7: 7 approve).

- **Las 5 `review` del harness son de banda de redacción de criterio, no de fondo.** Cuatro
  `analysis` y un `plan` cayeron por `diagnostico_explica_el_sintoma` **0,71–0,78** (peso 3) y por
  un `criterio_NN` **0,89**, mientras en las mismas corridas la clasificación salió 0,84–0,97 y
  `nombra_archivos_reales` 0,88–0,98. Es la banda que ya se midió el 3 y el 4-oct, y las 5
  corridas las resolvió el evaluador `typesafe/jev-1.13-20260917`.
- **Las 4 `review` de `plan` de SaiOpenCloud, ídem.** Todas con `typesafe/jev-1.13`:
  `criterio_05`=0,66 y luego 0,44+0,53 (PRECUENTA-HORA, tercer intento aprobó), `criterio_06`=0,68
  (BONIFICADO), y `criterio_02/03/08/09`=0,72/0,77/0,50/0,17 (POS-MENSAJE, segundo intento aprobó).
  En todas, `pasos_ejecutables` y `rollback_suficiente` quedaron 0,77–0,87. El evaluador es el
  mismo en todo el registro del proyecto hoy.
- **Los 4 bloqueos duros del harness fueron del evaluador `gpt-6.1-sol` y se corrigieron en la
  corrida siguiente.** Dos `analysis` de FEATURE-ENGINE-CAPACIDAD-MAQUINA con
  `diagnostico_explica_el_sintoma` **0,045 y 0,039** (con clasificación 0,88 y 0,97 — la forma de
  AP-004/EST-006); dos `plan` con criterios en **0,006** (BUGFIX-GATE-CONTRADICCION-ANALYSIS) y con
  `criterio_09`=0,012 más `corresponde_a_la_investigacion`=0,003 (FEATURE-MC-LECTOR-CLAUDE-CODE).
  Los dos planes se reescribieron y aprobaron después.
- **Un caso nuevo y bueno:** el `analysis` de SECURITY-ENGINE-PARADA-SEGURA salió
  `diagnostico_explica_el_sintoma`=**0,084** con clasificación 0,96 y riesgos 0,96 —la
  contradicción interna exacta que describe EST-006— y **el motor lo degradó a `review` en vez de
  `block`**. La corrección que entró hoy (`fix(gate): degradar contradicción aislada de análisis`,
  BUGFIX-GATE-CONTRADICCION-ANALYSIS-20261005) está viva y cambió un bloqueo automático por una
  decisión humana.

## Hallazgos del flujo

1. **Tres tickets de hoy avanzaron con una compuerta dejada en `block`/`review` y sin ninguna
   firma.** No hay evento `gate-approved` ni `humanDecision`: `FEATURE-ENGINE-CAPACIDAD-MAQUINA`
   (harness, `analysis` en `block`, cerrado y aprobado) y `SECURITY-ENGINE-PARADA-SEGURA`
   (harness, `analysis` en `review` escalada) e `IMPROVEMENT-POS-MENSAJE-ORDEN-NO-FACTURADA`
   (SaiOpenCloud, `analysis` en `review` escalada). Es AP-007 otra vez, y su arreglo de motor
   (`BUGFIX-ENGINE-FIRMA-DE-COMPUERTA-20261004`) sigue en `intake`. En contraste, **seis tickets
   sí registraron su decisión** por `gate-decide` (los tres del CLI/docs, GATE-CALIBRACION-EVIDENCIA,
   SELECCION-ELEGIBLE y BONIFICADO-DESMARQUE): el registro tiene las dos formas conviviendo.
2. **Y uno más serio, aparte: un `FEATURE` se cerró sin que el gate de `plan` corriera nunca.**
   `FEATURE-ENGINE-CAPACIDAD-MAQUINA-20261001` (tipo FEATURE) no tiene ningún recibo `…-plan-*`
   en su `.jsonl`, y su plan afirma la aprobación explícita del PO citando la política de escalada
   («Dale listo pruebo»). El motor no protege `analyzed → planned → approved` con un recibo, así
   que nada lo detuvo.
3. **Compuertas escaladas sin decisión: harness 4 (3 sin ninguna firma), SaiOpenCloud 31 en 19
   tickets.** Harness: `FEATURE-MC-SELECTOR-PROYECTOS-20261001` (2 corridas, 02 y 03-oct),
   `SECURITY-ENGINE-PARADA-SEGURA-20260926` (hoy) y `FEATURE-GATE-CALIBRACION-EVIDENCIA-20260926`
   (el `analysis` del 04-oct 23:39; su corrida posterior sí quedó firmada). SaiOpenCloud: 31, de
   las cuales **4 nuevas hoy** en dos tickets que se cerraron hoy (2 en PRECUENTA-HORA, 2 en
   POS-MENSAJE) — eran 27 al 2-oct y no se movieron hasta ahora.
4. **La entrega de este job sigue fallando.** Las corridas del 02, 03 y 04-oct cerraron con
   `delivery_outcome: failed` («platform 'slack' not configured/enabled») y `deliver: origin` no
   resuelve con Slack apagado. El archivo es el canal real. Cuarta jornada con la misma
   recomendación abierta.
5. **Los criterios quedaron marcados en todos los tickets que cerraron hoy.** Los 10 cerrados del
   harness y los 2 de SaiOpenCloud no tienen ninguna casilla `- [ ]`; el hallazgo de ayer no se
   repitió. (En el entregado a pruebas, BONIFICADO-DESMARQUE, las 6 casillas son de comando y las
   respalda el `qa-mechanical` en 1,00. Los de `IMPROVEMENT-CLIENTE-DEV-20260930`, detenido desde
   el 01-oct, siguen con 9 sin marcar.)
6. **El árbol queda con trabajo sin commitear, y no es de un solo tipo.** Harness: tres tickets
   (`DOCS-ADOPCION-RUTAS`, `FEATURE-CLI-ADOPCION-IDEMPOTENTE`, `FEATURE-CLI-DOCTOR-CAPACIDADES`)
   con su `ticket.md` modificado, sus recibos **sin versionar** y los archivos de `packages/cli`,
   `packages/adapter` y `tests/`; más un `.mcp.json` nuevo. SaiOpenCloud: lo mismo del 30-sep/02-oct
   (el ticket `IMPROVEMENT-CLIENTE-DEV-20260930` con su recibo, `docs/local/*`, el costo de AWS y
   la configuración del arnés) más un `.mcp.json` y un `CLAUDE.md` nuevos.
7. **La memoria: AP-008 nuevo hoy, y la cola de triaje sigue esperando.** AP-008 registra la
   proposición descriptiva que da 0,00 con el resto del recibo aprobado (medido en el `plan` de
   BUGFIX-GATE-LECTOR-CRITERIOS) y su vector quedó anexado a
   `IMPROVEMENT-GATE-CONTRATO-PROPOSICIONES-20261005`. Sin clasificar quedan AP-001 a AP-005, AP-007
   y AP-008.

## Lo que se hizo con eso

- **Las dos correcciones que salieron de la calibración de compuertas se implementaron y cerraron
  hoy:** el lector de criterios (toma solo ítems de lista y evalúa todos sin recorte,
  `BUGFIX-GATE-LECTOR-CRITERIOS-20261005`, 11 criterios en `[x]`) y la degradación de la
  contradicción aislada de análisis (`BUGFIX-GATE-CONTRADICCION-ANALYSIS-20261005`).
- **`FEATURE-MC-LECTOR-CLAUDE-CODE-20261005` cerró:** lector de sesiones de Claude Code, prefijo
  `claude:` en el consumo de IA y la línea de tiempo mostrando las compuertas aunque no haya
  sesiones (12 criterios en `[x]`).
- **Se cerró `FEATURE-GATE-CALIBRACION-EVIDENCIA-20260926`** y se pusieron al día los tickets de
  motor de jornada (`FEATURE-ENGINE-DESPACHO-JORNADA`, `FEATURE-ENGINE-SELECCION-ELEGIBLE`,
  `SECURITY-ENGINE-PARADA-SEGURA`), todos con sus decisiones registradas salvo los del hallazgo 1.
- **La feature `autonomia-confiable` quedó descompuesta y materializada:** 45 tickets en 6 sprints
  (44 en `intake` y uno ya cerrado hoy).
- **SaiOpenCloud volvió a producir:** el aviso de "orden no facturada" del POS y la hora de la
  precuenta en 12 h con am/pm se cerraron con la validación del PO; el desmarque del bonificado en
  una línea comandada quedó entregado a sus pruebas. **16 corridas de compuerta y 7 `qa-mechanical`
  aprobados** en el proyecto.
- **De las compuertas escaladas no se firmó nada:** las 4 del harness y las 31 de SaiOpenCloud
  siguen esperando. Firmar es una orden de la persona, no una decisión de este cierre.

## Pendientes con recomendación

1. **Firmar las compuertas escaladas —recomendado, y ya lleva tres días.** Harness 4 (3 sin firma),
   SaiOpenCloud 31. Se registran en una pasada con `gate-decide`, citando **por ticket** su propia
   autorización —la frase del plan que cada uno ya tiene escrita—, y las `qa-mechanical` sin
   proposiciones se registran igual diciendo en el `reason` que la verificación fue manual del
   responsable. *Recomiendo hacerlo: mientras no se firme, el registro y el relé siguen afirmando
   que hay trabajo esperándote por tickets ya cerrados.*
2. **Decidir el caso de `FEATURE-ENGINE-CAPACIDAD-MAQUINA` —no es una firma, es un hueco.**
   Cerró como FEATURE sin recibo de `plan`. O se corre el gate ahora sobre el plan que ya tiene
   escrito (y se registra lo que diga) o se declara en el ticket por qué no aplicaba. *Recomiendo
   correrlo: es determinista en costo y cierra el único caso del día en que el registro afirma algo
   que ninguna compuerta vio.*
3. **Atacar AP-007 de raíz —recomendado.** `BUGFIX-ENGINE-FIRMA-DE-COMPUERTA-20261004` (en `intake`)
   es exactamente eso: que la firma se escriba en el recibo y en los eventos. Hoy sumó 3 tickets,
   y el hallazgo 1 muestra que la mitad de las sesiones no la registra.
4. **Reapuntar la entrega de este job a Telegram —cuarta corrida fallando.** `deliver: origin` no
   resuelve con Slack apagado. La recomendación es apuntarlo al bot del perfil (el camino que ya
   usa SaiOpenCloud) y revisar en la misma pasada los demás jobs vivos. Es una escritura sobre
   jobs: pide tu orden.
5. **Commitear lo pendiente —recomendado cuando quieras, en commits por grupo.** Harness: los tres
   tickets del CLI/docs con sus recibos y el `.mcp.json`; SaiOpenCloud: el ticket detenido con su
   recibo, los `docs/local/*`, el costo de AWS y la configuración del arnés. No se toca sin tu
   orden.
6. **Decidir el triaje de aprendizajes pendientes (AP-001 a AP-005, AP-007, AP-008).** No es tarea
   de la auditoría clasificarlos.
7. **Este parte queda escrito y sin commitear.** Su commit es una orden tuya, como el de ayer.

## Cómo se arma este parte

Lo corre el job `parte-diario-del-harness` del perfil `valmen-harness` todos los días a las 21:30.
Orden: la fecha real con `date`; los jobs de los dos perfiles y sus ejecuciones
(`cron/executions.db`, con `delivery_outcome` y las filas que quedaron sin cerrar); las entregas en
`cron/output/<job_id>/`; los tickets del día —`git log --name-only` cuando el trabajo no vino de un
job— con sus recibos, procesados con `json.loads` línea por línea y colapsando por `(ticket, id)`;
el ticket para el juicio sobre la sustancia; y el chequeo que no se saltea —la última corrida de
cada compuerta con `escalatedTo=human` y sin decisión, en **los dos** registros, contrastando la
última línea por `(ticket, id)` con «¿alguna línea de ese recibo tiene `humanDecision`?»—. Para
decidir si un ticket avanzó con la compuerta en banda se toma la **resolución del gate** (la última
corrida por compuerta, no por id de recibo), porque un intento escalado seguido de otro que aprueba
no es lo mismo que un gate que quedó en `review`. El juicio se hace leyendo el artefacto, no el
veredicto, y con el campo `verdict` de cada proposición para no reportar como banda lo que es
contexto. Los costos, las rutas y los hashes no entran al resumen del chat: viven acá y en el
ticket. Este archivo se deja escrito y **sin commitear**; su commit es una orden de la persona.
