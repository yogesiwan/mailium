const { protect } = require("../middleware/auth");
const express = require('express');
const router = express.Router();
router.use(protect);
const sheetService = require('../services/sheetService');

// @route   POST /api/sheets/names
// @desc    Get sheet names from spreadsheet URL
router.post('/names', async (req, res, next) => {
  try {
    const { spreadsheetUrl } = req.body;
    if (!spreadsheetUrl) {
      return res.status(400).json({ success: false, error: 'Please provide spreadsheetUrl' });
    }

    const sheets = await sheetService.getSheetNames(spreadsheetUrl, req.user._id);
    res.json({ success: true, sheets });
  } catch (err) {
    next(err);
  }
});

// @route   POST /api/sheets/columns
// @desc    Get columns from a specific sheet
router.post('/columns', async (req, res, next) => {
  try {
    const { spreadsheetUrl, sheetName } = req.body;
    if (!spreadsheetUrl || !sheetName) {
      return res.status(400).json({ success: false, error: 'Please provide spreadsheetUrl and sheetName' });
    }

    const columns = await sheetService.getColumns(spreadsheetUrl, sheetName, req.user._id);
    res.json({ success: true, columns });
  } catch (err) {
    next(err);
  }
});

// @route   POST /api/sheets/unique-values
// @desc    Get unique values for a column
router.post('/unique-values', async (req, res, next) => {
  try {
    const { spreadsheetUrl, sheetName, column } = req.body;
    if (!spreadsheetUrl || !sheetName || !column) {
      return res.status(400).json({ success: false, error: 'Please provide spreadsheetUrl, sheetName, and column' });
    }

    const values = await sheetService.getUniqueValues(spreadsheetUrl, sheetName, column, req.user._id);
    res.json({ success: true, values });
  } catch (err) {
    next(err);
  }
});

// @route   POST /api/sheets/preview
// @desc    Preview recipients (with filtering)
router.post('/preview', async (req, res, next) => {
  try {
    const { spreadsheetUrl, sheetName, filterColumn, filterValues, emailColumn } = req.body;
    if (!spreadsheetUrl || !sheetName || !emailColumn) {
      return res.status(400).json({ success: false, error: 'Please provide spreadsheetUrl, sheetName, and emailColumn' });
    }

    const data = await sheetService.getSheetData(spreadsheetUrl, sheetName, req.user._id);
    const totalRows = data.length;

    // Filter data
    let filteredData = data;
    if (filterColumn && filterValues && filterValues.length > 0) {
      filteredData = data.filter(row => filterValues.includes(row[filterColumn]));
    }

    // Ensure email is present
    filteredData = filteredData.filter(row => row[emailColumn] && row[emailColumn].trim() !== '');

    const filteredCount = filteredData.length;
    
    // Return a sample for preview
    const sampleRows = filteredData.slice(0, 5);

    res.json({ 
      success: true, 
      totalRows, 
      filteredCount, 
      sampleRows,
      // Provide the full data so the frontend can send it to the import route
      data: filteredData 
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
