import { AudioData, AudioProcessor } from './Audio/AudioProcessor.js';
import EventBus from '../EventBus.js';
export function GetSocketResponse(message, phoneme, type, duration, is_n2n, speaker) {
    return { "message": message, "phoneme": phoneme, "type": type, "duration": duration, "is_n2n": is_n2n, "speaker": speaker };
}
export class SkyrimInworldSocketController {
    socket;
    Responses = [];
    CombinedPhoneme = "";
    CombinedUserInput = "";
    CurrentResponse = "";
    ResponseIndex = -1;
    AudioStrings = [];
    FollowAcceptResponse = "Of course. I'll join you.";
    FollowDeclineResponse = "I'm sorry, I have other priorities to attend to.";
    audioProcessor = new AudioProcessor();
    Recorder;
    DisableAudio;
    stepCount = 0;
    constructor(socket) {
        this.socket = socket;
    }
    async ProcessMessage(msg, is_n2n, speaker, is_ending) {
        if (is_n2n && is_ending) {
            return;
        }
        var temp_file_suffix = "0";
        var topic_filename = "";
        var target = 0;
        if (is_n2n && speaker == 0) {
            temp_file_suffix = "0";
            topic_filename = "DialogueGe_InworldN2NTarge_0005F002_1";
            target = 1;
        }
        else if (is_n2n && speaker == 1) {
            temp_file_suffix = "1";
            topic_filename = "DialogueGe_InworldN2NSourc_000274FA_1";
            target = 0;
        }
        else if (is_n2n && speaker == 2) {
            temp_file_suffix = "0";
            topic_filename = "DialogueGe_InworldN2NSourc_000274FA_1";
            target = 0;
        }
        else {
            temp_file_suffix = "2";
            topic_filename = "DialogueGe_InworldTargetBr_000274F4_1";
        }
        if (msg.type == 'AUDIO') {
            let arr = msg.audio.additionalPhonemeInfo;
            arr.forEach(ph => {
                if (ph.phoneme != "<INTERSPERSE_CHARACTER>")
                    this.CombinedPhoneme += ph.phoneme;
            });
            setTimeout(() => {
                this.audioProcessor.addAudioStream(new AudioData(msg.audio.chunk, topic_filename, this.Responses[this.ResponseIndex], this.stepCount, temp_file_suffix, (duration) => {
                    let result = GetSocketResponse(this.CurrentResponse, this.CombinedPhoneme, "chat", duration, is_n2n, target);
                    this.socket.send(JSON.stringify(result));
                    this.CurrentResponse = "";
                }));
            }, 100);
        }
        else if (msg.emotions) { // dont use for now
        }
        else if (msg.phonemes) {
            // console.log(msg.phonemes)
        }
        else if (msg.isText()) {
            if (msg.routing.targets.length > 0 && msg.routing.targets[0].isCharacter) { // Always overwrite user input
                this.CombinedUserInput = msg.text.text;
            }
            else {
                let responseMessage = msg.text.text;
                this.Responses.push(responseMessage);
                this.ResponseIndex++;
            }
        }
        else if (msg.isInteractionEnd() && this.Responses.length > 0) {
            ++this.stepCount;
            setTimeout(() => {
                let response = this.Responses.join(' ');
                if (!is_n2n) {
                    EventBus.GetSingleton().emit('TARGET_RESPONSE', response);
                    if (response == this.FollowAcceptResponse) {
                        let payload = GetSocketResponse("", "", "follow_request_accepted", 0, is_n2n, target);
                        this.socket.send(JSON.stringify(payload));
                    }
                }
                else if (is_n2n && speaker == 0 && !is_ending) {
                    EventBus.GetSingleton().emit('SOURCE_TARGET_RESPONSE', response);
                }
                else if (is_n2n && speaker == 1 && !is_ending) {
                    EventBus.GetSingleton().emit('TARGET_SOURCE_RESPONSE', response);
                }
                else if (is_n2n && speaker == 2) {
                    EventBus.GetSingleton().emit('GM_SOURCE_RESPONSE', response);
                }
                this.Responses = [];
                this.ResponseIndex = -1;
            }, 500);
        }
    }
    SendEndSignal(is_n2n) {
        this.stepCount = 0;
        this.socket.send(JSON.stringify(GetSocketResponse("", "", "end", 0, is_n2n, 0)));
    }
    SetRecorder(recorder) {
        this.DisableAudio = (process.env.DISABLE_AUDIO).toLowerCase() === "true";
        console.log("Will it play audio from characters? " + !this.DisableAudio);
        console.logToLog("Will it play audio from characters? " + !this.DisableAudio);
        this.Recorder = recorder;
    }
    SendUserVoiceInput() {
        let userData = GetSocketResponse(this.CombinedUserInput, "", "user_voice", 0, false, 0);
        this.socket.send(JSON.stringify(userData));
    }
}
//# sourceMappingURL=SkyrimInworldSocketController.js.map