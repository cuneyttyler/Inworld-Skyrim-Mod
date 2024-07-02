scriptname InworldPlayerDistanceWatcher extends Quest

ReferenceAlias property target auto
Quest property InworldDialogueQuest auto

Event OnInit()
    While True
        If target.GetActorRef() != None && Game.GetPlayer().GetDistance(target.GetActorRef()) > 350
            Debug.Trace("Sending STOP")
            (InworldDialogueQuest as InworldDialogueQuestScript).Reset_Normal()
            Utility.Wait(5)
        EndIf
    EndWhile
EndEvent