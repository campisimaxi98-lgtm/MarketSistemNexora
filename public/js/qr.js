/* Encoder QR propio desde cero (modo byte), fiel a ISO/IEC 18004.
   Versiones 1-10, niveles L/M/Q/H, seleccion de mascara por penalidad.
   Navegador -> window.MINIQ ; Node -> require('./public/js/qr.js'). */
(function (root) {
  'use strict';

  var SHIFT = { L: 0, M: 1, Q: 2, H: 3 };

  var ALIGN = { 1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30], 6: [6, 34], 7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50] };

  // version -> por nivel (L,M,Q,H): [cantBloques, bytesDatos, ecPorBloque]
  var ECB = {
    1: [[1, 19, 7], [1, 16, 10], [1, 13, 13], [1, 9, 17]],
    2: [[1, 34, 10], [1, 28, 16], [1, 22, 22], [1, 16, 28]],
    3: [[1, 55, 15], [1, 44, 26], [2, 17, 18], [2, 13, 22]],
    4: [[1, 80, 20], [2, 32, 18], [2, 24, 26], [4, 9, 16]],
    5: [[1, 108, 26], [2, 43, 24], [2, 15, 18], [2, 15, 22]],
    6: [[2, 68, 18], [4, 27, 16], [4, 19, 24], [4, 15, 28]],
    7: [[2, 78, 20], [4, 31, 18], [2, 14, 18], [4, 13, 26]],
    8: [[2, 97, 24], [2, 38, 22], [4, 18, 22], [4, 14, 26]],
    9: [[2, 116, 30], [3, 36, 22], [4, 16, 20], [4, 12, 24]],
    10: [[2, 136, 36], [4, 43, 26], [6, 19, 24], [6, 15, 28]]
  };

  var G15 = 0x537;
  var G15_MASK = 0x5412;
  var G18 = 0x1f25;

  function getBCHDigit(d) { var n = 0; while (d !== 0) { n++; d >>>= 1; } return n; }
  function getBCHRemainder(data, poly) {
    var d = data;
    while (getBCHDigit(d) - getBCHDigit(poly) >= 0) d ^= (poly << (getBCHDigit(d) - getBCHDigit(poly)));
    return d;
  }
  function getBCHTypeInfo(data) { return ((data << 10) | getBCHRemainder(data << 10, G15)) ^ G15_MASK; }
  function getBCHTypeNumber(data) { return (data << 12) | getBCHRemainder(data << 12, G18); }

  // GF(256) mod 0x11d
  var EXP = new Array(256), LOG = new Array(256);
  (function () {
    var v = 1;
    for (var k = 0; k < 256; k++) { EXP[k] = v; v <<= 1; if (v & 0x100) v ^= 0x11d; }
    v = 1;
    for (k = 0; k < 255; k++) { LOG[v] = k; v <<= 1; if (v & 0x100) v ^= 0x11d; }
  })();
  function gfMul(a, b) { return a === 0 || b === 0 ? 0 : EXP[(LOG[a] + LOG[b]) % 255]; }

  // polinomio generador prod (x + alpha^i)
  function rsGen(deg) {
    var poly = [1];
    for (var i = 0; i < deg; i++) {
      var g = [1, EXP[i]];
      var next = new Array(poly.length + 1).fill(0);
      for (var k = 0; k < poly.length; k++) {
        for (var j = 0; j < 2; j++) next[k + j] ^= gfMul(poly[k], g[j]);
      }
      poly = next;
    }
    return poly;
  }

  function rsRemainder(data, ecBytes) {
    var gen = rsGen(ecBytes);
    var resto = new Array(ecBytes).fill(0);
    for (var i = 0; i < data.length; i++) {
      var factor = data[i] ^ resto[0];
      for (var j = 0; j < ecBytes - 1; j++) resto[j] = resto[j + 1];
      resto[ecBytes - 1] = 0;
      for (j = 0; j < ecBytes; j++) resto[j] ^= gfMul(gen[j + 1], factor);
    }
    return resto.map(function (x) { return x & 0xff; });
  }

  var maskFuncs = [
    function (i, j) { return (i + j) % 2 === 0; },
    function (i, j) { return i % 2 === 0; },
    function (i, j) { return j % 3 === 0; },
    function (i, j) { return (i + j) % 3 === 0; },
    function (i, j) { return (Math.floor(i / 2) + Math.floor(j / 3)) % 2 === 0; },
    function (i, j) { return ((i * j) % 2) + ((i * j) % 3) === 0; },
    function (i, j) { return (((i * j) % 2) + ((i * j) % 3)) % 2 === 0; },
    function (i, j) { return (((i * j) % 3) + ((i + j) % 2)) % 2 === 0; }
  ];

  function lostPoint(mod, size) {
    var score = 0, i, j, k;
    for (i = 0; i < size; i++) {
      var runColor = mod[i][0], runCount = 1;
      for (j = 1; j < size; j++) {
        if (mod[i][j] === runColor) { runCount++; }
        else { if (runCount >= 5) score += 3 + runCount - 5; runColor = mod[i][j]; runCount = 1; }
      }
      if (runCount >= 5) score += 3 + runCount - 5;
    }
    for (j = 0; j < size; j++) {
      runColor = mod[0][j]; runCount = 1;
      for (i = 1; i < size; i++) {
        if (mod[i][j] === runColor) { runCount++; }
        else { if (runCount >= 5) score += 3 + runCount - 5; runColor = mod[i][j]; runCount = 1; }
      }
      if (runCount >= 5) score += 3 + runCount - 5;
    }
    for (i = 0; i < size - 1; i++) {
      for (j = 0; j < size - 1; j++) {
        var col = mod[i][j];
        if (col === mod[i + 1][j] && col === mod[i][j + 1] && col === mod[i + 1][j + 1]) score += 3;
      }
    }
    var next1 = [true, false, true, true, true, false, true];
    var next2 = [true, true, true, false, true, false, true];
    for (i = 0; i < size; i++) {
      for (j = 0; j <= size - 7; j++) {
        var m1 = true, m2 = true;
        for (k = 0; k < 7; k++) { if (mod[i][j + k] !== next1[k]) m1 = false; if (mod[j + k][i] !== next1[k]) m2 = false; }
        if (!m1) { m1 = true; for (k = 0; k < 7; k++) if (mod[i][j + k] !== next2[k]) m1 = false; }
        if (!m2) { m2 = true; for (k = 0; k < 7; k++) if (mod[j + k][i] !== next2[k]) m2 = false; }
        if (m1) score += 40;
        if (m2) score += 40;
      }
    }
    var dark = 0;
    for (i = 0; i < size; i++) for (j = 0; j < size; j++) if (mod[i][j]) dark++;
    var pct = Math.round((dark * 100) / (size * size));
    var prev = Math.abs(Math.floor(pct / 5) * 5 - 50) / 5;
    var next = Math.abs(Math.ceil(pct / 5) * 5 - 50) / 5;
    score += Math.min(prev, next) * 10;
    return score;
  }

  function makeMatrix(type, mask, codewords, fmtEcl) {
    var size = type * 4 + 17;
    var mod = Array.from({ length: size }, function () { return new Array(size).fill(null); });
    if (fmtEcl === undefined) fmtEcl = 1; // valor de formato para nivel L

    function probe(r, c) {
      for (var rr = -1; rr <= 7; rr++) {
        if (r + rr < 0 || size <= r + rr) continue;
        for (var cc = -1; cc <= 7; cc++) {
          if (c + cc < 0 || size <= c + cc) continue;
          var dark = (rr >= 0 && rr <= 6 && (cc === 0 || cc === 6)) || (cc >= 0 && cc <= 6 && (rr === 0 || rr === 6)) || (rr >= 2 && rr <= 4 && cc >= 2 && cc <= 4);
          mod[r + rr][c + cc] = dark;
        }
      }
    }
    probe(0, 0); probe(size - 7, 0); probe(0, size - 7);

    var pos = ALIGN[type];
    for (var a = 0; a < pos.length; a++) {
      for (var b = 0; b < pos.length; b++) {
        var row = pos[a], col = pos[b];
        if (mod[row][col] != null) continue;
        for (var r = -2; r <= 2; r++) {
          for (var c = -2; c <= 2; c++) {
            mod[row + r][col + c] = (r === -2 || r === 2 || c === -2 || c === 2 || (r === 0 && c === 0));
          }
        }
      }
    }

    for (var tm = 8; tm < size - 8; tm++) {
      if (mod[tm][6] == null) mod[tm][6] = (tm % 2 === 0);
      if (mod[6][tm] == null) mod[6][tm] = (tm % 2 === 0);
    }

    // formato
    var bitsTI = getBCHTypeInfo((fmtEcl << 3) | mask);
    for (var i = 0; i < 15; i++) {
      var bit = ((bitsTI >> i) & 1) === 1;
      if (i < 6) mod[i][8] = bit;
      else if (i < 8) mod[i + 1][8] = bit;
      else mod[size - 15 + i][8] = bit;
    }
    for (i = 0; i < 15; i++) {
      bit = ((bitsTI >> i) & 1) === 1;
      if (i < 8) mod[8][size - i - 1] = bit;
      else if (i < 9) mod[8][15 - i - 1 + 1] = bit;
      else mod[8][15 - i - 1] = bit;
    }
    mod[size - 8][8] = true;

    // info de version (v>=7)
    if (type >= 7) {
      var bitsTN = getBCHTypeNumber(type);
      for (i = 0; i < 18; i++) {
        var vb = ((bitsTN >> i) & 1) === 1;
        mod[Math.floor(i / 3)][i % 3 + size - 8 - 3] = vb;
        mod[i % 3 + size - 8 - 3][Math.floor(i / 3)] = vb;
      }
    }

    // datos (zigzag)
    var maskFunc = maskFuncs[mask];
    var posBits = 7, byteIdx = 0, rowIdx = size - 1, inc = -1;
    for (var colIdx = size - 1; colIdx > 0; colIdx -= 2) {
      if (colIdx === 6) colIdx--;
      while (true) {
        for (var cc = 0; cc < 2; cc++) {
          if (mod[rowIdx][colIdx - cc] == null) {
            var dark = false;
            if (byteIdx < codewords.length) dark = ((codewords[byteIdx] >>> posBits) & 1) === 1;
            if (maskFunc(rowIdx, colIdx - cc)) dark = !dark;
            mod[rowIdx][colIdx - cc] = dark;
            posBits--;
            if (posBits === -1) { byteIdx++; posBits = 7; }
          }
        }
        rowIdx += inc;
        if (rowIdx < 0 || size <= rowIdx) { rowIdx -= inc; inc = -inc; break; }
      }
    }
    return mod;
  }

  function build(texto, opts) {
    opts = opts || {};
    var eclName = String(opts.errorCorrectionLevel || 'L').toUpperCase();
    var ecl = SHIFT[eclName];
    if (ecl === undefined) ecl = SHIFT.L;

    var bytes = [];
    for (var x = 0; x < texto.length; x++) bytes.push(texto.charCodeAt(x) & 0xff);

    var version = 0, dataCap = 0;
    for (var v = 1; v <= 10; v++) {
      var cfg = ECB[v][ecl];
      dataCap = cfg[1];
      var over = 4 + (v <= 9 ? 8 : 16) + bytes.length * 8; // modo + largo + datos (sin term)
      if (over <= dataCap * 8) { version = v; break; }
    }
    if (!version) throw new Error('QR demasiado largo: excede la capacidad');

    var stream = [0, 1, 0, 0];
    for (var k = (version <= 9 ? 8 : 16) - 1; k >= 0; k--) stream.push((bytes.length >> k) & 1);
    for (var i = 0; i < bytes.length; i++) {
      for (k = 7; k >= 0; k--) stream.push((bytes[i] >> k) & 1);
    }
    var capBits = dataCap * 8;
    var term = Math.min(4, capBits - stream.length);
    for (k = 0; k < term; k++) stream.push(0);
    while (stream.length % 8 !== 0) stream.push(0);
    var data = [];
    for (i = 0; i < stream.length; i += 8) {
      var byte = 0;
      for (k = 0; k < 8; k++) byte = (byte << 1) | stream[i + k];
      data.push(byte);
    }
    var padByte = 0xec;
    while (data.length < dataCap) { data.push(padByte); padByte = padByte === 0xec ? 0x11 : 0xec; }

    var nBlocks = cfg[0];
    var blockBase = Math.floor(dataCap / nBlocks);
    var extraB = dataCap % nBlocks;
    var ecLen = cfg[2];
    var dataBlocks = [], ecBlocks = [], pos = 0;
    for (i = 0; i < nBlocks; i++) {
      var lenB = blockBase + (i < extraB ? 1 : 0);
      var blk = data.slice(pos, pos + lenB);
      pos += lenB;
      dataBlocks.push(blk);
      ecBlocks.push(rsRemainder(blk, ecLen));
    }
    var total = [];
    var maxD = 0;
    for (i = 0; i < nBlocks; i++) maxD = Math.max(maxD, dataBlocks[i].length);
    for (i = 0; i < maxD; i++) for (var bl = 0; bl < nBlocks; bl++) if (i < dataBlocks[bl].length) total.push(dataBlocks[bl][i]);
    for (i = 0; i < ecLen; i++) for (bl = 0; bl < nBlocks; bl++) total.push(ecBlocks[bl][i]);

    var bestScore = Infinity, bestMask = 0;
    var size = version * 4 + 17;
    for (var m = 0; m < 8; m++) {
      var mo = makeMatrix(version, m, total, [1, 0, 3, 2][ecl]);
      var sc = lostPoint(mo, size);
      if (sc < bestScore) { bestScore = sc; bestMask = m; }
    }
    var modules = makeMatrix(version, bestMask, total);
    return { version: version, size: size, mask: bestMask, modules: modules };
  }

  function toSVG(texto, opts) {
    opts = opts || {};
    var enc = build(texto, opts);
    var cells = opts.cells || 2;
    var margin = opts.margin === undefined ? 2 : opts.margin;
    var totalPx = (enc.size + margin * 2) * cells;
    var parts = ['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + totalPx + ' ' + totalPx + '" width="' + totalPx + '" height="' + totalPx + '" shape-rendering="crispEdges">'];
    parts.push('<rect width="100%" height="100%" fill="#ffffff"/>');
    for (var r = 0; r < enc.size; r++) {
      for (var c = 0; c < enc.size; c++) {
        if (enc.modules[r][c]) {
          parts.push('<rect x="' + (c * cells + margin * cells) + '" y="' + (r * cells + margin * cells) + '" width="' + cells + '" height="' + cells + '"/>');
        }
      }
    }
    parts.push('</svg>');
    return parts.join('');
  }

  function matrixesAll(texto, opts) {
    opts = opts || {};
    var eclName = String(opts.errorCorrectionLevel || 'L').toUpperCase();
    var ecl = SHIFT[eclName] === undefined ? SHIFT.L : SHIFT[eclName];
    var bytes = [];
    for (var x = 0; x < texto.length; x++) bytes.push(texto.charCodeAt(x) & 0xff);
    var version = 0, cfg = null;
    for (var v = 1; v <= 10; v++) {
      cfg = ECB[v][ecl];
      var over = 4 + (v <= 9 ? 8 : 16) + bytes.length * 8;
      if (over <= cfg[1] * 8) { version = v; break; }
    }
    if (!version) throw new Error('QR demasiado largo: excede la capacidad');
    var stream = [0, 1, 0, 0];
    for (var k = (version <= 9 ? 8 : 16) - 1; k >= 0; k--) stream.push((bytes.length >> k) & 1);
    for (var i = 0; i < bytes.length; i++) for (k = 7; k >= 0; k--) stream.push((bytes[i] >> k) & 1);
    var capBits = cfg[1] * 8;
    var term = Math.min(4, capBits - stream.length);
    for (k = 0; k < term; k++) stream.push(0);
    while (stream.length % 8 !== 0) stream.push(0);
    var data = [];
    for (i = 0; i < stream.length; i += 8) {
      var byte = 0;
      for (k = 0; k < 8; k++) byte = (byte << 1) | stream[i + k];
      data.push(byte);
    }
    var padByte = 0xec;
    while (data.length < cfg[1]) { data.push(padByte); padByte = padByte === 0xec ? 0x11 : 0xec; }
    var nBlocks = cfg[0], blockBase = Math.floor(cfg[1] / nBlocks), extraB = cfg[1] % nBlocks, ecLen = cfg[2];
    var dataBlocks = [], ecBlocks = [], pos = 0;
    for (i = 0; i < nBlocks; i++) {
      var lenB = blockBase + (i < extraB ? 1 : 0);
      var blk = data.slice(pos, pos + lenB); pos += lenB;
      dataBlocks.push(blk); ecBlocks.push(rsRemainder(blk, ecLen));
    }
    var total = [], maxD = 0;
    for (i = 0; i < nBlocks; i++) maxD = Math.max(maxD, dataBlocks[i].length);
    for (i = 0; i < maxD; i++) for (var bl = 0; bl < nBlocks; bl++) if (i < dataBlocks[bl].length) total.push(dataBlocks[bl][i]);
    for (i = 0; i < ecLen; i++) for (bl = 0; bl < nBlocks; bl++) total.push(ecBlocks[bl][i]);
    var out = [];
    for (var m = 0; m < 8; m++) out.push(makeMatrix(version, m, total, [1, 0, 3, 2][ecl]));
    return { version: version, matrices: out, totalCodewords: total.length };
  }

  var mi = { build: build, toSVG: toSVG, matrixesAll: matrixesAll };
  if (typeof module !== 'undefined' && module.exports) module.exports = { QR: mi };
  else root.MINIQ = mi;
})(typeof window !== 'undefined' ? window : this);