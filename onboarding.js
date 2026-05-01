/*
 * GreenPrompt Onboarding Helper
 * Centralizes smart UUID parsing and participant group assignment.
 */

(function (globalScope) {
  "use strict";

  const VALID_GROUP_CODES = new Set(["BA", "DN", "GF", "FU"]);

  function normalizeUuidInput(uuidInput) {
    return String(uuidInput || "")
      .replace(/\s+/g, "")
      .toUpperCase();
  }

  function extractGroupCode(uuid) {
    const parts = String(uuid || "")
      .split("-")
      .filter(Boolean);
    if (!parts.length) {
      return "";
    }
    return String(parts[parts.length - 1] || "").toUpperCase();
  }

  function isBaseUuidPatternValid(normalizedUuid) {
    const value = String(normalizedUuid || "");
    const lastDash = value.lastIndexOf("-");
    if (lastDash <= 0) {
      return false;
    }

    const base = value.slice(0, lastDash);
    if (!base) {
      return false;
    }

    const uuidV4Pattern =
      /^[0-9A-F]{8}-[0-9A-F]{4}-4[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/;
    const simplePattern = /^[0-9A-F]{4}(?:-[0-9A-F]{4}){3}$/;

    if (uuidV4Pattern.test(base) || simplePattern.test(base)) {
      return true;
    }

    // Fallback: allow broader smart-ID stems while still enforcing clean characters.
    return /^[0-9A-Z-]{4,}$/.test(base);
  }

  function resolveModulesByGroupCode(groupCode) {
    const normalizedGroup = String(groupCode || "").toUpperCase();

    if (normalizedGroup === "DN") {
      return { nudging: true, gamification: false, showDiff: true };
    }

    if (normalizedGroup === "GF") {
      return { nudging: false, gamification: true, showDiff: true };
    }

    if (normalizedGroup === "FU") {
      return { nudging: true, gamification: true, showDiff: true };
    }

    // BA and fallback behavior both map to baseline mode.
    return { nudging: false, gamification: false, showDiff: true };
  }

  function validateParticipantUuid(uuidInput) {
    const uuid = normalizeUuidInput(uuidInput);

    if (!uuid) {
      return {
        valid: false,
        reason: "empty",
        message: "Teilnehmer-ID fehlt.",
      };
    }

    const groupCode = extractGroupCode(uuid);
    if (!VALID_GROUP_CODES.has(groupCode)) {
      return {
        valid: false,
        reason: "invalid_group_code",
        message: "Ungueltiger Gruppencode. Erlaubt: BA, DN, GF, FU.",
      };
    }

    if (!isBaseUuidPatternValid(uuid)) {
      return {
        valid: false,
        reason: "invalid_uuid_format",
        message: "Ungueltiges UUID-Format.",
      };
    }

    return {
      valid: true,
      uuid,
      groupCode,
    };
  }

  function resolveModulesFromUuid(uuidInput, fallbackModules) {
    const validation = validateParticipantUuid(uuidInput);
    if (!validation.valid) {
      return fallbackModules || resolveModulesByGroupCode("BA");
    }

    return resolveModulesByGroupCode(validation.groupCode);
  }

  function processOnboarding(uuidInput) {
    return new Promise((resolve) => {
      const validation = validateParticipantUuid(uuidInput);
      if (!validation.valid) {
        resolve({
          success: false,
          error: validation.message,
          reason: validation.reason,
        });
        return;
      }

      const modules = resolveModulesByGroupCode(validation.groupCode);

      chrome.storage.local.get(["config", "studyStartTime"], (result) => {
        const config =
          result && result.config && typeof result.config === "object"
            ? result.config
            : {};

        const nextConfig = {
          ...config,
          modules,
          stats:
            config.stats && typeof config.stats === "object"
              ? config.stats
              : {},
        };

        const payload = {
          participantUUID: validation.uuid,
          participantGroupCode: validation.groupCode,
          nudging: modules.nudging,
          gamification: modules.gamification,
          onboardingCompleted: true,
          studyStartTime: result.studyStartTime || new Date().toISOString(),
          config: nextConfig,
        };

        chrome.storage.local.set(payload, () => {
          resolve({
            success: true,
            participantUUID: validation.uuid,
            groupCode: validation.groupCode,
            modules,
            payload,
          });
        });
      });
    });
  }

  globalScope.GreenPromptOnboarding = {
    normalizeUuidInput,
    extractGroupCode,
    validateParticipantUuid,
    resolveModulesByGroupCode,
    resolveModulesFromUuid,
    processOnboarding,
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
