// ВСЕ ЭМОДЗИ КЛАВИАТУРЫ — из `emoji-test.txt` Unicode, в его порядке. Только полные формы, без оттенков кожи и
// не новее `MAX_VERSION`: более новые телефон в Telegram рисует пустым квадратом.
//   curl -sL https://unicode.org/Public/emoji/latest/emoji-test.txt -o emoji-test.txt
//   node scripts/genEmoji.mjs emoji-test.txt > src/table/emoji.ts
import { readFileSync } from "fs";

const MAX_VERSION = 14.0;
const text = readFileSync(process.argv[2], "utf8");
const out = [];
let group = "";
for (const line of text.split("\n")) {
  const g = line.match(/^# group: (.+)$/);
  if (g) group = g[1];
  if (group === "Component") continue;
  const m = line.match(/^([0-9A-F ]+?)\s*; fully-qualified\s*# (\S+) E(\d+\.\d+)/);
  if (!m) continue;
  const cps = m[1].split(" ").map((h) => parseInt(h, 16));
  if (cps.some((c) => c >= 0x1f3fb && c <= 0x1f3ff)) continue;
  if (Number(m[3]) > MAX_VERSION) continue;
  out.push(String.fromCodePoint(...cps));
}
console.log(`// СГЕНЕРИРОВАНО scripts/genEmoji.mjs из Unicode emoji-test.txt — руками не править.\n\n/** Все эмодзи клавиатуры, в порядке Unicode: смайлы, люди, животные, еда, места, дела, предметы, символы, флаги. */\nexport const EMOJI: readonly string[] = ${JSON.stringify(out)};`);
