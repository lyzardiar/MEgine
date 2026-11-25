// Author: MiYu. Reject script inputs outside the recorded local command and simulation stream.
#include "replay_solo.h"
#include "jass_module.h"
#include <algorithm>
#include <stdexcept>

namespace war3 {
namespace {
bool outsideReplay(std::string_view name) {
    for(auto prefix:{"Dz","EX","BlzGetLocal","Preload","GetCamera","GetSound","SaveGame","LoadGame","InitGameCache","IsFogged","IsMasked","IsVisible","IsLocationFogged","IsLocationMasked","IsLocationVisible"})
        if(name.starts_with(prefix))return true;
    for(auto native:{"ForceUIKey","ForceUICancel","DisplayLoadDialog","ChangeLevel","RestartGame","PlayModelCinematic","PlayCinematic","ReloadGameCachesFromDisk","RenameSaveDirectory","RemoveSaveDirectory","CopySaveGame","SaveDirectoryExists","SetCampaignAvailable","SetMissionAvailable","SetTutorialCleared","SetCampaignMenuRace","SetCampaignMenuRaceEx","TriggerWaitForSound","StartMeleeAI","StartCampaignAI","GetLocalizedString","GetLocalizedHotkey","FogEnable","IsUnitInvisible","IsUnitVisible"})
        if(name==native)return true;
    return false;
}
}

void validateSoloReplayScript(const jass::Module& module) {
    using namespace jass;
    const auto& program=module.program();
    std::vector<bool> seenFunctions(program.functions().size()),seenExpressions(program.expressionCount()),seenStatements(program.statementCount());
    std::vector<Id> functions{module.functionId("config"),module.functionId("main")},expressions,statements;
    for(const auto& global:program.globals())expressions.push_back(global.initializer);
    while(!functions.empty() || !expressions.empty() || !statements.empty()){
        if(!functions.empty()){
            auto id=functions.back();functions.pop_back();
            if(id==none || seenFunctions.at(id))continue;
            seenFunctions[id]=true;
            const auto& function=program.functions().at(id);
            if(function.native){
                if(outsideReplay(function.name))throw std::runtime_error("单机回放不支持地图脚本调用 "+function.name);
                continue;
            }
            for(const auto& local:function.locals)expressions.push_back(local.initializer);
            statements.insert(statements.end(),function.body.begin(),function.body.end());
        }else if(!statements.empty()){
            auto id=statements.back();statements.pop_back();
            if(seenStatements.at(id))continue;
            seenStatements[id]=true;
            const auto& s=program.statement(id);
            expressions.push_back(s.index);expressions.push_back(s.value);
            statements.insert(statements.end(),s.body.begin(),s.body.end());
            for(const auto& branch:s.branches){
                expressions.push_back(branch.condition);
                statements.insert(statements.end(),branch.statements.begin(),branch.statements.end());
            }
        }else{
            auto id=expressions.back();expressions.pop_back();
            if(id==none || seenExpressions.at(id))continue;
            seenExpressions[id]=true;
            const auto& e=program.expression(id);
            expressions.insert(expressions.end(),e.operands.begin(),e.operands.end());
            if(e.kind!=ExpressionKind::Call && e.kind!=ExpressionKind::Function)continue;
            auto target=module.binding(id).index;
            if(target==none)throw std::runtime_error("单机回放无法确定脚本调用目标。");
            if(program.functions().at(target).name=="ExecuteFunc"){
                if(e.kind!=ExpressionKind::Call || e.operands.size()!=1)throw std::runtime_error("单机回放不支持动态 ExecuteFunc。");
                const auto& argument=program.expression(e.operands.front());
                const auto plainName=argument.kind==ExpressionKind::String && !argument.text.starts_with("TRIGSTR_") && std::all_of(argument.text.begin(),argument.text.end(),[](char c){return (c>='A' && c<='Z') || (c>='a' && c<='z') || (c>='0' && c<='9') || c=='_';});
                auto called=plainName?module.functionId(argument.text):none;
                if(called==none || program.functions()[called].native || !program.functions()[called].parameters.empty() || program.functions()[called].result!="nothing")
                    throw std::runtime_error("单机回放不支持动态 ExecuteFunc。");
                functions.push_back(called);
            }
            functions.push_back(target);
        }
    }
}
}
