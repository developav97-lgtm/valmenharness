# S5 — Jornada autónoma

Pedido del PO: «la idea es poder ir programando tareas para cada dia y que se
ejecuten solas». Hoy hay tres mecanismos sin conectar —el cron de Hermes por
eslabón, el kanban de Hermes en SaiOpenCloud y el motor de jornadas— y la
autonomía se sostiene en un prompt que aprueba «como delegado». Esta ola une todo
en el motor, con dos fases por día: preparación (análisis y plan) y ejecución.

### Requirement: R-JORN-001 — El harness DEBE armar la jornada del día desde el motor de jornadas

Un comando y una herramienta MCP DEBEN armar la jornada: elegir los tickets por
dependencias, ventanas, capacidad y autorización; escribirla en el registro de
jornadas; y enviar el plan del día por Telegram. Programar trabajo NO DEBE
requerir crear jobs de cron por ticket.

#### Scenario: Jornada de tres tickets
- **GIVEN** tres tickets listos según sus dependencias y una autorización vigente
- **WHEN** se arma la jornada del día
- **THEN** la jornada queda en el registro con su orden y llega un aviso con los
  tres tickets

### Requirement: R-JORN-002 — Un disparador sin modelo DEBE avanzar la jornada

Un comando de avance, idempotente y sin llamadas a modelos, DEBE despachar lo que
la jornada y la capacidad permitan. El harness DEBE poder instalarlo como tarea
periódica de la máquina (launchd en macOS) o como job de Hermes sin agente.

#### Scenario: Dos avances seguidos
- **GIVEN** una jornada con un ticket en curso y capacidad para uno
- **WHEN** el disparador corre dos veces seguidas
- **THEN** no se despacha un segundo ticket ni se duplica el primero

### Requirement: R-JORN-003 — La fase de preparación DEBE llevar tickets de intake a planned y detenerse en la aprobación del plan

El despacho DEBE correr análisis y plan con sus compuertas, en una sesión por
ticket, y DEBE detenerse con el plan listo para aprobar. Si una compuerta queda
en `review` o `block`, DEBE avisar con la decisión pendiente en formato de
opciones y efecto.

#### Scenario: Plan listo
- **GIVEN** un ticket en `intake` dentro de la jornada
- **WHEN** termina la fase de preparación
- **THEN** el ticket está en `planned` con recibos de `analysis` y `plan`, y
  nadie aprobó el plan

### Requirement: R-JORN-004 — La aprobación de los planes DEBE poder darse en lote desde Telegram

Los planes listos DEBEN llegar en un mensaje con un enlace de aprobación por
plan y uno para el lote, firmados con el token HMAC existente. La aprobación DEBE
registrarse según R-CTRL-001, con fuente `token` y la frase de quien aprueba.

#### Scenario: Lote de tres planes
- **GIVEN** tres planes listos
- **WHEN** el responsable aprueba el lote desde Telegram
- **THEN** cada ticket tiene su evento de aprobación con fuente `token` y pasa a
  ser elegible para la fase de ejecución

### Requirement: R-JORN-005 — La fase de ejecución DEBE llevar tickets approved hasta las pruebas del responsable

El despacho DEBE implementar cada ticket aprobado en su propia sesión, correr
`qa-mechanical` y dejarlo en `awaiting_user_tests` con el contrato de pruebas, o
cerrarlo por política cuando cumple S6.

#### Scenario: Ticket implementado
- **GIVEN** un ticket en `approved` dentro de la jornada
- **WHEN** termina su ejecución con las pruebas en verde
- **THEN** queda en `awaiting_user_tests` con el recibo de `qa-mechanical` y el
  contrato de pruebas escrito

### Requirement: R-JORN-006 — El despacho DEBE elegir el modelo del agente según la fase

El enrutamiento DEBE declarar roles para las fases del agente —análisis, plan,
implementación y verificación— y el despacho DEBE lanzar el ejecutor con el
modelo de la fase. El consumo DEBE registrarse por fase.

#### Scenario: Modelo barato en preparación
- **GIVEN** un enrutamiento con un modelo económico para análisis y uno fuerte
  para implementación
- **WHEN** la jornada despacha ambas fases de un ticket
- **THEN** cada sesión usa su modelo y el parte diario muestra el costo por fase

### Requirement: R-JORN-007 — La jornada DEBE respetar sus topes y detenerse con aviso cuando falla el ejecutor

El despacho DEBE aplicar el máximo por día, el máximo concurrente y un tiempo
máximo por ejecución. Un fallo del ejecutor o de la verificación DEBE registrar
una parada con su motivo y DEBE avisar; una parada NO DEBE reintentarse sola.

#### Scenario: Ejecutor que no termina
- **GIVEN** un tiempo máximo de 60 minutos por ejecución
- **WHEN** una ejecución lo supera
- **THEN** se detiene, queda la parada con el motivo y llega el aviso

### Requirement: R-JORN-008 — El vigilante DEBE avisar cada ticket que llega a las pruebas del responsable y el parte diario

El vigilante DEBE avisar por Telegram cada ticket que llega a
`awaiting_user_tests`, con el enlace al contrato de pruebas, y DEBE enviar un
parte diario con lo hecho, el costo por fase y los altos pendientes.

#### Scenario: Ticket listo para probar
- **GIVEN** un ticket que pasa a `awaiting_user_tests`
- **WHEN** corre el vigilante
- **THEN** el responsable recibe un aviso con el ticket y sus comandos de prueba

### Requirement: R-JORN-009 — Cada ticket terminado en una jornada DEBE quedar en su propio commit en la rama de trabajo

Tras `qa-mechanical` en verde, el despacho DEBE commitear solo los archivos
atribuibles al ticket, en la rama de trabajo declarada. NO DEBE commitear en
`main` ni en una rama de producción, NO DEBE usar `--force`, NO DEBE crear tags y
NO DEBE hacer push. El commit DEBE corresponder al árbol que se probó.

#### Scenario: Dos tickets seguidos
- **GIVEN** una jornada con dos tickets en secuencia
- **WHEN** termina el primero
- **THEN** hay un commit con sus archivos antes de que empiece el segundo, y el
  segundo arranca con el árbol limpio

#### Scenario: Rama de producción
- **GIVEN** una configuración cuya rama de trabajo es `main`
- **WHEN** se valida la configuración
- **THEN** el motor la rechaza

### Requirement: R-JORN-010 — Una jornada NO DEBE aprobar análisis, plan ni QA por instrucción del prompt

Las plantillas de prompt de las jornadas NO DEBEN ordenar aprobar compuertas,
escribir la aprobación del responsable ni cerrar QA como delegado. Toda
aprobación DEBE venir de las fuentes de R-CTRL-001 o de la política de S6. Las
plantillas DEBEN pedir solo transiciones legales.

#### Scenario: Prompt de eslabón
- **GIVEN** la plantilla de prompt que usa la jornada
- **WHEN** se revisa su texto
- **THEN** no contiene instrucciones de aprobar por delegación ni de mover un
  ticket de `in_progress` a `in_qa`

### Requirement: R-JORN-011 — Hermes PUEDE actuar como despachador de la jornada

Un proyecto PUEDE declarar Hermes como despachador: el avance de la jornada corre
como job de Hermes sin agente y los ejecutores se lanzan desde el motor. Sin esa
declaración, la jornada DEBE funcionar con el disparador de la máquina.

#### Scenario: Proyecto sin Hermes
- **GIVEN** un proyecto que no declara Hermes
- **WHEN** se arma y despacha una jornada
- **THEN** la jornada corre con el disparador de la máquina
