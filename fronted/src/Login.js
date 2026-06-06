import React, { useState } from 'react';
import { auth, db } from './firebase';
import { signInWithEmailAndPassword } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import utmLogo from './assets/utm-logo.png';

function Login({ theme, toggleTheme }) {
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [checking, setChecking] = useState(false); // NEW: "Checking role..." state

  const handleLogin = async () => {
  setErrorMsg('');

  if (!email.endsWith('@graduate.utm.my')) {
    setErrorMsg("Please use your @graduate.utm.my email.");
    return;
  }
  if (!password) {
    setErrorMsg("Please enter your password.");
    return;
  }

  try {
    // Step 1: Authenticate
    setChecking(true);
    await signInWithEmailAndPassword(auth, email, password);

    // ✅ Just sign in — App.js onAuthStateChanged handles everything else.
    // Do NOT check Firestore here, do NOT call auth.signOut() here.
    // App.js will fetch the role and route to the correct view.

  } catch (error) {
    setChecking(false);
    switch (error.code) {
      case 'auth/user-not-found':
        setErrorMsg("No account found with this email.");
        break;
      case 'auth/wrong-password':
        setErrorMsg("Incorrect password. Please try again.");
        break;
      case 'auth/too-many-requests':
        setErrorMsg("Too many failed attempts. Please try again later.");
        break;
      case 'auth/invalid-email':
        setErrorMsg("Invalid email format.");
        break;
      case 'auth/invalid-credential':
        setErrorMsg("Invalid email or password.");
        break;
      default:
        setErrorMsg("Login failed: " + error.message);
    }
  }
};

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleLogin();
  };

  // "Checking role..." screen shown after auth, before App.js re-renders
  if (checking) {
    return (
      <div className="login-page">
        <div className="login-box" style={{ textAlign: 'center' }}>
          <img src={utmLogo} alt="UTM" style={{ width: 64, marginBottom: 16 }} />
          <div className="loading-screen" style={{ fontSize: 14 }}>
            Verifying access level...
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="login-page">
      <div className="login-box">
        {toggleTheme && (
          <button
            className="login-theme-toggle"
            onClick={toggleTheme}
            title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          >
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
        )}

        <div className="utm-logo-wrap">
          <img src={utmLogo} alt="Universiti Teknologi Malaysia" />
        </div>
        <div className="logo-divider" />
        <h1 className="utm-title">UTM Assistant</h1>
        <p>Final Year Project Login</p>

        {errorMsg && <div className="login-error">{errorMsg}</div>}

        <input
          type="email"
          placeholder="UTM Gmail — @graduate.utm.my"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={checking}
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={checking}
        />
        <button className="login-btn" onClick={handleLogin} disabled={checking}>
          {checking ? 'Verifying...' : 'Login'}
        </button>

        <p className="login-footer-note">Faculty of Computing · UTM</p>
      </div>
    </div>
  );
}

export default Login;