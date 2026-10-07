# Perfiles de modelos por fase y por ejecutor

Pedido del PO (2026-10-07): delegar cada fase al modelo que realmente puede
ejecutarla, con perfiles personalizables y mixtos, seleccionables por proyecto y
por ejecutor, y con verificación de que se cumplen.

### Requirement: R-PERF-001 — Un perfil DEBE asignar proveedor, modelo y esfuerzo a cada rol y fase

Un perfil DEBE tener un nombre y, para cada rol del enrutamiento y cada fase del
agente (análisis, plan, implementación y verificación), un proveedor, un modelo y
un esfuerzo. Un perfil PUEDE mezclar proveedores. Los perfiles incorporados DEBEN
incluir Claude Code completo, Codex completo y OpenCode Go.

#### Scenario: Perfil mixto
- **GIVEN** un perfil que asigna análisis y plan a Claude Code y la implementación a Codex
- **WHEN** se guarda
- **THEN** el perfil queda válido y cada fase conserva su proveedor

### Requirement: R-PERF-002 — La persona DEBERÍA poder crear, editar y elegir perfiles

Mission Control DEBE permitir crear un perfil a partir de otro, editar sus modelos
y elegirlo. La elección DEBE poder hacerse por proyecto y por ejecutor, de modo que
Hermes use otro perfil que Claude Code. Un preset NO DEBE sobrescribir lo que un
perfil elegido declara.

#### Scenario: Elegir un perfil
- **GIVEN** el perfil «Claude Code completo» elegido para el proyecto
- **WHEN** se resuelve el modelo de la fase de plan
- **THEN** sale del perfil, aunque el preset sea otro

### Requirement: R-PERF-003 — Un modelo DEBE existir en el catálogo de su proveedor

Al guardar un perfil, cada identificador de modelo DEBE comprobarse contra el
catálogo de su proveedor. Un identificador inexistente DEBE rechazarse con el nombre
del rol y del modelo.

#### Scenario: Modelo inexistente
- **GIVEN** un perfil con un modelo que el proveedor no ofrece
- **WHEN** se guarda
- **THEN** se rechaza y dice qué rol y qué modelo fallan

### Requirement: R-PERF-004 — Cada fase DEBE ejecutarse con el ejecutor y el modelo de su proveedor

Al lanzar una fase, el despacho DEBE usar el ejecutor que corresponde al proveedor
de la fase y el modelo del perfil. Si el ejecutor de ese proveedor no está
autorizado por el proyecto, el despacho NO DEBE caer en silencio a otro: DEBE
detenerse y decir qué falta.

#### Scenario: Fase de otro proveedor
- **GIVEN** un perfil mixto con la implementación en Codex y un proyecto que autoriza a Codex
- **WHEN** la jornada despacha la implementación
- **THEN** la lanza con Codex y el modelo del perfil

#### Scenario: Ejecutor no autorizado
- **GIVEN** una fase cuyo proveedor no está autorizado en el proyecto
- **WHEN** se despacha
- **THEN** se detiene con el motivo y no usa otro ejecutor

### Requirement: R-PERF-005 — El modelo efectivo de cada fase DEBE ser visible con su origen

Mission Control y el CLI DEBEN mostrar, para cada rol y fase, el modelo que se usará
y de dónde sale (perfil, rol del proyecto, política del ejecutor). Una discrepancia
entre el modelo declarado y el que se usaría DEBE señalarse.

#### Scenario: Preset sin efecto
- **GIVEN** un rol fijado a mano que anula el perfil elegido
- **WHEN** se abre la vista de modelos
- **THEN** la vista dice que el rol anula el perfil

### Requirement: R-PERF-006 — El modelo realmente usado DEBE quedar registrado por fase

Cada ejecución DEBE registrar, por fase, el modelo y el ejecutor con que corrió, y el
parte DEBE compararlo con el declarado por el perfil. El costo que el cliente no
reporte DEBE decir «sin reportar».

#### Scenario: Modelo distinto al declarado
- **GIVEN** una fase que corrió con un modelo distinto al del perfil
- **WHEN** se cierra la ejecución
- **THEN** el registro y el parte lo señalan

### Requirement: R-PERF-007 — Una sesión interactiva DEBERÍA delegar cada fase a un subagente con el modelo del perfil

Cuando la persona abre una sesión y pide ejecutar un ticket, el harness DEBERÍA
proveer a la sesión el modelo de cada fase para que la orqueste con subagentes de
ese modelo, cuando el cliente lo admita. Si el cliente no lo admite, DEBE decirlo y
la sesión sigue con el modelo con que se abrió. Esto NO DEBE cambiar el modelo de la
sesión que la persona abrió.

#### Scenario: Cliente con subagentes
- **GIVEN** una sesión de Claude Code abierta con Sonnet y un perfil que asigna el plan a Opus
- **WHEN** se pide ejecutar un ticket
- **THEN** la fase de plan la ejecuta un subagente con el modelo de Opus y la sesión recibe el resultado

#### Scenario: Cliente sin subagentes
- **GIVEN** un cliente que no admite subagentes con modelo propio
- **WHEN** se pide ejecutar un ticket
- **THEN** el harness avisa que las fases usan el modelo de la sesión
