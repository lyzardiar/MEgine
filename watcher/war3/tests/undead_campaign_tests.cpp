// Author: MiYu. Original undead campaign player command checks in isolated sessions.
#include "session.h"
#include "setup.h"
#include "player_commands.h"
#include <algorithm>
#include <bit>
#include <cmath>
#include <filesystem>
#include <iostream>
#include <queue>
#include <unordered_map>
#include <vector>

using namespace war3;
namespace {
void require(bool ok,const char* message){if(!ok)throw std::runtime_error(message);}
float number(jass::Real value){return std::bit_cast<float>(value.bits());}
std::unique_ptr<ScriptSession> start(const wchar_t* root){Archives archives(root);auto bytes=archives.readCandidates({"Maps\\Campaign\\Undead01.w3m"},ArchiveScope::Common);require(bool(bytes),"Undead01 map missing");archives.mountMap(std::make_shared<const Bytes>(bytes->bytes),"Undead01.w3m");auto world=World::read(archives);auto info=world->data().info;MapStrings strings;if(auto wts=archives.readCandidates({"war3map.wts"},ArchiveScope::Map))strings=mapStrings(wts->bytes);auto session=std::make_unique<ScriptSession>(jass::Module::compile(jass::Program::read(archives)),info,std::move(strings));session->campaignContext(false,1);session->attachWorld(std::move(world));session->audioSimulationClock();session->audioMuted(true);session->configure();PlayerSetup setup(info,session->config());session->applySetup(setup);session->startMain();return session;}
void firstRescues(const wchar_t* root){
    auto session=start(root);for(int i=0;i<480;++i)session->advance(.25);
    auto& vm=session->runtime();auto player=session->localPlayer().value_or(3),hero=vm.global("udg_Arthas").bits,bridge=vm.global("udg_BridgeAcolyte").bits;require(session->userControl() && session->units().contains(hero) && session->units().contains(bridge) && vm.global("udg_RescuedAcolytesCount").bits==0 && vm.global("udg_AcolytesNeeded").bits==20,"Undead01 initial state unexpected");std::uint32_t regular=0;for(auto& [id,u]:session->units())if(u->type==ObjectData::code("nC00") && std::hypot(number(u->x)-691.5f,number(u->y)+1820.9f)<16)regular=id;require(regular,"Undead01 nearby acolyte missing");unsigned moves=0,attacks=0,spells=0;
    for(int i=0;i<1600 && session->exitRequest()==SessionExit::None && vm.global("udg_RescuedAcolytesCount").bits<2;++i){if(i%16==0 && session->userControl()){auto h=session->units().at(hero);require(number(h->life)>0,"Undead01 hero died before initial rescues");std::uint32_t target=0,enemy=0;float best=1e9f,nearest=1e9f;for(auto& [id,u]:session->units()){if(u->type==ObjectData::code("nC00") && u->owner==0 && !u->hidden() && number(u->life)>0){float d=std::hypot(number(u->x)-number(h->x),number(u->y)-number(h->y));if(d<best){best=d;target=id;}}if(u->owner==1 && !u->building && !u->hidden() && !u->invulnerable && number(u->life)>0 && session->unitVisibleTo(id,player)){float d=std::hypot(number(u->x)-number(h->x),number(u->y)-number(h->y));if(d<550 && d<nearest){nearest=d;enemy=id;}}}std::vector<std::uint32_t> army;for(auto& [id,u]:session->units())if(u->owner==player && !u->building && !u->hidden() && number(u->life)>0 && u->type!=ObjectData::code("uaco"))army.push_back(id);std::uint32_t wounded=0;float lowest=220;for(auto id:army)if(id!=hero){auto u=session->units().at(id);if(u->type==ObjectData::code("ugho") && number(u->life)<lowest && std::hypot(number(u->x)-number(h->x),number(u->y)-number(h->y))<650){wounded=id;lowest=number(u->life);}}if(!h->cast && number(h->mana)>=75 && (wounded || (enemy && number(h->mana)>150))){PlayerCommand c;c.player=player;c.units={hero};c.kind=PlayerCommandKind::SpellUnit;c.ability=ObjectData::code("AUdc");c.target=wounded?wounded:enemy;spells+=dispatchPlayerCommand(*session,c);}if(h->cast)army.erase(std::remove(army.begin(),army.end(),hero),army.end());if(!army.empty() && (enemy || target)){PlayerCommand c;c.player=player;c.units=army;if(enemy){c.kind=PlayerCommandKind::TargetOrder;c.order=851983;c.target=enemy;attacks+=dispatchPlayerCommand(*session,c);}else{c.kind=PlayerCommandKind::GroundAttack;c.xBits=session->units().at(target)->x.bits();c.yBits=session->units().at(target)->y.bits();moves+=dispatchPlayerCommand(*session,c);}}}session->advance(.25);}
    auto executions=[&](const char* name){return vm.invoke("GetTriggerExecCount",std::array{vm.global(name)}).bits;};unsigned rescued=0;for(auto& [id,u]:session->units())if(u->type==ObjectData::code("uaco") && vm.invoke("IsUnitInGroup",std::array{vm.handle("unit",id),vm.global("udg_RescuedAcolytes")}).bits)++rescued;auto replacement=vm.global("udg_BridgeAcolyte").bits;require(moves>0 && attacks>0 && spells>0 && number(session->units().at(hero)->life)>0 && session->exitRequest()==SessionExit::None,"Undead01 player orders or hero state unexpected");require(!session->units().contains(bridge) && !session->units().contains(regular) && replacement && replacement!=bridge,"Undead01 initial acolytes were not replaced");require(vm.global("udg_RescuedAcolytesCount").bits==2 && rescued==2 && executions("gg_trg_Bridge_Scene")==1 && executions("gg_trg_Acolyte_Touched")==1 && executions("gg_trg_Acolyte_Arrival")==2,"Undead01 bridge and ordinary rescues did not arrive");std::cout<<"PASS Undead01 initial rescues time="<<session->simulationTime()<<" rescued="<<rescued<<" moves="<<moves<<" attacks="<<attacks<<" spells="<<spells<<"\n";
}
void potionPickup(const wchar_t* root){
    auto session=start(root);for(int i=0;i<480;++i)session->advance(.25);auto& vm=session->runtime();auto player=session->localPlayer().value_or(3),hero=vm.global("udg_Arthas").bits,crate=vm.global("gg_dest_LTcr_0012").bits;require(session->userControl() && session->units().contains(hero) && session->destructables().contains(crate),"Undead01 crate fixture missing");std::uint32_t potion=0;bool issued=false;unsigned attacks=0;for(int i=0;i<1600 && session->exitRequest()==SessionExit::None;++i){if(i%16==0 && session->userControl()){auto h=session->units().at(hero);require(number(h->life)>0,"Undead01 hero died before potion pickup");PlayerCommand c;c.player=player;c.units={hero};if(session->destructables().at(crate)->life>0){auto d=session->destructables().at(crate);if(session->fog(player).state(d->position)!=4){c.kind=PlayerCommandKind::GroundMove;c.xBits=d->position.x.bits();c.yBits=d->position.y.bits();}else{c.kind=PlayerCommandKind::TargetOrder;c.order=851983;c.target=crate;}attacks+=dispatchPlayerCommand(*session,c);}else{if(!potion)for(auto& [id,item]:session->items())if(item->type==ObjectData::code("phea")){potion=id;break;}if(potion && session->items().at(potion)->holder==hero)break;if(potion && !issued){c.kind=PlayerCommandKind::TargetOrder;c.order=851971;c.target=potion;issued=dispatchPlayerCommand(*session,c)>0;}}}session->advance(.25);}require(attacks>0 && issued && potion && session->items().contains(potion) && session->items().at(potion)->holder==hero,"Undead01 player could not pick up the crate potion");std::cout<<"PASS Undead01 crate potion picked up time="<<session->simulationTime()<<"\n";
}

constexpr float routeSpacing=64.f;
constexpr float caution=1.5f;
WorldPoint point(float x,float y){return {jass::Real::fromBits(std::bit_cast<unsigned>(x)),jass::Real::fromBits(std::bit_cast<unsigned>(y))};}
WorldPoint point(const UnitState& u){return {u.x,u.y};}
float distance(WorldPoint a,WorldPoint b){return std::hypot(number(a.x)-number(b.x),number(a.y)-number(b.y));}

unsigned moveUnit(ScriptSession& s,unsigned owner,std::uint32_t unit,WorldPoint to) {
    PlayerCommand c;c.player=owner;c.units={unit};c.kind=PlayerCommandKind::GroundMove;c.xBits=to.x.bits();c.yBits=to.y.bits();
    return dispatchPlayerCommand(s,c);
}
unsigned orderTarget(ScriptSession& s,unsigned owner,std::uint32_t unit,std::uint32_t id,unsigned order) {
    PlayerCommand c;c.player=owner;c.units={unit};c.kind=PlayerCommandKind::TargetOrder;c.order=order;c.target=id;
    return dispatchPlayerCommand(s,c);
}
unsigned useAbility(ScriptSession& s,unsigned owner,std::uint32_t unit,std::uint32_t id,PlayerCommandKind kind,unsigned ability=0) {
    PlayerCommand c;c.player=owner;c.units={unit};c.kind=kind;c.ability=ability;c.target=id;c.item=id;
    return dispatchPlayerCommand(s,c);
}

struct RouteGrid {
    struct Neighbor {int index;float distance;};
    struct Threat {WorldPoint where;float reach;float weight;};
    struct Route {std::uint32_t target=0;std::vector<WorldPoint> steps;};
    const World& world;
    float radius;
    float x0,y0;
    int width,height;
    std::vector<WorldPoint> points;
    std::vector<std::vector<Neighbor>> edges;
    std::vector<float> risk;
    std::uint64_t revision=0;
    RouteGrid(const World& w,float size):world(w),radius(size),x0(w.data().terrain.origin[0]+32),y0(w.data().terrain.origin[1]+32),width((w.data().terrain.width-1)*2),height((w.data().terrain.height-1)*2) {
        points.reserve(width*height);
        for(int y=0;y<height;++y)for(int x=0;x<width;++x)points.push_back(point(x0+x*routeSpacing,y0+y*routeSpacing));
        edges.resize(points.size());risk.resize(points.size());
    }
    void updateTerrain(){
        if(revision==world.pathingRevision())return;
        revision=world.pathingRevision();
        std::vector<bool> free(points.size());
        for(size_t i=0;i<points.size();++i)free[i]=world.pathPointFree(points[i],radius,PathMovement::Ground);
        for(size_t i=0;i<points.size();++i){
            auto& adjacent=edges[i];adjacent.clear();
            if(!free[i])continue;
            const int x=i%width,y=i/width;
            for(int dy=-1;dy<=1;++dy)for(int dx=-1;dx<=1;++dx){
                if((!dx && !dy)||x+dx<0||x+dx>=width||y+dy<0||y+dy>=height)continue;
                const int next=(y+dy)*width+x+dx;
                if(free[next] && world.pathSegmentFree(points[i],points[next],radius,PathMovement::Ground))
                    adjacent.push_back({next,dx&&dy?routeSpacing*1.41421356f:routeSpacing});
            }
        }
    }
    void updateRisk(const std::vector<Threat>& threats) {
        std::fill(risk.begin(),risk.end(),0.f);
        for(const auto& t:threats){
            const auto cx=number(t.where.x),cy=number(t.where.y);
            const auto row=[&](float v){return std::clamp(int((v-y0)/routeSpacing),0,height-1);};
            const auto col=[&](float v){return std::clamp(int((v-x0)/routeSpacing),0,width-1);};
            for(int y=row(cy-t.reach);y<=row(cy+t.reach);++y)for(int x=col(cx-t.reach);x<=col(cx+t.reach);++x){
                const int i=y*width+x;
                if(edges[i].empty())continue;
                const float d=distance(points[i],t.where);
                if(d<t.reach){const float w=1.f-d/t.reach;risk[i]+=t.weight*w*w;}
            }
        }
    }
    int nearest(WorldPoint origin) const {
        const int cx=std::clamp(int(std::lround((number(origin.x)-x0)/routeSpacing)),0,width-1),cy=std::clamp(int(std::lround((number(origin.y)-y0)/routeSpacing)),0,height-1);
        float best=1e9f;int node=-1;
        for(int y=std::max(0,cy-3);y<=std::min(height-1,cy+3);++y)for(int x=std::max(0,cx-3);x<=std::min(width-1,cx+3);++x){
            int i=y*width+x;
            if(edges[i].empty())continue;
            const float d=distance(origin,points[i]);
            if(d<best && (d<5.f||world.pathSegmentFree(origin,points[i],radius,PathMovement::Ground))){node=i;best=d;}
        }
        return node;
    }
    Route route(WorldPoint origin,const std::vector<std::pair<std::uint32_t,WorldPoint>>& targets,float range,bool heal,float caution) const {
        auto src=nearest(origin);
        if(src<0)return {};
        using Entry=std::pair<float,int>;
        std::priority_queue<Entry,std::vector<Entry>,std::greater<>> open;
        std::vector<float> costs(points.size(),1e30f);
        std::vector<int> previous(points.size(),-1);
        costs[src]=0.f;open.push({0.f,src});
        float best=1e30f;
        int end=-1;
        std::uint32_t winner=0;
        while(!open.empty()){
            auto [cost,i]=open.top();open.pop();
            if(cost>costs[i])continue;
            if(cost>=best)break;
            if(heal){
                if(world.blighted(points[i]) && risk[i]<.38f){end=i;best=cost;}
            } else {
                for(auto& [id,to]:targets){
                    const float d=distance(points[i],to);
                    if(d>range)continue;
                    const float rank=cost+d*0.2f+risk[i]*(360.f*caution);
                    if(rank<best){end=i;winner=id;best=rank;}
                }
            }
            for(auto& e:edges[i]){
                const float candidate=cost+e.distance*(1.f+(risk[i]+risk[e.index])*.5f*caution);
                if(candidate<costs[e.index]){costs[e.index]=candidate;previous[e.index]=i;open.push({candidate,e.index});}
            }
        }
        Route result;result.target=winner;
        for(int i=end;i>=0;i=previous[i])result.steps.push_back(points[i]);
        std::reverse(result.steps.begin(),result.steps.end());
        return result;
    }
};

void fullRescue(const wchar_t* root){
    auto s=start(root);for(int i=0;i<480;++i)s->advance(.25);
    auto& vm=s->runtime();
    auto player=s->localPlayer().value_or(3),hero=vm.global("udg_Arthas").bits,crate=vm.global("gg_dest_LTcr_0012").bits;
    require(s->userControl() && s->units().contains(hero) && s->destructables().contains(crate) && vm.global("udg_AcolytesNeeded").bits==20,"Undead01 full-rescue setup is not ready");
    auto h=s->units().at(hero);
    const auto acolyteType=ObjectData::code("nC00"),healingPotion=ObjectData::code("phea"),deathCoil=ObjectData::code("AUdc"),ghoulType=ObjectData::code("ugho"),knightType=ObjectData::code("hkni");
    RouteGrid router(*s->world(),h->collision);
    unsigned rescues=0,moves=0,attacks=0,casts=0,potions=0,continueClicks=0;
    bool retreat=false,lootDone=false;
    WorldPoint before=point(*h),lastTarget=point(*h),waypoint=point(*h);
    double lastMovement=120,lastLoot=0,lastPlan=0,lastBlock=0;
    RouteGrid::Route plan;
    std::unordered_map<std::uint32_t,double> temporarilyAvoid;
    for(int frame=0;frame<2400*4 && s->exitRequest()==SessionExit::None;++frame){
        if(!s->units().contains(hero) || number(h->life)<=0.f){std::cout<<"DEAD time="<<s->simulationTime()<<"\n";break;}
        const auto now=s->simulationTime();
        const auto count=vm.global("udg_RescuedAcolytesCount").bits;
        const auto won=s->results().at(player).has_value() && *s->results().at(player)==0;
        if(count!=rescues){rescues=count;std::cout<<"RESCUE "<<rescues<<" at="<<now<<" heroHp="<<number(h->life)<<"\n";lastPlan=0;}
        if(won){
            for(auto& [id,dialog]:s->dialogs())if(dialog->owners && !dialog->buttons.empty()){
                PlayerCommand c;c.player=player;c.kind=PlayerCommandKind::DialogClick;c.target=dialog->buttons.front();
                if(dispatchPlayerCommand(*s,c)){++continueClicks;break;}
            }
        }
        if(s->userControl() && !won){
            const auto here=point(*h);
            if(distance(here,before)>12.f){before=here;lastMovement=now;}
            std::uint32_t potion=0,groundPotion=0;
            for(auto& [id,item]:s->items())if(item->type==healingPotion && item->visible){
                if(item->holder==hero)potion=id;else if(!item->holder)groundPotion=id;
            }
            if(potion && !h->cast && number(h->life)<number(h->maxLife)-255.f)potions+=useAbility(*s,player,hero,potion,PlayerCommandKind::ItemImmediate);
            if(!lootDone){
                if(potion || now>168){lootDone=true;lastPlan=0;}
                else if(now-lastLoot>=3){
                    lastLoot=now;
                    auto d=s->destructables().at(crate);
                    if(d->life>0){
                        if(s->fog(player).state(d->position)==4)attacks+=orderTarget(*s,player,hero,crate,851983);
                        else moves+=moveUnit(*s,player,hero,d->position);
                    }else if(groundPotion)orderTarget(*s,player,hero,groundPotion,851971);
                }
            }
            const auto oldRetreat=retreat;
            if(lootDone && (number(h->life)<number(h->maxLife)*.71f && !potion))retreat=true;
            if(number(h->life)>=number(h->maxLife)*.94f)retreat=false;
            if(oldRetreat!=retreat){std::cout<<(retreat?"RETREAT ":"RECOVERED ")<<now<<" hp="<<number(h->life)<<"\n";lastPlan=0;}
            std::uint32_t nearestEnemy=0,weakEnemy=0;
            float enemyDistance=1e9f,weakHealth=1e9f;
            std::vector<RouteGrid::Threat> threats;
            std::vector<std::pair<std::uint32_t,WorldPoint>> targets;
            for(auto& [id,u]:s->units()){
                if(u->hidden() || number(u->life)<=0)continue;
                if((u->owner==1 || u->owner==12) && !u->invulnerable){
                    const auto at=point(*u);const auto d=distance(here,at);
                    if(!u->paused){
                        const float reach=std::max(500.f,number(u->acquireRange))+220.f;
                        const float weight=u->type==knightType?10.f:4.4f;
                        threats.push_back({at,reach,weight});
                    }
                    if(d<650 && s->unitVisibleTo(id,player)){
                        if(d<enemyDistance){nearestEnemy=id;enemyDistance=d;}
                        if(number(u->life)<weakHealth){weakEnemy=id;weakHealth=number(u->life);}
                    }
                }
                auto avoid=temporarilyAvoid.find(id);
                if(u->owner==0 && u->type==acolyteType && (avoid==temporarilyAvoid.end() || avoid->second<now))targets.push_back({id,point(*u)});
            }
            if(lootDone && !h->cast && weakEnemy && weakHealth<=115.f && number(h->mana)>=75.f)casts+=useAbility(*s,player,hero,weakEnemy,PlayerCommandKind::SpellUnit,deathCoil);
            if(lootDone && !h->cast && (now-lastPlan>=4.f || (lastPlan==0) || (distance(here,waypoint)<55.f && now-lastPlan>=.25f && distance(here,lastTarget)>38.f) || (now-lastMovement>4.f && now-lastBlock>6.f))){
                if(plan.target && now-lastMovement>8.f && !retreat && now-lastBlock>8.f){
                    temporarilyAvoid[plan.target]=now+20.f;lastBlock=now;
                    std::erase_if(targets,[&](auto& x){return x.first==plan.target;});
                }
                router.updateTerrain();router.updateRisk(threats);
                auto newPlan=router.route(here,targets,200.f,retreat,retreat?caution*1.45f:caution);
                if(!newPlan.steps.empty()){
                    plan=std::move(newPlan);lastPlan=now;lastTarget=plan.steps.back();
                    std::size_t upto=0;
                    for(std::size_t i=1;i<plan.steps.size();++i){
                        if(distance(here,plan.steps[i])>840.f || !s->world()->pathSegmentFree(here,plan.steps[i],h->collision,PathMovement::Ground))break;
                        upto=i;
                    }
                    // Keep the hero moving through short turns, where the periodic planning interval would leave a gap.
                    if(distance(here,plan.steps[upto])<25.f && upto+1<plan.steps.size())++upto;
                    waypoint=plan.steps[upto];
                    if(distance(here,waypoint)>24.f) {
                        moves+=moveUnit(*s,player,hero,waypoint);
                    }
                }else{
                    lastPlan=now;
                    if(nearestEnemy && enemyDistance<255)attacks+=orderTarget(*s,player,hero,nearestEnemy,851983);
                    if(frame%40==0)std::cout<<"NO_PLAN "<<now<<" targets="<<targets.size()<<" retreat="<<retreat<<"\n";
                }
            }
            for(auto& [id,u]:s->units())if(id!=hero && u->type==ghoulType && u->owner==player && number(u->life)>0.f && !u->hidden()){
                const auto away=distance(point(*u),here);
                if(retreat && away>170){if(frame%12==0)moves+=moveUnit(*s,player,id,here);continue;}
                if(nearestEnemy && away<400.f && u->combat.target!=nearestEnemy){attacks+=orderTarget(*s,player,id,nearestEnemy,851983);}
                else if(!nearestEnemy && away>230 && frame%12==0)moves+=moveUnit(*s,player,id,here);
            }
            if(frame%160==0)std::cout<<"STATE "<<now<<" x="<<number(h->x)<<" y="<<number(h->y)<<" hp="<<number(h->life)<<" target="<<plan.target<<" retreat="<<retreat<<"\n";
        }
        s->advance(.25);
    }
    const auto won=s->results().at(player).has_value() && *s->results().at(player)==0;
    rescues=vm.global("udg_RescuedAcolytesCount").bits;
    std::cout<<"CAMPAIGN rescued="<<rescues<<" won="<<won<<" next="<<s->nextLevel()<<" t="<<s->simulationTime()<<" moves="<<moves<<" attacks="<<attacks<<" casts="<<casts<<" potions="<<potions<<" clicks="<<continueClicks<<"\n";
    require(rescues==20 && won && s->units().contains(hero) && number(h->life)>0.f && s->exitRequest()!=SessionExit::None && s->nextLevel()=="Maps\\Campaign\\Undead02.w3m","Undead01 native win and Undead02 transition were not reached");
    require(moves && attacks && casts && potions && continueClicks==1,"Undead01 full-rescue player command coverage is incomplete");
    std::cout<<"PASS Undead01 full player rescue and next-level request\n";
}
}
int wmain(int argc,wchar_t** argv){try{if(argc!=3 && argc!=4)throw std::runtime_error("Usage: war3_undead_campaign_tests <data-root> <new-absolute-user-dir> <rescues|potion|full>");std::filesystem::path user(argv[2]);require(user.is_absolute() && std::filesystem::create_directory(user) && SetEnvironmentVariableW(L"MEGINE_WAR3_USER_DIR",user.c_str()),"User directory must be a new absolute directory with an existing parent");std::wstring_view mode=argc==4?argv[3]:L"rescues";if(mode==L"rescues")firstRescues(argv[1]);else if(mode==L"potion")potionPickup(argv[1]);else if(mode==L"full")fullRescue(argv[1]);else throw std::runtime_error("Unknown check mode");require(!GetModuleHandleW(L"Game.dll"),"Game.dll loaded");std::cout<<"RESULT passed=1 failed=0 game_dll_loaded=false\n";return 0;}catch(const std::exception& e){std::cerr<<"FAIL "<<e.what()<<'\n';return 1;}}
