/**
 * Utility for converting various logo URL formats (like Google Drive) 
 * into direct image links.
 */
export const convertLogoUrl = (url) => {
    if (!url) return '';

    // Handle Google Drive /file/d/ID/view
    const fileDMatch = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
    if (fileDMatch && fileDMatch[1]) {
        return `https://drive.google.com/thumbnail?id=${fileDMatch[1]}&sz=w1000`;
    }

    // Handle Google Drive /open?id=ID
    const openIdMatch = url.match(/id=([a-zA-Z0-9_-]+)/);
    if (url.includes('drive.google.com') && openIdMatch && openIdMatch[1]) {
        return `https://drive.google.com/thumbnail?id=${openIdMatch[1]}&sz=w1000`;
    }

    return url;
};
