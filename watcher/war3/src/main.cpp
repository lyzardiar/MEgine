// Author: MiYu. Standalone native Warcraft client entry point.
#include "archive.h"
#include "renderer.h"
#include "image.h"
#include "media.h"
#include <memory>

namespace war3 {
struct WindowState { Renderer* renderer = nullptr; bool minimized = false; int mouseX = 0, mouseY = 0; bool click = false; };
LRESULT CALLBACK windowProc(HWND window, UINT message, WPARAM wParam, LPARAM lParam) {
    auto state = reinterpret_cast<WindowState*>(GetWindowLongPtrW(window, GWLP_USERDATA));
    if (message == WM_NCCREATE) { auto create = reinterpret_cast<CREATESTRUCTW*>(lParam); state = static_cast<WindowState*>(create->lpCreateParams); SetWindowLongPtrW(window, GWLP_USERDATA, reinterpret_cast<LONG_PTR>(state)); }
    if (message == WM_SIZE && state) { state->minimized = wParam == SIZE_MINIMIZED; if (state->renderer) state->renderer->resize(LOWORD(lParam), HIWORD(lParam)); return 0; }
    if (message == WM_MOUSEMOVE && state) { state->mouseX = static_cast<short>(LOWORD(lParam)); state->mouseY = static_cast<short>(HIWORD(lParam)); return 0; }
    if (message == WM_LBUTTONUP && state) { state->mouseX = static_cast<short>(LOWORD(lParam)); state->mouseY = static_cast<short>(HIWORD(lParam)); state->click = true; return 0; }
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
    Images images(options.dataRoot);
    auto loadImage = [&](const char* name) { auto member = archives.read(name); if (!member) throw std::runtime_error(std::string("Missing image: ") + name); auto image = images.decode(member->bytes); log.write(std::string("image=") + name + " width=" + std::to_string(image.width) + " height=" + std::to_string(image.height)); return image; };
    auto logoImage = loadImage("UI\\Glues\\MainMenu\\WarCraftIIILogo_exp\\War3xLogo.blp");
    auto panelImage = loadImage("UI\\Widgets\\EscMenu\\Human\\human-options-menu-background.blp");
    auto buttonImage = loadImage("UI\\Widgets\\EscMenu\\Human\\human-options-button-border-up.blp");
    auto footmanImage = loadImage("ReplaceableTextures\\CommandButtons\\BTNFootman.blp");
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
    Text text(renderer, font->bytes);
    auto logo = renderer.texture(logoImage.width, logoImage.height, logoImage.pixels);
    auto panel = renderer.texture(panelImage.width, panelImage.height, panelImage.pixels);
    auto button = renderer.texture(buttonImage.width, buttonImage.height, buttonImage.pixels);
    std::unique_ptr<Music> music;
    if (!options.mute) {
        try { music = std::make_unique<Music>(options.dataRoot, archives.read("Sound\\Music\\mp3Music\\War3XMainScreen.mp3")); log.write("music=miles_mp3_memory_playing"); }
        catch (const std::exception& error) { log.write(std::string("audio_unavailable=") + error.what()); }
    }
    if (!options.hidden) ShowWindow(window, SW_SHOW);
    unsigned frames = 0;
    bool running = true;
    while (running) {
        MSG message{};
        while (PeekMessageW(&message, nullptr, 0, 0, PM_REMOVE)) { if (message.message == WM_QUIT) running = false; TranslateMessage(&message); DispatchMessageW(&message); }
        if (!running) break;
        if (state.minimized) { WaitMessage(); continue; }
        if (!renderer.begin()) { MsgWaitForMultipleObjectsEx(0, nullptr, 50, QS_ALLINPUT, MWMO_INPUTAVAILABLE); continue; }
        float scale = std::min(renderer.width() / 800.f, renderer.height() / 600.f);
        float left = (renderer.width() - 800 * scale) / 2, top = (renderer.height() - 600 * scale) / 2;
        auto draw = [&](float x, float y, float w, float h, DWORD color, IDirect3DTexture9* texture) { renderer.rect(left + x * scale, top + y * scale, w * scale, h * scale, color, texture); };
        auto label = [&](std::wstring_view value, float x, float y, float h, DWORD color = 0xffffcc55) { text.draw(value, left + x * scale, top + y * scale, h * scale, color, true); };
        draw(0, 0, 800, 600, 0xff7088aa, panel.Get());
        draw(90, 15, 512, 256, 0xffffffff, logo.Get());
        std::wstring_view labels[] = {L"Single Player", L"Battle.net", L"Local Area Network", L"Options", L"Credits", L"Quit"};
        for (unsigned i = 0; i < 6; ++i) {
            float y = 255.f + i * 44;
            float mx = (state.mouseX - left) / scale, my = (state.mouseY - top) / scale;
            bool hover = mx >= 90 && mx < 380 && my >= y && my < y + 38;
            bool enabled = i == 5;
            draw(90, y, 290, 38, hover && enabled ? 0xffffffff : 0xffbbbbbb, button.Get());
            label(labels[i], 235, y + 5, 25, enabled ? 0xffffcc55 : 0xff7b8393);
            if (state.click && hover && enabled) running = false;
        }
        label(L"Warcraft III 1.27 — Native Client", 620, 568, 16, 0xffc0c5d0);
        state.click = false;
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
