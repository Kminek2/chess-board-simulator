precision mediump float;
varying vec2 v_uv;
uniform sampler2D u_atlas;

void main() {
  vec4 col = texture2D(u_atlas, v_uv);
  gl_FragColor = col;
}