import Camera from "@/hooks/engine/Camera";
import DataManager from "@/hooks/engine/DataManager";
import ModelManager from "@/hooks/engine/ModelManager";
import Scene, { UI_TESTING } from "@/hooks/engine/Scene";
import { Shader } from "@/hooks/engine/Shader";
import TextureManager from "@/hooks/engine/Texture";
import Time from "@/hooks/engine/Time";
import { ExpoWebGLRenderingContext, GLView } from "expo-gl";
import React, { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import Loading from "./(tabs)/Loading";
import GameScene from "./GameScene";

export default function App() {
  const animationRef = useRef<number | null>(null);
  const [fps, setFps] = useState(0);
  const fpsRef = useRef({ frames: 0, lastTime: Date.now() });
  let [_scene, setScene] = useState<GameScene | null>(null);
  const [_loaded, setLoaded] = useState<boolean>(false);
  const [_loadingText, setLoadingText] = useState<string>("Initializing");

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

      setLoadingText("Compiling shaders");
      await new Promise((r) => setTimeout(r, 0));

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

      setLoadingText("Loading models");
      await new Promise((r) => setTimeout(r, 0));

      console.log("App: about to ModelManager.init");
      ModelManager.init(gl);
      console.log("App: done ModelManager.init");

      setLoadingText("Loading textures");
      await new Promise((r) => setTimeout(r, 0));

      console.log("App: about to TextureManager.init");
      await TextureManager.init(gl);
      console.log("App: done TextureManager.init");

      setLoadingText("Loading Object data");
      await new Promise((r) => setTimeout(r, 0));

      console.log("App: about to DataManager.init");
      DataManager.init(gl);
      console.log("App: done DataManager.init");

      setLoadingText("Setting shader data");
      await new Promise((r) => setTimeout(r, 0));
      // Bind attributes (interleaved vertex: x,y,z,u,v) -> stride = 5 * 4
      const position_loc = gl.getAttribLocation(program, "a_position");
      const texcoord_loc = gl.getAttribLocation(program, "a_texcoord");
      const id_loc = gl.getAttribLocation(program, "a_instanceID");

      setLoadingText("Placing camera");
      await new Promise((r) => setTimeout(r, 0));

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

      setLoadingText("Sending data to GPU");
      await new Promise((r) => setTimeout(r, 0));

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

      setLoadingText("Starting main loop");
      await new Promise((r) => setTimeout(r, 0));

      Time.updateDeltaTime();
      setScene(new GameScene());

      function render() {
        Time.updateDeltaTime();

        if (_scene) (_scene as GameScene).update();

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
          const atlasSize = TextureManager.getAtlasSize();
          // bind atlas to texture unit 1
          TextureManager.bindAtlas(gl, 1);
          const u_atlas_loc = gl.getUniformLocation(program, "u_atlas");
          if (u_atlas_loc) gl.uniform1i(u_atlas_loc, 1);
          const u_texOffset = gl.getUniformLocation(program, "u_texOffset");
          const u_texSize = gl.getUniformLocation(program, "u_texSize");
          const u_atlasSize = gl.getUniformLocation(program, "u_atlasSize");

          // If model has submeshes (materials), draw each submesh separately with its own texture meta
          const subs = ModelManager.getSubmeshes(k);
          gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ModelManager.getEBO());
          if (subs && subs.length > 0) {
            for (const s of subs) {
              const texKey = `${k}@${s.name}`;
              const meta =
                (TextureManager as any).getMeta(texKey) ||
                (TextureManager as any).getMeta(k);
              if (u_texOffset) gl.uniform2f(u_texOffset, meta.x, meta.y);
              if (u_texSize) gl.uniform2f(u_texSize, meta.width, meta.height);
              if (u_atlasSize)
                gl.uniform2f(u_atlasSize, atlasSize.width, atlasSize.height);

              const count = s.indexBufferLength || 0;
              // s.indexBufferStart already points to the correct byte offset (in elements) within the shared EBO
              // multiply by 4 to convert to bytes. Do NOT add model_data.indexBufferStart again (would double-offset).
              const offset = (s.indexBufferStart || 0) * 4;
              if (count > 0) {
                gl.drawElements(gl.TRIANGLES, count, gl.UNSIGNED_INT, offset);
              }
            }
          } else {
            // Ensure EBO is bound; drawElements offset is in bytes
            const meta = (TextureManager as any).getMeta(k);
            if (u_texOffset) gl.uniform2f(u_texOffset, meta.x, meta.y);
            if (u_texSize) gl.uniform2f(u_texSize, meta.width, meta.height);
            if (u_atlasSize)
              gl.uniform2f(u_atlasSize, atlasSize.width, atlasSize.height);

            gl.drawElements(
              gl.TRIANGLES,
              ModelManager.getIndicesLength(k) *
                ModelManager.getInstanceCount(k),
              gl.UNSIGNED_INT,
              ModelManager.getInstanceOffset(k) * 4
            );
          }
        });

        gl.endFrameEXP(); // Important: tells GLView to display the frame
        animationRef.current = requestAnimationFrame(render);
      }

      render();
      setLoadingText("Loaded");
      setLoaded(true);
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
      {!UI_TESTING ? (
        <GLView style={{ flex: 1 }} onContextCreate={onContextCreate} />
      ) : _scene ? null : (
        (setScene(new GameScene()) as unknown as null)
      )}

      {UI_TESTING && !_loaded ? (setLoaded(true) as unknown as null) : null}
      <View style={styles.fpsContainer} pointerEvents="none">
        <Text style={styles.fpsText}>{fps} FPS</Text>
      </View>
      {_scene ? _scene && (_scene as GameScene).render() : null}
      {!_loaded && <Loading loadingText={_loadingText} />}
    </View>
  );
}
