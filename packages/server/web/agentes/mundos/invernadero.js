// Mundo «Invernadero» de la vista Agentes (FEATURE-WEB-MUNDO-INVERNADERO-20261008).
//
// El cultivo del prototipo (.valmen/features/vista-agentes/assets/vista-agentes.html, mundo invernadero):
// vidrio con montantes y sol, estante de macetas, caseta «SEMILLERO» con los sobres de la cola, camino de
// grava, ocho canteros con la planta de cada ticket según su estación, la regadera de los canteros humanos
// que flota con «?», las gotas al responder, el cajón «COSECHA» y los jardineros de sombrero de paja.
// Sin azar y sin reloj propio: la regadera y las gotas salen de `t`. Los colores de este archivo viven en PALETA.

import { dibujarPersonaje } from "./sprites.js";

const ANCHO = 960;
const ALTO = 480;
const CAVEAT = '"Caveat", "Comic Sans MS", cursive';
const MONO = "ui-monospace, Menlo, monospace";
const SANS = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
const ESTACIONES = ["Semilla", "Brote", "Hojas", "Riego de Anita", "Crecimiento", "Floración", "Fruto", "Cosecha"];
const IDS_DE_ESTACION = ["intake", "analyzed", "planned", "approved", "in_progress", "awaiting_user_tests", "in_qa", "closed"];
const HUMANAS = [3, 5];
const CAMINO_Y = 296;

/** Cuánto dura la lluvia si el estado no trae la ventana de respuesta. */
const VENTANA_POR_DEFECTO_MS = 60_000;

const PALETA = {
  fondo: "#e4f1e8", // valmen:allow-color paleta del cultivo del invernadero
  vidrio: "#ffffff", // valmen:allow-color paleta del cultivo del invernadero
  estanteLinea: "#cfdccf", // valmen:allow-color paleta del cultivo del invernadero
  sol: "#ffe08a", // valmen:allow-color paleta del cultivo del invernadero
  madera: "#a67c52", // valmen:allow-color paleta del cultivo del invernadero
  maceta: "#c0623a", // valmen:allow-color paleta del cultivo del invernadero
  verde: "#3f8f4a", // valmen:allow-color paleta del cultivo del invernadero
  verdeClaro: "#5fb36a", // valmen:allow-color paleta del cultivo del invernadero
  techo: "#8a5f3b", // valmen:allow-color paleta del cultivo del invernadero
  caseta: "#b98a5a", // valmen:allow-color paleta del cultivo del invernadero
  puerta: "#7a5433", // valmen:allow-color paleta del cultivo del invernadero
  oro: "#e8b84a", // valmen:allow-color paleta del cultivo del invernadero
  crema: "#fbf3e6", // valmen:allow-color paleta del cultivo del invernadero
  sobre: "#dfe9d0", // valmen:allow-color paleta del cultivo del invernadero
  tierraOscura: "#5b3a21", // valmen:allow-color paleta del cultivo del invernadero
  grisSobre: "#57627a", // valmen:allow-color paleta del cultivo del invernadero
  grava: "#d9d0b9", // valmen:allow-color paleta del cultivo del invernadero
  granoGrava: "#c3b89f", // valmen:allow-color paleta del cultivo del invernadero
  cantero: "#8a6440", // valmen:allow-color paleta del cultivo del invernadero
  tierra: "#5c3d26", // valmen:allow-color paleta del cultivo del invernadero
  terron: "#6e4a30", // valmen:allow-color paleta del cultivo del invernadero
  texto: "#3b4a2f", // valmen:allow-color paleta del cultivo del invernadero
  textoTenue: "#7a8a6f", // valmen:allow-color paleta del cultivo del invernadero
  rojo: "#b23b3b", // valmen:allow-color paleta del cultivo del invernadero
  agua: "#6b8fb3", // valmen:allow-color paleta del cultivo del invernadero
  tomate: "#e24b4a", // valmen:allow-color paleta del cultivo del invernadero
  cesta: "#b98a5a", // valmen:allow-color paleta del cultivo del invernadero
  cestaClara: "#d9b98f", // valmen:allow-color paleta del cultivo del invernadero
  capullo: "#d4537e", // valmen:allow-color paleta del cultivo del invernadero
  capulloClaro: "#f4c0d1", // valmen:allow-color paleta del cultivo del invernadero
  flor: "#ed93b1", // valmen:allow-color paleta del cultivo del invernadero
  centroFlor: "#ffd166", // valmen:allow-color paleta del cultivo del invernadero
  peto: "#4a5e8a", // valmen:allow-color paleta del cultivo del invernadero
};

// ── Lógica pura: se prueba sin lienzo ─────────────────────────────────────

/** El semillero queda a la izquierda, a la altura del camino de grava. */
export const PUESTO_PRINCIPAL = { x: 75, y: CAMINO_Y };

/** La x del centro del cantero de una estación. */
export function xDeCantero(indice) {
  return 150 + 100 * indice;
}

const llevaTicket = (agente) => agente.principal !== true && agente.fila?.ticket !== null && agente.fila?.ticket !== undefined;

/** El jardinero se arrodilla junto a su planta: quieto, con ticket y sin haber terminado. */
export function arrodillado(agente) {
  return llevaTicket(agente) && agente.moviendo !== true && agente.estado !== "termino";
}

/** La y de los pies al dibujarlo: 26 px más abajo si está arrodillado. */
export function piesDibujados(agente) {
  return arrodillado(agente) ? agente.y + 26 : agente.y;
}

/** La etapa de la planta que lleva en la maceta al caminar con su ticket (como mucho la tercera), o `null`. */
export function macetaEnMano(agente) {
  return llevaTicket(agente) && agente.moviendo === true ? Math.min(agente.estacion, 2) : null;
}

/** Sombrero de paja, peto azul y banda verde para la sesión principal o dorada para los demás. */
export function aparienciaDe(agente) {
  return {
    sombrero: "paja",
    bandaColor: agente.principal === true ? PALETA.verde : PALETA.oro,
    delantal: PALETA.peto,
    pantalon: PALETA.peto,
    sentado: arrodillado(agente),
  };
}

/** Un jardinero quieto con una pregunta para una persona lleva el «?». */
export function llevaPregunta(agente) {
  return agente.estado === "esperando" && agente.moviendo !== true;
}

/** La regadera de un cantero flota con un jardinero `esperando` en su estación; si no, cuelga a 282. */
export function regadera(agentes, indice, t) {
  const flota = (agentes ?? []).some((a) => a.estado === "esperando" && a.estacion === indice);
  return { flota, y: flota ? 226 + 4 * Math.sin(3 * t) : 282 };
}

/**
 * La lluvia sobre el cantero de quien recibió respuesta hace menos que la ventana: 14 gotas en posiciones
 * fijas por índice que caen en bucle según `t`, sin azar.
 */
export function gotas(agentes, ahoraMs, ventanaMs = VENTANA_POR_DEFECTO_MS, t = 0) {
  const lluvia = [];
  for (const a of agentes ?? []) {
    const respondida = a.fila?.pregunta?.respondidaEn;
    if (respondida === null || respondida === undefined) continue;
    const hora = Date.parse(respondida);
    if (Number.isNaN(hora) || ahoraMs - hora < 0 || ahoraMs - hora > ventanaMs) continue;
    for (let k = 0; k < 14; k++) lluvia.push({ x: a.x - 40 + ((k * 29) % 30), y: 240 + ((k * 17 + t * 80) % 60) });
  }
  return lluvia;
}

/** Los tres primeros sobres de la cola caben en la caseta (x de 30 a 114). */
export function sobresDelSemillero(cola) {
  return (cola ?? []).slice(0, 3).map((id, k) => ({ id, x: 30 + 30 * k, y: 236 }));
}

/** Los nueve últimos entregados, los que caben en el cajón. */
export function cosecha(entregados) {
  return (entregados ?? []).slice(-9).map((id, k) => ({ id, x: 860 + (k % 5) * 14, y: 426 + Math.floor(k / 5) * 12 }));
}

/** Posición del jardinero: la estación fija la x y el carril lo desplaza para no pisarse. */
function posicion(indice, carril) {
  return { x: 180 + 100 * indice + ((carril % 3) - 1) * 11, y: CAMINO_Y };
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
    ctx.fillStyle = o.color ?? PALETA.texto;
    ctx.textAlign = o.alinear ?? "center";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(texto, x, y);
  };
  return { R, C, T };
}

/** La planta de un ticket en la etapa `e` (0 a 7), con la base en (`x`, `b`). */
function planta(R, x, b, e) {
  const v = PALETA.verde;
  const v2 = PALETA.verdeClaro;
  if (e === 0) {
    R(x - 1, b - 2, 3, 3, PALETA.tierraOscura); R(x - 8, b - 16, 16, 12, PALETA.crema);
    R(x - 6, b - 12, 12, 2, PALETA.granoGrava); R(x - 6, b - 8, 8, 2, PALETA.granoGrava);
    return;
  }
  R(x - 1, b - 10, 3, 10, v);
  if (e === 1) { R(x - 6, b - 10, 5, 3, v2); R(x + 2, b - 8, 5, 3, v2); return; }
  R(x - 1, b - 20, 3, 10, v); R(x - 8, b - 16, 7, 4, v2); R(x + 2, b - 12, 7, 4, v2);
  if (e === 2) return;
  R(x - 1, b - 30, 3, 10, v); R(x - 8, b - 26, 7, 4, v2); R(x + 2, b - 22, 7, 4, v2);
  if (e === 3) { R(x - 4, b - 37, 8, 8, PALETA.capullo); R(x - 2, b - 39, 4, 3, PALETA.capulloClaro); return; }
  R(x - 1, b - 42, 3, 12, v); R(x - 9, b - 36, 8, 4, v2); R(x + 2, b - 32, 8, 4, v2);
  if (e === 4) return;
  R(x - 7, b - 48, 16, 5, PALETA.capulloClaro); R(x - 5, b - 52, 12, 12, PALETA.flor); R(x - 1, b - 48, 4, 4, PALETA.centroFlor);
  if (e === 5) return;
  R(x - 10, b - 30, 6, 6, PALETA.tomate); R(x + 5, b - 24, 6, 6, PALETA.tomate); R(x - 2, b - 18, 6, 6, PALETA.tomate);
  if (e === 6) return;
  R(x - 16, b - 14, 32, 14, PALETA.cesta); R(x - 14, b - 12, 28, 2, PALETA.cestaClara);
  R(x - 10, b - 20, 6, 6, PALETA.tomate); R(x - 2, b - 22, 6, 6, PALETA.tomate); R(x + 6, b - 19, 6, 6, PALETA.tomate);
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
  const k = ctx.canvas.width / ANCHO;
  ctx.save();
  ctx.scale(k, k);

  // Vidrio con montantes, línea de estante, sol con halo y estante de macetas.
  R(0, 0, ANCHO, ALTO, PALETA.fondo);
  for (let x = 0; x < ANCHO; x += 96) R(x, 0, 2, 250, PALETA.vidrio, 0.75);
  for (let y = 0; y < 250; y += 70) R(0, y, ANCHO, 2, PALETA.vidrio, 0.75);
  R(0, 118, ANCHO, 3, PALETA.estanteLinea); C(880, 60, 26, PALETA.sol); C(880, 60, 34, PALETA.sol, 0.25);
  R(140, 176, 700, 8, PALETA.madera);
  for (let n = 0; n < 11; n++) {
    const x = 160 + n * 64;
    R(x, 156, 18, 20, PALETA.maceta); R(x + 4, 146, 10, 10, PALETA.verdeClaro); R(x - 2, 150, 8, 6, PALETA.verde);
  }

  // Caseta del semillero: techo, paredes, puerta, rótulo y los sobres de la cola.
  ctx.fillStyle = PALETA.techo;
  ctx.beginPath(); ctx.moveTo(10, 180); ctx.lineTo(75, 130); ctx.lineTo(140, 180); ctx.closePath(); ctx.fill();
  R(20, 180, 110, 120, PALETA.caseta); R(60, 232, 30, 68, PALETA.puerta); R(82, 262, 4, 4, PALETA.oro);
  if (!miniatura) {
    T("SEMILLERO", 75, 206, { fuente: CAVEAT, tam: 17, color: PALETA.crema, peso: "600" });
    T("sesión principal", 75, 222, { tam: 9, color: PALETA.crema });
  }
  for (const s of sobresDelSemillero(cola)) {
    R(s.x, s.y, 24, 34, PALETA.crema); R(s.x + 4, s.y + 6, 16, 14, PALETA.sobre); R(s.x + 10, s.y + 12, 4, 4, PALETA.tierraOscura);
    if (!miniatura) T(String(s.id).split("-")[0].slice(0, 5), s.x + 12, s.y + 30, { fuente: MONO, tam: 6, color: PALETA.grisSobre });
  }

  // Camino de grava.
  R(0, 250, ANCHO, 54, PALETA.grava);
  for (let i = 0; i < 160; i++) R((i * 73) % ANCHO, 254 + ((i * 37) % 46), 2, 2, PALETA.granoGrava);

  // Los ocho canteros: tierra, estaca, letrero, nombre, id y la regadera de los humanos.
  for (let i = 0; i < 8; i++) {
    const x = xDeCantero(i);
    const humano = HUMANAS.includes(i);
    R(x - 44, 304, 88, 70, PALETA.cantero); R(x - 40, 310, 80, 58, PALETA.tierra);
    for (let n = 0; n < 18; n++) R(x - 36 + ((n * 29) % 72), 314 + ((n * 17) % 50), 3, 2, PALETA.terron);
    R(x - 46, 282, 3, 26, PALETA.puerta); R(x - 62, 270, 34, 16, PALETA.crema);
    if (!miniatura) {
      T(ESTACIONES[i], x, 396, { fuente: CAVEAT, tam: 16, color: humano ? PALETA.rojo : PALETA.texto, peso: "600" });
      T(IDS_DE_ESTACION[i], x, 409, { fuente: MONO, tam: 9, color: PALETA.textoTenue });
    }
    if (humano) {
      const { flota, y: cy } = regadera(agentes, i, t);
      R(x + 20, cy, 18, 14, PALETA.agua); R(x + 36, cy + 2, 10, 3, PALETA.agua); R(x + 24, cy - 5, 10, 5, PALETA.agua);
      if (flota && !miniatura) T("?", x + 29, cy - 10, { fuente: CAVEAT, tam: 20, color: PALETA.rojo, peso: "600" });
    }
    for (const a of agentes) if (a.estacion === i && arrodillado(a)) planta(R, x - 6, 318, a.estacion);
  }

  // Cajón de la cosecha con los entregados como tomates.
  R(850, 414, 90, 48, PALETA.madera); R(856, 420, 78, 36, PALETA.cantero);
  if (!miniatura) T("COSECHA", 895, 476, { fuente: CAVEAT, tam: 15, color: PALETA.texto, peso: "600" });
  for (const c of cosecha(entregados)) R(c.x, c.y, 8, 8, PALETA.tomate);

  // Jardineros: con la maceta en la mano al caminar y el «?» si esperan a una persona.
  for (const a of agentes) {
    dibujarPersonaje(ctx, a, a.x, piesDibujados(a), aparienciaDe(a));
    const etapa = macetaEnMano(a);
    if (etapa !== null) { R(a.x + 12, a.y - 22, 14, 10, PALETA.maceta); planta(R, a.x + 19, a.y - 22, etapa); }
    if (!miniatura && llevaPregunta(a)) T("?", a.x + 18, a.y - 20, { fuente: CAVEAT, tam: 18, color: PALETA.rojo, peso: "600" });
  }

  // Lluvia sobre el cantero de quien recibió respuesta.
  for (const g of gotas(agentes, ahoraMs, ventanaMs, t)) R(g.x, g.y, 2, 5, PALETA.agua);
  ctx.restore();
}

export const mundo = {
  id: "invernadero",
  nombre: "Invernadero",
  lema: "Cada ticket es una planta: se siembra, se riega con permiso y se cosecha.",
  pregunta: "la regadera espera a Anita",
  estaciones: ESTACIONES,
  puestoPrincipal: PUESTO_PRINCIPAL,
  paneles: { agentes: "Bitácora de cultivo", cola: "Semillero", entregados: "Cosecha" },
  posicion,
  dibujar,
};
