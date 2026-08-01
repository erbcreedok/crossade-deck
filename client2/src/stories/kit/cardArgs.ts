import type { Card, CardOptions, RestState } from "../../game/ui/Card";
import type { CardBackId } from "../../game/cardBack";
import { CUSTOM_FACE_IDS, type FaceStyle } from "../../game/engine/cardTextures";
import type { ArgTypeEntry } from "../harness/paramArgs";
import type { ApplyPlan } from "../harness/argApply";
import { pickSpecs, type ArgSpec } from "../harness/argSpec";

// ПОЛНАЯ карта опций карты — то самое место, которого в проекте не хватало. Сегодня «что у карты
// есть» размазано по трём слоям: опции конструктора (CardOptions), изменяемые поля времени
// выполнения (state/concealed/faceUp/peekBob) и способности-интерфейсы (engine/element.ts). Ни в
// одном месте это не перечислено, и разобраться можно только чтением Card.ts на 476 строк.
//
// Ключевое свойство файла — `satisfies Record<keyof CardOptions, …>` внизу. Он ломает `tsc`, если
// у Card появилась опция, не описанная тут, ИЛИ если описана исчезнувшая. То есть каталог не может
// молча разойтись с кодом: расхождение становится ошибкой сборки, а не сюрпризом через полгода.
//
// Эксгаустивный модуль в репозитории РОВНО ОДИН. Стори берут подмножества через pickArgs() —
// повторить этот приём в каждой стори значило бы платить правкой N файлов за каждую новую опцию,
// и вот это уже была бы ловушка сопровождения, а не подпорка.

/** Аргументы стори карты: те же имена, что у опций — путаницы «как это называется» не возникает. */
export type CardArgs = {
  [K in keyof CardOptions]-?: CardOptions[K];
};

export type CardArgSpec = ArgSpec<Card, CardArgs>;

const BACKS: CardBackId[] = ["ruby", "mosaic", "emerald", "amethyst", "ember", "steel", "sunburst", "bubble"];
const REST: RestState[] = ["idle", "floating", "held"];
const FACE_STYLES: FaceStyle[] = ["pips", "symbol"];

type Control = Omit<ArgTypeEntry, "name">;

function sel(options: string[]): Control {
  return { control: { type: "select" }, options };
}
function bool(): Control {
  return { control: { type: "boolean" } };
}

export const CARD_ARGS = {
  // ——— идентичность ———
  id: {
    argType: false, // ключ адресации, а не внешний вид: крутить его в панели бессмысленно
    label: "ключ карты",
    apply: "rebuild",
    hint: "опаковый КЛЮЧ карты; по нему её адресуют и анимируют. Значение — отдельно, см. card",
  },
  card: {
    // Именно текст, а не выбор из 52 вариантов: карта живёт и с придержанным значением (""),
    // и с кастом-лицом — список вариантов тут врал бы о допустимом множестве.
    argType: { control: { type: "text" } },
    label: "значение (ранг+масть)",
    apply: (c, v) => c.setValue(String(v ?? "")),
    hint: '«A♠», «10♥». Пустая строка — значение ПРИДЕРЖАНО (сервер его ещё не раскрыл), карта маскируется',
  },
  tags: {
    argType: false, // множество строк; контролом не выразить, а игровые теги задаёт игра, не стенд
    label: "игровые теги",
    apply: "rebuild",
    hint: "игровые теги поверх авто (card/suit:♦/rank:7/color:red): role:trump, team:blue",
  },

  // ——— что видно ———
  faceUp: {
    argType: bool(),
    label: "лицом вверх",
    // Живьём — настоящим переворотом (0.45 с), а не подменой текстуры: иначе каталог показывал бы
    // мгновенную смену, которой в игре не бывает. Непереворачиваемая карта требует пересборки.
    apply: (c, v) => (c.faceUp === Boolean(v) ? undefined : c.requestFlip() ? undefined : "rebuild"),
    hint: "лицо или рубашка. У flippable:false переворот запрещён — тогда только пересборкой",
  },
  hidden: {
    argType: bool(),
    label: "скрыта (режим секретности)",
    apply: (c, v) => c.setConcealed(Boolean(v)),
    hint: "РЕЖИМ секретности: значение объявлено секретным, лицо ЗАМЕНЯЕТСЯ чистым фоном под пылью. Не путать с censored",
  },
  censored: {
    argType: bool(),
    label: "зацензурена (фильтр-пыль)",
    apply: (c, v) => c.setCensored(Boolean(v)),
    hint: "ФИЛЬТР: настоящее лицо рисуется как есть, «TG-пыль» ложится ПОВЕРХ него. Работает на любом лице — числовом, джокере, каком угодно",
  },
  back: {
    argType: sel(BACKS),
    label: "рубашка",
    apply: "rebuild", // текстура печётся при создании
    hint: "скин рубашки, 8 штук (cardBack.ts)",
  },
  faceStyle: {
    argType: sel(FACE_STYLES),
    label: "стиль лица",
    apply: "rebuild",
    hint: "pips — классическая раскладка значков; symbol — один крупный знак масти",
  },
  fourColor: {
    argType: bool(),
    label: "4-цветная колода",
    apply: "rebuild",
    hint: "у каждой масти свой цвет, а не только красный/чёрный",
  },
  custom: {
    // Список берём ИЗ РЕЕСТРА, а не переписываем рядом: иначе новое кастом-лицо появлялось бы в
    // движке и молча отсутствовало в каталоге — ровно то расхождение, ради которого он заведён.
    argType: sel(["", ...CUSTOM_FACE_IDS]),
    label: "кастом-лицо",
    apply: "rebuild",
    hint: "id лица из реестра CUSTOM_FACES (joker / joker-bw / finger); пустая строка — обычное лицо по рангу",
  },
  torn: {
    argType: bool(),
    label: "порванная",
    apply: "rebuild",
    hint: "накладывает зигзаг разрыва поверх лица",
  },

  // ——— размер и план ———
  size: {
    argType: { control: { type: "range", min: 0.4, max: 1.6, step: 0.05 } },
    label: "размер ×",
    apply: "rebuild", // базовый масштаб зашит в текстуру и в габарит
    hint: "множитель размера поверх базового; на габарит витрины влияет сразу",
  },
  rest: {
    argType: sel(REST),
    label: "план покоя",
    apply: "rebuild",
    hint: "idle — лежит на столе; floating — левитирует («в руке»), сама покачивается; held — её держат",
  },

  // ——— способности (ISP-интерфейсы из engine/element.ts) ———
  draggable: {
    argType: bool(),
    label: "можно тащить",
    apply: "rebuild", // способность фиксируется конструктором
    hint: "Draggable. false — драг отбивается «стоп»-качанием (blockNudge), карта остаётся на месте",
  },
  flippable: {
    argType: bool(),
    label: "переворачивается",
    apply: "rebuild",
    hint: "Flippable. false — рисуется замок, requestFlip() всегда возвращает false",
  },
} satisfies Record<keyof CardOptions, CardArgSpec>;

export type CardArgKey = keyof typeof CARD_ARGS;

/** Подмножество опций карты для конкретной стори (механика — harness/argSpec.pickSpecs). */
export function pickArgs<K extends CardArgKey>(
  keys: readonly K[],
): { argTypes: Record<string, ArgTypeEntry>; apply: ApplyPlan<Card, Pick<CardArgs, K>> } {
  return pickSpecs<Card, CardArgs, K>(CARD_ARGS, keys);
}
