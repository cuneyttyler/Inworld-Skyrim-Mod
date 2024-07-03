import {BLCRecorder} from './Audio/BLCRecorder.js';
import {AudioData, AudioProcessor} from './Audio/AudioProcessor.js'
import EventBus from '../EventBus.js'
import { logToLog }  from '../SkyrimClient.js'
import { DialogParticipant } from '@inworld/nodejs-sdk';

export function GetPayload(message: string, type: string, duration, is_n2n, speaker) {
    return {"message": message, "type": type, "duration": duration, "is_n2n": is_n2n, "speaker": speaker}
}

export class SkyrimInworldController {
    private Responses : Array<string> = [];
    private CombinedPhoneme : string = "";
    private CombinedUserInput : string = "";
    private ResponseQueue : Array<string> = [];
    private ResponseIndex : number = -1;
    private previousDuration : number = 0;
    private FollowAcceptResponse = "Of course";
    private FollowDeclineResponse = "I'm sorry, I have other priorities to attend to.";
    private audioProcessor = new AudioProcessor();
    private Recorder : BLCRecorder;
    private DisableAudio : boolean;
    private stepCount = 0;

    constructor(private socket : WebSocket) {}

    async ProcessMessage(msg : any, cm) {
        if(cm.is_n2n && cm.IsEnding()) {
            return;
        }

        var temp_file_suffix = "0"
        var topic_filename = ""
        var target = 0;
        if(cm.is_n2n && cm.speaker == 0) {
            temp_file_suffix = "0"
            topic_filename = "DialogueGe_InworldN2NTarge_0005F002_1"
            target = 1;
        } else if(cm.is_n2n && cm.speaker == 1) {
            temp_file_suffix = "1"
            topic_filename = "DialogueGe_InworldN2NSourc_000274FA_1"
            target = 0;
        } else if(cm.is_n2n && cm.speaker == 2) {
            temp_file_suffix = "0"
            topic_filename = "DialogueGe_InworldN2NSourc_000274FA_1"
            target = 0
        } else {
            temp_file_suffix = "2"
            topic_filename = "DialogueGe_InworldTargetBr_000274F4_1"
        }

        if (msg.type == 'AUDIO') { 
            let arr = msg.audio.additionalPhonemeInfo;
            arr.forEach(ph => {
                if (ph.phoneme != "<INTERSPERSE_CHARACTER>") 
                    this.CombinedPhoneme += ph.phoneme
                
            });
            const interval = setInterval(() => {
                if(this.ResponseQueue.length > 0) {
                    this.audioProcessor.addAudioStream(new AudioData(msg.audio.chunk, topic_filename, this.ResponseQueue[0], this.stepCount, temp_file_suffix, (duration, response) => {
                        this.previousDuration = duration;
                        let result = GetPayload(response, "chat", duration, cm.is_n2n, target);
                        this.socket.send(JSON.stringify(result));
                    }))
                    this.ResponseQueue.splice(0,1);
                    clearInterval(interval)
                }
            }, 100)
        } else if (msg.emotions) { // dont use for now
        } else if (msg.isText()) {
            let responseMessage = msg.text.text;
            this.ResponseQueue.push(responseMessage);
            this.Responses.push(responseMessage)
            this.ResponseIndex++;
        } else if (msg.isInteractionEnd() && this.Responses.length > 0) {
            ++this.stepCount

            this.Responses = this.Responses.map((r) => r.trim());
            let response = this.Responses.join(' ');

            console.log(`Character said: ${response}`)
            logToLog(`Character said: ${response}`)
            
            if(!cm.is_n2n) {
                EventBus.GetSingleton().emit('TARGET_RESPONSE', response);
                if(response.includes(this.FollowAcceptResponse)) {
                    let payload = GetPayload("", "follow_request_accepted", 0, cm.is_n2n, target);
                    this.socket.send(JSON.stringify(payload))
                }
                if(cm.IsEnding()) {
                    setTimeout(() => {
                        let result = GetPayload("", "end", 0, cm.is_n2n, target);
                        this.socket.send(JSON.stringify(result));
                        EventBus.GetSingleton().emit("END");
                    }, 7000)
                }
            } else if(cm.is_n2n && cm.speaker == 0 && !cm.IsEnding()) {
                EventBus.GetSingleton().emit('SOURCE_TARGET_RESPONSE', response)
            } else if(cm.is_n2n && cm.speaker == 1 && !cm.IsEnding()) {
                EventBus.GetSingleton().emit('TARGET_SOURCE_RESPONSE', response)
            } else if(cm.is_n2n && cm.speaker == 2){
                EventBus.GetSingleton().emit('GM_SOURCE_RESPONSE', response)
            }    

            this.Responses = [];
            this.ResponseIndex = -1;
        }
    }

    SendEndSignal(is_n2n) {
        this.stepCount = 0;
        this.socket.send(JSON.stringify(GetPayload("", "end", 0, is_n2n, 0)));
    }

    SetRecorder(recorder : BLCRecorder) {
        this.DisableAudio = (process.env.DISABLE_AUDIO).toLowerCase() === "true"; 
        this.Recorder = recorder;
    }

    SendUserVoiceInput() {
        let userData = GetPayload(this.CombinedUserInput, "user_voice", 0, false, 0);
        this.socket.send(JSON.stringify(userData));
    }
}
