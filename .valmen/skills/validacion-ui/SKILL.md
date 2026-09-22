---
name: validacion-ui
description: Usar para diseñar, revisar o registrar la validación visual y funcional de una pantalla, con evidencia reproducible asociada al ticket y a sus criterios de aceptación.
---

# Validación de interfaz

Diseñar, revisar o registrar la validación de una pantalla. La validación se asocia al ticket y a sus criterios de aceptación: **no basta una inspección de código ni una captura aislada**.

No introducir una librería visual nueva ni convertir la validación en autorización de confirmación, despliegue o cierre de ticket.

## De dónde sale el stack

La plataforma —framework, librería de componentes, sistema de diseño— y las convenciones visuales salen de `.valmen/rules/stack.md` y de lo que ya use el área que se revisa. **Conservar el patrón existente del módulo** en vez de introducir el propio: se reutilizan los componentes y patrones que ya hay antes de crear otros, y no se mezclan dos sistemas visuales dentro del mismo control.

Si el flujo muestra importes, números o fechas, usar el formato regional que el proyecto declare.

## Base de la revisión

- Evaluar el flujo con el inquilino, permiso y datos de prueba adecuados. **Nunca incluir credenciales ni datos sensibles en la evidencia.**
- Comparar el comportamiento con el criterio de aceptación, no con una suposición sobre cómo debería verse.
- No codificar identificadores de inquilino, rutas de producción ni nombres de esquema en la validación ni en la evidencia.
- Si la pantalla configura una función que el cliente usa, esa configuración necesita interfaz utilizable. Un panel de administración interno no reemplaza la pantalla del cliente.

## Recorrido mínimo

Adaptar el recorrido al cambio y registrar los pasos exactos. Como mínimo, verificar lo que aplique:

- acceso, permisos y aislamiento entre inquilinos o clientes;
- **carga, vacío, error recuperable y éxito** de las operaciones asíncronas;
- creación, edición, cancelación y confirmación de las acciones afectadas;
- validaciones visibles, mensajes comprensibles y **preservación de lo escrito cuando algo falla**;
- navegación por teclado, foco visible, etiquetas y nombres accesibles, y contraste suficiente;
- comportamiento en los tamaños de pantalla en los que el flujo se usa de verdad;
- compatibilidad visual y de interacción con los controles que ya usa el módulo.

El error recuperable es el que más se omite y el que más se nota en producción: comprobar que la pantalla **dice qué pasó y deja reintentar**, en vez de quedarse en blanco.

## Evidencia en el ticket

Por cada ejecución, anexar evidencia al ticket **sin sobrescribir ciclos previos**. La entrada tiene que poder reproducirse e incluir:

- identificador de validación o retest, fecha, entorno y datos de prueba seguros, y referencia exacta del build o del cambio revisado;
- pasos efectuados, resultado esperado y resultado observado;
- captura, vídeo, salida de prueba o referencia accesible, descrita con suficiente detalle;
- el punto asociado cuando sea un hallazgo, con archivos afectados, severidad, prueba y retest previstos.

Una validación exitosa en local **no equivale a la aceptación del responsable**. Al entregar el recorrido, los comandos y los requisitos de entorno, el ticket pasa a `awaiting_user_tests`; el resultado que esa persona comunique abre o actualiza la validación. Un punto deja de bloquear solo tras el retest y su registro.
