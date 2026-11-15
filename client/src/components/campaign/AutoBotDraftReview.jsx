import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarClock, Loader2, RefreshCw, Save, Send } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../api';
import Modal from '../common/Modal';

const formatLocalDateTime = (instant, timeZone) => {
  if (!instant) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(new Date(instant)).reduce((result, part) => {
    result[part.type] = part.value;
    return result;
  }, {});
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
};

const localDateTimeToIso = (value, timeZone) => {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!match) throw new Error('Choose a valid start date and time');
  const desired = match.slice(1).map(Number);
  const desiredUtc = Date.UTC(desired[0], desired[1] - 1, desired[2], desired[3], desired[4]);
  let guess = desiredUtc;
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  });
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const parts = formatter.formatToParts(new Date(guess)).reduce((result, part) => {
      result[part.type] = Number(part.value);
      return result;
    }, {});
    const shownUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
    const delta = desiredUtc - shownUtc;
    guess += delta;
    if (delta === 0) break;
  }
  if (formatLocalDateTime(new Date(guess), timeZone) !== value) {
    throw new Error('That local time is not valid in the selected timezone');
  }
  return new Date(guess).toISOString();
};

const initialSchedule = (campaign) => {
  let timeZone = campaign?.schedule?.timezone || 'Asia/Kolkata';
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
  } catch {
    timeZone = 'Asia/Kolkata';
  }
  const defaultInstant = campaign?.schedule?.sendAt || new Date(Date.now() + 60 * 60 * 1000);
  return {
    timeZone,
    sendAtLocal: formatLocalDateTime(defaultInstant, timeZone),
    delayMinutes: Number.isInteger(campaign?.schedule?.delayMinutes) ? campaign.schedule.delayMinutes : 0
  };
};

const AutoBotDraftReview = ({ campaign, onCampaignUpdated }) => {
  const [review, setReview] = useState(null);
  const [preview, setPreview] = useState(null);
  const [selectedRecipientId, setSelectedRecipientId] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isScheduling, setIsScheduling] = useState(false);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [confirmation, setConfirmation] = useState(null);
  const [draftFields, setDraftFields] = useState({ subject: campaign.subject || '', body: campaign.body || '' });
  const [isDraftDirty, setIsDraftDirty] = useState(false);
  const [schedule, setSchedule] = useState(() => initialSchedule(campaign));
  const [message, setMessage] = useState('');
  const campaignId = campaign._id;
  const scheduleSendAt = campaign.schedule?.sendAt;
  const scheduleTimeZone = campaign.schedule?.timezone;
  const scheduleDelay = campaign.schedule?.delayMinutes;

  const isActivated = Boolean(review?.campaign?.autobot?.activatedAt || review?.campaign?.status !== 'draft');

  const fetchReview = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setIsLoading(true);
    try {
      const response = await api.get(`/campaigns/${campaign._id}/autobot-review`);
      const nextReview = response.data;
      setReview(nextReview);
      setSelectedRecipientId((current) => (
        nextReview.recipients.some((recipient) => recipient._id === current)
          ? current
          : (nextReview.previewRecipientId || nextReview.recipients[0]?._id || '')
      ));
      if (!isDraftDirty) {
        setDraftFields({
          subject: nextReview.campaign.subject || '',
          body: nextReview.campaign.body || ''
        });
      }
      setMessage('');
      return nextReview;
    } catch (error) {
      const apiMessage = error.response?.data?.error || 'Could not load the AutoBot draft review';
      setMessage(apiMessage);
      return null;
    } finally {
      if (!quiet) setIsLoading(false);
    }
  }, [campaign._id, isDraftDirty]);

  useEffect(() => {
    fetchReview();
  }, [fetchReview]);

  useEffect(() => {
    const intervalId = window.setInterval(() => fetchReview({ quiet: true }), 15000);
    return () => window.clearInterval(intervalId);
  }, [fetchReview]);

  const selectedRecipient = useMemo(
    () => review?.recipients.find((recipient) => recipient._id === selectedRecipientId) || null,
    [review, selectedRecipientId]
  );

  useEffect(() => {
    if (!selectedRecipientId || !campaign._id) {
      setPreview(null);
      return;
    }
    let cancelled = false;
    api.get(`/campaigns/${campaign._id}/autobot-preview/${selectedRecipientId}`)
      .then((response) => {
        if (!cancelled) setPreview(response.data.preview);
      })
      .catch(() => {
        if (!cancelled) setPreview(null);
      });
    return () => { cancelled = true; };
  }, [campaign._id, selectedRecipientId, review?.revision]);

  useEffect(() => {
    setSchedule(initialSchedule({ schedule: { sendAt: scheduleSendAt, timezone: scheduleTimeZone, delayMinutes: scheduleDelay } }));
  }, [campaignId, scheduleSendAt, scheduleTimeZone, scheduleDelay]);

  const updateDraftField = (field, value) => {
    setDraftFields((current) => ({ ...current, [field]: value }));
    setIsDraftDirty(true);
  };

  const handleSaveDraft = async () => {
    if (!review) return;
    setIsSaving(true);
    try {
      const response = await api.put(`/campaigns/${campaign._id}`, {
        expectedRevision: review.revision,
        ...draftFields
      });
      setIsDraftDirty(false);
      setReview((current) => current ? {
        ...current,
        revision: response.data.campaign.autobot.revision,
        campaign: response.data.campaign
      } : current);
      onCampaignUpdated?.(response.data.campaign);
      toast.success('Draft message saved');
      await fetchReview({ quiet: true });
    } catch (error) {
      toast.error(error.response?.data?.error || 'Could not save the draft message');
      await fetchReview({ quiet: true });
    } finally {
      setIsSaving(false);
    }
  };

  const handleOpenConfirmation = () => {
    if (!review) return;
    if (isDraftDirty) {
      toast.error('Save your message edits before scheduling');
      return;
    }
    setConfirmation({
      revision: review.revision,
      recipients: review.recipients.map(({ _id, email }) => ({ _id, email })),
      totalRecipients: review.totalRecipients,
      schedule: { ...schedule }
    });
    setIsConfirmOpen(true);
  };

  const handleSchedule = async () => {
    if (!confirmation) return;
    setIsScheduling(true);
    try {
      const sendAt = localDateTimeToIso(confirmation.schedule.sendAtLocal, confirmation.schedule.timeZone);
      const response = await api.post(`/campaigns/${campaign._id}/send`, {
        expectedRevision: confirmation.revision,
        schedule: {
          sendAt,
          timezone: confirmation.schedule.timeZone,
          delayMinutes: Number(confirmation.schedule.delayMinutes)
        }
      });
      setIsConfirmOpen(false);
      setConfirmation(null);
      toast.success(response.data.enqueueStatus === 'pending'
        ? 'Campaign scheduled; the send job is queued for recovery'
        : 'Campaign scheduled');
      await fetchReview();
      onCampaignUpdated?.(response.data.campaign);
    } catch (error) {
      toast.error(error.response?.data?.error || error.message || 'Could not schedule the campaign');
      await fetchReview({ quiet: true });
    } finally {
      setIsScheduling(false);
    }
  };

  const previewHtml = preview?.body || '<p class="text-gray-400">Choose a recipient to preview the message.</p>';

  return (
    <section className="card p-5 mb-8 border border-indigo-100 bg-indigo-50/30">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
        <div>
          <div className="flex items-center gap-2 text-indigo-800 font-semibold">
            <CalendarClock size={18} /> AutoBot draft review
          </div>
          <p className="text-sm text-gray-600 mt-1">
            Review the synchronized recipient set and message, then schedule a future send.
          </p>
        </div>
        <button className="btn-outline gap-2" onClick={() => fetchReview()} disabled={isLoading}>
          {isLoading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
          Refresh
        </button>
      </div>

      {message && <div className="mb-4 rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800">{message}</div>}
      {isLoading && !review ? (
        <div className="py-8 flex justify-center"><Loader2 className="animate-spin text-indigo-600" /></div>
      ) : review ? (
        <>
          <div className="grid lg:grid-cols-2 gap-5">
            <div className="space-y-4">
              <div className="text-sm text-gray-600">
                Revision <strong className="text-gray-900">{review.revision}</strong>
                <span className="mx-2">·</span>
                <strong className="text-gray-900">{review.totalRecipients}</strong> recipients
              </div>
              <label className="block">
                <span className="block text-sm font-medium text-gray-700 mb-1">Subject</span>
                <input
                  value={draftFields.subject}
                  onChange={(event) => updateDraftField('subject', event.target.value)}
                  disabled={isActivated}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
                />
              </label>
              <label className="block">
                <span className="block text-sm font-medium text-gray-700 mb-1">Message HTML</span>
                <textarea
                  value={draftFields.body}
                  onChange={(event) => updateDraftField('body', event.target.value)}
                  disabled={isActivated}
                  rows={8}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-mono"
                />
              </label>
              {!isActivated && (
                <button className="btn-outline gap-2" onClick={handleSaveDraft} disabled={!isDraftDirty || isSaving}>
                  {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                  Save message edits
                </button>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Preview recipient</label>
              <select
                value={selectedRecipientId}
                onChange={(event) => setSelectedRecipientId(event.target.value)}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm mb-3"
              >
                {review.recipients.map((recipient) => (
                  <option key={recipient._id} value={recipient._id}>{recipient.email}</option>
                ))}
              </select>
              {selectedRecipient && preview && (
                <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
                  <div className="border-b border-gray-100 bg-gray-50 p-3 text-sm">
                    <div><strong>To:</strong> {selectedRecipient.email}</div>
                    <div className="mt-1"><strong>Subject:</strong> {preview.subject}</div>
                  </div>
                  <div className="prose prose-sm max-w-none p-4" dangerouslySetInnerHTML={{ __html: previewHtml }} />
                </div>
              )}
              {review.totalRecipients === 0 && <p className="text-sm text-amber-700 mt-3">No recipients are selected for this date yet.</p>}
            </div>
          </div>

          {!isActivated ? (
            <div className="mt-6 pt-5 border-t border-indigo-100">
              <h3 className="font-semibold text-gray-900 mb-3">Schedule</h3>
              <div className="grid md:grid-cols-3 gap-3">
                <label className="block text-sm">
                  <span className="block font-medium text-gray-700 mb-1">Start date and time</span>
                  <input type="datetime-local" value={schedule.sendAtLocal} onChange={(event) => setSchedule((current) => ({ ...current, sendAtLocal: event.target.value }))} className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2" />
                </label>
                <label className="block text-sm">
                  <span className="block font-medium text-gray-700 mb-1">Timezone (IANA)</span>
                  <input value={schedule.timeZone} onChange={(event) => setSchedule((current) => ({ ...current, timeZone: event.target.value }))} placeholder="Asia/Kolkata" className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2" />
                </label>
                <label className="block text-sm">
                  <span className="block font-medium text-gray-700 mb-1">Delay between emails (minutes)</span>
                  <input type="number" min="0" max="1440" step="1" value={schedule.delayMinutes} onChange={(event) => setSchedule((current) => ({ ...current, delayMinutes: event.target.value }))} className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2" />
                </label>
              </div>
              <button className="btn-primary gap-2 mt-4" onClick={handleOpenConfirmation} disabled={review.totalRecipients === 0 || isDraftDirty}>
                <Send size={16} /> Schedule campaign
              </button>
            </div>
          ) : (
            <div className="mt-6 rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-800">
              This draft was activated. Its recipient set is frozen.
            </div>
          )}

          <details className="mt-5">
            <summary className="cursor-pointer text-sm font-medium text-gray-700">Review all {review.recipients.length} recipients</summary>
            <ul className="mt-3 max-h-64 overflow-y-auto rounded-lg border border-gray-200 bg-white divide-y divide-gray-100">
              {review.recipients.map((recipient) => (
                <li key={recipient._id} className="px-3 py-2 text-sm flex flex-wrap gap-x-3 gap-y-1">
                  <span className="font-medium text-gray-900">{recipient.email}</span>
                  <span className="text-gray-500">{recipient.data?.company || ''}</span>
                  <span className="text-gray-500">{recipient.data?.role || ''}</span>
                  <span className="text-gray-500">{recipient.data?.location || ''}</span>
                </li>
              ))}
            </ul>
          </details>

          <Modal isOpen={isConfirmOpen} onClose={() => !isScheduling && setIsConfirmOpen(false)} title="Confirm campaign schedule">
            <div className="space-y-4">
              <p className="text-sm text-gray-700">
                Schedule revision <strong>{confirmation?.revision}</strong> with <strong>{confirmation?.totalRecipients}</strong> recipients for{' '}
                <strong>{confirmation?.schedule.sendAtLocal}</strong> ({confirmation?.schedule.timeZone}), with a {confirmation?.schedule.delayMinutes || 0} minute delay.
              </p>
              <div className="max-h-48 overflow-y-auto rounded-lg border border-gray-200 bg-gray-50 divide-y divide-gray-200">
                {confirmation?.recipients.map((recipient) => (
                  <div key={recipient._id} className="px-3 py-2 text-sm text-gray-700">{recipient.email}</div>
                ))}
              </div>
              <div className="flex justify-end gap-2">
                <button className="btn-outline" onClick={() => setIsConfirmOpen(false)} disabled={isScheduling}>Back</button>
                <button className="btn-primary gap-2" onClick={handleSchedule} disabled={isScheduling}>
                  {isScheduling ? <Loader2 size={16} className="animate-spin" /> : <CalendarClock size={16} />}
                  {isScheduling ? 'Scheduling…' : 'Confirm schedule'}
                </button>
              </div>
            </div>
          </Modal>
        </>
      ) : null}
    </section>
  );
};

export default AutoBotDraftReview;
