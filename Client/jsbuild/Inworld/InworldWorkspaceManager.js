import axios from "axios";
import InworldLoginSystem from "./InworldLoginSystem.js";
import path from "path";
import * as fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
const ALL_CHARACTERS = JSON.parse(fs.readFileSync(path.resolve("./World/SkyrimCharacters.json"), 'utf-8'));
const GENERIC_CHARACTERS = JSON.parse(fs.readFileSync(path.resolve("./World/SkyrimGenericCharacters.json"), 'utf-8'));
const SKYRIM_KNOWLEDGE = JSON.parse(fs.readFileSync(path.resolve("./World/SkyrimKnowledge.json"), 'utf-8'));
// https://studio.inworld.ai/studio/v1/workspaces/{WORKSPACE}/common-knowledge?pageSize=20
const WORKSPACE_NAME = process.env.INWORLD_WORKSPACE;
const SHARED_KNOWLEDGE_URL = "https://studio.inworld.ai/studio/v1/workspaces/" + WORKSPACE_NAME + "/common-knowledge?pageSize=500";
const CREATE_URI = "https://studio.inworld.ai/studio/v1/workspaces/" + WORKSPACE_NAME + "/characters?skipAutoCreate=true";
const GET_CHARACTERS = "https://studio.inworld.ai/studio/v1/workspaces/" + WORKSPACE_NAME + "/characters?pageSize=100";
const DEPLOY_CHARACTERS = "https://studio.inworld.ai/studio/v1/=CHARACTER_ID=:deploy";
const SCENE_URI = "https://studio.inworld.ai/studio/v1/workspaces/" + WORKSPACE_NAME + "/scenes";
export default class InworldWorkspaceManager {
    loginManager;
    characterList;
    SharedKnowledge;
    waitingCharacters;
    constructor(setup) {
        this.loginManager = new InworldLoginSystem();
        if (setup)
            this.SetupWorkplace();
    }
    async SetupWorkplace() {
        await this.SetupCommonKnowledge();
        await this.PopulateCharacters();
        await this.UpdateDatabase();
    }
    async UpdateDatabase() {
        let createdCharacters = await this.CreateMissingCharacters();
        await this.DeployCharacters(createdCharacters);
    }
    async UpdateScene(type, ids, append = false) {
        let headers = await this.GetHeader();
        let response = await axios.get(SCENE_URI, { headers: headers });
        let scenes = response.data.scenes;
        if (scenes.length == 0) {
            console.error("No scenes found in database.");
            return;
        }
        let sceneId = "";
        if (type == 0) {
            sceneId = "workspaces/" + WORKSPACE_NAME + "/scenes/genericscene";
        }
        else if (type == 1) {
            sceneId = "workspaces/" + WORKSPACE_NAME + "/scenes/genericscene_n2n_0";
        }
        else if (type == 2) {
            sceneId = "workspaces/" + WORKSPACE_NAME + "/scenes/genericscene_n2n_1";
        }
        else if (type == 3) {
            sceneId = "workspaces/" + WORKSPACE_NAME + "/scenes/genericscene_n2n_2";
        }
        else {
            throw "Unknown Scene Type!";
        }
        let scene = scenes.find((s) => s.name === sceneId);
        if (!scene) {
            throw "Scene doesn't exist on database.";
        }
        let characters = [];
        if (append) {
            characters = scene.characters;
        }
        for (let i in ids) {
            let c = this.characterList.find((c) => c.name === "workspaces/" + WORKSPACE_NAME + "/characters/" + ids[i]);
            if (!c) {
                throw "Character is not in database: " + ids[i];
            }
            characters.push({ "character": c.name, "displayTitle": c.defaultCharacterDescription.givenName, "imageUri": "", "additionalAgentInfo": "" });
        }
        scene.characters = characters;
        await axios.patch("https://studio.inworld.ai/studio/v1/" + sceneId, JSON.stringify(scene), { headers: headers });
        await axios.post("https://studio.inworld.ai/studio/v1/" + sceneId + ":deploy", null, { headers: headers });
        return sceneId;
    }
    GetNameFromPath(path) {
        let arr = path.split("/");
        return arr[arr.length - 1];
    }
    async CreateMissingCharacters() {
        let createdCharacters = [];
        this.waitingCharacters = [];
        let expectedList = ALL_CHARACTERS.characters;
        for (let i = 0; i < expectedList.length; i++) {
            let data = expectedList[i];
            let isExist = false;
            for (let k = 0; k < this.characterList.length; k++) {
                let charData = this.characterList[k];
                let charName = this.GetNameFromPath(charData.name);
                let expectedName = this.GetNameFromPath(data.name); // data.name.replace("{WORKSPACE}", WORKSPACE_NAME);
                if (expectedName.toLowerCase() == charName.toLowerCase()) {
                    isExist = true;
                }
                if (isExist)
                    break;
            }
            if (!isExist) {
                console.log(`${data.defaultCharacterDescription.givenName} does not exist. I'm requesting to create it.`);
                console.logToLog(`${data.defaultCharacterDescription.givenName} does not exist. I'm requesting to create it.`);
                this.waitingCharacters.push(data.name);
                createdCharacters.push(data.name.replace("{WORKSPACE}", WORKSPACE_NAME));
                await this.CreateCharacter(data.name, data);
            }
            else {
                // console.log(`${
                //     data.defaultCharacterDescription.givenName
                // } exists, not updating.`);
                // (console as any).logToLog(`${data.defaultCharacterDescription.givenName} exists, not updating.`)
            }
        }
        return createdCharacters;
    }
    removeItem(arr, value) {
        const index = arr.indexOf(value);
        if (index > -1) {
            arr.splice(index, 1);
        }
        return arr;
    }
    async CreateCharacter(name, data) {
        await this.CreateNewCharacter(data);
        this.waitingCharacters = this.removeItem(this.waitingCharacters, name);
        console.log(`${data.defaultCharacterDescription.givenName} is now ready to use.`);
        console.logToLog(`${data.defaultCharacterDescription.givenName} is now ready to use.`);
        if (this.waitingCharacters.length <= 0) {
            // refresh
            console.log(`all created. refreshing all character data`);
            await this.PopulateCharacters();
        }
    }
    async PopulateCharacters() {
        let headers = await this.GetHeader();
        let response = await axios.get(GET_CHARACTERS, { headers: headers });
        this.characterList = response.data.characters;
        console.log(this.characterList.length + " characters loaded.");
    }
    async DeployCharacters(createdCharacters) {
        if (createdCharacters.length == 0) {
            return;
        }
        console.log("Deploying " + createdCharacters.length + " characters.");
        for (let i in createdCharacters) {
            let percentage = (i * 100 / createdCharacters.length);
            if (percentage % 5 == 0) {
                console.log('%' + percentage + ' completed.');
            }
            let headers = await this.GetHeader();
            let payload = JSON.stringify({ name: createdCharacters[i] });
            let response = axios.post(DEPLOY_CHARACTERS.replace('=CHARACTER_ID=', createdCharacters[i]), payload, { headers: headers });
        }
        console.log("DONE");
    }
    internalDelay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    async CreateNewCharacter(characterData) {
        try {
            let headers = await this.GetHeader();
            delete characterData.safetyConfig;
            this.SharedKnowledge.commonKnowledge.forEach(knowledge => {
                characterData.commonKnowledge.push(knowledge.name);
            });
            if (characterData.facts.length > 0 && characterData.facts[0].text.length > 0) {
                let factArr = [];
                characterData.facts[0].text.forEach(t => factArr.push({ text: t }));
                let personalKnowledge = { uuid: characterData.facts[0].uuid, facts: factArr };
                delete characterData.facts;
                characterData.personalKnowledge = personalKnowledge;
            }
            else {
                delete characterData.facts;
            }
            characterData.name = characterData.name.replace("{WORKSPACE}", WORKSPACE_NAME);
            let response = await axios.post(CREATE_URI, JSON.stringify(characterData), { headers: headers });
            let checkUri = "https://studio.inworld.ai/studio/v1/" + response.data.name;
            let isDone = false;
            let nameFetched = "";
            while (!isDone) {
                headers = await this.GetHeader();
                let checkData = await axios.get(checkUri, { headers: headers });
                isDone = !!checkData.data.defaultCharacterDescription;
                if (isDone && !!checkData.data.name) {
                    nameFetched = checkData.data.name;
                    await this.internalDelay(500);
                }
                else {
                    isDone = false;
                    console.log("Currently we have: ", checkData);
                    await this.internalDelay(1000);
                }
            }
        }
        catch (e) {
            console.error(e);
        }
    }
    // "workspaces/{WORKSPACE}/common-knowledges/823bf2a7-83e6-489d-b81f-5abfb8dc3165"
    async UpdateDialogueHistory(name, history) {
        try {
            let character = null;
            for (let i = 0; i < this.characterList.length; i++) {
                let c = this.characterList[i];
                if (c.name == 'workspaces/skyrim-gfy8a/characters/' + name)
                    character = c;
            }
            if (!character) {
                return;
            }
            if (!character.personalKnowledge) {
                character.personalKnowledge = { uuid: uuidv4(), facts: [] };
            }
            let factArr = [];
            history.forEach(t => character.personalKnowledge.facts.push({ text: t }));
            const headers = await this.GetHeader();
            const payload = { name: character.name, personalKnowledge: character.personalKnowledge };
            await axios.patch("https://studio.inworld.ai/studio/v1/workspaces/" + WORKSPACE_NAME + '/characters/' + name, JSON.stringify(payload), { headers: headers });
        }
        catch (e) {
            console.error(e);
        }
    }
    async SetupCommonKnowledge() {
        let commonknowledgeList = await this.GetAllCurrentCommonKnowledges();
        let expectedList = SKYRIM_KNOWLEDGE.list;
        for (let i = 0; i < expectedList.length; i++) {
            let singleKnowledge = expectedList[i];
            let filtered = commonknowledgeList.commonKnowledge.filter(el => el.displayName == singleKnowledge.displayName);
            if (filtered.length == 0) {
                console.log("Creating a new common knowledge");
                console.logToLog("Creating a new common knowledge.");
                await this.CreateNewCommonKnowledge(singleKnowledge);
            }
        }
        this.SharedKnowledge = await this.GetAllCurrentCommonKnowledges();
        console.log("All common knowledge has been processed.");
        console.logToLog("All common knowledge has been processed.");
        return;
    }
    async CreateNewCommonKnowledge(commonKnowledge) {
        let normalizedUri = SHARED_KNOWLEDGE_URL.replace("?pageSize=500", "");
        let header = await this.GetHeader(true);
        await axios.post(normalizedUri, commonKnowledge, { headers: header });
    }
    async GetAllCurrentCommonKnowledges() {
        let header = await this.GetHeader(true);
        let response = await axios.get(SHARED_KNOWLEDGE_URL, { headers: header });
        return response.data;
    }
    GetCharacterIdentifier(name) {
        try {
            if (name.toLowerCase().includes("guard"))
                name = "guard";
            for (let i = 0; i < this.characterList.length; i++) {
                let character = this.characterList[i];
                let nameNormalized = character.name.toLowerCase().replaceAll("_", " ");
                if (nameNormalized.includes(name.toLowerCase()) || character.defaultCharacterDescription.givenName.toLowerCase().includes(name.toLowerCase())) {
                    let name = character.name;
                    let id = name.replace("workspaces/" + WORKSPACE_NAME + "/characters/", "");
                    return id;
                }
            }
        }
        catch {
        }
        return null;
    }
    GetGenericCharacter(name) {
        let character = null;
        for (let i in GENERIC_CHARACTERS.characters) {
            if (name.toLowerCase().replaceAll(" ", "_") == GENERIC_CHARACTERS.characters[i].name.replace("workspaces/{WORKSPACE}/characters/", "")) {
                character = GENERIC_CHARACTERS.characters[i];
                break;
            }
        }
        return character;
    }
    GetGenericCharacterId(name) {
        let character = this.GetGenericCharacter(name);
        if (!character)
            return;
        let genericCharacterId = null;
        if (character.defaultCharacterAssets.voice.gender == 'VOICE_GENDER_MALE') {
            genericCharacterId = "GenericMale" + character.genericIndex;
        }
        else if (character.defaultCharacterAssets.voice.gender == 'VOICE_GENDER_FEMALE') {
            genericCharacterId = "GenericFemale" + character.genericIndex;
        }
        else {
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
            names.push(character.defaultCharacterDescription.givenName);
        }
        return names;
    }
    async GetHeader(isKnowledge = false) {
        let token = await this.loginManager.GetTokenDirectly();
        let headerConfig = {
            'authorization': 'Bearer ' + token,
            'content-type': 'text/plain;charset=UTF-8',
            'origin': 'https://studio.inworld.ai',
            'referer': 'https://studio.inworld.ai/workspaces/' + WORKSPACE_NAME + (!isKnowledge ? '/characters' : '/knowledge'),
            'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Safari/537.36'
        };
        return headerConfig;
    }
}
//# sourceMappingURL=InworldWorkspaceManager.js.map