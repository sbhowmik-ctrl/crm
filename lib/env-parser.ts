/**
 * lib/env-parser.ts
 *
 * Parses raw .env file text into an array of { key, value } pairs.
 *
 * Handles:
 *  - KEY=VALUE
 *  - KEY="VALUE WITH SPACES"  (double-quoted)
 *  - KEY='VALUE WITH SPACES'  (single-quoted)
 *  - export KEY=VALUE          (shell-style prefix)
 *  - KEY=                      (empty value — included)
 *  - # full-line comments      (skipped)
 *  - blank lines               (skipped)
 *  - KEY = VALUE               (spaces around the = sign)
 *
 * Does NOT support multi-line values or inline comments after values,
 * which is intentional — .env parsers that do so silently misparse values
 * containing '#' characters.
 */

export interface EnvPair {
  key: string;
  value: string;
  /** 1-based source line number, useful for error reporting in the UI. */
  line: number;
}

export interface ParseEnvResult {
  pairs: EnvPair[];
  /** Lines that were not blank, not a comment, and could not be parsed. */
  skipped: Array<{ line: number; raw: string; reason: string }>;
}

// A valid env key: starts with a letter or underscore, followed by word chars.
const VALID_KEY_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

// Matches the optional "export " prefix some shell scripts use.
const EXPORT_PREFIX_RE = /^export\s+/;

export function parseEnvText(raw: string): ParseEnvResult {
  const pairs: EnvPair[]                                                 = [];
  const skipped: ParseEnvResult["skipped"]                               = [];

  const lines = raw.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const lineNumber = i + 1;
    const line       = lines[i];
    const trimmed    = line.trim();

    // Skip blank lines and full-line comments.
    if (trimmed === "" || trimmed.startsWith("#")) continue;

    // Strip optional "export " prefix.
    const withoutExport = trimmed.replace(EXPORT_PREFIX_RE, "");

    // Must contain at least one "=".
    const eqIndex = withoutExport.indexOf("=");
    if (eqIndex === -1) {
      skipped.push({ line: lineNumber, raw: line, reason: 'No "=" found.' });
      continue;
    }

    const key   = withoutExport.slice(0, eqIndex).trim();
    const rawValue = withoutExport.slice(eqIndex + 1); // do NOT trim yet — quotes first

    // Validate the key.
    if (!VALID_KEY_RE.test(key)) {
      skipped.push({
        line:   lineNumber,
        raw:    line,
        reason: `Invalid key "${key}". Keys must start with a letter or underscore and contain only letters, digits, and underscores.`,
      });
      continue;
    }

    const value = stripQuotes(rawValue.trim());

    pairs.push({ key, value, line: lineNumber });
  }

  return { pairs, skipped };
}

/**
 * Strips a matching pair of surrounding single or double quotes.
 * Only removes them when both the opening and closing quote match.
 */
function stripQuotes(s: string): string {
  if (s.length >= 2) {
    const first = s[0];
    const last  = s[s.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return s.slice(1, -1);
    }
  }
  return s;
}
