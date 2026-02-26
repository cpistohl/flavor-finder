(function () {
    'use strict';

    function showLoading() {
        const loader = document.getElementById('map-loading');
        if (loader) loader.style.display = 'flex';
    }

    function hideLoading() {
        const loader = document.getElementById('map-loading');
        if (loader) loader.style.display = 'none';
    }

    /**
     * @typedef {Object} Address
     * @property {string} formattedAddress
     * @property {string} city
     * @property {string} state
     * @property {string|number} latitude
     * @property {string|number} longitude
     */

    /**
     * @typedef {Object} SearchSuggestionsResponse
     * @property {boolean} isSuccessful
     * @property {Address[]} addresses
     */

    /**
     * @typedef {Object} CulversApiResponse
     * @property {boolean} isSuccessful
     * @property {{ geofences: Array<Location> }} data
     */

    /**
     * @typedef {Object} Location
     * @property {Object} geometryCenter - GeoJSON point object { type: 'Point', coordinates: [lon, lat] }
     * @property {string} description
     * @property {Object} metadata
     */

    /**
     * @typedef {Object} metadata
     * @property {string} flavorOfDayName
     * @property {string} flavorOfDaySlug
     * @property {string} flavorOfTheDayDescription
     */

    const DEBOUNCE_DELAY = 200;
    const SUGGESTIONS_MIN_LENGTH = 3;
    const SEARCH_ENDPOINT = '/api/culvers/search-locations';
    const LOCATIONS_ENDPOINT = '/api/culvers/locations';
    const FALLBACK_IMAGE = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 80 80"><circle cx="40" cy="40" r="40" fill="%23f0ebe4"/><text x="40" y="44" text-anchor="middle" font-size="9" font-weight="600" fill="%238c7e6e">No image</text></svg>');
    const TILE_LIGHT = 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';
    const TILE_DARK = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
    const TILE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

    function createIceCreamIcon() {
        return L.icon({
            iconUrl: '/images/marker-cone.svg',
            iconSize: [30, 42],
            iconAnchor: [15, 42],
            popupAnchor: [0, -38]
        });
    }

    const iceCreamIcon = createIceCreamIcon();

    let flavorFinder;

    function debounce(fn, delay) {
        let timer;
        return (...args) => {
            clearTimeout(timer);
            timer = setTimeout(() => fn(...args), delay);
        };
    }

    function handleFetchError(message, error) {
        console.error(message, error);
    }

    function createSkeletonCard() {
        const card = document.createElement('div');
        card.className = 'card flavor-card';
        card.style.opacity = '1';
        card.style.animation = 'none';

        const imgContainer = document.createElement('div');
        imgContainer.className = 'card-img-container';
        const skelImg = document.createElement('div');
        skelImg.className = 'skeleton image';
        imgContainer.appendChild(skelImg);

        const body = document.createElement('div');
        body.className = 'card-body';
        const skelTitle = document.createElement('div');
        skelTitle.className = 'skeleton title';
        const skelText1 = document.createElement('div');
        skelText1.className = 'skeleton text';
        const skelText2 = document.createElement('div');
        skelText2.className = 'skeleton text';
        body.appendChild(skelTitle);
        body.appendChild(skelText1);
        body.appendChild(skelText2);

        card.appendChild(imgContainer);
        card.appendChild(body);
        return card;
    }

    function renderSuggestions(addresses) {
        const suggestionsContainer = document.getElementById('suggestions');
        if (!suggestionsContainer) return;
        suggestionsContainer.textContent = '';

        if (addresses.length === 0) {
            const li = document.createElement('li');
            li.className = 'list-group-item text-muted';
            li.textContent = 'No results found. Try a different search term.';
            suggestionsContainer.appendChild(li);
            return;
        }

        addresses.forEach(address => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'list-group-item list-group-item-action';

            const icon = document.createElement('i');
            icon.className = 'bi bi-geo-alt-fill pe-2';
            btn.appendChild(icon);
            btn.appendChild(document.createTextNode(`${address.city}, ${address.state}`));

            btn.addEventListener('click', () => {
                const searchInput = document.getElementById('location_search');
                if (searchInput) {
                    searchInput.value = address.formattedAddress;
                }
                suggestionsContainer.textContent = '';
                void updateMapForAddress(address);
            });

            suggestionsContainer.appendChild(btn);
        });
    }

    function renderFlavorCards(locations) {
        const flavorCardsContainer = document.getElementById('flavorCards');
        if (!flavorCardsContainer) return;
        flavorCardsContainer.textContent = '';

        if (!Array.isArray(locations) || locations.length === 0) {
            renderEmptyState('No nearby flavors', "Try another location to see today's flavor lineup.");
            return;
        }

        locations.forEach((loc, i) => {
            const m = loc?.metadata ?? {};
            const locationTitle = loc?.description || loc?.name || "Culver's location";
            const flavorName = m.flavorOfDayName || 'Flavor unavailable';
            const flavorDescription = m.flavorOfTheDayDescription || m.flavorOfDayDescription || "Check the Culver's menu for the latest flavor details.";
            const imageSlug = m.flavorOfDaySlug;

            const card = document.createElement('div');
            card.className = 'card flavor-card';
            card.dataset.index = i;
            card.style.animationDelay = `${i * 0.04}s`;

            const imgContainer = document.createElement('div');
            imgContainer.className = 'col card-img-container';

            if (imageSlug) {
                const img = document.createElement('img');
                img.src = `https://cdn.culvers.com/menu-item-detail/${imageSlug}?format=auto`;
                img.alt = flavorName;
                img.onerror = function () {
                    this.onerror = null;
                    this.src = FALLBACK_IMAGE;
                };
                imgContainer.appendChild(img);
            } else {
                const fallback = document.createElement('div');
                fallback.className = 'flavor-image-fallback';
                fallback.textContent = 'No image';
                imgContainer.appendChild(fallback);
            }

            const body = document.createElement('div');
            body.className = 'col card-body';

            const title = document.createElement('h5');
            title.className = 'card-title';
            title.textContent = locationTitle;

            const flavorP = document.createElement('p');
            flavorP.className = 'flavor-name';
            flavorP.textContent = 'Flavor of the Day:';
            flavorP.appendChild(document.createElement('br'));
            flavorP.appendChild(document.createTextNode(flavorName));

            const descP = document.createElement('p');
            descP.className = 'card-text';
            descP.textContent = flavorDescription;

            body.appendChild(title);
            body.appendChild(flavorP);
            body.appendChild(descP);

            card.appendChild(imgContainer);
            card.appendChild(body);
            flavorCardsContainer.appendChild(card);
        });
    }

    function renderSkeletonCards(count) {
        const container = document.getElementById('flavorCards');
        if (!container) return;

        container.textContent = '';

        for (let i = 0; i < count; i++) {
            container.appendChild(createSkeletonCard());
        }
    }

    function renderEmptyState(title, message) {
        const container = document.getElementById('flavorCards');
        if (!container) return;

        container.textContent = '';
        const wrapper = document.createElement('div');
        wrapper.className = 'flavor-empty';

        const titleEl = document.createElement('div');
        titleEl.className = 'flavor-empty-title';
        titleEl.textContent = title;

        const textEl = document.createElement('div');
        textEl.className = 'flavor-empty-text';
        textEl.textContent = message;

        wrapper.appendChild(titleEl);
        wrapper.appendChild(textEl);
        container.appendChild(wrapper);
    }

    function parseMarkersFromLocations(locations) {
        return locations.map(location => {
            const center = location.geometryCenter;
            if (center && center.type === "Point" && Array.isArray(center.coordinates)) {
                const [lon, lat] = center.coordinates;
                return {
                    lat,
                    lon,
                    description: location.description || "Culver's location"
                };
            }
            return null;
        }).filter(marker => marker !== null);
    }

    /**
     * Shared helper: fetches locations for given coordinates, renders markers and cards.
     * @param {number} lat
     * @param {number} lon
     * @returns {Promise<boolean>} true if successful
     */
    async function fetchAndRenderLocations(lat, lon) {
        flavorFinder.markerLayer.clearLayers();
        flavorFinder.locationMarkers = [];

        const url = `${LOCATIONS_ENDPOINT}?latitude=${lat}&longitude=${lon}`;
        const response = await fetch(url);

        if (!response.ok) {
            console.error('Fetch failed:', response.statusText);
            renderEmptyState('Unable to load flavors', 'We could not reach Culver\'s right now. Try again in a moment.');
            return false;
        }

        const data = await response.json();

        if (!data.isSuccessful) {
            console.error('API returned an unsuccessful response:', data);
            renderEmptyState('Unable to load flavors', 'We did not receive flavor data. Try another location.');
            return false;
        }

        const locations = data.data.geofences;

        if (!Array.isArray(locations)) {
            console.warn('Unexpected API response format:', locations);
            renderEmptyState('No flavor data', 'We did not get a valid response. Try another location.');
            return false;
        }

        const markerDataArray = parseMarkersFromLocations(locations);

        markerDataArray.forEach(markerData => {
            const m = L.marker([markerData.lat, markerData.lon], { icon: iceCreamIcon })
                .addTo(flavorFinder.markerLayer)
                .bindPopup(markerData.description);
            flavorFinder.locationMarkers.push(m);
        });

        renderFlavorCards(locations);
        linkCardMarkerInteractions();
        return true;
    }

    class FlavorFinderMap {
        constructor() {
            this.map = null;
            this.markerLayer = L.layerGroup();
            this.locationMarkers = [];
            this.DEFAULT_CENTER = [39.8283, -98.5795];
            this.DEFAULT_ZOOM = 4;
            this.US_BOUNDS = L.latLngBounds([
                [24.396308, -124.848974],
                [49.384358, -66.885444]
            ]);
        }

        initializeMap() {
            this.map = L.map('map', {
                zoomControl: true
            }).setView(this.DEFAULT_CENTER, this.DEFAULT_ZOOM);

            const mapContainer = document.getElementById('map');

            if (mapContainer) {
                mapContainer.style.position = 'relative';

                const loaderDiv = document.createElement('div');
                loaderDiv.id = 'map-loading';
                loaderDiv.style.cssText = 'position:absolute; top:0; left:0; width:100%; height:100%; display:none; align-items:center; justify-content:center; background:var(--loader-bg); z-index:1000; border-radius: var(--map-radius);';

                const spinner = document.createElement('div');
                spinner.className = 'spinner-border';
                spinner.setAttribute('role', 'status');
                const spinnerText = document.createElement('span');
                spinnerText.className = 'visually-hidden';
                spinnerText.textContent = 'Loading...';
                spinner.appendChild(spinnerText);
                loaderDiv.appendChild(spinner);

                mapContainer.appendChild(loaderDiv);
            }

            const isDark = document.documentElement.getAttribute('data-bs-theme') === 'dark';
            this.tileLayer = L.tileLayer(isDark ? TILE_DARK : TILE_LIGHT, {
                attribution: TILE_ATTRIBUTION
            }).addTo(this.map);

            this.markerLayer.addTo(this.map);

            const observer = new MutationObserver(() => {
                const dark = document.documentElement.getAttribute('data-bs-theme') === 'dark';
                this.tileLayer.setUrl(dark ? TILE_DARK : TILE_LIGHT);
            });
            observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-bs-theme'] });

            const searchHereControl = L.control({position: 'topright'});

            searchHereControl.onAdd = () => {
                const btn = L.DomUtil.create('button', 'btn-search-here');
                btn.innerText = 'Search Here';
                btn.style.display = 'none';
                this.searchHereBtn = btn;
                L.DomEvent.on(btn, 'click', () => this.searchHere());
                return btn;
            };

            searchHereControl.addTo(this.map);

            this.map.on('dragend', () => {
                this.searchHereBtn.style.display = 'block';
            });

            this.map.setMaxBounds(this.US_BOUNDS);
        }

        async updateUserLocation() {
            if (!navigator.geolocation) {
                console.error('Geolocation is not supported by this browser.');
                renderEmptyState('Location needed', 'Type a location to find nearby flavors.');
                return;
            }

            showLoading();
            renderSkeletonCards(4);

            try {
                const position = await new Promise((resolve, reject) => {
                    navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 10000 });
                });

                const {latitude, longitude} = position.coords;
                this.map.flyTo([latitude, longitude], 10, {duration: 0.8});

                await fetchAndRenderLocations(latitude, longitude);
            } catch (error) {
                console.error('Could not retrieve location:', error);
                renderEmptyState('Location needed', 'We could not access your location. Type a location to see flavors.');
            } finally {
                hideLoading();
            }
        }

        async fetchLocations(lat, lon) {
            showLoading();
            renderSkeletonCards(4);

            try {
                await fetchAndRenderLocations(lat, lon);
            } catch (error) {
                console.error('Error fetching locations for new center:', error);
                renderEmptyState('Unable to load flavors', 'We could not reach Culver\'s right now. Try again in a moment.');
            } finally {
                hideLoading();
            }
        }

        async searchHere() {
            const center = this.map.getCenter();
            await this.fetchLocations(center.lat, center.lng);
            this.searchHereBtn.style.display = 'none';
        }
    }

    async function updateMapForAddress(address) {
        showLoading();
        renderSkeletonCards(4);

        try {
            flavorFinder.map.flyTo([parseFloat(address.latitude), parseFloat(address.longitude)], 10, {duration: 0.8});
            await fetchAndRenderLocations(parseFloat(address.latitude), parseFloat(address.longitude));
        } catch (error) {
            console.error('Error during geocoding:', error);
            renderEmptyState('Unable to load flavors', 'We could not reach Culver\'s right now. Try again in a moment.');
        } finally {
            hideLoading();
        }
    }

    document.addEventListener('DOMContentLoaded', () => {
        const locationSearch = document.getElementById('location_search');
        let searchController;

        if (locationSearch) {
            locationSearch.addEventListener('input', debounce(async function () {
                const query = locationSearch.value.trim();

                if (query.length < SUGGESTIONS_MIN_LENGTH) {
                    const suggestionsContainer = document.getElementById('suggestions');

                    if (suggestionsContainer) {
                        suggestionsContainer.textContent = '';
                    }
                    return;
                }

                try {
                    searchController?.abort();
                    searchController = new AbortController();

                    const response = await fetch(`${SEARCH_ENDPOINT}?query=${encodeURIComponent(query)}`, {signal: searchController.signal});
                    if (!response.ok) {
                        console.error('Error fetching suggestions:', response.statusText);
                        return;
                    }

                    const suggestionsResponse = await response.json();
                    renderSuggestions(suggestionsResponse.addresses || []);
                } catch (error) {
                    if (error.name === 'AbortError') {
                        return;
                    }
                    handleFetchError('Error fetching suggestions:', error);
                }
            }, DEBOUNCE_DELAY));
        }

        flavorFinder = new FlavorFinderMap();
        flavorFinder.initializeMap();
        void flavorFinder.updateUserLocation();
    });

    function highlightCard(idx) {
        const card = document.querySelector(`.flavor-card[data-index="${idx}"]`);
        if (card) card.classList.add('highlighted');
    }

    function unhighlightCard(idx) {
        const card = document.querySelector(`.flavor-card[data-index="${idx}"]`);
        if (card) card.classList.remove('highlighted');
    }

    function highlightMarker(idx) {
        const m = flavorFinder.locationMarkers[idx];
        if (m) m.openPopup();
    }

    function resetMarker(idx) {
        const m = flavorFinder.locationMarkers[idx];
        if (m) m.closePopup();
    }

    function linkCardMarkerInteractions() {
        flavorFinder.locationMarkers.forEach((marker, idx) => {
            marker.on('mouseover', () => highlightCard(idx));
            marker.on('mouseout', () => unhighlightCard(idx));
            marker.on('click', () => {
                highlightCard(idx);
                const card = document.querySelector(`.flavor-card[data-index="${idx}"]`);
                if (card) {
                    card.scrollIntoView({behavior: 'smooth', block: 'start'});
                }
            });
        });
        document.querySelectorAll('.flavor-card').forEach(card => {
            const idx = parseInt(card.dataset.index, 10);
            card.addEventListener('mouseenter', () => highlightMarker(idx));
            card.addEventListener('mouseleave', () => resetMarker(idx));
        });
    }

    (function setupSearchClear() {
        const searchInput = document.getElementById('location_search');
        if (!searchInput) return;

        const container = searchInput.parentElement;

        const clearIcon = document.createElement('span');
        clearIcon.className = 'clear-icon';
        clearIcon.textContent = '\u00D7';
        container.appendChild(clearIcon);

        searchInput.addEventListener('input', () => {
            clearIcon.classList.toggle('visible', searchInput.value.length > 0);
        });

        clearIcon.addEventListener('click', () => {
            searchInput.value = '';
            clearIcon.classList.remove('visible');
            const suggestions = document.getElementById('suggestions');
            if (suggestions) suggestions.textContent = '';
            searchInput.focus();
        });
    })();
})();
