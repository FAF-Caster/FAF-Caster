using System;
using System.Collections.Generic;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace FAFCaster.Companion;

// Lobby metadata is best-effort: never infer a team from army order or player count.
internal sealed class MatchMetadata
{
    public int version => 1;
    public string? replayId { get; private set; }
    public string? mapId { get; private set; }
    public Dictionary<string,int> teams { get; } = new();
    public Dictionary<string,string> settings { get; } = new();
    private readonly Dictionary<string,int> _humanTeam = new();
    private readonly Dictionary<string,int> _humanArmy = new();
    private readonly Dictionary<int,int> _slotTeam = new();
    private int? _lastAiTeam;
    public int Revision { get; private set; }
    private static readonly Regex Replay = new(@"REPLAY ID:\s*(\d+)", RegexOptions.Compiled);
    private static readonly Regex Map = new(@"GameOption\s+ScenarioFile\s+/maps/([A-Za-z0-9_-]+)/", RegexOptions.Compiled);
    private static readonly Regex Option = new(@"GameOption\s+(\w+)\s+(.+)$", RegexOptions.Compiled);
    private static readonly Regex Player = new(@"PlayerOption\s+(\d+)\s+(Team|Army)\s+(-?\d+)", RegexOptions.Compiled);
    private static readonly Regex Ai = new(@"AIOption\s+.+?\s+(Team|StartSpot)\s+(-?\d+)$", RegexOptions.Compiled);
    private static readonly Regex SlotArmy = new(@"Setting army (\d+) for slot (\d+)", RegexOptions.Compiled);
    private static readonly Regex AiArmy = new(@"AIOption\s+.+?\s+Army\s+(\d+)$", RegexOptions.Compiled);
    public void Read(string line)
    {
        var match = Replay.Match(line);
        if (match.Success) Set(refReplay:match.Groups[1].Value);
        match = Map.Match(line);
        if (match.Success && mapId != match.Groups[1].Value) { mapId=match.Groups[1].Value; Revision++; }
        match = Option.Match(line);
        if (match.Success) { var key=match.Groups[1].Value;var value=match.Groups[2].Value.Trim(); if(value.Length<=180 && (!settings.TryGetValue(key,out var old)||old!=value)){settings[key]=value;Revision++;} }
        match = Player.Match(line);
        if (match.Success)
        {
            var uid=match.Groups[1].Value; var value=int.Parse(match.Groups[3].Value);
            if (match.Groups[2].Value=="Team") _humanTeam[uid]=value;
            else _humanArmy[uid]=value;
            foreach (var (id,army) in _humanArmy) if(army>0 && _humanTeam.TryGetValue(id,out var team)) Assign(army,team);
        }
        match = Ai.Match(line);
        if(match.Success)
        {
            var value=int.Parse(match.Groups[2].Value);
            if(match.Groups[1].Value=="Team") _lastAiTeam=value;
            else if(value>0 && _lastAiTeam.HasValue) _slotTeam[value]=_lastAiTeam.Value;
        }
        match = SlotArmy.Match(line);
        if(match.Success)
        {
            var army=int.Parse(match.Groups[1].Value);var slot=int.Parse(match.Groups[2].Value);
            if(_slotTeam.TryGetValue(slot,out var team)) Assign(army,team);
        }
        // Some FAF versions only emit the final named AIOption Army assignment.
        // Do not assign its team unless a slot-to-army relationship is logged.
    }
    private void Set(string refReplay) {if(replayId!=refReplay){replayId=refReplay;Revision++;}}
    private void Assign(int army,int team)
    {
        if(army<1||army>32)return;
        var key=army.ToString();var normalized=team>0?team:0;
        if(!teams.TryGetValue(key,out var old)||old!=normalized){teams[key]=normalized;Revision++;}
    }
    public string ToJson()=>JsonSerializer.Serialize(this);
}
