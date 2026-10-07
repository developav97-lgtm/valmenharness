# Aprobación autónoma de planes y análisis

Pedido del PO (2026-10-07): que un ticket cuyas compuertas aprobaron pueda avanzar
solo, que un agente revisor decida los `review`, y que la persona intervenga solo
en lo que de verdad lo necesita. La autoridad se declara una vez y la ejerce el código.

### Requirement: R-APRO-001 — La aprobación automática DEBE requerir una autorización persistida creada por una persona

Una autorización de aprobación DEBE declarar tipos de ticket, módulos, riesgo
máximo, impactos admitidos, cupo diario, vigencia, la etapa que cubre (análisis,
plan o ambas), el modo (automática en `approve` o con agente revisor) y la frase
literal de quien autoriza. Solo DEBE poder crearse o ampliarse por un canal que el
agente no controla. NO DEBE existir herramienta MCP que la cree o la amplíe. DEBE
poder revocarse, y la revocación vale desde ese momento.

#### Scenario: Intento desde el agente
- **GIVEN** una sesión de agente con acceso a las herramientas MCP
- **WHEN** intenta crear o ampliar una autorización de aprobación
- **THEN** no hay herramienta para hacerlo y el CLI la rechaza en una ejecución desatendida

### Requirement: R-APRO-002 — Con la compuerta en approve, el ticket elegible DEBE aprobarse solo

Si el último recibo vigente de `analysis` o `plan` es `approve` y una autorización
vigente cubre el tipo, el módulo, el riesgo y los impactos del ticket y le queda
cupo, el motor DEBE registrar la aprobación atribuida a la autorización (id y hash),
con el hash del plan, y DEBE permitir el avance. Sin autorización, el comportamiento
de R-CTRL-001 NO DEBE cambiar.

#### Scenario: Compuertas aprobadas
- **GIVEN** un BUGFIX de riesgo normal con análisis y plan en `approve` y una autorización vigente
- **WHEN** se evalúa el avance a `approved`
- **THEN** el ticket avanza y el evento nombra la autorización, no a una persona ni al agente

#### Scenario: Plan cambiado después
- **GIVEN** un plan aprobado por la autorización y luego editado
- **WHEN** se intenta avanzar
- **THEN** la aprobación deja de valer porque el hash no coincide

### Requirement: R-APRO-003 — Un agente revisor DEBERÍA decidir los review cuando la autorización lo declara

Con el modo de agente revisor, un recibo en `review` DEBE pasar a un agente
revisor con un rol propio, un modelo distinto al que produjo el artefacto y la
lista de proposiciones que quedaron en banda media. El revisor DEBE devolver
aprobar o rechazar con su razonamiento, y ese resultado DEBE guardarse como
decisión del revisor, con su modelo, y NO como decisión de una persona.

#### Scenario: Revisión aprobada por el revisor
- **GIVEN** un plan en `review` y una autorización con agente revisor
- **WHEN** el revisor aprueba
- **THEN** el recibo y el ticket dicen «aprobado por el agente de revisión» con su modelo y su razón

#### Scenario: Revisor igual al productor
- **GIVEN** que el modelo configurado para el revisor es el mismo que produjo el plan
- **WHEN** se pide la revisión
- **THEN** el motor la rechaza y pide otro modelo

### Requirement: R-APRO-004 — Un block NO DEBE aprobarse sin una persona

Un recibo en `block`, el bloqueo de `qa-mechanical` y todo ticket SECURITY NO DEBEN
aprobarse por autorización ni por revisor: DEBEN quedar para una persona con su frase.

#### Scenario: Bloqueo
- **GIVEN** un plan en `block` y una autorización vigente
- **WHEN** se evalúa el avance
- **THEN** el motor no aprueba y pide la decisión de una persona

### Requirement: R-APRO-005 — Los tipos y los impactos admitidos DEBEN ser los que la persona declaró

La autorización PUEDE incluir los tipos SYNC, INTEGRATION y AGENT. Un ticket con
impacto de migración, contenedores o despliegue NO DEBE aprobarse automáticamente
salvo que la autorización lo incluya de forma explícita. La aprobación de un
despliegue a producción NO DEBE automatizarse bajo ninguna autorización.

#### Scenario: Tipo no declarado
- **GIVEN** una autorización que cubre BUGFIX y un ticket INTEGRATION
- **WHEN** se evalúa el avance
- **THEN** el motor pide la aprobación de una persona

### Requirement: R-APRO-006 — La jornada DEBE poder aprobar los planes al armarse

La jornada DEBE usar la autorización para aprobar sus planes elegibles al preparar
el día, y DEBE dejar para una persona los que no lo sean, con el aviso de la
decisión pendiente en formato de opciones y efecto. La ejecución DEBE empezar el día
siguiente con los planes ya aprobados.

#### Scenario: Cinco tickets programados de noche
- **GIVEN** cinco tickets en una jornada y una autorización que cubre cuatro
- **WHEN** termina la preparación
- **THEN** cuatro quedan aprobados por la autorización y uno espera a una persona con su aviso

### Requirement: R-APRO-007 — Toda aprobación automática DEBE ser visible y reversible

Cada aprobación automática DEBE listarse con su autorización, su recibo y el modo.
El parte diario DEBE contarlas aparte de las humanas, y volver al modo manual DEBE
ser un cambio de configuración o la revocación de la autorización.

#### Scenario: Revocación
- **GIVEN** una autorización vigente que ya aprobó planes
- **WHEN** una persona la revoca
- **THEN** ningún plan posterior se aprueba con ella y los ya aprobados siguen registrados con su atribución
