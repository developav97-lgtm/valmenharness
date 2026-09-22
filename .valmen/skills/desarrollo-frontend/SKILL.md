---
name: desarrollo-frontend
description: Usar al crear o modificar una pantalla, componente, servicio, guarda o modelo de la interfaz, o al ajustar el contrato que consume. Respeta los patrones visuales y la configuración del proyecto.
---

# Desarrollo de interfaz

Implementar o modificar una pantalla, componente o contrato de la interfaz respetando los patrones que el proyecto ya usa.

## De dónde sale el stack

Framework y versión, librería de componentes, sistema de estilos, gestor de estado y configuración del compilador salen de `.valmen/rules/stack.md`. **No introducir un framework, una librería de componentes ni una migración de versión como parte de un cambio funcional**: eso es otro ticket, con su plan y su aprobación.

Si el proyecto declara configuración estricta del compilador, **no relajarla** para que compile un cambio funcional. Un cambio que necesita bajar el nivel de exigencia del compilador está señalando un problema en el cambio.

## Antes de cambiar código

1. Localizar la pantalla, el módulo, las rutas, los servicios y las pruebas existentes, y conservar la organización y convenciones que ya use esa funcionalidad.
2. Identificar el contrato del servidor y, cuando aplique, el canal en tiempo real, el almacenamiento local o el servicio del navegador que intervengan. Un cambio de carga útil, autenticación u orden de eventos tiene que ser compatible con sus consumidores existentes.
3. Confirmar el contexto del cliente y los permisos del flujo, sin codificar identificadores ni direcciones de producción.
4. Si se agrega configuración funcional para un cliente, localizar o diseñar su pantalla. **Un panel de administración interno no es la pantalla del cliente**: si no hay interfaz utilizable, esa configuración no está lista.

Si no hay un sitio razonable para una configuración nueva, detenerse y pedir la decisión en vez de dejarla solo en el panel interno.

## Criterios de implementación

- Tipar los contratos reales y **no añadir `any` nuevo** cuando el tipo se pueda expresar. Mantener entradas y salidas coherentes con el contrato que las consume.
- Mantener el ciclo de vida de suscripciones, temporizadores y escuchas que requieran limpieza. Una suscripción sin cancelar es una fuga que aparece al navegar entre pantallas.
- Reutilizar componentes, servicios y patrones visuales existentes antes de crear otros. Elegir un solo sistema visual por control, sin mezclarlos de forma arbitraria.
- Mantener los estados de carga, error, vacío y éxito cuando la operación sea asíncrona, y que los mensajes sean comprensibles para quien opera el producto.
- Preservar la accesibilidad: etiqueta asociada, nombre accesible en los iconos, foco por teclado, error relacionado con su campo y contraste suficiente.
- Conservar la operatividad en los tamaños de pantalla que el producto ya admite, incluidos tableta o móvil cuando el flujo se use ahí.
- Usar el formato regional que el proyecto declare para importes, números y fechas.
- No dejar trazas de depuración ni datos sensibles en el código entregado.

## Entrega

Registrar en el ticket los archivos y contratos afectados, las decisiones de compatibilidad y las pruebas previstas. Al terminar, entregar:

- comandos de prueba exactos y el directorio desde el que se ejecutan;
- resultado esperado, datos de prueba y requisitos de entorno;
- recorrido manual de la pantalla, incluidos permisos, estados de error y comportamiento en los tamaños admitidos.

El ticket pasa a `awaiting_user_tests` después de esa entrega. Una compilación o prueba local **no sustituye el resultado comunicado por el responsable**. Los hallazgos de la misma funcionalidad se registran como puntos y conservan su evidencia y su retest en el ticket.
