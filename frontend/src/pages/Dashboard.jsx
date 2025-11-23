import { useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { getCurrentSession, clearCurrentSession, isAuthenticated } from '../utils/auth';
import Globe from '../components/Globe';
import './Dashboard.css';

function Dashboard() {
  const navigate = useNavigate();
  const [userName, setUserName] = useState('');

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

  return (
    <div className="dashboard-container">
      <header className="dashboard-header">
        <h1>Global DoS Attack Map</h1>
        <button className="logout-button" onClick={handleLogout}>
          Logout
        </button>
      </header>

      <main className="dashboard-main">
        <div className="welcome-section">
          <h2>Welcome back, {userName}!</h2>
          <p>Real-time DoS Attack Visualization</p>
        </div>

        <div className="globe-wrapper">
          <Globe />
        </div>
      </main>
    </div>
  );
}

export default Dashboard;
