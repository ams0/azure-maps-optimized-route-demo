import { useState } from 'react';
import * as atlas from 'azure-maps-control';
import { AzureMap } from './components/AzureMap';
import { RouteMatrix } from './components/RouteMatrix';
import './App.css';

function App() {
  const [map, setMap] = useState<atlas.Map | null>(null);
  const subscriptionKey = import.meta.env.VITE_AZURE_MAPS_SUBSCRIPTION_KEY;

  if (!subscriptionKey) {
    return (
      <div style={{ padding: '20px' }}>
        <h1>Azure Maps Route Matrix Demo</h1>
        <div style={{ 
          padding: '20px', 
          backgroundColor: '#fff3cd', 
          border: '1px solid #ffc107',
          borderRadius: '4px'
        }}>
          <h2>⚠️ Configuration Required</h2>
          <p>Please set your Azure Maps subscription key:</p>
          <ol>
            <li>Copy <code>.env.example</code> to <code>.env</code></li>
            <li>Add your Azure Maps subscription key to the <code>.env</code> file</li>
            <li>Restart the development server</li>
          </ol>
          <p>
            Get your subscription key from the{' '}
            <a 
              href="https://portal.azure.com" 
              target="_blank" 
              rel="noopener noreferrer"
            >
              Azure Portal
            </a>
          </p>
        </div>
      </div>
    );
  }

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
          />
        </div>
      </div>
    </div>
  );
}

export default App;
