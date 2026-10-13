---
name: descomposicion
description: Cómo se parte el trabajo de una feature en ValmenHarness. La lee el arquitecto antes de proponer el grafo, así que son las reglas de reparto de este repositorio y no las generales.
---

# Cómo se descompone en ValmenHarness

Esto no describe el formato del grafo —sprints, identificadores y cobertura ya vienen impuestos— sino **cómo se reparte el trabajo acá**. El arquitecto recibe este texto en su prompt; lo que diga acá manda sobre las reglas genéricas.

## El tamaño de un ticket

Cada ticket paga un costo fijo de unos **300 mil tokens de IA** —análisis, plan, compuertas, integración— sea chico o grande. Por eso partir de más sube el consumo total, y juntar de más vuelve caro el retrabajo. Medido en la jornada del 2026-10-10: un ticket de ~300 líneas costó 340 mil tokens y uno de ~1 300 líneas, 560 a 700 mil.

- **Tamaño objetivo: de 300 a 700 líneas de cambio por ticket**, contando producción y pruebas. Pasar de unas 900 es señal de que el ticket mezcla dos comportamientos: se parte por **comportamiento observable**, nunca por archivo, y cada parte lleva su código y sus pruebas: un ticket con código sin pruebas o con pruebas sin código no es un corte.
- **Debajo de unas 150 líneas, se agrupa** con el ticket vecino del mismo dominio, salvo que sea de los que van solos (abajo).
- **Como máximo 20 criterios de aceptación por ticket**, uno por comportamiento observable y ninguno compuesto. Un ticket que necesita más es dos tickets.
- **Un ticket es una unidad revisable y verificable**: alguien lo aprueba, alguien lo prueba, y sus criterios declaran cómo se comprueban. Si no se puede escribir un criterio verificable, es parte de otro ticket o falta spec.
- **Un ticket puede cruzar archivos y paquetes cuando el cambio es uno**: mover una lista a `@valmen/core` y hacer que el motor la lea es un ticket, no dos.
- **Las pruebas son la mitad del cambio**: una prueba parametrizada por regla, no un archivo por criterio. Se cuentan dentro de las 300 a 700 líneas.

## Lo que va solo

- **SECURITY**, y todo cambio de permisos de los agentes: lo aprueba una persona y su plan se revisa aparte.
- **Un cambio de esquema del registro** (recibos, eventos, tickets): lo que ya está escrito debe seguir leyéndose, y eso se verifica solo.
- **Despliegue y release**: exigen gate humano.
- **Lo que cambia una compuerta o su autoridad**: un gate no amplía su propia autoridad, así que va aparte de lo que lo usa.

## El orden

- El orden lo dicen las **dependencias reales**: la lista en `core` antes de quien la proyecta, la compuerta antes de lo que la exige en la entrega.
- Cuando dos tickets no dependen entre sí, van en el **mismo sprint**: el sprint es un tramo entregable y verificable, no una semana de calendario.
- Un sprint que no se puede entregar y verificar solo está mal cortado.

## El título de un ticket

- **Una línea corta**, de hasta unos ochenta caracteres, que diga **qué se entrega** y no cómo.
- Sin `: ` y sin empezar por un carácter reservado de YAML (`- ? : , [ ] { } # & * ! | > ' " % @ \``): el frontmatter de un ticket se lee sin una librería YAML y un título con «: » lo rompe.

## Identificadores

- El módulo del identificador es el **área** (`CLI`, `GATE`, `ENGINE`, `ADAPTER`, `CORE`, `BENCH`), no la capa de trabajo.
