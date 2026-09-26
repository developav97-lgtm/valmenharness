# S3 — Manuales del sistema y semilla RAG

Requisitos de la tercera ola: los manuales de usuario dejan de ser un trabajo
aparte y pasan a ser un subproducto del registro, y el corpus documental queda
listo para un agente que responda con cita.

## R-S3-001 — Proceso `actualizar-manuales` en el deploy

DEBE existir un proceso declarativo `actualizar-manuales` que el proceso de
deploy encadene como paso `kind: process` con `continue_on_failure: true`. El
proceso DEBE: detectar las pantallas tocadas por los tickets de la release
(los archivos están en los recibos), marcar los manuales desactualizados, y
dejar el listado como evidencia de la corrida. Un fallo en manuales NO DEBE
bloquear la release: avisa y sigue.

## R-S3-002 — Generación asistida del manual en Markdown

Para una pantalla nueva o desactualizada, el agente DEBE generar el `.md`
siguiendo la metodología del proyecto (plantilla, tono impersonal, cero rutas
visibles, código ISO) — la de `docs/manuales/usuario-final/PROCESO-MANUALES.md`
en SaiOpenCloud, declarada como skill del proyecto. El `.md` queda como fuente
de verdad; el portal web y el PDF son proyecciones que NO DEBEN cambiar su
mecanismo actual por esta ola.

## R-S3-003 — Auditoría contra el código

Antes de aceptarse, un manual generado DEBE pasar la auditoría con citas: cada
afirmación funcional verificada contra el archivo de la pantalla, con la línea
citada. La auditoría DEBE correrla un agente distinto del que escribió, o un
gate con checks mecánicos de citas, y su recibo queda en la corrida del
proceso.

## R-S3-004 — Corpus listo para RAG

Los manuales (`*.md`), la memoria (`decisions.md`, `errors.md`, aprendizajes) y
los tickets cerrados DEBEN quedar indexables como tres colecciones separadas,
cada una con su origen y fecha. El indexador DEBE ser un componente nuevo y
sustituible (la base vectorial es un plugin, no una dependencia del motor), y
DEBE poder correr incremental: solo lo que cambió desde la última pasada.
