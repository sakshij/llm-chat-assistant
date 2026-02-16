// LLM Chat Assistant - Content Script (v1.0.0)
// Comprehensive implementation with all features

const Config = {
  MAX_CHILDREN: 20,
  MAX_TOTAL_ITEMS: 100,
  TEXT_SELECTION_MIN: 4,
  HIGHLIGHT_DURATION: 5000,
  ERROR_DURATION: 4000
};

let state = {
  sidebarInjected: false,
  currentMode: 'full',
  currentStorageKey: null,
  selectionPopupActive: false,
  sidebarWidth: 400, // Store current width in pixels
  expandedItems: {} // Track which parent items are expanded
};

// ============ STORAGE KEY DETECTION ============

function detectPlatform() {
  const url = window.location.href;
  if (url.includes('claude.ai')) return 'claude';
  if (url.includes('chatgpt.com') || url.includes('chat.openai.com')) return 'chatgpt';
  if (url.includes('gemini.google.com')) return 'gemini';
  return null;
}

function extractChatIdFromUrl(platform) {
  const url = window.location.href;
  
  if (platform === 'claude') {
    const match = url.match(/\/chat\/([a-zA-Z0-9_-]+)/);
    return match ? match[1] : null;
  }
  
  if (platform === 'chatgpt') {
    // With project: ...g/g-{id}.../c/{chatId}
    const withProject = url.match(/\/g\/g-[^/]+\/c\/([a-zA-Z0-9_-]+)/);
    if (withProject) return withProject[1];
    
    // Without project: .../c/{chatId}
    const noProject = url.match(/\/c\/([a-zA-Z0-9_-]+)/);
    return noProject ? noProject[1] : null;
  }
  
  if (platform === 'gemini') {
    // With gem: .../gem/{name}/{id}
    const withGem = url.match(/\/gem\/([^/]+)\/([a-zA-Z0-9]+)/);
    if (withGem) return withGem[2];
    
    // Without gem: .../app/{id}
    const noGem = url.match(/\/app\/([a-zA-Z0-9]+)/);
    return noGem ? noGem[1] : null;
  }
  
  return null;
}

function detectProjectName(platform) {
  if (platform === 'claude') {
    // Read header for "Project / Chat" pattern
    const headers = document.querySelectorAll('[role="heading"], h1, .text-2xl');
    for (let header of headers) {
      const text = header.textContent.trim();
      if (text.includes(' / ')) {
        const parts = text.split(' / ');
        return parts[0].trim();
      }
    }
    return null;
  }
  
  if (platform === 'chatgpt') {
    const url = window.location.href;
    const match = url.match(/\/g\/g-[^/]+\/c\//);
    if (match) {
      // Extract from URL if in project, otherwise null
      const gptMatch = url.match(/g\/g-([^/]+)/);
      return gptMatch ? gptMatch[1] : null;
    }
    return null;
  }
  
  if (platform === 'gemini') {
    const url = window.location.href;
    const match = url.match(/\/gem\/([^/]+)\//);
    return match ? match[1] : null;
  }
  
  return null;
}

function generateStorageKey() {
  const platform = detectPlatform();
  const chatId = extractChatIdFromUrl(platform);
  const projectName = detectProjectName(platform);
  
  if (!chatId || !platform) return null;
  
  // If in a project, share items across all chats in that project
  if (projectName) {
    return `${platform}-project-${projectName}`;
  }
  
  // If not in a project, isolate by chat
  return `${platform}-${chatId}`;
}

// ============ STORAGE FUNCTIONS ============

function loadData() {
  const key = state.currentStorageKey;
  if (!key) return { items: [], nextId: 1 };
  
  const data = localStorage.getItem(key);
  const parsed = data ? JSON.parse(data) : { items: [], nextId: 1 };
  
  // MIGRATION FIX: Add fromChat property to old items
  // Items without fromChat are assumed to be manually created (fromChat = false)
  parsed.items.forEach(item => {
    if (item.fromChat === undefined) {
      item.fromChat = false;
    }
  });
  
  return parsed;
}

function saveData(data) {
  const key = state.currentStorageKey;
  if (!key) return;
  
  localStorage.setItem(key, JSON.stringify(data));
}

function addItem(parentId, content, type, fromChat = false) {
  const data = loadData();
  
  // Check total limit
  if (data.items.length >= Config.MAX_TOTAL_ITEMS) {
    return { error: `Maximum ${Config.MAX_TOTAL_ITEMS} items reached` };
  }
  
  // Check children limit
  if (parentId) {
    const parent = data.items.find(i => i.id === parentId);
    if (!parent) return { error: 'Parent not found' };
    
    const children = data.items.filter(i => i.parentId === parentId);
    if (children.length >= Config.MAX_CHILDREN) {
      return { error: `Maximum ${Config.MAX_CHILDREN} items per section reached` };
    }
  }

  const newItem = {
    id: data.nextId++,
    parentId: parentId || null,
    content: content,
    type: type, // 'todo', 'finding', 'question'
    completed: false,
    fromChat: fromChat, // Track if from text selection
    createdAt: new Date().toISOString()
  };
  
  data.items.push(newItem);
  saveData(data);
  
  // Auto-expand parent when adding child
  if (parentId) {
    state.expandedItems[parentId] = true;
  }
  
  return { item: newItem };
}

function deleteItem(id) {
  const data = loadData();
  data.items = data.items.filter(item => item.id !== id);
  data.items.forEach(item => {
    if (item.parentId === id) {
      item.parentId = null;
    }
  });
  saveData(data);
}

function updateItem(id, updates) {
  const data = loadData();
  const item = data.items.find(i => i.id === id);
  if (item) {
    Object.assign(item, updates);
    saveData(data);
  }
}

// ============ UI - SIDEBAR INJECTION ============

function injectSidebar() {
  if (state.sidebarInjected) return;

  const sidebar = document.createElement('div');
  sidebar.id = 'llm-chat-sidebar';
  sidebar.className = 'llm-sidebar llm-sidebar-full';
  sidebar.style.width = state.sidebarWidth + 'px';
  
  sidebar.innerHTML = `
    <div class="llm-resize-handle" id="llm-resize-handle" title="Drag to resize"></div>
    <div class="llm-header">
      <h2>LLM Chat Assistant</h2>
      <div class="llm-header-buttons">
        <button id="llm-export" class="llm-btn llm-btn-icon" title="Export">⬇</button>
        <button id="llm-import" class="llm-btn llm-btn-icon" title="Import">⬆</button>
        <button id="llm-expand-collapse" class="llm-btn llm-btn-icon" title="Expand/Collapse">⛶</button>
        <button id="llm-minimize" class="llm-btn llm-btn-icon" title="Minimize">−</button>
      </div>
    </div>
    
    <div class="llm-search-box">
      <input type="text" id="llm-search-input" placeholder="Search..." />
    </div>
    
    <div class="llm-tree-container" id="llm-tree-container"></div>
    
    <div class="llm-footer">
      <div class="llm-footer-buttons">
        <button id="llm-add-finding" class="llm-btn llm-btn-subtle" data-type="finding">💡 Note</button>
        <button id="llm-add-todo" class="llm-btn llm-btn-subtle" data-type="todo">✓ Todo</button>
        <button id="llm-add-question" class="llm-btn llm-btn-subtle" data-type="question">❓ Question</button>
      </div>
    </div>
    <input type="file" id="llm-import-file" accept=".json" style="display:none;" />
  `;
  
  document.body.appendChild(sidebar);
  state.sidebarInjected = true;

  attachSidebarListeners();
  renderTree();
}

function attachSidebarListeners() {
  const expandBtn = document.getElementById('llm-expand-collapse');
  const minimizeBtn = document.getElementById('llm-minimize');
  const addFindingBtn = document.getElementById('llm-add-finding');
  const addTodoBtn = document.getElementById('llm-add-todo');
  const addQuestionBtn = document.getElementById('llm-add-question');
  const searchInput = document.getElementById('llm-search-input');
  const exportBtn = document.getElementById('llm-export');
  const importBtn = document.getElementById('llm-import');
  const importFileInput = document.getElementById('llm-import-file');
  const resizeHandle = document.getElementById('llm-resize-handle');
  
  const sidebar = document.getElementById('llm-chat-sidebar');
  
  // Resize functionality
  if (resizeHandle && sidebar) {
    let isResizing = false;
    let startX = 0;
    let startWidth = 0;
    
    resizeHandle.addEventListener('mousedown', (e) => {
      isResizing = true;
      startX = e.clientX;
      startWidth = sidebar.offsetWidth;
      document.body.style.cursor = 'ew-resize';
      e.preventDefault();
    });
    
    document.addEventListener('mousemove', (e) => {
      if (!isResizing) return;
      
      const diff = startX - e.clientX;
      const newWidth = Math.min(Math.max(startWidth + diff, 300), 800);
      sidebar.style.width = newWidth + 'px';
      state.sidebarWidth = newWidth; // Remember width
    });
    
    document.addEventListener('mouseup', () => {
      if (isResizing) {
        isResizing = false;
        document.body.style.cursor = 'default';
      }
    });
  }
  
  // Expand/Collapse
  if (expandBtn) {
    expandBtn.addEventListener('click', () => {
      if (state.currentMode === 'full') {
        state.currentMode = 'half';
      } else if (state.currentMode === 'half') {
        state.currentMode = 'full';
      } else if (state.currentMode === 'minimized') {
        state.currentMode = 'half';
      }
      updateSidebarMode();
    });
  }
  
  // Minimize
  if (minimizeBtn) {
    minimizeBtn.addEventListener('click', () => {
      state.currentMode = 'minimized';
      updateSidebarMode();
    });
  }
  
  // Click minimized icon to expand
  if (sidebar) {
    sidebar.addEventListener('click', (e) => {
      if (state.currentMode === 'minimized' && e.target === sidebar) {
        state.currentMode = 'half';
        updateSidebarMode();
      }
    });
  }
  
  // Add root item - 3 type buttons that directly open text input
  if (addFindingBtn) {
    addFindingBtn.addEventListener('click', () => {
      showAddItemUI(null, 'finding');
    });
  }
  
  if (addTodoBtn) {
    addTodoBtn.addEventListener('click', () => {
      showAddItemUI(null, 'todo');
    });
  }
  
  if (addQuestionBtn) {
    addQuestionBtn.addEventListener('click', () => {
      showAddItemUI(null, 'question');
    });
  }
  
  // Search
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      filterTree(e.target.value);
    });
  }
  
  // Export/Import
  if (exportBtn) {
    exportBtn.addEventListener('click', exportData);
  }
  
  if (importBtn) {
    importBtn.addEventListener('click', () => {
      importFileInput.click();
    });
  }
  
  if (importFileInput) {
    importFileInput.addEventListener('change', handleImport);
  }
}

function updateSidebarMode() {
  const sidebar = document.getElementById('llm-chat-sidebar');
  if (!sidebar) return;
  
  sidebar.className = `llm-sidebar llm-sidebar-${state.currentMode}`;
  
  // Restore width when expanding from minimized
  if (state.currentMode !== 'minimized') {
    sidebar.style.width = state.sidebarWidth + 'px';
  }
  
  const expandBtn = document.getElementById('llm-expand-collapse');
  const minimizeBtn = document.getElementById('llm-minimize');
  
  if (state.currentMode === 'minimized') {
    if (expandBtn) expandBtn.style.display = 'none';
    if (minimizeBtn) minimizeBtn.style.display = 'none';
  } else {
    if (expandBtn) expandBtn.style.display = 'inline-flex';
    if (minimizeBtn) minimizeBtn.style.display = 'inline-flex';
  }
}

// ============ UI - ITEM RENDERING ============

function renderTree() {
  const data = loadData();
  const container = document.getElementById('llm-tree-container');
  if (!container) return;
  
  container.innerHTML = '';

  const rootItems = data.items.filter(i => !i.parentId);
  rootItems.forEach(item => {
    container.appendChild(renderItemElement(item, data.items));
  });
}

function renderItemElement(item, allItems) {
  const div = document.createElement('div');
  div.className = `llm-item llm-item-${item.type}`;
  div.dataset.itemId = item.id;
  
  const children = allItems.filter(i => i.parentId === item.id);
  const strikeClass = item.completed ? 'llm-item-completed' : '';
  const isExpanded = state.expandedItems[item.id] || false;
  
  // Chevron for ALL root items (whether they have children or not)
  const chevronIcon = !item.parentId ? 
    `<button class="llm-btn llm-btn-icon llm-chevron-btn" data-item-id="${item.id}" title="${isExpanded ? 'Collapse' : 'Expand'}">${isExpanded ? '▼' : '◀'}</button>` : '';
  
  div.innerHTML = `
    <div class="llm-item-row ${strikeClass}">
      <span class="llm-item-icon">${getTypeIcon(item.type)}</span>
      <span class="llm-item-text">${escapeHtml(item.content)}</span>
      <div class="llm-item-actions">
        ${item.type === 'todo' ? `<input type="checkbox" class="llm-checkbox" data-id="${item.id}" ${item.completed ? 'checked' : ''} />` : ''}
        ${item.fromChat ? `<button class="llm-btn llm-btn-icon llm-link-btn" data-id="${item.id}" title="Jump to message">🔗</button>` : ''}
        <button class="llm-btn llm-btn-icon llm-delete-btn" data-id="${item.id}" title="Delete">🗑️</button>
      </div>
      ${chevronIcon}
    </div>
  `;
  
  // Add children container if has children AND is expanded
  if (children.length > 0 && isExpanded) {
    const childrenDiv = document.createElement('div');
    childrenDiv.className = 'llm-children';
    children.forEach(child => {
      childrenDiv.appendChild(renderItemElement(child, allItems));
    });
    div.appendChild(childrenDiv);
  }
  
  // Add buttons ONLY if root item AND expanded (removed the "or no children" condition)
  if (!item.parentId && isExpanded && children.length < Config.MAX_CHILDREN) {
    const buttonsDiv = document.createElement('div');
    buttonsDiv.className = 'llm-item-add-buttons';
    buttonsDiv.innerHTML = `
      <button class="llm-btn llm-btn-sm llm-add-child-btn" data-parent-id="${item.id}" data-type="finding">+ Note</button>
      <button class="llm-btn llm-btn-sm llm-add-child-btn" data-parent-id="${item.id}" data-type="todo">+ Todo</button>
      <button class="llm-btn llm-btn-sm llm-add-child-btn" data-parent-id="${item.id}" data-type="question">+ Question</button>
    `;
    div.appendChild(buttonsDiv);
  }
  
  // Attach event listeners
  const checkbox = div.querySelector('.llm-checkbox');
  if (checkbox) {
    checkbox.addEventListener('change', (e) => {
      updateItem(item.id, { completed: e.target.checked });
      renderTree();
    });
  }
  
  const linkBtn = div.querySelector('.llm-link-btn');
  if (linkBtn) {
    linkBtn.addEventListener('click', () => {
      jumpToMessage(item.content);
    });
  }
  
  const deleteBtn = div.querySelector('.llm-delete-btn');
  if (deleteBtn) {
    deleteBtn.addEventListener('click', () => {
      deleteItem(item.id);
      renderTree();
    });
  }
  
  const chevronBtn = div.querySelector('.llm-chevron-btn');
  if (chevronBtn) {
    chevronBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const itemId = parseInt(e.target.dataset.itemId);
      state.expandedItems[itemId] = !state.expandedItems[itemId];
      renderTree();
    });
  }
  
  const addChildBtns = div.querySelectorAll('.llm-add-child-btn');
  addChildBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      const parentId = parseInt(e.target.dataset.parentId);
      const type = e.target.dataset.type;
      showAddItemUI(parentId, type);
    });
  });
  
  return div;
}

function getTypeIcon(type) {
  const icons = { 'todo': '✓', 'finding': '💡', 'question': '❓' };
  return icons[type] || '•';
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ============ UI - ADD ITEM INLINE ============

function showAddItemUI(parentId = null, type = 'finding') {
  // Clear any existing inline editor
  const existing = document.querySelector('.llm-inline-editor');
  if (existing) existing.remove();
  
  const editor = document.createElement('div');
  editor.className = 'llm-inline-editor';
  
  editor.innerHTML = `
    <div class="llm-input-box">
      <textarea id="llm-new-item-input" placeholder="Type here..." class="llm-textarea"></textarea>
      <div class="llm-input-actions">
        <button class="llm-btn llm-btn-save">✓</button>
        <button class="llm-btn llm-btn-cancel">✕</button>
      </div>
    </div>
  `;
  
  const container = parentId ? document.querySelector(`[data-item-id="${parentId}"]`) : document.getElementById('llm-tree-container');
  if (!container) return;
  
  container.appendChild(editor);
  
  const textarea = document.getElementById('llm-new-item-input');
  textarea.focus();
  
  const saveBtn = editor.querySelector('.llm-btn-save');
  const cancelBtn = editor.querySelector('.llm-btn-cancel');
  
  saveBtn.addEventListener('click', () => {
    const content = textarea.value.trim();
    if (content) {
      const result = addItem(parentId, content, type);
      if (result.error) {
        showInlineError(result.error);
      } else {
        renderTree();
      }
    }
    editor.remove();
  });
  
  cancelBtn.addEventListener('click', () => {
    editor.remove();
  });
  
  textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      editor.remove();
    }
    if (e.key === 'Enter' && e.ctrlKey) {
      saveBtn.click();
    }
  });
}

// ============ UI - TEXT SELECTION POPUP ============

function setupTextSelection() {
  document.addEventListener('mouseup', handleTextSelection);
}

function handleTextSelection() {
  if (state.selectionPopupActive) return;
  if (event.target.closest('#llm-chat-sidebar')) return;
  
  const selected = window.getSelection().toString().trim();
  const wordCount = selected.split(/\s+/).length;
  
  if (wordCount >= Config.TEXT_SELECTION_MIN) {
    state.selectionPopupActive = true;
    showSelectionPopup(selected);
  }
}

function showSelectionPopup(text) {
  const existing = document.getElementById('llm-selection-popup');
  if (existing) existing.remove();
  
  const popup = document.createElement('div');
  popup.id = 'llm-selection-popup';
  popup.className = 'llm-popup';
  
  popup.innerHTML = `
    <div class="llm-popup-content">
      <p class="llm-popup-text">"${escapeHtml(text.substring(0, 100))}"</p>
      <div class="llm-popup-buttons">
        <button class="llm-btn llm-btn-type" data-type="finding" title="Add as Note">💡</button>
        <button class="llm-btn llm-btn-type" data-type="todo" title="Add as Todo">✓</button>
        <button class="llm-btn llm-btn-type" data-type="question" title="Add as Question">❓</button>
        <button class="llm-btn llm-btn-close" title="Close">×</button>
      </div>
    </div>
  `;
  
  document.body.appendChild(popup);
  
  // Position near selection
  const selection = window.getSelection();
  if (selection.rangeCount > 0) {
    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    popup.style.top = (rect.bottom + 10) + 'px';
    popup.style.left = Math.min(rect.left, window.innerWidth - 300) + 'px';
  }
  
  const typeButtons = popup.querySelectorAll('[data-type]');
  typeButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const type = btn.dataset.type;
      // Pass true for fromChat since this came from text selection
      const result = addItem(null, text, type, true);
      if (result.error) {
        showInlineError(result.error);
      } else {
        renderTree();
      }
      popup.remove();
      state.selectionPopupActive = false;
    });
  });
  
  const closeBtn = popup.querySelector('.llm-btn-close');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      popup.remove();
      state.selectionPopupActive = false;
    });
  }
  
  // Auto-close after 10 seconds
  setTimeout(() => {
    if (popup.parentElement) {
      popup.remove();
      state.selectionPopupActive = false;
    }
  }, 10000);
}

// ============ LINK JUMP ============

function jumpToMessage(text) {
  const searchText = text.substring(0, 50).trim();
  const words = searchText.split(' ').slice(0, 5).join(' ');
  
  // Search for element containing this text
  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_TEXT,
    null,
    false
  );
  
  let found = false;
  let node;
  
  while (node = walker.nextNode()) {
    // Check if text matches and not in sidebar
    if (node.textContent.includes(words)) {
      let element = node.parentElement;
      
      // Check if inside sidebar
      let inSidebar = false;
      let current = element;
      while (current) {
        if (current.id === 'llm-chat-sidebar') {
          inSidebar = true;
          break;
        }
        current = current.parentElement;
      }
      
      if (!inSidebar) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        
        // Highlight with muted yellow
        const originalBg = element.style.backgroundColor;
        element.style.backgroundColor = 'rgba(255, 235, 59, 0.3)';
        element.style.transition = 'background-color 0.3s';
        
        setTimeout(() => {
          element.style.backgroundColor = originalBg;
        }, Config.HIGHLIGHT_DURATION);
        
        found = true;
        break;
      }
    }
  }
  
  if (!found) {
    showInlineError('Text not found in current page');
  }
}

// ============ ERROR HANDLING ============

function showInlineError(message) {
  const existing = document.querySelector('.llm-inline-error');
  if (existing) existing.remove();
  
  const error = document.createElement('div');
  error.className = 'llm-inline-error';
  error.textContent = '⚠️ ' + message;
  
  const container = document.getElementById('llm-tree-container');
  if (container) {
    container.insertBefore(error, container.firstChild);
  }
  
  setTimeout(() => {
    error.remove();
  }, Config.ERROR_DURATION);
}

// ============ SEARCH ============

function filterTree(searchTerm) {
  const items = document.querySelectorAll('.llm-item');
  items.forEach(item => {
    const text = item.querySelector('.llm-item-text')?.textContent.toLowerCase() || '';
    const matches = text.includes(searchTerm.toLowerCase());
    item.style.display = matches || !searchTerm ? 'block' : 'none';
  });
}

// ============ EXPORT/IMPORT ============

function exportData() {
  const data = loadData();
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `llm-chat-assistant-${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function handleImport(e) {
  const file = e.target.files[0];
  if (!file) return;
  
  const reader = new FileReader();
  reader.onload = (event) => {
    try {
      const data = JSON.parse(event.target.result);
      saveData(data);
      renderTree();
      showInlineError('✓ Data imported successfully');
    } catch (err) {
      showInlineError('Error importing file');
    }
  };
  reader.readAsText(file);
}

// ============ INITIALIZATION ============

window.addEventListener('load', () => {
  state.currentStorageKey = generateStorageKey();
  if (!state.currentStorageKey) return;
  
  injectSidebar();
  setupTextSelection();
  
  // Watch for chat/project changes
  setInterval(() => {
    const newKey = generateStorageKey();
    if (newKey !== state.currentStorageKey) {
      state.currentStorageKey = newKey;
      renderTree();
    }
  }, 500);
});
