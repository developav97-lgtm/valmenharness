# S1 — Línea de tiempo de fases por ticket

Requisitos de la feature: que cada ticket muestre, en Mission Control, cuándo
empezó cada fase, cuánto duró y cuál corre ahora, en vivo.

### Requirement: R-S1-001 — Línea de fases por ticket — La API DEBE exponer, para cada ticket del registro, la secuencia de sus fases con hora de inicio, hora de fin y duración, derivada de las transiciones de estado del ticket.

La API `GET /api/ticket/fases` DEBE exponer, para cada ticket del registro, la
secuencia de sus fases —`intake, analyzed, planned, approved, in_progress,
blocked, awaiting_user_tests, in_qa, changes_requested, qa_approved,
closed—_-- con hora de inicio, hora de fin y duración de cada una, derivada de
las transiciones de estado registradas (bloques append-only del ticket y, como
fuente complementaria, `task_events` del board de kanban). Cada fase DEBE
indicar si es la fase en curso. Un ticket sin transiciones DEBE aparecer con su
fase única desde `created_at`.

### Requirement: R-S1-002 — Transición en vivo — La línea de fases DEBE actualizarse en vivo: la transición nueva aparece en la pantalla en

La línea de fases DEBE actualizarse en vivo: la transición nueva aparece en la
pantalla en cuanto ocurre, sin recargar, por el flujo de eventos SSE existente
(`GET /api/events`). El estado intermedio visible DEBE distinguir «sigue
andando normal» de «espera decisión/bloqueado», con el motivo del bloqueo
cuando exista.

### Requirement: R-S1-003 — Fase y consumo — Cada fase DEBE enlazar sus sesiones de timeline (las que corrieron durante esa fase) con

Cada fase DEBE enlazar sus sesiones de timeline (las que corrieron durante esa
fase) con su coste, tokens e intervenciones, reusing el endpoint `/api/timeline`
que ya existe; el crédito de una sesión ya repartida por tickets se muestra tal
cual el reparto la asigna.

### Requirement: R-S1-004 — Solo lectura y append-only — La línea de fases DEBE derivarse leyendo el registro: la feature no escribe en los

La línea de fases DEBE derivarse leyendo el registro: la feature no escribe en
el registro ni en `task_events`. Ningún bloque append-only se reescribe.

### Requirement: R-S1-005 — Presetación — La pantalla de ticket en Mission Control DEBE mostrar la línea como una banda

La pantalla del ticket en Mission Control DEBE mostrar la fase como una banda:
fases cerradas con su duración, la fase en curso con su comienzo y el tiempo
llevado, y el bloqueo (si existe) con su motivo. Sin colores fijos: los valores
salen del tema. Todo lo que muestra la pantalla DEBE estar en español.
