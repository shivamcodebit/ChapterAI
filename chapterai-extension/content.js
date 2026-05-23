/* ============================================================
   ChapterAI – Content Script
   Handles transcript extraction from YouTube Studio pages
   ============================================================ */

(() => {
  'use strict';

  // Filler words to remove from transcript
  const FILLER_WORDS = /\b(um|uh|uhm|uhh|umm|like|you know|i mean|sort of|kind of|basically|actually|literally|right)\b/gi;

  /**
   * Wait for a DOM element matching the selector to appear.
   * Returns a promise that resolves with the element.
   */
  function waitForElement(selector, timeout = 10000) {
    return new Promise((resolve, reject) => {
      const el = document.querySelector(selector);
      if (el) return resolve(el);

      const observer = new MutationObserver(() => {
        const found = document.querySelector(selector);
        if (found) {
          observer.disconnect();
          resolve(found);
        }
      });

      observer.observe(document.body, { childList: true, subtree: true });

      setTimeout(() => {
        observer.disconnect();
        reject(new Error(`Element "${selector}" not found within ${timeout}ms`));
      }, timeout);
    });
  }

  /**
   * Clean raw transcript text:
   *  - Strip filler words
   *  - Normalize whitespace
   *  - Preserve timestamp markers if present
   */
  function cleanTranscript(raw) {
    let text = raw
      // Remove filler words
      .replace(FILLER_WORDS, '')
      // Collapse multiple spaces
      .replace(/[ \t]+/g, ' ')
      // Collapse multiple newlines
      .replace(/\n{3,}/g, '\n\n')
      // Trim lines
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .join('\n');

    return text;
  }

  /**
   * Parse a timestamp string (e.g. "1:23" or "01:23:45") to total seconds.
   */
  function parseTimestamp(ts) {
    const parts = ts.split(':').map(Number);
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    return parts[0] || 0;
  }

  /**
   * Attempt to extract transcript from the captions/subtitles panel in YT Studio.
   * Tries multiple known selectors.
   */
  function extractFromCaptionsPanel() {
    // Possible selectors for transcript segments in YouTube Studio
    const segmentSelectors = [
      '.ytcp-transcript-segment',
      'ytcp-transcript-segment',
      '.caption-window',
      '.cue-group',
      '[class*="transcript"] [class*="segment"]',
      '[class*="caption"] [class*="line"]',
      '[class*="subtitle"] [class*="segment"]'
    ];

    for (const selector of segmentSelectors) {
      const segments = document.querySelectorAll(selector);
      if (segments.length > 0) {
        const lines = [];
        segments.forEach(seg => {
          // Try to find timestamp element within segment
          const timeEl = seg.querySelector('[class*="time"], [class*="timestamp"], time');
          const textEl = seg.querySelector('[class*="text"], [class*="body"], [class*="content"]') || seg;

          const timestamp = timeEl ? timeEl.textContent.trim() : '';
          const text = textEl.textContent.trim();

          if (text) {
            lines.push(timestamp ? `${timestamp} ${text}` : text);
          }
        });

        if (lines.length > 0) {
          return lines.join('\n');
        }
      }
    }

    return null;
  }

  /**
   * Fallback: extract visible timestamped lines from the description or chapters area.
   */
  function extractFromDescription() {
    // Look for the description text box
    const descSelectors = [
      '#description-textarea',
      'ytcp-mention-textbox[label="Description"]',
      'ytcp-social-suggestions-textbox #textbox',
      '#description-container #textbox',
      '[aria-label="Tell viewers about your video (type @ to mention a channel)"]',
      'div#description-wrapper #textbox'
    ];

    for (const selector of descSelectors) {
      const el = document.querySelector(selector);
      if (el) {
        const text = el.innerText || el.textContent || '';
        // Look for lines that appear to be timestamped chapters
        const timestampedLines = text.split('\n').filter(line =>
          /^\d{1,2}:\d{2}/.test(line.trim())
        );
        if (timestampedLines.length >= 2) {
          return timestampedLines.join('\n');
        }
        // If there's substantial text (even without timestamps), return it
        if (text.trim().length > 100) {
          return text.trim();
        }
      }
    }

    return null;
  }

  /**
   * Attempt to extract transcript from any visible text on the page
   * that resembles transcript content (timestamps + text patterns).
   */
  function extractFromVisibleText() {
    // Look for any element that contains transcript-like content
    const allText = document.body.innerText || '';
    const lines = allText.split('\n');
    const timestampedLines = [];

    for (const line of lines) {
      const trimmed = line.trim();
      // Match lines that start with a timestamp pattern like "0:00" or "12:34"
      if (/^\d{1,2}:\d{2}(?::\d{2})?\s/.test(trimmed) && trimmed.length > 6) {
        timestampedLines.push(trimmed);
      }
    }

    if (timestampedLines.length >= 3) {
      return timestampedLines.join('\n');
    }

    return null;
  }

  /**
   * Main transcript extraction pipeline.
   * Tries methods in order of reliability.
   */
  function extractTranscript() {
    // Method 1: captions panel
    let transcript = extractFromCaptionsPanel();
    if (transcript) {
      console.log('[ChapterAI] Transcript extracted from captions panel');
      return { source: 'captions', text: cleanTranscript(transcript) };
    }

    // Method 2: description field
    transcript = extractFromDescription();
    if (transcript) {
      console.log('[ChapterAI] Transcript extracted from description');
      return { source: 'description', text: cleanTranscript(transcript) };
    }

    // Method 3: visible timestamped text
    transcript = extractFromVisibleText();
    if (transcript) {
      console.log('[ChapterAI] Transcript extracted from visible text');
      return { source: 'visible', text: cleanTranscript(transcript) };
    }

    // No transcript found
    return null;
  }

  /**
   * Insert text into the YouTube Studio description field.
   * Uses InputEvent to properly trigger React/Polymer state updates.
   */
  function insertIntoDescription(chaptersText) {
    const descSelectors = [
      '#description-textarea #textbox',
      'ytcp-mention-textbox#description-textarea #textbox',
      '#description-container #textbox',
      'ytcp-social-suggestions-textbox #textbox',
      '[aria-label="Tell viewers about your video (type @ to mention a channel)"]',
      'div#description-wrapper #textbox',
      '#description-textarea',
      'ytcp-mention-textbox[label="Description"] #textbox'
    ];

    let descField = null;
    for (const selector of descSelectors) {
      descField = document.querySelector(selector);
      if (descField) break;
    }

    if (!descField) {
      throw new Error('Description field not found. Please make sure you have the video details page open.');
    }

    // Focus the element
    descField.focus();

    // Get existing content
    const existingText = descField.innerText || descField.textContent || '';

    // Build new content: existing + separator + chapters
    const separator = existingText.trim() ? '\n\n' : '';
    const newContent = existingText.trim() + separator + chaptersText;

    // Clear and set content
    descField.textContent = '';

    // Use execCommand for undo support and proper state update
    document.execCommand('selectAll', false, null);
    document.execCommand('insertText', false, newContent);

    // Also dispatch events to ensure React/Polymer catches the change
    const inputEvent = new InputEvent('input', {
      bubbles: true,
      cancelable: true,
      inputType: 'insertText',
      data: newContent
    });
    descField.dispatchEvent(inputEvent);

    // Dispatch change event
    descField.dispatchEvent(new Event('change', { bubbles: true }));

    // Some YT Studio implementations use a custom event
    descField.dispatchEvent(new Event('yt-formatted-string-changed', { bubbles: true }));

    return true;
  }

  // Expose functions globally for panel.js to use
  window.__chapterAI = {
    extractTranscript,
    insertIntoDescription,
    cleanTranscript,
    parseTimestamp
  };

  console.log('[ChapterAI] Content script loaded and ready');
})();
