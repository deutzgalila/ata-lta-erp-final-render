import { describe, it, expect } from 'vitest';
import { parseExternalUrl, inferMimeType, inferMimeTypeFromUrl } from '../utils/googleDrive';

describe('googleDrive utility', () => {
  describe('inferMimeType', () => {
    it('infers PDF correctly', () => {
      expect(inferMimeType('document.pdf')).toBe('application/pdf');
      expect(inferMimeType('DOCUMENT.PDF')).toBe('application/pdf');
    });

    it('infers images correctly', () => {
      expect(inferMimeType('photo.png')).toBe('image/png');
      expect(inferMimeType('image.jpg')).toBe('image/jpeg');
      expect(inferMimeType('image.jpeg')).toBe('image/jpeg');
      expect(inferMimeType('graphic.webp')).toBe('image/webp');
      expect(inferMimeType('vector.svg')).toBe('image/svg+xml');
    });

    it('infers office documents correctly (modern and legacy)', () => {
      expect(inferMimeType('report.docx')).toBe(
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      );
      expect(inferMimeType('spreadsheet.xlsx')).toBe(
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      expect(inferMimeType('slides.pptx')).toBe(
        'application/vnd.openxmlformats-officedocument.presentationml.presentation'
      );
      expect(inferMimeType('legacy_contract.doc')).toBe('application/msword');
      expect(inferMimeType('legacy_budget.xls')).toBe('application/vnd.ms-excel');
      expect(inferMimeType('legacy_pitch.ppt')).toBe('application/vnd.ms-powerpoint');
      expect(inferMimeType('archive.zip')).toBe('application/zip');
      expect(inferMimeType('formatted.rtf')).toBe('application/rtf');
    });

    it('infers text files correctly', () => {
      expect(inferMimeType('notes.txt')).toBe('text/plain');
      expect(inferMimeType('data.csv')).toBe('text/csv');
      expect(inferMimeType('readme.md')).toBe('text/markdown');
      expect(inferMimeType('config.json')).toBe('application/json');
    });

    it('infers web, markup, archive, and image formats correctly', () => {
      expect(inferMimeType('index.html')).toBe('text/html');
      expect(inferMimeType('document.htm')).toBe('text/html');
      expect(inferMimeType('data.xml')).toBe('application/xml');
      expect(inferMimeType('photo.bmp')).toBe('image/bmp');
      expect(inferMimeType('scan.tiff')).toBe('image/tiff');
      expect(inferMimeType('archive.7z')).toBe('application/x-7z-compressed');
      expect(inferMimeType('bundle.tar')).toBe('application/x-tar');
      expect(inferMimeType('compressed.gz')).toBe('application/gzip');
    });

    it('returns null for unknown extensions or missing filename', () => {
      expect(inferMimeType(undefined)).toBeNull();
      expect(inferMimeType('')).toBeNull();
      expect(inferMimeType('unknown_file')).toBeNull();
      expect(inferMimeType('file.xyz123')).toBeNull();
    });
  });

  describe('inferMimeTypeFromUrl', () => {
    it('infers MIME type from URL path when filename has an extension', () => {
      expect(inferMimeTypeFromUrl('https://example.com/downloads/annual-audit.pdf')).toBe('application/pdf');
      expect(inferMimeTypeFromUrl('https://example.com/reports/sheet.xlsx?token=abc#hash')).toBe(
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      expect(inferMimeTypeFromUrl('https://example.com/docs/letter.doc')).toBe('application/msword');
    });

    it('handles trailing slashes and URL encoded path segments', () => {
      expect(inferMimeTypeFromUrl('https://example.com/downloads/annual-audit.pdf/')).toBe('application/pdf');
      expect(inferMimeTypeFromUrl('https://example.com/reports/board%20resolution.docx')).toBe(
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      );
    });

    it('infers MIME type from query parameters and response-content-disposition when pathname lacks extension', () => {
      expect(inferMimeTypeFromUrl('https://storage.googleapis.com/api/get-doc?filename=audit_findings.pdf')).toBe(
        'application/pdf'
      );
      expect(
        inferMimeTypeFromUrl(
          'https://s3.amazonaws.com/bucket/key?response-content-disposition=attachment%3B%20filename%3D%22budget.xlsx%22'
        )
      ).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      expect(inferMimeTypeFromUrl('https://example.com/download?file=notes.txt')).toBe('text/plain');
    });

    it('returns null for URLs without file extensions', () => {
      expect(inferMimeTypeFromUrl('https://example.com/dashboard/home')).toBeNull();
      expect(inferMimeTypeFromUrl('')).toBeNull();
      expect(inferMimeTypeFromUrl(undefined)).toBeNull();
    });
  });

  describe('parseExternalUrl', () => {
    it('handles Google Docs edit and share URLs', () => {
      const url = 'https://docs.google.com/document/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs/edit?usp=sharing';
      const result = parseExternalUrl(url);

      expect(result.isGoogleDrive).toBe(true);
      expect(result.provider).toBe('google_drive');
      expect(result.fileType).toBe('doc');
      expect(result.previewUrl).toBe('https://docs.google.com/document/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs/preview');
      expect(result.originalUrl).toBe(url);
      expect(result.detectedMimeType).toBe('application/vnd.google-apps.document');
    });

    it('handles multi-account Google Docs URLs (/u/1/document/d/...)', () => {
      const url = 'https://docs.google.com/u/1/document/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs/edit';
      const result = parseExternalUrl(url);

      expect(result.isGoogleDrive).toBe(true);
      expect(result.provider).toBe('google_drive');
      expect(result.fileType).toBe('doc');
      expect(result.previewUrl).toBe('https://docs.google.com/document/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs/preview');
    });

    it('handles Google Sheets URLs and multi-account sheets URLs', () => {
      const url = 'https://docs.google.com/spreadsheets/d/1abcXYZ_456-def/edit#gid=0';
      const result = parseExternalUrl(url);

      expect(result.isGoogleDrive).toBe(true);
      expect(result.provider).toBe('google_drive');
      expect(result.fileType).toBe('sheet');
      expect(result.previewUrl).toBe('https://docs.google.com/spreadsheets/d/1abcXYZ_456-def/preview');
      expect(result.originalUrl).toBe(url);
      expect(result.detectedMimeType).toBe('application/vnd.google-apps.spreadsheet');

      const multiAccountUrl = 'https://docs.google.com/u/2/spreadsheets/d/1abcXYZ_456-def/edit';
      const multiResult = parseExternalUrl(multiAccountUrl);
      expect(multiResult.isGoogleDrive).toBe(true);
      expect(multiResult.previewUrl).toBe('https://docs.google.com/spreadsheets/d/1abcXYZ_456-def/preview');
    });

    it('handles Google Slides URLs and multi-account slides URLs', () => {
      const url = 'https://docs.google.com/presentation/d/1slideId-999_xyz/edit?slide=id.p';
      const result = parseExternalUrl(url);

      expect(result.isGoogleDrive).toBe(true);
      expect(result.provider).toBe('google_drive');
      expect(result.fileType).toBe('slide');
      expect(result.previewUrl).toBe('https://docs.google.com/presentation/d/1slideId-999_xyz/preview');
      expect(result.originalUrl).toBe(url);
      expect(result.detectedMimeType).toBe('application/vnd.google-apps.presentation');

      const multiAccountUrl = 'https://docs.google.com/u/0/presentation/d/1slideId-999_xyz/edit';
      const multiResult = parseExternalUrl(multiAccountUrl);
      expect(multiResult.isGoogleDrive).toBe(true);
      expect(multiResult.previewUrl).toBe('https://docs.google.com/presentation/d/1slideId-999_xyz/preview');
    });

    it('handles Google Drive /file/d/{id}/view and /u/{n}/file/d/{id} URLs', () => {
      const url = 'https://drive.google.com/file/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs/view?usp=sharing';
      const result = parseExternalUrl(url, 'Proposal.pdf');

      expect(result.isGoogleDrive).toBe(true);
      expect(result.provider).toBe('google_drive');
      expect(result.fileType).toBe('file');
      expect(result.previewUrl).toBe('https://drive.google.com/file/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs/preview');
      expect(result.originalUrl).toBe(url);
      expect(result.detectedMimeType).toBe('application/pdf');

      const multiResult = parseExternalUrl('https://drive.google.com/u/1/file/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs/view');
      expect(multiResult.isGoogleDrive).toBe(true);
      expect(multiResult.previewUrl).toBe('https://drive.google.com/file/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs/preview');

      const docsDomainResult = parseExternalUrl('https://docs.google.com/file/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs/view');
      expect(docsDomainResult.isGoogleDrive).toBe(true);
      expect(docsDomainResult.previewUrl).toBe('https://drive.google.com/file/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs/preview');
    });

    it('handles Google Drive /d/{id} short URLs', () => {
      const url = 'https://drive.google.com/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs';
      const result = parseExternalUrl(url);

      expect(result.isGoogleDrive).toBe(true);
      expect(result.previewUrl).toBe('https://drive.google.com/file/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs/preview');
    });

    it('handles Google Drive /open?id={id} and /uc?id={id} direct links', () => {
      const openUrl = 'https://drive.google.com/open?id=1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs';
      const openResult = parseExternalUrl(openUrl);
      expect(openResult.isGoogleDrive).toBe(true);
      expect(openResult.fileType).toBe('file');
      expect(openResult.previewUrl).toBe('https://drive.google.com/file/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs/preview');
      expect(openResult.detectedMimeType).toBe('application/pdf');

      const ucUrl = 'https://drive.google.com/uc?id=1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs&export=download';
      const ucResult = parseExternalUrl(ucUrl, 'Financial_Model.xlsx');
      expect(ucResult.isGoogleDrive).toBe(true);
      expect(ucResult.previewUrl).toBe('https://drive.google.com/file/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs/preview');
      expect(ucResult.detectedMimeType).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    });

    it('infers accurate MIME type for legacy office documents in Google Drive', () => {
      const url = 'https://drive.google.com/file/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs/view';
      const docResult = parseExternalUrl(url, 'contract.doc');
      expect(docResult.detectedMimeType).toBe('application/msword');

      const xlsResult = parseExternalUrl(url, 'budget.xls');
      expect(xlsResult.detectedMimeType).toBe('application/vnd.ms-excel');

      const pptResult = parseExternalUrl(url, 'presentation.ppt');
      expect(pptResult.detectedMimeType).toBe('application/vnd.ms-powerpoint');
    });

    it('handles generic non-Google external URLs and detects MIME from filename or URL path', () => {
      const url = 'https://example.com/documents/contract.pdf';
      const result = parseExternalUrl(url, 'contract.pdf');

      expect(result.isGoogleDrive).toBe(false);
      expect(result.provider).toBe('generic');
      expect(result.fileType).toBe('generic');
      expect(result.previewUrl).toBe(url);
      expect(result.originalUrl).toBe(url);
      expect(result.detectedMimeType).toBe('application/pdf');

      // Detection from URL when fileName is omitted
      const urlOnlyResult = parseExternalUrl('https://example.com/files/report.xlsx');
      expect(urlOnlyResult.detectedMimeType).toBe(
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
    });

    it('handles Google Workspace enterprise domain URLs (/a/domain/...)', () => {
      const docUrl = 'https://docs.google.com/a/ata-lta.ph/document/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs/edit';
      const docResult = parseExternalUrl(docUrl);
      expect(docResult.isGoogleDrive).toBe(true);
      expect(docResult.previewUrl).toBe('https://docs.google.com/document/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs/preview');

      const sheetUrl = 'https://docs.google.com/a/ata-lta.ph/spreadsheets/d/1sheetId123/edit';
      const sheetResult = parseExternalUrl(sheetUrl);
      expect(sheetResult.isGoogleDrive).toBe(true);
      expect(sheetResult.previewUrl).toBe('https://docs.google.com/spreadsheets/d/1sheetId123/preview');

      const fileUrl = 'https://drive.google.com/a/ata-lta.ph/file/d/1fileId123/view';
      const fileResult = parseExternalUrl(fileUrl, 'Report.pdf');
      expect(fileResult.isGoogleDrive).toBe(true);
      expect(fileResult.previewUrl).toBe('https://drive.google.com/file/d/1fileId123/preview');
      expect(fileResult.detectedMimeType).toBe('application/pdf');
    });

    it('handles quoted URLs cleanly', () => {
      const quotedUrl = '"https://drive.google.com/file/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs/view"';
      const result = parseExternalUrl(quotedUrl, 'Attachment.pdf');
      expect(result.isGoogleDrive).toBe(true);
      expect(result.previewUrl).toBe('https://drive.google.com/file/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs/preview');
      expect(result.originalUrl).toBe('https://drive.google.com/file/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs/view');
    });

    it('does not falsely match domain hostnames as file extensions in inferMimeTypeFromUrl', () => {
      expect(inferMimeTypeFromUrl('https://company.doc/')).toBeNull();
      expect(inferMimeTypeFromUrl('https://myarchive.zip')).toBeNull();
    });

    it('handles empty, null, or invalid URLs gracefully', () => {
      const emptyResult = parseExternalUrl('');
      expect(emptyResult.isGoogleDrive).toBe(false);
      expect(emptyResult.detectedMimeType).toBe('application/octet-stream');

      // @ts-expect-error testing runtime robustness
      const nullResult = parseExternalUrl(null);
      expect(nullResult.isGoogleDrive).toBe(false);
      expect(nullResult.detectedMimeType).toBe('application/octet-stream');

      // With filename provided
      const nullWithFile = parseExternalUrl('', 'invoice.pdf');
      expect(nullWithFile.detectedMimeType).toBe('application/pdf');
    });
  });
});
