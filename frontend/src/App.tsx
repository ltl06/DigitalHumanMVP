import { Routes, Route, Outlet, useLocation, Navigate } from 'react-router-dom';
import NavBar from './components/NavBar';
import NotificationToast from './components/NotificationToast';
import ErrorBoundary from './components/ErrorBoundary';
import Breadcrumb from './components/Breadcrumb';
import DashboardPage from './pages/DashboardPage';
import PipelinePage from './pages/PipelinePage';
import HistoryPage from './pages/HistoryPage';
import SettingsPage from './components/SettingsPage';
import TerminalPage from './pages/TerminalPage';
import TerminalSettings from './pages/TerminalSettings';
import CmsDashboard from './pages/CMS/CmsDashboard';
import ExhibitList from './pages/CMS/ExhibitList';
import ExhibitDetail from './pages/CMS/ExhibitDetail';
import ContentList from './pages/CMS/ContentList';
import ContentEditor from './pages/CMS/ContentEditor';
import VersionHistory from './pages/CMS/VersionHistory';
import AnalyticsPage from './pages/analytics/AnalyticsPage';
import InteractionLog from './pages/analytics/InteractionLog';
import { Home, ArrowLeft } from 'lucide-react';

function NotFoundPage() {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '80px 40px',
      textAlign: 'center',
      minHeight: '60vh',
    }}>
      <div style={{
        fontSize: 72,
        fontWeight: 800,
        background: 'linear-gradient(135deg, var(--primary), var(--accent))',
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
        marginBottom: 16,
        fontFamily: 'var(--font)',
      }}>
        404
      </div>
      <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>
        页面不存在
      </h2>
      <p style={{ fontSize: 14, color: 'var(--text3)', marginBottom: 28, maxWidth: 360 }}>
        您访问的页面不存在或已被移除，请检查 URL 是否正确。
      </p>
      <div style={{ display: 'flex', gap: 12 }}>
        <a
          href="/"
          className="btn btn-primary"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, textDecoration: 'none' }}
        >
          <Home size={14} />
          返回首页
        </a>
        <button
          className="btn btn-secondary"
          onClick={() => history.back()}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
        >
          <ArrowLeft size={14} />
          返回上页
        </button>
      </div>
    </div>
  );
}

function AppLayout() {
  const location = useLocation();
  const isTerminal = location.pathname === '/terminal';

  return (
    <>
      {!isTerminal && (
        <>
          <NavBar />
          <Breadcrumb />
        </>
      )}
      <main className={`app-main${isTerminal ? ' terminal-hidden' : ''}`}>
        <ErrorBoundary>
          <Outlet />
        </ErrorBoundary>
      </main>
      {!isTerminal && (
        <footer className="app-footer">
          境语智导 &mdash; AI Digital Human Platform
        </footer>
      )}
      <NotificationToast />
    </>
  );
}

function App() {
  return (
    <div className="app-layout">
      <Routes>
        {/* Terminal — fullscreen, no nav/footer */}
        <Route path="/terminal" element={<TerminalPage />} />

        {/* Admin layout */}
        <Route element={<AppLayout />}>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/create" element={<PipelinePage />} />
          <Route path="/history" element={<HistoryPage />} />
          <Route path="/settings" element={<SettingsPage />} />

          {/* CMS routes */}
          <Route path="/cms" element={<CmsDashboard />} />
          <Route path="/cms/exhibits" element={<ExhibitList />} />
          <Route path="/cms/exhibits/:id" element={<ExhibitDetail />} />
          <Route path="/cms/contents" element={<ContentList />} />
          <Route path="/cms/contents/:id/edit" element={<ContentEditor />} />
          <Route path="/cms/contents/new" element={<ContentEditor />} />
          <Route path="/cms/versions/:contentId" element={<VersionHistory />} />
          <Route path="/analytics" element={<AnalyticsPage />} />
          <Route path="/analytics/interactions" element={<InteractionLog />} />
          <Route path="/terminal-settings" element={<TerminalSettings />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </div>
  );
}

export default App;
