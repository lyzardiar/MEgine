// Author: MiYu. Bounded little-endian records for independent client snapshot components.
#pragma once
#include "binary.h"

namespace war3 {
class SnapshotWriter {
    Bytes bytes_;
    size_t limit_;
public:
    explicit SnapshotWriter(size_t limit) : limit_(limit) {}
    void raw(std::span<const std::uint8_t> bytes){if(bytes.size()>limit_-bytes_.size())throw std::runtime_error("Snapshot byte budget exceeded");bytes_.insert(bytes_.end(),bytes.begin(),bytes.end());}
    void u32(std::uint32_t value){std::uint8_t bytes[]{std::uint8_t(value),std::uint8_t(value>>8),std::uint8_t(value>>16),std::uint8_t(value>>24)};raw(bytes);}
    void u64(std::uint64_t value){u32(std::uint32_t(value));u32(std::uint32_t(value>>32));}
    void size(size_t value){if(value>UINT32_MAX)throw std::runtime_error("Snapshot count exceeds encoding");u32(std::uint32_t(value));}
    void text(std::string_view value,size_t max){if(value.size()>max)throw std::runtime_error("Snapshot text exceeds budget");size(value.size());raw({reinterpret_cast<const std::uint8_t*>(value.data()),value.size()});}
    Bytes finish(){return std::move(bytes_);}
};
inline std::string snapshotText(Binary& input,size_t max){auto size=input.u32();if(size>max)throw std::runtime_error("Snapshot text exceeds budget");auto bytes=input.take(size);return {reinterpret_cast<const char*>(bytes.data()),bytes.size()};}
inline std::uint64_t snapshotU64(Binary& input){auto low=input.u32(),high=input.u32();return std::uint64_t(low)|(std::uint64_t(high)<<32);}
inline Bytes sealSnapshot(Bytes bytes,size_t budget){if(budget<64 || bytes.size()>budget-64)throw std::runtime_error("Snapshot byte budget exceeded");auto digest=sha256(bytes);bytes.insert(bytes.end(),digest.begin(),digest.end());return bytes;}
inline std::span<const std::uint8_t> openSnapshot(std::span<const std::uint8_t> bytes,size_t budget){if(bytes.size()>budget || bytes.size()<64)throw std::runtime_error("Invalid snapshot digest or byte budget");auto content=bytes.first(bytes.size()-64),saved=bytes.last(64);auto digest=sha256(content);if(!std::equal(saved.begin(),saved.end(),digest.begin(),digest.end()))throw std::runtime_error("Snapshot digest mismatch");return content;}
}
