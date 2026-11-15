import { useState } from 'react';
import Modal from './Modal';
import api from '../../api';
import toast from 'react-hot-toast';

const QuickSendModal = ({ isOpen, onClose }) => {
  const [to, setTo] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [isSending, setIsSending] = useState(false);

  const handleSend = async () => {
    if (!to || !subject || !body) {
      toast.error('All fields are required');
      return;
    }
    setIsSending(true);
    try {
      await api.post('/campaigns/single-email', { to, subject, body });
      toast.success('Single email triggered successfully');
      setTo('');
      setSubject('');
      setBody('');
      onClose();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to send single email');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Quick Send (Single Email)">
      <div className="space-y-4 p-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">To (Email Address)</label>
          <input
            type="email"
            value={to}
            onChange={e => setTo(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="recipient@example.com"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Subject</label>
          <input
            type="text"
            value={subject}
            onChange={e => setSubject(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Meeting follow-up"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Message</label>
          <textarea
            value={body}
            onChange={e => setBody(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[150px]"
            placeholder="Type your message here... HTML is supported."
          />
        </div>
      </div>
      <div className="flex justify-end gap-3 p-4 border-t border-gray-100 bg-gray-50 rounded-b-xl mt-4">
        <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
          Cancel
        </button>
        <button
          onClick={handleSend}
          disabled={isSending}
          className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center gap-2"
        >
          {isSending ? 'Sending...' : 'Send Now'}
        </button>
      </div>
    </Modal>
  );
};

export default QuickSendModal;
