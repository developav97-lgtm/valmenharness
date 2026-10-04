/** Superficie del despacho autónomo: la decisión permanece en @valmen/engine. */
import { EXIT_SCHEMA, toFailure } from "@valmen/core";
import { runAutonomous, type RegistryPaths } from "@valmen/engine";

import type { CommandResult } from "./commands.js";

export async function runAutonomousCommand(
  paths: RegistryPaths,
  flags: Readonly<Record<string, string | true>>,
): Promise<CommandResult> {
  const ticket = typeof flags.ticket === "string" ? flags.ticket : undefined;
  const queue = flags.queue === true;
  if (ticket === undefined && !queue) {
    return { stdout: "", stderr: "run requiere --ticket <ID> o --queue.\n", exitCode: EXIT_SCHEMA };
  }
  if (ticket !== undefined && queue) {
    return { stdout: "", stderr: "run admite --ticket o --queue, no ambos.\n", exitCode: EXIT_SCHEMA };
  }
  try {
    const result = await runAutonomous({ paths, ...(ticket === undefined ? {} : { ticketId: ticket }), ...(queue ? { queue: true } : {}) });
    const prefix = result.status === "delivered" ? "Entregado" : "Detenido";
    return {
      stdout: `${prefix}: ${result.ticketId} (${result.status}).\n${result.detail}\n`,
      stderr: "",
      exitCode: result.status === "delivered" ? 0 : 6,
    };
  } catch (caught) {
    const failure = toFailure(caught);
    return { stdout: "", stderr: `${failure.message}\n`, exitCode: failure.exitCode };
  }
}
