import { useCallback, useEffect, useState } from 'react';
import { LayoutTemplate, Search, Mail, Clock, Trash2, ArrowRight, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../api';
import { useDraft } from '../context/DraftContext';

const TemplatesPage = () => {
  const navigate = useNavigate();
  const { setCampaign } = useDraft();
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  const fetchTemplates = useCallback(async () => {
    setLoading(true);
    try {
      const params = searchTerm.trim() ? `?search=${encodeURIComponent(searchTerm.trim())}` : '';
      const res = await api.get(`/templates${params}`);
      setTemplates(res.data.templates || []);
    } catch {
      toast.error('Failed to load templates');
    } finally {
      setLoading(false);
    }
  }, [searchTerm]);

  useEffect(() => {
    const timeout = window.setTimeout(fetchTemplates, 200);
    return () => window.clearTimeout(timeout);
  }, [fetchTemplates]);

  const applyTemplate = (template) => {
    setCampaign(prev => ({
      ...prev,
      name: template.name,
      subject: template.subject,
      body: template.body,
      followUps: (template.followUps || []).map((followUp, index) => ({
        order: index + 1,
        subject: followUp.subject || '',
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
    toast.success(`Template "${template.name}" loaded`);
    navigate('/campaigns/new');
  };

  const deleteTemplate = async (templateId) => {
    try {
      await api.delete(`/templates/${templateId}`);
      setTemplates(prev => prev.filter(template => template._id !== templateId));
      toast.success('Template deleted');
    } catch {
      toast.error('Failed to delete template');
    }
  };

  return (
    <div className="max-w-6xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Templates</h1>
          <p className="text-sm text-gray-500 mt-1">Reusable cold email subjects, bodies, and follow-up sequences.</p>
        </div>
        <button className="btn-primary gap-2 shadow-sm" onClick={() => navigate('/campaigns/new')}>
          <LayoutTemplate size={18} /> Compose from template
        </button>
      </div>

      <div className="card p-4 mb-6">
        <div className="relative">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            className="w-full pl-10 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
            placeholder="Search templates by name or description..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center items-center h-[40vh]">
          <Loader2 className="animate-spin text-blue-600" size={32} />
        </div>
      ) : templates.length === 0 ? (
        <div className="card p-12 text-center border-dashed border-2">
          <div className="mx-auto w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
            <LayoutTemplate size={32} className="text-gray-400" />
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-1">No templates found</h3>
          <p className="text-gray-500 mb-6 max-w-md mx-auto">
            Save a campaign or draft as a template, then reuse it across companies and targeted roles.
          </p>
          <button className="btn-primary" onClick={() => navigate('/campaigns/new')}>Create in composer</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {templates.map(template => (
            <div key={template._id} className="card p-5 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between gap-4 mb-4">
                <div className="min-w-0">
                  <h2 className="text-lg font-semibold text-gray-900 truncate">{template.name}</h2>
                  {template.description && (
                    <p className="text-sm text-gray-500 mt-1 line-clamp-2">{template.description}</p>
                  )}
                </div>
                <button
                  className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  onClick={() => deleteTemplate(template._id)}
                  title="Delete template"
                >
                  <Trash2 size={17} />
                </button>
              </div>

              <div className="rounded-xl border border-gray-100 bg-gray-50 p-4 mb-4">
                <div className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
                  <Mail size={15} className="text-blue-600" /> {template.subject || 'No subject'}
                </div>
                <div
                  className="text-sm text-gray-500 line-clamp-3"
                  dangerouslySetInnerHTML={{ __html: template.body || '<p>Empty body</p>' }}
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
                  <span className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 rounded">
                    <Clock size={12} /> {template.followUps?.length || 0} follow-up{template.followUps?.length === 1 ? '' : 's'}
                  </span>
                  {template.tags?.filter(Boolean).map(tag => (
                    <span key={tag} className="px-2 py-1 bg-blue-50 text-blue-700 rounded">{tag}</span>
                  ))}
                </div>
                <button className="btn-outline text-sm gap-2" onClick={() => applyTemplate(template)}>
                  Use template <ArrowRight size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default TemplatesPage;
