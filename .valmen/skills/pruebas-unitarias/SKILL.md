---
name: pruebas-unitarias
description: Usar al cambiar comportamiento de backend o frontend, corregir una regresión o preparar las pruebas de un ticket, y al armar la entrega verificable para el responsable.
version: 1.1.0
origen: valmen
---

# Pruebas

Diseñar o actualizar las pruebas de un cambio y preparar una entrega que otra persona pueda ejecutar. Partir de los criterios de aceptación, el riesgo y los archivos modificados del ticket.

La guía diseña y actualiza pruebas. **No** confirma cambios, no envía, no despliega y no modifica el estado de release.

## De dónde sale el stack

Las herramientas de prueba de este proyecto salen de `.valmen/rules/stack.md` y de lo que ya exista en el repositorio. **No introducir un ejecutor de pruebas nuevo, una fábrica de datos ni otra infraestructura sin ticket y plan**: la infraestructura de pruebas es una decisión del proyecto, no de quien escribe la prueba.

Localizar antes de escribir expectativas: dónde viven las pruebas, cómo se configuran, qué utilidades ya hay y qué convenciones usa el módulo. No asumir rutas, permisos ni esquemas.

## Prueba primero

Cuando el comportamiento pedido admite una prueba ejecutable y determinista, se escribe **antes** de implementar y se observa en rojo; después se implementa hasta verde y se refactoriza con las pruebas en verde.

- Una prueba en rojo por cada regla que pide el ticket, con los casos que esa regla nombra y sus efectos observables: salida, código de salida, datos persistidos.
- Una por cada comando, herramienta u opción existente que el cambio toca, que demuestre que su comportamiento anterior se mantiene.
- No se agregan otras. Si no hay prueba ejecutable posible, el ticket dice por qué y se corren las verificaciones funcionales que apliquen.

Una prueba que ya existía y se pone en rojo durante el cambio **no se edita, no se borra ni se omite** para que pase: se detiene la implementación y se reporta en el ticket la prueba, su salida y la hipótesis. Solo se modifica si el plan aprobado declara que el pedido cambia a propósito ese comportamiento, y el cambio se cita en el ticket.

## Diseño de pruebas

Cubrir el comportamiento observable que cambia, no la implementación incidental.

- Una corrección debe incluir un caso que **reproduzca el fallo previo** y el resultado esperado después del ajuste. Una prueba que pasa antes y después no prueba la corrección.
- Para interfaces de programación: autorización aplicable, respuesta válida e inválida, código de estado, contrato serializado y efectos persistidos.
- Para interfaz de usuario: el contrato del servicio, los estados relevantes y las interacciones visibles que cambien.
- **Simular solo los límites externos necesarios.** Reemplazar con dobles la lógica que se pretende comprobar convierte la prueba en una ilusión que pasa siempre.
- Incluir los límites que el ticket declare: datos vacíos, duplicados, permisos, errores de red, contexto equivocado o reintentos.
- Para sincronización, trabajo sin conexión, migraciones o agentes locales, derivar las pruebas de sus invariantes: compatibilidad hacia atrás, idempotencia, orden de eventos, claves naturales y ausencia de duplicados.

No ampliar una suite por intuición ni corregir fallos ajenos al ticket: documentarlos como riesgo o hallazgo del ticket que corresponda.

## Cobertura honesta

Una prueba que no puede fallar no cubre nada. Antes de darla por buena:

- Comprobar que **falla** si se revierte el cambio. Si sigue pasando, no está probando lo que dice.
- Preferir la prueba que ejerce el comportamiento real sobre la que verifica que se llamó a un método.
- No dejar casos marcados como pendientes ni aserciones comentadas.

## Entrega al responsable

Antes de pedir validación, registrar en el ticket qué se cubrió, los archivos de prueba y cualquier limitación. Entregar una lista ejecutable, **sin marcadores de posición**, con estos datos por cada prueba:

| Dato | Debe indicar |
|---|---|
| Directorio | Ruta exacta desde la que se ejecuta. |
| Comando | Comando completo, ajustado al módulo real. |
| Resultado esperado | Señal de éxito y comportamiento que confirma. |
| Validación manual | Pasos, datos, permisos y resultado visible. |
| Entorno | Servicios, datos o prerrequisitos necesarios. |

Al entregar este paquete el ticket pasa a `awaiting_user_tests`. La ejecución local aporta evidencia técnica, pero **no reemplaza el resultado comunicado por el responsable**. Con ese resultado se abre o actualiza el ciclo de validación; un fallo de la misma funcionalidad crea o actualiza su punto, con pruebas y retest propios.
