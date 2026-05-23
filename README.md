# ChapterAI – Smart Chapters 🚀

ChapterAI is a lightweight, secure Manifest V3 Chrome Extension engineered for YouTube creators. It automates the tedious post-production chore of writing video timestamps. By leveraging the ultra-fast Google Gemini 2.5 Flash API, it analyzes your raw transcripts and automatically injects cleanly segmented, SEO-optimized chapters directly into your YouTube Studio Description workspace in under half a second.

## ⚡ Features

*   **Gemini 2.5 Flash Integration:** Instantaneous token-processing to transform raw, messy transcript queues into concise 3-5 word chapters.
*   **One-Click Injections:** Seamlessly appends formatted timestamps (`[00:00] Title...`) directly inside your YouTube Studio Edit descriptions page.
*   **BYOK (Bring Your Own Key):** Zero monthly subscription markups. Runs securely on your own free or pay-as-you-go Google AI developer token saved locally.
*   **Manifest V3 Compliant:** Built strictly on the latest extension security practices utilizing modern background service workers, `activeTab` scoping, and local script isolation.

## 🛠️ Project Structure

The codebase is organized cleanly as declared in `manifest.json`:

```text
├── manifest.json         # Extension Manifest V3 configuration & permission scopes
├── background.js         # Service Worker handling background extension states
├── content.js            # Content script targeting studio.youtube.com domains
├── panel.js              # Sidebar companion application interface logic
├── panel.css             # Fluid styling for the integrated side panel layout
└── icons/                # Brand identity assets
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
