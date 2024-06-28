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
GlobalVariable property ConversationOnGoing auto
GlobalVariable property N2N_ConversationOnGoing auto
GlobalVariable property N2N_LastSuccessfulStart auto
faction property CurrentFollowerFaction auto
faction property PotentialFollowerFaction auto
; quest property InworldDialogueQuest auto

function OnInit()
    
    self.RegisterForModEvent("BLC_Start", "_Start")
    self.RegisterForModEvent("BLC_Stop", "_Stop")
	self.RegisterForModEvent("BLC_Speak", "Speak")
    self.RegisterForModEvent("BLC_Follow_Request_Accepted", "Add_To_Followers")
    self.RegisterForModEvent("BLC_Start_N2N", "Start_N2N")
    self.RegisterForModEvent("BLC_Start_N2N_Source", "Start_N2N_Source")
    self.RegisterForModEvent("BLC_Start_N2N_Target", "Start_N2N_Target")
    self.RegisterForModEvent("BLC_Stop_N2N", "Stop_N2N")
    self.RegisterForModEvent("BLC_Speak_N2N", "Speak_N2N")
    self.RegisterForModEvent("BLC_TravelToNPCLocation", "TravelToNPCLocation")
    self.RegisterForModEvent("BLC_SetHoldPosition", "SetHoldPosition")
endFunction

function SetHoldPosition(String eventName, String strArg, Float numArg, Form sender)
    if numArg as Int == 0
		; Debug.Trace("Inworld: Adding stand still package to " + (sender as Actor).GetDisplayName() + "...")
		; ActorUtil.AddPackageOverride(sender as Actor, InworldStandPackage, 0)
        (sender as Actor).SetLookAt(Game.GetPlayer())
    endIf
	if numArg as Int == 1
		; Debug.Trace("Inworld: Removing stand still package from " + (sender as Actor).GetDisplayName() + "...")
		; ActorUtil.ClearPackageOverride(sender as Actor)
        (sender as Actor).SetLookAt(None)
    endIf
    ; if numArg as Int == 2
    ;     if source_n2n == None || target_n2n == None
    ;         return
    ;     endIf
    ;     Debug.Trace("Inworld: Adding stand still package to " + source_n2n.GetActorRef().GetDisplayName() + " and " + target_n2n.GetActorRef().GetDisplayName() + "...")
	; 	ActorUtil.AddPackageOverride(source_n2n.GetActorRef(), InworldN2NStandPackage, 0)
    ;     ActorUtil.AddPackageOverride(target_n2n.GetActorRef(), InworldN2NStandPackage, 0)
    ;     source_n2n.GetActorRef().SetLookAt(target_n2n.GetActorRef())
    ;     target_n2n.GetActorRef().SetLookAt(source_n2n.GetActorRef())
    ; endIf
    ; if numArg as Int == 3
    ;     if source_n2n == None || target_n2n == None
    ;         return
    ;     endIf
    ;     Debug.Trace("Inworld: Removing stand still package from " + source_n2n.GetActorRef().GetDisplayName() + " and " + target_n2n.GetActorRef().GetDisplayName() + "...")
	; 	ActorUtil.ClearPackageOverride(source_n2n.GetActorRef())
    ;     ActorUtil.ClearPackageOverride(target_n2n.GetActorRef())
    ;     source_n2n.GetActorRef().SetLookAt(None)
    ;     target_n2n.GetActorRef().SetLookAt(None)
	; endIf
endFunction

function Reset()
    Debug.Trace("Inworld: Reset.")
    target.Clear()
    source_n2n.Clear()
    target_n2n.Clear()
    N2N_ConversationOnGoing.SetValueInt(0)
endFunction

function TravelToNPCLocation(String eventName, String strArg, Float numArg, Form sender)
    ActorUtil.AddPackageOverride(source_n2n.GetActorRef(), InworldTravelToNpcLocationPackage, 0)
    source_n2n.GetActorRef().EvaluatePackage()
endFunction

function _Start(String eventName, String strArg, Float numArg, Form sender) 
    If (sender as Actor) == None || (sender as Actor) == source_n2n.GetActorRef() || (sender as Actor) == target_n2n.GetActorRef()
        debug.Trace("Inworld: Actor is currently engaged in converation with another NPC.")
    EndIf
    debug.Trace("Inworld: Start Dialogue")
    ConversationOnGoing.SetValueInt(1)
    InworldSKSE.Start(sender as Actor, Utility.GameTimeToString(Utility.GetCurrentGameTime()))
endFunction

function _Stop(String eventName, String strArg, Float numArg, Form sender) 
    debug.Trace("Inworld: Stop Dialogue")
    Utility.Wait(7)
    ConversationOnGoing.SetValueInt(0)
    target.Clear()
endFunction

function Add_To_Followers(String eventName, String strArg, Float numArg, Form sender)
    Actor _actor = sender as Actor

    _actor.AddtoFaction(CurrentFollowerFaction)
    _actor.AddToFaction(PotentialFollowerFaction)
    ; TO-DO
endFunction

function Speak(String eventName, String strArg, Float numArg, Form sender) 
    If sender == None
        Return
    EndIf
    debug.Trace("Inworld: Speak request for " + (sender as Actor).GetDisplayName())
    target.ForceRefTo(sender as Actor)
    Utility.Wait(0.25)
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
    source_n2n.GetActorRef().SetLookAt(target_n2n.GetActorRef())
    target_n2n.GetActorRef().SetLookAt(source_n2n.GetActorRef())
    ; (InworldDialogueQuest as InworldDIalogueQuestN2NScript).SetPreviousActors(source_n2n.GetActorRef(), target_n2n.GetActorRef())
endFunction

function Stop_N2N(String eventName, String strArg, Float numArg, Form sender)
    Debug.Trace("Inworld: Stopping N2N Dialogue.")
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

bool function IsAvailableForDialogue(Actor _actor)
    return _InworldVoiceTypes.HasForm(_actor.GetVoiceType())  && _actor.IsEnabled()&& !_actor.IsAlerted() && !_actor.IsAlarmed()  && !_actor.IsBleedingOut() && !_actor.isDead() && !_actor.IsUnconscious()
endFunction
