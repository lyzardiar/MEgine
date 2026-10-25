// Author: MiYu. Standalone native Warcraft client entry point.
#include "archive.h"
#include "renderer.h"
#include "image.h"
#include "media.h"
#include "model.h"
#include "glue.h"
#include <memory>
#include <shellapi.h>

namespace war3 {
struct WindowState { Renderer* renderer = nullptr; bool minimized = false,hidden = false; int mouseX = 0, mouseY = 0, pressX = 0, pressY = 0; bool click = false, down = false; unsigned key = 0; };
LRESULT CALLBACK windowProc(HWND window, UINT message, WPARAM wParam, LPARAM lParam) {
    auto state = reinterpret_cast<WindowState*>(GetWindowLongPtrW(window, GWLP_USERDATA));
    if (message == WM_NCCREATE) { auto create = reinterpret_cast<CREATESTRUCTW*>(lParam); state = static_cast<WindowState*>(create->lpCreateParams); SetWindowLongPtrW(window, GWLP_USERDATA, reinterpret_cast<LONG_PTR>(state)); }
    if (message == WM_SIZE && state) { state->minimized = wParam == SIZE_MINIMIZED; if (state->renderer) state->renderer->resize(LOWORD(lParam), HIWORD(lParam)); return 0; }
    if (message == WM_MOUSEMOVE && state) { state->mouseX = static_cast<short>(LOWORD(lParam)); state->mouseY = static_cast<short>(HIWORD(lParam)); return 0; }
    if (message == WM_LBUTTONDOWN && state) { state->pressX=state->mouseX=static_cast<short>(LOWORD(lParam));state->pressY=state->mouseY=static_cast<short>(HIWORD(lParam));state->down=true;SetCapture(window);return 0; }
    if (message == WM_LBUTTONUP && state) { state->mouseX = static_cast<short>(LOWORD(lParam)); state->mouseY = static_cast<short>(HIWORD(lParam)); state->click = state->down; state->down=false;ReleaseCapture();return 0; }
    if (message == WM_CAPTURECHANGED && state) { state->down=false;return 0; }
    if (message == WM_TIMER && wParam==1 && state) {KillTimer(window,1);ShowWindow(window,SW_RESTORE);if(state->hidden)ShowWindow(window,SW_HIDE);state->minimized=false;return 0;}
    if (message == WM_KEYDOWN && state) state->key=unsigned(wParam);
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
    auto font = archives.read(skinValue(archives,"MasterFont","Fonts\\FRIZQT__.TTF"));
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
    if(options.probe)loadImage("ReplaceableTextures\\CommandButtons\\BTNFootman.blp");
    if (GetModuleHandleW(L"Game.dll")) throw std::runtime_error("Game.dll must not be loaded");
    if (options.probe) { Model menu(archives, images, nullptr, "UI\\Glues\\MainMenu\\MainMenu3d_exp\\MainMenu3d_exp.mdx", log); log.write("probe=passed game_dll_loaded=false"); return 0; }
    SetProcessDPIAware();
    WNDCLASSEXW type{sizeof(type)};
    type.lpfnWndProc = windowProc; type.hInstance = instance; type.hCursor = LoadCursorW(nullptr, IDC_ARROW); type.lpszClassName = L"War3NativeClient";
    if (!RegisterClassExW(&type)) throw std::runtime_error("Cannot register window class");
    WindowState state;
    state.hidden=options.hidden;
    auto window = CreateWindowExW(0, type.lpszClassName, L"Warcraft III", WS_OVERLAPPEDWINDOW, CW_USEDEFAULT, CW_USEDEFAULT, 1280, 960, nullptr, nullptr, instance, &state);
    if (!window) throw std::runtime_error("Cannot create native window");
    struct Close { HWND window; ~Close() { if (IsWindow(window)) DestroyWindow(window); } } close{window};
    Renderer renderer(window, options.renderer == "d3d9-reference");
    log.write(std::string("driver=") + renderer.driver());
    state.renderer = &renderer;
    struct ClearRenderer {WindowState& state;~ClearRenderer(){state.renderer=nullptr;}} clearRenderer{state};
    Text text(renderer, font->bytes);
    auto logo = renderer.texture(logoImage.width, logoImage.height, logoImage.pixels);
    Model menu(archives, images, &renderer, "UI\\Glues\\MainMenu\\MainMenu3d_exp\\MainMenu3d_exp.mdx", log);
    GlueScreen mainMenu(archives,images,renderer,text,"UI\\FrameDef\\Glue\\MainMenu.fdf","MainMenuFrame");
    std::unique_ptr<Music> music;
    if (!options.mute) {
        try { music = std::make_unique<Music>(options.dataRoot, archives.read("Sound\\Music\\mp3Music\\War3XMainScreen.mp3")); log.write("music=miles_mp3_memory_playing"); }
        catch (const std::exception& error) { log.write(std::string("audio_unavailable=") + error.what()); }
    }
    if (!options.hidden) ShowWindow(window, SW_SHOW);
    unsigned frames = 0;
    bool running = true;
    auto started = GetTickCount64();
    unsigned windowStage=0;
    while (running) {
        MSG message{};
        while (PeekMessageW(&message, nullptr, 0, 0, PM_REMOVE)) { if (message.message == WM_QUIT) running = false; TranslateMessage(&message); DispatchMessageW(&message); }
        if (!running) break;
        if(options.windowCheck) {
            if(windowStage==0 && frames==15) {SetWindowPos(window,nullptr,0,0,960,720,SWP_NOMOVE|SWP_NOZORDER|SWP_NOACTIVATE);windowStage=1;log.write("window_check=resize_960_720");}
            if(windowStage==1 && frames==30) {ShowWindow(window,SW_MINIMIZE);if(!SetTimer(window,1,200,nullptr))throw std::runtime_error("Cannot schedule window restore");windowStage=2;log.write("window_check=minimize_restore");}
            if(windowStage==2 && frames==45) {SetWindowPos(window,nullptr,0,0,1280,960,SWP_NOMOVE|SWP_NOZORDER|SWP_NOACTIVATE);windowStage=3;log.write("window_check=resize_1280_960");}
            if(windowStage==3 && frames==75) {
                auto [x,y]=mainMenu.center("ExitButton");float scale=std::min(renderer.width()/.8f,renderer.height()/.6f);
                auto position=MAKELPARAM(int((renderer.width()-.8f*scale)/2+x*scale),int((renderer.height()-.6f*scale)/2+y*scale));
                SendMessageW(window,WM_LBUTTONDOWN,MK_LBUTTON,MAKELPARAM(-1,-1));SendMessageW(window,WM_LBUTTONUP,0,position);windowStage=4;log.write("window_check=drag_into_exit");
            }
            if(windowStage==4 && frames==80) {auto position=MAKELPARAM(state.mouseX,state.mouseY);SendMessageW(window,WM_LBUTTONDOWN,MK_LBUTTON,position);ReleaseCapture();SendMessageW(window,WM_LBUTTONUP,0,position);SendMessageW(window,WM_MOUSEMOVE,0,MAKELPARAM(-1,-1));windowStage=5;log.write("window_check=cancel_exit_capture");}
            if(windowStage==5 && frames==90) {PostMessageW(window,WM_KEYDOWN,'Q',0);windowStage=6;}
        }
        if (state.minimized) { WaitMessage(); continue; }
        if (!renderer.begin()) { MsgWaitForMultipleObjectsEx(0, nullptr, 50, QS_ALLINPUT, MWMO_INPUTAVAILABLE); continue; }
        float scale = std::min(renderer.width() / 800.f, renderer.height() / 600.f);
        float left = (renderer.width() - 800 * scale) / 2, top = (renderer.height() - 600 * scale) / 2;
        auto draw = [&](float x, float y, float w, float h, DWORD color, IDirect3DTexture9* texture) { renderer.rect(left + x * scale, top + y * scale, w * scale, h * scale, color, texture); };
        menu.draw(options.timeMs.value_or(GetTickCount64()-started), float(renderer.width()) / renderer.height(),true);
        draw(90, 15, 512, 256, 0xffffffff, logo.Get());
        UiInput input{(state.mouseX-left)/(scale*1000),(state.mouseY-top)/(scale*1000),(state.pressX-left)/(scale*1000),(state.pressY-top)/(scale*1000),state.click,state.down,state.key};
        if(mainMenu.draw("ControlLayer",input,{"ExitButton"})=="ExitButton") {if(options.windowCheck && windowStage<6)throw std::runtime_error("Cancelled pointer input activated ExitButton");running=false;log.write("ui_action=ExitButton");}
        state.click = false;
        state.key = 0;
        if (renderer.end(options.frames && (frames+1==options.frames || !running) ? options.capture : fs::path{})) ++frames;
        if (options.frames && frames >= options.frames) break;
    }
    state.renderer = nullptr;
    log.write("client_size="+std::to_string(renderer.width())+"x"+std::to_string(renderer.height()));
    log.write("rendered_frames=" + std::to_string(frames) + " game_dll_loaded=" + (GetModuleHandleW(L"Game.dll") ? "true" : "false"));
    return 0;
}
}
int WINAPI wWinMain(HINSTANCE instance, HINSTANCE, PWSTR, int) {
    bool silent = false;
    int count = 0; auto arguments = CommandLineToArgvW(GetCommandLineW(), &count);
    if (arguments) { for (int i = 1; i < count; ++i) if (!wcscmp(arguments[i], L"--hidden") || !wcscmp(arguments[i], L"--probe")) silent = true; LocalFree(arguments); }
    try { return war3::run(instance); }
    catch (const std::exception& error) { OutputDebugStringA(error.what()); try { auto options = war3::Options::parse(); std::ofstream log(options.log, std::ios::binary | std::ios::app); log << "fatal=" << error.what() << '\n'; } catch (...) {} if (!silent) MessageBoxW(nullptr, war3::wide(error.what()).c_str(), L"War3", MB_OK | MB_ICONERROR); return 1; }
}
