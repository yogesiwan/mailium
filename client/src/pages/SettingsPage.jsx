import React from 'react';
import api from '../api';

const SettingsPage = () => {
  const connectGoogle = async () => {
    try {
      const res = await api.get('/settings/oauth/url');
      if (res.data.success) {
        window.location.href = res.data.url;
      }
    } catch (err) {
      console.error('Failed to get OAuth URL:', err);
    }
  };

  return (
    <div>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 600, marginBottom: '2rem' }}>Settings</h1>
      
      <div className="card" style={{ padding: '2rem', maxWidth: '600px' }}>
        <h3 style={{ marginBottom: '1rem' }}>Google Account Connection</h3>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
          Connect your Google account to send emails via Gmail and import contacts from Google Sheets.
        </p>
        <button className="btn-primary" onClick={connectGoogle}>
          Connect Google Account
        </button>
      </div>
    </div>
  );
};

export default SettingsPage;
