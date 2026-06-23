import React, { useState, useEffect } from 'react';
import Modal from '../common/Modal';
import Toggle from '../common/Toggle';
import Combobox from '../common/Combobox';
import api from '../../api';
import toast from 'react-hot-toast';
import { Settings, Building2, Briefcase, Calendar } from 'lucide-react';

const CampaignSettingsModal = ({ isOpen, onClose, campaign, onUpdate }) => {
  const [formData, setFormData] = useState({
    schedule: {
      delayMinutes: 0,
      autopilot: {
        enabled: false,
        maxPerDay: 300,
        delayMinutes: 3,
        days: { monday: true, tuesday: true, wednesday: true, thursday: true, friday: true, saturday: false, sunday: false },
        startTime: '09:00',
        endTime: '17:00'
      }
    },
    companyName: '',
    roleName: ''
  });
  
  const [metadataOptions, setMetadataOptions] = useState({ companies: [], roles: [] });
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (isOpen && campaign) {
      setFormData({
        schedule: campaign.schedule || { autopilot: {} },
        companyName: campaign.companyName || '',
        roleName: campaign.roleName || ''
      });
      
      api.get('/campaigns/metadata/options')
        .then(res => setMetadataOptions({
          companies: res.data?.companies || [],
          roles: res.data?.roles || []
        }))
        .catch(() => {});
    }
  }, [isOpen, campaign]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const payload = {
        schedule: formData.schedule,
        companyName: formData.companyName,
        roleName: formData.roleName
      };
      const res = await api.patch(`/campaigns/${campaign._id}/schedule`, payload);
      toast.success('Campaign settings updated');
      onUpdate(res.data.campaign);
      onClose();
    } catch (err) {
      toast.error('Failed to update settings');
    } finally {
      setIsSaving(false);
    }
  };

  const DAYS = [
    { key: 'monday', label: 'Mon' }, { key: 'tuesday', label: 'Tue' },
    { key: 'wednesday', label: 'Wed' }, { key: 'thursday', label: 'Thu' },
    { key: 'friday', label: 'Fri' }, { key: 'saturday', label: 'Sat' },
    { key: 'sunday', label: 'Sun' }
  ];

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Campaign Settings">
      <div className="space-y-6">
        {/* Metadata Section */}
        <div className="bg-gray-50/50 p-4 rounded-xl border border-gray-100">
          <h4 className="text-sm font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <Settings size={16} className="text-gray-500" /> Metadata
          </h4>
          <div className="space-y-4">
            <div className="z-20 relative">
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Company Name</label>
              <Combobox 
                value={formData.companyName}
                onChange={(val) => setFormData(p => ({ ...p, companyName: val }))}
                options={metadataOptions.companies}
                placeholder="e.g. Google"
                icon={Building2}
              />
            </div>
            <div className="z-10 relative">
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Role Name</label>
              <Combobox 
                value={formData.roleName}
                onChange={(val) => setFormData(p => ({ ...p, roleName: val }))}
                options={metadataOptions.roles}
                placeholder="e.g. SDE-2"
                icon={Briefcase}
              />
            </div>
          </div>
        </div>

        {/* Schedule & Autopilot Section */}
        <div className="bg-gray-50/50 p-4 rounded-xl border border-gray-100">
          <h4 className="text-sm font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <Calendar size={16} className="text-gray-500" /> Delivery Settings
          </h4>
          
          <div className="flex items-center justify-between mb-4 pb-4 border-b border-gray-200">
            <div>
              <span className="text-sm font-medium text-gray-900 block">Autopilot</span>
              <span className="text-xs text-gray-500">Automatically pace your emails</span>
            </div>
            <Toggle 
              checked={formData.schedule?.autopilot?.enabled || false}
              onChange={(val) => setFormData(p => ({
                ...p, 
                schedule: { 
                  ...p.schedule, 
                  autopilot: { ...p.schedule?.autopilot, enabled: val },
                  ...(val ? { sendAt: null } : {})
                }
              }))}
            />
          </div>

          {!formData.schedule?.autopilot?.enabled ? (
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Delay between emails (minutes)</label>
              <input 
                type="number" 
                value={formData.schedule?.delayMinutes || 0}
                onChange={(e) => setFormData(p => ({
                  ...p,
                  schedule: { ...p.schedule, delayMinutes: parseInt(e.target.value) || 0 }
                }))}
                className="w-full px-3 py-2 bg-white border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="block text-xs font-medium text-gray-500 mb-1.5">Max emails / day</label>
                  <input 
                    type="number" 
                    value={formData.schedule.autopilot.maxPerDay}
                    onChange={(e) => setFormData(p => ({
                      ...p,
                      schedule: { ...p.schedule, autopilot: { ...p.schedule.autopilot, maxPerDay: parseInt(e.target.value) || 0 } }
                    }))}
                    className="w-full px-3 py-2 bg-white border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-xs font-medium text-gray-500 mb-1.5">Delay (mins)</label>
                  <input 
                    type="number" 
                    value={formData.schedule.autopilot.delayMinutes}
                    onChange={(e) => setFormData(p => ({
                      ...p,
                      schedule: { ...p.schedule, autopilot: { ...p.schedule.autopilot, delayMinutes: parseInt(e.target.value) || 0 } }
                    }))}
                    className="w-full px-3 py-2 bg-white border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="block text-xs font-medium text-gray-500 mb-1.5">Start Time</label>
                  <input 
                    type="time" 
                    value={formData.schedule.autopilot.startTime}
                    onChange={(e) => setFormData(p => ({
                      ...p,
                      schedule: { ...p.schedule, autopilot: { ...p.schedule.autopilot, startTime: e.target.value } }
                    }))}
                    className="w-full px-3 py-2 bg-white border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-xs font-medium text-gray-500 mb-1.5">End Time</label>
                  <input 
                    type="time" 
                    value={formData.schedule.autopilot.endTime}
                    onChange={(e) => setFormData(p => ({
                      ...p,
                      schedule: { ...p.schedule, autopilot: { ...p.schedule.autopilot, endTime: e.target.value } }
                    }))}
                    className="w-full px-3 py-2 bg-white border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-2">Sending Days</label>
                <div className="flex flex-wrap gap-2">
                  {DAYS.map(day => (
                    <button
                      key={day.key}
                      onClick={() => setFormData(p => ({
                        ...p,
                        schedule: {
                          ...p.schedule,
                          autopilot: {
                            ...p.schedule.autopilot,
                            days: { ...p.schedule.autopilot.days, [day.key]: !p.schedule.autopilot.days[day.key] }
                          }
                        }
                      }))}
                      className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors border ${
                        formData.schedule.autopilot.days?.[day.key] 
                          ? 'bg-blue-50 text-blue-700 border-blue-200' 
                          : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'
                      }`}
                    >
                      {day.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">
            Cancel
          </button>
          <button 
            onClick={handleSave} 
            disabled={isSaving}
            className="btn-primary"
          >
            {isSaving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default CampaignSettingsModal;
