// Mundo «Centro de control» de la vista Agentes (FEATURE-WEB-MUNDO-CONTROL-20261008).
//
// Sala de turno de noche, fiel al prototipo (.valmen/features/vista-agentes/assets/vista-agentes.html,
// mundo centro de control): ocho pantallas con los tickets de cada estación, la pista con un punto por
// ticket, la franja de turno, la tarima del director con su teléfono rojo y una consola por operador.
// Sin azar y sin reloj propio: los parpadeos salen de `t`. Los colores de este archivo viven en PALETA.
//
// El operador se queda sentado en su consola (`posicion` no depende de la estación): lo que viaja por
// la pista es el punto de su ticket, con una memoria propia del módulo que avanza con el `t` de la escena.

import { dibujarPersonaje, rasgosDe } from "./sprites.js";

const ANCHO = 960;
const ALTO = 480;
const CHAKRA = '"Chakra Petch", "Segoe UI", sans-serif';
const MONO = "ui-monospace, Menlo, monospace";
const ESTACIONES = ["Ingreso", "Análisis", "Plan", "Autorización", "Ejecución", "Pruebas", "QA", "Cierre"];
const ESTADOS_DE_TICKET = ["intake", "analyzed", "planned", "approved", "in_progress", "awaiting_user_tests", "in_qa", "closed"];
const HUMANAS = [3, 5];
const CONSOLAS = 5;
const VELOCIDAD_PUNTO_PX_S = 120;
const MAXIMO_POR_PANTALLA = 3;

/** Cuánto dura la señal «Anita en línea» si el estado no trae la ventana de respuesta. */
const VENTANA_POR_DEFECTO_MS = 60_000;

const PALETA = {
  fondo: "#080d1a", // valmen:allow-color paleta de la sala del centro de control
  grilla: "#121a30", // valmen:allow-color paleta de la sala del centro de control
  panel: "#0d1730", // valmen:allow-color paleta de la sala del centro de control
  borde: "#223a6e", // valmen:allow-color paleta de la sala del centro de control
  nombre: "#8fb4ff", // valmen:allow-color paleta de la sala del centro de control
  estadoId: "#4b6aa8", // valmen:allow-color paleta de la sala del centro de control
  personaFondo: "#3a2a0a", // valmen:allow-color paleta de la sala del centro de control
  personaTexto: "#ffb84a", // valmen:allow-color paleta de la sala del centro de control
  barraFondo: "#101d3f", // valmen:allow-color paleta de la sala del centro de control
  ticketTexto: "#dfe9ff", // valmen:allow-color paleta de la sala del centro de control
  escaneo: "rgba(0,0,0,.18)", // valmen:allow-color paleta de la sala del centro de control
  puntoSinOperador: "#3b58a8", // valmen:allow-color paleta de la sala del centro de control
  cerrada: "#5b8dff", // valmen:allow-color paleta de la sala del centro de control
  franjaCalma: "#0d1730", // valmen:allow-color paleta de la sala del centro de control
  franjaAlertaClara: "#4a1118", // valmen:allow-color paleta de la sala del centro de control
  franjaAlertaOscura: "#2a0b10", // valmen:allow-color paleta de la sala del centro de control
  alertaTexto: "#ff7b7b", // valmen:allow-color paleta de la sala del centro de control
  escritorio: "#0f1a33", // valmen:allow-color paleta de la sala del centro de control
  pantallaDirector: "#163a6e", // valmen:allow-color paleta de la sala del centro de control
  tarimaSuperior: "#1e2c55", // valmen:allow-color paleta de la sala del centro de control
  tarimaBorde: "#3b58a8", // valmen:allow-color paleta de la sala del centro de control
  telefonoSuena: "#ff4d4d", // valmen:allow-color paleta de la sala del centro de control
  telefonoQuieto: "#8b1f1f", // valmen:allow-color paleta de la sala del centro de control
  telefonoBase: "#5a1212", // valmen:allow-color paleta de la sala del centro de control
  enLinea: "#7bffa0", // valmen:allow-color paleta de la sala del centro de control
  silla: "#223060", // valmen:allow-color paleta de la sala del centro de control
  tarima: "#182446", // valmen:allow-color paleta de la sala del centro de control
  directorTexto: "#6f8fd8", // valmen:allow-color paleta de la sala del centro de control
  camisaDirector: "#1e2c55", // valmen:allow-color paleta de la sala del centro de control
  espera: "#f2a52a", // valmen:allow-color paleta de la sala del centro de control
  esperaApagada: "#7a5212", // valmen:allow-color paleta de la sala del centro de control
  monitorTexto: "#eef3ff", // valmen:allow-color paleta de la sala del centro de control
  consola: "#141f3f", // valmen:allow-color paleta de la sala del centro de control
  consolaBorde: "#2b4480", // valmen:allow-color paleta de la sala del centro de control
  teclado: "#2a3a66", // valmen:allow-color paleta de la sala del centro de control
  operadorNombre: "#9fb8ff", // valmen:allow-color paleta de la sala del centro de control
  operadorTicket: "#6f8fd8", // valmen:allow-color paleta de la sala del centro de control
};

// ── Lógica pura: se prueba sin lienzo ─────────────────────────────────────

/** La tarima del director, al fondo de la sala. */
export const PUESTO_PRINCIPAL = { x: 480, y: 282 };

/** El identificador corto de un ticket: sus dos primeros segmentos. */
export function corto(id) {
  return String(id ?? "").split("-").slice(0, 2).join("-");
}

/** La x de la pantalla de una estación, y la del punto de un ticket en esa estación. */
export function xDePantalla(i) {
  return 78 + 116 * i;
}

/** El ancho de la barra de un ticket: crece con la estación, de 1/8 a 8/8 de 92 px. */
export function anchoDeBarra(i) {
  return (92 * (i + 1)) / 8;
}

const esOperador = (a) => a.principal !== true && a.fila?.ticket !== null && a.fila?.ticket !== undefined;

const preguntaAbierta = (a) => {
  const p = a.fila?.pregunta;
  return p !== null && p !== undefined && (p.respondidaEn === null || p.respondidaEn === undefined);
};

const colorDeOperador = (a) => rasgosDe(a.carril ?? 0).color;

/** Los tickets de una pantalla con su color: los de los operadores de esa estación y, en la última, los entregados. */
function fichasEnPantalla(agentes, entregados, i) {
  const operadores = (agentes ?? [])
    .filter((a) => esOperador(a) && a.estacion === i)
    .map((a) => ({ id: a.fila.ticket, color: a.estado === "termino" ? PALETA.cerrada : colorDeOperador(a) }));
  if (i !== 7) return operadores.slice(0, MAXIMO_POR_PANTALLA);
  const cerrados = (entregados ?? []).slice(-MAXIMO_POR_PANTALLA).map((id) => ({ id, color: PALETA.cerrada }));
  return [...operadores, ...cerrados].slice(-MAXIMO_POR_PANTALLA);
}

/** Los identificadores que muestra la pantalla `i`: como mucho tres. */
export function ticketsEnPantalla(agentes, entregados, i) {
  return fichasEnPantalla(agentes, entregados, i).map((f) => f.id);
}

/** El monitor de la consola de un operador: ámbar que parpadea si espera, azul si cerró, el color de su carril si trabaja. */
export function monitorDe(agente, t = 0) {
  if (agente.estado === "esperando") {
    return { color: Math.floor(t * 2) % 2 === 0 ? PALETA.espera : PALETA.esperaApagada, rotulo: "ESPERA" };
  }
  if (agente.estado === "termino" || (agente.saleEn !== null && agente.saleEn !== undefined)) {
    return { color: PALETA.cerrada, rotulo: "CERRADA" };
  }
  return { color: colorDeOperador(agente) + "77", rotulo: String(agente.fila?.ticket ?? "").split("-")[0] };
}

/** La franja de turno: cuántas misiones hay activas o a quién se espera. */
export function franja(agentes) {
  const lista = agentes ?? [];
  const esperando = lista.find((a) => a.principal !== true && preguntaAbierta(a));
  if (esperando) {
    const real = esperando.fila?.pregunta?.texto;
    const reducido = typeof real === "string" ? real.replace(/\s+/g, " ").trim() : "";
    const que = reducido !== "" ? reducido : esperando.estacion === 3 ? "¿Apruebo el plan?" : "¿Pasaron tus pruebas?";
    return { alerta: true, texto: `ESPERANDO A ANITA · LÍNEA 1 · ${corto(esperando.fila.ticket)} · ${que}` };
  }
  const activas = lista.filter((a) => esOperador(a) && a.estado !== "termino").length;
  return { alerta: false, texto: `TURNO DE NOCHE · ${activas} MISIONES ACTIVAS` };
}

/**
 * El texto, o su prefijo más largo (por puntos de código) que con «…» cabe en `anchoPx`.
 * La fuente del contexto se fija antes de llamarla. Sin medida disponible devuelve el texto.
 */
export function ajustarAlAncho(ctx, texto, anchoPx) {
  const medir = (s) => Number(ctx.measureText?.(s)?.width);
  const entero = medir(texto);
  if (Number.isNaN(entero) || entero <= anchoPx) return texto;
  const puntos = Array.from(texto);
  let bajo = 0;
  let alto = puntos.length - 1;
  while (bajo < alto) {
    const medio = Math.ceil((bajo + alto) / 2);
    if (medir(puntos.slice(0, medio).join("") + "…") <= anchoPx) bajo = medio;
    else alto = medio - 1;
  }
  return puntos.slice(0, bajo).join("") + "…";
}

/** El color de fondo de la franja: alterna a 2 Hz con una pregunta abierta. */
export function colorDeFranja(alerta, t = 0) {
  if (!alerta) return PALETA.franjaCalma;
  return Math.floor(t * 2) % 2 === 0 ? PALETA.franjaAlertaClara : PALETA.franjaAlertaOscura;
}

/**
 * El teléfono del director: `encendido` con una pregunta abierta y `anitaEnLinea` si alguien respondió
 * hace menos de la ventana (la misma que la ventanilla de la pastelería).
 */
export function telefono(agentes, ahoraMs, ventanaMs = VENTANA_POR_DEFECTO_MS) {
  const lista = agentes ?? [];
  const encendido = lista.some(preguntaAbierta);
  const anitaEnLinea = lista.some((a) => {
    const respondida = a.fila?.pregunta?.respondidaEn;
    if (respondida === null || respondida === undefined) return false;
    const t = Date.parse(respondida);
    return !Number.isNaN(t) && ahoraMs - t >= 0 && ahoraMs - t <= ventanaMs;
  });
  return { encendido, anitaEnLinea };
}

/** El director: sentado de espaldas al escritorio, camisa azul y gafas. */
export function aparienciaDelDirector() {
  return { sentado: true, camisa: PALETA.camisaDirector, sombrero: "gafas" };
}

/** El operador: sentado en su consola con auricular; de pie solo mientras camina. */
export function aparienciaDelOperador(agente) {
  return { sentado: !agente.moviendo, sombrero: "auricular" };
}

/** Una memoria de puntos vacía: un punto por operador y el último `t` visto. */
export function crearMemoria() {
  return { puntos: new Map(), t: null };
}

/**
 * Mueve el punto de cada operador hacia la pantalla de su estación a 120 px/s con el `t` de la escena.
 * Un operador nuevo nace ya en su pantalla; los puntos de quien ya no está se borran.
 */
export function avanzarPuntos(memoria, agentes, t) {
  const dt = memoria.t === null ? 0 : Math.max(0, t - memoria.t);
  memoria.t = t;
  const vivos = new Set();
  for (const a of agentes ?? []) {
    if (!esOperador(a)) continue;
    const id = a.id ?? a.fila.agente;
    vivos.add(id);
    const meta = xDePantalla(a.estacion);
    const punto = memoria.puntos.get(id);
    if (punto === undefined) {
      memoria.puntos.set(id, { x: meta, moviendo: false });
      continue;
    }
    const falta = meta - punto.x;
    const paso = VELOCIDAD_PUNTO_PX_S * dt;
    if (Math.abs(falta) <= paso) {
      punto.x = meta;
      punto.moviendo = false;
    } else {
      punto.x += Math.sign(falta) * paso;
      punto.moviendo = true;
    }
  }
  for (const id of [...memoria.puntos.keys()]) if (!vivos.has(id)) memoria.puntos.delete(id);
  return memoria;
}

/** La memoria del módulo: solo la usa el dibujo con `miniatura: false`. */
export const memoriaDePuntos = crearMemoria();

/** Posición de la consola: la estación no la mueve; el carril elige una de cinco. */
function posicion(indice, carril) {
  return { x: 130 + (carril % CONSOLAS) * 175, y: 420 };
}

// ── Dibujo ─────────────────────────────────────────────────────────────────

function pincel(ctx) {
  const R = (x, y, w, h, c) => {
    ctx.fillStyle = c;
    ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  };
  const C = (x, y, r, c) => {
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  };
  const T = (texto, x, y, o = {}) => {
    ctx.font = `${o.peso ?? ""} ${o.tam ?? 12}px ${o.fuente ?? CHAKRA}`.trim();
    ctx.fillStyle = o.color ?? PALETA.nombre;
    ctx.textAlign = o.alinear ?? "center";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(texto, x, y);
  };
  return { R, C, T };
}

/** Dibuja el mundo; `miniatura` lo reduce al tamaño del lienzo, omite los rótulos y no toca la memoria de puntos. */
function dibujar(estado, t = 0) {
  const { ctx, escena, miniatura } = estado;
  const entregados = estado.entregados ?? [];
  const ahoraMs = estado.ahoraMs ?? 0;
  const ventanaMs = estado.ventanaRespuestaMs ?? VENTANA_POR_DEFECTO_MS;
  const agentes = [...(escena?.agentes?.values?.() ?? [])];
  const operadores = agentes.filter((a) => a.principal !== true);
  const { R, C, T } = pincel(ctx);
  const encendida = Math.floor(t * 2) % 2 === 0;
  const k = ctx.canvas.width / ANCHO;
  ctx.save();
  ctx.scale(k, k);

  // Fondo y perspectiva del suelo.
  R(0, 0, ANCHO, ALTO, PALETA.fondo);
  ctx.strokeStyle = PALETA.grilla;
  ctx.lineWidth = 1;
  for (let n = 0; n <= 12; n++) {
    ctx.beginPath();
    ctx.moveTo(480, 200);
    ctx.lineTo(n * 80, ALTO);
    ctx.stroke();
  }
  for (let y = 210, paso = 8; y < ALTO; y += paso, paso *= 1.35) R(0, y, ANCHO, 1, PALETA.grilla);

  // Las ocho pantallas con los tickets de cada estación.
  for (let i = 0; i < 8; i++) {
    const x0 = 24 + i * 116;
    const x = x0 + 54;
    R(x0, 28, 108, 120, PALETA.panel);
    ctx.strokeStyle = PALETA.borde;
    ctx.strokeRect(x0 + 0.5, 28.5, 108, 120);
    if (!miniatura) {
      T(ESTACIONES[i].toUpperCase(), x, 48, { tam: 12, color: PALETA.nombre, peso: "600" });
      T(ESTADOS_DE_TICKET[i], x, 62, { fuente: MONO, tam: 9, color: PALETA.estadoId });
    }
    if (HUMANAS.includes(i)) {
      R(x0 + 6, 68, 96, 14, PALETA.personaFondo);
      if (!miniatura) T("REQUIERE PERSONA", x, 78, { tam: 9, color: PALETA.personaTexto, peso: "600" });
    }
    fichasEnPantalla(agentes, entregados, i).forEach((ficha, fila) => {
      R(x0 + 8, 90 + fila * 18, 92, 14, PALETA.barraFondo);
      R(x0 + 8, 90 + fila * 18, anchoDeBarra(i), 14, ficha.color + "88");
      if (!miniatura) T(corto(ficha.id), x, 101 + fila * 18, { fuente: MONO, tam: 9, color: PALETA.ticketTexto });
    });
    for (let y = 28; y < 148; y += 4) R(x0, y, 108, 1, PALETA.escaneo);
  }

  // La pista: un punto por ticket de operador, con su haz hacia la consola.
  R(24, 164, 912, 2, PALETA.borde);
  if (!miniatura) avanzarPuntos(memoriaDePuntos, agentes, t);
  for (const a of operadores) {
    if (!esOperador(a)) continue;
    const memoria = miniatura ? undefined : memoriaDePuntos.puntos.get(a.id ?? a.fila.agente);
    const vx = memoria?.x ?? xDePantalla(a.estacion);
    const color = a.estado === "termino" ? PALETA.cerrada : colorDeOperador(a);
    const cx = posicion(a.estacion, a.carril ?? 0).x;
    ctx.strokeStyle = color + "44";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(vx, 170);
    ctx.lineTo(cx, 326);
    ctx.stroke();
    C(vx, 165, 9, color + "33");
    C(vx, 165, 5, color);
    if (memoria?.moviendo) R(vx - 18, 164, 12, 2, color + "66");
  }

  // La franja de turno.
  const aviso = franja(agentes);
  R(24, 176, 912, 22, colorDeFranja(aviso.alerta, t));
  if (!miniatura) {
    ctx.font = `600 12px ${CHAKRA}`;
    T(ajustarAlAncho(ctx, aviso.texto, 896), 480, 191, { tam: 12, color: aviso.alerta ? PALETA.alertaTexto : PALETA.nombre, peso: "600" });
  }

  // La tarima del director: escritorio al fondo, teléfono rojo y el director de espaldas.
  const linea = telefono(agentes, ahoraMs, ventanaMs);
  R(430, 204, 36, 20, PALETA.escritorio);
  R(433, 207, 30, 14, PALETA.pantallaDirector);
  R(410, 224, 140, 22, PALETA.tarimaSuperior);
  R(410, 224, 140, 3, PALETA.tarimaBorde);
  R(520, 214, 18, 10, linea.encendido && encendida ? PALETA.telefonoSuena : PALETA.telefonoQuieto);
  R(523, 210, 12, 4, PALETA.telefonoBase);
  if (!miniatura && linea.anitaEnLinea) T("Anita en línea", 529, 206, { tam: 9, color: PALETA.enLinea });
  const director = agentes.find((a) => a.principal === true);
  if (director) dibujarPersonaje(ctx, director, director.x, director.y, aparienciaDelDirector());
  R((director?.x ?? PUESTO_PRINCIPAL.x) - 16, 262, 32, 12, PALETA.silla);
  R(380, 274, 200, 10, PALETA.tarima);
  if (!miniatura) T("DIRECTOR · sesión principal", 480, 298, { tam: 11, color: PALETA.directorTexto });

  // Las consolas: monitor, teclado, manos que teclean, operador sentado y sus rótulos.
  for (const a of operadores) {
    const cx = posicion(a.estacion, a.carril ?? 0).x;
    const monitor = monitorDe(a, t);
    R(cx - 32, 322, 64, 42, monitor.color.slice(0, 7) + "22");
    R(cx - 28, 326, 56, 34, monitor.color);
    if (!miniatura) T(monitor.rotulo, cx, 347, { tam: 10, color: PALETA.monitorTexto, peso: "600" });
    R(cx - 52, 360, 104, 36, PALETA.consola);
    R(cx - 52, 360, 104, 3, PALETA.consolaBorde);
    R(cx - 20, 366, 40, 6, PALETA.teclado);
    if (a.estado === "trabajando" && a.moviendo !== true) R(cx - 8 + (Math.floor(t * 9) % 2) * 10, 364, 5, 3, rasgosDe(a.carril ?? 0).piel);
    dibujarPersonaje(ctx, a, a.x, a.y, aparienciaDelOperador(a));
    if (a.moviendo !== true) R(a.x - 14, 398, 28, 12, PALETA.silla);
    if (!miniatura) {
      T(String(a.fila?.agente ?? a.id ?? "").slice(0, 4), cx, 436, { fuente: MONO, tam: 10, color: PALETA.operadorNombre });
      T(corto(a.fila?.ticket), cx, 450, { fuente: MONO, tam: 9, color: PALETA.operadorTicket });
      T(String(a.fila?.ultimaHerramienta ?? "").replace(/^mcp__valmen__/, ""), cx, 464, { fuente: MONO, tam: 9, color: PALETA.estadoId });
    }
  }
  ctx.restore();
}

export const mundo = {
  id: "control",
  nombre: "Centro de control",
  lema: "Turno de noche: las misiones en la pared, los operadores en consola.",
  pregunta: "línea 1 abierta",
  estaciones: ESTACIONES,
  puestoPrincipal: PUESTO_PRINCIPAL,
  paneles: { agentes: "Telemetría", cola: "Misiones en espera", entregados: "Misiones cerradas" },
  posicion,
  dibujar,
};
