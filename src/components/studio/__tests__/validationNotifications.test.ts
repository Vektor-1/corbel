import { describe, expect, it } from "vitest";
import { getValidationNotification } from "../validationNotifications";

describe("getValidationNotification", () => {
  it("reports a successful validation when there are no issues", () => {
    expect(getValidationNotification(0)).toEqual({
      level: "success",
      message: "No validation issues found in the current checks.",
    });
  });

  it("uses singular wording for one issue", () => {
    expect(getValidationNotification(1)).toEqual({
      level: "warning",
      message: "Found 1 validation issue. Review them below.",
    });
  });

  it("uses plural wording for multiple issues", () => {
    expect(getValidationNotification(2)).toEqual({
      level: "warning",
      message: "Found 2 validation issues. Review them below.",
    });
  });
});
