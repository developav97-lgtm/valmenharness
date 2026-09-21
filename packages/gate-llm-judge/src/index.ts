/**
 * @valmen/gate-llm-judge — evaluador de gates con un modelo de chat.
 *
 * Alternativa a Jev para que una API alpha no sea un punto único de fallo.
 * No es equivalente: devuelve una decisión booleana con confianza declarada en
 * vez de probabilidades calibradas, y la pérdida de calidad se declara.
 */

export * from "./judge.js";
