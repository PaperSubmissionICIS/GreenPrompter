(function () {
  "use strict";

  const DEBUG_EXPORT_UI_KEY = "debugShowLoggingExportUI";
  const DEBUG_FEATURES_ENABLED_KEY = "debugFeaturesEnabled";
  const NEXTCLOUD_DEBUG_CONFIG = {
    webdavBaseUrl: "",
    uploadFolderPath: "",
    authUsername: "",
    appPassword: "",
  };

  const NEXTCLOUD_STORAGE_KEYS = {
    status: "nextcloudUploadStatus",
    lastUploadAt: "nextcloudLastUploadAt",
    lastUploadedFileName: "nextcloudLastUploadedFileName",
    lastUploadError: "nextcloudLastUploadError",
    lastUploadTrigger: "nextcloudLastUploadTrigger",
  };

  const GOD_MODE_DEFAULT_STATS = {
    totalPrompts: 0,
    optimizedPrompts: 0,
    wordsSaved: 0,
    energySavedWh: 0,
    energySavedUWh: 0,
    co2Saved: 0,
    waterSaved: 0,
    score: 0,
    level: 1,
    currentTree: "apple",
    completedTrees: [],
    awards: [],
  };

  function setLoggingStatus(message, isError = false) {
    const statusNode = document.getElementById("logging-export-status");
    if (!statusNode) {
      return;
    }
    statusNode.textContent = message;
    statusNode.style.color = isError ? "#991b1b" : "#6b7280";
  }

  function downloadTextFile(fileName, content, mimeType = "text/plain") {
    const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  function getTimestampSuffix() {
    return new Date().toISOString().replace(/[:.]/g, "-");
  }

  function asModeAwarePrompt(promptTextMode, text) {
    const mode = String(promptTextMode || "none").toLowerCase();
    if (mode === "none") {
      return "";
    }
    if (mode === "hashed") {
      return "hash_sample_prompt_text";
    }
    return String(text || "");
  }

  async function buildSyntheticSampleSnapshot(logger) {
    const nowMs = Date.now();
    const startMs = nowMs - 12000;
    const startIso = new Date(startMs).toISOString();
    const endIso = new Date(nowMs).toISOString();
    const promptSessionId = `prompt_sample_${nowMs}`;
    const participantUUID = "sample-participant";

    let baseSnapshot = {
      schemaVersion: 2,
      events: [],
      promptRecords: [],
      counters: {},
      meta: {},
      settings: {},
    };

    if (logger && typeof logger.getLogSnapshot === "function") {
      try {
        const realSnapshot = await logger.getLogSnapshot();
        if (realSnapshot && typeof realSnapshot === "object") {
          baseSnapshot = {
            schemaVersion: Number(realSnapshot.schemaVersion) || 2,
            events: Array.isArray(realSnapshot.events)
              ? realSnapshot.events
              : [],
            promptRecords: Array.isArray(realSnapshot.promptRecords)
              ? realSnapshot.promptRecords
              : [],
            counters:
              realSnapshot.counters && typeof realSnapshot.counters === "object"
                ? realSnapshot.counters
                : {},
            meta:
              realSnapshot.meta && typeof realSnapshot.meta === "object"
                ? realSnapshot.meta
                : {},
            settings:
              realSnapshot.settings && typeof realSnapshot.settings === "object"
                ? realSnapshot.settings
                : {},
          };
        }
      } catch (_error) {
        // Fall back to synthetic-only snapshot when logger snapshot is unavailable.
      }
    }

    const promptTextMode = String(
      baseSnapshot.settings.promptTextMode || "none",
    );
    const consentGiven = promptTextMode.toLowerCase() === "full";
    const exampleOriginal = asModeAwarePrompt(
      promptTextMode,
      "Please explain reinforcement learning in simple terms.",
    );
    const exampleOptimized = asModeAwarePrompt(
      promptTextMode,
      "Explain reinforcement learning simply and give one practical example.",
    );

    const sampleEvents = [
      {
        eventId: `evt_sample_toggle_${nowMs}`,
        schemaVersion: 2,
        appVersion: String(baseSnapshot.meta.appVersion || "0.0.0"),
        timestampISO: startIso,
        timestampMs: startMs,
        eventType: "prompt_text_logging_toggled",
        source: "popup",
        participantUUID,
        sessionId: null,
        environment: { browser: "sample" },
        featureFlags: {},
        payload: {
          enabled: consentGiven,
          consentGiven,
          consentGivenLabel: consentGiven ? "yes" : "no",
          promptTextMode,
        },
      },
      {
        eventId: `evt_sample_start_${nowMs}`,
        schemaVersion: 2,
        appVersion: String(baseSnapshot.meta.appVersion || "0.0.0"),
        timestampISO: new Date(startMs + 1000).toISOString(),
        timestampMs: startMs + 1000,
        eventType: "prompt_flow_started",
        source: "content",
        participantUUID,
        sessionId: null,
        environment: { browser: "sample" },
        featureFlags: { nudging: true, gamification: false, showDiff: true },
        payload: {
          promptSessionId,
          promptTextLoggingConsent: consentGiven,
          source: "Submit button",
          chatPlatform: "chatgpt.com",
          pagePath: "/",
          originalWordCount: 8,
          originalTokenEstimate: 12,
          originalPromptLength: exampleOriginal.length,
          optimizedPromptLength: exampleOptimized.length,
        },
      },
      {
        eventId: `evt_sample_finish_${nowMs}`,
        schemaVersion: 2,
        appVersion: String(baseSnapshot.meta.appVersion || "0.0.0"),
        timestampISO: endIso,
        timestampMs: nowMs,
        eventType: "prompt_flow_finished",
        source: "content",
        participantUUID,
        sessionId: null,
        environment: { browser: "sample" },
        featureFlags: { nudging: true, gamification: false, showDiff: true },
        payload: {
          promptSessionId,
          action: "accept",
          finalLengthOption: "2",
          dwellMs: nowMs - (startMs + 1000),
          scorePoints: 2,
          co2Saved: 0.019,
          waterSaved: 20,
          energySavedWh: 0.004,
          decisionMethod: "button_click",
          promptTextLoggingConsent: consentGiven,
        },
      },
    ];

    const samplePromptRecord = {
      recordId: `record_sample_${nowMs}`,
      schemaVersion: 2,
      participantUUID,
      promptSessionId,
      startedAtISO: startIso,
      endedAtISO: endIso,
      dwellMs: nowMs - startMs,
      finalLengthOption: "2",
      action: "accept",
      decisionMethod: "button_click",
      promptTextLoggingConsent: consentGiven,
      duplicateRemovalUsed: false,
      originalPrompt: exampleOriginal,
      optimizedPrompt: exampleOptimized,
      originalWordCount: 8,
      optimizedWordCount: 10,
      originalTokenEstimate: 12,
      optimizedTokenEstimate: 14,
      impact: {
        scorePoints: 2,
        co2Saved: 0.019,
        waterSaved: 20,
        energySavedWh: 0.004,
      },
      gamification: {
        enabled: false,
        levelAtPrompt: 2,
        scoreBefore: 24,
        scoreAfter: 26,
      },
      sliderSelectionsHistory: [
        {
          value: "1",
          source: "default",
          ts: new Date(startMs + 1500).toISOString(),
        },
        {
          value: "full",
          source: "user_click",
          ts: new Date(startMs + 2200).toISOString(),
        },
        {
          value: "1",
          source: "user_click",
          ts: new Date(startMs + 2900).toISOString(),
        },
        {
          value: "2",
          source: "user_click",
          ts: new Date(startMs + 3600).toISOString(),
        },
      ],
      optimizationHistory: [
        {
          stepType: "initial_optimization",
          selectedLengthOption: null,
          optimizedPrompt: exampleOptimized,
          optimizedWordCount: 10,
          optimizedTokenEstimate: 14,
          ts: new Date(startMs + 1200).toISOString(),
          meta: { sourceLabel: "Submit button" },
        },
        {
          stepType: "length_option_selected",
          selectedLengthOption: "full",
          optimizedPrompt: exampleOptimized,
          optimizedWordCount: 10,
          optimizedTokenEstimate: 14,
          ts: new Date(startMs + 2200).toISOString(),
          meta: {},
        },
        {
          stepType: "length_option_selected",
          selectedLengthOption: "2",
          optimizedPrompt: exampleOptimized,
          optimizedWordCount: 10,
          optimizedTokenEstimate: 14,
          ts: new Date(startMs + 3600).toISOString(),
          meta: {},
        },
      ],
      extra: {
        sampleRecord: true,
        purpose: "verify-consent-and-history-fields",
      },
    };

    const sampleSnapshot = {
      schemaVersion: Number(baseSnapshot.schemaVersion) || 2,
      generatedAtISO: endIso,
      sampleOnly: true,
      sampleDescription:
        "Synthetic snapshot to verify consent toggles, choice history, and per-prompt optimization history.",
      events: sampleEvents,
      promptRecords: [samplePromptRecord],
      counters: {
        events_total: sampleEvents.length,
        prompt_flows_total: 1,
        prompt_action_accept: 1,
      },
      meta: {
        ...(baseSnapshot.meta || {}),
        sampleGeneratedAtISO: endIso,
      },
      settings: {
        ...(baseSnapshot.settings || {}),
        promptTextMode,
        promptTextLoggingConsent: consentGiven,
      },
    };

    return sampleSnapshot;
  }

  function setExportActionsVisibility(isVisible) {
    const exportContainer = document.getElementById(
      "logging-actions-container",
    );
    if (!exportContainer) {
      return;
    }
    exportContainer.style.display = isVisible ? "block" : "none";
  }

  function setUploadDebugVisibility(isVisible) {
    const container = document.getElementById("upload-debug-container");
    if (!container) {
      return;
    }
    container.style.display = isVisible ? "block" : "none";
  }

  function setUploadDebugStatus(message, isError = false) {
    const node = document.getElementById("upload-debug-status");
    if (!node) {
      return;
    }
    node.textContent = message;
    node.style.color = isError ? "#991b1b" : "#6b7280";
  }

  function requestNextcloudUploadStatus(isExtensionContextValid) {
    return new Promise((resolve, reject) => {
      if (!isExtensionContextValid()) {
        reject(new Error("Extension context unavailable."));
        return;
      }

      chrome.runtime.sendMessage(
        { action: "getNextcloudUploadStatus" },
        (response) => {
          if (chrome.runtime.lastError) {
            reject(
              new Error(
                String(chrome.runtime.lastError.message || "runtime_error"),
              ),
            );
            return;
          }
          if (!response || !response.success) {
            reject(new Error("Upload status request failed."));
            return;
          }
          resolve(response.status || {});
        },
      );
    });
  }

  function utf8ToBase64(text) {
    return btoa(unescape(encodeURIComponent(String(text || ""))));
  }

  function buildBasicAuthHeader(username, password) {
    return `Basic ${utf8ToBase64(`${String(username || "")}:${String(password || "")}`)}`;
  }

  function buildDebugWebDavTarget(fileName) {
    const base = String(NEXTCLOUD_DEBUG_CONFIG.webdavBaseUrl || "").replace(
      /\/+$/,
      "",
    );
    const folder = String(NEXTCLOUD_DEBUG_CONFIG.uploadFolderPath || "")
      .split("/")
      .map((segment) => segment.trim())
      .filter(Boolean)
      .map((segment) => encodeURIComponent(segment))
      .join("/");
    const encodedFileName = encodeURIComponent(
      String(fileName || "upload.enc.json"),
    );
    return folder
      ? `${base}/${folder}/${encodedFileName}`
      : `${base}/${encodedFileName}`;
  }

  function requestNextcloudDebugUploadPackage(isExtensionContextValid) {
    return new Promise((resolve, reject) => {
      if (!isExtensionContextValid()) {
        reject(new Error("Extension context unavailable."));
        return;
      }

      chrome.runtime.sendMessage(
        {
          action: "buildNextcloudDebugUploadPackage",
          trigger: "popup_debug_manual",
        },
        (response) => {
          if (chrome.runtime.lastError) {
            reject(
              new Error(
                String(chrome.runtime.lastError.message || "runtime_error"),
              ),
            );
            return;
          }

          if (!response || !response.success || !response.result) {
            reject(
              new Error(
                response && response.error
                  ? String(response.error)
                  : "Could not build encrypted upload package.",
              ),
            );
            return;
          }

          resolve(response.result);
        },
      );
    });
  }

  async function persistNextcloudDebugStatus(statusPayload) {
    await chrome.storage.local.set({
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
    });
  }

  function triggerDebugUploadNow(isExtensionContextValid) {
    return new Promise(async (resolve, reject) => {
      try {
        const packageData = await requestNextcloudDebugUploadPackage(
          isExtensionContextValid,
        );
        const target = buildDebugWebDavTarget(packageData.fileName);
        const authHeader = buildBasicAuthHeader(
          NEXTCLOUD_DEBUG_CONFIG.authUsername,
          NEXTCLOUD_DEBUG_CONFIG.appPassword,
        );

        const response = await fetch(target, {
          method: "PUT",
          headers: {
            Authorization: authHeader,
            "Content-Type": "application/json; charset=utf-8",
          },
          body: String(packageData.encryptedJsonString || ""),
        });

        if (!response.ok) {
          throw new Error(
            `Nextcloud upload failed (${response.status} ${response.statusText}).`,
          );
        }

        const successStatus = {
          state: "success",
          trigger: "popup_debug_manual",
          fileName: packageData.fileName,
          target,
          statusCode: response.status,
          lastUploadAt: new Date().toISOString(),
          error: null,
          source: "debug_js",
        };
        await persistNextcloudDebugStatus(successStatus);

        resolve({
          success: true,
          participantUUID: packageData.participantUUID,
          fileName: packageData.fileName,
          target,
          statusCode: response.status,
          uploadedAt: successStatus.lastUploadAt,
        });
      } catch (error) {
        await persistNextcloudDebugStatus({
          state: "error",
          trigger: "popup_debug_manual",
          fileName: null,
          target: null,
          statusCode: null,
          lastUploadAt: null,
          error: String(error),
          source: "debug_js",
        });
        reject(error);
      }
    });
  }

  function triggerDebugSosciUploadNow(isExtensionContextValid) {
    return new Promise((resolve, reject) => {
      if (!isExtensionContextValid()) {
        reject(new Error("Extension context unavailable."));
        return;
      }

      chrome.runtime.sendMessage(
        {
          action: "triggerSosciUpload",
          trigger: "popup_debug_manual_sosci",
        },
        (response) => {
          if (chrome.runtime.lastError) {
            reject(
              new Error(
                String(chrome.runtime.lastError.message || "runtime_error"),
              ),
            );
            return;
          }

          if (!response || !response.success) {
            reject(
              new Error(
                response && response.error
                  ? String(response.error)
                  : "SoSci upload failed.",
              ),
            );
            return;
          }

          resolve(response.result || {});
        },
      );
    });
  }

  function triggerDebugSosciLargeUploadNow(sizeMb, isExtensionContextValid) {
    return new Promise((resolve, reject) => {
      if (!isExtensionContextValid()) {
        reject(new Error("Extension context unavailable."));
        return;
      }

      chrome.runtime.sendMessage(
        {
          action: "triggerSosciLargeTestUpload",
          sizeMb: Number(sizeMb),
          trigger: `popup_debug_manual_sosci_large_${Number(sizeMb)}mb`,
        },
        (response) => {
          if (chrome.runtime.lastError) {
            reject(
              new Error(
                String(chrome.runtime.lastError.message || "runtime_error"),
              ),
            );
            return;
          }

          if (!response || !response.success) {
            reject(
              new Error(
                response && response.error
                  ? String(response.error)
                  : "SoSci large upload test failed.",
              ),
            );
            return;
          }

          resolve(response.result || {});
        },
      );
    });
  }

  function formatUploadDebugStatus(statusObj) {
    const status = statusObj || {};
    const payload =
      status.nextcloudUploadStatus &&
      typeof status.nextcloudUploadStatus === "object"
        ? status.nextcloudUploadStatus
        : null;

    if (!payload) {
      return "Kein Upload-Status vorhanden.";
    }

    const lines = [];
    lines.push(`State: ${payload.state || "unknown"}`);
    if (payload.trigger) {
      lines.push(`Trigger: ${payload.trigger}`);
    }
    if (payload.lastUploadAt) {
      lines.push(`Last Upload: ${payload.lastUploadAt}`);
    }
    if (payload.fileName) {
      lines.push(`File: ${payload.fileName}`);
    }
    if (payload.target) {
      lines.push(`Target: ${payload.target}`);
    }
    if (payload.statusCode !== undefined && payload.statusCode !== null) {
      lines.push(`HTTP: ${payload.statusCode}`);
    }
    if (payload.retryAt) {
      lines.push(`Retry At: ${payload.retryAt}`);
    }
    if (payload.rateLimitedUntil) {
      lines.push(`Rate Limited Until: ${payload.rateLimitedUntil}`);
    }
    if (status.nextcloudNextScheduledAt) {
      lines.push(`Next Scheduled Upload: ${status.nextcloudNextScheduledAt}`);
    }
    if (payload.retryCount !== undefined && payload.retryCount !== null) {
      lines.push(`Retry Count: ${payload.retryCount}`);
    }
    if (payload.error) {
      lines.push(`Error: ${payload.error}`);
    }

    return lines.join("\n");
  }

  function setupExportActions(logger) {
    const jsonlButton = document.getElementById("export-jsonl-btn");
    const csvButton = document.getElementById("export-csv-btn");
    const sampleSnapshotButton = document.getElementById(
      "export-sample-snapshot-btn",
    );

    if (!jsonlButton || !csvButton || !sampleSnapshotButton) {
      return;
    }

    const loadSummary = async () => {
      if (!logger || typeof logger.getLogSnapshot !== "function") {
        setLoggingStatus("Logger nicht verfuegbar.", true);
        return;
      }

      try {
        const snapshot = await logger.getLogSnapshot();
        setLoggingStatus(
          `Events: ${snapshot.events.length} | Prompt-Records: ${snapshot.promptRecords.length}`,
        );
      } catch (_error) {
        setLoggingStatus("Konnte Logger-Snapshot nicht laden.", true);
      }
    };

    jsonlButton.addEventListener("click", async () => {
      if (!logger || typeof logger.exportEventsAsJsonl !== "function") {
        setLoggingStatus("JSONL Export nicht verfuegbar.", true);
        return;
      }

      try {
        const jsonl = await logger.exportEventsAsJsonl();
        downloadTextFile(
          `greenprompt-events-${getTimestampSuffix()}.jsonl`,
          jsonl,
          "application/x-ndjson",
        );
        setLoggingStatus("JSONL Export erstellt.");
        await loadSummary();
      } catch (_error) {
        setLoggingStatus("JSONL Export fehlgeschlagen.", true);
      }
    });

    csvButton.addEventListener("click", async () => {
      if (!logger || typeof logger.exportPromptRecordsAsCsv !== "function") {
        setLoggingStatus("CSV Export nicht verfuegbar.", true);
        return;
      }

      try {
        const csv = await logger.exportPromptRecordsAsCsv(";");
        downloadTextFile(
          `greenprompt-prompt-records-${getTimestampSuffix()}.csv`,
          csv,
          "text/csv",
        );
        setLoggingStatus("CSV Export erstellt.");
        await loadSummary();
      } catch (_error) {
        setLoggingStatus("CSV Export fehlgeschlagen.", true);
      }
    });

    sampleSnapshotButton.addEventListener("click", async () => {
      try {
        const sampleSnapshot = await buildSyntheticSampleSnapshot(logger);
        downloadTextFile(
          `greenprompt-sample-snapshot-${getTimestampSuffix()}.json`,
          JSON.stringify(sampleSnapshot, null, 2),
          "application/json",
        );
        setLoggingStatus("Sample snapshot export erstellt.");
      } catch (_error) {
        setLoggingStatus("Sample snapshot export fehlgeschlagen.", true);
      }
    });

    loadSummary();
  }

  function setupUploadDebugActions(isExtensionContextValid) {
    const refreshButton = document.getElementById("upload-debug-refresh-btn");
    const triggerButton = document.getElementById("upload-debug-trigger-btn");
    const triggerSosciButton = document.getElementById(
      "upload-debug-sosci-trigger-btn",
    );
    const triggerSosci5MbButton = document.getElementById(
      "upload-debug-sosci-5mb-btn",
    );
    const triggerSosci10MbButton = document.getElementById(
      "upload-debug-sosci-10mb-btn",
    );
    const triggerSosci15MbButton = document.getElementById(
      "upload-debug-sosci-15mb-btn",
    );

    if (
      !refreshButton ||
      !triggerButton ||
      !triggerSosciButton ||
      !triggerSosci5MbButton ||
      !triggerSosci10MbButton ||
      !triggerSosci15MbButton
    ) {
      return;
    }

    const largeTestButtons = [
      triggerSosci5MbButton,
      triggerSosci10MbButton,
      triggerSosci15MbButton,
    ];

    const runLargeSosciTest = async (sizeMb) => {
      largeTestButtons.forEach((button) => {
        button.disabled = true;
      });
      setUploadDebugStatus(`SoSci ${sizeMb} MB Test wird gestartet ...`);

      try {
        const result = await triggerDebugSosciLargeUploadNow(
          sizeMb,
          isExtensionContextValid,
        );
        setUploadDebugStatus(
          [
            `SoSci ${sizeMb} MB Test erfolgreich.`,
            `Participant: ${result.participantUUID || "unknown"}`,
            `Payload Bytes: ${result.payloadBytes || "n/a"}`,
            `Trigger: ${result.trigger || "unknown"}`,
            `Uploaded At: ${result.uploadedAt || "n/a"}`,
          ].join("\n"),
        );
      } catch (error) {
        setUploadDebugStatus(
          `SoSci ${sizeMb} MB Test fehlgeschlagen: ${String(error)}`,
          true,
        );
      } finally {
        largeTestButtons.forEach((button) => {
          button.disabled = false;
        });
      }
    };

    const refreshStatus = async () => {
      try {
        const status = await requestNextcloudUploadStatus(
          isExtensionContextValid,
        );
        const text = formatUploadDebugStatus(status);
        const hasError =
          status &&
          status.nextcloudUploadStatus &&
          status.nextcloudUploadStatus.error;
        setUploadDebugStatus(text, Boolean(hasError));
      } catch (error) {
        setUploadDebugStatus(
          `Status konnte nicht geladen werden: ${String(error)}`,
          true,
        );
      }
    };

    refreshButton.addEventListener("click", async () => {
      await refreshStatus();
    });

    triggerButton.addEventListener("click", async () => {
      triggerButton.disabled = true;
      setUploadDebugStatus("Upload wird gestartet ...");
      try {
        await triggerDebugUploadNow(isExtensionContextValid);
        setUploadDebugStatus("Upload ausgeloest. Lade aktuellen Status ...");
        await refreshStatus();
      } catch (error) {
        setUploadDebugStatus(`Upload fehlgeschlagen: ${String(error)}`, true);
      } finally {
        triggerButton.disabled = false;
      }
    });

    triggerSosciButton.addEventListener("click", async () => {
      triggerSosciButton.disabled = true;
      setUploadDebugStatus("SoSci Upload wird gestartet ...");
      try {
        const result = await triggerDebugSosciUploadNow(
          isExtensionContextValid,
        );
        setUploadDebugStatus(
          [
            "SoSci Upload erfolgreich.",
            `Participant: ${result.participantUUID || "unknown"}`,
            `Trigger: ${result.trigger || "unknown"}`,
            `Uploaded At: ${result.uploadedAt || "n/a"}`,
          ].join("\n"),
        );
      } catch (error) {
        setUploadDebugStatus(
          `SoSci Upload fehlgeschlagen: ${String(error)}`,
          true,
        );
      } finally {
        triggerSosciButton.disabled = false;
      }
    });

    triggerSosci5MbButton.addEventListener("click", async () => {
      await runLargeSosciTest(5);
    });

    triggerSosci10MbButton.addEventListener("click", async () => {
      await runLargeSosciTest(10);
    });

    triggerSosci15MbButton.addEventListener("click", async () => {
      await runLargeSosciTest(15);
    });

    refreshStatus();
  }

  function setGodModeStatus(message, isError = false) {
    const node = document.getElementById("god-mode-status");
    if (!node) {
      return;
    }
    node.textContent = message;
    node.style.color = isError ? "#991b1b" : "#6b7280";
  }

  function getCurrentConfig() {
    return new Promise((resolve) => {
      chrome.storage.local.get(["config"], (result) => {
        const config =
          result && result.config && typeof result.config === "object"
            ? result.config
            : {};
        resolve(config);
      });
    });
  }

  function saveStats(nextStats) {
    return new Promise((resolve) => {
      chrome.storage.local.get(["config"], (result) => {
        const currentConfig =
          result && result.config && typeof result.config === "object"
            ? result.config
            : {};
        const currentStats =
          currentConfig.stats && typeof currentConfig.stats === "object"
            ? currentConfig.stats
            : {};

        const mergedStats = {
          ...currentStats,
          ...nextStats,
        };
        if (!Array.isArray(mergedStats.completedTrees)) {
          mergedStats.completedTrees = [];
        }
        if (!Array.isArray(mergedStats.awards)) {
          mergedStats.awards = [];
        }

        chrome.storage.local.set(
          {
            config: {
              ...currentConfig,
              stats: mergedStats,
            },
          },
          () => resolve(mergedStats),
        );
      });
    });
  }

  function setupGodModeActions() {
    const loadButton = document.getElementById("god-mode-load-btn");
    const applyButton = document.getElementById("god-mode-apply-btn");
    const resetButton = document.getElementById("god-mode-reset-btn");
    const jsonField = document.getElementById("god-mode-json");
    const awardIdInput = document.getElementById("god-mode-award-id");
    const addAwardButton = document.getElementById("god-mode-award-add-btn");
    const removeAwardButton = document.getElementById(
      "god-mode-award-remove-btn",
    );
    const clearAwardButton = document.getElementById(
      "god-mode-award-clear-btn",
    );

    if (
      !loadButton ||
      !applyButton ||
      !resetButton ||
      !jsonField ||
      !awardIdInput ||
      !addAwardButton ||
      !removeAwardButton ||
      !clearAwardButton
    ) {
      return;
    }

    const loadStatsIntoEditor = async () => {
      const config = await getCurrentConfig();
      const currentStats =
        config.stats && typeof config.stats === "object"
          ? config.stats
          : GOD_MODE_DEFAULT_STATS;
      jsonField.value = JSON.stringify(currentStats, null, 2);
    };

    loadButton.addEventListener("click", async () => {
      try {
        await loadStatsIntoEditor();
        setGodModeStatus("Stats in Editor geladen.");
      } catch (error) {
        setGodModeStatus(`Laden fehlgeschlagen: ${String(error)}`, true);
      }
    });

    applyButton.addEventListener("click", async () => {
      try {
        const raw = String(jsonField.value || "").trim();
        if (!raw) {
          throw new Error("Stats JSON ist leer.");
        }

        const parsed = JSON.parse(raw);
        const nextStatsCandidate =
          parsed && parsed.stats && typeof parsed.stats === "object"
            ? parsed.stats
            : parsed;

        if (!nextStatsCandidate || typeof nextStatsCandidate !== "object") {
          throw new Error("Ungueltiges Stats-Objekt.");
        }

        await saveStats(nextStatsCandidate);
        setGodModeStatus("Stats gespeichert. Popup neu oeffnen fuer Refresh.");
      } catch (error) {
        setGodModeStatus(`Anwenden fehlgeschlagen: ${String(error)}`, true);
      }
    });

    resetButton.addEventListener("click", async () => {
      try {
        await saveStats(GOD_MODE_DEFAULT_STATS);
        await loadStatsIntoEditor();
        setGodModeStatus("Stats auf God-Mode-Defaults gesetzt.");
      } catch (error) {
        setGodModeStatus(`Reset fehlgeschlagen: ${String(error)}`, true);
      }
    });

    addAwardButton.addEventListener("click", async () => {
      try {
        const awardId = String(awardIdInput.value || "").trim();
        if (!awardId) {
          throw new Error("Bitte Award-ID eingeben.");
        }

        const config = await getCurrentConfig();
        const stats =
          config.stats && typeof config.stats === "object"
            ? { ...config.stats }
            : { ...GOD_MODE_DEFAULT_STATS };
        const awards = Array.isArray(stats.awards) ? [...stats.awards] : [];

        const exists = awards.some((entry) => {
          if (typeof entry === "string") {
            return entry === awardId;
          }
          return entry && typeof entry === "object" && entry.id === awardId;
        });
        if (!exists) {
          awards.push(awardId);
        }

        await saveStats({ ...stats, awards });
        await loadStatsIntoEditor();
        setGodModeStatus(`Award ${awardId} hinzugefuegt.`);
      } catch (error) {
        setGodModeStatus(`Award-Add fehlgeschlagen: ${String(error)}`, true);
      }
    });

    removeAwardButton.addEventListener("click", async () => {
      try {
        const awardId = String(awardIdInput.value || "").trim();
        if (!awardId) {
          throw new Error("Bitte Award-ID eingeben.");
        }

        const config = await getCurrentConfig();
        const stats =
          config.stats && typeof config.stats === "object"
            ? { ...config.stats }
            : { ...GOD_MODE_DEFAULT_STATS };
        const awards = Array.isArray(stats.awards) ? [...stats.awards] : [];

        const nextAwards = awards.filter((entry) => {
          if (typeof entry === "string") {
            return entry !== awardId;
          }
          if (entry && typeof entry === "object") {
            return entry.id !== awardId;
          }
          return true;
        });

        await saveStats({ ...stats, awards: nextAwards });
        await loadStatsIntoEditor();
        setGodModeStatus(`Award ${awardId} entfernt.`);
      } catch (error) {
        setGodModeStatus(`Award-Remove fehlgeschlagen: ${String(error)}`, true);
      }
    });

    clearAwardButton.addEventListener("click", async () => {
      try {
        const config = await getCurrentConfig();
        const stats =
          config.stats && typeof config.stats === "object"
            ? { ...config.stats }
            : { ...GOD_MODE_DEFAULT_STATS };

        await saveStats({ ...stats, awards: [] });
        await loadStatsIntoEditor();
        setGodModeStatus("Alle Awards entfernt.");
      } catch (error) {
        setGodModeStatus(`Award-Clear fehlgeschlagen: ${String(error)}`, true);
      }
    });

    loadStatsIntoEditor().catch((_error) => {
      setGodModeStatus("Konnte Stats nicht initial laden.", true);
    });

    const panel = document.getElementById("god-mode-panel");
    if (!panel || document.getElementById("god-mode-quick-actions")) {
      return;
    }

    const quickActions = document.createElement("div");
    quickActions.id = "god-mode-quick-actions";
    quickActions.className = "upload-debug-row";

    const treePopupButton = document.createElement("button");
    treePopupButton.type = "button";
    treePopupButton.className = "upload-debug-btn";
    treePopupButton.textContent = "Show Tree Selection Popup";

    const awardPopupButton = document.createElement("button");
    awardPopupButton.type = "button";
    awardPopupButton.className = "upload-debug-btn";
    awardPopupButton.textContent = "Show Award Popup";

    const sendDebugCommandToActiveTab = (action, payload = {}) => {
      return new Promise((resolve, reject) => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          const activeTab = Array.isArray(tabs) ? tabs[0] : null;
          if (!activeTab || typeof activeTab.id !== "number") {
            reject(new Error("No active tab found."));
            return;
          }

          chrome.tabs.sendMessage(
            activeTab.id,
            {
              action,
              ...payload,
            },
            (response) => {
              if (chrome.runtime.lastError) {
                reject(
                  new Error(
                    String(chrome.runtime.lastError.message || "runtime_error"),
                  ),
                );
                return;
              }

              if (!response || !response.success) {
                reject(
                  new Error(
                    response && response.error
                      ? String(response.error)
                      : "Command failed.",
                  ),
                );
                return;
              }

              resolve(response);
            },
          );
        });
      });
    };

    treePopupButton.addEventListener("click", async () => {
      treePopupButton.disabled = true;
      setGodModeStatus("Opening tree selection popup ...");
      try {
        await sendDebugCommandToActiveTab("debugShowTreeSelectionPopup");
        setGodModeStatus("Tree selection popup opened in active ChatGPT tab.");
      } catch (error) {
        setGodModeStatus(`Tree selection popup failed: ${String(error)}`, true);
      } finally {
        treePopupButton.disabled = false;
      }
    });

    awardPopupButton.addEventListener("click", async () => {
      awardPopupButton.disabled = true;
      setGodModeStatus("Opening award popup ...");
      try {
        await sendDebugCommandToActiveTab("debugShowAwardPopup");
        setGodModeStatus("Award popup opened in active ChatGPT tab.");
      } catch (error) {
        setGodModeStatus(`Award popup failed: ${String(error)}`, true);
      } finally {
        awardPopupButton.disabled = false;
      }
    });

    quickActions.appendChild(treePopupButton);
    quickActions.appendChild(awardPopupButton);
    panel.insertBefore(quickActions, panel.firstChild.nextSibling);
  }

  function createDebugUuidForGroup(groupCode) {
    const normalizedGroup = String(groupCode || "BA").toUpperCase();
    const stemByGroup = {
      FU: "F001-0001-0001-0001",
      GF: "C001-0001-0001-0001",
      DN: "D001-0001-0001-0001",
      BA: "B001-0001-0001-0001",
    };

    const fallbackStem = "A001-0001-0001-0001";
    const stem = stemByGroup[normalizedGroup] || fallbackStem;
    return `${stem}-${normalizedGroup}`;
  }

  function setupDebugOnboardingPresets() {
    const onboardingScreen = document.getElementById("onboarding-screen");
    const uuidInput = document.getElementById("uuid-input");
    const submitButton = document.getElementById("submit-uuid");

    if (!onboardingScreen || !uuidInput || !submitButton) {
      return;
    }

    if (document.getElementById("debug-onboarding-preset-panel")) {
      return;
    }

    const panel = document.createElement("div");
    panel.id = "debug-onboarding-preset-panel";
    panel.style.marginTop = "10px";
    panel.style.background = "#f8fafc";
    panel.style.border = "1px solid #e5e7eb";
    panel.style.borderRadius = "10px";
    panel.style.padding = "10px";

    const title = document.createElement("div");
    title.textContent = "Debug UUID Presets";
    title.style.fontSize = "12px";
    title.style.fontWeight = "700";
    title.style.color = "#374151";
    title.style.marginBottom = "8px";
    title.style.textAlign = "center";

    const row = document.createElement("div");
    row.style.display = "flex";
    row.style.gap = "6px";
    row.style.flexWrap = "wrap";
    row.style.justifyContent = "center";

    const status = document.createElement("div");
    status.style.marginTop = "8px";
    status.style.fontSize = "11px";
    status.style.color = "#6b7280";
    status.style.textAlign = "center";
    status.textContent = "Choose group: fu | gf | dn | ba";

    const groups = ["FU", "GF", "DN", "BA"];
    groups.forEach((group) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = group;
      button.style.border = "1px solid #d1d5db";
      button.style.borderRadius = "8px";
      button.style.padding = "6px 10px";
      button.style.fontSize = "12px";
      button.style.fontWeight = "700";
      button.style.background = "#ffffff";
      button.style.color = "#1f2937";
      button.style.cursor = "pointer";

      button.addEventListener("click", () => {
        const uuid = createDebugUuidForGroup(group);
        uuidInput.value = uuid;
        uuidInput.dispatchEvent(new Event("input", { bubbles: true }));
        status.textContent = `Preset ${group} applied: ${uuid}`;
      });

      row.appendChild(button);
    });

    const quickStart = document.createElement("button");
    quickStart.type = "button";
    quickStart.textContent = "Use selected UUID and start";
    quickStart.style.marginTop = "8px";
    quickStart.style.width = "100%";
    quickStart.style.border = "1px solid #d1d5db";
    quickStart.style.borderRadius = "8px";
    quickStart.style.padding = "8px";
    quickStart.style.fontSize = "12px";
    quickStart.style.fontWeight = "600";
    quickStart.style.background = "#f9fafb";
    quickStart.style.color = "#1f2937";
    quickStart.style.cursor = "pointer";
    quickStart.addEventListener("click", () => {
      submitButton.click();
    });

    panel.appendChild(title);
    panel.appendChild(row);
    panel.appendChild(quickStart);
    panel.appendChild(status);

    onboardingScreen.appendChild(panel);
  }

  function markDebugRuntimeEnabled() {
    chrome.storage.local.set({ [DEBUG_FEATURES_ENABLED_KEY]: true }, () => {
      // Best effort marker for background debug action guards.
    });
  }

  function initPopupDebug(context = {}) {
    const logger = context.logger || null;
    const isExtensionContextValid =
      typeof context.isExtensionContextValid === "function"
        ? context.isExtensionContextValid
        : () => false;

    markDebugRuntimeEnabled();

    chrome.storage.local.get([DEBUG_EXPORT_UI_KEY], (result) => {
      const hasExplicitPreference = Object.prototype.hasOwnProperty.call(
        result || {},
        DEBUG_EXPORT_UI_KEY,
      );
      const exportEnabledForDebug = hasExplicitPreference
        ? Boolean(result[DEBUG_EXPORT_UI_KEY])
        : true;

      if (!hasExplicitPreference) {
        chrome.storage.local.set({ [DEBUG_EXPORT_UI_KEY]: true });
      }

      setExportActionsVisibility(exportEnabledForDebug);
      setUploadDebugVisibility(true);
      if (exportEnabledForDebug) {
        setupExportActions(logger);
      }
      setupUploadDebugActions(isExtensionContextValid);
      setupGodModeActions();
      setupDebugOnboardingPresets();
    });
  }

  if (typeof window !== "undefined") {
    window.GreenPromptDebug = {
      initPopupDebug,
    };
  }
})();
