/* QR code mínimo (modo byte, correção M, versões 1 a 10). Usado só nos protótipos.
   Na plataforma, use uma biblioteca consolidada (ex.: "qrcode" no npm) com correção M e saída SVG. */
(function (global) {
  var ECC = [0, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26];
  var BLK = [0, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5];
  var ALN = [null, [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]];
  function mul(x, y) { var z = 0; for (var i = 7; i >= 0; i--) { z = (z << 1) ^ ((z >>> 7) * 0x11D); z ^= ((y >>> i) & 1) * x; } return z & 0xFF; }
  function divisor(d) { var r = []; for (var i = 0; i < d - 1; i++) r.push(0); r.push(1); var root = 1;
    for (var k = 0; k < d; k++) { for (var j = 0; j < r.length; j++) { r[j] = mul(r[j], root); if (j + 1 < r.length) r[j] ^= r[j + 1]; } root = mul(root, 2); } return r; }
  function resto(data, div) { var r = div.map(function () { return 0; });
    data.forEach(function (b) { var f = b ^ r.shift(); r.push(0); div.forEach(function (c, i) { r[i] ^= mul(c, f); }); }); return r; }
  function raw(v) { var r = (16 * v + 128) * v + 64; if (v >= 2) { var n = Math.floor(v / 7) + 2; r -= (25 * n - 10) * n - 55; if (v >= 7) r -= 36; } return r; }
  function cwDados(v) { return Math.floor(raw(v) / 8) - ECC[v] * BLK[v]; }
  function utf8(s) { return Array.from(new TextEncoder().encode(s)); }

  function gerar(texto) {
    var dados = utf8(texto), v;
    for (v = 1; v <= 10; v++) { if (4 + (v < 10 ? 8 : 16) + 8 * dados.length <= cwDados(v) * 8) break; }
    if (v > 10) throw new Error('Texto longo demais');
    var bits = []; function put(val, n) { for (var i = n - 1; i >= 0; i--) bits.push((val >>> i) & 1); }
    put(4, 4); put(dados.length, v < 10 ? 8 : 16); dados.forEach(function (b) { put(b, 8); });
    var cap = cwDados(v) * 8; put(0, Math.min(4, cap - bits.length)); put(0, (8 - bits.length % 8) % 8);
    for (var pad = 0xEC; bits.length < cap; pad ^= 0xEC ^ 0x11) put(pad, 8);
    var cws = []; for (var i = 0; i < bits.length; i += 8) cws.push(parseInt(bits.slice(i, i + 8).join(''), 2));
    // blocos e intercalação
    var nb = BLK[v], ecl = ECC[v], rw = Math.floor(raw(v) / 8), curtos = nb - rw % nb, tc = Math.floor(rw / nb), dv = divisor(ecl), blocos = [], k = 0;
    for (i = 0; i < nb; i++) { var dat = cws.slice(k, k + tc - ecl + (i < curtos ? 0 : 1)); k += dat.length; var e = resto(dat, dv); if (i < curtos) dat.push(0); blocos.push(dat.concat(e)); }
    var tudo = []; for (i = 0; i < blocos[0].length; i++) blocos.forEach(function (b, j) { if (i !== tc - ecl || j >= curtos) tudo.push(b[i]); });
    var n = 17 + 4 * v, m = [], f = [];
    for (i = 0; i < n; i++) { m.push(new Array(n).fill(false)); f.push(new Array(n).fill(false)); }
    function set(x, y, d) { m[y][x] = d; f[y][x] = true; }
    function formato(mask) { var d = mask, r = d; for (var q = 0; q < 10; q++) r = (r << 1) ^ ((r >>> 9) * 0x537);
      var b = ((d << 10) | r) ^ 0x5412, g = function (i) { return ((b >>> i) & 1) === 1; };
      for (var a = 0; a < 6; a++) set(8, a, g(a)); set(8, 7, g(6)); set(8, 8, g(7)); set(7, 8, g(8));
      for (a = 9; a < 15; a++) set(14 - a, 8, g(a)); for (a = 0; a < 8; a++) set(n - 1 - a, 8, g(a));
      for (a = 8; a < 15; a++) set(8, n - 15 + a, g(a)); set(8, n - 8, true); }
    for (i = 0; i < n; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
    [[3, 3], [n - 4, 3], [3, n - 4]].forEach(function (c) { for (var dy = -4; dy <= 4; dy++) for (var dx = -4; dx <= 4; dx++) {
      var x = c[0] + dx, y = c[1] + dy; if (x >= 0 && x < n && y >= 0 && y < n) { var dd = Math.max(Math.abs(dx), Math.abs(dy)); set(x, y, dd !== 2 && dd !== 4); } } });
    var al = ALN[v], L = al.length;
    for (i = 0; i < L; i++) for (var j = 0; j < L; j++) { if ((i === 0 && j === 0) || (i === 0 && j === L - 1) || (i === L - 1 && j === 0)) continue;
      for (var dy2 = -2; dy2 <= 2; dy2++) for (var dx2 = -2; dx2 <= 2; dx2++) set(al[i] + dx2, al[j] + dy2, Math.max(Math.abs(dx2), Math.abs(dy2)) !== 1); }
    formato(0);
    if (v >= 7) { var rem = v; for (i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1F25); var vb = (v << 12) | rem;
      for (i = 0; i < 18; i++) { var bit = ((vb >>> i) & 1) === 1, a1 = n - 11 + i % 3, b1 = Math.floor(i / 3); set(a1, b1, bit); set(b1, a1, bit); } }
    // dados
    var idx = 0, total = tudo.length * 8;
    for (var right = n - 1; right >= 1; right -= 2) { if (right === 6) right = 5;
      for (var vert = 0; vert < n; vert++) for (var jj = 0; jj < 2; jj++) { var x = right - jj, up = ((right + 1) & 2) === 0, y = up ? n - 1 - vert : vert;
        if (!f[y][x] && idx < total) { m[y][x] = ((tudo[idx >>> 3] >>> (7 - (idx & 7))) & 1) === 1; idx++; } } }
    var fns = [function (x, y) { return (x + y) % 2 === 0; }, function (x, y) { return y % 2 === 0; }, function (x) { return x % 3 === 0; },
      function (x, y) { return (x + y) % 3 === 0; }, function (x, y) { return (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0; },
      function (x, y) { return x * y % 2 + x * y % 3 === 0; }, function (x, y) { return (x * y % 2 + x * y % 3) % 2 === 0; },
      function (x, y) { return ((x + y) % 2 + x * y % 3) % 2 === 0; }];
    function mascara(kk) { for (var y = 0; y < n; y++) for (var x = 0; x < n; x++) if (!f[y][x] && fns[kk](x, y)) m[y][x] = !m[y][x]; }
    function pen() { var p = 0, linhas = [], y, x;
      for (y = 0; y < n; y++) linhas.push(m[y]); for (x = 0; x < n; x++) { var col = []; for (y = 0; y < n; y++) col.push(m[y][x]); linhas.push(col); }
      linhas.forEach(function (ln) { var run = 0, prev = null; ln.forEach(function (c) { if (c === prev) run++; else { if (run >= 5) p += run - 2; run = 1; prev = c; } }); if (run >= 5) p += run - 2;
        var s = ln.map(function (c) { return c ? '1' : '0'; }).join(''); p += 40 * ((s.match(/10111010000/g) || []).length + (s.match(/00001011101/g) || []).length); });
      for (y = 0; y < n - 1; y++) for (x = 0; x < n - 1; x++) { var c = m[y][x]; if (c === m[y][x + 1] && c === m[y + 1][x] && c === m[y + 1][x + 1]) p += 3; }
      var esc = 0; m.forEach(function (r) { r.forEach(function (c) { if (c) esc++; }); }); p += Math.floor(Math.abs(esc * 20 - n * n * 10) / (n * n)) * 10; return p; }
    var melhor = 0, mp = null; for (var t = 0; t < 8; t++) { mascara(t); formato(t); var pp = pen(); if (mp === null || pp < mp) { mp = pp; melhor = t; } mascara(t); }
    mascara(melhor); formato(melhor);
    return m;
  }
  function svg(texto, cor, margem) {
    var m = gerar(texto), n = m.length, q = margem == null ? 1 : margem, t = n + 2 * q, d = '';
    for (var y = 0; y < n; y++) for (var x = 0; x < n; x++) if (m[y][x]) d += 'M' + (x + q) + ' ' + (y + q) + 'h1v1h-1z';
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + t + ' ' + t + '" shape-rendering="crispEdges"><path fill="' + (cor || '#0E3B44') + '" d="' + d + '"/></svg>';
  }
  function dataUri(texto, cor, margem) { return 'data:image/svg+xml;base64,' + btoa(svg(texto, cor, margem)); }
  global.QRMini = { svg: svg, dataUri: dataUri };
})(window);
