---
schema_version: 2
id: DOCS-ENGINE-CASCADA-VERIFICADA-20260926
title: Documentar el patrón de cascada verificada
type: DOCS
module: ENGINE
workflow_status: closed
qa_status: approved
release_status: unreleased
user_visible: true
sync_impact: false
migration_impact: false
docker_impact: false
risk_level: normal
created: 2026-09-26
updated: 2026-09-27
related_ticket: null
target_release: null
released_in: null
---

# DOCS-ENGINE-CASCADA-VERIFICADA-20260926

## Solicitud original

Parte del sprint: Reducir el costo de contexto y habilitar el enrutado y la consulta segura.
- R-S1-002: Cascada verificada — El sistema DEBE documentar y habilitar el patrón de cascada: un modelo barato
Viene de una feature descompuesta en sprints; su plan completo está en el tickets.yaml de la feature.

## Descripción funcional

- Alcance: documentar el patrón de cascada verificada en la referencia del harness
  —qué modelo produce, cómo se verifica su respuesta contra el contexto, cuándo se
  escala y cómo queda el motivo del escalamiento en el recibo del gate (R-S1-002)—.
  Queda fuera la aplicación de la cascada a la clasificación de tickets y a la
  exploración, que es el ticket `IMPROVEMENT-ENGINE-CASCADA-VERIFICADA-20260926`.
- Usuario o rol afectado: quien elige el evaluador de una compuerta —por
  `--evaluator cascade` o desde Mission Control—, quien configura los tres roles de
  la cadena en `.valmen/routing.yaml`, y quien audita un recibo para saber por qué
  se pagó el modelo caro.
- Visibilidad: el entregable es texto que la persona lee, así que `user_visible`
  pasa a `true` — el campo declara lo que quien usa el sistema ve, y acá lo que se
  agrega es, precisamente, lo que va a leer.
- Comportamiento actual: la cascada existe y corre —`cascade` está en
  `EVALUATOR_IDS` (`packages/engine/src/evaluators.ts:41-56`) y `runCascade`
  (`:397-507`) hace los tres pasos—, pero no está en la referencia: el capítulo de
  evaluadores se titula «Los cuatro evaluadores» y su tabla enumera `command`,
  `jev`, `llm-judge` y `mcp` (`docs/03-GATES.md:250-283`), la ayuda del CLI ofrece
  `--evaluator auto (por defecto) · command · jev · llm-judge`
  (`packages/cli/src/main.ts:155`), la línea del comando en el manual dice lo mismo
  (`docs/02-MOTOR.md:495`) y el ejemplo del recibo no tiene el campo `escalations`
  (`docs/03-GATES.md:741-809`). Las únicas menciones de «cascada» en `docs/` son el
  informe de la auditoría y el catálogo de funcionalidades propuestas, que todavía
  la presenta como algo por construir (`docs/12-FUNCIONALIDADES-PROXIMAS.md:303-338`).
- Comportamiento esperado: la referencia describe el patrón con sus tres roles, la
  verificación contra el mismo estado congelado, el umbral que dispara el
  escalamiento y los dos casos en que la cadena se rechaza; el recibo documenta
  `escalations` con el motivo por proposición; y las dos superficies que enumeran
  evaluadores declaran `cascade`. La prosa queda atada al código por una prueba,
  para que el próximo rol o el próximo campo del recibo no la dejen vieja en
  silencio.

## Diagnóstico

- Síntoma: R-S1-002 pide documentar el patrón de cascada verificada —qué modelo
  produce, cómo se verifica su respuesta contra el contexto, cuándo se escala y
  cómo queda el motivo del escalamiento en el recibo—, y el harness no lo tiene
  documentado: quien busca esa explicación en la referencia no la encuentra en
  ningún documento. La carencia se ve en dos lugares concretos: el capítulo de
  evaluadores enumera cuatro y `cascade` no está entre ellos, y un recibo con
  escalamientos trae un campo —`escalations`— que ninguna página describe, así que
  quien lo lee no tiene dónde averiguar por qué se pagó el modelo caro. Lo que
  falta no es el mecanismo —está implementado y probado— sino el texto que lo
  explica y la atadura que impide que se desactualice.

- Archivos y flujo investigados:
  - `packages/engine/src/evaluators.ts` — el patrón: `EvaluatorId` y
    `EVALUATOR_IDS` (:41-56; una sola lista para los tres bordes), `CascadeOptions`
    (:77-85, con `threshold` y el `reason` que resuelve el routing), la exigencia
    previa `exigirCadena` (:296-310), `runCascade` (:397-507, los tres pasos),
    `verificacionId` (:510-512), `preguntaDeVerificacion` (:522-547, la proposición
    que se le hace al verificador) y la rama de `cascade` en `explainChoice`
    (:578-584).
  - `packages/adapter/src/routing.ts` — de dónde salen los modelos: los roles
    `producer` (:110), `verifier` (:115) y `escalation` (:120) con su consumidor,
    `CascadeStep` (:604-613), `CascadeRouting` (:628-633), `cascadeRoutingFor`
    (:636-660) y `motivoDeCadenaInutil` (:663-700), con sus dos rechazos.
  - `packages/gate/src/receipt.ts` — dónde queda el motivo: `escalations` en
    `GateReceipt` (:101-109), `EscalationModel` (:113-116), `EscalationRecord`
    (:118-140), su inclusión en `buildReceipt` (:238-240) y el resumen del recibo
    (:268-274), que lo marca aparte de la escalada a una persona.
  - `packages/engine/src/gate.ts` — el camino y el informe: `cascade` en las
    opciones (:103), los escalamientos al recibo (:449), la etiqueta del evaluador
    (:474-478) y el bloque «Escalamiento (cascada verificada)» del informe
    (:516-530).
  - `packages/cli/src/main.ts` — el borde que la resuelve: la línea de ayuda de
    `--evaluator` (:155) y la cadena que se resuelve al pedirla (:1477).
  - `docs/03-GATES.md` §4 (:250-287, con su tabla :278-283) y §7, el recibo
    (:741-809); `docs/02-MOTOR.md` §9, la referencia de comandos (:494-496). Las
    dos listas de evaluadores de `docs/` están escritas a mano en la prosa.
  - `tests/cascada-verificada.test.ts` — lo que ya está probado del mecanismo (8
    casos, con los dos evaluadores inyectados): es la guarda que la documentación
    tiene que describir, no reemplazar.

- Causa raíz o hipótesis: el mecanismo entró por el ticket
  `FEATURE-ENGINE-ROLES-ENRUTAMIENTO-20260926` (commit `aa8512b`, que es también el
  que trajo `tests/cascada-verificada.test.ts`) y su explicación quedó en los
  comentarios del código —`runCascade` describe los tres pasos en su encabezado
  (`evaluators.ts:377-396`) y `EscalationRecord` explica por qué el motivo es por
  proposición (`receipt.ts:118-126`)—, mientras la referencia, que es lo que lee
  quien no va a abrir el motor, quedó escrita cuando el harness tenía cuatro
  evaluadores (`docs/03-GATES.md` no se toca desde el commit `1607e9a`, anterior a
  la cascada). La causa no es una omisión de contenido sino de forma: las tres
  superficies que enumeran evaluadores se escriben a mano —la tabla del capítulo
  (`docs/03-GATES.md:278-283`), la ayuda del CLI (`packages/cli/src/main.ts:155`) y
  la línea del manual (`docs/02-MOTOR.md:495`)—, así que un evaluador nuevo no
  aparece por construcción; y ninguna prueba lee `docs/` como contenido, así que la
  deriva no tiene quién la detecte.

- Riesgos y compatibilidad: el cambio es de texto y no lo lee ningún ejecutable
  —ni el motor, ni el CLI, ni el servidor—, así que no puede alterar el veredicto
  de una compuerta. Otros consumidores de las dos superficies que se tocan: el
  capítulo `docs/03-GATES.md` lo leen las personas que eligen evaluador, y
  `README.md` lo enlaza como el documento del gate automático; la línea de ayuda de
  `--evaluator` la imprime `valmen help` (`packages/cli/src/main.ts:997`) y
  `tests/cli.test.ts:197-211` recorre las banderas con valor de toda la ayuda
  exigiendo que cada una esté declarada en `VALUE_OPTIONS` — el cambio agrega texto
  a la descripción de una bandera ya declarada, no una bandera nueva, así que no
  puede romper esa comprobación. Ninguna de las dos se lee en tiempo de ejecución:
  `cascade` ya se admite desde `EVALUATOR_IDS` (`evaluators.ts:50-61`), así que la
  ayuda documentaba menos de lo que el comando acepta. La prueba nueva lee archivos
  desde la raíz del repositorio, como `tests/skills-publicadas.test.ts`, y usa los
  dos evaluadores inyectados, así que no sale a la red ni toca el registro. Un
  documento largo no se rompe por reeditarse: la prueba afirma la presencia de los
  nombres y los campos, no una redacción.

- Impactos de sync, migración, Docker o despliegue: ninguno — `valmen sync` proyecta
  `.valmen/` a `AGENTS.md` y a los archivos de cada runtime y no lee `docs/`
  (`packages/cli/src/commands.ts:596-655`), el cambio no toca el esquema del
  registro ni de ningún ticket, este repositorio no tiene contenedores ni base de
  datos, y el alcance no incluye despliegue: la autorización vigente no cubre
  commit, push, tag ni release.

## Plan

- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan).
- Aprobación **delegada**: el PO, Juan Andrade, el 2026-09-26 dio la potestad en sus
  palabras —«si el plan pasa la compuerta y te parece que el plan cumple tienes la
  potestad de aprobar»—. La compuerta `plan` se corrió sobre este plan y salió
  `APPROVE` (media 0.925; las 6 proposiciones de criterio entre 0.95 y 0.98, y las
  ocho descriptivas en contexto), así que la aprobación la firma esta sesión en su
  nombre, no el PO de puño y letra. Recibo:
  `.valmen/receipts/DOCS-ENGINE-CASCADA-VERIFICADA-20260926.jsonl`.
- Decisiones:
  1. **El patrón se documenta en el capítulo de compuertas, no en un documento
     nuevo.** La cascada es un evaluador —`EvaluatorId`
     (`packages/engine/src/evaluators.ts:41`)— y su lugar es el capítulo que los
     enumera y describe (§4 de `docs/03-GATES.md`, :250-287), con el recibo en §7
     (:741-809). Alternativa descartada: un documento
     `docs/16-CASCADA-VERIFICADA.md` propio; se descarta porque §4 seguiría
     afirmando que hay cuatro evaluadores mientras el quinto vive en otro archivo, y
     porque el índice de `README.md` no lo alcanzaría sin agregar otra entrada.
     Costo de la alternativa: dos lugares que hay que leer para entender un
     evaluador, y una lista que ya nació incompleta.
  2. **La prosa se ata al código con una prueba de contrato, no con una
     comprobación a ojo.** `tests/docs-cascada-verificada.test.ts` (nuevo) lee
     `docs/03-GATES.md`, `docs/02-MOTOR.md` y la ayuda del CLI contra las fuentes
     que ya son la verdad: `EVALUATOR_IDS` (`evaluators.ts:50-56`), los roles cuyo
     consumidor es la cascada (`packages/adapter/src/routing.ts:109-124`) y los
     campos que el motor escribe en un escalamiento
     (`packages/gate/src/receipt.ts:118-140`, medidos con una corrida real y los dos
     evaluadores inyectados). Alternativa descartada: criterios `verify: manual`
     para todo; se descarta porque un ticket de sólo prosa deja a `qa-mechanical`
     sin nada que correr y la lista vuelve a quedar vieja en el próximo rol o el
     próximo campo sin que nadie lo note. Costo de la alternativa: seis
     afirmaciones que nadie comprueba.
  3. **La ayuda del CLI entra en el alcance.** Es la superficie donde alguien busca
     el evaluador, y hoy declara menos de lo que el comando acepta: `cascade` se
     admite desde `EVALUATOR_IDS` (`evaluators.ts:59-61`) y la línea de
     `--evaluator` (`packages/cli/src/main.ts:155`) no lo nombra. Alternativa
     descartada: dejarlo como hallazgo aparte; se descarta porque es la misma
     carencia que este ticket documenta, en la superficie que se consulta primero, y
     corregirla es agregar texto a una línea que ya existe. Costo de la alternativa:
     la ayuda sigue diciendo que hay cuatro evaluadores.
  4. **El catálogo de funcionalidades propuestas no se toca.**
     `docs/12-FUNCIONALIDADES-PROXIMAS.md` §B2 (:303-338) describe la cascada como
     algo por construir, y ya no lo es; pero ese documento es el catálogo de
     propuestas priorizadas del diseño original, no la referencia, y corregirlo pide
     decidir qué significa una propuesta cuyo ítem ya se implementó. Eso es una
     decisión del PO y queda declarado en `## Pruebas` como deriva conocida.
     Alternativa descartada: marcarlo como implementado en este pase; se descarta
     por ser alcance que nadie pidió.

- Pasos ordenados:
  1. `tests/docs-cascada-verificada.test.ts` (nuevo) — el contrato, escrito primero
     y en rojo: cada evaluador de `EVALUATOR_IDS`
     (`packages/engine/src/evaluators.ts:50-56`) tiene que aparecer en
     `docs/03-GATES.md`; cada rol cuyo consumidor es la cascada
     (`packages/adapter/src/routing.ts:109-124`) tiene que estar nombrado; el bloque
     JSON de escalamiento que la referencia publica tiene que llevar exactamente los
     campos del registro real (`packages/gate/src/receipt.ts:118-140`, obtenido con
     `evaluateGate` y los dos evaluadores inyectados); `USAGE`
     (`packages/cli/src/main.ts:99`) tiene que declarar `cascade` en su línea de
     `--evaluator`; y `docs/02-MOTOR.md` (:495) tiene que declararlo también.
  2. `docs/03-GATES.md` §4 (:250-287) — el título pasa a «Los cinco evaluadores», la
     tabla (:278-283) gana la fila de `cascade` y entra la subsección del patrón: los
     tres pasos con la `ruta:línea` de cada uno (`runCascade` :397-507 y
     `preguntaDeVerificacion` :522-547), los tres roles y su resolución
     (`cascadeRoutingFor`), el umbral (`CascadeOptions.threshold` :77-85, que cae al
     de la política de la compuerta), el bloque JSON del escalamiento y los dos rechazos
     de `motivoDeCadenaInutil` (`packages/adapter/src/routing.ts:663-700`).
  3. `docs/03-GATES.md` §7 (:741-809) — el campo `escalations` entra en el ejemplo
     del recibo y en la lista de lo que el recibo no negocia, con el motivo por
     proposición.
  4. `docs/02-MOTOR.md` §9 (:495) — la línea de `valmen gate --evaluator` declara
     `cascade`.
  5. `packages/cli/src/main.ts:155` — la descripción de `--evaluator` dentro de
     `USAGE` declara `cascade`. Una línea de texto impreso, sin condición: el motor
     ya lo admite por `EVALUATOR_IDS`.
  6. Correr `npx vitest run tests/docs-cascada-verificada.test.ts` hasta el verde y,
     antes de entregar, la suite completa `npx vitest run`.

- Rollback: `git checkout -- docs/03-GATES.md docs/02-MOTOR.md packages/cli/src/main.ts`
  y `rm tests/docs-cascada-verificada.test.ts`. Nada del registro depende del cambio:
  ningún ejecutable lee `docs/`, `cascade` se admite por `EVALUATOR_IDS` antes y
  después, y la suite vuelve a su línea base porque el archivo de prueba es lo único
  que afirma lo nuevo.

## Criterios de aceptación

- [ ] `docs/03-GATES.md` documenta el patrón de la cascada verificada: el rol `producer` produce, el rol `verifier` comprueba cada respuesta contra el mismo estado y sólo lo que no queda respaldado se vuelve a preguntar al rol `escalation`.
      <!-- test: npx vitest run tests/docs-cascada-verificada.test.ts -->
- [ ] El capítulo de evaluadores de `docs/03-GATES.md` nombra todos los que el motor declara en `EVALUATOR_IDS` —`command`, `jev`, `llm-judge` y `cascade`— sin que ninguno quede fuera de la referencia.
      <!-- test: npx vitest run tests/docs-cascada-verificada.test.ts -->
- [ ] `docs/03-GATES.md` documenta cuándo se escala —lo que el verificador no respaldó por debajo del umbral de la cadena, que es el de la política del gate si la cadena no declara otro— y los dos casos en que la cadena se rechaza.
      <!-- test: npx vitest run tests/docs-cascada-verificada.test.ts -->
- [ ] `docs/03-GATES.md` documenta el escalamiento en el recibo con un ejemplo que lleva los mismos campos que el motor escribe: `role`, `proposition`, `from`, `to`, `verified`, `threshold` y `reason`.
      <!-- test: npx vitest run tests/docs-cascada-verificada.test.ts -->
- [ ] La ayuda del CLI declara `cascade` entre los evaluadores admitidos en `--evaluator`.
      <!-- test: npx vitest run tests/docs-cascada-verificada.test.ts -->
- [ ] La referencia de comandos de `docs/02-MOTOR.md` declara `cascade` en la línea de `valmen gate --evaluator`.
      <!-- test: npx vitest run tests/docs-cascada-verificada.test.ts -->

## Puntos

```json
[]
```

## Implementación

Escrito por esta sesión (no hubo ejecutor: este repositorio lo trabaja la sesión que atiende
el ticket, y no se lanzó ninguna sesión de OpenCode sobre este árbol).

- `docs/03-GATES.md` — §4 pasa a «Los cinco evaluadores» y su tabla gana la fila de
  `cascade`; la subsección nueva §4.1 («La cascada verificada») documenta los tres pasos con
  la `ruta:línea` de cada uno, los tres roles y su resolución por el routing, el umbral que
  dispara el escalamiento —el de la cadena o, si no declara ninguno, el de la política—, el
  bloque JSON del escalamiento con sus campos, el consumo sumado de los tres pasos y los dos
  casos en que la cadena se rechaza antes de gastar una llamada. §7, el recibo, gana
  `escalations` en el ejemplo y en la lista de campos, con la distinción frente a
  `escalatedTo: "human"`.
- `docs/02-MOTOR.md` — la línea del comando `valmen gate` en §9 declara `cascade` entre los
  evaluadores de `--evaluator`.
- `packages/cli/src/main.ts` — la descripción de `--evaluator` dentro de `USAGE` (:155)
  declara `cascade`. Una línea de texto impreso: el motor ya lo admitía por `EVALUATOR_IDS`
  (`packages/engine/src/evaluators.ts:50-61`) desde el ticket
  `FEATURE-ENGINE-ROLES-ENRUTAMIENTO-20260926`, así que la ayuda documentaba menos de lo que
  el comando acepta.
- `tests/docs-cascada-verificada.test.ts` (nuevo, 5 casos) — el contrato de documentación: la
  referencia nombra cada evaluador de `EVALUATOR_IDS` —menos `auto`, que es el enrutado y no
  un evaluador—, los tres roles que el routing declara con `valmen gate --evaluator cascade`
  como consumidor, y los campos de un escalamiento real, escrito por el motor con los dos
  evaluadores inyectados y sin salir a la red; y las dos superficies que enumeran
  evaluadores —la ayuda del CLI y la referencia de comandos— los declaran todos.
- Desvío declarado del paso 6: además del archivo enfocado y la suite completa se corrieron
  `tests/cli.test.ts` —el cambio toca `USAGE`, que esa prueba recorre buscando banderas con
  valor— y `npm run typecheck`.
- No se tocaron `.valmen/routing.yaml` —modificado en el árbol por la sesión anterior, ajeno
  a este ticket— ni el registro de ningún otro ticket. Las dos derivas que se encontraron se
  declaran en `## Pruebas` y no se corrigen por ser alcance que nadie pidió.

## Pruebas

- Comandos del contrato, corridos por esta sesión desde la raíz del repositorio, sobre el
  árbol de trabajo de este ticket (los tests corren contra `src` por alias del
  `vitest.config.ts`; `dist/` está ignorado por git y no vale como fuente):
  - `npx vitest run tests/docs-cascada-verificada.test.ts` → 1 archivo, 5 pruebas, todas pasan.
  - `npx vitest run tests/cli.test.ts` → 1 archivo, 20 pruebas, todas pasan.
  - `npx vitest run` → **1456 pasan, 48 omitidas, 0 fallan** (72 archivos en verde, 1 omitido).
  - Línea base del mismo árbol y sin el archivo de este ticket
    (`npx vitest run --exclude '**/docs-cascada-verificada.test.ts'`): 1451 pasan, 48
    omitidas, 0 fallan. La diferencia son exactamente las 5 pruebas nuevas, y no hay ningún
    rojo nuevo ni ninguna prueba que haya dejado de correr.
  - `npm run typecheck` (build y `tsc --noEmit`) → termina sin errores.
- El borde real, después de `npm run build`: `node packages/cli/dist/main.js --help` imprime
  `--evaluator <id>      auto (por defecto) · command · jev · llm-judge · cascade`.
- Estado del árbol: `git rev-parse HEAD` = `ea2e8e0` (rama `main`), con los cuatro archivos
  del cambio sin commitear —la autorización vigente no incluye commit, push, tag ni
  despliegue—. Archivo ajeno que estaba modificado al empezar y sigue intacto:
  `.valmen/routing.yaml`.
- Derivas encontradas, declaradas y **no** corregidas por estar fuera del alcance:
  - `docs/12-FUNCIONALIDADES-PROXIMAS.md` §B2 (:303-338) presenta la cascada como una
    funcionalidad propuesta, y ya está implementada. Se deja como está porque ese documento
    es el catálogo de propuestas priorizadas del diseño, no la referencia, y decidir qué
    significa un ítem que ya se implementó es del PO.
  - `docs/03-GATES.md` §7 (:746-799) documenta un `gateVersion` y un `stateRef` que el motor
    no escribe: `GateReceipt` (`packages/gate/src/receipt.ts:65-110`) tiene `gateHash` y
    `stateHash`, y el estado no se guarda comprimido en ningún `stateRef`. Es anterior a este
    ticket y corregirlo abre alcance.
- Resultado del PO: aprobación **DELEGADA** por Juan Andrade el 2026-09-26, con sus palabras
  —«si las pruebas que ejecutes pasan correctamente como yo ejecutaria las mismas pasa como
  aprobado el QA y cierras»—. Esta sesión corrió el contrato de pruebas completo —el archivo
  enfocado del ticket, la suite entera con su línea base y el borde real con el binario—
  sobre el árbol del ticket y todo pasa, así que el QA se aprueba por esa delegación y no por
  una confirmación suya de hoy; no se le atribuye ninguna frase que no haya escrito.

## QA

```json
[
  {
    "id": "QA-001",
    "date": "2026-09-27",
    "build_reference": "worktree:sha256:422bfa862e08f8b753600fc9ca8514d3ec445cf5570aaeec3e81a38edb4c8405",
    "environment": "local: arbol de trabajo de la sesion, rama main, sin commit",
    "result": "pending",
    "findings": [],
    "correction": null,
    "po_confirmation": null
  },
  {
    "id": "QA-002",
    "date": "2026-09-27",
    "build_reference": null,
    "environment": null,
    "result": "approved",
    "findings": [],
    "correction": null,
    "po_confirmation": "Aprobacion DELEGADA por el PO Juan Andrade el 2026-09-26, sus palabras: si las pruebas que ejecutes pasan correctamente como yo ejecutaria las mismas pasa como aprobado el QA y cierras. El QA lo aprobo esta sesion en su nombre, sobre el arbol de trabajo del ticket: el contrato de pruebas pasa completo, el archivo enfocado con 5 pruebas y la suite entera con 1456 pasan, 48 omitidas, 0 fallan, y la compuerta qa-mechanical aprobo los 6 criterios."
  }
]
```

## Evidencia

```json
[
  {
    "id": "EVIDENCE-001",
    "date": "2026-09-27",
    "kind": "automated-test",
    "description": "Contrato de pruebas del ticket, corrido por el verificador desde la raiz del repositorio: el archivo enfocado tests/docs-cascada-verificada.test.ts en verde con 5 pruebas (primero en rojo: las 5 fallaban antes de escribir la documentacion), tests/cli.test.ts con 20 pruebas, y la suite completa npx vitest run con 1456 pasan, 48 omitidas y 0 fallan contra la linea base medida sobre el mismo arbol sin el archivo del ticket (1451 pasan, 48 omitidas, 0 fallan); la diferencia son las 5 pruebas nuevas. Ademas npm run typecheck termina sin errores y el borde real node packages/cli/dist/main.js --help declara cascade. Archivos del cambio en orden alfabetico: docs/02-MOTOR.md, docs/03-GATES.md, packages/cli/src/main.ts y tests/docs-cascada-verificada.test.ts. El texto lo escribio la sesion, sin ejecutor de OpenCode.",
    "reference": "worktree:sha256:422bfa862e08f8b753600fc9ca8514d3ec445cf5570aaeec3e81a38edb4c8405",
    "point_id": null
  }
]
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
    "date": "2026-09-27",
    "technical_summary": "La referencia del harness documenta el patron de cascada verificada (R-S1-002). docs/03-GATES.md: el capitulo de evaluadores pasa a cinco y su tabla gana cascade; nueva seccion 4.1 con los tres pasos y su ruta:linea (runCascade, preguntaDeVerificacion), los tres roles que declara el routing (producer, verifier, escalation), el umbral que dispara el escalamiento —el de la cadena o el de la politica del gate— y los dos rechazos de cascadeRoutingFor antes de gastar una llamada; el apartado del recibo gana el campo escalations en el ejemplo y en la lista de campos, con su distincion frente a escalatedTo. docs/02-MOTOR.md declara cascade en la linea de valmen gate --evaluator, y la ayuda del CLI (packages/cli/src/main.ts:155) tambien. Nuevo tests/docs-cascada-verificada.test.ts con 5 casos, que lee la prosa contra EVALUATOR_IDS, contra los roles con consumidor de la cascada y contra los campos de un escalamiento real escrito por el motor con los dos evaluadores inyectados. Sin commit, push, PR, tag ni despliegue: la autorizacion vigente no los incluye.",
    "functional_summary": "Quien lee la referencia del harness encuentra el patron de cascada verificado completo: que modelo produce, como se verifica su respuesta contra el contexto, cuando se escala y donde queda el motivo de cada escalamiento en el recibo del gate. La ayuda del comando y el manual dejan de enumerar cuatro evaluadores cuando el motor admite cinco, y la prosa queda atada al codigo por una prueba, asi que el proximo rol o el proximo campo del recibo no la dejan vieja en silencio.",
    "qa_status": "approved",
    "qa_waiver_reason": null,
    "po_confirmation": null,
    "release_impact": "ninguna: el ticket queda unreleased, sin release asociada"
  }
]
```

## Consumo de IA

```json
[
  {
    "kind": "ai-usage",
    "date": "2026-09-27",
    "session_reference": "cron_90c19742c582_20260927_143024",
    "model": "deepseek-v4.1-flash",
    "reasoning_effort": null,
    "notes": "Sesion de cron (perfil valmen-harness) que trabajo el ticket entera: analisis, compuertas analysis y plan, plan, implementacion del texto, verificacion, QA y cierre. Es el eslabon 2 de los tres que el PO dejo programados el 2026-09-26, y no hubo ejecutor de OpenCode sobre este arbol: el texto lo escribio esta sesion. Lectura hecha al momento de registrar el consumo, con el turno todavia en curso: la fila de la sesion sigue creciendo hasta que este turno termina, asi que estos numeros son un piso y no la medicion final (desvio declarado). El proveedor factura por suscripcion, asi que no se declara coste por token: la fila del state.db informa 0.0 y no se escribe como cero.",
    "input_tokens": 632669,
    "output_tokens": 79801,
    "total_tokens": 766709,
    "estimated_cost_usd": null,
    "source": "hermes:/Users/juanandrade/.hermes/profiles/valmen-harness/state.db",
    "confidence": "high",
    "id": "CONSUMO-001"
  },
  {
    "kind": "ai-usage",
    "date": "2026-09-27",
    "session_reference": "cron_5f21330118ab_20260927_114709",
    "model": null,
    "reasoning_effort": null,
    "notes": "Agente hermes:cron. Sesión **compartida**: trabajó 3 tickets (FEATURE-ENGINE-ROLES-ENRUTAMIENTO-20260926 ×341, DOCS-ENGINE-CASCADA-VERIFICADA-20260926 ×27, BUGFIX-POS-NO-EXISTE-20260101 ×16), así que su costo no se reparte y acá no se registran números. Costo completo de la sesión: no declarado por el proveedor, 2326530 tokens. Registralo en el ticket cuya sesión sea propia, o declaralo compartido donde corresponda. Sesión \"harness-S1-eslabon-1-roles-enrutamiento · Sep 27 12:41\".",
    "input_tokens": null,
    "output_tokens": null,
    "total_tokens": null,
    "estimated_cost_usd": null,
    "source": "hermes:/Users/juanandrade/.hermes/profiles/valmen-harness/state.db",
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
    "date": "2026-09-26",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-09-27",
    "at": "2026-09-27T19:38:05.733Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-09-27",
    "at": "2026-09-27T19:39:44.292Z",
    "action": "gate-approved",
    "actor": "cli",
    "details": "Gate analysis aprobado por Delegacion del PO (Juan Andrade 2026-09-26): Aprobacion DELEGADA por el PO Juan Andrade el 2026-09-26, sus palabras: si el analisis pasa las compuertas te doy la libertad de aprobarlo. Compuerta analysis en REVIEW por diagnostico_explica_el_sintoma=0.88 (peso 3) y riesgos_cubren_impactos=0.88 con la media en 0.900 y el resto de las proposiciones en verde; la solicitud es un requisito del sprint sin sintoma observable y el ticket no declara impactos, asi que no hay alcance mal fijado, ni criterio no verificable, ni riesgo sin mitigacion."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-09-27",
    "at": "2026-09-27T19:39:44.423Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-09-27",
    "at": "2026-09-27T19:41:32.802Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-09-27",
    "at": "2026-09-27T19:41:32.928Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-09-27",
    "at": "2026-09-27T19:46:56.513Z",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-09-27",
    "at": "2026-09-27T19:47:18.125Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-09-27",
    "at": "2026-09-27T19:47:18.271Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-09-27",
    "at": "2026-09-27T19:47:18.427Z",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-09-27",
    "at": "2026-09-27T19:48:04.348Z",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-09-27",
    "at": "2026-09-27T19:48:04.499Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-09-27",
    "at": "2026-09-27T19:48:26.338Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-014",
    "date": "2026-09-27",
    "at": "2026-09-27T19:49:27.721Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-002."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-015",
    "date": "2026-09-27",
    "at": "2026-09-27T19:49:27.763Z",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-016",
    "date": "2026-09-27",
    "at": "2026-09-27T19:49:27.882Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  }
]
```
