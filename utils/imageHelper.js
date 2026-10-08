import { Platform } from 'react-native';
import { decode } from 'base64-arraybuffer';

/**
 * Ensures an image is cropped to a 1:1 square format.
 * On Web, uses HTML5 Canvas to crop the center 1:1 square.
 * On Native, Expo Image Picker's native crop UI handles it.
 */
export async function cropImageToSquare(imageAsset) {
  if (!imageAsset || !imageAsset.uri) return imageAsset;

  if (Platform.OS === 'web' && typeof document !== 'undefined') {
    return new Promise((resolve) => {
      const img = new window.Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        try {
          const side = Math.min(img.width, img.height);
          const startX = (img.width - side) / 2;
          const startY = (img.height - side) / 2;

          const targetSize = Math.min(side, 800); // 800x800 square
          const canvas = document.createElement('canvas');
          canvas.width = targetSize;
          canvas.height = targetSize;

          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, startX, startY, side, side, 0, 0, targetSize, targetSize);

          const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
          const cleanBase64 = dataUrl.replace(/^data:image\/\w+;base64,/, '');

          canvas.toBlob(
            (blob) => {
              resolve({
                ...imageAsset,
                uri: dataUrl,
                base64: cleanBase64,
                blob,
                width: targetSize,
                height: targetSize,
              });
            },
            'image/jpeg',
            0.85
          );
        } catch (e) {
          console.warn('Canvas 1:1 crop fallback:', e);
          resolve(imageAsset);
        }
      };
      img.onerror = () => {
        resolve(imageAsset);
      };
      img.src = imageAsset.uri;
    });
  }

  // Native
  return imageAsset;
}

/**
 * Prepares image binary payload for Supabase Storage upload
 * Handles both Web (Blob) and Native (ArrayBuffer / Blob).
 */
export async function prepareUploadPayload(imageAsset) {
  if (Platform.OS === 'web') {
    if (imageAsset.blob) {
      return imageAsset.blob;
    }
    const res = await fetch(imageAsset.uri);
    return await res.blob();
  }

  // Native iOS / Android
  if (imageAsset.base64) {
    const clean = imageAsset.base64.replace(/^data:image\/\w+;base64,/, '');
    return decode(clean);
  }

  const res = await fetch(imageAsset.uri);
  return await res.blob();
}
