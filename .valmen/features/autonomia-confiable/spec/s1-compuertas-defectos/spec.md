# S1 — Compuertas sin defectos

Defectos de código confirmados en la revisión del 2026-10-05. Son la causa de
bloqueos y aprobaciones que no dependen del modelo: se corrigen primero porque
son baratos, tienen regresión clara y distorsionan cualquier calibración
posterior.

### Requirement: R-CDEF-001 — El lector de criterios DEBE tomar como criterio solo un ítem de lista

`extractCriteriaSpecs` (`packages/gate/src/dynamic.ts`) DEBE considerar criterio
solo una línea que empiece con viñeta de lista (casilla, guion o número). Un
comentario HTML que no sea una anotación reconocida (`test:`, `verify:`, `http:`)
NO DEBE convertirse en criterio, aunque supere el largo mínimo.

#### Scenario: Comentario de la plantilla
- **GIVEN** un ticket cuya sección de criterios conserva el comentario de la
  plantilla «Una afirmación verificable…» y declara dos criterios con viñeta
- **WHEN** se evalúa la compuerta `plan`
- **THEN** el recibo tiene exactamente dos proposiciones `criterio_NN`, una por
  cada criterio con viñeta

#### Scenario: Regresión del recibo real
- **GIVEN** el estado evaluado de `BUGFIX-GATE-CONTRADICCION-ANALYSIS-20261005`
  que bloqueó con `criterio_01..03 = 0.01`
- **WHEN** se extraen sus criterios
- **THEN** ninguna de las líneas del comentario aparece como criterio

### Requirement: R-CDEF-002 — Un ticket con más criterios que el tope NO DEBE evaluarse con un recorte silencioso

Cuando un ticket declara más criterios que `MAX_CRITERIA_PROPOSITIONS`, la
compuerta `plan` DEBE evaluarlos todos o fallar con un mensaje que nombre el tope
y la cantidad declarada. `qa-mechanical` DEBE ejecutar todos los comandos
declarados, sin tope.

#### Scenario: Ticket con 31 criterios
- **GIVEN** un ticket con 31 criterios anotados con `test:`
- **WHEN** corre `qa-mechanical`
- **THEN** el recibo tiene 31 resultados de comando, o la compuerta falla
  diciendo que hay 31 criterios y cuál es el tope; nunca aprueba con 12

### Requirement: R-CDEF-003 — La excepción por contradicción interna NO DEBE exigir umbral a una proposición descriptiva

La regla de AP-004 (`isIsolatedBlockContradiction`) DEBE ignorar las
proposiciones requeridas que estén en modo descriptivo —por ejemplo
`riesgos_cubren_impactos` cuando el ticket no declara impactos—. Las demás
condiciones de la regla no cambian.

#### Scenario: Vector histórico sin impactos
- **GIVEN** un recibo de `analysis` con clasificación `completa`,
  `causa_especifica` y `nombra_archivos_reales` sobre `approveAt`, una sola
  proposición semántica bajo `blockAt` y `riesgos_cubren_impactos` descriptiva
- **WHEN** se decide la compuerta
- **THEN** el resultado es `review`, no `block`

#### Scenario: Caso de control
- **GIVEN** el mismo recibo con `causa_especifica` bajo `approveAt`
- **WHEN** se decide la compuerta
- **THEN** el resultado sigue siendo `block`

#### Scenario: Suite de regresión
- **GIVEN** los 25 bloqueos históricos de `analysis` del harness
- **WHEN** se reevalúan con la regla corregida
- **THEN** los que cumplen la regla pasan a `review` y los de control siguen en
  `block`, y la suite queda en las pruebas del repositorio

### Requirement: R-CDEF-004 — Avanzar con la compuerta en block o review DEBE exigir una decisión humana registrada

Mover un ticket a la fase siguiente cuando el último recibo de la compuerta de
su fase está en `block` o `review` sin `humanDecision` DEBE rechazarse, o DEBE
dejar la firma —actor, frase y fecha— en el recibo y como evento en el ticket.
Un informe que lea solo el ticket DEBE poder distinguir una aprobación humana de
una del modelo.

#### Scenario: Avance sin firma
- **GIVEN** un ticket en `analyzed` cuyo último recibo de `analysis` está en
  `review` sin decisión humana
- **WHEN** se intenta moverlo a `planned`
- **THEN** el motor lo rechaza y dice qué decisión falta y cómo registrarla

#### Scenario: Avance firmado
- **GIVEN** el mismo ticket con una decisión humana registrada en el recibo
- **WHEN** se mueve a `planned`
- **THEN** el ticket guarda un evento con el actor y la frase de la decisión

### Requirement: R-CDEF-005 — El recibo de una compuerta DEBE guardar el motivo de cada respuesta del evaluador

Cuando el evaluador devuelve un motivo por proposición, el recibo DEBE guardarlo
junto a la respuesta. Cuando el evaluador no lo devuelve, el campo DEBE quedar
explícitamente vacío (`null`), para distinguir «no lo dio» de «se perdió».

#### Scenario: Juez de chat
- **GIVEN** el juez de chat responde cada proposición con `answer` y `reason`
- **WHEN** se escribe el recibo
- **THEN** cada entrada de `modelAnswers` conserva su `reason`

### Requirement: R-CDEF-006 — La compuerta mecánica DEBE distinguir un comando que no llegó a probar de una prueba que falló

`qa-mechanical` DEBE clasificar como falla del entorno —con resultado `review` y
un mensaje que lo diga— un comando que termina sin haber ejecutado pruebas: base
de datos de prueba ya existente, conexión rechazada, comando inexistente, tope de
tiempo, o salida sin el resumen de pruebas del runner declarado. Una prueba que
corrió y falló DEBE seguir bloqueando. El recibo DEBE guardar la cola de la
salida, no su comienzo, y el sha256 de la salida completa.

#### Scenario: Base de pruebas ya creada
- **GIVEN** un comando de pruebas de Django que termina con «database already
  exists» sin ejecutar ninguna prueba
- **WHEN** corre `qa-mechanical`
- **THEN** el resultado es `review` con el motivo «falla del entorno», no `block`

#### Scenario: Resumen al final de la salida
- **GIVEN** una suite que imprime 40 KB y su resumen en las últimas líneas
- **WHEN** se escribe el recibo
- **THEN** el recibo contiene el resumen y el hash de los 40 KB

### Requirement: R-CDEF-007 — El proyecto PUEDE declarar la preparación del ambiente de pruebas que la compuerta mecánica corre antes de los criterios

El proyecto PUEDE declarar en `.valmen/config.yaml` los comandos que dejan listo
el ambiente de pruebas —migración al esquema de pruebas, reutilización de la base
(`--keepdb`), servicios requeridos—. La compuerta mecánica DEBE correrlos antes
de los criterios y registrarlos en el recibo con comando, resultado y duración.
Una migración NO DEBE ejecutarse contra un esquema fuera de la lista permitida
(R-S5-008). Si la preparación falla, la compuerta DEBE terminar como falla del
entorno (R-CDEF-006).

#### Scenario: SaiOpenCloud con base persistente
- **GIVEN** un proyecto que declara la preparación con migración al esquema de
  pruebas y `--keepdb`
- **WHEN** corre `qa-mechanical` dos veces seguidas
- **THEN** la segunda corrida no falla por la base existente y el recibo muestra
  la preparación antes de los criterios

#### Scenario: Esquema no permitido
- **GIVEN** una preparación que apunta a un esquema fuera de `allowed-schemas`
- **WHEN** corre la compuerta
- **THEN** no se ejecuta la migración y el recibo dice por qué

### Requirement: R-CDEF-008 — Una compuerta NO DEBE volver a evaluarse sobre el mismo estado del ticket

Si el último recibo de una compuerta tiene el mismo `stateHash` y la misma
configuración de evaluador, una nueva corrida DEBE rechazarse remitiendo a ese
recibo. PUEDE forzarse con un motivo explícito, que queda escrito en el recibo
nuevo. Es la regla de EST-001 llevada al código.

#### Scenario: Persecución del número
- **GIVEN** un plan evaluado hace un minuto, sin cambios en el ticket
- **WHEN** se pide evaluar de nuevo la compuerta `plan`
- **THEN** el motor no llama al modelo y responde con el recibo existente y la
  instrucción de cambiar el ticket o dar un motivo
