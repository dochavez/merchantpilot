/**
 * AG Studio 3.0's chat markdown renderer loops forever (freezing the tab) on any line whose trimmed
 * text starts with "#" but is not a complete `# heading` – e.g. a half-streamed "##" / "### ",
 * an indented heading, or "#1 issue". Every chunk is re-rendered while streaming, so a heading that
 * arrives in two chunks is enough to hang the browser.
 *
 * This filter makes model text safe before it leaves the server:
 *  - lines starting with "#" are held back until the line is complete (never streamed half-way);
 *  - complete headings become **bold** lines; any other "#..." line gets a zero-width prefix.
 * Everything else streams through untouched.
 */
const ZWSP = '​';

export function sanitizeLine(line: string): string {
  const trimmed = line.trimStart();
  if (!trimmed.startsWith('#')) return line;
  const m = trimmed.match(/^#{1,6}\s+(.+?)\s*#*\s*$/);
  if (m) {
    const title = m[1].replace(/\*\*/g, '').trim();
    return title ? `**${title}**` : '';
  }
  if (/^#+\s*$/.test(trimmed)) return '';
  return ZWSP + trimmed;
}

export function sanitizeMarkdown(text: string): string {
  return text.split('\n').map(sanitizeLine).join('\n');
}

/** Incremental version for streaming: push() returns the text that is safe to emit now. */
export class LineSafeFilter {
  private cur = '';
  private curEmitted = false;

  push(delta: string): string {
    let out = '';
    const pieces = delta.split('\n');
    pieces.forEach((piece, idx) => {
      if (this.curEmitted) out += piece;
      else {
        this.cur += piece;
        const t = this.cur.trimStart();
        if (t !== '' && !t.startsWith('#')) {
          out += this.cur;
          this.cur = '';
          this.curEmitted = true;
        }
      }
      if (idx < pieces.length - 1) {
        // newline: the current line is complete
        if (!this.curEmitted) out += sanitizeLine(this.cur);
        out += '\n';
        this.cur = '';
        this.curEmitted = false;
      }
    });
    return out;
  }

  end(): string {
    const out = this.curEmitted ? '' : sanitizeLine(this.cur);
    this.cur = '';
    this.curEmitted = false;
    return out;
  }
}
