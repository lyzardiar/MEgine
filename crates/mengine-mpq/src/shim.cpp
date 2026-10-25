// Author: MiYu. C ABI boundary for read-only StormLib operations and its process-global locale.
#include "StormLib.h"
#include <cstdint>
#include <mutex>

static std::mutex archive_locale_mutex;
static uint32_t last_error() { const auto error = SErrGetLastError(); return error ? error : 31u; }

extern "C" uint32_t mengine_mpq_open(const void *path, void **archive) {
    std::lock_guard<std::mutex> lock(archive_locale_mutex);
    return SFileOpenArchive(static_cast<LPCTSTR>(path), 0, MPQ_OPEN_READ_ONLY | MPQ_OPEN_NO_LISTFILE | MPQ_OPEN_NO_ATTRIBUTES, archive) ? 0 : last_error();
}

extern "C" void mengine_mpq_close(void *archive) { SFileCloseArchive(archive); }

extern "C" uint32_t mengine_mpq_open_member(void *archive, const char *name, uint32_t locale, void **member, uint64_t *size) {
    // StormLib selects the preferred locale during lookup. Restore it before another caller can open a member.
    std::lock_guard<std::mutex> lock(archive_locale_mutex);
    const auto previous = SFileGetLocale();
    SFileSetLocale(locale);
    const bool opened = SFileOpenFileEx(archive, name, SFILE_OPEN_FROM_MPQ, member);
    const auto error = opened ? 0 : last_error();
    SFileSetLocale(previous);
    if(error) return error;
    DWORD flags = 0;
    if(!SFileGetFileInfo(*member, SFileInfoFlags, &flags, sizeof(flags), nullptr)) {
        const auto failure = last_error(); SFileCloseFile(*member); *member = nullptr; return failure;
    }
    if(flags & (MPQ_FILE_DELETE_MARKER | MPQ_FILE_PATCH_FILE)) {
        SFileCloseFile(*member); *member = nullptr;
        // This private status is independent of the platform's ERROR_NOT_SUPPORTED value.
        return (flags & MPQ_FILE_DELETE_MARKER) ? ERROR_FILE_DELETED : 0x80000001u;
    }
    DWORD high = 0;
    SErrSetLastError(0);
    const auto low = SFileGetFileSize(*member, &high);
    if(low == SFILE_INVALID_SIZE && SErrGetLastError()) {
        const auto failure = last_error(); SFileCloseFile(*member); *member = nullptr; return failure;
    }
    *size = (static_cast<uint64_t>(high) << 32) | low;
    return 0;
}

extern "C" uint32_t mengine_mpq_read(void *member, void *buffer, uint32_t size, uint32_t *read) {
    DWORD actual = 0;
    const auto error = SFileReadFile(member, buffer, size, &actual, nullptr) ? 0 : last_error();
    *read = actual;
    return error;
}

extern "C" void mengine_mpq_close_member(void *member) { SFileCloseFile(member); }
