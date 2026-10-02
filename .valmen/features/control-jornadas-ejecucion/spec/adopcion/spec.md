# Adopción por otros equipos y agentes

Amplía la puesta en marcha existente dentro del entorno autorizado por la
persona. No modifica ahora un proyecto destino ni instala integraciones.

### Requirement: R-ADO-001 — La puesta en marcha DEBE ofrecer rutas CLI, MCP y Hermes opcional por separado.

La mínima adopta registro y flujo por CLI. MCP añade conexión a un cliente con
esa capacidad. Hermes añade perfil y capacidades pedidas. Mission Control y
notificaciones son elecciones separadas. Cada ruta declara requisitos reales.

#### Scenario: RP sin Hermes

- **GIVEN** un compañero con el repositorio del harness y su proyecto destino
- **WHEN** elige CLI desde su agente
- **THEN** instala un flujo operable sin Hermes, Telegram ni cron

### Requirement: R-ADO-002 — La guía DEBE permitir configuración por persona o agente con comprobaciones de resultado.

Incluye descubrimiento, instalación, adopción, reglas, conexión, verificación y
recuperación. Prompts copiables para terminal o MCP accesible, con comandos
existentes diferenciados de capacidades futuras. Un chat alojado sin esas
herramientas no recibe una conexión local ficticia.

#### Scenario: Pedido de configuración

- **GIVEN** la instrucción de configurar el harness en una raíz autorizada
- **WHEN** el agente sigue la guía según sus herramientas
- **THEN** informa cambios y verificaciones o identifica la herramienta faltante sin afirmar una instalación que no ejecutó

### Requirement: R-ADO-003 — Repetir la configuración NO DEBE sobrescribir reglas ni conexiones ajenas existentes.

Usa adopción/proyección existentes; preserva servidores MCP y reglas del equipo.
Los conflictos muestran la propuesta antes de aplicarse. Bindings locales no
importan permisos ni configuración personal de otro desarrollador. No se crean
proyectos ni despachadores duplicados.

#### Scenario: Segunda instalación

- **GIVEN** reglas propias y una conexión MCP ajena
- **WHEN** se repite la puesta en marcha
- **THEN** se conserva lo existente y no se duplican bindings ni despachadores

### Requirement: R-ADO-004 — El diagnóstico DEBE separar el flujo básico de las capacidades opcionales seleccionadas.

Extiende diagnóstico existente: CLI/MCP, registro, proyecto efectivo, eventos,
compatibilidad y despacho si se habilitó. Fallos con paso de recuperación. No
seleccionar Hermes no bloquea CLI; tener archivos no prueba una conexión.

#### Scenario: MCP correcto sin Hermes

- **GIVEN** una instalación MCP verificada sin Hermes seleccionado
- **WHEN** se corre el diagnóstico
- **THEN** MCP aparece listo y Hermes no seleccionado sin bloquear el flujo

### Requirement: R-ADO-005 — Observación y despacho DEBEN habilitarse por elección explícita de configuración.

Adoptar no agenda trabajo ni habilita lectura de conversaciones por defecto.
La elección declara datos leídos y alcance del ejecutor. No modifica credenciales,
hosts, exposición de red ni gates humanos; requieren sus procedimientos propios.

#### Scenario: Instalar sin automatizar

- **GIVEN** un pedido de configurar CLI y el flujo de tickets
- **WHEN** termina la puesta en marcha
- **THEN** queda operable sin workers iniciados, jornadas despachadas ni cambios de seguridad implícitos

### Requirement: R-ADO-006 — La guía DEBE verificar el paso a paso en un registro temporal sin afectar tickets reales.

Comprobación mecánica con herramientas disponibles; compara CLI/MCP si se
eligieron ambos. Gates semánticos requieren proveedor configurado y su ausencia
se declara sin aprobar tickets reales. La implementación comprueba instrucciones
antes de prometer soporte de un sistema operativo o cliente específico.

#### Scenario: Equipo sin proveedor semántico

- **GIVEN** un entorno preparado para CLI sin proveedor semántico
- **WHEN** se ejecuta la comprobación en un registro temporal
- **THEN** se verifica el contrato mecánico y se declaran pasos pendientes sin crear ni cerrar tickets reales
