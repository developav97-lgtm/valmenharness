/**
 * Los comandos que ponen a punto un proyecto: `provider`, `routing` y `doctor`.
 *
 * Existen porque la configuración vivía **solo en la pantalla**, y eso deja fuera
 * el caso que más importa: que el proyecto lo configure un agente. Un equipo que
 * trabaja dentro de Claude Code le pide a Claude «instalá y configurá el harness»,
 * y Claude no puede abrir un navegador ni pulsar un botón. Con estos tres, la
 * puesta en marcha entera se hace con la misma superficie que ya usa todo lo demás
 * —el CLI—, y la pantalla queda como lo que es: una comodidad, no un requisito.
 *
 * Los tres llaman a lo que ya existe. `provider` usa el catálogo y la escritura de
 * credenciales del servidor, `routing` el mismo analizador y el mismo generador
 * que la pantalla, y `doctor` **no escribe nada**: lee, diagnostica y dice el
 * comando exacto que arregla cada cosa. Un diagnóstico que arregla solo lo que
 * encuentra es un programa que decide por su cuenta.
 */
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { EXIT_SCHEMA, toFailure } from "@valmen/core";
import {
  PRESETS,
  ROLES,
  type Effort,
  presetById,
  readProjectRouting,
} from "@valmen/adapter";
import type { RegistryPaths } from "@valmen/engine";
import {
  listProviderModels,
  listProviders,
  probeProvider,
  readRouting,
  routingFromForm,
  testProviderModel,
  updateCredentials,
  writeRouting,
} from "@valmen/server";

import type { CommandResult } from "./commands.js";

/** Un resultado con salida, en la forma que espera el CLI. */
function ok(stdout: string): CommandResult {
  return { stdout, stderr: "", exitCode: 0 };
}

/** Lo que devuelve un comando cuando además quiere salir con código distinto. */
function fallo(mensaje: string, exitCode: number = EXIT_SCHEMA): CommandResult {
  return { stdout: "", stderr: mensaje, exitCode };
}

/** Una bandera de texto, si está. */
function bandera(
  flags: Readonly<Record<string, string | true>>,
  nombre: string,
): string | undefined {
  const valor = flags[nombre];
  return typeof valor === "string" && valor.trim() !== "" ? valor.trim() : undefined;
}

/** Alinea una columna, para que la salida se lea como una tabla. */
function columna(texto: string, ancho: number): string {
  return texto.length >= ancho ? `${texto} ` : texto + " ".repeat(ancho - texto.length);
}

/**
 * `provider`: los proveedores, su estado y su prueba.
 *
 * El valor de una clave **nunca** se imprime: se dice si está configurada y
 * cuánto mide, que es lo que permite notar una truncada sin exponerla.
 */
export async function providerCommand(
  paths: RegistryPaths,
  flags: Readonly<Record<string, string | true>>,
  subcomando: string | undefined,
  /** El proveedor, cuando el subcomando lo lleva como argumento posicional. */
  proveedorPedido: string | undefined,
  opciones: { readonly home?: string; readonly env?: NodeJS.ProcessEnv } = {},
): Promise<CommandResult> {
  const accion = subcomando ?? "list";
  const proveedor = proveedorPedido ?? bandera(flags, "id");
  const home = opciones.home ?? homedir();

  if (accion === "list") {
    const proveedores = listProviders(undefined, opciones.env ?? process.env);
    const lineas = ["Proveedores", ""];
    lineas.push(
      `  ${columna("id", 16)}${columna("cómo se autentica", 22)}${columna("estado", 32)}modelos`,
    );
    for (const p of proveedores) {
      const autenticacion =
        p.auth === "subscription"
          ? "suscripción del CLI"
          : p.auth === "none"
            ? "sin credencial"
            : "clave de API";
      const estado = p.configured ? `configurado (${p.source})` : "falta";
      const modelos = p.listable
        ? "catálogo en línea"
        : p.knownModels?.length
          ? `${p.knownModels.length} conocidos`
          : "—";
      lineas.push(
        `  ${columna(p.id, 16)}${columna(autenticacion, 22)}${columna(estado, 32)}${modelos}`,
      );
    }
    lineas.push(
      "",
      "  Configurar una clave:   valmen provider set <id> --key <clave>",
      "  Comprobar que sirve:    valmen provider test <id> [--model <m>]",
      "  Ver sus modelos:        valmen provider models <id>",
      "",
      `  Archivo de credenciales: ${join(home, ".valmen", ".credentials.yaml")}`,
      "  Los proveedores de suscripción no se pegan a mano: se leen del CLI que ya",
      "  los autenticó, y el comando lo dice si no encuentra la sesión.",
    );
    return ok(`${lineas.join("\n")}\n`);
  }

  if (accion === "set") {
    const clave = bandera(flags, "key");
    if (proveedor === undefined) {
      return fallo(
        "provider set requiere el proveedor: valmen provider set <id> --key <clave>.",
      );
    }
    if (clave === undefined) {
      return fallo(
        "provider set requiere --key. Una clave que no se pasa no se puede probar, y " +
          "el harness no guarda credenciales que no haya comprobado.",
      );
    }

    // Se prueba **antes** de escribir, igual que en la pantalla: una clave mal
    // pegada tiene que fallar acá y no en la mitad de un gate.
    const prueba = await probeProvider(proveedor, {
      ...(opciones.env === undefined ? {} : { env: opciones.env }),
      apiKey: clave,
    });
    if (!prueba.ok) {
      return fallo(
        `La prueba contra ${proveedor} falló (HTTP ${prueba.status ?? "sin respuesta"}): ` +
          `${prueba.detail}\nNo se escribió nada.`,
        2,
      );
    }

    const escrito = updateCredentials([{ provider: proveedor, apiKey: clave }]);
    return ok(
      `Credencial de ${proveedor} guardada y probada (${prueba.latencyMs} ms).\n` +
        `Archivo: ${escrito.path} (permisos 600)\n`,
    );
  }

  if (accion === "test") {
    if (proveedor === undefined) {
      return fallo("provider test requiere el proveedor: valmen provider test <id>.");
    }
    const modelo = bandera(flags, "model");
    const prueba =
      modelo === undefined
        ? await probeProvider(proveedor, {
            ...(opciones.env === undefined ? {} : { env: opciones.env }),
          })
        : await testProviderModel(proveedor, modelo, {
            ...(opciones.env === undefined ? {} : { env: opciones.env }),
          });
    const que = modelo === undefined ? "la credencial sirve" : `"${modelo}" responde`;
    return prueba.ok
      ? ok(`${proveedor}: ${que} (HTTP ${prueba.status}, ${prueba.latencyMs} ms).\n`)
      : fallo(`${proveedor}: ${prueba.detail}`);
  }

  if (accion === "models") {
    if (proveedor === undefined) {
      return fallo("provider models requiere el proveedor: valmen provider models <id>.");
    }
    const lista = await listProviderModels(proveedor, {
      ...(opciones.env === undefined ? {} : { env: opciones.env }),
    });
    if (lista === null) {
      return ok(
        `${proveedor} no publica su catálogo y no hay modelos declarados.\n` +
          "Escribí el identificador a mano en el routing, o declaralo en " +
          "`.valmen/config.yaml`.\n",
      );
    }
    if (!lista.ok) {
      return fallo(`${proveedor}: ${lista.error}`);
    }
    const lineas = [`Modelos de ${proveedor} (${lista.source})`, ""];
    for (const modelo of lista.models) {
      lineas.push(`  ${modelo.id}`);
    }
    return ok(`${lineas.join("\n")}\n`);
  }

  return fallo(`Acción desconocida: "${accion}". Use list, set, test o models.`);
}

/**
 * `routing`: qué modelo ejecuta cada rol.
 *
 * El archivo lo escribe el mismo generador que la pantalla —comentado, en
 * español, con los roles que el harness **ejecuta**— para que las dos puertas no
 * puedan divergir.
 */
export function routingCommand(
  paths: RegistryPaths,
  flags: Readonly<Record<string, string | true>>,
  subcomando: string | undefined,
  /** El rol, cuando el subcomando lo lleva como argumento posicional. */
  rolPedido: string | undefined,
): CommandResult {
  const accion = subcomando ?? "show";

  if (accion === "show") {
    const estado = readRouting(paths.root);
    if (!estado.ok) {
      return fallo(
        `El routing del proyecto no parsea: ${estado.error}\n` +
          "Un archivo que el harness no puede leer deja los gates sin modelo. " +
          "Arreglalo a mano, o volvé al preset con `valmen routing set --preset <id>`.",
      );
    }
    const rutas = estado.roles;
    const probabilistico = rutas.some(
      (r) => r.role === "gate-evaluator" && r.probabilistic,
    );
    const lineas = [
      `Routing (preset: ${estado.preset})`,
      "",
      `  ${columna("rol", 16)}${columna("proveedor", 16)}${columna("modelo", 32)}origen`,
    ];
    for (const ruta of rutas) {
      lineas.push(
        `  ${columna(ruta.role, 16)}${columna(ruta.provider === "" ? "—" : ruta.provider, 16)}` +
          `${columna(ruta.model === "" ? "—" : ruta.model, 32)}${ruta.source}`,
      );
    }
    if (!probabilistico) {
      lineas.push(
        "",
        "  El rol `gate-evaluator` no apunta al evaluador probabilístico, así que los",
        "  gates que necesitan juicio se resuelven con un modelo de chat: funciona, y",
        "  el veredicto deja de ser reproducible entre corridas.",
      );
    }
    lineas.push(
      "",
      "  Cambiar el preset:       valmen routing set --preset <id>",
      "  Cambiar un rol:          valmen routing set <rol> --provider <p> --model <m> [--effort <e>]",
      "  Volver al preset:        valmen routing clear <rol>",
      "",
      `  Presets: ${PRESETS.map((p) => p.id).join(", ")}`,
      `  Roles:   ${ROLES.map((r) => r.id).join(", ")}`,
    );
    return ok(`${lineas.join("\n")}\n`);
  }

  if (accion === "set") {
    const declarado = readProjectRouting(paths.root);
    const presetPedido = bandera(flags, "preset");
    const comoRol = rolPedido;

    // Dos formas, y la posición decide: `set --preset x` cambia el preset entero;
    // `set <rol> --provider …` cambia un rol. Mezclarlas es un error del llamador.
    if (presetPedido !== undefined && comoRol !== undefined) {
      return fallo("Elegí una cosa: `set --preset <id>` o `set <rol> --provider …`.");
    }

    // Solo los overrides declarados: escribir los cuatro roles haría creer que el
    // proyecto decidió sobre los cuatro, y ataría el archivo a este preset.
    const roles: Record<string, { provider?: string; model?: string; effort?: Effort }> =
      {};
    for (const [clave, valor] of Object.entries(declarado.roles)) {
      roles[clave] = { ...valor };
    }

    let preset = declarado.preset;
    if (presetPedido !== undefined) {
      try {
        presetById(presetPedido);
      } catch (caught) {
        return fallo(toFailure(caught).message);
      }
      preset = presetPedido;
    }

    if (comoRol !== undefined) {
      if (!ROLES.some((spec) => spec.id === comoRol)) {
        return fallo(
          `Rol desconocido: "${comoRol}". Los que el harness ejecuta son: ` +
            `${ROLES.map((r) => r.id).join(", ")}.`,
        );
      }
      const proveedor = bandera(flags, "provider");
      const modelo = bandera(flags, "model");
      const esfuerzo = bandera(flags, "effort");
      // El modelo es lo que hace falta: un rol con proveedor y sin modelo no
      // ejecuta nada, y el motor lo reportaría como «sin asignar».
      if (modelo === undefined) {
        return fallo(
          `Falta --model para el rol ${comoRol}. El modelo es lo que decide qué corre.`,
        );
      }
      if (esfuerzo !== undefined && !["auto", "low", "medium", "high"].includes(esfuerzo)) {
        return fallo(`--effort debe ser auto, low, medium o high (recibí "${esfuerzo}").`);
      }
      roles[comoRol] = {
        ...(proveedor === undefined ? {} : { provider: proveedor }),
        model: modelo,
        ...(esfuerzo === undefined ? {} : { effort: esfuerzo as Effort }),
      };
    }

    const texto = routingFromForm({ preset, roles });
    const guardado = writeRouting(paths.root, texto);
    if (!guardado.written) {
      return fallo(`No se pudo escribir el routing: ${guardado.error}`);
    }
    return ok(
      `Routing guardado en .valmen/routing.yaml (preset: ${preset}).\n` +
        "Los gates y las features lo toman en la próxima corrida; no hace falta " +
        "reiniciar nada.\n",
    );
  }

  if (accion === "clear") {
    const rol = rolPedido;
    if (rol === undefined) {
      return fallo("routing clear requiere el rol: valmen routing clear <rol>.");
    }
    const declarado = readProjectRouting(paths.root);
    const roles: Record<string, { provider?: string; model?: string; effort?: Effort }> =
      {};
    for (const [clave, valor] of Object.entries(declarado.roles)) {
      if (clave === rol) continue;
      roles[clave] = { ...valor };
    }
    if (roles[rol] === undefined && declarado.roles[rol] === undefined) {
      return ok(
        `El rol ${rol} ya venía del preset ${declarado.preset}: no había nada que quitar.\n`,
      );
    }
    const texto = routingFromForm({ preset: declarado.preset, roles });
    const guardado = writeRouting(paths.root, texto);
    if (!guardado.written) {
      return fallo(`No se pudo escribir el routing: ${guardado.error}`);
    }
    return ok(
      `El rol ${rol} vuelve al preset ${declarado.preset}: un rol sin override no se escribe.\n`,
    );
  }

  return fallo(`Acción desconocida: "${accion}". Use show, set o clear.`);
}

/** Una línea del diagnóstico: qué se miró, cómo salió y qué hacer. */
interface Hallazgo {
  readonly que: string;
  readonly estado: "ok" | "falta" | "aviso";
  readonly detalle: string;
  /** El comando exacto que lo arregla, cuando hay uno. */
  readonly arreglo?: string;
}

/**
 * `doctor`: qué le falta a esta máquina y a este proyecto.
 *
 * **No escribe nada.** Un diagnóstico que además arregla decide por su cuenta, y
 * lo que hace falta acá es lo contrario: que un agente —o una persona— lea qué
 * falta y ejecute el comando. Es lo primero que conviene correr al llegar a un
 * proyecto, y lo primero que corre un agente al que le pidieron configurarlo.
 */
export async function doctorCommand(
  paths: RegistryPaths,
  opciones: { readonly env?: NodeJS.ProcessEnv } = {},
): Promise<CommandResult> {
  const env = opciones.env ?? process.env;
  const hallazgos: Hallazgo[] = [];

  // 1. Node.
  const mayor = Number.parseInt(process.versions.node.split(".")[0] ?? "0", 10);
  hallazgos.push({
    que: "Node",
    estado: mayor >= 22 ? "ok" : "falta",
    detalle: `v${process.versions.node}`,
    ...(mayor >= 22
      ? {}
      : { arreglo: "Instalá Node 22 o superior (nvm, brew, el instalador oficial)." }),
  });

  // 2. El proyecto declaró sus reglas.
  const config = join(paths.root, ".valmen", "config.yaml");
  const adoptado = existsSync(config);
  hallazgos.push({
    que: "Proyecto adoptado",
    estado: adoptado ? "ok" : "falta",
    detalle: adoptado ? config : "no hay .valmen/config.yaml",
    ...(adoptado
      ? {}
      : { arreglo: "valmen adopt    # perfila el proyecto y escribe .valmen/" }),
  });

  // 3. El registro.
  const registro = join(paths.root, paths.ticketsDir);
  const hayRegistro = existsSync(registro);
  hallazgos.push({
    que: "Registro",
    estado: hayRegistro ? "ok" : "aviso",
    detalle: hayRegistro
      ? registro
      : `no existe ${paths.ticketsDir}/ (un proyecto nuevo no tiene tickets)`,
    ...(hayRegistro
      ? {}
      : { arreglo: "valmen create --id <ID> --title … --type … --module … --request …" }),
  });

  // 4. Las reglas proyectadas a los agentes que las leen.
  const agents = join(paths.root, "AGENTS.md");
  hallazgos.push({
    que: "AGENTS.md",
    estado: existsSync(agents) ? "ok" : "falta",
    detalle: existsSync(agents) ? agents : "no está generado",
    ...(existsSync(agents) ? {} : { arreglo: "valmen sync" }),
  });

  // 5. El servidor MCP, agente por agente. Se mira el archivo de cada uno porque
  //    «estar instalado» no es lo mismo que «declarado para este proyecto».
  for (const [agente, relativa] of [
    ["Claude Code", ".mcp.json"],
    ["opencode", "opencode.json"],
  ] as const) {
    const ruta = join(paths.root, relativa);
    let declarado = false;
    try {
      declarado = readFileSync(ruta, "utf8").includes("valmen");
    } catch {
      declarado = false;
    }
    hallazgos.push({
      que: `MCP en ${agente}`,
      estado: declarado ? "ok" : "falta",
      detalle: declarado ? relativa : `${relativa} sin declarar`,
      ...(declarado ? {} : { arreglo: "valmen mcp --install    # y --global para codex" }),
    });
  }

  // 6. El routing: que cada rol resuelva a un proveedor con camino.
  const proveedores = listProviders(undefined, env);
  const estadoRouting = readRouting(paths.root);
  const declaradoRouting = readProjectRouting(paths.root);
  const rutas = estadoRouting.roles;
  const sinModelo = rutas.filter((r) => r.model === "");
  const proveedoresConocidos = new Set(proveedores.map((p) => p.id));
  const conProveedorRaro = rutas.filter(
    (r) => r.provider !== "" && !proveedoresConocidos.has(r.provider),
  );
  hallazgos.push({
    que: "Routing",
    estado: sinModelo.length > 0 || conProveedorRaro.length > 0 ? "falta" : "ok",
    detalle:
      sinModelo.length > 0
        ? `sin modelo: ${sinModelo.map((r) => r.role).join(", ")}`
        : conProveedorRaro.length > 0
          ? `proveedor desconocido: ${conProveedorRaro.map((r) => `${r.role}=${r.provider}`).join(", ")}`
          : `preset ${declaradoRouting.preset}`,
    ...(sinModelo.length > 0 || conProveedorRaro.length > 0
      ? { arreglo: "valmen routing set --preset <id>   ·   valmen routing show" }
      : {}),
  });

  // 7. Las credenciales, proveedor por proveedor, y solo las que el routing usa:
  //    avisar de que falta la sesión de un proveedor que ningún rol nombra es
  //    ruido, y el ruido hace que no se lea el aviso que importa.
  //
  // Un proveedor local sin credencial —ollama— está disponible por definición: no
  // cuenta como «configurado» en un diagnóstico, porque nadie configuró nada.
  const conCredencial = proveedores.filter((p) => p.auth !== "none");
  const configurados = conCredencial.filter((p) => p.configured);
  const usados = new Set(rutas.map((r) => r.provider).filter((p) => p !== ""));
  hallazgos.push({
    que: "Credenciales",
    estado: configurados.length > 0 || usados.size === 0 ? "ok" : "falta",
    detalle:
      configurados.length > 0
        ? configurados.map((p) => p.id).join(", ")
        : usados.size === 0
          ? "ningún rol tiene proveedor todavía"
          : "ningún proveedor tiene credencial",
    ...(configurados.length > 0 || usados.size === 0
      ? {}
      : { arreglo: "valmen provider set <id> --key <clave>   ·   valmen provider list" }),
  });

  for (const proveedor of conCredencial) {
    if (proveedor.configured || !usados.has(proveedor.id)) continue;
    hallazgos.push({
      que:
        proveedor.auth === "subscription"
          ? `Suscripción ${proveedor.id}`
          : `Credencial ${proveedor.id}`,
      estado: "aviso",
      detalle:
        proveedor.auth === "subscription"
          ? `el routing la usa y no hay sesión: en macOS suele estar en el llavero, y en Linux en ${proveedor.tokenSource ?? "el archivo de su CLI"}`
          : "el routing la usa y no tiene clave",
      arreglo:
        proveedor.auth === "subscription"
          ? "Autenticate en su CLI: el harness lee el token, no lo pide."
          : `valmen provider set ${proveedor.id} --key <clave>`,
    });
  }

  // Y si el evaluador del gate no tiene credencial, es un aviso **aparte**: es el
  // fallo que aparece recién cuando alguien evalúa, y en ese momento cuesta una
  // corrida entera. El arreglo es el mismo que el de la credencial, así que la
  // lista de pasos lo deduplica sola.
  const evaluador = rutas.find((r) => r.role === "gate-evaluator");
  const proveedorEvaluador =
    evaluador === undefined
      ? undefined
      : proveedores.find((p) => p.id === evaluador.provider);
  if (
    evaluador !== undefined &&
    evaluador.provider !== "" &&
    proveedorEvaluador !== undefined &&
    !proveedorEvaluador.configured
  ) {
    hallazgos.push({
      que: "Evaluador de gates",
      estado: "aviso",
      detalle: `el rol gate-evaluator usa ${evaluador.provider}, sin credencial: los gates de juicio van a fallar`,
      arreglo:
        proveedorEvaluador.auth === "subscription"
          ? `Autenticate en su CLI: el harness lee el token, no lo pide.`
          : `valmen provider set ${proveedorEvaluador.id} --key <clave>`,
    });
  }

  // 8. Hermes, que es opcional.
  const hermesConfig = join(
    env["HERMES_HOME"] ?? join(homedir(), ".hermes"),
    "config.yaml",
  );
  const hayHermes = existsSync(hermesConfig);
  hallazgos.push({
    que: "Hermes (opcional)",
    estado: hayHermes ? "ok" : "aviso",
    detalle: hayHermes ? hermesConfig : "no está instalado o no tiene configuración",
    ...(hayHermes
      ? {}
      : { arreglo: "valmen hermes connect    # cuando quieras decidir desde el celular" }),
  });

  const icono = (estado: Hallazgo["estado"]): string =>
    estado === "ok" ? "✓" : estado === "aviso" ? "·" : "✗";
  const pendientes = hallazgos.filter((h) => h.estado !== "ok");
  const faltantes = hallazgos.filter((h) => h.estado === "falta");
  // El orden de los pasos no es el de la pantalla: `adopt` escribe lo que `sync`
  // proyecta y lo que el MCP necesita, así que va primero, y el registro —que en
  // un proyecto nuevo todavía no existe— va último, cuando ya hay con qué crearlo.
  const prioridad = (que: string): number => {
    if (que === "Proyecto adoptado") return 0;
    if (que === "AGENTS.md") return 1;
    if (que.startsWith("MCP")) return 2;
    if (que === "Credenciales" || que.startsWith("Suscripción")) return 3;
    if (que === "Routing" || que === "Evaluador de gates") return 4;
    if (que === "Registro") return 6;
    return 5;
  };
  const pasos = [...pendientes]
    .filter((h) => h.arreglo !== undefined)
    .sort((a, b) => prioridad(a.que) - prioridad(b.que));

  const lineas = [
    `Diagnóstico de ${paths.root}`,
    "",
    ...hallazgos.map((h) => `  ${icono(h.estado)} ${columna(h.que, 22)}${h.detalle}`),
  ];

  if (pendientes.length === 0) {
    lineas.push(
      "",
      "  Todo en orden. El próximo paso es el trabajo: `valmen create` o `valmen feature new`.",
    );
  } else {
    lineas.push("", "  Qué hacer, en orden:");
    const vistos = new Set<string>();
    let n = 1;
    for (const h of pasos) {
      const arreglo = h.arreglo as string;
      // Dos hallazgos pueden pedir el mismo comando —los dos agentes sin MCP— y
      // repetirlo hace que la lista parezca más larga de lo que es.
      if (vistos.has(arreglo)) continue;
      vistos.add(arreglo);
      lineas.push(`   ${n}. ${arreglo}`);
      n += 1;
    }
  }

  // El código de salida distingue «falta algo» de «hay avisos»: un guion de
  // instalación puede parar cuando falta y seguir cuando solo hay opcionales.
  if (faltantes.length > 0) {
    return { stdout: `${lineas.join("\n")}\n`, stderr: "", exitCode: 2 };
  }
  return ok(`${lineas.join("\n")}\n`);
}

/** El error del motor, con su código, en la forma del CLI. */
export function falloDelMotor(caught: unknown): CommandResult {
  const failure = toFailure(caught);
  return { stdout: "", stderr: failure.message, exitCode: failure.exitCode };
}
