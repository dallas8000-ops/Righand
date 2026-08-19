import React, { useState, useEffect, useCallback } from 'react';
import AuthForm from './components/AuthForm';
import Dashboard from './components/Dashboard';
import { AuthAPI, setAuthToken } from './services/api';
import { UserDB } from './services/offlineDB';
import './App.css';

const DEVELOPER_BUILD = process.env.REACT_APP_DEVELOPER_BUILD === 'true';

async function createDeveloperSession() {
  const developerUser = {
    id: 'developer_user_001',
    email: process.env.REACT_APP_DEV_LOGIN_EMAIL || 'dev@righand.ai',
    name: 'RigHand Developer',
    truckerLicense: 'DEV-LOCAL',
  };
  const token = `developer_token_${Date.now()}`;
  await UserDB.saveUserSession(developerUser.id, developerUser.email, developerUser);
  localStorage.setItem('authToken', token);
  localStorage.setItem('userId', developerUser.id);
  localStorage.setItem('righandDeveloperMode', 'true');
  setAuthToken(token);
  return developerUser;
}

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const handleLogout = useCallback(() => {
    localStorage.removeItem('authToken');
    localStorage.removeItem('userId');
    localStorage.removeItem('righandDeveloperMode');
    setAuthToken(null);
    setUser(null);
    setIsAuthenticated(false);
  }, []);

  const checkAuth = useCallback(async () => {
    const token = localStorage.getItem('authToken');
    const userId = localStorage.getItem('userId');

    if (DEVELOPER_BUILD && (!token || !userId)) {
      try {
        const developerUser = await createDeveloperSession();
        setUser(developerUser);
        setIsAuthenticated(true);
      } catch (error) {
        console.error('Developer session init failed:', error);
      }
      setLoading(false);
      return;
    }

    if (token && userId) {
      try {
        // Verify token is still valid
        const verified = await AuthAPI.verifyToken(token);
        if (verified) {
          setAuthToken(token);
          const userData = await UserDB.getUserSession(userId);
          setUser(userData?.userData || { id: userId, email: userData?.email });
          setIsAuthenticated(true);
        } else {
          handleLogout();
        }
      } catch (error) {
        console.error('Auth verification failed:', error);
        // Allow offline mode with local user data
        const userData = await UserDB.getUserSession(userId);
        if (userData) {
          setUser(userData?.userData || { id: userId, email: userData?.email });
          setIsAuthenticated(true);
        } else {
          handleLogout();
        }
      }
    }
    setLoading(false);
  }, [handleLogout]);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  const handleAuthSuccess = (userData) => {
    setUser(userData);
    setIsAuthenticated(true);
  };

  if (loading) {
    return (
      <div className="loading-container">
        <img
          src={`${process.env.PUBLIC_URL}/truck-console-bg.png`}
          alt=""
          className="loading-truck"
        />
        <div className="loader">
          <p>RigHand AI</p>
          <p>Loading your cab console…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="App">
      {isAuthenticated ? (
        <Dashboard user={user} onLogout={handleLogout} />
      ) : (
        <AuthForm onAuthSuccess={handleAuthSuccess} isLogin={true} />
      )}
    </div>
  );
}

export default App;
