/**
 * Plantillas por stack: lo que un proyecto tarda años en aprender, escrito una vez.
 *
 * `valmen adopt` deja el proyecto con la configuración detectada y `.valmen/rules/`
 * **vacío**, porque el harness no puede separar solo lo que es regla de dominio de
 * lo que es flujo de trabajo. Eso está bien y es honesto —adivinar reglas sería
 * peor que no escribirlas—, pero significa que cada proyecto nuevo arranca de cero
 * incluso cuando su stack es el mismo que el de otro que ya pagó por aprender.
 *
 * Una plantilla es eso: las reglas que **no dependen del negocio** sino de la
 * arquitectura —cómo se despliega, qué rompe la sincronización, dónde se sube la
 * versión— escritas por quien ya se chocó con ellas.
 *
 * Tres reglas gobiernan lo que una plantilla puede hacer:
 *
 * 1. **No sobrescribe nada.** Un archivo que ya existe se deja como está y se dice.
 *    Las reglas del proyecto son del proyecto; una plantilla que pisa lo que alguien
 *    escribió es una plantilla que nadie vuelve a usar.
 * 2. **Se lee antes de aplicarse.** `valmen template show` muestra el contenido, y
 *    aplicarla sin mirar no es más rápido: es aplicar reglas a ciegas.
 * 3. **Es texto revisable, no un instalador.** No ejecuta nada, no baja nada de la
 *    red, y lo que escribe se lee en el diff como cualquier otro archivo.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";

import { fail, parseYamlSubset, type YamlMap, type YamlValue } from "@valmen/core";

/** Una plantilla, ya leída de disco. */
export interface Blueprint {
  readonly name: string;
  readonly title: string;
  readonly description: string;
  /** Los manifiestos cuya presencia sugiere esta plantilla. */
  readonly detects: readonly string[];
  /** Los archivos que escribe, relativos a la raíz del proyecto. */
  readonly files: readonly { readonly path: string; readonly content: string }[];
  /** Lo que aporta a la configuración, si aporta algo. */
  readonly configFragment: string | null;
}

/**
 * Dónde viven las plantillas.
 *
 * Se busca hacia arriba una carpeta que tenga `templates/` **y** `packages/`: la
 * segunda es lo que distingue la raíz del harness de cualquier otro directorio que
 * se llame igual. Funciona igual corriendo desde las fuentes que desde `dist`, que
 * es lo que hace falta para poder probarlo sin construir.
 */
export function blueprintsDir(desde: string = import.meta.dirname): string | null {
  let actual = desde;
  for (let niveles = 0; niveles < 6; niveles += 1) {
    const candidato = join(actual, "templates");
    if (existsSync(candidato) && existsSync(join(actual, "packages"))) return candidato;
    const padre = dirname(actual);
    if (padre === actual) break;
    actual = padre;
  }
  return null;
}

/** Las plantillas disponibles, por nombre. */
export function listBlueprints(directorio = blueprintsDir()): Blueprint[] {
  if (directorio === null) return [];

  let nombres: string[];
  try {
    nombres = readdirSync(directorio);
  } catch {
    return [];
  }

  const plantillas: Blueprint[] = [];
  for (const nombre of nombres.sort()) {
    const base = join(directorio, nombre);
    if (!existsSync(join(base, "blueprint.yaml"))) continue;
    try {
      plantillas.push(readBlueprint(directorio, nombre));
    } catch {
      // Una plantilla que no parsea no rompe el listado: se salta, y el comando
      // que la use dirá por qué. Descartarla en silencio escondería un archivo
      // roto en el repositorio del harness, que es donde sí se ve.
      continue;
    }
  }
  return plantillas;
}

/** Lee una plantilla concreta. */
export function readBlueprint(directorio: string, nombre: string): Blueprint {
  const base = join(directorio, nombre);
  const definicion = parseYamlSubset(readFileSync(join(base, "blueprint.yaml"), "utf8"), {
    fileName: "blueprint.yaml",
  });
  if (typeof definicion !== "object" || Array.isArray(definicion)) {
    fail(`La plantilla ${nombre} no declara un mapa.`);
  }

  const mapa = definicion as YamlMap;
  const archivos = mapa["files"];
  if (!Array.isArray(archivos) || archivos.length === 0) {
    fail(`La plantilla ${nombre} no declara archivos.`);
  }

  const fragmento = mapa["config"];
  const rutaFragmento = typeof fragmento === "string" ? join(base, fragmento) : null;

  return {
    name: typeof mapa["name"] === "string" ? (mapa["name"] as string) : nombre,
    title: typeof mapa["title"] === "string" ? (mapa["title"] as string) : nombre,
    description:
      typeof mapa["description"] === "string" ? (mapa["description"] as string) : "",
    detects: listaDeTextos(mapa["detects"]),
    files: archivos
      .filter((archivo): archivo is string => typeof archivo === "string")
      .map((archivo) => ({
        path: archivo,
        content: readFileSync(join(base, archivo), "utf8"),
      })),
    configFragment:
      rutaFragmento !== null && existsSync(rutaFragmento)
        ? readFileSync(rutaFragmento, "utf8")
        : null,
  };
}

/** Una lista de textos de un documento YAML, sin inventar. */
function listaDeTextos(valor: YamlValue | undefined): string[] {
  if (!Array.isArray(valor)) return [];
  return valor.filter((entrada): entrada is string => typeof entrada === "string");
}

/** Lo que una aplicación escribió, y lo que respetó. */
export interface BlueprintOutcome {
  readonly written: readonly string[];
  readonly skipped: readonly string[];
}

/**
 * Aplica una plantilla sobre un proyecto.
 *
 * Escribe en `.valmen/` y **no toca lo que ya existe**. La configuración no se
 * pisa nunca desde acá: el fragmento se devuelve aparte para que quien adopta lo
 * fusione, porque un archivo de configuración que la herramienta reescribe es un
 * archivo donde las decisiones de la persona desaparecen sin que nadie lo note.
 */
export function applyBlueprint(
  root: string,
  plantilla: Blueprint,
  options: { readonly dryRun?: boolean } = {},
): BlueprintOutcome {
  const dryRun = options.dryRun === true;
  const written: string[] = [];
  const skipped: string[] = [];

  for (const archivo of plantilla.files) {
    const destino = join(root, ".valmen", archivo.path);
    const relativa = relative(root, destino).split("\\").join("/");

    if (existsSync(destino)) {
      skipped.push(relativa);
      continue;
    }
    if (!dryRun) {
      mkdirSync(dirname(destino), { recursive: true });
      writeFileSync(destino, archivo.content, "utf8");
    }
    written.push(relativa);
  }

  return { written, skipped };
}

/** El informe de una aplicación, en texto. */
export function renderBlueprintOutcome(
  plantilla: Blueprint,
  resultado: BlueprintOutcome,
  dryRun: boolean,
): string {
  const lineas = [
    dryRun ? `Plantilla ${plantilla.name} (simulación)` : `Plantilla ${plantilla.name}`,
    "",
    `  ${plantilla.title}`,
  ];

  if (resultado.written.length > 0) {
    lineas.push("", dryRun ? "  Se escribiría:" : "  Escrito:");
    for (const archivo of resultado.written) lineas.push(`    ${archivo}`);
  }

  if (resultado.skipped.length > 0) {
    lineas.push(
      "",
      "  Ya existía, y no se toca:",
      ...resultado.skipped.map((archivo) => `    ${archivo}`),
    );
  }

  if (plantilla.configFragment !== null) {
    lineas.push(
      "",
      "  Configuración que aporta — fusiónela a mano si le sirve:",
      ...plantilla.configFragment
        .trimEnd()
        .split("\n")
        .map((linea) => `    ${linea}`),
    );
  }

  return `${lineas.join("\n")}\n`;
}
