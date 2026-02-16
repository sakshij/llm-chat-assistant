# Changelog

All notable changes to LLM Chat Assistant will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-02-16

### Initial Release

LLM Chat Assistant helps you capture, organize, and manage research findings from AI conversations on Claude.ai, ChatGPT, and Google Gemini.

#### Core Features

**Text Capture & Organization**
- Instant capture from text selection (4+ words minimum)
- Three item types: Notes (💡), Todos (✓), Questions (❓)
- Hierarchical organization with 1 level of nesting
- Manual item addition via footer buttons
- Inline text editing with save/cancel actions

**Smart Navigation**
- Link icons (🔗) on items from text selection
- Click to jump back to original message
- Auto-scroll with muted yellow highlight (5 seconds)
- Chevron expand/collapse for parent items

**Sidebar Interface**
- Three display modes: Full, Half, Minimized
- Resizable width (300px - 800px) by dragging left edge
- Width memory persists across minimize/restore
- Clean, minimal design with subtle button styling

**Data Management**
- Real-time search and filtering
- Export to JSON with date stamp
- Import from JSON files
- Project-scoped storage (items shared across chats in same project)
- Chat-isolated storage (when not in a project)

**Platform Support**
- Claude.ai (with and without projects)
- ChatGPT (with and without GPTs)
- Google Gemini (with and without gems)

**User Experience**
- Dark mode support (auto-detects system preference)
- Responsive design (375px to 4K)
- Inline error messages (no popup dialogs)
- Auto-expand parents when adding children
- Hover-based action buttons for clean interface

#### Technical Details
- 100% local storage (no cloud, no backend)
- Manifest V3 compliant
- No external dependencies
- Minimal permissions (storage, scripting, activeTab)
- ~34KB total size

#### Limits
- Maximum 100 items per chat/project
- Maximum 20 children per parent item
- 1 level of nesting (no grandchildren)
- 4+ words required for text selection capture

---

## Future Plans

See [GitHub Issues](https://github.com/sakshij/llm-chat-assistant/issues) for upcoming features and enhancements.
