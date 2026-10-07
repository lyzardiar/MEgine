# Original Storm Crow flight height

Author: MiYu

Storm Crow uses the original `edtm` movement row from `Units/UnitData.slk`: flying movement, height 240 and minimum height 90. At the sample's 100 source units per world unit, its normal altitude is 2.4. The importer preserves the raw source table, archive name, SHA-256 and the movement rows for all four Druid forms in `druid-sources.json` and `druid-rules.json`.

Simulation, projectile endpoints, attack distance, screen selection and visible mesh positions share the sourced altitude. The selected Crow's ring stays on its ground footprint; its health bar follows its visible model. Other flying units retain their existing heights. Saved worlds and authoritative public snapshots derive the same altitude from the form and original movement row.

Validation covers flat and raised terrain, the other flying units, save/load, TCP snapshots, actual generated-client mesh parts, ground rings, health bars, Crow Faerie Fire targeting and native F transformations with F5 restoration and return to ground. `native-druid-flight-qa.json`, `druid-flight-crow.png` and `druid-flight-landed.png` record native evidence. `druid-flight-validation.json` records final hashes and timings.

Original training rows specify `rmnr` 0.325 per rank. Current regeneration uses that value; whether the original game applies it in alternate forms still needs direct measurement. Current HP transfer preserves the health percentage; the static unit and ability tables do not prove that this matches the original game. Original height-adjustment duration and landing delay also need comparison with the original runtime before their transition ordering can be claimed as exact. Crow takeoff/landing and Cyclone fall interpolation remain parity work. Physical input, sound listening, cross-machine LAN and complete Warcraft III mode parity remain unverified.
