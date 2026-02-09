import React from 'react';
import './homepage.css';
import { useAuth } from './AuthContext.tsx';
import { useNavigate } from 'react-router-dom';
import { NavLink } from 'react-router-dom';
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

<nav className="bottom-nav">
  <NavLink to="/home">Home</NavLink>
  <NavLink to="/create-trip">Post</NavLink>
  <NavLink to="/profile">Profile</NavLink>
</nav>
</div>
  );
}
