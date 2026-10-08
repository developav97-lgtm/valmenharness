# Diseño — vista-agentes

Cuatro decisiones técnicas; el resto sigue lo que ya hay.

## 1. Lienzo: Canvas 2D, no DOM ni SVG

- Alternativas: elementos DOM animados con CSS; SVG con `<use>` por sprite;
  Canvas 2D con bitmaps.
- Elegida: **Canvas 2D** a 960 por 480, escalado por CSS con
  `image-rendering: pixelated`. Es lo que hace el prototipo.
- Por qué: hay decenas de elementos que se mueven o parpadean por cuadro
  (vapor, gotas, haces, pantallas, personajes); con DOM cada uno sería un nodo
  con sus reflows, y con SVG los sprites de píxel se difuminan al escalar. Un
  solo `requestAnimationFrame` que repinta todo es más simple y más barato en
  celular. El texto de la escena se dibuja con `fillText`, así que las fuentes de
  mundo se esperan con `document.fonts.ready` antes de arrancar.

## 2. Un motor y tres módulos de mundo

- Alternativas: un archivo por mundo con su propia lógica; un motor común y
  mundos como objetos con interfaz fija.
- Elegida: **motor común** (`estaciones`, `objetivo`, `avanzar`, estados
  visuales, selector, aviso) y **un módulo por mundo** que declara nombres,
  posiciones y una función `dibujar(estado, t)`. El motor no nombra ningún mundo.
- Por qué: los tres mundos del prototipo ya comparten el 100 % de la simulación
  y solo difieren en dibujo y textos; separarlos permite probar el motor con
  `vitest` sin `document` (R-ESC-009) y agregar un mundo sin tocar el motor
  (R-MUN-001).

## 3. Archivos nuevos servidos desde el mapa de estáticos

- Alternativas: meter todo en `index.html` (hoy 8785 líneas); archivos aparte.
- Elegida: `packages/server/web/agentes/motor.js` y
  `packages/server/web/agentes/mundos/{pasteleria,control,invernadero}.js`,
  cargados como módulos ES desde `index.html`, y declarados en `loadStatics`
  (`packages/cli/src/main.ts`), que sirve solo lo que está en el mapa.
- Por qué: el servidor no recorre directorios por diseño; declarar cada archivo
  conserva esa garantía. Módulos ES permiten que `vitest` importe el motor tal
  cual, sin un paso de build que hoy no existe para el cliente.

## 4. La escena sobrevive al refresco de la vista

- Hoy `programarRefrescoDeCorrida` vuelve a llamar a `navegar` y la vista se
  repinta entera; un lienzo nuevo cada vez reiniciaría la animación.
- Elegida: el estado del motor vive en el módulo (fuera del DOM de la vista); al
  repintar, la vista crea el lienzo y llama a `motor.montar(canvas, filas)`, que
  reemplaza las filas y sigue el bucle. Al salir de la vista, `motor.desmontar()`
  detiene el bucle. Pestaña oculta: no anima ni consulta (ya lo hace el
  refresco).
- Por qué: cumple R-ESC-006 sin tocar el mecanismo de refresco ni introducir
  SSE nuevo; los datos siguen llegando por el mismo `GET`.

## 5. La pregunta pendiente se decide en el servidor

- Alternativas: que el cliente deduzca la pregunta de `ultimaHerramienta`; que el
  lector de transcripts la marque.
- Elegida: el lector (`agentes.ts`) agrega `pregunta` a la fila a partir del
  `tool_use` de `AskUserQuestion` sin resultado, con reloj inyectado. El cliente
  solo pinta.
- Por qué: el cliente no lee transcripts, y la lista blanca se decide en un solo
  lugar; la opción B (texto) es una ampliación localizada de esa lista con la
  decisión escrita del PO, no un cambio en el cliente.

## Lo que no cambia

- El endpoint y su ruta (`/api/corrida/agentes`): la vista cambia de nombre,
  el proceso sigue siendo la ejecución.
- El refresco, la memoria de «simultáneos» y la detección de agentes vivos.
- El registro: nada escribe.
