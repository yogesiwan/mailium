import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/layout/Layout';

import CampaignsPage from './pages/CampaignsPage';
import NewCampaignPage from './pages/NewCampaignPage';
import CampaignDetailPage from './pages/CampaignDetailPage';
import TemplatesPage from './pages/TemplatesPage';
import AnalyticsPage from './pages/AnalyticsPage';
import SettingsPage from './pages/SettingsPage';

import { AuthProvider } from './context/AuthContext';
import PrivateRoute from './components/routing/PrivateRoute';
import PublicRoute from './components/routing/PublicRoute';
import LandingPage from './pages/LandingPage';
import { DraftProvider } from './context/DraftContext';

function App() {
  return (
    <AuthProvider>
      <DraftProvider>
        <Router>
          <Routes>
            <Route element={<PublicRoute />}>
              <Route path="/" element={<LandingPage />} />
            </Route>

            <Route element={<PrivateRoute />}>
              <Route path="/" element={<Layout />}>
                <Route path="campaigns" element={<CampaignsPage />} />
                <Route path="campaigns/new" element={<NewCampaignPage />} />
                <Route path="campaigns/:id" element={<CampaignDetailPage />} />
                
                <Route path="templates" element={<TemplatesPage />} />
                <Route path="analytics" element={<AnalyticsPage />} />
                <Route path="settings" element={<SettingsPage />} />
                
                <Route path="*" element={<Navigate to="/campaigns" replace />} />
              </Route>
            </Route>
          </Routes>
        </Router>
      </DraftProvider>
    </AuthProvider>
  );
}

export default App;
