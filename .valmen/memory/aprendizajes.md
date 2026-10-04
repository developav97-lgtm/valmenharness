# Aprendizajes

Registro de lo que el trabajo enseñó.

### [AP-001] Un criterio compuesto bloquea el gate de plan por banda, no por falta de trabajo

- **Fecha:** 2026-09-27
- **Estado:** pendiente
- **Tickets:** FEATURE-ENGINE-REANUDAR-COMPACTO-20260926

El gate de plan despliega una proposicion atomica por criterio, y cada una pregunta si existe un paso del plan que la satisface. Un criterio que agrupa seis cosas en una frase puntua 0.87-0.89 y cae en banda de revision, aunque el plan este completo: las proposiciones descriptivas daban 0.90-0.97 (pasos ejecutables, criterios verificables, archivos, rollback, compatibilidad) y la clasificacion respondia completo. Partirlo en criterios atomicos y nombrar archivo y simbolo concretos en cada paso subio la media de 0.743 a 0.890 y el veredicto paso a approve. Corolario: antes de pedirle a una persona que apruebe a mano una compuerta en banda de revision, atomizar el criterio y concretar los pasos; el bloqueo se mueve de criterio en criterio mientras cada uno siga siendo compuesto o abstracto.

### [AP-002] Un import del indice del propio paquete esconde un ciclo que depende del orden de evaluacion

- **Fecha:** 2026-09-27
- **Estado:** pendiente
- **Tickets:** FEATURE-CLI-MODO-ASK-20260926

El guardia del modo pregunta se colgo de las dos puertas de escritura de core, y al correr la prueba del ticket MutationLock aparecia sin definir en tiempo de llamada. La causa no era el guardia: packages/core/src/fs.ts importaba fail y EXIT_HISTORY desde @valmen/core, el indice de su propio paquete, y eso arma un ciclo —indice, fs.ts, indice—. El ciclo estaba latente y solo se manifiesta segun el orden de evaluacion: un modulo que importa packages/core/src/fs.js antes que el indice se queda con MutationLock capturado antes de que la clase se declare, y la llamada falla con un TypeError que no nombra la causa. Se reproduce con un sondeo minimo sobre el arbol con el cambio y sin el —con el archivo de HEAD pasa, con el del ticket falla—, y se cierra importando la ruta relativa ./errors.js en vez del indice. Regla: dentro de packages/core/src los imports van por ruta relativa; importar el indice del propio paquete arma un ciclo y hace que el resultado dependa del orden de los imports de quien lo consume, no del codigo.

### [AP-003] Las compuertas de plan deben respetar el alcance asignado por el grafo

- **Fecha:** 2026-10-03
- **Estado:** caso
- **Clasificado:** 2026-10-04
- **Estado:** pendiente
- **Tickets:** FEATURE-ENGINE-MODELO-INTENTO-20261001

FEATURE-ENGINE-MODELO-INTENTO-20261001 cubre el contrato de modelos configurado y efectivo por intento; el requisito R-ACT-004 usa la palabra vista, pero la representación UI pertenece a tickets posteriores. La compuerta de plan bloqueó cuatro veces por exigir renderizado, aun cuando el plan entregaba ExecutionContract y pruebas del contrato. Al refinar la compuerta, distinguir requisito final de la porción explícitamente asignada al ticket y tratar la UI dependiente como cobertura futura, no como omisión del plan de motor.

### [AP-004] Una contradicción interna del evaluador no debe producir un bloqueo automático

- **Fecha:** 2026-10-03
- **Estado:** regla
- **Clasificado:** 2026-10-04
- **Estado:** pendiente
- **Tickets:** FEATURE-ADAPTER-CAPACIDADES-20261001

En FEATURE-ADAPTER-CAPACIDADES-20261001, el gate analysis bloqueó cuatro veces diagnostico_explica_el_sintoma (0.04, 0.02, 0.08) mientras el mismo recibo clasificaba el análisis como completa y daba >=0.97 a causa_especifica, nombra_archivos_reales y riesgos_cubren_impactos. El refinamiento debe detectar esa contradicción: si clasificación es completa y las tres comprobaciones estructurales superan approveAt, una única proposición semántica contradictoria no puede decidir block; se degrada a review y exige decisión humana. La corrección se valida con una prueba determinista del vector de recibo anterior, que debe devolver review, y con un caso control donde falla causa o archivos, que debe seguir devolviendo block.

### [AP-005] Gate de análisis no aplica a requisito nuevo sin síntoma

- **Fecha:** 2026-10-03
- **Estado:** caso
- **Clasificado:** 2026-10-04
- **Estado:** pendiente
- **Tickets:** FEATURE-MC-PANEL-HERRAMIENTAS-20261001

En FEATURE-MC-PANEL-HERRAMIENTAS-20261001, el gate analysis bloqueó tres veces diagnostico_explica_el_sintoma (~0.07) aunque la clasificación fue completa y las demás proposiciones aprobaron. La solicitud materializada sólo expresa requisitos R-ACT-003/R-VIV-005, no un defecto observable previo; el diagnóstico comprobó que falta la proyección/UI requerida. Refinar el gate para declarar inaplicable o reformular esa proposición cuando la solicitud sea funcionalidad nueva sin síntoma reportado; no se debe forzar un síntoma inventado ni aprobar manualmente el recibo.

### [AP-006] Dos bloqueos semánticos iguales no justifican una tercera corrida

- **Fecha:** 2026-10-03
- **Estado:** regla
- **Clasificado:** 2026-10-03
- **Tickets:** FEATURE-ENGINE-VENTANAS-JORNADA-20261001, FEATURE-ENGINE-AUTORIZACION-JORNADAS-20261001

Los gates analysis de FEATURE-ENGINE-VENTANAS-JORNADA-20261001 y FEATURE-ENGINE-AUTORIZACION-JORNADAS-20261001 bloquearon por diagnostico_explica_el_sintoma aunque el diagnóstico ya nombra comportamiento, causa, archivos y riesgos. Por decisión del PO, tras dos bloqueos equivalentes con el artefacto corregido, se documenta la evidencia y se aprueba por política humana; no se repite una tercera llamada. Se revisará y afinará el evaluador posteriormente.

### [AP-007] Una compuerta en bloque no impide el avance si la aprobación no queda en el recibo

- **Fecha:** 2026-10-04
- **Estado:** pendiente
- **Tickets:** FEATURE-ADAPTER-CAPACIDADES-20261001, FEATURE-ADAPTER-HERMES-LECTURA-20261001, FEATURE-ADAPTER-OPENCODE-CODEX-20261001, FEATURE-CONFIG-ELEGIBILIDAD-AUTONOMA-20260926, FEATURE-ENGINE-AUTORIZACION-JORNADAS-20261001, FEATURE-ENGINE-MODELO-INTENTO-20261001, FEATURE-ENGINE-RUN-AUTONOMO-20260926, FEATURE-ENGINE-VENTANAS-JORNADA-20261001, FEATURE-GATE-VERIFY-DEV-20260926, FEATURE-MC-CONTEXTO-UI-20261001, FEATURE-MC-DISPONIBILIDAD-FUENTES-20261001, FEATURE-MC-PANEL-HERRAMIENTAS-20261001, FEATURE-SERVER-EVENTOS-INCREMENTALES-20261001, SECURITY-ENGINE-COLISIONES-ESCRITURA-20260926

Revisión del fin de semana (2026-10-02 a 2026-10-04) sobre los tickets del feature control-jornadas-ejecucion: 14 de ellos avanzaron de intake a analyzed, planned y approved con recibos de compuerta en block o en review, y sin ninguna aprobación registrada — ni evento de compuerta en el ticket, ni campo humanDecision en el recibo. Los casos van de una corrida en block (RUN-AUTONOMO, COLISIONES) a seis (MODELO-INTENTO, plan) y tres (ADAPTER-CAPACIDADES, ADAPTER-HERMES-LECTURA, MC-PANEL-HERRAMIENTAS, MC-CONTEXTO-UI, analysis). En el mismo rango hay 22 recibos que sí traen humanDecision, así que el registro tiene las dos formas conviviendo y no hay manera de saber por el ticket cuál se aplicó. EST-004 exige que la aprobación quede atribuida a la política humana y nunca al modelo, pero no dice dónde se escribe; y el motor rechaza anotar un punto en un ticket cerrado con QA aprobada, así que la constancia posterior tampoco puede quedar en el ticket. Lo que falta es que el movimiento de estado que ocurre con la compuerta en block escriba la firma en el recibo y en los eventos, o que el movimiento se rechace. Mientras eso no exista, un informe que lea sólo los tickets no puede distinguir un ticket aprobado a mano de uno aprobado por el modelo.
