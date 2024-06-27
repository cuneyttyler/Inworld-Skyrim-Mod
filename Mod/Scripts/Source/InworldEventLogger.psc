Scriptname InworldEventLogger extends Quest

int MAX_ACTOR_COUNT = 20
int index = 0
int foundCount = 0
bool locationChanged = False
bool firstRun = True
actor[] actors

ReferenceAlias[] property ActorRefs auto
formlist property DefaultNPCVoiceTypes auto

Event OnInit()
    actors = new Actor[20]
    LogEvents()
EndEvent

Function LogEvents()
    Debug.Trace("Inworld: LogEvents")
    While True
        Debug.Trace("Inworld: Checking NPCs.")
        int numActors = FindAllNpcsInArea()
        Debug.Trace("Inworld: " + numActors + " actors found.")
        firstRun = False
    EndWhile
EndFunction

int Function FindAllNpcsInArea()
    Actor[] foundActors = new Actor[20]
    foundActors[0] = Game.GetPlayer()
    int i = 0
    int j = 1
    int k = 0
    While i < 20
        Actor _actor = FindNonPlayerActor()
        If _actor != None 
            If _actor != None && !IsInArray(_actor, foundActors) && j < MAX_ACTOR_COUNT
                foundActors[j] = _actor
                j += 1
            EndIf
        EndIf
        i += 1
    EndWhile

    i = 0
    While i < MAX_ACTOR_COUNT
        If foundActors[i] != None && !IsInArray(foundActors[i], actors) && !locationChanged && !firstRun
            k = 0
            While k < MAX_ACTOR_COUNT
                If actors[i] != None
                    InworldSKSE.LogEvent(actors[k], foundActors[i].GetDisplayName() + " has arrived to " + Game.GetPlayer().GetCurrentLocation().GetName())
                    k += 1
                EndIf
            EndWhile
        EndIf
        i += 1
    EndWhile

    i = 0
    While i < MAX_ACTOR_COUNT
        If actors[i] != None && !IsInArray(actors[i], foundActors)
            k = 0
            While k < MAX_ACTOR_COUNT
                InworldSKSE.LogEvent(actors[k], actors[i].GetDisplayName() + " has left " +  Game.GetPlayer().GetCurrentLocation().GetName())
                k += 1
            EndWhile
        EndIf
        i+=1
    EndWhile

    actors = foundActors
    AssignActorsToRefs()
    If locationChanged
        k = 0
        While k < MAX_ACTOR_COUNT
            InworldSKSE.LogEvent(actors[k], Game.GetPlayer().GetDisplayName() + " has arrived to " + Game.GetPlayer().GetCurrentLocation().GetName())
            k += 1
        EndWhile
        locationChanged = False
    EndIf
    Return j
EndFunction

Function AssignActorsToRefs()
    Debug.Trace("Inworld: Assigning refs.")
    int i = 0
    While i < MAX_ACTOR_COUNT
        If actors[i] != None
            Debug.Trace("Inworld: ForceRefTo: " + actors[i].GetDisplayName())
            ActorRefs[i].ForceRefTo(actors[i])
        EndIf
        i += 1
    EndWhile
EndFunction

Actor Function FindNonPlayerActor()
    int i = 0
    While i < 5
        Actor _actor = Game.FindRandomActorFromRef(Game.GetPlayer(), 1000)
        If _actor != Game.GetPlayer() && IsAvailableForDialogue(_actor)
            Return _actor
        EndIf
        i += 1
    EndWhile

    Return None
EndFunction

bool function IsAvailableForDialogue(Actor _actor)
    return DefaultNPCVoiceTypes.HasForm(_actor.GetVoiceType())    
endFunction

Function OnLocationChange()
    int k = 0
    While k < MAX_ACTOR_COUNT
        InworldSKSE.LogEvent(actors[k], Game.GetPlayer().GetDisplayName() + " has left " + Game.GetPlayer().GetCurrentLocation().GetName())
        k += 1
    EndWhile

    locationChanged = True
    actors = new Actor[20]
    index = 0
EndFunction

bool Function IsInArray(Actor _actor, Actor[] arr)
    If _actor == None
        Return False
    EndIf
    int i = 0
    While i < MAX_ACTOR_COUNT
        If arr[i] == _actor
            Return True
        EndIf
        i += 1
    EndWhile

    Return False
EndFunction