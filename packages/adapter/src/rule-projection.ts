/**
 * Cómo se proyectan las reglas del proyecto cuando el documento tiene que ser
 * corto.
 *
 * `AGENTS.md` se carga entero en cada sesión, así que cada byte es contexto fijo
 * que se paga siempre, haya o no trabajo que lo use. Medido sobre SaiOpenCloud: 54 KB,
 * de los cuales 8 KB eran el «Por qué» de 18 estándares —la evidencia con la que se
 * decidió cada regla— y 12 KB las reglas de pantalla, que una sesión de backend no
 * necesita. La regla se carga siempre; la evidencia y lo que solo aplica a un tipo de
 * trabajo se consultan.
 *
 * Todo lo de este módulo es puro y determinista, por la misma razón que
 * `projectAgentsMd`: `sync --check` compara el archivo entero, y una proyección que
 * cambie entre dos corridas daría un falso «desactualizado».
 *
 * **El texto completo no se pierde ni se reescribe**: `.valmen/rules/` sigue entero y
 * es la fuente. Aquí solo se decide qué parte de él entra en cada documento.
 */
import { fail } from "@valmen/core";

import { type ConfigMap, readMap } from "./config.js";
import type { RuleFile } from "./project.js";
import { RESPONSE_CONTRACT_TITLE } from "./templates.js";

/** Los estándares viven en `.valmen/rules/estandares-<área>.md`. */
const STANDARD_PREFIX = "estandares-";

/** Largo máximo de un «Por qué» proyectado, en caracteres. */
export const POR_QUE_MAX = 160;

/**
 * Largo mínimo antes de dejar de sumar oraciones.
 *
 * Una primera oración de tres palabras («Ver AP-004.») cumple con ser corta y no dice
 * nada: se suman oraciones hasta que haya algo que leer.
 */
const POR_QUE_MIN = 80;

/** El «Por qué» de un estándar: la etiqueta con la que empieza el párrafo. */
const POR_QUE = /^\*\*Por qué:\*\*[ \t]*/;

/**
 * Lo que corta un párrafo «Por qué» sin que haya una línea en blanco: otra etiqueta
 * en negrita (`**Visto en:**`), un encabezado, un elemento de lista, un cerco de
 * código o una tabla.
 */
const CORTE_DE_PARRAFO =
  /^(?:\*\*[^*\n]+:\*\*|#{1,6}\s|\s*[-*+]\s|\s*\d+[.)]\s|\s*(?:```|~~~)|\s*\|)/;

const CERCA = /^\s*(```|~~~)/;

/** `true` si la regla es un estándar del proyecto (los únicos que se comprimen). */
export function isStandardRule(rule: Pick<RuleFile, "name">): boolean {
  return rule.name.startsWith(STANDARD_PREFIX);
}

/** Resume un «Por qué» a una línea: las primeras oraciones, con tope. */
function resumir(texto: string): { text: string; shortened: boolean } {
  const plano = texto.replace(/\s+/g, " ").trim();
  const oraciones = plano.match(/.+?[.!?](?=\s|$)|.+$/g) ?? [plano];

  let resumen = "";
  for (const oracion of oraciones) {
    resumen = resumen === "" ? oracion.trim() : `${resumen} ${oracion.trim()}`;
    if (resumen.length >= POR_QUE_MIN) break;
  }
  if (resumen.length <= POR_QUE_MAX) {
    return { text: resumen, shortened: resumen.length < plano.length };
  }

  // Se corta donde termina una cláusula si hay una a la vista, y si no en una palabra
  // entera: «…y solo lo que el verificador no…» no dice nada, y «…verifica cada
  // proposición…» sí.
  let corte = resumen.slice(0, POR_QUE_MAX);
  const clausula = Math.max(
    corte.lastIndexOf(", "),
    corte.lastIndexOf("; "),
    corte.lastIndexOf(": "),
    corte.lastIndexOf(" —"),
  );
  if (clausula >= POR_QUE_MIN) {
    corte = corte.slice(0, clausula);
  } else {
    const espacio = corte.lastIndexOf(" ");
    if (espacio > POR_QUE_MIN) corte = corte.slice(0, espacio);
  }

  // Un fragmento de código cortado deja una comilla abierta que, al renderizar, se
  // come el resto de la línea. Si el corte cayó dentro de uno, se descarta entero.
  if ((corte.match(/`/g) ?? []).length % 2 === 1) {
    corte = corte.slice(0, corte.lastIndexOf("`")).trimEnd();
  }

  return { text: `${corte.replace(/[\s,;:(—-]+$/, "")}…`, shortened: true };
}

/**
 * Deja cada «Por qué» de un archivo de reglas en una sola línea.
 *
 * Solo toca los párrafos que empiezan por `**Por qué:**` y no están dentro de un
 * bloque de código; el resto del archivo pasa tal cual. `shortened` cuenta los
 * párrafos a los que se les quitó texto, para que el documento pueda avisar de que lo
 * que ve es un resumen.
 */
export function compactPorQue(content: string): { text: string; shortened: number } {
  const lines = content.split(/\r?\n/);
  const out: string[] = [];
  let cercado = false;
  let acortados = 0;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] as string;

    if (CERCA.test(line)) {
      cercado = !cercado;
      out.push(line);
      continue;
    }
    if (cercado || !POR_QUE.test(line)) {
      out.push(line);
      continue;
    }

    const bloque = [line.replace(POR_QUE, "")];
    while (i + 1 < lines.length) {
      const siguiente = lines[i + 1] as string;
      if (siguiente.trim() === "" || CORTE_DE_PARRAFO.test(siguiente)) break;
      bloque.push(siguiente.trim());
      i += 1;
    }

    const resumen = resumir(bloque.join(" "));
    if (resumen.shortened) acortados += 1;
    out.push(`**Por qué:** ${resumen.text}`);
  }

  return { text: out.join("\n"), shortened: acortados };
}

/** Reglas del proyecto que `rules-to-skills` encamina a skills, por nombre de regla. */
export type RoutedRules = Readonly<Record<string, readonly string[]>>;

/**
 * Lee `rules-to-skills` de la configuración.
 *
 * Es un mapa `<regla sin .md>: [<id de skill>, …]`. Una regla encaminada deja de
 * entrar en `AGENTS.md` —queda un puntero— y entra en las skills que nombra, que el
 * agente carga cuando el trabajo las pide. Una forma que no se pueda leer **falla**
 * en vez de ignorarse: una regla que el proyecto creyó mover y que sigue en
 * `AGENTS.md` (o que ya no está en ningún lado) es un tamaño que no baja sin decir
 * por qué.
 *
 * Que la regla y las skills existan no se comprueba aquí —este módulo no ve las
 * skills— sino donde se cruzan con ellas: `withRoutedRules`.
 */
export function routedRules(config: ConfigMap): RoutedRules {
  const mapa = readMap(config, "rules-to-skills");
  const resultado: Record<string, readonly string[]> = {};

  for (const [regla, valor] of Object.entries(mapa)) {
    const ids = typeof valor === "string" ? (valor === "" ? [] : [valor]) : valor;
    const lista = Array.isArray(ids) ? ids : null;
    if (
      lista === null ||
      lista.length === 0 ||
      !lista.every((id): id is string => typeof id === "string" && id !== "")
    ) {
      fail(`config.yaml: "rules-to-skills.${regla}" debe ser una lista de ids de skill.`);
    }
    resultado[regla] = lista as readonly string[];
  }

  return resultado;
}

/** «`a`», «`a` y `b`», «`a`, `b` y `c`». */
function listaDeSkills(ids: readonly string[]): string {
  const marcadas = ids.map((id) => `\`${id}\``);
  if (marcadas.length <= 1) return marcadas.join("");
  return `${marcadas.slice(0, -1).join(", ")} y ${marcadas[marcadas.length - 1] as string}`;
}

/**
 * Lo que queda en `AGENTS.md` de una regla encaminada: su título y un puntero.
 *
 * El título se conserva porque es lo que un agente busca, y el puntero dice dónde
 * está el contenido y dónde el texto completo. Sin puntero la regla desaparecería de
 * lo que el agente lee y nadie sabría que existe.
 */
export function routedRulePointer(
  rule: Pick<RuleFile, "name" | "source" | "content">,
  skills: readonly string[],
): string {
  const titulo = /^#\s+([^\n]*)/.exec(rule.content.trim())?.[1]?.trim() ?? rule.name;
  const donde = skills.length === 1 ? "la skill" : "las skills";
  return (
    `# ${titulo}\n\n` +
    `Estas reglas se proyectan a ${donde} ${listaDeSkills(skills)}: cárgalas antes de ` +
    `empezar el trabajo al que aplican. Texto completo en \`${rule.source}\`.`
  );
}

/** Quita acentos y mayúsculas para comparar títulos. */
function normalizar(texto: string): string {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

/**
 * Evita una segunda sección «Cómo se responde».
 *
 * El harness escribe la suya antes de las reglas. Un proyecto que ya tiene una con
 * ese título —porque la escribió a mano, o porque `adopt` la extrajo de su
 * `AGENTS.md` anterior— no pierde su texto: se retitula **en la proyección**
 * «Cómo se responde en este proyecto», y la fuente en `.valmen/rules/` no se toca.
 * Dos secciones con el mismo título obligan al agente a elegir cuál manda, que es lo
 * contrario de un contrato.
 */
export function retitleCollision(text: string): string {
  const objetivo = normalizar(RESPONSE_CONTRACT_TITLE);
  let cercado = false;

  return text
    .split("\n")
    .map((line) => {
      if (CERCA.test(line)) {
        cercado = !cercado;
        return line;
      }
      if (cercado) return line;

      const encabezado = /^(#{1,2})\s+(.+?)\s*$/.exec(line);
      if (encabezado !== null && normalizar(encabezado[2] as string) === objetivo) {
        return `## ${encabezado[2] as string} en este proyecto`;
      }
      return line;
    })
    .join("\n");
}
