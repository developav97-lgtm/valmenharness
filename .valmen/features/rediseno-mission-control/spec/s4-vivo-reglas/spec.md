# s4 — En vivo y Reglas: Agentes, Procesos y Estándares

Dominio del cliente de Mission Control. En Agentes cambia solo el marco: el
motor de escena y los mundos (`packages/server/web/agentes/`) se conservan.
Bocetos: `assets/agentes.html`, `assets/procesos.html`,
`assets/estandares.html` y sus capturas `.png`.

### Requirement: R-VIVO-001 — Agentes DEBE titular cuántos agentes trabajan y poner una pregunta pendiente arriba de la escena

Boceto aprobado: `assets/agentes.html` (captura `assets/agentes.png`).

El título dice cuántos agentes trabajan y cuántos preguntan algo. Una pregunta
pendiente aparece como aviso ámbar sobre la escena con el ticket, la fase, el
texto de la pregunta cuando el servidor lo entrega y la acción «Responder en la
sesión». A la derecha del título, el control «A la vez» con la cuenta viva sobre
la deseada.

#### Scenario: Un agente pregunta
- **GIVEN** dos agentes vivos y uno con pregunta pendiente
- **WHEN** se abre Agentes
- **THEN** el título dice «2 agentes trabajando, 1 te pregunta algo» y el aviso ámbar nombra su ticket

### Requirement: R-VIVO-002 — Agentes DEBE enmarcar la escena con el selector de mundo y listar debajo quién trabaja

Boceto aprobado: `assets/agentes.html` (captura `assets/agentes.png`).

La escena va en un panel con el selector de mundo como pestañas (Sala de
control, Pastelería, Invernadero) y la sesión principal identificada. Debajo,
una tabla: sesión principal y cada subagente con su ticket, fase, modelo y
tiempo. El mundo elegido se sigue recordando en el navegador.

#### Scenario: Cambiar de mundo
- **GIVEN** la escena en «Sala de control»
- **WHEN** se elige «Pastelería»
- **THEN** la escena cambia de mundo sin recargar y la tabla no cambia

### Requirement: R-VIVO-003 — Procesos DEBE poner primero las corridas detenidas que esperan a una persona

Boceto aprobado: `assets/procesos.html` (captura `assets/procesos.png`).

Un bloque ámbar por corrida detenida con sus pasos (hechos, el actual, los que
faltan), el campo para la aprobación con las palabras de la persona y las
acciones de aprobar y ver el dry-run. Debajo, cada proceso declarado como
tarjeta con sus pasos —los que aprueba una persona en ámbar—, lo que pide y
«Ejecutar». La aprobación sigue exigiendo la frase literal.

#### Scenario: Despliegue esperando aprobación
- **GIVEN** una corrida de `deploy` detenida en `gate-deploy`
- **WHEN** se abre Procesos
- **THEN** el primer bloque la muestra con «Aprobación humana del despliegue» como paso actual y el botón de aprobar no avanza sin frase

### Requirement: R-VIVO-004 — Estándares DEBE separar en vigor, propuestos y descartados, y abrir cada uno con su regla, su motivo y la frase con que se aceptó

Boceto aprobado: `assets/estandares.html` (captura `assets/estandares.png`).

Pestañas con cuenta. Cada estándar es una fila plegable con su id, título y
fecha; al abrirla muestra la regla, el porqué y, en ámbar, la frase literal de
la persona que lo decidió.

#### Scenario: Abrir un estándar
- **GIVEN** EST-011 en vigor
- **WHEN** se pulsa su fila
- **THEN** se despliegan la regla, el porqué y la cita de la decisión, y la fila marca `aria-expanded="true"`
