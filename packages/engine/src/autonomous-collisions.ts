/**
 * Planificación mecánica de colisiones para futuros despachos paralelos.
 *
 * Este módulo no ejecuta procesos ni modifica tickets. Su única entrada sobre
 * escritura es `Puntos[].affected_files`, que ya es una declaración estructurada
 * y canónica del ticket. Por eso una ruta que aparezca solo en la prosa no puede
 * hacer que el motor permita o impida paralelismo.
 */
import { type ParsedTicket } from "@valmen/core";
import { type AutonomousCollisionPolicy } from "@valmen/adapter";

import { declaredFunctionalFiles } from "./references.js";

/** Ticket ya localizado y validado que se evalúa dentro de un mismo repositorio. */
export interface AutonomousCollisionTicket {
  readonly id: string;
  readonly ticketPath: string;
  readonly document: ParsedTicket;
}

/** Una ruta común y los tickets que afirmaron que la escribirían. */
export interface AutonomousWriteCollision {
  readonly path: string;
  readonly ticketIds: readonly string[];
}

/** Ticket que el planificador no deja entrar al mismo lote paralelo. */
export interface AutonomousDeferredTicket {
  readonly ticketId: string;
  readonly reason: string;
}

/** Resultado puro que el futuro despachador debe consumir antes de invocar ejecutores. */
export interface AutonomousCollisionPlan {
  readonly policy: AutonomousCollisionPolicy;
  /** Tickets aptos para el mismo lote según la política, ordenados por ID. */
  readonly selected: readonly string[];
  /** Tickets que se difieren o bloquean, con una causa mecánica. */
  readonly deferred: readonly AutonomousDeferredTicket[];
  /** Rutas declaradas por dos o más tickets, ordenadas de forma estable. */
  readonly collisions: readonly AutonomousWriteCollision[];
  /** Sin rutas declaradas no hay evidencia de independencia y no se paralelizan. */
  readonly withoutDeclarations: readonly string[];
  /** Avisos informativos, incluido el efecto no bloqueante de `warn`. */
  readonly warnings: readonly string[];
}

interface Declaration {
  readonly id: string;
  readonly files: readonly string[];
}

function comparison(left: string, right: string): number {
  return left.localeCompare(right);
}

function deferred(id: string, reason: string): AutonomousDeferredTicket {
  return { ticketId: id, reason };
}

/**
 * Decide qué tickets podría recibir un mismo lote paralelo.
 *
 * `warn` informa las rutas comunes y conserva los tickets declarados. `serialize`
 * elige primero por identificador y difiere cada ticket que comparte alguna ruta
 * con uno ya elegido. `block` difiere a todos los participantes de cualquier
 * colisión. En los tres casos, una lista ausente queda fuera: no se adivina que
 * dos tickets sean independientes solo porque no declararon nada.
 */
export function planAutonomousCollisions({
  root,
  policy,
  tickets,
}: {
  readonly root: string;
  readonly policy: AutonomousCollisionPolicy;
  readonly tickets: readonly AutonomousCollisionTicket[];
}): AutonomousCollisionPlan {
  const declarations = tickets
    .map((ticket): Declaration => ({
      id: ticket.id,
      files: declaredFunctionalFiles(ticket.document, ticket.ticketPath, root),
    }))
    .sort((left, right) => comparison(left.id, right.id));

  const paths = new Map<string, string[]>();
  for (const declaration of declarations) {
    for (const path of declaration.files) {
      paths.set(path, [...(paths.get(path) ?? []), declaration.id]);
    }
  }
  const collisions = [...paths.entries()]
    .filter(([, ids]) => ids.length > 1)
    .map(([path, ids]): AutonomousWriteCollision => ({
      path,
      ticketIds: [...ids].sort(comparison),
    }))
    .sort((left, right) => comparison(left.path, right.path));

  const withoutDeclarations = declarations
    .filter((declaration) => declaration.files.length === 0)
    .map((declaration) => declaration.id);
  const missing = new Set(withoutDeclarations);
  const collisionPathsByTicket = new Map<string, string[]>();
  for (const collision of collisions) {
    for (const id of collision.ticketIds) {
      collisionPathsByTicket.set(id, [
        ...(collisionPathsByTicket.get(id) ?? []),
        collision.path,
      ]);
    }
  }

  const deferredTickets: AutonomousDeferredTicket[] = withoutDeclarations.map((id) =>
    deferred(id, "no declara affected_files"),
  );
  const warnings = withoutDeclarations.map(
    (id) => `${id} no declara affected_files y no puede entrar a un lote paralelo.`,
  );
  const declared = declarations.filter((declaration) => !missing.has(declaration.id));

  if (policy === "warn") {
    for (const collision of collisions) {
      warnings.push(
        `Colisión advertida en ${collision.path}: ${collision.ticketIds.join(", ")}.`,
      );
    }
    return {
      policy,
      selected: declared.map((declaration) => declaration.id),
      deferred: deferredTickets,
      collisions,
      withoutDeclarations,
      warnings,
    };
  }

  if (policy === "block") {
    const blocked = new Set(collisions.flatMap((collision) => collision.ticketIds));
    for (const declaration of declared) {
      const paths = collisionPathsByTicket.get(declaration.id) ?? [];
      if (blocked.has(declaration.id)) {
        deferredTickets.push(deferred(declaration.id, `colisiona en ${paths.join(", ")}`));
      }
    }
    return {
      policy,
      selected: declared
        .filter((declaration) => !blocked.has(declaration.id))
        .map((declaration) => declaration.id),
      deferred: deferredTickets,
      collisions,
      withoutDeclarations,
      warnings,
    };
  }

  const selected: string[] = [];
  const reserved = new Set<string>();
  for (const declaration of declared) {
    const common = declaration.files.filter((path) => reserved.has(path));
    if (common.length > 0) {
      deferredTickets.push(deferred(declaration.id, `colisiona en ${common.join(", ")}`));
      continue;
    }
    selected.push(declaration.id);
    for (const path of declaration.files) reserved.add(path);
  }
  return {
    policy,
    selected,
    deferred: deferredTickets,
    collisions,
    withoutDeclarations,
    warnings,
  };
}
