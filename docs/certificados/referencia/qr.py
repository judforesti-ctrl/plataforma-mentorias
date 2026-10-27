"""Gerador de QR code mínimo (modo byte, correção de erro M, versões 1 a 10), sem dependências.

Usado só pelo gerador de referência deste pacote. Na plataforma, prefira uma biblioteca
consolidada (por exemplo, "qrcode" no npm ou "segno" no Python) com as mesmas opções:
correção de erro M, saída em SVG, módulos azul-petróleo #0E3B44 e fundo transparente.
"""

# capacidade (correção M): códigos de correção por bloco e número de blocos, versões 1..10
_ECC_POR_BLOCO = [None, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26]
_NUM_BLOCOS = [None, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5]
_ALINHAMENTO = [None, [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34],
                [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]]


def _mul(x, y):
    z = 0
    for i in reversed(range(8)):
        z = (z << 1) ^ ((z >> 7) * 0x11D)
        z ^= ((y >> i) & 1) * x
    return z


def _rs_divisor(grau):
    res = [0] * (grau - 1) + [1]
    raiz = 1
    for _ in range(grau):
        for j in range(len(res)):
            res[j] = _mul(res[j], raiz)
            if j + 1 < len(res):
                res[j] ^= res[j + 1]
        raiz = _mul(raiz, 0x02)
    return res


def _rs_resto(dados, divisor):
    res = [0] * len(divisor)
    for b in dados:
        fator = b ^ res.pop(0)
        res.append(0)
        for i, coef in enumerate(divisor):
            res[i] ^= _mul(coef, fator)
    return res


def _modulos_brutos(v):
    r = (16 * v + 128) * v + 64
    if v >= 2:
        n = v // 7 + 2
        r -= (25 * n - 10) * n - 55
        if v >= 7:
            r -= 36
    return r


def _cw_dados(v):
    return _modulos_brutos(v) // 8 - _ECC_POR_BLOCO[v] * _NUM_BLOCOS[v]


class QR:
    def __init__(self, texto):
        dados = texto.encode("utf-8")
        for v in range(1, 11):
            cc_bits = 8 if v < 10 else 16
            if 4 + cc_bits + 8 * len(dados) <= _cw_dados(v) * 8:
                break
        else:
            raise ValueError("Texto longo demais para este gerador (máx. versão 10)")
        self.v = v
        self.n = 17 + 4 * v
        bits = []
        def put(val, nb):
            for i in reversed(range(nb)):
                bits.append((val >> i) & 1)
        put(0b0100, 4)
        put(len(dados), cc_bits)
        for b in dados:
            put(b, 8)
        cap = _cw_dados(v) * 8
        put(0, min(4, cap - len(bits)))
        put(0, (-len(bits)) % 8)
        pad = 0xEC
        while len(bits) < cap:
            put(pad, 8)
            pad ^= 0xEC ^ 0x11
        cws = [int("".join(map(str, bits[i:i + 8])), 2) for i in range(0, len(bits), 8)]
        self._todos = self._ecc_intercalar(cws)
        n = self.n
        self.m = [[False] * n for _ in range(n)]
        self.f = [[False] * n for _ in range(n)]
        self._padroes_fixos()
        self._colocar(self._todos)
        melhor, pen = 0, None
        for mask in range(8):
            self._mascara(mask)
            self._formato(mask)
            p = self._penalidade()
            if pen is None or p < pen:
                melhor, pen = mask, p
            self._mascara(mask)
        self._mascara(melhor)
        self._formato(melhor)

    def _ecc_intercalar(self, dados):
        v = self.v
        nb, ecl = _NUM_BLOCOS[v], _ECC_POR_BLOCO[v]
        raw = _modulos_brutos(v) // 8
        curtos = nb - raw % nb
        tam_curto = raw // nb
        div = _rs_divisor(ecl)
        blocos, k = [], 0
        for i in range(nb):
            dat = dados[k: k + tam_curto - ecl + (0 if i < curtos else 1)]
            k += len(dat)
            ecc = _rs_resto(dat, div)
            if i < curtos:
                dat = dat + [0]
            blocos.append(dat + ecc)
        res = []
        for i in range(len(blocos[0])):
            for j, b in enumerate(blocos):
                if i != tam_curto - ecl or j >= curtos:
                    res.append(b[i])
        return res

    def _set(self, x, y, escuro):
        self.m[y][x] = escuro
        self.f[y][x] = True

    def _padroes_fixos(self):
        n = self.n
        for i in range(n):
            self._set(6, i, i % 2 == 0)
            self._set(i, 6, i % 2 == 0)
        for cx, cy in ((3, 3), (n - 4, 3), (3, n - 4)):
            for dy in range(-4, 5):
                for dx in range(-4, 5):
                    x, y = cx + dx, cy + dy
                    if 0 <= x < n and 0 <= y < n:
                        self._set(x, y, max(abs(dx), abs(dy)) not in (2, 4))
        al = _ALINHAMENTO[self.v]
        L = len(al)
        for i in range(L):
            for j in range(L):
                if (i == 0 and j == 0) or (i == 0 and j == L - 1) or (i == L - 1 and j == 0):
                    continue
                for dy in range(-2, 3):
                    for dx in range(-2, 3):
                        self._set(al[i] + dx, al[j] + dy, max(abs(dx), abs(dy)) != 1)
        self._formato(0)
        if self.v >= 7:
            rem = self.v
            for _ in range(12):
                rem = (rem << 1) ^ ((rem >> 11) * 0x1F25)
            bits = self.v << 12 | rem
            for i in range(18):
                b = (bits >> i) & 1
                a, c = n - 11 + i % 3, i // 3
                self._set(a, c, bool(b))
                self._set(c, a, bool(b))

    def _formato(self, mask):
        dado = (0 << 3) | mask  # nível M = 00
        rem = dado
        for _ in range(10):
            rem = (rem << 1) ^ ((rem >> 9) * 0x537)
        bits = ((dado << 10) | rem) ^ 0x5412
        g = lambda i: bool((bits >> i) & 1)
        n = self.n
        for i in range(6):
            self._set(8, i, g(i))
        self._set(8, 7, g(6))
        self._set(8, 8, g(7))
        self._set(7, 8, g(8))
        for i in range(9, 15):
            self._set(14 - i, 8, g(i))
        for i in range(8):
            self._set(n - 1 - i, 8, g(i))
        for i in range(8, 15):
            self._set(8, n - 15 + i, g(i))
        self._set(8, n - 8, True)

    def _colocar(self, dados):
        n, i = self.n, 0
        total = len(dados) * 8
        direita = n - 1
        while direita >= 1:
            if direita == 6:
                direita = 5
            for vert in range(n):
                for j in range(2):
                    x = direita - j
                    subindo = ((direita + 1) & 2) == 0
                    y = n - 1 - vert if subindo else vert
                    if not self.f[y][x] and i < total:
                        self.m[y][x] = bool((dados[i >> 3] >> (7 - (i & 7))) & 1)
                        i += 1
            direita -= 2

    def _mascara(self, k):
        fns = [
            lambda x, y: (x + y) % 2 == 0, lambda x, y: y % 2 == 0, lambda x, y: x % 3 == 0,
            lambda x, y: (x + y) % 3 == 0, lambda x, y: (x // 3 + y // 2) % 2 == 0,
            lambda x, y: x * y % 2 + x * y % 3 == 0, lambda x, y: (x * y % 2 + x * y % 3) % 2 == 0,
            lambda x, y: ((x + y) % 2 + x * y % 3) % 2 == 0]
        fn = fns[k]
        for y in range(self.n):
            for x in range(self.n):
                if not self.f[y][x] and fn(x, y):
                    self.m[y][x] = not self.m[y][x]

    def _penalidade(self):
        n, m, p = self.n, self.m, 0
        linhas = [m[y] for y in range(n)] + [[m[y][x] for y in range(n)] for x in range(n)]
        for ln in linhas:
            run, prev = 0, None
            for c in ln:
                if c == prev:
                    run += 1
                else:
                    if run >= 5:
                        p += 3 + run - 5
                    run, prev = 1, c
            if run >= 5:
                p += 3 + run - 5
            s = "".join("1" if c else "0" for c in ln)
            p += 40 * (s.count("10111010000") + s.count("00001011101"))
        for y in range(n - 1):
            for x in range(n - 1):
                c = m[y][x]
                if c == m[y][x + 1] == m[y + 1][x] == m[y + 1][x + 1]:
                    p += 3
        escuros = sum(sum(r) for r in m)
        k = abs(escuros * 20 - n * n * 10) // (n * n)
        p += k * 10
        return p

    def svg(self, cor="#0E3B44", margem=1):
        n, t = self.n, self.n + 2 * margem
        partes = []
        for y in range(n):
            for x in range(n):
                if self.m[y][x]:
                    partes.append(f"M{x + margem} {y + margem}h1v1h-1z")
        return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {t} {t}" shape-rendering="crispEdges">'
                f'<path fill="{cor}" d="{"".join(partes)}"/></svg>')

    def data_uri(self, cor="#0E3B44", margem=1):
        import base64
        return "data:image/svg+xml;base64," + base64.b64encode(self.svg(cor, margem).encode()).decode()
