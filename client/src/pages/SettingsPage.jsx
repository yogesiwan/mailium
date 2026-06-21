import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, ExternalLink, Loader2, Mail, RefreshCw, Save, Settings as SettingsIcon, ShieldCheck, UserRound, Globe2, EyeOff, Plus, Trash2 } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../api';
import { COMMON_TIMEZONES, formatDateTime, getBrowserTimezone } from '../utils/timezones';
import Modal from '../components/common/Modal';

const SettingsPage = () => {
  const [searchParams] = useSearchParams();
  const [settings, setSettings] = useState(null);
  const [ignoredIps, setIgnoredIps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [addingIp, setAddingIp] = useState(false);
  const [showLabelDialog, setShowLabelDialog] = useState(false);
  const [ipLabel, setIpLabel] = useState('My Device');
  const [defaults, setDefaults] = useState({
    fromName: '',
    fromEmail: '',
    timezone: getBrowserTimezone(),
    maxEmailsPerDay: 300,
    delayBetweenEmails: 3
  });

  const fetchSettings = useCallback(async () => {
    setLoading(true);
    try {
      const [res, ipsRes] = await Promise.all([
        api.get('/settings'),
        api.get('/settings/ignored-ips')
      ]);
      setSettings(res.data.settings);
      setIgnoredIps(ipsRes.data.ips || []);
      setDefaults({
        fromName: res.data.settings.defaults?.fromName || '',
        fromEmail: res.data.settings.defaults?.fromEmail || '',
        timezone: res.data.settings.defaults?.timezone || getBrowserTimezone(),
        maxEmailsPerDay: res.data.settings.defaults?.maxEmailsPerDay || 300,
        delayBetweenEmails: res.data.settings.defaults?.delayBetweenEmails || 3
      });
    } catch {
      toast.error('Failed to load settings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const oauthResult = searchParams.get('oauth');
    if (oauthResult === 'success') toast.success('Google account connected');
    if (oauthResult === 'error') toast.error('Google connection failed');
    fetchSettings();
  }, [fetchSettings, searchParams]);

  const connectGoogle = async () => {
    setConnecting(true);
    try {
      const res = await api.get('/settings/oauth/url');
      if (res.data.success) {
        window.location.href = res.data.url;
      }
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to start Google OAuth');
      setConnecting(false);
    }
  };

  const saveDefaults = async () => {
    setSaving(true);
    try {
      const res = await api.put('/settings', {
        defaults: {
          ...defaults,
          maxEmailsPerDay: Number(defaults.maxEmailsPerDay) || 300,
          delayBetweenEmails: Number(defaults.delayBetweenEmails) || 3
        }
      });
      setSettings(res.data.settings);
      toast.success('Settings saved');
    } catch {
      toast.error('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleAddIgnoredIp = async () => {
    if (!ipLabel.trim()) {
      toast.error('Label is required');
      return;
    }
    
    setAddingIp(true);
    try {
      const res = await api.post('/settings/ignored-ips', { label: ipLabel.trim() });
      if (res.data.success) {
        toast.success('Device IP whitelisted for 24 hours');
        setShowLabelDialog(false);
        setIpLabel('My Device');
        fetchSettings(); // Refresh list
      }
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to whitelist IP');
    } finally {
      setAddingIp(false);
    }
  };

  const handleDeleteIgnoredIp = async (id) => {
    try {
      const res = await api.delete(`/settings/ignored-ips/${id}`);
      if (res.data.success) {
        toast.success('IP removed from whitelist');
        setIgnoredIps(prev => prev.filter(ip => ip._id !== id));
      }
    } catch {
      toast.error('Failed to remove IP');
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-[60vh]">
        <Loader2 className="animate-spin text-blue-600" size={32} />
      </div>
    );
  }

  const google = settings?.google || {};
  const isConfigured = Boolean(google.isConfigured);
  const oauthAvailable = google.oauthAvailable !== false;
  const isEnvConfigured = google.source === 'environment';
  const timezoneOptions = COMMON_TIMEZONES.includes(defaults.timezone)
    ? COMMON_TIMEZONES
    : [defaults.timezone, ...COMMON_TIMEZONES];

  return (
    <div className="max-w-5xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-gray-900">Settings</h1>
        <p className="text-sm text-gray-500 mt-1">Account connection, sender defaults, and scheduling preferences.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="card p-6">
            <div className="flex items-start justify-between gap-4 mb-6">
              <div>
                <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                  <Mail size={20} className="text-blue-600" /> Google account
                </h2>
                <p className="text-sm text-gray-500 mt-1">
                  Gmail sends and Google Sheets imports use this OAuth connection.
                </p>
              </div>
              {isConfigured && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-semibold border border-emerald-100">
                  <CheckCircle2 size={14} /> {isEnvConfigured ? 'Server env ready' : 'Connected'}
                </span>
              )}
            </div>

            {isConfigured ? (
              <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-11 h-11 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
                      <UserRound size={21} />
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold text-gray-900 truncate">{google.userName || 'Google account'}</div>
                      <div className="text-sm text-gray-500 truncate">{google.userEmail}</div>
                    </div>
                  </div>
                  {oauthAvailable ? (
                    <button className="btn-outline gap-2 text-sm" onClick={connectGoogle} disabled={connecting}>
                      <RefreshCw size={16} /> {connecting ? 'Opening...' : 'Change account'}
                    </button>
                  ) : (
                    <span className="inline-flex items-center px-3 py-1.5 rounded-lg bg-white border border-gray-200 text-xs font-medium text-gray-600">
                      Managed by server env
                    </span>
                  )}
                </div>

                <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                  <div className="rounded-lg bg-white border border-gray-100 p-3">
                    <div className="text-xs font-medium text-gray-500 mb-1">Scopes</div>
                    <div className="text-gray-700">
                      {isEnvConfigured ? 'Loaded from refresh token' : `${google.scopes?.length || 0} permissions granted`}
                    </div>
                  </div>
                  <div className="rounded-lg bg-white border border-gray-100 p-3">
                    <div className="text-xs font-medium text-gray-500 mb-1">Server time</div>
                    <div className="text-gray-700">{settings?.server?.now ? formatDateTime(settings.server.now, defaults.timezone) : 'Unavailable'}</div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-amber-100 bg-amber-50 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <div className="font-semibold text-amber-950">Google is not connected</div>
                  <div className="text-sm text-amber-800 mt-1">
                    {oauthAvailable
                      ? 'Connect before sending real campaigns or importing private sheets.'
                      : 'OAuth needs HTTPS in production. Add Gmail OAuth env credentials or deploy behind an HTTPS domain.'}
                  </div>
                </div>
                <button className="btn-primary gap-2" onClick={connectGoogle} disabled={connecting || !oauthAvailable}>
                  <ExternalLink size={16} /> {connecting ? 'Opening...' : 'Connect Google'}
                </button>
              </div>
            )}
          </div>

          <div className="card p-6">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2 mb-5">
              <SettingsIcon size={20} className="text-blue-600" /> Campaign defaults
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Sender name</label>
                <input
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                  value={defaults.fromName}
                  onChange={(e) => setDefaults(prev => ({ ...prev, fromName: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Sender email</label>
                <input
                  type="email"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                  value={defaults.fromEmail}
                  onChange={(e) => setDefaults(prev => ({ ...prev, fromEmail: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Default timezone</label>
                <select
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                  value={defaults.timezone}
                  onChange={(e) => setDefaults(prev => ({ ...prev, timezone: e.target.value }))}
                >
                  {timezoneOptions.map(timezone => (
                    <option key={timezone} value={timezone}>{timezone}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Max / day</label>
                  <input
                    type="number"
                    min="1"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                    value={defaults.maxEmailsPerDay}
                    onChange={(e) => setDefaults(prev => ({ ...prev, maxEmailsPerDay: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Delay mins</label>
                  <input
                    type="number"
                    min="0"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                    value={defaults.delayBetweenEmails}
                    onChange={(e) => setDefaults(prev => ({ ...prev, delayBetweenEmails: e.target.value }))}
                  />
                </div>
              </div>
            </div>

            <div className="mt-6 flex justify-end">
              <button className="btn-primary gap-2" onClick={saveDefaults} disabled={saving}>
                <Save size={16} /> {saving ? 'Saving...' : 'Save settings'}
              </button>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="card p-5">
            <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide flex items-center gap-2 mb-4">
              <ShieldCheck size={17} className="text-emerald-600" /> Safety state
            </h3>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between gap-3">
                <span className="text-gray-500">OAuth tokens</span>
                <span className="font-medium text-gray-900">Hidden from UI</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-gray-500">Google status</span>
                <span className={isConfigured ? 'font-medium text-emerald-700' : 'font-medium text-amber-700'}>
                  {isConfigured ? 'Ready' : 'Needs setup'}
                </span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-gray-500">Credential source</span>
                <span className="font-medium text-gray-900 capitalize">{google.source || 'none'}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-gray-500">Server timezone</span>
                <span className="font-medium text-gray-900">{settings?.server?.timezone || 'Unknown'}</span>
              </div>
            </div>
          </div>

          <div className="card p-5">
            <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide flex items-center gap-2 mb-3">
              <Globe2 size={17} className="text-blue-600" /> Scheduling basis
            </h3>
            <p className="text-sm text-gray-600 leading-6">
              Campaign scheduling uses backend time and converts allowed days/time windows through your selected timezone before jobs run.
            </p>
          </div>

          <div className="card p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide flex items-center gap-2">
                <EyeOff size={17} className="text-purple-600" /> Tracking Whitelist
              </h3>
              <button 
                className="btn-outline py-1 px-2 text-xs h-auto gap-1"
                onClick={() => {
                  setIpLabel('My Device');
                  setShowLabelDialog(true);
                }}
              >
                <Plus size={12} /> Add Current
              </button>
            </div>
            <p className="text-xs text-gray-500 mb-4 leading-relaxed">
              Whitelist your devices so your own email opens (e.g., viewing the Sent folder) don't inflate campaign stats. IPs expire after 24h.
            </p>
            
            {ignoredIps.length === 0 ? (
              <div className="text-xs text-gray-400 italic text-center py-2 bg-gray-50 rounded-lg border border-dashed border-gray-200">
                No whitelisted IPs
              </div>
            ) : (
              <ul className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {ignoredIps.map(item => (
                  <li key={item._id} className="flex items-center justify-between bg-white border border-gray-100 rounded-lg p-2.5 shadow-sm text-sm">
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-gray-900 truncate">{item.label}</div>
                      <div className="text-xs text-gray-500 font-mono mt-0.5 truncate">{item.ip}</div>
                    </div>
                    <button 
                      onClick={() => handleDeleteIgnoredIp(item._id)}
                      className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
                      title="Remove"
                    >
                      <Trash2 size={14} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      {/* Label Dialog Modal */}
      <Modal 
        isOpen={showLabelDialog} 
        onClose={() => setShowLabelDialog(false)} 
        title="Whitelist Device IP"
        size="sm"
        footer={
          <>
            <button className="btn-outline" onClick={() => setShowLabelDialog(false)}>Cancel</button>
            <button className="btn-primary" onClick={handleAddIgnoredIp} disabled={addingIp}>
              {addingIp ? 'Saving...' : 'Whitelist'}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Enter a label to help you identify this device later (e.g., "Personal Mobile", "Work Laptop"). This IP will be excluded from tracking metrics for 24 hours.
          </p>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Device Label</label>
            <input
              type="text"
              autoFocus
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
              value={ipLabel}
              onChange={(e) => setIpLabel(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAddIgnoredIp();
              }}
            />
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default SettingsPage;
