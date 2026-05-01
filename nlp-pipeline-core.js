/*
 * GreenPrompt NLP Core Pipeline
 * Runs fully local and supports EN/DE with lightweight heuristics.
 */
(function (root) {
  "use strict";

  const EN_ACTION_VERBS = new Set([
    "analyze",
    "analyse",
    "explain",
    "classify",
    "summarize",
    "compare",
    "describe",
    "list",
    "create",
    "write",
    "generate",
    "show",
    "give",
    "extract",
    "identify",
    "evaluate",
    "review",
    "translate",
  ]);

  const DE_ACTION_VERBS = new Set([
    "analysiere",
    "erklaere",
    "erklare",
    "erkläre",
    "klassifiziere",
    "fasse",
    "vergleiche",
    "beschreibe",
    "liste",
    "erstelle",
    "schreibe",
    "generiere",
    "zeige",
    "gib",
    "extrahiere",
    "identifiziere",
    "bewerte",
    "uebersetze",
    "übersetze",
    "untersuche",
    "prüfe",
    "pruefe",
  ]);

  const HIGH_COMPUTE_MAP = {
    explain: "classify",
    analyze: "classify",
    analyse: "classify",
    elaborate: "summarize",
    discuss: "summarize",
    evaluate: "assess",
    interpretiere: "fasse zusammen",
    analysiere: "klassifiziere",
    analysieren: "klassifizieren",
    erlaeutere: "erklaere",
    erläutere: "erkläre",
    untersuche: "prüfe",
    bewerte: "ordne ein",
  };

  const QUOTE_PLACEHOLDER_RE = /^__QUOTED_\d+__$/;
  const WORD_RE = /^[A-Za-zÀ-ÖØ-öø-ÿ][A-Za-zÀ-ÖØ-öø-ÿ'-]*$/;

  function stripDiacritics(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  }

  function normalizeWord(value) {
    return stripDiacritics(String(value || "").toLowerCase());
  }

  function detectLanguage(text) {
    const lower = String(text || "").toLowerCase();
    let deScore = 0;
    let enScore = 0;

    if (/[äöüß]/i.test(lower)) deScore += 2;

    const deMarkers = [
      " bitte ",
      " danke",
      " vielen dank",
      " könntest",
      " koenntest",
      " analysiere",
      " erkläre",
      " erklaere",
      " beschreibe",
      " vergleiche",
      " und ",
      " der ",
      " die ",
      " das ",
    ];

    const enMarkers = [
      " please ",
      " thank you",
      " thanks",
      " could you",
      " can you",
      " explain",
      " analyze",
      " describe",
      " compare",
      " and ",
      " the ",
      " this ",
    ];

    deMarkers.forEach((m) => {
      if (lower.includes(m)) deScore += 1;
    });
    enMarkers.forEach((m) => {
      if (lower.includes(m)) enScore += 1;
    });

    return deScore > enScore ? "de" : "en";
  }

  function tokenizeSegments(text) {
    return String(text || "").match(/\s+|[^\s]+/g) || [];
  }

  function protectQuotedSections(text) {
    const quotedSections = [];
    let protectedText = String(text || "");

    protectedText = protectedText.replace(/"([^"\\]|\\.)*"/g, (m) => {
      const id = quotedSections.length;
      quotedSections.push(m);
      return `__QUOTED_${id}__`;
    });

    protectedText = protectedText.replace(/'([^'\\]|\\.)*'/g, (m) => {
      const id = quotedSections.length;
      quotedSections.push(m);
      return `__QUOTED_${id}__`;
    });

    return { protectedText, quotedSections };
  }

  function restoreQuotedSections(text, quotedSections) {
    let restored = String(text || "");
    quotedSections.forEach((q, i) => {
      restored = restored.replace(new RegExp(`__QUOTED_${i}__`, "g"), q);
    });
    return restored;
  }

  function posTag(text, language) {
    const tokens = tokenizeSegments(text);
    const tags = [];

    tokens.forEach((token) => {
      if (/^\s+$/.test(token)) return;
      if (QUOTE_PLACEHOLDER_RE.test(token)) {
        tags.push({ token, pos: "QUOTE" });
        return;
      }
      if (/^[.,!?;:()\[\]{}]+$/.test(token)) {
        tags.push({ token, pos: "PUNCT" });
        return;
      }
      if (/^\d+$/.test(token)) {
        tags.push({ token, pos: "NUM" });
        return;
      }
      if (!WORD_RE.test(token)) {
        tags.push({ token, pos: "X" });
        return;
      }

      const n = normalizeWord(token);
      const isAction =
        language === "de" ? DE_ACTION_VERBS.has(n) : EN_ACTION_VERBS.has(n);

      if (isAction) {
        tags.push({ token, pos: "VERB_ACTION" });
      } else if (/ing$/.test(n) || /en$/.test(n) || /ern$/.test(n)) {
        tags.push({ token, pos: "VERB_CANDIDATE" });
      } else if (/ly$/.test(n) || /weise$/.test(n)) {
        tags.push({ token, pos: "ADV" });
      } else {
        tags.push({ token, pos: "CONTENT" });
      }
    });

    return tags;
  }

  function buildEssentialPatterns(language) {
    if (language === "de") {
      return [
        /\b(analysiere|erkläre|erklaere|beschreibe|vergleiche|klassifiziere|liste|erstelle|schreibe|zeige|identifiziere|prüfe|pruefe|untersuche|übersetze|uebersetze)\b[^.!?]*/gi,
      ];
    }
    return [
      /\b(analyze|analyse|explain|describe|compare|classify|summarize|list|create|write|show|identify|extract|evaluate|translate)\b[^.!?]*/gi,
    ];
  }

  function detectEssentialPhrases(text, language) {
    const phrases = [];
    const patterns = buildEssentialPatterns(language);
    patterns.forEach((pattern) => {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        const phrase = String(match[0] || "").trim();
        if (phrase) phrases.push(phrase.toLowerCase());
      }
    });

    const chunkPatterns =
      language === "de"
        ? [
            /\b(schreibe|erstelle|formuliere)\b\s+(?:eine|einen|ein)?\s*(?:hoefliche[nr]?|höfliche[nr]?)?\s*(dankes(?:mail|email|brief|nachricht)|danke\s+(?:mail|email|brief|nachricht))\b/gi,
            /\b(uebersetze|übersetze)\b\s+(__QUOTED_\d+__)/gi,
            /\b(vergleiche)\b\s+[^.!?]{0,120}\b(und)\b[^.!?]{0,120}/gi,
            /\b(analysiere|beschreibe|erkläre|erklaere|klassifiziere|fasse\s+zusammen)\b\s+[^.!?]{1,120}/gi,
          ]
        : [
            /\b(write|create|compose|draft)\b\s+(?:a|an|the)?\s*(?:polite\s+)?(thank\s+you\s+(?:email|letter|note|message)|thanks\s+(?:email|letter|note|message))\b/gi,
            /\b(translate)\b\s+(__QUOTED_\d+__)/gi,
            /\b(compare)\b\s+[^.!?]{0,120}\b(and|vs\.?|versus)\b[^.!?]{0,120}/gi,
            /\b(analyze|analyse|describe|explain|classify|summarize)\b\s+[^.!?]{1,120}/gi,
          ];

    chunkPatterns.forEach((pattern) => {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        const phrase = String(match[0] || "").trim();
        if (phrase) phrases.push(phrase.toLowerCase());
      }
    });

    return Array.from(new Set(phrases));
  }

  function applyHighComputeReplacement(text) {
    let optimized = String(text || "");
    const replacedWords = [];

    Object.entries(HIGH_COMPUTE_MAP)
      .sort((a, b) => b[0].length - a[0].length)
      .forEach(([from, to]) => {
        const pattern = new RegExp(`\\b${escapeRegex(from)}\\b`, "gi");
        if (pattern.test(optimized)) {
          replacedWords.push({ from, to });
          optimized = optimized.replace(pattern, to);
        }
      });

    return { optimized, replacedWords };
  }

  function escapeRegex(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function isPhraseProtected(phrase, essentialPhrases) {
    const p = normalizeWord(phrase).replace(/\s+/g, " ").trim();
    if (!p) return false;
    return essentialPhrases.some((ep) => {
      const normalized = normalizeWord(ep).replace(/\s+/g, " ").trim();
      return normalized.includes(p) || p.includes(normalized);
    });
  }

  function applyPatternSweep(
    text,
    patterns,
    essentialPhrases,
    removedWords,
    phaseStats,
    phaseKey,
  ) {
    let optimized = String(text || "");

    let sweepChanged = true;
    while (sweepChanged) {
      sweepChanged = false;
      patterns.forEach(({ pattern, name, replaceWith }) => {
        const match = optimized.match(pattern);
        if (!match) {
          return;
        }

        const phrase = String(match[0] || "").trim();
        if (isPhraseProtected(phrase, essentialPhrases)) {
          return;
        }

        const next = optimized.replace(pattern, replaceWith || " ");
        if (next !== optimized) {
          removedWords.push(phrase || name);
          if (phaseStats && phaseKey) {
            phaseStats[phaseKey] = (phaseStats[phaseKey] || 0) + 1;
          }
          optimized = next;
          sweepChanged = true;
        }
      });
    }

    return optimized;
  }

  function stripGreetingAndClosings(
    text,
    language,
    essentialPhrases,
    removedWords,
    phaseStats,
  ) {
    const sharedPatterns = [
      {
        pattern:
          /(^|[.!?]\s+)(hello|hi\s+there|hi|hey|good morning|good afternoon|good evening)[,\s.!?]*/gi,
        name: "greeting",
        replaceWith: "$1",
      },
      {
        pattern:
          /(^|[.!?]\s+)i hope you(?:'| a)?re doing well(?: today)?[,\s.!?]*/gi,
        name: "smalltalk",
        replaceWith: "$1",
      },
      {
        pattern:
          /[,.!?\s]*(i would really appreciate it|i would appreciate it|much appreciated)[.!?\s]*$/gi,
        name: "thanks",
      },
      {
        pattern:
          /[,.!?\s]*(thank you so much in advance(?:\s+for\s+your\s+time)?|thanks so much in advance(?:\s+for\s+your\s+time)?|thank you in advance(?:\s+for\s+your\s+time)?|thanks in advance(?:\s+for\s+your\s+time)?|thank you very much|thanks very much|thank you so much|thanks so much|thank you|thanks|many thanks|thanks a lot(?:\s+for\s+your\s+reply)?)[.!?\s]*$/gi,
        name: "thanks",
      },
      {
        pattern: /[,.!?\s]*i hope you have a nice day[.!?\s]*$/gi,
        name: "smalltalk",
      },
    ];

    const dePatterns = [
      {
        pattern:
          /(^|[.!?]\s+)(hallo|guten tag|guten morgen|guten abend)[,\s.!?]*/gi,
        name: "greeting",
        replaceWith: "$1",
      },
      {
        pattern: /(^|[.!?]\s+)ich hoffe,?\s+es geht dir gut[,\s.!?]*/gi,
        name: "smalltalk",
        replaceWith: "$1",
      },
      {
        pattern:
          /[,.!?\s]*(vielen herzlichen dank(?:\s+fuer\s+deine\s+schnelle\s+antwort)?|vielen dank|danke im voraus(?:\s+fuer\s+deine\s+hilfe)?|danke fuer die muehe|danke für die mühe|danke)[.!?\s]*$/gi,
        name: "thanks",
      },
      {
        pattern:
          /(^|[.!?]\s+)(vielen herzlichen dank(?:\s+fuer\s+deine\s+schnelle\s+antwort)?|vielen dank|danke)[,\s.!?]*/gi,
        name: "thanks",
        replaceWith: "$1",
      },
      {
        pattern: /[,.!?\s]*(mach['’]s gut|waere super|wäre super)[.!?\s]*$/gi,
        name: "smalltalk",
      },
    ];

    const patterns =
      language === "de" ? sharedPatterns.concat(dePatterns) : sharedPatterns;

    return applyPatternSweep(
      text,
      patterns,
      essentialPhrases,
      removedWords,
      phaseStats,
      "greetingsClosings",
    );
  }

  function stripModalPoliteness(
    text,
    language,
    essentialPhrases,
    removedWords,
    phaseStats,
  ) {
    const sharedPatterns = [
      {
        pattern: /\b(could|can|would|will)\s+you\s+(please\s+)?/gi,
        name: "modal",
      },
      {
        pattern: /(^|[\s,;])please\s+/gi,
        name: "please",
        replaceWith: "$1",
      },
    ];

    const dePatterns = [
      {
        pattern: /\bk(?:o|ö|oe)nntest\s+du\s+mir\s+/gi,
        name: "modal",
      },
      {
        pattern: /\bk(?:o|ö|oe)nntest\s+du\s+(bitte\s+)?/gi,
        name: "modal",
      },
      {
        pattern: /\bk(?:o|ö|oe)nnen\s+sie\s+(bitte\s+)?/gi,
        name: "modal",
      },
      {
        pattern: /(^|[\s,;])bitte\s+/gi,
        name: "bitte",
        replaceWith: "$1",
      },
    ];

    const patterns =
      language === "de" ? sharedPatterns.concat(dePatterns) : sharedPatterns;

    return applyPatternSweep(
      text,
      patterns,
      essentialPhrases,
      removedWords,
      phaseStats,
      "modalPoliteness",
    );
  }

  function stripDiscourseFillers(
    text,
    language,
    essentialPhrases,
    removedWords,
    phaseStats,
  ) {
    const sharedPatterns = [
      {
        pattern: /(^|[.!?]\s+)so,?\s+/gi,
        name: "filler",
        replaceWith: "$1",
      },
      {
        pattern: /\bbasically\b[,\s]*/gi,
        name: "filler",
      },
      {
        pattern: /\bjust\b\s+/gi,
        name: "filler",
      },
    ];

    const dePatterns = [
      {
        pattern: /(^|[.!?]\s+)also,?\s+/gi,
        name: "filler",
        replaceWith: "$1",
      },
      {
        pattern: /\beigentlich\b[,\s]*/gi,
        name: "filler",
      },
      {
        pattern: /\bmal\b\s+/gi,
        name: "filler",
      },
    ];

    const patterns =
      language === "de" ? sharedPatterns.concat(dePatterns) : sharedPatterns;

    return applyPatternSweep(
      text,
      patterns,
      essentialPhrases,
      removedWords,
      phaseStats,
      "discourseFillers",
    );
  }

  function removeFillers(text, language, essentialPhrases) {
    let optimized = String(text || "");
    const removedWords = [];
    const phaseStats = {
      greetingsClosings: 0,
      modalPoliteness: 0,
      discourseFillers: 0,
    };

    // Phase 1: remove greetings and closing-only politeness shells.
    optimized = stripGreetingAndClosings(
      optimized,
      language,
      essentialPhrases,
      removedWords,
      phaseStats,
    );

    // Phase 2: remove modal/polite wrappers around actual instructions.
    optimized = stripModalPoliteness(
      optimized,
      language,
      essentialPhrases,
      removedWords,
      phaseStats,
    );

    // Phase 3: remove discourse fillers and weak hedge markers.
    optimized = stripDiscourseFillers(
      optimized,
      language,
      essentialPhrases,
      removedWords,
      phaseStats,
    );

    optimized = optimized
      .replace(/\s+/g, " ")
      .replace(/\s+([,.!?;:])/g, "$1")
      .replace(/([,.!?;:])\1+/g, "$1")
      .trim();

    return { optimized, removedWords, phaseStats };
  }

  function postRewriteGrammar(text, language) {
    let next = String(text || "");

    if (language === "en") {
      const patterns = [
        // classify/explain/summarize followed by filler preposition chains
        {
          from: /\b(classify|summarize|explain)\s+to\s+me\s+/gi,
          to: "$1 ",
        },
        {
          from: /\b(classify|summarize|explain)\s+for\s+me\s+/gi,
          to: "$1 ",
        },
        {
          from: /\bbe\s+so\s+kind\s+as\s+to\s+(classify|summarize|explain)\b/gi,
          to: "$1",
        },
        {
          from: /\bthat\s+would\s+be\s+amazing\b[,.!?\s]*/gi,
          to: "",
        },
      ];

      patterns.forEach(({ from, to }) => {
        next = next.replace(from, to);
      });
    } else {
      const patterns = [
        {
          from: /\bso\s+nett\s+sein\s+und\s+mir\s+/gi,
          to: "",
        },
        {
          from: /\bdas\s+waere\s+wirklich\s+fantastisch\b[,.!?\s]*/gi,
          to: "",
        },
      ];

      patterns.forEach(({ from, to }) => {
        next = next.replace(from, to);
      });
    }

    return next
      .replace(/\s+/g, " ")
      .replace(/\s+([,.!?;:])/g, "$1")
      .trim();
  }

  function computeContentScore(text, language) {
    const words = String(text || "")
      .toLowerCase()
      .match(/[a-zà-öø-ÿ]+/gi);

    if (!words || words.length === 0) {
      return 0;
    }

    const EN_WEAK_WORDS = new Set([
      "thanks",
      "thank",
      "reply",
      "nice",
      "day",
      "amazing",
      "there",
      "really",
      "please",
      "kind",
    ]);

    const DE_WEAK_WORDS = new Set([
      "danke",
      "vielen",
      "herzlichen",
      "antwort",
      "gut",
      "waere",
      "wäre",
      "bitte",
      "schnelle",
    ]);

    const actionSet = language === "de" ? DE_ACTION_VERBS : EN_ACTION_VERBS;
    const weakSet = language === "de" ? DE_WEAK_WORDS : EN_WEAK_WORDS;

    let score = 0;
    words.forEach((word) => {
      const normalized = normalizeWord(word);
      if (actionSet.has(normalized)) {
        score += 3;
      } else if (weakSet.has(normalized)) {
        score -= 1;
      } else if (normalized.length >= 4) {
        score += 1;
      }
    });

    return score;
  }

  function appendLengthInstruction(text, lengthOption, language) {
    const normalized = String(text || "").trim();
    if (!lengthOption || lengthOption === "full") {
      return normalized;
    }

    const instructions =
      language === "de"
        ? {
            1: "Antworte in 1 Satz.",
            2: "Antworte in 2 Saetzen.",
            paragraph: "Antworte in 1 Absatz.",
          }
        : {
            1: "Answer in 1 sentence.",
            2: "Answer in 2 sentences.",
            paragraph: "Answer in 1 paragraph.",
          };

    const suffix = instructions[lengthOption] || "";
    return suffix ? `${normalized} ${suffix}`.trim() : normalized;
  }

  function optimizePromptPipeline(inputText, options) {
    const text = String(inputText || "").trim();
    const opts = options || {};
    const language = opts.language || detectLanguage(text);

    if (!text) {
      return {
        language,
        text: "",
        isEmpty: true,
        removedWords: [],
        replacedWords: [],
        posTags: [],
        essentialPhrases: [],
      };
    }

    const protectedResult = protectQuotedSections(text);
    const protectedText = protectedResult.protectedText;

    const posTags = posTag(protectedText, language);
    const essentialPhrases = detectEssentialPhrases(protectedText, language);

    const replacementResult = applyHighComputeReplacement(protectedText);
    const afterReplace = replacementResult.optimized;

    const removedResult = removeFillers(
      afterReplace,
      language,
      essentialPhrases,
    );
    const afterFilter = postRewriteGrammar(removedResult.optimized, language);

    const restored = restoreQuotedSections(
      afterFilter,
      protectedResult.quotedSections,
    );
    const fluent = postRewriteGrammar(restored, language);
    const contentScore = computeContentScore(fluent, language);
    const isSemanticallyEmpty = !fluent.trim() || contentScore <= 0;
    const withLength = appendLengthInstruction(
      fluent,
      opts.lengthOption,
      language,
    );

    return {
      language,
      text: withLength,
      isEmpty: isSemanticallyEmpty,
      removedWords: removedResult.removedWords,
      replacedWords: replacementResult.replacedWords,
      posTags,
      essentialPhrases,
      trace: {
        step1PosTagging: posTags.length,
        step2EssentialPhrases: essentialPhrases.length,
        step3Replacements: replacementResult.replacedWords.length,
        step4RemovedFillers: removedResult.removedWords.length,
        step5IsEmpty: isSemanticallyEmpty,
        step6LengthOption: opts.lengthOption || "full",
        step7ContentScore: contentScore,
        removedGreetingClosingCount: removedResult.phaseStats.greetingsClosings,
        removedModalPolitenessCount: removedResult.phaseStats.modalPoliteness,
        removedDiscourseFillerCount: removedResult.phaseStats.discourseFillers,
      },
    };
  }

  const api = {
    detectLanguage,
    optimizePromptPipeline,
    appendLengthInstruction,
  };

  root.GreenPromptNLP = api;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof self !== "undefined" ? self : globalThis);
