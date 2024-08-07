Scriptname InworldDialogueQuestScript extends Quest  

topic property target_topic auto
topic property source_n2n_topic auto
topic property target_n2n_topic auto
referencealias property target auto
referencealias property source_n2n auto
referencealias property target_n2n auto
package property InworldTravelToNpcLocationPackage auto
package property InworldStandPackage auto
package property InworldN2NStandPackage auto
formlist property _InworldVoiceTypes auto
formlist property _InworldVoiceTypes_Exclude auto
GlobalVariable property ConversationOnGoing auto
GlobalVariable property N2N_ConversationOnGoing auto
GlobalVariable property N2N_LastSuccessfulStart auto
faction property CurrentFollowerFaction auto
faction property PotentialFollowerFaction auto
quest property DialogueFollower auto
; quest property InworldDialogueQuest auto

function OnInit()
    self.RegisterForModEvent("BLC_Start", "_Start")
    self.RegisterForModEvent("BLC_Stop", "_Stop")
	self.RegisterForModEvent("BLC_Speak", "Speak")
    self.RegisterForModEvent("BLC_Follow_Request_Accepted", "AddToFollowers")
    self.RegisterForModEvent("BLC_Start_N2N", "Start_N2N")
    self.RegisterForModEvent("BLC_Start_N2N_Source", "Start_N2N_Source")
    self.RegisterForModEvent("BLC_Start_N2N_Target", "Start_N2N_Target")
    self.RegisterForModEvent("BLC_Stop_N2N", "Stop_N2N")
    self.RegisterForModEvent("BLC_Speak_N2N", "Speak_N2N")
    self.RegisterForModEvent("BLC_TravelToNPCLocation", "TravelToNPCLocation")
    self.RegisterForModEvent("BLC_SetHoldPosition", "SetHoldPosition")
    self.RegisterForModEvent("BLC_SendResponseLog", "SendResponseLog")
endFunction

function SetHoldPosition(String eventName, String strArg, Float numArg, Form sender)
    if numArg as Int == 0
        (sender as Actor).SetLookAt(Game.GetPlayer())
    endIf
endFunction

function Reset()
    Reset_Normal()
    Reset_N2N()
endFunction

function Reset_Normal()
    Debug.Trace("Inworld: Reset.")
    target.Clear()
    ConversationOnGoing.SetValueInt(0)
    InworldSKSE.Stop()
endFunction

function Reset_N2N()
    Debug.Trace("Inworld: Reset_N2N.")
    source_n2n.Clear()
    target_n2n.Clear()
    N2N_ConversationOnGoing.SetValueInt(0)
    InworldSKSE.N2N_Stop()
endFunction

function TravelToNPCLocation(String eventName, String strArg, Float numArg, Form sender)
    ActorUtil.AddPackageOverride(source_n2n.GetActorRef(), InworldTravelToNpcLocationPackage, 0)
    source_n2n.GetActorRef().EvaluatePackage()
endFunction

function _Start(String eventName, String strArg, Float numArg, Form sender) 
    If (sender as Actor) == None
        debug.Trace("Inworld: Actor is currently engaged in converation with another NPC.")
        return;
    EndIf
    If (sender as Actor) == source_n2n.GetActorRef() || (sender as Actor) == target_n2n.GetActorRef()
        debug.Notification("NPC is busy.")
        return;
    EndIf
    If !IsAvailableForDialogue(sender as Actor)
        Debug.Notification("NPC is not available for dialogue.")
        return
    EndIf
    debug.Trace("Inworld: Start Dialogue")
    ConversationOnGoing.SetValueInt(1)
    target.ForceRefTo(sender as Actor)
    SetHoldPosition("", "", 0, sender)
    InworldSKSE.Start(sender as Actor, Utility.GameTimeToString(Utility.GetCurrentGameTime()))
endFunction

function _Stop(String eventName, String strArg, Float numArg, Form sender) 
    debug.Trace("Inworld: Stop Dialogue")
    ConversationOnGoing.SetValueInt(0)
    target.Clear()
endFunction

function Speak(String eventName, String strArg, Float numArg, Form sender) 
    If sender == None
        debug.Trace("Inworld: Speak request == Actor NULL, returning.")
        Return
    EndIf
    debug.Trace("Inworld: Speak request for " + (sender as Actor).GetDisplayName())
    target.GetActorRef().Say(target_topic)
    debug.Trace("Inworld: " + target.GetActorRef().GetDisplayName() + " speaked.")
endFunction

function Start_N2N(String eventName, String strArg, Float numArg, Form sender)
    Debug.Trace("Inworld: Starting N2N Dialogue.")
    N2N_ConversationOnGoing.SetValue(1)
    N2N_LastSuccessfulStart.SetValueInt((Utility.GetCurrentRealTime() as int) % 1000)
endFunction

function Start_N2N_Source(String eventName, String strArg, Float numArg, Form sender)
    source_n2n.ForceRefTo(sender as Actor)
endFunction

function Start_N2N_Target(String eventName, String strArg, Float numArg, Form sender)
    target_n2n.ForceRefTo(sender as Actor)
    If source_n2n.GetActorRef() != None && target_n2n.GetActorRef() != None
        source_n2n.GetActorRef().SetLookAt(target_n2n.GetActorRef())
        target_n2n.GetActorRef().SetLookAt(source_n2n.GetActorRef())
    EndIf
    ; (InworldDialogueQuest as InworldDIalogueQuestN2NScript).SetPreviousActors(source_n2n.GetActorRef(), target_n2n.GetActorRef())
endFunction

function Stop_N2N(String eventName, String strArg, Float numArg, Form sender)
    Debug.Trace("Inworld: Stopping N2N Dialogue.")
    Utility.Wait(3) ; Wait for last line to be spoken
    N2N_ConversationOnGoing.SetValue(0)
    source_n2n.Clear()
    target_n2n.Clear()
endFunction

function Speak_N2N(String eventName, String strArg, Float numArg, Form sender) 
    debug.Trace("Inworld: Speak request for " + numArg + " -> " + (sender as Actor).GetDisplayName())
    If numArg == 0 && N2N_ConversationOnGoing.GetValueInt() == 1
        source_n2n.GetActorRef().Say(source_n2n_topic)
    ElseIf N2N_ConversationOnGoing.GetValueInt() == 1
        target_n2n.GetActorRef().Say(target_n2n_topic)
    EndIf
endFunction

function SendResponseLog(String eventName, String strArg, Float numArg, Form sender)
    InworldSKSE.SendResponseLog(sender as Actor, strArg)
endfunction

function AddToFollowers(String eventName, String strArg, Float numArg, Form sender)
    Actor _actor = sender as Actor

    _actor.AddtoFaction(CurrentFollowerFaction)
    _actor.AddToFaction(PotentialFollowerFaction)
    (DialogueFollower as DialogueFollowerScript).SetFollower(_actor)
    (DialogueFollower as DialogueFollowerScript).FollowerFollow()

    Debug.Notification(_actor.GetDisplayName() + " is now following you.")
endFunction

bool function IsVoiceIncluded(Actor _actor) 
    return _InworldVoiceTypes != None && _InworldVoiceTypes.GetAt(0) != None && _InworldVoiceTypes.GetAt(1) != None && ((_InworldVoiceTypes.GetAt(0) as FormList).HasForm(_actor.GetVoiceType()) || (_InworldVoiceTypes.GetAt(1) as FormList).HasForm(_actor.GetVoiceType())) &&  !_InworldVoiceTypes_Exclude.HasForm(_actor.GetVoiceType())
endFunction

bool function IsAvailableForDialogue(Actor _actor)
    return IsVoiceIncluded(_actor) && _actor.GetCombatState() == 0 && _actor.IsEnabled()&& !_actor.IsAlerted() && !_actor.IsAlarmed()  && !_actor.IsBleedingOut() && !_actor.isDead() && !_actor.IsUnconscious()
endFunction
