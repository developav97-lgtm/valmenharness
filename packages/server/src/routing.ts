/**
 * Routing de modelos visto desde la interfaz.
 *
 * La pantalla responde a dos preguntas: qué modelo usa cada rol, y de dónde
 * salió ese modelo. Lo segundo es lo que evita la confusión clásica de los
 * presets: cambiar el preset y no ver efecto porque un override del proyecto
 * tenía la última palabra.
 *
 * El catálogo de modelos que se ofrece **no está inventado**: se pide al
 * catálogo de OpenRouter, que es público y no necesita clave. Si no hay red, se
 * cae a los modelos de los presets incorporados, que están verificados contra
 * ese mismo catálogo, y se dice que el catálogo no está disponible en vez de
 * mostrar una lista corta como si fuera completa.
 *
 * Jev se añade aparte a propósito: vive en el endpoint de Decisions, no en el de
 * chat, así que no aparece al listar modelos. Es el evaluador por defecto porque
 * emite probabilidades calibradas en vez de texto que hay que interpretar.
 *
 * Ver docs/04-PROVEEDORES.md §4 y §5.
 */
import { existsSync, readFileSync } from "node:fs";

import {
  type CascadeRouting,
  type Effort,
  type GateRouting,
  type PerfilDeModelos,
  type PerfilElegido,
  type SeleccionDePerfil,
  EJECUTORES_CON_PERFIL,
  listarPerfiles,
  perfilElegido,
  readSeleccionDePerfil,
  type Preset,
  type ResolvedRoute,
  type Routing,
  DEFAULT_GATE_EVALUATOR,
  PERFILES_INCORPORADOS,
  PRESETS,
  ROLES,
  type CatalogoDeProveedor,
  cascadeRoutingFor,
  comprobarPerfilCompleto,
  comprobarPerfilContraCatalogo,
  gateRoutingFor,
  parseRouting,
  perfilesPath,
  readProjectPerfiles,
  renderPerfiles,
  routingPath,
  presetById,
  renderRouting,
  resolveRouting,
} from "@valmen/adapter";
import { atomicWrite, toFailure } from "@valmen/core";

import { type ConfigDiffLine, diffLines, readConfig, readProviderCandidates } from "./config.js";
import { listProviderModels } from "./providers.js";

/**
 * Ruta de `.valmen/routing.yaml`.
 *
 * La ruta vive en el adaptador, junto con la lectura; aquí solo se usa.
 */
export { routingPath };

/**
 * Los modelos que usará un gate en este proyecto.
 *
 * `preset` existe para el presupuesto (R-S1-003): un ticket que lleva el doble de lo
 * típico de su tipo se evalúa con el preset barato, y eso tiene que valer igual desde
 * la pantalla que desde el CLI —una compuerta evaluada con otro modelo según quién la
 * pida no sería la misma compuerta—.
 */
export function gateRouting(root: string, preset?: string): GateRouting {
  return gateRoutingFor(root, preset === undefined ? {} : { preset });
}

/**
 * Los modelos que usará la cascada verificada en este proyecto.
 *
 * Los tres roles de ejecución —productor, verificador y escalado— se resuelven
 * juntos porque la cadena solo sirve si los tres existen y son distintos: un
 * `reason` no nulo es lo que viaja al motor para que rechace la corrida antes de
 * gastarla, en vez de escalar a donde ya se preguntó.
 */
export function cascadeRouting(root: string, preset?: string): CascadeRouting {
  return cascadeRoutingFor(root, preset === undefined ? {} : { preset });
}

/** El texto guardado, o `""` si el proyecto no declara routing. */
export function readRoutingText(root: string): string {
  try {
    return readFileSync(routingPath(root), "utf8");
  } catch {
    return "";
  }
}

/** Un modelo ofrecido en la lista. */
export interface CatalogModel {
  readonly id: string;
  readonly name: string;
  /** Precio por token de entrada en dólares. */
  readonly promptUsd: number | null;
  /** `true` para los que emiten probabilidades en vez de texto. */
  readonly probabilistic: boolean;
}

/** El catálogo de modelos disponible, con su origen. */
export interface ModelCatalog {
  /** `openrouter` si se pudo consultar; `presets` si se usó la lista local. */
  readonly source: "openrouter" | "presets";
  /** El motivo, si no se pudo consultar. */
  readonly detail: string;
  readonly models: readonly CatalogModel[];
}

/** El estado del routing, tras leerlo o analizar un texto. */
export interface RoutingState {
  readonly path: string;
  readonly text: string;
  readonly ok: boolean;
  readonly error: string;
  readonly preset: string;
  readonly presets: readonly { readonly id: string; readonly description: string }[];
  /** Los roles con su modelo resuelto, en el orden del contrato. */
  readonly roles: readonly ResolvedRoute[];
  readonly diff: readonly ConfigDiffLine[];
}

/** Tamaño máximo del catálogo que se descarga, para no tragarse una respuesta enorme. */
const MAX_CATALOG_BYTES = 8 * 1024 * 1024;

/** El catálogo de modelos, cacheado en memoria. */
let cache: { readonly at: number; readonly catalog: ModelCatalog } | null = null;

/** Una hora: el catálogo cambia a diario, no por minuto. */
const CACHE_MS = 60 * 60 * 1000;

/**
 * Descarta la caché del catálogo.
 *
 * La caché es del proceso, así que un refresco explícito —y las pruebas, que
 * comparten proceso— necesitan poder tirarla. Sin esto, la primera consulta
 * fijaría el catálogo para toda la vida del servidor.
 */
export function resetCatalogCache(): void {
  cache = null;
}

/** La lista de modelos de los presets, verificada contra el catálogo real. */
export function presetModels(): CatalogModel[] {
  const vistos = new Map<string, CatalogModel>();
  for (const preset of PRESETS) {
    for (const ruta of Object.values(preset.roles)) {
      if (vistos.has(ruta.model)) continue;
      vistos.set(ruta.model, {
        id: ruta.model,
        name: ruta.model,
        promptUsd: null,
        probabilistic: ruta.model.startsWith("typesafe/"),
      });
    }
  }
  // Jev primero: es el que el gate usa por defecto y el que alguien viene a
  // buscar cuando abre esta pantalla.
  const jev = vistos.get(DEFAULT_GATE_EVALUATOR);
  if (jev !== undefined) {
    vistos.delete(DEFAULT_GATE_EVALUATOR);
    return [jev, ...vistos.values()];
  }
  return [...vistos.values()];
}

/** Consulta el catálogo público de OpenRouter. No necesita clave. */
export async function fetchCatalog(fetchImpl: typeof fetch = fetch): Promise<ModelCatalog> {
  if (cache !== null && Date.now() - cache.at < CACHE_MS) {
    return cache.catalog;
  }

  let catalog: ModelCatalog;
  try {
    const respuesta = await fetchImpl("https://openrouter.ai/api/v1/models", {
      signal: AbortSignal.timeout(10_000),
    });
    if (!respuesta.ok) {
      throw new Error(`HTTP ${respuesta.status}`);
    }
    const texto = await respuesta.text();
    if (texto.length > MAX_CATALOG_BYTES) {
      throw new Error("la respuesta del catálogo es demasiado grande");
    }
    const datos = JSON.parse(texto) as {
      data?: readonly {
        id?: string;
        name?: string;
        pricing?: { prompt?: string };
      }[];
    };
    const models = (datos.data ?? [])
      .filter(
        (modelo): modelo is { id: string; name?: string; pricing?: { prompt?: string } } =>
          typeof modelo.id === "string" && modelo.id !== "",
      )
      .map((modelo) => ({
        id: modelo.id,
        name: modelo.name ?? modelo.id,
        promptUsd:
          modelo.pricing?.prompt === undefined
            ? null
            : Number.parseFloat(modelo.pricing.prompt),
        probabilistic: false,
      }));

    if (models.length === 0) throw new Error("el catálogo vino vacío");

    catalog = {
      source: "openrouter",
      detail: `${models.length} modelos`,
      // Jev no está en el catálogo de chat: se añade para que se pueda elegir.
      models: [
        {
          id: DEFAULT_GATE_EVALUATOR,
          name: "TypeSafe Jev 1.13 (probabilidades)",
          promptUsd: null,
          probabilistic: true,
        },
        ...models,
      ],
    };
  } catch (caught) {
    catalog = {
      source: "presets",
      detail: `no se pudo consultar el catálogo (${caught instanceof Error ? caught.message : String(caught)})`,
      models: presetModels(),
    };
  }

  // Un fallo de red no se cachea una hora: el siguiente intento puede funcionar.
  if (catalog.source === "openrouter") cache = { at: Date.now(), catalog };
  return catalog;
}

/** El perfil elegido para el proyecto, o `null`; un perfil elegido que no existe falla con su id. */
function perfilDelProyecto(root: string): PerfilElegido | null {
  return perfilElegido(listarPerfiles(root), readSeleccionDePerfil(root));
}

/** Analiza un texto de routing sin escribir nada. */
export function checkRouting(root: string, text: string): RoutingState {
  const guardado = readRoutingText(root);
  const base = {
    path: routingPath(root),
    text,
    presets: PRESETS.map((preset: Preset) => ({
      id: preset.id,
      description: preset.description,
    })),
    diff: diffLines(guardado, text),
  };

  if (text.trim() === "") {
    // Sin archivo, el proyecto usa el preset por defecto: no es un error, es la
    // ausencia de override.
    return {
      ...base,
      ok: true,
      error: "",
      preset: "",
      roles: resolveRouting({ preset: "balanced", roles: {} }),
    };
  }

  try {
    const routing: Routing = parseRouting(text);
    return {
      ...base,
      ok: true,
      error: "",
      preset: routing.preset,
      roles: resolveRouting(routing, null, perfilDelProyecto(root)),
    };
  } catch (caught) {
    return {
      ...base,
      ok: false,
      error: toFailure(caught).message,
      preset: "",
      roles: resolveRouting({ preset: "balanced", roles: {} }),
    };
  }
}

/** El routing vigente del proyecto. */
export function readRouting(root: string): RoutingState {
  return checkRouting(root, readRoutingText(root));
}

/**
 * Guarda el routing, si parsea.
 *
 * Igual que la configuración: un archivo que el harness no puede leer deja los
 * gates sin modelo, y el error aparecería en mitad de una evaluación.
 */
export function writeRouting(
  root: string,
  text: string,
): RoutingState & { readonly written: boolean } {
  const estado = checkRouting(root, text);
  if (!estado.ok) return { ...estado, written: false };
  atomicWrite(routingPath(root), text);
  return { ...estado, written: true, diff: [] };
}

/**
 * Construye el texto de routing a partir de lo que elige el formulario.
 *
 * Los roles sin modelo declarado **no se escriben**: dejar el archivo con los
 * trece roles haría creer que el proyecto decidió algo sobre los trece. Solo se
 * escribe lo que se separa del preset.
 */
export function routingFromForm(input: {
  readonly preset: string;
  readonly roles: Readonly<
    Record<
      string,
      { readonly provider?: string; readonly model?: string; readonly effort?: Effort }
    >
  >;
}): string {
  presetById(input.preset);
  const roles: Record<string, { provider: string; model: string; effort: Effort }> = {};
  for (const [role, valor] of Object.entries(input.roles)) {
    if (!ROLES.some((spec) => spec.id === role)) continue;
    if (valor.model === undefined || valor.model.trim() === "") continue;
    roles[role] = {
      provider: valor.provider ?? "openrouter",
      model: valor.model.trim(),
      effort: valor.effort ?? "auto",
    };
  }
  return renderRouting({ preset: input.preset, roles });
}

/** `true` si el proyecto ya tiene archivo de routing. */
export function hasRouting(root: string): boolean {
  return existsSync(routingPath(root));
}

// ── Perfiles de modelos ─────────────────────────────────────────────────────

interface OpcionesDePerfil {
  readonly env?: NodeJS.ProcessEnv;
  readonly filePath?: string;
  readonly fetchImpl?: typeof fetch;
}

/**
 * El catálogo de cada proveedor que usa el perfil: una consulta por proveedor
 * distinto, con los `candidates` que el proyecto declara en `config.yaml`.
 */
export async function catalogoParaPerfil(
  root: string,
  perfil: PerfilDeModelos,
  opciones: OpcionesDePerfil = {},
): Promise<Record<string, CatalogoDeProveedor>> {
  let config: ReturnType<typeof readConfig> | null = null;
  try {
    config = readConfig(root);
  } catch {
    config = null;
  }
  const proveedores = [...new Set(Object.values(perfil.roles).map((ruta) => ruta.provider))];
  const catalogo: Record<string, CatalogoDeProveedor> = {};
  for (const proveedor of proveedores) {
    try {
      const lista = await listProviderModels(proveedor, {
        ...(opciones.env === undefined ? {} : { env: opciones.env }),
        ...(opciones.filePath === undefined ? {} : { filePath: opciones.filePath }),
        ...(opciones.fetchImpl === undefined ? {} : { fetchImpl: opciones.fetchImpl }),
        candidates: config === null ? [] : readProviderCandidates(config, proveedor),
      });
      catalogo[proveedor] =
        lista === null
          ? null
          : lista.ok
            ? { ok: true, models: lista.models.map((modelo) => modelo.id) }
            : { ok: false, error: lista.error };
    } catch (error) {
      catalogo[proveedor] = { ok: false, error: toFailure(error).message };
    }
  }
  return catalogo;
}

/**
 * Guarda un perfil del proyecto si está completo y cada modelo existe en el
 * catálogo de su proveedor. Si algo falla, `.valmen/profiles.yaml` no se toca.
 */
export async function guardarPerfil(
  root: string,
  perfil: PerfilDeModelos,
  opciones: OpcionesDePerfil = {},
): Promise<{ readonly ok: boolean; readonly errores: string[]; readonly written: boolean }> {
  if (PERFILES_INCORPORADOS.some((incorporado) => incorporado.id === perfil.id)) {
    return {
      ok: false,
      errores: [`"${perfil.id}" es un perfil incorporado y no se puede sobrescribir.`],
      written: false,
    };
  }
  const incompletos = comprobarPerfilCompleto(perfil);
  if (incompletos.length > 0) return { ok: false, errores: incompletos, written: false };
  const errores = comprobarPerfilContraCatalogo(
    perfil,
    await catalogoParaPerfil(root, perfil, opciones),
  );
  if (errores.length > 0) return { ok: false, errores, written: false };

  const guardados = readProjectPerfiles(root).filter((existente) => existente.id !== perfil.id);
  atomicWrite(
    perfilesPath(root),
    renderPerfiles([...guardados, { ...perfil, origen: "proyecto" }], readSeleccionDePerfil(root)),
  );
  return { ok: true, errores: [], written: true };
}

/**
 * Elige el perfil del proyecto o, con `ejecutor`, el de un ejecutor; `perfil: null` quita la
 * elección. Si el perfil no existe o el ejecutor no admite perfil, no escribe nada.
 */
export function elegirPerfil(
  root: string,
  eleccion: { readonly perfil: string | null; readonly ejecutor?: string },
): { readonly ok: boolean; readonly errores: string[]; readonly written: boolean } {
  const { perfil, ejecutor } = eleccion;
  if (ejecutor !== undefined && !(EJECUTORES_CON_PERFIL as readonly string[]).includes(ejecutor)) {
    return {
      ok: false,
      errores: [
        `"${ejecutor}" no es un ejecutor con perfil. Los vigentes son: ${EJECUTORES_CON_PERFIL.join(", ")}.`,
      ],
      written: false,
    };
  }
  if (perfil !== null && !listarPerfiles(root).some((candidato) => candidato.id === perfil)) {
    return { ok: false, errores: [`el perfil "${perfil}" no existe.`], written: false };
  }
  const vigente = readSeleccionDePerfil(root);
  let nueva: SeleccionDePerfil;
  if (ejecutor === undefined) {
    nueva = { proyecto: perfil, ejecutores: vigente.ejecutores };
  } else {
    const { [ejecutor]: _quitado, ...resto } = vigente.ejecutores;
    nueva = {
      proyecto: vigente.proyecto,
      ejecutores: perfil === null ? resto : { ...resto, [ejecutor]: perfil },
    };
  }
  atomicWrite(perfilesPath(root), renderPerfiles(readProjectPerfiles(root), nueva));
  return { ok: true, errores: [], written: true };
}
