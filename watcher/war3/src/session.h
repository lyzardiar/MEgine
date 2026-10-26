// Author: MiYu. Script-owned map configuration and native object lifetime for a session.
#pragma once
#include "jass_runtime.h"
#include "map.h"
#include <variant>

namespace war3 {
struct StartPriority {unsigned other=0,priority=0;};
struct SessionStart {bool defined=false;std::array<jass::Real,2> position{};std::vector<StartPriority> priorities;};
struct SessionPlayer {
    std::string name;
    unsigned team=0,color=0,controller=5,racePreference=0,slotState=0;
    int start=-1;
    bool raceSelectable=true,forcedStart=false,onScoreScreen=true;
    std::array<unsigned,16> alliances{};
    std::map<unsigned,int> states;
    std::map<std::pair<unsigned,unsigned>,int> taxes;
};
struct SessionConfig {
    std::string name,description;
    unsigned playerCount=0,teamCount=0,placement=0,gameType=4,supportedGameTypes=0;
    std::array<SessionPlayer,16> players;
    std::array<SessionStart,16> starts;
};
enum class NativeKind {Player,Group,Timer,Trigger};
class ScriptSession {
    struct PlayerRef {unsigned id;};
    struct Group {std::vector<std::uint32_t> units;};
    struct Timer {jass::Real timeout,elapsed;bool running=false,periodic=false;};
    struct Trigger {bool enabled=true,waitOnSleeps=true;unsigned evaluations=0,executions=0;};
    struct Object {NativeKind kind;bool alive=true;std::variant<std::monostate,PlayerRef,Group,Timer,Trigger> state;};
    static constexpr std::uint32_t handleBase=0x100000;
    MapStrings strings_;
    SessionConfig config_;
    std::vector<Object> objects_;
    jass::Runtime runtime_;
    bool failed_=false,configured_=false;
    jass::Value create(NativeKind kind);
    Object& object(jass::Value handle,NativeKind kind);
    SessionPlayer& player(jass::Value handle);
    unsigned playerId(jass::Value handle);
    SessionStart& start(std::uint32_t index);
    void destroy(jass::Value handle,NativeKind kind);
    void bind(const char* name,const char* result,std::initializer_list<const char*> parameters,jass::Runtime::Native native);
    void bindNatives();
public:
    ScriptSession(jass::Module module,const MapInfo& info,MapStrings strings={},std::optional<unsigned> gameType={});
    void initialize();
    void configure();
    bool configured() const {return configured_ && !failed_;}
    bool initialized() const {return runtime_.ready() && !failed_;}
    const SessionConfig& config() const {return config_;}
    jass::Runtime& runtime() {return runtime_;}
    const jass::Runtime& runtime() const {return runtime_;}
    size_t liveObjects(NativeKind kind) const;
};
}
