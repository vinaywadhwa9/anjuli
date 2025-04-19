// Global variables
let allPoems = [];
let uniqueThemesHindi = new Set();
let baseUrl = '';

// DOM elements - add null checks
const poemsContainer = document.getElementById('poems-container');
const searchInput = document.getElementById('search');
const themeFilter = document.getElementById('theme-filter');
const modal = document.getElementById('poem-modal');
const closeModal = document.querySelector('.close-modal');
const modalTitle = modal ? document.getElementById('modal-title') : null;
const modalDate = modal ? document.getElementById('modal-date') : null;
const modalImage = modal ? document.getElementById('modal-image') : null;
const modalText = modal ? document.getElementById('modal-text') : null;
const modalTags = modal ? document.getElementById('modal-tags') : null;

// Logger function for better debugging
function logDebug(message, data = null) {
    const timestamp = new Date().toISOString();
    if (data) {
        console.log(`[${timestamp}] ${message}`, data);
    } else {
        console.log(`[${timestamp}] ${message}`);
    }
}

// Initialize the application
document.addEventListener('DOMContentLoaded', initApp);

async function initApp() {
    try {
        logDebug('Starting application initialization');

        // Determine base URL for GitHub Pages
        detectBaseUrl();
        logDebug(`Using base URL: ${baseUrl}`);

        // Check if required DOM elements exist
        if (!poemsContainer) {
            document.body.innerHTML = '<div class="error">Error: Could not find poems container element.</div>';
            return;
        }

        poemsContainer.innerHTML = '<div id="loading">Loading poems... Please wait</div>';

        // Load all poems from the manifest file
        try {
            logDebug(`Attempting to load poems from manifest`);
            const poemsList = await loadPoemsFromManifest();
            logDebug(`Successfully loaded ${poemsList.length} poems`);
            allPoems = [...poemsList];
        } catch (error) {
            logDebug(`Error loading poems:`, error);
            poemsContainer.innerHTML = `<div class="error">Error loading poems: ${error.message}</div>`;
            return;
        }

        logDebug(`Total poems loaded: ${allPoems.length}`);

        if (allPoems.length === 0) {
            logDebug('No poems were loaded, showing error message');
            poemsContainer.innerHTML = `
                <div class="error">
                    No poems could be loaded. This could be because:
                    <ul>
                        <li>The poems manifest file could not be found</li>
                        <li>There was an error loading the poem files</li>
                        <li>The poem files are not in the expected format</li>
                    </ul>
                    <p>Check the browser console for more details.</p>
                </div>`;
            return;
        }

        // Sort poems chronologically by date
        allPoems.sort((a, b) => new Date(a.date) - new Date(b.date));

        // Extract unique Hindi themes for the filter
        allPoems.forEach(poem => {
            if (poem.themesHindi) {
                poem.themesHindi.forEach(theme => uniqueThemesHindi.add(theme));
            }
        });

        logDebug(`Found ${uniqueThemesHindi.size} unique Hindi themes`);

        // Populate theme filter with Hindi themes
        if (themeFilter) {
            populateThemeFilter();
        }

        // Display the poems
        displayPoems(allPoems);

        // Set up event listeners
        setupEventListeners();

        logDebug(`Application initialized successfully`);
    } catch (error) {
        logDebug('Critical error initializing application:', error);
        if (poemsContainer) {
            poemsContainer.innerHTML = `<div class="error">Error loading poems. Please try again later. Details: ${error.message}</div>`;
        }
    }
}

// Function to detect base URL for GitHub Pages
function detectBaseUrl() {
    const currentUrl = window.location.href;
    logDebug(`Current URL: ${currentUrl}`);

    if (currentUrl.includes('github.io')) {
        // For GitHub Pages, use a hardcoded path based on repository name
        baseUrl = '/anjuli/';
        logDebug(`Using GitHub Pages path: ${baseUrl}`);
    } else {
        // For local development
        baseUrl = '/';
        logDebug('Using default base URL for local development');
    }
}

// Simplified function to load poems using the manifest
async function loadPoemsFromManifest() {
    logDebug(`Loading poems from manifest`);

    try {
        // GitHub Pages specific manifest path
        const manifestPath = `${baseUrl}poems/poems-manifest.json`;
        logDebug(`Attempting to load manifest from: ${manifestPath}`);

        const manifestResponse = await fetch(manifestPath);

        if (!manifestResponse.ok) {
            throw new Error(`Failed to load poems manifest. Status: ${manifestResponse.status}`);
        }

        const manifest = await manifestResponse.json();

        if (!manifest.poems || !Array.isArray(manifest.poems) || manifest.poems.length === 0) {
            throw new Error('Manifest has no poems or is invalid');
        }

        logDebug(`Manifest contains ${manifest.poems.length} poems`);

        // Load each poem from the manifest
        const poems = await Promise.all(
            manifest.poems.map(async (fileName) => {
                try {
                    return await loadPoemFile(fileName);
                } catch (error) {
                    logDebug(`Failed to load poem ${fileName}:`, error);
                    return null;
                }
            })
        );

        // Filter out any nulls (failed to load)
        return poems.filter(poem => poem !== null);
    } catch (error) {
        logDebug(`Error loading poems from manifest: ${error.message}`);
        throw error;
    }
}

// Load a single poem file by filename
async function loadPoemFile(fileName) {
    logDebug(`Loading poem file: ${fileName}`);

    try {
        // Construct paths with the baseUrl
        const poemsDir = `${baseUrl}poems/`;

        // Load metadata
        const metadataUrl = `${poemsDir}${fileName}.metadata.json`;
        logDebug(`Attempting to load metadata from: ${metadataUrl}`);
        const metadataResponse = await fetch(metadataUrl);

        if (!metadataResponse.ok) {
            throw new Error(`Failed to load metadata for ${fileName}. Status: ${metadataResponse.status}`);
        }

        const metadata = await metadataResponse.json();

        // Load text
        const textUrl = `${poemsDir}${fileName}.txt`;
        logDebug(`Attempting to load text from: ${textUrl}`);
        const textResponse = await fetch(textUrl);

        if (!textResponse.ok) {
            throw new Error(`Failed to load text for ${fileName}. Status: ${textResponse.status}`);
        }

        const text = await textResponse.text();

        // Set image path
        const imagePath = `${poemsDir}${fileName}.png`;

        return {
            id: `poem-${fileName}`,
            title: metadata.title || fileName,
            text: text,
            date: metadata.date || fileName.split('_')[0], // Try to extract date from filename
            language: metadata.language || 'Hindi',
            imagePath: imagePath,
            themes: metadata.themes || [],
            themesHindi: metadata.themesHindi || [],
        };
    } catch (error) {
        logDebug(`Error loading poem ${fileName}: ${error.message}`);
        return null;
    }
}

function populateThemeFilter() {
    // Sort themes alphabetically
    const sortedThemes = Array.from(uniqueThemesHindi).sort();

    // Add "All Themes" option
    themeFilter.innerHTML = '<option value="all">All Themes</option>';

    // Add theme options
    sortedThemes.forEach(theme => {
        const option = document.createElement('option');
        option.value = theme;
        option.textContent = theme;
        themeFilter.appendChild(option);
    });
}

function displayPoems(poems) {
    if (poemsContainer) {
        if (poems.length === 0) {
            poemsContainer.innerHTML = '<div class="no-poems">No poems found matching your filters</div>';
            return;
        }

        poemsContainer.innerHTML = '';
        poems.forEach(poem => {
            const poemCard = createPoemCard(poem);
            poemsContainer.appendChild(poemCard);
        });
    }
}

async function imageExists(url) {
    try {
        const response = await fetch(url, { method: 'HEAD' });
        return response.ok;
    } catch (error) {
        return false;
    }
}

function createPoemCard(poem) {
    const card = document.createElement('div');
    card.className = 'poem-card';
    card.setAttribute('data-id', poem.id);

    // Image container
    const imageContainer = document.createElement('div');
    imageContainer.className = 'poem-image-container';

    const image = document.createElement('img');
    image.className = 'poem-image';
    image.src = poem.imagePath;
    image.alt = poem.title;
    image.loading = 'lazy';

    // Simple error handler for image
    image.onerror = function () {
        this.src = `${baseUrl}img/placeholder.jpg`;
    };

    imageContainer.appendChild(image);
    card.appendChild(imageContainer);

    // Content
    const content = document.createElement('div');
    content.className = 'poem-content';

    const title = document.createElement('h3');
    title.className = 'poem-title';
    title.textContent = poem.title;
    content.appendChild(title);

    const date = document.createElement('div');
    date.className = 'poem-date';
    date.textContent = formatDate(poem.date);
    content.appendChild(date);

    const preview = document.createElement('div');
    preview.className = 'poem-preview';

    // Get first 100 characters as preview
    const previewText = poem.text.substring(0, 100) + (poem.text.length > 100 ? '...' : '');
    preview.textContent = previewText;
    content.appendChild(preview);

    // Themes/tags
    if (poem.themesHindi && poem.themesHindi.length > 0) {
        const tagsContainer = document.createElement('div');
        tagsContainer.className = 'tags-container';

        poem.themesHindi.forEach(theme => {
            const tag = document.createElement('span');
            tag.className = 'tag';
            tag.textContent = theme;
            tagsContainer.appendChild(tag);
        });

        content.appendChild(tagsContainer);
    }

    card.appendChild(content);

    // Add click event
    card.addEventListener('click', () => openPoemModal(poem));

    return card;
}

function formatDate(dateString) {
    if (!dateString) return '';

    try {
        const date = new Date(dateString);

        // Format as DD MMM YYYY (e.g., 15 Jan 2024)
        return date.toLocaleDateString('en-IN', {
            day: 'numeric',
            month: 'short',
            year: 'numeric'
        });
    } catch (error) {
        logDebug(`Error formatting date: ${dateString}`, error);
        return dateString;
    }
}

function openPoemModal(poem) {
    if (!modal) return;

    logDebug(`Opening modal for poem: ${poem.title}`);

    // Set modal content
    if (modalTitle) modalTitle.textContent = poem.title;
    if (modalDate) modalDate.textContent = formatDate(poem.date);
    if (modalImage) {
        modalImage.src = poem.imagePath;
        modalImage.alt = poem.title;

        // Simple error handler for image
        modalImage.onerror = function () {
            this.src = `${baseUrl}img/placeholder.jpg`;
        };
    }

    if (modalText) {
        // Format poem text with line breaks
        modalText.innerHTML = poem.text.split('\n').map(line => {
            // If line is empty, add extra vertical space
            return line.trim() === '' ? '<br>' : line;
        }).join('<br>');
    }

    if (modalTags && poem.themesHindi && poem.themesHindi.length > 0) {
        modalTags.innerHTML = '';
        poem.themesHindi.forEach(theme => {
            const tag = document.createElement('span');
            tag.className = 'tag';
            tag.textContent = theme;
            modalTags.appendChild(tag);
        });
    } else if (modalTags) {
        modalTags.innerHTML = '';
    }

    // Show modal
    modal.style.display = 'block';
    document.body.style.overflow = 'hidden'; // Prevent scrolling
}

function closeModalHandler() {
    if (!modal) return;

    modal.style.display = 'none';
    document.body.style.overflow = ''; // Re-enable scrolling
}

function filterPoems() {
    logDebug(`Filtering poems...`);

    const searchValue = searchInput ? searchInput.value.toLowerCase() : '';
    const themeValue = themeFilter ? themeFilter.value : 'all';

    logDebug(`Filter values - Search: "${searchValue}", Theme: ${themeValue}`);

    const filteredPoems = allPoems.filter(poem => {
        // Text search in title and content
        const matchesSearch = searchValue === '' ||
            poem.title.toLowerCase().includes(searchValue) ||
            poem.text.toLowerCase().includes(searchValue);

        // Theme filter
        const matchesTheme = themeValue === 'all' ||
            (poem.themesHindi && poem.themesHindi.includes(themeValue));

        return matchesSearch && matchesTheme;
    });

    logDebug(`Filtered to ${filteredPoems.length} poems`);
    displayPoems(filteredPoems);
}

function setupEventListeners() {
    if (searchInput) {
        searchInput.addEventListener('input', filterPoems);
    }

    if (themeFilter) {
        themeFilter.addEventListener('change', filterPoems);
    }

    if (closeModal) {
        closeModal.addEventListener('click', closeModalHandler);
    }

    // Close modal when clicking outside content
    if (modal) {
        modal.addEventListener('click', event => {
            if (event.target === modal) {
                closeModalHandler();
            }
        });
    }

    // Close modal with Escape key
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && modal && modal.style.display === 'block') {
            closeModalHandler();
        }
    });
} 