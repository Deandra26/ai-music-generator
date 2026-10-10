// Export and Import functionality for Gallery
class ExportImportManager {
    constructor() {
        this.initializeEventListeners();
    }

    initializeEventListeners() {
        // Add export/import buttons to the page
        const filterSection = document.querySelector('.filter-section');
        if (filterSection) {
            const buttonsContainer = document.createElement('div');
            buttonsContainer.className = 'export-import-buttons';
            buttonsContainer.innerHTML = `
                <button id="exportButton" class="btn btn-secondary" title="Export all media and metadata as ZIP">
                    📥 Export Gallery
                </button>
                <button id="importButton" class="btn btn-secondary" title="Import previously exported gallery">
                    📤 Import Gallery
                </button>
                <input type="file" id="importFileInput" accept=".zip,.json" style="display: none;">
            `;
            
            filterSection.appendChild(buttonsContainer);

            document.getElementById('exportButton').addEventListener('click', () => this.exportGallery());
            document.getElementById('importButton').addEventListener('click', () => {
                document.getElementById('importFileInput').click();
            });
            document.getElementById('importFileInput').addEventListener('change', (e) => {
                this.importGallery(e.target.files[0]);
            });
        }
    }

    // Export gallery as JSON with embedded media
    async exportGallery() {
        if (!window.galleryManager || window.galleryManager.items.length === 0) {
            this.showNotification('No items to export', 'error');
            return;
        }

        try {
            this.showNotification('Preparing export...', 'info');

            const exportData = {
                version: '1.0',
                exportDate: new Date().toISOString(),
                totalItems: window.galleryManager.items.length,
                items: []
            };

            // Process each item
            for (const item of window.galleryManager.items) {
                try {
                    let mediaData = null;

                    // Fetch media from server or use embedded data
                    if (item.src) {
                        // Server-hosted file
                        const response = await fetch(item.src);
                        const blob = await response.blob();
                        mediaData = await this.blobToBase64(blob);
                    } else if (item.data) {
                        // Already embedded (browser mode)
                        mediaData = item.data;
                    }

                    exportData.items.push({
                        id: item.id,
                        type: item.type,
                        title: item.title,
                        description: item.description,
                        fileName: item.fileName,
                        date: item.date,
                        size: item.size,
                        mediaData: mediaData
                    });
                } catch (error) {
                    console.error(`Failed to export item ${item.id}:`, error);
                }
            }

            // Create and download JSON file
            const jsonString = JSON.stringify(exportData, null, 2);
            const blob = new Blob([jsonString], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `gallery-export-${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);

            this.showNotification(`✅ Exported ${exportData.items.length} items successfully!`, 'success');
        } catch (error) {
            console.error('Export failed:', error);
            this.showNotification('Export failed: ' + error.message, 'error');
        }
    }

    // Import gallery from JSON file
    async importGallery(file) {
        if (!file) return;

        try {
            this.showNotification('Reading import file...', 'info');

            const text = await this.readFileAsText(file);
            const importData = JSON.parse(text);

            // Validate import format
            if (!importData.items || !Array.isArray(importData.items)) {
                throw new Error('Invalid gallery export format');
            }

            // Ask user if they want to merge or replace
            const shouldMerge = confirm(
                `Found ${importData.items.length} items to import.\n\n` +
                'Click OK to ADD to current gallery,\n' +
                'or CANCEL to REPLACE current gallery.'
            );

            if (!shouldMerge) {
                // Replace mode
                if (!confirm('Are you sure you want to replace your current gallery? This cannot be undone.')) {
                    return;
                }
                window.galleryManager.items = [];
            }

            let successCount = 0;
            let failCount = 0;

            // Import each item
            for (const importItem of importData.items) {
                try {
                    const item = {
                        id: importItem.id || (Date.now() + Math.random()),
                        type: importItem.type,
                        title: importItem.title,
                        description: importItem.description,
                        fileName: importItem.fileName,
                        date: importItem.date || new Date().toISOString(),
                        size: importItem.size,
                        data: importItem.mediaData
                    };

                    // If server is running, upload to server
                    if (await this.isServerRunning()) {
                        await this.uploadItemToServer(item);
                    }

                    window.galleryManager.items.push(item);
                    successCount++;
                } catch (error) {
                    console.error(`Failed to import item:`, error);
                    failCount++;
                }
            }

            window.galleryManager.saveToStorage();
            window.galleryManager.render();

            const message = `✅ Imported ${successCount} items` + 
                (failCount > 0 ? `, ${failCount} failed` : '');
            this.showNotification(message, 'success');
        } catch (error) {
            console.error('Import failed:', error);
            this.showNotification('Import failed: ' + error.message, 'error');
        }

        // Reset file input
        document.getElementById('importFileInput').value = '';
    }

    // Upload item to server
    async uploadItemToServer(item) {
        try {
            const base64Data = item.data;
            const byteCharacters = atob(base64Data.split(',')[1]);
            const byteNumbers = new Array(byteCharacters.length);
            for (let i = 0; i < byteCharacters.length; i++) {
                byteNumbers[i] = byteCharacters.charCodeAt(i);
            }
            const byteArray = new Uint8Array(byteNumbers);
            const blob = new Blob([byteArray], { type: this.getMimeType(item.type) });

            const file = new File([blob], item.fileName, { type: this.getMimeType(item.type) });
            const formData = new FormData();
            formData.append('file', file);
            formData.append('title', item.title);
            formData.append('description', item.description);

            const response = await fetch('/api/upload', {
                method: 'POST',
                body: formData,
            });

            if (response.ok) {
                const result = await response.json();
                item.src = result.asset.src;
            }
        } catch (error) {
            console.warn('Could not upload to server, keeping local copy:', error);
        }
    }

    // Check if backend server is running
    async isServerRunning() {
        try {
            const response = await fetch('/health', { method: 'HEAD' });
            return response.ok;
        } catch {
            return false;
        }
    }

    // Utility: Convert blob to base64
    blobToBase64(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    }

    // Utility: Read file as text
    readFileAsText(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsText(file);
        });
    }

    // Utility: Get MIME type
    getMimeType(type) {
        return type === 'image' ? 'image/png' : 'audio/mpeg';
    }

    // Show notification
    showNotification(message, type = 'info') {
        const statusEl = document.getElementById('uploadStatus');
        if (statusEl) {
            statusEl.textContent = message;
            statusEl.className = `status-message ${type}`;
            setTimeout(() => {
                statusEl.className = 'status-message';
            }, 4000);
        } else {
            console.log(`[${type}] ${message}`);
        }
    }
}

// Initialize export/import when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    // Wait for gallery manager to be ready
    setTimeout(() => {
        if (window.galleryManager) {
            window.exportImportManager = new ExportImportManager();
        }
    }, 500);
});
