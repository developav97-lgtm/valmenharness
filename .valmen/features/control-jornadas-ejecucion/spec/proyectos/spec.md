# Contexto de proyectos y máquinas

El portafolio básico pertenece al ticket existente de `evolucion-harness`.
Estos requisitos concretan cómo las nuevas vistas usan ese contexto.

### Requirement: R-PRO-001 — Mission Control DEBE permitir cambiar entre proyectos declarados desde una sola instancia.

El selector permite un proyecto o la vista conjunta. Tickets, jornadas, fases,
sesiones, contadores y acciones usan el contexto seleccionado. Cada fila de la
vista conjunta identifica su proyecto; ninguna acción mutante opera sobre
todos por una selección ambigua.

#### Scenario: Cambiar de SaiOpenCloud al arnés

- **GIVEN** dos proyectos declarados con registros independientes
- **WHEN** se selecciona ValmenHarness en Mission Control
- **THEN** vistas y acciones apuntan al arnés sin abrir otra instancia ni conservar datos de SaiOpenCloud como propios

### Requirement: R-PRO-002 — Cada operación DEBE resolver su proyecto contra una declaración autorizada.

Se valida pertenencia de tickets, ejecuciones y fuentes. Una ruta recibida en
una query no concede acceso arbitrario al disco. Las respuestas tardías no
alteran el proyecto recién seleccionado. La escritura conserva el alcance y
la autoridad existentes de la operación.

#### Scenario: Respuesta tardía

- **GIVEN** una consulta pendiente al proyecto A
- **WHEN** la persona cambia al proyecto B antes de que llegue la respuesta
- **THEN** la respuesta de A no cambia datos ni habilita acciones en B

### Requirement: R-PRO-003 — Una sesión sin directorio DEBE requerir asociación explícita para mostrarse como propia de un proyecto.

Puede asociarse por binding autorizado de perfil/base, registro de ejecución
u otro vínculo verificable. Las rutas se comparan por componentes, no por
semejanza textual. Una sesión sin asociación queda sin atribuir y no se publica
en el detalle de otro proyecto.

#### Scenario: Perfil con sesiones sin cwd

- **GIVEN** una sesión sin directorio ni raíz Git declarados
- **WHEN** el lector agrega el portafolio
- **THEN** solo la atribuye al proyecto vinculado explícitamente a su origen o la declara sin atribuir

### Requirement: R-PRO-004 — La configuración DEBE separar las políticas compartibles de los bindings propios de cada máquina.

Las referencias lógicas y políticas son compartibles; rutas absolutas, puertos,
perfiles locales y secretos se resuelven en destino. La identidad de máquina
distingue equipos que trabajan el mismo proyecto. Agregar un proyecto no obliga
a compartir registro, credenciales ni perfiles con otro.

#### Scenario: Otra máquina y otro cliente

- **GIVEN** configuración versionada sin rutas personales
- **WHEN** un compañero la adopta con otra raíz y otro cliente
- **THEN** declara sus bindings sin editar la política común ni usar perfiles del desarrollador original

### Requirement: R-PRO-005 — La vista conjunta DEBE declarar la disponibilidad de cada máquina o fuente por separado.

La entrega inicial conecta proyectos locales. El contrato admite referencias
a otra máquina sin interpretar sus raíces como directorios locales. Conectividad
remota requiere implementación y autorización propias; su ausencia no bloquea
el portafolio local ni obliga a compartir los registros.

#### Scenario: Referencia remota sin conexión

- **GIVEN** un proyecto local legible y una referencia remota sin adaptador habilitado
- **WHEN** se abre la vista conjunta
- **THEN** aparece el local con sus datos y el remoto con disponibilidad explícita
