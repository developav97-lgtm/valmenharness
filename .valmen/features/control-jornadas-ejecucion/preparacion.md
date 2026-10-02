# Preparación de la revisión y descomposición

Fecha: 2026-10-01. Este mapa orienta al arquitecto; no es `tickets.yaml`, no
materializa tickets y no registra aprobación de planes, gates ni QA.

## Orden propuesto

| Prioridad   | Trabajo                                                       | Reutilización y alcance                                                                                 |
| ----------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| P0          | Diagnosticar instancias locales y frescura actual             | Diferencias de versión/raíz y conexión del Kanban de Hermes; no presuponer causa                        |
| P0          | Corregir integración de tablero/refresco y lector de sesiones | Incidencias separadas; vinculadas a los tickets cerrados de fases/timeline sin reescribir sus historias |
| P1          | Portafolio de proyectos                                       | Priorizar el ticket existente de R-S2-005; dependencias cerradas en la revisión del 1-oct               |
| P1          | Contrato CLI/MCP y contextos aislados                         | R-CON y R-PRO; permite uso directo desde cualquier agente con herramientas                              |
| P2          | Actividad, sesiones y cambios incrementales                   | R-ACT y transporte R-VIV; base portable antes del adaptador Hermes                                      |
| P2          | Selector y hoja de ruta de jornadas                           | R-PRO-001 y R-VIV; lectura útil sin dispatcher                                                          |
| P3          | Adaptador opcional Hermes y panel de mensajes                 | R-CON-005 y R-ACT; complementa el contrato, no lo sustituye                                             |
| P3          | Integración del despacho por disponibilidad                   | R-JOR; depende de permisos/capacidades existentes o pendientes de S5                                    |
| Transversal | Guía, diagnóstico y comprobación de adopción                  | R-ADO; CLI primero y escenarios con/sin Hermes comprobados antes de entregar                            |

La observación no espera a la automatización completa. Los requisitos de
despacho que dependan de S5 se planifican como integración con los tickets
existentes, no como una segunda implementación de `valmen run`.

## Referencias que deben mantenerse fuera de la duplicación

| Registro existente                                                                         | Responsabilidad que conserva                                                |
| ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| FEATURE-MC-PORTAFOLIO-PROYECTOS-20260926                                                   | Agregación básica de gates, procesos y consumo por proyecto                 |
| FEATURE-CLI-ADOPTAR-PROYECTO-20260926                                                      | Adopción del proyecto; cerrado                                              |
| FEATURE-HERMES-PERFIL-PROYECTO-20260926                                                    | Conexión MCP por perfil; cerrado                                            |
| Feature timeline-fases                                                                     | Historia derivada del workflow por ticket; sus siete tickets están cerrados |
| FEATURE-CONFIG-ELEGIBILIDAD-AUTONOMA-20260926                                              | Política de elegibilidad; pendiente                                         |
| FEATURE-ENGINE-RUN-AUTONOMO-20260926                                                       | Trabajo autónomo hasta entrega; pendiente                                   |
| SECURITY-ENGINE-COLISIONES-ESCRITURA-20260926                                              | Colisiones entre cambios; pendiente                                         |
| SECURITY-ENGINE-PARADA-SEGURA-20260926                                                     | Parada segura; pendiente                                                    |
| FEATURE-MC-POLITICAS-AUTONOMAS-20260926                                                    | Edición de políticas S5; pendiente                                          |
| FEATURE-ENGINE-REGLAS-INTEGRACION-20260926 e INTEGRATION-GIT-INTEGRACION-AUTONOMA-20260926 | Elegibilidad de integración y commit/push; pendientes                       |
| SECURITY-ENGINE-CIERRE-AUTORIZADO-20260926                                                 | Autoridad de cierre; pendiente                                              |

Los estados son una foto de investigación, no una agenda ni permiso para trabajar
esos tickets. Antes de descomponer se vuelve a leer el registro. Las dependencias
externas al grafo deben quedar explícitas conforme al formato admitido por el
motor; si hace falta anexar un ticket existente se utiliza el mecanismo del
harness después de revisar su responsabilidad, sin crear un duplicado.

## Base verificable de los hallazgos

- `packages/server/src/server.ts`: el watcher actual observa tickets y `.valmen/`;
  el endpoint de fases admite board y su default es `default`.
- `packages/server/web/index.html`: la banda consulta fases sin elegir board y
  consume la serie del registro.
- `packages/server/src/hermes.ts`: recorre bases de perfiles; un cwd ausente
  pasa la selección de proyecto y una sesión abierta se clasifica como fallida.
- `packages/server/src/timeline.ts`: lectores de Hermes, OpenCode y Codex ya
  existen; no equivalen a un feed completo de actividad en vivo.
- `packages/adapter/src/kanban.ts`: lectura de eventos de tableros, en solo lectura.
- `.valmen/features/evolucion-harness/spec/s2-multiproyecto/spec.md` y su
  `design.md`: portafolio por declaración y registros separados, incluida la
  posibilidad de máquinas distintas.
- `.valmen/features/evolucion-harness/spec/s5-autonomia/spec.md`: funciones de
  ejecución y políticas que no se deben duplicar.
- `.valmen/features/timeline-fases/`: historial por ticket, distinto a jornada.

La revisión previa también contrastó las APIs de las instancias locales, los
tableros y las bases por perfil. Es una foto temporal de ese ambiente, no una
regla que obligue a usar esos puertos ni un test de aceptación de esta feature.

En SaiOpenCloud, buscar memoria por Hermes encontró AP-005 en
`.valmen/memory/aprendizajes.md`: costo con procedencia real y sesiones
compartidas sin reparto inventado. R-ACT-004 conserva esa decisión. Las búsquedas
por Kanban/jornada no devolvieron antecedentes. No se modifica esa memoria.

## Matriz de validación que deberá cubrir el grafo

| Caso                                                    | Resultado exigido                                                  |
| ------------------------------------------------------- | ------------------------------------------------------------------ |
| CLI sin Hermes ni servidor UI                           | Registrar y consultar un intento con el flujo existente            |
| CLI y MCP sobre el mismo proyecto                       | Identidades, hechos y validaciones equivalentes                    |
| Dos proyectos con IDs de ticket iguales                 | Sin mezcla de estados, sesiones, consumo ni destinos de escritura  |
| Sesión sin cwd, perfil vinculado o sin atribuir         | Asociación explícita o ausencia declarada                          |
| Ejecución manual sin jornada                            | Actividad observable sin tarjeta externa                           |
| A esperando, B dependiente y C independiente autorizado | C puede continuar y B espera                                       |
| Fin temprano, ventana abierta                           | Siguiente elegible por disponibilidad                              |
| Cruce de medianoche, capacidad uno                      | Respeto de ventanas sin matar el trabajo activo                    |
| Reinicio y reserva en disputa                           | Sin doble despacho de ejecuciones administradas                    |
| Desbloqueo en una fuente con panel conectado            | Cambio visible dentro de la meta medida de cinco segundos          |
| Caída, replay y cursor vencido                          | Reconciliación sin duplicados ni retrocesos                        |
| Modelo configurado distinto al efectivo                 | Datos separados y fuente explícita                                 |
| Sesión compartida o costo desconocido                   | Sin consumo inventado o duplicado                                  |
| Agente de otro equipo con terminal o MCP                | Guía operable, cambios preservados y comprobación temporal         |
| Capacidad no elegida o elegida pero rota                | Diagnóstico distinto, sin éxito ficticio                           |
| Mac M1 de 8 GB, dos proyectos y un worker               | Memoria/CPU/latencia medidas; no promesa de recursos sin evidencia |

Las pruebas mecánicas y manuales se convertirán en criterios anotados de cada
ticket cuando se materialice. Los escenarios de estas specs no se marcan como
verificados por haber sido escritos.

## Validación de la preparación inicial

Comprobaciones realizadas el 2026-10-01 sobre estos documentos:

- `readFeature` del motor leyó el frontmatter sin errores: `draft`, spec y diseño
  presentes, sin grafo ni evidencia de implementación.
- `readSpecs` reconoció los 35 encabezados normativos de seis dominios: contrato
  6, proyectos 5, jornadas 6, actividad 6, actualización 6 y adopción 6.
- Una comprobación estructural adicional contrastó cantidad de encabezados con
  el parser, IDs únicos en toda la feature y presencia de Scenario/GIVEN/WHEN/THEN
  en cada requisito. Resultado: sin omisiones ni duplicados.
- El comando inicial de Prettier terminó con código 0, pero `.prettierignore`
  excluye `*.md`: ese resultado no verificaba el formato de los Markdown.
  La revisión posterior usa un ignore vacío y conserva los encabezados de
  requisitos en una sola línea.
- Revisión de alcance: las specs diferencian lectura de despacho, dato declarado
  de validación, sesión originadora de ejecutora y binding local de política
  compartida. Conservan los responsables existentes de portafolio y S5.

Esto valida la preparación documental, no el cumplimiento del producto futuro.
No se ejecutó la suite funcional ni se probaron escenarios de ejecución: no hay
cambio de código en esta sesión. No se usaron estos resultados para cerrar tickets.

## Próximo paso

El usuario autorizó generar la descomposición después de esta preparación.
Se ejecutó el arquitecto y se revisó el grafo: el resultado y sus comprobaciones
están en [revision-descomposicion.md](revision-descomposicion.md). Posteriormente
el usuario autorizó materializar: se crearon los 37 faltantes en `intake`, según
[revision/materializacion.json](revision/materializacion.json). Sigue el análisis
y la planificación de los elegibles. Esta documentación no aprueba implementación
ni registra una QA del producto.
