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

#include "PhonemeUtility.cpp"

using namespace RE::BSScript;
using json = nlohmann::json;

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
    static void ShowSubtitle(std::string subtitle, float duration) {

        auto hudMenu = RE::UI::GetSingleton()->GetMenu<RE::HUDMenu>(RE::HUDMenu::MENU_NAME);
        auto root = hudMenu->GetRuntimeData().root;

        std::this_thread::sleep_for(1s);

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
    inline static RE::Actor* conversationPair;
    inline static bool connecting = false;
    inline static bool conversationOngoing = false;
    inline static bool stopSignal = false;
    inline static int n2n_established_response_count = 0;
    inline static RE::Actor* N2N_SourceActor;
    inline static RE::Actor* N2N_TargetActor;

    static void MoveToPlayerWithMargin(RE::Actor* conversationActor) {
        SKSE::ModCallbackEvent modEvent{"BLC_SetActorMoveToPlayer", 0, 0.0f, conversationActor};
        SKSE::GetModCallbackEventSource()->SendEvent(&modEvent);
    }

    static void MakeFacialAnimations(RE::Actor* conversationActor, std::string str) {
        if (str == "") return;  //
        auto splitted = PhonemeUtility::get_instance()->string_to_phonemes(str);
        // SKSE::ModCallbackEvent modEventClear{"BLC_ClearFacialExpressionEvent", "", 1.0f, conversationActor};
        // SKSE::GetModCallbackEventSource()->SendEvent(&modEventClear);
        SKSE::ModCallbackEvent modEvent{"BLC_SetFacialExpressionEvent", splitted, 0.0075f, conversationActor};
        SKSE::GetModCallbackEventSource()->SendEvent(&modEvent);
    }

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
        SKSE::ModCallbackEvent modEvent{"BLC_Start", "", 1.0f, actor};
        SKSE::GetModCallbackEventSource()->SendEvent(&modEvent);
        InworldCaller::conversationPair = nullptr;
    }

    static void Stop() {
        SKSE::ModCallbackEvent modEvent{"BLC_Stop", "", 1.0f, nullptr};
        SKSE::GetModCallbackEventSource()->SendEvent(&modEvent);
        InworldCaller::stopSignal = false;
        InworldCaller::conversationOngoing = false;
        InworldCaller::conversationPair = nullptr;
        InworldCaller::conversationActor = nullptr;
    }

    static void SendFollowRequestAcceptedSignal() {
        SKSE::ModCallbackEvent modEvent{"BLC_Follow_Request_Accepted", "", 1.0f, InworldCaller::conversationPair};
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
        InworldCaller::conversationPair = conversationActor;
        InworldCaller::conversationOngoing = true;
        InworldCaller::connecting = false;
        InworldCaller::stopSignal = false;
        SetHoldPosition(0, conversationActor);
    }

    static void Speak(std::string message, float duration) {
        SKSE::ModCallbackEvent modEvent{"BLC_Speak", "", 0.0075f, InworldCaller::conversationActor};
        SKSE::GetModCallbackEventSource()->SendEvent(&modEvent);
        SubtitleManager::ShowSubtitle(message, duration);
        if (InworldCaller::stopSignal || !InworldCaller::conversationOngoing) {
            SetHoldPosition(1, InworldCaller::conversationActor);
            InworldCaller::Stop();
        }
    }

    static void SpeakN2N(std::string message, int speaker, float duration) {
        if (speaker == 0) {
            SKSE::ModCallbackEvent modEvent{"BLC_Speak_N2N", "", 0, InworldCaller::N2N_SourceActor};
            SKSE::GetModCallbackEventSource()->SendEvent(&modEvent);
        } else {
            SKSE::ModCallbackEvent modEvent{"BLC_Speak_N2N", "", 1, InworldCaller::N2N_TargetActor};
            SKSE::GetModCallbackEventSource()->SendEvent(&modEvent);
        }
        SubtitleManager::ShowSubtitle(message, duration);
    }
};

#include "SocketManager.cpp"


class InworldEventSink : public RE::BSTEventSink<SKSE::CrosshairRefEvent>,
                         public RE::BSTEventSink<RE::InputEvent*> {
    InworldEventSink() = default;
    InworldEventSink(const InworldEventSink&) = delete;
    InworldEventSink(InworldEventSink&&) = delete;
    InworldEventSink& operator=(const InworldEventSink&) = delete;
    InworldEventSink& operator=(InworldEventSink&&) = delete;

    

class OpenTextboxCallback : public RE::BSScript::IStackCallbackFunctor {
        virtual inline void operator()(RE::BSScript::Variable a_result) override {
            InworldEventSink::GetSingleton()->trigger_result_menu("UITextEntryMenu");
        }
        virtual inline void SetObject(const RE::BSTSmartPointer<RE::BSScript::Object>& a_object){};

    public:
        OpenTextboxCallback() = default;
        bool operator==(const OpenTextboxCallback& other) const { return false; }
    };

    class TextboxResultCallback : public RE::BSScript::IStackCallbackFunctor {
    public:
        RE::Actor* conversationActor;
        TextboxResultCallback(std::function<void()> callback, RE::Actor* form) : callback_(callback) {
            conversationActor = form;
        }

        virtual inline void operator()(RE::BSScript::Variable a_result) override {
            if (a_result.IsNoneObject()) {
            } else if (a_result.IsString()) {
                auto playerMessage = std::string(a_result.GetString());

                std::thread(
                    [](RE::Actor* actor, std::string msg) { SocketManager::getInstance().sendMessage(msg, actor); },
                    conversationActor, playerMessage)
                    .detach();

                if (to_lower(playerMessage).find(std::string("goodbye")) != std::string::npos) {
                    SocketManager::getInstance().SendStopSignal(InworldEventSink::GetSingleton()->conversationPair);
                    InworldEventSink::GetSingleton()->conversationPair = nullptr;
                    InworldCaller::stopSignal = true;
                }
            }
            callback_();
        }

        virtual inline void SetObject(const RE::BSTSmartPointer<RE::BSScript::Object>& a_object){};

    private:
        // Member variable to store the callback function
        std::function<void()> callback_;
    };

public:
    bool isLocked;
    RE::Actor* previousActor;
    RE::Actor* conversationPair;
    bool pressingKey = false;
    bool isOpenedWindow = false;
    bool isMenuInitialized = false;

    static InworldEventSink* GetSingleton() {
        static InworldEventSink singleton;
        return &singleton;
    }

    RE::BSEventNotifyControl ProcessEvent(const SKSE::CrosshairRefEvent* event,
                                          RE::BSTEventSource<SKSE::CrosshairRefEvent>*) {

        if (event->crosshairRef) {
            const char* objectName = event->crosshairRef->GetBaseObject()->GetName();

            try {
                auto baseObject = event->crosshairRef->GetBaseObject();
                auto talkingWith = RE::TESForm::LookupByID<RE::TESNPC>(baseObject->formID);
                auto actorObject = event->crosshairRef->As<RE::Actor>();

                if (talkingWith && actorObject) {
                    conversationPair = nullptr;
                    auto className = talkingWith->npcClass->fullName;
                    auto raceName = talkingWith->race->fullName;

                    conversationPair = actorObject;
                }
            } catch (...) {
            }
        }
        return RE::BSEventNotifyControl::kContinue;
    }

    void ReleaseListener() { InworldEventSink::GetSingleton()->isLocked = false; }

    void OnKeyReleased() {
        if (pressingKey && conversationPair != nullptr) {
            pressingKey = false;
            SocketManager::getInstance().controlVoiceInput(false, conversationPair);
        }
    }

    void OnKeyPressed() {
        if (!pressingKey && conversationPair != nullptr) {
            pressingKey = true;
            SocketManager::getInstance().controlVoiceInput(true, conversationPair);
        }
    }

    void OnPlayerRequestInput(RE::BSFixedString menuID) {
        const auto skyrimVM = RE::SkyrimVM::GetSingleton();
        auto vm = skyrimVM ? skyrimVM->impl : nullptr;
        if (vm) {
            isOpenedWindow = true;
            RE::BSTSmartPointer<RE::BSScript::IStackCallbackFunctor> callbackOpenTextbox(new OpenTextboxCallback());
            RE::TESForm* emptyForm = NULL;
            RE::TESForm* emptyForm2 = NULL;
            auto args2 = RE::MakeFunctionArguments(std::move(menuID), std::move(emptyForm), std::move(emptyForm2));
            vm->DispatchStaticCall("UIExtensions", "OpenMenu", args2, callbackOpenTextbox);
        }
    }

    void InitMenu(RE::BSFixedString menuID) {
        const auto skyrimVM = RE::SkyrimVM::GetSingleton();
        auto vm = skyrimVM ? skyrimVM->impl : nullptr;
        if (vm) {
            RE::BSTSmartPointer<RE::BSScript::IStackCallbackFunctor> callback;
            auto args = RE::MakeFunctionArguments(std::move(menuID));
            vm->DispatchStaticCall("UIExtensions", "InitMenu", args, callback);
        }
    }

    void trigger_result_menu(RE::BSFixedString menuID) {
        const auto skyrimVM = RE::SkyrimVM::GetSingleton();
        auto vm = skyrimVM ? skyrimVM->impl : nullptr;
        if (vm) {
            RE::BSTSmartPointer<RE::BSScript::IStackCallbackFunctor> callback(new TextboxResultCallback(
                []() {
                    InworldEventSink::GetSingleton()->ReleaseListener();
                },
                conversationPair));
            auto args = RE::MakeFunctionArguments(std::move(menuID));
            vm->DispatchStaticCall("UIExtensions", "GetMenuResultString", args, callback);
            isOpenedWindow = false;
        }
    }

    RE::BSEventNotifyControl ProcessEvent(RE::InputEvent* const* eventPtr, RE::BSTEventSource<RE::InputEvent*>*) {
        if (!eventPtr) return RE::BSEventNotifyControl::kContinue;
        auto* event = *eventPtr;
        if (!event) return RE::BSEventNotifyControl::kContinue;

        if (!isMenuInitialized) {
            isMenuInitialized = true;
            InitMenu("UITextEntryMenu");
        }

        try {
            if (event->GetEventType() == RE::INPUT_EVENT_TYPE::kButton) {
                auto* buttonEvent = event->AsButtonEvent();
                auto dxScanCode = buttonEvent->GetIDCode();
                // Press V key to speak.
                if (dxScanCode == 47) {
                    if (!isOpenedWindow) {
                        if (buttonEvent->IsUp()) {
                            OnKeyReleased();
                        } else {
                            OnKeyPressed();
                        }
                    }
                    // U key
                } else if (dxScanCode == 22) {
                    if (buttonEvent->IsDown() && conversationPair != nullptr && !InworldCaller::stopSignal && !InworldCaller::conversationOngoing && !InworldCaller::connecting) {
                        InworldCaller::connecting = true;
                        InworldCaller::Start(conversationPair);
                    } else if (buttonEvent->IsDown() && InworldCaller::conversationOngoing) {
                        if (!isOpenedWindow) OnPlayerRequestInput("UITextEntryMenu");
                    }
                    // Y key
                } else if (buttonEvent->IsDown() && dxScanCode == 27) {
                    SocketManager::getInstance().SendN2NStopSignal();
                }
                /* // funbit
                else if (dxScanCode == 71) {
                    // Start
                    InworldUtility::StartQuest("InworldNazeemDestroyer");
                } else if (dxScanCode == 71) {
                    // Proceed
                    InworldUtility::MoveQuestToStage("InworldNazeemDestroyer",10);
                } 
                */
            }
        } catch (...) {
        }

        return RE::BSEventNotifyControl::kContinue;
    }

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

        SocketManager::getInstance().SendN2NStartSignal(InworldCaller::N2N_SourceActor, InworldCaller::N2N_TargetActor,
                                                        currentDateTime);

        return true;
    }

    static bool LogEvent(RE::StaticFunctionTag*, RE::Actor* actor, string log) {
        if (actor == nullptr) {
            return false;
        }

        SocketManager::getInstance().SendLogEvent(actor, log);

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

bool RegisterPapyrusFunctions(RE::BSScript::IVirtualMachine* vm) {
    vm->RegisterFunction("Start", "InworldSKSE", &InworldEventSink::Start);
    vm->RegisterFunction("N2N_Initiate", "InworldSKSE", &InworldEventSink::N2N_Initiate);
    vm->RegisterFunction("N2N_Start", "InworldSKSE", &InworldEventSink::N2N_Start);
    vm->RegisterFunction("LogEvent", "InworldSKSE", &InworldEventSink::LogEvent);

    return true;
}

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

    return true;
}