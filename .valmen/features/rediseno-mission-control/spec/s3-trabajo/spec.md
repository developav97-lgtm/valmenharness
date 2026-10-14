# s3 — Trabajo: Tickets, Detalle de ticket, Features y Portafolio

Dominio del cliente de Mission Control. Reemplaza el aspecto de `vistaTickets`,
`vistaTicket`, `vistaFeatures`/`vistaFeature` y `vistaPortafolio` sin perder lo
que hoy muestran. Bocetos: `assets/tickets.html`, `assets/ticket.html`,
`assets/features.html`, `assets/portafolio.html` y sus capturas `.png`.

### Requirement: R-TRA-001 — Tickets DEBE filtrar por a quién le toca y mostrar el avance de cada ticket en ocho pasos

Boceto aprobado: `assets/tickets.html` (captura `assets/tickets.png`).

Filtros como pestañas con su cuenta: Activos, Esperan por mí (en ámbar), Con el
agente y Cerrados; un buscador por id, título o módulo; el botón «Nuevo ticket».
Cada fila: título, id, una barra de ocho pasos (hechos en cian, el actual en
ámbar si es de la persona o en lila si es del agente, cerrados en verde), quién
lo tiene ahora, módulo y edad. La fila entera abre el detalle.

#### Scenario: Esperan por mí
- **GIVEN** un ticket en `awaiting_user_tests` y otro en `in_progress`
- **WHEN** se elige «Esperan por mí»
- **THEN** solo aparece el primero, con «Tú» en ámbar y su paso actual en ámbar

### Requirement: R-TRA-002 — El detalle de ticket DEBE mostrar el ciclo de ocho pasos y, si le toca a la persona, su tarea arriba de todo

Boceto aprobado: `assets/ticket.html` (captura `assets/ticket.png`).

Bajo el título y sus marcas (tipo, módulo, modo, estado), los ocho pasos con
quién decide cada uno y el actual resaltado. Si el ticket espera a la persona,
un bloque ámbar «Te toca» con la acción concreta: en `awaiting_user_tests`, el
contrato de pruebas con cada comando copiable y los botones «Pasaron las
pruebas», «Algo falló» y «Omitir con motivo». Debajo, pestañas: Resumen,
Análisis, Plan, Compuertas, Decisiones del agente, Evidencia, Consumo de IA.

#### Scenario: Ticket en pruebas del responsable
- **GIVEN** un ticket en `awaiting_user_tests` con tres comandos de prueba
- **WHEN** se abre su detalle
- **THEN** el paso 6 «Tus pruebas» está resaltado y el bloque «Te toca» lista los tres comandos con «copiar»

#### Scenario: Ticket con el agente
- **GIVEN** un ticket en `analyzed`
- **WHEN** se abre su detalle
- **THEN** no hay bloque «Te toca» y el paso actual se marca en lila

### Requirement: R-TRA-003 — Features DEBE listar las features con su estado y abrir su tablero con el recorrido y el siguiente paso

Boceto aprobado: `assets/features.html` (captura `assets/features.png`).

Tarjetas por feature con estado, título y slug; las completas se ocultan salvo
que se active «Mostrar completas». El tablero de la feature elegida muestra
tickets cerrados sobre el total, el recorrido (Brief, Spec, Diseño, Grafo,
Tickets, Verificación) con lo hecho y lo que falta, un aviso ámbar con el
siguiente paso y los tickets agrupados por sprint con su estado.

#### Scenario: Feature con todos los tickets cerrados y sin verificar
- **GIVEN** `vista-agentes` con 11 de 11 tickets cerrados y sin `verify.md`
- **WHEN** se abre su tablero
- **THEN** «Verificación» aparece como lo que falta y el aviso ofrece «Verificar la feature»

### Requirement: R-TRA-004 — Portafolio DEBE mostrar cada proyecto como una tarjeta con lo que espera decisión, agentes y consumo

Boceto aprobado: `assets/portafolio.html` (captura `assets/portafolio.png`).

Arriba, el total de proyectos disponibles, lo que espera decisión, los agentes
trabajando y el consumo del rango, con un selector de rango. Una tarjeta por
proyecto con su disponibilidad (máquina, registro local), su perfil, sus tres
cifras y la acción para abrirlo. Sigue siendo de solo lectura.

#### Scenario: Proyecto no disponible
- **GIVEN** un proyecto cuya máquina no responde
- **WHEN** se abre Portafolio
- **THEN** su tarjeta marca la fuente no disponible con el motivo y los totales dicen que son parciales
