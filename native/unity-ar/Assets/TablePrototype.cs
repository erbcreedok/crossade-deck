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
    static Mesh cube;
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
        MakeTable();
        Orbit();
    }

    void SetComponents(bool enabled)
    {
        cameraManager.enabled = background.enabled = poseDriver.enabled = enabled;
        planes.enabled = rays.enabled = anchors.enabled = enabled;
    }

    void MakeTable()
    {
        Box("Felt", new Vector3(0, -.025f, 0), new Vector3(.85f, .045f, 1.15f), new Color(.07f,.34f,.25f));
        for (int i = 0; i < 7; i++)
            Card(new Vector3((i-3)*.072f, .008f, -.38f), i%2 == 0, i+6);
        for (int i = 0; i < 4; i++)
            Card(new Vector3((i%2-.5f)*.12f, .008f+i*.001f, (i/2-.5f)*.17f), i%2 == 0, i+7);
        Box("Deck", new Vector3(.28f,.025f,.36f), new Vector3(.064f,.05f,.09f), new Color(.65f,.12f,.18f));
    }

    void Card(Vector3 at, bool red, int rank)
    {
        Box("Card", at, new Vector3(.064f,.002f,.09f), Color.white);
        var label = new GameObject("Rank").AddComponent<TextMesh>();
        label.transform.SetParent(table, false);
        label.transform.localPosition = at + Vector3.up*.002f;
        label.transform.localRotation = Quaternion.Euler(90,0,0);
        label.anchor = TextAnchor.MiddleCenter;
        label.characterSize = .013f;
        label.fontSize = 48;
        label.text = rank <= 10 ? rank.ToString() : "J";
        label.color = red ? new Color(.7f,.06f,.12f) : Color.black;
        if (font != null) { label.font = font; label.GetComponent<Renderer>().sharedMaterial = font.material; }
        else label.gameObject.SetActive(false);
    }

    void Box(string name, Vector3 at, Vector3 size, Color color)
    {
        // A bare mesh, not CreatePrimitive: that one adds a BoxCollider, and physics is stripped from the build.
        var obj = new GameObject(name);
        obj.transform.SetParent(table, false);
        obj.transform.localPosition = at;
        obj.transform.localScale = size;
        obj.AddComponent<MeshFilter>().sharedMesh = cube ??= Resources.GetBuiltinResource<Mesh>("Cube.fbx");
        var material = new Material(Shader.Find("Unlit/Color"));
        material.color = color;
        obj.AddComponent<MeshRenderer>().sharedMaterial = material;
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

    void Update()
    {
        if (ar || !Input.GetMouseButton(0) || Input.mousePosition.y < Screen.height*.18f) return;
        yaw += Input.GetAxis("Mouse X")*3;
        pitch = Mathf.Clamp(pitch-Input.GetAxis("Mouse Y")*3,15,85);
        Orbit();
    }

    async void Place()
    {
        if (busy || ARSession.state != ARSessionState.SessionTracking) return;
        if (!rays.Raycast(new Vector2(Screen.width*.5f, Screen.height*.5f), hits, TrackableType.PlaneWithinPolygon))
        { notice = "No surface"; return; }
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
        if (GUI.Button(new Rect(12,bottom,108,48), ar ? "Table" : "AR")) ChangeMode();
        if (ar)
        {
            GUI.Label(new Rect(16,(Screen.height-Screen.safeArea.yMax)/scale+12,358,60),
                notice.Length > 0 ? notice : ARSession.state == ARSessionState.SessionTracking ? (placing ? "Surface" : "Tracking") : ARSession.state.ToString());
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
