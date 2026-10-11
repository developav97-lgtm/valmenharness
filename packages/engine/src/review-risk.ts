/**
 * El riesgo de la revisión del diff, calculado en código a partir de lo que toca y del ticket
 * (R-REV-002).
 *
 * Cuánta revisión merece un cambio no lo decide un modelo ni la prosa de una skill: sale de las
 * rutas que el diff toca y de lo que el ticket declara, y es el mismo resultado en cada corrida.
 * Esta función **no** decide qué hace la compuerta con el nivel: eso es de la compuerta de revisión.
 * Tampoco consulta a ningún modelo ni escribe nada.
 *
 * Tres niveles. Bajo: solo documentación, texto o pruebas. Medio: código funcional fuera de las
 * categorías críticas. Alto: alguna categoría crítica (migraciones, despliegue, autenticación, CI,
 * `.valmen/`), un ticket SECURITY, un impacto declarado o `risk_level` alto. Una persona puede
 * subir el nivel a mano (`subirA`); nunca bajarlo.
 */
import { type ParsedTicket, declaredImpactIds } from "@valmen/core";

import { type EjecutorDeGit, ejecutarGitPermitido } from "./integration-rules.js";
import { categoriasDeRuta, esArchivoDePrueba } from "./path-categories.js";

/** Cómo cambió un archivo: agregado, modificado o borrado. Un renombre llega como un borrado y un alta. */
type EstadoDeCambio = "A" | "M" | "D";

/** Un archivo que el diff toca. Un borrado lleva su ruta anterior. */
interface CambioDelDiff {
  readonly estado: EstadoDeCambio;
  readonly ruta: string;
}

type NivelDeRiesgo = "bajo" | "medio" | "alto";

/** El riesgo de una revisión, con el porqué. */
interface RiesgoDeRevision {
  readonly nivel: NivelDeRiesgo;
  /** Las razones del nivel final: lo que lo causa, no todo lo que el diff toca. */
  readonly motivos: readonly string[];
  /** Cada archivo del diff con el nivel que le tocó y por qué. */
  readonly archivos: readonly {
    readonly ruta: string;
    readonly estado: EstadoDeCambio;
    readonly nivel: NivelDeRiesgo;
    readonly motivo: string;
  }[];
}

const ORDEN: Record<NivelDeRiesgo, number> = { bajo: 0, medio: 1, alto: 2 };

/** Documentación o texto, por extensión. */
const ES_TEXTO = /\.(md|mdx|markdown|txt|rst|adoc)$/i;

const nivelMayor = (a: NivelDeRiesgo, b: NivelDeRiesgo): NivelDeRiesgo =>
  ORDEN[b] > ORDEN[a] ? b : a;

/**
 * Los archivos que cambia `destino` respecto de `base`, con su estado.
 *
 * Usa `git diff --name-status --no-renames -z` por la lista cerrada de git del motor, y no
 * `--name-only`: este informa un renombre solo con la ruta nueva —la de autenticación desaparece— y
 * entrecomilla con escapes las rutas no ASCII. Sin renombres, uno llega como el borrado de la ruta
 * vieja más el alta de la nueva; `-z` deja las rutas tal cual. Con base y destino iguales, `[]`.
 */
export function cambiosDelDiff(
  root: string,
  base: string,
  destino: string,
  ejecutor?: EjecutorDeGit,
): CambioDelDiff[] {
  const salida = ejecutarGitPermitido(
    root,
    ["diff", "--name-status", "--no-renames", "-z", base, destino, "--"],
    ejecutor,
  );
  if (salida.status !== 0) throw new Error(`git diff falló: ${salida.stderr.trim()}`);
  const partes = salida.stdout.split("\0");
  const cambios: CambioDelDiff[] = [];
  for (let i = 0; i + 1 < partes.length; i += 2) {
    const letra = partes[i];
    const ruta = partes[i + 1];
    if (letra === undefined || ruta === undefined || ruta === "") continue;
    cambios.push({ estado: letra === "A" || letra === "D" ? letra : "M", ruta });
  }
  return cambios;
}

/** Si la ruta es parte del registro del propio ticket: su directorio o su archivo de recibos. */
function esRegistroDelTicket(ruta: string, ticketId: string, ticketsDir: string): boolean {
  if (ruta === `.valmen/receipts/${ticketId}.jsonl`) return true;
  const prefijo = ticketsDir.replace(/^\.\//, "").replace(/\/+$/, "");
  if (!ruta.startsWith(`${prefijo}/`)) return false;
  const [anio, id, ...resto] = ruta.slice(prefijo.length + 1).split("/");
  return anio !== undefined && /^\d{4}$/.test(anio) && id === ticketId && resto.length > 0;
}

/** El nivel de un archivo y su motivo: gana la primera regla que aplica. */
function clasificar(
  cambio: CambioDelDiff,
  ticketId: string,
  ticketsDir: string,
  scriptsDePrueba: ReadonlySet<string>,
): { readonly nivel: NivelDeRiesgo; readonly motivo: string } {
  const ruta = cambio.ruta.replace(/^\.\//, "");
  // El registro del propio ticket: sin esta excepción todo ticket tocaría `.valmen/` y daría alto.
  // Borrarlo no cuenta: quitar el registro de un ticket no es escribirlo.
  if (cambio.estado !== "D" && esRegistroDelTicket(ruta, ticketId, ticketsDir)) {
    return { nivel: "bajo", motivo: `${ruta} (registro del ticket)` };
  }
  // Una sola categoría crítica basta, aunque otra que casa antes no lo sea o el archivo sea
  // texto o una prueba.
  const criticas = categoriasDeRuta(ruta).filter((categoria) => categoria.critica);
  if (criticas.length > 0) {
    return {
      nivel: "alto",
      motivo: `${ruta} (${criticas.map((categoria) => categoria.nombre).join(", ")})`,
    };
  }
  if (scriptsDePrueba.has(ruta))
    return { nivel: "medio", motivo: `${ruta} (script de test-commands)` };
  if (esArchivoDePrueba(ruta)) {
    return cambio.estado === "D"
      ? { nivel: "medio", motivo: `${ruta} (borra una prueba)` }
      : { nivel: "bajo", motivo: `${ruta} (prueba)` };
  }
  if (ES_TEXTO.test(ruta))
    return { nivel: "bajo", motivo: `${ruta} (documentación o texto)` };
  // Lo que queda y casa con una categoría no es crítico: hoy, «pantallas».
  const noCriticas = categoriasDeRuta(ruta).map((categoria) => categoria.nombre);
  return {
    nivel: "medio",
    motivo: `${ruta} (${noCriticas.length > 0 ? noCriticas.join(", ") : "código funcional"})`,
  };
}

/** Lo que el ticket declara que sube la revisión a alto. */
function factoresDelTicket(ticket: ParsedTicket): string[] {
  const factores: string[] = [];
  if (ticket.fields.type === "SECURITY") factores.push("el ticket es de tipo SECURITY");
  for (const impacto of declaredImpactIds(ticket))
    factores.push(`el ticket declara ${impacto}`);
  const riesgo = ticket.fields.risk_level;
  if (riesgo === "high" || riesgo === "critical")
    factores.push(`el ticket tiene risk_level ${riesgo}`);
  return factores;
}

/**
 * El riesgo de revisar `cambios` para `ticket`.
 *
 * El nivel es el máximo de los archivos, los factores del ticket y `subirA`. `subirA` sube el nivel
 * calculado y nunca lo baja: si pide uno menor, el nivel queda y el motivo lo dice. `scriptsDePrueba`
 * son los scripts que nombra `test-commands`: tocarlos cambia cómo se prueba todo, así que no son
 * una prueba más. `ticketsDir` es el del registro (`RegistryPaths.ticketsDir`).
 */
export function riesgoDeRevision(entrada: {
  readonly ticket: ParsedTicket;
  readonly cambios: readonly CambioDelDiff[];
  readonly ticketsDir: string;
  readonly scriptsDePrueba?: readonly string[];
  readonly subirA?: NivelDeRiesgo;
}): RiesgoDeRevision {
  const { ticket, cambios, ticketsDir } = entrada;
  const scripts = new Set(
    (entrada.scriptsDePrueba ?? []).map((script) => script.replace(/^\.\//, "")),
  );
  const archivos = cambios.map((cambio) => ({
    ruta: cambio.ruta,
    estado: cambio.estado,
    ...clasificar(cambio, ticket.fields.id, ticketsDir, scripts),
  }));

  // Cada causa con su nivel, en el orden en que se presentan: archivos, ticket, subida a mano.
  const causas: { nivel: NivelDeRiesgo; motivo: string }[] = [
    ...archivos.map(({ nivel, motivo }) => ({ nivel, motivo })),
    ...factoresDelTicket(ticket).map((motivo) => ({ nivel: "alto" as const, motivo })),
  ];
  const calculado = causas.reduce<NivelDeRiesgo>(
    (nivel, causa) => nivelMayor(nivel, causa.nivel),
    "bajo",
  );

  let nivel = calculado;
  let notaDeSubida: string | undefined;
  if (entrada.subirA !== undefined) {
    if (ORDEN[entrada.subirA] > ORDEN[calculado]) {
      nivel = entrada.subirA;
      causas.push({
        nivel,
        motivo: `se subió a mano a ${entrada.subirA} (el cálculo daba ${calculado})`,
      });
    } else if (ORDEN[entrada.subirA] < ORDEN[calculado]) {
      notaDeSubida = `subirA ${entrada.subirA} no baja el nivel: el cálculo da ${calculado}`;
    }
  }

  const motivos = [
    ...(cambios.length === 0 ? ["el diff no toca archivos"] : []),
    ...causas.filter((causa) => causa.nivel === nivel).map((causa) => causa.motivo),
    ...(notaDeSubida === undefined ? [] : [notaDeSubida]),
  ];
  return { nivel, motivos, archivos };
}
