// МЯГКАЯ ОСТАНОВКА. На хосте каждая выкатка — это SIGTERM живому процессу. Сигнал ловит сам Colyseus:
// он закрывает комнаты (те дописывают журнал в `onDispose`) и зовёт `onShutdown` — сюда.
//
// Шаги идут ПО ПОРЯДКУ и каждый — со своей страховкой: упавший шаг не отменяет следующие.

export interface StopStep {
  name: string;
  run: () => void | Promise<void>;
}

export async function runStop(steps: readonly StopStep[], log: (line: string) => void = console.error): Promise<void> {
  for (const step of steps) {
    try {
      await step.run();
    } catch (err) {
      log(`остановка: шаг «${step.name}» упал: ${String(err)}`);
    }
  }
}
