import React from 'react';
import { useNavigate } from 'react-router-dom';
import './BottomNav.css';

const BottomNav: React.FC = () => {
  const navigate = useNavigate();

  return (
    <nav className="bottom-nav">
      <button onClick={() => navigate('/home')}>Home</button>
      <button onClick={() => window.location.href = '/tracker.html'}>Tracker</button>
      <button onClick={() => navigate('/')}>Post</button>
    </nav>
  );
};

export default BottomNav;
