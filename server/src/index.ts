import { createApp } from "./app.js";
import { formatVersion } from "./version.js";

const { httpServer } = createApp();

const PORT = Number(process.env.PORT) || 2567;
httpServer.listen(PORT, () => {
  console.log(`Crossade Deck ${formatVersion()} server listening on :${PORT}`);
});
