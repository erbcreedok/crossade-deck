// КТО ЧТО МОЖЕТ ЗА СТОЛОМ — таблица, а не кнопки.
//
// Кнопки в списке игроков, в чужом профиле и в настройках комнаты РАЗНЫЕ у разных людей, и если
// каждый экран решит это сам, три экрана разойдутся в первый же день: в списке кик будет, в
// профиле нет, а сервер пустит обоих. Поэтому решение живёт здесь одним списком правил, а экраны
// только рисуют то, что им вернули.
//
// ЭТОТ ФАЙЛ — ЧЕРНОВИК СЕРВЕРНОЙ ПРОВЕРКИ. Сегодня он красит кнопки, завтра тот же список решает,
// пускать ли сообщение в комнату. Право, которое проверяет только клиент, — это не право, а
// надпись; поэтому правило должно быть выражено так, чтобы его можно было выполнить без экрана:
// (кто я, кто он, какая комната) → можно или нет, и почему нет.

(function () {
  /** Роли за столом. Спектатор — это «без стула», а не «наблюдатель в отдельном списке». */
  const ROLES = ["оунер", "админ", "игрок", "зритель"];

  /**
   * КТО В КОМНАТЕ РЕШАЕТ. Это режим комнаты, а НЕ роль: «все админы» и «демократия» — разные
   * ответы на вопрос «кто нажимает», при тех же четырёх ролях. Иначе пришлось бы заводить роль
   * «хаос», и она конфликтовала бы со всеми остальными.
   */
  const MODES = ["оунер решает", "оунер и админы", "все админы", "демократия"];

  /**
   * Сила голоса на этом столе: «полная» — оунер, «админ» — управляет людьми, «предложение» —
   * может только предложить и ждать голосов, «нет» — только собой.
   */
  function power(me, room) {
    if (me.role === "оунер") return "полная";
    if (room.mode === "демократия") return me.role === "зритель" ? "нет" : "предложение";
    if (room.mode === "все админы") return me.role === "зритель" ? "нет" : "админ";
    if (room.mode === "оунер и админы") return me.role === "админ" ? "админ" : "нет";
    return "нет"; // «оунер решает»
  }

  /** Может ли распоряжаться людьми — прямо или через голосование. */
  const manages = (p) => p === "полная" || p === "админ" || p === "предложение";

  /**
   * ПРАВИЛА. Каждое — это `may(me, them, room, power)`, вернувшее либо `true`, либо ПРИЧИНУ отказа
   * словами. Причина обязательна: кнопка, пропавшая молча, читается как поломка, а не как запрет,
   * и первым делом про неё спрашивают «почему у меня нет кика».
   */
  const RULES = [
    {
      id: "profile", label: "Профиль", where: ["list"], kind: "quiet",
      may: () => true,
    },
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
    {
      id: "colour", label: "Сменить цвет", where: ["list", "profile"], kind: "",
      // СВОЙ ЦВЕТ МЕНЯЕТ КАЖДЫЙ. Чужой — тот, кто распоряжается: цвет за столом это не украшение,
      // а способ отличить людей, и два одинаковых чинит тот, кто может.
      may: (me, them, room, p) => them.mine || manages(p) || "чужой цвет меняет тот, кто распоряжается",
    },
    {
      id: "seat:give", label: "Дать стул", where: ["list", "profile"], kind: "gold",
      may: (me, them, room, p) => them.seat ? "он уже за столом" : manages(p) || "мест не раздаёшь",
    },
    {
      id: "seat:take", label: "Лишить стула", where: ["list", "profile"], kind: "",
      // ОУНЕРА МОЖНО ЛИШИТЬ СТУЛА — по решению владельца оунер защищён только от кика и от снятия
      // админки. Стул, лок, пин и скрытность ему меняют, как всем.
      may: (me, them, room, p) => !them.seat ? "он и так без стула" : them.mine ? "со своего встают сами" : manages(p) || "местами не распоряжаешься",
    },
    {
      id: "admin:grant", label: "Дать админа", where: ["list", "profile"], kind: "",
      may: (me, them, room, p) => them.role !== "игрок" && them.role !== "зритель" ? "он уже с правами" : manages(p) || "правами не делишься",
    },
    {
      id: "admin:revoke", label: "Забрать админа", where: ["list", "profile"], kind: "",
      may: (me, them, room, p) => them.role === "оунер" ? "оунера нельзя разжаловать" : them.role !== "админ" ? "он не админ" : manages(p) || "правами не распоряжаешься",
    },
    {
      id: "kick", label: "Выгнать", where: ["list", "profile"], kind: "danger",
      may: (me, them, room, p) => them.role === "оунер" ? "оунера нельзя выгнать" : them.mine ? "себя выгоняют кнопкой «выйти»" : manages(p) || "выгонять некому",
    },
    {
      id: "piece:lock", label: "Лок фигур", where: ["profile"], kind: "",
      may: (me, them, room, p) => them.mine || manages(p) || "чужими фигурами распоряжается админ",
    },
    {
      id: "piece:pin", label: "Пин фигур", where: ["profile"], kind: "",
      may: (me, them, room, p) => them.mine || manages(p) || "чужими фигурами распоряжается админ",
    },
    {
      id: "piece:hide", label: "Скрытность", where: ["profile"], kind: "",
      may: (me, them, room, p) => them.mine || manages(p) || "чужими фигурами распоряжается админ",
    },
    {
      id: "owner:pass", label: "Передать комнату", where: ["profile"], kind: "danger",
      may: (me, them, room, p) => p !== "полная" ? "комнату передаёт только оунер" : them.mine ? "она и так твоя" : them.role === "зритель" ? "сначала посади его" : true,
    },
    // ---- КОМНАТА ----
    {
      id: "room:code", label: "Сменить код", where: ["room"], kind: "",
      may: (me, them, room, p) => manages(p) || "код меняет тот, кто распоряжается",
    },
    {
      id: "room:public", label: "Видимость", where: ["room"], kind: "",
      may: (me, them, room, p) => manages(p) || "видимость меняет тот, кто распоряжается",
    },
    {
      id: "room:access", label: "Допуск", where: ["room"], kind: "",
      may: (me, them, room, p) => manages(p) || "допуск меняет тот, кто распоряжается",
    },
    {
      id: "room:mode", label: "Кто решает", where: ["room"], kind: "",
      // РЕЖИМ РЕШЕНИЙ МЕНЯЕТ ТОЛЬКО ОУНЕР. Иначе «все админы» — билет в один конец: любой
      // переключает комнату в хаос, и обратно её уже никто не вернёт.
      may: (me, them, room, p) => p === "полная" || "режим меняет только оунер",
    },
    {
      id: "room:forever", label: "Вечная комната", where: ["room"], kind: "",
      may: (me, them, room, p) => p === "полная" || "вечность решает оунер",
    },
    {
      id: "room:link", label: "Ссылка", where: ["room"], kind: "gold",
      may: () => true,
    },
    {
      id: "room:close", label: "Закрыть комнату", where: ["room"], kind: "danger",
      may: (me, them, room, p) => p === "полная" || "комнату закрывает оунер",
    },
  ];

  /**
   * Что можно сделать на экране `where` — список кнопок в том порядке, в каком они объявлены, и
   * рядом список запрещённого с причинами (экран может показать его или смолчать, но причина
   * посчитана, а не придумана на месте).
   *
   * В демократии разрешённое действие остаётся разрешённым, но становится ПРЕДЛОЖЕНИЕМ: та же
   * кнопка, другое слово и другое последствие.
   */
  function actionsOn(where, me, them, room) {
    const p = power(me, room);
    const can = [];
    const cant = [];
    for (const rule of RULES) {
      if (!rule.where.includes(where)) continue;
      const verdict = rule.may(me, them, room, p);
      if (verdict === true) {
        const vote = p === "предложение" && rule.id !== "profile" && !rule.id.startsWith("friend") && !(them.mine && rule.id === "colour") && rule.id !== "room:link";
        can.push({ id: rule.id, label: vote ? `Предложить: ${rule.label.toLowerCase()}` : rule.label, kind: rule.kind, vote });
      } else {
        cant.push({ id: rule.id, label: rule.label, why: verdict });
      }
    }
    return { power: p, can, cant };
  }

  window.Rights = { ROLES, MODES, power, actionsOn, RULES };
})();
