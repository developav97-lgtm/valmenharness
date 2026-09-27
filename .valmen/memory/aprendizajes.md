# Aprendizajes

Registro de lo que el trabajo enseñó.

### [AP-001] Un criterio compuesto bloquea el gate de plan por banda, no por falta de trabajo

- **Fecha:** 2026-09-27
- **Estado:** pendiente
- **Tickets:** FEATURE-ENGINE-REANUDAR-COMPACTO-20260926

El gate de plan despliega una proposicion atomica por criterio, y cada una pregunta si existe un paso del plan que la satisface. Un criterio que agrupa seis cosas en una frase puntua 0.87-0.89 y cae en banda de revision, aunque el plan este completo: las proposiciones descriptivas daban 0.90-0.97 (pasos ejecutables, criterios verificables, archivos, rollback, compatibilidad) y la clasificacion respondia completo. Partirlo en criterios atomicos y nombrar archivo y simbolo concretos en cada paso subio la media de 0.743 a 0.890 y el veredicto paso a approve. Corolario: antes de pedirle a una persona que apruebe a mano una compuerta en banda de revision, atomizar el criterio y concretar los pasos; el bloqueo se mueve de criterio en criterio mientras cada uno siga siendo compuesto o abstracto.
