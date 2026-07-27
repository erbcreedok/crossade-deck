// Порядок автораздачи и сбора карт. Чистая логика; таймер и анимация — снаружи.

/** 2 карты в секунду. */
export const AUTO_DEAL_INTERVAL_MS = 500;

// От соседа дилера (слева / следующий по кругу), дилер последний.
export function dealOrder(seatIds: readonly string[], dealerId: string): string[] {
  if (seatIds.length === 0) return [];
  const ids = [...seatIds];
  const di = ids.indexOf(dealerId);
  if (di < 0) return ids;
  const start = (di + 1) % ids.length;
  const order: string[] = [];
  for (let k = 0; k < ids.length; k++) {
    order.push(ids[(start + k) % ids.length]!);
  }
  return order;
}

// По две карты игроку, затем следующему по кругу — целыми ПАРНЫМИ раундами (каждый
// такой раунд раздаёт ВСЕМ поровну, по 2). Остаток меньше парного раунда (< 2×игроков)
// дораздаётся по кругу ПО ОДНОЙ, с первого в очереди — иначе при total, кратном числу
// игроков, но НЕЧЁТНОМ на игрока (36 на 4 = 9 каждому), парная раздача переходит в
// последний неполный раунд и раздаёт лишнюю пару первым двум подряд вместо одной карты
// каждому: было 10/10/8/8 вместо 9/9/9/9.
export function autoDealPlan(order: readonly string[], total: number): string[] {
  if (order.length === 0 || total <= 0) return [];
  const n = order.length;
  const plan: string[] = [];
  const pairRounds = Math.floor(total / (2 * n));
  for (let r = 0; r < pairRounds; r++) {
    for (const id of order) plan.push(id, id);
  }
  let oi = 0;
  while (plan.length < total) {
    plan.push(order[oi % n]!);
    oi += 1;
  }
  return plan;
}

// Порядок сбора карт живёт на СЕРВЕРЕ (handRules.collectOrder): он же его и рассылает
// в hands_collected/deck_reset, клиент только проигрывает присланный порядок.
