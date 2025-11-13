attribute vec3 a_position;
attribute vec2 a_texcoord;
attribute float a_instanceID;

uniform sampler2D u_transformsTex;
uniform float u_numInstances;
uniform int u_transformsAreBytes; // 0 = floats, 1 = packed unsigned bytes
uniform float u_transformScale; // scale used when packing floats into bytes

// Camera matrices
uniform mat4 u_view;
uniform mat4 u_projection;

// atlas & texture uniforms (set per-draw)
uniform vec2 u_texOffset; // in pixels
uniform vec2 u_texSize; // in pixels
uniform vec2 u_atlasSize; // in pixels

varying vec2 v_uv;
varying vec3 v_pos;

mat4 getMatrix(float id) {
  // If number of instances is zero (or unsupported), return identity matrix.
  if (u_numInstances <= 0.5) {
    return mat4(1.0);
  }
  float v = (id + 0.5) / u_numInstances;
  vec4 r0 = texture2D(u_transformsTex, vec2(0.125, v));
  vec4 r1 = texture2D(u_transformsTex, vec2(0.375, v));
  vec4 r2 = texture2D(u_transformsTex, vec2(0.625, v));
  vec4 r3 = texture2D(u_transformsTex, vec2(0.875, v));
  if (u_transformsAreBytes == 1) {
    // decode normalized bytes back into floats in range [-u_transformScale, u_transformScale]
    vec4 d0 = (r0 * 2.0 - 1.0) * u_transformScale;
    vec4 d1 = (r1 * 2.0 - 1.0) * u_transformScale;
    vec4 d2 = (r2 * 2.0 - 1.0) * u_transformScale;
    vec4 d3 = (r3 * 2.0 - 1.0) * u_transformScale;
    return mat4(d0, d1, d2, d3);
  }
  return mat4(r0, r1, r2, r3);
}

void main() {
  mat4 model = getMatrix(a_instanceID);
  // Apply camera view/projection
  gl_Position = u_projection * u_view * model * vec4(a_position, 1.0);

  // expose position in world space to fragment shader for debug coloring
  v_pos = (model * vec4(a_position, 1.0)).xyz;

  // remap local texcoord (0..1) into atlas pixel space and then to atlas UVs
  vec2 uv_pixels = a_texcoord * u_texSize + u_texOffset;
  v_uv = uv_pixels / u_atlasSize;
}