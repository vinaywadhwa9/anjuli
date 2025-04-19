// Global variables
let allPoems = [];
let uniqueThemesHindi = new Set();

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

        // Check if required DOM elements exist
        if (!poemsContainer) {
            document.body.innerHTML = '<div class="error">Error: Could not find poems container element.</div>';
            return;
        }

        poemsContainer.innerHTML = '<div id="loading">Loading poems... Please wait</div>';

        // Load all poems from the poems directory (instead of numbered folders)
        try {
            logDebug(`Attempting to load poems from the poems directory`);
            const poemsList = await loadPoemsFromDirectory('poems');
            logDebug(`Successfully loaded ${poemsList.length} poems`);
            allPoems = [...allPoems, ...poemsList];
        } catch (error) {
            logDebug(`Error loading poems:`, error);
        }

        logDebug(`Total poems loaded: ${allPoems.length}`);

        if (allPoems.length === 0) {
            logDebug('No poems were loaded, showing error message');
            poemsContainer.innerHTML = `
                <div class="error">
                    No poems could be loaded. This could be because:
                    <ul>
                        <li>You're viewing the site locally without a server</li>
                        <li>The poem files are not in the expected format</li>
                        <li>The manifest files are missing</li>
                    </ul>
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

// New function to load poems from a directory
async function loadPoemsFromDirectory(directory) {
    logDebug(`Loading poems from directory ${directory}...`);

    try {
        // Try to load manifest file first (for GitHub Pages)
        logDebug(`Trying to load manifest for directory ${directory}`);
        const manifestResponse = await fetch(`${directory}/poems-manifest.json`);

        if (manifestResponse.ok) {
            logDebug(`Found manifest file for directory ${directory}`);
            const manifest = await manifestResponse.json();

            if (!manifest.poems || !Array.isArray(manifest.poems) || manifest.poems.length === 0) {
                logDebug(`Manifest for directory ${directory} has no poems or is invalid`);
                return [];
            }

            logDebug(`Manifest contains ${manifest.poems.length} poems`);

            // For each poem in the manifest, load the data
            const poems = await Promise.all(
                manifest.poems.map(async (fileName) => {
                    try {
                        return await loadPoemFromDirectory(directory, fileName);
                    } catch (error) {
                        logDebug(`Failed to load poem ${fileName} from directory ${directory}:`, error);
                        return null;
                    }
                })
            );

            return poems.filter(poem => poem !== null);
        } else {
            logDebug(`No manifest file found, trying direct poem loading`);

            // Try to directly load poem files by checking for metadata files
            const metadataFiles = [];

            // Get list of all files in the poems directory
            try {
                logDebug(`Attempting to get direct listing of metadata files`);
                const response = await fetch(`${directory}/`);

                if (response.ok) {
                    // Parse HTML to get file listings if directory listing is supported
                    const html = await response.text();
                    const parser = new DOMParser();
                    const doc = parser.parseFromString(html, 'text/html');
                    const links = Array.from(doc.querySelectorAll('a'));

                    links.forEach(link => {
                        const href = link.getAttribute('href');
                        if (href && href.endsWith('.metadata.json')) {
                            metadataFiles.push(href);
                        }
                    });

                    logDebug(`Found ${metadataFiles.length} metadata files via directory listing`);
                } else {
                    logDebug(`Directory listing not supported, falling back to scanning files manually`);
                }
            } catch (error) {
                logDebug(`Error getting directory listing: ${error.message}`);
            }

            // If we couldn't get metadata files from listing, try some common patterns
            if (metadataFiles.length === 0) {
                // Scan for specific date patterns in filenames (based on your repository content)
                const years = ['2024', '2025'];
                const months = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'));
                const days = Array.from({ length: 31 }, (_, i) => String(i + 1).padStart(2, '0'));

                // Try some common date patterns to find poem files
                for (const year of years) {
                    for (const month of months) {
                        for (const day of days) {
                            try {
                                const testPath = `${directory}/${year}-${month}-${day}_`;
                                const response = await fetch(`${testPath}*.metadata.json`);
                                if (response.ok) {
                                    // If we find a file with this pattern, add it
                                    const fileName = `${year}-${month}-${day}_`;
                                    metadataFiles.push(fileName);
                                }
                            } catch (error) {
                                // Ignore errors from non-existent files
                            }
                        }
                    }
                }
            }

            // Load each poem based on metadata files found
            const poems = [];
            for (const metadataFile of metadataFiles) {
                try {
                    const fileName = metadataFile.split('/').pop().replace('.metadata.json', '');
                    const poem = await loadPoemFromDirectory(directory, fileName);
                    if (poem) {
                        poems.push(poem);
                    }
                } catch (error) {
                    logDebug(`Error loading poem from ${metadataFile}: ${error.message}`);
                }
            }

            logDebug(`Successfully loaded ${poems.length} poems directly`);
            return poems;
        }
    } catch (error) {
        logDebug(`Error in loadPoemsFromDirectory: ${error.message}`);

        // Last resort - try to access all files in the directory
        return fallbackLoadPoems(directory);
    }
}

// Function to load a poem from directory
async function loadPoemFromDirectory(directory, fileName) {
    logDebug(`Loading poem ${fileName} from directory ${directory}`);

    try {
        // Load metadata
        const metadataUrl = `${directory}/${fileName}.metadata.json`;
        const metadataResponse = await fetch(metadataUrl);

        if (!metadataResponse.ok) {
            throw new Error(`Failed to load metadata for ${fileName}`);
        }

        const metadata = await metadataResponse.json();

        // Load text
        const textUrl = `${directory}/${fileName}.txt`;
        const textResponse = await fetch(textUrl);

        if (!textResponse.ok) {
            throw new Error(`Failed to load text for ${fileName}`);
        }

        const text = await textResponse.text();

        // Check if image exists
        const imagePath = `${directory}/${fileName}.png`;
        const imageExists = await imageExists(imagePath);

        return {
            id: `poem-${fileName}`,
            title: metadata.title || 'Untitled',
            text: text,
            date: metadata.date || new Date().toISOString().split('T')[0],
            language: metadata.language || 'Hindi',
            imagePath: imageExists ? imagePath : 'img/placeholder.jpg',
            themes: metadata.themes || [],
            themesHindi: metadata.themesHindi || [],
            directory: directory
        };
    } catch (error) {
        logDebug(`Error loading poem ${fileName}: ${error.message}`);
        return null;
    }
}

// Keep the existing fallback method but modify it to work with the new directory structure
async function fallbackLoadPoems(directory) {
    logDebug(`Attempting fallback loading for directory ${directory}`);

    try {
        // Try to load the poems.txt file
        logDebug(`Trying to load poems.txt for directory ${directory}`);
        const poemsFileResponse = await fetch(`${directory}/poems.txt`);

        if (!poemsFileResponse.ok) {
            logDebug(`Failed to load poems.txt from directory ${directory}`);

            // Last resort - just create a filler poem to show something
            logDebug(`Creating placeholder poem for directory ${directory}`);
            return [{
                id: `poem-${directory}-placeholder`,
                title: `Poems Collection`,
                text: "We couldn't load the actual poems. Please make sure the files are properly formatted and accessible.",
                date: new Date().toISOString().split('T')[0],
                language: 'Hindi',
                imagePath: `img/placeholder.jpg`,
                themes: ['poetry'],
                directory: directory
            }];
        }

        const poemsText = await poemsFileResponse.text();
        logDebug(`Successfully loaded poems.txt for directory ${directory}, parsing content`);

        const poemEntries = parsePoems(poemsText, directory);
        logDebug(`Parsed ${poemEntries.length} poems from poems.txt`);

        return poemEntries;
    } catch (error) {
        logDebug(`Error in fallbackLoadPoems(${directory}): ${error.message}`);
        return [];
    }
}

// Update parse poems to use directory instead of folderNumber
function parsePoems(poemsText, directory) {
    logDebug(`Parsing poems text for directory ${directory}`);

    const poems = [];
    const poemBlocks = poemsText.split(/\n\s*\n/); // Split by empty lines

    logDebug(`Found ${poemBlocks.length} potential poem blocks`);

    for (const block of poemBlocks) {
        if (block.trim() === '') continue;

        const lines = block.split('\n');
        const titleMatch = lines[0].match(/^(.+)$/);

        if (titleMatch) {
            const title = titleMatch[1].trim();
            const poemText = lines.slice(1).join('\n');

            // Create a basic poem object
            const poem = {
                id: `poem-${directory}-${poems.length + 1}`,
                title: title,
                text: poemText,
                date: new Date().toISOString().split('T')[0], // Placeholder
                language: 'Hindi', // Assuming Hindi as default
                imagePath: `img/placeholder.jpg`, // Use common placeholder
                themes: ['poetry'], // Placeholder
                directory: directory
            };

            poems.push(poem);
        }
    }

    logDebug(`Successfully parsed ${poems.length} poems`);
    return poems;
}

// Keep the original loadPoem function for backward compatibility
async function loadPoem(folderNumber, fileName) {
    return loadPoemFromDirectory(`${folderNumber}`, fileName);
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