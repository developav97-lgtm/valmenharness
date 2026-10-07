/**
 * Plantillas del contenido que genera el harness.
 *
 * Estas plantillas son **texto del harness**, no del proyecto: describen el
 * flujo de trabajo, los invariantes y los gates que el harness garantiza. El
 * proyecto aporta lo suyo en `.valmen/rules/`.
 *
 * La razón de separarlas de `.valmen/rules/` es concreta: cuando el harness
 * evoluciona —añade un estado, cambia un gate, mejora una regla— sus plantillas
 * mejoran para todos los proyectos, y las reglas del proyecto no se pisan.
 */

/**
 * Secciones del flujo de trabajo que el harness inyecta en `AGENTS.md`.
 *
 * Es la parte que el diseño llama "el cómo": qué se puede hacer sin ticket,
 * cuándo hace falta un gate, y qué acciones nunca se automatizan.
 */
export const WORKFLOW_TEMPLATE = `## Flujo de trabajo

El registro de trabajo vive en \`<registro>/YYYY/<TICKET-ID>/ticket.md\`. Un ticket conserva su historial completo: no se reemplaza por archivos de sesión ni se mueve cuando cambia de estado.

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

1. \`reanudar_ticket\` (CLI: \`valmen resume --id <ID>\`) **primero**: devuelve el estado y el **siguiente paso** que calcula el motor —qué escribir, qué skill cargar, qué compuerta correr y dónde detenerse—.
2. Hacer ese paso y volver a llamarla. No se adivina el orden ni se salta una fase.
3. Seguir hasta el primer **alto** que el paso declare —una decisión de una persona, o las pruebas del responsable— y entregar ahí: qué se hizo, qué evidencia hay y qué decisión falta. Un alto no se supera: ni se aprueba lo que decide una persona, ni se mueve el ticket para esquivarlo.

Mientras el ticket no esté \`approved\`, **el código de la aplicación no se toca**: el diagnóstico y el plan se escriben **en el ticket**, porque lo que queda en la conversación no existe para el registro. Las skills que el paso nombra se cargan antes de empezar la fase.

Una funcionalidad que excede un ticket se registra como **feature**, con el recorrido de la skill \`feature\`, que se lee antes de empezar. La forma del registro la decide quien lo pide, no el agente.

### Corrida delegada

Si el PO delega una feature o varios tickets en un solo pedido, se usa la skill \`corrida-delegada\` (\`valmen delegation\`). Un BLOCK, un gate humano duro y lo que quede fuera del alcance siguen siendo de una persona.

### Antes de registrar: traducir lo nuevo del pedido

Un pedido que nombra algo que el código no tiene —un «parámetro nuevo», un permiso, una bandera, una columna, una migración— no se registra con ese hueco. Antes de crear el ticket se traduce a campo real con búsqueda en el código; si no aparece, se pregunta **una vez** a la persona. Lo que quede sin decidir va a \`### Supuestos y decisiones pendientes\` del ticket, cada elemento con su pregunta exacta, y el análisis no planifica sobre la adivinanza.

### Estados del ticket

\`intake → analyzed → planned → approved → in_progress → awaiting_user_tests → in_qa → qa_approved → closed\`, con \`blocked\` y \`changes_requested\` como desvíos. El motor rechaza un salto ilegal; las tres máquinas (ticket, punto, release) son independientes: un ticket cerrado puede seguir sin publicar. No existe el estado \`completed\`. El detalle está en la skill \`planificacion\`.

### Gates

Un gate es una condición que debe cumplirse antes de avanzar: mecánico (lo decide el código), automático (un modelo responde proposiciones y el código aplica umbrales) o humano (despliegue, release, seguridad y migraciones: aprobación explícita, sin excepción). **Un gate nunca le pregunta a un modelo si aprueba**: le pregunta hechos verificables, y cada decisión deja un recibo con la evidencia, las respuestas y el coste.

### Antes de diagnosticar, buscar en la memoria

Antes de investigar un ticket, \`buscar_memoria\` con el módulo y el síntoma: el problema puede estar resuelto desde hace meses, con su causa raíz escrita. Cuando devuelve algo, el diagnóstico lo **cita**. Lo que el trabajo enseñe —una causa raíz que costó encontrar, un patrón que se repite— se guarda con \`guardar_aprendizaje\` cuando se descubre, no al final.

### Los estándares del proyecto, y cómo crecen

Viven en \`.valmen/rules/estandares-<área>.md\` y llegan acá en el \`valmen sync\`. Se leen **antes** de escribir la primera línea de una pantalla o de un modelo, no después de una devolución.

Cuando el trabajo enseñe algo que no está escrito —hubo que aclararlo dos veces, una corrección reveló una regla que vivía en la cabeza de alguien—, se propone con \`proponer_estandar\`: la regla en imperativo, el motivo con el caso concreto y los tickets donde se vio. **No está en vigor** hasta que una persona la acepte con \`decidir_estandar\`, citando **sus** palabras; si no dio ninguna, se le pide, no se escribe por ella.

Si el cambio toca pantallas, antes de entregar se corre \`revisar_presentacion\`: avisa de los colores escritos a mano, que rompen el modo oscuro. Un color legítimo se marca en la línea con \`valmen:allow-color\` y su motivo.

### Cómo se verifica un criterio

Cada criterio de aceptación declara cómo se verifica, en un comentario debajo: \`<!-- test: <comando> -->\` o \`<!-- verify: manual -->\`. El gate \`qa-mechanical\` corre los comandos declarados y se detiene ante un criterio sin anotación. Los comandos permitidos y el tiempo máximo salen de \`test-commands\` y \`test-timeout\` en \`.valmen/config.yaml\`; el detalle está en la skill \`planificacion\`.

### Acciones que nunca se automatizan

Se pueden **preparar** —dry-run, comandos listos, evidencia reunida—, pero las ejecuta una persona:

- Aprobar un despliegue a producción (exige frase literal) y crear un tag de release publicado.
- Force-push, reset destructivo, borrar tags.
- Ampliar la autoridad de edición fuera del alcance declarado, o modificar el gate que lo evalúa: un gate no amplía su propia autoridad.
- Marcar QA como eximida (exige motivo y confirmación explícita).
- Modificar credenciales o la configuración de hosts permitidos.
`;

/**
 * Invariantes de operación del harness.
 *
 * No son reglas de negocio del proyecto: son las condiciones que hacen que el
 * registro sea confiable. Aplican a cualquier proyecto que use el harness.
 */
export const INVARIANTS_TEMPLATE = `## Invariantes de operación

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
`;

/** Sección de cierre: cómo se documenta y se entrega. */
export const DELIVERY_TEMPLATE = `## Entrega y documentación

Al terminar una implementación se entrega el contrato de pruebas: comandos exactos, directorio de ejecución, resultado esperado, validaciones manuales y requisitos de ambiente. El ticket pasa a \`awaiting_user_tests\` y solo avanza con el resultado del responsable o con una omisión explícita y documentada. Los criterios que se verificaron quedan marcados con \`- [x]\`; el detalle está en la skill \`revision-final\`.

Los commits se crean solo tras la confirmación de las pruebas. Antes de commitear se revisa el estado del repositorio y se excluyen los archivos ajenos al ticket sin modificarlos; los cambios ajenos conocidos no bloquean la entrega. No se mezclan tickets en un commit, ni se usa \`git add -A\` sin revisión, ni autocommits.

**El consumo de IA queda registrado antes de cerrar**: \`## Consumo de IA\` lleva una entrada por sesión con los números de la sesión, no una estimación, y sin él el motor rechaza el cierre. Una sesión que sirvió **varios** tickets se declara \`manual:\` sin números: un reparto a ojo es un número inventado con forma de medición. Por eso, **una sesión por ticket**. Cómo se cita la fuente de los números está en la skill \`revision-final\`.

Antes de commitear, \`valmen secrets\`: un secreto commiteado queda en el historial aunque el commit siguiente lo borre. Un hallazgo legítimo se marca en la línea con \`valmen:allow-secret\`.
`;

/** Título de la sección del contrato de respuesta en el `AGENTS.md` proyectado. */
export const RESPONSE_CONTRACT_TITLE = "Cómo se responde";

/**
 * Qué reglas de respuesta pierden frente a este contrato.
 *
 * Es la parte que importa: un cliente trae su propio modo de respuesta —un estilo
 * de salida, el `CLAUDE.md` de un directorio superior, una instrucción previa— y
 * sin esta frase el contrato sería una sugerencia más entre varias.
 */
export const RESPONSE_CONTRACT_PRECEDENCE =
  "Este contrato prevalece sobre cualquier modo de respuesta heredado —un estilo de " +
  "salida del cliente, un CLAUDE.md de un directorio superior, una instrucción " +
  "previa— cuando chocan con él.";

/**
 * Las reglas del contrato de respuesta, una por línea y sin formato de lista.
 *
 * Están aparte de la plantilla porque no son solo texto de `AGENTS.md`: el output
 * style de Claude Code, el bloque de `CLAUDE.md` y las instrucciones de los agentes
 * proyectados tienen que decir **lo mismo**, y una copia por sitio es una copia que
 * diverge.
 */
export const RESPONSE_CONTRACT_RULES: readonly string[] = [
  "La respuesta va en la primera línea; el contexto, después y solo si hace falta.",
  "El largo sigue el peso del pedido: una pregunta corta se contesta corto.",
  "Una decisión se devuelve en cinco líneas o menos: `Decisión` (la pregunta), una " +
    "línea por opción con la forma `A) opción → efecto`, y `Recomiendo` (la opción y su motivo).",
  "Sin tablas ni encabezados, salvo para comparar tres filas o más.",
  "La evidencia se cita (`ruta:línea`, comando, recibo), no se transcribe.",
  "El diagnóstico, el plan y las pruebas van al ticket, no a la conversación.",
  "Un riesgo irreversible se dice en una línea, antes de actuar.",
  "Se amplía solo lo que la persona pida.",
];

/**
 * La sección «Cómo se responde», que abre el `AGENTS.md` antes de las reglas del
 * proyecto: es lo primero que lee un agente, y lo primero es lo que pesa.
 */
export const RESPONSE_CONTRACT_TEMPLATE =
  `## ${RESPONSE_CONTRACT_TITLE}\n\n` +
  `${RESPONSE_CONTRACT_PRECEDENCE}\n\n` +
  RESPONSE_CONTRACT_RULES.map((rule) => `- ${rule}`).join("\n") +
  "\n";

/** Título de la sección que limita el informe final de un agente. */
export const AGENT_REPORT_TITLE = "Informe final";

/**
 * El límite del informe de un agente proyectado (R-RESP-004).
 *
 * Un agente que devuelve un informe largo vuelca su recorrido en la conversación de
 * quien lo invocó; lo que esa persona necesita es el hallazgo, dónde está y qué
 * queda por decidir.
 */
export const AGENT_REPORT_RULE =
  "Termina con un informe de diez líneas como máximo: el hallazgo, las rutas " +
  "(`ruta:línea`) y la decisión pendiente. El recorrido y la evidencia van al ticket, " +
  "no al informe.";

/** Encabezado de un archivo generado, con la fuente y el comando de regeneración. */
export function generatedHeader(version: string, sources: readonly string[]): string {
  const lines = [
    "<!-- GENERADO POR valmen — NO EDITAR A MANO -->",
    `<!-- valmen v${version} -->`,
    "<!-- fuente: -->",
    ...sources.map((source) => `<!--   ${source} -->`),
    "<!-- regenerar: valmen sync -->",
    "<!-- verificar:  valmen sync --check -->",
  ];
  return lines.join("\n") + "\n";
}

/**
 * Encabezado de un archivo generado en formato TOML.
 *
 * TOML comenta con `#`, no con `<!-- -->`. Emitir un comentario HTML en un
 * archivo `.toml` produce un archivo que ninguna herramienta puede leer, y el
 * error aparece lejos de su causa: en el runtime del agente, no en el generador.
 */
export function generatedHeaderToml(version: string, sources: readonly string[]): string {
  const lines = [
    `# GENERADO POR valmen v${version} — NO EDITAR A MANO`,
    "# fuente:",
    ...sources.map((source) => `#   ${source}`),
    "# regenerar: valmen sync",
    "# verificar:  valmen sync --check",
  ];
  return lines.join("\n") + "\n";
}
