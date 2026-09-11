// КТО ЧТО МОЖЕТ — таблица, а не кнопки.
//
// Решение живёт здесь одним списком правил, а экраны только рисуют то, что им вернули. Если каждое
// место решит само, места разойдутся в первый же день: в списке кик есть, в тултипе нет, а сервер
// пустит обоих.
//
// ТРИ РАЗНЫХ МЕСТА, И ЭТО НЕ ОДНО И ТО ЖЕ:
//
//   "table"   — управление ЧЕЛОВЕКОМ ЗА ЭТИМ СТОЛОМ: стул, права, лок/пин/скрыть, кик.
//               Живёт в ДВУХ местах сразу — в раскрытой строке списка и в тултипе у аватара на
//               сукне, — и потому не может принадлежать ни одному из них.
//   "profile" — то, что про ЧЕЛОВЕКА, а не про стол: дружба. Страница профиля существует в вакууме
//               (из хаба, по ссылке, из чужой игры), и стола вокруг неё может не быть вовсе.
//   "room"    — сама комната: код, видимость, допуск, режим решений, вечность.
//
// ЭТОТ ФАЙЛ — ЧЕРНОВИК СЕРВЕРНОЙ ПРОВЕРКИ. Право, которое проверяет только клиент, — это надпись, а
// не право; поэтому правило написано так, чтобы его можно было выполнить без экрана: (кто я, кто
// он, какая комната) → можно или нет, и почему нет.

(function () {
  /** Роли за столом. Зритель — это «без стула», а не отдельный список наблюдателей. */
  const ROLES = ["оунер", "админ", "игрок", "зритель"];

  /**
   * КТО В КОМНАТЕ РЕШАЕТ — режим комнаты, а НЕ роль: «все админы» и «демократия» это разные ответы
   * на вопрос «кто нажимает» при тех же четырёх ролях.
   */
  const MODES = ["оунер решает", "оунер и админы", "все админы", "демократия"];

  function power(me, room) {
    if (me.role === "оунер") return "полная";
    if (room.mode === "демократия") return me.role === "зритель" ? "нет" : "предложение";
    if (room.mode === "все админы") return me.role === "зритель" ? "нет" : "админ";
    if (room.mode === "оунер и админы") return me.role === "админ" ? "админ" : "нет";
    return "нет"; // «оунер решает»
  }

  /** Распоряжается людьми — прямо или через голосование. */
  const manages = (p) => p === "полная" || p === "админ" || p === "предложение";

  /**
   * Каждое правило — `may(me, them, room, power)`, вернувшее `true` либо ПРИЧИНУ отказа словами.
   * Причина обязательна: кнопка, пропавшая молча, читается как поломка, и первым делом про неё
   * спрашивают «почему у меня нет кика».
   */
  const RULES = [
    // ---- ЧЕЛОВЕК ЗА ЭТИМ СТОЛОМ ----
    {
      id: "piece:lock", label: "Лок", where: ["table"], kind: "",
      may: (me, them, room, p) => them.mine || manages(p) || "чужими фигурами распоряжается админ",
    },
    {
      id: "piece:pin", label: "Пин", where: ["table"], kind: "",
      may: (me, them, room, p) => them.mine || manages(p) || "чужими фигурами распоряжается админ",
    },
    {
      id: "piece:hide", label: "Скрытность", where: ["table"], kind: "",
      may: (me, them, room, p) => them.mine || manages(p) || "чужими фигурами распоряжается админ",
    },
    {
      id: "colour", label: "Сменить цвет", where: ["table"], kind: "",
      // СВОЙ ЦВЕТ МЕНЯЕТ КАЖДЫЙ. Чужой — тот, кто распоряжается: цвет за столом это не украшение, а
      // способ отличить людей, и два одинаковых чинит тот, кто может.
      may: (me, them, room, p) => them.mine || manages(p) || "чужой цвет меняет тот, кто распоряжается",
    },
    {
      id: "seat:give", label: "Дать стул", where: ["table"], kind: "gold",
      may: (me, them, room, p) => them.seat ? "он уже за столом" : manages(p) || "мест не раздаёшь",
    },
    {
      id: "seat:take", label: "Лишить стула", where: ["table"], kind: "",
      // ОУНЕРА МОЖНО ЛИШИТЬ СТУЛА: он защищён только от кика и от снятия админки.
      may: (me, them, room, p) => !them.seat ? "он и так без стула" : them.mine ? "со своего встают сами" : manages(p) || "местами не распоряжаешься",
    },
    {
      id: "admin:grant", label: "Дать админа", where: ["table"], kind: "",
      may: (me, them, room, p) => them.role !== "игрок" && them.role !== "зритель" ? "он уже с правами" : manages(p) || "правами не делишься",
    },
    {
      id: "admin:revoke", label: "Забрать админа", where: ["table"], kind: "",
      may: (me, them, room, p) => them.role === "оунер" ? "оунера нельзя разжаловать" : them.role !== "админ" ? "он не админ" : manages(p) || "правами не распоряжаешься",
    },
    {
      id: "owner:pass", label: "Передать комнату", where: ["table"], kind: "danger",
      may: (me, them, room, p) => p !== "полная" ? "комнату передаёт только оунер" : them.mine ? "она и так твоя" : them.role === "зритель" ? "сначала посади его" : true,
    },
    {
      id: "kick", label: "Выгнать", where: ["table"], kind: "danger",
      may: (me, them, room, p) => them.role === "оунер" ? "оунера нельзя выгнать" : them.mine ? "себя выгоняют кнопкой «выйти»" : manages(p) || "выгонять некому",
    },

    // ---- ЧЕЛОВЕК САМ ПО СЕБЕ ----
    {
      id: "friend:add", label: "В друзья", where: ["profile"], kind: "gold",
      may: (me, them) => them.mine ? "это ты" : them.friend === "никто" || "заявка уже есть",
    },
    {
      id: "friend:accept", label: "Принять заявку", where: ["profile"], kind: "gold",
      may: (me, them) => them.friend === "входящий" || "он не звал",
    },
    {
      id: "friend:decline", label: "Отклонить", where: ["profile"], kind: "quiet",
      may: (me, them) => them.friend === "входящий" || "он не звал",
    },
    {
      id: "friend:cancel", label: "Отозвать заявку", where: ["profile"], kind: "quiet",
      may: (me, them) => them.friend === "исходящий" || "заявки нет",
    },
    {
      id: "friend:drop", label: "Убрать из друзей", where: ["profile"], kind: "quiet",
      may: (me, them) => them.friend === "друзья" || "вы не друзья",
    },

    // ---- КОМНАТА ----
    { id: "room:code", label: "Сменить код", where: ["room"], kind: "", may: (me, them, room, p) => manages(p) || "код меняет тот, кто распоряжается" },
    { id: "room:public", label: "Видимость", where: ["room"], kind: "", may: (me, them, room, p) => manages(p) || "видимость меняет тот, кто распоряжается" },
    { id: "room:access", label: "Допуск", where: ["room"], kind: "", may: (me, them, room, p) => manages(p) || "допуск меняет тот, кто распоряжается" },
    {
      id: "room:mode", label: "Кто решает", where: ["room"], kind: "",
      // РЕЖИМ МЕНЯЕТ ТОЛЬКО ОУНЕР. Иначе «все админы» — билет в один конец: любой переключает
      // комнату в хаос, и обратно её уже никто не вернёт.
      may: (me, them, room, p) => p === "полная" || "режим меняет только оунер",
    },
    { id: "room:forever", label: "Вечная комната", where: ["room"], kind: "", may: (me, them, room, p) => p === "полная" || "вечность решает оунер" },
    { id: "room:link", label: "Ссылка", where: ["room"], kind: "gold", may: () => true },
    { id: "room:close", label: "Закрыть комнату", where: ["room"], kind: "danger", may: (me, them, room, p) => p === "полная" || "комнату закрывает оунер" },
  ];

  /**
   * Что можно сделать в месте `where`, и что нельзя — с причинами.
   *
   * В демократии разрешённое остаётся разрешённым, но становится ПРЕДЛОЖЕНИЕМ: та же кнопка, другое
   * слово, другое последствие. Дружба и ссылка голосования не требуют — они не про комнату.
   */
  function actionsOn(where, me, them, room) {
    const p = power(me, room);
    const can = [];
    const cant = [];
    for (const rule of RULES) {
      if (!rule.where.includes(where)) continue;
      const verdict = rule.may(me, them, room, p);
      if (verdict === true) {
        const personal = rule.id.startsWith("friend") || rule.id === "room:link" || (them.mine && rule.id !== "kick");
        const vote = p === "предложение" && !personal;
        can.push({ id: rule.id, label: vote ? `Предложить: ${rule.label.toLowerCase()}` : rule.label, kind: rule.kind, vote });
      } else {
        cant.push({ id: rule.id, label: rule.label, why: verdict });
      }
    }
    return { power: p, can, cant };
  }

  window.Rights = { ROLES, MODES, power, actionsOn, RULES };
})();
