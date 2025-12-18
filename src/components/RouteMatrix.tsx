import { useState, useEffect, useRef } from 'react';
import * as atlas from 'azure-maps-control';
import type { Location } from '../types/routeMatrix';

interface RouteMatrixProps {
  map: atlas.Map | null;
  subscriptionKey: string;
  onKeyChange?: (key: string) => void;
  hasEnvKey?: boolean;
}

interface RouteLeg {
  distance: number;
  duration: number;
  startPoint: string;
  endPoint: string;
}

interface RouteResult {
  distance: number;
  duration: number;
  waypointOrder?: number[];
  legs?: RouteLeg[];
}

export const RouteMatrix: React.FC<RouteMatrixProps> = ({ map, subscriptionKey, onKeyChange, hasEnvKey }) => {
  const [origin, setOrigin] = useState<Location | null>(null);
  const [waypoints, setWaypoints] = useState<Location[]>([]);
  const [result, setResult] = useState<RouteResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showTraffic, setShowTraffic] = useState(false);
  const [vehicleType, setVehicleType] = useState<'car' | 'truck'>('car');
  const [manualKeyInput, setManualKeyInput] = useState('');
  const dataSourceRef = useRef<atlas.source.DataSource | null>(null);
  const routeDataSourceRef = useRef<atlas.source.DataSource | null>(null);

  // Initialize data source when map is ready
  useEffect(() => {
    if (!map) return;

    // Ensure we have an arrow icon available for route direction markers.
    // Using a built-in template avoids font/glyph issues with text-based arrows.
    if (!map.imageSprite.hasImage('route-arrow')) {
      map.imageSprite
        .createFromTemplate('route-arrow', 'triangle-arrow-up', '#667eea', '#ffffff', 1)
        .catch(() => {
          // If the sprite/template fails for any reason, we simply won't render arrows.
        });
    }

    // Create data source for markers
    const dataSource = new atlas.source.DataSource();
    map.sources.add(dataSource);
    dataSourceRef.current = dataSource;

    // Create data source for route lines
    const routeDataSource = new atlas.source.DataSource();
    map.sources.add(routeDataSource);
    routeDataSourceRef.current = routeDataSource;

    // Add line layer for routes (rendered under markers since marker layers are added after this)
    map.layers.add(
      new atlas.layer.LineLayer(routeDataSource, 'route-layer', {
        strokeColor: '#667eea',
        strokeWidth: 5,
        strokeOpacity: 0.9,
      })
    );

    // Add symbol layer for directional arrows (point symbols with rotation)
    map.layers.add(
      new atlas.layer.SymbolLayer(routeDataSource, 'route-arrows', {
        filter: ['==', ['get', 'isArrow'], true],
        iconOptions: {
          image: 'route-arrow',
          anchor: 'center',
          allowOverlap: true,
          ignorePlacement: true,
          rotation: ['get', 'heading'],
          rotationAlignment: 'map',
          size: 0.65,
        },
      })
    );

    // Add symbol layer for origin (green pin)
    map.layers.add(
      new atlas.layer.SymbolLayer(dataSource, 'origin-layer', {
        filter: ['==', ['get', 'type'], 'origin'],
        iconOptions: {
          image: 'marker-darkgreen',
          size: 1,
          anchor: 'bottom',
        },
        textOptions: {
          textField: ['get', 'label'],
          offset: [0, -2],
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

  // Toggle traffic layer
  useEffect(() => {
    if (!map) return;

    if (showTraffic) {
      map.setTraffic({
        incidents: true,
        flow: 'relative',
      });
    } else {
      map.setTraffic({
        incidents: false,
        flow: 'none',
      });
    }
  }, [showTraffic, map]);

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

  const clearOrigin = () => {
    setOrigin(null);
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
      
      const trafficParam = showTraffic ? '&traffic=true' : '';
      const travelModeParam = `&travelMode=${vehicleType}`;
      
      // Add truck-specific parameters if truck is selected
      let vehicleParams = '';
      if (vehicleType === 'truck') {
        vehicleParams = '&vehicleWidth=2.5&vehicleHeight=4&vehicleLength=12&vehicleWeight=10000';
      }
      
      const url = `https://atlas.microsoft.com/route/directions/json?api-version=1.0&subscription-key=${subscriptionKey}&query=${query}&computeBestOrder=true${trafficParam}${travelModeParam}${vehicleParams}`;
      
      const response = await fetch(url);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.error?.message || errorData.message || `HTTP error! status: ${response.status}`;
        throw new Error(errorMessage);
      }

      const data = await response.json();
      
      if (data.error) {
        throw new Error(data.error.message || 'Route calculation failed');
      }
      
      if (!data.routes || data.routes.length === 0) {
        throw new Error('No route found. Points may be too far apart or not connected by roads.');
      }
      
      if (data.routes?.[0]) {
        const route = data.routes[0];
        const summary = route.summary;
        
        // Extract leg details
        const legs: RouteLeg[] = route.legs?.map((leg: { summary: { lengthInMeters: number; travelTimeInSeconds: number } }, index: number) => ({
          distance: leg.summary.lengthInMeters / 1000,
          duration: leg.summary.travelTimeInSeconds / 60,
          startPoint: index === 0 ? 'Start' : `Waypoint ${index}`,
          endPoint: index === route.legs.length - 1 ? `Waypoint ${route.legs.length}` : `Waypoint ${index + 1}`,
        })) || [];
        
        setResult({
          distance: summary.lengthInMeters / 1000,
          duration: summary.travelTimeInSeconds / 60,
          waypointOrder: data.optimizedWaypoints?.map((wp: { optimizedIndex: number }) => wp.optimizedIndex),
          legs,
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
            // Add the route line; arrows are rendered as rotated point symbols along the line.
            routeDataSourceRef.current.add(
              new atlas.data.Feature(
                new atlas.data.LineString(allCoordinates),
                {}
              )
            );

            // Add directional arrow points along the route line.
            // Use a capped number of arrows so short routes still show a few, long routes don't get spammy.
            const maxArrows = 25;
            const step = Math.max(5, Math.floor(allCoordinates.length / (maxArrows + 1)));

            for (let i = step; i < allCoordinates.length - step; i += step) {
              const prev = allCoordinates[Math.max(0, i - 1)];
              const next = allCoordinates[Math.min(allCoordinates.length - 1, i + 1)];

              const dx = next[0] - prev[0];
              const dy = next[1] - prev[1];
              const heading = Math.atan2(dx, dy) * 180 / Math.PI;

              routeDataSourceRef.current.add(
                new atlas.data.Feature(
                  new atlas.data.Point(allCoordinates[i]),
                  {
                    isArrow: true,
                    heading,
                  }
                )
              );
            }
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
            <>
              <span style={{ marginLeft: '10px', fontSize: '12px', color: '#666' }}>
                {origin.lat.toFixed(4)}, {origin.lon.toFixed(4)}
              </span>
              <button 
                onClick={clearOrigin}
                style={{ 
                  marginLeft: '10px',
                  padding: '4px 10px',
                  fontSize: '12px',
                  backgroundColor: '#d13438',
                }}
              >
                ✕ Clear
              </button>
            </>
          )}
        </div>
        
        <div style={{ marginBottom: '10px' }}>
          <button onClick={addWaypoint} disabled={!map}>
            Add Waypoint
          </button>
          <span style={{ marginLeft: '10px' }}>Waypoints: {waypoints.length}</span>
        </div>
        
        <div style={{ marginBottom: '10px' }}>
          <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', fontSize: '14px' }}>
            <input
              type="checkbox"
              checked={showTraffic}
              onChange={(e) => setShowTraffic(e.target.checked)}
              style={{ marginRight: '8px', cursor: 'pointer' }}
            />
            🚦 Show Live Traffic
          </label>
        </div>
        
        <div style={{ marginBottom: '10px' }}>
          <label style={{ fontSize: '14px', display: 'block', marginBottom: '5px' }}>
            🚗 Vehicle Type:
          </label>
          <select 
            value={vehicleType}
            onChange={(e) => setVehicleType(e.target.value as 'car' | 'truck')}
            style={{ 
              padding: '8px 12px',
              fontSize: '14px',
              borderRadius: '4px',
              border: '1px solid #ccc',
              cursor: 'pointer',
              width: '100%',
              maxWidth: '200px'
            }}
          >
            <option value="car">🚗 Car</option>
            <option value="truck">🚚 Truck (12m, 10t)</option>
          </select>
          {vehicleType === 'truck' && (
            <div style={{ fontSize: '12px', color: '#666', marginTop: '5px' }}>
              Standard truck: 2.5m wide, 4m tall, 12m long, 10,000kg
            </div>
          )}
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
            
            {result.legs && result.legs.length > 0 && (
              <details style={{ marginTop: '15px' }}>
                <summary style={{ cursor: 'pointer', fontWeight: 'bold', fontSize: '14px', padding: '8px 0' }}>
                  📋 Detailed Route Breakdown ({result.legs.length} segments)
                </summary>
                <div style={{ marginTop: '10px', paddingLeft: '10px', borderLeft: '3px solid #667eea' }}>
                  {result.legs.map((leg, index) => (
                    <div key={index} style={{ marginBottom: '12px', paddingLeft: '10px' }}>
                      <div style={{ fontWeight: 'bold', color: '#667eea', marginBottom: '4px' }}>
                        {leg.startPoint} → {leg.endPoint}
                      </div>
                      <div style={{ fontSize: '13px', color: '#555' }}>
                        <div>🛣️ Distance: {leg.distance.toFixed(2)} km</div>
                        <div>⏱️ Time: {Math.round(leg.duration)} minutes</div>
                      </div>
                    </div>
                  ))}
                </div>
              </details>
            )}
          </div>
        </div>
      )}
      
      <div style={{ marginTop: '20px', paddingTop: '20px', borderTop: '1px solid #ddd' }}>
        <div style={{ fontSize: '13px', marginBottom: '8px', color: '#666' }}>
          <strong>🔑 Azure Maps Subscription Key</strong>
        </div>
        <input
          type="password"
          value={manualKeyInput}
          onChange={(e) => setManualKeyInput(e.target.value)}
          onBlur={() => onKeyChange?.(manualKeyInput)}
          placeholder={hasEnvKey ? 'Override .env key (optional)' : 'Enter your Azure Maps key'}
          style={{
            width: '100%',
            padding: '8px',
            fontSize: '12px',
            border: '1px solid #ccc',
            borderRadius: '4px',
            fontFamily: 'monospace',
          }}
        />
        <div style={{ fontSize: '11px', color: '#999', marginTop: '5px' }}>
          {hasEnvKey ? 'Currently using .env key' : 'Get your key from'}{' '}
          <a href="https://portal.azure.com" target="_blank" rel="noopener noreferrer" style={{ color: '#667eea' }}>
            Azure Portal
          </a>
        </div>
      </div>
    </div>
  );
};
