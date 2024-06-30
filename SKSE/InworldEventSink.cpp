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

                if (to_lower(playerMessage).find(std::string("goodbye")) != std::string::npos) {
                    InworldEventSink::GetSingleton()->conversationPair = nullptr;
                    InworldCaller::stopSignal = true;
                }

                std::thread(
                    [](RE::Actor* actor, std::string msg) {
                        SocketManager::getInstance().sendMessage(msg, actor, InworldCaller::stopSignal);
                    },
                    conversationActor, playerMessage)
                    .detach();

                
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
                []() { InworldEventSink::GetSingleton()->ReleaseListener(); }, conversationPair));
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
                    if (buttonEvent->IsDown() && conversationPair != nullptr && !InworldCaller::stopSignal &&
                        !InworldCaller::conversationOngoing && !InworldCaller::connecting) {
                        Log("IfIn");
                        InworldCaller::Start(conversationPair);
                    } else if (buttonEvent->IsDown() && InworldCaller::conversationOngoing) {
                        if (!isOpenedWindow) OnPlayerRequestInput("UITextEntryMenu");
                    }
                    // ] key
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
};
