// Firebase configuration
// Replace these with your actual Firebase config values
const FIREBASE_CONFIG = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY || "DEMO_MODE",
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN || "righand-demo.firebaseapp.com",
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID || "righand-demo",
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET || "righand-demo.appspot.com",
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID || "000000000000",
  appId: process.env.REACT_APP_FIREBASE_APP_ID || "1:000000000000:web:abc123def456"
};

export default FIREBASE_CONFIG;
