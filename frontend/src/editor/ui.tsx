// Small shared UI utilities: file download + copy-to-clipboard button.

import { useState } from 'react';
import JSZip from 'jszip';

export function download(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Download a set of files as a zip, preserving their paths (UX-03).
 *
 * The workspace bundle used to be delivered one file at a time with its
 * path flattened — `frontend/Dockerfile` arrived as `frontend__Dockerfile`.
 * A five-service bundle is around sixteen downloads the user then has to
 * rename and re-file by hand, which is a poor last mile for a product whose
 * proposition is "generate everything together".
 *
 * Paths are kept verbatim, so extracting the archive at the project root
 * puts every artifact where it belongs.
 */
export async function downloadZip(
  filename: string,
  files: { path: string; content: string }[],
): Promise<void> {
  const zip = new JSZip();
  for (const file of files) zip.file(file.path, file.content);
  const blob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="btn btn--small"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          /* clipboard unavailable (http, permissions) */
        }
      }}
    >
      {copied ? 'Copied ✓' : label}
    </button>
  );
}
