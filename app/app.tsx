import Camera from "@/hooks/engine/Camera";
import DataManager from "@/hooks/engine/DataManager";
import GameObj from "@/hooks/engine/GameObj";
import Model from "@/hooks/engine/Model";
import ModelManager from "@/hooks/engine/ModelManager";
import Scene from "@/hooks/engine/Scene";
import { Shader } from "@/hooks/engine/Shader";
import TextureManager from "@/hooks/engine/Texture";
import Time from "@/hooks/engine/Time";
import Transform from "@/hooks/engine/Transform";
import DefaultScene from "@/hooks/game/DefaultScene";
import Logger from "@/hooks/helpers/logger";
import { ExpoWebGLRenderingContext, GLView } from "expo-gl";
import { Vector3 } from "math.gl";
import React, { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

export default function App() {
  const animationRef = useRef<number | null>(null);
  const [fps, setFps] = useState(0);
  const fpsRef = useRef({ frames: 0, lastTime: Date.now() });

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
    try {
      const ext = gl.getExtension("OES_element_index_uint");

      if (ext == null) {
        throw new Error(
          "OES_element_index_uint not supported. Please use a compatible (more powerful) device."
        );
      }
      const vertex_shader = new Shader(gl, "test", gl.VERTEX_SHADER);
      const fragment_shader = new Shader(gl, "test", gl.FRAGMENT_SHADER);

      const program = await createProgram(gl, vertex_shader, fragment_shader);

      gl.useProgram(program);

      // Enable depth testing so closer fragments occlude farther ones
      gl.enable(gl.DEPTH_TEST);
      // Use less-or-equal so fragments with equal depth still pass (typical for perspective)
      gl.depthFunc(gl.LEQUAL);
      // Ensure depth clear value is 1.0 (farthest)
      gl.clearDepth(1.0);
      // Enable back-face culling to skip rendering triangles facing away from the camera
      gl.enable(gl.CULL_FACE);
      gl.cullFace(gl.BACK);

      console.log("App: about to ModelManager.init");
      ModelManager.init(gl);
      console.log("App: done ModelManager.init");
      console.log("App: about to TextureManager.init");
      await TextureManager.init(gl);
      console.log("App: done TextureManager.init");
      console.log("App: about to DataManager.init");
      DataManager.init(gl);
      console.log("App: done DataManager.init");

      // Bind attributes (interleaved vertex: x,y,z,u,v) -> stride = 5 * 4
      const position_loc = gl.getAttribLocation(program, "a_position");
      const texcoord_loc = gl.getAttribLocation(program, "a_texcoord");
      const id_loc = gl.getAttribLocation(program, "a_instanceID");

      // Cache uniform locations for camera matrices
      const u_view_loc = gl.getUniformLocation(program, "u_view");
      const u_proj_loc = gl.getUniformLocation(program, "u_projection");

      // Reusable buffers for camera matrices to avoid allocating Float32Array each frame
      const _cameraViewBuf = new Float32Array(16);
      const _cameraProjBuf = new Float32Array(16);

      Camera.ASPECT_RATIO = gl.drawingBufferWidth / gl.drawingBufferHeight;

      const VERT_STRIDE = 5 * 4; // bytes

      gl.enableVertexAttribArray(position_loc);
      gl.enableVertexAttribArray(texcoord_loc);
      gl.enableVertexAttribArray(id_loc);

      // Default binding to start of vertex buffer; per-model we will rebind with offsets
      gl.bindBuffer(gl.ARRAY_BUFFER, ModelManager.getVBO());
      gl.vertexAttribPointer(position_loc, 3, gl.FLOAT, false, VERT_STRIDE, 0);
      gl.vertexAttribPointer(
        texcoord_loc,
        2,
        gl.FLOAT,
        false,
        VERT_STRIDE,
        3 * 4
      );

      // ID attribute uses separate buffer (VBOIDs)
      gl.bindBuffer(gl.ARRAY_BUFFER, ModelManager.getVBOIDs());
      gl.vertexAttribPointer(id_loc, 1, gl.FLOAT, false, 1 * 4, 0);

      Scene.active_scene = new DefaultScene();

      Time.updateDeltaTime();

      function render() {
        Time.updateDeltaTime();

        Scene.EarlyUpdate();
        Scene.Update();
        Scene.LateUpdate();

        gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
        gl.clearColor(0, 0, 0, 1);
        // Clear both color and depth each frame
        gl.clearDepth(1.0);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        DataManager.updateBuffers(program);

        // Upload camera matrices each frame (as plain uniforms)
        if (u_view_loc) {
          const vm = Camera.main.viewMatrix.toArray
            ? Camera.main.viewMatrix.toArray()
            : Camera.main.viewMatrix;
          // reuse the same Float32Array instance and copy values into it
          _cameraViewBuf.set(vm as any);
          gl.uniformMatrix4fv(u_view_loc, false, _cameraViewBuf);
        }
        if (u_proj_loc) {
          const pm = Camera.main.projectionMatrix.toArray
            ? Camera.main.projectionMatrix.toArray()
            : Camera.main.projectionMatrix;
          _cameraProjBuf.set(pm as any);
          gl.uniformMatrix4fv(u_proj_loc, false, _cameraProjBuf);
        }

        // FPS counting: increment frames and report once per second
        fpsRef.current.frames += 1;
        const now = Date.now();
        const elapsed = now - fpsRef.current.lastTime;
        if (elapsed >= 1000) {
          const fpsVal = Math.round((fpsRef.current.frames * 1000) / elapsed);
          setFps(fpsVal);
          console.log(`FPS: ${fpsVal}`);
          fpsRef.current.frames = 0;
          fpsRef.current.lastTime = now;
        }

        DataManager.objects.forEach((v, k) => {
          // Minimal per-model logging to avoid flooding Metro output
          // console.log(k);
          // console.log(v);
          const modelData = ModelManager.getModelData(k);
          if (!modelData) throw Error("NOOOO");

          // Skip models that currently have zero instances (preloaded but unused)
          if (ModelManager.getInstanceCount(k) === 0) return;

          // Bind vertex buffer before setting attribute pointers
          gl.bindBuffer(gl.ARRAY_BUFFER, ModelManager.getVBO());
          gl.vertexAttribPointer(
            position_loc,
            3,
            gl.FLOAT,
            false,
            VERT_STRIDE,
            modelData.vertStart * 4
          );
          gl.vertexAttribPointer(
            texcoord_loc,
            2,
            gl.FLOAT,
            false,
            VERT_STRIDE,
            (modelData.vertStart + 3) * 4
          );

          // Bind IDs buffer before pointer setup
          gl.bindBuffer(gl.ARRAY_BUFFER, ModelManager.getVBOIDs());
          gl.vertexAttribPointer(
            id_loc,
            1,
            gl.FLOAT,
            false,
            1 * 4,
            modelData.instanceOffset * 4
          );

          // Debug info (commented out to reduce log noise). Enable if necessary:
          // console.log("----- App logs ------");
          // console.log(ModelManager.getIndicesLength(k));
          // console.log(ModelManager.getInstanceCount(k));
          // console.log(ModelManager.getInstanceOffset(k));

          // Bind atlas and set atlas uniforms for this model
          const meta = (TextureManager as any).getMeta(k);
          const atlasSize = TextureManager.getAtlasSize();
          // bind atlas to texture unit 1
          TextureManager.bindAtlas(gl, 1);
          const u_atlas_loc = gl.getUniformLocation(program, "u_atlas");
          if (u_atlas_loc) gl.uniform1i(u_atlas_loc, 1);
          const u_texOffset = gl.getUniformLocation(program, "u_texOffset");
          const u_texSize = gl.getUniformLocation(program, "u_texSize");
          const u_atlasSize = gl.getUniformLocation(program, "u_atlasSize");
          if (u_texOffset) gl.uniform2f(u_texOffset, meta.x, meta.y);
          if (u_texSize) gl.uniform2f(u_texSize, meta.width, meta.height);
          if (u_atlasSize)
            gl.uniform2f(u_atlasSize, atlasSize.width, atlasSize.height);

          // Ensure EBO is bound; drawElements offset is in bytes
          gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ModelManager.getEBO());
          gl.drawElements(
            gl.TRIANGLES,
            ModelManager.getIndicesLength(k) * ModelManager.getInstanceCount(k),
            gl.UNSIGNED_INT,
            ModelManager.getInstanceOffset(k) * 4
          );
        });

        gl.endFrameEXP(); // Important: tells GLView to display the frame
        animationRef.current = requestAnimationFrame(render);
      }

      render();
    } catch (err) {
      console.error(err);
    }
  }

  useEffect(() => {
    return () => cancelAnimationFrame(animationRef.current!);
  }, []);

  const styles = StyleSheet.create({
    fpsContainer: {
      position: "absolute",
      top: 8,
      left: 8,
      backgroundColor: "rgba(0,0,0,0.5)",
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 6,
    },
    fpsText: {
      color: "white",
      fontSize: 12,
      fontWeight: "600",
    },
  });

  return (
    <View style={{ flex: 1, backgroundColor: "black" }}>
      <GLView style={{ flex: 1 }} onContextCreate={onContextCreate} />
      <View style={styles.fpsContainer} pointerEvents="none">
        <Text style={styles.fpsText}>{fps} FPS</Text>
      </View>
    </View>
  );
}
