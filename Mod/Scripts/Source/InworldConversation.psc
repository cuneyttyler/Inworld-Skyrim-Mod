;/ Decompiled by Champollion V1.0.1
Source   : InworldConversation.psc
Modified : 2023-08-07 02:26:05
Compiled : 2023-08-07 02:26:06
User     : Dell
Computer : DESKTOP-VOF8J3K
/;
scriptName InworldConversation extends Quest

;-- Properties --------------------------------------
iwant_widgets property iWidgets auto
package property inworld_stand_package auto

;-- Variables ---------------------------------------
Int _lastShapeId = -1
Float _defaultGreetingSetting = 50.0000
Actor _actor
Float _voiceRecoveryTimeForActor = 10.0000
Int _posX
Int _posY
Bool _isChattingWithActor = false
Bool _isVisible
Int _fontSize = 22

;-- Functions ---------------------------------------

function ClearPhoneme(Actor ActorRef) global

	; Int i
	; while i <= 15
	; 	ActorRef.SetExpressionPhoneme(i, 0.000000)
	; 	i += 1
	; endWhile
endFunction

function SetActorMoveToPlayer(String eventName, String strArg, Float numArg, Form sender)

	Actor subjectActor = sender as Actor
	Actor playerActor = game.GetPlayer()
	subjectActor.SetLookAt(playerActor as objectreference, false)
	; subjectActor.ClearForcedMovement()
	debug.SendAnimationEvent(subjectActor as objectreference, "IdleStop")
	debug.SendAnimationEvent(subjectActor as objectreference, "IdleForceDefaultState")
endFunction

function HoldPosition(String eventName, String strArg, Float numArg, Form sender) 
    debug.Trace("Inworld:HoldPosition " + (sender as Actor).GetDisplayName())
    
	ActorUtil.AddPackageOverride(sender as Actor, inworld_stand_package)
endFunction

function RemoveHoldPosition(String eventName, String strArg, Float numArg, Form sender) 
    debug.Trace("Inworld:RemoveHoldPosition " + (sender as Actor).GetDisplayName())
    
	ActorUtil.AddPackageOverride(sender as Actor, inworld_stand_package)
endFunction

function SetPositionHandler(String eventName, String strArg, Float numArg, Form sender)

	if strArg == "PositionX"
		_posX = numArg as Int
	elseIf strArg == "PositionY"
		_posY = numArg as Int
	endIf
endFunction

function ClearFacialExpressionHandler(String eventName, String strArg, Float numArg, Form sender)

	Actor subjectActor = sender as Actor
	; subjectActor.ClearExpressionOverride()
	; subjectActor.ResetExpressionOverrides()
	; InworldConversation.ClearPhoneme(subjectActor)
	; subjectActor.ResetExpressionOverrides()
endFunction

function ClearActorFixation(Actor subjectActor)

	subjectActor.ClearLookAt()
	; subjectActor.ClearForcedMovement()
	subjectActor.ClearKeepOffsetFromActor()
	subjectActor.SetDontMove(false)
endFunction

function OniWantWidgetsReset(String eventName, String strArg, Float numArg, Form sender)

	if eventName == "iWantWidgetsReset"
		iWidgets = sender as iwant_widgets
	endIf
endFunction

function ShowTextEventHandler(String eventName, String strArg, Float numArg, Form sender)
	Debug.Notification(strArg);
	; Debug.Trace("Inworld:ShowTextEventHandler")
	; if _lastShapeId != -1
	; 	_isVisible = false
	; 	iWidgets.setVisible(_lastShapeId, 0)
	; 	_lastShapeId = -1
	; endIf
	; self.DisplayMessage(strArg, numArg as Int)
endFunction

function SetGreetingStuff(Actor subjectActor, Bool isTurnOff)

	if isTurnOff
		_defaultGreetingSetting = game.GetGameSettingFloat("fAIMinGreetingDistance")
		debug.Trace("Inworld: Turning off Min Greeting Distance. It was previously " + _defaultGreetingSetting as String, 0)
		game.SetGameSettingFloat("fAIMinGreetingDistance", 0.000000)
	else
		if _defaultGreetingSetting < 1 as Float
			_defaultGreetingSetting = 50.0000
		endIf
		game.SetGameSettingFloat("fAIMinGreetingDistance", _defaultGreetingSetting)
		InworldConversation.ClearPhoneme(subjectActor)
		debug.Trace("Turning on Min Greeting Distance. And clearing Phoneme of chars ", 0)
	endIf
endFunction

function DisplayMessage(String str, Int waitTime)

	String[] messageDivided = stringutil.Split(str, ";;;")
	Int index = 0
	while index < messageDivided.length
		String current = messageDivided[index]
		self.ShowInternal(current, waitTime)
		index += 1
	endWhile
endFunction

function OnUpdate()

	if _isChattingWithActor
		_actor.SetRestrained(true)
		debug.SendAnimationEvent(_actor as objectreference, "IdleStopInstant")
	endIf
endFunction

function VisibilityToggleHandler(String eventName, String strArg, Float numArg, Form sender)

	if strArg == "true"
		iWidgets.setVisible(_lastShapeId, 1)
	elseIf strArg == "false"
		iWidgets.setVisible(_lastShapeId, 0)
	endIf
endFunction

function ShowInternal(String str, Int waitTime)

	if _lastShapeId != -1
		_isVisible = false
		iWidgets.setVisible(_lastShapeId, 0)
		_lastShapeId = -1
	endIf
	_lastShapeId = iWidgets.loadText(str, "Minipax", _fontSize, 10000, 10000, false)
	iWidgets.setPos(_lastShapeId, _posX, _posY)
	iWidgets.setVisible(_lastShapeId, 1)
	_isVisible = true
	utility.Wait(waitTime as Float)
	iWidgets.setVisible(_lastShapeId, 0)
	_lastShapeId = -1
	_isVisible = false
endFunction

Int function StringToActionIndexConverter(String str)

	if str == "1"
		return 1
	elseIf str == "2"
		return 2
	elseIf str == "3"
		return 3
	elseIf str == "4"
		return 4
	elseIf str == "5"
		return 5
	elseIf str == "6"
		return 6
	elseIf str == "7"
		return 7
	elseIf str == "8"
		return 8
	elseIf str == "9"
		return 9
	elseIf str == "10"
		return 10
	elseIf str == "11"
		return 11
	elseIf str == "12"
		return 12
	elseIf str == "13"
		return 13
	elseIf str == "14"
		return 14
	elseIf str == "15"
		return 15
	else
		return 1
	endIf
endFunction

; Skipped compiler generated GetState

function OnInit()

	self.RegisterForUpdate(4.00000)
	self.RegisterForSingleUpdateGameTime(10 as Float)
	self.RegisterForModEvent("iWantWidgetsReset", "OniWantWidgetsReset")
	self.RegisterForModEvent("BLC_CreateSubTitleEvent", "ShowTextEventHandler")
	self.RegisterForModEvent("BLC_SubtitlePositionEvent", "SetPositionHandler")
	self.RegisterForModEvent("BLC_SubtitleToggleEvent", "VisibilityToggleHandler")
	self.RegisterForModEvent("BLC_SetFacialExpressionEvent", "SetFacialExpressionHandler")
	self.RegisterForModEvent("BLC_ClearFacialExpressionEvent", "ClearFacialExpressionHandler")
	self.RegisterForModEvent("BLC_SetActorMoveToPlayer", "SetActorMoveToPlayer")
	self.RegisterForModEvent("BLC_Speak", "Speak")
	self.RegisterForModEvent("BLC_HoldPosition", "HoldPosition")
	self.RegisterForModEvent("BLC_RemoveHoldPosition", "RemoveHoldPosition")
endFunction

function SetFacialExpressionHandler(String eventName, String strArg, Float numArg, Form sender)

	Actor subjectActor = sender as Actor
	subjectActor.ClearExpressionOverride()
	debug.Trace("Args: " + strArg, 0)
	debug.Trace("FormID" + subjectActor.GetFormID() as String, 0)
	subjectActor.ResetExpressionOverrides()
	String[] splitted = stringutil.Split(strArg, "-")
	Int index = 0
	while index < splitted.length
		String current = splitted[index]
		Int phonemeIndex = self.StringToActionIndexConverter(current)
		Float strength = 0.100000
		while strength < 0.510000
			subjectActor.SetExpressionPhoneme(phonemeIndex, strength)
			strength += 0.100000
			utility.Wait(numArg)
		endWhile
		while strength > 0 as Float
			subjectActor.SetExpressionPhoneme(phonemeIndex, strength)
			strength -= 0.100000
			utility.Wait(numArg)
		endWhile
		index += 1
	endWhile
	subjectActor.ResetExpressionOverrides()
endFunction
