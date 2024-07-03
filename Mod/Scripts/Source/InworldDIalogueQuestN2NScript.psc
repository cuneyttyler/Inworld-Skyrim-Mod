Scriptname InworldDialogueQuestN2NScript extends Quest  

formlist property _InworldVoiceTypes auto
formlist property _InworldVoiceTypes_Exclude auto
globalvariable property N2N_ConversationOnGoing auto
GlobalVariable property N2N_LastSuccessfulStart auto
ReferenceAlias property normalTarget auto

int lastTryTime = 0
int retryInterval = 10
int initiateTimeInterval = 180
int initiateSamePairTimeInterval = 300

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
                Actor targetActor = game.FindRandomActorFromRef(sourceActor, 280)

                If targetActor != None && targetActor != sourceActor && targetActor != Game.GetPlayer() && IsAvailableForDialogue(targetActor)
                    ; Debug.Trace("Inworld: Target Actor = " + sourceActor.GetDisplayName())

                    
                    If N2N_ConversationOnGoing.GetValueInt() == 0 && _time - lastTryTime > retryInterval && (isFirst() || _time - N2N_LastSuccessfulStart.GetValueInt() > initiateTimeInterval) && Utility.RandomInt(0,2) == 0
                        
                        Debug.Trace("Inworld: Sending InitiateConversation Signal For " + sourceActor.GetDisplayName() + " and " + targetActor.GetDisplayName())
                        lastTryTime = _time
                        InworldSKSE.N2N_Initiate(sourceActor, targetActor)
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
    return  ((_InworldVoiceTypes.GetAt(0) as FormList).HasForm(_actor.GetVoiceType()) || (_InworldVoiceTypes.GetAt(1) as FormList).HasForm(_actor.GetVoiceType())) &&  !_InworldVoiceTypes_Exclude.HasForm(_actor.GetVoiceType()) && _actor.GetCombatState() == 0 && normalTarget.GetActorRef() != _actor && _actor.GetCurrentScene() == None && _actor.IsEnabled() && !_actor.IsAlerted() && !_actor.IsAlarmed()  && !_actor.IsBleedingOut() && !_actor.isDead() && !_actor.IsUnconscious()
endFunction

