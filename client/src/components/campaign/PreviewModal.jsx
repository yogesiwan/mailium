import React, { useState } from 'react';
import Modal from '../common/Modal';
import { Smartphone, Monitor, ChevronLeft, ChevronRight, Paperclip, Send } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../api';

const PreviewModal = ({ isOpen, onClose, campaign, recipientsData, attachments = [] }) => {
  const [viewMode, setViewMode] = useState('desktop');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [testEmail, setTestEmail] = useState('');
  const [isSendingTest, setIsSendingTest] = useState(false);

  if (!isOpen) return null;

  const currentRecipient = recipientsData && recipientsData.length > 0 
    ? recipientsData[currentIndex].data 
    : null;

  const totalRecipients = recipientsData ? recipientsData.length : 0;

  const replacePlaceholders = (text) => {
    if (!text || !currentRecipient) return text;
    let newText = text.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (match, key) => {
      return currentRecipient[key] !== undefined ? currentRecipient[key] : match;
    });
    // Ensure empty paragraphs don't collapse in browser/email clients
    newText = newText.replace(/<p><\/p>/g, '<p><br></p>');
    return newText;
  };

  const subject = replacePlaceholders(campaign.subject);
  const body = replacePlaceholders(campaign.body);

  const handlePrev = () => {
    setCurrentIndex(prev => (prev > 0 ? prev - 1 : totalRecipients - 1));
  };

  const handleNext = () => {
    setCurrentIndex(prev => (prev < totalRecipients - 1 ? prev + 1 : 0));
  };

  const handleSendTest = async () => {
    if (!testEmail) {
      toast.error('Please enter an email address for testing');
      return;
    }
    
    setIsSendingTest(true);
    try {
      await api.post('/campaigns/test-draft', {
        subject: campaign.subject,
        body: campaign.body,
        testEmail,
        recipientData: currentRecipient
      });
      toast.success('Test email sent!');
    } catch (err) {
      toast.error('Failed to send test email');
      console.error(err);
    } finally {
      setIsSendingTest(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Campaign Preview" size="xl">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
        
        {/* Device Toggles */}
        <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
          <button 
            onClick={() => setViewMode('desktop')}
            className={`p-2 rounded-md flex items-center justify-center transition-all ${
              viewMode === 'desktop' 
                ? 'bg-white shadow-sm text-blue-600' 
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <Monitor size={18} />
          </button>
          <button 
            onClick={() => setViewMode('mobile')}
            className={`p-2 rounded-md flex items-center justify-center transition-all ${
              viewMode === 'mobile' 
                ? 'bg-white shadow-sm text-blue-600' 
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <Smartphone size={18} />
          </button>
        </div>

        {/* Recipient Navigation */}
        <div className="flex flex-wrap items-center gap-4">
          {/* Send Test Email */}
          <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden shadow-sm bg-white">
            <input 
              type="email" 
              placeholder="Test email address" 
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
              className="px-3 py-2 border-none outline-none text-sm w-48 bg-transparent"
            />
            <button 
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 text-sm font-medium flex items-center gap-2 transition-colors disabled:opacity-70"
              onClick={handleSendTest}
              disabled={isSendingTest}
            >
              <Send size={14} /> {isSendingTest ? 'Sending...' : 'Test'}
            </button>
          </div>

          {totalRecipients > 0 && (
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-500 font-medium">
                Recipient {currentIndex + 1} of {totalRecipients}
              </span>
              <div className="flex gap-1">
                <button className="p-1.5 border border-gray-200 rounded-md text-gray-500 hover:bg-gray-50 transition-colors" onClick={handlePrev}>
                  <ChevronLeft size={16} />
                </button>
                <button className="p-1.5 border border-gray-200 rounded-md text-gray-500 hover:bg-gray-50 transition-colors" onClick={handleNext}>
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="flex justify-center bg-gray-100 p-4 md:p-8 rounded-xl min-h-[500px]">
        <div 
          className={`w-full bg-white rounded-xl shadow-lg overflow-hidden transition-all duration-300 flex flex-col ${
            viewMode === 'mobile' ? 'max-w-[375px]' : 'max-w-3xl'
          }`}
        >
          {/* Email Header */}
          <div className="border-b border-gray-100 p-5 md:p-6 bg-gray-50/50">
            <div className="mb-2 text-sm text-gray-500 flex gap-2">
              <span className="font-semibold text-gray-700">To:</span> 
              <span className="truncate">{currentRecipient ? `${currentRecipient.email || currentRecipient.Email || 'Recipient'}` : 'No recipients selected'}</span>
            </div>
            <div className="text-lg md:text-xl font-bold text-gray-900">
              {subject || 'No subject'}
            </div>
          </div>
          
          {/* Email Body */}
          <div className="flex-1 overflow-y-auto">
            <div 
              className={`p-5 md:p-8 prose prose-sm max-w-none ${viewMode === 'mobile' ? 'text-base' : 'text-sm'}`}
              dangerouslySetInnerHTML={{ __html: body || '<p class="text-gray-400 italic">Empty email body</p>' }}
            />
          </div>
          
          {/* Email Attachments */}
          {attachments && attachments.length > 0 && (
            <div className="p-4 md:p-5 border-t border-gray-100 bg-gray-50">
              <div className="text-sm font-semibold text-gray-500 mb-3">
                {attachments.length} Attachment{attachments.length > 1 ? 's' : ''}
              </div>
              <div className="flex flex-wrap gap-2">
                {attachments.map((file, idx) => (
                  <div key={idx} className="flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-lg bg-white shadow-sm text-sm">
                    <Paperclip size={16} className="text-blue-500" />
                    <span className="text-gray-700 font-medium truncate max-w-[200px]">{file.name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
};

export default PreviewModal;
