scriptname SubtitleWatcher extends Quest

Event OnInit()
    While True
        InworldSKSE.WatchSubtitles()
        Utility.Wait(3)
    EndWhile
EndEvent