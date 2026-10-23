const QRCode = require('qrcode');

// Generates a QR code as a base64 data URL for the given fundraiser link.
// In production, upload this to cloud storage and store the resulting URL instead.
async function generateQrCodeDataUrl(url) {
  return QRCode.toDataURL(url);
}

module.exports = { generateQrCodeDataUrl };
