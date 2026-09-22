/**
 * El motor de procesos: carga, sustitución y ejecución.
 *
 * Tres decisiones gobiernan este archivo, y las tres son la diferencia entre un
 * proceso que se puede auditar y un script que nadie recuerda haber corrido:
 *
 * 1. **La sustitución es estricta.** `{version}` se reemplaza por el valor del
 *    parámetro, y una variable que no existe **falla**. La alternativa —dejarla
 *    vacía— convierte `git tag v{version}` en `git tag v`, que no falla, y el
 *    error aparece mucho después y en otro sitio.
 * 2. **Cada paso deja evidencia.** Qué corrió, con qué argumentos ya sustituidos,
 *    qué devolvió, cuánto tardó y con qué código salió. Sin eso, un proceso que
 *    «salió bien» no dice nada.
 * 3. **Un fallo se propaga, salvo que el proceso diga lo contrario.**
 *    `continue_on_failure` es explícito en el YAML: un paso que no bloquea es una
 *    decisión escrita, no un descuido.
 *
 * La ejecución es **secuencial y síncrona**: un proceso es un paso a paso, y el
 * orden es parte de lo que declara. Cuando un paso necesite paralelismo —los
 * manuales por módulo— vendrá con `parallel_by`, y entonces la concurrencia será
 * una decisión del proceso, no un efecto del motor.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import {
  type ProcessDefinition,
  type ProcessStep,
  EXIT_INVARIANT,
  EXIT_SCHEMA,
  fail,
  parseProcess,
  validateProcess,
} from "@valmen/core";

import {
  type ProcessRunState,
  type RunStepState,
  gateApproved,
  newRunId,
  writeRun,
} from "./run-state.js";

/** Dónde viven los procesos de un proyecto. */
export function processesDir(root: string): string {
  return join(root, ".valmen", "processes");
}

/** Los archivos de proceso, ordenados. */
function processFiles(root: string): string[] {
  const base = processesDir(root);
  let entradas: string[];
  try {
    entradas = readdirSync(base);
  } catch {
    // Un proyecto sin procesos no es un error: es un proyecto sin procesos.
    return [];
  }
  return entradas
    .filter((nombre) => nombre.endsWith(".yaml") || nombre.endsWith(".yml"))
    .sort()
    .map((nombre) => join(base, nombre));
}

/** Un proceso cargado, con el archivo del que salió. */
export interface LoadedProcess {
  readonly definition: ProcessDefinition;
  /** Ruta relativa del archivo, para poder señalarlo. */
  readonly path: string;
  /** El error de carga, si no se pudo leer. */
  readonly invalid: string | null;
}

/**
 * Carga todos los procesos del proyecto.
 *
 * Un proceso que no se puede leer **no se oculta**: se devuelve con su error,
 * igual que un ticket o una feature. Un archivo con un error de tipeo que
 * desaparece de la lista hace creer que el proceso no existe, y entonces alguien
 * lo escribe otra vez.
 */
export function loadProcesses(root: string): LoadedProcess[] {
  return processFiles(root).map((ruta) => {
    const relativa = `.valmen/processes/${ruta.slice(processesDir(root).length + 1)}`;
    try {
      const texto = readFileSync(ruta, "utf8");
      return { definition: parseProcess(texto, relativa), path: relativa, invalid: null };
    } catch (caught) {
      // El nombre del archivo da el identificador cuando el YAML no lo declara:
      // sin eso, un archivo roto no tendría ni con qué listarse.
      const nombre = relativa
        .replace(/^\.valmen\/processes\//, "")
        .replace(/\.ya?ml$/, "");
      return {
        definition: {
          id: nombre,
          title: "(no se pudo leer)",
          description: "",
          params: [],
          steps: [],
          produces: [],
          onSuccess: [],
        },
        path: relativa,
        invalid: caught instanceof Error ? caught.message : String(caught),
      };
    }
  });
}

/** Los procesos válidos, por identificador. */
export function processCatalog(root: string): Map<string, ProcessDefinition> {
  const catalogo = new Map<string, ProcessDefinition>();
  for (const cargado of loadProcesses(root)) {
    if (cargado.invalid === null) catalogo.set(cargado.definition.id, cargado.definition);
  }
  return catalogo;
}

/** Los gates declarados por el proyecto: los archivos de `.valmen/gates/`. */
function declaredGates(root: string): string[] {
  const base = join(root, ".valmen", "gates");
  let entradas: string[];
  try {
    entradas = readdirSync(base);
  } catch {
    return [];
  }
  return entradas
    .filter((nombre) => nombre.endsWith(".yaml") || nombre.endsWith(".yml"))
    .map((nombre) => nombre.replace(/\.ya?ml$/, ""))
    .sort();
}

/** Lo que un proceso declara y el motor comprueba antes de ejecutarlo. */
export interface ProcessCheck {
  readonly definition: ProcessDefinition;
  readonly path: string;
}

/**
 * Carga un proceso y comprueba que se pueda ejecutar.
 *
 * Se valida **todo el proyecto** y no solo el proceso pedido: un sub-proceso roto
 * no impide que el padre se ejecute hasta que llega a él, y entonces ya hizo la
 * mitad del trabajo. Comprobarlo antes es la diferencia entre un error y un
 * despliegue a medias.
 */
export function requireProcess(root: string, id: string): ProcessCheck {
  const cargados = loadProcesses(root);
  const propio = cargados.find((cargado) => cargado.definition.id === id);

  if (propio === undefined) {
    const disponibles = cargados
      .map((cargado) => cargado.definition.id)
      .sort()
      .join(", ");
    fail(
      `No existe el proceso "${id}". Los declarados son: ${disponibles || "(ninguno)"}.`,
      EXIT_SCHEMA,
    );
  }
  if (propio.invalid !== null) {
    fail(`El proceso "${id}" no se puede leer: ${propio.invalid}`, EXIT_SCHEMA);
  }

  const catalogo = {
    processes: cargados.map((cargado) => cargado.definition.id).sort(),
    gates: declaredGates(root),
    // Las definiciones viajan al validador porque comprobar los parámetros de un
    // paso que invoca a otro proceso exige saber qué declara ese otro.
    definitions: new Map(
      cargados
        .filter((cargado) => cargado.invalid === null)
        .map((cargado) => [cargado.definition.id, cargado.definition]),
    ),
  };
  for (const cargado of cargados) {
    if (cargado.invalid !== null) {
      fail(
        `${cargado.path} no se puede leer, así que el proceso "${id}" no se puede ` +
          `ejecutar: ${cargado.invalid}`,
        EXIT_SCHEMA,
      );
    }
    validateProcess(cargado.definition, catalogo);
  }

  return { definition: propio.definition, path: propio.path };
}

/**
 * Sustituye `{variable}` por su valor.
 *
 * Estricta: una variable que no está en el mapa **falla** con su nombre. La
 * versión permisiva —dejar el texto tal cual, o vaciarlo— produce comandos que se
 * ejecutan mal y no fallan, que es la peor combinación posible en algo que
 * escribe en producción.
 *
 * `{{` escapa una llave literal, para el caso raro de un comando que las
 * necesite.
 */
export function substitute(
  texto: string,
  valores: Readonly<Record<string, string>>,
): string {
  return texto.replace(/\{\{|\}\}|\{([a-z][a-z0-9-]*)\}/g, (coincidencia, nombre) => {
    if (coincidencia === "{{") return "{";
    if (coincidencia === "}}") return "}";
    if (!Object.hasOwn(valores, nombre as string)) {
      fail(
        `La variable {${nombre as string}} no está definida. Las disponibles son: ` +
          `${Object.keys(valores).sort().join(", ") || "(ninguna)"}.`,
        EXIT_SCHEMA,
      );
    }
    return valores[nombre as string] as string;
  });
}

/**
 * Resuelve los valores de un proceso a partir de los parámetros recibidos.
 *
 * Se comprueban el tipo, el `required` y el `pattern` **antes** de ejecutar nada:
 * un `--version` que no es SemVer tiene que fallar antes del primer comando, no
 * en el `git tag` del paso cuatro.
 */
export function resolveParams(
  definition: ProcessDefinition,
  recibidos: Readonly<Record<string, string>>,
): Record<string, string> {
  const valores: Record<string, string> = {};

  const declarados = new Set(definition.params.map((param) => param.name));
  for (const clave of Object.keys(recibidos)) {
    if (!declarados.has(clave)) {
      fail(
        `El proceso "${definition.id}" no declara el parámetro "${clave}". Los ` +
          `declarados son: ${[...declarados].sort().join(", ") || "(ninguno)"}.`,
        EXIT_SCHEMA,
      );
    }
  }

  for (const param of definition.params) {
    const recibido = recibidos[param.name];
    const valor = recibido ?? param.default;

    if (valor === null || valor === undefined) {
      if (param.required) {
        fail(
          `El proceso "${definition.id}" requiere el parámetro "${param.name}".`,
          EXIT_SCHEMA,
        );
      }
      // Un opcional sin valor no entra al mapa: así una variable que lo use falla
      // con su nombre en vez de sustituirse por nada.
      continue;
    }

    if (param.type === "number" && !/^-?\d+(?:\.\d+)?$/.test(valor)) {
      fail(
        `El parámetro "${param.name}" de "${definition.id}" debe ser un número: ${valor}.`,
        EXIT_SCHEMA,
      );
    }
    if (param.type === "boolean" && valor !== "true" && valor !== "false") {
      fail(
        `El parámetro "${param.name}" de "${definition.id}" debe ser true o false: ${valor}.`,
        EXIT_SCHEMA,
      );
    }
    if (param.pattern !== null && !new RegExp(param.pattern).test(valor)) {
      fail(
        `El parámetro "${param.name}" de "${definition.id}" no cumple su patrón ` +
          `(${param.pattern}): ${valor}.`,
        EXIT_SCHEMA,
      );
    }

    valores[param.name] = valor;
  }

  return valores;
}

/** Lo que pasó con un paso. */
export interface StepOutcome {
  readonly id: string;
  readonly title: string;
  readonly kind: string;
  /** El comando ya sustituido, o el proceso invocado. */
  readonly detail: string;
  readonly status: "ok" | "failed" | "skipped" | "waiting";
  readonly exitCode: number | null;
  readonly latencyMs: number;
  readonly stdout: string;
  readonly stderr: string;
  /** Por qué se salteó, si se salteó. */
  readonly reason: string | null;
}

/** El resultado de ejecutar un proceso. */
export interface ProcessRun {
  readonly id: string;
  readonly params: Readonly<Record<string, string>>;
  readonly steps: readonly StepOutcome[];
  /** `true` si todos los pasos que bloquean salieron bien. */
  readonly ok: boolean;
  /**
   * `true` si el proceso se detuvo esperando que una persona apruebe un gate.
   *
   * No es un fallo: es un proceso a medias a propósito, y quien lo mira tiene que
   * poder distinguirlo para saber si hay algo que hacer.
   */
  readonly waiting: boolean;
  /** La corrida persistida, si el proceso se detuvo. */
  readonly state: ProcessRunState | null;
  readonly durationMs: number;
}

/** Lo que hace falta para ejecutar. */
export interface RunProcessRequest {
  readonly root: string;
  readonly id: string;
  readonly params: Readonly<Record<string, string>>;
  /** Escribe en stdout mientras corre. Sin esto, el proceso es silencioso. */
  readonly onStep?: ((outcome: StepOutcome) => void) | undefined;
  /** Tope de salida que se guarda por paso, para no llenar la memoria. */
  readonly maxOutputBytes?: number;
  /** Cuántos sub-procesos se pueden encadenar antes de sospechar un ciclo. */
  readonly maxDepth?: number;
  /**
   * Lo hondo que está esta ejecución.
   *
   * No es lo mismo que `maxDepth`, que es el tope: un sub-proceso que arranca su
   * propio contador desde cero nunca alcanzaría el tope, y el guardia no
   * guardaría nada. El ciclo entre procesos ya se detecta al cargar, pero una
   * cadena larga por un camino que el detector no recorre —un `on_success` que
   * vuelve al principio— se corta aquí.
   */
  readonly depth?: number;
  /**
   * Qué hacer con un gate que nadie aprobó todavía.
   *
   * `wait` —lo normal— detiene el proceso y guarda su estado para retomarlo.
   * `skip` lo saltea, que es útil para ensayar un proceso sin aprobaciones; se
   * declara explícitamente porque un gate que se saltea en silencio no es un gate.
   */
  readonly onGate?: "wait" | "skip";
  /**
   * Retomar una corrida detenida.
   *
   * Se pasa el estado guardado y el motor **sigue desde el paso pendiente**: los
   * anteriores no se repiten, y consta cuáles fueron. Repetir un `git tag` no es
   * idempotente y publicar dos veces es peor.
   */
  readonly resume?: ProcessRunState | undefined;
  /** Inyectable para las pruebas: no ejecuta nada y devuelve lo que recibió. */
  readonly runCommand?: (comando: string, cwd: string) => { status: number; stdout: string; stderr: string };
}

/** Recorta la salida y lo dice, en vez de cortarla en silencio. */
function recortar(texto: string, maximo: number): string {
  if (Buffer.byteLength(texto, "utf8") <= maximo) return texto;
  return `${texto.slice(0, maximo)}\n… (salida recortada a ${maximo} bytes)`;
}

/** Ejecuta un comando con el shell del sistema. */
function ejecutar(
  comando: string,
  cwd: string,
  maximo: number,
): { status: number; stdout: string; stderr: string } {
  const resultado = spawnSync(comando, {
    cwd,
    shell: true,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 8 * 1024 * 1024,
  });
  return {
    status: resultado.status ?? 1,
    stdout: recortar(resultado.stdout ?? "", maximo),
    stderr: recortar(resultado.stderr ?? "", maximo),
  };
}

/**
 * Evalúa un `when`.
 *
 * Admite lo mínimo para que sirva y no sea un lenguaje: `nombre == valor` y
 * `nombre != valor`, sobre las variables ya sustituidas. Un proceso que necesita
 * más que eso necesita un comando, no una expresión.
 */
export function evaluateWhen(
  when: string,
  valores: Readonly<Record<string, string>>,
): boolean {
  // Se sustituye **solo el lado derecho**. El izquierdo es el nombre de una
  // variable y hay que resolverlo contra el mapa, no reemplazarlo: sustituyendo
  // los dos, `modulo == {esperado}` se convertía en `inventario == inventario`
  // —cierto siempre—, y `modulo == inventario` comparaba el valor de `modulo`
  // consigo mismo.
  const match = /^\s*([a-z][a-z0-9-]*)\s*(==|!=)\s*(.*?)\s*$/.exec(when);
  if (match === null) {
    fail(
      `La condición "${when}" no se entiende. Se admite \`variable == valor\` y ` +
        "`variable != valor`.",
      EXIT_SCHEMA,
    );
  }
  const [, variable, operador, derecha] = match;
  if (!Object.hasOwn(valores, variable as string)) {
    fail(
      `La condición "${when}" usa la variable {${variable as string}}, que no está ` +
        `definida. Las disponibles son: ${Object.keys(valores).sort().join(", ") || "(ninguna)"}.`,
      EXIT_SCHEMA,
    );
  }
  const iguales = (valores[variable as string] as string) === substitute(derecha as string, valores);
  return operador === "==" ? iguales : !iguales;
}

/**
 * Ejecuta un proceso.
 *
 * Los sub-procesos comparten el mapa de valores del padre, así que `{version}`
 * sigue significando lo mismo tres niveles abajo. La profundidad está acotada
 * porque un ciclo se detecta al cargar, pero una cadena legítima de veinte
 * procesos casi siempre es un error de escritura, y fallar es más útil que
 * ejecutar veinte cosas.
 */
export function runProcess(request: RunProcessRequest): ProcessRun {
  const { root, id } = request;
  const maximo = request.maxOutputBytes ?? 8 * 1024;
  const inicio = Date.now();
  const { definition } = requireProcess(root, id);
  const valores = resolveParams(definition, request.params);
  const correr =
    request.runCommand ?? ((comando: string, cwd: string) => ejecutar(comando, cwd, maximo));

  // Al retomar, los pasos que ya constan no se repiten: se dan por hechos y se
  // sigue desde el pendiente. Es la diferencia entre retomar un despliegue y
  // volver a desplegarlo.
  const hechos = new Set(
    (request.resume?.steps ?? [])
      .filter((paso) => paso.status === "ok" || paso.status === "skipped")
      .map((paso) => paso.id),
  );
  const pendiente = request.resume?.pendingStep ?? null;
  const resultados: StepOutcome[] = [];
  const registrados: RunStepState[] = [...(request.resume?.steps ?? [])];
  const ahora = (): string => new Date().toISOString();

  let ok = true;
  let waiting = false;
  let detenidoEn: string | null = null;
  let motivo: string | null = null;
  // Al retomar, se saltea todo hasta el paso pendiente. Sin esto, un `git tag` ya
  // ejecutado volvería a correr.
  let alcanzado = pendiente === null;

  for (const paso of definition.steps) {
    if (!alcanzado) {
      if (paso.id !== pendiente) continue;
      alcanzado = true;
    }
    if (hechos.has(paso.id)) continue;

    const resultado = ejecutarPaso({
      paso,
      valores,
      root,
      correr,
      onStep: request.onStep,
      maxOutputBytes: maximo,
      maxDepth: request.maxDepth ?? 8,
      profundidad: request.depth ?? 0,
      onGate: request.onGate ?? "wait",
      // Los pasos del hijo entran **antes** que el paso que lo invoca, que es el
      // orden en que corrieron.
      expandir: (outcomes) => resultados.push(...outcomes),
    });
    resultados.push(resultado);

    // Un gate sin aprobar no es un fallo: detiene el proceso y se guarda dónde.
    if (resultado.status === "waiting") {
      waiting = true;
      detenidoEn = paso.id;
      motivo = resultado.reason;
      break;
    }

    registrados.push({
      id: paso.id,
      status: resultado.status === "skipped" ? "skipped" : resultado.status === "ok" ? "ok" : "failed",
      at: ahora(),
      detail: resultado.detail,
    });

    if (resultado.status === "failed" && !paso.continueOnFailure) {
      ok = false;
      break;
    }
    // `on_failure: ask` no se puede resolver sin alguien delante: se trata como
    // un fallo que detiene, y se dice. Un paso que espera una respuesta que nadie
    // va a dar no puede quedarse colgado.
    if (resultado.status === "failed" && paso.onFailure === "ask") {
      ok = false;
      break;
    }
  }

  if (ok && !waiting) {
    encadenar({ root, definition, valores, resultados, request, correr, maximo });
  }

  // Solo se persiste lo que tiene algo que persistir: un proceso que termina bien
  // o que falla no necesita estado, y dejar un archivo por cada corrida llenaría
  // el proyecto de basura. Lo que se guarda es lo que hay que **retomar**.
  let state: ProcessRunState | null = null;
  if (waiting || request.resume !== undefined) {
    state = {
      runId: request.resume?.runId ?? newRunId(definition.id),
      processId: definition.id,
      params: valores,
      status: waiting ? "waiting" : ok ? "completed" : "failed",
      pendingStep: detenidoEn,
      steps: registrados,
      startedAt: request.resume?.startedAt ?? ahora(),
      updatedAt: ahora(),
      reason: motivo,
    };
    writeRun(root, state);
  }

  return {
    id: definition.id,
    params: valores,
    steps: resultados,
    ok,
    waiting,
    state,
    durationMs: Date.now() - inicio,
  };
}

/** Ejecuta un paso y devuelve lo que pasó. */
function ejecutarPaso(contexto: {
  paso: ProcessStep;
  valores: Readonly<Record<string, string>>;
  root: string;
  correr: (comando: string, cwd: string) => { status: number; stdout: string; stderr: string };
  onStep?: ((outcome: StepOutcome) => void) | undefined;
  maxOutputBytes: number;
  maxDepth: number;
  profundidad: number;
  /** Qué hacer con un gate que nadie aprobó. */
  onGate: "wait" | "skip";
  /** Dónde meter los pasos de un sub-proceso, para que se vean en el resumen. */
  expandir?: ((outcomes: readonly StepOutcome[]) => void) | undefined;
}): StepOutcome {
  const { paso, valores, root } = contexto;
  const anunciar = (outcome: StepOutcome): StepOutcome => {
    contexto.onStep?.(outcome);
    return outcome;
  };

  const base = {
    id: paso.id,
    title: substitute(paso.title, valores),
    kind: paso.kind,
  };

  // La condición se evalúa antes de nada: un paso que no aplica no se ejecuta y
  // **no cuenta como fallo**, porque no lo es.
  if (paso.when !== null && !evaluateWhen(paso.when, valores)) {
    return anunciar({
      ...base,
      detail: substitute(paso.when, valores),
      status: "skipped",
      exitCode: null,
      latencyMs: 0,
      stdout: "",
      stderr: "",
      reason: `La condición no se cumple: ${substitute(paso.when, valores)}`,
    });
  }

  if (paso.kind === "gate" && paso.target !== null) {
    // Un gate no ejecuta nada: **espera**. El proceso se detiene aquí y se retoma
    // cuando alguien aprueba, que es lo que un gate humano significa.
    //
    // Se comprueba si ya está aprobado en el registro de gates del proyecto: así
    // retomar un proceso cuyo gate se aprobó mientras tanto no vuelve a pedirlo.
    const aprobado = gateApproved(root, paso.target);
    const estado: StepOutcome["status"] =
      aprobado !== null ? "ok" : contexto.onGate === "wait" ? "waiting" : "skipped";
    return anunciar({
      id: base.id,
      title: base.title,
      kind: base.kind,
      detail: paso.target,
      status: estado,
      exitCode: aprobado === null ? null : 0,
      latencyMs: 0,
      stdout: "",
      stderr: "",
      reason:
        aprobado !== null
          ? `El gate "${paso.target}" está aprobado por ${aprobado.actor}.`
          : estado === "waiting"
            ? `El gate "${paso.target}" no está aprobado. El proceso queda esperando: ` +
              "apruébalo con `valmen process approve` y retómalo con `process resume`."
            : `El gate "${paso.target}" no está aprobado y se pidió no esperar.`,
    });
  }

  if (paso.kind === "process" && paso.target !== null) {
    if (contexto.profundidad >= contexto.maxDepth) {
      fail(
        `El proceso "${paso.target}" se encadena más de ${contexto.maxDepth} veces ` +
          "desde el proceso inicial. Casi siempre es un ciclo.",
        EXIT_INVARIANT,
      );
    }
    const reenviados: Record<string, string> = {};
    for (const [clave, valor] of Object.entries(paso.params)) {
      reenviados[clave] = substitute(valor, valores);
    }

    const inicio = Date.now();
    // El sub-proceso se ejecuta con el mismo `onStep` para que su salida se vea
    // en orden y no toda junta al final.
    const anidado = runProcess({
      root,
      id: paso.target,
      params: reenviados,
      ...(contexto.onStep === undefined ? {} : { onStep: contexto.onStep }),
      maxOutputBytes: contexto.maxOutputBytes,
      maxDepth: contexto.maxDepth,
      depth: contexto.profundidad + 1,
      runCommand: contexto.correr,
    });
    const fallidos = anidado.steps.filter((resultado) => resultado.status === "failed");

    // Los pasos del hijo se expanden en la salida del padre, con su identificador
    // cualificado. Sin eso, el resumen de un proceso que delega diría «un paso» y
    // no se vería qué corrió de verdad; y con el `onStep` compartido, además
    // salen dos veces.
    contexto.expandir?.(
      anidado.steps.map((resultado) => ({
        ...resultado,
        id: `${paso.id}.${resultado.id}`,
      })),
    );

    return anunciar({
      ...base,
      detail: `${paso.target}(${Object.entries(reenviados)
        .map(([clave, valor]) => `${clave}=${valor}`)
        .join(", ")})`,
      status: anidado.ok ? "ok" : "failed",
      exitCode: anidado.ok ? 0 : 1,
      latencyMs: Date.now() - inicio,
      stdout: "",
      stderr: fallidos.map((resultado) => `${resultado.id}: ${resultado.stderr}`).join("\n"),
      reason: anidado.ok ? null : `El sub-proceso falló en: ${fallidos.map((f) => f.id).join(", ")}`,
    });
  }

  const comando = substitute(paso.run ?? "", valores);
  const inicio = Date.now();
  const resultado = contexto.correr(comando, root);
  const latencia = Date.now() - inicio;

  return anunciar({
    ...base,
    detail: comando,
    status: resultado.status === 0 ? "ok" : "failed",
    exitCode: resultado.status,
    latencyMs: latencia,
    stdout: resultado.stdout,
    stderr: resultado.stderr,
    reason: resultado.status === 0 ? null : `Salió con código ${resultado.status}.`,
  });
}

/** Ejecuta los procesos de `on_success`, en orden. */
function encadenar(contexto: {
  root: string;
  definition: ProcessDefinition;
  valores: Readonly<Record<string, string>>;
  resultados: StepOutcome[];
  request: RunProcessRequest;
  correr: (comando: string, cwd: string) => { status: number; stdout: string; stderr: string };
  maximo: number;
}): void {
  for (const siguiente of contexto.definition.onSuccess) {
    const anidado = runProcess({
      root: contexto.root,
      id: siguiente,
      // Se reenvían los mismos valores, que es lo que hace útil el encadenado:
      // `on_success: [generar-changelog]` recibe la versión que se acaba de usar.
      params: filtrarParams(contexto.root, siguiente, contexto.valores),
      ...(contexto.request.onStep === undefined
        ? {}
        : { onStep: contexto.request.onStep }),
      maxOutputBytes: contexto.maximo,
      maxDepth: contexto.request.maxDepth ?? 8,
      runCommand: contexto.correr,
    });
    contexto.resultados.push(
      ...anidado.steps.map((resultado) => ({ ...resultado, id: `${siguiente}.${resultado.id}` })),
    );
  }
}

/** Los valores que el proceso siguiente declara, de los que ya hay. */
function filtrarParams(
  root: string,
  id: string,
  valores: Readonly<Record<string, string>>,
): Record<string, string> {
  const cargados = loadProcesses(root);
  const definicion = cargados.find((cargado) => cargado.definition.id === id)?.definition;
  if (definicion === undefined) return {};
  const reenviados: Record<string, string> = {};
  for (const param of definicion.params) {
    if (Object.hasOwn(valores, param.name)) {
      reenviados[param.name] = valores[param.name] as string;
    }
  }
  return reenviados;
}

/** El resumen de una ejecución, para imprimirlo. */
export function renderProcessRun(run: ProcessRun): string {
  const marca = (estado: StepOutcome["status"]): string =>
    estado === "ok" ? "✓" : estado === "failed" ? "✗" : "·";

  const lineas = [
    `Proceso ${run.id}: ${run.ok ? "completado" : "detenido"} en ${run.durationMs} ms.`,
    ...run.steps.map((paso) => {
      const detalle =
        paso.status === "skipped"
          ? (paso.reason ?? "salteado")
          : paso.latencyMs > 0
            ? `${paso.latencyMs} ms`
            : "";
      return `  ${marca(paso.status)} ${paso.id} — ${paso.title}${detalle === "" ? "" : ` (${detalle})`}`;
    }),
  ];
  // La salida de un paso que falló se muestra: es lo que hace falta para
  // arreglarlo, y obligar a repetir el proceso con más verbosidad sería pedirle a
  // alguien que vuelva a desplegar para ver un error.
  for (const paso of run.steps) {
    if (paso.status !== "failed") continue;
    if (paso.stdout.trim() !== "") lineas.push(`— ${paso.id} stdout —`, paso.stdout.trimEnd());
    if (paso.stderr.trim() !== "") lineas.push(`— ${paso.id} stderr —`, paso.stderr.trimEnd());
  }
  return lineas.join("\n") + "\n";
}

/** `true` si hay procesos declarados en el proyecto. */
export function hasProcesses(root: string): boolean {
  return existsSync(processesDir(root)) && processFiles(root).length > 0;
}
