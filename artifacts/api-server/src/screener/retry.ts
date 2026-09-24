import { logger } from "../lib/logger";
import { screenerConfig } from "./config";

function retryDelay(response: Response | undefined, attempt: number): number {
  const retryAfter = response?.headers.get("retry-after");
  const retryAfterSeconds = retryAfter ? Number(retryAfter) : Number.NaN;
  if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds >= 0) {
    return Math.min(30_000, retryAfterSeconds * 1000);
  }

  const exponential = screenerConfig.rpcBackoffMs * 2 ** attempt;
  const jitter = Math.floor(Math.random() * Math.max(100, screenerConfig.rpcBackoffMs));
  return Math.min(30_000, exponential + jitter);
}

export async function fetchWithRetry(
  url: string,
  init: RequestInit,
  label: string,
): Promise<Response> {
  let lastResponse: Response | undefined;
  let lastError: unknown;

  for (let attempt = 0; attempt <= screenerConfig.rpcMaxRetries; attempt += 1) {
    try {
      const response = await fetch(url, {
        ...init,
        signal: init.signal ?? AbortSignal.timeout(15_000),
      });
      lastResponse = response;
      if (response.ok || ![429, 500, 502, 503, 504].includes(response.status) || attempt === screenerConfig.rpcMaxRetries) {
        return response;
      }
      const delay = retryDelay(response, attempt);
      logger.warn({ label, status: response.status, attempt: attempt + 1, delay }, "Upstream request will retry");
      await new Promise((resolve) => setTimeout(resolve, delay));
    } catch (error) {
      lastError = error;
      if (attempt === screenerConfig.rpcMaxRetries) break;
      const delay = retryDelay(undefined, attempt);
      logger.warn({ err: error, label, attempt: attempt + 1, delay }, "Upstream request failed; will retry");
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  if (lastResponse) return lastResponse;
  throw lastError instanceof Error ? lastError : new Error(`Request failed for ${label}`);
}