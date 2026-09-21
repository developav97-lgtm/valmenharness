# 14 — Inventario de `ticket.py`: qué hay que reemplazar, exactamente

Este documento existe por una razón concreta: **el harness va a reemplazar a
`tools/agentic/ticket.py` del proyecto SaiOpenCloud, sin convivencia**, y un reemplazo sin
inventario descubre el hueco a mitad del trabajo, cuando ya movió el registro de sitio.

Todo lo que sigue está sacado del archivo real, con su número de línea. Cuando una
afirmación se comprobó **ejecutando** algo contra la implementación de referencia, se dice.
Cuando viene de leer el código, también.

| Dato                                  | Valor                                         |
| ------------------------------------- | --------------------------------------------- |
| Archivo de referencia                 | `tools/agentic/ticket.py`, 2.171 líneas       |
| Comandos                              | 14 (`create` + 9 de escritura + 4 de lectura) |
| Tickets reales sobre los que se probó | 57, todos `closed`, índice al día             |
| Suite de pruebas de referencia        | 2.771 líneas en 3 archivos                    |

## 1. La superficie de reemplazo no es solo el CLI

Además del comando, hay cuatro artefactos que dependen de él. Un reemplazo que solo
sustituya `ticket.py` deja tres cosas rotas:

| Artefacto                                          | Qué es                                                        | Qué lo reemplaza                  |
| -------------------------------------------------- | ------------------------------------------------------------- | --------------------------------- |
| `.agents/skills/saicloud-planificacion/SKILL.md`   | invoca `transition --entity ticket` y `validate --id`         | la skill pasa a invocar `valmen`  |
| `.agents/skills/saiopencloud-orquestador/SKILL.md` | invoca `create`, `active`, `resume`, `validate --id`          | ídem                              |
| `.agents/skills/saicloud-despliegue/SKILL.md`      | invoca `release-publish --version --tickets`                  | ídem                              |
| `tools/agentic/ticket_viewer.py` (395 líneas)      | visor web propio, con `ticket_viewer_static/` (3 archivos)    | Mission Control (`#/tickets`)     |
| `Abrir gestor de tickets.command`                  | lanzador zsh: `python3 tools/agentic/ticket_viewer.py --open` | `valmen serve`                    |
| `Gestor de tickets.command`                        | alias de macOS que apunta al anterior                         | se borra                          |
| `docs/tickets/README.md`                           | documenta el CLI como la forma de operar el registro          | se reescribe apuntando al harness |

**Seis de los catorce comandos son los que usa el flujo agéntico** (`create`, `transition`,
`validate`, `active`, `resume`, `release-publish`). Los otros ocho los usa la persona que
opera. Esa distinción importa para priorizar: sin los seis primeros, los agentes no pueden
trabajar; sin los otros ocho, el operador no puede cerrar un ticket.

## 2. La máquina de estados

### 2.1 Estados

| Entidad | Campo             | Estados                                                                                                                                  |
| ------- | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| ticket  | `workflow_status` | `intake`, `analyzed`, `planned`, `approved`, `in_progress`, `awaiting_user_tests`, `in_qa`, `changes_requested`, `qa_approved`, `closed` |
| ticket  | `qa_status`       | `pending`, `in_qa`, `approved`, `waived`                                                                                                 |
| ticket  | `release_status`  | `not_applicable`, `unreleased`, `planned`, `released`                                                                                    |
| punto   | `status`          | `open`, `analyzed`, `in_progress`, `awaiting_retest`, `verified`, `closed`, `not_reproducible`, `deferred`, `duplicate`                  |

**Tres conjuntos que no coinciden entre sí, y confundirlos es el error clásico:**

- `TERMINAL_POINT_STATES` = `not_reproducible`, `deferred`, `duplicate` (L70). Exigen
  `terminal_reason`; fuera de ellos, `terminal_reason` debe ser `null`.
- `BLOCKING_POINT_STATES` = `open`, `analyzed`, `in_progress`, `awaiting_retest` (L71).
  **`verified` no bloquea**, y es deliberado: es la causa de que 55 de los 137 puntos
  históricos quedaran en `verified` sin cerrarse.
- Estados sin sucesor en la tabla: `closed`, `not_reproducible`, `deferred`, `duplicate`
  (L97-100). **`closed` no está en `TERMINAL_POINT_STATES`**: es terminal en la máquina pero
  no exige motivo, y pasar `--reason` con `--to closed` es un error.

### 2.2 Transiciones permitidas (transcritas)

```python
TICKET_TRANSITIONS = {          # L73-84
    "intake": {"analyzed"},
    "analyzed": {"planned"},
    "planned": {"approved"},
    "approved": {"in_progress"},
    "in_progress": {"awaiting_user_tests"},
    "awaiting_user_tests": {"in_qa"},
    "in_qa": {"changes_requested", "qa_approved"},
    "changes_requested": {"in_progress"},
    "qa_approved": {"closed"},
    "closed": {"changes_requested"},     # reapertura, solo si sigue unreleased
}

RELEASE_TRANSITIONS = {         # L85-90
    "unreleased": {"planned", "not_applicable"},
    "planned": {"released"},
    "released": set(),
    "not_applicable": set(),
}

POINT_TRANSITIONS = {           # L91-101
    "open": {"analyzed", *TERMINAL},
    "analyzed": {"in_progress", *TERMINAL},
    "in_progress": {"awaiting_retest", *TERMINAL},
    "awaiting_retest": {"verified", *TERMINAL},
    "verified": {"closed"},
    "closed": set(), "not_reproducible": set(), "deferred": set(), "duplicate": set(),
}
```

No hay arista hacia `intake` ni hacia `unreleased`: `--to unreleased` **nunca** es legal.

### 2.3 Precondiciones por destino

Además de la legalidad de tabla (que sale con **3**), cada destino tiene sus condiciones.
Los mensajes son parte del contrato: un script que los compare hoy debe seguir leyéndolos.

| Entidad | Destino                      | Exige                                                                           | Mensaje (código)                                                                         |
| ------- | ---------------------------- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| ticket  | `planned`                    | `has_substantive_plan`                                                          | `No se puede marcar planned con placeholders o un plan vacío.` (3)                       |
| ticket  | `approved`                   | `has_plan_gate`                                                                 | `approved requiere aprobación explícita del PO o razón de gate no exigible.` (3)         |
| ticket  | `approved`                   | `has_structured_plan` (≥2 pasos reales)                                         | `approved requiere un plan proporcional estructurado con al menos dos pasos reales.` (3) |
| ticket  | `in_qa`                      | `has_recorded_user_test_outcome`                                                | `in_qa requiere resultado del PO u omisión explícita documentada en Pruebas.` (3)        |
| ticket  | `changes_requested`          | último ciclo QA con resultado `changes_requested` o `failed` (salvo reapertura) | `changes_requested requiere un ciclo QA cerrado con hallazgos.` (3)                      |
| ticket  | `qa_approved`                | ciclo QA aprobado **o** exención válida                                         | `qa_approved requiere ciclo QA confirmado o exención confirmada por el PO.` (3)          |
| ticket  | `qa_approved`                | ciclo aprobado ⇒ `qa_status` ya es `approved`                                   | `El historial QA aprobado no coincide con qa_status.` (3)                                |
| ticket  | `qa_approved`                | ningún punto en `BLOCKING_POINT_STATES`                                         | `qa_approved está bloqueado por puntos pendientes.` (3)                                  |
| ticket  | `closed`                     | `qa_status` ∈ {`approved`, `waived`}                                            | `closed requiere QA aprobada o eximida.` (3)                                             |
| ticket  | `closed`                     | si `approved`, ciclo QA aprobado                                                | `closed requiere un ciclo QA aprobado y confirmado.` (3)                                 |
| ticket  | `closed`                     | una entrada de `Cierre` con ese mismo `qa_status`                               | `closed requiere un intento de cierre coherente con QA.` (3)                             |
| ticket  | `closed → changes_requested` | `release_status == "unreleased"` y `--reason`                                   | `Solo se puede reabrir un ticket cerrado que permanezca unreleased.` (3)                 |
| release | `planned`                    | `--version` SemVer                                                              | `release planned requiere --version SemVer sin prefijo v.` (3)                           |
| release | `released`                   | versión == `target_release` ≠ null                                              | `released_in debe coincidir con target_release.` (3)                                     |
| release | `not_applicable`             | `target_release` y `released_in` null                                           | `not_applicable exige target_release y released_in null.` (3)                            |
| punto   | terminales                   | `--reason` no vacío → `terminal_reason`                                         | `Los estados terminales del punto requieren --reason.` (3)                               |
| punto   | `verified`                   | último retest de ese punto `approved` **y** con `po_confirmation`               | `verified requiere un retest aprobado y confirmado por el PO.` (3)                       |
| punto   | (cualquiera)                 | el punto existe                                                                 | `El punto indicado no existe.` (3)                                                       |

**Regla de `--reason`**: solo es válido al reabrir un ticket cerrado no publicado, o en un
estado terminal de punto. En cualquier otro caso es un error (3), no un campo ignorado.
Excepción a documentar: con `--entity release` **se acepta y se ignora en silencio** (L1473-1501).

### 2.4 Efectos colaterales

| Transición                          | Frontmatter                                                     | Bloque              | Evento (`action`, `details`)                                                                    |
| ----------------------------------- | --------------------------------------------------------------- | ------------------- | ----------------------------------------------------------------------------------------------- |
| ticket (general)                    | `workflow_status`, `updated`                                    | —                   | `ticket-transition`, `Workflow: {de} -> {a}.`                                                   |
| ticket `→ qa_approved` por exención | además `qa_status: waived`                                      | —                   | igual                                                                                           |
| ticket reapertura                   | `workflow_status`, `updated`, `qa_status: pending`              | `QA` +2 entradas    | `ticket-transition`, `Workflow: closed -> changes_requested. Reapertura por hallazgo: {reason}` |
| release                             | `release_status`, `updated`, y `target_release` o `released_in` | —                   | `release-transition`, `Release: {de} -> {a}.`                                                   |
| punto                               | `updated`                                                       | `Puntos` (el punto) | `point-transition`, `{POINT-NNN}: {de} -> {a}.`                                                 |
| todos                               | `updated`                                                       | `Eventos` +1        | —                                                                                               |

La reapertura es la única transición con efecto compuesto, y tiene una **trampa real**: el
ciclo QA de arranque copia `build_reference` y `environment` de la **penúltima** entrada QA
(`qa_entries[-2]`, L1441). Un ticket `closed` con `qa_status: waived` y el bloque `QA` vacío
—que el validador acepta— llega hasta ahí y revienta con un `IndexError` que `main` no
captura: traceback y código 1, no un `TicketError`. No se comprobó si algún test lo cubre.

## 3. Los comandos de anexado

| Comando         | Precondición de estado                                                                                           | Qué anexa                                                           | Evento                                                 |
| --------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------ |
| `create`        | ninguna (crea)                                                                                                   | ticket completo desde `docs/agentic/templates/ticket.template.md`   | `created`, `Ticket creado sin sobrescribir historial.` |
| `add-point`     | **ninguna** (funciona con el ticket `closed`)                                                                    | `Puntos` +1, `status: open`                                         | `point-added`, `Se agregó POINT-NNN.`                  |
| `qa-start`      | `workflow == in_qa` y bloque `QA` par                                                                            | `QA` +1 `pending`; `qa_status: in_qa`                               | `qa-started`, `Se inició QA-NNN.`                      |
| `qa-close`      | `workflow == in_qa` y bloque `QA` impar                                                                          | `QA` +1 con el resultado; `qa_status`                               | `qa-closed`, `Se registró QA-NNN con resultado {r}.`   |
| `add-evidence`  | **ninguna**                                                                                                      | `Evidencia` +1 y, si hay `--point-id`, el id en `Puntos[].evidence` | `evidence-added`, `Se agregó EVIDENCE-NNN.`            |
| `add-retest`    | `workflow == in_qa`, ciclo QA abierto, punto en `awaiting_retest`                                                | `Retests` +1 y `Puntos[]`: `qa_cycles` + `status`                   | `retest-added`, `Se agregó RETEST-NNN para POINT-NNN.` |
| `close-attempt` | `approved`: `workflow == qa_approved` + ciclo aprobado. `waived`: `workflow` ∈ {`in_qa`, `qa_approved`} + QA par | `Cierre` +1                                                         | `close-attempted`, `Se agregó CLOSE-NNN.`              |
| `add-ai-usage`  | **ninguna**                                                                                                      | `Consumo de IA` +1                                                  | `ai-usage-added`, `Se agregó CONSUMO-NNN.`             |

**`add-retest` mueve el punto**: `approved` → `verified`; `changes_requested` o `failed` →
`in_progress`; `pending` → sin cambio. Y añade el ciclo QA abierto a `qa_cycles` solo si no
estaba. Un punto puede llegar a `verified` con el ciclo QA **abierto**: no exige cierre.

**`close-attempt` no cierra**: solo anexa el intento. El cierre efectivo es
`transition --entity ticket --to closed`, y exige que exista un intento con el mismo
`qa_status` que el frontmatter.

**Sin banderas para datos estructurados**: `findings`, `correction`, `evidence` de un retest,
`affected_files`, `diagnosis`, `solution` y `related_ticket` de un punto se escriben siempre
como `[]` o `null`. No hay forma de llenarlos por CLI: se editan a mano en el ticket.

## 3bis. La publicación de releases

`release-publish` no es un comando más: es el único que **verifica el repositorio git** antes
de escribir, y el único que mueve dos estados de golpe.

Lo que exige, en orden (L1614-1642):

1. `--version` SemVer sin prefijo `v`, y `--tickets` con IDs explícitos, sin duplicados.
2. **El tag `v<versión>` tiene que ser anotado**, no ligero: `git cat-file -t` debe devolver
   `tag`, no `commit` → `v<version> debe ser un tag anotado.` (**5**).
3. Tiene que existir `origin/production` (o, si no, `production` local) → si no,
   `No existe una referencia local de production para verificar la release.` (**5**).
4. **El tag tiene que apuntar exactamente al tip de production**, no a un ancestro:
   `El tag de release no apunta al commit actual de production.` (**5**).
5. Cada ticket: `closed`, `release_status: unreleased`, y **al menos un SHA de 40 hex en la
   sección `## Implementación` que sea ancestro del commit del tag**
   → `<ID> no tiene un SHA de implementación que pertenezca al tag v<version>.` (**5**).
6. `all_documents` de toda la colección, y revalidación de cada texto nuevo, antes de
   escribir. Una selección mixta con un ticket no elegible ⇒ **cero escrituras**.

Lo que escribe: `target_release`, `released_in`, `release_status: released`, `updated`, y
**dos eventos** con la misma fecha — `Release: unreleased -> planned.` y
`Release: planned -> released.`—. Es decir, **implementa las dos transiciones de la máquina
en un solo comando**, sin pasar por el estado `planned` real. Después refresca el índice.

**No ejecuta `git fetch`.** Usa `refs/remotes/origin/production` tal como esté en el clon
local, así que la frescura depende de un fetch externo. Tampoco comprueba que el árbol esté
limpio: publica y deja el ticket modificado sin commitear, a propósito.

### El orden con `release_notes.py`, que es un dato duro

`release_notes.py` (190 líneas, **no** lo invoca `ticket.py`) genera el artefacto de
novedades del frontend en `FrontEnd/src/assets/releases/<versión>.json`, leyendo el
`functional_summary` de la última entrada de `Cierre` de cada ticket. Y **exige
`release_status: unreleased`**, que es exactamente lo que `release-publish` deja de cumplir.

Consecuencia: para una misma versión, `release_notes.py create` tiene que ejecutarse
**antes** de `release-publish`. Después falla. Es la primera cadena de procesos real del
proyecto, y es exactamente el tipo de encadenamiento que el pedido original describe —
publicar y actualizar los manuales— pero con el orden invertido respecto de la intuición.

## 4. Lectura, índice y el visor que se reemplaza

### 4.1 Los comandos de lectura

| Comando           | Qué hace                                                               | Códigos posibles |
| ----------------- | ---------------------------------------------------------------------- | ---------------- |
| `validate --id X` | valida un ticket; imprime `Ticket válido: {id}`                        | 0, 2, 4 (Ctrl-C) |
| `validate --all`  | valida todos; `Tickets válidos: {n}`, o un error agregado con la lista | 0, 2, 4          |
| `index [--check]` | reconstruye el índice, o solo lo compara                               | 0, 2, 4          |
| `active`          | lista los no cerrados: `{id} \| {workflow} \| {módulo} \| {título}`    | 0, 2, 4          |
| `resume [--id]`   | imprime el contexto de un ticket                                       | 0, 2, **6**, 4   |

`validate --all` **normaliza el código a 2** aunque el error individual hubiera tenido otro: el
agregado se construye con un `fail()` sin código. Y `resume` es el único comando de todo el CLI
que devuelve **6**: cuando hay más de un ticket activo y no se indicó `--id`, se niega a elegir
—`Hay varios tickets activos ({ids}); indique uno con --id.`—. Es la decisión de diseño más
fina del CLI: un comando que adivina cuál querías es peor que uno que pregunta.

`resume --id` **no filtra por estado**: imprime un ticket cerrado sin decir nada. Su salida es
un bloque de siete líneas `Clave: valor` (`Ticket`, `Título`, `Tipo/Módulo`, `Workflow`, `QA`,
`Release`, `Puntos`). Los agentes leen eso: la skill del orquestador lo invoca para retomar
trabajo.

### 4.2 El índice

`docs/tickets/index.md`, generado entero cada vez (nunca incremental), ordenado por
`(created, id)` —la fecha del frontmatter, no la de cierre— y con esta forma exacta:

```markdown
# Índice de tickets

> Archivo generado por `python3 tools/agentic/ticket.py index` (biblioteca estándar de Python; sin dependencias externas).
> No se edita a mano. La fuente de verdad es cada
> `docs/tickets/YYYY/<TICKET-ID>/ticket.md`.

| Fecha      | Ticket                                                                                      | Tipo   | Módulo | Workflow | QA       | Release  |
| ---------- | ------------------------------------------------------------------------------------------- | ------ | ------ | -------- | -------- | -------- |
| 2026-08-26 | [BUGFIX-ADMIN-USERS-PRECARGA-20260826](2026/BUGFIX-ADMIN-USERS-PRECARGA-20260826/ticket.md) | BUGFIX | ADMIN  | closed   | approved | released |
```

**La cabecera nombra el comando que lo genera**, así que el reemplazo tiene que decidir qué dice
ahí.

#### El defecto del índice, medido

Si `index.md` **no existe**, la referencia no puede regenerarlo: comprueba la ruta antes de
escribirla. Hasta aquí, lo que ya decía el inventario. Lo que apareció al ejecutar la prueba
diferencial es peor: **`refresh_index` corre después de `atomic_write`, así que toda mutación en
un registro sin índice escribe el ticket y después falla** con código 2 y «La ruta canónica
solicitada no existe.».

Medido, sobre un registro sin `index.md`:

```
$ python3 tools/agentic/ticket.py transition --id BUGFIX-… --entity ticket --to approved
Error: La ruta canónica solicitada no existe.
exit: 2
$ grep -m1 ^workflow_status docs/tickets/2026/BUGFIX-…/ticket.md
workflow_status: approved
```

Una mutación confirmada reportada como fallo: quien mire el código de salida cree que no pasó
nada, y el ticket ya se movió. La suite de la referencia no lo detecta porque **copia `index.md`
al fixture** en cada caso; el registro real lo tiene, así que nunca apareció.

El harness **crea el índice**: un índice derivado tiene que poder reconstruirse desde cero, es lo
único que se le pide. Es una divergencia deliberada y está fijada por un test que la documenta.

### 4.3 El visor

`ticket_viewer.py` tenía más de lo que parece: un servidor HTTP de solo lectura, con lista
blanca de estáticos, sin autenticación y ligado a `127.0.0.1` —se niega a arrancar en otro
host—. Lo que ofrecía, y que Mission Control debe cubrir o descartar a conciencia:

| Capacidad                        | Detalle                                                | ¿Está en Mission Control?       |
| -------------------------------- | ------------------------------------------------------ | ------------------------------- |
| Filtro por rango de **cierre**   | por defecto los últimos 30 días, rango inclusivo       | No: filtra por estado y texto   |
| Atajos de rango                  | Hoy, Ayer, Esta semana, Sábado a hoy                   | No                              |
| Filtro por tipo y texto libre    | sobre título, problema, solución y usuario afectado    | Sí, sin el rango de fechas      |
| **Reporte Markdown** descargable | `tickets-cerrados.md`, con «Se atendió» y «Se realizó» | **No**                          |
| API de solo lectura              | `/api/tickets`, `/api/report`, `/api/ticket`           | Sí, y más completa              |
| Aviso de solo lectura            | «Este visor es solo lectura y se gestiona en Codex.»   | No aplica: la app ahora escribe |

Lo que el visor **no** hacía, y conviene recordar: mostraba **solo tickets cerrados**, y la
fecha que usaba era la del último `Cierre`, no la del frontmatter. La vista nueva muestra todo
el ciclo, que era el punto.

El reporte Markdown es la pérdida más concreta: es un artefacto que alguien usaba para
comunicar. Conviene portarlo antes de borrar el visor.

### 4.4 La suite de referencia: 61 tests

Se ejecuta con `python3 -m unittest discover -s tools/agentic/tests -v`. Tres archivos,
`unittest` de la biblioteca estándar, **sin CI que los ejecute**. Tres de los tests del visor
invocan `node` para probar el frontend.

Lo que la suite fija, y que conviene robar como lista de verificación:

- **Los seis bloques rechazan un reordenamiento**, y restaurar el orden vuelve a validar. No es
  una comprobación de forma: es la garantía de que el historial no se reordena.
- **Append-only entrada por entrada**: cada mutación comprueba que el bloque creció en una
  entrada y que la anterior quedó intacta.
- **Los comandos de lectura no modifican nada**: instantánea byte a byte de `docs/tickets` antes
  y después. Es lo que hace que «solo lectura» signifique algo.
- **El arnés de invocación verifica en cada llamada** que no hubo commits, que nada fuera de
  `docs/tickets` cambió y que no hubo red —con un guard de sockets y un `PATH` envuelto—. Ese
  arnés vale más que muchos de los tests que ejecuta.
- **Un test inspecciona el código fuente** para prohibir `import socket`, `urllib`, `requests` y
  `curl`/`wget`. Un CLI de tickets que abre un socket es un CLI que puede exfiltrar.
- Límite de 20 puntos, IDs que no se reutilizan, referencias de build estrictas (5), ambigüedad
  de `resume` (6), índice byte-idéntico entre ejecuciones, cero escrituras en un rechazo de
  release, symlink en el directorio del año.

**Huecos de la suite**, que son los que hay que cubrir en el reemplazo: `index` sin `index.md`;
el mensaje de índice ilegible; contención del lock en `index`; `validate` sin argumentos —el
`fail` de la línea 1946 es inalcanzable porque argparse aborta antes—; y la diferencia CRLF/LF
en `--check`.

## 5. El contrato de identificadores

| Bloque          | Prefijo           | Cómo se genera                                                   |
| --------------- | ----------------- | ---------------------------------------------------------------- |
| `Puntos`        | `POINT-NNN`       | `max(ids registrados en eventos point-added ∪ ids actuales) + 1` |
| `Eventos`       | `EVENT-NNN`       | `len(entries) + 1`                                               |
| `Evidencia`     | `EVIDENCE-NNN`    | `len(entries) + 1`                                               |
| `QA`            | `QA-NNN`          | `len(entries) + 1`                                               |
| `Retests`       | `RETEST-NNN`      | `len(entries) + 1`                                               |
| `Cierre`        | `CLOSE-NNN`       | `len(entries) + 1`                                               |
| `Consumo de IA` | **`CONSUMO-NNN`** | `len(entries) + 1`                                               |

`POINT` es el único que **no** se deriva de la longitud, y tiene su razón: sobrevive a la
comparación con los eventos históricos de creación (`validate_history_coherence` exige que
las altas registradas igualen exactamente los puntos actuales, en orden).

La secuencia es obligatoria y sin huecos en los siete bloques: un hueco, un duplicado o un
reordenamiento dan **el mismo** mensaje (`Los IDs de {etiqueta} deben ser únicos, monótonos y
conservar su orden.`, código **2**) y dejan el ticket ilegible para todos los comandos. No
hay comando de reparación.

## 6. La capa de escritura

`finalize_mutation` (L1220-1236) es el corazón, y su orden es la garantía:

```
1. all_documents(root)              valida TODOS los tickets del árbol antes de escribir nada
2. anexa el evento al bloque Eventos
3. updated = hoy
4. parse_text_as_document(texto)    revalida el documento NUEVO, entero, antes de escribir
5. atomic_write                     temporal en el mismo directorio → fsync → rename
6. refresh_index                    reescribe docs/tickets/index.md
```

Lo que esto garantiza: **un estado inválido nunca llega al disco** (paso 4 antes del 5), y un
ticket hermano roto impide la mutación (paso 1). Lo que **no** garantiza: si el paso 6 falla,
el ticket ya quedó escrito y el índice desactualizado, sin rollback.

`atomic_write` conserva el modo del archivo existente (o `0644` si es nuevo), escribe en un
temporal del **mismo directorio** y hace `fsync` del archivo y del directorio (el del
directorio, con el error tragado a propósito).

`mutation_lock` es un archivo `O_CREAT|O_EXCL` en el git-dir, 100 intentos cada 10 ms. Si no
lo consigue: `Otro proceso mantiene el lock de tickets; vuelva a intentar.` (**4**). **No
recupera locks huérfanos**: un proceso muerto deja el registro bloqueado para siempre.

**Ningún `OSError` está mapeado a un código de salida.** `main` solo captura `TicketError` y
`KeyboardInterrupt`; un fallo de disco sale como traceback con código 1. Eso es un
comportamiento a decidir, no a copiar.

## 7. Qué se rompe si se porta ingenuamente

Esta es la lista que justifica el documento. Nueve trampas, todas verificadas en el código:

1. **`replace_block` reescribe el bloque entero.** No añade una entrada: re-serializa todas
   con `json.dumps(entries, ensure_ascii=False, indent=2)`. Cualquier diferencia de formato
   entre serializadores **reescribe el historial** de un bloque que el usuario no tocó.
2. **Los flotantes se serializan distinto.** Python emite `3.1542e-05` para valores por
   debajo de `1e-4`; JavaScript emite `0.000031542`. Comprobado: **los 399 bloques de los 57
   tickets reales no contienen ni un flotante**, así que hoy la diferencia no se manifiesta —
   pero el harness va a ser el primero en escribir `estimated_cost_usd`, y a partir de ahí
   cualquier reescritura de ese bloque diferiría. Se arregla replicando la regla de Python
   (posicional si `-4 ≤ exponente < 16`; si no, exponencial con signo y dos dígitos).
3. **`replace_frontmatter` exige exactamente una coincidencia.** Su patrón es
   `^clave: [^\n]*$` con `count=1`; si no encuentra exactamente una, falla. Y produce
   `clave: valor` con **un** espacio: el resto del archivo se conserva byte a byte.
4. **El parser rechaza CRLF.** El frontmatter se busca con `\A---\n` y los bloques con
   `\n`:` un archivo con finales de línea de Windows no parsea. El harness debe decidir si
   mantiene el rechazo o lo normaliza, pero no puede ignorarlo.
5. **`ensure_secure_path` no comprueba permisos y no normaliza `..`.** Usa `path.absolute()`,
   no `resolve()`. Y con `allow_missing=True` deja de comprobar en el primer componente
   ausente, así que los componentes más profundos no se verifican contra enlaces simbólicos.
6. **El registro está fijo en `docs/tickets`.** No es configurable (L220-221). El harness ya
   lo detecta (`choosePaths`), lo que es una mejora, pero significa que el layout de un
   proyecto adoptado tiene que seguir funcionando.
7. **Los códigos de salida no son los que el nombre sugiere.** `validate_history_coherence` y
   `validate_qa_state_coherence` salen con **2**, no con 4. `EXIT_HISTORY` solo se usa en dos
   sitios (el lock y «el ticket ya existe»), y `EXIT_AMBIGUOUS` solo en `resume`.
8. **Las pertenencias a conjuntos con valores no hashables revientan.** `x not in <set>` con
   un objeto o un array JSON lanza `TypeError` no capturado → traceback. En TypeScript eso
   hay que decidirlo explícitamente, y la respuesta correcta es un error de esquema, no un
   traceback.
9. **`has_structured_plan` y `has_substantive_plan` tienen listas de placeholders
   distintas.** El primero no filtra la línea `-`; el segundo sí. Y los dos comparan
   `casefold()` contra textos en español, con familias de prefijos (`pendiente`, `por
definir`, `a definir`, `por completar`). Es lógica de dominio real, no una comprobación
   de forma: hay que portarla tal cual o declarar la divergencia.

## 8. Qué le falta al harness

| Pieza                                    | Estado en ValmenHarness                                                                                   |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Tablas de transición                     | **Falta.** `core/contract.ts` tiene los estados y `BLOCKED_EXITS`, no las aristas                         |
| `finalizeMutation`                       | **Falta.** Existen las piezas (`atomicWrite`, `MutationLock`, `replaceBlock`, `nextId`, `newEvent`)       |
| Los 9 comandos de escritura              | **Faltan**                                                                                                |
| `has_substantive_plan` y las otras cinco | **Faltan**                                                                                                |
| `validate_history_coherence`             | **Existe**, portado y probado contra los 57 tickets                                                       |
| `replaceBlock`                           | **Existe**, con la serialización de Python y verificado contra los 399 bloques reales byte a byte         |
| Serialización de flotantes               | **Existe** (`core/json.ts`). Regla de Python, con los bordes de `1e-4` y `1e16` probados                  |
| `create` desde plantilla                 | **Falta**, y hay que decidir de quién es la plantilla (ver §11)                                           |
| `release-publish` con git                | **Falta.** Es la pieza con más verificación del repositorio y la única con dos transiciones en un comando |
| `release_notes.py`                       | **Falta.** Genera el artefacto de novedades del frontend, y va **antes** de publicar                      |
| `resume`                                 | **Falta**                                                                                                 |
| El visor                                 | **Reemplazado** por Mission Control                                                                       |

## 9. Cómo se verifica el reemplazo

**Prueba diferencial byte a byte contra la implementación de referencia.** Es la única forma
de demostrar que no se pierde nada, y es la misma técnica que el proyecto ya usa para el
parser y el validador.

El método:

1. Dos copias idénticas de un registro de laboratorio.
2. La misma secuencia de comandos, ejecutada con `python3 tools/agentic/ticket.py` sobre una
   copia y con `valmen` sobre la otra.
3. Comparación **byte a byte** de los `ticket.md` y del `index.md` resultantes.
4. Para los caminos de error: mismo mensaje en stderr y mismo código de salida.

La secuencia cubre: `create`; cada transición legal de las tres entidades; cada rechazo por
transición ilegal; cada precondición incumplida; los ocho comandos de anexado; los comandos
de lectura; y los casos límite de §7.

Lo que la prueba diferencial **no** puede cubrir, y hay que declarar aparte: las divergencias
deliberadas (§10).

## 10. Divergencias deliberadas

Un reemplazo que copie todo, incluidos los defectos, no es un reemplazo: es una mudanza. Las
divergencias que se proponen, cada una con su razón:

| Divergencia                                                                      | Por qué                                                                                                                                                                                                                           |
| -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| El lock se llama `.valmen.lock` y vive en el registro                            | El nombre `saiopencloud-ticket.lock` es del proyecto, no del harness. Y un lock huérfano no puede bloquear para siempre: hay que poder detectarlo                                                                                 |
| Los `OSError` salen con un código del contrato                                   | Un fallo de disco con traceback y código 1 no es un error que un script pueda tratar                                                                                                                                              |
| La plantilla del ticket es del harness                                           | El texto de cada sección es de SaiOpenCloud; la estructura es el contrato. `valmen adopt` copia la plantilla a `.valmen/templates/` para que el proyecto la adapte                                                                |
| El registro se detecta, no se asume                                              | `docs/tickets` es el layout heredado; el harness ya soporta los dos                                                                                                                                                               |
| Los flotantes se escriben como los escribe Python                                | Para que reescribir un bloque no cambie un valor que nadie tocó. No es preferencia de formato: es no tocar el historial                                                                                                           |
| `--reason` con `--entity release` es un error                                    | Ignorar una bandera en silencio es cómo se pierde un dato que el usuario creía haber dado                                                                                                                                         |
| La publicación de una release es **un proceso con pasos y gates**, no un comando | Hoy es un comando que exige el tag, el canario y la confirmación del PO _fuera_ del harness. Eso es exactamente un proceso encadenable: verificar → publicar → regenerar novedades → refrescar índice, con el PO como gate humano |

## 11. Decisiones que hay que tomar antes de escribir código

1. **¿El estado `blocked` entra en la tabla?** El esquema 2 lo añadió y `BLOCKED_EXITS` ya
   declara las salidas. Falta decidir las entradas: la propuesta es `analyzed`, `planned`,
   `approved` e `in_progress`, las mismas que las salidas, más la arista de vuelta al estado
   del que se entró. Sin esto, el estado existe y es inalcanzable por transición.
2. **¿`resume` se porta tal cual o se convierte en la vista de ticket?** Mission Control ya
   muestra el ticket entero. Un `resume` que imprima el mismo contexto en texto es trabajo
   duplicado… salvo que los agentes lo usen, y lo usan: la skill del orquestador lo invoca.
3. **¿La plantilla se copia al adoptar o se lee de `docs/agentic/templates/`?** Copiarla
   deja el proyecto con una plantilla propia que puede divergir; leerla de donde está hoy
   mantiene la dependencia con el layout viejo.
4. **¿`release_notes.py` se absorbe o se deja como está?** Es el primer caso real del pedido
   «scripts y procesos invocables como herramientas y encadenables». Absorberlo significa que
   el harness genera el artefacto de novedades; dejarlo significa que la cadena queda a
   medias y el orden («novedades antes de publicar») sigue viviendo en la cabeza de quien
   opera o en un documento.
5. **¿La verificación de git se generaliza?** Hoy `release-publish` sabe de `production`, de
   tags anotados y de ancestría. Eso es política de SaiOpenCloud, no del harness. La pregunta
   es si se convierte en un proceso declarado en `.valmen/processes/` —con sus pasos y sus
   gates— o en código del harness con el nombre del proyecto dentro.
