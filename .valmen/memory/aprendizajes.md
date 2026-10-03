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
- **Estado:** pendiente
- **Tickets:** FEATURE-ENGINE-MODELO-INTENTO-20261001

FEATURE-ENGINE-MODELO-INTENTO-20261001 cubre el contrato de modelos configurado y efectivo por intento; el requisito R-ACT-004 usa la palabra vista, pero la representación UI pertenece a tickets posteriores. La compuerta de plan bloqueó cuatro veces por exigir renderizado, aun cuando el plan entregaba ExecutionContract y pruebas del contrato. Al refinar la compuerta, distinguir requisito final de la porción explícitamente asignada al ticket y tratar la UI dependiente como cobertura futura, no como omisión del plan de motor.
