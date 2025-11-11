attribute vec3 a_position;
attribute vec2 a_texcoord;
attribute float a_instanceID;

uniform sampler2D u_transformsTex;
uniform float u_numInstances;

// Camera matrices
uniform mat4 u_view;
uniform mat4 u_projection;

// atlas & texture uniforms (set per-draw)
uniform vec2 u_texOffset; // in pixels
uniform vec2 u_texSize; // in pixels
uniform vec2 u_atlasSize; // in pixels

varying vec2 v_uv;

mat4 getMatrix(float id) {
    float v = (id + 0.5) / u_numInstances;
    vec4 r0 = texture2D(u_transformsTex, vec2(0.125, v));
    vec4 r1 = texture2D(u_transformsTex, vec2(0.375, v));
    vec4 r2 = texture2D(u_transformsTex, vec2(0.625, v));
    vec4 r3 = texture2D(u_transformsTex, vec2(0.875, v));
    return mat4(r0, r1, r2, r3);
}

void main() {
  mat4 model = getMatrix(a_instanceID);
  // Apply camera view/projection
  gl_Position = u_projection * u_view * model * vec4(a_position, 1.0);

  // remap local texcoord (0..1) into atlas pixel space and then to atlas UVs
  vec2 uv_pixels = a_texcoord * u_texSize + u_texOffset;
  v_uv = uv_pixels / u_atlasSize;
}