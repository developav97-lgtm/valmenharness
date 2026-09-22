---
name: desarrollo-agente-local
description: Usar al crear o modificar un agente o servicio que se instala en el equipo del cliente en vez de desplegarse en la nube. Cubre la escucha local, el instalador, la actualización y la reversión. No aplica a servicios en contenedores ni a código de navegador.
---

# Agentes y servicios locales

Aplica a los binarios y servicios que se ejecutan en el equipo de quien usa el producto. No aplica a servicios en la nube, cargas en contenedores ni código de navegador.

## De dónde sale el stack

Lenguaje, sistemas operativos en alcance y mecanismo de instalación salen de `.valmen/rules/stack.md` y de lo que ya exista en el repositorio. **No inventar el comportamiento del instalador a partir de otro agente**: cada uno puede tener su propio ciclo de vida, su gestor de servicios y sus permisos.

## Frontera de operación

- El servicio local **escucha solo en la dirección de bucle local** (`127.0.0.1`). No exponerlo en todas las interfaces por comodidad: es un servicio dentro del equipo de otra persona.
- Mantener explícitos la instalación por sistema operativo, el ciclo de vida del servicio, los permisos de archivos y los requisitos de reversión. Soportar los sistemas que de verdad estén en alcance.
- Preferir dependencias pequeñas y auditables, y conservar las convenciones del repositorio para configuración, registro de eventos, actualizaciones y gestión del servicio.
- Tratar la configuración local, los tokens, los metadatos de dispositivos o impresoras y los registros como **información sensible**. No dejar secretos en el código, los instaladores, la configuración de ejemplo, la evidencia del ticket ni la salida por consola.

## Comprobaciones de diseño obligatorias

Antes de implementar, establecer: plataformas soportadas, identidad del ejecutable, dónde vive la configuración y cómo migra, quién es dueño del puerto local, frontera de autenticación y origen, comportamiento de actualización, observabilidad y desinstalación.

**Estar en bucle local no es autorización.** El navegador solo debe hablar con el servicio previsto, y las peticiones se validan y se autorizan en vez de darlas por buenas porque vengan de la máquina.

Usar contratos versionados de petición y configuración cuando un agente ya desplegado pueda convivir con una versión anterior de la nube o del cliente. Definir el manejo de fallos para instalaciones interrumpidas, reinicio del servicio, hardware no disponible, pérdida de red, peticiones duplicadas y finalización parcial. **Toda operación reintentable tiene que ser segura ante efectos duplicados.**

## Compuerta humana y reversión

Un agente local es un **cambio crítico**. No implementar el agente, su instalador, un cambio de servicio, una migración de configuración ni el flujo de publicación hasta que exista un plan aprobado que cubra:

- sistemas operativos soportados y requisitos de instalación;
- compatibilidad hacia atrás y orden de actualización con la nube y el cliente;
- verificación en cada plataforma objetivo;
- una reversión recuperable, incluidos el binario y la configuración anteriores y la restauración del servicio;
- pasos visibles para quien instala: permisos, cortafuegos y recuperación.

**Nunca asumir el estado del equipo de un cliente**, su dirección de red, su gestor de servicios, sus certificados ni el runtime instalado. Obtener evidencia o una decisión explícita cuando afecte materialmente a la implementación.

## Entrega

Proporcionar los comandos exactos y el directorio de trabajo para cada plataforma objetivo, el resultado esperado, los privilegios necesarios, la verificación manual y los pasos de reversión. El ticket permanece en `awaiting_user_tests` hasta que el responsable reporte el resultado o registre explícitamente una omisión.
