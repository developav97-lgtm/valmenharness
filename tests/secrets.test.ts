/**
 * El detector de secretos.
 *
 * Dos cosas se afirman aquí, y la segunda importa tanto como la primera: que
 * encuentre lo que tiene que encontrar, y que **no** encuentre lo que no. Un
 * detector que grita en falso se ignora, y un detector ignorado deja pasar el
 * secreto de verdad.
 *
 * Los valores de prueba se arman por concatenación a propósito: así este archivo
 * no contiene un secreto con forma de secreto, y la revisión de los cambios
 * pendientes de este mismo repositorio sigue limpia. Un test que ensucia el
 * detector que prueba no sirve dos veces.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { scanPendingChanges, scanSecrets } from "../packages/engine/src/secrets.js";
import { runMechanicalChecks } from "../packages/engine/src/state.js";
import { renderFixtureTicket } from "./helpers/fixtures.js";

/** Un valor con forma de credencial, sin escribirlo entero en el archivo. */
const AWS = `AKIA${"IOSFODNN7EXAMPLE".slice(0, 16)}`;
const GITHUB = `ghp_${"a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8".slice(0, 36)}`;
const CLAVE = `sk-${"proj-A1b2C3d4E5f6G7h8I9j0".slice(0, 26)}`;
const JWT = `eyJ${"hbGciOiJIUzI1NiJ9"}.eyJ${"zdWIiOiIxMjM0NTY3ODkwIn0"}.${"dBjftJeZ4CVPmB92K27uhbUJU1p1r"} `;
const ASIGNADA = `${"Xk29fJ3kLm91Qz".slice(0, 14)}`;
const BEARER = `${"aB3dE5gH7jK9lM1nO3pQ5rS7".slice(0, 22)}`;
const PRIVADA = `-----BEGIN ${"RSA PRIVATE"} KEY-----`;
// valmen:allow-secret: la credencial es de mentira, y el valor se arma acá para que
// el caso exista en tiempo de ejecución sin que el archivo lo contenga escrito.
const CONEXION = `postgres://admin:${"s3cr3t0"}@db.interno:5432/ventas`;

const kinds = (texto: string): string[] => scanSecrets(texto).map((h) => h.kind);

describe("lo que encuentra", () => {
  it("reconoce las credenciales con forma propia", () => {
    expect(kinds(`const k = "${AWS}"`)).toEqual(["aws-access-key"]);
    expect(kinds(`token: ${GITHUB}`)).toEqual(["github-token"]);
    expect(kinds(`OPENAI=${CLAVE}`)).toEqual(["clave-de-api"]);
    expect(kinds(`Authorization: Bearer ${BEARER}`)).toEqual(["token-bearer"]);
    expect(
      kinds(`eyJ${"hbGciOiJIUzI1NiJ9"}.eyJ${"zdWIiOiIxIn0"}.${"dBjftJeZ4CVPmB92K2"}`),
    ).toEqual(["jwt"]);
    expect(kinds(PRIVADA)).toEqual(["clave-privada"]);
  });

  it("reconoce una cadena de conexión con credenciales dentro", () => {
    expect(kinds(CONEXION)).toEqual(["cadena-de-conexion"]);
  });

  it("reconoce una credencial asignada con un valor que parece real", () => {
    expect(kinds(`password = "${ASIGNADA}"`)).toEqual(["credencial-asignada"]);
    expect(kinds(`API_KEY: ${ASIGNADA}`)).toEqual(["credencial-asignada"]);
    // `clave` también: el harness se usa sobre código escrito en español, y la
    // etiqueta que no está en la lista es la que deja pasar el secreto.
    expect(kinds(`clave = "${ASIGNADA}"`)).toEqual(["credencial-asignada"]);
  });

  it("no repite el mismo secreto dos veces en la misma línea", () => {
    // Coincide con el patrón de GitHub y además parece una asignación. Reportarlo
    // dos veces haría dudar de si son dos secretos.
    expect(kinds(`token: ${GITHUB}`)).toHaveLength(1);
  });
});

describe("lo que no encuentra", () => {
  it("la prosa que habla de tokens sin tener ninguno", () => {
    expect(kinds("el token de la sesión se guarda en IndexedDB")).toEqual([]);
    expect(kinds("el secreto se resuelve por variable de entorno")).toEqual([]);
  });

  it("un valor que se lee del entorno", () => {
    expect(kinds("const k = process.env.OPENAI_API_KEY;")).toEqual([]);
    expect(kinds("password = os.environ['DB_PASSWORD']")).toEqual([]);
  });

  it("los marcadores de plantilla y documentación", () => {
    expect(kinds("API_KEY=your-api-key-here")).toEqual([]);
    expect(kinds('password = "changeme"')).toEqual([]);
    expect(kinds('token = "xxxxxxxxxxxxxxxx"')).toEqual([]);
    expect(kinds('secret = "{{ vault_secret }}"')).toEqual([]);
  });

  it("una cadena corta que solo parece una clave por la etiqueta", () => {
    expect(kinds('password = "abc123"')).toEqual([]);
  });

  it("la marca perdona la línea del valor, aunque haya comentarios en el medio", () => {
    // En YAML, o cuando hay que explicar por qué el valor es legítimo, el
    // comentario va arriba y no al costado.
    expect(kinds(`# valmen:allow-secret\npassword = "${ASIGNADA}"`)).toEqual([]);
    expect(
      kinds(
        `// valmen:allow-secret: es de mentira\n// y el caso tiene que existir\nclave = "${ASIGNADA}"`,
      ),
    ).toEqual([]);
  });

  it("la marca que perdona una línea", () => {
    // Hay casos legítimos: la prueba del propio detector, un fixture con una clave
    // de mentira, la documentación de un formato. Sin salida, la única forma de
    // tenerlos sería apagar el chequeo entero.
    expect(kinds(`${JWT}  // valmen:allow-secret`)).toEqual([]);
    expect(kinds(`password = "${ASIGNADA}" # valmen:allow-secret`)).toEqual([]);
  });
});

describe("el reporte", () => {
  it("ubica el hallazgo sin repetir el valor", () => {
    // Un detector que copia el secreto a la consola, al recibo o al log lo
    // multiplica. Lo que se muestra alcanza para encontrarlo: tipo, línea y la
    // línea con el valor tapado.
    const [hallazgo] = scanSecrets(`clave = "${CLAVE}"`);

    expect(hallazgo?.line).toBe(1);
    expect(hallazgo?.preview).toContain("«oculto»");
    expect(hallazgo?.preview).not.toContain(CLAVE.slice(0, 20));
    expect(JSON.stringify(hallazgo)).not.toContain(CLAVE.slice(0, 20));
  });

  it("cuenta las líneas desde uno", () => {
    const hallazgos = scanSecrets(`linea uno\nlinea dos\nclave = "${CLAVE}"`);
    expect(hallazgos[0]?.line).toBe(3);
  });
});

describe("los cambios pendientes", () => {
  let lab: string;

  const git = (...args: string[]): void => {
    execFileSync("git", args, { cwd: lab, stdio: "ignore" });
  };

  beforeEach(() => {
    lab = mkdtempSync(join(tmpdir(), "valmen-secretos-"));
    git("init", "-q", ".");
    git("config", "user.email", "prueba@valmen.local");
    git("config", "user.name", "Prueba");
    writeFileSync(join(lab, "app.py"), "print('hola')\n", "utf8");
    git("add", ".");
    git("commit", "-qm", "inicial");
  });

  afterEach(() => {
    rmSync(lab, { recursive: true, force: true });
  });

  it("encuentra un secreto en un archivo nuevo, que es donde nadie revisa", () => {
    writeFileSync(join(lab, "config-local.py"), `OPENAI = "${CLAVE}"\n`, "utf8");
    const { findings, scanned } = scanPendingChanges(lab);

    expect(scanned).toBe(1);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.path).toBe("config-local.py");
    expect(findings[0]?.line).toBe(1);
  });

  it("encuentra un secreto en una línea agregada, y dice en qué línea quedó", () => {
    writeFileSync(join(lab, "app.py"), `print('hola')\n\nDB = "${CONEXION}"\n`, "utf8");
    const { findings } = scanPendingChanges(lab);

    expect(findings).toHaveLength(1);
    expect(findings[0]?.path).toBe("app.py");
    expect(findings[0]?.line).toBe(3);
  });

  it("no reporta un secreto que ya estaba en el archivo", () => {
    // Marco el objetivo: que un secreto no **entre**. Marcar lo que ya estaba
    // convertiría el chequeo en un obstáculo para tocar archivos viejos, y el
    // trabajo se detendría por algo que no es de quien está trabajando.
    writeFileSync(join(lab, "viejo.py"), `VIEJO = "${CLAVE}"\n`, "utf8");
    git("add", ".");
    git("commit", "-qm", "con un secreto viejo");

    writeFileSync(join(lab, "viejo.py"), `VIEJO = "${CLAVE}"\nprint('nuevo')\n`, "utf8");
    const { findings } = scanPendingChanges(lab);

    expect(findings).toEqual([]);
  });

  it("con `staged` mira solo lo que está en el índice", () => {
    writeFileSync(join(lab, "indexado.py"), `CLAVE = "${CLAVE}"\n`, "utf8");
    writeFileSync(join(lab, "suelto.py"), `clave = "${ASIGNADA}"\n`, "utf8");
    git("add", "indexado.py");

    const soloIndice = scanPendingChanges(lab, true);
    expect(soloIndice.findings.map((h) => h.path)).toEqual(["indexado.py"]);

    // Sin `staged`, los dos: lo pendiente es lo pendiente, esté indexado o no.
    const todo = scanPendingChanges(lab);
    expect(todo.findings.map((h) => h.path).sort()).toEqual(["indexado.py", "suelto.py"]);
  });

  it("un cambio limpio se reporta como limpio, con cuántos archivos miró", () => {
    writeFileSync(join(lab, "app.py"), "print('hola')\nprint('chau')\n", "utf8");
    const { findings, scanned } = scanPendingChanges(lab);

    expect(findings).toEqual([]);
    expect(scanned).toBe(1);
  });

  it("no mira los archivos que git ignora, porque no van a entrar", () => {
    // Y conviene saberlo: `.env` suele estar ignorado, así que el archivo donde
    // más probable es que haya un secreto es justo el que no se revisa —no va a
    // entrar al repositorio, que es lo que este chequeo protege—. Si alguien lo
    // fuerza con `git add -f`, aparece en el índice y `staged` lo ve.
    writeFileSync(join(lab, ".gitignore"), ".env\n", "utf8");
    writeFileSync(join(lab, ".env"), `OPENAI=${CLAVE}\n`, "utf8");

    expect(scanPendingChanges(lab).findings.map((h) => h.path)).not.toContain(".env");

    git("add", "-f", ".env");
    expect(scanPendingChanges(lab, true).findings.map((h) => h.path)).toContain(".env");
  });

  it("no falla en un directorio que no es un repositorio", () => {
    const suelto = mkdtempSync(join(tmpdir(), "valmen-sin-git-"));
    try {
      expect(scanPendingChanges(suelto).findings).toEqual([]);
    } finally {
      rmSync(suelto, { recursive: true, force: true });
    }
  });
});

describe("el chequeo de la compuerta", () => {
  /** El check de secretos sobre el texto de un ticket. */
  function check(texto: string): { result: string; detail?: string } {
    const encontrado = runMechanicalChecks(texto).find((c) => c.id === "sin_secretos");
    if (encontrado === undefined) throw new Error("El check de secretos no se ejecutó.");
    return encontrado;
  }

  it("corre sobre el texto del ticket, que es lo que se le manda al modelo", () => {
    // El ticket tiene que ser válido: los checks corren sobre tickets que el
    // parser acepta, y uno inventado a medias falla antes por otra razón.
    const ticket = renderFixtureTicket({
      id: "BUGFIX-POS-UNO-20260921",
      diagnostico: [
        "- Archivos y flujo investigados: `BackEnd/pos/filters.py`.",
        "- Causa raíz o hipótesis: el lookup es exacto.",
        `- Riesgos y compatibilidad: el servicio usa \`Authorization: Bearer ${BEARER}\` para autenticarse.`,
        "- Impactos de sync, migración, Docker o despliegue: ninguno.",
      ].join("\n"),
    });

    const resultado = check(ticket);
    expect(resultado.result).toBe("fail");
    // El detalle ubica el hallazgo y no lo repite.
    expect(resultado.detail).toContain("token-bearer");
    expect(resultado.detail).toContain("línea");
    expect(resultado.detail).not.toContain(BEARER);
  });

  it("pasa cuando el ticket no expone nada", () => {
    const resultado = check(
      renderFixtureTicket({
        id: "BUGFIX-POS-UNO-20260921",
        diagnostico: [
          "- Archivos y flujo investigados: `BackEnd/pos/filters.py`.",
          "- Causa raíz o hipótesis: el lookup es exacto.",
          "- Riesgos y compatibilidad: el token se resuelve por variable de entorno.",
          "- Impactos de sync, migración, Docker o despliegue: ninguno.",
        ].join("\n"),
      }),
    );
    expect(resultado.result).toBe("pass");
    expect(resultado.detail).toBe("ninguno");
  });
});
