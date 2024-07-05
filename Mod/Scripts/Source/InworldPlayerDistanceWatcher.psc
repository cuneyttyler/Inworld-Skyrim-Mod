scriptname InworldPlayerDistanceWatcher extends Quest

ReferenceAlias property target auto
Quest property InworldDialogueQuest auto

Event OnInit()
    While True
        If target != None
            Actor _actor = target.GetActorRef()
            If _actor != None && Game.GetPlayer().GetDistance(_actor) > 350
                Debug.Trace("Sending STOP")
                (InworldDialogueQuest as InworldDialogueQuestScript).Reset_Normal()
            EndIf
        EndIf
        Utility.Wait(1)
    EndWhile
EndEvent