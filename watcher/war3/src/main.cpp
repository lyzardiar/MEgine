// Author: MiYu. Standalone native Warcraft client entry point.
#include "archive.h"
#include "renderer.h"
#include <memory>

namespace war3 {
struct WindowState { Renderer* renderer = nullptr; bool minimized = false; };
LRESULT CALLBACK windowProc(HWND window, UINT message, WPARAM wParam, LPARAM lParam) {
    auto state = reinterpret_cast<WindowState*>(GetWindowLongPtrW(window, GWLP_USERDATA));
    if (message == WM_NCCREATE) { auto create = reinterpret_cast<CREATESTRUCTW*>(lParam); state = static_cast<WindowState*>(create->lpCreateParams); SetWindowLongPtrW(window, GWLP_USERDATA, reinterpret_cast<LONG_PTR>(state)); }
    if (message == WM_SIZE && state) { state->minimized = wParam == SIZE_MINIMIZED; if (state->renderer) state->renderer->resize(LOWORD(lParam), HIWORD(lParam)); return 0; }
    if (message == WM_KEYDOWN && wParam == VK_ESCAPE) { DestroyWindow(window); return 0; }
    if (message == WM_DESTROY) { PostQuitMessage(0); return 0; }
    return DefWindowProcW(window, message, wParam, lParam);
}
int run(HINSTANCE instance) {
    auto options = Options::parse();
    Log log(options.log);
    log.write("client=war3 architecture=x86 renderer=" + options.renderer);
    Archives archives(options.dataRoot);
    log.write("common_archives=" + std::to_string(archives.commonCount()));
    if (!options.map.empty()) archives.mountMap(options.map);
    auto font = archives.read("Fonts\\FRIZQT__.TTF");
    if (!font) throw std::runtime_error("Missing original font");
    log.write("font_bytes=" + std::to_string(font->bytes.size()) + " source=" + font->source);
    if (!options.map.empty()) {
        auto terrain = archives.read("war3map.w3e");
        if (!terrain) throw std::runtime_error("Map has no war3map.w3e");
        log.write("terrain_bytes=" + std::to_string(terrain->bytes.size()));
    }
    if (GetModuleHandleW(L"Game.dll")) throw std::runtime_error("Game.dll must not be loaded");
    if (options.probe) { log.write("probe=passed game_dll_loaded=false"); return 0; }
    SetProcessDPIAware();
    WNDCLASSEXW type{sizeof(type)};
    type.lpfnWndProc = windowProc; type.hInstance = instance; type.hCursor = LoadCursorW(nullptr, IDC_ARROW); type.lpszClassName = L"War3NativeClient";
    if (!RegisterClassExW(&type)) throw std::runtime_error("Cannot register window class");
    WindowState state;
    auto window = CreateWindowExW(0, type.lpszClassName, L"Warcraft III — Native Client", WS_OVERLAPPEDWINDOW, CW_USEDEFAULT, CW_USEDEFAULT, 1280, 960, nullptr, nullptr, instance, &state);
    if (!window) throw std::runtime_error("Cannot create native window");
    struct Close { HWND window; ~Close() { if (IsWindow(window)) DestroyWindow(window); } } close{window};
    Renderer renderer(window);
    state.renderer = &renderer;
    if (!options.hidden) ShowWindow(window, SW_SHOW);
    unsigned frames = 0;
    bool running = true;
    while (running) {
        MSG message{};
        while (PeekMessageW(&message, nullptr, 0, 0, PM_REMOVE)) { if (message.message == WM_QUIT) running = false; TranslateMessage(&message); DispatchMessageW(&message); }
        if (!running) break;
        if (state.minimized) { WaitMessage(); continue; }
        if (!renderer.begin()) { MsgWaitForMultipleObjectsEx(0, nullptr, 50, QS_ALLINPUT, MWMO_INPUTAVAILABLE); continue; }
        renderer.rect(40, 40, 360, 80, 0xff354f73);
        if (renderer.end()) ++frames;
        if (options.frames && frames >= options.frames) break;
    }
    state.renderer = nullptr;
    log.write("rendered_frames=" + std::to_string(frames) + " game_dll_loaded=" + (GetModuleHandleW(L"Game.dll") ? "true" : "false"));
    return 0;
}
}
int WINAPI wWinMain(HINSTANCE instance, HINSTANCE, PWSTR, int) {
    try { return war3::run(instance); }
    catch (const std::exception& error) { OutputDebugStringA(error.what()); std::ofstream log; try { auto options = war3::Options::parse(); log.open(options.log, std::ios::binary | std::ios::app); log << "fatal=" << error.what() << '\n'; if (options.hidden || options.probe) return 1; } catch (...) {} MessageBoxW(nullptr, war3::wide(error.what()).c_str(), L"War3", MB_OK | MB_ICONERROR); return 1; }
}
