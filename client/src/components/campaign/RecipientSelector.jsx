import { useState } from 'react';
import Modal from '../common/Modal';
import { FileSpreadsheet, FileText, Upload, ChevronRight, ChevronLeft, CheckCircle2, Mail, UserRound } from 'lucide-react';
import api from '../../api';
import Papa from 'papaparse';

const RecipientSelector = ({ isOpen, onClose, onImport }) => {
  const [step, setStep] = useState(1);
  const [method, setMethod] = useState(null); // 'sheets', 'csv'

  // Sheets state
  const [spreadsheetUrl, setSpreadsheetUrl] = useState('');
  const [sheetNames, setSheetNames] = useState([]);
  const [selectedSheet, setSelectedSheet] = useState('');
  
  // Columns & Filtering state
  const [columns, setColumns] = useState([]);
  const [emailColumn, setEmailColumn] = useState('');
  const [filterColumn, setFilterColumn] = useState('');
  const [uniqueValues, setUniqueValues] = useState([]);
  const [selectedValues, setSelectedValues] = useState([]);

  // Preview & Summary state
  const [previewData, setPreviewData] = useState(null);
  const [importedSummary, setImportedSummary] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const getEmail = (row) => row?.[emailColumn] || row?.email || row?.Email || row?.EMAIL || '';
  const getName = (row) => row?.name || row?.Name || row?.fullName || row?.FullName || row?.['Full Name'] || '';
  const getRole = (row) => row?.role || row?.Role || row?.title || row?.Title || '';
  const getApiError = (err, fallback) => err?.response?.data?.error || fallback;

  const resetSelector = () => {
    setStep(1);
    setMethod(null);
    setSpreadsheetUrl('');
    setSheetNames([]);
    setSelectedSheet('');
    setColumns([]);
    setEmailColumn('');
    setFilterColumn('');
    setUniqueValues([]);
    setSelectedValues([]);
    setPreviewData(null);
    setImportedSummary(null);
    setError('');
  };

  const handleMethodSelect = (selectedMethod) => {
    setMethod(selectedMethod);
    setStep(2);
  };

  const handleFetchSheets = async () => {
    if (!spreadsheetUrl) {
      setError('Please enter a valid Google Sheets URL');
      return;
    }
    setIsLoading(true);
    setError('');
    try {
      const res = await api.post('/sheets/names', { spreadsheetUrl });
      setSheetNames(res.data.sheets);
    } catch (err) {
      setError(getApiError(err, 'Failed to fetch sheets. Make sure the URL is correct and the sheet is accessible.'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleSheetSelect = async (sheetName) => {
    setSelectedSheet(sheetName);
    setIsLoading(true);
    try {
      const res = await api.post('/sheets/columns', { spreadsheetUrl, sheetName });
      setColumns(res.data.columns);
      // Auto-detect email column
      const emailCol = res.data.columns.find(c => c.toLowerCase().includes('email'));
      if (emailCol) setEmailColumn(emailCol);
      setStep(3);
    } catch (err) {
      setError(getApiError(err, 'Failed to fetch columns.'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleCsvUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setIsLoading(true);
    setError('');
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        if (results.data && results.data.length > 0) {
          const cols = Object.keys(results.data[0]);
          setColumns(cols);
          
          const emailCol = cols.find(c => c.toLowerCase().includes('email'));
          if (emailCol) setEmailColumn(emailCol);
          
          setPreviewData({
             totalRows: results.data.length,
             filteredCount: results.data.length,
             data: results.data,
             sampleRows: results.data.slice(0, 5)
          });
          setStep(3);
        } else {
          setError('CSV file is empty or invalid');
        }
        setIsLoading(false);
      },
      error: (err) => {
        setError('Failed to parse CSV: ' + err.message);
        setIsLoading(false);
      }
    });
  };

  const handleFetchUniqueValues = async (columnName) => {
    setFilterColumn(columnName);
    if (method === 'csv') {
      // Filter client-side
      const vals = [...new Set(previewData.data.map(row => row[columnName]).filter(v => v !== undefined && v !== ''))].sort();
      setUniqueValues(vals);
      setSelectedValues(vals);
      return;
    }

    setIsLoading(true);
    try {
      const res = await api.post('/sheets/unique-values', { spreadsheetUrl, sheetName: selectedSheet, column: columnName });
      setUniqueValues(res.data.values);
      setSelectedValues(res.data.values);
    } catch (err) {
      setError(getApiError(err, 'Failed to fetch unique values.'));
    } finally {
      setIsLoading(false);
    }
  };

  const toggleValueSelection = (val) => {
    if (selectedValues.includes(val)) {
      setSelectedValues(selectedValues.filter(v => v !== val));
    } else {
      setSelectedValues([...selectedValues, val]);
    }
  };

  const handlePreview = async () => {
    if (!emailColumn) {
      setError('Please select the column containing email addresses.');
      return;
    }
    
    if (method === 'csv') {
      let validData = previewData.data;
      if (filterColumn && selectedValues.length > 0) {
        validData = validData.filter(row => selectedValues.includes(row[filterColumn]));
      }
      validData = validData.filter(row => row[emailColumn] && row[emailColumn].trim() !== '');
      
      setPreviewData({
        ...previewData,
        filteredCount: validData.length,
        data: validData,
        sampleRows: validData.slice(0, 5)
      });
      setStep(4);
      return;
    }

    setIsLoading(true);
    try {
      const res = await api.post('/sheets/preview', {
        spreadsheetUrl,
        sheetName: selectedSheet,
        emailColumn,
        filterColumn,
        filterValues: selectedValues
      });
      setPreviewData(res.data);
      setStep(4);
    } catch (err) {
      setError(getApiError(err, 'Failed to preview data.'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleImport = () => {
    if (previewData && previewData.data) {
      const formattedData = previewData.data.map(row => ({
        email: row[emailColumn],
        data: row
      }));
      onImport(formattedData, columns);
      setImportedSummary({
        count: formattedData.length,
        method,
        sampleRows: previewData.data.slice(0, 8)
      });
      setStep(5);
    }
  };

  const handleDone = () => {
    resetSelector();
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Select recipients" size="lg">
      <div className="min-h-[350px]">
        {error && (
          <div className="p-4 mb-6 bg-red-50 text-red-700 border border-red-200 rounded-lg flex items-start gap-3">
            <span className="font-medium">Error:</span> {error}
          </div>
        )}
        
        {step === 1 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-4">
            <button 
              className="group flex flex-col items-center justify-center p-8 bg-white border-2 border-dashed border-gray-200 rounded-xl hover:border-green-500 hover:bg-green-50 transition-all text-left w-full h-full"
              onClick={() => handleMethodSelect('sheets')}
            >
              <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <FileSpreadsheet size={32} />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Google Sheets</h3>
              <p className="text-sm text-gray-500 text-center">Import contacts directly from a Google Spreadsheet</p>
            </button>
            
            <button 
              className="group flex flex-col items-center justify-center p-8 bg-white border-2 border-dashed border-gray-200 rounded-xl hover:border-blue-500 hover:bg-blue-50 transition-all text-left w-full h-full"
              onClick={() => handleMethodSelect('csv')}
            >
              <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <FileText size={32} />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Import a CSV</h3>
              <p className="text-sm text-gray-500 text-center">Upload a .csv file from your computer</p>
            </button>
          </div>
        )}

        {step === 2 && method === 'sheets' && (
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Spreadsheet URL</label>
              <div className="flex gap-3">
                <input 
                  type="text" 
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-shadow"
                  placeholder="https://docs.google.com/spreadsheets/d/..." 
                  value={spreadsheetUrl}
                  onChange={(e) => setSpreadsheetUrl(e.target.value)}
                />
                <button 
                  className="px-6 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                  onClick={handleFetchSheets} 
                  disabled={isLoading}
                >
                  {isLoading ? 'Loading...' : 'Connect'}
                </button>
              </div>
            </div>

            {sheetNames.length > 0 && (
              <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                <label className="block text-sm font-medium text-gray-700 mb-3">Select Sheet</label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {sheetNames.map(name => (
                    <button 
                      key={name}
                      onClick={() => handleSheetSelect(name)}
                      className={`px-4 py-3 border rounded-lg text-sm font-medium transition-all ${
                        selectedSheet === name 
                          ? 'border-blue-500 bg-blue-50 text-blue-700 shadow-sm ring-1 ring-blue-500' 
                          : 'border-gray-200 bg-white text-gray-700 hover:border-blue-300 hover:bg-gray-50'
                      }`}
                    >
                      {name}
                    </button>
                  ))}
                </div>
              </div>
            )}
            
            <div className="pt-6 border-t border-gray-100">
              <button className="flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors" onClick={() => setStep(1)}>
                <ChevronLeft size={16} /> Back
              </button>
            </div>
          </div>
        )}

        {step === 2 && method === 'csv' && (
          <div className="flex flex-col items-center justify-center min-h-[250px] space-y-6">
            {isLoading ? (
              <div className="flex flex-col items-center gap-3">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                <p className="text-gray-500 font-medium">Parsing CSV...</p>
              </div>
            ) : (
              <label className="group relative overflow-hidden flex flex-col items-center justify-center w-full max-w-md h-48 border-2 border-dashed border-gray-300 rounded-xl cursor-pointer hover:border-blue-500 hover:bg-blue-50 transition-all">
                <div className="flex flex-col items-center justify-center pt-5 pb-6">
                  <Upload size={40} className="text-gray-400 group-hover:text-blue-500 mb-3 transition-colors" />
                  <p className="mb-2 text-sm text-gray-500"><span className="font-semibold text-blue-600">Click to upload</span> or drag and drop</p>
                  <p className="text-xs text-gray-400">CSV files only</p>
                </div>
                <input 
                  type="file" 
                  accept=".csv" 
                  className="hidden"
                  onChange={handleCsvUpload}
                />
              </label>
            )}
            <div className="w-full flex justify-start pt-6 border-t border-gray-100">
              <button className="flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors" onClick={() => setStep(1)} disabled={isLoading}>
                <ChevronLeft size={16} /> Back
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Email Column <span className="text-red-500">*</span></label>
                <select 
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white"
                  value={emailColumn}
                  onChange={(e) => setEmailColumn(e.target.value)}
                >
                  <option value="">Select column...</option>
                  {columns.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Filter by Column (Optional)</label>
                <select 
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white"
                  value={filterColumn}
                  onChange={(e) => handleFetchUniqueValues(e.target.value)}
                >
                  <option value="">No filter</option>
                  {columns.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>

            {filterColumn && uniqueValues.length > 0 && (
              <div className="animate-in fade-in slide-in-from-top-2 duration-300 p-4 bg-gray-50 rounded-lg border border-gray-200">
                <div className="flex items-center justify-between mb-3">
                  <label className="block text-sm font-medium text-gray-900">Select Values to Include</label>
                  <div className="flex gap-3 text-xs font-medium">
                    <button onClick={() => setSelectedValues(uniqueValues)} className="text-blue-600 hover:text-blue-800">Select All</button>
                    <button onClick={() => setSelectedValues([])} className="text-gray-500 hover:text-gray-700">Clear All</button>
                  </div>
                </div>
                <div className="max-h-48 overflow-y-auto pr-2 grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {uniqueValues.map(val => (
                    <label key={val} className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 rounded hover:bg-blue-50 hover:border-blue-200 cursor-pointer transition-colors">
                      <input 
                        type="checkbox" 
                        className="rounded text-blue-600 focus:ring-blue-500 border-gray-300"
                        checked={selectedValues.includes(val)}
                        onChange={() => toggleValueSelection(val)}
                      />
                      <span className="text-sm text-gray-700 truncate" title={val}>{val}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            <div className="flex items-center justify-between pt-6 border-t border-gray-100">
              <button className="flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors" onClick={() => setStep(2)}>
                <ChevronLeft size={16} /> Back
              </button>
              <button 
                className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm" 
                onClick={handlePreview} 
                disabled={!emailColumn || isLoading}
              >
                {isLoading ? 'Processing...' : 'Next Step'} <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}

        {step === 4 && previewData && (
          <div className="space-y-6 animate-in fade-in slide-in-from-right-2 duration-300">
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-gray-50 border border-gray-100 rounded-xl p-6 text-center shadow-sm">
                <div className="text-3xl font-bold text-gray-900 mb-1">{previewData.totalRows}</div>
                <div className="text-sm font-medium text-gray-500 uppercase tracking-wider">Total Rows Found</div>
              </div>
              <div className="bg-blue-50 border border-blue-100 rounded-xl p-6 text-center shadow-sm relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-1 bg-blue-500"></div>
                <div className="text-3xl font-bold text-blue-600 mb-1">{previewData.filteredCount}</div>
                <div className="text-sm font-medium text-blue-800 uppercase tracking-wider">Valid Recipients</div>
              </div>
            </div>

            <div>
              <h4 className="text-sm font-semibold text-gray-900 mb-3">Recipients to import</h4>
              <div className="border border-gray-100 rounded-xl overflow-hidden divide-y divide-gray-100 bg-white">
                {(previewData.sampleRows || previewData.data.slice(0, 5)).map((row, index) => (
                  <div key={`${getEmail(row)}-${index}`} className="flex items-center gap-3 px-4 py-3">
                    <div className="w-9 h-9 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                      <UserRound size={17} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-gray-900 truncate">
                        {getName(row) || getEmail(row) || 'Unnamed recipient'}
                      </div>
                      <div className="text-xs text-gray-500 truncate flex items-center gap-1.5">
                        <Mail size={12} /> {getEmail(row)}
                      </div>
                    </div>
                    {getRole(row) && (
                      <span className="hidden sm:inline-flex px-2 py-1 rounded-md bg-gray-100 text-xs font-medium text-gray-600 max-w-[160px] truncate">
                        {getRole(row)}
                      </span>
                    )}
                  </div>
                ))}
              </div>
              {previewData.filteredCount > 5 && (
                <p className="text-xs text-gray-500 mt-2">
                  Showing 5 of {previewData.filteredCount} recipients.
                </p>
              )}
            </div>

            <div>
              <h4 className="text-sm font-semibold text-gray-900 mb-3">Available Personalization Variables</h4>
              <div className="flex flex-wrap gap-2 p-4 bg-gray-50 rounded-lg border border-gray-100">
                {columns.map(c => (
                  <span key={c} className="px-2.5 py-1 bg-white border border-gray-200 text-gray-700 rounded text-xs font-mono shadow-sm">
                    {`{{${c}}}`}
                  </span>
                ))}
              </div>
              <p className="text-xs text-gray-500 mt-2">You can use these variables in your email subject and body.</p>
            </div>

            <div className="flex items-center justify-between pt-6 border-t border-gray-100">
              <button className="flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors" onClick={() => setStep(3)}>
                <ChevronLeft size={16} /> Back
              </button>
              <button 
                className="px-6 py-2.5 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors shadow-sm" 
                onClick={handleImport}
              >
                Import {previewData.filteredCount} Recipients
              </button>
            </div>
          </div>
        )}

        {step === 5 && importedSummary && (
          <div className="space-y-6 animate-in fade-in slide-in-from-right-2 duration-300">
            <div className="flex items-start gap-4 rounded-xl border border-emerald-100 bg-emerald-50 p-5">
              <div className="w-11 h-11 rounded-full bg-white text-emerald-600 flex items-center justify-center shrink-0 border border-emerald-100">
                <CheckCircle2 size={24} />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-emerald-950">
                  {importedSummary.count} recipients imported
                </h3>
                <p className="text-sm text-emerald-800 mt-1">
                  These recipients are now attached to the campaign draft. You can use their columns as personalization variables.
                </p>
              </div>
            </div>

            <div>
              <h4 className="text-sm font-semibold text-gray-900 mb-3">Imported people</h4>
              <div className="border border-gray-100 rounded-xl overflow-hidden divide-y divide-gray-100 bg-white">
                {importedSummary.sampleRows.map((row, index) => (
                  <div key={`${getEmail(row)}-${index}`} className="flex items-center gap-3 px-4 py-3">
                    <div className="w-9 h-9 rounded-full bg-gray-100 text-gray-500 flex items-center justify-center shrink-0">
                      <UserRound size={17} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-gray-900 truncate">
                        {getName(row) || getEmail(row) || 'Unnamed recipient'}
                      </div>
                      <div className="text-xs text-gray-500 truncate">{getEmail(row)}</div>
                    </div>
                    {getRole(row) && (
                      <span className="hidden sm:inline-flex px-2 py-1 rounded-md bg-blue-50 text-xs font-medium text-blue-700 max-w-[160px] truncate">
                        {getRole(row)}
                      </span>
                    )}
                  </div>
                ))}
              </div>
              {importedSummary.count > importedSummary.sampleRows.length && (
                <p className="text-xs text-gray-500 mt-2">
                  Showing {importedSummary.sampleRows.length} of {importedSummary.count} imported recipients.
                </p>
              )}
            </div>

            <div className="flex justify-end pt-6 border-t border-gray-100">
              <button className="px-6 py-2.5 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors shadow-sm" onClick={handleDone}>
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};

export default RecipientSelector;
