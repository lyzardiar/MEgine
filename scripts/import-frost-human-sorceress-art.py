"""Author: MiYu. Reproduce all four source Polymorph sheep identities with original tracks."""
import importlib

if __name__ == '__main__':
    importlib.import_module('import-frost-orc-hero-art').main(dict(description=__doc__, bindings=[('nshe', 'ClassicPolymorphnshe', 'units/critters/Sheep/Sheep'), ('nshf', 'ClassicPolymorphnshf', 'units/critters/FlyingSheep/FlyingSheep'), ('nsha', 'ClassicPolymorphnsha', 'units/critters/Sheep/Sheep'), ('nshw', 'ClassicPolymorphnshw', 'units/critters/Sheep/Sheep')], portraits=False, receipt='human-sorceress-art-sources.json', prefix='Assets/HumanSorceress/', raw='SourceAssets/HumanSorceressArt/', modelsFile='human-sorceress-models.json', sourceLicenseFile='Assets/Licenses/Classic-Human-Sorceress-Art.txt', licenseFile='Assets/Licenses/Human-Sorceress-Art-W3ModelViewer-MIT.txt', generators=['scripts/import-frost-human-sorceress-art.py']))
