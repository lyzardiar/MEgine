"""Author: MiYu. Reproduce original Spiritwolf body, portrait, materials and source node tracks."""
import importlib


if __name__ == '__main__':
    importlib.import_module('import-frost-orc-hero-art').main(dict(description=__doc__, bindings=[('osw1', 'ClassicSpiritWolf', 'Units/Orc/Spiritwolf/Spiritwolf')], receipt='farseer-art-sources.json', prefix='Assets/Farseer/', raw='SourceAssets/Farseer/art/', modelsFile='farseer-models.json', portraitsFile='farseer-portraits.json', sourceLicenseFile='Assets/Licenses/Classic-Farseer-Art.txt', licenseFile='Assets/Licenses/Farseer-Art-W3ModelViewer-MIT.txt', generators=['scripts/import-frost-farseer-art.py']))
