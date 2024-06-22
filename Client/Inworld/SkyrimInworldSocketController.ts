import {BLCRecorder} from './Audio/BLCRecorder.js';
import * as fs from 'fs';
import { VoiceTypes } from './VoiceTypes.js'
import { exec } from 'child_process';
import { getAudioDurationInSeconds } from 'get-audio-duration';
import EventBus from '../EventBus.js'

export function GetSocketResponse(message: string, phoneme: string, type: string, duration, is_n2n, speaker) {
    return {"message": message, "phoneme": phoneme, "type": type, "duration": duration, "is_n2n": is_n2n, "speaker": speaker}
}

function generateLipFile(wavFile: string, voiceType: string, fileName: string, line: string, callback) {
    const executablePath = '"' + process.env.SKYRIM_FOLDER + '\\Tools\\LipGen\\LipGenerator\\LipGenerator.exe"';
    const args = [
        '"' + wavFile + '"',
        '"' + line + '"']

    exec(executablePath + " " + args.join(' '), (err, stdout, stderr) => {
      if (err) {
        return;
      }

      callback();
    });
}

async function saveAudio(audioStrings: Array<string>, voiceFileName: string, line: string, stepCount, temp_file_suffix: string, callback) {
    if(audioStrings.length == 0) {
        return;
    }

    for(var i = 0; i < VoiceTypes.length; i++) {
        var voiceType = VoiceTypes[i];
        var outputFolder = process.env.SKYRIM_MODS_FOLDER + "\\InworldSkyrim\\Sound\\Voice\\InworldUIHelper.esp\\" + voiceType + "\\";

        if (!fs.existsSync(outputFolder)) {
          // Folder does not exist, so create it
          fs.mkdir(outputFolder, (err) => {
            if (err) {
              console.error("Error creating folder");
            } else {
              // console.log("Voice Folder created successfully. {" + outputFolder + "}");
            }
          });
        }
    }

    var tempFileNames = []
    for (i = 0; i < audioStrings.length; i++) {
        const fileName = `temp-${i}-${temp_file_suffix}_${stepCount}.txt`;
        const filePath = `./Audio/Temp/${fileName}`;
        await fs.writeFileSync(filePath, audioStrings[i], 'utf8');
        tempFileNames.push('Audio/Temp/' + fileName);
    }

    exec('"Audio/combine_audio.exe" ./Audio/Temp/' + voiceFileName + '_' + stepCount + '.wav ' + tempFileNames.join(' '), (err, stdout, stderr) => {
      if (err) {
        console.log('Error: ' + err + ' ' + stderr)
        return;
      }

      generateLipFile('./Audio/Temp/' + voiceFileName + '_' + stepCount + '.wav', voiceType, './Audio/Temp/' + voiceFileName + '_' + stepCount + '.lip', line, async () => {
        for(var j = 0; j < VoiceTypes.length; j++) {
            voiceType = VoiceTypes[j];

            const outputFolder = process.env.SKYRIM_MODS_FOLDER + "\\InworldSkyrim\\Sound\\Voice\\InworldUIHelper.esp\\" + voiceType + "\\";
            const audioFile = outputFolder + voiceFileName + ".wav";
            const lipFile = outputFolder + voiceFileName + ".lip";

            // Copying the file to a the same name
            await fs.copyFileSync('./Audio/Temp/' + voiceFileName + '_' + stepCount + '.wav', audioFile);
            await fs.copyFileSync('./Audio/Temp/' + voiceFileName + '_' + stepCount + '.lip', lipFile);
        }

        tempFileNames.map(fs.unlinkSync);
        fs.unlinkSync('./Audio/Temp/' + voiceFileName + '_' + stepCount + '.wav');
        fs.unlinkSync('./Audio/Temp/' + voiceFileName + '_' + stepCount + '.lip');

        const outputFolder = process.env.SKYRIM_MODS_FOLDER + "\\InworldSkyrim\\Sound\\Voice\\InworldUIHelper.esp\\" + VoiceTypes[0] + "\\";
        const audioFile = outputFolder + voiceFileName + ".wav";
        getAudioDurationInSeconds(audioFile)
            .then((duration) => {
                callback(duration)
            })
            .catch((error) => {
                console.error('Error getting audio duration:', error);
            });
    });
    })
}

var text = ""

export class SkyrimInworldSocketController {
    private CombinedResponse : string = "";
    private CombinedPhoneme : string = "";
    private CombinedUserInput : string = "";
    private AudioStrings = [];
    private Recorder : BLCRecorder;
    private DisableAudio : boolean;
    private stepCount = 0;

    constructor(private socket : WebSocket) {}

    async ProcessMessage(msg : any, is_n2n, speaker, is_ending) {
        if(is_n2n && is_ending) {
            return;
        }

        var temp_file_suffix = "0"
        var topic_filename = ""
        var target = 0;
        if(is_n2n && speaker == 0) {
            temp_file_suffix = "0"
            topic_filename = "DialogueGe_InworldN2NTarge_0005F002_1"
            target = 1;
        } else if(is_n2n && speaker == 1) {
            temp_file_suffix = "1"
            topic_filename = "DialogueGe_InworldN2NSourc_000274FA_1"
            target = 0;
        } else if(is_n2n && speaker == 2) {
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
            if (this.Recorder != null && !this.DisableAudio) {
                this.AudioStrings.push(msg.audio.chunk);
                // this.Recorder.playChunk(msg.audio.chunk);
            }
        } else if (msg.emotions) { // dont use for now
        } else if (msg.phonemes) {
            // console.log(msg.phonemes)
        } else if (msg.isText()) {
            text = msg.text.text
            if (msg.routing.targets.length > 0 && msg.routing.targets[0].isCharacter) { // Always overwrite user input
                this.CombinedUserInput = msg.text.text;
            } else {
                let responseMessage = msg.text.text;
                this.CombinedResponse += responseMessage;
            }
        } else if (msg.isInteractionEnd()) {
            await saveAudio(this.AudioStrings, topic_filename, text, ++this.stepCount, temp_file_suffix, (duration) => {
                this.AudioStrings = [];

                let result = GetSocketResponse(this.CombinedResponse, this.CombinedPhoneme, "chat", duration, is_n2n, target);
                console.log("Character said: " + this.CombinedResponse);
                (console as any).logToLog(`Character said: ${this.CombinedResponse}`)
                this.socket.send(JSON.stringify(result));

                setTimeout(() => {
                    if(!is_n2n) {
                        EventBus.GetSingleton().emit('TARGET_RESPONSE', this.CombinedResponse);
                    } else if(is_n2n && speaker == 0 && !is_ending) {
                        EventBus.GetSingleton().emit('SOURCE_TARGET_RESPONSE', this.CombinedResponse)
                    } else if(is_n2n && speaker == 1 && !is_ending) {
                        EventBus.GetSingleton().emit('TARGET_SOURCE_RESPONSE', this.CombinedResponse)
                    } else if(is_n2n && speaker == 2){
                        EventBus.GetSingleton().emit('GM_SOURCE_RESPONSE', this.CombinedResponse)
                    }
                    this.CombinedResponse = "";
                }, duration * 1000 + 500)
            });
        }
    }

    SendEndSignal(is_n2n) {
        this.stepCount = 0;
        this.socket.send(JSON.stringify(GetSocketResponse("", "", "end", 0, is_n2n, 0)));
    }

    SetRecorder(recorder : BLCRecorder) {
        this.DisableAudio = (process.env.DISABLE_AUDIO).toLowerCase() === "true"; 
        console.log("Will it play audio from characters? " + !this.DisableAudio);
        (console as any).logToLog("Will it play audio from characters? " + !this.DisableAudio)
        this.Recorder = recorder;
    }

    SendUserVoiceInput() {
        let userData = GetSocketResponse(this.CombinedUserInput, "", "user_voice", 0, false, 0);
        this.socket.send(JSON.stringify(userData));
    }
}
