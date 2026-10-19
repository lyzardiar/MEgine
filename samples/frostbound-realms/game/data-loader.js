// Author: MiYu. Runtime data loader for Frostbound Realms.
// Loads large catalogs asynchronously to improve initial load time.

const FrostDataLoader = (() => {
  const cache = {};
  const loading = {};
  const baseUrl = 'Assets/Data/';

  async function loadJson(filename) {
    if (cache[filename]) return cache[filename];
    if (loading[filename]) return loading[filename];

    loading[filename] = (async () => {
      try {
        const response = await fetch(baseUrl + filename);
        if (!response.ok) throw new Error(`Failed to load ${filename}: ${response.statusText}`);
        const data = await response.json();
        cache[filename] = data;
        delete loading[filename];
        return data;
      } catch (error) {
        delete loading[filename];
        console.error(`Error loading ${filename}:`, error);
        throw error;
      }
    })();

    return loading[filename];
  }

  return {
    async loadModelCatalog() {
      return loadJson('model-catalog.json');
    },

    async loadEffectCatalog() {
      return loadJson('effect-catalog.json');
    },

    async loadDetonationCatalog() {
      return loadJson('detonation-catalog.json');
    },

    async loadPortraitCatalog() {
      return loadJson('portrait-catalog.json');
    },

    async loadBuildingScales() {
      return loadJson('building-scales.json');
    },

    async loadUnitScales() {
      return loadJson('unit-scales.json');
    },

    async loadSentinelCatalog() {
      return loadJson('sentinel-catalog.json');
    },

    async loadConstructionCatalog() {
      return loadJson('construction-catalog.json');
    },

    async loadAll() {
      const [
        modelCatalog,
        effectCatalog,
        detonationCatalog,
        portraitCatalog,
        buildingScales,
        unitScales,
        sentinelCatalog,
        constructionCatalog
      ] = await Promise.all([
        this.loadModelCatalog(),
        this.loadEffectCatalog(),
        this.loadDetonationCatalog(),
        this.loadPortraitCatalog(),
        this.loadBuildingScales(),
        this.loadUnitScales(),
        this.loadSentinelCatalog(),
        this.loadConstructionCatalog()
      ]);

      return {
        FrostArt: modelCatalog,
        FrostEffectArt: effectCatalog,
        FrostDetonateArt: detonationCatalog,
        FrostPortraitViews: portraitCatalog,
        FrostBuildingScales: buildingScales,
        FrostUnitScales: unitScales,
        FrostSentinelArt: sentinelCatalog,
        FrostConstructionArt: constructionCatalog
      };
    },

    getCached(filename) {
      return cache[filename];
    },

    isLoaded(filename) {
      return !!cache[filename];
    }
  };
})();
