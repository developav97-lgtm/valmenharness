/**
 * @valmen/engine — ejecución de gates.
 *
 * Esta capa une las piezas: localiza el ticket en disco, congela el estado que
 * verá el evaluador, elige el evaluador por capacidades, aplica los checks
 * mecánicos y emite el recibo. No decide nada por su cuenta: la decisión la toma
 * `@valmen/gate` comparando probabilidades contra umbrales.
 *
 * Vive en su propio paquete, y no en el CLI, porque el CLI y Mission Control
 * tienen que ejecutar **el mismo** gate. Dos implementaciones de este flujo
 * podrían dar dos veredictos distintos sobre el mismo ticket, que es justo lo
 * que el harness existe para impedir.
 */
export * from "./result.js";
export * from "./etapas.js";
export * from "./fases.js";
export * from "./discovery.js";
export * from "./project-resolution.js";
export * from "./execution-events.js";
export * from "./journeys.js";
export * from "./journey-windows.js";
export * from "./journey-authorization.js";
export * from "./journey-selection.js";
export * from "./machine-capacity.js";
export * from "./journey-roadmap.js";
export * from "./execution-activity.js";
export * from "./execution-sessions.js";
export * from "./execution-models.js";
export * from "./execution-contract.js";
export * from "./execution-status.js";
export * from "./diff.js";
export * from "./drift.js";
export * from "./secrets.js";
export * from "./presentation.js";
export * from "./standards.js";
export * from "./memory.js";
export * from "./learnings.js";
export * from "./materialize.js";
export * from "./provenance.js";
export * from "./notify.js";
export * from "./approval.js";
export * from "./usage.js";
export * from "./budget.js";
export * from "./value.js";
export * from "./tickets.js";
export * from "./state.js";
export * from "./receipts.js";
export * from "./index-file.js";
export * from "./mutate.js";
export * from "./transition.js";
export * from "./references.js";
export * from "./manuales.js";
export * from "./interfaz.js";
export * from "./manuales-auditar.js";
export * from "./corpus.js";
export * from "./append.js";
export * from "./create.js";
export * from "./features.js";
export * from "./spec.js";
export * from "./decompose.js";
export * from "./report.js";
export * from "./manifest.js";
export * from "./process.js";
export * from "./run-state.js";
export * from "./autonomous-run.js";
export * from "./autonomous-stops.js";
export * from "./autonomous-collisions.js";
export * from "./calibration.js";
export * from "./release.js";
export * from "./evaluators.js";
export * from "./cascade.js";
export * from "./gate.js";
export * from "./gate-promotion.js";
export * from "./simulate.js";
export * from "./resume.js";
export * from "./ask.js";
