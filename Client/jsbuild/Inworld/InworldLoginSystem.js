import * as dotenv from 'dotenv';
try {
    dotenv.config();
}
catch (e) {
    console.error("Something is not right with your env config!", e);
}
import axios from 'axios';
const INWORLD_FIREBASE_ID = "AIzaSyAPVBLVid0xPwjuU4Gmn_6_GyqxBq-SwQs";
const LOGIN_URI = "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=" + INWORLD_FIREBASE_ID;
const GOOGLE_TOKEN_URI = "https://securetoken.googleapis.com/v1/token?key=" + INWORLD_FIREBASE_ID;
export default class InworldLoginSystem {
    refreshToken;
    accessToken;
    expiresIn;
    isDateInThePast(date) {
        const today = new Date();
        return date.getTime() < today.getTime();
    }
    async Login() {
        let loginData = {
            "returnSecureToken": true,
            "email": process.env.LOGIN_EMAIL,
            "password": process.env.LOGIN_PASSWORD
        };
        let loginResponse = await axios.post(LOGIN_URI, loginData);
        this.refreshToken = loginResponse.data.refreshToken;
    }
    async LoginGoogleApis() {
        if (this.refreshToken == "")
            await this.Login();
        let formData = new URLSearchParams();
        formData.append("grant_type", "refresh_token");
        formData.append("refresh_token", this.refreshToken);
        let tokenResponse = await axios.post(GOOGLE_TOKEN_URI, formData);
        this.accessToken = tokenResponse.data.access_token;
        let d = new Date();
        d.setTime(d.getTime() + (tokenResponse.data.expiresIn * 500));
        this.expiresIn = d;
        return this.accessToken;
    }
    async RefreshToken() {
        this.refreshToken = "";
        return await this.LoginGoogleApis();
    }
    async GetPortalToken() {
        if (this.accessToken == "" || this.expiresIn == null || this.isDateInThePast(this.expiresIn)) {
            console.log(`Token expired or doesnt exist. Access Token: ${this.accessToken}, Current Expiration Date: ${this.expiresIn}`);
            this.refreshToken = "";
            return await this.LoginGoogleApis();
        }
        else {
            return this.accessToken;
        }
    }
    async GetTokenDirectly(isForce = false) {
        let logintoken = isForce ? await this.RefreshToken() : await this.GetPortalToken();
        logintoken = logintoken.replace(/(\r\n|\n|\r)/gm, "");
        return logintoken;
    }
}
