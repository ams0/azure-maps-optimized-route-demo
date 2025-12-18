import { useEffect, useRef } from 'react';
import * as atlas from 'azure-maps-control';
import 'azure-maps-control/dist/atlas.min.css';

interface AzureMapProps {
  subscriptionKey: string;
  onMapReady?: (map: atlas.Map) => void;
}

export const AzureMap: React.FC<AzureMapProps> = ({ subscriptionKey, onMapReady }) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<atlas.Map | null>(null);

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    const map = new atlas.Map(mapRef.current, {
      center: [-122.33, 47.6],
      zoom: 12,
      language: 'en-US',
      authOptions: {
        authType: atlas.AuthenticationType.subscriptionKey,
        subscriptionKey: subscriptionKey,
      },
    });

    map.events.add('ready', () => {
      mapInstanceRef.current = map;
      onMapReady?.(map);
    });

    return () => {
      map.dispose();
      mapInstanceRef.current = null;
    };
  }, [subscriptionKey, onMapReady]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div ref={mapRef} style={{ width: '100%', height: '100%' }} />
      {/* Crosshair overlay */}
      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          pointerEvents: 'none',
          zIndex: 1000,
        }}
      >
        <svg width="40" height="40" viewBox="0 0 40 40">
          <circle
            cx="20"
            cy="20"
            r="3"
            fill="none"
            stroke="#667eea"
            strokeWidth="2"
          />
          <line x1="20" y1="0" x2="20" y2="12" stroke="#667eea" strokeWidth="2" />
          <line x1="20" y1="28" x2="20" y2="40" stroke="#667eea" strokeWidth="2" />
          <line x1="0" y1="20" x2="12" y2="20" stroke="#667eea" strokeWidth="2" />
          <line x1="28" y1="20" x2="40" y2="20" stroke="#667eea" strokeWidth="2" />
        </svg>
      </div>
    </div>
  );
};
