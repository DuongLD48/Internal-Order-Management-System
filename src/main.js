import './styles/reset.css';
import './styles/app.css';

import { createApp } from './app/App.js';

const rootElement = document.querySelector('#app');

if (!rootElement) {
  throw new Error('App root element "#app" was not found.');
}

createApp(rootElement);
