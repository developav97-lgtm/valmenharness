// Sprites compartidos de los mundos de la vista Agentes (FEATURE-WEB-MUNDO-PASTELERIA-20261008).
//
// Archivo estático declarado en `ARCHIVOS_WEB`: sin `document` en el nivel del módulo y sin azar.
// El personaje es el bitmap 12×16 del prototipo (.valmen/features/vista-agentes/assets/vista-agentes.html),
// a escala 3: 36 px de ancho por 48 px de alto, con los pies sobre `pies`.

/** Escala del bitmap: cada píxel del sprite mide tres del lienzo. */
export const ESCALA = 3;
export const ANCHO_SPRITE = 12 * ESCALA;
export const ALTO_SPRITE = 16 * ESCALA;

export const BASE = [
  "....HHHH....", "...HHHHHH...", "...SSSSSS...", "...SESSES...", "...SSSSSS...", "....SSSS....",
  "..CCCCCCCC..", ".CCCCCCCCCC.", ".SCCCCCCCCS.", ".CCAAAAAACC.", "..CAAAAAAC..", "..AAAAAAAA..",
];

export const PIERNAS = [
  ["..PPP..PPP..", "..PPP..PPP..", "..BBB..BBB..", "..BBB..BBB.."],
  [".PPP....PPP.", ".PPP....PPP.", ".BBB....BBB.", "BBB......BBB"],
  ["....PPPP....", "....PPPP....", "....BBBB....", "....BBBB...."],
];

export const SOMBREROS = {
  toque: { dy: -5, filas: ["...WWWWWW...", "..WWWWWWWW..", "..WWWWWWWW..", "..WWWWWWWW..", "...WWWWWW...", "...WWWWWW...", "...WWWWWW..."] },
  auricular: { dy: 0, filas: ["...KKKKKK...", "..K......K..", "..K......K..", "..K.....KK..", "........KKK."] },
  gorra: { dy: -2, filas: ["...KKKKKK...", "..KKKKKKKK..", "..KKYYYYKK..", ".KKKKKKKKKK."] },
  paja: { dy: -3, filas: ["....YYYY....", "...YYYYYY...", "...YYYYYY...", "YYYYYYYYYYYY"] },
  gafas: { dy: 3, filas: ["...KK.KK....", "...K.K.K...."] },
};

const COLORES = ["#2f9e6b", "#c0623a", "#7a5fd1", "#2b7bd1", "#d4537e"]; // valmen:allow-color paleta de los sprites del prototipo
const PELOS = ["#3a2a1f", "#1b1b1b", "#8a3b1a", "#c9a24a", "#5b3a21"]; // valmen:allow-color paleta de los sprites del prototipo
const PIELES = ["#f1c9a5", "#c68642", "#8d5524", "#ffdbac", "#e0ac69"]; // valmen:allow-color paleta de los sprites del prototipo
const OJO = "#15171c"; // valmen:allow-color paleta de los sprites del prototipo
const PANTALON = "#2b3140"; // valmen:allow-color paleta de los sprites del prototipo
const BOTA = "#1b1d24"; // valmen:allow-color paleta de los sprites del prototipo
const BLANCO = "#fbfbf7"; // valmen:allow-color paleta de los sprites del prototipo
const NEGRO = "#1d2129"; // valmen:allow-color paleta de los sprites del prototipo
const DORADO = "#e8b84a"; // valmen:allow-color paleta de los sprites del prototipo

/** El cuadro de marcha: 0, 1, 0, 2 al caminar y 0 en reposo. */
export function cuadroDeMarcha(agente) {
  if (agente?.moviendo !== true) return 0;
  return [0, 1, 0, 2][Math.floor(agente.paso) % 4];
}

/** Color de camisa, pelo y piel de un carril: siempre los mismos para el mismo carril, sin azar. */
export function rasgosDe(carril) {
  const k = Math.abs(Math.trunc(Number.isFinite(carril) ? carril : 0));
  return { color: COLORES[k % COLORES.length], pelo: PELOS[k % PELOS.length], piel: PIELES[k % PIELES.length] };
}

function bitmap(ctx, filas, x, y, paleta, desde = 0, hasta = 99) {
  for (let r = desde; r < Math.min(filas.length, hasta); r++) {
    const fila = filas[r];
    for (let c = 0; c < fila.length; c++) {
      const clave = fila[c];
      if (clave === "." || !paleta[clave]) continue;
      ctx.fillStyle = paleta[clave];
      ctx.fillRect(x + c * ESCALA, y + r * ESCALA, ESCALA, ESCALA);
    }
  }
}

/**
 * Dibuja un personaje con los pies en (`cx`, `pies`). `opciones`: `camisa`, `delantal`, `pantalon`,
 * `pelo`, `piel`, `sombrero` (nombre en SOMBREROS), `sombreroColor`, `bandaColor`, `sentado`.
 * Devuelve la `y` de la cabeza.
 */
export function dibujarPersonaje(ctx, agente, cx, pies, opciones = {}) {
  const x = cx - ANCHO_SPRITE / 2;
  const y = pies - ALTO_SPRITE;
  const rasgos = rasgosDe(agente?.carril ?? 0);
  const paso = Number.isFinite(agente?.paso) ? agente.paso : 0;
  const moviendo = agente?.moviendo === true;
  const balanceo = moviendo ? 0 : Math.round(Math.sin(paso * 2) * 1.2);
  const filas = BASE.concat(PIERNAS[cuadroDeMarcha(agente)]);
  const paleta = {
    H: opciones.pelo ?? rasgos.pelo,
    S: opciones.piel ?? rasgos.piel,
    E: OJO,
    C: opciones.camisa ?? rasgos.color,
    A: opciones.delantal ?? opciones.camisa ?? rasgos.color,
    P: opciones.pantalon ?? PANTALON,
    B: BOTA,
    W: BLANCO,
    K: NEGRO,
    Y: DORADO,
  };
  bitmap(ctx, filas, x, y + balanceo, paleta, 0, opciones.sentado ? 12 : 99);
  const sombrero = SOMBREROS[opciones.sombrero];
  if (sombrero) {
    const paletaDelSombrero = { W: opciones.sombreroColor ?? paleta.W, K: opciones.sombreroColor ?? paleta.K, Y: opciones.bandaColor ?? paleta.Y };
    bitmap(ctx, sombrero.filas, x, y + balanceo + sombrero.dy * ESCALA, paletaDelSombrero);
  }
  if (agente?.principal === true) {
    ctx.fillStyle = DORADO;
    ctx.fillRect(cx - 3, y + balanceo + 22, 6, 6);
  }
  return y + balanceo;
}
