;BEGIN FRAGMENT CODE - Do not edit anything between this and the end comment
;NEXT FRAGMENT INDEX 3
Scriptname PF_InworldTravelToNPCLocatio_050784FF Extends Package Hidden

;BEGIN FRAGMENT Fragment_0
Function Fragment_0(Actor akActor)
;BEGIN CODE
Debug.Trace("Inworld: TravelToNPCPackage Begin")
;END CODE
EndFunction
;END FRAGMENT

;BEGIN FRAGMENT Fragment_2
Function Fragment_2(Actor akActor)
;BEGIN CODE
Debug.Trace("Inworld: TravelToNPCPackage Change")
(InworldDialogueQuest as InworldDialogueQuestScript).SetHoldPosition("", "", 2, None)
;END CODE
EndFunction
;END FRAGMENT

;BEGIN FRAGMENT Fragment_1
Function Fragment_1(Actor akActor)
;BEGIN CODE
Debug.Trace("Inworld: TravelToNPCPackage End")
(InworldDialogueQuest as InworldDialogueQuestScript).SetHoldPosition("", "", 2, None)
;END CODE
EndFunction
;END FRAGMENT

;END FRAGMENT CODE - Do not edit anything between this and the begin comment

Quest Property InworldDialogueQuest  Auto  
