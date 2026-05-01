/**
 * GreenPrompt Content Script
 * Main controller for prompt optimization and UI injection
 *
 * PRIVACY GUARANTEE:
 * - NO fetch() calls
 * - NO XMLHttpRequest
 * - NO external API communication
 * - All processing happens locally in the browser
 * - Data stored only in chrome.storage.local
 */

(function () {
  "use strict";

  // Prevent multiple injections
  if (window.greenPromptInjected) return;
  window.greenPromptInjected = true;

  // === Inject CSS for length slider ===
  const style = document.createElement("style");
  style.textContent = `
 .length-slider {
  display: flex;               /* Flexbox für Buttons */
  justify-content: center;     /* Buttons horizontal zentrieren */
  align-items: center;         /* Vertikal zentrieren innerhalb der Box */
  width: fit-content;          /* Box nur so breit wie Inhalt */
  margin: 12px auto;           /* Box horizontal mittig */
  border: 1.3px solid #ccc;
  border-radius: 22px;
  overflow: hidden;
  background: white;
  
}
  /* Sad cursor for nudging mode */
.nudging .gp-btn-reject:hover {
  cursor: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32'%3E%3Ctext y='24' font-size='24'%3E😢%3C/text%3E%3C/svg%3E"), auto;
}

.nudging .gp-modal:has(.gp-btn-reject:hover) {
  filter: grayscale(100%) brightness(0.6);
  transition: filter 0.2s ease;
}

.length-slider .length-option {
  padding: 8px 14px;
  cursor: pointer;
  font-size: 13px;
  background: white;
  border-right: 1px solid #ccc;
  color: #333;
  user-select: none;
  transition: background 0.2s;
}

.length-slider .length-option:last-child {
  border-right: none;
}

.length-slider .length-option.active {
  background: #1a73e8;
  color: white;
  font-weight: 600;
}

.nudging .length-slider .length-option.active {
  background: #2fa866;
  color: white;
  font-weight: 600;
}

.gp-header {
  background-color: white;        /* weißer Hintergrund */
  display: flex;                  /* Flexbox für Header-Layout */
  justify-content: space-between; /* Logo rechts, Text links */
  align-items: center;            /* vertikal zentriert */
  padding: 10px 16px;             /* etwas Innenabstand */
}

.gp-header-title h2 {
  color: #333333;                /* dunkelgrau */
  font-size: 25px;
  margin: 0;
  
}

.gp-header-logo {
  height: 55px;                  /* Logo-Größe anpassen */
  width: auto;
}

.gp-close {
  color: #000;   /* schwarzes x zum schlißen */
}

.gp-btn-reject,
.gp-btn-edit,
.gp-btn-accept {
  background: #1a73e8;
  color: white;
  border: none;
  padding: 6px 14px;   /* nur hier definieren */
  font-size: 13px;     /* nur hier definieren */
  border-radius: 8px;  /* nur hier definieren */
  transition: background 0.2s; /* sanfte Hintergrund-Animation */
}

.gp-btn-reject:hover,
.gp-btn-edit:hover,
.gp-btn-accept:hover {
  background: #1558b0; /* nur Hintergrund ändern */
  color: white;        /* Textfarbe sicherheitshalber */
}

.nudging .gp-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
}


.nudging .gp-btn-edit {
  background: #d0d0d0; /* grau */
  color: #333;
}

.nudging .gp-btn-reject {
  background: transparent;   /* kein Hintergrund */
  border: none;              /* kein Rahmen */
  color: #333;               /* Textfarbe */
  padding: 0;                /* optional: keine extra Innenabstände */
  font-size: 13px;           /* gleiche Schriftgröße wie andere Buttons */
  cursor: pointer;           /* zeigt an, dass es klickbar ist */
}

.nudging .gp-btn-reject:hover {
  background: transparent;   /* bleibt ohne Kasten beim Hover */
  color: #000;               /* optional: Farbe beim Hover ändern */
}


.nudging .gp-btn-accept {
  background: #2fa866;
  color: white;
  border: none;
  padding: 4px 10px;   /* kleineres Innenmaß: oben/unten 4px, links/rechts 10px */
  font-size: 12px;     /* kleinere Schrift */
  border-radius: 6px;  /* etwas kleinere Abrundung */
  transition: background 0.2s;
}

.nudging .gp-btn-accept:hover {
  background: #238652;
}

.nudging .gp-btn-edit:hover {
  background: #bcbcbc;
  color: #333;
}

.gp-prompts-container {
  display: flex;
  gap: 16px;
  width: 100%;
  min-width: 0;
}

.gp-white-textbox {
  width: 100%;
  max-width: 100%;
  min-width: 0;
  overflow-x: hidden;
}

.gp-prompt-text,
.gp-diff-text,
.gp-diff-text span {
  max-width: 100%;
  min-width: 0;
  white-space: pre-wrap;
  word-break: break-word;
  overflow-wrap: anywhere;
}

.gp-prompt-box .gp-prompt-text,
.gp-prompt-box .gp-diff-text {
  overflow-x: hidden;
}

.gp-diff-added {
  background: rgba(47, 168, 102, 0.2);
  color: #166534;
  border-radius: 4px;
  padding: 0 2px;
}

.gp-diff-removed {
  background: rgba(239, 68, 68, 0.16);
  color: #991b1b;
  text-decoration: line-through;
  border-radius: 4px;
  padding: 0 2px;
}

.gp-modal.nudging.no-gamification .gp-prompt-box.original {
  flex: 35 1 0;
}

.gp-modal.nudging.no-gamification .gp-prompt-box.optimized {
  flex: 65 1 0;
  transform: none;
}

.gp-modal.nudging.no-gamification .gp-prompt-box.optimized .gp-white-textbox {
  min-height: 140px;
}

.gp-duplicate-warning {
  margin-top: 10px;
  padding: 10px;
  border-radius: 10px;
  background: #fff7e6;
  border: 1px solid #f3d08a;
  font-size: 12px;
  color: #6f4b00;
}

.gp-duplicate-warning strong {
  display: block;
  margin-bottom: 4px;
}

.gp-duplicate-actions {
  margin-top: 8px;
  display: flex;
  gap: 8px;
  align-items: center;
}

.gp-duplicate-btn {
  border: none;
  border-radius: 8px;
  padding: 6px 10px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  background: #e7b64f;
  color: #3d2a00;
}

.gp-duplicate-btn:hover {
  background: #dba53a;
}

.gp-duplicate-status {
  font-size: 12px;
  color: #4b6700;
}

.gp-prompt-box {
  flex: 1;
  min-width: 0;
}
.gp-body-layout {
  display: flex;
  flex-direction: row;
  gap: 16px;
  align-items: flex-start;
}

.gp-main-content {
  flex: 1;
}

.gp-right-panel {
  width: 220px;
  background: #f5f5f5;
  border-radius: 14px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  box-shadow: 0 2px 6px rgba(0,0,0,0.15);
}

.gp-right-stat {
  text-align: center;
}

.gp-right-value {
  font-size: 22px;
  font-weight: 700;
  color: #222;
}

.gp-right-label {
  font-size: 12px;
  color: #666;
}

.gp-right-screenshot img {
  width: 100%;
  border-radius: 12px;
  object-fit: cover;
}

.gp-length-title {
  margin: 0 0 6px 0;
  font-size: 13px;
  font-weight: 500;
  color: #333;
  text-align: center;
}

/* NEW Gamification Panel Design */
.gp-gamification-panel {
  background-color: white;
  border-radius: 12px;
  padding: 14px;
  margin-top: 0;          /* oben keinen Abstand mehr */
  width: 100%;            /* volle Breite der grauen Box */
  height: 100%;           /* volle Höhe */
  box-shadow: 0 2px 6px rgba(0,0,0,0.15);
  display: flex;
  flex-direction: column;
  gap: 14px;
  align-items: center;
  text-align: center;
  box-sizing: border-box; /* damit Padding innen bleibt */
}


.gp-level-section {
  text-align: center;
  margin-bottom: 6px;
}

.gp-level-value {
  font-size: 20px;
  font-weight: bold;
  color: #222; /* dunkelgrau */
}

.gp-level-subtitle {
  font-size: 9px;
  color: #666;
}

.gp-tree-avatar {
  width: 120px;
  height: 120px;
  border-radius: 50%;
  object-fit: cover;
  box-shadow: 0 2px 6px rgba(0,0,0,0.2);
}

.gp-score-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-top: 6px;
  width: 100%;
}

.gp-score-label {
  font-size: 9px;
  font-weight: 600;
  color: #666;
  margin-bottom: 6px;
}

.gp-progress-container {
  width: 80%;
  height: 8px;
  background-color: #e0e0e0;
  border-radius: 4px;
  overflow: hidden;
  margin-bottom: 10px;
}

.gp-progress-bar {
  height: 100%;
  background-color: #1a73e8;
  width: 20%;
  transition: width 0.5s ease-in-out;
  border-radius: 4px;
}

.nudging .gp-progress-bar {
  height: 100%;
  background-color: #2fa866;
  width: 20%;
  transition: width 0.5s ease-in-out;
  border-radius: 4px;
}

.gp-score-value {
  font-size: 15px;
  font-weight: bold;
  color: #000;
}


  
  `;

  document.head.appendChild(style);

  /**
   * ============================================
   * RESEARCH CONFIGURATION - EDIT THIS SECTION
   * ============================================
   *
   * For research purposes, set the features here before deploying.
   * Users cannot change these settings.
   *
   * Options:
   *   nudging: true/false - Highlights optimized prompt, makes accept button more prominent
   *   gamification: true/false - Shows level, tree health, gamification elements
   *   showDiff: true/false - Shows inline diff view (red strikethrough = removed, green = added)
   *
   * Example configurations:
   *   - Control group: { nudging: false, gamification: false }
   *   - Nudging only: { nudging: true, gamification: false }
   *   - Gamification only: { nudging: false, gamification: true }
   *   - Both features: { nudging: true, gamification: true }
   */
  const RESEARCH_CONFIG = {
    nudging: true,
    gamification: false,
    showDiff: true,
  };

  const onboardingApi = globalThis.GreenPromptOnboarding || null;

  /**
   * Configuration object - Controls enabled features
   * NOTE: modules are now controlled by RESEARCH_CONFIG above, not user settings
   */
  const CONFIG = {
    // Features are now controlled by RESEARCH_CONFIG, not user storage
    modules: RESEARCH_CONFIG,
    selectors: {
      // Updated ChatGPT selectors - multiple options for compatibility
      input: [
        'div[id="prompt-textarea"]',
        'textarea[id*="prompt"]',
        'textarea[placeholder*="Message"]',
        "textarea.m-0",
        "textarea[data-id]",
        'div[contenteditable="true"]',
        'div[contenteditable="true"][role="textbox"]',
      ],
      submit: [
        'button[data-testid="send-button"]',
        'button[aria-label="Send prompt"]',
        'button[aria-label="Send message"]',
      ],
      form: "form",
    },
    // Environmental impact estimates (based on research)
    impact: {
      energyPerWordUWhMin: 13,
      energyPerWordUWhMax: 16,
      co2GramsPerWh: 0.42,
      waterMlPerResponse: {
        full: 50,
        paragraph: 30,
        2: 20,
        1: 10,
      },
      baselineResponseWords: 120,
      responseWordsByLength: {
        full: 120,
        paragraph: 80,
        2: 24,
        1: 12,
      },
    },
  };

  const SCORE_PER_LEVEL = 20;
  const DOCUMENT_BASELINE_BY_LENGTH = {
    full: { score: 0, waterMl: 0, energyWh: 0 },
    paragraph: { score: 1, waterMl: 10, energyWh: 4.55 },
    2: { score: 2, waterMl: 20, energyWh: 6.11 },
    1: { score: 3, waterMl: 30, energyWh: 6.305 },
  };

  const TOKEN_SCORE_FACTOR = 0.05;
  const TOKEN_WATER_FACTOR_ML = 0.05;
  const TOKEN_ENERGY_FACTOR_WH = 0.0000013;
  const SCORE_MIN = 0;
  const SCORE_MAX = 5;
  const HIGH_COMPUTE_PENALTY = { score: -1, waterMl: -15, energyWh: -2 };
  const HIGH_COMPUTE_REPLACEMENT_BONUS = {
    score: 1,
    waterMl: 15,
    energyWh: 2,
  };

  const DOCUMENT_HIGH_COMPUTE_WORDS = [
    "analyse",
    "analyze",
    "justify",
    "explain",
    "recommend",
    "create",
    "report",
    "measure",
    "write",
    "develop",
    "design",
    "build",
    "identify",
  ];

  const AWARD_THRESHOLDS = [3, 5, 8, 10, 15, 20, 30, 40, 50, 75, 100];

  const WORDS_MD_LISTS =
    window.GP_WORDS_MD_LISTS && typeof window.GP_WORDS_MD_LISTS === "object"
      ? window.GP_WORDS_MD_LISTS
      : {};

  const normalizeTermList = (list) => {
    if (!Array.isArray(list)) {
      return [];
    }

    return Array.from(
      new Set(
        list
          .map((entry) =>
            String(entry || "")
              .trim()
              .toLowerCase(),
          )
          .filter(Boolean)
          .filter((entry) => entry !== "ich möchte" && entry !== "i want"),
      ),
    );
  };

  // Curated command replacements plus master-thesis coverage list (words.md).
  const HIGH_COMPUTE_TRIGGER_MAP = {
    analyze: "classify",
    analyse: "classify",
    explain: "summarize",
    elaborate: "summarize",
    "elaborate on": "summarize",
    detail: "summarize",
    interpret: "label",
    investigate: "inspect",
    evaluate: "rate",
    assess: "rate",
    compare: "list differences",
    contrast: "list differences",
    critique: "review",
    reason: "answer briefly",
    justify: "state reason",
    argue: "state stance",
    derive: "compute",
    calculate: "compute",
    synthesize: "combine",
    brainstorm: "list ideas",
    expand: "shorten",
    "deep dive": "quick overview",
    "walk through": "outline",
    "describe in detail": "describe briefly",
    "provide a comprehensive": "provide a short",
    comprehensive: "brief",
    extensive: "short",
    thorough: "brief",
    "step-by-step": "few steps",
    "multi-step": "single step",
    generate: "draft",
    create: "draft",
    write: "draft",
    draft: "outline",
    "summarize extensively": "summarize briefly",
    "expand on": "summarize",
    discuss: "state",
    examine: "check",
    diagnose: "identify",
    troubleshoot: "identify issue",
    predict: "estimate",
    forecast: "estimate",
    simulate: "approximate",
    model: "approximate",
    optimize: "improve",
    refactor: "simplify",
    "translate thoroughly": "translate briefly",
    teach: "explain briefly",
    mentor: "guide briefly",
    compose: "outline",
    erkläre: "kurz erklären",
    erläutere: "kurz erklären",
    analysiere: "kurz zusammenfassen",
    vergleiche: "kurz vergleichen",
    diskutiere: "kurz darstellen",
    interpretiere: "kurz einordnen",
    bewerte: "kurz bewerten",
    beurteile: "kurz bewerten",
    kritisiere: "kurz bewerten",
    simuliere: "abschätzen",
    kalkuliere: "berechne kurz",
    berechne: "berechne kurz",
    visualisiere: "liste kurz auf",
    untersuche: "prüfe kurz",
    entwickle: "skizziere kurz",
    formuliere: "kurz formulieren",
    identifiziere: "benenne kurz",
    dokumentiere: "kurz notieren",
    evaluiere: "kurz bewerten",
    prüfe: "prüfe kurz",
    überprüfe: "prüfe kurz",
  };

  const HIGH_COMPUTE_TERMS_FROM_STUDY = {
    de: normalizeTermList(
      WORDS_MD_LISTS.de_commands || [
        "erkläre",
        "erkläre schritt für schritt",
        "fasse zusammen",
        "beschreibe",
        "analysiere",
        "vergleiche",
        "diskutiere",
        "zeige",
        "definiere",
        "liste auf",
        "erstelle",
        "entwickle",
        "argumentiere",
        "interpretiere",
        "begründe",
        "wähle",
        "bewerte",
        "kritisiere",
        "beurteile",
        "skizziere",
        "demonstriere",
        "formuliere",
        "ordne",
        "plane",
        "entwickle eine strategie",
        "prüfe",
        "untersuche",
        "erläutere",
        "entscheide",
        "kalkuliere",
        "rechne vor",
        "leite ab",
        "identifiziere",
        "veranschauliche",
        "fasse die kernaussagen zusammen",
        "interpretiere ergebnisse",
        "erkläre ursache und wirkung",
        "entwickle eine hypothese",
        "formuliere eine fragestellung",
        "priorisiere",
        "simuliere",
        "analysiere daten",
        "dokumentiere",
        "evaluiere",
        "visualisiere daten",
        "berechne",
        "führe berechnungen durch",
        "prüfe hypothesen",
        "entwickle szenarien",
        "formuliere strategien",
      ],
    ),
    en: normalizeTermList(
      WORDS_MD_LISTS.en_commands || [
        "explain",
        "explain step by step",
        "summarize",
        "describe",
        "analyze",
        "compare",
        "discuss",
        "show",
        "define",
        "list",
        "create",
        "develop",
        "argue",
        "interpret",
        "justify",
        "choose",
        "evaluate",
        "critique",
        "assess",
        "outline",
        "plan",
        "develop a strategy",
        "check",
        "examine",
        "elaborate",
        "decide",
        "calculate",
        "illustrate",
        "derive",
        "identify",
        "support with evidence",
        "formulate recommendations",
        "validate",
        "verify",
        "simulate",
        "analyze data",
        "draw conclusions",
        "document",
        "determine risks",
        "visualize data",
        "perform calculations",
        "test hypotheses",
        "develop scenarios",
        "analyze options",
        "develop process models",
        "develop use cases",
        "assess strategies",
        "visualize processes",
        "analyze problems",
        "formulate measures",
      ],
    ),
  };

  const STUDY_POLITE_SMALLTALK_TERMS = normalizeTermList([
    ...(WORDS_MD_LISTS.de_polite_smalltalk || []),
    ...(WORDS_MD_LISTS.en_polite_smalltalk || []),
  ]);

  const STUDY_FILLER_TERMS = normalizeTermList([
    ...(WORDS_MD_LISTS.de_fillers || []),
    ...(WORDS_MD_LISTS.en_fillers || []),
  ]);

  const HIGH_COMPUTE_STUDY_DEFAULT_REPLACEMENT = {
    de: "kurz zusammenfassen",
    en: "summarize briefly",
  };

  Object.entries(HIGH_COMPUTE_TERMS_FROM_STUDY).forEach(([language, terms]) => {
    const fallback = HIGH_COMPUTE_STUDY_DEFAULT_REPLACEMENT[language];
    terms.forEach((term) => {
      const normalized = String(term || "")
        .trim()
        .toLowerCase();
      if (
        !normalized ||
        normalized === "ich möchte" ||
        normalized === "i want"
      ) {
        return;
      }

      if (!HIGH_COMPUTE_TRIGGER_MAP[normalized]) {
        HIGH_COMPUTE_TRIGGER_MAP[normalized] = fallback;
      }
    });
  });

  /**
   * Main Controller Class
   */
  class GreenPromptController {
    constructor() {
      this.config = CONFIG;
      this.stats = {
        totalPrompts: 0,
        optimizedPrompts: 0,
        co2Saved: 0,
        waterSaved: 0,
        level: 1,
        treeHealth: 100,
        currentTree: "apple",
        completedTrees: [],
        awards: [],
        score: 0,
      };
      this.currentPrompt = null;
      this.isProcessing = false;
      this.textarea = null;
      this.submitButton = null;
      this.domObserver = null;
      this.delegatedListenerAttached = false;
      this.cleanupRegistered = false;
      this.debugMessageListenerRegistered = false;
      this.selectedTree = "apple";
      this.pendingEditedPromptFlow = null;
      this.logger = globalThis.GreenPromptLogger || null;

      this.init();
    }

    /**
     * Initialize the controller
     */
    async init() {
      console.log("[GreenPrompt] Starting initialization...");

      if (this.logger && typeof this.logger.initLogger === "function") {
        this.logger.initLogger({ source: "content" });
      }

      // Load saved configuration and stats
      await this.loadConfig();
      this.registerDebugMessageHandlers();
      this.preloadNlpInBackground();
      this.registerLifecycleCleanup();

      // Wait for page to be ready
      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", () =>
          this.attachToForm(),
        );
      } else {
        this.attachToForm();
      }

      console.log("[GreenPrompt] Initialized successfully");
    }

    isExtensionContextValid() {
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

    isContextInvalidatedError(errorLike) {
      const message = String(
        (errorLike && errorLike.message) || errorLike || "",
      );
      return /extension context invalidated/i.test(message);
    }

    safeRuntimeGetUrl(assetPath) {
      if (!this.isExtensionContextValid() || !chrome.runtime?.getURL) {
        return "";
      }

      try {
        return chrome.runtime.getURL(assetPath);
      } catch (error) {
        if (!this.isContextInvalidatedError(error)) {
          console.warn("[GreenPrompt] Failed to resolve asset URL:", error);
        }
        return "";
      }
    }

    logStudyEvent(eventType, data = {}) {
      if (!this.isExtensionContextValid()) {
        return;
      }

      if (this.logger && typeof this.logger.logEvent === "function") {
        this.logger.logEvent(eventType, data, { source: "content" });
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
            if (
              chrome.runtime.lastError &&
              !this.isContextInvalidatedError(chrome.runtime.lastError)
            ) {
              console.warn(
                "[GreenPrompt] Failed to log study event:",
                chrome.runtime.lastError,
              );
            }
          },
        );
      } catch (error) {
        if (!this.isContextInvalidatedError(error)) {
          console.warn("[GreenPrompt] Event logging failed:", error);
        }
      }
    }

    preloadNlpInBackground() {
      if (!this.isExtensionContextValid()) {
        return;
      }

      try {
        chrome.runtime.sendMessage({ action: "warmupNlp" }, (response) => {
          if (chrome.runtime.lastError) {
            return;
          }
          console.log("[GreenPrompt] NLP warmup status:", response);
        });
      } catch (error) {
        if (!this.isContextInvalidatedError(error)) {
          console.warn("[GreenPrompt] NLP warmup failed:", error);
        }
      }
    }

    registerLifecycleCleanup() {
      if (this.cleanupRegistered) {
        return;
      }

      // Disconnect observer on page lifecycle end to avoid stale callbacks.
      window.addEventListener("pagehide", () => {
        if (this.domObserver) {
          this.domObserver.disconnect();
          this.domObserver = null;
        }
      });

      this.cleanupRegistered = true;
    }

    optimizePromptAsync(text, options = {}) {
      return new Promise((resolve) => {
        if (!this.isExtensionContextValid()) {
          resolve(this.optimizePromptLocalFallback(text));
          return;
        }

        try {
          chrome.runtime.sendMessage(
            {
              action: "optimizePrompt",
              text,
              options,
            },
            (response) => {
              if (chrome.runtime.lastError) {
                if (!this.isContextInvalidatedError(chrome.runtime.lastError)) {
                  console.warn(
                    "[GreenPrompt] Background NLP unavailable, using fallback:",
                    chrome.runtime.lastError,
                  );
                }
                resolve(this.optimizePromptLocalFallback(text));
                return;
              }

              if (!response || !response.success || !response.result) {
                resolve(this.optimizePromptLocalFallback(text));
                return;
              }

              resolve(response.result);
            },
          );
        } catch (error) {
          if (!this.isContextInvalidatedError(error)) {
            console.warn(
              "[GreenPrompt] Background NLP request failed, using fallback:",
              error,
            );
          }
          resolve(this.optimizePromptLocalFallback(text));
        }
      });
    }

    /**
     * Load configuration from storage
     * NOTE: For research, we only load stats, not module settings
     */

    async loadConfig() {
      return new Promise((resolve) => {
        chrome.storage.local.get(
          ["config", "participantUUID", "onboardingCompleted", "selectedTree"],
          (result) => {
            // Stats laden
            if (result.config?.stats) {
              this.stats = result.config.stats;
            }
            this.normalizeStats();

            const selectedTree = this.normalizeTreeKey(
              result.selectedTree || this.stats.currentTree,
            );
            this.selectedTree = selectedTree;
            this.stats.currentTree = selectedTree;

            const fallbackModules = {
              nudging: Boolean(RESEARCH_CONFIG.nudging),
              gamification: Boolean(RESEARCH_CONFIG.gamification),
              showDiff: RESEARCH_CONFIG.showDiff !== false,
            };

            const storedModules =
              result &&
              result.config &&
              result.config.modules &&
              typeof result.config.modules === "object"
                ? result.config.modules
                : null;

            let modules = storedModules
              ? {
                  nudging: Boolean(storedModules.nudging),
                  gamification: Boolean(storedModules.gamification),
                  showDiff:
                    storedModules.showDiff !== undefined
                      ? storedModules.showDiff !== false
                      : RESEARCH_CONFIG.showDiff !== false,
                }
              : fallbackModules;

            if (
              onboardingApi &&
              typeof onboardingApi.resolveModulesFromUuid === "function" &&
              result.onboardingCompleted &&
              result.participantUUID
            ) {
              const onboardingModules = onboardingApi.resolveModulesFromUuid(
                result.participantUUID,
                modules,
              );

              modules = {
                nudging: Boolean(onboardingModules.nudging),
                gamification: Boolean(onboardingModules.gamification),
                showDiff:
                  onboardingModules.showDiff !== undefined
                    ? onboardingModules.showDiff !== false
                    : RESEARCH_CONFIG.showDiff !== false,
              };
            }

            this.config.modules = modules;

            // modules auch speichern
            chrome.storage.local.set(
              {
                selectedTree,
                config: {
                  stats: this.stats,
                  modules: modules,
                },
              },
              resolve,
            );
          },
        );
      });
    }

    /**
     * Save statistics to storage
     */
    async saveStats() {
      return new Promise((resolve) => {
        chrome.storage.local.get(["config", "selectedTree"], (result) => {
          const config = result.config || {};
          const canonicalTree = this.normalizeTreeKey(
            result.selectedTree || this.selectedTree || this.stats.currentTree,
          );
          this.selectedTree = canonicalTree;
          this.stats.currentTree = canonicalTree;
          config.stats = this.stats;
          chrome.storage.local.set(
            { config, selectedTree: canonicalTree },
            resolve,
          );
        });
      });
    }

    normalizeTreeKey(treeValue) {
      const value = String(treeValue || "")
        .trim()
        .toLowerCase();

      if (value === "mable") {
        return "maple";
      }

      if (["apple", "olive", "maple", "fir"].includes(value)) {
        return value;
      }

      return "apple";
    }

    normalizeStats() {
      const storedWh = Number(this.stats.energySavedWh);
      const storedUWh = Number(this.stats.energySavedUWh);
      const canonicalEnergyWh =
        Number.isFinite(storedWh) && storedWh > 0
          ? storedWh
          : Number.isFinite(storedUWh) && storedUWh > 0
            ? storedUWh / 1000000
            : 0;

      this.stats = {
        totalPrompts: Number(this.stats.totalPrompts) || 0,
        optimizedPrompts: Number(this.stats.optimizedPrompts) || 0,
        co2Saved: Number(this.stats.co2Saved) || 0,
        waterSaved: Number(this.stats.waterSaved) || 0,
        energySavedWh: this.roundTo(canonicalEnergyWh, 6),
        energySavedUWh: Math.round(canonicalEnergyWh * 1000000),
        wordsSaved: Number(this.stats.wordsSaved) || 0,
        level: Number(this.stats.level) || 1,
        treeHealth: Number(this.stats.treeHealth) || 100,
        currentTree: this.normalizeTreeKey(this.stats.currentTree),
        completedTrees: Array.isArray(this.stats.completedTrees)
          ? this.stats.completedTrees
          : [],
        awards: Array.isArray(this.stats.awards) ? this.stats.awards : [],
        score: Number(this.stats.score) || 0,
      };
    }

    getScoreForLength(lengthOption) {
      const baseline =
        DOCUMENT_BASELINE_BY_LENGTH[lengthOption] ||
        DOCUMENT_BASELINE_BY_LENGTH.full;
      return baseline.score;
    }

    computeLevelForScore(score) {
      const normalizedScore = Math.max(0, Number(score) || 0);
      return Math.max(1, Math.floor(normalizedScore / SCORE_PER_LEVEL) + 1);
    }

    estimateWords(text) {
      return String(text || "")
        .trim()
        .split(/\s+/)
        .filter(Boolean).length;
    }

    formatCo2(co2Grams) {
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

    formatWaterMl(waterMl) {
      const value = Math.max(0, Number(waterMl) || 0);
      if (Number.isInteger(value)) {
        return `${value}`;
      }
      return value
        .toFixed(2)
        .replace(/\.00$/, "")
        .replace(/(\.\d)0$/, "$1");
    }

    getHighComputeRegexes() {
      return DOCUMENT_HIGH_COMPUTE_WORDS.map(
        (word) => new RegExp(`\\b${this.escapeRegex(word)}\\b`, "i"),
      );
    }

    containsHighComputeWord(text) {
      const source = String(text || "").toLowerCase();
      return this.getHighComputeRegexes().some((regex) => regex.test(source));
    }

    hasHighComputeReplacement(originalPrompt, optimizedPrompt) {
      const original = String(originalPrompt || "").toLowerCase();
      const optimized = String(optimizedPrompt || "").toLowerCase();

      return DOCUMENT_HIGH_COMPUTE_WORDS.some((word) => {
        const regex = new RegExp(`\\b${this.escapeRegex(word)}\\b`, "i");
        return regex.test(original) && !regex.test(optimized);
      });
    }

    roundTo(value, decimals = 3) {
      const factor = 10 ** decimals;
      return Math.round((Number(value) || 0) * factor) / factor;
    }

    calculatePromptImpact(originalPrompt, optimizedPrompt, lengthOption) {
      const originalText = String(originalPrompt || "").trim();
      const optimizedText = String(optimizedPrompt || "").trim();

      if (!originalText || originalText === optimizedText) {
        return {
          scorePoints: 0,
          wordsSaved: 0,
          tokenSaved: 0,
          energySavedUWh: 0,
          energySavedWh: 0,
          co2Saved: 0,
          waterSaved: 0,
          highComputePenaltyApplied: false,
          highComputeReplacementBonusApplied: false,
        };
      }

      const baseline =
        DOCUMENT_BASELINE_BY_LENGTH[lengthOption] ||
        DOCUMENT_BASELINE_BY_LENGTH.full;

      const tokenSaved = Math.max(
        0,
        this.estimateTokens(originalText) - this.estimateTokens(optimizedText),
      );

      let scoreRaw = baseline.score + tokenSaved * TOKEN_SCORE_FACTOR;
      let waterMl = baseline.waterMl + tokenSaved * TOKEN_WATER_FACTOR_ML;
      let energyWh = baseline.energyWh + tokenSaved * TOKEN_ENERGY_FACTOR_WH;

      const highComputePenaltyApplied =
        this.containsHighComputeWord(optimizedText);
      if (highComputePenaltyApplied) {
        scoreRaw += HIGH_COMPUTE_PENALTY.score;
        waterMl += HIGH_COMPUTE_PENALTY.waterMl;
        energyWh += HIGH_COMPUTE_PENALTY.energyWh;
      }

      const highComputeReplacementBonusApplied = this.hasHighComputeReplacement(
        originalText,
        optimizedText,
      );
      if (highComputeReplacementBonusApplied) {
        scoreRaw += HIGH_COMPUTE_REPLACEMENT_BONUS.score;
        waterMl += HIGH_COMPUTE_REPLACEMENT_BONUS.waterMl;
        energyWh += HIGH_COMPUTE_REPLACEMENT_BONUS.energyWh;
      }

      const scorePoints = Math.max(
        SCORE_MIN,
        Math.min(SCORE_MAX, Math.ceil(scoreRaw)),
      );

      const normalizedWaterMl = Math.max(0, this.roundTo(waterMl, 2));
      const normalizedEnergyWh = Math.max(0, this.roundTo(energyWh, 6));
      const energySavedUWh = Math.max(
        0,
        this.roundTo(normalizedEnergyWh * 1000000, 0),
      );
      const co2Saved = Math.max(
        0,
        this.roundTo(normalizedEnergyWh * this.config.impact.co2GramsPerWh, 6),
      );

      return {
        scorePoints,
        wordsSaved: tokenSaved,
        tokenSaved,
        energySavedUWh,
        energySavedWh: normalizedEnergyWh,
        co2Saved,
        waterSaved: normalizedWaterMl,
        highComputePenaltyApplied,
        highComputeReplacementBonusApplied,
      };
    }

    awardFromMilestone(milestone) {
      return {
        id: `award-${milestone}`,
        milestone,
        label: `${milestone} optimized prompts`,
        icon: "assets/rewards/reward10.webp",
      };
    }

    maybeGrantAwards() {
      if (!Array.isArray(this.stats.awards)) {
        this.stats.awards = [];
      }

      const existingIds = new Set(
        this.stats.awards
          .map((entry) =>
            typeof entry === "string" ? entry : entry && entry.id,
          )
          .filter(Boolean),
      );

      AWARD_THRESHOLDS.forEach((milestone) => {
        if (this.stats.optimizedPrompts >= milestone) {
          const award = this.awardFromMilestone(milestone);
          if (!existingIds.has(award.id)) {
            this.stats.awards.push(award);
            existingIds.add(award.id);
          }
        }
      });
    }

    /**
     * Find element using multiple selectors
     */
    findElement(selectors) {
      if (typeof selectors === "string") {
        return document.querySelector(selectors);
      }

      for (const selector of selectors) {
        const element = document.querySelector(selector);
        if (element) {
          console.log("[GreenPrompt] Found element with selector:", selector);
          return element;
        }
      }
      return null;
    }

    getPromptValue(sourceElement = this.textarea) {
      if (!sourceElement) {
        return "";
      }

      return (
        sourceElement.value ||
        sourceElement.innerText ||
        sourceElement.textContent ||
        ""
      );
    }

    interceptPromptSubmission(event, promptValue, sourceLabel) {
      const modalOverlayOpen = Boolean(document.querySelector(".gp-overlay"));
      if (modalOverlayOpen) {
        if (event) {
          event.preventDefault();
          event.stopPropagation();
          if (typeof event.stopImmediatePropagation === "function") {
            event.stopImmediatePropagation();
          }
        }
        return false;
      }

      if (this.isProcessing) {
        return false;
      }

      const value = String(promptValue || "").trim();
      if (!value) {
        return false;
      }

      console.log(`[GreenPrompt] ${sourceLabel} interception`);
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      this.handleSubmit(value, sourceLabel);
      return true;
    }

    isSendButtonTarget(element) {
      if (!element) {
        return false;
      }

      const selectors = Array.isArray(this.config.selectors.submit)
        ? this.config.selectors.submit
        : [this.config.selectors.submit];

      for (const selector of selectors) {
        // Check target and a few ancestors because SVG/icon clicks bubble from child nodes.
        let node = element;
        for (let i = 0; i < 5 && node; i++) {
          if (node.matches && node.matches(selector)) {
            return true;
          }
          node = node.parentElement;
        }
      }

      return false;
    }

    /**
     * Attach event listeners to ChatGPT form
     */
    attachToForm() {
      console.log("[GreenPrompt] Attempting to attach to form...");

      if (this.domObserver) {
        this.domObserver.disconnect();
      }

      // Use MutationObserver to handle dynamic form loading
      this.domObserver = new MutationObserver(() => {
        // Single re-scan keeps textarea/button/form wiring in one place.
        this.findAndAttach();
      });

      this.domObserver.observe(document.body, {
        childList: true,
        subtree: true,
      });

      // Try immediate attachment
      this.findAndAttach();

      // ALSO: Add a document-level delegated listener as a safety net.
      // This catches clicks on dynamically created buttons even if
      // the direct listener missed them (e.g., button was recreated).
      this.attachDelegatedClickListener();
    }

    /**
     * Document-level delegated click listener for the send button.
     * Works even when ChatGPT recreates the button in the DOM.
     */
    attachDelegatedClickListener() {
      if (this.delegatedListenerAttached) {
        return;
      }

      const handler = (e) => {
        if (!this.isSendButtonTarget(e.target)) {
          return;
        }

        this.interceptPromptSubmission(
          e,
          this.getPromptValue(),
          "Delegated send-button",
        );
      };

      // Capture phase — runs before React's handlers
      document.addEventListener("click", handler, {
        capture: true,
        passive: false,
      });

      this.delegatedListenerAttached = true;
      console.log("[GreenPrompt] Delegated click listener attached");
    }

    /**
     * Find and attach to textarea and submit button
     */
    findAndAttach() {
      const textarea = this.findElement(this.config.selectors.input);
      const submitButton = this.findElement(this.config.selectors.submit);

      if (textarea && !textarea.dataset.gpAttached) {
        console.log("[GreenPrompt] Found textarea, attaching listeners...");
        this.textarea = textarea;
        this.attachTextareaListeners(textarea);
        textarea.dataset.gpAttached = "true";
      }

      if (submitButton && !submitButton.dataset.gpAttached) {
        console.log(
          "[GreenPrompt] Found submit button, attaching listeners...",
        );
        this.submitButton = submitButton;
        this.attachSubmitListener(submitButton);
        submitButton.dataset.gpAttached = "true";
      }
    }

    /**
     * Attach listeners to textarea
     */
    attachTextareaListeners(textarea) {
      const keydownHandler = (e) => {
        console.log(
          "[GreenPrompt] Keydown event detected:",
          e.key,
          "Shift:",
          e.shiftKey,
        );
        if (e.key === "Enter" && !e.shiftKey) {
          const value = this.getPromptValue(textarea);
          this.interceptPromptSubmission(e, value, "Enter key");
        }
      };

      textarea.addEventListener("keydown", keydownHandler, {
        capture: true,
        passive: false,
      });

      console.log("[GreenPrompt] Textarea listeners attached");
    }

    /**
     * Attach listener to submit button
     */
    attachSubmitListener(button) {
      const clickHandler = (e) => {
        console.log("[GreenPrompt] Submit button click detected");

        const value = this.getPromptValue();
        console.log("[GreenPrompt] Submit button value:", value);
        this.interceptPromptSubmission(e, value, "Submit button");
      };

      button.addEventListener("click", clickHandler, {
        capture: true,
        passive: false,
      });

      console.log("[GreenPrompt] Submit button listener attached");
    }

    /**
     * Handle prompt submission
     */
    async handleSubmit(promptText, sourceLabel = "unknown") {
      if (!promptText || !promptText.trim()) return;

      console.log("[GreenPrompt] Processing prompt:", promptText);

      this.currentPrompt = promptText;
      this.stats.totalPrompts++;

      this.logStudyEvent("prompt_intercepted", {
        source: sourceLabel,
        promptLength: promptText.length,
      });

      if (this.logger && typeof this.logger.incrementCounter === "function") {
        this.logger.incrementCounter("prompts_intercepted_total", 1);
      }

      const isResumedFromEdit =
        this.pendingEditedPromptFlow &&
        this.pendingEditedPromptFlow.promptSessionId &&
        this.logger &&
        typeof this.logger.updatePromptFlow === "function";

      const promptSessionId = isResumedFromEdit
        ? this.pendingEditedPromptFlow.promptSessionId
        : this.logger && typeof this.logger.startPromptFlow === "function"
          ? this.logger.startPromptFlow({
              source: sourceLabel,
              originalPrompt: promptText,
              nudging: this.config.modules.nudging,
              gamification: this.config.modules.gamification,
              showDiff: this.config.modules.showDiff,
              levelAtPrompt: this.stats.level,
              scoreBefore: this.stats.score,
              chatPlatform: window.location.hostname || "unknown",
              pagePath: window.location.pathname || "/",
            })
          : null;

      if (
        isResumedFromEdit &&
        promptSessionId &&
        this.logger?.updatePromptFlow
      ) {
        this.logger.updatePromptFlow(promptSessionId, {
          source: sourceLabel,
          editedPromptSubmitted: promptText,
          optimizationStep: {
            stepType: "edit_submitted",
            optimizedPrompt: promptText,
            optimizedWordCount: this.estimateWords(promptText || ""),
            optimizedTokenEstimate: this.estimateTokens(promptText || ""),
            meta: {
              resumedFromEdit: true,
            },
          },
        });

        this.logStudyEvent("prompt_flow_resumed_after_edit", {
          source: sourceLabel,
          promptSessionId,
          promptLength: promptText.length,
        });

        this.pendingEditedPromptFlow = null;
      }

      // Optimize asynchronously in worker to avoid main-thread blocking.
      const optimized = await this.optimizePromptAsync(promptText);

      console.log("[GreenPrompt] Optimized result:", optimized);

      if (promptSessionId && this.logger?.updatePromptFlow) {
        this.logger.updatePromptFlow(promptSessionId, {
          optimizedPrompt: optimized.text,
          optimizedWordCount: this.estimateWords(optimized.text || ""),
          optimizedTokenEstimate: this.estimateTokens(optimized.text || ""),
          optimizationStep: {
            stepType: isResumedFromEdit
              ? "post_edit_optimization"
              : "initial_optimization",
            optimizedPrompt: optimized.text,
            optimizedWordCount: this.estimateWords(optimized.text || ""),
            optimizedTokenEstimate: this.estimateTokens(optimized.text || ""),
            meta: {
              sourceLabel,
            },
          },
        });
      }

      // Show UI
      this.showOptimizationUI(promptText, optimized, promptSessionId);
    }

    /**
     * Core Optimization Algorithm - CONTEXT-AWARE NLP
     * Removes filler words and politeness ONLY when they are not contextually important
     * Processes prompt locally without external calls
     */
    optimizePrompt(text) {
      let optimized = text.trim();
      let removedWords = [];
      let replacedWords = [];

      console.log(
        "[GreenPrompt] Starting context-aware optimization of:",
        optimized,
      );

      // Step 1: Protect quoted content (anything in quotes should never be modified)
      const quotedSections = [];
      optimized = optimized.replace(/"([^"]*)"/g, (match, content) => {
        quotedSections.push(match); // Keep the quotes too
        return `__QUOTED_${quotedSections.length - 1}__`;
      });
      optimized = optimized.replace(/'([^']*)'/g, (match, content) => {
        quotedSections.push(match);
        return `__QUOTED_${quotedSections.length - 1}__`;
      });

      // Step 2: Detect context-important phrases that should NOT be removed
      // These are phrases where politeness words are part of the content request
      const contextPatterns = [
        // "write me a thank you letter" - "thank you" is content
        /\b(write|create|compose|draft|make|generate|send)\b.*?\b(thank you|thanks|please|hello|hi|goodbye)\b/i,
        // "how to say thank you" - asking about the phrase
        /\b(how to|ways to|say|express)\b.*?\b(thank you|thanks|please|hello)\b/i,
        // "thank you letter/card/note/email" - compound noun
        /\b(thank you|thanks)\s+(letter|card|note|email|message|speech|gift)\b/i,
        // "please and thank you" as a phrase topic
        /\b(please and thank you|saying please|saying thanks)\b/i,
        // "what does please mean" - asking about the word
        /\b(what|meaning|definition|translate).*?\b(please|thank you|thanks|hello)\b/i,
        // "polite/politeness/manners" context
        /\b(polite|politeness|manners|etiquette|courtesy)\b/i,
      ];

      const isContextRelevant = (phrase) => {
        const lowerText = optimized.toLowerCase();
        return contextPatterns.some(
          (pattern) =>
            pattern.test(lowerText) && lowerText.includes(phrase.toLowerCase()),
        );
      };

      // Step 3: Replace high-compute trigger words with lean alternatives
      const highComputeEntries = Object.entries(HIGH_COMPUTE_TRIGGER_MAP).sort(
        (a, b) => b[0].length - a[0].length,
      );

      highComputeEntries.forEach(([from, to]) => {
        const pattern = new RegExp(`\\b${this.escapeRegex(from)}\\b`, "gi");
        if (pattern.test(optimized)) {
          replacedWords.push({ from, to });
          optimized = optimized.replace(pattern, to);
        }
      });

      // Step 4: Define removable phrases with context awareness
      // Only remove at START of sentence or as standalone filler
      const standaloneGreetings = [
        // English greetings
        { pattern: /^(hello|hi|hey)[,.\s!]*/i, name: "greeting" },
        {
          pattern:
            /^(good morning|good afternoon|good evening|good night)[,.\s!]*/i,
          name: "greeting",
        },
        {
          pattern: /^(top of the morning)[,.\s!]*/i,
          name: "greeting",
        },
        {
          pattern: /^(hope you'?re? (doing )?well)[,.\s!]*/i,
          name: "greeting",
        },
        { pattern: /^(how are you( today)?)[,.\s?!]*/i, name: "greeting" },
        // German greetings
        { pattern: /^(hallo|hi|hej)[,.\s!]*/i, name: "greeting" },
        {
          pattern:
            /^(guten morgen|guten tag|guten abend|guten nachmittag|gute nacht)[,.\s!]*/i,
          name: "greeting",
        },
        {
          pattern: /^(einen schönen morgen)[,.\s!]*/i,
          name: "greeting",
        },
        {
          pattern: /^(servus|grüß gott|grüezi|moin( moin)?)[,.\s!]*/i,
          name: "greeting",
        },
        // Formal address greetings
        {
          pattern:
            /^(sehr geehrte(r|s)? (damen und herren|herr|frau)\s*\w*)[,.\s!]*/i,
          name: "greeting",
        },
        { pattern: /^(liebes? \w+)[,.\s!]*/i, name: "greeting" },
      ];

      // Remove standalone greetings at the start
      standaloneGreetings.forEach(({ pattern, name }) => {
        const match = optimized.match(pattern);
        if (match && !isContextRelevant(match[0])) {
          removedWords.push(match[0].trim());
          optimized = optimized.replace(pattern, "");
        }
      });

      // Step 5: Remove politeness words ONLY when they are standalone/filler
      // "Please explain" -> "Explain" (please is filler)
      // "Write me a please letter" -> keep (nonsensical to remove)
      // "Write me a thank you letter" -> keep (thank you is content)
      //
      // NOTE: This step runs BEFORE filler removal so that compound phrases
      // like "thank you very much" are matched before "very" gets stripped.

      const politeFillers = [
        // === English politeness ===

        // "please" at start of request (with space or comma)
        { pattern: /^please[,\s]+/i, word: "please" },
        // "please" before a verb (filler position)
        {
          pattern:
            /,?\s*please\s+(help|explain|tell|show|write|create|give|make|find|do)\b/i,
          word: "please",
          replaceWith: " $1",
        },
        // "could you please" / "can you please"
        {
          pattern: /\b(could|can|would|will) you (please\s+)?/i,
          word: "could you",
          replaceWith: "",
        },
        // "kindly" as filler
        { pattern: /\bkindly\s+/i, word: "kindly" },
        // Trailing "please" at end
        { pattern: /[,\s]+please[.!?]?\s*$/i, word: "please" },

        // --- Apologies (sorry) ---
        {
          pattern: /^sorry to bother you[,.]?\s*(but\s+)?/i,
          word: "sorry to bother you",
        },
        {
          pattern: /sorry for (asking|the trouble|bothering)[.!]?\s*$/i,
          word: "sorry",
        },
        { pattern: /^sorry[,.]?\s+/i, word: "sorry" },
        {
          pattern:
            /\bi don'?t mean to (take up your time|bother you|trouble you)[,.]?\s*(but\s+)?/i,
          word: "i don't mean to bother",
        },

        // --- Greetings not caught in Step 3 ---
        { pattern: /^dear\s+\w+[,.]?\s*/i, word: "dear" },
        {
          pattern:
            /^(i hope (this message finds you well|you'?re? (doing )?well))[,.]?\s*/i,
          word: "hope you're well",
        },

        // --- Trailing closings ---
        {
          pattern:
            /[,.\s]*(best regards|kind regards|regards|with regards)[.!]?\s*$/i,
          word: "best regards",
        },
        {
          pattern: /[,.\s]*(have a (great|nice|good|wonderful) day)[.!]?\s*$/i,
          word: "have a nice day",
        },
        {
          pattern:
            /[,.\s]*(you'?re (awesome|the best|amazing|great))[.!]?\s*$/i,
          word: "you're awesome",
        },
        {
          pattern: /[,.\s]*(much appreciated)[.!]?\s*$/i,
          word: "much appreciated",
        },

        // --- Thank-you phrases (longest first to avoid partial matches) ---
        {
          pattern:
            /[,.\s]*(thank you so much in advance|thanks so much in advance)[.!]?\s*$/i,
          word: "thanks so much in advance",
        },
        {
          pattern: /[,.\s]*(thank you in advance|thanks in advance)[.!]?\s*$/i,
          word: "thanks in advance",
        },
        {
          pattern: /[,.\s]+(thank you very much|thanks very much)[.!]?\s*$/i,
          word: "thank you very much",
        },
        {
          pattern: /[,.\s]+(thank you so much|thanks so much)[.!]?\s*$/i,
          word: "thanks so much",
        },
        {
          pattern: /[,.\s]+(thank you kindly|thanks kindly)[.!]?\s*$/i,
          word: "thank you kindly",
        },
        // "thanks a lot" at end
        { pattern: /[,.\s]+(thanks a lot)[.!]?\s*$/i, word: "thanks a lot" },
        // "thank you" / "thanks" at end (closing, not content)
        { pattern: /[,.\s]+(thank you|thanks)[.!]?\s*$/i, word: "thanks" },

        // "Thanks for X" as a standalone sentence (broader)
        {
          pattern:
            /\.?\s*thanks? (you )?for (your |being so |your )?\w+[.!]?\s*/i,
          word: "thanks for",
        },

        // Standalone thank-you sentences (entire text or at start)
        { pattern: /^thanks a lot[.!]?\s*/i, word: "thanks a lot" },
        { pattern: /^thank you so much[.!]?\s*/i, word: "thank you so much" },
        {
          pattern: /^thank you very much[.!]?\s*/i,
          word: "thank you very much",
        },
        { pattern: /^many thanks[.!]?\s*/i, word: "many thanks" },
        { pattern: /^thanks a bunch[.!]?\s*/i, word: "thanks a bunch" },
        { pattern: /^thanks a million[.!]?\s*/i, word: "thanks a million" },
        { pattern: /^a thousand thanks[.!]?\s*/i, word: "a thousand thanks" },
        { pattern: /^thanks again[^.]*[.!]?\s*/i, word: "thanks again" },
        { pattern: /^thank you[.!]?\s*/i, word: "thank you" },
        { pattern: /^thanks[.!]?\s*/i, word: "thanks" },

        // Trailing thank-you variants
        {
          pattern:
            /[,.\s]*(many thanks|thanks a bunch|thanks a million|a thousand thanks|thanks again( and again)?)[.!]?\s*$/i,
          word: "thanks",
        },

        // "I (would) appreciate" anywhere
        {
          pattern:
            /\.?\s*i would (really |most |very much )?appreciate (it|this|your help|that)[.!]?\s*/i,
          word: "i would appreciate",
        },
        {
          pattern:
            /\.?\s*i (really )?(appreciate (it|this|your help|you))[.!]?\s*/i,
          word: "i appreciate",
        },
        {
          pattern: /\.?\s*i'?m? (so )?(grateful|thankful)[.!]?\s*/i,
          word: "i'm grateful",
        },

        // === German politeness ===

        { pattern: /^bitte[,\s]+/i, word: "bitte" },
        {
          pattern: /,?\s*bitte\s+(hilf|erkläre?|zeig|schreib|mach|gib)\b/i,
          word: "bitte",
          replaceWith: " $1",
        },
        {
          pattern: /\b(könntest|kannst|würdest|wirst) du (bitte\s+)?/i,
          word: "könntest du",
          replaceWith: "",
        },
        {
          pattern: /\b(könnten|können|würden|werden) sie (bitte\s+)?/i,
          word: "könnten sie",
          replaceWith: "",
        },
        { pattern: /[,\s]+bitte[.!?]?\s*$/i, word: "bitte" },

        // German apologies
        {
          pattern:
            /^entschuldigung[,.]?\s*(dass ich störe[,.]?\s*)?(aber\s+)?/i,
          word: "entschuldigung",
        },
        { pattern: /tut mir leid (fürs? \w+)[.!]?\s*$/i, word: "tut mir leid" },

        // German trailing closings
        {
          pattern:
            /[,.\s]*(mit freundlichen grüßen|freundliche grüße)[.!]?\s*$/i,
          word: "mit freundlichen grüßen",
        },
        {
          pattern: /[,.\s]*(schönen tag (noch)?|einen schönen tag)[.!]?\s*$/i,
          word: "schönen tag",
        },
        {
          pattern:
            /[,.\s]*(du bist (super|der beste|großartig|toll))[.!]?\s*$/i,
          word: "du bist super",
        },
        {
          pattern: /[,.\s]*(sie sind (großartig|wunderbar|toll))[.!]?\s*$/i,
          word: "sie sind großartig",
        },

        // German thank-you (longest first)
        {
          pattern: /[,.\s]*(vielen dank im voraus|danke im voraus)[.!]?\s*$/i,
          word: "danke im voraus",
        },
        {
          pattern: /[,.\s]*(vielen herzlichen dank|herzlichen dank)[.!]?\s*$/i,
          word: "herzlichen dank",
        },
        {
          pattern:
            /[,.\s]*(vielfachen dank|tausend dank|danke vielmals)[.!]?\s*$/i,
          word: "vielen dank",
        },
        {
          pattern: /[,.\s]*(nochmals vielen dank|nochmals danke)[.!]?\s*$/i,
          word: "nochmals danke",
        },
        {
          pattern:
            /[,.\s]+(vielen dank|danke schön|danke sehr|danke dir)[.!]?\s*$/i,
          word: "vielen dank",
        },
        { pattern: /[,.\s]+(danke)[.!]?\s*$/i, word: "danke" },

        // "Danke für X" as a standalone sentence (broader)
        {
          pattern: /\.?\s*danke (für|dass)[^.]*[.!]?\s*/i,
          word: "danke für",
        },

        // Standalone German thank-you sentences
        {
          pattern: /^vielen herzlichen dank[.!]?\s*/i,
          word: "vielen herzlichen dank",
        },
        { pattern: /^vielen dank[.!]?\s*/i, word: "vielen dank" },
        { pattern: /^herzlichen dank[.!]?\s*/i, word: "herzlichen dank" },
        { pattern: /^tausend dank[.!]?\s*/i, word: "tausend dank" },
        { pattern: /^vielfachen dank[.!]?\s*/i, word: "vielfachen dank" },
        { pattern: /^danke vielmals[.!]?\s*/i, word: "danke vielmals" },
        { pattern: /^danke schön[.!]?\s*/i, word: "danke schön" },
        { pattern: /^danke[.!]?\s*/i, word: "danke" },
        { pattern: /^nochmals[.!]?\s*/i, word: "nochmals" },

        // "Ich wäre (Ihnen) (sehr/äußerst/überaus) dankbar" anywhere
        {
          pattern:
            /\.?\s*ich wäre (ihnen )?(sehr |wirklich |äußerst |überaus )?dankbar[^.]*[.!]?\s*/i,
          word: "ich wäre dankbar",
        },
        // "Ich schätze Ihre Hilfe" patterns
        {
          pattern:
            /\.?\s*ich schätze (ihre |deine )?(hilfe|unterstützung|geduld)( sehr)?[.!]?\s*/i,
          word: "ich schätze ihre hilfe",
        },
      ];

      // Run politeness removal in a loop — removing one trailing phrase
      // may expose another at the new end of the string.
      let politeChanged = true;
      while (politeChanged) {
        politeChanged = false;
        politeFillers.forEach(({ pattern, word, replaceWith }) => {
          if (!isContextRelevant(word)) {
            const flags = pattern.flags.includes("g")
              ? pattern.flags
              : `${pattern.flags}g`;
            const globalPattern = new RegExp(pattern.source, flags);
            if (globalPattern.test(optimized)) {
              removedWords.push(word);
              const nextOptimized = optimized.replace(
                globalPattern,
                replaceWith || "",
              );
              if (nextOptimized !== optimized) {
                optimized = nextOptimized;
                politeChanged = true;
              }
            }
          }
        });
      }

      // Step 6: Remove filler words (English + German)
      // NOTE: Uses non-global regex for test() then global for replace()
      // to avoid the lastIndex bug with global regexes.
      const fillers = [
        // English fillers
        { pattern: /\bactually[,\s]+/gi, word: "actually" },
        { pattern: /\bbasically[,\s]+/gi, word: "basically" },
        { pattern: /\bliterally\s+/gi, word: "literally" },
        { pattern: /\bjust[,\s]+/gi, word: "just" },
        { pattern: /\breally[,\s]+/gi, word: "really" },
        { pattern: /\bvery\s+/gi, word: "very" },
        { pattern: /\bquite\s+/gi, word: "quite" },
        { pattern: /\bsomewhat\s+/gi, word: "somewhat" },
        { pattern: /\brather\s+/gi, word: "rather" },
        { pattern: /\blike[,\s]+/gi, word: "like" },
        { pattern: /\bkind of\s+/gi, word: "kind of" },
        { pattern: /\bsort of\s+/gi, word: "sort of" },
        { pattern: /\bi mean[,\s]+/gi, word: "i mean" },
        { pattern: /\byou know[,\s]+/gi, word: "you know" },
        { pattern: /\bto be honest[,\s]+/gi, word: "to be honest" },
        { pattern: /\bhonestly[,\s]+/gi, word: "honestly" },
        { pattern: /\bfrankly[,\s]+/gi, word: "frankly" },
        // "though" at end of sentence (before period/!/?) or end of string
        { pattern: /\s+though\s*[.!?]\s*/gi, word: "though" },
        { pattern: /\s+though\s*$/gi, word: "though" },
        // "though" surrounded by commas
        { pattern: /[,\s]+though[,\s]+/gi, word: "though" },
        { pattern: /\banyway[,\s]+/gi, word: "anyway" },
        { pattern: /^so[,\s]+/gi, word: "so" },

        // Multi-word filler phrases (English)
        {
          pattern: /\bat the end of the day[,\s]*/gi,
          word: "at the end of the day",
        },
        { pattern: /\bto be fair[,\s]+/gi, word: "to be fair" },
        { pattern: /\bto be frank[,\s]+/gi, word: "to be frank" },
        {
          pattern: /\bto be completely (truthful|honest)[,\s]+/gi,
          word: "to be truthful",
        },
        { pattern: /\bin my opinion[,\s]+/gi, word: "in my opinion" },
        { pattern: /\bi believe[,\s]+/gi, word: "i believe" },
        { pattern: /\bi feel like[,\s]+/gi, word: "i feel like" },
        { pattern: /\bi think[,\s]+/gi, word: "i think" },
        {
          pattern: /\bas far as I (know|can tell)[,\s]+/gi,
          word: "as far as i know",
        },
        {
          pattern: /\bfrom what I understand[,\s]+/gi,
          word: "from what i understand",
        },
        { pattern: /\bto some extent[,\s]+/gi, word: "to some extent" },
        {
          pattern: /\bto a certain degree[,\s]+/gi,
          word: "to a certain degree",
        },
        { pattern: /\bin a way[,\s]+/gi, word: "in a way" },
        { pattern: /\bclearly[,\s]+/gi, word: "clearly" },
        { pattern: /\bobviously[,\s]+/gi, word: "obviously" },
        { pattern: /\bevidently[,\s]+/gi, word: "evidently" },
        { pattern: /\bapparently[,\s]+/gi, word: "apparently" },
        { pattern: /\barguably[,\s]+/gi, word: "arguably" },
        { pattern: /\bi would say that[,\s]+/gi, word: "i would say that" },
        { pattern: /\bi would argue that[,\s]+/gi, word: "i would argue that" },
        {
          pattern: /\bi would suggest that[,\s]+/gi,
          word: "i would suggest that",
        },
        { pattern: /\bit appears that[,\s]+/gi, word: "it appears that" },
        { pattern: /^right[,\s]+/gi, word: "right" },
        { pattern: /\bright\?\s*$/gi, word: "right" },
        { pattern: /^okay[,\s]+/gi, word: "okay" },
        { pattern: /\bmoving forward[,\s]+/gi, word: "moving forward" },
        { pattern: /\bgoing forward[,\s]+/gi, word: "going forward" },

        // German fillers
        { pattern: /\beigentlich[,\s]+/gi, word: "eigentlich" },
        { pattern: /\bhalt[,\s]+/gi, word: "halt" },
        { pattern: /\beben[,\s]+/gi, word: "eben" },
        { pattern: /\bsozusagen[,\s]+/gi, word: "sozusagen" },
        { pattern: /\bquasi[,\s]+/gi, word: "quasi" },
        { pattern: /\birgendwie[,\s]+/gi, word: "irgendwie" },
        { pattern: /\bgewissermaßen[,\s]+/gi, word: "gewissermaßen" },
        { pattern: /\bna ja[,\s]+/gi, word: "na ja" },
        { pattern: /\bnaja[,\s]+/gi, word: "naja" },
        { pattern: /\balso[,\s]+/gi, word: "also" },
        { pattern: /\bweißt du[,\s]+/gi, word: "weißt du" },
        { pattern: /\bverstehst du[,\s]+/gi, word: "verstehst du" },
        { pattern: /\bich meine[,\s]+/gi, word: "ich meine" },
        { pattern: /\becht[,\s]+/gi, word: "echt" },
        // German opinion/obviousness markers
        {
          pattern: /\bmeiner meinung nach[,\s]+/gi,
          word: "meiner meinung nach",
        },
        { pattern: /\bich denke[,\s]+/gi, word: "ich denke" },
        { pattern: /\bich glaube[,\s]+/gi, word: "ich glaube" },
        { pattern: /\bich finde[,\s]+/gi, word: "ich finde" },
        { pattern: /\boffensichtlich[,\s]+/gi, word: "offensichtlich" },
        { pattern: /\beindeutig[,\s]+/gi, word: "eindeutig" },
        { pattern: /\banscheinend[,\s]+/gi, word: "anscheinend" },
        // ähm / äh with non-ASCII boundary
        { pattern: /(?:^|[\s,])(äh(m)?)\.{0,3}[,\s]*$/gi, word: "ähm" },
        { pattern: /(?:^|[\s,])(äh(m)?)[,\s\.]+/gi, word: "ähm" },
        { pattern: /\bum\.{0,3}[,\s]*$/gi, word: "um" },
        { pattern: /\bum[,\s\.]+/gi, word: "um" },
      ];

      fillers.forEach(({ pattern, word }) => {
        // Reset lastIndex before testing (global regex quirk)
        pattern.lastIndex = 0;
        if (pattern.test(optimized)) {
          removedWords.push(word);
          pattern.lastIndex = 0;
          optimized = optimized.replace(pattern, "");
        }
      });

      const removeStudyTerms = (terms, category) => {
        terms.forEach((term) => {
          if (!term || (category !== "filler" && isContextRelevant(term))) {
            return;
          }

          const escaped = this.escapeRegex(term);
          const regex =
            category === "filler"
              ? new RegExp(`\\b${escaped}\\b`, "gi")
              : new RegExp(
                  `(^|[\\s,.;:!?()"'])${escaped}(?=([\\s,.;:!?()"']|$))`,
                  "gi",
                );

          if (!regex.test(optimized)) {
            return;
          }

          removedWords.push(term);
          optimized = optimized.replace(
            regex,
            category === "filler" ? "" : "$1",
          );
        });
      };

      // Data-driven cleanup with the full words.md lists.
      removeStudyTerms(STUDY_POLITE_SMALLTALK_TERMS, "polite");
      removeStudyTerms(STUDY_FILLER_TERMS, "filler");

      // Step 7: Replace complex words with simpler alternatives
      const replacements = [
        // Multi-word phrases first (longest match)
        {
          pattern: /\belaborate\s+on\b/gi,
          from: "elaborate on",
          to: "explain",
        },
        { pattern: /\bin order to\b/gi, from: "in order to", to: "to" },
        { pattern: /\bprior to\b/gi, from: "prior to", to: "before" },
        {
          pattern: /\bwith regard to\b/gi,
          from: "with regard to",
          to: "about",
        },
        {
          pattern: /\bat this point in time\b/gi,
          from: "at this point in time",
          to: "now",
        },
        {
          pattern: /\bat the present moment\b/gi,
          from: "at the present moment",
          to: "now",
        },
        {
          pattern: /\bdue to the fact that\b/gi,
          from: "due to the fact that",
          to: "because",
        },
        {
          pattern: /\bbecause of the fact that\b/gi,
          from: "because of the fact that",
          to: "because",
        },
        {
          pattern: /\bin the event that\b/gi,
          from: "in the event that",
          to: "if",
        },
        {
          pattern: /\bfor the purpose of\b/gi,
          from: "for the purpose of",
          to: "to",
        },

        // Single word replacements (English)
        { pattern: /\belaborate\b/gi, from: "elaborate", to: "explain" },
        { pattern: /\belucidate\b/gi, from: "elucidate", to: "explain" },
        { pattern: /\bexpound\b/gi, from: "expound", to: "explain" },
        { pattern: /\bdemonstrate\b/gi, from: "demonstrate", to: "show" },
        { pattern: /\butilize\b/gi, from: "utilize", to: "use" },
        { pattern: /\bascertain\b/gi, from: "ascertain", to: "find out" },
        { pattern: /\bcommence\b/gi, from: "commence", to: "start" },
        { pattern: /\bterminate\b/gi, from: "terminate", to: "end" },
        { pattern: /\bfacilitate\b/gi, from: "facilitate", to: "help" },
        { pattern: /\bendeavor\b/gi, from: "endeavor", to: "try" },
        { pattern: /\bsubsequent\b/gi, from: "subsequent", to: "next" },
        { pattern: /\bacquire\b/gi, from: "acquire", to: "get" },
        { pattern: /\bobtain\b/gi, from: "obtain", to: "get" },
        { pattern: /\bverify\b/gi, from: "verify", to: "check" },
        { pattern: /\bvalidate\b/gi, from: "validate", to: "check" },
        { pattern: /\bmodify\b/gi, from: "modify", to: "change" },
        { pattern: /\balter\b/gi, from: "alter", to: "change" },
        { pattern: /\badjust\b/gi, from: "adjust", to: "change" },
        { pattern: /\bassist\b/gi, from: "assist", to: "help" },
        { pattern: /\bconcerning\b/gi, from: "concerning", to: "about" },

        // German multi-word phrases
        {
          pattern: /\baufgrund der Tatsache dass\b/gi,
          from: "aufgrund der Tatsache, dass",
          to: "weil",
        },
        {
          pattern: /\bwegen der Tatsache dass\b/gi,
          from: "wegen der Tatsache dass",
          to: "weil",
        },
        { pattern: /\bim Falle dass\b/gi, from: "im Falle dass", to: "falls" },
        {
          pattern: /\bzum jetzigen Zeitpunkt\b/gi,
          from: "zum jetzigen Zeitpunkt",
          to: "jetzt",
        },
        {
          pattern: /\bim gegenwärtigen Moment\b/gi,
          from: "im gegenwärtigen Moment",
          to: "jetzt",
        },
        {
          pattern: /\bzu diesem Zeitpunkt\b/gi,
          from: "zu diesem Zeitpunkt",
          to: "jetzt",
        },
        { pattern: /\bzum Zwecke der\b/gi, from: "zum Zwecke der", to: "zum" },

        // German single word replacements
        { pattern: /\berläutern\b/gi, from: "erläutern", to: "erklären" },
        { pattern: /\bdarlegen\b/gi, from: "darlegen", to: "erklären" },
        { pattern: /\bdemonstrieren\b/gi, from: "demonstrieren", to: "zeigen" },
        { pattern: /\bverwenden\b/gi, from: "verwenden", to: "nutzen" },
        { pattern: /\bverifizieren\b/gi, from: "verifizieren", to: "prüfen" },
        { pattern: /\bvalidieren\b/gi, from: "validieren", to: "prüfen" },
      ];

      replacements.forEach(({ pattern, from, to }) => {
        pattern.lastIndex = 0;
        if (pattern.test(optimized)) {
          replacedWords.push({ from, to });
          pattern.lastIndex = 0;
          optimized = optimized.replace(pattern, to);
        }
      });

      // Step 8: Restore quoted content
      quotedSections.forEach((content, i) => {
        optimized = optimized.replace(`__QUOTED_${i}__`, content);
      });

      // Step 9: Clean up the text
      optimized = this.cleanupText(optimized);

      console.log("[GreenPrompt] Optimization complete:");
      console.log("- Original:", text);
      console.log("- Optimized:", optimized);
      console.log("- Removed:", removedWords);
      console.log("- Replaced:", replacedWords);

      return {
        text: optimized,
        isEmpty: !optimized || optimized.trim().length === 0,
        removedWords,
        replacedWords,
        tokensReduced:
          this.estimateTokens(text) - this.estimateTokens(optimized),
      };
    }

    /**
     * Fallback optimization when worker processing is unavailable.
     * Uses the same local context-aware approach.
     */
    optimizePromptLocalFallback(text) {
      return this.optimizePrompt(text);
    }
    /**
     * Clean up text formatting
     */
    cleanupText(text) {
      let cleaned = text;

      // Fix common typos and issues
      cleaned = cleaned.replace(/\bwhats\s+is\b/gi, "what is");
      cleaned = cleaned.replace(/\bwhats\b/gi, "what is");

      // Clean up spacing
      cleaned = cleaned.replace(/\s+/g, " ");
      cleaned = cleaned.replace(/\s+([,.!?])/g, "$1");
      cleaned = cleaned.replace(/([,.!?])\s*([,.!?])/g, "$1");
      cleaned = cleaned.replace(/\s+$/g, "");
      cleaned = cleaned.replace(/^\s+/g, "");

      // Fix capitalization
      if (cleaned.length > 0) {
        cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
      }

      // Don't auto-add punctuation - let the user's intent remain

      return cleaned;
    }

    splitIntoSentences(text) {
      const source = String(text || "").trim();
      if (!source) {
        return [];
      }

      const sentenceMatches = source.match(/[^.!?]+[.!?]*\s*/g);
      if (!sentenceMatches) {
        return [source];
      }

      return sentenceMatches.map((entry) => entry.trim()).filter(Boolean);
    }

    normalizeSentenceForComparison(sentence) {
      return String(sentence || "")
        .toLowerCase()
        .replace(/["'`]/g, "")
        .replace(/[.,!?;:()\[\]{}]/g, "")
        .replace(/\s+/g, " ")
        .trim();
    }

    analyzeDuplicateSentences(text) {
      const sentences = this.splitIntoSentences(text);
      const seen = new Set();
      const duplicateSamples = [];

      sentences.forEach((sentence) => {
        const normalized = this.normalizeSentenceForComparison(sentence);
        if (!normalized) {
          return;
        }

        if (seen.has(normalized)) {
          if (!duplicateSamples.includes(sentence)) {
            duplicateSamples.push(sentence);
          }
          return;
        }

        seen.add(normalized);
      });

      return {
        duplicateCount: duplicateSamples.length,
        duplicateSamples,
      };
    }

    removeDuplicateSentences(text) {
      const sentences = this.splitIntoSentences(text);
      const seen = new Set();
      const uniqueSentences = [];

      sentences.forEach((sentence) => {
        const normalized = this.normalizeSentenceForComparison(sentence);
        if (!normalized || seen.has(normalized)) {
          return;
        }
        seen.add(normalized);
        uniqueSentences.push(sentence.trim());
      });

      return this.cleanupText(uniqueSentences.join(" "));
    }

    /**
     * Compute word-level diff between two texts.
     * Returns an array of { type, value } where type is 'equal', 'removed', or 'added'.
     * Uses a simple LCS-based approach on word tokens.
     */
    computeDiff(original, optimized) {
      // Tokenize into words + whitespace/punctuation segments
      const tokenize = (text) => {
        const tokens = [];
        const regex = /(\S+|\s+)/g;
        let match;
        while ((match = regex.exec(text)) !== null) {
          tokens.push(match[0]);
        }
        return tokens;
      };

      const a = tokenize(original);
      const b = tokenize(optimized);

      // Build LCS table
      const m = a.length;
      const n = b.length;
      const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

      for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
          if (a[i - 1] === b[j - 1]) {
            dp[i][j] = dp[i - 1][j - 1] + 1;
          } else {
            dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
          }
        }
      }

      // Backtrack to build diff
      const diff = [];
      let i = m,
        j = n;
      while (i > 0 || j > 0) {
        if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
          diff.unshift({ type: "equal", value: a[i - 1] });
          i--;
          j--;
        } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
          diff.unshift({ type: "added", value: b[j - 1] });
          j--;
        } else {
          diff.unshift({ type: "removed", value: a[i - 1] });
          i--;
        }
      }

      return diff;
    }

    /**
     * Generate HTML for the inline diff view.
     * Removed text: red with strikethrough. Added text: green with underline.
     */
    generateDiffHtml(original, optimized) {
      const diff = this.computeDiff(original, optimized);
      let html = "";

      for (const part of diff) {
        const escaped = this.escapeHtml(part.value);
        switch (part.type) {
          case "removed":
            html += `<span class="gp-diff-removed">${escaped}</span>`;
            break;
          case "added":
            html += `<span class="gp-diff-added">${escaped}</span>`;
            break;
          default:
            html += escaped;
        }
      }

      return html;
    }

    /**
     * Escape special regex characters
     */
    escapeRegex(str) {
      return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }

    /**
     * Estimate token count (simple approximation)
     */
    estimateTokens(text) {
      // Rough estimate: 1 token ≈ 4 characters
      return Math.ceil(text.length / 4);
    }

    /**
     * Show optimization UI
     */
    showOptimizationUI(original, optimized, promptSessionId = null) {
      // Check if prompt is empty after optimization
      if (optimized.isEmpty) {
        this.logStudyEvent("optimization_empty_prompt", {
          originalLength: String(original || "").length,
          promptSessionId,
        });

        if (promptSessionId && this.logger?.finishPromptFlow) {
          this.logger.finishPromptFlow(promptSessionId, {
            action: "empty_warning",
            decisionMethod: "blocked_empty_optimized",
            originalPrompt: original,
            optimizedPrompt: optimized.text || "",
            extra: { emptyAfterOptimization: true },
          });
        }

        this.showEmptyPromptWarning();
        return;
      }

      const duplicateInfo = this.analyzeDuplicateSentences(original);

      this.logStudyEvent("optimization_modal_shown", {
        originalLength: String(original || "").length,
        optimizedLength: String(optimized.text || "").length,
        duplicateCount: duplicateInfo.duplicateCount,
        promptSessionId,
      });

      // Create overlay
      const overlay = this.createOverlay();
      const modal = this.createModal(original, optimized.text, duplicateInfo);

      overlay.appendChild(modal);
      document.body.appendChild(overlay);

      // Add event listeners
      this.attachModalListeners(
        overlay,
        original,
        optimized.text,
        duplicateInfo,
        promptSessionId,
      );
    }

    /**
     * Show warning for empty prompt
     */
    showEmptyPromptWarning() {
      const overlay = this.createOverlay();
      const modal = document.createElement("div");
      modal.className = "gp-modal";

      modal.innerHTML = `
        <div class="gp-header">
          <h2>⚠️ Empty Prompt Detected</h2>
          <button class="gp-close">×</button>
        </div>
        <div class="gp-body">
          <div class="gp-warning">
            <div class="gp-warning-title">Your prompt contains only politeness phrases</div>
            <p>After optimization, no meaningful instruction remains. Sending this would waste computational resources without producing useful output.</p>
            <p><strong>Recommendation:</strong> Add specific instructions to your prompt.</p>
          </div>
          <div class="gp-actions">
            <button class="gp-btn gp-btn-accept" data-action="close">Understood</button>
          </div>
        </div>
      `;

      overlay.appendChild(modal);
      document.body.appendChild(overlay);

      modal.querySelector(".gp-close").addEventListener("click", () => {
        this.logStudyEvent("empty_prompt_warning_closed", {
          method: "close_button",
        });
        overlay.remove();
      });

      modal
        .querySelector('[data-action="close"]')
        .addEventListener("click", () => {
          this.logStudyEvent("empty_prompt_warning_closed", {
            method: "understood_button",
          });
          overlay.remove();
        });
    }

    /**
     * Create overlay element
     */
    createOverlay() {
      const overlay = document.createElement("div");
      overlay.className = "gp-overlay";
      overlay.addEventListener("click", (e) => {
        if (e.target === overlay) {
          overlay.remove();
        }
      });
      return overlay;
    }

    createModal(original, optimized, duplicateInfo) {
      const modal = document.createElement("div");
      modal.className = "gp-modal";

      const defaultLengthOption = this.config.modules.nudging ? "1" : "full";
      const newScore = this.getScoreForLength(defaultLengthOption);

      // Apply nudging class if enabled
      if (this.config.modules.nudging) {
        modal.classList.add("nudging");
      }

      if (this.config.modules.nudging && !this.config.modules.gamification) {
        modal.classList.add("no-gamification");
      }

      // Assets
      const logoUrl = this.safeRuntimeGetUrl(
        "assets/logo/greenprompt-logo.png",
      );

      // Assets für alle Bäume und Levels
      const treeImages = {
        apple: {
          1: this.safeRuntimeGetUrl("assets/trees/Level1_AppleTree.webp"),
          2: this.safeRuntimeGetUrl("assets/trees/tree.webp"),
          3: this.safeRuntimeGetUrl("assets/trees/Level3_AT.webp"),
          4: this.safeRuntimeGetUrl("assets/trees/Level4_AT.webp"),
          0: this.safeRuntimeGetUrl("assets/trees/Level5_AT.webp"),
        },
        olive: {
          1: this.safeRuntimeGetUrl("assets/trees/Level1_OliveTree.webp"),
          2: this.safeRuntimeGetUrl("assets/trees/Level2_OliveTree.webp"),
          3: this.safeRuntimeGetUrl("assets/trees/Level3_OliveTree.webp"),
          4: this.safeRuntimeGetUrl("assets/trees/Level4_OliveTree.webp"),
          0: this.safeRuntimeGetUrl("assets/trees/Level5_OliveTree.webp"),
        },
        maple: {
          1: this.safeRuntimeGetUrl("assets/trees/Level1_MapleTree.webp"),
          2: this.safeRuntimeGetUrl("assets/trees/Level2_MapleTree.webp"),
          3: this.safeRuntimeGetUrl("assets/trees/Level3_MapleTree.webp"),
          4: this.safeRuntimeGetUrl("assets/trees/Level4_MapleTree.webp"),
          0: this.safeRuntimeGetUrl("assets/trees/Level5_MapleTree.webp"),
        },
        fir: {
          1: this.safeRuntimeGetUrl("assets/trees/Level1_FirTree.webp"),
          2: this.safeRuntimeGetUrl("assets/trees/Level2_FirTree.webp"),
          3: this.safeRuntimeGetUrl("assets/trees/Level3_FirTree.webp"),
          4: this.safeRuntimeGetUrl("assets/trees/Level4_FirTree.webp"),
          0: this.safeRuntimeGetUrl("assets/trees/Level5_FirTree.webp"),
        },
      };

      // Prüfen, welcher Baum gewählt wurde, Default = apple
      const currentTree = this.getCurrentTree();

      const levelForImage = this.stats.level % 5;
      const TreeUrl = treeImages[currentTree][levelForImage];

      const treeName =
        currentTree.charAt(0).toUpperCase() + currentTree.slice(1) + " Tree"; // z.B. "Apple Tree"

      const levelTitles = {
        1: "Seeding Phase",
        2: "Sapling Phase",
        3: "Growing Phase",
        4: "Fruiting Phase",
        0: "Mature Phase",
      };
      const levelTitle = levelTitles[levelForImage];

      if (isNaN(this.stats.score)) {
        this.stats.score = 0;
      }

      // Build HTML
      let html = `
    <div class="gp-header">
      <div class="gp-header-title">
        <img src="${logoUrl}" alt="GreenPrompt" class="gp-header-logo">
  
      </div>
      <button class="gp-close">×</button>
    </div>

    <div class="gp-body gp-body-layout">
      <div class="gp-main-content">
  `;

      // Response length selector
      html += `
    <div class="gp-length-selector">
      <p class="gp-length-title">Expected response length:</p>

      <div class="length-slider">
        <span class="length-option" data-length="1">1 sentence</span>
        <span class="length-option" data-length="2">2 sentences</span>
        <span class="length-option" data-length="paragraph">1 paragraph</span>
        <span class="length-option" data-length="full">full answer</span>
      </div>
    </div>
  `;

      // Prompt comparison
      html += `
    <div class="gp-prompts-container">

      <!-- Original Prompt -->
      <div class="gp-prompt-box original">
        <h3>Original Prompt</h3>

        <div class="gp-white-textbox" style="
          background-color: white;
          border-radius: 12px;
          padding: 14px;
          margin-top: 10px;
          box-shadow: 0 2px 6px rgba(0,0,0,0.15);
        ">
          <div class="gp-prompt-text">${this.escapeHtml(original.trim())}</div>
        </div>

        ${
          duplicateInfo && duplicateInfo.duplicateCount > 0
            ? `
        <div class="gp-duplicate-warning">
          <strong>Duplicate sentences detected (${duplicateInfo.duplicateCount})</strong>
          Please remove repeated sentences to make your prompt cleaner and cheaper to process.
          <div class="gp-duplicate-actions">
            <button class="gp-duplicate-btn" data-action="remove-duplicates">Remove duplicate text</button>
            <span class="gp-duplicate-status"></span>
          </div>
        </div>
        `
            : ""
        }
      </div>

      <!-- Optimized Prompt -->
      <div class="gp-prompt-box optimized">
        <h3>Optimized Prompt</h3>

        <div class="gp-white-textbox" style="
          background-color: white;
          border-radius: 12px;
          padding: 14px;
          margin-top: 10px;
          box-shadow: 0 2px 6px rgba(0,0,0,0.15);
        ">
          ${
            this.config.modules.showDiff
              ? `<div class="gp-diff-text gp-optimized-content">${this.generateDiffHtml(original, optimized)}</div>`
              : `<div class="gp-prompt-text gp-optimized-content">${this.escapeHtml(optimized.trim())}</div>`
          }
        </div>

        ${
          this.config.modules.nudging
            ? `
  <div class="gp-nudging-info" style="
    margin-top: 10px;
    font-size: 12px;
    color: #2fa866;
    font-weight: 500;
  ">
    <span class="nudging-impact-text"></span>
  </div>
  `
            : ""
        }

        <!-- Feld für berechnete Zahl (nur gamification) -->
        ${
          this.config.modules.gamification
            ? `
          <div class="number-display" style="
            margin-top: 10px;
            padding: 0;
            border-radius: 0;
            background: none;
            border: none;
            font-size: 13px;
            font-weight: 500;
            color: #333;
            text-align: left;
          ">
            New Score: ${newScore}
          </div>
          `
            : ""
        }

      
       

      </div>
      ${
        this.config.modules.gamification
          ? `
  <div class="gp-prompt-box gamification">
    

    <div class="gp-gamification-panel">

      <div class="gp-level-section">
        <div class="gp-level-value">Level ${this.stats.level}</div>
        <div class="gp-level-subtitle"> ${treeName} - ${levelTitle}</div>
      </div>

      <img src="${TreeUrl}" class="gp-tree-avatar" />

      <div class="gp-score-section">
        <div class="gp-score-label">Environmental Score:</div>

        <div class="gp-progress-container">
          <div class="gp-progress-bar" id="dynamicProgressBar"></div>
        </div>

        <div class="gp-score-value">
          <span id="currentScoreText">${this.stats.score}</span>/${this.stats.level * 20}
        </div>
      </div>

    </div>
  </div>
  `
          : ""
      }

  </div>
`;

      // Action buttons
      html += `
    <div class="gp-actions">
      <button class="gp-btn gp-btn-reject" data-action="reject">
        Keep Original
      </button>

      <button class="gp-btn gp-btn-edit" data-action="edit">
        Edit
      </button>

      <button class="gp-btn gp-btn-accept" data-action="accept">
        Use Optimized
      </button>
    </div>
  `;

      html += `
      </div>
  `;

      html += `
    </div>
  `;

      modal.innerHTML = html;

      //Gamification score und progress bar
      if (this.config.modules.gamification) {
        const progressBar = modal.querySelector("#dynamicProgressBar");
        const scoreText = modal.querySelector("#currentScoreText");
        const levelValue = modal.querySelector(".gp-level-value");
        const level = this.stats.level;
        const maxScore = level * 20;

        if (progressBar && scoreText) {
          const score = this.stats.score;
          scoreText.textContent = score;

          const percent = ((score % 20) / 20) * 100;
          progressBar.style.width = percent + "%";
        }

        if (levelValue) {
          levelValue.textContent = `Level ${this.stats.level}`;
        }
      }

      // In nudging mode, keep the reject action visually near the original prompt.
      if (this.config.modules.nudging) {
        const rejectBtn = modal.querySelector(".gp-btn-reject");
        const originalPromptBox = modal.querySelector(
          ".gp-prompt-box.original",
        );

        if (rejectBtn && originalPromptBox) {
          if (this.config.modules.gamification) {
            originalPromptBox.style.position = "relative";
            rejectBtn.style.position = "absolute";
            rejectBtn.style.top = "-36px";
            rejectBtn.style.left = "10%";
            rejectBtn.style.transform = "translateX(-50%)";
            originalPromptBox.appendChild(rejectBtn);
          } else {
            rejectBtn.style.position = "static";
            rejectBtn.style.transform = "none";
            rejectBtn.style.display = "inline-block";
            rejectBtn.style.margin = "0 0 8px 0";
            rejectBtn.style.alignSelf = "flex-start";

            const promptsContainer = modal.querySelector(
              ".gp-prompts-container",
            );
            if (promptsContainer && promptsContainer.parentElement) {
              promptsContainer.parentElement.insertBefore(
                rejectBtn,
                promptsContainer,
              );
            }
          }
        }
      }

      // Nudging: Optimized Prompt Box hervorheben
      if (this.config.modules.nudging) {
        const optimizedPromptBox = modal.querySelector(
          ".gp-prompt-box.optimized",
        );
        if (optimizedPromptBox) {
          optimizedPromptBox.style.border = "2px solid #b3b2b2";
          optimizedPromptBox.style.borderRadius = "10px";
          optimizedPromptBox.style.padding = "8px";
          optimizedPromptBox.style.backgroundColor = "#d1e5ce";
        }
      }

      return modal;
    }

    // /**
    //  * Get tree SVG for gamification
    //  */
    // getTreeSVG(healthy) {
    //   if (healthy) {
    //     return `
    //       <svg class="gp-tree-icon" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
    //         <rect x="42" y="60" width="16" height="30" fill="#8B4513"/>
    //         <circle cx="50" cy="45" r="20" fill="#228B22"/>
    //         <circle cx="38" cy="35" r="15" fill="#32CD32"/>
    //         <circle cx="62" cy="35" r="15" fill="#32CD32"/>
    //         <circle cx="50" cy="25" r="12" fill="#00FF00"/>
    //       </svg>
    //     `;
    //   } else {
    //     return `
    //       <svg class="gp-tree-icon" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
    //         <rect x="42" y="60" width="16" height="30" fill="#654321"/>
    //         <circle cx="50" cy="45" r="20" fill="#8B7355"/>
    //         <circle cx="38" cy="35" r="15" fill="#A0826D"/>
    //         <circle cx="62" cy="35" r="15" fill="#A0826D"/>
    //         <circle cx="50" cy="25" r="12" fill="#8B7355"/>
    //       </svg>
    //     `;
    //   }
    // }

    /**
     * Escape HTML to prevent XSS
     */
    escapeHtml(text) {
      const div = document.createElement("div");
      div.textContent = text;
      return div.innerHTML;
    }

    /**
     * Attach modal event listeners
     */
    attachModalListeners(
      overlay,
      original,
      optimized,
      duplicateInfo,
      promptSessionId = null,
    ) {
      const modal = overlay.querySelector(".gp-modal");
      const acceptButton = modal.querySelector('[data-action="accept"]');
      let activeOptimized = optimized;
      const modalOpenedAt = Date.now();

      if (this.textarea && typeof this.textarea.blur === "function") {
        this.textarea.blur();
      }
      if (acceptButton && typeof acceptButton.focus === "function") {
        acceptButton.focus();
      }

      this.logStudyEvent("optimization_modal_opened", {
        promptSessionId,
        originalLength: String(original || "").length,
        optimizedLength: String(activeOptimized || "").length,
      });

      if (promptSessionId && this.logger?.updatePromptFlow) {
        this.logger.updatePromptFlow(promptSessionId, {
          modalOpenedAtISO: new Date(modalOpenedAt).toISOString(),
          optimizationStep: {
            stepType: "modal_opened",
            optimizedPrompt: activeOptimized,
            optimizedWordCount: this.estimateWords(activeOptimized || ""),
            optimizedTokenEstimate: this.estimateTokens(activeOptimized || ""),
            meta: {
              chatPlatform: window.location.hostname || "unknown",
              pagePath: window.location.pathname || "/",
            },
          },
        });
      }

      overlay.addEventListener(
        "click",
        (event) => {
          if (event.target !== overlay) {
            return;
          }

          const dwellMs = Date.now() - modalOpenedAt;
          this.logStudyEvent("optimization_modal_closed", {
            reason: "overlay_click",
            dwellMs,
            promptSessionId,
          });

          if (promptSessionId && this.logger?.finishPromptFlow) {
            this.logger.finishPromptFlow(promptSessionId, {
              action: "close",
              decisionMethod: "overlay_click",
              originalPrompt: original,
              optimizedPrompt: activeOptimized,
              finalLengthOption: selectedLength,
              extra: { modalClosedWithoutDecision: true },
            });
            if (
              this.pendingEditedPromptFlow &&
              this.pendingEditedPromptFlow.promptSessionId === promptSessionId
            ) {
              this.pendingEditedPromptFlow = null;
            }
          }
        },
        { capture: true },
      );

      // Close button
      modal.querySelector(".gp-close").addEventListener("click", () => {
        const dwellMs = Date.now() - modalOpenedAt;
        this.logStudyEvent("optimization_modal_closed", {
          reason: "close_button",
          dwellMs,
          promptSessionId,
        });

        if (promptSessionId && this.logger?.finishPromptFlow) {
          this.logger.finishPromptFlow(promptSessionId, {
            action: "close",
            decisionMethod: "close_button",
            originalPrompt: original,
            optimizedPrompt: activeOptimized,
            finalLengthOption: selectedLength,
            extra: { modalClosedWithoutDecision: true },
          });
          if (
            this.pendingEditedPromptFlow &&
            this.pendingEditedPromptFlow.promptSessionId === promptSessionId
          ) {
            this.pendingEditedPromptFlow = null;
          }
        }

        overlay.remove();
      });

      //Length-Buttons Logik
      const lengthOptions = modal.querySelectorAll(".length-option");

      // Standard festlegen
      let selectedLength = "full"; // Default

      if (this.config.modules.nudging) {
        // Prüft, ob Nudging aktiv ist
        selectedLength = "1"; // Standard auf "1" setzen
      }

      if (promptSessionId && this.logger?.updatePromptFlow) {
        this.logger.updatePromptFlow(promptSessionId, {
          selectedLengthOption: selectedLength,
          choiceSelection: {
            value: selectedLength,
            source: "default",
            ts: new Date().toISOString(),
          },
        });
      }

      lengthOptions.forEach((opt) => {
        opt.addEventListener("click", () => {
          // Aktiviere opt als active und deaktiviere andere
          lengthOptions.forEach((o) => o.classList.remove("active"));
          opt.classList.add("active");
          selectedLength = opt.dataset.length;

          this.logStudyEvent("length_option_selected", {
            selectedLength,
            promptSessionId,
          });

          if (promptSessionId && this.logger?.updatePromptFlow) {
            this.logger.updatePromptFlow(promptSessionId, {
              selectedLengthOption: selectedLength,
              choiceSelection: {
                value: selectedLength,
                source: "user_click",
                ts: new Date().toISOString(),
              },
              optimizationStep: {
                stepType: "length_option_selected",
                selectedLengthOption: selectedLength,
                optimizedPrompt: activeOptimized,
                optimizedWordCount: this.estimateWords(activeOptimized || ""),
                optimizedTokenEstimate: this.estimateTokens(
                  activeOptimized || "",
                ),
              },
            });
          }

          // Punkte und Level-Up berechnen
          updatePoints.call(this);
        });
      });

      // Punkte und Impact dynamisch berechnen
      function updatePoints() {
        const impact = this.calculatePromptImpact(
          original,
          activeOptimized,
          selectedLength,
        );
        const points = impact.scorePoints;
        const nextScore = (Number(this.stats.score) || 0) + points;
        const nextLevel = this.computeLevelForScore(nextScore);
        const levelUp = nextLevel > (Number(this.stats.level) || 1);

        // Anzeige als Icon
        const scoreDisplay = modal.querySelector(
          ".gp-prompt-box.optimized .number-display",
        );
        if (scoreDisplay) {
          // vorherigen Inhalt löschen
          scoreDisplay.innerHTML = "";

          // Flex-Container für die Icons nebeneinander
          const iconContainer = document.createElement("div");
          iconContainer.style.display = "flex";
          iconContainer.style.alignItems = "flex-end";
          iconContainer.style.gap = "12px"; // Abstand zwischen Icons

          // Punkte-Icon mit Text
          const pointsWrapper = document.createElement("div");
          pointsWrapper.style.display = "flex";
          pointsWrapper.style.flexDirection = "column";
          pointsWrapper.style.alignItems = "center";

          const pointsIcon = document.createElement("img");
          const iconScore = Math.max(1, Math.min(4, Number(points) || 1));
          pointsIcon.src = this.safeRuntimeGetUrl(
            `assets/score/score${iconScore}.webp`,
          );
          Object.assign(pointsIcon.style, {
            width: "60px",
            height: "60px",
            borderRadius: "20px",

            boxShadow: "0 2px 6px rgba(0,0,0,0.25)",
          });

          const pointsText = document.createElement("div");
          pointsText.textContent = `+${points} Points`;
          pointsText.style.fontSize = "12px";
          pointsText.style.color = "#666";
          pointsText.style.marginTop = "4px";

          pointsWrapper.appendChild(pointsIcon);
          pointsWrapper.appendChild(pointsText);
          iconContainer.appendChild(pointsWrapper);

          // Level-Up Icon mit Text, falls levelUp true
          if (levelUp) {
            const levelWrapper = document.createElement("div");
            levelWrapper.style.display = "flex";
            levelWrapper.style.flexDirection = "column";
            levelWrapper.style.alignItems = "center";

            const levelIcon = document.createElement("img");
            levelIcon.src = this.safeRuntimeGetUrl("assets/ui/levelUp.webp");
            Object.assign(levelIcon.style, {
              width: "60px",
              height: "60px",
              borderRadius: "20px",

              boxShadow: "0 2px 6px rgba(0,0,0,0.25)",
            });

            const levelText = document.createElement("div");
            levelText.textContent = `Level ${nextLevel}`;
            levelText.style.fontSize = "12px";
            levelText.style.color = "#666";
            levelText.style.marginTop = "4px";

            levelWrapper.appendChild(levelIcon);
            levelWrapper.appendChild(levelText);
            iconContainer.appendChild(levelWrapper);
          }

          // Icons in scoreDisplay einfügen
          scoreDisplay.appendChild(iconContainer);
        }

        // Update Nudging Impact Text
        if (this.config.modules.nudging) {
          const impactText = modal.querySelector(".nudging-impact-text");

          if (impactText) {
            impactText.textContent =
              `Super! Durch die Wahl des optimierten Prompts sparst du ca. ` +
              `${this.formatCo2(impact.co2Saved)} CO2 und ${this.formatWaterMl(impact.waterSaved)} ml Wasser.`;
          }
        }
      }

      const dedupeButton = modal.querySelector(
        '[data-action="remove-duplicates"]',
      );
      if (dedupeButton && duplicateInfo && duplicateInfo.duplicateCount > 0) {
        const optimizedWithoutDedupe = String(activeOptimized || "");
        const dedupedOptimized = this.removeDuplicateSentences(
          optimizedWithoutDedupe,
        );
        const canApplyDedupe =
          Boolean(dedupedOptimized) &&
          dedupedOptimized !== optimizedWithoutDedupe;
        let dedupeApplied = false;

        dedupeButton.addEventListener("click", () => {
          const statusEl = modal.querySelector(".gp-duplicate-status");

          if (!canApplyDedupe) {
            if (statusEl) {
              statusEl.textContent = "No removable duplicates left.";
            }
            return;
          }

          if (!dedupeApplied) {
            activeOptimized = dedupedOptimized;
            dedupeApplied = true;
            dedupeButton.textContent = "Revert changes";

            this.logStudyEvent("optimized_prompt_deduplicated", {
              originalLength: String(original || "").length,
              previousOptimizedLength: String(optimizedWithoutDedupe || "")
                .length,
              deduplicatedLength: String(activeOptimized || "").length,
              promptSessionId,
            });

            if (promptSessionId && this.logger?.updatePromptFlow) {
              this.logger.updatePromptFlow(promptSessionId, {
                duplicateRemovalUsed: true,
                optimizationStep: {
                  stepType: "dedupe_applied",
                  selectedLengthOption: selectedLength,
                  optimizedPrompt: activeOptimized,
                  optimizedWordCount: this.estimateWords(activeOptimized || ""),
                  optimizedTokenEstimate: this.estimateTokens(
                    activeOptimized || "",
                  ),
                },
              });
            }

            if (statusEl) {
              statusEl.textContent =
                "Duplicates removed from optimized prompt.";
            }
          } else {
            activeOptimized = optimizedWithoutDedupe;
            dedupeApplied = false;
            dedupeButton.textContent = "Remove duplicate text";

            this.logStudyEvent("optimized_prompt_deduplication_reverted", {
              originalLength: String(original || "").length,
              restoredOptimizedLength: String(activeOptimized || "").length,
              promptSessionId,
            });

            if (statusEl) {
              statusEl.textContent = "Duplicate removal reverted.";
            }

            if (promptSessionId && this.logger?.updatePromptFlow) {
              this.logger.updatePromptFlow(promptSessionId, {
                optimizationStep: {
                  stepType: "dedupe_reverted",
                  selectedLengthOption: selectedLength,
                  optimizedPrompt: activeOptimized,
                  optimizedWordCount: this.estimateWords(activeOptimized || ""),
                  optimizedTokenEstimate: this.estimateTokens(
                    activeOptimized || "",
                  ),
                },
              });
            }
          }

          const optimizedContent = modal.querySelector(".gp-optimized-content");
          if (optimizedContent) {
            if (this.config.modules.showDiff) {
              optimizedContent.innerHTML = this.generateDiffHtml(
                original,
                activeOptimized,
              );
            } else {
              optimizedContent.textContent = activeOptimized;
            }
          }

          updatePoints.call(this);
        });
      }

      //  aktiviere Default -> wenn dudging ("1 sentences")
      if (this.config.modules.nudging) {
        const defaultOption = modal.querySelector(
          '.length-option[data-length="1"]',
        );
        if (defaultOption) defaultOption.classList.add("active");
      }
      updatePoints.call(this);
      // Action buttons
      modal
        .querySelector('[data-action="reject"]')
        .addEventListener("click", () => {
          this.handleReject(original, promptSessionId, {
            decisionMethod: "button_click",
            finalLengthOption: selectedLength,
            optimizedPrompt: activeOptimized,
            dwellMs: Date.now() - modalOpenedAt,
          });
          overlay.remove();
        });

      modal
        .querySelector('[data-action="edit"]')
        .addEventListener("click", () => {
          this.handleEdit(activeOptimized, promptSessionId, {
            decisionMethod: "button_click",
            finalLengthOption: selectedLength,
            originalPrompt: original,
            dwellMs: Date.now() - modalOpenedAt,
          });
          overlay.remove();
        });

      modal
        .querySelector('[data-action="accept"]')
        .addEventListener("click", () => {
          this.handleAccept(
            original,
            activeOptimized,
            selectedLength,
            promptSessionId,
            {
              decisionMethod: "button_click",
              dwellMs: Date.now() - modalOpenedAt,
            },
          );
          overlay.remove();
        });

      const acceptByEnterHandler = (event) => {
        if (!overlay.isConnected) {
          document.removeEventListener("keydown", acceptByEnterHandler, true);
          return;
        }

        if (event.key !== "Enter" || event.shiftKey) {
          return;
        }

        const activeElement = document.activeElement;
        const isTextInputInModal =
          modal.contains(activeElement) &&
          activeElement &&
          (activeElement.tagName === "INPUT" ||
            activeElement.tagName === "TEXTAREA" ||
            activeElement.isContentEditable);

        if (isTextInputInModal) {
          return;
        }

        event.preventDefault();
        event.stopPropagation();
        if (typeof event.stopImmediatePropagation === "function") {
          event.stopImmediatePropagation();
        }

        this.handleAccept(
          original,
          activeOptimized,
          selectedLength,
          promptSessionId,
          {
            decisionMethod: "enter_key",
            dwellMs: Date.now() - modalOpenedAt,
          },
        );
        overlay.remove();
        document.removeEventListener("keydown", acceptByEnterHandler, true);
      };

      document.addEventListener("keydown", acceptByEnterHandler, true);
    }

    /**
     * Handle rejection of optimized prompt
     */
    handleReject(original, promptSessionId = null, context = {}) {
      console.log("[GreenPrompt] User kept original prompt");

      this.logStudyEvent("optimization_rejected", {
        originalLength: String(original || "").length,
        promptSessionId,
        decisionMethod: context.decisionMethod || null,
        dwellMs: Number(context.dwellMs) || null,
      });

      if (promptSessionId && this.logger?.finishPromptFlow) {
        this.logger.finishPromptFlow(promptSessionId, {
          action: "reject",
          decisionMethod: context.decisionMethod || "button_click",
          finalLengthOption: context.finalLengthOption || null,
          originalPrompt: original,
          optimizedPrompt: context.optimizedPrompt || "",
        });

        if (
          this.pendingEditedPromptFlow &&
          this.pendingEditedPromptFlow.promptSessionId === promptSessionId
        ) {
          this.pendingEditedPromptFlow = null;
        }
      }

      if (this.config.modules.gamification) {
        this.stats.treeHealth = Math.max(0, this.stats.treeHealth - 5);
        this.saveStats();
      }

      this.submitToChat(original);
    }

    /**
     * Handle edit action
     */
    handleEdit(optimized, promptSessionId = null, context = {}) {
      console.log("[GreenPrompt] User chose to edit");

      this.logStudyEvent("optimization_edit_selected", {
        optimizedLength: String(optimized || "").length,
        promptSessionId,
        decisionMethod: context.decisionMethod || null,
        dwellMs: Number(context.dwellMs) || null,
      });

      if (promptSessionId && this.logger?.updatePromptFlow) {
        this.logger.updatePromptFlow(promptSessionId, {
          action: "edit_pending",
          decisionMethod: context.decisionMethod || "button_click",
          selectedLengthOption: context.finalLengthOption || null,
          optimizationStep: {
            stepType: "edit_selected",
            selectedLengthOption: context.finalLengthOption || null,
            optimizedPrompt: optimized,
            optimizedWordCount: this.estimateWords(optimized || ""),
            optimizedTokenEstimate: this.estimateTokens(optimized || ""),
            meta: {
              dwellMs: Number(context.dwellMs) || null,
            },
          },
        });

        this.pendingEditedPromptFlow = {
          promptSessionId,
          originalPrompt: context.originalPrompt || "",
        };
      }

      if (this.textarea) {
        // Handle both textarea and contenteditable elements
        if (this.textarea.value !== undefined) {
          this.textarea.value = optimized;
        } else if (this.textarea.isContentEditable) {
          this.textarea.innerText = optimized;
        } else {
          this.textarea.textContent = optimized;
        }
        this.textarea.focus();

        // Trigger input event
        const inputEvent = new Event("input", { bubbles: true });
        this.textarea.dispatchEvent(inputEvent);
      }
    }

    /**
     * Handle acceptance of optimized prompt
     */
    handleAccept(
      original,
      optimized,
      lengthOption,
      promptSessionId = null,
      context = {},
    ) {
      console.log("[GreenPrompt] User accepted optimized prompt");

      // Update statistics
      this.normalizeStats();
      this.stats.optimizedPrompts += 1;

      const impact = this.calculatePromptImpact(
        original,
        optimized,
        lengthOption,
      );

      this.logStudyEvent("optimization_accepted", {
        lengthOption,
        tokenSaved: impact.tokenSaved,
        scorePoints: impact.scorePoints,
        co2Saved: impact.co2Saved,
        waterSaved: impact.waterSaved,
        energySavedWh: impact.energySavedWh,
        promptSessionId,
        decisionMethod: context.decisionMethod || null,
        dwellMs: Number(context.dwellMs) || null,
      });

      if (promptSessionId && this.logger?.finishPromptFlow) {
        this.logger.finishPromptFlow(promptSessionId, {
          action: "accept",
          decisionMethod: context.decisionMethod || "button_click",
          finalLengthOption: lengthOption,
          originalPrompt: original,
          optimizedPrompt: optimized,
          scorePoints: impact.scorePoints,
          co2Saved: impact.co2Saved,
          waterSaved: impact.waterSaved,
          energySavedWh: impact.energySavedWh,
          gamificationEnabled: Boolean(this.config.modules.gamification),
          levelAtPrompt: this.stats.level,
          scoreBefore: Number(this.stats.score) || 0,
          scoreAfter:
            (Number(this.stats.score) || 0) + (Number(impact.scorePoints) || 0),
          originalWordCount: this.estimateWords(original || ""),
          optimizedWordCount: this.estimateWords(optimized || ""),
          originalTokenEstimate: this.estimateTokens(original || ""),
          optimizedTokenEstimate: this.estimateTokens(optimized || ""),
        });

        if (
          this.pendingEditedPromptFlow &&
          this.pendingEditedPromptFlow.promptSessionId === promptSessionId
        ) {
          this.pendingEditedPromptFlow = null;
        }
      }

      this.stats.wordsSaved += impact.tokenSaved;
      this.stats.energySavedWh += impact.energySavedWh;
      this.stats.energySavedWh = this.roundTo(this.stats.energySavedWh, 6);
      this.stats.energySavedUWh = Math.round(
        this.stats.energySavedWh * 1000000,
      );
      this.stats.co2Saved += impact.co2Saved;
      this.stats.waterSaved += impact.waterSaved;

      // Gamification updates
      if (this.config.modules.gamification) {
        this.stats.treeHealth = Math.min(100, this.stats.treeHealth + 5);
        const previousLevel = this.stats.level;
        this.stats.score += impact.scorePoints;
        this.stats.level = this.computeLevelForScore(this.stats.score);

        if (
          this.stats.level > previousLevel &&
          previousLevel > 0 &&
          previousLevel % 5 === 0
        ) {
          this.showTreeSelectionPopup();
        }

        this.maybeGrantAwards();
      }

      this.saveStats();

      // Append length instruction
      let finalPrompt = optimized;
      if (lengthOption !== "full") {
        const lengthInstructions = {
          1: "Answer in 1 sentence.",
          2: "Answer in 2 sentences.",
          paragraph: "Answer in 1 paragraph.",
        };
        finalPrompt += " " + lengthInstructions[lengthOption];
      }

      this.submitToChat(finalPrompt);
    }

    /**
     * Submit prompt to ChatGPT
     */
    submitToChat(prompt) {
      console.log("[GreenPrompt] Submitting to ChatGPT:", prompt);

      // Set processing flag to prevent intercepting our own submission
      this.isProcessing = true;

      // Find fresh textarea reference
      const textarea = this.findElement(this.config.selectors.input);
      if (!textarea) {
        console.error("[GreenPrompt] Textarea not found");
        this.isProcessing = false;
        return;
      }

      // Set the value - handle both textarea and contenteditable
      if (textarea.value !== undefined) {
        textarea.value = prompt;
      } else if (textarea.isContentEditable) {
        textarea.innerText = prompt;
      } else {
        textarea.textContent = prompt;
      }

      // Focus the textarea
      textarea.focus();

      // Trigger input event to update React state
      const inputEvent = new Event("input", { bubbles: true });
      textarea.dispatchEvent(inputEvent);

      // Small delay to ensure React state updates
      setTimeout(() => {
        // Find fresh submit button reference
        const submitBtn = this.findElement(this.config.selectors.submit);

        if (submitBtn) {
          console.log("[GreenPrompt] Found submit button, clicking");

          // Click the button - our interceptor will ignore it due to isProcessing flag
          submitBtn.click();

          // Reset processing flag after submission completes
          setTimeout(() => {
            this.isProcessing = false;
          }, 1000);
        } else {
          // Fallback: Simulate Enter key
          console.log("[GreenPrompt] Simulating Enter key press");
          const enterEvent = new KeyboardEvent("keydown", {
            key: "Enter",
            code: "Enter",
            keyCode: 13,
            which: 13,
            bubbles: true,
            cancelable: true,
          });
          textarea.dispatchEvent(enterEvent);

          // Also try keyup event
          const enterUpEvent = new KeyboardEvent("keyup", {
            key: "Enter",
            code: "Enter",
            keyCode: 13,
            which: 13,
            bubbles: true,
            cancelable: true,
          });
          textarea.dispatchEvent(enterUpEvent);

          // Reset processing flag
          setTimeout(() => {
            this.isProcessing = false;
          }, 1000);
        }
      }, 150);
    }

    // Popup für neuen Baum
    /**
     * Zeigt das Level-5-Abschluss-Popup mit Baum-Auswahl
     */
    showTreeSelectionPopup() {
      const overlay = document.createElement("div");
      overlay.className = "gp-overlay";

      const modal = document.createElement("div");
      modal.className = "gp-modal";

      // Tree images (URLs your extension assets)
      const treeImages = {
        apple: this.safeRuntimeGetUrl("assets/trees/Level5_AT.webp"),
        olive: this.safeRuntimeGetUrl("assets/trees/Level5_OliveTree.webp"),
        maple: this.safeRuntimeGetUrl("assets/trees/Level5_MapleTree.webp"),
        fir: this.safeRuntimeGetUrl("assets/trees/Level5_FirTree.webp"),
      };

      modal.innerHTML = `
    <div class="gp-header">
      <h2 style="color:#333;">🎉 Congratulations!</h2>
      <button class="gp-close">×</button>
    </div>
    <div class="gp-body" style="color:#333; text-align:center;">
      <p>Your Tree is complete! Choose which tree to plant next:</p>
      <div class="tree-selection-buttons" style="display:flex; gap:20px; flex-wrap:wrap; justify-content:center; margin-top:10px;">
        ${Object.entries(treeImages)
          .map(
            ([key, url]) => `
          <button class="gp-btn tree-select-btn" data-tree="${key}" style="
            background:none;
            border:none;
            cursor:pointer;
            display:flex;
            flex-direction:column;
            align-items:center;
            gap:6px;
          ">
            <img src="${url}" alt="${key}" style="width:80px; height:80px; object-fit:cover; border-radius:50%; box-shadow:0 2px 6px rgba(0,0,0,0.2);" />
            <span style="color:#666; font-weight:500; transition: color 0.2s;">${key.charAt(0).toUpperCase() + key.slice(1)} Tree</span>
          </button>
        `,
          )
          .join("")}
      </div>
    </div>
  `;

      overlay.appendChild(modal);
      document.body.appendChild(overlay);

      // Close button
      modal
        .querySelector(".gp-close")
        .addEventListener("click", () => overlay.remove());

      // Tree selection buttons
      modal.querySelectorAll(".tree-select-btn").forEach((btn) => {
        btn.addEventListener(
          "mouseover",
          () => (btn.querySelector("span").style.color = "#333"),
        );
        btn.addEventListener(
          "mouseout",
          () => (btn.querySelector("span").style.color = "#666"),
        );
        btn.addEventListener("click", (e) => {
          const treeType = this.normalizeTreeKey(e.currentTarget.dataset.tree);
          if (!Array.isArray(this.stats.completedTrees)) {
            this.stats.completedTrees = [];
          }

          const tree = this.getCurrentTree();

          // Fertigen Baum ins Array speichern
          this.stats.completedTrees.push(tree);

          this.stats.currentTree = treeType;
          this.selectedTree = treeType;

          chrome.storage.local.set({ selectedTree: treeType }, () => {
            this.saveStats();
            overlay.remove();
          });
        });
      });
    }

    showDebugAwardPopup() {
      const overlay = document.createElement("div");
      overlay.className = "gp-overlay";

      const modal = document.createElement("div");
      modal.className = "gp-modal";

      const tree = this.getCurrentTree();
      const treeLabel = `${tree.charAt(0).toUpperCase()}${tree.slice(1)} Tree`;
      const awardsCount = Array.isArray(this.stats.awards)
        ? this.stats.awards.length
        : 0;

      modal.innerHTML = `
    <div class="gp-header">
      <h2 style="color:#333;">🏆 Award Debug</h2>
      <button class="gp-close">×</button>
    </div>
    <div class="gp-body" style="color:#333; text-align:center;">
      <p>Current Tree: <strong>${treeLabel}</strong></p>
      <p>Awards stored: <strong>${awardsCount}</strong></p>
      <div class="gp-actions" style="justify-content:center; margin-top:12px;">
        <button class="gp-btn gp-btn-accept" data-action="ok">OK</button>
      </div>
    </div>
  `;

      overlay.appendChild(modal);
      document.body.appendChild(overlay);

      const close = () => overlay.remove();
      modal.querySelector(".gp-close").addEventListener("click", close);
      modal
        .querySelector('[data-action="ok"]')
        .addEventListener("click", close);
    }

    registerDebugMessageHandlers() {
      if (this.debugMessageListenerRegistered || !chrome.runtime?.onMessage) {
        return;
      }

      chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
        if (!request || typeof request.action !== "string") {
          return;
        }

        if (request.action === "debugShowTreeSelectionPopup") {
          this.showTreeSelectionPopup();
          sendResponse({ success: true });
          return true;
        }

        if (request.action === "debugShowAwardPopup") {
          this.showDebugAwardPopup();
          sendResponse({ success: true });
          return true;
        }
      });

      this.debugMessageListenerRegistered = true;
    }

    getCurrentTree() {
      return this.normalizeTreeKey(this.selectedTree || this.stats.currentTree);
    }
  }

  // Initialize the controller
  new GreenPromptController();
})();
