// @ts-check
import {InworldClient, InworldConnectionService} from '@inworld/nodejs-sdk';
import InworldWorkspaceManager from './InworldWorkspaceManager.js';
import {BLCRecorder} from './Audio/BLCRecorder.js';
import {SkyrimInworldSocketController,GetSocketResponse} from './SkyrimInworldSocketController.js';
import {logToErrorLog} from '../SkyrimClient.js'
import * as fs from 'fs';
import waitSync from 'wait-sync';

const WORKSPACE_NAME = process.env.INWORLD_WORKSPACE;

const defaultConfigurationConnection = {
    autoReconnect: true,
    disconnectTimeout: 3600 * 60
}

export default class InworldClientManager {
    private connection : InworldConnectionService;
    private client : InworldClient;
    private IsConnected : boolean;
    private workspaceManager : InworldWorkspaceManager;
    private blcRecorder : BLCRecorder;
    private socketController : SkyrimInworldSocketController;
    private isVoiceConnected = false;
    private isAudioSessionStarted = false;
    private conversationOngoing;
    private setupWorkspace: boolean;
    private prompt;
    private participants : string[] = [];

    currentCapabilities = {
        audio: true,
        emotions: true,
        phonemes: true
    }

    constructor() { 
        this.SetupWorkspaceAndClient();
    }

    async SetupWorkspaceAndClient() {
        this.SetupClientAndWorkspace();
    }

    async SetupClientAndWorkspace() {
        this.workspaceManager = new InworldWorkspaceManager();
        this.CreateClient();
    }

    async ConnectToCharacter(characterId : string, socket : WebSocket) {
        try {
            this.prompt = null;
            let id = this.workspaceManager.GetCharacterIdentifier(characterId);
            console.log(`Requested to talk with ${characterId} which corresponds to ${id} on database.`);
            (console as any).logToLog(`Requested to talk with ${characterId} which corresponds to ${id} on database.`)
            if (!id) {
                let errorResult = `Cannot connect to ${id} or ${characterId}`;
                throw errorResult
            }

            this.participants.push('workspaces/' + WORKSPACE_NAME + '/characters/' + id)
        } catch(err) {
            if(characterId.includes("GenericMale") || characterId.includes("GenericFemale")) {
                console.error("ERROR during connecting " + characterId)
                console.error(err);
                let returnDoesNotExist = GetSocketResponse("This soul lacks the divine blessing of conversational endowment bestowed by the gods.", "1-1", "doesntexist", 0, null, null);
                // socket.send(JSON.stringify(returnDoesNotExist));
                throw "ERROR during connecting " + characterId;
            }

            console.log(characterId +' is a generic NPC. Connecting to generic NPC.');
            let character = this.workspaceManager.GetGenericCharacter(characterId.toLowerCase());
            if(character == null) {
                console.error("ERROR during connecting " + characterId)
                console.error(err);
                let returnDoesNotExist = GetSocketResponse("This soul lacks the divine blessing of conversational endowment bestowed by the gods.", "1-1", "doesntexist", 0, null, null);
                // socket.send(JSON.stringify(returnDoesNotExist));
                throw "Generic character for " + characterId + " is not defined.";
            }

            if(!character.genericIndex) {
                console.error("Generic character index could not be found for " + character.name);
                throw "Generic character index could not be found for " + character.name;
            }

            let genericCharacterId = null
            if(character.defaultCharacterAssets.voice.gender == 'VOICE_GENDER_MALE') {
                genericCharacterId = "GenericMale" + character.genericIndex;
            } else if(character.defaultCharacterAssets.voice.gender == 'VOICE_GENDER_FEMALE') {
                genericCharacterId = "GenericFemale" + character.genericIndex;
            } else {
                console.error("Character gender could not be found.");
                throw "Character gender could not be found. " + character.name
            }
            
            this.prompt = "This is your character information, speak accordingly:" + JSON.stringify(character);
            this.ConnectToCharacter(genericCharacterId, socket);
            return true;
        }
    }

    // Socket version of connection
    async ConnectToCharactersViaSocket(characterIds : string[], playerName : string, socket : WebSocket) {
        try {
            this.participants = []
            for(let i in characterIds) {
                this.ConnectToCharacter(characterIds[i], socket);
            }
            
            let scene = "workspaces/" + WORKSPACE_NAME + "/scenes/genericscene";
            this.client.setUser({fullName: playerName});
            this.client.setScene(scene);

            this.socketController = new SkyrimInworldSocketController(socket);
            this.client.setOnMessage((data : any) => this.socketController.ProcessMessage(data));

            this.client.setOnError((err) => {
                if (err.code != 10 && err.code != 1)
                    logToErrorLog(JSON.stringify(err));
            });
            // let dialogueHistory = this.GetDialogueHistory(!this.prompt ? id : this.genericCharacterId);
            // if(dialogueHistory)
            //     this.client.setSessionContinuation({
            //         previousDialog: dialogueHistory
            //     });
            this.connection = this.client.build();
            this.IsConnected = true;
            // if (!this.isVoiceConnected) {
            //     console.log("Creating voice listener connection");
            //     let port = parseInt(process.env.AUDIO_PORT);
            //     this.blcRecorder = new BLCRecorder("127.0.0.1", port);
            //     this.blcRecorder.connect(this.connection);
            // }
            this.socketController.SetRecorder(this.blcRecorder);
            this.connection.startConversation(this.participants);
            await this.connection.sendAudioSessionStart();
            let verifyConnection = GetSocketResponse("connection established", "1-1", "established", 0, null, null);
            console.log("Connection to " + this.participants.join(', ') + " is succesfull" + JSON.stringify(verifyConnection));
            (console as any).logToLog(`Connection to ${this.participants.join(', ')} is succesfull.`)
            this.isAudioSessionStarted = true;
            console.log("Sending verify connection, " + this.participants.join(', '))
            // socket.send(JSON.stringify(verifyConnection));
            this.conversationOngoing = true;
            return this.participants;
        } catch(err) {
            console.error(err)
            return;
        }
    }

    async Init() {
    }

    GetDialogueHistory(id) {
        try {
            id = id.toLowerCase();
            let fileName = './Conversations/' + id + '.json'
            if(!fs.existsSync(fileName)) return
            let data = fs.readFileSync(fileName, 'utf8')
            return JSON.parse(data)
        } catch (err) {
          console.error('Error reading or parsing the file:', err);
          return
        }
    }

    async SaveDialogueHistory(id, history) {
        try {
            id = id.toLowerCase();
            let previousHistory = this.GetDialogueHistory(id)
            let newHistory = null;
            if(previousHistory) {
                newHistory = previousHistory.concat(history)
            } else {
                newHistory = history;
            }
            let fileName = './Conversations/' + id + '.json'

            if(fs.existsSync(fileName)) {
                fs.unlinkSync(fileName)
            }
            fs.writeFileSync(fileName, JSON.stringify(newHistory), 'utf8')
        } catch (err) {
          console.error('Error writing the file:', err);
          return false;
        }
    }

    Say(message : string, is_ending?) {
        if (this.IsConnected) {
            this.connection.sendText(message);
        }
    }

    SendNarratedAction(message: string) {
        this.connection.sendNarratedAction(message);   
    }

    SendTrigger(trigger, parameters?) {
        this.connection.sendTrigger(trigger, parameters);   
    }

    SendEndSignal() {
        // this.socketController.SendEndSignal()
    }

    AddParticipant(characterId) {
        let resourceName = 'workspaces/' + WORKSPACE_NAME + '/characters/' + characterId.toLowerCase()
        this.participants.push(resourceName)
        return resourceName
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
        }, 500)
    }

    CreateClient() {
        this.client = new InworldClient();
        this.client.setApiKey({key: process.env.INWORLD_KEY as string, secret: process.env.INWORLD_SECRET as string});
        this.SetConfiguration();
    }

    SetConfiguration() {
        this.client.setConfiguration({connection: defaultConfigurationConnection, capabilities: this.currentCapabilities});
    }
}
