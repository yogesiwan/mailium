// A 1x1 transparent PNG pixel buffer
// Base64 string for a 1x1 transparent PNG
const pixelBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACklEQVR4nGMAAQAABQABDQottAAAAABJRU5ErkJggg==";

const getPixelImage = () => {
  return Buffer.from(pixelBase64, 'base64');
};

module.exports = {
  getPixelImage
};
