// Author: MiYu. Hold a selected local save through confirmation before deleting it.
#pragma once
#include "platform.h"
#include <memory>

namespace war3 {
class ManualSaveDeletion {
    std::vector<std::shared_ptr<void>> handles_;
    HANDLE file_=INVALID_HANDLE_VALUE;
    ManualSaveDeletion()=default;
public:
    static std::unique_ptr<ManualSaveDeletion> prepare(const fs::path& dataRoot,const std::wstring& name);
    void remove();
};
}
