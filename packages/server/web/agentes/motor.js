// Motor de escena de la vista Agentes (FEATURE-WEB-MOTOR-ESCENA-20261008).
//
// Módulo puro: sin DOM, sin azar y sin reloj propio. El tiempo llega siempre como
// argumento, y el mundo (estaciones, posiciones, dibujo) llega como parámetro: el
// motor decide dónde está cada agente y cómo se mueve; dibujarlo es del mundo.

/** Las ocho estaciones, en el orden del ciclo de vida del ticket. */
export const ESTACIONES = [
  { id: "intake" },
  { id: "analyzed" },
  { id: "planned" },
  { id: "approved", humano: true },
  { id: "in_progress" },
  { id: "awaiting_user_tests", humano: true },
  { id: "in_qa" },
  { id: "closed" },
];

export const ESTADOS_VISUALES = ["trabajando", "esperando", "termino", "principal"];

/** Píxeles por segundo con que un agente camina hacia su objetivo. */
export const VELOCIDAD_PX_S = 90;

/** Milisegundos que un agente que terminó tarda en irse de la escena. */
export const SALIDA_MS = 5000;

const DESVIOS = ["blocked", "changes_requested"];

/**
 * La estación de una fila. `blocked` y `changes_requested` son desvíos: el agente
 * se queda en la última estación válida (o en `intake` si nunca hubo una).
 */
export function estacionDe(fila, ultimaValida) {
  if (DESVIOS.includes(fila.ticketEstado)) {
    return { indice: ultimaValida === undefined || ultimaValida === null ? 0 : ultimaValida, desvio: true };
  }
  const indice = ESTACIONES.findIndex((e) => e.id === fila.ticketEstado);
  return { indice: indice < 0 ? 0 : indice, desvio: false };
}

export function rotuloDe(fila) {
  return fila.faseConfirmada ?? fila.faseInferida ?? fila.ultimaHerramienta ?? "";
}

export function estadoVisualDe(fila) {
  return fila.principal ? "principal" : fila.estado;
}

const textoNoVacio = (v) => typeof v === "string" && v.trim() !== "";

/** Los errores de un mundo que no cumple la interfaz; vacía si cumple. */
export function validarMundo(mundo) {
  if (mundo === null || typeof mundo !== "object") return ["el mundo no es un objeto"];
  const errores = [];
  for (const campo of ["id", "nombre", "lema", "pregunta"]) {
    if (!textoNoVacio(mundo[campo])) errores.push(`${campo}: falta o no es texto`);
  }
  if (!Array.isArray(mundo.estaciones) || mundo.estaciones.length !== ESTACIONES.length) {
    errores.push(`estaciones: debe tener exactamente ${ESTACIONES.length} textos`);
  } else if (!mundo.estaciones.every(textoNoVacio)) {
    errores.push("estaciones: todos los elementos deben ser texto no vacío");
  }
  for (const campo of ["posicion", "dibujar"]) {
    if (typeof mundo[campo] !== "function") errores.push(`${campo}: debe ser una función`);
  }
  const p = mundo.puestoPrincipal;
  if (p === null || typeof p !== "object" || !Number.isFinite(p.x) || !Number.isFinite(p.y)) {
    errores.push("puestoPrincipal: debe tener x e y numéricos");
  }
  return errores;
}

export function crearEscena(mundo) {
  const errores = validarMundo(mundo);
  if (errores.length > 0) throw new Error(`Mundo inválido: ${errores.join("; ")}`);
  return { mundo, t: 0, agentes: new Map(), orden: [], siguienteCarril: 0 };
}

/** A dónde va un agente: el puesto principal si es la principal o está saliendo. */
export function objetivoDe(mundo, agente) {
  if (agente.principal || agente.saleEn !== null) return { x: mundo.puestoPrincipal.x, y: mundo.puestoPrincipal.y };
  const p = mundo.posicion(agente.estacion, agente.carril);
  return { x: p.x, y: p.y };
}

function fijarObjetivo(escena, agente) {
  const o = objetivoDe(escena.mundo, agente);
  agente.objetivoX = o.x;
  agente.objetivoY = o.y;
}

/**
 * Fusiona las filas del servidor con la escena. No la reinicia: un agente que ya
 * estaba conserva posición, carril y paso; solo cambia lo que dicen las filas.
 */
export function actualizar(escena, filas, ahoraMs) {
  const vistos = new Set();
  for (const fila of filas) {
    vistos.add(fila.agente);
    let a = escena.agentes.get(fila.agente);
    if (a === undefined) {
      a = {
        id: fila.agente, fila, x: escena.mundo.puestoPrincipal.x, y: escena.mundo.puestoPrincipal.y,
        carril: escena.siguienteCarril, paso: 0, moviendo: false, estacion: 0, desvio: false,
        ultimaValida: null, rotulo: "", estado: "trabajando", principal: false, saleEn: null,
        objetivoX: 0, objetivoY: 0,
      };
      escena.siguienteCarril += 1;
      escena.agentes.set(fila.agente, a);
      escena.orden.push(fila.agente);
    }
    const est = estacionDe(fila, a.ultimaValida);
    a.fila = fila;
    a.estacion = est.indice;
    a.desvio = est.desvio;
    if (!est.desvio) a.ultimaValida = est.indice;
    a.rotulo = rotuloDe(fila);
    a.principal = fila.principal === true;
    a.estado = estadoVisualDe(fila);
    if (a.estado === "termino" && a.saleEn === null) a.saleEn = ahoraMs + SALIDA_MS;
    fijarObjetivo(escena, a);
  }
  for (const [id, a] of escena.agentes) {
    if (vistos.has(id)) continue;
    if (a.saleEn === null) a.saleEn = ahoraMs + SALIDA_MS;
    fijarObjetivo(escena, a);
  }
}

/** Un cuadro: mueve a cada agente hacia su objetivo y quita a los que ya salieron. */
export function avanzar(escena, dtSegundos, ahoraMs) {
  escena.t += dtSegundos;
  const paso = VELOCIDAD_PX_S * dtSegundos;
  for (const [id, a] of escena.agentes) {
    if (a.saleEn !== null && a.saleEn <= ahoraMs) {
      escena.agentes.delete(id);
      escena.orden = escena.orden.filter((x) => x !== id);
      continue;
    }
    const dx = a.objetivoX - a.x;
    const dy = a.objetivoY - a.y;
    const d = Math.hypot(dx, dy);
    if (d <= 1e-9) {
      a.moviendo = false;
    } else if (d <= paso) {
      a.x = a.objetivoX;
      a.y = a.objetivoY;
      a.moviendo = false;
    } else {
      a.x += (dx / d) * paso;
      a.y += (dy / d) * paso;
      a.moviendo = true;
    }
    a.paso += dtSegundos * (a.moviendo ? 8 : 2);
  }
}
