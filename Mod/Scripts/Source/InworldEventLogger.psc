Scriptname InworldEventLogger extends Quest

actor[] actors
int numFoundActors

ReferenceAlias[] property ActorRefs auto
formlist property _InworldVoiceTypes auto
formlist property _InworldVoiceTypes_Exclude auto

Event OnInit()
    numFoundActors = 0
    LogEvents()
EndEvent

Function LogEvents()
    While True
        FindAllNpcsInArea()
        AssignActorsToRefs()
        SendActors()
        Utility.Wait(1)
    EndWhile
EndFunction

Function FindAllNpcsInArea()
    actors = MiscUtil.ScanCellNPCs(Game.GetPlayer(), 2500)
    int i = 0
    While i < actors.Length
        If !IsAvailable(actors[i])
            actors = PapyrusUtil.RemoveActor(actors, actors[i])
        Else
            i += 1
        EndIf
    EndWhile
EndFunction

Function AssignActorsToRefs()
    int i = 0
    While i < actors.Length
        If actors[i] != None
            ActorRefs[i].ForceRefTo(actors[i])
        EndIf
        i += 1
    EndWhile
EndFunction

Function SendActors()
    InworldSKSE.ClearActors()
    int i = 0
    While i < actors.Length
        InworldSKSE.SendActor(actors[i])
        i += 1
    EndWhile
EndFunction

bool function IsAvailable(Actor _actor)
    return  ((_InworldVoiceTypes.GetAt(0) as FormList).HasForm(_actor.GetVoiceType()) || (_InworldVoiceTypes.GetAt(1) as FormList).HasForm(_actor.GetVoiceType())) && !_InworldVoiceTypes_Exclude.HasForm(_actor.GetVoiceType()) && _actor.IsEnabled() && !_actor.isDead() && !_actor.IsUnconscious()
endFunction

bool Function IsInArray(Actor _actor, Actor[] arr)
    If _actor == None
        Return False
    EndIf
    int i = 0
    While i < numFoundActors
        If arr[i] == _actor
            Return True
        EndIf
        i += 1
    EndWhile

    Return False
EndFunction