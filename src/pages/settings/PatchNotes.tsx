/**
 * Patch Notes — displays GitHub release history with expandable markdown notes.
 */

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { fetchGitHubReleases } from "@/services/api";
import type { GitHubRelease } from "@/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getRelativeTime(dateString: string): string {
  const now = Date.now();
  const then = new Date(dateString).getTime();
  const diffMs = now - then;

  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return "just now";

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;

  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;

  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months === 1 ? "" : "s"} ago`;

  const years = Math.floor(months / 12);
  return `${years} year${years === 1 ? "" : "s"} ago`;
}

// ---------------------------------------------------------------------------
// Animation variants
// ---------------------------------------------------------------------------

const listVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.05 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0 },
};

// ---------------------------------------------------------------------------
// Markdown class names
// ---------------------------------------------------------------------------

const markdownClassName = [
  "text-sm text-text-secondary leading-relaxed",
  "[&_h1]:text-base [&_h1]:font-bold [&_h1]:text-text-primary [&_h1]:mt-4 [&_h1]:mb-2",
  "[&_h2]:text-sm [&_h2]:font-bold [&_h2]:text-text-primary [&_h2]:mt-3 [&_h2]:mb-1.5",
  "[&_h3]:text-sm [&_h3]:font-semibold [&_h3]:text-text-primary [&_h3]:mt-2 [&_h3]:mb-1",
  "[&_p]:mb-2",
  "[&_ul]:list-disc [&_ul]:pl-5 [&_ul]:mb-2",
  "[&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:mb-2",
  "[&_li]:mb-0.5",
  "[&_a]:text-accent [&_a]:hover:text-accent-light [&_a]:underline",
  "[&_code]:bg-surface-hover [&_code]:rounded [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:text-xs [&_code]:font-mono",
  "[&_pre]:bg-surface-hover [&_pre]:rounded-lg [&_pre]:p-3 [&_pre]:mb-2 [&_pre]:overflow-x-auto",
  "[&_blockquote]:border-l-2 [&_blockquote]:border-accent/50 [&_blockquote]:pl-3 [&_blockquote]:italic [&_blockquote]:text-text-dim",
].join(" ");

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PatchNotes() {
  const [releases, setReleases] = useState<GitHubRelease[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedVersions, setExpandedVersions] = useState<Set<string>>(
    new Set(),
  );
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const data = await fetchGitHubReleases();
        if (!cancelled) setReleases(data);
      } catch (err: unknown) {
        if (!cancelled) {
          const message =
            err instanceof Error ? err.message : "Failed to fetch releases.";
          setError(message);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [retryCount]);

  function toggleVersion(tagName: string) {
    setExpandedVersions((prev) => {
      const next = new Set(prev);
      if (next.has(tagName)) {
        next.delete(tagName);
      } else {
        next.add(tagName);
      }
      return next;
    });
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div>
      <h3 className="text-lg font-bold text-text-primary">Patch Notes</h3>
      <p className="text-sm text-text-secondary mt-1">
        Release history and changelog.
      </p>

      <div
        className="mt-4 max-h-[400px] overflow-y-auto rounded-lg patch-notes-scroll"
      >
        {/* Loading skeletons */}
        {loading && (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="animate-pulse rounded-lg bg-surface-hover h-16"
              />
            ))}
          </div>
        )}

        {/* Error state */}
        {!loading && error && (
          <div className="text-center py-8">
            <p className="text-sm text-red-400">{error}</p>
            <button
              type="button"
              onClick={() => setRetryCount((c) => c + 1)}
              className="mt-2 text-xs text-accent hover:text-accent-light transition-colors"
            >
              Try Again
            </button>
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && releases.length === 0 && (
          <p className="text-sm text-text-dim text-center py-8">
            No releases found.
          </p>
        )}

        {/* Release list */}
        {!loading && !error && releases.length > 0 && (
          <motion.div
            className="space-y-3"
            variants={listVariants}
            initial="hidden"
            animate="visible"
          >
            {releases.map((release) => {
              const isExpanded = expandedVersions.has(release.tag_name);
              const displayName =
                release.name ?? release.tag_name;
              const absoluteDate = release.published_at
                ? new Date(release.published_at).toLocaleDateString(undefined, {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })
                : "";

              return (
                <motion.div
                  key={release.tag_name}
                  variants={itemVariants}
                  className="rounded-lg bg-surface border border-ghost"
                >
                  {/* Collapsed header */}
                  <button
                    type="button"
                    aria-expanded={isExpanded}
                    onClick={() => toggleVersion(release.tag_name)}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-surface-hover/50 transition-colors rounded-lg"
                  >
                    {/* Version badge */}
                    <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold border border-accent/50 bg-accent/15 text-accent">
                      {release.tag_name}
                    </span>

                    {/* Pre-release badge */}
                    {release.prerelease && (
                      <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold border border-amber-500/50 bg-amber-500/15 text-amber-400">
                        Pre-release
                      </span>
                    )}

                    {/* Release name */}
                    <span className="text-sm font-medium text-text-primary truncate flex-1">
                      {displayName}
                    </span>

                    {/* Date */}
                    {release.published_at && (
                      <span
                        className="text-xs text-text-dim shrink-0"
                        title={absoluteDate}
                      >
                        {getRelativeTime(release.published_at)}
                      </span>
                    )}

                    {/* Chevron */}
                    <motion.svg
                      width={16}
                      height={16}
                      viewBox="0 0 16 16"
                      fill="none"
                      className="shrink-0 text-text-dim"
                      animate={{ rotate: isExpanded ? 180 : 0 }}
                      transition={{ duration: 0.25, ease: "easeInOut" }}
                    >
                      <path
                        d="M4 6l4 4 4-4"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </motion.svg>
                  </button>

                  {/* Expanded content */}
                  <AnimatePresence initial={false}>
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.25, ease: "easeInOut" }}
                        className="overflow-hidden"
                      >
                        <div className="px-4 pb-4 border-t border-ghost">
                          {release.body ? (
                            <div className={`mt-3 ${markdownClassName}`}>
                              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                {release.body}
                              </ReactMarkdown>
                            </div>
                          ) : (
                            <p className="mt-3 text-sm text-text-dim italic">
                              No release notes provided.
                            </p>
                          )}

                          <a
                            href={release.html_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-3 inline-flex items-center gap-1 text-xs text-accent hover:text-accent-light transition-colors"
                          >
                            View on GitHub
                            <svg
                              width={12}
                              height={12}
                              viewBox="0 0 12 12"
                              fill="none"
                              className="opacity-70"
                            >
                              <path
                                d="M3.5 8.5l5-5M8.5 3.5H4.5M8.5 3.5v4"
                                stroke="currentColor"
                                strokeWidth="1.2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                          </a>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })}
          </motion.div>
        )}
      </div>

      {/* Scoped scrollbar styles */}
      <style>{`
        .patch-notes-scroll::-webkit-scrollbar {
          width: 6px;
        }
        .patch-notes-scroll::-webkit-scrollbar-track {
          background: transparent;
        }
        .patch-notes-scroll::-webkit-scrollbar-thumb {
          background: var(--accent, rgba(99, 102, 241, 0.3));
          opacity: 0.3;
          border-radius: 3px;
        }
        .patch-notes-scroll::-webkit-scrollbar-thumb:hover {
          opacity: 0.5;
        }
        .patch-notes-scroll {
          scrollbar-width: thin;
          scrollbar-color: color-mix(in srgb, var(--accent, #6366f1) 30%, transparent) transparent;
        }
      `}</style>
    </div>
  );
}
