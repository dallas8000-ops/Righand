import React, { useState, useEffect } from 'react';
import AuthForm from './components/AuthForm';
import Dashboard from './components/Dashboard';
import { AuthAPI, setAuthToken } from './services/api';
import { UserDB } from './services/offlineDB';
import './App.css';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    const token = localStorage.getItem('authToken');
    const userId = localStorage.getItem('userId');

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
  };

  const handleAuthSuccess = (userData) => {
    setUser(userData);
    setIsAuthenticated(true);
  };

  const handleLogout = () => {
    localStorage.removeItem('authToken');
    localStorage.removeItem('userId');
    setAuthToken(null);
    setUser(null);
    setIsAuthenticated(false);
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
