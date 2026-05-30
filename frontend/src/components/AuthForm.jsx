import React, { useState } from 'react';
import { AuthAPI } from '../services/api';
import { UserDB } from '../services/offlineDB';
import './AuthForm.css';

const AuthForm = ({ onAuthSuccess, isLogin = true }) => {
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    name: isLogin ? '' : '',
    truckerLicense: isLogin ? '' : ''
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [demoMode, setDemoMode] = useState(false);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    setError('');
  };

  const handleDemoLogin = async () => {
    setLoading(true);
    try {
      // Demo mode with mock data
      const demoUser = {
        id: 'demo_user_001',
        email: 'demo@righand.ai',
        name: 'Demo Trucker',
        truckerLicense: 'DEMO123'
      };

      await UserDB.saveUserSession(demoUser.id, demoUser.email, demoUser);
      localStorage.setItem('authToken', 'demo_token_12345');
      localStorage.setItem('userId', demoUser.id);

      onAuthSuccess(demoUser);
    } catch (err) {
      setError('Demo mode failed: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isLogin) {
        const response = await AuthAPI.login(formData.email, formData.password);
        localStorage.setItem('userId', response.user.id);
        await UserDB.saveUserSession(response.user.id, response.user.email, response.user);
        onAuthSuccess(response.user);
      } else {
        const response = await AuthAPI.register({
          email: formData.email,
          password: formData.password,
          name: formData.name,
          truckerLicense: formData.truckerLicense
        });
        localStorage.setItem('userId', response.user.id);
        await UserDB.saveUserSession(response.user.id, response.user.email, response.user);
        onAuthSuccess(response.user);
      }
    } catch (err) {
      setError(err.message || 'Authentication failed. Check your credentials.');
      console.error('Auth error:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <img
        src={`${process.env.PUBLIC_URL}/truck-console-bg.png`}
        alt=""
        className="auth-truck-bg"
      />
      <div className="auth-card">
        <h1>🚚 RigHand AI</h1>
        <h2>{isLogin ? 'Driver Login' : 'Register'}</h2>
        
        <form onSubmit={handleSubmit} className="auth-form">
          <div className="form-group">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              placeholder="driver@example.com"
              required
            />
          </div>

          {!isLogin && (
            <>
              <div className="form-group">
                <label htmlFor="name">Full Name</label>
                <input
                  id="name"
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  placeholder="Your Name"
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="license">Trucker License</label>
                <input
                  id="license"
                  type="text"
                  name="truckerLicense"
                  value={formData.truckerLicense}
                  onChange={handleChange}
                  placeholder="CDL License Number"
                  required
                />
              </div>
            </>
          )}

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              name="password"
              value={formData.password}
              onChange={handleChange}
              placeholder="••••••••"
              required
            />
          </div>

          {error && <div className="error-message">{error}</div>}

          <button type="submit" disabled={loading} className="btn-primary">
            {loading ? 'Processing...' : (isLogin ? 'Login' : 'Register')}
          </button>
        </form>

        <div className="demo-section">
          <p>Want to test the application?</p>
          <button 
            onClick={handleDemoLogin} 
            disabled={loading}
            className="btn-demo"
          >
            🎯 Demo Mode
          </button>
        </div>

        <p className="auth-footer">
          {isLogin ? "Don't have an account? Contact RigHand AI support." : 'Already registered? Please login.'}
        </p>
      </div>
    </div>
  );
};

export default AuthForm;
