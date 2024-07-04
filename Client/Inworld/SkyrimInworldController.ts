import {BLCRecorder} from './Audio/BLCRecorder.js';
import {AudioData, AudioProcessor} from './Audio/AudioProcessor.js'
import EventBus from '../EventBus.js'
import { logToLog }  from '../SkyrimClient.js'
import { DialogParticipant } from '@inworld/nodejs-sdk';
import { SenderData, SenderQueue } from './SenderQueue.js';
import InworldManager from './InworldManager.js';

export function GetPayload(message: string, type: string, duration, is_n2n, speaker) {
    return {"message": message, "type": type, "duration": duration, "is_n2n": is_n2n, "speaker": speaker}
}

export class SkyrimInworldController {
    private Responses : Array<string> = [];
    private CombinedPhoneme : string = "";
    private CombinedUserInput : string = "";
    private ResponseQueue : Array<string> = [];
    private ResponseIndex : number = -1;
    private processingIndex : number = 0;
    private FollowAcceptResponse = "Of course";
    private audioProcessor: AudioProcessor;
    private senderQueue: SenderQueue;
    private clientManager: InworldManager;
    private stepCount = 0;

    constructor(private id: number, clientManager: InworldManager, private socket : WebSocket) {
        this.audioProcessor = new AudioProcessor(id);
        this.senderQueue = new SenderQueue(id, clientManager.IsN2N(), socket);
        this.clientManager = clientManager;
    }

    async ProcessMessage(msg : any) {
        if(this.clientManager.IsN2N() && this.clientManager.IsEnding()) {
            return;
        }

        var temp_file_suffix = "0"
        var topic_filename = ""
        var target: number = 0;
        if(this.clientManager.IsN2N() && this.clientManager.Speaker() == 0) {
            temp_file_suffix = "0"
            topic_filename = "DialogueGe_InworldN2NTarge_0005F002_1"
            target = 1;
        } else if(this.clientManager.IsN2N() && this.clientManager.Speaker() == 1) {
            temp_file_suffix = "1"
            topic_filename = "DialogueGe_InworldN2NSourc_000274FA_1"
            target = 0;
        } else if(this.clientManager.IsN2N() && this.clientManager.Speaker() == 2) {
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
                    console.log("MESSAGE REQUEST ==" + this.ResponseQueue[0] + "==" + this.clientManager.IsN2N() + "==" + this.clientManager.Speaker() + "==")
                    this.audioProcessor.addAudioStream(new AudioData(this.processingIndex++, msg.audio.chunk, topic_filename, this.ResponseQueue[0], this.stepCount, temp_file_suffix, (index, text, audioFile, lipFile, duration) => {
                        this.senderQueue.addData(new SenderData(index, text, audioFile, lipFile, topic_filename, duration, target));
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

            // console.log(`Character said: ${response}` + `(${this.clientManager.IsN2N()} - ${this.clientManager.Speaker()})`)
            logToLog(`Character said: ${response}`)
            
            if(!this.clientManager.IsN2N()) {
                EventBus.GetSingleton().emit('TARGET_RESPONSE', response);
                if(response.includes(this.FollowAcceptResponse)) {
                    let payload = GetPayload("", "follow_request_accepted", 0, this.clientManager.IsN2N(), target);
                    this.socket.send(JSON.stringify(payload))
                }
                if(this.clientManager.IsEnding()) {
                    setTimeout(() => {
                        let result = GetPayload("", "end", 0, this.clientManager.IsN2N(), target);
                        this.socket.send(JSON.stringify(result));
                        EventBus.GetSingleton().emit("END");
                    }, 7000)
                }
            } else if(this.clientManager.IsN2N() && this.clientManager.Speaker() == 0 && !this.clientManager.IsEnding()) {
                EventBus.GetSingleton().emit('SOURCE_TARGET_RESPONSE', response)
            } else if(this.clientManager.IsN2N() && this.clientManager.Speaker() == 1 && !this.clientManager.IsEnding()) {
                EventBus.GetSingleton().emit('TARGET_SOURCE_RESPONSE', response)
            } else if(this.clientManager.IsN2N() && this.clientManager.Speaker() == 2){
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

    SendUserVoiceInput() {
        let userData = GetPayload(this.CombinedUserInput, "user_voice", 0, false, 0);
        this.socket.send(JSON.stringify(userData));
    }
}
