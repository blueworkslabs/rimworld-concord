using System;
using System.IO;
using System.Linq;
using RimWorld;
using UnityEngine;
using Verse;

namespace Shellmaster.StagingLab
{
    [StaticConstructorOnStartup]
    public static class Bootstrap
    {
        static Bootstrap()
        {
            if (!GenCommandLine.CommandLineArgPassed("rimworld-lab") ||
                String.IsNullOrEmpty(Environment.GetEnvironmentVariable("RIMWORLD_LAB_ROOT")) ||
                GenFilePaths.SaveDataFolderPath != Path.Combine(Environment.GetEnvironmentVariable("RIMWORLD_LAB_ROOT"), "profile"))
            {
                Log.Warning("[StagingLab] Disabled outside the explicit staging profile.");
                return;
            }
            var obj = new GameObject("ShellmasterStagingLab");
            UnityEngine.Object.DontDestroyOnLoad(obj);
            obj.AddComponent<LabPump>();
            QualitySettings.vSyncCount = 0;
            Application.targetFrameRate = 60;
            Prefs.PauseOnLoad = true;
            Log.Message("[StagingLab] Local main-thread control ready (60 FPS cap).");
        }
    }

    [Serializable] public class Request { public string id; public string op; public string name; }
    [Serializable] public class PawnState
    {
        public string id; public string name; public int x; public int z;
        public string job; public float health;
    }
    [Serializable] public class State
    {
        public string at; public string version; public string boot;
        public bool loaded; public bool loading; public bool paused;
        public bool odyssey; public bool biotech; public int ticks;
        public int mapId; public int mapWidth; [NonSerialized] public PawnState[] pawns;
    }
    [Serializable] public class Response
    {
        public string id; public bool ok; public string error;
    }

    public class LabPump : MonoBehaviour
    {
        private static readonly string Root = Environment.GetEnvironmentVariable("RIMWORLD_LAB_ROOT");
        private readonly string boot = Guid.NewGuid().ToString("N");
        private float nextPoll;
        private float nextState;
        private bool pauseAfterLoad;

        private static void Write(string path, string text)
        {
            File.WriteAllText(path + ".tmp", text);
            if (File.Exists(path)) File.Replace(path + ".tmp", path, null);
            else File.Move(path + ".tmp", path);
        }

        private State Snapshot()
        {
            bool loading = LongEventHandler.ShouldWaitForEvent || pauseAfterLoad;
            var map = loading ? null : Find.CurrentMap;
            return new State {
                at = DateTime.UtcNow.ToString("o"), version = VersionControl.CurrentVersionString,
                boot = boot, loading = loading, loaded = map != null,
                odyssey = ModsConfig.OdysseyActive, biotech = ModsConfig.BiotechActive,
                ticks = map == null ? -1 : Find.TickManager.TicksGame,
                paused = map == null || Find.TickManager.Paused,
                mapId = map == null ? -1 : map.uniqueID,
                mapWidth = map == null ? 0 : map.Size.x,
                pawns = map == null ? new PawnState[0] : map.mapPawns.FreeColonistsSpawned
                    .Select(p => new PawnState { id = p.GetUniqueLoadID(), name = p.LabelShort,
                        x = p.Position.x, z = p.Position.z,
                        job = p.CurJobDef == null ? "" : p.CurJobDef.defName,
                        health = p.health.summaryHealth.SummaryHealthPercent }).ToArray()
            };
        }

        // Serialize nested DTOs explicitly: this Unity player omits mod-defined nested types.
        private static string EncodeState(State state)
        {
            return JsonUtility.ToJson(state).TrimEnd('}') + ",\"pawns\":[" +
                String.Join(",", state.pawns.Select(p => JsonUtility.ToJson(p)).ToArray()) + "]}";
        }

        private void PauseWhenReady()
        {
            LongEventHandler.ExecuteWhenFinished(delegate {
                if (Find.CurrentMap != null) Find.TickManager.CurTimeSpeed = TimeSpeed.Paused;
                pauseAfterLoad = false;
            });
        }

        public void Update()
        {
            if (Time.realtimeSinceStartup < nextPoll) return;
            nextPoll = Time.realtimeSinceStartup + 0.2f;
            if (LongEventHandler.ShouldWaitForEvent || pauseAfterLoad) return;
            try
            {
                string path = Root + "/request.json";
                if (File.Exists(path))
                {
                    string payload = File.ReadAllText(path);
                    File.Delete(path);
                    var request = JsonUtility.FromJson<Request>(payload);
                    var response = new Response { id = request.id };
                    bool quit = false;
                    try
                    {
                        switch (request.op)
                        {
                            case "state": break;
                            case "new":
                                if (Current.Game != null) throw new Exception("New fixture requires the main menu");
                                pauseAfterLoad = true;
                                LongEventHandler.QueueLongEvent(delegate {
                                    Root_Play.SetupForQuickTestPlay();
                                    Find.GameInitData.mapSize = 150;
                                    Find.GameInitData.PrepForMapGen();
                                    Find.Scenario.PreMapGenerate();
                                }, "Play", "GeneratingMap", true, null);
                                PauseWhenReady();
                                break;
                            case "pause": RequireMap(); Find.TickManager.CurTimeSpeed = TimeSpeed.Paused; break;
                            case "run": RequireMap(); Find.TickManager.CurTimeSpeed = TimeSpeed.Normal; break;
                            case "save":
                                RequireMap(); ValidateName(request.name);
                                if (GameDataSaveLoader.SavingIsTemporarilyDisabled) throw new Exception("Saving temporarily disabled");
                                Find.TickManager.CurTimeSpeed = TimeSpeed.Paused;
                                GameDataSaveLoader.SaveGame(request.name);
                                if (!File.Exists(GenFilePaths.FilePathForSavedGame(request.name))) throw new Exception("Save file not created");
                                break;
                            case "load":
                                ValidateName(request.name);
                                if (!File.Exists(GenFilePaths.FilePathForSavedGame(request.name))) throw new Exception("Save does not exist");
                                pauseAfterLoad = true;
                                GameDataSaveLoader.LoadGame(request.name);
                                PauseWhenReady();
                                break;
                            case "quit": quit = true; break;
                            default: throw new Exception("Unknown operation");
                        }
                        response.ok = true;
                    }
                    catch (Exception ex) { response.error = ex.Message; }
                    Write(Root + "/response.json", JsonUtility.ToJson(response).TrimEnd('}') +
                        ",\"state\":" + EncodeState(Snapshot()) + "}");
                    if (quit) Application.Quit();
                }
                if (Time.realtimeSinceStartup >= nextState)
                {
                    nextState = Time.realtimeSinceStartup + 1;
                    Write(Root + "/state.json", EncodeState(Snapshot()));
                }
            }
            catch (Exception ex) { Log.Error("[StagingLab] " + ex); }
        }

        private static void RequireMap()
        {
            if (Find.CurrentMap == null) throw new Exception("No loaded map");
        }
        private static void ValidateName(string name)
        {
            if (String.IsNullOrEmpty(name) || !System.Text.RegularExpressions.Regex.IsMatch(name, "^lab-[a-zA-Z0-9_-]{1,60}$"))
                throw new Exception("Only lab-* save basenames are accepted");
        }
    }
}
