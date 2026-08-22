import QRCode from "qrcode";

export async function qrPngBuffer(token: string): Promise<Buffer> {
  return QRCode.toBuffer(token, { type: "png", width: 400, margin: 2 });
}
