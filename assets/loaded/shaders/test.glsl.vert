attribute vec3 a_position;
      uniform float u_angle;
      void main() {
        float cosA = cos(u_angle);
        float sinA = sin(u_angle);
        gl_Position = vec4(
          a_position.x * cosA - a_position.y * sinA,
          a_position.x * sinA + a_position.y * cosA,
          a_position.z, 1.0
        );
      }