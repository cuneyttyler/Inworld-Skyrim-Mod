scriptname InworldPlayerDistanceWatcher extends Quest

ReferenceAlias property target auto
Quest property InworldDialogueQuest auto

Event OnInit()
    While True
        Actor _actor =  target.GetActorRef()
        If _actor != None && Game.GetPlayer().GetDistance(_actor) > 350
            Debug.Trace("Sending STOP")
            (InworldDialogueQuest as InworldDialogueQuestScript).Reset_Normal()
            Utility.Wait(5)
        EndIf
    EndWhile
EndEvent