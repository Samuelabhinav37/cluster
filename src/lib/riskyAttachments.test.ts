import { describe, expect, it } from "vitest";
import { isRiskyAttachmentFilename, riskyAttachmentGmailQuery } from "./riskyAttachments";

describe("isRiskyAttachmentFilename", () => {
  it("flags each risky extension, case-insensitively", () => {
    expect(isRiskyAttachmentFilename("login.HTML")).toBe(true);
    expect(isRiskyAttachmentFilename("page.htm")).toBe(true);
    expect(isRiskyAttachmentFilename("backup.iso")).toBe(true);
    expect(isRiskyAttachmentFilename("disk.img")).toBe(true);
    expect(isRiskyAttachmentFilename("invoice.docm")).toBe(true);
    expect(isRiskyAttachmentFilename("ledger.xlsm")).toBe(true);
    expect(isRiskyAttachmentFilename("slides.pptm")).toBe(true);
  });

  it("flags a double-extension file hiding a dangerous real extension", () => {
    expect(isRiskyAttachmentFilename("invoice.pdf.exe")).toBe(true);
    expect(isRiskyAttachmentFilename("photo.jpg.scr")).toBe(true);
  });

  it("does not flag ordinary benign attachments", () => {
    expect(isRiskyAttachmentFilename("invoice.pdf")).toBe(false);
    expect(isRiskyAttachmentFilename("photo.jpg")).toBe(false);
    expect(isRiskyAttachmentFilename("report.docx")).toBe(false);
    expect(isRiskyAttachmentFilename("sheet.xlsx")).toBe(false);
    expect(isRiskyAttachmentFilename("")).toBe(false);
  });

  it("does not misfire on a filename with no extension", () => {
    expect(isRiskyAttachmentFilename("README")).toBe(false);
  });
});

describe("riskyAttachmentGmailQuery", () => {
  it("ORs every risky extension as a filename: term", () => {
    const query = riskyAttachmentGmailQuery();
    expect(query).toContain("filename:html");
    expect(query).toContain("filename:iso");
    expect(query).toContain("filename:docm");
    expect(query).toMatch(/^\(.*OR.*\)$/);
  });
});
