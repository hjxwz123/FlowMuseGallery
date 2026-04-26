declare module 'pdf-parse' {
  export interface PdfParseResult {
    numpages: number
    numrender: number
    info?: unknown
    metadata?: unknown
    text: string
    version?: string
  }

  type PdfParse = (dataBuffer: Buffer, options?: unknown) => Promise<PdfParseResult>

  const pdfParse: PdfParse
  export default pdfParse
}
