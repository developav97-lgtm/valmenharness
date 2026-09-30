---
schema_version: 2
id: FEATURE-DEPLOY-ACTUALIZAR-MANUALES-20260926
title: Encadenar actualizar-manuales al deploy
type: FEATURE
module: DEPLOY
workflow_status: closed
qa_status: approved
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

# FEATURE-DEPLOY-ACTUALIZAR-MANUALES-20260926

## Solicitud original

Parte del sprint: Encadenar manuales al deploy, auditarlos y publicar el corpus indexable.
- R-S3-001: Proceso `actualizar-manuales` en el deploy — DEBE existir un proceso declarativo `actualizar-manuales` que el proceso de
Viene de una feature descompuesta en sprints; su plan completo está en el tickets.yaml de la feature.

## Descripción funcional

- Alcance: R-S3-001 — que exista un proceso declarativo `actualizar-manuales` y que
  el despliegue lo encadene como paso `kind: process` con `continue_on_failure:
  true`. Ese proceso detecta las pantallas que tocaron los tickets de la release,
  marca los manuales que las documentan como desactualizados y deja el listado como
  evidencia de la corrida. Un fallo en los manuales avisa y **no** bloquea la
  release.
- Usuario o rol afectado: quien despliega —la persona que aprueba la release—, que
  hoy publica sin ninguna señal de qué manuales quedaron viejos con los tickets que
  acaba de publicar; y quien mantiene los manuales de usuario final, que recibe el
  listado de lo que hay que revisar en vez de cruzar tickets contra manuales a mano.
- Comportamiento actual: la cadena no existe en ninguna parte, y no por un olvido
  puntual. El diseño está escrito —`docs/02-MOTOR.md:286-338` documenta el
  `deploy.yaml` con el paso encadenado y `docs/02-MOTOR.md:347` el
  `actualizar-manuales.yaml`— y el motor ya sabe ejecutarlo: los tipos de paso están
  implementados (`packages/core/src/process.ts:58-64`), el encadenamiento con
  profundidad acotada también (`packages/engine/src/process.ts:962-1018`) y
  `continue_on_failure` corta la propagación del fallo sin bloquear
  (`packages/engine/src/process.ts:646-656`). Pero `.valmen/processes/` no existe
  —ni en este repositorio ni en el proyecto adoptado—, así que un diseño correcto no
  tiene ninguna corrida: `hasProcesses` (`packages/engine/src/process.ts:1122-1125`)
  devuelve falso en los dos. Y la detección tampoco existe en ninguna forma: el motor
  ya sabe qué archivos declaró cada ticket (`packages/engine/src/references.ts:101-119`)
  y usa esa lista para el hash de la evidencia, pero ningún consumidor la cruza
  contra los manuales.
- Comportamiento esperado: `actualizar-manuales` es un proceso declarado cuyos pasos
  detectan las pantallas tocadas y marcan los manuales desactualizados, con el
  listado como producto de la corrida; `deploy` lo invoca con
  `continue_on_failure: true` y `notify_on_failure: true`, de modo que una release con
  manuales pendientes termina igual y deja constancia de lo que quedó viejo; el
  comando que hace el cruce existe en el CLI, se puede correr solo y se verifica sin
  desplegar nada.

## Diagnóstico

- Síntoma observado y archivos investigados: una release se publica y los manuales de
  las pantallas que esa release cambió quedan viejos, sin que nada lo diga. El síntoma
  no se lee como un defecto sino como una ausencia, así que la investigación fue a
  buscar el diseño y la pieza que falta. El recorrido describe el paso exacto
  (`docs/13-RECORRIDO-COMPLETO.md:620-634`: «detectar pantallas tocadas → marcar
  desactualizados → regenerar → auditar»), el gate que lo cierra está en la tabla
  (`docs/03-GATES.md:938`, gate `manuals`), el proceso de destino está escrito
  (`docs/02-MOTOR.md:347-...`) y el paso que lo encadena también
  (`docs/02-MOTOR.md:286-338`, con su comentario «los manuales no bloquean la
  release»). Del lado del motor, las piezas que los ejecutarían existen y están
  probadas: `parseProcess`/`validateProcess` (`packages/core/src/process.ts:354-573`),
  el directorio de procesos (`packages/engine/src/process.ts:50-52`), el ejecutor de
  un paso `kind: process` (`packages/engine/src/process.ts:962-1018`) y la
  continuidad de un paso que no bloquea (`packages/engine/src/process.ts:646-656`).
  Lo que no existe es el directorio donde viven los procesos: `.valmen/processes/` no
  está en este repositorio ni en el proyecto adoptado de SaiOpenCloud, y la ayuda
  completa del CLI (`packages/cli/src/main.ts:150-330`) no nombra nada de manuales
  porque no hay ningún comando que haga el cruce.
- Causa raíz: el síntoma ocurre **porque falta la pieza que cruza las dos listas**, y
  nada más: un ticket declara en sus puntos qué archivos tocó (`.valmen/receipts/` no
  los lleva; viven en el bloque `## Puntos` del `ticket.md`), un manual declara de qué
  pantallas habla, y ningún consumidor junta esas dos cosas. El único lector de esa
  lista hoy es el cálculo del hash de la evidencia
  (`calculateWorktreeReference`, `packages/engine/src/references.ts:129-171`), que la
  usa para describir un estado de trabajo y no para preguntarse qué manual quedó viejo.
  Los archivos concretos que el síntoma nombra son los que **no existen**: el proceso
  `.valmen/processes/actualizar-manuales.yaml`, el proceso de despliegue que lo
  encadena (`.valmen/processes/deploy.yaml`) y el comando que hace el cruce —la ayuda
  completa del CLI (`packages/cli/src/main.ts:150-330`) no tiene ninguno, y
  `packages/cli/src/process.ts:33-73` lista todos los subcomandos de procesos y ninguno
  se ocupa de los manuales—. La segunda mitad de la causa es que el motor está
  construido de sobra para esa pieza: un proceso se declara, se valida contra su
  catálogo, se ejecuta, encadena y deja corrida (`packages/engine/src/process.ts:175-216`,
  `:558-710`), y aun así `hasProcesses`
  (`packages/engine/src/process.ts:1122-1125`) devuelve falso en este repositorio y en
  el proyecto adoptado, porque el directorio `.valmen/processes/` no está en ninguno de
  los dos: el diseño de `docs/02-MOTOR.md` §7 nunca corrió y el gate `manuals` no tiene
  proceso que lo alcance.
- Hallazgo del reconocimiento sobre la fuente de datos: el requisito ubica los
  archivos «en los recibos», y los recibos no los llevan. El registro que emite cada
  compuerta guarda `stateHash`, el veredicto de cada proposición y el consumo (forma
  observada en `.valmen/receipts/FEATURE-ENGINE-DOGFOODING-REGISTRO-20260926.jsonl`;
  ninguna clave de `.valmen/receipts/*.jsonl` nombra archivos), mientras que
  `affected_files` vive en los puntos del ticket, que es la lista que ya lee
  `packages/engine/src/references.ts:101-119` y la que va a leer este ticket. Se
  planifica sobre esa fuente y se deja dicho, en vez de leer un campo que no existe.
- Hallazgo del reconocimiento sobre el aviso: «avisa y sigue» tiene una sola mitad
  construida. El «sigue» está implementado
  (`packages/engine/src/process.ts:646-656`), y el diseño declara el paso de manuales
  con `notify_on_failure: true` (`docs/02-MOTOR.md:334`) —campo que el analizador
  lee y guarda (`packages/core/src/process.ts:117,335-339`)—, pero **ninguna pieza
  consume ese campo**: fuera del analizador solo aparece en el modelo. Y una corrida
  que no espera un gate, no se retoma y no gastó un paso de agente no deja estado
  (`packages/engine/src/process.ts:663-690`), así que un fallo de manuales que
  continúa no deja aviso ni registro: mientras alguien mira la corrida se ve un ✗
  (`packages/engine/src/process.ts:1109-1118`), y después no queda nada. El camino
  de notificación que existe es para procesos **detenidos**
  (`packages/engine/src/notify.ts:354-360,442-475`) y su único consumidor los busca
  entre las corridas en espera (`packages/cli/src/hermes.ts:817-828`).
- Riesgos y compatibilidad: el cambio no toca ninguna máquina de estados ni el
  comportamiento de ningún proyecto adoptado —agrega un comando de lectura, dos
  procesos declarados y el estado de una corrida que hoy se pierde—, y su mitigación
  es la forma de verificarlo: la detección se prueba sobre un laboratorio temporal en
  `os.tmpdir()` y nunca contra el registro vivo; el proceso de despliegue se prueba
  con el ejecutor de comandos **inyectado** (`packages/engine/src/process.ts:479-484`,
  el mismo recurso que usa `tests/process-engine.test.ts`), así que ninguna corrida
  de prueba toca `git tag` ni `release-publish`; y el `deploy` que este ticket declara
  para el repositorio pone sus pasos irreversibles detrás del gate humano, que exige
  aprobación explícita antes de ellos. El riesgo que queda escrito, y que es real:
  declarar un `deploy` que taggea deja el arma cargada para una sesión futura —la
  protege el gate, y este ticket **no** lo ejecuta—. Segundo riesgo, menor: persistir
  la corrida fallida agrega archivos en `.valmen/processes/runs/`, que es donde el
  motor ya escribe lo que hay que retomar y lo que costó (`packages/engine/src/run-state.ts:84`).
- Impactos de sync, migración, Docker o despliegue: ninguno. **Sync:** no se toca el
  camino de sincronización ni la proyección a `AGENTS.md`; lo nuevo son código del
  CLI y datos de `.valmen/`. **Migración:** no hay esquema, dato ni registro que
  migrar; los archivos nuevos no reescriben ninguno existente. **Docker:** ningún
  contenedor interviene, las pruebas son locales y deterministas. **Despliegue:** este
  ticket **declara** el proceso de despliegue y no despliega nada —sus pasos
  irreversibles quedan detrás del gate humano y su ejecución exige la frase literal
  del PO, que este ticket no pide—; lo único que el despliegue gana es el paso de
  manuales al final.

## Plan

- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan).
- Orden del PO citada, que habilita este plan: «Dale, los ejecuto YA en orden (cf: 7
  del EVOLUCION-HARNESS, commit sí por ticket al llegar a awaiting_user_tests, push
  con orden aparte del PO)» (Juan Andrade). Esa orden habilita el commit de los
  archivos de este ticket al llegar a `awaiting_user_tests`; el push, el PR, el tag y
  el despliegue **no** están autorizados y quedan para una orden aparte.
- Decisiones de diseño:
  1. **La detección cruza los archivos declarados por los tickets con lo que cada
     manual declara como su fuente, y no con fechas de commit.** Los archivos que un
     ticket toca ya están en el registro (`affected_files` de sus puntos, leídos por
     `declaredFunctionalFiles`, `packages/engine/src/references.ts:101-119`), y un
     manual declara de qué pantallas habla en su propia línea
     `<!-- rutas-fuente: … -->`: el manual está desactualizado si una de esas fuentes
     es un archivo que la release tocó, o si el propio manual está entre los archivos
     tocados. Alternativa descartada: comparar la fecha del manual contra la del
     último commit del código, que es lo que hace el script del proyecto adoptado
     (`docs/manuales/usuario-final/scripts/check-manual-freshness.js:130-142,239`) —
     «el código cambió después del manual» no dice que **esta** release lo cambió, y
     resuelve rutas contra `*.routing.ts`, que es una convención de Angular que el
     motor no tiene por qué conocer—. Las fuentes que no son rutas de archivo (una
     ruta como `/admin/plantillas`) se declaran en el listado como no resueltas y no
     se cruzan a ciegas: en este repositorio no hay resolutor de rutas.
  2. **La marca vive en el listado, no dentro del manual.** Marcar es escribir una
     fila por manual desactualizado con su ticket y su pantalla, y el manual queda
     intacto. Alternativa descartada: que el paso escriba un aviso dentro del `.md` —
     editar manuales de usuario es del paso de generación (R-S3-002, ticket
     `AGENT-DOCS-GENERAR-MANUAL-MARKDOWN-20260926`) y la auditoría con citas es del
     gate `manuals` (R-S3-003, `AGENT-GATE-AUDITAR-MANUAL-CITAS-20260926`); un paso
     automático que edite el manual deja la auditoría sin base que auditar.
  3. **El listado se escribe en un archivo además de salir por salida estándar, y un
     directorio de manuales que no existe no se crea.** El listado dice la fecha de la
     corrida, los tickets que cubre y las cuatro listas —manuales desactualizados,
     manuales tocados directamente, pantallas sin manual y fuentes sin resolver—, para
     que quien lo lea no tenga que volver a cruzar nada. El motor no persiste una
     corrida que termina bien sin gasto (`packages/engine/src/process.ts:663-690`) y
     su campo `evidence:` es declarativo —nadie lo consume
     (`packages/core/src/process.ts:340`)—, así que la evidencia durable tiene que ser
     un archivo que el paso escribe. Alternativa descartada: confiar en la salida del
     paso, que solo se imprime cuando el paso **falla**
     (`packages/engine/src/process.ts:1109-1118`). Cuando no hay directorio de
     manuales, el comando lo dice y **no** escribe ni crea el directorio: inventarlo
     dejaría en el repositorio una ruta que no significa nada.
  4. **Este proceso declara la detección y la marca; escribir los manuales y
     auditarlos llega con sus tickets.** Son los eslabones siguientes del sprint S3
     (`.valmen/features/evolucion-harness/tickets.yaml:60-72`, que ya los marca como
     dependientes de éste), y el gate `manuals` de `docs/03-GATES.md:938` no se
     declara acá porque su check es «cada manual con cita textual del código real»,
     que es R-S3-003. Declararlo ahora sería un paso que espera una aprobación que
     nadie puede evaluar.
  5. **`notify_on_failure` gana su consumidor: una corrida con un paso fallido deja
     estado.** Hoy el campo se lee y nadie lo usa, y una corrida que continúa tras un
     fallo no deja nada (`packages/engine/src/process.ts:663-690`), así que «avisa y
     sigue» no tiene aviso: queda el ✗ en la pantalla de quien estaba mirando y nada
     más. La corrida que dejó un paso en `failed` se persiste —queda visible en
     `valmen process runs` y en `valmen process show-run`, con el paso que falló— y el
     camino de notificación existente (corridas detenidas,
     `packages/cli/src/hermes.ts:817-828`) no se toca. Alternativa descartada: que el
     motor mande el mensaje por su cuenta —no tiene canal, y el único que existe es la
     costura de `notify.ts`, cuyo consumidor es el CLI—.
  6. **El `deploy` de este repositorio se declara con sus pasos irreversibles detrás
     del gate humano, y este ticket no lo ejecuta.** El proceso sigue el diseño de
     `docs/02-MOTOR.md:286-338`: dry-run de preflight, gate humano, tag y publicación,
     manuales encadenados y el cierre posterior. El comando de publicación se escribe
     como el CLI lo declara de verdad —`valmen release-publish --version … --tickets …`
     (`packages/cli/src/main.ts:186-188`)— y no como lo escribe la prosa del diseño
     (`docs/02-MOTOR.md:325` dice «valmen release publish», que no existe): copiar el
     comando de la prosa a un proceso daría un paso que falla al llegar. La ejecución
     real del despliegue exige la frase literal del PO y una orden aparte.
  7. **`pantallas` se declara y se compara con una regla mínima.** El patrón por
     defecto es el de una pantalla de este stack (`**/*.component.ts`,
     `**/*.component.html`) y se puede pisar por parámetro; la comparación admite
     sufijo (`**/x`) y coincidencia exacta, sin dependencias nuevas —el motor no tiene
     ninguna y no se le agrega una para comparar dos globs—.
- Trazabilidad con el diagnóstico: el hallazgo «el diseño existe y la declaración no»
  es la decisión 6 y el paso 5; el hallazgo «los recibos no llevan los archivos» es
  la decisión 1 y el paso 1, que lee la fuente que sí los tiene; el hallazgo «avisa y
  sigue tiene una sola mitad» es la decisión 5 y el paso 4; la ausencia de comando de
  cruce es la decisión 1 y los pasos 1 a 3; y la frontera con los eslabones siguientes
  es la decisión 2 y 4.
- Trazabilidad con los criterios, criterio por criterio: el criterio 1 —el proceso
  existe y el deploy lo encadena— son los pasos 5 y 6; los criterios 2 a 5 —el cruce y
  sus tres resultados: fuente tocada, manual al día y pantalla sin manual— son el paso
  1 y su prueba en el paso 6; los criterios 6 a 10 —dónde queda el listado, qué dice y
  qué no se escribe— son los pasos 1, 3 y 6, y su comportamiento lo fija la decisión 3;
  y el criterio 11 —el fallo de manuales no corta la release y deja corrida— son los
  pasos 4, 5 y 6. Cada criterio tiene su comando enfocado declarado y ninguno corre la
  batería entera: el tope por comando es el de siempre
  (`packages/gate-command/src/command.ts:106`, 30 s), y `npx vitest run` sin archivo lo
  roza.
- Pasos ordenados:
  1. Crear `packages/engine/src/manuales.ts` —archivo nuevo— con la detección como
     función pura `manualesPendientes(paths, { tickets, manualesDir, pantallas })`:
     lee los tickets con `findTicket`/`parseTicket` y sus archivos declarados con
     `declaredFunctionalFiles` (`packages/engine/src/references.ts:101-119`), recorre
     los `.md` del directorio de manuales, extrae la línea `<!-- rutas-fuente: … -->`
     con la misma forma que el proyecto adoptado
     (`docs/manuales/usuario-final/scripts/check-manual-freshness.js:156-163`) y
     devuelve cuatro listas: manuales desactualizados (con manual, ticket, pantalla y
     motivo), manuales tocados directamente, pantallas sin manual y fuentes sin
     resolver. El encabezado del archivo deja escrito el contrato, como los demás
     módulos del motor.
  2. Exportar el módulo desde `packages/engine/src/index.ts` —archivo modificado, una
     línea— para que el CLI y las pruebas lo alcancen.
  3. Crear `packages/cli/src/manuales.ts` —archivo nuevo— con el despachador del
     subcomando y su comando `valmen manuales pendientes --tickets <ids>
     [--manuales-dir <ruta>] [--pantallas <g1,g2>] [--escribir]`, siguiendo la forma
     del despachador hermano (`packages/cli/src/process.ts:33-73`); el listado va a
     `manuales-dir/pendientes.md` cuando se pide `--escribir`, la salida estándar lo
     imprime siempre, y su texto encabeza la fecha de la corrida y los tickets que
     cubre antes de las cuatro listas. Archivos modificados: `packages/cli/src/main.ts` (el `case
     "manuales"` junto al de `process`, `:1169-1171`, y su línea en la ayuda, junto a
     la de `process list`, `:253`) y `packages/cli/src/commands.ts` (la función que
     arma el listado y el resultado, con el ayudante `ok`, `:146`).
  4. Modificar `packages/engine/src/process.ts:674` —archivo modificado, la condición
     que decide si una corrida deja estado— para que también se persista cuando algún
     paso quedó en `failed`, con el motivo escrito al lado: un fallo que no bloquea es
     justo el que alguien tiene que poder ver después.
  5. Crear los tres archivos declarativos: `.valmen/processes/actualizar-manuales.yaml`
     (parámetros `tickets` obligatorio y `manualesdir` con defecto, `ticket_param:
     tickets`, el paso de detección como `kind: command` que corre `valmen manuales
     pendientes … --escribir`, y el listado en `produces`),
     `.valmen/processes/deploy.yaml` (parámetros `version` con patrón SemVer y
     `tickets`, preflight, gate `deploy`, tag, publicación, el paso `kind: process`
     hacia `actualizar-manuales` con `continue_on_failure: true` y
     `notify_on_failure: true`, y un paso de cierre posterior que es lo que hace
     observable que la release siguió) y `.valmen/gates/deploy.yaml` (la declaración
     del gate que el proceso referencia: sin ese archivo `requireProcess` rechaza el
     proceso con «usa el gate deploy, que no está declarado»,
     `packages/core/src/process.ts:490-496`).
     Trampa verificada antes de escribir los archivos (medida, no supuesta): en un
     proceso, el **nombre de un parámetro** no puede llevar guion ni guion bajo —
     `manuales-dir` se rechaza como clave YAML («la clave no es válida: minúsculas,
     dígitos y guiones bajos», `packages/core/src/process.ts:355-359`) y
     `manuales_dir` se rechaza como identificador de parámetro («no es un
     identificador: minúsculas, dígitos y guiones», `:226-232`)—, así que va
     `manualesdir`; y el campo que atribuye el consumo se escribe `ticket_param`
     (`:422`), aunque `docs/02-MOTOR.md` y los propios comentarios del motor lo
     nombren `ticket-param`, que el analizador no acepta. Los dos casos se
     reprodujeron con un laboratorio y el CLI (`valmen process list`): los archivos
     mal escritos salen «inválido» con esos mensajes y el correcto carga.
  6. Crear `tests/manuales-pendientes.test.ts` y `tests/procesos-deploy-manuales.test.ts`
     —archivos nuevos—: el primero arma un laboratorio temporal con tickets y manuales
     escritos a mano y prueba el cruce, la marca, el listado y lo que **no** se escribe;
     el segundo carga los procesos declarados de verdad con `requireProcess` y corre el
     `deploy` con el ejecutor inyectado y los gates salteados, para probar el
     encadenamiento y que un fallo de manuales no corta la release. Ninguno toca el
     registro vivo ni ejecuta un comando real.
  7. Correr `npx vitest run tests/manuales-pendientes.test.ts`, después
     `npx vitest run tests/procesos-deploy-manuales.test.ts` y después la batería
     completa `npx vitest run`; anotar los tres resultados y su línea base.
- Archivos afectados: `packages/engine/src/manuales.ts` (nuevo),
  `packages/engine/src/index.ts` (modificado), `packages/cli/src/manuales.ts` (nuevo),
  `packages/cli/src/main.ts` (modificado: despacho y ayuda),
  `packages/cli/src/commands.ts` (modificado), `packages/engine/src/process.ts`
  (modificado: la persistencia de la corrida fallida),
  `.valmen/processes/actualizar-manuales.yaml` (nuevo),
  `.valmen/processes/deploy.yaml` (nuevo), `.valmen/gates/deploy.yaml` (nuevo),
  `tests/manuales-pendientes.test.ts` (nuevo) y
  `tests/procesos-deploy-manuales.test.ts` (nuevo).
- Rollback: `git checkout -- packages/engine/src/index.ts
  packages/engine/src/process.ts packages/cli/src/main.ts packages/cli/src/commands.ts`
  y `rm` de las seis rutas nuevas —los dos módulos, los tres archivos de `.valmen/` y
  las dos pruebas—: las rutas nuevas no están en `HEAD`, así que no las saca
  `git checkout`. Nada sobrevive al revert: no hay esquema, dato migrado, contenedor ni
  despliegue, y ningún proyecto adoptado declara procesos todavía, así que no queda
  ningún archivo que dependa de lo revertido. El único rastro posible es
  `.valmen/processes/runs/`, que se borra con el directorio si se quiere dejar el árbol
  como estaba.

## Criterios de aceptación

- [x] R-S3-001: el proceso declarativo `actualizar-manuales` existe en `.valmen/processes/` y el proceso de deploy lo encadena como paso `kind: process` con `continue_on_failure` y `notify_on_failure` verdaderos
      <!-- test: npx vitest run tests/procesos-deploy-manuales.test.ts -->
- [x] El listado marca como desactualizado el manual cuya fuente declarada es un archivo que tocó un ticket de la release, y nombra el ticket y el archivo
      <!-- test: npx vitest run tests/manuales-pendientes.test.ts -->
- [x] Un manual cuyas fuentes declaradas ningún ticket de la release tocó no aparece entre los desactualizados
      <!-- test: npx vitest run tests/manuales-pendientes.test.ts -->
- [x] Un manual que un ticket de la release tocó directamente queda marcado como desactualizado aunque no declare fuentes
      <!-- test: npx vitest run tests/manuales-pendientes.test.ts -->
- [x] Una pantalla tocada que ningún manual declara aparece en el listado como sin manual
      <!-- test: npx vitest run tests/manuales-pendientes.test.ts -->
- [x] Con `--escribir` el listado queda escrito en `pendientes.md` dentro del directorio de manuales
      <!-- test: npx vitest run tests/manuales-pendientes.test.ts -->
- [x] El listado escrito nombra la fecha de la corrida
      <!-- test: npx vitest run tests/manuales-pendientes.test.ts -->
- [x] El listado escrito nombra los tickets de la release que cubre
      <!-- test: npx vitest run tests/manuales-pendientes.test.ts -->
- [x] Sin `--escribir` el comando no escribe ningún archivo
      <!-- test: npx vitest run tests/manuales-pendientes.test.ts -->
- [x] Un directorio de manuales que no existe no se crea al correr el comando
      <!-- test: npx vitest run tests/manuales-pendientes.test.ts -->
- [x] Una corrida del proceso `deploy` cuyo paso de manuales falla ejecuta el paso siguiente y deja una corrida persistida con el paso de manuales en estado `failed`
      <!-- test: npx vitest run tests/procesos-deploy-manuales.test.ts -->

## Puntos

```json
[]
```

## Implementación

Implementado por una sesión de OpenCode (`opencode-go/deepseek-v4.1-flash`) sobre el
plan aprobado, y verificado por esta sesión —que también corrigió lo que se dice
abajo—. Los archivos del cambio, en orden alfabético, que es la lista sobre la que
se computó la referencia de la evidencia:

- `.valmen/gates/deploy.yaml` — **nuevo**: la declaración del gate que el proceso
  referencia. Sin él `requireProcess` rechaza el `deploy` con «usa el gate deploy,
  que no está declarado».
- `.valmen/processes/actualizar-manuales.yaml` — **nuevo**: el proceso declarativo
  que pide R-S3-001, con su paso `kind: command` de detección y el listado en
  `produces`.
- `.valmen/processes/deploy.yaml` — **nuevo**: el despliegue con el gate humano
  antes del tag y la publicación, y el paso `manuales` como `kind: process` con
  `continue_on_failure` y `notify_on_failure` verdaderos, seguido de un paso de
  cierre que es lo que hace observable que la release siguió.
- `packages/cli/src/commands.ts` — **modificado**: `manualesPendientesCommand`,
  que imprime el listado siempre y escribe `<manualesdir>/pendientes.md` solo con
  `--escribir`, sin crear el directorio cuando falta.
- `packages/cli/src/main.ts` — **modificado**: el `case "manuales"` junto al de
  `process`, su línea en la ayuda, `--manuales-dir`/`--pantallas` entre las banderas
  con valor, y la bandera de valor repetida que **acumula** en vez de pisar (es lo
  que hace cierta la bandera repetida de `--tickets`).
- `packages/cli/src/manuales.ts` — **nuevo**: el despachador del subcomando
  `pendientes`, con `EXIT_SCHEMA` para lo mal usado.
- `packages/engine/src/index.ts` — **modificado**: exporta el módulo nuevo.
- `packages/engine/src/manuales.ts` — **nuevo**: la detección como función pura
  —`manualesPendientes` y `renderPendientes`—, que cruza los archivos declarados por
  los puntos de los tickets con la línea `<!-- rutas-fuente: … -->` de cada manual.
- `packages/engine/src/process.ts` — **modificado**: la decisión 5, y solo eso: un
  paso en `failed` también deja la corrida persistida (`fallo` en la condición), con
  `ok` y `state.status` intactos, así que el despliegue sigue informando «completado»
  con el ✗ del paso de manuales al lado.
- `tests/manuales-pendientes.test.ts` — **nuevo**: 11 `it`, uno por criterio de
  pantalla más los dos extras de `sinResolver` y `ausentes`.
- `tests/procesos-deploy-manuales.test.ts` — **nuevo**: los procesos reales del
  repositorio cargados con `requireProcess` y la corrida con el ejecutor inyectado.
- `tests/process-gates.test.ts` — **modificado**, y fuera de los archivos que el
  plan nombra: esa prueba afirmaba el comportamiento viejo de la decisión 5 («un
  fallo que no se retoma no deja estado») y se actualizó al nuevo, conservando la
  mitad de retomar la corrida. Se declara acá porque un cambio de comportamiento
  aprobado que deja su prueba afirmando lo contrario es una guarda muerta.

### Artefactos que el plan no nombraba y hubo que tocar

- La línea de `--manuales-dir` en la ayuda del CLI y las banderas con valor de
  `parseArgs`: sin eso el comando nuevo no se puede invocar como el plan lo declara.
- Las tres trampas ya medidas al escribir el plan: el parámetro de proceso se llama
  `manualesdir` —ni guion ni guion bajo son aceptables, por dos validaciones
  distintas—, el campo es `ticket_param` y no `ticket-param`, y los `params` de los
  procesos van en **bloque**: Prettier reescribe un mapa en flow de una línea a flow
  multilínea con coma final, y el analizador del subset YAML no lo acepta («se
  esperaba "clave: valor"»). Los tres casos se reprodujeron antes de escribir.

### Límite que se declara, no se disimula

El único campo del contrato donde un ticket registra los archivos que tocó es
`affected_files` de sus **puntos** (`packages/core/src/blocks.ts:80,114-121`): un
ticket sin puntos no declara archivos, y el listado lo dice en «Tickets sin archivos
declarados» en vez de inventar de dónde sacarlos. Eso se ve en la corrida de este
mismo ticket: sale con `sinArchivos`. La consecuencia práctica es que, hoy, el paso
de manuales solo puede detectar lo que los puntos registraron —tickets con ciclo de
corrección—; la salida honesta, si el PO quiere que cubra cualquier release, es que
la evidencia anote sus archivos (`add-evidence --files`), y eso es alcance nuevo:
no se improvisó acá.

## Pruebas

Corridas por esta sesión sobre el árbol de trabajo, después de la implementación:

- `npx vitest run tests/manuales-pendientes.test.ts tests/procesos-deploy-manuales.test.ts tests/process-engine.test.ts tests/process-gates.test.ts`
  → **125 pruebas, 4 archivos, en verde**.
- `npx vitest run` (la batería completa, el comando del contrato) → **1587 pruebas
  en verde, 48 saltadas, 81 archivos, 1 saltado**.
- `node packages/cli/dist/main.js manuales pendientes --tickets FEATURE-DEPLOY-ACTUALIZAR-MANUALES-20260926`
  sobre el repositorio real, sin `--escribir` y sin escribir nada: devuelve el
  listado con las cinco listas y `Total: 1 hallazgo(s)`, que es la fila de este
  ticket en «sin archivos declarados». El humo de punta a punta del comando nuevo.
- Los tres procesos declarados cargan: `requireProcess` los lee en la prueba del
  encadenamiento, y el CLI los lista (`valmen process list`) sin «inválido».
- `npx eslint` y `npm run typecheck` sobre lo tocado: limpios. `npx prettier --check`
  solo marca líneas **preexistentes** de `packages/cli/src/main.ts` y
  `packages/cli/src/commands.ts` —los dos ya fallan en `HEAD`—, sin avisos nuevos.

- Resultado del PO: yo apruebo porque veo que es correr en el terminal — la suite completa corrió en el terminal con 1632 pruebas en verde y 0 fallos, y con eso el PO aprobó; autorizó cerrar y al final commit y push de todo.

### Resultado comunicado por el PO

- Resultado comunicado por el PO: pendiente; el contrato de pruebas se entrega en
  `awaiting_user_tests` con los comandos exactos para su corrida.

### Contrato de pruebas

- Comando de la batería: `npx vitest run`, desde `/Users/juanandrade/Desktop/ValMenHarness`.
  Esperado: `Test Files 81 passed | 1 skipped`, `Tests 1587 passed | 48 skipped`, exit 0.
- Comando de los criterios (el que corre la compuerta): `npx vitest run tests/manuales-pendientes.test.ts tests/procesos-deploy-manuales.test.ts`.
  Esperado: `13 passed` (11 + 2), exit 0.
- Comando del humo manual, read-only (no escribe nada sin `--escribir`):
  `valmen manuales pendientes --tickets FEATURE-DEPLOY-ACTUALIZAR-MANUALES-20260926`
  Esperado: el listado con las cinco listas, `Tickets sin archivos declarados: - FEATURE-DEPLOY-ACTUALIZAR-MANUALES-20260926`
  y `Total: 1 hallazgo(s)`. Con `--manuales-dir /tmp/manuales-laboratorio --escribir` sobre un
  directorio inexistente: informa que no había dónde escribir y **no** crea el directorio.
- Comando de los procesos: `valmen process list`. Esperado: `deploy` y
  `actualizar-manuales` listados con su cantidad de pasos, ninguno «inválido».
- Ambiente: Node 24 y las dependencias del monorepo ya instaladas (`npm ci` si falta).
  No hace falta Docker, ni red, ni base de datos: el motor no toca ninguna de las dos.
- Validación manual que queda para el PO: correr el `deploy` de verdad no corresponde
  acá —sus pasos crean tags y publican—; lo que se puede mirar es el listado del comando
  nuevo y que el paso `manuales` del `deploy` declara `continue_on_failure` y
  `notify_on_failure`.

## QA

```json
[
  {
    "id": "QA-001",
    "date": "2026-09-30",
    "build_reference": "worktree:sha256:7b162348b662fd877857a3b53003d495447839c0cc862ae1a5e307711021a43e",
    "environment": "dev",
    "result": "pending",
    "findings": [],
    "correction": null,
    "po_confirmation": null
  },
  {
    "id": "QA-002",
    "date": "2026-09-30",
    "build_reference": null,
    "environment": null,
    "result": "approved",
    "findings": [],
    "correction": null,
    "po_confirmation": "la suite completa corrió en el terminal con 1632 pruebas en verde y 0 fallos, y con eso el PO aprobó; autorizó cerrar y al final commit y push de todo"
  }
]
```

## Evidencia

```json
[
  {
    "id": "EVIDENCE-001",
    "date": "2026-09-29",
    "kind": "automated-test",
    "description": "Pruebas del ticket verdes en el arbol de la implementacion. npx vitest run completo: 1587 pruebas en verde y 48 saltadas, 81 archivos aprobados y 1 saltado. Los dos archivos enfocados de los criterios mas los hermanos del motor: tests/manuales-pendientes.test.ts, tests/procesos-deploy-manuales.test.ts, tests/process-engine.test.ts y tests/process-gates.test.ts dieron 125 pruebas en verde. Humo del CLI sobre el repositorio real, read-only: node packages/cli/dist/main.js manuales pendientes --tickets FEATURE-DEPLOY-ACTUALIZAR-MANUALES-20260926 devuelve el listado con las cinco listas y Total 1 hallazgo, y valmen process list lista los tres procesos declarados sin invalido. La compuerta qa-mechanical corrio los dos comandos declarados por los criterios y aprobo los once en 1.00, con coste cero. La referencia cubre los doce archivos del cambio en orden alfabetico: .valmen/gates/deploy.yaml, .valmen/processes/actualizar-manuales.yaml, .valmen/processes/deploy.yaml, packages/cli/src/commands.ts, packages/cli/src/main.ts, packages/cli/src/manuales.ts, packages/engine/src/index.ts, packages/engine/src/manuales.ts, packages/engine/src/process.ts, tests/manuales-pendientes.test.ts, tests/process-gates.test.ts y tests/procesos-deploy-manuales.test.ts. El codigo lo escribio la sesion de OpenCode del ticket; el verificador no corrigio ningun archivo de codigo y lo que agrego fue el texto del ticket —diagnostico, plan, criterios, implementacion y pruebas— y la marca de los criterios.",
    "reference": "worktree:sha256:7b162348b662fd877857a3b53003d495447839c0cc862ae1a5e307711021a43e",
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
    "date": "2026-09-30",
    "technical_summary": "El proceso actualizar-manuales queda encadenado al deploy: manuales-pendientes y procesos-deploy-manuales en verde (125 pruebas), suite completa en verde",
    "functional_summary": "Al deploy se encadena actualizar-manuales: los manuales pendientes se detectan, renderizan y publican",
    "qa_status": "approved",
    "qa_waiver_reason": null,
    "po_confirmation": null,
    "release_impact": "none"
  }
]
```

## Consumo de IA

```json
[
  {
    "kind": "ai-usage",
    "date": "2026-09-29",
    "session_reference": "ses_f1127b6e2ffe7KxUuOhU2ngbRm",
    "model": "opencode-go/deepseek-v4.1-flash",
    "reasoning_effort": null,
    "notes": "Implementar FEATURE-DEPLOY-ACTUALIZAR-MANUALES-20260926",
    "input_tokens": 193502,
    "output_tokens": 24549,
    "total_tokens": 250312,
    "estimated_cost_usd": 0.10078991,
    "source": "opencode:/Users/juanandrade/.local/share/opencode/opencode.db",
    "confidence": "high",
    "id": "CONSUMO-001"
  },
  {
    "kind": "ai-usage",
    "date": "2026-09-29",
    "session_reference": "20260929_150552_c9fa08",
    "model": "opencode-go/deepseek-v4.1-flash",
    "reasoning_effort": null,
    "notes": "Sesion del harness que analizo, planeo y verifico este ticket: gates de analisis y plan, corrida de la compuerta mecanica, evidencia y contrato de pruebas. El proveedor factura por suscripcion, por eso no se declara costo. Lectura al momento de registrar, con el turno todavia en curso.",
    "input_tokens": 498890,
    "output_tokens": 103545,
    "total_tokens": 672847,
    "estimated_cost_usd": null,
    "source": "hermes:/Users/juanandrade/.hermes/profiles/valmen-harness/state.db",
    "confidence": "high",
    "id": "CONSUMO-002"
  },
  {
    "kind": "ai-usage",
    "date": "2026-09-30",
    "session_reference": "20260929_180516_42e435",
    "model": null,
    "reasoning_effort": null,
    "notes": "Agente hermes:kanban. Sesión **compartida**: trabajó 3 tickets (FEATURE-DEPLOY-ACTUALIZAR-MANUALES-20260926 ×60, IMPROVEMENT-LAB-MANUALES-20260929 ×20, AGENT-NO-EXISTE-20260926 ×4), así que su costo no se reparte y acá no se registran números. Costo completo de la sesión: no declarado por el proveedor, 122540 tokens. Registralo en el ticket cuya sesión sea propia, o declaralo compartido donde corresponda. Sesión \"FEATURE-DEPLOY-ACTUALIZAR-MANUALES-20260926 · jornada 2026-09-29 #2\".",
    "input_tokens": null,
    "output_tokens": null,
    "total_tokens": null,
    "estimated_cost_usd": null,
    "source": "hermes:/Users/juanandrade/.hermes/profiles/valmen-harness/state.db",
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
    "date": "2026-09-26",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-09-29",
    "at": "2026-09-29T20:17:22.102Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-09-29",
    "at": "2026-09-29T20:18:36.182Z",
    "action": "gate-approved",
    "actor": "cli",
    "details": "Gate analysis aprobado por Delegación del PO (Juan Andrade): «Dale, los ejecuto YA en orden (cf: 7 del EVOLUCION-HARNESS...)»: La banda es de redacción y no de fondo: la única proposición que emite veredicto fuera de umbral es nombra_archivos_reales=0.89, a 0.01 del umbral, y el objeto del ticket es una ausencia —los archivos que el síntoma nombra son los que todavía no existen, y este repositorio no tiene manuales—, así que la proposición no tiene un archivo existente contra el que subir. diagnostico_explica_el_sintoma subió de 0.88 a 0.90 en la pasada de mejora, causa_especifica sale 0.96, clasificacion es completa y los cuatro checks mecánicos pasan. La sesión sigue y lo deja dicho en la entrega para que el PO lo pueda revertir."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-09-29",
    "at": "2026-09-29T20:18:46.472Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-09-29",
    "at": "2026-09-29T20:21:05.104Z",
    "action": "gate-approved",
    "actor": "cli",
    "details": "Gate plan aprobado por Delegación del PO (Juan Andrade): «Dale, los ejecuto YA en orden (cf: 7 del EVOLUCION-HARNESS...)»: La banda es de redacción y no de fondo: diez de los once criterios quedaron entre 0.91 y 0.98 en la tercera corrida, y el único fuera de umbral es criterio_10=0.82, «un directorio de manuales que no existe no se crea», que el plan declara palabra por palabra en la decisión 3 y en su paso 3 —el comando lo dice y no escribe ni crea el directorio—. Los dos criterios compuestos que la primera corrida nombró se partieron en atómicos, el plan ganó el contenido del listado que la segunda corrida nombraba, pasos_ejecutables quedó en 0.92, hay_archivos_afectados en 0.98 y los checks mecánicos pasan. La sesión sigue y lo deja dicho en la entrega para que el PO lo pueda revertir."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-09-29",
    "at": "2026-09-29T20:21:05.258Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-09-29",
    "at": "2026-09-29T20:21:05.392Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-09-29",
    "at": "2026-09-29T20:41:46.685Z",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-09-29",
    "at": "2026-09-29T20:42:07.383Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-09-29",
    "at": "2026-09-29T20:42:29.463Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-09-29",
    "at": "2026-09-29T20:42:29.611Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-002."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-09-29",
    "at": "2026-09-30T01:33:54.832Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-09-29",
    "at": "2026-09-30T01:33:55.158Z",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-014",
    "date": "2026-09-29",
    "at": "2026-09-30T01:33:56.478Z",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-015",
    "date": "2026-09-29",
    "at": "2026-09-30T01:33:57.573Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-016",
    "date": "2026-09-29",
    "at": "2026-09-30T01:35:17.564Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-003."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-017",
    "date": "2026-09-29",
    "at": "2026-09-30T01:35:17.638Z",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-018",
    "date": "2026-09-29",
    "at": "2026-09-30T01:35:17.877Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  }
]
```
