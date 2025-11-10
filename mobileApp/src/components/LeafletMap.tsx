import React, { useState, useEffect, useRef } from 'react';
import { WebView } from 'react-native-webview';

// --- LEAFLET MAP COMPONENT ---
export const LeafletMap = React.memo(
  ({
    onMapReady,
    interactive = true,
  }: {
    onMapReady: (ref: any) => void;
    interactive?: boolean;
  }) => {
    const webViewRef = useRef<any>(null);
    const [mapInitialized, setMapInitialized] = useState(false);

    useEffect(() => {
      if (mapInitialized && onMapReady && webViewRef.current) {
        onMapReady(webViewRef);
      }
    }, [mapInitialized, onMapReady]);

    // --- UPDATED: Set placeholder spawn point for initial load ---
    // This will be corrected instantly by the `handleMapReady` function,
    // but it centers the map on the lake immediately on load.
    const spawnLat = 36.137;
    const spawnLng = -94.129;

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <style>
    html, body { height:100%; margin:0; padding:0; }
    #map { height:100%; width:100%; }
    .boat-marker {
      width: 0;
      height: 0;
      border-left: 12px solid transparent;
      border-right: 12px solid transparent;
      border-bottom: 40px solid #4285F4;
      transform-origin: 50% 75%;
    }
  </style>
</head>
<body>
  <div id="map"></div>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script>
    let map, boatMarker;
    let breadcrumbPath = null;
    let geofenceLayer = null;
    let returnPathLayer = null; // <-- Layer for return path

    function initMap() {
      map = L.map('map', {
        zoomControl: ${interactive},
        dragging: ${interactive},
        touchZoom: ${interactive},
        scrollWheelZoom: ${interactive},
        doubleClickZoom: ${interactive}
      }).setView([${spawnLat}, ${spawnLng}], 18); // <-- UPDATED View
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);
      
      const boatIcon = L.divIcon({
        className: '',
        html: '<div class="boat-marker"></div>',
        iconSize: [30, 30],
        iconAnchor: [15, 20],
      });
      boatMarker = L.marker([${spawnLat}, ${spawnLng}], { icon: boatIcon }).addTo(map); // <-- UPDATED Marker

      // --- UPDATE BOAT FUNCTION (Existing) ---
      window.updateBoat = (lat, lng, heading) => {
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
        boatMarker.setLatLng([lat, lng]);
        const el = boatMarker.getElement();
        if (el) {
          const marker = el.querySelector('.boat-marker');
          if (marker) marker.style.transform = 'rotate(' + (heading || 0) + 'deg)';
        }
        // Don't auto-pan map if it's interactive (on the Map screen)
        if (!${interactive}) {
          map.setView([lat, lng], map.getZoom(), { animate: false });
        }
      };

      // --- BREADCRUMB PATH (ORANGE) ---
      window.updatePath = (path) => {
        if (!map) return;
        const latLngs = path.map(p => [p.latitude, p.longitude]);

        if (latLngs.length === 0) {
          if (breadcrumbPath) breadcrumbPath.remove();
          breadcrumbPath = null;
          return;
        }
        if (breadcrumbPath) {
          breadcrumbPath.setLatLngs(latLngs);
        } else {
          breadcrumbPath = L.polyline(latLngs, { 
            color: '#f5a623', weight: 3, opacity: 0.8 
          }).addTo(map);
        }
      };

      // --- GEOFENCE (RED) ---
      // --- UPDATED to draw a POLYGON ---
      window.drawGeofence = (polygonCoords) => {
        if (!map) return;
        if (geofenceLayer) geofenceLayer.remove();
        geofenceLayer = null;
        if (!polygonCoords || polygonCoords.length === 0) return;
        
        // L.polygon expects [lat, lng] which getGeofenceForMap() provides
        geofenceLayer = L.polygon(polygonCoords, { 
          color: "#ff3b30", weight: 2, fillOpacity: 0.3 
        }).addTo(map);

        // --- NEW: Zoom map to fit the new polygon ---
        if (${interactive}) {
          map.fitBounds(geofenceLayer.getBounds());
        }
      };

      // --- NEW: RETURN PATH (GREEN) ---
      window.drawReturnPath = (path) => {
        if (!map) return;
        const latLngs = path.map(p => [p.latitude, p.longitude]);

        if (latLngs.length === 0) {
          if (returnPathLayer) returnPathLayer.remove();
          returnPathLayer = null;
          return;
        }
        if (returnPathLayer) {
          returnPathLayer.setLatLngs(latLngs);
        } else {
          returnPathLayer = L.polyline(latLngs, { 
            color: '#34C759', weight: 4, opacity: 0.9, dashArray: '5, 5'
          }).addTo(map);
        }
      };
      // --- End new function ---

      window.ReactNativeWebView.postMessage('mapReady');
    }
    initMap();
  </script>
</body>
</html>
`;

    return (
      <WebView
        ref={webViewRef}
        originWhitelist={['*']}
        source={{ html }}
        javaScriptEnabled
        domStorageEnabled
        style={{ flex: 1 }}
        onMessage={(event) => {
          if (event.nativeEvent.data === 'mapReady') setMapInitialized(true);
        }}
      />
    );
  },
);