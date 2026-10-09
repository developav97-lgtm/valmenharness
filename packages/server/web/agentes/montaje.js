// Capa de montaje del lienzo de la vista Agentes (FEATURE-WEB-VISTA-LIENZO-20261008).
//
// Sin `document` en el nivel del módulo: el reloj, el cuadro de animación, el
// almacenamiento y la visibilidad llegan inyectados, y por eso se prueba sin
// navegador. El motor decide dónde está cada agente; los mundos lo dibujan; este
// archivo solo los une y evita que un refresco de datos reinicie la escena.

import { actualizar, avanzar, crearEscena } from "./motor.js";
import { MUNDOS as MUNDOS_REGISTRADOS, MUNDO_POR_DEFECTO } from "./mundos/index.js";

export const CLAVE_MUNDO = "valmen.agentes.mundo";

/** Cuánto tiempo después de contestada se sigue mostrando que alguien respondió. */
export const VENTANA_RESPUESTA_MS = 60_000;

/** El mayor salto de tiempo que un cuadro aplica: una pestaña dormida no teletransporta a nadie. */
const DT_MAXIMO_S = 0.25;

/** El mismo formato de «hace cuánto» que usa la vista, como función pura. */
export function haceCuanto(iso, ahoraMs) {
  const t = Date.parse(iso ?? "");
  if (Number.isNaN(t)) return "—";
  const s = Math.max(0, Math.round((ahoraMs - t) / 1000));
  if (s < 60) return `hace ${s} s`;
  if (s < 3600) return `hace ${Math.floor(s / 60)} min`;
  return `hace ${Math.floor(s / 3600)} h`;
}

/** El mundo guardado en este navegador, o la pastelería si no hay, no es válido o el almacén falla. */
export function leerMundoElegido(almacen, ids) {
  try {
    const guardado = almacen?.getItem(CLAVE_MUNDO);
    if (typeof guardado === "string" && ids.includes(guardado)) return guardado;
  } catch {
    // Sin almacenamiento, se usa el mundo por defecto.
  }
  return MUNDO_POR_DEFECTO;
}

export function guardarMundoElegido(almacen, id) {
  try {
    almacen?.setItem(CLAVE_MUNDO, id);
  } catch {
    // Es solo una preferencia de este navegador.
  }
}

/** Un aviso por fila con pregunta: abierta, o respondida hace menos de un minuto. */
export function avisosDePregunta(filas, ahoraMs, mundo) {
  const avisos = [];
  for (const fila of filas ?? []) {
    const p = fila?.pregunta;
    if (p === null || p === undefined) continue;
    const ticket = fila.ticket ?? fila.agente;
    if (p.respondidaEn === null || p.respondidaEn === undefined) {
      avisos.push({
        tipo: "pendiente",
        encabezado: "Pregunta pendiente para una persona",
        quien: "una persona",
        ticket,
        hace: haceCuanto(p.desde, ahoraMs),
        expresion: mundo.pregunta,
      });
      continue;
    }
    const respondida = Date.parse(p.respondidaEn);
    if (Number.isNaN(respondida) || ahoraMs - respondida > VENTANA_RESPUESTA_MS) continue;
    avisos.push({
      tipo: "respondio",
      encabezado: "una persona respondió",
      ticket,
      hace: haceCuanto(p.respondidaEn, ahoraMs),
    });
  }
  return avisos;
}

/** El panel «Agentes»: la sesión principal primero y luego los agentes vivos. */
export function filasDePanelAgentes(agentes) {
  const lista = agentes ?? [];
  const filaDe = (a) => {
    const confirmada = a.faseConfirmada ?? null;
    const fase = confirmada ?? a.faseInferida ?? "—";
    return {
      agente: a.agente,
      nombre: a.principal === true ? "Sesión principal" : a.agente,
      principal: a.principal === true,
      estado: a.estado,
      ticket: a.ticket ?? null,
      descripcion: a.descripcion ?? null,
      modelo: a.modelo ?? null,
      esfuerzo: a.esfuerzo ?? null,
      faseConfirmada: a.faseConfirmada ?? null,
      faseInferida: a.faseInferida ?? null,
      ultimaHerramientaEn: a.ultimaHerramientaEn ?? null,
      fase,
      inferida: confirmada === null && a.faseInferida != null,
      ultimaHerramienta: a.ultimaHerramienta ?? null,
    };
  };
  const principales = lista.filter((a) => a.principal === true).map(filaDe);
  const vivos = lista
    .filter((a) => a.principal !== true && (a.estado === "trabajando" || a.estado === "esperando"))
    .map(filaDe);
  return [...principales, ...vivos];
}

/**
 * El montaje del lienzo. `montar` es idempotente: la primera vez crea la escena y
 * el bucle de cuadros; las siguientes solo fusionan las filas nuevas.
 */
export function crearMontaje({
  mundos = MUNDOS_REGISTRADOS,
  almacen = null,
  pedirCuadro,
  cancelarCuadro,
  visible = () => true,
  ahora = () => Date.now(),
}) {
  const ids = mundos.map((m) => m.id);
  let mundo = mundos.find((m) => m.id === leerMundoElegido(almacen, ids)) ?? mundos[0];
  let escena = null;
  let canvas = null;
  let filasVigentes = [];
  let cuadro = null;
  let ultimo = null;

  function dibujarCuadro() {
    const ctx = canvas?.getContext?.("2d");
    if (!ctx) return;
    mundo.dibujar({ ctx, escena, miniatura: false }, escena.t);
  }

  function cuadroDeAnimacion() {
    cuadro = null;
    if (canvas === null || escena === null) return;
    // Se pide el siguiente antes de dibujar: un fallo del dibujo no detiene el bucle.
    cuadro = pedirCuadro(cuadroDeAnimacion);
    const t = ahora();
    const dt = ultimo === null ? 0 : Math.min(DT_MAXIMO_S, Math.max(0, (t - ultimo) / 1000));
    ultimo = t;
    if (visible()) {
      avanzar(escena, dt, t);
      dibujarCuadro();
    }
  }

  return {
    montar(lienzo, filas, ahoraMs) {
      canvas = lienzo;
      filasVigentes = filas;
      if (escena === null) escena = crearEscena(mundo);
      actualizar(escena, filas, ahoraMs);
      if (cuadro === null) {
        ultimo = ahora();
        cuadro = pedirCuadro(cuadroDeAnimacion);
      }
    },
    desmontar() {
      if (cuadro !== null) cancelarCuadro(cuadro);
      cuadro = null;
      canvas = null;
      ultimo = null;
    },
    elegirMundo(id) {
      const nuevo = mundos.find((m) => m.id === id);
      if (nuevo === undefined) return false;
      mundo = nuevo;
      guardarMundoElegido(almacen, id);
      escena = crearEscena(mundo);
      actualizar(escena, filasVigentes, ahora());
      return true;
    },
    mundoActual: () => mundo,
    escena: () => escena,
    mundos: () => mundos,
    /** Olvida la escena: otro proyecto no hereda las posiciones del anterior. */
    reiniciar() {
      escena = null;
      filasVigentes = [];
    },
  };
}
