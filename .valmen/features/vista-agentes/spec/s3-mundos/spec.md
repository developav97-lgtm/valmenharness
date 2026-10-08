# s3 — Los tres mundos

Dominio de las escenas. Cada mundo es un módulo sobre el motor de s2 y **se
construye y se valida contra `assets/vista-agentes.html`**, el prototipo que el
PO aprobó el 2026-10-08: la disposición, los muebles, los personajes, la
tipografía y los paneles son los del prototipo, con los datos reales en lugar de
la simulación. La línea de metro del segundo boceto quedó descartada.

### Requirement: R-MUN-001 — Cada mundo DEBE implementar la misma interfaz sobre el motor

Un mundo declara su nombre y su lema, los ocho nombres de estación en su
lenguaje, la expresión de la pregunta pendiente, la posición objetivo por
estación y por puesto principal, y una función de dibujo que recibe el estado
del motor y el tiempo. El motor no conoce ningún mundo por su nombre: agregar
un cuarto mundo no toca el motor.

#### Scenario: Mundo nuevo
- **GIVEN** un módulo que cumple la interfaz
- **WHEN** se registra en la lista de mundos
- **THEN** aparece en el selector con su miniatura y recibe los mismos datos que los demás sin cambios en el motor

### Requirement: R-MUN-002 — Cada mundo DEBE dar un puesto propio a la sesión principal

La sesión principal se dibuja en su puesto (el pase de la pastelería, la
dirección del centro de control, el semillero del invernadero), con insignia
dorada, y la cola de la jornada se muestra junto a ese puesto como corresponde al
mundo (comandas, misiones en espera, sobres de semillas).

#### Scenario: Corrida con cola
- **GIVEN** la sesión principal viva y dos tickets en cola
- **WHEN** se dibuja cualquiera de los tres mundos
- **THEN** la sesión principal está en su puesto y los dos tickets se ven junto a él

### Requirement: R-MUN-003 — Cada mundo DEBE representar los cuatro estados visuales y la pregunta pendiente con su propio lenguaje

`trabajando`, `esperando`, `termino` y `principal` se ven distintos en la
escena; la pregunta pendiente tiene una señal propia en la estación que decide
una persona (`approved`, `awaiting_user_tests`) y el personaje muestra un «?»;
la respuesta reciente se representa también (Anita en la ventanilla, «Anita en
línea», gotas de la regadera).

#### Scenario: Pregunta abierta en aprobación
- **GIVEN** un agente `esperando` con `pregunta.desde` en la estación `approved`
- **WHEN** se dibuja el mundo
- **THEN** la señal del mundo está encendida (lámpara ámbar, teléfono rojo parpadeando, regadera flotando) y el personaje lleva «?»

### Requirement: R-MUN-004 — La pastelería DEBE ser el obrador del prototipo

Vista lateral: pared crema con estante de frascos, ventana y letrero «LA
COMANDA»; mostrador corrido con ocho puestos (corcho de pedidos, recetario,
báscula con pizarra, ventanilla de Anita con cortinas y lámpara, horno con
brillo y vapor cuando se trabaja, mesa de degustación con silla, lupa con
lámpara, vitrina con los entregados); el pase a la izquierda. Pasteleros con
toque y delantal blanco que caminan por detrás del mostrador; la sesión
principal con delantal oscuro. El pastel crece por estación: bol, masa, molde,
molde con nota, horneado, glaseado, decorado con vela, caja con cinta. Paneles
«Comandas» y «Vitrina» como pizarra verde con marco de madera y tipografía
Fraunces.

#### Scenario: Ticket que avanza de implementación a pruebas
- **GIVEN** un agente en el horno con el pastel horneado
- **WHEN** el refresco lo trae en `awaiting_user_tests`
- **THEN** el pastelero camina hasta la mesa de degustación llevando el pastel y allí se ve glaseado

### Requirement: R-MUN-005 — El centro de control DEBE ser la sala del prototipo

Sala oscura con suelo en perspectiva; ocho pantallas en la pared con el nombre
de la estación, el identificador del estado y «REQUIERE PERSONA» en las dos
humanas, y dentro de cada pantalla los tickets que están en esa etapa con su
barra de avance; una pista bajo las pantallas por donde viaja un punto por
ticket, con un haz hasta la consola de su operador; una franja con «TURNO DE
NOCHE · n misiones activas» que en pregunta pendiente se vuelve roja y parpadea
con «ESPERANDO A …»; la dirección en una tarima con teléfono rojo; una consola
por agente con monitor del color del agente, ámbar en espera y azul al cerrar,
operador con auriculares de espaldas y manos que teclean. Paneles «Telemetría»
y «Misiones» en Chakra Petch sobre fondo oscuro.

#### Scenario: Pregunta pendiente en la sala
- **GIVEN** un agente `esperando` con pregunta abierta
- **WHEN** se dibuja el centro de control
- **THEN** la franja es roja y parpadea, el teléfono rojo parpadea y el monitor de ese operador es ámbar con «ESPERA»

### Requirement: R-MUN-006 — El invernadero DEBE ser el cultivo del prototipo

Vidrio con sol, estante de macetas, caseta «SEMILLERO» con los sobres de la
cola, camino de grava y ocho canteros con letrero; la planta crece por estación:
semilla con etiqueta, brote, hojas, capullo, tallo alto, flor, fruto, cesta
cosechada; en los canteros humanos cuelga una regadera que flota con «?» mientras
espera y suelta gotas al responder; cajón «COSECHA» con los entregados.
Jardineros con sombrero de paja y peto que caminan por el camino y se arrodillan
a trabajar; la sesión principal con sombrero verde. Paneles «Bitácora de
cultivo» y «Cosecha» como cuaderno rayado con títulos en Caveat.

#### Scenario: Respuesta de Anita en el riego
- **GIVEN** un agente en «Riego de Anita» cuya pregunta acaba de responderse
- **WHEN** se dibuja el invernadero
- **THEN** caen gotas sobre su cantero y el jardinero vuelve a trabajar

### Requirement: R-MUN-007 — Los personajes DEBEN ser los sprites del prototipo

Doce por dieciséis píxeles a escala tres, cuatro cuadros de marcha, balanceo
en reposo, pelo y piel variados por agente, camisa del color del agente,
sombrero por mundo (toque, auriculares, paja) y gafas para la dirección. La
sesión principal lleva insignia dorada en el pecho.

#### Scenario: Agente caminando
- **GIVEN** un agente con `moviendo` verdadero
- **WHEN** se dibujan cuatro cuadros seguidos
- **THEN** las piernas alternan los tres cuadros de marcha del prototipo

### Requirement: R-MUN-008 — Cada mundo DEBE pasar la validación visual contra el prototipo

La validación de UI de cada ticket de mundo compara la pantalla con el
prototipo en claro y oscuro, en escritorio y celular, con los mismos datos de
ejemplo, y deja la evidencia en el ticket. Lo que difiera del prototipo se
anota con su motivo o se corrige.

#### Scenario: Evidencia del mundo
- **GIVEN** la implementación del mundo terminada
- **WHEN** se corre la validación de UI del ticket
- **THEN** quedan las capturas en escritorio y celular, en claro y oscuro, junto a las del prototipo, y las diferencias con su motivo
