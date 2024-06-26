import * as dotenv from 'dotenv'
import * as fs from 'fs';
import websocketPlugin, {SocketStream} from "@fastify/websocket"
import Fastify, {FastifyRequest} from 'fastify'
import InworldClientManager from "./Inworld/InworldManager.js";
import InworldWorkspaceManager from './Inworld/InworldWorkspaceManager.js';
import { DialogParticipant } from '@inworld/nodejs-sdk';
import EventBus from './EventBus.js';
import path from "path";
import waitSync from 'wait-sync';

const resolved = path.resolve(".env");
console.log("Reading .env from location: ", resolved);
try {
    dotenv.config({path: resolved})
} catch (e) {
    console.error("Something is not right with your env config!", e)
}

const fastify = Fastify({logger: true});
fastify.register(websocketPlugin);

const ClientManager = new InworldClientManager();

var dialogueHistory = [];

EventBus.GetSingleton().on('TARGET_RESPONSE', (msg) => {
    dialogueHistory.push({
        talker: DialogParticipant.CHARACTER,
        phrase: msg
    })
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
    logToLog(JSON.stringify({err, origin}));
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
        connection.socket.on('message', msg => {
            let message = JSON.parse(msg.toString());
            console.log("Message received", message);
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

function logToLog(message: string): void {
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

const conv = ["There's a problem with my work. I can't get my salary on date.", "There's a problem with my work. I can't get my salary on date."
    , "Can you describe the problem in legal terms?", "Can you describe the problem in legal terms?", "What is your suggestion for me?", "What is your suggestion for me?"
]
let names = ["Rosemary", "Roger", 'Bob']
class DialogManager {
    private participants = []
    private interrupting = false
    private interrupter;
    private order = 0;

    async run() {
        console.log("Establishing connection.")
        this.participants = await ClientManager.ConnectToCharactersViaSocket(['rosemary', 'roger'], "", null)
        waitSync(2)
        console.log("Sending initiate trigger to " + this.participants[0])
        ClientManager.SendTrigger("n2n_initiate_event", {characterName: this.participants[0], parameters: [{name: "listener", value: names[1]}]})

        EventBus.GetSingleton().on('CONTINUE_CONVERSATION', (data) => {
            console.log('============================')
            console.log(`Message(${data.speaker}): ${data.message}`)
            if(this.interrupting) {
                console.log("Sending interrupt trigger from " + names[names.length - 1] + " with response to " + names[data.speaker])
                ClientManager.SendTrigger("n2n_continue_event", {characterName: this.interrupter, 
                    parameters:[{name: 'speaker', value: names[data.speaker]}, {name:'message', value: data.message}]})        
                this.interrupting = false
                this.interrupter = null
                return
            }

            let index = ++this.order % this.participants.length
            index = index == data.speaker ? (index + 1) % this.participants.length : index
            console.log("Sending continue trigger to " + names[index] + " from " + names[data.speaker])
            ClientManager.SendTrigger("n2n_continue_event", {characterName: this.participants[index], 
                parameters:[{name: 'speaker', value: names[data.speaker]}, {name:'message', value: data.message}]})           
        })

        setTimeout(() => {        
            console.log("Interrupting...")
            this.interrupting = true
            this.interrupter = ClientManager.AddParticipant('Bob')
        }, 30000)
    }
}

setTimeout(() => {
    new DialogManager().run()
}, 5000)
