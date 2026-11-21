// Author: MiYu. Extended synchronized LAN match fixture.
#pragma once
#include "lan_host.h"
#include "lan_join.h"
#include "lan_local_identity.h"
#include "lan_setup.h"

void runLanLongMatch(war3::LanHost* host,war3::LanJoin* peer,war3::ScriptSession& session,war3::LanLocalIdentity& identity,const war3::LanSessionSetup& setup,std::string_view mapPath,const std::filesystem::path& replayPath);
