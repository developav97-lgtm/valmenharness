---
schema_version: 2
id: AGENT-GATE-AUDITAR-MANUAL-CITAS-20260926
title: Auditar manuales contra código con citas
type: AGENT
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

# AGENT-GATE-AUDITAR-MANUAL-CITAS-20260926

## Solicitud original

Parte del sprint: Encadenar manuales al deploy, auditarlos y publicar el corpus indexable.
- R-S3-003: Auditoría contra el código — Antes de aceptarse, un manual generado DEBE pasar la auditoría con citas: cada
Depende de: AGENT-DOCS-GENERAR-MANUAL-MARKDOWN-20260926.
Viene de una feature descompuesta en sprints; su plan completo está en el tickets.yaml de la feature.

## Descripción funcional

- Alcance: R-S3-003 — que un manual generado **no se acepte sin auditoría con citas**, y que esa auditoría sea un gate con **checks mecánicos de citas** y no una instrucción en prosa: cada afirmación funcional del manual declara la línea del código que la respalda (`<!-- cita: <ruta>:<línea> -->`, en la misma línea o en la de abajo), y `valmen manuales auditar` recorre el directorio de manuales, resuelve cada cita contra el repositorio y emite un veredicto por manual con su recibo. El paso queda declarado en el proceso `actualizar-manuales`, así que el recibo viaja en la corrida del proceso y el deploy lo encadena como ya hace con la detección.
- Usuario o rol afectado: quien escribe o corrige manuales —hoy el agente solo puede invocar `valmen manuales pendientes`, y no tiene forma de saber si lo que escribió se sostiene— y quien los acepta (QA, el equipo de producto). El usuario final no ve el comando, pero lee un manual que ya no puede afirmar algo que el código no sostiene.
- Comportamiento actual: la auditoría existe como diseño y no como código. El único cruce que existe compara **qué archivos** declara el manual, no **qué dice** de ellos: `manualesPendientes` lee la línea `<!-- rutas-fuente: … -->` y la cruza contra las pantallas que tocaron los tickets de la release (`packages/engine/src/manuales.ts:218-326`), así que un manual escrito de memoria y uno verificado contra el código pasan el mismo chequeo. El gate `manuals` está esbozado en `docs/05-PLUGINS.md:364-403` con su check `citas_del_codigo_real` y listado en `docs/03-GATES.md:955`, pero `GATES` solo registra `analysis`, `plan` y `qa-mechanical` (`packages/gate/src/definitions.ts:321-325`); el proceso declara un solo paso, la detección (`.valmen/processes/actualizar-manuales.yaml:19-25`); y el comando de manuales despacha un único subcomando (`packages/cli/src/manuales.ts:23-39`).
- Comportamiento esperado: el manual declara su evidencia y el motor la verifica sin modelo. `valmen manuales auditar --manuales-dir <ruta>` recorre los `.md`, y por manual decide: `approve` si cada afirmación tiene su cita y cada cita resuelve a un archivo real y a una línea existente y no vacía, `block` si falta una cita o una cita no resuelve o se filtró una ruta técnica al texto visible, y `review` cuando lo único que falta es lo que no se puede decidir en código (un mensaje de error que no aparece literal en las fuentes declaradas, un manual que dice que hay que mirar) o cuando no hay ningún manual que auditar. La corrida sale 0 solo con `approve`, deja el recibo en `.valmen/receipts/actualizar-manuales.jsonl` con sujeto `process:actualizar-manuales`, y el paso de auditoría queda declarado al final del proceso `actualizar-manuales`.

## Diagnóstico

- Síntoma y por qué ocurre: el síntoma es que un manual puede afirmar algo que el código no sostiene y entrar igual al corpus sin que nadie lo note, porque **el harness lee del manual qué archivos menciona y nunca qué dice de ellos**. El síntoma se produce por una ausencia concreta: no existe ninguna anotación en el `.md` que ate una afirmación a la línea del código que la respalda, y por eso ninguna pieza puede contrastarla. Lo que sí existe es un cruce de frescura: `manualesPendientes` lee la línea `<!-- rutas-fuente: … -->` y la compara contra las pantallas que tocaron los tickets de la release (`packages/engine/src/manuales.ts:283-305`), de modo que sabe de qué archivos habla el manual y nunca qué afirma sobre ellos; las dos afirmaciones que el manual hace de más —y que el código no sostiene— pasan el chequeo sin ruido. La ausencia tiene una segunda consecuencia en el mismo archivo: `fuentesDe` (`packages/engine/src/manuales.ts:130-137`) devuelve tokens de ruta sin línea, y `esRutaDeArchivo` (`:139-144`) descartaría un token `ruta:NN` declarándolo `sinResolver`, así que la forma que falta tampoco se puede improvisar en la línea que ya existe. Y la pieza que debía cerrar eso no está construida: el gate `manuals` vive como diseño (`docs/05-PLUGINS.md:364-403`) y como agente de otro proyecto, el proceso `.valmen/processes/actualizar-manuales.yaml:19-25` declara un solo paso —la detección— y su propio comentario de cabecera delega los manuales en R-S3-002 y su auditoría en R-S3-003, y el comando de manuales despacha un único subcomando (`packages/cli/src/manuales.ts:23-39`). El síntoma es ese y no otro: el manual no se cae por estar viejo —para eso está el cruce de frescura—, se cae por afirmar algo que el código no respalda, y eso nadie lo mira.
- Causa raíz: el síntoma ocurre porque **el contrato de evidencia del manual nunca se definió como algo que el código pueda leer**. `fuentesDe` (`packages/engine/src/manuales.ts:130-137`) devuelve los tokens de `rutas-fuente` como rutas, sin línea y sin dueño: ninguna anotación del `.md` ata una afirmación concreta a la línea de código que la sostiene, así que la verificación no es computable y solo puede quedar en manos de un modelo o de una persona que relea el manual entero —que es el trabajo que la ola S3 quiere dejar de pagar—. El invariante 1 del proyecto dice dónde va cada mitad de la solución: *que cada afirmación tenga cita y que la cita resuelva contra el repositorio* es decidible en código; *que lo citado diga lo que la afirmación sostiene* no lo es, y por eso el diseño la dejó como proposición de Jev (`docs/05-PLUGINS.md:390-397`). Este ticket implementa la mitad decidible —los checks mecánicos de citas, que es la segunda vía que R-S3-003 admite explícitamente— y no toca la semántica: queda donde el diseño la puso. La consecuencia de no tener el contrato es lo que se ve hoy: dos manuales con la misma forma pasan el mismo chequeo, uno verificado contra el código y otro escrito de memoria, y el que no coincide se descubre cuando un usuario final lo lee.
- Dónde vive el comportamiento que hay que cambiar (las piezas que el plan toca): el contrato y los checks, en `packages/engine/src/manuales.ts` —el parser de `rutas-fuente` (`:130-144`) y el cruce de frescura (`:218-326`) ya están ahí y la auditoría va al lado—; el subcomando y su comando, en `packages/cli/src/manuales.ts:23-39` y `packages/cli/src/commands.ts` (junto a `manualesPendientesCommand`, `:2108-2166`); la ayuda, en `packages/cli/src/main.ts:270-279`; el paso declarado, en `.valmen/processes/actualizar-manuales.yaml:19-25`; el formato del recibo, que se reutiliza tal cual, en `packages/gate/src/receipt.ts:234-301` y `packages/engine/src/receipts.ts:70-79`; y la prueba enfocada en un archivo nuevo, `tests/manuales-auditar.test.ts`, siguiendo la forma de `tests/manuales-pendientes.test.ts`.
- Archivos y flujo investigados (reconocimiento, con la línea que lo sostiene): (1) **no hay gate `manuals`**: `GATES` registra solo `analysis`, `plan` y `qa-mechanical` (`packages/gate/src/definitions.ts:321-325`), y `runGate` exige un ticket como sujeto (`packages/engine/src/gate.ts:54-57`, `:236`), así que el sujeto real de esta auditoría —la corrida del proceso— no entra por ahí. (2) **el proceso declara solo la detección**: `.valmen/processes/actualizar-manuales.yaml:19-25`, un paso `command` con `valmen manuales pendientes …`. (3) **el comando despacha un subcomando**: `runManuales` (`packages/cli/src/manuales.ts:23-39`) resuelve `pendientes` y rechaza el resto con `EXIT_SCHEMA`. (4) **el formato de cita no está definido en ninguna pieza**: el diseño lo nombra como proposición de modelo (`docs/05-PLUGINS.md:388-403`) y la plantilla del manual de SaiOpenCloud (`docs/manuales/usuario-final/PROCESO-MANUALES.md:31-58`) trae el bloque de metadata, `<!-- rutas-fuente: … -->` y seis secciones, sin cita por afirmación. (5) **estado de la dependencia**: `AGENT-DOCS-GENERAR-MANUAL-MARKDOWN-20260926` (R-S3-002) está en `analyzed` y sin implementar —no existen la skill `manuales-usuario-final` ni `valmen manuales plantilla`—, así que el contrato de citas no se hereda de esa plantilla: este ticket lo define y lo deja escrito en `docs/03-GATES.md` y en la ayuda del comando, con el aviso en la tarjeta de la dependencia.
- Traducción del pedido a los campos del código: «auditoría con citas» es la anotación por afirmación `<!-- cita: <ruta>:<línea> -->` en el `.md`; «cada afirmación funcional» es cada línea de cuerpo de las secciones del manual, fuera del bloque de metadata, de la sección de pendientes y de los encabezados y separadores de tabla; y «su recibo queda en la corrida del proceso» es `.valmen/receipts/actualizar-manuales.jsonl`, con el formato de recibo vigente y sujeto `process:actualizar-manuales` (`buildReceipt`, `packages/gate/src/receipt.ts:234-301`; `appendReceipt`, `packages/engine/src/receipts.ts:70-79`).
- Riesgos y compatibilidad: (1) **el contrato de citas es nuevo y la dependencia que debía traerlo no está implementada**: si R-S3-002 publica la plantilla con otra forma de cita, el gate rechazaría manuales escritos con ella; se mitiga dejando la forma en un solo lugar escrito (docs + ayuda del comando + mensajes del check) y avisando en la tarjeta de la dependencia, y es corregible sin tocar el veredicto de ningún manual ya auditado. (2) **el archivo de proceso es compartido con R-S3-002**, que va a agregar ahí su paso de escritura: el paso de auditoría se agrega **al final** y el cambio es aditivo, con el hotspot declarado. (3) **un manual cuya sección de errores se alimenta de un servicio** puede no citar literal en las fuentes de la pantalla: ese check queda en `review` y no bloquea (decisión 4 del plan), para no producir un rojo falso. (4) **compatibilidad del cruce de frescura**: aceptar `ruta:línea` en `rutas-fuente` cambia el parser que usa `manualesPendientes`; los tokens sin línea conservan el comportamiento actual y la convivencia se cubre con un criterio propio. (5) **el harness no tiene manuales propios**: la auditoría se prueba con manuales de laboratorio en `tests/`, no con un corpus real, y el corpus real (SaiOpenCloud) no se toca.
- Impactos de sync, migración, Docker o despliegue: ninguno. **Sync:** no se toca el camino de sincronización ni la proyección a `AGENTS.md`; lo que se agrega es un subcomando del CLI, un módulo del motor y un paso declarado en un proceso. **Migración:** no hay cambio de esquema ni de contrato de datos, y el formato del recibo es el vigente (`RECEIPT_VERSION = 1`, `packages/gate/src/receipt.ts:28`). **Docker:** no se toca ninguna imagen ni servicio. **Despliegue:** el paso de auditoría se declara dentro de `actualizar-manuales`, que el `deploy` encadena con `continue_on_failure: true` y `notify_on_failure: true` (`.valmen/processes/deploy.yaml:34-40`, cubierto por `tests/procesos-deploy-manuales.test.ts`); este ticket no corre ningún despliegue y no modifica esa garantía.

## Plan

- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan). Orden del PO, citada literal: «Dale, los ejecuto YA en orden (cf: 7 del EVOLUCION-HARNESS, commit sí por ticket al llegar a awaiting_user_tests, push con orden aparte del PO)».

### Decisiones

1. **La evidencia de una afirmación es la anotación `<!-- cita: <ruta>:<línea> -->`, en la misma línea de la afirmación o en la de abajo.** Es la forma que el diseño ya nombraba —una cita por afirmación contra el código real— y la única que se resuelve sin modelo: la ruta y la línea se comprueban contra el disco. Alternativa descartada: un bloque de citas al frente del manual, que ata la cita a un índice en vez de a la afirmación y se desincroniza al reordenar el texto; también se descartó reutilizar `<!-- rutas-fuente: … -->`, que declara de qué archivos **habla** el manual y no qué afirma de ellos, y cuyo parser (`fuentesDe`, `packages/engine/src/manuales.ts:130-137`) devuelve tokens sin línea.
2. **Una afirmación es una línea visible de una sección del manual**: fuera de los comentarios HTML (el bloque de metadata y las propias citas), fuera de los encabezados, fuera de los separadores de tabla y fuera de la sección de pendientes —cuya cabecera contiene «pendiente», sin distinguir mayúsculas—. La anotación de la misma línea o de la línea siguiente adjunta la cita. Alternativa descartada: exigir la cita a **cada** línea del archivo, encabezados y tablas incluidos, que produce rojos falsos sobre texto que no afirma comportamiento.
3. **El veredicto es por manual y en tres estados — `approve`, `block`, `review` —; el de la corrida es el peor de los tres.** `block` cuando una afirmación no declara cita, cuando una cita no resuelve (ruta inexistente, línea fuera del archivo o línea vacía), cuando la cita está mal formada (sin línea o con línea no numérica) o cuando una ruta técnica con extensión de fuente se filtró al texto visible. `review` cuando no hay nada que bloquear y lo único que falta es el check de la decisión 4, o cuando no hay ningún manual que auditar. `approve` cuando todos los manuales aprueban y hay al menos uno. Alternativa descartada: dos estados (aprueba/bloquea) sin banda de revisión, que volvería rojo del paso de proceso lo que el diagnóstico declara como no decidible en código.
4. **El check de los mensajes de error queda en `review` y no bloquea.** Un literal entre backticks o comillas de la sección de errores que no aparece en las fuentes citadas no bloquea, porque un mensaje puede venir de un servicio que la pantalla consume y no de sus fuentes: es el riesgo declarado en el diagnóstico y el diseño ya lo dejaba como proposición de modelo (`docs/05-PLUGINS.md:390-397`). Alternativa descartada: bloquear por mensaje ausente, que produciría el rojo falso que el diagnóstico anticipa.
5. **El módulo nuevo es `packages/engine/src/manuales-auditar.ts`, y el recibo se arma ahí con el formato vigente.** `auditarManuales(paths, opciones)` calcula el veredicto por manual, `renderAuditoria(resultado)` lo imprime y `reciboDeAuditoria(resultado, opciones)` construye el `GateReceipt` con `buildReceipt` (`packages/gate/src/receipt.ts:234-301`): `gate: "manuals"`, la política por defecto, `subject: {type: "process", id: "actualizar-manuales", revision: <sha256 del corpus auditado>}` y un `mechanicalCheck` por check con su resultado. El comando lo anexa con `appendReceipt(paths, "actualizar-manuales", recibo)` (`packages/engine/src/receipts.ts:70-79`), que lo deja en `.valmen/receipts/actualizar-manuales.jsonl`. Alternativa descartada: escribir el recibo con otra forma, que dejaría dos formatos en `.valmen/receipts/` y rompería el lector único; y la de que el sujeto fuera el ticket, que no aplica porque este gate no protege ninguna transición de ticket (`packages/engine/src/gate.ts:54-57`).
6. **La corrida sale 0 solo con `approve`**: `EXIT_OK` con `approve`, `EXIT_AMBIGUOUS` (6) con `review` y `EXIT_INVARIANT` (3) con `block`, que son los códigos que el CLI ya usa para «hay algo que decidir» y «el contrato no se cumple». Alternativa descartada: un único código distinto de cero para los dos, que impide que el proceso distinga lo que hay que mirar de lo que hay que arreglar.
7. **El paso de auditoría se agrega al final de `.valmen/processes/actualizar-manuales.yaml`, `kind: command`, con `valmen manuales auditar --manuales-dir {manualesdir}` y `evidence: [stdout]`.** Va al final para no reordenar los pasos que la dependencia R-S3-002 va a agregar en el mismo archivo, y el `deploy` ya encadena el proceso con `continue_on_failure: true` y `notify_on_failure: true` (`.valmen/processes/deploy.yaml:34-40`), así que un manual bloqueado avisa y no corta la release. Alternativa descartada: declarar un gate `manuals` nuevo en `GATES` (`packages/gate/src/definitions.ts:321-325`), al que el motor no puede llegar porque `runGate` exige un ticket como sujeto.

### Trazabilidad decisión → hallazgo del diagnóstico

- El hallazgo «el harness lee del manual qué archivos menciona y nunca qué dice de ellos» son las decisiones 1 y 2: el contrato de citas y la definición de afirmación son lo que vuelve computable el contraste.
- El hallazgo «`fuentesDe` devuelve tokens sin línea y `esRutaDeArchivo` descartaría `ruta:NN`» es la decisión 1: la cita lleva línea propia y no se improvisa sobre `rutas-fuente`.
- El hallazgo «no hay gate `manuals` y el sujeto real es la corrida del proceso» son las decisiones 5 y 7: el veredicto viaja en un recibo con sujeto de proceso y el paso vive en el proceso, no en `GATES`.
- El riesgo 3 del diagnóstico —el mensaje de error que viene de un servicio— es la decisión 4.
- El hotspot declarado con `AGENT-DOCS-GENERAR-MANUAL-MARKDOWN-20260926` sobre `.valmen/processes/actualizar-manuales.yaml` es la decisión 7 y su orden: el cambio es aditivo y va al final.

### Pasos ordenados

1. Crear `packages/engine/src/manuales-auditar.ts` —archivo nuevo— con el parser de citas, la definición de afirmación, los tres checks (`citas_presentes`, `citas_resuelven`, `sin_rutas_tecnicas`), el check de literales que aparta la decisión 4, `auditarManuales`, `renderAuditoria` y `reciboDeAuditoria`. El encabezado del archivo deja escrito el contrato y el porqué de cada decisión, como los demás módulos del motor.
2. Exportar el módulo desde `packages/engine/src/index.ts` —archivo modificado, una línea, junto a `export * from "./manuales.js"` (`:38`)— para que el CLI y las pruebas lo alcancen.
3. Agregar `manualesAuditarCommand` a `packages/cli/src/commands.ts` —archivo modificado, junto a `manualesPendientesCommand` (`:2108-2166`)—: lee `--manuales-dir`, llama a `auditarManuales`, imprime `renderAuditoria`, anexa el recibo con `appendReceipt` y devuelve el código de salida de la decisión 6.
4. Despachar el subcomando en `packages/cli/src/manuales.ts` (`:23-39`) —archivo modificado— y ampliar el mensaje de subcomando desconocido para que nombre `pendientes` y `auditar`; el módulo ya recibe `root`, `args` y `flags`, así que su firma no cambia.
5. Documentar el comando en la ayuda de `packages/cli/src/main.ts` —archivo modificado, debajo de `manuales pendientes` (`:270-279`)— con el contrato de citas y la ruta del recibo; `--manuales-dir` ya está en la lista de banderas con valor (`:431-434`) y se reutiliza.
6. Agregar el paso `auditar-manuales` al final de `.valmen/processes/actualizar-manuales.yaml` (`:20-25`) —archivo modificado— con `kind: command`, `run: valmen manuales auditar --manuales-dir {manualesdir}` y `evidence: [stdout]`.
7. Escribir el contrato de citas en `docs/03-GATES.md` —archivo modificado—: en la sección del gate `manuals` (cuya fila ya está en la tabla de `§8`, `:955`), la forma de la anotación, qué es una afirmación, los tres veredictos y la ruta del recibo.
8. Crear `tests/manuales-auditar.test.ts` —archivo nuevo— con el laboratorio temporal de `tests/manuales-pendientes.test.ts` (`:29-98`): los tres veredictos, las causas de bloqueo, el check que aparta la decisión 4, el caso sin manuales, el código de salida y el recibo con su sujeto.
9. Extender `tests/procesos-deploy-manuales.test.ts` —archivo modificado— con la aserción del paso nuevo del proceso: que `actualizar-manuales` carga con `auditar-manuales`, `kind: command`, y que su `run` contiene `valmen manuales auditar`, sin tocar las dos pruebas que ya cubren el encadenamiento y el fallo que no corta la release.
10. Correr `npx vitest run tests/manuales-auditar.test.ts`, después `npx vitest run tests/procesos-deploy-manuales.test.ts` y después la batería completa `npx vitest run`; anotar los tres resultados y su línea base.
11. Correr `npm run typecheck` —compila los paquetes y verifica tipos— para descartar errores del módulo nuevo antes de la compuerta de entrega.

- Archivos afectados: `packages/engine/src/manuales-auditar.ts` (nuevo), `packages/engine/src/index.ts` (modificado), `packages/cli/src/commands.ts` (modificado), `packages/cli/src/manuales.ts` (modificado), `packages/cli/src/main.ts` (modificado), `.valmen/processes/actualizar-manuales.yaml` (modificado), `docs/03-GATES.md` (modificado), `tests/manuales-auditar.test.ts` (nuevo) y `tests/procesos-deploy-manuales.test.ts` (modificado).
- Rollback: `git checkout -- packages/engine/src/index.ts packages/cli/src/commands.ts packages/cli/src/manuales.ts packages/cli/src/main.ts .valmen/processes/actualizar-manuales.yaml docs/03-GATES.md tests/procesos-deploy-manuales.test.ts` y `rm packages/engine/src/manuales-auditar.ts tests/manuales-auditar.test.ts` —las dos rutas nuevas no están en `HEAD` y no las saca `git checkout`—. Lo que sobrevive al revert: los recibos ya emitidos en `.valmen/receipts/actualizar-manuales.jsonl`, que el registro append-only no reescribe; el resto del proceso `actualizar-manuales` con su paso de detección, que queda como estaba; y el corpus de manuales de otros proyectos, que este ticket no toca.

## Criterios de aceptación

- [x] `valmen manuales auditar` decide `approve` cuando cada afirmación del manual declara su cita y cada cita resuelve a un archivo real y a una línea existente y no vacía
      <!-- test: npx vitest run tests/manuales-auditar.test.ts -->
- [x] `valmen manuales auditar` imprime el veredicto de cada manual que auditó
      <!-- test: npx vitest run tests/manuales-auditar.test.ts -->
- [x] `valmen manuales auditar` sale con código 0 cuando el veredicto de la corrida es `approve`
      <!-- test: npx vitest run tests/manuales-auditar.test.ts -->
- [x] Un manual con una afirmación sin cita queda en `block`
      <!-- test: npx vitest run tests/manuales-auditar.test.ts -->
- [x] La corrida con un manual en `block` sale con código 3
      <!-- test: npx vitest run tests/manuales-auditar.test.ts -->
- [x] Una cita que apunta a una ruta que no existe en el repositorio queda en `block`
      <!-- test: npx vitest run tests/manuales-auditar.test.ts -->
- [x] Una cita cuya línea cae fuera del archivo citado queda en `block`
      <!-- test: npx vitest run tests/manuales-auditar.test.ts -->
- [x] Una cita cuya línea está vacía queda en `block`
      <!-- test: npx vitest run tests/manuales-auditar.test.ts -->
- [x] Una cita cuya línea no es un número queda en `block`
      <!-- test: npx vitest run tests/manuales-auditar.test.ts -->
- [x] Una ruta técnica con extensión de archivo fuente que aparece en el texto visible del manual queda en `block`
      <!-- test: npx vitest run tests/manuales-auditar.test.ts -->
- [x] Un literal entre comillas de la sección de errores que no aparece en las fuentes citadas deja el manual en `review`
      <!-- test: npx vitest run tests/manuales-auditar.test.ts -->
- [x] Un manual en `review` no bloquea la corrida: el veredicto de la corrida es `review` y no `block`
      <!-- test: npx vitest run tests/manuales-auditar.test.ts -->
- [x] Un directorio de manuales sin ningún `.md` deja el veredicto de la corrida en `review`
      <!-- test: npx vitest run tests/manuales-auditar.test.ts -->
- [x] La corrida con veredicto `review` sale con código distinto de 0
      <!-- test: npx vitest run tests/manuales-auditar.test.ts -->
- [x] El recibo de la corrida queda en `.valmen/receipts/actualizar-manuales.jsonl` con sujeto `process:actualizar-manuales`
      <!-- test: npx vitest run tests/manuales-auditar.test.ts -->
- [x] El recibo de la corrida guarda el veredicto de cada manual auditado y el resultado de cada check mecánico
      <!-- test: npx vitest run tests/manuales-auditar.test.ts -->
- [x] El proceso `actualizar-manuales` carga con el paso `auditar-manuales` de tipo `command`, que corre `valmen manuales auditar`, y el `deploy` lo sigue encadenando sin cortar la release
      <!-- test: npx vitest run tests/procesos-deploy-manuales.test.ts -->
- [x] La ayuda del CLI documenta `manuales auditar` con el contrato de citas, los tres veredictos y la ruta del recibo
      <!-- test: npx vitest run tests/manuales-auditar.test.ts -->

## Puntos

```json
[]
```

## Implementación

- Quién escribió qué: el código lo escribió una sesión de OpenCode (`opencode run --standalone --auto`, modelo `opencode-go/deepseek-v4.1-flash`) sobre el plan aprobado, y el ticket, la verificación y las corridas de las pruebas son del orquestador. **El orquestador no editó ningún archivo de código**, así que no hay corrección posterior al ejecutor: el commit le atribuye al ejecutor lo que el ejecutor escribió.
- El contrato de citas quedó en `packages/engine/src/manuales-auditar.ts` (nuevo, 797 líneas): la anotación `<!-- cita: <ruta>:<línea> -->` en la misma línea de la afirmación o en la de abajo; una afirmación es una línea de cuerpo visible —fuera de los comentarios HTML, de los encabezados, de los separadores de tabla y de la sección de pendientes—; la cita resuelve si el archivo existe y la línea cae dentro y no está vacía; los tres veredictos por manual con la corrida tomando el peor; y `reciboDeAuditoria`, que arma el `GateReceipt` con `buildReceipt` —`gate: "manuals"`, la política por defecto, sujeto `process:actualizar-manuales` con la revisión en el sha256 del corpus auditado y un check mecánico por causa—.
- El comando `valmen manuales auditar` (`packages/cli/src/commands.ts` y su despacho en `packages/cli/src/manuales.ts`, con la ayuda en `packages/cli/src/main.ts`) imprime el veredicto de cada manual y anexa el recibo con `appendReceipt` en `.valmen/receipts/actualizar-manuales.jsonl`; sale 0 con `approve`, 6 con `review` y 3 con `block`.
- El paso `auditar-manuales` quedó declarado al final de `.valmen/processes/actualizar-manuales.yaml` (`kind: command`, `run: valmen manuales auditar --manuales-dir {manualesdir}`, `evidence: [stdout]`), sin reordenar el paso de detección con el que la dependencia R-S3-002 comparte el archivo.
- El contrato quedó escrito en la sección nueva `docs/03-GATES.md` §8.1: la anotación, qué cuenta como afirmación, los tres veredictos con sus causas, los cuatro checks y el sujeto del recibo.
- Desvío del orquestador respecto del plan, declarado: la sesión de OpenCode se lanzó con `--auto` además de `--standalone`. Con `--standalone` y sin `--auto`, el servidor privado de OpenCode trata las rutas absolutas del repositorio como `external_directory` y auto-rechaza las lecturas —el primer lanzamiento murió en el primer `Read`—; `--auto` es la bandera documentada para aprobar lo que no está explícitamente denegado, no amplía el alcance del ticket y el alcance siguió cerrado a los nueve archivos del plan.
- Desvíos menores del ejecutor, que no cambian el contrato: la ayuda del CLI no lleva backticks alrededor de la anotación porque el `USAGE` es un template literal; los cuatro checks se llaman `citas_presentes`, `citas_resuelven`, `sin_rutas_tecnicas` y `mensajes_de_error`; y la ruta técnica exige separador de ruta —`src/app/x.ts` sí, `Node.js` no—.

## Pruebas

- Prueba enfocada del ticket: `npx vitest run tests/manuales-auditar.test.ts` — **17 pruebas, todas en verde**.
- Prueba del paso del proceso: `npx vitest run tests/procesos-deploy-manuales.test.ts` — **3 pruebas en verde**, la nueva del paso `auditar-manuales` más las dos que ya cubrían el encadenamiento y que un fallo de manuales no corta la release.
- Batería completa: `npx vitest run` — **83 archivos en verde, 1 salteado (84); 1612 pruebas en verde, 48 salteadas (1660)**; sin fallos. Línea base del repositorio antes del cambio: 82 archivos y 1594 pruebas, sin fallos; la diferencia son las 18 pruebas que agrega el ticket —17 de la auditoría y 1 del proceso—, así que la suite las está recolectando. Corrida del orquestador, sobre el árbol del cambio.
- `npm run typecheck` (compila los paquetes y verifica tipos): sin errores.
- Verificación del orquestador sobre el producto y no sobre el auto-reporte: se corrió `valmen manuales auditar` con el CLI compilado contra tres laboratorios temporales y los veredictos salieron con el código de salida que el plan decide. `approve` con un manual cuya cita resuelve: salida 0 y recibo con `gate: "manuals"` y sujeto `process:actualizar-manuales`. `block` con las cinco causas —afirmación sin cita, ruta inexistente, línea fuera del archivo, cita mal formada y ruta técnica en el texto visible—: salida 3 y los tres checks de citas en `fail`. `review` con el literal de error ausente de las fuentes citadas: salida 6 y `mensajes_de_error` en `warn`. Y un directorio sin manuales: salida 6, los cuatro checks en `skip` y veredicto `review`.
- Contrato de pruebas para quien retome: comando `npx vitest run`, directorio la raíz del repositorio, resultado esperado 1612 pruebas en verde y ningún fallo, sin requisitos de ambiente —el harness no tiene dependencias externas ni base de datos—.
- Criterios 13 a 18 (la banda de revisión, el recibo y el paso del proceso): la compuerta despliega como máximo doce criterios como proposiciones (`MAX_CRITERIA_PROPOSITIONS`, `packages/gate/src/dynamic.ts:21`), así que sus comandos no los corrió el gate y los corrí directamente: `npx vitest run tests/manuales-auditar.test.ts` (17 en verde, con los casos de esos criterios entre ellos) y `npx vitest run tests/procesos-deploy-manuales.test.ts` (3 en verde, con la aserción del paso `auditar-manuales`). Quedan marcados con esa corrida directa y no con un recibo de compuerta, y se deja dicho acá para que el registro pueda distinguirlo. El gate sí corrió los doce primeros criterios y los doce dieron 1,00.

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
    "description": "Verificación del orquestador sobre el árbol del cambio: npx vitest run tests/manuales-auditar.test.ts (17 pruebas en verde), npx vitest run tests/procesos-deploy-manuales.test.ts (3 en verde) y la batería completa npx vitest run (1612 en verde y 48 salteadas sobre 1660; línea base 1594 sin fallos), más npm run typecheck sin errores y las cuatro corridas directas de valmen manuales auditar contra laboratorios temporales con salida 0, 3, 6 y 6. El hash cubre, en orden alfabético, los nueve archivos del cambio: .valmen/processes/actualizar-manuales.yaml, docs/03-GATES.md, packages/cli/src/commands.ts, packages/cli/src/main.ts, packages/cli/src/manuales.ts, packages/engine/src/index.ts, packages/engine/src/manuales-auditar.ts, tests/manuales-auditar.test.ts y tests/procesos-deploy-manuales.test.ts. El ticket no tiene puntos, así que la referencia la computó el verificador con el encuadre del contrato (longitud de la ruta y del contenido en 8 bytes big-endian).",
    "reference": "worktree:sha256:348f292cd53c31a0bf5912bfb5ee36096482bf6ecea2556ed4b25dc960fc21cb",
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
    "session_reference": "ses_f10d2cf8effeVZY4IkUk8kzrZ6",
    "model": "opencode-go/deepseek-v4.1-flash",
    "reasoning_effort": null,
    "notes": "Primer lanzamiento de OpenCode del ticket, muerto en la primera lectura: el servidor standalone trató las rutas del repositorio como external_directory y auto-rechazó los Read. Relanzado con la bandera auto.",
    "input_tokens": 13008,
    "output_tokens": 237,
    "total_tokens": 13274,
    "estimated_cost_usd": 0.00211195,
    "source": "opencode:/Users/juanandrade/.local/share/opencode/opencode.db",
    "confidence": "high",
    "id": "CONSUMO-001"
  },
  {
    "kind": "ai-usage",
    "date": "2026-09-29",
    "session_reference": "ses_f10cfea95ffenW0n8on4F5HCqs",
    "model": "opencode-go/deepseek-v4.1-flash",
    "reasoning_effort": null,
    "notes": "Sesión de OpenCode que implementó el contrato de citas del ticket: los nueve archivos del plan escritos y las pruebas corridas.",
    "input_tokens": 142425,
    "output_tokens": 22093,
    "total_tokens": 203740,
    "estimated_cost_usd": 0.06941585,
    "source": "opencode:/Users/juanandrade/.local/share/opencode/opencode.db",
    "confidence": "high",
    "id": "CONSUMO-002"
  },
  {
    "kind": "ai-usage",
    "date": "2026-09-29",
    "session_reference": "20260929_161702_624276",
    "model": "opencode-go/deepseek-v4.1-flash",
    "reasoning_effort": null,
    "notes": "Sesión de Hermes del eslabón anterior del ticket en el tablero kanban: escribió el diagnóstico y corrió la compuerta de análisis dos veces, que el PO aprobó en Slack. El proveedor factura por suscripción y la base no calcula el costo.",
    "input_tokens": 180183,
    "output_tokens": 44680,
    "total_tokens": 256593,
    "estimated_cost_usd": null,
    "source": "hermes:/Users/juanandrade/.hermes/profiles/valmen-harness/state.db",
    "confidence": "high",
    "id": "CONSUMO-003"
  },
  {
    "kind": "ai-usage",
    "date": "2026-09-29",
    "session_reference": "20260929_165104_31dce2",
    "model": "opencode-go/deepseek-v4.1-flash",
    "reasoning_effort": null,
    "notes": "Sesión de Hermes de este eslabón: escribió el plan, lanzó y verificó la implementación de OpenCode, anotó la evidencia y corrió la compuerta de entrega. Costo no calculado en la base y lectura al momento de registrar con el turno todavía en curso.",
    "input_tokens": 550788,
    "output_tokens": 53099,
    "total_tokens": 635527,
    "estimated_cost_usd": null,
    "source": "hermes:/Users/juanandrade/.hermes/profiles/valmen-harness/state.db",
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
    "date": "2026-09-26",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-09-29",
    "at": "2026-09-29T21:22:37.012Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-09-29",
    "at": "2026-09-29T21:39:23.691Z",
    "action": "gate-approved",
    "actor": "cli",
    "details": "Gate analysis aprobado por Juan Andrade: «Apruebo el review puedes continuar» (PO por Slack, 2026-09-29; diagnostico_explica_el_sintoma y nombra_archivos_reales en banda por ruido del caso(signal) — diagnóstico completo con citas verificado)"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-09-29",
    "at": "2026-09-29T21:55:11.933Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-09-29",
    "at": "2026-09-29T21:56:59.779Z",
    "action": "gate-approved",
    "actor": "cli",
    "details": "Gate plan aprobado por Delegación del PO (Juan Andrade): «Dale, los ejecuto YA en orden (cf: 7 del EVOLUCION-HARNESS, commit sí por ticket al llegar a awaiting_user_tests, push con orden aparte del PO)»: La banda es de redacción y no de fondo, y está medida dos veces en el mismo evaluador: la media bajó de 0.855 a 0.844 al partir los cinco criterios compuestos en atómicos, que es justo lo que el informe de la primera corrida pedía —la misma bajada que documenta el registro del harness—. Lo que el gate no marca: clasificacion=completo, pasos_ejecutables=0.96, hay_archivos_afectados=0.98, criterios_verificables=0.95, rollback_suficiente=0.91 y los cuatro checks mecánicos pasan. Los nueve criterios en banda son el bloque de criterios de un ticket de arnés, cuyo veredicto lo dan los comandos del gate mecánico y no el modelo. La sesión sigue y lo deja dicho en la entrega para que el PO lo pueda revertir."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-09-29",
    "at": "2026-09-29T21:57:08.861Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-09-29",
    "at": "2026-09-29T21:57:20.058Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-09-29",
    "at": "2026-09-29T22:18:41.351Z",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-09-29",
    "at": "2026-09-29T22:20:21.943Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-09-29",
    "at": "2026-09-29T22:20:57.672Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-09-29",
    "at": "2026-09-29T22:20:57.830Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-002."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-09-29",
    "at": "2026-09-29T22:20:57.971Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-003."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-09-29",
    "at": "2026-09-29T22:20:58.142Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-004."
  }
]
```
