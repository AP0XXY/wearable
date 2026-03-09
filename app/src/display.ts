/**
 * Display utilities — Format text for Even Realities G1/G2 constraints.
 *
 * G1: 576x136px, monochrome green, 40 chars/line, 5 lines/screen
 * G2: 576x288px, 4-bit greyscale, more room but still constrained
 */

const MAX_LINE_CHARS = 40;
const MAX_LINES = 5;
const MAX_TOTAL_CHARS = MAX_LINE_CHARS * MAX_LINES; // 200

/**
 * Format text for the glasses display.
 * Wraps at word boundaries, truncates to fit 5 lines of 40 chars.
 */
export function formatForGlasses(text: string): string {
  const inputLines = text.split("\n");
  const wrappedLines: string[] = [];

  for (const line of inputLines) {
    if (line.length <= MAX_LINE_CHARS) {
      wrappedLines.push(line);
    } else {
      // Word wrap
      const words = line.split(" ");
      let current = "";
      for (const word of words) {
        if (current.length + word.length + 1 <= MAX_LINE_CHARS) {
          current = current ? `${current} ${word}` : word;
        } else {
          if (current) wrappedLines.push(current);
          current = word.length > MAX_LINE_CHARS ? word.slice(0, MAX_LINE_CHARS) : word;
        }
      }
      if (current) wrappedLines.push(current);
    }

    if (wrappedLines.length >= MAX_LINES) break;
  }

  return wrappedLines.slice(0, MAX_LINES).join("\n");
}

/**
 * Available display modes and their icons.
 */
export const MODES = {
  examination: "EXAM",
  objection: "OBJ",
  research: "SEARCH",
  deposition: "DEPO",
  voir_dire: "VOIR",
} as const;

/**
 * Format a status bar line showing mode + battery.
 */
export function statusLine(mode: keyof typeof MODES, battery?: number): string {
  const modeTag = `[${MODES[mode]}]`;
  const batteryTag = battery !== undefined ? `${battery}%` : "";
  const padding = MAX_LINE_CHARS - modeTag.length - batteryTag.length;
  return `${modeTag}${" ".repeat(Math.max(1, padding))}${batteryTag}`;
}
