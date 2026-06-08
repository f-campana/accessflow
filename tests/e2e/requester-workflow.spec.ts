import { expect, test, type Page } from "@playwright/test";
import { eq } from "drizzle-orm";

import {
  createDraft,
  rejectRequest,
  startReview,
  submitRequest
} from "../../apps/api/src/commands/study-access";
import {
  demoAccounts,
  demoAuthPassword
} from "../../apps/api/src/db/demo-accounts";
import { db, pool } from "../../apps/api/src/db/client";
import {
  studies,
  studyAccessRequests,
  users
} from "../../apps/api/src/db/schema";

const uniqueRequesterEmail = () =>
  `requester-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`;

const demoReviewer = demoAccounts.find((account) => account.role === "reviewer");
const demoRequester = demoAccounts.find((account) => account.role === "requester");

if (!demoReviewer) {
  throw new Error("Reviewer demo account seed is missing");
}

if (!demoRequester) {
  throw new Error("Requester demo account seed is missing");
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

const findSeededActor = async (
  email: string,
  role: "requester" | "reviewer" | "admin"
) => {
  const [actor] = await db
    .select({
      id: users.id,
      email: users.email,
      role: users.role
    })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (!actor || actor.role !== role) {
    throw new Error(`Expected seeded ${role} actor ${email}`);
  }

  return {
    id: actor.id,
    email: actor.email,
    role
  };
};

const findLatestRequesterRequest = async (requesterId: string) => {
  const [request] = await db
    .select({
      id: studyAccessRequests.id,
      studyId: studyAccessRequests.studyId
    })
    .from(studyAccessRequests)
    .where(eq(studyAccessRequests.requesterId, requesterId))
    .limit(1);

  if (!request) {
    throw new Error(`Expected request for requester ${requesterId}`);
  }

  return request;
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

  await page.getByRole("button", { name: "Withdraw request" }).click();

  await expect(page.getByText(/Request .+ withdrawn\./)).toBeVisible();
  await expect(page.getByText("withdrawn", { exact: true })).toBeVisible();
  await expect(page.getByText("withdrawRequest")).toBeVisible();
  await expect(page.getByText("submitted to withdrawn")).toBeVisible();
  await expect(page.getByRole("button", { name: "Withdraw request" })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Create new request draft" })
  ).toBeVisible();
  await expectNoHorizontalOverflow(page);

  expect(consoleMessages).toEqual([]);
});

test("requester can withdraw an under-review request and reviewer sees it", async ({
  page
}) => {
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
  const reviewer = await findSeededActor(demoReviewer.email, "reviewer");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  await page.getByLabel("Email").fill(requesterEmail);
  await expect(page.getByLabel("Password")).toHaveValue(demoAuthPassword);
  await page.getByRole("button", { name: "Create new requester" }).click();

  await expect(
    page.getByRole("heading", { name: "Aurora Cardiometabolic Study" })
  ).toBeVisible();
  await page.getByRole("button", { name: "Create request draft" }).click();

  await expect(page.getByText(/Draft .+ created\./)).toBeVisible();
  await page
    .getByLabel("Purpose")
    .fill("Verify under-review requester withdrawal.");
  await page.getByLabel("Requested role").selectOption("viewer");
  await page
    .getByLabel("Justification")
    .fill("Requester should be able to withdraw while review is in progress.");
  await page.getByLabel("Affiliation").fill("AccessFlow E2E");
  await page
    .getByLabel("Supporting notes")
    .fill("Rendered coverage for under-review withdrawal.");
  await page.getByRole("button", { name: "Submit request" }).click();

  await expect(page.getByText(/Request .+ submitted\./)).toBeVisible();
  await expect(page.getByText("submitted", { exact: true })).toBeVisible();

  const requester = await findSeededActor(requesterEmail, "requester");
  const request = await findLatestRequesterRequest(requester.id);
  const started = await startReview(reviewer, {
    requestId: request.id,
    idempotencyKey: `under-review-withdraw-${crypto.randomUUID()}`
  });

  if (!started.ok) {
    throw new Error(started.error.message);
  }

  await page.reload();

  await expect(page.getByText("under review", { exact: true })).toBeVisible();
  await expect(page.getByText("startReview")).toBeVisible();
  await expect(page.getByText("submitted to under_review")).toBeVisible();
  await expect(page.getByRole("button", { name: "Withdraw request" })).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await page.getByRole("button", { name: "Withdraw request" }).click();

  await expect(page.getByText(/Request .+ withdrawn\./)).toBeVisible();
  await expect(page.getByText("withdrawn", { exact: true })).toBeVisible();
  await expect(page.getByText("withdrawRequest")).toBeVisible();
  await expect(page.getByText("under_review to withdrawn")).toBeVisible();
  await expect(page.getByRole("button", { name: "Withdraw request" })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Create new request draft" })
  ).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByText("No active session")).toBeVisible();

  await page.goto("/reviewer");
  await expect(page.getByLabel("Email")).toHaveValue(demoReviewer.email);
  await expect(page.getByLabel("Password")).toHaveValue(demoAuthPassword);
  await page.getByRole("button", { name: "Sign in" }).click();

  const withdrawnRequest = page
    .getByRole("button")
    .filter({ hasText: "Aurora Cardiometabolic Study" })
    .filter({ hasText: requesterEmail });

  await expect(withdrawnRequest).toBeVisible();
  await withdrawnRequest.click();
  await expect(
    page.getByLabel("Request record").getByText("withdrawn", { exact: true })
  ).toBeVisible();
  await expect(page.getByText("Request withdrawn by requester.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Start review" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Approve request" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Reject request" })).toHaveCount(0);
  await expect(page.getByText("submitRequest")).toBeVisible();
  await expect(page.getByText("startReview")).toBeVisible();
  await expect(page.getByText("withdrawRequest")).toBeVisible();
  await expect(page.getByText("under_review to withdrawn")).toBeVisible();
  await expectNoHorizontalOverflow(page);

  expect(consoleMessages).toEqual([]);
});

test("requester sees rejected final state after reviewer decision", async ({
  page
}) => {
  const consoleMessages: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning") {
      consoleMessages.push(`${message.type()}: ${message.text()}`);
    }
  });
  page.on("pageerror", (error) => {
    consoleMessages.push(`pageerror: ${error.message}`);
  });

  const rejectionReason = "Requester needs a narrower study scope.";

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  await expect(page.getByLabel("Email")).toHaveValue(demoRequester.email);
  await expect(page.getByLabel("Password")).toHaveValue(demoAuthPassword);
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(
    page.getByRole("heading", { name: "Aurora Cardiometabolic Study" })
  ).toBeVisible();
  await page.getByRole("button", { name: "Create request draft" }).click();

  await expect(page.getByText(/Draft .+ created\./)).toBeVisible();
  await page
    .getByLabel("Purpose")
    .fill("Evaluate final-state visibility for requester decisions.");
  await page.getByLabel("Requested role").selectOption("viewer");
  await page
    .getByLabel("Justification")
    .fill("The requester needs a durable final-state review.");
  await page.getByLabel("Affiliation").fill("AccessFlow E2E");
  await page
    .getByLabel("Supporting notes")
    .fill("Requester should still see rejected state after sign-in.");
  await page.getByRole("button", { name: "Submit request" }).click();

  await expect(page.getByText(/Request .+ submitted\./)).toBeVisible();
  await expect(page.getByText("submitted", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByText("No active session")).toBeVisible();

  await page.goto("/reviewer");
  await expect(page.getByLabel("Email")).toHaveValue(demoReviewer.email);
  await expect(page.getByLabel("Password")).toHaveValue(demoAuthPassword);
  await page.getByRole("button", { name: "Sign in" }).click();

  const seededRequest = page
    .getByRole("button")
    .filter({ hasText: "Aurora Cardiometabolic Study" })
    .filter({ hasText: demoRequester.email });

  await expect(seededRequest).toBeVisible();
  await seededRequest.click();
  await page.getByRole("button", { name: "Start review" }).click();
  await expect(page.getByText("Review started.")).toBeVisible();
  await page.getByLabel("Rejection reason").fill(rejectionReason);
  await page.getByRole("button", { name: "Reject request" }).click();
  await expect(page.getByText("Request rejected.")).toBeVisible();
  await expect(
    page.getByLabel("Request record").getByText("rejected", { exact: true })
  ).toBeVisible();
  await expect(
    page.locator(".timeline-panel").getByText(`Note: ${rejectionReason}`)
  ).toBeVisible();
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByText("No active reviewer session")).toBeVisible();

  await page.goto("/");
  await expect(page.getByLabel("Email")).toHaveValue(demoRequester.email);
  await expect(page.getByLabel("Password")).toHaveValue(demoAuthPassword);
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page.getByText("Signed in with a requester session.")).toBeVisible();
  await expect(page.getByText("rejected", { exact: true })).toBeVisible();
  await expect(page.getByText(/Rejected at .+/)).toBeVisible();
  await expect(page.getByText("Decision note:")).toBeVisible();
  await expect(
    page.locator(".submitted-note").filter({ hasText: rejectionReason })
  ).toBeVisible();
  await expect(page.getByText("submitRequest")).toBeVisible();
  await expect(page.getByText("startReview")).toBeVisible();
  await expect(page.getByText("rejectRequest")).toBeVisible();
  await expect(page.getByText("under_review to rejected")).toBeVisible();
  await expect(
    page.locator(".timeline-panel").getByText(`Note: ${rejectionReason}`)
  ).toBeVisible();
  await expect(page.getByLabel("Purpose")).toBeDisabled();
  await expect(page.getByRole("button", { name: "Save draft" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Submit request" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Reopen for edits" })).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await page.getByRole("button", { name: "Reopen for edits" }).click();

  await expect(page.getByText(/Request .+ reopened for edits\./)).toBeVisible();
  await expect(page.getByText("draft", { exact: true })).toBeVisible();
  await expect(page.getByText("reopenRequest")).toBeVisible();
  await expect(page.getByText("rejected to draft")).toBeVisible();
  await expect(page.getByText("Decision note:")).toHaveCount(0);
  await expect(
    page.locator(".timeline-panel").getByText(`Note: ${rejectionReason}`)
  ).toBeVisible();
  await expect(page.getByLabel("Purpose")).toBeEnabled();
  await expect(page.getByRole("button", { name: "Save draft" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Submit request" })).toBeEnabled();
  await expectNoHorizontalOverflow(page);

  const updatedPurpose = "Reopened draft with corrected access purpose.";
  await page.getByLabel("Purpose").fill(updatedPurpose);
  await page
    .getByLabel("Justification")
    .fill("The corrected request narrows the study access scope.");
  await page.getByRole("button", { name: "Save draft" }).click();

  await expect(page.getByText(/Draft .+ saved\./)).toBeVisible();

  await page.reload();

  await expect(page.getByText("draft", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Purpose")).toHaveValue(updatedPurpose);
  await expect(page.getByLabel("Purpose")).toBeEnabled();
  await expect(page.getByRole("button", { name: "Save draft" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Submit request" })).toBeEnabled();
  await expect(page.getByText("Decision note:")).toHaveCount(0);
  await expect(
    page.locator(".timeline-panel").getByText(`Note: ${rejectionReason}`)
  ).toBeVisible();
  await expectNoHorizontalOverflow(page);

  expect(consoleMessages).toEqual([]);
});

test("requester conflict refreshes stale submitted state", async ({ page }) => {
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
  const reviewer = await findSeededActor(demoReviewer.email, "reviewer");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  await page.getByLabel("Email").fill(requesterEmail);
  await page.getByRole("button", { name: "Create new requester" }).click();
  await expect(
    page.getByRole("heading", { name: "Aurora Cardiometabolic Study" })
  ).toBeVisible();

  await page.getByRole("button", { name: "Create request draft" }).click();
  await expect(page.getByText(/Draft .+ created\./)).toBeVisible();
  await page.getByLabel("Purpose").fill("Keep stale requester state visible.");
  await page.getByLabel("Requested role").selectOption("viewer");
  await page
    .getByLabel("Justification")
    .fill("Another reviewer will change the state before withdrawal.");
  await page.getByLabel("Affiliation").fill("AccessFlow E2E");
  await page.getByRole("button", { name: "Submit request" }).click();

  await expect(page.getByText(/Request .+ submitted\./)).toBeVisible();
  await expect(page.getByText("submitted", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Withdraw request" })).toBeVisible();

  const requester = await findSeededActor(requesterEmail, "requester");
  const request = await findLatestRequesterRequest(requester.id);
  const started = await startReview(reviewer, {
    requestId: request.id,
    idempotencyKey: `stale-requester-start-${crypto.randomUUID()}`
  });

  if (!started.ok) {
    throw new Error(started.error.message);
  }

  const rejected = await rejectRequest(reviewer, {
    requestId: request.id,
    idempotencyKey: `stale-requester-reject-${crypto.randomUUID()}`,
    reason: "State changed before requester withdrawal."
  });

  if (!rejected.ok) {
    throw new Error(rejected.error.message);
  }

  await page.getByRole("button", { name: "Withdraw request" }).click();

  await expect(page.getByText("Action is not available")).toBeVisible();
  await expect(page.getByText("rejected", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Withdraw request" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Reopen for edits" })).toBeVisible();
  await expect(page.getByText("rejectRequest")).toBeVisible();
  await expect(page.getByText("under_review to rejected")).toBeVisible();
  await expectNoHorizontalOverflow(page);

  expect(consoleMessages).toEqual([]);
});

test("reviewer can reject an under-review request with a durable reason", async ({
  page
}) => {
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
  const purpose = "Inspect submitted workflow evidence in a review workspace.";
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

  await expect(page.getByRole("heading", { name: "Review workspace" })).toBeVisible();
  await expect(page.getByLabel("Email")).toHaveValue(demoReviewer.email);
  await expect(page.getByLabel("Password")).toHaveValue(demoAuthPassword);
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(
    page.getByText("Signed in with reviewer access.")
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Workflow requests" })
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
  await expect(page.getByRole("button", { name: "Start review" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Approve request" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Reject request" })).toHaveCount(0);
  await expectNoHorizontalOverflow(page);

  await page.route("**/trpc/startReview**", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 500));
    await route.continue();
  });

  await page.getByRole("button", { name: "Start review" }).click();
  const statusLine = page.locator(".status-line");
  await expect(statusLine).toHaveAttribute("role", "status");
  await expect(statusLine).toHaveText("Starting review");
  await expect(page.locator("main")).toHaveAttribute("aria-busy", "true");

  await expect(page.getByText("Review started.")).toBeVisible();
  await expect(page.locator("main")).toHaveAttribute("aria-busy", "false");
  await expect(
    page.getByLabel("Request record").getByText("under_review", {
      exact: true
    })
  ).toBeVisible();
  await expect(page.getByText("startReview")).toBeVisible();
  await expect(page.getByText("submitted to under_review")).toBeVisible();
  await expect(page.getByRole("button", { name: "Start review" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Approve request" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Reject request" })).toBeVisible();
  await expect(page.getByLabel("Rejection reason")).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await page.unroute("**/trpc/startReview**");

  await page.getByRole("button", { name: "Reject request" }).click();

  await expect(page.locator(".error-banner")).toHaveText(
    "Rejection reason is required"
  );

  const rejectionReason = "Access purpose needs a narrower study scope.";

  await page.getByLabel("Rejection reason").fill(rejectionReason);

  await page.route("**/trpc/rejectRequest**", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 500));
    await route.continue();
  });

  await page.getByRole("button", { name: "Reject request" }).click();
  await expect(statusLine).toHaveAttribute("role", "status");
  await expect(statusLine).toHaveText("Rejecting request");
  await expect(page.locator("main")).toHaveAttribute("aria-busy", "true");

  await expect(page.getByText("Request rejected.")).toBeVisible();
  await expect(page.locator("main")).toHaveAttribute("aria-busy", "false");
  await expect(
    page.getByLabel("Request record").getByText("rejected", { exact: true })
  ).toBeVisible();
  await expect(page.getByText("Decision note")).toBeVisible();
  await expect(
    page.locator(".field-list").getByText(rejectionReason, { exact: true })
  ).toBeVisible();
  await expect(page.getByText("rejectRequest")).toBeVisible();
  await expect(page.getByText("under_review to rejected")).toBeVisible();
  await expect(
    page.locator(".timeline-panel").getByText(`Note: ${rejectionReason}`)
  ).toBeVisible();
  await expect(page.getByText(/Request rejected at .+\./)).toBeVisible();
  await expect(page.getByRole("button", { name: "Approve request" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Reject request" })).toHaveCount(0);
  await expectNoHorizontalOverflow(page);
  await page.unroute("**/trpc/rejectRequest**");

  expect(consoleMessages).toEqual([]);
});

test("reviewer conflict refreshes stale submitted detail", async ({ page }) => {
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
  const studyName = `Reviewer Stale Study ${Date.now()}`;
  const reviewer = await findSeededActor(demoReviewer.email, "reviewer");
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
      slug: `reviewer-stale-study-${crypto.randomUUID()}`,
      displayName: studyName,
      shortDescription: "Synthetic reviewer stale-state workspace.",
      sensitivityLabel: "Synthetic regulated workspace"
    })
    .returning({ id: studies.id });

  if (!study) {
    throw new Error("Failed to create reviewer stale-state study");
  }

  const created = await createDraft(requester, { studyId: study.id });

  if (!created.ok) {
    throw new Error(created.error.message);
  }

  const submitted = await submitRequest(requester, {
    draftId: created.value.draftId,
    idempotencyKey: `reviewer-stale-submit-${crypto.randomUUID()}`,
    purpose: "Expose stale reviewer start-review state.",
    requestedRole: "viewer",
    justification: "The request will enter review before the visible click.",
    affiliation: "AccessFlow Reviewer E2E"
  });

  if (!submitted.ok) {
    throw new Error(submitted.error.message);
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/reviewer");

  await expect(page.getByLabel("Email")).toHaveValue(demoReviewer.email);
  await page.getByRole("button", { name: "Sign in" }).click();

  const staleRequest = page
    .getByRole("button")
    .filter({ hasText: studyName })
    .filter({ hasText: requesterEmail });

  await expect(staleRequest).toBeVisible();
  await staleRequest.click();
  await expect(
    page.getByLabel("Request record").getByText("submitted", { exact: true })
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Start review" })).toBeVisible();

  const started = await startReview(reviewer, {
    requestId: submitted.value.requestId,
    idempotencyKey: `reviewer-stale-start-${crypto.randomUUID()}`
  });

  if (!started.ok) {
    throw new Error(started.error.message);
  }

  await page.getByRole("button", { name: "Start review" }).click();

  await expect(page.getByText("Only submitted requests can enter review.")).toBeVisible();
  await expect(
    page.getByLabel("Request record").getByText("under_review", {
      exact: true
    })
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Start review" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Approve request" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Reject request" })).toBeVisible();
  await expect(page.getByText("startReview")).toBeVisible();
  await expect(page.getByText("submitted to under_review")).toBeVisible();
  await expectNoHorizontalOverflow(page);

  expect(consoleMessages).toEqual([]);
});

test("reviewer can approve an under-review request", async ({ page }) => {
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
  const studyName = `Reviewer Approve Study ${Date.now()}`;
  const purpose = "Approve submitted workflow evidence in a review workspace.";
  const justification = "Reviewer needs to approve the persisted submission.";

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
      slug: `reviewer-approve-study-${crypto.randomUUID()}`,
      displayName: studyName,
      shortDescription: "Synthetic reviewer approval e2e workspace.",
      sensitivityLabel: "Synthetic regulated workspace"
    })
    .returning({ id: studies.id });

  if (!study) {
    throw new Error("Failed to create reviewer approval e2e study");
  }

  const created = await createDraft(requester, { studyId: study.id });

  if (!created.ok) {
    throw new Error(created.error.message);
  }

  const submitted = await submitRequest(requester, {
    draftId: created.value.draftId,
    idempotencyKey: `reviewer-approve-e2e-${crypto.randomUUID()}`,
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

  await expect(page.getByRole("heading", { name: "Review workspace" })).toBeVisible();
  await expect(page.getByLabel("Email")).toHaveValue(demoReviewer.email);
  await expect(page.getByLabel("Password")).toHaveValue(demoAuthPassword);
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(
    page.getByText("Signed in with reviewer access.")
  ).toBeVisible();

  const seededRequest = page
    .getByRole("button")
    .filter({ hasText: studyName })
    .filter({ hasText: requesterEmail });

  await expect(seededRequest).toBeVisible();
  await seededRequest.click();

  await expect(page.getByText(purpose)).toBeVisible();
  await expect(page.getByRole("button", { name: "Start review" })).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await page.getByRole("button", { name: "Start review" }).click();

  await expect(page.getByText("Review started.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Approve request" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Reject request" })).toBeVisible();

  await page.getByRole("button", { name: "Approve request" }).click();

  await expect(page.getByText("Request approved.")).toBeVisible();
  await expect(
    page.getByLabel("Request record").getByText("approved", { exact: true })
  ).toBeVisible();
  await expect(page.getByText("approveRequest")).toBeVisible();
  await expect(page.getByText("under_review to approved")).toBeVisible();
  await expect(page.getByText(/Request approved at .+\./)).toBeVisible();
  await expect(page.getByRole("button", { name: "Approve request" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Reject request" })).toHaveCount(0);
  await expectNoHorizontalOverflow(page);

  expect(consoleMessages).toEqual([]);
});
