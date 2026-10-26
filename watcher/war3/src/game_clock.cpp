// Author: MiYu. Original real assignment order and source MiscData day/night values.
#include "game_clock.h"
#include "map_ui.h"
#include <bit>
#include <cmath>

namespace war3 {
namespace {
float number(jass::Real value) {return std::bit_cast<float>(value.bits());}
jass::Real bounded(jass::Real value,jass::Real minimum,jass::Real maximum) {return number(minimum)>number(value)?minimum:number(value)>number(maximum)?maximum:value;}
jass::Real assignment(jass::Real current,jass::Real requested,jass::Real minimum,jass::Real maximum) {return bounded(current.add(requested.subtract(current)),minimum,maximum);}
jass::Real setting(const SourceSettings& source,const char* key) {
    auto text=source.value("Misc",key);if(text.empty())throw std::runtime_error("Missing source clock setting: "+std::string(key));bool negative=text[0]=='-';if(negative || text[0]=='+')text.erase(0,1);auto value=jass::Real::fromDecimal(text);return negative?jass::Real::fromBits(value.bits()^0x80000000u):value;
}
}
DayNightRules DayNightRules::read(Archives& archives) {
    SourceSettings source;source.load(archives,"Units\\MiscData.txt");if(auto overlay=archives.readCandidates({"war3mapMisc.txt"},ArchiveScope::Map))source.parse(overlay->bytes);
    return {setting(source,"DayLength"),setting(source,"DayHours"),setting(source,"Dawn"),setting(source,"Dusk")};
}
GameClock::GameClock(DayNightRules rules) : rules_(rules) {
    for(auto value:{rules_.dayLength,rules_.dayHours,rules_.dawn,rules_.dusk})if(!std::isfinite(number(value)))throw std::runtime_error("Non-finite source clock setting");if(number(rules_.dayLength)<=0 || number(rules_.dayHours)<=0)throw std::runtime_error("Source clock cycle must be positive");
}
void GameClock::time(jass::Real value) {time_=assignment(time(),value,jass::Real{},rules_.dayHours);}
void GameClock::scale(jass::Real value) {scale_=assignment(scale(),value,jass::Real::fromBits(0xff7fffff),jass::Real::fromBits(0x7f7fffff));}
jass::Real GameClock::rate() const {return suspended_?jass::Real{}:scale().multiply(rules_.dayHours).divide(rules_.dayLength);}
bool GameClock::daytime() const {return number(time())>=number(rules_.dawn) && number(time())<number(rules_.dusk);}
void GameClock::advance(jass::Real seconds) {auto delta=number(seconds);if(!std::isfinite(delta) || delta<0)throw std::runtime_error("Invalid clock timestep");auto next=time().add(rate().multiply(seconds));auto cycle=number(rules_.dayHours),value=number(next);if(!std::isfinite(value))throw std::runtime_error("Clock advance exceeds finite range");value=std::fmod(value,cycle);if(value<0)value+=cycle;time_=jass::Real::fromBits(std::bit_cast<std::uint32_t>(value));}
}
