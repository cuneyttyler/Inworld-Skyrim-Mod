import { VoiceTypes } from './VoiceTypes.js';
import { EventEmitter } from 'events';
import * as fs from 'fs';
import { parseFile } from 'music-metadata';
import syncExec from 'sync-exec';
import waitSync from 'wait-sync';
class Queue {
    items = [];
    enqueue(item) {
        this.items.push(item);
    }
    dequeue() {
        return this.items.shift();
    }
    peek() {
        return this.items[0];
    }
    isEmpty() {
        return this.items.length === 0;
    }
    size() {
        return this.items.length;
    }
}
export class AudioData {
    chunk;
    voiceFileName;
    text;
    stepCount = 0;
    temp_file_suffix;
    callback;
    constructor(chunk, voiceFileName, text, stepCount, temp_file_suffix, callback) {
        this.chunk = chunk;
        this.voiceFileName = voiceFileName;
        this.text = text;
        this.stepCount = stepCount;
        this.temp_file_suffix = temp_file_suffix;
        this.callback = callback;
    }
}
export class AudioProcessor extends EventEmitter {
    queue;
    processing;
    constructor() {
        super();
        this.queue = new Queue();
        this.processing = false;
        this.on('processNext', this.processNext);
    }
    addAudioStream(data) {
        this.queue.enqueue(data);
        if (!this.processing) {
            this.emit('processNext');
        }
    }
    async processNext() {
        if (this.queue.isEmpty()) {
            this.processing = false;
            return;
        }
        this.processing = true;
        const audioData = this.queue.dequeue();
        if (audioData) {
            try {
                await this.processAudioStream(audioData);
                this.emit('processNext');
            }
            catch (error) {
                console.error('Error processing audio stream:', error);
            }
        }
    }
    async processAudioStream(data) {
        // Your audio processing logic here.
        // Simulating async processing with a timeout.
        return new Promise(async (resolve) => {
            try {
                let duration = await this.saveAudio(data.chunk, data.voiceFileName, data.text, data.stepCount, data.temp_file_suffix);
                data.callback(duration);
                waitSync(duration);
                this.processing = false;
            }
            catch (e) {
                console.error("ERROR: " + e);
            }
        });
    }
    async getAudioDuration(filePath) {
        let metaData = await parseFile(filePath);
        return metaData.format.duration;
    }
    generateLipFile(wavFile, voiceType, fileName, line) {
        const executablePath = '"' + process.env.SKYRIM_FOLDER + '\\Tools\\LipGen\\LipGenerator\\LipGenerator.exe"';
        const args = [
            '"' + wavFile + '"',
            '"' + line + '"'
        ];
        syncExec(executablePath + " " + args.join(' '));
    }
    async saveAudio(audioData, voiceFileName, line, stepCount, temp_file_suffix) {
        if (!audioData) {
            return 0;
        }
        for (var i = 0; i < VoiceTypes.length; i++) {
            var voiceType = VoiceTypes[i];
            var outputFolder = process.env.MODS_FOLDER + "\\InworldSkyrim\\Sound\\Voice\\InworldUIHelper.esp\\" + voiceType + "\\";
            if (!fs.existsSync(outputFolder)) {
                // Folder does not exist, so create it
                fs.mkdir(outputFolder, (err) => {
                    if (err) {
                        console.error("Error creating folder");
                    }
                    else {
                        // console.log("Voice Folder created successfully. {" + outputFolder + "}");
                    }
                });
            }
        }
        const fileName = `temp-${i}-${temp_file_suffix}_${stepCount}.txt`;
        const tempFileName = `./Audio/Temp/${fileName}`;
        fs.writeFileSync(tempFileName, audioData, 'utf8');
        let duration = 0;
        try {
            let audioFile = './Audio/Temp/' + voiceFileName + '_' + stepCount + '.wav';
            syncExec('"./Audio/combine_audio.exe" ' + audioFile + ' ' + tempFileName);
            duration = await this.getAudioDuration(audioFile);
            this.generateLipFile('./Audio/Temp/' + voiceFileName + '_' + stepCount + '.wav', voiceType, './Audio/Temp/' + voiceFileName + '_' + stepCount + '.lip', line);
        }
        catch (e) {
            console.error("ERROR during processing audio!");
        }
        for (var j = 0; j < VoiceTypes.length; j++) {
            voiceType = VoiceTypes[j];
            const outputFolder = process.env.MODS_FOLDER + "\\InworldSkyrim\\Sound\\Voice\\InworldUIHelper.esp\\" + voiceType + "\\";
            const audioFile = outputFolder + voiceFileName + ".wav";
            const lipFile = outputFolder + voiceFileName + ".lip";
            // Copying the file to a the same name
            fs.copyFileSync('./Audio/Temp/' + voiceFileName + '_' + stepCount + '.wav', audioFile);
            fs.copyFileSync('./Audio/Temp/' + voiceFileName + '_' + stepCount + '.lip', lipFile);
        }
        fs.unlinkSync(tempFileName);
        fs.unlinkSync('./Audio/Temp/' + voiceFileName + '_' + stepCount + '.wav');
        fs.unlinkSync('./Audio/Temp/' + voiceFileName + '_' + stepCount + '.lip');
        outputFolder = process.env.MODS_FOLDER + "\\InworldSkyrim\\Sound\\Voice\\InworldUIHelper.esp\\" + VoiceTypes[0] + "\\";
        const audioFile = outputFolder + voiceFileName + ".wav";
        return duration;
    }
}
//# sourceMappingURL=AudioProcessor.js.map