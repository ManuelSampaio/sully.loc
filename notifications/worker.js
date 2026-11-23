/*! Sully notifications — Web Push libraries (MIT)
Copyright 2024 Block65 Pte Ltd

Permission is hereby granted, free of charge, to any person obtaining a copy of
this software and associated documentation files (the "Software"), to deal in
the Software without restriction, including without limitation the rights to
use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software is furnished to do so,
subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.


MIT License

Copyright (c) Sindre Sorhus <sindresorhus@gmail.com> (https://sindresorhus.com)

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

*/

// ../core.js
var MOODS = [["radiante", "\u{1F970}", "Muito bem"], ["bem", "\u{1F60A}", "Bem"], ["tranquilo", "\u{1F60C}", "Tranquilo/a"], ["cansado", "\u{1F971}", "Cansado/a"], ["triste", "\u{1F614}", "Em baixo"], ["stressado", "\u{1F635}\u200D\u{1F4AB}", "Sob stress"]];
MOODS.push(["energia", "", "Com energia"], ["sono", "", "Com sono"], ["foco", "", "Com foco"], ["paz", "", "Em paz"], ["grato", "", "Grato/a"], ["exausto", "", "Exausto/a"]);
var STATUS_LIFETIME = 24 * 60 * 60 * 1e3;
function statusExpiry(state) {
  const daily = Number.isFinite(state?.ts) ? state.ts + STATUS_LIFETIME : 0;
  const explicit = Number(state?.until);
  if (explicit > 0) return daily ? Math.min(explicit, daily) : explicit;
  return daily;
}

// node_modules/uint8array-extras/index.js
var objectToString = Object.prototype.toString;
var uint8ArrayStringified = "[object Uint8Array]";
var arrayBufferStringified = "[object ArrayBuffer]";
function isType(value, typeConstructor, typeStringified) {
  if (!value) {
    return false;
  }
  if (value.constructor === typeConstructor) {
    return true;
  }
  return objectToString.call(value) === typeStringified;
}
function isUint8Array(value) {
  return isType(value, Uint8Array, uint8ArrayStringified);
}
function isArrayBuffer(value) {
  return isType(value, ArrayBuffer, arrayBufferStringified);
}
function isUint8ArrayOrArrayBuffer(value) {
  return isUint8Array(value) || isArrayBuffer(value);
}
function toUint8ArrayIfArrayBuffer(value) {
  return isArrayBuffer(value) ? new Uint8Array(value) : value;
}
function assertUint8ArrayOrArrayBuffer(value) {
  if (!isUint8ArrayOrArrayBuffer(value)) {
    throw new TypeError(`Expected \`Uint8Array\` or \`ArrayBuffer\`, got \`${typeof value}\``);
  }
}
function toUint8Array(value) {
  if (value instanceof ArrayBuffer) {
    return new Uint8Array(value);
  }
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  throw new TypeError(`Unsupported value, got \`${typeof value}\`.`);
}
function concatUint8Arrays(arrays, totalLength) {
  if (arrays.length === 0) {
    return new Uint8Array(0);
  }
  totalLength ??= arrays.reduce((accumulator, currentValue) => accumulator + currentValue.byteLength, 0);
  const returnValue = new Uint8Array(totalLength);
  let offset = 0;
  for (let array of arrays) {
    assertUint8ArrayOrArrayBuffer(array);
    array = toUint8ArrayIfArrayBuffer(array);
    returnValue.set(array, offset);
    offset += array.length;
  }
  return returnValue;
}
var cachedDecoders = {
  utf8: new globalThis.TextDecoder("utf8")
};
function assertString(value) {
  if (typeof value !== "string") {
    throw new TypeError(`Expected \`string\`, got \`${typeof value}\``);
  }
}
var cachedEncoder = new globalThis.TextEncoder();
function stringToUint8Array(string) {
  assertString(string);
  return cachedEncoder.encode(string);
}
function base64ToBase64Url(base64) {
  return base64.replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}
function base64UrlToBase64(base64url) {
  const base64 = base64url.replaceAll("-", "+").replaceAll("_", "/");
  const padding = (4 - base64.length % 4) % 4;
  return base64 + "=".repeat(padding);
}
var MAX_BLOCK_SIZE = 65535;
function uint8ArrayToBase64(array, { urlSafe = false } = {}) {
  assertUint8ArrayOrArrayBuffer(array);
  array = toUint8ArrayIfArrayBuffer(array);
  let base64 = "";
  for (let index = 0; index < array.length; index += MAX_BLOCK_SIZE) {
    const chunk = array.subarray(index, index + MAX_BLOCK_SIZE);
    base64 += globalThis.btoa(String.fromCodePoint.apply(void 0, chunk));
  }
  return urlSafe ? base64ToBase64Url(base64) : base64;
}
function base64ToUint8Array(base64String) {
  assertString(base64String);
  return Uint8Array.from(globalThis.atob(base64UrlToBase64(base64String)), (x) => x.codePointAt(0));
}
var byteToHexLookupTable = Array.from({ length: 256 }, (_, index) => index.toString(16).padStart(2, "0"));

// node_modules/@block65/webcrypto-web-push/dist/lib/utils.js
function encodeRecordSize(size) {
  const bytes2 = new Uint8Array(4);
  new DataView(bytes2.buffer).setUint32(0, size);
  return bytes2;
}
function invariant(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

// node_modules/@block65/webcrypto-web-push/dist/lib/client-keys.js
async function deriveClientKeys(sub) {
  const bytes2 = base64ToUint8Array(sub.keys.p256dh);
  const authSecretBytes = base64ToUint8Array(sub.keys.auth);
  invariant(bytes2.byteLength === 65 && bytes2[0] === 4, "Subscription p256dh is not an uncompressed P-256 point");
  invariant(authSecretBytes.byteLength === 16, "Subscription auth secret is not 16 bytes");
  return {
    publicKeyBytes: bytes2,
    publicKey: await crypto.subtle.importKey("raw", bytes2, {
      name: "ECDH",
      namedCurve: "P-256"
    }, false, []),
    authSecretBytes
  };
}

// node_modules/@block65/webcrypto-web-push/dist/lib/hkdf.js
function createHMAC(data) {
  const keyPromise = crypto.subtle.importKey("raw", data, {
    name: "HMAC",
    hash: "SHA-256"
  }, false, ["sign"]);
  return {
    hash: async (input) => {
      const k = await keyPromise;
      return crypto.subtle.sign("HMAC", k, input);
    }
  };
}
async function hkdf(salt, ikm) {
  const prkhPromise = createHMAC(salt).hash(ikm).then((prk) => createHMAC(prk));
  return {
    extract: async (info, len) => {
      const prkh = await prkhPromise;
      const blocks = await Array.from({ length: Math.ceil(len / 32) }, (_, i) => i).reduce(async (acc, i) => {
        const previous = await acc;
        const hash = await prkh.hash(new Uint8Array([...previous.at(-1) ?? [], ...info, i + 1]));
        return [...previous, new Uint8Array(hash)];
      }, Promise.resolve([]));
      return concatUint8Arrays(blocks).slice(0, len);
    }
  };
}

// node_modules/@block65/webcrypto-web-push/dist/lib/info.js
function createKeyInfo(clientPublic, serverPublic) {
  return new Uint8Array([
    ...stringToUint8Array("WebPush: info\0"),
    ...clientPublic,
    ...serverPublic
  ]);
}
function createInfo(type) {
  return stringToUint8Array(`Content-Encoding: ${type}\0`);
}

// node_modules/@block65/webcrypto-web-push/dist/lib/local-keys.js
async function generateLocalKeys() {
  const keyPair = await crypto.subtle.generateKey({
    name: "ECDH",
    namedCurve: "P-256"
  }, false, ["deriveBits"]);
  return {
    privateKey: keyPair.privateKey,
    publicKeyBytes: new Uint8Array(await crypto.subtle.exportKey("raw", keyPair.publicKey))
  };
}

// node_modules/@block65/webcrypto-web-push/dist/lib/salt.js
async function getSalt() {
  return crypto.getRandomValues(new Uint8Array(16));
}

// node_modules/@block65/webcrypto-web-push/dist/lib/encrypt.js
var recordSize = 4096;
var headerSize = 21 + 65;
var maxPlaintextSize = recordSize - headerSize - 17;
async function encryptNotification(subscription, plaintext, options = {}) {
  invariant(plaintext.byteLength <= maxPlaintextSize, `Payload is ${plaintext.byteLength} bytes, the maximum is ${maxPlaintextSize}`);
  const clientKeys = await deriveClientKeys(subscription);
  const salt = await getSalt();
  const localKeys = await generateLocalKeys();
  const sharedSecret = await crypto.subtle.deriveBits({
    name: "ECDH",
    public: clientKeys.publicKey
  }, localKeys.privateKey, 256);
  const keyInfo = createKeyInfo(clientKeys.publicKeyBytes, localKeys.publicKeyBytes);
  const cekInfo = createInfo("aes128gcm");
  const nonceInfo = createInfo("nonce");
  const ikmHkdf = await hkdf(clientKeys.authSecretBytes, sharedSecret);
  const ikm = await ikmHkdf.extract(keyInfo, 32);
  const messageHkdf = await hkdf(salt, ikm);
  const cekBytes = await messageHkdf.extract(cekInfo, 16);
  const nonceBytes = await messageHkdf.extract(nonceInfo, 12);
  const cekCryptoKey = await crypto.subtle.importKey("raw", cekBytes, {
    name: "AES-GCM",
    length: 128
  }, false, ["encrypt"]);
  const padTo = options.pad ?? true ? maxPlaintextSize : plaintext.byteLength;
  const padded = new Uint8Array(padTo + 1);
  padded.set(plaintext);
  padded[plaintext.byteLength] = 2;
  const encrypted = await crypto.subtle.encrypt({
    name: "AES-GCM",
    iv: nonceBytes
  }, cekCryptoKey, padded);
  return new Uint8Array([
    ...salt,
    ...encodeRecordSize(recordSize),
    localKeys.publicKeyBytes.byteLength,
    ...localKeys.publicKeyBytes,
    ...new Uint8Array(encrypted)
  ]);
}

// node_modules/@block65/webcrypto-web-push/dist/lib/base64.js
function encodeBase64Url(value) {
  return uint8ArrayToBase64(toUint8Array(value), { urlSafe: true });
}
function objectToBase64Url(obj) {
  return encodeBase64Url(stringToUint8Array(JSON.stringify(obj)));
}

// node_modules/@block65/webcrypto-web-push/dist/lib/jwt.js
async function sign(payload, key) {
  const headerStr = objectToBase64Url({
    typ: "JWT",
    alg: "ES256"
  });
  const payloadStr = objectToBase64Url({
    iat: Math.floor(Date.now() / 1e3),
    ...payload
  });
  const dataStr = `${headerStr}.${payloadStr}`;
  const signature = await crypto.subtle.sign({
    name: "ECDSA",
    hash: "SHA-256"
  }, key, stringToUint8Array(dataStr));
  return `${dataStr}.${encodeBase64Url(signature)}`;
}

// node_modules/@block65/webcrypto-web-push/dist/lib/vapid.js
async function vapidHeaders(subscription, vapid) {
  invariant(vapid.subject, "Vapid subject is empty");
  invariant(vapid.privateKey, "Vapid private key is empty");
  invariant(vapid.publicKey, "Vapid public key is empty");
  const endpoint = new URL(subscription.endpoint);
  invariant(endpoint.protocol === "https:", `Subscription endpoint is not https: ${endpoint.protocol}`);
  const vapidPublicKeyBytes = base64ToUint8Array(vapid.publicKey);
  const publicKey = await crypto.subtle.importKey("jwk", {
    kty: "EC",
    crv: "P-256",
    x: encodeBase64Url(vapidPublicKeyBytes.slice(1, 33)),
    y: encodeBase64Url(vapidPublicKeyBytes.slice(33, 65)),
    d: vapid.privateKey
  }, {
    name: "ECDSA",
    namedCurve: "P-256"
  }, false, ["sign"]);
  const jwt = await sign({
    aud: endpoint.origin,
    exp: Math.floor(Date.now() / 1e3) + 12 * 60 * 60,
    sub: vapid.subject
  }, publicKey);
  return {
    headers: {
      authorization: `vapid t=${jwt}, k=${vapid.publicKey}`
    }
  };
}

// node_modules/@block65/webcrypto-web-push/dist/lib/payload.js
async function buildPushPayload(message, subscription, vapid) {
  const { headers } = await vapidHeaders(subscription, vapid);
  const body = await encryptNotification(subscription, stringToUint8Array(
    // if its a primitive, convert to string, otherwise stringify
    typeof message.data === "string" || typeof message.data === "number" ? message.data.toString() : JSON.stringify(message.data)
  ));
  return {
    headers: {
      ...headers,
      ttl: (message.options?.ttl || 60).toString(),
      ...message.options?.urgency && {
        urgency: message.options.urgency
      },
      ...message.options?.topic && {
        topic: message.options.topic
      },
      "content-encoding": "aes128gcm",
      "content-length": body.byteLength.toString(),
      "content-type": "application/octet-stream"
    },
    method: "post",
    body
  };
}

// ../activity.js
var ACTIVITY_TYPES = ["mood", "status", "location"];
var noticeText = { message: "Tens uma nova mensagem.", quick: "Recebeste um toque do teu par.", note: "O teu par partilhou uma nota.", drawing: "O teu par enviou um desenho.", mood: "O teu par partilhou ou atualizou um check-in.", status: "O teu par atualizou o estado.", location: "O teu par partilhou a localiza\xE7\xE3o." };
function activityRequest(type, id, revision) {
  if (!ACTIVITY_TYPES.includes(type) || typeof id !== "string" || !id || id.length > 200 || id.includes("/") || !Number.isFinite(revision)) throw new Error("Atividade inv\xE1lida.");
  return { activity: { type, id, revision } };
}

// worker-source.js
var ORIGIN = "https://manuelsampaio.github.io";
var PROJECT = "sully-97787";
var DOCUMENTS = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/`;
var SCHEMA = [
  "CREATE TABLE IF NOT EXISTS push_keys (id INTEGER PRIMARY KEY CHECK(id=1), public_key TEXT NOT NULL, private_key TEXT NOT NULL)",
  "CREATE TABLE IF NOT EXISTS push_preferences (uid TEXT PRIMARY KEY, pair_id TEXT NOT NULL, quiet_until INTEGER NOT NULL)",
  "CREATE TABLE IF NOT EXISTS push_devices (id TEXT PRIMARY KEY, uid TEXT NOT NULL, pair_id TEXT NOT NULL, subscription TEXT NOT NULL, preview INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL)",
  "CREATE INDEX IF NOT EXISTS push_devices_recipient ON push_devices(uid,pair_id)",
  "CREATE TABLE IF NOT EXISTS push_deliveries (pair_id TEXT NOT NULL, event_id TEXT NOT NULL, device_id TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY(pair_id,event_id,device_id))",
  "CREATE INDEX IF NOT EXISTS push_deliveries_age ON push_deliveries(created_at)",
  "CREATE TABLE IF NOT EXISTS push_limits (uid TEXT NOT NULL, minute INTEGER NOT NULL, count INTEGER NOT NULL, PRIMARY KEY(uid,minute))"
];
var HttpError = class extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
};
function requireThat(condition, status, message) {
  if (!condition) throw new HttpError(status, message);
}
var b64url = (bytes2) => btoa(String.fromCharCode(...new Uint8Array(bytes2))).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
function bytes(value) {
  requireThat(typeof value === "string" && /^[A-Za-z0-9_-]+={0,2}$/.test(value), 400, "Invalid key");
  try {
    return Uint8Array.from(atob(value.replaceAll("-", "+").replaceAll("_", "/")), (c) => c.charCodeAt(0));
  } catch {
    throw new HttpError(400, "Invalid key");
  }
}
function field(value) {
  if ("stringValue" in value) return value.stringValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return value.doubleValue;
  if ("booleanValue" in value) return value.booleanValue;
  if ("arrayValue" in value) return (value.arrayValue.values || []).map(field);
  if ("mapValue" in value) return Object.fromEntries(Object.entries(value.mapValue.fields || {}).map(([k, v]) => [k, field(v)]));
  return null;
}
function claims(token) {
  try {
    const parts = token.split(".");
    requireThat(parts.length === 3 && token.length <= 1e4, 401, "Sign in required");
    const payload = JSON.parse(new TextDecoder().decode(bytes(parts[1])));
    requireThat(payload.aud === PROJECT && payload.iss === `https://securetoken.google.com/${PROJECT}` && typeof payload.sub === "string" && payload.sub.length > 0 && payload.sub.length <= 128 && !payload.sub.includes("/"), 401, "Sign in required");
    return payload;
  } catch {
    throw new HttpError(401, "Sign in required");
  }
}
async function validateSubscription(input) {
  requireThat(input && typeof input.endpoint === "string" && input.endpoint.length <= 2048, 400, "Invalid subscription");
  let url;
  try {
    url = new URL(input.endpoint);
  } catch {
    throw new HttpError(400, "Invalid subscription");
  }
  const allowed = url.hostname === "fcm.googleapis.com" || url.hostname === "updates.push.services.mozilla.com" || url.hostname === "web.push.apple.com" || /^[a-z0-9-]+\.notify\.windows\.com$/.test(url.hostname);
  requireThat(allowed && url.protocol === "https:" && !url.port && !url.username && !url.password && !url.hash, 400, "Unsupported push service");
  const publicKey = bytes(input.keys?.p256dh), auth = bytes(input.keys?.auth);
  requireThat(publicKey.length === 65 && publicKey[0] === 4 && auth.length === 16, 400, "Invalid subscription keys");
  try {
    await crypto.subtle.importKey("raw", publicKey, { name: "ECDH", namedCurve: "P-256" }, false, []);
  } catch {
    throw new HttpError(400, "Invalid subscription keys");
  }
  return { endpoint: url.href, expirationTime: null, keys: { p256dh: b64url(publicKey), auth: b64url(auth) } };
}
function createWorker({ fetchImpl = (...args) => fetch(...args), now = () => Date.now() } = {}) {
  const initialized = /* @__PURE__ */ new WeakSet();
  async function initialize(db) {
    if (initialized.has(db)) return;
    await db.batch(SCHEMA.map((sql) => db.prepare(sql)));
    initialized.add(db);
  }
  async function getDocument(path, token, optional = false) {
    const response = await fetchImpl(DOCUMENTS + path, { headers: { Authorization: `Bearer ${token}` }, redirect: "error", signal: AbortSignal.timeout(8e3) });
    if (optional && response.status === 404) return null;
    requireThat(response.ok, response.status === 401 ? 401 : response.status === 403 ? 403 : 503, "Unable to verify account");
    const document = await response.json();
    return { data: Object.fromEntries(Object.entries(document.fields || {}).map(([k, v]) => [k, field(v)])), createdAt: Date.parse(document.createTime), updatedAt: Date.parse(document.updateTime || document.createTime) };
  }
  async function account(request) {
    const token = (request.headers.get("Authorization") || "").match(/^Bearer ([^\s]+)$/)?.[1];
    requireThat(token, 401, "Sign in required");
    const payload = claims(token);
    const profile = await getDocument(`profiles/${encodeURIComponent(payload.sub)}`, token);
    requireThat(profile.data.id === payload.sub, 401, "Invalid account");
    const pairId = profile.data.pairId;
    requireThat(typeof pairId === "string" && /^[a-f0-9]{32}$/.test(pairId), 409, "Connect both accounts first");
    const pair = await getDocument(`pairs/${pairId}`, token);
    requireThat(Array.isArray(pair.data.members) && pair.data.members.length === 2 && new Set(pair.data.members).size === 2 && pair.data.members.includes(payload.sub), 409, "Connect both accounts first");
    return { uid: payload.sub, pairId, recipient: pair.data.members.find((uid) => uid !== payload.sub), profile: profile.data, token };
  }
  async function quietState(user) {
    const state = await getDocument(`pairs/${user.pairId}/states/${encodeURIComponent(user.uid)}`, user.token, true);
    const sleeping = ["dormir", "sesta"].includes(state?.data.status);
    const until = statusExpiry(state?.data);
    return sleeping && until > now() ? until : 0;
  }
  async function saveQuiet(db, user) {
    const quiet = await quietState(user);
    await db.prepare("INSERT INTO push_preferences(uid,pair_id,quiet_until) VALUES(?,?,?) ON CONFLICT(uid) DO UPDATE SET pair_id=excluded.pair_id,quiet_until=excluded.quiet_until").bind(user.uid, user.pairId, quiet).run();
    return quiet;
  }
  async function keyPair(db) {
    let row = await db.prepare("SELECT public_key,private_key FROM push_keys WHERE id=1").first();
    if (!row) {
      const keys = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
      const [publicKey, privateKey] = await Promise.all([crypto.subtle.exportKey("raw", keys.publicKey), crypto.subtle.exportKey("jwk", keys.privateKey)]);
      await db.prepare("INSERT OR IGNORE INTO push_keys(id,public_key,private_key) VALUES(1,?,?)").bind(b64url(publicKey), privateKey.d).run();
      row = await db.prepare("SELECT public_key,private_key FROM push_keys WHERE id=1").first();
    }
    return { publicKey: row.public_key, privateKey: row.private_key, subject: "https://manuelsampaio.github.io/sully.loc/" };
  }
  async function limit(db, uid) {
    const minute = Math.floor(now() / 6e4);
    const row = await db.prepare("INSERT INTO push_limits(uid,minute,count) VALUES(?,?,1) ON CONFLICT(uid,minute) DO UPDATE SET count=count+1 RETURNING count").bind(uid, minute).first();
    requireThat(row.count <= 30, 429, "Try again shortly");
    await db.batch([
      db.prepare("DELETE FROM push_limits WHERE uid=? AND minute<?").bind(uid, minute - 2),
      db.prepare("DELETE FROM push_deliveries WHERE created_at<?").bind(now() - 864e5)
    ]);
  }
  async function body(request) {
    requireThat((request.headers.get("Content-Type") || "").split(";")[0] === "application/json", 415, "JSON required");
    const reader = request.body?.getReader();
    requireThat(reader, 400, "Missing request");
    const chunks = [];
    let size = 0;
    for (; ; ) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 8192) {
        await reader.cancel();
        throw new HttpError(413, "Request too large");
      }
      chunks.push(value);
    }
    const data = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      data.set(chunk, offset);
      offset += chunk.length;
    }
    try {
      const value = JSON.parse(new TextDecoder().decode(data));
      requireThat(value && typeof value === "object" && !Array.isArray(value), 400, "Invalid request");
      return value;
    } catch {
      throw new HttpError(400, "Invalid request");
    }
  }
  async function deviceId(endpoint) {
    return b64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(endpoint)));
  }
  return {
    async fetch(request, env) {
      const origin = request.headers.get("Origin");
      const headers = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Vary": "Origin" };
      if (origin === ORIGIN) Object.assign(headers, { "Access-Control-Allow-Origin": ORIGIN, "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS", "Access-Control-Allow-Headers": "Authorization, Content-Type", "Access-Control-Max-Age": "600" });
      const response = (data, status = 200) => new Response(JSON.stringify(data), { status, headers });
      let stage;
      try {
        requireThat(!origin || origin === ORIGIN, 403, "Origin not allowed");
        if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
        const path = new URL(request.url).pathname;
        if (path === "/" && request.method === "GET") {
          requireThat(env.DB, 503, "Database binding DB is missing");
          await env.DB.prepare("SELECT 1 AS ready").first();
          return response({ service: "Sully notifications", database: "connected", configured: true, activities: true });
        }
        requireThat(["/v1/key", "/v1/subscriptions", "/v1/preferences", "/v1/send"].includes(path), 404, "Not found");
        requireThat(path === "/v1/key" && request.method === "GET" || path === "/v1/subscriptions" && ["POST", "DELETE"].includes(request.method) || ["/v1/preferences", "/v1/send"].includes(path) && request.method === "POST", 405, "Method not allowed");
        if (request.method !== "GET") requireThat(origin === ORIGIN, 403, "Origin required");
        stage = "firebase";
        const user = await account(request);
        requireThat(env.DB, 503, "Database unavailable");
        const db = env.DB;
        stage = "d1-schema";
        await initialize(db);
        stage = "d1-limits";
        await limit(db, user.uid);
        stage = "vapid-key";
        if (path === "/v1/key") return response({ publicKey: (await keyPair(db)).publicKey });
        stage = void 0;
        const input = await body(request);
        if (path === "/v1/subscriptions" && request.method === "POST") {
          requireThat(typeof input.preview === "boolean", 400, "Choose preview preference");
          const subscription = await validateSubscription(input.subscription), id = await deviceId(subscription.endpoint);
          const existing = await db.prepare("SELECT uid FROM push_devices WHERE id=?").bind(id).first();
          requireThat(!existing || existing.uid === user.uid, 409, "Remove previous subscription first");
          const count = await db.prepare("SELECT COUNT(*) AS count FROM push_devices WHERE uid=?").bind(user.uid).first();
          requireThat(existing || count.count < 5, 409, "Device limit reached");
          const quiet = await saveQuiet(db, user);
          await keyPair(db);
          const result = await db.prepare("INSERT INTO push_devices(id,uid,pair_id,subscription,preview,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET pair_id=excluded.pair_id,subscription=excluded.subscription,preview=excluded.preview,updated_at=excluded.updated_at WHERE push_devices.uid=excluded.uid").bind(id, user.uid, user.pairId, JSON.stringify(subscription), input.preview ? 1 : 0, now()).run();
          requireThat(result.meta.changes === 1, 409, "Subscription belongs to another account");
          return response({ enabled: true, id, quietUntil: quiet });
        }
        if (path === "/v1/subscriptions" && request.method === "DELETE") {
          requireThat(typeof input.id === "string" && /^[A-Za-z0-9_-]{43}$/.test(input.id), 400, "Invalid device");
          await db.prepare("DELETE FROM push_devices WHERE id=? AND uid=?").bind(input.id, user.uid).run();
          return response({ enabled: false });
        }
        if (path === "/v1/preferences") {
          const quiet = await saveQuiet(db, user);
          if (typeof input.preview === "boolean") {
            requireThat(typeof input.id === "string", 400, "Device required");
            await db.prepare("UPDATE push_devices SET preview=? WHERE id=? AND uid=?").bind(input.preview ? 1 : 0, input.id, user.uid).run();
          }
          return response({ quietUntil: quiet });
        }
        let event = null, deliveryId, category;
        if (Object.keys(input).length === 1 && typeof input.eventId === "string") {
          requireThat(/^[a-zA-Z0-9_-]{1,100}$/.test(input.eventId), 400, "Event ID required");
          event = await getDocument(`pairs/${user.pairId}/events/${input.eventId}`, user.token);
          requireThat(event.data.from === user.uid && event.data.id === input.eventId && ["quick", "text", "note", "drawing"].includes(event.data.kind), 403, "Cannot send this event");
          requireThat(Number.isFinite(event.createdAt) && event.createdAt >= now() - 3e5 && event.createdAt <= now() + 3e4, 409, "Event expired");
          deliveryId = input.eventId;
          category = event.data.kind === "text" ? "message" : event.data.kind;
        } else {
          requireThat(Object.keys(input).length === 1 && input.activity && Object.keys(input.activity).length === 3, 400, "Activity required");
          let action;
          try {
            action = activityRequest(input.activity.type, input.activity.id, input.activity.revision).activity;
          } catch {
            throw new HttpError(400, "Invalid activity");
          }
          if (user.profile.sharing?.[action.type] !== true) return response({ sent: 0, private: true });
          const ownId = encodeURIComponent(user.uid), id = encodeURIComponent(action.id);
          const suffix = action.type === "mood" ? `moods/${ownId}/entries/${id}` : action.type === "status" ? `states/${ownId}` : `locations/${ownId}`;
          if (action.type !== "mood") requireThat(action.id === user.uid, 403, "Cannot send this activity");
          const saved = await getDocument(`pairs/${user.pairId}/${suffix}`, user.token);
          requireThat(saved.data.id === action.id && (action.type === "status" || saved.data.from === user.uid) && saved.data.ts === action.revision, 409, "Activity changed");
          requireThat(Number.isFinite(saved.updatedAt) && saved.updatedAt >= now() - 3e5 && saved.updatedAt <= now() + 3e4, 409, "Activity expired");
          deliveryId = "activity_" + b64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${user.pairId}:${suffix}:${saved.updatedAt}`)));
          category = action.type;
        }
        const partner = await getDocument(`profiles/${encodeURIComponent(user.recipient)}`, user.token);
        requireThat(partner.data.pairId === user.pairId && partner.data.id === user.recipient, 403, "Partner is not connected");
        const preferences = await db.prepare("SELECT quiet_until FROM push_preferences WHERE uid=? AND pair_id=?").bind(user.recipient, user.pairId).first();
        if (!preferences || preferences.quiet_until === -1 || preferences.quiet_until > now()) return response({ sent: 0, muted: true });
        const devices = await db.prepare("SELECT id,subscription,preview FROM push_devices WHERE uid=? AND pair_id=? ORDER BY updated_at DESC LIMIT 5").bind(user.recipient, user.pairId).all();
        if (!devices.results.length) return response({ sent: 0 });
        const vapid = await keyPair(db);
        let sent = 0, retry = false;
        for (const device of devices.results) {
          const claimed = await db.prepare("INSERT OR IGNORE INTO push_deliveries(pair_id,event_id,device_id,created_at) VALUES(?,?,?,?)").bind(user.pairId, deliveryId, device.id, now()).run();
          if (!claimed.meta.changes) continue;
          let permanent = false;
          try {
            const subscription = await validateSubscription(JSON.parse(device.subscription));
            const text = event?.data.kind === "drawing" ? "Partilhou um desenho contigo." : String(event?.data.text || "Enviou-te uma mensagem.").slice(0, 500);
            const payload = { title: "Sully", body: event && device.preview ? `${String(user.profile.name).slice(0, 40)}: ${text}` : noticeText[category] + " Abre a Sully.", category, eventId: deliveryId, ts: now() };
            const message = await buildPushPayload({ data: JSON.stringify(payload), options: { ttl: 300, urgency: "normal", topic: deliveryId.replaceAll("-", "").slice(0, 32) } }, subscription, vapid);
            const result = await fetchImpl(subscription.endpoint, { ...message, redirect: "error", signal: AbortSignal.timeout(8e3) });
            if (result.ok) {
              sent++;
              continue;
            }
            permanent = [404, 410].includes(result.status);
            if (permanent) await db.prepare("DELETE FROM push_devices WHERE id=?").bind(device.id).run();
          } catch {
          }
          if (!permanent) {
            retry = true;
            await db.prepare("DELETE FROM push_deliveries WHERE pair_id=? AND event_id=? AND device_id=?").bind(user.pairId, deliveryId, device.id).run();
          }
        }
        return response({ sent, retry }, retry ? 503 : 200);
      } catch (error) {
        const status = error instanceof HttpError ? error.status : 503;
        const message = error instanceof HttpError ? error.message : "Notification service unavailable";
        return response({ error: message, ...status === 503 && stage ? { stage } : {} }, status);
      }
    }
  };
}
var worker_source_default = createWorker();
export {
  createWorker,
  worker_source_default as default,
  validateSubscription
};
