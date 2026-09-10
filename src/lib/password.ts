import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

function derive(password: string, salt: Buffer) {
  return new Promise<Buffer>((resolve, reject) =>
    scrypt(password, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (error, key) =>
      error ? reject(error) : resolve(key),
    ),
  );
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const derived = await derive(password, salt);
  return `scrypt$32768$8$1$${salt.toString("hex")}$${derived.toString("hex")}`;
}

export async function verifyPassword(password: string, hash: string) {
  const [algorithm, n, r, p, salt, digest] = hash.split("$");
  if (
    algorithm !== "scrypt" ||
    n !== "32768" ||
    r !== "8" ||
    p !== "1" ||
    !/^[a-f0-9]{32}$/.test(salt ?? "") ||
    !/^[a-f0-9]{128}$/.test(digest ?? "")
  )
    return false;
  const derived = await derive(password, Buffer.from(salt, "hex"));
  return timingSafeEqual(derived, Buffer.from(digest, "hex"));
}
