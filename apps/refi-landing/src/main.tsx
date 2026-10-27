import { StrictMode } from 'react';
import { hydrateRoot, createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';

const root = document.getElementById('root');
if (!root) throw Error('Application root missing');
const app = <StrictMode><App initialPath={location.pathname} /></StrictMode>;
if (root.querySelector('main')) hydrateRoot(root, app);
else createRoot(root).render(app);
