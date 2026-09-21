// СБОРКА КЛИЕНТА СТОЛА ЗАРАНЕЕ — для хоста, где сервер только раздаёт готовую папку
// (`TABLE_CLIENT_DIR`), а исходников клиента и esbuild в образе нет.
//
//   npm run build:table-client            → server/dist/table-client
//   npm run build:table-client -- <папка>

import { resolve } from "path";
import { buildClient } from "../src/table/clientBundle.js";

const dir = resolve(process.argv[2] ?? "dist/table-client");
await buildClient(dir);
console.log(`клиент стола собран: ${dir}`);
