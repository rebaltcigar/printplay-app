/**
 * Utility for converting various logo URL formats (like Google Drive) 
 * into direct image links.
 */
export const convertLogoUrl = (url) => {
    if (!url) return '';

    // Extract ID from various Google Drive formats
    let id = '';

    // Format: /file/d/ID/view
    const fileDMatch = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
    if (fileDMatch) id = fileDMatch[1];

    // Format: id=ID
    if (!id) {
        const idMatch = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
        if (idMatch) id = idMatch[1];
    }

    if (id && (url.includes('drive.google.com') || url.includes('docs.google.com'))) {
        // Thumbnail is generally more CORS-friendly and faster for UI
        return `https://drive.google.com/thumbnail?id=${id}&sz=w1000`;
    }

    return url;
};
