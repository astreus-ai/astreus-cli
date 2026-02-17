import { existsSync, statSync, readFileSync, readdirSync } from "fs";
import { resolve, basename, extname, join } from "path";

export interface Attachment {
  id: string;
  type: "file" | "folder" | "image";
  path: string;
  name: string;
  size?: number;
  mimeType?: string;
}

// Image extensions
const IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".svg"];

// Code/text extensions
const TEXT_EXTENSIONS = [
  ".ts", ".tsx", ".js", ".jsx", ".json", ".md", ".txt", ".yaml", ".yml",
  ".html", ".css", ".scss", ".less", ".py", ".rb", ".go", ".rs", ".java",
  ".c", ".cpp", ".h", ".hpp", ".sh", ".bash", ".zsh", ".fish", ".env",
  ".toml", ".ini", ".xml", ".sql", ".graphql", ".prisma", ".vue", ".svelte"
];

export function isImageFile(path: string): boolean {
  const ext = extname(path).toLowerCase();
  return IMAGE_EXTENSIONS.includes(ext);
}

export function isTextFile(path: string): boolean {
  const ext = extname(path).toLowerCase();
  return TEXT_EXTENSIONS.includes(ext);
}

export function getMimeType(path: string): string {
  const ext = extname(path).toLowerCase();
  const mimeTypes: Record<string, string> = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
    ".bmp": "image/bmp",
    ".txt": "text/plain",
    ".md": "text/markdown",
    ".json": "application/json",
    ".js": "text/javascript",
    ".ts": "text/typescript",
    ".html": "text/html",
    ".css": "text/css",
    ".xml": "application/xml",
  };
  return mimeTypes[ext] || "application/octet-stream";
}

export function parsePathFromInput(input: string): string | null {
  // Clean up the input - remove quotes and trim
  let cleaned = input.trim();

  // Ignore our metadata prefixes
  if (cleaned.startsWith("[Working directory:") ||
      cleaned.startsWith("[Attachments:") ||
      cleaned.startsWith("[IMPORTANT:")) {
    return null;
  }

  // Remove surrounding quotes (single or double)
  if ((cleaned.startsWith('"') && cleaned.endsWith('"')) ||
      (cleaned.startsWith("'") && cleaned.endsWith("'"))) {
    cleaned = cleaned.slice(1, -1);
  }

  // Check if it looks like a path
  // Absolute paths: /path, ~/path, C:\path, etc.
  // Relative paths: ./path, ../path
  const pathPatterns = [
    /^\//, // Unix absolute
    /^~\//, // Home directory
    /^[A-Za-z]:\\/, // Windows absolute
    /^\.\.?\//, // Relative
  ];

  const looksLikePath = pathPatterns.some(p => p.test(cleaned));

  if (!looksLikePath) {
    return null;
  }

  // Expand ~ to home directory
  if (cleaned.startsWith("~/")) {
    cleaned = cleaned.replace("~", process.env.HOME || "");
  }

  // Resolve the path
  const resolved = resolve(cleaned);

  // Check if it exists
  if (existsSync(resolved)) {
    return resolved;
  }

  return null;
}

export function createAttachment(path: string): Attachment | null {
  try {
    const resolved = resolve(path);

    if (!existsSync(resolved)) {
      return null;
    }

    const stat = statSync(resolved);
    const name = basename(resolved);
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    if (stat.isDirectory()) {
      return {
        id,
        type: "folder",
        path: resolved,
        name,
      };
    }

    if (isImageFile(resolved)) {
      return {
        id,
        type: "image",
        path: resolved,
        name,
        size: stat.size,
        mimeType: getMimeType(resolved),
      };
    }

    return {
      id,
      type: "file",
      path: resolved,
      name,
      size: stat.size,
      mimeType: getMimeType(resolved),
    };
  } catch {
    return null;
  }
}

export function getAttachmentPreview(attachment: Attachment): string {
  if (attachment.type === "folder") {
    try {
      const entries = readdirSync(attachment.path);
      const dirs = entries.filter(e => {
        try {
          return statSync(join(attachment.path, e)).isDirectory();
        } catch {
          return false;
        }
      }).length;
      const files = entries.length - dirs;
      return `[Folder] ${attachment.name} (${files} files, ${dirs} folders)`;
    } catch {
      return `[Folder] ${attachment.name}`;
    }
  }

  if (attachment.type === "image") {
    const sizeStr = attachment.size ? formatSize(attachment.size) : "";
    return `[Image] ${attachment.name}${sizeStr ? ` (${sizeStr})` : ""}`;
  }

  const sizeStr = attachment.size ? formatSize(attachment.size) : "";
  return `[File] ${attachment.name}${sizeStr ? ` (${sizeStr})` : ""}`;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function readFileContent(path: string, maxSize: number = 100000): string | null {
  try {
    const stat = statSync(path);
    if (stat.size > maxSize) {
      const content = readFileSync(path, "utf-8").slice(0, maxSize);
      return content + `\n\n[File truncated - showing first ${formatSize(maxSize)} of ${formatSize(stat.size)}]`;
    }
    return readFileSync(path, "utf-8");
  } catch {
    return null;
  }
}

export function getFolderStructure(path: string, maxDepth: number = 3, maxFiles: number = 50): string {
  const lines: string[] = [];
  let fileCount = 0;

  function traverse(dir: string, prefix: string, depth: number) {
    if (depth > maxDepth || fileCount > maxFiles) return;

    try {
      const entries = readdirSync(dir).filter(e => !e.startsWith(".") && e !== "node_modules");

      entries.forEach((entry, index) => {
        if (fileCount > maxFiles) return;

        const entryPath = join(dir, entry);
        const isLast = index === entries.length - 1;
        const connector = isLast ? "└── " : "├── ";
        const newPrefix = prefix + (isLast ? "    " : "│   ");

        try {
          const stat = statSync(entryPath);
          if (stat.isDirectory()) {
            lines.push(`${prefix}${connector}${entry}/`);
            traverse(entryPath, newPrefix, depth + 1);
          } else {
            lines.push(`${prefix}${connector}${entry}`);
            fileCount++;
          }
        } catch {
          // Skip inaccessible files
        }
      });
    } catch {
      // Skip inaccessible directories
    }
  }

  lines.push(basename(path) + "/");
  traverse(path, "", 1);

  if (fileCount > maxFiles) {
    lines.push(`\n[...and more files]`);
  }

  return lines.join("\n");
}

// Convert attachments to format for agent.ask()
// SDK expects: 'image' | 'pdf' | 'text' | 'markdown' | 'code' | 'json' | 'file'
export function attachmentsToAgentFormat(attachments: Attachment[]): Array<{
  type: "image" | "pdf" | "text" | "markdown" | "code" | "json" | "file";
  path: string;
  name?: string;
}> {
  return attachments.map(att => {
    if (att.type === "image") {
      return {
        type: "image" as const,
        path: att.path,
        name: att.name,
      };
    }

    // For folders, we'll send as text with the folder structure
    if (att.type === "folder") {
      return {
        type: "text" as const,
        path: att.path,
        name: `${att.name} (folder structure)`,
      };
    }

    // Determine file type based on extension
    const ext = att.path.split(".").pop()?.toLowerCase() || "";

    if (ext === "pdf") {
      return { type: "pdf" as const, path: att.path, name: att.name };
    }
    if (ext === "md" || ext === "markdown") {
      return { type: "markdown" as const, path: att.path, name: att.name };
    }
    if (ext === "json") {
      return { type: "json" as const, path: att.path, name: att.name };
    }
    if (["ts", "tsx", "js", "jsx", "py", "rb", "go", "rs", "java", "c", "cpp", "h", "hpp", "sh", "bash"].includes(ext)) {
      return { type: "code" as const, path: att.path, name: att.name };
    }
    if (["txt", "log", "env", "yaml", "yml", "toml", "ini", "xml", "html", "css", "scss"].includes(ext)) {
      return { type: "text" as const, path: att.path, name: att.name };
    }

    // Default to file
    return {
      type: "file" as const,
      path: att.path,
      name: att.name,
    };
  });
}
