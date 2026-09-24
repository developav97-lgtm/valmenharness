---
name: revision-final
description: Usar cuando un cambio parece listo para entregar al responsable, cuando se pida una revisión de código o antes de abrir un ciclo de validación. Revisa calidad y trazabilidad; no autoriza publicaciones.
---

# Revisión final

Revisar la calidad y la trazabilidad de un cambio antes de entregarlo. Es una revisión técnica: **no** declara un despliegue listo, no despliega, no confirma cambios, no envía ni crea etiquetas, y no sustituye la aprobación del responsable ni la validación.

Revisar contra el ticket, sus criterios de aceptación y el cambio real. Informar **únicamente hallazgos sustentados** por el código, la configuración o la evidencia disponible: una sospecha sin respaldo consume tiempo y desgasta la revisión.

## De dónde sale el stack

Las reglas de estilo, las versiones y las convenciones del proyecto salen de `.valmen/rules/stack.md` y de las reglas aplicables al impacto del ticket. Revisar contra **el patrón que ya usa el módulo**, no contra el gusto de quien revisa.

## Revisión proporcional

1. Confirmar que el cambio pertenece al ticket y que sus archivos y riesgos están documentados. Identificar y **excluir los cambios ajenos sin modificarlos**; su presencia no bloquea la revisión salvo que una ruta no se pueda atribuir con evidencia suficiente.
2. Verificar los criterios de aceptación y los contratos entre capas cuando intervengan.
3. Revisar seguridad y aislamiento: sin secretos, permisos acordes al flujo, contexto correcto y sin identificadores ni esquemas codificados.
4. Revisar mantenibilidad: manejo explícito de errores, validaciones necesarias, consultas razonables y **ausencia de datos sensibles o restos de depuración** en lo que se entrega.
5. Comprobar contratos tipados, accesibilidad, estados asíncronos y patrones existentes en la interfaz.
6. Para sincronización o servicios locales, comprobar lo que el ticket exija: claves naturales, resolución de conflictos, idempotencia, orden de eventos, reintentos y compatibilidad hacia atrás.
7. Confirmar que las pruebas automáticas y el recorrido manual propuesto cubren el comportamiento alterado y sus riesgos.

Clasificar cada hallazgo como **bloqueante o no bloqueante**, con el archivo o comportamiento, el impacto y una recomendación concreta. Un hallazgo sin recomendación es una queja, no una revisión.

Los hallazgos funcionales de la misma solicitud se registran en el ticket como puntos; **no se borran ni se renumeran los ciclos previos**.

## Los criterios se marcan

Antes de entregar y antes de cerrar, **cada criterio de aceptación que se verificó queda marcado** con `- [x]` en el ticket. Una casilla sin marcar en un ticket entregado —o peor, cerrado— dice que nadie comprobó ese criterio, y el registro queda afirmando dos cosas a la vez: el ticket está aprobado y hay criterios que nadie miró.

- Los que se corrieron por comando y pasaron, marcados. El recibo del gate mecánico dice cuáles: si un criterio con `<!-- test: … -->` no pasó, el ticket no se entrega.
- Los `verify: manual`, marcados cuando quien prueba confirma el resultado —no antes—. Mientras no se hayan probado, quedan sin marcar y el ticket no está listo.
- Un criterio que dejó de aplicar **no se borra ni se marca en falso**: se dice por qué en la entrega, y si el alcance cambió, eso se resuelve en el plan.

Marcarlos es parte de entregar, como escribir los comandos exactos: es lo que permite leer un ticket cerrado dentro de un año y saber qué se comprobó.

## Informe y siguiente estado

Entregar un informe breve con:

- alcance revisado y evidencia disponible, incluida la referencia del cambio si existe;
- criterios verificados y riesgos que siguen pendientes;
- hallazgos bloqueantes y observaciones, **o una declaración explícita de que no se detectaron**;
- comandos exactos para el responsable, directorio, resultado esperado, validaciones manuales y requisitos de entorno.

Registrar la revisión y su evidencia en el ticket con el mecanismo del harness. Tras entregar las pruebas al responsable, el flujo queda en `awaiting_user_tests`; solo su resultado permite avanzar. No aprobar la validación mientras exista un punto abierto, en análisis, en curso o pendiente de retest.

La revisión **no opera Git por sí sola**. Tras una orden explícita de cierre ya probado, entregar la lista verificada de rutas para confirmar y enviar de forma selectiva.
