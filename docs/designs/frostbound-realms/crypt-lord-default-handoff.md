# Default Crypt Lord activation

Author: MiYu

New skirmish games use source Crypt Lord version 1 and protocol 74. Legacy saves without the version retain version 0; Dota, RPG and TD heroes retain their existing rules. The custom-game menu uses the source Crypt Lord name and original portrait.

AI enables Carrion Beetles autocast and casts learned Locust Swarm against visible attackable enemies before considering Impale. The first AI skill build now uses its learned beetles when a nearby corpse is available. Generic battle and racial-item fixtures explicitly retain version 0.

The client enters the same reconnect state after either a remote closure or an eight-second silent timeout. Active timeout closes the transport once, clears the connected flag and schedules the hello/resume handshake; it does not depend on a subsequent transport closed event. The connected event queues hello followed immediately by create/list/resume in the transport's existing ordered queue. The welcome reply does not duplicate the request.

## Verified

- Expanded regression suite: 43 scripts, 189 PASS groups, 44751 ms, three workers. Includes completed default Altar recruitment, source/legacy identities, actual AI skill use, real TCP projection/reconnect, generated preview, skill cards, beetle morph, dynamic effects and affected generic battle fixtures.
- Generated client checks cover remote closure and silent timeout through hello/resume, same-room restoration and a single timeout close. The transport mock matches native active close by discarding pending events without emitting a closed event.
- Byte-identical Main.js and Main.mscene regeneration passed. The scene geometry/assets remain unchanged by activation.
- Independent review found and verified the source portrait binding and opponent visibility of burrowed beetles. Both are covered by the updated checks.

## Native acceptance

`scripts/qa-frost-crypt-lord-network.mjs` opens two complete native scenes, drives actual create/browse/join/ready/start and skill inputs while both clients run continuously, and uses real authoritative TCP. A controlled server clock holds effect frames for inspection. Setup uses an authored flat map and level-six hero; room creation uses the actual default rules. Each input phase waits for a later native tick that reports matching keys/buttons or mouse coordinates within 0.01 pixels before releasing. Normal server timeout, reconnect retention and backpressure limits remain enabled.

The bridge worker must remain alive until the owned editor exits, because it owns the runtime-directory cleanup listener. Test fixture reuse validates ownership, a stopped prior owner, absent discovery, unchanged scene bytes and source/destination boundaries before moving only the disposable sample. Current generated client code and game sources are refreshed.

`native-crypt-lord-network-qa.json` records passed actual menu/preview, default source hero, six skill-learning inputs, four Carapace attachments, both-client Impale, C summoning, B burrow privacy and L twenty-Locust rendering. Its overall result is false: the combined 20-second server/client observation window ended before the next resumed native frame. The trace records server hello/resume at 13.5 seconds after socket destruction; both owned editors then exited normally with runtime/discovery cleanup.

Focused replay `--reconnect-only` passed with the same production source hash and full native scenes. It exercises real network menus, seeds hero/faction selection and controls level/skill/Swarm setup. It observes authoritative reconnection separately from the subsequent native frame, retaining normal server limits. `native-crypt-lord-reconnect-qa.json` records server resume at 12037 ms, native resume at 25336 ms, the same room and twenty Locusts retained, zero console errors, both owned editors exiting normally, and fixture/runtime/discovery cleanup. Total elapsed time was 479509 ms.

`crypt-lord-default-validation.json` composes the two receipts and regression/reproduction checks against the current generated Main.js SHA-256 `d9830c5d97a70432392f1e4abc69a03e5232efc3d1348443e7f2a6f2ceae0ebc`. The first receipt's overall false result and observation timeout remain intact; completed UI/effect checks and the focused passing reconnect checks establish this milestone's acceptance. No native QA process remains running.

| Native step | Full UI/effect run (ms) | Focused reconnect run (ms) |
|---|---:|---:|
| Two-scene readiness | 130287 | 121177 |
| Menu and network setup | 397136 | 219590 |
| Learning / controlled skills | 229968 | 60316 |
| Impale | 67053 | — |
| Beetles/burrow/Swarm / controlled Swarm | 141383 | 18020 |
| Reconnect observation | 20239 (timeout) | 31466 (passed) |

Screenshots: `crypt-lord-network-host.png`, `crypt-lord-network-guest-impale.png`, `crypt-lord-network-host-locusts.png` and `crypt-lord-network-reconnected.png`. These show the authored flat native test map, not the default gameplay terrain.

`crypt-lord-native-performance.json` preserves the viewport timing sample and exact source hash before the pipelined handshake. Average viewport frame time was 844 ms, p95 2887 ms; one native viewport command was 158 ms. Whole-world JSON fingerprints, full entity normalization and ordered delta reconstruction are inspection targets, not individually profiled causes.

Original-runtime timing comparison, physical input and audio acceptance remain untested. Full Warcraft III recreation remains incomplete.

## Workspace boundary

Branch `codex/frostbound-realms`; preceding remote milestone `07406bf103c1ec71ac63877de3cfb8b37b97e798`. Only source activation/AI/menu changes, focused checks, generated Main.js and milestone evidence belong to this work. Unrelated menu/terrain/model-catalog dirt remains intact; `G:/work/github/MEgine/asset-library` remains read-only. Ponytail remains disabled.
