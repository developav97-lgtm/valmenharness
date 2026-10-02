/**
 * Comandos locales para observar una ejecución sin depender de un tablero.
 *
 * La CLI sólo traduce argumentos: la identidad, el aislamiento por proyecto y
 * la persistencia pertenecen al contrato de @valmen/engine, el mismo que
 * consumirá MCP. Así una instalación sin Hermes conserva el historial.
 */
import { createExecutionIdentity, EXIT_SCHEMA, toFailure } from "@valmen/core";
import {
  createExecutionContract,
  EXECUTION_ACTIVITY_STATES,
  resolveAuthorizedProject,
  type ExecutionActivityState,
} from "@valmen/engine";

import type { CommandResult } from "./commands.js";

export interface ExecutionCommandOptions {
  readonly home?: string | undefined;
}

type Flags = Readonly<Record<string, string | true>>;

/** Ejecuta `valmen execution record|list` sobre un proyecto declarado localmente. */
export function executionCommand(
  args: readonly string[],
  flags: Flags,
  options: ExecutionCommandOptions = {},
): CommandResult {
  const action = args[0];
  if (action !== "record" && action !== "list") {
    return {
      stdout: "",
      stderr: "execution requiere record o list.",
      exitCode: EXIT_SCHEMA,
    };
  }

  const projectId = value(flags, "project");
  const ticketId = value(flags, "ticket");
  const executionId = value(flags, "execution");
  if (projectId === undefined || ticketId === undefined || executionId === undefined) {
    return {
      stdout: "",
      stderr: "execution requiere --project, --ticket y --execution.",
      exitCode: EXIT_SCHEMA,
    };
  }

  try {
    const project = resolveAuthorizedProject({
      projectId,
      ...(options.home === undefined ? {} : { home: options.home }),
    });
    const contract = createExecutionContract(project);
    const identity = createExecutionIdentity({ projectId, ticketId, executionId });
    const attemptId = value(flags, "attempt");

    if (action === "list") {
      const activity = contract.readActivity(identity, attemptId);
      return {
        stdout: flags.json === true
          ? `${JSON.stringify(activity, null, 2)}\n`
          : renderActivity(activity),
        stderr: "",
        exitCode: 0,
      };
    }

    const eventId = value(flags, "event-id");
    const state = value(flags, "state");
    const source = value(flags, "source");
    const occurredAt = value(flags, "occurred-at");
    if (
      attemptId === undefined || eventId === undefined || state === undefined ||
      source === undefined || occurredAt === undefined
    ) {
      return {
        stdout: "",
        stderr: "execution record requiere --attempt, --event-id, --state, --source y --occurred-at.",
        exitCode: EXIT_SCHEMA,
      };
    }
    if (!EXECUTION_ACTIVITY_STATES.includes(state as ExecutionActivityState)) {
      return {
        stdout: "",
        stderr: `--state debe ser uno de: ${EXECUTION_ACTIVITY_STATES.join(", ")}.`,
        exitCode: EXIT_SCHEMA,
      };
    }

    const appended = contract.recordActivity({
      eventId,
      identity,
      attemptId,
      state: state as ExecutionActivityState,
      source,
      occurredAt,
    });
    return {
      stdout: appended.appended
        ? `Actividad registrada: ${state} (cursor ${appended.event.cursor}).\n`
        : `Actividad ya registrada: ${state} (cursor ${appended.event.cursor}).\n`,
      stderr: "",
      exitCode: 0,
    };
  } catch (caught) {
    const failure = toFailure(caught);
    return { stdout: "", stderr: failure.message, exitCode: failure.exitCode };
  }
}

function value(flags: Flags, name: string): string | undefined {
  const candidate = flags[name];
  return typeof candidate === "string" ? candidate : undefined;
}

function renderActivity(activity: readonly {
  readonly cursor: number;
  readonly state: string;
  readonly attemptId: string;
  readonly source: string;
  readonly occurredAt: string;
}[]): string {
  if (activity.length === 0) return "No hay actividad registrada para esta ejecución.\n";
  return activity
    .map((event) => `${event.cursor}\t${event.occurredAt}\t${event.state}\t${event.attemptId}\t${event.source}`)
    .join("\n") + "\n";
}
