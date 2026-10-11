# Contenido del plan

Pasos concretos y ordenados, no una lista de componentes genérica. Un error pequeño puede requerir dos pasos reales —corrección dirigida y prueba de regresión—; una integración necesita contratos y orden de despliegue.

| Sección del ticket | Contenido requerido |
|---|---|
| Diagnóstico | Flujo y archivos comprobados, causa o hipótesis, impactos, riesgos y supuestos. |
| Plan | Alcance y exclusiones; pasos con archivos y responsable; dependencias; qué compuerta aplica; compatibilidad, orden de despliegue y reversión según el riesgo. |
| Criterios de aceptación | Resultados observables por flujo y por punto, incluidos permisos, aislamiento y errores pertinentes. |
| Pruebas | Comandos exactos, directorio de ejecución, resultado esperado, comprobaciones manuales y requisitos de entorno. |

Un anexo extenso puede vivir junto al ticket y quedar enlazado desde `## Plan`; el alcance y la aprobación permanecen en el ticket. Añadir pseudocódigo cuando aclare orden de eventos, transacciones, reintentos o ramas de negocio. Una omisión de pseudocódigo no omite la compuerta del plan.
