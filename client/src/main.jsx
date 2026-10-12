import { StrictMode, Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import ScrollToTop from './components/ScrollToTop.jsx';
import Home from './pages/Home.jsx';

// Страница истории грузится отдельным чанком — только когда на неё заходят
const Story = lazy(() => import('./pages/Story.jsx'));
const Guide = lazy(() => import('./pages/Guide.jsx'));
const GuideAccess = lazy(() => import('./pages/GuideAccess.jsx'));
const GuideUnlock = lazy(() => import('./pages/GuideUnlock.jsx'));

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <ScrollToTop />
      <Suspense fallback={null}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/story" element={<Story />} />
          <Route path="/guide" element={<Guide />} />
          <Route path="/guide/access" element={<GuideAccess />} />
          <Route path="/guide/unlock" element={<GuideUnlock />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  </StrictMode>
);
