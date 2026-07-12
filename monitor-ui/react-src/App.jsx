import React, { useEffect, useState, lazy, Suspense } from 'react';
import Sidebar from './components/Sidebar.jsx';
import LoadingSpinner from './components/LoadingSpinner.jsx';

const Dashboard = lazy(() => import('./components/Dashboard.jsx'));
const Workroom = lazy(() => import('./components/Workroom.jsx'));
const Audit = lazy(() => import('./components/Audit.jsx'));
const Crons = lazy(() => import('./components/Crons.jsx'));
const Autonomous = lazy(() => import('./components/Autonomous.jsx'));
const Multiagent = lazy(() => import('./components/Multiagent.jsx'));
const Agents = lazy(() => import('./components/Agents.jsx'));
const Models = lazy(() => import('./components/Models.jsx'));
const Programmer = lazy(() => import('./components/Programmer.jsx'));
const Neo4j = lazy(() => import('./components/Neo4j.jsx'));
const Settings = lazy(() => import('./components/Settings.jsx'));
const HomeAssistant = lazy(() => import('./components/HomeAssistant.jsx'));
const Iman = lazy(() => import('./components/Iman.jsx'));
const AgentActivity = lazy(() => import('./components/AgentActivity.jsx'));

const SECTION_COMPONENTS = {
  dashboard: Dashboard,
  workroom: Workroom,
  audit: Audit,
  crons: Crons,
  autonomous: Autonomous,
  multiagent: Multiagent,
  agents: Agents,
  models: Models,
  programmer: Programmer,
  neo4j: Neo4j,
  settings: Settings,
  homeassistant: HomeAssistant,
  iman: Iman,
  activity: AgentActivity,
};

function SectionFallback() {
  return (
    <div className="section-loading">
      <LoadingSpinner />
    </div>
  );
}

export default function App() {
  const [activeSection, setActiveSection] = useState(() => {
    const requested = window.location.hash.replace(/^#/, '');
    return SECTION_COMPONENTS[requested] ? requested : 'dashboard';
  });
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const ActiveSection = SECTION_COMPONENTS[activeSection];

  const handleNavigate = (sectionId) => {
    setActiveSection(sectionId);
    window.history.replaceState(null, '', `#${sectionId}`);
    setSidebarOpen(false);
  };

  useEffect(() => {
    const handleHashChange = () => {
      const requested = window.location.hash.replace(/^#/, '');
      if (SECTION_COMPONENTS[requested]) setActiveSection(requested);
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  return (
    <div className="app-shell">
      <div
        className={`sidebar-overlay ${sidebarOpen ? 'open' : ''}`}
        onClick={() => setSidebarOpen(false)}
      />
      <Sidebar
        activeSection={activeSection}
        onNavigate={handleNavigate}
        isOpen={sidebarOpen}
      />
      <main className="main-content">
        <Suspense fallback={<SectionFallback />}>
          {ActiveSection && <ActiveSection />}
        </Suspense>
      </main>
      <button
        className="mobile-menu-btn"
        onClick={() => setSidebarOpen(!sidebarOpen)}
        aria-label="Toggle menu"
      >
        {sidebarOpen ? '✕' : '☰'}
      </button>
    </div>
  );
}
