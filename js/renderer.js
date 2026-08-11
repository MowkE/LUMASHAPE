/**
 * renderer.js — LUMASHAPE's WebGL2 engine.
 *
 * A bird's eye has four cone types — L, M, S, and UV — so its space of
 * receptor states is a 4D hypercube: a tesseract of color. Ours, missing
 * the UV axis, is one cubic face of it. Every point here is a receptor
 * state (l, m, s, u): the first three axes are the cube you live in, the
 * fourth is the one you don't.
 *
 * The engine renders 4D points and 4D line segments (metamer fibers)
 * through the same shader: rotate in 4D, optionally flatten the UV axis
 * (the "human collapse"), project to 3D, and color each point with its
 * approximate human appearance — plus, when bird vision is on, a
 * false-color iridescent tint carrying the UV signal we can't see.
 */

const VS = `#version 300 es
precision highp float;
in vec4 aLMSU;                // receptor state, each channel 0..1
uniform mat4 uRot4;
uniform mat4 uView;
uniform mat4 uProj;
uniform float uDist4;
uniform float uCollapse;      // 1 = full bird space, 0 = human shadow
uniform float uPointSize;
out vec4 vLMSU;

void main() {
  vec4 p = (aLMSU - 0.5) * 1.5;
  p.w *= uCollapse;           // flatten the UV axis toward the human cube
  p = uRot4 * p;
  float denom = max(uDist4 - p.w, 0.4);
  vec3 p3 = p.xyz * (uDist4 / denom);
  vLMSU = aLMSU;
  vec4 vpos = uView * vec4(p3, 1.0);
  gl_Position = uProj * vpos;
  gl_PointSize = uPointSize * (9.0 / max(-vpos.z, 0.5));
}`;

const FS = `#version 300 es
precision highp float;
in vec4 vLMSU;
uniform float uBirdVision;    // 0 = human rendering, 1 = false-color UV
uniform float uTime;
uniform float uAlpha;
uniform int uIsPoint;
out vec4 fragColor;

// the false color we assign to UV: an iridescent shimmer, because the
// honest answer is that no real color can stand in for it
vec3 uvFalseColor(float u, float t) {
  float a = u * 6.0 + t * 0.6;
  return mix(
    vec3(0.55, 0.35, 1.0),                       // violet
    vec3(0.35, 0.95, 0.85),                      // teal
    0.5 + 0.5 * sin(a));
}

void main() {
  if (uIsPoint == 1) {
    vec2 d = gl_PointCoord - 0.5;
    if (dot(d, d) > 0.25) discard;
  }
  // approximate human appearance of an (l, m, s) cone state
  vec3 human = vec3(vLMSU.x, vLMSU.y, vLMSU.z);
  float u = vLMSU.w;
  vec3 col = mix(human, uvFalseColor(u, uTime), uBirdVision * u * 0.85);
  col *= mix(1.0, 0.55 + 0.85 * u, uBirdVision);  // UV-bright things glow
  fragColor = vec4(col * uAlpha, uAlpha);
}`;

function compile(gl, vsSrc, fsSrc) {
  const make = (type, src) => {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      throw new Error('Shader: ' + gl.getShaderInfoLog(sh));
    }
    return sh;
  };
  const prog = gl.createProgram();
  gl.attachShader(prog, make(gl.VERTEX_SHADER, vsSrc));
  gl.attachShader(prog, make(gl.FRAGMENT_SHADER, fsSrc));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    throw new Error('Link: ' + gl.getProgramInfoLog(prog));
  }
  return prog;
}

export class Renderer {
  constructor(canvas) {
    const gl = canvas.getContext('webgl2', { antialias: true, preserveDrawingBuffer: true, alpha: false });
    if (!gl) throw new Error('no-webgl2');
    this.gl = gl;
    this.canvas = canvas;
    this.prog = compile(gl, VS, FS);

    const makeVao = (buffer) => {
      const vao = gl.createVertexArray();
      gl.bindVertexArray(vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      const loc = gl.getAttribLocation(this.prog, 'aLMSU');
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 4, gl.FLOAT, false, 0, 0);
      gl.bindVertexArray(null);
      return vao;
    };
    this.pointVbo = gl.createBuffer();
    this.pointVao = makeVao(this.pointVbo);
    this.fiberVbo = gl.createBuffer();
    this.fiberVao = makeVao(this.fiberVbo);
    this.nPoints = 0;
    this.nFiberVerts = 0;
  }

  setPoints(data) {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.pointVbo);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    this.nPoints = data.length / 4;
  }

  setFibers(data) {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.fiberVbo);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    this.nFiberVerts = data.length / 4;
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(this.canvas.clientWidth * dpr));
    const h = Math.max(1, Math.round(this.canvas.clientHeight * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
  }

  render(s) {
    const gl = this.gl;
    this.resize();
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0.030, 0.043, 0.038, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);

    gl.useProgram(this.prog);
    const u = (n) => gl.getUniformLocation(this.prog, n);
    gl.uniformMatrix4fv(u('uRot4'), false, s.rot4);
    gl.uniformMatrix4fv(u('uView'), false, s.view);
    gl.uniformMatrix4fv(u('uProj'), false, s.proj);
    gl.uniform1f(u('uDist4'), 3.4);
    gl.uniform1f(u('uCollapse'), s.collapse);
    gl.uniform1f(u('uBirdVision'), s.birdVision);
    gl.uniform1f(u('uTime'), s.time);

    if (s.fibersOn && this.nFiberVerts) {
      gl.uniform1i(u('uIsPoint'), 0);
      gl.uniform1f(u('uAlpha'), 0.30);
      gl.uniform1f(u('uPointSize'), 1);
      gl.bindVertexArray(this.fiberVao);
      gl.drawArrays(gl.LINES, 0, this.nFiberVerts);
    }
    gl.uniform1i(u('uIsPoint'), 1);
    gl.uniform1f(u('uAlpha'), 0.92);
    gl.uniform1f(u('uPointSize'), s.pointSize * (window.devicePixelRatio || 1));
    gl.bindVertexArray(this.pointVao);
    gl.drawArrays(gl.POINTS, 0, this.nPoints);
    gl.bindVertexArray(null);
    gl.disable(gl.BLEND);
  }
}
