# Actualización y presentación

### Requirement: R-VIV-001 — Mission Control DEBE presentar la hoja de ruta completa de las jornadas seleccionadas.

Filtros por proyecto/jornada y fila por ticket: orden, inicio programado o
condición, inicio real, actividad, duración medida, espera, dependencia y último
dato recibido. Los tramos permiten comparar finales e inicios. El detalle
reutiliza historia por ticket y muestra intentos sin borrar los anteriores.

#### Scenario: Jornada en curso

- **GIVEN** tickets programados, terminados, activos y esperando intervención
- **WHEN** se abre la jornada
- **THEN** todos aparecen con situación y fases conocidas sin abrir cada ticket para reconstruir el orden

### Requirement: R-VIV-002 — Un cambio persistido disponible DEBE aparecer en Mission Control en menos de cinco segundos bajo operación local normal.

Se mide desde que el lector autorizado puede obtener el evento hasta que la
fila visible se actualiza, con panel conectado y dos proyectos locales. La
latencia previa a publicar un dato pertenece a la fuente y se declara aparte.
El avance no requiere recargar ni consultar al modelo.

#### Scenario: Desbloqueo externo

- **GIVEN** una fila bloqueada y un evento de desbloqueo disponible en la fuente
- **WHEN** el lector lo incorpora con la vista conectada
- **THEN** la fila muestra la situación nueva en menos de cinco segundos según la medición acordada

### Requirement: R-VIV-003 — La reconexión DEBE reconciliar los eventos pendientes sin perderlos ni duplicarlos.

Cursores por fuente/proyecto; si ya no son válidos, foto actual y reanudación
desde frontera verificable. Una respuesta tardía no retrocede una revisión.
Se reconcilia al recuperar conexión o foco según el transporte disponible.

#### Scenario: Bloqueo y desbloqueo durante caída

- **GIVEN** un panel desconectado mientras ocurren ambos eventos
- **WHEN** se recupera la conexión
- **THEN** se recupera el historial disponible y la fila converge al último estado persistido

### Requirement: R-VIV-004 — La pantalla DEBE declarar la frescura y los fallos de cada fuente por separado.

Conexión del panel, frescura de la fuente y liveness del worker son señales
distintas. Leer sin cambios no equivale a inaccesibilidad. Se conserva el último
dato ante error con fecha y aviso; un reloj de duración no prueba actividad.

#### Scenario: Panel conectado y Hermes inaccesible

- **GIVEN** SSE disponible y fuente Hermes inaccesible
- **WHEN** se muestra la jornada
- **THEN** se identifica conexión del panel y datos Hermes desactualizados con su última lectura válida

### Requirement: R-VIV-005 — La actualización DEBE usar lecturas acotadas sin releer todas las conversaciones en cada cambio.

Eventos por cursor, proyectos declarados y mensajes paginados. Una fuente
deshabilitada no crea watchers ni polling. La entrega mide memoria, CPU y
latencia con dos proyectos y un worker en el equipo de referencia; no se afirma
compatibilidad con 8 GB sin medición ni se exige un servicio nuevo de base de datos.

#### Scenario: Heartbeat con historial amplio

- **GIVEN** dos proyectos con sesiones históricas y un intento activo
- **WHEN** se recibe su heartbeat
- **THEN** se actualiza información acotada sin cargar los mensajes históricos ni iniciar un servicio obligatorio adicional

### Requirement: R-VIV-006 — La vista DEBE conservar contexto y funcionar con teclado y temas claro u oscuro.

Refrescos parciales conservan filtros, selección y scroll; acciones en curso no
pierden entradas. Rótulos en español, estados sin depender solo del color y
valores del tema. El reloj local no requiere consultas continuas al servidor.

#### Scenario: Lectura de bloqueo

- **GIVEN** una fila seleccionada con motivo abierto en modo oscuro
- **WHEN** llegan eventos de otro ticket
- **THEN** se conserva la lectura y los estados son reconocibles por texto y teclado en ambos temas
