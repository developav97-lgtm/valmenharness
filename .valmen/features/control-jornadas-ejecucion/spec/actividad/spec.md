# Actividad observable de un ticket

Actividad observada o declarada por una fuente; validación y QA permanecen en el
registro. No se interpreta silencio como éxito ni se inventa una actividad.

### Requirement: R-ACT-001 — La consulta DEBE distinguir estado validado, actividad actual y estado de ejecución.

Análisis, planificación, implementación, validación y entrega tienen comienzo,
fin y fuente cuando estén disponibles. La ejecución distingue activa, esperando
intervención, esperando recurso, terminada, fallida y desconocida sin añadirlos
al workflow. La actividad identifica señal directa, declaración o inferencia.

#### Scenario: Analizar un ticket nuevo

- **GIVEN** un ticket en `intake` y una señal de análisis iniciado
- **WHEN** se consulta detalle o jornada
- **THEN** el estado validado sigue en `intake` y la actividad muestra análisis con inicio y procedencia

### Requirement: R-ACT-002 — Cada intento DEBE enlazar su sesión ejecutora sin confundirla con la sesión que pidió el trabajo.

La referencia identifica adaptador y ámbito. Reintentos y continuaciones por
compactación mantienen el vínculo verificable. Si falta asociación, se declara;
una coincidencia de título u hora no se publica como identidad cierta.

#### Scenario: Conversación que crea tres tarjetas

- **GIVEN** una sesión de origen con tres tarjetas y workers con sesiones propias
- **WHEN** se abre la actividad de una ejecución
- **THEN** se consulta su sesión ejecutora y la sesión de origen aparece identificada aparte

### Requirement: R-ACT-003 — El panel DEBE mostrar herramientas y mensajes visibles disponibles por el contrato del ejecutor.

Se muestran resultados de validación, mensajes, errores y esperas con tiempo y
fuente. Carga por páginas o incrementos al abrir detalle. Se excluyen secretos
y campos de pensamiento privado; no se exige cada token ni se reconstruyen
mensajes con un modelo. Ausencia de mensajes no borra fases.

#### Scenario: Seguir pruebas

- **GIVEN** un intento cuya sesión publica una herramienta de pruebas
- **WHEN** se abre su panel de actividad
- **THEN** se ve el inicio y luego el resultado publicado sin cargar todos los historiales del equipo

### Requirement: R-ACT-004 — La vista DEBE distinguir modelo configurado y modelo efectivo de cada intento.

Modelo efectivo y proveedor proceden de datos observables. El override de una
tarjeta es intención. Los cambios observados conservan sus tramos; dato ausente
figura desconocido. Métricas con procedencia y costo real/estimado explícitos;
una sesión compartida no duplica su consumo entre tickets ni proyectos.

#### Scenario: Modelo distinto al override

- **GIVEN** una tarjeta configurada con un modelo y una sesión que registra otro
- **WHEN** se consulta su intento
- **THEN** se diferencia lo configurado de lo utilizado y se conserva la fuente

### Requirement: R-ACT-005 — Una sesión abierta NO DEBE clasificarse como fallida solo porque carece de finalización.

Se combinan actividad, heartbeat, propiedad del intento y terminación según
disponibilidad. Falta de señal significa actividad no confirmada, no fallo ni
éxito automáticos. Umbrales de frescura según frecuencia de la fuente.

#### Scenario: ended_at vacío

- **GIVEN** una sesión sin finalización y con actividad reciente del intento
- **WHEN** se proyecta su estado
- **THEN** aparece activa y no fallida

### Requirement: R-ACT-006 — Un ticket ejecutado directamente DEBE ser observable sin tablero ni jornada.

CLI/MCP permiten registrar inicio, actividad y espera. Los lectores de OpenCode
y Codex complementan lo realmente observable. Un cliente sin hooks puede emitir
señales explícitas; el diagnóstico informa qué no puede producir automáticamente.

#### Scenario: Otro agente con terminal

- **GIVEN** un ticket autorizado y Claude Code, Codex u otro cliente con terminal sin dispatcher
- **WHEN** registra planificación y luego el fin de su intento
- **THEN** el historial es consultable por CLI/MCP y Mission Control sin tarjeta de Hermes
