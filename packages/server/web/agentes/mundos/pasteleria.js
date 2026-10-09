// Mundo «Pastelería» de la vista Agentes (FEATURE-WEB-VISTA-LIENZO-20261008).
//
// Dibujo esquemático provisional: ocho puestos rotulados y una figura por agente,
// coloreada por su estado visual. El dibujo fiel contra el prototipo es de
// FEATURE-WEB-MUNDO-*: sustituye la función `dibujar` de este archivo.

const ANCHO = 960;
const ALTO = 480;
const ESTACIONES = ["Pedidos", "Recetario", "Báscula", "Mostrador de Anita", "Horno", "Degustación", "Control", "Vitrina"];
const COLORES = { trabajando: "#2f7d4f", esperando: "#c9822a", termino: "#7a7a7a", principal: "#3b5bdb" };

function posicion(indice, carril) {
  return { x: 60 + indice * 120, y: 200 + (carril % 5) * 50 };
}

/** Dibuja el mundo; `miniatura` lo reduce al tamaño del canvas y omite los rótulos finos. */
function dibujar(estado) {
  const { ctx, escena, miniatura } = estado;
  const k = ctx.canvas.width / ANCHO;
  ctx.save();
  ctx.scale(k, k);
  ctx.fillStyle = "#f6e7c9";
  ctx.fillRect(0, 0, ANCHO, ALTO);
  ctx.fillStyle = "#5b3a21";
  ctx.font = "700 22px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("PASTELERÍA", 480, 36);
  const humanos = [3, 5];
  ESTACIONES.forEach((nombre, i) => {
    const x = 60 + i * 120;
    ctx.fillStyle = humanos.includes(i) ? "#d9822b" : "#e8cfa0";
    ctx.fillRect(x - 50, 130, 100, 56);
    ctx.fillStyle = "#5b3a21";
    ctx.font = "600 13px sans-serif";
    if (!miniatura) ctx.fillText(nombre, x, 162);
  });
  const p = { x: 480, y: 70 };
  ctx.fillStyle = "#e8cfa0";
  ctx.fillRect(p.x - 60, p.y - 24, 120, 48);
  for (const a of escena.agentes.values()) {
    ctx.fillStyle = COLORES[a.estado] ?? COLORES.trabajando;
    ctx.beginPath();
    ctx.arc(a.x, a.y, miniatura ? 12 : 14, 0, Math.PI * 2);
    ctx.fill();
    if (!miniatura && a.rotulo !== "") {
      ctx.fillStyle = "#5b3a21";
      ctx.font = "11px sans-serif";
      ctx.fillText(a.rotulo, a.x, a.y + 28);
    }
  }
  ctx.restore();
}

export const mundo = {
  id: "pasteleria",
  nombre: "Pastelería",
  lema: "Cada ticket es un pastel que recorre el obrador hasta la vitrina.",
  pregunta: "timbre en el mostrador de Anita",
  estaciones: ESTACIONES,
  puestoPrincipal: { x: 480, y: 70 },
  posicion,
  dibujar,
};
