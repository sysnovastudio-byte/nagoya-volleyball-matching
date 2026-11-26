import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { appRoutes } from './app/App';
import './index.css';

const root = document.getElementById('root');
if (!root) throw new Error('rootの要素がありません。');

const router = createBrowserRouter(appRoutes);

createRoot(root).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
