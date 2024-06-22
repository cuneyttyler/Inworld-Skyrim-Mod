import * as dotenv from 'dotenv';
import * as fs from 'fs';
import websocketPlugin from "@fastify/websocket";
import Fastify from 'fastify';
import InworldClientManager from "./Inworld/InworldManager.js";
import { DialogParticipant } from '@inworld/nodejs-sdk';
import DialogueManager from './DialogueManager.js';
import EventBus from './EventBus.js';
import path from "path";
const resolved = path.resolve(".env");
console.log("Reading .env from location: ", resolved);
try {
    dotenv.config({ path: resolved });
}
catch (e) {
    console.error("Something is not right with your env config!", e);
}
const N2N_MAX_STEP_COUNT = 10;
const fastify = Fastify({ logger: true });
fastify.register(websocketPlugin);
const ClientManager = await new InworldClientManager(true, false, 0);
const ClientManager_DungeonMaster = new InworldClientManager(false, true, 2);
const ClientManager_N2N_Source = new InworldClientManager(false, true, 0);
const ClientManager_N2N_Target = new InworldClientManager(false, true, 1);
ClientManager_N2N_Source.SetWorkspaceManager(ClientManager.GetWorkspaceManager());
ClientManager_N2N_Target.SetWorkspaceManager(ClientManager.GetWorkspaceManager());
ClientManager_DungeonMaster.SetWorkspaceManager(ClientManager.GetWorkspaceManager());
var dialogueManager = new DialogueManager(N2N_MAX_STEP_COUNT, ClientManager_DungeonMaster, ClientManager_N2N_Source, ClientManager_N2N_Target);
;
var dialogueHistory = [];
EventBus.GetSingleton().on('TARGET_RESPONSE', (msg) => {
    dialogueHistory.push({
        talker: DialogParticipant.CHARACTER,
        phrase: msg
    });
});
process.on('uncaughtException', function (err, origin) {
    logToErrorLog(JSON.stringify({ err, origin }));
});
process.on('unhandledRejection', function (err, origin) {
    logToErrorLog(JSON.stringify({ err, origin }));
});
RunInformation();
OverrideConsole();
logToLog("=============================S=T=A=R=T=I=N=G===T=H=E===M=O=D=============================");
fastify.get('/ping', (request, reply) => {
    return { 'status': "OK" };
});
fastify.register(async function (fastify) {
    fastify.get('/chat', {
        websocket: true
    }, (connection, req) => {
        connection.socket.on('message', msg => {
            let message = JSON.parse(msg.toString());
            console.log("Message received", message);
            if (message.type == "connect" && !message.is_n2n) {
                let result = ClientManager.ConnectToCharacterViaSocket(message.id, process.env.PLAYER_NAME, connection.socket);
                if (result) {
                    dialogueHistory.push({
                        talker: DialogParticipant.UNKNOWN,
                        phrase: 'In ' + message.location + ', on ' + message.currentDateTime + ', you started to talk with ' + process.env.PLAYER_NAME + '. '
                    });
                    ClientManager.SendNarratedAction('Please keep your answers. short.');
                }
            }
            else if (message.type == "start_listen" && !message.is_n2n) {
                ClientManager.StartTalking();
            }
            else if (message.type == "stop_listen" && !message.is_n2n) {
                ClientManager.StopTalking();
            }
            else if (message.type == "message" && !message.is_n2n) {
                ClientManager.Say(message.message);
                dialogueHistory.push({
                    talker: DialogParticipant.PLAYER,
                    phrase: message.message
                });
            }
            else if (message.type == "stop" && !message.is_n2n) {
                ClientManager.SaveDialogueHistory(message.id, dialogueHistory);
                dialogueHistory = [];
            }
            else if (message.type == "connect" && message.is_n2n) {
                ClientManager_DungeonMaster.ConnectToCharacterViaSocket(message.source, "DungeonMaster", connection.socket);
                ClientManager_N2N_Source.ConnectToCharacterViaSocket(message.target, message.source, connection.socket);
                ClientManager_N2N_Target.ConnectToCharacterViaSocket(message.source, message.target, connection.socket);
            }
            else if (message.type == "start" && message.is_n2n) {
                dialogueManager.Manage_N2N_Dialogue(message.source, message.target, message.location, message.currentDateTime);
            }
            else if (message.type == "stop" && message.is_n2n) {
                if (dialogueManager && dialogueManager.running()) {
                    dialogueManager.stop();
                }
            }
        });
    });
});
const StartEngine = async () => {
    try {
        let portOnConfig = parseInt(process.env.CLIENT_PORT);
        await fastify.listen({ port: portOnConfig });
    }
    catch (err) {
        logToLog(JSON.stringify(err));
        fastify.log.error(err);
        console.error(err);
        process.exit(1);
    }
};
StartEngine();
function RunInformation() {
    console.log("\x1b[32m", `                                                                                                    
                                                                                                    
                                                                                                    
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
        const timestamp = new Date().toISOString();
        const args = Array.prototype.slice.call(arguments);
        args.unshift(`[${timestamp}]`);
        originalLog.apply(console, args);
    };
    const originalError = console.error;
    console.error = function () {
        const timestamp = new Date().toISOString();
        const args = Array.prototype.slice.call(arguments);
        args.unshift(`[${timestamp}]`);
        originalError.apply(console, args);
        logToLog(JSON.stringify(args));
    };
    console.logToLog = function () {
        logToLog(JSON.stringify(Array.prototype.slice.call(arguments)));
    };
}
function logToLog(message) {
    const timestamp = new Date().toISOString();
    const logMessage = `${timestamp} - ${message}`;
    const logFileName = "InworldClient.log";
    if (fs.existsSync(logFileName)) {
        fs.appendFileSync(logFileName, logMessage + '\n', 'utf8');
    }
    else {
        fs.writeFileSync(logFileName, logMessage + '\n', 'utf8');
    }
}
export function logToErrorLog(message) {
    const timestamp = new Date().toISOString();
    const logMessage = `${timestamp} - ${message}`;
    const logFileName = "InworldClientError.log";
    if (fs.existsSync(logFileName)) {
        fs.appendFileSync(logFileName, logMessage + '\n', 'utf8');
    }
    else {
        fs.writeFileSync(logFileName, logMessage + '\n', 'utf8');
    }
}
