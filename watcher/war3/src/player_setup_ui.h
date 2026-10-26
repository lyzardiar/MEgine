// Author: MiYu. Reusable source PlayerSlot controls bound to a native setup draft.
#pragma once
#include "glue.h"
#include "setup.h"

namespace war3 {
class PlayerSetupUi {
    enum class Field {Control,Race,Team,Color,Handicap};
    struct Binding {unsigned player;Field field;std::vector<unsigned> values;};
    struct Row {std::optional<unsigned> player;std::string title;};
    GlueScreen& screen_;
    PlayerSetup* setup_=nullptr;
    std::map<std::string,Binding> bindings_;
    std::vector<Row> rows_;
    std::set<std::string> enabled_;
    size_t scroll_=0;
    unsigned capacity_=1;
    float rowHeight_=.025f;
    void sync();
    void layout();
    std::string teamName(unsigned team) const;
public:
    explicit PlayerSetupUi(GlueScreen& screen);
    void bind(PlayerSetup* setup);
    const std::set<std::string>& enabled() const {return enabled_;}
    void input(const UiInput& input);
    bool changed();
    void headings();
};
}
