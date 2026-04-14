export type MimeCategory = "image" | "video" | "audio" | "pdf" | "text" | "other";

const TEXT_MIME_PREFIXES = ["text/"];
const TEXT_MIME_EXACT = new Set([
  "application/json",
  "application/xml",
  "application/javascript",
  "application/x-sh",
  "application/x-yaml",
  "application/yaml",
]);

const IMAGE_EXTENSIONS = new Set([
  "png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "ico", "avif", "heic", "heif",
]);

const VIDEO_EXTENSIONS = new Set([
  "mp4", "mov", "webm", "mkv", "avi", "m4v", "mpg", "mpeg", "ogv", "qt", "3gp",
]);

const AUDIO_EXTENSIONS = new Set([
  "mp3", "wav", "flac", "ogg", "oga", "m4a", "aac", "opus", "wma",
]);

const PDF_EXTENSIONS = new Set(["pdf"]);

const TEXT_EXTENSIONS = new Set([
  "txt", "md", "markdown", "json", "yaml", "yml", "toml", "ini", "cfg",
  "js", "jsx", "ts", "tsx", "mjs", "cjs",
  "py", "rb", "go", "rs", "java", "kt", "swift", "c", "h", "cc", "cpp", "hpp",
  "cs", "php", "lua", "sh", "bash", "zsh", "fish", "ps1",
  "html", "htm", "css", "scss", "sass", "less",
  "xml", "svg", "csv", "tsv", "log", "env", "gitignore", "dockerfile",
  "sql", "graphql", "gql", "proto",
]);

function extOf(name: string | undefined): string {
  if (!name) return "";
  const dot = name.lastIndexOf(".");
  if (dot === -1) return "";
  return name.slice(dot + 1).toLowerCase();
}

export function mimeCategory(mime: string, name?: string): MimeCategory {
  const m = (mime || "").toLowerCase();

  if (m.startsWith("image/")) return "image";
  if (m.startsWith("video/")) return "video";
  if (m.startsWith("audio/")) return "audio";
  if (m === "application/pdf") return "pdf";

  if (TEXT_MIME_PREFIXES.some((p) => m.startsWith(p))) return "text";
  if (TEXT_MIME_EXACT.has(m)) return "text";

  if (m === "" || m === "application/octet-stream") {
    const ext = extOf(name);
    if (IMAGE_EXTENSIONS.has(ext)) return "image";
    if (VIDEO_EXTENSIONS.has(ext)) return "video";
    if (AUDIO_EXTENSIONS.has(ext)) return "audio";
    if (PDF_EXTENSIONS.has(ext)) return "pdf";
    if (TEXT_EXTENSIONS.has(ext)) return "text";
  }

  return "other";
}
