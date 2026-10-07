# Parte diario — 2026-10-06

Cierre del trabajo del día. Se lee el registro, no lo que reportaron las sesiones: cada
afirmación de acá salió de un recibo de compuerta (`.valmen/receipts/`), del `ticket.md`, de los
jobs y las ejecuciones de cron de los dos perfiles (`cron/jobs.json`, `cron/executions.db`), de las
entregas en `cron/output/`, de `git log --name-only` y del árbol de los dos repositorios. La fecha
real es la del `date` (2026-10-06, martes); esta edición disparó a horario (21:30:56). Los
`decidedAt` vienen en UTC, así que después de las 19:00 de Bogotá el id del recibo lleva la fecha
del día siguiente (`GR-20261007-*`) y sigue siendo de hoy.

## Qué corrió

### ValmenHarness — ningún job agendado trabajó; el día lo hizo una corrida autónoma delegada

| Job | Disparo | Qué salió |
|---|---|---|
| `parte-diario-del-harness` (`489da7b8e9b2`, agente) | 21:30 | esta edición |
| `aviso-telegram-awaiting-jornada` (`af769dd89fb4`, cada 3 min, script) | 202 corridas | todas silenciosas (`suppressed`) |
| resto del perfil (16 one-shots) | — | `enabled: false`, sin disparo |

**Nada agendado para hoy quedó sin correr.** El trabajo no vino de ningún cron: **43 commits entre
las 19:28 y las 21:31**, todos de una corrida autónoma del feature `autonomia-confiable` bajo la
delegación **DEL-20261006-001** del PO, cuya frase quedó escrita en los eventos de cada ticket:
«Retoma el feature autonomia-confiable… Planes y decisiones: decide tú según tu recomendación, sin
consultarme, salvo los gates humanos duros… si dan el resultado esperado, aprueba el QA,
documéntalo y cierra el ticket. Los tickets de revisión visual o con criterios que solo yo puedo
verificar quedan en `awaiting_user_tests` y pasas al siguiente. Commit local por ticket; push solo
cuando yo lo ordene — Juan Andrade, 2026-10-06». **21 tickets** tocados: 19 cerrados, 2 en
`awaiting_user_tests` (revisión visual, como manda la delegación) y 3 SECURITY raíz de S3 en
`planned` esperando la frase del PO (el gate humano que la delegación excluyó).

### SaiOpenCloud — un feature entero en un día

| Job | Disparo | Qué salió |
|---|---|---|
| `vigilante-de-jornada` (`407b97cdf000`, cada 30 min, script) | 26 corridas | todas silenciosas |
| `aviso-telegram-awaiting-jornada` (`87d525a774a3`, cada 3 min, script) | 202 corridas | todas silenciosas |

Sin jobs de trabajo agendados (los `jornada-arranque` están completos desde el 01-oct).
**59 commits entre las 10:42 y las 21:10** y **18 tickets**: 17 cerrados y uno esperando
validaciones manuales. A las 13:10 se registró la feature `precarga-catalogos` con 15 tickets en
`intake` y se trabajó completa el mismo día, más los dos bugfix del POS del 05-oct.

## ¿Los artefactos eran para pasar?

Hoy hubo **75 corridas de compuerta en el harness** (`analysis` 24: 12 approve / 12 review; `plan`
30: 20 approve / 5 block / 5 review; `qa-mechanical` 21: 21 approve) y **54 en SaiOpenCloud**
(`analysis` 17: 17 review; `plan` 17: 7 approve / 10 review; `qa-mechanical` 20: 17 approve / 2
block / 1 review).

- **8 de los 12 `review` de `analysis` del harness no tienen ninguna proposición que decida en
  banda.** Cinco los degradó el motor por contradicción interna —`diagnostico_explica_el_sintoma`
  bloqueando mientras la clasificación y la estructura aprobaban, la regla de EST-006, viva y
  funcionando: cambió cinco bloqueos automáticos por cinco decisiones humanas— y tres por «no se
  evaluó el impacto», con la descriptiva `riesgos_cubren_impactos` (`verdict: false`) en **0,042,
  0,039 y 0,006** mientras `diagnostico_ubica_el_cambio`, `causa_especifica`,
  `nombra_archivos_reales` y `clasificacion` quedaban en **0,97–0,99**. Eran para pasar.
- **Los otros 4 `review` del harness sí traen banda en proposiciones que deciden**:
  `causa_especifica` 0,81–0,87, `nombra_archivos_reales` 0,55–0,82,
  `diagnostico_ubica_el_cambio` 0,83 y criterios 0,83–0,88, con el resto en verde. Banda de
  redacción, no de fondo.
- **Los 5 `block` de `plan` fueron de fondo y en criterios** —`criterio_05` 0,06
  (APROBACION-PLAN), `criterio_06` 0,05 y `criterio_02/05/06` 0,02–0,09— y los cinco se aprobaron en
  la corrida siguiente, menos de dos minutos después.
- **Los 21 `qa-mechanical` del harness aprobaron sin bandas.**
- **Las 17 del `analysis` de SaiOpenCloud cayeron por la misma proposición**:
  `diagnostico_explica_el_sintoma` en **0,16–0,89** (peso 3) para tickets que son piezas nuevas,
  sin un síntoma que explicar; en las mismas corridas `nombra_archivos_reales` salió 0,86–0,89 y
  `causa_especifica` 0,36–0,89. Es banda de aplicabilidad, no de fondo — y la delegación lo dice en
  cada `reason`.
- **Los 2 `block` de `qa-mechanical` de SaiOpenCloud son de comando caído, no de código**:
  `criterio_02…07` en **0,00** (POS-PRODUCTO-NO-FACTURABLE, 15:55:55) y `criterio_01/02` en **0,00**
  (TERCEROS-MAPAS, 18:15:54), y **2m19s y 45s** después la misma compuerta aprobó con todo en 1,00
  —sin ningún commit entre medio en el segundo caso—. Es la firma conocida del comando que no llega
  a correr, y `criterio_NN=0.00` lo hace leer como prueba fallida.

## Hallazgos del flujo

1. **AP-007 no se repitió: ningún ticket avanzó hoy con una compuerta en banda y sin firma.** Las 17
   decisiones del harness y 27 de SaiOpenCloud quedaron en los recibos. Lo que hay que separar es
   **quién** firmó: las 17 del harness son `actor: "Claude Code por delegación del PO"`, cada una
   citando la delegación DEL-20261006-001 y las palabras del PO; en SaiOpenCloud 22 son delegación
   del agente sobre la delegación del feature, y 5 son la frase del PO. Es la tercera clase que el
   registro distingue —frase literal, política de escalada y delegación redactada por el agente— y
   la delegación tiene su fuente citada, que es lo que la hace auditable.
2. **Dos decisiones quedaron registradas sin motivo.** `BUGFIX-POS-EDICION-PROPINA-MESA-MESERO`
   (análisis 16:29:55 y plan 16:30:10, actor «Juan Andrade (PO)») traen `reason` vacío: la firma
   existe y no dice qué se aprobó.
3. **La proposición de síntoma castiga al ticket que no tiene síntoma.** Medido hoy: 17 de 17
   análisis en SaiOpenCloud y 3 de 12 en el harness. `FEATURE-GATE-APLICABILIDAD-POR-TIPO-20261005`
   —cerrado hoy— ya introdujo la aplicabilidad por tipo para las proposiciones; esta es la misma
   familia y todavía no la tiene.
4. **Un ticket sin impactos no aprueba solo.** Las tres corridas del harness con
   `riesgos_cubren_impactos` en 0,006–0,042 devolvieron `review` con todo lo demás en 0,97–0,99: el
   motor degrada en vez de bloquear —bien—, pero el efecto es que la descriptiva decide la
   compuerta igual. Es la banda ya documentada en la skill.
5. **Compuertas escaladas sin decisión: harness 2, SaiOpenCloud 28 en 18 tickets.** **Cero nuevas
   hoy**: la más reciente es del 05-oct. Medido con el criterio de la skill —última corrida de cada
   compuerta (agrupada por `gate` + `decidedAt` + `stateHash`) con `escalatedTo=human` y sin
   `humanDecision`—; el conteo de ayer (4 y 31) se apoyaba en la última línea por `(ticket, id)`,
   que cuenta intentos ya superados, así que la serie no es comparable. Harness:
   `FEATURE-MC-SELECTOR-PROYECTOS-20261001` (análisis, 03-oct) y `SECURITY-ENGINE-PARADA-SEGURA-20260926`
   (análisis, 05-oct).
6. **Dos commits del registro afirman un cierre que no ocurrió.** `9a784f4` y `45b9b90` dicen «QA
   aprobada por delegación del PO **y cerrado**» para `FEATURE-MC-POLITICAS-AUTONOMAS-20260926` y
   `FEATURE-MC-FIRMA-DE-BLOQUEO-20261005`, que están en `awaiting_user_tests` —como corresponde a su
   revisión visual—. El mensaje se lee como el registro y no lo es.
7. **Trazabilidad de los commits: buena en el harness, parcial en SaiOpenCloud.** 42 de los 43
   commits del harness nombran su identificador —el restante, el alta de los tres SECURITY, los
   describe— y 24 `ticket.md` se tocaron. En SaiOpenCloud los commits de sincronización y
   de restaurante (`3de1b350`, `f5e80349`, `44a3a411`, `f35a45e2`) no citan identificador y no tocan
   el registro: se atan por la ventana y por las rutas, no por el mensaje.
8. **El árbol quedó limpio, y el push sigue pendiente solo en el harness.** Los dos repositorios sin
   pendientes: el harness con **21 commits por delante de `origin/main`** (locales) y SaiOpenCloud a
   nivel de `origin/dev` (verificado a las 21:18).

## Lo que se hizo con eso

- **La corrida autónoma del harness cerró 19 tickets** con QA aprobada por delegación, dejó 2 en
  `awaiting_user_tests` y los 3 SECURITY raíz en `planned`. Los 19 cerrados tienen **todas sus
  casillas marcadas** (157 entre los 24 tickets tocados); las 18 sin marcar son de los 5 que no
  cerraron, que es lo correcto.
- **Dos correcciones de motor nacidas de la calibración se implementaron y cerraron hoy** y se ven
  funcionando en los números del día: la contradicción que ignora las proposiciones descriptivas
  (`BUGFIX-GATE-CONTRADICCION-DESCRIPTIVA-20261005`, las cinco degradaciones) y el reúso de compuerta
  sobre el mismo estado y evaluador (`BUGFIX-ENGINE-REUTILIZAR-COMPUERTA-20261005`). También entraron
  la aplicabilidad por tipo, el diagnóstico por tipo, el contrato de proposiciones, los umbrales por
  evaluador, la revisión previa sin modelo, la migración antes de las pruebas y el cierre que exige
  criterios marcados.
- **SaiOpenCloud produjo la feature `precarga-catalogos` completa** (15 tickets, del manifiesto y la
  API al orbe, la píldora y el detalle) más los dos bugfix del POS del 05-oct: 80 criterios marcados,
  y los 10 sin marcar son de los dos tickets que no cerraron.
- **De las compuertas escaladas no se firmó nada**: las 2 del harness y las 28 de SaiOpenCloud siguen
  esperando. Firmar es una orden de la persona, no una decisión de este cierre.

## Pendientes con recomendación

1. **Aprobar los 3 planes SECURITY del harness —tu frase es la única que los mueve.** Están en
   `planned`; la delegación excluyó los gates humanos duros. *Recomiendo leerlos y aprobarlos: son
   los raíz de S3 de la seguridad del propio arnés.*
2. **Firmar las compuertas escaladas sin decisión** (harness 2, SaiOpenCloud 28 en 18 tickets), en una
   pasada con `gate-decide`, citando **por ticket** su propia autorización. *Recomiendo hacerlo: no
   creció hoy, pero el relé las sigue contando como esperando decisión.*
3. **Decidir la aplicabilidad de `diagnostico_explica_el_sintoma` por tipo**, como se hizo hoy con
   `FEATURE-GATE-APLICABILIDAD-POR-TIPO-20261005`. Números: **17 de 17** análisis en SaiOpenCloud y
   **3 de 12** en el harness. *Recomiendo extender esa misma regla a esta proposición: es la
   diferencia entre 17 `review` y 17 `approve` sobre el mismo artefacto.*
4. **Reapuntar la entrega de este job —tres jornadas más fallando.** Las corridas del 03, 04 y 05-oct
   cerraron con `delivery_outcome: failed` y `deliver: origin` no resuelve con Slack apagado.
   *Recomiendo apuntarlo al bot del perfil (el camino que ya usa SaiOpenCloud); es una escritura sobre
   jobs y pide tu orden.*
5. **El push del harness (21 commits locales) y lo que falte del proyecto.** *Recomiendo subir el
   arnés a `main` cuando quieras revisarlo, en una orden aparte.*
6. **Cerrar el QA de `IMPROVEMENT-CLIENTE-DEV-20260930`**: el PO ya reportó que el BAT funcionó; faltan
   las validaciones de inicio/parada y de sincronización (9 casillas sin marcar desde el 01-oct).
7. **Que el recibo distinguiera el comando que no llegó a correr.** Los 2 `block` de `qa-mechanical`
   de hoy se leen como prueba fallida cuando el comando murió al instante. *Recomiendo que la
   compuerta lo diga con esa palabra en el `reason`, como ya hace con las fallas de entorno que
   distingue `BUGFIX-GATECOMMAND-FALLOS-ENTORNO-20261005`.*
8. **Este parte queda escrito y sin commitear.** Su commit es una orden tuya, como el de ayer.

## Cómo se arma este parte

Lo corre el job `parte-diario-del-harness` del perfil `valmen-harness` todos los días a las 21:30.
Orden: la fecha real con `date`; los jobs de los dos perfiles y sus ejecuciones (`cron/executions.db`,
con `delivery_outcome` y las filas que quedaron sin cerrar); las entregas en `cron/output/<job_id>/`;
los tickets del día —`git log --name-only` cuando el trabajo no vino de un job— con sus recibos,
procesados con `json.loads` línea por línea y **agrupando las corridas por `gate` + `decidedAt` +
`stateHash`** (dos líneas con el mismo trío son una corrida anotada dos veces, no dos intentos); el
ticket para el juicio sobre la sustancia; y el chequeo que no se saltea —la **última corrida de cada
compuerta** con `escalatedTo=human` y sin `humanDecision`, en **los dos** registros—. Para decidir si
un ticket avanzó con la compuerta en banda se toma la resolución del gate (la última corrida por
compuerta, no por id de recibo): un intento escalado seguido de otro que aprueba no es un gate en
banda. El juicio se hace leyendo el artefacto, no el veredicto, y con el campo `verdict` de cada
proposición para no reportar como banda lo que es contexto. Los costos, las rutas y los hashes no
entran al resumen del chat: viven acá y en el ticket. Este archivo se deja escrito y **sin
commitear**; su commit es una orden de la persona.
