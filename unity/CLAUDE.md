# Crossade — Unity client

The installable client of the card table: Unity 6 (`6000.0.75f1`), C#. It sits at the SAME table as the
Telegram mini-app (`server/table-client/`) — same Colyseus room `table_room`, same intents, same patches.
The two clients do not share code and do not have to look alike; they share the server and the
protocol, and nothing else.

## The protocol is the server's, and a fixture keeps it honest

`Assets/Crossade/Wire/Contract.cs` repeats `server/src/table/contract.ts` by hand. What stops it from
drifting is `Assets/Tests/Editor/Fixtures/wire.json`, written by the SERVER
(`server/src/table/wireFixture.test.ts`): a real `Table` run through a script, and for each viewer the
first snapshot, every patch and the last snapshot. `WireTests` folds the patches with the C# code
(`Table/Patching.cs`, a port of `patch.ts`) and compares with the server's last snapshot, and reads
every snapshot into types and back — a field C# does not know is lost on the way and the test fails.

When the server changes the wire, its own test fails first:

```bash
cd server && UPDATE_WIRE=1 npx vitest run src/table/wireFixture.test.ts   # rewrite the fixture
```

then the Unity tests say what to fix in C#.

## Running

```bash
U=/Applications/Unity/Hub/Editor/6000.0.75f1/Unity.app/Contents/MacOS/Unity
$U -batchmode -nographics -projectPath unity -runTests -testPlatform EditMode -testResults /tmp/unity-tests.xml
```

Exit code 0 — green; 2 — a test failed (details in the XML).
