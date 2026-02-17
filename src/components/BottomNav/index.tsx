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
      <button className="nav-feedback-btn" onClick={() => window.open('https://docs.google.com/forms/d/e/1FAIpQLSfYgevxbT23c4rdVOBhEJb4rPaxx2wB1zEapZ06_FoLIyNkSQ/viewform?usp=header', '_blank')}>Feedback</button>
      {user ? (
        <button className="nav-logout-btn" onClick={handleLogout}>Logout</button>
      ) : (
        <button className="nav-login-btn" onClick={() => navigate('/')}>Login</button>
      )}
    </nav>
  );
};

export default BottomNav;
