import { useState } from 'react';
import { Paperclip, X, Clock, MessageSquareOff, Trash2, Users, Calendar, Link, Maximize2, Reply, CalendarX, Loader2 } from 'lucide-react';
import ComposeEditor from './ComposeEditor';
import ExcludeRecipientsModal from './ExcludeRecipientsModal';
import FollowUpScheduleModal from './FollowUpScheduleModal';
import AttachmentViewer from './AttachmentViewer';
import Toggle from '../common/Toggle';

const FOLLOW_UP_STATUS_STYLES = {
  draft: 'bg-gray-100 text-gray-700 border-gray-200',
  pending: 'bg-amber-50 text-amber-700 border-amber-200',
  scheduled: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  sending: 'bg-blue-50 text-blue-700 border-blue-200',
  completed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  cancelled: 'bg-red-50 text-red-700 border-red-200'
};

const FollowUpEditor = ({ 
  followUp, 
  index, 
  onUpdate, 
  onRemove, 
  availablePlaceholders, 
  recipientsData, 
  isReadOnly,
  isCompact = false,
  isActive = false,
  onOpen,
  mainSubject = '',
  onCancelSchedule,
  isCancellingSchedule = false
}) => {
  const [isExcludeModalOpen, setIsExcludeModalOpen] = useState(false);
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);

  const status = followUp.status || 'draft';
  const usesMainSubject = followUp.inSameThread !== false;
  const visibleSubject = usesMainSubject ? mainSubject || followUp.subject || '' : followUp.subject || '';
  const canCancelSchedule = status === 'scheduled' && Boolean(onCancelSchedule);
  const canRemove = !isReadOnly && !['scheduled', 'sending', 'completed', 'cancelled'].includes(status);
  const statusBadge = followUp.status ? (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold capitalize ${FOLLOW_UP_STATUS_STYLES[status] || FOLLOW_UP_STATUS_STYLES.draft}`}>
      {status}
    </span>
  ) : null;

  const handleUpdate = (field, value) => {
    const nextFollowUp = { ...followUp, [field]: value };
    if (field === 'inSameThread' && value) {
      nextFollowUp.subject = mainSubject || '';
    }
    onUpdate(index, nextFollowUp);
  };

  const handleAttachment = (e) => {
    const files = Array.from(e.target.files);
    handleUpdate('attachments', [...(followUp.attachments || []), ...files]);
  };

  const removeAttachment = (idx) => {
    const newAttachments = [...(followUp.attachments || [])];
    newAttachments.splice(idx, 1);
    handleUpdate('attachments', newAttachments);
  };

  if (isCompact) {
    return (
      <div data-follow-up-index={index} className={`card bg-white shadow-sm border mb-3 last:mb-0 shrink-0 overflow-hidden transition-all ${
        isActive ? 'border-indigo-300 ring-2 ring-indigo-100 bg-indigo-50/30' : 'border-gray-200 hover:border-indigo-200'
      }`}>
        <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-3 p-3">
          <div className="min-w-0 flex-1">
            <button
              className="flex min-w-0 items-center gap-2 text-left"
              onClick={onOpen}
              type="button"
            >
              <span className={`h-8 w-8 rounded-lg inline-flex items-center justify-center shrink-0 ${
                isActive ? 'bg-indigo-600 text-white' : 'bg-indigo-50 text-indigo-600'
              }`}>
                <Reply size={16} />
              </span>
              <span className="min-w-0">
                <span className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-gray-900">Follow-up {index + 1}</span>
                  {statusBadge}
                  {isActive && (
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700">
                      Open
                    </span>
                  )}
                </span>
                <span className="block text-xs text-gray-500 truncate">
                  {usesMainSubject ? 'Subject: Same as main email' : `Subject: ${visibleSubject || 'No subject set'}`}
                </span>
              </span>
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-sm">
            <div className="flex items-center gap-2 rounded-lg border border-indigo-100 bg-indigo-50 px-2 py-1.5 text-indigo-900">
              <Clock size={15} className="text-indigo-500" />
              <span>Wait</span>
              <input 
                type="number" 
                min="1" 
                className="w-14 px-2 py-1 text-center bg-white border border-indigo-200 rounded-md focus:ring-2 focus:ring-indigo-500 outline-none"
                value={followUp.delayDays}
                onChange={(e) => handleUpdate('delayDays', parseInt(e.target.value) || 1)}
                disabled={isReadOnly}
              />
              <span>days</span>
            </div>

            <select 
              className="h-9 px-2 bg-white border border-gray-300 rounded-lg text-sm text-gray-700 focus:ring-2 focus:ring-indigo-500 outline-none"
              value={followUp.onlyIfNoReply ? 'no-reply' : 'always'}
              onChange={(e) => handleUpdate('onlyIfNoReply', e.target.value === 'no-reply')}
              disabled={isReadOnly}
              aria-label={`Follow-up ${index + 1} send condition`}
            >
              <option value="no-reply">If no reply</option>
              <option value="always">Always</option>
            </select>

            <div className="h-9 px-2 bg-white border border-gray-300 rounded-lg flex items-center gap-2 text-gray-700">
              <Link size={15} className="text-indigo-500" />
              <span className="text-sm">Same thread</span>
              <Toggle 
                checked={usesMainSubject}
                onChange={(val) => handleUpdate('inSameThread', val)}
                disabled={isReadOnly}
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button 
              className="h-9 px-3 inline-flex items-center justify-center gap-2 text-sm text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-100 rounded-lg transition-colors font-medium"
              onClick={onOpen}
              type="button"
              title={`Open follow-up ${index + 1}`}
            >
              <Maximize2 size={15} />
              Open
            </button>
            <button 
              className="relative h-9 w-9 inline-flex items-center justify-center text-indigo-600 hover:text-indigo-800 bg-white hover:bg-indigo-50 border border-gray-200 rounded-lg transition-colors"
              onClick={() => setIsScheduleModalOpen(true)}
              disabled={isReadOnly}
              title="Schedule & Autopilot"
            >
              <Calendar size={15} />
              {(followUp.schedule?.sendAt || followUp.schedule?.autopilot?.enabled) && (
                <span className="absolute mt-5 ml-5 w-2 h-2 bg-indigo-500 rounded-full"></span>
              )}
            </button>
            {canCancelSchedule && (
              <button
                className="h-9 px-3 inline-flex items-center justify-center gap-2 text-sm text-red-700 bg-red-50 hover:bg-red-100 border border-red-100 rounded-lg transition-colors font-medium disabled:opacity-60"
                onClick={() => onCancelSchedule(followUp.order || index + 1)}
                disabled={isCancellingSchedule}
                type="button"
                title={`Cancel scheduled follow-up ${index + 1}`}
              >
                {isCancellingSchedule ? <Loader2 size={15} className="animate-spin" /> : <CalendarX size={15} />}
                Cancel
              </button>
            )}
            <button 
              className="relative h-9 w-9 inline-flex items-center justify-center text-indigo-600 hover:text-indigo-800 bg-white hover:bg-indigo-50 border border-gray-200 rounded-lg transition-colors"
              onClick={() => setIsExcludeModalOpen(true)}
              disabled={isReadOnly}
              title="Exclude recipients"
            >
              <Users size={15} />
              {followUp.excludedRecipients?.length > 0 && (
                <span className="absolute mt-5 ml-5 min-w-4 h-4 px-1 bg-indigo-200 text-indigo-800 text-[10px] rounded-full inline-flex items-center justify-center">
                  {followUp.excludedRecipients.length}
                </span>
              )}
            </button>
            {canRemove && (
              <button 
                className="h-9 w-9 inline-flex items-center justify-center text-red-600 bg-red-50 hover:bg-red-100 border border-red-100 rounded-lg transition-colors"
                onClick={() => onRemove(index)}
                title="Remove Follow-up"
                aria-label={`Remove follow-up ${index + 1}`}
              >
                <Trash2 size={16} />
              </button>
            )}
          </div>
        </div>

        <ExcludeRecipientsModal 
          isOpen={isExcludeModalOpen}
          onClose={() => setIsExcludeModalOpen(false)}
          recipientsData={recipientsData}
          excludedRecipients={followUp.excludedRecipients || []}
          onSave={(excluded) => handleUpdate('excludedRecipients', excluded)}
        />

        {isScheduleModalOpen && (
          <FollowUpScheduleModal
            isOpen={isScheduleModalOpen}
            onClose={() => setIsScheduleModalOpen(false)}
            schedule={followUp.schedule}
            onSave={(schedule) => handleUpdate('schedule', schedule)}
          />
        )}
      </div>
    );
  }

  return (
    <div className="card bg-white shadow-sm border border-gray-200 flex flex-col mb-4 overflow-hidden animate-in slide-in-from-top-4 fade-in duration-300">
      {/* Condition Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-indigo-50/50 border-b border-indigo-100">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="text-indigo-950 text-sm font-semibold flex items-center gap-2">
            Follow-up {index + 1}
            {statusBadge}
          </div>
          <div className="h-4 w-px bg-indigo-200 hidden sm:block"></div>
          <div className="flex items-center gap-2 text-indigo-900 text-sm font-medium">
            <Clock size={16} className="text-indigo-500" />
            Wait
            <input 
              type="number" 
              min="1" 
              className="w-16 px-2 py-1 text-center bg-white border border-indigo-200 rounded-md focus:ring-2 focus:ring-indigo-500 outline-none"
              value={followUp.delayDays}
              onChange={(e) => handleUpdate('delayDays', parseInt(e.target.value) || 1)}
              disabled={isReadOnly}
            />
            days
          </div>
          
          <div className="h-4 w-px bg-indigo-200 hidden sm:block"></div>
          
          <div className="flex items-center gap-2 text-indigo-900 text-sm font-medium">
            <MessageSquareOff size={16} className="text-indigo-500" />
            Send only if
            <select 
              className="px-2 py-1 bg-white border border-indigo-200 rounded-md focus:ring-2 focus:ring-indigo-500 outline-none"
              value={followUp.onlyIfNoReply ? 'no-reply' : 'always'}
              onChange={(e) => handleUpdate('onlyIfNoReply', e.target.value === 'no-reply')}
              disabled={isReadOnly}
            >
              <option value="no-reply">No Reply</option>
              <option value="always">Always</option>
            </select>
          </div>
          
          <div className="h-4 w-px bg-indigo-200 hidden sm:block"></div>

          <div className="flex items-center gap-2 text-indigo-900 text-sm font-medium">
            <Link size={16} className="text-indigo-500" />
            Same thread
            <Toggle 
              checked={usesMainSubject}
              onChange={(val) => handleUpdate('inSameThread', val)}
              disabled={isReadOnly}
            />
          </div>
        </div>

        <div className="flex items-center gap-2 ml-auto">
          <button 
            className="flex items-center gap-1.5 text-sm text-indigo-600 hover:text-indigo-800 font-medium px-2 py-1 rounded hover:bg-indigo-100 transition-colors"
            onClick={() => setIsScheduleModalOpen(true)}
            disabled={isReadOnly}
            title="Schedule & Autopilot"
          >
            <Calendar size={14} />
            {status === 'scheduled' ? 'Edit schedule' : 'Schedule'}
            {(followUp.schedule?.sendAt || followUp.schedule?.autopilot?.enabled) && (
              <div className="w-2 h-2 bg-indigo-500 rounded-full ml-0.5"></div>
            )}
          </button>
          {canCancelSchedule && (
            <button
              className="flex items-center gap-1.5 text-sm text-red-700 hover:text-red-800 font-medium px-2 py-1 rounded hover:bg-red-100 transition-colors disabled:opacity-60"
              onClick={() => onCancelSchedule(followUp.order || index + 1)}
              disabled={isCancellingSchedule}
              type="button"
              title={`Cancel scheduled follow-up ${index + 1}`}
            >
              {isCancellingSchedule ? <Loader2 size={14} className="animate-spin" /> : <CalendarX size={14} />}
              Cancel schedule
            </button>
          )}
          <button 
            className="flex items-center gap-1.5 text-sm text-indigo-600 hover:text-indigo-800 font-medium px-2 py-1 rounded hover:bg-indigo-100 transition-colors"
            onClick={() => setIsExcludeModalOpen(true)}
            disabled={isReadOnly}
          >
            <Users size={14} />
            Exclude
            {followUp.excludedRecipients?.length > 0 && (
              <span className="bg-indigo-200 text-indigo-800 text-xs px-1.5 py-0.5 rounded-full ml-1">
                {followUp.excludedRecipients.length}
              </span>
            )}
          </button>
          
          {canRemove && (
            <button 
              className="h-8 w-8 inline-flex items-center justify-center text-red-600 bg-red-50 hover:bg-red-100 border border-red-100 rounded-lg transition-colors"
              onClick={() => onRemove(index)}
              title="Remove Follow-up"
              aria-label={`Remove follow-up ${index + 1}`}
            >
              <Trash2 size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Editor Header */}
      <div className="flex border-b border-gray-100">
        <div className="w-24 px-4 py-3 text-sm font-medium text-gray-500 border-r border-gray-100 flex items-center">Subject:</div>
        <input 
          type="text" 
          className={`flex-1 px-4 py-3 text-sm outline-none placeholder-gray-400 font-medium ${
            usesMainSubject ? 'text-gray-600 bg-gray-50 cursor-not-allowed' : 'text-gray-900'
          }`}
          placeholder="Your follow-up subject"
          value={visibleSubject}
          onChange={(e) => handleUpdate('subject', e.target.value)}
          disabled={isReadOnly || usesMainSubject}
        />
        {usesMainSubject && (
          <div className="px-3 py-2 border-l border-gray-100 text-xs text-gray-500 flex items-center">
            Same thread uses the main subject
          </div>
        )}
        {!isReadOnly && (
          <div className="px-3 py-2 border-l border-gray-100 flex items-center">
            <label className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg cursor-pointer transition-colors">
              <Paperclip size={16} />
              <input 
                type="file" 
                multiple 
                className="hidden"
                onChange={handleAttachment} 
              />
            </label>
          </div>
        )}
      </div>

      {/* Attachments */}
      {followUp.attachments?.length > 0 && (
        isReadOnly ? (
          <AttachmentViewer attachments={followUp.attachments} />
        ) : (
          <div className="flex border-b border-gray-100 bg-gray-50">
            <div className="w-24 px-4 py-3 text-sm font-medium text-gray-500 border-r border-gray-100">Attached:</div>
            <div className="flex-1 px-4 py-3 flex flex-wrap gap-2">
              {followUp.attachments.map((file, idx) => (
                <div key={idx} className="flex items-center gap-2 bg-white border border-gray-200 px-3 py-1.5 rounded-lg text-sm text-gray-700 shadow-sm">
                  <Paperclip size={14} className="text-gray-400" /> 
                  <span className="truncate max-w-[200px]">{file.name || file.originalName}</span>
                  <button 
                    className="text-gray-400 hover:text-red-500 transition-colors ml-1"
                    onClick={() => removeAttachment(idx)}
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )
      )}

      {/* Editor Body */}
      <div className="flex-none relative">
        <ComposeEditor 
          value={followUp.body} 
          onChange={(val) => handleUpdate('body', val)} 
          availablePlaceholders={availablePlaceholders}
          isReadOnly={isReadOnly}
        />
        {isReadOnly && <div className="absolute inset-0 bg-transparent cursor-not-allowed"></div>}
      </div>

      <ExcludeRecipientsModal 
        isOpen={isExcludeModalOpen}
        onClose={() => setIsExcludeModalOpen(false)}
        recipientsData={recipientsData}
        excludedRecipients={followUp.excludedRecipients || []}
        onSave={(excluded) => handleUpdate('excludedRecipients', excluded)}
      />

      {isScheduleModalOpen && (
        <FollowUpScheduleModal
          isOpen={isScheduleModalOpen}
          onClose={() => setIsScheduleModalOpen(false)}
          schedule={followUp.schedule}
          onSave={(schedule) => handleUpdate('schedule', schedule)}
        />
      )}
    </div>
  );
};

export default FollowUpEditor;
