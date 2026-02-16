import { useNavigate } from 'react-router-dom';
import './landing.css';

export default function Landing() {
  const navigate = useNavigate();

  return (
    <div className="landing">
      <div className="landing-content">
        <h1 className="landing-title">Car Social</h1>
        <p className="landing-subtitle">Track your drives. Share your trips. Connect with friends.</p>

        <div className="landing-buttons">
          <button className="landing-btn landing-btn-primary" onClick={() => navigate('/login')}>
            Log In
          </button>
          <button className="landing-btn landing-btn-secondary" onClick={() => navigate('/signup')}>
            Sign Up
          </button>
        </div>

        <button className="landing-guest" onClick={() => navigate('/home')}>
          Continue as Guest
        </button>
      </div>
    </div>
  );
}
