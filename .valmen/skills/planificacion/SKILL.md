---
name: planificacion
description: Usar antes de implementar un ticket, o cuando se pida diseñar, revisar o ajustar su plan. Aplica a funcionalidades, errores, mejoras, sincronización, integraciones, seguridad y cambios de despliegue o runtime.
---

# Planificación

Producir un plan proporcional y verificable dentro de la sección `## Plan` del ticket. Planificar no autoriza implementar, crear migraciones, desplegar ni operar Git.

## De dónde sale el stack

Este plan vale para cualquier proyecto porque **no lleva el stack escrito dentro**. Las versiones, los servicios y las convenciones salen de:

1. `.valmen/rules/stack.md` — el stack que este proyecto declara.
2. Las reglas bajo `.valmen/rules/` que apliquen al impacto del ticket.
3. Los archivos reales del repositorio, que son la última palabra.

Si una regla contradice lo que hay en el código, gana el código y la regla se corrige. Confirmar rutas y versiones en los archivos reales antes de proponer dependencias o comandos: un plan que asume una versión sin comprobarla produce un paso que falla al ejecutarse.

## Fuentes y límites

Leer `AGENTS.md`, las reglas del proyecto y el ticket completo. Si la solicitud es solo una revisión, informar en modo de solo lectura: **no crear ni modificar tickets por inferencia**. La identidad del ticket se resuelve antes de cualquier escritura.

No asumir hosts, direcciones, imágenes, versiones de runtime, credenciales ni estado de entornos. Un dato operativo no confirmado queda como dependencia pendiente, no como comando ejecutable supuesto.

## Investigación previa

- Preservar problema, usuario afectado y comportamiento actual y esperado. Identificar archivos, quién llama a qué y el flujo real, con búsquedas acotadas. **Separar evidencia de hipótesis** y anotar las decisiones que siguen pendientes.
- Clasificar tipo e impactos según las reglas del proyecto. Un cambio de tipo sencillo puede tocar un componente crítico: **no reducir la compuerta cambiando la clasificación**.
- Mantener los hallazgos de la misma funcionalidad como puntos del ticket, sin renumerar ni reutilizar identificadores.
- Relacionar cada paso, criterio de aceptación y prueba con el punto que lo origina.

## Contenido del plan

Pasos concretos y ordenados, no una lista de componentes genérica. Un error pequeño puede requerir dos pasos reales —corrección dirigida y prueba de regresión—; una integración necesita contratos y orden de despliegue.

| Sección del ticket | Contenido requerido |
|---|---|
| Diagnóstico | Flujo y archivos comprobados, causa o hipótesis, impactos, riesgos y supuestos. |
| Plan | Alcance y exclusiones; pasos con archivos y responsable; dependencias; qué compuerta aplica; compatibilidad, orden de despliegue y reversión según el riesgo. |
| Criterios de aceptación | Resultados observables por flujo y por punto, incluidos permisos, aislamiento y errores pertinentes. |
| Pruebas | Comandos exactos, directorio de ejecución, resultado esperado, comprobaciones manuales y requisitos de entorno. |

Un anexo extenso puede vivir junto al ticket y quedar enlazado desde `## Plan`; el alcance y la aprobación permanecen en el ticket. Añadir pseudocódigo cuando aclare orden de eventos, transacciones, reintentos o ramas de negocio. Una omisión de pseudocódigo no omite la compuerta del plan.

## Controles por impacto

Esta tabla es el corazón de la skill: dice qué tiene que estar resuelto **antes** de implementar. Ajustar los nombres a los del proyecto; los impactos son los del contrato del harness.

| Impacto | Debe quedar resuelto antes de implementar |
|---|---|
| Aislamiento entre inquilinos o clientes | Contexto correcto, separación de datos, permisos y pruebas entre inquilinos. |
| Sincronización o trabajo sin conexión | Clave natural real, regla de resolución de conflictos, operación idempotente, compatibilidad de contratos, orden de eventos, acuse de recibo, reconexión, colisión de identificadores, ausencia de duplicados y reversión. |
| Operaciones masivas que disparan señales | Mecanismo vigente del proyecto; localizarlo antes de usarlo, no inventar un ayudante. |
| Integraciones o canales en tiempo real | Contratos existentes, errores y reintentos, compatibilidad, orden de despliegue, pruebas de integración y reversión. |
| Agentes o servicios locales | Instalación y actualización, permisos, contrato entre local y nube, escucha solo en dirección local, pruebas aplicables y reversión. |
| Contenedores o migraciones | Copia verificable, despliegue gradual, compatibilidad con datos y clientes existentes, pruebas, orden de despliegue y reversión **antes** de mutar. |
| Autenticación o seguridad | Alcance explícito, permisos, regresión y revisión de seguridad. La deuda fuera de alcance exige otro ticket con su aprobación. |
| Entrega o despliegue | Simulación previa, ramas y remotos, diferencia entre entornos, versión, manifiesto, tickets, compuertas, pruebas, artefactos inmutables y reversión. |

No introducir secretos ni valores de respaldo en planes, ejemplos o evidencia. No modificar listas de hosts permitidos como parte de un cambio funcional.

## Aprobación y transición

Todo ticket necesita plan. La aprobación explícita del responsable es obligatoria cuando el tipo o el impacto la exigen según las reglas del proyecto, y **siempre** ante aislamiento de datos, sincronización, agentes locales, contenedores, migraciones, seguridad o despliegue, cualquiera que sea el tipo declarado.

Presentar alcance, pasos, criterios, pruebas y riesgos. Si hace falta aprobación, **detenerse en `planned` y pedirla**. No interpretar el silencio, la urgencia, una herramienta exitosa ni una aprobación anterior de distinto alcance como autorización del plan actual.

Solo tras recibirla, registrar en `## Plan` la línea de aprobación explícita con fecha, alcance y referencia a la confirmación real. Si la compuerta no se exige, registrar la razón concreta. Esa excepción **no aplica a los impactos críticos**: pasar la validación mecánica no demuestra autorización.

Mover el estado con el harness, no editando el campo a mano: un salto que la tabla del contrato no permite se rechaza. Preservar el historial de aprobaciones al ajustar el plan; un cambio material necesita aprobación renovada antes de implementar.

## Handoff

Entregar el identificador y la ruta del ticket, el plan vigente, el estado de la compuerta, quién es responsable de qué, el orden de trabajo, las pruebas y las decisiones pendientes. **Delegar no amplía los archivos ni las acciones aprobadas.**

El plan debe prever la entrega posterior: comandos, directorio, resultado esperado, validaciones manuales y requisitos de entorno. Las pruebas locales no sustituyen la confirmación del responsable ni una omisión explícita y documentada. No incluir confirmaciones, envíos, etiquetas ni despliegues automáticos como pasos de implementación: cada entrega queda sujeta a las compuertas del proyecto.
