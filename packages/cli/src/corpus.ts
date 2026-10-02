/** Los subcomandos de publicación del corpus derivado del proyecto. */
import { EXIT_SCHEMA } from "@valmen/core";

import { corpusPublicarCommand, type CommandResult } from "./commands.js";

/** `corpus <subcomando>`: el despachador. */
export function runCorpus(
  root: string,
  args: readonly string[],
  flags: Readonly<Record<string, string | true>>,
): CommandResult {
  const [sub] = args;
  switch (sub) {
    case "publicar":
      return corpusPublicarCommand(root, flags);
    case undefined:
      return {
        stdout: "",
        stderr: "corpus requiere un subcomando: publicar.",
        exitCode: EXIT_SCHEMA,
      };
    default:
      return {
        stdout: "",
        stderr: `Subcomando de corpus desconocido: ${sub}. Use publicar.`,
        exitCode: EXIT_SCHEMA,
      };
  }
}
