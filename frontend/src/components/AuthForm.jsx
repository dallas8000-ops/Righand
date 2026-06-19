import React, { useState } from 'react';
import { AuthAPI } from '../services/api';
import { UserDB } from '../services/offlineDB';
import './AuthForm.css';

const DEV_LOGIN_EMAIL = process.env.REACT_APP_DEV_LOGIN_EMAIL;
const DEV_LOGIN_PASSWORD = process.env.REACT_APP_DEV_LOGIN_PASSWORD;

const AuthForm = ({ onAuthSuccess, isLogin = true }) => {
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    name: isLogin ? '' : '',
    truckerLicense: isLogin ? '' : ''
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

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

  const canUseDeveloperLogin = () => (
    isLogin
    && DEV_LOGIN_EMAIL
    && DEV_LOGIN_PASSWORD
    && formData.email.trim().toLowerCase() === DEV_LOGIN_EMAIL.trim().toLowerCase()
    && formData.password === DEV_LOGIN_PASSWORD
  );

  const handleDeveloperLogin = async () => {
    const developerUser = {
      id: 'developer_user_001',
      email: DEV_LOGIN_EMAIL,
      name: 'RigHand Developer',
      truckerLicense: 'DEV-LOCAL'
    };

    await UserDB.saveUserSession(developerUser.id, developerUser.email, developerUser);
    localStorage.setItem('authToken', `developer_token_${Date.now()}`);
    localStorage.setItem('userId', developerUser.id);
    localStorage.setItem('righandDeveloperMode', 'true');
    onAuthSuccess(developerUser);
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
      if (canUseDeveloperLogin()) {
        await handleDeveloperLogin();
        setLoading(false);
        return;
      }
      const msg = err?.error || err?.message || 'Authentication failed. Check your credentials.';
      setError(msg);
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
