import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Send, Users, Eye, Plus, Paperclip, X } from 'lucide-react';
import toast from 'react-hot-toast';
import ComposeEditor from '../components/campaign/ComposeEditor';
import SettingsPanel from '../components/campaign/SettingsPanel';
import RecipientSelector from '../components/campaign/RecipientSelector';
import PreviewModal from '../components/campaign/PreviewModal';
import api from '../api';
import { useDraft } from '../context/DraftContext';

const NewCampaignPage = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [isRecipientSelectorOpen, setIsRecipientSelectorOpen] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isSending, setIsSending] = useState(false);
  
  const { 
    campaign, setCampaign,
    recipientsData, setRecipientsData,
    availableColumns, setAvailableColumns,
    attachments, setAttachments,
    clearDraft
  } = useDraft();

  React.useEffect(() => {
    const id = searchParams.get('id');
    if (id) {
      const fetchDraft = async () => {
        try {
          const res = await api.get(`/campaigns/${id}`);
          if (res.data.campaign) {
            setCampaign({
              ...res.data.campaign,
              // Keep autopilot structure valid if missing
              schedule: res.data.campaign.schedule || {
                autopilot: {
                  enabled: false,
                  days: { monday: true, tuesday: true, wednesday: true, thursday: true, friday: true, saturday: false, sunday: false },
                  startTime: '09:00',
                  endTime: '17:00',
                  maxPerDay: 300,
                  delayMinutes: 3,
                  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
                }
              }
            });
            // Also if there were recipients, ideally we'd fetch them, but for now we just load the campaign.
            // Clear the ID from URL so it doesn't refetch on refresh if they navigate away
            // setSearchParams({}); // Optional: removes id from URL
          }
        } catch (err) {
          toast.error('Failed to load draft campaign');
        }
      };
      fetchDraft();
    }
  }, [searchParams, setCampaign]);

  const handleCreateAndSend = async () => {
    if (!campaign.subject || !campaign.body) {
      toast.error('Subject and body are required');
      return;
    }
    if (recipientsData.length === 0) {
      toast.error('Please select recipients first');
      return;
    }

    setIsSending(true);
    try {
      // 1. Create Campaign
      const campRes = await api.post('/campaigns', campaign);
      const newCamp = campRes.data.campaign;

      // 2. Import Recipients
      await api.post(`/campaigns/${newCamp._id}/recipients/import`, {
        recipients: recipientsData
      });

      // 3. Start Sending
      await api.post(`/campaigns/${newCamp._id}/send`);

      toast.success('Campaign started!');
      clearDraft();
      navigate(`/campaigns/${newCamp._id}`);
    } catch (error) {
      toast.error('Failed to create campaign');
      console.error(error);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="flex flex-col lg:flex-row h-full overflow-hidden bg-gray-50">
      <div className="flex-1 flex flex-col p-6 overflow-y-auto">
        <div className="flex justify-between items-center mb-6">
          <input 
            className="text-2xl font-bold bg-transparent border-none outline-none text-gray-900 placeholder-gray-400 focus:ring-0 p-0" 
            value={campaign.name}
            onChange={(e) => setCampaign({...campaign, name: e.target.value})}
            placeholder="Untitled Campaign"
          />
          <div className="flex items-center gap-3">
            <label className="btn-outline flex items-center gap-2 cursor-pointer shadow-sm">
              <Paperclip size={18} /> Attach
              <input 
                type="file" 
                multiple 
                className="hidden"
                onChange={(e) => setAttachments([...attachments, ...Array.from(e.target.files)])} 
              />
            </label>
            <button className="btn-outline flex items-center gap-2 shadow-sm" onClick={() => setIsPreviewOpen(true)}>
              <Eye size={18} /> Show preview
            </button>
            <button 
              className="btn-primary flex items-center gap-2 shadow-sm"
              onClick={handleCreateAndSend}
              disabled={isSending}
            >
              <Send size={18} /> 
              {isSending ? 'Sending...' : `Send ${recipientsData.length > 0 ? recipientsData.length : ''}`}
            </button>
          </div>
        </div>

        <div className="card bg-white shadow-sm border border-gray-200 mb-6 flex flex-col">
          <div className="flex border-b border-gray-100">
            <div className="w-24 px-4 py-3 text-sm font-medium text-gray-500 border-r border-gray-100 bg-gray-50 flex items-center">From:</div>
            <div className="flex-1 px-4 py-3 text-sm text-gray-900 bg-gray-50">Yogesh Siwan &lt;yogesiwan@gmail.com&gt;</div>
          </div>
          
          <div className="flex border-b border-gray-100 cursor-pointer hover:bg-gray-50 transition-colors" onClick={() => setIsRecipientSelectorOpen(true)}>
            <div className="w-24 px-4 py-3 text-sm font-medium text-gray-500 border-r border-gray-100 flex items-center">To:</div>
            <div className={`flex-1 px-4 py-3 text-sm flex items-center gap-2 ${recipientsData.length ? 'text-gray-900 font-medium' : 'text-blue-600'}`}>
              {recipientsData.length > 0 ? (
                <span>{recipientsData.length} recipients selected</span>
              ) : (
                <>
                  <Users size={18} /> Select recipients
                </>
              )}
            </div>
          </div>

          <div className="flex border-b border-gray-100">
            <div className="w-24 px-4 py-3 text-sm font-medium text-gray-500 border-r border-gray-100 flex items-center">Subject:</div>
            <input 
              type="text" 
              className="flex-1 px-4 py-3 text-sm text-gray-900 outline-none placeholder-gray-400 font-medium" 
              placeholder="Your email subject"
              value={campaign.subject}
              onChange={(e) => setCampaign({...campaign, subject: e.target.value})}
            />
          </div>
          
          {attachments.length > 0 && (
            <div className="flex border-b border-gray-100 bg-gray-50">
              <div className="w-24 px-4 py-3 text-sm font-medium text-gray-500 border-r border-gray-100">Attached:</div>
              <div className="flex-1 px-4 py-3 flex flex-wrap gap-2">
                {attachments.map((file, idx) => (
                  <div key={idx} className="flex items-center gap-2 bg-white border border-gray-200 px-3 py-1.5 rounded-lg text-sm text-gray-700 shadow-sm">
                    <Paperclip size={14} className="text-gray-400" /> 
                    <span className="truncate max-w-[200px]">{file.name}</span>
                    <button 
                      className="text-gray-400 hover:text-red-500 transition-colors ml-1"
                      onClick={(e) => {
                        e.stopPropagation();
                        setAttachments(attachments.filter((_, i) => i !== idx));
                      }}
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          <div className="flex-1">
            <ComposeEditor 
              value={campaign.body} 
              onChange={(val) => setCampaign({...campaign, body: val})} 
              availablePlaceholders={availableColumns}
            />
          </div>
        </div>

        <button className="flex items-center justify-center gap-2 w-full py-4 border-2 border-dashed border-gray-200 rounded-xl text-gray-500 hover:text-blue-600 hover:border-blue-300 hover:bg-blue-50 transition-colors font-medium">
          <Plus size={18} /> Add a follow-up email
        </button>
      </div>

      <div className="w-full lg:w-80 border-l border-gray-200 bg-white overflow-y-auto">
        <SettingsPanel 
          campaign={campaign} 
          setCampaign={setCampaign} 
        />
      </div>

      <RecipientSelector 
        isOpen={isRecipientSelectorOpen} 
        onClose={() => setIsRecipientSelectorOpen(false)} 
        onImport={(data, columns) => {
          setRecipientsData(data);
          setAvailableColumns(columns);
          setIsRecipientSelectorOpen(false);
        }}
      />

      <PreviewModal
        isOpen={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
        campaign={campaign}
        recipientsData={recipientsData}
        attachments={attachments}
      />
    </div>
  );
};

export default NewCampaignPage;
