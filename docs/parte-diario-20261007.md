# Parte diario — 2026-10-07

Cierre del trabajo del día. Se lee el registro, no lo que reportaron las sesiones: cada
afirmación de acá salió de un recibo de compuerta (`.valmen/receipts/`), del `ticket.md`, de los
jobs y las ejecuciones de cron de los dos perfiles (`cron/jobs.json`, `cron/executions.db`), de las
entregas en `cron/output/`, de `git log`, de los libros de la jornada (`.valmen/journeys/`) y del
árbol de los dos repositorios. La fecha real es la del `date` (**2026-10-07, miércoles**); esta
edición disparó a horario (21:30). Los `decidedAt` de los recibos vienen en **UTC**, así que un
recibo de después de las 19:00 de Bogotá lleva el id del día siguiente (`GR-20261008-*`) y sigue
siendo de hoy: el conteo de este parte se hizo convirtiendo cada `decidedAt` a hora de Bogotá, no
por la fecha del id ni por el prefijo UTC.

## Qué corrió

### ValmenHarness — ningún job agendado trabajó; el día lo hizo la jornada delegada

| Job | Disparo | Qué salió |
|---|---|---|
| `parte-diario-del-harness` (`489da7b8e9b2`, agente) | 21:30 | esta edición |
| `aviso-telegram-awaiting-jornada` (`af769dd89fb4`, cada 3 min, script) | ~48 corridas | todas silenciosas |
| resto del perfil (10 one-shots) | — | `enabled: false`, sin disparo |

**Nada agendado para hoy quedó sin correr.** El trabajo no vino de ningún cron: lo hizo la
**jornada `JOR-20261008`** sobre la rama `valmen/jornada-20261008` (**92 commits hoy**, entre las
00:00 y las 21:37), bajo la delegación **DEL-20261007-001** (y la DEL-20261006-001 que ya estaba
vigente). **23 tickets** con compuerta hoy: **15 cerrados**, 3 en `awaiting_user_tests`, 4 en
`approved` y 1 en `planned`. Los `executions` de la jornada están en `.valmen/journeys/`.

### SaiOpenCloud — el feature `superadmin-ampliacion` en un día

| Job | Disparo | Qué salió |
|---|---|---|
| `vigilante-de-jornada` (`407b97cdf000`, cada 30 min, script) | 48 corridas | todas silenciosas |
| `aviso-telegram-awaiting-jornada` (`87d525a774a3`, cada 3 min, script) | ~48 corridas | todas silenciosas |

Sin jobs de trabajo agendados (los `jornada-arranque` están completos desde el 01-oct; queda uno
pausado del 29-sep). El día lo hizo la jornada del feature bajo **DEL-20261007-001** —la frase del
PO en el chat, «vamos a intentar hacer todo el feature»—: **59 commits** (10:40→21:22) sobre `dev`,
con el repo **al día contra `origin/dev`**. **31 tickets** con compuerta: **22 cerrados**, 4 en
`awaiting_user_tests`, 3 en `approved`, 2 en `in_progress`.

## ¿Los artefactos eran para pasar?

### ValmenHarness — 74 corridas de compuerta (`analysis` 28: 18 approve / 9 review / 1 block; `plan` 24: 23 approve / 1 block; `qa-mechanical` 22: 18 approve / 2 review / 2 block)

- **Los 9 `review` de `analysis` no traen ninguna proposición decisoria en banda, y son todos la
  misma cosa.** Las nueve líneas —5 tickets con reintento— traen idéntico `reason`: «contradicción
  interna: `diagnostico_explica_el_sintoma` bloquea mientras la clasificación y la evidencia
  estructural requerida aprobaron; se degrada a revisión humana». Es la regla de **EST-006/AP-004**
  funcionando: el artefacto era para pasar —los tres indicadores estructurales en verde— y el motor
  lo **entrega a una persona** en vez de bloquearlo. Los cinco tickets son SECURITY **pieza nueva**
  (SKILLS-TERCEROS, AUTORIZACION-APROBACION de engine y de mc, CLI-REVISION-SKILLS, y un re-run).
- **Los 3 `block` restantes fueron de fondo y efímeros**, y se recuperaron en la corrida siguiente:
  `SECURITY-ENGINE-SKILLS-TERCEROS` `plan` con `criterio_02=0.02` → `plan-2` approve **70 s** después;
  `DOCS-SKILLS-EVALUACION` `analysis` con `diagnostico_ubica_el_cambio=0.01` y
  `nombra_archivos_reales=0.02` («no se sabe dónde intervenir») → approve **1 min** después.
- **Los 2 `review` de `qa-mechanical`** traen `criterio_10` en banda.
- **Los 23 `plan` del harness aprobaron** salvo el único block nombrado, y los 18 `qa-mechanical`
  que aprobaron lo hicieron sin bandas.

### SaiOpenCloud — 152 corridas (`analysis` 57: 1 approve / 56 review; `plan` 61: 60 review / 1 block; `qa-mechanical` 34: 11 approve / 20 review / 3 block)

- **El `review` es casi universal y es de forma.** En `analysis` la proposición que decide en banda
  es `nombra_archivos_reales` (53 veces) y `diagnostico_ubica_el_cambio` (17); en `plan` son los
  `criterio_NN` desplegados desde criterios que se verifican a mano. Es el caso ya documentado del
  **ticket de sólo pantalla** (el panel Angular `superadmin`): sus criterios quedan en 0,6–0,89 por
  más que se reescriban, la media queda en verde y el veredicto vuelve `review` sin ningún punto de
  fondo. Los recibos no muestran una proposición estructural floja: **eran para pasar**.
- **Los 4 `block` sí son de fondo**, y son de la compuerta mecánica de criterios:
  `FEATURE-SAPANEL-USUARIOS-PANTALLA` `plan` con `criterio_13/15/16=0.07` (se recuperó en `plan-2`),
  `FEATURE-SUPERADMIN-DUPLICAR-SERVICIO` `qa-mechanical` con `criterio_06/21=0.00` (dos veces) y
  `FEATURE-SAPANEL-DETALLE-CLIENTE` `qa-mechanical` con `criterio_02/04/06=0.00`.
- **Los 20 `review` de `qa-mechanical`** traen `criterio_01…08` en banda; una parte es la firma
  conocida «el comando no llegó a probar» (0,50) que el motor ya distingue de una prueba fallida, y
  el resto son criterios `verify: manual` sin nada que el comando pueda aprobar.

## Hallazgos del flujo

1. **La entrega de este parte sigue rota — cuarta jornada.** El job `parte-diario-del-harness` tiene
   `deliver: origin` (un DM de Slack) y Slack está apagado en el perfil; la corrida del 06-oct cerró
   `delivery_failed` con «platform 'slack' not configured/enabled». Los partes no están llegando al
   PO, y el registro lo viene marcando desde el 03-oct.
2. **La proposición del síntoma sigue castigando a la pieza nueva que no es FEATURE.**
   `diagnostico_explica_el_sintoma` declara `appliesTo: ["BUGFIX", "SECURITY"]`
   (`packages/gate/src/definitions.ts:243`), y por eso los SECURITY **nuevos** —sin síntoma que
   explicar— la arrastran hasta el bloqueo aislado que la regla degrada a `review`. Medido hoy: **9
   de 9** `review` de `analysis` del harness salieron de ahí. La aplicabilidad por tipo distingue
   por **tipo**, no por «hay o no hay síntoma»: un SECURITY que crea una capacidad nueva no es una
   corrección.
3. **Precheck y evaluador: fallas de forma que cuestan vueltas.** La jornada de SaiOpenCloud chocó
   ocho veces con «la compuerta `analysis` no dejó recibo»: diagnósticos que citaban archivos
   inexistentes (`spec/presentacion/spec.md`, `views/views.py`, `core/auth/jwt.interceptor.ts`) y
   timeouts del evaluador Claude Code (180 000 ms, «respondió un error: sin detalle»). Cada una es
   una vuelta perdida y una fila `stop` en el libro de la delegación.
4. **Compuertas escaladas sin firma: 15 nuevas hoy, todas en SaiOpenCloud.** Las 15 son
   `qa-mechanical` en `review` sobre tickets que **cerraron** —criterios que se verifican a mano, sin
   proposiciones que aprobar—, más 28 anteriores: **43 en SaiOpenCloud**. El harness sigue con **2**
   (02 y 05-oct). El relé las cuenta como «esperando decisión del PO» aunque el ticket ya cerró.
5. **El tablero kanban no refleja la jornada.** No hay tarjeta de los tickets de hoy en la board de
   ninguno de los dos perfiles: el trabajo lo corrió el orquestador **por fuera del dispatcher**, así
   que la columna quedó atrás del registro. La board `valmen-harness` tiene además su tarjeta «21:30 ·
   Parte diario del harness (cron)» en `blocked`, sin relación con el estado real.
6. **SaiOpenCloud paró dos veces en el gate humano duro, y está bien.** `FEATURE-SUPERADMIN-USUARIOS-PANEL-API`
   (riesgo crítico) y `FEATURE-SUPERADMIN-IDENTIDAD-EDICION` (sync_impact y crítico): la delegación no
   cubre despliegue, migraciones, seguridad ni sincronización, así que quedaron para el PO.
7. **El harness quedó en rama de jornada.** Todo el día del arnés está en `valmen/jornada-20261008`
   (**78 commits por delante de `origin/main`**, ningún push). SaiOpenCloud está al día en `dev`.

## Lo que se hizo con eso

- La corrida delegada cerró **15 tickets en el harness** y **22 en SaiOpenCloud**, con sus ciclos de
  QA y sus consumos de IA registrados; dejó 3 y 4 en `awaiting_user_tests` (revisión visual, como
  manda la delegación) y 4 y 3 en `approved`, esperando la orden de implementación.
- **De las compuertas escaladas no se firmó nada**: las 43 de SaiOpenCloud y las 2 del harness siguen
  esperando. Firmar es una orden de la persona, no una decisión de este cierre.
- Este archivo se deja escrito y **sin commitear**; su commit es una orden del PO, como el de ayer.

## Pendientes con recomendación

1. **Reapuntar la entrega de este job a Telegram — cuarta jornada sin llegar.** `deliver: origin` no
   resuelve con Slack apagado; el camino que ya usa SaiOpenCloud es el bot del perfil. *Recomiendo
   hacerlo: es una escritura sobre `jobs.json` y pide tu orden.*
2. **Decidir la aplicabilidad del síntoma para un SECURITY pieza nueva.** Números: **9 de 9** `review`
   de `analysis` del harness, todos por esa proposición, con lo estructural en verde. *Recomiendo
   extender la regla de aplicabilidad —«hay síntoma / no hay síntoma»— a esta proposición, como ya
   se hizo con `FEATURE`/`IMPROVEMENT`: es la diferencia entre 9 decisiones humanas y 9 `approve`
   sobre el mismo artefacto.*
3. **Firmar por lote las compuertas escaladas sin decisión** (SaiOpenCloud 43 en 33 tickets, 15 de
   hoy; harness 2), cada una citando **por ticket** su propia autorización. *Recomiendo hacerlo: no
   bloquean nada por sí solas, pero el registro las sigue mostrando como esperando decisión del PO.*
4. **Los tickets que esperan tu prueba.** Harness (3): `BUGFIX-CLI-JORNADA-CADUCA-MEDIANOCHE`,
   `FEATURE-ADAPTER-CONTEXTO-FASES-SUBAGENTE`, `FEATURE-CLI-CODEGRAPH-ESTADO`. SaiOpenCloud (4):
   `FEATURE-FRONTEND-UTILIDADES-SISTEMA`, `SECURITY-MODADMIN-USUARIOS-SISTEMA`,
   `SECURITY-MODADMIN-UTILIDADES-SISTEMA`, `SECURITY-SAIOPENCLOUD-RETIRO-CREATEINIT`.
   *Recomiendo que el retiro de `/CreateInit` (seguridad) y la guarda de utilidades vayan primero.*
5. **La rama de jornada del harness (78 commits) y el push.** *Recomiendo subirla a `main` cuando
   quieras revisarla, en una orden aparte.*
6. **La cola de `intake`.** SaiOpenCloud tiene **18** tickets en `intake` (el resto de
   `superadmin-ampliacion`) y el harness **12** (las features nuevas de perfiles, skills y
   aprobación). *Recomiendo decidir por dónde sigue la próxima jornada antes de que arranque sola.*

## Cómo se arma este parte

Lo corre el job `parte-diario-del-harness` del perfil `valmen-harness` todos los días a las 21:30.
Orden: la fecha real con `date`; los jobs de los dos perfiles y sus ejecuciones
(`cron/executions.db`); las entregas en `cron/output/<job_id>/`; los tickets del día —`git log` y
los libros de la jornada (`.valmen/journeys/`, `.valmen/delegations/`) cuando el trabajo no vino de
un job— con sus recibos, procesados con `json.loads` línea por línea y **agrupando por `gate` +
`decidedAt` + `stateHash`** (dos líneas con el mismo trío son una corrida anotada dos veces); el
ticket para el juicio sobre la sustancia; y el chequeo que no se saltea —la **última corrida de
cada compuerta** con `escalatedTo=human` y sin `humanDecision`, en **los dos** registros—. El
**recorte del día se hace por hora de Bogotá** (restando 5 h al `decidedAt` UTC), no por la fecha
del id: un recibo de la tarde-noche lleva el id del día siguiente. El juicio se hace leyendo el
artefacto, no el veredicto, y con el campo `verdict` de cada proposición para no reportar como
banda lo que es contexto. Los costos, las rutas y los hashes no entran al resumen del chat: viven
acá y en el ticket. Este archivo se deja escrito y **sin commitear**; su commit es una orden de la
persona.
