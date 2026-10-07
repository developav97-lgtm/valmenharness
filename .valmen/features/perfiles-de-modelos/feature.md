---
schema_version: 2
id: perfiles-de-modelos
title: Perfiles de modelos por fase y por ejecutor
state: decomposed
created: 2026-10-07
updated: 2026-10-07
---

# Perfiles de modelos por fase y por ejecutor

## Problema

Con las palabras del PO, el 2026-10-07:

> «Quiero llegar a este punto con los routers: que podamos lograr una economía en
> el consumo delegando cada fase a los modelos que realmente pueden ejecutarla.»

> «si necesito crear un plan o un diseño, el modelo que debería intervenir podría
> ser Opus 5.5 o incluso Fable 5 […] Luego, al pasar a la revisión, podríamos usar
> un modelo más económico […] para la implementación, una vez que el análisis y el
> plan estén listos, podríamos usar Sonnet 5.5.»

> «Sé que tenemos una configuración de modelos en el arnés. Con la nueva
> implementación, aparecen nuevos objetos en la sección de modelos […] Necesito
> verificar si realmente se están ejecutando.»

> «El preset de calidad no está haciendo nada; tengo que cambiar los modelos
> manualmente. Por eso, me gustaría añadir configuraciones personalizadas de
> modelos y poder seleccionarlas.»

> «Trabajar hoy con Claude Code: seleccionar que todos los modelos sean de Claude
> Code. Trabajar con Codex […]. Trabajar en Open Code.»

> «De esta forma podría combinar modelos de Codex, Open Router o Open Code Go. Si
> ejecuto desde Hermes, podría elegir otra configuración.»

> «los perfiles deben ser personalizables […] podría hacerlo mixto, por ejemplo
> Claude y Codex»

Lo comprobado el mismo día: en `.valmen/routing.yaml` el preset es `quality` pero
los seis roles están fijados a mano a Codex, así que ningún preset tiene efecto;
los roles de fase (`agent-analysis`, `agent-plan`, `agent-implementation`,
`agent-verification`) solo traen modelos de Codex en tres presets y de Claude Code
solo en `subscription`; y cuando el proveedor del rol no es el del ejecutor, el
despacho cae al modelo del ejecutor. El harness solo decide el modelo cuando él
lanza al ejecutor: una sesión abierta a mano usa el modelo con que se abrió.

## Objetivo

Que la persona defina perfiles de modelos con nombre, personalizables y mixtos,
los elija por proyecto y por ejecutor, y vea con qué modelo se ejecutó de verdad
cada fase, para que Opus o Fable planifiquen, Sonnet implemente y un modelo barato
verifique, sin cambiar modelos a mano.

## Alcance

- Dentro: perfiles con nombre (incorporados: Claude Code completo, Codex completo,
  OpenCode Go; y los que la persona cree); selección por proyecto y por ejecutor
  (Mission Control, Hermes); un perfil mixto que asigna a cada fase un proveedor y
  un modelo; despacho de cada fase al ejecutor de su proveedor; vista del modelo
  efectivo por fase y de dónde salió; registro del modelo realmente usado;
  orquestación de una sesión interactiva con subagentes que usan el modelo de la fase.
- Fuera: un router que elija el modelo por la complejidad de cada petición
  (etapa posterior); cambiar el modelo de la sesión que la persona abrió a mano;
  los evaluadores de compuertas (Jev), que no cambian.

## Restricciones

- Un identificador de modelo debe existir en el catálogo de su proveedor; un perfil
  con un modelo que no existe se rechaza al guardar.
- Un perfil no amplía la autorización de ejecución del proyecto.
- El costo que un cliente no reporta se dice «sin reportar»; no se inventa.

## Artefactos

- `spec/perfiles/spec.md` — requisitos RFC 2119 y escenarios.
- `design.md` — alternativas y decisión técnica.
- `tickets.yaml` — el grafo: sprints, cobertura y huecos.
- `verify.md` — la evidencia, al completar.
