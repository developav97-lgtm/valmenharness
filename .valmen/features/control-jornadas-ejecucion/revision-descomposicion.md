# Revisión de la descomposición — Control portable de jornadas

Fecha: 2026-10-01. Grafo autorizado por la persona para materializar;
los planes de implementación y la agenda de ejecución son etapas posteriores.

## Resultado

El arquitecto configurado, `opencode-go/kimi-k3`, generó la propuesta mediante
`valmen feature decompose control-jornadas-ejecucion`. La propuesta inicial tiene
47 nodos: 34 nuevos y 13 reutilizados, agrupados en siete tramos. Se conserva
íntegra en [revision/tickets-arquitecto.yaml](revision/tickets-arquitecto.yaml).

La revisión ajustó esa propuesta: **50 nodos, de los cuales 37 se materializaron
en esta etapa y 13 se reutilizaron**. Cinco de los existentes están cerrados y ocho en
`intake`. Esos cinco son antecedentes, no trabajo para volver a ejecutar.
El grafo vigente está en [tickets.yaml](tickets.yaml), con 35/35 requisitos
cubiertos, sin ciclos ni referencias a dependencias ausentes.

La feature está en `decomposed`, que significa que existe el grafo. Los 37 nuevos
ya tienen `ticket.md` y están en `intake`, con QA pendiente y release sin publicar.
Los estados y documentos de los 13 reutilizados no se modificaron.

## Tramos y prioridad

| Tramo | Resultado revisable                                                   | Nuevos | Existentes | Prioridad   |
| ----- | --------------------------------------------------------------------- | -----: | ---------: | ----------- |
| S0    | Corregir tablero/refresco, atribución de sesiones y sesiones abiertas |      3 |          0 | P0          |
| S1    | Contrato CLI/MCP, identidad, eventos y contexto portable aislado      |      9 |          0 | P1          |
| S2    | Portafolio reutilizado, selector y disponibilidad de proyectos        |      2 |          3 | P1          |
| S3    | Fases, sesión ejecutora, modelos, mensajes y lectores opcionales      |      7 |          0 | P2          |
| S4    | Lista de jornada, ventanas y hoja de ruta con esperas visibles        |      4 |          0 | P2          |
| S5    | Actualización incremental, reconexión, frescura y contexto visual     |      4 |          0 | P2          |
| S6    | Siguiente elegible, capacidad compartida y despacho opcional          |      4 |         10 | P3          |
| S7    | Guía, configuración repetible, diagnóstico y prueba temporal          |      4 |          0 | Transversal |
| Total |                                                                       |     37 |         13 |             |

Estos tramos agrupan entregables; no son horas, cron ni barreras artificiales.
Mandarán las dependencias de cada nodo. S0 y la base de S1 pueden iniciarse por
caminos distintos cuando se aprueben sus planes y haya capacidad. El portafolio
existente ya tiene sus dependencias cerradas. S7 puede avanzar al estar listas
sus dependencias básicas, sin esperar al despacho de S6.

La primera entrega útil es S0 junto con el conjunto S1–S5: una sola vista de
proyectos y jornadas que muestre actividad y frescura. La integración automática
se añade después; la observación y la adopción no esperan a toda la autonomía.

## Ajustes sobre la propuesta del arquitecto

1. Se añadieron dos BUGFIX para refresco/tablero y sesiones abiertas, y se
   convirtió el nodo de sesiones sin directorio en BUGFIX. Los tres van en S0,
   sin obligar a construir la arquitectura nueva para reparar regresiones actuales.
2. Se adelantaron bindings, resolución autorizada y elección de capacidades a
   S1. El registro y las puertas CLI/MCP dependen de contexto válido, y los
   adaptadores dependen de capacidades elegidas explícitamente.
3. Se adelantó portafolio/selector a S2. Se conserva el ticket original de
   portafolio con todas sus dependencias; no se propone otro catálogo.
4. Se completaron dependencias de los lectores, el panel, la jornada, la
   reconexión y el despacho. Registrar actividad no equivale a ejecutar `valmen
run`; se aclaró el título del nodo CLI para evitar esa duplicación.
5. Se añadió `INTEGRATION-HERMES-DESPACHO-JORNADA-20261001` separado del despacho
   del motor. Integra el dispatcher de Hermes solo si se elige ese adaptador;
   el recorrido CLI/MCP sigue siendo operable sin Hermes.
6. Se amplió la cobertura de requisitos compuestos: latencia comprende fuente,
   transporte y vista; ejecución directa incluye MCP y lectores disponibles;
   fin temprano incluye despacho; capacidad y autorización incluyen integración.
7. Se corrigió el error de escritura `FRESURA` a `FRESCURA` en el ID nuevo.

La atribución `generated_by` identifica el origen del grafo inicial. Los ajustes
anteriores son la revisión de este agente, autorizada por la persona para
materializar, y no una segunda respuesta del arquitecto. No se estiman tokens ni costo
cuando la salida del comando no entrega esos números.

## Límites que deben conservar los análisis y planes

- **S0:** verificar las regresiones en el código actual. En el refresco,
  diagnosticar también raíz/versión de las instancias y distinguir la vista del
  harness del Kanban propio de Hermes. No afirmar que se arregló su UI externa
  por corregir una petición del harness. Sesión abierta sin señales suficientes
  debe quedar sin actividad confirmada, no exitosa ni fallida por omisión.
- **S1:** disco y locks en engine; core sin red ni acceso nuevo al disco.
  CLI/MCP registran hechos del mismo contrato, sin instalar Hermes, daemon ni UI,
  y sin reemplazar el flujo de tickets/gates existente. Bindings de máquina
  amplían la adopción existente, no replican los perfiles MCP ya implementados.
- **S2:** selector y vista conjunta, con proyecto explícito en consultas y
  acciones. Dos raíces con el mismo ID de ticket no comparten sesiones, estados,
  costo ni destinos. Una referencia remota sin conector se muestra no disponible.
- **S3:** `tasks.session_id` no demuestra identidad del worker. Lectores de
  OpenCode/Codex amplían los existentes, no escriben un segundo historial.
  Mensajes visibles son opcionales y paginados; sin pensamiento privado ni
  promesa de cada token. Modelo efectivo, configurado y costo tienen fuente real.
- **S4:** consultar y registrar jornadas no habilita ejecución. Preservar
  revisiones, intentos y tiempos conocidos, sin inventar fechas de inicio para
  un ticket que todavía espera dependencias. Ventanas con zona horaria y cruce
  de medianoche; cierre sin matar automáticamente al worker activo.
- **S5:** incorporar SSE y reconciliación a la fila visible, no solo al endpoint.
  La meta de menos de cinco segundos se mide desde disponibilidad para el lector
  hasta actualización de UI. Conexión, lectura de fuente y liveness son señales
  separadas. Medir CPU/RAM/latencia con dos proyectos y un worker en la M1 de
  8 GB; lecturas acotadas, fuentes deshabilitadas sin polling y mensajes paginados.
  Estos criterios se reparten entre transporte, panel, lectores y contexto UI,
  y se comprueban juntos al entregar la vista.
- **S6:** continuar con C independiente y autorizado cuando A espera a la
  persona y B depende de A. Un solo dueño por ámbito, reserva atómica entre
  proyectos y reconciliación verificable antes de recuperar capacidad. Consumo
  de `valmen run`, elegibilidad, colisiones y parada existentes, sin duplicarlos.
  La integración Hermes no deja dos schedulers sobre la misma cola ni amplía
  autoridad al poner una tarjeta en `ready`. Sin ejecutor disponible se informa
  el siguiente elegible para trabajo manual, sin simular un despacho.
- **S7:** repetir configuración preserva reglas, conexiones y permisos ajenos.
  La verificación temporal comprueba comandos y diagnostica lo ausente; no crea
  ni cierra tickets reales. Guías separadas CLI, MCP y Hermes opcional con
  prompts para agentes que sí tengan acceso al entorno.

Si el análisis descubre migración, sincronización o despliegue real, se separa
ese impacto y se sigue su gate humano. Este grafo no aprueba esos cambios ni
altera credenciales, hosts permitidos o los gates que evalúan el trabajo.

## Comprobaciones del grafo revisado

- Parser del motor: seis dominios, 35 requisitos normativos únicos.
- `parseTicketsYaml` y `assertDecomposable`: sin huecos ni ciclos.
- 50 IDs únicos, 37 nuevos con fecha 20261001 y todos vinculados a cobertura.
- 13 nodos reutilizados: títulos y dependencias iguales a `evolucion-harness`.
- Todas las dependencias están en el grafo y en el mismo tramo o uno anterior.
- Recorridos CLI/MCP sin dependencia de Hermes.
- Observación S0–S5 y adopción S7 sin dependencia transitiva de autonomía S6.
- Original del arquitecto conservado byte por byte antes de ajustar la propuesta.
- Formato comprobado con Prettier usando ignore vacío y `--prose-wrap preserve`.

El resultado mecánico y los hashes de ambos grafos están en
[revision/validacion-grafo.json](revision/validacion-grafo.json).

Son comprobaciones documentales previas a la materialización, no evidencia de
funcionalidad implementada. El resultado de crear los tickets se registra abajo.

## Materialización y siguiente etapa

La persona autorizó materializar con la frase literal:

> «dale si materialicemos los tickets».

El comando creó los 37 faltantes en `intake` y omitió los 13 existentes. El
[recibo de materialización](revision/materializacion.json) registra las altas,
reutilizaciones y comprobaciones. Los tickets creados contienen 68 casillas de
aceptación derivadas del reparto de los 35 requisitos; siguen pendientes.
Las anotaciones de verificación se definirán al planificar cada ticket.

Se comprobó que el grafo aprobado conserva su hash, el índice incluye todas las
altas y los archivos reutilizados y ajenos conservan sus bytes. Una consulta sin
escritura posterior propone cero altas y reconoce los 50 nodos existentes.
Cada ticket nuevo enlaza la feature, el grafo, este reparto y sus specs completas.

El siguiente trabajo será analizar los tickets elegibles según sus dependencias,
empezando por P0 y priorizando portafolio/base portable. Cada ticket conserva
análisis, plan y aprobación humana antes de implementar, conforme a la skill
[feature](../../skills/feature/SKILL.md). Esta materialización no programa ni
inicia ejecuciones. No se cambió código ni se crearon commits.

## Inventario de tickets registrados

La cobertura indica dónde se debe verificar cada parte del requisito, no que
ya esté cumplida. Las dependencias completas se conservan en `tickets.yaml`.

### S0

| ID                                         | Trabajo                                                        | Situación | Cobertura |
| ------------------------------------------ | -------------------------------------------------------------- | --------- | --------- |
| BUGFIX-MC-REFRESCO-TABLERO-20261001        | Corregir selección de tablero y refresco de fases actuales     | intake    | R-VIV-002 |
| BUGFIX-MC-SESIONES-SIN-DIRECTORIO-20261001 | Evitar atribuir sesiones sin directorio al proyecto incorrecto | intake    | R-PRO-003 |
| BUGFIX-MC-SESIONES-ABIERTAS-20261001       | Evitar marcar sesiones abiertas como fallidas por falta de fin | intake    | R-ACT-005 |

### S1

| ID                                             | Trabajo                                                       | Situación | Cobertura                       |
| ---------------------------------------------- | ------------------------------------------------------------- | --------- | ------------------------------- |
| FEATURE-CORE-IDENTIDAD-EJECUCION-20261001      | Definir entidades e identidad de ejecución en core            | intake    | R-CON-003                       |
| FEATURE-ENGINE-EVENTOS-PERSISTIDOS-20261001    | Persistir eventos de ejecución con orden y deduplicación      | intake    | R-VIV-003, R-CON-004            |
| FEATURE-ENGINE-CONTRATO-EJECUCION-20261001     | Exponer contrato portable de ejecución del motor              | intake    | R-CON-002                       |
| FEATURE-ENGINE-ACTIVIDAD-SIN-GATES-20261001    | Registrar actividad sin tocar gates ni máquinas de estado     | intake    | R-CON-006                       |
| FEATURE-CLI-EJECUCION-DIRECTA-20261001         | Registrar y consultar actividad por CLI sin Hermes ni tablero | intake    | R-ACT-006, R-CON-001, R-CON-002 |
| FEATURE-MCP-EJECUCION-DIRECTA-20261001         | Exponer el mismo contrato de ejecución por MCP                | intake    | R-ACT-006, R-CON-002            |
| FEATURE-CONFIG-BINDINGS-MAQUINA-20261001       | Separar políticas compartibles de bindings por máquina        | intake    | R-PRO-004                       |
| FEATURE-ENGINE-RESOLUCION-PROYECTO-20261001    | Resolver cada operación contra proyecto autorizado            | intake    | R-PRO-002, R-PRO-003            |
| FEATURE-CONFIG-CAPACIDADES-EXPLICITAS-20261001 | Habilitar observación y despacho por elección explícita       | intake    | R-ADO-005                       |

### S2

| ID                                         | Trabajo                                                  | Situación | Cobertura               |
| ------------------------------------------ | -------------------------------------------------------- | --------- | ----------------------- |
| FEATURE-CLI-ADOPTAR-PROYECTO-20260926      | Implementar valmen adopt para proyectos nuevos           | closed    | Prerrequisito existente |
| FEATURE-HERMES-PERFIL-PROYECTO-20260926    | Declarar cada proyecto como perfil MCP de Hermes         | closed    | Prerrequisito existente |
| FEATURE-MC-PORTAFOLIO-PROYECTOS-20260926   | Agregar portafolio de proyectos en Mission Control       | intake    | Prerrequisito existente |
| FEATURE-MC-SELECTOR-PROYECTOS-20261001     | Cambiar de proyecto en una sola instancia                | intake    | R-PRO-001, R-PRO-002    |
| FEATURE-MC-DISPONIBILIDAD-FUENTES-20261001 | Declarar disponibilidad por máquina y fuente en la vista | intake    | R-PRO-005               |

### S3

| ID                                              | Trabajo                                                   | Situación | Cobertura                                             |
| ----------------------------------------------- | --------------------------------------------------------- | --------- | ----------------------------------------------------- |
| FEATURE-ENGINE-ESTADO-ACTIVIDAD-20261001        | Separar estado validado, actividad actual y liveness      | intake    | R-ACT-001, R-ACT-005                                  |
| FEATURE-ENGINE-ENLACE-SESION-EJECUTORA-20261001 | Enlazar sesión ejecutora verificable por intento          | intake    | R-ACT-002                                             |
| FEATURE-ENGINE-MODELO-INTENTO-20261001          | Declarar modelo configurado y efectivo por intento        | intake    | R-ACT-004                                             |
| FEATURE-ADAPTER-CAPACIDADES-20261001            | Declarar capacidades y límites de adaptadores             | intake    | R-CON-005                                             |
| FEATURE-ADAPTER-HERMES-LECTURA-20261001         | Leer Hermes en solo lectura con cursor y sesión ejecutora | intake    | R-ACT-002, R-VIV-002, R-VIV-005, R-CON-005, R-PRO-003 |
| FEATURE-ADAPTER-OPENCODE-CODEX-20261001         | Declarar lectores OpenCode y Codex con sus límites        | intake    | R-ACT-006, R-VIV-005, R-CON-005                       |
| FEATURE-MC-PANEL-HERRAMIENTAS-20261001          | Mostrar herramientas y mensajes visibles del ejecutor     | intake    | R-ACT-003, R-VIV-005                                  |

### S4

| ID                                            | Trabajo                                                 | Situación | Cobertura                       |
| --------------------------------------------- | ------------------------------------------------------- | --------- | ------------------------------- |
| FEATURE-ENGINE-JORNADA-PERSISTIDA-20261001    | Persistir jornada con tickets y condiciones de inicio   | intake    | R-JOR-001                       |
| FEATURE-ENGINE-VENTANAS-JORNADA-20261001      | Cerrar ventanas sin interrumpir el trabajo activo       | intake    | R-JOR-004                       |
| FEATURE-ENGINE-AUTORIZACION-JORNADAS-20261001 | Observar y configurar jornadas sin ampliar autorización | intake    | R-JOR-006                       |
| FEATURE-MC-HOJA-RUTA-20261001                 | Presentar hoja de ruta de las jornadas seleccionadas    | intake    | R-VIV-001, R-VIV-002, R-CON-002 |

### S5

| ID                                            | Trabajo                                                | Situación | Cobertura                       |
| --------------------------------------------- | ------------------------------------------------------ | --------- | ------------------------------- |
| FEATURE-SERVER-EVENTOS-INCREMENTALES-20261001 | Propagar cambios con cursores y lecturas acotadas      | intake    | R-VIV-002, R-VIV-003, R-VIV-005 |
| FEATURE-MC-RECONEXION-RECONCILIACION-20261001 | Reconciliar eventos pendientes tras reconexión         | intake    | R-VIV-002, R-VIV-003            |
| FEATURE-MC-FRESCURA-FUENTES-20261001          | Declarar frescura y fallos de cada fuente por separado | intake    | R-VIV-004                       |
| FEATURE-MC-CONTEXTO-UI-20261001               | Conservar contexto, teclado y temas en la vista        | intake    | R-VIV-005, R-VIV-006            |

### S6

| ID                                                   | Trabajo                                                     | Situación | Cobertura                                             |
| ---------------------------------------------------- | ----------------------------------------------------------- | --------- | ----------------------------------------------------- |
| FEATURE-ENGINE-ROLES-ENRUTAMIENTO-20260926           | Enrutar modelos por rol de ejecución                        | closed    | Prerrequisito existente                               |
| FEATURE-GATE-CRITERIO-PLAYWRIGHT-20260926            | Aceptar el verbo playwright en criterios                    | closed    | Prerrequisito existente                               |
| FEATURE-GATE-SPECS-REPOSITORIO-20260926              | Ejecutar specs de interfaz guardadas en el repositorio      | intake    | Prerrequisito existente                               |
| FEATURE-CONFIG-PERFIL-UI-20260926                    | Configurar capacidades UI y modelo equilibrado por proyecto | intake    | Prerrequisito existente                               |
| FEATURE-GATE-VERIFY-DEV-20260926                     | Validar criterios de interfaz en ambiente dev               | intake    | Prerrequisito existente                               |
| IMPROVEMENT-ENGINE-PRESUPUESTOS-ADAPTATIVOS-20260926 | Aprender costos típicos y declarar presupuestos por ticket  | closed    | Prerrequisito existente                               |
| FEATURE-CONFIG-ELEGIBILIDAD-AUTONOMA-20260926        | Declarar elegibilidad autónoma en configuración             | intake    | Prerrequisito existente                               |
| FEATURE-ENGINE-RUN-AUTONOMO-20260926                 | Ejecutar valmen run hasta awaiting_user_tests               | intake    | Prerrequisito existente                               |
| SECURITY-ENGINE-COLISIONES-ESCRITURA-20260926        | Detectar colisiones de escritura antes de paralelizar       | intake    | Prerrequisito existente                               |
| SECURITY-ENGINE-PARADA-SEGURA-20260926               | Detener ejecuciones ante secretos o exceso de presupuesto   | intake    | Prerrequisito existente                               |
| FEATURE-ENGINE-SELECCION-ELEGIBLE-20261001           | Elegir el siguiente ticket independiente y autorizado       | intake    | R-JOR-002, R-JOR-003                                  |
| FEATURE-ENGINE-CAPACIDAD-MAQUINA-20261001            | Persistir capacidad compartida por máquina con reservas     | intake    | R-JOR-005                                             |
| FEATURE-ENGINE-DESPACHO-JORNADA-20261001             | Despachar tickets elegibles con un único dueño              | intake    | R-JOR-002, R-JOR-003, R-JOR-004, R-JOR-005, R-JOR-006 |
| INTEGRATION-HERMES-DESPACHO-JORNADA-20261001         | Integrar jornadas con el despachador opcional de Hermes     | intake    | R-CON-005, R-JOR-002, R-JOR-003, R-JOR-005, R-JOR-006 |

### S7

| ID                                         | Trabajo                                               | Situación | Cobertura            |
| ------------------------------------------ | ----------------------------------------------------- | --------- | -------------------- |
| DOCS-ADOPCION-RUTAS-20261001               | Guiar puesta en marcha por CLI, MCP y Hermes opcional | intake    | R-ADO-001, R-ADO-002 |
| FEATURE-CLI-ADOPCION-IDEMPOTENTE-20261001  | Repetir configuración sin sobrescribir reglas ajenas  | intake    | R-ADO-003            |
| FEATURE-CLI-DOCTOR-CAPACIDADES-20261001    | Diagnosticar flujo básico y capacidades opcionales    | intake    | R-ADO-004, R-ADO-006 |
| FEATURE-CLI-VERIFICACION-TEMPORAL-20261001 | Verificar la guía paso a paso en registro temporal    | intake    | R-ADO-006            |
