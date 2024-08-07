import axios from "axios";
import InworldLoginSystem from "./InworldLoginSystem.js";
import path from "path";
import * as fs from 'fs';
import { v4 as uuidv4} from 'uuid';

const ALL_CHARACTERS = JSON.parse(fs.readFileSync(path.resolve("./World/SkyrimCharacters.json"), 'utf-8'));
const GENERIC_CHARACTERS = JSON.parse(fs.readFileSync(path.resolve("./World/SkyrimGenericCharacters.json"), 'utf-8'));
const SKYRIM_KNOWLEDGE = JSON.parse(fs.readFileSync(path.resolve("./World/SkyrimKnowledge.json"), 'utf-8'));

// https://studio.inworld.ai/studio/v1/workspaces/{WORKSPACE}/common-knowledge?pageSize=20
const WORKSPACE_NAME = process.env.INWORLD_WORKSPACE;
const SHARED_KNOWLEDGE_URL: string = "https://studio.inworld.ai/studio/v1/workspaces/" + WORKSPACE_NAME + "/common-knowledge?pageSize=500"
const CREATE_URI = "https://studio.inworld.ai/studio/v1/workspaces/" + WORKSPACE_NAME + "/characters?skipAutoCreate=true";
const GET_CHARACTERS = "https://studio.inworld.ai/studio/v1/workspaces/" + WORKSPACE_NAME + "/characters?pageSize=100";
const DEPLOY_CHARACTERS = "https://studio.inworld.ai/studio/v1/=CHARACTER_ID=:deploy"
const SCENE_URI = "https://studio.inworld.ai/studio/v1/workspaces/" + WORKSPACE_NAME + "/scenes"

export default class InworldWorkspaceManager {
    private loginManager;
    private characterList;
    private SharedKnowledge;
    private waitingCharacters : Array <string>;

    constructor(setup) {
        this.loginManager = new InworldLoginSystem();
        if(setup) this.SetupWorkplace();
    }

    private async SetupWorkplace() {
        await this.SetupCommonKnowledge();
        await this.PopulateCharacters();
        await this.UpdateDatabase();
    }

    async UpdateDatabase() {
        let createdCharacters = await this.CreateMissingCharacters();
        await this.DeployCharacters(createdCharacters);
    }

    async UpdateScene(type: number, ids: string[], append: boolean = false) {
        let headers = await this.GetHeader();
        let response = await axios.get(SCENE_URI, {headers: headers})
        let scenes = response.data.scenes
        let name : string = ""
        let sceneId : string = ""
        if(type == 0) {
            name = "GenericScene"
            sceneId = "workspaces/" + WORKSPACE_NAME + "/scenes/genericscene"
        } else if(type == 1) {
            name = "GenericScene_N2N_0"
            sceneId = "workspaces/" + WORKSPACE_NAME + "/scenes/genericscene_n2n_0"
        } else if(type == 2) {
            name = "GenericScene_N2N_1"
            sceneId = "workspaces/" + WORKSPACE_NAME + "/scenes/genericscene_n2n_1"
        } else if(type == 3) {
            name = "GenericScene_N2N_2"
            sceneId = "workspaces/" + WORKSPACE_NAME + "/scenes/genericscene_n2n_2"
        } else {
            throw "Unknown Scene Type!"
        }
        let scene = scenes.find((s) => s.name === sceneId)

        
        if(!scene) {
            console.log("Scene doesn't exist on database. Creating...")
            let payload = {displayName: name, characters: [], description: name, commonKnowledge: []}
            response = await axios.post("https://api.inworld.ai/studio/v1/workspaces/" + WORKSPACE_NAME + "/scenes", JSON.stringify(payload), {headers: headers})
            scene = response.data
        }
        let characters = []
        if(append) {
            characters = scene.characters
        }
        for(let i in ids) {
            let c = this.characterList.find((c) => c.name === "workspaces/" + WORKSPACE_NAME + "/characters/" + ids[i])
            if(!c) {
                throw "Character is not in database: " + ids[i]
            }
            characters.push({"character": c.name, "displayTitle": c.defaultCharacterDescription.givenName, "imageUri": "", "additionalAgentInfo": ""})
        }
        scene.characters = characters
        await axios.patch("https://studio.inworld.ai/studio/v1/" + sceneId, JSON.stringify(scene), {headers: headers})
        await axios.post("https://studio.inworld.ai/studio/v1/" + sceneId + ":deploy", null, {headers: headers})
        return sceneId
    }

    private GetNameFromPath(path : string){
        let arr = path.split("/")
        return arr[arr.length-1]
    }

    private async CreateMissingCharacters() {
        let createdCharacters = [];
        this.waitingCharacters = [];
        let expectedList = (ALL_CHARACTERS as any).characters;
        for (let i = 0; i < expectedList.length; i++) {
            let data = expectedList[i];
            let isExist = false;
            for (let k = 0; k < this.characterList.length; k++) {
                let charData = this.characterList[k];
                let charName = this.GetNameFromPath(charData.name);
                let expectedName =  this.GetNameFromPath(data.name); // data.name.replace("{WORKSPACE}", WORKSPACE_NAME);
                if (expectedName.toLowerCase() == charName.toLowerCase()) {
                    isExist = true;
                }

                if (isExist) 
                    break;
            }

            if (!isExist) {
                console.log(`${data.defaultCharacterDescription.givenName} does not exist. I'm requesting to create it.`);
                (console as any).logToLog(`${data.defaultCharacterDescription.givenName} does not exist. I'm requesting to create it.`)
                this.waitingCharacters.push(data.name);
                createdCharacters.push(data.name.replace("{WORKSPACE}", WORKSPACE_NAME));
                await this.CreateCharacter(data.name, data);
            } else {
                // console.log(`${
                //     data.defaultCharacterDescription.givenName
                // } exists, not updating.`);
                // (console as any).logToLog(`${data.defaultCharacterDescription.givenName} exists, not updating.`)
            }
        }

        return createdCharacters;
    }

    private removeItem<T>(arr : Array < T >, value : T): Array < T > {
        const index = arr.indexOf(value);
        if (index > -1) {
            arr.splice(index, 1);
        }
        return arr;
    }

    private async CreateCharacter(name, data) {
        await this.CreateNewCharacter(data);
        this.waitingCharacters = this.removeItem(this.waitingCharacters, name);
        console.log(`${data.defaultCharacterDescription.givenName} is now ready to use.`);
        (console as any).logToLog(`${data.defaultCharacterDescription.givenName} is now ready to use.`)

        if(this.waitingCharacters.length <= 0){
            // refresh
            console.log(`all created. refreshing all character data`);
            await this.PopulateCharacters();
        }
    }

    private async PopulateCharacters() {
        let headers = await this.GetHeader();
        let response = await axios.get(GET_CHARACTERS, {headers: headers});
        this.characterList = response.data.characters;
        console.log(this.characterList.length + " characters loaded.")
    }

    private async DeployCharacters(createdCharacters) {
        if(createdCharacters.length == 0) {
            return
        }
        console.log("Deploying " + createdCharacters.length + " characters.")
        for(let i in createdCharacters) {
            let percentage = ((i as any) * 100 / createdCharacters.length);
            if(percentage % 5 == 0) {
                console.log('%' + percentage + ' completed.');   
            }
            let headers = await this.GetHeader();
            let payload = JSON.stringify({name: createdCharacters[i]});
            let response = axios.post(DEPLOY_CHARACTERS.replace('=CHARACTER_ID=', createdCharacters[i]), payload, {headers: headers});
        }
        console.log("DONE");
    }

    private internalDelay(ms : number): Promise < void > {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    private async CreateNewCharacter(characterData) {
        try {
            let headers = await this.GetHeader();
            delete characterData.safetyConfig;

            this.SharedKnowledge.commonKnowledge.forEach(knowledge => {
                characterData.commonKnowledge.push(knowledge.name)
            });

            if(characterData.facts.length > 0 && characterData.facts[0].text.length > 0) {
                let factArr = [];
                characterData.facts[0].text.forEach(t => factArr.push({ text: t }));
                let personalKnowledge = { uuid: characterData.facts[0].uuid, facts: factArr };
                delete characterData.facts;
                characterData.personalKnowledge = personalKnowledge;
            } else {
                delete characterData.facts;
            }

            characterData.name = characterData.name.replace("{WORKSPACE}", WORKSPACE_NAME);
            let response = await axios.post(CREATE_URI, JSON.stringify(characterData), {headers: headers});

            let checkUri = "https://studio.inworld.ai/studio/v1/" + response.data.name

            let isDone = false;
            let nameFetched = ""
            while (!isDone) {
                headers = await this.GetHeader();
                let checkData = await axios.get(checkUri, {headers: headers});
                isDone = !!checkData.data.defaultCharacterDescription;

                if (isDone && !!checkData.data.name) {
                    nameFetched = checkData.data.name;
                    await this.internalDelay(500);
                } else {
                    isDone = false;
                    console.log("Currently we have: ",checkData)
                    await this.internalDelay(1000);
                }
            }
        } catch (e) {
            console.error(e)
        }
    }

    // "workspaces/{WORKSPACE}/common-knowledges/823bf2a7-83e6-489d-b81f-5abfb8dc3165"

    async UpdateDialogueHistory(name: string, history) {
        try {
            let character = null;
            for (let i = 0; i < this.characterList.length; i++) {
                let c = this.characterList[i];
                if(c.name == 'workspaces/skyrim-gfy8a/characters/' + name)
                    character = c;
            }
            if(!character) {
                return;
            }

            if(!character.personalKnowledge) {
                character.personalKnowledge = {uuid: uuidv4(), facts: []};
            }

            let factArr = []
            history.forEach(t => character.personalKnowledge.facts.push({ text: t}))
            const headers = await this.GetHeader();
            const payload = {name: character.name, personalKnowledge: character.personalKnowledge};
            await axios.patch("https://studio.inworld.ai/studio/v1/workspaces/" + WORKSPACE_NAME + '/characters/' + name, JSON.stringify(payload), {headers: headers});
        } catch(e) {
            console.error(e)
        }
    }

    async SetupCommonKnowledge() {
        let commonknowledgeList = await this.GetAllCurrentCommonKnowledges();
        let expectedList = (SKYRIM_KNOWLEDGE as any).list;
        for (let i = 0; i < expectedList.length; i++) {
            let singleKnowledge = expectedList[i];
            let filtered = commonknowledgeList.commonKnowledge.filter(el => el.displayName == singleKnowledge.displayName);
            if (filtered.length == 0) {
                console.log("Creating a new common knowledge");
                (console as any).logToLog("Creating a new common knowledge.")
                await this.CreateNewCommonKnowledge(singleKnowledge);
            }
        }
        this.SharedKnowledge = await this.GetAllCurrentCommonKnowledges();
        console.log("All common knowledge has been processed.");
        (console as any).logToLog("All common knowledge has been processed.")
        return;
    }

    async ClearGenericKnowledge(id, type: number) {
        let name = type == 0 ? "Generic Knowledge 1" : type == 1 ? "Generic Knowledge 2" : "Generic Knowledge 3"
        let character = this.GetCharacter(id);
        let newKnowledge = []
        for(let i in character.commonKnowledge) {
            if(character.commonKnowledge[i].displayName != name) {
                newKnowledge.push(character.commonKnowledge[i])
            }
        }

        const headers = await this.GetHeader();
        const payload = {name: character.name, commonKnowledge: newKnowledge};
        await axios.patch("https://studio.inworld.ai/studio/v1/workspaces/" + WORKSPACE_NAME + '/characters/' + character.name, JSON.stringify(payload), {headers: headers});
    }

    async SetupGenericKnowledge(type: number, id: string, prompt: Array<string>) {
        let name = type == 0 ? "Generic Knowledge 1" : type == 1 ? "Generic Knowledge 2" : "Generic Knowledge 3"
        let knowledge = {displayName: name, description: "You are a character who lives in Skyrim.", memoryRecords: prompt}
        knowledge = await this.CreateNewCommonKnowledge(knowledge)
        let character = this.GetCharacter(id);
        character.commonKnowledge.push(knowledge);

        const headers = await this.GetHeader();
        const payload = {name: character.name, commonKnowledge: character.commonKnowledge};
        await axios.patch("https://studio.inworld.ai/studio/v1/workspaces/" + WORKSPACE_NAME + '/characters/' + character.name, JSON.stringify(payload), {headers: headers});
    }

    async CreateNewCommonKnowledge(commonKnowledge) {
        let normalizedUri = SHARED_KNOWLEDGE_URL.replace("?pageSize=500", "");
        let header = await this.GetHeader(true);
        let response = await axios.post(normalizedUri, commonKnowledge, {headers: header});
        return response.data
    }

    async GetAllCurrentCommonKnowledges() {
        let header = await this.GetHeader(true);
        let response = await axios.get(SHARED_KNOWLEDGE_URL, {headers: header});
        return response.data;
    }

    GetCharacter(name: string) {
        try {
            if (name.toLowerCase().includes("guard")) 
                name = "guard";
            for (let i = 0; i < this.characterList.length; i++) {
                let character = this.characterList[i];
                let nameNormalized = character.name.toLowerCase().replaceAll("_", " ");
                if (nameNormalized.includes(name.replaceAll("'","").toLowerCase()) || character.defaultCharacterDescription.givenName.toLowerCase().includes(name.replaceAll("'","").toLowerCase())) {
                    let name = character.name;
                    let id = name.replace("workspaces/" + WORKSPACE_NAME + "/characters/", "")
                    return character;
                }
            }
        } catch {
            
        }
        return null;
    }

    GetCharacterIdentifier(name: string) {
        try {
            if (name.toLowerCase().includes("guard")) 
                name = "guard";
            for (let i = 0; i < this.characterList.length; i++) {
                let character = this.characterList[i];
                let nameNormalized = character.name.toLowerCase().replaceAll("_", " ");
                if (nameNormalized.includes(name.replaceAll("'","").toLowerCase()) || character.defaultCharacterDescription.givenName.toLowerCase().includes(name.replaceAll("'","").toLowerCase())) {
                    let name = character.name;
                    let id = name.replace("workspaces/" + WORKSPACE_NAME + "/characters/", "")
                    return id;
                }
            }
        } catch {
            
        }
        return null;
    }

    PreparePrompt(character) {
        if(character.facts.length > 0) {
            for(let i in character.facts[0].text) {
                character.facts[0].text[i] = character.facts[0].text[i].replace("{Character}", character.defaultCharacterDescription.givenName);
            }
        }

        let prompt = "PLEASE ACT AS CHARACTER DESCRIBED BELOW:"
            + "You are " + character.defaultCharacterDescription.givenName + ".\n" 
            + "You are " + character.defaultCharacterDescription.characterRole + "\n"
            + character.defaultCharacterDescription.description + "\n"
            + character.defaultCharacterDescription.motivation + "\n"
            + character.defaultCharacterDescription.flaws + "\n"
            + "This is how you talk: \"" + character.defaultCharacterDescription.exampleDialog + "\"" + "\n"
            + "You are " + character.defaultCharacterDescription.personalityAdjectives.join(', ') + "\n"
            + "You are at " + character.defaultCharacterDescription.lifeStage + " of your life." + "\n"
            + "These are your hobbies " + character.defaultCharacterDescription.hobbyOrInterests.join(', ') + "\n"
            + "These are some additional facts about you: " + character.facts.join(", ") + "\n"
            + "These values describe your mood(ranged between -100 and 100): {" + "\n"
            + "Joy: " + character.initialMood.joy + "\n"
            + "Fear: " + character.initialMood.fear + "\n"
            + "Trust: " + character.initialMood.trust + "\n"
            + "Surprise: " + character.initialMood.surprise + "\n"
            + "\n" + "\n"
            + "These values describe your personality(ranged between -100 and 100): {"  + "\n"
            + "Positive: " + character.personality.positive + "\n"
            + "Peaceful: " + character.personality.peaceful + "\n"
            + "Open: " + character.personality.open + "\n"
            + "Extravert: " + character.personality.extravert + "\n"
            + "}"

        return prompt;
    }

    GetGenericCharacter(name) {
        let character = null;
        for(let i in (GENERIC_CHARACTERS as any).characters) {
            if(name.toLowerCase().replaceAll(" ", "_") == (GENERIC_CHARACTERS as any).characters[i].name.replace("workspaces/{WORKSPACE}/characters/", "")) {
                character = (GENERIC_CHARACTERS as any).characters[i];
                break
            }
        }
        return character;
    }

    GetGenericCharacterId(name) {
        let character = this.GetGenericCharacter(name);
        if(!character) return;

        let genericCharacterId = null
        if(character.defaultCharacterAssets.voice.gender == 'VOICE_GENDER_MALE') {
            genericCharacterId = "GenericMale" + character.genericIndex;
        } else if(character.defaultCharacterAssets.voice.gender == 'VOICE_GENDER_FEMALE') {
            genericCharacterId = "GenericFemale" + character.genericIndex;
        } else {
            console.error("Character gender could not be found.");
            return;
        }
        return genericCharacterId;
    }

    GetCharacterList() {
        return this.characterList;
    }

    GetAllCharacterName() {
        let names = [];
        for (let i = 0; i < this.characterList.length; i++) {
            let character = this.characterList[i];
            names.push(character.defaultCharacterDescription.givenName as never);
        }
        return names;
    }

    private async GetHeader(isKnowledge : boolean = false) {
        let token = await this.loginManager.GetTokenDirectly();
        let headerConfig = {
            'authorization': 'Bearer ' + token,
            'content-type': 'text/plain;charset=UTF-8',
            'origin': 'https://studio.inworld.ai',
            'referer': 'https://studio.inworld.ai/workspaces/' + WORKSPACE_NAME + (!isKnowledge ? '/characters' : '/knowledge'),
            'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Safari/537.36'
        }
        return headerConfig;
    }
}
