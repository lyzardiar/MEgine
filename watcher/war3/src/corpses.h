// Author: MiYu. Source death/decay phases and exclusive corpse claims remain attached to the original unit handle.
#pragma once
#include <cstdint>
#include <vector>

namespace war3 {
struct ExhumeState {std::uint32_t ability=0;unsigned level=0;double elapsed=0;};
struct GraveyardState {std::uint32_t ability=0;unsigned level=0,emitted=0;double elapsed=0;std::vector<std::uint32_t> bodies;};
struct CorpseState {
    enum class Phase {Death,Body,Flesh,Bone,Dissipate,Gone};
    Phase phase=Phase::Death;
    unsigned flags=0;
    double elapsed=0,death=0,flesh=0,bone=0;
    std::uint32_t claimedBy=0;
    std::uint64_t claimTicket=0;
    float nutrition=-1;
    bool consumed=false,gone=false;
};
}
