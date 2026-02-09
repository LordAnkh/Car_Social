import React from 'react';
import { useAuth } from './AuthContext.tsx';

export default function Homepage() {
  const { user, logout } = useAuth();

  return (
    
    <div className="home-title">
      <h1>Hello, {user?.name || user?.email || 'Guest'}!</h1>
      {user && <button onClick={logout}>Logout</button>}
      <></>

    <body className="home-body">
      <p>Car Social Media</p>
    </body> 
    </div>
  );
}
