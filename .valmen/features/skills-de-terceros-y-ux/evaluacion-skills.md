# Evaluación de skills de terceros

Evaluación pedida por el PO el 2026-10-07 (R-SKILL-005) sobre la lista de una imagen que circuló. Las fuentes se consultaron en la web ese día. Las cifras (estrellas, ahorro de código o de tokens) son declaraciones de sus autores o de terceros: no son medidas propias y el ranking de estrellas de la imagen no coincidió con ninguna fuente. Ninguna skill se instala como consecuencia de este documento: lo que se decida «probar» pasa por la declaración con versión fijada y la revisión registrada de esta misma feature.

## Ponytail

- Fuente: [flaviocopes.com/ponytail](https://flaviocopes.com/ponytail) y [github.com/mikrammullah/PonyTail](https://github.com/mikrammullah/PonyTail) (consultadas el 2026-10-07).
- Qué hace: agrega una regla a cada petición de código —escribir solo lo que la tarea necesita— con una escalera de decisión (¿debe existir?, ¿ya existe en el código?, ¿lo da la librería estándar?, ¿una línea?) antes de escribir código nuevo. Sus autores declaran entre 80 % y 94 % menos código.
- Solapamiento: parcial con la regla del harness de no ampliar el alcance de un ticket y con el contrato de respuesta; no cubre la compuerta ni el registro.
- Riesgo: bajo en contenido (es una regla), pero como toda skill corre con los permisos del agente y puede empujar a quitar código que el plan sí pedía.
- Decisión: probar, en un proyecto y con versión fijada, midiendo si recorta el diff de los tickets sin saltarse criterios; solo tras la revisión registrada.

## Addy Osmani Skills

- Fuente: [dev.to: review de las 24 skills](https://dev.to/yimtheppariyapol/addy-osmani-agent-skills-review-24-production-skills-726k-stars-22em) y [claudemarketplaces.com](https://claudemarketplaces.com/skills/addyosmani/agent-skills/frontend-ui-engineering) (consultadas el 2026-10-07).
- Qué hace: un conjunto de skills de ingeniería (especificar antes de codificar, probar antes de integrar, medir antes de optimizar) con comandos como `/spec`, `/plan`, `/build`, `/review`; su skill de ingeniería de interfaces evita los patrones genéricos de las pantallas generadas.
- Solapamiento: alto con el flujo de ticket, análisis, plan y compuertas del harness; bajo en la parte de interfaces, que complementa a UI UX Pro Max e Impeccable.
- Riesgo: medio; trae su propio flujo de fases que puede chocar con la aprobación humana y con las compuertas si se instala completo.
- Decisión: probar solo la skill de ingeniería de interfaces, con versión fijada; descartar el resto del paquete por solapar el flujo del harness.

## Awesome Claude Skills

- Fuente: [jimmysong.io](https://jimmysong.io/ai/awesome-claude-skills) y [horadecodar.com.br](https://horadecodar.com.br/awesome-claude-skills/) (consultadas el 2026-10-07).
- Qué hace: no es una skill sino varios índices comunitarios con el mismo nombre (travisvn, ComposioHQ, karanb192, VoltAgent y otros), cada uno con su propia curaduría.
- Solapamiento: ninguno; es un catálogo, no una capacidad.
- Riesgo: alto como fuente de instalación, porque los criterios de inclusión prueban que la skill existe y tiene documentación, no que su código haya sido auditado ni que esté mantenida.
- Decisión: descartar como instalable. Sirve como lugar de búsqueda de candidatas, que entran solo por el proceso de declaración, versión fijada y revisión.

## Archify

- Fuente: no verificada. La búsqueda del 2026-10-07 no devolvió un proyecto con ese nombre; solo devolvió skills genéricas de análisis de arquitectura de código (por ejemplo [openskillindex.com](https://openskillindex.com/skills/aradotso-trending-skills-claude-reviews-claude-architecture)), que no se pueden atribuir a Archify.
- Qué hace: según la imagen, análisis de arquitectura y de la base de código.
- Solapamiento: probable con CodeGraph, que ya cubre el análisis estructural del código en este harness.
- Riesgo: no evaluable sin una fuente comprobable.
- Decisión: no verificable. Se reabre si el PO aporta el enlace del repositorio; mientras tanto, CodeGraph cubre la necesidad.

## Superpowers

- Fuente: [trevorlasn.com](https://trevorlasn.com/blog/superpowers-claude-code-skills) y [mcp.directory](https://mcp.directory/blog/claude-superpowers-skill-guide) (consultadas el 2026-10-07).
- Qué hace: un marco de skills de Jesse Vincent (obra) que impone desarrollo guiado por pruebas, planificación estructurada, revisión entre tareas y subagentes; bloquea el avance ante problemas críticos.
- Solapamiento: alto con el flujo del harness (plan, aprobación, pruebas, revisión) y con las compuertas.
- Riesgo: alto si se instala entero, porque impone su propio plan y su propia revisión y puede borrar código escrito antes de que exista una prueba, lo que choca con el ticket aprobado como fuente de verdad.
- Decisión: descartar la instalación completa; tomar ideas sueltas como skills locales del harness (verificar antes de dar algo por terminado y depuración sistemática por causa raíz).

## Caveman

- Fuente: [pasqualepillitteri.it](https://pasqualepillitteri.it/en/news/846/claude-code-caveman-mode-token-saving) y [decrypt.co](https://decrypt.co/363440/devs-claude-talk-like-caveman-cut-costs-work-better?amp=1) (consultadas el 2026-10-07).
- Qué hace: comprime la prosa de salida del modelo en frases telegráficas para reducir tokens (sus autores declaran en promedio 65 %, entre 22 % y 87 %), sin tocar el código ni los errores citados.
- Solapamiento: total con el contrato de respuesta del harness (la respuesta va primero, el largo sigue el peso del pedido), que ya acota la salida en todos los clientes.
- Riesgo: medio; un estilo telegráfico degrada la claridad en español para quien lee y choca con el contrato de «Cómo se responde».
- Decisión: descartar, por duplicar lo que el contrato de respuesta ya impone.
