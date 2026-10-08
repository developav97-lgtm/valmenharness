<!-- GENERADO POR valmen — NO EDITAR A MANO -->
<!-- valmen v0.0.1 -->
<!-- fuente: -->
<!--   .valmen/config.yaml -->
<!--   .valmen/rules/estandares-proceso.md -->
<!--   .valmen/rules/proyecto.md -->
<!--   .valmen/rules/stack.md -->
<!-- regenerar: valmen sync -->
<!-- verificar:  valmen sync --check -->

# ValmenHarness

## Cómo se responde

Este contrato prevalece sobre cualquier modo de respuesta heredado —un estilo de salida del cliente, un CLAUDE.md de un directorio superior, una instrucción previa— cuando chocan con él.

- La respuesta va en la primera línea; el contexto, después y solo si hace falta.
- El largo sigue el peso del pedido: una pregunta corta se contesta corto.
- Una decisión se devuelve en cinco líneas o menos: `Decisión` (la pregunta), una línea por opción con la forma `A) opción → efecto`, y `Recomiendo` (la opción y su motivo).
- Sin tablas ni encabezados, salvo para comparar tres filas o más.
- La evidencia se cita (`ruta:línea`, comando, recibo), no se transcribe.
- El diagnóstico, el plan y las pruebas van al ticket, no a la conversación.
- Un riesgo irreversible se dice en una línea, antes de actuar.
- Se amplía solo lo que la persona pida.

> El «Por qué» de cada estándar va resumido en una línea; el texto completo está
> en `.valmen/rules/`.

## Estándares de proceso

Reglas que este proyecto ya decidió. **No son preferencias**: cada una salió de
una corrección que hubo que hacer, y su motivo va escrito para que se pueda
discutir cuando cambie.

## Cuándo se usa la cascada verificada

En un gate con proposiciones que solo un modelo puede responder se corre el evaluador `cascade` cuando el artefacto tiene sustancia y el veredicto cierra una transición —el análisis de un ticket con diagnóstico escrito, el plan de un cambio que toca código, el cierre con criterios declarados—, y se corre el evaluador de siempre cuando el gate se resuelve en código, cuando el cambio es de texto o de configuración, o cuando el estado no cambió desde la corrida anterior. El evaluador elegido se declara al correr el gate: el recibo lo guarda, y sin eso la decisión no se puede auditar después.

**Por qué:** La cascada gasta tres llamadas donde el evaluador de siempre gasta una —produce el modelo barato…

## Gateway y avisos por Telegram

La entrega y los avisos de la jornada (arranque, awaiting_user_tests, compuertas en REVIEW) salen por el bot de Telegram del perfil del proyecto —TELEGRAM_ALLOWED_USERS del .env—; Slack queda como canal secundario apagado. Un nuevo aviso se agrega al vigilante de avisos, no a un mensaje suelto.

**Por qué:** Migración decidida por el PO el 2026-09-30: los DM de Slack a veces no llegaban al celular y la gateway ya sirve Telegram en ambos perfiles…

## Registro de tickets: traducir lo nuevo del pedido antes de crear

Si el pedido nombra algo que el código no tiene —parámetro, permiso, campo, bandera, columna, migración—, se traduce a campo real con búsqueda antes de crear el ticket; si no aparece, se pregunta una vez al PO y el ticket no se registra con el hueco. Lo que quede sin decidir se escribe en la sección «Supuestos y decisiones pendientes» del ticket, cada elemento con su pregunta, y el análisis no planifica sobre la adivinanza.

**Por qué:** BUGFIX-RESTAURANTE-MESERO-BORRAR-BONIFICAR-20260929 pidió «el nuevo parámetro bonificado» sin especificarlo…

## Escalada tras dos bloqueos semánticos equivalentes

Tras dos bloqueos consecutivos del mismo gate por la misma proposición semántica, cuando el artefacto ya incorpora la corrección comprobable, se documentan ambos recibos y la evidencia; una autorización explícita vigente del PO permite continuar sin una tercera corrida. La aprobación queda atribuida a esa política humana, nunca al modelo.

**Por qué:** Evita gastar una tercera llamada idéntica y deja evidencia para calibrar el evaluador, sin que la compuerta amplíe su propia autoridad.

## Una contradicción interna del evaluador no debe producir un bloqueo automático

En FEATURE-ADAPTER-CAPACIDADES-20261001, el gate analysis bloqueó cuatro veces diagnostico_explica_el_sintoma (0.04, 0.02, 0.08) mientras el mismo recibo clasificaba el análisis como completa y daba >=0.97 a causa_especifica, nombra_archivos_reales y riesgos_cubren_impactos. El refinamiento debe detectar esa contradicción: si clasificación es completa y las tres comprobaciones estructurales superan approveAt, una única proposición semántica contradictoria no puede decidir block; se degrada a review y exige decisión humana. La corrección se valida con una prueba determinista del vector de recibo anterior, que debe devolver review, y con un caso control donde falla causa o archivos, que debe seguir devolviendo block.

**Por qué:** Sale del aprendizaje AP-004 (2026-10-03), visto en FEATURE-ADAPTER-CAPACIDADES-20261001.
**Visto en:** FEATURE-ADAPTER-CAPACIDADES-20261001 (2026-10-04)

## Cómo se trabaja en este repositorio

Este repositorio **es** el harness, no un proyecto que lo usa, y se gestiona con
su propio registro: `.valmen/` es la **fuente de verdad** y `AGENTS.md` y las
skills son su proyección —la regenera `valmen sync`—. El trabajo de evolución se
registra como features y tickets.

El **modo directo** queda acotado a los **cambios triviales**: consultas,
diagnósticos, exploración, cambios visuales o de contenido que no alteran
funcionalidad, prototipos desechables y la configuración del propio harness.

La **funcionalidad nueva** pasa por el **flujo** completo: feature cuando excede
un ticket, y luego ticket, análisis, plan, aprobación de una persona,
implementación, entrega y QA.

Eso no relaja nada de lo demás: las pruebas se corren antes de decir que algo
funciona, lo que toca interfaz se verifica en el navegador, y los commits siguen
la misma disciplina de siempre.

`tickets/` conserva lo que ya está registrado. No se borra: es el historial, y
los tickets que quedaron a medias se retoman cuando alguien lo pida.

**Por qué:** la auditoría del 26-sep encontró que el harness se construía en modo
directo, sin su propio registro —la ceremonia se evitaba, pero también la
evidencia—, y el registro es lo que hace auditable el trabajo; el modo directo se
conserva para lo que no crea artefactos durables.

## Idioma

Todo se escribe en **español**: las respuestas, los commits, la documentación y
los mensajes de error del harness. Incluye lo que un agente contesta en la
conversación, no solo lo que queda en un archivo —una respuesta en otro idioma es
un cambio de idioma que nadie pidió, y quien la lee tiene que traducir para
seguir—.

El código sigue igual: identificadores en inglés donde el proyecto ya los tiene,
y los nombres del dominio como los nombra el negocio.

## Stack y arquitectura

Monorepo de TypeScript con npm workspaces. Node 24. Sin dependencias externas en
el motor: `@valmen/core` no toca la red y solo `fs.ts` toca el disco.

Los paquetes se parten cuando duele, no antes. Hoy son diez y el orden importa:
`core` no depende de nadie; `adapter` y `gate` dependen de `core`; `engine` es el
motor del registro y lo consumen el CLI y el servidor.

## Pruebas

`npx vitest run`. Los tests de equivalencia contra la implementación de referencia
están desactivados por defecto: se activan con `VALMEN_REFERENCE_TICKET_PY`.

## Flujo de trabajo

El registro de trabajo vive en `<registro>/YYYY/<TICKET-ID>/ticket.md`. Un ticket conserva su historial completo: no se reemplaza por archivos de sesión ni se mueve cuando cambia de estado.

### Modo directo, sin registro

Consultas, diagnósticos, exploración, cambios visuales o de contenido que no alteran funcionalidad, prototipos desechables y la configuración del propio harness.

**El modo directo no relaja los gates de impacto.** Un cambio que se vaya a aplicar **sobre un proyecto real** y toque sincronización, migraciones, contenedores, autenticación o despliegue exige ticket, plan aprobado y gate humano, aunque el pedido haya sido "cámbiame este texto". El agente lo dice y se detiene: no sigue sin el ticket, y tampoco lo abre por su cuenta.

Esos gates protegen datos y clientes de un proyecto en uso. En un repositorio que **es** el producto que se construye —y que lo declara en sus reglas— la protección equivalente son las pruebas antes de decir que algo funciona y la confirmación antes de commitear.

### Autorización antes de acción

Investigar, explicar, revisar, auditar, comparar y proponer son operaciones **read-only** salvo que el pedido autorice explícitamente un cambio. Es el primer paso del protocolo, no una recomendación.

### Quién decide que hace falta un ticket

**La persona, no el agente.** Abrir un ticket escribe en el repositorio, y escribir exige autorización. El agente puede proponerlo —una línea, con el motivo— y esperar respuesta; no lo abre por su cuenta, ni siquiera cuando el trabajo cumple de sobra las condiciones.

Un pedido de trabajo no es un pedido de registro. Cuando alguien dice "hagámoslo", el modo por defecto es el directo: se hace y se prueba. Eso vale para un pedido **que no nombra un ticket**; si nombra uno que ya existe, ese ticket manda.

### Continuar un ticket

Un pedido como «continúa con el ticket X» nombra un ticket que ya existe, y entonces **el ticket manda, no el modo directo**:

1. `reanudar_ticket` (CLI: `valmen resume --id <ID>`) **primero**: devuelve el estado y el **siguiente paso** que calcula el motor.
2. Hacer ese paso y volver a llamarla. No se adivina el orden ni se salta una fase. Si trae «Delegación de la fase», la hace un subagente con ese modelo sin cambiar el de la sesión; quien recibió el brief la hace él.
3. Seguir hasta el primer **alto** que el paso declare —una decisión de una persona, o las pruebas del responsable— y entregar ahí: qué se hizo, qué evidencia hay y qué decisión falta. Un alto no se supera: ni se aprueba lo que decide una persona, ni se mueve el ticket para esquivarlo.

Mientras el ticket no esté `approved`, **el código de la aplicación no se toca**: el diagnóstico y el plan se escriben **en el ticket**, porque lo que queda en la conversación no existe para el registro. Las skills que el paso nombra se cargan antes de empezar la fase.

Una funcionalidad que excede un ticket se registra como **feature**, con el recorrido de la skill `feature`, que se lee antes de empezar. La forma del registro la decide quien lo pide, no el agente.

### Corrida delegada

Si el PO delega una feature o varios tickets: skill `corrida-delegada`, o `corrida-orquestada` con subagentes en paralelo. Un BLOCK, un gate humano duro y lo que quede fuera del alcance siguen siendo de una persona.

### Corrida orquestada

Se pide en la sesión: «ejecuta el feature X» o «los tickets de hoy, con N a la vez» (3 por defecto). Esa sesión es el orquestador y lanza un subagente por ticket, cada uno en su worktree y su rama. Solo el orquestador toca el checkout principal e integra. El subagente corre las pruebas de su ticket, no la suite completa. La aprobación sale de la política por tipo de ticket: automática con autorización vigente y ticket elegible, en lote al PO si no. SECURITY y despliegue son siempre de una persona.

### Antes de registrar: traducir lo nuevo del pedido

Un pedido que nombra algo que el código no tiene —un «parámetro nuevo», un permiso, una bandera, una columna, una migración— no se registra con ese hueco. Antes de crear el ticket se traduce a campo real con búsqueda en el código; si no aparece, se pregunta **una vez** a la persona. Lo que quede sin decidir va a `### Supuestos y decisiones pendientes` del ticket, cada elemento con su pregunta exacta, y el análisis no planifica sobre la adivinanza.

### Estados del ticket

`intake → analyzed → planned → approved → in_progress → awaiting_user_tests → in_qa → qa_approved → closed`, con `blocked` y `changes_requested` como desvíos. El motor rechaza un salto ilegal; las tres máquinas (ticket, punto, release) son independientes: un ticket cerrado puede seguir sin publicar. No existe el estado `completed`. El detalle está en la skill `planificacion`.

### Gates

Un gate es una condición que debe cumplirse antes de avanzar: mecánico (lo decide el código), automático (un modelo responde proposiciones y el código aplica umbrales) o humano (despliegue, release, seguridad y migraciones: aprobación explícita, sin excepción). **Un gate nunca le pregunta a un modelo si aprueba**: le pregunta hechos verificables, y cada decisión deja un recibo con la evidencia, las respuestas y el coste.

### Antes de diagnosticar, buscar en la memoria

Antes de investigar un ticket, `buscar_memoria` con el módulo y el síntoma: el problema puede estar resuelto desde hace meses, con su causa raíz escrita. Cuando devuelve algo, el diagnóstico lo **cita**. Lo que el trabajo enseñe —una causa raíz que costó encontrar, un patrón que se repite— se guarda con `guardar_aprendizaje` cuando se descubre, no al final.

### Los estándares del proyecto, y cómo crecen

Viven en `.valmen/rules/estandares-<área>.md` y llegan acá en el `valmen sync`. Se leen **antes** de escribir la primera línea de una pantalla o de un modelo, no después de una devolución.

Cuando el trabajo enseñe algo que no está escrito —hubo que aclararlo dos veces, una corrección reveló una regla que vivía en la cabeza de alguien—, se propone con `proponer_estandar`: la regla en imperativo, el motivo con el caso concreto y los tickets donde se vio. **No está en vigor** hasta que una persona la acepte con `decidir_estandar`, citando **sus** palabras; si no dio ninguna, se le pide, no se escribe por ella.

Si el cambio toca pantallas, antes de entregar se corre `revisar_presentacion`: avisa de los colores escritos a mano, que rompen el modo oscuro. Un color legítimo se marca en la línea con `valmen:allow-color` y su motivo. Con UI UX Pro Max e Impeccable: `valmen ux review`.

### Cómo se verifica un criterio

Cada criterio de aceptación declara cómo se verifica, en un comentario debajo: `<!-- test: <comando> -->` o `<!-- verify: manual -->`. El gate `qa-mechanical` corre los comandos declarados y se detiene ante un criterio sin anotación. Los comandos permitidos y el tiempo máximo salen de `test-commands` y `test-timeout` en `.valmen/config.yaml`; el detalle está en la skill `planificacion`.

### Acciones que nunca se automatizan

Se pueden **preparar** —dry-run, comandos listos, evidencia reunida—, pero las ejecuta una persona:

- Aprobar un despliegue a producción (exige frase literal) y crear un tag de release publicado.
- Force-push, reset destructivo, borrar tags.
- Ampliar la autoridad de edición fuera del alcance declarado, o modificar el gate que lo evalúa: un gate no amplía su propia autoridad.
- Marcar QA como eximida (exige motivo y confirmación explícita).
- Crear o ampliar una autorización permanente de QA por agente, o promover la política a cerrar tickets (sin herramienta MCP).
- Modificar credenciales o la configuración de hosts permitidos.

## Invariantes de operación

1. **El código manda sobre el modelo.** Lo decidible en código se decide en
   código. Un modelo solo evalúa proposiciones semánticas que el código no puede
   computar.
2. **Nada de bytes por el modelo.** Copiar, mover o archivar artefactos usa
   comandos de shell con verificación estructural. Un modelo que resume, trunca
   o altera un byte mientras reporta éxito corrompe la auditoría en silencio.
3. **Un solo escritor.** Ningún archivo tiene dos escritores concurrentes sin
   coordinación explícita.
4. **Los bloques append-only no se reescriben.** Eventos, puntos, ciclos de QA,
   evidencia y cierres se añaden, nunca se editan. Es lo que permite auditar un
   ticket meses después.
5. **El estado vive en disco, no en la conversación.** Dos máquinas y un agente
   deben obtener la misma respuesta del mismo registro.

## Entrega y documentación

Al terminar una implementación se entrega el contrato de pruebas: comandos exactos, directorio de ejecución, resultado esperado, validaciones manuales y requisitos de ambiente. El ticket pasa a `awaiting_user_tests` y solo avanza con el resultado del responsable o con una omisión explícita y documentada. Los criterios que se verificaron quedan marcados con `- [x]`; el detalle está en la skill `revision-final`.

Los commits se crean solo tras la confirmación de las pruebas. Antes de commitear se revisa el estado del repositorio y se excluyen los archivos ajenos al ticket sin modificarlos; los cambios ajenos conocidos no bloquean la entrega. No se mezclan tickets en un commit, ni se usa `git add -A` sin revisión, ni autocommits.

**La QA puede ejecutarla un agente** solo bajo una autorización vigente que creó una persona: `qa-agent` prueba en un worktree limpio y el ciclo se atribuye a la autorización. Empieza en sombra hasta que una persona promueva la política; sin autorización vigente, la QA es de una persona.

**El consumo de IA queda registrado antes de cerrar**: `## Consumo de IA` lleva una entrada por sesión con los números de la sesión, no una estimación, y sin él el motor rechaza el cierre. Una sesión que sirvió **varios** tickets se declara `manual:` sin números: un reparto a ojo es un número inventado con forma de medición. Por eso, **una sesión por ticket**. Cómo se cita la fuente de los números está en la skill `revision-final`.

Antes de commitear, `valmen secrets`: un secreto commiteado queda en el historial aunque el commit siguiente lo borre. Un hallazgo legítimo se marca en la línea con `valmen:allow-secret`.

## Registro de trabajo

El registro de tickets vive en `tickets/`. Los comandos del harness lo usan por defecto.
