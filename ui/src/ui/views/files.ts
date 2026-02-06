import { html, nothing, type TemplateResult } from "lit";
import type { FileTreeNode } from "../controllers/files.js";
import { isTextFile } from "../controllers/files.js";
import { icons } from "../icons.js";

export type FilesProps = {
  loading: boolean;
  tree: FileTreeNode[];
  error: string | null;
  selectedPath: string | null;
  editorPath: string | null;
  editorContent: string;
  editorLoading: boolean;
  editorSaving: boolean;
  editorDirty: boolean;
  busy: boolean;
  newDialog: {
    parentPath: string;
    type: "file" | "directory";
    name: string;
  } | null;
  renameDialog: {
    path: string;
    newName: string;
  } | null;
  onRefresh: () => void;
  onToggleDirectory: (path: string) => void;
  onSelectFile: (path: string) => void;
  onOpenFile: (path: string) => void;
  onCloseEditor: () => void;
  onEditorChange: (content: string) => void;
  onSaveFile: () => void;
  onDeleteFile: (path: string) => void;
  onNewFile: (parentPath: string) => void;
  onNewFolder: (parentPath: string) => void;
  onRename: (path: string) => void;
  onNewDialogClose: () => void;
  onNewDialogNameChange: (name: string) => void;
  onNewDialogSubmit: () => void;
  onRenameDialogClose: () => void;
  onRenameDialogNameChange: (name: string) => void;
  onRenameDialogSubmit: () => void;
};

export function renderFiles(props: FilesProps) {
  return html`
    <div class="files-container">
      <div class="files-sidebar">
        <section class="card" style="height: 100%; display: flex; flex-direction: column;">
          <div class="row" style="justify-content: space-between; flex-shrink: 0;">
            <div>
              <div class="card-title">File Explorer</div>
              <div class="card-sub">~/.openclaw</div>
            </div>
            <div class="row" style="gap: 8px;">
              <button
                class="btn btn--sm"
                title="New File"
                ?disabled=${props.loading || props.busy}
                @click=${() => props.onNewFile("")}
              >
                ${icons.plus}
              </button>
              <button
                class="btn btn--sm"
                title="New Folder"
                ?disabled=${props.loading || props.busy}
                @click=${() => props.onNewFolder("")}
              >
                ${icons.folder}
              </button>
              <button
                class="btn btn--sm"
                ?disabled=${props.loading}
                @click=${props.onRefresh}
              >
                ${icons.refreshCw}
              </button>
            </div>
          </div>

          ${
            props.error
              ? html`<div class="callout danger" style="margin-top: 12px; flex-shrink: 0;">${props.error}</div>`
              : nothing
          }

          <div class="files-tree" style="flex: 1; overflow-y: auto; margin-top: 16px;">
            ${
              props.loading && props.tree.length === 0
                ? html`<div class="muted" style="padding: 20px; text-align: center;">Loading files...</div>`
                : props.tree.length === 0
                  ? html`<div class="muted" style="padding: 20px; text-align: center;">No files found.</div>`
                  : props.tree.map((node) => renderTreeNode(node, 0, props))
            }
          </div>
        </section>
      </div>

      <div class="files-editor">
        ${props.editorPath ? renderEditor(props) : renderEditorPlaceholder()}
      </div>
    </div>

    ${props.newDialog ? renderNewDialog(props) : nothing}
    ${props.renameDialog ? renderRenameDialog(props) : nothing}
  `;
}

function renderTreeNode(node: FileTreeNode, depth: number, props: FilesProps): TemplateResult {
  const isDir = node.type === "directory";
  const isSelected = props.selectedPath === node.path;
  const isOpen = props.editorPath === node.path;
  const indent = depth * 16;

  return html`
    <div class="tree-node">
      <div
        class="tree-node-row ${isSelected ? "selected" : ""} ${isOpen ? "open" : ""}"
        style="padding-left: ${indent + 8}px;"
        @click=${(e: Event) => {
          e.stopPropagation();
          if (isDir) {
            props.onToggleDirectory(node.path);
          } else {
            props.onSelectFile(node.path);
          }
        }}
        @dblclick=${(e: Event) => {
          e.stopPropagation();
          if (!isDir && isTextFile(node.path)) {
            props.onOpenFile(node.path);
          }
        }}
      >
        <span class="tree-node-icon">
          ${
            isDir
              ? node.expanded
                ? icons.chevronDown
                : icons.chevronRight
              : icons.fileText
          }
        </span>
        <span class="tree-node-name">${node.name}</span>
        ${node.loading ? html`<span class="tree-node-loading">${icons.loader}</span>` : nothing}
        <div class="tree-node-actions">
          ${
            isDir
              ? html`
                  <button
                    class="btn btn--icon"
                    title="New File"
                    @click=${(e: Event) => {
                      e.stopPropagation();
                      props.onNewFile(node.path);
                    }}
                  >
                    ${icons.plus}
                  </button>
                  <button
                    class="btn btn--icon"
                    title="New Folder"
                    @click=${(e: Event) => {
                      e.stopPropagation();
                      props.onNewFolder(node.path);
                    }}
                  >
                    ${icons.folder}
                  </button>
                `
              : nothing
          }
          <button
            class="btn btn--icon"
            title="Rename"
            @click=${(e: Event) => {
              e.stopPropagation();
              props.onRename(node.path);
            }}
          >
            ${icons.pencil}
          </button>
          <button
            class="btn btn--icon danger"
            title="Delete"
            @click=${(e: Event) => {
              e.stopPropagation();
              props.onDeleteFile(node.path);
            }}
          >
            ${icons.trash}
          </button>
        </div>
      </div>
      ${
        isDir && node.expanded && node.children
          ? html`
              <div class="tree-node-children">
                ${node.children.map((child) => renderTreeNode(child, depth + 1, props))}
              </div>
            `
          : nothing
      }
    </div>
  `;
}

function renderEditorPlaceholder() {
  return html`
    <section class="card files-editor-empty">
      <div class="files-editor-placeholder">
        <div class="files-editor-placeholder-icon">${icons.fileText}</div>
        <div class="files-editor-placeholder-text">
          Select a file to view or edit
        </div>
        <div class="files-editor-placeholder-hint">
          Double-click a text file in the explorer to open it
        </div>
      </div>
    </section>
  `;
}

function renderEditor(props: FilesProps) {
  const fileName = props.editorPath?.split("/").pop() || "Untitled";

  return html`
    <section class="card files-editor-card">
      <div class="files-editor-header">
        <div class="files-editor-title">
          <span class="files-editor-icon">${icons.fileText}</span>
          <span class="files-editor-filename">${fileName}</span>
          ${props.editorDirty ? html`<span class="files-editor-dirty">•</span>` : nothing}
        </div>
        <div class="files-editor-path">${props.editorPath}</div>
        <div class="files-editor-actions">
          <button
            class="btn"
            ?disabled=${!props.editorDirty || props.editorSaving}
            @click=${props.onSaveFile}
          >
            ${props.editorSaving ? "Saving..." : "Save"}
          </button>
          <button class="btn" @click=${props.onCloseEditor}>
            Close
          </button>
        </div>
      </div>
      <div class="files-editor-content">
        ${
          props.editorLoading
            ? html`<div class="files-editor-loading">Loading...</div>`
            : html`
                <textarea
                  class="files-editor-textarea"
                  .value=${props.editorContent}
                  @input=${(e: Event) => props.onEditorChange((e.target as HTMLTextAreaElement).value)}
                  spellcheck="false"
                ></textarea>
              `
        }
      </div>
    </section>
  `;
}

function renderNewDialog(props: FilesProps) {
  if (!props.newDialog) return nothing;

  const { type, name, parentPath } = props.newDialog;
  const title = type === "file" ? "New File" : "New Folder";
  const placeholder = type === "file" ? "filename.txt" : "folder-name";

  return html`
    <div class="exec-approval-overlay">
      <div class="exec-approval-card" style="max-width: 400px;">
        <div class="exec-approval-header">
          <div class="exec-approval-title">${title}</div>
          <button class="btn btn--sm" @click=${props.onNewDialogClose}>${icons.x}</button>
        </div>

        <div style="padding: 16px; display: grid; gap: 16px;">
          ${
            parentPath
              ? html`
                  <div class="muted" style="font-size: 12px;">
                    Creating in: ${parentPath || "/"}
                  </div>
                `
              : nothing
          }
          <div class="field">
            <span>Name</span>
            <input
              type="text"
              .value=${name}
              placeholder="${placeholder}"
              @input=${(e: Event) => props.onNewDialogNameChange((e.target as HTMLInputElement).value)}
              @keydown=${(e: KeyboardEvent) => {
                if (e.key === "Enter" && name) {
                  props.onNewDialogSubmit();
                }
              }}
            />
          </div>
        </div>

        <div class="exec-approval-actions" style="padding: 16px; border-top: 1px solid var(--border);">
          <button class="btn" @click=${props.onNewDialogClose}>Cancel</button>
          <button
            class="btn primary"
            ?disabled=${!name || props.busy}
            @click=${props.onNewDialogSubmit}
          >
            ${props.busy ? "Creating..." : "Create"}
          </button>
        </div>
      </div>
    </div>
  `;
}

function renderRenameDialog(props: FilesProps) {
  if (!props.renameDialog) return nothing;

  const { path, newName } = props.renameDialog;
  const oldName = path.split("/").pop() || path;

  return html`
    <div class="exec-approval-overlay">
      <div class="exec-approval-card" style="max-width: 400px;">
        <div class="exec-approval-header">
          <div class="exec-approval-title">Rename</div>
          <button class="btn btn--sm" @click=${props.onRenameDialogClose}>${icons.x}</button>
        </div>

        <div style="padding: 16px; display: grid; gap: 16px;">
          <div class="muted" style="font-size: 12px;">
            Renaming: ${oldName}
          </div>
          <div class="field">
            <span>New Name</span>
            <input
              type="text"
              .value=${newName}
              placeholder="${oldName}"
              @input=${(e: Event) => props.onRenameDialogNameChange((e.target as HTMLInputElement).value)}
              @keydown=${(e: KeyboardEvent) => {
                if (e.key === "Enter" && newName) {
                  props.onRenameDialogSubmit();
                }
              }}
            />
          </div>
        </div>

        <div class="exec-approval-actions" style="padding: 16px; border-top: 1px solid var(--border);">
          <button class="btn" @click=${props.onRenameDialogClose}>Cancel</button>
          <button
            class="btn primary"
            ?disabled=${!newName || props.busy}
            @click=${props.onRenameDialogSubmit}
          >
            ${props.busy ? "Renaming..." : "Rename"}
          </button>
        </div>
      </div>
    </div>
  `;
}
