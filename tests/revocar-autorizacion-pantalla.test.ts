/**
 * El botón «Revocar» de las autorizaciones de Mission Control.
 *
 * Se ejecuta la interfaz de verdad con respuestas simuladas. El botón pedía el nombre y la frase
 * con `prompt()`, que el navegador integrado no admite: devolvía `null` y no pasaba nada. Ahora
 * abre los campos en la propia fila y manda la revocación al servidor.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { checkConfig } from "../packages/server/src/config.js";
import { buscarNodos, disparar, ejecutarInterfaz } from "../scripts/verificar-interfaz.mjs";
import type { NodoFalso } from "../scripts/verificar-interfaz.mjs";

const RAIZ = join(import.meta.dirname, "..");
const HTML = join(RAIZ, "packages", "server", "web", "index.html");

interface Llamada {
  readonly ruta: string;
  readonly metodo: string;
  readonly cuerpo: Record<string, unknown> | null;
}

const AUTORIZACION = {
  id: "APA-20261008-d04177",
  types: ["BUGFIX", "FEATURE"],
  modules: ["todos"],
  maxRisk: "normal",
  impacts: [],
  stages: ["analysis", "plan"],
  mode: "on-approve",
  dailyQuota: 1,
  validUntil: "2026-11-07T21:54:10.811Z",
  actor: "juan andrade",
  quote: "aprobacion de planes y analisis agentico",
  estado: "vigente",
};
const DE_QA = { ...AUTORIZACION, id: "QAA-20261008-a5fb57" };

async function pintar() {
  const llamadas: Llamada[] = [];
  const vista = await ejecutarInterfaz(HTML, {
    hash: "#/configuracion",
    respuesta: (ruta, init) => {
      const url = new URL(ruta, "http://localhost");
      const cuerpo = init?.body === undefined ? null : (JSON.parse(String(init.body)) as Record<string, unknown>);
      llamadas.push({ ruta: url.pathname, metodo: init?.method ?? "GET", cuerpo });
      if (url.pathname === "/api/health") return { root: RAIZ };
      if (url.pathname === "/api/config/check") {
        const texto = JSON.parse(String(init?.body ?? "{}")) as { text: string };
        return { config: checkConfig(RAIZ, texto.text), impact: null };
      }
      if (url.pathname === "/api/config") {
        return { config: { ...checkConfig(RAIZ, "name: Demo\n"), text: "name: Demo\n", diff: [] }, impact: null };
      }
      if (url.pathname === "/api/qa/authorizations" && (init?.method ?? "GET") === "GET") return { authorizations: [DE_QA] };
      if (url.pathname === "/api/approval/authorizations" && (init?.method ?? "GET") === "GET") {
        return { authorizations: [AUTORIZACION] };
      }
      if (url.pathname.endsWith("/revoke")) return { ok: true };
      return {};
    },
  });
  return { vista, llamadas };
}

type Vista = { contenido: NodoFalso | undefined };
const nodos = (v: Vista, predicado: (n: NodoFalso) => boolean): NodoFalso[] => buscarNodos(v.contenido, predicado);
const textoDe = (n: NodoFalso): string => String(n._texto);
const botones = (v: Vista, texto: string): NodoFalso[] => nodos(v, (n) => n.tagName === "BUTTON" && textoDe(n) === texto);
const campos = (v: Vista): NodoFalso[] => nodos(v, (n) => n.tagName === "INPUT" && String(n.placeholder ?? "").startsWith("Tu "));

describe("el botón Revocar de las autorizaciones", () => {
  it("no usa prompt() para pedir el nombre ni la frase", () => {
    const texto = readFileSync(HTML, "utf8");
    expect(texto).not.toContain('prompt("¿Quién revoca');
    expect(texto).not.toContain('prompt("Escribe tu frase literal de revocación');
  });

  it("al pulsarlo abre el nombre y la frase en la fila, sin llamar al servidor todavía", async () => {
    const { vista, llamadas } = await pintar();
    expect(vista.fallos).toEqual([]);
    expect(botones(vista, "Revocar")).toHaveLength(2);
    expect(campos(vista)).toHaveLength(0);
    await disparar(botones(vista, "Revocar")[1] as NodoFalso, "click");
    expect(campos(vista)).toHaveLength(2);
    expect(botones(vista, "Confirmar revocación")).toHaveLength(1);
    expect(llamadas.filter((l) => l.metodo === "POST")).toEqual([]);
  });

  it("confirmar con nombre y frase manda la revocación de la autorización de aprobación", async () => {
    const { vista, llamadas } = await pintar();
    await disparar(botones(vista, "Revocar")[1] as NodoFalso, "click");
    const [actor, frase] = campos(vista) as [NodoFalso, NodoFalso];
    actor.value = "Juan Andrade";
    frase.value = "reemplazada por la de cupo 50";
    await disparar(botones(vista, "Confirmar revocación")[0] as NodoFalso, "click");
    expect(llamadas.filter((l) => l.metodo === "POST")).toEqual([
      {
        ruta: "/api/approval/authorizations/revoke",
        metodo: "POST",
        cuerpo: { id: AUTORIZACION.id, actor: "Juan Andrade", quote: "reemplazada por la de cupo 50" },
      },
    ]);
  });

  it("control: la de QA por agente revoca por su propia ruta", async () => {
    const { vista, llamadas } = await pintar();
    await disparar(botones(vista, "Revocar")[0] as NodoFalso, "click");
    const [actor, frase] = campos(vista) as [NodoFalso, NodoFalso];
    actor.value = "Juan Andrade";
    frase.value = "apago la QA por agente";
    await disparar(botones(vista, "Confirmar revocación")[0] as NodoFalso, "click");
    const posts = llamadas.filter((l) => l.metodo === "POST");
    expect(posts).toHaveLength(1);
    expect(posts[0]).toMatchObject({ ruta: "/api/qa/authorizations/revoke", cuerpo: { id: DE_QA.id } });
  });

  it("control: sin nombre o sin frase no manda nada y lo dice", async () => {
    const { vista, llamadas } = await pintar();
    await disparar(botones(vista, "Revocar")[1] as NodoFalso, "click");
    const [actor] = campos(vista) as [NodoFalso, NodoFalso];
    actor.value = "Juan Andrade";
    await disparar(botones(vista, "Confirmar revocación")[0] as NodoFalso, "click");
    expect(llamadas.filter((l) => l.metodo === "POST")).toEqual([]);
    const avisos = nodos(vista, (n) => String(n.className ?? "").includes("qa-mensaje mal")).map(textoDe);
    expect(avisos).toContain("Escribe tu nombre y tu frase literal para revocar.");
  });

  it("control: Cancelar no revoca nada", async () => {
    // El DOM de la prueba no quita nodos; que los campos desaparezcan se comprueba en el navegador.
    const { vista, llamadas } = await pintar();
    await disparar(botones(vista, "Revocar")[1] as NodoFalso, "click");
    await disparar(botones(vista, "Cancelar")[0] as NodoFalso, "click");
    expect(llamadas.filter((l) => l.metodo === "POST")).toEqual([]);
  });
});
