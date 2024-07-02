scriptname InworldSKSE hidden

bool function Start(Actor target, string gameTime) global native
bool function Stop() global native
bool function N2N_Initiate(Actor source, Actor target) global native
bool function N2N_Start(string gameTime) global native
bool function N2N_Stop() global native
bool function LogEvent(Actor actor, string log) global native
bool function WatchSubtitles() global native
bool function ClearActors() global native
bool function SendActor(Actor actor) global native
bool function SendResponseLog(Actor actor, string message) global native