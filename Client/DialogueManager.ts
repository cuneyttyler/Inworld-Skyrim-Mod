import EventBus from './EventBus.js';
import InworldClientManager from "./Inworld/InworldManager.js";
import { DialogParticipant } from '@inworld/nodejs-sdk';
import { setTimeout } from 'node:timers/promises';

export default class DialogueManager {
    private stepCount = 0;
    private shouldStop = false;
    private sourceHistory = [];
    private targetHistory = [];
    private profile;
    private started = false;
    private initialized = false;
    private conversationOngoing = false;

    constructor(
        private maxStepCount,
        private ClientManager_DungeonMaster: InworldClientManager,
        private ClientManager_N2N_Source: InworldClientManager,
        private ClientManager_N2N_Target: InworldClientManager
        ) {}

    getRandomNumber(min, max) {
        return Math.floor(Math.random() * (max - min) + min);
    }

    shouldEnd() {
        const num = this.getRandomNumber(0, this.maxStepCount - this.stepCount);

        return (this.stepCount != 0 && num == 0) || this.shouldStop;
    }

    reset() {
        this.stepCount = 0;
        this.shouldStop = false;
        this.sourceHistory = [];
        this.targetHistory = [];
        this.started = false;
        this.conversationOngoing = false;
    }

    stop() {
        this.shouldStop = true;
    }

    running() {
        return this.started;
    }

    finalizeConversation(source, target) {
        console.log("Saving conversation history.");
        this.ClientManager_N2N_Source.SaveDialogueHistory(source, this.sourceHistory, this.profile);
        this.ClientManager_N2N_Target.SaveDialogueHistory(target, this.targetHistory, this.profile);
        setTimeout(2000, () => {
            this.reset();
        });
    }

    async Manage_N2N_Dialogue(source, target, playerName, location, currentDateTime) {
        await setTimeout(1000);
        
        this.profile = playerName;

        this.ClientManager_DungeonMaster.SendNarratedAction("Please keep your answers short if possible.");
        this.ClientManager_N2N_Source.SendNarratedAction("You are at " + location + ". It's " + currentDateTime + ". Please keep your answers short if possible.");
        this.ClientManager_N2N_Target.SendNarratedAction("You are at " + location + ". It's " + currentDateTime + ". Please keep your answers short if possible.");

        this.ClientManager_DungeonMaster.Say("As you walk around in " + location + ", you see " + target + ". What do you to say to him/her? Please answer as if you are talking to him/her.");
    
        this.sourceHistory.push({
            talker: DialogParticipant.UNKNOWN,
            phrase: 'In ' + location + ', on ' + currentDateTime + ', you started to talk with ' + target + '. '
        });
        this.targetHistory.push({
            talker: DialogParticipant.UNKNOWN,
            phrase: 'In ' + location + ', on ' + currentDateTime + ', ' + source + ' approached you and you started to talk.'
        });
        if(!this.initialized) {
            this.Init(source, target);
            this.initialized = true;
        }
        this.conversationOngoing = true;
    }

    async Init(source, target) {

        EventBus.GetSingleton().on('GM_SOURCE_RESPONSE', (message) => {
            let shouldEnd = this.shouldEnd();
            if(!this.started && shouldEnd) {
                this.stop();
                return;
            }

            if(shouldEnd) {
                this.ClientManager_N2N_Source.SendNarratedAction("You don't need to answer now.");
            }

            this.ClientManager_N2N_Source.Say(message, shouldEnd);
            this.ClientManager_DungeonMaster.SendNarratedAction('You said "' + message + '" to ' + target + '.');

            this.sourceHistory.push({
                talker: DialogParticipant.CHARACTER,
                phrase: source + ': ' + message
            });
            this.targetHistory.push({
                talker: DialogParticipant.CHARACTER,
                phrase: source + ': ' + message
            });

            if(shouldEnd) {
                this.finalizeConversation(source, target);
                this.ClientManager_DungeonMaster.SendEndSignal();
            }

            this.started = true;
            this.stepCount++;
        });

        EventBus.GetSingleton().on('SOURCE_TARGET_RESPONSE', (message) => {
            let shouldEnd = this.shouldEnd();
            if(shouldEnd) {
                this.ClientManager_N2N_Target.SendNarratedAction("You don't need to answer now.");
                this.stop();
            }
            this.ClientManager_N2N_Target.Say(message, shouldEnd);
            this.ClientManager_DungeonMaster.SendNarratedAction(target + ' said "' + message + '" to you.');
            if(shouldEnd) {
                this.ClientManager_DungeonMaster.Say("You are about to end the dialogue with " + target + ". What do you to say to him/her?");
            }

            this.sourceHistory.push({
                talker: DialogParticipant.CHARACTER,
                phrase: target + ': ' + message
            });
            this.targetHistory.push({
                talker: DialogParticipant.CHARACTER,
                phrase: target + ': ' + message
            });

            this.stepCount++;
        });

        EventBus.GetSingleton().on('TARGET_SOURCE_RESPONSE', (message) => {
            let shouldEnd = this.shouldEnd();
            if(shouldEnd) {
                this.ClientManager_N2N_Source.SendNarratedAction("You don't need to answer now.");
                this.stop();
            }
            this.ClientManager_N2N_Source.Say(message, shouldEnd);
            this.ClientManager_DungeonMaster.SendNarratedAction('You said "' + message + '" to ' + target + '.');
            if(shouldEnd) {
                this.ClientManager_DungeonMaster.Say("You are about to end the dialogue with " + target + ". What do you to say to him/her?");
            }

            this.sourceHistory.push({
                talker: DialogParticipant.CHARACTER,
                phrase: source + ': ' + message
            });
            this.targetHistory.push({
                talker: DialogParticipant.CHARACTER,
                phrase: source + ': ' + message
            });

            this.stepCount++;
        });
    }

    IsConversationOngoing() {
        return this.conversationOngoing;
    }
}