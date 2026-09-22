/**
 * El estado de un ticket que ve un evaluador.
 *
 * Esta función es la definición de "qué se envió". Su resultado se serializa de
 * forma estable y se hashea en el recibo, así que **dos copias de esta función
 * son dos gates distintos**: la misma aprobación tendría dos hashes según quién
 * la produjo y la comparación "¿cambió el ticket o cambió el modelo?" dejaría de
 * funcionar.
 *
 * Estaba duplicada en `gate.ts` y en `simulate.ts`. Una calibración hecha con la
 * copia del simulador no describiría al gate real en cuanto las dos se
 * separaran, así que ahora hay una sola.
 */
import { parseTicket } from "@valmen/core";
import { type MechanicalCheck } from "@valmen/gate";

/** Secciones del ticket que se envían al evaluador, según lo que declare el gate. */
export function buildGateState(text: string): Record<string, string> {
  const { sections, fields } = parseTicket(text);
  return {
    id: fields.id,
    tipo: fields.type,
    modulo: fields.module,
    riesgo: fields.risk_level,
    solicitud: sections["Solicitud original"].trim(),
    investigacion: sections["Diagnóstico"].trim(),
    plan: sections["Plan"].trim(),
    criterios: sections["Criterios de aceptación"].trim(),
  };
}

/**
 * Ejecuta los checks que decide el código.
 *
 * Se ejecutan **antes** de llamar a ningún modelo: lo que un script puede
 * decidir no se le pregunta a un modelo. Es una decisión de coste y de
 * confiabilidad, no de elegancia.
 *
 * Un check fallido bloquea sin gastar una llamada, así que la interfaz puede
 * mostrarlos antes de evaluar y decir por qué un gate va a bloquear.
 */
/**
 * `true` si la línea es un criterio de aceptación **con texto**.
 *
 * La distinción importa y costó un fallo real: la plantilla del ticket trae la
 * casilla vacía —`- [ ]`— lista para escribir, y contar las líneas que empiezan
 * por `- [` la daba por criterio. Un ticket con la sección sin rellenar pasaba el
 * check mecánico con «1 criterio(s)», la compuerta no tenía nada que evaluar y
 * **aprobaba sin evaluar nada**: el hueco quedaba en el registro como si estuviera
 * analizado.
 *
 * Una casilla marcada pero vacía es exactamente igual de vacía que una sin marcar,
 * así que las dos cuentan como «sin criterio». El texto de un criterio no empieza
 * por `[`, así que una casilla anidada tampoco se confunde con contenido.
 */
function tieneCriterioReal(linea: string): boolean {
  const match = /^\s*[-*]\s+\[[^\]]*\]\s*(.*)$/.exec(linea);
  if (match === null) return false;
  const texto = (match[1] as string).trim();
  return texto !== "" && !texto.startsWith("[");
}

export function runMechanicalChecks(text: string): MechanicalCheck[] {
  const { sections, blocks, fields } = parseTicket(text);
  const checks: MechanicalCheck[] = [];

  const criterios = sections["Criterios de aceptación"].trim();
  const items = criterios.split("\n").filter(tieneCriterioReal);
  checks.push({
    id: "criterios_presentes",
    description: "El ticket declara criterios de aceptación verificables.",
    result: items.length > 0 ? "pass" : "fail",
    detail:
      items.length > 0
        ? `${items.length} criterio(s)`
        : "ninguno; la plantilla deja la casilla vacía y hay que escribir el criterio",
  });

  const riesgoCritico = fields.risk_level === "high" || fields.risk_level === "critical";
  const plan = sections["Plan"].toLowerCase();
  checks.push({
    id: "rollback_si_critico",
    description: "Un ticket de riesgo alto o crítico declara rollback.",
    result: !riesgoCritico
      ? "skip"
      : plan.includes("rollback") || plan.includes("revertir")
        ? "pass"
        : "fail",
    detail: riesgoCritico ? `riesgo ${fields.risk_level}` : "riesgo no crítico",
  });

  checks.push({
    id: "impactos_declarados",
    description: "Los impactos de sync, migración y contenedores están declarados.",
    result: "pass",
    detail: `${blocks.Puntos.length} punto(s) registrados`,
  });

  return checks;
}
