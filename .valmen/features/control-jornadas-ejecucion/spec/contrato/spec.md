# Contrato portable de ejecución

Requisitos de comportamiento futuro. Su escritura no anuncia comandos nuevos
ya disponibles. El flujo básico y sus gates existentes se conservan.

### Requirement: R-CON-001 — El flujo directo DEBE funcionar mediante CLI sin instalar Hermes ni abrir Mission Control.

Un agente con terminal usa el registro, las transiciones, los gates y la
evidencia. Las operaciones nuevas no cargan integraciones deshabilitadas como
condición de funcionamiento. Consultar actividad no exige un daemon permanente.

#### Scenario: Equipo que solo usa terminal

- **GIVEN** un proyecto adoptado y un agente con terminal, sin Hermes
- **WHEN** registra la ejecución de un ticket y consulta su actividad por CLI
- **THEN** recibe el estado persistido y continúa el flujo autorizado sin tablero ni servidor de interfaz

### Requirement: R-CON-002 — CLI y MCP DEBEN consumir el mismo contrato de ejecución del motor.

MCP ofrece equivalentes de registrar inicio, actividad, espera y finalización,
y consultar ejecuciones y jornadas. La UI consulta el mismo motor. Permisos,
validaciones y resultados son equivalentes por las tres puertas.

#### Scenario: Alternar interfaces

- **GIVEN** una ejecución registrada por CLI
- **WHEN** se consulta mediante MCP y Mission Control
- **THEN** las tres superficies devuelven las mismas identidades, revisiones y hechos persistidos

### Requirement: R-CON-003 — Cada ejecución DEBE tener identidad explícita de proyecto y un identificador propio.

El ticket pertenece a ese proyecto; la jornada es opcional y cada reintento
tiene identificador de intento. Las referencias externas llevan su origen y
ámbito: máquina, adaptador, perfil/base, tablero y sesión según corresponda.
Un identificador de ticket aislado no identifica una ejecución global.

#### Scenario: Identificadores coincidentes

- **GIVEN** dos proyectos con el mismo identificador de ticket
- **WHEN** registran ejecuciones en sus contextos declarados
- **THEN** consultar una no devuelve la actividad de la otra

### Requirement: R-CON-004 — Los eventos de ejecución DEBEN persistirse con orden y deduplicación verificables.

Cada evento registra identidad, intento, clase, fuente, instante declarado,
instante de recepción y cursor o revisión estable. Se anexa al historial; un
reenvío con la misma identidad no lo duplica. El replay es determinista y un
evento fuera de orden no hace retroceder la proyección actual.

#### Scenario: Reenvío tras caída

- **GIVEN** un evento de inicio ya persistido
- **WHEN** el cliente reintenta su envío y se reconstruye la ejecución desde disco
- **THEN** existe un solo inicio y la proyección conserva orden y procedencia

### Requirement: R-CON-005 — Los adaptadores DEBEN declarar sus capacidades disponibles y sus límites.

Se distingue observar estados, leer actividad, leer mensajes y despachar.
Instalar una integración no prueba acceso ni compatibilidad. Una capacidad
ausente se declara sin bloquear otras fuentes sanas. Otro cliente puede usar
el contrato genérico por CLI/MCP sin desarrollar un plugin propio.

#### Scenario: Ejecutor sin conversaciones consultables

- **GIVEN** un ejecutor que publica fases por CLI pero no mensajes
- **WHEN** se consulta su ejecución
- **THEN** aparecen las fases y la conversación figura no disponible

### Requirement: R-CON-006 — Registrar actividad NO DEBE aprobar gates ni alterar las máquinas de estados existentes.

Workflow, QA y release conservan sus contratos independientes. Terminar una
actividad no aprueba QA ni cierra un ticket. Los registros históricos sin
telemetría siguen siendo válidos y trabajables.

#### Scenario: Fin de ejecución antes de QA

- **GIVEN** un ticket en `awaiting_user_tests`
- **WHEN** el ejecutor registra el fin de su intento
- **THEN** la ejecución termina y el ticket conserva la espera de pruebas del responsable
