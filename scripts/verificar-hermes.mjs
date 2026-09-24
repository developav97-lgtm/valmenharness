#!/usr/bin/env node
/**
 * El contrato de pruebas del puente con Hermes, ejecutable.
 *
 * Existe porque el puente es lo único del harness que **no se puede probar
 * entero con tests**: el otro extremo es un programa de terceros que puede no
 * estar instalado, y una plataforma de mensajería que desde acá no se alcanza.
 * `npx vitest run` cubre la lógica con el proceso inyectado; lo que queda afuera
 * es la costura —que las banderas lleguen, que el archivo se escriba donde Hermes
 * lo lee, que el código salga y vuelva— y eso es lo que este arnés recorre.
 *
 * Corre sobre proyectos de laboratorio en temporales, con `HERMES_HOME` apuntado
 * ahí, así que **no toca la configuración real de Hermes de nadie** ni el registro
 * de ningún proyecto.
 *
 * Lo que **no** puede comprobar, y está listado al final: que `hermes send`
 * entregue de verdad, y que Hermes cargue las skills. Las dos exigen Hermes
 * instalado.
 *
 * Uso: `node scripts/verificar-hermes.mjs`
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { TICKET_TEMPLATE } from "../packages/core/dist/index.js";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const CLI = join(RAIZ, "packages", "cli", "dist", "main.js");
const RECIBO_HELPER = join(RAIZ, "scripts", "recibo-de-laboratorio.mjs");
const SECRETO = "secreto-de-verificacion-del-contrato";
const TICKET = "BUGFIX-POS-FILTRO-ORDENES-20260921";
const RECIBO = "GR-20260924-0001";

let corridas = 0;
let fallos = 0;

/** Afirma algo del contrato y lo informa. */
function afirma(que, condicion, detalle = "") {
  corridas += 1;
  if (condicion) {
    console.log(`  ✓ ${que}`);
    return true;
  }
  fallos += 1;
  console.log(`  ✗ ${que}`);
  if (detalle !== "")
    console.log(`      ${String(detalle).split("\n").slice(0, 3).join("\n      ")}`);
  return false;
}

/** Ejecuta el CLI en un laboratorio. */
function valmen(args, lab) {
  const r = spawnSync(process.execPath, [CLI, ...args, "--root", lab.root], {
    encoding: "utf8",
    env: {
      ...process.env,
      HERMES_HOME: lab.hermes,
      VALMEN_APPROVAL_SECRET: SECRETO,
    },
  });
  return { salida: `${r.stdout ?? ""}${r.stderr ?? ""}`, codigo: r.status };
}

/** Lee un archivo del laboratorio, o `""` si no está. */
function leer(ruta) {
  try {
    return readFileSync(ruta, "utf8");
  } catch {
    return "";
  }
}

/** El proyecto de laboratorio: un ticket con su recibo escalado a una persona. */
function laboratorio(riesgo = "normal", impactos = [], opciones = {}) {
  const root = mkdtempSync(join(tmpdir(), "valmen-hermes-"));
  const lab = { root, hermes: join(root, "hermes-home") };

  mkdirSync(join(root, ".valmen"), { recursive: true });
  mkdirSync(join(root, "tickets", "2026", TICKET), { recursive: true });

  writeFileSync(
    join(root, ".valmen", "config.yaml"),
    [
      "name: Laboratorio",
      "hermes:",
      "  enabled: true",
      "  notify:",
      "    gate: telegram",
      "",
    ].join("\n"),
    "utf8",
  );

  // El ticket se arma sobre la **plantilla del harness** y no a mano: el parser
  // exige las quince secciones canónicas en orden, y escribirlas de nuevo acá
  // sería una segunda definición del contrato que se desincronizaría del parser.
  const campos = {
    id: TICKET,
    title: "El filtro no encuentra por número parcial",
    type: "BUGFIX",
    module: "POS",
    workflow_status: "planned",
    qa_status: "pending",
    release_status: "unreleased",
    sync_impact: String(impactos.includes("sync_impact")),
    migration_impact: String(impactos.includes("migration_impact")),
    docker_impact: String(impactos.includes("docker_impact")),
    risk_level: riesgo,
    created: "2026-09-24",
    updated: "2026-09-24",
  };

  let ticket = TICKET_TEMPLATE;
  for (const [clave, valor] of Object.entries(campos)) {
    ticket = ticket.replace(new RegExp(`^${clave}:.*$`, "m"), `${clave}: ${valor}`);
  }
  // El diagnóstico es lo que la compuerta de análisis juzga; sin él, el ticket no
  // está en condiciones de que nadie lo evalúe.
  ticket = ticket.replace(
    "## Diagnóstico",
    [
      "## Diagnóstico",
      "",
      "El `lookup_expr` de `number` es `exact` y debería ser `icontains`, así que",
      "buscar por número parcial no encuentra nada.",
      "",
      "- Archivos y flujo investigados: `BackEnd/pos/filters.py`, `BackEnd/pos/views.py`.",
      "- Causa raíz: el filtro declara `exact` sobre un campo de texto.",
      "- Impactos: ninguno.",
    ].join("\n"),
  );

  writeFileSync(join(root, "tickets", "2026", TICKET, "ticket.md"), ticket, "utf8");

  // El recibo lo escribe el propio motor, para que su hash de estado corresponda
  // al ticket: con uno inventado, la comprobación de obsolescencia rechazaría la
  // decisión y el contrato estaría midiendo otra cosa.
  if (opciones.conRecibo === false) return lab;

  const r = spawnSync(process.execPath, [RECIBO_HELPER, root, TICKET, RECIBO], {
    encoding: "utf8",
  });
  if (r.status !== 0) {
    console.error(r.stdout ?? "");
    console.error(r.stderr ?? "");
    process.exit(1);
  }

  return lab;
}

/** El código corto que `hermes notify` imprime, o el que quedó en el registro. */
function codigoDe(lab, salida) {
  const deSalida = /código\s+([0-9A-Z]{4}-[0-9A-Z]{4})/.exec(salida);
  if (deSalida !== null) return deSalida[1];
  const delRegistro = /"code":"([0-9A-Z]{4}-[0-9A-Z]{4})"/.exec(
    leer(join(lab.root, ".valmen", "approvals.jsonl")),
  );
  return delRegistro === null ? null : delRegistro[1];
}

// ── El contrato ─────────────────────────────────────────────────────────────

console.log("\n1 · La puerta: declarar el servidor, y la skill que le enseña a trabajar");

{
  const lab = laboratorio();
  const r = valmen(["hermes", "connect", "--force"], lab);
  const config = leer(join(lab.hermes, "config.yaml"));

  afirma("conecta", r.codigo === 0, r.salida);
  afirma(
    "la entrada va bajo mcp_servers",
    /^mcp_servers:\n {2}valmen:/m.test(config),
    config,
  );
  afirma("y declara la raíz del proyecto", config.includes(lab.root), config);
  afirma(
    "le instala la skill",
    leer(join(lab.hermes, "skills", "valmen", "SKILL.md")).includes("name: valmen"),
  );
  afirma(
    "una segunda conexión no cambia nada",
    valmen(["hermes", "connect", "--force"], lab).salida.includes("Sin cambios"),
  );
  afirma(
    "el diagnóstico ve la entrada y que apunta acá",
    valmen(["hermes", "status"], lab).salida.includes("apunta a este proyecto"),
  );

  rmSync(lab.root, { recursive: true, force: true });
}

console.log("\n2 · El aviso: un gate que espera decisión, con su código");

{
  const lab = laboratorio();
  const r = valmen(["hermes", "notify"], lab);
  const codigo = codigoDe(lab, r.salida);

  // Sin Hermes instalado el mensaje no sale, y eso es lo esperado acá: el token se
  // emite igual y el código se imprime, que es la mitad que el harness controla.
  afirma("emite el código aunque el canal no esté", codigo !== null, r.salida);
  afirma(
    "y dice que el mensaje no salió, en vez de darlo por entregado",
    r.salida.includes("no salió"),
    r.salida,
  );

  const parte = valmen(["hermes", "brief"], lab);
  afirma(
    "el parte lo cuenta esperando decisión",
    parte.salida.includes("esperan tu decisión"),
    parte.salida,
  );
  afirma(
    "y lleva el código para poder decidir",
    parte.salida.includes(codigo ?? "—"),
    parte.salida,
  );

  rmSync(lab.root, { recursive: true, force: true });
}

console.log("\n3 · La vuelta: decidir con el código, y una sola vez");

{
  const lab = laboratorio();
  const codigo = codigoDe(lab, valmen(["hermes", "notify"], lab).salida);
  afirma("hay un código emitido", codigo !== null);

  const decision = valmen(
    [
      "gate-decide",
      "--code",
      codigo ?? "XXXX-XXXX",
      "--decision",
      "approve",
      "--actor",
      "juan",
    ],
    lab,
  );
  afirma("la decisión se registra", decision.codigo === 0, decision.salida);
  afirma("y dice de dónde vino", decision.salida.includes("celular"), decision.salida);
  afirma(
    "el recibo guarda el canal",
    leer(join(lab.root, ".valmen", "receipts", `${TICKET}.jsonl`)).includes(
      "hermes-celular",
    ),
  );

  const otra = valmen(
    [
      "gate-decide",
      "--code",
      codigo ?? "XXXX-XXXX",
      "--decision",
      "approve",
      "--actor",
      "juan",
    ],
    lab,
  );
  afirma(
    "el mismo código no sirve dos veces",
    otra.codigo !== 0 && otra.salida.includes("ya se usó"),
    otra.salida,
  );

  rmSync(lab.root, { recursive: true, force: true });
}

console.log("\n4 · El techo de riesgo: lo que no se decide a distancia, y no emite token");

for (const [que, riesgo, impactos] of [
  ["riesgo critico", "critical", []],
  ["riesgo alto", "high", []],
  ["impacto de migracion", "normal", ["migration_impact"]],
  ["impacto de contenedores", "normal", ["docker_impact"]],
  ["impacto de sincronizacion", "normal", ["sync_impact"]],
]) {
  const lab = laboratorio(riesgo, impactos);
  const r = valmen(["hermes", "notify"], lab);
  const emitidos = leer(join(lab.root, ".valmen", "approvals.jsonl"));

  afirma(`${que}: se niega`, !r.salida.includes("Gate notificado"), r.salida);
  afirma(`${que}: no queda token emitido`, !emitidos.includes("approval-issued"), emitidos);

  rmSync(lab.root, { recursive: true, force: true });
}

console.log("\n5 · El proceso detenido: llega, y se aprueba solo en la máquina");

{
  // Sin recibo: lo único pendiente es el proceso, así que lo que se afirme acá no
  // puede venir de un gate de ticket.
  const lab = laboratorio("normal", [], { conRecibo: false });
  const r = spawnSync(
    process.execPath,
    [
      join(RAIZ, "scripts", "corrida-detenida.mjs"),
      lab.root,
      "deploy-saicloud",
      "aprobar-canary",
    ],
    { encoding: "utf8" },
  );
  if (r.status !== 0) console.error(r.stderr ?? "");

  const parte = valmen(["hermes", "brief"], lab);
  afirma(
    "el parte lo cuenta como detenido",
    parte.salida.includes("detenido"),
    parte.salida,
  );
  afirma(
    "y nombra el paso que espera",
    parte.salida.includes("aprobar-canary"),
    parte.salida,
  );

  const aviso = valmen(["hermes", "notify"], lab);
  const registroTrasAvisar = leer(join(lab.root, ".valmen", "approvals.jsonl"));

  // Lo que se afirma es una **negativa**, y es la mitad importante del diseño: un
  // gate de proceso no se decide a distancia, así que no se emite ningún código.
  afirma(
    "no se emite ningún código para un gate de proceso",
    !registroTrasAvisar.includes("approval-issued"),
    registroTrasAvisar,
  );
  afirma(
    "y como el mensaje no salió, no se anota como avisado: se reintenta",
    !registroTrasAvisar.includes("process-notice"),
    registroTrasAvisar,
  );
  afirma(
    "el informe lo dice en vez de dar el aviso por hecho",
    aviso.salida.includes("no se pudo") || aviso.salida.includes("no salieron"),
    aviso.salida,
  );

  rmSync(lab.root, { recursive: true, force: true });
}

console.log("\n6 · El servidor MCP, con las reglas del proyecto como prompt");

{
  const r = spawnSync(
    process.execPath,
    [join(RAIZ, "packages", "mcp", "dist", "main.js"), "--root", RAIZ, "--check"],
    {
      encoding: "utf8",
    },
  );
  afirma(
    "arranca y se autocomprueba",
    r.status === 0,
    `${r.stdout ?? ""}${r.stderr ?? ""}`,
  );
}

console.log(`\n${corridas} comprobaciones, ${fallos} fallo(s).`);
console.log(
  "\nLo que este arnés NO puede comprobar, y hay que hacer a mano con Hermes instalado:" +
    "\n  · que `hermes send --to <destino>` entregue de verdad (valmen hermes test --to telegram);" +
    "\n  · que Hermes cargue la skill instalada, y las del proyecto tras `hermes skills trust`;" +
    "\n  · que el código que llega al celular sea el que acepta `gate-decide --code`.\n",
);
process.exitCode = fallos === 0 ? 0 : 1;
