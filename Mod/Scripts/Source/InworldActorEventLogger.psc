Scriptname InworldActorEventLogger extends ReferenceAlias  

ReferenceAlias[] property ActorRefs auto

bool combatLogged = false

Event OnCombatStateChanged(Actor akTarget, int aeCombatState)
    Actor[] actors = GetRefsAsActors()
    int i = 0
    Debug.Trace("Actors: ")
    While i < 20
        If actors[i] != None
            Debug.Trace(actors[i].GetDisplayName())
        EndIf
        i += 1
    EndWhile
    i = 0
    While i < 20
        if (aeCombatState == 0)
            InworldSKSE.LogEvent(actors[i], CurrentTimeString() + self.GetActorRef().GetDisplayName() + " has left combat. " )
        elseif (aeCombatState == 1 && !combatLogged)
            InworldSKSE.LogEvent(actors[i], CurrentTimeString() + self.GetActorRef().GetDisplayName() + " have entered combat with " + akTarget.GetDisplayName() + ". ")
            combatLogged = true
            Utility.Wait(2)
            combatLogged = false
        elseif (aeCombatState == 2)
            InworldSKSE.LogEvent(actors[i], CurrentTimeString() + self.GetActorRef().GetDisplayName() + " is searching for " + akTarget.GetDisplayName() + ". ")
        endIf
        i += 1
    EndWhile
endEvent

Event OnDeath(Actor akKiller)
    Actor[] actors = GetRefsAsActors()
    int i = 0
    While i < 20
        InworldSKSE.LogEvent(actors[i], CurrentTimeString() + self.GetActorRef().GetDisplayName() + " is killed by " + akKiller.GetDisplayName() + ". ")
        i += 1
    EndWhile
EndEvent

Event OnDying(Actor akKiller)
    Actor[] actors = GetRefsAsActors()
    int i = 0
    While i < 20
        InworldSKSE.LogEvent(actors[i], CurrentTimeString() + self.GetActorRef().GetDisplayName() + " is about to be killed by " + akKiller.GetDisplayName() + ". ")
        i += 1
    EndWhile
EndEvent

Event OnBleedOut()
    Actor[] actors = GetRefsAsActors()
    int i = 0
    While i < 20
        InworldSKSE.LogEvent(actors[i], CurrentTimeString() + self.GetActorRef().GetDisplayName() + " has entered bleedout. ")
        i += 1
    EndWhile
EndEvent

Event OnObjectEquipped(Form akBaseObject, ObjectReference akReference)
    Actor[] actors = GetRefsAsActors()
    int i = 0
    String objectType = "an item"
    If akBaseObject as Weapon
        objectType = "a weapon"
    ElseIf akBaseObject as Armor
        objectType = "an armor"
    EndIf
    Debug.Trace("Send event")
    While i < 20
        InworldSKSE.LogEvent(actors[i], CurrentTimeString() + self.GetActorRef().GetDisplayName() + " has equipped " + objectType + ". ")
        i += 1
    EndWhile
EndEvent

Event OnObjectUnequipped(Form akBaseObject, ObjectReference akReference)
    Actor[] actors = GetRefsAsActors()
    int i = 0
    String objectType = "an item"
    If akBaseObject as Weapon
        objectType = "a weapon"
    ElseIf akBaseObject as Armor
        objectType = "an armor"
    EndIf
    While i < 20
        InworldSKSE.LogEvent(actors[i], CurrentTimeString() + self.GetActorRef().GetDisplayName() + " has unequipped " + objectType + ". ")
        i += 1
    EndWhile
EndEvent

Event OnPlayerBowShot(Weapon akWeapon, Ammo akAmmo, Float afPower, Bool abSunGazing)
    Actor[] actors = GetRefsAsActors()
    int i = 0
    While i < 20
        InworldSKSE.LogEvent(actors[i], CurrentTimeString() + self.GetActorRef().GetDisplayName() + " has shoot an arrow. ")
        i += 1
    EndWhile
EndEvent

Event OnHit(ObjectReference akAggressor, Form akSource, Projectile akProjectile, Bool abPowerAttack, Bool abSneakAttack, Bool abBashAttack, Bool abHitBlocked)
    Actor[] actors = GetRefsAsActors()
    int i = 0
    While i < 20
        InworldSKSE.LogEvent(actors[i], CurrentTimeString() + self.GetActorRef().GetDisplayName() + " was got hit by " + akAggressor.GetDisplayName() + ". ")
        i += 1
    EndWhile
EndEvent

Actor[] Function GetRefsAsActors()
    Actor[] actors = new Actor[20]
    int i = 0
    While i < 20
        If ActorRefs[i] != None
            actors[i] = ActorRefs[i].GetActorRef()
        EndIf
        i += 1
    EndWhile

    Return actors
EndFunction

String Function CurrentTimeString()
    Return "On " + Utility.GameTimeToString(Utility.GetCurrentGameTime()) + ", "
EndFunction