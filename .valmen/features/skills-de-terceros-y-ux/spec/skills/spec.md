# Skills de terceros, revisión de UX y CodeGraph

Pedido del PO (2026-10-07): contar, al montar el harness, con las skills que de
verdad ayudan, empezando por la revisión de experiencia de usuario, y con CodeGraph.

### Requirement: R-SKILL-001 — Una skill de terceros DEBE declararse por proyecto con fuente y versión fijada

El proyecto DEBE declarar cada skill de terceros con su fuente, una versión o commit
fijado y el hash de su contenido. El harness NO DEBE instalarla ni actualizarla sin
que una persona lo pida, y DEBE rechazar una declaración sin versión fijada.

#### Scenario: Sin versión
- **GIVEN** una skill declarada sin versión fijada
- **WHEN** se lee la configuración
- **THEN** se rechaza con el nombre de la skill

### Requirement: R-SKILL-002 — Una skill de terceros DEBE tener una revisión registrada antes de habilitarse

Antes de habilitar una skill, una persona DEBE registrar su revisión (quién, cuándo,
qué permisos usa y el hash revisado). Si el contenido instalado cambia respecto del
hash revisado, DEBE deshabilitarse hasta una nueva revisión.

#### Scenario: Contenido cambiado
- **GIVEN** una skill revisada cuyo contenido cambió
- **WHEN** corre el diagnóstico
- **THEN** la skill queda deshabilitada y el diagnóstico dice por qué

### Requirement: R-SKILL-003 — La revisión de UX DEBERÍA usar UI UX Pro Max e Impeccable en los tickets que tocan pantallas

En un ticket que toca pantallas, la fase de diseño DEBERÍA apoyarse en UI UX Pro Max
(sistema de diseño) y la revisión previa a la entrega en Impeccable, junto con
`revisar_presentacion`. Su resultado DEBE quedar en el ticket como evidencia, y NO
DEBE bloquear la entrega por sí solo.

#### Scenario: Ticket con pantalla
- **GIVEN** un ticket que modifica una pantalla y las dos skills habilitadas
- **WHEN** se prepara la entrega
- **THEN** el ticket recibe un informe de UX como evidencia

### Requirement: R-SKILL-004 — CodeGraph DEBERÍA ofrecerse al montar o adoptar un proyecto

Al montar o adoptar un proyecto, el harness DEBERÍA detectar si CodeGraph está
instalado y, si no, ofrecer instalarlo e indexar el proyecto, solo con confirmación
de una persona. Si está instalado, DEBE registrar su servidor MCP en cada cliente que
el proyecto usa, y el diagnóstico DEBE mostrar si el índice existe y si está al día.

#### Scenario: Proyecto sin índice
- **GIVEN** un proyecto con CodeGraph instalado y sin índice
- **WHEN** corre el diagnóstico
- **THEN** dice que falta indexar y cómo hacerlo, sin indexar por su cuenta

### Requirement: R-SKILL-005 — Las skills restantes DEBEN evaluarse con una decisión registrada

Cada skill de la lista del PO que no se integre en esta feature DEBE evaluarse con
la fuente consultada, lo que hace, el solapamiento con el harness, el riesgo y una
decisión (incluir, probar, descartar) con su motivo, y el resultado DEBE quedar en
un documento de la feature.

#### Scenario: Skill descartada
- **GIVEN** una skill que repite lo que ya hace el harness
- **WHEN** se evalúa
- **THEN** el documento la marca descartada con el motivo
