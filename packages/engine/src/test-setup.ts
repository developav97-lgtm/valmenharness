/**
 * La preparación del ambiente de pruebas, antes de los criterios.
 *
 * El proyecto declara en `.valmen/config.yaml` los comandos que dejan listo el
 * ambiente —migrar al esquema de pruebas, reutilizar la base con `--keepdb`— y la
 * compuerta mecánica los corre **antes** de los criterios y los deja en el recibo
 * (R-CDEF-007). Sin esto, una segunda corrida contra una base persistente fallaba por
 * la base ya creada y el ticket quedaba bloqueado por algo que no era suyo.
 *
 * Tres reglas, todas sobre la frontera que una migración exige:
 *
 * 1. **Los comandos salen de la configuración del proyecto, nunca del ticket.** El
 *    ticket lo escribe quien la compuerta controla.
 * 2. **Solo contra un esquema permitido.** Si el esquema declarado no está en
 *    `allowed-schemas` no se ejecuta nada y el recibo dice por qué.
 * 3. **Si falla, es una falla del entorno**: se detiene en el primer paso que falla y
 *    los criterios no corren —no probaron nada— y la compuerta termina en revisión.
 */
import { runCommandCheck, CommandError, tailOf } from "@valmen/gate-command";
import { type SetupRecord, type SetupStepRecord, partirComando } from "@valmen/gate";
import { testSetupRefusal } from "@valmen/adapter";

import { allowedSchemas, testSetupConfig, testTimeout } from "./discovery.js";

/** Cómo se ejecuta un comando: inyectable para probar sin tocar una base de datos. */
export type SetupRunner = typeof runCommandCheck;

/**
 * Corre la preparación declarada, o devuelve `null` si el proyecto no declara ninguna.
 *
 * Nunca lanza por un fallo de la preparación: lo devuelve en `failure`, para que
 * quien llama decida cómo terminar la compuerta.
 */
export function runTestSetup(
  root: string,
  run: SetupRunner = runCommandCheck,
): SetupRecord | null {
  const setup = testSetupConfig(root);
  if (setup === null) return null;

  const rechazo = testSetupRefusal(setup, allowedSchemas(root));
  if (rechazo !== null) {
    return {
      schema: setup.schema,
      steps: setup.commands.map(
        (command): SetupStepRecord => ({
          command,
          outcome: "refused",
          exitCode: null,
          durationMs: 0,
          tail: "",
          detail: rechazo,
        }),
      ),
      failure: `la preparación del ambiente no se ejecutó: ${rechazo}`,
    };
  }

  const tope = setup.timeoutMs ?? testTimeout(root);
  const steps: SetupStepRecord[] = [];
  for (const command of setup.commands) {
    const partes = partirComando(command);
    const programa = partes[0];
    if (programa === undefined) continue;

    try {
      const resultado = run(
        {
          propositionId: "preparacion",
          command: programa,
          args: partes.slice(1),
          timeoutMs: tope,
          description: "preparación del ambiente de pruebas",
        },
        { root },
      );
      const bien = resultado.passed;
      steps.push({
        command,
        outcome: bien ? "ok" : "failed",
        exitCode: resultado.exitCode,
        durationMs: resultado.durationMs,
        tail: tailOf(`${resultado.stdout}\n${resultado.stderr}`.trim()),
        ...(resultado.stdoutSha256 === undefined ? {} : { outputSha256: resultado.stdoutSha256 }),
      });
      if (!bien) {
        return {
          schema: setup.schema,
          steps,
          failure: `la preparación del ambiente falló en «${command}» (salió con ${resultado.exitCode})`,
        };
      }
    } catch (caught) {
      const mensaje = caught instanceof CommandError ? caught.message : String(caught);
      steps.push({
        command,
        outcome: "failed",
        exitCode: null,
        durationMs: 0,
        tail: "",
        detail: mensaje,
      });
      return {
        schema: setup.schema,
        steps,
        failure: `la preparación del ambiente no pudo ejecutar «${command}»: ${mensaje}`,
      };
    }
  }
  return { schema: setup.schema, steps, failure: null };
}
