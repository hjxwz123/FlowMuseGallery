import { BadRequestException, Injectable } from '@nestjs/common';
import JSZip from 'jszip';
import mammoth from 'mammoth';
import pdfParse from 'pdf-parse';
import * as XLSX from 'xlsx';
import { normalizeUploadedFileName } from '../common/utils/upload-filename.util';

export type ParsedChatFile = {
  fileName: string;
  mimeType: string;
  extension: string;
  fileSize: number;
  extractedText: string;
};

const TEXT_EXTENSIONS = new Set(['txt', 'md', 'csv', 'json', 'html', 'htm', 'xml']);
const PARSABLE_EXTENSIONS = new Set([...TEXT_EXTENSIONS, 'pdf', 'docx', 'pptx', 'xlsx']);

function safeFileName(name: string) {
  return normalizeUploadedFileName(name).slice(0, 255) || 'file';
}

function deduceExtension(fileName: string, mimeType: string) {
  const fromName = (() => {
    const parts = fileName.split('.');
    if (parts.length <= 1) return '';
    return parts[parts.length - 1].toLowerCase();
  })();
  if (fromName) return fromName;

  const mime = (mimeType || '').toLowerCase();
  if (mime.includes('pdf')) return 'pdf';
  if (mime.includes('wordprocessingml') || mime.includes('msword')) return 'docx';
  if (mime.includes('presentationml') || mime.includes('powerpoint')) return 'pptx';
  if (mime.includes('spreadsheetml') || mime.includes('excel')) return 'xlsx';
  if (mime.includes('markdown')) return 'md';
  if (mime.includes('csv')) return 'csv';
  if (mime.includes('json')) return 'json';
  if (mime.includes('html')) return 'html';
  if (mime.includes('plain')) return 'txt';
  return '';
}

function decodeHtmlEntities(input: string) {
  return input
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#x([0-9a-fA-F]+);/g, (_all, hex: string) => {
      const code = Number.parseInt(hex, 16);
      if (!Number.isFinite(code)) return '';
      return String.fromCodePoint(code);
    })
    .replace(/&#(\d+);/g, (_all, num: string) => {
      const code = Number.parseInt(num, 10);
      if (!Number.isFinite(code)) return '';
      return String.fromCodePoint(code);
    });
}

function normalizeText(input: string) {
  return input
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\u0000/g, '')
    .replace(/[\t ]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function pptSlideSortKey(name: string) {
  const match = name.match(/slide(\d+)\.xml$/i);
  return match ? Number.parseInt(match[1], 10) : Number.MAX_SAFE_INTEGER;
}

@Injectable()
export class ChatFileParserService {
  getSupportedExtensions() {
    return Array.from(PARSABLE_EXTENSIONS);
  }

  async parse(file: Express.Multer.File, maxExtractChars: number): Promise<ParsedChatFile> {
    if (!file || !file.buffer) {
      throw new BadRequestException('上传文件无效');
    }

    const fileName = safeFileName(file.originalname);
    const mimeType = (file.mimetype || 'application/octet-stream').toLowerCase();
    const extension = deduceExtension(fileName, mimeType);

    if (!PARSABLE_EXTENSIONS.has(extension)) {
      throw new BadRequestException(`暂不支持解析该文件类型：${extension || 'unknown'}`);
    }

    const extracted = await this.parseByExtension(extension, file.buffer);
    const normalized = normalizeText(extracted);

    if (!normalized) {
      throw new BadRequestException(`文件 ${fileName} 解析后为空，请确认文件内容是否可读`);
    }

    const clipped = normalized.slice(0, Math.max(1000, maxExtractChars));

    return {
      fileName,
      mimeType,
      extension,
      fileSize: file.size,
      extractedText: clipped,
    };
  }

  private async parseByExtension(extension: string, buffer: Buffer): Promise<string> {
    if (TEXT_EXTENSIONS.has(extension)) {
      return buffer.toString('utf8');
    }

    if (extension === 'pdf') {
      const parsed = await pdfParse(buffer);
      return parsed.text ?? '';
    }

    if (extension === 'docx') {
      const parsed = await mammoth.extractRawText({ buffer });
      return parsed.value ?? '';
    }

    if (extension === 'xlsx') {
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      const parts: string[] = [];

      for (const sheetName of workbook.SheetNames) {
        const sheet = workbook.Sheets[sheetName];
        if (!sheet) continue;

        parts.push(`# Sheet: ${sheetName}`);
        const rows = XLSX.utils.sheet_to_json<string[]>(sheet, {
          header: 1,
          raw: false,
          defval: '',
          blankrows: false,
        }) as unknown[];

        for (const row of rows) {
          if (!Array.isArray(row)) continue;
          const line = row.map((cell) => String(cell ?? '').trim()).join('\t').trim();
          if (line) parts.push(line);
        }
      }

      return parts.join('\n');
    }

    if (extension === 'pptx') {
      const zip = await JSZip.loadAsync(buffer);
      const slidePaths = Object.keys(zip.files)
        .filter((name) => /^ppt\/slides\/slide\d+\.xml$/i.test(name))
        .sort((a, b) => pptSlideSortKey(a) - pptSlideSortKey(b));

      const parts: string[] = [];
      for (const slidePath of slidePaths) {
        const xml = await zip.file(slidePath)?.async('text');
        if (!xml) continue;

        const text = this.extractTextFromXml(xml);
        if (text) {
          parts.push(`# ${slidePath.split('/').pop()}`);
          parts.push(text);
        }
      }

      return parts.join('\n\n');
    }

    return '';
  }

  private extractTextFromXml(xml: string) {
    const withBreaks = xml
      .replace(/<a:tab\s*\/?>(?:<\/a:tab>)?/gi, '\t')
      .replace(/<a:br\s*\/?>(?:<\/a:br>)?/gi, '\n')
      .replace(/<\/a:p>/gi, '\n')
      .replace(/<\/w:p>/gi, '\n');

    const stripped = withBreaks.replace(/<[^>]+>/g, ' ');
    const decoded = decodeHtmlEntities(stripped);

    return normalizeText(decoded);
  }
}
