---
schema_version: 2
id: BUGFIX-ENGINE-FIRMA-DE-COMPUERTA-20261004
title: Registrar en el recibo y en los eventos la firma que autoriza avanzar con la compuerta en bloque
type: BUGFIX
module: ENGINE
workflow_status: closed
qa_status: approved
release_status: unreleased
user_visible: false
sync_impact: false
migration_impact: false
docker_impact: false
risk_level: normal
created: 2026-10-04
updated: 2026-10-05
related_ticket: null
target_release: null
released_in: null
---

# BUGFIX-ENGINE-FIRMA-DE-COMPUERTA-20261004

## Solicitud original

Revisión del 2026-10-04 sobre el trabajo del fin de semana del feature control-jornadas-ejecucion, con la orden del PO ese día: «sí dale» a registrar los puntos en los tickets. El motor rechaza anotar un punto en un ticket cerrado con QA aprobada, así que el hallazgo se registra como ticket. 14 tickets avanzaron de intake a analyzed, planned y approved con recibos de compuerta en block o review y sin ninguna aprobación registrada: ni evento de compuerta en el ticket ni campo humanDecision en el recibo. Van de una corrida en block (FEATURE-ENGINE-RUN-AUTONOMO-20260926, SECURITY-ENGINE-COLISIONES-ESCRITURA-20260926) a seis (FEATURE-ENGINE-MODELO-INTENTO-20261001, plan) y tres (FEATURE-ADAPTER-CAPACIDADES-20261001, FEATURE-ADAPTER-HERMES-LECTURA-20261001, FEATURE-MC-PANEL-HERRAMIENTAS-20261001, FEATURE-MC-CONTEXTO-UI-20261001, analysis). En el mismo rango hay 22 recibos que sí traen humanDecision, así que el registro tiene las dos formas conviviendo y por el ticket no se puede saber cuál se aplicó. EST-004 exige que la aprobación quede atribuida a la política humana y nunca al modelo, pero no dice dónde se escribe. Un informe que lea sólo los tickets no puede distinguir un ticket aprobado a mano de uno aprobado por el modelo.

### Supuestos y decisiones pendientes

<!-- Si el pedido nombra algo que el código no tiene —parámetro, permiso,
campo, bandera, columna, migración— y no lo especifica, listá cada elemento
con su pregunta antes de avanzar a análisis; el análisis no planifica sobre
la adivinanza. Si no hay ninguno, escribí «Ninguno» y seguí. -->
Ninguno.

## Descripción funcional

- Alcance: la parte de R-CDEF-004 (feature `autonomia-confiable`, spec `s1-compuertas-defectos`) que vive en el motor de transiciones. Cubre el avance a `planned` (compuerta `analysis`) y a `approved` (compuerta `plan`), venga el movimiento del MCP (`mover_ticket`), del CLI (`valmen transition`) o de Mission Control (`POST /api/tickets/:id/transition`), porque los tres pasan por `transition()`. Cubre también lo que hace falta para que la firma exista: que una persona pueda registrar su decisión sobre un recibo en `block` —hoy no puede— y que el ticket guarde la firma como evento. **No cubre** lo que R-CTRL-001 asigna a SECURITY-ENGINE-APROBACION-PLAN-20261005 y SECURITY-CORE-TRANSICION-APPROVED-20261005: autenticar quién firma (fuente), atar la aprobación al hash del plan y rechazarla en una ejecución desatendida. Tampoco cubre un avance sin ningún recibo de la compuerta, la compuerta `qa-mechanical` (R-CDEF-006) ni la reutilización de un recibo sobre el mismo estado (R-CDEF-008).
- Usuario o rol afectado: el PO, que firma; los agentes que mueven tickets (Claude Code, Hermes, OpenCode, Codex), que hoy pueden avanzar solos sobre un `block`; y quien lee el registro para auditar —informes de valor, calibración y partes diarios—, que hoy no puede distinguir una aprobación humana de una del modelo leyendo el ticket.
- Comportamiento actual: `transition()` solo comprueba la tabla de estados y textos del ticket; no mira ningún recibo para `planned` ni `approved`. Un ticket con el último recibo de `analysis` o `plan` en `block` o `review` sin decisión humana avanza igual. Y para un `block` ni siquiera hay dónde firmar: el recibo solo admite decisión humana si fue escalado (`escalatedTo = "human"`, que solo se escribe con `review`), así que `valmen gate-decide`, Mission Control y el enlace de Telegram rechazan un recibo en `block`.
- Comportamiento esperado: mover a `planned` o `approved` con el último recibo de la compuerta de esa fase en `block` o `review` sin decisión humana (o con una decisión humana de rechazo) se rechaza, con el recibo, el veredicto y el comando exacto para registrar la decisión. Con una decisión humana de aprobación el avance procede y el ticket queda con un evento `gate-approved` que lleva actor, frase, canal y fecha de la decisión; así un informe que lea solo el ticket sabe que esa transición la firmó una persona, y la que no trae ese evento tuvo un recibo `approve`. Los tickets y recibos históricos siguen leyéndose y validando: la regla corre solo al mover, nunca al validar.

## Diagnóstico

- Archivos y flujo investigados: leídos `packages/engine/src/transition.ts`, `receipts.ts`, `next-step.ts`, `mutate.ts`, `etapas.ts` y `fases.ts`; `packages/gate/src/receipt.ts`; `packages/server/src/gates.ts`; `packages/core/src/transitions.ts` y `blocks.ts`; los puntos de entrada del MCP, el CLI y el servidor; y el registro real (130 tickets, 82 archivos de recibos) con un script de solo lectura. Memoria: `buscar_memoria` devolvió AP-007 (este problema), AP-004 y AP-006 (el precedente de aprobar un bloqueo por política humana).
  - **Dónde ocurre el avance.** `applyTicket` (`packages/engine/src/transition.ts:210`) valida la tabla (`assertTransition`, l.219) y las precondiciones del destino: `planned` pide un plan sustantivo (l.239), `approved` pide la línea de aprobación escrita en `## Plan` y un plan estructurado (l.242-262), `awaiting_user_tests` corre `exigirVerificacionMecanica` (l.175-206, que solo rechaza `block`). Ninguna lee el recibo de `analysis` ni el de `plan`. `transition()` es el único escritor de `workflow_status` (`grep` sobre `packages/`): lo llaman `mover_ticket` (`packages/mcp/src/tools.ts:2661`), `valmen transition` (`packages/cli/src/main.ts:1061`), el endpoint de Mission Control (`packages/server/src/server.ts:1238`) y la corrida autónoma (`packages/engine/src/autonomous-run.ts:250,309`, solo hacia `in_progress` y `awaiting_user_tests`).
  - **Dónde se firma hoy.** `recordHumanDecision` (`packages/server/src/gates.ts:592-684`) anexa el recibo con `humanDecision` (l.642) y un evento `gate-approved` o `gate-rejected` (l.651-659); lo usan `valmen gate-decide` (`main.ts:777`), Mission Control (`server.ts:1343`) y el enlace de Telegram (`packages/cli/src/hermes.ts:615`). Si el evento falla, la decisión queda en el recibo y el ticket sin evento (l.661-671). `withHumanDecision` (`packages/gate/src/receipt.ts:308-318`) lanza si `escalatedTo !== "human"`, y `buildReceipt` solo escala con `review` (l.259, 281): **un recibo `block` no admite decisión humana**.
  - **Quién ya conoce la regla pero no la impone.** `veredictoDe` (`packages/engine/src/next-step.ts:85-100`) ya clasifica el último recibo vigente en bloqueada, espera-persona o aprobada, con la decisión humana por encima del veredicto; solo orienta al agente («alto»), no frena nada.
  - **Dónde se escribe un evento.** `finalizeMutation` (`packages/engine/src/mutate.ts:183`) anexa un solo evento y el actor es la constante `ACTOR = "cli"` (l.150): ninguna transición dice quién la decidió. El validador de eventos exige las claves exactas más `at` (`packages/core/src/blocks.ts:436`), así que no se pueden agregar campos sin migrar. `etapas.ts:40` reconoce una transición solo si `details` es exactamente `Workflow: <a> -> <b>.` (`^…\.$`), y `fases.ts:68-110` toma como motivo todo lo que sigue al primer punto: agregar la firma al `details` de la transición rompería las duraciones por etapa.
  - **Rodeo por `blocked`.** `TICKET_TRANSITIONS` (`packages/core/src/transitions.ts:54-61`) deja salir de `blocked` hacia `analyzed`, `planned`, `approved` e `in_progress` sin recordar de dónde vino. Una regla atada al par `analyzed → planned` se esquiva con `analyzed → blocked → planned`: FEATURE-MC-PANEL-HERRAMIENTAS-20261001 lo hizo (`blocked -> planned` con el último recibo de `analysis` en `block`). La regla debe mirar el **destino**, no el origen.
- Evidencia medida en el registro real (script de solo lectura; criterio: último recibo de la compuerta del destino, con la decisión humana colapsada sobre su corrida, emitido antes del evento de transición):
  - 167 transiciones hacia `planned` o `approved` en 130 tickets (otras 85 van a `awaiting_user_tests` y no entran en la regla). 59 avanzaron con un recibo `review` y decisión humana; 62 con un recibo `approve`; 36 sin ningún recibo de la compuerta; 10 sobre un `block` o `review` sin decisión.
  - **10 avanzaron con el último recibo en `block` (9) o `review` (1) sin decisión humana**, en 10 tickets: FEATURE-ADAPTER-CAPACIDADES-20261001, FEATURE-ADAPTER-HERMES-LECTURA-20261001, FEATURE-CONFIG-ELEGIBILIDAD-AUTONOMA-20260926, FEATURE-ENGINE-AUTORIZACION-JORNADAS-20261001, FEATURE-ENGINE-MODELO-INTENTO-20261001, FEATURE-ENGINE-VENTANAS-JORNADA-20261001, FEATURE-MC-CONTEXTO-UI-20261001, FEATURE-MC-PANEL-HERRAMIENTAS-20261001 y, **del 2026-10-05, posteriores al informe de AP-007**, FEATURE-ENGINE-CAPACIDAD-MAQUINA-20261001 y SECURITY-ENGINE-PARADA-SEGURA-20260926. El problema sigue ocurriendo.
  - La solicitud original cuenta 14 tickets con otro criterio: «algún recibo `block` o `review` sin decisión en su historia». Ocho de esos 14 están entre los 10; los otros seis (FEATURE-ADAPTER-OPENCODE-CODEX-20261001, FEATURE-GATE-VERIFY-DEV-20260926, FEATURE-MC-DISPONIBILIDAD-FUENTES-20261001, FEATURE-SERVER-EVENTOS-INCREMENTALES-20261001, FEATURE-ENGINE-RUN-AUTONOMO-20260926, SECURITY-ENGINE-COLISIONES-ESCRITURA-20260926) corrigieron y volvieron a evaluar hasta un `approve`, y avanzaron sobre él: cumplen R-CDEF-004 tal como está escrito, y la regla no debe frenarlos.
  - 8 de los 10 son un `block` que el PO autorizó seguir (AP-006 y la escalada tras dos bloqueos de AGENTS.md) sin que el registro tuviera dónde guardar esa autorización: no había forma de firmar un `block`. Es la causa de que el patrón exista, no solo un descuido.
  - 12 avances traen `humanDecision` pero no un evento `gate-approved` en el ticket: son anteriores al evento o fallaron al anotarlo. No se corrigen retroactivamente; validar el registro no depende de ellos.
  - **Corrección de la medición, hecha al implementar (2026-10-05) y que reemplaza las cifras de los cuatro puntos anteriores.** La primera pasada colapsaba las corridas que comparten un id de formato viejo (`GR-<fecha>-<compuerta>`) y contaba como firmada cualquier decisión humana del registro, aunque se hubiera anotado después del avance. Reproducida con el código nuevo (`veredictoDeCompuerta`) y con el orden temporal —solo cuenta lo que existía al emitirse el evento de la transición—: de **170** avances a `planned` o `approved`, 36 no tenían recibo, 64 avanzaron sobre un `approve`, 46 sobre un `review` con la decisión humana ya registrada y **24 los habría detenido la regla, en 22 tickets**. De esos 24, **11 nunca se firmaron** (10 sobre `block` y 1 sobre `review`, en 11 tickets: los 10 de arriba más FEATURE-ADAPTER-OPENCODE-CODEX-20261001, que avanzó sobre un `block` y después reevaluó hasta un `approve`) y **13, todos `review`, se firmaron después de avanzar**, es decir, con la firma retroactiva. Con esto, 9 de los 14 de la solicitud original están entre los 11 y los otros cinco (FEATURE-GATE-VERIFY-DEV-20260926, FEATURE-MC-DISPONIBILIDAD-FUENTES-20261001, FEATURE-SERVER-EVENTOS-INCREMENTALES-20261001, FEATURE-ENGINE-RUN-AUTONOMO-20260926, SECURITY-ENGINE-COLISIONES-ESCRITURA-20260926) avanzaron sobre un `approve` y cumplen la regla. Lo que cambia respecto de lo escrito arriba: son 11 y no 10; 10 de los 11 son `block`; y la regla además corta la práctica de firmar un `review` **después** de mover el ticket, que el registro hasta hoy permitía.
- Causa raíz o hipótesis: confirmada. Hay dos defectos que se esconden mutuamente. (1) `transition()` no consulta el recibo de la compuerta que protege el destino, así que `block` y `review` no frenan nada; el motor tiene la regla escrita en `veredictoDe` y no la aplica. (2) El modelo del recibo solo deja firmar lo escalado (`review`): para un `block` la única salida es avanzar sin dejar rastro, que es lo que pasó 9 veces. Rechazar sin arreglar (2) dejaría sin salida al PO que sí quiere autorizar un bloqueo; arreglar (2) sin (1) dejaría la firma opcional.
- **Decisión: rechazar al avanzar, y no firmar al avanzar.** Evidencia: (a) la firma ya tiene un camino probado y compartido, `recordHumanDecision`, que usaron 59 de los 252 avances —firmar al avanzar sería un segundo camino que duplica el recibo y el evento—; (b) un `transition` que recibe actor y frase deja que quien mueve el ticket —el agente— se firme a sí mismo en una sola llamada, mientras que rechazar obliga a un acto previo y explícito de la persona; (c) `transition` escribe el ticket y no los recibos, y firmar al avanzar sería una escritura en dos archivos sin atomicidad común; (d) los escenarios «Avance sin firma» y «Avance firmado» de la spec describen exactamente eso: rechazo sin decisión, evento con actor y frase con ella. Lo que sí se firma al avanzar es la **constancia**: si el avance procede por una decisión humana y el ticket no tiene el evento que cita ese recibo (decisión anotada solo en el recibo, o el evento falló), el propio movimiento lo anexa en la misma escritura, **antes** del evento de transición y no dentro de él por el límite de `etapas.ts`/`fases.ts`.
- Qué parte de R-CDEF-004 toca a este ticket y qué no: toca la regla del motor (rechazo, firma sobre `block`, constancia en el ticket, mensaje con el comando) para `planned` y `approved`. La fuente del actor y la frase —hoy texto libre que quien llama escribe— y el hash del plan siguen siendo de SECURITY-ENGINE-APROBACION-PLAN-20261005; este ticket **no autentica** y lo dice en su entrega. La decisión humana vale aunque el ticket haya cambiado después del recibo (`stale`), porque el caso normal tras dos bloqueos es justamente un artefacto ya corregido que la persona autoriza sin una tercera corrida (AGENTS.md, «Escalada tras dos bloqueos»).
- Flujos que avanzan hoy con la compuerta en `block` o `review`, y cómo se les pedirá la firma:
  - **MCP `mover_ticket`** (agentes de Claude Code, Hermes, OpenCode, Codex): hoy avanza. Pasará a devolver error con el recibo y el comando `valmen gate-decide --id … --receipt … --decision approve --actor <nombre> --reason "<frase literal>"`; el agente se lo presenta a la persona y no lo ejecuta por ella (no hay herramienta MCP de decisión, a propósito).
  - **CLI `valmen transition`**: salida de error con el mismo mensaje; la persona (o el agente con su frase delegada por escrito) corre `gate-decide` y repite.
  - **Mission Control, `POST /transition`**: responde 409 con el mensaje; la decisión se toma por el endpoint que ya existe (`server.ts:1343`) o por el enlace firmado de Telegram, que comparten `recordHumanDecision`. La pantalla que ofrece decidir hoy lo hace solo sobre recibos escalados: ofrecerlo sobre un `block` queda fuera del ticket (se propone al PO, no se abre).
  - **Corrida autónoma** (`autonomous-run.ts`): solo mueve a `in_progress` y `awaiting_user_tests`; no la alcanza esta regla. R-CTRL-001 es quien impedirá que el ejecutor desatendido firme.
  - **Rodeo por `blocked`**: queda cubierto porque la regla mira el destino. Queda sin cubrir, y se deja dicho, que `analyzed → blocked → approved` salta `planned`; es la entrada a `approved`, de SECURITY-CORE-TRANSICION-APPROVED-20261005.
- Riesgos y compatibilidad:
  - **Históricos.** La regla vive en `applyTicket`, no en el validador (`validateDocument`) ni en `readReceipts`: los 10 avances sin firma y los 36 sin recibo siguen validando, y `valmen validate --all` debe seguir en 130 tickets válidos. Se prueba contra el registro real.
  - **Formato.** Sin campos nuevos en eventos ni recibos: el evento es `gate-approved`, el mismo que ya escribe `recordHumanDecision`, y la decisión sobre un `block` usa la misma forma de `humanDecision`. Un código anterior lee todo lo nuevo. `outcome` y `escalatedTo` de un recibo `block` no se tocan: el veredicto del evaluador no se reescribe.
  - **Lectores de fases y etapas.** El evento de firma es una acción distinta de `ticket-transition`, que ni `etapas.ts` ni `fases.ts` leen; el `details` de la transición no cambia. Se prueba que las duraciones salen iguales con y sin firma.
  - **Sin recibo.** Un avance sin ningún recibo de la compuerta sigue permitido, como hoy (36 casos; los tipos sin plan exigible, p. ej. BUGFIX, dependen de eso); cerrar ese hueco es de R-CTRL-001.
  - **Compuerta mecánica.** `qa-mechanical` no entra: un comando que falló es un hecho y no una opinión, así que `withHumanDecision` seguirá sin admitir una decisión humana sobre su `block`; su `review` (falla del entorno) lo define R-CDEF-006. Se propone al PO anexar ese vector a BUGFIX-GATECOMMAND-FALLOS-ENTORNO-20261005 cuando termine este ticket.
  - **Frase.** Obligatoria para aprobar un `block` (no hay otro rastro de por qué se autorizó). Para un `review` sigue como hoy: opcional, porque el enlace de Telegram firma sin texto; el evento dice «sin frase registrada» y el canal.
  - **Atribución.** El actor sigue siendo un texto que escribe quien llama, y `ACTOR = "cli"` seguirá siendo el actor técnico de cada evento. Hasta SECURITY-ENGINE-APROBACION-PLAN-20261005 la firma prueba que alguien la registró, no quién fue; la entrega lo dice.
  - **Ficheros ajenos.** El cambio no toca `packages/cli/src/main.ts` ni los demás archivos con cambios de otra sesión: el CLI recibe el mensaje por la excepción de `transition()` y por el resultado de `recordHumanDecision`, sin cambios propios.
- Impactos de sync, migración, Docker o despliegue: ninguno. No hay sync, migración de datos ni contenedores; es lógica del motor y de los paquetes `gate` y `server` del propio harness, sin cambios de esquema (los tickets y recibos escritos con la regla nueva los lee el código anterior), y se publica con el commit.

## Plan

- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan). Frase literal del PO el 2026-10-05: «dale si apruebo», en respuesta a la presentación del plan, que incluía la decisión de rechazar al avanzar y dejar la constancia como evento aparte. Recibo del gate: `GR-20261006-BUGFIX-ENGINE-FIRMA-DE-COMPUERTA-20261004-plan-1` (approve, cascade).
- Alcance y exclusiones: la regla del motor para `planned` y `approved`, la firma sobre un recibo `block` y la constancia en el ticket, según «Qué parte de R-CDEF-004 toca a este ticket» del diagnóstico. Fuera: autenticar al firmante, el hash del plan y la ejecución desatendida (SECURITY-ENGINE-APROBACION-PLAN-20261005, SECURITY-CORE-TRANSICION-APPROVED-20261005), el avance sin recibo, `qa-mechanical` (R-CDEF-006), la pantalla de decisión de Mission Control sobre un `block` y cualquier cambio en `packages/cli/src/main.ts` (archivo con cambios de otra sesión).
- Pasos ordenados (responsable: el agente que implementa; rama de trabajo `main`, sin worktree):
  1. Pruebas que fallan primero. Crear `tests/firma-de-compuerta.test.ts` con un caso por cada criterio, con los nombres exactos `R-CDEF-004 …` de las anotaciones, sobre un registro temporal con un ticket en el estado de partida y recibos construidos con `buildReceipt` en las dos formas reales: `block` con `escalatedTo: null` y `review` con `escalatedTo: "human"`. Incluye los escenarios «Avance sin firma» y «Avance firmado» de la spec, el rodeo `analyzed → blocked → planned`, un historial de bloqueos con un último `approve` y un ticket sin recibos. Confirmar que fallan por la razón correcta: hoy el movimiento procede y `withHumanDecision` lanza sobre un `block`.
  2. `packages/gate/src/receipt.ts`, función `withHumanDecision` (l.308-318): además del recibo escalado (`escalatedTo === "human"`) admitir el de `outcome === "block"`, salvo el de la compuerta `qa-mechanical`; exigir `reason` no vacío cuando la decisión es `approve` sobre un `block`, con un mensaje que pida la frase literal de quien autoriza; no modificar `outcome` ni `escalatedTo`, que son el veredicto del evaluador. Actualizar el comentario de la función con la regla y por qué.
  3. `packages/engine/src/receipts.ts`: agregar `veredictoDeCompuerta` —el cuerpo de `veredictoDe` y su tipo `Veredicto`, movidos desde `packages/engine/src/next-step.ts:69-100` sin cambiar su lógica—, `describirDecisionHumana(recibo)` —el texto único del evento, «Gate <g> aprobado|rechazado por <actor> (recibo <id>, canal <canal>, decidida <fecha ISO>): <frase>.» o «sin frase registrada»— y `tieneEventoDeDecision(eventos, recibo)`, que busca un evento `gate-approved` o `gate-rejected` cuyo `details` cite `(recibo <id>`. `next-step.ts` importa `veredictoDeCompuerta` en vez de definirla.
  4. `packages/engine/src/mutate.ts`: agregar `eventosPrevios?: readonly { action: string; details: string }[]` a `MutationRequest` y hacer que `finalizeMutation` (l.183) los anexe con `newEvent` antes del evento principal, dentro de la misma escritura atómica y de la misma revalidación. Sin cambios para quien no lo pasa.
  5. `packages/engine/src/transition.ts`: agregar `exigirDecisionDeCompuerta(document, paths, to)` con la tabla destino→compuerta (`planned`→`analysis`, `approved`→`plan`), que lee `readReceipts` y `veredictoDeCompuerta`. Si el último recibo vigente es `bloqueada` o `espera-persona` lanza `fail(…, EXIT_INVARIANT)` con el mensaje de dos formas: sin decisión, con el recibo, su veredicto y la línea `valmen gate-decide --id <ID> --receipt <recibo> --decision approve --actor <nombre> --reason "<frase literal>"`; con un rechazo humano, citando quién lo tomó y su motivo. Si procede por una decisión humana y `tieneEventoDeDecision` es falso, devuelve la constancia para anexarla como evento previo. Se llama desde `applyTicket` (l.210) después de las precondiciones existentes de `planned` (l.239) y de `approved` (l.242-262), sin alterar el orden de los errores actuales. Sin recibo, o con último `approve`, no hace nada. `Plan` y `transition()` (l.102-135) pasan la constancia a `finalizeMutation`.
  6. `packages/server/src/gates.ts`, `recordHumanDecision` (l.592-684): construir el texto del evento con `describirDecisionHumana` en vez de la cadena local (l.656-658) y devolver como error de `HumanDecisionOutcome` el mensaje de `withHumanDecision` cuando pida la frase. Mission Control, `valmen gate-decide` y el enlace de Telegram lo heredan sin tocar sus archivos.
  7. `packages/engine/src/next-step.ts`: en los pasos de `analyzed` y `planned` para el veredicto `bloqueada`, agregar que si la persona autoriza seguir pese al bloqueo se registra con `decidir(recibo)` y su frase literal, y después `mover(...)`; hoy solo dice «mejora y vuelve a evaluar». Actualizar las pruebas de `next-step` que fijen ese texto.
  8. Compatibilidad con el registro real: correr `npm run build` (regenera `dist`) y `node packages/cli/dist/main.js validate --all`, que debe seguir en 130 tickets válidos; y reproducir, con un script de solo lectura fuera del repositorio, que aplicar `veredictoDeCompuerta` a los recibos históricos señala exactamente los 10 avances sin firma del diagnóstico y ninguno de los seis que avanzaron sobre un `approve`. El resultado va a `## Pruebas`.
  9. Documentar en `docs/03-GATES.md`, junto a la descripción de `humanDecision` (l.1017 y su sección): quién puede firmar qué (`review` y `block`, no el `block` de `qa-mechanical`), el rechazo al avanzar con su mensaje, el evento que queda y el límite explícito de que la firma no autentica al actor. Correr `npx vitest run tests/docs` por si alguna prueba de documentación lee ese archivo.
  10. Verificar sin regresiones: `npx vitest run` desde la raíz del repositorio, `npm run typecheck`, `npx eslint` y `npx prettier --check` sobre los archivos del ticket, `node packages/cli/dist/main.js sync --check` y `node packages/cli/dist/main.js secrets`. Si falla una prueba previa se distingue lo que rompe este cambio de lo que ya fallaba por los cambios sin commitear de otra sesión, y se informa sin tocar esos archivos.
  11. Entregar: llenar `## Implementación` y `## Pruebas` con el contrato de pruebas (comandos exactos, directorio, resultado esperado), marcar con `- [x]` los criterios que el gate `qa-mechanical` confirme, registrar el consumo de la sesión con fuente `claude:` y mover a `awaiting_user_tests`. El commit del código se hace solo tras la confirmación de las pruebas por el PO, con únicamente los archivos de este ticket, y el cierre del registro va en un commit aparte; la QA la aprueba el PO con sus palabras.
- Dependencias: ninguna; desbloquea SECURITY-ENGINE-APROBACION-PLAN-20261005 y FEATURE-ENGINE-CALIBRACION-Y-PRECISION-20261005, que dependen de él. Compuertas que aplican: `plan` antes de aprobar y `qa-mechanical` antes de la entrega; el ticket no declara impactos, pero la aprobación humana del plan es obligatoria por indicación del PO.
- Compatibilidad y orden de despliegue: sin migración ni despliegue; un solo commit de código. Los tickets que hoy están en `analyzed` o `planned` con un recibo `block` o `review` sin decisión dejarán de poder avanzar hasta firmarse; es el efecto buscado y se avisa al PO en la entrega. Los históricos no se reescriben ni dejan de validar.
- Rollback: `git revert` del commit de código. No hay datos que restaurar: los recibos con `humanDecision` sobre un `block` y los eventos `gate-approved` que citan el recibo conservan la forma que el código anterior ya lee, y los anteriores no se reescriben.

## Criterios de aceptación

<!-- Una afirmación verificable por criterio. Una frase con «y» son dos criterios:
     cada uno se despliega como una proposición propia, y una que agrupa varias
     afirmaciones cae en banda de revisión aunque el plan la cubra entera. -->
- [x] Escenario «Avance sin firma»: con el último recibo de `analysis` en `review` sin decisión humana, mover el ticket de `analyzed` a `planned` se rechaza, y el mensaje nombra el recibo, su veredicto y el comando `valmen gate-decide` con sus banderas
      <!-- test: npx vitest run tests/firma-de-compuerta.test.ts -t "R-CDEF-004 avance sin firma review" -->
- [x] Con el último recibo de `plan` en `block` sin decisión humana, mover el ticket de `planned` a `approved` se rechaza con el mismo mensaje
      <!-- test: npx vitest run tests/firma-de-compuerta.test.ts -t "R-CDEF-004 avance sin firma block" -->
- [x] Un movimiento rechazado por falta de firma deja el ticket intacto: mismo estado, mismos eventos y mismo archivo
      <!-- test: npx vitest run tests/firma-de-compuerta.test.ts -t "R-CDEF-004 rechazo sin efectos" -->
- [x] Una decisión humana de rechazo sobre el recibo tampoco permite avanzar, y el mensaje cita quién la tomó
      <!-- test: npx vitest run tests/firma-de-compuerta.test.ts -t "R-CDEF-004 decisión de rechazo" -->
- [x] El rodeo por `blocked` no esquiva la regla: mover de `blocked` a `planned` con el último recibo de `analysis` en `block` sin decisión se rechaza
      <!-- test: npx vitest run tests/firma-de-compuerta.test.ts -t "R-CDEF-004 rodeo por blocked" -->
- [x] Escenario «Avance firmado»: con la decisión humana registrada por `recordHumanDecision`, mover a `planned` procede y el ticket tiene exactamente un evento `gate-approved` con el actor, la frase y el recibo de esa decisión
      <!-- test: npx vitest run tests/firma-de-compuerta.test.ts -t "R-CDEF-004 avance firmado" -->
- [x] Una decisión humana anotada solo en el recibo deja su evento `gate-approved` en el ticket al avanzar, antes del evento de transición y sin cambiar el `details` de la transición
      <!-- test: npx vitest run tests/firma-de-compuerta.test.ts -t "R-CDEF-004 constancia al avanzar" -->
- [x] Una persona puede aprobar un recibo en `block` con su frase literal, y el recibo conserva su `outcome` y su `escalatedTo` originales
      <!-- test: npx vitest run tests/firma-de-compuerta.test.ts -t "R-CDEF-004 firma de un bloqueo" -->
- [x] Aprobar un recibo en `block` sin frase se rechaza con un mensaje que pide la frase literal de quien autoriza
      <!-- test: npx vitest run tests/firma-de-compuerta.test.ts -t "R-CDEF-004 bloqueo sin frase" -->
- [x] Un recibo `block` de `qa-mechanical` no admite decisión humana
      <!-- test: npx vitest run tests/firma-de-compuerta.test.ts -t "R-CDEF-004 compuerta mecánica" -->
- [x] Compatibilidad: con bloqueos anteriores y un último recibo `approve`, el ticket avanza sin firma y sin evento nuevo
      <!-- test: npx vitest run tests/firma-de-compuerta.test.ts -t "R-CDEF-004 último recibo aprobado" -->
- [x] Compatibilidad: un avance sin ningún recibo de la compuerta sigue permitido
      <!-- test: npx vitest run tests/firma-de-compuerta.test.ts -t "R-CDEF-004 sin recibo" -->
- [x] Compatibilidad: la duración por etapa y las fases de un ticket con evento de firma salen iguales que sin él
      <!-- test: npx vitest run tests/firma-de-compuerta.test.ts -t "R-CDEF-004 etapas y fases" -->
- [x] Compatibilidad: el registro del repositorio, con sus recibos históricos, sigue validando (`node packages/cli/dist/main.js validate --all` sale con código 0)
      <!-- test: node packages/cli/dist/main.js validate --all -->

## Puntos

```json
[]
```

## Implementación

Rama de trabajo: `main`, sin worktree. Pruebas primero: `tests/firma-de-compuerta.test.ts` se escribió antes que el código y 10 de sus 13 casos fallaron por la razón esperada (el avance procedía; `withHumanDecision` lanzaba sobre un `block`); los otros tres son controles de compatibilidad, y uno de ellos se comprobó con una mutación (leer el recibo más viejo en vez del último) que lo vuelve rojo.

Cambios, por archivo:

- `packages/gate/src/receipt.ts`, `withHumanDecision`: admite también un recibo `block` (antes solo `escalatedTo === "human"`); aprobar un `block` exige `reason` no vacío; el `block` de `qa-mechanical` no admite decisión humana; `outcome` y `escalatedTo` no se tocan.
- `packages/engine/src/receipts.ts`: `veredictoDeCompuerta` y su tipo `VeredictoDeCompuerta` (movidos de `next-step.ts` sin cambiar la lógica), `describirDecisionHumana` (el texto único del evento, que cita `(recibo <id>, canal <c>, decidida <fecha>)`) y `tieneEventoDeDecision`.
- `packages/engine/src/mutate.ts`: `MutationRequest.eventosPrevios`; `finalizeMutation` los anexa antes del evento principal, en la misma escritura atómica. Sin cambios para quien no lo pasa.
- `packages/engine/src/transition.ts`: `COMPUERTA_DE_DESTINO` (`planned` → `analysis`, `approved` → `plan`) y `exigirDecisionDeCompuerta`, llamada desde `applyTicket` después de las precondiciones existentes de cada destino. Rechaza con `EXIT_INVARIANT` y el comando `valmen gate-decide` completo cuando el último recibo vigente es `block` o `review` sin decisión, o tiene un rechazo humano; si procede por una decisión humana sin evento que cite el recibo, anexa ese evento antes del de la transición. Sin recibo, o con último `approve`, no hace nada.
- `packages/server/src/gates.ts`, `recordHumanDecision`: el evento sale de `describirDecisionHumana`. Mission Control, `valmen gate-decide` y el enlace de Telegram lo heredan sin tocar sus archivos.
- `packages/engine/src/next-step.ts`: usa `veredictoDeCompuerta` y, ante un recibo `block` sin decisión en `analyzed` y `planned`, agrega el paso que dice cómo se autoriza seguir (`gate-decide` con la frase literal y después `mover_ticket`).
- `tests/firma-de-compuerta.test.ts` (nuevo, 13 casos) y `tests/next-step.test.ts` (2 casos nuevos sobre ese paso).
- `docs/03-GATES.md`: §7.1, «La decisión humana sobre un recibo y el avance del ticket».

Desvíos respecto del plan aprobado, para que el PO los vea:

1. **Paso 8.** Reproducir la regla sobre el registro real con el orden temporal dio 24 avances detenidos en 22 tickets —11 nunca firmados y 13 `review` firmados después de avanzar—, no los 10 que preveía el plan. El diagnóstico quedó corregido con una nota que dice por qué (la primera medición colapsaba corridas con id viejo y contaba como firmada una decisión posterior al avance). La regla es la misma; cambia la cifra.
2. **Paso 7.** Ninguna prueba previa de `next-step` fijaba el texto que se cambió, así que en vez de actualizar pruebas se agregaron dos nuevas.
3. **Formato.** `packages/server/src/gates.ts` no estaba limpio para prettier en `HEAD` (un bloque ajeno a este cambio); no se reformateó para no mezclar ruido en el diff, y el hunk propio se escribió ya conforme.

Hallazgos que no se tocan aquí: `valmen gate-decide` no pasa `channel` a `recordHumanDecision`, así que una decisión tomada por el CLI queda con canal `mission-control` (archivo `packages/cli/src/main.ts`, que tiene cambios de otra sesión); la autenticación del actor y el hash del plan siguen siendo de SECURITY-ENGINE-APROBACION-PLAN-20261005.

## Pruebas

**Contrato de pruebas para el responsable.** Directorio de ejecución de todos los comandos: `/Users/juanandrade/Desktop/ValmenHarness` (raíz del repositorio). Entorno: Node 24 y las dependencias ya instaladas; no hace falta red, base de datos ni contenedores. Antes de probar con tickets reales hay que reiniciar el servidor MCP y Mission Control del harness: corren el motor desde `packages/*/dist`, que ya se regeneró con `npm run build`, pero un proceso abierto sigue con el código anterior.

| # | Comando | Resultado esperado |
|---|---|---|
| 1 | `npx vitest run tests/firma-de-compuerta.test.ts` | 1 archivo, 13 pruebas pasadas: los escenarios «Avance sin firma» y «Avance firmado», el rodeo por `blocked`, la firma de un `block`, y los controles de compatibilidad |
| 2 | `npx vitest run tests/firma-de-compuerta.test.ts tests/next-step.test.ts tests/gate-human-decision.test.ts tests/gate-decide.test.ts tests/etapas.test.ts tests/derivacion-fases.test.ts tests/docs-cascada-verificada.test.ts` | 7 archivos, 125 pruebas pasadas: lo nuevo y lo que lee decisiones, eventos y fases |
| 3 | `npx vitest run` | todos los archivos en verde; en la última corrida 138 archivos (1 omitido) y 2159 pruebas pasadas, 48 omitidas. Las cifras suben si la otra sesión agrega pruebas |
| 4 | `npm run typecheck` | termina sin errores |
| 5 | `node packages/cli/dist/main.js validate --all` | `Tickets válidos: 130` |
| 6 | `node packages/cli/dist/main.js sync --check` | `Archivos generados al día.` |
| 7 | `node packages/cli/dist/main.js secrets` | `Sin secretos en … archivo(s) con cambios.` |
| 8 | `npx eslint packages/gate/src/receipt.ts packages/engine/src/receipts.ts packages/engine/src/mutate.ts packages/engine/src/transition.ts packages/engine/src/next-step.ts packages/server/src/gates.ts tests/firma-de-compuerta.test.ts tests/next-step.test.ts` | sin salida, código 0 |

**Validación manual (qué observar con tickets reales, tras reiniciar los servidores):**

1. Con un ticket en `analyzed` cuyo último recibo de `analysis` esté en `block` o `review` sin decisión, `mover_ticket` a `planned` (o `valmen transition --id <ID> --entity ticket --to planned`) debe fallar con el recibo, su veredicto y la línea `valmen gate-decide --id <ID> --receipt <recibo> --decision approve --actor <nombre> --reason "<frase literal>"`; el ticket no cambia.
2. Registrar esa decisión con el comando del mensaje (con la frase literal de la persona) y repetir el movimiento: procede, y en `## Eventos` aparece un evento `gate-approved` con el actor, la frase y el recibo, **antes** del `ticket-transition`, cuyo `details` sigue siendo `Workflow: analyzed -> planned.`
3. Aprobar un recibo en `block` sin `--reason` debe fallar pidiendo la frase literal.

**Evidencia ejecutada por el agente** (2026-10-05, en `/Users/juanandrade/Desktop/ValmenHarness`, rama `main`):

- Los 14 criterios por la compuerta `qa-mechanical` con el evaluador `command`: recibo `GR-20261006-BUGFIX-ENGINE-FIRMA-DE-COMPUERTA-20261004-qa-mechanical-1` (14 de 14) y, tras marcar los criterios con `[x]` —cambia el hash del estado—, `…-qa-mechanical-2` sobre el estado final (14 de 14, aprobado). Los criterios se marcaron por el primero.
- Cada anotación `-t` selecciona exactamente una prueba (`1 passed | 12 skipped`), así que ningún criterio pasa en vacío. Mutación: leer el recibo más viejo en vez del último vuelve rojo el control «último recibo aprobado».
- Suite completa, antes y después de agregar las pruebas de `next-step` y la documentación: sin fallas. `npm run typecheck`: sin errores en la última corrida; una corrida intermedia falló por `tests/verificacion-puesta-en-marcha.test.ts`, de la otra sesión, que importaba un módulo que todavía no existía (`packages/cli/src/onboarding-verify.ts`) y que apareció minutos después. `eslint` y `prettier --check` sobre los archivos del ticket: limpios. `valmen validate --all`: 130 válidos. `sync --check` y `secrets`: limpios.
- Punta a punta por el CLI sobre un registro temporal (ya borrado): con el último recibo de `analysis` en `block`, `valmen transition … --to planned` salió con código 3 y el mensaje con el comando completo; `valmen gate-decide … --decision approve` sin `--reason` salió con código 3 pidiendo la frase; con `--reason` salió 0; el movimiento siguiente procedió, y el ticket quedó con `created`, `gate-approved` («… aprobado por Juan Andrade pese al bloqueo (recibo …, canal mission-control, decidida …): <frase>») y `ticket-transition` con `Workflow: analyzed -> planned.`
- Reproducción sobre el registro real, solo lectura: aplicar `veredictoDeCompuerta` en orden temporal a los 170 avances a `planned` o `approved` da 36 sin recibo, 64 sobre `approve`, 46 sobre `review` ya firmado y 24 detenidos, en 22 tickets (11 nunca firmados, 13 `review` firmados después de avanzar). El script vive fuera del repositorio.
- Limitaciones: la firma no autentica al actor (SECURITY-ENGINE-APROBACION-PLAN-20261005); un avance sin recibo sigue permitido; `valmen gate-decide` registra el canal `mission-control` aunque decida el CLI (pendiente fuera de este ticket).

**Ejecución del contrato por el agente, por delegación del PO** (2026-10-05, después de la entrega, con el código ya commiteado en `a0ea22d`).

Resultado del PO: autorizó, con sus palabras, que el agente ejecutara el reinicio y los comandos del contrato y que, si el resultado era el esperado, registrara lo ejecutado en QA y cerrara el ticket. Frase literal del PO: «como reinicio el mcp no puedes ejectar el reincio tu y ejecutar los comandos si el resultado es el esperado yo te toy la autorizacion de agregar a qa lo ejecutado y cerrar». No es una ejecución del PO: es una confirmación delegada, y lo que sigue es lo que el agente corrió.

- **Reinicio del MCP.** No se reinició el servidor MCP de la sesión: no es un conector reconectable por el agente, y matar su proceso lo dejaría sin las herramientas del harness. En su lugar se levantó un `valmen-mcp` nuevo —`packages/mcp/dist/main.js`, ya reconstruido— y se le habló por stdio sobre un registro temporal (ya borrado), con `root` apuntando a él: `mover_ticket` a `approved` con el último recibo de `plan` en `review` sin decisión devolvió `isError=true` con el recibo y el comando `valmen gate-decide …`; tras `valmen gate-decide … --reason "dale, apruebo el plan"` (código 0), el mismo `mover_ticket` procedió y el ticket quedó con `gate-approved` y después `ticket-transition` con `Workflow: planned -> approved.`. Los procesos de larga vida de la máquina —el servidor MCP de las sesiones abiertas y Mission Control en el puerto 4174— siguen con el motor anterior hasta que el PO los reinicie.
- **Comandos 1 a 8 de la tabla de arriba**, en `/Users/juanandrade/Desktop/ValmenHarness`: (1) 1 archivo, 13 pruebas pasadas; (2) 7 archivos, 125 pasadas; (3) `npx vitest run`: 138 archivos (1 omitido), 2161 pasadas y 48 omitidas; (4) `npm run typecheck`: código 0; (5) `Tickets válidos: 130`; (6) `Archivos generados al día.`; (7) `Sin secretos en 33 archivo(s) con cambios.`; (8) `eslint`: código 0. Todos con el resultado esperado.

## QA

```json
[
  {
    "id": "QA-001",
    "date": "2026-10-06",
    "build_reference": "worktree:sha256:86a95f6491f04774f6289637ab520d491ef687e5329c6f4f77a5e8ba163e0823",
    "environment": "macOS (Darwin 27.0.0), Node 24, /Users/juanandrade/Desktop/ValmenHarness en main, sin contenedores ni red. Se prueba el commit a0ea22d16391e824dd7543718f85397d6194c4ed; la referencia es el hash, con el encuadre del motor, de los 9 archivos de ese commit en orden alfabético: docs/03-GATES.md, packages/engine/src/mutate.ts, next-step.ts, receipts.ts, transition.ts, packages/gate/src/receipt.ts, packages/server/src/gates.ts, tests/firma-de-compuerta.test.ts y tests/next-step.test.ts. Comandos 1 a 8 del contrato de ## Pruebas y chequeo por stdio con un valmen-mcp nuevo sobre un registro temporal, ejecutados por el agente por delegación del PO",
    "result": "pending",
    "findings": [],
    "correction": null,
    "po_confirmation": null
  },
  {
    "id": "QA-002",
    "date": "2026-10-06",
    "build_reference": null,
    "environment": null,
    "result": "approved",
    "findings": [],
    "correction": null,
    "po_confirmation": "como reinicio el mcp no puedes ejectar el reincio tu y ejecutar los comandos si el resultado es el esperado yo te toy la autorizacion de agregar a qa lo ejecutado y cerrar"
  }
]
```

## Evidencia

```json
[]
```

## Retests

```json
[]
```

## Cierre

```json
[
  {
    "kind": "ticket-close",
    "id": "CLOSE-001",
    "date": "2026-10-06",
    "technical_summary": "transition() ahora exige, al entrar a planned o approved, que el último recibo vigente de analysis o plan no esté en block ni review sin decisión humana (o con un rechazo humano); la regla se ata al destino para que blocked no la esquive y rechaza con el recibo y el comando gate-decide completo. withHumanDecision admite también un recibo block, con la frase literal obligatoria al aprobarlo y sin admitir el block de qa-mechanical, sin tocar outcome ni escalatedTo. Si el avance procede por una firma que el ticket no tiene como evento, finalizeMutation anexa el gate-approved (texto único de describirDecisionHumana, que cita el recibo) antes del evento de transición, en la misma escritura; el details de la transición no cambia. veredictoDeCompuerta pasó de next-step.ts a receipts.ts y next-step explica cómo autorizar un bloqueo. Sin cambios de esquema ni migración; la regla corre al mover, no al validar. Commit a0ea22d.",
    "functional_summary": "Un ticket ya no avanza de fase cuando la compuerta de esa fase dijo que no o pidió revisión humana y nadie lo firmó: el sistema lo rechaza y dice exactamente cómo registrar la decisión. Una persona puede ahora autorizar seguir pese a un bloqueo dejando su frase literal, y el ticket guarda quién firmó, con qué frase y cuándo, de modo que un informe que lea solo el ticket distingue una aprobación humana de una del evaluador. Los tickets y recibos anteriores se siguen leyendo igual. No autentica a quien firma: eso queda para la aprobación del plan de la feature.",
    "qa_status": "approved",
    "qa_waiver_reason": null,
    "po_confirmation": null,
    "release_impact": "unreleased: cambio interno del motor del harness, sin publicación ni despliegue propios; los procesos de larga vida (servidor MCP de las sesiones abiertas, Mission Control) toman la regla al reiniciarse."
  }
]
```

## Consumo de IA

```json
[
  {
    "kind": "ai-usage",
    "date": "2026-10-06",
    "session_reference": "a677fc70-a2a6-4173-a36a-e18e91da94c4",
    "model": "anthropic/claude-sonnet-5-5",
    "reasoning_effort": null,
    "notes": "Claude Code (claude-sonnet-5-5, plan Max, sin costo en dólares por suscripción) con la sesión del PO presente; trabajó este ticket de punta a punta: análisis, plan, implementación, pruebas y entrega. Cifras de la transcripción leídas con leerSesionesDeClaude al entregar (106 mensajes, 25 intervenciones al registro, 1 fallida): entrada = no cacheada + escritura de caché; la lectura de caché (25 676 895 tokens) no se suma; la salida ya incluye el razonamiento. La sesión sigue abierta hasta las pruebas y la QA del PO, así que lo que se gaste después no está en esta cifra. El lector la marca compartida solo porque un chequeo de punta a punta corrió el CLI sobre un registro temporal con un ticket de prueba (BUGFIX-POS-FILTRO-ORDENES-20260921, que no existe en este registro): no sirvió a otro ticket real.",
    "input_tokens": 322238,
    "output_tokens": 126801,
    "total_tokens": 449039,
    "estimated_cost_usd": null,
    "source": "claude:a677fc70-a2a6-4173-a36a-e18e91da94c4",
    "confidence": "high",
    "id": "CONSUMO-001"
  },
  {
    "kind": "ai-usage",
    "date": "2026-10-06",
    "session_reference": "666e4a95-21b9-4503-8d5c-3bc5fcc3e56a",
    "model": null,
    "reasoning_effort": null,
    "notes": "Agente claude-code. Sesión **compartida**: trabajó 20 tickets (BUGFIX-ENGINE-FIRMA-DE-COMPUERTA-20261004 ×14, SECURITY-ENGINE-CIERRE-AUTORIZADO-20260926 ×10, BUGFIX-GATE-LECTOR-CRITERIOS-20261005 ×9, INTEGRATION-GIT-INTEGRACION-AUTONOMA-20260926 ×8, INTEGRATION-HERMES-DESPACHO-JORNADA-20261001 ×8), así que su costo no se reparte y acá no se registran números. Costo completo de la sesión: no declarado por el proveedor, 2015423 tokens. Registralo en el ticket cuya sesión sea propia, o declaralo compartido donde corresponda. Sesión \"AI development harness review\".",
    "input_tokens": null,
    "output_tokens": null,
    "total_tokens": null,
    "estimated_cost_usd": null,
    "source": "claude:666e4a95-21b9-4503-8d5c-3bc5fcc3e56a",
    "confidence": "high",
    "id": "CONSUMO-002"
  }
]
```

## Release

Sin publicar todavía.

## Eventos

```json
[
  {
    "kind": "ticket-event",
    "id": "EVENT-001",
    "date": "2026-10-04",
    "at": "2026-10-04T23:03:46.059Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-05",
    "at": "2026-10-06T02:35:37.636Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-05",
    "at": "2026-10-06T02:37:29.081Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-05",
    "at": "2026-10-06T02:47:50.268Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-05",
    "at": "2026-10-06T02:47:52.895Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-05",
    "at": "2026-10-06T02:58:22.022Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-05",
    "at": "2026-10-06T02:58:57.937Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-10-05",
    "at": "2026-10-06T03:03:31.088Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-10-05",
    "at": "2026-10-06T03:03:59.391Z",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-10-05",
    "at": "2026-10-06T03:04:02.731Z",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-10-05",
    "at": "2026-10-06T03:04:04.915Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-10-05",
    "at": "2026-10-06T03:04:11.563Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-002."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-10-05",
    "at": "2026-10-06T03:04:11.638Z",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-014",
    "date": "2026-10-05",
    "at": "2026-10-06T03:04:20.071Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  }
]
```
