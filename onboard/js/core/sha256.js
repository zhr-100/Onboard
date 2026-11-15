/**
 * 初见 Onboard · 密码哈希（纯 JavaScript 版 SHA-256）
 *
 * 为什么自己写而不用浏览器的 crypto.subtle：
 *   - crypto.subtle 只在"安全上下文"里可用，部分浏览器对本地文件（file://）不支持
 *   - 这个实现是同步的，调用起来简单，任何浏览器都能跑
 *
 * 注意：这是本机演示版的账号体系，作用是"密码不落明文"，不等于生产级密码存储。
 */
(function (root) {
  var O = root.Onboard;

  var K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ];

  function rotr(x, n) {
    return ((x >>> n) | (x << (32 - n))) | 0;
  }

  /** 字符串 → UTF-8 字节数组 */
  function utf8Bytes(str) {
    var bytes = [];
    var s = String(str === null || str === undefined ? '' : str);
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i);
      if (c < 0x80) {
        bytes.push(c);
      } else if (c < 0x800) {
        bytes.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
      } else if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length) {
        var c2 = s.charCodeAt(i + 1);
        var cp = 0x10000 + ((c & 0x3ff) << 10) + (c2 & 0x3f);
        bytes.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 0x3f), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
        i++;
      } else {
        bytes.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
      }
    }
    return bytes;
  }

  /** 字节数组 → 十六进制字符串 */
  function sha256Bytes(bytes) {
    var H = [
      0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
      0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
    ];

    var msg = bytes.slice();
    var bitLen = bytes.length * 8;
    msg.push(0x80);
    while (msg.length % 64 !== 56) msg.push(0);
    var hi = Math.floor(bitLen / 4294967296);
    var lo = bitLen >>> 0;
    msg.push((hi >>> 24) & 255, (hi >>> 16) & 255, (hi >>> 8) & 255, hi & 255,
      (lo >>> 24) & 255, (lo >>> 16) & 255, (lo >>> 8) & 255, lo & 255);

    var w = new Array(64);
    var i, j;

    for (var off = 0; off < msg.length; off += 64) {
      for (i = 0; i < 16; i++) {
        w[i] = (msg[off + i * 4] << 24) | (msg[off + i * 4 + 1] << 16) |
          (msg[off + i * 4 + 2] << 8) | msg[off + i * 4 + 3];
      }
      for (i = 16; i < 64; i++) {
        var s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
        var s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
        w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
      }

      var a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];

      for (i = 0; i < 64; i++) {
        var S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
        var ch = (e & f) ^ ((~e) & g);
        var t1 = (h + S1 + ch + K[i] + w[i]) | 0;
        var S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
        var maj = (a & b) ^ (a & c) ^ (b & c);
        var t2 = (S0 + maj) | 0;

        h = g; g = f; f = e;
        e = (d + t1) | 0;
        d = c; c = b; b = a;
        a = (t1 + t2) | 0;
      }

      H[0] = (H[0] + a) | 0;
      H[1] = (H[1] + b) | 0;
      H[2] = (H[2] + c) | 0;
      H[3] = (H[3] + d) | 0;
      H[4] = (H[4] + e) | 0;
      H[5] = (H[5] + f) | 0;
      H[6] = (H[6] + g) | 0;
      H[7] = (H[7] + h) | 0;
    }

    var out = '';
    for (i = 0; i < 8; i++) {
      out += ('00000000' + (H[i] >>> 0).toString(16)).slice(-8);
    }
    return out;
  }

  function sha256(text) {
    return sha256Bytes(utf8Bytes(text));
  }

  /** 生成随机盐 */
  function randomSalt() {
    var bytes = [];
    if (root.crypto && root.crypto.getRandomValues) {
      var buf = new Uint8Array(16);
      root.crypto.getRandomValues(buf);
      for (var i = 0; i < buf.length; i++) bytes.push(buf[i]);
    } else {
      for (var j = 0; j < 16; j++) bytes.push(Math.floor(Math.random() * 256));
    }
    return bytes.map(function (b) {
      return ('0' + b.toString(16)).slice(-2);
    }).join('');
  }

  O.sha256 = {
    hash: sha256,
    hashBytes: sha256Bytes,
    utf8Bytes: utf8Bytes,
    randomSalt: randomSalt
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
