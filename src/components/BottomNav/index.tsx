import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import './BottomNav.css';

const BottomNav: React.FC = () => {
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  return (
    <nav className="side-nav">
      <button onClick={() => navigate('/home')}>Home</button>
      <button onClick={() => window.location.href = '/tracker.html'}>Tracker</button>
      <button onClick={() => navigate('/friends')}>Friends</button>
      {user ? (
        <button className="nav-logout-btn" onClick={handleLogout}>Logout</button>
      ) : (
        <button className="nav-login-btn" onClick={() => navigate('/')}>Login</button>
      )}
    </nav>
  );
};

export default BottomNav;
