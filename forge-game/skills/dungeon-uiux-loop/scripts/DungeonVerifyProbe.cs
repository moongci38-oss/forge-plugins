// dungeon-uiux-loop verifier probe — script-execute(IvanMurzak MCP)로 Play 모드에서 실행.
// 결과를 loops/dungeon-uiux-loop/verify-report.json 에 기록 (verify.sh가 jq로 binary 판정).
// 체크: C1 컴파일에러0(호출측 보장) C2 4버튼 C3~C6 4종 Select 헤더 C7 일반 리스트 C8 MapPanel off
// C9 인게임 입장(별도 스텝 — 씬 전환 후 프로브 재실행 시 lastScene 필드로 판정)
using UnityEngine;
using System.Text;

public static class DungeonVerifyProbe
{
    const string OUT = "loops/dungeon-uiux-loop/verify-report.json";

    static MonoBehaviour Find(string typeName)
    {
        var t = System.Type.GetType(typeName + ", Assembly-CSharp");
        return t == null ? null : Object.FindFirstObjectByType(t, FindObjectsInactive.Include) as MonoBehaviour;
    }

    static bool LabelOk(MonoBehaviour ui, string field)
    {
        var l = ui.GetType().GetField(field)?.GetValue(ui) as UILabel;
        return l != null && !string.IsNullOrEmpty(l.text);
    }

    public static void Run()
    {
        var sb = new StringBuilder("{\n");
        int fail = 0;
        System.Action<string, bool, string> chk = (id, ok, detail) =>
        {
            if (!ok) fail++;
            sb.Append("  \"").Append(id).Append("\": {\"pass\": ").Append(ok ? "true" : "false")
              .Append(", \"detail\": \"").Append(detail.Replace("\"", "'")).Append("\"},\n");
        };

        // C2: 엔트런스 4버튼 (eStage 세팅 후 상태)
        var ent = Find("EodUIDungeonEntrance");
        if (ent != null)
        {
            var t = ent.GetType();
            t.GetMethod("SetDungeonType").Invoke(ent, new object[] {
                System.Enum.Parse(t.GetField("m_eInGameMode").FieldType, "eStage") });
            var dbr = t.GetField("dungeonButtonRoot").GetValue(ent) as GameObject;
            var nbr = t.GetField("normalButtonRoot").GetValue(ent) as GameObject;
            bool ok = dbr != null && dbr.activeSelf && nbr != null && !nbr.activeSelf && dbr.transform.childCount == 4;
            chk("C2_entrance_4btn", ok, dbr == null ? "dungeonButtonRoot 미바인딩" : ("active=" + dbr.activeSelf + " children=" + dbr.transform.childCount));
        }
        else chk("C2_entrance_4btn", false, "entrance 인스턴스 없음 (로비 미도달?)");

        // C3~C6: 4종 Select 헤더 (인스턴스 생성된 것만 실검사, 미생성=미개창)
        string[][] sel = {
            new[] { "C3_normal", "EodUIStageSelect", "m_LabelGem", "m_LabelGold", "" },
            new[] { "C4_rift", "EodUIRiftStageSelect", "m_LabelGem", "m_LabelGold", "m_LabelEntryResource" },
            new[] { "C5_trans", "EodUITranscendentStageSelect", "m_LabelGem", "m_LabelGold", "m_LabelEntryResource" },
            new[] { "C6_raid", "EodUIGuardianRaidStageSelect", "m_LabelGem", "m_LabelGold", "m_LabelEntryResource" },
        };
        foreach (var s in sel)
        {
            var ui = Find(s[1]);
            if (ui == null) { chk(s[0] + "_header", false, "미개창"); continue; }
            bool ok = LabelOk(ui, s[2]) && LabelOk(ui, s[3]) && (s[4] == "" || LabelOk(ui, s[4]));
            chk(s[0] + "_header", ok, "gem/gold" + (s[4] != "" ? "/entry" : "") + " 라벨 검사");
        }

        // C7: 일반 리스트 슬롯 ≥ 10 + C8: MapPanel off + ListView on
        var ns = Find("EodUIStageSelect");
        if (ns != null)
        {
            var grid = ns.GetType().GetField("m_GridSlots").GetValue(ns) as UIGrid;
            chk("C7_normal_list", grid != null && grid.transform.childCount >= 10,
                grid == null ? "grid null" : ("슬롯 " + grid.transform.childCount));
            Transform map = null;
            foreach (var tr in ns.GetComponentsInChildren<Transform>(true)) if (tr.name == "MapPanel") { map = tr; break; }
            var lv = ns.transform.Find("StageListView");
            chk("C8_map_off_list_on", (map == null || !map.gameObject.activeSelf) && lv != null,
                "map=" + (map != null ? map.gameObject.activeSelf.ToString() : "없음") + " lv=" + (lv != null));
        }
        else { chk("C7_normal_list", false, "미개창"); chk("C8_map_off_list_on", false, "미개창"); }

        // C9: 인게임 입장 — 현재 활성 씬 기록 (호출측이 게임시작 후 재실행해 씬 변화로 판정)
        string scene = UnityEngine.SceneManagement.SceneManager.GetActiveScene().name;
        bool inGame = !scene.StartsWith("Town") && scene != "Entry" && !string.IsNullOrEmpty(scene);
        chk("C9_ingame_scene", inGame, "activeScene=" + scene);

        sb.Append("  \"summary\": {\"pass\": ").Append(fail == 0 ? "true" : "false")
          .Append(", \"failCount\": ").Append(fail).Append(", \"scene\": \"").Append(scene).Append("\"}\n}");

        System.IO.Directory.CreateDirectory("loops/dungeon-uiux-loop");
        System.IO.File.WriteAllText(OUT, sb.ToString());
        Debug.LogError("[DungeonVerifyProbe] fail=" + fail + " → " + OUT);
    }
}
