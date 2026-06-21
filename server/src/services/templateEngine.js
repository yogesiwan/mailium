/**
 * Replaces {{placeholder}} tags in a string with values from the data object
 * @param {string} template - The template string with {{placeholders}}
 * @param {Object} data - The data object containing values
 * @returns {string} - The processed string
 */
const replacePlaceholders = (template, data) => {
  if (!template) return template;
  if (!data) return template;

  const placeholderRegex = /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g;
  
  return template.replace(placeholderRegex, (match, key) => {
    // If the key exists in data, replace it. Otherwise, leave it as is or replace with empty string
    // Let's replace with data value if it exists and is not null/undefined, else empty string
    const value = data[key];
    if (value !== undefined && value !== null) {
      return value;
    }
    // Return empty string for missing placeholders to avoid sending {{name}} in emails
    return '';
  });
};

/**
 * Extracts all unique placeholder keys from a template string
 * @param {string} template - The template string
 * @returns {Array<string>} - Array of placeholder names
 */
const extractPlaceholders = (template) => {
  if (!template) return [];

  const placeholderRegex = /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g;
  const matches = [...template.matchAll(placeholderRegex)];
  
  // Return unique keys
  return [...new Set(matches.map(m => m[1]))];
};

module.exports = {
  replacePlaceholders,
  extractPlaceholders
};
