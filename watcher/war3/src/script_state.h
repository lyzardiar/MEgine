// Author: MiYu. Session callbacks, filters and deterministic timer/event records.
#pragma once
#include "jass_runtime.h"
#include "world.h"
#include <array>
#include <set>
#include <map>
#include <tuple>
#include <optional>
#include <vector>

namespace war3 {
struct ScriptBoolean {
    enum class Operation {Code,And,Or,Not};
    Operation operation=Operation::Code;
    jass::Value code;
    std::shared_ptr<ScriptBoolean> left,right;
};
struct ScriptCallback {std::uint32_t owner=0;jass::Value code;std::shared_ptr<ScriptBoolean> condition;};
struct ScriptTimer {
    jass::Real timeout,elapsed;
    bool running=false,periodic=false;
    double due=0,started=0;
    std::uint64_t revision=0;
    jass::Value callback;
};
struct ScriptTrigger {
    bool enabled=true,waitOnSleeps=true;
    unsigned evaluations=0,executions=0;
    std::vector<std::uint32_t> actions,conditions;
};
struct ScriptTrackable {std::string model;float x=0,y=0,facing=0;};
struct ScriptForce {std::uint32_t players=0;};
struct ScriptEvent {
    enum class Kind {Timer,TimerExpire,Clock,Variable,Player,PlayerUnit,Unit,UnitState,Game,Alliance,PlayerState,RegionEnter,RegionLeave,UnitRange,Chat,WidgetDeath,Dialog,DialogButton,TrackableHit,TrackableTrack,IntegerGameState};
    Kind kind=Kind::Game;
    std::uint32_t owner=0,target=0,event=0,comparison=0;
    std::uint32_t stateKey=0;
    jass::Real limit;
    double due=0,interval=0;
    bool periodic=false,stateMatched=false;
    std::shared_ptr<ScriptBoolean> filter;
    std::set<std::uint32_t> inside;
    std::string match;
    bool exact=false;
};
struct ScriptContext {
    std::uint32_t trigger=0,event=0,expiredTimer=0,triggerPlayer=0,triggerUnit=0;
    std::uint32_t filterUnit=0,enumUnit=0,filterPlayer=0,enumPlayer=0;
    std::uint32_t previousOwner=0,killingUnit=0,rescuer=0;
    std::uint32_t transportUnit=0,loadedUnit=0;
    std::uint32_t playerState=0,unitState=0,gameState=0;
    std::uint32_t issuedOrder=0;
    WorldPoint orderPoint;
    std::uint32_t triggeringRegion=0,enteringUnit=0,leavingUnit=0,manipulatedItem=0;
    std::uint32_t buyingUnit=0,soldUnit=0,sellingUnit=0,soldItem=0,trainedUnit=0,trainedType=0;
    std::uint32_t learnedSkill=0,learnedLevel=0;
    std::uint32_t summoningUnit=0,summonedUnit=0,damageSource=0,orderTarget=0;
    std::uint32_t attacker=0,eventTargetUnit=0;
    std::uint32_t spellUnit=0,spellId=0,spellAbility=0,spellTarget=0;
    WorldPoint spellPoint;
    std::uint32_t researched=0,clickedDialog=0,clickedButton=0,triggeringTrackable=0;
    std::uint32_t constructing=0,cancelled=0,constructed=0;
    std::uint32_t triggerWidget=0,triggerDestructable=0,filterDestructable=0,enumDestructable=0,filterItem=0,enumItem=0;
    bool damageAttack=false,damageRanged=false;
    jass::Real damage;
    std::string chat,chatMatch;
};
struct ScriptTimerDialog {
    std::uint32_t timer=0;
    std::string title;
    std::array<std::uint8_t,4> titleColor{255,255,255,255},timeColor{255,255,255,255};
    bool displayed=false;
    float speed=1;
    std::optional<std::pair<std::uint64_t,float>> realTime;
};
struct ScriptTextTag {
    std::string text;float x=0,y=0,z=0,height=0.023f,vx=0,vy=0,age=0,lifespan=0,fadepoint=0;
    std::array<std::uint8_t,4> color{255,255,255,255};bool visible=true,suspended=false,permanent=true;
};
struct ScriptText {unsigned owner=0;float x=0,y=0;double expires=0;std::string text;std::uint16_t audience=0xffff;};
struct ScriptMinimapPing {std::uint64_t id=0;float x=0,y=0;double started=0,expires=0;std::uint32_t color=0xff00ff00;bool extra=false;};
struct ScriptCinematicScene {std::uint32_t portrait=0,color=0;std::string model,speaker,dialogue;double started=0,expires=0,voiceUntil=0;};
struct ScriptCameraSetup {std::array<float,7> fields{},durations{};float x=0,y=0,panDuration=0;};
struct ScriptCineFilter {
    std::string texture;
    unsigned blend=2,flags=0;
    std::array<float,4> startUV{0,0,1,1},endUV{0,0,1,1};
    std::array<unsigned,4> startColor{255,255,255,255},endColor{255,255,255,255};
    double duration=0,started=0;
    bool displayed=false;
};
struct CachedBook {unsigned level=0;std::vector<std::uint32_t> spells;};
struct CachedItem {
    std::uint32_t type=0,life=0,maxLife=0,dropId=0;
    int charges=0,userData=0,level=0;
    bool visible=true,invulnerable=false,droppable=true,pawnable=true,dropOnDeath=false;
    std::map<std::uint32_t,CachedBook> books;
};
struct CachedUnit {
    std::uint32_t type=0,life=0,maxLife=0,mana=0,maxMana=0,moveSpeed=0,defaultMoveSpeed=0;
    int resources=0,userData=0,level=1,experience=0,skillPoints=0;
    bool hero=false,visible=true,invulnerable=false,pathing=true,useFood=true,experienceSuspended=false;
    bool hasRuntimeTraits=false,hasVisualTraits=false;
    std::uint32_t turnSpeed=0,propWindow=0,addedTypes=0,removedTypes=0;
    float permanentDamage=0,flyHeight=0,targetFlyHeight=0,flyRate=0;
    std::array<float,3> visualScale{1,1,1};
    std::array<std::uint8_t,4> tint{255,255,255,255};
    std::optional<unsigned> color;
    std::array<float,3> attributes{},growth{},bonuses{};
    std::string properName;
    std::map<std::uint32_t,int> abilities;
    std::map<std::uint32_t,bool> permanent,autocast;
    std::map<std::uint32_t,CachedBook> books;
    std::array<std::optional<CachedItem>,6> items;
};
struct ScriptCache {
    std::string name;
    std::map<std::tuple<std::string,std::string,std::string>,jass::Value> values;
    std::map<std::pair<std::string,std::string>,CachedUnit> units;
};
struct ScriptHashtable {std::map<std::tuple<std::uint32_t,std::uint32_t,std::string>,jass::Value> values;};
struct ScriptMultiboardCell {std::string value,icon;std::uint32_t color=0xffffffff;float width=.04f;bool showValue=true,showIcon=false,active=true;};
struct ScriptMultiboard {std::string title;std::uint32_t titleColor=0xffffffff;bool visible=false,minimized=false;unsigned rows=0,columns=0;ScriptMultiboardCell defaults;std::vector<std::shared_ptr<ScriptMultiboardCell>> cells;std::set<std::uint32_t> handles;};
struct ScriptMultiboardItem {std::weak_ptr<ScriptMultiboard> board;std::weak_ptr<ScriptMultiboardCell> cell;};
struct ScriptLeaderboardItem {std::string label;int value=0;unsigned player=0;bool showLabel=true,showValue=true,showIcon=true;std::uint32_t labelColor=0xffffffff,valueColor=0xffffffff;};
struct ScriptLeaderboard {std::string label;std::vector<ScriptLeaderboardItem> items;bool visible=false,showLabel=true,showNames=true,showValues=true,showIcons=true;std::uint32_t labelColor=0xffffffff,valueColor=0xffffffff;unsigned sizeCount=0;};
struct ScriptQuestItem {std::uint32_t owner=0;std::string description;bool completed=false;};
struct ScriptQuest {std::string title,description,icon;bool required=true,completed=false,discovered=false,failed=false,enabled=true;std::vector<std::pair<std::uint32_t,std::shared_ptr<ScriptQuestItem>>> items;};
}
