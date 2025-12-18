import { useState, useEffect, useRef } from 'react';
import * as atlas from 'azure-maps-control';
import type { Location } from '../types/routeMatrix';

interface RouteMatrixProps {
  map: atlas.Map | null;
  subscriptionKey: string;
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

export const RouteMatrix: React.FC<RouteMatrixProps> = ({ map, subscriptionKey }) => {
  const [origin, setOrigin] = useState<Location | null>(null);
  const [waypoints, setWaypoints] = useState<Location[]>([]);
  const [result, setResult] = useState<RouteResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showTraffic, setShowTraffic] = useState(false);
  const [vehicleType, setVehicleType] = useState<'car' | 'truck'>('car');
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

    // Add symbol layer for route direction arrows
    map.layers.add(
      new atlas.layer.SymbolLayer(routeDataSource, 'route-arrows', {
        iconOptions: {
          image: 'marker-arrow',
          allowOverlap: true,
          ignorePlacement: true,
          rotation: ['get', 'heading'],
          size: 0.5,
        },
        lineSpacing: 100,
      }),
      'origin-layer'
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
        const legs: RouteLeg[] = route.legs?.map((leg: any, index: number) => ({
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

        // Draw the route on the map with arrows
        if (routeDataSourceRef.current && route.legs) {
          routeDataSourceRef.current.clear();
          
          const allCoordinates: [number, number][] = [];
          const arrowPoints: atlas.data.Feature<atlas.data.Point, { heading: number }>[] = [];
          
          route.legs.forEach((leg: { points?: Array<{ latitude: number; longitude: number }> }) => {
            if (leg.points) {
              leg.points.forEach((point: { latitude: number; longitude: number }) => {
                allCoordinates.push([point.longitude, point.latitude]);
              });
            }
          });

          // Add arrow points along the route
          for (let i = 0; i < allCoordinates.length - 1; i += 20) {
            const start = allCoordinates[i];
            const end = allCoordinates[Math.min(i + 1, allCoordinates.length - 1)];
            const heading = Math.atan2(end[1] - start[1], end[0] - start[0]) * 180 / Math.PI;
            
            arrowPoints.push(
              new atlas.data.Feature(
                new atlas.data.Point(start),
                { heading }
              )
            );
          }

          if (allCoordinates.length > 0) {
            routeDataSourceRef.current.add(
              new atlas.data.Feature(
                new atlas.data.LineString(allCoordinates),
                {}
              )
            );
            routeDataSourceRef.current.add(arrowPoints);
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
    </div>
  );
};
