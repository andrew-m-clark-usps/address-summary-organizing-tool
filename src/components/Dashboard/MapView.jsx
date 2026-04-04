import React, { useEffect, useRef } from 'react';

export const MapView = ({ lat = 39.7817, lon = -89.6501, city = 'Springfield' }) => {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markerRef = useRef(null);

  useEffect(() => {
    let map;
    const initMap = async () => {
      // Dynamically import leaflet
      const L = (await import('leaflet')).default;
      
      // Fix default icon
      delete L.Icon.Default.prototype._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
        iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
      });

      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
      }

      map = L.map(mapRef.current).setView([lat, lon], 13);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
      }).addTo(map);

      const marker = L.marker([lat, lon]).addTo(map);
      marker.bindPopup(`<b>${city}</b>`).openPopup();
      
      mapInstanceRef.current = map;
      markerRef.current = marker;
    };

    if (mapRef.current) initMap();

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [lat, lon, city]);

  return (
    <div style={{ background: 'white', borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.08)', padding: 24 }}>
      <h3 style={{ margin: '0 0 16px', color: '#1B3A6B', fontSize: 16, fontWeight: 700 }}>Map View</h3>
      <div ref={mapRef} style={{ height: 300, borderRadius: 6, overflow: 'hidden' }} />
    </div>
  );
};
