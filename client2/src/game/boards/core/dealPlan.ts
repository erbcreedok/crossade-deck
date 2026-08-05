// РАСПИСАНИЕ АВТОРАЗДАЧИ — чистая функция: кому и С КАКОЙ ЗАДЕРЖКОЙ летит карта. Правило владельца:
// раздаём ВСЕГДА по две карты каждому занятому месту (пустые пропускаются), пара летит почти
// синхронно («вшик-вшик»), следующему игроку — с паузой после первого. Дилеру — последним
// (тот же канон, что у deal в смарт-моке).

export interface DealStep {
  seat: string;
  /** Секунды от старта раздачи до вылета ЭТОЙ карты. */
  delay: number;
}

export const DEAL_PAIR_GAP = 0.09; // вторая карта пары — почти сразу («вшик-вшик»)
export const DEAL_SEAT_GAP = 0.26; // следующий игрок — с ощутимой паузой

export interface DealSeat {
  id: string;
  occupant: string | null;
}

/** Порядок раздачи: по кругу от следующего за дилером, дилер последним; пустые стулья выпадают. */
export function dealOrder(seats: readonly DealSeat[], dealer: string): string[] {
  const ids = seats.map((s) => s.id);
  const from = Math.max(0, ids.indexOf(dealer));
  const ring = ids.map((_, k) => seats[(from + 1 + k) % seats.length]!);
  return ring.filter((s) => s.occupant !== null).map((s) => s.id);
}

export function autoDealPlan(seats: readonly DealSeat[], dealer: string, each = 2): DealStep[] {
  const order = dealOrder(seats, dealer);
  const steps: DealStep[] = [];
  order.forEach((seat, i) => {
    for (let c = 0; c < each; c++) steps.push({ seat, delay: i * DEAL_SEAT_GAP + c * DEAL_PAIR_GAP });
  });
  return steps;
}
