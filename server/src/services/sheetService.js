const { google } = require('googleapis');
const { getOAuth2Client } = require('../config/google');

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
const getSheetsApi = async () => {
  const auth = await getOAuth2Client();
  return google.sheets({ version: 'v4', auth });
};

/**
 * Gets all sheet names (tabs) from a spreadsheet
 */
const getSheetNames = async (spreadsheetUrl) => {
  try {
    const spreadsheetId = extractSpreadsheetId(spreadsheetUrl);
    const sheetsApi = await getSheetsApi();
    
    const response = await sheetsApi.spreadsheets.get({
      spreadsheetId,
      fields: 'sheets.properties.title'
    });
    
    return response.data.sheets.map(sheet => sheet.properties.title);
  } catch (error) {
    console.error('Error fetching sheet names:', error);
    throw new Error('Failed to fetch sheet names. Check URL and permissions.');
  }
};

/**
 * Gets the column headers (first row) from a specific sheet
 */
const getColumns = async (spreadsheetUrl, sheetName) => {
  try {
    const spreadsheetId = extractSpreadsheetId(spreadsheetUrl);
    const sheetsApi = await getSheetsApi();
    
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
    console.error('Error fetching columns:', error);
    throw new Error(`Failed to fetch columns from sheet ${sheetName}.`);
  }
};

/**
 * Gets all data from a specific sheet, formatted as array of objects
 */
const getSheetData = async (spreadsheetUrl, sheetName) => {
  try {
    const spreadsheetId = extractSpreadsheetId(spreadsheetUrl);
    const sheetsApi = await getSheetsApi();
    
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
    console.error('Error fetching sheet data:', error);
    throw new Error(`Failed to fetch data from sheet ${sheetName}.`);
  }
};

/**
 * Gets unique values for a specific column in a sheet
 */
const getUniqueValues = async (spreadsheetUrl, sheetName, columnName) => {
  try {
    const data = await getSheetData(spreadsheetUrl, sheetName);
    
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
