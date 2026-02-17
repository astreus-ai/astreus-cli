import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync, unlinkSync, rmdirSync, renameSync, copyFileSync } from "fs";
import { join, dirname, resolve, isAbsolute, basename } from "path";

export interface ToolResult {
  success: boolean;
  data?: string;
  error?: string;
}

// Current working directory for file operations
// Can be set to an attached folder path
let currentWorkingDir: string = process.cwd();

export function setWorkingDirectory(dir: string): void {
  if (existsSync(dir) && statSync(dir).isDirectory()) {
    currentWorkingDir = resolve(dir);
  }
}

export function getWorkingDirectory(): string {
  return currentWorkingDir;
}

export function resetWorkingDirectory(): void {
  currentWorkingDir = process.cwd();
}

// Resolve path relative to current working directory
function resolvePath(path: string): string {
  if (isAbsolute(path)) {
    return path;
  }
  return resolve(currentWorkingDir, path);
}

// Read file content
export function readFile(path: string): ToolResult {
  try {
    const resolvedPath = resolvePath(path);
    if (!existsSync(resolvedPath)) {
      return { success: false, error: `File not found: ${path}` };
    }
    const stat = statSync(resolvedPath);
    if (stat.isDirectory()) {
      return { success: false, error: `Path is a directory: ${path}` };
    }
    const content = readFileSync(resolvedPath, "utf-8");
    return { success: true, data: content };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

// Write file content
export function writeFile(path: string, content: string): ToolResult {
  try {
    const resolvedPath = resolvePath(path);
    const dir = dirname(resolvedPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(resolvedPath, content, "utf-8");
    const lines = content.split('\n').length;
    return { success: true, data: `Wrote ${resolvedPath} (${lines} lines)` };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

// Edit file - replace old content with new
export function editFile(path: string, oldContent: string, newContent: string): ToolResult {
  try {
    const resolvedPath = resolvePath(path);
    if (!existsSync(resolvedPath)) {
      return { success: false, error: `File not found: ${path}` };
    }
    let content = readFileSync(resolvedPath, "utf-8");
    if (!content.includes(oldContent)) {
      return { success: false, error: `Content not found in file` };
    }
    content = content.replace(oldContent, newContent);
    writeFileSync(resolvedPath, content, "utf-8");
    return { success: true, data: `Edited ${resolvedPath}` };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

// List directory contents
export function listDirectory(path: string = "."): ToolResult {
  try {
    const resolvedPath = resolvePath(path);
    if (!existsSync(resolvedPath)) {
      return { success: false, error: `Directory not found: ${path}` };
    }
    const stat = statSync(resolvedPath);
    if (!stat.isDirectory()) {
      return { success: false, error: `Path is not a directory: ${path}` };
    }
    const entries = readdirSync(resolvedPath).filter(e => !e.startsWith('.'));

    // Separate directories and files
    const dirs: string[] = [];
    const files: string[] = [];

    for (const entry of entries) {
      const entryPath = join(resolvedPath, entry);
      try {
        const entryStat = statSync(entryPath);
        if (entryStat.isDirectory()) {
          dirs.push(entry + '/');
        } else {
          files.push(entry);
        }
      } catch {
        files.push(entry);
      }
    }

    // Sort alphabetically
    dirs.sort();
    files.sort();

    // Format output
    const allEntries = [...dirs, ...files];
    if (allEntries.length === 0) {
      return { success: true, data: `${resolvedPath} (empty)` };
    }

    return { success: true, data: `${resolvedPath}\n  ${allEntries.join('\n  ')}` };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

// Create directory
export function createDirectory(path: string): ToolResult {
  try {
    const resolvedPath = resolvePath(path);
    if (existsSync(resolvedPath)) {
      return { success: true, data: `Already exists: ${resolvedPath}` };
    }
    mkdirSync(resolvedPath, { recursive: true });
    return { success: true, data: `Created ${resolvedPath}/` };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

// Delete file or directory
export function deleteFile(path: string): ToolResult {
  try {
    const resolvedPath = resolvePath(path);
    if (!existsSync(resolvedPath)) {
      return { success: true, data: `Already deleted: ${path}` };
    }
    const stat = statSync(resolvedPath);
    if (stat.isDirectory()) {
      rmdirSync(resolvedPath, { recursive: true });
      return { success: true, data: `Deleted ${resolvedPath}/` };
    } else {
      unlinkSync(resolvedPath);
      return { success: true, data: `Deleted ${resolvedPath}` };
    }
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

// Move/rename file or directory
export function moveFile(source: string, destination: string): ToolResult {
  try {
    const resolvedSource = resolvePath(source);
    const resolvedDest = resolvePath(destination);

    if (!existsSync(resolvedSource)) {
      return { success: false, error: `Source not found: ${source}` };
    }

    // Create destination directory if needed
    const destDir = dirname(resolvedDest);
    if (!existsSync(destDir)) {
      mkdirSync(destDir, { recursive: true });
    }

    // If destination exists and is a directory, move into it
    if (existsSync(resolvedDest) && statSync(resolvedDest).isDirectory()) {
      const newDest = join(resolvedDest, basename(resolvedSource));
      renameSync(resolvedSource, newDest);
      return { success: true, data: `Moved ${source} -> ${newDest}` };
    }

    renameSync(resolvedSource, resolvedDest);
    return { success: true, data: `Moved ${source} -> ${destination}` };
  } catch (e: any) {
    // If rename fails (cross-device), try copy + delete
    try {
      const resolvedSource = resolvePath(source);
      const resolvedDest = resolvePath(destination);
      const stat = statSync(resolvedSource);

      if (stat.isDirectory()) {
        // For directories, we need recursive copy
        return { success: false, error: `Cannot move directory across devices. Use copy manually.` };
      }

      copyFileSync(resolvedSource, resolvedDest);
      unlinkSync(resolvedSource);
      return { success: true, data: `Moved ${source} -> ${destination}` };
    } catch (copyError: any) {
      return { success: false, error: copyError.message };
    }
  }
}

// Search for files by pattern
export function searchFiles(pattern: string, dir: string = "."): ToolResult {
  try {
    const resolvedDir = resolvePath(dir);
    const results: string[] = [];

    function search(currentDir: string, depth: number = 0) {
      if (depth > 5) return; // Max depth
      if (!existsSync(currentDir)) return;

      const entries = readdirSync(currentDir);
      for (const entry of entries) {
        if (entry.startsWith(".") || entry === "node_modules") continue;

        const entryPath = join(currentDir, entry);
        try {
          const stat = statSync(entryPath);

          if (entry.toLowerCase().includes(pattern.toLowerCase())) {
            const relativePath = entryPath.replace(resolvedDir, "").replace(/^\//, "");
            results.push(stat.isDirectory() ? relativePath + '/' : relativePath);
          }

          if (stat.isDirectory() && results.length < 50) {
            search(entryPath, depth + 1);
          }
        } catch {
          // Skip inaccessible files
        }
      }
    }

    search(resolvedDir);
    return { success: true, data: results.length > 0 ? results.join('\n') : "No matches found" };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

// Execute tool by name
export function executeTool(name: string, args: Record<string, string>): ToolResult {
  switch (name) {
    case "read_file":
      return readFile(args.path);
    case "write_file":
      return writeFile(args.path, args.content);
    case "edit_file":
      return editFile(args.path, args.old_content, args.new_content);
    case "list_directory":
      return listDirectory(args.path || ".");
    case "create_directory":
      return createDirectory(args.path);
    case "delete_file":
      return deleteFile(args.path);
    case "move_file":
      return moveFile(args.source, args.destination);
    case "search_files":
      return searchFiles(args.pattern, args.dir || ".");
    default:
      return { success: false, error: `Unknown tool: ${name}` };
  }
}

// Plugin definition for the Astreus SDK
export const fileToolsPlugin = {
  name: "file-tools",
  version: "1.0.0",
  description: "File system tools for reading, writing, and managing files",
  tools: [
    {
      name: "read_file",
      description: "Read the contents of a file",
      parameters: {
        path: { name: "path", type: "string" as const, description: "Path to the file to read (relative to working directory or absolute)", required: true }
      },
      handler: async (params: Record<string, any>) => {
        const result = readFile(params.path as string);
        return { success: result.success, data: result.data, error: result.error };
      }
    },
    {
      name: "write_file",
      description: "Write content to a file (creates directories if needed)",
      parameters: {
        path: { name: "path", type: "string" as const, description: "Path to the file to write (relative to working directory or absolute)", required: true },
        content: { name: "content", type: "string" as const, description: "Content to write to the file", required: true }
      },
      handler: async (params: Record<string, any>) => {
        const result = writeFile(params.path as string, params.content as string);
        return { success: result.success, data: result.data, error: result.error };
      }
    },
    {
      name: "edit_file",
      description: "Edit a file by replacing specific content",
      parameters: {
        path: { name: "path", type: "string" as const, description: "Path to the file to edit (relative to working directory or absolute)", required: true },
        old_content: { name: "old_content", type: "string" as const, description: "The exact content to replace", required: true },
        new_content: { name: "new_content", type: "string" as const, description: "The new content to insert", required: true }
      },
      handler: async (params: Record<string, any>) => {
        const result = editFile(params.path as string, params.old_content as string, params.new_content as string);
        return { success: result.success, data: result.data, error: result.error };
      }
    },
    {
      name: "list_directory",
      description: "List contents of a directory. Shows current working directory.",
      parameters: {
        path: { name: "path", type: "string" as const, description: "Path to the directory (default: current working directory)", required: false }
      },
      handler: async (params: Record<string, any>) => {
        const result = listDirectory(params.path as string || ".");
        return { success: result.success, data: result.data, error: result.error };
      }
    },
    {
      name: "create_directory",
      description: "Create a new directory",
      parameters: {
        path: { name: "path", type: "string" as const, description: "Path of the directory to create (relative to working directory or absolute)", required: true }
      },
      handler: async (params: Record<string, any>) => {
        const result = createDirectory(params.path as string);
        return { success: result.success, data: result.data, error: result.error };
      }
    },
    {
      name: "delete_file",
      description: "Delete a file or directory",
      parameters: {
        path: { name: "path", type: "string" as const, description: "Path to delete (relative to working directory or absolute)", required: true }
      },
      handler: async (params: Record<string, any>) => {
        const result = deleteFile(params.path as string);
        return { success: result.success, data: result.data, error: result.error };
      }
    },
    {
      name: "move_file",
      description: "Move or rename a file or directory",
      parameters: {
        source: { name: "source", type: "string" as const, description: "Source path to move", required: true },
        destination: { name: "destination", type: "string" as const, description: "Destination path", required: true }
      },
      handler: async (params: Record<string, any>) => {
        const result = moveFile(params.source as string, params.destination as string);
        return { success: result.success, data: result.data, error: result.error };
      }
    },
    {
      name: "search_files",
      description: "Search for files by name pattern",
      parameters: {
        pattern: { name: "pattern", type: "string" as const, description: "Search pattern (case-insensitive)", required: true },
        dir: { name: "dir", type: "string" as const, description: "Directory to search in (default: current working directory)", required: false }
      },
      handler: async (params: Record<string, any>) => {
        const result = searchFiles(params.pattern as string, params.dir as string || ".");
        return { success: result.success, data: result.data, error: result.error };
      }
    }
  ]
};
