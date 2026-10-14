---
schema_version: 2
id: rediseno-mission-control
title: Rediseño de Mission Control: estilo sala de control, menú por grupos y pantallas más fáciles de usar
state: decomposed
created: 2026-10-14
updated: 2026-10-14
---

# Rediseño de Mission Control: estilo sala de control, menú por grupos y pantallas más fáciles de usar

## Problema

Mission Control (`packages/server/web/index.html`) creció pantalla por pantalla y
hoy cuesta usarlo. Con las palabras del PO, el 2026-10-13:

- «La de los modelos es un lío porque no sé cuál es el perfil activo ni qué
  cambian sus modelos o cómo es que se usa.» La vista Modelos apila cuatro
  conceptos que se pisan —Perfiles, Modelo por fase, Preset y Modelo por rol—
  sin decir cuál manda (`vistaModelos`, `seccionPerfiles`,
  `seccionModeloPorFase`), y el perfil activo solo aparece como una marca de
  texto dentro de una lista.
- «Necesito rediseñar todo para que sea rápido y entendible y práctico para
  usar.»
- «Revisa el menú porque hay dos opciones que dicen configurar o
  configuración.» El menú lateral tiene diez entradas en un solo grupo
  «Registro»; «Configurar» es el chat que propone cambios (`vistaConfigurar`) y
  «Configuración» el editor del proyecto (`vistaConfiguracion`).
- El estilo visual que quiere es el de la presentación a la dirección
  («este artefacto que armamos en otra sesión me gustó mucho»).

## Objetivo

Que cada pantalla responda primero lo que la persona necesita decidir, con el
estilo «sala de control» (Chakra Petch, IBM Plex Sans y Plex Mono; el color dice
quién decide: ámbar una persona, cian el código, lila un modelo), un menú de
cinco grupos sin nombres repetidos y el perfil de modelos activo siempre a la
vista.

Los bocetos los aprobó el PO el 2026-10-14 («Dale, me encantó, lo apruebo») y
pidió que queden en los tickets «para que las pantallas queden perfectas». Cada
pantalla **se construye y se valida contra su boceto** en `assets/`: el HTML
autónomo es el original y el PNG es su captura a 1440 px.

## Alcance

- Dentro:
  - Tema y marco común: tokens de color, tipografía, fondo de cuadrícula, modo
    claro y oscuro, y el menú nuevo por grupos con el proyecto y el perfil activo
    arriba (`assets/menu.html`, `assets/menu-antes-despues.html`).
  - «Configurar» deja de ser una entrada del menú y pasa a ser la acción «Pedir
    un cambio» (⌘K) disponible en todas las pantallas; «Configuración» pasa a
    Ajustes › Proyecto. Las rutas viejas siguen funcionando.
  - Inicio, pantalla nueva: lo que espera una decisión de la persona, lo que
    corre ahora y lo hecho hoy (`assets/inicio.html`).
  - Ajustes: Modelos, Cambiar de perfil con vista previa, Proveedores y Proyecto.
  - Trabajo: Tickets, Detalle de ticket, Features con su tablero y Portafolio.
  - En vivo y Reglas: Agentes (marco nuevo alrededor de los mundos que ya
    existen), Procesos y Estándares.
- Fuera:
  - El motor de escena y los tres mundos de la vista Agentes: se conservan como
    están; solo cambia el marco alrededor.
  - Cambiar qué decide una persona: crear o revocar una autorización sigue
    pidiendo actor y frase literal, como hoy.
  - Las cifras de los bocetos: son de ejemplo; la pantalla muestra los datos
    reales de la API.

## Restricciones

- Ningún color a mano fuera de los tokens (`revisar_presentacion`); el modo
  claro se mantiene.
- Accesible tal como está dibujado: controles reales, objetivos de 44 px,
  contraste AA y `prefers-reduced-motion`.
- En el celular el menú se apila y las tablas anchas se desplazan en su caja.

## Artefactos

- `spec/<dominio>/spec.md` — requisitos RFC 2119 y escenarios.
- `design.md` — alternativas y decisión técnica.
- `tickets.yaml` — el grafo: sprints, cobertura y huecos.
- `verify.md` — la evidencia, al completar.
- `assets/` — los 14 bocetos aprobados (HTML autónomo + PNG) y su índice.
