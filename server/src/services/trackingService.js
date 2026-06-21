const { v4: uuidv4 } = require('uuid');

const generateTrackingId = () => {
  return uuidv4();
};

const injectTrackingPixel = (html, trackingId, baseUrl) => {
  if (!html) return html;
  
  const pixelUrl = `${baseUrl}/t/${trackingId}/pixel.png`;
  const pixelTag = `<img src="${pixelUrl}" width="1" height="1" style="display:none" alt="" />`;
  
  // Inject before closing body tag if it exists, otherwise append to end
  if (html.includes('</body>')) {
    return html.replace('</body>', `${pixelTag}</body>`);
  } else {
    return html + pixelTag;
  }
};

const rewriteLinks = (html, trackingId, baseUrl) => {
  if (!html) return html;

  // Regex to match <a href="url"> and replace the url
  // Note: This is a simple regex that works for most standard HTML links
  const linkRegex = /<a\s+(?:[^>]*?\s+)?href=["'](.*?)["']/gi;
  
  return html.replace(linkRegex, (match, url) => {
    // Don't rewrite mailto:, tel:, or anchor links
    if (url.startsWith('mailto:') || url.startsWith('tel:') || url.startsWith('#')) {
      return match;
    }
    
    const encodedUrl = encodeURIComponent(url);
    const trackingUrl = `${baseUrl}/t/${trackingId}/click?url=${encodedUrl}`;
    
    // Replace the original url with the tracking url
    return match.replace(url, trackingUrl);
  });
};

module.exports = {
  generateTrackingId,
  injectTrackingPixel,
  rewriteLinks
};
