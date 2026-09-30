# Parte diario — 2026-09-28

Cierre del trabajo autónomo del día. Se lee el registro, no lo que reportaron las
sesiones: cada afirmación de acá salió de un recibo, de un `ticket.md` o del árbol
del repositorio.

## Qué corrió

### SaiOpenCloud — la tanda del relleno masivo, completa

Diez jobs, cinco avisos de arranque por script y cinco sesiones de trabajo, una por
ticket. Los cinco eslabones corrieron seguidos entre las 07:57 y las 12:03, cada uno
adelantado por el PO respecto de la hora que el generador había puesto en su
`run_at` (los jobs quedaron con hora relativa `in 2m` / `in 5m`).

| Eslabón | Ticket | Job | Qué salió |
|---|---|---|---|
| aviso + 1 | `FEATURE-RELLENO-MASIVO-GENERACION-20260924` | 08aa0446a610 / 038a78f02631 | cerrado, QA delegado, suite completa 1008 pruebas |
| aviso + 2 | `FEATURE-RELLENO-MASIVO-CAJA-20260924` | 182cd90f55b6 / 67abfd714828 | cerrado, QA delegado, suite completa 1065 pruebas |
| aviso + 3 | `FEATURE-RELLENO-MASIVO-ANULACION-20260924` | 56ae5b7254c1 / 6df494c3fadd | cerrado, QA delegado, 34 pruebas del ticket + suite |
| aviso + 4 | `FEATURE-RELLENO-MASIVO-PANTALLA-20260924` | 047359562f2e / 0eb22d9be513 | cerrado, QA delegado, 1099 pruebas + 40 de pantalla contra 19 de línea base |
| aviso + 5 | `FEATURE-EDICION-DEV-PANTALLA-20260924` | afc4408638ec / 52c3f1b50186 | cerrado, QA delegado, plan en APPROVE |

**Nada agendado quedó sin correr** en ninguno de los dos perfiles: las diez ejecuciones
del día tienen estado terminal (`completed`). Una sola terminó con la entrega fallida:
el eslabón 5 corrió completo pero su entrega a `bot-chat:saiopencloud` se cortó por el
tope de 600 s (`delivery_failed`), y su texto quedó guardado en
`cron/output/52c3f1b50186/2026-09-28_11-53-31.md`.

### ValmenHarness — sin jobs, con trabajo registrado a mano

El perfil del harness **no tenía ningún job agendado para hoy** (su tanda corrió el 27) y
el único que corre es este parte. Pero el repositorio sí tuvo trabajo: una sesión
interactiva abrió cinco tickets hoy, cuatro en `approved` y uno en `analyzed` —los cuatro
primeros son el mismo camino del día: la atribución de sesiones por llamada, las sesiones
de opencode 2.0.16 que la línea de tiempo no ve, la referencia de commit en `qa-start` y el
costo de las compuertas en la ficha—. El código de ese trabajo
(`packages/server/src/timeline.ts`, +175 líneas) sigue en el árbol sin commitear y estaba
en curso a la hora de este cierre.

## ¿Los artefactos eran para pasar?

**Los de la tanda, sí.** Diez corridas de `analysis` y `plan` sobre los cinco tickets,
todas con el evaluador `typesafe/jev-1.13` y todas en `REVIEW`. Leídos los artefactos, el
fondo está en verde en los cinco:

- **Diagnóstico:** `causa_especifica` 0,95-0,97 y `nombra_archivos_reales` 0,89-0,93, con
  `clasificacion` completa y los checks mecánicos en verde (impactos declarados, criterios
  presentes, sin secretos; `rollback_si_critico` se saltea por riesgo no crítico).
- **Plan:** `hay_archivos_afectados` 0,97-0,99, `criterios_verificables` 0,94-0,96 y
  `rollback_suficiente` 0,90-0,93; en `compatibilidad_hacia_atras`, 0,91-0,95 en los cuatro
  eslabones que tocan el backend y 0,66 en el de la pantalla de edición, que es descriptiva.
- **Lo que quedó en banda son las proposiciones de criterio**, una por criterio de
  aceptación: 0,59-0,94 en el eslabón 1 (doce criterios), 0,84-0,97 en el 2, 0,76-0,95 en
  el 3, 0,79-0,98 en el 4, y 0,93-0,95 en el 5 —que fue el único `plan` en `APPROVE`—.
  Ninguna de esas bandas es de alcance: las descriptivas que sí describen el plan salen
  altas, y `cubre_todos_los_criterios` (peso 3) y `corresponde_a_la_investigacion` (peso 2)
  vienen con `verdict: false`, así que su valor es contexto y no una banda pendiente.

Dos matices, medidos:

- En los cinco el patrón de `analysis` es el mismo de ayer: `diagnostico_explica_el_sintoma`
  entre 0,77 y 0,92 y `riesgos_cubren_impactos` entre 0,61 y 0,87 —el ticket que declara
  «ninguno» en impactos deja esa proposición sin nada que cubrir—. En los tickets de hoy que
  el PO mandó abrir desde esa medición, los dos valores más bajos del día fueron 0,66 y 0,46.
- El caso con números más flojos no es de la tanda: el plan de
  `BUGFIX-RELLENO-CORRECCIONES-20260928` dejó `criterio_03`=0,46 y `criterio_04`=0,42 con la
  media ponderada en 0,795, y su propio texto dice qué miden: la acción «Rellenar en lote» de
  la consulta y el rechazo de un carácter inválido —la entrada que **ya existe**, no el
  cambio del ticket—. Con esa salvedad escrita en el artefacto, es banda de redacción.

**Los del harness:** cuatro `analysis` en `REVIEW` —diagnóstico 0,84-0,92, causa 0,88-0,95 y
archivos 0,89-0,93, con `riesgos_cubren_impactos` cayendo a 0,33, 0,59, 0,63 y 0,79, que es el
patrón de los tickets sin impactos— y con la decisión de la persona **registrada en el recibo**
en los cuatro, que es lo que anoche no pasaba; además
`FEATURE-GATE-IMPACTO-NULO-BANDA-20260928`, que está en `analyzed` y todavía no tiene recibo.

## Hallazgos del flujo

1. **La compuerta escalada sin decisión registrada reapareció, del lado de SaiOpenCloud.**
   Cinco corridas de cuatro tickets quedaron con `escalatedTo: "human"` y `humanDecision:
   null`: el `analysis` y el `plan` de `BUGFIX-LIQUIDACION-CONGRUENCIA-20260928` (cerrado,
   con 0,83 y 0,76 en banda), el `plan` de `BUGFIX-RELLENO-CORRECCIONES-20260928` (0,46 y
   0,42) y el `analysis` de `FEATURE-EDICION-REORGANIZACION-20260928` (0,77 y 0,66) y de
   `FEATURE-RELLENO-ANULACION-PANTALLA-20260928` (0,78 y 0,46). En los cuatro la decisión
   **existió** y quedó escrita en el ticket —el análisis de los dos últimos cita la frase del
   PO—, pero no en el recibo: el registro los sigue mostrando como esperando a una persona, y
   los tickets avanzaron igual (dos están en `planned` y uno cerrado). En la tanda de cron,
   en cambio, las cinco decisiones delegadas sí quedaron registradas: es el camino
   interactivo el que no las cierra.
2. **Una entrega al bot-chat del perfil se cortó por el tope.** El eslabón 5 terminó bien y
   su ejecución quedó `completed`, pero la entrega a `bot-chat:saiopencloud` murió a los
   600 s. El job quedó marcado `delivery_failed`: se lee como fallo del trabajo y es del canal.
3. **El umbral vuelve a separar forma de fondo, con el mismo evaluador.** Los cinco planes
   evaluados con `typesafe/jev-1.13` quedan entre 0,76 y 0,98 por criterio y ninguno alcanza
   0,90 en todos: la banda es granularidad de redacción, no alcance ni verificabilidad. El
   mismo patrón con `riesgos_cubren_impactos` cuando el ticket no declara impactos.
4. **El PO ya convirtió el hallazgo en trabajo:** la solicitud de
   `FEATURE-GATE-IMPACTO-NULO-BANDA-20260928` cita los 0,66 y 0,46 medidos hoy en dos tickets
   y pide que un ticket sin impactos técnicos no caiga en banda por esa ausencia ni por
   señales de redacción. Es el pedido de ayer —separar el umbral de los criterios del resto
   del juicio— entrando por la puerta correcta: un ticket del harness.
5. **Una sesión de escritorio trabajó dos tickets** (`BUGFIX-RELLENO-CORRECCIONES` ×250,
   `BUGFIX-LIQUIDACION-CONGRUENCIA` ×219) y su consumo se declaró compartido y sin números,
   como manda la regla: el costo por ticket de esos dos no existe y el hueco está declarado.
6. **El día cerró commiteado y subido, y el registro local quedó atrás.** Los 16 commits de
   hoy están en `origin/dev` y no queda nada local sin subir —los cierres de los cinco
   eslabones y las dos correcciones—; en cambio la copia local está **dos commits atrás**, de
   otro desarrollador (la sección de pendientes): lo que se lee en disco no es la punta de la
   rama. En el harness, el trabajo de hoy y los cinco tickets siguen sin commitear.

Costo de los evaluadores del día, leído de los recibos: 0,0086 USD en SaiOpenCloud (43
corridas: 19 `analysis`, 17 `plan`, 7 `qa-mechanical`) y 0,0007 USD en el harness (8
corridas de `analysis`). El costo de las sesiones vive en el `## Consumo de IA` de cada ticket.

## Lo que se hizo con eso

- **Cinco cierres en SaiOpenCloud** con QA delegado: `qa-mechanical` en `APPROVE` en los
  cinco, las suites completas corridas por la sesión sobre el árbol del ticket, los criterios
  de comando marcados en cada uno y las cinco decisiones delegadas registradas en el recibo.
- **El trabajo terminó commiteado y subido a `dev`** (16 commits del día), con el registro de
  cada cierre: el «sin commitear» que decían las entregas al escribirse quedó superado.
- **Cinco tickets nuevos del harness**, abiertos a partir del hallazgo y del pedido del PO,
  cuatro con su `analysis` decidida por él y registrada.
- **Este parte**, escrito y dejado sin commitear, como todos: el commit es una orden aparte.

## Pendientes, con recomendación

- **Registrar las cinco decisiones sin firmar de SaiOpenCloud.** La decisión de avanzar la dio
  el PO en la conversación y está escrita en cada ticket; lo que falta es el `gate-decide` que
  la deja en el recibo, con la autorización **de ese** ticket. Es el mismo trabajo por lote que
  se hizo anoche con las treinta, y **necesita su orden**: no se hace por iniciativa propia.
  Recomiendo hacerlo, y por la misma razón por la que se hizo anoche: mientras el recibo diga
  `humanDecision: null`, el relé sigue contando esos tickets como esperando a una persona.
- **Escribir la regla en la skill que usan las sesiones interactivas.** La aprobación en prosa
  cierra la transición pero no registra nada; el prompt de la tanda ya lo dice y el camino
  interactivo no. Recomiendo una línea en `slack-valmen-opencode`, que es la que leen las dos:
  la aprobación que se da en la conversación se cierra con `gate-decide` citando su frase.
  Sin eso, el hueco vuelve cada día que el PO apruebe en prosa.
- **El tope de entrega del bot-chat (600 s).** Recomiendo subir
  `cron.bot_chat_delivery_timeout_seconds`, o dejar de entregar al bot-chat la salida completa
  de una sesión de casi ochenta minutos: el trabajo termina bien y el registro queda marcado
  como fallo, que es la peor de las dos señales.
- **`FEATURE-GATE-IMPACTO-NULO-BANDA-20260928`, en `analyzed` y sin recibo.** Recomiendo correr
  su compuerta cuando el diagnóstico esté cerrado —es el único artefacto del día sin juicio— y
  no adelantarlo a la implementación: es un cambio en el gate que decide los demás, y el
  alcance que quedó escrito toca la media ponderada y la banda de revisión.
- **Los dos criterios de 0,46 y 0,42 del plan de correcciones.** Recomiendo dejarlos como
  están: miden la entrada que ya existía y el propio plan lo declara. Perseguir ese número
  reescribiría un artefacto ya evidenciado, que es lo que invalida su referencia.

## Cómo se arma este parte

Se produce solo, todos los días a las 21:30, con el job `parte-diario-del-harness` del perfil
`valmen-harness` (`cronjob_manage action='list'`). La forma y las fuentes están en la skill
`valmen-parte-diario`: primero la fecha real, después los jobs del día de los dos perfiles
—lo que corrió y lo que estaba agendado sin correr—, después los recibos de los tickets que
esos jobs tocaron —`propositions[].value`, `.weight`, `.verdict`, y el `stateHash` del
artefacto—, después el ticket para juzgar el fondo leyendo el artefacto y no el veredicto, y
al final el chequeo que no se saltea: la última corrida de cada compuerta con
`escalatedTo: "human"` y `humanDecision: null`, en los dos registros. Hoy dio cinco en
SaiOpenCloud y cero en el harness. Los costos y los hashes de las sesiones no entran acá:
viven en el ticket.
