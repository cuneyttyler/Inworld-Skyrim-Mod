import { InworldClient } from '@inworld/nodejs-sdk';
import InworldWorkspaceManager from './InworldWorkspaceManager.js';
import { BLCRecorder } from './Audio/BLCRecorder.js';
import { SkyrimInworldSocketController, GetSocketResponse } from './SkyrimInworldSocketController.js';
import { logToErrorLog } from '../SkyrimClient.js';
import * as fs from 'fs';
const WORKSPACE_NAME = process.env.INWORLD_WORKSPACE;
const defaultConfigurationConnection = {
    autoReconnect: true,
    disconnectTimeout: 3600 * 60
};
export default class InworldClientManager {
    connection;
    client;
    IsConnected;
    workspaceManager;
    blcRecorder;
    socketController;
    isVoiceConnected = false;
    isAudioSessionStarted = false;
    is_n2n = false;
    speaker = false;
    characterName;
    conversationOngoing;
    is_ending = false;
    prompt;
    genericCharacterId;
    currentCapabilities = {
        audio: true,
        emotions: true,
        phonemes: true,
        narratedActions: true
    };
    constructor(setupWorkspace, is_n2n, speaker) {
        this.is_n2n = is_n2n;
        this.speaker = speaker;
        this.SetupClientAndWorkspace(setupWorkspace);
    }
    GetWorkspaceManager() {
        return this.workspaceManager;
    }
    SetWorkspaceManager(workspaceManager) {
        this.workspaceManager = workspaceManager;
    }
    async SetupClientAndWorkspace(setupWorkspace) {
        this.workspaceManager = new InworldWorkspaceManager(setupWorkspace);
        this.CreateClient();
    }
    async ConnectToCharacterViaSocket(characterId, playerName, socket) {
        try {
            this.genericCharacterId = null;
            this.prompt = null;
            let id = this.workspaceManager.GetCharacterIdentifier(characterId);
            console.log(`Requested to talk with ${characterId} which corresponds to ${id} on database.`);
            console.logToLog(`Requested to talk with ${characterId} which corresponds to ${id} on database.`);
            if (!id) {
                let errorResult = `Cannot connect to ${id} or ${characterId}`;
                throw errorResult;
            }
            console.log("Requesting connecting to " + id);
            let scene = "workspaces/" + WORKSPACE_NAME + "/characters/{CHARACTER_NAME}".replace("{CHARACTER_NAME}", id);
            this.client.setUser({ fullName: playerName });
            this.client.setScene(scene);
            this.is_ending = false;
            this.socketController = new SkyrimInworldSocketController(socket);
            this.client.setOnMessage((data) => this.socketController.ProcessMessage(data, this.is_n2n, this.speaker, this.is_ending));
            this.client.setOnError((err) => {
                if (err.code != 10 && err.code != 1)
                    logToErrorLog(JSON.stringify(err));
            });
            let dialogueHistory = this.GetDialogueHistory(!this.prompt ? id : this.genericCharacterId);
            if (dialogueHistory)
                this.client.setSessionContinuation({
                    previousDialog: dialogueHistory
                });
            this.connection = this.client.build();
            this.IsConnected = true;
            if (!this.is_n2n && !this.isVoiceConnected) {
                console.log("Creating voice listener connection");
                let port = parseInt(process.env.AUDIO_PORT);
                this.blcRecorder = new BLCRecorder("127.0.0.1", port);
                this.blcRecorder.connect(this.connection);
                this.socketController.SetRecorder(this.blcRecorder);
            }
            this.characterName = id;
            console.log("Starting audio session...");
            await this.connection.sendAudioSessionStart();
            let verifyConnection = GetSocketResponse("connection established", "1-1", "established", 0, this.is_n2n, this.speaker);
            console.log("Connection to " + id + " is succesfull" + JSON.stringify(verifyConnection));
            console.logToLog(`Connection to ${id} is succesfull.`);
            this.isAudioSessionStarted = true;
            console.log("Sending verify connection, speaker: " + this.speaker);
            socket.send(JSON.stringify(verifyConnection));
            this.conversationOngoing = true;
            return 1;
        }
        catch (err) {
            if (characterId.includes("GenericMale") || characterId.includes("GenericFemale")) {
                console.error("ERROR during connecting " + playerName + " -> " + characterId);
                console.error(err);
                let returnDoesNotExist = GetSocketResponse("This soul lacks the divine blessing of conversational endowment bestowed by the gods.", "1-1", "doesntexist", 0, this.is_n2n, this.speaker);
                socket.send(JSON.stringify(returnDoesNotExist));
                return 0;
            }
            let character = this.workspaceManager.GetGenericCharacter(characterId.toLowerCase());
            if (character == null) {
                console.error("ERROR during connecting " + playerName + " -> " + characterId);
                console.error(err);
                let returnDoesNotExist = GetSocketResponse("This soul lacks the divine blessing of conversational endowment bestowed by the gods.", "1-1", "doesntexist", 0, this.is_n2n, this.speaker);
                socket.send(JSON.stringify(returnDoesNotExist));
                return 0;
            }
            console.log(character.name + ' is a generic NPC. Connecting to generic NPC.');
            if (!character.genericIndex) {
                console.error("Generic character index could not be found for " + character.name);
                return 0;
            }
            let genericCharacterId = null;
            if (character.defaultCharacterAssets.voice.gender == 'VOICE_GENDER_MALE') {
                genericCharacterId = "GenericMale" + character.genericIndex;
            }
            else if (character.defaultCharacterAssets.voice.gender == 'VOICE_GENDER_FEMALE') {
                genericCharacterId = "GenericFemale" + character.genericIndex;
            }
            else {
                console.error("Character gender could not be found.");
                return 0;
            }
            this.genericCharacterId = characterId.toLowerCase();
            this.prompt = "This is your character information, speak accordingly:" + JSON.stringify(character);
            await this.ConnectToCharacterViaSocket(genericCharacterId, playerName, socket);
            return 2;
        }
    }
    Init(initMessage) {
        if (this.prompt) {
            console.log("Sending prompt.");
            this.SendNarratedAction(this.prompt);
        }
        this.SendNarratedAction(initMessage);
    }
    GetDialogueHistory(id) {
        try {
            id = id.toLowerCase();
            let fileName = './Conversations/' + id + '.json';
            if (!fs.existsSync(fileName))
                return;
            let data = fs.readFileSync(fileName, 'utf8');
            return JSON.parse(data);
        }
        catch (err) {
            console.error('Error reading or parsing the file:', err);
            return;
        }
    }
    async SaveDialogueHistory(id, history) {
        try {
            id = id.toLowerCase();
            let previousHistory = this.GetDialogueHistory(id);
            let newHistory = null;
            if (previousHistory) {
                newHistory = previousHistory.concat(history);
            }
            else {
                newHistory = history;
            }
            let fileName = './Conversations/' + id + '.json';
            if (fs.existsSync(fileName)) {
                fs.unlinkSync(fileName);
            }
            fs.writeFileSync(fileName, JSON.stringify(newHistory), 'utf8');
        }
        catch (err) {
            console.error('Error writing the file:', err);
            return false;
        }
    }
    Say(message, is_ending) {
        if (this.IsConnected) {
            this.connection.sendText(message);
            this.is_ending = is_ending;
        }
    }
    SendNarratedAction(message) {
        this.connection.sendNarratedAction(message);
    }
    SendTrigger(trigger, parameters) {
        this.connection.sendTrigger(trigger, parameters);
    }
    SendEndSignal() {
        this.socketController.SendEndSignal(this.is_n2n);
    }
    async StartTalking() {
        if (!this.isAudioSessionStarted) {
            await this.connection.sendAudioSessionStart();
            this.isAudioSessionStarted = true;
        }
        await this.blcRecorder.start();
    }
    async StopTalking() {
        setTimeout(async () => {
            await this.blcRecorder.stop();
            await this.connection.sendAudioSessionEnd();
            this.isAudioSessionStarted = false;
            this.socketController.SendUserVoiceInput();
        }, 500);
    }
    IsConversationOngoing() {
        return this.conversationOngoing;
    }
    CreateClient() {
        this.client = new InworldClient();
        this.client.setApiKey({ key: process.env.INWORLD_KEY, secret: process.env.INWORLD_SECRET });
        this.SetConfiguration();
    }
    SetConfiguration() {
        this.client.setConfiguration({ connection: defaultConfigurationConnection, capabilities: this.currentCapabilities });
    }
}
