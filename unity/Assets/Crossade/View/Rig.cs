// КАМЕРА — глаз над своим стулом. Смотрит на середину стола; палец её вращает, наклоняет и
// приближает, но стол всегда целиком влезает в ширину экрана при первом взгляде.

using UnityEngine;

namespace Crossade.View
{
    public sealed class Rig : MonoBehaviour
    {
        public const float MinPitch = 28, MaxPitch = 89, MinZoom = .45f, MaxZoom = 1.6f;
        /** Наклон: 90 — сверху, меньше — сбоку. */
        public float Pitch = 62;
        /** Поворот вокруг стола, градусы; 0 — со своего стула. */
        public float Yaw;
        public float Zoom = 1;
        public Camera Cam { get; private set; }

        public static Rig Make()
        {
            var rig = new GameObject("Rig").AddComponent<Rig>();
            var cam = new GameObject("Main Camera").AddComponent<Camera>();
            cam.tag = "MainCamera";
            cam.transform.SetParent(rig.transform, false);
            cam.fieldOfView = 50;
            cam.nearClipPlane = .1f;
            cam.farClipPlane = 200;
            cam.clearFlags = CameraClearFlags.SolidColor;
            cam.backgroundColor = View.Look.FeltDark;
            rig.Cam = cam;
            rig.Place();
            return rig;
        }

        /** Расстояние, с которого стол влезает в ширину экрана. */
        float Fit()
        {
            float half = (float)Table.Ring.TableRadius + 1.4f;
            float aspect = Cam.aspect <= 0 ? .46f : Cam.aspect;
            float hfov = 2 * Mathf.Atan(Mathf.Tan(Cam.fieldOfView * Mathf.Deg2Rad / 2) * aspect);
            float byWidth = half / Mathf.Tan(hfov / 2);
            float byHeight = half / Mathf.Tan(Cam.fieldOfView * Mathf.Deg2Rad / 2);
            return Mathf.Max(byWidth, byHeight * .8f);
        }

        public void Place()
        {
            Pitch = Mathf.Clamp(Pitch, MinPitch, MaxPitch);
            Zoom = Mathf.Clamp(Zoom, MinZoom, MaxZoom);
            var dist = Fit() / Zoom;
            var look = Quaternion.Euler(Pitch, Yaw, 0);
            // Середина стола чуть выше середины экрана: низ занимают рука и полоса худа.
            var aim = look * new Vector3(0, -dist * .08f, 0);
            Cam.transform.position = aim - look * Vector3.forward * dist;
            Cam.transform.rotation = look;
        }

        void LateUpdate() => Place();
    }
}
