# Diseño — rediseño de Mission Control

## Decisión 1: reestilizar la aplicación actual, no reescribirla

- **A) Reestilizar en el mismo cliente** (`packages/server/web/index.html`,
  JavaScript sin framework): se reemplazan las variables de color por los tokens
  del tema, se reorganiza el menú y se rehace el marcado de cada vista sobre las
  mismas llamadas a la API.
- B) Reescribir el cliente con un framework y un empaquetador: añade
  dependencias y un paso de compilación a un paquete que hoy no lo tiene, y
  obliga a rehacer las pruebas de la vista.

**Elegida: A.** Conserva las rutas, las llamadas y las pruebas existentes; cada
ticket cambia una vista o el marco común, y el resto sigue funcionando entre
ticket y ticket. Los bocetos (`assets/*.html`) son la referencia visual, no
código a copiar: su marcado sirve de guía, pero la vista usa los tokens y las
funciones del cliente (`el`, `api`, `navegar`).

## Decisión 2: las fuentes viajan con el servidor

- **A) Servir Chakra Petch, IBM Plex Sans e IBM Plex Mono como archivos `woff2`**
  desde `packages/server/web/` (licencia SIL OFL), con pilas de respaldo del
  sistema.
- B) Cargarlas de Google Fonts: Mission Control corre en local y puede no tener
  red; además envía la visita a un tercero.

**Elegida: A.**

## Decisión 3: el tema se define una vez y el modo claro se conserva

Los tokens viven en `:root`, con su versión clara bajo
`prefers-color-scheme: light`, con los mismos valores que la presentación a la
dirección que el PO tomó como referencia de estilo:

| Token | Oscuro | Claro |
|---|---|---|
| fondo / fondo 2 | `#0a1114` / `#0e181c` | `#f2f6f7` / `#e8eef0` |
| superficie / superficie 2 | `#122027` / `#172a32` | `#ffffff` / `#f4f8f9` |
| línea | `#24383f` | `#c9d6da` |
| texto / atenuado / tenue | `#e8f0f2` / `#9aaeb4` / `#5f767d` | `#0d1a1f` / `#4a5f66` / `#7d9198` |
| código (cian) | `#4cc8e6` | `#0a7898` |
| persona (ámbar) | `#f2b43f` | `#9a6100` |
| modelo (lila) | `#ad9ff4` | `#5a45c4` |
| negado (rojo) | `#f36a5d` | `#bf3326` |
| hecho (verde) | `#62d69e` | `#1b7f4d` |
| cuadrícula | `rgba(120,170,185,.07)` | `rgba(20,70,90,.06)` |

Los rellenos suaves de cada acento son el mismo color al 10–15 % de opacidad.
Ningún color a mano en las vistas; uno legítimo se marca con
`valmen:allow-color` y su motivo.

## Cómo se valida cada pantalla

Cada ticket abre su boceto (`assets/<pantalla>.html`, autónomo) y su captura
(`assets/<pantalla>.png`, 1440 px) junto a la vista implementada, a 1440 px y a
390 px, en modo oscuro y claro, y deja las capturas como evidencia. Las cifras
de los bocetos son de ejemplo: lo que se compara es la estructura, la jerarquía,
los colores por quién decide y los textos fijos.
