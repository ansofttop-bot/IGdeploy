import crypto from "node:crypto";

/**
 * SHA-256 hashes of the 45 one-time IGseek Pro (30-day) license keys.
 * Plaintext keys are NEVER stored in source code or client bundles — only their
 * one-way SHA-256 digests are embedded here and checked server-side.
 */
export const PRO_LICENSE_KEY_HASHES: ReadonlySet<string> = new Set([
  "020f5a91944b6b4e47a23aea9d1854ab1f319e5300ab767a8a9d1587a506770f",
  "b96f0424ccc5e0a515afac60342407d0af783d922cd5b8229a348ddf62924e15",
  "9f9eb11a85141d185fdc650bba4bd912bd91563401ed6cafe841c48ff562bec4",
  "3745d38f0a1d06e3200742ffdf20ddf693e603d76d7381777aaf49ea4a265fd6",
  "b7a6e8bd1b09822f9be427b9621a5069b0b0498883ea7cb22c711df1d1359942",
  "41871d6a67029397e54a9b478c2551cfd60a7c9b113d0f7c3e7c2205f1a0dcdc",
  "dfd85ee460b1a4521de00cd9761635a63b46f277e2c5d0c7647832802ebca693",
  "642791801ec000a2c65702a2d7917633d3e7cc9349675f4d8b6c1b8d6d34db2e",
  "c258ee7056cbfb20eb24492165c486d3bd3a5cee0cb38cc52fe16f552ed6193a",
  "80a65375431266af97f92705fc36591a390a08581b9c1cd90b6a399530461918",
  "35dac869bf693e96c1a87978b867c6e8b85ef812e5a41f1a157e6df3c7c5b6d5",
  "d77d4f302d6c796497b2a4dd8707af9361546c90d65a82af66cef23899b79c35",
  "075e8f422127cdd32c172eeec1cd7ed753ad62883ae8a40e24c5ff3f479d4cee",
  "2a1a696847d07262c2e1e88eb9ab5cd554cba68e9aa4cb409d46a38eed0b8d0a",
  "1936a96804d02c8d10c9a14c86584fdcf2f0ca908ec94c32be3e0bb4638f997b",
  "89373d892a3a441bc774bc3d1df3e95bc3ad2347c6bf5103bfc81d97487cc8d6",
  "888cd7e2643c2c0c6ca13d890d3075d06043ac5a2739bfa0c12d8d090978db71",
  "f1df6d3e6227c357d2ff164f2e17d4ee48cd9679f1189fd9f086710a1d787cff",
  "58db087a0ccf567c1f6757fb7d4ffa6940b35d9d9889a7eae00e555f19765d05",
  "2e6ededcea915fe9805fea1611e45beae627bdccd2fb6a0f88231e147b33b14f",
  "43c1cd7afb48baaa5922a6797aba243c37e437079a82da6944e828943b0dd793",
  "17165a76aa7ad1953ff145378a4e4679cd78e45d9647821815123d5017d3ae3f",
  "8db3268f34eba7ab6539d771c549c8d2b55760060372f54e898d53879dc596e8",
  "40acc6ff9a287b5db4072e5c262395f7ad874f983d90bde51abee02ff5cf51fc",
  "7ede6deddb58b70b4eb5dabaad7f3d0d2a871fbade751a3234f8330c6a57e966",
  "ee4cf3456cc9d6822b0694c78d3f8abf2ece4bce4e5c6b044a764bca137b5595",
  "9b0581d0c1b29c16ef6aa4522255dd8782db096965be3fdbdda851966db01803",
  "693ef738e317e86acf21d33cdfc8acdb017c354a30028a92d9eadd0a2e288ba9",
  "cae1470ddb50ed571bbae62983860032c260363e7aa031e74d44a24c977d1101",
  "bb4e1c74f6c2657e9718462273ae3e1813d0ca8389161389ecc5842761fba36f",
  "9ae1168db3dec321a2e764d0794897afe686e143dfedeb75526472d76c19aabc",
  "1457c3a5b5b3b53bad6719b5ef520b8b849026730d78ebe8fd2f7b52afb4568e",
  "44f3ef6c714019de2e46120a94e5bc9ed3059b5025ca03f96625141b1385f124",
  "127a0199fe5cb30337299bf202a7830cfbf1134319e04838f96da6436e2f7bfe",
  "fb1d958ebce6fcab954b40a2a22f9f520375e79880bf88878a48e9fea29e1783",
  "df25bddf553f99934262007c094f4a1d392722d8ab59cbb347545f4f5257a3cd",
  "6fbcd4ee986e2af7e70b2808262bb312e6d1480d9dc2ca6cf9440d6d811f07f6",
  "acf01f9113ea74d0d3e559d35f581b0ec792311c28165ed51596a6899e17425c",
  "dec74547864e9a9bf669f1707bb21e1f76b475b6f13726158659eb30d285b171",
  "d7af34a728a7f6f5a7ea1e70f4dcfef98a277a51c5beb9345c0693279b744ff8",
  "9d9e1145f92f322ae0c22b5c76dbe3753fccda643da5ada7137743716587ca3e",
  "92fb6fc2bdbcd5556f097410ec359e451d1ee715d27472dd8d2aa6d12c2e208b",
  "cd6dd827051c6058c5a4a47696b05c86f4da483330ee73d72bb5ece527199906",
  "0adaef9c0f56a81b76b0b9765675c68c4fc8c4244968af09f6a87820f4bb7c3b",
  "8495b8ce99c644d6b0ad4f6654247059909e47978bb13f8019639f9fcf9f3dd5",
]);

const LICENSE_KEY_REGEX = /^IGSK-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/;

/**
 * Normalizes a user-entered license key: trims whitespace/quotes, converts to
 * uppercase, normalizes Unicode dashes, and inserts standard hyphens if the
 * user pasted the 16 characters continuously (e.g. `IGSKXXXXXXXXXXXX`).
 */
export function normalizeLicenseKey(raw: string): string {
  const cleaned = String(raw || "")
    .trim()
    .replace(/^["'`]+|["'`]+$/g, "")
    .replace(/[\u2010-\u2015\u2212\s]+/g, "-")
    .toUpperCase();

  const stripped = cleaned.replace(/-/g, "");
  if (stripped.length === 16 && stripped.startsWith("IGSK")) {
    return `IGSK-${stripped.slice(4, 8)}-${stripped.slice(8, 12)}-${stripped.slice(12, 16)}`;
  }
  return cleaned;
}

export function isValidLicenseKeyFormat(normalized: string): boolean {
  return LICENSE_KEY_REGEX.test(normalized);
}

export function hashLicenseKey(normalized: string): string {
  return crypto.createHash("sha256").update(normalized, "utf8").digest("hex");
}

function getExtraEnvHashes(): Set<string> {
  const raw = (process.env.EXTRA_PRO_KEY_HASHES || "").trim();
  if (!raw) return new Set();
  const out = new Set<string>();
  for (const entry of raw.split(/[\s,;]+/)) {
    const clean = entry.trim().toLowerCase();
    if (/^[a-f0-9]{64}$/.test(clean)) {
      out.add(clean);
    }
  }
  return out;
}

export function isKnownLicenseKeyHash(
  keyHash: string,
  extraAllowedHashes?: ReadonlySet<string>,
): boolean {
  const clean = String(keyHash || "").trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(clean)) return false;
  if (PRO_LICENSE_KEY_HASHES.has(clean)) return true;
  if (extraAllowedHashes?.has(clean)) return true;
  return getExtraEnvHashes().has(clean);
}
