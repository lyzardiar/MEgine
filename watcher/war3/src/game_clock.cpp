// Author: MiYu. Original real assignment order and source MiscData day/night values.
#include "game_clock.h"
#include "binary.h"
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
void GameClock::time(jass::Real value) {time_=assignment(time(),value,jass::Real{},rules_.dayHours);temporaryRemaining_={};temporaryTime_={};}
void GameClock::scale(jass::Real value) {scale_=assignment(scale(),value,jass::Real::fromBits(0xff7fffff),jass::Real::fromBits(0x7f7fffff));}
jass::Real GameClock::rate() const {return suspended_?jass::Real{}:scale().multiply(rules_.dayHours).divide(rules_.dayLength);}
bool GameClock::daytime() const {return number(time())>=number(rules_.dawn) && number(time())<number(rules_.dusk);}
void GameClock::temporary(jass::Real value,jass::Real seconds) {if(!std::isfinite(number(value)) || !std::isfinite(number(seconds)) || number(seconds)<=0)throw std::runtime_error("Invalid temporary clock effect");if(number(temporaryRemaining_)<=0)temporaryTime_=time();time_=assignment(time(),value,jass::Real{},rules_.dayHours);temporaryRemaining_=seconds;}
std::vector<std::uint8_t> GameClock::encodeState() const {
    std::vector<std::uint8_t> bytes;bytes.reserve(44);auto u32=[&](std::uint32_t value){bytes.push_back(std::uint8_t(value));bytes.push_back(std::uint8_t(value>>8));bytes.push_back(std::uint8_t(value>>16));bytes.push_back(std::uint8_t(value>>24));};u32(tag("WCLK"));u32(1);for(auto value:{rules_.dayLength,rules_.dayHours,rules_.dawn,rules_.dusk,time_,scale_,temporaryTime_,temporaryRemaining_})u32(value.bits());u32(suspended_?1:0);auto checked=*this;checked.restoreState(bytes);return bytes;
}
void GameClock::restoreState(std::span<const std::uint8_t> bytes) {
    Binary input(bytes);input.expect(tag("WCLK"));if(input.u32()!=1)throw std::runtime_error("Unsupported world clock state");for(auto expected:{rules_.dayLength,rules_.dayHours,rules_.dawn,rules_.dusk})if(input.u32()!=expected.bits())throw std::runtime_error("World clock rules differ");auto time=jass::Real::fromBits(input.u32()),scale=jass::Real::fromBits(input.u32()),temporary=jass::Real::fromBits(input.u32()),remaining=jass::Real::fromBits(input.u32());auto suspended=input.u32();input.finish();for(auto value:{time,scale,temporary,remaining})if(!std::isfinite(number(value)))throw std::runtime_error("Non-finite world clock state");if(number(time)<0 || number(time)>number(rules_.dayHours) || number(temporary)<0 || number(temporary)>number(rules_.dayHours) || number(remaining)<0 || (number(remaining)==0 && number(temporary)!=0) || suspended>1)throw std::runtime_error("Invalid world clock state");time_=time;scale_=scale;temporaryTime_=temporary;temporaryRemaining_=remaining;suspended_=suspended!=0;
}
ClockAdvance GameClock::advance(jass::Real seconds) {
    auto delta=number(seconds);if(!std::isfinite(delta) || delta<0)throw std::runtime_error("Invalid clock timestep");auto advanceValue=[this](jass::Real value,jass::Real step){auto next=value.add(rate().multiply(step));auto cycle=number(rules_.dayHours),current=number(next);if(!std::isfinite(current))throw std::runtime_error("Clock advance exceeds finite range");current=std::fmod(current,cycle);if(current<0)current+=cycle;return jass::Real::fromBits(std::bit_cast<std::uint32_t>(current));};
    if(number(temporaryRemaining_)<=0){time_=advanceValue(time_,seconds);return {};}auto remaining=number(temporaryRemaining_)-delta;if(remaining<=0){auto until=temporaryRemaining_;ClockAdvance result{true,advanceValue(time_,until),advanceValue(temporaryTime_,until)};time_=advanceValue(result.restoredTime,jass::Real::fromBits(std::bit_cast<std::uint32_t>(-remaining)));temporaryTime_={};temporaryRemaining_={};return result;}temporaryTime_=advanceValue(temporaryTime_,seconds);time_=advanceValue(time_,seconds);temporaryRemaining_=jass::Real::fromBits(std::bit_cast<std::uint32_t>(remaining));return {};
}
}
