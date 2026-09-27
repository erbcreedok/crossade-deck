using System.Collections.Generic;
using UnityEngine;
using UnityEngine.XR.ARFoundation;
using UnityEngine.XR.ARSubsystems;
using Unity.XR.CoreUtils;

public sealed class TablePrototype : MonoBehaviour
{
    readonly List<ARRaycastHit> hits = new();
    Camera view;
    ARSession session;
    ARPlaneManager planes;
    ARRaycastManager rays;
    ARAnchorManager anchors;
    ARCameraManager cameraManager;
    ARCameraBackground background;
    ARPoseDriver poseDriver;
    Transform table;
    ARAnchor anchor;
    Font font;
    TableView tableView;
    TableLink link;
    Dictionary<string, object> snapshot;
    string me, status = "";
    float syncAt = -1, retryAt = -1;
    int failures;
    bool ar, placing, busy;
    int generation;
    float yaw, pitch = 52, distance = 1.5f;
    string notice = "";

    void Awake()
    {
        Application.targetFrameRate = 30;
        font = Resources.Load<Font>("Tiny5");
        var sessionObject = new GameObject("AR Session");
        sessionObject.SetActive(false);
        session = sessionObject.AddComponent<ARSession>();
        sessionObject.AddComponent<ARInputManager>();
        var originObject = new GameObject("XR Origin");
        originObject.SetActive(false);
        var origin = originObject.AddComponent<XROrigin>();
        var offset = new GameObject("Camera Offset");
        offset.transform.SetParent(origin.transform, false);
        var cameraObject = new GameObject("Camera");
        cameraObject.tag = "MainCamera";
        cameraObject.transform.SetParent(offset.transform, false);
        view = cameraObject.AddComponent<Camera>();
        view.nearClipPlane = .02f;
        view.farClipPlane = 30;
        view.clearFlags = CameraClearFlags.SolidColor;
        view.backgroundColor = new Color(.08f, .09f, .1f);
        origin.Camera = view;
        origin.CameraFloorOffsetObject = offset;
        origin.RequestedTrackingOriginMode = XROrigin.TrackingOriginMode.Device;
        cameraManager = cameraObject.AddComponent<ARCameraManager>();
        background = cameraObject.AddComponent<ARCameraBackground>();
        poseDriver = cameraObject.AddComponent<ARPoseDriver>();
        planes = originObject.AddComponent<ARPlaneManager>();
        planes.requestedDetectionMode = PlaneDetectionMode.Horizontal;
        rays = originObject.AddComponent<ARRaycastManager>();
        anchors = originObject.AddComponent<ARAnchorManager>();
        SetComponents(false);
        originObject.SetActive(true);
        session.enabled = false;
        sessionObject.SetActive(true);
        table = new GameObject("Card Table").transform;
        tableView = new TableView(table, font);
        Orbit();
        Application.deepLinkActivated += Opened;
        if (!string.IsNullOrEmpty(Application.absoluteURL)) Opened(Application.absoluteURL);
        else if (PlayerPrefs.HasKey(PASS)) Connect();
        else status = "Открой стол в Telegram: Настройки → Приложение Crossade AR";
    }

    void SetComponents(bool enabled)
    {
        cameraManager.enabled = background.enabled = poseDriver.enabled = enabled;
        planes.enabled = rays.enabled = anchors.enabled = enabled;
    }

    void ChangeMode()
    {
        generation++;
        ar = !ar;
        notice = "";
        table.SetParent(null, true);
        if (anchor != null) { Destroy(anchor.gameObject); anchor = null; }
        SetComponents(ar);
        session.enabled = ar;
        placing = ar;
        table.gameObject.SetActive(!ar);
        if (!ar) { table.SetPositionAndRotation(Vector3.zero, Quaternion.identity); Orbit(); }
        else view.transform.SetLocalPositionAndRotation(Vector3.zero, Quaternion.identity);
    }

    void Orbit()
    {
        view.transform.position = Quaternion.Euler(pitch,yaw,0)*new Vector3(0,0,-distance);
        view.transform.LookAt(Vector3.zero);
    }

    // ─── ЗА СТОЛОМ ───────────────────────────────────────────────────────────────────────────────
    // Пропуск приходит ссылкой из Telegram (`crossade://table?room&pass&host`) и живёт в памяти телефона:
    // приложение, открытое без ссылки, садится за последний стол. Адрес мака меняется при перезапуске
    // туннеля — тогда новый берётся у реле.
    const string ROOM = "crossade.room", PASS = "crossade.pass", HOST = "crossade.host";
    const string RELAY = "https://crossade-deck-server.fly.dev/relay/table";
    const int PROTOCOL = 2;

    void Opened(string url)
    {
        var query = new System.Uri(url).Query.TrimStart('?').Split('&');
        foreach (var pair in query)
        {
            var cut = pair.IndexOf('=');
            if (cut <= 0) continue;
            var value = System.Uri.UnescapeDataString(pair[(cut + 1)..].Replace('+', ' '));
            switch (pair[..cut])
            {
                case "room": PlayerPrefs.SetString(ROOM, value); break;
                case "pass": PlayerPrefs.SetString(PASS, value); break;
                case "host": PlayerPrefs.SetString(HOST, value); break;
            }
        }
        PlayerPrefs.Save();
        failures = 0;
        Connect();
    }

    async void Connect()
    {
        link?.Leave();
        link = null;
        retryAt = -1;
        string room = PlayerPrefs.GetString(ROOM), pass = PlayerPrefs.GetString(PASS), host = PlayerPrefs.GetString(HOST);
        status = "Сажусь за стол…";
        try
        {
            // Со второй неудачи подряд адрес мака спрашиваем у реле: туннель мог смениться.
            if (failures > 0 || string.IsNullOrEmpty(host))
            {
                using var http = new System.Net.Http.HttpClient { Timeout = System.TimeSpan.FromSeconds(10) };
                var fresh = TableLink.Field(await http.GetStringAsync(RELAY), "url");
                if (!string.IsNullOrEmpty(fresh)) { host = fresh; PlayerPrefs.SetString(HOST, host); }
            }
            var joined = await TableLink.Join(host, new Dictionary<string, string> {
                ["room"] = room, ["client"] = "unity", ["door"] = "app", ["pass"] = pass, ["protocol"] = PROTOCOL.ToString() });
            link = joined;
            link.Message += Heard;
            link.Closed += Lost;
            link.Send("hello");
        }
        catch (System.Exception e)
        {
            Lost(e.Message);
        }
    }

    void Lost(string why)
    {
        link = null;
        failures++;
        // Отказ стола по пропуску не лечится повтором — нужна новая ссылка из Telegram.
        if (why.Contains("who are you") || why.Contains("room closed") || why.Contains("unsigned room"))
        {
            status = why.Contains("who are you") ? "Пропуск протух — возьми новый в Telegram" : "Стол закрыт";
            return;
        }
        status = "Нет связи со столом: " + why;
        retryAt = Time.realtimeSinceStartup + Mathf.Min(10, 2 * failures);
    }

    void Heard(string type, object body)
    {
        switch (type)
        {
            case "welcome":
                failures = 0;
                me = body.Obj("you").Str("key");
                snapshot = body.Obj("snapshot");
                status = body.Obj("you").Str("name") ?? "";
                if (snapshot != null) tableView.Show(snapshot, me);
                break;
            // Стол изменился. Чтобы смотреть, перекладывать операции не нужно: просим свежий снимок, не чаще
            // четырёх раз в секунду, — движение собирается в одну перестройку.
            case "patch":
                if (syncAt < 0) syncAt = Time.realtimeSinceStartup + .25f;
                break;
            case "pulse":
                if (snapshot != null && body.Num("v") != snapshot.Num("v") && syncAt < 0) syncAt = Time.realtimeSinceStartup;
                break;
        }
    }

    void OnApplicationPause(bool paused)
    {
        if (paused) { link?.Leave(); link = null; }
        else if (PlayerPrefs.HasKey(PASS) && link == null) Connect();
    }

    void Update()
    {
        if (syncAt >= 0 && Time.realtimeSinceStartup >= syncAt)
        {
            syncAt = -1;
            link?.Send("intent", new Dictionary<string, object> { ["t"] = "sync" });
        }
        if (retryAt >= 0 && Time.realtimeSinceStartup >= retryAt) Connect();
        if (ar || !Input.GetMouseButton(0) || Input.mousePosition.y < Screen.height*.18f) return;
        yaw += Input.GetAxis("Mouse X")*3;
        pitch = Mathf.Clamp(pitch-Input.GetAxis("Mouse Y")*3,15,85);
        Orbit();
    }

    async void Place()
    {
        if (busy || ARSession.state != ARSessionState.SessionTracking) return;
        // Найденная плоскость — лучше всего; пока её нет (темно, однотонно, телефон не двигался), ARKit даёт
        // оценённую на глаз — стол встаёт сразу, а не после минуты водить телефоном.
        var centre = new Vector2(Screen.width*.5f, Screen.height*.5f);
        if (!rays.Raycast(centre, hits, TrackableType.PlaneWithinPolygon) && !rays.Raycast(centre, hits, TrackableType.PlaneEstimated))
        { notice = "Не вижу поверхности — поводи телефоном над столом или полом"; return; }
        busy = true;
        int request = generation;
        try
        {
            var result = await anchors.TryAddAnchorAsync(hits[0].pose);
            if (!result.status.IsSuccess()) { notice = "Anchor unavailable"; return; }
            if (request != generation) { Destroy(result.value.gameObject); return; }
            table.SetParent(null, true);
            if (anchor != null) Destroy(anchor.gameObject);
            anchor = result.value;
            table.SetParent(anchor.transform, false);
            table.localPosition = Vector3.zero;
            table.localRotation = Quaternion.Euler(0, view.transform.eulerAngles.y-anchor.transform.eulerAngles.y, 0);
            table.gameObject.SetActive(true);
            placing = false;
            notice = "";
            planes.enabled = false;
        }
        catch (System.Exception error) { notice = "Placement failed"; Debug.LogException(error); }
        finally { busy = false; }
    }

    void OnGUI()
    {
        if (font == null) return;
        GUI.skin.font = font;
        float scale = Screen.width/390f;
        GUI.matrix = Matrix4x4.Scale(new Vector3(scale,scale,1));
        float bottom = (Screen.height-Screen.safeArea.yMin)/scale-68;
        GUI.skin.button.fontSize = 20;
        GUI.skin.label.fontSize = 20;
        float top = (Screen.height-Screen.safeArea.yMax)/scale+12;
        GUI.skin.label.wordWrap = true;
        GUI.Label(new Rect(16,top,358,60), status);
        // Номер сборки — чтобы с телефона было видно, какая стоит.
        GUI.skin.label.fontSize = 11;
        GUI.Label(new Rect(250,bottom+50,130,20), "сборка " + Application.version);
        GUI.skin.label.fontSize = 20;
        if (GUI.Button(new Rect(12,bottom,108,48), ar ? "Table" : "AR")) ChangeMode();
        if (ar)
        {
            GUI.Label(new Rect(16,top+30,358,60),
                notice.Length > 0 ? notice : ARSession.state == ARSessionState.SessionTracking ? (placing ? "Наведи крестик на стол или пол" : "") : "Камера запускается…");
            if (placing) GUI.Label(new Rect(184,Screen.height/scale*.5f-16,32,32), "+");
            GUI.enabled = !busy;
            if (GUI.Button(new Rect(132,bottom,246,48), placing ? "Place table" : "Reposition"))
            {
                if (placing) Place();
                else { placing = true; planes.enabled = true; }
            }
            GUI.enabled = true;
        }
        else
        {
            if (GUI.Button(new Rect(132,bottom,112,48), "Closer")) { distance = Mathf.Max(.65f,distance-.15f); Orbit(); }
            if (GUI.Button(new Rect(256,bottom,122,48), "Further")) { distance = Mathf.Min(3,distance+.15f); Orbit(); }
        }
    }
}
