import { useState, useEffect, useRef } from 'react';
import * as atlas from 'azure-maps-control';
import type { Location } from '../types/routeMatrix';

interface RouteMatrixProps {
  map: atlas.Map | null;
  subscriptionKey: string;
}

interface RouteResult {
  distance: number;
  duration: number;
  waypointOrder?: number[];
}

export const RouteMatrix: React.FC<RouteMatrixProps> = ({ map, subscriptionKey }) => {
  const [origin, setOrigin] = useState<Location | null>(null);
  const [waypoints, setWaypoints] = useState<Location[]>([]);
  const [result, setResult] = useState<RouteResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dataSourceRef = useRef<atlas.source.DataSource | null>(null);
  const routeDataSourceRef = useRef<atlas.source.DataSource | null>(null);

  // Initialize data source when map is ready
  useEffect(() => {
    if (!map) return;

    // Create data source for markers
    const dataSource = new atlas.source.DataSource();
    map.sources.add(dataSource);
    dataSourceRef.current = dataSource;

    // Create data source for route lines
    const routeDataSource = new atlas.source.DataSource();
    map.sources.add(routeDataSource);
    routeDataSourceRef.current = routeDataSource;

    // Add line layer for routes (below markers)
    map.layers.add(
      new atlas.layer.LineLayer(routeDataSource, 'route-layer', {
        strokeColor: '#667eea',
        strokeWidth: 5,
        strokeOpacity: 0.9,
      }),
      'origin-layer'
    );

    // Add symbol layer for origin (green pin)
    map.layers.add(
      new atlas.layer.SymbolLayer(dataSource, 'origin-layer', {
        filter: ['==', ['get', 'type'], 'origin'],
        iconOptions: {
          image: 'pin-green',
          size: 0.9,
          anchor: 'center',
        },
        textOptions: {
          textField: ['get', 'label'],
          offset: [0, 1.5],
          color: '#107c10',
          size: 14,
          font: ['SegoeUi-Bold'],
        },
      })
    );

    // Add symbol layer for waypoints (blue circles)
    map.layers.add(
      new atlas.layer.SymbolLayer(dataSource, 'waypoint-layer', {
        filter: ['==', ['get', 'type'], 'waypoint'],
        iconOptions: {
          image: 'marker-blue',
          size: 0.7,
          anchor: 'center',
        },
        textOptions: {
          textField: ['get', 'label'],
          offset: [0, 1.5],
          color: '#0078d4',
          size: 12,
        },
      })
    );

    return () => {
      if (dataSourceRef.current) {
        map.sources.remove(dataSourceRef.current);
        dataSourceRef.current = null;
      }
      if (routeDataSourceRef.current) {
        map.sources.remove(routeDataSourceRef.current);
        routeDataSourceRef.current = null;
      }
    };
  }, [map]);

  // Update markers when origin or waypoints change
  useEffect(() => {
    if (!dataSourceRef.current) return;

    const features: atlas.data.Feature<atlas.data.Point, { type: string; label: string }>[] = [];

    // Add origin marker
    if (origin) {
      features.push(
        new atlas.data.Feature(new atlas.data.Point([origin.lon, origin.lat]), {
          type: 'origin',
          label: 'Start',
        })
      );
    }

    // Add waypoint markers
    waypoints.forEach((loc, index) => {
      features.push(
        new atlas.data.Feature(new atlas.data.Point([loc.lon, loc.lat]), {
          type: 'waypoint',
          label: `${index + 1}`,
        })
      );
    });

    dataSourceRef.current.clear();
    dataSourceRef.current.add(features);
  }, [origin, waypoints]);

  const addOrigin = () => {
    if (!map) return;
    const center = map.getCamera().center;
    if (center) {
      setOrigin({ lat: center[1], lon: center[0] });
    }
  };

  const addWaypoint = () => {
    if (!map) return;
    const center = map.getCamera().center;
    if (center) {
      setWaypoints([...waypoints, { lat: center[1], lon: center[0] }]);
    }
  };

  const calculateOptimizedRoute = async () => {
    if (!origin || waypoints.length === 0) {
      setError('Please add a start point and at least one waypoint');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Build query string with origin and all waypoints
      const points = [origin, ...waypoints];
      const query = points.map(loc => `${loc.lat},${loc.lon}`).join(':');
      
      const url = `https://atlas.microsoft.com/route/directions/json?api-version=1.0&subscription-key=${subscriptionKey}&query=${query}&computeBestOrder=true`;
      
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      
      if (data.routes?.[0]) {
        const route = data.routes[0];
        const summary = route.summary;
        
        setResult({
          distance: summary.lengthInMeters / 1000,
          duration: summary.travelTimeInSeconds / 60,
          waypointOrder: data.optimizedWaypoints?.map((wp: { optimizedIndex: number }) => wp.optimizedIndex),
        });

        // Draw the route on the map
        if (routeDataSourceRef.current && route.legs) {
          routeDataSourceRef.current.clear();
          
          const allCoordinates: [number, number][] = [];
          route.legs.forEach((leg: { points?: Array<{ latitude: number; longitude: number }> }) => {
            if (leg.points) {
              leg.points.forEach((point: { latitude: number; longitude: number }) => {
                allCoordinates.push([point.longitude, point.latitude]);
              });
            }
          });

          if (allCoordinates.length > 0) {
            routeDataSourceRef.current.add(
              new atlas.data.Feature(
                new atlas.data.LineString(allCoordinates),
                {}
              )
            );
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const clearAll = () => {
    setOrigin(null);
    setWaypoints([]);
    setResult(null);
    setError(null);
    if (dataSourceRef.current) {
      dataSourceRef.current.clear();
    }
    if (routeDataSourceRef.current) {
      routeDataSourceRef.current.clear();
    }
  };

  return (
    <div style={{ padding: '20px', backgroundColor: 'white', borderRadius: '8px' }}>      <h2>Optimized Route Calculator</h2>
      <p style={{ fontSize: '13px', color: '#666', marginTop: '-10px', marginBottom: '15px' }}>
        Find the most efficient route through all waypoints
      </p>
      
      <div style={{ marginBottom: '20px' }}>
        <div style={{ marginBottom: '10px' }}>
          <button onClick={addOrigin} disabled={!map || origin !== null}>
            {origin ? '✓ Start Point Set' : 'Set Start Point'}
          </button>
          {origin && (
            <span style={{ marginLeft: '10px', fontSize: '12px', color: '#666' }}>
              {origin.lat.toFixed(4)}, {origin.lon.toFixed(4)}
            </span>
          )}
        </div>
        
        <div style={{ marginBottom: '10px' }}>
          <button onClick={addWaypoint} disabled={!map}>
            Add Waypoint
          </button>
          <span style={{ marginLeft: '10px' }}>Waypoints: {waypoints.length}</span>
        </div>
        
        <div style={{ marginTop: '15px' }}>
          <button 
            onClick={calculateOptimizedRoute} 
            disabled={loading || !origin || waypoints.length === 0}
            style={{ marginRight: '10px' }}
          >
            {loading ? 'Calculating...' : 'Calculate Optimized Route'}
          </button>
          <button onClick={clearAll}>Clear All</button>
        </div>
      </div>

      {error && (
        <div style={{ padding: '10px', backgroundColor: '#ffebee', color: '#c62828', borderRadius: '4px', marginBottom: '10px' }}>
          Error: {error}
        </div>
      )}

      {result && (
        <div style={{ backgroundColor: '#f0f7ff', padding: '15px', borderRadius: '8px' }}>
          <h3 style={{ marginTop: 0 }}>Route Summary</h3>
          <div style={{ fontSize: '14px' }}>
            <div style={{ marginBottom: '8px' }}>
              <strong>Total Distance:</strong> {result.distance.toFixed(2)} km
            </div>
            <div style={{ marginBottom: '8px' }}>
              <strong>Total Duration:</strong> {Math.round(result.duration)} minutes
            </div>
            <div style={{ marginTop: '12px', fontSize: '13px', color: '#666' }}>
              Route optimized to visit all {waypoints.length} waypoint{waypoints.length !== 1 ? 's' : ''} efficiently
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
