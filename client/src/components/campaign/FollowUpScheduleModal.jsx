import { useState } from 'react';
import { X, Calendar, Settings, Globe2 } from 'lucide-react';
import Toggle from '../common/Toggle';
import { COMMON_TIMEZONES, getBrowserTimezone } from '../../utils/timezones';

const FollowUpScheduleModal = ({ isOpen, onClose, schedule, onSave }) => {
  const [localSchedule, setLocalSchedule] = useState(() => schedule || {
    sendAt: null,
    timezone: getBrowserTimezone(),
    autopilot: {
      enabled: false,
      days: { monday: true, tuesday: true, wednesday: true, thursday: true, friday: true, saturday: false, sunday: false },
      startTime: '09:00',
      endTime: '17:00',
      timezone: getBrowserTimezone()
    }
  });

  if (!isOpen) return null;

  const selectedTimezone = localSchedule.timezone || localSchedule.autopilot?.timezone || getBrowserTimezone();
  const timezoneOptions = COMMON_TIMEZONES.includes(selectedTimezone)
    ? COMMON_TIMEZONES
    : [selectedTimezone, ...COMMON_TIMEZONES];

  const updateTimezone = (timezone) => {
    setLocalSchedule(prev => ({
      ...prev,
      timezone,
      autopilot: {
        ...prev.autopilot,
        timezone
      }
    }));
  };

  const handleSave = () => {
    onSave(localSchedule);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
        <div className="flex justify-between items-center p-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <Calendar size={18} /> Schedule & Autopilot
          </h2>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors">
            <X size={20} />
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-5 text-gray-800">
          {/* Specific Time */}
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-gray-900 mb-2">Send at a specific time (optional)</h3>
            <p className="text-xs text-gray-500 mb-3">If set, this follow-up will ignore the relative delay and wait until this exact time.</p>
            <input 
              type="datetime-local" 
              className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-colors" 
              value={localSchedule.sendAt ? new Date(new Date(localSchedule.sendAt).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : ''}
              onChange={(e) => {
                const date = e.target.value ? new Date(e.target.value).toISOString() : null;
                setLocalSchedule(prev => ({ ...prev, sendAt: date }));
              }}
            />
            <label className="flex items-center gap-1.5 text-xs font-medium text-gray-500 mt-4 mb-1.5">
              <Globe2 size={13} /> Timezone
            </label>
            <select
              className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
              value={selectedTimezone}
              onChange={(e) => updateTimezone(e.target.value)}
            >
              {timezoneOptions.map(timezone => (
                <option key={timezone} value={timezone}>{timezone}</option>
              ))}
            </select>
          </div>

          <hr className="border-gray-100 my-6" />

          {/* Autopilot */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                  <Settings size={16} className="text-gray-500" /> Enable Autopilot
                </h3>
                <p className="text-xs text-gray-500 mt-1">Restrict sending to specific days and times.</p>
              </div>
              <Toggle 
                checked={localSchedule.autopilot?.enabled || false}
                onChange={(val) => setLocalSchedule(prev => ({
                  ...prev, 
                  autopilot: { ...prev.autopilot, enabled: val }
                }))}
              />
            </div>

            {localSchedule.autopilot?.enabled && (
              <div className="mt-4 p-4 bg-gray-50 border border-gray-200 rounded-lg space-y-4">
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="block text-xs font-medium text-gray-500 mb-1.5">Start Time</label>
                    <input 
                      type="time" 
                      value={localSchedule.autopilot.startTime}
                      onChange={(e) => setLocalSchedule(prev => ({
                        ...prev, autopilot: { ...prev.autopilot, startTime: e.target.value }
                      }))}
                      className="w-full px-3 py-2 bg-white border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="block text-xs font-medium text-gray-500 mb-1.5">End Time</label>
                    <input 
                      type="time" 
                      value={localSchedule.autopilot.endTime}
                      onChange={(e) => setLocalSchedule(prev => ({
                        ...prev, autopilot: { ...prev.autopilot, endTime: e.target.value }
                      }))}
                      className="w-full px-3 py-2 bg-white border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-2">Sending Days</label>
                  <div className="flex flex-wrap gap-2">
                    {localSchedule.autopilot.days && Object.keys(localSchedule.autopilot.days).map(day => (
                      <label key={day} className="flex items-center gap-1.5 text-xs font-medium text-gray-700 capitalize cursor-pointer hover:bg-gray-200 px-2 py-1 rounded transition-colors">
                        <input 
                          type="checkbox" 
                          className="rounded text-blue-600 focus:ring-blue-500 border-gray-300 w-3.5 h-3.5"
                          checked={localSchedule.autopilot.days[day]}
                          onChange={(e) => setLocalSchedule(prev => ({
                            ...prev, 
                            autopilot: { 
                              ...prev.autopilot, 
                              days: { ...prev.autopilot.days, [day]: e.target.checked } 
                            }
                          }))}
                        /> {day.slice(0, 3)}
                      </label>
                    ))}
                  </div>
                </div>

                <div className="flex items-start gap-2 rounded-md border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-800">
                  <Globe2 size={14} className="mt-0.5 shrink-0" />
                  <span>Autopilot checks this window in {selectedTimezone}.</span>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="p-4 border-t border-gray-100 bg-gray-50 flex justify-end gap-3">
          <button className="btn-outline" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={handleSave}>Save Schedule</button>
        </div>
      </div>
    </div>
  );
};

export default FollowUpScheduleModal;
