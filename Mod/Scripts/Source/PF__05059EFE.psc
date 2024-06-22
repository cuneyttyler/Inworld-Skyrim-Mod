;BEGIN FRAGMENT CODE - Do not edit anything between this and the end comment
;NEXT FRAGMENT INDEX 3
Scriptname PF__05059EFE Extends Package Hidden

;BEGIN FRAGMENT Fragment_1
Function Fragment_1(Actor akActor)
;BEGIN CODE
Debug.Trace("Inworld: N2NStandPackage End")
;END CODE
EndFunction
;END FRAGMENT

;BEGIN FRAGMENT Fragment_0
Function Fragment_0(Actor akActor)
;BEGIN CODE
Debug.Trace("Inworld: N2NStandPackage Begin")

If akActor == source_n2n.GetActorRef()
    Debug.Trace("Inworld: Send N2N_Start")
    InworldSKSE.N2N_Start(Utility.GameTimeToString(Utility.GetCurrentGameTime()))
EndIf
;END CODE
EndFunction
;END FRAGMENT

;BEGIN FRAGMENT Fragment_2
Function Fragment_2(Actor akActor)
;BEGIN CODE
Debug.Trace("Inworld: N2NStandPackage Change")
;END CODE
EndFunction
;END FRAGMENT

;END FRAGMENT CODE - Do not edit anything between this and the begin comment

ReferenceAlias Property source_n2n  Auto  
