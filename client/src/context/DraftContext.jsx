import { createContext, useContext, useState, useEffect } from 'react';
import { getBrowserTimezone } from '../utils/timezones';

const DraftContext = createContext();

const initialCampaignState = {
  name: 'New Campaign',
  companyName: '',
  roleName: '',
  subject: '',
  body: '<p>Start typing your email here...</p>',
  settings: {
    trackEmails: true
  },
  schedule: {
    timezone: getBrowserTimezone(),
    autopilot: {
      enabled: false,
      days: { monday: true, tuesday: true, wednesday: true, thursday: true, friday: true, saturday: false, sunday: false },
      startTime: '09:00',
      endTime: '17:00',
      maxPerDay: 300,
      delayMinutes: 3,
      timezone: getBrowserTimezone()
    }
  }
};

export const DraftProvider = ({ children }) => {
  // Load initial state from LocalStorage if available
  const loadSavedState = () => {
    try {
      const saved = localStorage.getItem('mailium_campaign_draft');
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (error) {
      console.error('Failed to load draft from localStorage:', error);
    }
    return {
      campaign: initialCampaignState,
      recipientsData: [],
      availableColumns: []
    };
  };

  const savedState = loadSavedState();
  
  const [campaign, setCampaign] = useState(savedState.campaign);
  const [recipientsData, setRecipientsData] = useState(savedState.recipientsData);
  const [availableColumns, setAvailableColumns] = useState(savedState.availableColumns);
  const [attachments, setAttachments] = useState([]); // Attachments survive tab switches but not page reloads

  // Sync state to LocalStorage whenever it changes
  useEffect(() => {
    try {
      const stateToSave = {
        campaign,
        recipientsData,
        availableColumns
      };
      localStorage.setItem('mailium_campaign_draft', JSON.stringify(stateToSave));
    } catch (error) {
      console.error('Failed to save draft to localStorage:', error);
    }
  }, [campaign, recipientsData, availableColumns]);

  const clearDraft = () => {
    setCampaign(initialCampaignState);
    setRecipientsData([]);
    setAvailableColumns([]);
    setAttachments([]);
    localStorage.removeItem('mailium_campaign_draft');
  };

  return (
    <DraftContext.Provider value={{
      campaign, setCampaign,
      recipientsData, setRecipientsData,
      availableColumns, setAvailableColumns,
      attachments, setAttachments,
      clearDraft
    }}>
      {children}
    </DraftContext.Provider>
  );
};

export const useDraft = () => useContext(DraftContext);
