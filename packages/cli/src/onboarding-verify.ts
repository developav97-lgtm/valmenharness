/**
 * Comprueba la puesta en marcha sin convertir el proyecto desde el que se
 * invoca en el sujeto de la prueba. Las escrituras necesarias ocurren únicamente
 * en una raíz efímera que se elimina aun si una comprobación falla.
 */
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, relative } from "node:path";

import { adoptProject, syncProject, type CommandResult } from "./commands.js";
import { doctorCommand } from "./setup.js";

/** Una foto pequeña del registro real para detectar una escritura accidental. */
function snapshotRegistry(root: string): string {
  const registry = join(root, "tickets");
  if (!existsSync(registry)) return "(sin registro)";

  const visit = (directory: string): string[] =>
    readdirSync(directory, { withFileTypes: true })
      .sort((a, b) => a.name.localeCompare(b.name))
      .flatMap((entry) => {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) return visit(path);
        if (!entry.isFile()) return [];
        return [`${relative(registry, path)}\u0000${readFileSync(path, "utf8")}`];
      });

  return visit(registry).join("\n");
}

/** Ejecuta la ruta CLI documentada contra un proyecto temporal y aislado. */
export async function verifyOnboarding(root: string): Promise<CommandResult> {
  const registryBefore = snapshotRegistry(root);
  const temporaryRoot = mkdtempSync(join(tmpdir(), "valmen-onboarding-"));
  const temporaryHome = join(temporaryRoot, "home");
  const lines = ["Verificación temporal de puesta en marcha", ""];

  try {
    writeFileSync(
      join(temporaryRoot, "package.json"),
      '{"name":"valmen-onboarding"}\n',
      "utf8",
    );

    const adoption = adoptProject(temporaryRoot, basename(temporaryRoot), {
      home: temporaryHome,
    });
    if (adoption.exitCode !== 0) {
      return {
        stdout: "",
        stderr: `No se pudo adoptar la raíz temporal: ${adoption.stderr}`,
        exitCode: adoption.exitCode,
      };
    }

    const sync = syncProject(temporaryRoot, basename(temporaryRoot), false);
    if (sync.exitCode !== 0) {
      return {
        stdout: "",
        stderr: `No se pudo sincronizar la raíz temporal: ${sync.stderr}`,
        exitCode: sync.exitCode,
      };
    }

    const doctor = await doctorCommand(
      { root: temporaryRoot, ticketsDir: "tickets" },
      { env: { HERMES_HOME: join(temporaryHome, ".hermes") } },
    );
    // `doctor` puede devolver 2 por falta de credenciales: el requisito exige
    // declarar esa ausencia, no inventar una clave ni aprobar un gate.
    if (doctor.exitCode !== 0 && doctor.exitCode !== 2) {
      return {
        stdout: "",
        stderr: `El diagnóstico temporal falló: ${doctor.stderr}`,
        exitCode: doctor.exitCode,
      };
    }

    if (snapshotRegistry(root) !== registryBefore) {
      return {
        stdout: "",
        stderr: "La verificación detectó un cambio en el registro de origen y se detuvo.",
        exitCode: 2,
      };
    }

    lines.push(
      "  ✓ Flujo CLI mecánico verificado (adopt, sync y doctor en una raíz temporal).",
      "  · Proveedor semántico no configurado: no se ejecutaron gates ni se aprobó ningún ticket.",
      "  · MCP no comprobado: la verificación no instala ni reinicia clientes.",
      "  · Hermes no comprobado: la verificación no conecta perfiles ni inicia procesos.",
      "  ✓ Registro de origen sin cambios.",
    );
    return { stdout: `${lines.join("\n")}\n`, stderr: "", exitCode: 0 };
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
}
