precision mediump float;
varying vec2 v_uv;
uniform sampler2D u_atlas;

// When set to 1, shader will color fragments by vertex/world position (debug mode)
uniform int u_debugColorByPos;
varying vec3 v_pos;

void main() {
  if (u_debugColorByPos == 1) {
    // map position from roughly [-1,1] to [0,1] for RGB display
    vec3 c = (v_pos * 0.001) + 0.5;
    gl_FragColor = vec4(c, 1.0);
    return;
  }
  vec4 col = texture2D(u_atlas, v_uv);
  gl_FragColor = col;
}