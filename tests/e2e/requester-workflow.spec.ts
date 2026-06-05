import { expect, test, type Page } from "@playwright/test";

import { createDraft, submitRequest } from "../../apps/api/src/commands/study-access";
import {
  demoAccounts,
  demoAuthPassword
} from "../../apps/api/src/db/demo-accounts";
import { db, pool } from "../../apps/api/src/db/client";
import { studies, users } from "../../apps/api/src/db/schema";

const uniqueRequesterEmail = () =>
  `requester-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`;

const demoReviewer = demoAccounts.find((account) => account.role === "reviewer");

if (!demoReviewer) {
  throw new Error("Reviewer demo account seed is missing");
}

test.afterAll(async () => {
  await pool.end();
});

const expectNoHorizontalOverflow = async (page: Page) => {
  const overflow = await page.evaluate(() => ({
    bodyClientWidth: document.body.clientWidth,
    bodyScrollWidth: document.body.scrollWidth,
    documentClientWidth: document.documentElement.clientWidth,
    documentScrollWidth: document.documentElement.scrollWidth,
    bodyOverflowX: getComputedStyle(document.body).overflowX,
    documentOverflowX: getComputedStyle(document.documentElement).overflowX
  }));

  expect(overflow.documentOverflowX).not.toBe("hidden");
  expect(overflow.bodyOverflowX).not.toBe("hidden");
  expect(overflow.documentScrollWidth).toBeLessThanOrEqual(
    overflow.documentClientWidth + 1
  );
  expect(overflow.bodyScrollWidth).toBeLessThanOrEqual(
    overflow.bodyClientWidth + 1
  );
};

const expectFocusedElementInsideViewport = async (page: Page) => {
  const focusedElementBounds = await page.evaluate(() => {
    const activeElement = document.activeElement;

    if (!(activeElement instanceof HTMLElement)) {
      return null;
    }

    const rect = activeElement.getBoundingClientRect();

    return {
      bottom: rect.bottom,
      left: rect.left,
      right: rect.right,
      top: rect.top,
      viewportHeight: window.innerHeight,
      viewportWidth: window.innerWidth
    };
  });

  expect(focusedElementBounds).not.toBeNull();
  expect(focusedElementBounds?.left).toBeGreaterThanOrEqual(0);
  expect(focusedElementBounds?.right).toBeLessThanOrEqual(
    (focusedElementBounds?.viewportWidth ?? 0) + 1
  );
  expect(focusedElementBounds?.top).toBeGreaterThanOrEqual(0);
  expect(focusedElementBounds?.bottom).toBeLessThanOrEqual(
    (focusedElementBounds?.viewportHeight ?? 0) + 1
  );
};

test("requester can submit a durable study access request", async ({ page }) => {
  const consoleMessages: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning") {
      consoleMessages.push(`${message.type()}: ${message.text()}`);
    }
  });
  page.on("pageerror", (error) => {
    consoleMessages.push(`pageerror: ${error.message}`);
  });

  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "Study access request" })
  ).toBeVisible();
  await expectNoHorizontalOverflow(page);

  const requesterEmail = uniqueRequesterEmail();

  await page.getByLabel("Email").fill(requesterEmail);
  await expect(page.getByLabel("Password")).toHaveValue(demoAuthPassword);
  await page.getByRole("button", { name: "Create new requester" }).click();

  await expect(
    page.getByRole("heading", { name: "Aurora Cardiometabolic Study" })
  ).toBeVisible();
  await expect(page.getByText("Synthetic regulated workspace")).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await page.getByRole("button", { name: "Create request draft" }).click();

  await expect(page.getByText(/Draft .+ created\./)).toBeVisible();
  await expect(page.getByLabel("Purpose")).toBeEnabled();
  await expectNoHorizontalOverflow(page);

  await page.getByRole("button", { name: "Submit request" }).click();

  const errorSummary = page.locator("#request-error-summary");
  await expect(errorSummary).toBeFocused();
  await expect(errorSummary).toHaveAttribute("role", "alert");
  await expect(errorSummary).toHaveAttribute(
    "aria-labelledby",
    "request-error-summary-title"
  );
  await expect(page.getByText("Review the highlighted fields")).toBeVisible();
  await expect(
    errorSummary.getByRole("link", { name: "Purpose: Purpose is required" })
  ).toBeVisible();
  await expect(
    errorSummary.getByRole("link", {
      name: "Requested role: Requested role is required"
    })
  ).toBeVisible();
  await expect(page.getByText("Purpose is required", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Requested role is required", { exact: true })
  ).toBeVisible();
  await expect(
    page.getByText("Justification is required", { exact: true })
  ).toBeVisible();
  await expect(
    page.getByText("Affiliation is required", { exact: true })
  ).toBeVisible();
  await expect(page.getByLabel("Purpose")).toHaveAttribute(
    "aria-describedby",
    "request-purpose-error"
  );
  await expect(page.getByLabel("Purpose")).toHaveAttribute(
    "aria-invalid",
    "true"
  );
  await expectFocusedElementInsideViewport(page);
  await expectNoHorizontalOverflow(page);
  await expect(page.locator("#request-purpose-error")).toHaveText(
    "Purpose is required"
  );
  await expect(page.getByLabel("Requested role")).toHaveAttribute(
    "aria-describedby",
    "request-requestedRole-error"
  );
  await expect(page.locator("#request-requestedRole-error")).toHaveText(
    "Requested role is required"
  );

  await errorSummary
    .getByRole("link", {
      name: "Requested role: Requested role is required"
    })
    .click();
  await expect(page.getByLabel("Requested role")).toBeFocused();

  await page
    .getByLabel("Purpose")
    .fill("Evaluate aggregate cardiometabolic workspace access.");
  await page.getByLabel("Requested role").selectOption("viewer");
  await page
    .getByLabel("Justification")
    .fill("Need review access for a synthetic research workflow verification.");
  await page.getByLabel("Affiliation").fill("AccessFlow QA");
  await page
    .getByLabel("Supporting notes")
    .fill("Executable browser coverage for the requester workflow.");

  await page.route("**/trpc/saveDraft**", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 500));
    await route.continue();
  });

  await page.getByRole("button", { name: "Save draft" }).click();
  const statusLine = page.locator(".status-line");
  await expect(statusLine).toHaveAttribute("role", "status");
  await expect(statusLine).toHaveAttribute("aria-live", "polite");
  await expect(statusLine).toHaveAttribute("aria-atomic", "true");
  await expect(statusLine).toHaveText("Saving draft");
  await expect(page.locator("main")).toHaveAttribute("aria-busy", "true");
  await expect(page.locator(".request-panel")).toHaveAttribute(
    "aria-busy",
    "true"
  );
  await expect(page.locator(".request-form")).toHaveAttribute(
    "aria-busy",
    "true"
  );
  await expect(page.getByText(/Draft .+ saved\./)).toBeVisible();
  await expect(page.locator("main")).toHaveAttribute("aria-busy", "false");
  await page.unroute("**/trpc/saveDraft**");

  await page.getByRole("button", { name: "Submit request" }).click();

  await expect(page.getByText(/Request .+ submitted\./)).toBeVisible();
  await expect(page.getByText("submitted", { exact: true })).toBeVisible();
  await expect(page.getByText("submitRequest")).toBeVisible();
  await expect(page.getByText("draft to submitted")).toBeVisible();
  await expect(page.getByRole("button", { name: "Submit request" })).toBeDisabled();
  await expectNoHorizontalOverflow(page);

  await page.reload();

  await expect(page.getByText("submitted", { exact: true })).toBeVisible();
  await expect(page.getByText("submitRequest")).toBeVisible();
  await expect(page.getByText("draft to submitted")).toBeVisible();
  await expect(page.getByLabel("Purpose")).toBeDisabled();
  await expectNoHorizontalOverflow(page);

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByText("No active session")).toBeVisible();

  await page.reload();

  await expect(page.getByText("No active session")).toBeVisible();
  await page.getByLabel("Email").fill(requesterEmail);
  await expect(page.getByLabel("Password")).toHaveValue(demoAuthPassword);
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page.getByText("Signed in with a requester session.")).toBeVisible();
  await expect(page.getByText("submitted", { exact: true })).toBeVisible();
  await expect(page.getByText("submitRequest")).toBeVisible();
  await expect(page.getByText("draft to submitted")).toBeVisible();
  await expect(page.getByLabel("Purpose")).toBeDisabled();
  await expectNoHorizontalOverflow(page);

  expect(consoleMessages).toEqual([]);
});

test("reviewer can inspect submitted requests without mutations", async ({ page }) => {
  const consoleMessages: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning") {
      consoleMessages.push(`${message.type()}: ${message.text()}`);
    }
  });
  page.on("pageerror", (error) => {
    consoleMessages.push(`pageerror: ${error.message}`);
  });

  const requesterEmail = uniqueRequesterEmail();
  const studyName = `Reviewer Study ${Date.now()}`;
  const purpose = "Inspect submitted workflow evidence in a reviewer queue.";
  const justification = "Reviewer needs to confirm the persisted submission.";

  const requester = {
    id: crypto.randomUUID(),
    email: requesterEmail,
    role: "requester" as const
  };

  await db.insert(users).values({
    id: requester.id,
    name: requesterEmail,
    email: requester.email,
    emailVerified: true,
    role: requester.role
  });

  const [study] = await db
    .insert(studies)
    .values({
      slug: `reviewer-study-${crypto.randomUUID()}`,
      displayName: studyName,
      shortDescription: "Synthetic reviewer e2e workspace.",
      sensitivityLabel: "Synthetic regulated workspace"
    })
    .returning({ id: studies.id });

  if (!study) {
    throw new Error("Failed to create reviewer e2e study");
  }

  const created = await createDraft(requester, { studyId: study.id });

  if (!created.ok) {
    throw new Error(created.error.message);
  }

  const submitted = await submitRequest(requester, {
    draftId: created.value.draftId,
    idempotencyKey: `reviewer-e2e-${crypto.randomUUID()}`,
    purpose,
    requestedRole: "viewer",
    justification,
    affiliation: "AccessFlow Reviewer E2E"
  });

  if (!submitted.ok) {
    throw new Error(submitted.error.message);
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/reviewer");

  await expect(page.getByRole("heading", { name: "Reviewer queue" })).toBeVisible();
  await expect(page.getByLabel("Email")).toHaveValue(demoReviewer.email);
  await expect(page.getByLabel("Password")).toHaveValue(demoAuthPassword);
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(
    page.getByText("Signed in with reviewer access.")
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Submitted requests" })
  ).toBeVisible();

  const seededRequest = page
    .getByRole("button")
    .filter({ hasText: studyName })
    .filter({ hasText: requesterEmail });

  await expect(seededRequest).toBeVisible();
  await seededRequest.click();

  await expect(page.getByText(purpose)).toBeVisible();
  await expect(page.getByText(justification)).toBeVisible();
  await expect(page.getByText("submitRequest")).toBeVisible();
  await expect(page.getByText("draft to submitted")).toBeVisible();
  await expect(page.getByRole("button", { name: /approve/i })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /reject/i })).toHaveCount(0);
  await expectNoHorizontalOverflow(page);

  expect(consoleMessages).toEqual([]);
});
