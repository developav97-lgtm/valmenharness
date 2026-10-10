# s4 — Revisión del diff congelado

Dominio de las compuertas que miran el código entregado. Hoy ningún recibo de
compuerta queda atado al código: `stateHash` es el hash del texto del ticket
(`packages/engine/src/state.ts:25-48`, comentario en
`packages/engine/src/gate.ts:466-470`) y `subject.revision` es el largo de ese
texto (`gate.ts:884`). Al entregar, `exigirVerificacionMecanica`
(`packages/engine/src/transition.ts:194-216`) compara el recibo de
`qa-mechanical` solo con el texto del ticket, así que un cambio de código
posterior no lo invalida. Solo el recibo de `qa-agent` guarda `base`,
`delivered` y `treeHash` (`packages/engine/src/qa-agent.ts:92-94`). La revisión
del diff es la skill `revision-final`, en prosa y sin recibo; la única
clasificación por rutas tocadas es `CATEGORIAS_DE_RUTA`
(`packages/engine/src/qa-eligibility.ts:26-33`).

### Requirement: R-REV-001 — El recibo de qa-mechanical DEBE guardar el árbol probado y la entrega DEBE rechazarlo si el árbol cambió

El recibo guarda el árbol git de lo que probó (el `tree` del commit, o el hash
del árbol de trabajo cuando no hay commit). `exigirVerificacionMecanica`
compara ese árbol con el actual además del texto del ticket.

#### Scenario: Código cambiado después de qa-mechanical
- **GIVEN** un ticket con recibo `approve` de `qa-mechanical` y un archivo funcional editado después
- **WHEN** se mueve a `awaiting_user_tests`
- **THEN** el motor lo rechaza diciendo que el árbol cambió desde el recibo y nombra la compuerta a repetir

### Requirement: R-REV-002 — El riesgo de la revisión DEBE calcularse en código a partir de lo tocado y del ticket

Bajo: solo documentación, texto o pruebas. Medio: código funcional fuera de las
categorías críticas. Alto: alguna categoría de `CATEGORIAS_DE_RUTA` crítica
(migraciones, despliegue, autenticación, CI, `.valmen/`), o un impacto declarado
(`sync_impact`, `migration_impact`, `docker_impact`), o tipo SECURITY. El riesgo
se puede subir a mano, nunca bajar.

#### Scenario: Dos líneas en autenticación
- **GIVEN** un diff de dos líneas en `packages/core/src/permissions.ts`, que cae en la categoría «autenticación»
- **WHEN** se calcula el riesgo
- **THEN** es alto, aunque el diff sea chico

#### Scenario: Mil líneas de documentación
- **GIVEN** un diff que solo toca archivos `.md` de `docs/`
- **WHEN** se calcula el riesgo
- **THEN** es bajo

### Requirement: R-REV-003 — La revisión DEBE ajustar su profundidad al riesgo

Bajo: sin revisores; solo las comprobaciones estructurales (secretos, colores,
archivos prohibidos). Medio: un revisor. Alto: un revisor con cuatro lentes
(riesgo, resiliencia, legibilidad, fiabilidad). SECURITY: dos revisores
independientes que no ven el resultado del otro. Los revisores responden
proposiciones —hallazgo severo causado por el cambio, con `ruta:línea`— y el
código decide; ningún revisor aprueba.

#### Scenario: Ticket SECURITY
- **GIVEN** un ticket de tipo SECURITY con su diff congelado
- **WHEN** corre la revisión
- **THEN** corren dos revisores sobre el mismo árbol, y un hallazgo bloquea solo si los dos lo confirman; si se contradicen, la compuerta queda en `review` para una persona

### Requirement: R-REV-004 — El recibo de la revisión DEBE quedar atado al árbol revisado y caducar si cambia

El recibo guarda la base, el árbol revisado, el riesgo calculado, los
revisores, sus respuestas y el costo. Si el árbol entregado difiere del
revisado, la revisión no cuenta para la entrega.

#### Scenario: Corrección después de aprobar
- **GIVEN** un recibo `approve` de la revisión y un commit posterior en el ticket
- **WHEN** se pide la entrega
- **THEN** el motor exige revisar el árbol nuevo

### Requirement: R-REV-005 — Un hallazgo severo DEBE admitir una sola corrección acotada antes de escalar

Tras un bloqueo se permite una corrección y una revisión del cambio nuevo
respecto del árbol revisado. Si vuelve a bloquear, la compuerta escala a una
persona; no se abre una tercera ronda.

#### Scenario: Segunda revisión que sigue bloqueando
- **GIVEN** una revisión que bloqueó, una corrección y una segunda revisión que también bloquea
- **WHEN** termina la segunda
- **THEN** la compuerta queda escalada a una persona con los dos recibos
