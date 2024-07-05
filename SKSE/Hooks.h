namespace Inworld {

class UpdatePCHook {
public:
    static void Install() {
        REL::Relocation<std::uintptr_t> pcVTable{RE::VTABLE_PlayerCharacter[0]};
        UpdatePC = pcVTable.write_vfunc(0xAD, UpdatePCMod);
    }

private:
    static void UpdatePCMod(RE::PlayerCharacter* pc, float delta) {
        // call original function
        UpdatePC(pc, delta);

        RE::BSTArray<RE::SubtitleInfo> newSubtitles(10);
        auto subtitleManager = RE::SubtitleManager::GetSingleton();
        
        bool isEmpty = true;
        for (RE::SubtitleInfo subtitleInfo : subtitleManager->subtitles) {
            isEmpty = false;
            break;
        }
        if (isEmpty && SubtitleManager::HideSignal) {
            SubtitleManager::HideSubtitle();
            SubtitleManager::HideSignal = false;
        }
        else if(!isEmpty) {
            SubtitleManager::HideSignal = true;
        }
    }
    static inline REL::Relocation<decltype(UpdatePCMod)> UpdatePC;
};

// Hook into the Invoke calls in HUDMenu::ProcessMessage which call "HideSubtitle" and "ShowSubtitle"
class InvokeHook {
    public:
        static void Install() {
            auto address = REL::VariantID(50718, 51612, 0).address();
            auto offset = REL::VariantOffset(0x756, 0x77E, 0).offset();

            SKSE::AllocTrampoline(320);

            SKSE::GetTrampoline().write_call<5>(address + offset, InvokeModHide);

            offset = REL::VariantOffset(0x703, 0x72B, 0).offset();
            SKSE::GetTrampoline().write_call<5>(address + offset, InvokeModShow);
        }

    private:
        static bool InvokeModHide(RE::GFxValue::ObjectInterface* objInt, void* a_data, RE::GFxValue* a_result,
                                  const char* a_name, const RE::GFxValue* a_args, RE::UPInt a_numArgs, bool isDObj) {
                        
            // We have to check this since multiple message types pass through this branch
            if (strcmp(a_name, "HideSubtitle") == 0) {
                return true;
            }

            auto result = objInt->Invoke(a_data, a_result, a_name, a_args, a_numArgs, isDObj);

            return result;
        }

        static bool InvokeModShow(RE::GFxValue::ObjectInterface* objInt, void* a_data, RE::GFxValue* a_result,
                                  const char* a_name, const RE::GFxValue* a_args, RE::UPInt a_numArgs, bool isDObj) {

            if (string(a_args->GetString()).find("==EMPTY_SUBTITLE==") != std::string::npos || string(a_args->GetString()).find(": ...") != std::string::npos) {
                return false;
            }

            auto result = objInt->Invoke(a_data, a_result, a_name, a_args, a_numArgs, isDObj);

            return result;
        }
    };
}