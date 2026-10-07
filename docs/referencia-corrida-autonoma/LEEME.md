# Referencia: la corrida autónoma de precarga-catalogos (2026-10-06)

Scripts que el agente escribió durante la corrida de la feature `precarga-catalogos` en SaiOpenCloud
(15 tickets, 5 sprints) y que automatizan el recorrido por el harness. **No son código del producto**:
son la evidencia de qué pasos se repiten y dónde hubo fricción, para convertirlos en un modo del harness.

- `advance.py` — intake → in_progress: rellena análisis y plan, corre las compuertas, decide las REVIEW con motivo y aprueba el plan por delegación.
- `fill.py` — rellena las secciones del ticket desde un JSON.
- `finish.py` — commit local, compuerta qa-mechanical, awaiting_user_tests y, si no es visual, QA y cierre.
- `close_po.py` — de awaiting_user_tests a closed con la confirmación literal del PO.

Fricciones que el modo debe resolver (todas ocurrieron):
1. `add-point` sin `--files` deja `affected_files` vacío y `add-evidence --reference worktree` falla («affected_files no puede incluir ticket.md»).
2. `qa-start --build-reference commit:<sha>` falla si los archivos del punto cambiaron después del commit de implementación; hay que usar el HEAD vigente.
3. Un ticket visual que sigue recibiendo correcciones tras `awaiting_user_tests` necesita que el cierre use el HEAD, no el SHA original.
4. No hay comando para avanzar el estado de una feature (decomposed → complete); se llamó a `advanceFeature` del motor con un script de node. Tampoco hay forma de escribir `verify.md`.
5. Una sesión que atiende varios tickets declara el consumo `manual:` sin números.
