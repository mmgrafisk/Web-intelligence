import {
  captureRequestSchema,
  type CaptureRequestDto,
} from "@bookmark-platform/schemas";

export type CaptureRequest = CaptureRequestDto;
export type CaptureCollection = CaptureRequest["collection"];

const maximumCaptureTokenLength = 12_000;

function encodeUtf8(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function decodeUtf8(value: string): string {
  const binary = atob(value);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function toBase64Url(value: string): string {
  return encodeUtf8(value)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/u, "");
}

function fromBase64Url(value: string): string {
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/");
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  return decodeUtf8(`${base64}${padding}`);
}

export function createCaptureRequest(input: {
  collection: CaptureCollection;
  requestedAt?: string;
  title: string;
  url: string;
}): CaptureRequest {
  return captureRequestSchema.parse({
    version: 1,
    source: "extension",
    url: input.url,
    title: input.title,
    collection: input.collection,
    requestedAt: input.requestedAt ?? new Date().toISOString(),
  });
}

export function encodeCaptureRequest(request: CaptureRequest): string {
  const validated = captureRequestSchema.parse(request);
  return toBase64Url(JSON.stringify(validated));
}

export function decodeCaptureRequest(token: string): CaptureRequest {
  if (!token || token.length > maximumCaptureTokenLength) {
    throw new Error("The Quick Save request is invalid or too large.");
  }

  try {
    return captureRequestSchema.parse(JSON.parse(fromBase64Url(token)));
  } catch {
    throw new Error("The Quick Save request could not be validated.");
  }
}

export function decodeCaptureHash(hash: string): CaptureRequest | undefined {
  const parameters = new URLSearchParams(hash.replace(/^#/u, ""));
  const token = parameters.get("capture");
  return token === null ? undefined : decodeCaptureRequest(token);
}

export function normalizeLibraryUrl(input: string): string {
  const url = new URL(input.trim());
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("The library address must use HTTP or HTTPS.");
  }
  url.hash = "";
  url.search = "";
  return url.toString();
}

export function buildCaptureUrl(
  libraryUrl: string,
  request: CaptureRequest,
): string {
  const target = new URL(normalizeLibraryUrl(libraryUrl));
  target.hash = `capture=${encodeCaptureRequest(request)}`;
  return target.toString();
}
