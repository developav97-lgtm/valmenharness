# s4 — Cuatro estados públicos para el PO

Dominio de cómo se le muestra el estado al PO. Los estados del ticket son
`WORKFLOW_STATES` (`packages/core/src/contract.ts:126-138`) y no cambian. La web
ya agrupa estados en tres lugares que no coinciden: el tablero de la feature
(`packages/server/web/index.html:4071-4082`), la vista Agentes
(`index.html:6337-6339`, con `ESTADOS_QUE_ESPERAN_AL_PO` =
`awaiting_user_tests`, `blocked`, `changes_requested`) y la tira de estado
(`index.html:5662-5673`). El vigilante de Telegram (`pendientesDeAvisar`,
`packages/cli/src/hermes.ts:759`) avisa seis tipos de evento
(`hermes.ts:717-757`), entre ellos `pruebas-listas` y `gate`, pero no avisa un
bloqueo ni un plan que espera aprobación. La referencia son los cuatro estados
públicos de gentle-ai (`docs/trigger-rules.md`, `66bf3e1`).

### Requirement: R-EPU-001 — Una sola función DEBE derivar el estado público de un ticket

La función vive en `@valmen/core` y devuelve uno de cuatro valores:

- **Necesita tu decisión**: `awaiting_user_tests`, `blocked`,
  `changes_requested` (la lista que hoy usa la vista Agentes); `planned` cuando
  la aprobación del plan espera a una persona; y cualquier estado con una
  compuerta escalada a una persona sin resolver.
- **Verificando**: `in_qa`.
- **Listo**: `qa_approved` y `closed`.
- **Trabajando**: el resto (`intake`, `analyzed`, `approved`, `in_progress`, y
  `planned` cuando una autorización vigente aprueba el plan sin una persona).

#### Scenario: Plan que espera aprobación
- **GIVEN** un ticket en `planned` sin autorización de aprobación vigente que lo cubra
- **WHEN** se deriva su estado público
- **THEN** es «Necesita tu decisión»

#### Scenario: Compuerta escalada en curso
- **GIVEN** un ticket en `in_progress` con una compuerta escalada a una persona sin decisión
- **WHEN** se deriva su estado público
- **THEN** es «Necesita tu decisión»

### Requirement: R-EPU-002 — La vista web DEBE mostrar el estado público con la misma función

La lista de tickets, la vista del ticket y la vista Agentes muestran el estado
público junto al estado del motor; `ESTADOS_QUE_ESPERAN_AL_PO` y sus copias se
reemplazan por la función. El tablero de la feature conserva sus columnas.

#### Scenario: Mismo ticket en dos vistas
- **GIVEN** un ticket en `blocked`
- **WHEN** se mira en la lista y en la vista Agentes
- **THEN** las dos dicen «Necesita tu decisión»

### Requirement: R-EPU-003 — El vigilante DEBE avisar por Telegram cuando un ticket pasa a «Necesita tu decisión»

Un aviso por cada entrada a ese estado, con el ticket, el motivo (bloqueado,
plan por aprobar, pruebas listas, compuerta escalada, cambios pedidos) y el
enlace a su pantalla. Entra por el vigilante de avisos (EST-002) y no duplica
`pruebas-listas` ni `gate`: si uno de ellos ya avisó esa misma entrada, no se
manda otro.

#### Scenario: Ticket bloqueado
- **GIVEN** un ticket que pasa de `in_progress` a `blocked`
- **WHEN** corre el vigilante
- **THEN** llega un aviso con el ticket y el motivo «bloqueado», una sola vez

#### Scenario: Pruebas listas ya avisadas
- **GIVEN** un ticket que pasa a `awaiting_user_tests` y ya generó el aviso `pruebas-listas`
- **WHEN** corre el vigilante
- **THEN** no llega un segundo aviso por esa misma entrada
