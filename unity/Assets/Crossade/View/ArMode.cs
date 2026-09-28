// AR — стол в комнате. Способ смотреть, а не игра: всё остальное — карты, рука, жесты, окна — то же самое,
// меняется только камера (ARKit вместо пальцевой) и где стоит стол.
//
//   вход      — кнопка справа сверху; в AR на её месте выход (как у веба);
//   стол      — встаёт на первую поверхность под взглядом (найденную или оценённую ARKit); не видно ни
//               одной за полторы секунды — на полметра вперёд и ниже глаза. Держится якорем;
//   размер    — настоящий: карта шириной 6,3 см; щипок двумя пальцами — крупнее, мельче;
//   палец     — по пустому сукну двигает сам стол по его плоскости;
//   ходьба    — ногами: камера — это телефон.

using System;
using Unity.XR.CoreUtils;
using UnityEngine;
using UnityEngine.XR.ARFoundation;
using UnityEngine.XR.ARSubsystems;
using System.Collections.Generic;

namespace Crossade.View
{
    public sealed class ArMode : MonoBehaviour
    {
        /** Метров в единице стола (ширине карты): настоящая карта. */
        public const float Unit = .063f;
        const float MIN_SIZE = .5f, MAX_SIZE = 3f;
        /** Сколько ждать поверхность, прежде чем поставить стол перед собой. */
        const float WAIT_S = 1.5f;

        public bool On { get; private set; }
        public Camera Cam { get; private set; }
        /** Стол стоит в комнате. */
        public bool Placed { get; private set; }
        public event Action<bool> Switched;
        public event Action<string> Says;

        ARSession session;
        GameObject originObject;
        ARRaycastManager rays;
        ARAnchorManager anchors;
        ARPlaneManager planes;
        ARAnchor anchor;
        Board board;
        float trackingSince = -1, size = 1;
        bool busy;
        int generation;
        readonly List<ARRaycastHit> hits = new();

        /** AR есть там, где есть ARKit: на телефоне. В редакторе и на компьютере — нет. */
        public static bool Supported => Application.platform == RuntimePlatform.IPhonePlayer;

        public static ArMode Make(Board board)
        {
            var ar = new GameObject("AR").AddComponent<ArMode>();
            ar.board = board;
            return ar;
        }

        void Build()
        {
            if (session != null) return;
            var sessionObject = new GameObject("AR Session");
            sessionObject.transform.SetParent(transform, false);
            sessionObject.SetActive(false);
            session = sessionObject.AddComponent<ARSession>();
            sessionObject.AddComponent<ARInputManager>();

            originObject = new GameObject("XR Origin");
            originObject.transform.SetParent(transform, false);
            originObject.SetActive(false);
            var origin = originObject.AddComponent<XROrigin>();
            var offset = new GameObject("Camera Offset");
            offset.transform.SetParent(origin.transform, false);
            var camObject = new GameObject("AR Camera");
            camObject.transform.SetParent(offset.transform, false);
            Cam = camObject.AddComponent<Camera>();
            Cam.nearClipPlane = .02f;
            Cam.farClipPlane = 30;
            Cam.clearFlags = CameraClearFlags.SolidColor;
            Cam.backgroundColor = Color.black;
            origin.Camera = Cam;
            origin.CameraFloorOffsetObject = offset;
            origin.RequestedTrackingOriginMode = XROrigin.TrackingOriginMode.Device;
            camObject.AddComponent<ARCameraManager>();
            camObject.AddComponent<ARCameraBackground>();
            camObject.AddComponent<ARPoseDriver>();
            planes = originObject.AddComponent<ARPlaneManager>();
            planes.requestedDetectionMode = PlaneDetectionMode.Horizontal;
            rays = originObject.AddComponent<ARRaycastManager>();
            anchors = originObject.AddComponent<ARAnchorManager>();
            sessionObject.SetActive(true);
        }

        public void Enter()
        {
            if (On || !Supported) return;
            Build();
            generation++;
            On = true;
            Placed = false;
            trackingSince = -1;
            originObject.SetActive(true);
            session.enabled = true;
            planes.enabled = true;
            Cam.gameObject.tag = "MainCamera";
            // Пока стол не встал — его не видно: висел бы в темноте на месте обычного вида.
            board.gameObject.SetActive(false);
            board.Room(false);
            Switched?.Invoke(true);
            Says?.Invoke("Наведи телефон на стол или пол");
        }

        public void Exit()
        {
            if (!On) return;
            generation++;
            On = false;
            Placed = false;
            if (anchor != null) Destroy(anchor.gameObject);
            anchor = null;
            board.transform.SetParent(null, false);
            board.transform.SetPositionAndRotation(Vector3.zero, Quaternion.identity);
            board.transform.localScale = Vector3.one;
            board.gameObject.SetActive(true);
            board.Room(true);
            session.enabled = false;
            originObject.SetActive(false);
            Cam.gameObject.tag = "Untagged";
            Switched?.Invoke(false);
        }

        void Update()
        {
            if (!On || Placed || busy) return;
            if (ARSession.state != ARSessionState.SessionTracking)
            {
                trackingSince = -1;
                return;
            }
            if (trackingSince < 0) trackingSince = Time.realtimeSinceStartup;
            var centre = new Vector2(Cam.pixelWidth * .5f, Cam.pixelHeight * .55f);
            if (rays.Raycast(centre, hits, TrackableType.PlaneWithinPolygon) || rays.Raycast(centre, hits, TrackableType.PlaneEstimated))
            {
                Place(hits[0].pose);
                return;
            }
            if (Time.realtimeSinceStartup - trackingSince < WAIT_S) return;
            // Поверхности не видно — перед собой: полметра вперёд по курсу, сорок сантиметров ниже глаза.
            var eye = Cam.transform;
            var ahead = Vector3.ProjectOnPlane(eye.forward, Vector3.up);
            if (ahead.sqrMagnitude < 1e-4f) ahead = Vector3.ProjectOnPlane(eye.up, Vector3.up);
            Place(new Pose(eye.position + ahead.normalized * .5f + Vector3.down * .4f, Quaternion.identity));
        }

        async void Place(Pose at)
        {
            busy = true;
            var request = generation;
            try
            {
                var result = await anchors.TryAddAnchorAsync(at);
                if (request != generation || !On)
                {
                    if (result.status.IsSuccess()) Destroy(result.value.gameObject);
                    return;
                }
                if (!result.status.IsSuccess())
                {
                    Says?.Invoke("Не вышло закрепить стол — поводи телефоном");
                    return;
                }
                anchor = result.value;
                board.transform.SetParent(anchor.transform, false);
                board.transform.localPosition = Vector3.zero;
                // Мой стул — ко мне: север стола смотрит туда же, куда телефон.
                var ahead = Vector3.ProjectOnPlane(Cam.transform.forward, Vector3.up);
                if (ahead.sqrMagnitude < 1e-4f) ahead = Vector3.ProjectOnPlane(Cam.transform.up, Vector3.up);
                board.transform.rotation = Quaternion.LookRotation(ahead.normalized, Vector3.up);
                board.transform.localScale = Vector3.one * Unit * size;
                board.gameObject.SetActive(true);
                planes.enabled = false;
                foreach (var plane in planes.trackables) plane.gameObject.SetActive(false);
                Placed = true;
                Says?.Invoke("");
            }
            catch (Exception e)
            {
                Debug.LogException(e);
                Says?.Invoke("Не вышло поставить стол");
            }
            finally
            {
                busy = false;
            }
        }

        /** Палец по сукну: стол едет за ним по своей плоскости — из точки `a` экрана в точку `b`. */
        public void Drag(Vector2 a, Vector2 b)
        {
            if (!Placed) return;
            var plane = new Plane(board.transform.up, board.transform.position);
            var ra = Cam.ScreenPointToRay(a);
            var rb = Cam.ScreenPointToRay(b);
            if (!plane.Raycast(ra, out var da) || !plane.Raycast(rb, out var db)) return;
            board.transform.position += rb.GetPoint(db) - ra.GetPoint(da);
        }

        /** Щипок: стол крупнее или мельче, от половины настоящего до трёх. */
        public void Scale(float by)
        {
            size = Mathf.Clamp(size * by, MIN_SIZE, MAX_SIZE);
            if (Placed) board.transform.localScale = Vector3.one * Unit * size;
        }
    }
}
