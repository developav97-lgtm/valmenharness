# Propuesta: corrida orquestada en sesión, en vez de la jornada por launchd

Fecha: 2026-10-07. Pedido del PO: comparar la jornada autónoma del harness con la
sesión interactiva de SaiOpenCloud del mismo día, y proponer el reemplazo.

## 1. Comparativa de las dos corridas

Las dos corrieron la misma tarde, con el mismo modelo (claude-sonnet-5-5), las
mismas autorizaciones de QA por agente y de aprobación automática, y el mismo
flujo de tickets (análisis → plan → aprobación → implementación → entrega → QA).
Los datos salen del registro, no de lo que reportaron las sesiones: eventos de
`ticket.md`, `.valmen/executions/events.jsonl`, `.valmen/journeys/pasadas.jsonl`,
`.valmen/autonomous-stops.jsonl` y el transcript de la sesión.

| Dato | Jornada (ValmenHarness, JOR-20261007/08) | Sesión orquestadora (SaiOpenCloud, superadmin-ampliacion) |
|---|---|---|
| Ventana de trabajo | 13:07 → 22:21 (9 h 14 min), cortada por el PO | 16:26 → 22:40 (6 h 14 min), sigue viva |
| Mecanismo | launchd cada 15 min, `journey advance`, un ejecutor `claude --print` por pasada, `max-concurrent: 1` | Una sesión de Claude Code; el agente principal reparte tickets en subagentes (`Agent`, en segundo plano) |
| Paralelismo | 1 ticket a la vez; entre ticket y ticket, hasta 15 min muertos esperando la pasada | 24 subagentes lanzados; hasta 5 trabajando a la vez (22:26–22:34 UTC) |
| Tickets entregados (awaiting_user_tests o cerrados) | 6 (RESOLUCION-PERFIL, AVANCE-AUTONOMO, CONTEXTO-FASES, CODEGRAPH-ESTADO, CADUCA-MEDIANOCHE, SKILLS-UX) | 28 de 45: 23 cerrados por política de QA, 5 en awaiting_user_tests (SECURITY y pantallas); 2 approved y 15 en intake por hacer |
| Ritmo | 0,65 tickets/hora | 4,5 tickets/hora (~7×) |
| Despachos fallidos | 5 de 11 (ejecutor caído, pruebas, commit no atribuible, árbol sucio) | 0 bloqueos de cola; los fallos se resolvieron dentro de la sesión |
| Intervenciones del operador | ~8 a mano: commits de artefactos de preparación, `git branch -f`, unión de logs append-only, reserva huérfana de capacidad, árbol sucio por un archivo ajeno, login de `claude` | 12 mensajes del PO en 6 h: 5 aprobaciones en lote («Apruebo las 3 con la recomendación»), un «cómo vas», un «probar todo junto al final» |
| Aprobación de planes | Una por una, pidiendo al PO en cada pasada | Por lotes de 3, con la recomendación del orquestador |
| Visibilidad | Vista Jornadas: todos los tickets «dependencies / unknown»; el estado real solo en los JSONL | El chat: el orquestador narra qué subagente está en qué ticket y entrega resumen al cerrar cada tanda |
| Aislamiento | Rama `valmen/jornada-<fecha>` sobre el checkout principal; cualquier archivo ajeno bloquea la pasada | Todos los subagentes en el mismo checkout, sin worktree (funcionó, pero rompe «un solo escritor») |

Lectura honesta de los números: los tickets de SaiOpenCloud eran más pequeños
(una API, una pantalla) que los del harness (motor, adaptador), así que el 7× no es
puro mecanismo. Pero la diferencia estructural es clara y se repite en cada fila:
la jornada pierde el tiempo entre pasadas, se bloquea con cualquier cambio ajeno,
corre de a uno y pide cada aprobación por separado; la sesión no tiene ninguno de
esos cuatro costos.

Lo que sí hizo bien la jornada y hay que conservar: preparación (análisis + plan)
sin intervención, compuertas y recibos por ticket, reserva de capacidad de la
máquina, unión de logs append-only al integrar, avisos por Telegram.

## 2. Qué se propone

Reemplazar la **ejecución** de la jornada (launchd + `journey advance`) por una
**corrida orquestada**: una sesión de Claude Code que el PO abre («ejecuta la
jornada de hoy», «ejecuta el feature X de corrido») y en la que el agente
principal orquesta y los subagentes implementan. La **programación** de la jornada
se queda como está: `journey plan` sigue siendo la forma de decir qué tickets van,
en qué orden y cuántos.

### 2.1 Flujo

1. El PO programa: `valmen journey plan --feature X` o `--tickets A,B,C [--max N]`.
   Igual que hoy. También puede abrir la sesión y decir «ejecuta el feature X»
   sin programar nada; el orquestador arma el plan con `armar_jornada`.
2. El PO abre la sesión y carga la skill `corrida-orquestada`. El orquestador:
   - pide al motor la **ola** de tickets listos (`journey next --wave`: los que
     tienen sus dependencias entregadas), hasta `max-concurrent` a la vez;
   - por cada ticket lanza un subagente con `Agent` en **worktree propio**
     (`isolation: worktree`, rama `valmen/ticket-<id>`), en segundo plano, con el
     **modelo y esfuerzo del perfil** de la fase (`.valmen/profiles.yaml`, que ya
     existe) y un brief autocontenido que genera el harness
     (`valmen journey brief --id`): ticket, skills a cargar, compuertas, contrato de
     entrega y qué no puede hacer;
   - el subagente recorre análisis → plan → implementación → entrega → QA con
     `reanudar_ticket`, como hoy, y registra su fase con
     `registrar_actividad_ejecucion` (ya existe).
3. Aprobaciones: si el ticket es elegible (FEATURE-ENGINE-ELEGIBILIDAD-APROBACION)
   y hay autorización `on-approve` vigente, el plan se aprueba solo y queda
   atribuido a la autorización; si no, el orquestador junta los planes de la ola y
   los presenta **en lote** al PO («Apruebo las 3»), exactamente como pasó en
   SaiOpenCloud. SECURITY y despliegue siguen siendo siempre de una persona.
4. QA: con la autorización de QA por agente, los tickets cuyos criterios son todos
   `test:` se cierran por política; los que tienen `verify: manual` quedan en
   awaiting_user_tests.
5. Integración: cuando un subagente entrega, **solo el orquestador** toca el
   checkout principal: integra la rama del worktree (`--ff-only` o `--no-ff`),
   une los logs append-only con la lógica que ya existe en `integration-commit.ts`,
   recompila y lanza la siguiente ola. Un escritor, sin árbol sucio que bloquee.
6. Cierre: al terminar (o al cortar con `--max`), el orquestador genera el
   **parte de pruebas** (`valmen journey handoff`): por cada ticket en
   awaiting_user_tests, qué probar y cómo (sale del contrato de pruebas del
   ticket), y lo manda por Telegram y lo guarda en la jornada.

### 2.2 Visibilidad: ver a los agentes trabajando

La vista Jornadas pasa a mostrar **una fila por agente vivo**: ticket, fase
(análisis / plan / implementación / pruebas / entrega), modelo, hora de inicio,
última actividad y herramienta en uso, más la cola de lo que falta y lo entregado.

De dónde sale el dato, en dos capas, como hace pixel-agents:
- **Hooks de Claude Code** (`SessionStart`, `PreToolUse`, `Stop`, `SubagentStart/Stop`)
  que envían el evento a `valmen serve` (`POST /api/ejecuciones/actividad`). Es lo
  que da «qué está haciendo ahora mismo» sin que el agente tenga que acordarse.
- **`registrar_actividad_ejecucion`** desde la skill, en cada cambio de fase. Es lo
  que queda en el registro y vale para auditar después.

pixel-agents (MIT, extensión de VS Code o `npx pixel-agents`) se puede instalar
tal cual como complemento visual: lee los mismos hooks y muestra un personaje por
agente. No lo reemplaza la vista del harness ni al revés: el harness muestra el
estado del **ticket**; pixel-agents muestra el **agente**.

### 2.3 Qué se retira y qué se reutiliza

Se retira: el disparador launchd, `journey advance` como bucle autónomo,
la caducidad de la jornada, `install-trigger`/`clear-stop`, el chequeo de árbol
sucio como bloqueo (pasa a ser un aviso al orquestador).

Se reutiliza sin cambios: `journey plan` y `armar_jornada`, `journey-roadmap`,
perfiles de modelos y su resolución, autorizaciones de QA y de aprobación,
`machine-capacity`, `integration-commit` (unión de logs), el vigilante de avisos
por Telegram, `registrar_actividad_ejecucion`, la corrida delegada
(`valmen delegation`) para lo que sigue siendo de una persona.

Los tickets aprobados que quedaron sin implementar siguen valiendo:
ELEGIBILIDAD-APROBACION y AGENTE-REVISOR son la aprobación automática que el
orquestador usa en el paso 3; CODEGRAPH-MONTAJE es independiente.
FEATURE-ENGINE-JORNADA-APROBACION se absorbe en esta feature.

## 3. Tickets propuestos (feature `corrida-orquestada`)

Orden por dependencia; los tres primeros bastan para usarlo mañana en SaiOpenCloud.

1. FEATURE-ENGINE-JORNADA-OLA — `journey next --wave` y `journey brief --id`:
   olas por dependencia y brief autocontenido por ticket (modelo, esfuerzo, skills,
   compuertas, contrato de entrega).
2. FEATURE-ADAPTER-SKILL-CORRIDA-ORQUESTADA — la skill del orquestador: lanzar
   subagentes en worktree con el perfil de la fase, aprobar en lote, integrar,
   parte final. Sin código nuevo del motor más allá del 1.
3. FEATURE-ENGINE-JORNADA-HANDOFF — `journey handoff`: parte de pruebas por
   ticket en awaiting_user_tests, a Telegram y al registro.
4. FEATURE-ENGINE-INTEGRACION-WORKTREE — integrar la rama de un worktree al
   checkout principal con unión de logs y recompilación, como un solo comando
   (`valmen journey integrate --id`).
5. FEATURE-SERVER-ACTIVIDAD-AGENTES — endpoint `POST /api/ejecuciones/actividad`
   y hook de Claude Code que lo alimenta; proyección del hook en
   `.claude/settings.json` por `valmen sync`.
6. FEATURE-MC-VISTA-AGENTES — vista Jornadas con una fila por agente vivo, cola y
   entregados, en tiempo real.
7. CHORE-CLI-RETIRO-DISPARADOR-JORNADA — retirar launchd, `install-trigger`,
   `clear-stop` y la caducidad; `journey advance` queda solo para preparación
   manual o desaparece.
8. IMPROVEMENT-ADAPTER-CONTRATO-CORRIDA — AGENTS.md y skills: cómo se pide una
   corrida, qué aprueba sola y qué no, un solo escritor en el checkout principal.

Se queda fuera: ejecutar la corrida sin sesión abierta (eso era la jornada y es lo
que no funcionó); cambiar las compuertas; que un subagente integre por su cuenta.

## 4. Riesgos

- Un subagente que no llame a `registrar_actividad_ejecucion` deja la vista a
  ciegas: por eso el hook es la fuente principal y la skill la secundaria.
- Dos subagentes que tocan los mismos archivos chocan al integrar; el `--wave`
  solo separa por dependencia declarada. El orquestador integra uno por uno y, si
  hay conflicto, lo resuelve él o lo devuelve al subagente con el diff.
- La sesión orquestadora consume contexto con cada entrega; `--max` y la
  compactación del cliente lo acotan. El estado vive en el registro, no en la
  conversación, así que una sesión nueva retoma donde quedó.
