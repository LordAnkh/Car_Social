import React from 'react';
import './Home.css';
import { useAuth } from '../../context/AuthContext.tsx';
import BottomNav from '../../components/BottomNav/index.tsx';

export default function Homepage() {
  const { user, logout } = useAuth();

  return (
    <div className="home">
      <div className="home-title">
        <h1>Hello, {user?.name || user?.email || 'Guest'}!</h1>
        {user && <button onClick={logout}>Logout</button>}
      </div>

      <div className="home-body">
        <p>Car Social Media</p>
      </div>

      <BottomNav />
    </div>
  );
}
