// Research Tree - Content Script (v2.0.3 - UI Improvements)
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
  selectionPopupActive: false
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
  sidebar.id = 'research-tree-sidebar';
  sidebar.className = 'research-sidebar research-sidebar-full';
  
  sidebar.innerHTML = `
    <div class="research-resize-handle" id="research-resize-handle" title="Drag to resize"></div>
    <div class="research-header">
      <h2>Research Tree</h2>
      <div class="research-header-buttons">
        <button id="research-export" class="research-btn research-btn-icon" title="Export">⬇</button>
        <button id="research-import" class="research-btn research-btn-icon" title="Import">⬆</button>
        <button id="research-expand-collapse" class="research-btn research-btn-icon" title="Expand/Collapse">⛶</button>
        <button id="research-minimize" class="research-btn research-btn-icon" title="Minimize">−</button>
      </div>
    </div>
    
    <div class="research-search-box">
      <input type="text" id="research-search-input" placeholder="Search..." />
    </div>
    
    <div class="research-tree-container" id="research-tree-container"></div>
    
    <div class="research-footer">
      <div class="research-footer-buttons">
        <button id="research-add-finding" class="research-btn research-btn-subtle" data-type="finding">💡 Note</button>
        <button id="research-add-todo" class="research-btn research-btn-subtle" data-type="todo">✓ Todo</button>
        <button id="research-add-question" class="research-btn research-btn-subtle" data-type="question">❓ Question</button>
      </div>
    </div>
    <input type="file" id="research-import-file" accept=".json" style="display:none;" />
  `;
  
  document.body.appendChild(sidebar);
  state.sidebarInjected = true;

  attachSidebarListeners();
  renderTree();
}

function attachSidebarListeners() {
  const expandBtn = document.getElementById('research-expand-collapse');
  const minimizeBtn = document.getElementById('research-minimize');
  const addFindingBtn = document.getElementById('research-add-finding');
  const addTodoBtn = document.getElementById('research-add-todo');
  const addQuestionBtn = document.getElementById('research-add-question');
  const searchInput = document.getElementById('research-search-input');
  const exportBtn = document.getElementById('research-export');
  const importBtn = document.getElementById('research-import');
  const importFileInput = document.getElementById('research-import-file');
  const resizeHandle = document.getElementById('research-resize-handle');
  
  const sidebar = document.getElementById('research-tree-sidebar');
  
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
  const sidebar = document.getElementById('research-tree-sidebar');
  if (!sidebar) return;
  
  sidebar.className = `research-sidebar research-sidebar-${state.currentMode}`;
  
  const expandBtn = document.getElementById('research-expand-collapse');
  const minimizeBtn = document.getElementById('research-minimize');
  
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
  const container = document.getElementById('research-tree-container');
  if (!container) return;
  
  container.innerHTML = '';

  const rootItems = data.items.filter(i => !i.parentId);
  rootItems.forEach(item => {
    container.appendChild(renderItemElement(item, data.items));
  });
}

function renderItemElement(item, allItems) {
  const div = document.createElement('div');
  div.className = `research-item research-item-${item.type}`;
  div.dataset.itemId = item.id;
  
  const children = allItems.filter(i => i.parentId === item.id);
  const strikeClass = item.completed ? 'research-item-completed' : '';
  
  div.innerHTML = `
    <div class="research-item-row ${strikeClass}">
      <span class="research-item-icon">${getTypeIcon(item.type)}</span>
      <span class="research-item-text">${escapeHtml(item.content)}</span>
      <div class="research-item-actions">
        ${item.type === 'todo' ? `<input type="checkbox" class="research-checkbox" data-id="${item.id}" ${item.completed ? 'checked' : ''} />` : ''}
        ${item.fromChat ? `<button class="research-btn research-btn-icon research-link-btn" data-id="${item.id}" title="Jump to message">🔗</button>` : ''}
        <button class="research-btn research-btn-icon research-delete-btn" data-id="${item.id}" title="Delete">🗑️</button>
      </div>
    </div>
  `;
  
  // Add children container if has children
  if (children.length > 0) {
    const childrenDiv = document.createElement('div');
    childrenDiv.className = 'research-children';
    children.forEach(child => {
      childrenDiv.appendChild(renderItemElement(child, allItems));
    });
    div.appendChild(childrenDiv);
  }
  
  // IMPORTANT: Only show add buttons if this is a ROOT item (no parentId)
  // Children should NOT have add buttons (1 level nesting max)
  if (!item.parentId && children.length < Config.MAX_CHILDREN) {
    const buttonsDiv = document.createElement('div');
    buttonsDiv.className = 'research-item-add-buttons';
    buttonsDiv.innerHTML = `
      <button class="research-btn research-btn-sm research-add-child-btn" data-parent-id="${item.id}" data-type="finding">+ Note</button>
      <button class="research-btn research-btn-sm research-add-child-btn" data-parent-id="${item.id}" data-type="todo">+ Todo</button>
      <button class="research-btn research-btn-sm research-add-child-btn" data-parent-id="${item.id}" data-type="question">+ Question</button>
    `;
    div.appendChild(buttonsDiv);
  }
  
  // Attach event listeners
  const checkbox = div.querySelector('.research-checkbox');
  if (checkbox) {
    checkbox.addEventListener('change', (e) => {
      updateItem(item.id, { completed: e.target.checked });
      renderTree();
    });
  }
  
  const linkBtn = div.querySelector('.research-link-btn');
  if (linkBtn) {
    linkBtn.addEventListener('click', () => {
      jumpToMessage(item.content);
    });
  }
  
  const deleteBtn = div.querySelector('.research-delete-btn');
  if (deleteBtn) {
    deleteBtn.addEventListener('click', () => {
      deleteItem(item.id);
      renderTree();
    });
  }
  
  const addChildBtns = div.querySelectorAll('.research-add-child-btn');
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
  const existing = document.querySelector('.research-inline-editor');
  if (existing) existing.remove();
  
  const editor = document.createElement('div');
  editor.className = 'research-inline-editor';
  
  // Always show text input (type is provided)
  editor.innerHTML = `
    <div class="research-input-box">
      <textarea id="research-new-item-input" placeholder="Type here..." class="research-textarea"></textarea>
      <div class="research-input-actions">
        <button class="research-btn research-btn-save">✓</button>
        <button class="research-btn research-btn-cancel">✕</button>
      </div>
    </div>
  `;
  
  const container = parentId ? document.querySelector(`[data-item-id="${parentId}"]`) : document.getElementById('research-tree-container');
  if (!container) return;
  
  container.appendChild(editor);
  
  const textarea = document.getElementById('research-new-item-input');
  textarea.focus();
  
  const saveBtn = editor.querySelector('.research-btn-save');
  const cancelBtn = editor.querySelector('.research-btn-cancel');
  
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
  if (event.target.closest('#research-tree-sidebar')) return;
  
  const selected = window.getSelection().toString().trim();
  const wordCount = selected.split(/\s+/).length;
  
  if (wordCount >= Config.TEXT_SELECTION_MIN) {
    state.selectionPopupActive = true;
    showSelectionPopup(selected);
  }
}

function showSelectionPopup(text) {
  const existing = document.getElementById('research-selection-popup');
  if (existing) existing.remove();
  
  const popup = document.createElement('div');
  popup.id = 'research-selection-popup';
  popup.className = 'research-popup';
  
  popup.innerHTML = `
    <div class="research-popup-content">
      <p class="research-popup-text">"${escapeHtml(text.substring(0, 100))}"</p>
      <div class="research-popup-buttons">
        <button class="research-btn research-btn-type" data-type="finding" title="Add as Note">💡</button>
        <button class="research-btn research-btn-type" data-type="todo" title="Add as Todo">✓</button>
        <button class="research-btn research-btn-type" data-type="question" title="Add as Question">❓</button>
        <button class="research-btn research-btn-close" title="Close">×</button>
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
  
  const closeBtn = popup.querySelector('.research-btn-close');
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
        if (current.id === 'research-tree-sidebar') {
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
  const existing = document.querySelector('.research-inline-error');
  if (existing) existing.remove();
  
  const error = document.createElement('div');
  error.className = 'research-inline-error';
  error.textContent = '⚠️ ' + message;
  
  const container = document.getElementById('research-tree-container');
  if (container) {
    container.insertBefore(error, container.firstChild);
  }
  
  setTimeout(() => {
    error.remove();
  }, Config.ERROR_DURATION);
}

// ============ SEARCH ============

function filterTree(searchTerm) {
  const items = document.querySelectorAll('.research-item');
  items.forEach(item => {
    const text = item.querySelector('.research-item-text')?.textContent.toLowerCase() || '';
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
  a.download = `research-tree-${new Date().toISOString().split('T')[0]}.json`;
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
