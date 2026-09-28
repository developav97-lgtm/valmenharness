# Parte diario — 2026-09-27

Cierre del trabajo autónomo del día sobre el harness. Se lee el registro, no lo que
reportaron las sesiones: cada afirmación de acá salió de un recibo, de un `ticket.md` o del
código.

## Qué corrió

Tres eslabones de una tanda que el PO dejó programada, cada uno en su propia sesión de cron y
con su ticket:

| Eslabón | Ticket | Inicio | Qué salió |
|---|---|---|---|
| aviso + 1 | `IMPROVEMENT-ENGINE-CASCADA-VERIFICADA-20260926` | 19:12 / 19:15 | cerrado, QA delegado |
| aviso + 2 | `IMPROVEMENT-ENGINE-PRESUPUESTOS-ADAPTATIVOS-20260926` | 20:05 / 20:08 | cerrado, QA delegado |
| aviso + 3 | `FEATURE-CLI-ADOPTAR-PROYECTO-20260926` | 20:54 / 20:57 | cerrado, QA delegado |

Además cerró `FEATURE-CLI-MODO-ASK-20260926`, de la tanda anterior.

## ¿Los análisis y los planes eran para pasar?

**Sí, los tres.** La compuerta devolvió `REVIEW` en los seis artefactos, pero leyendo el
ticket —no sólo el recibo— lo que quedó en banda es la forma, no el fondo:

- El **diagnóstico** de cada uno cita `ruta:línea` contrastada contra el archivo («`valmen
  adopt` recorre cuatro pasos, todos en dos archivos»), con los puntos de extensión que ya
  existen en el código y sin propuestas.
- Los **planes** traen sus decisiones de diseño con la ruta que las sostiene y la alternativa
  descartada con su costo; los pasos nombran los archivos; los criterios declaran su comando
  (`hay_archivos_afectados=0.98`, `criterios_verificables=0.94-0.96`,
  `rollback_suficiente=0.90-0.92`).
- Lo único flojo son las **proposiciones de criterio** y `riesgos_cubren_impactos`.

### Por qué el `REVIEW` es estructural

Medido en los tres planes, con el campo `verdict` del recibo delante:

- Los que **deciden** son los `criterio_NN`. En el eslabón 2 quedaron diez entre **0,83 y
  0,89**: todos altos, ninguno alcanza el 0,90, y el plan vuelve `REVIEW` sin nada de fondo
  flojo.
- Los que **no deciden** (`verdict: false`) son los de forma, aunque pesen más:
  `cubre_todos_los_criterios` (peso 3: 0,71 / 0,64 / 0,40) y
  `corresponde_a_la_investigacion` (peso 2: 0,31 / 0,39 / 0,30). Un informe que los presente
  como «lo que quedó flojo» manda a mirar donde no es.
- Partir los criterios compuestos en atómicos **no sube la media**: en los tres bajó
  (0,800→0,752, 0,821→0,802, 0,753→0,707). La pasada de mejora se pagó dos veces sin mover el
  veredicto.

En `analysis` el patrón es el mismo: decide `diagnostico_explica_el_sintoma` (peso 3, 0,81 a
0,88) más `riesgos_cubren_impactos`, que cae a **0,45-0,51 en todo ticket que declara «sin
impactos»** —el caso documentado—. El eslabón 1, cuyo análisis sí corrió con
`claude-opus-4.6`, sacó 0,965 en esa proposición y `APPROVE`.

## Hallazgos del flujo

1. **La compuerta escalada a una persona queda sin decisión, y el ticket avanza igual.** Seis
   compuertas de la jornada (análisis y plan de los tres eslabones, más la del modo pregunta)
   tenían `escalatedTo: "human"` y `humanDecision: null`: el registro las seguía contando como
   esperando decisión y el relé de Hermes las vuelve a avisar, en tickets ya cerrados. El motor
   sólo protege `in_progress → awaiting_user_tests` con un recibo, así que una aprobación
   «en prosa» pasa sin dejar rastro. Otras dos arrastraban desde el 23/09.
2. **La cita del PO se mutila al pasar por el shell.** Con zsh, `--reason "…«$FRASE»…"` no
   expande la variable: el byte multibyte de `»` se lee como parte del nombre del parámetro y
   queda escrito `«�`. Cuatro de las seis decisiones registradas hoy salieron así. El recibo no
   se puede re-decidir (`ya tiene una decisión humana registrada`), así que la cita no se
   repara: la decisión vale y lo que falta es la atribución literal.
3. **El evaluador cambia el veredicto.** Mismo proyecto, mismo día: con `claude-opus-4.6` una
   proposición de peso 3 dio 0,965 y `APPROVE`; con `typesafe/jev-1.13`, los análisis dieron
   0,81 y 0,83 y `REVIEW`. No son tickets idénticos —es una señal, no una conclusión—, pero
   antes de tratar un `REVIEW` crónico como problema del artefacto hay que mirar qué evaluador
   resolvió el routing.
4. **El eslabón 1 no pudo usar la cascada que él mismo documentaba:** sus dos intentos murieron
   en el tope de 90 s del juez con trece proposiciones, y el gate cayó al evaluador barato.
   `gate-jev` no declara tope propio, así que ese caso, si vuelve, es del endpoint de TypeSafe.
5. **Reprogramar una tanda ya agendada la duplica.** `scripts/programar-tickets.mjs` **crea**
   jobs (`hermes cron create`): correrlo otra vez —con `--tickets` o sin él— deja los viejos
   agendados y suma los nuevos, y cada ticket corre dos veces.
6. **El hueco no es de un día: en SaiOpenCloud hay 30 compuertas escaladas sin decisión.** El
   registro del harness quedó en cero al cerrar esta jornada, pero el de SaiOpenCloud arrastra
   `escalatedTo: "human"` con `humanDecision: null` en el análisis y el plan de tickets del 23,
   24 y 25 de septiembre —más una `qa-mechanical`—. Los tickets avanzaron o se cerraron igual,
   así que la aprobación existió en los hechos y no en el registro. La tanda que corre mañana
   no debería sumar ninguna: los cinco prompts quedaron con el registro de la decisión.

## Lo que se hizo con eso

- **Las ocho decisiones registradas** con `gate-decide`, citando la frase que autorizó cada
  una y el punto que quedó en banda. Ya no quedan compuertas huérfanas en el registro.
- **La plantilla del eslabón** (`templates/programar/prompt-eslabon.md`) exige ahora registrar
  la decisión delegada de `analysis` y de `plan`, no sólo escribirla en el plan.
- **La skill del generador** (`skills/programar-trabajo-de-tickets/`) dice por qué se registra y
  cómo se le cambia el prompt a una tanda ya agendada: `--dry-run` + `hermes cron edit`, nunca
  volviéndola a programar.
- **Los cinco prompts de la tanda de SaiOpenCloud** de mañana quedaron actualizados en sus jobs,
  con horario, deliver, skills y workdir verificados campo por campo. Sólo cambió el prompt.
- **El tope del juez: de 90 s a 180 s**, con constante nombrada en los dos sitios donde vivía el
  número (`packages/credentials/src/chat.ts`, `packages/gate-llm-judge/src/judge.ts`). Suite
  completa en verde (1530 pruebas) y build sin errores.
- **El trabajo de `valmen adopt`** que el eslabón 3 dejó en el árbol, commiteado con su ticket y
  su recibo.

## Pendientes, con recomendación

- **Las 30 compuertas de SaiOpenCloud.** Se pueden registrar en bloque —ticket por ticket, con
  la frase que autorizó cada tanda— y el registro queda sin huecos antes de la jornada de
  mañana. Es una decisión del PO: se hace si lo pide.
- **El umbral 0,90 contra los criterios de un plan.** Mientras cada criterio sea una
  proposición, un plan con diez criterios buenos vuelve `REVIEW` y obliga a una decisión humana
  que no aporta. Recomiendo medir —con los recibos que ya hay— cuántos `REVIEW` de `plan` no
  tienen ninguna proposición de fondo en banda, y con ese número decidir si el umbral de las
  `criterio_NN` se separa del resto.
- **El tope de la evaluación completa.** El tope por comando lo declara el proyecto
  (`test-timeout`), pero la corrida entera de una compuerta mecánica con `docker compose` puede
  morir por tiempo de espera de la llamada: conviene que los criterios de SaiOpenCloud apunten al
  archivo enfocado y no a la suite completa.
- **`gate-jev` sin tope propio.** No es un defecto por sí solo —el tope lo pone quien dispara—,
  pero el fallo del eslabón 1 quedó sin un número que lo explique.

## Cómo se arma este parte

Se produce solo, todos los días, con el job `parte-diario-del-harness` del perfil
`valmen-harness` (`cronjob_manage action='list'`). La forma y las fuentes están en la skill
`valmen-parte-diario`: primero los jobs del día —lo que corrió—, después los recibos
—`propositions[].value`, `.weight`, `.verdict`, `escalatedTo`, `humanDecision`—, después el
ticket para juzgar el fondo, y al final el chequeo de compuertas escaladas sin decisión. Los
costos y los hashes no entran acá: viven en el ticket.
