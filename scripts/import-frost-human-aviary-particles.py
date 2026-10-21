"""Author: MiYu. Preserve the original feather, bone and gut meshes emitted by Dragonhawk death."""
import importlib

BINDINGS = [(name, 'Aviary' + name, 'SharedModels/' + name) for name in ['Feather2', 'Bones1', 'Gutz1', 'Feather1']]

if __name__ == '__main__':
    importlib.import_module('import-frost-orc-hero-art').main(dict(description=__doc__, runtimeIntegrated=True, bindings=BINDINGS, portraits=False, receipt='human-aviary-particle-sources.json', prefix='Assets/HumanAviaryParticles/', raw='SourceAssets/HumanAviaryParticles/', modelsFile='human-aviary-particle-models.json', sourceLicenseFile='Assets/Licenses/Classic-Human-Aviary-Particles.txt', licenseFile='Assets/Licenses/Human-Aviary-Particles-W3ModelViewer-MIT.txt', generators=['scripts/import-frost-human-aviary-particles.py']))
