# S3 — Control en el código

Lo que hoy depende de un texto en el ticket o de una regla escrita en AGENTS.md
pasa a exigirlo el motor. Es lo que hace auditable el registro, y va antes de
cualquier autonomía nueva.

### Requirement: R-CTRL-001 — La transición a approved DEBE exigir una aprobación del plan registrada con actor y fuente

Mover un ticket a `approved` DEBE exigir una aprobación registrada como evento
del ticket con actor, fuente, frase literal y el hash del plan aprobado. Una
frase escrita en `## Plan` NO DEBE bastar. Si el plan cambia después de la
aprobación, la aprobación DEBE dejar de valer. Las fuentes aceptadas las DEBE
declarar el proyecto; en una ejecución desatendida, el ejecutor NO DEBE poder
registrar la aprobación. Los tickets que ya pasaron por `approved` DEBEN seguir
validando.

#### Scenario: Frase en el plan sin aprobación registrada
- **GIVEN** un ticket en `planned` cuyo plan contiene «aprobado explícitamente
  por el PO» y no tiene evento de aprobación
- **WHEN** se intenta moverlo a `approved`
- **THEN** el motor lo rechaza y dice cómo registrar la aprobación

#### Scenario: Plan modificado tras la aprobación
- **GIVEN** un plan aprobado y luego editado
- **WHEN** se intenta moverlo a `approved`
- **THEN** el motor lo rechaza porque el hash del plan no coincide

#### Scenario: Ejecutor desatendido
- **GIVEN** una sesión despachada por una jornada
- **WHEN** esa sesión intenta registrar la aprobación de un plan
- **THEN** el motor la rechaza

### Requirement: R-CTRL-002 — El gate de despliegue DEBE exigir su frase con la versión y consumir la aprobación

Un gate humano que declara `require_phrase` DEBE exigir esa frase, con sus
variables resueltas, al aprobar. La aprobación DEBE quedar atada a la corrida y
a la versión que aprueba, y DEBE consumirse al usarse: una aprobación anterior
NO DEBE habilitar otra corrida.

#### Scenario: Aprobación vieja
- **GIVEN** una aprobación del gate `deploy` registrada para la versión 1.4.0
- **WHEN** corre el proceso de despliegue de la versión 1.5.0
- **THEN** el proceso se detiene esperando una aprobación nueva

#### Scenario: Frase incorrecta
- **GIVEN** el gate `deploy` con `require_phrase: "APROBAR DEPLOY v{version}"`
- **WHEN** alguien aprueba la versión 1.5.0 con otra frase
- **THEN** la aprobación se rechaza

### Requirement: R-CTRL-003 — Mission Control NO DEBE aceptar escrituras sin autenticación cuando escucha fuera de la máquina local

Si el servidor escucha en una dirección distinta de la local, toda petición que
escribe —mover un ticket, decidir una compuerta, aprobar un proceso, editar la
configuración— DEBE exigir un token. El aviso de las jornadas NO DEBE abrir el
servidor a la red sin ese token.

#### Scenario: Aprobación desde la red sin token
- **GIVEN** Mission Control escuchando en `0.0.0.0`
- **WHEN** llega un POST a `/api/processes/gates/deploy/approve` sin token
- **THEN** responde 401 y no registra nada

### Requirement: R-CTRL-004 — El cierre DEBE exigir que los criterios verificados estén marcados

Mover un ticket a `closed` DEBE exigir que cada criterio esté marcado con `[x]`
o declarado como «no aplica» con su motivo en la entrega. Los criterios con
`test:` PUEDEN marcarse automáticamente a partir del recibo de `qa-mechanical`
que los pasó. Un `verify: manual` NO DEBE marcarlo el agente.

#### Scenario: Criterio sin marcar
- **GIVEN** un ticket en `qa_approved` con un criterio sin `[x]` y sin motivo
- **WHEN** se intenta cerrar
- **THEN** el motor lo rechaza nombrando el criterio

#### Scenario: Marcado desde el recibo
- **GIVEN** un criterio con `test:` que el último recibo de `qa-mechanical` pasó
- **WHEN** se prepara el cierre
- **THEN** el criterio queda marcado y el evento cita el recibo

### Requirement: R-CTRL-005 — Una sesión con números de consumo NO DEBE cargarse completa a más de un ticket

Registrar consumo con una referencia de sesión que ya tiene números en otro
ticket DEBE rechazarse, indicando que una sesión compartida se declara con
`manual:` y sin números. El informe de consumo DEBE contar una sola vez cada
sesión, también en el histórico.

#### Scenario: Sesión repetida
- **GIVEN** una sesión registrada con $11.11 en un ticket
- **WHEN** se intenta registrar la misma sesión con números en otro ticket
- **THEN** el motor lo rechaza

#### Scenario: Histórico duplicado
- **GIVEN** el registro de SaiOpenCloud con la misma sesión cargada a dos tickets
- **WHEN** se pide el informe de consumo
- **THEN** la sesión suma una vez y el informe señala la duplicación

### Requirement: R-CTRL-006 — El consumo de Hermes y Codex DEBERÍA registrar costo o declarar por qué no lo tiene

Los lectores de sesiones de Hermes y Codex DEBERÍAN calcular el costo con la
tabla de precios del modelo, o declarar explícitamente «suscripción» o
«desconocido». Un costo ausente NO DEBE sumarse como cero.

#### Scenario: Sesión de Codex sin costo
- **GIVEN** una sesión de Codex con tokens y sin costo en su origen
- **WHEN** se registra el consumo
- **THEN** la entrada trae costo calculado o la marca explícita, nunca un cero
