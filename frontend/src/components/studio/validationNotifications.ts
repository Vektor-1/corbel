export type ValidationNotification = {
  level: "success" | "warning";
  message: string;
};

/**
 * Creates the concise, transient summary shown after validation completes.
 * Detailed issues remain available in the persistent ValidationFeedback panel.
 */
export function getValidationNotification(issueCount: number): ValidationNotification {
  if (issueCount === 0) {
    return {
      level: "success",
      message: "No validation issues found in the current checks.",
    };
  }

  return {
    level: "warning",
    message: `Found ${issueCount} validation issue${issueCount === 1 ? "" : "s"}. Review them below.`,
  };
}
