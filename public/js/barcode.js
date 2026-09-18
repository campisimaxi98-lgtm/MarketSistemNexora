/* Generador de codigos de barras propio: EAN-13 y Code 128 (subsets B/C).
   Navegador -> window.BARCODE ; Node -> require('./public/js/barcode.js'). */
(function (root) {
  'use strict';

  var EAN_L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011'];
  var EAN_G = ['0100111', '0110011', '0011011', '0100001', '0011101', '0111001', '0000101', '0010001', '0001001', '0010111'];
  var EAN_R = EAN_L.map(function (s) { return s.split('').map(function (b) { return b === '1' ? '0' : '1'; }).join(''); });
  var EAN_PARITY = {
    0: 'LLLLLL', 1: 'LLGLGG', 2: 'LLGGLG', 3: 'LLGGGL', 4: 'LGLLGG',
    5: 'LGGLLG', 6: 'LGGGLL', 7: 'LGLGLG', 8: 'LGLGGL', 9: 'LGGLGL'
  };
  var BAR_START = '101', BAR_MID = '01010', BAR_END = '101';

  function ean13Checksum(digits) {
    var sum = 0;
    for (var i = 0; i < 12; i++) sum += digits[i] * (i % 2 === 0 ? 1 : 3);
    return (10 - (sum % 10)) % 10;
  }

  function encodeEAN13(texto) {
    var digits = String(texto).replace(/[^0-9]/g, '');
    if (digits.length === 12) digits += ean13Checksum(digits.split('').map(Number));
    if (digits.length !== 13) return { error: 'EAN-13 requiere 12 o 13 digitos' };
    var d = digits.split('').map(Number);
    if (ean13Checksum(d.slice(0, 12)) !== d[12]) return { error: 'Digito verificador EAN-13 invalido' };
    if (d[0] < 0 || d[0] > 9) return { error: 'EAN-13 invalido' };
    var parity = EAN_PARITY[d[0]];
    var bin = BAR_START;
    for (var i = 1; i <= 6; i++) bin += (parity[i - 1] === 'L' ? EAN_L : EAN_G)[d[i]];
    bin += BAR_MID;
    for (i = 7; i < 13; i++) bin += EAN_R[d[i]];
    bin += BAR_END;
    return { error: null, data: digits, check: d[12], bin: bin, text: digits };
  }

  var C128_PATTERNS = [
    '11011001100','11001101100','11001100110','10010011000','10010001100','10001001100','10011001000','10011000100','10001100100','11001001000',
    '11001000100','11000100100','10110011100','10011011100','10011001110','10111001100','10011101100','10011100110','11001110010','11001011100',
    '11001001110','11011100100','11001110100','11101101110','11101001100','11100101100','11100100110','11101100100','11100110100','11100110010',
    '11011011000','11011000110','11000110110','10100011000','10001011000','10001000110','10110001000','10001101000','10001100010','11010001000',
    '11000101000','11000100010','10110111000','10110001110','10001101110','10111011000','10111000110','10001110110','11101110110','11010001110',
    '11000101110','11011101000','11011100010','11011101110','11101011000','11101000110','11100010110','11101101000','11101100010','11100011010',
    '11101111010','11001000010','11110001010','10100110000','10100001100','10010110000','10010000110','10000101100','10000100110','10110010000',
    '10110000100','10011010000','10011000010','10000110100','10000110010','11000010010','11001010000','11110111010','11000010100','10001111010',
    '10100111100','10010111100','10010011110','10111100100','10011110100','10011110010','11110100100','11110010100','11110010010','11011011110',
    '11011110110','11110110110','10101111000','10100011110','10001011110','10111101000','10111100010','11110101000','11110100010','10111011110',
    '10111101110','11101011110','11110101110','11010000100','11010010000','11010011100','1100011101011'
  ];
  var C128_STOP = '1100011101011';

  // Auto-encoder equivalente al de JsBarcode: optimiza subconjuntos A/B/C
  function autoCode128Values(s) {
    var out = []; // valores (con SWITCH incluidos)
    function pairsC(str) { var m = str.match(/^(\d{2})*/); return m[0].length / 2; }
    function leadB(str) { var i = 0; while (i < str.length) { var cc = str.charCodeAt(i); if (cc >= 32 && cc <= 126) i++; else break; } return i; }
    function leadA(str) { var i = 0; while (i < str.length) { var cc = str.charCodeAt(i); if (cc >= 0 && cc <= 95) i++; else break; } return i; }
    function isDigit(c) { return c >= '0' && c <= '9'; }

    function f(str) {
      var pc = pairsC(str);
      var consumed = pc * 2;
      if (consumed === str.length) {
        for (var p = 0; p < pc; p++) out.push(parseInt(str.substr(p * 2, 2), 10));
        return;
      }
      for (p = 0; p < pc; p++) out.push(parseInt(str.substr(p * 2, 2), 10));
      var rest = str.substring(consumed);
      var useA = leadA(rest) > leadB(rest);
      out.push(useA ? 100 : 101); // SWITCH A(100) o B(101)
      u(rest, useA);
    }

    function u(str, useA) {
      // equivalencia de la regex: primer corte donde hay >=2 pares de digitos con frontera no-digito/fin
      var cut = -1;
      for (var i = 0; i < str.length; i++) {
        if (!isDigit(str[i])) continue;
        var j = i, n = 0;
        while (j + 1 < str.length && isDigit(str[j]) && isDigit(str[j + 1])) { n++; j += 2; }
        if (n >= 2) {
          var after = j >= str.length || !isDigit(str[j]);
          if (after) { cut = i; break; }
        }
      }
      if (cut >= 0) {
        var prefix = str.substring(0, cut);
        var k = 0;
        if (useA) { while (k < prefix.length) { out.push(prefix.charCodeAt(k)); k++; } }
        else { while (k < prefix.length) { out.push(prefix.charCodeAt(k) - 32); k++; } }
        out.push(99); // SWITCH C
        f(str.substring(cut));
        return;
      }
      var n2 = useA ? leadA(str) : leadB(str);
      var k2 = 0;
      if (useA) { while (k2 < n2) { out.push(str.charCodeAt(k2)); k2++; } }
      else { while (k2 < n2) { out.push(str.charCodeAt(k2) - 32); k2++; } }
      if (n2 === str.length) return;
      out.push(useA ? 101 : 100);
      u(str.substring(n2), !useA);
    }

    var pc = pairsC(s);
    if (pc >= 1) { // comienza codigo C si hay al menos un par? JsBarcode: si >=2 pares usa C directo; con 1 par queda a decision
      // Siguiendo modulo: if(checkC(t).length >= 2) C_START + f; caso "1234" -> 2 pares -> C inicio
      var mitad = s.length % 2 === 0 ? s.length / 2 : (s.length - 1) / 2;
      if (pc === mitad && pc >= 2 && s.length % 2 === 0) {
        out.push(105); // START C
        f(s);
        return out;
      }
    }
    // ademas, si 's' es solo digitos y pares, arriba ya capturamos; si pares>=1 pero no todo o impar, evaluar igual que JsBarcode
    if (pc >= 2) {
      out.push(105);
      f(s);
      return out;
    }
    // caso base: START B y correr u con charset B
    var useA0 = leadA(s) > leadB(s) ? true : false;
    out.push(useA0 ? 103 : 104); // START A o START B
    u(s, useA0);
    return out;
  }

  function encodeCode128(texto) {
    var s = String(texto);
    if (!s.length) return { error: 'Code128 vacio' };
    var vals = autoCode128Values(s);
    var bin = C128_PATTERNS[vals[0]];
    var checksum = vals[0];
    var modeIni = vals[0] === 105 ? 'C' : (vals[0] === 103 ? 'A' : 'B');
    for (var i = 1; i < vals.length; i++) {
      if (vals[i] > 106) return { error: 'Valor invalido' };
      checksum = (checksum + vals[i] * i) % 103;
      bin += C128_PATTERNS[vals[i]];
    }
    bin += C128_PATTERNS[checksum];
    bin += C128_STOP;
    return { error: null, data: s, bin: bin, check: checksum, mode: modeIni, values: vals };
  }

  function svgFrom(bin, texto, opts) {
    opts = opts || {};
    var height = opts.height || 60;
    var barW = opts.barWidth || 2;
    var quiet = (opts.quiet === undefined ? 10 : opts.quiet);
    var width = bin.length * barW + quiet * 2;
    var parts = ['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + width + ' ' + height + '" width="' + width + '" height="' + height + '" shape-rendering="crispEdges">'];
    parts.push('<rect width="100%" height="100%" fill="#ffffff"/>');
    for (var i = 0; i < bin.length; i++) {
      if (bin[i] === '1') {
        parts.push('<rect x="' + (i * barW + quiet) + '" y="0" width="' + barW + '" height="' + height + '"/>');
      }
    }
    if (texto && opts.withText) {
      parts.push('<text x="' + (width / 2) + '" y="' + (height - 2) + '" text-anchor="middle" font-family="monospace" font-size="12" fill="#000">' + texto + '</text>');
    }
    parts.push('</svg>');
    return parts.join('');
  }

  var Barcode = {
    encode: function (texto, opts) {
      opts = opts || {};
      var tipo = (opts.format || '').toString().toUpperCase();
      if (tipo === 'EAN13' || tipo === 'EAN-13') return encodeEAN13(texto);
      if (tipo === 'CODE128' || tipo === 'CODE_128' || tipo === '128') return encodeCode128(texto);
      // auto: solo digitos de 8/12/13 -> EAN13 (12/13), 8 -> EAN8 no soportado; digitos par -> CODE128
      var e = encodeEAN13(texto);
      if (!e.error) return e;
      return encodeCode128(texto);
    },
    toSVG: function (texto, opts) {
      opts = opts || {};
      var e = this.encode(texto, opts);
      if (e.error) return null;
      return svgFrom(e.bin, e.text || (opts.text || texto), opts);
    }
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = { Barcode: Barcode };
  else root.BARCODE = Barcode;
})(typeof window !== 'undefined' ? window : this);