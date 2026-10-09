---
schema_version: 2
id: IMPROVEMENT-GATE-PRECHECK-CITAS-WORKTREE-20261009
title: Refinar compuertas con precheck de citas en worktrees y error real de cascade en el recibo
type: IMPROVEMENT
module: GATE
workflow_status: closed
qa_status: approved
release_status: unreleased
user_visible: false
sync_impact: false
migration_impact: false
docker_impact: false
risk_level: normal
created: 2026-10-08
updated: 2026-10-09
related_ticket: null
target_release: null
released_in: null
---

# IMPROVEMENT-GATE-PRECHECK-CITAS-WORKTREE-20261009

## Solicitud original

"revises las aprobaciones para ver si hay que refinar las compuertas o algo asi". Resultado de la revisión de vista-agentes (.valmen/features/vista-agentes/aprobaciones-claude.md, puntos 1 y 2), y el PO dijo «Recomiendo A, abre los dos tickets»: (1) `nombra_archivos_reales` salió bajo en los 8 análisis porque el precheck dice «la raíz no es un repositorio git» desde un worktree y no comprueba las citas ruta:línea; (2) `cascade` falla sin detalle («Claude Code respondió un error: sin detalle») y el recibo no deja el error real ni reintenta antes de degradar al evaluador por defecto.

### Supuestos y decisiones pendientes

<!-- Si el pedido nombra algo que el código no tiene —parámetro, permiso,
campo, bandera, columna, migración— y no lo especifica, listá cada elemento
con su pregunta antes de avanzar a análisis; el análisis no planifica sobre
la adivinanza. Si no hay ninguno, escribí «Ninguno» y seguí. -->
- **Quién decide las compuertas de este ticket:** el ticket modifica la revisión previa y el transporte del evaluador que evalúan sus propias compuertas de análisis y de plan; por la regla «un gate no amplía su propia autoridad», cada compuerta de este ticket (análisis, plan, aprobación y QA) la decide una persona, no el agente ni una autorización de aprobación. Pregunta: ¿el PO confirma que ninguna autorización vigente (APA-…) se aplica a este ticket?
- **Citas que hoy no se resuelven desde la raíz:** al reconocer el worktree, la revisión previa empieza a comprobar citas que hoy omite; sobre el diagnóstico de FEATURE-WEB-MOTOR-ESCENA-20261008 da 4 hallazgos, todos de rutas que no son relativas a la raíz (una relativa con «../», una ruta de URL que empieza por «/», dos relativas a la carpeta de la feature). Pregunta: ¿una cita inexistente sigue cortando antes del evaluador (hallazgo, como hoy en el checkout principal), o en el análisis pasa a ser un dato que recibe la proposición `nombra_archivos_reales` sin cortar? Recomendación del análisis: las rutas URL («/…») y las relativas con «../» se omiten con su motivo, y el resto sigue siendo hallazgo.
- **Línea citada:** hoy la línea de «ruta:línea» se descarta. Pregunta: ¿una línea mayor que el largo del archivo cuenta como cita inexistente? Recomendación: sí, con el mismo hallazgo y el número de líneas del archivo en el mensaje.
- **Reintento de la cascada:** el fallo real es del código, no del entorno, y es determinista sobre este ticket (2 de 2 corridas, ver causa 6): un reintento idéntico no lo resuelve. Pregunta: ¿el alcance queda en registrar el error real, reintentar una vez y degradar al evaluador por defecto declarándolo en el recibo (lo pedido), o incluye además que un fallo de salida estructurada del productor escale al eslabón siguiente de la cascada? Recomendación: lo pedido en este ticket, y la causa de por qué `claude-haiku-4-5-20251001` omite las proposiciones `noul` en un ticket aparte, con este recibo como evidencia.
- **Decisión del PO (2026-10-09), literal:** «Si la recomendación».
  Interpretación (transmitida por el orquestador): (A) las rutas citadas inexistentes cortan el gate, y las que empiezan por «/» o «../» se omiten con su motivo; (B) una línea mayor que el largo del archivo cuenta como cita inexistente; (C, corregida) se registra el error real del CLI en el recibo y se declara la degradación al evaluador por defecto, **sin reintento**, porque el fallo es determinista; el estudio de por qué `claude-haiku-4-5-20251001` omite las proposiciones `noul` va en un ticket aparte. El PO ratifica el APPROVE de la compuerta de análisis (recibo `GR-…-analysis-1`, evaluador `jev`, tras dos fallos de `cascade`). Las compuertas siguientes de este ticket siguen siendo de una persona.

## Descripción funcional

- Alcance: la revisión previa de las compuertas de análisis y de plan (comprobación de archivos citados en el diagnóstico) y el manejo del fallo del evaluador `cascade` por el CLI de Claude Code. Fuera de alcance: los puntos 3 a 9 de la revisión final de vista-agentes.
- Usuario o rol afectado: el agente que corre una compuerta desde un worktree de corrida orquestada, y el PO que lee el recibo para decidir una REVIEW.
- Comportamiento actual: desde un worktree, `valmen precheck analysis` dice «Omitido: archivos citados: la raíz del proyecto no es un repositorio git» y no comprueba ninguna cita; la proposición `nombra_archivos_reales` se responde sin saber si los archivos existen (0.29–0.81 en los 8 análisis con jev de vista-agentes). Cuando `cascade` falla, la compuerta imprime «El evaluador no pudo completar la evaluación: Claude Code respondió un error: sin detalle», no escribe recibo, no reintenta, y el agente vuelve a correr la compuerta con el evaluador por defecto sin que quede rastro del fallo.
- Comportamiento esperado: la revisión previa reconoce un worktree (`.git` como archivo) igual que un checkout, comprueba en código cada ruta citada y su línea, y el resultado llega a la evaluación como dato. Un fallo del CLI deja en el mensaje y en un recibo el subtipo, el código de salida, el primer elemento de `errors` y la cola de stderr del error real; la cascada no reintenta: degrada al evaluador por defecto y el recibo declara el evaluador pedido, el efectivo y el error.

## Diagnóstico

- Causa comprobada (con `ruta:línea`):
  1. Worktree: `esRepositorio` en `packages/engine/src/revision-previa.ts:131` exige que `.git` sea directorio (`statSync(...).isDirectory()`, línea 133); en un worktree `.git` es un archivo con «gitdir: …», así que la rama de `packages/engine/src/revision-previa.ts:161` no corre y `packages/engine/src/revision-previa.ts:175` agrega el omitido. Reproducido el 2026-10-09: `valmen precheck analysis --id FEATURE-WEB-MOTOR-ESCENA-20261008` desde este worktree da «Sin hallazgos» con el omitido; el mismo comando desde el checkout principal da 4 hallazgos `archivo_inexistente`.
  2. Citas `ruta:línea`: `pareceRuta` (`packages/engine/src/revision-previa.ts:121`) acepta el sufijo de línea y la línea 164 lo descarta; nunca se compara con el largo del archivo.
  3. El resultado no llega a la proposición: `reviewBeforeGate` solo devuelve `findings` y `skipped` y `packages/engine/src/gate.ts:618` los usa para cortar o seguir; el check mecánico `archivos_existen` está fijo en `skip` en `packages/gate/src/definitions.ts:232`, y `nombra_archivos_reales` (`packages/gate/src/definitions.ts:285`) se le pregunta al modelo solo con el texto. Recibos: los 8 análisis con evaluador `jev` de vista-agentes dan `nombra_archivos_reales` entre 0.29 (FEATURE-WEB-MOTOR-ESCENA-20261008) y 0.81 (FEATURE-WEB-MUNDO-INVERNADERO-20261008), todos en banda; los 2 análisis con `cascade` dan 0.95 y 0.93.
  4. Error «sin detalle»: `callClaudeCli` en `packages/credentials/src/claude-cli.ts:422` arma el mensaje solo con `api_error_status` y `result`; cuando el CLI devuelve `is_error: true` sin `result` (lo que hace un subtipo de error como el de tope de turnos o de ejecución), el mensaje queda «respondió un error: sin detalle» (línea 430) y se descartan `subtype`, `terminal_reason`, `errors`, el código de salida y la cola de stderr, aunque la interfaz `ResultadoDelCli` (línea 288) ya lee `subtype`.
  5. Sin recibo ni reintento: el `catch` de `packages/engine/src/gate.ts:721` devuelve el error antes de `buildReceipt` (`packages/engine/src/gate.ts:813`), así que un fallo no deja recibo; `runSemantic` en `packages/engine/src/evaluators.ts:398` delega en `runCascade` sin reintento, y la degradación automática (`packages/engine/src/evaluators.ts:437`) existe solo para `jev`. Comprobado en el registro: ningún recibo ni ticket de vista-agentes contiene «sin detalle»; los recibos con `evaluator: jev` son las reejecuciones manuales.
  6. Error real de la cascada, capturado el 2026-10-09 al correr `valmen gate analysis --id IMPROVEMENT-GATE-PRECHECK-CITAS-WORKTREE-20261009 --evaluator cascade` con `VALMEN_CLAUDE_BIN` apuntando a un envoltorio que guarda la salida del CLI: el productor `claude-haiku-4-5-20251001` con `--effort medium` termina con `subtype: error_max_structured_output_retries`, `terminal_reason: structured_output_retry_exhausted`, `result: null`, código de salida 1, y `errors[0]` = «Failed to provide valid structured output after 5 attempts — … root: must have required property 'diagnostico_ubica_el_cambio', … 'causa_especifica', … 'nombra_archivos_reales', … 'riesgos_cubren_impactos'». Las dos corridas dieron el mismo error. No es el entorno: tres llamadas estructuradas con un esquema de una propiedad desde este mismo subagente respondieron bien. El esquema lo arma `buildSchema` en `packages/gate-llm-judge/src/judge.ts:107` con todas las proposiciones como requeridas.
- Hipótesis pendientes: por qué el productor omite las cuatro proposiciones `noul` y entrega solo `clasificacion` (tamaño del estado, el esfuerzo `medium` sobre `claude-haiku-4-5-20251001` o la forma del esquema) no está comprobado; tampoco que sea la misma causa de los ~8 fallos de vista-agentes, que no dejaron rastro. Queda fuera del plan de este ticket salvo que el PO decida lo contrario (ver «Supuestos y decisiones pendientes»).
- Consumidores afectados: `packages/cli/src/commands.ts:351` (`valmen precheck`), `packages/mcp/src/tools.ts:3200` (`revision_previa`), `packages/engine/src/gate.ts:618` (toda compuerta no mecánica), y todo llamador de `callClaudeCli` (cascada, juez, descomposición de features), que verá un mensaje de error más largo pero con el mismo `code`.
- Archivos y flujo investigados: `packages/engine/src/revision-previa.ts`, `packages/engine/src/gate.ts`, `packages/engine/src/evaluators.ts`, `packages/engine/src/cascade.ts`, `packages/gate/src/definitions.ts`, `packages/credentials/src/claude-cli.ts`, `packages/adapter/src/routing.ts`, `packages/engine/src/state.ts` (`buildGateState` y `runMechanicalChecks`, sin el check `archivos_existen`), `packages/gate/src/receipt.ts` (`buildReceipt` y `hashState`); pruebas existentes en `tests/revision-previa.test.ts` y `tests/claude-cli.test.ts`; recibos `.valmen/receipts/` de los 11 tickets de `.valmen/features/vista-agentes/tickets.yaml`.
- Riesgos y compatibilidad: reconocer el worktree hace que la revisión previa corte análisis que hoy pasan en worktrees (los 4 hallazgos de FEATURE-WEB-MOTOR-ESCENA-20261008 son rutas relativas o de URL, no archivos ausentes); por eso las rutas que empiezan por «/» o «../» necesitan una regla antes de activar el corte. El formato del recibo crece con un campo opcional (evaluador pedido y error del intento): los lectores de recibos v1 deben ignorar campos desconocidos, y `stateHash`/`gateHash` no deben cambiar por él. La degradación automática gasta una llamada al evaluador por defecto después del fallo, la misma que hoy se gasta a mano; un fallo de credencial (`AUTH`, `CREDENTIAL_MISSING`) no se degrada, para no tapar un error que hay que ver. Agregar las rutas comprobadas al estado cambia el `stateHash` de las compuertas de análisis y de plan respecto de corridas anteriores, así que un recibo previo no se reutiliza tras el cambio.
- Impactos de sync, migración, Docker o despliegue: ninguno; es código del harness (motor, compuertas y credenciales) sin datos sincronizados, migraciones, contenedores ni despliegue.

## Plan

- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan). Decisión del PO el 2026-10-09: «A», a la pregunta «A) Aprobar el plan → se implementa; quedan los criterios en banda y el 0.72».
- Alcance: revisión previa de citas (decisiones A y B) y registro y degradación del fallo de `cascade` (decisión C, sin reintento). Exclusiones: por qué el productor `claude-haiku-4-5-20251001` omite las proposiciones `noul` (ticket aparte), los puntos 3 a 9 de la revisión final de vista-agentes, y cambiar `buildSchema` en `packages/gate-llm-judge/src/judge.ts`.
- Pasos ordenados:
  1. `packages/engine/src/revision-previa.ts`, `esRepositorio`: aceptar `.git` como directorio o como archivo cuya primera línea empieza por «gitdir:». (C1, C2, C3, C4)
  2. `packages/engine/src/revision-previa.ts`, `reviewBeforeGate`: conservar la línea de la cita y, si supera el número de líneas del archivo, devolver `archivo_inexistente` con el largo del archivo en el mensaje. (C5, C6)
  3. `packages/engine/src/revision-previa.ts`, `reviewBeforeGate`: una cita que empieza por «/» o «../» va a `skipped` con el motivo «no es relativa a la raíz» y no a `findings`. (C7, C8)
  4. `packages/engine/src/revision-previa.ts`: exportar `citedFiles(root, ticketText)` que devuelve las rutas citadas en el diagnóstico con su resultado (`existe`, `no_existe`, `linea_fuera`, `omitida`), y hacer que `reviewBeforeGate` la use. (C9, C10, C11)
  5. `packages/engine/src/gate.ts`, `runGate` (junto a `reviewBeforeGate`, línea 618): con el resultado de `citedFiles`, agregar al estado el campo `archivos_citados` (texto, una ruta por línea con su resultado) y a `checks` el check mecánico `archivos_existen` (`pass` si todas existen, `skip` con motivo si no hay citas). (C9, C10, C11)
  6. `packages/credentials/src/claude-cli.ts`: ampliar `ResultadoDelCli` con `terminal_reason` y `errors`, y en `callClaudeCli` (línea 422) armar el mensaje con `subtype`, `terminal_reason`, `errors[0]`, el código de salida y los primeros 300 caracteres de stderr, sin cambiar `codigoDeError`. (C12, C13, C14, C15, C16, C17)
  7. `packages/engine/src/evaluators.ts`, `runSemantic`: si `runCascade` lanza con un código distinto de `AUTH` y `CREDENTIAL_MISSING`, ejecutar el evaluador por defecto (`jev`, con su degradación existente al juez) y devolver en `EvaluationOutcome` los campos `requestedEvaluator: "cascade"` y `evaluatorFailure: { code, message }`; sin reintentar la cascada. (C18, C19, C20, C21, C22)
  8. `packages/gate/src/receipt.ts`, `GateReceipt` y `buildReceipt`: campos opcionales `requestedEvaluator` y `evaluatorFailure`, fuera de `hashState`; `packages/engine/src/gate.ts` los pasa a `buildReceipt` (línea 813) y el informe imprime «evaluador pedido cascade · efectivo jev» y el error. (C21, C22, C23, C24)
  9. Pruebas: casos nuevos en `tests/revision-previa.test.ts` y `tests/claude-cli.test.ts`, y archivo nuevo `tests/gate-cascade-fallo.test.ts` con un `judge` falso que lanza el error capturado (`error_max_structured_output_retries`); cada causa con su caso de control. (C1–C28)
  10. `npx tsc --build tsconfig.build.json` y los tres archivos de prueba. (C25, C26, C27, C28)
- Impactos declarados: ninguno (sin sincronización, migración ni contenedores).
- Rollback (obligatorio): revertir el commit del ticket con `git revert <hash>`; los recibos escritos con `requestedEvaluator`/`evaluatorFailure` siguen siendo legibles porque los campos son opcionales, y el `stateHash` vuelve al cálculo anterior al quitar `archivos_citados`.

<!-- Los criterios de la sección siguiente se numeran C1…Cn, con una afirmación verificable por criterio
     —una frase con «y» son dos criterios—, y cada uno lleva debajo su anotación de
     verificación: un comentario HTML que dice «test:» y el comando, o «verify: manual». La
     sección no lleva comentarios dentro: un comentario con anotación se leería como la de un
     criterio. Ejemplo en la skill planificacion. -->
## Criterios de aceptación

- [x] C1. Con una raíz cuyo `.git` es un archivo «gitdir: …», `reviewBeforeGate` no devuelve el omitido «la raíz del proyecto no es un repositorio git».
      <!-- test: npx vitest run tests/revision-previa.test.ts -t "C1" -->
- [x] C2. Con una raíz cuyo `.git` es un archivo y un diagnóstico que cita una ruta inexistente, `reviewBeforeGate` devuelve un hallazgo `archivo_inexistente`.
      <!-- test: npx vitest run tests/revision-previa.test.ts -t "C2" -->
- [x] C3. Caso de control: con una raíz sin `.git`, `reviewBeforeGate` sigue devolviendo el omitido «la raíz del proyecto no es un repositorio git».
      <!-- test: npx vitest run tests/revision-previa.test.ts -t "C3" -->
- [x] C4. Caso de control: con `.git` como directorio y una ruta citada que existe, `reviewBeforeGate` no devuelve hallazgos de archivos.
      <!-- test: npx vitest run tests/revision-previa.test.ts -t "C4" -->
- [x] C5. Una cita «ruta:línea» con una línea mayor que el largo del archivo produce un hallazgo que nombra el número de líneas del archivo.
      <!-- test: npx vitest run tests/revision-previa.test.ts -t "C5" -->
- [x] C6. Caso de control: una cita «ruta:línea» con una línea dentro del archivo no produce hallazgo.
      <!-- test: npx vitest run tests/revision-previa.test.ts -t "C6" -->
- [x] C7. Una cita que empieza por «/» queda como omitido con su motivo y no como hallazgo.
      <!-- test: npx vitest run tests/revision-previa.test.ts -t "C7" -->
- [x] C8. Una cita que empieza por «../» queda como omitido con su motivo y no como hallazgo.
      <!-- test: npx vitest run tests/revision-previa.test.ts -t "C8" -->
- [x] C9. El check mecánico `archivos_existen` del recibo de análisis vale `pass` cuando todas las rutas citadas existen.
      <!-- test: npx vitest run tests/revision-previa.test.ts -t "C9" -->
- [x] C10. El check mecánico `archivos_existen` del recibo de análisis vale `skip` con su motivo cuando el diagnóstico no cita rutas.
      <!-- test: npx vitest run tests/revision-previa.test.ts -t "C10" -->
- [x] C11. El estado que recibe el evaluador en la compuerta de análisis incluye la lista de rutas citadas comprobadas en código.
      <!-- test: npx vitest run tests/revision-previa.test.ts -t "C11" -->
- [x] C12. Un resultado del CLI con `is_error: true`, sin `result` y con `subtype` «error_max_structured_output_retries» produce un mensaje que contiene «error_max_structured_output_retries».
      <!-- test: npx vitest run tests/claude-cli.test.ts -t "C12" -->
- [x] C13. Ese mismo resultado produce un mensaje que contiene el código de salida del proceso.
      <!-- test: npx vitest run tests/claude-cli.test.ts -t "C13" -->
- [x] C14. Un resultado con `is_error: true`, sin `result` y con stderr no vacío produce un mensaje que contiene los primeros 300 caracteres de stderr.
      <!-- test: npx vitest run tests/claude-cli.test.ts -t "C14" -->
- [x] C15. Un resultado con `is_error: true` y un arreglo `errors` no vacío produce un mensaje que contiene el primer elemento de `errors`.
      <!-- test: npx vitest run tests/claude-cli.test.ts -t "C15" -->
- [x] C16. Caso de control: un resultado con `is_error: true`, `api_error_status` 429 y texto conserva el código `RATE_LIMIT`.
      <!-- test: npx vitest run tests/claude-cli.test.ts -t "C16" -->
- [x] C17. El mensaje «sin detalle» solo aparece cuando el resultado no trae `result`, `subtype`, `errors` ni stderr.
      <!-- test: npx vitest run tests/claude-cli.test.ts -t "C17" -->
- [x] C18. Con una cascada cuyo productor lanza `error_max_structured_output_retries`, la compuerta escribe un recibo con `evaluator: jev`.
      <!-- test: npx vitest run tests/gate-cascade-fallo.test.ts -t "C18" -->
- [x] C19. En ese caso la cascada se llama exactamente una vez.
      <!-- test: npx vitest run tests/gate-cascade-fallo.test.ts -t "C19" -->
- [x] C20. En ese caso el evaluador por defecto se llama exactamente una vez.
      <!-- test: npx vitest run tests/gate-cascade-fallo.test.ts -t "C20" -->
- [x] C21. Ese recibo declara `requestedEvaluator: cascade`.
      <!-- test: npx vitest run tests/gate-cascade-fallo.test.ts -t "C21" -->
- [x] C22. El `evaluatorFailure.message` de ese recibo contiene «error_max_structured_output_retries».
      <!-- test: npx vitest run tests/gate-cascade-fallo.test.ts -t "C22" -->
- [x] C23. Caso de control: un fallo de código `AUTH` en la cascada no llama al evaluador por defecto.
      <!-- test: npx vitest run tests/gate-cascade-fallo.test.ts -t "C23" -->
- [x] C24. Caso de control: una cascada que responde escribe un recibo sin `requestedEvaluator` ni `evaluatorFailure`.
      <!-- test: npx vitest run tests/gate-cascade-fallo.test.ts -t "C24" -->
- [x] C25. El `stateHash` de un recibo degradado es igual al de la misma evaluación sin degradar.
      <!-- test: npx vitest run tests/gate-cascade-fallo.test.ts -t "C25" -->
- [x] C26. Las pruebas existentes de la revisión previa siguen pasando.
      <!-- test: npx vitest run tests/revision-previa.test.ts -->
- [x] C27. Las pruebas existentes del CLI de Claude siguen pasando.
      <!-- test: npx vitest run tests/claude-cli.test.ts -->
- [x] C28. El monorepo compila sin errores.
      <!-- test: npx tsc --build tsconfig.build.json -->

## Puntos

```json
[
  {
    "id": "POINT-001",
    "title": "Verificación de la entrega de IMPROVEMENT-GATE-PRECHECK-CITAS-WORKTREE-20261009",
    "status": "closed",
    "severity": "normal",
    "actual": "La implementación está entregada y falta verificar sus criterios.",
    "expected": "Los criterios del ticket se cumplen; lo que exige una corrida real queda declarado.",
    "evidence": [
      "EVIDENCE-001"
    ],
    "affected_files": [
      "packages/credentials/src/claude-cli.ts",
      "packages/engine/src/evaluators.ts",
      "packages/engine/src/gate.ts",
      "packages/engine/src/revision-previa.ts",
      "packages/gate/src/receipt.ts",
      "tests/claude-cli.test.ts",
      "tests/gate-cascade-fallo.test.ts",
      "tests/revision-previa.test.ts"
    ],
    "diagnosis": null,
    "solution": null,
    "tests": [],
    "qa_cycles": [
      "QA-001"
    ],
    "terminal_reason": null,
    "related_ticket": null
  }
]
```

## Implementación

- `packages/engine/src/revision-previa.ts`: `esRepositorio` acepta `.git` directorio o archivo con primera línea «gitdir:»; nuevo `citedFiles` (existe, no_existe, linea_fuera, omitida); `reviewBeforeGate` lo usa: línea fuera del archivo es `archivo_inexistente` con el largo, y las rutas con «/» o «../» van a omitidos con su motivo.
- `packages/engine/src/gate.ts`: en análisis y plan, el estado lleva `archivos_citados` (solo si hay citas) y los checks el mecánico `archivos_existen`; el recibo y el informe llevan el evaluador pedido y el error.
- `packages/credentials/src/claude-cli.ts`: el mensaje de un error sin `result` incluye subtype, terminal_reason, errors[0], stderr (300) y código de salida; `codigoDeError` no cambia.
- `packages/engine/src/evaluators.ts`: si la cascada falla con un código distinto de AUTH y CREDENTIAL_MISSING, corre `jev` (con su degradación) sin reintentar la cascada y devuelve `requestedEvaluator` y `evaluatorFailure`. Se hace en `runSemanticEnTandas` y no en `runSemantic`, para que una evaluación repartida en tandas no vuelva a llamar a la cascada por cada tanda.
- `packages/gate/src/receipt.ts`: campos opcionales `requestedEvaluator` y `evaluatorFailure`, fuera de `hashState` y `hashGate`.
- Pruebas: `tests/revision-previa.test.ts`, `tests/claude-cli.test.ts` y `tests/gate-cascade-fallo.test.ts` (nuevo).
- Desvío menor del plan: `archivos_existen` queda en `warn` (no `fail`) si hay citas que no resuelven, porque un `fail` cortaría con otro mensaje antes de la revisión previa; esta ya corta con el hallazgo.

## Pruebas

Directorio: raíz del repositorio (o del worktree).

- `npx vitest run tests/revision-previa.test.ts tests/claude-cli.test.ts tests/gate-cascade-fallo.test.ts` — esperado: 3 archivos, 90 pruebas pasan.
- `npx tsc --build tsconfig.build.json` — esperado: sin salida ni errores.
- Regresión de compuertas y recibos (33 archivos: gate-*, cascada-*, evaluators, cli, claude, receipts, umbrales, precision, aprobacion, process-gates, entre otros): 561 pruebas pasan.
- Validación manual (medida): `node packages/cli/dist/main.js precheck analysis --id FEATURE-WEB-MOTOR-ESCENA-20261008` desde el worktree ya no dice «no es un repositorio git»: da 2 hallazgos de citas relativas a la carpeta de la feature (`spec/s2-motor-escena/spec.md`, `spec/s3-mundos/spec.md`) y omite con motivo `../packages/server/web/agentes/motor.js` y `/agentes/motor.js`.
- Ambiente: Node 24, `npm install` hecho; sin red ni credenciales (los evaluadores van inyectados). El `valmen` global apunta al checkout principal; para probar este cambio usar `node packages/cli/dist/main.js` tras `npx tsc --build tsconfig.build.json`.
- No medido: el comportamiento con el CLI real de Claude Code (el error `error_max_structured_output_retries` se simuló con el error capturado el 2026-10-09).
- Resultado del PO: «entiendo que para cerrar esos dos toca una corrida pero aun no tengo ninguna podriamos cerrarlos como para dejar cerrado todo y ya cuando vaya a correr todo te si hay un error con esas dos yo te abro un bugfix» (2026-10-09).

## QA

```json
[
  {
    "id": "QA-001",
    "date": "2026-10-09",
    "build_reference": "commit:078c294419ec6a42e5b248bf6aa8bf2c1355f3cb",
    "environment": "macOS, Node 24, main; Mission Control del PO en 127.0.0.1:4175",
    "result": "pending",
    "findings": [],
    "correction": null,
    "po_confirmation": null
  },
  {
    "id": "QA-002",
    "date": "2026-10-09",
    "build_reference": null,
    "environment": null,
    "result": "approved",
    "findings": [],
    "correction": null,
    "po_confirmation": "«entiendo que para cerrar esos dos toca una corrida pero aun no tengo ninguna podriamos cerrarlos como para dejar cerrado todo y ya cuando vaya a correr todo te si hay un error con esas dos yo te abro un bugfix»"
  }
]
```

## Evidencia

```json
[
  {
    "id": "EVIDENCE-001",
    "date": "2026-10-09",
    "kind": "automated-test",
    "description": "Suite completa en verde tras integrar en main y comprobaciones manuales de la jornada",
    "reference": "worktree:sha256:3eef2f030f7a62ac633db85dece1ae753e8d99b5decdf63fd913558fbcb70f71",
    "point_id": "POINT-001"
  }
]
```

## Retests

```json
[
  {
    "id": "RETEST-001",
    "date": "2026-10-09",
    "point_id": "POINT-001",
    "result": "approved",
    "evidence": [],
    "po_confirmation": "«entiendo que para cerrar esos dos toca una corrida pero aun no tengo ninguna podriamos cerrarlos como para dejar cerrado todo y ya cuando vaya a correr todo te si hay un error con esas dos yo te abro un bugfix»"
  }
]
```

## Cierre

```json
[
  {
    "kind": "ticket-close",
    "id": "CLOSE-001",
    "date": "2026-10-09",
    "technical_summary": "El precheck reconoce worktrees (.git como archivo) y comprueba las citas ruta:línea; la cascada ya no reintenta, registra el error real del CLI y el evaluador pedido en el recibo y degrada al evaluador por defecto, salvo AUTH y CREDENTIAL_MISSING.",
    "functional_summary": "Los análisis y planes hechos desde un worktree ya no bajan por citas que no se comprobaron, y un fallo de la cascada deja su causa escrita en el recibo.",
    "qa_status": "approved",
    "qa_waiver_reason": null,
    "po_confirmation": null,
    "release_impact": "unreleased: entra con la feature vista-agentes"
  }
]
```

## Consumo de IA

```json
[
  {
    "kind": "ai-usage",
    "date": "2026-10-09",
    "session_reference": null,
    "model": "claude-sonnet-5-5",
    "reasoning_effort": null,
    "notes": "Fase de implementación en una sesión de subagente que no expone sus números; sin tokens ni coste para no inventarlos.",
    "input_tokens": null,
    "output_tokens": null,
    "total_tokens": null,
    "estimated_cost_usd": null,
    "source": "manual:subagente de implementación de la corrida orquestada (claude-sonnet-5-5), sin agregado de la sesión",
    "confidence": "low",
    "id": "CONSUMO-001"
  },
  {
    "kind": "ai-usage",
    "date": "2026-10-09",
    "session_reference": null,
    "model": null,
    "reasoning_effort": null,
    "notes": "Subagentes por fase; sin números por ticket.",
    "input_tokens": null,
    "output_tokens": null,
    "total_tokens": null,
    "estimated_cost_usd": null,
    "source": "manual:sesiones de Claude Code de la corrida orquestada vista-agentes",
    "confidence": "low",
    "id": "CONSUMO-002"
  },
  {
    "kind": "ai-usage",
    "date": "2026-10-09",
    "session_reference": "4f9b1b12-ced4-4132-9151-c3a025ede085",
    "model": null,
    "reasoning_effort": null,
    "notes": "Agente claude-code. Sesión **compartida**: trabajó 15 tickets (FEATURE-SERVER-SESION-PRINCIPAL-20261008 ×132, FEATURE-WEB-VISTA-LIENZO-20261008 ×121, FEATURE-WEB-MUNDO-PASTELERIA-20261008 ×119, FEATURE-WEB-MOTOR-ESCENA-20261008 ×118, IMPROVEMENT-WEB-VISTA-RENOMBRAR-AGENTES-20261008 ×107), así que su costo no se reparte y acá no se registran números. Costo completo de la sesión: no declarado por el proveedor, 6712613 tokens. Registralo en el ticket cuya sesión sea propia, o declaralo compartido donde corresponda. Sesión \"Feature vista-agentes\".",
    "input_tokens": null,
    "output_tokens": null,
    "total_tokens": null,
    "estimated_cost_usd": null,
    "source": "claude:4f9b1b12-ced4-4132-9151-c3a025ede085",
    "confidence": "high",
    "id": "CONSUMO-003"
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
    "date": "2026-10-08",
    "at": "2026-10-09T03:27:07.695Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-09",
    "at": "2026-10-09T05:07:02.953Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-09",
    "at": "2026-10-09T05:23:47.895Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-09",
    "at": "2026-10-09T05:29:08.436Z",
    "action": "gate-approved",
    "actor": "cli",
    "details": "Gate plan aprobado por PO (recibo GR-20261009-IMPROVEMENT-GATE-PRECHECK-CITAS-WORKTREE-20261009-plan-1, canal cli, decidida 2026-10-09T05:29:08.429Z): PO: \"A\" (respuesta a la pregunta «A) Aprobar el plan», con la REVIEW a la vista: corresponde_a_la_investigacion 0.72 y compatibilidad_hacia_atras 0.79)"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-09",
    "at": "2026-10-09T05:29:08.748Z",
    "action": "plan-approved",
    "actor": "cli",
    "details": "{\"actor\":\"PO\",\"source\":\"cli\",\"quote\":\"A\",\"planHash\":\"sha256:669ef785eaa74c5843406efae5dfc61ca980a28419b167617f24a6289c9028dc\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-09",
    "at": "2026-10-09T05:29:09.092Z",
    "action": "plan-approval-verified",
    "actor": "cli",
    "details": "Aprobación del plan vigente: PO (fuente cli), plan sha256:669ef785eaa74c5843406efae5dfc61ca980a28419b167617f24a6289c9028dc."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-09",
    "at": "2026-10-09T05:29:09.092Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-10-09",
    "at": "2026-10-09T05:29:32.970Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-10-09",
    "at": "2026-10-09T05:33:46.575Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-10-09",
    "at": "2026-10-09T05:34:34.942Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-10-09",
    "at": "2026-10-09T14:21:05.558Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-10-09",
    "at": "2026-10-09T14:21:05.912Z",
    "action": "point-added",
    "actor": "cli",
    "details": "Se agregó POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-10-09",
    "at": "2026-10-09T14:21:06.367Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-014",
    "date": "2026-10-09",
    "at": "2026-10-09T14:21:06.856Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-015",
    "date": "2026-10-09",
    "at": "2026-10-09T14:21:07.335Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-016",
    "date": "2026-10-09",
    "at": "2026-10-09T14:21:07.995Z",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-017",
    "date": "2026-10-09",
    "at": "2026-10-09T14:21:08.730Z",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-018",
    "date": "2026-10-09",
    "at": "2026-10-09T14:21:09.090Z",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-001 para POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-019",
    "date": "2026-10-09",
    "at": "2026-10-09T14:21:09.410Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: verified -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-020",
    "date": "2026-10-09",
    "at": "2026-10-09T14:21:09.750Z",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-021",
    "date": "2026-10-09",
    "at": "2026-10-09T14:21:10.258Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-022",
    "date": "2026-10-09",
    "at": "2026-10-09T14:21:10.819Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-002."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-023",
    "date": "2026-10-09",
    "at": "2026-10-09T14:21:12.798Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-003."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-024",
    "date": "2026-10-09",
    "at": "2026-10-09T14:21:13.117Z",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-025",
    "date": "2026-10-09",
    "at": "2026-10-09T14:21:13.510Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  }
]
```
