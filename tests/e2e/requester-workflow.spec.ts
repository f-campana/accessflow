import { expect, test, type Page } from "@playwright/test";

const password = "development-password";

const uniqueRequesterEmail = () =>
  `requester-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`;

const expectNoHorizontalOverflow = async (page: Page) => {
  const overflow = await page.evaluate(() => ({
    bodyClientWidth: document.body.clientWidth,
    bodyScrollWidth: document.body.scrollWidth,
    documentClientWidth: document.documentElement.clientWidth,
    documentScrollWidth: document.documentElement.scrollWidth
  }));

  expect(overflow.documentScrollWidth).toBeLessThanOrEqual(
    overflow.documentClientWidth + 1
  );
  expect(overflow.bodyScrollWidth).toBeLessThanOrEqual(
    overflow.bodyClientWidth + 1
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

  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "Study access request" })
  ).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await page.getByLabel("Email").fill(uniqueRequesterEmail());
  await expect(page.getByLabel("Password")).toHaveValue(password);
  await page.getByRole("button", { name: "Sign up" }).click();

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

  expect(consoleMessages).toEqual([]);
});
