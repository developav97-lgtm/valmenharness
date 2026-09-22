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

El registro de trabajo vive en \`<registro>/YYYY/<TICKET-ID>/ticket.md\`. Un ticket
conserva su historial completo: no se reemplaza por archivos de sesión ni se
mueve cuando cambia de estado.

### Modo directo, sin registro

Consultas, diagnósticos, exploración, cambios visuales o de contenido que no
alteran funcionalidad, prototipos desechables, y cambios de la propia
configuración del harness.

**El modo directo no relaja los gates de impacto.** Un cambio que toque
sincronización, migraciones, contenedores, autenticación o despliegue exige
ticket, plan aprobado y gate humano, aunque el pedido haya sido "cámbiame este
texto".

### Autorización antes de acción

Investigar, explicar, revisar, auditar, comparar y proponer son operaciones
**read-only** salvo que el pedido autorice explícitamente un cambio. Es el
primer paso del protocolo, no una recomendación.

### Cuándo hace falta un ticket

El trabajo se registra cuando la exploración revela dos o más pasos de
implementación con archivos distintos, o cuando el progreso vale la pena
recuperarlo tras una interrupción. Un cambio trivial y comprendido no crea
artefactos durables.

Para una funcionalidad que excede un ticket —un módulo con varias pantallas,
reportes y configuración— se usa una **feature**: spec, diseño, descomposición
en tickets con grafo de dependencias y seguimiento del conjunto.

### Estados del ticket

\`\`\`text
ticket:  intake → analyzed → planned → approved → in_progress
                 ↘ blocked ──────────────────────↗
         → awaiting_user_tests → in_qa ─┬→ changes_requested → in_progress ↗
                                       └→ qa_approved → closed
                                                          ↘ changes_requested
                                                            (solo unreleased)
point:   open → analyzed → in_progress → awaiting_retest → verified → closed
         ↘ not_reproducible | deferred | duplicate   (requieren motivo)
release: not_applicable | unreleased → planned → released
\`\`\`

Las tres máquinas de estado son **independientes**. Confundir "cerrado" con
"publicado" es el error clásico: un ticket puede estar cerrado y seguir sin
publicar.

No existe el estado \`completed\`: es ambiguo. Cada estado tiene una salida
obligatoria verificable.

### Gates

Un gate es una condición que debe cumplirse antes de avanzar. Puede ser
mecánico, automático o humano.

| Qué se valida | Cómo |
|---|---|
| Esquema del ticket, plan real, criterios verificables | Mecánico: lo decide el código |
| Cobertura de requisitos, coherencia del plan con la investigación | Automático: un modelo responde proposiciones y el código aplica umbrales |
| Despliegue, release, seguridad, migraciones | Humano: aprobación explícita, sin excepción |

**Un gate nunca le pregunta a un modelo si aprueba.** Le pregunta hechos
verificables y el código decide. Cada decisión deja un recibo con la evidencia
que vio el evaluador, sus respuestas y su coste.

### Acciones que nunca se automatizan

| Acción | Por qué |
|---|---|
| Aprobar un despliegue a producción | Irreversible para clientes activos. Exige frase literal. |
| Crear un tag de release publicado | Una release publicada es inmutable. |
| Force-push, reset destructivo, borrar tags | Riesgo de pérdida de trabajo irreversible. |
| Ampliar la autoridad de edición fuera del alcance declarado | Es el consentimiento que un modelo no puede darse a sí mismo. |
| Marcar QA como eximida | Exige motivo y confirmación explícita. |
| Modificar el gate que lo evalúa | Un gate no puede ampliar su propia autoridad. |
| Modificar credenciales o configuración de hosts permitidos | Regla dura. |

Estas acciones pueden **prepararse** automáticamente —dry-run, comandos listos,
evidencia reunida— pero su ejecución requiere una persona. El sistema entrega el
trabajo hecho y la decisión pendiente.
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

Al terminar una implementación, se entrega el contrato de pruebas: comandos
exactos, directorio de ejecución, resultado esperado, validaciones manuales y
requisitos de ambiente. El ticket pasa a \`awaiting_user_tests\` y solo avanza con
el resultado del responsable o con una omisión explícita y documentada.

Los commits se crean solo tras la confirmación de las pruebas. Antes de
commitear, revisar el estado del repositorio, identificar los archivos
atribuibles al ticket y excluir los ajenos sin modificarlos. Los cambios ajenos
conocidos no bloquean la entrega.

No se mezclan tickets en un commit. No se usan \`git add -A\` sin revisión ni
autocommits.
`;

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
