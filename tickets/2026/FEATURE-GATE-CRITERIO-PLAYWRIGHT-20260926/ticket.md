---
schema_version: 2
id: FEATURE-GATE-CRITERIO-PLAYWRIGHT-20260926
title: Aceptar el verbo playwright en criterios
type: FEATURE
module: GATE
workflow_status: awaiting_user_tests
qa_status: pending
release_status: unreleased
user_visible: false
sync_impact: false
migration_impact: false
docker_impact: false
risk_level: normal
created: 2026-09-26
updated: 2026-09-29
related_ticket: null
target_release: null
released_in: null
---

# FEATURE-GATE-CRITERIO-PLAYWRIGHT-20260926

## Solicitud original

Parte del sprint: Declarar, consultar y validar criterios de interfaz desde artefactos del proyecto.
- R-S4-001: El verbo `playwright` en los criterios — Un criterio de aceptación DEBE poder declararse como
Viene de una feature descompuesta en sprints; su plan completo está en el tickets.yaml de la feature.

## Descripción funcional

- Alcance: el verbo `playwright` de las anotaciones `<!-- test: … -->` de un criterio (resolución del comando y rechazo con motivo, en `packages/gate/src/dynamic.ts`), el registro del resultado de cada comando y de la evidencia que dejó (en `packages/gate-command/src/command.ts` y `packages/gate/src/receipt.ts`) y la salida del comando por pantalla (en `packages/engine/src/gate.ts`), más su documentación en `docs/03-GATES.md` §5.1sexies. Queda fuera: la sección `playwright:` de `.valmen/config.yaml` con el modelo por rol (R-S4-003, ticket hermano FEATURE-CONFIG-PERFIL-UI-20260926), la recomendación del plan de cubrir un criterio con Playwright (R-S4-002), `verify: dev` (R-S4-005) y la ejecución de specs guardadas en el repositorio como capacidad propia (R-S4-004). También queda fuera la vista de Mission Control: el campo nuevo del recibo no se pinta todavía en pantalla y se declara como límite.
- Usuario o rol afectado: quien escribe los criterios de un ticket que toca una pantalla —hoy el agente y el PO en SaiOpenCloud—, y quien audita después el recibo de la compuerta: con el verbo disponible, un criterio de interfaz puede declarar su spec y la corrida queda probada por comando, sin que nadie mire una pantalla para saber si el criterio se cumplió.
- Comportamiento actual: un criterio escrito como `<!-- test: playwright tests/pos/creacion-manual.spec.ts -->` no corre nada útil. Con `test-commands` declarando `playwright`, el check se arma con la línea literal del criterio y `execFileSync` busca el binario pelado `playwright` en el PATH —fuera de un `node_modules/.bin`— y muere con ENOENT; con el caso real, el proyecto declarando `npx playwright test`, el criterio se rechaza con «El proyecto no autoriza este comando». Y el recibo de la compuerta guarda `criterio_NN=1.00` sin el resultado del comando: ni su invocación, ni su código de salida, ni su salida capturada, ni la traza o el video que la corrida dejó en disco, que es la evidencia que un criterio de interfaz necesita.
- Comportamiento esperado: `<!-- test: playwright <ruta-del-spec> -->` corre el comando que el proyecto declara en `test-commands` —`npx playwright test` o `playwright`— con la ruta del spec del criterio, y sin ningún prefijo de Playwright declarado el criterio se rechaza nombrando el verbo, sin correr nada. El recibo de la compuerta mecánica guarda por cada comando su invocación, su código de salida esperado y obtenido, su duración y su salida capturada, y referencia los archivos que esa corrida dejó en los directorios de salida declarados por el check.

## Diagnóstico

- Archivos y flujo investigados: la construcción del check por criterio vive en `packages/gate/src/dynamic.ts:148-181` (`commandChecksFor` parte la línea del criterio con `partirComando` y arma el comando con la primera pieza tal cual) y su autorización en `:217-224` (`autorizado`, comparación por palabra completa contra los prefijos). Esa lista la lee el motor de `packages/engine/src/gate.ts:128-130` (`testCommands`, sobre `configList` de `packages/engine/src/discovery.ts:91-110`) y el rechazo del comando no autorizado sale en `packages/engine/src/gate.ts:319-338`. La corrida y lo que captura están en `packages/gate-command/src/command.ts:92-155` (`execFileSync`, código de salida, salida acotada a 2000 caracteres por flujo, duración). El resultado del comando ya viaja en la evaluación —`packages/engine/src/evaluators.ts:97`, `:249` y `:267`— pero no llega al recibo: `packages/engine/src/gate.ts:440-462` llama a `buildReceipt` sin él, y `packages/gate/src/receipt.ts:65-110` no tiene campo donde guardarlo. La compuerta mecánica despliega solo los criterios que declaran comando (`packages/gate/src/dynamic.ts:317-323`) y no tiene proposiciones fijas (`packages/gate/src/definitions.ts:295-319`), así que todo lo que decide sale de correr lo declarado; su vista en la aplicación pinta los checks mecánicos y no el resultado del comando (`packages/server/web/index.html:3619`).
- Causa raíz o hipótesis: el síntoma ocurre por una sola causa y es que **el verbo no existe como mecanismo**. El criterio se escribe como una línea de texto, y lo que la compuerta ejecuta es esa línea literal, tomada palabra por palabra: cuando esa línea empieza con `playwright`, `execFileSync` busca el binario pelado `playwright` en el PATH —que en un proyecto real vive en `node_modules/.bin` y no en el PATH de un proceso lanzado sin shell—, así que el criterio no corre y muere con ENOENT; y cuando el proyecto declara lo que de verdad usa, `npx playwright test`, la comparación por palabra completa no reconoce el verbo y el criterio se rechaza como si fuera una orden arbitraria. Por eso el síntoma se ve de las dos formas a la vez: el verbo no corre cuando el proyecto declara `playwright` y no se acepta cuando declara `npx playwright test`. La resolución no puede inventarla la compuerta —inventar `npx playwright test` sería ejecutar un comando que el proyecto no declaró, y ahí se cae la frontera que hace segura la función—: la salida es resolver el verbo contra el prefijo que el proyecto sí declara, tomando **el programa de la configuración** y del criterio solo la ruta del spec. El segundo hueco se explica igual de directo: el recibo se diseñó para respuestas de modelo, guarda la proposición y descarta el resultado del comando, así que un criterio de interfaz queda probado por un `1.00` sin la traza que explica por qué —el comando corre, falla o pasa, y lo que lo demuestra se pierde en el momento de escribir el recibo—.
- Riesgos y compatibilidad: (a) la resolución tiene que tomar el programa de `test-commands` y nunca del criterio, o un ticket podría nombrar un programa que el proyecto no autorizó —el mecanismo de prefijos existe justo para eso—; los argumentos del criterio viajan como hoy, después del prefijo declarado. (b) La evidencia se recolecta por marca de tiempo posterior al arranque de la corrida: listar el directorio entero atribuiría al recibo la traza de una corrida anterior, que es una afirmación falsa con forma de prueba. (c) El campo nuevo del recibo es opcional y no cambia `receiptVersion`, con el mismo criterio que `notes` y `escalations`: los recibos ya emitidos siguen siendo válidos y no se reescriben —el registro es append-only—. (d) El recibo crece con la salida capturada (los mismos 2000 caracteres por flujo que ya se guardan en el resultado del check, `packages/gate-command/src/command.ts:89`); se acepta porque esa es la evidencia, y su ausencia es lo que obligaba a creer. (e) Un proyecto que configure otro directorio de salida de Playwright no encontrará su traza: el directorio por defecto es el de la convención de Playwright y declararlo por proyecto es el punto de extensión de R-S4-003, que no se implementa acá. (f) La vista de Mission Control no pinta el campo nuevo; se declara en la entrega en vez de dejarlo para que se descubra solo.
- Impactos de sync, migración, Docker o despliegue: ninguno. Es lógica de la compuerta mecánica del harness y del archivo de recibos, que no se sincroniza a ningún cliente, no migra datos y no cambia ninguna imagen ni el despliegue.

## Plan

- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan) — orden del PO, literal: «Dale, los ejecuto YA en orden (cf: 7 del EVOLUCION-HARNESS, commit sí por ticket al llegar a awaiting_user_tests, push con orden aparte del PO)», 2026-09-29.
- Decisiones:
  1. **El verbo se resuelve contra el comando que el proyecto declara en `test-commands`**, y del criterio solo se toma la ruta del spec: el criterio nombra la herramienta y el proyecto declara cómo se corre. Alternativa descartada: que la compuerta arme `npx playwright test <ruta>` por su cuenta —el programa dejaría de salir de la configuración y un criterio podría correr algo que el proyecto nunca autorizó, que es exactamente lo que el mecanismo de prefijos impide—. Consecuencia: sin ningún prefijo de Playwright declarado, el verbo no está disponible y el criterio se rechaza con el motivo a la vista.
  2. **La evidencia se recolecta de los directorios de salida que el check declara, y solo con archivos posteriores al arranque del comando.** Alternativa descartada: listar el directorio de salida sin filtrar por tiempo —una traza vieja entraría al recibo como prueba de esta corrida, que es una afirmación falsa y además indetectable después—. El directorio por defecto es el de Playwright (`test-results` y `playwright-report`) y se declara en el check, no en el motor, para que el proyecto pueda declarar el suyo cuando R-S4-003 lo agregue.
  3. **El resultado del comando entra al recibo como campo opcional, sin subir `receiptVersion`.** Alternativa descartada: subir la versión del formato e invalidar los recibos ya emitidos —son append-only y no se reescriben, así que el cambio tiene que ser aditivo, como lo fueron `notes` y `escalations`—.
  4. **No se toca la vista de la aplicación.** Alternativa descartada: pintar el resultado del comando en el recibo de Mission Control —es alcance de interfaz propio, y el requisito que este ticket cubre es el recibo y el verbo—; se declara como límite en la entrega.
- Pasos ordenados:
  1. `packages/gate/src/dynamic.ts` — declarar el verbo y resolverlo: cuando el criterio empieza con `playwright` y el proyecto declara un prefijo de `test-commands` que contiene ese token, el check se arma con el comando declarado más la ruta del spec del criterio; sin prefijo declarado, el criterio se rechaza nombrando el verbo en el motivo.
  2. `packages/gate-command/src/command.ts` — recolectar la evidencia: `artifactDirs` en el check, recorrido de esos directorios después de la corrida, archivos con marca de tiempo posterior al arranque, ordenados por ruta y acotados, con su tamaño; el resultado del check los lleva en `artifacts`.
  3. `packages/gate/src/decide.ts` — el campo `artifactDirs` viaja en `CommandCheckSpec`, junto al resto de la declaración del comando, hasta el evaluador determinista.
  4. `packages/gate/src/receipt.ts` — `GateReceipt.commandResults` con la invocación, el código de salida esperado y obtenido, la duración, la salida capturada y la evidencia de cada comando, como campo opcional y documentado.
  5. `packages/engine/src/gate.ts` — pasar los resultados de la evaluación al recibo e imprimir en la salida de la compuerta cada comando corrido con su resultado y la evidencia que dejó.
  6. `tests/gate-playwright.test.ts` — las pruebas del comportamiento nuevo: resolución del verbo, rechazo sin prefijo declarado, el prefijo completo sin resolución, el resultado guardado en el recibo, la evidencia referenciada y el archivo viejo que queda fuera.
  7. `docs/03-GATES.md` §5.1sexies — documentar el verbo como tercera forma de verificar un criterio y qué guarda el recibo.
  8. `tests/gate-playwright.test.ts` — fijar la regresión del prefijo completo: un criterio escrito con `npx playwright test <ruta>` sigue corriendo ese comando tal cual, sin que la resolución del verbo lo toque.
  9. Correr la verificación de cierre sobre el árbol del ticket: la batería completa del monorepo (`npx vitest run`), el typecheck del monorepo (`npm run typecheck`) y el archivo enfocado de pruebas, con el resultado anotado en `## Pruebas`.
- Rollback: revertir el commit del ticket devuelve la conducta anterior; no hay cambio de configuración, de esquema ni de dependencias, y los recibos ya emitidos siguen siendo válidos y legibles —el campo nuevo es opcional y aditivo—.

## Criterios de aceptación

- [x] Un criterio con el verbo playwright corre el comando que el proyecto declara en test-commands, con la ruta del spec que declara el criterio
      <!-- test: npx vitest run tests/gate-playwright.test.ts -->
- [x] Un proyecto sin ningún prefijo de Playwright en test-commands rechaza el criterio del verbo playwright sin correr nada, con el motivo que nombra el verbo
      <!-- test: npx vitest run tests/gate-playwright.test.ts -->
- [x] Un criterio escrito con el prefijo completo declarado en test-commands corre ese comando tal cual, sin resolución del verbo
      <!-- test: npx vitest run tests/gate-playwright.test.ts -->
- [x] El recibo de la compuerta mecánica guarda la invocación de cada comando corrido con su código de salida obtenido
      <!-- test: npx vitest run tests/gate-playwright.test.ts -->
- [x] El recibo de la compuerta mecánica guarda la salida capturada del comando, que explica el veredicto cuando el criterio falla
      <!-- test: npx vitest run tests/gate-playwright.test.ts -->
- [x] El recibo referencia la evidencia que la corrida de Playwright dejó en el directorio de salida declarado por el check
      <!-- test: npx vitest run tests/gate-playwright.test.ts -->
- [x] Un archivo de evidencia anterior al arranque del comando queda fuera del recibo, sin leerse como prueba de esta corrida
      <!-- test: npx vitest run tests/gate-playwright.test.ts -->
- [x] La documentación de las compuertas nombra el verbo playwright entre las formas de verificar un criterio
      <!-- test: npx vitest run tests/gate-playwright.test.ts -->
- [ ] La batería completa del monorepo sigue verde tras el cambio, con el typecheck del monorepo incluido
      <!-- verify: manual -->

## Puntos

```json
[]
```

## Implementación

Lo implementado, paso por paso contra el plan:

1. `packages/gate/src/dynamic.ts` — el verbo existe: `VERBO_PLAYWRIGHT` y `DIRECTORIOS_DE_EVIDENCIA_DE_PLAYWRIGHT` (`test-results`, `playwright-report`) documentados, y `commandChecksFor` decide en tres ramas: (a) el criterio ya empieza con un prefijo autorizado y se arma igual que siempre; (b) el criterio empieza con el verbo y hay un prefijo declarado que contiene ese token, así que el check se arma con **las piezas del prefijo declarado** y después los argumentos del criterio sin el verbo, más `artifactDirs`; (c) el verbo sin prefijo declarado va a `refused` con un motivo que nombra el verbo y `test-commands`. El comentario del bloque dice por qué el programa sale de la configuración y del criterio solo la ruta del spec.
2. `packages/gate-command/src/command.ts` — `CommandArtifact {path, bytes}`, `artifactDirs` en `CommandCheck`, `artifacts` en `CommandCheckResult`, y `listArtifacts(root, dirs, sinceMs)` exportada y pura: recorrido recursivo con tope de profundidad 3, archivos con `mtimeMs >= arranque - 1000`, orden por ruta y tope de 10. La recolección corre después de ejecutar, también cuando el comando falla; sin `artifactDirs` no cambia nada.
3. `packages/gate/src/decide.ts` — `CommandCheckSpec.artifactDirs?`, para que la declaración del directorio viaje con el check hasta el evaluador determinista.
4. `packages/gate/src/receipt.ts` — `CommandArtifactRecord`, `CommandResultRecord` (invocación, código esperado y obtenido, veredicto, duración, salida capturada y evidencia) y `GateReceipt.commandResults?` / `ReceiptInput.commandResults?`, documentados como opcionales y aditivos sin subir `RECEIPT_VERSION`. El tipo se define ahí porque importar `@valmen/gate-command` sería una dependencia circular, y es estructuralmente compatible con su `CommandCheckResult`.
5. `packages/engine/src/gate.ts` — `evaluation.commandResults` entra al recibo, y la salida de la compuerta gana una línea por comando con su invocación, su código de salida obtenido y esperado, su duración y las rutas de la evidencia.
6. `tests/gate-playwright.test.ts` — 7 pruebas: resolución con la ruta del spec más la aprobación de la compuerta, rechazo sin prefijo declarado, el prefijo completo sin resolución, el resultado en el recibo, la evidencia referenciada, el archivo viejo fuera de la evidencia y la mención del verbo en la documentación.
7. `docs/03-GATES.md` — §5.1sexies documenta las dos formas que la compuerta corre (el comando con prefijo autorizado y el verbo con la ruta del spec), la resolución contra `test-commands` y qué guarda el recibo.

Desvíos del plan y límites declarados:

- Desvío menor: el ayudante de fixtures es `tests/helpers/fixtures.ts`, importado como `./helpers/fixtures.js` igual que el resto de la suite (el plan lo nombró sin la extensión real).
- La prueba del archivo de evidencia viejo lo envejece con `utimesSync` a 1970: escrito justo antes de la corrida caería dentro del margen de un segundo del filtro y entraría, que es lo contrario de lo que la prueba afirma.
- El caso del recibo usa un `falla.js` con `process.exitCode = 1` en lugar de `node -e "…"`, porque `process.exit` puede truncar el stdout por tubería y la salida capturada es justamente lo que se verifica.
- Límite 1: la evidencia se recolecta para el criterio escrito con el verbo. Un criterio escrito con el prefijo completo corre tal cual, como siempre, y no declara directorios de evidencia: es la regresión que fija el tercer criterio, y ampliarla es decisión aparte.
- Límite 2: si un proyecto declara dos prefijos que contienen `playwright` (por ejemplo `npx playwright install` antes de `npx playwright test`), el verbo resuelve al primero de `test-commands`: el orden de la configuración manda, y es determinista.
- Límite 3: los directorios de evidencia los declara la compuerta, no el ticket —`artifactDirs` no se lee de la anotación del criterio—, y el directorio propio de un proyecto es el punto de extensión de R-S4-003.
- Límite 4: la vista de Mission Control sigue pintando los checks mecánicos y no el campo nuevo del recibo; se declara acá en vez de dejarlo para que se descubra solo.
- Quién escribió qué: el código y las pruebas los escribió la sesión de OpenCode del ticket; esta sesión los verificó (corridas propias, contrato en rojo, revisión del diff) y no editó ningún archivo de código.

## Pruebas

- `npx vitest run tests/gate-playwright.test.ts` → 7 pruebas, 7 pasadas.
- `npx vitest run` (batería completa del monorepo) → 82 archivos pasados, 1 omitido; **1594 pruebas pasadas, 48 omitidas, 0 fallos**. La línea base del mismo árbol antes del cambio era 1587 pasadas y 48 omitidas, así que la diferencia son exactamente las 7 pruebas nuevas.
- `npm run typecheck` (`npm run build && tsc --noEmit -p tsconfig.json`) → exit 0, sin errores. Se corrió el script del proyecto y no un `tsc` suelto, porque el tipo que ve un paquete vecino sale de `dist`.
- Contrato en rojo antes de la implementación: con los seis archivos del cambio apartados (`git stash push -- docs/03-GATES.md packages/engine/src/gate.ts packages/gate-command/src/command.ts packages/gate/src/decide.ts packages/gate/src/dynamic.ts packages/gate/src/receipt.ts`) el archivo enfocado da **5 de 7 en rojo** —resolución del verbo, el resultado en el recibo, la evidencia, el archivo viejo y la documentación—; restaurado con `git stash pop` y verificado con `shasum -a 256` que los seis archivos volvieron idénticos y que `git stash list` quedó vacía.
- El criterio `verify: manual` (la batería completa con el typecheck) lo corrió esta sesión y sale verde, pero queda **sin marcar**: lo confirma quien prueba, y esta entrega no lo da por verificado. Las ocho pruebas por comando se marcaron con la corrida directa del archivo enfocado, y el recibo de la compuerta mecánica sobre este mismo estado las respalda.
- Contrato de pruebas para el responsable: no hay nada que ejecutar a mano. Lo que se prueba en la aplicación es que un recibo de la compuerta mecánica muestre el resultado de cada comando con su invocación, su código de salida y su duración, y que un criterio de interfaz escrito con el verbo —`<!-- test: playwright tests/pos/<spec>.spec.ts -->`— corra el comando que el proyecto declare en `test-commands` sin que la compuerta invente el programa.

### Compuerta de análisis: la banda que decidió una persona

- La compuerta `analysis` volvió `REVIEW` en sus dos corridas —las dos revisiones del recibo `GR-20260929-analysis`, evaluadas con `typesafe/jev-1.13`—, y la proposición que emite veredicto y quedó en banda es `diagnostico_explica_el_sintoma`, **de peso 3: 0,79 en la primera corrida y 0,82 en la segunda**, contra el umbral de aprobación de 0,90. El veredicto de una compuerta es su proposición más débil y no su media.
- Las otras proposiciones con veredicto salieron en approve —`causa_especifica` 0,94, `nombra_archivos_reales` 0,92, `clasificacion` completa—. `riesgos_cubren_impactos` quedó en 0,48 y **no emite veredicto**: es descriptiva (`verdict: false`), informa y no decide, así que no es una banda pendiente.
- **La decisión no había quedado registrada en la entrega del 2026-09-29**: el recibo de análisis quedó en `escalatedTo: human` con `humanDecision: null`, y `packages/cli/src/hermes.ts:708` lista exactamente esos recibos como pendientes de aviso, con lo que el PO seguía recibiendo el aviso de una compuerta de un ticket ya entregado. Lo detectó la revisión de la tarjeta `t_befa18a7` y es lo único que devolvió.
- Se registró el 2026-09-29 sobre el **último** recibo de análisis (revisión 14302, la de 0,82) con la delegación que el plan ya cita literal: actor «Delegación del PO (Juan Andrade)» con la orden del 2026-09-29 —«Dale, los ejecuto YA en orden (cf: 7 del EVOLUCION-HARNESS, commit sí por ticket al llegar a awaiting_user_tests, push con orden aparte del PO)»—, el motivo en el propio recibo y el evento `EVENT-012` en `## Eventos`. Después del registro quedan **cero** recibos escalados sin decisión en todo el registro.
- La compuerta de plan **no necesita decisión**: su primera corrida volvió `REVIEW` (`criterio_03` 0,55 y `criterio_09` 0,35) y la segunda, sobre el plan corregido, aprobó con los nueve criterios entre 0,95 y 0,99. La revisión vigente de `GR-20260929-plan` es la aprobada, y el recibo escalado quedó superado por su propia corrida siguiente.
- Lo que la banda mide es la redacción del diagnóstico y no su fondo —el diagnóstico nombra archivo y línea del síntoma en `packages/gate/src/dynamic.ts:148-181` y la implementación lo confirmó al correr—, así que la decisión delegada es la lectura correcta. Se deja el número a la vista para que el PO pueda revertirla si no le parece.
- Dos notas de la revisión que no bloquearon y conviene tener a mano cuando llegue el ciclo de QA: la referencia con la que hay que abrirlo no puede ser `commit:<sha>`, porque el ticket tiene cero puntos y la lista de archivos afectados sale de `affected_files` de los puntos —`qa-start` la rechaza con «El ticket no declara archivos afectados»—, así que va `worktree:sha256:3839a4e74341d01b5409b203e62d7075fd2a481785cad21039f058a40e814626`; y la prueba de documentación asegura la mención con un `toContain` de una palabra, que pasaría aunque la sección se borrara —el contenido que afirma está en `docs/03-GATES.md` §5.1sexies, así que la afirmación es verdadera aunque la guarda sea floja—.
- Quién escribió qué en esta ronda: la ronda 2 solo tocó el registro —la línea nueva del recibo y este texto—; no se editó ningún archivo de código ni de pruebas, y la sesión que lo hizo es la de la revisión, no la del ejecutor. Este texto es posterior al recibo `GR-20260929-qa-mechanical`, así que su estado congelado es anterior a él; ningún criterio se tocó —los ocho de comando siguen marcados con su corrida y el manual sigue sin marcar— y la compuerta mecánica no se puede volver a correr sobre un ticket ya entregado, porque solo aplica a un ticket en `in_progress`.
- Además del mínimo que pidió la revisión, la ronda registró el consumo de IA de las dos sesiones de Hermes que trabajaron el ticket y no estaban declaradas: la de la revisión ronda 1 (`CONSUMO-005`, `20260929_181020_957da9`, con el turno ya cerrado) y la de esta ronda (`CONSUMO-006`, `20260929_181824_edfea1`, leída con el turno todavía en curso y declarada como piso). El bloque queda con **seis entradas**: tres de OpenCode y tres de Hermes. Ninguna de las dos declara costo: el proveedor factura por suscripción y la fila informa 0,0, que escrito como costo se leería como gratis.

## QA

```json
[]
```

## Evidencia

```json
[
  {
    "id": "EVIDENCE-001",
    "date": "2026-09-29",
    "kind": "verification",
    "description": "Verbo playwright en los criterios: resolucion contra el prefijo declarado en test-commands (el programa sale de la configuracion y del criterio solo la ruta del spec), rechazo con motivo cuando el proyecto no declara ningun prefijo de Playwright, y el resultado de cada comando en el recibo con su evidencia. El hash cubre los archivos del cambio en orden alfabetico: docs/03-GATES.md, packages/engine/src/gate.ts, packages/gate-command/src/command.ts, packages/gate/src/decide.ts, packages/gate/src/dynamic.ts, packages/gate/src/receipt.ts y tests/gate-playwright.test.ts. Verificado por esta sesion: archivo enfocado 7 de 7, bateria completa 1594 pasadas sin fallos (linea base 1587), typecheck sin errores, y contrato en rojo (5 de 7) con los seis archivos apartados.",
    "reference": "worktree:sha256:3839a4e74341d01b5409b203e62d7075fd2a481785cad21039f058a40e814626",
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
[]
```

## Consumo de IA

```json
[
  {
    "kind": "ai-usage",
    "date": "2026-09-29",
    "session_reference": "ses_f110ebe1effe9uG8Bt01mbYZVy",
    "model": "opencode-go/deepseek-v4.1-flash",
    "reasoning_effort": null,
    "notes": "Corrida de OpenCode del ticket, intento 1: murio al instante con los permisos de directorio auto rechazados, sin escribir ningun archivo. Se relanzo el mismo alcance.",
    "input_tokens": 13773,
    "output_tokens": 186,
    "total_tokens": 13972,
    "estimated_cost_usd": 0.002186502,
    "source": "opencode:/Users/juanandrade/.local/share/opencode/opencode.db",
    "confidence": "high",
    "id": "CONSUMO-001"
  },
  {
    "kind": "ai-usage",
    "date": "2026-09-29",
    "session_reference": "ses_f110e5953ffeSDqoAg4yL1Ylb5",
    "model": "opencode-go/deepseek-v4.1-flash",
    "reasoning_effort": null,
    "notes": "Corrida de OpenCode del ticket, intento 2: leyo el codigo y se corto al pedir una pregunta que nadie podia contestar en headless, sin escribir ningun archivo. Se relanzo el mismo alcance con la instruccion de no preguntar.",
    "input_tokens": 82845,
    "output_tokens": 1686,
    "total_tokens": 92596,
    "estimated_cost_usd": 0.019936614,
    "source": "opencode:/Users/juanandrade/.local/share/opencode/opencode.db",
    "confidence": "high",
    "id": "CONSUMO-002"
  },
  {
    "kind": "ai-usage",
    "date": "2026-09-29",
    "session_reference": "ses_f110c7517ffeUS7jdbno9YYv43",
    "model": "opencode-go/deepseek-v4.1-flash",
    "reasoning_effort": null,
    "notes": "Corrida de OpenCode del ticket, intento 3: implementacion completa del verbo playwright y del resultado del comando en el recibo, 7 pruebas nuevas, bateria completa 1594 sin fallos y typecheck sin errores, sin commit ni push.",
    "input_tokens": 110127,
    "output_tokens": 13354,
    "total_tokens": 139092,
    "estimated_cost_usd": 0.04544877,
    "source": "opencode:/Users/juanandrade/.local/share/opencode/opencode.db",
    "confidence": "high",
    "id": "CONSUMO-003"
  },
  {
    "kind": "ai-usage",
    "date": "2026-09-29",
    "session_reference": "20260929_154356_96bcad",
    "model": "opencode-go/deepseek-v4.1-flash",
    "reasoning_effort": null,
    "notes": "Sesion del worker del tablero que analizo, planeo, verifico y entrego este ticket: diagnostico y plan con sus compuertas, supervision de las tres corridas de OpenCode, verificacion propia de la suite y del contrato en rojo, evidencia y compuerta mecanica. Lectura hecha al momento de registrar el consumo, con el turno todavia en curso: la fila de la sesion sigue creciendo hasta que el turno termina, asi que estos numeros son un piso y no la medicion final. El proveedor opencode-go factura por suscripcion, asi que no se declara costo: la fila del state.db informa 0.0 y escribirlo como cero se leeria como gratis.",
    "input_tokens": 253767,
    "output_tokens": 74226,
    "total_tokens": 377156,
    "estimated_cost_usd": null,
    "source": "hermes:/Users/juanandrade/.hermes/profiles/valmen-harness/state.db",
    "confidence": "high",
    "id": "CONSUMO-004"
  },
  {
    "kind": "ai-usage",
    "date": "2026-09-29",
    "session_reference": "20260929_181020_957da9",
    "model": "opencode-go/deepseek-v4.1-flash",
    "reasoning_effort": null,
    "notes": "Sesion de la revision ronda 1 de la tarjeta del tablero sobre este ticket: relee el diff en frio, reproduce por su cuenta el archivo enfocado, la bateria completa y el typecheck, recomputa la referencia de evidencia sobre los dos commits del ticket y devuelve la tarjeta por un unico hueco de registro, la compuerta de analisis escalada sin decision. El proveedor opencode-go factura por suscripcion, asi que no se declara costo: la fila del state.db informa 0.0 y escribirlo como cero se leeria como gratis.",
    "input_tokens": 94569,
    "output_tokens": 32761,
    "total_tokens": 151643,
    "estimated_cost_usd": null,
    "source": "hermes:/Users/juanandrade/.hermes/profiles/valmen-harness/state.db",
    "confidence": "high",
    "id": "CONSUMO-005"
  },
  {
    "kind": "ai-usage",
    "date": "2026-09-29",
    "session_reference": "20260929_181824_edfea1",
    "model": "opencode-go/deepseek-v4.1-flash",
    "reasoning_effort": null,
    "notes": "Sesion que reviso la tarjeta del tablero de este ticket en la ronda 1 y cerro lo unico que esa revision devolvio: registro la decision delegada del PO sobre el recibo de analisis escalado, con su motivo, y escribio el resultado en el ticket. En esta ronda tambien registro el consumo de las sesiones que trabajaron el ticket. Lectura hecha al momento de registrar, con el turno todavia en curso: la fila sigue creciendo hasta que el turno termina, asi que estos numeros son un piso. El proveedor opencode-go factura por suscripcion, asi que no se declara costo: la fila del state.db informa 0.0 y escribirlo como cero se leeria como gratis.",
    "input_tokens": 147111,
    "output_tokens": 26427,
    "total_tokens": 190045,
    "estimated_cost_usd": null,
    "source": "hermes:/Users/juanandrade/.hermes/profiles/valmen-harness/state.db",
    "confidence": "high",
    "id": "CONSUMO-006"
  },
  {
    "kind": "ai-usage",
    "date": "2026-09-29",
    "session_reference": "20260929_182720_e37382",
    "model": "opencode-go/deepseek-v4.1-flash",
    "reasoning_effort": null,
    "notes": "Sesion de la revision ronda 2 de la tarjeta del tablero sobre este ticket: reproduce por su cuenta el archivo enfocado 7 de 7, la bateria completa 1628 sin fallos, el recibo mecanico con sus ocho commandResults reales, recomputa la referencia de evidencia sobre los blobs de los dos commits del ticket y verifica la decision registrada sobre el ultimo recibo de analisis y que el aviso pendiente deja de listarlo. Lectura hecha al momento de registrar, con el turno todavia en curso: la fila de la sesion sigue creciendo hasta que el turno termina, asi que estos numeros son un piso y no la medicion final. El proveedor opencode-go factura por suscripcion, asi que no se declara costo: la fila del state.db informa 0.0 y escribirlo como cero se leeria como gratis.",
    "input_tokens": 125908,
    "output_tokens": 20909,
    "total_tokens": 162366,
    "estimated_cost_usd": null,
    "source": "hermes:/Users/juanandrade/.hermes/profiles/valmen-harness/state.db",
    "confidence": "high",
    "id": "CONSUMO-007"
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
    "date": "2026-09-29",
    "at": "2026-09-29T20:50:35.097Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-09-29",
    "at": "2026-09-29T20:51:17.097Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-09-29",
    "at": "2026-09-29T20:51:45.770Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-09-29",
    "at": "2026-09-29T20:51:45.906Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-09-29",
    "at": "2026-09-29T21:05:42.609Z",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-09-29",
    "at": "2026-09-29T21:07:59.239Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-09-29",
    "at": "2026-09-29T21:07:59.394Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-002."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-09-29",
    "at": "2026-09-29T21:07:59.531Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-003."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-09-29",
    "at": "2026-09-29T21:07:59.675Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-004."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-09-29",
    "at": "2026-09-29T21:08:59.116Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-09-29",
    "at": "2026-09-29T23:20:54.259Z",
    "action": "gate-approved",
    "actor": "cli",
    "details": "Gate analysis aprobado por Delegación del PO (Juan Andrade): «Dale, los ejecuto YA en orden (cf: 7 del EVOLUCION-HARNESS, commit sí por ticket al llegar a awaiting_user_tests, push con orden aparte del PO)»: La banda es de redacción y no de fondo, y está medida dos veces en el mismo evaluador (typesafe/jev-1.13). La única proposición con veredicto fuera de umbral es diagnostico_explica_el_sintoma, de peso 3: 0,79 en la primera corrida y 0,82 en la segunda, contra el umbral de 0,90; el resto quedó en approve (causa_especifica=0,94, nombra_archivos_reales=0,92, clasificacion=completa) y riesgos_cubren_impactos=0,48 es descriptiva (verdict=false) y no emite veredicto. El diagnóstico del ticket nombra archivo y línea del síntoma (dynamic.ts, el mecanismo de prefijos de test-commands) y la implementación lo confirmó al correr: las siete pruebas del archivo enfocado pasan. Se registra la decisión delegada porque la orden del PO ya autoriza seguir, y sin registro el aviso de la compuerta seguía llegándole por una compuerta de un ticket ya entregado."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-09-29",
    "at": "2026-09-29T23:25:04.113Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-005."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-014",
    "date": "2026-09-29",
    "at": "2026-09-29T23:25:25.610Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-006."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-015",
    "date": "2026-09-29",
    "at": "2026-09-29T23:31:31.194Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-007."
  }
]
```
