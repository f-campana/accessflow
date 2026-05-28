const authCodeMessages: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD: "Invalid email or password"
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

export const authErrorMessageFromBody = (
  body: string,
  status: number
): string => {
  if (!body.trim()) {
    return `Auth request failed with ${status}`;
  }

  try {
    const parsed = JSON.parse(body) as unknown;

    if (isRecord(parsed)) {
      if (typeof parsed.message === "string" && parsed.message.trim()) {
        return parsed.message;
      }

      if (typeof parsed.code === "string" && parsed.code in authCodeMessages) {
        const message = authCodeMessages[parsed.code];

        if (message) {
          return message;
        }
      }
    }
  } catch {
    return body;
  }

  return body;
};

export const authErrorMessageFromCaught = (
  caught: unknown,
  fallback: string
): string => (caught instanceof Error ? caught.message : fallback);
