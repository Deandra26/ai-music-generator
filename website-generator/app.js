// Gallery Management Application
class GalleryManager {
    constructor() {
        this.items = [];
        this.sortOrder = 'newest';
        this.filterType = 'all';
        this.searchTerm = '';
        this.loadFromStorage();
        this.initializeEventListeners();
        this.loadFromServer();
        this.render();
    }

    // Initialize all event listeners
    initializeEventListeners() {
        // Upload
        const uploadBox = document.getElementById('uploadBox');
        const fileInput = document.getElementById('fileInput');
        const addButton = document.getElementById('addButton');

        uploadBox.addEventListener('click', () => fileInput.click());
        uploadBox.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadBox.style.borderColor = '#764ba2';
            uploadBox.style.background = '#f0f2ff';
        });
        uploadBox.addEventListener('dragleave', () => {
            uploadBox.style.borderColor = '#667eea';
            uploadBox.style.background = '#f8f9ff';
        });
        uploadBox.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadBox.style.borderColor = '#667eea';
            uploadBox.style.background = '#f8f9ff';
            this.handleFiles(e.dataTransfer.files);
        });

        fileInput.addEventListener('change', (e) => this.handleFiles(e.target.files));
        addButton.addEventListener('click', () => this.addItem());

        // Filter and Search
        document.getElementById('searchInput').addEventListener('input', (e) => {
            this.searchTerm = e.target.value.toLowerCase();
            this.render();
        });

        document.getElementById('filterType').addEventListener('change', (e) => {
            this.filterType = e.target.value;
            this.render();
        });

        document.getElementById('sortButton').addEventListener('click', () => {
            this.sortOrder = this.sortOrder === 'newest' ? 'oldest' : 'newest';
            this.render();
        });

        document.getElementById('clearButton').addEventListener('click', () => {
            if (confirm('Are you sure you want to delete all items?')) {
                this.items = [];
                this.saveToStorage();
                this.render();
                this.showStatus('All items cleared', 'success');
            }
        });

        // Modal
        const modal = document.getElementById('modal');
        const closeBtn = document.querySelector('.close');
        closeBtn.addEventListener('click', () => {
            modal.style.display = 'none';
        });
        window.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.style.display = 'none';
            }
        });
    }

    // Load item list from backend API if available
    async loadFromServer() {
        try {
            const response = await fetch('/api/assets');
            if (!response.ok) return;
            const serverItems = await response.json();
            if (Array.isArray(serverItems) && serverItems.length > 0) {
                this.items = serverItems;
                this.saveToStorage();
                this.render();
            }
        } catch (error) {
            // Ignore backend errors; app still works in standalone mode
        }
    }

    // Handle file uploads
    async handleFiles(files) {
        if (files.length === 0) return;

        const fileList = Array.from(files);
        for (const file of fileList) {
            const isImage = file.type.startsWith('image/');
            const isAudio = file.type.startsWith('audio/');

            if (!isImage && !isAudio) {
                this.showStatus('Please upload only images or audio files', 'error');
                continue;
            }

            const formData = new FormData();
            formData.append('file', file);
            formData.append('title', file.name.split('.')[0]);
            formData.append('description', '');

            try {
                const response = await fetch('/api/upload', {
                    method: 'POST',
                    body: formData,
                });

                const result = await response.json();
                if (!response.ok) {
                    throw new Error(result.detail || 'Upload failed');
                }

                this.items.push(result.asset);
                this.saveToStorage();
                this.render();
                this.showStatus('Upload successful', 'success');
            } catch (error) {
                this.showStatus(error.message || 'Upload failed', 'error');
            }
        }
    }

    // Add item with custom title and description
    async addItem() {
        const titleInput = document.getElementById('titleInput');
        const descriptionInput = document.getElementById('descriptionInput');
        const fileInput = document.getElementById('fileInput');

        if (fileInput.files.length === 0) {
            this.showStatus('Please select a file first', 'error');
            return;
        }

        const file = fileInput.files[0];
        const isImage = file.type.startsWith('image/');
        const isAudio = file.type.startsWith('audio/');

        if (!isImage && !isAudio) {
            this.showStatus('Please upload only images or audio files', 'error');
            return;
        }

        const formData = new FormData();
        formData.append('file', file);
        formData.append('title', titleInput.value || file.name.split('.')[0]);
        formData.append('description', descriptionInput.value);

        try {
            const response = await fetch('/api/upload', {
                method: 'POST',
                body: formData,
            });

            const result = await response.json();
            if (!response.ok) {
                throw new Error(result.detail || 'Upload failed');
            }

            this.items.push(result.asset);
            this.saveToStorage();
            this.render();
            this.showStatus('Item added successfully!', 'success');

            titleInput.value = '';
            descriptionInput.value = '';
            fileInput.value = '';
        } catch (error) {
            this.showStatus(error.message || 'Upload failed', 'error');
        }
    }

    // Filter and search items
    getFilteredItems() {
        let filtered = this.items;

        // Apply type filter
        if (this.filterType !== 'all') {
            filtered = filtered.filter(item => {
                if (this.filterType === 'images') return item.type === 'image';
                if (this.filterType === 'audio') return item.type === 'audio';
                return true;
            });
        }

        // Apply search
        if (this.searchTerm) {
            filtered = filtered.filter(item => {
                const searchIn = `${item.title} ${item.description}`.toLowerCase();
                return searchIn.includes(this.searchTerm);
            });
        }

        // Apply sort
        if (this.sortOrder === 'newest') {
            filtered.sort((a, b) => new Date(b.date) - new Date(a.date));
        } else {
            filtered.sort((a, b) => new Date(a.date) - new Date(b.date));
        }

        return filtered;
    }

    // Render gallery
    render() {
        const gallery = document.getElementById('gallery');
        const filteredItems = this.getFilteredItems();

        if (filteredItems.length === 0) {
            gallery.innerHTML = '<div class="empty-state"><p>No content found. Try adjusting your filters or search.</p></div>';
        } else {
            gallery.innerHTML = filteredItems.map(item => this.createItemElement(item)).join('');
            this.attachItemListeners();
        }

        this.updateStats();
    }

    // Create gallery item HTML
    createItemElement(item) {
        const typeLabel = item.type === 'image' ? 'Image' : 'Audio';
        const safeTitle = this.escapeHtml(item.title || 'Untitled');
        const safeDescription = this.escapeHtml(item.description || 'No description');

        return `
            <div class="gallery-item" data-id="${item.id}">
                <div class="item-media">
                    ${item.type === 'image' 
                        ? `<img src="${item.src || item.data}" alt="${safeTitle}">` 
                        : `<div class="audio-placeholder">🎵</div>`}
                </div>
                <div class="item-info">
                    <span class="item-type">${typeLabel}</span>
                    <div class="item-title">${safeTitle}</div>
                    <div class="item-date">${item.date}</div>
                    <div class="item-description">${safeDescription}</div>
                    <div class="item-actions">
                        <button class="btn btn-view btn-small view-btn" data-id="${item.id}">View</button>
                        <button class="btn btn-delete btn-small delete-btn" data-id="${item.id}">Delete</button>
                    </div>
                </div>
            </div>
        `;
    }

    // Attach event listeners to gallery items
    attachItemListeners() {
        document.querySelectorAll('.view-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = btn.getAttribute('data-id');
                this.viewItem(id);
            });
        });

        document.querySelectorAll('.delete-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = btn.getAttribute('data-id');
                this.deleteItem(id);
            });
        });

        document.querySelectorAll('.gallery-item').forEach(item => {
            item.addEventListener('click', () => {
                const id = item.getAttribute('data-id');
                this.viewItem(id);
            });
        });
    }

    // View item details in modal
    viewItem(id) {
        const item = this.items.find(i => String(i.id) === String(id));
        if (!item) return;

        const modal = document.getElementById('modal');
        const modalBody = document.getElementById('modalBody');

        let content = `
            <h2 class="modal-title">${this.escapeHtml(item.title || 'Untitled')}</h2>
            <div class="modal-description">${this.escapeHtml(item.description || 'No description provided')}</div>
        `;

        if (item.type === 'image') {
            const src = item.src || item.data;
            content += `<img src="${src}" class="modal-image" alt="${this.escapeHtml(item.title || 'Image')}">`;
        } else {
            const src = item.src || item.data;
            content += `<audio controls class="modal-audio"><source src="${src}" type="audio/mpeg">Your browser does not support the audio element.</audio>`;
        }

        content += `
            <div class="modal-info">
                <p><strong>File Name:</strong> ${this.escapeHtml(item.fileName || 'Unknown')}</p>
                <p><strong>Type:</strong> ${item.type === 'image' ? 'Image' : 'Audio'}</p>
                <p><strong>Date:</strong> ${item.date}</p>
                <p><strong>Size:</strong> ${item.size || 'N/A'} MB</p>
            </div>
        `;

        modalBody.innerHTML = content;
        modal.style.display = 'block';
    }

    // Delete item
    async deleteItem(id) {
        if (!confirm('Are you sure you want to delete this item?')) {
            return;
        }

        try {
            const response = await fetch(`/api/assets/${id}`, { method: 'DELETE' });
            if (!response.ok) {
                throw new Error('Delete failed');
            }
            this.items = this.items.filter(i => String(i.id) !== String(id));
            this.saveToStorage();
            this.render();
            this.showStatus('Item deleted successfully', 'success');
        } catch (error) {
            this.showStatus('Could not delete item', 'error');
        }
    }

    // Update statistics
    updateStats() {
        const total = this.items.length;
        const images = this.items.filter(i => i.type === 'image').length;
        const audio = this.items.filter(i => i.type === 'audio').length;
        const totalSize = this.items.reduce((sum, item) => {
            const value = Number(item.size || 0);
            return sum + (Number.isFinite(value) ? value : 0);
        }, 0).toFixed(2);

        document.getElementById('totalCount').textContent = total;
        document.getElementById('imageCount').textContent = images;
        document.getElementById('audioCount').textContent = audio;
        document.getElementById('totalSize').textContent = totalSize + ' MB';
    }

    // Show status message
    showStatus(message, type) {
        const statusEl = document.getElementById('uploadStatus');
        statusEl.textContent = message;
        statusEl.className = `status-message ${type}`;
        setTimeout(() => {
            statusEl.className = 'status-message';
        }, 3000);
    }

    // Save to localStorage
    saveToStorage() {
        try {
            localStorage.setItem('galleryItems', JSON.stringify(this.items));
        } catch (e) {
            console.error('Failed to save to storage:', e);
        }
    }

    // Load from localStorage
    loadFromStorage() {
        try {
            const stored = localStorage.getItem('galleryItems');
            if (stored) {
                this.items = JSON.parse(stored);
            }
        } catch (e) {
            console.error('Failed to load from storage:', e);
            this.items = [];
        }
    }

    // Escape HTML special characters
    escapeHtml(text) {
        const map = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        };
        return String(text || '').replace(/[&<>"']/g, m => map[m]);
    }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.galleryManager = new GalleryManager();
});
