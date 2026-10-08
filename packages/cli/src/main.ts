#!/usr/bin/env node
/**
 * Punto de entrada del CLI `valmen`.
 *
 * Lleva shebang porque es el ejecutable que se publica como `valmen`: sin él, el
 * archivo solo se puede lanzar con `node main.js` y un enlace en el `PATH` —que
 * es como se instala un binario— no arranca. TypeScript lo elimina al compilar
 * salvo que se le pida conservarlo, y esa diferencia no se nota hasta que
 * alguien intenta usarlo desde otra carpeta.
 *
 * El análisis de argumentos es propio y deliberadamente pequeño: el camino
 * crítico del harness no debe depender de un framework de CLI. Cada comando
 * devuelve un `CommandResult` en vez de escribir directamente, lo que hace que
 * todos los comandos sean testeables sin capturar la salida del proceso.
 */
import { randomBytes } from "node:crypto";
import { realpathSync } from "node:fs";
import { networkInterfaces } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { EXIT_INVARIANT, EXIT_SCHEMA, toFailure } from "@valmen/core";
import { apiKeyWithPrecedence, transportById } from "@valmen/credentials";
import { gateById } from "@valmen/gate";
import { gateRoutingFor, cascadeRoutingFor } from "@valmen/adapter";

/**
 * El CLI conoce el archivo de credenciales; el motor sólo conoce los roles.
 * Las suscripciones resuelven su token en su transporte nativo y no aceptan una
 * clave del YAML como si fuera un bearer token.
 */
function credentialForCascade(
  credentialsFile: string | undefined,
): (provider: string) => string | undefined {
  return (provider) => {
    const transport = transportById(provider);
    if (transport.credential !== undefined || transport.cli !== undefined) return undefined;
    return apiKeyWithPrecedence(provider, credentialsFile) ?? undefined;
  };
}

import {
  type CommandResult,
  askCommand,
  budgetCommand,
  buildIndex,
  calibrateReport,
  recordGatePromotion,
  deliverManifest,
  listActive,
  adoptProject,
  migrateRegistry,
  reportClosed,
  showTicket,
  syncProject,
  validateAll,
  resumeTicket,
  validateOne,
} from "./commands.js";
import { journeyHandoffCommand } from "./journey-handoff.js";
import { journeyWorktreeCommand } from "./worktree.js";
import { REAL_GIT, runDelegation } from "./delegation.js";
import { runFeature } from "./features.js";
import { probeCodegraph } from "./codegraph.js";
import { doctorCommand, providerCommand, routingCommand } from "./setup.js";
import { verifyOnboarding } from "./onboarding-verify.js";
import {
  runHermes,
  hermesNotify,
  hermesNotifyPendientes,
  hermesBrief,
  hermesRelay,
  configDeHermes,
  approvalSecret,
  decideByCode,
  COMO_CREAR_EL_SECRETO,
} from "./hermes.js";
import { mcpCommand } from "./mcp.js";
import { runProcess } from "./process.js";
import { runManuales } from "./manuales.js";
import { runCorpus } from "./corpus.js";
import { executionCommand } from "./execution.js";
import { runAutonomousCommand } from "./run.js";
import {
  type RegistryPaths,
  CASCADE_TASK_IDS,
  EVALUATOR_IDS,
  budgetRouting,
  choosePaths,
  isCascadeTaskId,
  isEvaluatorId,
  legacyPaths,
  declaredParamNames,
  renderCascadeTask,
  renderSimulation,
  runCascadeTask,
  runGate,
  simulateGate,
} from "@valmen/engine";
import {
  type ServerContext,
  createMissionControl,
  defaultContext,
  esAnfitrionLocal,
  loadStatics,
  recordHumanDecision,
} from "@valmen/server";
import {
  guardarConsumoDeSesiones,
  approvePlanCommand,
  journeyAdvanceCommand,
  journeyBriefCommand,
  journeyNextCommand,
  journeyClearStopCommand,
  journeyInstallTriggerCommand,
  journeyNotifyPlansCommand,
  journeyPlanCommand,
  planApproveCommand,
  approvalAuthorizeCommand,
  skillsExternalCommand,
  skillsReviewCommand,
  uxReviewCommand,
  qaAuthorizeCommand,
  qaAgentCommand,
  qaPolicyCloseCommand,
  qaPromoteCommand,
  qaShadowCommand,
  reviewAgentCommand,
  qaEligibilityCommand,
  approvalEligibilityCommand,
  precheckCommand,
  precisionCommand,
  thresholdsCommand,
  standardsCommand,
  memoryCommand,
  scanPendingSecretsCommand,
  templateCommand,
  driftCommand,
  learningsCommand,
  usageCommand,
  valueCommand,
} from "./commands.js";
import {
  type Entity,
  addAiUsage,
  addEvidence,
  addPoint,
  addRetest,
  closeAttempt,
  createTicket,
  releasePublish,
  qaClose,
  qaStart,
  transition,
} from "@valmen/engine";

export const USAGE = `valmen — harness agéntico

Uso: valmen <comando> [opciones]

Comandos:
  validate --all            Valida todos los tickets del registro.
  validate --id <ID>        Valida un ticket concreto.
  run --ticket <ID> | --queue
                            Despacha un ticket elegible hasta awaiting_user_tests.
  active                    Lista los tickets no cerrados (alias: list).
  resume [--id <ID>] [--cliente <claude|codex|opencode|hermes>]
                            Imprime el contexto para retomar un ticket, con el
                            modelo de cada fase según el cliente de la sesión.
                            Sin --id y con varios activos, no elige: pide uno.
  ask <pregunta>            El modo pregunta: el motor no concede permisos de
      --id <ID>             escritura, así que no se pueden crear tickets, mover
                            estados ni escribir archivos. Imprime el contexto de la
                            consulta —registro activo, el ticket con --id y lo que
                            la memoria del proyecto sabe del tema— y quién responde
                            no recibe el permiso.
  show <ID>                 Muestra el resumen de un ticket.
  index [--check]           Regenera el índice, o comprueba que esté al día.
  secrets [--staged]        Revisa los cambios pendientes en busca de secretos.
                            Solo mira las líneas agregadas. No imprime el valor.
  drift [--id <ID>] [--todos] [--strict]
                            Contrasta lo que los tickets citan —archivos, símbolos,
                            otros tickets— contra el proyecto. Sin modelo. Mira los
                            tickets en curso; --todos incluye el histórico. No bloquea
                            salvo con --strict, que sale con el código de bloqueo.
  estandar listar           Los estándares en vigor y los propuestos.
  estandar proponer --title <t> --rule <r> --area <a> [--why <texto>]
                            Propone un estándar. No está en vigor hasta aceptarlo.
  estandar revisar [--staged] [--limite <n>]
                            Avisa de colores fijos en las líneas que el cambio
                            agrega a archivos de interfaz. No bloquea.
  estandar aceptar <EST-001|pendientes> --instruccion <frase>
  estandar descartar <EST-001|pendientes> --instruccion <frase>
                            La decisión es de la persona: --instruccion lleva sus
                            palabras y queda escrita. Al aceptar, la regla pasa a
                            .valmen/rules/estandares-<área>.md.
  memory search <consulta>  Busca en la memoria del proyecto —decisiones y errores.
      --limite <n>          Cuántos resultados. Por defecto, 5.
  memory save --title <t> --body <b> [--tickets <ids>]
                            Guarda un aprendizaje en .valmen/memory/.
  memory list               Qué documentos son la memoria y qué se indexó.
  memory review             Los aprendizajes que esperan clasificación.
  memory clasificar <AP-001> --decision <regla|caso|descartar> [--area <área>]
                            Clasifica un aprendizaje. «regla» crea una propuesta de
                            estándar —que decide una persona—; «caso» lo deja como
                            documentación; «descartar» lo marca y lo conserva.
  usage [--desde <f>] [--hasta <f>]
                            Consumo del harness: evaluaciones, coste y calibración,
                            contado de los recibos. Sin fechas, todo el registro.
  usage value [--desde <f>] [--hasta <f>] [--limite <n>]
                            Lo mismo, ticket por ticket: qué costó cada cierre, sus
                            compuertas, sus ciclos de QA y cuántas veces volvió atrás.
                            Ordenado por coste. --limite son las filas (20 por defecto).
  budget [--tipo <TIPO>] [--id <ID>] [--avisar] [--check]
                            El costo típico por tipo de ticket —la mediana de sus
                            cierres— y los tres cortes del proyecto: aviso, degradación
                            y pausa. Con --id dice dónde está esa corrida; --avisar
                            manda el aviso del corte; --check sale con el código de
                            invariante cuando el corte es la pausa.
  migrate [--dry-run]       Lleva el registro al esquema vigente y limpia del
                            routing los roles que el harness ya no ejecuta.
  sync [--check]            Proyecta .valmen/ a AGENTS.md.
  adopt [--dry-run] [--machine-id <id>] [--codegraph]
                            Incorpora el harness a un proyecto existente. Ofrece
                            CodeGraph; con --codegraph lo indexa (init o sync), solo
                            si ya está instalado: sin la bandera nunca se ejecuta.
  onboarding verify         Comprueba la ruta CLI en una raíz temporal aislada.
  template list             Las plantillas por stack disponibles.
  template show <nombre>    Imprime lo que una plantilla escribe. Leerla es el paso.
  template apply <nombre>   Escribe sus reglas en .valmen/ (no pisa lo que existe).
      --dry-run             Muestra qué escribiría, sin escribir.
  precision [--desde <f>] [--hasta <f>]
                            Precisión de las compuertas por evaluador: tasa de banda,
                            revisiones aprobadas sin cambios y bloqueos por tipo. Lee los
                            recibos; no llama a ningún modelo.
  thresholds <gate> [--evaluator <id>]
                            Propone umbrales desde las decisiones humanas ya registradas,
                            con su acierto simulado. No aplica nada: lo firma una persona.
  journey plan --project <id> (--feature <slug> | --tickets <a,b,c>) [--max <n>] [--to <destino>]
                            Arma la jornada del día en el registro de jornadas y envía el
                            plan por Telegram. No despacha ni reserva capacidad.
  journey advance --project <id> [--journey <id>] [--fase preparacion|ejecucion] [--to <destino>]
                            Avanza la jornada una vez: sin modelo e idempotente (un segundo
                            avance no despacha otro ticket). Pensado para un disparador.
  journey next --wave [--concurrency <n>] [--journey <id>] [--project <id>]
                            Los tickets de la jornada listos para despachar ahora a subagentes
                            (3 a la vez por defecto, contando los que ya están en curso). Solo lectura.
  journey brief --id <ID> [--cliente <c>] [--project <id>]
                            El brief autocontenido de un ticket para un subagente: worktree, siguiente
                            paso, modelo, compuertas, contrato de entrega y prohibiciones. Solo lectura.
  journey handoff --id <jornada> [--project <id>] [--to <destino>] [--saved]
                            El parte final de la corrida: qué probar y cómo en cada ticket
                            que espera tus pruebas, los cerrados por política y los sin
                            entregar. Lo guarda; con --to lo envía una vez. No cierra nada.
  journey notify-plans --project <id> --journey <id> [--to <destino>]
                            Emite un código de aprobación por plan listo y uno de lote, y los envía.
  approval-eligibility --id <ID> --stage analysis|plan [--json]
                            Decide en código si el análisis o el plan del ticket puede aprobarse por una
                            autorización (sin modelo y sin escribir nada). Sale con 3 si no lo es.
  review-agent --id <ID> --stage analysis|plan [--dry-run] [--json]
                            El revisor de un review (R-APRO-003), de solo lectura: toma el
                            último recibo en review, elige el modelo del rol reviewer solo si
                            es distinto del que produjo el análisis y el plan, y le pasa el
                            artefacto y las proposiciones en banda media. Imprime su decisión
                            (approve o reject) y aclara que no se registró. --dry-run muestra
                            productor, revisor y proposiciones sin llamar al modelo. Sale con 3
                            si la revisión no procede.
  qa-eligibility --id <ID> [--base <commit>]
  qa-agent --id <ID> --base <commit> --delivered <commit>
  qa-policy-close --id <ID>
  qa-shadow
  qa-promote --actor <nombre> --quote "<frase>"
                            Decide en código si el ticket es elegible para QA por agente (seis
                            reglas, sin modelo). Sale con 3 si no lo es.
  skills review <id> --actor <nombre> --quote "<frase>" --permissions "<permisos>"
                            Registra la revisión de una persona sobre el contenido actual de la skill; la habilita solo si coincide con el hash declarado.
  ux review --id <ID> [--report <ruta>] [--staged]
                            Anexa al ticket la revisión de UX de los archivos de interfaz del cambio (UI UX Pro Max e Impeccable si están habilitadas); es evidencia y sale con 0 con o sin hallazgos.
  skills external
                            Lista las skills de terceros declaradas en external-skills; no descarga ni instala nada.
  approval-authorize create --actor <nombre> --quote "<frase>" --types <a,b> --modules <x,y> [--max-risk <r>] [--impacts <i,j>] [--stages analysis,plan] [--mode on-approve|reviewer] [--daily-quota <n>] [--valid-days <n>]
  approval-authorize revoke --id <APA-…> --actor <nombre> --reason "<motivo>"
  approval-authorize list
  approval-authorize link --types <a,b> --modules <x,y> [mismos términos que create]
                            Emite un código firmado de un solo uso (24 h) con esos términos congelados.
  approval-authorize redeem --code <código> --actor <nombre> --quote "<frase>"
                            Lo canjea; exige la fuente enlace-firmado en approval-authorization-sources.
  approval-authorize revoke-code --code <código> --actor <nombre>
                            Un código emitido y no canjeado deja de servir.
                            La autorización de aprobación automática de planes y análisis: la crea o revoca
                            una persona; nunca SECURITY. Se rechaza en una sesión desatendida.
  qa-authorize create --actor <nombre> --quote "<frase>" --types <a,b> --modules <x,y>
                [--max-risk low|normal] [--daily-quota <n>] [--valid-days <n>] [--source <canal>]
                            Crea la autorización permanente de QA por agente. Solo una persona:
                            una sesión desatendida y una fuente no declarada se rechazan.
  qa-authorize link --types <a,b> --modules <x,y> [--max-risk <r>] [--daily-quota <n>] [--valid-days <n>]
                            Emite un código firmado de un solo uso (24 h) con esos términos congelados.
  qa-authorize redeem --code <código> --actor <nombre> --quote "<frase>"
                            Lo canjea; exige la fuente enlace-firmado en qa-authorization-sources.
  qa-authorize revoke-code --code <código> --actor <nombre>
                            Un código emitido y no canjeado deja de servir.
  qa-authorize revoke --id <QAA-…> --actor <nombre> --reason "<motivo>"
                            La revoca; vale desde ese momento. qa-authorize list las muestra.
  plan-approve --code <código> --actor <nombre> --quote "<frase>"
                            Aprueba el plan (o el lote) de un código, con fuente token: solo si el
                            proyecto la declara en plan-approval-sources. De un solo uso.
  journey clear-stop --project <id> --id <ticket> --actor <nombre>
                            Libera la parada de un ticket: una parada no se reintenta sola.
  journey worktree create|remove --id <ID>
                            Crea o quita el worktree .claude/worktrees/ticket-<slug> (rama
                            valmen/ticket-<slug>) del ticket, solo desde el checkout principal.
  journey install-trigger --project <id> [--every <min>] [--via machine|hermes] [--write] [--dir <carpeta>]
                            Prepara la tarea periódica de launchd: imprime el plist y los
                            comandos; con --write escribe solo el archivo. No ejecuta launchctl.
  approve-plan --id <ID> --actor <nombre> [--source <fuente>] --quote "<frase>"
                            Registra la aprobación del plan con actor, fuente, frase y hash
                            del plan. Una sesión desatendida no puede registrarla.
  precheck <gate> --id <ID> Revisión previa a mano (analysis o plan): la misma que corre la
                            compuerta antes de llamar al evaluador. Sale con 3 si falta algo.
  gate <gate> --id <ID>     Evalúa un gate contra un ticket.
      --force-reason <m>    Repite una compuerta ya evaluada sobre el mismo estado y con el
                            mismo evaluador: sin motivo se rechaza; con él queda en el recibo.
      --evaluator <id>      auto (por defecto) · command · jev · llm-judge · cascade
  promote-gate <gate>       Calibra el gate contra decisiones humanas y anexa la
      --limit <n>           evidencia que una solicitud gate-promotions necesita.
  cascada --tarea <id>      Corre una tarea de la cascada verificada y deja el recibo
                            en .valmen/cascada/. La tarea es clasificacion o exploracion.
      --solicitud <texto>   Lo que hay que clasificar (tarea clasificacion).
      --pregunta <texto>    Lo que hay que responder (tarea exploracion).
  create --id <ID> --title <t> --type <TIPO> --module <MODULO> --request <texto>
                            Crea un ticket desde la plantilla, en intake.
  release-publish --version <SemVer> --tickets <ID1,ID2>
                            Registra la publicación. Exige el tag anotado sobre
                            production y que cada ticket esté cerrado.
  add-point --id <ID> --title <t> --severity <s> --actual <a> --expected <e>
                            Anexa el siguiente POINT-NNN, en estado abierto.
      --files <a,b>         Archivos que el punto toca, relativos a la raíz.
  qa-start --id <ID> --environment <e> --build-reference <ref>
                            Abre un ciclo QA. Exige el ticket en in_qa. La ref es
                            commit:<sha> —verifica que el árbol del commit sea
                            el de la evidencia worktree:sha256 del ticket; igualdad
                            probada evita re-correr la suite sobre el commit— o
                            worktree / worktree:sha256:hash.
  qa-close --id <ID> --result <r>
                            Cierra el ciclo abierto. --po-confirmation si aprueba.
  add-evidence --id <ID> --kind <k> --description <d>
                            Anexa evidencia. --reference y --point-id opcionales.
  add-retest --id <ID> --point-id <P> --result <r>
                            Anexa un retest y mueve el punto según el resultado.
  close-attempt --id <ID> --technical-summary <t> --functional-summary <f>
                --qa-status <approved|waived> --release-impact <r>
                            Anexa un intento de cierre. No cierra el ticket.
  add-ai-usage --id <ID> --source <s> --confidence <high|medium|low>
                            Anexa consumo de IA. El resto de campos son opcionales.
                            La fuente es <origen>:<referencia>, con origen
                            opencode —la ruta de opencode.db—, hermes —la de su
                            base—, codex o claude —el id de la sesión— o manual
                            —una sesión sin agregado, con el motivo en --notes—.
                            Sin consumo el ticket no cierra.
  gate-decide --id <ID> --receipt <GR-…> --decision <approve|reject> --actor <nombre>
                            Registra la decisión humana sobre un gate escalado.
      --reason <texto>      Queda en el recibo y en el historial del ticket.
  gate-decide --code <CÓDIGO> --decision <approve|reject> --actor <nombre>
                            La misma decisión, tomada desde el celular. El código
                            lo emite "valmen hermes notify"; el ticket y el recibo
                            los trae el token firmado, así que no se pasan. Se
                            niega si el ticket cambió desde que se notificó.
  transition --id <ID> --entity <entidad> --to <estado>
                            Mueve el estado de un ticket, un punto o una release.
      --point-id <POINT>    Obligatorio con --entity point.
      --reason <texto>      Solo al reabrir un ticket no publicado, o al
                            declarar terminal un punto.
      --version <SemVer>    Solo con --entity release.
  feature list              Lista las features del proyecto.
  feature show <slug>       Muestra el brief y los artefactos de una feature.
  feature new <slug> --title <t>
                            Crea una feature en draft, en .valmen/features/.
  feature decompose <slug>  Propone el grafo de tickets con el modelo del rol
                            architect y escribe tickets.yaml. Pasa a decomposed.
  feature materialize <slug> [--dry-run]
                            Escribe en el registro los tickets del grafo que falten,
                            en intake. Los que ya existen no se tocan.
  feature attach <slug> --ticket <ID> [--sprint S6 --goal "…"] [--depends-on A,B]
                            Mete en el grafo de la feature un ticket que ya existe, para
                            que cuente en su tablero y no quede suelto. Con un sprint que
                            no existe, hay que dar su objetivo: un sprint sin objetivo es
                            una fila vacía. No toca el ticket.
  feature detach <slug> --ticket <ID>
                            Lo saca del grafo. El ticket sigue en el registro.
  feature asset add <slug> --file <ruta> --description <t> [--name <n>] [--origin-url <u>]
                            Anexa un archivo (diseño, captura, documento del cliente) a la
                            feature: lo copia a assets/ con su sha256 y lo anota en el
                            manifiesto. Un enlace no se anexa: se trae una copia local.
  feature advance <slug> --to <estado> [--pendientes-del-po]
                            Mueve el estado de la feature por el camino más corto. Con
                            --to complete exige verify.md y todos los tickets cerrados;
                            --pendientes-del-po acepta los que esperan al PO.
  feature verify <slug> [--rewrite]
                            Escribe verify.md desde el registro de tickets del grafo.
  delegation grant --feature <slug> | --tickets A,B --quote "<palabras del PO>" [--actor <n>]
                            Registra la delegación del PO: alcance y sus palabras, citadas
                            en cada decisión que el agente toma en su nombre.
  delegation status|next [--delegation <DEL-…>]
                            Dónde va la delegación; next dice el ticket que sigue.
  delegation advance --id <ID> [--reason <por qué>] [--evaluator cascade]
                            Del análisis a in_progress: corre las compuertas, aprueba una
                            REVIEW solo con --reason y se detiene ante BLOCK o un gate
                            humano duro. Aprueba el plan citando la delegación.
  delegation close --id <ID> --files a,b --environment <e> --tests <qué corrió> --tests-passed
                   --technical-summary <t> --functional-summary <t> --release-impact <t>
                   [--visual] [--po-confirmation <palabras>]
                            QA y cierre: punto con --files, QA con el HEAD vigente. Un ticket
                            visual o con criterios del PO queda en awaiting_user_tests.
  feature asset list <slug> Lista los adjuntos y avisa de los enlaces externos sin copia.
      --dry-run             Muestra la descomposición sin escribirla.
      --model <id>          Sobrescribe el modelo del rol architect.
      --provider <id>       Sobrescribe el proveedor.
  report                    Reporte Markdown de los tickets cerrados.
      --desde <YYYY-MM-DD>  Por defecto, hace 30 días.
      --hasta <YYYY-MM-DD>  Por defecto, hoy. El rango es por fecha de CIERRE.
      --type <TIPO>         Filtra por tipo de ticket.
      --q <texto>           Busca en título, problema, solución y rol afectado.
  deliver-manifest --version <SemVer> --tickets <ID1,ID2>
                            Escribe el manifiesto de entrega en
                            .valmen/deliveries/<versión>.json. Exige cada ticket
                            cerrado, visible al usuario y sin publicar.
      --released-at <fecha> Por defecto, hoy.
      --dry-run             Muestra el manifiesto sin escribirlo.
  process list              Lista los procesos declarados en .valmen/processes/.
  process show <id>         Muestra los pasos y los parámetros de un proceso.
  process run <id>          Ejecuta un proceso. Se detiene en un gate sin aprobar.
      --set n=v[,n=v]       Parámetros del proceso. También --<nombre> <valor>,
                            salvo que choque con una bandera del CLI.
      --skip-gates          No espera en los gates: los saltea. Para ensayar.
  process approve <gate> --actor <nombre>
                            Aprueba un gate de proceso. No retoma nada por sí solo.
      --reason <texto>      Queda registrado con la aprobación.
      --run <corrida>       Un gate que exige frase (como deploy) se aprueba para una corrida
      --phrase <frase>      detenida, con la frase exacta y la versión de esa corrida.
                            La aprobación se consume al usarse.
  process runs              Las corridas, con las detenidas primero.
  process show-run <corrida>
                            El detalle de una corrida.
  process resume [corrida]  Retoma una corrida detenida **desde donde quedó**: los
                            pasos ya ejecutados no se repiten.
      --skip-gates          Saltea los gates que sigan sin aprobar.
  process abandon <corrida> Deja de poder retomarla. No deshace lo ya ejecutado.
  manuales pendientes --tickets <ID1,ID2>
                            Lista los manuales que la release dejó desactualizados,
                            cruzando las pantallas que tocaron sus tickets con lo que
                            cada manual declara como fuente. Sale siempre por stdout.
      --tickets <ID1,ID2>   Los tickets de la release. Se puede repetir la bandera.
      --manuales-dir <ruta> Dónde viven los manuales (por defecto
                            docs/manuales/usuario-final).
      --pantallas <g1,g2>   Los patrones que definen una pantalla. Por defecto
                            **/*.component.ts y **/*.component.html.
      --escribir            Deja el listado en <manuales-dir>/pendientes.md. Sin
                            esta bandera no escribe ningún archivo.
  manuales auditar --manuales-dir <ruta>
                            Audita los manuales contra el código con citas. Cada
                            afirmación visible declara la línea que la respalda
                            con <!-- cita: <ruta>:<línea> -->, en la misma
                            línea o en la de abajo; la cita resuelve si el
                            archivo existe y la línea cae dentro y no está vacía.
                            No son afirmaciones los encabezados, el bloque de
                            metadata de la plantilla, la cabecera y los
                            separadores de una tabla, ni la sección de
                            pendientes: ninguno afirma comportamiento y exigirles
                            cita bloquearía todo manual escrito con la plantilla.
                            Veredictos: approve (todo cita y resuelve), block
                            (falta cita, no resuelve, está mal formada o se filtró
                            una ruta técnica) y review (un mensaje de error que no
                            aparece en las fuentes, o ningún manual que auditar).
                            Deja el recibo en
                            .valmen/receipts/actualizar-manuales.jsonl.
      --manuales-dir <ruta> Dónde viven los manuales (por defecto
                            docs/manuales/usuario-final).
  manuales plantilla        Imprime el esqueleto del manual de usuario final
                            —el bloque de metadata, la línea
                            <!-- rutas-fuente: … --> y las seis secciones— para
                            que el agente lo escriba sin inventar la estructura.
                            Sale siempre por stdout.
      --pantalla <nombre>   El nombre de la pantalla, en el encabezado.
      --escribir            Deja el manual en la ruta de --destino. Sin esta
                            bandera no escribe ningún archivo.
      --destino <ruta>      Ruta relativa a la raíz donde escribir el manual.
                            Obligatoria con --escribir; no se pisa un archivo
                            existente salvo con --forzar.
      --forzar              Reescribe el archivo aunque ya exista.
  corpus publicar           Publica manuales, memoria y tickets cerrados por colecciones.
                            Entrega solo nuevos, cambiados y eliminados; sin embeddings.
      --corpus-dir <ruta>   Destino y estado (por defecto .valmen/corpus).
      --manuales-dir <ruta> Fuente de manuales (docs/manuales/usuario-final).
      --indexador <nombre> Destino registrado (archivos por defecto; corpus-indexer
                            en la configuración puede elegirlo).
      --completo            Republica todos los documentos actuales.
  provider [list|set|test|models]
                            Los proveedores y sus credenciales. "list" dice cuáles
                            hay y cuáles están configurados; "set <id> --key <k>"
                            prueba la clave contra el proveedor y la guarda solo si
                            sirve; "test <id> [--model <m>]" comprueba la credencial
                            o un modelo concreto; "models <id>" lista su catálogo.
                            Los proveedores de suscripción —Claude Code, codex— no se
                            pegan a mano: se leen del CLI que ya los autenticó.
  routing [show|set|clear]
                            Qué modelo ejecuta cada rol. "show" dice de dónde sale
                            cada uno; "set --preset <p>" cambia el conjunto entero;
                            "set <rol> --provider <p> --model <m> [--effort <e>]"
                            cambia uno; "clear <rol>" lo devuelve al preset. Escribe
                            .valmen/routing.yaml, el mismo archivo que la pantalla.
  doctor                    Qué le falta a esta máquina y a este proyecto, con el
                            comando exacto que lo arregla. No escribe nada: es lo
                            primero que corre un agente al que le piden configurar
                            el proyecto. Sale con 2 si falta algo.
  mcp                       El servidor MCP del harness, y cómo declararlo en cada
                            agente. Sin --install muestra el fragmento exacto.
      --install             Escribe las entradas del proyecto (opencode.json,
                            .mcp.json de Claude Code), conservando lo que hubiera.
      --global              Añade también la de codex, que es de la persona.
  hermes [status|connect|test|notify|brief]
                            Conexión con Hermes. "status" diagnostica —y es lo que
                            hace sin argumentos—; "connect" declara el servidor en
                            ~/.hermes/config.yaml, que es global y por eso necesita
                            la raíz de este proyecto; "test" manda un mensaje de
                            prueba al celular; "notify" avisa de lo que espera una
                            decisión —los gates de ticket, con su código para
                            decidirlos a distancia, y los procesos detenidos, que se
                            aprueban solo en la máquina—. Sin --id ni --receipt
                            avisa de todo lo pendiente, y el
                            destino sale de .valmen/config.yaml; se puede correr
                            seguido, porque lo ya avisado no se avisa dos veces.
                            "brief" arma el parte —lo que espera decisión, lo que
                            se detuvo, lo que está en curso, lo que se cerró y el
                            consumo— y lo manda. Sin destino lo imprime, que es
                            como se revisa antes de que le llegue a nadie.
      --dias <n>            Cuántos días atrás se cuentan los cierres. Por defecto, 7.
      --id <TICKET>         Avisar solo de este ticket. Con --receipt y --to.
      --receipt <GR-…>      El recibo vigente y escalado a una persona.
      --name <n>            Nombre de la entrada. Sin --profile, por defecto
                            valmen; con --profile, valmen-<perfil>. Cambiarlo
                            conecta un segundo proyecto a la misma config.
      --profile <perfil>    Perfil de Hermes donde se declara: escribe en
                            ~/.hermes/profiles/<perfil>/config.yaml y la entrada
                            se llama valmen-<perfil>. El perfil tiene que existir
                            (hermes profile create <perfil>).
      --to <destino>        Destino: telegram, discord:#ops. Pisa al de la
                            configuración. Los que haya se listan con
                            "hermes send --list".
      --untrusted           Declara trust: untrusted: Hermes pide permiso antes
                            de cada escritura al registro.
      --dry-run             Muestra el bloque sin escribir el archivo.
      --force               Escribe aunque Hermes no parezca instalado.
  serve [--port <n>] [--host <dirección>]
                            Mission Control en 127.0.0.1. Con --host 0.0.0.0
                            escucha en la red —para mirarlo desde una tablet— y sin
                            autenticación: la frontera de confianza es tu red.
  simulate <gate>           Mide un gate sobre el registro histórico.
      --limit <n>           Evalúa solo los primeros n sujetos.
      --json                Informe en JSON en vez de tabla.
      --calibrate           Compara el veredicto del gate con el que registraron
                            las personas en los ciclos de QA. Cuesta una
                            evaluación completa: se pide a sabiendas.

Opciones globales:
  --root <ruta>             Raíz del proyecto (por defecto: el directorio actual).
  --tickets-dir <ruta>      Directorio del registro, relativo a la raíz.
                            (Se llamaba --tickets; el nombre cambió porque
                            release-publish usa --tickets para la lista de IDs.)
  --legacy-layout           Usa docs/tickets/ en vez de tickets/.
  --credentials <ruta>      Archivo de credenciales. Por defecto, el del $HOME.
  -h, --help                Muestra esta ayuda.
  --version                 Muestra la versión.

Códigos de salida:
  0  éxito
  2  entrada inválida
  3  invariante de estado violada
  4  incoherencia del registro histórico
  5  referencia de artefacto inválida
  6  sujeto no identificable sin ambigüedad
`;

/** Opciones ya analizadas de la línea de comandos. */
interface Options {
  readonly root: string;
  readonly ticketsDir?: string;
  readonly legacyLayout: boolean;
  readonly help: boolean;
  readonly version: boolean;
  /** Palabras sueltas que no son opciones: el comando y sus argumentos. */
  readonly positionals: string[];
  /** Banderas y opciones reconocidas, normalizadas sin los guiones. */
  readonly flags: Readonly<Record<string, string | true>>;
}

/** Opciones que consumen un valor. */
export const VALUE_OPTIONS = [
  "--root",
  "--tickets-dir",
  "--id",
  "--limit",
  "--evaluator",
  // El informe de Impeccable que `ux review` anexa.
  "--report",
  // El tipo de ticket del informe de presupuestos.
  "--tipo",
  // La corrida de la cascada: la tarea y su entrada.
  "--tarea",
  "--solicitud",
  "--pregunta",
  "--port",
  // La aprobación de un gate que exige frase: la corrida y la frase literal.
  "--phrase",
  // `transition` mueve el estado de una entidad, y sus banderas llevan valor.
  "--entity",
  "--to",
  "--point-id",
  "--reason",
  "--version",
  // Comandos de anexado.
  "--title",
  "--severity",
  "--actual",
  "--expected",
  "--kind",
  "--description",
  "--reference",
  "--source",
  "--confidence",
  "--session-reference",
  "--model",
  "--reasoning-effort",
  "--input-tokens",
  "--output-tokens",
  "--total-tokens",
  "--estimated-cost-usd",
  "--notes",
  "--environment",
  "--build-reference",
  "--result",
  "--po-confirmation",
  "--technical-summary",
  "--functional-summary",
  "--qa-status",
  "--release-impact",
  "--qa-waiver-reason",
  "--receipt",
  "--decision",
  "--actor",
  "--tickets",
  // El tope de tickets de una jornada.
  "--max",
  // El avance de una jornada concreta, el intervalo del disparador y su carpeta.
  "--journey",
  "--concurrency",
  "--fase",
  "--every",
  "--via",
  "--dir",
  // `manuales pendientes`: dónde viven los manuales y qué archivos son pantalla.
  // Sin esto en la lista, `--manuales-dir docs/…` se leería como bandera booleana
  // y la ruta quedaría como argumento suelto.
  "--manuales-dir",
  // `corpus publicar`: destino del corpus e indexador registrado.
  "--corpus-dir",
  "--indexador",
  "--pantallas",
  // `manuales plantilla`: el nombre de pantalla del encabezado y la ruta relativa
  // donde escribir el manual. Sin esto en la lista, los dos valores quedarían
  // como argumentos sueltos y el comando escribiría en cualquier parte.
  "--pantalla",
  "--destino",
  "--desde",
  "--hasta",
  "--q",
  "--set",
  // `memory` y los anexados que se agregaron después. Una bandera que consume
  // valor y no está acá se lee como booleana y su valor queda como argumento
  // suelto: el comando corre con la mitad de lo que se le pidió y sin decir nada.
  "--limite",
  "--cliente",
  "--body",
  "--files",
  // `estandar proponer`: las tres banderas del estándar. La prueba que compara la
  // ayuda con esta lista las cazó en cuanto se agregaron, que es para lo que está.
  "--rule",
  "--why",
  "--area",
  // `estandar aceptar`: las palabras de quien decide. Una bandera que consume
  // valor y no está en esta lista se lee como booleana y su valor queda suelto.
  "--instruccion",
  // `serve --host`: dónde escucha Mission Control.
  "--host",
  // `memory clasificar`: qué se hace con el aprendizaje.
  "--decision",
  "--actor",
  "--run",
  "--credentials",
  "--released-at",
  "--provider",
  "--type",
  "--module",
  "--request",
  // `hermes`: el nombre de la entrada. Hermes es global —una config para todos
  // los proyectos—, así que conectar un segundo proyecto es declarar una segunda
  // entrada con otro nombre. Sin esto en la lista, `--name valor` se leía como
  // bandera booleana más un argumento suelto, y `connect` escribía la entrada
  // `valmen` creyendo que había hecho lo que se le pidió.
  "--name",
  // `hermes --profile`: el perfil de Hermes donde se declara la entrada. Sin
  // esto en la lista, `--profile valor` se leería como booleana más un argumento
  // suelto, y `connect` escribiría en el config global creyendo otra cosa.
  "--profile",
  // `gate-decide --code`: el código corto que llegó al celular. Reemplaza a
  // `--id` y `--receipt`, que el token firmado ya trae.
  "--code",
  // La autorización de QA por agente: tipos, módulos, riesgo, cupo y vigencia.
  "--base",
  "--delivered",
  "--types",
  "--permissions",
  "--impacts",
  "--stages",
  // `review-agent --stage`: la etapa cuyo review se revisa (analysis o plan).
  "--stage",
  "--mode",
  "--modules",
  "--max-risk",
  "--daily-quota",
  "--valid-days",
  // `approval-eligibility --stage`: la etapa (analysis o plan) cuya compuerta se quiere aprobar.
  "--stage",
  // `hermes brief --dias N`: cuántos días hacia atrás se cuentan los cierres.
  "--dias",
  // `provider` y `routing`: la puesta en marcha sin pasar por la pantalla. Es lo
  // que permite que un agente configure el proyecto —un equipo que trabaja dentro
  // de Claude Code le pide a Claude que lo instale, y Claude no puede pulsar un
  // botón—.
  "--key",
  "--preset",
  "--effort",
  // `feature attach`: anexar al grafo un ticket que ya existe.
  "--ticket",
  "--sprint",
  "--goal",
  "--depends-on",
  // `delegation`: el alcance, las palabras del PO y lo que se ejecutó.
  "--delegation",
  "--quote",
  "--tests",
  "--feature",
  // `gate --force-reason`: el motivo para repetir una compuerta sobre el mismo estado.
  "--force-reason",
  // `feature asset add`: el archivo local y el enlace del que salió.
  "--file",
  "--origin-url",
  // `execution`: identidad y hecho de actividad del contrato portable.
  "--project",
  "--execution",
  "--attempt",
  "--event-id",
  "--state",
  "--occurred-at",
  // `adopt --machine-id`: identidad que permite crear el primer binding local.
  "--machine-id",
] as const;

/**
 * La primera dirección IPv4 de la máquina en la red local.
 *
 * Se imprime para que abrir Mission Control desde una tablet no exija averiguar
 * la IP a mano: `0.0.0.0` es la dirección donde **escucha**, no donde se entra.
 */
function primerIpLocal(): string {
  const interfaces = networkInterfaces();
  for (const direcciones of Object.values(interfaces)) {
    for (const direccion of direcciones ?? []) {
      if (direccion.family === "IPv4" && !direccion.internal) return direccion.address;
    }
  }
  return "0.0.0.0";
}

/** Error de uso: se reporta con el código de esquema, como el CLI de referencia. */
class UsageError extends Error {}

/**
 * Analiza los argumentos.
 *
 * Se admiten las dos formas de declarar una opción: `--clave valor` y
 * `--clave=valor`. Un valor que empieza por `--` se rechaza como valor para no
 * tragarse la opción siguiente por error.
 */
export function parseArgs(
  argv: readonly string[],
  /**
   * Opciones que consumen un valor además de las del CLI.
   *
   * Las usa `process run`: los parámetros de un proceso no están en la lista fija,
   * así que `--modulo inventario` se leería como una bandera booleana y el valor
   * quedaría suelto.
   */
  extraValueOptions: readonly string[] = [],
): Options {
  const valueOptions = new Set<string>([...VALUE_OPTIONS, ...extraValueOptions]);

  let root = process.cwd();
  let ticketsDir: string | undefined;
  let legacyLayout = false;
  let help = false;
  let version = false;
  const positionals: string[] = [];
  const flags: Record<string, string | true> = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index] as string;

    if (arg === "-h" || arg === "--help") {
      help = true;
      continue;
    }

    if (!arg.startsWith("-")) {
      positionals.push(arg);
      continue;
    }

    const equals = arg.indexOf("=");
    const name = equals === -1 ? arg : arg.slice(0, equals);
    let inlineValue: string | undefined = equals === -1 ? undefined : arg.slice(equals + 1);

    // Opciones que consumen un valor: `--root X` o `--root=X`.
    if (valueOptions.has(name)) {
      if (inlineValue === undefined) {
        const next = argv[index + 1];
        if (next === undefined || next.startsWith("--")) {
          throw new UsageError(`La opción ${name} requiere un valor.`);
        }
        index += 1;
        inlineValue = next;
      }
      if (name === "--root") root = inlineValue;
      else if (name === "--tickets-dir") ticketsDir = inlineValue;
      else {
        const clave = name.slice(2);
        const previo = flags[clave];
        // Una bandera repetida **acumula** en vez de pisar el valor anterior.
        // `manuales pendientes --tickets A --tickets B` pide una lista, y quedarse
        // con el último dejaba el primero afuera sin decir nada.
        flags[clave] =
          typeof previo === "string" ? `${previo},${inlineValue}` : inlineValue;
      }
      continue;
    }

    if (equals !== -1) {
      throw new UsageError(`La opción ${name} no admite un valor.`);
    }
    if (name === "--legacy-layout") {
      legacyLayout = true;
      continue;
    }
    if (name === "--version") {
      version = true;
      continue;
    }

    // Bandera booleana de comando: `--all`, `--check`, …
    flags[name.slice(2)] = true;
  }

  return {
    root: resolve(root),
    ...(ticketsDir === undefined ? {} : { ticketsDir }),
    legacyLayout,
    help,
    version,
    positionals,
    flags,
  };
}

/** Resuelve las rutas del registro a partir de las opciones. */
/**
 * `gate decide`: registra la decisión de una persona sobre un gate escalado.
 *
 * Faltaba, y su ausencia dejaba el trabajo a medias en las dos direcciones: la
 * decisión humana solo se podía tomar en la app y la transición solo en el CLI.
 * Quien trabaja en la terminal no podía cerrar un gate.
 */
export function runGateDecide(
  paths: RegistryPaths,
  flags: Readonly<Record<string, string | true>>,
): CommandResult {
  const ticketId = flag(flags, "id");
  const receiptId = flag(flags, "receipt");
  const decision = flag(flags, "decision");
  const actor = flag(flags, "actor");
  const codigo = flag(flags, "code");

  const falta = (nombre: string): CommandResult => ({
    stdout: "",
    stderr:
      `gate decide requiere --${nombre}. ` +
      "Una decisión humana sin ese dato no es auditable.",
    exitCode: EXIT_SCHEMA,
  });

  // El camino del celular. Con `--code`, el ticket y el recibo los dice el token
  // firmado, no la línea de comandos: si se pudieran pasar por separado, el
  // código autorizaría una decisión y el comando registraría otra. Por eso los
  // dos caminos no comparten la comprobación de banderas —el remoto exige
  // `--code` y **prohíbe** `--id` y `--receipt`— en vez de aceptar las dos y
  // quedarse con una.
  if (codigo !== undefined) {
    if (ticketId !== undefined || receiptId !== undefined) {
      return {
        stdout: "",
        stderr:
          "Con --code no se pasan --id ni --receipt: los dice el token firmado.\n" +
          "Aceptarlos permitiría autorizar una decisión y registrar otra.\n",
        exitCode: EXIT_SCHEMA,
      };
    }
    if (decision !== "approve" && decision !== "reject") {
      return {
        stdout: "",
        stderr: "gate decide requiere --decision approve o --decision reject.",
        exitCode: EXIT_SCHEMA,
      };
    }
    if (actor === undefined || actor.trim() === "") return falta("actor");

    const secreto = approvalSecret(
      typeof flags["credentials"] === "string"
        ? (flags["credentials"] as string)
        : undefined,
    );
    if (secreto === null) {
      return {
        stdout: "",
        stderr:
          "Falta el secreto con el que se verifican los tokens de aprobación.\n\n" +
          `${COMO_CREAR_EL_SECRETO}\n`,
        exitCode: EXIT_SCHEMA,
      };
    }

    return decideByCode({
      paths,
      code: codigo,
      decision,
      actor: actor.trim(),
      reason: flag(flags, "reason") ?? "",
      secret: secreto,
      now: new Date(),
    });
  }

  if (ticketId === undefined) return falta("id");
  if (receiptId === undefined) return falta("receipt");
  if (decision !== "approve" && decision !== "reject") {
    return {
      stdout: "",
      stderr: "gate decide requiere --decision approve o --decision reject.",
      exitCode: EXIT_SCHEMA,
    };
  }
  if (actor === undefined || actor.trim() === "") return falta("actor");

  const resultado = recordHumanDecision(paths, ticketId, receiptId, {
    decision,
    actor,
    reason: flag(flags, "reason") ?? "",
  });

  if (!resultado.ok) {
    return { stdout: "", stderr: resultado.error, exitCode: EXIT_INVARIANT };
  }
  return {
    stdout: `Decisión registrada en ${receiptId}: ${decision} por ${actor.trim()}.
`,
    stderr: resultado.error === "" ? "" : resultado.error,
    exitCode: 0,
  };
}

/**
 * Qué banderas consumen un valor para el `process run` de esta línea de comandos.
 *
 * Se mira el `--root` crudo —el único que decide dónde está el proceso— y se leen
 * sus parámetros declarados. Sin esto, `--modulo inventario` se analiza como una
 * bandera booleana porque `--modulo` no está en la lista fija del CLI, el valor
 * queda suelto y el motor se queja de que falta un parámetro que sí se pasó.
 */
function valorDeParametrosDeProceso(argv: readonly string[]): string[] {
  const posicion = argv.findIndex((arg) => arg === "process");
  if (posicion === -1 || argv[posicion + 1] !== "run") return [];
  const id = argv[posicion + 2];
  if (id === undefined || id.startsWith("--")) return [];

  const raizCruda = argv.findIndex((arg) => arg === "--root");
  const raiz = raizCruda === -1 ? process.cwd() : (argv[raizCruda + 1] ?? process.cwd());
  try {
    // Con los guiones: `parseArgs` compara el nombre tal como se escribe —`--modulo`—,
    // no el nombre del parámetro.
    return declaredParamNames(raiz, id).map((nombre) => `--${nombre}`);
  } catch {
    // Un proceso que no se puede leer no impide analizar los argumentos: el error
    // bueno lo da el motor, con el catálogo delante.
    return [];
  }
}

/** Los comandos que anexan datos a un ticket. */
const ESCRITURA = new Set([
  "create",
  "release-publish",
  "add-point",
  "qa-start",
  "qa-close",
  "add-evidence",
  "add-retest",
  "close-attempt",
  "add-ai-usage",
]);

/**
 * Los comandos de anexado, traducidos a peticiones del motor.
 *
 * La validación de las banderas obligatorias vive aquí, en la superficie: el
 * motor recibe una petición bien formada y sus errores son del contrato. La
 * separación importa porque el servidor llama al mismo motor sin pasar por aquí.
 */
export function runAppend(
  command: string,
  paths: RegistryPaths,
  flags: Readonly<Record<string, string | true>>,
): CommandResult {
  // `release-publish` es el único que no opera sobre un ticket: recibe una lista
  // con `--tickets`, y exigirle `--id` lo haría inalcanzable.
  const ticketId = flag(flags, "id");
  if (ticketId === undefined && command !== "release-publish") {
    return {
      stdout: "",
      stderr: `${command} requiere --id.`,
      exitCode: EXIT_SCHEMA,
    };
  }

  /**
   * El identificador, ya comprobado.
   *
   * `release-publish` no lo lleva, así que el compilador no puede garantizar que
   * exista; los comandos que sí lo llevan lo piden por aquí.
   */
  const identificador = (): string => {
    if (ticketId === undefined) {
      throw Object.assign(new Error(`${command} requiere --id.`), {
        exitCode: EXIT_SCHEMA,
      });
    }
    return ticketId;
  };

  const obligatoria = (nombre: string): string => {
    const valor = flag(flags, nombre);
    if (valor === undefined) {
      throw Object.assign(new Error(`${command} requiere --${nombre}.`), {
        exitCode: EXIT_SCHEMA,
      });
    }
    return valor;
  };

  try {
    let salida: string;

    switch (command) {
      case "create":
        salida = createTicket({
          paths,
          id: identificador(),
          title: obligatoria("title"),
          type: obligatoria("type"),
          module: obligatoria("module"),
          request: obligatoria("request"),
        });
        break;

      case "release-publish":
        salida = releasePublish({
          paths,
          version: obligatoria("version"),
          tickets: obligatoria("tickets"),
        });
        break;

      case "add-point": {
        // Los archivos van separados por comas y son opcionales, pero no
        // decorativos: son los que entran en el hash de `worktree`.
        const archivos = flag(flags, "files");
        salida = addPoint({
          paths,
          ticketId: identificador(),
          title: obligatoria("title"),
          severity: obligatoria("severity"),
          actual: obligatoria("actual"),
          expected: obligatoria("expected"),
          affectedFiles:
            archivos === undefined
              ? []
              : archivos
                  .split(",")
                  .map((ruta) => ruta.trim())
                  .filter((ruta) => ruta !== ""),
        });
        break;
      }

      case "qa-start":
        salida = qaStart({
          paths,
          ticketId: identificador(),
          environment: flag(flags, "environment"),
          buildReference: flag(flags, "build-reference"),
        });
        break;

      case "qa-close":
        salida = qaClose({
          paths,
          ticketId: identificador(),
          result: obligatoria("result"),
          poConfirmation: flag(flags, "po-confirmation"),
        });
        break;

      case "add-evidence":
        salida = addEvidence({
          paths,
          ticketId: identificador(),
          kind: obligatoria("kind"),
          description: obligatoria("description"),
          reference: flag(flags, "reference"),
          pointId: flag(flags, "point-id"),
        });
        break;

      case "add-retest":
        salida = addRetest({
          paths,
          ticketId: identificador(),
          pointId: obligatoria("point-id"),
          result: obligatoria("result"),
          poConfirmation: flag(flags, "po-confirmation"),
        });
        break;

      case "close-attempt": {
        // El consumo se guarda **antes** del intento de cierre, no al mover el
        // ticket: el motor exige el bloque lleno para preparar el cierre, y
        // guardarlo después llegaría tarde. Es idempotente —lo ya registrado no
        // se repite—, así que el guardado de la transición sigue siendo la red
        // por si alguien cerró sin pasar por acá.
        const consumo = guardarConsumoDeSesiones(paths, identificador());
        salida = closeAttempt({
          paths,
          ticketId: identificador(),
          technicalSummary: obligatoria("technical-summary"),
          functionalSummary: obligatoria("functional-summary"),
          qaStatus: obligatoria("qa-status"),
          releaseImpact: obligatoria("release-impact"),
          qaWaiverReason: flag(flags, "qa-waiver-reason"),
          poConfirmation: flag(flags, "po-confirmation"),
        });
        if (consumo !== null) {
          salida = `${salida}\nConsumo guardado en el ticket: ${consumo}`;
        }
        break;
      }

      case "add-ai-usage":
        salida = addAiUsage({
          paths,
          ticketId: identificador(),
          source: obligatoria("source"),
          confidence: obligatoria("confidence"),
          sessionReference: flag(flags, "session-reference"),
          model: flag(flags, "model"),
          reasoningEffort: flag(flags, "reasoning-effort"),
          inputTokens: flag(flags, "input-tokens"),
          outputTokens: flag(flags, "output-tokens"),
          totalTokens: flag(flags, "total-tokens"),
          estimatedCostUsd: flag(flags, "estimated-cost-usd"),
          notes: flag(flags, "notes"),
        });
        break;

      default:
        return {
          stdout: "",
          stderr: `Comando de escritura desconocido: ${command}.`,
          exitCode: EXIT_SCHEMA,
        };
    }

    return { stdout: `${salida}\n`, stderr: "", exitCode: 0 };
  } catch (caught) {
    const failure = toFailure(caught);
    return { stdout: "", stderr: failure.message, exitCode: failure.exitCode };
  }
}

/** El valor de texto de una bandera, si la hay. */
function flag(
  flags: Readonly<Record<string, string | true>>,
  name: string,
): string | undefined {
  const valor = flags[name];
  return typeof valor === "string" ? valor : undefined;
}

/**
 * `transition`: traduce banderas a una petición del motor.
 *
 * La validación de las banderas obligatorias vive aquí y no en el motor porque
 * es de la superficie: el motor recibe una petición bien formada. Los mensajes
 * son los de la referencia, para que un script que hoy los compare siga
 * funcionando.
 */
export function runTransition(
  paths: RegistryPaths,
  flags: Readonly<Record<string, string | true>>,
): CommandResult {
  const ticketId = flag(flags, "id");
  const entity = flag(flags, "entity");
  const to = flag(flags, "to");

  if (ticketId === undefined) {
    return { stdout: "", stderr: "transition requiere --id.", exitCode: EXIT_SCHEMA };
  }
  if (entity !== "ticket" && entity !== "point" && entity !== "release") {
    return {
      stdout: "",
      stderr: `--entity debe ser ticket, point o release, no "${entity ?? ""}".`,
      exitCode: EXIT_SCHEMA,
    };
  }
  if (to === undefined) {
    return { stdout: "", stderr: "transition requiere --to.", exitCode: EXIT_SCHEMA };
  }

  try {
    const outcome = transition({
      paths,
      ticketId,
      entity: entity as Entity,
      to,
      pointId: flag(flags, "point-id"),
      reason: flag(flags, "reason"),
      version: flag(flags, "version"),
    });

    // Cerrar guarda el consumo de lo que costó el ticket. Se hace acá, en el
    // momento en que el trabajo termina, y no cuando alguien se acuerde de pulsar
    // un botón: la contabilidad del cliente puede no existir dentro de un mes.
    const consumo =
      entity === "ticket" && to === "closed"
        ? guardarConsumoDeSesiones(paths, ticketId)
        : null;

    return {
      stdout:
        `${outcome.details}\n` +
        (consumo === null ? "" : `Consumo guardado en el ticket: ${consumo}\n`),
      stderr: "",
      exitCode: 0,
    };
  } catch (caught) {
    const failure = toFailure(caught);
    return { stdout: "", stderr: failure.message, exitCode: failure.exitCode };
  }
}

/**
 * Resuelve el registro sobre el que va a trabajar el comando.
 *
 * El orden es: `--tickets-dir` explícito gana; si no, `--legacy-layout` fuerza el
 * layout anterior; si no, se **detecta** dónde hay tickets.
 *
 * La detección es la parte que importa y la que faltaba. Mission Control y el
 * servidor MCP la usaban desde el principio —`choosePaths`—, pero el CLI se
 * quedó en `defaultPaths`, así que sobre un proyecto adoptado con el registro en
 * `docs/tickets` **todos** los comandos fallaban con «No se encontró el
 * directorio de tickets: tickets» hasta que alguien recordara la bandera. En un
 * proyecto real eso es fricción en cada comando, y peor: la app y el CLI
 * discreparem sobre dónde está el registro.
 */
export function resolvePaths(options: Options): RegistryPaths {
  if (options.ticketsDir !== undefined) {
    return { root: options.root, ticketsDir: options.ticketsDir };
  }
  return options.legacyLayout ? legacyPaths(options.root) : choosePaths(options.root);
}

/**
 * Despacha un comando ya analizado.
 *
 * Se exporta para poder probar cada comando sin pasar por el proceso.
 */
export function dispatch(options: Options): CommandResult {
  const [command, ...rest] = options.positionals;

  // `gate` y `run` pueden hablar con proveedores externos, así que son
  // asíncronos. Se detectan aquí para dar un error claro en vez de devolver un
  // resultado vacío si alguien lo invoca por esta vía síncrona.
  if (command === "gate" || command === "run") {
    return {
      stdout: "",
      stderr: `El comando ${command} es asíncrono; use la línea de comandos.`,
      exitCode: EXIT_SCHEMA,
    };
  }

  if (command === "transition") {
    return {
      stdout: "",
      stderr:
        "El comando transition escribe en el registro; use `runTransition` o la línea de comandos.",
      exitCode: EXIT_SCHEMA,
    };
  }
  if (options.version) return { stdout: "0.0.1\n", stderr: "", exitCode: 0 };
  if (options.help || command === undefined) {
    return {
      stdout: USAGE,
      stderr: "",
      exitCode: command === undefined && !options.help ? EXIT_SCHEMA : 0,
    };
  }

  const paths = resolvePaths(options);

  switch (command) {
    case "validate": {
      const all = options.flags["all"] === true;
      const rawId = options.flags["id"];
      const id = typeof rawId === "string" ? rawId : undefined;

      if (all && id !== undefined) {
        return {
          stdout: "",
          stderr: "validate admite --id o --all, no ambos.",
          exitCode: EXIT_SCHEMA,
        };
      }
      if (all) return validateAll(paths);
      if (id !== undefined) return validateOne(paths, id);
      return {
        stdout: "",
        stderr: "validate requiere --id o --all.",
        exitCode: EXIT_SCHEMA,
      };
    }

    case "active":
    case "list":
      // `active` es el nombre que usan las skills del proyecto; `list` es el que
      // el harness publicó primero. La salida es la misma, así que mantener los
      // dos no cuesta nada y evita romper a quien ya lo usaba.
      return listActive(paths);

    case "resume": {
      const rawId = options.flags["id"];
      const id = typeof rawId === "string" ? rawId : undefined;
      const rawCliente = options.flags["cliente"];
      return resumeTicket(paths, id, undefined, typeof rawCliente === "string" ? rawCliente : undefined);
    }

    case "ask": {
      // La pregunta es el resto de los posicionales, unida, para que no haga
      // falta entrecomillarla cuando alguien la escribe desde una shell que ya
      // la partió. Sin pregunta no hay consulta: se falla antes de armar nada.
      const pregunta = rest.join(" ").trim();
      if (pregunta === "") {
        return {
          stdout: "",
          stderr: "ask requiere una pregunta.",
          exitCode: EXIT_SCHEMA,
        };
      }
      const rawId = options.flags["id"];
      const id = typeof rawId === "string" ? rawId : undefined;
      return askCommand(paths, pregunta, id);
    }

    case "show": {
      const id = rest[0];
      if (id === undefined) {
        return {
          stdout: "",
          stderr: "show requiere un ID.",
          exitCode: EXIT_SCHEMA,
        };
      }
      return showTicket(paths, id);
    }

    case "index":
      return buildIndex(paths, options.flags["check"] === true);

    case "secrets":
      return scanPendingSecretsCommand(paths.root, options.flags);

    case "estandar": {
      const [verbo, id] = rest;
      return standardsCommand(paths, verbo ?? "", id, options.flags);
    }

    case "memory": {
      // La consulta de `memory search` es el resto de los posicionales, unida,
      // para que no haga falta entrecomillarla; `review` y `clasificar` son los
      // verbos de la cola de aprendizajes, que hasta ahora no tenía salida.
      const [verbo, ...resto] = rest;
      if (verbo === "review" || verbo === "clasificar") {
        return learningsCommand(paths, verbo, resto[0], options.flags);
      }
      return memoryCommand(paths, { ...options.flags, _: resto.join(" ") }, verbo ?? "");
    }

    case "budget":
      return budgetCommand(paths, options.flags);
    case "drift":
      return driftCommand(paths, options.flags);

    case "usage": {
      // `usage` sin verbo es el consumo del harness; `usage value` es el mismo
      // registro mirado ticket por ticket. Dos comandos separados obligarían a
      // recordar cuál de los dos tiene la respuesta, y son la misma pregunta.
      const [verbo] = rest;
      if (verbo === "value" || verbo === "valor") {
        return valueCommand(paths, options.flags);
      }
      if (verbo !== undefined && verbo !== "") {
        return {
          stdout: "",
          stderr: `usage no conoce el verbo "${verbo}". Los que hay: value.\n`,
          exitCode: EXIT_SCHEMA,
        };
      }
      return usageCommand(paths, options.flags);
    }

    case "template": {
      const [verbo, nombre] = rest;
      return templateCommand(paths.root, verbo ?? "", nombre, {
        dryRun: options.flags["dry-run"] === true,
      });
    }

    case "report":
      return reportClosed(paths, options.flags);

    case "deliver-manifest":
      return deliverManifest(paths, options.flags);

    case "execution":
      return executionCommand(rest, options.flags);

    case "process":
      // `process <sub> [args]`: su propio módulo, como `feature`.
      return runProcess(options.root, rest, options.flags);

    case "manuales":
      // `manuales <sub> [args]`: su propio módulo, como `process`.
      return runManuales(options.root, rest, options.flags);

    case "corpus":
      return runCorpus(options.root, rest, options.flags);

    case "migrate":
      return migrateRegistry(paths, {
        dryRun: options.flags["dry-run"] === true,
      });

    case "adopt":
      return adoptProject(options.root, basename(options.root), {
        dryRun: options.flags["dry-run"] === true,
        machineId:
          typeof options.flags["machine-id"] === "string"
            ? options.flags["machine-id"]
            : undefined,
        codegraph: options.flags["codegraph"] === true,
      });

    case "sync":
      return syncProject(
        options.root,
        basename(options.root),
        options.flags["check"] === true,
      );

    case "feature":
      // `feature <sub> [args]` es asíncrono —`decompose` habla con un
      // proveedor—, así que se despacha en `run` y no aquí. Los subcomandos de
      // solo lectura siguen entrando por esta vía.
      return {
        stdout: "",
        stderr: "El comando feature es asíncrono; use la línea de comandos.",
        exitCode: EXIT_SCHEMA,
      };

    default:
      return {
        stdout: "",
        stderr: `Comando desconocido: ${command}. Use --help para ver los disponibles.`,
        exitCode: EXIT_SCHEMA,
      };
  }
}

/**
 * Corre una compuerta con el routing del proyecto.
 *
 * Es el cuerpo de `valmen gate`, extraído para que quien orquesta compuertas —el
 * modo de delegación— use **el mismo camino** que el comando: si usaran modelos o
 * presupuestos distintos, el recibo de una corrida no describiría la otra.
 */
export async function runGateFromFlags(
  rutas: RegistryPaths,
  gateId: string,
  ticketId: string,
  flags: Readonly<Record<string, string | true>>,
): Promise<CommandResult> {
  const rawEvaluator = flags["evaluator"];
  const evaluator = isEvaluatorId(rawEvaluator) ? rawEvaluator : undefined;
  if (typeof rawEvaluator === "string" && evaluator === undefined) {
    return {
      stdout: "",
      stderr: `Evaluador desconocido: "${rawEvaluator}". Use ${EVALUATOR_IDS.join(", ")}.`,
      exitCode: EXIT_SCHEMA,
    };
  }
  // El modelo lo decide el routing del proyecto, igual que en la app: si
  // el botón y el comando usaran modelos distintos, el recibo de una
  // aprobación no describiría la otra.
  // El presupuesto del ticket decide con qué preset se evalúa esta compuerta
  // (R-S1-003): uno que ya lleva el doble de lo típico de su tipo se evalúa
  // con el preset barato en vez de seguir gastando en los caros, y el recibo
  // lleva la nota que lo explica para que el modelo distinto no quede mudo.
  const presupuesto = budgetRouting(rutas, ticketId);
  const preset = presupuesto.preset === null ? {} : { preset: presupuesto.preset };
  const routing = gateRoutingFor(rutas.root, preset);
  // La cascada necesita los tres roles, y su cadena se resuelve acá —donde
  // se lee el routing— para que el motor reciba los modelos ya decididos y
  // el recibo registre los que de verdad se usaron. Degradar el gate y no la
  // cascada dejaría media evaluación con los modelos caros.
  const cascade =
    evaluator === "cascade" ? cascadeRoutingFor(rutas.root, preset) : undefined;

  // La credencial se resuelve aquí, en el borde, con el archivo que el
  // usuario indique. Sin `--credentials` es el del `$HOME`, que es lo normal
  // para un CLI; con él, un proyecto puede tener el suyo y el comando y la
  // app dejan de poder discrepar.
  const archivoCredenciales =
    typeof flags["credentials"] === "string"
      ? flags["credentials"]
      : undefined;
  const credentialResolver =
    cascade === undefined ? undefined : credentialForCascade(archivoCredenciales);
  const apiKey =
    cascade === undefined
      ? (apiKeyWithPrecedence(
          routing.evaluatorProvider === "" ? "openrouter" : routing.evaluatorProvider,
          archivoCredenciales,
        ) ?? undefined)
      : undefined;

  return runGate(rutas, {
    gateId,
    ticketId,
    dryRun: flags["dry-run"] === true,
    ...(apiKey === undefined ? {} : { apiKey }),
    ...(credentialResolver === undefined
      ? {}
      : { credentialForProvider: credentialResolver }),
    ...(evaluator === undefined ? {} : { evaluator }),
    ...(routing.evaluatorModel === "" ? {} : { model: routing.evaluatorModel }),
    ...(routing.evaluatorProvider === ""
      ? {}
      : { provider: routing.evaluatorProvider }),
    ...(routing.probabilistic ? {} : { semantic: "llm-judge" as const }),
    ...(routing.evaluatorEffort === "auto"
      ? {}
      : { effort: routing.evaluatorEffort }),
    ...(routing.judgeModel === "" ? {} : { judgeModel: routing.judgeModel }),
    ...(cascade === undefined ? {} : { cascade }),
    ...(presupuesto.note === null ? {} : { notes: [presupuesto.note] }),
    ...(typeof flags["force-reason"] === "string" ? { forceReason: flags["force-reason"] } : {}),
  });
}

/**
 * Ejecuta el CLI y devuelve el código de salida.
 *
 * Es asíncrono porque `gate` consulta a un proveedor externo. Los demás
 * comandos son síncronos por ser puramente locales, así que se despachan sin
 * `await` y el coste es nulo.
 */
export async function run(argv: readonly string[]): Promise<number> {
  let options: Options;
  try {
    options = parseArgs(argv, valorDeParametrosDeProceso(argv));
  } catch (caught) {
    if (caught instanceof UsageError) {
      process.stderr.write(`Error: ${caught.message}\n`);
      return EXIT_SCHEMA;
    }
    throw caught;
  }

  // El resultado se declara **fuera** del `try` a propósito: el centinela
  // `__handled__` de un comando corta el cuerpo por excepción, y sin esto el
  // mensaje que ese comando escribió con cuidado se quedaba sin imprimir —el
  // usuario veía `Error: __handled__`, que no dice nada—.
  let result: CommandResult | undefined;
  try {
    const [command, ...rest] = options.positionals;

    if (command === "serve") {
      const rawPort = options.flags["port"];
      const puerto = typeof rawPort === "string" ? Number.parseInt(rawPort, 10) : 4173;
      // La interfaz se publica junto al código compilado, en `dist/web`. Se
      // resuelve desde la ubicación de este archivo y no desde el directorio de
      // trabajo: el servidor debe arrancar igual desde cualquier carpeta.
      const raizWeb = join(dirname(fileURLToPath(import.meta.url)), "web");
      let statics: ServerContext["statics"];
      try {
        statics = loadStatics(raizWeb, ["index.html"]);
      } catch {
        // El error crudo de `loadStatics` habla de rutas; este dice qué hacer. Se
        // descarta a propósito, y por eso el `catch` no liga la excepción.
        result = {
          stdout: "",
          stderr:
            `No se encontró la interfaz en ${raizWeb}. ` +
            "Ejecute `npm run build` para generarla.",
          exitCode: EXIT_SCHEMA,
        };
        process.stderr.write(`${result.stderr}\n`);
        return result.exitCode;
      }

      const puertoFinal = Number.isNaN(puerto) ? 4173 : puerto;

      // Solo en la interfaz de loopback por defecto: la frontera de confianza es
      // la máquina, igual que en cualquier herramienta que maneja credenciales.
      // Abrirlo a la red es una decisión explícita —mirarlo desde una tablet, por
      // ejemplo— y por eso se pide con `--host` y se avisa de lo que implica.
      const anfitrion =
        typeof options.flags["host"] === "string" ? options.flags["host"] : "127.0.0.1";

      // Fuera de la máquina local las escrituras exigen un token (R-CTRL-003): el de
      // `VALMEN_TOKEN` si existe, o uno aleatorio que se imprime una vez. No se guarda en disco.
      // valmen:allow-secret — el token se genera aquí o viene de VALMEN_TOKEN; no hay valor escrito.
      const token = esAnfitrionLocal(anfitrion)
        ? undefined
        : (process.env["VALMEN_TOKEN"] ?? "").trim() !== ""
          ? (process.env["VALMEN_TOKEN"] as string).trim()
          : randomBytes(32).toString("base64url");
      const tokenDeEntorno = (process.env["VALMEN_TOKEN"] ?? "").trim() !== "";
      const contexto: ServerContext = {
        ...defaultContext(options.root),
        statics,
        ...(token === undefined ? {} : { writeToken: token }),
      };
      const servidor = createMissionControl(contexto);

      await new Promise<void>((resolve, reject) => {
        servidor.once("error", reject);
        servidor.listen(puertoFinal, anfitrion, resolve);
      });

      const abierto = anfitrion !== "127.0.0.1" && anfitrion !== "localhost";
      process.stdout.write(
        [
          "Mission Control",
          `  http://${anfitrion === "0.0.0.0" ? primerIpLocal() : anfitrion}:${puertoFinal}`,
          ...(abierto ? [`  http://127.0.0.1:${puertoFinal}   (esta máquina)`] : []),
          `  raíz del proyecto   ${options.root}`,
          "",
          ...(abierto
            ? [
                "  Escucha en la red: cualquiera que llegue puede LEER el registro. Las",
                "  escrituras (mover tickets, decidir compuertas, aprobar procesos, editar la",
                "  configuración) exigen el token de abajo. El tráfico no va cifrado: el token",
                "  viaja en claro, así que úsalo solo en una red de confianza.",
                `  token de escritura   ${token ?? ""}${tokenDeEntorno ? "   (el de VALMEN_TOKEN)" : "   (generado; no se guarda)"}`,
                "  Detenlo con Ctrl-C cuando termines.",
              ]
            : ["  Escucha solo en 127.0.0.1. Detenlo con Ctrl-C."]),
          "",
        ].join("\n"),
      );

      await new Promise<void>((resolve) => {
        process.once("SIGINT", resolve);
        process.once("SIGTERM", resolve);
      });
      servidor.close();
      return 0;
    }

    if (command === "mcp") {
      // El ejecutable del servidor se deduce del que está corriendo: en una
      // instalación global y en el repositorio de desarrollo las rutas no tienen
      // nada que ver, y escribir una a mano deja la otra rota.
      result = mcpCommand({
        root: options.root,
        // La ruta de **invocación**, no la del módulo: con un binario
        // enlazado en el `PATH`, la del módulo es la del repositorio y
        // escribirla en la configuración la ataría a esta máquina.
        cliEntry: process.argv[1] ?? fileURLToPath(import.meta.url),
        install: options.flags["install"] === true,
        global: options.flags["global"] === true,
        json: options.flags["json"] === true,
        ask: options.flags["ask"] === true,
        codegraph: probeCodegraph(options.root),
      });
    } else if (command === "hermes") {
      // Hermes es el único destino que no vive en el proyecto: su configuración
      // es global y por eso necesita la raíz explícita. La acción sale del
      // subcomando, y sin él se diagnostica —que es lo que se quiere saber
      // primero— en vez de escribir.
      const accion = rest[0] ?? "status";
      if (
        accion !== "status" &&
        accion !== "connect" &&
        accion !== "test" &&
        accion !== "notify" &&
        accion !== "brief" &&
        accion !== "relay"
      ) {
        result = {
          stdout: "",
          stderr: `Acción desconocida: "${accion}". Use status, connect, test, notify, brief o relay.`,
          exitCode: EXIT_SCHEMA,
        };
      } else if (accion === "relay") {
        // El relé: contestar en el chat y que la decisión se ejecute sola.
        result = hermesRelay({
          root: options.root,
          cliEntry: process.argv[1] ?? fileURLToPath(import.meta.url),
          install: options.flags["install"] === true,
        });
      } else if (accion === "brief") {
        // El parte se arma de la misma configuración que los avisos, y sin
        // destino se imprime: es lo que se quiere hacer la primera vez, antes de
        // que le llegue a nadie.
        const paths = resolvePaths(options);
        const dias = flag(options.flags, "dias");
        const destino = flag(options.flags, "to");
        result = hermesBrief({
          paths,
          config: configDeHermes(paths),
          now: new Date(),
          ...(destino === undefined ? {} : { to: destino }),
          json: options.flags["json"] === true,
          ...(dias === undefined ? {} : { dias: Number(dias) }),
        });
      } else if (accion === "notify") {
        // Notificar un gate y emitir su token. Se separa del resto porque no es
        // sobre la conexión: es sobre un gate concreto, y necesita el secreto con
        // el que se firma.
        const paths = resolvePaths(options);
        const secreto = approvalSecret(
          typeof options.flags["credentials"] === "string"
            ? (options.flags["credentials"] as string)
            : undefined,
        );
        const id = flag(options.flags, "id");
        const recibo = flag(options.flags, "receipt");
        const destino = flag(options.flags, "to");

        if (secreto === null) {
          result = {
            stdout: "",
            stderr:
              "Falta el secreto con el que se firman los tokens de aprobación.\n\n" +
              `${COMO_CREAR_EL_SECRETO}\n`,
            exitCode: EXIT_SCHEMA,
          };
        } else if (id === undefined && recibo === undefined) {
          // Sin ticket ni recibo: todos los que esperan una decisión. Es el modo
          // que se puede correr seguido —a mano, por cron o desde un gancho de
          // Hermes— porque lo ya avisado no se vuelve a avisar.
          result = hermesNotifyPendientes({
            paths,
            config: configDeHermes(paths),
            secret: secreto,
            now: new Date(),
            ...(destino === undefined ? {} : { to: destino }),
            json: options.flags["json"] === true,
          });
        } else if (id === undefined || recibo === undefined || destino === undefined) {
          result = {
            stdout: "",
            stderr:
              "Para avisar de un gate concreto hacen falta --id <TICKET>, " +
              "--receipt <GR-…> y --to <destino>.\n" +
              "Sin --id ni --receipt se avisa de todos los que esperan una decisión, " +
              "y el destino sale de `.valmen/config.yaml`.\n",
            exitCode: EXIT_SCHEMA,
          };
        } else {
          result = hermesNotify({
            paths,
            ticketId: id,
            receiptId: recibo,
            to: destino,
            secret: secreto,
            now: new Date(),
          });
        }
      } else {
        const nombre = options.flags["name"];
        const perfil = options.flags["profile"];
        const destino = options.flags["to"];
        result = runHermes({
          root: options.root,
          cliEntry: process.argv[1] ?? fileURLToPath(import.meta.url),
          action: accion,
          // `--name` siempre gana; sin él, `entryName` resuelve `valmen`, o
          // `valmen-<perfil>` cuando hay `--profile`.
          ...(typeof nombre === "string" && nombre.trim() !== ""
            ? { name: nombre.trim() }
            : {}),
          ...(typeof perfil === "string" && perfil.trim() !== ""
            ? { profile: perfil.trim() }
            : {}),
          dryRun: options.flags["dry-run"] === true,
          untrusted: options.flags["untrusted"] === true,
          json: options.flags["json"] === true,
          force: options.flags["force"] === true,
          ...(typeof destino === "string" && destino.trim() !== ""
            ? { to: destino.trim() }
            : {}),
        });
      }
    } else if (command === "simulate") {
      const gateId = rest[0];
      if (gateId === undefined) {
        result = {
          stdout: "",
          stderr: "simulate requiere un identificador de gate.",
          exitCode: EXIT_SCHEMA,
        };
      } else {
        let definition;
        try {
          definition = gateById(gateId);
        } catch (caught) {
          const failure = toFailure(caught);
          result = {
            stdout: "",
            stderr: failure.message,
            exitCode: EXIT_SCHEMA,
          };
          definition = null;
        }
        if (definition !== null && definition !== undefined) {
          const rawLimit = options.flags["limit"];
          const limit =
            typeof rawLimit === "string" ? Number.parseInt(rawLimit, 10) : undefined;
          const report = await simulateGate(resolvePaths(options), {
            gate: definition,
            ...(limit === undefined || Number.isNaN(limit) ? {} : { limit }),
            onProgress: (done, total) => {
              if (done % 5 === 0) process.stderr.write(`  ${done}/${total}\r`);
            },
          });
          process.stderr.write("            \r");

          // `--calibrate` compara lo que decidió el gate con lo que decidieron
          // las personas. Se pide a sabiendas porque evalúa todo el registro.
          if (options.flags["calibrate"] === true) {
            result = calibrateReport(resolvePaths(options), gateId, report);
          } else {
            result = {
              stdout:
                options.flags["json"] === true
                  ? JSON.stringify(report, null, 2) + "\n"
                  : renderSimulation(report, definition.policy),
              stderr: "",
              exitCode: 0,
            };
          }
        } else if (result === undefined) {
          result = { stdout: "", stderr: "", exitCode: 0 };
        }
      }
    } else if (command === "promote-gate") {
      const gateId = rest[0];
      if (gateId === undefined) {
        result = {
          stdout: "",
          stderr: "promote-gate requiere un identificador de gate.",
          exitCode: EXIT_SCHEMA,
        };
      } else {
        let definition;
        try {
          definition = gateById(gateId);
        } catch (caught) {
          const failure = toFailure(caught);
          result = { stdout: "", stderr: failure.message, exitCode: EXIT_SCHEMA };
          definition = null;
        }
        if (
          definition !== null &&
          definition !== undefined &&
          definition.mode !== "hybrid"
        ) {
          result = {
            stdout: "",
            stderr: `El gate ${gateId} ya es ${definition.mode}; solo se pueden promover gates híbridos.`,
            exitCode: EXIT_SCHEMA,
          };
          definition = null;
        }
        if (definition !== null && definition !== undefined) {
          const rawLimit = options.flags["limit"];
          if (
            typeof rawLimit === "string" &&
            (!/^[1-9][0-9]*$/.test(rawLimit) || !Number.isSafeInteger(Number(rawLimit)))
          ) {
            result = {
              stdout: "",
              stderr: "--limit debe ser un entero positivo.",
              exitCode: EXIT_SCHEMA,
            };
            definition = null;
          }
          const limit = typeof rawLimit === "string" ? Number(rawLimit) : undefined;
          if (definition === null) {
            // La validación de forma evita que un límite ambiguo altere qué
            // decisiones humanas entran en la calibración.
          } else {
            const paths = resolvePaths(options);
            const report = await simulateGate(paths, {
              gate: definition,
              ...(limit === undefined || Number.isNaN(limit) ? {} : { limit }),
              onProgress: (done, total) => {
                if (done % 5 === 0) process.stderr.write(`  ${done}/${total}\r`);
              },
            });
            process.stderr.write("            \r");
            result = recordGatePromotion(paths, gateId, report);
          }
        }
      }
    } else if (command === "execution") {
      result = executionCommand(rest, options.flags);
    } else if (command === "provider") {
      result = await providerCommand(
        resolvePaths(options),
        options.flags,
        rest[0],
        rest[1],
      );
    } else if (command === "routing") {
      result = routingCommand(resolvePaths(options), options.flags, rest[0], rest[1]);
    } else if (command === "doctor") {
      result = await doctorCommand(resolvePaths(options));
    } else if (command === "onboarding") {
      if (rest[0] !== "verify" || rest.length !== 1) {
        result = {
          stdout: "",
          stderr: "onboarding requiere el verbo verify.",
          exitCode: EXIT_SCHEMA,
        };
      } else {
        result = await verifyOnboarding(options.root);
      }
    } else if (command === "feature") {
      result = await runFeature(options.root, rest, options.flags);
    } else if (command === "delegation") {
      const rutas = resolvePaths(options);
      result = await runDelegation(rutas, rest, options.flags, {
        // La cascada solo se pide en análisis y plan: qa-mechanical lo decide el
        // código y no tiene proposiciones que un modelo responda.
        runGate: (gateId, ticketId) => {
          const sinEvaluador: Record<string, string | true> = { ...options.flags };
          delete sinEvaluador["evaluator"];
          return runGateFromFlags(
            rutas,
            gateId,
            ticketId,
            gateId === "analysis" || gateId === "plan" ? options.flags : sinEvaluador,
          );
        },
        decide: recordHumanDecision,
        ...REAL_GIT,
      });
    } else if (command === "precision") {
      result = precisionCommand(resolvePaths(options), options.flags);
    } else if (command === "thresholds") {
      result = thresholdsCommand(resolvePaths(options), rest[0], options.flags);
    } else if (command === "journey") {
      result =
        rest[0] === "plan"
          ? journeyPlanCommand(options.flags)
          : rest[0] === "advance"
            ? await journeyAdvanceCommand(options.flags)
            : rest[0] === "next"
              ? journeyNextCommand(options.flags, { root: resolvePaths(options).root })
              : rest[0] === "brief"
                ? journeyBriefCommand(options.flags, { root: resolvePaths(options).root })
            : rest[0] === "handoff"
                ? journeyHandoffCommand(options.flags, { root: resolvePaths(options).root })
            : rest[0] === "install-trigger"
              ? journeyInstallTriggerCommand(options.flags)
              : rest[0] === "notify-plans"
                ? journeyNotifyPlansCommand(options.flags)
                : rest[0] === "clear-stop"
                ? journeyClearStopCommand(options.flags)
                : rest[0] === "worktree"
                ? journeyWorktreeCommand(resolvePaths(options), rest.slice(1), options.flags)
                : { stdout: "", stderr: "journey admite: plan, advance, next, brief, handoff, install-trigger, notify-plans, clear-stop y worktree.\n", exitCode: EXIT_SCHEMA };
    } else if (command === "review-agent") {
      result = await reviewAgentCommand(resolvePaths(options), options.flags);
    } else if (command === "qa-shadow") {
      result = qaShadowCommand(resolvePaths(options));
    } else if (command === "qa-promote") {
      result = qaPromoteCommand(resolvePaths(options), options.flags);
    } else if (command === "qa-policy-close") {
      result = qaPolicyCloseCommand(resolvePaths(options), options.flags);
    } else if (command === "qa-agent") {
      result = qaAgentCommand(resolvePaths(options), options.flags);
    } else if (command === "approval-eligibility") {
      result = approvalEligibilityCommand(resolvePaths(options), options.flags);
    } else if (command === "qa-eligibility") {
      result = qaEligibilityCommand(resolvePaths(options), options.flags);
    } else if (command === "ux") {
      result =
        rest[0] === "review"
          ? uxReviewCommand(resolvePaths(options), options.flags)
          : { stdout: "", stderr: "ux admite: review.\n", exitCode: EXIT_SCHEMA };
    } else if (command === "skills") {
      result =
        rest[0] === "external"
          ? skillsExternalCommand(resolvePaths(options).root)
          : rest[0] === "review"
            ? skillsReviewCommand(resolvePaths(options).root, rest[1], options.flags)
            : { stdout: "", stderr: "skills admite: external o review.\n", exitCode: EXIT_SCHEMA };
    } else if (command === "approval-authorize") {
      result = approvalAuthorizeCommand(resolvePaths(options).root, rest[0], options.flags);
    } else if (command === "qa-authorize") {
      result = qaAuthorizeCommand(resolvePaths(options).root, rest[0], options.flags);
    } else if (command === "plan-approve") {
      result = planApproveCommand(resolvePaths(options), options.flags);
    } else if (command === "approve-plan") {
      result = approvePlanCommand(resolvePaths(options), options.flags);
    } else if (command === "precheck") {
      const id = options.flags["id"];
      result = precheckCommand(
        resolvePaths(options),
        rest[0],
        typeof id === "string" ? id : undefined,
      );
    } else if (command === "gate-decide") {
      result = runGateDecide(resolvePaths(options), options.flags);
    } else if (command === "transition") {
      result = runTransition(resolvePaths(options), options.flags);
    } else if (command !== undefined && ESCRITURA.has(command)) {
      result = runAppend(command, resolvePaths(options), options.flags);
    } else if (command === "run") {
      result = await runAutonomousCommand(resolvePaths(options), options.flags);
    } else if (command === "gate") {
      const gateId = rest[0];
      const rawId = options.flags["id"];
      const ticketId = typeof rawId === "string" ? rawId : undefined;

      if (gateId === undefined) {
        result = {
          stdout: "",
          stderr: "gate requiere un identificador de gate.",
          exitCode: EXIT_SCHEMA,
        };
      } else if (ticketId === undefined) {
        result = {
          stdout: "",
          stderr: "gate requiere --id <TICKET-ID>.",
          exitCode: EXIT_SCHEMA,
        };
      } else {
        result = await runGateFromFlags(resolvePaths(options), gateId, ticketId, options.flags);
      }
    } else if (command === "cascada") {
      // La tarea se valida **antes** de resolver rutas, cadena y credenciales: un
      // identificador mal escrito tiene que decirlo sin tocar el registro ni gastar
      // una llamada, y la lista que se nombra es la del motor, no una copia de acá.
      const rawTarea = options.flags["tarea"];
      if (!isCascadeTaskId(rawTarea)) {
        result = {
          stdout: "",
          stderr:
            `Tarea desconocida: "${typeof rawTarea === "string" ? rawTarea : ""}". ` +
            `Use ${CASCADE_TASK_IDS.join(", ")}.`,
          exitCode: EXIT_SCHEMA,
        };
      } else {
        const rutas = resolvePaths(options);
        // La cadena sale del routing del proyecto, igual que en la compuerta: si el
        // comando y la app usaran modelos distintos, el recibo de una corrida no
        // describiría la otra.
        const chain = cascadeRoutingFor(rutas.root);
        const archivoCredenciales =
          typeof options.flags["credentials"] === "string"
            ? options.flags["credentials"]
            : undefined;
        const solicitud =
          typeof options.flags["solicitud"] === "string"
            ? options.flags["solicitud"]
            : undefined;
        const pregunta =
          typeof options.flags["pregunta"] === "string"
            ? options.flags["pregunta"]
            : undefined;

        try {
          const corrida = await runCascadeTask({
            paths: rutas,
            task: rawTarea,
            entrada: {
              ...(solicitud === undefined ? {} : { solicitud }),
              ...(pregunta === undefined ? {} : { pregunta }),
            },
            chain,
            credentialForProvider: credentialForCascade(archivoCredenciales),
          });
          result = { stdout: renderCascadeTask(corrida), stderr: "", exitCode: 0 };
        } catch (caught) {
          const failure = toFailure(caught);
          result = { stdout: "", stderr: failure.message, exitCode: failure.exitCode };
        }
      }
    } else {
      result = dispatch(options);
    }

    const final = result ?? { stdout: "", stderr: "", exitCode: EXIT_SCHEMA };
    if (final.stdout !== "") process.stdout.write(final.stdout);
    // El prefijo `Error: ` se añade **aquí**, en el borde del proceso, y no en
    // cada comando. Es donde lo añade la implementación de referencia
    // (`main`, L2162), y tenerlo en un solo sitio evita la incoherencia que
    // había: una excepción salía con prefijo y un fallo devuelto, sin él.
    if (final.stderr !== "") process.stderr.write(`Error: ${final.stderr}\n`);
    return final.exitCode;
  } catch (caught) {
    // `__handled__` no es un fallo: el comando ya dejó su resultado escrito y lo
    // único que falta es imprimirlo. Un rechazo de validación con su mensaje
    // —«Evaluador desconocido: …»— llegaba al usuario como `Error: __handled__`.
    if (
      caught instanceof Error &&
      caught.message === "__handled__" &&
      result !== undefined
    ) {
      if (result.stdout !== "") process.stdout.write(result.stdout);
      if (result.stderr !== "") process.stderr.write(`Error: ${result.stderr}\n`);
      return result.exitCode;
    }
    const failure = toFailure(caught);
    process.stderr.write(`Error: ${failure.message}\n`);
    return failure.exitCode;
  }
}

/**
 * `true` si este módulo se está ejecutando como programa principal.
 *
 * Importar `main.ts` para probar `parseArgs` no debe ejecutar el CLI. Sin esta
 * guarda, un test que solo quiere analizar argumentos lanza el comando entero,
 * imprime la ayuda y fija un código de salida: el módulo se vuelve intestable.
 *
 * La comparación se hace sobre rutas **reales**, no sobre el texto. Un binario
 * instalado en el `PATH` se alcanza por un enlace simbólico: `import.meta.url`
 * trae la ruta resuelta y `process.argv[1]` la del enlace, así que compararlas
 * en crudo da `false` y el proceso termina con éxito **sin hacer nada**. Es un
 * fallo silencioso y por eso conviene que la comparación sea la correcta.
 */
function isMainModule(): boolean {
  const entry = process.argv[1];
  if (entry === undefined) return false;
  try {
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(entry);
  } catch {
    return false;
  }
}

if (isMainModule()) {
  // El código de salida se fija cuando la promesa se resuelve. Asignarlo de
  // forma síncrona con una promesa pendiente haría que el proceso terminara con
  // 0 sin haber evaluado nada.
  void run(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code;
    },
    (error: unknown) => {
      process.stderr.write(`Error inesperado: ${String(error)}\n`);
      process.exitCode = 1;
    },
  );
}
