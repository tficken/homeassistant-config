// Weather radar panel: Leaflet map with keyless Esri basemap stack and an
// animated RainViewer radar overlay. Leaflet is loaded globally as window.L.
import { state } from './state.js';

export function renderRadarFrame() {
  if (!state.haConfig || state.haConfig.latitude == null) return `<div class="terminal-panel"><div class="panel-body" style="color:var(--text-muted);">RADAR UNAVAILABLE</div></div>`;
  return `<div class="terminal-panel" style="height:100%;display:flex;flex-direction:column;">
    <div class="panel-title">WEATHER RADAR</div>
    <div class="panel-body" style="flex:1;padding:0;min-height:0;">
      <div id="radar-map">INITIALIZING RADAR...</div>
    </div>
  </div>`;
}

export async function initRadarMap() {
  const el = document.getElementById("radar-map");
  if (!el || !window.L || !state.haConfig) return;
  // Init once per #radar-map element: renderHomeScreen() replaces the element
  // on a full home re-render, in which case we rebuild; plain state updates
  // leave the element (and the map) untouched.
  if (state.radarMap && state.radarMapEl === el) return;
  if (state.radarMap) { state.radarMap.remove(); state.radarMap = null; state.radarMapEl = null; }
  if (state.radarAnimInterval) { clearInterval(state.radarAnimInterval); state.radarAnimInterval = null; }
  try {
    const res = await fetch("https://api.rainviewer.com/public/weather-maps.json", { cache: "no-store" });
    const data = await res.json();
    const frames = data.radar && data.radar.past;
    if (!frames || !frames.length) throw new Error("no radar frames");
    const map = window.L.map(el, { zoomControl: false, maxZoom: 10 }).setView(
      [state.haConfig.latitude, state.haConfig.longitude], 8
    );
    // Keyless Esri stack (CARTO's basemaps now watermark "API KEY REQUIRED");
    // radar overlay is RainViewer (also keyless). Base is the dark gray
    // canvas, CSS-darkened toward black (see .radar-basemap). Above the
    // animated radar frames: World_Transportation adds bold highways/
    // interstates, and Boundaries_and_Places_Alternate (the light-on-dark
    // variant) adds state lines and city labels. Both are recolored via
    // CSS filters (see .radar-roads / .radar-labels).
    window.L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}",
      { maxZoom: 16, className: "radar-basemap", attribution: "Esri, HERE, Garmin, FAO, NOAA, USGS" }
    ).addTo(map);
    window.L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}",
      { maxZoom: 16, zIndex: 10, className: "radar-roads", opacity: 0.35 } // above the animated radar frames
    ).addTo(map);
    window.L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places_Alternate/MapServer/tile/{z}/{y}/{x}",
      { maxZoom: 16, zIndex: 11, className: "radar-labels", opacity: 0.6 } // labels/boundaries on top of roads
    ).addTo(map);

    // Use the last 8 frames (~80 min) to keep tile count reasonable.
    const useFrames = frames.slice(-8);
    const layers = useFrames.map(f =>
      window.L.tileLayer(`${data.host}${f.path}/256/{z}/{x}/{y}/7/1_1.png`, {
        // RainViewer renders radar natively only up to z7 — past that it
        // serves a "zoom not supported" placeholder. maxNativeZoom upscales
        // the z7 tiles instead.
        opacity: 0, maxZoom: 10, maxNativeZoom: 7, minZoom: 3
      }).addTo(map)
    );

    const timestamp = document.createElement("div");
    timestamp.className = "radar-timestamp";
    el.appendChild(timestamp);

    let idx = layers.length - 1;
    layers[idx].setOpacity(0.65);
    timestamp.textContent = "RADAR UPDATED " + new Date(useFrames[idx].time * 1000).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

    state.radarAnimInterval = setInterval(() => {
      layers[idx].setOpacity(0);
      idx = (idx + 1) % layers.length;
      layers[idx].setOpacity(0.65);
      timestamp.textContent = "RADAR UPDATED " + new Date(useFrames[idx].time * 1000).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    }, 700);

    setTimeout(() => map.invalidateSize(), 150);
    state.radarMap = map;
    state.radarMapEl = el;
  } catch (e) {
    console.error("radar init failed", e);
    el.innerHTML = '<div style="color:var(--text-muted);padding:14px;">RADAR OFFLINE</div>';
  }
}
