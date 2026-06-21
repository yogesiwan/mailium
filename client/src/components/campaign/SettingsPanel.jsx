import React from 'react';
import Toggle from '../common/Toggle';
import { Calendar, Settings } from 'lucide-react';

const SettingsPanel = ({ campaign, setCampaign }) => {
  return (
    <div className="flex flex-col h-full bg-white text-gray-800">
      <div className="p-5 border-b border-gray-100">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-900 mb-3 uppercase tracking-wider">
          <Calendar size={16} className="text-gray-500" /> Schedule send
        </h3>
        <p className="text-xs text-gray-500 mb-4">
          {campaign.schedule?.sendAt 
            ? `Scheduled for ${new Date(campaign.schedule.sendAt).toLocaleString()}` 
            : 'Emails will be sent immediately.'}
        </p>
        <input 
          type="datetime-local" 
          className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-colors" 
          value={campaign.schedule?.sendAt ? new Date(new Date(campaign.schedule.sendAt).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : ''}
          onChange={(e) => {
            const date = e.target.value ? new Date(e.target.value).toISOString() : null;
            setCampaign({
              ...campaign,
              schedule: { ...campaign.schedule, sendAt: date }
            });
          }}
        />
      </div>

      <div className="p-5 border-b border-gray-100">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-900 mb-4 uppercase tracking-wider">
          <Settings size={16} className="text-gray-500" /> Autopilot
        </h3>
        <div className="flex items-center justify-between mb-4">
          <span className="text-sm font-medium text-gray-700">Enable Autopilot</span>
          <Toggle 
            checked={campaign.schedule?.autopilot?.enabled || false}
            onChange={(val) => setCampaign({
              ...campaign, 
              schedule: { ...campaign.schedule, autopilot: { ...campaign.schedule?.autopilot, enabled: val } }
            })}
          />
        </div>

        {/* Expanded Autopilot Config */}
        {campaign.schedule?.autopilot?.enabled && (
          <div className="mt-4 p-4 bg-gray-50 border border-gray-200 rounded-lg space-y-4">
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Max / day</label>
                <input 
                  type="number" 
                  value={campaign.schedule.autopilot.maxPerDay}
                  onChange={(e) => setCampaign({
                    ...campaign,
                    schedule: { ...campaign.schedule, autopilot: { ...campaign.schedule.autopilot, maxPerDay: parseInt(e.target.value) || 0 } }
                  })}
                  className="w-full px-3 py-2 bg-white border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div className="flex-1">
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Delay (mins)</label>
                <input 
                  type="number" 
                  value={campaign.schedule.autopilot.delayMinutes}
                  onChange={(e) => setCampaign({
                    ...campaign,
                    schedule: { ...campaign.schedule, autopilot: { ...campaign.schedule.autopilot, delayMinutes: parseInt(e.target.value) || 0 } }
                  })}
                  className="w-full px-3 py-2 bg-white border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>
            
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Start Time</label>
                <input 
                  type="time" 
                  value={campaign.schedule.autopilot.startTime}
                  onChange={(e) => setCampaign({
                    ...campaign,
                    schedule: { ...campaign.schedule, autopilot: { ...campaign.schedule.autopilot, startTime: e.target.value } }
                  })}
                  className="w-full px-3 py-2 bg-white border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div className="flex-1">
                <label className="block text-xs font-medium text-gray-500 mb-1.5">End Time</label>
                <input 
                  type="time" 
                  value={campaign.schedule.autopilot.endTime}
                  onChange={(e) => setCampaign({
                    ...campaign,
                    schedule: { ...campaign.schedule, autopilot: { ...campaign.schedule.autopilot, endTime: e.target.value } }
                  })}
                  className="w-full px-3 py-2 bg-white border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-2">Sending Days</label>
              <div className="flex flex-wrap gap-2">
                {campaign.schedule.autopilot.days && Object.keys(campaign.schedule.autopilot.days).map(day => (
                  <label key={day} className="flex items-center gap-1.5 text-xs font-medium text-gray-700 capitalize cursor-pointer hover:bg-gray-200 px-2 py-1 rounded transition-colors">
                    <input 
                      type="checkbox" 
                      className="rounded text-blue-600 focus:ring-blue-500 border-gray-300 w-3.5 h-3.5"
                      checked={campaign.schedule.autopilot.days[day]}
                      onChange={(e) => setCampaign({
                        ...campaign,
                        schedule: { 
                          ...campaign.schedule, 
                          autopilot: { 
                            ...campaign.schedule.autopilot, 
                            days: { ...campaign.schedule.autopilot.days, [day]: e.target.checked } 
                          } 
                        }
                      })}
                    /> {day.slice(0, 3)}
                  </label>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="p-5 border-b border-gray-100">
        <h3 className="text-sm font-semibold text-gray-900 mb-4 uppercase tracking-wider">Tracking</h3>
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-gray-700">Track emails</span>
          <Toggle 
            checked={campaign.settings.trackEmails}
            onChange={(val) => setCampaign({
              ...campaign, 
              settings: { ...campaign.settings, trackEmails: val }
            })}
          />
        </div>
      </div>

      <div className="p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-4 uppercase tracking-wider">Metadata (Optional)</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Company Name</label>
            <input 
              type="text" 
              className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-colors"
              value={campaign.companyName}
              onChange={(e) => setCampaign({...campaign, companyName: e.target.value})}
              placeholder="e.g. Google"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Role Name</label>
            <input 
              type="text" 
              className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-colors"
              value={campaign.roleName}
              onChange={(e) => setCampaign({...campaign, roleName: e.target.value})}
              placeholder="e.g. SDE-2"
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsPanel;
