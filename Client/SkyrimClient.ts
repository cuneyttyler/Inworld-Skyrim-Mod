import * as dotenv from 'dotenv'
import * as fs from 'fs';
import websocketPlugin, {SocketStream} from "@fastify/websocket"
import Fastify, {FastifyRequest} from 'fastify'
import InworldClientManager from "./Inworld/InworldManager.js";
import { DialogParticipant } from '@inworld/nodejs-sdk';
import DialogueManager from './DialogueManager.js'
import EventBus from './EventBus.js';
import path from "path";

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
var dialogueHistory = [];

EventBus.GetSingleton().on('TARGET_RESPONSE', (msg) => {
    dialogueHistory.push({
        talker: DialogParticipant.CHARACTER,
        phrase: msg
    })
});

EventBus.GetSingleton().on('END', (msg) => {
    ClientManager.SaveDialogueHistory(id, dialogueHistory);
    ClientManager.CleanupScene();
});

function GetEventFile(id) {
    try {
        id = id.toLowerCase();
        let fileName = './Events/' + id + '.json'
        if(!fs.existsSync(fileName)) {
            fs.writeFileSync(fileName, "", "utf8");
        }
        return fileName;
    } catch (err) {
      console.error('Error reading or parsing the file:', err);
      return
    }
}

function GetEvents(id) {
    let eventFile = GetEventFile(id);
    return fs.readFileSync(eventFile, 'utf8')
}

function SaveEventLog(id, log) {
    try {
        id = id.toLowerCase();
        let eventFile = GetEventFile(id);

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
                console.log("Message received", message);
            }
            if (message.type == "connect" && !message.is_n2n) {
                let result = await ClientManager.ConnectToCharacterViaSocket(message.id, message.playerName, connection.socket);
                if(result) {
                    id = message.id;
                    dialogueHistory.push({
                        talker: DialogParticipant.UNKNOWN,
                        phrase: 'In ' + message.location + ', on ' + message.currentDateTime + ', you started to talk with ' + process.env.PLAYER_NAME + '. '
                    });
                    ClientManager.SendNarratedAction('Please keep your answers. short.');
                    let events = GetEvents(message.id)
                    if(events && events != "") {
                        ClientManager.SendNarratedAction(events);
                    }
                }
            } else if (message.type == "start_listen" && !message.is_n2n) {
                ClientManager.StartTalking();
            } else if (message.type == "stop_listen" && !message.is_n2n) {
                ClientManager.StopTalking();
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
                ClientManager.SaveDialogueHistory(message.id, dialogueHistory);
                ClientManager.CleanupScene()
                dialogueHistory = [];
            } else if (message.type == "connect" && message.is_n2n) {
                let result = await ClientManager_DungeonMaster.ConnectToCharacterViaSocket(message.source, "DungeonMaster", connection.socket);
                result = result && await ClientManager_N2N_Source.ConnectToCharacterViaSocket(message.target, message.source , connection.socket);
                result = result && await ClientManager_N2N_Target.ConnectToCharacterViaSocket(message.source, message.target , connection.socket);
                if(result) {
                    let sourceEvents = GetEvents(message.source)
                    if(sourceEvents && sourceEvents != "") {
                        ClientManager_DungeonMaster.SendNarratedAction(sourceEvents);
                        ClientManager_N2N_Target.SendNarratedAction(sourceEvents);
                    }
                    let targetEvents = GetEvents(message.target)
                    if(targetEvents && targetEvents != "") {
                        ClientManager_N2N_Source.SendNarratedAction(targetEvents);
                    }
                }
            } else if (message.type == "start" && message.is_n2n) {
                dialogueManager.Manage_N2N_Dialogue(message.source, message.target, message.location, message.currentDateTime)
            } else if (message.type == "stop" && message.is_n2n) {
                if(dialogueManager && dialogueManager.running()) {
                    dialogueManager.stop();
                    ClientManager_DungeonMaster.CleanupScene()
                    ClientManager_N2N_Source.CleanupScene()
                    ClientManager_N2N_Target.CleanupScene()
                }
            } else if (message.type == "log_event") {
                SaveEventLog(message.id, message.message + " ");
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
//     let result = await ClientManager.ConnectToCharacterViaSocket("Faendal","Uriel", null)
//     if(result) {
//         console.log("Successful")
//         // ClientManager.SendNarratedAction("Hilde said \"These travellers are passing by too often these days\"")
//         ClientManager.SendNarratedAction("Alvor said \"I heard tales of a great bow called SkyRaver.\"")
//         ClientManager.Say("What's he talking about?")

//         // let events = GetEvents("Faendal")
//         // if(events && events != "") {
//         //     console.log("Sending events.")
//         //     ClientManager.SendNarratedAction(events);
//         // }
//         // ClientManager.Say("So you say... Love is complicated. What's the name of that girl again?")
//     }
// }, 5000);