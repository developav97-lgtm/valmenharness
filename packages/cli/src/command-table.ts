/**
 * La tabla de comandos del CLI: qué comandos, subcomandos y banderas existen.
 *
 * Hasta ahora los comandos eran solo ramas de un `switch` y de una cadena de `if`,
 * y las banderas, una lista plana de las que consumen valor, común a todos. Dos
 * consecuencias: una bandera que el comando no lee se aceptaba como booleana y salía
 * con 0 (`validate --id X --inventada`), y una bandera no podía llevar valor en un
 * comando y ser booleana en otro (`--version`). La ayuda (`USAGE`) es texto libre y
 * nada la cruzaba con el código.
 *
 * Esta tabla es de **datos** y es la única que declara qué acepta cada comando:
 *
 * - el parser (`parseArgs`) la consulta para saber qué banderas consumen valor *en
 *   ese comando* y para rechazar la que no existe (R-MSG-003);
 * - el despacho (`run`, `dispatch`) la consulta para responder «Comando desconocido»;
 * - la prueba `tests/cli-tabla-comandos.test.ts` la cruza con las ramas del despacho
 *   y con `USAGE`, y el ticket que verifica los mensajes (R-MSG-002) la usa para
 *   comprobar que lo que un texto cita —comandos y banderas— existe.
 *
 * Agregar un comando o una bandera es agregarlo aquí: sin entrada, el parser rechaza
 * la bandera y la prueba de coherencia falla nombrando el comando.
 *
 * El módulo no importa de `main.ts` ni de `index.ts`: es el que `main.ts` importa, y
 * un import del índice del propio paquete esconde un ciclo (AP-002).
 */

/** Las banderas de un nodo de la tabla, con sus dos guiones. */
export interface EspecBanderas {
  /** Consumen el valor que sigue: `--id X` o `--id=X`. */
  readonly conValor: readonly string[];
  /** No llevan valor: `--all`, `--dry-run`. */
  readonly booleanas: readonly string[];
}

/** Un subcomando: lo suyo se suma a lo del comando. */
export interface EspecSubcomando extends Partial<EspecBanderas> {
  /**
   * Acepta además banderas que la tabla no puede enumerar. Hoy es `process run`,
   * cuyos parámetros declara el proceso y los valida el motor contra él.
   */
  readonly banderasLibres?: boolean;
}

/** Un comando de primer nivel. */
export interface EspecComando extends EspecBanderas {
  /** Sus verbos, cuando el comando es `comando <verbo> [args]`. */
  readonly subcomandos?: Readonly<Record<string, EspecSubcomando>>;
  /**
   * El verbo que rige cuando no se escribe ninguno: `hermes` sin verbo es `status`.
   * No hace falta que figure en `subcomandos` si no suma banderas propias.
   */
  readonly subcomandoPorDefecto?: string;
  /** Igual que en el subcomando: acepta banderas que la tabla no enumera. */
  readonly banderasLibres?: boolean;
}

/** Las que valen en todo comando: las consume el propio parser o el borde del CLI. */
export const BANDERAS_GLOBALES: EspecBanderas = {
  conValor: ["--root", "--tickets-dir", "--credentials"],
  booleanas: ["--legacy-layout", "--help", "-h", "--version"],
};

/**
 * Lo que las compuertas piden a quien las corre desde un comando (`runGateFromFlags`).
 * Lo reenvían `gate`, `approve` y `delegation advance`: sus entradas tienen que declararlo.
 */
const DE_LA_COMPUERTA: EspecBanderas = {
  conValor: ["--evaluator", "--force-reason"],
  booleanas: ["--dry-run"],
};

/** Los términos de una autorización de aprobación: se piden al crearla y al emitir su código. */
const TERMINOS_DE_APROBACION: readonly string[] = [
  "--types",
  "--modules",
  "--max-risk",
  "--impacts",
  "--stages",
  "--mode",
  "--daily-quota",
  "--valid-days",
];

/** Los términos de una autorización de QA por agente. */
const TERMINOS_DE_QA: readonly string[] = [
  "--types",
  "--modules",
  "--max-risk",
  "--daily-quota",
  "--valid-days",
];

/** Lo que `hermes status`, `connect` y `test` reciben. */
const DE_LA_CONEXION_HERMES: EspecSubcomando = {
  conValor: ["--name", "--profile", "--to"],
  booleanas: ["--dry-run", "--untrusted", "--json", "--force"],
};

/** Los comandos del CLI, por su nombre de primer nivel. */
export const COMANDOS: Readonly<Record<string, EspecComando>> = {
  // --- El registro de tickets (los despacha `dispatch`) -----------------------------
  validate: { conValor: ["--id"], booleanas: ["--all"] },
  active: { conValor: [], booleanas: [] },
  // `list` es el nombre que el harness publicó primero; la salida es la de `active`.
  list: { conValor: [], booleanas: [] },
  resume: { conValor: ["--id", "--cliente"], booleanas: ["--quiet"] },
  ask: { conValor: ["--id"], booleanas: [] },
  show: { conValor: [], booleanas: [] },
  index: { conValor: [], booleanas: ["--check"] },
  secrets: { conValor: [], booleanas: ["--staged"] },
  estandar: {
    conValor: [],
    booleanas: [],
    subcomandoPorDefecto: "listar",
    subcomandos: {
      listar: {},
      proponer: { conValor: ["--title", "--rule", "--area", "--why", "--tickets"] },
      revisar: { conValor: ["--limite"], booleanas: ["--staged"] },
      aceptar: { conValor: ["--instruccion"] },
      descartar: { conValor: ["--instruccion"] },
    },
  },
  memory: {
    conValor: [],
    booleanas: [],
    subcomandos: {
      search: { conValor: ["--limite"] },
      save: { conValor: ["--title", "--body", "--tickets"] },
      list: {},
      review: {},
      clasificar: { conValor: ["--decision", "--area"] },
    },
  },
  budget: { conValor: ["--tipo", "--id"], booleanas: ["--avisar", "--check"] },
  drift: { conValor: ["--id"], booleanas: ["--todos", "--strict"] },
  usage: {
    conValor: ["--desde", "--hasta"],
    booleanas: [],
    // Sin verbo es el consumo del harness; `value` es el mismo registro, ticket por ticket.
    subcomandoPorDefecto: "consumo",
    subcomandos: {
      value: { conValor: ["--limite"] },
      valor: { conValor: ["--limite"] },
    },
  },
  template: {
    conValor: [],
    booleanas: [],
    subcomandoPorDefecto: "list",
    subcomandos: {
      list: {},
      show: {},
      apply: { booleanas: ["--dry-run"] },
    },
  },
  report: { conValor: ["--desde", "--hasta", "--type", "--q"], booleanas: [] },
  // `--version` lleva valor aquí, en `release-publish` y en `transition`.
  "deliver-manifest": {
    conValor: ["--version", "--tickets", "--released-at"],
    booleanas: ["--dry-run"],
  },
  // No figura en `USAGE`: se despacha y lo usan los agentes de ejecución.
  execution: {
    conValor: ["--project"],
    booleanas: [],
    subcomandos: {
      record: {
        conValor: [
          "--ticket",
          "--execution",
          "--attempt",
          "--event-id",
          "--state",
          "--source",
          "--occurred-at",
        ],
      },
      list: { conValor: ["--ticket", "--execution", "--attempt"], booleanas: ["--json"] },
      journeys: { booleanas: ["--json"] },
    },
  },
  process: {
    conValor: [],
    booleanas: [],
    subcomandos: {
      list: {},
      show: {},
      // Los parámetros del proceso llegan como `--nombre valor`: los declara el proceso y
      // el motor los valida contra él, con el catálogo delante.
      run: {
        conValor: ["--set", "--actor", "--reason", "--run"],
        booleanas: ["--skip-gates", "--dry-run"],
        banderasLibres: true,
      },
      approve: { conValor: ["--actor", "--reason", "--run", "--phrase"] },
      runs: {},
      "show-run": {},
      resume: { booleanas: ["--skip-gates"] },
      abandon: {},
    },
  },
  manuales: {
    conValor: [],
    booleanas: [],
    subcomandos: {
      pendientes: {
        conValor: ["--tickets", "--manuales-dir", "--pantallas"],
        booleanas: ["--escribir"],
      },
      auditar: { conValor: ["--manuales-dir"] },
      plantilla: {
        conValor: ["--pantalla", "--destino"],
        booleanas: ["--escribir", "--forzar"],
      },
    },
  },
  corpus: {
    conValor: [],
    booleanas: [],
    subcomandos: {
      publicar: {
        conValor: ["--indexador", "--corpus-dir", "--manuales-dir"],
        booleanas: ["--completo"],
      },
    },
  },
  migrate: { conValor: [], booleanas: ["--dry-run"] },
  adopt: { conValor: ["--machine-id"], booleanas: ["--dry-run", "--codegraph"] },
  sync: { conValor: [], booleanas: ["--check", "--dry-run"] },

  // --- Los que `run` despacha antes que `dispatch` ---------------------------------
  serve: { conValor: ["--port", "--host"], booleanas: [] },
  mcp: { conValor: [], booleanas: ["--install", "--global", "--json", "--ask"] },
  hermes: {
    conValor: [],
    booleanas: [],
    subcomandoPorDefecto: "status",
    subcomandos: {
      status: DE_LA_CONEXION_HERMES,
      connect: DE_LA_CONEXION_HERMES,
      test: DE_LA_CONEXION_HERMES,
      notify: { conValor: ["--id", "--receipt", "--to"], booleanas: ["--json"] },
      brief: { conValor: ["--dias", "--to"], booleanas: ["--json"] },
      relay: { booleanas: ["--install"] },
    },
  },
  simulate: { conValor: ["--limit"], booleanas: ["--json", "--calibrate"] },
  "promote-gate": { conValor: ["--limit"], booleanas: [] },
  provider: {
    conValor: ["--id"],
    booleanas: [],
    subcomandoPorDefecto: "list",
    subcomandos: {
      list: {},
      set: { conValor: ["--key"] },
      test: { conValor: ["--model"] },
      models: {},
    },
  },
  routing: {
    conValor: [],
    booleanas: [],
    subcomandoPorDefecto: "show",
    subcomandos: {
      show: {},
      set: { conValor: ["--preset", "--provider", "--model", "--effort"] },
      clear: {},
    },
  },
  perfiles: {
    conValor: ["--cliente"],
    booleanas: [],
    subcomandoPorDefecto: "list",
    subcomandos: { list: {}, show: {}, elegir: {}, quitar: {} },
  },
  doctor: { conValor: [], booleanas: [] },
  onboarding: { conValor: [], booleanas: [], subcomandos: { verify: {} } },
  feature: {
    conValor: [],
    booleanas: [],
    subcomandos: {
      list: {},
      show: {},
      new: { conValor: ["--title"] },
      decompose: { conValor: ["--model", "--provider"], booleanas: ["--dry-run"] },
      materialize: { booleanas: ["--dry-run", "--allow-external-links"] },
      materializar: { booleanas: ["--dry-run", "--allow-external-links"] },
      attach: { conValor: ["--ticket", "--sprint", "--goal", "--depends-on", "--title"] },
      anexar: { conValor: ["--ticket", "--sprint", "--goal", "--depends-on", "--title"] },
      detach: { conValor: ["--ticket"] },
      desanexar: { conValor: ["--ticket"] },
      advance: { conValor: ["--to"], booleanas: ["--pendientes-del-po"] },
      avanzar: { conValor: ["--to"], booleanas: ["--pendientes-del-po"] },
      verify: { booleanas: ["--rewrite"] },
      verificar: { booleanas: ["--rewrite"] },
      asset: {
        conValor: ["--file", "--name", "--description", "--origin-url"],
        booleanas: ["--dry-run"],
      },
      adjunto: {
        conValor: ["--file", "--name", "--description", "--origin-url"],
        booleanas: ["--dry-run"],
      },
    },
  },
  delegation: {
    conValor: [],
    booleanas: [],
    subcomandos: {
      grant: { conValor: ["--feature", "--tickets", "--quote", "--actor"] },
      status: { conValor: ["--delegation"] },
      next: { conValor: ["--delegation"] },
      advance: {
        conValor: ["--delegation", "--id", "--reason", ...DE_LA_COMPUERTA.conValor],
        booleanas: DE_LA_COMPUERTA.booleanas,
      },
      close: {
        conValor: [
          "--delegation",
          "--id",
          "--files",
          "--environment",
          "--tests",
          "--technical-summary",
          "--functional-summary",
          "--release-impact",
          "--po-confirmation",
          "--source",
          "--confidence",
          "--model",
          "--notes",
        ],
        booleanas: ["--tests-passed", "--visual"],
      },
    },
  },
  precision: { conValor: ["--desde", "--hasta"], booleanas: [] },
  thresholds: { conValor: ["--evaluator", "--floor", "--max"], booleanas: ["--band"] },
  journey: {
    conValor: [],
    booleanas: [],
    subcomandos: {
      plan: { conValor: ["--project", "--feature", "--tickets", "--max", "--to"] },
      advance: { conValor: ["--project", "--fase", "--journey", "--to"] },
      next: {
        conValor: ["--concurrency", "--journey", "--project"],
        booleanas: ["--wave"],
      },
      brief: { conValor: ["--id", "--cliente", "--project", "--out"] },
      handoff: { conValor: ["--id", "--project", "--to"], booleanas: ["--saved"] },
      "notify-plans": { conValor: ["--project", "--journey", "--to"] },
      "approve-eligible": { conValor: ["--journey", "--project"] },
      "clear-stop": { conValor: ["--project", "--id", "--actor"] },
      worktree: { conValor: ["--id"], booleanas: ["--retirar"] },
      // Retirado: sigue declarando las banderas del disparador para responder su aviso
      // de retiro (que no escribe nada) en vez de «la bandera no existe».
      "install-trigger": { conValor: ["--project", "--every", "--via", "--dir"] },
    },
  },
  "review-agent": {
    conValor: ["--id", "--stage"],
    booleanas: ["--json", "--dry-run", "--record"],
  },
  "qa-shadow": { conValor: [], booleanas: [] },
  "qa-promote": { conValor: ["--actor", "--quote"], booleanas: [] },
  "qa-policy-close": { conValor: ["--id"], booleanas: [] },
  "qa-agent": { conValor: ["--id", "--base", "--delivered"], booleanas: [] },
  "approval-eligibility": { conValor: ["--id", "--stage"], booleanas: ["--json"] },
  "approve-by-authorization": { conValor: ["--id", "--stage"], booleanas: [] },
  "qa-eligibility": { conValor: ["--id", "--base"], booleanas: [] },
  ux: {
    conValor: [],
    booleanas: [],
    subcomandos: { review: { conValor: ["--id", "--report"], booleanas: ["--staged"] } },
  },
  skills: {
    conValor: [],
    booleanas: [],
    subcomandos: {
      external: {},
      review: { conValor: ["--actor", "--quote", "--permissions"] },
    },
  },
  "approval-authorize": {
    conValor: [],
    booleanas: [],
    subcomandos: {
      create: { conValor: ["--actor", "--quote", ...TERMINOS_DE_APROBACION, "--source"] },
      revoke: { conValor: ["--id", "--actor", "--reason", "--source"] },
      list: {},
      approvals: {},
      link: { conValor: TERMINOS_DE_APROBACION },
      redeem: { conValor: ["--code", "--actor", "--quote"] },
      "revoke-code": { conValor: ["--code", "--actor"] },
    },
  },
  "qa-authorize": {
    conValor: [],
    booleanas: [],
    subcomandos: {
      create: { conValor: ["--actor", "--quote", ...TERMINOS_DE_QA, "--source"] },
      revoke: { conValor: ["--id", "--actor", "--reason", "--source"] },
      list: {},
      link: { conValor: TERMINOS_DE_QA },
      redeem: { conValor: ["--code", "--actor", "--quote"] },
      "revoke-code": { conValor: ["--code", "--actor"] },
    },
  },
  "plan-approve": { conValor: ["--code", "--actor", "--quote"], booleanas: [] },
  approve: {
    conValor: ["--id", "--actor", "--quote", "--reason", ...DE_LA_COMPUERTA.conValor],
    booleanas: DE_LA_COMPUERTA.booleanas,
  },
  close: {
    conValor: [
      "--id",
      "--po-confirmation",
      "--environment",
      "--tests",
      "--technical-summary",
      "--functional-summary",
      "--release-impact",
      "--files",
      "--source",
      "--confidence",
      "--model",
      "--notes",
    ],
    booleanas: [],
  },
  "approve-plan": { conValor: ["--id", "--actor", "--source", "--quote"], booleanas: [] },
  precheck: { conValor: ["--id"], booleanas: [] },
  "gate-decide": {
    conValor: ["--id", "--receipt", "--decision", "--actor", "--code", "--reason"],
    booleanas: [],
  },
  transition: {
    conValor: ["--id", "--entity", "--to", "--point-id", "--reason", "--version"],
    booleanas: [],
  },

  // --- Los comandos de anexado (`ESCRITURA`) ---------------------------------------
  create: {
    conValor: ["--id", "--title", "--type", "--module", "--request"],
    booleanas: [],
  },
  "release-publish": { conValor: ["--version", "--tickets"], booleanas: [] },
  "add-point": {
    conValor: ["--id", "--title", "--severity", "--actual", "--expected", "--files"],
    booleanas: [],
  },
  "qa-start": { conValor: ["--id", "--environment", "--build-reference"], booleanas: [] },
  "qa-close": { conValor: ["--id", "--result", "--po-confirmation"], booleanas: [] },
  "add-evidence": {
    conValor: ["--id", "--kind", "--description", "--reference", "--point-id"],
    booleanas: [],
  },
  "add-retest": {
    conValor: ["--id", "--point-id", "--result", "--po-confirmation"],
    booleanas: [],
  },
  "close-attempt": {
    conValor: [
      "--id",
      "--technical-summary",
      "--functional-summary",
      "--qa-status",
      "--release-impact",
      "--qa-waiver-reason",
      "--po-confirmation",
    ],
    booleanas: [],
  },
  "add-ai-usage": {
    conValor: [
      "--id",
      "--source",
      "--confidence",
      "--session-reference",
      "--model",
      "--reasoning-effort",
      "--input-tokens",
      "--output-tokens",
      "--total-tokens",
      "--estimated-cost-usd",
      "--notes",
    ],
    booleanas: [],
  },

  // --- Los que corren una compuerta o un modelo ------------------------------------
  run: { conValor: ["--ticket"], booleanas: ["--queue"] },
  gate: {
    conValor: ["--id", "--base", ...DE_LA_COMPUERTA.conValor],
    booleanas: DE_LA_COMPUERTA.booleanas,
  },
  cascada: { conValor: ["--tarea", "--solicitud", "--pregunta"], booleanas: [] },
};

/** `true` si la propiedad es del objeto y no de su prototipo: `constructor` no es un comando. */
function propia<T>(
  objeto: Readonly<Record<string, T>> | undefined,
  clave: string,
): T | undefined {
  return objeto !== undefined && Object.hasOwn(objeto, clave) ? objeto[clave] : undefined;
}

/** Los nodos de la tabla que declaran banderas: el comando y cada uno de sus subcomandos. */
function nodos(): readonly Partial<EspecBanderas>[] {
  const todos: Partial<EspecBanderas>[] = [BANDERAS_GLOBALES];
  for (const comando of Object.values(COMANDOS)) {
    todos.push(comando);
    for (const sub of Object.values(comando.subcomandos ?? {})) todos.push(sub);
  }
  return todos;
}

/**
 * Cada bandera que consume valor en algún comando, sin repetidas.
 *
 * Es la lista plana que el parser tuvo siempre (`VALUE_OPTIONS`): ahora se deriva de
 * la tabla, así que no hay dos lugares donde declarar una bandera.
 */
export function banderasConValor(): readonly string[] {
  const vistas = new Set<string>();
  for (const nodo of nodos()) {
    for (const bandera of nodo.conValor ?? []) vistas.add(bandera);
  }
  return [...vistas];
}

/**
 * La spec declarada para una ruta: `[comando]` o `[comando, subcomando]`.
 * `undefined` si la tabla no la tiene.
 */
export function especDe(
  ruta: readonly string[],
): EspecComando | EspecSubcomando | undefined {
  const [comando, sub] = ruta;
  if (comando === undefined) return undefined;
  const espec = propia(COMANDOS, comando);
  if (espec === undefined || ruta.length > 2) return undefined;
  if (sub === undefined) return espec;
  return propia(espec.subcomandos, sub);
}

/**
 * Si la ruta existe: el comando solo, o el comando con un subcomando que declara.
 * Un argumento que no es un verbo (`show <ID>`) no es parte de la ruta.
 */
export function existeComando(ruta: readonly string[]): boolean {
  return especDe(ruta) !== undefined;
}

/** Cómo analiza el parser las banderas de una ruta. */
export interface BanderasDeRuta {
  readonly conValor: ReadonlySet<string>;
  readonly booleanas: ReadonlySet<string>;
  /**
   * `true` cuando la ruta está declarada entera y una bandera que no figura se
   * rechaza. `false` con un comando o subcomando que la tabla no tiene, o con
   * banderas libres: el parser acepta como hasta ahora y responden los mensajes de
   * siempre (el «Comando desconocido» o el «journey admite:»).
   */
  readonly estricta: boolean;
  /** La ruta que se nombra al rechazar: el comando, y el subcomando si lo declara. */
  readonly ruta: readonly string[];
}

/** Lo que la tabla declara para una ruta, sin las globales ni la tolerancia del parser. */
interface Declaradas {
  readonly espec: EspecComando;
  readonly sub: EspecSubcomando | undefined;
  /** El subcomando que la tabla declara y se escribió; `undefined` si no hay o no existe. */
  readonly declarado: EspecSubcomando | undefined;
  /** No se escribió verbo y el comando tiene uno por defecto. */
  readonly sinVerbo: boolean;
}

function declaradas(
  comando: string,
  subcomando: string | undefined,
): Declaradas | undefined {
  const espec = propia(COMANDOS, comando);
  if (espec === undefined) return undefined;
  const declarado =
    subcomando === undefined ? undefined : propia(espec.subcomandos, subcomando);
  const sinVerbo = subcomando === undefined && espec.subcomandoPorDefecto !== undefined;
  const porDefecto = sinVerbo
    ? propia(espec.subcomandos, espec.subcomandoPorDefecto as string)
    : undefined;
  return { espec, sub: declarado ?? porDefecto, declarado, sinVerbo };
}

/**
 * Las banderas que rigen para un comando y su subcomando.
 *
 * Lo del subcomando se suma a lo del comando, y ambos a las globales. Sin verbo rige
 * el `subcomandoPorDefecto` si el comando lo tiene; un comando con verbos y sin
 * verbo por defecto deja que su módulo diga «requiere un subcomando».
 */
export function banderasDeRuta(
  comando: string | undefined,
  subcomando?: string,
): BanderasDeRuta {
  const conTodo = banderasConValor();
  const d = comando === undefined ? undefined : declaradas(comando, subcomando);

  if (comando === undefined || d === undefined) {
    // Sin comando o con uno que no existe: `--version` es la bandera global, no un
    // valor, para que `valmen --version` conteste.
    return {
      conValor: new Set(conTodo.filter((bandera) => bandera !== "--version")),
      booleanas: new Set(BANDERAS_GLOBALES.booleanas),
      estricta: false,
      ruta: comando === undefined ? [] : [comando],
    };
  }

  const ruta = d.declarado === undefined ? [comando] : [comando, subcomando as string];
  const laxa =
    d.espec.banderasLibres === true ||
    d.sub?.banderasLibres === true ||
    (d.espec.subcomandos !== undefined && d.declarado === undefined && !d.sinVerbo);
  if (laxa) {
    return {
      conValor: new Set(conTodo),
      booleanas: new Set(BANDERAS_GLOBALES.booleanas),
      estricta: false,
      ruta,
    };
  }

  return {
    conValor: new Set([
      ...BANDERAS_GLOBALES.conValor,
      ...d.espec.conValor,
      ...(d.sub?.conValor ?? []),
    ]),
    booleanas: new Set([
      ...BANDERAS_GLOBALES.booleanas,
      ...d.espec.booleanas,
      ...(d.sub?.booleanas ?? []),
    ]),
    estricta: true,
    ruta,
  };
}

/**
 * Todas las banderas válidas para una ruta —con valor y booleanas, las globales
 * incluidas—, en el orden en que la tabla las declara. Vacío si la ruta no existe.
 *
 * Una ruta con banderas libres (`process run`) acepta además las que declare el
 * proceso: aquí figuran solo las que la tabla conoce.
 */
export function banderasValidas(ruta: readonly string[]): readonly string[] {
  const [comando, sub] = ruta;
  if (comando === undefined || !existeComando(ruta)) return [];
  const d = declaradas(comando, sub);
  if (d === undefined) return [];
  return [
    ...new Set([
      ...BANDERAS_GLOBALES.conValor,
      ...d.espec.conValor,
      ...(d.sub?.conValor ?? []),
      ...BANDERAS_GLOBALES.booleanas,
      ...d.espec.booleanas,
      ...(d.sub?.booleanas ?? []),
    ]),
  ];
}

/**
 * El rechazo de una bandera que el comando no declara (R-MSG-003): dice cuál es,
 * para qué comando, y lista las que sí acepta.
 */
export function mensajeBanderaDesconocida(
  bandera: string,
  ruta: readonly string[],
): string {
  const nombre = ruta.join(" ");
  const globales = [
    ...BANDERAS_GLOBALES.conValor,
    ...BANDERAS_GLOBALES.booleanas.filter((b) => b !== "-h"),
  ];
  const propias = banderasValidas(ruta).filter(
    (candidata) => !globales.includes(candidata) && candidata !== "-h",
  );
  const aceptadas = propias.length === 0 ? "ninguna propia" : propias.join(", ");
  return (
    `La bandera ${bandera} no existe para ${nombre}. Las que acepta: ${aceptadas} ` +
    `(más las globales ${globales.join(", ")}).`
  );
}

/** El rechazo de un comando que la tabla no tiene. */
export function comandoDesconocido(nombre: string): string {
  return `Comando desconocido: ${nombre}. Use --help para ver los disponibles.`;
}

/** Lo que `USAGE` cita en una línea: un comando, sus verbos y las banderas de esa línea. */
export interface CitaDeAyuda {
  /** El comando de primer nivel. */
  readonly comando: string;
  /** Los verbos que cita la línea (`status|next` son dos); vacío si no cita ninguno. */
  readonly subcomandos: readonly string[];
  /** Las banderas de la línea, sin la descripción. */
  readonly banderas: readonly string[];
  /**
   * `true` si la línea solo continúa a una anterior con banderas
   * (`      --dias <n>   Cuántos días…`): documenta el comando, no un verbo concreto.
   */
  readonly continuacion: boolean;
}

/** Los verbos de la segunda palabra de una línea de comando, si es un verbo. */
function verbosDe(palabra: string | undefined): readonly string[] {
  if (palabra === undefined) return [];
  const sinCorchetes = /^\[([a-z][a-z0-9|-]*)\]$/.exec(palabra)?.[1] ?? palabra;
  return /^[a-z][a-z0-9|-]*$/.test(sinCorchetes) ? sinCorchetes.split("|") : [];
}

/**
 * Lee `USAGE` como lo lee una persona: una línea con dos espacios de sangría que
 * empieza por una palabra es un comando; una línea más sangrada que empieza por una
 * bandera continúa al comando anterior. De cada una se toma la parte anterior a la
 * descripción (la que sigue a un hueco de dos espacios).
 */
export function citasDeAyuda(usage: string): readonly CitaDeAyuda[] {
  const citas: CitaDeAyuda[] = [];
  let ultimo: string | undefined;
  for (const linea of usage.split("\n")) {
    const encabezado = /^ {2}([a-z][a-z0-9-]*)(?=\s|$)/.exec(linea);
    const continuacion = /^ {4,}(?:\[)?--[a-z]/.test(linea);
    if (encabezado === null && !continuacion) continue;

    const celda = linea.trim().split(/\s{2,}/)[0] ?? "";
    const banderas = [...celda.matchAll(/--[a-z][a-z0-9-]*/g)].map((m) => m[0]);
    if (encabezado !== null) {
      const comando = encabezado[1] as string;
      ultimo = comando;
      citas.push({
        comando,
        subcomandos: verbosDe(celda.split(/\s+/)[1]),
        banderas,
        continuacion: false,
      });
    } else if (ultimo !== undefined) {
      citas.push({ comando: ultimo, subcomandos: [], banderas, continuacion: true });
    }
  }
  return citas;
}

/**
 * Los comandos que `USAGE` cita, con su verbo cuando lo lleva: `validate`,
 * `estandar proponer`, `journey worktree`. Sin repetidas.
 */
export function comandosCitadosEnAyuda(usage: string): readonly string[] {
  const citados = new Set<string>();
  for (const cita of citasDeAyuda(usage)) {
    if (cita.continuacion) continue;
    if (cita.subcomandos.length === 0) citados.add(cita.comando);
    for (const sub of cita.subcomandos) citados.add(`${cita.comando} ${sub}`);
  }
  return [...citados];
}
