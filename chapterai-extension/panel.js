/* ============================================================
   ChapterAI – Panel UI Logic
   Handles the floating sidebar panel, AI generation, and user
   interactions within YouTube Studio.
   ============================================================ */

(() => {
  'use strict';

  // ── State ──
  let chapters = [];
  let isGenerating = false;
  let panelVisible = false;
  let dragState = { active: false, offsetX: 0, offsetY: 0 };
  let apiKey = '';
  let apiModel = 'gemini-2.5-flash'; // Default model for cloud API
  let apiEngine = 'local'; // 'local' (Gemini Nano) or 'cloud' (Gemini API)
  let showSettings = false;

  // ── Constants ──
  const SYSTEM_PROMPT = `You are a YouTube SEO expert. Given a video transcript, generate 5–10 perfectly formatted video chapters.

Rules:
- Start ALWAYS with "0:00 – [Intro topic]"
- Each chapter must have a keyword-rich, search-optimized title (max 50 chars)
- Chapters should reflect natural topic shifts in the content
- Space chapters at least 1–2 minutes apart
- Output ONLY the formatted list, nothing else

Format:
0:00 – Chapter Title Here
1:45 – Next Chapter Title
3:20 – Another Chapter Title`;

  async function loadSettings() {
    return new Promise((resolve) => {
      chrome.storage?.local?.get(['geminiApiKey', 'geminiModel'], (result) => {
        apiKey = result?.geminiApiKey || '';
        
        let storedModel = result?.geminiModel || 'gemini-2.5-flash';
        // Auto-migrate legacy deprecated model name
        if (storedModel === 'gemini-1.5-flash') {
          storedModel = 'gemini-2.5-flash';
          chrome.storage?.local?.set({ geminiModel: 'gemini-2.5-flash' });
        }
        apiModel = storedModel;
        
        // Detect engine availability
        if (window.ai && window.ai.languageModel) {
          apiEngine = 'local';
        } else {
          apiEngine = 'cloud';
        }
        resolve();
      });
    });
  }

  // ── Build the Panel DOM ──
  function createPanel() {
    // Check if panel already exists
    if (document.getElementById('chapterai-panel')) return;

    const panel = document.createElement('div');
    panel.id = 'chapterai-panel';
    
    // Determine engine badge HTML
    const engineBadgeHtml = apiEngine === 'local' 
      ? '<span class="chai-engine-badge" id="chai-engine-status">On-Device AI</span>'
      : '<span class="chai-engine-badge cloud" id="chai-engine-status">Cloud AI</span>';

    panel.innerHTML = `
      <div class="chai-header" id="chai-drag-handle">
        <div class="chai-drag-indicator"></div>
        <div class="chai-logo">
          <span class="chai-logo-icon">⚡</span>
          <span class="chai-logo-text">ChapterAI</span>
          ${engineBadgeHtml}
        </div>
        <div style="display: flex; align-items: center;">
          <button class="chai-settings-icon-btn" id="chai-settings-toggle" title="Settings">⚙</button>
          <button class="chai-close-btn" id="chai-close" title="Close panel">✕</button>
        </div>
      </div>

      <div class="chai-body">
        <!-- Settings Panel -->
        <div class="chai-settings-panel" id="chai-settings">
          <div class="chai-settings-title">Extension Settings</div>
          
          <div class="chai-input-group" style="margin-bottom: 10px;">
            <label class="chai-label" for="chai-api-key">
              <span>Gemini Cloud API Key (Fallback)</span>
              <a href="https://aistudio.google.com/apikey" target="_blank" class="chai-link">Get Free Key ↗</a>
            </label>
            <input type="password" id="chai-api-key" class="chai-api-input" placeholder="Paste your API key here" value="${apiKey}" />
          </div>

          <div class="chai-input-group">
            <label class="chai-label" for="chai-api-model">
              <span>Gemini Cloud Model Name</span>
            </label>
            <div class="chai-input-wrapper">
              <input type="text" id="chai-api-model" class="chai-api-input" placeholder="e.g. gemini-2.5-flash" value="${apiModel}" />
              <button class="chai-save-key-btn" id="chai-save-key">Save Settings</button>
            </div>
          </div>
        </div>

        <div class="chai-status" id="chai-status">
          <span class="chai-status-icon"></span>
          <span class="chai-status-message"></span>
        </div>

        <button class="chai-generate-btn" id="chai-generate">
          <span class="btn-content">
            <span>⚡</span>
            <span>Generate Chapters</span>
          </span>
        </button>

        <div class="chai-shortcut-hint">
          Press <kbd>Alt</kbd> + <kbd>Shift</kbd> + <kbd>C</kbd> to generate
        </div>

        <div class="chai-loading" id="chai-loading">
          <div class="chai-pulse-ring"></div>
          <span class="chai-loading-text" id="chai-loading-label">Analyzing transcript</span>
        </div>

        <div class="chai-results" id="chai-results">
          <div class="chai-results-header">
            <span class="chai-results-title">Generated Chapters</span>
            <span class="chai-chapter-count" id="chai-count">0</span>
          </div>
          <div id="chai-chapters-list"></div>
        </div>

        <div class="chai-actions" id="chai-actions">
          <button class="chai-action-btn" id="chai-copy">
            <span>📋</span>
            <span>Copy</span>
          </button>
          <button class="chai-action-btn primary" id="chai-insert">
            <span>📝</span>
            <span>Insert into Description</span>
          </button>
        </div>
      </div>

      <div class="chai-footer">
        <span class="chai-footer-text" id="chai-footer-info">Powered by <span>Gemini Nano</span> · On-device AI</span>
      </div>
    `;

    document.body.appendChild(panel);

    // Create toast element
    if (!document.getElementById('chapterai-toast')) {
      const toast = document.createElement('div');
      toast.id = 'chapterai-toast';
      document.body.appendChild(toast);
    }

    // Bind events
    bindEvents();
    updateEngineUI();

    // If local AI is not available and no key is saved, open settings automatically
    if (apiEngine === 'cloud' && !apiKey) {
      toggleSettings(true);
      showStatus('info', 'Please enter a free Gemini API Key to enable cloud-based generation since Chrome\'s built-in AI is not active.');
    }

    // Show panel with animation
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        panel.classList.add('visible');
        panelVisible = true;
      });
    });
  }

  // ── Event Bindings ──
  function bindEvents() {
    const panel = document.getElementById('chapterai-panel');

    // Close button
    document.getElementById('chai-close').addEventListener('click', togglePanel);

    // Settings Toggle
    document.getElementById('chai-settings-toggle').addEventListener('click', () => toggleSettings());

    // Save API Key & Model button
    document.getElementById('chai-save-key').addEventListener('click', handleSaveSettings);

    // Generate button
    document.getElementById('chai-generate').addEventListener('click', handleGenerate);

    // Copy button
    document.getElementById('chai-copy').addEventListener('click', handleCopy);

    // Insert button
    document.getElementById('chai-insert').addEventListener('click', handleInsert);

    // Dragging
    const handle = document.getElementById('chai-drag-handle');
    handle.addEventListener('mousedown', startDrag);
    document.addEventListener('mousemove', onDrag);
    document.addEventListener('mouseup', endDrag);

    // Keyboard shortcut: Alt+Shift+C
    document.addEventListener('keydown', (e) => {
      if (e.altKey && e.shiftKey && e.code === 'KeyC') {
        e.preventDefault();
        if (!panelVisible) {
          createPanel();
        }
        handleGenerate();
      }
    });
  }

  // ── Toggle Settings panel ──
  function toggleSettings(forceState) {
    const settingsPanel = document.getElementById('chai-settings');
    if (!settingsPanel) return;

    showSettings = forceState !== undefined ? forceState : !showSettings;
    settingsPanel.classList.toggle('active', showSettings);
  }

  // ── Handle Save Settings ──
  function handleSaveSettings() {
    const keyInput = document.getElementById('chai-api-key');
    const modelInput = document.getElementById('chai-api-model');
    if (!keyInput || !modelInput) return;

    const keyValue = keyInput.value.trim();
    const modelValue = modelInput.value.trim() || 'gemini-2.5-flash';

    chrome.storage?.local?.set({ 
      geminiApiKey: keyValue,
      geminiModel: modelValue
    }, () => {
      apiKey = keyValue;
      apiModel = modelValue;
      showToast('✓ Settings saved!');
      toggleSettings(false);
      hideStatus();
      updateEngineUI();
    });
  }

  // ── Update UI based on active Engine ──
  function updateEngineUI() {
    const statusBadge = document.getElementById('chai-engine-status');
    const footerInfo = document.getElementById('chai-footer-info');
    const loadingLabel = document.getElementById('chai-loading-label');

    if (window.ai && window.ai.languageModel) {
      apiEngine = 'local';
      if (statusBadge) {
        statusBadge.className = 'chai-engine-badge';
        statusBadge.textContent = 'On-Device AI';
      }
      if (footerInfo) {
        footerInfo.innerHTML = 'Powered by <span>Gemini Nano</span> · On-device AI';
      }
      if (loadingLabel) {
        loadingLabel.textContent = 'Analyzing transcript with Gemini Nano';
      }
    } else {
      apiEngine = 'cloud';
      if (statusBadge) {
        statusBadge.className = 'chai-engine-badge cloud';
        statusBadge.textContent = 'Cloud AI';
      }
      if (footerInfo) {
        footerInfo.innerHTML = `Powered by <span>${escapeHtml(apiModel)}</span> · Cloud API`;
      }
      if (loadingLabel) {
        loadingLabel.textContent = `Analyzing transcript with ${escapeHtml(apiModel)}`;
      }
    }
  }

  // ── Drag Logic ──
  function startDrag(e) {
    // Don't drag if clicking buttons or input fields
    if (e.target.closest('button') || e.target.closest('input') || e.target.closest('a')) return;

    const panel = document.getElementById('chapterai-panel');
    const rect = panel.getBoundingClientRect();
    dragState = {
      active: true,
      offsetX: e.clientX - rect.left,
      offsetY: e.clientY - rect.top
    };
    panel.classList.add('dragging');
    e.preventDefault();
  }

  function onDrag(e) {
    if (!dragState.active) return;

    const panel = document.getElementById('chapterai-panel');
    const x = e.clientX - dragState.offsetX;
    const y = e.clientY - dragState.offsetY;

    // Clamp to viewport
    const maxX = window.innerWidth - panel.offsetWidth;
    const maxY = window.innerHeight - panel.offsetHeight;

    panel.style.left = Math.max(0, Math.min(x, maxX)) + 'px';
    panel.style.top = Math.max(0, Math.min(y, maxY)) + 'px';
    panel.style.right = 'auto';
  }

  function endDrag() {
    if (!dragState.active) return;
    dragState.active = false;
    const panel = document.getElementById('chapterai-panel');
    if (panel) panel.classList.remove('dragging');
  }

  // ── Toggle Panel Visibility ──
  function togglePanel() {
    const panel = document.getElementById('chapterai-panel');
    if (!panel) {
      createPanel();
      return;
    }

    if (panelVisible) {
      panel.classList.remove('visible');
      panelVisible = false;
      setTimeout(() => {
        if (!panelVisible) panel.remove();
      }, 350);
    } else {
      panel.classList.add('visible');
      panelVisible = true;
    }
  }

  // ── Status Messages ──
  function showStatus(type, message) {
    const statusEl = document.getElementById('chai-status');
    if (!statusEl) return;

    const iconMap = { error: '⚠', warning: '⚡', info: 'ℹ' };

    statusEl.className = 'chai-status active ' + type;
    statusEl.querySelector('.chai-status-icon').textContent = iconMap[type] || 'ℹ';
    statusEl.querySelector('.chai-status-message').innerHTML = message;
  }

  function hideStatus() {
    const statusEl = document.getElementById('chai-status');
    if (statusEl) statusEl.className = 'chai-status';
  }

  // ── Toast Notification ──
  function showToast(message) {
    const toast = document.getElementById('chapterai-toast');
    if (!toast) return;

    toast.textContent = message;
    toast.classList.add('visible');

    setTimeout(() => {
      toast.classList.remove('visible');
    }, 2000);
  }

  // ── Loading State ──
  function setLoading(loading) {
    isGenerating = loading;
    const loadingEl = document.getElementById('chai-loading');
    const generateBtn = document.getElementById('chai-generate');

    if (loadingEl) {
      loadingEl.classList.toggle('active', loading);
    }
    if (generateBtn) {
      generateBtn.disabled = loading;
      generateBtn.querySelector('.btn-content').innerHTML = loading
        ? '<span>⏳</span><span>Generating...</span>'
        : '<span>⚡</span><span>Generate Chapters</span>';
    }
  }

  // ── Render Chapters ──
  function renderChapters(chaptersData) {
    chapters = chaptersData;
    const list = document.getElementById('chai-chapters-list');
    const results = document.getElementById('chai-results');
    const actions = document.getElementById('chai-actions');
    const countEl = document.getElementById('chai-count');

    if (!list || !results || !actions) return;

    list.innerHTML = '';
    results.classList.add('active');
    actions.classList.add('active');
    countEl.textContent = chapters.length;

    chapters.forEach((chapter, index) => {
      const row = document.createElement('div');
      row.className = 'chai-chapter-row';
      row.style.animationDelay = `${index * 0.05}s`;

      row.innerHTML = `
        <span class="chai-timestamp" data-index="${index}">${chapter.timestamp}</span>
        <span class="chai-separator">–</span>
        <span class="chai-title" contenteditable="true" data-index="${index}">${escapeHtml(chapter.title)}</span>
        <button class="chai-delete-btn" data-index="${index}" title="Remove chapter">✕</button>
      `;

      // Delete handler
      row.querySelector('.chai-delete-btn').addEventListener('click', () => {
        chapters.splice(index, 1);
        renderChapters(chapters);
      });

      // Edit handler – update chapter data on blur
      const titleSpan = row.querySelector('.chai-title');
      titleSpan.addEventListener('blur', () => {
        chapters[index].title = titleSpan.textContent.trim();
      });

      // Prevent enter key from creating new lines in contenteditable
      titleSpan.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          titleSpan.blur();
        }
      });

      list.appendChild(row);
    });
  }

  // ── Parse AI Response into Chapters ──
  function parseChapters(response) {
    const lines = response.trim().split('\n').filter(line => line.trim());
    const parsed = [];

    for (const line of lines) {
      // Match patterns like "0:00 – Title", "0:00 - Title", "0:00 Title"
      const match = line.match(/^(\d{1,2}:\d{2}(?::\d{2})?)\s*[–\-—]\s*(.+)$/);
      if (match) {
        parsed.push({
          timestamp: match[1].trim(),
          title: match[2].trim().substring(0, 50) // Enforce max 50 chars
        });
      }
    }

    return parsed;
  }

  // ── Format Chapters for Clipboard / Description ──
  function formatChaptersText() {
    return chapters.map(ch => `${ch.timestamp} – ${ch.title}`).join('\n');
  }

  // ── Cloud API Generation Call ──
  async function generateWithCloudAPI(transcript) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${apiModel}:generateContent?key=${apiKey}`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: `${SYSTEM_PROMPT}\n\nHere is the video transcript:\n\n${transcript}\n\nGenerate the chapters:`
          }]
        }],
        generationConfig: {
          temperature: 0.2
        }
      })
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      const errMsg = errData?.error?.message || `HTTP ${response.status}`;
      throw new Error(`Gemini Cloud API Error: ${errMsg}`);
    }

    const data = await response.json();
    const textResult = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!textResult) {
      throw new Error('Invalid response structure from Gemini API');
    }

    return textResult;
  }

  // ── Handle Generate ──
  async function handleGenerate() {
    if (isGenerating) return;

    hideStatus();
    updateEngineUI();

    // Check if Cloud AI setup is required
    if (apiEngine === 'cloud' && !apiKey) {
      toggleSettings(true);
      showStatus('warning', 'Please enter a Gemini API Key in settings first to use Cloud AI.');
      return;
    }

    // Extract transcript
    const result = window.__chapterAI?.extractTranscript();
    if (!result || !result.text || result.text.trim().length < 50) {
      showStatus('warning',
        'No transcript detected.<br>Please enable auto-captions or upload a script first.'
      );
      return;
    }

    setLoading(true);

    try {
      // Truncate transcript if too long
      let transcript = result.text;
      if (transcript.length > 12000) {
        transcript = transcript.substring(0, 12000) + '\n[... transcript truncated]';
      }

      let aiResponse = '';

      if (apiEngine === 'local') {
        // Create local AI session and generate
        const session = await window.ai.languageModel.create({
          systemPrompt: SYSTEM_PROMPT
        });
        aiResponse = await session.prompt(
          `Here is the video transcript:\n\n${transcript}\n\nGenerate the chapters:`
        );
        session.destroy();
      } else {
        // Use Cloud API fallback
        aiResponse = await generateWithCloudAPI(transcript);
      }

      // Parse the response
      const parsed = parseChapters(aiResponse);

      if (parsed.length === 0) {
        showStatus('error',
          'Could not parse chapters from AI response.<br>' +
          '<button class="chai-retry-btn" id="chai-retry">↻ Retry</button>'
        );
        setLoading(false);

        // Bind retry button
        setTimeout(() => {
          const retryBtn = document.getElementById('chai-retry');
          if (retryBtn) retryBtn.addEventListener('click', handleGenerate);
        }, 50);
        return;
      }

      // Ensure first chapter starts at 0:00
      if (parsed[0].timestamp !== '0:00') {
        parsed.unshift({ timestamp: '0:00', title: 'Introduction' });
      }

      renderChapters(parsed);
      hideStatus();

    } catch (err) {
      console.error('[ChapterAI] Generation error:', err);
      showStatus('error',
        `Generation failed: ${escapeHtml(err.message)}<br>` +
        '<button class="chai-retry-btn" id="chai-retry">↻ Retry</button>'
      );

      setTimeout(() => {
        const retryBtn = document.getElementById('chai-retry');
        if (retryBtn) retryBtn.addEventListener('click', handleGenerate);
      }, 50);
    }

    setLoading(false);
  }

  // ── Handle Copy ──
  async function handleCopy() {
    if (chapters.length === 0) return;

    const text = formatChaptersText();

    try {
      await navigator.clipboard.writeText(text);
      showToast('✓ Chapters copied to clipboard!');

      // Visual feedback on button
      const copyBtn = document.getElementById('chai-copy');
      if (copyBtn) {
        copyBtn.classList.add('success');
        copyBtn.innerHTML = '<span>✓</span><span>Copied!</span>';
        setTimeout(() => {
          copyBtn.classList.remove('success');
          copyBtn.innerHTML = '<span>📋</span><span>Copy</span>';
        }, 2000);
      }
    } catch (err) {
      // Fallback: use execCommand
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.left = '-9999px';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      showToast('✓ Chapters copied to clipboard!');
    }
  }

  // ── Handle Insert into Description ──
  function handleInsert() {
    if (chapters.length === 0) return;

    const chaptersText = formatChaptersText();

    try {
      window.__chapterAI.insertIntoDescription(chaptersText);
      showToast('✓ Inserted into description!');

      // Visual feedback
      const insertBtn = document.getElementById('chai-insert');
      if (insertBtn) {
        insertBtn.classList.remove('primary');
        insertBtn.classList.add('success');
        insertBtn.innerHTML = '<span>✓</span><span>Inserted!</span>';
        setTimeout(() => {
          insertBtn.classList.remove('success');
          insertBtn.classList.add('primary');
          insertBtn.innerHTML = '<span>📝</span><span>Insert into Description</span>';
        }, 2000);
      }
    } catch (err) {
      showStatus('error', `Insert failed: ${escapeHtml(err.message)}`);
    }
  }

  // ── Utility: Escape HTML ──
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ── Initialize ──
  async function init() {
    // Load stored key and model configuration
    await loadSettings();

    // Create panel on page load
    createPanel();

    // Listen for messages from background.js / popup
    chrome.runtime?.onMessage?.addListener((msg, sender, sendResponse) => {
      if (msg.action === 'togglePanel') {
        togglePanel();
        sendResponse({ ok: true });
      }
      if (msg.action === 'generate') {
        if (!panelVisible) createPanel();
        handleGenerate();
        sendResponse({ ok: true });
      }
    });
  }

  // Wait for DOM to settle, then init
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(init, 1000));
  } else {
    setTimeout(init, 1000);
  }

})();
