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
using namespace std;

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

static class Util {
public:
    inline static int LOG_LEVEL = 3;
    inline static uint32_t speakerNameColor;

    static void GetSettings() {
        auto iniSettings = RE::INISettingCollection::GetSingleton();
        speakerNameColor = iniSettings->GetSetting("iSubtitleSpeakerNameColor:Interface")->GetUInt();
    }

    static std::string GetActorName(RE::Actor* actor) {
        if (actor == nullptr) {
            return "";
        }

        if (auto xTextData = actor->extraList.GetByType<RE::ExtraTextDisplayData>(); xTextData) {
            return actor->GetDisplayFullName();
        }

        if (auto actorBase = actor->GetActorBase(); actorBase) {
            if (actorBase->shortName.size() > 0) {
                return actorBase->shortName.c_str();
            }
        }

        return actor->GetName();
    }

    static std::string toLower(std::string s) {
        for (char& c : s) c = tolower(c);
        return s;
    }

    static void ConsoleLog(std::string log) { RE::ConsoleLog::GetSingleton()->Print(log.c_str()); }
    
    static void writeInworldLog(const std::string& message, int level = 3) {
        if (level > LOG_LEVEL) {
            return;
        }

        std::string levelStr = "";
        switch (level) {
            case 1:
                levelStr = "ERROR: ";
                break;
            case 2:
                levelStr = "WARNING: ";
                break;
            case 3:
                levelStr = "INFO: ";
                break;
            case 4:
                levelStr = "DEBUG: ";
                break;
        }

        std::ofstream logFile("InworldSkyrim.log", std::ios::app);
        if (logFile.is_open()) {
            logFile << levelStr + message << std::endl;
            logFile.close();
        }
    }

    static std::string trim(std::string str) { return std::regex_replace(str, std::regex{R"(^\s+|\s+$)"}, ""); }
};

using namespace RE::BSScript;
using namespace std;

static class SubtitleManager {
public:
    static void ShowSubtitle(string actorName, string subtitle, float duration) {

        try {
            auto hudMenu = RE::UI::GetSingleton()->GetMenu<RE::HUDMenu>(RE::HUDMenu::MENU_NAME);
            auto root = hudMenu->GetRuntimeData().root;

            if (Util::trim(subtitle).length() > 0) {
                subtitle =
                    std::format("<font color='#{:06X}'>{}</font>: {}", Util::speakerNameColor, actorName, subtitle.c_str());
                RE::GFxValue asStr(subtitle.c_str());
                root.Invoke("ShowSubtitle", nullptr, &asStr, 1);
            } else {
                HideSubtitle();
            }
        } catch (const exception& e) {
            Util::writeInworldLog("Exception during ==ShowSubtitle==: " + string(e.what()), 1);
        } catch (...) {
            Util::writeInworldLog("Unknown exception during ==ShowSubtitle==.", 1);
        }
    }

    static void HideSubtitle() {
        try {
            auto hudMenu = RE::UI::GetSingleton()->GetMenu<RE::HUDMenu>(RE::HUDMenu::MENU_NAME);
            auto root = hudMenu->GetRuntimeData().root;
            root.Invoke("HideSubtitle", nullptr, nullptr, 0);
        } catch (const exception& e) {
            Util::writeInworldLog("Exception during ==HideSubtitle==: " + string(e.what()), 1);
        } catch (...) {
            Util::writeInworldLog("Unknown exception during ==HideSubtitle==.", 1);
        }
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
        Util::writeInworldLog("Starting dialogue between " + Util::GetActorName(InworldCaller::N2N_SourceActor) + " and " +
                        Util::GetActorName(InworldCaller::N2N_SourceActor) + ".", 3);
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
        Util::writeInworldLog("Starting dialogue with " + Util::GetActorName(actor) + ".", 3);
        SKSE::ModCallbackEvent modEvent{"BLC_Start", "", 1.0f, actor};
        SKSE::GetModCallbackEventSource()->SendEvent(&modEvent);
        InworldCaller::conversationActor = actor;
        InworldCaller::connecting = true;
    }

    static void Stop() {
        Util::writeInworldLog("Stopping dialogue with " + Util::GetActorName(InworldCaller::conversationActor) + ".", 3);
        SKSE::ModCallbackEvent modEvent{"BLC_Stop", "", 1.0f, nullptr};
        SKSE::GetModCallbackEventSource()->SendEvent(&modEvent);
        SetHoldPosition(1, InworldCaller::conversationActor);
        InworldCaller::stopSignal = false;
        InworldCaller::conversationOngoing = false;
        InworldCaller::conversationActor = nullptr;
        SubtitleManager::HideSubtitle();
    }

    static void Reset() {
        InworldCaller::conversationActor = nullptr;
        InworldCaller::connecting = false;
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
        Util::writeInworldLog("Stopping dialogue between " + Util::GetActorName(InworldCaller::N2N_SourceActor) + " and " +
                            Util::GetActorName(InworldCaller::N2N_SourceActor) + ".", 3);
        n2n_established_response_count = 0;
        SKSE::ModCallbackEvent modEvent{"BLC_Stop_N2N", "", 1.0f, nullptr};
        SKSE::GetModCallbackEventSource()->SendEvent(&modEvent);
        InworldCaller::N2N_SourceActor = nullptr;
        InworldCaller::N2N_TargetActor = nullptr;
        SubtitleManager::HideSubtitle();
    }

    static void ConnectionSuccessful() {
        Util::writeInworldLog("Connected to " + Util::GetActorName(conversationActor) + ".", 3);
        InworldCaller::conversationOngoing = true;
        InworldCaller::stopSignal = false;
        InworldCaller::connecting = false;
        SetHoldPosition(0, conversationActor);
    }

    static void SendResponseLog(RE::Actor* actor, string message) {
        SKSE::ModCallbackEvent modEvent{"BLC_SendResponseLog", message, 1, actor};
        SKSE::GetModCallbackEventSource()->SendEvent(&modEvent);
    }

    static void Speak(std::string message, float duration) {
        if (InworldCaller::conversationActor == nullptr) return;
        SKSE::ModCallbackEvent modEvent{"BLC_Speak", "", 0.0075f, InworldCaller::conversationActor};
        SKSE::GetModCallbackEventSource()->SendEvent(&modEvent);
        SendResponseLog(InworldCaller::conversationActor, message);
        SubtitleManager::ShowSubtitle(InworldCaller::conversationActor->GetName(), message, duration);
        this_thread::sleep_for(chrono::milliseconds((long)(duration * 1000)));
        SubtitleManager::HideSubtitle();
    }

    static void SpeakN2N(std::string message, int speaker, float duration) {
        Util::writeInworldLog("MESSAGE: " + message + ", " + to_string(speaker), 4);
        if (speaker == 0) {
            if (InworldCaller::N2N_SourceActor == nullptr) return;
            SKSE::ModCallbackEvent modEvent{"BLC_Speak_N2N", "", 0, InworldCaller::N2N_SourceActor};
            SKSE::GetModCallbackEventSource()->SendEvent(&modEvent);
            SendResponseLog(InworldCaller::N2N_SourceActor, message);
            SubtitleManager::ShowSubtitle(InworldCaller::N2N_SourceActor->GetName(), message, duration);
            this_thread::sleep_for(chrono::milliseconds((long)(duration * 1000)));
            SubtitleManager::HideSubtitle();
        } else {
            if (InworldCaller::N2N_TargetActor == nullptr) return;
            SKSE::ModCallbackEvent modEvent{"BLC_Speak_N2N", "", 1, InworldCaller::N2N_TargetActor};
            SKSE::GetModCallbackEventSource()->SendEvent(&modEvent);
            SendResponseLog(InworldCaller::N2N_TargetActor, message);
            SubtitleManager::ShowSubtitle(InworldCaller::N2N_TargetActor->GetName(), message, duration);
            this_thread::sleep_for(chrono::milliseconds((long)(duration * 1000)));
            SubtitleManager::HideSubtitle();
        }
    }
};

#include "SocketManager.cpp"

static class EventWatcher {
    inline static vector<string> lines;
    inline static vector<string> topics;
    static bool contains(string line) { return std::find(lines.begin(), lines.end(), line) != lines.end(); }
    static bool containsTopic(string topic) { return std::find(topics.begin(), topics.end(), topic) != topics.end(); }

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
            Util::writeInworldLog("Processing dialogue menu with " + Util::GetActorName(speaker), 4);

            if (topicManager->lastSelectedDialogue != nullptr) {
                RE::BSSimpleList<RE::DialogueResponse*> responses = topicManager->lastSelectedDialogue->responses;

                std::string fullResponse = "";
                for (const auto& response : responses) {
                    fullResponse.append(response->text.c_str());
                }

                string characterEventText = "";
                string playerEventText = string(RE::PlayerCharacter::GetSingleton()->GetName()) + " said \"" +
                                   string(topicManager->lastSelectedDialogue->topicText.c_str()) + "\".";
                
                if (!contains(playerEventText)) {
                    string actorsStr = "";
                    for (RE::Actor* actor : actors) {
                        SocketManager::getInstance().SendLogEvent(actor, playerEventText);
                        actorsStr += Util::GetActorName(actor) + ", ";
                    }
                    if (actorsStr.length() > 0) actorsStr = actorsStr.substr(0, actorsStr.length() - 2);
                    Util::writeInworldLog("Sending player event text == " + playerEventText + " == to [" + actorsStr + "] ==",
                                    4);

                    lines.push_back(playerEventText);
                }

                if (!contains(fullResponse)) {
                    string actorsStr = "";
                    for (RE::Actor* actor : actors) {
                        if (Util::GetActorName(actor) == Util::GetActorName(speaker)) {
                            characterEventText = "You said \"" + string(fullResponse) + "\".";
                        } else {
                            characterEventText =
                                string(Util::GetActorName(speaker)) + " said \"" + string(fullResponse) + "\".";
                        }

                        SocketManager::getInstance().SendLogEvent(actor, characterEventText);
                        actorsStr += Util::GetActorName(actor) + ", ";
                    }
                    if (actorsStr.length() > 0) actorsStr = actorsStr.substr(0, actorsStr.length() - 2);
                    Util::writeInworldLog(
                        "Sending character event text == " + playerEventText + " == to [" + actorsStr + "]", 4);
                    lines.push_back(fullResponse);
                }
            }
        }

        RE::UI_MESSAGE_RESULTS ProcessMessage_Hook(RE::UIMessage& a_message) {
            RE::MenuTopicManager* topicManager = RE::MenuTopicManager::GetSingleton();
            RE::Actor* speaker = static_cast<RE::Actor*>(topicManager->speaker.get().get());

            switch (a_message.type.get()) {
                case RE::UI_MESSAGE_TYPE::kUserEvent: {
                    ProcessTopic(topicManager, speaker);
                } break;
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

    static void SendSubtitle(RE::Actor* speaker, string subtitle) {
        if (subtitle.length() == 0) return;

        string actorsStr = "";
        for (RE::Actor* actor : actors) {
            string eventText = "";
            if (Util::GetActorName(actor) == Util::GetActorName(speaker)) {
                eventText = "You said \"" + string(subtitle) + "\".";
            } else {
                eventText = string(Util::GetActorName(speaker)) +
                            " said \"" + subtitle + "\".";
            }
            SocketManager::getInstance().SendLogEvent(actor, eventText);
            actorsStr += Util::GetActorName(actor) + ", ";
        }
        if (actorsStr.length() > 0) actorsStr = actorsStr.substr(0, actorsStr.length() - 2);
        Util::writeInworldLog(
            "Sending subtitle == " + subtitle + " == [" + actorsStr + "]", 4);
    }

    static void WatchSubtitles() {
        try {
            for (RE::SubtitleInfo subtitle : RE::SubtitleManager::GetSingleton()->subtitles) {
                if (!contains(subtitle.subtitle.c_str())) {
                    SendSubtitle(static_cast<RE::Actor*>(subtitle.speaker.get().get()), subtitle.subtitle.c_str());
                    lines.push_back(subtitle.subtitle.c_str());
                }
            }
        } catch (const exception& e) {
            Util::writeInworldLog("Exception during ==WatchSubtitles==: " + string(e.what()));
        } catch (...) {
            Util::writeInworldLog("Unknown exception during ==WatchSubtitles==.", 1);
        }
    }
};

#include "InworldEventSink.cpp"

class ModPort {
public:
    static bool Start(RE::StaticFunctionTag*, RE::Actor* target, string currentDateTime) {
        if (!target) {
            return false;
        }

        SocketManager::getInstance().connectTo(target, currentDateTime);

        return true;
    }

    static bool Stop(RE::StaticFunctionTag*) {
        SocketManager::getInstance().SendStopSignal();

        InworldCaller::Stop();
        InworldEventSink::GetSingleton()->conversationPair = nullptr;


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

        SocketManager::getInstance().SendN2NStartSignal(InworldCaller::N2N_SourceActor, InworldCaller::N2N_TargetActor,
                                                        currentDateTime);

        return true;
    }

    static bool N2N_Stop(RE::StaticFunctionTag*) {
        SocketManager::getInstance().SendN2NStopSignal();

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

    static bool SendResponseLog(RE::StaticFunctionTag*, RE::Actor* actor, string message) {
        EventWatcher::SendSubtitle(actor, message);

        return true;
    }
};

void OnMessage(SKSE::MessagingInterface::Message* message) {
    if (message->type == SKSE::MessagingInterface::kInputLoaded) {
        SocketManager::getInstance().initSocket();
        RE::BSInputDeviceManager::GetSingleton()->AddEventSink(InworldEventSink::GetSingleton());
    }
}

bool RegisterPapyrusFunctions(RE::BSScript::IVirtualMachine* vm) {
    vm->RegisterFunction("Start", "InworldSKSE", &ModPort::Start);
    vm->RegisterFunction("Stop", "InworldSKSE", &ModPort::Stop);
    vm->RegisterFunction("N2N_Initiate", "InworldSKSE", &ModPort::N2N_Initiate);
    vm->RegisterFunction("N2N_Start", "InworldSKSE", &ModPort::N2N_Start);
    vm->RegisterFunction("N2N_Stop", "InworldSKSE", &ModPort::N2N_Stop);
    vm->RegisterFunction("LogEvent", "InworldSKSE", &ModPort::LogEvent);
    vm->RegisterFunction("WatchSubtitles", "InworldSKSE", &ModPort::WatchSubtitles);
    vm->RegisterFunction("ClearActors", "InworldSKSE", &ModPort::ClearActors);
    vm->RegisterFunction("SendActor", "InworldSKSE", &ModPort::SendActor);
    vm->RegisterFunction("SendResponseLog", "InworldSKSE", &ModPort::SendResponseLog);

    return true;
}

#include <ShellAPI.h>

void StartAudioBus() {
    auto mainPath = std::filesystem::current_path();
    auto clientPath = mainPath / "Inworld" / "Audio" / "AudioBloc.exe";
    Util::writeInworldLog("Opening: " + clientPath.string(), 4);
    LPCWSTR exePath = clientPath.c_str();
    HINSTANCE result = ShellExecute(NULL, L"open", exePath, NULL, clientPath.parent_path().c_str(), SW_SHOWNORMAL);
}

void StartClient() {
    auto mainPath = std::filesystem::current_path();
    auto clientPath = mainPath / "Inworld" / "SkyrimClient.exe";
    Util::writeInworldLog("Opening: " + clientPath.string(), 4);
    LPCWSTR exePath = clientPath.c_str();
    HINSTANCE result = ShellExecute(NULL, L"open", exePath, NULL, clientPath.parent_path().c_str(), SW_SHOWNORMAL);
    StartAudioBus();
}

int GetDebugLevel() {
    try {
        auto mainPath = std::filesystem::current_path();
        auto clientPath = mainPath / "Inworld" / ".env";
        std::ifstream envFile(clientPath);  // Open the environment file for reading
        std::string line;
        int logLevel = -1;                       // Default value if CLIENT_PORT is not found
        while (std::getline(envFile, line)) {             // Read each line in the file
            if (line.contains("LOG_LEVEL")) {           // Check if the line contains the desired variable
                std::size_t pos = line.find("=");         // find position of equals sign
                std::string level = line.substr(pos + 1);  // extract substring after equals sign
                logLevel = std::stoi(level);             // Convert the value to an int
                break;                                    // Stop reading the file once the variable is found
            }
        }
        envFile.close();  // Close the file
        if (logLevel == -1) {
            throw new exception();
        }
        Util::writeInworldLog("LOG_LEVEL is set to " + std::to_string(logLevel), 3);
        return logLevel;
    } catch (...) {
        Util::writeInworldLog("LOG_LEVEL can't be read from .env file, assigning default value (3: INFO).", 2);
        return 3;
    }
}

#include "Hooks.h"

SKSEPluginLoad(const SKSE::LoadInterface* skse) {
    SKSE::Init(skse);
    
    StartClient();

    Util::writeInworldLog("Plugin loaded. Initializing components.", 3);
    Util::LOG_LEVEL = GetDebugLevel();

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

    Inworld::UpdatePCHook::Install();
    Util::GetSettings();

    return true;
}