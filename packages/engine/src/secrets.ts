/**
 * El detector de secretos.
 *
 * El `AGENTS.md` prohíbe exponer credenciales, y una prohibición escrita es una
 * regla que depende de que nadie se descuide. Esto la vuelve mecánica, por dos
 * caminos que no son el mismo:
 *
 * - **Lo que se escribe en un ticket o un plan.** Ese texto viaja a un proveedor
 *   externo cuando una compuerta lo evalúa, así que un secreto ahí no es un
 *   riesgo futuro: ya salió de la máquina. Por eso el chequeo corre **antes** de
 *   la llamada al modelo.
 * - **Lo que se está por commitear.** Un secreto commiteado no se descommitea:
 *   queda en el historial aunque se borre en el commit siguiente.
 *
 * **Sin dependencias, y con precisión antes que cobertura.** La alternativa era
 * `gitleaks`, que es una herramienta excelente y también un binario externo: el
 * motor no ejecuta nada que no traiga, y el camino crítico del harness no debería
 * poder romperse porque un binario no está en el `PATH` de la máquina de otro. Lo
 * que se pierde en cobertura se compensa con lo que importa más acá: **un
 * detector que grita en falso se ignora, y un detector ignorado deja pasar el
 * secreto de verdad.** Los patrones son los que tienen forma inconfundible, más
 * las asignaciones cuyo valor parece aleatorio, y nada más.
 *
 * Ningún hallazgo imprime el valor encontrado: el reporte lo tapa. Un detector
 * que copia el secreto a la consola, al recibo o al log lo multiplica.
 */
import { pendingChanges, pendingFiles } from "./diff.js";

// Se reexporta porque era la puerta por la que este módulo lo ofrecía, y quien lo
// importaba desde acá no tiene por qué enterarse de que el recorrido del diff se
// mudó a su propio archivo.
export { pendingFiles };

/** Un patrón con nombre. El identificador es lo que se reporta, nunca el valor. */
interface Patron {
  readonly id: string;
  readonly description: string;
  readonly re: RegExp;
}

/**
 * Los patrones de forma inconfundible.
 *
 * Cada uno tiene un prefijo o una estructura que no aparece por casualidad en
 * prosa ni en código. Si un patrón nuevo no cumple eso, va abajo, con las
 * asignaciones.
 */
const PATRONES: readonly Patron[] = [
  {
    id: "clave-privada",
    description: "Una clave privada completa",
    re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  },
  {
    id: "aws-access-key",
    description: "Un identificador de acceso de AWS",
    re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/,
  },
  {
    id: "github-token",
    description: "Un token de GitHub",
    re: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/,
  },
  {
    id: "clave-de-api",
    description: "Una clave de API con prefijo `sk-`",
    re: /\bsk-[A-Za-z0-9_-]{20,}\b/,
  },
  {
    id: "slack-token",
    description: "Un token de Slack",
    re: /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/,
  },
  {
    id: "google-api-key",
    description: "Una clave de API de Google",
    re: /\bAIza[0-9A-Za-z_-]{35}\b/,
  },
  {
    id: "jwt",
    description: "Un token JWT",
    re: /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/,
  },
  {
    id: "cadena-de-conexion",
    description: "Una cadena de conexión con usuario y contraseña",
    re: /\b(?:postgres(?:ql)?|mysql|mariadb|mongodb(?:\+srv)?|redis|amqp|mssql):\/\/[^:@\s/]+:[^@\s/]+@/i,
  },
  {
    id: "token-bearer",
    description: "Un encabezado `Authorization: Bearer` con token",
    re: /\bBearer\s+[A-Za-z0-9._-]{20,}/,
  },
];

/** La etiqueta de una asignación de credencial. */
const ETIQUETA_RE =
  /\b(?:api[_-]?key|apikey|secret|secret[_-]?key|access[_-]?token|auth[_-]?token|token|password|passwd|contrase[ñn]a|clave|private[_-]?key|client[_-]?secret)\b\s*[:=]\s*["'`]?([A-Za-z0-9+/_=-]{12,})["'`]?/i;

/**
 * Lo que descarta una asignación que no es un secreto.
 *
 * Son las formas en que se escribe un valor de mentira: en documentación, en
 * ejemplos y en plantillas. Sin esta lista el detector marcaría cada `API_KEY=`
 * de un README, y un detector que marca el README se apaga.
 */
const NO_ES_SECRETO = [
  "example",
  "placeholder",
  "changeme",
  "change-me",
  "your-",
  "your_",
  "xxxx",
  "redacted",
  "dummy",
  "process.env",
  "os.environ",
  "{{",
  "${",
  "<",
  ">",
  "…",
  "***",
];

/**
 * La marca que perdona una línea.
 *
 * Existe porque hay casos legítimos: la prueba del propio detector, un fixture
 * con una clave de mentira que igual tiene forma de clave, la documentación de un
 * formato. Sin una salida, la única forma de tener esos archivos sería apagar el
 * chequeo entero —y un chequeo que se apaga no protege nada—.
 */
const PERDONA_RE = /valmen:allow-secret/i;

/** Lo que se salta la marca para llegar a la línea del valor. */
const COMENTARIO_RE = /^\s*(?:\/\/|#|--|;)/;

/** Un secreto encontrado. **No lleva el valor**: lo que se reporta lo describe. */
export interface SecretFinding {
  readonly kind: string;
  readonly description: string;
  /** La línea, contando desde 1. */
  readonly line: number;
  /** La línea con el valor tapado, que es lo que se puede mostrar sin repetirlo. */
  readonly preview: string;
}

/** `true` si el valor capturado parece un secreto y no una palabra. */
function pareceSecreto(valor: string): boolean {
  if (valor.length < 12) return false;
  const minusculas = valor.toLowerCase();
  if (NO_ES_SECRETO.some((marca) => minusculas.includes(marca))) return false;
  // Un valor de una sola letra repetida no es una clave: es un relleno.
  return new Set(valor).size > 3;
}

/** Tapa el valor encontrado y deja la etiqueta, que es lo que ayuda a ubicarlo. */
function tapar(linea: string, desde: number, hasta: number): string {
  const recortada = linea.length > 160 ? `${linea.slice(0, 157)}...` : linea;
  const inicio = Math.max(0, Math.min(desde, recortada.length));
  const fin = Math.max(inicio, Math.min(hasta, recortada.length));
  return `${recortada.slice(0, inicio)}«oculto»${recortada.slice(fin)}`;
}

/**
 * Busca secretos en un texto.
 *
 * Devuelve un hallazgo por línea y patrón: repetir el mismo en diez líneas de un
 * archivo generado no aporta nada, y el que lee necesita saber dónde está, no
 * cuántas veces.
 */
export function scanSecrets(texto: string): SecretFinding[] {
  const hallazgos: SecretFinding[] = [];
  const lineas = texto.split("\n");

  // La marca perdona su línea y la del valor que sigue, aunque haya comentarios
  // en el medio: en YAML, o cuando hay que explicar por qué el valor es legítimo,
  // el comentario va arriba y no al costado. Una marca que solo perdonara su
  // propia línea obligaría a romper el formato —o a dejar la explicación afuera—
  // para poder usarla, y la primera vez que se usa se descubre el problema.
  let perdonada = -1;

  for (const [indice, linea] of lineas.entries()) {
    if (PERDONA_RE.test(linea)) {
      let siguiente = indice + 1;
      while (siguiente < lineas.length && COMENTARIO_RE.test(lineas[siguiente] as string)) {
        siguiente += 1;
      }
      perdonada = siguiente;
      continue;
    }
    if (indice <= perdonada) continue;

    let reconocido = false;
    for (const patron of PATRONES) {
      const match = patron.re.exec(linea);
      if (match === null) continue;
      reconocido = true;
      const desde = match.index;
      hallazgos.push({
        kind: patron.id,
        description: patron.description,
        line: indice + 1,
        preview: tapar(linea, desde, desde + match[0].length),
      });
    }

    // Una línea que ya coincidió con un patrón con forma propia no se reporta
    // otra vez por parecer una asignación: el mismo secreto dos veces en el
    // reporte hace dudar de si son dos.
    if (reconocido) continue;
    const asignacion = ETIQUETA_RE.exec(linea);
    if (asignacion === null) continue;
    const valor = asignacion[1] as string;
    if (!pareceSecreto(valor)) continue;

    const desde = (asignacion.index ?? 0) + asignacion[0].indexOf(valor);
    hallazgos.push({
      kind: "credencial-asignada",
      description: "Una credencial asignada con un valor que parece real",
      line: indice + 1,
      preview: tapar(linea, desde, desde + valor.length),
    });
  }

  return hallazgos.sort((a, b) => a.line - b.line);
}

/** Un hallazgo con el archivo donde está. */
export interface FileSecretFinding extends SecretFinding {
  readonly path: string;
}

/** Lo que devuelve una revisión de cambios pendientes. */
export interface PendingSecrets {
  readonly findings: readonly FileSecretFinding[];
  /** Cuántos archivos se miraron, para poder decir «no hay nada» con fundamento. */
  readonly scanned: number;
}

/**
 * Revisa los cambios pendientes de un proyecto.
 *
 * Solo se miran las **líneas agregadas** por el cambio: marcar una línea que ya
 * estaba convertiría este chequeo en un obstáculo para tocar archivos viejos, y
 * el objetivo es que un secreto no **entre**, no auditar lo que ya entró.
 */
export function scanPendingChanges(root: string, staged = false): PendingSecrets {
  const { blocks, files } = pendingChanges(root, staged);
  const hallazgos: FileSecretFinding[] = [];

  // Se escanea el bloque entero, no línea por línea: la marca que perdona un
  // secreto vive en la línea de arriba, y trocear el texto la dejaría huérfana.
  for (const bloque of blocks) {
    for (const hallazgo of scanSecrets(bloque.lines.join("\n"))) {
      hallazgos.push({
        ...hallazgo,
        path: bloque.path,
        line: bloque.startLine + hallazgo.line - 1,
      });
    }
  }

  return {
    findings: hallazgos.sort((a, b) =>
      a.path === b.path ? a.line - b.line : a.path < b.path ? -1 : 1,
    ),
    scanned: files.length,
  };
}
