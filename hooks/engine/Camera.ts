import { Matrix4, Vector3 } from "math.gl";
import Transform from "./Transform";

export default class Camera {
  private _fov: number; // in degrees
  private _aspect: number;
  private _near: number;
  private _far: number;
  private static readonly DEFAULT_FOV = 60;
  private static readonly DEFAULT_ASPECT = 16 / 9;
  private static readonly DEFAULT_NEAR = 0.1;
  private static readonly DEFAULT_FAR = 1000;
  public static ASPECT_RATIO = this.DEFAULT_ASPECT;

  private _transform: Transform = new Transform();

  private static readonly WORLD_UP: Vector3 = new Vector3(0, 1, 0);

  private _camera_type: "perspective" | "orthographic" = "perspective";

  private static _main: Camera | null = null;
  constructor(
    fov?: number,
    aspect?: number,
    near?: number,
    far?: number,
    transform?: Transform,
    camera_type: "perspective" | "orthographic" = "perspective"
  ) {
    this._fov = fov ? fov : Camera.DEFAULT_FOV;
    this._aspect = aspect ? aspect : Camera.ASPECT_RATIO;
    this._near = near ? near : Camera.DEFAULT_NEAR;
    this._far = far ? far : Camera.DEFAULT_FAR;
    this._camera_type = camera_type;

    if (Camera._main === null) {
      Camera._main = this;
    }

    if (transform) {
      this._transform = transform;
    }
  }

  public static set aspect_ratio(ratio: number) {
    Camera.ASPECT_RATIO = ratio;
  }

  private get _viewMatrix() {
    // Compute view matrix based on position and Euler rotation (degrees)
    // We'll interpret rotation as Euler angles in degrees: [pitch (X), yaw (Y), roll (Z)].
    const DEG2RAD = Math.PI / 180.0;
    const pitch = this.transform.rot[0] * DEG2RAD;
    const yaw = this.transform.rot[1] * DEG2RAD;
    // Compute forward direction from yaw/pitch
    const cp = Math.cos(pitch);
    const forward = new Vector3(
      Math.cos(yaw) * cp,
      Math.sin(pitch),
      Math.sin(yaw) * cp
    );

    const eye = this.transform.pos.toArray
      ? this.transform.pos.toArray()
      : [this.transform.pos.x, this.transform.pos.y, this.transform.pos.z];
    const center = [eye[0] + forward.x, eye[1] + forward.y, eye[2] + forward.z];
    const up = Camera.WORLD_UP.toArray ? Camera.WORLD_UP.toArray() : [0, 1, 0];

    // Use math.gl Matrix4.lookAt to produce the view matrix
    return new Matrix4().lookAt({ eye, center, up });
  }

  private get _projectionMatrix() {
    if (this._camera_type === "perspective") {
      // math.gl expects fovy in radians
      const fovy = (this._fov * Math.PI) / 180.0;
      return new Matrix4().perspective({
        fovy,
        aspect: this._aspect,
        near: this._near,
        far: this._far,
      });
    } else {
      // Simple orthographic projection centered at origin. We'll choose a default
      // vertical size of 2 units (from -1 to 1) and scale horizontally by aspect.
      const halfHeight = 1.0;
      const halfWidth = this._aspect * halfHeight;
      const left = -halfWidth;
      const right = halfWidth;
      const bottom = -halfHeight;
      const top = halfHeight;
      return new Matrix4().ortho({
        left,
        right,
        bottom,
        top,
        near: this._near,
        far: this._far,
      });
    }
  }

  public static get main() {
    if (this._main === null) {
      throw new Error("Camera: no main camera set");
    }
    return this._main;
  }

  public static set main(cam: Camera) {
    this._main = cam;
  }

  public get fov() {
    return this._fov;
  }

  public get aspect() {
    return this._aspect;
  }

  public get near() {
    return this._near;
  }

  public get far() {
    return this._far;
  }

  public get transform() {
    return this._transform;
  }

  public get viewMatrix() {
    return this._viewMatrix;
  }

  public get projectionMatrix() {
    return this._projectionMatrix;
  }
}
