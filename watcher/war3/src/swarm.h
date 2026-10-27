// Author: MiYu. Real swarm units retain target assignments, carried damage and a returning flight bound to their caster lifecycle.
#pragma once
#include "spells.h"

namespace war3 {
struct LocustSwarm {
    SpellInfo spell;
    std::uint32_t caster=0;
    unsigned owner=0,released=0;
    std::uint64_t ticket=0,deathRevision=0,ownerRevision=0;
    double remaining=0,releaseClock=0,nextTargets=0;
    bool returning=false;
    std::set<std::uint32_t> members;
    std::vector<std::uint32_t> targets,visuals;
};
struct LocustAgent {
    std::shared_ptr<LocustSwarm> swarm;
    std::uint32_t target=0,pendingTarget=0;
    std::uint64_t deathRevision=0;
    float carried=0;
    double nextAttack=0,attackDue=0;
    bool returning=false;
};
}
