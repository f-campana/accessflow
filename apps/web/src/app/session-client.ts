"use client";

import { authErrorMessageFromBody } from "./auth-errors";

export type AuthMode = "sign-up/email" | "sign-in/email";
export type AuthPath = AuthMode | "sign-out";

export type RequestAuthJson = (
  path: AuthPath,
  payload: Record<string, unknown>
) => Promise<void>;

export const demoAuthPassword = "development-password";
export const authPassword = demoAuthPassword;

export const demoAccounts = {
  admin: {
    email: "admin@example.test",
    name: "AccessFlow Admin",
    password: demoAuthPassword
  },
  requester: {
    email: "requester@example.test",
    name: "AccessFlow Requester",
    password: demoAuthPassword
  },
  reviewer: {
    email: "reviewer@example.test",
    name: "AccessFlow Reviewer",
    password: demoAuthPassword
  }
} as const;

export const apiBaseUrl = () =>
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export const createClientId = () =>
  globalThis.crypto?.randomUUID?.() ??
  `fallback-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

export const requestAuthJson: RequestAuthJson = async (path, payload) => {
  const response = await fetch(`${apiBaseUrl()}/api/auth/${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    credentials: "include",
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(authErrorMessageFromBody(text, response.status));
  }
};
