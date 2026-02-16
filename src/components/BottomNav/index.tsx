import React from 'react';
import { useNavigate } from 'react-router-dom';
import './BottomNav.css';

const BottomNav: React.FC = () => {
  const navigate = useNavigate();

  return (
    <nav className="side-nav">
      <button onClick={() => navigate('/home')}>Home</button>
      <button onClick={() => window.location.href = '/tracker.html'}>Tracker</button>
      <button onClick={() => navigate('/friends')}>Friends</button>
    </nav>
  );
};

export default BottomNav;
