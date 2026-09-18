// ЗАДЕРЖКА СЕТИ ДЛЯ ПРОГОНОВ — прокси, придерживающий каждый кусок на LAG мс.
//
// ЗАЧЕМ. На локалхосте ответ стола приходит за миллисекунду, и целый класс ошибок не виден вовсе:
// пока летит ответ, экран живёт своей догадкой, и если догадка расходится со столом — на телефоне это
// секунда чужой позы, а в прогоне ноль. Так пряталось двойное движение круга.
//
//   LAG=250 node scripts/lag.mjs           (в соседнем окне, стол на 2597)
//   node scripts/tableRing.mjs http://localhost:2598
import net from "net";

const LAG = Number(process.env.LAG ?? 250);
const TO = Number(process.env.TO ?? 2597);
const ON = Number(process.env.ON ?? 2598);

net.createServer((from) => {
  const to = net.connect(TO, "127.0.0.1");
  // ЗАКРЫВАТЬ — ПОСЛЕ всех задержанных кусков. Иначе хвост ответа теряется и страница приезжает
  // обрезанной: выглядит как «жест не берёт карту», а дело в прокси.
  const pipe = (a, b) => {
    a.on("data", (chunk) => setTimeout(() => b.write(chunk), LAG));
    for (const end of ["close", "error"]) a.on(end, () => setTimeout(() => b.end(), LAG * 2));
  };
  pipe(from, to);
  pipe(to, from);
}).listen(ON, () => console.log(`задержка ${LAG} мс: :${ON} → :${TO}`));
