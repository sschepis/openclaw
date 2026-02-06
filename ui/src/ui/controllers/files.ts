import type { AppViewState } from "../app-view-state.js";

export interface FileEntry {
  name: string;
  path: string;
  type: "file" | "directory";
  size?: number;
  mtime?: number;
}

export interface FileTreeNode extends FileEntry {
  children?: FileTreeNode[];
  expanded?: boolean;
  loading?: boolean;
}

export interface FilesListResult {
  entries: FileEntry[];
  path: string;
}

export interface FileReadResult {
  content: string;
  path: string;
  encoding: string;
}

export interface FileWriteResult {
  ok: boolean;
  path: string;
}

export interface FileDeleteResult {
  ok: boolean;
  path: string;
}

export interface FileMoveResult {
  ok: boolean;
  oldPath: string;
  newPath: string;
}

export interface FileCreateResult {
  ok: boolean;
  path: string;
}

/**
 * Load the root directory listing from the user's openclaw home folder
 */
export async function loadFiles(state: AppViewState) {
  if (state.filesLoading) {
    return;
  }
  state.filesLoading = true;
  state.filesError = null;

  try {
    const res = (await state.client?.request("files.list", { path: "" })) as FilesListResult | null;
    if (res?.entries) {
      // Convert flat entries to tree nodes
      state.filesTree = res.entries.map((entry) => ({
        ...entry,
        expanded: false,
        loading: false,
        children: entry.type === "directory" ? [] : undefined,
      }));
    }
  } catch (err: unknown) {
    state.filesError = String(err);
  } finally {
    state.filesLoading = false;
  }
}

/**
 * Load children for a directory node
 */
export async function loadDirectoryChildren(state: AppViewState, path: string) {
  // Find the node in the tree
  const node = findNodeByPath(state.filesTree, path);
  if (!node || node.type !== "directory") {
    return;
  }

  node.loading = true;
  // Force reactivity update
  state.filesTree = [...state.filesTree];

  try {
    const res = (await state.client?.request("files.list", { path })) as FilesListResult | null;
    if (res?.entries) {
      node.children = res.entries.map((entry) => ({
        ...entry,
        expanded: false,
        loading: false,
        children: entry.type === "directory" ? [] : undefined,
      }));
      node.expanded = true;
    }
  } catch (err: unknown) {
    state.filesError = String(err);
  } finally {
    node.loading = false;
    // Force reactivity update
    state.filesTree = [...state.filesTree];
  }
}

/**
 * Toggle a directory node's expanded state
 */
export async function toggleDirectory(state: AppViewState, path: string) {
  const node = findNodeByPath(state.filesTree, path);
  if (!node || node.type !== "directory") {
    return;
  }

  if (node.expanded) {
    // Collapse the directory
    node.expanded = false;
    state.filesTree = [...state.filesTree];
  } else {
    // Load children if not already loaded, then expand
    if (!node.children || node.children.length === 0) {
      await loadDirectoryChildren(state, path);
    } else {
      node.expanded = true;
      state.filesTree = [...state.filesTree];
    }
  }
}

/**
 * Open a file for editing
 */
export async function openFile(state: AppViewState, path: string) {
  state.filesEditorLoading = true;
  state.filesError = null;

  try {
    const res = (await state.client?.request("files.read", { path })) as FileReadResult | null;
    if (res) {
      state.filesEditorPath = path;
      state.filesEditorContent = res.content;
      state.filesEditorOriginal = res.content;
      state.filesEditorDirty = false;
    }
  } catch (err: unknown) {
    state.filesError = String(err);
  } finally {
    state.filesEditorLoading = false;
  }
}

/**
 * Save the currently edited file
 */
export async function saveFile(state: AppViewState) {
  if (!state.filesEditorPath || state.filesEditorSaving) {
    return;
  }

  state.filesEditorSaving = true;
  state.filesError = null;

  try {
    const res = (await state.client?.request("files.write", {
      path: state.filesEditorPath,
      content: state.filesEditorContent,
    })) as FileWriteResult | null;

    if (res?.ok) {
      state.filesEditorOriginal = state.filesEditorContent;
      state.filesEditorDirty = false;
    }
  } catch (err: unknown) {
    state.filesError = String(err);
  } finally {
    state.filesEditorSaving = false;
  }
}

/**
 * Close the file editor
 */
export function closeEditor(state: AppViewState) {
  if (state.filesEditorDirty) {
    if (!confirm("You have unsaved changes. Are you sure you want to close?")) {
      return;
    }
  }
  state.filesEditorPath = null;
  state.filesEditorContent = "";
  state.filesEditorOriginal = "";
  state.filesEditorDirty = false;
}

/**
 * Update the editor content
 */
export function updateEditorContent(state: AppViewState, content: string) {
  state.filesEditorContent = content;
  state.filesEditorDirty = content !== state.filesEditorOriginal;
}

/**
 * Delete a file or directory
 */
export async function deleteFile(state: AppViewState, path: string) {
  if (state.filesBusy) {
    return;
  }

  const name = path.split("/").pop() || path;
  if (!confirm(`Are you sure you want to delete "${name}"? This cannot be undone.`)) {
    return;
  }

  state.filesBusy = true;
  state.filesError = null;

  try {
    const res = (await state.client?.request("files.delete", { path })) as FileDeleteResult | null;
    if (res?.ok) {
      // Remove from tree
      removeNodeByPath(state.filesTree, path);
      state.filesTree = [...state.filesTree];

      // Close editor if this file was open
      if (state.filesEditorPath === path) {
        state.filesEditorPath = null;
        state.filesEditorContent = "";
        state.filesEditorOriginal = "";
        state.filesEditorDirty = false;
      }
    }
  } catch (err: unknown) {
    state.filesError = String(err);
  } finally {
    state.filesBusy = false;
  }
}

/**
 * Create a new file
 */
export async function createFile(state: AppViewState, parentPath: string, name: string) {
  if (state.filesBusy) {
    return;
  }

  const path = parentPath ? `${parentPath}/${name}` : name;

  state.filesBusy = true;
  state.filesError = null;

  try {
    const res = (await state.client?.request("files.create", {
      path,
      type: "file",
    })) as FileCreateResult | null;

    if (res?.ok) {
      // Reload the parent directory
      if (parentPath) {
        await loadDirectoryChildren(state, parentPath);
      } else {
        await loadFiles(state);
      }
      // Open the new file for editing
      await openFile(state, path);
    }
  } catch (err: unknown) {
    state.filesError = String(err);
  } finally {
    state.filesBusy = false;
  }
}

/**
 * Create a new directory
 */
export async function createDirectory(state: AppViewState, parentPath: string, name: string) {
  if (state.filesBusy) {
    return;
  }

  const path = parentPath ? `${parentPath}/${name}` : name;

  state.filesBusy = true;
  state.filesError = null;

  try {
    const res = (await state.client?.request("files.create", {
      path,
      type: "directory",
    })) as FileCreateResult | null;

    if (res?.ok) {
      // Reload the parent directory
      if (parentPath) {
        await loadDirectoryChildren(state, parentPath);
      } else {
        await loadFiles(state);
      }
    }
  } catch (err: unknown) {
    state.filesError = String(err);
  } finally {
    state.filesBusy = false;
  }
}

/**
 * Move/rename a file or directory
 */
export async function moveFile(state: AppViewState, oldPath: string, newPath: string) {
  if (state.filesBusy) {
    return;
  }

  state.filesBusy = true;
  state.filesError = null;

  try {
    const res = (await state.client?.request("files.move", {
      oldPath,
      newPath,
    })) as FileMoveResult | null;

    if (res?.ok) {
      // Reload the tree
      await loadFiles(state);

      // Update editor if this file was open
      if (state.filesEditorPath === oldPath) {
        state.filesEditorPath = newPath;
      }
    }
  } catch (err: unknown) {
    state.filesError = String(err);
  } finally {
    state.filesBusy = false;
  }
}

/**
 * Open the new file/folder dialog
 */
export function openNewFileDialog(state: AppViewState, parentPath: string, type: "file" | "directory") {
  state.filesNewDialog = {
    parentPath,
    type,
    name: "",
  };
}

/**
 * Close the new file/folder dialog
 */
export function closeNewFileDialog(state: AppViewState) {
  state.filesNewDialog = null;
}

/**
 * Update the new file/folder dialog name
 */
export function updateNewFileDialogName(state: AppViewState, name: string) {
  if (state.filesNewDialog) {
    state.filesNewDialog = { ...state.filesNewDialog, name };
  }
}

/**
 * Submit the new file/folder dialog
 */
export async function submitNewFileDialog(state: AppViewState) {
  if (!state.filesNewDialog || !state.filesNewDialog.name) {
    return;
  }

  const { parentPath, type, name } = state.filesNewDialog;

  if (type === "file") {
    await createFile(state, parentPath, name);
  } else {
    await createDirectory(state, parentPath, name);
  }

  state.filesNewDialog = null;
}

/**
 * Open the rename dialog
 */
export function openRenameDialog(state: AppViewState, path: string) {
  const name = path.split("/").pop() || path;
  state.filesRenameDialog = {
    path,
    newName: name,
  };
}

/**
 * Close the rename dialog
 */
export function closeRenameDialog(state: AppViewState) {
  state.filesRenameDialog = null;
}

/**
 * Update the rename dialog name
 */
export function updateRenameDialogName(state: AppViewState, name: string) {
  if (state.filesRenameDialog) {
    state.filesRenameDialog = { ...state.filesRenameDialog, newName: name };
  }
}

/**
 * Submit the rename dialog
 */
export async function submitRenameDialog(state: AppViewState) {
  if (!state.filesRenameDialog || !state.filesRenameDialog.newName) {
    return;
  }

  const { path, newName } = state.filesRenameDialog;
  const parentPath = path.split("/").slice(0, -1).join("/");
  const newPath = parentPath ? `${parentPath}/${newName}` : newName;

  if (path !== newPath) {
    await moveFile(state, path, newPath);
  }

  state.filesRenameDialog = null;
}

// Helper functions for tree manipulation

function findNodeByPath(nodes: FileTreeNode[], path: string): FileTreeNode | null {
  for (const node of nodes) {
    if (node.path === path) {
      return node;
    }
    if (node.children) {
      const found = findNodeByPath(node.children, path);
      if (found) {
        return found;
      }
    }
  }
  return null;
}

function removeNodeByPath(nodes: FileTreeNode[], path: string): boolean {
  for (let i = 0; i < nodes.length; i++) {
    if (nodes[i].path === path) {
      nodes.splice(i, 1);
      return true;
    }
    if (nodes[i].children) {
      if (removeNodeByPath(nodes[i].children!, path)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Check if a file is a text file based on extension
 */
export function isTextFile(path: string): boolean {
  const textExtensions = [
    ".txt",
    ".md",
    ".json",
    ".yaml",
    ".yml",
    ".toml",
    ".xml",
    ".html",
    ".htm",
    ".css",
    ".js",
    ".ts",
    ".jsx",
    ".tsx",
    ".sh",
    ".bash",
    ".zsh",
    ".fish",
    ".py",
    ".rb",
    ".go",
    ".rs",
    ".c",
    ".cpp",
    ".h",
    ".hpp",
    ".java",
    ".kt",
    ".swift",
    ".sql",
    ".env",
    ".gitignore",
    ".dockerignore",
    ".editorconfig",
    ".prettierrc",
    ".eslintrc",
    ".babelrc",
    "",
  ];
  const ext = path.includes(".") ? `.${path.split(".").pop()?.toLowerCase()}` : "";
  const name = path.split("/").pop() || "";

  // Files without extensions or with known text extensions
  if (!path.includes(".") && !name.startsWith(".")) {
    return true;
  }

  // Known text file names without extensions
  const knownTextFiles = [
    "Makefile",
    "Dockerfile",
    "LICENSE",
    "README",
    "CHANGELOG",
    "CONTRIBUTING",
    "AUTHORS",
    "SOUL.md",
    "AGENTS.md",
  ];
  if (knownTextFiles.some((f) => name === f || name.endsWith(f))) {
    return true;
  }

  return textExtensions.includes(ext);
}
