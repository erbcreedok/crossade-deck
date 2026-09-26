// Файл как текст (`import x from "./file?raw"`) — так тесты клиента читают страницу, не зная о Node.
declare module "*?raw" {
  const text: string;
  export default text;
}
