export interface ExternalDocumentMetadata {
  isGoogleDrive: boolean;
  provider: 'google_drive' | 'generic';
  fileType: 'doc' | 'sheet' | 'slide' | 'file' | 'generic';
  previewUrl: string;
  originalUrl: string;
  detectedMimeType: string;
}

/**
 * Infer MIME type from file extension if present.
 */
export function inferMimeType(fileName?: string): string | null {
  if (!fileName || typeof fileName !== 'string') return null;
  const lower = fileName.trim().toLowerCase();
  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.svg')) return 'image/svg+xml';
  if (lower.endsWith('.txt')) return 'text/plain';
  if (lower.endsWith('.csv')) return 'text/csv';
  if (lower.endsWith('.md')) return 'text/markdown';
  if (lower.endsWith('.json')) return 'application/json';
  if (lower.endsWith('.docx')) return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  if (lower.endsWith('.xlsx')) return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  if (lower.endsWith('.pptx')) return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
  if (lower.endsWith('.doc')) return 'application/msword';
  if (lower.endsWith('.xls')) return 'application/vnd.ms-excel';
  if (lower.endsWith('.ppt')) return 'application/vnd.ms-powerpoint';
  if (lower.endsWith('.zip')) return 'application/zip';
  if (lower.endsWith('.rtf')) return 'application/rtf';
  if (lower.endsWith('.html') || lower.endsWith('.htm')) return 'text/html';
  if (lower.endsWith('.xml')) return 'application/xml';
  if (lower.endsWith('.bmp')) return 'image/bmp';
  if (lower.endsWith('.tiff') || lower.endsWith('.tif')) return 'image/tiff';
  if (lower.endsWith('.7z')) return 'application/x-7z-compressed';
  if (lower.endsWith('.tar')) return 'application/x-tar';
  if (lower.endsWith('.gz')) return 'application/gzip';
  return null;
}

/**
 * Infer MIME type from the pathname of a URL if possible.
 * Uses URL parsing to safely isolate pathname segments from hostnames and query params.
 */
export function inferMimeTypeFromUrl(url?: string): string | null {
  if (!url || typeof url !== 'string') return null;
  try {
    let pathname = '';
    let parsedUrl: URL | null = null;
    try {
      parsedUrl = new URL(url);
      pathname = parsedUrl.pathname;
    } catch {
      pathname = url.split(/[?#]/)[0] || '';
    }
    const lastSegment = pathname.split('/').filter(Boolean).pop();
    if (lastSegment && lastSegment.includes('.')) {
      const decoded = decodeURIComponent(lastSegment).trim();
      const mime = inferMimeType(decoded);
      if (mime) return mime;
    }

    if (parsedUrl) {
      for (const param of ['filename', 'fileName', 'file', 'name', 'title']) {
        const val = parsedUrl.searchParams.get(param);
        if (val && val.includes('.')) {
          const mime = inferMimeType(decodeURIComponent(val).trim());
          if (mime) return mime;
        }
      }
      const rcd = parsedUrl.searchParams.get('response-content-disposition');
      if (rcd) {
        const match = rcd.match(/filename\*?=['"]?(?:UTF-\d['"]*)?([^'";\n]+)['"]?/i);
        if (match && match[1]) {
          const mime = inferMimeType(decodeURIComponent(match[1]).trim());
          if (mime) return mime;
        }
      }
    }
  } catch {
    // Ignore parsing issues and return null
  }
  return null;
}

/**
 * Transforms Google Drive / Google Docs URLs into embeddable /preview links
 * and infers document metadata & MIME types.
 */
export function parseExternalUrl(url: string, fileName?: string): ExternalDocumentMetadata {
  if (!url || typeof url !== 'string') {
    return {
      isGoogleDrive: false,
      provider: 'generic',
      fileType: 'generic',
      previewUrl: '',
      originalUrl: '',
      detectedMimeType: inferMimeType(fileName) || 'application/octet-stream',
    };
  }

  const trimmed = url.trim().replace(/^["']|["']$/g, '').trim();
  if (!trimmed) {
    return {
      isGoogleDrive: false,
      provider: 'generic',
      fileType: 'generic',
      previewUrl: '',
      originalUrl: '',
      detectedMimeType: inferMimeType(fileName) || 'application/octet-stream',
    };
  }

  // 1. Google Docs (/document/d/{id}/... or with /u/{n}/ or /a/{domain}/)
  const docMatch = trimmed.match(
    /https?:\/\/docs\.google\.com\/(?:(?:u\/\d+|a\/[^/]+)\/)*document\/(?:(?:u\/\d+|a\/[^/]+)\/)*d\/([a-zA-Z0-9_-]+)/i
  );
  if (docMatch) {
    const id = docMatch[1];
    return {
      isGoogleDrive: true,
      provider: 'google_drive',
      fileType: 'doc',
      previewUrl: `https://docs.google.com/document/d/${id}/preview`,
      originalUrl: trimmed,
      detectedMimeType: 'application/vnd.google-apps.document',
    };
  }

  // 2. Google Sheets (/spreadsheets/d/{id}/... or with /u/{n}/ or /a/{domain}/)
  const sheetMatch = trimmed.match(
    /https?:\/\/docs\.google\.com\/(?:(?:u\/\d+|a\/[^/]+)\/)*spreadsheets\/(?:(?:u\/\d+|a\/[^/]+)\/)*d\/([a-zA-Z0-9_-]+)/i
  );
  if (sheetMatch) {
    const id = sheetMatch[1];
    return {
      isGoogleDrive: true,
      provider: 'google_drive',
      fileType: 'sheet',
      previewUrl: `https://docs.google.com/spreadsheets/d/${id}/preview`,
      originalUrl: trimmed,
      detectedMimeType: 'application/vnd.google-apps.spreadsheet',
    };
  }

  // 3. Google Slides (/presentation/d/{id}/... or with /u/{n}/ or /a/{domain}/)
  const slideMatch = trimmed.match(
    /https?:\/\/docs\.google\.com\/(?:(?:u\/\d+|a\/[^/]+)\/)*presentation\/(?:(?:u\/\d+|a\/[^/]+)\/)*d\/([a-zA-Z0-9_-]+)/i
  );
  if (slideMatch) {
    const id = slideMatch[1];
    return {
      isGoogleDrive: true,
      provider: 'google_drive',
      fileType: 'slide',
      previewUrl: `https://docs.google.com/presentation/d/${id}/preview`,
      originalUrl: trimmed,
      detectedMimeType: 'application/vnd.google-apps.presentation',
    };
  }

  // 4. Google Drive File (/file/d/{id}/..., /d/{id}, /open/d/{id}, with /u/{n}/ or /a/{domain}/)
  const fileMatch = trimmed.match(
    /https?:\/\/(?:drive|docs)\.google\.com\/(?:(?:u\/\d+|a\/[^/]+)\/)*(?:file\/|open\/)?(?:(?:u\/\d+|a\/[^/]+)\/)*d\/([a-zA-Z0-9_-]+)/i
  );
  if (fileMatch) {
    const id = fileMatch[1];
    return {
      isGoogleDrive: true,
      provider: 'google_drive',
      fileType: 'file',
      previewUrl: `https://drive.google.com/file/d/${id}/preview`,
      originalUrl: trimmed,
      detectedMimeType: inferMimeType(fileName) || inferMimeTypeFromUrl(trimmed) || 'application/pdf',
    };
  }

  // 5. Google Drive Open or direct by ID (?id={id}, open?id={id}, uc?id={id})
  const openMatch = trimmed.match(/https?:\/\/(?:drive|docs)\.google\.com\/[^?#]*[?&]id=([a-zA-Z0-9_-]+)/i);
  if (openMatch) {
    const id = openMatch[1];
    return {
      isGoogleDrive: true,
      provider: 'google_drive',
      fileType: 'file',
      previewUrl: `https://drive.google.com/file/d/${id}/preview`,
      originalUrl: trimmed,
      detectedMimeType: inferMimeType(fileName) || inferMimeTypeFromUrl(trimmed) || 'application/pdf',
    };
  }

  return {
    isGoogleDrive: false,
    provider: 'generic',
    fileType: 'generic',
    previewUrl: trimmed,
    originalUrl: trimmed,
    detectedMimeType: inferMimeType(fileName) || inferMimeTypeFromUrl(trimmed) || 'application/octet-stream',
  };
}
