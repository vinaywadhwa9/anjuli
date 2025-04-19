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

        // Load all poems from folders 1-6
        for (let folder = 1; folder <= 6; folder++) {
            try {
                logDebug(`Attempting to load poems from folder ${folder}`);
                const poemsList = await loadPoemsFromFolder(folder);
                logDebug(`Successfully loaded ${poemsList.length} poems from folder ${folder}`);
                allPoems = [...allPoems, ...poemsList];
            } catch (error) {
                logDebug(`Error loading poems from folder ${folder}:`, error);
            }
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

async function loadPoemsFromFolder(folderNumber) {
    logDebug(`Loading poems from folder ${folderNumber}...`);

    try {
        // Try to load from manifest file first (for GitHub Pages)
        logDebug(`Trying to load manifest for folder ${folderNumber}`);
        const manifestResponse = await fetch(`${folderNumber}/poems-manifest.json`);

        if (manifestResponse.ok) {
            logDebug(`Found manifest file for folder ${folderNumber}`);
            const manifest = await manifestResponse.json();

            if (!manifest.poems || !Array.isArray(manifest.poems) || manifest.poems.length === 0) {
                logDebug(`Manifest for folder ${folderNumber} has no poems or is invalid`);
                return [];
            }

            logDebug(`Manifest contains ${manifest.poems.length} poems`);

            // For each poem in the manifest, load the data
            const poems = await Promise.all(
                manifest.poems.map(async (fileName) => {
                    try {
                        return await loadPoem(folderNumber, fileName);
                    } catch (error) {
                        logDebug(`Failed to load poem ${fileName} from folder ${folderNumber}:`, error);
                        return null;
                    }
                })
            );

            const validPoems = poems.filter(poem => poem !== null);
            logDebug(`Successfully loaded ${validPoems.length} poems from folder ${folderNumber}`);

            return validPoems;
        } else {
            logDebug(`No manifest file found for folder ${folderNumber}, trying directory listing`);

            // Try directory listing
            const response = await fetch(`${folderNumber}/poems/`);

            if (!response.ok) {
                logDebug(`Directory listing failed for folder ${folderNumber}`);
                throw new Error(`Failed to load poems from folder ${folderNumber}`);
            }

            // This would work if the server supports directory listing
            const html = await response.text();
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            const links = doc.querySelectorAll('a');

            const poemFiles = Array.from(links)
                .map(link => link.href)
                .filter(href => href.endsWith('.metadata.json'));

            logDebug(`Found ${poemFiles.length} poem files via directory listing`);

            // For each metadata file, load the poem
            const poems = await Promise.all(
                poemFiles.map(async (metadataUrl) => {
                    const fileName = metadataUrl.split('/').pop().replace('.metadata.json', '');
                    try {
                        return await loadPoem(folderNumber, fileName);
                    } catch (error) {
                        logDebug(`Failed to load poem ${fileName}:`, error);
                        return null;
                    }
                })
            );

            return poems.filter(poem => poem !== null);
        }
    } catch (error) {
        logDebug(`Error in loadPoemsFromFolder(${folderNumber}):`, error);

        // Fallback: Try to use the poems.txt file directly
        return await fallbackLoadPoems(folderNumber);
    }
}

// Fallback method to load poems when directory listing is not supported
async function fallbackLoadPoems(folderNumber) {
    logDebug(`Attempting fallback loading for folder ${folderNumber}`);

    try {
        // Try to load the poems.txt file
        logDebug(`Trying to load poems.txt for folder ${folderNumber}`);
        const poemsFileResponse = await fetch(`${folderNumber}/poems.txt`);

        if (!poemsFileResponse.ok) {
            logDebug(`Failed to load poems.txt from folder ${folderNumber}`);

            // Last resort - just create a filler poem to show something
            logDebug(`Creating placeholder poem for folder ${folderNumber}`);
            return [{
                id: `poem-${folderNumber}-placeholder`,
                title: `Poems from Collection ${folderNumber}`,
                text: "We couldn't load the actual poems. Please make sure the files are properly formatted and accessible.",
                date: new Date().toISOString().split('T')[0],
                language: 'Hindi',
                imagePath: `img/placeholder.jpg`,
                themes: ['poetry'],
                folderNumber: folderNumber
            }];
        }

        const poemsText = await poemsFileResponse.text();
        logDebug(`Successfully loaded poems.txt for folder ${folderNumber}, parsing content`);

        const poemEntries = parsePoems(poemsText, folderNumber);
        logDebug(`Parsed ${poemEntries.length} poems from poems.txt`);

        return poemEntries;
    } catch (error) {
        logDebug(`Error in fallbackLoadPoems(${folderNumber}):`, error);
        return [];
    }
}

// Parse the poems.txt file to extract individual poems
function parsePoems(poemsText, folderNumber) {
    logDebug(`Parsing poems text for folder ${folderNumber}`);

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
                id: `poem-${folderNumber}-${poems.length + 1}`,
                title: title,
                text: poemText,
                date: new Date().toISOString().split('T')[0], // Placeholder
                language: 'Hindi', // Assuming Hindi as default
                imagePath: `img/placeholder.jpg`, // Use common placeholder
                themes: ['poetry'], // Placeholder
                folderNumber: folderNumber
            };

            poems.push(poem);
        }
    }

    logDebug(`Successfully parsed ${poems.length} poems from text`);
    return poems;
}

async function loadPoem(folderNumber, fileName) {
    logDebug(`Loading poem ${fileName} from folder ${folderNumber}`);

    try {
        // Load metadata
        const metadataResponse = await fetch(`${folderNumber}/poems/${fileName}.metadata.json`);
        if (!metadataResponse.ok) {
            throw new Error(`Failed to load metadata for ${fileName}`);
        }
        const metadata = await metadataResponse.json();

        // Load poem text
        const textResponse = await fetch(`${folderNumber}/poems/${fileName}.txt`);
        if (!textResponse.ok) {
            throw new Error(`Failed to load text for ${fileName}`);
        }
        const text = await textResponse.text();

        // Check if image exists (we won't await this)
        fetch(`${folderNumber}/poems/${fileName}.png`)
            .then(response => {
                if (!response.ok) {
                    logDebug(`Image not found for poem ${fileName}, will use placeholder`);
                }
            })
            .catch(() => {
                logDebug(`Error checking image for poem ${fileName}`);
            });

        // Construct the poem object
        const poem = {
            id: `poem-${folderNumber}-${fileName}`,
            title: metadata.title,
            text: text,
            date: metadata.date,
            language: metadata.language,
            imagePath: `${folderNumber}/poems/${fileName}.png`,
            themes: metadata.themes || [],
            themesHindi: metadata.theme_hindi || [],
            mood: metadata.mood || [],
            moodHindi: metadata.mood_hindi || [],
            firstLine: metadata.first_line || '',
            folderNumber: folderNumber,
            fileName: fileName
        };

        logDebug(`Successfully loaded poem ${fileName}`);
        return poem;
    } catch (error) {
        logDebug(`Error loading poem ${fileName} from folder ${folderNumber}:`, error);
        return null;
    }
}

function populateThemeFilter() {
    // Make sure theme filter exists
    if (!themeFilter) return;

    // Sort Hindi themes alphabetically
    const sortedThemes = [...uniqueThemesHindi].sort();

    // Clear existing options except the "All Themes" option (which is now in Hindi)
    themeFilter.innerHTML = '<option value="all">सभी विषय</option>';

    // Add each Hindi theme as an option
    sortedThemes.forEach(theme => {
        const option = document.createElement('option');
        option.value = theme;
        option.textContent = theme; // Hindi theme doesn't need capitalization
        themeFilter.appendChild(option);
    });

    logDebug(`Populated theme filter with ${sortedThemes.length} Hindi theme options`);
}

function displayPoems(poems) {
    logDebug(`Displaying ${poems.length} poems`);

    if (poems.length === 0) {
        poemsContainer.innerHTML = '<div class="no-results">No poems found matching your criteria</div>';
        return;
    }

    // Clear loading message
    poemsContainer.innerHTML = '';

    // Create and append poem cards
    poems.forEach(poem => {
        const card = createPoemCard(poem);
        poemsContainer.appendChild(card);
    });
}

// Helper function to check if an image exists
async function imageExists(url) {
    try {
        const response = await fetch(url, { method: 'HEAD' });
        return response.ok;
    } catch (error) {
        return false;
    }
}

// Modified createPoemCard function to handle missing images better and use Hindi themes
function createPoemCard(poem) {
    const card = document.createElement('div');
    card.className = 'poem-card';
    card.dataset.poemId = poem.id;

    // Create a placeholder for the image that will be filled once we know if it exists
    const imageHtml = `<div class="poem-image-container">
        <img class="poem-image" src="img/placeholder.jpg" alt="${poem.title}" data-original="${poem.imagePath}">
    </div>`;

    // Create the HTML for the card, using Hindi themes
    card.innerHTML = `
        ${imageHtml}
        <div class="poem-content">
            <h3 class="poem-title">${poem.title}</h3>
            <p class="poem-date">${formatDate(poem.date)}</p>
            <p class="poem-preview">${poem.firstLine || poem.text.split('\n')[0]}</p>
            <div class="tags-container">
                ${poem.themesHindi ? poem.themesHindi.map(theme => `<span class="tag">${theme}</span>`).join('') : ''}
            </div>
        </div>
    `;

    // Try to load the actual image after the card is created
    const img = card.querySelector('.poem-image');
    const originalSrc = img.getAttribute('data-original');

    // Check if the image exists
    imageExists(originalSrc).then(exists => {
        if (exists) {
            img.src = originalSrc;
        }
    });

    // Add event listener to open the modal
    card.addEventListener('click', () => openPoemModal(poem));

    return card;
}

function formatDate(dateString) {
    try {
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    } catch (e) {
        logDebug('Error formatting date:', e);
        return dateString; // Return the original string if there's an error
    }
}

function openPoemModal(poem) {
    // Check if modal elements exist
    if (!modal || !modalTitle || !modalDate || !modalImage || !modalText || !modalTags) {
        logDebug('Cannot open modal: modal elements not found');
        return;
    }

    logDebug(`Opening modal for poem: ${poem.title}`);

    // Set modal content
    modalTitle.textContent = poem.title;
    modalDate.textContent = formatDate(poem.date);

    // Set image with placeholder first to prevent flickering
    modalImage.src = 'img/placeholder.jpg';
    modalImage.alt = poem.title;

    // Check if the actual image exists before trying to load it
    imageExists(poem.imagePath).then(exists => {
        if (exists) {
            modalImage.src = poem.imagePath;
        }
    });

    // Set poem text
    modalText.textContent = poem.text;

    // Clear and set Hindi tags
    modalTags.innerHTML = '';
    if (poem.themesHindi && poem.themesHindi.length > 0) {
        poem.themesHindi.forEach(theme => {
            const tag = document.createElement('span');
            tag.className = 'tag';
            tag.textContent = theme;
            modalTags.appendChild(tag);
        });
    }

    // Display the modal
    modal.style.display = 'block';
    document.body.style.overflow = 'hidden'; // Prevent scrolling behind modal
}

function closeModalHandler() {
    if (!modal) return;

    logDebug('Closing modal');
    modal.style.display = 'none';
    document.body.style.overflow = ''; // Restore scrolling
}

function filterPoems() {
    if (!searchInput || !themeFilter) return;

    const searchTerm = searchInput.value.toLowerCase();
    const themeValue = themeFilter.value;

    logDebug(`Filtering poems - Search: "${searchTerm}", Theme: ${themeValue}`);

    const filteredPoems = allPoems.filter(poem => {
        // Search term filter
        const searchMatch =
            poem.title.toLowerCase().includes(searchTerm) ||
            poem.text.toLowerCase().includes(searchTerm) ||
            (poem.themesHindi && poem.themesHindi.some(theme => theme.toLowerCase().includes(searchTerm)));

        // Theme filter (now using Hindi themes)
        const themeMatch = themeValue === 'all' ||
            (poem.themesHindi && poem.themesHindi.includes(themeValue));

        return searchMatch && themeMatch;
    });

    logDebug(`Filter returned ${filteredPoems.length} poems`);
    displayPoems(filteredPoems);
}

function setupEventListeners() {
    logDebug('Setting up event listeners');

    // Search and filter events - check if elements exist first
    if (searchInput) {
        searchInput.addEventListener('input', filterPoems);
    }

    if (themeFilter) {
        themeFilter.addEventListener('change', filterPoems);
    }

    // Modal events - check if elements exist first
    if (closeModal && modal) {
        closeModal.addEventListener('click', closeModalHandler);
    }

    if (modal) {
        window.addEventListener('click', (event) => {
            if (event.target === modal) {
                closeModalHandler();
            }
        });
    }

    // Keyboard events
    window.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && modal && modal.style.display === 'block') {
            closeModalHandler();
        }
    });
} 