// Пост-обработка: двумерный «экран» (canvas) → WebGL-шейдер с RGB-расщеплением,
// разрывами строк, блочными сбоями, шумом и строками развёртки.

const VERT = `
attribute vec2 p;
varying vec2 uv;
void main() {
  uv = p * 0.5 + 0.5;
  gl_Position = vec4(p, 0.0, 1.0);
}`;

const FRAG = `
precision mediump float;
varying vec2 uv;
uniform sampler2D tex;
uniform float t;
uniform float g;
uniform vec2 res;

float h(float n) { return fract(sin(n * 91.345) * 43758.5453); }
float h2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

void main() {
  vec2 u = uv;
  float tq = floor(t * 12.0);

  // тонкие разрывы по строкам
  float row = floor(u.y * 28.0);
  float r = h(row + tq * 7.0);
  float tear = step(0.985 - 0.2 * g, r) * (h(row * 3.1 + tq) - 0.5) * (0.06 + 0.3 * g);

  // крупные блоки, съехавшие по горизонтали
  float band = floor(u.y * 6.0);
  tear += step(0.9 - 0.35 * g, h(band + tq * 3.0)) * g * (h(band * 1.7 + tq) - 0.5) * 0.18;

  u.x += tear;
  u.y += (h(tq) - 0.5) * 0.006 * g;

  // RGB-расщепление растёт с интенсивностью и с величиной разрыва
  float split = 0.0012 + g * 0.018 + abs(tear) * 0.15;
  vec3 c;
  c.r = texture2D(tex, vec2(u.x + split, u.y)).r;
  c.g = texture2D(tex, u).g;
  c.b = texture2D(tex, vec2(u.x - split, u.y)).b;

  // повреждённые блоки: инверсия или заливка циан/маджента
  vec2 cell = floor(uv * vec2(36.0, 20.0));
  float bad = step(1.0 - 0.05 * g, h2(cell + tq));
  float pick = h2(cell + tq + 3.0);
  vec3 junk = pick < 0.33 ? vec3(0.0, 0.95, 1.0) : (pick < 0.66 ? vec3(1.0, 0.17, 0.84) : 1.0 - c);
  c = mix(c, junk, bad * 0.85);

  // строки развёртки, шум, виньетка
  c *= 0.93 + 0.07 * sin(uv.y * res.y * 1.4);
  c += (h2(uv * res + t * 60.0) - 0.5) * (0.05 + 0.3 * g);
  vec2 d = uv - 0.5;
  c *= 1.0 - dot(d, d) * 0.55;

  gl_FragColor = vec4(c, 1.0);
}`;

function compile(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(s) || "shader compile failed");
  }
  return s;
}

// Возвращает null, если WebGL недоступен: вызывающий код рисует исходный canvas как есть.
export function createGlitch(canvas) {
  const gl = canvas.getContext("webgl", { antialias: false, alpha: false });
  if (!gl) return null;

  const prog = gl.createProgram();
  gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT));
  gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
  gl.useProgram(prog);

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, "p");
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);

  const uT = gl.getUniformLocation(prog, "t");
  const uG = gl.getUniformLocation(prog, "g");
  const uRes = gl.getUniformLocation(prog, "res");

  return {
    render(source, seconds, intensity) {
      if (canvas.width !== source.width || canvas.height !== source.height) {
        canvas.width = source.width;
        canvas.height = source.height;
      }
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
      gl.uniform1f(uT, seconds);
      gl.uniform1f(uG, intensity);
      gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    },
  };
}
