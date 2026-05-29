const authCodeMessages: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD: "Invalid email or password"
};

const safeAuthMessages = new Set(Object.values(authCodeMessages));

const genericAuthErrorMessage = "Auth request failed. Try again.";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const safeStatusMessage = (status: number) =>
  status >= 400 && status < 500
    ? `Auth request failed with ${status}`
    : genericAuthErrorMessage;

const messageFromCode = (code: unknown): string | null =>
  typeof code === "string" && code in authCodeMessages
    ? authCodeMessages[code] ?? null
    : null;

const messageFromWhitelistedText = (message: unknown): string | null => {
  if (typeof message !== "string") {
    return null;
  }

  const trimmed = message.trim();
  return safeAuthMessages.has(trimmed) ? trimmed : null;
};

const isImplementationShapedMessage = (message: string) => {
  const trimmed = message.trim();

  return (
    trimmed.startsWith("{") ||
    trimmed.startsWith("[") ||
    trimmed.includes('"code"') ||
    trimmed.includes('"message"') ||
    trimmed.length > 160
  );
};

export const authErrorMessageFromBody = (
  body: string,
  status: number
): string => {
  if (!body.trim()) {
    return safeStatusMessage(status);
  }

  try {
    const parsed = JSON.parse(body) as unknown;

    if (isRecord(parsed)) {
      return (
        messageFromCode(parsed.code) ??
        messageFromWhitelistedText(parsed.message) ??
        genericAuthErrorMessage
      );
    }
  } catch {
    return genericAuthErrorMessage;
  }

  return genericAuthErrorMessage;
};

export const authErrorMessageFromCaught = (
  caught: unknown,
  fallback: string
): string => {
  if (!(caught instanceof Error)) {
    return fallback;
  }

  const message = caught.message.trim();

  if (!message || isImplementationShapedMessage(message)) {
    return fallback;
  }

  return message;
};
