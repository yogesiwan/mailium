import { useCallback, useEffect, useState, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import api from '../api';
import { Mail, Eye, ArrowLeft, MoreHorizontal, Copy, Edit2, Play, Pause, CheckCircle2, Clock, Plus, Save, Loader2, LayoutTemplate, Reply, ChevronDown, ChevronRight, RefreshCw, CalendarCheck, GitBranch, Zap, Timer, Settings, FileText, Moon } from 'lucide-react';
import toast from 'react-hot-toast';
import FollowUpEditor from '../components/campaign/FollowUpEditor';
import ComposeEditor from '../components/campaign/ComposeEditor';
import AttachmentViewer from '../components/campaign/AttachmentViewer';
import CampaignSettingsModal from '../components/campaign/CampaignSettingsModal';
import Modal from '../components/common/Modal';
import { formatDateTime } from '../utils/timezones';

const ACTIVE_DRAFT_FOLLOW_UP_STATUSES = ['draft', 'pending'];
const CONFIRMABLE_FOLLOW_UP_STATUSES = ['draft', 'pending', 'scheduled'];
const LOCKED_FOLLOW_UP_STATUSES = ['sending', 'completed', 'cancelled'];

const isBlankHtml = (value = '') => {
  const text = String(value)
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .trim();
  return text.length === 0;
};

const CampaignDetailPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  
  const [recipientsData, setRecipientsData] = useState({ recipients: [], total: 0, page: 1, pages: 1 });
  const [recipientsPage, setRecipientsPage] = useState(1);
  const [loadingRecipients, setLoadingRecipients] = useState(true);
  const [isSavingSequence, setIsSavingSequence] = useState(false);
  const [isSchedulingFollowUps, setIsSchedulingFollowUps] = useState(false);
  const [cancellingFollowUpOrder, setCancellingFollowUpOrder] = useState(null);
  const [trackingFilter, setTrackingFilter] = useState('All');
  const [showAllTracking, setShowAllTracking] = useState(false);
  const [isSequenceExpanded, setIsSequenceExpanded] = useState(false);
  const [isSequenceDirty, setIsSequenceDirty] = useState(false);
  const [isStatsRefreshing, setIsStatsRefreshing] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState(null);

  // Edit Name State
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState('');
  const [actionsOpen, setActionsOpen] = useState(false);
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [templateDescription, setTemplateDescription] = useState('');
  const [isSavingTemplate, setIsSavingTemplate] = useState(false);
  const [isTestModalOpen, setIsTestModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [testEmailAddress, setTestEmailAddress] = useState('');
  const [isSendingTest, setIsSendingTest] = useState(false);
  const [isBranching, setIsBranching] = useState(false);
  const actionsRef = useRef(null);
  const isSequenceDirtyRef = useRef(false);

  useEffect(() => {
    isSequenceDirtyRef.current = isSequenceDirty;
  }, [isSequenceDirty]);

  const markSequenceDirty = () => {
    isSequenceDirtyRef.current = true;
    setIsSequenceDirty(true);
  };

  const clearSequenceDirty = () => {
    isSequenceDirtyRef.current = false;
    setIsSequenceDirty(false);
  };

  const fetchCampaign = useCallback(async ({ silent = false, statsRefresh = false } = {}) => {
    if (!silent) setLoading(true);
    if (statsRefresh) setIsStatsRefreshing(true);
    try {
      const res = await api.get(`/analytics/campaigns/${id}`);
      setData(prev => {
        if (!prev || !isSequenceDirtyRef.current) return res.data;

        return {
          ...res.data,
          campaign: {
            ...res.data.campaign,
            followUps: prev.campaign.followUps
          }
        };
      });
      setEditedName(current => (isEditingName ? current : res.data.campaign.name));
      setLastUpdatedAt(new Date());
    } catch (err) {
      console.error(err);
      if (!silent) toast.error('Failed to load campaign');
    } finally {
      if (!silent) setLoading(false);
      if (statsRefresh) setIsStatsRefreshing(false);
    }
  }, [id, isEditingName]);

  const fetchRecipients = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoadingRecipients(true);
    try {
      const res = await api.get(`/campaigns/${id}/recipients?page=${recipientsPage}&limit=10`);
      setRecipientsData(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      if (!silent) setLoadingRecipients(false);
    }
  }, [id, recipientsPage]);

  useEffect(() => {
    fetchCampaign();
  }, [fetchCampaign]);

  useEffect(() => {
    fetchRecipients();
  }, [fetchRecipients]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      fetchCampaign({ silent: true, statsRefresh: true });
      fetchRecipients({ silent: true });
    }, 15000);

    return () => window.clearInterval(intervalId);
  }, [fetchCampaign, fetchRecipients]);

  // Click outside to close actions dropdown
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (actionsRef.current && !actionsRef.current.contains(event.target)) {
        setActionsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSaveName = async () => {
    if (!editedName.trim() || editedName === data.campaign.name) {
      setIsEditingName(false);
      return;
    }
    try {
      await api.patch(`/campaigns/${id}/name`, { name: editedName });
      setData(prev => ({ ...prev, campaign: { ...prev.campaign, name: editedName } }));
      setIsEditingName(false);
      toast.success('Campaign renamed');
    } catch {
      toast.error('Failed to rename campaign');
    }
  };

  const handleDuplicate = async () => {
    try {
      await api.post(`/campaigns/${id}/duplicate`);
      toast.success('Campaign duplicated! Check your campaigns list.');
      setActionsOpen(false);
    } catch {
      toast.error('Failed to duplicate campaign');
    }
  };

  const handleSaveAsTemplate = async () => {
    if (!templateName.trim()) {
      toast.error('Template name is required');
      return;
    }

    setIsSavingTemplate(true);
    try {
      await api.post(`/templates/from-campaign/${id}`, {
        name: templateName.trim(),
        description: templateDescription.trim()
      });
      toast.success('Campaign saved as template');
      setIsTemplateModalOpen(false);
      setTemplateName('');
      setTemplateDescription('');
      setActionsOpen(false);
    } catch {
      toast.error('Failed to save template');
    } finally {
      setIsSavingTemplate(false);
    }
  };

  const handleSendTestEmail = async () => {
    if (!testEmailAddress.trim()) {
      toast.error('Test email address is required');
      return;
    }

    setIsSendingTest(true);
    try {
      await api.post(`/campaigns/${id}/test`, { testEmail: testEmailAddress.trim() });
      toast.success('Test email sent successfully');
      setIsTestModalOpen(false);
    } catch {
      toast.error('Failed to send test email');
    } finally {
      setIsSendingTest(false);
    }
  };

  const handleBranchCampaign = async () => {
    // Automatically exclude anyone who has already replied, as retargeting them is generally a mistake
    // and explicitly requested by the user
    const unrepliedRecipients = filteredTrackingDetails.filter(r => r.status !== 'replied' && !r.replied);

    if (unrepliedRecipients.length === 0) {
      toast.error(filteredTrackingDetails.length > 0 
        ? 'All filtered recipients have already replied.' 
        : 'No recipients selected to branch'
      );
      return;
    }
    
    setIsBranching(true);
    try {
      const recipientIds = unrepliedRecipients.map(r => r._id);
      const res = await api.post(`/campaigns/${id}/retarget`, { recipientIds });
      toast.success('Branched campaign created successfully!');
      navigate(`/campaigns/new?id=${res.data.campaign._id}`);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to branch campaign');
    } finally {
      setIsBranching(false);
    }
  };

  const handleAddFollowUp = () => {
    if (data.campaign.status === 'sending') {
      toast.error('Please pause the campaign first to add a new follow-up step.');
      return;
    }
    
    markSequenceDirty();
    setData(prev => ({
      ...prev,
      campaign: {
        ...prev.campaign,
        followUps: [
          ...(prev.campaign.followUps || []),
          {
            order: (prev.campaign.followUps?.length || 0) + 1,
            subject: prev.campaign.subject || '',
            body: '',
            delayDays: 3,
            onlyIfNoReply: true,
            inSameThread: true,
            status: 'draft',
            attachments: [],
            excludedRecipients: []
          }
        ]
      }
    }));
  };

  const handleUpdateFollowUp = (index, updatedFollowUp) => {
    markSequenceDirty();
    const newFollowUps = [...(data.campaign.followUps || [])];
    newFollowUps[index] = {
      ...updatedFollowUp,
      subject: updatedFollowUp.inSameThread !== false ? data.campaign.subject || '' : updatedFollowUp.subject
    };
    setData(prev => ({ ...prev, campaign: { ...prev.campaign, followUps: newFollowUps } }));
  };

  const handleRemoveFollowUp = (index) => {
    const newFollowUps = [...(data.campaign.followUps || [])];
    const status = newFollowUps[index]?.status || 'draft';
    if (['scheduled', 'sending', 'completed', 'cancelled'].includes(status)) {
      toast.error('Scheduled or completed follow-ups must be cancelled instead of deleted.');
      return;
    }
    markSequenceDirty();
    newFollowUps.splice(index, 1);
    newFollowUps.forEach((f, i) => f.order = i + 1);
    setData(prev => ({ ...prev, campaign: { ...prev.campaign, followUps: newFollowUps } }));
  };

  const uploadFilesIfNeeded = async (files) => {
    if (!files || files.length === 0) return [];
    
    const existingFiles = files.filter(f => f.path);
    const newFiles = files.filter(f => !f.path);
    
    if (newFiles.length === 0) return existingFiles;
    
    const formData = new FormData();
    newFiles.forEach(file => {
      formData.append('files', file);
    });
    
    const res = await api.post('/uploads', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
    
    return [...existingFiles, ...res.data.files];
  };

  const handleSaveSequence = async () => {
    setIsSavingSequence(true);
    try {
      const followUps = await Promise.all((data.campaign.followUps || []).map(async (followUp, index) => ({
        ...followUp,
        order: index + 1,
        status: followUp.status || 'draft',
        subject: followUp.inSameThread !== false ? data.campaign.subject || '' : followUp.subject,
        attachments: await uploadFilesIfNeeded(followUp.attachments)
      })));
      await api.put(`/campaigns/${id}`, { followUps });
      clearSequenceDirty();
      await fetchCampaign({ silent: true });
      toast.success('Sequence draft saved');
    } catch {
      toast.error('Failed to save sequence');
    } finally {
      setIsSavingSequence(false);
    }
  };

  const handleScheduleFollowUps = async () => {
    let followUps;
    try {
      followUps = await Promise.all((data.campaign.followUps || []).map(async (followUp, index) => ({
        ...followUp,
        order: index + 1,
        status: followUp.status || 'draft',
        subject: followUp.inSameThread !== false ? data.campaign.subject || '' : followUp.subject,
        attachments: await uploadFilesIfNeeded(followUp.attachments)
      })));
    } catch (err) {
      toast.error('Failed to upload attachments');
      return;
    }

    const confirmableFollowUps = followUps.filter(followUp => CONFIRMABLE_FOLLOW_UP_STATUSES.includes(followUp.status));

    if (confirmableFollowUps.length === 0) {
      toast.error('Add a draft follow-up before scheduling.');
      return;
    }

    const invalidBodyIndex = followUps.findIndex(followUp => (
      CONFIRMABLE_FOLLOW_UP_STATUSES.includes(followUp.status) && isBlankHtml(followUp.body)
    ));
    if (invalidBodyIndex >= 0) {
      toast.error(`Follow-up ${invalidBodyIndex + 1} needs a message body before scheduling.`);
      return;
    }

    const invalidSubjectIndex = followUps.findIndex(followUp => (
      CONFIRMABLE_FOLLOW_UP_STATUSES.includes(followUp.status)
      && followUp.inSameThread === false
      && !followUp.subject?.trim()
    ));
    if (invalidSubjectIndex >= 0) {
      toast.error(`Follow-up ${invalidSubjectIndex + 1} needs a subject when it is not in the same thread.`);
      return;
    }

    setIsSchedulingFollowUps(true);
    try {
      const res = await api.post(`/campaigns/${id}/follow-ups/schedule`, { followUps });
      setData(prev => ({ ...prev, campaign: res.data.campaign }));
      clearSequenceDirty();
      toast.success(res.data.scheduledCount === 1 ? 'Follow-up scheduled' : `${res.data.scheduledCount} follow-ups scheduled`);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to schedule follow-ups');
    } finally {
      setIsSchedulingFollowUps(false);
    }
  };

  const handleCancelFollowUpSchedule = async (order) => {
    setCancellingFollowUpOrder(order);
    try {
      const res = await api.post(`/campaigns/${id}/follow-ups/${order}/cancel`);
      const cancelledFollowUp = res.data.campaign.followUps?.find(followUp => followUp.order === order);

      setData(prev => {
        const hasLocalSequenceEdits = isSequenceDirtyRef.current;
        if (!hasLocalSequenceEdits) return { ...prev, campaign: res.data.campaign };

        return {
          ...prev,
          campaign: {
            ...res.data.campaign,
            followUps: (prev.campaign.followUps || []).map(followUp => (
              (followUp.order || 0) === order && cancelledFollowUp
                ? {
                    ...followUp,
                    status: cancelledFollowUp.status,
                    cancelledAt: cancelledFollowUp.cancelledAt,
                    completedAt: cancelledFollowUp.completedAt
                  }
                : followUp
            ))
          }
        };
      });
      if (!isSequenceDirtyRef.current) clearSequenceDirty();
      toast.success('Follow-up schedule cancelled');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to cancel follow-up schedule');
    } finally {
      setCancellingFollowUpOrder(null);
    }
  };

  const handleTogglePause = async () => {
    try {
      if (data.campaign.status === 'sending' || data.campaign.status === 'scheduled') {
        await api.post(`/campaigns/${id}/pause`);
        setData(prev => ({ ...prev, campaign: { ...prev.campaign, status: 'paused' } }));
        toast.success('Campaign paused');
      } else if (data.campaign.status === 'paused') {
        const res = await api.post(`/campaigns/${id}/resume`);
        setData(prev => ({ ...prev, campaign: { ...prev.campaign, status: res.data.campaign.status } }));
        toast.success('Campaign resumed');
      }
    } catch {
      toast.error('Action failed');
    }
  };

  const getDerivedStatus = (c) => {
    if (c.status === 'sending') {
      if (c.autopilotState === 'sleeping_limit') return 'sleeping_limit';
      if (c.autopilotState === 'sleeping_window') return 'sleeping_window';
      return 'running';
    }
    return c.status;
  };

  const getStatusBadge = (camp) => {
    const derivedStatus = getDerivedStatus(camp);
    
    switch(derivedStatus) {
      case 'running':
        return (
          <div className="relative group cursor-help text-green-500 ml-3" title="Running">
            <span className="flex h-4 w-4 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-4 w-4 bg-green-500"></span>
            </span>
          </div>
        );
      case 'sleeping_limit':
        return (
          <div className="relative group cursor-help text-indigo-500 ml-3" title="Sleeping (Daily limit reached)">
            <Moon size={24} />
          </div>
        );
      case 'sleeping_window':
        return (
          <div className="relative group cursor-help text-indigo-500 ml-3" title="Sleeping (Outside schedule)">
            <Moon size={24} />
          </div>
        );
      case 'paused':
        return (
          <div className="relative group cursor-help text-red-500 ml-3" title="Paused">
            <Pause size={24} fill="currentColor" strokeWidth={0} />
          </div>
        );
      case 'scheduled':
        return (
          <div className="relative group cursor-help text-amber-500 ml-3" title="Scheduled">
            <Clock size={24} />
          </div>
        );
      case 'completed':
        return (
          <div className="relative group cursor-help text-emerald-500 ml-3" title="Completed">
            <CheckCircle2 size={24} />
          </div>
        );
      case 'draft':
      default:
        return (
          <div className="relative group cursor-help text-gray-400 ml-3" title="Draft">
            <FileText size={24} />
          </div>
        );
    }
  };

  if (loading) return (
    <div className="flex justify-center items-center h-[60vh]">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
    </div>
  );
  if (!data || !data.campaign) return <div className="text-center mt-20 text-gray-500">Campaign not found</div>;

  const { campaign, timeline, trackingDetails = [], rates = {} } = data;
  const { stats } = campaign;
  const followUps = campaign.followUps || [];
  const draftFollowUpCount = followUps.filter(followUp => ACTIVE_DRAFT_FOLLOW_UP_STATUSES.includes(followUp.status || 'draft')).length;
  const scheduledFollowUpCount = followUps.filter(followUp => followUp.status === 'scheduled').length;
  const confirmableFollowUpCount = followUps.filter(followUp => CONFIRMABLE_FOLLOW_UP_STATUSES.includes(followUp.status || 'draft')).length;
  const shouldShowSchedulePanel = followUps.length > 0 && (isSequenceDirty || draftFollowUpCount > 0 || scheduledFollowUpCount > 0);
  const canConfirmFollowUps = confirmableFollowUpCount > 0;
  const scheduleActionLabel = scheduledFollowUpCount > 0
    ? 'Update follow-up schedule'
    : draftFollowUpCount === 1
      ? 'Schedule follow-up'
      : `Schedule ${draftFollowUpCount || confirmableFollowUpCount} follow-ups`;
  const campaignTimezone = campaign.schedule?.timezone || campaign.schedule?.autopilot?.timezone;
  const delayMinutes = campaign.schedule?.autopilot?.enabled
    ? campaign.schedule?.autopilot?.delayMinutes
    : campaign.schedule?.delayMinutes;
    
  const filteredTrackingDetails = trackingDetails.filter(recipient => {
    if (trackingFilter === 'All') return true;
    if (trackingFilter === 'Opened') return recipient.opened;
    if (trackingFilter === 'Clicked') return recipient.clicked;
    if (trackingFilter === 'Replied') return recipient.replied;
    return recipient.status === trackingFilter.toLowerCase();
  });
  const visibleTrackingDetails = showAllTracking ? filteredTrackingDetails : filteredTrackingDetails.slice(0, 6);

  return (
    <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
      <div className="mb-8">
        <Link to="/campaigns" className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900 mb-6 transition-colors">
          <ArrowLeft size={16} /> Back to campaigns
        </Link>
        
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <div className="flex items-center gap-4">
              {isEditingName ? (
                <div className="flex items-center gap-2">
                  <input 
                    type="text" 
                    value={editedName} 
                    onChange={e => setEditedName(e.target.value)}
                    className="text-2xl font-bold border-b-2 border-blue-600 outline-none bg-transparent px-1 py-0.5"
                    autoFocus
                    onBlur={handleSaveName}
                    onKeyDown={e => e.key === 'Enter' && handleSaveName()}
                  />
                </div>
              ) : (
                <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3 group">
                  {campaign.name}
                  <button onClick={() => setIsEditingName(true)} className="text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity hover:text-blue-600">
                    <Edit2 size={18} />
                  </button>
                </h1>
              )}
              {getStatusBadge(campaign)}
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 mt-2 w-full">
              <div className="flex items-center gap-1.5 text-gray-500" title={!delayMinutes ? 'Burst mode' : 'Time gap between emails'}>
                {!delayMinutes ? (
                  <>
                    <Zap size={16} className="text-amber-500" />
                    <span className="text-[12px] leading-none font-medium text-amber-600 mt-0.5">Burst</span>
                  </>
                ) : (
                  <>
                    <Clock size={16} />
                    <span className="text-[12px] leading-none font-medium mt-0.5">{delayMinutes} min</span>
                  </>
                )}
              </div>

              {campaign.status === 'scheduled' && campaign.schedule?.sendAt && (
                <div className="text-sm font-medium text-amber-700 flex items-center gap-1.5">
                  <Clock size={14} /> Scheduled for: {new Date(campaign.schedule.sendAt).toLocaleString()}
                </div>
              )}
            </div>
            <div className="text-xs flex gap-2 mt-2 items-center text-gray-500">
              <button onClick={fetchCampaign} className="btn-outline flex items-center gap-1.5 px-2 py-1">
                <RefreshCw size={14} className={isStatsRefreshing ? "animate-spin" : ""} /> Refresh
              </button>
              <button onClick={() => setIsSettingsModalOpen(true)} className="btn-outline flex items-center gap-1.5 px-2 py-1">
                <Settings size={14} /> Edit Settings
              </button>
              {lastUpdatedAt && <span>- Updated {lastUpdatedAt.toLocaleTimeString()}</span>}
            </div>
          </div>

          <div className="relative flex flex-col items-end gap-3" ref={actionsRef}>
            <div className="hidden sm:flex text-sm text-gray-400 font-medium items-center gap-1.5 whitespace-nowrap">
              <Clock size={14} /> Created: {campaign.startedAt || campaign.createdAt ? new Date(campaign.startedAt || campaign.createdAt).toLocaleString() : 'Not started'}
            </div>
            <button 
              className="btn-outline gap-2 bg-white shadow-sm"
              onClick={() => setActionsOpen(!actionsOpen)}
            >
              Actions <MoreHorizontal size={16} />
            </button>
            {actionsOpen && (
              <div className="absolute right-0 mt-2 w-48 bg-white rounded-xl shadow-lg border border-gray-100 py-1 z-10">
                <button 
                  onClick={handleDuplicate}
                  className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                >
                  <Copy size={16} className="text-gray-400" /> Duplicate Campaign
                </button>
                <button
                  onClick={() => {
                    setTemplateName(campaign.name ? `${campaign.name} template` : '');
                    setIsTemplateModalOpen(true);
                  }}
                  className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                >
                  <LayoutTemplate size={16} className="text-gray-400" /> Save as Template
                </button>
                <button
                  onClick={() => {
                    setTestEmailAddress('');
                    setIsTestModalOpen(true);
                    setActionsOpen(false);
                  }}
                  className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                >
                  <Mail size={16} className="text-gray-400" /> Send Test Email
                </button>
                {(['scheduled', 'sending', 'paused'].includes(campaign.status)) && (
                  <button 
                    onClick={handleTogglePause}
                    className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                  >
                    {campaign.status === 'sending' || campaign.status === 'scheduled' ? (
                      <><Pause size={16} className="text-gray-400" /> Pause Campaign</>
                    ) : (
                      <><Play size={16} className="text-gray-400" /> Resume Campaign</>
                    )}
                  </button>
                )}
                {/* Future actions can go here */}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="stat-card">
          <div className="text-3xl mb-2">🚀</div>
          <div className="text-sm font-medium text-gray-500">Emails sent</div>
          {isStatsRefreshing ? (
            <div className="h-8 w-14 rounded-md bg-gray-200 animate-pulse mt-2" aria-label="Refreshing sent count" />
          ) : (
            <div className="text-2xl font-bold text-gray-900 mt-1">{stats.sent}</div>
          )}
        </div>
        <div className="stat-card">
          <div className="text-3xl mb-2">👀</div>
          <div className="text-sm font-medium text-gray-500">Opens</div>
          {isStatsRefreshing ? (
            <div className="h-8 w-14 rounded-md bg-gray-200 animate-pulse mt-2" aria-label="Refreshing open count" />
          ) : (
            <div className="text-2xl font-bold text-gray-900 mt-1">{stats.opened}</div>
          )}
          <div className="text-xs text-gray-500 mt-1">{rates.openRate || '0.0'}% open rate</div>
        </div>
        <div className="stat-card">
          <div className="text-3xl mb-2">🖱️</div>
          <div className="text-sm font-medium text-gray-500">Clicks</div>
          {isStatsRefreshing ? (
            <div className="h-8 w-14 rounded-md bg-gray-200 animate-pulse mt-2" aria-label="Refreshing click count" />
          ) : (
            <div className="text-2xl font-bold text-gray-900 mt-1">{stats.clicked}</div>
          )}
          <div className="text-xs text-gray-500 mt-1">{rates.clickRate || '0.0'}% click rate</div>
        </div>
        <div className="stat-card">
          <div className="text-3xl mb-2">↩</div>
          <div className="text-sm font-medium text-gray-500">Replies</div>
          {isStatsRefreshing ? (
            <div className="h-8 w-14 rounded-md bg-gray-200 animate-pulse mt-2" aria-label="Refreshing reply count" />
          ) : (
            <div className="text-2xl font-bold text-gray-900 mt-1">{stats.replied}</div>
          )}
          <div className="text-xs text-gray-500 mt-1">{rates.replyRate || '0.0'}% reply rate</div>
        </div>
      </div>

      {campaign.autopilotStatus && (
        <div className="mb-8 card shadow-sm border-l-4 border-l-blue-500 overflow-hidden">
          <div className="px-6 py-5 bg-white flex items-start sm:items-center gap-4">
            <div className="p-3 bg-blue-50 text-blue-600 rounded-xl">
              <Clock size={24} />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                Autopilot Status
                {campaign.autopilotStatus.isRunning ? (
                  <span className="inline-flex items-center gap-1.5 py-1 px-2.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                    Running
                  </span>
                ) : campaign.autopilotState?.startsWith('sleeping') ? (
                  <span className="inline-flex items-center gap-1.5 py-1 px-2.5 rounded-full text-xs font-semibold bg-indigo-100 text-indigo-700">
                    <Moon size={12} className="text-indigo-500" />
                    Sleeping
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 py-1 px-2.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                    Paused
                  </span>
                )}
              </h3>
              <p className="text-sm text-gray-500 mt-1.5">
                {campaign.autopilotStatus.maxPerDay > 0 ? `Daily limit: ${campaign.autopilotStatus.maxPerDay} emails.` : 'No daily limit set.'} 
                {' '}<strong>{campaign.autopilotStatus.sentToday}</strong> sent today.
                {!campaign.autopilotStatus.isRunning && campaign.autopilotStatus.nextRun && (
                   <span className="ml-1 text-amber-600 font-medium">
                     Resumes at {formatDateTime(campaign.autopilotStatus.nextRun)}
                   </span>
                )}
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="mb-8 card shadow-sm">
        <div className="px-6 py-5 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-gray-50/50 rounded-t-xl">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Tracking Details</h3>
            <p className="text-sm text-gray-500 mt-1">Recipient-level engagement with opens, clicks, replies, and last activity timestamps.</p>
          </div>
          <div className="flex items-center gap-2">
            <button 
              className="btn-outline text-sm gap-2" 
              onClick={handleBranchCampaign}
              disabled={isBranching || filteredTrackingDetails.length === 0}
            >
              {isBranching ? <Loader2 size={16} className="animate-spin" /> : <GitBranch size={16} />}
              Branch Filtered
            </button>
            <select
              className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
              value={trackingFilter}
              onChange={(e) => setTrackingFilter(e.target.value)}
            >
              <option>All</option>
              <option>Opened</option>
              <option>Clicked</option>
              <option>Replied</option>
              <option>sent</option>
              <option>pending</option>
              <option>failed</option>
            </select>
            {filteredTrackingDetails.length > 6 && (
              <button className="btn-outline text-sm gap-2" onClick={() => setShowAllTracking(prev => !prev)}>
                {showAllTracking ? 'Show less' : 'View all'} <ChevronDown size={16} />
              </button>
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-white text-gray-500 uppercase text-xs font-semibold border-b border-gray-100">
              <tr>
                <th className="px-6 py-4">Recipient</th>
                <th className="px-6 py-4 text-center">Opens</th>
                <th className="px-6 py-4 text-center">Clicks</th>
                <th className="px-6 py-4 text-center">Reply</th>
                <th className="px-6 py-4">Last opened</th>
                <th className="px-6 py-4">Last clicked</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {visibleTrackingDetails.length > 0 ? (
                visibleTrackingDetails.map(recipient => (
                  <tr key={recipient._id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="font-medium text-gray-900">{recipient.name || recipient.email}</div>
                      <div className="text-xs text-gray-500">{recipient.email}</div>
                      {recipient.role && <div className="text-xs text-blue-700 mt-1">{recipient.role}</div>}
                    </td>
                    <td className="px-6 py-4 text-center font-semibold text-gray-900">{recipient.openCount}</td>
                    <td className="px-6 py-4 text-center font-semibold text-gray-900">{recipient.clickCount}</td>
                    <td className="px-6 py-4 text-center">
                      {recipient.replied ? (
                        <span className="inline-flex justify-center text-emerald-600"><Reply size={18} /></span>
                      ) : (
                        <span className="text-gray-300">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-gray-600">{recipient.lastOpenedAt ? formatDateTime(recipient.lastOpenedAt, campaignTimezone) : '-'}</td>
                    <td className="px-6 py-4 text-gray-600">{recipient.lastClickedAt ? formatDateTime(recipient.lastClickedAt, campaignTimezone) : '-'}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="6" className="px-6 py-10 text-center text-gray-500">
                    No tracking activity matches this filter yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Sequence Builder Section */}
      <div className="mb-8 card shadow-sm flex flex-col">
        <div className="px-6 py-5 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-gray-50/50 rounded-t-xl">
          <button
            className="text-left flex items-start gap-3 min-w-0"
            onClick={() => setIsSequenceExpanded(prev => !prev)}
            aria-expanded={isSequenceExpanded}
          >
            <span className="h-8 w-8 rounded-lg bg-white border border-gray-200 text-gray-500 inline-flex items-center justify-center shrink-0 mt-0.5">
              {isSequenceExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
            </span>
            <span className="min-w-0">
              <span className="block text-lg font-semibold text-gray-900">Sequence Timeline</span>
              <span className="block text-sm text-gray-500 mt-0.5">
                1 main email{followUps.length ? ` + ${followUps.length} follow-up${followUps.length === 1 ? '' : 's'}` : ''}
              </span>
              <span className="mt-2 flex flex-wrap gap-2">
                {scheduledFollowUpCount > 0 && (
                  <span className="inline-flex text-xs font-medium text-indigo-700 bg-indigo-50 border border-indigo-100 rounded-full px-2 py-0.5">
                    {scheduledFollowUpCount} scheduled
                  </span>
                )}
                {draftFollowUpCount > 0 && (
                  <span className="inline-flex text-xs font-medium text-gray-700 bg-gray-50 border border-gray-200 rounded-full px-2 py-0.5">
                    {draftFollowUpCount} draft
                  </span>
                )}
                {isSequenceDirty && (
                  <span className="inline-flex text-xs font-medium text-amber-700 bg-amber-50 border border-amber-100 rounded-full px-2 py-0.5">
                    Unsaved changes
                  </span>
                )}
              </span>
            </span>
          </button>
          {isSequenceExpanded && (
            <button 
              className="btn-outline py-1.5 px-3 flex items-center gap-2 text-sm self-start sm:self-auto bg-white"
              onClick={handleSaveSequence}
              disabled={isSavingSequence}
            >
              <Save size={16} /> {isSavingSequence ? 'Saving...' : 'Save Draft'}
            </button>
          )}
        </div>
        
        {isSequenceExpanded && (
          <div className="p-6 bg-gray-50/30">
            {/* Main Email */}
            <div className="card bg-white shadow-sm border border-gray-200 flex flex-col mb-4 overflow-hidden">
              <div className="flex items-center justify-between p-3 bg-blue-50/50 border-b border-blue-100">
                <div className="text-blue-900 text-sm font-semibold flex items-center gap-2">
                  <Mail size={16} className="text-blue-500" /> Step 1 (Main Email)
                </div>
              </div>
              <div className="flex border-b border-gray-100">
                <div className="w-24 px-4 py-3 text-sm font-medium text-gray-500 border-r border-gray-100 flex items-center">Subject:</div>
                <input 
                  type="text" 
                  className="flex-1 px-4 py-3 text-sm text-gray-900 outline-none font-medium bg-transparent" 
                  value={campaign.subject}
                  disabled
                />
              </div>
              <div className="flex-1 relative">
                <ComposeEditor value={campaign.body} isReadOnly={true} />
                <div className="absolute inset-0 bg-transparent cursor-not-allowed"></div>
              </div>
              <AttachmentViewer attachments={campaign.attachments} />
            </div>

            {/* Follow Ups */}
            {followUps.map((followUp, index) => (
              <FollowUpEditor 
                key={`followup-${index}`}
                followUp={followUp}
                index={index}
                onUpdate={handleUpdateFollowUp}
                onRemove={handleRemoveFollowUp}
                availablePlaceholders={[]} // Placeholders can be empty or extracted from campaign if needed
                recipientsData={recipientsData.recipients}
                isReadOnly={LOCKED_FOLLOW_UP_STATUSES.includes(followUp.status)}
                mainSubject={campaign.subject}
                onCancelSchedule={handleCancelFollowUpSchedule}
                isCancellingSchedule={cancellingFollowUpOrder === (followUp.order || index + 1)}
              />
            ))}

            {shouldShowSchedulePanel && (
              <div className="mb-4 rounded-xl border border-indigo-100 bg-white p-4 shadow-sm">
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="h-8 w-8 rounded-lg bg-indigo-50 text-indigo-600 inline-flex items-center justify-center">
                        <CalendarCheck size={17} />
                      </span>
                      <span className="text-sm font-semibold text-gray-900">Follow-up scheduling</span>
                      {draftFollowUpCount > 0 && (
                        <span className="text-xs font-medium text-gray-700 bg-gray-100 border border-gray-200 rounded-full px-2 py-0.5">
                          {draftFollowUpCount} draft
                        </span>
                      )}
                      {scheduledFollowUpCount > 0 && (
                        <span className="text-xs font-medium text-indigo-700 bg-indigo-50 border border-indigo-100 rounded-full px-2 py-0.5">
                          {scheduledFollowUpCount} scheduled
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-500 mt-2">
                      Saving keeps the timeline as a draft. Scheduling confirms the follow-up rules and moves this campaign into the scheduled queue.
                    </p>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2 shrink-0">
                    {isSequenceDirty && (
                      <button
                        className="btn-outline bg-white gap-2 justify-center"
                        onClick={handleSaveSequence}
                        disabled={isSavingSequence || isSchedulingFollowUps}
                      >
                        <Save size={16} /> {isSavingSequence ? 'Saving...' : 'Save Draft'}
                      </button>
                    )}
                    {(draftFollowUpCount > 0 || isSequenceDirty) && (
                      <button
                        className="btn-primary gap-2 justify-center"
                        onClick={handleScheduleFollowUps}
                        disabled={!canConfirmFollowUps || isSchedulingFollowUps}
                      >
                        {isSchedulingFollowUps ? <Loader2 size={16} className="animate-spin" /> : <CalendarCheck size={16} />}
                        {isSchedulingFollowUps ? 'Scheduling...' : scheduleActionLabel}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}

            <button 
              className={`flex items-center justify-center gap-2 w-full py-4 border-2 border-dashed rounded-xl font-medium transition-colors ${
                campaign.status === 'sending' 
                  ? 'border-gray-200 text-gray-400 cursor-not-allowed bg-gray-50'
                  : 'border-blue-200 text-blue-600 hover:border-blue-300 hover:bg-blue-50'
              }`}
              onClick={handleAddFollowUp}
              title={campaign.status === 'sending' ? 'Pause campaign to add follow-up' : ''}
            >
              <Plus size={18} /> Add a follow-up email
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2">
          <div className="card shadow-sm h-full flex flex-col">
            <div className="px-6 py-5 border-b border-gray-100 flex justify-between items-center bg-gray-50/50 rounded-t-xl">
              <h3 className="text-lg font-semibold text-gray-900">Recipients</h3>
              <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full text-xs font-medium">
                {recipientsData.total} Total
              </span>
            </div>
            
            <div className="overflow-x-auto flex-1">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 text-gray-500 uppercase text-xs font-semibold">
                  <tr>
                    <th className="px-6 py-4">Email</th>
                    <th className="px-6 py-4">Status</th>
                    <th className="px-6 py-4 text-center">Sent At</th>
                    <th className="px-6 py-4 text-center">Opened</th>
                    <th className="px-6 py-4 text-center">Clicked</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {loadingRecipients ? (
                    <tr>
                      <td colSpan="4" className="px-6 py-12 text-center text-gray-500">
                        <div className="flex flex-col items-center justify-center gap-3">
                          <Loader2 className="animate-spin text-gray-400" size={24} />
                          <span>Loading recipients...</span>
                        </div>
                      </td>
                    </tr>
                  ) : recipientsData.recipients.length > 0 ? (
                    recipientsData.recipients.map(r => (
                      <tr key={r._id} className="hover:bg-gray-50/50 transition-colors">
                        <td className="px-6 py-4 font-medium text-gray-900">{r.email}</td>
                        <td className="px-6 py-4">
                          <span className={`px-2.5 py-1 rounded-md text-xs font-medium capitalize inline-flex items-center gap-1.5
                            ${r.status === 'sent' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 
                              r.status === 'pending' ? 'bg-amber-50 text-amber-700 border border-amber-200' : 
                              r.status === 'opened' ? 'bg-blue-50 text-blue-700 border border-blue-200' :
                              'bg-red-50 text-red-700 border border-red-200'}`}>
                            {r.status === 'sent' && <CheckCircle2 size={12} />}
                            {r.status === 'opened' && <Eye size={12} />}
                            {r.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-center text-xs text-gray-500 font-medium">
                          {r.mainEmail?.sentAt ? formatDateTime(r.mainEmail.sentAt, campaignTimezone) : '-'}
                        </td>
                        <td className="px-6 py-4 text-center">
                          {r.mainEmail?.opened ? <span className="text-emerald-500 flex justify-center"><CheckCircle2 size={18}/></span> : <span className="text-gray-300">-</span>}
                        </td>
                        <td className="px-6 py-4 text-center">
                          {r.mainEmail?.clicked ? <span className="text-emerald-500 flex justify-center"><CheckCircle2 size={18}/></span> : <span className="text-gray-300">-</span>}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="4" className="px-6 py-12 text-center text-gray-500 bg-gray-50/30">
                        No recipients found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            
            {recipientsData.pages > 1 && (
              <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between bg-gray-50/30 rounded-b-xl">
                <button 
                  className="btn-outline text-sm px-3 py-1.5" 
                  disabled={recipientsPage === 1}
                  onClick={() => setRecipientsPage(p => p - 1)}
                >
                  Previous
                </button>
                <span className="text-sm font-medium text-gray-600">
                  Page {recipientsData.page} of {recipientsData.pages}
                </span>
                <button 
                  className="btn-outline text-sm px-3 py-1.5" 
                  disabled={recipientsPage === recipientsData.pages}
                  onClick={() => setRecipientsPage(p => p + 1)}
                >
                  Next
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="lg:col-span-1">
          <div className="card shadow-sm h-full flex flex-col">
            <div className="px-6 py-5 border-b border-gray-100 bg-gray-50/50 rounded-t-xl">
              <h3 className="text-lg font-semibold text-gray-900">Activity Timeline</h3>
            </div>
            
            <div className="p-6 flex-1 overflow-y-auto max-h-[600px]">
              {timeline.length > 0 ? (
                <div className="relative border-l-2 border-gray-200 ml-3 space-y-8 pb-4">
                  {timeline.map((event) => (
                    <div key={event._id} className="relative pl-6">
                      <div className="absolute -left-[9px] top-1 bg-white rounded-full p-0.5 border-2 border-gray-200">
                        <div className={`w-3 h-3 rounded-full ${
                          event.type === 'open' ? 'bg-blue-500' : 
                          event.type === 'click' ? 'bg-emerald-500' : 'bg-amber-500'
                        }`} />
                      </div>
                      
                      <div className="flex flex-col gap-1">
                        <div className="text-sm font-medium text-gray-900">
                          {event.type === 'open' && 'Mail opened'}
                          {event.type === 'click' && 'Link clicked'}
                          {event.type === 'reply' && 'Reply received'}
                        </div>
                        <div className="text-xs text-gray-500 flex items-center gap-1.5">
                          <Clock size={12} />
                          {new Date(event.createdAt).toLocaleString()}
                        </div>
                        {event.recipientId && (
                          <div className="text-sm text-gray-600 mt-1.5 bg-gray-50 p-2 rounded-md border border-gray-100 inline-block">
                            {event.recipientId.email}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center text-center h-48 space-y-3">
                  <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center">
                    <Clock className="text-gray-400" size={24} />
                  </div>
                  <div className="text-gray-500 text-sm">No activity recorded yet.<br/>Events will appear here as recipients engage.</div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <Modal
        isOpen={isTemplateModalOpen}
        onClose={() => setIsTemplateModalOpen(false)}
        title="Save campaign as template"
        size="sm"
        footer={(
          <>
            <button className="btn-outline" onClick={() => setIsTemplateModalOpen(false)}>Cancel</button>
            <button className="btn-primary gap-2" onClick={handleSaveAsTemplate} disabled={isSavingTemplate}>
              <LayoutTemplate size={16} /> {isSavingTemplate ? 'Saving...' : 'Save template'}
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
              placeholder="Backend recruiter outreach"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Description</label>
            <textarea
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 resize-none"
              rows={3}
              value={templateDescription}
              onChange={(e) => setTemplateDescription(e.target.value)}
              placeholder="Optional notes about when this template should be reused"
            />
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={isTestModalOpen}
        onClose={() => setIsTestModalOpen(false)}
        title="Send Test Email"
        size="sm"
        footer={(
          <>
            <button className="btn-outline" onClick={() => setIsTestModalOpen(false)}>Cancel</button>
            <button className="btn-primary gap-2" onClick={handleSendTestEmail} disabled={isSendingTest}>
              <Mail size={16} /> {isSendingTest ? 'Sending...' : 'Send Test'}
            </button>
          </>
        )}
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-500">
            Send a test email for this campaign. The email will use placeholder data from the first recipient in your list.
          </p>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Test recipient email</label>
            <input
              type="email"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
              value={testEmailAddress}
              onChange={(e) => setTestEmailAddress(e.target.value)}
              placeholder="you@example.com"
              onKeyDown={(e) => e.key === 'Enter' && handleSendTestEmail()}
            />
          </div>
        </div>
      </Modal>
      <CampaignSettingsModal 
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        campaign={data?.campaign}
        onUpdate={(updatedCampaign) => {
          setData(prev => ({
            ...prev,
            campaign: {
              ...prev.campaign,
              schedule: updatedCampaign.schedule,
              companyName: updatedCampaign.companyName,
              roleName: updatedCampaign.roleName
            }
          }));
          fetchCampaign({ silent: true });
        }}
      />
    </div>
  );
};

export default CampaignDetailPage;
