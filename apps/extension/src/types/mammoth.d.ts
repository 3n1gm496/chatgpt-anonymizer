declare module 'mammoth' {
  interface ConversionResult {
    value: string;
    messages: Array<{ type: string; message: string }>;
  }
  interface ConvertOptions {
    arrayBuffer?: ArrayBuffer;
    buffer?: Buffer;
    path?: string;
  }
  export function extractRawText(
    options: ConvertOptions,
  ): Promise<ConversionResult>;
  export function convertToHtml(
    options: ConvertOptions,
  ): Promise<ConversionResult>;
}
