import React, { useEffect, useState, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import api from '../api';
import { Mail, Eye, MousePointerClick, ArrowLeft, MoreHorizontal, Copy, Edit2, Play, Pause, Trash2, CheckCircle2, Clock } from 'lucide-react';
import toast from 'react-hot-toast';

const CampaignDetailPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  
  const [recipientsData, setRecipientsData] = useState({ recipients: [], total: 0, page: 1, pages: 1 });
  const [recipientsPage, setRecipientsPage] = useState(1);
  const [loadingRecipients, setLoadingRecipients] = useState(true);

  // Edit Name State
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState('');
  const [actionsOpen, setActionsOpen] = useState(false);
  const actionsRef = useRef(null);

  useEffect(() => {
    const fetchCampaign = async () => {
      try {
        const res = await api.get(`/analytics/campaigns/${id}`);
        setData(res.data);
        setEditedName(res.data.campaign.name);
      } catch (err) {
        console.error(err);
        toast.error('Failed to load campaign');
      } finally {
        setLoading(false);
      }
    };
    fetchCampaign();
  }, [id]);

  useEffect(() => {
    const fetchRecipients = async () => {
      setLoadingRecipients(true);
      try {
        const res = await api.get(`/campaigns/${id}/recipients?page=${recipientsPage}&limit=10`);
        setRecipientsData(res.data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoadingRecipients(false);
      }
    };
    fetchRecipients();
  }, [id, recipientsPage]);

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
    } catch (err) {
      toast.error('Failed to rename campaign');
    }
  };

  const handleDuplicate = async () => {
    try {
      await api.post(`/campaigns/${id}/duplicate`);
      toast.success('Campaign duplicated! Check your campaigns list.');
      setActionsOpen(false);
    } catch (err) {
      toast.error('Failed to duplicate campaign');
    }
  };

  const getStatusBadge = (status) => {
    const styles = {
      draft: 'bg-gray-100 text-gray-700',
      scheduled: 'bg-amber-100 text-amber-700',
      sending: 'bg-blue-100 text-blue-700',
      paused: 'bg-red-100 text-red-700',
      completed: 'bg-emerald-100 text-emerald-700',
      failed: 'bg-red-100 text-red-800'
    };
    return (
      <span className={`px-3 py-1 rounded-full text-xs font-semibold capitalize ${styles[status] || styles.draft}`}>
        {status}
      </span>
    );
  };

  if (loading) return (
    <div className="flex justify-center items-center h-[60vh]">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
    </div>
  );
  if (!data || !data.campaign) return <div className="text-center mt-20 text-gray-500">Campaign not found</div>;

  const { campaign, timeline } = data;
  const { stats } = campaign;

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
              {getStatusBadge(campaign.status)}
            </div>
            <div className="text-sm text-gray-500 mt-2 flex items-center gap-2">
              <Clock size={14} /> Created: {new Date(campaign.startedAt || Date.now()).toLocaleString()}
            </div>
          </div>

          <div className="relative" ref={actionsRef}>
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
          <div className="text-2xl font-bold text-gray-900 mt-1">{stats.sent}</div>
        </div>
        <div className="stat-card">
          <div className="text-3xl mb-2">👀</div>
          <div className="text-sm font-medium text-gray-500">Opens</div>
          <div className="text-2xl font-bold text-gray-900 mt-1">{stats.opened}</div>
        </div>
        <div className="stat-card">
          <div className="text-3xl mb-2">🖱️</div>
          <div className="text-sm font-medium text-gray-500">Clicks</div>
          <div className="text-2xl font-bold text-gray-900 mt-1">{stats.clicked}</div>
        </div>
        <div className="stat-card">
          <div className="text-3xl mb-2">❌</div>
          <div className="text-sm font-medium text-gray-500">Bounced</div>
          <div className="text-2xl font-bold text-gray-900 mt-1">{stats.bounced}</div>
        </div>
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
                  {timeline.map((event, index) => (
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
    </div>
  );
};

export default CampaignDetailPage;
