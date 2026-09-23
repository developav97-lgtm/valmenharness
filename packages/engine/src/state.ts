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
import { diagnosedImpacts, impactIdsInFields, impactName, parseTicket } from "@valmen/core";

import { scanSecrets } from "./secrets.js";
import { type MechanicalCheck } from "@valmen/gate";

/** Secciones del ticket que se envían al evaluador, según lo que declare el gate. */
export function buildGateState(text: string): Record<string, string> {
  const { sections, fields } = parseTicket(text);
  return {
    id: fields.id,
    tipo: fields.type,
    modulo: fields.module,
    riesgo: fields.risk_level,
    // Los impactos van al estado **además** de generar proposiciones propias. Un
    // evaluador que responde por los criterios tiene que saber que este cambio
    // toca la migración: sin eso contesta como si fuera un bugfix de una línea, y
    // su respuesta es la misma para los dos casos.
    impactos:
      impactIdsInFields(fields)
        .map((impacto) => impactName(impacto))
        .join(", ") || "ninguno",
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
  const { sections, fields } = parseTicket(text);
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

  checks.push(chequeoDeImpactos(fields, sections["Diagnóstico"] ?? ""));
  checks.push(chequeoDeSecretos(text));

  return checks;
}

/**
 * Un secreto en el ticket es un secreto que ya salió.
 *
 * El texto del ticket es exactamente lo que se le manda al evaluador, así que un
 * token escrito en el diagnóstico o en el plan no es un riesgo futuro: viaja a un
 * proveedor externo en la llamada siguiente. Por eso el chequeo corre **antes** de
 * la evaluación y la detiene, en vez de avisar después.
 *
 * Lo que se reporta describe el hallazgo y lo ubica —el tipo y la línea— y nunca
 * lo repite: un detector que copia el secreto a la consola o al recibo lo
 * multiplica.
 */
function chequeoDeSecretos(texto: string): MechanicalCheck {
  const hallazgos = scanSecrets(texto);
  return {
    id: "sin_secretos",
    description: "El ticket no expone credenciales ni valores sensibles.",
    result: hallazgos.length === 0 ? "pass" : "fail",
    detail:
      hallazgos.length === 0
        ? "ninguno"
        : hallazgos
            .map((hallazgo) => `${hallazgo.kind} en la línea ${hallazgo.line}`)
            .join(", "),
  };
}

/**
 * Los impactos del frontmatter y los del diagnóstico tienen que coincidir.
 *
 * Este check existía **solo de nombre**: devolvía `pass` siempre y su detalle
 * hablaba de los puntos registrados, que no tiene nada que ver. Un check que
 * siempre pasa es peor que no tenerlo, porque la lista de comprobaciones dice que
 * algo se comprobó.
 *
 * Lo que comprueba ahora es la coherencia en la dirección que importa: **un
 * impacto declarado tiene que estar explicado**. Si el frontmatter dice que el
 * cambio toca la sincronización y el diagnóstico dice «ninguno», una de las dos
 * cosas es falsa, y el gate no puede preguntar por un impacto que el propio
 * ticket niega. La dirección contraria —una línea que menciona más de lo que
 * declara— no bloquea: la prosa puede hablar de un impacto para descartarlo
 * («no hay impacto de sync; el despliegue va aparte») y bloquear ahí sería
 * castigar una explicación honesta.
 */
function chequeoDeImpactos(
  fields: Readonly<Record<string, string>>,
  diagnostico: string,
): MechanicalCheck {
  const declarados = impactIdsInFields(fields);
  const linea = diagnosedImpacts(diagnostico);

  const base = {
    id: "impactos_declarados",
    description: "Los impactos declarados están explicados en el diagnóstico.",
  };

  if (!linea.found) {
    return {
      ...base,
      result: "fail",
      detail: "el diagnóstico no tiene la línea de impactos del contrato",
    };
  }
  if (linea.value === "") {
    return { ...base, result: "fail", detail: "la línea de impactos está sin rellenar" };
  }
  if (declarados.length === 0) {
    return {
      ...base,
      result: "pass",
      detail: linea.saysNone ? "sin impactos" : `declara: ${linea.value}`,
    };
  }
  if (linea.saysNone) {
    return {
      ...base,
      result: "fail",
      detail:
        `el frontmatter declara ${declarados.map(impactName).join(", ")} y el ` +
        "diagnóstico dice que no hay ninguno",
    };
  }

  // Que el diagnóstico no nombre cada impacto uno por uno **no bloquea**, y la
  // diferencia se aprendió mirando el registro real: un ticket de release dice
  // «aplican los cuatro» y es una declaración perfectamente coherente. Exigir la
  // palabra del contrato castigaba la forma de escribirlo, no un hueco —y una
  // regla que obliga a reescribir una frase clara es la clase de trámite que hace
  // que la gente deje de usar el proceso—. La señal se conserva donde sirve: en el
  // detalle, que es lo que la pantalla muestra.
  const sinNombrar = declarados.filter((impacto: string) => !linea.named.includes(impacto));
  if (sinNombrar.length > 0) {
    return {
      ...base,
      result: "pass",
      detail:
        `declara ${declarados.map(impactName).join(", ")}; el diagnóstico no ` +
        `${sinNombrar.length === 1 ? "lo" : "los"} nombra uno por uno`,
    };
  }

  return { ...base, result: "pass", detail: declarados.map(impactName).join(", ") };
}
