import { useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { getCurrentSession, clearCurrentSession, isAuthenticated } from '../utils/auth';
import { useWebSocket } from '../hooks/useWebSocket';
import Globe from '../components/Globe';
import './Dashboard.css';

function Dashboard() {
  const navigate = useNavigate();
  const [userName, setUserName] = useState('');

  // Connect to WebSocket
  const { isConnected, events } = useWebSocket('ws://localhost:5000/ws');

  useEffect(() => {
    // Check if user is authenticated
    if (!isAuthenticated()) {
      // Not logged in, redirect to login
      navigate('/login');
      return;
    }

    const user = getCurrentSession();
    setUserName(user.name);
  }, [navigate]);

  const handleLogout = () => {
    // Clear session
    clearCurrentSession();
    alert('Logged out successfully!');
    navigate('/login');
  };

  // Calculate stats from recent events
  const totalAttacks = events.length;
  const highRiskCount = events.filter(e => e.suspicious_score >= 0.75).length;
  const latestEvent = events[events.length - 1];

  return (
    <div className="dashboard-container">
      <header className="dashboard-header">
        <h1>Global DoS Attack Map</h1>
        <div className="header-controls">
          <div className={`connection-status ${isConnected ? 'connected' : 'disconnected'}`}>
            {isConnected ? '🟢 Connected' : '🔴 Disconnected'}
          </div>
          <button className="logout-button" onClick={handleLogout}>
            Logout
          </button>
        </div>
      </header>

      <main className="dashboard-main">
        <div className="welcome-section">
          <h2>Welcome back, {userName}!</h2>
          <p>Real-time DoS Attack Visualization</p>
        </div>

        <div className="stats-panel">
          <div className="stat-card">
            <div className="stat-value">{totalAttacks}</div>
            <div className="stat-label">Total Attacks</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{highRiskCount}</div>
            <div className="stat-label">High Risk</div>
          </div>
          {latestEvent && (
            <div className="stat-card">
              <div className="stat-value">{latestEvent.src_country} → {latestEvent.dst_country}</div>
              <div className="stat-label">Latest: {latestEvent.fingerprint}</div>
            </div>
          )}
        </div>

        <div className="globe-wrapper">
          <Globe events={events} />
        </div>
      </main>
    </div>
  );
}

export default Dashboard;
