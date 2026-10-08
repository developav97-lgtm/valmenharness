# s2 — Vista «Agentes»: renombrado, motor de escena, selector y aviso

Dominio del cliente de Mission Control (`packages/server/web/`). El motor es la
capa común a los tres mundos; se prueba sin dibujar. Prototipo de referencia:
`assets/vista-agentes.html`.

### Requirement: R-ESC-001 — La vista DEBE llamarse «Agentes» y conservar las rutas viejas

El menú lateral, el título y la ruta pasan a «Agentes» (`#/agentes`). Las rutas
`#/corrida` y `#/jornadas` siguen funcionando y llevan a la misma vista. El
proceso se sigue llamando «ejecución» en los textos y en el código.

#### Scenario: Ruta vieja
- **GIVEN** un enlace guardado a `#/corrida`
- **WHEN** se abre en Mission Control
- **THEN** se muestra la vista «Agentes» y el menú la marca como activa

### Requirement: R-ESC-002 — El motor DEBE ubicar a cada agente en una de ocho estaciones según el estado de su ticket

Las estaciones son los ocho estados del flujo, en orden: `intake`, `analyzed`,
`planned`, `approved`, `in_progress`, `awaiting_user_tests`, `in_qa`, `closed`.
La estación de un agente sale de `ticketEstado`; `blocked` y
`changes_requested` se ubican en la última estación válida que el ticket
alcanzó, marcada como desvío. El rótulo de lo que hace ahora sale de
`faseConfirmada`, si no de `faseInferida`, si no de `ultimaHerramienta`.

#### Scenario: Ticket en implementación
- **GIVEN** una fila con `ticketEstado: "in_progress"` y `faseConfirmada: "implementando"`
- **WHEN** el motor calcula la estación
- **THEN** es la quinta (`in_progress`) y el rótulo es «implementando»

#### Scenario: Ticket bloqueado tras el plan
- **GIVEN** una fila con `ticketEstado: "blocked"` cuyo último estado válido fue `planned`
- **WHEN** el motor calcula la estación
- **THEN** es la tercera (`planned`) con la marca de desvío

### Requirement: R-ESC-003 — El motor DEBE desplazar al agente entre estaciones con una posición objetivo y una velocidad constante

Cada refresco entrega una lista de filas; el motor conserva el estado visual de
cada agente por su identificador, calcula la posición objetivo que define el
mundo para su estación y lo mueve hacia ella a velocidad constante en píxeles
por segundo. Un agente nuevo aparece en el puesto de la sesión principal y
camina hasta su estación; uno que terminó vuelve al puesto y desaparece pasados
cinco segundos.

#### Scenario: Cambio de estación entre dos refrescos
- **GIVEN** un agente en la estación `planned`
- **WHEN** el siguiente refresco lo trae en `in_progress`
- **THEN** su posición avanza cuadro a cuadro hacia la nueva estación sin saltar, y `moviendo` es verdadero hasta llegar

#### Scenario: Refresco sin cambios
- **GIVEN** la misma lista en dos refrescos seguidos
- **WHEN** el motor la recibe
- **THEN** ningún agente cambia de posición objetivo ni se reinicia la escena

### Requirement: R-ESC-004 — El motor DEBE distinguir cuatro estados visuales

`trabajando`, `esperando`, `termino` y `principal`. El mundo los representa con
su propio lenguaje, pero el motor los expone con esos nombres y la leyenda bajo
el lienzo los nombra igual en los tres mundos.

#### Scenario: Agente esperando a una persona
- **GIVEN** una fila con `estado: "esperando"` y `pregunta.desde` presente
- **WHEN** el motor la procesa
- **THEN** el estado visual es `esperando` y el agente no se mueve de su estación

### Requirement: R-ESC-005 — La vista DEBE recordar el mundo elegido solo en el navegador

Un selector con los tres mundos; la elección se guarda en `localStorage` como
hoy se guarda «simultáneos», sin ninguna llamada de escritura al servidor. Sin
elección previa se muestra la pastelería. Cada opción del selector lleva una
miniatura dibujada por el mismo código del mundo con los datos actuales.

#### Scenario: Elección recordada
- **GIVEN** un navegador donde se eligió «Centro de control»
- **WHEN** se vuelve a abrir la vista
- **THEN** se muestra el centro de control sin pasar por el selector

#### Scenario: Almacenamiento no disponible
- **GIVEN** un navegador que lanza al leer `localStorage`
- **WHEN** se abre la vista
- **THEN** se muestra la pastelería y la vista funciona

### Requirement: R-ESC-006 — La escena NO DEBE reiniciarse en cada refresco de datos

El refresco periódico que ya existe (`programarRefrescoDeCorrida`) vuelve a
pintar la vista; el motor conserva posiciones, cuadro de animación y mundo
elegido, y solo reemplaza las filas. Una pestaña oculta no consulta ni anima.

#### Scenario: Diez refrescos seguidos
- **GIVEN** la vista abierta con tres agentes caminando
- **WHEN** pasan diez refrescos sin cambios en el registro
- **THEN** los agentes siguen donde iban, sin volver a empezar desde el puesto principal

### Requirement: R-ESC-007 — El aviso de pregunta pendiente DEBE decir a quién le toca y desde cuándo

Sobre el lienzo, un aviso por pregunta abierta con el nombre de quien debe
responder (el responsable del ticket, si el registro lo tiene; si no, «una
persona»), el ticket, el tiempo transcurrido y la expresión propia del mundo
(«timbre en el mostrador», «línea 1 abierta», «la regadera espera»). Cuando
`pregunta.respondidaEn` llega, el aviso cambia a «respondió» durante un minuto.
Con la opción B habilitada (R-DAT-004), el aviso muestra además el texto de la
pregunta y de la respuesta.

#### Scenario: Pregunta abierta hace cuarenta segundos
- **GIVEN** una fila con `pregunta.desde` hace 40 segundos y ticket con responsable «Anita»
- **WHEN** se pinta la vista
- **THEN** el aviso dice «Pregunta pendiente para Anita», el ticket y «hace 40 s»

#### Scenario: Pregunta respondida
- **GIVEN** la misma fila con `pregunta.respondidaEn` hace 10 segundos
- **WHEN** se pinta la vista
- **THEN** el aviso dice que Anita respondió y el agente vuelve a verse trabajando

### Requirement: R-ESC-008 — Los paneles bajo el lienzo DEBEN mostrar la misma información que la tabla actual

Dos paneles: agentes (nombre, ticket, fase, última herramienta, con la sesión
principal primero) y cola con entregados (ticket y estado). Los datos son los
mismos que hoy muestran «Agentes vivos», «Cola» y «Entregados»; el mundo solo
cambia el título y el estilo.

#### Scenario: Paneles con la cola de la jornada
- **GIVEN** una jornada con dos tickets en cola y uno entregado
- **WHEN** se pinta la vista
- **THEN** el panel de cola lista los dos en cola con su ola y el entregado con su estado del registro

### Requirement: R-ESC-009 — El motor DEBE tener tests deterministas sin lienzo

Estación por estado, posición objetivo por mundo, desplazamiento por cuadro,
estados visuales y aviso de pregunta se prueban con `vitest` sobre funciones
puras, con reloj inyectado y sin `document`.

#### Scenario: Suite del motor
- **GIVEN** la suite del motor
- **WHEN** se corre `npx vitest run`
- **THEN** pasa sin abrir un navegador

### Requirement: R-ESC-010 — La vista DEBE funcionar en celular e iPad y respetar `prefers-reduced-motion`

El lienzo escala al ancho disponible sin desplazamiento horizontal; los paneles
se apilan en una columna por debajo de 700 píxeles; con
`prefers-reduced-motion` la animación baja a cuatro cuadros por segundo.

#### Scenario: Ancho de celular
- **GIVEN** un viewport de 390 píxeles
- **WHEN** se abre la vista
- **THEN** el lienzo ocupa el ancho, los paneles van uno debajo del otro y no hay desplazamiento horizontal

### Requirement: R-ESC-011 — El marco DEBE usar los tokens del tema y cada mundo su paleta marcada

Cabecera, selector, avisos y leyenda usan las variables del tema de
`index.html` y se ven bien en claro y oscuro. Los colores de cada mundo (lienzo
y paneles) se marcan con `valmen:allow-color` y su motivo, y
`revisar_presentacion` no reporta otros colores a mano.

#### Scenario: Revisión de presentación
- **GIVEN** la implementación terminada
- **WHEN** se corre `revisar_presentacion`
- **THEN** los únicos colores a mano reportados llevan `valmen:allow-color` con el nombre del mundo
