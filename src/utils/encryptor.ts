import * as crypto from "node:crypto";

type LoginData = {
    access_token: string,
    expired_at: number,
    nonce: any
};

const ENCRYPTION_KEY = Buffer.from(process.env.ENCRYPTION_KEY!, "hex");

const encryptData = (payload: string) => {
    const iv = crypto.randomBytes(12)
    const cipher = crypto.createCipheriv('aes-256-gcm', ENCRYPTION_KEY, iv)
    const encrypted = Buffer.concat([cipher.update(payload, "utf8"), cipher.final()]);
    const authTag = cipher.getAuthTag();

    return Buffer.concat([iv, authTag, encrypted]).toString("base64")
}

export const decryptData = (encrypted: string) => {
    const raw = Buffer.from(encrypted, "base64");
    const iv = raw.subarray(0, 12);
    const authTag = raw.subarray(12, 28);
    const ciphertext = raw.subarray(28);

    const decipher = crypto.createDecipheriv("aes-256-gcm", ENCRYPTION_KEY, iv);
    decipher.setAuthTag(authTag);

    return decipher.update(ciphertext) + decipher.final("utf8");
}

export const encryptLoginData = (access_token: string, nonce: string | null = null): string => {
    if (!access_token) {
        throw new Error("No access token provided");
    }

    if (!nonce) {
        return encryptData(JSON.stringify({
            "access_token": access_token
        }))
    }
    const payload = {
        "access_token": access_token,
        "expired_at": Date.now() + 60_000,
        "nonce": nonce
    }

    return encryptData(JSON.stringify(payload));
}

export const decryptLoginData = (encrypted: string) => {
    if (!encrypted) throw new Error("No encrypted data provided");

    let decrypted: string;
    try {
        decrypted = decryptData(encrypted);     // AES fail -> catch
    } catch {
        throw new Error("Decryption failed 💀");
    }

    let data: LoginData;
    try {
        data = JSON.parse(decrypted);
    } catch {
        throw new Error("Invalid JSON format 🔥");
    }

    if (!data?.access_token) throw new Error("Data provided is invalid");
    if (!data.expired_at || data.expired_at < Date.now()) throw new Error("Token expired");

    return data;
};
