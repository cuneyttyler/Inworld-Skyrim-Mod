import { VoiceTypes } from './Audio/VoiceTypes.js'
import { EventEmitter } from 'events';
import { GetPayload } from './SkyrimInworldController.js';
import * as fs from 'fs';

class Queue<T> {
    private items: T[] = [];

    enqueue(item: T): void {
        this.items.push(item);
    }

    dequeue(): T | undefined {
        return this.items.shift();
    }

    peek(): T | undefined {
        return this.items[0];
    }

    isEmpty(): boolean {
        return this.items.length === 0;
    }

    size(): number {
        return this.items.length;
    }
}

export class SenderData {
    public index: number;
    public text: string;
    public duration: number;
    public audioFile: string;
    public lipFile: string;
    public voiceFileName: string;
    public target: number;

    constructor(index, text, audioFile, lipFile, voiceFileName, duration, target) {
        this.index = index;
        this.text = text;
        this.duration = duration;
        this.audioFile = audioFile;
        this.lipFile = lipFile;
        this.voiceFileName = voiceFileName;
        this.target = target;
    }
}

export class SenderQueue extends EventEmitter {
    private id: number;
    private is_n2n: boolean;
    private eventName: string;
    private socket: WebSocket;
    private queue: Queue<SenderData>;
    private processing: boolean;

    constructor(id: number, is_n2n: boolean, socket: WebSocket) {
        super();
        this.id = id;
        this.is_n2n = is_n2n,
        this.socket = socket;
        this.eventName = 'processNext_' + this.id;
        this.queue = new Queue<SenderData>();
        this.processing = false;
        this.on(this.eventName, this.processNext);
    }

    addData(data: SenderData): void {
        this.queue.enqueue(data);
        if (!this.processing) {
            this.emit(this.eventName);
        }
    }

    private async processNext(): Promise<void> {
        if (this.queue.isEmpty()) {
            this.processing = false;
            return;
        }

        this.processing = true;
        const data = this.queue.dequeue();
        if (data) {
            try {
                await this.processData(data);
            } catch (error) {
                console.error('Error processing audio stream:', error);
            }
        }
    }

    private async processData(data: SenderData): Promise<void> {
        return new Promise(async (resolve) => {
            try {
                await this.copyFiles(data)
                let result = GetPayload(data.text, "chat", data.duration, this.is_n2n, data.target);
                console.log(`${data.text} - (${this.is_n2n} - ${data.target})`)
                this.socket.send(JSON.stringify(result));
                
                setTimeout(() => {
                    this.processing = false;
                    this.emit(this.eventName);
                }, data.duration * 1000 + 500)
            } catch(e) {
                console.error("ERROR: " + e);
            }
        });
    }

    private async copyFiles(data: SenderData) {
        for(var i = 0; i < VoiceTypes.length; i++) {
            var voiceType = VoiceTypes[i];
            var outputFolder = process.env.MODS_FOLDER + "\\WithinWorld\\Sound\\Voice\\WithinWorld.esp\\" + voiceType + "\\";

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

        for(var j = 0; j < VoiceTypes.length; j++) {
            let voiceType = VoiceTypes[j];

            const outputFolder = process.env.MODS_FOLDER + "\\WithinWorld\\Sound\\Voice\\WithinWorld.esp\\" + voiceType + "\\";
            const audioFile = outputFolder + data.voiceFileName + ".wav";
            const lipFile = outputFolder + data.voiceFileName + ".lip";

            // Copying the file to a the same name
            fs.copyFileSync(data.audioFile, audioFile);
            fs.copyFileSync(data.lipFile, lipFile);
        }

        fs.unlinkSync(data.audioFile);
        fs.unlinkSync(data.lipFile);
    }
}