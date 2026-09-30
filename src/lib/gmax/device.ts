/** Stable device id for payment-page unlock binding */

const KEY = "gmax.deviceId";

function randomId(len = 12): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  const arr = new Uint8Array(len);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(arr);
    for (let i = 0; i < len; i++) out += chars[arr[i]! % chars.length];
  } else {
    for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

export function getDeviceId(): string {
  try {
    let id = localStorage.getItem(KEY);
    if (id && /^[A-Z0-9]{8,20}$/i.test(id)) return id.toUpperCase();
    id = randomId(12);
    localStorage.setItem(KEY, id);
    return id;
  } catch {
    return randomId(12);
  }
}
