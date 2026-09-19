import { createApp } from "./app.js";
import { formatVersion } from "./version.js";
import { startBeacon } from "./table/routes.js";
import { sweepJournal } from "./db/eventsRepo.js";

const { httpServer } = createApp();

const PORT = Number(process.env.PORT) || 2567;
httpServer.listen(PORT, () => {
  console.log(`Crossade Deck ${formatVersion()} server listening on :${PORT}`);
  startBeacon();
  sweepJournal();
});
