import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Send, Users, Eye, Plus, Paperclip, X, LayoutTemplate, Save, RotateCcw, ArrowLeft, Mail, Reply, Lock, Calendar } from 'lucide-react';
import toast from 'react-hot-toast';
import ComposeEditor from '../components/campaign/ComposeEditor';
import SettingsPanel from '../components/campaign/SettingsPanel';
import RecipientSelector from '../components/campaign/RecipientSelector';
import PreviewModal from '../components/campaign/PreviewModal';
import FollowUpEditor from '../components/campaign/FollowUpEditor';
import Modal from '../components/common/Modal';
import api from '../api';
import { useDraft } from '../context/DraftContext';
import { getBrowserTimezone } from '../utils/timezones';

const EMPTY_FOLLOW_UPS = [];

const NewCampaignPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [isRecipientSelectorOpen, setIsRecipientSelectorOpen] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [templates, setTemplates] = useState([]);
  const [isSaveTemplateOpen, setIsSaveTemplateOpen] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [templateDescription, setTemplateDescription] = useState('');
  const [isSavingTemplate, setIsSavingTemplate] = useState(false);
  const [activeStep, setActiveStep] = useState({ type: 'main', index: null });
  const followUpListRef = useRef(null);
  
  const { 
    campaign, setCampaign,
    recipientsData, setRecipientsData,
    availableColumns, setAvailableColumns,
    attachments, setAttachments,
    clearDraft
  } = useDraft();

  useEffect(() => {
    const fetchTemplates = async () => {
      try {
        const res = await api.get('/templates?limit=100');
        setTemplates(res.data.templates || []);
      } catch (err) {
        console.error('Failed to load templates:', err);
      }
    };

    fetchTemplates();
  }, []);

  useEffect(() => {
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
                  timezone: getBrowserTimezone()
                }
              }
            });
            setActiveStep({ type: 'main', index: null });
            // Also if there were recipients, ideally we'd fetch them, but for now we just load the campaign.
            // Clear the ID from URL so it doesn't refetch on refresh if they navigate away
            // setSearchParams({}); // Optional: removes id from URL
          }
        } catch {
          toast.error('Failed to load draft campaign');
        }
      };
      fetchDraft();
    }
  }, [searchParams, setCampaign]);

  const followUps = campaign.followUps || EMPTY_FOLLOW_UPS;
  const activeFollowUp = activeStep.type === 'followUp' ? followUps[activeStep.index] : null;
  const isEditingFollowUp = Boolean(activeFollowUp);
  const activeFollowUpUsesMainSubject = isEditingFollowUp && activeFollowUp.inSameThread !== false;
  const activeStepKey = isEditingFollowUp ? `follow-up-${activeStep.index}` : 'main-email';
  const activeSubject = isEditingFollowUp
    ? (activeFollowUpUsesMainSubject ? campaign.subject : activeFollowUp.subject || '')
    : campaign.subject;
  const activeBody = isEditingFollowUp ? activeFollowUp.body || '' : campaign.body;
  const activeAttachments = isEditingFollowUp ? activeFollowUp.attachments || [] : attachments;
  const activeStepLabel = isEditingFollowUp ? `Follow-up ${activeStep.index + 1}` : 'Main email';

  useEffect(() => {
    if (activeStep.type === 'followUp' && !followUps[activeStep.index]) {
      setActiveStep({ type: 'main', index: null });
    }
  }, [activeStep.index, activeStep.type, followUps]);

  useEffect(() => {
    if (activeStep.type !== 'followUp' || !followUpListRef.current) return;

    const activeRow = followUpListRef.current.querySelector(`[data-follow-up-index="${activeStep.index}"]`);
    activeRow?.scrollIntoView({ block: 'end', behavior: 'smooth' });
  }, [activeStep.index, activeStep.type, followUps.length]);

  const normalizeCampaignForSave = (sourceCampaign) => ({
    ...sourceCampaign,
    followUps: (sourceCampaign.followUps || []).map((followUp, index) => ({
      ...followUp,
      order: index + 1,
      subject: followUp.inSameThread !== false ? sourceCampaign.subject : followUp.subject
    }))
  });

  const updateFollowUpAt = (index, updater) => {
    setCampaign(prev => {
      const nextFollowUps = [...(prev.followUps || [])];
      const currentFollowUp = nextFollowUps[index];
      if (!currentFollowUp) return prev;

      const updatedFollowUp = typeof updater === 'function'
        ? updater(currentFollowUp, prev)
        : updater;
      const nextFollowUp = {
        ...currentFollowUp,
        ...updatedFollowUp,
        order: index + 1
      };

      if (nextFollowUp.inSameThread !== false) {
        nextFollowUp.subject = prev.subject || '';
      }

      nextFollowUps[index] = nextFollowUp;
      return { ...prev, followUps: nextFollowUps };
    });
  };

  const handleMainSubjectChange = (subject) => {
    setCampaign(prev => {
      const nextCampaign = { ...prev, subject };
      if (prev.followUps) {
        nextCampaign.followUps = prev.followUps.map(followUp => (
          followUp.inSameThread !== false ? { ...followUp, subject } : followUp
        ));
      }
      return nextCampaign;
    });
  };

  const handleActiveSubjectChange = (subject) => {
    if (isEditingFollowUp) {
      if (!activeFollowUpUsesMainSubject) {
        updateFollowUpAt(activeStep.index, { subject });
      }
      return;
    }

    handleMainSubjectChange(subject);
  };

  const handleActiveBodyChange = (body) => {
    if (isEditingFollowUp) {
      updateFollowUpAt(activeStep.index, { body });
      return;
    }

    setCampaign(prev => ({ ...prev, body }));
  };

  const handleAttachFiles = (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    if (isEditingFollowUp) {
      updateFollowUpAt(activeStep.index, followUp => ({
        attachments: [...(followUp.attachments || []), ...files]
      }));
    } else {
      setAttachments(prev => [...prev, ...files]);
    }

    e.target.value = '';
  };

  const handleRemoveActiveAttachment = (attachmentIndex) => {
    if (isEditingFollowUp) {
      updateFollowUpAt(activeStep.index, followUp => ({
        attachments: (followUp.attachments || []).filter((_, index) => index !== attachmentIndex)
      }));
      return;
    }

    setAttachments(prev => prev.filter((_, index) => index !== attachmentIndex));
  };

  const previewCampaign = {
    ...campaign,
    subject: activeSubject,
    body: activeBody
  };

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
      const campaignForSave = normalizeCampaignForSave(campaign);
      const isExistingDraft = Boolean(campaign._id);
      const campRes = isExistingDraft
        ? await api.put(`/campaigns/${campaign._id}`, campaignForSave)
        : await api.post('/campaigns', campaignForSave);
      const newCamp = campRes.data.campaign;

      if (isExistingDraft) {
        await api.delete(`/campaigns/${newCamp._id}/recipients`);
      }
      await api.post(`/campaigns/${newCamp._id}/recipients/import`, {
        recipients: recipientsData
      });

      await api.post(`/campaigns/${newCamp._id}/send`);

      toast.success(isExistingDraft ? 'Draft updated and campaign started!' : 'Campaign started!');
      clearDraft();
      navigate(`/campaigns/${newCamp._id}`);
    } catch (error) {
      toast.error('Failed to create campaign');
      console.error(error);
    } finally {
      setIsSending(false);
    }
  };

  const handleApplyTemplate = (templateId) => {
    if (!templateId) return;
    const template = templates.find(item => item._id === templateId);
    if (!template) return;

    if (isEditingFollowUp) {
      updateFollowUpAt(activeStep.index, (followUp, currentCampaign) => ({
        subject: followUp.inSameThread !== false ? currentCampaign.subject : template.subject || '',
        body: template.body || ''
      }));
      toast.success(`Template "${template.name}" applied to follow-up ${activeStep.index + 1}`);
      return;
    }

    setCampaign(prev => ({
      ...prev,
      subject: template.subject || '',
      body: template.body || '',
      followUps: (template.followUps || []).map((followUp, index) => ({
        order: index + 1,
        subject: template.subject || followUp.subject || '',
        body: followUp.body || '',
        delayDays: followUp.delayDays || 3,
        onlyIfNoReply: true,
        inSameThread: true,
        attachments: [],
        excludedRecipients: []
      })),
      settings: {
        ...prev.settings,
        ...(template.settings || {})
      }
    }));
    toast.success(`Template "${template.name}" applied`);
  };

  const handleSaveTemplate = async () => {
    if (!templateName.trim()) {
      toast.error('Template name is required');
      return;
    }
    if (!activeSubject || !activeBody) {
      toast.error('Subject and body are required before saving a template');
      return;
    }

    setIsSavingTemplate(true);
    try {
      const res = await api.post('/templates', {
        name: templateName.trim(),
        description: templateDescription.trim(),
        subject: activeSubject,
        body: activeBody,
        followUps: isEditingFollowUp
          ? []
          : (campaign.followUps || []).map((followUp, index) => ({
            order: index + 1,
            subject: followUp.inSameThread !== false ? campaign.subject : followUp.subject,
            body: followUp.body,
            delayDays: followUp.delayDays
          })),
        settings: campaign.settings,
        tags: [campaign.companyName, campaign.roleName, isEditingFollowUp ? `follow-up-${activeStep.index + 1}` : null].filter(Boolean)
      });
      setTemplates(prev => [res.data.template, ...prev]);
      setTemplateName('');
      setTemplateDescription('');
      setIsSaveTemplateOpen(false);
      toast.success('Template saved');
    } catch {
      toast.error('Failed to save template');
    } finally {
      setIsSavingTemplate(false);
    }
  };

  const handleAddFollowUp = () => {
    const nextIndex = followUps.length;
    setCampaign(prev => ({
      ...prev,
      followUps: [
        ...(prev.followUps || []),
        {
          order: (prev.followUps?.length || 0) + 1,
          subject: prev.subject || '',
          body: '',
          delayDays: 3,
          onlyIfNoReply: true,
          inSameThread: true,
          attachments: [],
          excludedRecipients: []
        }
      ]
    }));
    setActiveStep({ type: 'followUp', index: nextIndex });
  };

  const handleUpdateFollowUp = (index, updatedFollowUp) => {
    updateFollowUpAt(index, updatedFollowUp);
  };

  const handleRemoveFollowUp = (index) => {
    setCampaign(prev => {
      const nextFollowUps = [...(prev.followUps || [])];
      nextFollowUps.splice(index, 1);
      nextFollowUps.forEach((followUp, followUpIndex) => {
        followUp.order = followUpIndex + 1;
      });
      return { ...prev, followUps: nextFollowUps };
    });
    setActiveStep(prev => {
      if (prev.type !== 'followUp') return prev;
      if (prev.index === index) return { type: 'main', index: null };
      if (prev.index > index) return { type: 'followUp', index: prev.index - 1 };
      return prev;
    });
  };

  const handleResetDraft = () => {
    clearDraft();
    setActiveStep({ type: 'main', index: null });
    navigate('/campaigns/new', { replace: true });
    toast.success('Draft reset');
  };

  const hasFollowUps = (campaign.followUps || []).length > 0;
  const isSchedulingCampaign = Boolean(campaign.schedule?.sendAt || campaign.schedule?.autopilot?.enabled);
  const PrimaryActionIcon = isSchedulingCampaign ? Calendar : Send;
  const primaryActionText = isSending
    ? (isSchedulingCampaign ? 'Scheduling...' : 'Sending...')
    : `${isSchedulingCampaign ? 'Schedule' : 'Send'} ${recipientsData.length > 0 ? recipientsData.length : ''}`.trim();
  const compactButtonClass = "h-9 px-3 text-sm bg-white text-gray-700 border border-gray-300 rounded-lg font-medium hover:bg-gray-50 transition-colors inline-flex items-center justify-center gap-2 shadow-sm";
  const compactIconButtonClass = "h-9 w-9 bg-white text-gray-500 border border-gray-300 rounded-lg hover:bg-gray-50 hover:text-gray-900 transition-colors inline-flex items-center justify-center shadow-sm";

  return (
    <div className="flex flex-col lg:flex-row h-full min-h-0 overflow-hidden bg-gray-50">
      <div className="flex-1 min-h-0 flex flex-col p-6 overflow-y-auto">
        <div className="flex flex-col 2xl:flex-row 2xl:justify-between 2xl:items-center gap-4 mb-6">
          <input 
            className="text-2xl font-bold bg-transparent border-none outline-none text-gray-900 placeholder-gray-400 focus:ring-0 p-0 min-w-0" 
            value={campaign.name}
            onChange={(e) => setCampaign({...campaign, name: e.target.value})}
            placeholder="Untitled Campaign"
          />
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2">
              <LayoutTemplate size={16} className="text-gray-400" />
              <select
                className="h-9 px-3 bg-white border border-gray-300 rounded-lg text-sm text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 max-w-[190px]"
                value=""
                onChange={(e) => handleApplyTemplate(e.target.value)}
              >
                <option value="">Import template</option>
                {templates.map(template => (
                  <option key={template._id} value={template._id}>{template.name}</option>
                ))}
              </select>
            </div>
            <button className={compactButtonClass} onClick={() => setIsSaveTemplateOpen(true)}>
              <Save size={16} /> Save
            </button>
            <label className={`${compactButtonClass} cursor-pointer`}>
              <Paperclip size={16} /> Attach
              <input 
                type="file" 
                multiple 
                className="hidden"
                onChange={handleAttachFiles} 
              />
            </label>
            <button className={compactButtonClass} onClick={() => setIsPreviewOpen(true)}>
              <Eye size={16} /> Preview
            </button>
            <button
              className={compactIconButtonClass}
              onClick={handleResetDraft}
              title="Reset current draft"
              aria-label="Reset current draft"
            >
              <RotateCcw size={16} />
            </button>
            <button 
              className="h-9 px-3 text-sm bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors inline-flex items-center justify-center gap-2 shadow-sm disabled:opacity-70"
              onClick={handleCreateAndSend}
              disabled={isSending}
            >
              <PrimaryActionIcon size={16} /> 
              {primaryActionText}
            </button>
          </div>
        </div>

        <div
          key={activeStepKey}
          className={`card bg-white shadow-sm border border-gray-200 mb-6 flex flex-col min-h-[520px] active-editor-swap ${hasFollowUps ? 'max-h-[calc(100vh-250px)]' : 'max-h-[calc(100vh-190px)]'}`}
        >
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-4 py-3 border-b border-gray-100 bg-white">
            <div className="min-w-0 flex items-center gap-2">
              <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${isEditingFollowUp ? 'bg-indigo-50 text-indigo-600' : 'bg-blue-50 text-blue-600'}`}>
                {isEditingFollowUp ? <Reply size={17} /> : <Mail size={17} />}
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-gray-900 truncate">Editing {activeStepLabel}</div>
                <div className="text-xs text-gray-500 truncate">
                  {isEditingFollowUp
                    ? 'This follow-up is using the full composer space.'
                    : 'Primary email in this campaign sequence.'}
                </div>
              </div>
            </div>
            {isEditingFollowUp && (
              <button
                className="h-8 px-3 text-sm bg-white text-gray-700 border border-gray-300 rounded-lg font-medium hover:bg-gray-50 transition-colors inline-flex items-center justify-center gap-2 self-start sm:self-auto"
                onClick={() => setActiveStep({ type: 'main', index: null })}
              >
                <ArrowLeft size={15} /> Main email
              </button>
            )}
          </div>

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
            <div className="flex-1 min-w-0 flex items-center">
              <input 
                type="text" 
                className={`flex-1 min-w-0 px-4 py-3 text-sm outline-none placeholder-gray-400 font-medium ${
                  activeFollowUpUsesMainSubject ? 'text-gray-600 bg-gray-50 cursor-not-allowed' : 'text-gray-900'
                }`}
                placeholder={isEditingFollowUp ? 'Follow-up subject' : 'Your email subject'}
                value={activeSubject}
                onChange={(e) => handleActiveSubjectChange(e.target.value)}
                disabled={activeFollowUpUsesMainSubject}
              />
              {activeFollowUpUsesMainSubject && (
                <div className="px-3 text-xs text-gray-500 hidden sm:flex items-center gap-1 border-l border-gray-100">
                  <Lock size={13} />
                  Same thread
                </div>
              )}
            </div>
          </div>
          
          {activeAttachments.length > 0 && (
            <div className="flex border-b border-gray-100 bg-gray-50">
              <div className="w-24 px-4 py-3 text-sm font-medium text-gray-500 border-r border-gray-100">Attached:</div>
              <div className="flex-1 px-4 py-3 flex flex-wrap gap-2">
                {activeAttachments.map((file, idx) => (
                  <div key={idx} className="flex items-center gap-2 bg-white border border-gray-200 px-3 py-1.5 rounded-lg text-sm text-gray-700 shadow-sm">
                    <Paperclip size={14} className="text-gray-400" /> 
                    <span className="truncate max-w-[200px]">{file.name || file.originalName}</span>
                    <button 
                      className="text-gray-400 hover:text-red-500 transition-colors ml-1"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemoveActiveAttachment(idx);
                      }}
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          <div className="flex-1 min-h-0">
            <ComposeEditor 
              value={activeBody} 
              onChange={handleActiveBodyChange} 
              availablePlaceholders={availableColumns}
            />
          </div>
        </div>

        <section className="mb-6 shrink-0">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">Follow-up sequence</h2>
              <p className="text-xs text-gray-500">{followUps.length} follow-up{followUps.length === 1 ? '' : 's'}</p>
            </div>
            {isEditingFollowUp && (
              <div className="text-xs font-medium text-indigo-700 bg-indigo-50 border border-indigo-100 rounded-full px-3 py-1 self-start sm:self-auto">
                Editing {activeStepLabel}
              </div>
            )}
          </div>

          {hasFollowUps && (
            <div
              ref={followUpListRef}
              className="follow-up-list-scroll pr-2 -mr-2"
            >
              {followUps.map((followUp, index) => (
                <FollowUpEditor 
                  key={`followup-${index}`}
                  followUp={followUp}
                  index={index}
                  onUpdate={handleUpdateFollowUp}
                  onRemove={handleRemoveFollowUp}
                  availablePlaceholders={availableColumns}
                  recipientsData={recipientsData}
                  isCompact
                  isActive={isEditingFollowUp && activeStep.index === index}
                  onOpen={() => setActiveStep({ type: 'followUp', index })}
                  mainSubject={campaign.subject}
                />
              ))}
            </div>
          )}

          <div className="sticky bottom-0 z-10 bg-gray-50 pt-3">
            <button 
              className="flex items-center justify-center gap-2 w-full py-4 border-2 border-dashed border-gray-200 rounded-xl text-gray-500 hover:text-blue-600 hover:border-blue-300 hover:bg-blue-50 transition-colors font-medium"
              onClick={handleAddFollowUp}
            >
              <Plus size={18} /> Add a follow-up email
            </button>
          </div>
        </section>
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
        }}
      />

      <PreviewModal
        isOpen={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
        campaign={previewCampaign}
        recipientsData={recipientsData}
        attachments={activeAttachments}
      />

      <Modal
        isOpen={isSaveTemplateOpen}
        onClose={() => setIsSaveTemplateOpen(false)}
        title={isEditingFollowUp ? `Save ${activeStepLabel} as template` : 'Save as template'}
        size="sm"
        footer={(
          <>
            <button className="btn-outline" onClick={() => setIsSaveTemplateOpen(false)}>Cancel</button>
            <button className="btn-primary gap-2" onClick={handleSaveTemplate} disabled={isSavingTemplate}>
              <Save size={16} /> {isSavingTemplate ? 'Saving...' : 'Save template'}
            </button>
          </>
        )}
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Template name</label>
            <input
              type="text"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              placeholder={isEditingFollowUp ? 'Follow-up after recruiter intro' : 'Recruiter referral intro'}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Description</label>
            <textarea
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 resize-none"
              rows={3}
              value={templateDescription}
              onChange={(e) => setTemplateDescription(e.target.value)}
              placeholder="Optional notes for when to reuse this template"
            />
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default NewCampaignPage;
