// @ts-check
import {InworldClient, InworldConnectionService} from '@inworld/nodejs-sdk';
import InworldWorkspaceManager from './InworldWorkspaceManager.js';
import {BLCRecorder} from './Audio/BLCRecorder.js';
import {SkyrimInworldController,GetPayload} from './SkyrimInworldController.js';
import {logToErrorLog} from '../SkyrimClient.js'
import * as fs from 'fs';
import waitSync from 'wait-sync'

const WORKSPACE_NAME = process.env.INWORLD_WORKSPACE;

const defaultConfigurationConnection = {
    autoReconnect: true,
    disconnectTimeout: 3600 * 60
}

export default class InworldClientManager {
    private managerId: number;
    private connection : InworldConnectionService;
    private client : InworldClient;
    private IsConnected : boolean;
    private workspaceManager : InworldWorkspaceManager;
    private blcRecorder : BLCRecorder;
    private inworldController : SkyrimInworldController;
    private isVoiceConnected = false;
    private isAudioSessionStarted = false;
    private is_n2n = false;
    private speaker;
    private conversationOngoing;
    private is_ending = false;
    private isGeneric = false;
    private genericCharacterId: string;

    currentCapabilities = {
        audio: true,
        emotions: true,
        phonemes: true,
        narratedActions: true
    }

    constructor(setupWorkspace, is_n2n, speaker) {
        this.managerId = !is_n2n ? 0 : speaker + 1;
        this.is_n2n = is_n2n;
        this.speaker = speaker;
        this.SetupClientAndWorkspace(setupWorkspace)
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

    // Socket version of connection
    async ConnectToCharacterViaSocket(characterId : string, speakerName : string, playerName : string, socket : WebSocket) {
        try {
            this.genericCharacterId = null;
            this.isGeneric = false;
            let id = this.workspaceManager.GetCharacterIdentifier(characterId);
            console.log(`Requested to talk with ${characterId} which corresponds to ${id} on database.`);
            (console as any).logToLog(`Requested to talk with ${characterId} which corresponds to ${id} on database.`)
            if (!id) {
                let errorResult = `Cannot connect to ${id} or ${characterId}`;
                throw errorResult
            }
            console.log("Requesting connecting to " + id);
            // let scene = await this.workspaceManager.UpdateScene(!this.is_n2n ? 0 : this.speaker + 1, [id]);
            let scene = "workspaces/" + WORKSPACE_NAME + "/characters/" + id
            this.client.setUser({fullName: speakerName});
            this.client.setScene(scene);
            this.is_ending = false;

            this.inworldController = new SkyrimInworldController(this.managerId, this, socket);
            this.client.setOnMessage((data : any) => this.inworldController.ProcessMessage(data));

            this.client.setOnError((err) => {
                if (err.code != 10 && err.code != 1)
                    logToErrorLog(JSON.stringify(err));
            });
            let dialogueHistory = this.GetDialogueHistory(!this.isGeneric ? id : this.genericCharacterId, playerName);
            if(dialogueHistory)
                this.client.setSessionContinuation({
                    previousDialog: dialogueHistory
                });
            this.connection = this.client.build();
            this.IsConnected = true;
            // if (!this.is_n2n && !this.isVoiceConnected) {
            //     console.log("Creating voice listener connection");
            //     let port = parseInt(process.env.AUDIO_PORT);
            //     this.blcRecorder = new BLCRecorder("127.0.0.1", port);
            //     this.blcRecorder.connect(this.connection);
            //     this.inworldController.SetRecorder(this.blcRecorder);
            // }
            let characters = await this.connection.getCharacters()
            this.connection.setCurrentCharacter(characters[0])
            console.log("Starting audio session...")
            this.connection.sendAudioSessionStart();
            let verifyConnection = GetPayload("connection established", "established", 0, this.is_n2n, this.speaker);
            console.log("Connection to " + id + " is succesfull" + JSON.stringify(verifyConnection));
            (console as any).logToLog(`Connection to ${id} is succesfull.`)
            this.isAudioSessionStarted = true;
            console.log("Sending verify connection, speaker: " + this.speaker)
            socket.send(JSON.stringify(verifyConnection));
            this.conversationOngoing = true;
            return true
        } catch(err) {
            if(characterId.includes("GenericMale") || characterId.includes("GenericFemale")) {
                console.error("ERROR during connecting " + speakerName + " -> " + characterId)
                console.error(err);
                let returnDoesNotExist = GetPayload("NPC is not in database.", "doesntexist", 0, this.is_n2n, this.speaker);
                socket.send(JSON.stringify(returnDoesNotExist));
                return false;
            }

            console.log(characterId +' is a generic NPC. Connecting to generic NPC.');

            let character = this.workspaceManager.GetGenericCharacter(characterId.toLowerCase());
            if(character == null) {
                console.error("ERROR during connecting " + speakerName + " -> " + characterId + ". Generic NPC doesn't exist.")
                console.error(err);
                let returnDoesNotExist = GetPayload("NPC is not in database.", "doesntexist", 0, this.is_n2n, this.speaker);
                socket.send(JSON.stringify(returnDoesNotExist));
                return false;
            }

            if(!character.genericIndex) {
                console.error("Generic character index could not be found for " + character.name);
                return false;
            }

            let genericCharacterId = null
            if(character.defaultCharacterAssets.voice.gender == 'VOICE_GENDER_MALE') {
                genericCharacterId = "GenericMale" + character.genericIndex;
            } else if(character.defaultCharacterAssets.voice.gender == 'VOICE_GENDER_FEMALE') {
                genericCharacterId = "GenericFemale" + character.genericIndex;
            } else {
                console.error("Character gender could not be found.");
                return false;
            }
            
            this.genericCharacterId = characterId.toLowerCase();
            this.isGeneric = true;
            await this.ConnectToCharacterViaSocket(genericCharacterId, speakerName, playerName, socket);
            setTimeout(() => {
                let prompt = this.workspaceManager.PreparePrompt(character);
                this.SendNarratedAction(prompt);
            }, 2000)
            return true;
        }
    }

    Stop() {
        this.is_ending = true;
    }

    IsEnding() {
        return this.is_ending;
    }

    GetDialogueHistory(id, profile) {
        try {
            id = id.toLowerCase();
            let profileFolder = './Profiles/' + profile;
            if(!fs.existsSync(profileFolder)) { 
                fs.mkdirSync(profileFolder); 
            }
            if(!fs.existsSync(profileFolder + '/Conversations')) {
                fs.mkdirSync(profileFolder + '/Conversations'); 
            }
            let fileName = profileFolder + '/Conversations/' + id + '.json'
            if(!fs.existsSync(fileName)) return
            let data = fs.readFileSync(fileName, 'utf8')
            return JSON.parse(data)
        } catch (err) {
          console.error('Error reading or parsing the file:', err);
          return
        }
    }

    CleanupScene() {
        this.workspaceManager.UpdateScene(!this.is_n2n ? 0 : 1, [])
    }

    async SaveDialogueHistory(id, history, profile) {
        try {
            id = id.toLowerCase();
            let previousHistory = this.GetDialogueHistory(id, profile)
            let newHistory = null;
            if(previousHistory) {
                newHistory = previousHistory.concat(history)
            } else {
                newHistory = history;
            }
            let fileName = './Profiles/' + profile + '/Conversations/' + id + '.json'

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
            this.is_ending = is_ending ? is_ending : this.is_ending;
        }
    }

    SendNarratedAction(message: string) {
        this.connection.sendNarratedAction(message);   
    }

    SendTrigger(trigger, parameters?) {
        this.connection.sendTrigger(trigger, parameters);   
    }

    SendEndSignal() {
        if(this.inworldController) {
            this.inworldController.SendEndSignal(this.is_n2n)
        }
    }

    IsConversationOngoing() {
        return this.conversationOngoing;
    }

    IsN2N() {
        return this.is_n2n;
    }

    Speaker() {
        return this.speaker;
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
