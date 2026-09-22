import { createApp } from "./app.js";
import { formatVersion } from "./version.js";
import { startBeacon } from "./table/routes.js";
import { closeDb } from "./db/open.js";
import { sweepJournal } from "./db/eventsRepo.js";
import { runStop } from "./shutdown.js";

const { httpServer, gameServer } = createApp();

const PORT = Number(process.env.PORT) || 2567;
httpServer.listen(PORT, () => {
  console.log(`Crossade Deck ${formatVersion()} server listening on :${PORT}`);
  // Туннель наружу умер — процесс уходит целиком (комнаты дописываются в базу), и кто его держит
  // (launchd, супервизор хоста) поднимает заново уже с новой дверью.
  const stopBeacon = startBeacon(fetch, () => void gameServer.gracefullyShutdown(true, new Error("своя дверь не отвечает")));
  sweepJournal();
  gameServer.onShutdown(() =>
    runStop([
      { name: "маяк", run: stopBeacon },
      { name: "база", run: closeDb },
    ]),
  );
});
