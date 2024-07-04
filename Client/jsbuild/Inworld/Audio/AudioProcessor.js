import { EventEmitter } from 'events';
import * as fs from 'fs';
import { parseFile } from 'music-metadata';
import syncExec from 'sync-exec';
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
    index;
    chunk;
    voiceFileName;
    text;
    stepCount = 0;
    temp_file_suffix;
    callback;
    constructor(index, chunk, voiceFileName, text, stepCount, temp_file_suffix, callback) {
        this.index = index;
        this.chunk = chunk;
        this.voiceFileName = voiceFileName;
        this.text = text;
        this.stepCount = stepCount;
        this.temp_file_suffix = temp_file_suffix;
        this.callback = callback;
    }
}
export class AudioProcessor extends EventEmitter {
    id;
    eventName;
    queue;
    processing;
    nextSendTime = 0;
    lastIndex = 0;
    constructor(id) {
        super();
        this.id = id;
        this.eventName = 'processNext_' + this.id;
        this.queue = new Queue();
        this.processing = false;
        this.on(this.eventName, this.processNext);
    }
    addAudioStream(data) {
        this.queue.enqueue(data);
        if (!this.processing) {
            this.emit(this.eventName);
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
                let output = await this.saveAudio(data.chunk, data.index, data.voiceFileName, data.text, data.stepCount, data.temp_file_suffix);
                const interval = setInterval(() => {
                    if (data.index - this.lastIndex <= 1) {
                        data.callback(data.index, data.text, output[0], output[1], output[2]);
                        this.lastIndex = data.index;
                        clearInterval(interval);
                    }
                }, 100);
                this.processing = false;
                this.emit(this.eventName);
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
    generateLipFile(wavFile, fileName, line) {
        const executablePath = '"' + process.env.SKYRIM_FOLDER + '\\Tools\\LipGen\\LipGenerator\\LipGenerator.exe"';
        const args = [
            '"' + wavFile + '"',
            '"' + line + '"'
        ];
        syncExec(executablePath + " " + args.join(' '));
    }
    async saveAudio(audioData, index, voiceFileName, line, stepCount, temp_file_suffix) {
        if (!audioData) {
            return 0;
        }
        const fileName = `temp-${temp_file_suffix}_${stepCount}.txt`;
        const tempFileName = `./Audio/Temp/${fileName}`;
        fs.writeFileSync(tempFileName, audioData, 'utf8');
        let duration = 0;
        try {
            let audioFile = './Audio/Temp/' + voiceFileName + '_' + stepCount + '_' + index + '.wav';
            let lipFile = './Audio/Temp/' + voiceFileName + '_' + stepCount + '_' + index + '.lip';
            syncExec('"./Audio/combine_audio.exe" ' + audioFile + ' ' + tempFileName);
            duration = await this.getAudioDuration(audioFile);
            this.generateLipFile(audioFile, lipFile, line);
            fs.unlinkSync(tempFileName);
            return [audioFile, lipFile, duration];
        }
        catch (e) {
            console.error("ERROR during processing audio!");
            throw Error("ERROR during processing audio!");
        }
    }
}
//# sourceMappingURL=AudioProcessor.js.map