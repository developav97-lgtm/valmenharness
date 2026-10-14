# s2 — Ajustes: Modelos, Cambiar de perfil, Proveedores y Proyecto

Dominio del cliente de Mission Control. Reemplaza `vistaModelos`,
`vistaProveedores` y `vistaConfiguracion` (que pasa a llamarse Proyecto).
Bocetos: `assets/modelos.html`, `assets/modelos-cambiar-perfil.html`,
`assets/proveedores.html`, `assets/proyecto.html` y sus capturas `.png`.

### Requirement: R-AJU-001 — Modelos DEBE abrir con el perfil activo como primer bloque

Boceto aprobado: `assets/modelos.html` (captura `assets/modelos.png`).

Una tarjeta lila con el nombre del perfil, su id, su descripción, dónde está
elegido (proyecto, ejecutor) y dos acciones: «Cambiar de perfil» y «Duplicar y
editar». Debajo, la regla de precedencia en una línea: «cambiado aquí» gana a
«del perfil», que gana a «preset base». Datos de `GET /api/perfiles` y
`GET /api/modelos/fases`.

#### Scenario: Perfil elegido
- **GIVEN** `claude-code-completo` elegido para el proyecto y para claude
- **WHEN** se abre Modelos
- **THEN** la primera tarjeta lo nombra con las dos marcas «elegido para el proyecto» y «elegido para Claude Code»

### Requirement: R-AJU-002 — Modelos DEBE agrupar los roles en El agente, Coordinación y Compuertas y revisión, con el origen de cada modelo

Boceto aprobado: `assets/modelos.html` (captura `assets/modelos.png`).

El agente: las cuatro fases (análisis, plan, implementación, verificación) como
tarjetas con modelo, esfuerzo y origen. Coordinación: orquestador, arquitecto y
especificación de UI. Compuertas y revisión: evaluador, verificador, juez,
productor, revisor y escalada, con su proveedor. Una fase cambiada en el
proyecto se marca en ámbar «cambiado aquí», dice qué modelo daría el perfil y
ofrece «Volver al perfil»; las demás dicen «del perfil» en lila. El preset y el
YAML quedan en «Avanzado», plegado.

#### Scenario: Fase cambiada en el proyecto
- **GIVEN** implementación definida en el proyecto con un modelo distinto del perfil
- **WHEN** se abre Modelos
- **THEN** su tarjeta tiene borde ámbar, la marca «cambiado aquí», el modelo que daría el perfil y la acción «Volver al perfil»

#### Scenario: Volver al perfil
- **GIVEN** esa fase cambiada
- **WHEN** se pulsa «Volver al perfil» y se confirman las diferencias del archivo
- **THEN** la definición del proyecto para esa fase desaparece y la tarjeta pasa a «del perfil»

### Requirement: R-AJU-003 — Modelos DEBE avisar cuando el perfil no se aplica por falta de cliente declarado, con la corrección en el mismo aviso

Boceto aprobado: `assets/modelos.html` (captura `assets/modelos.png`).

Cuando `GET /api/modelos/fases` informa que no hay cliente declarado, un aviso
ámbar bajo el perfil lo dice en una frase y ofrece elegir el cliente y
declararlo ahí mismo.

#### Scenario: Sin cliente declarado
- **GIVEN** fases sin cliente declarado
- **WHEN** se abre Modelos
- **THEN** aparece el aviso «Las fases del agente usan el modelo de la sesión» con el selector de cliente y el botón «Declarar»

### Requirement: R-AJU-004 — Cambiar de perfil DEBE mostrar qué cambia antes de aplicarlo

Boceto aprobado: `assets/modelos-cambiar-perfil.html` (captura `assets/modelos-cambiar-perfil.png`).

Una pantalla (`#/modelos/perfil`) con una tarjeta por perfil —la activa
marcada—, la tarjeta «Nuevo perfil a partir del seleccionado», y al elegir otro,
la tabla «Ahora → Después» solo con los trabajos que cambian, la nota de los que
no cambian, el aviso de las fases cambiadas en el proyecto que se conservan, y
dónde se aplica (todo el proyecto, recomendado; o solo con un cliente). Aplicar
usa `PUT /api/perfiles/seleccion`.

#### Scenario: Elegir Codex
- **GIVEN** el perfil activo `claude-code-completo`
- **WHEN** se elige `codex-completo`
- **THEN** la tabla lista las siete filas del agente y coordinación con su modelo actual tachado y el nuevo, y el botón dice «Aplicar codex-completo»

#### Scenario: Elegir el activo
- **GIVEN** el perfil activo seleccionado
- **WHEN** se mira la pantalla
- **THEN** no hay tabla ni botón de aplicar: dice que ya es el perfil activo

### Requirement: R-AJU-005 — Proveedores DEBE distinguir configurado, detectado y sin configurar, y decir si el perfil activo lo usa

Boceto aprobado: `assets/proveedores.html` (captura `assets/proveedores.png`).

Una tarjeta por proveedor con su estado (configurado: clave guardada aquí;
detectado: la CLI ya tenía sesión; sin configurar), su id, cuántos trabajos del
perfil activo dependen de él y las acciones «Probar conexión» y «Configurar» o
«Reemplazar clave». La clave nunca se muestra. Una leyenda arriba explica los
tres estados.

#### Scenario: Proveedor del perfil
- **GIVEN** el perfil activo con siete trabajos en `claude-code`
- **WHEN** se abre Proveedores
- **THEN** la tarjeta de Claude Code dice «lo usa el perfil» y «7 del perfil activo»

### Requirement: R-AJU-006 — Proyecto DEBE presentar la configuración como bloques con interruptores y dejar el YAML en «Avanzado»

Boceto aprobado: `assets/proyecto.html` (captura `assets/proyecto.png`).

Bloques: «Quién aprueba el análisis y el plan» (aprobación por defecto, con lo
que decide el agente, lo que ratifica la persona y lo que siempre es suyo),
«QA por agente», «Avisos» y «Pruebas» (comandos permitidos y tiempo máximo). El
editor de `config.yaml` con sus diferencias antes de guardar queda plegado en
«Avanzado». Crear o revocar una autorización sigue pidiendo actor y frase
literal, como hoy (`/api/approval/authorizations`, `/api/qa/authorizations`).

#### Scenario: Apagar la aprobación por defecto
- **GIVEN** la aprobación por defecto vigente
- **WHEN** se pulsa su interruptor
- **THEN** se pide el actor y la frase literal antes de revocarla, y sin ellos no cambia nada

#### Scenario: Cambiar el tiempo máximo de pruebas
- **GIVEN** `test-timeout: 420`
- **WHEN** se escribe 600 y se guarda
- **THEN** se muestran las diferencias del archivo antes de escribirlo
