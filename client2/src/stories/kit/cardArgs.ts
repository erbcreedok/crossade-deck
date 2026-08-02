import type { Card, CardOptions, Pose } from "../../game/ui/Card";
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
const REST: Pose[] = ["rest", "lifted", "held"];
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
    // Не действует при кастом-лице: там ранг и масть не рисуются вовсе.
    argType: { control: { type: "text" }, if: { arg: "custom", eq: "" } },
    label: "значение (ранг+масть)",
    apply: (c, v) => c.setValue(String(v ?? "")),
    hint: '«A♠», «10♥». Масть можно набрать заглавной буквой: S H D C («AS» = «A♠», «10H» = «10♥») — символ с клавиатуры не набирается, а движок всё равно хранит символ. Пустая строка — значение ПРИДЕРЖАНО (сервер его ещё не раскрыл), карта маскируется',
  },
  selected: {
    argType: { control: { type: "boolean" } },
    label: "выделена",
    apply: (c, v) => c.setSelected(Boolean(v)),
    hint: "контур набора (метка outline). Вторая метка выделения — ПОДЪЁМ со стола (pose: lifted), она самостоятельна: набор бывает поднятым без контура и наоборот",
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
    // Рубашку видно только когда карта лежит рубашкой вверх.
    argType: { ...sel(BACKS), if: { arg: "faceUp", truthy: false } },
    label: "рубашка",
    apply: "rebuild", // текстура печётся при создании
    hint: "скин рубашки, 8 штук (cardBack.ts)",
  },
  faceStyle: {
    // Стиль лица не виден ни у кастом-лица, ни у карты рубашкой вверх.
    argType: { ...sel(FACE_STYLES), if: { arg: "custom", eq: "" } },
    label: "стиль лица",
    apply: "rebuild",
    hint: "pips — классическая раскладка значков; symbol — один крупный знак масти",
  },
  fourColor: {
    argType: { ...bool(), if: { arg: "custom", eq: "" } },
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
  z: {
    argType: { control: { type: "range", min: 0, max: 1, step: 0.02 } },
    label: "высота над столом",
    apply: (c, v) => c.setZ(Number(v)),
    hint: "ось z (ui/elevation.ts). У всего, что ЛЕЖИТ на столе — 0. Складывается с позой покоя: удерживаемая карта с z=0.2 выше обычной удерживаемой. Показывается размером и тенью — других признаков высоты у плоской картинки нет",
  },
  pose: {
    argType: sel(REST),
    label: "поза покоя",
    apply: "rebuild",
    hint: "где предмет находится: на столе, поднят над ним или его держат. Задаёт слой отрисовки, размер и тень",
  },
  idle: {
    argType: bool(),
    label: "дышит в покое",
    apply: "rebuild",
    hint: "покачивание на месте — АНИМАЦИЯ, а не поза: доступна в любой позе, поднятая карта имеет её по умолчанию. Размера не меняет, поэтому высотой не считается и тень на неё не реагирует",
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
