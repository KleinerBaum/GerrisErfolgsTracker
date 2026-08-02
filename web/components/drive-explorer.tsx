"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import type {
  DriveConnectionStatus,
  DriveFolderContent,
  DriveItem,
} from "../lib/types";

type DriveExplorerController = {
  status: DriveConnectionStatus | null;
  statusLoading: boolean;
  cache: Record<string, DriveFolderContent>;
  loadingFolders: Set<string>;
  expandedFolders: Set<string>;
  selectedFolderId: string | null;
  selectedFile: DriveItem | null;
  error: string;
  loadFolder: (
    folderId: string,
    force?: boolean,
  ) => Promise<DriveFolderContent | null>;
  selectFolder: (folder: DriveItem) => Promise<void>;
  selectFile: (file: DriveItem | null) => void;
  toggleFolder: (folder: DriveItem) => Promise<void>;
  disconnect: () => Promise<void>;
};

const EMPTY_STATUS: DriveConnectionStatus = {
  configured: false,
  connected: false,
  googleEmail: null,
  root: null,
};

async function jsonResponse<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as T & {
    error?: string;
    reconnect?: boolean;
  };
  if (!response.ok) {
    throw new Error(payload.error || "Google Drive ist momentan nicht erreichbar.");
  }
  return payload;
}

export function useDriveExplorer(): DriveExplorerController {
  const [status, setStatus] = useState<DriveConnectionStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [cache, setCache] = useState<Record<string, DriveFolderContent>>({});
  const cacheRef = useRef<Record<string, DriveFolderContent>>({});
  const [loadingFolders, setLoadingFolders] = useState<Set<string>>(new Set());
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<DriveItem | null>(null);
  const [error, setError] = useState("");

  const loadFolder = useCallback(
    async (folderId: string, force = false) => {
      if (!force && cacheRef.current[folderId]) {
        return cacheRef.current[folderId];
      }
      setLoadingFolders((current) => new Set(current).add(folderId));
      try {
        const response = await fetch(
          `/api/drive/folders/${encodeURIComponent(folderId)}`,
          { cache: "no-store" },
        );
        const content = await jsonResponse<DriveFolderContent>(response);
        setCache((current) => {
          const next = { ...current, [folderId]: content };
          cacheRef.current = next;
          return next;
        });
        setError("");
        return content;
      } catch (caught) {
        setError(
          caught instanceof Error
            ? caught.message
            : "Der Ordner konnte nicht geladen werden.",
        );
        return null;
      } finally {
        setLoadingFolders((current) => {
          const next = new Set(current);
          next.delete(folderId);
          return next;
        });
      }
    },
    [],
  );

  useEffect(() => {
    let active = true;
    const loadStatus = async () => {
      try {
        const response = await fetch("/api/drive/status", { cache: "no-store" });
        const next = await jsonResponse<DriveConnectionStatus>(response);
        if (!active) return;
        setStatus(next);
        if (next.connected && next.root) {
          setSelectedFolderId((current) => current || next.root?.id || null);
          setExpandedFolders((current) => new Set(current).add(next.root!.id));
          await loadFolder(next.root.id);
        }
      } catch (caught) {
        if (!active) return;
        setStatus(EMPTY_STATUS);
        setError(
          caught instanceof Error
            ? caught.message
            : "Google Drive ist momentan nicht erreichbar.",
        );
      } finally {
        if (active) setStatusLoading(false);
      }
    };
    void loadStatus();
    return () => {
      active = false;
    };
  }, [loadFolder]);

  const selectFolder = useCallback(
    async (folder: DriveItem) => {
      setSelectedFolderId(folder.id);
      setSelectedFile(null);
      const selectedContent = await loadFolder(folder.id);
      if (!selectedContent) return;
      await Promise.all(
        selectedContent.breadcrumbs
          .slice(0, -1)
          .map((ancestor) => loadFolder(ancestor.id)),
      );
      setExpandedFolders((current) => {
        const next = new Set(current);
        selectedContent.breadcrumbs.forEach((ancestor) => next.add(ancestor.id));
        return next;
      });
    },
    [loadFolder],
  );

  const toggleFolder = useCallback(
    async (folder: DriveItem) => {
      const opening = !expandedFolders.has(folder.id);
      setExpandedFolders((current) => {
        const next = new Set(current);
        if (next.has(folder.id)) next.delete(folder.id);
        else next.add(folder.id);
        return next;
      });
      if (opening) await loadFolder(folder.id);
    },
    [expandedFolders, loadFolder],
  );

  const disconnect = useCallback(async () => {
    if (
      !window.confirm(
        "Die gemeinsame Google-Verbindung für Drive, Tasks, Kalender und Gmail trennen? Deine Google-Daten bleiben erhalten; private Kompass-Zusatzangaben zu Aufgaben werden gelöscht.",
      )
    ) {
      return;
    }
    try {
      const response = await fetch("/api/drive/disconnect", { method: "POST" });
      await jsonResponse<{ ok: boolean }>(response);
      setStatus((current) => ({
        ...(current || EMPTY_STATUS),
        connected: false,
        googleEmail: null,
        root: null,
      }));
      setCache({});
      cacheRef.current = {};
      setExpandedFolders(new Set());
      setSelectedFolderId(null);
      setSelectedFile(null);
      setError("");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Die Verbindung konnte nicht getrennt werden.",
      );
    }
  }, []);

  return {
    status,
    statusLoading,
    cache,
    loadingFolders,
    expandedFolders,
    selectedFolderId,
    selectedFile,
    error,
    loadFolder,
    selectFolder,
    selectFile: setSelectedFile,
    toggleFolder,
    disconnect,
  };
}

function TreeFolder({
  controller,
  folder,
  depth,
  onNavigate,
}: {
  controller: DriveExplorerController;
  folder: DriveItem;
  depth: number;
  onNavigate: () => void;
}) {
  const content = controller.cache[folder.id];
  const folders = (content?.items || []).filter((item) => item.kind === "folder");
  const expanded = controller.expandedFolders.has(folder.id);
  const loading = controller.loadingFolders.has(folder.id);
  const selected = controller.selectedFolderId === folder.id;

  return (
    <div className="drive-tree-node">
      <div className={`drive-tree-row ${selected ? "active" : ""}`}>
        <button
          aria-label={`${folder.name} ${expanded ? "zuklappen" : "ausklappen"}`}
          aria-expanded={expanded}
          className="drive-tree-toggle"
          onClick={() => void controller.toggleFolder(folder)}
          style={{ marginLeft: `${depth * 9}px` }}
          type="button"
        >
          {loading ? "·" : expanded ? "▾" : "›"}
        </button>
        <button
          className="drive-tree-label"
          onClick={() => {
            void controller.selectFolder(folder);
            onNavigate();
          }}
          type="button"
        >
          <span aria-hidden="true">▰</span>
          {folder.name}
          {content ? <small>{content.items.length}</small> : null}
        </button>
      </div>
      {expanded ? (
        <div className="drive-tree-children">
          {loading && !content ? (
            <span className="drive-tree-loading">Ordner werden geladen …</span>
          ) : null}
          {folders.map((child) => (
            <TreeFolder
              controller={controller}
              depth={depth + 1}
              folder={child}
              key={child.id}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function DriveSidebarTree({
  collapsed,
  controller,
  onNavigate,
}: {
  collapsed: boolean;
  controller: DriveExplorerController;
  onNavigate: () => void;
}) {
  if (collapsed) {
    return (
      <button
        className="collapsed-files-button"
        onClick={onNavigate}
        title="Unterlagen und Dokumente öffnen"
        type="button"
      >
        <span className="nav-mark">D</span>
      </button>
    );
  }

  return (
    <section className="folder-tree drive-folder-tree" aria-label="Google-Drive-Ordner">
      <div className="tree-heading">
        <span>Unterlagen und Dokumente</span>
        {controller.status?.connected ? <i aria-label="Verbunden" /> : null}
      </div>
      {controller.statusLoading ? (
        <p className="drive-tree-message">Google Drive wird geladen …</p>
      ) : controller.status?.connected && controller.status.root ? (
        <div className="drive-tree-root">
          <div className="drive-tree-caption">Meine Ablage</div>
          <TreeFolder
            controller={controller}
            depth={0}
            folder={controller.status.root}
            onNavigate={onNavigate}
          />
        </div>
      ) : (
        <div className="drive-tree-message">
          <p>Drive ist noch nicht verbunden.</p>
          <button onClick={onNavigate} type="button">
            Zur Ablage
          </button>
        </div>
      )}
    </section>
  );
}

function FileKind({ item }: { item: DriveItem }) {
  const label = item.kind === "folder"
    ? "ORDNER"
    : item.mimeType === "application/pdf"
      ? "PDF"
      : item.mimeType.startsWith("image/")
        ? "BILD"
        : item.mimeType.includes("spreadsheet")
          ? "TABELLE"
          : item.mimeType.includes("presentation")
            ? "PRÄS"
            : item.mimeType.includes("document") || item.mimeType.startsWith("text/")
              ? "DOK"
              : "DATEI";
  return <span className={`drive-item-kind ${item.kind}`}>{label}</span>;
}

function formatSize(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1_048_576) return `${Math.max(1, Math.round(bytes / 1_024))} KB`;
  return `${(bytes / 1_048_576).toFixed(1).replace(".", ",")} MB`;
}

function DriveFilePreview({
  file,
  onClose,
}: {
  file: DriveItem;
  onClose: () => void;
}) {
  const source = `/api/drive/files/${encodeURIComponent(file.id)}`;
  const download = `${source}?download=1`;
  const previewSource =
    file.previewKind === "pdf"
      ? `${source}#page=1&view=Fit&toolbar=1&navpanes=0`
      : source;
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previousFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.body.classList.add("drive-preview-open");
    window.addEventListener("keydown", closeOnEscape);
    closeButtonRef.current?.focus();
    return () => {
      document.body.classList.remove("drive-preview-open");
      window.removeEventListener("keydown", closeOnEscape);
      previousFocus?.focus();
    };
  }, [onClose]);

  return (
    <div
      className="drive-preview-backdrop"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) onClose();
      }}
      role="presentation"
    >
      <section
        aria-labelledby="drive-preview-title"
        aria-modal="true"
        className="drive-inline-preview"
        role="dialog"
      >
        <header>
          <div>
            <span className="eyebrow">Google Drive</span>
            <h2 id="drive-preview-title">{file.name}</h2>
            <p>
              {file.modifiedAt
                ? `Geändert ${new Date(file.modifiedAt).toLocaleDateString("de-DE")}`
                : "Google-Drive-Datei"}
              {file.sizeBytes ? ` · ${formatSize(file.sizeBytes)}` : ""}
              {file.previewKind === "pdf"
                ? " · ganze Seite im Original-Layout eingepasst"
                : " · eingepasst"}
            </p>
          </div>
          <div className="button-group">
            <a className="button button-soft" href={download}>
              Herunterladen
            </a>
            <a
              className="button button-soft"
              href={file.webViewLink}
              rel="noreferrer"
              target="_blank"
            >
              In Drive
            </a>
            <button
              className="button button-ghost"
              onClick={onClose}
              ref={closeButtonRef}
              type="button"
            >
              Schließen
            </button>
          </div>
        </header>
        <div
          className={`drive-preview-stage preview-${file.previewKind || "fallback"}`}
        >
          {file.previewKind === "image" ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img alt={`Vorschau von ${file.name}`} src={source} />
          ) : file.previewKind === "pdf" || file.previewKind === "text" ? (
            <iframe
              loading="eager"
              src={previewSource}
              title={`Vorschau von ${file.name}`}
            />
          ) : (
            <div className="viewer-empty drive-preview-fallback">
              <span>DATEI</span>
              <h3>Keine Vorschau verfügbar</h3>
              <p>Lade die Datei herunter oder öffne sie in Google Drive.</p>
              <div className="button-group">
                <a className="button button-primary" href={download}>
                  Herunterladen
                </a>
                <a
                  className="button button-soft"
                  href={file.webViewLink}
                  rel="noreferrer"
                  target="_blank"
                >
                  In Drive öffnen
                </a>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function DriveFolderSearch({
  controller,
}: {
  controller: DriveExplorerController;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<DriveItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const normalizedQuery = query.trim();

  useEffect(() => {
    if (normalizedQuery.length < 2) {
      return;
    }
    const abortController = new AbortController();
    const timeout = window.setTimeout(async () => {
      setSearching(true);
      try {
        const response = await fetch(
          `/api/drive/search?q=${encodeURIComponent(normalizedQuery)}`,
          { cache: "no-store", signal: abortController.signal },
        );
        const payload = await jsonResponse<{ items: DriveItem[] }>(response);
        setResults(payload.items);
        setSearchError("");
      } catch (caught) {
        if (caught instanceof DOMException && caught.name === "AbortError") return;
        setResults([]);
        setSearchError(
          caught instanceof Error
            ? caught.message
            : "Die Ordnersuche ist momentan nicht erreichbar.",
        );
      } finally {
        if (!abortController.signal.aborted) setSearching(false);
      }
    }, 250);
    return () => {
      window.clearTimeout(timeout);
      abortController.abort();
    };
  }, [normalizedQuery]);

  return (
    <section className="drive-folder-search" aria-label="Ordner suchen">
      <label>
        <span>Ordner im gesamten Bereich suchen</span>
        <input
          aria-controls="drive-folder-search-results"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Zum Beispiel Bücher, Verträge oder Ausweise"
          type="search"
          value={query}
        />
      </label>
      {normalizedQuery.length >= 2 ? (
        <div className="drive-folder-search-results" id="drive-folder-search-results">
          {searching ? <p>Ordner werden gesucht …</p> : null}
          {!searching && searchError ? <p role="status">{searchError}</p> : null}
          {!searching && !searchError && !results.length ? (
            <p>Kein passender Ordner in dieser Ablage gefunden.</p>
          ) : null}
          {results.map((folder) => (
            <button
              key={folder.id}
              onClick={() => {
                void controller.selectFolder(folder);
                setQuery("");
              }}
              type="button"
            >
              <FileKind item={folder} />
              <span>
                <strong>{folder.name}</strong>
                <small>Ordner öffnen und Pfad anzeigen</small>
              </span>
              <i aria-hidden="true">›</i>
            </button>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function Notice({ children }: { children: ReactNode }) {
  return <div className="drive-notice" role="status">{children}</div>;
}

export function DriveExplorer({
  controller,
}: {
  controller: DriveExplorerController;
}) {
  const content = controller.selectedFolderId
    ? controller.cache[controller.selectedFolderId]
    : null;
  const loading =
    Boolean(controller.selectedFolderId) &&
    controller.loadingFolders.has(controller.selectedFolderId!);
  const folders = useMemo(
    () => (content?.items || []).filter((item) => item.kind === "folder"),
    [content],
  );
  const files = useMemo(
    () => (content?.items || []).filter((item) => item.kind === "file"),
    [content],
  );

  if (controller.statusLoading) {
    return <Notice>Google Drive wird sicher verbunden …</Notice>;
  }

  if (!controller.status?.configured) {
    return (
      <Notice>
        <strong>Google Drive ist noch nicht eingerichtet.</strong>
        <span>Verbindung und Zielordner fehlen noch.</span>
      </Notice>
    );
  }

  if (!controller.status.connected) {
    return (
      <section className="drive-connect-card">
        <span className="integration-initial">G</span>
        <div>
          <span className="eyebrow">Unterlagen · nur lesend</span>
          <h2>Google Drive verbinden</h2>
          <p>Nach der Anmeldung erscheint „Unterlagen und Dokumente“ hier.</p>
        </div>
        <a className="button button-primary" href="/api/drive/connect">
          Mit Google verbinden
        </a>
      </section>
    );
  }

  return (
    <section className="drive-browser" aria-label="Google-Drive-Dateibrowser">
      <header className="drive-browser-heading">
        <div>
          <span className="eyebrow">Google Drive · nur lesend</span>
          <h2>{content?.folder.name || "Unterlagen und Dokumente"}</h2>
          <nav aria-label="Ordnerpfad" className="drive-breadcrumbs">
            {(content?.breadcrumbs || []).map((folder, index) => (
              <span key={folder.id}>
                {index ? " / " : ""}
                <button
                  onClick={() => void controller.selectFolder(folder)}
                  type="button"
                >
                  {folder.name}
                </button>
              </span>
            ))}
          </nav>
        </div>
        <div className="drive-account">
          <span>{controller.status.googleEmail}</span>
          <button onClick={() => void controller.disconnect()} type="button">
            Google-Verbindung trennen
          </button>
        </div>
      </header>

      {controller.error ? <Notice>{controller.error}</Notice> : null}
      {loading && !content ? <Notice>Ordnerinhalt wird geladen …</Notice> : null}

      {content ? (
        <>
          <DriveFolderSearch controller={controller} />
          <div className="drive-content-summary">
            <span>{folders.length} Unterordner</span>
            <span>{files.length} Dateien</span>
            <button
              onClick={() => void controller.loadFolder(content.folder.id, true)}
              type="button"
            >
              Aktualisieren
            </button>
          </div>
          <div className="drive-item-list" role="list">
            {content.items.map((item) => (
              <button
                aria-current={
                  controller.selectedFile?.id === item.id ? "true" : undefined
                }
                className={
                  controller.selectedFile?.id === item.id ? "selected" : ""
                }
                key={item.id}
                onClick={() =>
                  item.kind === "folder"
                    ? void controller.selectFolder(item)
                    : controller.selectFile(item)
                }
                role="listitem"
                type="button"
              >
                <FileKind item={item} />
                <span className="drive-item-copy">
                  <strong>{item.name}</strong>
                  <small>
                    {item.kind === "folder"
                      ? "Unterordner öffnen"
                      : [
                          item.modifiedAt
                            ? new Date(item.modifiedAt).toLocaleDateString("de-DE")
                            : "",
                          formatSize(item.sizeBytes),
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                  </small>
                </span>
                <span className="drive-item-action" aria-hidden="true">
                  {item.kind === "folder" ? "Öffnen ›" : "Ansehen ↓"}
                </span>
              </button>
            ))}
          </div>
          {!content.items.length ? (
            <div className="drive-empty">
              <span>LEER</span>
              <h3>Dieser Ordner ist leer.</h3>
              <p>Nach „Aktualisieren“ erscheinen neue Inhalte.</p>
            </div>
          ) : null}
        </>
      ) : null}

      {controller.selectedFile ? (
        <DriveFilePreview
          file={controller.selectedFile}
          onClose={() => controller.selectFile(null)}
        />
      ) : null}
    </section>
  );
}

export type { DriveExplorerController };
