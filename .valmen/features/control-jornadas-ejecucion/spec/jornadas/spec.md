# Jornadas, dependencias y ejecución opcional

La jornada expresa intención y orden. Un adaptador habilitado ejecuta esa
intención; crear o consultar la jornada no instala un ejecutor.

### Requirement: R-JOR-001 — Una jornada DEBE conservar su lista de tickets y las condiciones de inicio de cada uno.

Identifica proyecto, prioridad, dependencias, ventana y autorizaciones aplicables.
Las revisiones se registran sin sustituir el historial. Se diferencian inicio
programado, condicionado y real; una dependencia pendiente no tiene inicio real
inventado. Un ticket puede reaparecer en otra jornada sin perder sus intentos.

#### Scenario: Cinco tickets con un arranque

- **GIVEN** cinco tickets en una jornada cuya ventana comienza a las 08:00
- **WHEN** se consulta antes de empezar
- **THEN** aparecen los cinco, su orden y condiciones sin asignarles cinco cron individuales

### Requirement: R-JOR-002 — La selección DEBE permitir avanzar con un ticket independiente y autorizado cuando otro espera intervención.

Se respetan prioridad, capacidad, ventana y permisos. Los dependientes esperan
el cumplimiento verificable de su dependencia. Un `done` del tablero no prueba
por sí solo el estado requerido del ticket. El motivo distingue plan, gate, QA,
recurso y dependencia pendientes.

#### Scenario: Bloqueo de A

- **GIVEN** A esperando aprobación, B dependiente de A y C independiente autorizado
- **WHEN** existe capacidad y ventana válida para C
- **THEN** C puede seleccionarse y B permanece esperando con motivo explícito

### Requirement: R-JOR-003 — El siguiente ticket elegible DEBE poder iniciar por disponibilidad sin esperar una hora fija posterior.

La selección entrega trabajo al único despachador configurado. El calendario
abre la ventana; la disponibilidad habilita trabajo. Sin capacidad de despacho
la jornada se puede consultar y ofrece el siguiente elegible para ejecución manual.

#### Scenario: Terminar temprano

- **GIVEN** una jornada abierta con A activo y C elegible al liberar capacidad
- **WHEN** A termina a las 08:30
- **THEN** el despachador habilitado puede iniciar C sin esperar a las 10:00 ni pedir autorización ya registrada

### Requirement: R-JOR-004 — El fin de una ventana DEBE impedir nuevos despachos de esa ventana sin interrumpir automáticamente el trabajo activo.

Horarios con zona horaria explícita, incluidas ventanas que cruzan medianoche.
Terminado el intento activo, el recurso puede servir a la siguiente ventana.
Detener un proceso o prorrogar la ventana requiere acción explícita conforme
a su política; el retraso real se muestra.

#### Scenario: Trabajo del día invade la noche

- **GIVEN** un intento de SaiOpenCloud activo al cerrar su ventana
- **WHEN** comienza la del arnés en una máquina con capacidad uno
- **THEN** no se despacha más trabajo hasta liberar capacidad y la espera del arnés queda visible

### Requirement: R-JOR-005 — Las ejecuciones administradas DEBEN respetar una capacidad compartida y persistida por máquina.

El límite abarca proyectos y adaptadores conectados a ese ámbito. La reserva se
reclama atómicamente y se reconcilia con liveness antes de recuperarla. Un reinicio
no duplica despacho. No se promete controlar procesos externos sin conexión al
contrato. Se propone capacidad uno para el primer uso, configurable por equipo.

#### Scenario: Disputa por el último recurso

- **GIVEN** una máquina con capacidad uno y dos tickets elegibles
- **WHEN** dos despachos intentan reservar capacidad simultáneamente
- **THEN** solo uno inicia trabajo y el otro queda esperando recurso

### Requirement: R-JOR-006 — Observar o configurar jornadas NO DEBE ampliar la autorización de ejecución del proyecto.

Se consumen elegibilidad y parada de las políticas vigentes, incluidas las
capacidades S5 cuando estén implementadas. Sin autorización verificable no hay
despacho automático. Un reintento no evade parada segura ni convierte aprobación
del alcance en aprobación del plan. La ronda de revisión interna (segunda
pasada de verificación sobre un ticket ya entregado) NO DEBE ser automática:
es una decisión del verificador que exige recomendación explícita con motivo;
el motor la registra como decisión y no la repite por defecto.

#### Scenario: Falta plan aprobado

- **GIVEN** un ticket cuya política exige plan aprobado antes de implementar
- **WHEN** la jornada encuentra capacidad para él
- **THEN** conserva la espera de aprobación y no inicia implementación por pertenecer a la jornada

#### Scenario: Verificador sin recomendación de segunda ronda

- **GIVEN** el ticket entregado y verificado con progreso en verde
- **WHEN** el verificador no recomienda segunda ronda
- **THEN** el ticket pasa directo a `awaiting_user_tests` con el gate mecánico y su evidencia, sin segunda pasada
