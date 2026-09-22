/**
 * La interfaz de Mission Control tiene que **ejecutarse**, no solo compilar.
 *
 * Este test existe por un fallo que llegó al navegador de quien la usa: al
 * reescribir un bloque de la vista del ticket se perdió la definición de una
 * función y la pantalla respondió «No se pudo cargar la vista: Can't find
 * variable: pintarLineaDeTiempo».
 *
 * Ningún test lo vio, y no por falta de cobertura: el módulo vive en un
 * `<script type="module">` dentro de un HTML que ningún test ejecutaba.
 * `node --check` valida la sintaxis, y una variable inexistente no es un error de
 * sintaxis — es un error de ejecución, y solo aparece cuando la rama se recorre.
 *
 * Se ejecuta en un proceso aparte: el módulo arranca la navegación y abre el flujo
 * de eventos al importarse, así que dos importaciones en el mismo proceso
 * compartirían ese estado y el segundo resultado no diría nada del código.
 */
import { spawnSync } from "node:child_process";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const RAIZ = join(import.meta.dirname, "..");
const SCRIPT = join(RAIZ, "scripts", "verificar-interfaz.mjs");
const HTML = join(RAIZ, "packages", "server", "web", "index.html");

describe("la interfaz de Mission Control", () => {
  it("se ejecuta sin errores y pinta la vista del ticket", () => {
    const resultado = spawnSync(process.execPath, [SCRIPT, HTML], {
      encoding: "utf8",
    });

    // La salida se incluye en la aserción: cuando esto falle, el mensaje tiene que
    // decir qué variable o qué pieza falta, no solo que el proceso salió con 1.
    expect(resultado.stdout.trim()).toContain("Interfaz verificada.");
    expect(resultado.status).toBe(0);
  });

  it("el verificador distingue una interfaz rota de una que funciona", () => {
    // Una prueba que solo confirma que el script pasa no dice nada sobre el
    // script: si el verificador no supiera fallar, este test y el anterior
    // pasarían igual sobre una interfaz rota. Se comprueba que **falle** cuando
    // tiene que fallar.
    const verificador = `
      import { readFileSync, writeFileSync } from "node:fs";
      import { ejecutarInterfaz, verificarInterfaz } from ${JSON.stringify(SCRIPT)};
      const html = readFileSync(${JSON.stringify(HTML)}, "utf8");
      const roto = html.replace(
        "async function pintarLineaDeTiempo(id) {",
        "async function pintarLineaDeTiempoRENOMBRADA(id) {",
      );
      if (roto === html) throw new Error("no se pudo fabricar la versión rota");
      writeFileSync("/tmp/valmen-roto.html", roto);
      const r = await ejecutarInterfaz("/tmp/valmen-roto.html");
      const v = verificarInterfaz(r.texto, r.contenido, r.fallos);
      console.log(v.ok ? "DIJO-OK" : "DIJO-FALLO: " + v.detalle);
    `;
    const resultado = spawnSync(
      process.execPath,
      ["--input-type=module", "-e", verificador],
      {
        encoding: "utf8",
      },
    );

    expect(resultado.stdout).toContain("DIJO-FALLO");
    expect(resultado.stdout).toContain("pintarLineaDeTiempo");
  });
});
