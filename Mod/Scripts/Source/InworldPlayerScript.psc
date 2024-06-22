Scriptname InworldPlayerScript extends ReferenceAlias  

quest property InworldDialogueQuest auto

Event OnPlayerLoadGame()
	Debug.Trace("Inworld: Game Loaded")
	(InworldDialogueQuest as InworldDialogueQuestScript).Reset()
EndEvent

Event OnLocationChange(Location oldLocation, Location newLocation)
	Debug.Trace("Inworld: Location Changed.")
	(InworldDialogueQuest as InworldDialogueQuestScript).Reset()
EndEvent