// Mock Service Provider Database
const DEFAULT_PROVIDERS = [
    { id: "1", name: "Sightglass Coffee", category: "Food & Drink", lat: 37.7768, lng: -122.4089, description: "Industrial-chic coffee roastery & bar." },
    { id: "2", name: "Philz Coffee", category: "Food & Drink", lat: 37.7601, lng: -122.4207, description: "Custom-blended drip coffee specialty store." },
    { id: "3", name: "Bi-Rite Market", category: "Retail", lat: 37.7617, lng: -122.4254, description: "Gourmet grocery store with handmade ice cream." },
    { id: "4", name: "Sutter Health Urgent Care", category: "Health", lat: 37.7886, lng: -122.4201, description: "Walk-in medical service center." },
    { id: "5", name: "Cole Hardware", category: "Retail", lat: 37.7695, lng: -122.4173, description: "Local hardware store and home supplies." },
    { id: "6", name: "SF Auto Repair", category: "Service", lat: 37.7512, lng: -122.4132, description: "Vehicle inspection and mechanics." },
    { id: "7", name: "Golden Gate Pharmacy", category: "Health", lat: 37.7794, lng: -122.4632, description: "Prescription pickup and medical supply store." },
    { id: "8", name: "Blue Bottle Coffee", category: "Food & Drink", lat: 37.7758, lng: -122.4228, description: "Fresh drip coffees and pastries." },
    { id: "9", name: "Mission Bicycle Shop", category: "Retail", lat: 37.7592, lng: -122.4215, description: "Custom bikes and repair services." }
];

// App State
let providers = [];
let userLocation = { lat: 37.7749, lng: -122.4194 }; // SF Center
let searchRadiusKm = 5.0;
let clickLocation = null;

// Map & Layer References
let map;
let userMarker;
let radiusCircle;
let providerMarkers = {}; // map of provider.id -> Leaflet Marker

// Load database from localStorage or fallback to defaults
function initDatabase() {
    const stored = localStorage.getItem('geopulse_providers');
    if (stored) {
        providers = JSON.parse(stored);
    } else {
        providers = [...DEFAULT_PROVIDERS];
        localStorage.setItem('geopulse_providers', JSON.stringify(providers));
    }
}

// Haversine formula to compute distance in KM between coordinates
function calculateHaversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth's radius in kilometers
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

// Get marker category color / icon emoji
function getCategorySymbol(category) {
    switch (category) {
        case "Food & Drink": return "🍔";
        case "Health": return "🩺";
        case "Retail": return "🛍️";
        case "Service": return "🛠️";
        default: return "📍";
    }
}

// Initialize Leaflet Map
function initMap() {
    // 1. Create Map object center on user
    map = L.map('map').setView([userLocation.lat, userLocation.lng], 13);

    // 2. Add CartoDB Voyager Map Tiles (Clean, modern dark/light styling)
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 20
    }).addTo(map);

    // 3. User Location Marker (Draggable blue indicator)
    const userIcon = L.divIcon({
        className: 'user-map-marker',
        html: '<div style="background-color: #3b82f6; width: 18px; height: 18px; border: 3px solid white; border-radius: 50%; box-shadow: 0 0 10px rgba(59, 130, 246, 0.8);"></div>',
        iconSize: [18, 18],
        iconAnchor: [9, 9]
    });

    userMarker = L.marker([userLocation.lat, userLocation.lng], {
        draggable: true,
        icon: userIcon
    }).addTo(map);

    // 4. Radius boundary circle overlay
    radiusCircle = L.circle([userLocation.lat, userLocation.lng], {
        color: '#6366f1',
        fillColor: '#6366f1',
        fillOpacity: 0.12,
        weight: 1.5,
        radius: searchRadiusKm * 1000 // In meters
    }).addTo(map);

    // Bind event: drag user marker to dynamically filter coordinates
    userMarker.on('drag', function (e) {
        const position = userMarker.getLatLng();
        userLocation.lat = position.lat;
        userLocation.lng = position.lng;
        
        // Update circular boundary
        radiusCircle.setLatLng(position);
        
        // Update coordinate readouts
        document.getElementById('user-lat').textContent = position.lat.toFixed(5);
        document.getElementById('user-lng').textContent = position.lng.toFixed(5);
        
        updateQueries();
    });

    // Bind event: click map to set location for adding custom provider
    map.on('click', function(e) {
        clickLocation = e.latlng;
        
        // Add or move helper marker for placement
        if (window.placementMarker) {
            window.placementMarker.setLatLng(clickLocation);
        } else {
            const placementIcon = L.divIcon({
                className: 'placement-map-marker',
                html: '<div style="background-color: #a855f7; width: 14px; height: 14px; border: 2px solid white; border-radius: 50%; box-shadow: 0 0 6px #a855f7;"></div>',
                iconSize: [14, 14],
                iconAnchor: [7, 7]
            });
            window.placementMarker = L.marker(clickLocation, { icon: placementIcon }).addTo(map);
        }
        
        // Update indicator text color to active
        const descNode = document.querySelector('.click-instruction');
        descNode.innerHTML = `Set coordinate at: <span style="color: #a855f7; font-weight: 600;">[${clickLocation.lat.toFixed(4)}, ${clickLocation.lng.toFixed(4)}]</span>`;
    });
}

// Add/Sync service provider markers on the Map
function renderMapMarkers(filteredIds) {
    // Remove old markers that are not in the database anymore
    Object.keys(providerMarkers).forEach(id => {
        if (!providers.some(p => p.id === id)) {
            map.removeLayer(providerMarkers[id]);
            delete providerMarkers[id];
        }
    });

    // Add or style database rows
    providers.forEach(p => {
        const inRange = filteredIds.has(p.id);
        const iconEmoji = getCategorySymbol(p.category);
        
        // Choose opacity depending on whether provider is within radius threshold (simulates PostGIS DWithin exclusion)
        const opacity = inRange ? 1.0 : 0.28;
        const color = inRange ? "#6366f1" : "#475569";
        const shadow = inRange ? "0 0 8px rgba(99, 102, 241, 0.6)" : "none";

        const markerHtml = `
            <div class="provider-marker" style="
                background: ${color}; 
                color: white; 
                display: flex; 
                justify-content: center; 
                align-items: center; 
                border-radius: 50%; 
                width: 32px; 
                height: 32px; 
                border: 2px solid white; 
                font-size: 14px;
                box-shadow: ${shadow};
                transition: opacity 0.2s, background 0.2s;
                opacity: ${opacity};">
                ${iconEmoji}
            </div>
        `;

        const customIcon = L.divIcon({
            className: `custom-marker-wrapper-${p.id}`,
            html: markerHtml,
            iconSize: [32, 32],
            iconAnchor: [16, 16]
        });

        if (providerMarkers[p.id]) {
            // Update existing marker
            providerMarkers[p.id].setIcon(customIcon);
            providerMarkers[p.id].setLatLng([p.lat, p.lng]);
        } else {
            // Create new marker
            const marker = L.marker([p.lat, p.lng], { icon: customIcon })
                .addTo(map)
                .bindPopup(`
                    <div style="font-family: 'Inter', sans-serif;">
                        <strong style="font-size: 14px;">${p.name}</strong><br>
                        <span style="font-size: 11px; color: #64748b;">${p.category}</span>
                        <p style="margin-top: 5px; font-size: 12px; color: #475569;">${p.description || "No description provided."}</p>
                    </div>
                `);
            providerMarkers[p.id] = marker;
        }
    });
}

// Compute proximity distances and filter providers
function updateQueries() {
    const searchVal = document.getElementById('provider-search').value.toLowerCase();
    
    // 1. Filter database list using Simulated PostGIS logic (Haversine distance within query radius)
    const matches = providers
        .map(p => {
            const distance = calculateHaversineDistance(userLocation.lat, userLocation.lng, p.lat, p.lng);
            return { ...p, distance };
        })
        .filter(p => {
            // Match radius threshold AND text search
            const inRadius = p.distance <= searchRadiusKm;
            const matchesText = p.name.toLowerCase().includes(searchVal) || p.category.toLowerCase().includes(searchVal);
            return inRadius && matchesText;
        })
        // Sort by distance (equivalent to database ORDER BY distance_meters)
        .sort((a, b) => a.distance - b.distance);

    // Save index of matching IDs for marker rendering opacity rules
    const activeIds = new Set(matches.map(m => m.id));

    // Update list UI
    const listContainer = document.getElementById('providers-list');
    listContainer.innerHTML = '';

    matches.forEach(p => {
        const li = document.createElement('li');
        li.className = 'provider-item';
        li.innerHTML = `
            <div class="provider-details">
                <h4>${p.name}</h4>
                <span>${p.category}</span>
            </div>
            <div class="provider-distance">
                <span class="dist-val">${p.distance.toFixed(2)} km</span>
                <span class="cat-icon">${getCategorySymbol(p.category)}</span>
            </div>
        `;
        
        // Click to center map and open popup
        li.addEventListener('click', () => {
            map.setView([p.lat, p.lng], 14);
            providerMarkers[p.id].openPopup();
            
            // Highlight item list active styling
            document.querySelectorAll('.provider-item').forEach(el => el.classList.remove('active'));
            li.classList.add('active');
        });

        listContainer.appendChild(li);
    });

    // Update badge results count
    document.getElementById('results-count').textContent = `${matches.length} Found`;

    // Re-render map marker transparency/styles based on range matching
    renderMapMarkers(activeIds);
}

// Handle browser tab buttons
function initTabs() {
    const tabButtons = document.querySelectorAll('.tab-btn');
    tabButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            // Remove active states
            tabButtons.forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            
            // Add active to current
            btn.classList.add('active');
            const tabId = btn.getAttribute('data-tab');
            document.getElementById(`tab-${tabId}`).classList.add('active');
        });
    });
}

// Document Event Listeners
document.addEventListener('DOMContentLoaded', () => {
    initDatabase();
    initMap();
    initTabs();
    updateQueries();

    // Slider listener: update query radius
    const radiusSlider = document.getElementById('radius-slider');
    const radiusVal = document.getElementById('radius-val');
    radiusSlider.addEventListener('input', (e) => {
        searchRadiusKm = parseFloat(e.target.value);
        radiusVal.textContent = searchRadiusKm.toFixed(1);
        
        // Update circular visual overlay
        radiusCircle.setRadius(searchRadiusKm * 1000);
        updateQueries();
    });

    // Locate user click trigger
    document.getElementById('btn-locate').addEventListener('click', () => {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition((position) => {
                const lat = position.coords.latitude;
                const lng = position.coords.longitude;
                userLocation = { lat, lng };
                
                // Relocate user elements
                userMarker.setLatLng([lat, lng]);
                radiusCircle.setLatLng([lat, lng]);
                map.setView([lat, lng], 13);
                
                document.getElementById('user-lat').textContent = lat.toFixed(5);
                document.getElementById('user-lng').textContent = lng.toFixed(5);
                
                updateQueries();
            }, () => {
                alert("Geolocation failed or denied. Defaulting to San Francisco coordinates.");
            });
        } else {
            alert("Geolocation services not supported by your browser.");
        }
    });

    // Search bar filter trigger
    document.getElementById('provider-search').addEventListener('input', updateQueries);

    // Save Custom Provider submission listener
    document.getElementById('add-provider-form').addEventListener('submit', (e) => {
        e.preventDefault();
        
        if (!clickLocation) {
            alert("Please click on the map first to select coordinates for the provider.");
            return;
        }

        const nameInput = document.getElementById('new-name');
        const catSelect = document.getElementById('new-category');

        const newProvider = {
            id: Date.now().toString(),
            name: nameInput.value,
            category: catSelect.value,
            lat: clickLocation.lat,
            lng: clickLocation.lng,
            description: "Custom user-inserted location entry."
        };

        // Push to array and save to storage
        providers.push(newProvider);
        localStorage.setItem('geopulse_providers', JSON.stringify(providers));

        // Reset inputs & helper placement markers
        nameInput.value = '';
        if (window.placementMarker) {
            map.removeLayer(window.placementMarker);
            window.placementMarker = null;
        }
        clickLocation = null;
        document.querySelector('.click-instruction').innerHTML = `<span class="accent-text">* Click the map</span> to set custom latitude/longitude before saving.`;

        // Update queries
        updateQueries();
    });
});
