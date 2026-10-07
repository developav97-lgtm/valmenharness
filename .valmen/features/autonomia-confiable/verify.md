# Verificación — Autonomía confiable: compuertas precisas, control en código y jornadas con QA por agente

Feature: `autonomia-confiable` · generado el 2026-10-07 desde el registro de tickets.

Tickets del grafo: 47 · cerrados: 47 · pendientes: 0.

## Tickets

### BUGFIX-GATE-LECTOR-CRITERIOS-20261005 — Leer solo ítems de lista como criterios y evaluarlos todos sin recorte

- Estado: closed · QA: approved
- Cierre técnico: `extractCriteriaSpecs` (packages/gate/src/dynamic.ts) retira los comentarios HTML antes de leer, abre un criterio solo con viñeta, une a su criterio la línea pegada a una viñeta, interpreta `test:` y `verify:` aunque ocupen varias líneas y ya no recorta a 12. `evaluateGate` (packages/engine/src/evaluators.ts) reparte los criterios en tandas de a lo sumo `MAX_CRITERIA_PROPOSITIONS`, con las proposiciones fijas en la primera, y suma respuestas, escalamientos, consumo y latencia; el recibo anota cuántas tandas (gate.ts). `qa-mechanical` corre todos los comandos declarados. 10 pruebas de regresión con vectores de seis recibos reales, que fallan sin el cambio; contrato documentado en docs/03-GATES.md. Commit dda9d81.
- Cierre funcional: Las compuertas dejan de evaluar como criterio el comentario de la plantilla, que bloqueaba o frenaba planes correctos con un 0.01 que no era del plan, y dejan de ignorar en silencio los criterios que pasan de 12: se evalúan todos y el recibo dice en cuántas tandas. Quien lee un recibo ve solo los criterios que el ticket declaró.
- Evidencia:
  - automated-test: Ejecutadas por el agente a pedido del PO, desde /Users/juanandrade/Desktop/ValmenHarness, el 2026-10-05. (1) `npx vitest run tests/gate-lector-criterios.test.ts tests/evaluators.test.ts tests/gate-mecanico.test.ts`: 3 archivos y 63 pruebas pasan. (2) `npx vitest run`: 136 archivos pasan y 1 se omite; 2143 pruebas pasan y 48 se omiten; 0 fallos. (3) `npm run typecheck`: exit 0, sin errores. (4) Sin el cambio (los 3 archivos de código devueltos a HEAD, con copia de respaldo y hashes sha256 verificados antes y después): el mismo comando (1) da 10 pruebas fallidas y 53 que pasan, lo que confirma que las pruebas detectan el defecto; restaurado el código, 63 pasan y los hashes son idénticos. Limitación: las corridas se hicieron con los cambios sin commitear de otra sesión presentes en el árbol.

### BUGFIX-GATE-CONTRADICCION-DESCRIPTIVA-20261005 — Ignorar proposiciones descriptivas en la excepción por contradicción

- Estado: closed · QA: approved
- Cierre técnico: isIsolatedBlockContradiction ignora las proposiciones requeridas descriptivas (verdict false); tres pruebas nuevas en tests/gate-decide.test.ts
- Cierre funcional: Un BLOCK del gate de análisis que el propio recibo contradice, por una proposición descriptiva con valor bajo, pasa a revisión humana en vez de bloquear; el caso de control sigue bloqueando
- Evidencia:
  - automated-test: npx vitest run: 2286 pruebas pasan y 0 fallan; la prueba del vector falla sin el cambio

### BUGFIX-ENGINE-FIRMA-DE-COMPUERTA-20261004 — Exigir una decisión humana registrada para avanzar block o review

- Estado: closed · QA: approved
- Cierre técnico: transition() ahora exige, al entrar a planned o approved, que el último recibo vigente de analysis o plan no esté en block ni review sin decisión humana (o con un rechazo humano); la regla se ata al destino para que blocked no la esquive y rechaza con el recibo y el comando gate-decide completo. withHumanDecision admite también un recibo block, con la frase literal obligatoria al aprobarlo y sin admitir el block de qa-mechanical, sin tocar outcome ni escalatedTo. Si el avance procede por una firma que el ticket no tiene como evento, finalizeMutation anexa el gate-approved (texto único de describirDecisionHumana, que cita el recibo) antes del evento de transición, en la misma escritura; el details de la transición no cambia. veredictoDeCompuerta pasó de next-step.ts a receipts.ts y next-step explica cómo autorizar un bloqueo. Sin cambios de esquema ni migración; la regla corre al mover, no al validar. Commit a0ea22d.
- Cierre funcional: Un ticket ya no avanza de fase cuando la compuerta de esa fase dijo que no o pidió revisión humana y nadie lo firmó: el sistema lo rechaza y dice exactamente cómo registrar la decisión. Una persona puede ahora autorizar seguir pese a un bloqueo dejando su frase literal, y el ticket guarda quién firmó, con qué frase y cuándo, de modo que un informe que lea solo el ticket distingue una aprobación humana de una del evaluador. Los tickets y recibos anteriores se siguen leyendo igual. No autentica a quien firma: eso queda para la aprobación del plan de la feature.

### FEATURE-GATE-MOTIVOS-RECIBO-20261005 — Guardar en el recibo el motivo de cada respuesta del evaluador

- Estado: closed · QA: approved
- Cierre técnico: PropositionAnswer.reason, evaluateWithJudge conserva y recorta el motivo, buildReceipt lo normaliza a null; 5 pruebas nuevas
- Cierre funcional: El recibo de una compuerta dice por qué el evaluador respondió cada proposición, o deja null si no lo dio
- Evidencia:
  - automated-test: npx vitest run: 2291 pruebas pasan y 0 fallan

### BUGFIX-GATECOMMAND-FALLOS-ENTORNO-20261005 — Distinguir fallas del entorno de pruebas fallidas y guardar la cola de la salida

- Estado: closed · QA: approved
- Cierre técnico: classifyEnvironmentFailure en gate-command, cola de la salida con sha256, criterios con falla del entorno responden 0.5 y el informe lo dice; 12 pruebas nuevas
- Cierre funcional: Un comando de pruebas que no llegó a ejecutar nada (base ya creada, conexión rechazada, comando inexistente, tiempo agotado, sin resumen del runner) deja la compuerta en revisión y no en bloqueo, y el recibo conserva el final de la salida
- Evidencia:
  - automated-test: npx vitest run: 2303 pruebas pasan y 0 fallan

### FEATURE-CONFIG-MIGRACION-PRUEBAS-20260926 — Declarar la preparación del ambiente de pruebas

- Estado: closed · QA: approved
- Cierre técnico: readTestSetupConfig, readAllowedSchemas y testSetupRefusal en el adaptador; testSetupConfig y allowedSchemas en el motor; 14 pruebas nuevas
- Cierre funcional: El proyecto puede declarar en config.yaml la preparación del ambiente de pruebas con su esquema, y solo se acepta si el esquema está en allowed-schemas
- Evidencia:
  - automated-test: npx vitest run: 2317 pruebas pasan y 0 fallan

### FEATURE-ENGINE-MIGRACION-ANTES-TESTS-20260926 — Preparar el ambiente antes de ejecutar los criterios

- Estado: closed · QA: approved
- Cierre técnico: runTestSetup corre test-setup antes de los criterios, respeta allowed-schemas, se detiene en el primer fallo y queda en el recibo (setup); 7 pruebas nuevas
- Cierre funcional: La compuerta mecánica deja el ambiente de pruebas listo antes de probar y, si no puede, termina en revisión por falla del entorno sin culpar al ticket
- Evidencia:
  - automated-test: npx vitest run: 2324 pruebas pasan y 0 fallan

### BUGFIX-ENGINE-REUTILIZAR-COMPUERTA-20261005 — Rechazar una compuerta repetida sobre el mismo estado del ticket

- Estado: closed · QA: approved
- Cierre técnico: Huella del evaluador y rechazo de la repetición idéntica antes de llamar al modelo; --force-reason y forzar guardan el motivo en el recibo; 7 pruebas nuevas y 4 adaptadas
- Cierre funcional: Pedir otra vez una compuerta sobre el mismo estado y con el mismo evaluador se rechaza sin gastar una llamada y remite al recibo; con un motivo explícito se puede forzar
- Evidencia:
  - automated-test: npx vitest run: 2331 pruebas pasan y 0 fallan

### FEATURE-GATE-APLICABILIDAD-POR-TIPO-20261005 — Declarar y filtrar en código las proposiciones por tipo de ticket

- Estado: closed · QA: approved
- Cierre técnico: appliesTo en las proposiciones, partitionByApplicability, filtro en la compuerta antes de evaluar y notApplicable en el recibo; 7 pruebas nuevas
- Cierre funcional: Una pregunta que no corresponde al tipo del ticket ya no se envía al modelo y el recibo la deja como no_aplica
- Evidencia:
  - automated-test: npx vitest run: 2338 pruebas pasan y 0 fallan

### IMPROVEMENT-GATE-DIAGNOSTICO-POR-TIPO-20261005 — Evaluar el diagnóstico por tipo y enviar la descripción funcional al evaluador

- Estado: closed · QA: approved
- Cierre técnico: diagnostico_ubica_el_cambio para tipos que no son corrección, appliesTo en el síntoma, alsoBlockingIds en la regla de contradicción y descripcion_funcional en el estado del evaluador; 7 pruebas nuevas
- Cierre funcional: Una funcionalidad nueva ya no se bloquea por falta de síntoma: se le pregunta dónde falta el comportamiento esperado, y el evaluador ve la descripción funcional del ticket
- Evidencia:
  - automated-test: npx vitest run: 2345 pruebas pasan y 0 fallan

### IMPROVEMENT-GATE-CONTRATO-PROPOSICIONES-20261005 — Alinear proposiciones, partir impactos y excluir afirmaciones sobre aprobaciones

- Estado: closed · QA: approved
- Cierre técnico: Descripción y pregunta alineadas con criterios de sí y de no, dos proposiciones atómicas por impacto y AVISO_DE_APROBACIONES en gateFor; 10 pruebas nuevas
- Cierre funcional: El recibo dice qué mitad de un impacto falta y el evaluador no toma como evidencia lo que el ticket afirma sobre sus propias aprobaciones
- Evidencia:
  - automated-test: npx vitest run: 2355 pruebas pasan y 0 fallan

### IMPROVEMENT-CORE-PLANTILLA-Y-MATERIALIZACION-20261005 — Pedir en la plantilla lo que evalúan las compuertas y acotar los criterios materializados

- Estado: closed · QA: approved
- Cierre técnico: Plantilla con causa comprobada, hipótesis, consumidores, impactos y Rollback obligatorio; portions opcional en el grafo; criterios acotados y Fuera de alcance al materializar; 12 pruebas nuevas
- Cierre funcional: Un ticket nuevo pide lo que las compuertas evalúan y un requisito repartido entre tickets se escribe en cada uno acotado a su porción, con lo que quedó fuera
- Evidencia:
  - automated-test: npx vitest run: 2367 pruebas pasan y 0 fallan

### FEATURE-ENGINE-REVISION-PREVIA-20261005 — Revisar sin modelo antes de la compuerta y decidir en código los votos del plan

- Estado: closed · QA: approved
- Cierre técnico: reviewBeforeGate corta antes del evaluador, decideInCode decide y vota cuatro comprobaciones del plan, valmen precheck y revision_previa la corren a mano; 14 pruebas nuevas y fixtures ajustados
- Cierre funcional: Un plan con el Rollback vacío, un archivo inexistente o un paso sin comando ya no gasta una llamada: la compuerta dice qué falta, y la revisión se puede correr a mano
- Evidencia:
  - automated-test: npx vitest run: 2381 pruebas pasan y 0 fallan

### FEATURE-GATE-UMBRALES-POR-EVALUADOR-20261005 — Configurar y aplicar umbrales por evaluador y por proposición

- Estado: closed · QA: approved
- Cierre técnico: gate-thresholds en config.yaml, applyThresholds por proposición y evaluador con la entrada más específica, firma obligatoria (approved-by y reason) y registro en el recibo; 12 pruebas nuevas
- Cierre funcional: El proyecto puede ajustar qué tan estricta es una compuerta con cada evaluador, pero solo un umbral firmado por una persona se aplica y el recibo dice quién lo decidió
- Evidencia:
  - automated-test: npx vitest run: 2393 pruebas pasan y 0 fallan

### FEATURE-ENGINE-CALIBRACION-Y-PRECISION-20261005 — Calibrar umbrales con decisiones humanas y medir la precisión de forma continua

- Estado: closed · QA: approved
- Cierre técnico: precisionReport por compuerta y evaluador, proposeThresholds desde decisiones humanas sin aplicar, comandos precision y thresholds, precision_compuertas y calibrar_compuerta con umbrales, y 39 vectores reales de regresión; 14 pruebas nuevas
- Cierre funcional: Se puede medir cuánto aciertan las compuertas con cada evaluador y proponer umbrales con evidencia, sin gastar una llamada y sin aplicar nada: lo firma una persona
- Evidencia:
  - automated-test: npx vitest run: 2407 pruebas pasan y 0 fallan

### SECURITY-ENGINE-APROBACION-PLAN-20261005 — Registrar la aprobación del plan con actor, fuente, frase y hash

- Estado: closed · QA: approved
- Cierre técnico: plan-approval.ts registra y verifica la aprobación del plan como evento con hash; comando approve-plan y fuentes aceptadas por configuración.
- Cierre funcional: La aprobación de un plan queda registrada con quién, desde dónde y qué plan, y deja de valer si el plan cambia.
- Evidencia:
  - automated-test: Pruebas del ticket y suite completa en verde (ver ## Pruebas)

### SECURITY-CORE-TRANSICION-APPROVED-20261005 — Exigir la aprobación registrada para entrar en approved

- Estado: closed · QA: approved
- Cierre técnico: transition.ts exige aprobacionDePlanVigente para entrar a approved y deja plan-approval-verified; la corrida delegada registra con fuente delegacion; next-step y la skill planificacion explican el registro.
- Cierre funcional: Un plan solo se da por aprobado si hay una aprobación registrada con quién, desde dónde y qué plan; una frase en el plan ya no basta.
- Evidencia:
  - automated-test: Pruebas del ticket y suite completa en verde (ver ## Pruebas)

### SECURITY-ENGINE-APROBACION-DESPLIEGUE-20261005 — Exigir la frase con versión y consumir la aprobación de despliegue

- Estado: closed · QA: approved
- Cierre técnico: run-state.ts exige la frase con la versión, ata la aprobación a corrida y versión y la consume; process.ts la usa en el paso de gate.
- Cierre funcional: Aprobar un despliegue exige la frase con la versión y vale una sola vez para su corrida.
- Evidencia:
  - automated-test: Pruebas del ticket y suite completa en verde (ver ## Pruebas)

### SECURITY-MC-ESCRITURAS-AUTENTICADAS-20261005 — Rechazar escrituras sin autenticación fuera de la máquina local

- Estado: closed · QA: approved
- Cierre técnico: exigirTokenEnEscritura rechaza con 401 las escrituras sin token cuando el servidor escucha fuera de la máquina local; serve genera o lee el token; la pantalla lo pide.
- Cierre funcional: Abrir Mission Control a la red ya no permite escribir sin el token.
- Evidencia:
  - automated-test: Pruebas del ticket y suite completa en verde (ver ## Pruebas)

### BUGFIX-ENGINE-CIERRE-CRITERIOS-20261005 — Exigir criterios marcados al cerrar y marcarlos desde el recibo mecánico

- Estado: closed · QA: approved
- Cierre técnico: criteria-marks: unmarkedCriteria exige [x] o «no aplica» con motivo al cerrar, markFromReceipt marca desde qa-mechanical y markManualCriteria solo con las palabras de quien probó; 15 pruebas nuevas
- Cierre funcional: Un ticket ya no se cierra con criterios que nadie marcó: los de test: se marcan solos desde el recibo y los manuales con la confirmación literal de quien los probó
- Evidencia:
  - automated-test: npx vitest run: 2422 pruebas pasan y 0 fallan

### BUGFIX-ENGINE-CONSUMO-FIABLE-20261005 — Impedir sesiones duplicadas y registrar el costo de Hermes y Codex

- Estado: closed · QA: approved
- Cierre técnico: sessionNumbersOwner y rechazo en addAiUsage, deduplicación y duplicatedSessions en el informe de valor, foto automática que declara compartida una sesión ajena y marca de costo suscripción o desconocido; 8 pruebas nuevas y una en timeline
- Cierre funcional: Una sesión con números ya no suma su costo en dos tickets, el informe lo señala y un costo ausente se declara suscripción o desconocido en vez de leerse como cero
- Evidencia:
  - automated-test: npx vitest run: 2431 pruebas pasan y 0 fallan

### CHORE-ENGINE-SALIDA-COMPUERTAS-CONTROL-20261005 — Medir la salida de S1 a S3 con ambos registros y dejarla en verify.md

- Estado: closed · QA: approved
- Cierre técnico: Script de medición de solo lectura, anexos de verify.md y el informe real de los dos registros históricos.
- Cierre funcional: Queda escrito, y se puede repetir, que el código de S1 a S3 valida los dos registros y cómo se comportan las compuertas.
- Evidencia:
  - automated-test: npx vitest run (2525 pasan), tsc sin errores, medición de ambos registros

### FEATURE-MC-FIRMA-DE-BLOQUEO-20261005 — Mission Control ofrece firmar un recibo en block con la frase literal de quien autoriza

- Estado: closed · QA: approved
- Cierre técnico: Pantalla entregada en el commit 370b13d; ver ## Implementación.
- Cierre funcional: Revisada por el PO en laboratorio.
- Evidencia:
  - automated-test: Pruebas del ticket y suite completa en verde (ver ## Pruebas)

### IMPROVEMENT-ADAPTER-CONTRATO-RESPUESTA-20261005 — Abrir AGENTS.md con el contrato de respuesta y acotar su tamaño

- Estado: closed · QA: approved
- Cierre técnico: En packages/adapter: templates.ts exporta el contrato (RESPONSE_CONTRACT_*), rule-projection.ts (nuevo, puro) compacta el «Por qué» de los estandares-*, lee rules-to-skills, deja el puntero y retitula una colisión con «Cómo se responde», agents-size.ts (nuevo, puro) lee agents-md-budget y mide bytes y tokens (bytes/4), project.ts compone todo en projectAgentsMd, skills.ts suma las reglas encaminadas a SkillDefinition.rules con withRoutedRules y skillText, y projection.ts expone Projection.agentsMd y Projection.warnings. packages/mcp/src/prompts.ts sirve cada skill con sus reglas encaminadas y su local.md. En packages/cli/src/commands.ts, syncProject imprime el tamaño y el aviso (lineasDeTamano) y no cambia el código de salida. sync --check verifica la sección porque compara el archivo entero; el AGENTS.md de este repositorio se regeneró con la misma función. Pruebas nuevas en tests/respuesta-agents-md.test.ts y tests/agents-md-tamano.test.ts (56). Commits: 5f1bfce (R-RESP-001 y R-RESP-005) y e790413 (criterio 10, tras reabrir).
- Cierre funcional: Todo proyecto que monte el harness recibe, en el AGENTS.md que lee cada cliente, la sección «Cómo se responde» antes de sus reglas: la respuesta en la primera línea, las decisiones como opciones con su efecto y una recomendación en cinco líneas o menos, la evidencia citada y no transcrita, y la declaración de que eso prevalece sobre cualquier modo de respuesta heredado. El documento pesa menos: el «Por qué» de los estándares va en una línea y el proyecto puede declarar un presupuesto de tamaño y mandar las reglas de pantalla a las skills de interfaz. Y `valmen sync` dice cuánto pesa el AGENTS.md y avisa cuando pasa del presupuesto, tanto al escribir como con --check, sin bloquear. Medido sobre una copia de SaiOpenCloud: de 54 425 B (~13 607 tokens) a 49 520 B sin configurar nada y a 41 083 B (~10 271 tokens) con la regla de pantalla en las skills; la meta de ~22 KB queda para el ticket de compactación de las plantillas del harness (IMPROVEMENT-ADAPTER-PLANTILLAS-COMPACTAS-20261006).
- Evidencia:
  - automated-test: Corrida del agente a pedido del PO, desde /Users/juanandrade/Desktop/ValmenHarness, 2026-10-06. (1) npx vitest run tests/respuesta-agents-md.test.ts tests/agents-md-tamano.test.ts tests/dogfooding-registro.test.ts: 3 archivos, 54 pruebas en verde. (2) npx vitest run tests/agents-md-tamano.test.ts tests/adapters.test.ts tests/skills.test.ts tests/skills-publicadas.test.ts tests/config-view.test.ts tests/mcp-prompts.test.ts: 6 archivos, 138 pruebas en verde. (3) npx vitest run: 141 archivos y 2221 pruebas en verde, 48 omitidas (línea base antes del cambio: 138 archivos y 2161 pruebas). (4) npx tsc --noEmit -p tsconfig.json: código 0. (5) Estado del índice exportado con git checkout-index, sin el trabajo ajeno: tsc en 0 y 153 pruebas de ocho archivos en verde. (6) Gate qa-mechanical: recibo GR-20261006-IMPROVEMENT-ADAPTER-CONTRATO-RESPUESTA-20261005-qa-mechanical-2 en approve, 8 de 8 criterios con test. Mutaciones sobre project.ts (sin contrato, sin compactación, sin encaminamiento, sin retitulado) hacen fallar 9, 2, 2 y 1 pruebas y el archivo se restauró idéntico. Commit 5f1bfce335cc3a5e1cc63bdbfa69815665e9f277.
  - automated-test: Segundo ciclo (reapertura por el criterio 10), corrida del agente a pedido del PO, desde /Users/juanandrade/Desktop/ValmenHarness, 2026-10-06. (7) npx vitest run tests/agents-md-tamano.test.ts: 1 archivo, 45 pruebas en verde (6 nuevas de «valmen sync informa el tamaño»). (8) npx vitest run: 142 archivos y 2231 pruebas en verde, 48 omitidas. (9) npx tsc --noEmit -p tsconfig.json: código 0. Mutaciones sobre syncProject (sin aviso al escribir, sin línea de tamaño, sin tamaño en --check) hacen fallar 1, 3 y 1 pruebas y el archivo se restauró idéntico. Salida real de syncProject sobre una copia de SaiOpenCloud con agents-md-budget: 30000 y la regla de pantalla en las skills: «tamaño de AGENTS.md 41 083 B (~10 271 tokens), presupuesto 30 000 B» y «Aviso: AGENTS.md pasa del presupuesto … 11 083 B de más», con salida 0; --check repite ambos. Commit e790413b4a13452aad046afc4cf67b68b3020185.

### FEATURE-ADAPTER-CLAUDE-CODE-RESPUESTA-20261005 — Generar el output style, activarlo y mantener el bloque de CLAUDE.md

- Estado: closed · QA: approved
- Cierre técnico: claude-code.ts fusiona outputStyle y el bloque de CLAUDE.md; projectFiles los proyecta con el runtime claude.
- Cierre funcional: Claude Code recibe respuestas cortas sin configurar nada: estilo de salida activado y CLAUDE.md con bloque gestionado, sin pisar lo escrito a mano.
- Evidencia:
  - automated-test: npx vitest run (2455 pasan), tsc sin errores

### IMPROVEMENT-ADAPTER-AGENTES-Y-VERBOSIDAD-20261005 — Limitar los informes de agentes y proyectar la verbosidad de Codex y OpenCode

- Estado: closed · QA: approved
- Cierre técnico: withReportLimit en los tres renderizadores y verbosity.ts con la fusión del config.toml de Codex.
- Cierre funcional: Los agentes devuelven informes cortos y Codex recibe la verbosidad baja sin pisar la configuración de la persona.
- Evidencia:
  - automated-test: npx vitest run (2467 pasan), tsc sin errores

### IMPROVEMENT-MCP-RESUMEN-SIGUIENTE-PASO-20261005 — Devolver resumen y siguiente paso en el dato estructurado de MCP

- Estado: closed · QA: approved
- Cierre técnico: resumenDeRecibo, ver_recibo y callTool que agrega siguiente_paso a todo dato estructurado.
- Cierre funcional: Los clientes que solo leen el dato estructurado reciben un resumen corto con el siguiente paso, y el recibo completo se pide aparte.
- Evidencia:
  - automated-test: npx vitest run (2473 pasan), tsc sin errores

### FEATURE-ENGINE-JORNADA-DIARIA-20261005 — Configurar la jornada apagada y armarla desde el motor existente

- Estado: closed · QA: approved
- Cierre técnico: armarJornada escribe la jornada del día por dependencias y autorización; comando journey plan y herramienta armar_jornada.
- Cierre funcional: Se puede armar el plan del día en un comando, con aviso por Telegram, sin crear tareas por ticket.
- Evidencia:
  - automated-test: npx vitest run (2535 pasan), tsc sin errores

### FEATURE-CLI-AVANCE-JORNADA-20261005 — Avanzar la jornada sin modelo e instalar el disparador launchd

- Estado: closed · QA: approved
- Cierre técnico: avanzarJornada con identidad estable sobre dispatchJourney; plist de launchd preparado sin ejecutar launchctl; corregido el id de eventos de despacho entre tickets.
- Cierre funcional: La jornada avanza sola con un comando repetible sin modelo, y el disparador periódico queda listo para activar por una persona.
- Evidencia:
  - automated-test: npx vitest run (2546 pasan), tsc sin errores

### FEATURE-ENGINE-JORNADA-PREPARACION-20261005 — Llevar intake a planned y parar en la aprobación del plan

- Estado: closed · QA: approved
- Cierre técnico: prepararTicket con verificación en código, avisos de decisión y avance con fase de preparación.
- Cierre funcional: La jornada deja los planes listos para que una persona los apruebe, sin que el agente pueda aprobar nada.
- Evidencia:
  - automated-test: npx vitest run (2557 pasan), tsc sin errores

### FEATURE-ENGINE-APROBACION-LOTE-20261005 — Aprobar planes en lote desde Telegram con enlace firmado

- Estado: closed · QA: approved
- Cierre técnico: Implementación entregada y probada en el commit 9d7a5c4; ver ## Implementación.
- Cierre funcional: Cumple los criterios del ticket; pruebas en verde.
- Evidencia:
  - automated-test: Pruebas del ticket y suite completa en verde (ver ## Pruebas)

### FEATURE-ENGINE-JORNADA-EJECUCION-20261005 — Llevar approved hasta las pruebas con el modelo de cada fase

- Estado: closed · QA: approved
- Cierre técnico: Roles de fase en el enrutamiento, modelo por fase en el despacho, ejecutor desatendido, contrato de pruebas verificado y registro por fase.
- Cierre funcional: Cada ticket llega a las pruebas con su contrato escrito y cada sesión usa el modelo de su fase, con su registro.
- Evidencia:
  - automated-test: npx vitest run (2565 pasan), tsc sin errores

### FEATURE-ENGINE-TOPES-Y-PARADA-20261005 — Aplicar topes y detener con aviso cuando falla el ejecutor

- Estado: closed · QA: approved
- Cierre técnico: Topes diario y concurrente, tiempo máximo por ejecución, paradas por fallo con aviso y liberación manual con clear-stop.
- Cierre funcional: La jornada se frena sola y avisa cuando algo falla, y no vuelve a intentarlo hasta que una persona lo decide.
- Evidencia:
  - automated-test: npx vitest run (2573 pasan), tsc sin errores

### IMPROVEMENT-ENGINE-VIGILANTE-JORNADA-20261005 — Avisar pruebas pendientes, fallos y parte diario por Telegram

- Estado: closed · QA: approved
- Cierre técnico: Aviso de pruebas listas por ciclo con su contrato y sección de jornada en el parte diario con la actividad por fase.
- Cierre funcional: El responsable se entera en el celular de lo que está listo para probar y recibe el panorama del día.
- Evidencia:
  - automated-test: npx vitest run (2579 pasan), tsc sin errores

### FEATURE-ENGINE-REGLAS-INTEGRACION-20260926 — Validar las reglas del commit por ticket sin push

- Estado: closed · QA: approved
- Cierre técnico: readIntegrationConfig, reglasDeIntegracion y ejecutarGitPermitido con lista cerrada de operaciones.
- Cierre funcional: La rama de trabajo se declara y se protege de producción, y está escrito en código qué se puede commitear y qué git puede hacer una jornada.
- Evidencia:
  - automated-test: npx vitest run (2605 pasan), tsc sin errores

### INTEGRATION-GIT-INTEGRACION-AUTONOMA-20260926 — Crear un commit por ticket en la rama de trabajo sin push

- Estado: closed · QA: approved
- Cierre técnico: integrarTicket con rama de trabajo asegurada, árbol limpio, reglas, verificación del árbol probado y git de lista cerrada.
- Cierre funcional: Cada ticket entregado por la jornada queda en su propio commit revertible, sin tocar main y sin publicar.
- Evidencia:
  - automated-test: npx vitest run (2614 pasan), tsc sin errores

### SECURITY-ENGINE-JORNADA-SIN-AUTOAPROBACION-20261005 — Retirar las aprobaciones por prompt y las transiciones ilegales de las plantillas

- Estado: closed · QA: approved
- Cierre técnico: Implementación entregada y probada en el commit 61b3407; ver ## Implementación.
- Cierre funcional: Cumple los criterios del ticket; pruebas en verde.
- Evidencia:
  - automated-test: Pruebas del ticket y suite completa en verde (ver ## Pruebas)

### INTEGRATION-HERMES-DESPACHO-JORNADA-20261001 — Conectar Hermes como despachador opcional sin modelo

- Estado: closed · QA: approved
- Cierre técnico: Despachador declarable (execution.dispatcher) y job de Hermes sin agente preparado por install-trigger.
- Cierre funcional: Un proyecto puede usar Hermes en vez de launchd para disparar la jornada; sin declararlo nada cambia.
- Evidencia:
  - automated-test: npx vitest run

### SECURITY-ENGINE-CIERRE-AUTORIZADO-20260926 — Guardar autorizaciones de QA firmadas, append-only y revocables

- Estado: closed · QA: approved
- Cierre técnico: Implementación entregada y probada en el commit c9ba836; ver ## Implementación.
- Cierre funcional: Cumple los criterios del ticket; pruebas en verde.
- Evidencia:
  - automated-test: Pruebas del ticket y suite completa en verde (ver ## Pruebas)

### SECURITY-MC-AUTORIZACION-QA-20261005 — Crear y revocar autorizaciones desde Mission Control y enlace firmado

- Estado: closed · QA: approved
- Cierre técnico: Canales humanos de autorización de QA: Mission Control y código firmado; ver ## Implementación.
- Cierre funcional: Una persona crea y revoca autorizaciones desde Mission Control o con un código de un solo uso.
- Evidencia:
  - automated-test: Pruebas del ticket y suite completa en verde (ver ## Pruebas)

### FEATURE-ENGINE-ELEGIBILIDAD-QA-20261005 — Decidir en código la elegibilidad para QA por agente

- Estado: closed · QA: approved
- Cierre técnico: Regla de elegibilidad pura en engine con cupo diario y comando de CLI.
- Cierre funcional: Un ticket solo es elegible para QA por agente si cumple todas las reglas, y cada incumplimiento se nombra.
- Evidencia:
  - automated-test: npx vitest run

### SECURITY-ENGINE-COMPUERTA-QA-AGENT-20261005 — Correr qa-agent en worktree limpio, contra la base y con recibo reproducible

- Estado: closed · QA: approved
- Cierre técnico: Implementación entregada y probada en el commit 793479c; ver ## Implementación.
- Cierre funcional: Cumple los criterios del ticket; pruebas en verde.
- Evidencia:
  - automated-test: Pruebas del ticket y suite completa en verde (ver ## Pruebas)

### SECURITY-GATEHTTP-CRITERIO-HTTP-20261005 — Verificar criterios HTTP contra hosts permitidos con gramática cerrada

- Estado: closed · QA: approved
- Cierre técnico: Implementación entregada y probada en el commit f7df445; ver ## Implementación.
- Cierre funcional: Cumple los criterios del ticket; pruebas en verde.
- Evidencia:
  - automated-test: Pruebas del ticket y suite completa en verde (ver ## Pruebas)

### SECURITY-ENGINE-QA-POR-POLITICA-20261005 — Conectar qa-agent al flujo y atribuir el ciclo de QA a la autorización

- Estado: closed · QA: approved
- Cierre técnico: Cierre del ciclo de QA por política en el commit 794e31f; ver ## Implementación.
- Cierre funcional: Cumple los criterios; pruebas en verde.
- Evidencia:
  - automated-test: Pruebas del ticket y suite completa en verde (ver ## Pruebas)

### FEATURE-ENGINE-QA-PERIODO-SOMBRA-20261005 — Correr la QA por agente en sombra y promoverla con veinte coincidencias

- Estado: closed · QA: approved
- Cierre técnico: Modo sombra/cierre, concordancia por ticket y promoción registrada; el cierre por política exige ambos.
- Cierre funcional: La QA por agente solo cierra tickets tras 20 coincidencias con el responsable y una promoción suya.
- Evidencia:
  - automated-test: npx vitest run

### IMPROVEMENT-ADAPTER-CONTRATO-QA-AGENTS-20261005 — Declarar en AGENTS.md la QA por agente y la autorización como acción humana

- Estado: closed · QA: approved
- Cierre técnico: Dos reglas de QA por agente en la plantilla de AGENTS.md, con su prueba y el tope de tamaño ajustado.
- Cierre funcional: Los agentes leen en AGENTS.md que la autorización de QA es una acción humana.
- Evidencia:
  - automated-test: npx vitest run

### FEATURE-MC-POLITICAS-AUTONOMAS-20260926 — Editar políticas autónomas desde Mission Control

- Estado: closed · QA: approved
- Cierre técnico: Pantalla entregada en el commit 82d5182; ver ## Implementación.
- Cierre funcional: Revisada por el PO en laboratorio.
- Evidencia:
  - automated-test: Pruebas del ticket y suite completa en verde (ver ## Pruebas)

## Pendiente del PO

  - criterio manual: La interfaz pide el token ante un 401 y lo envía en las escrituras siguientes (no aplica: el PO cerró sin verificarlo, «La A cierra los 3», 2026-10-06)

## Anexos

### salida-s1-s3.md

# Salida de S1 a S3 — medición del 2026-10-07

## Registro `ValmenHarness`

Raíz: `/Users/juanandrade/Desktop/ValmenHarness`

- Validación: **correcta** — 134 tickets válidos.

Precisión de las compuertas:

```text
Precisión de las compuertas — todo el registro

analysis · cascade: 72 corrida(s) — aprueba 38, revisa 25, bloquea 9
  tasa de banda: 35 %
  revisiones aprobadas sin cambios: 100 % (12 de 12 decididas por una persona; 8 decidida(s) por el agente por delegación, que no cuentan)
  bloqueos por tipo de ticket: FEATURE 9

analysis · jev: 39 corrida(s) — aprueba 1, revisa 38, bloquea 0
  tasa de banda: 97 %
  revisiones aprobadas sin cambios: 100 % (33 de 33 decididas por una persona; 4 decidida(s) por el agente por delegación, que no cuentan)
  bloqueos por tipo de ticket: ninguno

plan · cascade: 74 corrida(s) — aprueba 53, revisa 3, bloquea 18
  tasa de banda: 4 %
  revisiones aprobadas sin cambios: 100 % (2 de 2 decididas por una persona; 1 decidida(s) por el agente por delegación, que no cuentan)
  bloqueos por tipo de ticket: BUGFIX 1, CHORE 1, FEATURE 11, IMPROVEMENT 3, SECURITY 2

plan · jev: 38 corrida(s) — aprueba 20, revisa 18, bloquea 0
  tasa de banda: 47 %
  revisiones aprobadas sin cambios: 100 % (14 de 14 decididas por una persona; 4 decidida(s) por el agente por delegación, que no cuentan)
  bloqueos por tipo de ticket: ninguno

qa-mechanical · command: 125 corrida(s) — aprueba 125, revisa 0, bloquea 0
  tasa de banda: 0 %
  revisiones aprobadas sin cambios: — (0 de 0 decididas por una persona)
  bloqueos por tipo de ticket: ninguno
```

## Registro `SaiOpenCloud`

Raíz: `/Users/juanandrade/Desktop/ValMenTech/10-Proyectos/SaiOpenCloud`

- Validación: **correcta** — 136 tickets válidos.

Precisión de las compuertas:

```text
Precisión de las compuertas — todo el registro

analysis · jev: 70 corrida(s) — aprueba 15, revisa 55, bloquea 0
  tasa de banda: 79 %
  revisiones aprobadas sin cambios: 100 % (42 de 42 decididas por una persona)
  bloqueos por tipo de ticket: ninguno

plan · jev: 70 corrida(s) — aprueba 25, revisa 45, bloquea 0
  tasa de banda: 64 %
  revisiones aprobadas sin cambios: 100 % (27 de 27 decididas por una persona)
  bloqueos por tipo de ticket: ninguno

qa-mechanical · command: 79 corrida(s) — aprueba 71, revisa 6, bloquea 2
  tasa de banda: 8 %
  revisiones aprobadas sin cambios: 100 % (5 de 5 decididas por una persona)
  bloqueos por tipo de ticket: BUGFIX 1, IMPROVEMENT 1
```

## Lectura

Hechos que salen de los números de arriba, sin extrapolar más de lo que miden:

- **El código nuevo lee y valida los dos registros históricos**: 134 tickets en este repositorio y 136 en el de SaiOpenCloud, sin un solo ticket rechazado. El de SaiOpenCloud se leyó sin escribirlo.
- **La tasa de banda baja con la cascada**: en este repositorio la compuerta `plan` con `cascade` queda en banda de revisión el 4 % de las veces contra el 47 % con `jev`, y `analysis` el 34 % contra el 97 %. En SaiOpenCloud, que solo tiene corridas con `jev`, es del 79 % (`analysis`) y el 64 % (`plan`). No es una comparación controlada: son registros, épocas y mezclas de tickets distintos, y la cascada se usó donde el artefacto tenía sustancia.
- **Las revisiones se aprueban sin cambios**: el 100 % de las decididas por una persona en ambos registros; las que decidió el agente por delegación se separan y no cuentan. Con 0 rechazos, `valmen thresholds` no propone aflojar ningún umbral: «cero falsos aprobados» no se puede medir sin rechazos.
- **Los bloqueos** se concentran en tickets `FEATURE` (9 de 9 en `analysis` con cascada; 11 de 17 en `plan`), que son los de redacción más larga; ninguno en SaiOpenCloud con `jev`, que no bloquea.
- **Pendiente de la propia medición**: el informe es de un día; la «medición continua» del requisito se cumple corriendo este script con la frecuencia que el proyecto decida (cada semana, o antes de abrir una jornada).

Cómo repetirla: `node scripts/medir-salida-s1-s3.mjs --root <registro> [--root <otro>]`.
