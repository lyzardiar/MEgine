// Author: MiYu. Persistent typed 2SAJ globals and bounded array cells for a session host.
#pragma once
#include "jass_binary_bridge.h"

namespace war3 {
struct JassBinarySnapshotRefs {
    std::function<std::uint32_t(std::uint32_t)> handle;
    std::function<std::string(const jass::Value&)> encodeCode;
    std::function<jass::Value(std::string_view)> decodeCode;
    std::optional<size_t> symbolCount;
};
class JassBinaryStorage {
    struct Entry {JassBinaryNativeValue value;bool constant=false;std::map<std::uint32_t,JassBinaryNativeValue> elements;};
    std::map<std::string,Entry> entries_;
    size_t elementCount_=0;
public:
    explicit JassBinaryStorage(const std::map<std::string,JassBinaryGlobal>& globals);
    bool contains(const std::string& name) const;
    std::uint8_t type(const std::string& name) const;
    JassBinaryNativeValue read(const std::string& name) const;
    void write(const std::string& name,JassBinaryNativeValue value);
    JassBinaryNativeValue readArray(const std::string& name,std::uint32_t index,std::uint8_t type) const;
    void writeArray(const std::string& name,std::uint32_t index,JassBinaryNativeValue value);
    // Caller must bind snapshots to the same binary program and validate mapped identities.
    Bytes encodeGlobals(const JassBinarySnapshotRefs& refs={}) const;
    void restoreGlobals(std::span<const std::uint8_t> bytes,const JassBinarySnapshotRefs& refs={});
};
}
