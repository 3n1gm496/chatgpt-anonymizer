export const composerVariants = [
  {
    name: 'chatgpt-contenteditable',
    expectedText: 'line 1\nline 2',
    html: `
      <main>
        <form>
          <section data-testid="composer-root">
            <div role="textbox" aria-multiline="true" contenteditable="true"></div>
          </section>
          <button data-testid="send-button" type="button" aria-label="Send message">Send</button>
        </form>
      </main>
    `,
  },
  {
    name: 'textarea-fallback',
    expectedText: 'line 1\nline 2',
    html: `
      <main>
        <form>
          <textarea aria-label="Message"></textarea>
          <button type="submit">Send</button>
        </form>
      </main>
    `,
  },
  {
    name: 'nested-contenteditable-heuristic',
    expectedText: 'line 1\nline 2',
    html: `
      <main>
        <form>
          <div data-testid="thread-composer">
            <div class="wrapper">
              <div contenteditable="true" aria-label="Message composer"></div>
            </div>
          </div>
          <div class="actions">
            <button aria-label="Send prompt" type="button">Send</button>
          </div>
        </form>
      </main>
    `,
  },
  {
    name: 'contenteditable-with-attachment-chip',
    expectedText: 'line 1\nline 2',
    html: `
      <main>
        <form>
          <div class="toolbar">
            <button type="button" aria-label="Upload file">Upload</button>
          </div>
          <div class="attachments">
            <div data-testid="attachment-chip">
              <span>referto.pdf</span>
              <button type="button" aria-label="Remove referto.pdf">X</button>
            </div>
          </div>
          <section data-testid="composer-root">
            <div role="textbox" aria-multiline="true" contenteditable="true"></div>
          </section>
          <button data-testid="send-button" type="button" aria-label="Send message">Send</button>
        </form>
      </main>
    `,
  },
  // Variant without a <form> wrapper — ChatGPT sometimes removes or restructures
  // the form element; the loose selector strategies must still discover the composer.
  {
    name: 'no-form-contenteditable',
    expectedText: 'line 1\nline 2',
    html: `
      <main>
        <div data-testid="composer-root">
          <div role="textbox" aria-multiline="true" contenteditable="true"></div>
        </div>
        <button data-testid="send-button" type="button" aria-label="Send message">Send</button>
      </main>
    `,
  },
  // Variant using data-testid="prompt-textarea" — the actual selector ChatGPT
  // has used for its textarea-based composer.
  {
    name: 'prompt-textarea-testid',
    expectedText: 'line 1\nline 2',
    html: `
      <main>
        <div>
          <textarea data-testid="prompt-textarea" placeholder="Message ChatGPT"></textarea>
          <button data-testid="send-button" type="button" aria-label="Send message">Send</button>
        </div>
      </main>
    `,
  },
] as const;
