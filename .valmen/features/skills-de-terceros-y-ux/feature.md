---
schema_version: 2
id: skills-de-terceros-y-ux
title: Skills de terceros, revisión de UX y CodeGraph
state: decomposed
created: 2026-10-07
updated: 2026-10-07
---

# Skills de terceros, revisión de UX y CodeGraph

## Problema

Con las palabras del PO, el 2026-10-07:

> «Quisiera que la revises y determines cuáles vale la pena incluir en el arnés. El
> objetivo es que todo funcione con el arnés; al configurarlo, pueda contar con esas
> skills, o al menos con las que realmente nos ayuden.»

> «la sección de UI/UX me parece útil para revisarla e implementarla, de modo que
> tengamos una revisión de la experiencia de usuario.»

> «No es necesario que implementes todas; basta con buscar cómo funciona cada skill
> y, si conviene, incorporarla.»

> «nosotros no tenemos montado codegraph que debería servir para lo mismo o en
> saicloud sí está, yo ese lo he usado y me ha funcionado bien […] no sé si al montar
> el harness debería instalarlo también»

Lo comprobado el mismo día: el harness ya reconoce CodeGraph como capacidad de un
proyecto adoptado y sabe registrarlo como servidor MCP, pero no lo instala ni lo
indexa; este repositorio no tiene `.codegraph/`. Las skills de terceros son código
que corre con los permisos del agente: el ranking de la imagen del PO no coincide
con las fuentes consultadas, así que no se toma como evidencia.

## Objetivo

Que un proyecto montado con el harness pueda declarar skills de terceros útiles
—con prioridad la revisión de UX— y CodeGraph, con versión fijada y revisión
registrada, sin instalar nada por sorpresa.

## Alcance

- Dentro: un mecanismo para declarar skills de terceros por proyecto (fuente,
  versión fijada, hash, quién las revisó); integrar UI UX Pro Max e Impeccable a la
  fase de diseño y revisión de pantallas; ofrecer CodeGraph al montar o adoptar un
  proyecto (instalar e indexar solo con confirmación, registrar el MCP en cada
  cliente, estado en el diagnóstico); una evaluación registrada de las skills
  restantes de la imagen (Ponytail, Addy Osmani, Awesome Claude Skills, Archify,
  Superpowers, Caveman) con la decisión y su motivo.
- Fuera: instalar Graphify o Understand Anything (duplican a CodeGraph); adoptar
  Superpowers entero (impone su propio flujo); Caveman (el contrato de respuesta ya
  cubre la brevedad); instalar skills sin confirmación.

## Restricciones

- Ninguna skill de terceros se instala ni se actualiza sin que una persona lo pida.
- Toda skill declarada lleva versión fijada; una actualización es una decisión.
- Se proyectan con `valmen sync`, que lo ejecuta una persona.

## Artefactos

- `spec/skills/spec.md` — requisitos RFC 2119 y escenarios.
- `design.md` — alternativas y decisión técnica.
- `tickets.yaml` — el grafo: sprints, cobertura y huecos.
- `verify.md` — la evidencia, al completar.
