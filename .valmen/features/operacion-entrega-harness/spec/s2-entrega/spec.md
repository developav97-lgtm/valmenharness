# s2 — Tamaño de la entrega

Dominio de la integración de un ticket: `integrarTicket`
(`packages/engine/src/integration-commit.ts:235`), llamado desde la ejecución
autónoma (`packages/engine/src/autonomous-run.ts:521`), e `integrarWorktree`
(`packages/engine/src/worktree-integrar.ts:50`). Hoy no se mide el tamaño del
diff: solo se usa `diff --name-only` (`worktree-integrar.ts:82`). No hay PRs: la
integración es local y sin push. La referencia es la política de unas 400
líneas por pieza de gentle-ai (`66bf3e1`, `docs/usage.md`), que es orientativa y
no un tope duro.

### Requirement: R-ENT-001 — La integración DEBE medir y registrar las líneas añadidas y borradas del ticket

Cuenta las líneas añadidas más las borradas de los archivos del ticket,
excluyendo el estado del harness (la misma exclusión de
`integration-commit.ts:22-28`) y los archivos generados, y lo registra como
evento del ticket.

#### Scenario: Integración desde worktree
- **GIVEN** un ticket con 120 líneas añadidas y 30 borradas en código y pruebas
- **WHEN** se integra con `valmen journey worktree integrate --id <ID>`
- **THEN** el ticket gana un evento con 150 líneas, separadas en añadidas y borradas

### Requirement: R-ENT-002 — Pasar el tope configurado DEBE avisar sin bloquear

Una clave de `.valmen/config.yaml` fija el tope en líneas (400 si no se declara).
Al pasarlo, la integración avisa con el tamaño y sigue; la ejecución autónoma
lo anota en el parte de la jornada.

#### Scenario: Entrega grande
- **GIVEN** un tope de 400 y un ticket con 900 líneas
- **WHEN** se integra
- **THEN** la integración termina, avisa las 900 líneas contra el tope y el evento queda registrado

### Requirement: R-ENT-003 — El plan DEBERÍA declarar el tamaño previsto y cómo se parte si excede el tope

La skill `planificacion` pide estimar el tamaño y, si excede el tope, elegir
entre partir el ticket en tickets dependientes o seguir con un motivo escrito.
La elección queda en el plan y la aprueba la persona junto con él.

#### Scenario: Plan que excede
- **GIVEN** un plan que prevé 1 200 líneas con un tope de 400
- **WHEN** se escribe el plan
- **THEN** el plan declara si se parte en tickets o sigue con su motivo, antes de pedir la compuerta
