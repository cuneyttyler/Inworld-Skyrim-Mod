#include <cpr/cpr.h>

#include <nlohmann/json.hpp>
#include <sstream>
#include <string>
#include <thread>
#include <websocketpp/client.hpp>
#include <websocketpp/config/asio_no_tls_client.hpp>[
#include <iostream>
#include <future>
#include <thread>
#include <chrono>
#include <boost/shared_ptr.hpp>
#include <algorithm>

#include "PhonemeUtility.cpp"

using namespace RE::BSScript;
using json = nlohmann::json;

void Log(std::string log) { RE::ConsoleLog::GetSingleton()->Print(log.c_str()); }

static class InworldUtility {
public:
    static const void StartQuest(const char* questName) {
        auto quest = RE::TESForm::LookupByEditorID<RE::TESQuest>(questName);
        if (quest) quest->Start();
    }

    static const void MoveQuestToStage(const char* questName, int stage) {
        auto quest = RE::TESForm::LookupByEditorID<RE::TESQuest>(questName);
        if (quest) {
            quest->currentStage = stage;
            quest->GetMustUpdate();
        }
    }
};

using namespace RE::BSScript;
using namespace std;

string to_lower(string s) {
    for (char& c : s) c = tolower(c);
    return s;
}

static class SubtitleManager {
public:
    static void ShowSubtitle(string actorName, string subtitle, float duration) {
        HideSubtitle();

        auto hudMenu = RE::UI::GetSingleton()->GetMenu<RE::HUDMenu>(RE::HUDMenu::MENU_NAME);
        auto root = hudMenu->GetRuntimeData().root;
        auto iniSettings = RE::INISettingCollection::GetSingleton();
        uint32_t speakerNameColor = iniSettings->GetSetting("iSubtitleSpeakerNameColor:Interface")->GetUInt();

        std::this_thread::sleep_for(0.25s);

        subtitle = std::format("<font color='#{:06X}'>{}</font>: {}", speakerNameColor, actorName, subtitle.c_str());
        Log("Show subtitle: " + subtitle);
        if (subtitle.length() > 0) {
            RE::GFxValue asStr(subtitle.c_str());
            root.Invoke("ShowSubtitle", nullptr, &asStr, 1);
        } else {
            HideSubtitle();
        }
    }

    static void HideSubtitle() {
        auto hudMenu = RE::UI::GetSingleton()->GetMenu<RE::HUDMenu>(RE::HUDMenu::MENU_NAME);
        auto root = hudMenu->GetRuntimeData().root;
        root.Invoke("HideSubtitle", nullptr, nullptr, 0);
    }
};

static class InworldCaller {
public:
    inline static RE::Actor* conversationActor;
    inline static bool conversationOngoing = false;
    inline static bool stopSignal = false;
    inline static bool connecting = false;
    inline static int n2n_established_response_count = 0;
    inline static RE::Actor* N2N_SourceActor;
    inline static RE::Actor* N2N_TargetActor;
    inline static std::mutex sourceMutex;
    inline static std::mutex targetMutex;

    static std::string DisplayMessage(std::string str, int fontSize, int width) {
        std::stringstream ss(str);
        std::string word;
        std::string combined = "";
        std::string tracker = "";

        while (ss >> word) {
            if (((tracker.length() + word.length()) * fontSize) >= width) {
                combined += ";;;" + word;
                tracker = " " + word;
            } else {
                combined += " " + word;
                tracker += " " + word;
            }
        }
        return combined;
    }

    static void ShowReplyMessage(std::string message) {
        auto messageNew = DisplayMessage(message, 22, 1920);
        SKSE::ModCallbackEvent modEvent{"BLC_CreateSubTitleEvent", messageNew, 5.0f, nullptr};
        SKSE::GetModCallbackEventSource()->SendEvent(&modEvent);
    }

    static void SetHoldPosition(int set, RE::Actor* actor) {
        SKSE::ModCallbackEvent modEvent{"BLC_SetHoldPosition", "", set, actor};
        SKSE::GetModCallbackEventSource()->SendEvent(&modEvent);
    }

    static void N2N_Init() {
        SKSE::ModCallbackEvent modEvent{"BLC_Start_N2N", "", 1.0f, nullptr};
        SKSE::GetModCallbackEventSource()->SendEvent(&modEvent);
        N2N_Init_Source();
        N2N_Init_Target();
    }

    static void N2N_Init_Source() {
        SKSE::ModCallbackEvent modEvent{"BLC_Start_N2N_Source", "", 1.0f, InworldCaller::N2N_SourceActor};
        SKSE::GetModCallbackEventSource()->SendEvent(&modEvent);
    }

    static void N2N_Init_Target() {
        SKSE::ModCallbackEvent modEvent{"BLC_Start_N2N_Target", "", 1.0f, InworldCaller::N2N_TargetActor};
        SKSE::GetModCallbackEventSource()->SendEvent(&modEvent);
    }

    static void Start(RE::Actor* actor) {
        Log("SendCallback " + string(actor->GetName()));
        SKSE::ModCallbackEvent modEvent{"BLC_Start", "", 1.0f, actor};
        SKSE::GetModCallbackEventSource()->SendEvent(&modEvent);
        InworldCaller::conversationActor = actor;
        InworldCaller::connecting = true;
    }

    static void Stop() {
        SKSE::ModCallbackEvent modEvent{"BLC_Stop", "", 1.0f, nullptr};
        SKSE::GetModCallbackEventSource()->SendEvent(&modEvent);
        SetHoldPosition(1, InworldCaller::conversationActor);
        InworldCaller::stopSignal = false;
        InworldCaller::conversationOngoing = false;
        InworldCaller::conversationActor = nullptr;
    }

    static void SendFollowRequestAcceptedSignal() {
        SKSE::ModCallbackEvent modEvent{"BLC_Follow_Request_Accepted", "", 1.0f, InworldCaller::conversationActor};
        SKSE::GetModCallbackEventSource()->SendEvent(&modEvent);
    }

    static void N2N_TravelToNpcLocation() {
        SKSE::ModCallbackEvent modEvent{"BLC_TravelToNPCLocation", "", 1.0f, nullptr};
        SKSE::GetModCallbackEventSource()->SendEvent(&modEvent);
    }

    static void N2N_Stop() {
        n2n_established_response_count = 0;
        SKSE::ModCallbackEvent modEvent{"BLC_Stop_N2N", "", 1.0f, nullptr};
        SKSE::GetModCallbackEventSource()->SendEvent(&modEvent);
        InworldCaller::N2N_SourceActor = nullptr;
        InworldCaller::N2N_TargetActor = nullptr;
    }

    static void ConnectionSuccessful() {
        InworldCaller::conversationOngoing = true;
        InworldCaller::stopSignal = false;
        InworldCaller::connecting = false;
        SetHoldPosition(0, conversationActor);
    }

    static void Speak(std::string message, float duration) {
        SKSE::ModCallbackEvent modEvent{"BLC_Speak", "", 0.0075f, InworldCaller::conversationActor};
        SKSE::GetModCallbackEventSource()->SendEvent(&modEvent);
        SubtitleManager::ShowSubtitle(InworldCaller::conversationActor->GetName(), message, duration);
    }

    static void SpeakN2N(std::string message, int speaker, float duration) {
        std::lock(sourceMutex, targetMutex);
        std::lock_guard<std::mutex> lk1(sourceMutex, std::adopt_lock);
        std::lock_guard<std::mutex> lk2(targetMutex, std::adopt_lock);
        if (speaker == 0) {
            SKSE::ModCallbackEvent modEvent{"BLC_Speak_N2N", "", 0, InworldCaller::N2N_SourceActor};
            SKSE::GetModCallbackEventSource()->SendEvent(&modEvent);
            SubtitleManager::ShowSubtitle(InworldCaller::N2N_SourceActor->GetName(), message, duration);
        } else {
            SKSE::ModCallbackEvent modEvent{"BLC_Speak_N2N", "", 1, InworldCaller::N2N_TargetActor};
            SKSE::GetModCallbackEventSource()->SendEvent(&modEvent);
            SubtitleManager::ShowSubtitle(InworldCaller::N2N_TargetActor->GetName(), message, duration);
        }
    }
};

#include "SocketManager.cpp"
#include "InworldEventSink.cpp"

static class EventWatcher {
    inline static vector<string> lines;
    static bool contains(string line) { return std::find(lines.begin(), lines.end(), line) != lines.end(); }

    static bool isDialogueMenuActive() { 
        RE::MenuTopicManager* topicManager = RE::MenuTopicManager::GetSingleton();
        return topicManager->speaker.get() != nullptr;
    }

public:
    class DialogueMenuEx : public RE::DialogueMenu {
    public:
        using ProcessMessage_t = decltype(&RE::DialogueMenu::ProcessMessage);
        inline static REL::Relocation<ProcessMessage_t> _ProcessMessage;

        void ProcessTopic(RE::MenuTopicManager* topicManager, RE::Actor* speaker) {
            if (topicManager->lastSelectedDialogue != nullptr) {
                RE::BSSimpleList<RE::DialogueResponse*> responses = topicManager->lastSelectedDialogue->responses;

                std::string fullResponse = "";
                for (const auto& response : responses) {
                    fullResponse.append(response->text.c_str());
                }

                string characterEventText = "";
                string playerEventText = string(RE::PlayerCharacter::GetSingleton()->GetName()) + " said \"" +
                                   string(topicManager->lastSelectedDialogue->topicText.c_str()) + "\".";
                

                 for (RE::Actor* actor : actors) {
                    if (actor->GetName() == speaker->GetName()) {
                        characterEventText = "You said \"" + string(fullResponse) + "\".";
                    } else {
                        characterEventText = string(speaker->GetName()) + " said \"" + string(fullResponse) + "\".";
                    } 

                    SocketManager::getInstance().SendLogEvent(actor, playerEventText);
                    SocketManager::getInstance().SendLogEvent(actor, characterEventText);
                }

                if (!contains(fullResponse)) {
                    lines.push_back(fullResponse);
                }
            }
        }

        RE::UI_MESSAGE_RESULTS ProcessMessage_Hook(RE::UIMessage& a_message) {
            RE::MenuTopicManager* topicManager = RE::MenuTopicManager::GetSingleton();
            RE::Actor* speaker = static_cast<RE::Actor*>(topicManager->speaker.get().get());

            switch (a_message.type.get()) {
                case RE::UI_MESSAGE_TYPE::kShow: {
                    ProcessTopic(topicManager, speaker);
                } break;
                case RE::UI_MESSAGE_TYPE::kHide: {
                    ProcessTopic(topicManager, speaker);
                } break;
            }

            return _ProcessMessage(this, a_message);
        }
    };

    inline static set<RE::Actor*> actors;

    static void WatchSubtitles() {
        if (isDialogueMenuActive()) return;

        for (RE::SubtitleInfo subtitle : RE::SubtitleManager::GetSingleton()->subtitles) {
            if (!contains(subtitle.subtitle.c_str()) && string(subtitle.subtitle.c_str()).find("...")  == std::string::npos) {
                for (RE::Actor* actor : actors) {
                    try {
                        string eventText = "";
                        if (actor->GetName() == subtitle.speaker.get().get()->GetName()) {
                            eventText = "You said \"" + string(subtitle.subtitle.c_str()) + "\".";
                        } else {
                        eventText = string(subtitle.speaker.get().get()->GetName()) + " said \"" +
                                    string(subtitle.subtitle.c_str()) + "\".";
                        }
                        SocketManager::getInstance().SendLogEvent(actor, eventText);
                    } catch (...) {
                    }
                }
                lines.push_back(subtitle.subtitle.c_str());
            }
        }
    }
};

class ModPort {
public:
    static bool Start(RE::StaticFunctionTag*, RE::Actor* target, string currentDateTime) {
        if (!target) {
            return false;
        }
        SocketManager::getInstance().connectTo(target, currentDateTime);

        return true;
    }

    static bool N2N_Initiate(RE::StaticFunctionTag*, RE::Actor* source, RE::Actor* target) {
        if (!source || !target) {
            return false;
        }

        SocketManager::getInstance().connectTo_N2N(source, target);

        return true;
    }

    static bool N2N_Start(RE::StaticFunctionTag*, string currentDateTime) {
        if (InworldCaller::N2N_SourceActor == nullptr || InworldCaller::N2N_TargetActor == nullptr) {
            return false;
        }

        SocketManager::getInstance().SendN2NStartSignal(InworldCaller::N2N_SourceActor,
           InworldCaller::N2N_TargetActor, currentDateTime);

        return true;
    }

    static bool LogEvent(RE::StaticFunctionTag*, RE::Actor* actor, string log) {
        if (actor == nullptr) {
            return false;
        }

         SocketManager::getInstance().SendLogEvent(actor, log);

        return true;
    }

    static bool WatchSubtitles(RE::StaticFunctionTag*) {
        EventWatcher::WatchSubtitles();

        return true;
    }

    static bool ClearActors(RE::StaticFunctionTag*) {
        EventWatcher::actors.empty();

        return true;
    }

    static bool SendActor(RE::StaticFunctionTag*, RE::Actor* actor) {
        EventWatcher::actors.insert(actor);

        return true;
    }
};

void OnMessage(SKSE::MessagingInterface::Message* message) {
    if (message->type == SKSE::MessagingInterface::kInputLoaded) {
        SocketManager::getInstance().initSocket();
        RE::BSInputDeviceManager::GetSingleton()->AddEventSink(InworldEventSink::GetSingleton());
    }
}

void writeInworldLog(const std::string& message) {
    std::ofstream logFile("InworldSkyrim.txt", std::ios::app);
    if (logFile.is_open()) {
        logFile << message << std::endl;
        logFile.close();
    }
}

bool RegisterPapyrusFunctions(RE::BSScript::IVirtualMachine* vm) {
    vm->RegisterFunction("Start", "InworldSKSE", &ModPort::Start);
    vm->RegisterFunction("N2N_Initiate", "InworldSKSE", &ModPort::N2N_Initiate);
    vm->RegisterFunction("N2N_Start", "InworldSKSE", &ModPort::N2N_Start);
    vm->RegisterFunction("LogEvent", "InworldSKSE", &ModPort::LogEvent);
    vm->RegisterFunction("WatchSubtitles", "InworldSKSE", &ModPort::WatchSubtitles);
    vm->RegisterFunction("ClearActors", "InworldSKSE", &ModPort::ClearActors);
    vm->RegisterFunction("SendActor", "InworldSKSE", &ModPort::SendActor);

    return true;
}

#include <ShellAPI.h>

void StartAudioBus() {
    auto mainPath = std::filesystem::current_path();
    auto clientPath = mainPath / "Inworld" / "Audio" / "AudioBloc.exe";
    writeInworldLog("Opening: " + clientPath.string());
    LPCWSTR exePath = clientPath.c_str();
    HINSTANCE result = ShellExecute(NULL, L"open", exePath, NULL, clientPath.parent_path().c_str(), SW_SHOWNORMAL);
}

void StartClient() {
    auto mainPath = std::filesystem::current_path();
    auto clientPath = mainPath / "Inworld" / "SkyrimClient.exe";
    writeInworldLog("Opening: " + clientPath.string());
    LPCWSTR exePath = clientPath.c_str();
    HINSTANCE result = ShellExecute(NULL, L"open", exePath, NULL, clientPath.parent_path().c_str(), SW_SHOWNORMAL);
    StartAudioBus();
}

#include "Hooks.h"

SKSEPluginLoad(const SKSE::LoadInterface* skse) {
    SKSE::Init(skse);
    
    StartClient();

    auto* eventSink = InworldEventSink::GetSingleton();

    // ScriptSource
    auto* eventSourceHolder = RE::ScriptEventSourceHolder::GetSingleton();
    
    // SKSE
    SKSE::GetCrosshairRefEventSource()->AddEventSink(eventSink);
    
    // Input Device
    SKSE::GetMessagingInterface()->RegisterListener(OnMessage);

    auto papyrus = SKSE::GetPapyrusInterface();
    if (papyrus) {
        papyrus->Register(RegisterPapyrusFunctions);
    }

    REL::Relocation<std::uintptr_t> vTable_dm(RE::VTABLE_DialogueMenu[0]);
    EventWatcher::DialogueMenuEx::_ProcessMessage =
        vTable_dm.write_vfunc(0x4, &EventWatcher::DialogueMenuEx::ProcessMessage_Hook);

    //Inworld::UpdatePCHook::Install();

    return true;
}