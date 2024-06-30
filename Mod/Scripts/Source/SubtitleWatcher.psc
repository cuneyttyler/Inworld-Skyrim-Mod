scriptname SubtitleWatcher extends Quest

Event OnInit()
    While True
        InworldSKSE.WatchSubtitles()
        Utility.Wait(1)
    EndWhile
EndEvent