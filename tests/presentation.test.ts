/**
 * El chequeo de colores fijos.
 *
 * Es el mismo contrato que el detector de secretos, con el mismo sesgo: lo que
 * se afirma con más cuidado es lo que **no** tiene que marcar. Un aviso falso
 * en una pantalla que se toca todas las semanas enseña a ignorar el chequeo, y
 * entonces el color que sí rompía el modo oscuro pasa igual.
 *
 * Las tres excepciones que se prueban acá no son concesiones: son las formas en
 * que un color fijo **no** es un problema —el respaldo de una variable del tema,
 * la sombra, el negro translúcido— y son las que hacen que el informe se pueda
 * leer entero.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  isUiFile,
  renderColorReport,
  scanFixedColors,
  scanPendingColors,
} from "../packages/engine/src/presentation.js";

/** Los valores encontrados en un texto, como `forma:valor`. */
const hallados = (texto: string): string[] =>
  scanFixedColors(texto).map((hallazgo) => `${hallazgo.kind}=${hallazgo.value}`);

describe("lo que encuentra", () => {
  it("reconoce el hexadecimal que alguien escribió a mano", () => {
    expect(hallados(".modal { background: #fff; }")).toEqual(["hex=#fff"]);
    expect(hallados(".modal { background: #FFFFFF; }")).toEqual(["hex=#FFFFFF"]);
    expect(hallados('style="color: #0d6efd"')).toEqual(["hex=#0d6efd"]);
    // Con canal alfa, que es la forma en que aparece en un tema a medio hacer.
    expect(hallados("fill: #FFFFFF80;")).toEqual(["hex=#FFFFFF80"]);
  });

  it("reconoce las funciones de color con números", () => {
    expect(hallados(".t { color: rgb(9, 132, 227); }")).toEqual([
      "funcion=rgb(9, 132, 227)",
    ]);
    expect(hallados(".t { color: hsl(210, 80%, 46%); }")).toEqual([
      "funcion=hsl(210, 80%, 46%)",
    ]);
  });

  it("reconoce el blanco y el negro escritos como palabra", () => {
    expect(hallados(".modal { background: white; }")).toEqual(["nombre=white"]);
    expect(hallados(".t { border: 1px solid black; }")).toEqual(["nombre=black"]);
  });

  it("reconoce las clases de paleta, que son el mismo color fijo con otro nombre", () => {
    expect(hallados('<div class="bg-white text-gray-500">')).toEqual([
      "paleta=bg-white",
      "paleta=text-gray-500",
    ]);
    expect(hallados('<span class="border-slate-200">')).toEqual([
      "paleta=border-slate-200",
    ]);
  });
});

describe("lo que no marca, y por qué", () => {
  it("no marca una propiedad que empieza como un color", () => {
    // `white-space` no es un color, y sin el cuidado de no cortar la palabra el
    // aviso aparecería en cada archivo que use `white-space: pre-wrap`.
    expect(hallados(".t { white-space: pre-wrap; }")).toEqual([]);
    expect(hallados(".t { background: whitesmoke; }")).toEqual([]);
    expect(hallados(".t { border-color: blackish; }")).toEqual([]);
  });

  it("no marca la definición de una variable del tema", () => {
    // `--fondo: #0f1115` es el tema escribiéndose, y es el sitio donde un color
    // literal está bien. Sin esta excepción el chequeo marcaba las dieciocho
    // líneas del tema de la propia interfaz del harness: marcaba la definición de
    // la solución, que es la forma más rápida de que alguien lo apague.
    expect(hallados(":root { --fondo: #0f1115; }")).toEqual([]);
    expect(hallados("  --acento-suave: rgba(91, 141, 255, 0.14);")).toEqual([]);
    expect(hallados("  --halo: 0 0 0 3px rgba(70, 185, 90, 0.14);")).toEqual([]);
    // Pero usar un color crudo en una regla sigue siendo un hallazgo.
    expect(hallados(".tarjeta { background: #0f1115; }")).toEqual(["hex=#0f1115"]);
  });

  it("no marca el respaldo de una variable del tema", () => {
    // `var(--principal, #0984E3)` es la forma correcta de escribir un valor por
    // defecto: marcarla sería marcar el tema funcionando.
    expect(hallados(".t { color: var(--principal-color, #0984E3); }")).toEqual([]);
    expect(hallados(".t { background: rgb(var(--fondo-rgb)); }")).toEqual([]);
  });

  it("no marca las sombras ni el negro translúcido", () => {
    // Una sombra es profundidad, no paleta: funciona igual en claro y en oscuro,
    // y marcarla convertiría el informe en una lista de todo lo que tiene sombra.
    expect(hallados(".t { box-shadow: 0 4px 8px rgba(0, 0, 0, 0.15); }")).toEqual([]);
    expect(hallados(".t { text-shadow: 1px 1px 2px hsla(0, 0%, 0%, 0.4); }")).toEqual([]);
    expect(hallados(".velo { background: rgba(0, 0, 0, .45); }")).toEqual([]);
  });

  it("sí marca el blanco translúcido, que es la tarjeta que rompe el modo oscuro", () => {
    expect(hallados(".tarjeta { background: rgba(255, 255, 255, 0.9); }")).toEqual([
      "funcion=rgba(255, 255, 255, 0.9)",
    ]);
  });

  it("no marca un nombre de color en una lista de clases", () => {
    // `class="kpi gray"` no es un color: es el nombre de una clase. En una
    // declaración el color viene detrás de `:`; en una lista de clases, detrás
    // de una palabra. Se paga con un `<div class="gray">` que no se detecte.
    expect(hallados('<div class="kpi gray">')).toEqual([]);
    expect(hallados('<div class="blue">')).toEqual([]);
    expect(hallados('<div style="background: white">')).toEqual(["nombre=white"]);
  });

  it("no marca un hexadecimal que es un número, ni un selector", () => {
    expect(hallados("Resuelve el ticket #123456 del registro.")).toEqual([]);
    expect(hallados("#abc { color: red; }")).toEqual(["nombre=red"]);
    expect(hallados("url(#gradiente-1)")).toEqual([]);
  });

  it("no marca lo que está comentado: no está en vigor", () => {
    expect(hallados("/* .t { color: #123456; } */")).toEqual([]);
    expect(hallados('<!-- <div style="background: #fff"> -->')).toEqual([]);
  });

  it("perdona la línea marcada, con su motivo", () => {
    expect(
      hallados(".marca { color: #FF0000; } /* valmen:allow-color: color de marca */"),
    ).toEqual([]);
  });

  it("no marca los archivos que no son de interfaz", () => {
    expect(isUiFile("src/app.component.html")).toBe(true);
    expect(isUiFile("FrontEnd/src/estilos.scss")).toBe(true);
    expect(isUiFile("src/componente.tsx")).toBe(true);
    expect(isUiFile("BackEnd/views.py")).toBe(false);
    expect(isUiFile("src/servicio.ts")).toBe(false);
    expect(isUiFile("README.md")).toBe(false);
  });
});

describe("los cambios pendientes", () => {
  let repo: string;

  beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), "valmen-colores-"));
    mkdirSync(join(repo, "src"), { recursive: true });
    const git = (...args: string[]): void => {
      execFileSync("git", args, { cwd: repo, stdio: "ignore" });
    };
    git("init", "-q");
    git("config", "user.email", "pruebas@valmen");
    git("config", "user.name", "Pruebas");
    writeFileSync(
      join(repo, "src", "viejo.css"),
      ".viejo { color: #0891b2; }\n.otro { background: white; }\n",
      "utf8",
    );
    git("add", "-A");
    git("commit", "-qm", "base");
  });

  afterEach(() => {
    rmSync(repo, { recursive: true, force: true });
  });

  it("mira solo las líneas agregadas, no las que ya estaban", () => {
    // El archivo ya tenía dos colores fijos. Un chequeo que los reporte convierte
    // cualquier cambio de una línea en una discusión sobre el archivo entero, y
    // el trabajo se detiene por algo que no es de quien está trabajando.
    writeFileSync(
      join(repo, "src", "viejo.css"),
      ".viejo { color: #0891b2; }\n.otro { background: white; }\n" +
        ".nuevo { border: 1px solid red; }\n",
      "utf8",
    );
    const revision = scanPendingColors(repo);
    expect(revision.findings.map((h) => `${h.path}:${h.line}=${h.value}`)).toEqual([
      "src/viejo.css:3=red",
    ]);
  });

  it("lee un archivo nuevo entero, que es donde más aparece", () => {
    writeFileSync(
      join(repo, "src", "nuevo.html"),
      '<div style="background: #fff">hola</div>\n',
      "utf8",
    );
    const revision = scanPendingColors(repo);
    expect(revision.findings.map((h) => h.value)).toEqual(["#fff"]);
    expect(revision.scanned).toBe(1);
  });

  it("ignora los archivos que no son de interfaz aunque tengan colores", () => {
    writeFileSync(join(repo, "src", "datos.py"), "COLOR = '#ffffff'\n", "utf8");
    const revision = scanPendingColors(repo);
    expect(revision.findings).toEqual([]);
    expect(revision.scanned).toBe(0);
  });

  it("el informe dice qué hacer con cada uno, y no bloquea", () => {
    writeFileSync(join(repo, "src", "nuevo.css"), ".t { color: #123456; }\n", "utf8");
    const informe = renderColorReport(scanPendingColors(repo));
    expect(informe).toContain("No bloquea");
    expect(informe).toContain("src/nuevo.css");
    expect(informe).toContain("#123456");
    expect(informe).toContain("valmen:allow-color");
    expect(informe).toContain(".valmen/rules/estandares-presentacion.md");
  });

  it("sin hallazgos lo dice con fundamento, no con un silencio", () => {
    writeFileSync(join(repo, "src", "limpio.css"), ".t { color: var(--texto); }\n", "utf8");
    const informe = renderColorReport(scanPendingColors(repo));
    expect(informe).toContain("nada que avisar");
    expect(informe).toContain("1 archivo(s)");
    expect(informe).toContain("modo oscuro");
  });

  it("resume una línea que trae veinte colores en vez de escribir los veinte", () => {
    // Un CSS minificado entra como una sola línea. Volcar sus veinte colores no
    // ayuda a nadie: lo que hace falta saber es dónde está.
    const minificado = Array.from(
      { length: 20 },
      (_, indice) => `.c${indice}{color:#1a2b3c}`,
    ).join("");
    writeFileSync(join(repo, "src", "min.css"), `${minificado}\n`, "utf8");
    const informe = renderColorReport(scanPendingColors(repo));
    expect(informe).toContain("(+16 más)");
  });
});
