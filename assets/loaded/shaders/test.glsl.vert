attribute vec3 a_position;
attribute float a_instanceID;

uniform sampler2D u_transformsTex;
uniform float u_numInstances;

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
  gl_Position = vec4(a_position, 1.0);
}