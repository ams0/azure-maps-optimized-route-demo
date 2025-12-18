import { useState } from 'react';
import * as atlas from 'azure-maps-control';
import { AzureMap } from './components/AzureMap';
import { RouteMatrix } from './components/RouteMatrix';
import './App.css';

function App() {
  const [map, setMap] = useState<atlas.Map | null>(null);
  const [manualKey, setManualKey] = useState('');
  const envKey = import.meta.env.VITE_AZURE_MAPS_SUBSCRIPTION_KEY;
  const subscriptionKey = manualKey || envKey;

  return (
    <div className="app-container">
      <header className="app-header">
        <h1>Azure Maps Optimized Route Demo</h1>
        <p>Find the most efficient route through multiple waypoints</p>
      </header>
      
      <div className="app-content">
        <div className="map-container">
          <AzureMap 
            subscriptionKey={subscriptionKey} 
            onMapReady={setMap}
          />
        </div>
        
        <div className="controls-container">
          <RouteMatrix 
            map={map} 
            subscriptionKey={subscriptionKey}
            onKeyChange={setManualKey}
            hasEnvKey={!!envKey}
          />
        </div>
      </div>
    </div>
  );
}

export default App;
