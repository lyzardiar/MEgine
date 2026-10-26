// Author: MiYu. Standalone native Warcraft client entry point.
#include "archive.h"
#include "renderer.h"
#include "image.h"
#include "media.h"
#include "model.h"
#include "glue.h"
#include "map_browser.h"
#include "jass.h"
#include <memory>
#include <shellapi.h>

namespace war3 {
struct WindowState { Renderer* renderer = nullptr; bool minimized = false,hidden = false; int mouseX = 0, mouseY = 0, pressX = 0, pressY = 0, wheel=0,lastClickX=0,lastClickY=0; bool click = false, down = false,doubleClick=false; unsigned key = 0; DWORD lastClickTime=0; };
LRESULT CALLBACK windowProc(HWND window, UINT message, WPARAM wParam, LPARAM lParam) {
    auto state = reinterpret_cast<WindowState*>(GetWindowLongPtrW(window, GWLP_USERDATA));
    if (message == WM_NCCREATE) { auto create = reinterpret_cast<CREATESTRUCTW*>(lParam); state = static_cast<WindowState*>(create->lpCreateParams); SetWindowLongPtrW(window, GWLP_USERDATA, reinterpret_cast<LONG_PTR>(state)); }
    if (message == WM_SIZE && state) { state->minimized = wParam == SIZE_MINIMIZED; if (state->renderer) state->renderer->resize(LOWORD(lParam), HIWORD(lParam)); return 0; }
    if (message == WM_MOUSEMOVE && state) { state->mouseX = static_cast<short>(LOWORD(lParam)); state->mouseY = static_cast<short>(HIWORD(lParam)); return 0; }
    if (message == WM_LBUTTONDOWN && state) { state->pressX=state->mouseX=static_cast<short>(LOWORD(lParam));state->pressY=state->mouseY=static_cast<short>(HIWORD(lParam));state->down=true;SetCapture(window);return 0; }
    if (message == WM_LBUTTONUP && state) { state->mouseX = static_cast<short>(LOWORD(lParam)); state->mouseY = static_cast<short>(HIWORD(lParam)); state->click = state->down;state->doubleClick=state->click && state->lastClickTime && DWORD(GetMessageTime())-state->lastClickTime<=GetDoubleClickTime() && abs(state->mouseX-state->lastClickX)*2<GetSystemMetrics(SM_CXDOUBLECLK) && abs(state->mouseY-state->lastClickY)*2<GetSystemMetrics(SM_CYDOUBLECLK);if(state->click){state->lastClickTime=state->doubleClick?0:DWORD(GetMessageTime());state->lastClickX=state->mouseX;state->lastClickY=state->mouseY;}state->down=false;ReleaseCapture();return 0; }
    if (message == WM_MOUSEWHEEL && state) {state->wheel+=static_cast<short>(HIWORD(wParam));return 0;}
    if (message == WM_CAPTURECHANGED && state) { state->down=false;return 0; }
    if (message == WM_TIMER && wParam==1 && state) {KillTimer(window,1);ShowWindow(window,SW_RESTORE);if(state->hidden)ShowWindow(window,SW_HIDE);state->minimized=false;return 0;}
    if (message == WM_KEYDOWN && state) state->key=unsigned(wParam);
    if (message == WM_DESTROY) { PostQuitMessage(0); return 0; }
    return DefWindowProcW(window, message, wParam, lParam);
}
int run(HINSTANCE instance) {
    auto options = Options::parse();
    Log log(options.log);
    log.write("client=war3 architecture=x86 renderer=" + options.renderer);
    Archives archives(options.dataRoot);
    log.write("common_archives=" + std::to_string(archives.commonCount()));
    if(options.scriptCheck){archives.mountMap(options.map);auto started=GetTickCount64();auto program=jass::Program::read(archives);auto natives=std::count_if(program.functions().begin(),program.functions().end(),[](auto& f){return f.native;});for(auto& source:program.sources())log.write("jass_source="+source.name+" bytes="+std::to_string(source.text.size())+" origin="+source.origin);log.write("jass_types="+std::to_string(program.types().size())+" globals="+std::to_string(program.globals().size())+" natives="+std::to_string(natives)+" functions="+std::to_string(program.functions().size()-natives)+" expressions="+std::to_string(program.expressionCount())+" statements="+std::to_string(program.statementCount())+" elapsed_ms="+std::to_string(GetTickCount64()-started));if(GetModuleHandleW(L"Game.dll"))throw std::runtime_error("Game.dll must not be loaded");log.write("script_check=passed game_dll_loaded=false");return 0;}
    auto font = archives.read(skinValue(archives,"MasterFont","Fonts\\FRIZQT__.TTF"));
    if (!font) throw std::runtime_error("Missing original font");
    log.write("font_bytes=" + std::to_string(font->bytes.size()) + " source=" + font->source);
    if (options.probe && !options.map.empty()) {
        archives.mountMap(options.map);auto map=MapData::read(archives);
        log.write("map_name="+map.info.name+" vertices="+std::to_string(map.terrain.width)+"x"+std::to_string(map.terrain.height)+" players="+std::to_string(map.info.playablePlayers()));
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
    enum class Screen {Main,Single,Maps};Screen screen=Screen::Main;
    std::unique_ptr<GlueScreen> singleMenu;
    std::unique_ptr<MapBrowser> browser;
    std::unique_ptr<Music> music;
    if (!options.mute) {
        try { music = std::make_unique<Music>(options.dataRoot, archives.read("Sound\\Music\\mp3Music\\War3XMainScreen.mp3")); log.write("music=miles_mp3_memory_playing"); }
        catch (const std::exception& error) { log.write(std::string("audio_unavailable=") + error.what()); }
    }
    if (!options.hidden) ShowWindow(window, SW_SHOW);
    unsigned frames = 0;
    bool running = true;
    auto started = GetTickCount64();
    unsigned windowStage=0,menuStage=0,menuTabs=0;
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
        if(options.menuCheck) {
            if(frames==10)PostMessageW(window,WM_KEYDOWN,VK_RETURN,0);
            if(frames==25)PostMessageW(window,WM_KEYDOWN,VK_SPACE,0);
            if(frames==40){if(screen!=Screen::Maps || !browser || !browser->info() || !browser->setup() || !fs::equivalent(browser->selectedMap(),options.map))throw std::runtime_error("Menu selection check failed");auto& players=browser->info()->players;auto first=std::find_if(players.begin(),players.end(),[](auto& p){return p.type==1;});if(first==players.end() || browser->setup()->localPlayer()!=unsigned(first->id))throw std::runtime_error("Menu local player source ID differs");log.write("menu_check=selected "+utf8(browser->selectedMap().wstring())+" local="+std::to_string(first->id));}
            if(frames==42){auto [x,y]=browser->selectedCenter();float scale=std::min(renderer.width()/.8f,renderer.height()/.6f);auto pos=MAKELPARAM(int((renderer.width()-.8f*scale)/2+x*scale),int((renderer.height()-.6f*scale)/2+y*scale));SendMessageW(window,WM_MOUSEMOVE,0,pos);SendMessageW(window,WM_LBUTTONDOWN,MK_LBUTTON,pos);SendMessageW(window,WM_LBUTTONUP,0,pos);}
            if(frames==45)SendMessageW(window,WM_MOUSEWHEEL,MAKEWPARAM(0,-WHEEL_DELTA),0);
            if(frames==46)SendMessageW(window,WM_MOUSEWHEEL,MAKEWPARAM(0,WHEEL_DELTA),0);
            if(frames>=52 && frames%2==0){auto key=[&](unsigned value){PostMessageW(window,WM_KEYDOWN,value,0);};switch(menuStage){
                case 0:if(screen!=Screen::Maps || browser->focus()!="MapListBox")throw std::runtime_error("Map row click did not focus list");key(VK_RETURN);++menuStage;break;
                case 1:{if(screen!=Screen::Maps || (browser->focus()!="MapListBox" && menuTabs==0))throw std::runtime_error("Map list Enter activated an unrelated control");auto id=browser->setup()->localPlayer();if(!id)throw std::runtime_error("Missing local setup player");auto target="player-"+std::to_string(*id)+"/HandicapMenu";if(browser->focus()!=target){if(++menuTabs>128)throw std::runtime_error("Tab did not reach local handicap");key(VK_TAB);}else{key(VK_RETURN);++menuStage;menuTabs=0;}break;}
                case 2:if(!browser->popupOpen())throw std::runtime_error("Handicap popup did not open");key(VK_DOWN);++menuStage;break;
                case 3:if(!browser->popupOpen())throw std::runtime_error("Handicap popup closed during navigation");key(VK_RETURN);++menuStage;break;
                case 4:{auto id=browser->setup()->localPlayer();if(!id || browser->setup()->find(*id)->handicap!=90 || browser->popupOpen())throw std::runtime_error("Handicap draft edit failed");log.write("menu_check=handicap_90");auto [x,y]=browser->selectedCenter();float factor=std::min(renderer.width()/.8f,renderer.height()/.6f);auto pos=MAKELPARAM(int((renderer.width()-.8f*factor)/2+x*factor),int((renderer.height()-.6f*factor)/2+y*factor));SendMessageW(window,WM_LBUTTONDOWN,MK_LBUTTON,pos);SendMessageW(window,WM_LBUTTONUP,0,pos);++menuStage;break;}
                case 5:{auto id=browser->setup()->localPlayer();if(!id || browser->setup()->find(*id)->handicap!=90)throw std::runtime_error("Reselecting map discarded setup edits");auto target="player-"+std::to_string(*id)+"/HandicapMenu";if(browser->focus()!=target){if(++menuTabs>128)throw std::runtime_error("Tab did not return to handicap");key(VK_TAB);}else{key(VK_RETURN);++menuStage;menuTabs=0;}break;}
                case 6:if(!browser->popupOpen())throw std::runtime_error("Handicap popup did not reopen");key(VK_ESCAPE);++menuStage;break;
                case 7:if(screen!=Screen::Maps || browser->popupOpen())throw std::runtime_error("Popup Escape left map browser");++menuStage;break;
                case 8:if(browser->focus()!="CancelButton"){if(++menuTabs>128)throw std::runtime_error("Tab did not reach map cancel");key(VK_TAB);}else{key(VK_SPACE);++menuStage;}break;
                case 9:if(screen!=Screen::Single)throw std::runtime_error("Map browser cancel check failed");key(VK_TAB);++menuStage;break;
                case 10:if(singleMenu->focus()!="CancelButton")throw std::runtime_error("Single-player cancel focus differs");key(VK_RETURN);++menuStage;break;
                case 11:if(screen!=Screen::Main)throw std::runtime_error("Single-player keyboard cancel check failed");key('S');++menuStage;break;
                case 12:if(screen!=Screen::Single)throw std::runtime_error("Single-player shortcut check failed");key('G');++menuStage;break;
                case 13:if(screen!=Screen::Maps)throw std::runtime_error("Map browser shortcut check failed");key('A');++menuStage;break;
                case 14:if(screen!=Screen::Single)throw std::runtime_error("Map browser shortcut cancel failed");key(VK_ESCAPE);++menuStage;break;
                case 15:if(screen!=Screen::Main)throw std::runtime_error("Single-player Escape check failed");log.write("menu_check=passed");key('Q');++menuStage;break;
                default:break;
            }}
        }
        if (state.minimized) { WaitMessage(); continue; }
        if (!renderer.begin()) { MsgWaitForMultipleObjectsEx(0, nullptr, 50, QS_ALLINPUT, MWMO_INPUTAVAILABLE); continue; }
        float scale = std::min(renderer.width() / 800.f, renderer.height() / 600.f);
        float left = (renderer.width() - 800 * scale) / 2, top = (renderer.height() - 600 * scale) / 2;
        auto draw = [&](float x, float y, float w, float h, DWORD color, IDirect3DTexture9* texture) { renderer.rect(left + x * scale, top + y * scale, w * scale, h * scale, color, texture); };
        menu.draw(options.timeMs.value_or(GetTickCount64()-started), float(renderer.width()) / renderer.height(),true);
        UiInput input{(state.mouseX-left)/(scale*1000),(state.mouseY-top)/(scale*1000),(state.pressX-left)/(scale*1000),(state.pressY-top)/(scale*1000),state.click,state.down,state.key,state.wheel/WHEEL_DELTA,state.doubleClick,(GetKeyState(VK_SHIFT)&0x8000)!=0};
        std::string action;
        if(screen==Screen::Main){draw(90,15,512,256,0xffffffff,logo.Get());action=mainMenu.draw("ControlLayer",input,{"SinglePlayerButton","ExitButton"});if(input.key==VK_ESCAPE)action="ExitButton";if(action=="SinglePlayerButton"){if(!singleMenu){singleMenu=std::make_unique<GlueScreen>(archives,images,renderer,text,"UI\\FrameDef\\Glue\\SinglePlayerMenu.fdf","SinglePlayerMenu");singleMenu->visible("ProfilePanel",false);}screen=Screen::Single;}if(action=="ExitButton"){if(options.windowCheck && windowStage<6)throw std::runtime_error("Cancelled pointer input activated ExitButton");running=false;}}
        else if(screen==Screen::Single){action=singleMenu->draw("SinglePlayerMenu",input,{"SkirmishButton","CancelButton"});if(input.key==VK_ESCAPE)action="CancelButton";if(action=="CancelButton")screen=Screen::Main;if(action=="SkirmishButton"){if(!browser)browser=std::make_unique<MapBrowser>(archives,images,renderer,text,log,options.dataRoot,options.map);screen=Screen::Maps;}}
        else if(screen==Screen::Maps){action=browser->draw(input);if(action=="CancelButton")screen=Screen::Single;}
        if(!action.empty())log.write("ui_action="+action);
        state.click = false;
        state.key = 0;
        state.doubleClick=false;state.wheel%=WHEEL_DELTA;
        auto capture=options.frames && (frames+1==options.frames || !running)?options.capture:fs::path{};
        if(options.menuCheck && !options.capture.empty() && (frames==20 || frames==50)){capture=options.capture;capture.replace_filename(capture.stem().wstring()+(frames==20?L"-single":L"-browser")+L".png");}
        if(options.menuCheck && !options.capture.empty() && menuStage==3 && frames%2==0){capture=options.capture;capture.replace_filename(capture.stem().wstring()+L"-popup.png");}
        if (renderer.end(capture)) ++frames;
        if (options.frames && frames >= options.frames) break;
    }
    state.renderer = nullptr;
    if(options.menuCheck && (menuStage!=16 || running))throw std::runtime_error("Menu check ended before all navigation stages completed");
    log.write("client_size="+std::to_string(renderer.width())+"x"+std::to_string(renderer.height()));
    log.write("rendered_frames=" + std::to_string(frames) + " game_dll_loaded=" + (GetModuleHandleW(L"Game.dll") ? "true" : "false"));
    return 0;
}
}
int WINAPI wWinMain(HINSTANCE instance, HINSTANCE, PWSTR, int) {
    bool silent = false;
    int count = 0; auto arguments = CommandLineToArgvW(GetCommandLineW(), &count);
    if (arguments) { for (int i = 1; i < count; ++i) if (!wcscmp(arguments[i], L"--hidden") || !wcscmp(arguments[i], L"--probe") || !wcscmp(arguments[i], L"--script-check")) silent = true; LocalFree(arguments); }
    try { return war3::run(instance); }
    catch (const std::exception& error) { OutputDebugStringA(error.what()); try { auto options = war3::Options::parse(); std::ofstream log(options.log, std::ios::binary | std::ios::app); log << "fatal=" << error.what() << '\n'; } catch (...) {} if (!silent) MessageBoxW(nullptr, war3::wide(error.what()).c_str(), L"War3", MB_OK | MB_ICONERROR); return 1; }
}
