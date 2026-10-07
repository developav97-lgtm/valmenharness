/**
 * Registra la aprobación del plan en un ticket de prueba.
 *
 * Desde R-CTRL-001 `transition --to approved` exige la aprobación **registrada** (un evento
 * con actor, fuente, frase y el hash del plan): la línea escrita en `## Plan` ya no basta.
 * Una prueba que lleva un ticket a `approved` pasa por aquí justo antes, igual que lo haría
 * la persona con `valmen approve-plan`; el entorno se pasa vacío para que una variable de
 * sesión desatendida del proceso de prueba no cambie el resultado.
 */
import { registrarAprobacionDePlan } from "../../packages/engine/src/plan-approval.js";

export function aprobarPlanEnPrueba(
  paths: { readonly root: string; readonly ticketsDir: string },
  ticketId: string,
): void {
  registrarAprobacionDePlan({
    paths,
    ticketId,
    actor: "Juan Andrade",
    source: "cli",
    quote: "Apruebo este plan (aprobación de prueba)",
    env: {},
  });
}
