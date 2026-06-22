// HTTP client for the Editor (POST /api/detect, POST /api/generate).
// The error envelope matches the backend's:
//   { error: { code: string; message: string; detail?: unknown } }

import type { PipelineIR } from '@modules/ir';

export interface DetectResponse {
  ir: PipelineIR;
  warnings: { manifest: string; message: string }[];
}

export interface GenerateResponse {
  dockerfile: string;
  dockerignore: string;
}

export interface ErrorEnvelope {
  error: { code: string; message: string; detail?: unknown };
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly detail?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as Partial<ErrorEnvelope> & Partial<T>;
  if (!res.ok) {
    const env = (json as ErrorEnvelope).error;
    throw new ApiError(
      res.status,
      env?.code ?? 'UNKNOWN',
      env?.message ?? `Request failed with status ${res.status}`,
      env?.detail,
    );
  }
  return json as T;
}

export function postDetect(projectPath: string): Promise<DetectResponse> {
  return post<DetectResponse>('/api/detect', { projectPath });
}

export function postGenerate(ir: PipelineIR): Promise<GenerateResponse> {
  return post<GenerateResponse>('/api/generate', { ir });
}
