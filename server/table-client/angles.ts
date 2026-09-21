// УГЛЫ В ГРАДУСАХ — одна формула на весь клиент стола.

/** Кратчайший путь от `b` к `a`: со знаком, в пределах [−180; 180). */
export const shortWay = (a: number, b: number): number => ((((a - b) % 360) + 540) % 360) - 180;

/** Насколько два угла отстоят друг от друга — кратчайшей дугой, без знака. */
export const apart = (a: number, b: number): number => Math.abs(shortWay(a, b));
