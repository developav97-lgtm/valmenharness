---
schema_version: 2
id: AGENT-DOCS-GENERAR-MANUAL-MARKDOWN-20260926
title: Generar manuales Markdown con skill del proyecto
type: AGENT
module: DOCS
workflow_status: qa_approved
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

# AGENT-DOCS-GENERAR-MANUAL-MARKDOWN-20260926

## Solicitud original

Parte del sprint: Encadenar manuales al deploy, auditarlos y publicar el corpus indexable.
- R-S3-002: Generación asistida del manual en Markdown — Para una pantalla nueva o desactualizada, el agente DEBE generar el `.md`
Depende de: FEATURE-DEPLOY-ACTUALIZAR-MANUALES-20260926.
Viene de una feature descompuesta en sprints; su plan completo está en el tickets.yaml de la feature.

## Descripción funcional

- Alcance: R-S3-002 — que el manual de usuario final de una pantalla nueva o desactualizada lo genere el agente **siguiendo la metodología del proyecto**, y que esa metodología deje de ser un documento que hay que releer: se publica como skill del catálogo del harness (`skills/manuales-usuario-final/SKILL.md`, con `version` y `origen: valmen`), `valmen sync` la instala en `.valmen/skills/` del proyecto —que es donde se declara, se proyecta a los runtimes y se extiende con `local.md`—, y el proceso `actualizar-manuales` gana el paso de agente que la usa para escribir el `.md`. El `.md` queda como fuente de verdad: un subcomando nuevo `valmen manuales plantilla` emite la plantilla del manual (bloque de metadata, `<!-- rutas-fuente: … -->` y las seis secciones) y la escribe en disco sin pisar un manual existente. El portal web y el PDF conservan su mecanismo actual: esta ola no los toca.
- Usuario o rol afectado: el agente que escribe o corrige manuales en un proyecto adoptado —hoy relee el `PROCESO-MANUALES.md` del proyecto, o lo aplica a medias— y quien mantiene los manuales, que recibe `.md` con la estructura del proceso en vez de uno con la forma que cada sesión recordó.
- Comportamiento actual: la metodología existe como documento largo en el proyecto adoptado (`docs/manuales/usuario-final/PROCESO-MANUALES.md`) y en el harness como **diseño** (`docs/05-PLUGINS.md:320-410` la esboza entera dentro de un plugin que no se construyó), pero no como artefacto ejecutable: el catálogo del harness publica cinco skills (`skills/`, `packages/adapter/src/skills.ts:356-404`) y ninguna es de manuales; el proceso `.valmen/processes/actualizar-manuales.yaml:20-29` declara un solo paso, la detección, y su comentario dice explícitamente que escribir los manuales es del paso de agente de R-S3-002; y no hay ningún comando que emita la plantilla —`packages/cli/src/manuales.ts:25-38` despacha un único subcomando, `pendientes`—. El resultado es que «generar el manual» es hoy una instrucción en prosa que no deja ni plantilla, ni comando, ni paso declarado.
- Comportamiento esperado: la skill `manuales-usuario-final` se publica en el catálogo con las reglas duras del proceso (regla de oro: leer el `.ts` y el `.html` completos; tono impersonal; cero rutas visibles; código ISO de la fuente oficial; ambigüedad a pendientes) y con la plantilla del manual dentro; `valmen sync` la deja en `.valmen/skills/manuales-usuario-final/SKILL.md` y la proyecta a los cuatro runtimes; `valmen manuales plantilla` imprime la plantilla y, con `--escribir`, deja el `.md` en el módulo que corresponde negándose a pisar uno existente; y `actualizar-manuales` declara el paso `escribir` de tipo `agent`, con su runtime y sus instrucciones, que es lo que el deploy encadena.

## Diagnóstico

- Síntoma y por qué ocurre: el requisito pide que el agente genere el `.md` del manual «siguiendo la metodología del proyecto», y el manual no sale con esa forma porque **la metodología no existe como nada que un agente pueda cargar, ejecutar ni declarar**: vive como prosa en dos documentos y ninguna pieza del harness la lee. El agente que escribe un manual hoy tiene que acordarse del documento —el `PROCESO-MANUALES.md` del proyecto adoptado, o el diseño que el harness escribió— y reproducir de memoria la plantilla, el tono y las reglas de rutas; cuando no se acuerda, el `.md` sale con otra estructura y con rutas técnicas visibles, y nada lo detecta. El harness tiene el mecanismo exacto para que eso no dependa de la memoria —una skill del proyecto en `.valmen/skills/<id>/SKILL.md` que `valmen sync` instala y proyecta a los runtimes, y un paso de agente que el motor sabe delegar— y la skill de manuales nunca se publicó, así que el mecanismo está vacío y el paso que escribe los manuales no tiene a qué apuntar.
- Lo que el reconocimiento encontró, con su archivo y su línea: (1) **la skill no existe**: el catálogo del harness son cinco directorios —`skills/feature`, `skills/planificacion`, `skills/programar-trabajo-de-tickets`, `skills/pruebas-unitarias`, `skills/revision-final`— y `publicadas()` recorre justamente ese directorio (`packages/adapter/src/skills.ts:356-404`); el diseño de la skill de manuales está escrito, con sus reglas duras, en `docs/05-PLUGINS.md:335-362` y su gate en `:364-400`, atribuido a `@valmen/plugin-manuals`, un plugin que no se construyó; (2) **el paso de agente no está declarado**: `.valmen/processes/actualizar-manuales.yaml:20-26` tiene un solo paso (`detectar-pantallas`, `kind: command`, `valmen manuales pendientes …`) y su comentario de cabecera dice que escribir los manuales es del paso de agente de R-S3-002 y auditarlos del gate de R-S3-003 — el motor ya sabe ejecutar ese paso: `agent` está entre los tipos ejecutables (`packages/core/src/process.ts:41,58-64`), el analizador lee `runtime`, `instructions` y `model_role` (`packages/core/src/process.ts:314-327`), el validador exige el runtime y rechaza dos pasos que lo compartan con instrucciones distintas (`packages/core/src/process.ts:497-517`), y el ejecutor arma el comando `${runtime} '<instrucciones>'` con las comillas simples protegiéndolo del shell (`packages/engine/src/process.ts:897-905`); (3) **la plantilla no está en ninguna parte del harness**: el único subcomando de manuales es `pendientes` (`packages/cli/src/manuales.ts:21-38`, implementado en `packages/cli/src/commands.ts:2108-2166`) y la ayuda del CLI no nombra nada más; la plantilla real vive en el documento del proyecto adoptado, en su bloque de `markdown` con «# [Nombre de la pantalla]», el bloque de metadata y las seis secciones — exactamente el documento que D5 dice **declarar** en vez de reinventar.
- Causa raíz: el síntoma ocurre **porque la metodología nunca se convirtió en artefacto**: quedó como dos documentos largos —el del proyecto adoptado y el diseño del harness— y ninguna pieza del motor la lee. No es un defecto de una función: es la ausencia de la proyección de un conocimiento procedimental al sitio donde el agente lo carga. El harness ya tiene el mecanismo exacto —`.valmen/skills/<id>/SKILL.md` es la skill del proyecto, `valmen sync` instala las publicadas del catálogo (`packages/cli/src/commands.ts:663`) y las proyecta a `.opencode/skills`, `.claude/skills`, `.codex/skills` y `.agents/skills` (`packages/adapter/src/skills.ts:85-90`, `:278-291`), y `local.md` es el sitio donde el proyecto escribe lo suyo sin bifurcar la skill (`packages/adapter/src/skills.ts:47-54`)—, y la skill de manuales no está en el catálogo, así que el mecanismo no tiene qué instalar. La consecuencia práctica: el paso que escribe los manuales no puede declarar instrucciones que apunten a una skill que no existe, y el motor se detiene al cargar un paso de agente sin runtime (`packages/core/src/process.ts:497-506`), así que «generar el `.md`» no tiene ni dónde declararse.
- Hallazgo del reconocimiento sobre la plantilla: **tiene que vivir dentro de `SKILL.md`, no en un archivo hermano del catálogo**. `renderSkill` escribe la skill con su frontmatter (`name`, `description`) y su cuerpo (`packages/adapter/src/skills.ts:250-275`), y `instalarPublicadas` copia **un solo archivo**, `join(dir, id, "SKILL.md")` (`packages/adapter/src/skills.ts:538-551`); `publicadas()` también lee solo ese archivo (`:373-374`). Un `plantilla.md` hermano en `skills/manuales-usuario-final/` no llegaría al `.valmen/skills/` del proyecto, que es donde el agente lee. Se resuelve con la plantilla dentro del cuerpo de la skill **y** el renderizador en el código, atados por una prueba que compara el esqueleto emitido contra el bloque declarado en la skill: si alguno cambia sin el otro, la suite se pone roja.
- Hallazgo del reconocimiento sobre la instalación: **agregar la skill al catálogo obliga a correr `valmen sync` y versionar la copia del proyecto**. `syncProject` instala las publicadas **antes** de proyectar y en modo `--check` no escribe pero informa la deriva (`packages/cli/src/commands.ts:654-701`), así que en este repositorio —que se gestiona con su propio registro— la skill nueva aparece como `falta` en `derivaPublicada` hasta que se instale, y `.valmen/skills/*/SKILL.md` está versionado (`.valmen/skills/feature/SKILL.md` y las otras cuatro están en `git ls-files`). La instalación es parte del entregable, no un efecto colateral.
- Riesgos y compatibilidad: el cambio agrega una skill, un subcomando de lectura/escritura de un archivo nuevo y un paso declarado; no toca ninguna máquina de estados ni el comportamiento de ningún proyecto adoptado. El riesgo real y su mitigación: (1) **el comando escribe en disco** —lo hace solo con `--escribir` explícito, solo bajo la ruta que se le pasa, y se niega a pisar un archivo existente sin `--forzar`, porque el `.md` es la fuente de verdad—; (2) **el paso de agente del proceso `actualizar-manuales` se ejecutaría solo si alguien corre el `deploy`**, que este ticket no corre: la prueba del paso es de carga (`requireProcess`) y la corrida del proceso se hace copiada a un laboratorio con el ejecutor de comandos inyectado, que es lo que ya hace `tests/procesos-deploy-manuales.test.ts:29-47`; (3) **una skill publicada nueva cambia el conteo que informa `sync`** —la línea «skills publicadas comparadas» y el listado de runtimes— y las pruebas que lo miran lo hacen por mensaje y no por igualdad exacta (`tests/adapters.test.ts:275-282`).
- Impactos de sync, migración, Docker o despliegue: ninguno. **Sync:** no se toca el camino de sincronización ni la proyección a `AGENTS.md`; lo que se agrega es una skill al catálogo que el mecanismo existente instala y proyecta, y `valmen sync --check` sigue siendo el que lo comprueba. **Migración:** no hay cambio de esquema ni de contrato de datos. **Docker:** no se toca ninguna imagen ni servicio. **Despliegue:** el paso de agente se declara en el proceso `actualizar-manuales`, que el `deploy` encadena con `continue_on_failure: true`; este ticket no corre ningún despliegue, y el portal web y el PDF del proyecto adoptado conservan su mecanismo actual (ADR-041 sigue donde está).

## Plan

- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan).
- Orden del PO citada, que habilita este plan: «Dale, los ejecuto YA en orden (cf: 7 del EVOLUCION-HARNESS, commit sí por ticket al llegar a awaiting_user_tests, push con orden aparte del PO)» (Juan Andrade). Esa orden habilita el commit de los archivos de este ticket al llegar a `awaiting_user_tests`; el push, el PR, el tag y el despliegue **no** están autorizados y quedan para una orden aparte.
- Decisiones de diseño:
  1. **La plantilla vive dentro de `SKILL.md`, y el renderizador en el motor, atados por una prueba que compara los dos.** `instalarPublicadas` copia **un solo archivo**, `join(dir, id, "SKILL.md")` (`packages/adapter/src/skills.ts:538-551`), y `publicadas()` también lee solo ese archivo (`packages/adapter/src/skills.ts:373-374`): un `plantilla.md` hermano en el catálogo no llegaría al `.valmen/skills/` del proyecto, que es donde el agente lee. La plantilla va en un bloque delimitado del cuerpo de la skill —que es además el texto que el agente carga— y el esqueleto que emite `valmen manuales plantilla` se escribe en el motor; la prueba del ticket lee los dos y falla si uno cambia sin el otro. Alternativa descartada: un archivo hermano en el catálogo, que ni se instala ni se proyecta.
  2. **El destino del manual se declara con `--destino`, no se adivina.** El comando escribe solo bajo la ruta relativa que se le pasa, validada contra la raíz —sin rutas absolutas y sin salir del repositorio—, y `--escribir` sin `--destino` falla en vez de inventar dónde. Alternativa descartada: componer `<manuales-dir>/<modulo>/<slug>.md` como hace el proceso del proyecto adoptado, porque los módulos (`mod-pos`, `administration`, `mod-receivables`) son una convención que el harness no conoce y que el catálogo publicado no debe llevar —la misma razón por la que una skill publicada no nombra archivos, servicios ni versiones de un stack (`packages/adapter/src/skills.ts:16-21`)—.
  3. **El texto lo produce el motor y la escritura la hace el CLI.** `renderPlantilla` va en `packages/engine/src/manuales.ts`, junto a `manualesPendientes` (`:218`) y `renderPendientes` (`:339`), y `manualesPlantillaCommand` en `packages/cli/src/commands.ts`, al lado de `manualesPendientesCommand` (`:2108`), que es quien ya resuelve banderas y escribe archivos. Alternativa descartada: escribir desde el motor, que no tiene la raíz ni las banderas del CLI resueltas.
  4. **Se niega a pisar un manual existente salvo `--forzar`.** El `.md` es la fuente de verdad del manual y lo que se pisa es el trabajo de una persona o de una corrida anterior; `--forzar` existe para el caso deliberado y se declara en la ayuda. Alternativa descartada: escribir siempre y avisar, que convierte un error de ruta en la pérdida de un manual.
  5. **El paso de agente se declara con `runtime:` explícito y con las instrucciones atadas a la skill.** El motor rechaza al cargar un paso `agent` sin runtime (`packages/core/src/process.ts:497-506`) y el harness no trae runtime propio, así que el proceso tiene que decir con qué se ejecuta: en este repositorio el que escribe código es `opencode run --standalone`. Las instrucciones nombran la skill instalada y el comando de la plantilla, y llevan la prohibición de commitear. Alternativa descartada: declarar el paso sin runtime para completarlo después, que deja el proceso inejecutable y el eslabón sin declarar.
  6. **La copia instalada de la skill se versiona.** `syncProject` instala las publicadas antes de proyectar (`packages/cli/src/commands.ts:654-701`) y `.valmen/skills/*/SKILL.md` ya está en `git ls-files`, así que agregar la skill al catálogo sin instalarla dejaría `sync --check` en deriva y el entregable a medias: `valmen sync` se corre como parte del ticket.
  7. **No se toca la plantilla del proyecto adoptado ni ningún corpus real.** La plantilla se declara a partir del proceso del proyecto adoptado (`docs/manuales/usuario-final/PROCESO-MANUALES.md` de SaiOpenCloud, §1 paso 3) y el harness no tiene manuales propios: la prueba escribe un laboratorio temporal, como `tests/manuales-pendientes.test.ts:29-33`.
- Pasos ordenados:
  1. Publicar la skill en `skills/manuales-usuario-final/SKILL.md`, con frontmatter `name`, `description`, `version: 1.0.0` y `origen: valmen` (`skills/feature/SKILL.md:1-6` es la forma), las reglas duras del proceso y la plantilla del manual en un bloque delimitado del cuerpo.
  2. En `packages/engine/src/manuales.ts`, agregar el esqueleto y su renderizador —`PLANTILLA_SECCIONES`, `PLANTILLA_METADATA` y `renderPlantilla({ pantalla })`— con la línea `<!-- rutas-fuente: … -->` y los marcadores de posición, sin contenido de ejemplo inventado; el reexport de `packages/engine/src/index.ts:38` ya alcanza para que el CLI lo importe.
  3. En `packages/cli/src/commands.ts`, escribir `manualesPlantillaCommand(root, flags)` junto a `manualesPendientesCommand` (`:2108`): imprime por stdout siempre y, con `--escribir`, valida `--destino` contra la raíz, se niega a pisar un archivo existente sin `--forzar` y escribe el `.md`.
  4. En `packages/cli/src/manuales.ts:29-38`, despachar `plantilla` y actualizar el mensaje de subcomandos (`manuales requiere un subcomando: pendientes, plantilla`).
  5. En `packages/cli/src/main.ts:270-279`, la ayuda del subcomando `plantilla` con sus banderas, al lado de la de `pendientes`.
  6. En `.valmen/processes/actualizar-manuales.yaml`, agregar el paso `escribir` al final del proceso, `kind: agent`, con `runtime`, `model_role: implementation` e `instructions` que nombran la skill instalada y el comando de la plantilla.
  7. Escribir `tests/manuales-plantilla.test.ts`: el esqueleto emitido contra el bloque declarado en `skills/manuales-usuario-final/SKILL.md`, la escritura y el rechazo a pisar, la igualdad de la copia instalada con la publicada, y la carga del proceso con el paso de agente (`requireProcess`, como `tests/procesos-deploy-manuales.test.ts:29-47`).
  8. Correr `valmen sync` y dejar versionado `.valmen/skills/manuales-usuario-final/SKILL.md`, con `valmen sync --check` al día.
- Trazabilidad con el diagnóstico: el hallazgo «la skill no existe» es la decisión 1 y los pasos 1 y 8; el hallazgo «la plantilla no está en ninguna parte del harness» es las decisiones 1 y 3 y los pasos 2 a 5; el hallazgo «el paso de agente no está declarado» es la decisión 5 y el paso 6; el hallazgo «la plantilla tiene que vivir dentro de `SKILL.md`» es la decisión 1 y el paso 7, que es la prueba que los ata; y el hallazgo «la instalación es parte del entregable» es la decisión 6 y el paso 8.
- Rollback: quitar `skills/manuales-usuario-final/` y `.valmen/skills/manuales-usuario-final/`, el subcomando `plantilla` con su ayuda y las funciones nuevas de `packages/engine/src/manuales.ts` y `packages/cli/src/commands.ts`, y el paso `escribir` de `.valmen/processes/actualizar-manuales.yaml`. Lo que sobrevive al revert: los manuales ya escritos en un proyecto adoptado —este ticket no escribe ninguno—, la copia instalada de las otras cinco skills publicadas y el proceso `actualizar-manuales` con su paso de detección, que queda como estaba antes de este cambio.
- Hotspot declarado: `.valmen/processes/actualizar-manuales.yaml` lo toca también `AGENT-GATE-AUDITAR-MANUAL-CITAS-20260926` (agrega el paso de auditoría al mismo archivo, `.valmen/features/evolucion-harness/tickets.yaml`); este cambio es aditivo y agrega su paso al final, y el conflicto se resuelve conservando los dos.


## Criterios de aceptación

- [x] El catálogo del harness publica la skill `manuales-usuario-final` con `version` y `origen: valmen`, y `publicadas()` la devuelve con las reglas duras del proceso en su cuerpo
      <!-- test: npx vitest run tests/manuales-plantilla.test.ts -->
- [x] El esqueleto que emite el comando y el bloque de plantilla declarado en `skills/manuales-usuario-final/SKILL.md` declaran el mismo bloque de metadata y las mismas seis secciones, y la prueba falla si uno cambia sin el otro
      <!-- test: npx vitest run tests/manuales-plantilla.test.ts -->
- [x] `valmen manuales plantilla --pantalla <nombre>` imprime el manual con ese nombre de pantalla en su encabezado
      <!-- test: npx vitest run tests/manuales-plantilla.test.ts -->
- [x] El esqueleto impreso trae el bloque de metadata del manual, la línea `<!-- rutas-fuente: … -->` y las seis secciones del proceso
      <!-- test: npx vitest run tests/manuales-plantilla.test.ts -->
- [x] El esqueleto impreso no contiene ninguna ruta técnica fuera de la línea `<!-- rutas-fuente: … -->`
      <!-- test: npx vitest run tests/manuales-plantilla.test.ts -->
- [x] `valmen manuales plantilla --escribir --destino <ruta>` deja el manual en esa ruta relativa a la raíz, y sin `--escribir` el comando no escribe ningún archivo
      <!-- test: npx vitest run tests/manuales-plantilla.test.ts -->
- [x] `valmen manuales plantilla --escribir` sobre una ruta que ya tiene un manual falla y no modifica ese archivo
      <!-- test: npx vitest run tests/manuales-plantilla.test.ts -->
- [x] `valmen manuales plantilla --escribir --forzar` sobre esa misma ruta reescribe el archivo con el esqueleto nuevo
      <!-- test: npx vitest run tests/manuales-plantilla.test.ts -->
- [x] El proceso `actualizar-manuales` carga con el paso `escribir` de tipo `agent`, con `runtime` e `instructions`, y el `deploy` lo sigue encadenando con `continue_on_failure: true`
      <!-- test: npx vitest run tests/manuales-plantilla.test.ts -->
- [x] La copia instalada `.valmen/skills/manuales-usuario-final/SKILL.md` es idéntica a la que publica el catálogo
      <!-- test: npx vitest run tests/manuales-plantilla.test.ts -->

## Puntos

```json
[]
```

## Implementación

- Quién escribió qué: el código lo escribió **una sesión de OpenCode** (`opencode run --standalone`, modelo `opencode-go/deepseek-v4.1-flash`, título `AGENT-DOCS-GENERAR-MANUAL-MARKDOWN-20260926`) sobre el plan aprobado; el ticket, la verificación, las corridas de las pruebas y el commit son del orquestador. **El orquestador no editó ningún archivo de código**, así que no hay corrección posterior al ejecutor: el commit le atribuye al ejecutor lo que el ejecutor escribió.
- La skill publicada `skills/manuales-usuario-final/SKILL.md` (nueva) declara `name`, `description`, `version: 1.0.0` y `origen: valmen` en su frontmatter, y en el cuerpo las reglas duras del proceso —regla de oro de leer el componente y su template completos, sujeto sistema/pantalla, pasos en infinitivo impersonal, mensajes de error literales del código, cero rutas técnicas en el texto visible, ambigüedad a la sección de pendientes y código ISO de la fuente oficial— más la plantilla del manual dentro del bloque delimitado `<!-- plantilla:inicio -->` / `<!-- plantilla:fin -->`.
- `packages/engine/src/manuales.ts`: `PLANTILLA_SECCIONES` (las seis secciones), `PLANTILLA_METADATA` (las cinco etiquetas del bloque de metadata), `PLANTILLA_PANTALLA` y `renderPlantilla({ pantalla })`, que emite el esqueleto sin ninguna ruta técnica salvo la línea `<!-- rutas-fuente: … -->` y sin contenido de ejemplo.
- `packages/cli/src/commands.ts`: `manualesPlantillaCommand(root, flags)` —imprime siempre por salida estándar, `--pantalla` pone el nombre del encabezado, `--escribir` exige `--destino`, valida que la ruta sea relativa y quede dentro de la raíz, se niega a pisar un manual existente y `--forzar` lo reescribe—; `packages/cli/src/manuales.ts` despacha `plantilla` y sus dos mensajes nombran `pendientes, auditar, plantilla`; `packages/cli/src/main.ts` agrega la ayuda del subcomando y `--pantalla` y `--destino` a `VALUE_OPTIONS`.
- `.valmen/processes/actualizar-manuales.yaml`: el paso `escribir` (`kind: agent`, `runtime: opencode run --standalone`, `model_role: implementation`, `evidence: [stdout]`) con instrucciones que nombran la skill instalada y `valmen manuales plantilla` y prohíben commitear; la `description` del proceso se ajustó a los tres pasos.
- `tests/manuales-plantilla.test.ts` (nuevo, 16 pruebas): el esqueleto emitido contra el bloque declarado en la skill —leyendo los dos, sin listas escritas dentro de la prueba—, el nombre de pantalla, la escritura y el rechazo a pisar, la carga del proceso con el paso de agente y la igualdad de la copia instalada con la publicada.
- `valmen sync` instaló la skill: `.valmen/skills/manuales-usuario-final/SKILL.md` es idéntica a la publicada y `valmen sync --check` queda al día.
- Desvío declarado respecto del plan (paso 6): el plan decía «agregar el paso `escribir` al final del proceso», y cuando se escribió el proceso tenía un solo paso; la auditoría de R-S3-003 (`AGENT-GATE-AUDITAR-MANUAL-CITAS-20260926`) agregó después su paso al final. El paso `escribir` quedó **después de `detectar-pantallas` y antes de `auditar-manuales`**: así el agente escribe los manuales que la detección marcó y la auditoría revisa el resultado, mientras que dejarlo al final habría auditado antes de escribir. Los dos pasos se conservan; es aditivo.
- Nota del lanzamiento del ejecutor, sin efecto sobre el árbol: el primer `opencode run --standalone` murió en su primer `Read` porque el árbol se abrió con una grafía de la ruta que OpenCode canonicaliza a otra (`ValMenHarness` → `ValmenHarness`) y cada lectura del repositorio se leyó como `external_directory` y se auto-rechazó. Se relanzó desde la grafía canónica y la sesión terminó con `exit 0`; la corrida fallida no escribió ningún archivo.
- `npm run lint` informa 4 errores en archivos sin diferencia contra `HEAD` (`packages/engine/src/evaluators.ts`, `tests/eventos-con-hora.test.ts`, `tests/mcp-server.test.ts`): son preexistentes y ajenos al alcance del plan, y no se tocaron. `npx eslint` sobre los cinco archivos del ticket sale 0.

## Pruebas

- Prueba enfocada del ticket: `npx vitest run tests/manuales-plantilla.test.ts` — **16 pruebas, todas en verde**.
- Batería completa: `npx vitest run` — **84 archivos en verde, 1 salteado (85); 1628 pruebas en verde, 48 salteadas (1676)**; sin fallos. Corrida del orquestador sobre el árbol del cambio.
- `npm run typecheck` (compila los paquetes y verifica tipos): sin errores.
- Verificación del orquestador con el binario real `valmen` contra un laboratorio temporal, no sobre el auto-reporte del ejecutor: `manuales plantilla --pantalla "Órdenes de venta"` imprime el esqueleto —encabezado, las cinco etiquetas de metadata, `<!-- rutas-fuente: … -->` y las seis secciones— y sale 0; `--escribir --destino docs/manuales/usuario-final/ordenes.md` deja el archivo y sale 0; repetirlo sin `--forzar` sale 2 y no modifica el archivo; `--escribir` sin `--destino` sale 2; `--destino /tmp/x.md` (absoluta) sale 2; `--destino ../fuera.md` sale 2; `--forzar` reescribe y sale 0; `valmen manuales` sin subcomando sale 2 con «manuales requiere un subcomando: pendientes, auditar, plantilla».
- `valmen process show actualizar-manuales` lista los tres pasos en orden —`detectar-pantallas`, `escribir [agent]`, `auditar-manuales`— y `valmen process show deploy` sigue encadenando `manuales → actualizar-manuales` con «un fallo aquí no detiene el proceso».
- `diff skills/manuales-usuario-final/SKILL.md .valmen/skills/manuales-usuario-final/SKILL.md` sin diferencias; `valmen sync --check` sale 0 con «Archivos generados al día.» y la skill entre las comparadas.
- Contrato de pruebas para quien retome: comando `npx vitest run`, directorio la raíz del repositorio, resultado esperado 1628 pruebas en verde y ningún fallo; sin requisitos de ambiente —el harness no tiene dependencias externas ni base de datos—.

- Resultado del PO: yo apruebo porque veo que es correr en el terminal — la suite completa corrió en el terminal con 1632 pruebas en verde y 0 fallos, y con eso el PO aprobó; autorizó cerrar y al final commit y push de todo.

## QA

```json
[
  {
    "id": "QA-001",
    "date": "2026-09-30",
    "build_reference": "worktree:sha256:4ff1594415424b7f33b40ee4b3e7f114e83b90262cedc71495d906168f594abb",
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
    "kind": "verification",
    "description": "Verificación del orquestador sobre el árbol del cambio: npx vitest run tests/manuales-plantilla.test.ts (16 pruebas en verde), la batería completa npx vitest run (84 archivos en verde y 1 salteado; 1628 pruebas en verde y 48 salteadas sobre 1676) y npm run typecheck sin errores, más las corridas directas del binario valmen manuales plantilla contra un laboratorio temporal (imprimir el esqueleto, escribir con --destino, rechazo a pisar sin --forzar, --destino ausente, ruta absoluta y ruta que sale de la raíz, --forzar, y el mensaje de subcomandos), valmen process show actualizar-manuales y deploy, y valmen sync --check en 0. El hash cubre, en orden alfabético, los ocho archivos del cambio: .valmen/processes/actualizar-manuales.yaml, .valmen/skills/manuales-usuario-final/SKILL.md, packages/cli/src/commands.ts, packages/cli/src/main.ts, packages/cli/src/manuales.ts, packages/engine/src/manuales.ts, skills/manuales-usuario-final/SKILL.md y tests/manuales-plantilla.test.ts. El ticket no tiene puntos, así que la referencia la computó el verificador con el encuadre del contrato: longitud de la ruta y del contenido en 8 bytes big-endian.",
    "reference": "worktree:sha256:4ff1594415424b7f33b40ee4b3e7f114e83b90262cedc71495d906168f594abb",
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
    "session_reference": "ses_f10ad1d70ffeP88V1K4pnKSqLp",
    "model": "opencode-go/deepseek-v4.1-flash",
    "reasoning_effort": null,
    "notes": "Sesión de OpenCode que escribió el código del ticket (opencode run --standalone, título AGENT-DOCS-GENERAR-MANUAL-MARKDOWN-20260926). Lectura de opencode.db al registrar, con el turno ya terminado.",
    "input_tokens": 112760,
    "output_tokens": 15832,
    "total_tokens": 148279,
    "estimated_cost_usd": 0.050352504,
    "source": "opencode:/Users/juanandrade/.local/share/opencode/opencode.db",
    "confidence": "high",
    "id": "CONSUMO-001"
  },
  {
    "kind": "ai-usage",
    "date": "2026-09-29",
    "session_reference": "ses_f10ad90acffe3e23tGM38LipRz",
    "model": "opencode-go/deepseek-v4.1-flash",
    "reasoning_effort": null,
    "notes": "Lanzamiento de OpenCode que murió en su primer Read: el árbol se abrió con una grafía de ruta que OpenCode canonicaliza a otra y las lecturas del repositorio se leyeron como external_directory. No escribió ningún archivo; su consumo se registra porque lo gastó este ticket.",
    "input_tokens": 13587,
    "output_tokens": 218,
    "total_tokens": 13840,
    "estimated_cost_usd": 0.002191002,
    "source": "opencode:/Users/juanandrade/.local/share/opencode/opencode.db",
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
    "date": "2026-09-29",
    "at": "2026-09-29T21:14:16.194Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-09-29",
    "at": "2026-09-29T21:29:44.019Z",
    "action": "gate-approved",
    "actor": "cli",
    "details": "Gate analysis aprobado por Juan Andrade (PO, via Slack)."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-09-29",
    "at": "2026-09-29T21:39:30.836Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-09-29",
    "at": "2026-09-29T22:26:01.921Z",
    "action": "gate-approved",
    "actor": "cli",
    "details": "Gate plan aprobado por Juan Andrade (PO, via Slack)."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-09-29",
    "at": "2026-09-29T22:26:06.599Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-09-29",
    "at": "2026-09-29T22:51:22.022Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-09-29",
    "at": "2026-09-29T22:52:32.650Z",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-09-29",
    "at": "2026-09-29T22:54:04.120Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-09-29",
    "at": "2026-09-29T22:54:45.408Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-09-29",
    "at": "2026-09-29T22:54:45.569Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-002."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-09-29",
    "at": "2026-09-30T01:33:59.118Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-09-29",
    "at": "2026-09-30T01:33:59.603Z",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-014",
    "date": "2026-09-29",
    "at": "2026-09-30T01:34:00.477Z",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-015",
    "date": "2026-09-29",
    "at": "2026-09-30T01:34:01.209Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  }
]
```
