import type { ArtifactCategory } from '@/types/task';

export interface ParsedArtifact {
  filename: string;
  category: ArtifactCategory;
  content: string;
}

export interface ParseResult {
  artifacts: ParsedArtifact[];
  /** Text outside artifact blocks (typically the agent's summary) */
  summary: string;
}

const ARTIFACT_REGEX = /<<<ARTIFACT\s+filename="([^"]+)"\s+category="([^"]+)">>>([\s\S]*?)<<<END_ARTIFACT>>>/g;

/**
 * Parses <<<ARTIFACT>>> delimited blocks from model output text.
 * Returns extracted artifacts and any remaining text as a summary.
 */
export function parseArtifacts(text: string): ParseResult {
  const artifacts: ParsedArtifact[] = [];
  const summaryParts: string[] = [];
  let lastEnd = 0;

  let match: RegExpExecArray | null;
  // Reset regex state for each call
  ARTIFACT_REGEX.lastIndex = 0;

  while ((match = ARTIFACT_REGEX.exec(text)) !== null) {
    // Collect text between artifacts as summary
    if (match.index > lastEnd) {
      const between = text.slice(lastEnd, match.index).trim();
      if (between) summaryParts.push(between);
    }
    lastEnd = match.index + match[0].length;

    artifacts.push({
      filename: match[1],
      category: match[2] as ArtifactCategory,
      content: match[3].trim(),
    });
  }

  // Remaining text after last artifact
  if (lastEnd < text.length) {
    const remaining = text.slice(lastEnd).trim();
    if (remaining) summaryParts.push(remaining);
  }

  return {
    artifacts,
    summary: summaryParts.join('\n'),
  };
}
