/*
 * GreenPrompt Unified Local Logger
 * Local-only event and prompt-flow logging with JSONL/CSV export.
 */

(function (globalScope) {
  "use strict";

  const LOGGER_SCHEMA_VERSION = 2;
  const DEFAULTS = {
    source: "unknown",
    promptTextMode: "none", // full | hashed | none
    duplicateEventWindowMs: 1500,
    maxEvents: 50000,
    maxPromptRecords: 20000,
    csvDelimiter: ";",
  };

  const STORAGE_KEYS = {
    events: "studyLogs_events",
    promptRecords: "studyLogs_promptRecords",
    sessions: "studyLogs_sessions",
    counters: "studyLogs_counters",
    meta: "studyLogs_meta",
    settings: "studyLogs_settings",
  };

  const runtimeState = {
    initialized: false,
    options: { ...DEFAULTS },
    sessionMap: new Map(),
    promptFlowMap: new Map(),
    finishedPromptFlowMap: new Map(),
    appVersion: "0.0.0",
  };

  function hasChromeStorage() {
    return !!(
      typeof chrome !== "undefined" &&
      chrome.storage &&
      chrome.storage.local
    );
  }

  function hasRuntimeManifest() {
    return !!(
      typeof chrome !== "undefined" &&
      chrome.runtime &&
      chrome.runtime.getManifest
    );
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function nowMs() {
    return Date.now();
  }

  function normalizePromptTextMode(mode) {
    const value = String(mode || "")
      .toLowerCase()
      .trim();
    if (value === "full" || value === "hashed" || value === "none") {
      return value;
    }
    return DEFAULTS.promptTextMode;
  }

  function generateId(prefix) {
    const rand = Math.random().toString(36).slice(2, 10);
    return `${prefix}_${nowMs()}_${rand}`;
  }

  function getBrowserName() {
    const ua = String(
      (globalScope.navigator && globalScope.navigator.userAgent) || "",
    ).toLowerCase();
    if (ua.includes("edg/")) {
      return "edge";
    }
    if (ua.includes("chrome/")) {
      return "chrome";
    }
    return "unknown";
  }

  function storageGet(keys) {
    return new Promise((resolve) => {
      if (!hasChromeStorage()) {
        resolve({});
        return;
      }

      chrome.storage.local.get(keys, (result) => {
        resolve(result || {});
      });
    });
  }

  function storageSet(payload) {
    return new Promise((resolve) => {
      if (!hasChromeStorage()) {
        resolve();
        return;
      }

      chrome.storage.local.set(payload, () => {
        resolve();
      });
    });
  }

  function pruneArray(arr, maxLen) {
    if (!Array.isArray(arr)) {
      return [];
    }
    if (!Number.isFinite(maxLen) || maxLen <= 0 || arr.length <= maxLen) {
      return arr;
    }
    return arr.slice(arr.length - maxLen);
  }

  function normalizePromptText(mode, value) {
    const text = String(value || "");
    if (mode === "none") {
      return "";
    }
    if (mode === "hashed") {
      // Placeholder hash strategy for later hardening.
      let hash = 0;
      for (let i = 0; i < text.length; i += 1) {
        hash = (hash << 5) - hash + text.charCodeAt(i);
        hash |= 0;
      }
      return `hash_${Math.abs(hash)}`;
    }
    return text;
  }

  function stableSerialize(value) {
    if (value === null || typeof value !== "object") {
      return JSON.stringify(value);
    }

    if (Array.isArray(value)) {
      return `[${value.map((entry) => stableSerialize(entry)).join(",")}]`;
    }

    const keys = Object.keys(value).sort();
    const body = keys
      .map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`)
      .join(",");
    return `{${body}}`;
  }

  function sameEventFingerprint(a, b) {
    if (!a || !b) {
      return false;
    }

    return (
      String(a.eventType || "") === String(b.eventType || "") &&
      String(a.source || "") === String(b.source || "") &&
      String(a.participantUUID || "") === String(b.participantUUID || "") &&
      String(a.sessionId || "") === String(b.sessionId || "") &&
      stableSerialize(a.payload || {}) === stableSerialize(b.payload || {})
    );
  }

  function estimateWords(text) {
    const source = String(text || "").trim();
    if (!source) {
      return 0;
    }
    return source.split(/\s+/).filter(Boolean).length;
  }

  function estimateTokens(text) {
    const source = String(text || "").trim();
    if (!source) {
      return 0;
    }
    return Math.ceil(source.length / 4);
  }

  function toPersistedSettings(options) {
    const normalizedPromptTextMode = normalizePromptTextMode(
      options.promptTextMode,
    );
    return {
      promptTextMode: normalizedPromptTextMode,
      promptTextLoggingConsent: normalizedPromptTextMode === "full",
      maxEvents: Number(options.maxEvents) || DEFAULTS.maxEvents,
      maxPromptRecords:
        Number(options.maxPromptRecords) || DEFAULTS.maxPromptRecords,
      csvDelimiter:
        typeof options.csvDelimiter === "string" &&
        options.csvDelimiter.length > 0
          ? options.csvDelimiter
          : DEFAULTS.csvDelimiter,
    };
  }

  function readStoredSettingsPayload(rawSettings) {
    if (!rawSettings || typeof rawSettings !== "object") {
      return null;
    }

    const normalizedPromptTextMode = normalizePromptTextMode(
      rawSettings.promptTextMode,
    );

    return {
      promptTextMode: normalizedPromptTextMode,
      promptTextLoggingConsent: normalizedPromptTextMode === "full",
      maxEvents: Number(rawSettings.maxEvents) || DEFAULTS.maxEvents,
      maxPromptRecords:
        Number(rawSettings.maxPromptRecords) || DEFAULTS.maxPromptRecords,
      csvDelimiter:
        typeof rawSettings.csvDelimiter === "string" &&
        rawSettings.csvDelimiter.length > 0
          ? rawSettings.csvDelimiter
          : DEFAULTS.csvDelimiter,
    };
  }

  async function persistCurrentSettings() {
    const persisted = toPersistedSettings(runtimeState.options);
    runtimeState.options = {
      ...runtimeState.options,
      ...persisted,
    };

    await storageSet({
      [STORAGE_KEYS.settings]: persisted,
    });

    return { ...persisted };
  }

  async function getLoggerSettings() {
    const result = await storageGet([STORAGE_KEYS.settings]);
    const stored = readStoredSettingsPayload(result[STORAGE_KEYS.settings]);

    if (stored) {
      runtimeState.options = {
        ...runtimeState.options,
        ...stored,
      };
      return { ...stored };
    }

    const persisted = await persistCurrentSettings();
    return { ...persisted };
  }

  async function setPromptTextMode(mode, options = {}) {
    const normalizedMode = normalizePromptTextMode(mode);
    runtimeState.options = {
      ...runtimeState.options,
      promptTextMode: normalizedMode,
    };

    await persistCurrentSettings();

    if (!options.silent) {
      await logEvent("logger_prompt_text_mode_changed", {
        promptTextMode: normalizedMode,
        consentGiven: normalizedMode === "full",
      });
    }

    return normalizedMode;
  }

  function getPromptTextMode() {
    return normalizePromptTextMode(runtimeState.options.promptTextMode);
  }

  async function appendEvent(eventObj) {
    const result = await storageGet([STORAGE_KEYS.events]);
    const events = Array.isArray(result[STORAGE_KEYS.events])
      ? result[STORAGE_KEYS.events]
      : [];
    const previous = events.length > 0 ? events[events.length - 1] : null;
    const duplicateWindowMs =
      Number(runtimeState.options.duplicateEventWindowMs) ||
      DEFAULTS.duplicateEventWindowMs;
    const isNearDuplicate =
      previous &&
      sameEventFingerprint(previous, eventObj) &&
      Math.abs(
        Number(eventObj.timestampMs || 0) - Number(previous.timestampMs || 0),
      ) <= duplicateWindowMs;

    if (isNearDuplicate) {
      return false;
    }

    events.push(eventObj);
    const pruned = pruneArray(events, runtimeState.options.maxEvents);
    await storageSet({ [STORAGE_KEYS.events]: pruned });
    return true;
  }

  async function appendPromptRecord(recordObj) {
    const result = await storageGet([STORAGE_KEYS.promptRecords]);
    const records = Array.isArray(result[STORAGE_KEYS.promptRecords])
      ? result[STORAGE_KEYS.promptRecords]
      : [];
    const hasDuplicate = records.some((entry) => {
      if (!entry || typeof entry !== "object") {
        return false;
      }
      return (
        String(entry.promptSessionId || "") ===
          String(recordObj.promptSessionId || "") &&
        String(entry.action || "") === String(recordObj.action || "") &&
        String(entry.finalLengthOption || "") ===
          String(recordObj.finalLengthOption || "") &&
        String(entry.endedAtISO || "") === String(recordObj.endedAtISO || "")
      );
    });

    if (hasDuplicate) {
      return false;
    }

    records.push(recordObj);
    const pruned = pruneArray(records, runtimeState.options.maxPromptRecords);
    await storageSet({ [STORAGE_KEYS.promptRecords]: pruned });
    return true;
  }

  async function incrementCounter(name, delta = 1) {
    if (!name) {
      return;
    }

    const result = await storageGet([STORAGE_KEYS.counters]);
    const counters =
      result[STORAGE_KEYS.counters] &&
      typeof result[STORAGE_KEYS.counters] === "object"
        ? result[STORAGE_KEYS.counters]
        : {};

    const previous = Number(counters[name]) || 0;
    counters[name] = previous + (Number(delta) || 0);
    await storageSet({ [STORAGE_KEYS.counters]: counters });
  }

  function getManifestVersion() {
    if (!hasRuntimeManifest()) {
      return "0.0.0";
    }
    try {
      return String(chrome.runtime.getManifest().version || "0.0.0");
    } catch (_error) {
      return "0.0.0";
    }
  }

  async function getParticipantUuid() {
    const result = await storageGet(["participantUUID"]);
    return (
      String(result.participantUUID || "")
        .trim()
        .toLowerCase() || null
    );
  }

  function buildBaseEvent(eventType, payload, overrideSource) {
    const source = overrideSource || runtimeState.options.source || "unknown";
    return {
      eventId: generateId("evt"),
      schemaVersion: LOGGER_SCHEMA_VERSION,
      appVersion: runtimeState.appVersion,
      timestampISO: nowIso(),
      timestampMs: nowMs(),
      eventType: String(eventType || "unknown_event"),
      source,
      environment: {
        browser: getBrowserName(),
      },
      featureFlags: {
        nudging: payload && payload.nudging,
        gamification: payload && payload.gamification,
        showDiff: payload && payload.showDiff,
      },
      payload: payload || {},
    };
  }

  async function logEvent(eventType, payload = {}, options = {}) {
    if (!runtimeState.initialized) {
      initLogger({});
    }

    const participantUUID = await getParticipantUuid();
    const sessionId = options.sessionId || payload.sessionId || null;
    const event = buildBaseEvent(eventType, payload, options.source);
    event.participantUUID = participantUUID;
    event.sessionId = sessionId;

    await appendEvent(event);
    await incrementCounter("events_total", 1);
    return event;
  }

  function startSession(sessionType, payload = {}) {
    const sessionId = generateId("session");
    const startedAtMs = nowMs();
    runtimeState.sessionMap.set(sessionId, {
      sessionType: String(sessionType || "generic"),
      startedAtMs,
      payload,
    });

    logEvent(
      "session_started",
      {
        sessionType: String(sessionType || "generic"),
        ...payload,
      },
      { sessionId },
    );

    return sessionId;
  }

  function endSession(sessionId, payload = {}) {
    const state = runtimeState.sessionMap.get(sessionId);
    const endedAtMs = nowMs();
    const dwellMs = state ? endedAtMs - state.startedAtMs : 0;

    runtimeState.sessionMap.delete(sessionId);

    logEvent(
      "session_ended",
      {
        sessionType: state ? state.sessionType : "generic",
        dwellMs,
        ...payload,
      },
      { sessionId },
    );

    return { sessionId, dwellMs };
  }

  function startPromptFlow(payload = {}) {
    const promptSessionId = generateId("prompt");
    const startedAtMs = nowMs();

    const originalPrompt = normalizePromptText(
      runtimeState.options.promptTextMode,
      payload.originalPrompt,
    );
    const optimizedPrompt = normalizePromptText(
      runtimeState.options.promptTextMode,
      payload.optimizedPrompt,
    );

    runtimeState.promptFlowMap.set(promptSessionId, {
      promptSessionId,
      startedAtMs,
      sliderSelectionsHistory: [],
      optimizationHistory: [],
      ...payload,
      originalPrompt,
      optimizedPrompt,
      originalWordCount: estimateWords(originalPrompt),
      optimizedWordCount: estimateWords(optimizedPrompt),
      originalTokenEstimate: estimateTokens(originalPrompt),
      optimizedTokenEstimate: estimateTokens(optimizedPrompt),
    });

    logEvent("prompt_flow_started", {
      promptSessionId,
      promptTextLoggingConsent:
        normalizePromptTextMode(runtimeState.options.promptTextMode) === "full",
      originalWordCount: estimateWords(originalPrompt),
      originalTokenEstimate: estimateTokens(originalPrompt),
      originalPromptLength: String(originalPrompt || "").length,
      optimizedPromptLength: String(optimizedPrompt || "").length,
      ...payload,
    });

    incrementCounter("prompt_flows_total", 1);
    return promptSessionId;
  }

  function updatePromptFlow(promptSessionId, patch = {}) {
    const current = runtimeState.promptFlowMap.get(promptSessionId);
    if (!current) {
      return;
    }

    const next = {
      ...current,
      ...patch,
    };

    if (patch.selectedLengthOption) {
      next.sliderSelectionsHistory = [
        ...(Array.isArray(current.sliderSelectionsHistory)
          ? current.sliderSelectionsHistory
          : []),
        {
          value: String(patch.selectedLengthOption),
          ts: nowIso(),
        },
      ];
    }

    if (patch.choiceSelection && typeof patch.choiceSelection === "object") {
      next.sliderSelectionsHistory = [
        ...(Array.isArray(next.sliderSelectionsHistory)
          ? next.sliderSelectionsHistory
          : []),
        {
          value: String(patch.choiceSelection.value || ""),
          ts: patch.choiceSelection.ts || nowIso(),
          source: patch.choiceSelection.source || "popup",
        },
      ];
    }

    if (patch.optimizationStep && typeof patch.optimizationStep === "object") {
      next.optimizationHistory = [
        ...(Array.isArray(current.optimizationHistory)
          ? current.optimizationHistory
          : []),
        {
          stepType: String(patch.optimizationStep.stepType || "unknown"),
          selectedLengthOption:
            patch.optimizationStep.selectedLengthOption || null,
          optimizedPrompt: normalizePromptText(
            runtimeState.options.promptTextMode,
            patch.optimizationStep.optimizedPrompt || "",
          ),
          optimizedWordCount:
            Number(patch.optimizationStep.optimizedWordCount) ||
            estimateWords(patch.optimizationStep.optimizedPrompt || ""),
          optimizedTokenEstimate:
            Number(patch.optimizationStep.optimizedTokenEstimate) ||
            estimateTokens(patch.optimizationStep.optimizedPrompt || ""),
          ts: patch.optimizationStep.ts || nowIso(),
          meta:
            patch.optimizationStep.meta &&
            typeof patch.optimizationStep.meta === "object"
              ? patch.optimizationStep.meta
              : {},
        },
      ];
    }

    runtimeState.promptFlowMap.set(promptSessionId, next);
  }

  function finishPromptFlow(promptSessionId, payload = {}) {
    if (runtimeState.finishedPromptFlowMap.has(promptSessionId)) {
      return runtimeState.finishedPromptFlowMap.get(promptSessionId);
    }

    const current = runtimeState.promptFlowMap.get(promptSessionId);
    if (!current) {
      return;
    }

    const endedAtMs = nowMs();
    const dwellMs = endedAtMs - current.startedAtMs;

    const finalRecord = {
      recordId: generateId("record"),
      schemaVersion: LOGGER_SCHEMA_VERSION,
      participantUUID: null,
      promptSessionId,
      startedAtISO: new Date(current.startedAtMs).toISOString(),
      endedAtISO: new Date(endedAtMs).toISOString(),
      dwellMs,
      sliderSelectionsHistory: current.sliderSelectionsHistory || [],
      optimizationHistory: current.optimizationHistory || [],
      finalLengthOption:
        payload.finalLengthOption || current.selectedLengthOption || null,
      action: payload.action || "unknown",
      decisionMethod: payload.decisionMethod || null,
      promptTextLoggingConsent:
        normalizePromptTextMode(runtimeState.options.promptTextMode) === "full",
      duplicateRemovalUsed: Boolean(
        payload.duplicateRemovalUsed || current.duplicateRemovalUsed,
      ),
      originalPrompt: normalizePromptText(
        runtimeState.options.promptTextMode,
        payload.originalPrompt || current.originalPrompt || "",
      ),
      optimizedPrompt: normalizePromptText(
        runtimeState.options.promptTextMode,
        payload.optimizedPrompt || current.optimizedPrompt || "",
      ),
      originalWordCount:
        Number(payload.originalWordCount) ||
        Number(current.originalWordCount) ||
        0,
      optimizedWordCount:
        Number(payload.optimizedWordCount) ||
        Number(current.optimizedWordCount) ||
        0,
      originalTokenEstimate:
        Number(payload.originalTokenEstimate) ||
        Number(current.originalTokenEstimate) ||
        0,
      optimizedTokenEstimate:
        Number(payload.optimizedTokenEstimate) ||
        Number(current.optimizedTokenEstimate) ||
        0,
      impact: {
        scorePoints: Number(payload.scorePoints) || 0,
        co2Saved: Number(payload.co2Saved) || 0,
        waterSaved: Number(payload.waterSaved) || 0,
        energySavedWh: Number(payload.energySavedWh) || 0,
      },
      gamification: {
        enabled: Boolean(payload.gamificationEnabled),
        levelAtPrompt:
          payload.levelAtPrompt !== undefined ? payload.levelAtPrompt : null,
        scoreBefore:
          payload.scoreBefore !== undefined ? payload.scoreBefore : null,
        scoreAfter:
          payload.scoreAfter !== undefined ? payload.scoreAfter : null,
      },
      extra: payload.extra || {},
    };

    getParticipantUuid().then((uuid) => {
      finalRecord.participantUUID = uuid;
      appendPromptRecord(finalRecord);
    });

    logEvent("prompt_flow_finished", {
      promptSessionId,
      action: finalRecord.action,
      finalLengthOption: finalRecord.finalLengthOption,
      dwellMs,
      scorePoints: finalRecord.impact.scorePoints,
      co2Saved: finalRecord.impact.co2Saved,
      waterSaved: finalRecord.impact.waterSaved,
      energySavedWh: finalRecord.impact.energySavedWh,
      decisionMethod: finalRecord.decisionMethod,
      promptTextLoggingConsent: finalRecord.promptTextLoggingConsent,
    });

    incrementCounter(
      `prompt_action_${String(finalRecord.action || "unknown")}`,
      1,
    );
    runtimeState.finishedPromptFlowMap.set(promptSessionId, finalRecord);

    if (runtimeState.finishedPromptFlowMap.size > 500) {
      const oldestKey = runtimeState.finishedPromptFlowMap.keys().next().value;
      if (oldestKey) {
        runtimeState.finishedPromptFlowMap.delete(oldestKey);
      }
    }

    runtimeState.promptFlowMap.delete(promptSessionId);
    return finalRecord;
  }

  function toJsonl(events) {
    if (!Array.isArray(events) || events.length === 0) {
      return "";
    }
    return events.map((entry) => JSON.stringify(entry)).join("\n");
  }

  function escapeCsv(value, delimiter) {
    const source = value === null || value === undefined ? "" : String(value);
    if (
      source.includes("\n") ||
      source.includes("\r") ||
      source.includes('"') ||
      source.includes(delimiter)
    ) {
      return `"${source.replace(/"/g, '""')}"`;
    }
    return source;
  }

  function promptRecordsToCsv(records, delimiter) {
    const headers = [
      "recordId",
      "participantUUID",
      "promptSessionId",
      "startedAtISO",
      "endedAtISO",
      "dwellMs",
      "action",
      "decisionMethod",
      "finalLengthOption",
      "originalWordCount",
      "optimizedWordCount",
      "originalTokenEstimate",
      "optimizedTokenEstimate",
      "scorePoints",
      "co2Saved",
      "waterSaved",
      "energySavedWh",
      "gamificationEnabled",
      "levelAtPrompt",
      "scoreBefore",
      "scoreAfter",
      "duplicateRemovalUsed",
      "sliderSelectionsHistory",
      "optimizationHistory",
      "promptTextLoggingConsent",
      "originalPrompt",
      "optimizedPrompt",
    ];

    const lines = [headers.join(delimiter)];
    (records || []).forEach((record) => {
      const row = [
        record.recordId,
        record.participantUUID,
        record.promptSessionId,
        record.startedAtISO,
        record.endedAtISO,
        record.dwellMs,
        record.action,
        record.decisionMethod,
        record.finalLengthOption,
        record.originalWordCount,
        record.optimizedWordCount,
        record.originalTokenEstimate,
        record.optimizedTokenEstimate,
        record.impact && record.impact.scorePoints,
        record.impact && record.impact.co2Saved,
        record.impact && record.impact.waterSaved,
        record.impact && record.impact.energySavedWh,
        record.gamification && record.gamification.enabled,
        record.gamification && record.gamification.levelAtPrompt,
        record.gamification && record.gamification.scoreBefore,
        record.gamification && record.gamification.scoreAfter,
        record.duplicateRemovalUsed,
        JSON.stringify(record.sliderSelectionsHistory || []),
        JSON.stringify(record.optimizationHistory || []),
        record.promptTextLoggingConsent,
        record.originalPrompt,
        record.optimizedPrompt,
      ].map((entry) => escapeCsv(entry, delimiter));

      lines.push(row.join(delimiter));
    });

    return lines.join("\n");
  }

  async function getLogSnapshot() {
    const result = await storageGet([
      STORAGE_KEYS.events,
      STORAGE_KEYS.promptRecords,
      STORAGE_KEYS.counters,
      STORAGE_KEYS.meta,
      STORAGE_KEYS.settings,
    ]);

    return {
      schemaVersion: LOGGER_SCHEMA_VERSION,
      events: Array.isArray(result[STORAGE_KEYS.events])
        ? result[STORAGE_KEYS.events]
        : [],
      promptRecords: Array.isArray(result[STORAGE_KEYS.promptRecords])
        ? result[STORAGE_KEYS.promptRecords]
        : [],
      counters:
        result[STORAGE_KEYS.counters] &&
        typeof result[STORAGE_KEYS.counters] === "object"
          ? result[STORAGE_KEYS.counters]
          : {},
      meta:
        result[STORAGE_KEYS.meta] &&
        typeof result[STORAGE_KEYS.meta] === "object"
          ? result[STORAGE_KEYS.meta]
          : {},
      settings:
        result[STORAGE_KEYS.settings] &&
        typeof result[STORAGE_KEYS.settings] === "object"
          ? result[STORAGE_KEYS.settings]
          : {},
    };
  }

  async function exportEventsAsJsonl() {
    const snapshot = await getLogSnapshot();
    const jsonl = toJsonl(snapshot.events);
    logEvent("logs_exported_jsonl", {
      eventsCount: snapshot.events.length,
      promptRecordsCount: snapshot.promptRecords.length,
    });
    return jsonl;
  }

  async function exportPromptRecordsAsCsv(delimiter) {
    const csvDelimiter =
      typeof delimiter === "string" && delimiter.length > 0
        ? delimiter
        : runtimeState.options.csvDelimiter;

    const snapshot = await getLogSnapshot();
    const csv = promptRecordsToCsv(snapshot.promptRecords, csvDelimiter);
    logEvent("logs_exported_csv", {
      promptRecordsCount: snapshot.promptRecords.length,
      delimiter: csvDelimiter,
    });
    return csv;
  }

  function initLogger(options = {}) {
    const incoming = {
      ...(options || {}),
    };

    if (Object.prototype.hasOwnProperty.call(incoming, "promptTextMode")) {
      incoming.promptTextMode = normalizePromptTextMode(
        incoming.promptTextMode,
      );
    }

    runtimeState.options = {
      ...runtimeState.options,
      ...incoming,
    };

    runtimeState.appVersion = getManifestVersion();
    runtimeState.initialized = true;

    storageSet({
      [STORAGE_KEYS.meta]: {
        schemaVersion: LOGGER_SCHEMA_VERSION,
        initializedAtISO: nowIso(),
        appVersion: runtimeState.appVersion,
      },
    });

    // Prefer previously persisted settings to avoid context-level init races.
    storageGet([STORAGE_KEYS.settings]).then((result) => {
      const stored = readStoredSettingsPayload(result[STORAGE_KEYS.settings]);
      runtimeState.options = {
        ...runtimeState.options,
        ...(stored || {}),
      };

      if (Object.prototype.hasOwnProperty.call(incoming, "promptTextMode")) {
        runtimeState.options.promptTextMode = normalizePromptTextMode(
          incoming.promptTextMode,
        );
      }

      persistCurrentSettings();
    });

    return {
      initialized: true,
      options: { ...runtimeState.options },
      appVersion: runtimeState.appVersion,
    };
  }

  const api = {
    initLogger,
    logEvent,
    startSession,
    endSession,
    startPromptFlow,
    updatePromptFlow,
    finishPromptFlow,
    incrementCounter,
    getLoggerSettings,
    setPromptTextMode,
    getPromptTextMode,
    getLogSnapshot,
    exportEventsAsJsonl,
    exportPromptRecordsAsCsv,
  };

  globalScope.GreenPromptLogger = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
