import { ExpoWebGLRenderingContext, GLView } from "expo-gl";
import React, { useEffect, useRef } from "react";
import { View } from "react-native";

export default function App() {
  const animationRef = useRef<number | null>(null);

  function compileShader(
    gl: ExpoWebGLRenderingContext,
    type: number,
    source: string
  ) {
    const shader = gl.createShader(type)!;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    const success = gl.getShaderParameter(shader, gl.COMPILE_STATUS);
    if (!success) {
      throw new Error(
        gl.getShaderInfoLog(shader) || "Shader compilation failed"
      );
    }
    return shader;
  }

  function createProgram(
    gl: ExpoWebGLRenderingContext,
    vertexShader: any,
    fragmentShader: any
  ) {
    const program = gl.createProgram()!;
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);

    const success = gl.getProgramParameter(program, gl.LINK_STATUS);
    if (!success) {
      throw new Error(
        gl.getProgramInfoLog(program) || "Program linking failed"
      );
    }
    return program;
  }

  async function onContextCreate(gl: ExpoWebGLRenderingContext) {
    const vertexShaderSource = `
      attribute vec2 a_position;
      uniform float u_angle;
      void main() {
        float cosA = cos(u_angle);
        float sinA = sin(u_angle);
        gl_Position = vec4(
          a_position.x * cosA - a_position.y * sinA,
          a_position.x * sinA + a_position.y * cosA,
          0.0, 1.0
        );
      }
    `;

    const fragmentShaderSource = `
      precision mediump float;
      void main() {
        gl_FragColor = vec4(0.0, 1.0, 1.0, 1.0); // Cyan
      }
    `;

    const vertexShader = compileShader(
      gl,
      gl.VERTEX_SHADER,
      vertexShaderSource
    );
    const fragmentShader = compileShader(
      gl,
      gl.FRAGMENT_SHADER,
      fragmentShaderSource
    );
    const program = createProgram(gl, vertexShader, fragmentShader);

    gl.useProgram(program);

    // Triangle vertices
    const vertices = new Float32Array([0.0, 0.5, -0.5, -0.5, 0.5, -0.5]);

    // Create buffer
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

    // Bind attribute
    const positionLoc = gl.getAttribLocation(program, "a_position");
    gl.enableVertexAttribArray(positionLoc);
    gl.vertexAttribPointer(positionLoc, 2, gl.FLOAT, false, 0, 0);

    const angleLoc = gl.getUniformLocation(program, "u_angle");

    let angle = 0;

    function render() {
      angle += 0.02;

      gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);

      gl.uniform1f(angleLoc, angle);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      gl.endFrameEXP(); // Important: tells GLView to display the frame
      animationRef.current = requestAnimationFrame(render);
    }

    render();
  }

  useEffect(() => {
    return () => cancelAnimationFrame(animationRef.current!);
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: "black" }}>
      <GLView style={{ flex: 1 }} onContextCreate={onContextCreate} />
    </View>
  );
}
