# Estándares propuestos

Reglas que el trabajo enseñó y que **todavía no están en vigor**. Las decide una
persona —desde Mission Control o pidiéndoselo a un agente— y al aceptarlas
pasan a `.valmen/rules/estandares-<área>.md`, que es lo que llega al
`AGENTS.md`. La decisión queda escrita con la frase que la autorizó.

### [EST-001] Cuándo se usa la cascada verificada

- **Área:** proceso
- **Propuesto:** 2026-09-27
- **Estado:** aceptado
- **Decidido:** 2026-09-27 · «si acepto el estandar»

**Regla:** En un gate con proposiciones que solo un modelo puede responder se corre el evaluador `cascade` cuando el artefacto tiene sustancia y el veredicto cierra una transición —el análisis de un ticket con diagnóstico escrito, el plan de un cambio que toca código, el cierre con criterios declarados—, y se corre el evaluador de siempre cuando el gate se resuelve en código, cuando el cambio es de texto o de configuración, o cuando el estado no cambió desde la corrida anterior. El evaluador elegido se declara al correr el gate: el recibo lo guarda, y sin eso la decisión no se puede auditar después.

**Por qué:** La cascada gasta tres llamadas donde el evaluador de siempre gasta una —produce el modelo barato, verifica cada proposición y solo lo que el verificador no respalda vuelve al modelo superior—, así que se paga cuando el veredicto importa y el artefacto tiene sustancia. La referencia medida es ~7% del costo con 0 errores adicionales (docs/auditoria-20260926).

### [EST-002] Gateway y avisos por Telegram

- **Área:** proceso
- **Propuesto:** 2026-10-01
- **Estado:** aceptado
- **Decidido:** 2026-10-01 · «Slack apagado y avisos por Telegram con los dos vigías reescritos; lo confirmo el 2026-09-30 después de probar la recepción en Telegram»

**Regla:** La entrega y los avisos de la jornada (arranque, awaiting_user_tests, compuertas en REVIEW) salen por el bot de Telegram del perfil del proyecto —TELEGRAM_ALLOWED_USERS del .env—; Slack queda como canal secundario apagado. Un nuevo aviso se agrega al vigilante de avisos, no a un mensaje suelto.

**Por qué:** Migración decidida por el PO el 2026-09-30: los DM de Slack a veces no llegaban al celular y la gateway ya sirve Telegram en ambos perfiles; un solo canal de avisos evita revisar dos aplicaciones para lo mismo.

### [EST-003] Registro de tickets: traducir lo nuevo del pedido antes de crear

- **Área:** proceso
- **Propuesto:** 2026-10-02
- **Estado:** aceptado
- **Decidido:** 2026-10-02 · «si dale implomentemos la 1 y 3 pero recuerda que debe quedar para los dos proyectos y que cuando se monte en otro proyecto tambien vayan estas reglas para evitar ese retroseso y costo adicional»

**Regla:** Si el pedido nombra algo que el código no tiene —parámetro, permiso, campo, bandera, columna, migración—, se traduce a campo real con búsqueda antes de crear el ticket; si no aparece, se pregunta una vez al PO y el ticket no se registra con el hueco. Lo que quede sin decidir se escribe en la sección «Supuestos y decisiones pendientes» del ticket, cada elemento con su pregunta, y el análisis no planifica sobre la adivinanza.

**Por qué:** BUGFIX-RESTAURANTE-MESERO-BORRAR-BONIFICAR-20260929 pidió «el nuevo parámetro bonificado» sin especificarlo: tres corridas de compuerta de plan y dos escaladas hasta que el PO resolvió usar el parámetro bonus que ya vive en AdmInvoiceParam.

### [EST-004] Escalada tras dos bloqueos semánticos equivalentes

- **Área:** proceso
- **Propuesto:** 2026-10-03
- **Estado:** aceptado
- **Decidido:** 2026-10-03 · «si una compuerta no pasa dos veces aun colocando lo necesario como en este caso se aprueba y se coloca eso documentado y si toca agregarlo al aprendizaje también se agrega para luego poder hacer revision y afinacion esto aplica para tdos los tickets»

**Regla:** Tras dos bloqueos consecutivos del mismo gate por la misma proposición semántica, cuando el artefacto ya incorpora la corrección comprobable, se documentan ambos recibos y la evidencia; una autorización explícita vigente del PO permite continuar sin una tercera corrida. La aprobación queda atribuida a esa política humana, nunca al modelo.

**Por qué:** Evita gastar una tercera llamada idéntica y deja evidencia para calibrar el evaluador, sin que la compuerta amplíe su propia autoridad.

### [EST-005] Dos bloqueos semánticos iguales no justifican una tercera corrida

- **Área:** proceso
- **Propuesto:** 2026-10-03
- **Estado:** descartado
- **Decidido:** 2026-10-03 · «si una compuerta no pasa dos veces aun colocando lo necesario como en este caso se aprueba y se coloca eso documentado y si toca agregarlo al aprendizaje también se agrega para luego poder hacer revision y afinacion esto aplica para tdos los tickets»
- **Tickets:** FEATURE-ENGINE-VENTANAS-JORNADA-20261001, FEATURE-ENGINE-AUTORIZACION-JORNADAS-20261001
- **Nota:** duplicado de EST-004 — misma regla y misma frase del PO; se conserva descartada para que no se vuelva a proponer.

**Regla:** Los gates analysis de FEATURE-ENGINE-VENTANAS-JORNADA-20261001 y FEATURE-ENGINE-AUTORIZACION-JORNADAS-20261001 bloquearon por diagnostico_explica_el_sintoma aunque el diagnóstico ya nombra comportamiento, causa, archivos y riesgos. Por decisión del PO, tras dos bloqueos equivalentes con el artefacto corregido, se documenta la evidencia y se aprueba por política humana; no se repite una tercera llamada. Se revisará y afinará el evaluador posteriormente.

**Por qué:** Sale del aprendizaje AP-006 (2026-10-03), visto en FEATURE-ENGINE-VENTANAS-JORNADA-20261001, FEATURE-ENGINE-AUTORIZACION-JORNADAS-20261001.

### [EST-006] Una contradicción interna del evaluador no debe producir un bloqueo automático

- **Área:** proceso
- **Propuesto:** 2026-10-04
- **Estado:** aceptado
- **Decidido:** 2026-10-05
- **Tickets:** FEATURE-ADAPTER-CAPACIDADES-20261001

**Regla:** En FEATURE-ADAPTER-CAPACIDADES-20261001, el gate analysis bloqueó cuatro veces diagnostico_explica_el_sintoma (0.04, 0.02, 0.08) mientras el mismo recibo clasificaba el análisis como completa y daba >=0.97 a causa_especifica, nombra_archivos_reales y riesgos_cubren_impactos. El refinamiento debe detectar esa contradicción: si clasificación es completa y las tres comprobaciones estructurales superan approveAt, una única proposición semántica contradictoria no puede decidir block; se degrada a review y exige decisión humana. La corrección se valida con una prueba determinista del vector de recibo anterior, que debe devolver review, y con un caso control donde falla causa o archivos, que debe seguir devolviendo block.

**Por qué:** Sale del aprendizaje AP-004 (2026-10-03), visto en FEATURE-ADAPTER-CAPACIDADES-20261001.

### [EST-007] Preguntar al PO con AskUserQuestion por defecto

- **Área:** proceso
- **Propuesto:** 2026-10-09
- **Estado:** aceptado
- **Decidido:** 2026-10-09 · «lo de AskUserQuestion va en ambos proyectos.. la idea es que siempre me pregunte asi por defecto cuando necesite una respuesta no que tenga yo que decirle»
- **Tickets:** FEATURE-WEB-VISTA-TEXTO-PREGUNTA-20261008, FEATURE-SERVER-TEXTO-PREGUNTA-RESPUESTA-20261008

**Regla:** Cuando el agente necesite una respuesta o una decisión del PO, la hace con la herramienta AskUserQuestion —opciones con su efecto, la recomendada primero y marcada «(Recomendado)»— y no la plantea en texto; solo pide en texto lo que no es una decisión (un dato, un archivo). La respuesta del PO por la herramienta cuenta como su frase literal para registrar la decisión.

**Por qué:** El 2026-10-09 el PO probó el aviso de pregunta de la vista Agentes y tuvo que pedirle al agente «hazme la pregunta con AskUserQuestion»; la vista existe para mostrar esas preguntas, y dijo que quiere que el agente pregunte así siempre por defecto, en ambos proyectos, sin que él tenga que decírselo.
