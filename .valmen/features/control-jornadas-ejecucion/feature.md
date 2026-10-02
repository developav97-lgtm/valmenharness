---
schema_version: 2
id: control-jornadas-ejecucion
title: Control portable de jornadas y ejecución en vivo
state: decomposed
created: 2026-10-01
updated: 2026-10-01
---

# Control portable de jornadas y ejecución en vivo

## Problema

El responsable programa varios tickets para que avancen hasta necesitar su
intervención. Hoy consulta el Kanban de Hermes, Telegram y un Mission Control
por proyecto para reconstruir qué corre. Los avisos y las pantallas pueden
mostrar momentos distintos. `timeline-fases` permite leer el historial de un
ticket, pero falta la hoja de ruta de toda la jornada.

El estado validado tampoco describe toda la actividad: `analyzed` dice que el
análisis terminó, no cuándo empezó. Un worker vivo, uno esperando aprobación y
uno detenido necesitan distinguirse sin preguntarle al modelo.

El primer uso reúne SaiOpenCloud durante el día y ValmenHarness por la noche,
en una Mac M1 con 8 GB de RAM. El producto también se entrega a otros equipos:
el usuario menciona un compañero que lo adoptará en el proyecto RP. Sus agentes,
sistemas operativos, rutas y ejecutores pueden ser diferentes. Hermes no puede
ser una dependencia obligatoria del flujo ni de su observación.

## Objetivo

Ofrecer una vista de proyectos, jornadas y actividad actual con un contrato
común desde CLI, MCP y Mission Control. Cualquier agente con acceso a una de
esas superficies podrá seguir el paso a paso. La automatización y la lectura
de conversaciones se agregan mediante capacidades opcionales.

La persona podrá saber qué está programado, cuándo puede empezar, cuándo
comenzó realmente, en qué actividad va, qué lo detiene, cuál puede continuar y
qué modelo ejecuta cada intento cuando el dato esté disponible. Podrá cambiar
de proyecto sin abrir otro Mission Control.

## Alcance

- Dentro:
  - Contrato portable de proyecto, jornada, ejecución, intento y actividad por
    CLI/MCP, con ejecución directa aunque no haya jornada ni tablero.
  - Estado validado, actividad actual y estado del proceso como datos separados.
  - Selector de proyectos y vista conjunta con registros y permisos aislados.
  - Hoja de ruta: orden, dependencias, inicio programado o condicionado, inicio
    real, fases, espera, reintentos y finalización.
  - Continuación con otro ticket independiente y autorizado cuando uno espera
    intervención; los dependientes permanecen detenidos.
  - Ventanas por proyecto y capacidad compartida por máquina; se propone un
    worker administrado activo para el primer caso, sin imponerlo a otros equipos.
  - Actualización incremental, recuperación y frescura explícita por fuente.
  - Adaptador opcional de Hermes y uso de lectores existentes de OpenCode/Codex
    según sus capacidades reales; panel de herramientas y mensajes visibles.
  - Configuración guiada para personas y agentes: CLI, MCP y Hermes opcional,
    diagnóstico verificable y cambios repetibles que preserven lo existente.
- Fuera de esta primera entrega:
  - Sustituir Hermes por Paperclip u otro ejecutor; proveedor obligatorio de
    modelos, notificaciones o colas; transmisión garantizada de cada token.
  - Mostrar pensamiento privado o habilitar telemetría externa obligatoria.
  - Servicio público, usuarios/clientes comerciales y autenticación entre
    máquinas. El contrato contempla máquina remota; su conexión requiere alcance
    y autorización propios, sin compartir registros ni asumir rutas locales.
  - Habilitar por defecto autonomía, cierres, commits, releases o despliegues.
  - Reimplementar `valmen run`, elegibilidad, colisiones y políticas de S5.
  - Configurar ahora RP, SaiOpenCloud u otra máquina; despachar trabajo o implementar
    los tickets sin sus análisis, planes y aprobaciones correspondientes.

## Restricciones

- Hermes, Mission Control, notificaciones y despachador son opcionales. CLI/MCP
  conservan el esquema de estados, evidencias y calidad del software.
- Observar no otorga permiso para ejecutar ni aprobar. Aprobar el alcance no
  aprueba los planes de los futuros tickets ni relaja gates existentes.
- Cada proyecto conserva `.valmen/`, registro y políticas. Coincidir en nombre,
  ticket o prefijo de ruta no concede acceso al otro.
- El estado persistido manda: eventos nuevos append-only; historiales,
  recibos y bases de terceros no se reescriben para construir la vista.
- Arquitectura TypeScript existente; particularidades del ejecutor en adaptadores,
  sin dependencias obligatorias nuevas en el núcleo.
- Dato ausente se declara: hora no medida, conversación no disponible, modelo
  efectivo desconocido o fuente desactualizada; no se rellena con un modelo.
- Consumo con procedencia real; una sesión compartida no se reparte por estimación.
- Nada de rutas personales, puertos, perfiles locales o credenciales del
  desarrollador como configuración obligatoria del producto.
- Español y valores del tema en todo lo visible.

## Autorización y decisiones recibidas

El 2026-10-01 el usuario autorizó preparar el registro de esta propuesta:

> «Yo aprobaría que empieces a preparar el brief y las especificaciones.»

Precisó la portabilidad:

> «si ellos no van a manejar Hermes sino que van a ejecutar directamente,
> también lo puedan hacer.»

> «tanto codes como ChatGPT o cualquier otro arnés de desarrollo pueda utilizar
> el CLI y pueda utilizar el mismo esquema de paso a paso».

Sobre un ticket esperando intervención respondió:

> «Sí, continuar con el siguiente independiente».

Los clientes son ejemplos, no instalaciones obligatorias. Acceso a terminal o
MCP es una condición real del ambiente; un chat sin herramientas no puede
configurar una máquina por recibir el repositorio.

La preparación inicial dejó brief, specs y diseño en `draft`. Posteriormente
el usuario autorizó el siguiente paso:

> «Dale si porfa pasemos a generar la descomposición».

Esta autorización permite generar y revisar el grafo con el arquitecto. No
aprueba planes de implementación ni materializa los tickets nuevos.

## Relación con el trabajo existente

- `evolucion-harness`, R-S2-005 y
  `FEATURE-MC-PORTAFOLIO-PROYECTOS-20260926`: conservar su agregación básica;
  esta feature añade contexto de navegación y ejecución, sin duplicar portafolio.
- `timeline-fases`: reutilizar historia por ticket; agregar actividad actual y
  jornadas sin redefinir el workflow.
- Ola S5 de `evolucion-harness`: consumir ejecución autónoma, elegibilidad,
  colisiones, parada segura e integración cuando estén implementadas. La lectura
  no espera a que toda S5 esté lista ni habilita sus permisos.
- Adopción y perfiles MCP construidos: ampliar instrucciones y diagnóstico.
- Correcciones propuestas: refresco/selección de tablero, aislamiento de sesiones
  y distinción entre sesión abierta y fallida. Registrar aparte al revisar el
  grafo; no depender de las lecturas defectuosas.

La diferencia entre las instancias locales de Mission Control y el retraso del
Kanban propio de Hermes requieren diagnóstico operativo específico; no son
causas resueltas por esta documentación.

## Artefactos

- `spec/contrato/spec.md` — CLI/MCP, identidad, eventos y capacidades.
- `spec/proyectos/spec.md` — aislamiento, selector y configuración por máquina.
- `spec/jornadas/spec.md` — orden, dependencias, ventanas y despacho opcional.
- `spec/actividad/spec.md` — fases, sesiones, herramientas y modelos.
- `spec/actualizacion/spec.md` — eventos, reconexión, frescura y recursos.
- `spec/adopcion/spec.md` — puesta en marcha por persona o agente.
- `design.md` — alternativas, arquitectura propuesta y límites de integración.
- `preparacion.md` — prioridades y trazabilidad para futura descomposición.
- `tickets.yaml` — grafo revisado y autorizado para materializar el 2026-10-01.
- `revision/tickets-arquitecto.yaml` — salida inicial conservada del arquitecto.
- `revision-descomposicion.md` — tramos, ajustes, cobertura y comprobaciones.
- `verify.md` — pendiente de implementación y evidencia real.

## Resultado de la descomposición

El arquitecto configurado generó el grafo el 2026-10-01. Tras revisión técnica,
la propuesta contiene 37 tickets nuevos y 13 reutilizados (cinco cerrados y ocho
en intake), con cobertura de los 35 requisitos y sin ciclos. Se conserva la
salida inicial y se explican los ajustes en `revision-descomposicion.md`.

El estado `decomposed` indica la existencia del grafo, no aprobación de planes.
Al terminar la descomposición aún no se habían materializado los tickets.
La autorización y el resultado de esa etapa posterior se registran a continuación.

## Materialización autorizada

El 2026-10-01 el usuario autorizó el grafo para crear sus tickets:

> «dale si materialicemos los tickets».

Se ejecutó `valmen feature materialize control-jornadas-ejecucion`: 37 tickets
nuevos creados en `tickets/2026/`, todos en `intake`, con QA pendiente y release
sin publicar. Se reutilizaron 13 tickets sin modificar sus bytes ni estados.
El índice se actualizó y cada ticket nuevo enlaza feature, grafo, límites y specs
completas, con sus dependencias y criterios derivados de la cobertura.

Se comprobaron esquema, estado, criterios, dependencias, enlaces e índice. Una
consulta de materialización sin escritura posterior propone cero altas y reconoce
los 50 nodos existentes. El recibo está en
[revision/materializacion.json](revision/materializacion.json).

La feature sigue en `decomposed`: ningún ticket nuevo comenzó implementación.
La autorización crea el registro; cada ticket continúa con análisis, plan y
aprobación humana según sus dependencias. No se programaron jornadas ni workers,
se modificó código o se crearon commits.
