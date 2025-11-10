import DataManager from "@/hooks/engine/DataManager";
import GameObj from "@/hooks/engine/GameObj";
import Model from "@/hooks/engine/Model";
import ModelManager from "@/hooks/engine/ModelManager";
import { Shader } from "@/hooks/engine/Shader";
import Transform from "@/hooks/engine/Transform";
import { ExpoWebGLRenderingContext, GLView } from "expo-gl";
import { Vector3 } from "math.gl";
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
    DataManager.init(gl);
    const obj = new GameObj(new Model("test"), new Transform(new Vector3(0, 0, 0), new Vector3(), new Vector3(1, 1, 1)))

    // Bind attribute
    const position_loc = gl.getAttribLocation(program, "a_position");
    gl.enableVertexAttribArray(position_loc);
    gl.vertexAttribPointer(position_loc, 3, gl.FLOAT, false, 3 * 4, 0);

    const id_loc = gl.getAttribLocation(program, "a_instanceID");
    gl.enableVertexAttribArray(id_loc);
    gl.vertexAttribPointer(id_loc, 1, gl.FLOAT, false, 4, 0);

    let angle = 0;

    function render() {
      //angle += 0.02;

      gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);

      DataManager.updateBuffers(program);

      DataManager.objects.forEach((v, k) => {
        console.log(k)
        console.log(v)
        const vertex_off = ModelManager.getModelData(k)?[0]:null;
        if(!vertex_off)
          throw Error("NOOOO")

        gl.enableVertexAttribArray(position_loc);
        gl.vertexAttribPointer(position_loc, 3, gl.FLOAT, false, 3 * 4, vertex_off[0] * 4);

        gl.enableVertexAttribArray(id_loc);
        gl.vertexAttribPointer(id_loc, 1, gl.FLOAT, false, 4, vertex_off[5] * 4);

        console.log("----- App logs ------")
        console.log(ModelManager.getIndicesLength(k))
        console.log(ModelManager.getInstanceCount(k))
        console.log(ModelManager.getInstanceOffset(k))

        gl.drawElements(
          gl.TRIANGLES,
          ModelManager.getIndicesLength(k) * ModelManager.getInstanceCount(k),
          gl.UNSIGNED_INT,
          ModelManager.getInstanceOffset(k)
      );
      })

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
