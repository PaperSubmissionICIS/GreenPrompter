/**
 * GreenPrompt Popup Script
 * Renders local stats and module-specific UI panels.
 */

(function () {
  "use strict";

  const logger = globalThis.GreenPromptLogger || null;
  const onboardingApi = globalThis.GreenPromptOnboarding || null;
  if (logger && typeof logger.initLogger === "function") {
    logger.initLogger({ source: "popup" });
  }

  const SCORE_PER_LEVEL = 20;
  const UUID_PATTERN_V4 =
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const UUID_PATTERN_SIMPLE =
    /^[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}$/i;
  const FOLLOW_UP_BASE_URL =
    "https://survey.ise.tu-darmstadt.de/greenAI_extension/";
  const FOLLOW_UP_T1_QUERY = "qnr5";
  const FOLLOW_UP_T5_QUERY = "qnr6";
  const ONE_DAY_MS = 24 * 60 * 60 * 1000;
  const FIVE_DAYS_MS = 5 * ONE_DAY_MS;
  const LOGGER_SETTINGS_KEY = "studyLogs_settings";

  function parseDelayOverride(value, fallbackMs) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) {
      return fallbackMs;
    }
    return parsed;
  }

  const LEVEL_TITLES = {
    1: "Seeding Phase",
    2: "Sapling Phase",
    3: "Growing Phase",
    4: "Fruiting Phase",
    0: "Mature Phase",
  };

  const TREE_IMAGES = {
    apple: {
      1: "assets/trees/Level1_AppleTree.webp",
      2: "assets/trees/tree.webp",
      3: "assets/trees/Level3_AT.webp",
      4: "assets/trees/Level4_AT.webp",
      0: "assets/trees/Level5_AT.webp",
    },
    olive: {
      1: "assets/trees/Level1_OliveTree.webp",
      2: "assets/trees/Level2_OliveTree.webp",
      3: "assets/trees/Level3_OliveTree.webp",
      4: "assets/trees/Level4_OliveTree.webp",
      0: "assets/trees/Level5_OliveTree.webp",
    },
    maple: {
      1: "assets/trees/Level1_MapleTree.webp",
      2: "assets/trees/Level2_MapleTree.webp",
      3: "assets/trees/Level3_MapleTree.webp",
      4: "assets/trees/Level4_MapleTree.webp",
      0: "assets/trees/Level5_MapleTree.webp",
    },
    fir: {
      1: "assets/trees/Level1_FirTree.webp",
      2: "assets/trees/Level2_FirTree.webp",
      3: "assets/trees/Level3_FirTree.webp",
      4: "assets/trees/Level4_FirTree.webp",
      0: "assets/trees/Level5_FirTree.webp",
    },
  };

  function normalizeTreeKey(treeValue) {
    const value = String(treeValue || "")
      .trim()
      .toLowerCase();

    if (value === "mable") {
      return "maple";
    }

    if (value in TREE_IMAGES) {
      return value;
    }

    return "apple";
  }

  function normalizeStats(rawStats) {
    const stats = rawStats || {};
    const score = Number(stats.score) || 0;
    const explicitLevel = Number(stats.level);
    const level =
      Number.isFinite(explicitLevel) && explicitLevel > 0
        ? Math.floor(explicitLevel)
        : Math.max(1, Math.floor(score / SCORE_PER_LEVEL) + 1);
    const storedWh = Number(stats.energySavedWh);
    const storedUWh = Number(stats.energySavedUWh);
    const canonicalEnergyWh =
      Number.isFinite(storedWh) && storedWh > 0
        ? storedWh
        : Number.isFinite(storedUWh) && storedUWh > 0
          ? storedUWh / 1000000
          : 0;

    return {
      totalPrompts: Number(stats.totalPrompts) || 0,
      optimizedPrompts: Number(stats.optimizedPrompts) || 0,
      wordsSaved: Number(stats.wordsSaved) || 0,
      energySavedWh: canonicalEnergyWh,
      energySavedUWh: Math.round(canonicalEnergyWh * 1000000),
      co2Saved: Number(stats.co2Saved) || 0,
      waterSaved: Number(stats.waterSaved) || 0,
      level,
      score,
      currentTree: normalizeTreeKey(stats.currentTree),
      completedTrees: Array.isArray(stats.completedTrees)
        ? stats.completedTrees
        : [],
      awards: Array.isArray(stats.awards) ? stats.awards : [],
    };
  }

  function formatEnergy(stats) {
    if (stats.energySavedWh >= 1) {
      return `${stats.energySavedWh.toFixed(3)} Wh`;
    }
    return `${Math.round(stats.energySavedUWh)} uWh`;
  }

  function formatCo2(co2Grams) {
    const value = Math.max(0, Number(co2Grams) || 0);
    if (value === 0) {
      return "0 mg";
    }
    if (value < 0.01) {
      return `${Math.max(1, Math.round(value * 1000))} mg`;
    }
    if (value < 1) {
      return `${value.toFixed(3)} g`;
    }
    return `${value.toFixed(2)} g`;
  }

  function formatWaterMl(waterMl) {
    const value = Math.max(0, Number(waterMl) || 0);
    if (Number.isInteger(value)) {
      return `${value} ml`;
    }
    const formatted = value
      .toFixed(2)
      .replace(/\.00$/, "")
      .replace(/(\.\d)0$/, "$1");
    return `${formatted} ml`;
  }

  function getTreeMeta(stats) {
    const treeKey =
      stats.currentTree in TREE_IMAGES ? stats.currentTree : "apple";
    const levelForImage = stats.level % 5;
    const treeImage = TREE_IMAGES[treeKey][levelForImage];
    const treeName = `${treeKey.charAt(0).toUpperCase()}${treeKey.slice(1)} Tree`;
    return {
      treeName,
      levelTitle: LEVEL_TITLES[levelForImage],
      imageUrl: chrome.runtime.getURL(treeImage),
      levelForImage,
      treeKey,
    };
  }

  function createPanel(title) {
    const panel = document.createElement("div");
    panel.style.cssText = [
      "background-color: white",
      "border-radius: 12px",
      "padding: 14px",
      "margin-top: 16px",
      "box-shadow: 0 2px 6px rgba(0,0,0,0.15)",
    ].join(";");

    if (title) {
      const heading = document.createElement("h2");
      heading.style.cssText =
        "font-size:14px; margin-bottom:10px; color:#333; text-align:center;";
      heading.textContent = title;
      panel.appendChild(heading);
    }

    return panel;
  }

  function renderGamificationPanel(content, stats, modules) {
    if (!modules.gamification) {
      return;
    }

    logEvent("panel_viewed", {
      panel: "gamification",
      level: stats.level,
      score: stats.score,
    });

    const treeMeta = getTreeMeta(stats);
    const progressPercent =
      ((stats.score % SCORE_PER_LEVEL) / SCORE_PER_LEVEL) * 100;
    const progressColor = modules.nudging ? "#2fa866" : "#1a73e8";

    const panel = document.createElement("div");
    panel.className = "gp-gamification-panel";
    panel.style.cssText = [
      "background-color: white",
      "border-radius: 12px",
      "padding: 14px",
      "margin-bottom: 16px",
      "text-align: center",
      "box-shadow: 0 2px 6px rgba(0,0,0,0.15)",
    ].join(";");

    panel.innerHTML = `
      <div class="gp-level-section">
        <div class="gp-level-value">Level ${stats.level}</div>
        <div class="gp-level-subtitle">${treeMeta.treeName} - ${treeMeta.levelTitle}</div>
      </div>

      <img src="${treeMeta.imageUrl}" class="gp-tree-avatar" style="
        width: 200px;
        height: 200px;
        border-radius: 50%;
        object-fit: cover;
        box-shadow: 0 2px 6px rgba(0,0,0,0.2);
        margin: 10px 0;
      " />

      <div class="gp-score-section">
        <div class="gp-score-label">Environmental Score:</div>
        <div class="gp-progress-container" style="
          width: 80%;
          height: 8px;
          background-color: #e0e0e0;
          border-radius: 4px;
          margin: 6px auto 10px;
        ">
          <div class="gp-progress-bar" style="
            height: 100%;
            background-color: ${progressColor};
            width: ${progressPercent}%;
            border-radius: 4px;
            transition: width 0.5s ease-in-out;
          "></div>
        </div>
        <div class="gp-score-value">${stats.score}/${stats.level * SCORE_PER_LEVEL}</div>
      </div>
    `;

    const statsGrid = content.querySelector(".stats-grid");
    content.insertBefore(panel, statsGrid);
  }

  function renderCompletedTrees(content, stats, modules) {
    if (!modules.gamification) {
      return;
    }

    logEvent("panel_viewed", {
      panel: "completed_trees",
      completedTrees: Array.isArray(stats.completedTrees)
        ? stats.completedTrees.length
        : 0,
    });

    const panel = createPanel("Completed Trees");
    panel.className = "gp-completed-trees-panel";
    const scrollBox = document.createElement("div");
    scrollBox.style.cssText = [
      "max-height: 200px",
      "overflow-y: auto",
      "display: flex",
      "flex-wrap: wrap",
      "gap: 12px",
      "justify-content: center",
      "padding: 10px",
    ].join(";");

    if (!stats.completedTrees.length) {
      scrollBox.innerHTML =
        "<p style='font-size:12px; color:#777;'>No completed trees yet.</p>";
    } else {
      stats.completedTrees.forEach((tree) => {
        if (typeof tree !== "string" || !TREE_IMAGES[tree]) {
          return;
        }

        const treeName = `${tree.charAt(0).toUpperCase()}${tree.slice(1)} Tree`;
        const treeImageUrl = chrome.runtime.getURL(TREE_IMAGES[tree][0]);

        const treeCard = document.createElement("div");
        treeCard.style.cssText =
          "width: 90px; text-align: center; font-size: 11px; color: #555;";
        treeCard.innerHTML = `
          <img src="${treeImageUrl}" style="
            width: 70px;
            height: 70px;
            border-radius: 50%;
            object-fit: cover;
            box-shadow: 0 2px 6px rgba(0,0,0,0.2);
            margin-bottom: 6px;
          "/>
          <div style="font-weight:500;">${treeName}</div>
        `;

        scrollBox.appendChild(treeCard);
      });
    }

    panel.appendChild(scrollBox);
    const statsGrid = content.querySelector(".stats-grid");
    statsGrid.insertAdjacentElement("afterend", panel);
  }

  function renderAwardsPanel(content, stats, modules) {
    if (!modules.gamification) {
      return;
    }

    logEvent("panel_viewed", {
      panel: "awards",
      awardsCount: Array.isArray(stats.awards) ? stats.awards.length : 0,
    });

    const panel = createPanel("Awards");
    const scrollBox = document.createElement("div");
    scrollBox.style.cssText = [
      "max-height: 200px",
      "overflow-y: auto",
      "display: flex",
      "flex-wrap: wrap",
      "gap: 12px",
      "justify-content: center",
      "padding: 10px",
    ].join(";");

    if (!stats.awards.length) {
      scrollBox.innerHTML =
        "<p style='font-size:12px; color:#777;'>No awards yet.</p>";
    } else {
      stats.awards.forEach((awardEntry) => {
        const award =
          typeof awardEntry === "string"
            ? {
                id: awardEntry,
                icon: "assets/rewards/reward10.webp",
                label: "Green Prompter Award",
              }
            : awardEntry;

        if (!award || !award.icon) {
          return;
        }

        const awardCard = document.createElement("div");
        awardCard.style.cssText =
          "width: 100px; text-align: center; font-size: 11px; color: #555;";
        awardCard.innerHTML = `
          <img src="${chrome.runtime.getURL(award.icon)}" style="
            width: 70px;
            height: 70px;
            border-radius: 12px;
            object-fit: cover;
            box-shadow: 0 2px 6px rgba(0,0,0,0.2);
            margin-bottom: 6px;
          "/>
          <div style="font-weight:500;">${award.label || "Award"}</div>
        `;

        scrollBox.appendChild(awardCard);
      });
    }

    panel.appendChild(scrollBox);

    const completedPanel = content.querySelector(".gp-completed-trees-panel");
    if (completedPanel) {
      completedPanel.insertAdjacentElement("afterend", panel);
    } else {
      const statsGrid = content.querySelector(".stats-grid");
      statsGrid.insertAdjacentElement("afterend", panel);
    }
  }

  function renderNudgingPanel(content, stats, modules) {
    if (!modules.nudging) {
      return;
    }

    const panel = createPanel("Environmental Impact");
    const energyWh = Math.max(0, Number(stats.energySavedWh) || 0);
    const waterMl = Math.max(0, Number(stats.waterSaved) || 0);

    if (energyWh <= 0 && waterMl <= 0) {
      logEvent("panel_viewed", {
        panel: "environmental_impact",
        state: "empty",
      });

      const emptyState = document.createElement("p");
      emptyState.style.cssText =
        "font-size:12px; line-height:1.6; color:#6b7280; text-align:center;";
      emptyState.textContent =
        "No savings recorded yet. Use GreenPrompt for initial environmental effects.";
      panel.appendChild(emptyState);

      const statsGrid = content.querySelector(".stats-grid");
      statsGrid.insertAdjacentElement("afterend", panel);
      return;
    }

    const netflixMinMin = energyWh / 3.33;
    const netflixMinMax = energyWh / 1.67;
    const kettleLiters = energyWh / 100;
    const googleSearches = energyWh / 0.3;
    const bulbHours = energyWh / 5;

    const handWashes = waterMl / 1000;
    const toiletFlushes = waterMl / 6000;
    const showerSessions5m = waterMl / 60000;
    const waterGlasses = waterMl / 200;

    const title = document.createElement("p");
    title.style.cssText =
      "font-size:12px; line-height:1.5; color:#2f5f2f; text-align:center; margin-bottom:10px;";
    title.textContent = "Your savings are approximately equal to:";
    panel.appendChild(title);

    const equivalentGrid = document.createElement("div");
    equivalentGrid.style.cssText = [
      "display:grid",
      "grid-template-columns:1fr 1fr",
      "gap:8px",
      "font-size:12px",
      "color:#1f2937",
      "line-height:1.4",
    ].join(";");

    const tiles = [
      {
        label: "Netflix (HD)",
        value: `${netflixMinMin.toFixed(1)}-${netflixMinMax.toFixed(1)} Min.`,
      },
      {
        label: "Google-Searches",
        value: `${googleSearches.toFixed(0)} Searches`,
      },
      {
        label: "Light Bulb",
        value: `${bulbHours.toFixed(1)} Hours`,
      },
      {
        label: "Kettle",
        value: `${kettleLiters.toFixed(2)} Liters`,
      },
      {
        label: "Hand Washes",
        value: `${handWashes.toFixed(2)}x`,
      },
      {
        label: "Toilet Flushes",
        value: `${toiletFlushes.toFixed(2)}x`,
      },
      {
        label: "5-Min-Shower",
        value: `${showerSessions5m.toFixed(3)}x`,
      },
      {
        label: "Glass of Water",
        value: `${waterGlasses.toFixed(1)} Glasses`,
      },
    ];

    tiles.forEach((tile) => {
      const card = document.createElement("div");
      card.style.cssText = [
        "background:#f8fafc",
        "border:1px solid #e5e7eb",
        "border-radius:10px",
        "padding:8px",
        "min-height:56px",
        "display:flex",
        "flex-direction:column",
        "justify-content:center",
        "gap:4px",
      ].join(";");

      const label = document.createElement("div");
      label.style.cssText =
        "font-size:11px; color:#6b7280; font-weight:600; line-height:1.2;";
      label.textContent = tile.label;

      const value = document.createElement("div");
      value.style.cssText =
        "font-size:12px; color:#111827; font-weight:700; line-height:1.3;";
      value.textContent = tile.value;

      card.appendChild(label);
      card.appendChild(value);
      equivalentGrid.appendChild(card);
    });

    panel.appendChild(equivalentGrid);

    logEvent("panel_viewed", {
      panel: "environmental_impact",
      state: "with_values",
      energyWh,
      waterMl,
      tilesCount: tiles.length,
    });

    const statsGrid = content.querySelector(".stats-grid");
    statsGrid.insertAdjacentElement("afterend", panel);
  }

  function updateStatsDom(stats, modules) {
    const set = (id, value) => {
      const node = document.getElementById(id);
      if (node) {
        node.textContent = value;
      }
    };

    const treeMeta = getTreeMeta(stats);

    set("totalPrompts", stats.totalPrompts);
    set("optimizedPrompts", stats.optimizedPrompts);
    set("wordsSaved", Math.round(stats.wordsSaved));
    set("energySaved", formatEnergy(stats));
    set("co2Saved", formatCo2(stats.co2Saved));
    set("waterSaved", formatWaterMl(stats.waterSaved));
    set("level", stats.level);
    set("currentTree", treeMeta.treeName);

    const levelElement = document.getElementById("level");
    const treeElement = document.getElementById("currentTree");
    if (levelElement && levelElement.parentElement) {
      levelElement.parentElement.style.display = modules.gamification
        ? "block"
        : "none";
    }
    if (treeElement && treeElement.parentElement) {
      treeElement.parentElement.style.display = modules.gamification
        ? "block"
        : "none";
    }

    const co2Element = document.getElementById("co2Saved");
    const waterElement = document.getElementById("waterSaved");
    const energyElement = document.getElementById("energySaved");
    const wordsElement = document.getElementById("wordsSaved");
    const impactVisible = !!modules.nudging;

    [co2Element, waterElement, energyElement, wordsElement].forEach(
      (element) => {
        if (element && element.parentElement) {
          element.parentElement.style.display = impactVisible
            ? "block"
            : "none";
        }
      },
    );
  }

  function normalizeUuid(uuid) {
    if (
      onboardingApi &&
      typeof onboardingApi.normalizeUuidInput === "function"
    ) {
      return String(onboardingApi.normalizeUuidInput(uuid)).toLowerCase();
    }

    return String(uuid || "")
      .trim()
      .toLowerCase();
  }

  function setupPromptLoggingHelpTooltip() {
    const wrap = document.getElementById("prompt-logging-help-wrap");
    const button = document.getElementById("prompt-logging-help-btn");

    if (!wrap || !button) {
      return;
    }

    const setOpen = (isOpen) => {
      wrap.classList.toggle("is-open", isOpen);
      button.setAttribute("aria-expanded", isOpen ? "true" : "false");
    };

    button.addEventListener("click", (event) => {
      event.preventDefault();
      const shouldOpen = !wrap.classList.contains("is-open");
      setOpen(shouldOpen);
    });

    document.addEventListener("click", (event) => {
      if (!wrap.contains(event.target)) {
        setOpen(false);
      }
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    });
  }

  function isValidUuid(uuid) {
    if (
      onboardingApi &&
      typeof onboardingApi.validateParticipantUuid === "function"
    ) {
      return Boolean(onboardingApi.validateParticipantUuid(uuid).valid);
    }

    const normalized = normalizeUuid(uuid);
    return (
      UUID_PATTERN_V4.test(normalized) || UUID_PATTERN_SIMPLE.test(normalized)
    );
  }

  function maskUuid(uuid) {
    const value = normalizeUuid(uuid);
    if (!value) {
      return "participant: not set";
    }
    return `participant: ${value}`;
  }

  function buildFollowUpUrl(queryId, uuid, source = "popup") {
    const normalizedUuid = normalizeUuid(uuid);
    const params = new URLSearchParams();
    params.set("q", queryId);
    if (normalizedUuid) {
      params.set("uuid", normalizedUuid);
    }
    params.set("source", source);
    return `${FOLLOW_UP_BASE_URL}?${params.toString()}`;
  }

  function openFollowUpInTab(type, uuid, onMarkedOpened) {
    const queryId = type === "t1" ? FOLLOW_UP_T1_QUERY : FOLLOW_UP_T5_QUERY;
    const url = buildFollowUpUrl(queryId, uuid, `popup_${type}_button`);

    chrome.tabs.create({ url }, () => {
      if (chrome.runtime.lastError) {
        return;
      }

      const key = type === "t1" ? "followUpT1OpenedAt" : "followUpT5OpenedAt";
      chrome.storage.local.set({ [key]: new Date().toISOString() });
      logEvent(`followup_${type}_opened_from_popup`, { url });

      if (typeof onMarkedOpened === "function") {
        onMarkedOpened();
      }
    });
  }

  function triggerEncryptedUpload(trigger, participantUUID) {
    if (!isExtensionContextValid()) {
      return;
    }

    try {
      chrome.runtime.sendMessage(
        {
          action: "triggerEncryptedUpload",
          trigger: String(trigger || "popup_manual"),
          participantUUID: normalizeUuid(participantUUID),
        },
        (response) => {
          if (chrome.runtime.lastError) {
            logEvent("nextcloud_upload_trigger_failed", {
              source: "popup",
              trigger,
              reason: String(
                chrome.runtime.lastError.message || "runtime_error",
              ),
            });
            return;
          }

          if (!response || !response.success) {
            logEvent("nextcloud_upload_trigger_failed", {
              source: "popup",
              trigger,
              reason:
                response && response.error ? String(response.error) : "unknown",
            });
            return;
          }

          logEvent("nextcloud_upload_triggered", {
            source: "popup",
            trigger,
          });
        },
      );
    } catch (error) {
      logEvent("nextcloud_upload_trigger_failed", {
        source: "popup",
        trigger,
        reason: String(error),
      });
    }
  }

  function triggerMilestoneUploads(trigger, participantUUID) {
    if (!isExtensionContextValid()) {
      return;
    }

    try {
      chrome.runtime.sendMessage(
        {
          action: "triggerMilestoneUploads",
          trigger: String(trigger || "popup_followup_click"),
          participantUUID: normalizeUuid(participantUUID),
        },
        (response) => {
          if (chrome.runtime.lastError) {
            logEvent("milestone_upload_trigger_failed", {
              source: "popup",
              trigger,
              reason: String(
                chrome.runtime.lastError.message || "runtime_error",
              ),
            });
            return;
          }

          if (!response || !response.success) {
            logEvent("milestone_upload_trigger_failed", {
              source: "popup",
              trigger,
              reason:
                response && response.error ? String(response.error) : "unknown",
            });
            return;
          }

          logEvent("milestone_upload_triggered", {
            source: "popup",
            trigger,
            nextcloudSuccess: Boolean(
              response.result &&
              response.result.nextcloud &&
              response.result.nextcloud.success,
            ),
            sosciSuccess: Boolean(
              response.result &&
              response.result.sosci &&
              response.result.sosci.success,
            ),
          });
        },
      );
    } catch (error) {
      logEvent("milestone_upload_trigger_failed", {
        source: "popup",
        trigger,
        reason: String(error),
      });
    }
  }

  function setFollowUpButtonState(button, options) {
    if (!button) {
      return;
    }

    const { due, opened, defaultLabel, completedLabel } = options || {};

    button.style.display = due ? "inline-flex" : "none";

    if (!due) {
      button.disabled = false;
      button.classList.remove("followup-btn-completed");
      button.textContent = defaultLabel;
      return;
    }

    if (opened) {
      button.disabled = false;
      button.classList.add("followup-btn-completed");
      button.textContent = completedLabel;
      return;
    }

    button.disabled = false;
    button.classList.remove("followup-btn-completed");
    button.textContent = defaultLabel;
  }

  async function loadOptionalDebugScript() {
    if (typeof window === "undefined") {
      return false;
    }
    if (window.GreenPromptDebug) {
      return true;
    }
    if (!isExtensionContextValid()) {
      return false;
    }

    return new Promise((resolve) => {
      const script = document.createElement("script");
      script.src = chrome.runtime.getURL("debug.js");
      script.async = true;
      script.onload = () => resolve(Boolean(window.GreenPromptDebug));
      script.onerror = () => resolve(false);
      document.head.appendChild(script);
    });
  }

  async function initOptionalDebugUi() {
    try {
      const loaded = await loadOptionalDebugScript();
      if (!loaded || !window.GreenPromptDebug) {
        return;
      }

      if (typeof window.GreenPromptDebug.initPopupDebug === "function") {
        window.GreenPromptDebug.initPopupDebug({
          logger,
          isExtensionContextValid,
        });
      }
    } catch (_error) {
      // Keep popup fully functional if debug tooling is absent.
    }
  }

  function setPromptTextLoggingStatus(enabled) {
    const statusNode = document.getElementById("prompt-text-logging-status");
    if (!statusNode) {
      return;
    }

    statusNode.textContent = enabled
      ? "On: full prompt text is stored locally."
      : "Off: prompt text is not stored.";
    statusNode.style.color = enabled ? "#065f46" : "#6b7280";
  }

  async function getCurrentPromptTextMode() {
    if (logger && typeof logger.getLoggerSettings === "function") {
      const settings = await logger.getLoggerSettings();
      return settings && settings.promptTextMode
        ? String(settings.promptTextMode)
        : "none";
    }

    return new Promise((resolve) => {
      chrome.storage.local.get([LOGGER_SETTINGS_KEY], (result) => {
        const settings =
          result && result[LOGGER_SETTINGS_KEY]
            ? result[LOGGER_SETTINGS_KEY]
            : null;
        resolve(
          settings && settings.promptTextMode
            ? String(settings.promptTextMode)
            : "none",
        );
      });
    });
  }

  async function applyPromptTextMode(mode) {
    const normalized =
      String(mode || "none").toLowerCase() === "full" ? "full" : "none";

    if (logger && typeof logger.setPromptTextMode === "function") {
      await logger.setPromptTextMode(normalized);
      return normalized;
    }

    return new Promise((resolve) => {
      chrome.storage.local.get([LOGGER_SETTINGS_KEY], (result) => {
        const settings =
          result && result[LOGGER_SETTINGS_KEY]
            ? result[LOGGER_SETTINGS_KEY]
            : {};
        settings.promptTextMode = normalized;
        chrome.storage.local.set({ [LOGGER_SETTINGS_KEY]: settings }, () => {
          resolve(normalized);
        });
      });
    });
  }

  function setupPromptTextLoggingToggle() {
    const toggle = document.getElementById("prompt-text-logging-toggle");
    if (!toggle) {
      return;
    }

    const syncFromSettings = async () => {
      try {
        const mode = await getCurrentPromptTextMode();
        const enabled = mode === "full";
        toggle.checked = enabled;
        setPromptTextLoggingStatus(enabled);
      } catch (_error) {
        toggle.checked = false;
        setPromptTextLoggingStatus(false);
      }
    };

    toggle.addEventListener("change", async () => {
      const nextMode = toggle.checked ? "full" : "none";
      try {
        const appliedMode = await applyPromptTextMode(nextMode);
        const enabled = appliedMode === "full";
        toggle.checked = enabled;
        setPromptTextLoggingStatus(enabled);

        logEvent("prompt_text_logging_toggled", {
          enabled,
          consentGiven: enabled,
          consentGivenLabel: enabled ? "yes" : "no",
          promptTextMode: appliedMode,
        });
      } catch (_error) {
        toggle.checked = false;
        setPromptTextLoggingStatus(false);
      }
    });

    syncFromSettings();
  }

  function setFollowUpButtonsVisibility(state) {
    const container = document.getElementById("followup-actions");
    const t1Button = document.getElementById("followup-t1-btn");
    const t5Button = document.getElementById("followup-t5-btn");

    if (!container || !t1Button || !t5Button) {
      return;
    }

    const participantUUID = normalizeUuid(state.participantUUID);
    const studyStartTs = new Date(state.studyStartTime || "").getTime();
    const onboardingCompleted = Boolean(state.onboardingCompleted);
    const t1DelayMs = parseDelayOverride(
      state.debugFollowUpDelayT1Ms,
      ONE_DAY_MS,
    );
    const t5DelayMs = parseDelayOverride(
      state.debugFollowUpDelayT5Ms,
      FIVE_DAYS_MS,
    );

    if (
      !participantUUID ||
      !onboardingCompleted ||
      !Number.isFinite(studyStartTs)
    ) {
      container.style.display = "none";
      return;
    }

    const now = Date.now();
    const t1Due = now >= studyStartTs + t1DelayMs;
    const t5Due = now >= studyStartTs + t5DelayMs;
    const t1Completed = Boolean(state.followUpT1CompletedAt);
    const t5Completed = Boolean(state.followUpT5CompletedAt);

    logEvent("followup_button_visibility_evaluated", {
      t1Due,
      t5Due,
      t1OpenedAt: state.followUpT1OpenedAt || null,
      t5OpenedAt: state.followUpT5OpenedAt || null,
      t1DelayMs,
      t5DelayMs,
    });

    container.style.display = t1Due || t5Due ? "block" : "none";

    setFollowUpButtonState(t1Button, {
      due: t1Due,
      opened: t1Completed,
      defaultLabel: "Tag-1 Fragebogen",
      completedLabel: "✓ Tag-1 erledigt",
    });

    setFollowUpButtonState(t5Button, {
      due: t5Due,
      opened: t5Completed,
      defaultLabel: "Abschlussfragebogen",
      completedLabel: "✓ Abschluss erledigt",
    });

    t1Button.onclick = t1Due
      ? () =>
          openFollowUpInTab("t1", participantUUID, () => {
            chrome.storage.local.set({
              followUpT1CompletedAt: new Date().toISOString(),
            });
            triggerMilestoneUploads("followup_t1_popup_click", participantUUID);
            setFollowUpButtonState(t1Button, {
              due: true,
              opened: true,
              defaultLabel: "Tag-1 Fragebogen",
              completedLabel: "✓ Tag-1 erledigt",
            });
          })
      : null;

    t5Button.onclick = t5Due
      ? () =>
          openFollowUpInTab("t5", participantUUID, () => {
            chrome.storage.local.set({
              followUpT5CompletedAt: new Date().toISOString(),
            });
            triggerMilestoneUploads("followup_t5_popup_click", participantUUID);
            setFollowUpButtonState(t5Button, {
              due: true,
              opened: true,
              defaultLabel: "Abschlussfragebogen",
              completedLabel: "✓ Abschluss erledigt",
            });
          })
      : null;
  }

  function setOnboardingVisibility(showOnboarding) {
    const onboarding = document.getElementById("onboarding-screen");
    const dashboard = document.getElementById("main-dashboard");
    if (onboarding) {
      onboarding.style.display = showOnboarding ? "block" : "none";
    }
    if (dashboard) {
      dashboard.style.display = showOnboarding ? "none" : "block";
    }
  }

  function showUuidError(message) {
    const errorNode = document.getElementById("uuid-error");
    const inputNode = document.getElementById("uuid-input");

    if (errorNode) {
      errorNode.textContent = message;
      errorNode.style.display = "block";
    }
    if (inputNode) {
      inputNode.style.borderColor = "#ef4444";
    }
  }

  function clearUuidError() {
    const errorNode = document.getElementById("uuid-error");
    const inputNode = document.getElementById("uuid-input");

    if (errorNode) {
      errorNode.style.display = "none";
    }
    if (inputNode) {
      inputNode.style.borderColor = "#d1d5db";
    }
  }

  function appendEventLog(logEntry, callback) {
    chrome.storage.local.get(["eventLog"], (result) => {
      const eventLog = Array.isArray(result.eventLog) ? result.eventLog : [];
      eventLog.push(logEntry);
      chrome.storage.local.set({ eventLog }, () => {
        if (typeof callback === "function") {
          callback();
        }
      });
    });
  }

  function isExtensionContextValid() {
    try {
      return !!(
        typeof chrome !== "undefined" &&
        chrome.runtime &&
        chrome.runtime.id
      );
    } catch (_error) {
      return false;
    }
  }

  function logEvent(eventType, data = {}, callback) {
    const logEntry = {
      eventType,
      timestamp: new Date().toISOString(),
      ...data,
    };

    if (logger && typeof logger.logEvent === "function") {
      logger.logEvent(eventType, data, { source: "popup" }).then(() => {
        if (typeof callback === "function") {
          callback();
        }
      });
      return;
    }

    if (!isExtensionContextValid()) {
      appendEventLog(logEntry, callback);
      return;
    }

    try {
      chrome.runtime.sendMessage(
        {
          action: "logStudyEvent",
          eventType,
          data,
        },
        () => {
          if (chrome.runtime.lastError) {
            appendEventLog(logEntry, callback);
            return;
          }

          if (typeof callback === "function") {
            callback();
          }
        },
      );
    } catch (_error) {
      appendEventLog(logEntry, callback);
    }
  }

  function setParticipantUuidLabel(uuid) {
    const badge = document.getElementById("displayParticipantUuid");
    if (badge) {
      badge.textContent = maskUuid(uuid);
    }
  }

  function renderDashboard(config, uuid, state = {}) {
    const stats = normalizeStats(config.stats);
    const modules = config.modules || {};
    const content = document.querySelector(".content");
    if (!content) {
      return;
    }

    setParticipantUuidLabel(uuid);
    setFollowUpButtonsVisibility({
      ...state,
      participantUUID: uuid,
    });
    renderGamificationPanel(content, stats, modules);
    updateStatsDom(stats, modules);
    renderNudgingPanel(content, stats, modules);
    renderCompletedTrees(content, stats, modules);
    renderAwardsPanel(content, stats, modules);
  }

  function saveParticipantUuid(uuid, callback) {
    if (
      onboardingApi &&
      typeof onboardingApi.processOnboarding === "function"
    ) {
      onboardingApi.processOnboarding(uuid).then((result) => {
        if (!result || !result.success) {
          if (typeof callback === "function") {
            callback(
              result && result.error
                ? result.error
                : "Onboarding konnte nicht gespeichert werden.",
              null,
            );
          }
          return;
        }

        logEvent(
          "onboarding_completed",
          {
            participantUUID: result.participantUUID,
            groupCode: result.groupCode,
            nudging: Boolean(result.modules && result.modules.nudging),
            gamification: Boolean(
              result.modules && result.modules.gamification,
            ),
          },
          () => {
            chrome.runtime.sendMessage({ action: "syncStudyReminders" }, () => {
              // Background service worker may be sleeping or unavailable; onboarding should still continue.
            });
            if (typeof callback === "function") {
              callback(null, result);
            }
          },
        );
      });
      return;
    }

    const normalized = normalizeUuid(uuid);
    const payload = {
      participantUUID: normalized,
      studyStartTime: new Date().toISOString(),
      onboardingCompleted: true,
    };

    chrome.storage.local.set(payload, () => {
      logEvent("onboarding_completed", { participantUUID: normalized }, () => {
        chrome.runtime.sendMessage({ action: "syncStudyReminders" }, () => {
          // Background service worker may be sleeping or unavailable; onboarding should still continue.
        });
        if (typeof callback === "function") {
          callback(null, {
            participantUUID: normalized,
            modules: null,
          });
        }
      });
    });
  }

  function attachOnboardingHandlers(onSuccess) {
    const inputNode = document.getElementById("uuid-input");
    const submitButton = document.getElementById("submit-uuid");

    if (!inputNode || !submitButton) {
      return;
    }

    inputNode.addEventListener("input", () => {
      const current = normalizeUuid(inputNode.value);
      if (!current || isValidUuid(current)) {
        clearUuidError();
      } else {
        showUuidError("Ungültige Teilnehmer-ID. Bitte Eingabe prüfen.");
      }
    });

    const submit = () => {
      const uuidInput = String(inputNode.value || "");
      logEvent("onboarding_uuid_submit_attempt", {
        hasInput: Boolean(uuidInput.trim()),
        inputLength: uuidInput.trim().length,
      });

      if (!isValidUuid(uuidInput)) {
        showUuidError("Ungültige Teilnehmer-ID. Bitte Eingabe prüfen.");
        logEvent("onboarding_uuid_submit_invalid", {
          inputLength: uuidInput.trim().length,
        });
        return;
      }

      clearUuidError();
      submitButton.disabled = true;
      submitButton.textContent = "Wird gespeichert...";

      saveParticipantUuid(uuidInput, (error, onboardingResult) => {
        if (error) {
          submitButton.disabled = false;
          submitButton.textContent = "Studie starten";
          showUuidError(String(error));
          logEvent("onboarding_uuid_submit_invalid", {
            reason: "process_onboarding_failed",
            message: String(error),
          });
          return;
        }

        submitButton.textContent = "Erfolgreich";
        logEvent("onboarding_uuid_submit_valid", {
          inputLength: uuidInput.trim().length,
          groupCode: onboardingResult?.groupCode || null,
        });
        if (typeof onSuccess === "function") {
          onSuccess(
            onboardingResult?.participantUUID || normalizeUuid(uuidInput),
            onboardingResult || null,
          );
        }
      });
    };

    submitButton.addEventListener("click", submit);
    inputNode.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        submit();
      }
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    const popupSessionId =
      logger && typeof logger.startSession === "function"
        ? logger.startSession("popup", {})
        : null;

    const closePopupSession = () => {
      if (popupSessionId && logger?.endSession) {
        logger.endSession(popupSessionId, {
          reason: "popup_closed",
        });
      }
    };

    window.addEventListener("pagehide", closePopupSession, { once: true });
    setupPromptTextLoggingToggle();
    setupPromptLoggingHelpTooltip();

    chrome.storage.local.get(
      [
        "config",
        "selectedTree",
        "participantUUID",
        "onboardingCompleted",
        "studyStartTime",
        "followUpT1OpenedAt",
        "followUpT5OpenedAt",
        "followUpT1CompletedAt",
        "followUpT5CompletedAt",
        "debugFollowUpDelayT1Ms",
        "debugFollowUpDelayT5Ms",
      ],
      (result) => {
        const config = result.config || {};
        const selectedTree = String(result.selectedTree || "").trim();
        if (selectedTree) {
          config.stats = {
            ...(config.stats || {}),
            currentTree: selectedTree,
          };
        }
        const participantUUID = normalizeUuid(result.participantUUID);
        const onboardingCompleted = Boolean(result.onboardingCompleted);
        initOptionalDebugUi();

        const state = {
          participantUUID,
          onboardingCompleted,
          studyStartTime: result.studyStartTime,
          followUpT1OpenedAt: result.followUpT1OpenedAt,
          followUpT5OpenedAt: result.followUpT5OpenedAt,
          followUpT1CompletedAt: result.followUpT1CompletedAt,
          followUpT5CompletedAt: result.followUpT5CompletedAt,
          debugFollowUpDelayT1Ms: result.debugFollowUpDelayT1Ms,
          debugFollowUpDelayT5Ms: result.debugFollowUpDelayT5Ms,
        };

        attachOnboardingHandlers((uuid, onboardingResult) => {
          setOnboardingVisibility(false);
          setParticipantUuidLabel(uuid);
          const mergedConfig = {
            ...config,
            modules:
              onboardingResult && onboardingResult.modules
                ? onboardingResult.modules
                : config.modules,
          };
          renderDashboard(mergedConfig, uuid, {
            ...state,
            participantUUID: uuid,
            onboardingCompleted: true,
            studyStartTime: new Date().toISOString(),
          });
          logEvent("dashboard_opened", { fromOnboarding: true });
        });

        if (!participantUUID || !onboardingCompleted) {
          setOnboardingVisibility(true);
          logEvent("onboarding_screen_viewed", {});
          return;
        }

        setOnboardingVisibility(false);
        renderDashboard(config, participantUUID, state);
        logEvent("dashboard_opened", { fromOnboarding: false });
      },
    );
  });

  if (typeof window !== "undefined") {
    window.GreenPromptPopup = {
      isValidUuid,
      normalizeUuid,
    };
  }
})();
