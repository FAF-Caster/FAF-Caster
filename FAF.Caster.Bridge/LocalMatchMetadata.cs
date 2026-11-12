using System.Text.RegularExpressions;

sealed class LocalMatchMetadata
{
    private static readonly Regex Replay = new(@"REPLAY ID:\s*(\d+)", RegexOptions.Compiled);
    private static readonly Regex Map = new(@"GameOption\s+ScenarioFile\s+/maps/([A-Za-z0-9_-]+)/", RegexOptions.Compiled);
    private static readonly Regex Option = new(@"GameOption\s+(\w+)\s+(.+)$", RegexOptions.Compiled);
    private static readonly Regex Player = new(@"PlayerOption\s+(\d+)\s+(Team|Army)\s+(-?\d+)", RegexOptions.Compiled);
    private static readonly Regex Ai = new(@"AIOption\s+.+?\s+(Team|StartSpot)\s+(-?\d+)$", RegexOptions.Compiled);
    private static readonly Regex SlotArmy = new(@"Setting army (\d+) for slot (\d+)", RegexOptions.Compiled);
    private readonly Dictionary<string,int> _humanTeam = new();
    private readonly Dictionary<string,int> _humanArmy = new();
    private readonly Dictionary<int,int> _slotTeam = new();
    private int? _lastAiTeam;
    public string? ReplayId { get; private set; }
    public string? MapId { get; private set; }
    public Dictionary<string,string> Settings { get; } = new();
    public Dictionary<int,int> Teams { get; } = new();
    public void Read(string line)
    {
        var m=Replay.Match(line);
        if(m.Success) ReplayId=m.Groups[1].Value;
        m=Map.Match(line);
        if(m.Success) MapId=m.Groups[1].Value;
        m=Option.Match(line);
        if(m.Success && m.Groups[2].Value.Length<=180) Settings[m.Groups[1].Value]=m.Groups[2].Value.Trim();
        m=Player.Match(line);
        if(m.Success && int.TryParse(m.Groups[3].Value,out var value))
        {
            var uid=m.Groups[1].Value;
            if(m.Groups[2].Value=="Team") _humanTeam[uid]=value;
            else _humanArmy[uid]=value;
            foreach(var (id,army) in _humanArmy)
                if(army>0 && _humanTeam.TryGetValue(id,out var team)) Teams[army]=Math.Max(0,team);
        }
        m=Ai.Match(line);
        if(m.Success && int.TryParse(m.Groups[2].Value,out var aiValue))
        {
            if(m.Groups[1].Value=="Team") _lastAiTeam=aiValue;
            else if(aiValue>0 && _lastAiTeam.HasValue) _slotTeam[aiValue]=_lastAiTeam.Value;
        }
        m=SlotArmy.Match(line);
        if(m.Success && int.TryParse(m.Groups[1].Value,out var armyId) && int.TryParse(m.Groups[2].Value,out var slot) && _slotTeam.TryGetValue(slot,out var assignedTeam))
            Teams[armyId]=Math.Max(0,assignedTeam);
    }
    public object Snapshot()=>new {version=1,replayId=ReplayId,mapId=MapId,teams=Teams.ToDictionary(p=>p.Key.ToString(),p=>p.Value),settings=Settings.ToDictionary(p=>p.Key,p=>p.Value)};
}
