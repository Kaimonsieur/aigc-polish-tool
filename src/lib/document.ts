import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";
import { Document, Packer, Paragraph, TextRun } from "docx";
import { normalizeText } from "@/lib/text";

export async function extractDocumentText(file: File) {
  const buffer = Buffer.from(await file.arrayBuffer());
  const name = file.name.toLowerCase();
  const type = file.type;

  if (name.endsWith(".docx") || type.includes("wordprocessingml")) {
    const result = await mammoth.extractRawText({ buffer });
    return normalizeText(result.value);
  }

  if (name.endsWith(".pdf") || type === "application/pdf") {
    const parser = new PDFParse({ data: buffer });
    try {
      const result = await parser.getText();
      return normalizeText(result.text);
    } finally {
      await parser.destroy();
    }
  }

  if (name.endsWith(".txt") || type.startsWith("text/")) {
    return normalizeText(buffer.toString("utf8"));
  }

  throw new Error("暂只支持 Word(docx)、PDF 和 TXT 文件");
}

export async function createDocxBuffer(text: string) {
  const paragraphs = normalizeText(text)
    .split(/\n{2,}/)
    .map(
      (paragraph) =>
        new Paragraph({
          children: [new TextRun({ text: paragraph })],
          spacing: { after: 160 },
        }),
    );

  const doc = new Document({
    sections: [
      {
        children: paragraphs.length ? paragraphs : [new Paragraph("")],
      },
    ],
  });

  return Packer.toBuffer(doc);
}
