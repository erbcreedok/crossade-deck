import type { Card, CardOptions, RestState } from "../../game/ui/Card";
import type { CardBackId } from "../../game/cardBack";
import type { FaceStyle } from "../../game/engine/cardTextures";
import type { ArgTypeEntry } from "../harness/paramArgs";
import type { Applier, ApplyPlan } from "../harness/argApply";

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

export interface CardArgSpec {
  /** Контрол в панели. `false` — опция сознательно НЕ крутится (см. комментарии ниже). */
  argType: ArgTypeEntry | false;
  /** Как применить правку: живой сеттер или «пересобрать сцену» (см. harness/argApply.ts). */
  apply: Applier<Card, CardArgs> | "rebuild";
  /** Одной строкой: что опция делает. Идёт в описание контрола — это и есть «шпаргалка по карте». */
  hint: string;
}

const BACKS: CardBackId[] = ["ruby", "mosaic", "emerald", "amethyst", "ember", "steel", "sunburst", "bubble"];
const REST: RestState[] = ["idle", "floating", "held"];
const FACE_STYLES: FaceStyle[] = ["pips", "symbol"];

function sel(name: string, options: string[]): ArgTypeEntry {
  return { name, control: { type: "select" }, options };
}
function bool(name: string): ArgTypeEntry {
  return { name, control: { type: "boolean" } };
}

export const CARD_ARGS = {
  // ——— идентичность ———
  id: {
    argType: false, // ключ адресации, а не внешний вид: крутить его в панели бессмысленно
    apply: "rebuild",
    hint: "опаковый КЛЮЧ карты; по нему её адресуют и анимируют. Значение — отдельно, см. card",
  },
  card: {
    // Именно текст, а не выбор из 52 вариантов: карта живёт и с придержанным значением (""),
    // и с кастом-лицом — список вариантов тут врал бы о допустимом множестве.
    argType: { name: "значение (ранг+масть)", control: { type: "text" } },
    apply: (c, v) => c.setValue(String(v ?? "")),
    hint: '«A♠», «10♥». Пустая строка — значение ПРИДЕРЖАНО (сервер его ещё не раскрыл), карта маскируется',
  },
  tags: {
    argType: false, // множество строк; контролом не выразить, а игровые теги задаёт игра, не стенд
    apply: "rebuild",
    hint: "игровые теги поверх авто (card/suit:♦/rank:7/color:red): role:trump, team:blue",
  },

  // ——— что видно ———
  faceUp: {
    argType: bool("лицом вверх"),
    // Живьём — настоящим переворотом (0.45 с), а не подменой текстуры: иначе каталог показывал бы
    // мгновенную смену, которой в игре не бывает. Непереворачиваемая карта требует пересборки.
    apply: (c, v) => (c.faceUp === Boolean(v) ? undefined : c.requestFlip() ? undefined : "rebuild"),
    hint: "лицо или рубашка. У flippable:false переворот запрещён — тогда только пересборкой",
  },
  hidden: {
    argType: bool("скрыта (режим секретности)"),
    apply: (c, v) => c.setConcealed(Boolean(v)),
    hint: "РЕЖИМ секретности: прячет значение реальной карты. Вид — чистый фон + живая «TG-пыль»",
  },
  back: {
    argType: sel("рубашка", BACKS),
    apply: "rebuild", // текстура печётся при создании
    hint: "скин рубашки, 8 штук (cardBack.ts)",
  },
  faceStyle: {
    argType: sel("стиль лица", FACE_STYLES),
    apply: "rebuild",
    hint: "pips — классическая раскладка значков; symbol — один крупный знак масти",
  },
  fourColor: {
    argType: bool("4-цветная колода"),
    apply: "rebuild",
    hint: "у каждой масти свой цвет, а не только красный/чёрный",
  },
  custom: {
    argType: sel("кастом-лицо", ["", "joker"]),
    apply: "rebuild",
    hint: "id лица из реестра CUSTOM_FACES; пустая строка — обычное лицо по рангу",
  },
  torn: {
    argType: bool("порванная"),
    apply: "rebuild",
    hint: "накладывает зигзаг разрыва поверх лица",
  },

  // ——— размер и план ———
  size: {
    argType: { name: "размер ×", control: { type: "range", min: 0.4, max: 1.6, step: 0.05 } },
    apply: "rebuild", // базовый масштаб зашит в текстуру и в габарит
    hint: "множитель размера поверх базового; на габарит витрины влияет сразу",
  },
  rest: {
    argType: sel("план покоя", REST),
    apply: "rebuild",
    hint: "idle — лежит на столе; floating — левитирует («в руке»), сама покачивается; held — её держат",
  },

  // ——— способности (ISP-интерфейсы из engine/element.ts) ———
  draggable: {
    argType: bool("можно тащить"),
    apply: "rebuild", // способность фиксируется конструктором
    hint: "Draggable. false — драг отбивается «стоп»-качанием (blockNudge), карта остаётся на месте",
  },
  flippable: {
    argType: bool("переворачивается"),
    apply: "rebuild",
    hint: "Flippable. false — рисуется замок, requestFlip() всегда возвращает false",
  },
} satisfies Record<keyof CardOptions, CardArgSpec>;

export type CardArgKey = keyof typeof CARD_ARGS;

/**
 * Подмножество опций для конкретной стори: argTypes для панели + план применения.
 *
 * План типизирован РОВНО выбранным подмножеством (`Pick<CardArgs, K>`), а не всей картой: иначе
 * стори, берущая пять опций, обязана была бы объявлять все четырнадцать. Приведение внутри —
 * следствие того, что Applier параметризован значением `A[keyof A]`, и сузить его снаружи нельзя;
 * снаружи же тип остаётся точным, а это единственное, что видит автор стори.
 */
export function pickArgs<K extends CardArgKey>(
  keys: readonly K[],
): { argTypes: Record<string, ArgTypeEntry>; apply: ApplyPlan<Card, Pick<CardArgs, K>> } {
  const argTypes: Record<string, ArgTypeEntry> = {};
  const apply: Record<string, CardArgSpec["apply"]> = {};
  for (const k of keys) {
    const spec: CardArgSpec = CARD_ARGS[k];
    if (spec.argType) argTypes[k] = { ...spec.argType, name: `${spec.argType.name} — ${spec.hint}` };
    apply[k] = spec.apply;
  }
  return { argTypes, apply: apply as ApplyPlan<Card, Pick<CardArgs, K>> };
}
