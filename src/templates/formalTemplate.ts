export function formalTemplate(commitRef: string, gitDiffText: string, metadataText: string): string {
  return `
# Executive Commit Summary

Commit Reference: \`${commitRef}\`

## Commit Metadata
${metadataText}

## Diff Overview
${gitDiffText}
`;
}
export function formatSummaryReport(data: {
  summary: string;
  architecturalImpact: string;
  breakingChanges: string;
  securityNotes: string;
}): string {
  return `
# Executive Commit Summary

## Executive Overview
${data.summary}

---

## 🏗️ Architectural & Structural Impact
${data.architecturalImpact}

---

## ⚠️ Breaking Changes & Risk Assessment
${data.breakingChanges}

---

## 🔒 Security & Dependency Considerations
${data.securityNotes}
`;
}