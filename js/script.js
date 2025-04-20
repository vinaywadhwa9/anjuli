// Global variables
let allPoems = [];
let uniqueThemesHindi = new Set();
let baseUrl = '';
let activeTheme = 'all'; // Track the currently selected theme

// DOM elements - add null checks
const poemsContainer = document.getElementById('poems-container');
const searchInput = document.getElementById('search-input');
const themePillsContainer = document.getElementById('theme-pills-container');
const modal = document.getElementById('poem-modal');
const closeModal = document.querySelector('.close-modal');
const modalTitle = modal ? document.getElementById('modal-title') : null;
const modalDate = modal ? document.getElementById('modal-date') : null;
const modalImage = modal ? document.getElementById('modal-image') : null;
const modalText = modal ? document.getElementById('modal-text') : null;
const modalTags = modal ? document.getElementById('modal-tags') : null;

// Version tracking - helps with cache busting
const scriptVersion = "v1.0.7-theme-pills";

// Initialize the application
document.addEventListener('DOMContentLoaded', initApp);

async function initApp() {
    try {
        // Determine base URL for GitHub Pages
        detectBaseUrl();

        // Check if required DOM elements exist
        if (!poemsContainer) {
            document.body.innerHTML = '<div class="error">Error: Could not find poems container element.</div>';
            return;
        }

        poemsContainer.innerHTML = '<div id="loading">Loading poems... Please wait</div>';

        // Load all poems from the manifest file
        try {
            const poemsList = await loadPoemsFromManifest();
            allPoems = [...poemsList];
        } catch (error) {
            console.error(`Error loading poems:`, error);
            poemsContainer.innerHTML = `<div class="error">Error loading poems: ${error.message}</div>`;
            return;
        }

        if (allPoems.length === 0) {
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

        // Sort poems in reverse chronological order (newest first)
        allPoems.sort((a, b) => {
            // Parse dates properly with consistent format
            const dateA = parsePoetryDate(a.date);
            const dateB = parsePoetryDate(b.date);
            return dateB - dateA; // Sort in descending order (newest first)
        });

        // Extract unique Hindi themes for the filter
        allPoems.forEach((poem) => {
            if (poem.themesHindi && Array.isArray(poem.themesHindi)) {
                poem.themesHindi.forEach(theme => {
                    if (theme && typeof theme === 'string') {
                        uniqueThemesHindi.add(theme.trim());
                    }
                });
            }
        });

        // Populate theme filter with Hindi themes
        if (themePillsContainer) {
            populateThemeFilter();
        }

        // Display the poems
        displayPoems(allPoems);

        // Set up event listeners
        setupEventListeners();
    } catch (error) {
        console.error(`Critical error:`, error);
        if (poemsContainer) {
            poemsContainer.innerHTML = `<div class="error">Error loading poems. Please try again later. Details: ${error.message}</div>`;
        }
    }
}

// Function to detect base URL for GitHub Pages
function detectBaseUrl() {
    const currentUrl = window.location.href;

    if (currentUrl.includes('github.io')) {
        // For GitHub Pages, use a hardcoded path based on repository name
        baseUrl = '/anjuli/';
    } else {
        // For local development
        baseUrl = '/';
    }
}

// Simplified function to load poems using the manifest
async function loadPoemsFromManifest() {
    try {
        // Add a cache-busting parameter to ensure we get the latest manifest
        const timestamp = new Date().getTime();

        // GitHub Pages specific manifest path with cache busting
        const manifestPath = `${baseUrl}poems/poems-manifest.json?nocache=${timestamp}`;

        const manifestResponse = await fetch(manifestPath, {
            cache: 'no-store', // Tell browser not to use cached version
            headers: {
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Pragma': 'no-cache',
                'Expires': '0'
            }
        });

        if (!manifestResponse.ok) {
            throw new Error(`Failed to load poems manifest. Status: ${manifestResponse.status}`);
        }

        const manifest = await manifestResponse.json();

        if (!manifest.poems || !Array.isArray(manifest.poems) || manifest.poems.length === 0) {
            throw new Error('Manifest has no poems or is invalid');
        }

        // Load each poem from the manifest
        const poems = await Promise.all(
            manifest.poems.map(async (fileName) => {
                try {
                    return await loadPoemFile(fileName);
                } catch (error) {
                    return null;
                }
            })
        );

        // Filter out any nulls (failed to load)
        return poems.filter(poem => poem !== null);
    } catch (error) {
        throw error;
    }
}

// Load a single poem file by filename
async function loadPoemFile(fileName) {
    try {
        // Add a cache-busting parameter
        const timestamp = new Date().getTime();

        // Construct paths with the baseUrl
        const poemsDir = `${baseUrl}poems/`;

        // Load metadata
        const metadataUrl = `${poemsDir}${fileName}.metadata.json?nocache=${timestamp}`;

        const metadataResponse = await fetch(metadataUrl, {
            cache: 'no-store',
            headers: {
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Pragma': 'no-cache',
                'Expires': '0'
            }
        });

        if (!metadataResponse.ok) {
            throw new Error(`Failed to load metadata for ${fileName}. Status: ${metadataResponse.status}`);
        }

        const metadata = await metadataResponse.json();

        // Load text
        const textUrl = `${poemsDir}${fileName}.txt?nocache=${timestamp}`;

        const textResponse = await fetch(textUrl, {
            cache: 'no-store',
            headers: {
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Pragma': 'no-cache',
                'Expires': '0'
            }
        });

        if (!textResponse.ok) {
            throw new Error(`Failed to load text for ${fileName}. Status: ${textResponse.status}`);
        }

        const text = await textResponse.text();

        // Normalize line endings to LF
        const normalizedText = text.replace(/\r\n/g, '\n');

        // Set image path - no cache parameter for images as they're large files
        const imagePath = `${poemsDir}${fileName}.png`;

        return {
            id: `poem-${fileName}`,
            title: metadata.title || fileName,
            text: normalizedText,
            date: metadata.date || fileName.split('_')[0], // Try to extract date from filename
            language: metadata.language || 'Hindi',
            imagePath: imagePath,
            themes: metadata.themes || [],
            // Use public_themes_hindi instead of theme_hindi
            themesHindi: metadata.public_themes_hindi || [],
        };
    } catch (error) {
        console.error(`Error loading poem ${fileName}:`, error);
        return null;
    }
}

function populateThemeFilter() {
    if (!themePillsContainer) return;

    // Sort themes alphabetically
    const sortedThemes = Array.from(uniqueThemesHindi).sort();

    // Add "All Themes" pill first (selected by default)
    const allThemePill = document.createElement('button');
    allThemePill.className = 'theme-pill active';
    allThemePill.textContent = 'All Themes';
    allThemePill.dataset.theme = 'all';
    allThemePill.addEventListener('click', handleThemeClick);
    themePillsContainer.appendChild(allThemePill);

    // Add theme pills
    sortedThemes.forEach(theme => {
        const pill = document.createElement('button');
        pill.className = 'theme-pill';
        pill.textContent = theme;
        pill.dataset.theme = theme;
        pill.addEventListener('click', handleThemeClick);
        themePillsContainer.appendChild(pill);
    });
}

function handleThemeClick(event) {
    // Update active theme
    activeTheme = event.target.dataset.theme;

    // Update active class on pills
    document.querySelectorAll('.theme-pill').forEach(pill => {
        pill.classList.remove('active');
    });
    event.target.classList.add('active');

    // Filter poems based on new selection
    filterPoems();
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
        // Parse the date using our robust parsing function
        const date = parsePoetryDate(dateString);

        // Format as DD MMM YYYY (e.g., 15 Jan 2024)
        return date.toLocaleDateString('en-IN', {
            day: 'numeric',
            month: 'short',
            year: 'numeric'
        });
    } catch (error) {
        return dateString; // Return original string as fallback
    }
}

function openPoemModal(poem) {
    if (!modal) return;

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
    const searchValue = searchInput ? searchInput.value.toLowerCase() : '';
    const themeValue = activeTheme; // Use the activeTheme variable instead of dropdown value

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

    displayPoems(filteredPoems);
}

function setupEventListeners() {
    if (searchInput) {
        searchInput.addEventListener('input', filterPoems);
    }

    // Note: Theme pill event listeners are added when the pills are created

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

/**
 * Parse date strings consistently for sorting
 * Handles different date formats including:
 * - ISO strings (2025-04-16)
 * - Formatted dates (16 Apr 2025)
 * - Filenames with dates (2025-04-16_title)
 */
function parsePoetryDate(dateString) {
    if (!dateString) return new Date(0); // Default to epoch if no date

    try {
        // Case 1: Check if it's already a Date object
        if (dateString instanceof Date) {
            return dateString;
        }

        // Case 2: Try to extract date from filename pattern (YYYY-MM-DD_title)
        const filenameMatch = dateString.match(/^(\d{4})-(\d{2})-(\d{2})_/);
        if (filenameMatch) {
            const [_, year, month, day] = filenameMatch;
            return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
        }

        // Case 3: Handle formatted date (DD MMM YYYY)
        const formattedMatch = dateString.match(/(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{4})/i);
        if (formattedMatch) {
            const [_, day, monthStr, year] = formattedMatch;
            const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
            const month = monthNames.findIndex(m => m.toLowerCase() === monthStr.toLowerCase());
            if (month !== -1) {
                return new Date(parseInt(year), month, parseInt(day));
            }
        }

        // Case 4: Try standard date parsing (handles ISO format YYYY-MM-DD)
        const date = new Date(dateString);
        if (!isNaN(date.getTime())) {
            return date;
        }

        // If all else fails, log error and return current date
        console.error(`Failed to parse date: ${dateString}`);
        return new Date();
    } catch (error) {
        console.error(`Error parsing date ${dateString}:`, error);
        return new Date(); // Return current date as fallback
    }
} 