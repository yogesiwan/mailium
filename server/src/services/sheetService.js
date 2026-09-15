const { google } = require('googleapis');
const { getOAuth2Client } = require('../config/google');

const getGoogleApiFailure = (error, fallbackMessage) => {
  const googleError = error?.response?.data?.error;
  const googleMessage = error?.response?.data?.error_description || error?.response?.data?.message;
  const status = error?.response?.status || error?.code;

  if (error.message === 'Invalid Google Sheets URL') {
    const err = new Error('Invalid Google Sheets URL. Paste a full docs.google.com/spreadsheets link.');
    err.statusCode = 400;
    err.code = 'INVALID_SHEET_URL';
    return err;
  }

  if (googleError === 'invalid_grant') {
    const err = new Error('Google authorization expired or was revoked. Update GOOGLE_REFRESH_TOKEN in the server env, then restart the backend. In-app reconnect requires an HTTPS deployment first.');
    err.statusCode = 401;
    err.code = 'GOOGLE_AUTH_EXPIRED';
    return err;
  }

  if (status === 403) {
    const err = new Error('Google Sheets access was denied. Share the spreadsheet with the connected Google account or reconnect Google with Sheets permission.');
    err.statusCode = 403;
    err.code = 'SHEET_ACCESS_DENIED';
    return err;
  }

  if (status === 404) {
    const err = new Error('Google spreadsheet was not found. Check the URL and whether the connected account can access it.');
    err.statusCode = 404;
    err.code = 'SHEET_NOT_FOUND';
    return err;
  }

  const err = new Error(googleMessage || fallbackMessage);
  err.statusCode = Number.isInteger(status) ? status : 500;
  err.code = googleError || 'GOOGLE_SHEETS_ERROR';
  return err;
};

const logSheetError = (label, error) => {
  console.error(label, {
    message: error.message,
    status: error?.response?.status || error?.code,
    googleError: error?.response?.data?.error,
    googleDescription: error?.response?.data?.error_description
  });
};

/**
 * Extracts spreadsheet ID from a Google Sheets URL
 */
const extractSpreadsheetId = (url) => {
  const match = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
  if (match && match[1]) {
    return match[1];
  }
  throw new Error('Invalid Google Sheets URL');
};

/**
 * Gets the sheets API instance
 */
const getSheetsApi = async (userId) => {
  const auth = await getOAuth2Client(userId);
  return google.sheets({ version: 'v4', auth });
};

/**
 * Gets all sheet names (tabs) from a spreadsheet
 */
const getSheetNames = async (spreadsheetUrl, userId) => {
  try {
    const spreadsheetId = extractSpreadsheetId(spreadsheetUrl);
    const sheetsApi = await getSheetsApi(userId);
    
    const response = await sheetsApi.spreadsheets.get({
      spreadsheetId,
      fields: 'sheets.properties.title'
    });
    
    return response.data.sheets.map(sheet => sheet.properties.title);
  } catch (error) {
    logSheetError('Error fetching sheet names:', error);
    throw getGoogleApiFailure(error, 'Failed to fetch sheet names. Check URL and permissions.');
  }
};

/**
 * Gets the column headers (first row) from a specific sheet
 */
const getColumns = async (spreadsheetUrl, sheetName, userId) => {
  try {
    const spreadsheetId = extractSpreadsheetId(spreadsheetUrl);
    const sheetsApi = await getSheetsApi(userId);
    
    const response = await sheetsApi.spreadsheets.values.get({
      spreadsheetId,
      range: `${sheetName}!1:1` // Get only the first row
    });
    
    const rows = response.data.values;
    if (!rows || rows.length === 0) {
      return [];
    }
    
    return rows[0]; // First row contains headers
  } catch (error) {
    logSheetError('Error fetching columns:', error);
    throw getGoogleApiFailure(error, `Failed to fetch columns from sheet ${sheetName}.`);
  }
};

/**
 * Gets all data from a specific sheet, formatted as array of objects
 */
const getSheetData = async (spreadsheetUrl, sheetName, userId) => {
  try {
    const spreadsheetId = extractSpreadsheetId(spreadsheetUrl);
    const sheetsApi = await getSheetsApi(userId);
    
    const response = await sheetsApi.spreadsheets.values.get({
      spreadsheetId,
      range: sheetName
    });
    
    const rows = response.data.values;
    if (!rows || rows.length === 0) {
      return [];
    }
    
    const headers = rows[0];
    const dataRows = rows.slice(1);
    
    // Map each row to an object using headers as keys
    return dataRows.map(row => {
      const obj = {};
      headers.forEach((header, index) => {
        // Handle case where row might be shorter than headers
        obj[header] = row[index] !== undefined ? row[index] : '';
      });
      return obj;
    });
  } catch (error) {
    logSheetError('Error fetching sheet data:', error);
    throw getGoogleApiFailure(error, `Failed to fetch data from sheet ${sheetName}.`);
  }
};

/**
 * Gets unique values for a specific column in a sheet
 */
const getUniqueValues = async (spreadsheetUrl, sheetName, columnName, userId) => {
  try {
    const data = await getSheetData(spreadsheetUrl, sheetName, userId);
    
    // Extract column values, remove empty/undefined
    const values = data
      .map(row => row[columnName])
      .filter(val => val !== undefined && val !== null && val.trim() !== '');
      
    // Return unique values
    return [...new Set(values)].sort();
  } catch (error) {
    console.error('Error fetching unique values:', error);
    throw new Error(`Failed to fetch unique values for column ${columnName}.`);
  }
};

module.exports = {
  extractSpreadsheetId,
  getSheetNames,
  getColumns,
  getSheetData,
  getUniqueValues
};
