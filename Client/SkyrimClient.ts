import * as dotenv from 'dotenv'
import * as fs from 'fs';
import websocketPlugin, {SocketStream} from "@fastify/websocket"
import Fastify, {FastifyRequest} from 'fastify'
import InworldClientManager from "./Inworld/InworldManager.js";
import { DialogParticipant } from '@inworld/nodejs-sdk';
import DialogueManager from './DialogueManager.js'
import EventBus from './EventBus.js';
import path from "path";
import waitSync from 'wait-sync'

const resolved = path.resolve(".env");
console.log("Reading .env from location: ", resolved);
try {
    dotenv.config({path: resolved})
} catch (e) {
    console.error("Something is not right with your env config!", e)
}

const N2N_MAX_STEP_COUNT = 10;

const fastify = Fastify({logger: true});
fastify.register(websocketPlugin);

const ClientManager = await new InworldClientManager(true, false, 0);
const ClientManager_DungeonMaster = new InworldClientManager(false, true, 2);
const ClientManager_N2N_Source = new InworldClientManager(false, true, 0);
const ClientManager_N2N_Target = new InworldClientManager(false, true, 1);
ClientManager_N2N_Source.SetWorkspaceManager(ClientManager.GetWorkspaceManager())
ClientManager_N2N_Target.SetWorkspaceManager(ClientManager.GetWorkspaceManager())
ClientManager_DungeonMaster.SetWorkspaceManager(ClientManager.GetWorkspaceManager())

var dialogueManager = new DialogueManager(N2N_MAX_STEP_COUNT, ClientManager_DungeonMaster, ClientManager_N2N_Source, ClientManager_N2N_Target);;

var id;
var formId;
var dialogueHistory = [];
var _profile;

EventBus.GetSingleton().on('TARGET_RESPONSE', (msg) => {
    dialogueHistory.push({
        talker: DialogParticipant.CHARACTER,
        phrase: msg
    })
});

EventBus.GetSingleton().on('END', (msg) => {
    if(!id) return;

    ClientManager.SaveDialogueHistory(id + "_" + formId, dialogueHistory, _profile);
    ClientManager.CleanupScene();
    dialogueHistory = [];
    _profile = null;
    id = null;
    formId = null;
});

function GetEventFile(id, profile) {
    try {
        id = id.toLowerCase();
        let profileFolder = './Profiles/' + profile;
        if(!fs.existsSync(profileFolder)) {
            fs.mkdirSync(profileFolder);
        }
        if(!fs.existsSync(profileFolder + '/Events')) {
            fs.mkdirSync(profileFolder + '/Events');
        }
        let fileName = profileFolder + '/Events/' + id + '.json'
        if(!fs.existsSync(fileName)) {
            fs.writeFileSync(fileName, "", "utf8");
        }
        return fileName;
    } catch (err) {
      console.error('Error reading or parsing the file:', err);
      return
    }
}

function GetEvents(id, profile) {
    let eventFile = GetEventFile( id, profile);
    return fs.readFileSync(eventFile, 'utf8')
}

function SaveEventLog(id, log, profile) {
    try {
        id = id.toLowerCase();
        let eventFile = GetEventFile(id, profile);

        if(!fs.existsSync(eventFile)) {
            console.error("Event file not exists: " + eventFile);
            return;
        }
        fs.appendFileSync(eventFile, log, 'utf8')
    } catch (err) {
      console.error('Error writing the file:', err);
      return false;
    }
}

process.on('uncaughtException', function  (err, origin) {
    console.error('Caught exception: ', err, origin);
    logToErrorLog(JSON.stringify({err, origin}));
});

process.on('unhandledRejection', function (err, origin) {
    console.error('Caught rejection: ', err, origin);
    logToErrorLog(JSON.stringify({err, origin}));
});

RunInformation();
OverrideConsole();
logToLog("=============================S=T=A=R=T=I=N=G===T=H=E===M=O=D=============================");

fastify.get('/ping', (request, reply) => {
    return {'status': "OK"}
});

// Socket connection for better communication channel
fastify.register(async function (fastify) {
    fastify.get('/chat', {
        websocket: true
    }, (connection : SocketStream, req : FastifyRequest) => {
        connection.socket.on('message', async (msg) => {
            let message = JSON.parse(msg.toString());
            if(message.type != 'log_event') {
                console.log("Message received", msg.toString());
            }
            if (message.type == "connect" && !message.is_n2n) {
                let result = await ClientManager.ConnectToCharacterViaSocket(message.id, message.playerName, message.playerName, connection.socket);
                if(result) {
                    id = message.id;
                    formId = message.formId;
                    _profile = message.playerName;
                    dialogueHistory.push({
                        talker: DialogParticipant.UNKNOWN,
                        phrase: 'In ' + message.location + ', on ' + message.currentDateTime + ', you started to talk with ' + message.playerName + '. '
                    });
                    // ClientManager.SendNarratedAction('Please keep your answers short if possible.');
                    let events = GetEvents(id + "_" + formId, _profile)
                    if(events && events != "") {
                        console.log("Sending event log for " + message.id);
                        ClientManager.SendNarratedAction(events);
                    }
                }
            } else if (message.type == "message" && !message.is_n2n) {
                if(message.stop) {
                    ClientManager.Stop();
                }
                ClientManager.Say(message.message);
                dialogueHistory.push({
                    talker: DialogParticipant.PLAYER,
                    phrase: message.message
                });
            } else if (message.type == "stop" && !message.is_n2n) {
                EventBus.GetSingleton().emit("END")
            } else if (message.type == "connect" && message.is_n2n) {
                let result = await ClientManager_DungeonMaster.ConnectToCharacterViaSocket(message.source, "DungeonMaster", message.playerName, connection.socket);
                result = result && await ClientManager_N2N_Source.ConnectToCharacterViaSocket(message.target, message.source, message.playerName, connection.socket);
                result = result && await ClientManager_N2N_Target.ConnectToCharacterViaSocket(message.source, message.target, message.playerName, connection.socket);
                if(result) {
                    let sourceEvents = GetEvents(message.source + "_" + message.sourceFormId, message.playerName)
                    if(sourceEvents && sourceEvents != "") {
                        ClientManager_DungeonMaster.SendNarratedAction(sourceEvents);
                        ClientManager_N2N_Target.SendNarratedAction(sourceEvents);
                    }
                    let targetEvents = GetEvents(message.target + "_" + message.targetFormid, message.playerName)
                    if(targetEvents && targetEvents != "") {
                        ClientManager_N2N_Source.SendNarratedAction(targetEvents);
                    }
                }
            } else if (message.type == "start" && message.is_n2n) {
                dialogueManager.Manage_N2N_Dialogue(message.source, message.target, message.sourceFormId, message.targetFormId, message.playerName, message.location, message.currentDateTime)
            } else if (message.type == "stop" && message.is_n2n) {
                if(dialogueManager && dialogueManager.running()) {
                    dialogueManager.stop();
                    ClientManager_DungeonMaster.CleanupScene()
                    ClientManager_N2N_Source.CleanupScene()
                    ClientManager_N2N_Target.CleanupScene()
                }
            } else if (message.type == "log_event") {
                SaveEventLog(message.id + "_" + message.formId, message.message + " ", message.playerName);
                if(ClientManager.IsConversationOngoing()) {
                    ClientManager.SendNarratedAction(message.message + " ");
                }
                if(dialogueManager.IsConversationOngoing()) {
                    ClientManager_DungeonMaster.SendNarratedAction(message.message + " ");
                    ClientManager_N2N_Target.SendNarratedAction(message.message + " ");
                    ClientManager_N2N_Source.SendNarratedAction(message.message + " ");
                }
            }
        })
    })
});

// Run the server!
const StartEngine = async () => {
    try {
        let portOnConfig = parseInt(process.env.CLIENT_PORT);
        await fastify.listen({port: portOnConfig})
    } catch (err) {
        logToLog(JSON.stringify(err));
        fastify.log.error(err);
        console.error(err);
        process.exit(1)
    }
}; 

StartEngine();


function RunInformation(){
    console.log("\x1b[32m",`                                                                                                    
                                                                                                    
                                                                                                    
                                             @        ,                                             
                                            @@@       @@#                                           
                                           @@           @@                                          
                                          @@    (       &@@                                         
                                         @@@   &@@@@     @@@                                        
                                       *@@@    @@  (@%    @&@                                       
                                      @@,@*   (      #@   @@ @                                      
                                     @@ @@@        @@,    @@@ @,                                    
                                    @@ @@      @@,          @@ @@                                   
                                   @@ @@&      @@@          @@@ @@                                  
                                  @@.@@@    @#@ @@@*  .@&   %@@@.@@                                 
                                  @@ @@@&&, &@@@@@@@@@ @   &@@@ @@/                                 
                                   @@#@@@ @@@@@@@@ @@@@@@@@@@@,@@                                   
                                    (@@@@@@@% @@@@@@@@# /@@@@&@@                                    
                                      @@@@@  @  @@@.@ &   #@@@@                                     
                                       @@@,       @@.     @@@@                                      
                                        @@@       @@@     @@@                                       
                                         @@@@@    &@@  @@@@&                                        
                                          @@@@   @@    @@@                                          
                                           @@@  @&     &@                                           
                                            ,@  %@                                                  
                                                &@                                                  
                                               @                                                    
                                                @, #@                                               
                                                 @@&                                                
                                                  ,                                                 
                                                                                                   `);
    console.log("\x1b[34m", "****************************************************");
    console.log("\x1b[32m", "Don't worry, you are suppose to see this!");
    console.log("\x1b[34m", "\n****************************************************\n\n");
    console.log("\x1b[31m", "DONT close this window or other window that opens if you want to use the mod. Close both only once you are done with the game. (Especially audio one because it really hits CPU)");
    console.log("\x1b[32m", "Errors will shown here.");
}

function OverrideConsole() {
    const originalLog = console.log;
    console.log = function () {
        const timestamp: string = new Date().toISOString();
        const args = Array.prototype.slice.call(arguments);
        args.unshift(`[${timestamp}]`);
        originalLog.apply(console, args);
    };
    const originalError = console.error;
    console.error = function () {
        const timestamp: string = new Date().toISOString();
        const args = Array.prototype.slice.call(arguments);
        args.unshift(`[${timestamp}]`);
        originalError.apply(console, args);
        logToLog(JSON.stringify(args));
    };

    (console as any).logToLog =   function () {
        logToLog(JSON.stringify(Array.prototype.slice.call(arguments)));
    }
}

export function logToLog(message: string): void {
    const timestamp: string = new Date().toISOString();
    const logMessage: string = `${timestamp} - ${message}`;
    const logFileName = "InworldClient.log"
    if (fs.existsSync(logFileName)) { // File exists, append to it
        fs.appendFileSync(logFileName, logMessage + '\n', 'utf8');
    } else { // File does not exist, create it and write the log message
        fs.writeFileSync(logFileName, logMessage + '\n', 'utf8');
    }
}

export function logToErrorLog(message: string): void {
    const timestamp: string = new Date().toISOString();
    const logMessage: string = `${timestamp} - ${message}`;
    const logFileName = "InworldClientError.log"
    if (fs.existsSync(logFileName)) { // File exists, append to it
        fs.appendFileSync(logFileName, logMessage + '\n', 'utf8');
    } else { // File does not exist, create it and write the log message
        fs.writeFileSync(logFileName, logMessage + '\n', 'utf8');
    }
}

// setTimeout(async () => {
//     console.log("Connecting...")
//     let result = await ClientManager.ConnectToCharacterViaSocket("Abelone", "0", "Uriel", null)
//     result = result && await ClientManager_DungeonMaster.ConnectToCharacterViaSocket("Faendal", "DungeonMaster", "Uriel", null);
//     result = result && await ClientManager_N2N_Source.ConnectToCharacterViaSocket("Gerdur", "Faendal", "Uriel", null);
//     result = result && await ClientManager_N2N_Target.ConnectToCharacterViaSocket("Faendal", "Gerdur", "Uriel", null);
    
            
//     if(result) {
//         console.log("Successful")
//         dialogueManager.Manage_N2N_Dialogue("Faendal", "Gerdur", "0", "1", "Uriel", "Riverwood", "")
//         ClientManager.Say("Greetings.")
//         setInterval(() => {
//             ClientManager.Say("Can you tell me about something interesting?")
//         },2000)
        
//     }
// }, 5000);