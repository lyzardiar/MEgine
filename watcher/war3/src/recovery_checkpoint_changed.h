// Author: MiYu. Identify when the selected checkpoint was replaced before loading.
#pragma once
#include <stdexcept>

namespace war3 {
struct RecoveryCheckpointChanged : std::runtime_error {
    RecoveryCheckpointChanged():std::runtime_error("Checkpoint changed after selection"){}
};
}
