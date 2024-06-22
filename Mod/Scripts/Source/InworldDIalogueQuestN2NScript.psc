Scriptname InworldDialogueQuestN2NScript extends Quest  

formlist property DefaultNPCVoiceTypes auto
globalvariable property N2N_ConversationOnGoing auto

int initiateTimeInterval = 180
int initiateSamePairTimeInterval = 300
int lastInitiateTime = 0

Actor previousSource
Actor previousTarget

function OnInit()
    CheckN2NDialogue()
endFunction

function CheckN2NDialogue()
    
    While true
        int _time = Utility.GetCurrentRealTime() as int
        _time = _time % 1000

        If N2N_ConversationOnGoing.GetValueInt() == 0
            Actor sourceActor = game.FindRandomActorFromRef(Game.GetPlayer(), 700)
            If sourceActor != None && sourceActor != Game.GetPlayer() && IsAvailableForDialogue(sourceActor)
                ; Debug.Trace("Inworld: Source Actor = " + sourceActor.GetDisplayName())
                Actor targetActor = game.FindRandomActorFromRef(sourceActor, 210)

                If targetActor != None && targetActor != sourceActor && targetActor != Game.GetPlayer() && IsAvailableForDialogue(targetActor)
                    ; Debug.Trace("Inworld: Target Actor = " + sourceActor.GetDisplayName())

                    bool notSameCondition = !IsSameActors(sourceActor, targetActor) && _time - lastInitiateTime > initiateTimeInterval
                    bool sameCondition = IsSameActors(sourceActor, targetActor) && _time - lastInitiateTime > initiateSamePairTimeInterval
                    If N2N_ConversationOnGoing.GetValueInt() == 0 && (isFirst() || notSameCondition || sameCondition)
                        
                        Debug.Trace("Inworld: Sending InitiateConversation Signal For " + sourceActor.GetDisplayName() + " and " + targetActor.GetDisplayName())
                        InworldSKSE.N2N_Initiate(sourceActor, targetActor)
                        lastInitiateTime = _time
                        SetPreviousActors(sourceActor, targetActor)
                    EndIf
                EndIf
            EndIf
        EndIf
    EndWhile
endFunction

bool function IsFirst()
    return previousSource == None || previousTarget == None
endFunction

function SetPreviousActors(Actor source, Actor target)
    previousSource = source
    previousTarget = target
endFunction

bool function IsSameActors(Actor source, Actor target)
    return (source == previousSource && target == previousTarget) || (source == previousTarget || target == previousSource)
endFunction 

bool function IsAvailableForDialogue(Actor _actor)
    return DefaultNPCVoiceTypes.HasForm(_actor.GetVoiceType())    
endFunction
