# Adjuntos de una feature: refresco, enlaces externos y `.dc.html`

Un adjunto anexado **después de materializar** llega solo: `asset add` (y `anexar_adjunto_a_feature`) actualiza la sección de los tickets de la feature en `intake`, `analyzed`, `planned` o `blocked`, deja el evento `design-references-updated` e informa los que no tocó porque ya empezaron la implementación. `valmen feature asset refresh <slug> [--dry-run]` repite ese refresco a pedido.

Un enlace externo sin copia local **detiene** `valmen feature materialize` sin crear ningún ticket; si el enlace es solo bibliografía, `--allow-external-links` (MCP: `permitirEnlacesExternos`) deja seguir. `--dry-run` solo informa. Un `.dc.html` (la fuente del lienzo de diseño, que depende de `support.js`, `x-dc` y `sc-for`) se rechaza al anexarlo: se exporta la versión autónoma y se anexa esa.
