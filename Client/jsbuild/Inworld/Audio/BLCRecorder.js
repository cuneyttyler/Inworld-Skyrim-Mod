import WebSocket from 'ws';
export class BLCRecorder {
    host;
    port;
    socket;
    constructor(host, port) {
        this.host = host;
        this.port = port;
    }
    connect(connection) {
        return new Promise((resolve, reject) => {
            try {
                this.socket = new WebSocket(`ws://${this.host}:${this.port}`, { perMessageDeflate: false });
                this.socket.on('open', () => {
                    console.log(`(Audio Bus) Connected to ${this.host}:${this.port}`);
                    console.logToLog(`(Audio Bus) Connected to ${this.host}:${this.port}`);
                    resolve();
                });
                this.socket.on('message', async function message(data) {
                    console.log("Getting voice data...");
                    await connection.sendAudio(data);
                });
                this.socket.on('error', (err) => {
                    console.error(`Error connecting to ${this.host}:${this.port}: ${err}`);
                    reject(err);
                });
            }
            catch (e) {
                reject("Ops! " + e);
            }
        });
    }
    start() {
        return new Promise((resolve, reject) => {
            this.socket.send("start");
            resolve();
        });
    }
    stop() {
        return new Promise((resolve, reject) => {
            this.socket.send("stop");
            resolve();
        });
    }
    exit() {
        return new Promise((resolve, reject) => {
            this.socket.send("exit");
            resolve();
        });
    }
    playChunk(data) {
        return new Promise((resolve, reject) => {
            this.socket.send('play_audio;;' + data);
            resolve();
        });
    }
    releaseChunks() {
        this.socket.send('release_audio');
    }
    stopAudio() {
        return new Promise((resolve, reject) => {
            this.socket.send('stop_playing');
            resolve();
        });
    }
}
//# sourceMappingURL=BLCRecorder.js.map