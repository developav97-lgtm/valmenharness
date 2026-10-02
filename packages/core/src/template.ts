/**
 * La plantilla canónica de un ticket.
 *
 * Un ticket nuevo no se inventa: se copia de una plantilla que ya tiene la forma
 * del contrato —los 18 campos, las 15 secciones en orden, los 7 bloques— y se
 * rellenan los huecos. Eso es lo que garantiza que `create` no pueda producir
 * algo inválido.
 *
 * **La plantilla es del harness, y el proyecto la puede adaptar.** El texto de
 * cada sección es prosa del proyecto, no del contrato: qué se espera que diga
 * «Diagnóstico» depende de cómo trabaja cada equipo. Por eso el harness trae una
 * plantilla por defecto y `valmen adopt` la copia a `.valmen/templates/ticket.md`
 * para que se pueda editar sin tocar el harness. La **estructura** —qué
 * secciones, en qué orden, con qué bloques— no es negociable, y el validador la
 * exige igual.
 *
 * Dos marcadores tienen que estar en cualquier plantilla que se use:
 *
 * - `# TYPE-MODULE-DESCRIPTION-YYYYMMDD` → se reemplaza por `# <ID>`.
 * - `<!-- Preservar literalmente la solicitud del PO. -->` → se reemplaza por la
 *   solicitud, que se conserva **literal**, con sus saltos de línea.
 *
 * Si falta el segundo, `create` falla en vez de escribir un ticket sin la
 * solicitud: un ticket sin el pedido original no se puede auditar.
 */

/** Marcador del encabezado, que se sustituye por el identificador. */
export const TEMPLATE_TITLE_MARKER = "# TYPE-MODULE-DESCRIPTION-YYYYMMDD";

/** Marcador de la solicitud, que se sustituye por el texto literal del PO. */
export const TEMPLATE_REQUEST_MARKER =
  "<!-- Preservar literalmente la solicitud del PO. -->";

/**
 * La sección de criterios tal como sale de la plantilla: vacía y con la guía delante.
 *
 * La usan quien materializa una feature y quien escribe un criterio en una prueba.
 * Vive acá, y no copiada en cada consumidor, porque quien define la forma de la
 * sección es este archivo: cuando la plantilla cambió, dos patrones literales se
 * rompieron en silencio y los tickets salieron sin criterios —un ticket sin
 * criterios es un ticket que no se puede evaluar—.
 */
export const TEMPLATE_CRITERIOS_VACIOS =
  /## Criterios de aceptación\n\n(?:<!--[\s\S]*?-->\n)?- \[ \]\n/;

/**
 * La plantilla por defecto.
 *
 * Se escribe con los valores del esquema 2 —`schema_version: 2`— porque es lo
 * que el harness escribe hoy. Un proyecto con tickets del esquema 1 los sigue
 * leyendo: el validador acepta los dos.
 */
export const TICKET_TEMPLATE = `---
schema_version: 2
id: TYPE-MODULE-DESCRIPTION-YYYYMMDD
title: Título corto y descriptivo
type: BUGFIX
module: MODULO
workflow_status: intake
qa_status: pending
release_status: unreleased
user_visible: false
sync_impact: false
migration_impact: false
docker_impact: false
risk_level: normal
created: YYYY-MM-DD
updated: YYYY-MM-DD
related_ticket: null
target_release: null
released_in: null
---

${TEMPLATE_TITLE_MARKER}

## Solicitud original

${TEMPLATE_REQUEST_MARKER}

### Supuestos y decisiones pendientes

<!-- Si el pedido nombra algo que el código no tiene —parámetro, permiso,
campo, bandera, columna, migración— y no lo especifica, listá cada elemento
con su pregunta antes de avanzar a análisis; el análisis no planifica sobre
la adivinanza. Si no hay ninguno, escribí «Ninguno» y seguí. -->
Ninguno.

## Descripción funcional

- Alcance:
- Usuario o rol afectado:
- Comportamiento actual:
- Comportamiento esperado:

## Diagnóstico

- Archivos y flujo investigados:
- Causa raíz o hipótesis:
- Riesgos y compatibilidad:
- Impactos de sync, migración, Docker o despliegue:

## Plan

- Gate de plan y aprobación:
- Pasos ordenados:
  <!-- Cada paso nombra archivo, símbolo o comando. Un paso que no dice dónde ni
       con qué se toca no se puede ejecutar ni revisar, y la compuerta lo lee así. -->
  1.
  2.
- Rollback:

## Criterios de aceptación

<!-- Una afirmación verificable por criterio. Una frase con «y» son dos criterios:
     cada uno se despliega como una proposición propia, y una que agrupa varias
     afirmaciones cae en banda de revisión aunque el plan la cubra entera. -->
- [ ]

## Puntos

\`\`\`json
[]
\`\`\`

## Implementación

Pendiente.

## Pruebas

Pendiente de ejecución.

## QA

\`\`\`json
[]
\`\`\`

## Evidencia

\`\`\`json
[]
\`\`\`

## Retests

\`\`\`json
[]
\`\`\`

## Cierre

\`\`\`json
[]
\`\`\`

## Consumo de IA

\`\`\`json
[]
\`\`\`

## Release

Sin publicar todavía.

## Eventos

\`\`\`json
[]
\`\`\`
`;
