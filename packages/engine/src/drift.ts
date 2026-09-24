/**
 * El detector de drift: lo que un ticket dice del código y el código no confirma.
 *
 * Un ticket que cita `MovimientoInventario.saldo_actual` cuando el campo se llama
 * `saldo` no es un ticket con una errata: es un plan que va a producir el cambio
 * equivocado, y el error se descubre al implementarlo —o peor, al probarlo—. Lo
 * mismo con un archivo que el plan declara modificar y no existe, o con un ticket
 * que cita a otro que no está en el registro.
 *
 * Se detecta **sin modelo y sin adivinar**: se extraen del ticket las rutas, los
 * símbolos y los identificadores que cita, y se contrastan contra el disco y
 * contra un índice del código. Nada de esto juzga si el plan es bueno; dice si
 * apunta a cosas que existen.
 *
 * Tres decisiones que hacen que esto sirva en vez de estorbar:
 *
 * 1. **Un archivo que todavía no existe no es drift.** Un ticket en `planned`
 *    declara archivos que va a crear; avisar de eso sería avisar de lo normal. El
 *    chequeo mira desde `in_progress` en adelante, que es cuando el trabajo se
 *    hizo y el archivo debería estar. La excepción son los identificadores de
 *    otros tickets, que tienen que existir siempre.
 * 2. **Se busca la declaración, no la mención.** Para saber si un modelo tiene un
 *    campo no alcanza con que la palabra aparezca en el archivo: tiene que
 *    aparecer como declaración (`campo =`, `def campo`, `campo:`). Un nombre
 *    citado en un comentario no es un campo, y confundirlos daría un chequeo que
 *    aprueba lo que debería marcar.
 * 3. **Un índice, no una búsqueda por símbolo.** El repositorio se recorre una vez
 *    y las consultas se responden en memoria: un chequeo que tarda medio minuto
 *    por ticket no se corre.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

import { type RegistryPaths } from "./discovery.js";
import { listTickets, readTicket } from "./tickets.js";

/** Un hallazgo de drift. */
export interface DriftFinding {
  readonly ticketId: string;
  /**
   * Qué clase de desajuste es.
   *
   * `archivo-ausente` · `simbolo-ausente` · `miembro-ausente` · `ticket-ausente`
   */
  readonly kind: string;
  /** Lo que el ticket cita, tal como lo escribió. */
  readonly cited: string;
  /** La sección donde lo cita, para poder ir a la línea. */
  readonly section: string;
  /** Qué encontró el chequeo, en una frase. */
  readonly detail: string;
}

/** El informe. */
export interface DriftReport {
  readonly findings: readonly DriftFinding[];
  /** Cuántos tickets se miraron, para poder decir «no hay nada» con fundamento. */
  readonly scanned: number;
  /** Cuántos hay en el registro, para poder decir cuántos quedaron fuera. */
  readonly total: number;
  /** `true` si se incluyeron los cerrados. */
  readonly todos: boolean;
  /** Cuántos archivos de código entraron al índice de símbolos. */
  readonly indexed: number;
}

/** Las secciones donde un ticket habla del código. */
const SECCIONES = ["Diagnóstico", "Plan", "Implementación"];

/** Estados en los que el trabajo ya se hizo: ahí un archivo ausente es drift. */
const YA_TRABAJADO = [
  "in_progress",
  "awaiting_user_tests",
  "in_qa",
  "qa_approved",
  "changes_requested",
  "blocked",
  "closed",
];

/**
 * Las extensiones que se indexan.
 *
 * Solo código: el índice responde «¿este modelo declara este campo?», y meter
 * plantillas o documentos multiplicaría el trabajo sin responder nada nuevo.
 */
const EXTENSIONES = [
  ".py",
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".java",
  ".go",
  ".rb",
  ".php",
  ".cs",
  ".kt",
  ".swift",
  ".dart",
  ".vue",
  ".svelte",
];

/** Los directorios que no se recorren. */
const IGNORADOS = new Set([
  ".git",
  "node_modules",
  "__pycache__",
  ".venv",
  "venv",
  "env",
  "dist",
  "build",
  ".next",
  "coverage",
  ".mypy_cache",
  ".pytest_cache",
  "vendor",
  "target",
  "media",
  ".cache",
  "logs",
]);

/** El tamaño a partir del cual un archivo no se indexa: casi siempre es generado. */
const TAMANO_MAXIMO = 1024 * 1024;

/** Hasta cuántos archivos se indexan. Un techo para no recorrer un monorepo eterno. */
const ARCHIVOS_MAXIMOS = 8000;

/**
 * Una ruta citada por un ticket.
 *
 * Se exige una barra o una extensión conocida, y nada de espacios: `valmen sync`
 * entre comillas invertidas no es un archivo, y `docs/errors.md` sí.
 */
const RUTA_RE =
  /^[\w./-]+\.(?:py|ts|tsx|js|jsx|mjs|cjs|java|go|rb|php|cs|kt|swift|dart|vue|svelte|html|css|scss|json|ya?ml|toml|md|sql|sh)$/i;

/** Un símbolo con su clase: `MovimientoInventario.saldo_actual`. */
const SIMBOLO_RE = /^([A-Z]\w*)\.([a-z_]\w*)$/;

/** Un identificador de ticket. */
const TICKET_RE = /\b([A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+-\d{8})\b/g;

/** Las comillas invertidas de un texto, que es donde el código se cita. */
const CITAS_RE = /`([^`\n]+)`/g;

/** El índice del código: qué clases existen y qué declara cada archivo. */
interface Indice {
  /** Clase → archivos donde se declara. Una clase puede estar en varios. */
  readonly clases: Map<string, string[]>;
  /** Archivo → su contenido, para buscar miembros. */
  readonly contenido: Map<string, string[]>;
  /** Rutas relativas de todos los archivos, para resolver una ruta citada. */
  readonly rutas: Set<string>;
  /**
   * Nombre de archivo → rutas que lo llevan.
   *
   * Existe porque un ticket cita `restaurant.service.ts` sin la carpeta —es como
   * se habla del archivo en una conversación— y comprobarlo contra la raíz daría
   * un «no existe» falso en cada mención. Se paga con un nombre que resuelve a
   * varios archivos: ahí no se avisa, porque el chequeo prefiere callarse antes
   * que marcar algo que sí está.
   */
  readonly porNombre: Map<string, string[]>;
  readonly archivos: number;
}

/** Recorre el proyecto una vez y arma el índice. */
function indexar(root: string, techo = ARCHIVOS_MAXIMOS): Indice {
  const clases = new Map<string, string[]>();
  const contenido = new Map<string, string[]>();
  const rutas = new Set<string>();
  const porNombre = new Map<string, string[]>();
  let archivos = 0;

  const pila = [root];
  while (pila.length > 0 && archivos < techo) {
    const directorio = pila.pop() as string;
    let entradas: string[];
    try {
      entradas = readdirSync(directorio);
    } catch {
      continue;
    }
    for (const entrada of entradas) {
      if (IGNORADOS.has(entrada)) continue;
      const ruta = join(directorio, entrada);
      let info: ReturnType<typeof statSync>;
      try {
        info = statSync(ruta);
      } catch {
        continue;
      }
      if (info.isDirectory()) {
        pila.push(ruta);
        continue;
      }
      const relativaDeTodos = relative(root, ruta).split(sep).join("/");
      rutas.add(relativaDeTodos);
      porNombre.set(entrada, [...(porNombre.get(entrada) ?? []), relativaDeTodos]);

      if (info.size > TAMANO_MAXIMO) continue;
      const extension = entrada.slice(entrada.lastIndexOf(".")).toLowerCase();
      if (!EXTENSIONES.includes(extension)) continue;
      let texto: string;
      try {
        texto = readFileSync(ruta, "utf8");
      } catch {
        continue;
      }
      archivos += 1;
      const relativa = relative(root, ruta).split(sep).join("/");
      const lineas = texto.split("\n");
      contenido.set(relativa, lineas);
      for (const [numero, linea] of lineas.entries()) {
        const declaracion = /\b(?:class|interface|struct|enum|trait)\s+([A-Z]\w*)/.exec(
          linea,
        );
        if (declaracion !== null) {
          const nombre = declaracion[1] as string;
          const donde = clases.get(nombre) ?? [];
          if (!donde.includes(relativa)) clases.set(nombre, [...donde, relativa]);
        }
        void numero;
      }
    }
  }

  return { clases, contenido, rutas, porNombre, archivos };
}

/**
 * `true` si la ruta citada existe.
 *
 * Una ruta con carpeta se comprueba tal cual; un nombre suelto se busca entre los
 * archivos del proyecto, que es como se cita un archivo cuando se habla de él.
 */
function existeLaRuta(indice: Indice, root: string, citada: string): boolean {
  if (indice.rutas.has(citada) || existsSync(join(root, citada))) return true;
  // Una ruta citada suele ser un **fragmento** de la ruta real: el ticket escribe
  // `common/services/point-of-sale.service.ts` y el archivo vive en
  // `FrontEnd/src/app/common/services/`. Se acepta el final de la ruta, que es
  // como se habla de un archivo cuando se habla de él.
  const sufijo = `/${citada}`;
  for (const ruta of indice.rutas) {
    if (ruta.endsWith(sufijo)) return true;
  }
  for (const rutas of indice.porNombre.values()) {
    if (rutas.some((ruta) => ruta === citada || ruta.endsWith(sufijo))) return true;
  }
  return false;
}

/**
 * `true` si la cita apunta fuera del proyecto.
 *
 * `.codex/config.toml` o `~/.claude/settings.json` son configuración de la
 * máquina, no del repositorio: que no estén acá no dice nada del plan, y contarlo
 * como drift enseñaría a ignorar el informe.
 */
function fueraDelProyecto(citada: string): boolean {
  return citada.startsWith(".") || citada.startsWith("~") || citada.startsWith("/");
}

/**
 * `true` si el archivo declara ese miembro.
 *
 * Se busca la **declaración**: asignación, `def`, o anotación de tipo. Un nombre
 * que solo aparece en un comentario o en una cadena no declara nada, y confundir
 * las dos cosas haría que el chequeo aprobara justo lo que tiene que marcar.
 */
function declara(lineas: readonly string[], miembro: string): boolean {
  const escapado = miembro.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(?:^|[.\\s])${escapado}\\s*(?:=|:|\\(|\\?:)`);
  for (const linea of lineas) {
    const limpia = linea.trim();
    if (limpia.startsWith("#") || limpia.startsWith("//") || limpia.startsWith("*"))
      continue;
    if (re.test(linea)) return true;
  }
  return false;
}

/** Las citas de un texto, sin repetir. */
function citas(texto: string): string[] {
  return [
    ...new Set([...texto.matchAll(CITAS_RE)].map((match) => (match[1] as string).trim())),
  ];
}

/**
 * Busca el drift de un proyecto.
 *
 * Mira las secciones donde el ticket habla del código y contrasta lo que cita.
 * Los identificadores de otros tickets se comprueban siempre; las rutas y los
 * símbolos, solo cuando el trabajo ya se hizo —si el ticket está en `planned`,
 * citar un archivo que no existe es lo esperado, no un hallazgo—.
 *
 * Por defecto se miran los tickets **en curso**: un plan que apunta a un archivo
 * que no existe se corrige hoy, y esa es la utilidad del chequeo. Los cerrados
 * entran con `todos`, y ahí lo que aparece es historia —un archivo que el plan
 * citaba y que después se renombró o se borró—, que también se quiere poder ver
 * pero no en cada corrida.
 */
export function scanDrift(
  paths: RegistryPaths,
  options: {
    readonly ticketId?: string;
    /** Incluir los cerrados. Por defecto se miran solo los que siguen en curso. */
    readonly todos?: boolean;
  } = {},
): DriftReport {
  const filas = listTickets(paths).filter((fila) => {
    if (options.ticketId !== undefined) return fila.id === options.ticketId;
    if (options.todos === true) return true;
    return fila.workflowStatus !== "closed";
  });

  const todas = listTickets(paths);
  const enRegistro = new Set(todas.map((fila) => fila.id));
  const indice = indexar(paths.root);
  const findings: DriftFinding[] = [];

  for (const fila of filas) {
    const detalle = readTicket(paths, fila.id);
    if (detalle === null) continue;
    const trabajado = YA_TRABAJADO.includes(fila.workflowStatus);

    for (const seccion of SECCIONES) {
      const texto = detalle.sections[seccion];
      if (texto === undefined) continue;

      for (const cita of citas(texto)) {
        if (/\s/.test(cita) || cita.includes("://")) continue;
        // `FrontEnd/.../x.spec.ts` es una ruta abreviada a propósito: no dice
        // cuál es el archivo, y comprobarla contra el disco daría un «no existe»
        // que el propio ticket ya estaba evitando escribir.
        if (cita.includes("...") || cita.includes("…")) continue;

        if (RUTA_RE.test(cita)) {
          if (!trabajado) continue;
          // La ruta puede venir con anotación de línea; se comprueba el archivo.
          const ruta = cita.replace(/:\d+(-\d+)?$/, "");
          if (fueraDelProyecto(ruta)) continue;
          if (!existeLaRuta(indice, paths.root, ruta)) {
            findings.push({
              ticketId: fila.id,
              kind: "archivo-ausente",
              cited: cita,
              section: seccion,
              detail: ruta.includes("/")
                ? `El ticket cita \`${ruta}\` y ese archivo no existe en el proyecto.`
                : `El ticket cita \`${ruta}\` y no hay ningún archivo con ese nombre.`,
            });
          }
          continue;
        }

        const simbolo = SIMBOLO_RE.exec(cita);
        if (simbolo !== null) {
          if (!trabajado) continue;
          const clase = simbolo[1] as string;
          const miembro = simbolo[2] as string;
          const archivos = indice.clases.get(clase);
          if (archivos === undefined || archivos.length === 0) {
            findings.push({
              ticketId: fila.id,
              kind: "simbolo-ausente",
              cited: cita,
              section: seccion,
              detail: `El ticket cita \`${clase}\` y no hay ninguna clase con ese nombre.`,
            });
            continue;
          }
          // Se busca en **todos** los archivos que declaran la clase: `Meta` es
          // una clase interna de cada modelo, y quedarse con la primera que
          // aparezca marcaría como ausente un campo que está en la siguiente.
          const laTiene = archivos.some((archivo) =>
            declara(indice.contenido.get(archivo) ?? [], miembro),
          );
          if (!laTiene) {
            findings.push({
              ticketId: fila.id,
              kind: "miembro-ausente",
              cited: cita,
              section: seccion,
              detail:
                `\`${clase}\` existe en ${archivos.slice(0, 2).join(", ")}` +
                `${archivos.length > 2 ? ` y ${archivos.length - 2} más` : ""}, ` +
                `pero no declara \`${miembro}\`. El plan apunta a un nombre que el ` +
                "código no tiene.",
            });
          }
        }
      }

      for (const match of texto.matchAll(TICKET_RE)) {
        const citado = match[1] as string;
        if (citado === fila.id || enRegistro.has(citado)) continue;
        findings.push({
          ticketId: fila.id,
          kind: "ticket-ausente",
          cited: citado,
          section: seccion,
          detail: `El ticket cita a \`${citado}\`, que no está en el registro.`,
        });
      }
    }
  }

  return {
    findings,
    scanned: filas.length,
    total: todas.length,
    todos: options.todos === true || options.ticketId !== undefined,
    indexed: indice.archivos,
  };
}

/** El informe, en texto. */
export function renderDrift(report: DriftReport): string {
  if (report.findings.length === 0) {
    // Un «nada que avisar» sobre cero tickets revisados no dice nada, y peor:
    // parece una aprobación. Cuando no hay nada en curso se dice, con la salida.
    if (report.scanned === 0 && !report.todos && report.total > 0) {
      return (
        `Drift — no hay tickets en curso (${report.total} cerrado(s) en el registro).\n\n` +
        "  Este chequeo mira los tickets que siguen en curso, que es donde corregir el\n" +
        "  plan todavía sirve. Para revisar el histórico —planes que citan archivos que\n" +
        "  después se renombraron o se borraron—, corré `valmen drift --todos`.\n"
      );
    }
    return (
      `Drift — nada que avisar (${report.scanned} ticket(s) revisado(s), ` +
      `${report.indexed} archivo(s) indexado(s)).\n\n` +
      "  Los tickets citan archivos y símbolos que existen. Este chequeo no juzga si el\n" +
      "  plan es bueno: dice si apunta a cosas que están.\n"
    );
  }

  const porTicket = new Map<string, DriftFinding[]>();
  for (const hallazgo of report.findings) {
    const lista = porTicket.get(hallazgo.ticketId) ?? [];
    lista.push(hallazgo);
    porTicket.set(hallazgo.ticketId, lista);
  }

  const lineas = [
    `Drift — ${report.findings.length} hallazgo(s) en ${porTicket.size} ticket(s) ` +
      `de ${report.scanned} revisado(s)`,
    "",
  ];

  for (const [ticket, hallazgos] of porTicket) {
    lineas.push(`  ${ticket}`);
    for (const hallazgo of hallazgos) {
      lineas.push(`    · [${hallazgo.section}] ${hallazgo.detail}`);
    }
    lineas.push("");
  }

  lineas.push(
    "  Un ticket que cita lo que no existe produce el cambio equivocado, y el error",
    "  aparece al implementarlo. Corregir el plan cuesta una línea; descubrirlo después",
    "  cuesta el ticket entero. Esto no bloquea: avisa.",
    "",
  );

  return lineas.join("\n");
}
