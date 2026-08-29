"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { decodeCaptureHash } from "@bookmark-platform/capture";
import type { Bookmark } from "@bookmark-platform/domain";
import {
  BookmarkLocalDatabase,
  IndexedDbBookmarkRepository,
  IndexedDbLocalLibrary,
} from "@bookmark-platform/storage-indexeddb";

import {
  collectionLabel,
  collections,
  createBookmarkFromDraft,
  draftForBookmark,
  emptyBookmarkDraft,
  type BookmarkDraft,
  type CollectionId,
  updateBookmarkFromDraft,
} from "./library-model";

type LibraryView = "library" | "trash";
type CollectionFilter = "all" | CollectionId;

interface LocalRuntime {
  database: BookmarkLocalDatabase;
  deviceId: string;
  library: IndexedDbLocalLibrary;
  repository: IndexedDbBookmarkRepository;
}

const weekWindowStart = new Date(
  Date.now() - 7 * 24 * 60 * 60 * 1_000,
).toISOString();

function relativeDate(value: string): string {
  const timestamp = new Date(value).getTime();
  const delta = Date.now() - timestamp;
  if (delta < 60_000) return "Just now";
  if (delta < 3_600_000) return `${Math.floor(delta / 60_000)}m ago`;
  if (delta < 86_400_000) return `${Math.floor(delta / 3_600_000)}h ago`;
  return new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "short",
  }).format(new Date(value));
}

function hostInitial(source: string): string {
  return source.charAt(0).toLocaleUpperCase();
}

export default function LibraryApp() {
  const runtimeRef = useRef<LocalRuntime | null>(null);
  const captureHandledRef = useRef(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [allActiveBookmarks, setAllActiveBookmarks] = useState<Bookmark[]>([]);
  const [deletedCount, setDeletedCount] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [composerNotice, setComposerNotice] = useState("");
  const [search, setSearch] = useState("");
  const [view, setView] = useState<LibraryView>("library");
  const [collectionFilter, setCollectionFilter] =
    useState<CollectionFilter>("all");
  const [online, setOnline] = useState(true);
  const [composerOpen, setComposerOpen] = useState(false);
  const [editing, setEditing] = useState<Bookmark | null>(null);
  const [draft, setDraft] = useState<BookmarkDraft>(emptyBookmarkDraft);

  const refresh = useCallback(async () => {
    const runtime = runtimeRef.current;
    if (!runtime) return;

    const [activePage, allPage, searchedPage, pending] = await Promise.all([
      runtime.repository.list({ search, limit: 200 }),
      runtime.repository.list({ includeDeleted: true, limit: 200 }),
      runtime.repository.list({ includeDeleted: true, search, limit: 200 }),
      runtime.library.pendingOperationCount(),
    ]);
    const deleted = searchedPage.items.filter(
      (bookmark) => bookmark.deletedAt !== undefined,
    );
    const filteredActive = activePage.items.filter((bookmark) => {
      if (collectionFilter === "all") return true;
      if (collectionFilter === "inbox") return bookmark.projectId === undefined;
      return bookmark.projectId === collectionFilter;
    });

    setBookmarks(view === "trash" ? deleted : filteredActive);
    setAllActiveBookmarks(
      allPage.items.filter((bookmark) => bookmark.deletedAt === undefined),
    );
    setDeletedCount(
      allPage.items.filter((bookmark) => bookmark.deletedAt !== undefined)
        .length,
    );
    setPendingCount(pending);
  }, [collectionFilter, search, view]);

  useEffect(() => {
    let cancelled = false;
    const database = new BookmarkLocalDatabase();
    const repository = new IndexedDbBookmarkRepository(database);
    const library = new IndexedDbLocalLibrary(database);

    void (async () => {
      try {
        await database.open();
        const deviceId = await library.getOrCreateDeviceId();
        if (cancelled) return;
        runtimeRef.current = { database, repository, library, deviceId };
        setReady(true);
      } catch (initializationError) {
        setError(
          initializationError instanceof Error
            ? initializationError.message
            : "The local library could not be opened.",
        );
      }
    })();

    return () => {
      cancelled = true;
      runtimeRef.current = null;
      database.close();
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    void refresh();
  }, [ready, refresh]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!ready || !runtime || captureHandledRef.current) return;
    captureHandledRef.current = true;

    let cancelled = false;

    void (async () => {
      let capture;
      try {
        capture = decodeCaptureHash(window.location.hash);
      } catch {
        window.history.replaceState(
          null,
          "",
          `${window.location.pathname}${window.location.search}`,
        );
        setError(
          "The Quick Save request was invalid. Open the extension settings and check your library address.",
        );
        return;
      }
      if (!capture || cancelled) return;

      window.history.replaceState(
        null,
        "",
        `${window.location.pathname}${window.location.search}`,
      );

      const captureDraft: BookmarkDraft = {
        collection: capture.collection,
        notes: "",
        tags: "",
        title: capture.title,
        url: capture.url,
      };

      try {
        const candidate = createBookmarkFromDraft(captureDraft, {
          id: crypto.randomUUID(),
          now: new Date().toISOString(),
        });
        const duplicate = await runtime.repository.getByCanonicalUrl(
          candidate.canonicalUrl,
        );
        if (cancelled) return;

        setError("");
        setNotice("");
        if (duplicate && duplicate.deletedAt === undefined) {
          setEditing(duplicate);
          setDraft(draftForBookmark(duplicate));
          setComposerNotice(
            "This page is already saved. You can update its collection, tags or notes.",
          );
        } else {
          setEditing(null);
          setDraft(captureDraft);
          setComposerNotice(
            duplicate
              ? "This page is in trash. Confirm to restore it to your library."
              : "Sent from the browser extension. Review the details, then confirm the save.",
          );
        }
        setComposerOpen(true);
      } catch {
        if (!cancelled) {
          setError(
            "The page sent by Quick Save could not be prepared for your library.",
          );
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [ready]);

  useEffect(() => {
    const updateConnection = () => setOnline(navigator.onLine);
    updateConnection();
    window.addEventListener("online", updateConnection);
    window.addEventListener("offline", updateConnection);
    return () => {
      window.removeEventListener("online", updateConnection);
      window.removeEventListener("offline", updateConnection);
    };
  }, []);

  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    void navigator.serviceWorker.register("/sw.js");
  }, []);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchInputRef.current?.focus();
      }
      if (event.key === "Escape" && composerOpen && !busy) {
        setComposerOpen(false);
        setEditing(null);
        setDraft(emptyBookmarkDraft);
        setComposerNotice("");
      }
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [busy, composerOpen]);

  const savedThisWeek = useMemo(() => {
    return allActiveBookmarks.filter(
      (bookmark) => bookmark.savedAt >= weekWindowStart,
    ).length;
  }, [allActiveBookmarks]);

  const activeCollectionLabel = useMemo(() => {
    if (collectionFilter === "all") return "Your library";
    return (
      collections.find((collection) => collection.id === collectionFilter)
        ?.label ?? "Your library"
    );
  }, [collectionFilter]);

  function openComposer(bookmark?: Bookmark) {
    setError("");
    setNotice("");
    setComposerNotice("");
    setEditing(bookmark ?? null);
    setDraft(bookmark ? draftForBookmark(bookmark) : emptyBookmarkDraft);
    setComposerOpen(true);
  }

  function closeComposer() {
    if (busy) return;
    setComposerOpen(false);
    setEditing(null);
    setDraft(emptyBookmarkDraft);
    setComposerNotice("");
  }

  async function saveDraft() {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    setBusy(true);
    setError("");
    setNotice("");

    try {
      const now = new Date().toISOString();
      if (editing) {
        const updated = updateBookmarkFromDraft(editing, draft, now);
        await runtime.library.save(updated, runtime.deviceId);
        setNotice("Changes saved locally.");
      } else {
        const bookmark = createBookmarkFromDraft(draft, {
          id: crypto.randomUUID(),
          now,
        });
        const duplicate = await runtime.repository.getByCanonicalUrl(
          bookmark.canonicalUrl,
        );
        if (duplicate) {
          if (duplicate.deletedAt === undefined) {
            throw new Error("This page is already in your library.");
          }
          const restored = await runtime.library.restore(
            duplicate.id,
            runtime.deviceId,
            now,
          );
          if (restored) {
            await runtime.library.save(
              updateBookmarkFromDraft(
                restored.bookmark,
                { ...draft, title: bookmark.title },
                now,
              ),
              runtime.deviceId,
            );
            setNotice("Restored from trash and saved locally.");
          }
        } else {
          await runtime.library.save(bookmark, runtime.deviceId);
          setNotice(
            online ? "Saved locally." : "Saved offline on this device.",
          );
        }
      }

      setComposerOpen(false);
      setEditing(null);
      setDraft(emptyBookmarkDraft);
      setComposerNotice("");
      await refresh();
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "The bookmark could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function moveToTrash(bookmark: Bookmark) {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    setBusy(true);
    setError("");
    try {
      await runtime.library.softDelete(bookmark.id, runtime.deviceId);
      setNotice("Moved to trash. You can restore it anytime.");
      setComposerOpen(false);
      setEditing(null);
      await refresh();
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "The bookmark could not be moved to trash.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function restoreBookmark(bookmark: Bookmark) {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    setBusy(true);
    setError("");
    try {
      await runtime.library.restore(bookmark.id, runtime.deviceId);
      setNotice("Bookmark restored to your library.");
      await refresh();
    } catch (restoreError) {
      setError(
        restoreError instanceof Error
          ? restoreError.message
          : "The bookmark could not be restored.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">B</span>
          <span>
            Bookmark
            <strong>Intelligence</strong>
          </span>
        </div>

        <nav aria-label="Library navigation">
          <button
            className={
              view === "library" && collectionFilter === "all"
                ? "nav-item active"
                : "nav-item"
            }
            onClick={() => {
              setView("library");
              setCollectionFilter("all");
            }}
            type="button"
          >
            <span className="nav-icon">⌂</span>
            Library
            <span className="nav-count">{allActiveBookmarks.length}</span>
          </button>
          {collections.map((collection) => (
            <button
              className={
                view === "library" && collectionFilter === collection.id
                  ? "nav-item collection-link active"
                  : "nav-item collection-link"
              }
              key={collection.id}
              onClick={() => {
                setView("library");
                setCollectionFilter(collection.id);
              }}
              type="button"
            >
              <span className="collection-dot" />
              {collection.label}
            </button>
          ))}
          <button
            className={view === "trash" ? "nav-item active" : "nav-item"}
            onClick={() => setView("trash")}
            type="button"
          >
            <span className="nav-icon">⌫</span>
            Trash
            <span className="nav-count">{deletedCount}</span>
          </button>
        </nav>

        <div className="local-status">
          <span className={online ? "status-dot online" : "status-dot"} />
          <div>
            <strong>
              {online ? "Local library ready" : "Working offline"}
            </strong>
            <span>{pendingCount} changes safely queued</span>
          </div>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <label className="search-box">
            <span>⌕</span>
            <input
              aria-label="Search your library"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search titles, notes and tags"
              ref={searchInputRef}
              type="search"
              value={search}
            />
            <kbd>⌘ K</kbd>
          </label>
          <button
            className="primary-button"
            disabled={!ready}
            onClick={() => openComposer()}
            type="button"
          >
            <span>＋</span> Save a page
          </button>
        </header>

        <div className="workspace-inner">
          <section className="hero-row">
            <div>
              <p className="eyebrow">Your private knowledge space</p>
              <h1>
                {view === "trash" ? "Recently deleted" : activeCollectionLabel}
              </h1>
              <p className="intro">
                {view === "trash"
                  ? "Restore anything you removed by mistake."
                  : "Everything you save stays available on this device, even offline."}
              </p>
            </div>
            <div className="privacy-pill">
              <span>◆</span>
              <div>
                <strong>Private by default</strong>
                <small>Nothing leaves this device</small>
              </div>
            </div>
          </section>

          {view === "library" && (
            <section className="stats" aria-label="Library overview">
              <article>
                <span>Saved this week</span>
                <strong>{savedThisWeek}</strong>
                <small>Ready when you are</small>
              </article>
              <article>
                <span>In your library</span>
                <strong>{allActiveBookmarks.length}</strong>
                <small>Stored locally</small>
              </article>
              <article>
                <span>Recovery queue</span>
                <strong>{pendingCount}</strong>
                <small>Durable local changes</small>
              </article>
            </section>
          )}

          {(notice || (error && !composerOpen)) && (
            <div className={error ? "message error" : "message success"}>
              {error || notice}
              <button
                aria-label="Dismiss message"
                onClick={() => {
                  setError("");
                  setNotice("");
                }}
                type="button"
              >
                ×
              </button>
            </div>
          )}

          <section className="library-section">
            <div className="section-heading">
              <div>
                <p className="eyebrow">
                  {search ? `Results for “${search}”` : "Recently saved"}
                </p>
                <h2>
                  {bookmarks.length === 0
                    ? view === "trash"
                      ? "Trash is empty"
                      : "Start your library"
                    : `${bookmarks.length} ${bookmarks.length === 1 ? "item" : "items"}`}
                </h2>
              </div>
            </div>

            {!ready ? (
              <div className="empty-state">
                <span className="empty-symbol">B</span>
                <h3>Opening your local library…</h3>
              </div>
            ) : bookmarks.length === 0 ? (
              <div className="empty-state">
                <span className="empty-symbol">＋</span>
                <h3>
                  {view === "trash"
                    ? "Nothing needs recovering"
                    : search
                      ? "No bookmarks match your search"
                      : "Save the first page you want to remember"}
                </h3>
                <p>
                  {view === "trash"
                    ? "Deleted bookmarks will appear here."
                    : "Add a URL, collection and tags. It will still be here after a restart."}
                </p>
                {view === "library" && !search && (
                  <button
                    className="secondary-button"
                    onClick={() => openComposer()}
                    type="button"
                  >
                    Save your first page
                  </button>
                )}
              </div>
            ) : (
              <div className="bookmark-grid">
                {bookmarks.map((bookmark) => (
                  <article className="bookmark-card" key={bookmark.id}>
                    <div className={`card-visual type-${bookmark.contentType}`}>
                      <span className="source-initial">
                        {hostInitial(bookmark.source)}
                      </span>
                      <span className="content-type">
                        {bookmark.contentType}
                      </span>
                    </div>
                    <div className="card-content">
                      <div className="card-source">
                        <span>{bookmark.source}</span>
                        {view === "library" && (
                          <button
                            aria-label={`Organize ${bookmark.title}`}
                            onClick={() => openComposer(bookmark)}
                            type="button"
                          >
                            •••
                          </button>
                        )}
                      </div>
                      <h3>{bookmark.title}</h3>
                      {bookmark.notes && (
                        <p className="card-notes">{bookmark.notes}</p>
                      )}
                      {bookmark.tags.length > 0 && (
                        <div className="tag-row">
                          {bookmark.tags.slice(0, 3).map((tag) => (
                            <span key={tag}>#{tag}</span>
                          ))}
                        </div>
                      )}
                      <div className="card-meta">
                        <span>{collectionLabel(bookmark)}</span>
                        <span>·</span>
                        <time dateTime={bookmark.savedAt}>
                          {relativeDate(bookmark.savedAt)}
                        </time>
                      </div>
                      {view === "trash" && (
                        <button
                          className="restore-button"
                          disabled={busy}
                          onClick={() => void restoreBookmark(bookmark)}
                          type="button"
                        >
                          Restore to library
                        </button>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      </section>

      {composerOpen && (
        <div className="dialog-backdrop" role="presentation">
          <section
            aria-labelledby="composer-title"
            aria-modal="true"
            className="composer"
            role="dialog"
          >
            <div className="composer-header">
              <div>
                <p className="eyebrow">Saved on this device</p>
                <h2 id="composer-title">
                  {editing ? "Organize bookmark" : "Save a page"}
                </h2>
              </div>
              <button
                aria-label="Close"
                className="close-button"
                onClick={closeComposer}
                type="button"
              >
                ×
              </button>
            </div>

            <div className="form-grid">
              <label className="field full-width">
                <span>Web address</span>
                <input
                  autoFocus={!editing}
                  disabled={Boolean(editing)}
                  onChange={(event) =>
                    setDraft({ ...draft, url: event.target.value })
                  }
                  placeholder="https://example.com/article"
                  required
                  type="url"
                  value={draft.url}
                />
              </label>
              <label className="field full-width">
                <span>Title</span>
                <input
                  onChange={(event) =>
                    setDraft({ ...draft, title: event.target.value })
                  }
                  placeholder="Leave blank to create one from the URL"
                  required={Boolean(editing)}
                  value={draft.title}
                />
              </label>
              <label className="field">
                <span>Collection</span>
                <select
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      collection: event.target.value as CollectionId,
                    })
                  }
                  value={draft.collection}
                >
                  {collections.map((collection) => (
                    <option key={collection.id} value={collection.id}>
                      {collection.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Tags</span>
                <input
                  onChange={(event) =>
                    setDraft({ ...draft, tags: event.target.value })
                  }
                  placeholder="research, design"
                  value={draft.tags}
                />
              </label>
              <label className="field full-width">
                <span>Notes</span>
                <textarea
                  onChange={(event) =>
                    setDraft({ ...draft, notes: event.target.value })
                  }
                  placeholder="Why is this worth keeping?"
                  rows={3}
                  value={draft.notes}
                />
              </label>
            </div>

            {composerNotice && (
              <div className="inline-notice">{composerNotice}</div>
            )}
            {error && <div className="inline-error">{error}</div>}

            <div className="composer-footer">
              {editing ? (
                <button
                  className="danger-button"
                  disabled={busy}
                  onClick={() => void moveToTrash(editing)}
                  type="button"
                >
                  Move to trash
                </button>
              ) : (
                <span className="offline-note">
                  {online ? "Ready for offline use" : "Offline save is active"}
                </span>
              )}
              <div>
                <button
                  className="text-button"
                  disabled={busy}
                  onClick={closeComposer}
                  type="button"
                >
                  Cancel
                </button>
                <button
                  className="primary-button"
                  disabled={busy || !draft.url.trim()}
                  onClick={() => void saveDraft()}
                  type="button"
                >
                  {busy ? "Saving…" : editing ? "Save changes" : "Save locally"}
                </button>
              </div>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
