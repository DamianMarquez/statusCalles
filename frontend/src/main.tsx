import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.js';
import MapLabView from './lab/MapLabView.js';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {new URLSearchParams(window.location.search).get('lab') === '1' ? <MapLabView /> : <App />}
  </React.StrictMode>,
);
