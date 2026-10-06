# S6 — QA por agente en backend

Pedido del PO: «hay cosas que son de backend entonces normalmente se corren los
test, se puede ejecutar peticiones y ver la respuesta o solo el test, y con eso
al yo ejecutarlos pues debe salir el mismo resultado entonces, por ejemplo ahi
deberia aprobar y poder cerrarse con QA ejecutado por el agente».

Eso es cierto solo si el agente no controla qué se corre ni dónde. Esta ola
concreta R-S5-010: la persona autoriza una política una vez, el código la aplica
y el recibo la cita. Decidido el 2026-10-05: los tipos elegibles incluyen FEATURE
de backend sin impactos, con un periodo en sombra de 20 tickets.

### Requirement: R-QAAG-001 — La QA por agente DEBE requerir una autorización persistida creada por una persona

Una autorización DEBE declarar tipos de ticket, módulos, riesgo máximo, cupo
diario, vigencia y la frase literal de quien autoriza. Solo DEBE poder crearse o
ampliarse por un canal que el agente no controla —enlace firmado con token o
Mission Control autenticado—. NO DEBE existir herramienta MCP que la cree o la
amplíe. DEBE poder revocarse, y la revocación vale desde ese momento.

#### Scenario: Intento desde el agente
- **GIVEN** una sesión de agente con acceso a las herramientas MCP
- **WHEN** intenta crear o ampliar una autorización
- **THEN** no hay herramienta para hacerlo y el CLI la rechaza en una ejecución
  desatendida

#### Scenario: Revocación
- **GIVEN** una autorización vigente
- **WHEN** el responsable la revoca
- **THEN** ningún ticket posterior se cierra por esa política

### Requirement: R-QAAG-002 — La elegibilidad para QA por agente DEBE decidirse en código

Un ticket DEBE ser elegible solo si cumple todo:

1. Una autorización vigente cubre su tipo y su módulo, y queda cupo.
2. Su tipo es BUGFIX, IMPROVEMENT, CHORE o FEATURE, según la autorización; nunca
   SECURITY, SYNC, INTEGRATION ni AGENT.
3. Riesgo `normal` o menor, sin impactos de sincronización, migración ni
   contenedores.
4. Todos sus criterios se verifican por comando (`test:` o `http:`).
5. El diff no toca pantallas, migraciones, configuración de despliegue,
   autenticación, CI, `.valmen/` ni los scripts que corren las pruebas.
6. Sin puntos abiertos ni reapertura previa, y con `valmen secrets` y `valmen
   drift` limpios.

#### Scenario: Ticket con un criterio manual
- **GIVEN** un ticket de backend con un criterio `verify: manual`
- **WHEN** se evalúa su elegibilidad
- **THEN** no es elegible y el motivo nombra el criterio

#### Scenario: Diff que toca el script de pruebas
- **GIVEN** un ticket cuyo diff modifica `.valmen/scripts/ng-test.sh`
- **WHEN** se evalúa su elegibilidad
- **THEN** no es elegible

### Requirement: R-QAAG-003 — La compuerta qa-agent DEBE ejecutar las pruebas en un árbol limpio que el agente no controla

La compuerta DEBE correr en un `git worktree` limpio creado desde el árbol
entregado, con la configuración y los scripts de pruebas tomados del commit base,
y solo con los comandos exactos que el proyecto autoriza.

#### Scenario: Script modificado en el árbol de trabajo
- **GIVEN** un árbol de trabajo con un script de pruebas editado y sin commitear
- **WHEN** corre `qa-agent`
- **THEN** la compuerta usa el script del commit base

### Requirement: R-QAAG-004 — En una corrección, las pruebas nuevas DEBEN fallar contra el código base y pasar contra el entregado

En un BUGFIX, la compuerta DEBE correr las pruebas nuevas contra el código base y
exigir que al menos una falle, y contra el entregado y exigir que todas pasen.
DEBE correr también la suite de regresión que el proyecto declare.

#### Scenario: Prueba que no prueba nada
- **GIVEN** un BUGFIX cuya prueba nueva pasa también contra el código base
- **WHEN** corre `qa-agent`
- **THEN** la compuerta no aprueba y dice que la prueba no reproduce el defecto

### Requirement: R-QAAG-005 — El recibo de qa-agent DEBE permitir reproducir la verificación

El recibo DEBE guardar: sha del commit base y del entregado, hash del árbol
probado, cada comando con su invocación, código de salida, duración, cola de la
salida y sha256 de la salida completa, el resultado contra el código base, y el
id y el hash de la autorización aplicada.

#### Scenario: Reproducción por el responsable
- **GIVEN** un recibo de `qa-agent` aprobado
- **WHEN** el responsable corre los mismos comandos sobre el mismo árbol
- **THEN** obtiene los mismos códigos de salida

### Requirement: R-QAAG-006 — Un ciclo de QA aprobado por política DEBE atribuirse a la autorización, no al agente

El ciclo de QA DEBE registrar el id de la autorización y el actor `policy` en
lugar de una confirmación escrita por el agente, y la validación del ticket DEBE
aceptarlo como aprobación. El vigilante DEBE avisar «cerrado por política» con el
enlace al recibo y la forma de reabrir.

#### Scenario: Cierre por política
- **GIVEN** un ticket elegible con `qa-agent` aprobado
- **WHEN** se cierra
- **THEN** su bloque de QA nombra la autorización, no al agente, y llega el aviso

### Requirement: R-QAAG-007 — Un criterio PUEDE verificarse con una petición HTTP contra hosts permitidos

Un criterio PUEDE declarar `<!-- http: MÉTODO ruta expect: … -->`. Del ticket
solo DEBEN tomarse el método, la ruta y las expectativas; el host, la credencial
y el ejecutor DEBEN salir de la configuración del proyecto. La compuerta NO DEBE
aceptar un host fuera de la lista, un esquema o host dentro de la ruta, ni un
método no declarado. Las aserciones DEBEN usar una gramática cerrada. El recibo
NO DEBE guardar cabeceras de autenticación ni cookies.

#### Scenario: Ruta con otro host
- **GIVEN** un criterio `http: GET https://otro.example/api expect: status=200`
- **WHEN** corre la compuerta
- **THEN** el criterio se rechaza sin hacer la petición

#### Scenario: Respuesta esperada
- **GIVEN** un criterio `http: GET /api/v1/huecos/?sucursal=1 expect: status=200;
  json.results.length==0` y el servidor local levantado
- **WHEN** corre la compuerta
- **THEN** el recibo guarda el status, la latencia y el hash del cuerpo

### Requirement: R-QAAG-008 — La QA por agente DEBE pasar por un periodo en sombra antes de cerrar tickets

Con la política en sombra, `qa-agent` DEBE correr y registrar su veredicto sin
cerrar el ticket, y el responsable sigue aprobando. La política solo DEBE pasar a
cerrar tickets después de 20 tickets en sombra con concordancia del 100%, y la
promoción DEBE registrarse con esa evidencia. Volver a sombra DEBE ser un cambio
de configuración.

#### Scenario: Discrepancia en sombra
- **GIVEN** 19 tickets en sombra concordantes y uno donde el responsable pidió
  cambios y `qa-agent` aprobó
- **WHEN** se pide la promoción
- **THEN** el motor la rechaza y muestra el ticket discordante

### Requirement: R-QAAG-009 — AGENTS.md DEBE declarar la QA por agente como vía de entrega y la autorización como acción humana

La plantilla de AGENTS.md DEBE agregar en «Entrega y documentación» la QA
ejecutada por agente bajo autorización vigente, y en «Acciones que nunca se
automatizan» la creación o ampliación de una autorización permanente de QA.

#### Scenario: Proyecto sincronizado
- **GIVEN** un proyecto adoptado
- **WHEN** corre `valmen sync` tras esta ola
- **THEN** su AGENTS.md tiene ambas reglas
