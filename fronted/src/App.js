import React, { useState, useEffect } from 'react';
import { auth, db } from './firebase';
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";

import Login from './Login';
import UserChatView from './Chat';
import AdminView from './AdminView';

import './App.css'; 

function App() {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null);
  const [loading, setLoading] = useState(true);
  const [theme, setTheme] = useState('dark');

  const toggleTheme = () => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  };

    // In App.js — replace the onAuthStateChanged block with this:

  useEffect(() => {
  const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
    if (currentUser) {
      setUser(currentUser);
      try {
        const userDocRef  = doc(db, "users", currentUser.uid);
        const userDocSnap = await getDoc(userDocRef);

        if (userDocSnap.exists()) {
          // ✅ Doc exists — use stored role
          setRole(userDocSnap.data().role);
        } else {
          // ⚠️ No doc yet — create one with default role 'user'
          // This handles users created via Firebase Auth but missing a Firestore record
          await setDoc(userDocRef, {
            gmail:     currentUser.email,
            role:      'user',   // ✅ already correct — keep singular
            createdAt: serverTimestamp(),
          });
          setRole('user');
        }
      } catch (err) {
        console.error("Role fetch failed:", err);
        // Don't sign out on error — just default to regular user
        setRole('user');
      }
    } else {
      setUser(null);
      setRole(null);
    }
    setLoading(false);
  });
  return () => unsubscribe();
}, []);

  // ✅ FIX: Use data-theme attribute on <html> to match CSS selector [data-theme="light"]
  // Previously used document.body.className = theme, which doesn't match the CSS.
  useEffect(() => {
    if (theme === 'light') {
      document.documentElement.setAttribute('data-theme', 'light');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
  }, [theme]);

  if (loading) return <div className="loading-screen">UTM Assistant Loading...</div>;

  if (!user) {
    return <Login theme={theme} toggleTheme={toggleTheme} />;
  }

  return (
    <div className="app-container">
      {/* Role-based rendering */}
      {role === 'admin' ? (
        <AdminView user={user} theme={theme} toggleTheme={toggleTheme} />
      ) : (
        <UserChatView user={user} theme={theme} toggleTheme={toggleTheme} />
      )}
    </div>
  );
}

export default App;