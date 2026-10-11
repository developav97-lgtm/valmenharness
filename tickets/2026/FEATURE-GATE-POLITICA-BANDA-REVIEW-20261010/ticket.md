---
schema_version: 2
id: FEATURE-GATE-POLITICA-BANDA-REVIEW-20261010
title: Un REVIEW exige una proposición bajo 0,80 o varias en la banda
type: FEATURE
module: GATE
workflow_status: closed
qa_status: approved
release_status: unreleased
user_visible: false
sync_impact: false
migration_impact: false
docker_impact: false
risk_level: normal
created: 2026-10-10
updated: 2026-10-11
related_ticket: null
target_release: null
released_in: null
---

# FEATURE-GATE-POLITICA-BANDA-REVIEW-20261010

## Solicitud original

Hoy decide() (packages/gate/src/decide.ts:442) da review si alguna proposición queda entre blockAt y approveAt (política por defecto 0,10 y 0,90, DEFAULT_POLICY en decide.ts:330). Medido el 2026-10-10 sobre 4 916 valores de los recibos cascade: el 8,2 % cae en 0,85 a 0,90 aunque el motivo del propio modelo diga que el criterio está cubierto, y por debajo de 0,85 hay solo un 3 %; en la jornada JOR-20261010 lo flojo de verdad apareció por debajo de 0,80 (C17 en 0,12 y C7 en 0,75 del recorte, C13 y C14 en 0,00 de Codex) y los REVIEW con mínimo entre 0,80 y 0,90 se aprobaron todos sin cambios (110 de 110 en el registro). Se pide una política de banda opcional por compuerta: REVIEW solo si alguna proposición queda bajo un piso (propuesto 0,80) o si 3 o más quedan entre ese piso y approveAt; el resto aprueba. Condiciones: (1) un gate no amplía su propia autoridad: el cambio de umbral lo firma una persona en la configuración (gate-thresholds con approved-by y reason), nunca el agente, y sin firma todo queda como hoy; (2) el plan incluye una repetición determinista de los recibos del registro (.valmen/receipts/*.jsonl) que lista, antes y después, qué decisiones cambiarían, con el caso control de un recibo con una proposición en 0,12 que debe seguir dando review o block; (3) calibrar_compuerta hoy se niega a proponer porque hay 25 decisiones humanas y 0 rechazos y exige 20 y 5: la repetición de recibos es la evidencia alternativa, y el ticket debe decirlo. Decisión del PO del 2026-10-10: «Política de banda con repetición de recibos».

### Supuestos y decisiones pendientes

<!-- Si el pedido nombra algo que el código no tiene —parámetro, permiso,
campo, bandera, columna, migración— y no lo especifica, listá cada elemento
con su pregunta antes de avanzar a análisis; el análisis no planifica sobre
la adivinanza. Si no hay ninguno, escribí «Ninguno» y seguí. -->
Ninguno.

## Descripción funcional

- Alcance: una **política de banda de revisión** opcional por compuerta (`analysis`, `plan`) que cambia cuándo `decide()` devuelve `review` en lugar de `approve`. Se activa solo con una entrada de `gate-thresholds` firmada por una persona (`approved-by` y `reason`); sin esa firma la compuerta decide exactamente como hoy. No toca `qa-mechanical` ni `code-review`, no toca los umbrales `approveAt`/`blockAt` ni el veto de `block`.
- Usuario o rol afectado: el PO, que hoy recibe un REVIEW por cada proposición entre 0,10 y 0,90 aunque el motivo del modelo diga que el criterio está cubierto; el orquestador, que con autorización de aprobación vigente solo puede aprobar un plan cuyo recibo dio `approve`.
- Comportamiento actual: una sola proposición con veredicto entre `blockAt` y `approveAt` (0,10–0,90, `DEFAULT_POLICY`) manda la compuerta entera a `review`, sea 0,12 o 0,895.
- Comportamiento esperado: con la política firmada para la compuerta, una proposición en la banda solo exige revisión si (a) su valor queda bajo el **piso** firmado (propuesto 0,80), (b) es **crítica** —estructural o decidida en código—, o (c) hay **3 o más** proposiciones en la banda; si no se cumple ninguna, la compuerta aprueba y el recibo dice que aprobó **por la banda firmada**, con quién la firmó. Lo que hoy es `block` sigue siendo `block`; lo que hoy es `approve` sigue siendo `approve`.

## Diagnóstico

- Causa comprobada (con `ruta:línea`):
  - `packages/gate/src/decide.ts:500-509`: tras el veto de bloqueo, `decide()` filtra **toda** proposición con veredicto e `inBand` y, si hay una sola, devuelve `review`. No existe ningún criterio de cuántas ni de cuán lejos de `approveAt` están.
  - `packages/gate/src/decide.ts:657-669` (`evaluateNoul`): todo valor estrictamente entre `blockAt` y `approveAt` queda `inBand: true` con efecto `review`; 0,12 y 0,895 reciben el mismo trato.
  - `packages/gate/src/decide.ts:330`: `DEFAULT_POLICY = { approveAt: 0.9, blockAt: 0.1 }`, y `packages/gate/src/definitions.ts:46` (plan) y `:210` (analysis) la usan.
  - Repetición determinista medida hoy (sin modelo) sobre `.valmen/receipts/*.jsonl`: 263 recibos únicos `cascade` de `analysis` y `plan` (por `id`, el último anexo gana: lleva la `humanDecision`). Antes: analysis 93 approve / 20 review / 1 block; plan 81 approve / 46 review / 22 block. Con piso 0,80, máximo 3 en banda y críticas exigiendo `approveAt`: analysis 94 / 19 / 1; plan 95 / 32 / 22. **15 recibos pasan de `review` a `approve`, ninguno cambia desde ni hacia `block`.** De esos 15, 11 los aprobó una persona sin cambio y 4 no tienen decisión humana (el agente corrigió el plan y volvió a correr).
  - Excluyendo los tickets SECURITY (ver riesgos), cambian 13 (9 aprobados por persona, 4 sin decisión humana): analysis 93 / 20 / 1, plan 94 / 33 / 22.
  - Comprobación a mano de 5 recibos que cambian:
    1. `GR-20261008-FEATURE-ENGINE-ORQUESTACION-INTERACTIVA-20261007-plan-1` (C7 = 0,874): sin persona; el plan cambió y `plan-2` dio `block` por C18 = 0,045, pero C18 es un criterio **añadido** después de `plan-1` (`plan-1` tenía 17 criterios, `plan-2` 18); `plan-3` lo aprobó la persona. El bloqueo no revela un hueco de `plan-1`.
    2. `GR-20261008-FEATURE-MC-VISTA-MODELOS-EFECTIVOS-20261007-plan-1` (C23 = 0,874, contraste en tema claro): el agente reescribió el paso y `plan-2` aprobó; el motivo del modelo ya decía que el paso 10(a) lo comprobaba.
    3. `GR-20261009-IMPROVEMENT-ENGINE-CONTEXTO-ORQUESTADOR-20261009-plan-1` (C5 = 0,895, C11 = 0,825): el plan cambió y `plan-2` aprobó; C11 decía «exclusión implícita, no explícita», un hueco de forma.
    4. `GR-20261011-SECURITY-CLI-PROYECCION-DENEGADOS-20261010-analysis-1` (diagnóstico = 0,895): la persona aprobó **con una condición nueva** («que el plan cubra los dos límites»): es el único caso del conjunto donde la revisión humana añadió alcance; con la banda habría aprobado sin esa frase. El `plan-1` del mismo ticket (C24 = 0,895) lo aprobó la persona sin cambios.
    5. `GR-20261009-BUGFIX-GATE-CASCADA-SALIDA-ESTRUCTURADA-20261009-plan-1` (C2 = C6 = 0,895): sin persona; la siguiente corrida degradó a `jev` y la persona aprobó con la frase «justo en el umbral; forma, no contenido».
  - REVIEW históricos con alguna proposición bajo 0,80: **16**, y los 16 siguen en `review` con la política. Qué pasó después: 7 se corrigieron (el estado cambió y volvió a correr: CHORE-CLI-RETIRO-DISPARADOR plan-2, IMPROVEMENT-WEB-VISTA-RENOMBRAR-AGENTES plan-1 ×2, FEATURE-WEB-MUNDO-PASTELERIA plan-2, IMPROVEMENT-ENGINE-CONSUMO-SUBAGENTES plan-1, BUGFIX-GATE-STATEHASH plan-1, IMPROVEMENT-SKILLS-RECORTE-TOPE plan-1 con C7 = 0,75 y C17 = 0,12); 6 los aprobó una persona sin cambio (MARCO-RESPONSIVO plan-2, MUNDO-PASTELERIA plan-3, PRECHECK-CITAS plan-1, PANTALLA-AUTORIZACIONES plan-2, APROBAR-Y-CERRAR plan-2, RECORTE-TOPE plan-2); 3 no tienen corrida `cascade` posterior (VISTA-LIENZO plan-1 con C20 = 0,12, SERVER-TEXTO-PREGUNTA plan-1, CONSUMO-SUBAGENTES plan-3 con C14 = 0,12).
  - Casos de control: `RECORTE-TOPE plan-1` (C7 = 0,75, C17 = 0,12) y `VISTA-LIENZO plan-1` (C20 = 0,12) siguen en `review`; `SECURITY-ADAPTER-DENEGADOS-CODEX-OPENCODE plan-1` y `plan-2` (C13 = C14 = 0,00) siguen en `block`; su `analysis-1` sigue en `review` porque `causa_especifica` (crítica) quedó en 0,895 y la clasificación no aprobó; su `plan-3` sigue en `review` con 7 en banda.
  - Los 18 REVIEW sin ninguna proposición en banda (13 por bloqueo aislado degradado de `diagnostico_explica_el_sintoma`, 5 por `clasificacion` sin `completa`) no cambian: la política solo mira la banda.
- Hipótesis pendientes:
  - Que la política no deje pasar un plan malo **no se puede probar** con este registro: `calibrar_compuerta` con `umbrales` se niega a proponer (`packages/engine/src/umbrales-propuestos.ts:23-25` y `:111`: hacen falta 20 decisiones humanas y 5 rechazos; hay 25 y 0). La repetición demuestra qué decisiones cambian y que ninguna sube desde `block`; **no** demuestra que las 13–15 aprobaciones nuevas fueran correctas, porque la única señal es que una persona aprobó, y una aprobación no es evidencia de que el plan no tuviera un hueco que nadie vio. El caso 4 es contraevidencia parcial. Por eso la política exige revisión posterior medida (ver plan) y queda desactivada por defecto.
  - El piso 0,80 y el máximo 3 salen de este registro de 263 recibos de un solo proyecto y de dos semanas; son una propuesta para que la persona la firme, no un valor calibrado.
- Consumidores afectados:
  - `packages/engine/src/gate.ts:898-911`: lee `gateThresholds`, aplica `applyThresholds` y llama a `decide`; es quien pasará la banda firmada y la registrará en el recibo; `:1121-1130` imprime los umbrales aplicados y los ignorados.
  - `packages/engine/src/thresholds.ts:72-110` (`applyThresholds`): el único lugar que filtra entradas firmadas (`:81`) y las ignora sin firma (`:82-89`); la banda reutiliza esa misma regla, sin abrir otra vía.
  - `packages/adapter/src/config.ts:355-421` (`readGateThresholds`): valida las claves permitidas (`:365-373`) y rechaza cualquier otra; la banda añade claves aquí.
  - `packages/engine/src/discovery.ts:248-253` (`gateThresholds`): sin cambio de forma.
  - `packages/engine/src/approval-eligibility.ts:182-186`: un recibo en `review` impide la aprobación por autorización; con la banda, un `approve` por banda **sí** la habilita. Es el efecto real sobre la autoridad; SECURITY ya queda fuera (`:117-123`).
  - `packages/engine/src/simulate.ts:224-229` y `packages/engine/src/code-review.ts:638`: llaman a `decide` sin banda y siguen igual (el parámetro es opcional).
  - `packages/server/src/politicas.ts:223-250`: resume las entradas de `gate-thresholds` en la pantalla de políticas; mostrará la banda si la entrada la trae.
  - `packages/gate/src/receipt.ts:138-145,220` (`AppliedThreshold`, `thresholds`): el recibo guarda los umbrales aplicados; la banda se guarda con un campo aditivo.
  - `packages/engine/src/precision.ts:140`, `usage.ts:177`, `value.ts:151`: cuentan `outcome`; leen el nuevo `approve` como cualquier otro y no cambian.
- Archivos y flujo investigados: `valmen gate <id> --evaluator cascade` → `packages/engine/src/gate.ts:898` (umbrales firmados) → `packages/engine/src/thresholds.ts:72` → `packages/gate/src/decide.ts:442` (`decide`: veto de bloqueo `:474-498`, contradicción aislada `:476-488` con `packages/gate/src/definitions.ts:214-224`, banda `:500-509`, efectos no aprobatorios `:512-523`) → recibo (`packages/gate/src/receipt.ts:147`) → elegibilidad de aprobación (`packages/engine/src/approval-eligibility.ts:182`). Proposiciones críticas: las decididas en código (`decidedInCode`, `packages/gate/src/definitions.ts:94,109,137,180` y los criterios manuales en `packages/gate/src/dynamic.ts:651`), las estructurales del análisis (`requiredApprovedIds` en `definitions.ts:219-223`) y las de impacto (`*_impact_*`, `packages/engine/src/thresholds.ts:39`).
- Riesgos y compatibilidad:
  - **Autoridad**: relajar cuándo una compuerta pide a una persona es relajar un control; un gate no amplía su propia autoridad. Mitigación: desactivada por defecto, solo con firma humana en `gate-thresholds` (la misma regla de `thresholds.ts:81`), el motor no escribe `approved-by`, el piso no puede quedar en o bajo `blockAt` ni en o sobre `approveAt`, y la banda nunca toca el veto de `block`. Este plan lo aprueba una persona aunque la compuerta apruebe.
  - **SECURITY e impactos**: el caso 4 muestra que en un SECURITY la revisión humana añadió alcance. La banda no se aplica a tickets SECURITY ni a los que declaran impacto de sincronización, migración o contenedores.
  - **Compatibilidad**: sin la entrada firmada, `decide()` produce el mismo resultado byte a byte que hoy; los recibos viejos no se reescriben (append-only) y el campo nuevo es opcional. `hashGate` (`receipt.ts:411`) no cambia porque no se tocan las definiciones de las compuertas.
  - **Medición**: sin rechazos humanos no hay medida de falso aprobado; la revisión posterior por informe es la única forma de detectar si la política aprueba planes que después vuelven a `changes_requested`.
- Impactos de sync, migración, Docker o despliegue: ninguno; cambio de motor local y de configuración opcional del propio harness, sin migración de datos ni contenedores.

## Plan

- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan), el 2026-10-11 con «si apruebo tal cual»; el REVIEW del recibo plan-1 (criterio_04 en 0,90) lo decidió el PO. Este plan lo aprueba siempre una persona: cambia cuándo una compuerta pide a una persona.
- Alcance: política de banda opcional para `analysis` con `plan`, desactivada por defecto, con su repetición de recibos y su informe de revisión posterior. Fuera de alcance: `qa-mechanical`, `code-review`, cambiar `DEFAULT_POLICY`, tocar `GateDefinition` (no cambia `hashGate`), firmar una banda, `simulate.ts` (sigue sin banda: simula la política por defecto).
- Diseño:
  - Configuración: dos claves nuevas en una entrada de `gate-thresholds` **sin** `proposition`: `review-floor` (número; `block-at` < piso < `approve-at`) con `review-band-max` (entero ≥ 2; por defecto 3). Una entrada sin `approved-by` o sin `reason` no aplica ni sus umbrales ni su banda, igual que hoy (`packages/engine/src/thresholds.ts:81`).
  - Decisión: `decide()` recibe un quinto parámetro opcional `reviewBand?: ReviewBand` (`floor`, `maxInBand`, `critical: readonly string[]`). Solo actúa en el paso de la banda (`decide.ts:500-509`): si ninguna proposición en banda queda bajo `floor`, ninguna es crítica, ni hay `maxInBand` o más, devuelve `approve` con `toleratedInBand` (lista de ids) y un motivo que dice «aprobado por la banda firmada». El veto de `block`, la contradicción aislada con los efectos `review` de elección o escala no cambian. Sin `reviewBand`, el resultado es idéntico al actual.
  - Críticas: proposiciones `decidedInCode`, las `requiredApprovedIds` de `isolatedBlockReview` de la compuerta (`causa_especifica`, `nombra_archivos_reales`, `riesgos_cubren_impactos`) con las `*_impact_*`. Las calcula el motor, no el modelo.
  - Exclusiones: el motor no pasa la banda si el ticket es SECURITY o declara `sync_impact`, `migration_impact` o `docker_impact` en `true`; el recibo lo dice.
  - Evidencia: repetición determinista sobre recibos (`aplicarBanda` pura, la misma que usa `decide`), con muestra fija versionada; informe de revisión posterior por tickets aprobados por banda.
- Tamaño previsto: 20 criterios; unas 330 líneas de producción con unas 300 de pruebas (≈ 630, dentro de 300–700). Si la implementación pasa de 700, se parte: (A) C1–C14 política, recibo con salida; (B) C15–C19 repetición con informe.
- Pasos ordenados:
  1. `packages/adapter/src/config.ts:328-421`: añadir `reviewFloor: number | null` con `reviewBandMax: number | null` a `ThresholdOverride`; aceptar `review-floor` con `review-band-max` en `permitidas` (`:365-373`); rechazar `review-floor` cuando la entrada nombra `proposition`; rechazar un piso que no quede estrictamente entre `block-at` con `approve-at`; rechazar un máximo no entero o menor que 2 (C1, C2, C3).
  2. `packages/gate/src/decide.ts`: exportar `interface ReviewBand` con la función pura `aplicarBanda(evaluated, band)` que devuelve `{ tolerated, motivo } | null`; añadir el parámetro opcional `reviewBand` a `decide` (`:442`) usado solo en el bloque `:500-509`; añadir `toleratedInBand?: readonly string[]` a `GateDecision` (`:380-389`). Exportar desde `packages/gate/src/index.ts` (C5, C6, C7, C8, C9).
  3. `packages/engine/src/thresholds.ts`: nueva `bandaFirmada(overrides, gateId, evaluatorId, ticket)` que elige la entrada firmada de compuerta con `reviewFloor`, devuelve `null` sin firma, para SECURITY o con impactos (`fields.type`, `sync_impact`, `migration_impact`, `docker_impact`), con la nota de por qué no se aplicó; `criticas(gate, propositions)` arma la lista de críticas (C4, C8, C10, C11).
  4. `packages/engine/src/gate.ts:898-911`: pasar la banda a `decide`; `:1121-1130`: imprimir «Banda de revisión: piso X, máximo N — firmada por P: motivo» con las proposiciones toleradas cuando aprueba por ella (C13).
  5. `packages/gate/src/receipt.ts:138-145,220`: campo opcional aditivo `reviewBand?: { floor, maxInBand, approvedBy, reason, tolerated }` en `GateReceipt`; `receiptVersion` no sube; `packages/engine/src/gate.ts` lo rellena (C12).
  6. `packages/server/src/politicas.ts:244-252`: el resumen de una entrada con banda añade «revisión solo bajo X o con N en banda» (C14).
  7. `packages/engine/src/banda-revision.ts` (nuevo): `repetirConBanda(receipts, band)` —filtra `cascade` de `analysis`/`plan`, deduplica por `id` (el último anexo gana), aplica `aplicarBanda` a los `propositions` guardados, devuelve conteo antes, conteo después con la lista de cambios— e `informeRevisionPosterior(paths, receipts)` —tickets con un recibo `approve` que trae `reviewBand.tolerated` no vacío, cuántos llegaron a `awaiting_user_tests`, cuántos volvieron a `changes_requested` (eventos del ticket), con «evidencia insuficiente» mientras haya menos de 10 entregas bajo la banda— (C16, C17, C18, C19).
  8. `packages/cli/src/commands.ts:409` (`thresholdsCommand`) con `packages/cli/src/command-table.ts:338`: `valmen thresholds <gate> --band [--floor 0.80] [--max 3]` imprime la repetición sobre `readCurrentReceipts` con el informe posterior; actualizar `USAGE` en `packages/cli/src/main.ts:254` (C15).
  9. Pruebas: `tests/gate-banda-revision.test.ts` con **una prueba parametrizada por regla** (`it.each`): configuración (C1–C3), firma (C4), decisión con banda (C5–C9, una tabla de vectores con veredicto esperado), exclusiones (C10, C11), recibo con salida (C12, C13). `tests/gate-banda-repeticion.test.ts` sobre `tests/fixtures/recibos-banda.jsonl`: muestra fija copiada **con shell** (`grep` por id desde `.valmen/receipts/*.jsonl`, sin pasar bytes por el modelo) de los 15 recibos que cambian, los 16 con alguna proposición bajo 0,80, los 2 `block` de SECURITY-ADAPTER-DENEGADOS-CODEX-OPENCODE con 5 `approve`; comprueba conteos antes/después, cero cambios desde ni hacia `block`, la lista exacta de cambios, el control `GR-20261009-FEATURE-WEB-VISTA-LIENZO-20261008-plan-1` (C20 = 0,12) en `review` (C15–C19). Ampliar `tests/politicas-autonomas.test.ts` con una entrada con banda (C14).
  10. `node scripts/exports-sin-uso.mjs`: cada export nuevo (`ReviewBand`, `aplicarBanda`, `bandaFirmada`, `repetirConBanda`, `informeRevisionPosterior`) tiene un consumidor fuera de su módulo o de las pruebas; si el script lo marca, se quita el `export` (C20).
- Pruebas existentes que el cambio pone en rojo a propósito (EST-009): ninguna prevista. Ninguna prueba fija la lista de claves de `gate-thresholds` ni la firma de `decide`; las llamadas de `simulate.ts:224` con `code-review.ts:638` siguen compilando porque el parámetro es opcional. Si al implementar alguna cae, solo se admite este cambio mínimo: `tests/precision-y-umbrales.test.ts` o `tests/umbrales-por-evaluador.test.ts` añaden `reviewFloor: null, reviewBandMax: null` al `ThresholdOverride` literal que construyan; `tests/cli-tabla-comandos.test.ts` acepta `--band`, `--floor`, `--max` en la tabla de `thresholds`. Cualquier otra prueba en rojo detiene la implementación.
- Qué demuestra la repetición de recibos: qué decisiones históricas cambiarían (15, o 13 sin SECURITY), que ninguna sale de `block` ni entra en él, que los 16 REVIEW con una proposición bajo 0,80 siguen en `review`, con los controles en 0,12 / 0,75 / 0,00. Qué **no** demuestra: que la política no apruebe un plan malo. Con 0 rechazos humanos (`calibrar_compuerta --umbrales` pide 20 decisiones con 5 rechazos) una aprobación humana no prueba la ausencia de un hueco, y el caso SECURITY-CLI-PROYECCION-DENEGADOS `analysis-1` muestra una revisión humana que añadió alcance. Por eso la política queda apagada por defecto, con exclusiones, con el informe del paso 7.
- Revisión posterior propuesta: tras activarla, `valmen thresholds plan --band` se corre al cerrar cada jornada; con 10 entregas bajo la banda, una sola vuelta a `changes_requested` atribuible a un criterio tolerado es motivo para que la persona retire la firma.
- Impactos declarados: ninguno (sin sincronización, migración ni contenedores).
- Rollback (obligatorio): operativo, quitar `review-floor` de la entrada firmada en `.valmen/config.yaml` (o la entrada entera) devuelve la decisión de hoy sin desplegar nada; de código, revertir el commit del ticket. Los recibos emitidos con `reviewBand` siguen siendo válidos porque el campo es opcional.

<!-- Los criterios de la sección siguiente se numeran C1…Cn, con una afirmación verificable por criterio
     —una frase con «y» son dos criterios—, y cada uno lleva debajo su anotación de
     verificación: un comentario HTML que dice «test:» y el comando, o «verify: manual». La
     sección no lleva comentarios dentro: un comentario con anotación se leería como la de un
     criterio. Ejemplo en la skill planificacion. -->
## Criterios de aceptación

- [x] C1. `readGateThresholds` acepta `review-floor` con `review-band-max` en una entrada de compuerta.
      <!-- test: npx vitest run tests/gate-banda-revision.test.ts -->
- [x] C2. `readGateThresholds` rechaza `review-floor` en una entrada que nombra una proposición.
      <!-- test: npx vitest run tests/gate-banda-revision.test.ts -->
- [x] C3. `readGateThresholds` rechaza un `review-floor` fuera del intervalo abierto entre `block-at` con `approve-at`.
      <!-- test: npx vitest run tests/gate-banda-revision.test.ts -->
- [x] C4. Una entrada de banda sin firma completa deja la decisión igual a la de hoy.
      <!-- test: npx vitest run tests/gate-banda-revision.test.ts -->
- [x] C5. Con la banda firmada, una sola proposición en 0,85 aprueba la compuerta.
      <!-- test: npx vitest run tests/gate-banda-revision.test.ts -->
- [x] C6. Con la banda firmada, una proposición bajo el piso manda la compuerta a `review`.
      <!-- test: npx vitest run tests/gate-banda-revision.test.ts -->
- [x] C7. Con la banda firmada, tres proposiciones sobre el piso pero bajo `approveAt` mandan la compuerta a `review`.
      <!-- test: npx vitest run tests/gate-banda-revision.test.ts -->
- [x] C8. Con la banda firmada, una proposición crítica bajo `approveAt` manda la compuerta a `review`.
      <!-- test: npx vitest run tests/gate-banda-revision.test.ts -->
- [x] C9. Con la banda firmada, una proposición en `blockAt` sigue dando `block`.
      <!-- test: npx vitest run tests/gate-banda-revision.test.ts -->
- [x] C10. La banda no se aplica a un ticket SECURITY.
      <!-- test: npx vitest run tests/gate-banda-revision.test.ts -->
- [x] C11. La banda no se aplica a un ticket con algún impacto declarado en su frontmatter.
      <!-- test: npx vitest run tests/gate-banda-revision.test.ts -->
- [x] C12. El recibo de una aprobación por banda guarda la banda aplicada con su firma.
      <!-- test: npx vitest run tests/gate-banda-revision.test.ts -->
- [x] C13. La salida de `valmen gate` nombra a quien firmó la banda cuando la compuerta aprueba por ella.
      <!-- test: npx vitest run tests/gate-banda-revision.test.ts -->
- [x] C14. La pantalla de políticas muestra el piso firmado de una entrada con banda.
      <!-- test: npx vitest run tests/politicas-autonomas.test.ts -->
- [x] C15. `valmen thresholds plan --band` muestra el conteo de veredictos antes del cambio junto al conteo después.
      <!-- test: npx vitest run tests/gate-banda-repeticion.test.ts -->
- [x] C16. La repetición de la muestra fija no cambia ningún recibo desde `block` ni hacia `block`.
      <!-- test: npx vitest run tests/gate-banda-repeticion.test.ts -->
- [x] C17. La repetición de la muestra fija lista los recibos que pasan de `review` a `approve`.
      <!-- test: npx vitest run tests/gate-banda-repeticion.test.ts -->
- [x] C18. En la repetición, el recibo de control con una proposición en 0,12 sigue en `review`.
      <!-- test: npx vitest run tests/gate-banda-repeticion.test.ts -->
- [x] C19. El informe de revisión posterior cuenta los tickets aprobados por banda que volvieron a `changes_requested`.
      <!-- test: npx vitest run tests/gate-banda-repeticion.test.ts -->
- [x] C20. El script de exportaciones sin uso termina sin hallazgos nuevos.
      <!-- test: node scripts/exports-sin-uso.mjs -->

## Puntos

```json
[
  {
    "id": "POINT-001",
    "title": "Verificación delegada de FEATURE-GATE-POLITICA-BANDA-REVIEW-20261010",
    "status": "closed",
    "severity": "normal",
    "actual": "La implementación está entregada y falta verificar sus criterios.",
    "expected": "Los criterios del ticket se cumplen y sus pruebas dan el resultado esperado.",
    "evidence": [
      "EVIDENCE-001"
    ],
    "affected_files": [
      "packages/adapter/src/config.ts",
      "packages/cli/src/commands.ts",
      "packages/engine/src/banda-revision.ts",
      "packages/engine/src/gate.ts",
      "packages/engine/src/thresholds.ts",
      "packages/gate/src/decide.ts",
      "packages/gate/src/receipt.ts",
      "tests/gate-banda-revision.test.ts",
      "tests/gate-banda-repeticion.test.ts"
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

Hecha en modo flujo completo, con pruebas primero (observadas en rojo antes de implementar: `tests/gate-banda-revision.test.ts`, `tests/gate-banda-repeticion.test.ts` y la ampliación de `tests/politicas-autonomas.test.ts`). Ninguna prueba existente cayó; no se editó ninguna.

- `packages/adapter/src/config.ts`: `ThresholdOverride` gana `reviewFloor` y `reviewBandMax`; `review-floor` (estrictamente entre `block-at` y `approve-at`, no con `proposition`) y `review-band-max` (entero >= 2, por defecto 3, requiere piso).
- `packages/gate/src/decide.ts`: `ReviewBand`, `aplicarBanda` (pura) y quinto parámetro opcional de `decide`; `GateDecision.toleratedInBand`. Sin banda el resultado es el de siempre; el veto de `block` no se toca.
- `packages/gate/src/receipt.ts`: campo aditivo `reviewBand` en el recibo (`receiptVersion` no sube).
- `packages/engine/src/thresholds.ts`: `bandaFirmada` (solo con `approved-by` y `reason`; no a SECURITY ni a `sync_impact`, `migration_impact`, `docker_impact`, con nota en el recibo) y `criticas`.
- `packages/engine/src/gate.ts`: pasa la banda a `decide`, la guarda en el recibo y la nombra en la salida («Banda de revisión: ... firmada por P»).
- `packages/server/src/politicas.ts`: el resumen muestra «revisión solo bajo X o con N en banda».
- `packages/engine/src/banda-revision.ts` (nuevo): `repetirConBanda` e informe de revisión posterior; `valmen thresholds <gate> --band [--floor] [--max]` (`packages/cli/src/commands.ts`, `command-table.ts`, `main.ts`).
- `tests/fixtures/recibos-banda.jsonl`: muestra fija de 52 líneas copiada con `grep -F` desde `.valmen/receipts/*.jsonl` (ids elegidos por una repetición independiente de solo lectura).

Evidencia alternativa a `calibrar_compuerta`: la repetición de recibos dice qué decisiones cambiarían (con la muestra actual, `valmen thresholds plan --band`: 16 recibos pasan de review a approve, ninguno desde ni hacia block, 1 de SECURITY queda fuera) y los controles con una proposición en 0,12 siguen en review. No demuestra que la política no apruebe un plan malo: hay 25 decisiones humanas y 0 rechazos frente a las 20 y 5 que pide `calibrar_compuerta`.

No se firmó ninguna banda: la política sigue apagada hasta que una persona firme una entrada en `.valmen/config.yaml`.

## Pruebas

Directorio: raíz del repositorio (o del worktree).

- `npx vitest run tests/gate-banda-revision.test.ts tests/gate-banda-repeticion.test.ts tests/politicas-autonomas.test.ts` — esperado: 43 pruebas en verde (configuración C1-C3, decisión C4-C9, motor C10-C13, pantalla C14, repetición C15-C19).
- `node scripts/exports-sin-uso.mjs` — esperado: «Sin exportaciones nuevas sin consumidor» (C20).
- `npx tsc --noEmit -p .`, `npx eslint` y `npx prettier --check` de lo tocado — sin hallazgos.
- Regresión (no se editaron): `npx vitest run tests/umbrales-por-evaluador.test.ts tests/precision-y-umbrales.test.ts tests/cli-tabla-comandos.test.ts tests/gate-decide.test.ts` — 588 pruebas en 33 archivos de gate/umbrales/code-review en verde.
- Validación manual (opcional): `valmen thresholds plan --band` muestra Antes/Después y la lista de cambios; añadir a `.valmen/config.yaml` una entrada con `review-floor: 0.8`, `approved-by` y `reason` y correr una compuerta de plan.
- Ambiente: Node 24, `npm run build` previo para el CLI. Sin servicios.

Resultado de la ejecución local: ver arriba; la validación del responsable queda pendiente.

- Resultado del PO: necesito que todos los tickets que puedas cerrar tu ejecutando pruebas lo hagas. Las pruebas del ticket las ejecutó el agente y dieron el resultado esperado: Suite completa en main tras integrar: 259 archivos y 5009 pruebas en verde; 588 pruebas de gate y umbrales, tsc, eslint, prettier y secrets limpios en el worktree; qa-mechanical approve

## QA

```json
[
  {
    "id": "QA-001",
    "date": "2026-10-11",
    "build_reference": "commit:aa63b4026ab1a5f7ceb749a14e112187d85cc027",
    "environment": "local",
    "result": "pending",
    "findings": [],
    "correction": null,
    "po_confirmation": null
  },
  {
    "id": "QA-002",
    "date": "2026-10-11",
    "build_reference": null,
    "environment": null,
    "result": "approved",
    "findings": [],
    "correction": null,
    "po_confirmation": "necesito que todos los tickets que puedas cerrar tu ejecutando pruebas lo hagas"
  }
]
```

## Evidencia

```json
[
  {
    "id": "EVIDENCE-001",
    "date": "2026-10-11",
    "kind": "automated-test",
    "description": "Suite completa en main tras integrar: 259 archivos y 5009 pruebas en verde; 588 pruebas de gate y umbrales, tsc, eslint, prettier y secrets limpios en el worktree; qa-mechanical approve",
    "reference": "worktree:sha256:5950b10161ff621b9932a0424a45e9303d656c73a9eab119d3d580febf3ec1dd",
    "point_id": "POINT-001"
  }
]
```

## Retests

```json
[
  {
    "id": "RETEST-001",
    "date": "2026-10-11",
    "point_id": "POINT-001",
    "result": "approved",
    "evidence": [],
    "po_confirmation": "necesito que todos los tickets que puedas cerrar tu ejecutando pruebas lo hagas"
  }
]
```

## Cierre

```json
[
  {
    "kind": "ticket-close",
    "id": "CLOSE-001",
    "date": "2026-10-11",
    "technical_summary": "Política de banda opcional para analysis y plan, apagada por defecto, con repetición de recibos e informe posterior; ver ## Implementación",
    "functional_summary": "Un REVIEW exige una proposición bajo el piso o varias en la banda, solo con firma del PO; no aplica a SECURITY ni a impactos",
    "qa_status": "approved",
    "qa_waiver_reason": null,
    "po_confirmation": null,
    "release_impact": "Sin impacto en producción; no se firmó ninguna banda"
  }
]
```

## Consumo de IA

```json
[
  {
    "kind": "ai-usage",
    "date": "2026-10-11",
    "session_reference": null,
    "model": null,
    "reasoning_effort": null,
    "notes": "Sesión de subagente sonnet que no expone números; sin estimación.",
    "input_tokens": null,
    "output_tokens": null,
    "total_tokens": null,
    "estimated_cost_usd": null,
    "source": "manual:subagente de implementación sin agregado de sesión",
    "confidence": "low",
    "id": "CONSUMO-001"
  },
  {
    "kind": "ai-usage",
    "date": "2026-10-11",
    "session_reference": "c2769fcf-63f8-4baf-a5d3-a4b9b7a976b8/agent-a2856549056353498",
    "model": "anthropic/claude-opus-5-5",
    "reasoning_effort": null,
    "notes": "Agente claude-code. 10 intervención(es) sobre el registro, 0 con fallo. 10 de 52 mensajes tocaron el registro. Subagente de la sesión c2769fcf-63f8-4baf-a5d3-a4b9b7a976b8; su gasto no está en la madre. Duró 10 min. La entrada incluye la creación de caché y la salida incluye el razonamiento. Caché leída 6152582 tokens. Sesión \"Sesión de Claude Code\". Costo: suscripción; no es cero, el origen no declara un costo por token. Se registran los tokens.",
    "input_tokens": 128701,
    "output_tokens": 36244,
    "total_tokens": 164945,
    "estimated_cost_usd": null,
    "source": "claude:c2769fcf-63f8-4baf-a5d3-a4b9b7a976b8/agent-a2856549056353498",
    "confidence": "high",
    "id": "CONSUMO-002"
  },
  {
    "kind": "ai-usage",
    "date": "2026-10-11",
    "session_reference": "fc8a0427-7309-4f1b-b302-cbed18478b68/agent-a2856549056353498",
    "model": "anthropic/claude-opus-5-5",
    "reasoning_effort": null,
    "notes": "Agente claude-code. 10 intervención(es) sobre el registro, 0 con fallo. 10 de 52 mensajes tocaron el registro. Subagente de la sesión fc8a0427-7309-4f1b-b302-cbed18478b68; su gasto no está en la madre. Duró 10 min. La entrada incluye la creación de caché y la salida incluye el razonamiento. Caché leída 6152582 tokens. Sesión \"Sesión de Claude Code\". Costo: suscripción; no es cero, el origen no declara un costo por token. Se registran los tokens.",
    "input_tokens": 128701,
    "output_tokens": 36244,
    "total_tokens": 164945,
    "estimated_cost_usd": null,
    "source": "claude:fc8a0427-7309-4f1b-b302-cbed18478b68/agent-a2856549056353498",
    "confidence": "high",
    "id": "CONSUMO-003"
  },
  {
    "kind": "ai-usage",
    "date": "2026-10-11",
    "session_reference": "c2769fcf-63f8-4baf-a5d3-a4b9b7a976b8/agent-a10fb4d43d9810b58",
    "model": "anthropic/claude-sonnet-5-5",
    "reasoning_effort": null,
    "notes": "Agente claude-code. 8 intervención(es) sobre el registro, 0 con fallo. 8 de 52 mensajes tocaron el registro. Subagente de la sesión c2769fcf-63f8-4baf-a5d3-a4b9b7a976b8; su gasto no está en la madre. Duró 8 min. La entrada incluye la creación de caché y la salida incluye el razonamiento. Caché leída 6981400 tokens. Sesión \"Sesión de Claude Code\". Costo: suscripción; no es cero, el origen no declara un costo por token. Se registran los tokens.",
    "input_tokens": 176982,
    "output_tokens": 46112,
    "total_tokens": 223094,
    "estimated_cost_usd": null,
    "source": "claude:c2769fcf-63f8-4baf-a5d3-a4b9b7a976b8/agent-a10fb4d43d9810b58",
    "confidence": "high",
    "id": "CONSUMO-004"
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
    "date": "2026-10-10",
    "at": "2026-10-11T04:20:49.228Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-11",
    "at": "2026-10-11T06:51:18.811Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-11",
    "at": "2026-10-11T06:54:48.386Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-11",
    "at": "2026-10-11T19:04:28.045Z",
    "action": "gate-approved",
    "actor": "cli",
    "details": "Gate plan aprobado por PO (recibo GR-20261011-FEATURE-GATE-POLITICA-BANDA-REVIEW-20261010-plan-1, canal cli, decidida 2026-10-11T19:04:28.041Z): si apruebo tal cual"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-11",
    "at": "2026-10-11T19:04:28.438Z",
    "action": "plan-approved",
    "actor": "cli",
    "details": "{\"actor\":\"PO\",\"source\":\"cli\",\"quote\":\"si apruebo tal cual\",\"planHash\":\"sha256:1fdbce322d0ecfc02e8f5025be5ad6ca9abd5c70edc3bcb52778374c980e7fac\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-11",
    "at": "2026-10-11T19:04:32.657Z",
    "action": "plan-approval-verified",
    "actor": "cli",
    "details": "Aprobación del plan vigente: PO (fuente cli), plan sha256:1fdbce322d0ecfc02e8f5025be5ad6ca9abd5c70edc3bcb52778374c980e7fac."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-11",
    "at": "2026-10-11T19:04:32.657Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-10-11",
    "at": "2026-10-11T19:04:33.075Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-10-11",
    "at": "2026-10-11T19:12:40.786Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-10-11",
    "at": "2026-10-11T19:12:41.313Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-10-11",
    "at": "2026-10-11T19:16:00.814Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-002."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-10-11",
    "at": "2026-10-11T19:16:01.281Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-003."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-10-11",
    "at": "2026-10-11T19:16:02.174Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-004."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-014",
    "date": "2026-10-11",
    "at": "2026-10-11T19:16:02.585Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-015",
    "date": "2026-10-11",
    "at": "2026-10-11T19:16:02.957Z",
    "action": "point-added",
    "actor": "cli",
    "details": "Se agregó POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-016",
    "date": "2026-10-11",
    "at": "2026-10-11T19:16:03.229Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-017",
    "date": "2026-10-11",
    "at": "2026-10-11T19:16:03.465Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-018",
    "date": "2026-10-11",
    "at": "2026-10-11T19:16:03.685Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-019",
    "date": "2026-10-11",
    "at": "2026-10-11T19:16:04.193Z",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-020",
    "date": "2026-10-11",
    "at": "2026-10-11T19:16:04.792Z",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-021",
    "date": "2026-10-11",
    "at": "2026-10-11T19:16:05.161Z",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-001 para POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-022",
    "date": "2026-10-11",
    "at": "2026-10-11T19:16:05.452Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: verified -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-023",
    "date": "2026-10-11",
    "at": "2026-10-11T19:16:05.788Z",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-024",
    "date": "2026-10-11",
    "at": "2026-10-11T19:16:06.543Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-025",
    "date": "2026-10-11",
    "at": "2026-10-11T19:16:06.878Z",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-026",
    "date": "2026-10-11",
    "at": "2026-10-11T19:16:07.225Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  }
]
```
