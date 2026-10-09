"""Author: MiYu. Reproduce original Undead hero attributes, command cards, buffs and AI sources."""
import importlib

if __name__ == '__main__':
    importlib.import_module('import-frost-orc-heroes').main({'race': 'Undead', 'heroes': ['Udea', 'Ulic', 'Udre', 'Ucrl'], 'name': 'undead-hero', 'assetGroup': 'UndeadHeroes', 'altar': 'uaod', 'description': __doc__, 'generators': ['scripts/import-frost-undead-heroes.py']})
