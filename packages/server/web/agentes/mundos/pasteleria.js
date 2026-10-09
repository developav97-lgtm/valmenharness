// Mundo «Pastelería» de la vista Agentes (FEATURE-WEB-MUNDO-PASTELERIA-20261008).
//
// Vista lateral del obrador, fiel al prototipo (.valmen/features/vista-agentes/assets/vista-agentes.html,
// mundo pastelería): pared, estante, ventana, letrero «LA COMANDA», el pase con las comandas de la cola,
// ocho puestos, pasteleros con toque, el pastel de cada ticket según su estación y la vitrina de entregados.
// Sin azar y sin reloj propio: el vapor y la lámpara salen de `t`. Los colores de este archivo viven en PALETA.

import { dibujarPersonaje, rasgosDe } from "./sprites.js";

const ANCHO = 960;
const ALTO = 480;
const SUELO_Y = 364;
const FRAUNCES = '"Fraunces", Georgia, serif';
const SANS = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
const ESTACIONES = ["Pedidos", "Recetario", "Báscula", "Mostrador de Anita", "Horno", "Degustación", "Control", "Vitrina"];
const HUMANAS = [3, 5];

/** Cuánto dura la ventanilla de Anita si el estado no trae la ventana de respuesta. */
const VENTANA_POR_DEFECTO_MS = 60_000;

const PALETA = {
  pared: "#f7ecda", // valmen:allow-color paleta del obrador de la pastelería
  moldura: "#e2c6a4", // valmen:allow-color paleta del obrador de la pastelería
  baldosaClara: "#f3dfc6", // valmen:allow-color paleta del obrador de la pastelería
  baldosaOscura: "#e6c7a6", // valmen:allow-color paleta del obrador de la pastelería
  suelo: "#c79864", // valmen:allow-color paleta del obrador de la pastelería
  juntaSuelo: "#a7764c", // valmen:allow-color paleta del obrador de la pastelería
  madera: "#8a5f3b", // valmen:allow-color paleta del obrador de la pastelería
  maderaOscura: "#5b3a21", // valmen:allow-color paleta del obrador de la pastelería
  maderaMedia: "#7a5433", // valmen:allow-color paleta del obrador de la pastelería
  cielo: "#bfe0f3", // valmen:allow-color paleta del obrador de la pastelería
  sol: "#ffe08a", // valmen:allow-color paleta del obrador de la pastelería
  crema: "#f6e7c9", // valmen:allow-color paleta del obrador de la pastelería
  mantel: "#efdcc0", // valmen:allow-color paleta del obrador de la pastelería
  papel: "#fffaf0", // valmen:allow-color paleta del obrador de la pastelería
  rojo: "#b23b3b", // valmen:allow-color paleta del obrador de la pastelería
  frascoA: "#f2d9a6", // valmen:allow-color paleta del obrador de la pastelería
  frascoB: "#e7b27a", // valmen:allow-color paleta del obrador de la pastelería
  frascoC: "#d99a6a", // valmen:allow-color paleta del obrador de la pastelería
  cajaPedidos: "#c9a071", // valmen:allow-color paleta del obrador de la pastelería
  cajaPedidosClara: "#e8d2ae", // valmen:allow-color paleta del obrador de la pastelería
  notaAmarilla: "#ffe8a6", // valmen:allow-color paleta del obrador de la pastelería
  lomoVerde: "#2f4a3a", // valmen:allow-color paleta del obrador de la pastelería
  lomoAzul: "#2b7bd1", // valmen:allow-color paleta del obrador de la pastelería
  lomoVioleta: "#7a5fd1", // valmen:allow-color paleta del obrador de la pastelería
  tiza: "#e7e1cf", // valmen:allow-color paleta del obrador de la pastelería
  anitaMostrador: "#fbf3e6", // valmen:allow-color paleta del obrador de la pastelería
  anitaPiel: "#e0ac69", // valmen:allow-color paleta del obrador de la pastelería
  ojo: "#15171c", // valmen:allow-color paleta del obrador de la pastelería
  lamparaApagada: "#8a7a66", // valmen:allow-color paleta del obrador de la pastelería
  lamparaTenue: "#c98a2e", // valmen:allow-color paleta del obrador de la pastelería
  lamparaViva: "#f2a52a", // valmen:allow-color paleta del obrador de la pastelería
  horno: "#3b3a3f", // valmen:allow-color paleta del obrador de la pastelería
  hornoBorde: "#55545b", // valmen:allow-color paleta del obrador de la pastelería
  hornoBoca: "#1a1a1d", // valmen:allow-color paleta del obrador de la pastelería
  brasa: "#ff8c28", // valmen:allow-color paleta del obrador de la pastelería
  llama: "#ffb13b", // valmen:allow-color paleta del obrador de la pastelería
  metal: "#9a9aa3", // valmen:allow-color paleta del obrador de la pastelería
  metalClaro: "#c9c9d1", // valmen:allow-color paleta del obrador de la pastelería
  metalOscuro: "#5b5b63", // valmen:allow-color paleta del obrador de la pastelería
  vitrinaVidrio: "#dfe9f3", // valmen:allow-color paleta del obrador de la pastelería
  vidrioVitrina: "#bedcf0", // valmen:allow-color paleta del obrador de la pastelería
  brillo: "#ffffff", // valmen:allow-color paleta del obrador de la pastelería
  luzControl: "#ffeba0", // valmen:allow-color paleta del obrador de la pastelería
  cajaVitrina: "#f1dcc3", // valmen:allow-color paleta del obrador de la pastelería
  glaseado: "#d98a9e", // valmen:allow-color paleta del obrador de la pastelería
  glaseadoClaro: "#f6c9d6", // valmen:allow-color paleta del obrador de la pastelería
  cereza: "#c62828", // valmen:allow-color paleta del obrador de la pastelería
  oro: "#e8b84a", // valmen:allow-color paleta del obrador de la pastelería
  bandeja: "#8e949c", // valmen:allow-color paleta del obrador de la pastelería
  bandejaClara: "#b9bec5", // valmen:allow-color paleta del obrador de la pastelería
  bandejaAzul: "#9fb4c7", // valmen:allow-color paleta del obrador de la pastelería
  masa: "#f3e6c8", // valmen:allow-color paleta del obrador de la pastelería
  masaLarga: "#f0dcb0", // valmen:allow-color paleta del obrador de la pastelería
  masaCruda: "#f3e3bf", // valmen:allow-color paleta del obrador de la pastelería
  tabla: "#d9b98f", // valmen:allow-color paleta del obrador de la pastelería
  receta: "#fff7dc", // valmen:allow-color paleta del obrador de la pastelería
  receta2: "#999999", // valmen:allow-color paleta del obrador de la pastelería
  bizcocho: "#b5733e", // valmen:allow-color paleta del obrador de la pastelería
  bizcochoClaro: "#c98a4e", // valmen:allow-color paleta del obrador de la pastelería
  vela: "#fbfbf7", // valmen:allow-color paleta del obrador de la pastelería
  delantalBlanco: "#fbfbf7", // valmen:allow-color paleta del obrador de la pastelería
  delantalCrema: "#f3e3bf", // valmen:allow-color paleta del obrador de la pastelería
  delantalGris: "#d9d4c7", // valmen:allow-color paleta del obrador de la pastelería
  delantalPrincipal: "#1d2129", // valmen:allow-color paleta del obrador de la pastelería
  camisaPrincipal: "#2a2f3a", // valmen:allow-color paleta del obrador de la pastelería
  peloPrincipal: "#1b1b1b", // valmen:allow-color paleta del obrador de la pastelería
  pielPrincipal: "#e0ac69", // valmen:allow-color paleta del obrador de la pastelería
  camisaGris: "#8a8d93", // valmen:allow-color paleta del obrador de la pastelería
};

// ── Lógica pura: se prueba sin lienzo ─────────────────────────────────────

/** El pase está a la izquierda, a la altura del suelo del obrador. */
export const PUESTO_PRINCIPAL = { x: 64, y: SUELO_Y };

/** La etapa del pastel de un agente: la estación en que está. */
export function etapaDelPastel(agente) {
  return agente.estacion;
}

/** Las comandas pinchadas en el pase: una por identificador de la cola, dentro del ancho del pase (16 a 112). */
export function comandasDelPase(cola) {
  return (cola ?? []).slice(0, 12).map((id, i) => ({ id, x: 18 + (i % 6) * 15, y: 336 - 14 * Math.floor(i / 6) }));
}

/** Los seis últimos entregados, los que caben en la vitrina. */
export function vitrina(entregados) {
  return (entregados ?? []).slice(-6);
}

/** El horno está encendido si un agente trabaja, quieto, en la estación del horno. */
export function hornoEncendido(agentes) {
  return (agentes ?? []).some((a) => a.estado === "trabajando" && a.moviendo !== true && a.estacion === 4);
}

const preguntaAbierta = (a) => {
  const p = a.fila?.pregunta;
  return p !== null && p !== undefined && (p.respondidaEn === null || p.respondidaEn === undefined);
};

/**
 * Lo que Anita muestra: `lampara` encendida con una pregunta abierta en su mostrador (estación 3) y
 * `ventanilla` con ella asomada si alguien respondió hace menos de la ventana.
 */
export function senalDeAnita(agentes, ahoraMs, ventanaMs = VENTANA_POR_DEFECTO_MS) {
  const lista = agentes ?? [];
  const lampara = lista.some((a) => a.estacion === 3 && preguntaAbierta(a));
  const ventanilla = lista.some((a) => {
    const respondida = a.fila?.pregunta?.respondidaEn;
    if (respondida === null || respondida === undefined) return false;
    const t = Date.parse(respondida);
    return !Number.isNaN(t) && ahoraMs - t >= 0 && ahoraMs - t <= ventanaMs;
  });
  return { lampara, ventanilla };
}

/** Un pastelero quieto con una pregunta para una persona lleva el «?». */
export function llevaPregunta(agente) {
  return agente.estado === "esperando" && agente.moviendo !== true;
}

/** Delantal, camisa y toque por estado visual. */
export function aparienciaDe(agente) {
  const rasgos = rasgosDe(agente.carril ?? 0);
  switch (agente.estado) {
    case "principal":
      return { delantal: PALETA.delantalPrincipal, camisa: PALETA.camisaPrincipal, sombrero: "toque", sombreroColor: PALETA.camisaPrincipal, pelo: PALETA.peloPrincipal, piel: PALETA.pielPrincipal };
    case "esperando":
      return { delantal: PALETA.delantalCrema, camisa: rasgos.color, sombrero: "toque", sombreroColor: PALETA.delantalCrema };
    case "termino":
      return { delantal: PALETA.delantalGris, camisa: PALETA.camisaGris, sombrero: "toque", sombreroColor: PALETA.delantalGris };
    default:
      return { delantal: PALETA.delantalBlanco, camisa: rasgos.color, sombrero: "toque" };
  }
}

/** Posición del pastelero: la estación fija la x y el carril lo desplaza para no pisarse. */
function posicion(indice, carril) {
  return { x: 180 + indice * 101 + ((carril % 3) - 1) * 22, y: SUELO_Y };
}

// ── Dibujo ─────────────────────────────────────────────────────────────────

function pincel(ctx) {
  const R = (x, y, w, h, c, alfa = 1) => {
    ctx.globalAlpha = alfa;
    ctx.fillStyle = c;
    ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
    ctx.globalAlpha = 1;
  };
  const C = (x, y, r, c, alfa = 1) => {
    ctx.globalAlpha = alfa;
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  };
  const T = (texto, x, y, o = {}) => {
    ctx.font = `${o.peso ?? ""} ${o.tam ?? 12}px ${o.fuente ?? SANS}`.trim();
    ctx.fillStyle = o.color ?? PALETA.maderaOscura;
    ctx.textAlign = o.alinear ?? "center";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(texto, x, y);
  };
  return { R, C, T };
}

function pastel(R, x, b, e) {
  if (e === 0) { R(x - 14, b - 12, 28, 12, PALETA.bandejaAzul); R(x - 10, b - 16, 20, 6, PALETA.masa); return; }
  if (e === 1) { R(x - 16, b - 4, 32, 4, PALETA.tabla); R(x - 9, b - 16, 18, 12, PALETA.masaLarga); return; }
  R(x - 16, b - 14, 32, 14, PALETA.bandeja); R(x - 14, b - 12, 28, 2, PALETA.bandejaClara);
  if (e === 2) { R(x - 13, b - 11, 26, 8, PALETA.masaCruda); return; }
  if (e === 3) {
    R(x - 13, b - 11, 26, 8, PALETA.masaCruda); R(x + 8, b - 26, 14, 14, PALETA.receta);
    R(x + 10, b - 22, 10, 1, PALETA.receta2); R(x + 10, b - 19, 8, 1, PALETA.receta2); R(x + 10, b - 16, 9, 1, PALETA.receta2);
    return;
  }
  R(x - 13, b - 14, 26, 10, PALETA.bizcocho); R(x - 11, b - 16, 22, 3, PALETA.bizcochoClaro);
  if (e === 4) return;
  R(x - 12, b - 19, 24, 5, PALETA.glaseadoClaro);
  if (e === 5) return;
  R(x - 8, b - 22, 3, 3, PALETA.cereza); R(x + 1, b - 23, 3, 3, PALETA.cereza); R(x + 7, b - 21, 3, 3, PALETA.cereza);
  R(x - 1, b - 31, 2, 9, PALETA.vela); R(x - 2, b - 34, 4, 4, PALETA.llama);
  if (e === 6) return;
  R(x - 18, b - 30, 36, 30, PALETA.cajaVitrina); R(x - 18, b - 30, 36, 4, PALETA.glaseado);
  R(x - 2, b - 30, 4, 30, PALETA.glaseado); R(x - 18, b - 16, 36, 3, PALETA.glaseado);
}

/** Dibuja el mundo; `miniatura` lo reduce al tamaño del lienzo y omite los rótulos finos. */
function dibujar(estado, t = 0) {
  const { ctx, escena, miniatura } = estado;
  const cola = estado.cola ?? [];
  const entregados = estado.entregados ?? [];
  const ahoraMs = estado.ahoraMs ?? 0;
  const ventanaMs = estado.ventanaRespuestaMs ?? VENTANA_POR_DEFECTO_MS;
  const agentes = [...(escena?.agentes?.values?.() ?? [])];
  const { R, C, T } = pincel(ctx);
  const senal = senalDeAnita(agentes, ahoraMs, ventanaMs);
  const horno = hornoEncendido(agentes);
  const k = ctx.canvas.width / ANCHO;
  ctx.save();
  ctx.scale(k, k);

  // Pared, moldura, suelo de baldosas y tablones.
  R(0, 0, ANCHO, 296, PALETA.pared); R(0, 140, ANCHO, 3, PALETA.moldura);
  for (let x = 0; x < ANCHO; x += 20) R(x, 296, 20, 20, ((x / 20) | 0) % 2 ? PALETA.baldosaOscura : PALETA.baldosaClara);
  R(0, 316, ANCHO, ALTO - 316, PALETA.suelo);
  for (let y = 316; y < ALTO; y += 22) {
    R(0, y, ANCHO, 2, PALETA.juntaSuelo);
    for (let x = (((y / 22) | 0) % 2) * 70; x < ANCHO; x += 140) R(x, y, 2, 22, PALETA.juntaSuelo);
  }
  // Ventana, letrero y estante.
  R(700, 38, 150, 96, PALETA.madera); R(706, 44, 138, 84, PALETA.cielo); R(773, 44, 4, 84, PALETA.madera); R(706, 84, 138, 4, PALETA.madera); C(828, 66, 10, PALETA.sol);
  R(392, 22, 176, 48, PALETA.maderaOscura); R(396, 26, 168, 40, PALETA.maderaMedia);
  if (!miniatura) T("LA COMANDA", 480, 54, { fuente: FRAUNCES, tam: 22, color: PALETA.crema, peso: "700" });
  R(130, 112, 330, 8, PALETA.madera);
  for (let i = 0; i < 7; i++) {
    const x = 150 + i * 44;
    R(x, 82, 22, 30, [PALETA.frascoA, PALETA.frascoB, PALETA.frascoC][i % 3]); R(x, 78, 22, 6, PALETA.rojo);
  }
  R(16, 146, 96, 26, PALETA.maderaOscura);
  if (!miniatura) {
    T("EL PASE", 64, 164, { fuente: FRAUNCES, tam: 13, color: PALETA.crema, peso: "600" });
    T("sesión principal", 64, 184, { tam: 10, color: PALETA.maderaMedia });
  }

  // Los ocho puestos de la pared.
  for (let i = 0; i < 8; i++) {
    const x = 180 + i * 101;
    const quieto = agentes.filter((a) => a.estacion === i && a.moviendo !== true);
    const trabajando = quieto.some((a) => a.estado === "trabajando");
    if (!miniatura) T(ESTACIONES[i], x, 286, { fuente: FRAUNCES, tam: 12, color: HUMANAS.includes(i) ? PALETA.rojo : PALETA.maderaMedia, peso: "600" });
    switch (i) {
      case 0:
        R(x - 32, 168, 64, 52, PALETA.cajaPedidos); R(x - 28, 172, 56, 44, PALETA.cajaPedidosClara); R(x - 22, 178, 16, 20, PALETA.papel); R(x - 2, 182, 16, 20, PALETA.papel);
        R(x + 14, 176, 10, 14, PALETA.notaAmarilla); R(x - 16, 176, 3, 3, PALETA.rojo); R(x + 4, 180, 3, 3, PALETA.rojo);
        break;
      case 1:
        R(x - 30, 196, 60, 6, PALETA.madera);
        [PALETA.rojo, PALETA.lomoVerde, PALETA.lomoAzul, PALETA.frascoC, PALETA.lomoVioleta].forEach((c, n) => R(x - 26 + n * 11, 170, 9, 26, c));
        break;
      case 2:
        R(x - 34, 160, 68, 56, PALETA.maderaOscura); R(x - 30, 164, 60, 48, PALETA.lomoVerde);
        R(x - 22, 174, 40, 2, PALETA.tiza); R(x - 22, 184, 28, 2, PALETA.tiza); R(x - 22, 194, 36, 2, PALETA.tiza); R(x - 22, 204, 20, 2, PALETA.tiza);
        break;
      case 3: {
        R(x - 38, 150, 76, 112, PALETA.madera); R(x - 32, 156, 64, 100, PALETA.anitaMostrador); R(x - 32, 156, 18, 100, PALETA.rojo); R(x + 14, 156, 18, 100, PALETA.rojo);
        R(x - 24, 132, 48, 16, PALETA.maderaOscura);
        if (!miniatura) T("ANITA", x, 144, { tam: 10, color: PALETA.crema, peso: "600" });
        if (senal.ventanilla) {
          R(x - 8, 196, 16, 18, PALETA.anitaPiel); R(x - 9, 192, 18, 6, PALETA.maderaOscura); R(x - 4, 202, 2, 2, PALETA.ojo); R(x + 2, 202, 2, 2, PALETA.ojo); R(x - 12, 214, 24, 30, PALETA.lomoVerde);
        }
        const parpadeo = senal.lampara && Math.floor(t * 3) % 2 === 0;
        if (senal.lampara) C(x, 262, 12, PALETA.lamparaViva, 0.25);
        C(x, 262, 6, parpadeo ? PALETA.lamparaViva : senal.lampara ? PALETA.lamparaTenue : PALETA.lamparaApagada);
        break;
      }
      case 4:
        R(x - 42, 150, 84, 122, PALETA.horno); R(x - 36, 156, 72, 10, PALETA.hornoBorde); R(x - 30, 176, 60, 46, PALETA.hornoBoca);
        if (horno) {
          R(x - 28, 178, 56, 42, PALETA.brasa, 0.45 + 0.35 * Math.sin(t * 6)); R(x - 20, 200, 40, 16, PALETA.llama);
          if (!miniatura) {
            for (let n = 0; n < 3; n++) {
              const fase = (t * 0.5 + n / 3) % 1;
              C(x - 14 + n * 14 + Math.sin(t * 2 + n) * 4, 150 - fase * 44, 3 + fase * 5, PALETA.brillo, (1 - fase) * 0.3);
            }
          }
        }
        R(x - 30, 228, 60, 6, PALETA.metal);
        for (let n = 0; n < 3; n++) C(x - 16 + n * 16, 250, 4, PALETA.metalClaro);
        break;
      case 5:
        R(x - 24, 160, 48, 38, PALETA.madera); R(x - 20, 164, 40, 30, PALETA.vitrinaVidrio); R(x - 8, 178, 16, 8, PALETA.bizcocho); R(x - 8, 175, 16, 3, PALETA.glaseadoClaro);
        break;
      case 6:
        R(x + 20, 150, 4, 60, PALETA.metalOscuro); R(x - 10, 206, 40, 8, PALETA.metalOscuro); R(x - 8, 214, 36, 16, PALETA.luzControl, trabajando ? 0.6 : 0.25);
        break;
      case 7:
        R(x - 40, 150, 80, 112, PALETA.vidrioVitrina, 0.25);
        for (const y of [172, 206, 240]) R(x - 40, y, 80, 6, PALETA.madera);
        vitrina(entregados).forEach((_, n) => {
          const cx = x - 22 + (n % 3) * 22;
          const cy = [172, 206, 240][Math.floor(n / 3)];
          R(cx - 8, cy - 14, 16, 14, PALETA.cajaVitrina); R(cx - 8, cy - 14, 16, 2, PALETA.glaseado); R(cx - 1, cy - 14, 2, 14, PALETA.glaseado);
        });
        R(x - 36, 150, 3, 112, PALETA.brillo, 0.6);
        break;
      default:
        break;
    }
  }

  // Pasteleros: con el pastel en la mano al caminar, el «?» si esperan a una persona.
  for (const a of agentes) {
    dibujarPersonaje(ctx, a, a.x, a.y, aparienciaDe(a));
    const llevaTicket = a.principal !== true && a.fila?.ticket !== null && a.fila?.ticket !== undefined;
    if (llevaTicket && a.moviendo) pastel(R, a.x + 16, a.y - 24, etapaDelPastel(a));
    if (!miniatura && llevaPregunta(a)) T("?", a.x + 16, a.y - 44, { fuente: FRAUNCES, tam: 16, color: PALETA.rojo, peso: "700" });
  }

  // Mostrador largo, el pase con sus comandas y los utensilios de cada puesto.
  R(128, 352, 816, 48, PALETA.madera); R(124, 348, 824, 8, PALETA.mantel);
  for (let x = 140; x < 944; x += 40) R(x, 364, 2, 30, PALETA.maderaMedia);
  R(16, 352, 96, 48, PALETA.madera); R(12, 348, 104, 8, PALETA.mantel);
  for (const c of comandasDelPase(cola)) { R(c.x, c.y, 12, 12, PALETA.papel); R(c.x + 2, c.y + 3, 8, 1, PALETA.receta2); R(c.x + 2, c.y + 6, 6, 1, PALETA.receta2); }
  for (let i = 0; i < 8; i++) {
    const x = 180 + i * 101;
    if (i === 0 || i === 3) { R(x + 24, 338, 14, 8, PALETA.oro); R(x + 29, 334, 4, 4, PALETA.oro); }
    if (i === 1) { R(x - 20, 340, 40, 8, PALETA.papel); R(x - 1, 340, 2, 8, PALETA.madera); }
    if (i === 2) { R(x - 18, 342, 36, 6, PALETA.metalOscuro); R(x - 1, 326, 2, 16, PALETA.metalOscuro); R(x - 16, 324, 12, 3, PALETA.metal); R(x + 4, 324, 12, 3, PALETA.metal); }
    if (i === 5) { R(x - 16, 342, 32, 6, PALETA.papel); R(x + 20, 336, 8, 10, PALETA.vitrinaVidrio); R(x - 14, 404, 28, 8, PALETA.madera); R(x - 12, 412, 4, 20, PALETA.madera); R(x + 8, 412, 4, 20, PALETA.madera); }
    if (i === 6) {
      ctx.strokeStyle = PALETA.metalOscuro; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x - 6, 336, 8, 0, 7); ctx.stroke?.(); R(x + 1, 340, 14, 3, PALETA.metalOscuro);
    }
  }
  // El pastel de cada ticket sobre el mostrador mientras su pastelero está quieto.
  for (const a of agentes) {
    const llevaTicket = a.principal !== true && a.fila?.ticket !== null && a.fila?.ticket !== undefined;
    if (llevaTicket && a.moviendo !== true && a.estado !== "termino") pastel(R, a.x - 10, 348, etapaDelPastel(a));
  }
  ctx.restore();
}

export const mundo = {
  id: "pasteleria",
  nombre: "Pastelería",
  lema: "Cada ticket es un pastel que recorre el obrador hasta la vitrina.",
  pregunta: "timbre en el mostrador de Anita",
  estaciones: ESTACIONES,
  puestoPrincipal: PUESTO_PRINCIPAL,
  paneles: { agentes: "Comandas", cola: "En espera", entregados: "Vitrina" },
  posicion,
  dibujar,
};
