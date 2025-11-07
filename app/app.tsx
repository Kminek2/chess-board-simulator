import Model from "@/hooks/engine/Model";
import ModelManager from "@/hooks/engine/ModelManager";
import { Shader } from "@/hooks/engine/Shader";
import { ExpoWebGLRenderingContext, GLView } from "expo-gl";
import React, { useEffect, useRef } from "react";
import { View } from "react-native";

export default function App() {
  const animationRef = useRef<number | null>(null);

  async function createProgram(
    gl: ExpoWebGLRenderingContext,
    vertex_shader: Shader,
    fragment_shader: Shader
  ) {
    const vertex_shader_compilation = vertex_shader.compile();
    const fragment_shader_compilation = fragment_shader.compile();
    const program = gl.createProgram()!;

    const compiled_vertex = await vertex_shader_compilation;
    if (compiled_vertex == null)
      throw Error("Vertex shader compilation failed");
    gl.attachShader(program, compiled_vertex);

    const compiled_fragment = await fragment_shader_compilation;
    if (compiled_fragment == null)
      throw Error("Fragment shader compilation failed");
    gl.attachShader(program, compiled_fragment);
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
    const vertex_shader = new Shader(gl, "test", gl.VERTEX_SHADER);
    const fragment_shader = new Shader(gl, "test", gl.FRAGMENT_SHADER);

    const program = await createProgram(gl, vertex_shader, fragment_shader);

    gl.useProgram(program);

    ModelManager.init(gl);
    ModelManager.addModel(new Model("test"));
    const testModel = new Model("test");

    // Bind attribute
    const positionLoc = gl.getAttribLocation(program, "a_position");
    gl.enableVertexAttribArray(positionLoc);
    gl.vertexAttribPointer(positionLoc, 3, gl.FLOAT, false, 3 * 4, 0);
    const angleLoc = gl.getUniformLocation(program, "u_angle");

    let angle = 0;

    function render() {
      //angle += 0.02;

      gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);

      gl.uniform1f(angleLoc, angle);
      gl.drawElements(
        gl.TRIANGLES,
        ModelManager.getIndicesLength(),
        gl.UNSIGNED_INT,
        0
      );

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
