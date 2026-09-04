export type Game = "cards" | "chess" | "nardy";

export const GAMES: Record<Game, string> = {
  cards: "Карты",
  chess: "Шахматы",
  nardy: "Нарды",
};

export const GAME_COMMANDS: Record<string, Game> = {
  cards: "cards",
  chess: "chess",
  nardy: "nardy",
};
