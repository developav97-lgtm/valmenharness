# Diseño propuesto — Control portable de jornadas y ejecución

Fecha: 2026-10-01. Documento para revisión del alcance y futura descomposición.
No es un plan de implementación aprobado ni un contrato de comandos publicados.

## D1 — Un contrato común antes de integrar ejecutores

CLI, MCP y Mission Control consumen las mismas operaciones del motor. Hermes
es un adaptador opcional, no el propietario del registro ni del flujo de calidad.
Otro equipo puede ejecutar desde Claude Code, Codex, OpenCode o cualquier cliente
con terminal/MCP, sin tablero ni daemon. Un ChatGPT sin terminal o conexión MCP
al entorno requiere ese acceso antes de poder configurarlo; recibir un enlace
al repositorio no lo concede.

Tres modos independientes:

| Modo               | Qué permite                                 | Qué requiere                                         |
| ------------------ | ------------------------------------------- | ---------------------------------------------------- |
| Directo            | Trabajar un ticket y registrar su actividad | CLI o MCP autorizado                                 |
| Observación        | Agregar fuentes y mostrar su actividad      | Lectores habilitados; interfaz opcional              |
| Jornada automática | Elegir y despachar tickets elegibles        | Política autorizada y un ejecutor capaz de despachar |

El modo directo no necesita el tercero. Un lector de sesiones no se convierte
en ejecutor; instalar Hermes no habilita automáticamente sus capacidades.

Alternativa descartada: usar la base y los pasos internos de Hermes como contrato
del producto. Haría que un equipo sin Hermes no pudiera registrar actividad,
ataría las fases a un vocabulario externo y mezclaría calidad con despacho.

## D2 — Identidad y persistencia con fuentes separadas

Entidades propuestas:

| Entidad        | Identidad y relación                                                 |
| -------------- | -------------------------------------------------------------------- |
| Proyecto       | Identificador estable y contexto autorizado de su registro           |
| Máquina        | Ámbito de recursos y bindings locales; no equivale al proyecto       |
| Jornada        | Lista persistida, condiciones y revisiones; no es una sesión de chat |
| Ejecución      | Un trabajo sobre un ticket de un proyecto, con jornada opcional      |
| Intento        | Una corrida concreta, reintento o continuación asociada              |
| Sesión externa | Origen y ámbito propios; puede ser de solicitud o de ejecución       |
| Evento         | Identidad estable, intento, clase, fuente, tiempos y cursor          |

El contrato final de campos y almacenamiento se define en el análisis de sus
tickets. Se propone guardar el historial de ejecuciones bajo `.valmen/` por
proyecto, sin anexar cada heartbeat al `ticket.md`. El motor conserva el acceso
al disco, el lock y las validaciones existentes; el núcleo no toca red.

La configuración compartible usa referencias lógicas. Los bindings locales
resuelven raíces, perfiles, bases y máquina en el equipo de destino, sin versionar
secretos ni rutas del desarrollador. Sus permisos de lectura/escritura no se
deducen de los nombres. El mecanismo de declaración se coordina con el ticket
de portafolio para evitar dos catálogos incompatibles.

Se distingue origen ocurrido de recepción: una fuente retrasada no presenta el
instante de lectura como comienzo del trabajo. La fuente aporta idempotencia y
el motor genera orden persistido. El replay reconstruye la proyección sin modelo;
evento tardío no revierte el presente.

Alternativa descartada: reemplazar o sincronizar los historiales de tickets y
Hermes. Son registros con autoridades distintas y se perdería su procedencia.

## D3 — Estado validado, actividad y liveness

Se mantienen separados:

- Workflow/QA/release: autoridad del ticket y sus recibos.
- Actividad: señal de inicio/fin de análisis, plan, implementación, pruebas o
  entrega; procedencia directa, declarada o inferida visible.
- Ejecución: propiedad del intento, espera, liveness y terminación.

Los límites observables de herramientas y procesos publican hechos. Un cliente
sin hooks usa operaciones CLI/MCP explícitas; se identifica como declaración
del cliente y no como validación de su contenido. No hace falta un modelo para
adivinar la fase ni reinterpretar una aprobación.

Un plan terminado puede esperar aprobación; un worker terminado puede haber
entregado un ticket sin QA. Una sesión con `ended_at` vacío y actividad reciente
está activa. Una sesión abierta sin señales suficientes queda no confirmada,
no fallida automáticamente. Los umbrales siguen la frecuencia de cada fuente.

Los datos históricos conservan sus huecos: no se inventan horas, duraciones,
relaciones de sesión ni modelo efectivo. Tampoco se confunde `done` de una
tarjeta con cierre del ticket, QA o release.

## D4 — Adaptadores acotados y progresivos

| Fuente           | Base aprovechable                           | Trabajo o límite a resolver                                            |
| ---------------- | ------------------------------------------- | ---------------------------------------------------------------------- |
| CLI/MCP          | Motor, tickets, gates y lectores comunes    | Operaciones portables de ejecución y actividad                         |
| Hermes           | Tableros, task_events, task_runs y state.db | Ámbito explícito, sesión ejecutora, cursor y compatibilidad de esquema |
| OpenCode         | Lector de sesiones/timeline existente       | Capacidad disponible por versión; sin promesa de streaming universal   |
| Codex            | Lector de sesiones/timeline existente       | Misma declaración de límites; contexto explícito                       |
| Cliente genérico | Terminal o MCP del harness                  | Publicación explícita; integración automática futura si existe hook    |

Hermes se lee en solo lectura. Su campo `tasks.session_id` identifica la
conversación originadora, no garantiza el worker. La sesión ejecutora se enlaza
por una referencia verificable por intento; no por cercanía de hora/título.
El modelo efectivo procede de la sesión o del transporte, no del override
configurado en una tarjeta. Cambios de modelo y compactación conservan sus tramos.

La lectura de conversaciones es opcional y paginada, excluye secretos y campos
de pensamiento privado y no arrastra todo el historial al refrescar una fila.
Se muestra texto visible disponible, no una reproducción garantizada token a
token. El consumo conserva las reglas existentes para sesiones compartidas.

## D5 — Portafolio y selector con contexto por petición

La agregación de compuertas, procesos y consumo básico sigue en
`FEATURE-MC-PORTAFOLIO-PROYECTOS-20260926`. Esta feature añade selector y jornadas
sobre ese catálogo, sin redefinir R-S2-005 de `evolucion-harness`.

Cada petición se resuelve contra un proyecto declarado y autorizado. Ni el
último selector global del servidor ni una ruta arbitraria recibida del browser
pueden decidir el destino de una operación. Las respuestas tardías llevan su
contexto y revisión y se descartan en una vista que cambió de proyecto.

La implementación inicial reúne raíces locales en una instancia. Identidad y
disponibilidad admiten máquina remota; la conectividad autenticada se pospone
sin fingir que una ruta remota existe en el host actual. No se comparte registro
para conseguir una vista conjunta. Multi-proyecto no equivale a crear cuentas
de clientes ni a añadir un servicio público.

## D6 — Jornadas por disponibilidad y un dueño de despacho

La selección determinista compara prioridad, dependencias verificadas, permisos,
ventanas y recursos. La sesión originadora puede programar cinco tickets, pero
cada ejecución mantiene sus intentos y sesiones independientes.

Si A espera a la persona y C es independiente y está autorizado, C puede
continuar; B dependiente de A espera. No se agregan enlaces de dependencia solo
para serializar una máquina: la capacidad limita concurrencia, el grafo expresa
dependencia real. Finalizar a las 08:30 libera capacidad sin esperar otro cron.

Hay un único dueño del despacho para cada ámbito. Si se selecciona Hermes,
se integra su dispatcher y no se deja otro scheduler consumiendo las mismas
tarjetas. Las políticas del harness condicionan qué trabajo se ofrece; una
integración no puede saltar gates por marcar una tarjeta `ready`.

Capacidad persistida por máquina, reservas atómicas y reconciliación verificable
antes de recuperarlas. Un vencimiento solo no demuestra que un worker dejó de
escribir. Los procesos externos no integrados quedan fuera del control que se
promete; la guía y el diagnóstico lo advierten. El alcance de estos mecanismos
se coordina con S5, que conserva ejecución autónoma, elegibilidad, colisiones y
parada segura. La observación puede entregarse antes de esas capacidades.

Ventanas con zona horaria: al cerrar una no se lanzan más tickets, el activo
puede terminar y la siguiente espera recurso. No se mata automáticamente un
worker al cambiar del día a la noche. Para la Mac de referencia se propone un
worker total administrado; otros equipos pueden declarar otra capacidad.

## D7 — Un flujo de cambios con frescura por fuente

Se propone conservar SSE entre servidor y UI. Los lectores incorporan cambios
incrementales del registro, ejecuciones y adaptadores mediante cursores, con
foto de reconciliación cuando el cursor no sea válido. No se presupone que
`fs.watch` de `ticket.md` notifica cambios de SQLite, de su WAL o de otra máquina.
La estrategia de lectura de cada adaptador se decide tras medir su versión real.

La meta de menos de cinco segundos empieza cuando el cambio está disponible
para el lector, no cuando el agente todavía no lo publicó. Conexión del panel,
última lectura de fuente y heartbeat del worker son datos distintos. Una fuente
rota conserva la última foto con fecha y aviso. Los relojes de duración avanzan
localmente; no prueban que el agente sigue trabajando.

Filas y paneles se actualizan parcialmente, preservan selección, filtros y
scroll, sin perder entradas de una acción en curso. Dos proyectos locales y un
worker son el escenario de medición en la Mac de referencia; CPU/RAM/latencia
se registrarán en la entrega. No se añade una base de datos como servicio ni se
afirma un presupuesto de RAM no medido.

## D8 — Puesta en marcha guiada con capacidad real

Se extienden adopción, proyección, diagnóstico y documentación existentes. No
se diseña otro instalador obligatorio ni se aplica la configuración personal
del autor del harness. La guía futura ofrece tres entradas: CLI, MCP y Hermes.
Control visual, conversaciones, notificaciones y despacho se eligen aparte.

Prompts propuestos para la guía de entrega; no son comandos de implementación:

> Configura ValmenHarness en el proyecto que te indico para trabajar por CLI.
> Descubre primero el entorno y las reglas existentes, conserva lo que es del
> proyecto y usa los comandos de adopción/proyección del harness. Verifica el
> registro y el paso a paso con un ejemplo temporal. No instales Hermes ni
> habilites despacho o conversaciones. Informa cambios, resultados y pendientes.

> Configura el mismo flujo por MCP para mi cliente. Verifica que puedes acceder
> al entorno y que el cliente admite esa conexión. Usa el fragmento del harness
> y conserva los otros servidores. No declares conexión exitosa solo por crear
> archivos. Si falta acceso local o remoto, identifica ese requisito.

> Configura la integración opcional con Hermes para este proyecto y perfil.
> Conserva el registro del proyecto, verifica el binding y las capacidades que
> solicité y muestra qué podrá observar y ejecutar. No dupliques despachadores
> ni habilites permisos, notificaciones o exposición de red que no pedí.

En la entrega, cada ruta tendrá comandos exactos comprobados, requisitos de
ambiente, resultados esperados, recuperación y alcance de escritura. Los comandos
existentes de partida son `valmen adopt --dry-run`, `valmen adopt`, `valmen sync`,
`valmen sync --check`, `valmen doctor` y `valmen mcp`; las opciones de instalación
MCP o `valmen hermes connect --profile` se usan solo en la ruta elegida y dentro
del alcance autorizado. Esta documentación no los ejecuta contra otro proyecto.

Instalar el flujo no habilita autonomía. Cambios de credenciales, hosts permitidos
y gates mantienen sus decisiones humanas. Las comprobaciones usan un registro
temporal, y el diagnóstico diferencia capacidades no elegidas de elegidas pero
rotas. No se promete soporte de un cliente, versión o sistema no comprobados.

## D9 — Contexto del registro para el arquitecto

Relectura del registro el 2026-10-01. La persona autorizó generar el grafo:
«Dale si porfa pasemos a generar la descomposición». Posteriormente autorizó
materializar el grafo con «dale si materialicemos los tickets»; el resultado está
en `revision/materializacion.json`. Los planes de implementación siguen su
aprobación por ticket. Los tickets nuevos usan la fecha 20261001.

El formato exige que toda dependencia esté dentro del grafo. Cuando un ticket
nuevo consuma una responsabilidad existente, incluir su nodo con el ID y título
originales y su cierre transitivo de dependencias, sin crear sustitutos ni
cambiar su alcance. Esos nodos son reutilización, no nuevos tickets. No asignarles
cobertura completa de requisitos nuevos por el mero hecho de ser prerrequisitos.
Mantener separados los tramos de observación y despacho; solo el segundo espera
a ejecución autónoma y sus políticas. No incluir toda S5 si no se consume.

| ID existente                                         | Título original                                             | Estado | Dependencias originales                                                                    |
| ---------------------------------------------------- | ----------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------ |
| FEATURE-CLI-ADOPTAR-PROYECTO-20260926                | Implementar valmen adopt para proyectos nuevos              | closed | Ninguna                                                                                    |
| FEATURE-HERMES-PERFIL-PROYECTO-20260926              | Declarar cada proyecto como perfil MCP de Hermes            | closed | FEATURE-CLI-ADOPTAR-PROYECTO-20260926                                                      |
| FEATURE-ENGINE-ROLES-ENRUTAMIENTO-20260926           | Enrutar modelos por rol de ejecución                        | closed | Ninguna                                                                                    |
| FEATURE-GATE-CRITERIO-PLAYWRIGHT-20260926            | Aceptar el verbo playwright en criterios                    | closed | Ninguna                                                                                    |
| IMPROVEMENT-ENGINE-PRESUPUESTOS-ADAPTATIVOS-20260926 | Aprender costos típicos y declarar presupuestos por ticket  | closed | FEATURE-ENGINE-ROLES-ENRUTAMIENTO-20260926                                                 |
| FEATURE-MC-PORTAFOLIO-PROYECTOS-20260926             | Agregar portafolio de proyectos en Mission Control          | intake | FEATURE-CLI-ADOPTAR-PROYECTO-20260926, FEATURE-HERMES-PERFIL-PROYECTO-20260926             |
| FEATURE-CONFIG-PERFIL-UI-20260926                    | Configurar capacidades UI y modelo equilibrado por proyecto | intake | FEATURE-ENGINE-ROLES-ENRUTAMIENTO-20260926, FEATURE-GATE-CRITERIO-PLAYWRIGHT-20260926      |
| FEATURE-GATE-SPECS-REPOSITORIO-20260926              | Ejecutar specs de interfaz guardadas en el repositorio      | intake | FEATURE-GATE-CRITERIO-PLAYWRIGHT-20260926                                                  |
| FEATURE-GATE-VERIFY-DEV-20260926                     | Validar criterios de interfaz en ambiente dev               | intake | FEATURE-GATE-CRITERIO-PLAYWRIGHT-20260926, FEATURE-GATE-SPECS-REPOSITORIO-20260926         |
| FEATURE-CONFIG-ELEGIBILIDAD-AUTONOMA-20260926        | Declarar elegibilidad autónoma en configuración             | intake | FEATURE-CONFIG-PERFIL-UI-20260926, FEATURE-GATE-VERIFY-DEV-20260926                        |
| FEATURE-ENGINE-RUN-AUTONOMO-20260926                 | Ejecutar valmen run hasta awaiting_user_tests               | intake | FEATURE-CONFIG-ELEGIBILIDAD-AUTONOMA-20260926, FEATURE-GATE-VERIFY-DEV-20260926            |
| SECURITY-ENGINE-COLISIONES-ESCRITURA-20260926        | Detectar colisiones de escritura antes de paralelizar       | intake | FEATURE-ENGINE-RUN-AUTONOMO-20260926                                                       |
| SECURITY-ENGINE-PARADA-SEGURA-20260926               | Detener ejecuciones ante secretos o exceso de presupuesto   | intake | FEATURE-ENGINE-RUN-AUTONOMO-20260926, IMPROVEMENT-ENGINE-PRESUPUESTOS-ADAPTATIVOS-20260926 |

El perfil Hermes ya cerrado es un antecedente del portafolio, no un requisito de
instalación en otros equipos. Los tramos CLI/MCP deben comprobarse sin Hermes.

Los hallazgos de refresco/tablero, selección de sesiones sin cwd y clasificación
de sesiones abiertas se proponen como BUGFIX separados, con cobertura explícita
de frescura/aislamiento/liveness. El desacuerdo de versiones/raíces entre las
instancias locales y el retraso del propio Kanban de Hermes necesitan diagnóstico
operativo; no inventar su causa ni convertir una inspección local en despliegue.

Separar impactos de sincronización o migración real en su propio ticket y gate
humano si el diseño los requiere. No añadir funcionalidades ajenas para rellenar
sprints. La cobertura mecánica es necesaria pero la revisión también debe
comprobar que un requisito compuesto tiene tickets para todas sus partes.
