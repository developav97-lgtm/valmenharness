# s1 — Marco: tema, menú por grupos, «Pedir un cambio» e Inicio

Dominio del cliente de Mission Control (`packages/server/web/index.html`). Es la
base de las demás pantallas: se construye primero. Bocetos de referencia:
`assets/menu.html`, `assets/menu-antes-despues.html`, `assets/inicio.html` y sus
capturas `assets/menu.png`, `assets/menu-antes-despues.png`, `assets/inicio.png`.

### Requirement: R-MARCO-001 — La interfaz DEBE usar el tema «sala de control» definido como tokens

Boceto aprobado: `assets/menu.html` (captura `assets/menu.png`) · `assets/inicio.html` (captura `assets/inicio.png`).

Colores, tipografías y fondo salen de variables CSS en `:root`: fondo
`#0a1114` con cuadrícula de 40 px, superficies `#122027`/`#172a32`, líneas
`#24383f`; acentos con significado fijo —ámbar `#f2b43f` decide una persona,
cian `#4cc8e6` decide el código, lila `#ad9ff4` trabaja un modelo, verde
`#62d69e` hecho, rojo `#f36a5d` negado—; tipografías Chakra Petch (títulos), IBM
Plex Sans (texto) e IBM Plex Mono (identificadores y rótulos). El modo claro
redefine los mismos tokens, como la presentación de referencia.

#### Scenario: Modo oscuro
- **GIVEN** el sistema operativo en modo oscuro
- **WHEN** se abre cualquier pantalla
- **THEN** se ve como su boceto y `revisar_presentacion` no avisa de colores a mano

#### Scenario: Modo claro
- **GIVEN** el sistema operativo en modo claro
- **WHEN** se abre cualquier pantalla
- **THEN** cada token toma su valor claro y los textos cumplen contraste AA

### Requirement: R-MARCO-002 — El menú lateral DEBE agrupar las vistas en Hoy, Trabajo, En vivo, Reglas y Ajustes

Boceto aprobado: `assets/menu.html` (captura `assets/menu.png`) · `assets/menu-antes-despues.html` (captura `assets/menu-antes-despues.png`).

Hoy: Inicio (con la cuenta de lo que espera una decisión). Trabajo: Tickets,
Features, Portafolio. En vivo: Agentes (con la cuenta de agentes vivos),
Procesos. Reglas: Estándares. Ajustes: Modelos, Proveedores, Proyecto. Ningún
rótulo se repite ni se parece a otro. Tal como `assets/menu.html`.

#### Scenario: Menú completo
- **GIVEN** cualquier proyecto abierto
- **WHEN** se mira el menú
- **THEN** aparecen los cinco grupos con esas entradas, en ese orden, y no existe ninguna entrada «Configurar» ni «Configuración»

### Requirement: R-MARCO-003 — El menú DEBE mostrar arriba el proyecto activo y debajo su perfil de modelos

Boceto aprobado: `assets/menu.html` (captura `assets/menu.png`).

El selector de proyecto pasa del pie a la cabecera del menú. Debajo, una línea
lila con el perfil elegido para el proyecto (de `GET /api/perfiles`) que lleva a
Ajustes › Modelos. Sin perfil elegido dice «sin perfil».

#### Scenario: Perfil visible en todas las pantallas
- **GIVEN** el proyecto con el perfil `claude-code-completo` elegido
- **WHEN** se abre cualquier pantalla
- **THEN** el menú muestra «Perfil claude-code-completo» y al pulsarlo abre Modelos

### Requirement: R-MARCO-004 — El chat de configuración DEBE abrirse como la acción «Pedir un cambio» desde cualquier pantalla

Boceto aprobado: `assets/menu.html` (captura `assets/menu.png`) · `assets/menu-antes-despues.html` (captura `assets/menu-antes-despues.png`).

Lo que hoy es la vista «Configurar» (`vistaConfigurar`, `/api/chat/config`) se
abre como panel desde un botón al pie del menú y con ⌘K (Ctrl+K en otros
sistemas). Lo que propone y aplica sigue igual. `#/configurar` abre el panel y
`#/configuracion` lleva a Ajustes › Proyecto.

#### Scenario: Atajo
- **GIVEN** la pantalla Tickets abierta y sin campo en foco
- **WHEN** se pulsa ⌘K
- **THEN** se abre el panel «Pedir un cambio» con el foco en su campo de texto, y Esc lo cierra

#### Scenario: Rutas viejas
- **GIVEN** un enlace guardado a `#/configuracion`
- **WHEN** se abre
- **THEN** se muestra Ajustes › Proyecto y el menú marca «Proyecto»

### Requirement: R-MARCO-005 — Mission Control DEBE abrir en Inicio con lo que espera una decisión de la persona

Boceto aprobado: `assets/inicio.html` (captura `assets/inicio.png`).

Inicio (`#/inicio`, ruta por defecto) lista primero, como tarjetas con su acción,
lo que espera a la persona: tickets con decisiones del agente por ratificar,
tickets en `awaiting_user_tests` y compuertas en REVIEW. Al lado, «Ahora mismo»
(agentes vivos con su fase y modelo) y «Hecho hoy». Arriba, cuatro cifras: esperan
tu decisión, agentes trabajando, tickets en intake y cerrados del año. Tal como
`assets/inicio.html`.

#### Scenario: Hay decisiones pendientes
- **GIVEN** un ticket en `awaiting_user_tests` y otro con decisiones del agente sin ratificar
- **WHEN** se abre Inicio
- **THEN** el título dice cuántas cosas esperan, cada una es una tarjeta con su id y su botón principal en ámbar, y el menú muestra la misma cuenta en Inicio

#### Scenario: Nada pendiente
- **GIVEN** ningún ticket esperando a la persona
- **WHEN** se abre Inicio
- **THEN** dice que no hay nada parado por ella y muestra solo «Ahora mismo» y «Hecho hoy»

### Requirement: R-MARCO-006 — Cada pantalla DEBERÍA funcionar en el celular

A menos de 768 px el menú se apila sobre el contenido, las barras de acciones se
envuelven y las tablas anchas se desplazan dentro de su caja, sin desplazamiento
horizontal de la página.

#### Scenario: Ancho de celular
- **GIVEN** una ventana de 390 px
- **WHEN** se abre Tickets
- **THEN** no hay scroll horizontal de la página y la tabla se desplaza en su propia caja
