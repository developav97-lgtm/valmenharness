#!/usr/bin/env node
/**
 * Programa el trabajo de los siguientes tickets de una feature como jobs de cron,
 * uno por ticket y cada uno en su propia sesión.
 *
 *   node scripts/programar-tickets.mjs --raiz <repo> --feature <slug> --perfil <perfil> \
 *     --cantidad 5 --inicio 2026-09-28T08:00:00 --cada 2h --deliver slack:D0C49E1UUJD \
 *     --skills a,b --autorizacion '<frase literal del PO>' --autorizado-por 'Juan Andrade' \
 *     --autorizado-el 2026-09-26 [--implementador sesion|opencode] [--nota '<texto>'] \
 *     [--linea-base '<texto>'] [--dry-run] [--salida <dir>]
 *
 * El orden y la elegibilidad salen del `tickets.yaml` de la feature, no de una lista
 * escrita a mano: se toma el ticket más temprano del grafo que esté en `intake` y cuyas
 * dependencias estén cerradas, contando como cerradas las que esta misma tanda va a
 * cerrar antes. Es la regla que la skill `programar-trabajo-de-tickets` documenta.
 *
 * Un job de cron es una sesión propia (`cron_<job>_<fecha>`) con su fila de costo: por eso
 * nunca se programan dos tickets en el mismo job.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const homeDelScript = dirname(fileURLToPath(import.meta.url));

const TIPOS_QUE_PIDEN_AUTORIZACION_APARTE = new Set(["SYNC", "SECURITY", "MIGRATION"]);

function banderas(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const clave = a.slice(2);
    const siguiente = argv[i + 1];
    if (siguiente === undefined || siguiente.startsWith("--")) out[clave] = true;
    else {
      out[clave] = siguiente;
      i += 1;
    }
  }
  return out;
}

const leer = (ruta) => readFileSync(ruta, "utf8");
const existe = (ruta) => existsSync(ruta);

/** Lee el subconjunto de `tickets.yaml` que el harness escribe: sprints, tickets y depends_on. */
function leerGrafo(texto) {
  const orden = [];
  let sprint = null;
  let ultimo = null;
  for (const linea of texto.split("\n")) {
    const mSprint = /^\s*- id: (S\d+)\s*$/.exec(linea);
    if (mSprint) {
      sprint = mSprint[1];
      continue;
    }
    const mTicket = /^\s*- id: ([A-Z][A-Z0-9-]+-\d{8})\s*$/.exec(linea);
    if (mTicket) {
      ultimo = { sprint, id: mTicket[1], title: "", deps: [] };
      orden.push(ultimo);
      continue;
    }
    const mTitulo = /^\s*title:\s*(.+?)\s*$/.exec(linea);
    if (mTitulo && ultimo) {
      ultimo.title = mTitulo[1].replace(/^["']|["']$/g, "");
      continue;
    }
    const mDep = /^\s*- ([A-Z][A-Z0-9-]+-\d{8})\s*$/.exec(linea);
    if (mDep && ultimo) ultimo.deps.push(mDep[1]);
  }
  return orden;
}

/** Lee el frontmatter plano de un `ticket.md`. */
function leerFrontmatter(ruta) {
  const partes = leer(ruta).split(/^---\s*$/m);
  const campos = {};
  if (partes.length < 2) return campos;
  for (const linea of partes[1].split("\n")) {
    const m = /^([a-z_]+):\s*(.*)$/.exec(linea);
    if (m) campos[m[1]] = m[2].trim();
  }
  return campos;
}

/** El resumen que va al prompt: el título y los requisitos que el ticket cita. */
function resumenDe(ruta, titulo) {
  const texto = leer(ruta);
  const bloque = /## Solicitud original([\s\S]*?)(?=\n## |\n# |$)/.exec(texto);
  const reqs = bloque
    ? bloque[1]
        .split("\n")
        .filter((l) => /^\s*-\s*R-/.test(l))
        .map((l) => l.replace(/^\s*-\s*/, "").trim())
    : [];
  const cabeza = reqs.length > 0 ? reqs.join("; ") : titulo;
  return cabeza.length > 500 ? `${cabeza.slice(0, 497)}...` : cabeza;
}

/** Los comandos de prueba declarados por el proyecto, en una frase legible. */
function comandosDe(configYaml) {
  const bloque = /^test-commands:\s*\n((?:\s*-\s*.+\n)+)/m.exec(configYaml || "");
  if (!bloque) return "los comandos que `.valmen/config.yaml` declare.";
  const comandos = bloque[1]
    .split("\n")
    .map((l) => l.replace(/^\s*-\s*/, "").trim())
    .filter(Boolean);
  return `los que \`.valmen/config.yaml\` declara (${comandos.join(", ")}); usá el archivo enfocado del ticket y la suite completa antes de entregar.`;
}

function nombreDe(configYaml, porDefecto) {
  const m = /^name:\s*(.+)$/m.exec(configYaml || "");
  return m ? m[1].trim() : porDefecto;
}

/** El primer servidor MCP del perfil es el registro del proyecto: así se deduce, sin escribirlo. */
function mcpDelPerfil(perfil, porDefecto) {
  const ruta = join(homedir(), ".hermes", "profiles", perfil, "config.yaml");
  if (!existe(ruta)) return porDefecto;
  const m = /^mcp_servers:\s*\n((?:[ \t]+[a-z0-9_-]+:.*\n|[ \t]+.*\n)+)/m.exec(leer(ruta));
  if (!m) return porDefecto;
  const nombre = /^[ \t]+([a-z0-9_-]+):/m.exec(m[1]);
  return nombre ? nombre[1] : porDefecto;
}

function fechas(inicio, cadaHoras, cantidad) {
  const base = new Date(inicio);
  const salida = [];
  for (let i = 0; i < cantidad; i += 1) {
    const d = new Date(base.getTime() + i * cadaHoras * 3600 * 1000);
    const pad = (n) => String(n).padStart(2, "0");
    salida.push(
      `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`,
    );
  }
  return salida;
}

const hora = (iso) => iso.slice(11, 16);

function main() {
  const f = banderas(process.argv.slice(2));
  const raiz = resolve(String(f.raiz ?? process.cwd()));
  const perfil = String(f.perfil ?? "default");
  const feature = String(f.feature ?? "");
  const cantidad = Number(f.cantidad ?? 3);
  const horas = Number(String(f.cada ?? "2h").replace(/h$/i, "")) || 2;
  const inicio = String(f.inicio ?? "");
  const deliver = String(f.deliver ?? "local");
  const skills = String(f.skills ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const seco = f["dry-run"] === true;
  const salida = resolve(String(f.salida ?? join(raiz, ".valmen", "programar")));

  if (!feature || !inicio) {
    console.error("Faltan --feature y --inicio. Ver el encabezado del script.");
    process.exit(2);
  }

  // ── El proyecto ──────────────────────────────────────────────────────────────
  const configYaml = existe(join(raiz, ".valmen", "config.yaml")) ? leer(join(raiz, ".valmen", "config.yaml")) : "";
  const proyecto = nombreDe(configYaml, raiz.split("/").pop());
  const ticketsDir = (/^tickets-dir:\s*(.+)$/m.exec(configYaml) ?? [, "tickets"])[1].trim();

  // ── El grafo y el estado ─────────────────────────────────────────────────────
  const rutaFeature = join(raiz, ".valmen", "features", feature);
  const grafo = leerGrafo(leer(join(rutaFeature, "tickets.yaml")));

  const estado = new Map();
  const rutas = new Map();
  for (const anio of readdirSync(join(raiz, ticketsDir))) {
    const dir = join(raiz, ticketsDir, anio);
    if (!/^\d{4}$/.test(anio)) continue;
    for (const id of readdirSync(dir)) {
      const ruta = join(dir, id, "ticket.md");
      if (!existe(ruta)) continue;
      estado.set(id, leerFrontmatter(ruta));
      rutas.set(id, ruta);
    }
  }

  // ── La elegibilidad, en orden, con la proyección de la propia tanda ──────────
  const cerrados = new Set([...estado].filter(([, c]) => c.workflow_status === "closed").map(([id]) => id));
  const elegidos = [];
  const saltados = [];
  for (const t of grafo) {
    const campos = estado.get(t.id);
    if (!campos || campos.workflow_status === "closed") continue;
    if (!t.deps.every((d) => cerrados.has(d))) continue;
    if (TIPOS_QUE_PIDEN_AUTORIZACION_APARTE.has(campos.type) && f["permitir-criticos"] !== true) {
      saltados.push({ id: t.id, motivo: `${campos.type} pide autorización aparte` });
      continue;
    }
    elegidos.push(t);
    cerrados.add(t.id);
    if (elegidos.length === cantidad) break;
  }

  if (elegidos.length === 0) {
    console.log("No hay tickets elegibles: dependencias sin cerrar o nada en intake.");
    process.exit(1);
  }
  for (const s of saltados) console.log(`– salteado ${s.id}: ${s.motivo}`);

  // ── El prompt de cada eslabón ────────────────────────────────────────────────
  // La plantilla vive con el script (el repositorio del harness), no con el proyecto:
  // el proyecto aporta su registro y su configuración, no la forma del instructivo.
  const plantilla = leer(join(homeDelScript, "..", "templates", "programar", "prompt-eslabon.md"));
  const cuerpo = /````text\n([\s\S]*?)\n````/.exec(plantilla)[1];
  const programa = fechas(inicio, horas, elegidos.length);

  /** Enumera: «el eslabón 5», «los eslabones 2, 3, 4 y 5». */
  const enumerar = (numeros, singular, plural) => {
    if (numeros.length === 1) return `${singular} ${numeros[0]}`;
    return `${plural} ${numeros.slice(0, -1).join(", ")} y ${numeros[numeros.length - 1]}`;
  };
  const otros = (n) => enumerar(elegidos.map((_, i) => i + 1).filter((k) => k !== n), "el eslabón", "los eslabones");
  const horasOtros = (n) => {
    const hs = programa.map((p, i) => (i + 1 === n ? null : hora(p))).filter(Boolean);
    if (hs.length === 0) return "las mismas horas";
    return hs.length === 1 ? hs[0] : `${hs.slice(0, -1).join(", ")} y ${hs[hs.length - 1]}`;
  };

  const rama = (() => {
    try {
      return execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd: raiz, encoding: "utf8" }).trim();
    } catch {
      return "main";
    }
  })();

  if (!existe(salida)) mkdirSync(salida, { recursive: true });
  const planes = [];

  elegidos.forEach((t, indice) => {
    const n = indice + 1;
    const campos = estado.get(t.id);
    const valores = {
      PROYECTO: proyecto,
      TICKET_ID: t.id,
      TIPO: campos.type ?? "FEATURE",
      FEATURE_SLUG: feature,
      SPRINT: t.sprint ?? "S1",
      ESLABON: String(n),
      RESUMEN: resumenDe(rutas.get(t.id), t.title),
      RUTA_REPO: raiz,
      RAMA: rama,
      RUTA_TICKET: rutas.get(t.id).replace(`${raiz}/`, ""),
      RUTA_FEATURE: `.valmen/features/${feature}/`,
      MCP: String(f.mcp ?? mcpDelPerfil(perfil, "valmen")),
      COMANDOS_PRUEBA: comandosDe(configYaml),
      NOTA_PROYECTO: f.nota ? `- Nota del proyecto: ${f.nota}\n` : "",
      AUTORIZACION_NOMBRE: String(f["autorizado-por"] ?? "el PO"),
      AUTORIZACION_FECHA: String(f["autorizado-el"] ?? ""),
      AUTORIZACION_FRASE: String(f.autorizacion ?? ""),
      IMPLEMENTADOR:
        f.implementador === "opencode"
          ? "la escribe el ejecutor OpenCode, no vos: lanzá UNA sesión limpia en segundo plano (`opencode run --standalone`, sin `-c`/`-s`), con el id del ticket, la orden de leerlo completo, respetar `AGENTS.md` y las skills del proyecto, implementar el plan paso por paso y correr las pruebas del ticket. Anotá su session id y guardá su log. Mientras corre no edites código: si al verificar hay correcciones, esperá a que termine, corregí y nombralo en la evidencia."
          : "la hacés vos, con TDD —la prueba primero, en rojo por la razón correcta, después el código hasta el verde—. En este repositorio el código lo escribe la sesión, y el fixture de una prueba del motor lo escribe el motor, no el asistente.",
      LINEA_BASE: f["linea-base"] ? ` (${f["linea-base"]})` : "",
      OTROS_ESLABONES: otros(n),
      HORAS_OTROS: horasOtros(n) || "las mismas horas",
    };
    let texto = cuerpo;
    for (const [clave, valor] of Object.entries(valores)) texto = texto.replaceAll(`{{${clave}}}`, String(valor));
    const sobrantes = texto.match(/\{\{[A-Z_]+\}\}/g);
    if (sobrantes) throw new Error(`Marcadores sin rellenar en ${t.id}: ${sobrantes.join(", ")}`);

    const archivo = join(salida, `eslabon-${n}-${t.id}.txt`);
    writeFileSync(archivo, texto, "utf8");

    // El nombre del job dice de qué habla: prefijo de la feature, sprint, eslabón y el id
    // sin su tipo ni su fecha (`FEATURE-RELLENO-MASIVO-GENERACION-20260924` → `relleno-masivo-generacion`).
    const cola = t.id.split("-").slice(1, -1).join("-").toLowerCase();
    const nombre = `${feature.split("-")[0]}-${(t.sprint ?? "s").toLowerCase()}-eslabon-${n}-${cola}`;

    planes.push({ n, id: t.id, cuando: programa[indice], archivo, nombre, titulo: campos.title ?? t.title });

    if (!seco) {
      const args = [
        "-p", perfil, "cron", "create", programa[indice], texto,
        "--name", nombre, "--deliver", deliver, "--workdir", raiz, "--repeat", "1",
      ];
      for (const s of skills) args.push("--skill", s);
      const salidaCron = execFileSync("hermes", args, { encoding: "utf8" });
      console.log(salidaCron.trim().split("\n")[0]);
    }
  });

  console.log("");
  for (const p of planes) console.log(`${hora(p.cuando)}  eslabón ${p.n}  ${p.id}  →  ${p.nombre}`);
  console.log(`\n${planes.length} ticket(s) de ${proyecto} · perfil ${perfil} · entrega ${deliver}` +
    (seco ? ` · SECO (los prompts quedaron en ${salida})` : ` · jobs creados · prompts en ${salida}`));
}

main();
