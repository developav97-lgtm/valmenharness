---
name: desarrollo-backend
description: Usar al modificar comportamiento del servidor, contratos de programación, acceso a datos, migraciones o integraciones. Preserva el aislamiento entre clientes y la compatibilidad con lo que ya está desplegado.
---

# Desarrollo de backend

Implementar el cambio en el módulo que es dueño del dominio, preservando el aislamiento entre clientes y la compatibilidad con lo que ya está en producción.

## De dónde sale el stack

Framework, versión del lenguaje, motor de base de datos y estrategia de multi-inquilino salen de `.valmen/rules/stack.md`. **La versión del runtime de producción se toma del artefacto de despliegue vigente** —el contenedor o el manifiesto de la plataforma—, no de la documentación ni de un entorno local: inferirla de ahí es una de las formas más comunes de proponer un cambio que no arranca.

Confirmar rutas y versiones en los archivos reales antes de proponer dependencias o comandos.

## Aislamiento entre clientes

Antes de tocar datos, identificar **cómo establece su contexto** la petición, el comando, la tarea o el trabajo que se esté modificando.

- Nunca codificar identificadores de inquilino, nombres de esquema ni enrutar datos por la conexión equivocada.
- Consultar solo después de que el contexto esté fijado, y acotar accesos, permisos y consultas relacionadas a ese contexto.
- Revisar las rutas de listado, detalle y exportación, que son donde una fuga entre clientes pasa desapercibida.
- Los metadatos de los inquilinos viven donde el proyecto los declare —normalmente un esquema compartido— y no mezclados con los datos de cada uno.

## Cambios en el contrato

Un contrato publicado tiene consumidores que no se despliegan al mismo tiempo que el servidor.

- Añadir es compatible; **cambiar el significado o quitar no lo es** sin una transición.
- Mantener el comportamiento hacia atrás durante la ventana de despliegue, y prever el orden: primero lo que tolera lo viejo, después lo nuevo.
- Los errores también son contrato: código, forma y mensaje que el cliente ya interpreta.

## Acceso a datos

Usar consultas normales del ORM del proyecto después de fijar el contexto. Cargar las relaciones que de verdad se van a usar en lugar de provocar consultas por elemento. No asumir que un identificador numérico es una identidad de negocio portable: si el proyecto declara claves naturales, esas son la identidad.

## Sincronización y trabajo sin conexión

Tratar todo cambio de sincronización como crítico.

- Las claves naturales son la identidad para insertar o actualizar. **Nunca usar el identificador local como identidad de sincronización.**
- Respetar la regla de resolución de conflictos que el proyecto declare, y que las operaciones sean idempotentes ante reintentos y no produzcan duplicados.
- Considerar orden de eventos, acuse de recibo, reconexión, colisión de identificadores locales y compatibilidad hacia atrás **antes** de cambiar un formato de mensaje o su manejador.
- Si una operación masiva omite señales, usar el mecanismo vigente del repositorio y no saltarse los guardas que ya existan.

Ante sincronización, migraciones, contenedores, autenticación o despliegue: **detenerse antes de implementar** salvo que el plan aprobado cubra explícitamente compatibilidad, idempotencia, orden de despliegue y reversión. Las migraciones exigen además copia verificable y despliegue gradual.

## Entrega

Mantener la compatibilidad con los clientes activos. Documentar las decisiones arquitectónicas relevantes solo cuando formen parte del ticket asignado. Al entregar, proporcionar los comandos exactos de verificación, su directorio, el resultado esperado, el entorno necesario y las comprobaciones manuales; el ticket permanece en `awaiting_user_tests` hasta que el responsable reporte el resultado o documente explícitamente una omisión.
