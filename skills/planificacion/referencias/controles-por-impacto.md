# Controles por impacto

Esta tabla dice qué tiene que estar resuelto **antes** de implementar. Ajustar los nombres a los del proyecto; los impactos son los del contrato del harness.

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
