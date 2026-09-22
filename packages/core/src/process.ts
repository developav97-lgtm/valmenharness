/**
 * El contrato de un proceso.
 *
 * Un proceso es un paso a paso declarativo, encadenable y con gates. Nace de un
 * pedido concreto: que al llamar al despliegue se actualicen también los manuales,
 * sin que nadie tenga que acordarse. La alternativa —un script de shell— no deja
 * evidencia de qué corrió, no distingue un paso que bloquea de uno que no, y no
 * puede encadenar otro proceso.
 *
 * ```yaml
 * id: deploy
 * title: Despliegue de release a producción
 * params:
 *   version: { type: string, required: true, pattern: '^\d+\.\d+\.\d+$' }
 * steps:
 *   - id: preflight
 *     title: Dry-run obligatorio
 *     kind: command
 *     run: git log --oneline production..dev
 *     on_failure: abort
 *   - id: manuals
 *     title: Actualizar manuales
 *     kind: process
 *     process: actualizar-manuales
 *     continue_on_failure: true
 * ```
 *
 * **La decisión que gobierna este archivo** es que un proceso **declara** y el
 * motor **ejecuta lo declarado**. Nada de lo que un proceso pide se interpreta a
 * la ligera: las variables se sustituyen con un conjunto cerrado de valores —una
 * variable que no existe es un error, no una cadena vacía—, los pasos que
 * referencian otro proceso o un gate se comprueban al cargar, y un paso cuyo tipo
 * el motor todavía no ejecuta se **rechaza al cargar** en vez de saltarse en
 * silencio. Un paso que se saltea sin decir nada es peor que uno que falla: el
 * proceso reporta éxito y el trabajo no se hizo.
 */
import { EXIT_SCHEMA, fail } from "./errors.js";
import { type YamlMap, type YamlValue, parseYamlSubset } from "./yaml.js";

/** Lo que un paso puede hacer. */
export const STEP_KINDS = ["command", "check", "gate", "process", "agent"] as const;

export type StepKind = (typeof STEP_KINDS)[number];

/**
 * Los tipos que el motor sabe ejecutar.
 *
 * `gate` se ejecuta **esperando**: el proceso se detiene en ese paso y se retoma
 * cuando alguien aprueba. No ejecuta nada por su cuenta, que es exactamente lo que
 * un gate humano significa.
 *
 * `agent` se ejecuta **delegando** en un runtime que el proceso declara. El harness
 * no es un runtime de agentes: no tiene bucle, ni contexto, ni forma de leer un
 * diff y decidir si el trabajo está hecho. Lo que sí sabe es qué hay que hacer, con
 * qué instrucciones y qué evidencia exigir — y eso es lo que le pasa al runtime.
 * Ver `docs/02-MOTOR.md` §7.
 */
export const STEP_KINDS_EJECUTABLES = [
  "command",
  "check",
  "process",
  "gate",
  "agent",
] as const;

/** Qué hacer cuando un paso falla. */
export const ON_FAILURE = ["abort", "continue", "ask"] as const;
export type OnFailure = (typeof ON_FAILURE)[number];

/** El tipo declarado de un parámetro. */
export const PARAM_TYPES = ["string", "number", "boolean"] as const;
export type ParamType = (typeof PARAM_TYPES)[number];

/** Un parámetro del proceso. */
export interface ProcessParam {
  readonly name: string;
  readonly type: ParamType;
  readonly required: boolean;
  /** Expresión regular que el valor tiene que cumplir, si se declara. */
  readonly pattern: string | null;
  readonly description: string | null;
  readonly default: string | null;
}

/** Un paso del proceso. */
export interface ProcessStep {
  readonly id: string;
  readonly title: string;
  readonly kind: StepKind;
  /** El comando o la ruta del ejecutable, según el tipo. */
  readonly run: string | null;
  /** El proceso o el gate al que se refiere, según el tipo. */
  readonly target: string | null;
  /**
   * El runtime que ejecuta un paso de agente: el ejecutable y sus argumentos.
   *
   * Se declara y no se elige aquí porque el harness no tiene uno propio. El
   * resultado de las instrucciones se pasa como **un argumento**: `dsh --profile
   * headless "{prompt}"`. Un runtime que necesite el prompt por otro sitio se
   * adapta con un comando que lo lea.
   *
   * Sin `runtime`, un paso de agente **no se sabe ejecutar** y el proceso se
   * detiene antes de empezar: inventar un runtime sería decidir por el proyecto
   * qué modelo y qué agente usa.
   */
  readonly runtime: string | null;
  /** Qué rol del routing elige el modelo de este paso. */
  readonly modelRole: string | null;
  /** Las instrucciones, ya como texto, con sus variables. */
  readonly instructions: string | null;
  /** Los parámetros con los que se invoca el sub-proceso. */
  readonly params: Readonly<Record<string, string>>;
  readonly onFailure: OnFailure;
  /** `true` si un fallo aquí no detiene el proceso. */
  readonly continueOnFailure: boolean;
  /** `true` si un fallo aquí merece que alguien se entere. */
  readonly notifyOnFailure: boolean;
  /** Qué capturar como evidencia. */
  readonly evidence: readonly string[];
  /** Condición para ejecutar el paso. Sin ella, siempre. */
  readonly when: string | null;
}

/** Un proceso completo. */
export interface ProcessDefinition {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly params: readonly ProcessParam[];
  readonly steps: readonly ProcessStep[];
  /** Los archivos que el proceso declara producir. */
  readonly produces: readonly string[];
  /** Procesos a encadenar al terminar con éxito. */
  readonly onSuccess: readonly string[];
}

/** Un identificador: minúsculas, dígitos y guiones. */
const ID_RE = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

/** El texto de un valor, o falla diciendo dónde. */
function texto(valor: YamlValue | undefined, donde: string): string {
  if (typeof valor !== "string") {
    fail(`process: ${donde} debe ser un texto.`, EXIT_SCHEMA);
  }
  if (valor.trim() === "") {
    fail(`process: ${donde} no puede estar vacío.`, EXIT_SCHEMA);
  }
  return valor;
}

/** Un texto opcional: ausente y vacío son lo mismo. */
function textoOpcional(valor: YamlValue | undefined): string | null {
  if (typeof valor !== "string") return null;
  return valor.trim() === "" ? null : valor.trim();
}

/** Un booleano escrito como `true` o `false`. */
function booleano(
  valor: YamlValue | undefined,
  donde: string,
  porDefecto: boolean,
): boolean {
  if (valor === undefined || valor === "") return porDefecto;
  if (valor === "true") return true;
  if (valor === "false") return false;
  fail(`process: ${donde} debe ser true o false.`, EXIT_SCHEMA);
}

/** La lista de textos, admitiendo un texto suelto. */
function listaDeTextos(valor: YamlValue | undefined, donde: string): string[] {
  if (valor === undefined || valor === "") return [];
  if (typeof valor === "string") return [valor];
  if (!Array.isArray(valor)) {
    fail(`process: ${donde} debe ser una lista de textos.`, EXIT_SCHEMA);
  }
  return valor.map((elemento) => texto(elemento, donde));
}

/**
 * Lee un mapa de sustitución.
 *
 * Los valores se guardan en crudo y se sustituyen al ejecutar el paso, no al
 * cargar el proceso: `params: { version: "{version}" }` reenvía el parámetro del
 * padre, y resolverlo al cargar lo congelaría con el valor de la primera llamada.
 */
function leerParams(valor: YamlValue | undefined, donde: string): Record<string, string> {
  if (valor === undefined || valor === "") return {};
  if (typeof valor === "string" || Array.isArray(valor)) {
    fail(`process: ${donde} debe ser un mapa.`, EXIT_SCHEMA);
  }
  const params: Record<string, string> = {};
  for (const [clave, bruto] of Object.entries(valor)) {
    if (typeof bruto !== "string") {
      fail(`process: ${donde}.${clave} debe ser un texto.`, EXIT_SCHEMA);
    }
    params[clave] = bruto;
  }
  return params;
}

/** Lee la declaración de parámetros. */
function leerParametros(valor: YamlValue | undefined): ProcessParam[] {
  if (valor === undefined || valor === "") return [];
  if (typeof valor === "string" || Array.isArray(valor)) {
    fail("process: params debe ser un mapa.", EXIT_SCHEMA);
  }

  const params: ProcessParam[] = [];
  for (const [nombre, bruto] of Object.entries(valor)) {
    if (!ID_RE.test(nombre)) {
      fail(
        `process: el parámetro "${nombre}" no es un identificador ` +
          "(minúsculas, dígitos y guiones).",
        EXIT_SCHEMA,
      );
    }
    // Un parámetro puede declararse en forma corta —`version: { … }`— o como el
    // tipo a secas: `version: string`.
    const mapa: YamlMap = typeof bruto === "string" ? { type: bruto } : (bruto as YamlMap);
    if (Array.isArray(mapa)) {
      fail(`process: params.${nombre} debe ser un mapa o un tipo.`, EXIT_SCHEMA);
    }

    const tipo = mapa["type"] ?? "string";
    if (typeof tipo !== "string" || !(PARAM_TYPES as readonly string[]).includes(tipo)) {
      fail(
        `process: params.${nombre}.type debe ser ${PARAM_TYPES.join(", ")}.`,
        EXIT_SCHEMA,
      );
    }
    const pattern = textoOpcional(mapa["pattern"]);
    if (pattern !== null) {
      // Se comprueba al cargar y no al ejecutar: un patrón mal escrito es un
      // error del proceso, y descubrirlo con un valor delante hace dudar de cuál
      // de los dos está mal.
      try {
        new RegExp(pattern);
      } catch {
        fail(
          `process: params.${nombre}.pattern no es una expresión regular válida.`,
          EXIT_SCHEMA,
        );
      }
    }

    params.push({
      name: nombre,
      type: tipo as ParamType,
      required: booleano(mapa["required"], `params.${nombre}.required`, false),
      pattern,
      description: textoOpcional(mapa["description"]),
      default: textoOpcional(mapa["default"]),
    });
  }
  return params;
}

/** Lee un paso. */
function leerPaso(valor: YamlValue, indice: number): ProcessStep {
  const donde = `steps[${indice}]`;
  if (typeof valor === "string" || Array.isArray(valor)) {
    fail(`process: ${donde} debe ser un mapa.`, EXIT_SCHEMA);
  }

  const id = texto(valor["id"], `${donde}.id`);
  if (!ID_RE.test(id)) {
    fail(
      `process: el paso "${id}" no es un identificador (minúsculas, dígitos y guiones).`,
      EXIT_SCHEMA,
    );
  }

  const kind = texto(valor["kind"], `${donde}.kind`);
  if (!(STEP_KINDS as readonly string[]).includes(kind)) {
    fail(
      `process: el paso "${id}" tiene kind "${kind}", que no existe. ` +
        `Los válidos son: ${STEP_KINDS.join(", ")}.`,
      EXIT_SCHEMA,
    );
  }

  const onFailureBruto = valor["on_failure"];
  const onFailure =
    onFailureBruto === undefined || onFailureBruto === ""
      ? "abort"
      : texto(onFailureBruto, `${donde}.on_failure`);
  if (!(ON_FAILURE as readonly string[]).includes(onFailure)) {
    fail(`process: ${donde}.on_failure debe ser ${ON_FAILURE.join(", ")}.`, EXIT_SCHEMA);
  }

  // El destino depende del tipo, y exigir el correcto es lo que impide que un
  // `kind: process` sin `process:` se cargue y no haga nada.
  const run =
    kind === "command" || kind === "check" ? texto(valor["run"], `${donde}.run`) : null;
  const target =
    kind === "process" || kind === "gate" ? texto(valor[kind], `${donde}.${kind}`) : null;

  // Un agente necesita instrucciones: sin ellas el runtime no tiene nada que hacer.
  const instructions =
    kind === "agent" ? texto(valor["instructions"], `${donde}.instructions`) : null;
  const runtime = kind === "agent" ? textoOpcional(valor["runtime"]) : null;

  return {
    id,
    title: textoOpcional(valor["title"]) ?? id,
    kind: kind as StepKind,
    run,
    target,
    runtime,
    modelRole: kind === "agent" ? textoOpcional(valor["model_role"]) : null,
    instructions,
    params: leerParams(valor["params"], `${donde}.params`),
    onFailure: onFailure as OnFailure,
    continueOnFailure: booleano(
      valor["continue_on_failure"],
      `${donde}.continue_on_failure`,
      false,
    ),
    notifyOnFailure: booleano(
      valor["notify_on_failure"],
      `${donde}.notify_on_failure`,
      false,
    ),
    evidence: listaDeTextos(valor["evidence"], `${donde}.evidence`),
    when: textoOpcional(valor["when"]),
  };
}

/**
 * Analiza un proceso desde su YAML.
 *
 * Las comprobaciones que se hacen aquí son las que impiden que un proceso roto
 * llegue a ejecutarse: identificadores repetidos, pasos que referencian un
 * proceso o un gate inexistentes, y pasos cuyo tipo el motor no ejecuta todavía.
 * Las dos últimas necesitan el catálogo de procesos y gates del proyecto, así que
 * se comprueban en `validateProcess` y no aquí.
 */
export function parseProcess(text: string, fileName = "process.yaml"): ProcessDefinition {
  const raiz = parseYamlSubset(text, {
    fileName,
    key: /^[a-z][a-z0-9_]*$/,
    keyMessage: "no es válida (minúsculas, dígitos y guiones bajos).",
  });
  if (typeof raiz === "string" || Array.isArray(raiz)) {
    fail(`${fileName}: la raíz debe ser un mapa.`, EXIT_SCHEMA);
  }

  const id = texto(raiz["id"], "id");
  if (!ID_RE.test(id)) {
    fail(
      `${fileName}: el id "${id}" no es un identificador (minúsculas, dígitos y guiones).`,
      EXIT_SCHEMA,
    );
  }

  const pasosBrutos = raiz["steps"];
  if (pasosBrutos === undefined) {
    fail(`${fileName}: falta steps.`, EXIT_SCHEMA);
  }
  if (typeof pasosBrutos === "string" || !Array.isArray(pasosBrutos)) {
    fail(`${fileName}: steps debe ser una lista.`, EXIT_SCHEMA);
  }
  if (pasosBrutos.length === 0) {
    // Un proceso sin pasos no es un proceso: es un nombre. Aceptarlo haría que
    // `valmen process run loquesea` saliera con éxito sin hacer nada.
    fail(`${fileName}: steps no puede estar vacío.`, EXIT_SCHEMA);
  }

  const steps = pasosBrutos.map((paso, indice) => leerPaso(paso, indice));
  const vistos = new Set<string>();
  for (const paso of steps) {
    if (vistos.has(paso.id)) {
      fail(`${fileName}: el paso "${paso.id}" está repetido.`, EXIT_SCHEMA);
    }
    vistos.add(paso.id);
  }

  const params = leerParametros(raiz["params"]);

  // Los parámetros de un paso pertenecen al proceso **destino**, no a este, así
  // que aquí solo se pueden comprobar los de los pasos que sí son de este
  // proceso. La comprobación de los sub-procesos necesita el catálogo completo y
  // vive en `validateProcess`: comprobarla aquí contra los parámetros del padre
  // rechazaba un proceso correcto —uno que pasa a su hijo un parámetro que el hijo
  // declara y el padre no usa—.
  for (const paso of steps) {
    if (paso.kind === "command" || paso.kind === "check") {
      for (const clave of Object.keys(paso.params)) {
        fail(
          `${fileName}: el paso "${paso.id}" es de tipo ${paso.kind} y declara ` +
            `parámetros ("${clave}"). Los parámetros son para los sub-procesos.`,
          EXIT_SCHEMA,
        );
      }
    }
  }

  return {
    id,
    title: textoOpcional(raiz["title"]) ?? id,
    description: textoOpcional(raiz["description"]) ?? "",
    params,
    steps,
    produces: listaDeTextos(raiz["produces"], "produces"),
    onSuccess: leerOnSuccess(raiz["on_success"]),
  };
}

/** Lee `on_success`, que puede ser una lista suelta o bajo `run_process`. */
function leerOnSuccess(valor: YamlValue | undefined): string[] {
  if (valor === undefined || valor === "") return [];
  if (typeof valor === "string") return [valor];
  if (Array.isArray(valor)) return valor.map((elemento) => texto(elemento, "on_success"));
  const procesos = valor["run_process"];
  return listaDeTextos(procesos, "on_success.run_process");
}

/**
 * Comprueba un proceso contra el catálogo del proyecto.
 *
 * Es lo que convierte «el proceso se cargó» en «el proceso se puede ejecutar»:
 * cada `kind: process` tiene que apuntar a un proceso que exista, cada `kind: gate`
 * a un gate declarado, y ningún paso puede usar un tipo que el motor no ejecute.
 * Los ciclos entre procesos se detectan aquí, porque un proceso que se llama a sí
 * mismo no termina nunca y es un error que se escribe sin querer.
 */
export function validateProcess(
  process: ProcessDefinition,
  catalog: {
    readonly processes: readonly string[];
    readonly gates: readonly string[];
    /** Las definiciones, para comprobar los parámetros de cada sub-proceso. */
    readonly definitions?: ReadonlyMap<string, ProcessDefinition>;
  },
): void {
  const procesos = new Set(catalog.processes);
  const gates = new Set(catalog.gates);
  const procesoDeRuntime = new Map<string, string>();

  for (const paso of process.steps) {
    if (!(STEP_KINDS_EJECUTABLES as readonly string[]).includes(paso.kind)) {
      fail(
        `El paso "${paso.id}" de ${process.id} es de tipo ${paso.kind}, y el motor ` +
          `todavía no ejecuta ese tipo. Los que ejecuta son: ` +
          `${STEP_KINDS_EJECUTABLES.join(", ")}.`,
        EXIT_SCHEMA,
      );
    }
    if (paso.kind === "process" && paso.target !== null && !procesos.has(paso.target)) {
      fail(
        `El paso "${paso.id}" de ${process.id} invoca el proceso "${paso.target}", ` +
          `que no existe. Los declarados son: ${[...procesos].sort().join(", ") || "(ninguno)"}.`,
        EXIT_SCHEMA,
      );
    }
    if (paso.kind === "gate" && paso.target !== null && !gates.has(paso.target)) {
      fail(
        `El paso "${paso.id}" de ${process.id} usa el gate "${paso.target}", que no ` +
          `está declarado.`,
        EXIT_SCHEMA,
      );
    }
    // Un paso de agente sin runtime no se puede ejecutar, y decirlo al cargar es la
    // diferencia entre un error y un proceso que se detiene a mitad.
    if (paso.kind === "agent" && paso.runtime === null) {
      fail(
        `El paso "${paso.id}" de ${process.id} es de tipo agent y no declara ` +
          "`runtime:`. El harness no trae uno propio: hay que decir con qué se " +
          "ejecuta, por ejemplo `runtime: dsh --profile headless`.",
        EXIT_SCHEMA,
      );
    }
    if (paso.kind === "agent" && paso.runtime !== null) {
      const dueno = procesoDeRuntime.get(paso.runtime);
      if (dueno !== undefined && dueno !== paso.id) {
        fail(
          `Los pasos "${dueno}" y "${paso.id}" de ${process.id} declaran el mismo ` +
            `runtime ("${paso.runtime}") con instrucciones distintas. Compartirlo les ` +
            "pisaría el contexto, que es la parte del trabajo que no se ve.",
          EXIT_SCHEMA,
        );
      }
      procesoDeRuntime.set(paso.runtime, paso.id);
    }
    if (paso.kind === "process" && paso.target === process.id) {
      fail(
        `El paso "${paso.id}" de ${process.id} se invoca a sí mismo, así que no ` +
          "terminaría nunca.",
        EXIT_SCHEMA,
      );
    }
  }

  // Los parámetros de cada paso que invoca a otro proceso, comprobados contra lo
  // que **ese** proceso declara. Es lo que convierte un `params: { modulo: … }`
  // mal escrito en un error de carga en vez de un sub-proceso que arranca con un
  // parámetro que nadie lee.
  for (const paso of process.steps) {
    if (paso.kind !== "process" || paso.target === null) continue;
    const destino = catalog.definitions?.get(paso.target);
    if (destino === undefined) continue;

    const declarados = new Set(destino.params.map((param) => param.name));
    for (const [clave, valor] of Object.entries(paso.params)) {
      if (!declarados.has(clave)) {
        fail(
          `El paso "${paso.id}" de ${process.id} pasa al proceso "${paso.target}" el ` +
            `parámetro "${clave}", que ese proceso no declara. Los suyos son: ` +
            `${[...declarados].sort().join(", ") || "(ninguno)"}.`,
          EXIT_SCHEMA,
        );
      }
      // Un valor que nombra un parámetro del padre tiene que existir en el padre.
      const nombrado = /^\{([a-z][a-z0-9-]*)\}$/.exec(valor.trim());
      if (nombrado !== null) {
        const propios = new Set(process.params.map((param) => param.name));
        if (!propios.has(nombrado[1] as string)) {
          fail(
            `El paso "${paso.id}" de ${process.id} reenvía {${nombrado[1] as string}}, ` +
              `que ${process.id} no declara.`,
            EXIT_SCHEMA,
          );
        }
      }
    }

    // Y lo que el destino exige y el paso no pasa: se avisa aquí y no al
    // ejecutarlo, que es cuando ya se hizo la mitad del proceso.
    for (const param of destino.params) {
      if (!param.required) continue;
      if (Object.hasOwn(paso.params, param.name) || param.default !== null) continue;
      fail(
        `El paso "${paso.id}" de ${process.id} invoca "${paso.target}" sin pasarle ` +
          `"${param.name}", que es obligatorio.`,
        EXIT_SCHEMA,
      );
    }
  }
}

/**
 * El camino de un proceso hasta sí mismo, si lo hay.
 *
 * Un ciclo de tres pasos es tan infinito como el directo, y el error tiene que
 * mostrar la cadena entera para que se vea dónde cortarla.
 */
export function processCycle(
  id: string,
  processes: ReadonlyMap<string, ProcessDefinition>,
): string[] | null {
  const camino: string[] = [];
  const enCamino = new Set<string>();

  const visitar = (actual: string): string[] | null => {
    if (enCamino.has(actual)) {
      return [...camino.slice(camino.indexOf(actual)), actual];
    }
    const definicion = processes.get(actual);
    if (definicion === undefined) return null;

    enCamino.add(actual);
    camino.push(actual);
    for (const paso of definicion.steps) {
      if (paso.kind !== "process" || paso.target === null) continue;
      const ciclo = visitar(paso.target);
      if (ciclo !== null) return ciclo;
    }
    camino.pop();
    enCamino.delete(actual);
    return null;
  };

  return visitar(id);
}
