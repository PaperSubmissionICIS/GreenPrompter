/**
 * GreenPrompt Background Service Worker
 * Handles extension installation and icon clicks
 */

importScripts("logging.js");

let nlpWarmupPromise = null;
let nlpCoreLoaded = false;

const FOLLOW_UP_BASE_URL =
  "https://survey.ise.tu-darmstadt.de/greenAI_extension/";
const FOLLOW_UP_T1_QUERY = "qnr5";
const FOLLOW_UP_T5_QUERY = "qnr6";

const ALARM_T1 = "greenprompt_followup_t1";
const ALARM_T5 = "greenprompt_followup_t5";
const ALARM_NEXTCLOUD_UPLOAD = "greenprompt_nextcloud_upload_daily";
const ALARM_SOSCI_UPLOAD_DAILY = "greenprompt_sosci_upload_daily";

const ENABLE_NEXTCLOUD_UPLOAD_FALLBACK = false;

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const FIVE_DAYS_MS = 5 * ONE_DAY_MS;
const NEXTCLOUD_UPLOAD_PERIOD_MINUTES = 24 * 60;
const NEXTCLOUD_MIN_ATTEMPT_INTERVAL_MS = 2 * 60 * 1000;
const NEXTCLOUD_DEFAULT_RATE_LIMIT_DELAY_MS = 15 * 60 * 1000;
const NEXTCLOUD_SCHEDULE_JITTER_MINUTES = 30;

const NEXTCLOUD_CONFIG = {
  host: "https://next.hessenbox.de",
  webdavBaseUrl: "",
  uploadFolderPath: "",
  authUsername: "",
  appPassword: "",
  schemaVersion: 1,
};

const UPLOAD_PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAjaIAhnvqDjDJJaX9qZkG
Q3zvfkj673mwhWxFa2qZSCxKd9nW1Mq2c7buBmUUTDP4I/GlmQ6H6m+TZ2BaY1kf
+17X6rzr6dJz9L43daJjZj8LKtZDM0fYMyORtSeDEE8avgqSiSJQ+zZEWwRoAiG3
bKg9UI3wwak3f9WdwmuedEGVx4WXJdPT5MQFzmsDlcT7ULuzI6ab8bZA2MJgTvfh
6tmULVUWIwrpHTkNBFEi8BvJS9Q6VpVcfnjJemqFSpX4T1a+8FQEXRM38T2PiwSI
gS6UntkiM8yTIgzCzd+xQZqXl0O7gn6cNjkE3osPmOrIhaXlcyB9wCVoIyaiM+h+
bwIDAQAB
-----END PUBLIC KEY-----`;

const NEXTCLOUD_STORAGE_KEYS = {
  status: "nextcloudUploadStatus",
  lastUploadAt: "nextcloudLastUploadAt",
  lastUploadedFileName: "nextcloudLastUploadedFileName",
  lastUploadError: "nextcloudLastUploadError",
  lastUploadTrigger: "nextcloudLastUploadTrigger",
  lastAttemptAt: "nextcloudLastAttemptAt",
  retryCount: "nextcloudUploadRetryCount",
  retryAt: "nextcloudUploadRetryAt",
  rateLimitedUntil: "nextcloudRateLimitedUntil",
  nextScheduledAt: "nextcloudNextScheduledAt",
  authUsername: "nextcloudAuthUsername",
  appPassword: "nextcloudAppPassword",
};

const SOSCI_CONFIG = {
  projectUrl: "https://survey.ise.tu-darmstadt.de/greenAI_extension/",
  initUrl: "https://survey.ise.tu-darmstadt.de/greenAI_extension/?q=upload",
  questionnaireId: "upload",
  fileInputName: "UP01",
  participantIdFieldName: "IV01_01",
  referenceParamName: "uuid",
  submitField: "submitNxt",
};

const SOSCI_LARGE_TEST_DEFAULT_SIZE_MB = 5;
const SOSCI_LARGE_TEST_MIN_SIZE_MB = 1;
const SOSCI_LARGE_TEST_MAX_SIZE_MB = 15;
const DEBUG_FEATURES_ENABLED_KEY = "debugFeaturesEnabled";
const SOSCI_STORAGE_KEYS = {
  lastDailyUploadAt: "sosciLastDailyUploadAt",
  nextScheduledAt: "sosciNextScheduledAt",
};

const textEncoder = new TextEncoder();

const logger = globalThis.GreenPromptLogger || null;
if (logger && typeof logger.initLogger === "function") {
  logger.initLogger({ source: "background" });
}

function parseDelayOverride(value, fallbackMs) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallbackMs;
  }
  return parsed;
}

function normalizeUuid(uuid) {
  return String(uuid || "")
    .trim()
    .toLowerCase();
}

function storageGet(keys) {
  return new Promise((resolve) => {
    chrome.storage.local.get(keys, (result) => {
      resolve(result || {});
    });
  });
}

function storageSet(payload) {
  return new Promise((resolve) => {
    chrome.storage.local.set(payload, () => {
      resolve();
    });
  });
}

async function isDebugRuntimeEnabled() {
  const result = await storageGet([DEBUG_FEATURES_ENABLED_KEY]);
  return Boolean(result[DEBUG_FEATURES_ENABLED_KEY]);
}

function toBase64(bytes) {
  const input = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < input.length; i += chunkSize) {
    const chunk = input.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

function base64ToArrayBuffer(base64) {
  const binary = atob(String(base64 || ""));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

function utf8ToBase64(input) {
  return toBase64(textEncoder.encode(String(input || "")));
}

function parsePemPublicKey(pem) {
  const normalized = String(pem || "")
    .replace(/-----BEGIN PUBLIC KEY-----/g, "")
    .replace(/-----END PUBLIC KEY-----/g, "")
    .replace(/\s+/g, "");
  return base64ToArrayBuffer(normalized);
}

async function importRsaPublicKeyFromPem(pem) {
  const keyData = parsePemPublicKey(pem);
  return crypto.subtle.importKey(
    "spki",
    keyData,
    {
      name: "RSA-OAEP",
      hash: "SHA-256",
    },
    false,
    ["encrypt"],
  );
}

function sanitizeSnapshotForUpload(snapshot) {
  const safeSnapshot = snapshot && typeof snapshot === "object" ? snapshot : {};
  const settings =
    safeSnapshot.settings && typeof safeSnapshot.settings === "object"
      ? safeSnapshot.settings
      : {};
  const promptTextMode = String(
    settings.promptTextMode || "none",
  ).toLowerCase();

  const promptRecords = Array.isArray(safeSnapshot.promptRecords)
    ? safeSnapshot.promptRecords.map((record) => {
        if (!record || typeof record !== "object") {
          return record;
        }
        if (promptTextMode !== "none") {
          return record;
        }
        return {
          ...record,
          originalPrompt: "",
          optimizedPrompt: "",
        };
      })
    : [];

  return {
    schemaVersion: Number(safeSnapshot.schemaVersion) || 1,
    generatedAt: new Date().toISOString(),
    uploadMode: "cumulative",
    events: Array.isArray(safeSnapshot.events) ? safeSnapshot.events : [],
    promptRecords,
    counters:
      safeSnapshot.counters && typeof safeSnapshot.counters === "object"
        ? safeSnapshot.counters
        : {},
    meta:
      safeSnapshot.meta && typeof safeSnapshot.meta === "object"
        ? safeSnapshot.meta
        : {},
    settings,
  };
}

async function encryptBatchPayload(payloadObj, participantUUID) {
  const publicKey = await importRsaPublicKeyFromPem(UPLOAD_PUBLIC_KEY_PEM);
  const aesKey = await crypto.subtle.generateKey(
    {
      name: "AES-GCM",
      length: 256,
    },
    true,
    ["encrypt"],
  );

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const serialized = JSON.stringify(payloadObj);
  const plaintextBytes = textEncoder.encode(serialized);
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv,
    },
    aesKey,
    plaintextBytes,
  );

  const rawAesKey = await crypto.subtle.exportKey("raw", aesKey);
  const encryptedKey = await crypto.subtle.encrypt(
    {
      name: "RSA-OAEP",
    },
    publicKey,
    rawAesKey,
  );

  return {
    schemaVersion: NEXTCLOUD_CONFIG.schemaVersion,
    alg: "AES-GCM-256",
    keyAlg: "RSA-OAEP-256",
    iv: toBase64(iv),
    encryptedKey: toBase64(new Uint8Array(encryptedKey)),
    ciphertext: toBase64(new Uint8Array(ciphertext)),
    createdAt: new Date().toISOString(),
    participantUUID: normalizeUuid(participantUUID),
  };
}

function getIsoFileSafeTimestamp() {
  return new Date().toISOString().replace(/[.:]/g, "-");
}

function buildEncryptedFileName(participantUUID) {
  const safeUuid = normalizeUuid(participantUUID) || "unknown-participant";
  return `${safeUuid}_${getIsoFileSafeTimestamp()}.batch.enc.json`;
}

function buildBasicAuthHeader(username, password) {
  return `Basic ${utf8ToBase64(`${String(username || "")}:${String(password || "")}`)}`;
}

function normalizeSosciProjectUrl(url) {
  const normalized = String(url || "").trim();
  if (!normalized) {
    return "";
  }
  try {
    const parsed = new URL(normalized);
    parsed.hash = "";
    const pathname = parsed.pathname.endsWith("/")
      ? parsed.pathname
      : `${parsed.pathname}/`;
    parsed.pathname = pathname;
    parsed.search = "";
    return parsed.toString();
  } catch (_error) {
    return normalized.endsWith("/") ? normalized : `${normalized}/`;
  }
}

function normalizeSosciInitUrl(url) {
  const normalized = String(url || "").trim();
  if (!normalized) {
    return "";
  }
  try {
    const parsed = new URL(normalized);
    parsed.hash = "";
    return parsed.toString();
  } catch (_error) {
    return normalized;
  }
}

function extractSosciSessionToken(html, responseUrl) {
  const responseUrlValue = String(responseUrl || "");
  if (responseUrlValue) {
    try {
      const parsed = new URL(responseUrlValue);
      const fromUrl = parsed.searchParams.get("i");
      if (fromUrl) {
        return fromUrl;
      }
    } catch (_error) {
      // ignore URL parse errors and continue with HTML parsing
    }
  }

  const source = String(html || "");
  const patterns = [
    /name=["']i["'][^>]*value=["']([^"']+)["']/i,
    /value=["']([^"']+)["'][^>]*name=["']i["']/i,
    /index\.php\?i=([A-Za-z0-9_-]+)/i,
    /[?&]i=([A-Za-z0-9_-]+)/i,
  ];

  for (let i = 0; i < patterns.length; i += 1) {
    const match = source.match(patterns[i]);
    if (match && match[1]) {
      return match[1];
    }
  }

  return "";
}

function getHtmlAttribute(tagHtml, attributeName) {
  const tag = String(tagHtml || "");
  const attr = String(attributeName || "").trim();
  if (!tag || !attr) {
    return "";
  }

  const quotedPattern = new RegExp(`${attr}\\s*=\\s*["']([^"']*)["']`, "i");
  const quotedMatch = tag.match(quotedPattern);
  if (quotedMatch && quotedMatch[1] !== undefined) {
    return quotedMatch[1];
  }

  const unquotedPattern = new RegExp(`${attr}\\s*=\\s*([^\\s>]+)`, "i");
  const unquotedMatch = tag.match(unquotedPattern);
  if (unquotedMatch && unquotedMatch[1] !== undefined) {
    return unquotedMatch[1];
  }

  return "";
}

function extractSosciFormMeta(html, baseUrl) {
  const source = String(html || "");
  const formMatch = source.match(/<form\b[^>]*>[\s\S]*?<\/form>/i);
  if (!formMatch) {
    return {
      actionUrl: String(baseUrl || ""),
      hiddenFields: {},
    };
  }

  const formBlock = formMatch[0];
  const openingTagMatch = formBlock.match(/<form\b[^>]*>/i);
  const openingTag = openingTagMatch ? openingTagMatch[0] : "";
  const actionRaw = getHtmlAttribute(openingTag, "action");
  let actionUrl = String(baseUrl || "");
  if (actionRaw) {
    try {
      actionUrl = new URL(actionRaw, baseUrl).toString();
    } catch (_error) {
      actionUrl = String(baseUrl || "");
    }
  }

  const hiddenFields = {};
  const inputTags = formBlock.match(/<input\b[^>]*>/gi) || [];
  inputTags.forEach((tag) => {
    const inputType = String(getHtmlAttribute(tag, "type") || "").toLowerCase();
    if (inputType !== "hidden") {
      return;
    }

    const name = getHtmlAttribute(tag, "name");
    if (!name) {
      return;
    }
    const value = getHtmlAttribute(tag, "value");
    hiddenFields[name] = value;
  });

  return { actionUrl, hiddenFields };
}

function extractSosciFileInputNames(html) {
  const source = String(html || "");
  const formMatch = source.match(/<form\b[^>]*>[\s\S]*?<\/form>/i);
  if (!formMatch) {
    return [];
  }

  const fileFields = [];
  const inputTags = formMatch[0].match(/<input\b[^>]*>/gi) || [];
  inputTags.forEach((tag) => {
    const inputType = String(getHtmlAttribute(tag, "type") || "").toLowerCase();
    if (inputType !== "file") {
      return;
    }
    const name = String(getHtmlAttribute(tag, "name") || "").trim();
    if (name) {
      fileFields.push(name);
    }
  });

  return fileFields;
}

function detectSosciInitBlockingReason(html) {
  const source = String(html || "").toLowerCase();

  if (
    source.includes("survey not available yet") ||
    source.includes("has not been published yet")
  ) {
    return "SoSci questionnaire is not published yet.";
  }

  if (source.includes("access denied") || source.includes("forbidden")) {
    return "SoSci questionnaire access denied.";
  }

  if (source.includes("login") && source.includes("password")) {
    return "SoSci questionnaire appears to be access-protected.";
  }

  return "";
}

async function getSosciConfig() {
  const projectUrl = normalizeSosciProjectUrl(SOSCI_CONFIG.projectUrl);
  const questionnaireId = String(SOSCI_CONFIG.questionnaireId).trim();
  const configuredInitUrl = normalizeSosciInitUrl(SOSCI_CONFIG.initUrl);

  let initUrl = configuredInitUrl;
  if (!initUrl && projectUrl && questionnaireId) {
    const fallbackInitUrl = new URL(projectUrl);
    fallbackInitUrl.searchParams.set("q", questionnaireId);
    initUrl = fallbackInitUrl.toString();
  }

  return {
    projectUrl,
    initUrl,
    questionnaireId,
    fileInputName: String(SOSCI_CONFIG.fileInputName).trim(),
    participantIdFieldName: String(
      SOSCI_CONFIG.participantIdFieldName || "IV01_01",
    ).trim(),
    referenceParamName: String(
      SOSCI_CONFIG.referenceParamName || "uuid",
    ).trim(),
    submitField: String(SOSCI_CONFIG.submitField).trim(),
  };
}

async function performSosciUploadWithCurrentSnapshot(trigger = "popup_debug") {
  const participantState = await storageGet([
    "participantUUID",
    "onboardingCompleted",
  ]);
  const participantUUID = normalizeUuid(participantState.participantUUID);
  const onboardingCompleted = Boolean(participantState.onboardingCompleted);

  if (!participantUUID || !onboardingCompleted) {
    throw new Error("SoSci upload skipped: onboarding not completed.");
  }

  if (!logger || typeof logger.getLogSnapshot !== "function") {
    throw new Error("Logger API unavailable in background service worker.");
  }

  const snapshot = await logger.getLogSnapshot();
  const payload = sanitizeSnapshotForUpload(snapshot);
  payload.participantUUID = participantUUID;

  const envelope = await encryptBatchPayload(payload, participantUUID);
  const encryptedJsonString = JSON.stringify(envelope);
  const ok = await uploadToSoSci(encryptedJsonString, participantUUID);

  if (!ok) {
    throw new Error("SoSci upload returned non-ok response.");
  }

  appendStudyEvent("sosci_upload_triggered", {
    trigger,
    participantUUID,
    schemaVersion: envelope.schemaVersion,
  });

  return {
    success: true,
    participantUUID,
    trigger,
    uploadedAt: new Date().toISOString(),
  };
}

async function buildNextcloudDebugUploadPackage(
  trigger = "popup_debug_manual",
) {
  const participantState = await storageGet([
    "participantUUID",
    "onboardingCompleted",
  ]);
  const participantUUID = normalizeUuid(participantState.participantUUID);
  const onboardingCompleted = Boolean(participantState.onboardingCompleted);

  if (!participantUUID || !onboardingCompleted) {
    throw new Error(
      "Debug Nextcloud upload skipped: onboarding not completed.",
    );
  }

  if (!logger || typeof logger.getLogSnapshot !== "function") {
    throw new Error("Logger API unavailable in background service worker.");
  }

  const snapshot = await logger.getLogSnapshot();
  const payload = sanitizeSnapshotForUpload(snapshot);
  payload.participantUUID = participantUUID;

  const envelope = await encryptBatchPayload(payload, participantUUID);
  const fileName = buildEncryptedFileName(participantUUID);

  appendStudyEvent("nextcloud_debug_upload_package_built", {
    trigger,
    participantUUID,
    fileName,
    schemaVersion: envelope.schemaVersion,
  });

  return {
    participantUUID,
    fileName,
    encryptedJsonString: JSON.stringify(envelope),
    createdAt: new Date().toISOString(),
    trigger,
  };
}

function sanitizeSosciTestSizeMb(rawSizeMb) {
  const parsed = Number(rawSizeMb);
  if (!Number.isFinite(parsed)) {
    return SOSCI_LARGE_TEST_DEFAULT_SIZE_MB;
  }
  return Math.min(
    SOSCI_LARGE_TEST_MAX_SIZE_MB,
    Math.max(SOSCI_LARGE_TEST_MIN_SIZE_MB, Math.round(parsed)),
  );
}

function buildSosciLargeTestPayload(targetSizeBytes, participantUUID) {
  const header = {
    schemaVersion: 1,
    payloadType: "sosci_large_upload_test",
    participantUUID: normalizeUuid(participantUUID),
    generatedAt: new Date().toISOString(),
  };

  let payload = {
    ...header,
    pad: "",
  };
  let serialized = JSON.stringify(payload);

  const overheadSafety = 128;
  const requiredPad = Math.max(
    0,
    targetSizeBytes - serialized.length - overheadSafety,
  );
  payload.pad = "x".repeat(requiredPad);
  serialized = JSON.stringify(payload);

  return serialized;
}

async function performSosciLargeTestUpload(options = {}) {
  const participantState = await storageGet([
    "participantUUID",
    "onboardingCompleted",
  ]);
  const participantUUID = normalizeUuid(participantState.participantUUID);
  const onboardingCompleted = Boolean(participantState.onboardingCompleted);

  if (!participantUUID || !onboardingCompleted) {
    throw new Error(
      "SoSci large test upload skipped: onboarding not completed.",
    );
  }

  const sizeMb = sanitizeSosciTestSizeMb(options.sizeMb);
  const targetSizeBytes = sizeMb * 1024 * 1024;
  const payload = buildSosciLargeTestPayload(targetSizeBytes, participantUUID);
  const ok = await uploadToSoSci(payload, participantUUID);

  if (!ok) {
    throw new Error("SoSci large test upload returned non-ok response.");
  }

  appendStudyEvent("sosci_large_test_upload_success", {
    participantUUID,
    sizeMb,
    payloadBytes: payload.length,
    trigger: String(options.trigger || "manual"),
  });

  return {
    success: true,
    participantUUID,
    sizeMb,
    payloadBytes: payload.length,
    uploadedAt: new Date().toISOString(),
    trigger: String(options.trigger || "manual"),
  };
}

/**
 * Upload encrypted payload to a hidden SoSci questionnaire using file upload.
 * @param {string} encryptedJsonString Encrypted payload JSON string.
 * @param {string} participantUUID Participant UUID.
 * @returns {Promise<boolean>} True when upload request returned ok, otherwise false.
 */
async function uploadToSoSci(encryptedJsonString, participantUUID) {
  const config = await getSosciConfig();
  const normalizedParticipantUuid = normalizeUuid(participantUUID);

  if (!config.projectUrl) {
    throw new Error(
      "Missing SoSci setting: sosciProjectUrl (e.g. https://www.soscisurvey.de/DEIN_PROJEKT/)",
    );
  }
  if (!config.initUrl) {
    throw new Error(
      "Missing SoSci setting: sosciInitUrl or sosciQuestionnaireId",
    );
  }
  if (!config.fileInputName) {
    throw new Error("Missing SoSci setting: sosciFileInputName");
  }

  try {
    let initUrl = config.initUrl;
    try {
      const parsedInitUrl = new URL(config.initUrl);
      if (normalizedParticipantUuid && config.referenceParamName) {
        parsedInitUrl.searchParams.set(
          config.referenceParamName,
          normalizedParticipantUuid,
        );
      }
      initUrl = parsedInitUrl.toString();
    } catch (_error) {
      if (normalizedParticipantUuid && config.referenceParamName) {
        const separator = String(config.initUrl).includes("?") ? "&" : "?";
        initUrl = `${config.initUrl}${separator}${encodeURIComponent(config.referenceParamName)}=${encodeURIComponent(normalizedParticipantUuid)}`;
      }
    }

    const initResponse = await fetch(initUrl, {
      credentials: "include",
      cache: "no-store",
    });
    if (!initResponse.ok) {
      const initBody = await initResponse.text();
      throw new Error(
        `SoSci init failed (${initResponse.status} ${initResponse.statusText}): ${initBody.slice(0, 240)}`,
      );
    }
    const html = await initResponse.text();
    const blockingReason = detectSosciInitBlockingReason(html);
    if (blockingReason) {
      throw new Error(
        `${blockingReason} Init URL: ${initUrl} Final URL: ${String(initResponse.url || "n/a")}`,
      );
    }

    const sessionI = extractSosciSessionToken(html, initResponse.url);
    if (!sessionI) {
      throw new Error(
        `SoSci session token not found in init response. Init URL: ${initUrl} Final URL: ${String(initResponse.url || "n/a")}`,
      );
    }

    const formMeta = extractSosciFormMeta(
      html,
      initResponse.url || config.projectUrl,
    );
    const fileInputNames = extractSosciFileInputNames(html);

    const formData = new FormData();
    Object.entries(formMeta.hiddenFields || {}).forEach(([key, value]) => {
      formData.set(key, String(value || ""));
    });
    formData.set("i", sessionI);
    if (normalizedParticipantUuid && config.participantIdFieldName) {
      formData.set(config.participantIdFieldName, normalizedParticipantUuid);
    }

    const blob = new Blob([String(encryptedJsonString || "")], {
      type: "application/json",
    });
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const fileName = `${normalizeUuid(participantUUID) || "participant"}_${timestamp}.enc.json`;
    const fileFieldCandidates = [
      String(config.fileInputName || "").trim(),
      `${String(config.fileInputName || "").trim()}_01`,
      "UP01",
      "UP01_01",
    ].filter(Boolean);

    let resolvedFileInputName = "";
    for (let i = 0; i < fileFieldCandidates.length; i += 1) {
      const candidate = fileFieldCandidates[i];
      if (fileInputNames.includes(candidate)) {
        resolvedFileInputName = candidate;
        break;
      }
    }
    if (!resolvedFileInputName) {
      resolvedFileInputName =
        fileInputNames.length > 0 ? fileInputNames[0] : fileFieldCandidates[0];
    }

    if (!resolvedFileInputName) {
      throw new Error("SoSci file input field could not be resolved.");
    }

    formData.set(resolvedFileInputName, blob, fileName);

    // Simulates clicking "Next" in SoSci to persist upload.
    formData.set(config.submitField || "submitNxt", "1");

    const uploadBase = String(formMeta.actionUrl || "").trim()
      ? String(formMeta.actionUrl)
      : new URL("index.php", initResponse.url || config.projectUrl).toString();
    let uploadUrl = uploadBase;
    try {
      const uploadParsed = new URL(uploadBase);
      if (!uploadParsed.searchParams.get("i")) {
        uploadParsed.searchParams.set("i", sessionI);
      }
      uploadUrl = uploadParsed.toString();
    } catch (_error) {
      uploadUrl = `${uploadBase}${uploadBase.includes("?") ? "&" : "?"}i=${encodeURIComponent(sessionI)}`;
    }
    const uploadResponse = await fetch(uploadUrl, {
      method: "POST",
      credentials: "include",
      body: formData,
    });

    if (uploadResponse.ok) {
      appendStudyEvent("sosci_upload_success", {
        participantUUID: normalizedParticipantUuid,
        participantIdFieldName: config.participantIdFieldName || null,
        referenceParamName: config.referenceParamName || null,
        fileName,
        fileInputName: resolvedFileInputName,
        availableFileInputs: fileInputNames,
        uploadUrl,
        statusCode: uploadResponse.status,
      });
      return true;
    }

    const uploadBody = await uploadResponse.text();
    throw new Error(
      `SoSci upload failed (${uploadResponse.status} ${uploadResponse.statusText}): ${uploadBody.slice(0, 240)}`,
    );
  } catch (error) {
    appendStudyEvent("sosci_upload_error", {
      participantUUID: normalizeUuid(participantUUID),
      error: String(error),
    });
    throw error;
  }
}

function buildAccountWebDavTarget(fileName) {
  const base = String(NEXTCLOUD_CONFIG.webdavBaseUrl || "").replace(/\/+$/, "");
  const folder = String(NEXTCLOUD_CONFIG.uploadFolderPath || "")
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  const encodedFileName = encodeURIComponent(fileName);
  return folder
    ? `${base}/${folder}/${encodedFileName}`
    : `${base}/${encodedFileName}`;
}

async function getNextcloudCredentials() {
  const result = await storageGet([
    NEXTCLOUD_STORAGE_KEYS.authUsername,
    NEXTCLOUD_STORAGE_KEYS.appPassword,
  ]);

  const username = String(
    result[NEXTCLOUD_STORAGE_KEYS.authUsername] ||
      NEXTCLOUD_CONFIG.authUsername ||
      "",
  );
  const password = String(
    result[NEXTCLOUD_STORAGE_KEYS.appPassword] ||
      NEXTCLOUD_CONFIG.appPassword ||
      "",
  );

  return { username, password };
}

async function uploadEncryptedBatchToNextcloud(envelope, fileName) {
  const credentials = await getNextcloudCredentials();
  const authHeader = buildBasicAuthHeader(
    credentials.username,
    credentials.password,
  );
  const target = buildAccountWebDavTarget(fileName);
  const body = JSON.stringify(envelope);

  try {
    const response = await fetch(target, {
      method: "PUT",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json; charset=utf-8",
      },
      body,
    });

    if (response.ok) {
      return {
        success: true,
        target,
        status: response.status,
      };
    }

    const retryAfterHeader = response.headers.get("Retry-After");
    const retryAfterSeconds = Number(retryAfterHeader);
    const retryAfterMs =
      Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
        ? Math.round(retryAfterSeconds * 1000)
        : null;

    const error = new Error(
      `Upload failed (${response.status} ${response.statusText}) at ${target}${retryAfterMs ? ` retry-after=${retryAfterMs}` : ""}`,
    );
    error.httpStatus = response.status;
    error.retryAfterMs = retryAfterMs;
    throw error;
  } catch (error) {
    const wrapped = new Error(`Account WebDAV upload failed: ${String(error)}`);
    wrapped.httpStatus =
      error && Number.isFinite(error.httpStatus) ? error.httpStatus : null;
    wrapped.retryAfterMs =
      error && Number.isFinite(error.retryAfterMs) ? error.retryAfterMs : null;
    throw wrapped;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function hashStringToUInt32(input) {
  const source = String(input || "");
  let hash = 2166136261;
  for (let i = 0; i < source.length; i += 1) {
    hash ^= source.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function computeParticipantSlotMinutes(participantUUID) {
  const hash = hashStringToUInt32(participantUUID);
  const minuteOfDay = hash % (24 * 60);
  const jitterRange = NEXTCLOUD_SCHEDULE_JITTER_MINUTES * 2 + 1;
  const jitter =
    (Math.floor(hash / (24 * 60)) % jitterRange) -
    NEXTCLOUD_SCHEDULE_JITTER_MINUTES;
  return (minuteOfDay + jitter + 24 * 60) % (24 * 60);
}

function computeNextDailySlotTs(participantUUID, nowTs = Date.now()) {
  const slotMinutes = computeParticipantSlotMinutes(participantUUID);
  const now = new Date(nowTs);
  const slot = new Date(nowTs);
  slot.setHours(Math.floor(slotMinutes / 60), slotMinutes % 60, 0, 0);

  if (slot.getTime() <= now.getTime()) {
    slot.setDate(slot.getDate() + 1);
  }

  return slot.getTime();
}

function toIsoDateKey(isoLike) {
  const ts = new Date(isoLike || "").getTime();
  if (!Number.isFinite(ts)) {
    return "";
  }
  return new Date(ts).toISOString().slice(0, 10);
}

function hasUploadedOnCurrentUtcDate(lastUploadedAtIso) {
  if (!lastUploadedAtIso) {
    return false;
  }
  return (
    toIsoDateKey(lastUploadedAtIso) === new Date().toISOString().slice(0, 10)
  );
}

async function scheduleSosciUploadAtNextSlot(reason = "scheduler") {
  const state = await storageGet(["participantUUID", "onboardingCompleted"]);
  const participantUUID = normalizeUuid(state.participantUUID);
  const onboardingCompleted = Boolean(state.onboardingCompleted);

  if (!participantUUID || !onboardingCompleted) {
    chrome.alarms.clear(ALARM_SOSCI_UPLOAD_DAILY);
    await storageSet({ [SOSCI_STORAGE_KEYS.nextScheduledAt]: null });
    return;
  }

  const nextTs = computeNextDailySlotTs(participantUUID, Date.now());
  chrome.alarms.create(ALARM_SOSCI_UPLOAD_DAILY, { when: nextTs });

  await storageSet({
    [SOSCI_STORAGE_KEYS.nextScheduledAt]: new Date(nextTs).toISOString(),
  });

  appendStudyEvent("sosci_daily_upload_scheduled", {
    reason,
    participantUUID,
    nextScheduledAt: new Date(nextTs).toISOString(),
    slotMinutes: computeParticipantSlotMinutes(participantUUID),
  });
}

async function runSosciDailyUpload(trigger = "daily_alarm") {
  const result = await performSosciUploadWithCurrentSnapshot(trigger);
  const uploadedAt = new Date().toISOString();

  await storageSet({
    [SOSCI_STORAGE_KEYS.lastDailyUploadAt]: uploadedAt,
  });

  appendStudyEvent("sosci_daily_upload_success", {
    trigger,
    participantUUID: normalizeUuid(result && result.participantUUID),
    uploadedAt,
  });

  return result;
}

async function maybeRunSosciDailyCatchup(reason = "startup") {
  const state = await storageGet([
    "participantUUID",
    "onboardingCompleted",
    SOSCI_STORAGE_KEYS.lastDailyUploadAt,
  ]);
  const participantUUID = normalizeUuid(state.participantUUID);
  const onboardingCompleted = Boolean(state.onboardingCompleted);
  const lastDailyUploadAt = state[SOSCI_STORAGE_KEYS.lastDailyUploadAt] || null;

  if (!participantUUID || !onboardingCompleted) {
    return { skipped: true, reason: "onboarding_not_completed" };
  }

  if (hasUploadedOnCurrentUtcDate(lastDailyUploadAt)) {
    return { skipped: true, reason: "already_uploaded_today" };
  }

  const result = await runSosciDailyUpload(`daily_catchup_${reason}`);
  return { success: true, result };
}

async function ensureSosciDailyUploadPlan(reason = "scheduler") {
  try {
    await maybeRunSosciDailyCatchup(reason);
  } catch (error) {
    appendStudyEvent("sosci_daily_upload_catchup_error", {
      reason,
      error: String(error),
    });
  }

  await scheduleSosciUploadAtNextSlot(`ensure_${reason}`);
}

async function scheduleNextcloudUploadAtNextSlot(reason = "scheduler") {
  if (!ENABLE_NEXTCLOUD_UPLOAD_FALLBACK) {
    chrome.alarms.clear(ALARM_NEXTCLOUD_UPLOAD);
    await storageSet({ [NEXTCLOUD_STORAGE_KEYS.nextScheduledAt]: null });
    return;
  }

  const state = await storageGet(["participantUUID", "onboardingCompleted"]);
  const participantUUID = normalizeUuid(state.participantUUID);
  const onboardingCompleted = Boolean(state.onboardingCompleted);

  if (!participantUUID || !onboardingCompleted) {
    chrome.alarms.clear(ALARM_NEXTCLOUD_UPLOAD);
    await storageSet({ [NEXTCLOUD_STORAGE_KEYS.nextScheduledAt]: null });
    return;
  }

  const nextTs = computeNextDailySlotTs(participantUUID, Date.now());
  chrome.alarms.create(ALARM_NEXTCLOUD_UPLOAD, { when: nextTs });

  await storageSet({
    [NEXTCLOUD_STORAGE_KEYS.nextScheduledAt]: new Date(nextTs).toISOString(),
  });

  appendStudyEvent("nextcloud_upload_scheduled", {
    reason,
    participantUUID,
    nextScheduledAt: new Date(nextTs).toISOString(),
    slotMinutes: computeParticipantSlotMinutes(participantUUID),
  });
}

async function updateNextcloudStatus(statusPayload) {
  await storageSet({
    [NEXTCLOUD_STORAGE_KEYS.status]: statusPayload,
    [NEXTCLOUD_STORAGE_KEYS.lastUploadAt]:
      statusPayload && statusPayload.lastUploadAt
        ? statusPayload.lastUploadAt
        : null,
    [NEXTCLOUD_STORAGE_KEYS.lastUploadedFileName]:
      statusPayload && statusPayload.fileName ? statusPayload.fileName : null,
    [NEXTCLOUD_STORAGE_KEYS.lastUploadError]:
      statusPayload && statusPayload.error ? statusPayload.error : null,
    [NEXTCLOUD_STORAGE_KEYS.lastUploadTrigger]:
      statusPayload && statusPayload.trigger ? statusPayload.trigger : null,
    [NEXTCLOUD_STORAGE_KEYS.lastAttemptAt]:
      statusPayload && statusPayload.lastAttemptAt
        ? statusPayload.lastAttemptAt
        : null,
    [NEXTCLOUD_STORAGE_KEYS.retryCount]:
      Number(statusPayload && statusPayload.retryCount) || 0,
    [NEXTCLOUD_STORAGE_KEYS.retryAt]:
      statusPayload && statusPayload.retryAt ? statusPayload.retryAt : null,
    [NEXTCLOUD_STORAGE_KEYS.rateLimitedUntil]:
      statusPayload && statusPayload.rateLimitedUntil
        ? statusPayload.rateLimitedUntil
        : null,
    [NEXTCLOUD_STORAGE_KEYS.nextScheduledAt]:
      statusPayload && statusPayload.nextScheduledAt
        ? statusPayload.nextScheduledAt
        : null,
  });
}

async function performEncryptedUpload(trigger = "manual") {
  const throttleState = await storageGet([
    NEXTCLOUD_STORAGE_KEYS.rateLimitedUntil,
    NEXTCLOUD_STORAGE_KEYS.lastAttemptAt,
  ]);
  const rateLimitedUntil =
    throttleState[NEXTCLOUD_STORAGE_KEYS.rateLimitedUntil];
  const rateLimitedUntilTs = rateLimitedUntil
    ? new Date(rateLimitedUntil).getTime()
    : null;

  if (Number.isFinite(rateLimitedUntilTs) && rateLimitedUntilTs > Date.now()) {
    throw new Error(
      `Rate limit active until ${new Date(rateLimitedUntilTs).toISOString()}`,
    );
  }

  const lastAttemptAt = throttleState[NEXTCLOUD_STORAGE_KEYS.lastAttemptAt];
  const lastAttemptAtTs = lastAttemptAt
    ? new Date(lastAttemptAt).getTime()
    : null;
  const nextAllowedAttemptTs = Number.isFinite(lastAttemptAtTs)
    ? lastAttemptAtTs + NEXTCLOUD_MIN_ATTEMPT_INTERVAL_MS
    : null;
  if (
    Number.isFinite(nextAllowedAttemptTs) &&
    nextAllowedAttemptTs > Date.now()
  ) {
    throw new Error(
      `Upload throttled until ${new Date(nextAllowedAttemptTs).toISOString()}`,
    );
  }

  await storageSet({
    [NEXTCLOUD_STORAGE_KEYS.lastAttemptAt]: new Date().toISOString(),
  });

  const participantState = await storageGet([
    "participantUUID",
    "onboardingCompleted",
  ]);
  const participantUUID = normalizeUuid(participantState.participantUUID);
  const onboardingCompleted = Boolean(participantState.onboardingCompleted);

  if (!participantUUID || !onboardingCompleted) {
    return {
      success: false,
      skipped: true,
      reason: "onboarding_not_completed",
    };
  }

  if (!logger || typeof logger.getLogSnapshot !== "function") {
    throw new Error("Logger API unavailable in background service worker.");
  }

  const snapshot = await logger.getLogSnapshot();
  const payload = sanitizeSnapshotForUpload(snapshot);
  payload.participantUUID = participantUUID;

  const envelope = await encryptBatchPayload(payload, participantUUID);
  const fileName = buildEncryptedFileName(participantUUID);
  const uploadResult = await uploadEncryptedBatchToNextcloud(
    envelope,
    fileName,
  );

  const lastUploadAt = new Date().toISOString();
  await updateNextcloudStatus({
    state: "success",
    trigger,
    fileName,
    target: uploadResult.target,
    statusCode: uploadResult.status,
    lastUploadAt,
    lastAttemptAt: new Date().toISOString(),
    retryCount: 0,
    retryAt: null,
    rateLimitedUntil: null,
    error: null,
  });

  appendStudyEvent("nextcloud_upload_success", {
    trigger,
    fileName,
    target: uploadResult.target,
    statusCode: uploadResult.status,
  });

  return {
    success: true,
    fileName,
    target: uploadResult.target,
    statusCode: uploadResult.status,
    uploadedAt: lastUploadAt,
  };
}

async function performEncryptedUploadWithRetry(trigger = "manual") {
  if (!ENABLE_NEXTCLOUD_UPLOAD_FALLBACK) {
    return {
      success: false,
      skipped: true,
      reason: "nextcloud_fallback_disabled",
    };
  }

  const retryDelaysMs = [10000, 30000, 120000];
  const isManualDebugTrigger = String(trigger || "").includes("popup_debug");
  const maxAttempts = isManualDebugTrigger ? 1 : retryDelaysMs.length + 1;
  let lastError = null;
  let activeRateLimitedUntil = null;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const result = await performEncryptedUpload(trigger);
      if (result.skipped) {
        return result;
      }
      return result;
    } catch (error) {
      lastError = error;
      const errorText = String(error);
      const isRateLimited =
        (error && Number(error.httpStatus) === 429) ||
        errorText.includes("Rate limit active until") ||
        errorText.includes("(429");
      const retryAfterMsFromError =
        error && Number.isFinite(error.retryAfterMs) && error.retryAfterMs > 0
          ? Number(error.retryAfterMs)
          : null;

      const delayMs = isRateLimited
        ? Math.max(
            retryAfterMsFromError || 0,
            retryDelaysMs[attempt] || 0,
            NEXTCLOUD_DEFAULT_RATE_LIMIT_DELAY_MS,
          )
        : retryDelaysMs[attempt];

      activeRateLimitedUntil =
        isRateLimited && delayMs
          ? new Date(Date.now() + delayMs).toISOString()
          : null;

      const isLastAttempt = attempt >= maxAttempts - 1;
      const nextRetryAt =
        !isLastAttempt && delayMs
          ? new Date(Date.now() + delayMs).toISOString()
          : null;

      await updateNextcloudStatus({
        state: isLastAttempt ? "error" : "retrying",
        trigger,
        lastUploadAt: null,
        fileName: null,
        retryCount: attempt + 1,
        retryAt: nextRetryAt,
        rateLimitedUntil: activeRateLimitedUntil,
        lastAttemptAt: new Date().toISOString(),
        error: String(error),
      });

      appendStudyEvent("nextcloud_upload_retry_scheduled", {
        trigger,
        attempt: attempt + 1,
        delayMs: delayMs || null,
        isRateLimited,
        isLastAttempt,
        rateLimitedUntil: activeRateLimitedUntil,
        error: String(error),
      });

      if (isLastAttempt || !delayMs) {
        break;
      }
      await sleep(delayMs);
    }
  }

  await updateNextcloudStatus({
    state: "error",
    trigger,
    lastUploadAt: null,
    fileName: null,
    retryCount: maxAttempts,
    retryAt: null,
    rateLimitedUntil: activeRateLimitedUntil,
    lastAttemptAt: new Date().toISOString(),
    error: String(lastError),
  });

  appendStudyEvent("nextcloud_upload_failed", {
    trigger,
    retries: maxAttempts,
    isManualDebugTrigger,
    error: String(lastError),
  });

  throw lastError;
}

function ensureNextcloudUploadAlarm() {
  if (!ENABLE_NEXTCLOUD_UPLOAD_FALLBACK) {
    chrome.alarms.clear(ALARM_NEXTCLOUD_UPLOAD);
    storageSet({ [NEXTCLOUD_STORAGE_KEYS.nextScheduledAt]: null });
    return;
  }

  scheduleNextcloudUploadAtNextSlot("ensure_alarm").catch((error) => {
    console.warn(
      "[GreenPrompt] Failed to schedule Nextcloud upload alarm:",
      error,
    );
  });
}

async function triggerMilestoneUploads(trigger, participantUUID = null) {
  const normalizedParticipant = normalizeUuid(participantUUID);
  const summary = {
    trigger: String(trigger || "unknown"),
    participantUUID: normalizedParticipant,
    nextcloud: { success: false, error: null },
    sosci: { success: false, error: null },
  };

  if (ENABLE_NEXTCLOUD_UPLOAD_FALLBACK) {
    try {
      const nextcloudResult = await performEncryptedUploadWithRetry(
        `${summary.trigger}_nextcloud`,
      );
      summary.nextcloud = {
        success: Boolean(nextcloudResult && nextcloudResult.success),
        error: null,
        result: nextcloudResult || null,
      };
    } catch (error) {
      summary.nextcloud = {
        success: false,
        error: String(error),
        result: null,
      };
    }
  } else {
    summary.nextcloud = {
      success: false,
      error: "nextcloud_fallback_disabled",
      result: { skipped: true, reason: "nextcloud_fallback_disabled" },
    };
  }

  try {
    const sosciResult = await performSosciUploadWithCurrentSnapshot(
      `${summary.trigger}_sosci`,
    );
    summary.sosci = {
      success: Boolean(sosciResult && sosciResult.success),
      error: null,
      result: sosciResult || null,
    };
  } catch (error) {
    summary.sosci = {
      success: false,
      error: String(error),
      result: null,
    };
  }

  appendStudyEvent("milestone_uploads_triggered", {
    trigger: summary.trigger,
    participantUUID: summary.participantUUID,
    nextcloudEnabled: ENABLE_NEXTCLOUD_UPLOAD_FALLBACK,
    nextcloudSuccess: summary.nextcloud.success,
    sosciSuccess: summary.sosci.success,
    nextcloudError: summary.nextcloud.error,
    sosciError: summary.sosci.error,
  });

  return summary;
}

function buildFollowUpUrl(queryId, uuid, source) {
  const normalizedUuid = normalizeUuid(uuid);
  const params = new URLSearchParams();
  params.set("q", queryId);
  if (normalizedUuid) {
    params.set("uuid", normalizedUuid);
  }
  if (source) {
    params.set("source", source);
  }
  return `${FOLLOW_UP_BASE_URL}?${params.toString()}`;
}

function setUninstallSurveyUrl(uuid) {
  const uninstallUrl = buildFollowUpUrl(FOLLOW_UP_T5_QUERY, uuid, "uninstall");
  chrome.runtime.setUninstallURL(uninstallUrl, () => {
    if (chrome.runtime.lastError) {
      console.warn(
        "[GreenPrompt] Failed to set uninstall URL:",
        chrome.runtime.lastError,
      );
    }
  });
}

function scheduleOneAlarm(alarmName, whenTs) {
  const safeWhen = Math.max(Date.now() + 5000, Number(whenTs) || Date.now());
  chrome.alarms.create(alarmName, { when: safeWhen });
}

function setupFollowUpRemindersFromState(state = {}, reason = "state_sync") {
  const participantUUID = normalizeUuid(state.participantUUID);
  const onboardingCompleted = Boolean(state.onboardingCompleted);
  const studyStartTimeRaw = state.studyStartTime;

  if (!participantUUID || !onboardingCompleted || !studyStartTimeRaw) {
    return;
  }

  const studyStartTs = new Date(studyStartTimeRaw).getTime();
  if (!Number.isFinite(studyStartTs)) {
    return;
  }

  setUninstallSurveyUrl(participantUUID);
  ensureNextcloudUploadAlarm();
  ensureSosciDailyUploadPlan(reason).catch((error) => {
    console.warn(
      "[GreenPrompt] Failed to ensure SoSci daily upload plan:",
      error,
    );
  });

  const t1Opened = Boolean(state.followUpT1OpenedAt);
  const t5Opened = Boolean(state.followUpT5OpenedAt);
  const t1DelayMs = parseDelayOverride(
    state.debugFollowUpDelayT1Ms,
    ONE_DAY_MS,
  );
  const t5DelayMs = parseDelayOverride(
    state.debugFollowUpDelayT5Ms,
    FIVE_DAYS_MS,
  );

  if (!t1Opened) {
    scheduleOneAlarm(ALARM_T1, studyStartTs + t1DelayMs);
  }

  if (!t5Opened) {
    scheduleOneAlarm(ALARM_T5, studyStartTs + t5DelayMs);
  }

  appendStudyEvent("followup_reminders_scheduled", {
    reason,
    t1Opened,
    t5Opened,
    t1DelayMs,
    t5DelayMs,
  });
}

function openFollowUpTab(reminderType, uuid) {
  const queryId =
    reminderType === "t1" ? FOLLOW_UP_T1_QUERY : FOLLOW_UP_T5_QUERY;
  const url = buildFollowUpUrl(queryId, uuid, reminderType);

  chrome.tabs.create({ url }, () => {
    if (chrome.runtime.lastError) {
      console.warn(
        "[GreenPrompt] Failed to open follow-up tab:",
        chrome.runtime.lastError,
      );
      return;
    }

    appendStudyEvent(`followup_${reminderType}_tab_opened`, {
      url,
    });
  });
}

function runReminderByAlarmName(alarmName) {
  appendStudyEvent("followup_alarm_fired", { alarmName });

  chrome.storage.local.get(
    [
      "participantUUID",
      "onboardingCompleted",
      "followUpT1OpenedAt",
      "followUpT5OpenedAt",
    ],
    (state) => {
      const participantUUID = normalizeUuid(state.participantUUID);
      const onboardingCompleted = Boolean(state.onboardingCompleted);

      if (!participantUUID || !onboardingCompleted) {
        return;
      }

      if (alarmName === ALARM_T1) {
        if (state.followUpT1OpenedAt) {
          return;
        }
        openFollowUpTab("t1", participantUUID);
        chrome.storage.local.set({
          followUpT1OpenedAt: new Date().toISOString(),
        });
        triggerMilestoneUploads("followup_t1_alarm", participantUUID).catch(
          (error) => {
            console.warn(
              "[GreenPrompt] Follow-up T1 milestone uploads failed:",
              error,
            );
          },
        );
        return;
      }

      if (alarmName === ALARM_T5) {
        if (state.followUpT5OpenedAt) {
          return;
        }
        openFollowUpTab("t5", participantUUID);
        chrome.storage.local.set({
          followUpT5OpenedAt: new Date().toISOString(),
        });
        triggerMilestoneUploads("followup_t5_alarm", participantUUID).catch(
          (error) => {
            console.warn(
              "[GreenPrompt] Follow-up T5 milestone uploads failed:",
              error,
            );
          },
        );
      }
    },
  );
}

function initializeStudyAutomation(reason = "startup") {
  appendStudyEvent("study_automation_sync_requested", { reason });

  chrome.storage.local.get(
    [
      "participantUUID",
      "onboardingCompleted",
      "studyStartTime",
      "followUpT1OpenedAt",
      "followUpT5OpenedAt",
      "debugFollowUpDelayT1Ms",
      "debugFollowUpDelayT5Ms",
    ],
    (state) => {
      setupFollowUpRemindersFromState(state, reason);
    },
  );
}

function appendStudyEvent(eventType, data = {}, callback) {
  const safeEventType = String(eventType || "unknown_event");

  if (logger && typeof logger.logEvent === "function") {
    logger
      .logEvent(safeEventType, data, { source: "background" })
      .then((entry) => {
        if (typeof callback === "function") {
          callback(entry);
        }
      });
    return;
  }

  if (typeof callback === "function") {
    callback({
      eventType: safeEventType,
      timestampISO: new Date().toISOString(),
      payload: data,
    });
  }
}

function getWarmupStatus() {
  try {
    ensureNlpCoreLoaded();
    return { ready: true, cached: true, mode: "background-service-worker" };
  } catch (error) {
    return { ready: false, cached: false, error: String(error) };
  }
}

function ensureNlpCoreLoaded() {
  if (nlpCoreLoaded) {
    return;
  }

  const coreUrl = chrome.runtime.getURL("nlp-pipeline-core.js");
  importScripts(coreUrl);

  if (
    typeof self.GreenPromptNLP !== "object" ||
    typeof self.GreenPromptNLP.optimizePromptPipeline !== "function"
  ) {
    throw new Error("NLP core loaded but API is missing");
  }

  nlpCoreLoaded = true;
}

function warmupNlpModel() {
  if (nlpWarmupPromise) {
    return nlpWarmupPromise;
  }

  nlpWarmupPromise = Promise.resolve(getWarmupStatus());

  return nlpWarmupPromise;
}

// Initialize extension on install
chrome.runtime.onInstalled.addListener((details) => {
  chrome.storage.local.set({ [DEBUG_FEATURES_ENABLED_KEY]: false });

  appendStudyEvent("extension_installed_or_updated", {
    reason: details.reason,
    previousVersion: details.previousVersion || null,
  });

  if (details.reason === "install") {
    // Set default configuration
    chrome.storage.local.set({
      config: {
        modules: {
          nudging: true,
          gamification: true,
        },
        stats: {
          totalPrompts: 0,
          optimizedPrompts: 0,
          co2Saved: 0,
          waterSaved: 0,
          level: 1,
          treeHealth: 100,
        },
      },
    });

    // Open welcome page
    chrome.tabs.create({
      url: "popup.html",
    });

    warmupNlpModel();
  }

  initializeStudyAutomation(`onInstalled:${details.reason}`);
});

chrome.runtime.onStartup.addListener(() => {
  chrome.storage.local.set({ [DEBUG_FEATURES_ENABLED_KEY]: false });
  warmupNlpModel();
  appendStudyEvent("extension_startup", {});
  initializeStudyAutomation("onStartup");
  ensureNextcloudUploadAlarm();
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local") {
    return;
  }

  const studyKeys = [
    "participantUUID",
    "onboardingCompleted",
    "studyStartTime",
    "followUpT1OpenedAt",
    "followUpT5OpenedAt",
    "debugFollowUpDelayT1Ms",
    "debugFollowUpDelayT5Ms",
  ];
  const shouldSync = studyKeys.some((key) => Object.hasOwn(changes, key));
  if (!shouldSync) {
    return;
  }

  initializeStudyAutomation("storage_changed");
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (!alarm || !alarm.name) {
    return;
  }

  appendStudyEvent("alarm_received", {
    alarmName: alarm.name,
    scheduledTime: alarm.scheduledTime || null,
  });

  if (alarm.name === ALARM_T1 || alarm.name === ALARM_T5) {
    runReminderByAlarmName(alarm.name);
    return;
  }

  if (alarm.name === ALARM_NEXTCLOUD_UPLOAD) {
    if (!ENABLE_NEXTCLOUD_UPLOAD_FALLBACK) {
      return;
    }

    performEncryptedUploadWithRetry("daily_alarm")
      .catch((error) => {
        console.warn("[GreenPrompt] Nextcloud upload failed:", error);
      })
      .finally(() => {
        scheduleNextcloudUploadAtNextSlot("post_alarm_run").catch(
          (scheduleError) => {
            console.warn(
              "[GreenPrompt] Failed to schedule next daily slot:",
              scheduleError,
            );
          },
        );
      });
  }

  if (alarm.name === ALARM_SOSCI_UPLOAD_DAILY) {
    runSosciDailyUpload("daily_alarm")
      .catch((error) => {
        console.warn("[GreenPrompt] SoSci daily upload failed:", error);
      })
      .finally(() => {
        scheduleSosciUploadAtNextSlot("post_daily_alarm").catch(
          (scheduleError) => {
            console.warn(
              "[GreenPrompt] Failed to schedule next SoSci daily slot:",
              scheduleError,
            );
          },
        );
      });
  }
});

// Handle extension icon click
chrome.action.onClicked.addListener((tab) => {
  // Inject content script if not already injected
  if (tab.url.includes("chat.openai.com") || tab.url.includes("chatgpt.com")) {
    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["words-data.js", "logging.js", "content.js"],
    });
  }
});

// Listen for messages from content script
chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (request.action === "logStudyEvent") {
    appendStudyEvent(request.eventType, request.data || {}, (entry) => {
      sendResponse({ success: true, entry });
    });
    return true;
  }

  if (request.action === "syncStudyReminders") {
    initializeStudyAutomation("popup_request_sync");
    appendStudyEvent("sync_study_reminders_requested", {
      source: "popup",
    });
    scheduleNextcloudUploadAtNextSlot("sync_request").catch(() => {
      // keep sync response successful even if scheduling fails temporarily
    });
    sendResponse({ success: true });
    return;
  }

  if (request.action === "warmupNlp") {
    // Reply synchronously to avoid message-channel races in MV3 service workers.
    sendResponse(getWarmupStatus());
    return;
  }

  if (request.action === "optimizePrompt") {
    try {
      ensureNlpCoreLoaded();

      const optimizer = self.GreenPromptNLP;
      if (
        !optimizer ||
        typeof optimizer.optimizePromptPipeline !== "function"
      ) {
        sendResponse({ success: false, error: "NLP core unavailable" });
        return;
      }

      const result = optimizer.optimizePromptPipeline(
        request.text || "",
        request.options || {},
      );
      sendResponse({ success: true, result });
    } catch (error) {
      sendResponse({ success: false, error: String(error) });
    }

    return;
  }

  if (request.action === "triggerEncryptedUpload") {
    if (!ENABLE_NEXTCLOUD_UPLOAD_FALLBACK) {
      sendResponse({
        success: false,
        error: "Nextcloud fallback upload is disabled in background config.",
      });
      return;
    }

    performEncryptedUploadWithRetry(request.trigger || "popup_followup_click")
      .then((result) => {
        sendResponse({ success: true, result });
      })
      .catch((error) => {
        sendResponse({ success: false, error: String(error) });
      });
    return true;
  }

  if (request.action === "triggerMilestoneUploads") {
    triggerMilestoneUploads(
      request.trigger || "popup_followup_click",
      request.participantUUID || null,
    )
      .then((result) => {
        sendResponse({ success: true, result });
      })
      .catch((error) => {
        sendResponse({ success: false, error: String(error) });
      });
    return true;
  }

  if (request.action === "buildNextcloudDebugUploadPackage") {
    isDebugRuntimeEnabled().then((enabled) => {
      if (!enabled) {
        sendResponse({ success: false, error: "Debug features disabled." });
        return;
      }

      buildNextcloudDebugUploadPackage(request.trigger || "popup_debug_manual")
        .then((result) => {
          sendResponse({ success: true, result });
        })
        .catch((error) => {
          sendResponse({ success: false, error: String(error) });
        });
    });
    return true;
  }

  if (request.action === "getNextcloudUploadStatus") {
    if (!ENABLE_NEXTCLOUD_UPLOAD_FALLBACK) {
      sendResponse({
        success: true,
        status: {
          nextcloudEnabled: false,
          message:
            "Nextcloud fallback upload is disabled in background config.",
        },
      });
      return;
    }

    isDebugRuntimeEnabled().then((enabled) => {
      if (!enabled) {
        sendResponse({ success: false, error: "Debug features disabled." });
        return;
      }

      storageGet([
        NEXTCLOUD_STORAGE_KEYS.status,
        NEXTCLOUD_STORAGE_KEYS.lastUploadAt,
        NEXTCLOUD_STORAGE_KEYS.lastUploadedFileName,
        NEXTCLOUD_STORAGE_KEYS.lastUploadError,
        NEXTCLOUD_STORAGE_KEYS.lastUploadTrigger,
        NEXTCLOUD_STORAGE_KEYS.lastAttemptAt,
        NEXTCLOUD_STORAGE_KEYS.retryCount,
        NEXTCLOUD_STORAGE_KEYS.retryAt,
        NEXTCLOUD_STORAGE_KEYS.rateLimitedUntil,
        NEXTCLOUD_STORAGE_KEYS.nextScheduledAt,
      ]).then((result) => {
        sendResponse({ success: true, status: result || {} });
      });
    });
    return true;
  }

  if (request.action === "uploadToSoSci") {
    uploadToSoSci(
      request.encryptedJsonString || request.payload || "",
      request.participantUUID || "",
    )
      .then((ok) => {
        sendResponse({ success: ok });
      })
      .catch((error) => {
        sendResponse({ success: false, error: String(error) });
      });
    return true;
  }

  if (request.action === "triggerSosciUpload") {
    isDebugRuntimeEnabled().then((enabled) => {
      if (!enabled) {
        sendResponse({ success: false, error: "Debug features disabled." });
        return;
      }

      performSosciUploadWithCurrentSnapshot(
        request.trigger || "popup_debug_manual_sosci",
      )
        .then((result) => {
          sendResponse({ success: true, result });
        })
        .catch((error) => {
          sendResponse({ success: false, error: String(error) });
        });
    });
    return true;
  }

  if (request.action === "triggerSosciLargeTestUpload") {
    isDebugRuntimeEnabled().then((enabled) => {
      if (!enabled) {
        sendResponse({ success: false, error: "Debug features disabled." });
        return;
      }

      performSosciLargeTestUpload({
        sizeMb: request.sizeMb,
        trigger: request.trigger || "popup_debug_manual_sosci_large_test",
      })
        .then((result) => {
          sendResponse({ success: true, result });
        })
        .catch((error) => {
          sendResponse({ success: false, error: String(error) });
        });
    });
    return true;
  }
});
