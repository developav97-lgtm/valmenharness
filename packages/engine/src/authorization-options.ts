/**
 * Las opciones que la pantalla de autorizaciones ofrece (FEATURE-MC-PANTALLA-AUTORIZACIONES-20261009).
 *
 * Solo lee: los módulos salen de la clave `authorization-modules` de `.valmen/config.yaml` si el
 * proyecto la declara y, si no, del registro de tickets; los tipos, etapas, modos e impactos son
 * las constantes que el motor ya valida al crear una autorización.
 */
import { authorizationModules, type RegistryPaths } from "./discovery.js";
import {
  ETAPAS_APROBABLES,
  IMPACTOS_ADMISIBLES,
  MODOS_DE_APROBACION,
  TIPOS_APROBABLES,
} from "./approval-authorization.js";
import { TIPOS_AUTORIZABLES } from "./qa-authorization.js";
import { listTickets } from "./tickets.js";

export interface ModuloOfrecido {
  readonly module: string;
  readonly tickets: number;
}

export interface OpcionesDeAutorizacion {
  readonly source: "config" | "registry";
  readonly modules: readonly ModuloOfrecido[];
  readonly approval: {
    readonly types: readonly string[];
    readonly stages: readonly string[];
    readonly modes: readonly string[];
    readonly impacts: readonly string[];
  };
  readonly qa: { readonly types: readonly string[] };
}

/** Las opciones de autorización del proyecto de `root`. No escribe nada. */
export function opcionesDeAutorizacion(root: string, paths: RegistryPaths): OpcionesDeAutorizacion {
  const cuenta = new Map<string, number>();
  for (const fila of listTickets(paths)) {
    const modulo = fila.module.trim().toUpperCase();
    if (modulo === "" || modulo === "?") continue;
    cuenta.set(modulo, (cuenta.get(modulo) ?? 0) + 1);
  }
  const declarados = authorizationModules(root);
  let modules: ModuloOfrecido[];
  let source: "config" | "registry";
  if (declarados !== null) {
    source = "config";
    const vistos = new Set<string>();
    modules = [];
    for (const nombre of declarados) {
      const modulo = nombre.toUpperCase();
      if (vistos.has(modulo)) continue;
      vistos.add(modulo);
      modules.push({ module: modulo, tickets: cuenta.get(modulo) ?? 0 });
    }
  } else {
    source = "registry";
    modules = [...cuenta.entries()]
      .map(([module, tickets]) => ({ module, tickets }))
      .sort((a, b) => b.tickets - a.tickets || a.module.localeCompare(b.module));
  }
  return {
    source,
    modules,
    approval: {
      types: [...TIPOS_APROBABLES],
      stages: [...ETAPAS_APROBABLES],
      modes: [...MODOS_DE_APROBACION],
      impacts: [...IMPACTOS_ADMISIBLES],
    },
    qa: { types: [...TIPOS_AUTORIZABLES] },
  };
}
