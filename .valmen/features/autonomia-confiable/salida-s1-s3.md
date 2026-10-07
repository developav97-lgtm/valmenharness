# Salida de S1 a S3 — medición del 2026-10-07

## Registro `ValmenHarness`

Raíz: `/Users/juanandrade/Desktop/ValmenHarness`

- Validación: **correcta** — 134 tickets válidos.

Precisión de las compuertas:

```text
Precisión de las compuertas — todo el registro

analysis · cascade: 72 corrida(s) — aprueba 38, revisa 25, bloquea 9
  tasa de banda: 35 %
  revisiones aprobadas sin cambios: 100 % (12 de 12 decididas por una persona; 8 decidida(s) por el agente por delegación, que no cuentan)
  bloqueos por tipo de ticket: FEATURE 9

analysis · jev: 39 corrida(s) — aprueba 1, revisa 38, bloquea 0
  tasa de banda: 97 %
  revisiones aprobadas sin cambios: 100 % (33 de 33 decididas por una persona; 4 decidida(s) por el agente por delegación, que no cuentan)
  bloqueos por tipo de ticket: ninguno

plan · cascade: 74 corrida(s) — aprueba 53, revisa 3, bloquea 18
  tasa de banda: 4 %
  revisiones aprobadas sin cambios: 100 % (2 de 2 decididas por una persona; 1 decidida(s) por el agente por delegación, que no cuentan)
  bloqueos por tipo de ticket: BUGFIX 1, CHORE 1, FEATURE 11, IMPROVEMENT 3, SECURITY 2

plan · jev: 38 corrida(s) — aprueba 20, revisa 18, bloquea 0
  tasa de banda: 47 %
  revisiones aprobadas sin cambios: 100 % (14 de 14 decididas por una persona; 4 decidida(s) por el agente por delegación, que no cuentan)
  bloqueos por tipo de ticket: ninguno

qa-mechanical · command: 125 corrida(s) — aprueba 125, revisa 0, bloquea 0
  tasa de banda: 0 %
  revisiones aprobadas sin cambios: — (0 de 0 decididas por una persona)
  bloqueos por tipo de ticket: ninguno
```

## Registro `SaiOpenCloud`

Raíz: `/Users/juanandrade/Desktop/ValMenTech/10-Proyectos/SaiOpenCloud`

- Validación: **correcta** — 136 tickets válidos.

Precisión de las compuertas:

```text
Precisión de las compuertas — todo el registro

analysis · jev: 70 corrida(s) — aprueba 15, revisa 55, bloquea 0
  tasa de banda: 79 %
  revisiones aprobadas sin cambios: 100 % (42 de 42 decididas por una persona)
  bloqueos por tipo de ticket: ninguno

plan · jev: 70 corrida(s) — aprueba 25, revisa 45, bloquea 0
  tasa de banda: 64 %
  revisiones aprobadas sin cambios: 100 % (27 de 27 decididas por una persona)
  bloqueos por tipo de ticket: ninguno

qa-mechanical · command: 79 corrida(s) — aprueba 71, revisa 6, bloquea 2
  tasa de banda: 8 %
  revisiones aprobadas sin cambios: 100 % (5 de 5 decididas por una persona)
  bloqueos por tipo de ticket: BUGFIX 1, IMPROVEMENT 1
```

## Lectura

Hechos que salen de los números de arriba, sin extrapolar más de lo que miden:

- **El código nuevo lee y valida los dos registros históricos**: 134 tickets en este repositorio y 136 en el de SaiOpenCloud, sin un solo ticket rechazado. El de SaiOpenCloud se leyó sin escribirlo.
- **La tasa de banda baja con la cascada**: en este repositorio la compuerta `plan` con `cascade` queda en banda de revisión el 4 % de las veces contra el 47 % con `jev`, y `analysis` el 34 % contra el 97 %. En SaiOpenCloud, que solo tiene corridas con `jev`, es del 79 % (`analysis`) y el 64 % (`plan`). No es una comparación controlada: son registros, épocas y mezclas de tickets distintos, y la cascada se usó donde el artefacto tenía sustancia.
- **Las revisiones se aprueban sin cambios**: el 100 % de las decididas por una persona en ambos registros; las que decidió el agente por delegación se separan y no cuentan. Con 0 rechazos, `valmen thresholds` no propone aflojar ningún umbral: «cero falsos aprobados» no se puede medir sin rechazos.
- **Los bloqueos** se concentran en tickets `FEATURE` (9 de 9 en `analysis` con cascada; 11 de 17 en `plan`), que son los de redacción más larga; ninguno en SaiOpenCloud con `jev`, que no bloquea.
- **Pendiente de la propia medición**: el informe es de un día; la «medición continua» del requisito se cumple corriendo este script con la frecuencia que el proyecto decida (cada semana, o antes de abrir una jornada).

Cómo repetirla: `node scripts/medir-salida-s1-s3.mjs --root <registro> [--root <otro>]`.
