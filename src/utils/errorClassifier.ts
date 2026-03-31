/**
 * Error classification utility.
 *
 * Transforms raw backend error strings into user-friendly messages with
 * actionable suggestions. Used by UI components to decide whether to show
 * a transient toast or an inline error state.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ClassifiedError {
  title: string;
  description: string;
  actionLabel?: string;
  actionRoute?: string;
  /** true = show as toast, false = show inline ErrorState component */
  isTransient: boolean;
}

// ---------------------------------------------------------------------------
// Classification rules (order matters — first match wins)
// ---------------------------------------------------------------------------

interface Rule {
  test: (msg: string) => boolean;
  classify: () => ClassifiedError;
}

const rules: Rule[] = [
  {
    test: (msg) => /not found at path/i.test(msg) || /emulator not found/i.test(msg),
    classify: () => ({
      title: "Emulator Not Found",
      description:
        "The configured emulator could not be located. Check your emulator settings.",
      actionLabel: "Open Settings",
      actionRoute: "/settings",
      isTransient: false,
    }),
  },
  {
    test: (msg) => /no emulator configured/i.test(msg),
    classify: () => ({
      title: "No Emulator Configured",
      description: "Set up an emulator for this system in Settings.",
      actionLabel: "Configure Emulator",
      actionRoute: "/settings",
      isTransient: false,
    }),
  },
  {
    test: (msg) =>
      /rom/i.test(msg) &&
      (/missing/i.test(msg) ||
        /not found/i.test(msg) ||
        /corrupt/i.test(msg) ||
        /no such file/i.test(msg)),
    classify: () => ({
      title: "ROM File Not Found",
      description: "The ROM file may have been moved or deleted.",
      isTransient: false,
    }),
  },
  {
    test: (msg) => /rate limit/i.test(msg) || /429/i.test(msg),
    classify: () => ({
      title: "API Rate Limited",
      description:
        "Too many requests. Please wait a few minutes before retrying.",
      isTransient: true,
    }),
  },
  {
    test: (msg) =>
      /network/i.test(msg) ||
      /\bconnect\b/i.test(msg) ||
      /\bdns\b/i.test(msg) ||
      /timeout/i.test(msg) ||
      /failed to fetch/i.test(msg),
    classify: () => ({
      title: "Connection Error",
      description:
        "Could not connect to the server. Check your internet connection.",
      isTransient: true,
    }),
  },
  {
    test: (msg) => /scan/i.test(msg) && (/failed/i.test(msg) || /error/i.test(msg)),
    classify: () => ({
      title: "Scan Failed",
      description: "An error occurred while scanning ROM directories.",
      isTransient: true,
    }),
  },
];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Classify a raw error string from the Rust backend into a user-friendly
 * error object with title, description, and optional action.
 */
export function classifyError(error: string): ClassifiedError {
  const msg = error ?? "";

  for (const rule of rules) {
    if (rule.test(msg)) {
      return rule.classify();
    }
  }

  // Fallback — surface the raw message but mark as transient
  return {
    title: "Something Went Wrong",
    description: msg || "An unexpected error occurred.",
    isTransient: true,
  };
}
